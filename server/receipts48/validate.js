// Prompt 48 (SERVER48): validering i kode av en tolket kvittering (felles format). Brukes etter hvert steg i kjeden og
// avgjør om kjeden kan stoppe. Mobilens resultat (device_parse) er bare et forslag og går gjennom samme kontroll.
//   - beløp normaliseres (normalize.js), total > 0 og ≤ 1 000 000
//   - sum(items) + sum(discounts) = total ±1 kr (rabatter er negative; pant og tips er varelinjer)
//   - totalen finnes også i OCR-teksten på en linje med TOTAL / Å BETALE / SUM / BETALT (når det finnes OCR-tekst)
//   - dato: gyldig kalenderdato, ikke i fremtiden, ikke eldre enn 2 år (felles datoparser; findDate på OCR-teksten som reserve)
//   - org.nr.: 9 siffer med gyldig mod11, ellers null
//   - mva: satsene 25/15/12 (0 godtas med beløp 0), beløpet omtrent riktig mot totalen
//   - category_suggestion: fra brukerens kategoriliste (ingen fritekst)
// → {ok, confidence:'high'|'medium'|'low', failed_fields[], errors[], warnings[], feedback, receipt}
import { isIsoDate45, isHm45, parseDate45, todayOslo45, addDays45 } from '../glimt45/dates.js';
import { findDate, mod11Ok } from '../ocr-fallback.js';
import { nameSim } from '../finans/receipts39.js';
import { amount48, normalizeReceipt48 } from './normalize.js';
import { checkReceipt48 } from './schema.js';

export const VAT_RATES48 = [25, 15, 12];
export const MAX_TOTAL48 = 1_000_000;
const FATAL = new Set(['merchant', 'date', 'total', 'schema']);
const kr = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

// Beløp på slutten av en linje med et totalord. «SUBTOTAL»/«DELSUM»/«SUM VARER» teller ikke som totalen.
const TOTAL_WORD = /(?:^|[^a-zæøå])(total(?:t|belop|beløp)?|å\s*betale|a\s*betale|til\s*betaling|sum(?:\s*nok)?|betalt)(?![a-zæøå])/i;
const NOT_TOTAL = /sub\s*total|delsum|mellomsum/i;
const AMOUNT_RE = /-?\d{1,3}(?:[ . ]\d{3})*[.,]\d{2}(?!\d)|-?\d+[.,]\d{2}(?!\d)|\d+,-/g;
/** Kandidater for totalen i OCR-teksten (beløp på linjer med totalord). */
export function totalCandidates48(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!TOTAL_WORD.test(line) || NOT_TOTAL.test(line)) continue;
    for (const m of line.matchAll(AMOUNT_RE)) { const v = amount48(m[0]); if (v !== null && v > 0) out.push(v); }
  }
  return [...new Set(out)];
}

