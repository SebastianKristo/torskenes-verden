// Prompt 32 (SERVER32): Kalender med Glimt – «Beskriv med Glimt» i Ny hendelse og ✦ Spør i søkemenyen.
// Sesjon eller app-token (authOrToken), alt per bruker. Lokal tolking først; lokal modell (Ollama) bare som reserve.
//
// POST /api/kalender/describe {text, today?} → utfylt skjema (ingenting lagres):
//   {ok, engine:'lokal'|'ollama', filled:['tittel','dato','tid','sted','gjentakelse','varsel','kalender'],
//    note:'Fylte ut tittel, dato, tid og sted',  error?:'Fant ikke dato. Velg dato under.'  (ok:false, de andre feltene fylt),
//    event:{title, allDay, date|null, start|null, end|null, endDate:null, location, calendar:'privat'|'familie',
//           repeat:'none'|'daily'|'weekly'|'monthly', reminder:'none'|'15m'|'1h'|'day', reminderMinutes:null|-1|10|15|60|1440, note}}
//   event kan sendes rett til POST /api/kalender/events (eventInput), eventuelt etter at brukeren har rettet feltene.
// GET /api/kalender/search?q=…&ai=1 → {q, ai:true, answer, events, total}
//   answer = {text, kind:'day'|'free'|'tests'|'next'|'last'|'month'|'llm'|'none', engine:'lokal'|'ollama'|'none',
//             items:[hendelse ≤ 6 (samme form som /api/kalender)], free?:[{from:'12:00', to:'14:00'}], from?, to?}
//   events/total = vanlige treff (tittel, sted, notat, fag) fra 30 dager bakover til 120 dager fremover (uten ai=1: gamle /search).
//   Forstår: i dag/i morgen/i overmorgen/ukedag/neste uke/resten av uka · «ledig fredag ettermiddag» · «når er neste prøve» ·
//   «når er neste fysioterapi» · «når hadde jeg tannlege sist» · «alle prøver i november» / «hva skjer i desember».
//   Ellers: spørsmålet + de neste 14 dagene til lokal Ollama (maks to setninger). Ingen sky.
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { eventsFor, matchScore, normText } from './calendar.js';
import { settings as fhSettings } from './finans/db.js';
import { parseQuick, osloTodayISO } from '../public/js/quick-time.js';
import { ollamaContent, ollamaPost, shortBody } from './ollama-opts.js';

