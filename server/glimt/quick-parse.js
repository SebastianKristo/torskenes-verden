// Glimt: hurtigtolking av kalenderbeskjeder (regel først, så AI via ai/run.js og ai/gate.js, 5 s, think:false) og lærte ord.
//   POST /api/glimt/quickparse52 {text, now?, ai?}            → regel + AI-svar
//   GET/POST /api/glimt/lex52 · DELETE /api/glimt/lex52/:from → lærte ord (rettede navn og steder) per bruker
// Før i srv52.js; montert fra mountGlimtEarly (glimt/index.js).
import { Hono } from 'hono';
import { q, kv } from '../db.js';
import { authOrToken } from '../mobile.js';
import { userInfo, listUsers } from '../auth/session.js';
import { runAsUser } from '../settings.js';
import { parseQuick, osloTodayISO } from '../dates/quick.js'; // dato og tid fra den felles tolkeren
import { dtf } from '../intl-format.js'; // gjenbrukte Intl.DateTimeFormat
import { dlev52 } from './last-visit.js'; // avstand mellom ord (rettede navn og steder)

const DAY = 86_400_000;
const NO_STORE = { 'Cache-Control': 'no-store' };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400) => c.json({ error }, status, NO_STORE);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const hasTable = (t) => !!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const withTimeout = (p, ms, fallback = null) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((res) => { setTimeout(() => res(fallback), ms); })]);
const firstName = (u) => { const x = userInfo(u); return String(x?.displayName || x?.name || x?.username || '').trim().split(/\s+/)[0] || null; };
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const dOf = (ymd) => new Date(`${ymd}T12:00:00Z`);
const addDays = (ymd, n) => new Date(dOf(ymd).getTime() + n * DAY).toISOString().slice(0, 10);
const longDate = (ymd) => { const d = dOf(ymd); return `${WD[d.getUTCDay()]} ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`; };
const osloHm = (t = Date.now()) => dtf('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));

const STOP52 = new Set(['møte', 'mote', 'lunsj', 'middag', 'frokost', 'kaffe', 'kino', 'fest', 'med', 'på', 'hos', 'til', 'i', 'og', 'kl', 'klokka', 'time', 'avtale', 'trening', 'fotball',
  'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag', 'morgen', 'dag', 'kveld', 'neste', 'uke', 'ha', 'skal', 'jeg', 'vi', 'har', 'en', 'et', 'ei', 'den', 'det', 'for',
  'om', 'etter', 'før', 'fra', 'hjemme', 'jobb', 'jobben', 'skole', 'skolen', 'tannlege', 'lege', 'frisør', 'bursdag', 'date', 'tur', 'handle', 'handling', 'møtet']);
const NAMES52 = ['Anna', 'Anne', 'Astrid', 'Emma', 'Emil', 'Eva', 'Hanne', 'Ida', 'Ingrid', 'Jonas', 'Kari', 'Karin', 'Kristian', 'Laila', 'Lars', 'Linn', 'Maja', 'Marius', 'Martin', 'Mia',
  'Nina', 'Nora', 'Ola', 'Ole', 'Per', 'Pål', 'Rune', 'Sara', 'Sebastian', 'Sofie', 'Silje', 'Thomas', 'Tone', 'Tor', 'Tuva', 'Vilde', 'Arild', 'Henrik', 'Jakob', 'Magnus', 'Mari', 'Marte'];
const PLACES52 = ['Olivia', 'Egon', 'Peppes', 'Starbucks', 'Espresso House', 'Kaffebrenneriet', 'Vapiano', 'Burger King', 'Joe & The Juice', 'Steen & Strøm', 'Storo', 'Majorstuen', 'Aker Brygge', 'Grünerløkka', 'Sats', 'Elixia'];
const INTRO52 = /^(?:(?:husk\s+at|minn\s+meg\s+på\s+at)\s+)?(?:(?:jeg|vi)\s+(?:skal|har|må)(?:\s+(?:ha|på|til))?\s+|legg\s+inn\s+|sett\s+opp\s+)/i;
const CAL_WORDS52 = /\b(møte|mote|lunsj|middag|frokost|kaffe|kino|fest|time|avtale|trening|date|konsert|bursdag|tannlege|lege|frisør)\b/i;

const lexOf52 = (u) => (kv.get(u, 'glimt_lex52', []) ?? []).filter((x) => x && x.from && x.to);
/** Ordforrådet: navn (Bursdager, familie, vanlige fornavn, lærte) og steder (kalenderen, kjente, lærte). */
async function vocab52(u, today) {
  const people = new Set(NAMES52), places = new Set(PLACES52);
  try { for (const x of listUsers()) { const n = firstName(x.id); if (n) people.add(n); } } catch { /* */ }
  try { if (hasTable('birthdays')) for (const r of q('SELECT name FROM birthdays WHERE user_id=? LIMIT 400').all(u)) { const n = String(r.name).trim().split(/\s+/)[0]; if (n) people.add(n); } } catch { /* */ }
  try {
    const { eventsFor } = await import('../kalender/events.js');
    const ev = await withTimeout(runAsUser(u, () => eventsFor(u, addDays(today, -120), addDays(today, 30))), 1500, { events: [] });
    for (const e of ev?.events ?? []) { const l = String(e.location || e.room || '').split(',')[0].trim(); if (l && l.length <= 40) places.add(l); }
  } catch { /* kalenderen er valgfri */ }
  const lex = lexOf52(u);
  for (const x of lex) (x.kind === 'place' ? places : people).add(x.to);
  return { people: [...people], places: [...places], lex };
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Retter ett ord mot ordforrådet: ≤ 1 for 4–6 tegn, ≤ 2 for 7+. → {to, kind} | null */
function fixWord52(w, voc) {
  const lw = w.toLowerCase();
  if (lw.length < 4 || STOP52.has(lw) || /\d/.test(lw)) return null;
  const learned = voc.lex.find((x) => x.from.toLowerCase() === lw);
  if (learned) return { to: learned.to, kind: learned.kind ?? 'person' };
  const max = lw.length >= 7 ? 2 : 1;
  let best = null;
  for (const [list, kind] of [[voc.people, 'person'], [voc.places, 'place']]) {
    for (const cand of list) {
      if (cand.includes(' ')) continue;
      const lc = cand.toLowerCase();
      if (lc === lw) return { to: cand, kind, exact: true };
      if (Math.abs(lc.length - lw.length) > max) continue;
      const d = dlev52(lw, lc);
      if (d <= max && (!best || d < best.d)) best = { to: cand, kind, d };
    }
  }
  return best;
}
/** Regelparseren (QCX.pre → QP → QCX.post). */
export async function ruleParse52(u, text, { today = osloTodayISO(), voc = null } = {}) {
  voc ??= await vocab52(u, today);
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const asked = /\?\s*$/.test(t) || /^(?:hva|hvem|hvor|når|hvordan|hvilk\w*|kan du|er det)\b/i.test(t);
  const huske = /^(?:husk|kjøp|ikke glem|noter)\b/i.test(t) && !CAL_WORDS52.test(t);
  t = t.replace(INTRO52, '');
  const fixes = [], people = [];
  t = t.split(' ').map((w) => {
    const m = w.match(/^([\p{L}'-]+)([.,!?]*)$/u);
    if (!m) return w;
    const f = fixWord52(m[1], voc);
    if (!f) return w;
    if (!f.exact) fixes.push({ from: m[1], to: f.to, kind: f.kind });
    if (f.kind === 'person' && !people.includes(f.to)) people.push(f.to);
    return f.to + m[2];
  }).join(' ');
  // Sted: «på/hos X» (også med liten bokstav), men ikke dager og tider.
  let location = null;
  const lm = t.match(/\s(?:på|hos)\s+((?:[\p{L}][\p{L}'&.-]*)(?:\s+(?:&\s+)?[\p{Lu}][\p{L}'&.-]*){0,3})(?=\s+(?:kl\.?|klokka|i\s+dag|i\s+morgen|på\s|neste|om\s|\d)|[.,!?]?$)/u);
  if (lm && !/^(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|dagen|kvelden|morgenen|jobb(?:en)?|skolen|tirsdager)$/i.test(lm[1])) {
    location = cap(lm[1]);
    t = t.replace(lm[0], ' ').replace(/\s+/g, ' ').trim();
  }
  const pq = parseQuick(t, today);
  if (!location && pq.place) location = cap(pq.place);
  let title = cap(String(pq.title || t).replace(location ? new RegExp(`\\s(?:på|hos)\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : /$^/, '').replace(/\s+/g, ' ').trim());
  const type = asked ? 'spørsmål' : huske ? 'huske' : (CAL_WORDS52.test(t) || pq.isAppointment || pq.date || pq.start) ? 'kalender' : 'annet';
  const start = pq.start ?? null;
  const end = pq.end ?? (start ? endOf(start) : null);
  return { type, title, date: pq.date ?? (type === 'kalender' ? today : null), start, end, location, people, allDay: !start && type === 'kalender', fixes };
}
const endOf = (hm) => { const [h, m] = hm.split(':').map(Number); const x = (h * 60 + m + 60) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

export const QUICK_SCHEMA52 = { type: 'object', properties: { type: { type: 'string', enum: ['kalender', 'huske', 'spørsmål', 'annet'] }, title: { type: 'string' }, date: { type: ['string', 'null'] },
  start: { type: ['string', 'null'] }, end: { type: ['string', 'null'] }, location: { type: ['string', 'null'] }, people: { type: 'array', items: { type: 'string' } } }, required: ['type', 'title'] };
let quickAi52 = null; // tester: (prompt, {schema}) → data
export const _setQuickAi52 = (fn) => { quickAi52 = fn; };
export const QUICK_AI_MS52 = { ms: 5000 };
function quickPrompt52(text, { today, now, voc }) {
  const d = dOf(today);
  return [
    'Tolk en kort norsk beskjed til en kalender-/huskeassistent. Svar KUN med JSON etter skjemaet {type,title,date,start,end,location,people[]}.',
    'type: kalender (avtale/hendelse), huske (huskeliste/gjøremål), spørsmål, eller annet. title: kort tittel med stor forbokstav, uten innledning («jeg skal ha») og uten sted.',
    'Rett skrivefeil i navn og steder mot listene under. date: YYYY-MM-DD (mangler dato for kalender → i dag). start/end: HH:MM eller null (start uten slutt → slutt = start + 1 t). location: stedet uten «på/hos».',
    `I dag: ${WD[d.getUTCDay()]} ${today}, klokka ${now}.`,
    `Kjente personer: ${voc.people.slice(0, 80).join(', ')}.`,
    `Tidligere steder: ${voc.places.slice(0, 60).join(', ')}.`,
    `Beskjed: «${text}»`,
  ].join('\n');
}
const YMD = /^\d{4}-\d{2}-\d{2}$/, HMR = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanAi52(x) {
  if (!x || typeof x !== 'object' || typeof x.title !== 'string' || !x.title.trim()) return null;
  const type = ['kalender', 'huske', 'spørsmål', 'annet'].includes(x.type) ? x.type : 'annet';
  return { type, title: cap(clean(x.title, 120)), date: YMD.test(x.date ?? '') ? x.date : null, start: HMR.test(x.start ?? '') ? x.start : null, end: HMR.test(x.end ?? '') ? x.end : null,
    location: x.location ? cap(clean(x.location, 80)) || null : null, people: Array.isArray(x.people) ? x.people.map((p) => cap(clean(p, 40))).filter(Boolean).slice(0, 8) : [] };
}
/** → svaret til POST /api/glimt/quickparse52 */
export async function quickParse52(u, text, { now = Date.now(), ai = true } = {}) {
  const t0 = Date.now();
  const today = osloTodayISO(new Date(now));
  const voc = await vocab52(u, today);
  const rule = await ruleParse52(u, text, { today, voc });
  let aiOut = null, aiMs = null, model = null, timedOut = false, aiError = null;
  if (ai) {
    const ta = Date.now();
    const prompt = quickPrompt52(text, { today, now: osloHm(now), voc });
    const call = quickAi52 ? Promise.resolve().then(() => quickAi52(prompt, { schema: QUICK_SCHEMA52 })).then((data) => ({ data, model: 'test' }))
      : import('../ai/run.js').then(({ run }) => run('glimt', { user: u, prompt, schema: QUICK_SCHEMA52, json: true, think: false, numCtx: 2048, numPredict: 220, temperature: 0,
        timeoutMs: QUICK_AI_MS52.ms, localOnly: true, title: 'Glimt · kalenderbeskjed', noRetry: true })).then((r) => ({ data: r.data ?? (() => { try { return JSON.parse(r.text); } catch { return null; } })(), model: r.model }));
    const TIMEOUT = Symbol('timeout');
    const r = await Promise.race([call.catch((e) => ({ error: e })), new Promise((res) => { setTimeout(() => res(TIMEOUT), QUICK_AI_MS52.ms); })]);
    aiMs = Date.now() - ta;
    if (r === TIMEOUT) { timedOut = true; aiError = `Glimt svarte ikke innen ${Math.round(QUICK_AI_MS52.ms / 1000)} s`; }
    else if (r?.error) aiError = 'Glimt kunne ikke tolke beskjeden akkurat nå';
    else { aiOut = cleanAi52(r?.data); model = r?.model ?? null; if (!aiOut) aiError = 'Glimt ga et ufullstendig svar'; }
  }
  const pick = aiOut ? { ...rule, ...aiOut, date: aiOut.date ?? rule.date ?? (aiOut.type === 'kalender' ? today : null), start: aiOut.start ?? rule.start, end: aiOut.end ?? (aiOut.start ? endOf(aiOut.start) : rule.end),
    location: aiOut.location ?? rule.location, people: aiOut.people.length ? aiOut.people : rule.people } : rule;
  const { fixes, ...result } = pick; void fixes;
  const dl = result.date ? (result.date === today ? 'i dag' : result.date === addDays(today, 1) ? 'i morgen' : longDate(result.date)) : null;
  return { text, rule, ai: aiOut, result: { ...result, date_label: dl, time_label: result.start ? `${result.start}${result.end ? `–${result.end}` : ''}` : null },
    source: aiOut ? 'ai' : 'rule', ai_ms: aiMs, ms: Date.now() - t0, model, timed_out: timedOut, ai_error: aiError };
}
export function learnWord52(u, b) {
  const from = clean(b.from, 40), to = clean(b.to, 60);
  if (!from || !to || from.length < 2) return { error: 'Forventet {from, to}' };
  const kind = b.kind === 'place' ? 'place' : 'person';
  const list = lexOf52(u).filter((x) => x.from.toLowerCase() !== from.toLowerCase());
  const old = lexOf52(u).find((x) => x.from.toLowerCase() === from.toLowerCase());
  list.unshift({ from, to, kind, n: (old?.to === to ? old.n ?? 1 : 0) + 1, at: Date.now() });
  kv.set(u, 'glimt_lex52', list.slice(0, 300));
  return { words: lexOf52(u) };
}

export const quickParseApi = new Hono();
// NB: authOrToken per rute (ikke use('*')): ruteren monteres på /api og skal ikke treffe andre /api-ruter.
const A = authOrToken;

quickParseApi.post('/glimt/quickparse52', A, async (c) => {
  const b = await body(c);
  const text = clean(b.text ?? b.q, 500);
  if (!text) return bad(c, 'Skriv en beskjed');
  const now = b.now && Number.isFinite(Date.parse(b.now)) ? Date.parse(b.now) : Date.now();
  return c.json(await quickParse52(c.get('user'), text, { now, ai: b.ai !== false }), 200, NO_STORE);
});
quickParseApi.get('/glimt/lex52', A, (c) => c.json({ words: lexOf52(c.get('user')) }, 200, NO_STORE));
quickParseApi.post('/glimt/lex52', A, async (c) => {
  const r = learnWord52(c.get('user'), await body(c));
  return r.error ? bad(c, r.error) : c.json({ ok: true, ...r });
});
quickParseApi.delete('/glimt/lex52/:from', A, (c) => {
  const u = c.get('user'), from = decodeURIComponent(c.req.param('from')).toLowerCase();
  kv.set(u, 'glimt_lex52', lexOf52(u).filter((x) => x.from.toLowerCase() !== from));
  return c.json({ ok: true, words: lexOf52(u) });
});

