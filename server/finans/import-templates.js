// Importmaler for kontoutskrifter (prompt 12): innebygde maler (DNB Excel, kortutskrift uten overskrift),
// overskrifter koblet til felt via synonymer, og AI-tolkning av ukjente formater. AI-en får overskriften og de
// første 5 radene og svarer med kolonnene; svaret lagres som en mal med kolonnesignatur, så neste fil med
// samme kolonner bruker malen uten AI.
import { createHash } from 'node:crypto';
import { db, me, perUserUnique } from './db.js';
import { askJson } from './ai.js';
import { bankRow } from './csv.js';
import { cleanDescription, splitRows } from './importer.js';

const q = (sql) => db.prepare(sql);

db.exec(`CREATE TABLE IF NOT EXISTS fh_import_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  signature TEXT NOT NULL UNIQUE,              -- normaliserte overskrifter skilt med «|», eller «nohead:<antall kolonner>»
  has_header INTEGER NOT NULL DEFAULT 1,
  mapping_json TEXT NOT NULL,                  -- {date, desc, in, out, amount, message, payee} → kolonneindeks
  date_format TEXT NOT NULL DEFAULT 'dmy',     -- dmy | mdy | ymd
  source TEXT NOT NULL DEFAULT 'ai',           -- ai | guess
  created INTEGER NOT NULL
)`);
// ISO2: lagrede maler er per bruker (samme kolonner kan ha forskjellige maler hos to brukere).
perUserUnique('fh_import_template', /signature TEXT NOT NULL UNIQUE/, 'signature TEXT NOT NULL', 'UNIQUE(user_id, signature)');

export const FIELDS = ['date', 'desc', 'in', 'out', 'amount', 'message', 'payee'];
export const FIELD_LABEL = { date: 'Dato', desc: 'Beskrivelse', in: 'Beløp inn', out: 'Beløp ut', amount: 'Beløp', message: 'Melding', payee: 'Mottaker' };
const SYN = {
  date: ['utført dato', 'transaksjonsdato', 'dato', 'bokført dato', 'bokføringsdato', 'bokført', 'date', 'transaction date'],
  desc: ['beskrivelse', 'forklaring', 'tekst', 'text', 'description', 'tittel'],
  in: ['beløp inn', 'inn på konto', 'innskudd', 'inn', 'godskrevet', 'credit'],
  out: ['beløp ut', 'ut fra konto', 'uttak', 'ut', 'belastet', 'debit'],
  amount: ['beløp', 'amount', 'beløp i nok', 'sum'],
  message: ['melding/kid/fakt.nr', 'melding', 'kid', 'message'],
  payee: ['mottakernavn', 'mottaker', 'avsender', 'navn'],
};
const VALUE = ['rentedato', 'valuteringsdato', 'valutadato', 'value date'];
const REF = ['arkivref', 'arkivreferanse', 'arkivref.', 'referanse', 'reference'];

export const BUILTIN = [
  { id: 'dnb', name: 'DNB · kontoutskrift (Excel)', builtin: true, hasHeader: true, sig: ['utført dato', 'beløp inn', 'beløp ut', 'melding/kid/fakt.nr'], dateFormat: 'dmy' },
  { id: 'kort', name: 'Kortutskrift · MM/DD/YY uten overskrift', builtin: true, hasHeader: false, cols: 5, mapping: { date: 0, desc: 1, out: 3, in: 4 }, dateFormat: 'mdy' },
];

const norm = (x) => String(x ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ---------------- Tekst → rader ---------------- */

export { splitRows };

/* ---------------- Verdier ---------------- */

// «-935.00», «5300.00», «11,616.00», «1 234,50», «−1.234,50 kr» → øre.
export function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  let t = String(v).replace(/[\s  ]/g, '').replace(/[−–]/g, '-').replace(/[^\d,.\-+]/g, '');
  if (!/\d/.test(t)) return null;
  const c = t.lastIndexOf(','), d = t.lastIndexOf('.');
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (c >= 0) t = /,\d{1,2}$/.test(t) && (t.match(/,/g).length === 1) ? t.replace(',', '.') : t.replace(/,/g, '');
  else if (d >= 0 && (t.match(/\./g).length > 1 || /\.\d{3}$/.test(t) && !/^-?\d{1,3}\.\d{3}$/.test(t))) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const DRE = /^\s*(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})(?:[ T].*)?$/;
