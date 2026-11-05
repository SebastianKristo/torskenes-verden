// Prompt 73 (BRIEF73): «Innhold i briefen» – hvilke kort Now Brief viser, og i hvilken rekkefølge (claude-code-brief-velg-kort.md,
// fasit Glimt Brief.dc.html → BK0). Lagres per bruker i kv som brief_cards:[{key, on}] (rekkefølgen er lista).
//
//   GET  /api/brief-cards            → {cards:[{key, title, sub, on}], on, total, count:'8 av 11 på', defaults:[{key, on}]}
//   PUT  /api/brief-cards {cards:[{key, on}]}   → samme form (ukjente nøkler gir 400; kort uten tilgang beholdes som de var)
//   POST /api/brief-cards/reset      → standard utvalg og rekkefølge
//
// Kort brukeren ikke har tilgang til (Homelab, Domener, Aksjer, Regninger/Media for barn – srv52.js briefCardsFor52) er ikke med i lista.
// Briefen bygges fra lista: GET /api/brief (brief34.js, oppsummering, guide-runde, widgets) tar bare med kort som er på, og
// GET /api/brief52 gir bare kortene som er på, i lagret rekkefølge (+ order:[key] for hele briefen).
// Lista speiles til brief38_cards (cards38.js), så nordlysvarselet og eldre klienter følger samme valg.
import { Hono } from 'hono';
import { kv } from './db.js';
import { authOrToken } from './mobile.js';
import { CARD_IDS as IDS38, saveCards as saveCards38 } from './cards38.js';

const KEY = 'brief_cards';
/** [key, tittel, kilde, på som standard, id i /api/brief52, id i cards38]. De elleve fra fasiten først, deretter eldre kort (på). */
export const CATALOG73 = [
  ['vaer', 'Vær', 'Nå, i dag og varsel', true, null, 'weather'],
  ['kal', 'Kalender', 'Første avtale og resten av dagen', true, null, 'calendar'],
  ['fokus', 'Dagens fokus', 'Det viktigste i dag, valgt av Glimt', true, 'focus', null],
  ['gjore', 'Huskeliste · 3 viktigste', 'Fra Gjøremål', true, 'todo', 'todos'],
  ['reise', 'Min reise', 'Ruter: neste avgang og når du må gå', true, 'trip', null],
  ['regn', 'Regninger denne uka', 'Fra Finans', true, 'bills', null],
  ['kveld', 'Nytt i kveld', 'Nye episoder og filmer fra Media', true, 'tonight', null],
  ['nyheter', 'Nyheter', 'Sammendrag fra Nyheter', true, null, 'news'],
  ['pakker', 'Pakker', 'Sporing på vei', false, null, 'packages'],
  ['homelab', 'Homelab-status', 'Varsler fra serveren', false, 'homelab', null],
  ['domener', 'Domener og SSL', 'Utløper snart', false, 'domains', null],
  // Kort fra tidligere runder (prompt 37/38/52). De lå i briefen før lista kom, så de er på som standard.
  ['klaer', 'Klær i dag', 'Hva du bør ha på deg, fra Vær', true, 'clothes', null],
  ['abo', 'Prøveperioder', 'Fra Abonnementer', true, null, 'trials'],
  ['bibel', 'Bibelvers', 'Dagens vers', true, null, 'bible'],
  ['familie', 'Familie', 'De som deler posisjon', true, null, 'family'],
  ['skole', 'Skole og jobb', 'Prøver og frister neste 7 dager', true, null, 'school'],
  ['bursdager', 'Bursdager', 'Neste bursdager', true, null, 'birthdays'],
  ['nordlys', 'Nordlys i natt', 'Når Kp er høy nok', true, null, 'aurora'],
  ['aksjer', 'Aksjer', 'Porteføljen fra Finans', false, 'stocks', null],
];
export const KEYS73 = CATALOG73.map((x) => x[0]);
const META = Object.fromEntries(CATALOG73.map(([key, title, sub, def, b52, c38]) => [key, { key, title, sub, def, b52, c38 }]));
export const B52_OF73 = Object.fromEntries(CATALOG73.filter((x) => x[4]).map((x) => [x[0], x[4]]));
export const KEY_OF_B52 = Object.fromEntries(CATALOG73.filter((x) => x[4]).map((x) => [x[4], x[0]]));
export const defaults73 = () => CATALOG73.map(([key, , , def]) => ({ key, on: def }));

/** Lagret liste (alle kjente nøkler, nye kort lagt til nederst, av). Uten lagret liste: standard, med av/på fra prompt 38-valget. */
export function rawCards73(u) {
  const saved = kv.get(u, KEY, null);
  if (!Array.isArray(saved)) {
    const old = kv.get(u, 'brief38_cards', null);
    const off38 = new Set(Array.isArray(old) ? old.filter((x) => x?.on === false).map((x) => x.id) : []);
    return defaults73().map((x) => (META[x.key].c38 && off38.has(META[x.key].c38) ? { ...x, on: false } : x));
  }
  const out = [], seen = new Set();
  for (const x of saved) { if (META[x?.key] && !seen.has(x.key)) { seen.add(x.key); out.push({ key: x.key, on: x.on === true }); } }
  for (const key of KEYS73) if (!seen.has(key)) out.push({ key, on: false }); // nye korttyper: nederst, av
  return out;
}
/** Er kortet på? (uten tilgangssjekk – den gjør /api/brief52 og lista under). */
export const cardOn73 = (u, key) => rawCards73(u).find((x) => x.key === key)?.on === true;
/** Nøklene som er på, i rekkefølge. */
export const onKeys73 = (u) => rawCards73(u).filter((x) => x.on).map((x) => x.key);

