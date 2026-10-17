// FinansHub: tabeller i samme SQLite-database som resten av homelab.
// Alle beløp lagres som heltall i øre for å unngå avrundingsfeil. Negativt = ut.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db, OWNER, kv } from '../db.js';
import { config } from '../config.js';

db.exec(`
CREATE TABLE IF NOT EXISTS fh_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bank TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'checking',      -- checking | savings | credit | cash
  last4 TEXT,                                  -- kun siste fire siffer
  opening_balance INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fh_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense',        -- expense | income | transfer
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fh_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER REFERENCES fh_accounts(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  merchant TEXT,
  category_id INTEGER REFERENCES fh_categories(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',       -- manual | csv | receipt | psd2
  external_id TEXT UNIQUE,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fh_tx_date ON fh_transactions(date);
CREATE TABLE IF NOT EXISTS fh_receipts (
  id TEXT PRIMARY KEY,
  file TEXT,
  scan TEXT,                                   -- nedskalert JPEG til AI
  thumb TEXT,
  mime TEXT,
  status TEXT NOT NULL,                        -- pending | processing | needs_review | booked | rejected | failed
  provider TEXT,
  model TEXT,
  seconds REAL,
  extraction TEXT,                             -- rått AI-svar (JSON)
  error TEXT,
  merchant TEXT,
  date TEXT,
  total INTEGER,
  category_id INTEGER REFERENCES fh_categories(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES fh_accounts(id) ON DELETE SET NULL,
  confidence REAL,
  transaction_id INTEGER REFERENCES fh_transactions(id) ON DELETE SET NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fh_budgets (
  category_id INTEGER NOT NULL REFERENCES fh_categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                         -- 'default' eller 'ÅÅÅÅ-MM'
  amount INTEGER NOT NULL,
  PRIMARY KEY (category_id, month)
);
CREATE TABLE IF NOT EXISTS fh_recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  interval TEXT NOT NULL DEFAULT 'monthly',    -- monthly | yearly | weekly
  day INTEGER NOT NULL DEFAULT 1,
  month INTEGER,                               -- for årlige
  category_id INTEGER REFERENCES fh_categories(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES fh_accounts(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  detected INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fh_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  category_id INTEGER REFERENCES fh_categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100
);
CREATE TABLE IF NOT EXISTS fh_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#5FD3A8'
);
CREATE TABLE IF NOT EXISTS fh_tokens (
  id TEXT PRIMARY KEY,                         -- HMAC av tokenet
  name TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER
);
`);

export const DEFAULT_CATEGORIES = [
  ['Mat og dagligvarer', '#FF9F5A', 'expense'], ['Restaurant og kafé', '#F2C14E', 'expense'], ['Transport og lading', '#7AA7FF', 'expense'],
  ['Bolig', '#B79CFF', 'expense'], ['Hjem', '#8FD3FF', 'expense'], ['Fritid og hobby', '#5FD3A8', 'expense'], ['Abonnementer', '#FF6B8B', 'expense'],
  ['Skole', '#C9E265', 'expense'], ['Annet', '#A0A0AA', 'expense'], ['Inntekt', '#9FE3C6', 'income'], ['Sparing', '#A0A0AA', 'transfer'], ['Overføring', '#6B6B75', 'transfer'],
];
const DEFAULT_RULES = [['REMA*', 'Mat og dagligvarer'], ['KIWI*', 'Mat og dagligvarer'], ['MENY*', 'Mat og dagligvarer'], ['COOP*', 'Mat og dagligvarer'],
  ['CIRCLE K*', 'Transport og lading'], ['RUTER*', 'Transport og lading'], ['SPOTIFY*', 'Abonnementer'], ['NETFLIX*', 'Abonnementer']];

export const DEFAULT_SETTINGS = {
  name: 'Sebastian', currency: 'NOK', monthStart: 1, yearGoal: 120000,
  provider: process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'ollama', fallback: (process.env.AI_FALLBACK ?? 'gemini') !== 'none',
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://192.168.1.30:11434', ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen2.5vl:7b',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash', minConf: Math.round(Number(process.env.AI_MIN_CONFIDENCE ?? 0.85) * 100),
  autoCat: true, n80: true, n100: true, nRc: true, nFast: true, csvProfile: 'DNB',
};

export function settings() { return { ...DEFAULT_SETTINGS, ...kv.get(OWNER, 'fh_settings', {}) }; }
export function saveSettings(patch) { kv.set(OWNER, 'fh_settings', { ...kv.get(OWNER, 'fh_settings', {}), ...patch }); }

// Hemmeligheter for FinansHub (Gemini-nøkkel) lagres separat og sendes aldri ut.
export const secret = (k) => kv.get(OWNER, 'fh_secret', {})[k] || process.env[{ geminiKey: 'GEMINI_API_KEY' }[k]] || '';
export function setSecret(k, v) { const s = kv.get(OWNER, 'fh_secret', {}); if (v) s[k] = v; else delete s[k]; kv.set(OWNER, 'fh_secret', s); }

// Første oppstart: kategorier og regler, og flytt gamle kvitteringer fra den enkle Økonomi-fanen inn som transaksjoner.
if (!db.prepare('SELECT 1 FROM fh_categories LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO fh_categories(name,color,kind,sort) VALUES(?,?,?,?)');
  DEFAULT_CATEGORIES.forEach(([n, c, k], i) => ins.run(n, c, k, i));
  const rule = db.prepare('INSERT INTO fh_rules(pattern,category_id) VALUES(?,(SELECT id FROM fh_categories WHERE name=?))');
  DEFAULT_RULES.forEach(([p, c]) => rule.run(p, c));
  migrateOldReceipts();
}

function migrateOldReceipts() {
  const old = db.prepare('SELECT * FROM receipts').all();
  if (!old.length) return;
  const acc = db.prepare("INSERT INTO fh_accounts(name,bank,type) VALUES('Brukskonto','','checking') RETURNING id").get().id;
  const MAP = { Mat: 'Mat og dagligvarer', Transport: 'Transport og lading', Bolig: 'Bolig', Fritid: 'Fritid og hobby', Skole: 'Skole' };
  const cat = db.prepare('SELECT id FROM fh_categories WHERE name=?');
  const tx = db.prepare("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,created) VALUES(?,?,?,?,?,?,'receipt',?) RETURNING id");
  const rc = db.prepare("INSERT INTO fh_receipts(id,file,thumb,mime,status,merchant,date,total,category_id,account_id,confidence,transaction_id,provider,created) VALUES(?,?,?,?,'booked',?,?,?,?,?,1,?,'manuell',?)");
  db.transaction(() => {
    for (const r of old) {
      const cid = cat.get(MAP[r.category] ?? 'Annet')?.id ?? null;
      const ore = Math.round(r.amount * 100);
      const t = tx.get(acc, r.date, -ore, r.store, r.store, cid, r.created);
      if (r.file) {
        // Kopier filene til kvitteringsmappen; originalene i uploads/ blir liggende.
        const dir = join(config.dataDir, 'receipts', 'migrert');
        mkdirSync(dir, { recursive: true });
        for (const f of [r.file, r.thumb]) if (f && existsSync(join(config.dataDir, 'uploads', f))) copyFileSync(join(config.dataDir, 'uploads', f), join(dir, f));
        rc.run(`old-${r.id}`, `migrert/${r.file}`, r.thumb ? `migrert/${r.thumb}` : null, r.mime, r.store, r.date, ore, cid, acc, t.id, r.created);
      }
    }
  })();
  console.log(`[finans] Flyttet ${old.length} kvitteringer fra den gamle Økonomi-fanen.`);
}

export { db, OWNER };