export const isDate = (v) => DRE.test(String(v ?? ''));
const isNum = (v) => /^\s*[-−+]?[\d\s .,]*\d[\d\s .,]*\s*$/.test(String(v ?? '')) && !isDate(v);

export function parseDate(v, fmt = 'dmy') {
  const m = String(v ?? '').match(DRE);
  if (!m) return null;
  let [, a, b, c] = m;
  let y, mo, d;
  if (a.length === 4) [y, mo, d] = [+a, +b, +c];
  else {
    y = c.length === 2 ? 2000 + +c : +c;
    [d, mo] = fmt === 'mdy' ? [+b, +a] : [+a, +b];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
  }
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// «REMA 1000 MAJORSTUEN» → «Rema 1000 Majorstuen». Selskapsformer beholdes med store bokstaver.
export function titleCase(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase() || !/\p{Lu}{3}/u.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s.\-/(])(\p{L})/gu, (_, p, ch) => p + ch.toUpperCase()).replace(/\b(As|Asa|Ab|Ag|Nv|Ab|Sa|Ltd|Dnb|Nok|Ica)\b/g, (x) => x.toUpperCase());
}

/* ---------------- Formatgjenkjenning ---------------- */

export function headMap(head) {
  const H = head.map(norm), mp = {}, used = new Set();
  for (const k of FIELDS) {
    for (const s of SYN[k]) { const i = H.findIndex((x, j) => x === s && !used.has(j)); if (i >= 0) { mp[k] = i; used.add(i); break; } }
  }
  // Delvis treff («Beløp i NOK», «Ut fra konto (NOK)») når eksakt treff mangler.
  for (const k of ['date', 'desc', 'amount']) {
    if (mp[k] != null) continue;
    for (const s of SYN[k]) { const i = H.findIndex((x, j) => x.includes(s) && !used.has(j)); if (i >= 0) { mp[k] = i; used.add(i); break; } }
  }
  return mp;
}
const okMap = (mp) => mp.date != null && (mp.desc != null || mp.payee != null) && (mp.in != null || mp.out != null || mp.amount != null);
const sigOf = (head) => head.map(norm).filter(Boolean).join('|');

// Datoformat ut fra verdiene: en første del over 12 betyr DD.MM, en andre del over 12 betyr MM/DD.
function guessDateFmt(data, col) {
  const vals = data.slice(0, 30).map((r) => String(r[col] ?? '').match(DRE)).filter(Boolean);
  if (vals.some((m) => m[1].length === 4)) return 'ymd';
  if (vals.some((m) => +m[2] > 12)) return 'mdy';
  if (vals.some((m) => +m[1] > 12)) return 'dmy';
  return vals.some((m) => String(data[0]?.[col] ?? '').includes('/')) ? 'mdy' : 'dmy';
}

