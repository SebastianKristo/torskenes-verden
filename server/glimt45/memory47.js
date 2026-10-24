// Prompt 47 (GLIMT47) Steg B – minnehenting. Bygger på den eksisterende tabellen glimt_memory («Glimt husker», glimt-memory.js),
// med additiv migrering: aliases (JSON), predicate, source, vec (embedding) og embed_model. Eksisterende rader blir
// subject = match («nina»), predicate = «er», object = type («frisør»), aliases = typens synonymer («frisør», «frisørtime», «klipp» …).
//
// Henting per melding (recallFacts47):
//   1. eksakt/fuzzy treff på navnet (hele ord, «Nina», «Ninna») ELLER på et alias («frisør», «frisørtimen») – begge veier, så
//      «Når skal jeg til Nina?» finner fakta Nina = frisør, og «neste frisørtime» finner det samme faktaet,
//   2. embedding-søk (nomic-embed-text via ai-run → ai-gate, ruten «kb») topp 5 over terskel – bare når embedding-modellen
//      faktisk svarer, og bare når 1 ikke ga treff. Ellers bare 1,
//   3. slått sammen, deduplisert, maks 10.
// Hvert fakta har `why` (hvorfor det matchet) – det står i tracen.
// expandTerms47(facts) gir søketermene verktøyene bruker: «Nina» → ["Nina", "frisør", "frisørtime", "klipp", …].
import { db } from '../db.js';
import { listMemory, addMemory, typeOfWord, MEMORY_TYPES } from '../glimt-memory.js';
import { niceCase, normName, aliasTitle } from '../../public/js/quick-time.js';
import { hasWord47, words47, lev47 } from './words47.js';

const q = (sql) => db.prepare(sql);
let migrated = false;
export function ensureMemory47() {
  if (migrated) return;
  try {
    const cols = q('PRAGMA table_info(glimt_memory)').all().map((c) => c.name);
    if (!cols.length) return;
    for (const [c, t] of [['aliases', 'TEXT'], ['predicate', 'TEXT'], ['source', 'TEXT'], ['vec', 'BLOB'], ['embed_model', 'TEXT']]) if (!cols.includes(c)) db.exec(`ALTER TABLE glimt_memory ADD COLUMN ${c} ${t}`);
    migrated = true;
  } catch (e) { console.warn('[glimt47] minne-migrering:', e.message); }
}

/** Synonymer per type (alias-utvidelse). Brukes for eksisterende rader uten egne aliaser. */
export const TYPE_SYNONYMS47 = {
  frisør: ['frisør', 'frisørtime', 'hårklipp', 'klipp', 'klipping', 'barber'],
  tannlege: ['tannlege', 'tannlegetime', 'tannpleier', 'tannklinikk'],
  lege: ['lege', 'legetime', 'fastlege', 'legekontor', 'legesenter'],
  fysio: ['fysio', 'fysioterapeut', 'fysioterapi', 'kiropraktor', 'naprapat'],
  optiker: ['optiker', 'synsprøve'],
  psykolog: ['psykolog', 'terapi', 'terapeut'],
  annet: [],
};
const parseJson = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

/** Alle fakta for brukeren i formen {id, kind, subject, predicate, object, aliases, title, note}. */
export function factsOf47(user) {
  ensureMemory47();
  let rows = [];
  try { rows = q('SELECT * FROM glimt_memory WHERE user_id=? ORDER BY created DESC, id DESC LIMIT 200').all(user); } catch { rows = listMemory(user); }
  return rows.map((r) => {
    const own = parseJson(r.aliases, null);
    const object = r.kind === 'alias' ? (r.type ?? 'annet') : (r.note ?? r.title ?? '');
    const aliases = Array.isArray(own) && own.length ? own.map(String) : r.kind === 'alias' ? TYPE_SYNONYMS47[r.type] ?? [r.type].filter(Boolean) : [];
    return { id: r.id, kind: r.kind, subject: niceCase(r.match), match: r.match, predicate: r.predicate ?? 'er', object, aliases: [...new Set(aliases)], title: r.title ?? null, note: r.note ?? null, vec: r.vec ?? null, embedModel: r.embed_model ?? null };
  });
}

const STOP = new Set(['jeg', 'meg', 'min', 'mitt', 'mine', 'det', 'den', 'som', 'har', 'skal', 'til', 'når', 'neste', 'gang', 'hva', 'hvor', 'hvem', 'er', 'og', 'eller', 'på', 'med', 'for', 'i', 'en', 'et', 'ei', 'av', 'om']);

/* ---------------- Embedding (valgfritt) ---------------- */

let embedImpl = null;
/** Bare for tester: (texts[]) → vectors[] | kast. null = ai-run.embed (nomic-embed-text via gaten). */
export const _setEmbed47 = (fn) => { embedImpl = fn ?? null; embedDownUntil = 0; };
let embedDownUntil = 0;
const EMBED_MS = 2500;
async function embedTexts(user, texts) {
  if (Date.now() < embedDownUntil) return null;
  try {
    const call = embedImpl ? Promise.resolve(embedImpl(texts)).then((v) => ({ vectors: v, model: 'test' }))
      : import('../ai-run.js').then((ai) => ai.embed(texts, { user, title: 'Glimt · minne (embedding)' }));
    const out = await Promise.race([call, new Promise((r) => { const t = setTimeout(() => r(null), EMBED_MS); t.unref?.(); })]);
    // Embedding-modellen svarer ikke, eller gir ikke ekte vektorer (mock gir 3 tall): bare eksakt/fuzzy.
    if (!out?.vectors?.length || !(out.vectors[0]?.length >= 64)) { embedDownUntil = Date.now() + 5 * 60_000; return null; }
    return out;
  } catch { embedDownUntil = Date.now() + 5 * 60_000; return null; }
}
const toBlob = (v) => Buffer.from(new Float32Array(v).buffer);
const fromBlob = (b) => (b ? Array.from(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4))) : null);
const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? s / Math.sqrt(na * nb) : 0; };
const factText = (f) => `${f.subject} ${f.predicate} ${f.object}${f.aliases.length ? ` (${f.aliases.join(', ')})` : ''}`;
export const EMBED_MIN47 = 0.62;

