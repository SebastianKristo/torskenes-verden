// FinansHub: tabeller i samme SQLite-database som resten av homelab.
// Alle beløp lagres som heltall i øre for å unngå avrundingsfeil. Negativt = ut.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db, OWNER, kv } from '../db.js';
import { config } from '../config.js';
import { currentUser, userCfg, userCfgSet, setUserCfg } from '../settings.js';

// ISO2: regnskapet er per bruker. me() = brukeren i denne forespørselen/jobben (routes.js kjører hver forespørsel i
// runAsUser), ellers OWNER (oppstart og eldre bakgrunnsjobber). Alle spørringer mot personlige fh_*-tabeller filtrerer på user_id.
export const me = () => { let u; try { u = currentUser(); } catch { u = undefined; } return u || OWNER; };

// Bygger en tabell på nytt med ny UNIQUE-regel (UNIQUE(name) → UNIQUE(user_id, name)). Alle rader og ID-er beholdes;
// fremmednøkler er av mens tabellen byttes, så ingenting kaskaderes. Idempotent: gjør ingenting når regelen er på plass.
export function rebuildTable(t, fix) {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").pluck().get(t);
  if (!sql) return false;
  const next = fix(sql);
  if (!next || next === sql) return false;
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => `"${c.name}"`).join(',');
  const idx = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").pluck().all(t);
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name=?").pluck().get(t);
  const tmp = `${t}__iso2`;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      const before = db.prepare(`SELECT count(*) FROM ${t}`).pluck().get();
      db.exec(`DROP TABLE IF EXISTS ${tmp}`);
      db.exec(next.replace(/^CREATE TABLE\s+(?:"[^"]+"|\S+)/i, `CREATE TABLE ${tmp}`));
      db.exec(`INSERT INTO ${tmp}(${cols}) SELECT ${cols} FROM ${t}`);
      if (db.prepare(`SELECT count(*) FROM ${tmp}`).pluck().get() !== before) throw new Error(`rebuild ${t}: radantallet stemmer ikke`);
      db.exec(`DROP TABLE ${t}`);
      db.exec(`ALTER TABLE ${tmp} RENAME TO ${t}`);
      for (const s of idx) db.exec(s);
      if (seq != null) db.prepare('UPDATE sqlite_sequence SET seq=max(seq, ?) WHERE name=?').run(seq, t);
    })();
  } finally { db.pragma('foreign_keys = ON'); }
  return true;
}
// Legger til user_id og bytter en UNIQUE-regel til å gjelde per bruker. Eksisterende rader tilhører OWNER.
export function perUserUnique(t, oldRe, replacement, unique) {
  const done = rebuildTable(t, (sql) => {
    if (sql.includes(unique)) return null;
    let s = sql.replace(oldRe, replacement);
    if (!/\buser_id\b/.test(s)) s = s.replace(/\)\s*$/, ', user_id TEXT)');
    return s.replace(/\)\s*$/, `, ${unique})`);
  });
  if (done) { db.prepare(`UPDATE ${t} SET user_id=? WHERE user_id IS NULL`).run(OWNER); db.exec(`CREATE INDEX IF NOT EXISTS ${t}_uid ON ${t}(user_id)`); }
  return done;
}
// user_id på en tabell (idempotent). Radene som finnes når kolonnen legges til, får fill (standard OWNER) – bare den ene gangen,
// så en rad uten eier senere aldri havner hos eieren av seg selv.
export function addUserCol(t, fill = `'${OWNER}'`) {
  if (db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'user_id')) return false;
  db.exec(`ALTER TABLE ${t} ADD COLUMN user_id TEXT`);
  db.exec(`UPDATE ${t} SET user_id=${fill} WHERE user_id IS NULL`);
  db.exec(`CREATE INDEX IF NOT EXISTS ${t}_uid ON ${t}(user_id)`);
  return true;
}

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
// Prompt 21: hvem som lastet opp kvitteringen (null = e-post eller eldre opplasting i husholdningens regnskap).
// Eldre opplastinger til en bolig har brukeren i target («folder:<id>:<bruker>») og fylles inn derfra.
addCol('fh_receipts', 'uploaded_by', 'TEXT');
for (const r of db.prepare("SELECT id, target FROM fh_receipts WHERE uploaded_by IS NULL AND target LIKE 'folder:%:%'").all()) {
  const m = String(r.target).match(/^folder:\d+:(.+)$/);
  if (m) db.prepare('UPDATE fh_receipts SET uploaded_by=? WHERE id=?').run(m[1], r.id);
}
// Prompt 05: tokens per bruker med utløp, abonnement hvert 2. år, boligmapper med roller, prosjekter og regninger.
addCol('fh_tokens', 'user_id', 'TEXT');
addCol('fh_tokens', 'expires', 'INTEGER');      // ms, null = aldri
addCol('fh_folders', 'type', "TEXT NOT NULL DEFAULT 'Annet'");   // Enebolig | Leilighet | Hytte | Utleie | Annet
addCol('fh_folders', 'address', "TEXT NOT NULL DEFAULT ''");
addCol('fh_folders', 'owner_id', 'TEXT');
// Prompt 08: kvitteringer fra e-post.
addCol('fh_receipts', 'source', "TEXT NOT NULL DEFAULT 'upload'");   // upload | email
addCol('fh_receipts', 'meta', 'TEXT');                                // JSON: {from, subject, messageId, date}
db.exec(`CREATE TABLE IF NOT EXISTS fh_mail_imports (
  id INTEGER PRIMARY KEY,
  message_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,                        -- vedlegg, eller teksten når e-posten ikke har vedlegg
  receipt_id TEXT,
  folder TEXT,
  sender TEXT,
  subject TEXT,
  received_at INTEGER,
  status TEXT NOT NULL,                        -- imported | skipped | error
  error TEXT,
  created INTEGER NOT NULL,
  UNIQUE(message_id, sha256)
)`);
addCol('fh_folders', 'split', "TEXT NOT NULL DEFAULT 'equal'");  // 'equal' eller JSON {medlemsnavn: vekt}
addCol('fh_folder_members', 'user_id', 'TEXT');                   // null = navngitt person uten innlogging
addCol('fh_folder_entries', 'category', 'TEXT');
addCol('fh_folder_entries', 'project_id', 'INTEGER');
// Prompt 17: Boliger – budsjett (øre), farge, automatisk kategorisering og varsler per bolig, og status på utgiftsposter
// ('review' = fra kvitteringsskanning, ikke gått gjennom; 'ok' = godkjent eller lagt inn for hånd).
addCol('fh_folders', 'budget', 'INTEGER');
addCol('fh_folders', 'color', 'TEXT');
addCol('fh_folders', 'auto_cat', 'INTEGER NOT NULL DEFAULT 1');
addCol('fh_folders', 'notify', 'INTEGER NOT NULL DEFAULT 1');
addCol('fh_folder_entries', 'status', "TEXT NOT NULL DEFAULT 'ok'");
// Prompt 06: bankraden slik den kom fra banken (JSON, uendret før navnevasking).
addCol('fh_transactions', 'raw_bank_row', 'TEXT');
// Prompt 11: Subscription OS – kategori, trekkdag og forrige pris (for «Pris økt»).
addCol('fh_subscriptions', 'category', 'TEXT');
addCol('fh_subscriptions', 'charge_day', 'INTEGER');            // 1–31; ellers dagen i next_date
addCol('fh_subscriptions', 'prev_price', 'INTEGER');            // øre per trekk før siste prisendring
addCol('fh_subscriptions', 'price_changed', 'TEXT');            // dato for prisendringen
addCol('fh_subscriptions', 'bill_month', 'INTEGER');            // 1–12 for årlige og 2-årige trekk (prompt 14)
addCol('fh_subscriptions', 'logo_url', 'TEXT');                 // egen logo (opplastet eller ✦ funnet med AI)
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

