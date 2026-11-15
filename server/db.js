import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';
import './secret86.js'; // prompt 86: må lastes før databasen åpnes (avgjør «ny installasjon» ut fra om homelab.db finnes)
import { bootStep } from './boot36.js'; // prompt 36: oppstartsstatus

mkdirSync(join(config.dataDir, 'uploads'), { recursive: true });

export const db = new Database(join(config.dataDir, 'homelab.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  name TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  last_ip TEXT,
  paused INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  pw_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'bruker' CHECK (role IN ('admin','bruker')),
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER NOT NULL DEFAULT -1,
  recovery_hashes TEXT NOT NULL DEFAULT '[]',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  user TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user, key)
);
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  store TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Annet',
  amount REAL NOT NULL DEFAULT 0,
  file TEXT,
  thumb TEXT,
  mime TEXT,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade INTEGER,
  tests TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
`);

// Prompt 06: hovedadmin (første bruker / eieren). Visningsnavnet ligger i users.name (display name).
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='is_main_admin'").get()) db.exec('ALTER TABLE users ADD COLUMN is_main_admin INTEGER NOT NULL DEFAULT 0');

// CV er offentlig og har én eier.
export const OWNER = 'owner';

// Statement-cache: db.prepare() koster rundt 8 µs per kall og ble gjort på nytt for hver spørring (tusenvis per
// kalender- eller økonomiforespørsel). q(sql) kompilerer hver SQL-tekst én gang og gjenbruker setningen.
// Modusene pluck/raw/expand nullstilles ved hver utlevering, så q(sql).pluck() ett sted ikke smitter over på neste
// bruker av samme SQL. Bygges SQL-en dynamisk (f.eks. «IN (?,?,?)»), holder grensen cachen liten (eldste ut først).
const STMTS = new Map();
const MAX_STMTS = 2000;
export function q(sql) {
  let s = STMTS.get(sql);
  if (s) {
    if (s.reader) { s.pluck(false); s.raw(false); s.expand(false); }
    return s;
  }
  s = db.prepare(sql);
  if (STMTS.size >= MAX_STMTS) STMTS.delete(STMTS.keys().next().value);
  STMTS.set(sql, s);
  return s;
}

// kv lest én gang per forespørsel: samme (bruker, nøkkel) leses ofte hundrevis av ganger i én forespørsel
// (kalenderinnstillinger per hendelse, økonomi-innstillinger per måned). withKvMemo() gir forespørselen et minne
// med råteksten fra databasen; JSON.parse kjøres fortsatt per kall, så hver leser får sitt eget objekt og kan endre
// det fritt. Enhver skriving i prosessen (kv.set/del/delPrefix eller kvMemoReset()) øker generasjonen og tømmer
// alle minner, også i forespørsler som venter (SSE, AI-kall), så ingen leser en utdatert verdi.
const kvScope = new AsyncLocalStorage();
let kvGen = 0;
/** Kjør fn med kv-minne for denne forespørselen (mellomvare i index.js for /api og /finans/api). */
export const withKvMemo = (fn) => kvScope.run({ gen: kvGen, map: new Map() }, fn);
/** Kalles etter skriving til kv utenom kv-objektet (f.eks. gjenoppretting fra backup). */
export const kvMemoReset = () => { kvGen++; };
const kvRaw = (user, key) => {
  const m = kvScope.getStore();
  // I en transaksjon huskes ingenting: rulles den tilbake, ville minnet ellers holdt på en verdi som aldri ble lagret.
  if (!m || db.inTransaction) return q('SELECT value FROM kv WHERE user=? AND key=?').pluck().get(user, key);
  if (m.gen !== kvGen) { m.map.clear(); m.gen = kvGen; }
  const k = user + '\u0000' + key;
  let v = m.map.get(k);
  if (v === undefined) { v = q('SELECT value FROM kv WHERE user=? AND key=?').pluck().get(user, key) ?? null; m.map.set(k, v); }
  return v;
};

export const kv = {
  get(user, key, fallback = null) {
    const raw = kvRaw(user, key);
    return raw != null ? JSON.parse(raw) : fallback;
  },
  set(user, key, value) {
    kvGen++;
    q('INSERT INTO kv(user,key,value) VALUES(?,?,?) ON CONFLICT(user,key) DO UPDATE SET value=excluded.value')
      .run(user, key, JSON.stringify(value));
  },
  del(user, key) { kvGen++; q('DELETE FROM kv WHERE user=? AND key=?').run(user, key); },
  delPrefix(user, prefix) { kvGen++; q("DELETE FROM kv WHERE user=? AND key LIKE ? ESCAPE '\\'").run(user, prefix.replace(/[%_\\]/g, '\\$&') + '%'); },
};

// Startdata første gang, så dashboardet ikke er tomt.
if (!db.prepare('SELECT 1 FROM grades LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO grades(user,subject,grade,tests,sort) VALUES(?,?,?,?,?)');
  [['Matematikk R2', 5, '4, 5, 5'], ['Fysikk 2', 4, '4, 4, 5'], ['Norsk', 5, '5, 5'], ['Engelsk', 6, '6, 5'], ['Historie', 4, '4, 3, 5']]
    .forEach(([s, g, t], i) => ins.run(OWNER, s, g, t, i));
}

bootStep('db', 'ok'); // prompt 36: databasen er åpnet og grunntabellene finnes
