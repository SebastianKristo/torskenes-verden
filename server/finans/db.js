// FinansHub: tabeller i samme SQLite-database som resten av homelab.
// Alle beløp lagres som heltall i øre for å unngå avrundingsfeil. Negativt = ut.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
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

// FinansHub v2: abonnementer, delte mapper, Finn-handler.
db.exec(`
CREATE TABLE IF NOT EXISTS fh_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,            -- øre per syklus
  cycle TEXT NOT NULL DEFAULT 'monthly',       -- monthly | yearly
  next_date TEXT,
  usage_note TEXT NOT NULL DEFAULT '',
  low_use INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,           -- 1 aktiv, 0 sagt opp
  domain TEXT,
  ai_short TEXT,
  tx_id INTEGER REFERENCES fh_transactions(id) ON DELETE SET NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fh_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fh_folder_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES fh_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member',         -- owner | member
  status TEXT NOT NULL DEFAULT 'active'        -- active | invited
);
CREATE TABLE IF NOT EXISTS fh_folder_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES fh_folders(id) ON DELETE CASCADE,
  tx_id INTEGER REFERENCES fh_transactions(id) ON DELETE SET NULL,
  receipt_id TEXT REFERENCES fh_receipts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,                     -- øre, positivt = utgift
  paid_by TEXT NOT NULL,
  split TEXT NOT NULL DEFAULT 'equal',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fh_finn (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,                          -- bought | sold
  item TEXT NOT NULL,
  counterpart TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,                     -- øre
  steps TEXT NOT NULL DEFAULT '[]',            -- [{t, done}]
  source TEXT,                                 -- hash av e-posten, hindrer duplikater
  tx_id INTEGER REFERENCES fh_transactions(id) ON DELETE SET NULL,
  created INTEGER NOT NULL,
  UNIQUE(source)
);
`);
// Nye kolonner på eksisterende tabeller (idempotent).
const addCol = (t, col, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
for (const t of ['fh_transactions', 'fh_receipts']) { addCol(t, 'ai_short', 'TEXT'); addCol(t, 'ai_long', 'TEXT'); addCol(t, 'domain', 'TEXT'); }
addCol('fh_transactions', 'ai_done', 'INTEGER NOT NULL DEFAULT 0');
addCol('fh_receipts', 'name', 'TEXT');          // opprinnelig filnavn (opplastingskøen)
addCol('fh_receipts', 'started', 'INTEGER');    // når AI-en begynte, for fremdrift
addCol('fh_receipts', 'target', 'TEXT');        // 'sub' | 'folder:<id>[:<bruker>]' – hva kvitteringen ble lastet opp for
// Prompt 05: tokens per bruker med utløp, abonnement hvert 2. år, boligmapper med roller, prosjekter og regninger.
addCol('fh_tokens', 'user_id', 'TEXT');
addCol('fh_tokens', 'expires', 'INTEGER');      // ms, null = aldri
addCol('fh_folders', 'type', "TEXT NOT NULL DEFAULT 'Annet'");   // Enebolig | Leilighet | Hytte | Utleie | Annet
addCol('fh_folders', 'address', "TEXT NOT NULL DEFAULT ''");
addCol('fh_folders', 'owner_id', 'TEXT');
addCol('fh_folders', 'split', "TEXT NOT NULL DEFAULT 'equal'");  // 'equal' eller JSON {medlemsnavn: vekt}
addCol('fh_folder_members', 'user_id', 'TEXT');                   // null = navngitt person uten innlogging
addCol('fh_folder_entries', 'category', 'TEXT');
addCol('fh_folder_entries', 'project_id', 'INTEGER');
db.exec(`
CREATE TABLE IF NOT EXISTS fh_folder_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES fh_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL DEFAULT '',
  budget INTEGER NOT NULL DEFAULT 0,           -- øre
  category TEXT NOT NULL DEFAULT 'Håndverker',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fh_project_installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES fh_folder_projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  due TEXT,                                    -- ISO-dato eller fritekst («ca. 15.12»)
  amount INTEGER NOT NULL,                     -- øre
  paid_at INTEGER,
  entry_id INTEGER REFERENCES fh_folder_entries(id) ON DELETE SET NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fh_folder_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES fh_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- leverandør, f.eks. Fjordkraft
  category TEXT NOT NULL,
  freq TEXT NOT NULL DEFAULT 'Månedlig',
  payer TEXT,
  next_due TEXT
);
CREATE TABLE IF NOT EXISTS fh_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- smb | json | xlsx
  size INTEGER,
  status TEXT NOT NULL,                        -- ok | failed | running
  error TEXT,
  created INTEGER NOT NULL
);
`);
// Eldre mapper: eieren er den innloggede eieren, og «member» blir «Kan redigere».
// Kjøres én gang: bare den første eieren i hver mappe (den som opprettet den) kobles til eier-kontoen.
if (!kv.get(OWNER, 'fh_mig_05', false)) {
  db.prepare("UPDATE fh_folder_members SET role='editor' WHERE role='member'").run();
  db.prepare(`UPDATE fh_folder_members SET user_id=? WHERE user_id IS NULL AND id IN (SELECT min(id) FROM fh_folder_members WHERE role='owner' GROUP BY folder_id)
    AND NOT EXISTS (SELECT 1 FROM fh_folder_members x WHERE x.folder_id=fh_folder_members.folder_id AND x.user_id=?)`).run(OWNER, OWNER);
  db.prepare('UPDATE fh_folders SET owner_id=? WHERE owner_id IS NULL').run(OWNER);
  kv.set(OWNER, 'fh_mig_05', true);
}

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
  autoCat: true, n80: true, n100: true, nRc: true, nFast: true, csvProfile: 'DNB', aiSummaries: true,
  imapHost: '', imapUser: '', imapFolder: 'INBOX',
  // Aksjer (Trading 212). Nøkkel og secret ligger i hemmelighetene.
  t212Env: process.env.TRADING212_ENV === 'demo' ? 'demo' : 'live',
  // AI-søk: embeddings er valgfrie (Ollama-modell, f.eks. nomic-embed-text). Uten dem brukes bare BM25.
  embedModel: process.env.OLLAMA_EMBED_MODEL ?? '', aiSearchEmbed: false,
  // Backup til SMB-share. Passord og passfrase ligger i hemmelighetene.
  smbOn: false, smbShare: process.env.SMB_SHARE ?? '', smbDir: 'finanshub', smbVersion: '3.1.1', smbUser: process.env.SMB_USER ?? '', smbDomain: 'WORKGROUP',
  smbSchedule: 'off', smbKeep: 14, smbDb: true, smbReceipts: true, smbSettings: true, smbEncrypt: true,
};

