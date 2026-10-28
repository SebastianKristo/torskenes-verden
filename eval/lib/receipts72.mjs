// Prompt 72 (LFM72): rene hjelpere for kvitterings-evalen (eval/receipts72.mjs) – fasit, poeng, oppsummering og rapport.
// Rapporten og JSON-fila har ALDRI kvitteringsinnhold (butikk, varer, beløp, datoer, OCR-tekst, feilmeldinger fra modellen):
// bare en hash av filnavnet, motor, tall og ja/nei. Finansdata skal ikke havne i loggfiler som kan deles.
import { createHash } from 'node:crypto';

/** Kombinasjonene evalen kjører (id → navn). */
export const COMBOS72 = Object.freeze({
  C: 'C · Apple Vision + qwen3:8b (dagens kjede)',
  'V-qwen': 'V · qwen2.5vl (ingen OCR)',
  'V-lfm3': 'V · LFM3-VL-2B (ingen OCR)',
  'V-lfm25': 'V · LFM2.5-VL-3B layout + qwen3:8b',
  CL: 'C + L · Apple Vision ordnet etter LFM2.5-layout + qwen3:8b',
  'X-lfm3': 'crossCheck · LFM3-VL-2B leser totalen',
});
export const COMBO_IDS72 = Object.keys(COMBOS72);

/** Kort, stabil ID for en kvittering (filnavnet hashes – navnet kan si noe om innholdet). */
export const fileHash72 = (name) => createHash('sha256').update(String(name)).digest('hex').slice(0, 10);

export const norm72 = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, ' ').trim();
const amountOf = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')));

/**
 * Fasit-fila → {merchant, aliases[], date, total, items:[{name, amount}], today}. Godtar eval-formatet (butikk, avdeling, dato, total,
 * linjer:[{navn, belop}]) og kvitteringsformatet (merchant, date, total, items:[{description, amount}], merchant_aliases).
 */
export function fasit72(j) {
  const r = j?.receipt ?? j ?? {};
  const items = (r.linjer ?? r.items ?? []).map((l) => ({ name: String(l.navn ?? l.description ?? l.name ?? ''), amount: amountOf(l.belop ?? l.amount) })).filter((l) => l.name || Number.isFinite(l.amount));
  const aliases = [...(Array.isArray(r.merchant_aliases) ? r.merchant_aliases : []), ...(Array.isArray(r.aliaser) ? r.aliaser : []), ...(r.avdeling ? [r.avdeling] : [])];
  const total = r.total == null ? null : amountOf(r.total);
  return { merchant: r.butikk ?? r.merchant ?? null, aliases, date: r.dato ?? r.date ?? null, total: Number.isFinite(total) ? total : null, items,
    today: /^\d{4}-\d{2}-\d{2}$/.test(j?.today ?? '') ? j.today : null };
}

/** Butikken stemmer etter normalisering: den ene inneholder den andre (minst 4 tegn), også mot aliasene. */
export function merchantOk72(got, f) {
  const g = norm72(got).replace(/\s/g, '');
  if (!g) return false;
  return [f?.merchant, ...(f?.aliases ?? [])].filter(Boolean).map((w) => norm72(w).replace(/\s/g, '')).some((w) => w && (g.includes(w) || (g.length >= 4 && w.includes(g))));
}

const bigrams = (s) => { const t = norm72(s).replace(/\s/g, ''); const out = new Map(); for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); out.set(b, (out.get(b) ?? 0) + 1); } return out; };
/** Dice-likhet på bokstavpar (0–1). */
export function dice72(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let n = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [k, v] of A) n += Math.min(v, B.get(k) ?? 0);
  return na + nb ? (2 * n) / (na + nb) : 0;
}
/** Navnet stemmer omtrent: samme første ord, det ene inneholder det andre, eller Dice ≥ 0,5. */
export function nameOk72(a, b) {
  const x = norm72(a), y = norm72(b);
  if (!x || !y) return false;
  const fx = x.split(' ')[0], fy = y.split(' ')[0];
  return fx === fy || x.includes(y) || y.includes(x) || (fy.length >= 3 && x.includes(fy)) || (fx.length >= 3 && y.includes(fx)) || dice72(x, y) >= 0.5;
}