const MOCK = process.env.MOCK_DATA === '1';
const LLM_MS = 12_000;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (s) => s.split('-').map(Number);
const addDays = (s, n) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const wdOf = (s) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const diff = (a, b) => { const [y1, m1, d1] = ymd(a), [y2, m2, d2] = ymd(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400_000); };
const dLong = (s) => { const [, m, d] = ymd(s); return `${WD[wdOf(s)]} ${d}. ${MON[m - 1]}`; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const rel = (n) => (n === 0 ? 'i dag' : n === 1 ? 'i morgen' : n === -1 ? 'i går' : n > 0 ? `om ${n} dager` : `${-n} dager siden`);
const HMF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hmOf = (e) => (e.allDay || !e.start ? null : HMF.format(new Date(e.start)));
const endHm = (e) => (e.allDay || !e.end ? null : HMF.format(new Date(e.end)));
const mins = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const hm2 = (x) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
const nowMin = () => mins(HMF.format(new Date()));
const isTest = (e) => e.type === 'prove' || e.type === 'innl';
const noUrl = (s) => String(s ?? '').replace(/https?:\/\/\S+/g, '').trim();

let llmImpl = null;
/** Bare for tester: (prompt, user) → tekst. */
export const _setCalendarGlimtLlm = (fn) => { llmImpl = fn; };
async function ollama(prompt, user, json = false) {
  if (llmImpl) return llmImpl(prompt, user);
  if (MOCK && !process.env.OLLAMA_URL) return null;
  const st = fhSettings(user);
  const base = String(st.ollamaUrl ?? '').replace(/\/$/, '');
  if (!base) return null;
  const r = await ollamaPost((u, i) => fetch(u, i), `${base}/api/generate`,
    shortBody({ model: st.ollamaTextModel || st.ollamaModel, prompt, stream: false, ...(json ? { format: 'json' } : {}), options: { temperature: 0 }, keep_alive: '10m' }, { user }), { signal: AbortSignal.timeout(LLM_MS) });
  if (!r.ok) throw new Error(`Ollama svarte ${r.status}`);
  return ollamaContent(await r.json());
}

/* ---------------- Beskriv med Glimt ---------------- */

const addMin = (hm, n) => hm2(Math.min(23 * 60 + 59, mins(hm) + n));
export function describeExtras(text) {
  const t = String(text ?? '').toLowerCase();
  const repeat = /hver dag|daglig/.test(t) ? 'daily' : /hver uke|ukentlig|hver (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)/.test(t) ? 'weekly' : /hver måned|månedlig/.test(t) ? 'monthly' : null;
  const rm = /dagen før/.test(t) ? 1440 : /(1|en) times? før|times? før/.test(t) ? 60 : /15 min/.test(t) ? 15 : /10 min/.test(t) ? 10 : /ingen varsel|ikke varsle/.test(t) ? -1 : null;
  const calendar = /familie|famil|barna|mamma|pappa/.test(t) ? 'familie' : null;
  return { repeat, reminderMinutes: rm, calendar };
}
const REM = (m) => (m == null ? null : m < 0 ? 'none' : m >= 1440 ? 'day' : m >= 60 ? '1h' : '15m');

/** Tekst → utfylt hendelse. */
export async function describe(user, text, today = osloTodayISO()) {
  const raw = String(text ?? '').trim();
  const pq = parseQuick(raw, today);
  let engine = 'lokal';
  let v = { title: pq.title || '', date: pq.ok ? pq.date : pq.date ?? null, start: pq.start ?? null, end: pq.end ?? null, location: pq.place ?? '', allDay: !!pq.allDay };
  if (!v.date) {
    try {
      const out = await ollama(`Gjør teksten om til en kalenderhendelse. I dag er ${today}. Svar KUN med JSON {"t":"tittel","k":"YYYY-MM-DD","s":"HH:MM eller tom","e":"HH:MM eller tom","all":false,"r":"sted eller tom"}. Tekst: ${raw}`, user, true);
      const m = out && String(out).match(/\{[\s\S]*\}/);
      const j = m ? JSON.parse(m[0]) : null;
      if (j && DATE.test(String(j.k ?? '')) && !Number.isNaN(Date.parse(j.k))) {
        engine = 'ollama';
        v = { title: String(j.t ?? '').trim().slice(0, 200) || v.title, date: j.k, start: HM.test(j.s ?? '') ? j.s : null, end: HM.test(j.e ?? '') ? j.e : null,
          location: String(j.r ?? '').trim().slice(0, 200) || v.location, allDay: j.all === true || !HM.test(j.s ?? '') };
      }
    } catch { /* lokal modell nede: fyll det som ble funnet */ }
  }
  // Adresse etter komma («…, Bogstadveien 12, …») når parseren ikke fant sted.
  if (!v.location) {
    const a = raw.match(/(?:^|,\s*)([A-ZÆØÅ][\wæøåÆØÅ.-]*(?:\s+[\wæøåÆØÅ.-]+){0,3}\s+\d{1,4}[A-Za-z]?)(?=\s*(?:,|$|\.))/);
    if (a && !/^\d/.test(a[1]) && !/\b(kl|klokka)\b/i.test(a[1]) && !/\b(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|i dag|i morgen)\b/i.test(a[1])) {
      v.location = a[1].trim();
      if (v.title.endsWith(v.location)) v.title = v.title.slice(0, -v.location.length).replace(/[,\s]+$/, '');
    }
  }
  if (v.start && !v.end) v.end = addMin(v.start, pq.duration || 60);
  if (!v.start) v.allDay = !!v.date;
  const ex = describeExtras(raw);
  const filled = [];
  if (v.title) filled.push('tittel');
  if (v.date) filled.push('dato');
  if (v.start) filled.push('tid');
  if (v.location) filled.push('sted');
  if (ex.repeat) filled.push('gjentakelse');
  if (ex.reminderMinutes != null) filled.push('varsel');
  if (ex.calendar) filled.push('kalender');
  const event = { title: v.title, allDay: v.allDay, date: v.date, start: v.allDay ? null : v.start, end: v.allDay ? null : v.end, endDate: null, location: v.location,
    calendar: ex.calendar ?? 'privat', repeat: ex.repeat ?? 'none', reminder: REM(ex.reminderMinutes) ?? 'none', reminderMinutes: ex.reminderMinutes, note: raw.length > 60 ? raw.slice(0, 2000) : '' };
  const list = filled.length > 2 ? `${filled.slice(0, -1).join(', ')} og ${filled.at(-1)}` : filled.join(' og ');
  return { ok: !!v.date, engine, event, filled, note: filled.length ? `Fylte ut ${list}` : '', ...(v.date ? {} : { error: 'Fant ikke dato. Velg dato under.' }) };
}

/* ---------------- Spør Glimt i kalenderen ---------------- */

const STOP = new Set(['når', 'er', 'neste', 'min', 'mitt', 'mi', 'mine', 'time', 'timen', 'har', 'hadde', 'jeg', 'skal', 'hva', 'hos', 'den', 'det', 'en', 'et', 'på', 'i', 'meg', 'til', 'sist', 'siste', 'gang', 'forrige', 'var', 'vært', 'alle', 'mine', 'skjer', 'av', 'med', 'om']);
const dayList = (events, d) => events.filter((e) => e.date === d || (e.allDay && e.date <= d && e.end > d));
const sortEv = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (hmOf(a) ?? '00:00') < (hmOf(b) ?? '00:00') ? -1 : 1);
const shortT = (e) => e.subject || e.title;

