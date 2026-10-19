// ✦ AI-søk i transaksjoner, kvitteringer og varelinjer.
// 1) Hybrid gjenfinning: BM25 (SQLite FTS5) + valgfri vektor-likhet (embeddings fra Ollama eller Gemini), slått sammen med RRF.
// 2) Svar: språkmodellen får treffene og ferdig utregnede summer, og må vise til treffene. Tall i svaret som ikke finnes
//    i grunnlaget gjør at svaret forkastes og det regelbaserte sammendraget brukes i stedet – modellen får ikke finne på tall.
import { db, settings, secret, me, addUserCol } from './db.js';
import { geminiFetch, hasGemini } from './gemini-keys.js';
import { textJson, aiTimeoutsOf, AiCancelled, OLLAMA_KEEP_ALIVE } from './ai.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fh_fts USING fts5(kind UNINDEXED, ref UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS fh_embed (kind TEXT NOT NULL, ref TEXT NOT NULL, model TEXT NOT NULL, hash TEXT NOT NULL, vec BLOB NOT NULL, PRIMARY KEY (kind, ref, model));`);
// ISO2: søket er per bruker. Indeksen (avledet data, bygges på nytt fra tabellene) har brukeren i en egen kolonne, og
// embeddings merkes med eieren. Den gamle fh_fts-indeksen brukes ikke lenger (den slettes ikke).
db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS fh_fts2 USING fts5(kind UNINDEXED, ref UNINDEXED, uid UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2')");
addUserCol('fh_embed', `(SELECT user_id FROM fh_transactions t WHERE fh_embed.kind='tx' AND t.id=CAST(fh_embed.ref AS INTEGER)
  UNION ALL SELECT user_id FROM fh_receipts r WHERE fh_embed.kind<>'tx' AND r.id=fh_embed.ref LIMIT 1)`);

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const STOP = new Set(('hvor mye mange brukte brukt bruker jeg meg min mitt mine på i til av for fra med og eller hva hvilke hvilken hvilket når har hadde ' +
  'var er det den de en et som om totalt sum summen kostet koste koster betalte betalt betale vis finn alle siste forrige denne dette i år året måned måneden ' +
  'kr kroner nok kjøp kjøpte kjøpt handlet handel utgifter utgift penger').split(' '));

/* ---------------- Indeks ---------------- */

let builtSig = null;
function signature() {
  return q(`SELECT (SELECT count(*)||':'||ifnull(max(id),0)||':'||ifnull(sum(length(ai_long)),0)||':'||ifnull(sum(category_id),0) FROM fh_transactions)||'|'||
    (SELECT count(*)||':'||ifnull(max(created),0)||':'||ifnull(sum(length(extraction)),0) FROM fh_receipts)`).pluck().get();
}
function docs() {
  const out = [];
  const tx = q(`SELECT t.id, t.user_id, t.date, t.amount, t.description, t.merchant, t.note, t.ai_short, t.ai_long, c.name AS category, a.name AS account
    FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id LEFT JOIN fh_accounts a ON a.id=t.account_id WHERE t.user_id IS NOT NULL`).all();
  for (const t of tx) out.push(['tx', String(t.id), t.user_id, [t.description, t.merchant !== t.description ? t.merchant : '', t.category, t.account, t.note, t.ai_short, t.ai_long].filter(Boolean).join(' · ')]);
  // ISO2: hver kvittering tilhører brukeren som eier den (user_id), og søkes bare i av den brukeren.
  for (const r of q("SELECT id, user_id, merchant, date, total, extraction, ai_short, ai_long FROM fh_receipts WHERE status NOT IN ('rejected') AND user_id IS NOT NULL").all()) {
    let lines = [];
    try { lines = JSON.parse(r.extraction ?? 'null')?.lines ?? []; } catch { /* ugyldig */ }
    out.push(['rc', r.id, r.user_id, [r.merchant, r.ai_short, r.ai_long, lines.map((l) => l.description).join(', ')].filter(Boolean).join(' · ')]);
    lines.forEach((l, i) => l.description && out.push(['line', `${r.id}:${i}`, r.user_id, `${l.description} · ${r.merchant ?? ''}`]));
  }
  return out;
}
export function ensureIndex() {
  const sig = signature();
  if (sig === builtSig) return;
  const ins = q('INSERT INTO fh_fts2(kind, ref, uid, text) VALUES(?,?,?,?)');
  db.transaction(() => { q('DELETE FROM fh_fts2').run(); for (const d of docs()) ins.run(...d); })();
  builtSig = sig;
  embedLater();
}

/* ---------------- Embeddings (valgfritt) ---------------- */

const embedModel = () => {
  const st = settings();
  // En valgt Ollama-embeddingmodell slår på vektorsøket; Gemini-embeddings krever bryteren.
  if (st.embedModel) return { kind: 'ollama', model: st.embedModel };
  if (!st.aiSearchEmbed) return null;
  // text-embedding-004 ble slått av hos Google i januar 2026; gemini-embedding-001 er etterfølgeren (768 dimensjoner holder lagringen liten).
  if (hasGemini()) return { kind: 'gemini', model: 'gemini-embedding-001' };
  return null;
};
// Prompt 25: grensen for embeddings er motorens grense fra Innstillinger → AI → Tidsgrenser (ikke fast 30 s), lest ved hvert kall.
const embedSignal = (kind, signal) => { const t = AbortSignal.timeout(aiTimeoutsOf()[kind] * 1000); return signal ? AbortSignal.any([t, signal]) : t; };
async function embed(texts, m, signal = null) {
  if (m.kind === 'ollama') {
    const res = await fetch(`${settings().ollamaUrl.replace(/\/$/, '')}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: embedSignal('ollama', signal), body: JSON.stringify({ model: m.model, input: texts, keep_alive: OLLAMA_KEEP_ALIVE }) });
    if (!res.ok) throw new Error(`Ollama embed ${res.status}`);
    return (await res.json()).embeddings;
  }
  const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.model}:batchEmbedContents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: embedSignal('gemini', signal),
    body: JSON.stringify({ requests: texts.map((t) => ({ model: `models/${m.model}`, content: { parts: [{ text: t }] }, outputDimensionality: 768 })) }),
  });
  if (!res.ok) throw new Error(`Gemini embed ${res.status}`);
  return (await res.json()).embeddings.map((e) => e.values);
}
const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const toBlob = (v) => Buffer.from(new Float32Array(v).buffer);
const fromBlob = (b) => new Float32Array(b.buffer, b.byteOffset, b.length / 4);
let embedding = false;
function embedLater() {
  const m = embedModel();
  if (!m || embedding) return;
  embedding = true;
  setTimeout(async () => {
    try {
      const have = new Map(q('SELECT kind||\'/\'||ref k, hash FROM fh_embed WHERE model=?').all(m.model).map((r) => [r.k, r.hash]));
      const todo = q("SELECT kind, ref, uid, text FROM fh_fts2 WHERE kind<>'line'").all().filter((d) => have.get(`${d.kind}/${d.ref}`) !== hashOf(d.text)).slice(0, 400);
      const put = q('INSERT OR REPLACE INTO fh_embed(kind, ref, model, hash, vec, user_id) VALUES(?,?,?,?,?,?)');
      for (let i = 0; i < todo.length; i += 32) {
        const part = todo.slice(i, i + 32), vecs = await embed(part.map((d) => d.text), m);
        db.transaction(() => part.forEach((d, j) => vecs[j] && put.run(d.kind, d.ref, m.model, hashOf(d.text), toBlob(vecs[j]), d.uid)))();
      }
    } catch (e) { console.warn('[finans] embeddings:', e.message); }
    embedding = false;
  }, 500).unref?.();
}
async function vectorHits(text, limit = 30, signal = null) {
  const m = embedModel();
  if (!m) return [];
  try {
    const [qv] = await embed([text], m, signal);
    const qn = Math.hypot(...qv);
    return q('SELECT kind, ref, vec FROM fh_embed WHERE model=? AND user_id=?').all(m.model, me()).map((r) => {
      const v = fromBlob(r.vec); let dot = 0, n = 0;
      for (let i = 0; i < v.length; i++) { dot += v[i] * qv[i]; n += v[i] * v[i]; }
      return { kind: r.kind, ref: r.ref, score: dot / (Math.sqrt(n) * qn || 1) };
    }).filter((r) => r.score > 0.35).sort((a, b) => b.score - a.score).slice(0, limit);
  } catch { return []; }
}

/* ---------------- Tolking av spørsmålet ---------------- */

export function parseQuery(text, now = new Date()) {
  const t = String(text).toLowerCase();
  let from = null, to = null, label = null;
  const y = (t.match(/\b(20\d{2})\b/) ?? [])[1];
  const year = y ? +y : now.getFullYear();
  const mi = MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
  if (mi >= 0) {
    // Uten årstall: siste gang måneden var (september i oktober = i år, desember i oktober = i fjor).
    const yy = y ? year : mi > now.getMonth() ? year - 1 : year;
    from = `${yy}-${String(mi + 1).padStart(2, '0')}-01`;
    to = new Date(yy, mi + 1, 1).toLocaleDateString('sv-SE');
    label = `${MONTHS[mi]} ${yy}`;
  } else if (/\bforrige måned\b/.test(t)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    from = d.toLocaleDateString('sv-SE'); to = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('sv-SE'); label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } else if (/\b(denne måneden|i måned)\b/.test(t)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('sv-SE'); to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('sv-SE'); label = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  } else if (/\b(i år|hittil i år)\b/.test(t) || y) {
    from = `${year}-01-01`; to = `${year + 1}-01-01`; label = String(year);
  } else if (/\bi fjor\b/.test(t)) {
    from = `${year - 1}-01-01`; to = `${year}-01-01`; label = String(year - 1);
  }
  const income = /\b(inn|inntekt|inntekter|lønn|fikk|mottatt|tjente)\b/.test(t);
  const words = t.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w) && !MONTHS.includes(w) && !/^20\d{2}$/.test(w));
  return { from, to, label, income, words };
}

const ftsQuery = (words) => words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' OR ');

/* ---------------- Søk ---------------- */

const kr = (v) => new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v)).replace(/ /g, ' ');
const dd = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '');

function hydrate(kind, ref, u = me()) {
  if (kind === 'tx') {
    const t = q('SELECT t.*, c.name AS category, c.color, c.kind AS ckind FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.id=? AND t.user_id=?').get(+ref, u);
    return t && { type: 'tx', id: String(t.id), txId: t.id, description: t.merchant || t.description, date: t.date, amount: t.amount / 100, source: 'Transaksjon', category: t.category ?? 'Ukategorisert', color: t.color ?? '#A0A0AA', transfer: t.ckind === 'transfer' };
  }
  const [id, li] = ref.split(':');
  const r = q('SELECT * FROM fh_receipts WHERE id=? AND user_id=?').get(id, u);
  if (!r) return null;
  let lines = [];
  try { lines = JSON.parse(r.extraction ?? 'null')?.lines ?? []; } catch { /* ugyldig */ }
  if (kind === 'line') {
    const l = lines[+li];
    return l && { type: 'line', id: ref, txId: r.transaction_id, receiptId: r.id, description: l.description, date: r.date, amount: -Math.abs(l.amount), source: `Varelinje · ${r.merchant ?? 'kvittering'}`, color: '#FFB08A' };
  }
  return { type: 'receipt', id: r.id, txId: r.transaction_id, receiptId: r.id, description: r.merchant ?? 'Kvittering', date: r.date, amount: r.total != null ? -r.total / 100 : null, source: r.status === 'booked' ? 'Kvittering · bokført' : 'Kvittering', color: '#9DBDFF' };
}

export async function search(text, { limit = 12, signal = null } = {}) {
  ensureIndex();
  const u = me();
  const pq = parseQuery(text);
  const ranks = new Map();
  const bump = (kind, ref, rank, why) => {
    const k = `${kind}/${ref}`, cur = ranks.get(k) ?? { kind, ref, score: 0, why: null };
    cur.score += 1 / (60 + rank); cur.why ??= why;
    ranks.set(k, cur);
  };
  if (pq.words.length) {
    const rows = q(`SELECT kind, ref, snippet(fh_fts2, 3, '«', '»', '…', 10) AS snip FROM fh_fts2 WHERE fh_fts2 MATCH ? AND uid=? ORDER BY bm25(fh_fts2) LIMIT 300`).all(ftsQuery(pq.words), u);
    rows.forEach((r, i) => bump(r.kind, r.ref, i, `Treff i teksten: ${r.snip}`));
  }
  const vec = await vectorHits(text, 30, signal);
  vec.forEach((r, i) => bump(r.kind, r.ref, i, `Lignende innhold (${Math.round(r.score * 100)} % likhet)`));
  // Uten søkeord (f.eks. «hvor mye brukte jeg i september?»): alle transaksjoner i perioden.
  if (!pq.words.length && pq.from) q('SELECT id FROM fh_transactions WHERE user_id=? AND date>=? AND date<? ORDER BY abs(amount) DESC LIMIT 200').pluck().all(u, pq.from, pq.to).forEach((id, i) => bump('tx', String(id), i, `I perioden ${pq.label}`));

  let hits = [...ranks.values()].map((r) => { const h = hydrate(r.kind, r.ref, u); return h && { ...h, score: r.score, reason: r.why }; }).filter(Boolean);
  if (pq.from) hits = hits.filter((h) => h.date && h.date >= pq.from && h.date < pq.to);
  hits.sort((a, b) => b.score - a.score);

  // Summer regnes bare på transaksjoner (kvitteringer og varelinjer er ofte samme kjøp).
  const txs = hits.filter((h) => h.type === 'tx' && !h.transfer);
  const out = txs.filter((h) => h.amount < 0), inn = txs.filter((h) => h.amount > 0);
  const facts = { period: pq.label, count: txs.length, outSum: Math.round(out.reduce((a, h) => a - h.amount, 0) * 100) / 100, inSum: Math.round(inn.reduce((a, h) => a + h.amount, 0) * 100) / 100,
    biggest: out.slice().sort((a, b) => a.amount - b.amount)[0] ?? null };
  const top = hits.slice(0, limit).map(({ score, transfer, ...h }) => h);
  return { pq, hits: top, facts, all: hits.length };
}

function heuristicAnswer(text, { pq, facts, hits, all }) {
  if (!all) return `Fant ingen transaksjoner, kvitteringer eller varelinjer som passer${pq.label ? ` i ${pq.label}` : ''}. Prøv et annet ord, f.eks. butikknavnet eller en kategori.`;
  const parts = [];
  const per = pq.label ? ` i ${pq.label}` : '';
  if (facts.count) {
    if (pq.income && facts.inSum) parts.push(`Du fikk inn ${kr(facts.inSum)} kr${per} fordelt på ${facts.count} transaksjon${facts.count === 1 ? '' : 'er'}.`);
    else if (facts.outSum) parts.push(`Du brukte ${kr(facts.outSum)} kr${per} på ${facts.count} transaksjon${facts.count === 1 ? '' : 'er'} som passer søket.`);
    if (facts.biggest && facts.count > 1) parts.push(`Største post var ${facts.biggest.description} ${dd(facts.biggest.date)} på ${kr(facts.biggest.amount)} kr.`);
  }
  const other = hits.filter((h) => h.type !== 'tx').length;
  if (other) parts.push(`${other} treff er fra kvitteringer og varelinjer.`);
  if (!parts.length) parts.push(`Fant ${all} treff${per}.`);
  return parts.join(' ');
}

// Alle tall i svaret må finnes i grunnlaget (beløp, summer, antall, datoer, årstall).
function numbersOk(answer, allowed) {
  const nums = String(answer).match(/\d[\d\s.,]*\d|\d/g) ?? [];
  const norm = (s) => s.replace(/[\s ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  return nums.every((n) => { const v = parseFloat(norm(n)); return !Number.isFinite(v) || allowed.some((a) => Math.abs(a - v) < 0.6); });
}

// Når AI-motoren nettopp har feilet, hopper vi rett til vanlig søk i noen minutter i stedet for å vente på tidsavbrudd hver gang.
let aiDownUntil = 0, aiDownWhy = '';
export const aiDown = () => Date.now() < aiDownUntil;
export const markAiDown = (ms = 90_000, why = '') => { aiDownUntil = Date.now() + ms; aiDownWhy = why; };

// Kaster AiUnavailable når motoren er nede eller ikke svarer; da bruker kallet vanlig søk.
export class AiUnavailable extends Error {}
// force = brukeren slo på ✦ AI selv: pausen etter en feil hoppes over, så AI faktisk prøves (og feilen vises på nytt).
// Prompt 25: signal (Avbryt), onEngine(engine, limitS) og status(text) brukes av AI-søk som jobb. Ingen fast tidsgrense her.
export async function answer(text, { force = false, signal = null, onEngine, status } = {}) {
  if (!force && aiDown()) throw new AiUnavailable(`svarte ikke for under 90 sekunder siden${aiDownWhy ? ': ' + aiDownWhy : ''}`);
  const r = await search(text, { signal });
  if (signal?.aborted) throw new AiCancelled();
  const fallback = heuristicAnswer(text, r);
  let engine = 'AI';
  if (!r.all) return { answer: fallback, hits: r.hits, engine: 'Uten AI', facts: r.facts, empty: true };
  const ctx = r.hits.map((h, i) => `[${i + 1}] ${h.source}: ${h.description} · ${dd(h.date)} · ${h.amount != null ? kr(h.amount) + ' kr' : 'ukjent beløp'}${h.category ? ' · ' + h.category : ''}`).join('\n');
  const prompt = `Du er en presis norsk økonomiassistent. Svar på spørsmålet KUN ut fra grunnlaget under. Skriv 1–3 korte setninger på norsk bokmål.
Bruk bare tall som står i grunnlaget eller i fasiten. Finn aldri på beløp. Vis til treff med [n]. Hvis grunnlaget ikke holder, si det.

Spørsmål: ${text}
Fasit (regnet ut av systemet): periode=${r.facts.period ?? 'alle'}; antall transaksjoner=${r.facts.count}; sum ut=${kr(r.facts.outSum)} kr; sum inn=${kr(r.facts.inSum)} kr.
Grunnlag:
${ctx}`;
  try {
    const out = await textJson(prompt, { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] }, { task: 'search', signal, onEngine, status });
    engine = out.provider;
    const res = out.data;
    const a = String(res?.answer ?? '').trim().slice(0, 800);
    const allowed = [r.facts.outSum, r.facts.inSum, r.facts.count, r.hits.length, ...r.hits.flatMap((h, i) => [Math.abs(h.amount ?? 0), i + 1, +h.date?.slice(0, 4), +h.date?.slice(5, 7), +h.date?.slice(8, 10)]), ...[...String(text).matchAll(/\d+/g)].map((m) => +m[0])].filter(Number.isFinite);
    // Svarte en motor etter at en annen ikke svarte i tide, følger tidsavbruddet med («Ollama svarte ikke innen 60 s»).
    const to = out.timeouts?.length ? { timeouts: out.timeouts, timeoutNotice: out.timeouts.map((x) => x.text).join(' · ') } : {};
    if (a && numbersOk(a, allowed)) return { answer: a, hits: r.hits, engine, facts: r.facts, ...to };
    return { answer: fallback, hits: r.hits, engine: `${engine} (kontrollert – tall fra systemet)`, facts: r.facts, ...to };
  } catch (e) {
    if (e instanceof AiCancelled || e.cancelled) throw e;
    markAiDown(90_000, e.message);
    throw Object.assign(new AiUnavailable(e.message), { kind: aiErrorKind(e.message, e.timeouts), timeouts: e.timeouts ?? [] });
  }
}

// Feilen fra AI-motorene → kort, forståelig årsak til svar-kortet (tekstmeldingen fra hver motor følger med under).
export function aiErrorKind(msg, timeouts = []) {
  const m = String(msg ?? '');
  // Prompt 25: motoren og grensen som faktisk gjaldt, f.eks. «Ollama svarte ikke innen 60 s.»
  if (timeouts?.length) return { kind: 'timeout', text: `${timeouts.map((x) => x.text).join(', ')}.`, engine: timeouts[0].engine, limitS: timeouts[0].limitS };
  if (/nøkkel mangler/i.test(m) && !/svarte/i.test(m)) return { kind: 'key', text: 'AI-nøkkel mangler. Legg den inn under Innstillinger → AI og tolkning.' };
  if (/svarte 40[13]|API key not valid|invalid api key|PERMISSION_DENIED|unauthori/i.test(m)) return { kind: 'auth', text: 'AI-nøkkelen ble avvist (401/403). Sjekk nøkkelen under Innstillinger → AI og tolkning.' };
  if (/tidsfristen|timeout|tidsavbrudd/i.test(m)) {
    const x = m.match(/(Gemini|Groq|Ollama)[^·]*?\((\d+) s\)/);
    return { kind: 'timeout', text: x ? `${x[1]} svarte ikke innen ${x[2]} s.` : 'AI-motoren svarte ikke innen tidsgrensen.' };
  }
  if (/modell|svarte 404|not found/i.test(m)) return { kind: 'model', text: 'AI-modellen finnes ikke eller kan ikke brukes. Velg en annen modell under Innstillinger → AI og tolkning.' };
  if (/svarte 429|quota|rate limit/i.test(m)) return { kind: 'quota', text: 'AI-kvoten er brukt opp for nå. Prøv igjen senere, eller bytt motor.' };
  if (/kan ikke nås|ECONNREFUSED|ENOTFOUND/i.test(m)) return { kind: 'network', text: 'AI-motoren kan ikke nås fra serveren.' };
  return { kind: 'error', text: 'AI-motoren svarte med en feil.' };
}

export function suggestions() {
  const now = new Date(), prev = MONTHS[(now.getMonth() + 11) % 12];
  const topCat = q(`SELECT c.name FROM fh_transactions t JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND c.kind='expense' AND t.date>=date('now','-90 days') GROUP BY c.id ORDER BY sum(-t.amount) DESC LIMIT 1`).pluck().get(me());
  const topMerchant = q(`SELECT coalesce(merchant, description) FROM fh_transactions WHERE user_id=? AND amount<0 AND date>=date('now','-90 days') GROUP BY coalesce(merchant, description) ORDER BY count(*) DESC LIMIT 1`).pluck().get(me());
  return [`Hvor mye brukte jeg på strøm i ${prev}?`, topCat && `Hva brukte jeg på ${topCat.toLowerCase()} i år?`, topMerchant && `Hvor ofte handlet jeg på ${topMerchant}?`, 'Hvilke kvitteringer har melk?', 'Hvor mye fikk jeg inn forrige måned?'].filter(Boolean).slice(0, 5);
}

/* ---------------- Vanlig søk (uten AI) ----------------
   Brukes når AI er av eller ikke svarer, og fra mobilens «Vanlig søk». Forstår:
   «sist jeg var på X», «kvitteringer med tomater», månedsnavn, «over 500 kr», «største utgift», «til gjennomgang».
   Hvert treff sier hvorfor det traff (Butikk · …, I kvitteringen · …, Kategori · …). */

// Små bokstaver og uten aksenter (é→e, å→a), samme som FTS-indeksen (remove_diacritics 2). æ og ø beholdes.
export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');

// Enkel norsk stemming: tomat/tomater/tomatene → tomat, eple/epler/eplene → epl, bananen → banan.
const SUFFIX = ['heten', 'ene', 'ane', 'ers', 'ens', 'ets', 'er', 'ar', 'en', 'et', 'a', 'e', 's'];
export function stem(w) {
  const x = fold(w);
  if (x.length <= 3) return x;
  for (const s of SUFFIX) if (x.endsWith(s) && x.length - s.length >= 3) return x.slice(0, -s.length);
  return x;
}

const PLAIN_STOP = new Set([...STOP, 'kvittering', 'kvitteringer', 'kvitteringen', 'kvitteringene', 'vare', 'varer', 'varen', 'varene', 'inneholder', 'innhold',
  'sist', 'siste', 'gang', 'gangen', 'var', 'handlet', 'kjøpte', 'hos', 'butikk', 'butikker', 'butikken', 'over', 'under', 'største', 'dyreste', 'gjennomgang',
  'ubekreftet', 'ubekreftede', 'datoen', 'dato', 'når', 'noen', 'kalt', 'heter', 'navn', 'navnet', 'om', 'se', 'alt', 'hele', 'mer', 'enn', 'minst', 'mindre', 'høyeste']);

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------------- Prompt 27: uklar matching (felles for vanlig søk og søkeforslag) ----------------
   norm: små bokstaver, uten diakritiske tegn (é→e, ü→u), men æ, ø og å beholdes. Damerau-avstand (optimal string
   alignment) slik at en ombytting («blosm» ↔ «bloms») teller som én feil. */
export const norm = (s) => String(s ?? '').toLowerCase().replace(/å/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').replace(/\u0001/g, 'å');
export function osa(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  let pp = null, p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    let low = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + cost);
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
      c[j] = v; if (v < low) low = v;
    }
    if (low > max) return max + 1;
    pp = p; p = c;
  }
  return p[n];
}
const WORD_SPLIT = /[^\p{L}\p{N}&+]+/u;
export const wordsOf = (text) => norm(text).split(WORD_SPLIT).filter(Boolean);
/** true når q (normalisert, minst 4 tegn) er maks én feil unna starten av et ord i teksten. */
export function fuzzyStart(text, q) {
  if (q.length < 4) return false;
  for (const w of wordsOf(text)) {
    for (const len of [q.length - 1, q.length, q.length + 1]) {
      if (len < 3 || len > w.length) continue;
      if (osa(q, w.slice(0, len), 1) <= 1) return true;
    }
  }
  return false;
}
/** Score 4/3/2/1/0: navnet starter med q, et ord starter med q, inneholder q, uklar start (q ≥ 4 tegn). */
export function matchScore(text, qn) {
  const t = norm(text).trim();
  if (!qn || !t) return 0;
  if (t.startsWith(qn)) return 4;
  if (wordsOf(t).some((w) => w.startsWith(qn)) || new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(qn)}`, 'u').test(t)) return 3;
  if (t.includes(qn)) return 2;
  return fuzzyStart(t, qn) ? 1 : 0;
}
// Ord i teksten som begynner med stammen (ordgrense foran).
const wordHit = (text, st) => new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(st)}`, 'u').test(fold(text));
const amountOf = (s) => Number(String(s).replace(/[\s ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));

export function interpret(text, now = new Date()) {
  const raw = String(text ?? '').trim(), t = raw.toLowerCase();
  const pq = parseQuery(raw, now);
  const out = { month: pq.label ?? undefined, from: pq.from, to: pq.to };
  const store = t.match(/\bsist(?:e gang)?\s+(?:jeg\s+)?(?:var|handlet|kjøpte\s+noe|handla)\s+(?:på|hos|i)\s+(.+?)(?:[?.!,]|\s+(?:og|i\s+(?:år|fjor|\p{L}+\s*\d{0,4}))\b|$)/u)
    ?? t.match(/\b(?:butikker?)\s+(?:kalt|som heter|med navnet)\s+(.+?)(?:[?.!,]|\s+og\b|$)/u);
  if (store) out.store = store[1].replace(/\s+(?:og|finn|se)\b.*$/u, '').trim();
  const item = t.match(/\b(?:kvitteringer?|kvitteringen|varer?|varelinjer?)\s+(?:med|som\s+inneholder|som\s+har|der\s+det\s+er)\s+(.+?)(?:[?.!,]|\s+(?:i|over|under|fra|på|hos)\s|$)/u)
    ?? t.match(/\bsist(?:e gang)?\s+(?:jeg\s+)?kjøpte\s+(?!noe\b)(.+?)(?:[?.!,]|\s+(?:i|på|hos)\s|$)/u);
  if (item && !out.store) out.item = item[1].trim();
  const over = t.match(/\b(?:over|mer enn|minst)\s+(\d[\d\s.,]*)\s*(?:kr|kroner|,-)?/u);
  if (over) out.minAmount = amountOf(over[1]);
  const under = t.match(/\b(?:under|mindre enn)\s+(\d[\d\s.,]*)\s*(?:kr|kroner|,-)?/u);
  if (under) out.maxAmount = amountOf(under[1]);
  if (/\b(største|dyreste|høyeste)\b/u.test(t)) out.largest = true;
  if (/\b(til gjennomgang|gjennomgang|ubekreftet|ubekreftede|må bekreftes)\b/u.test(t)) out.review = true;
  // Resten er fritekst (butikk, vare, kategori, notat).
  const skip = new Set([...(out.store ? fold(out.store).split(/\s+/) : []), ...(out.item ? fold(out.item).split(/\s+/) : [])]);
  out.words = pq.words.filter((w) => !PLAIN_STOP.has(w) && !skip.has(fold(w)) && !/^\d/.test(w));
  return out;
}

const txRows = (u = me()) => q(`SELECT t.id, t.date, t.amount, t.description, t.merchant, t.note, t.ai_short, c.name AS category, c.kind AS ckind, c.color
  FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=?`).all(u);
const receiptRows = (u = me()) => q("SELECT id, merchant, date, total, status, extraction, transaction_id FROM fh_receipts WHERE status NOT IN ('rejected') AND user_id=?").all(u).map((r) => {
  let lines = [];
  try { lines = JSON.parse(r.extraction ?? 'null')?.lines ?? []; } catch { /* ugyldig */ }
  return { ...r, lines: lines.filter((l) => l?.description) };
});
const nameOf = (t) => t.merchant || t.description;
const txHit = (t, reason) => ({ type: 'tx', id: String(t.id), txId: t.id, receiptId: null, description: nameOf(t), date: t.date, amount: t.amount / 100, reason, source: 'Transaksjon', category: t.category ?? 'Ukategorisert', color: t.color ?? '#A0A0AA' });
const lineText = (l) => `${l.description}${l.amount != null ? ` ${kr(l.amount)} kr` : ''}`;
const inPeriod = (it, d) => !d.from || (it.date && it.date >= d.from && it.date < d.to);
const amountOk = (amt, d) => (d.minAmount == null || Math.abs(amt) >= d.minAmount) && (d.maxAmount == null || Math.abs(amt) <= d.maxAmount);

function storesNamed(name, txs) {
  const st = fold(name).split(/\s+/).filter(Boolean).map(stem);
  const by = new Map();
  for (const t of txs) {
    const n = nameOf(t);
    if (!st.every((s) => wordHit(n, s))) continue;
    const cur = by.get(n) ?? { name: n, count: 0, last: null, total: 0 };
    cur.count++; if (!cur.last || t.date > cur.last) cur.last = t.date; if (t.amount < 0) cur.total += -t.amount / 100;
    by.set(n, cur);
  }
  return [...by.values()].map((s) => ({ ...s, total: Math.round(s.total * 100) / 100 })).sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''));
}

// Enkle søk («ica», «proton», «rema 1000»): 1–2 ord uten «?» eller spørsmålsord. Da prøves vanlig søk før AI.
const QWORDS = new Set(['hva', 'hvor', 'hvem', 'hvilke', 'hvilken', 'hvilket', 'hvordan', 'hvorfor', 'hvor', 'når', 'naar', 'hvormye', 'sist', 'største', 'storste', 'minste', 'viser', 'vis', 'finn', 'hvem']);
export function isSimpleQuery(text) {
  const t = String(text ?? '').trim();
  if (!t || t.includes('?')) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 2) return false;
  return !words.some((w) => QWORDS.has(fold(w).replace(/[^\p{L}\p{N}]/gu, '')));
}

export function plainSearch(text, { limit = 30, now = new Date() } = {}) {
  ensureIndex();
  const d = interpret(text, now);
  const txs = txRows(), rcs = receiptRows();
  let hits = [], stores, summary = '';
  const per = d.month ? ` i ${d.month}` : '';

  if (d.store) {
    stores = storesNamed(d.store, txs);
    const names = new Set(stores.map((s) => s.name));
    hits = txs.filter((t) => names.has(nameOf(t)) && inPeriod(t, d) && amountOk(t.amount / 100, d)).sort((a, b) => b.date.localeCompare(a.date)).map((t) => txHit(t, `Butikk · ${nameOf(t)}`));
    if (!hits.length) summary = `Fant ingen kjøp hos «${d.store}»${per}.`;
    else {
      const last = hits[0];
      summary = `Sist du var på ${last.description} var ${dd(last.date)} (${kr(last.amount)} kr).`;
      if (stores.length > 1) summary += ` Fant ${stores.length} butikker med navnet: ${stores.slice(0, 4).map((s) => `${s.name} (${s.count} kjøp, sist ${dd(s.last)})`).join(', ')}.`;
      else summary += ` ${stores[0].count} kjøp totalt, ${kr(stores[0].total)} kr.`;
    }
  } else if (d.item) {
    const st = fold(d.item).split(/\s+/).filter(Boolean).map(stem);
    for (const r of rcs) {
      if (!inPeriod(r, d)) continue;
      r.lines.forEach((l, i) => {
        if (!st.every((s) => wordHit(l.description, s)) || !amountOk(l.amount ?? 0, d)) return;
        hits.push({ type: 'line', id: `${r.id}:${i}`, txId: r.transaction_id, receiptId: r.id, description: l.description, date: r.date, amount: l.amount != null ? -Math.abs(l.amount) : null,
          reason: `I kvitteringen · ${lineText(l)}`, source: `Varelinje · ${r.merchant ?? 'kvittering'}`, store: r.merchant ?? null, color: '#FFB08A' });
      });
    }
    hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const rcCount = new Set(hits.map((h) => h.receiptId)).size;
    summary = hits.length ? `Fant «${d.item}» i ${rcCount} kvittering${rcCount === 1 ? '' : 'er'}${per}. Sist ${dd(hits[0].date)}${hits[0].store ? ` hos ${hits[0].store}` : ''}.`
      : `Fant ingen kvitteringer med «${d.item}»${per}. Varelinjer finnes bare for kvitteringer som er lest av AI-en.`;
  } else if (d.review) {
    hits = rcs.filter((r) => ['needs_review', 'pending', 'processing'].includes(r.status) && inPeriod(r, d)).map((r) => ({ type: 'receipt', id: r.id, txId: r.transaction_id, receiptId: r.id,
      description: r.merchant ?? 'Kvittering', date: r.date, amount: r.total != null ? -r.total / 100 : null, reason: r.status === 'needs_review' ? 'Til gjennomgang · venter på at du bekrefter' : 'Til gjennomgang · AI-en leser fortsatt', source: 'Kvittering', color: '#9DBDFF' }));
    summary = hits.length ? `${hits.length} kvittering${hits.length === 1 ? '' : 'er'} venter på gjennomgang${per}.` : 'Ingen kvitteringer venter på gjennomgang.';
  } else {
    const st = d.words.map(stem).filter((s) => s.length >= 2);
    for (const t of txs) {
      if (!inPeriod(t, d) || !amountOk(t.amount / 100, d) || t.ckind === 'transfer') continue;
      if (!st.length) { if (d.from || d.minAmount != null || d.maxAmount != null || d.largest) hits.push(txHit(t, d.largest ? `Største utgift${per}` : d.minAmount != null ? `Beløp · ${kr(t.amount / 100)} kr` : `I perioden ${d.month}`)); continue; }
      const n = nameOf(t);
      let reason = null;
      if (st.every((s) => wordHit(n, s))) reason = `Butikk · ${n}`;
      else if (t.description && t.description !== n && st.every((s) => wordHit(t.description, s))) reason = `Bankteksten · ${t.description.slice(0, 60)}`;
      else if (t.category && st.every((s) => wordHit(t.category, s))) reason = `Kategori · ${t.category}`;
      else if (t.note && st.every((s) => wordHit(t.note, s))) reason = `Notat · ${t.note.slice(0, 60)}`;
      else if (t.ai_short && st.every((s) => wordHit(t.ai_short, s))) reason = `Beskrivelse · ${t.ai_short.slice(0, 60)}`;
      if (reason) hits.push(txHit(t, reason));
    }
    if (st.length) for (const r of rcs) {
      if (!inPeriod(r, d)) continue;
      r.lines.forEach((l, i) => {
        if (!st.every((s) => wordHit(l.description, s)) || !amountOk(l.amount ?? 0, d)) return;
        hits.push({ type: 'line', id: `${r.id}:${i}`, txId: r.transaction_id, receiptId: r.id, description: l.description, date: r.date, amount: l.amount != null ? -Math.abs(l.amount) : null,
          reason: `I kvitteringen · ${lineText(l)}`, source: `Varelinje · ${r.merchant ?? 'kvittering'}`, store: r.merchant ?? null, color: '#FFB08A' });
      });
    }
    // Prompt 27: ingen treff → uklar matching mot butikk og kategori («blosm» finner Blomsterlandet).
    if (!hits.length && st.length) {
      const fz = d.words.map((w) => norm(w)).filter((w) => w.length >= 4);
      if (fz.length) for (const t of txs) {
        if (!inPeriod(t, d) || !amountOk(t.amount / 100, d) || t.ckind === 'transfer') continue;
        const n = nameOf(t);
        if (fz.every((w) => fuzzyStart(n, w))) hits.push({ ...txHit(t, `Butikk · ${n}`), fuzzy: true });
        else if (t.category && fz.every((w) => fuzzyStart(t.category, w))) hits.push({ ...txHit(t, `Kategori · ${t.category}`), fuzzy: true });
      }
    }
    if (d.largest) hits = hits.filter((h) => (h.amount ?? 0) < 0).sort((a, b) => a.amount - b.amount);
    else hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));
    const txOnly = hits.filter((h) => h.type === 'tx'), out = txOnly.filter((h) => h.amount < 0).reduce((a, h) => a - h.amount, 0);
    if (!hits.length) summary = `Fant ingen treff${per}. Prøv butikknavnet, en vare fra kvitteringen eller en kategori.`;
    else if (d.largest) summary = `Største utgift${per} var ${hits[0].description} ${dd(hits[0].date)} på ${kr(hits[0].amount)} kr.`;
    else summary = `${hits.length} treff${per}${txOnly.length ? `, ${kr(out)} kr brukt på ${txOnly.length} transaksjon${txOnly.length === 1 ? '' : 'er'}` : ''}.`;
  }

  const total = hits.length;
  hits = hits.slice(0, limit);
  const interpreted = Object.fromEntries(Object.entries({ store: d.store, item: d.item, month: d.month, minAmount: d.minAmount, maxAmount: d.maxAmount, largest: d.largest, review: d.review, words: d.words?.length ? d.words : undefined }).filter(([, v]) => v !== undefined && v !== false));
  return { mode: 'plain', query: String(text ?? ''), interpreted, summary, answer: summary, total, hits, ...(stores ? { stores } : {}), followUps: followUps(d, hits, now), suggestions: flatSuggestions(String(text ?? '')) };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// «Prøv også»: oppfølgingsspørsmål ut fra hva som ble søkt på og hva som traff. Alle kan tolkes av vanlig søk.
function followUps(d, hits, now) {
  const prevM = MONTHS[(now.getMonth() + 11) % 12], curM = MONTHS[now.getMonth()];
  const out = [];
  const topStore = (() => { const c = new Map(); for (const h of hits) { const s = h.type === 'tx' ? h.description : h.store; if (s) c.set(s, (c.get(s) ?? 0) + 1); } return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; })();
  if (d.store) {
    out.push(`${cap(d.store)} i ${curM}`, `Største utgift hos ${d.store}`, `${cap(d.store)} over 500 kr`);
    const rc = hits.find((h) => h.txId) && q('SELECT extraction FROM fh_receipts WHERE transaction_id=? AND user_id=? LIMIT 1').pluck().get(hits[0].txId, me());
    try { const l = JSON.parse(rc ?? 'null')?.lines?.[0]?.description; if (l) out.push(`Kvitteringer med ${fold(l).split(/\s+/)[0]}`); } catch { /* ugyldig */ }
  } else if (d.item) {
    out.push(`Sist jeg kjøpte ${d.item}`, `Kvitteringer med ${d.item} i ${prevM}`);
    if (topStore) out.push(`Sist jeg var på ${topStore}`);
  } else if (d.review) {
    out.push(`Største utgift i ${curM}`, `Kvitteringer med melk`);
  } else {
    if (topStore) out.push(`Sist jeg var på ${topStore}`);
    const cat = hits.find((h) => h.type === 'tx' && h.category && h.category !== 'Ukategorisert')?.category;
    if (cat) out.push(`${cat} i ${d.month ?? curM}`);
    if (!d.largest) out.push(`Største utgift i ${d.month ?? curM}`);
    if (d.minAmount == null) out.push(`Over 500 kr i ${d.month ?? prevM}`);
    if (!d.review) out.push('Til gjennomgang');
  }
  return [...new Set(out)].slice(0, 5);
}

// Forslag i tre grupper, bygd fra egne data (faller tilbake til faste eksempler i en tom database).
export function suggestionGroups(now = new Date()) {
  ensureIndex();
  const curM = MONTHS[now.getMonth()], prevM = MONTHS[(now.getMonth() + 11) % 12];
  const stores = q(`SELECT coalesce(merchant, description) n FROM fh_transactions WHERE user_id=? AND amount<0 AND date>=date('now','-180 days') GROUP BY n ORDER BY count(*) DESC, max(date) DESC LIMIT 4`).pluck().all(me());
  const freq = new Map();
  for (const r of receiptRows()) for (const l of r.lines) {
    const w = fold(l.description).replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).find((x) => x.length >= 3 && !PLAIN_STOP.has(x));
    if (w) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const items = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
  const review = q("SELECT count(*) FROM fh_receipts WHERE status='needs_review' AND user_id=?").pluck().get(me());
  return [
    { title: 'Butikker', items: (stores.length ? stores : ['Rema 1000', 'Biltema']).map((s) => `Sist jeg var på ${s}`) },
    { title: 'Varer i kvitteringer', items: (items.length ? items : ['melk', 'tomater']).map((w) => `Kvitteringer med ${w}`) },
    { title: 'Beløp og perioder', items: [`Største utgift i ${curM}`, `Over 500 kr i ${prevM}`, `Alt i ${prevM}`, ...(review ? ['Til gjennomgang'] : [])] },
  ];
}
function flatSuggestions(exclude = '') {
  const ex = fold(exclude).trim();
  return [...new Set([...suggestionGroups().flatMap((g) => g.items), ...suggestions()])].filter((s) => fold(s) !== ex).slice(0, 8);
}