// ISO2: alle personlige tabeller får user_id. Eksisterende rader tilhører OWNER (hovedadmin), med ett unntak:
// kvitteringer en bruker uten admin-rolle lastet opp til en bolig, var aldri en del av eierens regnskap og tilhører opplasteren.
perUserUnique('fh_categories', /name TEXT NOT NULL UNIQUE/, 'name TEXT NOT NULL', 'UNIQUE(user_id, name)');
perUserUnique('fh_finn', /,\s*UNIQUE\s*\(\s*source\s*\)/i, '', 'UNIQUE(user_id, source)');
perUserUnique('fh_mail_imports', /,\s*UNIQUE\s*\(\s*message_id\s*,\s*sha256\s*\)/i, '', 'UNIQUE(user_id, message_id, sha256)');
for (const t of ['fh_accounts', 'fh_transactions', 'fh_budgets', 'fh_recurring', 'fh_rules', 'fh_goals', 'fh_subscriptions', 'fh_backups']) addUserCol(t);
addUserCol('fh_receipts', `CASE WHEN uploaded_by IS NOT NULL AND uploaded_by IN (SELECT id FROM users WHERE role<>'admin') THEN uploaded_by ELSE '${OWNER}' END`);
db.exec('CREATE INDEX IF NOT EXISTS fh_tx_uid_date ON fh_transactions(user_id, date)');

