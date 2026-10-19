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
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { eventsFor } from './calendar.js';
import { weatherFull, wmoText, iconOf } from './weather-full.js';
import { newsFor } from './rss.js';
import { packagesFor } from './tracking.js';
import { notifyUser } from './notify.js';
import { run as aiRun } from './ai-run.js';

const MOCK = process.env.MOCK_DATA === '1';
const WX_EMOJI = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', sleet: '🌨️', snow: '❄️', thunder: '⛈️' };
const TITLES = { morning: 'Morgenbrief', day: 'Dagsbrief', evening: 'Kveldsbrief' };
const GREET = { morning: 'God morgen', day: 'Hei', evening: 'God kveld' };
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
/** Neste vindu (06:30, 11:00, 17:00) etter t, som ISO. */
export function nextWindow(t = Date.now()) {
  for (let add = 0; add < 2 * 86400_000; add += 60_000) {
    const p = osloParts(t + add);
    if (add > 0 && WINDOWS.some(([, h, m]) => p.h === h && p.m === m)) return new Date(Math.floor((t + add) / 60_000) * 60_000).toISOString();
  }
  return null;
}

let weatherImpl = null, llmImpl = null;
/** Bare for tester. */
export const _setBriefWeather = (fn) => { weatherImpl = fn; };
export const _setBriefLlm = (fn) => { llmImpl = fn; };

const settingsOf = (u) => ({ notify: true, guide: true, home: true, ...(kv.get(u, 'brief_settings', {}) ?? {}) });
const nameOf = (u) => { try { const r = db.prepare('SELECT name, username FROM users WHERE id=?').get(u); return (r?.name || r?.username || '').split(' ')[0] || null; } catch { return null; } };

async function weatherPart(u, now) {
  const list = kv.get(u, 'wx_places', null);
  const own = Array.isArray(list) && list[0]?.lat != null ? list[0] : null;
  const place = own ? { lat: own.lat, lon: own.lon, name: own.name } : { place: 'oslo' };
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
    place: own?.name ?? w.place?.name ?? 'Oslo', now: { temp: r0(cur.temp), cond: wmoText(cur.code ?? 0), code: cur.code ?? 0, icon, ic: cur.isDay === false && (icon === 'clear' || icon === 'partly') ? '🌙' : WX_EMOJI[icon] ?? '☁️', isDay: cur.isDay !== false },
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
  return newsFor(u, 3).map((x) => ({ id: x.id, title: x.title, url: x.url, source: x.feed ?? null, published: x.published ?? null, timeLabel: x.published ? HM(x.published) : null }));
}