function monthRange(n, today) {
  const i = MON.findIndex((m) => new RegExp(`\\b${m}\\b`).test(n));
  if (i < 0) return null;
  let [y, m] = ymd(today);
  if (i + 1 < m && !/\b(i fjor|forrige)\b/.test(n) && !/hadde|var\b|sist/.test(n)) y += 1;
  const from = `${y}-${pad(i + 1)}-01`;
  const to = addDays(`${i === 11 ? y + 1 : y}-${pad(i === 11 ? 1 : i + 2)}-01`, -1);
  return { from, to, lbl: `i ${MON[i]}` };
}

/** Lokal forståelse av spørsmålet. → answer eller null (da spørres modellen). */
export function localAnswer(q, events, today = osloTodayISO(), nm = nowMin()) {
  const n = String(q ?? '').toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const out = (text, kind, items = [], extra = {}) => ({ text, kind, engine: 'lokal', items: items.slice(0, 6), ...extra });
  let from = null, to = null, lbl = '';
  if (/i overmorgen/.test(n)) { from = to = addDays(today, 2); lbl = 'i overmorgen'; }
  else if (/i morgen/.test(n)) { from = to = addDays(today, 1); lbl = 'i morgen'; }
  else if (/\bi dag\b|\bidag\b/.test(n)) { from = to = today; lbl = 'i dag'; }
  else if (/neste uke/.test(n)) { const m = addDays(today, 7 - ((wdOf(today) + 6) % 7)); from = m; to = addDays(m, 6); lbl = 'neste uke'; }
  else if (/denne uk|resten av uk/.test(n)) { from = today; to = addDays(today, 6 - ((wdOf(today) + 6) % 7)); lbl = 'resten av uka'; }
  else { const w = WD.findIndex((x) => new RegExp(`\\b${x}`).test(n)); if (w >= 0) { from = to = addDays(today, (w - wdOf(today) + 7) % 7); lbl = WD[w]; } }
  const month = !from ? monthRange(n, today) : null;
  const span = (a, b, all = false) => { const L = []; for (let d = a; d <= b; d = addDays(d, 1)) dayList(events, d).forEach((e) => { if (all || d !== today || !endHm(e) || mins(endHm(e)) > nm) L.push(e); }); return L.sort(sortEv); };

  // Ledig tid (08–20, ettermiddag 12–20, formiddag 08–12, minst 30 min).
  if (/ledig|fri tid|tid til|opptatt/.test(n)) {
    const d = from || today, pm = /ettermiddag|kveld/.test(n), am = /formiddag|morgen\b/.test(n) && !/i morgen/.test(n);
    const A0 = pm ? 720 : 480, B0 = pm || !am ? 1200 : 720;
    const L = dayList(events, d).filter((e) => !e.allDay && hmOf(e) && endHm(e)).map((e) => [mins(hmOf(e)), mins(endHm(e))]).sort((a, b) => a[0] - b[0]);
    let t = A0; if (d === today) t = Math.max(t, Math.ceil(nm / 15) * 15);
    const fr = [];
    for (const [a, b] of L) { if (a > t && Math.min(a, B0) - t >= 30) fr.push([t, Math.min(a, B0)]); t = Math.max(t, b); }
    if (B0 - t >= 30) fr.push([t, B0]);
    const f = fr.filter(([a, b]) => b - a >= 30 && a < B0);
    const day = d === today ? 'I dag' : d === addDays(today, 1) ? 'I morgen' : cap(dLong(d));
    return out(f.length ? `${day} er du ledig ${f.map(([a, b]) => `${hm2(a)}–${hm2(b)}`).join(', ')}.` : `${day} er du opptatt hele ${pm ? 'ettermiddagen' : 'dagen'}.`, 'free',
      dayList(events, d).filter((e) => !e.allDay).sort(sortEv), { free: f.map(([a, b]) => ({ from: hm2(a), to: hm2(b) })), from: d, to: d });
  }
  const wantsTests = /prøve|prøver|eksamen|frist|innlever|oblig/.test(n);
  // Måned: «alle prøver i november», «hva skjer i desember».
  if (month) {
    let L = span(month.from, month.to, true);
    if (wantsTests) L = L.filter(isTest);
    const kw = n.split(' ').filter((w) => w && !STOP.has(w) && !MON.includes(w) && !/^(prøve|prøver|frist|frister|eksamen|ting|hendelser|avtaler|kalender\w*)$/.test(w));
    if (kw.length) L = L.filter((e) => kw.every((w) => normText(`${e.title} ${e.subject ?? ''} ${e.room ?? ''}`).includes(normText(w))));
    const what = wantsTests ? 'prøver og frister' : kw.length ? `«${kw.join(' ')}»` : 'ting i kalenderen';
    if (!L.length) return out(`Du har ingen ${what} ${month.lbl}.`, 'month', [], { from: month.from, to: month.to });
    return out(`${cap(month.lbl)} har du ${L.length} ${what === 'ting i kalenderen' ? (L.length === 1 ? 'ting' : 'ting') : what}. Først ut: ${shortT(L[0])} ${dLong(L[0].date)}${hmOf(L[0]) ? ` kl. ${hmOf(L[0])}` : ''}.`, 'month', L, { from: month.from, to: month.to, count: L.length });
  }
  // Sist: «når hadde jeg tannlege sist», «forrige gang hos frisøren».
  if (/\bsist\b|forrige gang|hadde jeg|var jeg/.test(n)) {
    const kw = n.split(' ').filter((w) => w && !STOP.has(w));
    if (kw.length) {
      const L = events.filter((e) => (e.date < today || (e.date === today && endHm(e) && mins(endHm(e)) <= nm)) && kw.every((w) => matchScore(w, e.title, e.subject ?? '', e.room ?? '', e.note ?? '') > 0)).sort(sortEv).reverse();
      if (!L.length) return out(`Fant ingen tidligere «${kw.join(' ')}» det siste året.`, 'last');
      const e = L[0];
      return out(`${cap(shortT(e))} var sist ${dLong(e.date)}${hmOf(e) ? ` kl. ${hmOf(e)}` : ''} (${rel(diff(today, e.date))}).`, 'last', L);
    }
  }
  if (wantsTests && !from) {
    const L = events.filter((e) => isTest(e) && e.date >= today && e.date <= addDays(today, 120)).sort(sortEv);
    if (!L.length) return out('Ingen prøver eller frister de neste fire månedene.', 'tests');
    const x = L[0];
    return out(`Neste er ${shortT(x)} ${dLong(x.date)} (${rel(diff(today, x.date))})${L.length > 1 ? `. Deretter ${L.length - 1} til.` : '.'}`, 'tests', L);
  }
  if (from) {
    const L = span(from, to);
    if (!L.length) return out(`Du har ingenting i kalenderen ${lbl}.`, 'day', [], { from, to });
    const nT = L.filter((e) => e.type === 'time').length;
    return out(`${cap(lbl)} har du ${L.length} ting${nT ? `, ${nT} av dem i timeplanen` : ''}. Først ut: ${shortT(L[0])}${hmOf(L[0]) ? ` kl. ${hmOf(L[0])}` : ''}.`, 'day', L, { from, to });
  }
  if (/neste|når/.test(n)) {
    const kw = n.split(' ').filter((w) => w && !STOP.has(w));
    if (kw.length) {
      const L = events.filter((e) => (e.date > today || (e.date === today && (!endHm(e) || mins(endHm(e)) > nm))) && e.date <= addDays(today, 120)
        && kw.every((w) => matchScore(w, e.title, e.subject ?? '', e.room ?? '') > 0)).sort(sortEv);
      if (!L.length) return out(`Fant ingen kommende «${kw.join(' ')}» de neste fire månedene.`, 'next');
      const e = L[0];
      return out(`${cap(shortT(e))} er ${dLong(e.date)}${hmOf(e) ? ` kl. ${hmOf(e)}` : ''} (${rel(diff(today, e.date))}).`, 'next', L);
    }
  }
  return null;
}

