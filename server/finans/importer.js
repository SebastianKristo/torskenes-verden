// Import av kontoutskrifter: XLSX, CSV og innlimt tekst (f.eks. kopiert fra nettbanken).
// XLSX leses med en liten innebygd ZIP/XML-leser (node:zlib), så vi slipper en tung avhengighet
// for å lese opplastede filer. Bare første regneark og verdiene brukes; formler og stiler ignoreres.
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseAmount, merchantOf, bankRow, VALUE_DATE, ARCHIVE_REF } from './csv.js';

/* ---------------- XLSX ---------------- */

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Filen er ikke en gyldig XLSX-fil');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + el + cl;
    if (!/^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
    if (usize > 50 * 1024 * 1024) throw new Error('Regnearket er for stort');
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    files.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
  }
  return files;
}

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

// Excel-dato (serienummer) → ISO.
const serialDate = (v) => new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);

export function readXlsx(buf) {
  const files = unzip(buf);
  const shared = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const sheet = [...files.keys()].filter((k) => k.startsWith('xl/worksheets/')).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
  if (!sheet) throw new Error('Fant ingen regneark i filen');
  const rows = [];
  for (const rm of files.get(sheet).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] ?? '';
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const t = attrs.match(/t="(\w+)"/)?.[1];
      const s = attrs.match(/s="(\d+)"/)?.[1];
      let v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (t === 's') v = shared[+v] ?? '';
      else if (t === 'inlineStr') v = unxml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else if (v != null) v = unxml(v);
      // Datoceller er tall med stil; et serienummer i et rimelig område med stil tolkes som dato.
      if (t !== 's' && t !== 'inlineStr' && t !== 'str' && s && /^\d{5}(\.\d+)?$/.test(v ?? '') && +v > 30000 && +v < 60000) v = serialDate(+v);
      row[ref ? colIndex(ref) : row.length] = v ?? '';
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}

/* ---------------- Tekst og CSV ---------------- */

// CSV/TSV med `,`, `;` eller tab. Celler i anførselstegn kan inneholde skilletegn og linjeskift.
export function splitRows(text) {
  const t = String(text ?? '').replace(/^﻿/, '');
  const first = t.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const outside = first.replace(/"[^"]*"/g, '');
  const count = (ch) => outside.split(ch).length - 1;
  const sep = count('\t') ? '\t' : count(';') >= count(',') && count(';') ? ';' : count(',') ? ',' : '\t';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch === '\n' || ch === '\r' ? ' ' : ch;
    } else if (ch === '"' && !cell.trim()) { quoted = true; cell = ''; }
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell.trim()); rows.push(row);
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

// Innlimt tekst eller CSV: samme oppdeling som filene (tab, semikolon eller komma; celler i anførselstegn over flere linjer).
export const readText = (text) => splitRows(text);

/* ---------------- Tolkning ---------------- */

