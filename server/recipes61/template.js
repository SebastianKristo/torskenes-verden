// Prompt 61 (prompt 49 del 1, D1SRV): malisering av oppskrifter. Kode, ingen modell.
//   slotsOf61(text, {facts, today})            → kandidatverdier i meldingen: person (minne/entitetsregister), sted, tidsrom (datoparseren)
//   templateOf61(text, slots, vars)            → «når er neste gang jeg skal til {person}»
//   templatePlan61(calls, slots)               → planen med variabler + hvilke variabler som faktisk brukes
//   fillPlan61(plan, slots)                    → konkret plan for nye verdier, eller {missing:[…]} når noe ikke kan fylles deterministisk
//   sim61(a, b)                                → ordlikhet 0–1 mellom to maler (Dice over ord og ordpar)
//   readable61(calls)                          → planen som lesbar norsk tekst
// Gjenbruker den felles datoparseren (dates.js parsePeriod45/parseTime45), stedsoppdelingen fra vær (placesIn46) og ordgrensesøket (words47).
import { parsePeriod45, todayOslo45 } from '../glimt45/dates.js';
import { placesIn46 } from '../glimt45/weather46.js';
import { hasWord47 } from '../glimt45/words47.js';

export const VARS61 = ['person', 'person.aliases', 'place', 'when'];
const fold = (s) => String(s ?? '').normalize('NFC').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normTxt = (s) => fold(s).replace(/[^\p{L}\p{N}{}.\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
/** Ord-regex for en verdi (hele ord, valgfri kort norsk endelse som i words47). */
const wordRe = (v, flags = 'iu') => new RegExp(`(?<![\\p{L}\\p{N}])${fold(v).trim().split(/\s+/).map(esc).join('[\\s\\-]+')}(?:en|et|a|er|ene|s)?(?![\\p{L}\\p{N}])`, flags);

/**
 * Kandidatverdier i meldingen. facts = recallFacts47 + facts60 (minnet og entitetsregisteret).
 * → {person?:{value, aliases, source}, place?:{value, source}, when?:{value, source}}
 */
export function slotsOf61(text, { facts = [], today = todayOslo45() } = {}) {
  const t = String(text ?? '');
  const out = {};
  for (const f of facts ?? []) {
    const isPerson = f.etype === 'person' || (f.kind === 'alias' && !f.etype) || (f.kind === 'fact' && !f.etype);
    if (!isPerson || !f.subject || String(f.subject).length < 2) continue;
    if (!hasWord47(t, f.subject, { suffix: true })) continue;
    out.person = { value: String(f.subject), aliases: [...new Set([f.kind === 'alias' ? f.object : null, ...(f.aliases ?? [])].filter((x) => x && x !== 'annet').map(String))].slice(0, 6), source: f.etype ? 'entiteter' : 'minne', ...(f.kind === 'alias' && f.object && !f.etype ? { type: String(f.object) } : {}) };
    break;
  }
  try {
    const per = parsePeriod45(t, today, { prefer: 'future' });
    if (per?.raw && per.raw.length >= 2) out.when = { value: per.raw, source: 'datoparser' };
  } catch { /* ingen tid */ }
  try {
    const pl = placesIn46(t).filter((p) => !out.person || fold(p) !== fold(out.person.value));
    if (pl.length === 1) out.place = { value: pl[0], source: 'sted' };
  } catch { /* ingen steder */ }
  for (const f of facts ?? []) {
    if (out.place || f.etype !== 'place' || !f.subject) continue;
    if (hasWord47(t, f.subject, { suffix: false })) out.place = { value: String(f.subject), source: 'entiteter' };
  }
  return out;
}

/** Malen for meldingen: verdiene for variablene vars byttes med {navn}. Små bokstaver, uten tegnsetting. */
export function templateOf61(text, slots = {}, vars = null) {
  let s = fold(text);
  const use = (k) => (vars ? vars.includes(k) || (k === 'person' && vars.includes('person.aliases')) : true);
  // Lengste verdi først («New York» før «York»).
  const order = ['when', 'place', 'person'].filter((k) => slots[k]?.value && use(k)).sort((a, b) => String(slots[b].value).length - String(slots[a].value).length);
  for (const k of order) s = s.replace(wordRe(slots[k].value, 'giu'), ` {${k}} `);
  return normTxt(s);
}

const isStr = (v) => typeof v === 'string';
const sameVal = (a, b) => normTxt(a) === normTxt(b);
/**
 * Planen med variabler. calls = [{tool, args}] (planleggerens kall). → {calls, vars:[…]}
 * Bare verdier som faktisk står i planen blir variabler (et «sted» i teksten som planen ikke bruker, forblir tekst).
 */
export function templatePlan61(calls, slots = {}) {
  const vars = new Set();
  const person = slots.person;
  const aliasSet = new Set((person?.aliases ?? []).map(normTxt));
  const walk = (v) => {
    if (Array.isArray(v)) {
      if (person && v.length && v.every(isStr) && v.some((x) => sameVal(x, person.value)) && v.every((x) => sameVal(x, person.value) || aliasSet.has(normTxt(x)))) { vars.add('person.aliases'); return '{person.aliases}'; }
      return v.map(walk);
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, walk(x)]));
    if (!isStr(v)) return v;
    for (const k of ['when', 'place', 'person']) {
      const sv = slots[k]?.value;
      if (!sv) continue;
      if (sameVal(v, sv)) { vars.add(k); return `{${k}}`; }
    }
    let s = v;
    for (const k of ['when', 'place', 'person']) {
      const sv = slots[k]?.value;
      if (!sv || String(sv).length < 3) continue;
      const re = wordRe(sv, 'giu');
      if (re.test(s)) { s = s.replace(wordRe(sv, 'giu'), `{${k}}`); vars.add(k); }
    }
    return s;
  };
  const out = (calls ?? []).map((c) => ({ tool: c.tool, args: walk(c.args ?? {}) }));
  return { calls: out, vars: [...vars] };
}

