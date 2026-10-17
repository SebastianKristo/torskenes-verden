// ✦ AI-søk i transaksjoner, kvitteringer og varelinjer.
// 1) Hybrid gjenfinning: BM25 (SQLite FTS5) + valgfri vektor-likhet (embeddings fra Ollama eller Gemini), slått sammen med RRF.
// 2) Svar: språkmodellen får treffene og ferdig utregnede summer, og må vise til treffene. Tall i svaret som ikke finnes
//    i grunnlaget gjør at svaret forkastes og det regelbaserte sammendraget brukes i stedet – modellen får ikke finne på tall.
import { db, settings, secret } from './db.js';
import { askJson } from './ai.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fh_fts USING fts5(kind UNINDEXED, ref UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS fh_embed (kind TEXT NOT NULL, ref TEXT NOT NULL, model TEXT NOT NULL, hash TEXT NOT NULL, vec BLOB NOT NULL, PRIMARY KEY (kind, ref, model));`);

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
  const tx = q(`SELECT t.id, t.date, t.amount, t.description, t.merchant, t.note, t.ai_short, t.ai_long, c.name AS category, a.name AS account
    FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id LEFT JOIN fh_accounts a ON a.id=t.account_id`).all();
  for (const t of tx) out.push(['tx', String(t.id), [t.description, t.merchant !== t.description ? t.merchant : '', t.category, t.account, t.note, t.ai_short, t.ai_long].filter(Boolean).join(' · ')]);
  for (const r of q("SELECT id, merchant, date, total, extraction, ai_short, ai_long FROM fh_receipts WHERE status NOT IN ('rejected')").all()) {
    let lines = [];
    try { lines = JSON.parse(r.extraction ?? 'null')?.lines ?? []; } catch { /* ugyldig */ }
    out.push(['rc', r.id, [r.merchant, r.ai_short, r.ai_long, lines.map((l) => l.description).join(', ')].filter(Boolean).join(' · ')]);
    lines.forEach((l, i) => l.description && out.push(['line', `${r.id}:${i}`, `${l.description} · ${r.merchant ?? ''}`]));
  }
  return out;
}
export function ensureIndex() {
  const sig = signature();
  if (sig === builtSig) return;
  const ins = q('INSERT INTO fh_fts(kind, ref, text) VALUES(?,?,?)');
  db.transaction(() => { q('DELETE FROM fh_fts').run(); for (const d of docs()) ins.run(...d); })();
  builtSig = sig;
  embedLater();
}

/* ---------------- Embeddings (valgfritt) ---------------- */

