// Prompt 34 (SERVER34): Glimt-brief (morgen / dag / kveld), Hjem-kort, widgets og Glimt-figurens tilstand. Montert under /api/brief.
// Sesjon eller app-token (authOrToken), alt per bruker.
//
// GET /api/brief?kind=morning|day|evening[&fresh=1]
//   → {kind, title:'Morgenbrief'|'Dagsbrief'|'Kveldsbrief', kicker:'GLIMT · KVELDSBRIEF', greeting:'God kveld, Sebastian.',
//      summary:'God kveld, Sebastian. Lettskyet og 8° i Oslo, regn fra ca. 20. Neste er Tannlege kl. 15:15. Ta med paraply.',
//      summarySource:'glimt'|'mal', model:null|'qwen3:8b',
//      weather:{place, now:{temp, cond, code, icon:'clear'|'partly'|…, ic:'⛅', isDay}, hi, lo, cond, umbrella,
//               rain12h:[{h:'20', t:'2026-10-19T20:00', mm, prob}] (12 stk), rainFrom:'20:00'|null,
//               vsYesterday:{diff:-2, text:'2° kaldere enn i går'}|null, sunset:'18:04', source, credit}|null,
//      events:[{id, title, date, time:'15:15'|'Hele dagen', start, end, allDay, color, place, day:'I dag'|'I morgen', deepLink:'kalender://dag/2026-10-19'}] (≤ 3),
//      next:{title, inMin:40, label:'NESTE OM 40 MIN'|'I MORGEN 08:15'}|null,
//      news:[{id, title, url, source:'NRK', published, timeLabel:'20:12'}] (≤ 3),
//      packages:{count, first:{title, statusText}|null}, tests:[{title, date, day}] (prøver neste 7 dager),
//      chips:['8° lettskyet', 'Tannlege 15:15', '3 nyheter'],
//      figure:{state:'idle'|'wave'|'talk'|'point', mood:'sunny'|'rainy'|'busy'|'calm'|'night', guide:[{k:'hello'|'weather'|'calendar'|'news'|'bye', target:null|'weather'|'calendar'|'news', text, action?}]},
//      footer:'Laget av Glimt 20:31 · Vær: MET Norge · Nyheter: NRK, VG', generatedAt, nextAt, deepLink:'finanshub://brief'}
//   Oppsummeringen lages av Glimt (ruten «Glimt · brief» i AI-kontroll) i bakgrunnen og caches til neste vindu (06:30, 11:00, 17:00).
//   Til den er klar (og når modellen ikke svarer) brukes en mal (summarySource:'mal').
// GET /api/brief/widget?size=small|medium|large|lock → {kind, title, kicker, summary (≤ 140 tegn), temp, cond, icon, ic, hi, lo,
//      next:{title, time, label}|null, news:{title, source}|null, chips, figure:{state, mood}, deepLink:'finanshub://brief', generatedAt, refreshAt}
// GET/PUT /api/brief/settings {notify:true (varsel «Morgenbrief er klar»), guide:true (guide-runde første gang), home:true (Hjem-kort)}
// Daglig: kl. 06:30, 11:00 og 17:00 (Oslo) lages briefen for alle brukere, og varselet sendes hvis det er på.
//
// Prompt 35 (SERVER35):
//   kind kan også være night (Nattbrief, «God natt»). Uten kind: night når brukerens nattbrief er på og klokka er etter
//   briefs.night.at (eller før 05), ellers etter tid som før.
//   news[] (≤ 7, første = toppsak): {id, title, url, source, published, timeLabel, image:'/api/img?u=…&s=…'|null, imageUrl, lead, top}
//   trials:[{id, service, logo, endsAt, endsLabel:'tir 21.', daysLeft, daysLabel, priceLabel:'149 kr/mnd', afterLabel, progress (0–1),
//            tone:'red'|'orange'|'ink', color, cancelUrl, deepLink}]  (aktive prøver som slutter innen 7 dager)
//   guide:[{k:'hello'|'weather'|'weather2'|'calendar'|'trials'|'food'|'news'|'bye', char, name, target:null|'weather'|'calendar'|'trials'|'food'|'news',
//           text, textEn, action, actionEn}]  (vert = brukerens figur, «natt» 21–06 når verten er Glimt; vær → sky/drape,
//           kalender → ugle, prøver → gris, mat → spire; friends:false → bare verten og tekster uten vennene)
//   host:'glimt'|'natt'|…, enabled (Glimt-brief på), readAloud, dinner:{title, cook}|null
//   POST /api/brief/trials/:id/done → {ok:true, id} (prøven er avsluttet: status cancelled, påminnelsene stopper)
//   Daglig generering følger brukerens briefer (briefs.{kind}.on/at i /api/glimt/settings), varsel bare hvis notify er på.
//   Med readAloud og en klar stemmemotor forhåndsgenereres lyden for guide-replikkene (cache i /api/tts).
import { Hono } from 'hono';
import { here46, noteHere46 } from './here46.js'; // prompt 46 (SERVER46)
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { eventsFor } from './calendar.js';
import { weatherFull, wmoText, iconOf } from './weather-full.js';
import { newsFor } from './rss.js';
import { packagesFor } from './tracking.js';
import { notifyUser } from './notify.js';
import { run as aiRun } from './ai-run.js';
import { once, inFlight } from './ai-gate.js'; // prompt 43: én LLM-oppsummering per bruker/brief/dato om gangen
import { glimtSettingsOf, cleanGlimtPatch, saveGlimtSettings, hostOf, charName, proxied, engineReady, speak } from './glimt35.js'; // prompt 35
import { trialCompact } from './trial-widgets.js'; // prompt 35: prøveperioder i briefen
import { todosForBrief } from './tasks-glimt37.js'; // prompt 37: Gjøremål-kortet
import { bibleForBrief } from './bible37.js'; // prompt 37: dagens bibelvers (bare med modulen)
import { profileName } from './profiles37.js'; // prompt 37: profilnavnet i hilsenen