/** Kategori fra brukerens liste: eksakt (uten store/små bokstaver), ellers nærmeste navn (nameSim ≥ 0,5), ellers ''. */
export function pickCategory48(want, categories = []) {
  const w = String(want ?? '').trim();
  if (!w || !categories.length) return '';
  const exact = categories.find((c) => c.toLowerCase() === w.toLowerCase());
  if (exact) return exact;
  const best = categories.map((c) => [c, nameSim(c, w)]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 0.5 ? best[0] : '';
}

/**
 * Validerer x (felles kvitteringsformat, gjerne rått fra modellen eller klienten).
 * ctx: {ocrText, categories[], today:'YYYY-MM-DD'}
 */
export function validateReceipt48(x, { ocrText = '', categories = [], today = todayOslo45() } = {}) {
  const errors = [], warnings = [], failed = new Set(), notes = [];
  const r = normalizeReceipt48(x);
  if (!r) return { ok: false, confidence: 'low', failed_fields: ['schema'], errors: ['Svaret er ikke et JSON-objekt'], warnings, feedback: 'Svar med ett JSON-objekt etter skjemaet.', receipt: null };
  const fail = (k, msg, fb = msg) => { failed.add(k); errors.push(msg); if (fb) notes.push(fb); };

  // Butikk
  if (!r.merchant) fail('merchant', 'Mangler butikk', 'Butikknavnet mangler. Les det øverst på kvitteringen.');

  // Total
  if (r.total === null) fail('total', 'Mangler total', 'Totalen mangler. Les beløpet ved TOTAL / Å BETALE / SUM / BETALT.');
  else if (r.total <= 0) fail('total', 'Totalen må være større enn 0', 'Totalen må være et positivt beløp.');
  else if (r.total > MAX_TOTAL48) fail('total', `Totalen er urimelig stor (maks ${MAX_TOTAL48} kr)`, 'Totalen er urimelig stor. Les den på nytt.');

  // Totalen mot OCR-teksten (bare når det finnes tekst og totalord).
  const cands = totalCandidates48(ocrText);
  let totalVerified = null;
  if (r.total !== null && r.total > 0 && cands.length) {
    totalVerified = cands.some((v) => Math.abs(v - r.total) < 0.005);
    if (!totalVerified) fail('total', `Totalen ${kr(r.total)} står ikke på linjene med TOTAL/Å BETALE/SUM/BETALT (der står ${cands.map(kr).join(', ')})`,
      `Totalen ${kr(r.total)} står ikke ved TOTAL / Å BETALE / SUM / BETALT. Der står ${cands.map(kr).join(' eller ')}.`);
  }

  // Sumkontroll: varelinjer + rabatter (negative) = total ±1 kr.
  const itemsSum = Math.round(r.items.reduce((a, i) => a + i.amount, 0) * 100) / 100;
  const discSum = Math.round(r.discounts.reduce((a, d) => a + d.amount, 0) * 100) / 100;
  const sum = Math.round((itemsSum + discSum) * 100) / 100;
  let sumOk = false;
  if (!r.items.length) fail('items', 'Ingen varelinjer', 'Varelinjene mangler. Ta med hver varelinje med beløp (pant og tips er egne linjer).');
  else if (r.total !== null) {
    sumOk = Math.abs(sum - r.total) <= 1;
    if (!sumOk) fail('items', `Varelinjene (${kr(itemsSum)}) og rabattene (${kr(discSum)}) summerer ${kr(sum)}, men totalen er ${kr(r.total)}`,
      `Varelinjene summerer ${kr(itemsSum)} og rabattene ${kr(discSum)}, til sammen ${kr(sum)}, men totalen er ${kr(r.total)}. Finn linjen som mangler eller beløpet som er feil. Rabatter skal være negative, pant og tips egne varelinjer.`);
  }
  const badItem = r.items.findIndex((i) => Math.abs(i.amount) > MAX_TOTAL48);
  if (badItem >= 0) fail('items', `Varelinje ${badItem + 1} har et urimelig beløp`);

  // Dato: gyldig, ikke i fremtiden, ikke eldre enn 2 år. Klientens/modellens dato normaliseres; OCR-teksten er reserve.
  let date = r.date;
  if (date && !isIsoDate45(date)) { const p = parseDate45(date, today, { prefer: 'past' }); date = p?.date && isIsoDate45(p.date) ? p.date : date; }
  if (!isIsoDate45(date) && ocrText) {
    const d = findDate(ocrText, Date.parse(`${today}T12:00:00Z`));
    if (d) { warnings.push(`Datoen er hentet fra OCR-teksten (${d})`); date = d; }
  }
  const oldest = addDays45(today, -730);
  if (!isIsoDate45(date)) fail('date', r.date ? `Ugyldig dato «${r.date}»` : 'Mangler dato', 'Datoen mangler eller er ugyldig. Skriv den som ÅÅÅÅ-MM-DD.');
  else if (date > today) fail('date', `Datoen ${date} er i fremtiden`, `Datoen ${date} er i fremtiden. Les datoen på nytt.`);
  else if (date < oldest) fail('date', `Datoen ${date} er eldre enn 2 år`, `Datoen ${date} er eldre enn to år. Les datoen på nytt.`);
  r.date = date;

  // Klokkeslett og valuta
  if (r.time && !isHm45(r.time)) { const m = String(r.time).match(/^(\d{1,2})[.:](\d{2})/); r.time = m && isHm45(`${m[1].padStart(2, '0')}:${m[2]}`) ? `${m[1].padStart(2, '0')}:${m[2]}` : null; }

  // Org.nr.: mod11, ellers null.
  if (r.org_number && !(r.org_number.length === 9 && mod11Ok(r.org_number))) { warnings.push(`Org.nr. ${r.org_number} er ugyldig (mod11) og er fjernet`); r.org_number = null; }

  // Mva: sats 25/15/12 (0 med beløp 0), beløpet ≤ maks mulig og omtrent riktig når det bare er én sats.
  if (r.vat.length && r.total) {
    const badRate = r.vat.find((v) => !VAT_RATES48.includes(v.rate) && !(v.rate === 0 && v.amount === 0));
    const vatSum = r.vat.reduce((a, v) => a + v.amount, 0);
    if (badRate) fail('vat', `Ukjent mva-sats ${badRate.rate} %`, `Mva-satsen ${badRate.rate} % finnes ikke. Bruk 25, 15 eller 12.`);
    else if (r.vat.some((v) => v.amount < 0) || vatSum > (r.total * 25) / 125 + 1) fail('vat', `Mva ${kr(vatSum)} er for høy for totalen ${kr(r.total)}`, `Mva-beløpet ${kr(vatSum)} er for høyt for totalen.`);
    else if (r.vat.length === 1 && r.vat[0].rate > 0) {
      // Én sats: mva kan ikke være mer enn satsens andel av totalen (lavere er greit – andre varer kan ha 0 % eller annen sats).
      const expect = (r.total * r.vat[0].rate) / (100 + r.vat[0].rate);
      if (r.vat[0].amount > expect + Math.max(1, expect * 0.05)) fail('vat', `Mva ${kr(r.vat[0].amount)} stemmer ikke med ${r.vat[0].rate} % av ${kr(r.total)} (maks ca. ${kr(expect)})`, `Mva-beløpet ${kr(r.vat[0].amount)} er for høyt for ${r.vat[0].rate} % av totalen.`);
    }
  }

  // Kategori fra brukerens liste.
  const cat = pickCategory48(r.category_suggestion, categories);
  if (r.category_suggestion && !cat) warnings.push(`Kategorien «${r.category_suggestion}» finnes ikke i listen`);
  r.category_suggestion = cat;

  // Schema (etter normalisering): typer og formater.
  const schemaErr = checkReceipt48({ ...r, date: r.date || undefined });
  for (const e of schemaErr) if (!/^(date|merchant|total):/.test(e)) { failed.add('schema'); errors.push(`Schema: ${e}`); }

  const failed_fields = [...failed];
  const fatal = failed_fields.some((k) => FATAL.has(k));
  const confidence = fatal ? 'low' : failed_fields.length ? 'medium' : 'high';
  return {
    ok: failed_fields.length === 0, confidence, failed_fields, errors, warnings, receipt: r,
    checks: { sum, itemsSum, discountSum: discSum, sumOk, totalCandidates: cands, totalVerified },
    feedback: notes.length ? `Kontrollen fant feil:\n- ${notes.join('\n- ')}\nLes kvitteringen på nytt og rett feilene. Ikke regn ut noe som ikke står der.` : null,
  };
}

/** Rangering av kandidater når ingen besto: færrest alvorlige feil, så færrest feil. Lavere er bedre. */
export const score48 = (v) => (v ? v.failed_fields.filter((k) => FATAL.has(k)).length * 10 + v.failed_fields.length : 1e9);
