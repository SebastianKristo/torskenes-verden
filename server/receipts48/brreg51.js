// Prompt 51 (RCPTSRV51), Del C: butikknavn via organisasjonsnummer.
//   - findOrgs51(text): org.nr. i OCR-teksten (9 siffer, ofte etter «Org.nr», «Foretaksregisteret», «NO … MVA»), mod11-validert.
//   - Lokal kopi av Enhetsregisteret (data.brreg.no, gratis bulk-nedlasting av enheter og underenheter): bare org.nr., navn og
//     forretnings-/beliggenhetsadresse for aktive enheter, i egen SQLite-fil (DATA_DIR/brreg51.sqlite). Oppdateres ukentlig i
//     bakgrunnen (logges). Oppslag per kvittering er alltid lokale – «Finansdata forlater aldri huset» holder.
//   - resolveMerchant51: rekkefølgen 1) org.nr.-oppslag (navnet brukeren har lært serveren for org.nr., ellers registeret),
//     2) kjent butikk fra tidligere kvitteringer (samme org.nr. eller lignende tekst øverst), 3) modellens forslag.
//     Kilden merkes (merchant_source: orgnr | known | model).
//   - learnMerchant51: org.nr. → visningsnavn per bruker når brukeren retter navnet.
import Database from 'better-sqlite3';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../config.js';
import { db } from '../finans/db.js';
import { mod11Ok } from '../ocr-fallback.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS fh_merchants51 (
  user_id TEXT NOT NULL, org_number TEXT NOT NULL, name TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'user', count INTEGER NOT NULL DEFAULT 1,
  receipt_id TEXT, updated INTEGER NOT NULL, PRIMARY KEY (user_id, org_number));`);

export const BRREG51_URLS = Object.freeze({
  enheter: 'https://data.brreg.no/enhetsregisteret/api/enheter/lastned/csv',
  underenheter: 'https://data.brreg.no/enhetsregisteret/api/underenheter/lastned/csv',
});
export const MERCHANT_LABELS51 = { orgnr: 'fra org.nr.', known: 'kjent butikk', model: 'modellens forslag', user: 'rettet av deg' };
const WEEK = 7 * 86400_000;

/* ---------------- Org.nr. i teksten ---------------- */

export { mod11Ok };
// OCR leser O som 0, l/I/| som 1, S som 5 og B som 8 inne i tallgrupper.
const fixDigits = (s) => s.replace(/[Oo]/g, '0').replace(/[lI|!]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
const D = '[0-9OoIl|]';
const GROUP = `(${D}{3}[ .\\u00a0-]?${D}{3}[ .\\u00a0-]?${D}{3})`;
const KEYED = new RegExp(String.raw`(?:org(?:anisasjons)?\.?\s*-?\s*n(?:r|o|ummer)\.?|org\.?\s*nummer|foretaksregisteret|foretaksreg\.?|enhetsregisteret|\bvat\b|\bmva\b|\bNO\b|\bN0\b)\s*[:.#]?\s*(?:N[O0]\s*)?` + GROUP + String.raw`(?:\s*M\s*V\s*A)?`, 'gi');
const TRAIL_MVA = new RegExp(String.raw`(?<![0-9])` + GROUP + String.raw`\s*M\s*V\s*A\b`, 'gi');
const LOOSE = new RegExp(String.raw`(?<![0-9])(\d{3}[ .]?\d{3}[ .]?\d{3})(?![0-9])`, 'g');

/**
 * Org.nr.-kandidater i OCR-teksten, best først. → [{org_number, score, row}] (bare mod11-gyldige, 8/9 først).
 * score: 3 = etter «Org.nr»/«Foretaksregisteret»/«NO … MVA», 2 = «… MVA», 1 = løst 9-sifret tall øverst på kvitteringen.
 */
export function findOrgs51(text) {
  const rows = String(text ?? '').split('\n');
  const out = new Map();
  const add = (raw, score, row) => {
    const nr = fixDigits(String(raw)).replace(/[^0-9]/g, '');
    if (nr.length !== 9 || !mod11Ok(nr)) return;
    const prev = out.get(nr);
    if (!prev || prev.score < score) out.set(nr, { org_number: nr, score, row });
  };
  rows.forEach((line, i) => {
    for (const m of line.matchAll(KEYED)) add(m[1], 3, i);
    for (const m of line.matchAll(TRAIL_MVA)) add(m[1], 2, i);
    if (i < 15 || /org|mva|foretak/i.test(line)) for (const m of line.matchAll(LOOSE)) add(m[1], 1, i);
  });
  // Også over linjeskift («Org.nr:» på én rad, tallet på neste).
  for (let i = 0; i < rows.length - 1; i++) if (/org\.?\s*n|foretaksreg/i.test(rows[i]) && !/\d{3}/.test(rows[i])) for (const m of rows[i + 1].matchAll(LOOSE)) add(m[1], 3, i + 1);
  return [...out.values()].sort((a, b) => b.score - a.score || a.row - b.row);
}

/* ---------------- Visningsnavn ---------------- */

const FORMS = /\s+(AS|ASA|DA|ANS|SA|NUF|BA|KS|ENK|SE|IKS|STI|FLI|BBL|BRL)\.?$/i;
/** «REMA 1000 GRÜNERLØKKA AS» → «Rema 1000 Grünerløkka» (forkortelser og tall beholdes). */
export function displayName51(name) {
  let t = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (let k = 0; k < 2; k++) t = t.replace(FORMS, '').trim();
  if (t === t.toUpperCase() && /[A-ZÆØÅ]{3}/.test(t)) {
    t = t.toLowerCase().replace(/(^|[\s\-/&(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    t = t.replace(/(^|\s)(Rema|Xxl|Ikea|Jysk|Kiwi|Meny|Spar|Obs|Dnb|H&m|Ica)(?=\s|$)/g, (m, a, b) => a + b.toUpperCase());
  }
  return t.slice(0, 80);
}
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå]/g, '');

/* ---------------- Lokal kopi av Enhetsregisteret ---------------- */

const FILE = () => resolve(config.dataDir, 'brreg51.sqlite');
let reg = null; // åpen database (lesing)
const state = { running: false, last_error: null, startedAt: null, timer: null };
function openReg() {
  if (reg) return reg;
  if (!existsSync(FILE())) return null;
  try { reg = new Database(FILE(), { readonly: true, fileMustExist: true }); } catch { reg = null; }
  return reg;
}
const closeReg = () => { try { reg?.close(); } catch { /* lukket */ } reg = null; };
const metaOf = (d) => { try { return Object.fromEntries(d.prepare('SELECT k, v FROM meta').all().map((r) => [r.k, r.v])); } catch { return {}; } };

/** Status: {count, updated, next, running, last_error, source, file_mb}. */
export function brregStatus51() {
  const d = openReg();
  const m = d ? metaOf(d) : {};
  const updated = m.updated ? +m.updated : null;
  let mb = null; try { mb = Math.round(statSync(FILE()).size / 1e5) / 10; } catch { /* ingen fil */ }
  return { count: m.count ? +m.count : 0, updated: updated ? new Date(updated).toISOString() : null, next: updated ? new Date(updated + WEEK).toISOString() : null,
    running: state.running, last_error: state.last_error, source: 'data.brreg.no (bulk)', file_mb: mb };
}

/** Lokalt oppslag (aldri nett). → {org_number, name, display_name, address, kind} | null */
export function brregLookup51(org) {
  const nr = String(org ?? '').replace(/\D/g, '');
  if (!/^\d{9}$/.test(nr)) return null;
  const d = openReg();
  if (!d) return null;
  let r;
  try { r = d.prepare('SELECT orgnr, navn, adresse, kind FROM enheter WHERE orgnr=?').get(nr); } catch { return null; }
  return r ? { org_number: r.orgnr, name: r.navn, display_name: displayName51(r.navn), address: r.adresse || null, kind: r.kind === 'U' ? 'underenhet' : 'enhet' } : null;
}

/** Strømmende CSV-leser (komma, «"» rundt felt, linjeskift i felt). onRow(cells[]) per rad. */
export function csvParser51(onRow, sep = ',') {
  let field = '', row = [], inQ = false, pendingQ = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); if (row.length > 1 || row[0] !== '') onRow(row); row = []; };
  return {
    push(chunk) {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (pendingQ) { pendingQ = false; if (ch === '"') { field += '"'; continue; } inQ = false; }
        if (inQ) { if (ch === '"') pendingQ = true; else field += ch; continue; }
        if (ch === '"') { if (field === '') inQ = true; else field += ch; }
        else if (ch === sep) endField();
        else if (ch === '\n') endRow();
        else if (ch !== '\r') field += ch;
      }
    },
    end() { if (pendingQ) { pendingQ = false; inQ = false; } if (field !== '' || row.length) endRow(); },
  };
}