const MOCK = process.env.MOCK_DATA === '1';
const WX_EMOJI = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', sleet: '🌨️', snow: '❄️', thunder: '⛈️' };
const TITLES = { morning: 'Morgenbrief', day: 'Dagsbrief', evening: 'Kveldsbrief', night: 'Nattbrief' };
const GREET = { morning: 'God morgen', day: 'Hei', evening: 'God kveld', night: 'God natt' };
const WINDOWS = [['morning', 6, 30], ['day', 11, 0], ['evening', 17, 0]];
const OSLO = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const osloParts = (t = Date.now()) => { const p = Object.fromEntries(OSLO.formatToParts(new Date(t)).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute }; };
// Open-Meteo/MET gir lokal tid uten sone («2026-10-19T18:04»): den brukes som den er. Med sone (Z/+02:00) regnes den om til Oslo.
const HM = (iso) => (!iso ? null : /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?$/.test(String(iso)) ? String(iso).slice(11, 16) : new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const r0 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
const lc = (s) => String(s ?? '').toLowerCase();

/** morning (før 11) / day (11–17) / evening (etter 17), Oslo-tid. */
export const kindAt = (t = Date.now()) => { const { h } = osloParts(t); return h < 11 ? 'morning' : h < 17 ? 'day' : 'evening'; };
/** Prompt 35: som kindAt, men night når brukerens nattbrief er på og klokka er etter briefs.night.at (eller før 05). */
export function kindFor(u, t = Date.now()) {
  const s = glimtSettingsOf(u), { h, m } = osloParts(t), n = s.briefs.night;
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return n.on && (hm >= n.at || h < 5) ? 'night' : kindAt(t);
}
/** Neste vindu (06:30, 11:00, 17:00) etter t, som ISO. */
export function nextWindow(t = Date.now(), u = null) {
  const W = u ? windowsOf(u) : WINDOWS;
  if (!W.length) return null;
  for (let add = 0; add < 2 * 86400_000; add += 60_000) {
    const p = osloParts(t + add);
    if (add > 0 && W.some(([, h, m]) => p.h === h && p.m === m)) return new Date(Math.floor((t + add) / 60_000) * 60_000).toISOString();
  }
  return null;
}
/** Prompt 35: brukerens valgte briefer som [[kind, h, m]] (tom når Glimt-brief er av). */
export function windowsOf(u) {
  const s = glimtSettingsOf(u);
  if (!s.brief) return [];
  return Object.entries(s.briefs).filter(([, v]) => v.on).map(([k, v]) => [k, +v.at.slice(0, 2), +v.at.slice(3, 5)]);
}

let weatherImpl = null, llmImpl = null;
/** Bare for tester. */
export const _setBriefWeather = (fn) => { weatherImpl = fn; };
export const _setBriefLlm = (fn) => { llmImpl = fn; };

// Prompt 35: notify/guide ligger i Glimt-innstillingene (/api/glimt/settings); home bare her. /settings er alias med den gamle formen.
const settingsOf = (u) => { const g = glimtSettingsOf(u), old = kv.get(u, 'brief_settings', {}) ?? {}; return { notify: g.notify, guide: g.guide, home: old.home !== false }; };
const nameOf = (u) => { try { const p = profileName(u); if (p) return p.split(' ')[0]; const r = db.prepare('SELECT name, username FROM users WHERE id=?').get(u); return (r?.name || r?.username || '').split(' ')[0] || null; } catch { return null; } };

async function weatherPart(u, now) {
  const list = kv.get(u, 'wx_places', null);
  // Prompt 46: «Min posisjon» – enhetens posisjon (here46.js) går foran det lagrede stedet og Oslo.
  const here = here46(u);
  const own = here ? { lat: here.lat, lon: here.lon, name: here.name ?? null, here: true } : Array.isArray(list) && list[0]?.lat != null ? list[0] : null;
  const place = own ? { lat: own.lat, lon: own.lon, ...(own.name ? { name: own.name } : {}) } : { place: 'oslo' };
  let w;
  try { w = await (weatherImpl ? weatherImpl(place) : weatherFull(place)); } catch { return null; }
  if (!w) return null;
  const cur = w.current ?? {}, today = w.days?.[0] ?? {};
  const icon = iconOf(cur.code ?? today.code ?? 0);
  const hours = (w.hours ?? []).filter((h) => String(h.t) >= `${now.date}T${String(now.h).padStart(2, '0')}`).slice(0, 12);
  const rain12h = hours.map((h) => ({ h: String(h.t).slice(11, 13), t: h.t, mm: h.precip ?? 0, prob: h.precipProb ?? 0 }));
  const rainAt = hours.find((h) => (h.precip ?? 0) >= 0.2 || (h.precipProb ?? 0) >= 60);
  const yHi = w.yesterday?.hi, tHi = w.today?.hi ?? today.hi;
  const diff = yHi != null && tHi != null ? r0(tHi - yHi) : null;
  return {
    place: own?.name ?? (own?.here ? (w.place?.name && w.place.name !== 'Oslo' ? w.place.name : 'Min posisjon') : null) ?? w.place?.name ?? 'Oslo', here: !!own?.here, now: { temp: r0(cur.temp), cond: wmoText(cur.code ?? 0), code: cur.code ?? 0, icon, ic: cur.isDay === false && (icon === 'clear' || icon === 'partly') ? '🌙' : WX_EMOJI[icon] ?? '☁️', isDay: cur.isDay !== false },
    hi: r0(w.today?.hi ?? today.hi), lo: r0(w.today?.lo ?? today.lo), cond: wmoText(cur.code ?? 0), umbrella: (w.today?.precipProb ?? today.precipProb ?? 0) >= 50 || !!rainAt,
    rain12h, rainFrom: rainAt ? String(rainAt.t).slice(11, 16) : null,
    vsYesterday: diff == null ? null : { diff, text: diff === 0 ? 'Like varmt som i går' : `${Math.abs(diff)}° ${diff < 0 ? 'kaldere' : 'varmere'} enn i går` },
    sunset: HM(w.today?.sunset ?? today.sunset), source: w.source ?? null, credit: w.credit ?? (w.source === 'mock' ? 'Eksempeldata' : 'MET Norge'),
  };
}
async function eventsPart(u, now, t) {
  let events = [];
  try { events = (await eventsFor(u, now.date, addDays(now.date, 1))).events ?? []; } catch { events = []; }
  const up = events.filter((e) => (e.allDay ? e.date >= now.date : Date.parse(e.end ?? e.start) > t)).sort((a, b) => (a.date + (a.allDay ? '0' : HM(a.start))).localeCompare(b.date + (b.allDay ? '0' : HM(b.start))));
  const list = up.slice(0, 3).map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.allDay ? 'Hele dagen' : HM(e.start), start: e.start ?? null, end: e.end ?? null, allDay: !!e.allDay,
    color: e.color ?? null, place: e.room || e.location || null, day: e.date === now.date ? 'I dag' : 'I morgen', deepLink: `kalender://dag/${e.date}` }));
  const n = up.find((e) => !e.allDay && Date.parse(e.start) > t) ?? null;
  let next = null;
  if (n) {
    const inMin = Math.round((Date.parse(n.start) - t) / 60000);
    next = { title: n.title, inMin, time: HM(n.start), label: n.date !== now.date ? `I MORGEN ${HM(n.start)}` : inMin < 60 ? `NESTE OM ${inMin} MIN` : `NESTE KL. ${HM(n.start)}` };
  }
  let tests = [];
  try { tests = ((await eventsFor(u, now.date, addDays(now.date, 7))).events ?? []).filter((e) => e.type === 'prove' || e.type === 'innl').slice(0, 3).map((e) => ({ title: e.title, date: e.date, day: e.date === now.date ? 'I dag' : e.date === addDays(now.date, 1) ? 'I morgen' : e.date })); } catch { tests = []; }
  return { events: list, next, tests };
}
function newsPart(u) {
  // Prompt 35: 7 saker (første = toppsak med stort bilde), bilde via bildeproxyen og ingress.
  return newsFor(u, 7).map((x, i) => ({ id: x.id, title: x.title, url: x.url, source: x.feed ?? null, published: x.published ?? null, timeLabel: x.published ? HM(x.published) : null,
    image: proxied(x.image), imageUrl: x.image ?? null, lead: String(x.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 220) || null, top: i === 0 }));
}
/** Prompt 35: aktive prøveperioder som slutter innen 7 dager. */
export function trialsPart(u, today) {
  let rows = [];
  try { rows = db.prepare("SELECT * FROM trials WHERE user_id=? AND status='active' AND ends_at>=? AND ends_at<=? ORDER BY ends_at, id").all(u, today, addDays(today, 7)); } catch { return []; }
  return rows.map((r) => {
    const t = trialCompact(r, today);
    return { id: t.id, service: t.name, logo: t.logoUrl, endsAt: t.endsAt, endsLabel: t.endLabel.replace(/\s+\S+$/, ''), daysLeft: t.daysLeft, daysLabel: t.daysLabel, priceLabel: t.priceLabel,
      afterLabel: t.afterLabel, price: t.price, progress: t.progress, tone: t.tone, color: t.color, cancelUrl: t.cancelUrl, deepLink: t.deepLink };
  });
}
/** Prompt 35: dagens middag fra Mat (bare lesing). */
function dinnerPart(u, today) {
  try {
    const m = kv.get('owner', 'mat', null); // prompt 36: matplanen er felles for husstanden (HOUSEHOLD = OWNER)
    const p = m?.plan?.[today];
    const d = p?.dish ? (m.dishes ?? []).find((x) => x.id === p.dish) : null;
    return d ? { title: d.name, cook: p.cook ?? null } : null;
  } catch { return null; }
}