export async function askCalendar(user, q, today = osloTodayISO()) {
  const { events } = await eventsFor(user, addDays(today, -365), addDays(today, 180));
  const loc = localAnswer(q, events, today);
  if (loc) return loc;
  const ctx = [];
  for (let i = 0; i < 14; i++) { const d = addDays(today, i); dayList(events, d).sort(sortEv).forEach((e) => ctx.push(`${dLong(d)} ${hmOf(e) ? `${hmOf(e)}–${endHm(e)}` : 'hele dagen'} ${e.title}${e.room ? ` (${noUrl(e.room)})` : ''}`)); }
  try {
    const t = await ollama(`Du er Glimt. Svar på norsk i maks to setninger, KUN ut fra kalenderen under. I dag er ${dLong(today)}.\nKalender (neste 14 dager):\n${ctx.join('\n') || '(tom)'}\n\nSpørsmål: ${q}`, user);
    if (t) {
      const parts = String(t).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+/g);
      const text = (parts && parts.length > 2 ? parts.slice(0, 2).join('') : String(t)).trim().slice(0, 400);
      const hit = events.filter((e) => e.date >= today && e.date <= addDays(today, 13) && text.toLowerCase().includes(String(e.title).toLowerCase().slice(0, 12))).sort(sortEv);
      return { text, kind: 'llm', engine: 'ollama', items: hit.slice(0, 6) };
    }
  } catch { /* modellen svarte ikke */ }
  return { text: 'Glimt fant ikke noe svar i kalenderen. Prøv «hva skjer i morgen» eller «når er neste prøve».', kind: 'none', engine: 'none', items: [] };
}