export const DEFAULT_CATEGORIES = [
  ['Mat og dagligvarer', '#FF9F5A', 'expense'], ['Restaurant og kafé', '#F2C14E', 'expense'], ['Transport og lading', '#7AA7FF', 'expense'],
  ['Bolig', '#B79CFF', 'expense'], ['Hjem', '#8FD3FF', 'expense'], ['Fritid og hobby', '#5FD3A8', 'expense'], ['Abonnementer', '#FF6B8B', 'expense'],
  ['Skole', '#C9E265', 'expense'], ['Annet', '#A0A0AA', 'expense'], ['Inntekt', '#9FE3C6', 'income'], ['Sparing', '#A0A0AA', 'transfer'], ['Overføring', '#6B6B75', 'transfer'],
];
const DEFAULT_RULES = [['REMA*', 'Mat og dagligvarer'], ['KIWI*', 'Mat og dagligvarer'], ['MENY*', 'Mat og dagligvarer'], ['COOP*', 'Mat og dagligvarer'],
  ['CIRCLE K*', 'Transport og lading'], ['RUTER*', 'Transport og lading'], ['SPOTIFY*', 'Abonnementer'], ['NETFLIX*', 'Abonnementer']];

export const DEFAULT_SETTINGS = {
  name: '', currency: 'NOK', monthStart: 1, yearGoal: 120000,
  provider: process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'ollama', fallback: (process.env.AI_FALLBACK ?? 'gemini') !== 'none',
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://192.168.1.30:11434', ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen2.5vl:7b', ollamaTextModel: process.env.OLLAMA_TEXT_MODEL ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-flash-latest', groqModel: process.env.GROQ_MODEL ?? '', groqVisionModel: process.env.GROQ_VISION_MODEL ?? '', roboflowWorkflow: process.env.ROBOFLOW_WORKFLOW ?? '', minConf: Math.round(Number(process.env.AI_MIN_CONFIDENCE ?? 0.85) * 100),
  autoCat: true, n80: true, n100: true, nRc: true, nFast: true, csvProfile: 'DNB', aiSummaries: true,
  // Kvitteringer fra e-post (Proton Mail via Bridge, eller vanlig IMAP). Passordet ligger i hemmelighetene (imapPass).
  mailOn: !!process.env.IMAP_HOST, imapHost: process.env.IMAP_HOST ?? '', imapPort: Number(process.env.IMAP_PORT ?? 143) || 143,
  imapSecurity: ['starttls', 'tls', 'none'].includes(process.env.IMAP_SECURITY) ? process.env.IMAP_SECURITY : 'starttls',
  imapUser: process.env.IMAP_USER ?? '', imapFolder: process.env.IMAP_FOLDER ?? 'Folders/Kvitteringer',
  imapDoneFolder: process.env.IMAP_DONE_FOLDER ?? 'Folders/Kvitteringer/Lest', imapPollMinutes: Number(process.env.IMAP_POLL_MINUTES ?? 10) || 10,
  imapFinnFolder: process.env.IMAP_FINN_FOLDER ?? '', imapPin: '',
  // Aksjer (Trading 212). Nøkkel og secret ligger i hemmelighetene.
  t212Env: process.env.TRADING212_ENV === 'demo' ? 'demo' : 'live',
  // AI-søk: embeddings er valgfrie (Ollama-modell, f.eks. nomic-embed-text). Uten dem brukes bare BM25.
  embedModel: process.env.OLLAMA_EMBED_MODEL ?? '', aiSearchEmbed: false,
  // Backup til SMB-share. Passord og passfrase ligger i hemmelighetene.
  smbOn: false, smbShare: process.env.SMB_SHARE ?? '', smbDir: 'finanshub', smbVersion: '3.1.1', smbUser: process.env.SMB_USER ?? '', smbDomain: 'WORKGROUP',
  smbSchedule: 'off', smbKeep: 14, smbDb: true, smbReceipts: true, smbSettings: true, smbEncrypt: true,
  // Prompt 48: Mac-OCR-tjenesten på Mac mini (nøkkelen ligger i hemmelighetene: macOcrKey) og av/på per steg i kvitteringskjeden.
  macOcrUrl: process.env.MAC_OCR_URL ?? 'http://10.69.1.173:8765', receipts48: {},
};

