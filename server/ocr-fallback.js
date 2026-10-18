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
// Tesseract leser ofte O som 0, l/I/| som 1 og S som 5 i tall. Rett det bare der tegnet står mellom sifre og skilletegn.
const fixDigits = (t) => t.replace(/(?<=[\d./:-])[Oo]|[Oo](?=[\d./:-])/g, '0').replace(/(?<=[\d./:-])[lI|]|[lI|](?=[\d./:-])/g, '1');
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
const RE_DMY = /(?<!\d)(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})(?![\d.,])/g;
const RE_YMD = /(?<!\d)(20\d{2})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/g;
const RE_MON = /(?<!\d)(\d{1,2})\.?\s*(jan|feb|mar|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|des|dec)[a-zæøå]*\.?\s*(\d{4}|\d{2})?(?!\d)/gi;
const DATE_KEY = /dato|date|kj[øo]pt|tid|time|kvittering/i;
const NOT_DATE_KEY = /best\s*f[øo]r|holdbar|utl[øo]p|gyldig|forfall|garanti|retur/i;

function validDate(y, mo, d, now) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  // Ikke fram i tid (én dags slingring) og ikke eldre enn fem år.
  if (dt.getTime() > now + 86_400_000 || dt.getTime() < now - 5 * 365 * 86_400_000) return null;
  return dt.toISOString().slice(0, 10);
}
/** Alle datoer i teksten med poeng: «Dato»-linjer og klokkeslett teller opp, «best før» og garanti teller ned. */
export function findDate(text, now = Date.now()) {
  const lines = fixDigits(String(text ?? '')).split('\n');
  const cands = [];
  lines.forEach((line, i) => {
    const near = `${lines[i - 1] ?? ''} ${line}`;
    let bonus = (DATE_KEY.test(line) ? 3 : DATE_KEY.test(near) ? 1 : 0) + (/\b\d{1,2}[:.]\d{2}(?::\d{2})?\b/.test(line.replace(RE_DMY, '')) ? 2 : 0) - (NOT_DATE_KEY.test(near) ? 6 : 0);
    const add = (iso) => iso && cands.push({ iso, score: bonus, i });
    for (const m of line.matchAll(RE_YMD)) add(validDate(+m[1], +m[2], +m[3], now));
    for (const m of line.matchAll(RE_DMY)) add(validDate(+m[3], +m[2], +m[1], now));
    for (const m of line.matchAll(RE_MON)) add(validDate(m[3] ? +m[3] : new Date(now).getUTCFullYear(), MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1], now));
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  return cands[0].iso;
}

// Kjente kjeder: gjenkjennes hvor som helst i teksten (også når logoen er lest som rot).
const CHAINS = [
  [/rema\s*1\s*0\s*0\s*0|\brema\b/i, 'REMA 1000'], [/\bkiwi\b/i, 'KIWI'], [/\bmeny\b/i, 'MENY'], [/coop\s*extra|\bextra\b/i, 'Coop Extra'],
  [/coop\s*mega/i, 'Coop Mega'], [/coop\s*prix/i, 'Coop Prix'], [/coop\s*obs|\bobs\b/i, 'Coop Obs'], [/\bcoop\b/i, 'Coop'], [/\bspar\b/i, 'SPAR'],
  [/\bjoker\b/i, 'Joker'], [/bunnpris/i, 'Bunnpris'], [/\bnærbutikken\b/i, 'Nærbutikken'], [/oda\.com|\boda\b/i, 'Oda'], [/\bvinmonopolet\b/i, 'Vinmonopolet'],
  [/circle\s*k/i, 'Circle K'], [/\besso\b/i, 'Esso'], [/\buno-?x\b/i, 'Uno-X'], [/\bshell\b/i, 'Shell'], [/\bst1\b/i, 'St1'], [/\bysp?\b/i, null],
  [/elkj[øo]p/i, 'Elkjøp'], [/power\b/i, 'POWER'], [/\bxxl\b/i, 'XXL'], [/clas\s*ohlson/i, 'Clas Ohlson'], [/\bbiltema\b/i, 'Biltema'], [/\bjula\b/i, 'Jula'],
  [/\bikea\b/i, 'IKEA'], [/\bjysk\b/i, 'JYSK'], [/\bnormal\b/i, 'Normal'], [/\bvita\b/i, 'Vita'], [/\bapotek\s*1\b/i, 'Apotek 1'], [/vitusapotek/i, 'Vitusapotek'],
  [/boots\s*apotek/i, 'Boots apotek'], [/\bh\s*&\s*m\b/i, 'H&M'], [/\bcubus\b/i, 'Cubus'], [/\bkappahl\b/i, 'KappAhl'], [/\bnille\b/i, 'Nille'],
  [/\bsports?\s*1\b/i, 'Sport 1'], [/\bintersport\b/i, 'Intersport'], [/\bmax\s*bo\b|\bmaxbo\b/i, 'Maxbo'], [/\bobs\s*bygg\b/i, 'Obs Bygg'],
  [/\bmonter\b/i, 'Monter'], [/\bbyggmakker\b/i, 'Byggmakker'], [/\bplantasjen\b/i, 'Plantasjen'], [/\bnarvesen\b/i, 'Narvesen'], [/7-?eleven/i, '7-Eleven'],
  [/\bdeli\s*de\s*luca\b/i, 'Deli de Luca'], [/\bmcdonald/i, "McDonald's"], [/\bburger\s*king\b/i, 'Burger King'], [/\bpeppes\b/i, 'Peppes Pizza'],
  [/\bstarbucks\b/i, 'Starbucks'], [/espresso\s*house/i, 'Espresso House'], [/kaffebrenneriet/i, 'Kaffebrenneriet'], [/\bruter\b/i, 'Ruter'], [/\bvy\b/i, 'Vy'],
  [/\bflytoget\b/i, 'Flytoget'], [/\bnorli\b/i, 'Norli'], [/\bark\s*bokhandel|\bark\b/i, 'Ark'], [/\bfinn\.no\b/i, 'FINN'],
];
const NOT_STORE = /kvittering|velkommen|takk\s*for|salg|tlf|telefon|www\.|https?:|e-?post|org\.?\s*n|foretaksreg|kasse|kasserer|betjent|dato|tid\b|bong|ref\.|terminal|bax|visa|mastercard|^\s*nr\b|mva|\bkopi\b/i;
const ADDRESS = /\b\d{4}\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]{2,}/;  // postnummer + sted
const tidy = (t) => {
  t = t.replace(/[^\p{L}\p{N}&'.\- ]/gu, ' ').replace(/\s{2,}/g, ' ').trim();
  // STORE BOKSTAVER → Vanlig skrift (men behold korte forkortelser som AS, XXL).
  if (t === t.toUpperCase() && t.length > 4) t = t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(As|Asa|Da|Ans)\b/g, (m) => m.toUpperCase());
  return t.slice(0, 60);
};
const letterRatio = (t) => ((t.match(/\p{L}/gu) ?? []).length) / Math.max(1, t.replace(/\s/g, '').length);
const goodStoreLine = (t) => t.length >= 3 && t.length <= 42 && letterRatio(t) >= 0.6 && (t.match(/\p{L}/gu) ?? []).length >= 3 && !NOT_STORE.test(t) && !/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(t);

export function findStore(text) {
  const t = String(text ?? '');
  for (const [re, name] of CHAINS) if (name && re.test(t)) return name;
  const lines = t.split('\n').map((l) => l.replace(/^[\s*\-=#_~|]+|[\s*\-=#_~|]+$/g, '').trim()).filter(Boolean);
  const head = lines.slice(0, 12);
  // Linja over adressen (postnummer + sted) eller over org.nr./telefon er som regel butikknavnet.
  const anchor = head.findIndex((l) => ADDRESS.test(l) || /org\.?\s*n|foretaksreg|tlf|telefon/i.test(l));
  for (let i = anchor - 1; i >= 0 && anchor > 0; i--) {
    // Hopp over gateadressen (ord + husnummer, f.eks. «Vulkan 5» eller «Storgata 12B»).
    if (goodStoreLine(head[i]) && !/\d{2,}/.test(head[i].replace(/1000/, '')) && !/\s\d{1,4}\s?[a-zA-Z]?$/.test(head[i])) return tidy(head[i]);
  }
  const first = head.find(goodStoreLine);
  return first ? tidy(first) : null;
}

// Brønnøysundregistrene (åpent API): org.nr. → navn. Brukes bare når kjeden ikke ble gjenkjent.
const brregCache = new Map();
export async function brregName(org) {
  if (!org || !/^\d{9}$/.test(org)) return null;
  if (brregCache.has(org)) return brregCache.get(org);
  let name = null;
  try {
    const r = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${org}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
    if (r.ok) name = (await r.json())?.navn ?? null;
    if (!name) {
      const u = await fetch(`https://data.brreg.no/enhetsregisteret/api/underenheter/${org}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
      if (u.ok) name = (await u.json())?.navn ?? null;
    }
  } catch { /* uten nett: bruk teksten */ }
  if (name) name = tidy(name.replace(/\s+(AS|ASA|DA|ANS|SA|NUF)$/i, ''));
  brregCache.set(org, name);
  return name;
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
    confidence: { merchant: merchant ? (CHAINS.some(([re, n]) => n && re.test(t)) ? 0.75 : 0.4) : 0, date: date ? 0.6 : 0, total: Math.min(conf, 0.8) },
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
    const out = parseReceiptText(text);
    // Ukjent kjede, men gyldig org.nr.: slå opp navnet i Enhetsregisteret.
    if (out.org_number && !CHAINS.some(([re, n]) => n && re.test(text))) {
      const name = await brregName(out.org_number);
      if (name) { out.merchant = name; out.confidence.merchant = 0.7; }
    }
    return { ...out, engineVersion: tl.tesseract };
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