const truthy = (v) => /^(true|ja|j|1)$/i.test(String(v ?? '').trim());
/**
 * Importerer én CSV-strøm (enheter eller underenheter) inn i databasen d. Aktive enheter: ikke slettet, ikke konkurs, ikke under
 * avvikling/tvangsavvikling, ikke nedlagt. → antall rader lagret.
 */
export async function importCsv51(d, stream, kind) {
  const ins = d.prepare('INSERT OR REPLACE INTO enheter(orgnr, navn, adresse, kind) VALUES(?,?,?,?)');
  let head = null, n = 0, batch = [];
  const flush = () => { if (!batch.length) return; d.transaction((rows) => { for (const r of rows) ins.run(...r); })(batch); n += batch.length; batch = []; };
  const col = (names) => { for (const nm of names) { const i = head.findIndex((h) => h.toLowerCase() === nm.toLowerCase()); if (i >= 0) return i; } return -1; };
  let ix = null;
  const sepOf = (line) => ((line.match(/;/g) ?? []).length > (line.match(/,/g) ?? []).length ? ';' : ',');
  let parser = null, sniff = '';
  const handle = (cells) => {
    if (!head) {
      head = cells.map((h) => h.trim().replace(/^﻿/, ''));
      ix = { nr: col(['organisasjonsnummer']), navn: col(['navn']), adr: col(['forretningsadresse.adresse', 'beliggenhetsadresse.adresse']), post: col(['forretningsadresse.postnummer', 'beliggenhetsadresse.postnummer']),
        sted: col(['forretningsadresse.poststed', 'beliggenhetsadresse.poststed']), slett: col(['slettedato']), konk: col(['konkurs']), avv: col(['underAvvikling']),
        tvang: col(['underTvangsavviklingEllerTvangsopplosning']), ned: col(['nedleggelsesdato']) };
      if (ix.nr < 0 || ix.navn < 0) throw new Error('CSV-filen fra Enhetsregisteret mangler kolonnene organisasjonsnummer/navn');
      return;
    }
    const v = (i) => (i >= 0 ? String(cells[i] ?? '').trim() : '');
    const nr = v(ix.nr).replace(/\D/g, '');
    if (!/^\d{9}$/.test(nr) || !v(ix.navn)) return;
    if (v(ix.slett) || v(ix.ned) || truthy(v(ix.konk)) || truthy(v(ix.avv)) || truthy(v(ix.tvang))) return;
    const adr = [v(ix.adr).replace(/[\r\n]+/g, ', '), [v(ix.post), v(ix.sted)].filter(Boolean).join(' ')].filter(Boolean).join(', ').slice(0, 160);
    batch.push([nr, v(ix.navn).slice(0, 200), adr || null, kind]);
    if (batch.length >= 5000) flush();
  };
  for await (const chunk of stream) {
    const s = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    if (!parser) { sniff += s; if (!sniff.includes('\n') && sniff.length < 65536) continue; parser = csvParser51(handle, sepOf(sniff.split('\n')[0])); parser.push(sniff); continue; }
    parser.push(s);
  }
  if (!parser && sniff) { parser = csvParser51(handle, sepOf(sniff.split('\n')[0])); parser.push(sniff); }
  parser?.end();
  flush();
  return n;
}