// MM/DD/YY (DNB-eksport) med skråstrek, DD.MM.YY(YY) med punktum, eller ISO.
export function parseDateFlex(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [mo, d] = [+m[1], +m[2]];
    if (mo > 12 && d <= 12) [mo, d] = [d, mo];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = t.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Rens bankteksten: «Visa 100021 Ruterappen» → «Ruterappen», «Vipps:pal wengard» → «Vipps · Pal Wengard».
export function cleanDescription(raw) {
  let d = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const v = d.match(/Vipps\s*[:*]\s*(.+)$/i);
  if (v) return 'Vipps · ' + v[1].trim().toLowerCase().replace(/(^|\s|-)\p{L}/gu, (c) => c.toUpperCase());
  d = d.replace(/^(Visa\s+\d+|Lønn\s+\d+|Varekjøp|Kortkjøp|Reservert transaksjon|Nettgiro til|Overføring)\s+/i, '')
    .replace(/\b(Eur|Usd|Sek|Dkk|Gbp)\s+[\d.,]+\s*/i, '').replace(/\s*Valutakurs.*$/i, '').replace(/\s*Kurs\s+[\d.,]+.*$/i, '')
    .replace(/\s*Dato\s+\d.*$/i, '').replace(/\s*Betalt:?\s*\d{2}\.\d{2}.*$/i, '');
  // «Akademika AS Kanalveien 5 Bergen» → «Akademika AS»
  d = d.replace(/\s(AS|ASA|AB|AG|Ltd|Inc)\b.*$/i, (m) => m.trim().split(' ').slice(0, 1).map((x) => ' ' + x).join(''));
  d = d.trim() || String(raw).trim();
  return merchantOf(d);
}

const HEAD = {
  date: ['dato', 'bokføringsdato', 'transaksjonsdato', 'date', 'bokført'],
  text: ['forklaring', 'beskrivelse', 'tekst', 'text', 'description', 'mottaker', 'navn'],
  amount: ['beløp', 'amount', 'sum', 'beløp i nok'],
  out: ['ut fra konto', 'ut', 'uttak', 'belastet'],
  in: ['inn på konto', 'inn', 'innskudd', 'godskrevet'],
};

// Rader (array av celler) → transaksjoner. Finner overskriftsraden hvis den finnes; ellers DNB-rekkefølge
// Dato | Forklaring | Rentedato | Ut | Inn.
export function rowsToTx(rows, accountId = 0) {
  const hi = rows.findIndex((r) => r.some((c) => /^(dato|bokføringsdato|date)$/i.test(String(c).trim())));
  let ix = { date: 0, text: 1, out: 3, in: 4, amount: -1, value: 2, ref: -1 };
  let headers = ['Dato', 'Forklaring', 'Rentedato', 'Ut fra konto', 'Inn på konto'];
  if (hi > -1) {
    headers = rows[hi].map((h) => String(h).trim());
    const head = headers.map((h) => h.toLowerCase());
    const find = (names) => { for (const n of names) { const i = head.indexOf(n); if (i > -1) return i; } for (const n of names) { const i = head.findIndex((h) => h.includes(n)); if (i > -1) return i; } return -1; };
    ix = Object.fromEntries(Object.entries(HEAD).map(([k, v]) => [k, find(v)]));
    if (ix.out === ix.in) ix.in = -1;
    ix.value = head.findIndex((h) => VALUE_DATE.includes(h));
    ix.ref = head.findIndex((h) => ARCHIVE_REF.includes(h));
  } else if (rows[0] && rows[0].length === 3) { ix = { date: 0, text: 1, amount: 2, out: -1, in: -1, value: -1, ref: -1 }; headers = ['Dato', 'Tekst', 'Beløp']; }
  const seen = new Map(), out = [], skipped = [];
  rows.slice(hi + 1).forEach((c, n) => {
    const date = parseDateFlex(c[ix.date]);
    const raw = String(c[ix.text] ?? '').replace(/\s+/g, ' ').trim();
    let amount = null;
    if (ix.out > -1 || ix.in > -1) {
      const o = parseAmount(c[ix.out]), i = parseAmount(c[ix.in]);
      if (o) amount = -Math.abs(o); else if (i) amount = Math.abs(i);
    }
    if (amount === null && ix.amount > -1) amount = parseAmount(c[ix.amount]);
    if (!date || amount === null || !raw) { if (c.some((x) => String(x).trim())) skipped.push(n + hi + 2); return; }
    const key = `${accountId}|${date}|${amount}|${raw}`;
    const k = (seen.get(key) ?? 0) + 1; seen.set(key, k);
    out.push({ date, amount, raw: raw.slice(0, 200), description: cleanDescription(raw).slice(0, 120), external_id: 'imp:' + createHash('sha1').update(`${key}|${k}`).digest('hex').slice(0, 24),
      bank: bankRow(headers, c, ix, { amount: amount / 100 }) });
  });
  return { rows: out, skipped };
}

export async function parseFile(file) {
  const name = file.name?.toLowerCase() ?? '';
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.xlsx$/.test(name) || (buf[0] === 0x50 && buf[1] === 0x4b)) return readXlsx(buf);
  if (/\.xls$/.test(name)) throw new Error(`${file.name}: gammelt .xls-format støttes ikke – lagre som .xlsx eller CSV`);
  // Norske banker eksporterer ofte Windows-1252.
  let text = buf.toString('utf8');
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  return readText(text);
}