/** Nøkler brukeren ikke har tilgang til (fra srv52: Homelab/Domener/Aksjer/Regninger/Nytt i kveld). */
async function blocked73(u) {
  try {
    const { briefCardsFor52 } = await import('./srv52.js');
    const { hidden } = await briefCardsFor52(u);
    return new Set(hidden.filter((h) => h.reason !== 'none').map((h) => KEY_OF_B52[h.id]).filter(Boolean));
  } catch { return new Set(); }
}
/** Lista slik brukeren ser den (uten kort uten tilgang). */
export async function briefCards73(u) {
  const no = await blocked73(u);
  const cards = rawCards73(u).filter((x) => !no.has(x.key)).map((x) => ({ key: x.key, title: META[x.key].title, sub: META[x.key].sub, on: x.on }));
  const on = cards.filter((x) => x.on).length;
  return { cards, on, total: cards.length, count: `${on} av ${cards.length} på`, defaults: defaults73().filter((x) => !no.has(x.key)) };
}

const OSLO_DAY = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
/** Lagrer lista. Kort som ikke er med (ingen tilgang) beholder plass og valg etter de synlige. → {error}|{ok} */
export async function saveBriefCards73(u, list) {
  if (!Array.isArray(list)) return { error: 'cards må være en liste [{key, on}]' };
  const seen = new Set(), next = [];
  for (const x of list) {
    const key = typeof x === 'string' ? x : x?.key ?? x?.id;
    if (!META[key]) return { error: `Ukjent kort ${String(key).slice(0, 40)}` };
    const on = typeof x === 'string' ? true : x.on;
    if (typeof on !== 'boolean') return { error: `cards.${key}.on må være true eller false` };
    if (seen.has(key)) continue;
    seen.add(key); next.push({ key, on });
  }
  for (const x of rawCards73(u)) if (!seen.has(x.key)) next.push(x);
  kv.set(u, KEY, next);
  // Speil til prompt 38-lista (nordlysvarsel, eldre klienter). Middag (bare i 38) beholder sitt valg.
  const old = kv.get(u, 'brief38_cards', null);
  const dinner = Array.isArray(old) ? old.find((x) => x?.id === 'dinner') : null;
  const c38 = next.filter((x) => META[x.key].c38).map((x) => ({ id: META[x.key].c38, on: x.on }));
  if (IDS38.includes('dinner')) c38.push({ id: 'dinner', on: dinner ? dinner.on !== false : true });
  saveCards38(u, c38);
  // Glimts oppsummering for i dag lages på nytt, så den bare nevner kortene som er på.
  const day = OSLO_DAY();
  for (const k of ['morning', 'day', 'evening', 'night']) kv.del(u, `brief_${day}_${k}`);
  return { ok: true };
}

/** Prompt 73: fjerner innholdet i kort som er av fra GET /api/brief (før oppsummering, chips og guide lages). */
export function applyBriefCards73(u, b) {
  const on = new Set(onKeys73(u));
  b.brief_cards = [...on];
  if (!on.has('vaer')) b.weather = null;
  if (!on.has('kal')) { b.events = []; b.next = null; b.tests = []; }
  if (!on.has('nyheter')) b.news = [];
  if (!on.has('pakker')) b.packages = { count: 0, first: null };
  if (!on.has('abo')) b.trials = [];
  if (!on.has('bibel')) b.bible = null;
  return b;
}
/** Guide-runden: bare steg for kort som er på. */
export function guideFilter73(u, steps) {
  const on = new Set(onKeys73(u));
  const T = { weather: 'vaer', weather2: 'vaer', calendar: 'kal', trials: 'abo', news: 'nyheter' };
  return (steps ?? []).filter((s) => !T[s.k] || on.has(T[s.k]));
}

export const brief73Api = new Hono();
const NO_STORE = { 'Cache-Control': 'no-store' };
brief73Api.get('/brief-cards', authOrToken, async (c) => c.json(await briefCards73(c.get('user')), 200, NO_STORE));
brief73Api.put('/brief-cards', authOrToken, async (c) => {
  const b = await c.req.json().catch(() => null);
  const r = await saveBriefCards73(c.get('user'), Array.isArray(b) ? b : b?.cards ?? b?.brief_cards);
  if (r.error) return c.json({ error: r.error }, 400, NO_STORE);
  return c.json(await briefCards73(c.get('user')), 200, NO_STORE);
});
brief73Api.post('/brief-cards/reset', authOrToken, async (c) => {
  const u = c.get('user');
  await saveBriefCards73(u, defaults73());
  return c.json(await briefCards73(u), 200, NO_STORE);
});