/** Variablene som brukes i en mal/plan (tekst eller objekt). */
export function varsIn61(x) {
  const s = typeof x === 'string' ? x : JSON.stringify(x ?? null);
  return [...new Set([...s.matchAll(/\{([a-z]+(?:\.[a-z]+)?)\}/g)].map((m) => m[1]))];
}

/**
 * Konkret plan fra en plan med variabler. slots = slotsOf61 for den nye meldingen.
 * → {calls, missing:[]} – missing ikke tom = kan ikke fylles deterministisk (ingen hurtigvei).
 */
export function fillPlan61(plan, slots = {}) {
  const missing = new Set();
  const val = (k) => {
    if (k === 'person.aliases') return slots.person ? [slots.person.value, ...(slots.person.aliases ?? [])] : (missing.add(k), null);
    const s = slots[k]?.value;
    if (s == null) { missing.add(k); return null; }
    return s;
  };
  const walk = (v) => {
    if (Array.isArray(v)) return v.flatMap((x) => (x === '{person.aliases}' ? (val('person.aliases') ?? []) : [walk(x)]));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    if (!isStr(v)) return v;
    if (v === '{person.aliases}') return val('person.aliases');
    return v.replace(/\{([a-z]+(?:\.[a-z]+)?)\}/g, (m, k) => { if (!VARS61.includes(k)) { missing.add(k); return m; } const x = val(k); return x == null ? m : Array.isArray(x) ? x.join(' ') : String(x); });
  };
  const calls = (plan?.calls ?? []).map((c) => ({ tool: c.tool, args: walk(c.args ?? {}) }));
  return { calls, missing: [...missing] };
}

