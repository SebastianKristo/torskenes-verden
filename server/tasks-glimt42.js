// Prompt 42 (SERVER42): Glimt i Huskeliste deler opp beskjeden (claude-code-huskeliste-glimt-del-opp.md).
// - Kontrakt: Glimt svarer alltid med en liste {"tasks":[{title, note, due, dueText, place, list, linkTo}], "confidence"} (format:'json' / JSON-schema).
// - ```-gjerder fjernes, ugyldig JSON → ett nytt forsøk med «Svar kun med gyldig JSON» (tasks-glimt41.js), lengdevakt (> 60 tegn / flere verbfraser).
// - Lokal forhåndsdeling (også når AI-en feiler): punktum/linjeskift, «og så», «og husk», «og <verb>», og gjentatt stedsnavn («Strømstad Strømstad»).
// - Den midlertidige oppgaven erstattes med alle tasks[] (jobben lager alle), én Angre: POST /api/tasks/glimt/jobs/:id/undo.
// - Logg per beskjed: input_len, model, tasks_count, parse_ok, path (local|ai) → kv 'huske42_log' (GET /api/tasks/glimt/log).
import { _hooks42, splitLocal41, title41 } from './tasks-glimt41.js';
import { parseTask37 } from './tasks-glimt37.js';
import { kv } from './db.js';

export const TASK_SCHEMA42 = { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, note: { type: ['string', 'null'] }, due: { type: ['string', 'null'] },
  dueText: { type: ['string', 'null'] }, place: { type: ['string', 'null'] }, list: { type: ['string', 'null'] }, linkTo: { type: ['integer', 'null'] } }, required: ['title'] } }, confidence: { type: 'number' } }, required: ['tasks'] };