let F = (u, i) => fetch(u, i);
/** Tester: falsk fetch for bulk-nedlastingen. */
export const _setBrregFetch51 = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };

/** Response-kropp/Buffer → tekststrøm; gzip pakkes ut når de første bytene er gzip-signaturen (1f 8b). */
async function textStream(body) {
  const src = Buffer.isBuffer(body) || typeof body === 'string' ? Readable.from([Buffer.from(body)]) : Readable.fromWeb(body);
  const it = src[Symbol.asyncIterator]();
  const first = await it.next();
  const head = first.done ? Buffer.alloc(0) : Buffer.from(first.value);
  async function* rest() { if (head.length) yield head; for (;;) { const n = await it.next(); if (n.done) return; yield Buffer.from(n.value); } }
  const all = Readable.from(rest());
  const out = head[0] === 0x1f && head[1] === 0x8b ? all.pipe(createGunzip()) : all;
  out.setEncoding('utf8');
  return out;
}

/**
 * Laster ned bulk-filene og bygger en ny lokal kopi (byttes inn først når alt er lest, så oppslag virker hele tiden).
 * sources: {enheter, underenheter} → URL-er (standard data.brreg.no). → {count, ms}
 */
export async function updateBrreg51({ sources = BRREG51_URLS, log = (s) => console.info(`[brreg51] ${s}`) } = {}) {
  if (state.running) throw Object.assign(new Error('Oppdateringen kjører allerede'), { busy: true });
  state.running = true; state.startedAt = Date.now(); state.last_error = null;
  const tmp = `${FILE()}.tmp`;
  const t0 = Date.now();
  try {
    rmSync(tmp, { force: true });
    const d = new Database(tmp);
    d.pragma('journal_mode = OFF'); d.pragma('synchronous = OFF');
    d.exec('CREATE TABLE enheter (orgnr TEXT PRIMARY KEY, navn TEXT NOT NULL, adresse TEXT, kind TEXT NOT NULL) WITHOUT ROWID; CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);');
    let total = 0;
    try {
      // Underenheter først, så enhetene (samme org.nr. finnes ikke i begge, men enheten vinner om det skulle skje).
      for (const [kind, key] of [['U', 'underenheter'], ['E', 'enheter']]) {
        const url = sources[key];
        if (!url) continue;
        log(`ukentlig bulk-nedlasting: henter ${key} fra ${new URL(url).host}`);
        const res = await F(url, { headers: { accept: 'text/csv, application/gzip, */*' }, signal: AbortSignal.timeout(30 * 60_000) });
        if (!res.ok) throw new Error(`data.brreg.no svarte ${res.status} for ${key}`);
        const n = await importCsv51(d, await textStream(res.body), kind);
        log(`${key}: ${n} aktive`);
        total += n;
      }
      const count = d.prepare('SELECT count(*) AS n FROM enheter').get().n;
      if (!count) throw new Error('Bulk-filene inneholdt ingen aktive enheter');
      d.prepare('INSERT INTO meta(k,v) VALUES(?,?),(?,?)').run('updated', String(Date.now()), 'count', String(count));
      d.close();
      closeReg();
      renameSync(tmp, FILE());
      log(`lokal kopi oppdatert: ${count} enheter · ${Math.round((Date.now() - t0) / 1000)} s`);
      return { count, ms: Date.now() - t0, imported: total };
    } catch (e) { try { d.close(); } catch { /* lukket */ } throw e; }
  } catch (e) {
    state.last_error = e.message;
    log(`oppdatering feilet: ${e.message}`);
    rmSync(tmp, { force: true });
    throw e;
  } finally { state.running = false; }
}