/* ---------------- Henting ---------------- */

/**
 * Relevante fakta for meldingen. → [{id, subject, object, aliases, why, score}] (maks 10)
 * opts.embed:false slår av embedding-steget (f.eks. forhåndsvisning).
 */
export async function recallFacts47(user, text, { embed = true, max = 10 } = {}) {
  const all = factsOf47(user);
  if (!all.length) return [];
  const t = String(text ?? '');
  const tw = words47(t).filter((w) => w.length >= 3 && !STOP.has(w));
  const hits = [];
  for (const f of all) {
    let why = null, score = 0;
    if (!STOP.has(f.match) && hasWord47(t, f.match, { suffix: true })) { why = `navnet «${f.subject}» står i meldingen`; score = 1; }
    else if (!STOP.has(f.match) && f.match.length >= 4 && !f.match.includes(' ') && tw.some((w) => w.length >= 4 && lev47(w, f.match, 1) <= 1)) { why = `ligner navnet «${f.subject}»`; score = 0.9; }
    else {
      const a = [f.kind === 'alias' ? f.object : null, ...f.aliases].filter(Boolean).find((x) => hasWord47(t, x));
      if (a) { why = `aliaset «${a}» står i meldingen`; score = 0.85; }
      else if (f.kind === 'fact') {
        const w = words47(f.object).filter((x) => x.length >= 4 && !STOP.has(x)).find((x) => tw.includes(x));
        if (w) { why = `ordet «${w}» står i faktaet`; score = 0.6; }
      }
    }
    if (why) hits.push({ ...f, why, score });
  }
  if (!hits.length && embed) {
    const e = await embedTexts(user, [t]);
    if (e) {
      // Fakta uten vektor (eller med en annen modell) får vektor nå (best effort, lagres for neste gang).
      const need = all.filter((f) => !f.vec || f.embedModel !== e.model).slice(0, 50);
      if (need.length) {
        const ev = await embedTexts(user, need.map(factText));
        if (ev) need.forEach((f, i) => { if (ev.vectors[i]) { f.vec = toBlob(ev.vectors[i]); f.embedModel = e.model; try { q('UPDATE glimt_memory SET vec=?, embed_model=? WHERE id=? AND user_id=?').run(f.vec, e.model, f.id, user); } catch { /* */ } } });
      }
      const qv = e.vectors[0];
      const scored = all.filter((f) => f.vec && f.embedModel === e.model).map((f) => ({ ...f, score: cos(qv, fromBlob(f.vec)) })).filter((f) => f.score >= EMBED_MIN47).sort((a, b) => b.score - a.score).slice(0, 5);
      for (const f of scored) hits.push({ ...f, why: `embedding-likhet ${f.score.toFixed(2)}` });
    }
  }
  const seen = new Set();
  return hits.sort((a, b) => b.score - a.score).filter((f) => (seen.has(f.id) ? false : seen.add(f.id))).slice(0, max)
    .map(({ vec, embedModel, ...f }) => ({ ...f, score: Math.round(f.score * 100) / 100 }));
}

/** Søketermer fra faktaene: navn + type + aliaser. «Nina» → ["Nina", "frisør", "frisørtime", "klipp", …]. */
export function expandTerms47(facts) {
  const out = [];
  for (const f of facts ?? []) for (const x of [f.subject, f.kind === 'alias' ? f.object : null, ...(f.kind === 'alias' ? f.aliases : [])]) if (x && x !== 'annet' && !out.some((y) => normName(y) === normName(x))) out.push(x);
  return out;
}

/* ---------------- Læring ---------------- */

/**
 * Lagrer et fakta («Nina er frisøren min», «husk at Ola er naboen min»). Gjetninger lagres ikke: subject og object må stå i teksten.
 * → {item, created, kind:'alias'|'fact'} | {error}
 */
export function saveFact47(user, { subject, object, text = '', source = 'glimt' }) {
  ensureMemory47();
  const s = String(subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), o = String(object ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (s.length < 2 || !o) return { error: 'Hva skal jeg huske?' };
  if (text && (!hasWord47(text, s, { suffix: false }) || !words47(o).some((w) => hasWord47(text, w)))) return { error: 'Jeg lagrer bare det du faktisk sa. Si det på nytt, f.eks. «Nina er frisøren min».' };
  const type = typeOfWord(o.split(/\s+/)[0]) ?? typeOfWord(o.replace(/^(?:min|mitt|mi|en|ei|et)\s+/i, '').split(/\s+/)[0]);
  if (type && MEMORY_TYPES.includes(type)) {
    const r = addMemory(user, { kind: 'alias', match: s, type, title: aliasTitle({ type, match: normName(s) }, niceCase(s)) });
    if (r.error) return r;
    try { q('UPDATE glimt_memory SET aliases=?, predicate=?, source=? WHERE id=? AND user_id=?').run(JSON.stringify(TYPE_SYNONYMS47[type] ?? [type]), 'er', source, r.item.id, user); } catch { /* */ }
    return { ...r, kind: 'alias', type };
  }
  const r = addMemory(user, { kind: 'fact', match: s, note: o });
  if (r.error) return r;
  try { q('UPDATE glimt_memory SET predicate=?, source=? WHERE id=? AND user_id=?').run('er', source, r.item.id, user); } catch { /* */ }
  return { ...r, kind: 'fact' };
}