export function prompt42(text, { lists = [], people = [], today }) {
  const wd = new Date(`${today}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'UTC' });
  return `I dag er ${wd} ${today}. Lister: ${lists.map((l) => l.name).join(', ') || 'Hjem'}. Familie: ${people.join(', ') || '–'}.\n`
    + 'Del beskjeden i separate, konkrete gjøremål. Hvert gjøremål starter med et verb i imperativ («Ta med», «Hent», «Send», «Kjøp»).\n'
    + 'Fjern fyllord og gjentakelser («må huske å», «de må», doble ord som «Strømstad Strømstad», «ha ha»). Begrunnelser («siden vi skal …») blir note, ikke egen oppgave.\n'
    + 'Steder blir place, tidsuttrykk blir due (YYYY-MM-DD) eller dueText. Maks 60 tegn i title. linkTo = indeksen til oppgaven denne hører til. Ikke finn på noe.\n'
    + 'Svar KUN med JSON: {"tasks":[{"title":"…","note":null,"due":null,"dueText":null,"place":null,"list":null,"linkTo":null}],"confidence":0.0}\n'
    + 'Eksempler:\n'
    + '«kjøp melk egg og brød og hent pakken på kiwi i morgen» → {"tasks":[{"title":"Kjøp melk, egg og brød"},{"title":"Hent pakken på Kiwi","dueText":"i morgen"}]}\n'
    + '«husk å ta med pakke som må sendes før vi drar til hytta hytta må vi ta med ved hjem siden vi skal fyre» → {"tasks":[{"title":"Ta med pakken som skal sendes","dueText":"før hytteturen"},{"title":"Ta med ved hjem fra hytta","place":"hytta","note":"Skal fyre"}]}\n'
    + '«ring tannlegen» → {"tasks":[{"title":"Ring tannlegen"}]}\n'
    + `Beskjed: «${String(text).slice(0, 1500)}»`;
}
/** Godtar {tasks:[…]} (ny kontrakt), {items:[…]} (gammel) eller tekst med ```json-gjerder. → {items:[{n, note, date, place, list, after}], _engine} */
export function normalize42(j) {
  if (!j) return j;
  if (typeof j === 'string' || typeof j.text === 'string' && !j.tasks && !j.items) {
    const raw = String(typeof j === 'string' ? j : j.text).replace(/```(?:json)?/gi, '').trim();
    try { j = { ...(typeof j === 'object' ? j : {}), ...JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) }; } catch { return null; }
  }
  if (Array.isArray(j.tasks)) {
    return { ...j, items: j.tasks.filter((t) => t && (t.title || t.n)).map((t) => ({ n: String(t.title ?? t.n).trim(), note: t.note ?? null, date: /^\d{4}-\d{2}-\d{2}$/.test(t.due ?? '') ? t.due : null,
      dueText: t.dueText ?? null, place: t.place ?? null, list: t.list ?? null, after: Number.isInteger(t.linkTo) ? t.linkTo : null })) };
  }
  return j;
}
const VERB = '(?:ta med|hent|send|kjøp|ring|lever|kjør|bestill|betal|vask|rydd|lag|legg|sjekk|skriv|svar|book|fiks|gi|handle|husk|pakk|kast|bær|flytt|ordne|møt|avbestill|kanseller)';
/** Lengdevakt: en tittel over 60 tegn, eller flere verbfraser i én tittel, betyr at AI-en ikke delte opp. */
export function guard42(j) {
  const items = j?.items ?? [];
  if (!items.length) return false;
  return items.every((x) => String(x.n ?? '').length <= 60 && (String(x.n ?? '').toLowerCase().match(new RegExp(`(^|\\s)${VERB}\\s`, 'g')) ?? []).length <= 1);
}

/* ---------------- Lokal forhåndsdeling ---------------- */

const STORES = ['kiwi', 'rema', 'meny', 'coop', 'extra', 'joker', 'ica', 'biltema', 'jula', 'ikea', 'elkjøp', 'power', 'obs', 'posten', 'bunnpris', 'spar', 'xxl', 'plantasjen', 'maxbo', 'byggmakker', 'europris', 'normal', 'apotek'];
const PLACES = ['strømstad', 'toten', 'oslo', 'bergen', 'trondheim', 'stavanger', 'drammen', 'hamar', 'gjøvik', 'lillehammer', 'hafjell', 'geilo', 'trysil', 'sverige', 'hytta', 'hytten', 'byen', 'jobben', 'skolen'];
const cap = (s) => String(s ?? '').replace(/^\s*./, (c) => c.toUpperCase());
const LEADS = /^\s*(?:og\s+)?(?:(?:jeg|vi|du|dere|de)\s+)?(?:må\s+)?(?:huske\s+(?:å|på\s+å)\s+|husk\s+(?:å|på\s+å)\s+|husk\s+)/i;
/** Fjerner fyllord og gjentakelser i ett gjøremål. */
export function clean42(piece) {
  let t = String(piece ?? '').trim().replace(/[.!?]+$/, '');
  t = t.replace(/\b(\p{L}+)\s+\1\b/giu, '$1');                     // «ha ha» → «ha»
  t = t.replace(/\b(\p{L}+)\s+de må\s+\1\s+må\s+/giu, '$1 som skal ');  // «pakke de må pakke må sendes» → «pakke som skal sendes»
  t = t.replace(/\b(?:de|dem)\s+må\s+/giu, '');
  t = t.replace(/\b(\p{L}{3,})\s+må\s+(sendes|hentes|leveres|betales|kjøpes|fikses)\b/giu, '$1 som skal $2');
  t = t.replace(LEADS, '').replace(LEADS, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}
const timeOut = (s) => s.replace(/\s+(?:i morgen|i dag|i kveld|i helga|på (?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag))\b/giu, '').trim();
const storeCase = (s) => s.replace(new RegExp(`\\b(${STORES.join('|')})\\b`, 'giu'), (m) => cap(m.toLowerCase()));
/** «kjøp melk egg og brød» → «Kjøp melk, egg og brød». */
const listCommas = (s) => {
  const m = s.match(/^(kjøp|handle|hent)\s+(.+)$/i);
  if (!m) return s;
  const parts = m[2].split(/\s+og\s+/);
  if (parts.length !== 2) return s;
  const head = parts[0].split(/\s+/);
  if (head.length < 2 || head.length > 5 || /[,]/.test(parts[0]) || head.some((w) => /^(på|til|fra|i|hos|som|med)$/i.test(w))) return s;
  return `${m[1]} ${head.join(', ')} og ${parts[1]}`;
};
/** Del opp før den gamle tolkeren (tasks-glimt41.splitLocal41) får hvert ledd. */
export function presplit42(text) {
  const out = [];
  for (const sent of String(text ?? '').replace(/\r/g, '').split(/(?:[.!?]+\s+)|\n+/).map((s) => s.trim()).filter(Boolean)) {
    // Gjentatt stedsnavn («… til Strømstad Strømstad må …») er en grense.
    const rep = sent.split(new RegExp(`\\b(${PLACES.join('|')})\\s+(?=\\1\\b)`, 'iu'));
    const pieces = [];
    for (let i = 0; i < rep.length; i++) { if (i % 2 === 1) { pieces[pieces.length - 1] = `${pieces[pieces.length - 1]} ${rep[i]}`.trim(); continue; } if (rep[i].trim()) pieces.push(rep[i].trim()); }
    for (const p of pieces) {
      for (const q of p.split(new RegExp(`\\s+og\\s+(?:så\\s+|husk(?:\\s+å)?\\s+|da\\s+)?(?=${VERB}\\b)|\\s+og\\s+så\\s+|\\s+og\\s+husk\\s+(?:å\\s+)?`, 'iu'))) if (q && q.trim()) out.push(q.trim());
    }
  }
  return out;
}
/** Lokal oppdeling for prompt 42. → samme form som splitLocal41: [{n, list, who, date, time, place, after, tags, note, dueText}] */
export function splitLocal42(text, today = new Date().toISOString().slice(0, 10)) {
  const parts = presplit42(text);
  if (parts.length <= 1) {
    const r = splitLocal41(text, today);
    return r.map((x) => ({ ...x, n: storeCase(listCommas(x.n)) }));
  }
  const out = [];
  for (const raw of parts) {
    let p = clean42(raw), place = null, dueText = null;
    const lead = p.match(new RegExp(`^(${PLACES.join('|')})\\s+(?:må\\s+)?(?:vi\\s+|jeg\\s+)?(?:huske\\s+å\\s+|husk\\s+å\\s+)?`, 'iu'));
    if (lead) { place = cap(lead[1].toLowerCase()); p = p.slice(lead[0].length); }
    const before = p.match(/\s+før\s+(?:vi|jeg|du|dere)\s+(?:drar|skal|reiser|kjører)\s+(?:til\s+)?(\p{L}+)\s*$/iu);
    if (before) { dueText = `før ${cap(before[1].toLowerCase())}-turen`; p = p.slice(0, before.index); }
    const why = p.match(/\s+(?:siden|fordi|ettersom)\s+(.+)$/iu);
    let note = null;
    if (why) { note = cap(why[1].replace(/^(?:vi|jeg|du|dere)\s+/i, '').replace(/\s+og\s+da\s+må\s+.*$/i, '').trim()); p = p.slice(0, why.index); }
    const pt = parseTask37(raw, today, { people: [] });
    let n = title41(timeOut(p)).replace(/\s+/g, ' ').trim();
    if (place && !new RegExp(`\\b${place}\\b`, 'i').test(n)) n = `${n} fra ${place}`;
    n = storeCase(listCommas(cap(n))).replace(/\bpakke som skal\b/i, 'pakken som skal');
    if (n.length < 2) continue;
    out.push({ n: n.slice(0, 200), list: null, who: null, date: pt.due ?? null, time: pt.time ?? null, urgent: !!pt.urgent, place, after: null, tags: [], note: [dueText ? `Frist: ${dueText}` : null, note].filter(Boolean).join('. ') || null, dueText });
  }
  for (const x of out) if (x.note && /tilhenger/i.test(x.n)) x.note = x.note.replace(/^Skal ha med/i, 'Trengs til');
  return out.length ? out : splitLocal41(text, today);
}

/* ---------------- Logg ---------------- */

export const log42 = (u, row) => { try { const l = kv.get(u, 'huske42_log', []) ?? []; l.unshift({ at: new Date().toISOString(), ...row }); kv.set(u, 'huske42_log', l.slice(0, 50)); console.info(`[huske-glimt] input_len=${row.input_len} model=${row.model ?? '–'} tasks=${row.tasks_count} parse_ok=${row.parse_ok} path=${row.path}`); } catch { /* */ } };
export const glimtLog42 = (u) => kv.get(u, 'huske42_log', []) ?? [];

Object.assign(_hooks42, { prompt: prompt42, normalize: normalize42, guard: guard42, local: splitLocal42, log: log42 });
