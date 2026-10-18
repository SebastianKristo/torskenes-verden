// Skannekjeden: gjenkjenning av filtype og logg per steg for hver kvittering.
// Nettlesere og apper sender ofte feil eller tom filtype (HEIC fra Filer-appen, «application/octet-stream»,
// «image/jpg»), så typen leses fra de første bytene i filen.
import { db } from './db.js';

const q = (sql) => db.prepare(sql);
if (!q('PRAGMA table_info(fh_receipts)').all().some((c) => c.name === 'scan_log')) db.exec('ALTER TABLE fh_receipts ADD COLUMN scan_log TEXT');
// Kandidat fra «Analyser på nytt med Gemini» som venter på at brukeren velger hvilket resultat som beholdes.
if (!q('PRAGMA table_info(fh_receipts)').all().some((c) => c.name === 'candidate')) db.exec('ALTER TABLE fh_receipts ADD COLUMN candidate TEXT');

const ALIAS = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png', 'image/heic-sequence': 'image/heic', 'image/heif-sequence': 'image/heif', 'application/x-pdf': 'application/pdf' };
const EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf' };

/** Filtype fra innholdet, så oppgitt type, så filendelsen. null = ikke et bilde eller en PDF. */
export function sniffMime(buf, declared = '', name = '') {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf ?? []);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (s, e) => String.fromCharCode(...b.subarray(s, e));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (/^(heic|heix|hevc|hevx|heim|heis)$/.test(brand)) return 'image/heic';
    if (/^(mif1|msf1|heif)$/.test(brand)) return 'image/heif';
  }
  if (ascii(0, Math.min(b.length, 1024)).includes('%PDF-')) return 'application/pdf';
  // Ukjent innhold: bruk oppgitt type eller filendelse hvis den er et bilde eller en PDF.
  const t = String(declared ?? '').split(';')[0].trim().toLowerCase();
  const d = ALIAS[t] ?? t;
  if (Object.values(EXT).includes(d)) return d;
  const ext = String(name ?? '').toLowerCase().match(/\.(\w+)$/)?.[1];
  return (ext && EXT[ext]) || null;
}

export const isHeic = (mime) => mime === 'image/heic' || mime === 'image/heif';

/** Legger et steg til i kvitteringens logg (maks 40) og skriver det til serverloggen. */
export function scanLog(id, step, detail = '') {
  const line = { t: Date.now(), step, ...(detail ? { detail: String(detail).slice(0, 300) } : {}) };
  console.info(`[skann] ${id.slice(0, 8)} ${step}${detail ? ' – ' + line.detail : ''}`);
  try {
    const r = q('SELECT scan_log FROM fh_receipts WHERE id=?').get(id);
    if (!r) return;
    let log = []; try { log = JSON.parse(r.scan_log ?? '[]'); } catch { /* ugyldig */ }
    log.push(line);
    q('UPDATE fh_receipts SET scan_log=? WHERE id=?').run(JSON.stringify(log.slice(-40)), id);
  } catch { /* loggen skal aldri stoppe køen */ }
}
export const scanLogOf = (r) => { try { return JSON.parse(r.scan_log ?? '[]'); } catch { return []; } };