/** Bakgrunnsjobb: sjekker hver 6. time om kopien er eldre enn en uke (første gang 10 min etter oppstart). Ikke i tester/MOCK. */
export function scheduleBrreg51({ firstMs = 10 * 60_000, everyMs = 6 * 3600_000 } = {}) {
  if (state.timer) return false;
  const tick = async () => {
    const s = brregStatus51();
    const age = s.updated ? Date.now() - Date.parse(s.updated) : Infinity;
    if (age < WEEK || state.running) return;
    try { await updateBrreg51(); } catch { /* logget */ }
  };
  const first = setTimeout(() => { tick(); state.timer = setInterval(tick, everyMs); state.timer.unref?.(); }, firstMs);
  first.unref?.();
  state.timer = first;
  return true;
}
const autoOff = () => process.env.NODE_ENV === 'test' || process.env.MOCK_DATA === '1' || process.env.OPS51_SANDBOX === '1' || !!process.env.NODE_TEST_CONTEXT || /^(0|off|false|nei)$/i.test(String(process.env.BRREG51_AUTO ?? ''));
if (!autoOff()) scheduleBrreg51();

/** Tester: bytt fil / lukk. */
export const _brregReset51 = () => { closeReg(); rmSync(FILE(), { force: true }); state.last_error = null; };
export const _brregFile51 = FILE;