export function settings() { return { ...DEFAULT_SETTINGS, ...kv.get(OWNER, 'fh_settings', {}) }; }
export function saveSettings(patch) { kv.set(OWNER, 'fh_settings', { ...kv.get(OWNER, 'fh_settings', {}), ...patch }); }

// Hemmeligheter for FinansHub (Gemini, Trading 212, SMB, IMAP) lagres separat, kryptert med AES-256-GCM, og sendes aldri ut.
// Nøkkelen avledes fra SECRET_KEY (eller SESSION_SECRET). Byttes den, må hemmelighetene legges inn på nytt.
const SECRET_ENV = { geminiKey: 'GEMINI_API_KEY', imapPass: 'FINN_IMAP_PASSWORD', t212Key: 'TRADING212_API_KEY', t212Secret: 'TRADING212_API_SECRET', smbPass: 'SMB_PASSWORD', backupPhrase: 'BACKUP_PASSPHRASE' };
const sealKey = () => createHash('sha256').update('fh-secret:' + (process.env.SECRET_KEY || config.sessionSecret || 'dev')).digest();
export function seal(text) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', sealKey(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function unseal(v) {
  if (typeof v !== 'string' || !v.startsWith('enc:')) return v ?? '';
  try {
    const b = Buffer.from(v.slice(4), 'base64'), d = createDecipheriv('aes-256-gcm', sealKey(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}
export const secret = (k) => unseal(kv.get(OWNER, 'fh_secret', {})[k]) || process.env[SECRET_ENV[k]] || '';
export function setSecret(k, v) { const s = kv.get(OWNER, 'fh_secret', {}); if (v) s[k] = seal(v); else delete s[k]; kv.set(OWNER, 'fh_secret', s); }
// Hemmeligheter fra før krypteringen kom inn krypteres ved oppstart.
{ const s = kv.get(OWNER, 'fh_secret', {}); let ch = false; for (const [k, v] of Object.entries(s)) if (v && !String(v).startsWith('enc:')) { s[k] = seal(v); ch = true; } if (ch) kv.set(OWNER, 'fh_secret', s); }

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

export { db, OWNER, kv };