/** Varelinjer: én-til-én, beløpet eksakt (±0,005) og navnet omtrent. → {tp, pred, want, precision, recall} */
export function itemsScore72(pred = [], want = []) {
  const used = new Set();
  let tp = 0;
  for (const w of want) {
    const i = pred.findIndex((p, j) => !used.has(j) && Number.isFinite(+p?.amount) && Math.abs(+p.amount - w.amount) < 0.005 && nameOk72(p.description ?? p.name ?? p.text, w.name));
    if (i >= 0) { used.add(i); tp++; }
  }
  const n = pred.length, m = want.length;
  return { tp, pred: n, want: m, precision: n ? tp / n : m ? 0 : 1, recall: m ? tp / m : 1 };
}

/** Én kjøring mot fasiten. → {total, date, merchant, items, passed} (null = ikke målt). */
export function score72(receipt, f, { passed = null } = {}) {
  const r = receipt ?? null;
  return {
    total: f.total == null ? null : !!r && Number.isFinite(+r.total) && r.total !== null && Math.abs(+r.total - f.total) < 0.005,
    date: f.date == null ? null : !!r && r.date === f.date,
    merchant: f.merchant == null ? null : !!r && merchantOk72(r.merchant, f),
    items: f.items.length ? itemsScore72(Array.isArray(r?.items) ? r.items : [], f.items) : null,
    passed: passed == null ? null : !!passed,
  };
}

/** Feiltekst → kategori for miljøfeil (aldri selve teksten i rapporten). → kategori | null */
export function envKind72(text) {
  const s = String(text ?? '');
  if (/Mac-OCR/i.test(s) && /(utilgjengelig|ikke satt|kan ikke nås|svarte ikke|avviste|nede)/i.test(s)) return 'Mac-OCR utilgjengelig';
  if (/finnes ikke|not found|ikke installert|ikke hentet|\b404\b|pull model/i.test(s)) return 'modell ikke hentet';
  if (/kan ikke nås|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|nocontact|ikke satt opp|adressen er ikke satt|fetch failed/i.test(s)) return 'motor kan ikke nås';
  if (/minne|memory/i.test(s)) return 'for lite minne';
  return null;
}

export const pct72 = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]; };
const rate = (xs, k) => { const v = xs.map((x) => x[k]).filter((x) => x !== null && x !== undefined); return v.length ? { ok: v.filter(Boolean).length, n: v.length } : null; };

/** Kjøringene → per motor/kombinasjon. Miljøfeil telles for seg (ikke som modellfeil). */
export function summarize72(runs) {
  const out = {};
  for (const id of [...new Set(runs.map((r) => r.combo))]) {
    const all = runs.filter((r) => r.combo === id), env = all.filter((r) => r.env), ok = all.filter((r) => !r.env);
    const it = ok.map((r) => r.items).filter(Boolean);
    const tp = it.reduce((a, x) => a + x.tp, 0), np = it.reduce((a, x) => a + x.pred, 0), nw = it.reduce((a, x) => a + x.want, 0);
    out[id] = { name: COMBOS72[id] ?? id, runs: all.length, measured: ok.length, env: env.length, envKinds: [...new Set(env.map((r) => r.env))],
      total: rate(ok, 'total'), date: rate(ok, 'date'), merchant: rate(ok, 'merchant'), passed: rate(ok, 'passed'),
      items: it.length ? { precision: np ? tp / np : null, recall: nw ? tp / nw : null, tp, pred: np, want: nw } : null,
      p50Ms: pct72(ok.map((r) => r.ms), 50), p90Ms: pct72(ok.map((r) => r.ms), 90),
      loadP50Ms: pct72(ok.map((r) => r.loadMs).filter((x) => x != null), 50), loadSumMs: ok.some((r) => r.loadMs != null) ? ok.reduce((a, r) => a + (r.loadMs ?? 0), 0) : null };
  }
  return out;
}

const fr = (x) => (!x ? '–' : `${x.ok}/${x.n}`);
const pc = (v) => (v == null ? '–' : `${Math.round(v * 100)} %`);
const s1 = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const ck = (v) => (v == null ? '–' : v ? '✓' : '✗');