/* ---------------- Butikknavn: rekkefølgen ---------------- */

/** Navnet brukeren har lært serveren for org.nr. */
export const learnedName51 = (u, org) => (org ? q('SELECT name FROM fh_merchants51 WHERE user_id=? AND org_number=?').get(u, org)?.name ?? null : null);

/** Lærer org.nr. → visningsnavn (per bruker). → true når lagret. */
export function learnMerchant51(u, org, name, { receiptId = null, source = 'user' } = {}) {
  const nr = String(org ?? '').replace(/\D/g, '');
  const nm = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!u || !nm || !mod11Ok(nr)) return false;
  q(`INSERT INTO fh_merchants51(user_id, org_number, name, source, count, receipt_id, updated) VALUES(?,?,?,?,1,?,?)
     ON CONFLICT(user_id, org_number) DO UPDATE SET name=excluded.name, source=excluded.source, count=count+1, receipt_id=excluded.receipt_id, updated=excluded.updated`)
    .run(u, nr, nm, source, receiptId, Date.now());
  return true;
}

const parseJ = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
/** Tidligere bokført kvittering for brukeren med samme org.nr. */
function knownByOrg(u, org, excludeId) {
  try {
    // «Kjent» = bekreftet av brukeren: bokført kvittering (forslag som bare venter på gjennomgang teller ikke).
    return q(`SELECT merchant FROM fh_receipts WHERE user_id=? AND status='booked' AND merchant IS NOT NULL AND merchant<>'' AND id<>? AND json_valid(extraction)
      AND (json_extract(extraction, '$.org_number')=? OR json_extract(extraction, '$.merchant51.org_number')=?) ORDER BY created DESC LIMIT 1`).get(u, excludeId ?? '', org, org)?.merchant ?? null;
  } catch { return null; }
}
/** Kjent butikk fra lignende tekst øverst på kvitteringen: brukerens tidligere butikknavn som står i de første radene. */
function knownByText(u, rows, excludeId) {
  const head = rows.slice(0, 10).map(norm).filter(Boolean);
  if (!head.length) return null;
  const joined = head.join('|');
  let names = [];
  try {
    names = q(`SELECT merchant AS name, max(created) AS t FROM fh_receipts WHERE user_id=? AND status='booked' AND merchant IS NOT NULL AND merchant<>'' AND id<>?
      GROUP BY merchant ORDER BY t DESC LIMIT 400`).all(u, excludeId ?? '').map((r) => r.name);
  } catch { /* ingen tabell */ }
  names = [...q('SELECT name FROM fh_merchants51 WHERE user_id=? ORDER BY updated DESC LIMIT 200').all(u).map((r) => r.name), ...names];
  let best = null;
  for (const n of names) {
    const k = norm(n);
    if (k.length < 4) continue;
    // Hele navnet (uten mellomrom/tegn) står i en av de øverste radene, eller første ord + resten i to rader.
    if (head.some((h) => h.includes(k)) || (k.length >= 6 && joined.replace(/\|/g, '').includes(k))) { if (!best || k.length > norm(best).length) best = n; }
  }
  return best;
}