const embedModel = () => {
  const st = settings();
  if (!st.aiSearchEmbed) return null;
  if (st.embedModel) return { kind: 'ollama', model: st.embedModel };
  if (secret('geminiKey')) return { kind: 'gemini', model: 'text-embedding-004' };
  return null;
};
async function embed(texts, m) {
  if (m.kind === 'ollama') {
    const res = await fetch(`${settings().ollamaUrl.replace(/\/$/, '')}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000), body: JSON.stringify({ model: m.model, input: texts }) });
    if (!res.ok) throw new Error(`Ollama embed ${res.status}`);
    return (await res.json()).embeddings;
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.model}:batchEmbedContents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': secret('geminiKey') }, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ requests: texts.map((t) => ({ model: `models/${m.model}`, content: { parts: [{ text: t }] } })) }),
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
      const todo = q("SELECT kind, ref, text FROM fh_fts WHERE kind<>'line'").all().filter((d) => have.get(`${d.kind}/${d.ref}`) !== hashOf(d.text)).slice(0, 400);
      const put = q('INSERT OR REPLACE INTO fh_embed(kind, ref, model, hash, vec) VALUES(?,?,?,?,?)');
      for (let i = 0; i < todo.length; i += 32) {
        const part = todo.slice(i, i + 32), vecs = await embed(part.map((d) => d.text), m);
        db.transaction(() => part.forEach((d, j) => vecs[j] && put.run(d.kind, d.ref, m.model, hashOf(d.text), toBlob(vecs[j]))))();
      }
    } catch (e) { console.warn('[finans] embeddings:', e.message); }
    embedding = false;
  }, 500).unref?.();
}
async function vectorHits(text, limit = 30) {
  const m = embedModel();
  if (!m) return [];
  try {
    const [qv] = await embed([text], m);
    const qn = Math.hypot(...qv);
    return q('SELECT kind, ref, vec FROM fh_embed WHERE model=?').all(m.model).map((r) => {
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

function hydrate(kind, ref) {
  if (kind === 'tx') {
    const t = q('SELECT t.*, c.name AS category, c.color, c.kind AS ckind FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.id=?').get(+ref);
    return t && { type: 'tx', id: String(t.id), txId: t.id, description: t.merchant || t.description, date: t.date, amount: t.amount / 100, source: 'Transaksjon', category: t.category ?? 'Ukategorisert', color: t.color ?? '#A0A0AA', transfer: t.ckind === 'transfer' };
  }
  const [id, li] = ref.split(':');
  const r = q('SELECT * FROM fh_receipts WHERE id=?').get(id);
  if (!r) return null;
  let lines = [];
  try { lines = JSON.parse(r.extraction ?? 'null')?.lines ?? []; } catch { /* ugyldig */ }
  if (kind === 'line') {
    const l = lines[+li];
    return l && { type: 'line', id: ref, txId: r.transaction_id, receiptId: r.id, description: l.description, date: r.date, amount: -Math.abs(l.amount), source: `Varelinje · ${r.merchant ?? 'kvittering'}`, color: '#FFB08A' };
  }
  return { type: 'receipt', id: r.id, txId: r.transaction_id, receiptId: r.id, description: r.merchant ?? 'Kvittering', date: r.date, amount: r.total != null ? -r.total / 100 : null, source: r.status === 'booked' ? 'Kvittering · bokført' : 'Kvittering', color: '#9DBDFF' };
}

export async function search(text, { limit = 12 } = {}) {
  ensureIndex();
  const pq = parseQuery(text);
  const ranks = new Map();
  const bump = (kind, ref, rank, why) => {
    const k = `${kind}/${ref}`, cur = ranks.get(k) ?? { kind, ref, score: 0, why: null };
    cur.score += 1 / (60 + rank); cur.why ??= why;
    ranks.set(k, cur);
  };
  if (pq.words.length) {
    const rows = q(`SELECT kind, ref, snippet(fh_fts, 2, '«', '»', '…', 10) AS snip FROM fh_fts WHERE fh_fts MATCH ? ORDER BY bm25(fh_fts) LIMIT 300`).all(ftsQuery(pq.words));
    rows.forEach((r, i) => bump(r.kind, r.ref, i, `Treff i teksten: ${r.snip}`));
  }
  const vec = await vectorHits(text);
  vec.forEach((r, i) => bump(r.kind, r.ref, i, `Lignende innhold (${Math.round(r.score * 100)} % likhet)`));
  // Uten søkeord (f.eks. «hvor mye brukte jeg i september?»): alle transaksjoner i perioden.
  if (!pq.words.length && pq.from) q('SELECT id FROM fh_transactions WHERE date>=? AND date<? ORDER BY abs(amount) DESC LIMIT 200').pluck().all(pq.from, pq.to).forEach((id, i) => bump('tx', String(id), i, `I perioden ${pq.label}`));

  let hits = [...ranks.values()].map((r) => { const h = hydrate(r.kind, r.ref); return h && { ...h, score: r.score, reason: r.why }; }).filter(Boolean);
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

export async function answer(text) {
  const r = await search(text);
  const fallback = heuristicAnswer(text, r);
  const st = settings();
  const engine = secret('geminiKey') ? 'Gemini' : st.provider === 'ollama' ? 'Ollama' : 'Gemini';
  if (!r.all) return { answer: fallback, hits: r.hits, engine: 'Uten AI', facts: r.facts };
  const ctx = r.hits.map((h, i) => `[${i + 1}] ${h.source}: ${h.description} · ${dd(h.date)} · ${h.amount != null ? kr(h.amount) + ' kr' : 'ukjent beløp'}${h.category ? ' · ' + h.category : ''}`).join('\n');
  const prompt = `Du er en presis norsk økonomiassistent. Svar på spørsmålet KUN ut fra grunnlaget under. Skriv 1–3 korte setninger på norsk bokmål.
Bruk bare tall som står i grunnlaget eller i fasiten. Finn aldri på beløp. Vis til treff med [n]. Hvis grunnlaget ikke holder, si det.

Spørsmål: ${text}
Fasit (regnet ut av systemet): periode=${r.facts.period ?? 'alle'}; antall transaksjoner=${r.facts.count}; sum ut=${kr(r.facts.outSum)} kr; sum inn=${kr(r.facts.inSum)} kr.
Grunnlag:
${ctx}`;
  try {
    const res = await askJson(prompt, { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] }, { timeout: 12_000 });
    const a = String(res?.answer ?? '').trim().slice(0, 800);
    const allowed = [r.facts.outSum, r.facts.inSum, r.facts.count, r.hits.length, ...r.hits.flatMap((h, i) => [Math.abs(h.amount ?? 0), i + 1, +h.date?.slice(0, 4), +h.date?.slice(5, 7), +h.date?.slice(8, 10)]), ...[...String(text).matchAll(/\d+/g)].map((m) => +m[0])].filter(Number.isFinite);
    if (a && numbersOk(a, allowed)) return { answer: a, hits: r.hits, engine, facts: r.facts };
    return { answer: fallback, hits: r.hits, engine: `${engine} (kontrollert – tall fra systemet)`, facts: r.facts };
  } catch {
    return { answer: fallback, hits: r.hits, engine: 'Uten AI (motoren svarte ikke)', facts: r.facts };
  }
}

export function suggestions() {
  const now = new Date(), prev = MONTHS[(now.getMonth() + 11) % 12];
  const topCat = q(`SELECT c.name FROM fh_transactions t JOIN fh_categories c ON c.id=t.category_id WHERE c.kind='expense' AND t.date>=date('now','-90 days') GROUP BY c.id ORDER BY sum(-t.amount) DESC LIMIT 1`).pluck().get();
  const topMerchant = q(`SELECT coalesce(merchant, description) FROM fh_transactions WHERE amount<0 AND date>=date('now','-90 days') GROUP BY coalesce(merchant, description) ORDER BY count(*) DESC LIMIT 1`).pluck().get();
  return [`Hvor mye brukte jeg på strøm i ${prev}?`, topCat && `Hva brukte jeg på ${topCat.toLowerCase()} i år?`, topMerchant && `Hvor ofte handlet jeg på ${topMerchant}?`, 'Hvilke kvitteringer har melk?', 'Hvor mye fikk jeg inn forrige måned?'].filter(Boolean).slice(0, 5);
}
