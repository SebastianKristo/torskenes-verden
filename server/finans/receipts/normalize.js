// Prompt 48 (SERVER48): normalisering av beløp, OCR-formatet (rows-gruppering) og oversetting mellom det felles
// kvitteringsformatet (items/unit_price/discounts.description/category_suggestion, bbox 0–1) og formen som lagres i
// fh_receipts.extraction i dag (validate() i finans/ai.js: lines/unitPrice/discounts.text/suggested_category, bbox i prosent).

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Norsk beløp → tall (kroner, to desimaler) eller null.
 * «24,90» «24.90» «1 299,00» «kr 1.299,00» «-10,00» «−10,00» «10,00-» «24,-» «NOK 99» «1.299» (tusenskille).
 */
export function amount48(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/[   ]/g, ' ').replace(/[−–—]/g, '-').trim();
  s = s.replace(/^(?:kr\.?|nok)\s*/i, '').replace(/\s*(?:kr\.?|nok)$/i, '').trim();
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1).trim(); }
  if (/[.,]-$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('-')) { neg = true; s = s.slice(0, -1).trim(); }
  if (!/^\d[\d .,']*$/.test(s)) return null;
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const intPart = (m ? m[1] : s).replace(/[ .,']/g, '');
  if (!/^\d+$/.test(intPart)) return null;
  const n = Number(`${intPart}.${m ? m[2].padEnd(2, '0') : '00'}`);
  return Number.isFinite(n) ? round2(neg ? -n : n) : null;
}
/** Tall som kan komme som tekst fra modellen eller klienten; null/'' → null. */
export const num48 = (v) => (v === null || v === undefined || v === '' ? null : amount48(typeof v === 'string' ? v : Number(v)));

/* ---------------- OCR-formatet ---------------- */

/**
 * Radgruppering (samme regel som klientene og Mac-tjenesten): linjer med overlappende y-intervall havner på samme rad
 * (overlappen må være minst halvparten av den laveste linjens høyde, så skjeve kvitteringer ikke smelter sammen),
 * sortert på x og slått sammen med mellomrom. Linjer uten bbox blir egne rader i den rekkefølgen de kom.
 */
export function rows48(lines) {
  const withBox = [], rows = [];
  (lines ?? []).forEach((l, i) => {
    const t = String(l?.text ?? '').trim();
    if (!t) return;
    const b = Array.isArray(l.bbox) && l.bbox.length === 4 && l.bbox.every(Number.isFinite) ? l.bbox : null;
    if (b) withBox.push({ t, x: b[0], top: b[1], bot: b[1] + b[3], h: b[3], i }); else rows.push({ key: i, parts: [{ t, x: 0 }] });
  });
  withBox.sort((a, b) => (a.top + a.bot) / 2 - (b.top + b.bot) / 2 || a.x - b.x);
  const groups = [];
  for (const w of withBox) {
    const g = groups.find((r) => Math.min(r.bot, w.bot) - Math.max(r.top, w.top) >= 0.5 * Math.min(r.minH, w.h || 1e-9));
    if (g) { g.parts.push(w); g.top = Math.min(g.top, w.top); g.bot = Math.max(g.bot, w.bot); g.minH = Math.min(g.minH, w.h); }
    else groups.push({ parts: [w], top: w.top, bot: w.bot, minH: w.h, key: w.i });
  }
  groups.sort((a, b) => a.top - b.top);
  const out = groups.map((g) => g.parts.sort((a, b) => a.x - b.x).map((p) => p.t).join(' '));
  // Linjer uten bbox kommer til slutt (eller alene når ingen har bbox).
  return [...out, ...rows.map((r) => r.parts[0].t)];
}

export const SOURCE_ALIASES48 = { 'ios-vision': 'ios_vision', ios_vision: 'ios_vision', 'android-mlkit': 'android_mlkit', android_mlkit: 'android_mlkit', 'mac-vision': 'mac_vision', mac_vision: 'mac_vision', tesseract: 'tesseract' };
const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

/**
 * OCR-resultat fra en klient/motor → felles OCR-format. Godtar bindestrek-kildene fra prompt 47, regner ut rows når de
 * mangler (fra bbox) og full_text fra rows. Validering mot schemaet gjøres etterpå (schema.js).
 */
export function normalizeOcr48(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
  const lines = Array.isArray(x.lines) ? x.lines.map((l) => (typeof l === 'string' ? { text: clean(l) } : l && typeof l === 'object' ? { ...l, text: clean(l.text) } : l)) : x.lines;
  const rows = Array.isArray(x.rows) ? x.rows.map((r) => (typeof r === 'string' ? clean(r).replace(/\t/g, ' ').trim() : r)) : Array.isArray(lines) ? rows48(lines) : x.rows;
  const full = typeof x.full_text === 'string' ? clean(x.full_text) : typeof x.text === 'string' ? clean(x.text) : Array.isArray(rows) ? rows.join('\n') : x.full_text;
  return { ...x, source: SOURCE_ALIASES48[x.source] ?? x.source, lines: lines ?? [], rows: rows ?? [], full_text: full ?? '' };
}
/** Teksten modellen og regexene skal lese: rows (vare og pris på samme rad), ellers full_text. */
export const ocrText48 = (ocr) => (ocr ? (ocr.rows?.length ? ocr.rows.join('\n') : String(ocr.full_text ?? '')) : '');

/* ---------------- Kvitteringsformatet ---------------- */

const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);

/** Klientens eller modellens svar → felles kvitteringsformat med riktige typer (beløp som tall, rabatter negative). */
export function normalizeReceipt48(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const items = (Array.isArray(x.items) ? x.items : []).filter((i) => i && typeof i === 'object').map((i) => ({
    description: str(i.description ?? i.name ?? i.text, 200) ?? '', quantity: num48(i.quantity ?? i.qty), unit_price: num48(i.unit_price ?? i.unitPrice), amount: num48(i.amount ?? i.price),
  })).filter((i) => i.amount !== null);
  const discounts = (Array.isArray(x.discounts) ? x.discounts : []).filter((d) => d && typeof d === 'object').map((d) => ({ description: str(d.description ?? d.text, 200) ?? '', amount: num48(d.amount) }))
    .filter((d) => d.amount !== null && d.amount !== 0).map((d) => ({ ...d, amount: -Math.abs(d.amount) }));
  const vat = (Array.isArray(x.vat) ? x.vat : []).filter((v) => v && typeof v === 'object').map((v) => ({ rate: num48(v.rate), amount: num48(v.amount) })).filter((v) => v.rate !== null && v.amount !== null);
  const cur = str(x.currency, 3)?.toUpperCase();
  return {
    merchant: str(x.merchant, 120) ?? '', org_number: x.org_number == null ? null : String(x.org_number).replace(/\D/g, '') || null,
    date: str(x.date, 20) ?? '', time: str(x.time, 8) || null, currency: cur && /^[A-Z]{3}$/.test(cur) ? cur : 'NOK',
    items, discounts, subtotal: num48(x.subtotal), vat, total: num48(x.total), payment_method: str(x.payment_method, 40) || null,
    category_suggestion: str(x.category_suggestion, 80) ?? '',
  };
}

const CONF = { high: 0.95, medium: 0.75, low: 0.4 };
/**
 * Felles format → validate()-formen som lagres i fh_receipts.extraction (bbox i prosent). confidence = high/medium/low
 * gir tallene merchant/date/total; failed_fields senker feltene som feilet.
 */
export function toLegacy48(r, { confidence = 'medium', failed = [], bboxes = [] } = {}) {
  const c = CONF[confidence] ?? CONF.medium, f = new Set(failed);
  const conf = (k) => (f.has(k) ? Math.min(c, 0.4) : c);
  return {
    merchant: r.merchant || null, org_number: r.org_number ?? null, date: r.date || null, time: r.time ?? null, currency: r.currency || 'NOK',
    total: r.total, subtotal: r.subtotal ?? null, vat: (r.vat ?? []).map((v) => ({ rate: v.rate, amount: v.amount })),
    lines: (r.items ?? []).map((i, k) => ({ description: i.description, name: i.description, quantity: i.quantity ?? null, qty: i.quantity ?? null, unitPrice: i.unit_price ?? null, amount: i.amount,
      ...(bboxes[k] ? { bbox: bboxes[k].map((v) => Math.round(v * 10000) / 100) } : {}) })),
    discounts: (r.discounts ?? []).map((d) => ({ text: d.description, amount: Math.abs(d.amount) })), pant: 0,
    payment_method: r.payment_method ?? null, suggested_category: r.category_suggestion || null,
    confidence: { merchant: conf('merchant'), date: conf('date'), total: conf('total') },
  };
}
/** Lagret extraction (validate()-form) → felles format (bbox ut som 0–1). Pant blir en egen varelinje. */
export function fromLegacy48(ex) {
  if (!ex || typeof ex !== 'object') return null;
  const items = (ex.lines ?? []).map((l) => ({ description: String(l.description ?? l.name ?? ''), quantity: l.quantity ?? (l.qty && l.qty !== 1 ? l.qty : null), unit_price: l.unitPrice ?? null, amount: l.amount }));
  if (+ex.pant > 0) items.push({ description: 'Pant', quantity: null, unit_price: null, amount: +ex.pant });
  return {
    merchant: ex.merchant ?? '', org_number: ex.org_number ?? null, date: ex.date ?? '', time: ex.time ?? null, currency: ex.currency ?? 'NOK', items,
    discounts: (ex.discounts ?? []).map((d) => ({ description: d.text ?? d.description ?? '', amount: -Math.abs(+d.amount || 0) })),
    subtotal: ex.subtotal ?? null, vat: ex.vat ?? [], total: ex.total ?? null, payment_method: ex.payment_method ?? null, category_suggestion: ex.suggested_category ?? '',
  };
}

const normTxt = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå]+/g, ' ').trim();
/** bbox (0–1) per varelinje: første ubrukte OCR-linje som inneholder varenavnet. Brukes til markering i appen. */
export function itemBoxes48(items, ocr) {
  if (ocr?.cropped) return (items ?? []).map(() => null); // Mac-OCR med beskjæring: bbox gjelder ikke originalbildet
  const lines = (ocr?.lines ?? []).filter((l) => Array.isArray(l.bbox) && l.bbox.length === 4).map((l) => ({ n: normTxt(l.text), bbox: l.bbox }));
  const used = new Set();
  return (items ?? []).map((i) => {
    const d = normTxt(i.description);
    if (d.length < 3) return null;
    const k = lines.findIndex((l, j) => !used.has(j) && l.n.includes(d));
    if (k < 0) return null;
    used.add(k);
    return lines[k].bbox;
  });
}