// Reserve når AI ikke svarer: dato = kolonnen der alt er datoer, beskrivelse = lengste tekstkolonne, beløp = tallkolonnene.
export function guessMapping(data) {
  const S = data.slice(0, 8), W = Math.max(0, ...S.map((r) => r.length)), cols = [...Array(W).keys()], mp = {};
  const filled = (i) => S.filter((r) => String(r[i] ?? '').trim());
  const all = (i, fn) => filled(i).length > 0 && filled(i).every((r) => fn(r[i]));
  mp.date = cols.find((i) => all(i, isDate));
  const nums = cols.filter((i) => i !== mp.date && all(i, isNum));
  const txt = cols.filter((i) => i !== mp.date && !nums.includes(i)).map((i) => [i, S.reduce((a, r) => a + String(r[i] ?? '').length, 0)]).sort((a, b) => b[1] - a[1]);
  if (txt[0]) mp.desc = txt[0][0];
  if (nums.length === 1) mp.amount = nums[0];
  else if (nums.length >= 2) {
    const neg = nums.find((i) => S.some((r) => /^\s*[-−]/.test(String(r[i] ?? ''))));
    // Én kolonne med negative tall er et fortegnsbeløp; ellers er de to siste ut og inn.
    if (neg != null && nums.filter((i) => filled(i).length === S.length).includes(neg)) mp.amount = neg;
    else { mp.out = nums[nums.length - 2]; mp.in = nums[nums.length - 1]; }
  }
  return { mapping: mp, dateFormat: mp.date != null ? guessDateFmt(data, mp.date) : 'dmy' };
}

const AI_SCHEMA = {
  type: 'object',
  properties: {
    date_col: { type: 'integer' }, desc_col: { type: 'integer', nullable: true }, in_col: { type: 'integer', nullable: true },
    out_col: { type: 'integer', nullable: true }, amount_col: { type: 'integer', nullable: true }, date_format: { type: 'string' },
  },
  required: ['date_col', 'date_format'],
};
// Prompt 48 (PRIV48): task 'import' (finansoppgave) – med «Finansdata forlater aldri huset» på brukes bare lokal Ollama.
const askImport = (prompt) => askJson(prompt, AI_SCHEMA, { timeout: 30_000, task: 'import' });
let aiImpl = askImport;
export const _setAi = (fn) => { aiImpl = fn ?? askImport; };

async function aiMapping(head, data) {
  const W = Math.max(head?.length ?? 0, ...data.slice(0, 5).map((r) => r.length));
  const lines = [head ? `Overskrift: ${JSON.stringify(head)}` : 'Filen har ingen overskriftsrad.', ...data.slice(0, 5).map((r, i) => `Rad ${i + 1}: ${JSON.stringify(r)}`)].join('\n');
  const x = await aiImpl(`Dette er starten på en kontoutskrift fra en bank, som rader med celler (kolonnene er nummerert fra 0). Finn hvilke kolonner som er transaksjonsdato, beskrivelse, beløp inn, beløp ut eller ett beløp med fortegn. Returner KUN JSON: {date_col, desc_col, in_col, out_col, amount_col, date_format} der kolonnene er tall (0–${W - 1}) eller null, og date_format er "dmy", "mdy" eller "ymd".\n${lines}`);
  const col = (v) => (Number.isInteger(v) && v >= 0 && v < W ? v : null);
  const mp = { date: col(x.date_col), desc: col(x.desc_col), in: col(x.in_col), out: col(x.out_col), amount: col(x.amount_col) };
  for (const k of Object.keys(mp)) if (mp[k] == null) delete mp[k];
  return { mapping: mp, dateFormat: ['dmy', 'mdy', 'ymd'].includes(x.date_format) ? x.date_format : guessDateFmt(data, mp.date ?? 0) };
}

const tplRow = (r) => r && { id: r.id, name: r.name, builtin: false, ai: r.source === 'ai', hasHeader: !!r.has_header, signature: r.signature, mapping: JSON.parse(r.mapping_json), dateFormat: r.date_format, created: r.created };
export const savedTemplates = (u = me()) => q('SELECT * FROM fh_import_template WHERE user_id=? ORDER BY created').all(u).map(tplRow);
export const deleteTemplate = (id, u = me()) => q('DELETE FROM fh_import_template WHERE id=? AND user_id=?').run(+id, u).changes > 0;
const savedBySig = (sig) => q('SELECT * FROM fh_import_template WHERE signature=? AND user_id=?').get(sig, me());
export function listTemplates() {
  return [...BUILTIN.map((t) => ({ id: t.id, name: t.name, builtin: true, hasHeader: t.hasHeader })), ...savedTemplates()];
}