/** Ordlikhet 0–1 mellom to maler/tekster (Dice over ord + ordpar). Like maler = 1. */
export function sim61(a, b) {
  const A = normTxt(a), B = normTxt(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const grams = (s) => { const w = s.split(' '); const g = [...w]; for (let i = 0; i + 1 < w.length; i++) g.push(`${w[i]}_${w[i + 1]}`); return g; };
  const ga = grams(A), gb = grams(B);
  const cnt = new Map();
  for (const g of gb) cnt.set(g, (cnt.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of ga) { const n = cnt.get(g) ?? 0; if (n > 0) { hit++; cnt.set(g, n - 1); } }
  return Math.round(((2 * hit) / (ga.length + gb.length)) * 1000) / 1000;
}

/* ---------------- Lesbar plan ---------------- */

const q = (v) => (Array.isArray(v) ? v.join(', ') : v === '{person.aliases}' ? '{person} (med aliaser)' : String(v ?? ''));
const terms = (a) => { const t = a.terms ?? a.query; return t === '{person.aliases}' ? '{person} (med aliaser)' : Array.isArray(t) ? t.join(', ') : String(t ?? ''); };
const R = {
  'calendar.search': (a) => `Søk i kalenderen etter ${terms(a)}, ${a.direction === 'past' || a.past ? 'forrige' : 'neste'} avtale`,
  'calendar.next': (a) => `Neste avtale med ${terms(a)}`,
  'calendar.list': (a) => `Vis kalenderen ${q(a.period ?? a.when ?? 'i dag')}`,
  'calendar.create': (a) => `Legg inn «${q(a.title)}»${a.date ? ` ${q(a.date)}` : ''}${a.time ? ` kl. ${q(a.time).replace(/^kl\.?\s*/i, '')}` : ''}${a.location ? `, ${q(a.location)}` : ''}`,
  'calendar.update': (a) => `Flytt/endre «${q(a.target ?? 'avtalen')}»${a.date ? ` til ${q(a.date)}` : ''}${a.time ? ` kl. ${q(a.time).replace(/^kl\.?\s*/i, '')}` : ''}`,
  'calendar.delete': (a) => `Slett «${q(a.target ?? 'avtalen')}» (spør først)`,
  'weather.get': (a) => `Været ${a.place ? `i ${q(a.place)}` : 'der du er'}${a.when ? ` ${q(a.when)}` : ''}`,
  'finance.summary': (a) => `Regn ut forbruket${a.category ? ` på ${q(a.category)}` : ''}${a.period ? ` ${q(a.period)}` : ''}`,
  'finance.search': (a) => `Søk i ${a.kind === 'receipt' ? 'kvitteringer' : 'kjøp'}${a.merchant ? ` hos ${q(a.merchant)}` : ''}${a.item ? ` etter «${q(a.item)}»` : ''}${a.period ? ` ${q(a.period)}` : ''}`,
  'finance.subscriptions': (a) => `Abonnementene (${q(a.mode ?? 'list')})`,
  'finance.fixed': (a) => `Faste utgifter (${q(a.mode ?? 'month')})`,
  'tasks.create': (a) => `Lag gjøremålet «${q(a.title)}»${a.due ? ` ${q(a.due)}` : ''}`,
  'tasks.list': (a) => `Vis gjøremål (${q(a.filter ?? 'open')})`,
  'tasks.complete': (a) => `Kryss av «${q(a.target)}»`,
  'memory.save': (a) => `Husk at ${q(a.subject)} = ${q(a.object)}`,
  'web.search': (a) => `Søk på nettet etter «${q(a.query)}»`,
  'media.episode': (a) => `${a.pick === 'next' ? 'Neste' : 'Siste'} episode av ${q(a.title)}`,
  'nav.open': (a) => `Åpne ${q(a.target)}`,
  'app.answer': (a) => `Svar fra appen (${q(a.topic ?? 'other')})`,
  'chat.answer': () => 'Svar med egen kunnskap (ingen appdata)',
  'subscriptions.cancel': (a) => `Si opp ${q(a.service ?? 'abonnementet')} (spør først)`,
  'subscriptions.trial': (a) => `Avslutt ${q(a.service)} innen ${q(a.date)}`,
};
export function readableSteps61(calls) {
  return (calls ?? []).map((c) => { try { return (R[c.tool] ?? ((a) => `${c.tool}(${Object.entries(a ?? {}).map(([k, v]) => `${k}=${q(v)}`).join(', ')})`))(c.args ?? {}); } catch { return c.tool; } });
}
export const readable61 = (calls) => readableSteps61(calls).join(' · ');

/** Verktøy som bare leser (resten endrer data: opprette, flytte, slette, sende, laste ned, huske, si opp). */
export const READ_TOOLS61 = new Set(['calendar.search', 'calendar.next', 'calendar.list', 'tasks.list', 'finance.search', 'finance.summary', 'finance.subscriptions', 'finance.fixed', 'weather.get', 'web.search', 'chat.answer', 'app.answer', 'nav.open']);
export const writes61 = (calls) => (calls ?? []).some((c) => !READ_TOOLS61.has(c.tool));