/** Vanlige treff: tittel, sted, notat og fag, fra 30 dager bakover til 120 dager fremover. Kommende først. */
export function plainHits(q, events, today) {
  return events.filter((e) => e.date >= addDays(today, -30) && e.date <= addDays(today, 120)).map((e) => ({ e, s: matchScore(q, e.title, e.room, e.note ?? '', e.subject ?? '') })).filter((x) => x.s > 0)
    .sort((a, b) => ((a.e.date >= today) !== (b.e.date >= today) ? (a.e.date >= today ? -1 : 1) : a.e.date >= today ? sortEv(a.e, b.e) : -sortEv(a.e, b.e)) || b.s - a.s).map((x) => x.e);
}

/* ---------------- Ruter ---------------- */

export const describeApi = new Hono();
describeApi.use('*', (c, next) => authOrToken(c, next));
describeApi.post('/', async (c) => {
  const b = await c.req.json().catch(() => null);
  const text = typeof b?.text === 'string' ? b.text.trim() : '';
  if (!text) return c.json({ error: 'Beskriv hendelsen' }, 400);
  if (text.length > 4000) return c.json({ error: 'Teksten er for lang (maks 4000 tegn)' }, 400);
  const today = typeof b.today === 'string' && DATE.test(b.today) ? b.today : osloTodayISO();
  return c.json(await describe(c.get('user'), text, today));
});

/** Mellomvare foran /api/kalender/search: med ai=1 svarer Glimt, ellers går forespørselen til det gamle søket. */
export async function searchAiMiddleware(c, next) {
  if (c.req.method !== 'GET' || c.req.query('ai') !== '1') return next();
  return authOrToken(c, async () => {
    const q = String(c.req.query('q') ?? '').trim().slice(0, 200);
    if (!q) { c.res = c.json({ q, ai: true, answer: null, events: [], total: 0 }); return; }
    const user = c.get('user'), today = osloTodayISO();
    const answer = await askCalendar(user, q, today);
    const { events } = await eventsFor(user, addDays(today, -30), addDays(today, 120));
    const hits = plainHits(q, events, today);
    c.res = c.json({ q, ai: true, answer, events: hits.slice(0, 100), total: hits.length });
  });
}