// Finner formatet til radene: lagret mal → innebygd mal → kolonnenavn → AI (lagres som mal) → gjetning.
// Svarer {template:{id,name,builtin,ai,source}, mapping, dateFormat, headerIndex, headers, data}.
export async function detectFormat(rows, { ai = true, save = true } = {}) {
  let hi = -1, best = 0;
  rows.slice(0, 6).forEach((r, i) => { const n = Object.keys(headMap(r)).length; if (n > best && !r.some(isDate)) { best = n; hi = i; } });
  if (best >= 2) {
    const head = rows[hi].map((h) => String(h ?? '').trim()), sig = sigOf(head), data = rows.slice(hi + 1);
    const saved = tplRow(savedBySig(sig));
    if (saved) return { template: { ...saved, source: 'saved' }, mapping: saved.mapping, dateFormat: saved.dateFormat, headerIndex: hi, headers: head, data };
    const mp = headMap(head), H = head.map(norm);
    const bi = BUILTIN.find((t) => t.hasHeader && t.sig.every((x) => H.includes(x)));
    if (bi && okMap(mp)) return { template: { id: bi.id, name: bi.name, builtin: true, source: 'builtin' }, mapping: mp, dateFormat: guessDateFmt(data, mp.date) === 'mdy' ? 'mdy' : bi.dateFormat, headerIndex: hi, headers: head, data };
    if (okMap(mp)) return { template: { id: null, name: 'Gjenkjent fra kolonnenavn', builtin: false, source: 'head' }, mapping: mp, dateFormat: guessDateFmt(data, mp.date), headerIndex: hi, headers: head, data };
    return unknown(head, data, hi, sig, mp, { ai, save });
  }
  // Ukjente overskrifter: første rad har ingen datoer eller tall, men radene under har datoer.
  if (rows.length > 1 && !rows[0].some((x) => isDate(x) || isNum(x)) && rows.slice(1, 4).some((r) => r.some(isDate))) {
    const head = rows[0].map((h) => String(h ?? '').trim()), sig = sigOf(head);
    const saved = tplRow(savedBySig(sig));
    if (saved) return { template: { ...saved, source: 'saved' }, mapping: saved.mapping, dateFormat: saved.dateFormat, headerIndex: 0, headers: head, data: rows.slice(1) };
    return unknown(head, rows.slice(1), 0, sig, headMap(head), { ai, save });
  }
  const W = rows[0]?.length ?? 0, first = rows[0] ?? [];
  const bi = BUILTIN.find((t) => !t.hasHeader && t.cols === W && /^\d{1,2}\/\d{1,2}\/\d{2}$/.test(String(first[0] ?? '').trim()));
  if (bi) return { template: { id: bi.id, name: bi.name, builtin: true, source: 'builtin' }, mapping: bi.mapping, dateFormat: bi.dateFormat, headerIndex: -1, headers: null, data: rows };
  const sig = `nohead:${W}`;
  const saved = tplRow(savedBySig(sig));
  if (saved) return { template: { ...saved, source: 'saved' }, mapping: saved.mapping, dateFormat: saved.dateFormat, headerIndex: -1, headers: null, data: rows };
  return unknown(null, rows, -1, sig, {}, { ai, save });
}

