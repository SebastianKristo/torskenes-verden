// Prompt 47 (SERVER47): kvitteringer tolket på enheten.
//   claude-code-android-kvittering-mlkit-ocr.md – Android leser teksten med ML Kit (iOS kan sende Vision-tekst på samme måte),
//   claude-code-ios-kvittering-foundation-models.md – iPhone tolker selv med Apple Foundation Models.
//
// POST /finans/api/receipts/ocr-text  (receipts:write / finance:write)
//   JSON {text | ocrText, lines?:[string|{text}], source | kilde:'android-mlkit'|'ios-vision', name?}, eller multipart med de samme
//   feltene (lines som JSON-tekst) + valgfritt «file» (originalbildet lagres; teksten tolkes) og «thumb» (JPEG).
//   → teksten lagres som en tekstkvittering (text/plain) og går gjennom den vanlige kvitteringskøen (extractText med OCR-instruks,
//     samme AI-ruting som før). Svar: receiptOut + jobs[] (status 'pending' til køen er ferdig, som POST /receipts).
// POST /finans/api/receipts/parsed  (receipts:write / finance:write)
//   JSON, eller multipart med feltet «data» (JSON) + valgfritt «file» (bildet som vedlegg) og «thumb» (JPEG).
//   {source | tolketAv:'apple-fm'|'apple-on-device', merchant|butikk, date|dato, total|totalsum, currency|valuta?, vat|mva?,
//    lines|varelinjer?:[{description|navn, amount|pris, quantity|antall?}], suggested_category|kategori?, payment_method|betalingsmiddel?,
//    card_last4?, confidence?:{merchant,date,total}, ocrText?, name?}
//   Serveren stoler ikke blindt på klienten: felttyper, beløpsgrenser og datoer kontrolleres (400 med errors[] ved brudd), og
//   resultatet går videre i samme kø (kategori, bankmatch, sumkontroll, sammendrag) – men uten nytt AI-kall for selve tolkningen.
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db } from './db.js';
import { config } from '../config.js';
import { scanLog } from './scan.js';
import { validate } from './ai.js';

const DIR = resolve(config.dataDir, 'receipts');
const q = (sql) => db.prepare(sql);
// Additiv migrasjon: OCR-teksten fra enheten når originalbildet også er lastet opp (file = bildet, teksten her).
if (!q('PRAGMA table_info(fh_receipts)').all().some((c) => c.name === 'ocr_text47')) db.exec('ALTER TABLE fh_receipts ADD COLUMN ocr_text47 TEXT');
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status);

export const OCR_SOURCES47 = ['android-mlkit', 'ios-vision'];
export const PARSED_SOURCE47 = 'apple-fm';
const PARSED_ALIASES = { 'apple-fm': 'apple-fm', 'apple-on-device': 'apple-fm' };
const IMG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
export const LIMITS47 = { textChars: 50_000, lines: 500, lineChars: 500, items: 80, maxAmount: 1_000_000 };

const osloToday = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
// Kontrolltegn bort (tab og linjeskift beholdes – ML Kit-formatet bruker tab mellom kolonner).
const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/ /g, ' ');
const oneLine = (s, max) => clean(s).replace(/\s+/g, ' ').trim().slice(0, max);

/** OCR-teksten fra enheten → {text} | {error, status}. text foran lines; lines bevarer linjestrukturen når text mangler. */
export function ocrText47(b) {
  let text = typeof b?.text === 'string' ? b.text : typeof b?.ocrText === 'string' ? b.ocrText : '';
  if (b?.lines != null) {
    if (!Array.isArray(b.lines)) return { error: 'lines må være en liste med tekstlinjer' };
    if (b.lines.length > LIMITS47.lines) return { error: `For mange linjer (maks ${LIMITS47.lines})`, status: 413 };
    if (!text.trim()) text = b.lines.map((l) => (typeof l === 'string' ? l : typeof l?.text === 'string' ? l.text : '')).map((l) => clean(l).slice(0, LIMITS47.lineChars)).join('\n');
  }
  if (text.length > LIMITS47.textChars) return { error: `Teksten er for lang (maks ${LIMITS47.textChars} tegn)`, status: 413 };
  const out = clean(text).split('\n').map((l) => l.replace(/[ ]{2,}/g, ' ').replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!out) return { error: 'Fant ingen tekst på kvitteringen' };
  return { text: out };
}

const isCalendarDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const numOf = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(v) ? Number(v.replace(',', '.')) : NaN);

/**
 * Ferdig tolket kvittering fra enheten → {data (validate()-form), warnings[]} | {errors[]}.
 * Hard feil (400): feil type, total ≤ 0 eller urimelig stor, ugyldig dato eller dato i fremtiden, for mange linjer, ugyldige linjebeløp.
 * Myke avvik (sum ≠ total) blir warnings – sumkontrollen (verify39) markerer dem også i Til godkjenning.
 */
export function parsedReceipt47(input) {
  const errors = [], warnings = [];
  const b = input?.receipt ?? input?.kvittering ?? input;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { errors: ['Forventet et JSON-objekt med kvitteringen'] };
  const pick = (...k) => { for (const x of k) if (b[x] !== undefined && b[x] !== null) return b[x]; return undefined; };

  const merchantRaw = pick('merchant', 'butikk');
  if (merchantRaw !== undefined && typeof merchantRaw !== 'string') errors.push('merchant/butikk må være tekst');
  const merchant = typeof merchantRaw === 'string' ? oneLine(merchantRaw, 120) || null : null;

  const dateRaw = pick('date', 'dato');
  let date = null;
  if (dateRaw !== undefined) {
    if (!isCalendarDate(dateRaw)) errors.push('date/dato må være en gyldig dato på formen ÅÅÅÅ-MM-DD');
    else if (dateRaw > osloToday(1)) errors.push('date/dato kan ikke ligge i fremtiden');
    else if (dateRaw < '2000-01-01') errors.push('date/dato er for gammel');
    else date = dateRaw;
  }

  const totalRaw = pick('total', 'totalsum');
  const total = numOf(totalRaw);
  if (totalRaw === undefined) errors.push('total/totalsum mangler');
  else if (!Number.isFinite(total)) errors.push('total/totalsum må være et tall');
  else if (total <= 0) errors.push('total/totalsum må være større enn 0');
  else if (total > LIMITS47.maxAmount) errors.push(`total/totalsum er urimelig stor (maks ${LIMITS47.maxAmount} kr)`);

  const curRaw = pick('currency', 'valuta');
  if (curRaw !== undefined && (typeof curRaw !== 'string' || !/^[A-Za-z]{3}$/.test(curRaw.trim()))) errors.push('currency/valuta må være en ISO-kode med tre bokstaver');
  const currency = typeof curRaw === 'string' && /^[A-Za-z]{3}$/.test(curRaw.trim()) ? curRaw.trim().toUpperCase() : 'NOK';

  const vatRaw = pick('vat', 'mva');
  let vat = [];
  if (vatRaw !== undefined) {
    if (Array.isArray(vatRaw)) {
      vat = vatRaw.filter((v) => v && Number.isFinite(numOf(v.rate)) && Number.isFinite(numOf(v.amount))).slice(0, 6).map((v) => ({ rate: Math.round(numOf(v.rate)), amount: numOf(v.amount) }));
      if (vat.some((v) => v.rate < 0 || v.rate > 100 || Math.abs(v.amount) > LIMITS47.maxAmount)) errors.push('vat/mva har ugyldige satser eller beløp');
    } else {
      const m = numOf(vatRaw);
      if (!Number.isFinite(m) || m < 0) errors.push('vat/mva må være et tall ≥ 0 eller en liste [{rate, amount}]');
      else if (Number.isFinite(total) && m > total) errors.push('vat/mva kan ikke være større enn totalen');
      else if (m > 0) vat = [{ rate: 0, amount: Math.round(m * 100) / 100 }]; // samlet mva uten sats
    }
  }

  const linesRaw = pick('lines', 'varelinjer');
  let lines = [];
  if (linesRaw !== undefined) {
    if (!Array.isArray(linesRaw)) errors.push('lines/varelinjer må være en liste');
    else if (linesRaw.length > LIMITS47.items) errors.push(`For mange varelinjer (maks ${LIMITS47.items})`);
    else {
      linesRaw.forEach((l, i) => {
        if (!l || typeof l !== 'object') { errors.push(`Varelinje ${i + 1} er ikke et objekt`); return; }
        const name = l.description ?? l.navn ?? l.name;
        const amount = numOf(l.amount ?? l.pris ?? l.price);
        const qtyRaw = l.quantity ?? l.antall ?? l.qty;
        const qty = qtyRaw == null ? null : numOf(qtyRaw);
        if (name != null && typeof name !== 'string') errors.push(`Varelinje ${i + 1}: navn må være tekst`);
        if (!Number.isFinite(amount) || Math.abs(amount) > LIMITS47.maxAmount) { errors.push(`Varelinje ${i + 1}: pris må være et tall`); return; }
        if (qty !== null && (!Number.isFinite(qty) || qty <= 0 || qty > 10_000)) { errors.push(`Varelinje ${i + 1}: antall må være et positivt tall`); return; }
        lines.push({ description: oneLine(name ?? '', 120), amount: Math.round(amount * 100) / 100, ...(qty !== null ? { quantity: qty, qty } : {}) });
      });
    }
  }

  const catRaw = pick('suggested_category', 'kategori', 'category');
  if (catRaw !== undefined && typeof catRaw !== 'string') errors.push('kategori må være tekst');
  const payRaw = pick('payment_method', 'betalingsmiddel');
  if (payRaw !== undefined && typeof payRaw !== 'string') errors.push('betalingsmiddel må være tekst');
  const last4Raw = pick('card_last4');
  if (last4Raw !== undefined && !(typeof last4Raw === 'string' && /^\d{4}$/.test(last4Raw))) errors.push('card_last4 må være fire siffer');
  if (errors.length) return { errors };

  // Sikkerhet: klientens egen vurdering (0–1) brukes, ellers 0,9 for felt som er fylt ut (modellen på enheten «gjetter ikke»).
  const conf = (k, has) => { const v = numOf(b.confidence?.[k]); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : has ? 0.9 : 0; };
  const raw = {
    merchant, date, total: Math.round(total * 100) / 100, currency, vat, lines,
    suggested_category: typeof catRaw === 'string' ? oneLine(catRaw, 60) || null : null,
    payment_method: typeof payRaw === 'string' ? oneLine(payRaw, 20) || null : null,
    card_last4: typeof last4Raw === 'string' ? last4Raw : null,
    confidence: { merchant: conf('merchant', !!merchant), date: conf('date', !!date), total: conf('total', true) },
  };
  const data = validate(raw);
  if (lines.length) {
    const sum = Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    if (Math.abs(sum - data.total) > 1) warnings.push(`Varelinjene summerer ${sum.toFixed(2)} av ${data.total.toFixed(2)} kr`);
  }
  if (!merchant) warnings.push('Mangler butikk');
  if (!date) warnings.push('Mangler dato');
  return { data, warnings };
}

