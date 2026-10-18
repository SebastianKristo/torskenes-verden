// Lokal OCR-reserve for kvitteringer (uten AI): Tesseract (nor+eng) og regex for norske kvitteringer.
// Brukes når alle AI-motorene feiler, og valgfritt når AI-svaret har lav sikkerhet. Alt skjer i containeren.
// Bildet forbehandles med ImageMagick når det finnes (gråtoner, støy, skjevhet, adaptiv terskel); ellers går det rett til Tesseract.
import { execFile } from 'node:child_process';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, { timeout = 60_000, input } = {}) => new Promise((resolve, reject) => {
  const p = execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout)));
  if (input) p.stdin.end(input);
});

// Finnes verktøyene? Sjekkes én gang (og på nytt etter 10 min hvis de manglet).
const tools = { at: 0, tesseract: null, magick: null, zbar: null };
export async function ocrTools() {
  if (tools.at && (tools.tesseract || Date.now() - tools.at < 10 * 60_000)) return tools;
  const ver = async (cmd, args) => { try { return (await run(cmd, args, { timeout: 5000 })).split('\n')[0].trim() || cmd; } catch { return null; } };
  tools.tesseract = await ver('tesseract', ['--version']);
  tools.magick = (await ver('magick', ['-version'])) ? 'magick' : (await ver('convert', ['-version'])) ? 'convert' : null;
  tools.zbar = await ver('zbarimg', ['--version']);
  tools.at = Date.now();
  return tools;
}
export const _setTools = (t) => Object.assign(tools, { at: Date.now() }, t);

/** Av/på: innstillingen (ocrFallback) overstyrer miljøvariabelen OCR_FALLBACK (standard på). */
export function ocrEnabled(st = {}) {
  if (typeof st.ocrFallback === 'boolean') return st.ocrFallback;
  return !/^(0|off|false|no|nei)$/i.test(String(process.env.OCR_FALLBACK ?? 'on'));
}

/* ---------------- Regex for norske kvitteringer ---------------- */

const BELOP = String.raw`(\d{1,3}(?:[ . ]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})|\d+,-)`;
const TOTAL_KEYS = String.raw`(?:å\s*betale|a\s*betale|totalt?|total\s*nok|sum(?:\s*nok)?|beløp|bel[o0]p|til\s*betaling|betalt|kortbetaling)`;
const RE_TOTAL = new RegExp(TOTAL_KEYS + String.raw`[^\d\n]{0,20}` + BELOP, 'gi');
const RE_ALL = new RegExp(BELOP, 'g');
const RE_DATE = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/g;
const RE_ISO = /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/;
const RE_VAT = new RegExp(String.raw`mva(?:[^\d\n]{0,6}(\d{1,2})\s*%)?[^\d\n]{0,20}` + BELOP, 'i');
const RE_ORG = /(?:org\.?\s*n(?:r|o)\.?|organisasjonsn(?:r|ummer)|foretaksreg\w*|\bNO)\s*[:.]?\s*(\d{3})[\s.]?(\d{3})[\s.]?(\d{3})(?:\s*MVA)?/gi;
const RE_ORG_LOOSE = /(?<!\d)(\d{3})[\s.]?(\d{3})[\s.]?(\d{3})(?!\d)/g;
// «Å betale» slår «Til betaling», som slår «Betalt», «Total» og «Sum».
const PRIORITY = ['betale', 'til betaling', 'betalt', 'kortbetaling', 'total', 'sum', 'beløp', 'belop'];