/** Malen (uten LLM). */
export function templateSummary(b) {
  const parts = [`${b.greeting}`];
  const w = b.weather;
  if (w) parts.push(`${w.cond} og ${w.now.temp ?? w.hi}° i ${w.place}${w.rainFrom ? `, regn fra ${w.rainFrom.slice(0, 2) === '00' ? 'midnatt' : `ca. ${w.rainFrom.slice(0, 2).replace(/^0/, '')}`}` : ''}.`);
  if (b.next) parts.push(`Neste er ${b.next.title} kl. ${b.next.time}${b.next.label.startsWith('I MORGEN') ? ' i morgen' : ''}.`);
  else if (b.events.length) parts.push(`${b.events[0].day} har du ${b.events[0].title}.`);
  else parts.push('Ingen avtaler resten av dagen.');
  if (w?.umbrella) parts.push('Ta med paraply.');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
const pad2 = (n) => String(n).padStart(2, '0');
const cap1 = (x) => String(x).charAt(0).toUpperCase() + String(x).slice(1);
const WX_EN = { 'klart': 'clear', 'stort sett klart': 'mostly clear', 'delvis skyet': 'partly cloudy', 'skyet': 'cloudy', 'tåke': 'fog', 'lett regn': 'light rain', 'regn': 'rain', 'kraftig regn': 'heavy rain', 'lett snø': 'light snow', 'snø': 'snow', 'regnbyger': 'showers', 'lett yr': 'light drizzle', 'yr': 'drizzle' };
/** Prompt 35: guide-runden med Glimt-familien (fasit: G0/GE i Glimt Brief.dc.html). */
export function guideOf(b, { host = 'glimt', friends = true } = {}) {
  const hostName = ['sky', 'drape', 'ugle', 'stjerne', 'spire', 'gris'].includes(host) ? charName(host) : 'Glimt';
  const w = b.weather, wet = !!w && (w.umbrella || ['rain', 'drizzle', 'sleet', 'snow', 'thunder'].includes(w.now.icon));
  const wch = wet ? 'drape' : 'sky', wn = wet ? 'Dråpe' : 'Sky', wnEn = wet ? 'Drop' : 'Sky';
  const rainSoon = !w ? '' : w.rainFrom ? (w.rainFrom.slice(0, 2) === String(osloParts().h).padStart(2, '0') ? 'regn nå' : `regn fra ca. ${w.rainFrom.slice(0, 2) === '00' ? 'midnatt' : w.rainFrom.slice(0, 2).replace(/^0/, '')}`) : 'oppholdsvær de neste 12 timene';
  const rainEn = !w ? '' : w.rainFrom ? `rain from about ${w.rainFrom.slice(0, 2)}:00` : 'dry for the next 12 hours';
  const n = b.next ?? (b.events[0] && !b.events[0].allDay ? { title: b.events[0].title, time: b.events[0].time, tomorrow: b.events[0].day === 'I morgen' } : null);
  const nTomorrow = n && (n.tomorrow ?? String(n.label ?? '').startsWith('I MORGEN'));
  const T1 = (b.trials ?? [])[0];
  const steps = [];
  const add = (k, char, target, text, textEn, action, actionEn) => steps.push({ k, char, name: charName(char), target, text, textEn, action, actionEn });
  add('hello', host, null, `Hei! Jeg er ${hostName}. Vil du at jeg viser deg dagen din?${friends ? ' Vennene mine hjelper til.' : ''}`, `Hi! I'm ${hostName === 'Glimt' ? 'Glimt' : charName(host)}. Shall I show you your day?${friends ? ' My friends will help.' : ''}`, 'Vis meg', 'Show me');
  if (w) {
    const cond = cap1(lc(w.cond)), en = WX_EN[lc(w.cond)] ?? lc(w.cond);
    add('weather', wch, 'weather', `Hei, det er ${wn}! ${cond}, ${w.now.temp}° nå og ${rainSoon}.${wet ? ' Jeg drypper litt, så ta med paraply!' : ' Søylene viser nedbøren time for time.'}`,
      `Hi, it's ${wnEn}! ${cap1(en)}, ${w.now.temp}° right now, and ${rainEn}.${wet ? " I'm dripping a bit, so bring an umbrella!" : ' The bars show rain hour by hour.'}`, `Takk, ${wn}`, `Thanks, ${wnEn}`);
    if (!wet && w.sunset) add('weather2', 'sky', 'weather', `Sky her igjen: sola går ned ${w.sunset}. Nå tar ${hostName} over!`, `Sky again: the sun sets at ${w.sunset}. Back to ${hostName}!`, 'Neste', 'Next');
  }
  add('calendar', 'ugle', 'calendar', `Uhu, Ugle her med kalenderen. ${n ? `${n.title} ${nTomorrow ? 'i morgen' : 'i dag'} kl. ${n.time}. Trykk på en avtale for å åpne Kalender.` : 'Kalenderen din er helt fri.'}`,
    `Hoo, Owl here with your calendar. ${n ? `${n.title} ${nTomorrow ? 'tomorrow' : 'today'} at ${n.time}. Tap an event to open Calendar.` : 'Your calendar is completely free.'}`, 'Neste', 'Next');
  if (T1 && T1.daysLeft <= 7) {
    const when = T1.daysLeft === 0 ? 'i dag' : T1.daysLeft === 1 ? 'i morgen' : `om ${T1.daysLeft} dager`, whenEn = T1.daysLeft === 0 ? 'today' : T1.daysLeft === 1 ? 'tomorrow' : `in ${T1.daysLeft} days`;
    add('trials', 'gris', 'trials', `Nøff! Gris her. Prøveperioden på ${T1.service} slutter ${when}. Husk å avslutte den før ${T1.endsLabel}${T1.price != null ? `, ellers koster den ${T1.price} kroner i måneden` : ''}.`,
      `Oink! Piggy here. Your ${T1.service} trial ends ${whenEn}. Remember to cancel it${T1.price != null ? `, or it will cost ${T1.price} kroner a month` : ''}.`, 'Takk, Gris', 'Thanks, Piggy');
  }
  if (b.dinner) add('food', 'spire', 'food', `Spire her! Middag i dag er ${b.dinner.title}${b.dinner.cook ? `, og ${b.dinner.cook} lager den` : ''}.`, `Sprout here! Dinner today is ${b.dinner.title}.`, 'Neste', 'Next');
  if (b.news.length) add('news', host, 'news', `${hostName} igjen! Her er de viktigste nyhetene. Trykk for å lese hele.`, `${hostName} again! Here are the top stories. Tap to read more.`, 'Neste', 'Next');
  add('bye', host, null, 'Det var alt for nå. Trykk på meg når du vil ha en ny runde.', "That's all for now. Tap me whenever you want another round.", `Takk, ${hostName}`, `Thanks, ${hostName}`);
  if (friends) return steps;
  // Uten venner: bare verten, og tekstene skrives om uten vennene (fasit: G-mappingen).
  return steps.filter((x) => x.k !== 'weather2' && x.k !== 'food').map((x) => ({ ...x, char: host, name: charName(host),
    text: x.text.replace(/^Hei, det er (Sky|Dråpe)! /, 'Været: ').replace(/ Jeg drypper litt, så ta med paraply!/, ' Ta med paraply!').replace(/^Uhu, Ugle her med kalenderen\. /, 'I kalenderen: ')
      .replace(/^Nøff! Gris her\. /, '').replace(new RegExp(`^${hostName} igjen! `), ''),
    textEn: x.textEn.replace(/^Hi, it's (Sky|Drop)! /, 'The weather: ').replace(/ I'm dripping a bit, so bring an umbrella!/, ' Bring an umbrella!').replace(/^Hoo, Owl here with your calendar\. /, 'In your calendar: ')
      .replace(/^Oink! Piggy here\. /, '').replace(new RegExp(`^${hostName} again! `), ''),
    action: /^Takk, (Sky|Dråpe|Gris)$/.test(x.action) ? 'Neste' : x.action, actionEn: /^Thanks, (Sky|Drop|Piggy)$/.test(x.actionEn) ? 'Next' : x.actionEn }));
}

function figureOf(b, hour) {
  const mood = hour >= 22 || hour < 6 ? 'night' : b.weather?.umbrella ? 'rainy' : b.events.length >= 3 ? 'busy' : b.weather?.now?.icon === 'clear' || b.weather?.now?.icon === 'partly' ? 'sunny' : 'calm';
  const guide = [
    { k: 'hello', target: null, text: `Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din?`, action: 'Vis meg' },
    ...(b.weather ? [{ k: 'weather', target: 'weather', text: `${b.weather.now.temp}° og ${lc(b.weather.cond)} i ${b.weather.place}.${b.weather.rainFrom ? ` Regn fra ca. ${b.weather.rainFrom}.` : ''}${b.weather.vsYesterday ? ` ${b.weather.vsYesterday.text}.` : ''}` }] : []),
    { k: 'calendar', target: 'calendar', text: b.next ? `Neste avtale er ${b.next.title} kl. ${b.next.time}.` : b.events.length ? `${b.events[0].day}: ${b.events[0].title}.` : 'Kalenderen er tom resten av dagen.' },
    ...(b.news.length ? [{ k: 'news', target: 'news', text: `${b.news.length} saker fra nyhetene, først: ${b.news[0].title}` }] : []),
    { k: 'bye', target: null, text: 'Det var alt for nå. Trykk på meg når du vil ha en ny runde.' },
  ];
  return { state: 'wave', mood, guide };
}

const cacheKey = (kind, date) => `brief_${date}_${kind}`;
/** Bygger briefen. llm:true venter på Glimt-oppsummeringen (bakgrunnsjobben); ellers brukes cachet tekst eller malen. */
export async function buildBrief(u, { kind = null, t = Date.now(), llm = false } = {}) {
  const now = osloParts(t);
  const k = TITLES[kind] ? kind : kindFor(u, t);
  const gs = glimtSettingsOf(u);
  const [weather, ev] = await Promise.all([weatherPart(u, now), eventsPart(u, now, t)]);
  const news = newsPart(u);
  let packages = { count: 0, first: null };
  try { const p = packagesFor(3, u); packages = { count: p[0]?.activeCount ?? p.length, first: p[0] ? { title: p[0].title || p[0].name, statusText: p[0].statusText ?? null } : null }; } catch { /* */ }
  const name = nameOf(u);
  const b = { kind: k, title: TITLES[k], kicker: `GLIMT · ${TITLES[k].toUpperCase()}`, greeting: `${GREET[k]}${name ? `, ${name}` : ''}.`, weather, ...ev, news, packages,
    trials: trialsPart(u, now.date), dinner: dinnerPart(u, now.date) };
  // Prompt 37: Vær-kortet åpner Vær (popup over briefen), Gjøremål-kortet og bibelverset (bare med modulen).
  if (b.weather) b.weather.open = { route: 'vaer', overlay: true };
  b.todos = todosForBrief(u) ?? { count: 0, overdue: 0, items: [], text: 'Ingen gjøremål i dag.' };
  b.bible = bibleForBrief(u, k, t);
  b.showKicker = false; // etiketten «GLIMT · KVELDSBRIEF» er fjernet i klientene (kicker beholdes for eldre klienter)
  b.chips = [weather ? `${weather.now.temp}° ${lc(weather.cond)}` : null, b.next ? `${b.next.title} ${b.next.time}` : null, news.length ? `${news.length} nyheter` : null,
    b.trials[0] ? `${b.trials[0].service}-prøve ${b.trials[0].daysLabel}` : null].filter(Boolean);
  const cached = kv.get(u, cacheKey(k, now.date), null);
  let summary = cached?.summary ?? null, model = cached?.model ?? null;
  if (!summary && llm) ({ summary, model } = await llmSummaryOnce(u, b));
  b.summary = summary || templateSummary(b);
  b.summarySource = summary ? 'glimt' : 'mal';
  b.model = summary ? model : null;
  b.figure = figureOf(b, now.h);
  b.host = hostOf(u, t, gs);
  b.guide = guideOf(b, { host: b.host, friends: gs.friends });
  b.enabled = gs.brief;
  b.readAloud = gs.readAloud;
  // Prompt 39: «Glimt i briefen» av → ingen figur, ingen snakkebobler og ingen guide-runde (innholdet og Les opp er uendret).
  b.briefGlimt = gs.briefGlimt !== false;
  b.showFigure = b.briefGlimt;
  if (!b.briefGlimt) { b.figure = { ...b.figure, hidden: true }; b.guide = []; b.autoGuide = false; }
  const gen = cached?.at ?? t;
  b.footer = `Laget av Glimt ${HM(new Date(gen).toISOString())} · Vær: ${weather?.credit ?? '–'} · Nyheter: ${[...new Set(news.map((x) => x.source).filter(Boolean))].join(', ') || '–'}`;
  b.generatedAt = new Date(gen).toISOString();
  b.nextAt = nextWindow(t, u);
  b.deepLink = 'finanshub://brief';
  return b;
}
async function llmSummary(u, b) {
  const facts = { hilsen: b.greeting, vaer: b.weather && { sted: b.weather.place, temp: b.weather.now.temp, hoy: b.weather.hi, lav: b.weather.lo, vaer: b.weather.cond, regnFra: b.weather.rainFrom, paraply: b.weather.umbrella, iGaar: b.weather.vsYesterday?.text },
    neste: b.next && { tittel: b.next.title, kl: b.next.time }, avtaler: b.events.map((e) => `${e.day} ${e.time} ${e.title}`), proever: b.tests.map((x) => `${x.day} ${x.title}`), pakker: b.packages.count };
  const prompt = `Du er Glimt. Skriv en ${b.title.toLowerCase()} på norsk bokmål i 2–3 korte setninger. Start med «${b.greeting}». Bruk bare fakta under, ingen markdown.\nFakta: ${JSON.stringify(facts)}`;
  try {
    const out = llmImpl ? { text: await llmImpl(prompt, u), model: 'test' } : MOCK && !process.env.OLLAMA_URL ? null : await aiRun('brief', { user: u, prompt, temperature: 0.4, numPredict: 140, title: `Glimt · ${b.title.toLowerCase()}`, background: true });
    const text = String(out?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!text) return { summary: null, model: null };
    kv.set(u, cacheKey(b.kind, osloParts().date), { summary: text, model: out.model ?? null, at: Date.now() });
    return { summary: text, model: out.model ?? null };
  } catch (e) { console.warn('[brief]', e.message); return { summary: null, model: null }; }
}
// Prompt 43: single-flight. Briefen kunne startes tre ganger samtidig (runWindow, kickLlm og ?fresh=1), og pendingLlm dekket bare
// kickLlm. Nå går alle tre veiene gjennom once('brief|bruker|kind|dato'): samme nøkkel mens den kjører gir samme promise.
export const briefKey = (u, kind, date = osloParts().date) => `brief|${u}|${kind}|${date}`;
function llmSummaryOnce(u, b) {
  const date = osloParts().date;
  return once(briefKey(u, b.kind, date), async () => {
    const c = kv.get(u, cacheKey(b.kind, date), null); // ferdig i mellomtiden (en annen vei)
    if (c?.summary) return { summary: c.summary, model: c.model ?? null };
    return llmSummary(u, b);
  });
}
/** Starter Glimt-oppsummeringen i bakgrunnen (én om gangen per bruker/brief/dato). → promise | null */
export function kickLlm(u, kind) {
  if (inFlight(briefKey(u, kind)) || kv.get(u, cacheKey(kind, osloParts().date), null)) return null;
  return buildBrief(u, { kind, llm: true }).catch(() => {});
}

/** Kompakt form for widgets (iOS small/medium/large/låseskjerm, Android Glance, Samsung). */
export function widgetOf(b, size = 'medium') {
  const sum = b.summary.length > 140 ? `${b.summary.slice(0, 137).replace(/\s+\S*$/, '')} …` : b.summary;
  return { kind: b.kind, size, title: b.title, kicker: b.kicker.replace('GLIMT · ', '') + ' · GLIMT', summary: size === 'small' || size === 'lock' ? null : sum,
    temp: b.weather?.now.temp ?? null, cond: b.weather?.cond ?? null, icon: b.weather?.now.icon ?? null, ic: b.weather?.now.ic ?? null, hi: b.weather?.hi ?? null, lo: b.weather?.lo ?? null,
    next: b.next ? { title: b.next.title, time: b.next.time, label: b.next.label } : b.events[0] ? { title: b.events[0].title, time: b.events[0].time, label: b.events[0].day.toUpperCase() } : null,
    news: b.news[0] ? { title: b.news[0].title, source: b.news[0].source } : null, chips: b.chips, figure: { state: b.figure.state, mood: b.figure.mood },
    deepLink: 'finanshub://brief', generatedAt: b.generatedAt, refreshAt: b.nextAt };
}

/* ---------------- Daglig generering ---------------- */

const lastRun = new Map(); // bruker → 'dato|kind'
/** Prompt 35: lager (og varsler) briefene brukerne har valgt for dette minuttet. → antall bygget */
export async function runWindow(t = Date.now()) {
  const p = osloParts(t);
  let n = 0;
  for (const { id } of db.prepare('SELECT id FROM users').all()) {
    const w = windowsOf(id).find(([, h, m]) => p.h === h && p.m === m);
    if (!w) continue;
    const key = `${p.date}|${w[0]}`;
    if (lastRun.get(id) === key) continue;
    lastRun.set(id, key);
    try {
      const b = await buildBrief(id, { kind: w[0], t, llm: true });
      n++;
      const gs = glimtSettingsOf(id);
      if (gs.notify) await notifyUser(id, { title: `${b.title} er klar`, body: b.summary.slice(0, 160), url: '/?brief=1', tag: `brief-${w[0]}`, category: 'ai', data: { deepLink: 'finanshub://brief', kind: w[0] } });
      if (gs.readAloud && engineReady(gs.tts.engine) && gs.tts.engine !== 'browser') pregenerate(id, b).catch(() => {});
    } catch (e) { console.warn('[brief]', id, e.message); }
  }
  return n;
}
/** Forhåndsgenererer lyden for guide-replikkene (cache i /api/tts), så avspillingen starter med en gang. */
export async function pregenerate(u, b) {
  const lang = glimtSettingsOf(u).tts.lang;
  let n = 0;
  for (const g of b.guide ?? []) { try { await speak(u, { text: lang === 'en' ? g.textEn : g.text, character: g.char }); n++; } catch { break; } }
  return n;
}
if (process.env.NODE_ENV !== 'test') setInterval(() => { runWindow().catch(() => {}); }, 30_000).unref?.();

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', authOrToken);
api.get('/', async (c) => {
  noteHere46(c); // prompt 46: ?lat=&lon=[&name=] fra «Min posisjon»
  const u = c.get('user'), kind = c.req.query('kind');
  if (kind && !TITLES[kind]) return c.json({ error: 'kind må være morning, day, evening eller night' }, 400);
  const b = await buildBrief(u, { kind });
  // Prompt 43: fresh=1 starter ikke en ny oppsummering mens en kjører (den som kjører, gir den nye teksten).
  if (b.summarySource === 'mal' || c.req.query('fresh') === '1') { if (c.req.query('fresh') === '1' && !inFlight(briefKey(u, b.kind))) kv.del(u, cacheKey(b.kind, osloParts().date)); kickLlm(u, b.kind); }
  return c.json(b, 200, { 'Cache-Control': 'no-store' });
});
api.get('/widget', async (c) => {
  noteHere46(c);
  const size = ['small', 'medium', 'large', 'lock'].includes(c.req.query('size')) ? c.req.query('size') : 'medium';
  const b = await buildBrief(c.get('user'));
  if (b.summarySource === 'mal') kickLlm(c.get('user'), b.kind);
  return c.json(widgetOf(b, size), 200, { 'Cache-Control': 'no-store' });
});
api.get('/settings', (c) => c.json(settingsOf(c.get('user'))));
// Alias (prompt 35): notify/guide lagres i Glimt-innstillingene, home her. Hele formen er GET/PUT /api/glimt/settings.
api.put('/settings', async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ error: 'Forventet {notify?, guide?, home?}' }, 400);
  for (const k of ['notify', 'guide', 'home']) if (k in b && typeof b[k] !== 'boolean') return c.json({ error: `${k} må være true eller false` }, 400);
  const { home, ...rest } = b;
  if (Object.keys(rest).length) {
    const { next, errors } = cleanGlimtPatch(rest, glimtSettingsOf(u));
    if (errors.length) return c.json({ error: errors[0], errors }, 400);
    saveGlimtSettings(u, next);
  }
  if (home !== undefined) kv.set(u, 'brief_settings', { ...(kv.get(u, 'brief_settings', {}) ?? {}), home });
  return c.json(settingsOf(u));
});
// Prompt 35: «✓ Jeg har avsluttet Viaplay» i prøve-kortet.
api.post('/trials/:id{[0-9]+}/done', (c) => {
  const u = c.get('user'), id = +c.req.param('id');
  const r = db.prepare("UPDATE trials SET status='cancelled', updated=? WHERE id=? AND user_id=?").run(Date.now(), id, u);
  if (!r.changes) return c.json({ error: 'Fant ikke prøven' }, 404);
  return c.json({ ok: true, id });
});

export default api;
