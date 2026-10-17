import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

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

// CV er offentlig og har én eier.
export const OWNER = 'owner';

export const kv = {
  get(user, key, fallback = null) {
    const row = db.prepare('SELECT value FROM kv WHERE user=? AND key=?').get(user, key);
    return row ? JSON.parse(row.value) : fallback;
  },
  set(user, key, value) {
    db.prepare('INSERT INTO kv(user,key,value) VALUES(?,?,?) ON CONFLICT(user,key) DO UPDATE SET value=excluded.value')
      .run(user, key, JSON.stringify(value));
  },
  del(user, key) { db.prepare('DELETE FROM kv WHERE user=? AND key=?').run(user, key); },
  delPrefix(user, prefix) { db.prepare("DELETE FROM kv WHERE user=? AND key LIKE ? ESCAPE '\\'").run(user, prefix.replace(/[%_\\]/g, '\\$&') + '%'); },
};

// Startdata første gang, så dashboardet ikke er tomt.
if (!db.prepare('SELECT 1 FROM grades LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO grades(user,subject,grade,tests,sort) VALUES(?,?,?,?,?)');
  [['Matematikk R2', 5, '4, 5, 5'], ['Fysikk 2', 4, '4, 4, 5'], ['Norsk', 5, '5, 5'], ['Engelsk', 6, '6, 5'], ['Historie', 4, '4, 3, 5']]
    .forEach(([s, g, t], i) => ins.run(OWNER, s, g, t, i));
}