// Visningsnavnet følger hovedadmin (fra førstegangsoppsettet) til det overstyres under Generelt.
function mainAdminName() {
  try { const u = db.prepare("SELECT name, username FROM users ORDER BY is_main_admin DESC, role='admin' DESC, created LIMIT 1").get(); return u ? (u.name || u.username) : null; } catch { return null; }
}
// ISO2: innstillingene er delt i to.
// - SERVER_KEYS: serveroppsett (AI-motorer, modeller, URL-er, aiTasks, tidsgrenser, embeddings, SMB-backup, Boliger-AI). Ligger hos OWNER,
//   brukes av alle, og kan bare endres av admin (sjekkes i rutene).
// - Resten er brukerens egne (budsjettstart, kategorivalg, varsler, e-postimport …) i kv(bruker, 'fh_settings').
// - IMAP-tilkoblingen og Trading 212-miljøet er personlige integrasjoner hos ISO-INT (kv(bruker,'cfg_personal'), userCfg/setUserCfg).
export const SERVER_KEYS = new Set(['provider', 'fallback', 'ollamaUrl', 'ollamaModel', 'ollamaTextModel', 'geminiModel', 'groqModel', 'groqVisionModel',
  'roboflowWorkflow', 'roboflowWorkspace', 'roboflowModel', 'roboflowBarcodeModel', 'minConf', 'aiTasks', 'ocrFallback', 'ocrLowConf', 'aiTimeouts', 'embedModel', 'aiSearchEmbed',
  'boligAiNew', 'macOcrUrl', 'receipts48', 'smbOn', 'smbShare', 'smbDir', 'smbVersion', 'smbUser', 'smbDomain', 'smbSchedule', 'smbKeep', 'smbDb', 'smbReceipts', 'smbSettings', 'smbEncrypt']);
// FinansHub-navn → nøkkel i cfg_personal (settings.js).
export const PERSONAL_CFG = { imapHost: 'imapHost', imapPort: 'imapPort', imapSecurity: 'imapSecurity', imapUser: 'imapUser', imapFolder: 'imapFolder',
  imapDoneFolder: 'imapDoneFolder', imapFinnFolder: 'imapFinnFolder', t212Env: 't212_env' };