async function unknown(head, data, hi, sig, partial, { ai, save }) {
  let g = null, source = 'guess';
  if (ai) { try { g = await aiMapping(head, data); source = 'ai'; if (!okMap({ ...g.mapping, ...partial })) g = null; } catch { g = null; } }
  if (!g) { g = guessMapping(data); source = 'guess'; }
  const mapping = { ...g.mapping, ...partial };
  const label = head ? head.filter(Boolean).slice(0, 2).join(', ') || `${head.length} kolonner` : `${Math.max(0, ...data.slice(0, 5).map((r) => r.length))} kolonner uten overskrift`;
  const name = `${source === 'ai' ? '✦ AI-mal' : 'Gjettet mal'} · ${label}`;
  let id = null;
  if (save && okMap(mapping) && data.some((r) => isDate(r[mapping.date]))) {
    id = q(`INSERT INTO fh_import_template(name,signature,has_header,mapping_json,date_format,source,created,user_id) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id, signature) DO UPDATE SET mapping_json=excluded.mapping_json, date_format=excluded.date_format RETURNING id`)
      .get(name, sig, head ? 1 : 0, JSON.stringify(mapping), g.dateFormat, source, Date.now(), me()).id;
  }
  return { template: { id, name, builtin: false, ai: source === 'ai', source }, mapping, dateFormat: g.dateFormat, headerIndex: hi, headers: head, data };
}

/* ---------------- Rader → transaksjoner ---------------- */

// Samme form som rowsToTx: {date, amount (øre), raw, description, external_id, bank}.
export function applyFormat(F, accountId = 0) {
  const { mapping: mp, dateFormat, headers, headerIndex } = F;
  const cell = (r, k) => (mp[k] != null ? String(r[mp[k]] ?? '').replace(/\s+/g, ' ').trim() : '');
  const hdr = headers ?? Array.from({ length: Math.max(0, ...F.data.map((r) => r.length)) }, (_, i) => `Kolonne ${i + 1}`);
  const H = hdr.map(norm);
  const ix = { date: mp.date ?? -1, text: mp.desc ?? mp.payee ?? -1, value: H.findIndex((h) => VALUE.includes(h)), ref: H.findIndex((h) => REF.includes(h)) };
  const seen = new Map(), out = [], skipped = [];
  F.data.forEach((r, n) => {
    const date = parseDate(cell(r, 'date'), dateFormat);
    const i = parseNum(cell(r, 'in')), o = parseNum(cell(r, 'out')), a = parseNum(cell(r, 'amount'));
    const amount = i ? Math.abs(i) : o ? -Math.abs(o) : a || null;
    const desc = cell(r, 'desc') || cell(r, 'payee'), msg = cell(r, 'message');
    if (!date || !amount || !desc) { if (r.some((x) => String(x ?? '').trim())) skipped.push(n + headerIndex + 2); return; }
    const raw = (desc + (msg && msg !== desc ? ' · ' + msg : '')).slice(0, 200);
    const key = `${accountId}|${date}|${amount}|${desc}`;
    const k = (seen.get(key) ?? 0) + 1; seen.set(key, k);
    out.push({ date, amount, raw, description: cleanDescription(titleCase(desc)).slice(0, 120), message: msg || null,
      external_id: 'imp:' + createHash('sha1').update(`${key}|${k}`).digest('hex').slice(0, 24),
      bank: bankRow(hdr, r, ix, { amount: amount / 100, message: msg || null }) });
  });
  return { rows: out, skipped };
}

// Visning: hvilke kolonner som er koblet til hvilke felt.
export function describe(F) {
  return {
    template: { id: F.template.id, name: F.template.name, builtin: !!F.template.builtin, ai: F.template.source === 'ai', source: F.template.source },
    mapping: Object.fromEntries(FIELDS.filter((k) => F.mapping[k] != null).map((k) => [k, F.mapping[k]])),
    columns: FIELDS.filter((k) => F.mapping[k] != null).map((k) => ({ field: k, label: FIELD_LABEL[k], column: F.headers ? String(F.headers[F.mapping[k]] ?? '').trim() || `kolonne ${F.mapping[k] + 1}` : `kolonne ${F.mapping[k] + 1}` })),
    dateFormat: F.dateFormat, headers: F.headers,
  };
}

export async function importRows(rows, accountId = 0, opts = {}) {
  if (!rows.length) return { rows: [], skipped: [], format: null };
  const F = await detectFormat(rows, opts);
  return { ...applyFormat(F, accountId), format: describe(F), sample: F.data.slice(0, 5) };
}