/** Markdown-rapporten: én tabell for alle motorer + én per motor (kvitteringer som hash). Ingen kvitteringsinnhold. */
export function report72({ meta = {}, summary = {}, runs = [], warmup = {}, warnings = [] }) {
  const L = [`# Kvitterings-eval (prompt 72) · ${meta.date ?? ''}${meta.dry ? ' · DRY (falsk modell – måler ikke kvalitet)' : ''}`, '',
    `- Kvitteringer: ${meta.receipts ?? 0} (${meta.source ?? ''}) · kjøringer per kombinasjon: ${meta.runs ?? 1}`,
    `- Motor for LFM: ${meta.lfmBackend ?? 'ollama'} · tekst ${meta.models?.text ?? 'qwen3:8b'} · visjon ${meta.models?.vision ?? 'qwen2.5vl:7b'} · LFM3 ${meta.models?.lfm3 ?? '–'} · LFM2.5 ${meta.models?.lfm25 ?? '–'}`,
    `- Mac-OCR: ${meta.mac ?? '–'} · Commit ${meta.commit ?? 'ukjent'} · Node ${meta.node ?? ''}`,
    '- Rapporten har ingen kvitteringsinnhold: kvitteringene vises som hash av filnavnet, og bare tall og ja/nei er med.', '',
    '## Alle motorer', '',
    '| Kombinasjon | Målt | Miljø | Total | Dato | Butikk | Linjer presisjon | Linjer dekning | Besto kontroll | p50 | p90 | Lasting (oppvarming) | Lasting p50 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [id, s] of Object.entries(summary)) {
    L.push(`| ${s.name} | ${s.measured}/${s.runs} | ${s.env ? `${s.env} (${s.envKinds.join(', ')})` : '0'} | ${fr(s.total)} | ${fr(s.date)} | ${fr(s.merchant)} | ${pc(s.items?.precision)} | ${pc(s.items?.recall)} | ${fr(s.passed)} | ${s1(s.p50Ms)} | ${s1(s.p90Ms)} | ${s1(warmup[id]?.loadMs ?? null)} | ${s1(s.loadP50Ms)} |`);
  }
  for (const [id, s] of Object.entries(summary)) {
    L.push('', `## ${s.name}`, '', '| Kvittering | Kjøring | Total | Dato | Butikk | Linjer (riktige/lest/fasit) | Besto | Steg | Tid | Lasting | Miljø |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of runs.filter((x) => x.combo === id)) {
      L.push(`| ${r.receipt} | ${r.run} | ${ck(r.total)} | ${ck(r.date)} | ${ck(r.merchant)} | ${r.items ? `${r.items.tp}/${r.items.pred}/${r.items.want}` : '–'} | ${ck(r.passed)} | ${r.used ?? '–'} | ${s1(r.ms)} | ${s1(r.loadMs)} | ${r.env ?? ''} |`);
    }
  }
  if (warnings.length) L.push('', '## Miljø', '', ...warnings.map((w) => `- ${w}`));
  L.push('', 'Total/dato/butikk: riktige av målte. Linjer: navn omtrent likt og beløp eksakt, én-til-én. «Miljø» = kjøringer der Mac-OCR, modellen eller motoren manglet (telles ikke som modellfeil).',
    'For crossCheck: «Total» = LFM leste riktig total, «Besto» = godtok riktig total og flagget en feil total.');
  return `${L.join('\n')}\n`;
}

/** Fjerner alt som kan være kvitteringsinnhold fra én kjøring før den lagres (hviteliste). */
export function slimRun72(r) {
  const it = r.items ? { tp: r.items.tp, pred: r.items.pred, want: r.items.want, precision: r.items.precision, recall: r.items.recall } : null;
  return { receipt: String(r.receipt), combo: r.combo, run: r.run, env: r.env ?? null, total: r.total ?? null, date: r.date ?? null, merchant: r.merchant ?? null,
    merchantSource: r.merchantSource ?? null, items: it, passed: r.passed ?? null, used: r.used ?? null, confidence: r.confidence ?? null,
    failedFields: Array.isArray(r.failedFields) ? r.failedFields.filter((k) => /^[a-z_]{2,20}$/.test(k)) : [], ms: r.ms ?? null, loadMs: r.loadMs ?? null, modelCalls: r.modelCalls ?? null };
}
