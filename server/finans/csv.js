// CSV-import fra norske nettbanker. Kolonnene finnes automatisk ut fra overskriftene, så små
// formatendringer hos banken ikke knekker importen. Profilen brukes bare som hint for fortegn.
import { createHash } from 'node:crypto';

export const PROFILES = ['DNB', 'Nordea', 'SpareBank 1', 'Sbanken', 'Bank Norwegian'];

const COLS = {
  date: ['bokføringsdato', 'dato', 'transaksjonsdato', 'transactiondate', 'date', 'bokført'],
  text: ['forklaring', 'beskrivelse', 'tekst', 'text', 'tittel', 'navn', 'description', 'mottaker'],
  amount: ['beløp', 'amount', 'beløp i nok', 'sum'],
  out: ['ut fra konto', 'ut', 'uttak', 'belastet'],
  in: ['inn på konto', 'inn', 'innskudd', 'godskrevet'],
};
// Kolonner som bare tas vare på i den opprinnelige bankraden.
export const VALUE_DATE = ['rentedato', 'valuteringsdato', 'valutadato', 'valuedate', 'value date'];
export const ARCHIVE_REF = ['arkivref', 'arkivreferanse', 'arkivref.', 'referanse', 'reference', 'ref'];

// Bankraden slik den kom fra banken: overskrift → celle, pluss felt med faste navn. Lagres uendret i raw_bank_row.
export function bankRow(headers, cells, ix, extra = {}) {
  const raw = {};
  headers.forEach((h, i) => { const v = cells[i]; if (v !== undefined && String(v) !== '') raw[String(h || `Kolonne ${i + 1}`)] = String(v); });
  const at = (i) => (i > -1 && cells[i] !== undefined && String(cells[i]) !== '' ? String(cells[i]) : null);
  return { bookingDate: at(ix.date), valueDate: at(ix.value ?? -1), description: at(ix.text), archiveReference: at(ix.ref ?? -1), raw, ...extra };
}

function splitLine(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseAmount(s) {
  if (s == null) return null;
  let t = String(s).replace(/\s| |kr|NOK/gi, '').replace('−', '-');
  if (!t) return null;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  const v = parseFloat(t);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

export function parseDate(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Fjern bankprefikser og -suffikser slik at butikknavnet blir pent: «VARER 1234 REMA 1000 MAJORSTUEN Dato 01.10» → «Rema 1000 Majorstuen».
export function merchantOf(desc) {
  let t = desc.replace(/^(varer|varekjøp|visa(\s+vare)?|kortkjøp|reservert transaksjon|nettgiro til|giro|vipps\*?)\s+/i, '')
    .replace(/^\d{4,}\s+/, '').replace(/^\d{2}\.\d{2}\s+/, '')
    .replace(/\s+(dato|kurs|betalt)[:\s].*$/i, '').replace(/\s+\d{2}\.\d{2}(\.\d{2,4})?$/, '').replace(/\s+(nok|kr)\s+[\d.,]+.*$/i, '').trim();
  if (!t) t = desc;
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s|-)\S/g, (m) => m.toUpperCase()) : t;
}

export function parseCsv(text, accountId, profile = 'DNB') {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('Filen har ingen rader');
  const sep = [';', '\t', ','].map((s) => [s, lines[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const headers = splitLine(lines[0], sep).map((h) => h.replace(/["']/g, '').trim());
  const head = headers.map((h) => h.toLowerCase());
  const find = (names) => { for (const n of names) { const i = head.findIndex((h) => h === n); if (i > -1) return i; } for (const n of names) { const i = head.findIndex((h) => h.includes(n)); if (i > -1) return i; } return -1; };
  const ix = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [k, find(v)]));
  ix.value = head.findIndex((h) => VALUE_DATE.includes(h));
  ix.ref = head.findIndex((h) => ARCHIVE_REF.includes(h));
  if (ix.date < 0 || ix.text < 0 || (ix.amount < 0 && ix.out < 0 && ix.in < 0)) {
    throw new Error(`Fant ikke kolonnene for dato, tekst og beløp. Overskrifter: ${head.join(', ')}`);
  }
  const seen = new Map(), rows = [], skipped = [];
  lines.slice(1).forEach((line, n) => {
    const c = splitLine(line, sep);
    const date = parseDate(c[ix.date]);
    let amount = null;
    if (ix.out > -1 || ix.in > -1) {
      const o = parseAmount(c[ix.out]), i = parseAmount(c[ix.in]);
      if (o) amount = -Math.abs(o); else if (i) amount = Math.abs(i);
    }
    if (amount === null && ix.amount > -1) amount = parseAmount(c[ix.amount]);
    // Bank Norwegian eksporterer kjøp som positive beløp på kredittkortet.
    if (amount !== null && profile === 'Bank Norwegian' && ix.amount > -1 && !/-/.test(c[ix.amount])) amount = -amount;
    const desc = (c[ix.text] ?? '').replace(/\s+/g, ' ').trim();
    if (!date || amount === null || !desc) { skipped.push(n + 2); return; }
    // Stabil ID for duplikatsjekk: samme rad importert to ganger gir samme ID.
    const key = `${accountId}|${date}|${amount}|${desc}`;
    const k = (seen.get(key) ?? 0) + 1; seen.set(key, k);
    rows.push({ date, amount, description: desc.slice(0, 200), merchant: merchantOf(desc), external_id: 'csv:' + createHash('sha1').update(`${key}|${k}`).digest('hex').slice(0, 24),
      bank: bankRow(headers, c, ix, { amount: amount / 100 }) });
  });
  return { rows, skipped };
}