async function storeFile(id, buf, ext) {
  const d = new Date(), sub = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  await mkdir(join(DIR, sub), { recursive: true });
  const file = `${sub}/${id}${ext}`;
  await writeFile(join(DIR, file), buf);
  return file;
}
const firstAccount = (u) => q('SELECT id FROM fh_accounts WHERE user_id=? ORDER BY sort, id LIMIT 1').get(u)?.id ?? null;

/** Motoren i køen: ferdig tolket fra enheten (apple-fm) → resultatet uten nytt AI-kall; ellers null. */
export function preParsed47(r, force) {
  if (force || r.source !== PARSED_SOURCE47 || !r.extraction) return null;
  try { return { provider: PARSED_SOURCE47, model: 'Apple Intelligence (på enheten)', data: validate(JSON.parse(r.extraction)), seconds: 0 }; } catch { return null; }
}
/** OCR-teksten fra enheten for en kvittering med originalbilde (ocr_text47), ellers null. force (Les på nytt) leser bildet i stedet. */
export const ocrTextOf47 = (r, force) => (!force && r.ocr_text47 && OCR_SOURCES47.includes(r.source) ? r.ocr_text47 : null);
/** extractText-valg for tekstkvitteringer: OCR fra enheten får egen instruks (ikke «e-post»). */
export const textKind47 = (r) => ({ kind: OCR_SOURCES47.includes(r.source) ? 'ocr' : 'email' });

