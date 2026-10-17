// Backup og gjenoppretting.
// - Nedlasting: full JSON (FinansHub-tabellene, brukes til gjenoppretting), Excel-database (ett ark per tabell) og CSV.
// - SMB-share: øyeblikksbilde av hele SQLite-databasen + kvitteringsbilder + innstillinger → tar.gz → AES-256-GCM,
//   lastet opp med smbclient. Tidsplan, antall versjoner, test og gjenoppretting.
// - Gjenoppretting er idempotent og beholder ID-er: samme fil to ganger gir samme resultat.
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { readFile, stat, mkdir, unlink, open } from 'node:fs/promises';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { Readable, Writable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { db, kv, OWNER, settings, saveSettings, secret } from './db.js';
import { config } from '../config.js';
import { writeXlsx, readXlsxSheets, fromSerial } from './xlsx.js';
import { cachedStocks } from './stocks.js';

const q = (sql) => db.prepare(sql);
const DATA = resolve(config.dataDir);
const WORK = join(DATA, 'backups');
mkdirSync(WORK, { recursive: true });
const today = () => new Date().toLocaleDateString('sv-SE');

/* ---------------- Tabeller ---------------- */

const SKIP = new Set(['fh_tokens', 'fh_embed', 'fh_backups']);
export const fhTables = () => q("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fh\\_%' ESCAPE '\\' AND name NOT LIKE 'fh\\_fts%' ESCAPE '\\'").pluck().all().filter((t) => !SKIP.has(t));
const columns = (t, schema = 'main') => db.prepare(`PRAGMA ${schema}.table_info(${t})`).all().map((c) => c.name);
const ORE = { fh_accounts: ['opening_balance'], fh_transactions: ['amount'], fh_receipts: ['total'], fh_budgets: ['amount'], fh_recurring: ['amount'], fh_goals: ['saved', 'target'],
  fh_subscriptions: ['price'], fh_folder_entries: ['amount'], fh_folder_projects: ['budget'], fh_project_installments: ['amount'], fh_finn: ['amount'] };
const DATECOLS = new Set(['date', 'next_date', 'next_due', 'due']);
const MSCOLS = new Set(['created', 'last_used', 'expires', 'paid_at', 'started']);

export function exportJson() {
  const tables = {};
  for (const t of fhTables()) tables[t] = q(`SELECT * FROM ${t}`).all();
  return { format: 'finanshub-backup', version: 2, created: new Date().toISOString(), note: 'Beløp i øre. Kvitteringsbildene ligger i data/receipts (med i SMB-backupen).', settings: settings(), tables };
}

/* ---------------- Excel-database ---------------- */

const SHEET_OF = { fh_accounts: 'Kontoer', fh_categories: 'Kategorier', fh_transactions: 'Transaksjoner', fh_receipts: 'Kvitteringer', fh_budgets: 'Budsjett', fh_recurring: 'Faste_utgifter',
  fh_rules: 'Regler', fh_goals: 'Sparemål', fh_subscriptions: 'Abonnementer', fh_folders: 'Mapper', fh_folder_members: 'Mappemedlemmer', fh_folder_entries: 'Mappeposter',
  fh_folder_projects: 'Prosjekter', fh_project_installments: 'Avdrag', fh_folder_bills: 'Regninger', fh_finn: 'Finn' };
const LABEL = { id: 'ID', name: 'Navn', date: 'Dato', amount: 'Beløp (kr)', description: 'Beskrivelse', merchant: 'Butikk', category_id: 'Kategori-ID', account_id: 'Konto-ID', note: 'Notat',
  source: 'Kilde', created: 'Opprettet (ms)', total: 'Total (kr)', status: 'Status', bank: 'Bank', type: 'Type', last4: 'Siste 4', opening_balance: 'Startsaldo (kr)', color: 'Farge', kind: 'Art',
  sort: 'Sortering', month: 'Måned', pattern: 'Mønster', priority: 'Prioritet', transaction_id: 'Transaksjons-ID', folder_id: 'Mappe-ID', project_id: 'Prosjekt-ID', price: 'Pris per trekk (kr)',
  cycle: 'Intervall', next_date: 'Neste trekk', budget: 'Budsjett (kr)', saved: 'Spart (kr)', target: 'Mål (kr)' };

export function exportXlsx() {
  const tables = fhTables();
  const counts = [];
  const sheets = [];
  const tableSheet = (t) => {
    const cols = columns(t).map((key) => ({ key, label: LABEL[key] ?? key, type: ORE[t]?.includes(key) ? 'kr' : DATECOLS.has(key) ? 'date' : MSCOLS.has(key) ? 'int' : /(^id|_id)$/.test(key) ? 'int' : undefined }));
    const rows = q(`SELECT * FROM ${t}`).all().map((r) => { const o = { ...r }; for (const c of ORE[t] ?? []) if (o[c] != null) o[c] = o[c] / 100; return o; });
    counts.push([SHEET_OF[t] ?? t, rows.length]);
    return { name: SHEET_OF[t] ?? t.slice(3), table: t, columns: cols, rows };
  };
  const byName = Object.fromEntries(tables.map((t) => [t, tableSheet(t)]));
  // Varelinjer hentes fra kvitteringenes AI-uttrekk.
  const lines = [];
  for (const r of q('SELECT id, merchant, date, extraction FROM fh_receipts WHERE extraction IS NOT NULL').all()) {
    let ex; try { ex = JSON.parse(r.extraction); } catch { continue; }
    (ex?.lines ?? []).forEach((l, i) => lines.push({ receipt_id: r.id, nr: i + 1, merchant: r.merchant, date: r.date, description: l.description, quantity: l.quantity, amount: l.amount }));
  }
  counts.push(['Varelinjer', lines.length]);
  const st = cachedStocks();
  const extra = {
    Varelinjer: { name: 'Varelinjer', columns: [{ key: 'receipt_id', label: 'Kvitterings-ID' }, { key: 'nr', label: 'Linje', type: 'int' }, { key: 'merchant', label: 'Butikk' }, { key: 'date', label: 'Dato', type: 'date' }, { key: 'description', label: 'Vare', width: 36 }, { key: 'quantity', label: 'Antall', type: 'num' }, { key: 'amount', label: 'Beløp (kr)', type: 'kr' }], rows: lines },
    Aksjer: { name: 'Aksjer', columns: [{ key: 'ticker', label: 'Ticker' }, { key: 'name', label: 'Navn' }, { key: 'quantity', label: 'Antall', type: 'num' }, { key: 'avg', label: 'Snittkurs', type: 'kr' }, { key: 'price', label: 'Kurs', type: 'kr' }, { key: 'value', label: 'Verdi', type: 'kr' }, { key: 'pl', label: 'Avkastning', type: 'kr' }, { key: 'currency', label: 'Valuta' }], rows: st?.positions ?? [] },
    Utbytte: { name: 'Utbytte', columns: [{ key: 'date', label: 'Dato', type: 'date' }, { key: 'ticker', label: 'Ticker' }, { key: 'amount', label: 'Beløp', type: 'kr' }, { key: 'quantity', label: 'Antall', type: 'num' }], rows: st?.dividends ?? [] },
    Ordre: { name: 'Ordre', columns: [{ key: 'date', label: 'Dato', type: 'date' }, { key: 'ticker', label: 'Ticker' }, { key: 'side', label: 'Side' }, { key: 'quantity', label: 'Antall', type: 'num' }, { key: 'price', label: 'Kurs', type: 'kr' }, { key: 'value', label: 'Verdi', type: 'kr' }], rows: st?.orders ?? [] },
  };
  // Rekkefølge som i designet, deretter modultabellene.
  const CORE = ['fh_accounts', 'fh_categories', 'fh_transactions', 'fh_receipts', 'Varelinjer', 'fh_budgets', 'fh_recurring', 'Aksjer', 'Utbytte', 'Ordre', 'fh_rules'];
  for (const k of CORE) { const sh = extra[k] ?? byName[k]; if (sh) sheets.push(sh); }
  for (const t of tables) if (!CORE.includes(t)) sheets.push(byName[t]);
  const info = { name: 'Info', columns: [{ key: 'k', label: 'Felt', width: 28 }, { key: 'v', label: 'Verdi', width: 60 }], rows: [
    { k: 'Laget', v: new Date().toLocaleString('nb-NO') }, { k: 'Format', v: 'FinansHub Excel-database v2' },
    { k: 'Beløp', v: 'Lagret som tall i kroner. Negativt beløp = utgift.' }, { k: 'Koblinger', v: 'ID-kolonnene (Kategori-ID, Konto-ID, Transaksjons-ID …) peker til ID i de andre arkene.' },
    { k: 'Gjenoppretting', v: 'Filen kan importeres under Innstillinger → Backup og data. Aksjer, Utbytte, Ordre og Varelinjer er bare til oversikt.' },
    ...counts.map(([n, c]) => ({ k: `Rader i ${n}`, v: c })) ] };
  return writeXlsx([info, ...sheets.map(({ table, ...s }) => s)]);
}

function xlsxToTables(buf) {
  const sheets = readXlsxSheets(buf);
  const tables = {};
  const rev = Object.fromEntries(Object.entries(SHEET_OF).map(([t, n]) => [n, t]));
  const revLabel = Object.fromEntries(Object.entries(LABEL).map(([k, v]) => [v, k]));
  for (const [name, rows] of Object.entries(sheets)) {
    const t = rev[name] ?? (fhTables().includes('fh_' + name) ? 'fh_' + name : null);
    if (!t || !rows.length) continue;
    const cols = columns(t);
    const head = rows[0].map((h) => { const k = revLabel[h] ?? h; return cols.includes(k) ? k : null; });
    tables[t] = rows.slice(1).filter((r) => r.some((c) => c !== '')).map((r) => {
      const o = {};
      head.forEach((k, i) => {
        if (!k) return;
        let v = r[i] === '' ? null : r[i];
        if (v != null && ORE[t]?.includes(k)) v = Math.round(+v * 100);
        else if (v != null && DATECOLS.has(k) && typeof v === 'number') v = fromSerial(v);
        o[k] = v;
      });
      return o;
    });
  }
  return tables;
}

/* ---------------- Gjenoppretting (JSON/Excel) ---------------- */

function normalizeDump(d) {
  if (d?.format === 'finanshub-backup') return d.tables ?? {};
  // Eldre /export.json: nøkler uten fh_-prefiks.
  const out = {};
  for (const [k, v] of Object.entries(d ?? {})) if (Array.isArray(v)) out[k.startsWith('fh_') ? k : 'fh_' + k] = v;
  return out;
}
export function countRows(tables) {
  const known = new Set(fhTables());
  return Object.fromEntries(Object.entries(tables).filter(([t]) => known.has(t)).map(([t, rows]) => [t, rows.length]));
}
export const currentCounts = () => Object.fromEntries(fhTables().map((t) => [t, q(`SELECT count(*) FROM ${t}`).pluck().get()]));

// Upsert med bevarte ID-er. Fremmednøkler er av under importen slik at rekkefølgen ikke spiller noen rolle.
export function restoreTables(tables, settingsPatch) {
  const known = new Set(fhTables());
  const done = {};
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const [t, rows] of Object.entries(tables)) {
        if (!known.has(t) || !Array.isArray(rows)) continue;
        const cols = new Set(columns(t));
        let n = 0;
        for (const r of rows) {
          const keys = Object.keys(r).filter((k) => cols.has(k));
          if (!keys.length) continue;
          db.prepare(`INSERT OR REPLACE INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => (r[k] !== null && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k])));
          n++;
        }
        done[t] = n;
      }
      if (settingsPatch && typeof settingsPatch === 'object') saveSettings(settingsPatch);
    })();
  } finally { db.pragma('foreign_keys = ON'); }
  kv.set(OWNER, 'fh_firstrun', { done: true, at: Date.now(), via: 'restore' });
  return done;
}

/* ---------------- Arkiv: tar + gzip + AES-256-GCM ---------------- */

const MAGIC = Buffer.from('FHBK1\n');
function tarHeader(name, size, mtime) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) { const i = name.lastIndexOf('/', 154); prefix = name.slice(0, i); name = name.slice(i + 1); }
  h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124); h.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263); h.write(prefix, 345, 155);
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
async function* tarEntries(entries) {
  for (const e of entries) {
    if (e.data) { yield tarHeader(e.name, e.data.length, Date.now()); yield e.data; if (e.data.length % 512) yield Buffer.alloc(512 - (e.data.length % 512)); continue; }
    const st = statSync(e.path);
    yield tarHeader(e.name, st.size, st.mtimeMs);
    for await (const chunk of createReadStream(e.path)) yield chunk;
    if (st.size % 512) yield Buffer.alloc(512 - (st.size % 512));
  }
  yield Buffer.alloc(1024);
}
// Tar-leser som skriver filene til en mappe. Avviser stier som prøver å gå ut av mappen.
function untar(dest) {
  let buf = Buffer.alloc(0), file = null, left = 0, pad = 0;
  return new Writable({
    async write(chunk, _enc, cb) {
      try {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
          if (file) {
            if (left > 0) { if (!buf.length) break; const n = Math.min(left, buf.length); file.write(buf.subarray(0, n)); buf = buf.subarray(n); left -= n; if (left > 0) break; }
            await new Promise((r) => file.end(r)); file = null;
          }
          if (pad > 0) { if (buf.length < pad) break; buf = buf.subarray(pad); pad = 0; }
          if (buf.length < 512) break;
          const h = buf.subarray(0, 512); buf = buf.subarray(512);
          if (h.every((b) => b === 0)) continue;
          const cstr = (a, b) => h.toString('utf8', a, b).replace(/\0.*$/s, '');
          const name = [cstr(345, 500), cstr(0, 100)].filter(Boolean).join('/');
          const size = parseInt(cstr(124, 136).trim(), 8) || 0;
          const target = resolve(dest, name);
          if (!target.startsWith(resolve(dest) + sep) || h[156] !== 0x30 && h[156] !== 0) { left = 0; pad = size + ((512 - (size % 512)) % 512); continue; }
          mkdirSync(dirname(target), { recursive: true });
          file = createWriteStream(target); left = size; pad = (512 - (size % 512)) % 512;
          if (!size) { await new Promise((r) => file.end(r)); file = null; }
        }
        cb();
      } catch (e) { cb(e); }
    },
    final(cb) { if (file) file.end(cb); else cb(); },
  });
}
const keyOf = (phrase, salt) => scryptSync(String(phrase), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
function encryptStream(phrase, out) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(phrase, salt), iv);
  out.write(Buffer.concat([MAGIC, salt, iv]));
  return new Transform({ transform(ch, _e, cb) { cb(null, c.update(ch)); }, flush(cb) { this.push(c.final()); this.push(c.getAuthTag()); cb(); } });
}
async function decryptFile(path, phrase, outPath) {
  const st = await stat(path);
  // Hode (magic, salt, iv) og haletag leses direkte; selve dataene strømmes.
  const head = Buffer.alloc(MAGIC.length + 28);
  const fd = await open(path, 'r');
  await fd.read(head, 0, head.length, 0);
  const tag = Buffer.alloc(16); await fd.read(tag, 0, 16, st.size - 16); await fd.close();
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Filen er ikke en kryptert FinansHub-backup');
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16), iv = head.subarray(MAGIC.length + 16, MAGIC.length + 28);
  const d = createDecipheriv('aes-256-gcm', keyOf(phrase, salt), iv); d.setAuthTag(tag);
  try { await pipeline(createReadStream(path, { start: head.length, end: st.size - 17 }), d, createWriteStream(outPath)); }
  catch { throw new Error('Feil passfrase, eller filen er skadet'); }
}

export async function buildArchive(c, phrase) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const name = `homelab-backup-${stamp}.tar.gz${c.smbEncrypt ? '.enc' : ''}`;
  const out = join(WORK, name);
  const entries = [];
  const parts = [];
  if (c.smbDb) {
    const snap = join(WORK, `snapshot-${randomUUID()}.db`);
    await db.backup(snap);
    entries.push({ name: 'homelab.db', path: snap, tmp: true }); parts.push('database');
  }
  if (c.smbReceipts) {
    for (const dir of ['receipts', 'uploads']) {
      const root = join(DATA, dir);
      if (!existsSync(root)) continue;
      const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (f.isFile()) entries.push({ name: relative(DATA, p).split(sep).join('/'), path: p }); } };
      walk(root);
    }
    parts.push('kvitteringsbilder');
  }
  if (c.smbSettings) { entries.push({ name: 'settings.json', data: Buffer.from(JSON.stringify(q('SELECT * FROM kv').all())) }); parts.push('innstillinger'); }
  entries.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify({ format: 'homelab-backup', version: 1, created: new Date().toISOString(), parts, counts: currentCounts() })) });
  const ws = createWriteStream(out);
  try {
    if (c.smbEncrypt) await pipeline(Readable.from(tarEntries(entries)), createGzip(), encryptStream(phrase, ws), ws);
    else await pipeline(Readable.from(tarEntries(entries)), createGzip(), ws);
  } finally { for (const e of entries) if (e.tmp) await unlink(e.path).catch(() => {}); }
  return { name, path: out, size: statSync(out).size, parts };
}

/* ---------------- SMB ---------------- */

const PROTO = { '3.1.1': 'SMB3_11', '3.0': 'SMB3_00', '2.1': 'SMB2_10' };
export const normShare = (s) => { const v = String(s ?? '').trim().replace(/\\/g, '/').replace(/^\/*/, '//').replace(/\/+$/, ''); return /^\/\/[A-Za-z0-9.\-]+\/[^/'"`;|&$]+(\/[^'"`;|&$]+)?$/.test(v) ? v : null; };
const safeDir = (d) => String(d ?? '').replace(/\\/g, '/').split('/').map((x) => x.trim()).filter((x) => x && x !== '.' && x !== '..' && /^[\w .\-æøåÆØÅ]+$/.test(x)).join('/');
export const smbConfig = () => { const st = settings(); return { on: st.smbOn, share: st.smbShare, dir: st.smbDir, version: st.smbVersion, user: st.smbUser, domain: st.smbDomain, schedule: st.smbSchedule, keep: st.smbKeep,
  db: st.smbDb, receipts: st.smbReceipts, settings: st.smbSettings, encrypt: st.smbEncrypt, pwSet: !!secret('smbPass'), phraseSet: !!secret('backupPhrase') }; };

let hasSmbclient = null;
export async function smbAvailable() {
  if (hasSmbclient !== null) return hasSmbclient;
  hasSmbclient = await new Promise((r) => execFile('smbclient', ['--version'], { timeout: 5000 }, (e) => r(!e)));
  return hasSmbclient;
}
function smb(cmd, { timeout = 120_000 } = {}) {
  const st = settings(), share = normShare(st.smbShare);
  if (!share) return Promise.reject(new Error('Ugyldig share. Bruk formen //server/share eller \\\\server\\share'));
  // Brukernavn og passord går via en midlertidig autentiseringsfil (mode 600), aldri på kommandolinjen.
  const auth = join(WORK, `.smbauth-${randomUUID()}`);
  writeFileSync(auth, `username = ${st.smbUser || 'guest'}\npassword = ${secret('smbPass')}\ndomain = ${st.smbDomain || 'WORKGROUP'}\n`, { mode: 0o600 });
  chmodSync(auth, 0o600);
  const args = [share, '-A', auth, '-m', PROTO[st.smbVersion] ?? 'SMB3', '--option=client min protocol=' + (PROTO[st.smbVersion] ?? 'SMB2_10'), '-c', cmd];
  return new Promise((res, rej) => execFile('smbclient', args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (e, stdout, stderr) => {
    rmSync(auth, { force: true });
    if (e) {
      const msg = `${stderr || ''}${stdout || ''}`;
      if (e.code === 'ENOENT') return rej(new Error('smbclient er ikke installert på serveren (apt install smbclient)'));
      if (/LOGON_FAILURE/.test(msg)) return rej(new Error('Feil brukernavn eller passord for sharen'));
      if (/BAD_NETWORK_NAME/.test(msg)) return rej(new Error('Fant ikke sharen på serveren'));
      if (/HOST_UNREACHABLE|Connection to .* failed|NT_STATUS_IO_TIMEOUT|CONNECTION_REFUSED/.test(msg)) return rej(new Error('Fikk ikke kontakt med serveren'));
      return rej(new Error((msg.split('\n').find((l) => /NT_STATUS|ERR|error/i.test(l)) || e.message).trim().slice(0, 200)));
    }
    res(stdout);
  }));
}
const cdDir = () => { const d = safeDir(settings().smbDir); return d ? d.split('/').map((p) => `mkdir "${p}"; cd "${p}"`).join('; ') + '; ' : ''; };

export async function smbTest() {
  if (!(await smbAvailable())) return { ok: false, message: 'smbclient er ikke installert på serveren (apt install smbclient)' };
  try {
    const out = await smb(`${cdDir()}ls`, { timeout: 30_000 });
    const n = parseListing(out).length;
    return { ok: true, message: `Tilkoblet ${normShare(settings().smbShare)}${safeDir(settings().smbDir) ? '/' + safeDir(settings().smbDir) : ''} · ${n} backup${n === 1 ? '' : 'er'} funnet` };
  } catch (e) { return { ok: false, message: e.message }; }
}
function parseListing(out) {
  const rows = [];
  for (const line of String(out).split('\n')) {
    const m = line.match(/^\s+(homelab-backup-[^\s]+)\s+[A-Z]*\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s*$/);
    if (m) rows.push({ file: m[1], size: +m[2], when: Date.parse(m[3]) || null });
  }
  return rows.sort((a, b) => b.file.localeCompare(a.file));
}
export async function smbList() {
  const local = q('SELECT * FROM fh_backups ORDER BY created DESC LIMIT 60').all();
  let remote = null, error = null;
  if (settings().smbShare) { try { remote = parseListing(await smb(`${cdDir()}ls`, { timeout: 30_000 })); } catch (e) { error = e.message; } }
  const seen = new Set();
  const items = [];
  for (const r of remote ?? []) {
    seen.add(r.file);
    const l = local.find((x) => x.file === r.file);
    items.push({ file: r.file, created: l?.created ?? r.when, size: r.size, kind: r.file.endsWith('.enc') ? 'Kryptert' : 'Ukryptert', status: 'ok', onShare: true });
  }
  for (const l of local) if (!seen.has(l.file)) items.push({ file: l.file, created: l.created, size: l.size, kind: l.kind === 'smb' ? (l.file.endsWith('.enc') ? 'Kryptert' : 'Ukryptert') : l.kind, status: l.status, error: l.error, onShare: false });
  return { items: items.sort((a, b) => (b.created ?? 0) - (a.created ?? 0)), error };
}

let running = null;
export const backupRunning = () => running;
export async function runBackup(reason = 'manuell') {
  if (running) return { started: false, message: 'En backup kjører allerede' };
  const st = settings();
  if (!normShare(st.smbShare)) return { started: false, message: 'Sett opp SMB-share først' };
  if (st.smbEncrypt && !secret('backupPhrase')) return { started: false, message: 'Legg inn en passfrase for kryptering, eller slå av kryptering' };
  if (!st.smbDb && !st.smbReceipts && !st.smbSettings) return { started: false, message: 'Velg hva backupen skal inneholde' };
  const row = q("INSERT INTO fh_backups(file,kind,status,created) VALUES(?, 'smb', 'running', ?) RETURNING id").get('…', Date.now());
  running = { id: row.id, started: Date.now(), reason };
  (async () => {
    let file = null;
    try {
      const a = await buildArchive({ smbDb: st.smbDb, smbReceipts: st.smbReceipts, smbSettings: st.smbSettings, smbEncrypt: st.smbEncrypt }, secret('backupPhrase'));
      file = a;
      q('UPDATE fh_backups SET file=?, size=? WHERE id=?').run(a.name, a.size, row.id);
      await smb(`${cdDir()}put "${a.path}" "${a.name}"`, { timeout: 30 * 60_000 });
      await prune();
      q("UPDATE fh_backups SET status='ok' WHERE id=?").run(row.id);
      kv.set(OWNER, 'fh_backup_last', { at: Date.now(), sig: changeSig(), file: a.name });
    } catch (e) {
      console.warn('[backup]', e.message);
      q("UPDATE fh_backups SET status='failed', error=? WHERE id=?").run(e.message.slice(0, 300), row.id);
    } finally {
      if (file) await unlink(file.path).catch(() => {});
      running = null;
    }
  })();
  return { started: true, id: row.id };
}
async function prune() {
  const keep = Math.max(1, +settings().smbKeep || 14);
  const list = parseListing(await smb(`${cdDir()}ls`, { timeout: 30_000 }));
  const old = list.slice(keep);
  if (old.length) await smb(`${cdDir()}${old.map((f) => `del "${f.file}"`).join('; ')}`, { timeout: 60_000 });
}

/* ---------------- Klargjøring (forhåndsvisning) og gjenoppretting ---------------- */

const stages = new Map(); // id → { kind, path?, tables?, settings?, dir?, counts, created }
setInterval(() => { for (const [id, s] of stages) if (Date.now() - s.created > 3600_000) { if (s.dir) rmSync(s.dir, { recursive: true, force: true }); stages.delete(id); } }, 600_000).unref?.();

async function stageArchive(path, phrase) {
  const dir = join(WORK, `restore-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  let src = path;
  const head = Buffer.alloc(MAGIC.length);
  const fd = await open(path, 'r'); await fd.read(head, 0, head.length, 0); await fd.close();
  if (head.equals(MAGIC)) {
    if (!phrase) throw new Error('Backupen er kryptert – skriv inn passfrasen');
    src = join(dir, 'archive.tar.gz');
    await decryptFile(path, phrase, src);
  }
  await pipeline(createReadStream(src), createGunzip(), untar(join(dir, 'files')));
  const root = join(dir, 'files');
  const manifest = existsSync(join(root, 'manifest.json')) ? JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) : null;
  let counts = manifest?.counts ?? {};
  if (existsSync(join(root, 'homelab.db'))) {
    const bk = new (db.constructor)(join(root, 'homelab.db'), { readonly: true });
    counts = Object.fromEntries(bk.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fh\\_%' ESCAPE '\\' AND name NOT LIKE 'fh\\_fts%' ESCAPE '\\'").pluck().all().filter((t) => !SKIP.has(t)).map((t) => [t, bk.prepare(`SELECT count(*) FROM ${t}`).pluck().get()]));
    counts.users = bk.prepare("SELECT count(*) FROM sqlite_master WHERE name='users'").pluck().get() ? bk.prepare('SELECT count(*) FROM users').pluck().get() : 0;
    bk.close();
  }
  const files = (d) => (existsSync(d) ? readdirSync(d, { recursive: true, withFileTypes: true }).filter((f) => f.isFile()).length : 0);
  counts.receipt_files = files(join(root, 'receipts'));
  return { kind: 'archive', dir, root, counts, parts: manifest?.parts ?? [], created: Date.now() };
}

export async function stage({ file, remote, phrase }) {
  let s;
  if (remote) {
    if (!/^homelab-backup-[\w.\-]+$/.test(remote)) throw new Error('Ugyldig filnavn');
    const local = join(WORK, `dl-${randomUUID()}-${remote}`);
    await smb(`${cdDir()}get "${remote}" "${local}"`, { timeout: 30 * 60_000 });
    try { s = await stageArchive(local, phrase || secret('backupPhrase')); } finally { await unlink(local).catch(() => {}); }
    s.label = remote;
  } else if (file) {
    const name = String(file.name ?? '').toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    if (name.endsWith('.json') || buf[0] === 0x7b) {
      let d; try { d = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch { throw new Error('JSON-filen kunne ikke leses'); }
      const tables = normalizeDump(d);
      s = { kind: 'json', tables, settings: d.settings ?? null, counts: countRows(tables), created: Date.now() };
    } else if (name.endsWith('.xlsx') || (buf[0] === 0x50 && buf[1] === 0x4b)) {
      const tables = xlsxToTables(buf);
      s = { kind: 'xlsx', tables, counts: countRows(tables), created: Date.now() };
    } else {
      const tmp = join(WORK, `up-${randomUUID()}`);
      writeFileSync(tmp, buf);
      try { s = await stageArchive(tmp, phrase || secret('backupPhrase')); } finally { await unlink(tmp).catch(() => {}); }
    }
    s.label = file.name;
  } else throw new Error('Velg en fil eller en backup på sharen');
  const id = randomUUID();
  stages.set(id, s);
  return { stageId: id, kind: s.kind, label: s.label, counts: s.counts, current: currentCounts(), parts: s.parts ?? null };
}

export async function restore(stageId) {
  const s = stages.get(stageId);
  if (!s) throw new Error('Forhåndsvisningen er utløpt – velg filen på nytt');
  let result;
  if (s.kind === 'json' || s.kind === 'xlsx') result = restoreTables(s.tables, s.kind === 'json' ? s.settings : null);
  else {
    result = {};
    const dbFile = join(s.root, 'homelab.db');
    if (existsSync(dbFile)) result = restoreDatabase(dbFile);
    else if (existsSync(join(s.root, 'settings.json'))) {
      const rows = JSON.parse(await readFile(join(s.root, 'settings.json'), 'utf8'));
      const ins = q('INSERT OR REPLACE INTO kv(user,key,value) VALUES(?,?,?)');
      db.transaction(() => rows.forEach((r) => ins.run(r.user, r.key, r.value)))();
      result.kv = rows.length;
    }
    // Bildene kopieres på plass (overskriver filer med samme navn).
    let files = 0;
    for (const dir of ['receipts', 'uploads']) {
      const src = join(s.root, dir);
      if (!existsSync(src)) continue;
      for (const f of readdirSync(src, { recursive: true, withFileTypes: true })) {
        if (!f.isFile()) continue;
        const from = join(f.parentPath ?? f.path, f.name), to = join(DATA, dir, relative(src, from));
        await mkdir(dirname(to), { recursive: true });
        await pipeline(createReadStream(from), createWriteStream(to));
        files++;
      }
    }
    result.receipt_files = files;
    kv.set(OWNER, 'fh_firstrun', { done: true, at: Date.now(), via: 'restore' });
  }
  if (s.dir) rmSync(s.dir, { recursive: true, force: true });
  stages.delete(stageId);
  return result;
}

// Hele databasen: hver tabell i backupen erstatter tabellen her (felles kolonner), unntatt pågående økter.
function restoreDatabase(file) {
  const out = {};
  db.pragma('foreign_keys = OFF');
  db.prepare('ATTACH DATABASE ? AS bk').run(file);
  try {
    const tables = db.prepare("SELECT name FROM bk.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fh\\_fts%' ESCAPE '\\'").pluck().all()
      .filter((t) => !['sessions', 'devices'].includes(t));
    const mine = new Set(db.prepare("SELECT name FROM main.sqlite_master WHERE type='table'").pluck().all());
    db.transaction(() => {
      for (const t of tables) {
        if (!mine.has(t)) continue;
        const cols = columns(t, 'bk').filter((c) => columns(t).includes(c));
        if (!cols.length) continue;
        db.prepare(`DELETE FROM main.${t}`).run();
        out[t] = db.prepare(`INSERT INTO main.${t} (${cols.join(',')}) SELECT ${cols.join(',')} FROM bk.${t}`).run().changes;
      }
    })();
  } finally {
    db.prepare('DETACH DATABASE bk').run();
    db.pragma('foreign_keys = ON');
  }
  return out;
}

/* ---------------- Tidsplan ---------------- */

const changeSig = () => q(`SELECT (SELECT count(*)||':'||ifnull(max(id),0) FROM fh_transactions)||'|'||(SELECT count(*)||':'||ifnull(max(created),0) FROM fh_receipts)||'|'||
  (SELECT count(*) FROM fh_folder_entries)||'|'||(SELECT count(*) FROM fh_subscriptions)||'|'||(SELECT ifnull(sum(length(value)),0) FROM kv)`).pluck().get();
export function nextRun(now = new Date()) {
  const s = settings().smbSchedule;
  if (!settings().smbOn || s === 'off') return null;
  if (s === 'change') return 'Etter neste endring (maks én per time)';
  const d = new Date(now); d.setHours(3, 0, 0, 0);
  if (s === 'daily') { if (d <= now) d.setDate(d.getDate() + 1); }
  else { d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); if (d <= now) d.setDate(d.getDate() + 7); }
  return d.getTime();
}
function due(now = new Date()) {
  const st = settings();
  if (!st.smbOn || st.smbSchedule === 'off' || running) return false;
  const last = kv.get(OWNER, 'fh_backup_last', { at: 0 });
  if (st.smbSchedule === 'change') return Date.now() - last.at > 3600_000 && changeSig() !== last.sig;
  const slot = new Date(now); slot.setHours(3, 0, 0, 0);
  if (now < slot) slot.setDate(slot.getDate() - 1);
  if (st.smbSchedule === 'weekly') while (slot.getDay() !== 0) slot.setDate(slot.getDate() - 1);
  return last.at < slot.getTime();
}
setInterval(() => { try { if (due()) runBackup('tidsplan'); } catch (e) { console.warn('[backup] tidsplan', e.message); } }, 5 * 60_000).unref?.();

export const needsFirstRun = () => !kv.get(OWNER, 'fh_firstrun', null)?.done && !q('SELECT 1 FROM fh_transactions LIMIT 1').get() && !q('SELECT 1 FROM fh_accounts LIMIT 1').get();
export const finishFirstRun = (via) => kv.set(OWNER, 'fh_firstrun', { done: true, at: Date.now(), via });
