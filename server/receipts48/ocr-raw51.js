// Prompt 51 (RCPTSRV51), Del D 11 og B 6: OCR-radene og motoren lagres per kvittering (fh_receipts.ocr48, felles OCR-format) –
// også i den gamle kjeden (opplasting → kø → finans/ai.js extract). Kvitteringsdetaljen viser dem som
// ocr_raw: {engine, engine_label, rows, image_size, ms, preprocess}.
// Den gamle kjeden leser bildet med en visjonsmodell (qwen2.5vl). Den skal aldri være eneste kilde: crossCheck51 leser originalen med
// Tesseract (forbehandlet) og sammenligner totalen; avvik eller manglende OCR gir lav sikkerhet og «til gjennomgang».
import { db } from '../finans/db.js';
import { tesseractOcr48 } from './engines/tesseract.js';
import { totalCandidates48 } from './validate.js';
import { ocrText48 } from './normalize.js';
import { resolveMerchant51 } from './brreg51.js';
import { r48Settings } from './settings.js';
import { ocrStore } from './routes.js';
import { lfmTotal72, ENGINE_LABELS72 } from './lfm72.js'; // prompt 72: ekstra totalkontroll med LFM (crossCheck72, av som standard)

const q = (sql) => db.prepare(sql);
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
export const ENGINE_LABELS51 = { mac_vision: 'Mac Vision', tesseract: 'Tesseract', ios_vision: 'iPhone (Vision)', android_mlkit: 'Android (ML Kit)' };

/** fh_receipts-raden → ocr_raw (eller null). */
export function ocrRaw51(r) {
  const o = parse(r?.ocr48);
  if (!o || !Array.isArray(o.rows)) return null;
  const rows = o.rows.length ? o.rows : String(o.full_text ?? '').split('\n').filter((x) => x.trim());
  return { engine: o.source ?? null, engine_label: ENGINE_LABELS51[o.source] ?? o.source ?? null, rows: rows.slice(0, 600).map(String), image_size: o.image_size ?? null, ms: o.ms ?? null, preprocess: o.preprocess ?? null };
}

/** Lagrer OCR-resultatet på kvitteringen (overskriver ikke en eksisterende OCR med mindre force). */
export function saveOcr51(id, ocr, { force = false } = {}) {
  if (!ocr) return false;
  const cur = q('SELECT ocr48 FROM fh_receipts WHERE id=?').get(id);
  if (!cur || (cur.ocr48 && !force)) return false;
  q('UPDATE fh_receipts SET ocr48=? WHERE id=?').run(ocrStore(ocr), id);
  return true;
}

/** Tekst fra den gamle Tesseract-reserven (raw_text) → felles OCR-format. */
export const ocrFromText51 = (text, extra = {}) => {
  const rows = String(text ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  return rows.length ? { source: 'tesseract', lines: rows.map((t) => ({ text: t, confidence: null, bbox: null })), rows, full_text: rows.join('\n'), image_size: null, ...extra } : null;
};

/**
 * Den gamle kjeden: res fra extract() → OCR lagres, totalen kontrolleres mot OCR og butikknavnet går gjennom rekkefølgen
 * org.nr. → kjent butikk → modellen. Endrer res.data (merchant, org_number, confidence, needs_review, merchant51, ocr51).
 * original: {buf, mime} (originalbildet – OCR kjøres aldri på 1600 px-kopien når originalen finnes).
 */
export async function crossCheck51(res, { id, user, original, fallback = null, log = () => {} } = {}) {
  const d = res?.data;
  if (!d) return res;
  let ocr = null;
  if (res.provider === 'tesseract' && d.raw_text) { ocr = ocrFromText51(d.raw_text); delete d.raw_text; }
  else if (original?.buf && /^image\//.test(original.mime ?? '') && r48Settings().tesseract) {
    try { ocr = await tesseractOcr48(original.buf, original.mime, { fallback }); log('ocr-kontroll', `Tesseract på originalen: ${ocr.rows.length} rader · ${ocr.ms} ms`); }
    catch (e) { log('ocr-kontroll', `Tesseract: ${e.message}`); }
  }
  if (ocr && id) saveOcr51(id, ocr, { force: true });
  const text = ocr ? ocrText48(ocr) : '';
  // B 6: en visjonsmodell alene er aldri nok – totalen må finnes i OCR-teksten.
  if (res.provider !== 'tesseract' && d.total != null) {
    if (!ocr) {
      d.needs_review = true;
      d.confidence = { ...(d.confidence ?? {}), total: Math.min(d.confidence?.total ?? 0.5, 0.5) };
      d.ocr51 = { check: 'no_ocr', note: 'Bare visjonsmodellen leste kvitteringen – sjekk beløpene' };
      log('ocr-kontroll', 'ingen OCR å sammenligne med: merket som usikker');
    } else {
      const totals = totalCandidates48(text);
      const agree = totals.some((t) => Math.abs(t - d.total) < 0.01) || text.replace(/\s/g, '').includes(Number(d.total).toFixed(2).replace('.', ','));
      d.ocr51 = { check: agree ? 'agree' : 'disagree', ocr_totals: totals.slice(0, 3) };
      if (!agree) { d.needs_review = true; d.confidence = { ...(d.confidence ?? {}), total: Math.min(d.confidence?.total ?? 0.5, 0.4) }; }
      log('ocr-kontroll', agree ? `OCR fant samme total (${d.total} kr)` : `OCR fant ikke totalen ${d.total} kr (OCR: ${totals.slice(0, 3).join(', ') || 'ingen'}) – til gjennomgang`);
    }
  }
  // Prompt 72: ekstra kontroll av totalen med en LFM-modell (crossCheck72 = lfm3vl | lfm25layout, av som standard). Kan bare gjøre
  // kvitteringen MER usikker (avvik → til gjennomgang), aldri fjerne en merknad fra OCR-kontrollen over.
  const cc72 = r48Settings().crossCheck72;
  if (cc72 && cc72 !== 'off' && d.total != null && original?.buf && /^image\//.test(original.mime ?? '')) {
    try {
      const t = await lfmTotal72(cc72, { image: original.buf, cfg: r48Settings() });
      const agree = t.total != null && t.totals.some((x) => Math.abs(x - d.total) < 0.01);
      d.ocr51 = { ...(d.ocr51 ?? { check: 'none' }), lfm72: { engine: cc72, model: t.model, agree, total: t.total } };
      if (!agree) { d.needs_review = true; d.confidence = { ...(d.confidence ?? {}), total: Math.min(d.confidence?.total ?? 0.5, 0.4) }; }
      log('lfm-kontroll', `${ENGINE_LABELS72[cc72]}: ${agree ? `samme total (${d.total} kr)` : `fant ${t.total ?? 'ingen total'} – til gjennomgang`}`);
    } catch (e) { log('lfm-kontroll', `${ENGINE_LABELS72[cc72]}: ${e.message}`); }
  }
  try {
    const m = resolveMerchant51({ user, receipt: { merchant: d.merchant, org_number: d.org_number }, ocrText: text, receiptId: id });
    d.merchant51 = { source: m.merchant_source, org_number: m.org_number, detail: m.detail, model_merchant: m.model_merchant };
    if (m.merchant && m.merchant !== d.merchant) { log('butikk', `${m.merchant} (${m.merchant_source}) i stedet for «${d.merchant ?? '–'}»`); d.merchant = m.merchant; }
    if (m.org_number) d.org_number = m.org_number;
  } catch (e) { log('butikk', `oppslaget feilet: ${e.message}`); }
  return res;
}