export function toAmount(s) {
  let t = String(s ?? '').replace(/ /g, ' ').trim();
  if (t.endsWith(',-')) t = t.slice(0, -2);
  const m = t.match(/^(.*?)[.,](\d{2})$/);
  t = m ? `${m[1].replace(/[ .,]/g, '')}.${m[2]}` : t.replace(/[ .,]/g, '');
  const v = parseFloat(t);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** Brønnøysund: MOD11 med vektene 3,2,7,6,5,4,3,2. Organisasjonsnummer begynner på 8 eller 9. */
export function mod11Ok(nr) {
  if (!/^[89]\d{8}$/.test(nr)) return false;
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  const rest = w.reduce((s, v, i) => s + v * +nr[i], 0) % 11;
  const k = rest === 0 ? 0 : 11 - rest;
  return k !== 10 && k === +nr[8];
}

function findTotal(text) {
  const cands = [];
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(RE_TOTAL)) {
      const v = toAmount(m[1]);
      if (v == null) continue;
      const low = line.toLowerCase();
      const rank = PRIORITY.findIndex((k) => low.includes(k));
      cands.push([rank < 0 ? PRIORITY.length : rank, v]);
    }
  }
  if (cands.length) {
    cands.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    return [cands[0][1], cands[0][0] < 4 ? 0.8 : 0.65];
  }
  // Uten nøkkelord er totalen ofte det største beløpet.
  const all = [...text.matchAll(RE_ALL)].map((m) => toAmount(m[1])).filter((v) => v && v < 1_000_000);
  return all.length ? [Math.max(...all), 0.35] : [null, 0];
}
function findOrg(text) {
  for (const re of [RE_ORG, RE_ORG_LOOSE]) for (const m of text.matchAll(re)) { const nr = m[1] + m[2] + m[3]; if (mod11Ok(nr)) return nr; }
  return null;
}
function findDate(text) {
  const iso = text.match(RE_ISO);
  if (iso && +iso[2] >= 1 && +iso[2] <= 12 && +iso[3] >= 1 && +iso[3] <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  for (const [, d, mo, y0] of text.matchAll(RE_DATE)) {
    const y = y0.length === 2 ? 2000 + +y0 : +y0;
    const dt = new Date(Date.UTC(y, +mo - 1, +d));
    if (y >= 2000 && y <= 2100 && dt.getUTCMonth() === +mo - 1 && dt.getUTCDate() === +d) return dt.toISOString().slice(0, 10);
  }
  return null;
}
function findStore(text) {
  for (const line of text.split('\n').slice(0, 6)) {
    const t = line.replace(/^[\s*\-=#]+|[\s*\-=#]+$/g, '');
    if (t.length >= 3 && (t.match(/\p{L}/gu) ?? []).length >= 3 && !/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(t)) return t.slice(0, 60);
  }
  return null;
}

/**
 * Tekst fra Tesseract → samme form som AI-svaret (validate() i finans/ai.js tåler det).
 * Sikkerheten er alltid lav nok til at kvitteringen havner til gjennomgang.
 */
export function parseReceiptText(text) {
  const t = String(text ?? '').replace(/\r/g, '');
  const [total, conf] = findTotal(t);
  const vatM = t.match(RE_VAT), vatAmount = vatM ? toAmount(vatM[2]) : null, vatRate = vatM?.[1] ? +vatM[1] : 25;
  const merchant = findStore(t), date = findDate(t);
  return {
    merchant, org_number: findOrg(t), date, total, currency: 'NOK',
    vat: vatAmount != null ? [{ rate: vatRate, amount: vatAmount }] : [],
    lines: [], payment_method: /kort|bankaxept|visa|mastercard/i.test(t) ? 'kort' : null, card_last4: null, suggested_category: null,
    confidence: { merchant: merchant ? 0.4 : 0, date: date ? 0.6 : 0, total: Math.min(conf, 0.8) },
    needs_review: true, raw_text: t.slice(0, 5000),
  };
}

/* ---------------- Kjøring ---------------- */

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/tiff': 'tif', 'image/bmp': 'bmp', 'application/pdf': 'pdf', 'image/heic': 'heic', 'image/heif': 'heif' };

/** Leser bildet med Tesseract. Kaster med en norsk melding når verktøyene mangler eller bildet ikke kan leses. */
export async function ocrReceipt(image, mime) {
  const tl = await ocrTools();
  if (!tl.tesseract) throw Object.assign(new Error('Tesseract er ikke installert på serveren'), { noRetry: true, missing: true });
  const dir = await mkdtemp(join(tmpdir(), 'ocr-'));
  try {
    const src = join(dir, `in.${EXT[mime] ?? 'jpg'}`);
    await writeFile(src, image);
    let input = src;
    if (tl.magick && mime !== 'application/pdf') {
      // Gråtoner, oppskalering av små bilder, støyfjerning, oppretting av skjevhet og adaptiv terskel.
      const out = join(dir, 'pre.png');
      const args = [src, '-auto-orient', '-colorspace', 'Gray', '-resize', '1800x1800<', '-despeckle', '-deskew', '40%', '-lat', '31x31-8%', out];
      try { await run(tl.magick, args, { timeout: 30_000 }); input = out; } catch { /* bruk originalbildet */ }
    } else if (mime === 'application/pdf') {
      throw Object.assign(new Error('Lokal OCR kan ikke lese PDF uten ImageMagick'), { noRetry: true });
    }
    const text = await run('tesseract', [input, 'stdout', '-l', 'nor+eng', '--oem', '1', '--psm', '4', '-c', 'preserve_interword_spaces=1'], { timeout: 60_000 })
      .catch(() => run('tesseract', [input, 'stdout', '-l', 'eng', '--psm', '4'], { timeout: 60_000 }));
    if (!String(text).trim()) throw new Error('Fant ingen tekst i bildet');
    return { ...parseReceiptText(text), engineVersion: tl.tesseract };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Beskjærer et bilde (Roboflow-boks: senter x/y, bredde, høyde i piksler). Gir null uten ImageMagick. */
export async function cropImage(image, mime, box) {
  const tl = await ocrTools();
  if (!tl.magick || !box) return null;
  const dir = await mkdtemp(join(tmpdir(), 'crop-'));
  try {
    const src = join(dir, `in.${EXT[mime] ?? 'jpg'}`), out = join(dir, 'out.jpg');
    await writeFile(src, image);
    const w = Math.round(box.width), h = Math.round(box.height), x = Math.max(0, Math.round(box.x - box.width / 2)), y = Math.max(0, Math.round(box.y - box.height / 2));
    await run(tl.magick, [src, '-auto-orient', '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-quality', '90', out], { timeout: 20_000 });
    return await readFile(out);
  } catch { return null; } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** Strekkoder og QR med zbarimg. Gir [{type, value}] eller kaster når zbar mangler. */
export async function decodeBarcodes(image, mime) {
  const tl = await ocrTools();
  if (!tl.zbar) throw Object.assign(new Error('Strekkodeleseren (zbar) er ikke installert på serveren'), { missing: true });
  const dir = await mkdtemp(join(tmpdir(), 'bc-'));
  try {
    const src = join(dir, `in.${EXT[mime] ?? 'jpg'}`);
    await writeFile(src, image);
    // zbarimg svarer «TYPE:verdi» per kode og avslutter med kode 4 når det ikke finnes noen.
    const out = await run('zbarimg', ['--quiet', src], { timeout: 20_000 }).catch((e) => (e.code === 4 ? '' : Promise.reject(e)));
    return String(out).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^([A-Za-z0-9-]+):(.+)$/);
      return m ? { type: m[1], value: m[2].trim() } : { type: 'ukjent', value: l };
    }).filter((c, i, a) => a.findIndex((d) => d.value === c.value) === i);
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