export const isServerKey = (k) => SERVER_KEYS.has(k);
const rawSettings = (u) => kv.get(u, 'fh_settings', {}) ?? {};
function userName(u) {
  if (u === OWNER) return mainAdminName();
  try { const r = db.prepare('SELECT name, username FROM users WHERE id=?').get(u); return r ? (r.name || r.username) : null; } catch { return null; }
}
const pcfg = (u, k, own) => {
  const ck = PERSONAL_CFG[k];
  let v;
  try { v = u === OWNER && !userCfgSet(u, ck) && own[k] !== undefined ? own[k] : userCfg(u, ck); } catch { v = own[k]; }
  if (k === 'imapPort') return Number(v) || 143;
  if (k === 't212Env') return v === 'demo' ? 'demo' : 'live';
  return v ?? '';
};
/** FinansHub-innstillingene slik brukeren u ser dem: serveroppsett (fra OWNER) + egne valg + egne integrasjoner. */
export function settings(u = me()) {
  const own = rawSettings(u), srv = u === OWNER ? own : rawSettings(OWNER);
  const st = { ...DEFAULT_SETTINGS };
  if (u !== OWNER) st.mailOn = false;   // miljøvariablene (IMAP_HOST …) gjelder bare eieren
  for (const [k, v] of Object.entries(own)) if (!SERVER_KEYS.has(k) && !PERSONAL_CFG[k]) st[k] = v;
  for (const k of SERVER_KEYS) if (srv[k] !== undefined) st[k] = srv[k];
  for (const k of Object.keys(PERSONAL_CFG)) st[k] = pcfg(u, k, own);
  if (!st.name) st.name = userName(u) || 'Meg';
  return st;
}
/** Bare serveroppsettet (SERVER_KEYS), slik alle brukere bruker det. */
export const serverSettings = () => { const st = settings(OWNER); return Object.fromEntries([...SERVER_KEYS].map((k) => [k, st[k]])); };
/** Lagrer: servernøkler hos OWNER, personlige integrasjoner via setUserCfg, resten hos brukeren u. */
export function saveSettings(patch, u = me()) {
  const srv = {}, usr = {}, pc = {};
  for (const [k, v] of Object.entries(patch ?? {})) (SERVER_KEYS.has(k) ? srv : PERSONAL_CFG[k] ? pc : usr)[k] = v;
  if (Object.keys(srv).length) kv.set(OWNER, 'fh_settings', { ...rawSettings(OWNER), ...srv });
  if (Object.keys(pc).length) setUserCfg(u, Object.fromEntries(Object.entries(pc).map(([k, v]) => [PERSONAL_CFG[k], v == null ? null : String(v)])));
  // Eieren: de personlige verdiene speiles også i fh_settings, som før (eldre lesere).
  if (Object.keys(usr).length || (u === OWNER && Object.keys(pc).length)) kv.set(u, 'fh_settings', { ...rawSettings(u), ...usr, ...(u === OWNER ? pc : {}) });
}

// Hemmeligheter for FinansHub (Gemini, Trading 212, SMB, IMAP) lagres separat, kryptert med AES-256-GCM, og sendes aldri ut.
// Nøkkelen avledes fra SECRET_KEY (eller SESSION_SECRET). Byttes den, må hemmelighetene legges inn på nytt.
const SECRET_ENV = { openaiKey: 'OPENAI_API_KEY', elevenlabsKey: 'ELEVENLABS_API_KEY', azureSpeechKey: 'AZURE_SPEECH_KEY', geminiKey: 'GEMINI_API_KEY', groqKey: 'GROQ_API_KEY', roboflowKey: 'ROBOFLOW_API_KEY', imapPass: ['IMAP_PASSWORD', 'FINN_IMAP_PASSWORD'], t212Key: 'TRADING212_API_KEY', t212Secret: 'TRADING212_API_SECRET', smbPass: 'SMB_PASSWORD', backupPhrase: 'BACKUP_PASSPHRASE', macOcrKey: 'MAC_OCR_KEY' };
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
const envOf = (k) => [SECRET_ENV[k]].flat().map((e) => process.env[e]).find((v) => v) ?? '';
// ISO2: IMAP-passordet og Trading 212-nøklene er personlige (cfg_personal hos ISO-INT, per bruker). Resten (Gemini, Groq, Roboflow,
// SMB, backup-passfrase) er serverhemmeligheter hos OWNER. Miljøvariablene gjelder bare eieren.
export const PERSONAL_SECRETS = { imapPass: 'imapPass', t212Key: 't212_key', t212Secret: 't212_secret' };
const ownerSecret = (k) => unseal(kv.get(OWNER, 'fh_secret', {})[k]) || envOf(k) || '';
export function secret(k, u = me()) {
  const p = PERSONAL_SECRETS[k];
  if (!p) return ownerSecret(k);
  let v = '';
  try { v = userCfgSet(u, p) ? userCfg(u, p) || '' : ''; } catch { v = ''; }
  if (v || u !== OWNER) return v;
  return ownerSecret(k);
}
// Hvor hemmeligheten kommer fra: 'ui' (lagret og lesbar), 'undecryptable' (lagret, men SECRET_KEY/SESSION_SECRET er endret), 'env' eller null.
export function secretSource(k, u = me()) {
  const p = PERSONAL_SECRETS[k];
  if (p) {
    let set = false; try { set = userCfgSet(u, p); } catch { set = false; }
    if (set) { let v = ''; try { v = userCfg(u, p); } catch { v = ''; } return v ? 'ui' : 'undecryptable'; }
    if (u !== OWNER) return null;
  }
  const v = kv.get(OWNER, 'fh_secret', {})[k];
  if (v) return unseal(v) ? 'ui' : 'undecryptable';
  return envOf(k) ? 'env' : null;
}
const setOwnerSecret = (k, v) => { const s = kv.get(OWNER, 'fh_secret', {}); if (v) s[k] = seal(v); else delete s[k]; kv.set(OWNER, 'fh_secret', s); };
export function setSecret(k, v, u = me()) {
  const p = PERSONAL_SECRETS[k];
  if (!p) return setOwnerSecret(k, v);
  setUserCfg(u, { [p]: v ? String(v) : null });
  if (u === OWNER) setOwnerSecret(k, v);   // eieren: speiles i fh_secret som før
}
// Hemmeligheter fra før krypteringen kom inn krypteres ved oppstart.
{ const s = kv.get(OWNER, 'fh_secret', {}); let ch = false; for (const [k, v] of Object.entries(s)) if (v && !String(v).startsWith('enc:')) { s[k] = seal(v); ch = true; } if (ch) kv.set(OWNER, 'fh_secret', s); }

