// Prompt 48 (SERVER48): brukerens rettelser som testdata for eval. Lagres per bruker i receipt_corrections48 (modellens
// svar + rettelsen + OCR-radene + veien kvitteringen tok), aldri i repoet. Admin kan eksportere alt som JSONL.
//   - automatisk når en kvittering fra /receipts/scan bokføres med andre verdier enn modellen ga (butikk, dato, total, kategori)
//   - eksplisitt med POST /finans/api/receipts/:id/corrections {receipt:<felles format>} fra redigeringsskjemaet
import { createHash } from 'node:crypto';
import { db } from '../finans/db.js';
import { fromLegacy48 } from './normalize.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS receipt_corrections48 (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, receipt_id TEXT, created INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'edit',
  source TEXT, used_step TEXT, engine TEXT, model TEXT, fields TEXT, model_json TEXT, corrected_json TEXT, ocr_json TEXT, pipeline_json TEXT);
CREATE INDEX IF NOT EXISTS receipt_corrections48_user ON receipt_corrections48(user_id, created);`);

const parse = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const FIELDS = ['merchant', 'org_number', 'date', 'time', 'currency', 'total', 'subtotal', 'payment_method', 'category_suggestion'];
const same = (a, b) => (typeof a === 'number' || typeof b === 'number' ? Math.abs((+a || 0) - (+b || 0)) < 0.005 && (a == null) === (b == null) : String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase());
/** Feltene som er endret (toppnivå + items/discounts/vat som helhet). */
export function changedFields48(model, corrected) {
  const out = FIELDS.filter((k) => corrected?.[k] !== undefined && !same(model?.[k], corrected[k]));
  for (const k of ['items', 'discounts', 'vat']) if (corrected?.[k] !== undefined && JSON.stringify(model?.[k] ?? []) !== JSON.stringify(corrected[k])) out.push(k);
  return out;
}
/** Modellens svar for en lagret kvittering: receipt48.model_receipt, ellers extraction oversatt til felles format. */
export function modelReceiptOf48(r) {
  const ex = parse(r?.extraction);
  return ex?.receipt48?.model_receipt ?? fromLegacy48(ex);
}

/** Lagrer én rettelse. Ingen endring → null. */
export function recordCorrection48(userId, r, corrected, kind = 'edit') {
  const model = modelReceiptOf48(r);
  if (!model || !corrected) return null;
  const fields = changedFields48(model, corrected);
  if (!fields.length) return null;
  const ex = parse(r.extraction), meta = ex?.receipt48 ?? parse(r.meta)?.scan48 ?? {};
  const row = q(`INSERT INTO receipt_corrections48(user_id,receipt_id,created,kind,source,used_step,engine,model,fields,model_json,corrected_json,ocr_json,pipeline_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(userId, r.id, Date.now(), kind, r.source ?? null, meta.used ?? null, meta.engine ?? null, r.model ?? meta.model ?? null,
    JSON.stringify(fields), JSON.stringify(model), JSON.stringify({ ...model, ...corrected }), r.ocr48 ?? null, meta.pipeline ? JSON.stringify(meta.pipeline) : null);
  return { id: row.id, fields };
}

/** Ved bokføring: det brukeren endte med (kvitteringsraden) mot modellens svar. Bare kvitteringer fra den nye kjeden. */
export function correctionOnBook48(userId, r, categoryName = null) {
  if (r?.source !== 'scan48') return null;
  const corrected = { merchant: r.merchant ?? '', date: r.date ?? '', total: r.total != null ? r.total / 100 : null, ...(categoryName ? { category_suggestion: categoryName } : {}) };
  return recordCorrection48(userId, r, corrected, 'book');
}

const out = (x, { withUser = false } = {}) => ({ id: x.id, ...(withUser ? { user: createHash('sha256').update(`r48:${x.user_id}`).digest('hex').slice(0, 12) } : {}), receiptId: x.receipt_id,
  created: new Date(x.created).toISOString(), kind: x.kind, source: x.source, usedStep: x.used_step, engine: x.engine, model: x.model, fields: parse(x.fields, []),
  modelAnswer: parse(x.model_json), corrected: parse(x.corrected_json), ocr: parse(x.ocr_json), pipeline: parse(x.pipeline_json) });
export const listCorrections48 = (userId, limit = 100) => q('SELECT * FROM receipt_corrections48 WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, Math.min(1000, Math.max(1, limit))).map((x) => out(x));
/** Admin-eksport for eval: alle brukere, brukeren som en kort hash (ikke id), eldste først. → JSONL-tekst */
export const exportCorrections48 = () => q('SELECT * FROM receipt_corrections48 ORDER BY id').all().map((x) => JSON.stringify(out(x, { withUser: true }))).join('\n');