/**
 * Rutene. deps: {W: tilgangssjekk (receipts:write), enqueue(id): legg i kvitteringskøen, out(id): receiptOut + jobs[]}.
 */
export function mountReceipts47(api, { W, enqueue, out }) {
  const fileLimit = bodyLimit({ maxSize: Number(process.env.MAX_UPLOAD_MB ?? 40) * 1024 * 1024 + 4096, onError: (c) => bad(c, `Filen er for stor (maks ${process.env.MAX_UPLOAD_MB ?? 40} MB)`, 413) });

  api.post('/receipts/ocr-text', fileLimit, W, async (c) => {
    const ct = c.req.header('content-type') ?? '';
    let b = null, img = null, thumb = null;
    if (/multipart\/form-data/i.test(ct)) {
      // Multipart: tekstfeltene (text/ocrText, source/kilde, name, lines som JSON-liste) + valgfritt «file» (originalbildet) og «thumb» (JPEG).
      const form = await c.req.parseBody().catch(() => null);
      if (!form) return bad(c, 'Kunne ikke lese skjemaet');
      b = {};
      for (const k of ['text', 'ocrText', 'source', 'kilde', 'name']) if (typeof form[k] === 'string') b[k] = form[k];
      if (typeof form.lines === 'string') { try { b.lines = JSON.parse(form.lines); } catch { return bad(c, 'lines må være en JSON-liste med tekstlinjer'); } }
      img = form.file instanceof File ? form.file : null;
      thumb = form.thumb instanceof File ? form.thumb : null;
      if (img && !IMG[img.type]) return bad(c, `Vedlegget må være et bilde eller en PDF (${img.type || 'ukjent type'})`);
    } else {
      b = await c.req.json().catch(() => null);
      if (JSON.stringify(b ?? null).length > 512 * 1024) return bad(c, 'Forespørselen er for stor (maks 512 kB)', 413);
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(c, 'Forventet JSON {text, lines?, source}');
    const source = String(b.source ?? b.kilde ?? '').trim();
    if (!OCR_SOURCES47.includes(source)) return bad(c, `source må være ${OCR_SOURCES47.map((s) => `«${s}»`).join(' eller ')}`);
    const t = ocrText47(b);
    if (t.error) return bad(c, t.error, t.status ?? 400);
    const u = c.get('user'), id = randomUUID();
    // Med bildet: file = originalen (vises i appen), teksten i ocr_text47 og tolkes som tekst. Uten: teksten er filen (text/plain).
    const file = img ? await storeFile(id, Buffer.from(await img.arrayBuffer()), `.${IMG[img.type]}`) : await storeFile(id, Buffer.from(t.text, 'utf8'), '.txt');
    const thumbRel = thumb?.type === 'image/jpeg' ? await storeFile(id, Buffer.from(await thumb.arrayBuffer()), '_t.jpg') : null;
    const name = oneLine(b.name, 120) || (source === 'android-mlkit' ? 'Kvittering (Android)' : 'Kvittering (iPhone)');
    q("INSERT INTO fh_receipts(id,file,thumb,mime,status,date,account_id,name,source,target,uploaded_by,created,user_id,ocr_text47) VALUES(?,?,?,?,'pending',?,?,?,?,NULL,?,?,?,?)")
      .run(id, file, thumbRel, img ? img.type : 'text/plain', osloToday(), firstAccount(u), name, source, u, Date.now(), u, img ? t.text : null);
    scanLog(id, 'mottatt', `OCR-tekst fra ${source === 'android-mlkit' ? 'Android (ML Kit)' : 'iPhone (Vision)'} · ${t.text.split('\n').length} linjer · ${t.text.length} tegn${img ? ' + bilde' : ''}`);
    enqueue(id);
    return c.json({ ...out(id), source }, 201);
  });

  api.post('/receipts/parsed', fileLimit, W, async (c) => {
    const ct = c.req.header('content-type') ?? '';
    let b = null, file = null, thumb = null;
    if (/multipart\/form-data/i.test(ct)) {
      const form = await c.req.parseBody().catch(() => null);
      if (!form) return bad(c, 'Kunne ikke lese skjemaet');
      try { b = JSON.parse(String(form.data ?? '')); } catch { return bad(c, 'Feltet «data» må være JSON med kvitteringen'); }
      file = form.file instanceof File ? form.file : null;
      thumb = form.thumb instanceof File ? form.thumb : null;
      if (file && !IMG[file.type]) return bad(c, `Vedlegget må være et bilde eller en PDF (${file.type || 'ukjent type'})`);
    } else {
      b = await c.req.json().catch(() => null);
      if (JSON.stringify(b ?? null).length > 512 * 1024) return bad(c, 'Forespørselen er for stor (maks 512 kB)', 413);
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(c, 'Forventet JSON med kvitteringen');
    const source = PARSED_ALIASES[String(b.source ?? b.tolketAv ?? '').trim()];
    if (!source) return bad(c, 'source må være «apple-fm» (tolket på enheten)');
    const p = parsedReceipt47(b);
    if (p.errors) return bad(c, p.errors[0], 400, { errors: p.errors });
    const t = typeof b.ocrText === 'string' && b.ocrText.trim() ? ocrText47({ text: b.ocrText }) : null;
    if (t?.error) return bad(c, t.error, t.status ?? 400);

    const u = c.get('user'), id = randomUUID();
    let rel, mime, thumbRel = null;
    if (file) { rel = await storeFile(id, Buffer.from(await file.arrayBuffer()), `.${IMG[file.type]}`); mime = file.type; }
    else { rel = await storeFile(id, Buffer.from(t?.text ?? JSON.stringify(p.data, null, 2), 'utf8'), '.txt'); mime = 'text/plain'; }
    if (thumb?.type === 'image/jpeg') thumbRel = await storeFile(id, Buffer.from(await thumb.arrayBuffer()), '_t.jpg');
    const name = oneLine(b.name, 120) || p.data.merchant || 'Kvittering (iPhone)';
    q("INSERT INTO fh_receipts(id,file,thumb,mime,status,date,account_id,name,source,target,uploaded_by,created,user_id,extraction,merchant,total) VALUES(?,?,?,?,'pending',?,?,?,?,NULL,?,?,?,?,?,?)")
      .run(id, rel, thumbRel, mime, p.data.date ?? osloToday(), firstAccount(u), name, source, u, Date.now(), u, JSON.stringify(p.data), p.data.merchant, Math.round(p.data.total * 100));
    scanLog(id, 'mottatt', `Tolket på iPhone (Apple Intelligence) · ${p.data.merchant ?? 'ukjent butikk'} · ${p.data.total} kr · ${p.data.lines.length} linjer${file ? ' + bilde' : ''}`);
    enqueue(id);
    return c.json({ ...out(id), source, warnings: p.warnings }, 201);
  });
}