// Standardkategorier og -regler for brukeren u.
function seedLedger(u) {
  const ins = db.prepare('INSERT OR IGNORE INTO fh_categories(name,color,kind,sort,user_id) VALUES(?,?,?,?,?)');
  DEFAULT_CATEGORIES.forEach(([n, c, k], i) => ins.run(n, c, k, i, u));
  const rule = db.prepare('INSERT INTO fh_rules(pattern,category_id,user_id) VALUES(?,(SELECT id FROM fh_categories WHERE name=? AND user_id=?),?)');
  DEFAULT_RULES.forEach(([p, c]) => rule.run(p, c, u, u));
}
// Første oppstart: kategorier og regler for eieren, og flytt gamle kvitteringer fra den enkle Økonomi-fanen inn som transaksjoner.
if (!db.prepare('SELECT 1 FROM fh_categories WHERE user_id=? LIMIT 1').get(OWNER)) {
  db.transaction(() => seedLedger(OWNER))();
  migrateOldReceipts();
}
// Nye brukere får et tomt regnskap med standardkategoriene ved første bruk (én gang; sletter de alle kategoriene, seedes det ikke på nytt).
const seeded = new Set([OWNER]);
export function ensureLedger(u) {
  if (!u || seeded.has(u)) return;
  seeded.add(u);
  if (kv.get(u, 'fh_ledger_v1', false)) return;
  db.transaction(() => { if (!db.prepare('SELECT 1 FROM fh_categories WHERE user_id=? LIMIT 1').get(u)) seedLedger(u); kv.set(u, 'fh_ledger_v1', Date.now()); })();
}

// Bare hovedadmins egne kvitteringer flyttes inn i husholdningens regnskap; andre brukeres blir i deres egen Økonomi-fane.
function migrateOldReceipts() {
  const old = db.prepare('SELECT * FROM receipts WHERE user=?').all(OWNER);
  if (!old.length) return;
  const acc = db.prepare("INSERT INTO fh_accounts(name,bank,type,user_id) VALUES('Brukskonto','','checking',?) RETURNING id").get(OWNER).id;
  const MAP = { Mat: 'Mat og dagligvarer', Transport: 'Transport og lading', Bolig: 'Bolig', Fritid: 'Fritid og hobby', Skole: 'Skole' };
  const cat = db.prepare('SELECT id FROM fh_categories WHERE name=? AND user_id=?');
  const tx = db.prepare(`INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,created,user_id) VALUES(?,?,?,?,?,?,'receipt',?,'${OWNER}') RETURNING id`);
  const rc = db.prepare(`INSERT INTO fh_receipts(id,file,thumb,mime,status,merchant,date,total,category_id,account_id,confidence,transaction_id,provider,created,user_id) VALUES(?,?,?,?,'booked',?,?,?,?,?,1,?,'manuell',?,'${OWNER}')`);
  db.transaction(() => {
    for (const r of old) {
      const cid = cat.get(MAP[r.category] ?? 'Annet', OWNER)?.id ?? null;
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

// Eier av en rad: true når raden finnes og tilhører u (brukes før oppdatering/sletting).
export const owns = (table, id, u = me()) => !!db.prepare(`SELECT 1 FROM ${table} WHERE id=? AND user_id=?`).get(id, u);