/**
 * Butikknavnet etter rekkefølgen org.nr. → kjent butikk → modellen. Endrer ikke receipt; gir det nye navnet og kilden.
 * → {merchant, merchant_source:'orgnr'|'known'|'model'|null, org_number, detail:'learned'|'brreg'|'previous'|'text'|null, model_merchant, candidates}
 */
export function resolveMerchant51({ user = null, receipt = null, ocrText = '', receiptId = null } = {}) {
  const modelName = receipt?.merchant ? String(receipt.merchant).trim() : null;
  const cands = findOrgs51(ocrText);
  const modelOrg = String(receipt?.org_number ?? '').replace(/\D/g, '');
  if (mod11Ok(modelOrg) && !cands.some((c) => c.org_number === modelOrg)) {
    // Modellens org.nr. teller bare når sifrene faktisk står i OCR-teksten (eller det ikke finnes OCR-tekst).
    const digits = String(ocrText ?? '').replace(/\D/g, '');
    if (!ocrText || digits.includes(modelOrg)) cands.push({ org_number: modelOrg, score: 0, row: -1 });
  }
  const base = { model_merchant: modelName, candidates: cands.map((c) => c.org_number).slice(0, 5) };
  // 1) org.nr.-oppslag: lært navn, så registeret.
  for (const c of cands) {
    const learned = user ? learnedName51(user, c.org_number) : null;
    if (learned) return { ...base, merchant: learned, merchant_source: 'orgnr', org_number: c.org_number, detail: 'learned' };
    const hit = brregLookup51(c.org_number);
    if (hit?.display_name) return { ...base, merchant: hit.display_name, merchant_source: 'orgnr', org_number: c.org_number, detail: 'brreg', address: hit.address };
  }
  const org = cands[0]?.org_number ?? (mod11Ok(modelOrg) ? modelOrg : null);
  // 2) kjent butikk: samme org.nr., så lignende tekst.
  if (user) {
    const byOrg = org ? knownByOrg(user, org, receiptId) : null;
    if (byOrg) return { ...base, merchant: byOrg, merchant_source: 'known', org_number: org, detail: 'previous' };
    const byText = knownByText(user, String(ocrText ?? '').split('\n'), receiptId);
    if (byText) return { ...base, merchant: byText, merchant_source: 'known', org_number: org, detail: 'text' };
  }
  // 3) modellens forslag.
  return { ...base, merchant: modelName || null, merchant_source: modelName ? 'model' : null, org_number: org, detail: null };
}

/** Lagret merchant51-info i extraction → felt til receiptOut. */
export function merchantOut51(ex) {
  const m = ex?.merchant51;
  if (!m) return { merchant_source: null, merchant_label: null, org_number: ex?.org_number ?? null };
  return { merchant_source: m.source ?? null, merchant_label: MERCHANT_LABELS51[m.source] ?? null, org_number: m.org_number ?? ex?.org_number ?? null };
}
export { parseJ as _parse51 };
export const BRREG51_PATH = join('data', 'brreg51.sqlite');