/** Malen (uten LLM). */
export function templateSummary(b) {
  const parts = [`${b.greeting}`];
  const w = b.weather;
  if (w) parts.push(`${w.cond} og ${w.now.temp ?? w.hi}° i ${w.place}${w.rainFrom ? `, regn fra ca. ${w.rainFrom.slice(0, 2).replace(/^0/, '')}` : ''}.`);
  if (b.next) parts.push(`Neste er ${b.next.title} kl. ${b.next.time}${b.next.label.startsWith('I MORGEN') ? ' i morgen' : ''}.`);
  else if (b.events.length) parts.push(`${b.events[0].day} har du ${b.events[0].title}.`);
  else parts.push('Ingen avtaler resten av dagen.');
  if (w?.umbrella) parts.push('Ta med paraply.');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
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
  const k = TITLES[kind] ? kind : kindAt(t);
  const [weather, ev] = await Promise.all([weatherPart(u, now), eventsPart(u, now, t)]);
  const news = newsPart(u);
  let packages = { count: 0, first: null };
  try { const p = packagesFor(3, u); packages = { count: p[0]?.activeCount ?? p.length, first: p[0] ? { title: p[0].title || p[0].name, statusText: p[0].statusText ?? null } : null }; } catch { /* */ }
  const name = nameOf(u);
  const b = { kind: k, title: TITLES[k], kicker: `GLIMT · ${TITLES[k].toUpperCase()}`, greeting: `${GREET[k]}${name ? `, ${name}` : ''}.`, weather, ...ev, news, packages };
  b.chips = [weather ? `${weather.now.temp}° ${lc(weather.cond)}` : null, b.next ? `${b.next.title} ${b.next.time}` : null, news.length ? `${news.length} nyheter` : null].filter(Boolean);
  const cached = kv.get(u, cacheKey(k, now.date), null);
  let summary = cached?.summary ?? null, model = cached?.model ?? null;
  if (!summary && llm) ({ summary, model } = await llmSummary(u, b));
  b.summary = summary || templateSummary(b);
  b.summarySource = summary ? 'glimt' : 'mal';
  b.model = summary ? model : null;
  b.figure = figureOf(b, now.h);
  const gen = cached?.at ?? t;
  b.footer = `Laget av Glimt ${HM(new Date(gen).toISOString())} · Vær: ${weather?.credit ?? '–'} · Nyheter: ${[...new Set(news.map((x) => x.source).filter(Boolean))].join(', ') || '–'}`;
  b.generatedAt = new Date(gen).toISOString();
  b.nextAt = nextWindow(t);
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
const pendingLlm = new Set();
function kickLlm(u, kind) {
  const k = `${u}|${kind}|${osloParts().date}`;
  if (pendingLlm.has(k) || kv.get(u, cacheKey(kind, osloParts().date), null)) return;
  pendingLlm.add(k);
  buildBrief(u, { kind, llm: true }).catch(() => {}).finally(() => pendingLlm.delete(k));
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

let lastRun = null;
export async function runWindow(t = Date.now()) {
  const p = osloParts(t);
  const w = WINDOWS.find(([, h, m]) => p.h === h && p.m === m);
  if (!w) return 0;
  const key = `${p.date}|${w[0]}`;
  if (lastRun === key) return 0;
  lastRun = key;
  let n = 0;
  for (const { id } of db.prepare('SELECT id FROM users').all()) {
    try {
      const b = await buildBrief(id, { kind: w[0], t, llm: true });
      n++;
      if (settingsOf(id).notify) await notifyUser(id, { title: `${b.title} er klar`, body: b.summary.slice(0, 160), url: '/?brief=1', tag: `brief-${w[0]}`, category: 'ai', data: { deepLink: 'finanshub://brief', kind: w[0] } });
    } catch (e) { console.warn('[brief]', id, e.message); }
  }
  return n;
}
if (process.env.NODE_ENV !== 'test') setInterval(() => { runWindow().catch(() => {}); }, 30_000).unref?.();

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', authOrToken);
api.get('/', async (c) => {
  const u = c.get('user'), kind = c.req.query('kind');
  if (kind && !TITLES[kind]) return c.json({ error: 'kind må være morning, day eller evening' }, 400);
  const b = await buildBrief(u, { kind });
  if (b.summarySource === 'mal' || c.req.query('fresh') === '1') { if (c.req.query('fresh') === '1') kv.del(u, cacheKey(b.kind, osloParts().date)); kickLlm(u, b.kind); }
  return c.json(b, 200, { 'Cache-Control': 'no-store' });
});
api.get('/widget', async (c) => {
  const size = ['small', 'medium', 'large', 'lock'].includes(c.req.query('size')) ? c.req.query('size') : 'medium';
  const b = await buildBrief(c.get('user'));
  if (b.summarySource === 'mal') kickLlm(c.get('user'), b.kind);
  return c.json(widgetOf(b, size), 200, { 'Cache-Control': 'no-store' });
});
api.get('/settings', (c) => c.json(settingsOf(c.get('user'))));
api.put('/settings', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ error: 'Forventet {notify?, guide?, home?}' }, 400);
  const cur = settingsOf(c.get('user'));
  for (const k of ['notify', 'guide', 'home']) { if (k in b && typeof b[k] !== 'boolean') return c.json({ error: `${k} må være true eller false` }, 400); if (k in b) cur[k] = b[k]; }
  kv.set(c.get('user'), 'brief_settings', cur);
  return c.json(cur);
});

export default api;
