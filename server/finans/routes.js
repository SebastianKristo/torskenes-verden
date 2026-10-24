// FinansHub-API: /finans/api/*. Tilgang med innlogget sesjon (nettleser) eller API-token med finans-scope (mobil/snarvei).
import { addedOf40, tagsOf40, applyRereadTx40 } from './added40.js'; // prompt 40
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { db, OWNER, settings, saveSettings, secret, setSecret, secretSource, DEFAULT_SETTINGS, me, ensureLedger, SERVER_KEYS, PERSONAL_CFG, serverSettings } from './db.js';
import { runAsUser, userCfg, setUserCfg } from '../settings.js';
import { loadDemo } from './demo.js';
import { extract, extractText, extractOcr, health, providerName, testEngine, testRoboflow, ENGINES, TASKS, aiLog, barcode, aiTimeoutsOf, cleanAiTimeouts, AI_TIMEOUT_DEFAULTS, TIMEOUT_STEPS, ON_TIMEOUT, _aiTest, aiLimits } from './ai.js';
import { startJob, getJob, cancelJob, jobView, subscribe, runningFor, MAX_RUNNING_PER_USER, _jobTest } from './ai-jobs.js';
import { streamSSE } from 'hono/streaming';
import { hasGemini, listKeysOut, addKey, removeKey, renameKey, orderKeys, resetKey, testKey } from './gemini-keys.js';
import { ollamaModels, startPull, pullStatus, deleteModel } from './ollama-models.js';
import { sniffMime, isHeic, scanLog, scanLogOf } from './scan.js';
import { mailConfig, mailStatus, testMail, runMail, recentImports, startMailWorker } from './mail.js';
import { parseCsv, PROFILES } from './csv.js';
import { mountLogoRoutes } from '../logos/routes.js';
import { domainFor, learnDomain, validDomain, logo, heuristic, kick as kickAi, summarizeReceipt } from './enrich.js';
import { parseFile } from './importer.js';
import { importRows, splitRows, listTemplates, deleteTemplate } from './import-templates.js';
import { parseFinnEmail } from './finn.js';
import { mountFinn, mountFinnImport, linkMail, attachParsed, codesIn } from './finn-routes.js';
import { sessionUser, clientIp, verifyLogin, userInfo, listUsers } from '../auth.js';
import * as auth from '../auth.js';
import { config } from '../config.js';
import { kv } from '../db.js';
import { stocks, resetStocks, t212Configured, t212Base, cleanCred, testT212 } from './stocks.js';
import { answer as aiAnswer, plainSearch, suggestionGroups, AiUnavailable, isSimpleQuery } from './search.js';
import * as backup from './backup.js';
import * as subsOs from './subs.js';
import { mountP27, mountP27Public } from './p27-routes.js';
import { mountTrials, trialsFor } from './trials.js'; // prompt 31: gratis prøveperioder
import { mountSubsLog46, trialsVisible46 } from '../subs-log46.js'; // prompt 46 (SERVER46)
import { mountShared37, visibleSubs, decorateSub, asShare, editableSub } from './shared37.js'; // prompt 37: delte abonnementer
import { subscriptionAnswer, mountSubsAsk } from './subs-ask32.js'; // prompt 32: AI-søk med abonnementer
import { findLogo } from './logo-lookup.js';
import { storeLines, receiptLines, matchLines, annotateSearch } from './highlight30.js';
import { shareableUsers, logEntryChange, entryHistory } from './boliger30.js';
import { broadcast } from '../realtime.js';
import { classify39, verify39, createAiCategory, categoryOut39, confirmOnBook39, nameSim, stepsOut39 } from './receipts39.js'; // prompt 39: kategori, sumkontroll, «✦ På nytt» med fremdrift
import { jobStart as aiJobStart, jobUpdate as aiJobUpdate, jobEnd as aiJobEnd } from '../ai-run.js'; // prompt 34: AI-kontroll → Jobber
import { upsertScanChat, scanChatFor } from '../chat-scans.js'; // prompt 34: Chat-mappen «Kvitteringer og skanninger»
import { mailAddress42 } from './homes42.js'; // prompt 42
import { mountReceipts47, preParsed47, textKind47, ocrTextOf47 } from './receipts47.js'; // prompt 47 (SERVER47): OCR-tekst og ferdig tolket kvittering fra enheten
import { mountReceipts48, preScanned48 } from '../receipts48/routes.js'; // prompt 48 (SERVER48): /receipts/scan (kjeden A→B→C→Tesseract→D), /receipts/health, rettelser
import { cleanMacOcrUrl, cleanReceipts48, externalBlocked48 } from '../receipts48/settings.js';
import { correctionOnBook48 } from '../receipts48/corrections.js';
import { bolApi, catTree, catOptions, entryCat, linkLegacy, assignCategory, catById as bolCat, catPair, colorOf, noticesFor, layoutFor, upcomingOf, backgroundOf, validBackground } from './boliger.js';

const DIR = resolve(config.dataDir, 'receipts');
const q = (sql) => db.prepare(sql);
// Prompt 23: tidsavbrudd i kvitteringskøen. timeout_engine = motoren som ikke svarte, retry_at = når jobben prøves igjen (onTimeout=queue).
for (const [col, def] of [['timeout_engine', 'TEXT'], ['retry_at', 'INTEGER'], ['retry_n', 'INTEGER NOT NULL DEFAULT 0']]) {
  if (!db.prepare('PRAGMA table_info(fh_receipts)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE fh_receipts ADD COLUMN ${col} ${def}`);
}
const ok = (c) => c.json({ ok: true });
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);
const today = () => new Date().toLocaleDateString('sv-SE');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ore = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace('−', '-').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const hex = (v) => /^#[0-9a-f]{6}$/i.test(v) ? v : null;

/* ---------------- Tilgang ---------------- */

// finance:read/finance:write gir alt; de smale tilgangene gjelder bare sine endepunkter.
export const SCOPES = ['finance:read', 'finance:write', 'receipts:write', 'read:transactions', 'read:summary', 'read:budget', 'write:transactions'];
const IMPLIED = { 'read:transactions': 'finance:read', 'read:summary': 'finance:read', 'read:budget': 'finance:read', 'write:transactions': 'finance:write' };
const EXPIRY = { '30d': 30, '90d': 90, '1y': 365, never: null };
const tokenKey = (t) => createHmac('sha256', config.sessionSecret || 'dev').update('fh:' + t).digest('hex');
const newToken = () => 'fh_pat_' + randomBytes(24).toString('base64url'); // 32 tegn etter prefikset
const TOKEN_RE = /^Bearer\s+(fh_[A-Za-z0-9_-]{20,})$/;

// ISO2: hver bruker (alle roller) har sitt eget regnskap. Boliger deles med inviterte medlemmer.
// Serveroppsett (AI-motorer, nøkler, SMB) kan bare endres av admin; hele databasen (SMB-arkiv) bare av hovedadmin.
function access(c) {
  const sid = sessionUser(c);
  if (sid) {
    const u = userInfo(sid) ?? (sid === OWNER ? { id: OWNER, username: 'eier', role: 'admin', name: settings().name } : null);
    if (!u) return null;
    return { user: u.id, info: u, admin: u.role === 'admin', scopes: new Set(SCOPES), session: true };
  }
  const m = c.req.header('authorization')?.match(TOKEN_RE);
  if (!m) return null;
  const row = q('SELECT * FROM fh_tokens WHERE id=?').get(tokenKey(m[1]));
  if (!row) return null;
  if (row.expires && row.expires < Date.now()) return null;
  const u = userInfo(row.user_id ?? OWNER);
  if (!u) { q('DELETE FROM fh_tokens WHERE user_id=?').run(row.user_id); return null; } // brukeren er slettet
  q('UPDATE fh_tokens SET last_used=? WHERE id=?').run(Date.now(), row.id);
  return { user: u.id, info: u, admin: u.role === 'admin', scopes: new Set(row.scopes.split(' ')), session: false, tokenId: row.id };
}
const hasScope = (a, s) => a.scopes.has(s) || (IMPLIED[s] && a.scopes.has(IMPLIED[s]));

// For andre moduler (Matplan, Domener) som vil godta mobilappens token: true når økt eller token med scope finnes.
export function bearerOk(c, scope = 'finance:read') { const a = access(c); if (a && !c.get('user')) c.set('user', a.user); return !!a && hasScope(a, scope); }
// Tokens for brukere som slettes (kalles av brukeradministrasjonen; access() rydder også selv).
export const revokeUserTokens = (userId) => q('DELETE FROM fh_tokens WHERE user_id=?').run(userId).changes;

const need = (...scopes) => async (c, next) => {
  const a = c.get('access');
  if (!scopes.some((s) => hasScope(a, s))) return bad(c, `Tokenet mangler tilgangen ${scopes[0]}`, 403);
  await next();
};
const sessionOnly = async (c, next) => { if (!c.get('access').session) return bad(c, 'Krever innlogging i nettleseren', 403); await next(); };
const adminOnly = async (c, next) => { if (!c.get('access').admin) return bad(c, 'Bare administratorer kan endre serveroppsettet', 403); await next(); };
const isMain = (a) => a.user === OWNER || !!a.info?.isMainAdmin;
const mainOnly = async (c, next) => { if (!isMain(c.get('access'))) return bad(c, 'Bare hovedadministratoren kan ta backup av og gjenopprette hele databasen', 403); await next(); };
/** uid(c): den innlogde brukeren. Alle spørringer mot personlige fh_*-tabeller filtrerer på denne. */
export const uid = (c) => c.get('user');

/* ---------------- Hjelpere ---------------- */

const catById = (u = me()) => new Map(q('SELECT * FROM fh_categories WHERE user_id=?').all(u).map((x) => [x.id, x]));
const accById = (u = me()) => new Map(q('SELECT * FROM fh_accounts WHERE user_id=?').all(u).map((x) => [x.id, x]));

function txOut(t, cats = catById(), accs = accById()) {
  const cat = cats.get(t.category_id), acc = accs.get(t.account_id);
  return { id: t.id, date: t.date, amount: t.amount / 100, description: t.description, merchant: t.merchant, note: t.note, source: t.source,
    categoryId: t.category_id, category: cat?.name ?? 'Ukategorisert', color: cat?.color ?? '#A0A0AA', kind: cat?.kind ?? 'expense',
    accountId: t.account_id, account: acc?.name ?? '–', receipt: t.receipt_status ?? null, receiptId: t.receipt_id ?? null,
    type: t.amount > 0 ? 'income' : 'expense', folderId: t.folder_id ?? null, hasBankRow: !!t.raw_bank_row, ...aiOf(t, cat?.name),
    tags: tagsOf40(t), added: addedOf40(t, 'tx') }; // prompt 40: «Lagt til …» og tagger
}
// ✦-felt: AI-tekst hvis den finnes, ellers heuristikk. Varelinjer fra koblet kvittering.
function aiOf(t, category) {
  let lines = [];
  try { lines = t.receipt_extraction ? (JSON.parse(t.receipt_extraction).lines ?? []).map((l) => ({ description: l.description, amount: l.amount })) : []; } catch { /* ugyldig */ }
  const name = t.merchant || t.description;
  const h = (!t.ai_short || !t.ai_long) ? heuristic({ merchant: name, amount: t.amount / 100, lines, category }) : {};
  return { aiShort: t.ai_short || t.receipt_ai_short || h.short || null, aiLong: t.ai_long || t.receipt_ai_long || h.long || null,
    domain: t.domain || domainFor(name) || domainFor(t.description), lines, folder: t.folder_name ?? null };
}

const TX_SELECT = `SELECT t.*, r.status AS receipt_status, r.id AS receipt_id, r.extraction AS receipt_extraction, r.ai_short AS receipt_ai_short, r.ai_long AS receipt_ai_long,
  (SELECT f.name FROM fh_folder_entries e JOIN fh_folders f ON f.id=e.folder_id WHERE e.tx_id=t.id LIMIT 1) AS folder_name,
  (SELECT e.folder_id FROM fh_folder_entries e WHERE e.tx_id=t.id LIMIT 1) AS folder_id FROM fh_transactions t
  LEFT JOIN fh_receipts r ON r.transaction_id = t.id AND r.user_id = t.user_id`;

// Regler: * er jokertegn, ingen skiller på store/små bokstaver. Mønsteret kan starte ved et hvilket som helst ord,
// så «REMA*» treffer også bankteksten «VARER REMA 1000 MAJORSTUEN». Lavest prioritet, deretter lengste mønster, vinner.
function ruleFor(text, u = me()) {
  const t = String(text ?? '').toUpperCase();
  const rules = q('SELECT * FROM fh_rules WHERE user_id=? ORDER BY priority, length(pattern) DESC').all(u);
  for (const r of rules) {
    const re = new RegExp('(?:^|\\s)' + r.pattern.toUpperCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (re.test(t)) return r.category_id;
  }
  return null;
}
const catIdByName = (name, u = me()) => (name ? q('SELECT id FROM fh_categories WHERE lower(name)=lower(?) AND user_id=?').get(name, u)?.id ?? null : null);
const accName = (id, u = me()) => (id ? q('SELECT name, bank FROM fh_accounts WHERE id=? AND user_id=?').get(id, u) : null);
// Rad i en personlig tabell som tilhører brukeren (ellers undefined → 404).
const own = (table, id, u = me()) => q(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(id, u);
// Opprinnelig bankrad til raw_bank_row: cellene uendret, pluss konto, bank, kilde og når den ble importert.
function bankJson(bank, meta) {
  if (!bank) return null;
  const a = meta.account;
  return JSON.stringify({ ...bank, ...meta, account: a?.name ?? null, bank: a?.bank || null, source: bank.source ?? meta.source ?? null, file: bank.file ?? meta.file ?? null });
}

// Periode for en måned, med valgfri lønningsdag som månedsstart.
export function period(month) {
  const ms = Math.min(28, Math.max(1, +settings().monthStart || 1));
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-${String(ms).padStart(2, '0')}`;
  const n = new Date(y, m, ms); // neste måned
  const to = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(ms).padStart(2, '0')}`;
  return { from, to };
}
const curMonth = () => {
  const ms = +settings().monthStart || 1, d = new Date();
  if (d.getDate() < ms) d.setMonth(d.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (month, k) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function budgetsFor(month, u = me()) {
  const rows = q("SELECT category_id, month, amount FROM fh_budgets WHERE month IN ('default', ?) AND user_id=?").all(month, u);
  const out = {};
  for (const r of rows) if (r.month === 'default' && out[r.category_id] === undefined) out[r.category_id] = r.amount;
  for (const r of rows) if (r.month === month) out[r.category_id] = r.amount;
  return out;
}

function nextDate(r, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  const clamp = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  if (r.interval === 'yearly') {
    let x = clamp(d.getFullYear(), (r.month ?? 1) - 1, r.day);
    if (x < new Date(from.toDateString())) x = clamp(d.getFullYear() + 1, (r.month ?? 1) - 1, r.day);
    return x;
  }
  if (r.interval === 'weekly') {
    const x = new Date(from.toDateString()); x.setDate(x.getDate() + ((r.day % 7) - x.getDay() + 7) % 7); return x;
  }
  let x = clamp(d.getFullYear(), d.getMonth(), r.day);
  if (x < new Date(from.toDateString())) x = clamp(d.getFullYear(), d.getMonth() + 1, r.day);
  return x;
}
const monthlyOf = (r) => (r.interval === 'yearly' ? r.amount / 12 : r.interval === 'weekly' ? (r.amount * 52) / 12 : r.amount);

function recurringOut(r, cats = catById()) {
  const cat = cats.get(r.category_id);
  return { id: r.id, name: r.name, amount: r.amount / 100, interval: r.interval, day: r.day, month: r.month, active: !!r.active, detected: !!r.detected,
    categoryId: r.category_id, category: cat?.name ?? '–', color: cat?.color ?? '#A0A0AA', accountId: r.account_id, next: nextDate(r).toLocaleDateString('sv-SE') };
}

function receiptOut(r, cats = catById(), accs = accById()) {
  const st = settings();
  const ex = r.extraction ? JSON.parse(r.extraction) : null;
  let flag = null;
  if (r.status === 'needs_review') {
    const lineSum = ex?.lines?.reduce((a, l) => a + l.amount, 0) ?? 0;
    if ((r.confidence ?? 0) < st.minConf / 100) flag = 'Sjekk beløp – usikker utlesing';
    else if (ex?.lines?.length && r.total != null && Math.abs(lineSum * 100 - r.total) > 100) flag = 'Varelinjene stemmer ikke med totalen';
  }
  const match = r.transaction_id ? q('SELECT * FROM fh_transactions WHERE id=? AND user_id=?').get(r.transaction_id, r.user_id ?? me()) : null;
  return { id: r.id, status: r.status, provider: r.provider ? providerName(r.provider) : null, rawProvider: r.provider, model: r.model, seconds: r.seconds,
    merchant: r.merchant, date: r.date, total: r.total != null ? r.total / 100 : null, categoryId: r.category_id, category: cats.get(r.category_id)?.name ?? null,
    accountId: r.account_id, account: accs.get(r.account_id)?.name ?? null, confidence: r.confidence, flag, error: r.error, mime: r.mime,
    file: r.file ? `/finans/api/receipts/${r.id}/file` : null, thumb: r.thumb ? `/finans/api/receipts/${r.id}/thumb` : null,
    extraction: ex, match: match ? txOut(match, cats, accs) : null, created: r.created, name: r.name ?? null,
    lines: receiptLines(r), hasBoxes: receiptLines(r).some((l) => l.bbox),
    // Prompt 39: kategorivalget og sumkontrollen («✦ Glimt leste 3 varer · sum stemmer» / «Usikker · linjene summerer 120 av 135 kr»).
    categoryInfo: ex?.cat39 ? { category: ex.cat39.category, isNew: !!ex.cat39.isNew, confidence: ex.cat39.confidence, reason: ex.cat39.reason ?? null, ...(ex.cat39.suggestNew ? { suggestNew: ex.cat39.suggestNew } : {}),
      newCategory: ex.cat39.isNew ? (() => { const c = cats.get(r.category_id); return c && c.source === 'ai' ? { id: c.id, name: c.name, confirmed: !!c.confirmed } : null; })() : null } : null,
    aiCategory: ex?.cat39 ? { category: ex.cat39.category, isNew: !!ex.cat39.isNew, confidence: ex.cat39.confidence, reason: ex.cat39.reason ?? null } : null,
    verify: ex ? (ex.verify ? { ok: ex.verify.ok, status: ex.verify.status, text: ex.verify.text, sum: ex.verify.sum, total: ex.verify.total, diff: ex.verify.diff, lines: ex.verify.lines } : (ex.lines ? (({ feedback, ...v }) => v)(verify39(ex)) : null)) : null,
    payment: ex?.payment_method ?? null, discounts: ex?.discounts ?? [], pant: ex?.pant ?? 0, vat: ex?.vat ?? [], receiptNo: ex?.receipt_no ?? null, time: ex?.time ?? null,
    aiShort: r.ai_short ?? (r.status === 'pending' || r.status === 'processing' ? `${providerName(st.provider)} leser kvitteringen …` : null), aiLong: r.ai_long ?? null,
    ...reanalyzeInfo(r, st), ...(reanalyzeJobOf(r) ? { reanalyzeJob: reanalyzeJobOf(r) } : {}), log: scanLogOf(r), timeoutEngine: r.timeout_engine ?? null, retryAt: r.retry_at ?? null,
    added: addedOf40(r, 'receipt'), // prompt 40: «Lagt til … · skannet kvittering · Sebastian»
    domain: r.domain || domainFor(r.merchant), target: r.target ?? null, source: r.source ?? 'upload',
    // Prompt 47: etiketten «Tolket på iPhone» / «Tolket av Glimt».
    tolketAv: r.source === 'apple-fm' ? 'apple-on-device' : 'glimt-ollama', tolketAvTekst: r.source === 'apple-fm' ? 'Tolket på iPhone' : 'Tolket av Glimt', ...(r.meta ? { email: (() => { try { const m = JSON.parse(r.meta); return { from: m.from, subject: m.subject, date: m.date }; } catch { return null; } })() } : {}) };
}

// «✦ Analyser på nytt med Gemini»: når lesingen feilet, var usikker (under minConf) eller Ollama var usikker.
// Krever Gemini-nøkkel; ellers sier reanalyzeReason hva som mangler.
function reanalyzeInfo(r, st = settings()) {
  // Prompt 41: «Les på nytt med Glimt» er lov for alle statuser (også bokført/avvist) – det lager bare et forslag.
  const re41 = !r.file ? { canReread: false, rereadReason: 'Fant ikke originalbildet. Last det opp på nytt for å lese det.' } : ['pending', 'processing'].includes(r.status) ? { canReread: false }
    : hasGemini() ? { canReread: true } : { canReread: false, rereadReason: 'Legg inn en Gemini-nøkkel under Innstillinger → AI-motor for å lese på nytt.' };
  return { ...reanalyzeInfo0(r, st), ...re41 };
}
function reanalyzeInfo0(r, st) {
  if (!r.file || ['booked', 'rejected', 'pending', 'processing'].includes(r.status)) return { canReanalyze: false, canOcr: false };
  // Lokal OCR kan alltid prøves på bilder (også når AI-svaret var bra, f.eks. for å sammenligne).
  const ocr = { canOcr: r.mime !== 'text/plain' };
  const unsure = (r.confidence ?? 0) < st.minConf / 100;
  const needs = r.status === 'failed' || !!r.error || unsure;
  if (!needs) return { canReanalyze: false, ...ocr };
  if (!hasGemini()) return { canReanalyze: false, ...ocr, reanalyzeReason: 'Legg inn en Gemini-nøkkel under Innstillinger → AI-motor for å analysere på nytt.' };
  // Prompt 48: «Finansdata forlater aldri huset» – ikke tilby Gemini (kallet blokkeres uansett; knappen skal ikke villede).
  const xb48 = externalBlocked48();
  if (xb48.blocked) return { canReanalyze: false, ...ocr, reanalyzeReason: `${xb48.text}, så kvitteringen analyseres ikke på nytt med Gemini. Prøv lokal OCR i stedet.` };
  return { canReanalyze: true, ...ocr, ...(r.candidate ? { reanalyzePending: true } : {}) };
}

// Finn banktransaksjon: samme beløp ±1 kr og dato ±3 dager, uten kvittering fra før. Kort-siffer gir forrang.
function findMatch(totalOre, date, last4, u = me()) {
  if (totalOre == null || !date) return null;
  const rows = q(`SELECT t.*, a.last4 FROM fh_transactions t LEFT JOIN fh_accounts a ON a.id=t.account_id
    WHERE t.user_id=? AND t.amount BETWEEN ? AND ? AND t.date BETWEEN date(?, '-3 days') AND date(?, '+3 days')
    AND NOT EXISTS (SELECT 1 FROM fh_receipts r WHERE r.transaction_id=t.id AND r.status='booked')`).all(u, -totalOre - 100, -totalOre + 100, date, date);
  rows.sort((a, b) => ((b.last4 && b.last4 === last4) - (a.last4 && a.last4 === last4)) || Math.abs(Date.parse(a.date) - Date.parse(date)) - Math.abs(Date.parse(b.date) - Date.parse(date)));
  return rows[0] ?? null;
}

/* ---------------- Kvitteringer: eier og boliger (ISO2) ---------------- */
// Hver kvittering tilhører brukeren som lastet den opp (fh_receipts.user_id) og hører til det regnskapet.
// Lister, kø, jobs og søk viser bare egne. En kvittering lastet opp til en bolig kan i tillegg SES (ikke endres)
// av boligens medlemmer.
const folderOfTarget = (target) => { const m = String(target ?? '').match(/^folder:(\d+)/); return m ? +m[1] : null; };
const inMemberFolder = (r, u) => (folderOfTarget(r.target) != null && !!q('SELECT 1 FROM fh_folder_members WHERE folder_id=? AND user_id=?').get(folderOfTarget(r.target), u))
  || !!q('SELECT 1 FROM fh_folder_entries e JOIN fh_folder_members m ON m.folder_id=e.folder_id WHERE e.receipt_id=? AND m.user_id=?').get(r.id, u);
// SQL for lister og tellinger (ett ?-parameter: brukeren).
const RC_VISIBLE = 'user_id=?';
// Kvitteringen i :id når brukeren eier den, ellers null (gir 404 som en ukjent kvittering).
const rcGet = (c, id = c.req.param('id')) => q('SELECT * FROM fh_receipts WHERE id=? AND user_id=?').get(id, c.get('user')) ?? null;
// Lesing: også for medlemmer av boligen kvitteringen ble lastet opp til.
const rcView = (c, id = c.req.param('id')) => { const r = q('SELECT * FROM fh_receipts WHERE id=?').get(id); return r && (r.user_id === c.get('user') || inMemberFolder(r, c.get('user'))) ? r : null; };

/* ---------------- Kvitteringskø ---------------- */

const queue = [];
let running = false;
async function runQueue() {
  if (running) return;
  running = true;
  // Én kvittering som feiler (eller en uventet feil her) skal aldri stoppe resten av køen.
  try { while (queue.length) {
    const { id, force } = queue.shift();
    const r = q('SELECT * FROM fh_receipts WHERE id=?').get(id);
    if (!r) continue;
    // ISO2: hver jobb kjører som eieren av kvitteringen (egne kategorier, regler, kontoer, bankmatch og AI-logg).
    await runAsUser(r.user_id || OWNER, () => processReceipt(r, id, force));
  } } catch (e) { console.error('[skann] køen', e); } finally { running = false; }
  if (queue.length) setImmediate(runQueue);
}
// Prompt 34: «Analyseres av AI» – steg, delresultater og modell per kvittering mens AI-en leser (GET /receipts/analyzing),
// samme jobb i AI-kontroll → Jobber (kind 'receipt', ref 'receipt:<id>') og en samtale i Chat-mappen «Kvitteringer og skanninger».
export const RC_STEPS = [['upload', 'Lastet opp'], ['read', 'Leser bildet'], ['fields', 'Finner butikk, dato og sum'], ['lines', 'Leser varelinjer'], ['category', 'Foreslår kategori']];
const rcLive = new Map(); // id → {at:'read'|…, partial, model, jobId, chatId, started, ctrl}
const kr = (n) => `${Number(n).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
const SOURCE_TEXT = { upload: 'Kvittering lastet opp', camera: 'Kvittering skannet med kamera', email: 'Kvittering fra e-post' };
function rcScanChat(r, id, patch) {
  try {
    const live = rcLive.get(id);
    const res = upsertScanChat(r.user_id || OWNER, { kind: 'receipt', ref: { receiptId: id }, source: SOURCE_TEXT[r.source] ?? 'Kvittering lastet opp',
      attachment: { name: r.name || 'kvittering', url: `/finans/api/receipts/${id}/file`, ...(r.thumb ? { thumb: `/finans/api/receipts/${id}/thumb` } : {}), mime: r.mime ?? null }, ...patch });
    if (live) live.chatId = res.chatId;
    return res.chatId;
  } catch (e) { console.warn('[skann] chat', e.message); return null; }
}
const rcTools = (at, d, extra = []) => {
  const i = RC_STEPS.findIndex(([k]) => k === at);
  const lab = { fields: d?.merchant ? `Fant ${d.merchant}` : 'Finner butikk', lines: d?.lines ? `Fant ${d.lines.length} varelinjer` : 'Leser varelinjer', category: 'Kategoriserte' };
  return [...RC_STEPS.slice(1).map(([k, l], j) => ({ label: k === 'read' ? 'Leste kvittering' : lab[k] ?? l, done: j + 1 < i || at === 'done' })), ...extra];
};
export function analyzingOut(r) {
  const live = rcLive.get(r.id) ?? {};
  const at = live.at ?? (r.status === 'pending' ? 'upload' : 'read');
  const idx = RC_STEPS.findIndex(([k]) => k === at);
  const est = r.status === 'processing' ? Math.min(92, Math.round(((Date.now() - (r.started ?? Date.now())) / 12000) * 90) + 5) : 0;
  const p = live.partial ?? {};
  return { id: r.id, receiptId: r.id, file: r.name ?? 'kvittering', thumb: r.thumb ? `/finans/api/receipts/${r.id}/thumb` : null, status: r.status === 'pending' ? 'queued' : 'analyzing',
    model: live.model ?? null, progress: Math.max(est, idx >= 0 ? idx * 20 : 0), step: at, stepLabel: RC_STEPS[idx]?.[1] ?? 'Leser bildet',
    steps: RC_STEPS.map(([k, label], i) => ({ k, label, done: i < idx || (k === 'upload') })),
    partial: { store: p.store ?? null, sum: p.sum ?? null, lines: p.lines ?? null, category: p.category ?? null, confidence: p.confidence ?? null },
    title: p.store ?? 'Leser kvittering …', statusText: r.ai_short ?? null, startedAt: r.started ? new Date(r.started).toISOString() : null,
    jobId: live.jobId ?? null, chatId: live.chatId ?? scanChatFor(r.user_id || OWNER, 'receipt', { receiptId: r.id }), cancellable: true };
}
async function processReceipt(r, id, force) {
  {
    q("UPDATE fh_receipts SET status='processing', error=NULL, started=?, retry_at=NULL WHERE id=?").run(Date.now(), id);
    const live = { at: 'read', partial: {}, model: null, started: Date.now(), ctrl: new AbortController() };
    rcLive.set(id, live);
    const owner = r.user_id || OWNER;
    live.jobId = aiJobStart({ user: owner, task: 'rc', kind: 'receipt', title: `Kvittering · ${r.name ?? 'bilde'}`, ref: `receipt:${id}`, ctrl: live.ctrl });
    rcScanChat(r, id, { title: 'Leser kvittering …', text: 'Leser kvitteringen …', status: 'running', tools: rcTools('read', null) });
    const step = (at, partial = {}) => { live.at = at; Object.assign(live.partial, partial); aiJobUpdate(live.jobId, { step: RC_STEPS.find(([k]) => k === at)?.[1] ?? at, progress: Math.max(5, RC_STEPS.findIndex(([k]) => k === at) * 20), partial: live.partial, ...(live.model ? { model: live.model } : {}) }); };
    const log = (stepName, detail) => { scanLog(id, stepName, detail); if (stepName === 'ai') { const m = String(detail).match(/\(([^)]+)\)/); if (m) { live.model = m[1]; aiJobUpdate(live.jobId, { model: m[1] }); } } };
    // «✦ Gemini svarte ikke innen 20 s · prøver Groq …» vises i køen (aiShort/statusText i /receipts/jobs).
    const status = (text, info = {}) => q("UPDATE fh_receipts SET ai_short=?, timeout_engine=COALESCE(?, timeout_engine) WHERE id=? AND status='processing'").run(text, info.timeoutEngine ?? null, id);
    try {
      const rel = r.scan ?? r.file;
      let img;
      try { img = await readFile(join(DIR, rel)); } catch (e) { throw new Error(`Fant ikke filen på serveren (${e.code ?? e.message})`); }
      const mime = r.scan ? 'image/jpeg' : r.mime;
      log('lest', `${rel.split('/').pop()} · ${mime} · ${Math.round(img.length / 1024)} kB${r.scan ? ' (nedskalert JPEG)' : ''}`);
      if (isHeic(mime)) log('heic', hasGemini() ? 'HEIC uten JPEG-kopi fra klienten: sendes til Gemini, som kan lese HEIC' : 'HEIC uten JPEG-kopi og uten Gemini-nøkkel: Ollama kan ikke lese HEIC');
      const cats = q("SELECT name FROM fh_categories WHERE kind='expense' AND user_id=? ORDER BY sort").all(me()).map((x) => x.name);
      // E-post uten vedlegg lagres som tekst og leses som tekst.
      // Etter tre runder i køen gjelder «neste motor», så jobben ikke venter for alltid.
      const onTimeout = (r.retry_n ?? 0) >= QUEUE_MAX ? 'next' : undefined;
      // Prompt 47: ferdig tolket på iPhone (apple-fm) → ikke nytt AI-kall; OCR-tekst fra Android/iPhone får OCR-instruksen.
      const ocr47 = ocrTextOf47(r, force);
      const res = preParsed47(r, force) ?? preScanned48(r, force) ?? (ocr47 ? await extractText(ocr47, cats, { kind: 'ocr' }) : r.mime === 'text/plain' ? await extractText(img.toString('utf8'), cats, textKind47(r)) : await extract(img, mime, cats, force, { log, status, onTimeout }));
      const d = res.data;
      if (live.ctrl.signal.aborted) throw Object.assign(new Error('Avbrutt av brukeren'), { cancelled: true });
      live.model = res.model ?? live.model;
      step('fields', { store: d.merchant ?? null, sum: d.total ?? null });
      step('lines', { lines: d.lines?.length ?? 0 });
      if (res.timeoutEngine) q('UPDATE fh_receipts SET timeout_engine=? WHERE id=?').run(res.timeoutEngine, id);
      log('lest-ut', `${providerName(res.provider)} · ${d.merchant ?? 'ukjent butikk'} · ${d.total ?? '–'} kr · sikkerhet ${Math.round((d.confidence.total ?? 0) * 100)} % · ${res.seconds?.toFixed?.(1) ?? '?'} s`);
      const totalOre = d.total != null ? Math.round(d.total * 100) : null;
      const st = settings();
      // Regler går foran AI-forslaget. Prompt 39: ellers velger (eller lager) Glimt kategorien (isNew, confidence, reason).
      const rule = st.autoCat && ruleFor(d.merchant);
      const k39 = rule ? null : (() => { try { return classify39(me(), d); } catch (e) { console.warn('[finans39] kategori:', e.message); return null; } })();
      if (k39) d.cat39 = k39;
      if (!d.verify) { d.verify = verify39(d); d.status = d.verify.status; }
      const catId = rule || k39?.categoryId || catIdByName(d.suggested_category) || r.category_id;
      const acc = d.card_last4 ? q('SELECT id FROM fh_accounts WHERE last4=? AND user_id=?').get(d.card_last4, me())?.id : null;
      const match = findMatch(totalOre, d.date, d.card_last4);
      q(`UPDATE fh_receipts SET status='needs_review', provider=?, model=?, seconds=?, extraction=?, merchant=?, date=?, total=?, category_id=?,
         account_id=COALESCE(?, account_id), confidence=?, transaction_id=? WHERE id=? AND status='processing'`)
        .run(res.provider, res.model, res.seconds, JSON.stringify(d), d.merchant, d.date ?? r.date, totalOre, catId,
          acc ?? match?.account_id ?? null, Math.min(d.confidence.total, d.confidence.merchant || 1), match?.id ?? null, id);
      storeLines(id); // prompt 30: linjer med bbox
      const catName = catById().get(catId)?.name ?? null;
      const confPct = Math.round(Math.min(d.confidence.total, d.confidence.merchant || 1) * 100);
      step('category', { category: catName, confidence: confPct });
      const sum = await summarizeReceipt(d, catById().get(catId)?.name);
      q('UPDATE fh_receipts SET ai_short=?, ai_long=?, domain=? WHERE id=?').run(sum.short, sum.long, sum.domain, id);
      routeTarget(id);
      log('lagret', 'klar til gjennomgang');
      // Ferdig: jobben, og svaret i Chat («Butikk · beløp», varelinjer, kategori og sikkerhet, hva som ble gjort).
      aiJobEnd(live.jobId, { model: res.model ?? live.model, provider: res.provider ?? null, ms: Date.now() - live.started, partial: live.partial });
      const lines = (d.lines ?? []).slice(0, 12).map((l) => `- ${l.description} · ${kr(l.amount)}`).join('\n');
      const title = `${d.merchant ?? 'Kvittering'}${d.total != null ? ` · ${kr(d.total)}` : ''}`;
      rcScanChat(r, id, { title, model: res.model ?? live.model, status: 'done', tools: [...rcTools('done', d), { label: match ? 'Koblet til banktransaksjon' : 'Lagt i Til godkjenning', done: true }],
        text: `**${d.merchant ?? 'Ukjent butikk'}**${d.date ? ` · ${d.date}` : ''}${d.total != null ? ` · **${kr(d.total)}**` : ''}\n${lines}${lines ? '\n' : ''}Kategori: ${catName ?? 'ukjent'} · ${confPct} % sikker.\nLagt i Til godkjenning${match ? ' og koblet til en banktransaksjon' : ''}.` });
    } catch (e) {
      if (e.queue) { aiJobUpdate(live.jobId, { status: 'queue', step: 'Lagt i kø', error: e.message }); queueLater(id, e, r); return; }
      aiJobUpdate(live.jobId, { status: e.cancelled ? 'cancelled' : 'fail', error: e.message, ms: Date.now() - live.started });
      rcScanChat(r, id, { title: `Kvittering · ${r.name ?? 'kunne ikke leses'}`, status: 'failed', text: `Kunne ikke lese kvitteringen: ${e.message}. Fyll ut manuelt under Til godkjenning.`, tools: rcTools(live.at, null) });
      if (e.timeoutEngine) q('UPDATE fh_receipts SET timeout_engine=? WHERE id=?').run(e.timeoutEngine, id);
      console.warn('[finans] Kvittering', id, e.message);
      log('feil', e.message);
      q("UPDATE fh_receipts SET status='needs_review', error=?, confidence=0 WHERE id=? AND status='processing'").run(`Kunne ikke leses automatisk: ${e.message}. Fyll ut manuelt.`, id);
      try { routeTarget(id); } catch { /* mappen kan være slettet */ }
    } finally { rcLive.delete(id); }
  }
}
// Kvitteringer lastet opp fra Subscription OS eller en delt mappe havner også der når AI-en er ferdig.
// Fra mappe: target «folder:<id>:<bruker-id>». Posten havner i boligen, og kvitteringen til gjennomgang i opplasterens eget regnskap.
function routeTarget(id) {
  const r = origSelect.get(id);
  if (!r?.target) return;
  // «Legg ved kvittering» fra en transaksjon: kvitteringen hører til den, uansett hva bankmatchen fant.
  const owner = r.user_id || OWNER;
  const tm = r.target.match(/^tx:(\d+)$/);
  if (tm) { if (own('fh_transactions', +tm[1], owner)) q('UPDATE fh_receipts SET transaction_id=? WHERE id=?').run(+tm[1], id); return; }
  if (r.target === 'sub' && r.total != null && !q('SELECT 1 FROM fh_subscriptions WHERE name=? AND active=1 AND user_id=?').get(r.merchant, owner)) {
    q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,domain,ai_short,charge_day,category,created,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(r.merchant || 'Ukjent', 'Fra kvittering', r.total, 'monthly', r.date ? shiftDate(r.date, 1) : null, 'Ny', r.domain, r.ai_short,
        r.date ? +r.date.slice(8, 10) : null, subsOs.categoryFor(r.merchant), Date.now(), owner);
  }
  const f = r.target.match(/^folder:(\d+)(?::(.+))?$/);
  if (f && q('SELECT 1 FROM fh_folders WHERE id=?').get(+f[1])) {
    const uid = f[2] ?? owner;
    const payer = q('SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?').get(+f[1], uid)?.name
      ?? q("SELECT name FROM fh_folder_members WHERE folder_id=? ORDER BY role='owner' DESC, id LIMIT 1").get(+f[1])?.name ?? settings(uid).name;
    let lines = []; try { lines = JSON.parse(r.extraction ?? 'null')?.lines ?? []; } catch { /* ugyldig */ }
    // Kategori: heuristikk med en gang, og AI (med kategorilisten, kan lage nye) i bakgrunnen. Eget valg beholdes.
    const text = `${r.merchant ?? ''} ${r.name ?? ''} ${lines.map((l) => l.description).join(' ')}`;
    let entry = q('SELECT id FROM fh_folder_entries WHERE receipt_id=?').get(r.id);
    if (!entry) {
      entry = q("INSERT INTO fh_folder_entries(folder_id,receipt_id,tx_id,description,date,amount,paid_by,category,status,created) VALUES(?,?,?,?,?,?,?,?,'review',?) RETURNING id")
        .get(+f[1], r.id, r.transaction_id, r.merchant || r.name || 'Kvittering', r.date || today(), r.total ?? 0, payer, null, Date.now());
    } else q('UPDATE fh_folder_entries SET description=?, date=?, amount=? WHERE receipt_id=?').run(r.merchant || 'Kvittering', r.date || today(), r.total ?? 0, r.id);
    // Automatisk kategorisering kan slås av per bolig (auto_cat).
    if (q('SELECT auto_cat FROM fh_folders WHERE id=?').get(+f[1])?.auto_cat !== 0) assignCategory(entry.id, text, null);
    // ISO2: kvitteringen går til gjennomgang i opplasterens eget regnskap (bokføres der). Eldre «filed» beholdes som de er.
  }
}
const shiftDate = (iso, months) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1 + months, Math.min(d, 28)); return x.toLocaleDateString('sv-SE'); };
// onTimeout=queue: jobben legges tilbake som «pending» med retry_at og prøves igjen senere (5, 10, 20 min; maks tre runder).
const QUEUE_MAX = 3;
const hm = (ms) => new Date(ms).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
function scheduleRetry(id, at) {
  setTimeout(() => {
    if (q("SELECT 1 FROM fh_receipts WHERE id=? AND status='pending'").get(id) && !queue.some((x) => x.id === id)) { queue.push({ id }); runQueue(); }
  }, Math.max(0, at - Date.now())).unref?.();
}
function queueLater(id, e, r) {
  const n = (r.retry_n ?? 0) + 1;
  const at = Date.now() + 5 * 60_000 * 2 ** (n - 1) * _aiTest.scale;
  const text = `${e.message} · lagt i kø, prøver igjen kl. ${hm(at)}`;
  q("UPDATE fh_receipts SET status='pending', retry_at=?, retry_n=?, timeout_engine=?, ai_short=?, started=NULL WHERE id=? AND status='processing'").run(at, n, e.timeoutEngine ?? null, text, id);
  scanLog(id, 'kø', text);
  scheduleRetry(id, at);
}
// Gjenoppta bilag som ble avbrutt ved omstart. Bilag som venter på et nytt forsøk (retry_at), tas når tiden er inne.
setTimeout(() => {
  for (const r of q("SELECT id, retry_at FROM fh_receipts WHERE status IN ('pending','processing')").all()) {
    if (r.retry_at && r.retry_at > Date.now()) scheduleRetry(r.id, r.retry_at); else queue.push({ id: r.id });
  }
  runQueue();
}, 2000).unref?.();

/* ---------------- Ruter ---------------- */

const api = new Hono();

// Innlogging fra de native appene: brukernavn + passord (+ TOTP-kode) → token. Rate limiting og 2FA skjer i verifyLogin.
// Tokenet gir bare tilgang til /finans/api, aldri til resten av homelab. Uten brukernavn gjelder eieren (eldre apper).
async function tokenLogin(c) {
  const b = await c.req.json().catch(() => ({}));
  const r = verifyLogin(b.username, b.password, b.code ?? b.totp, clientIp(c));
  if (!r.ok) {
    if (r.status === 401 && !r.needsTotp) await new Promise((res) => setTimeout(res, 400));
    return c.json({ error: r.error, ...(r.needsTotp ? { needsTotp: true } : {}) }, r.status ?? 401);
  }
  const token = newToken();
  // ISO2: alle roller har sitt eget regnskap, så alle får full tilgang til det (også finance:write).
  const scopes = SCOPES;
  q('INSERT INTO fh_tokens(id,name,scopes,created,user_id) VALUES(?,?,?,?,?)').run(tokenKey(token), str(b.deviceName ?? b.device, 60) || 'Mobilapp', scopes.join(' '), Date.now(), r.user.id);
  return c.json({ token, scopes, user: { id: r.user.id, username: r.user.username, role: r.user.role, name: r.user.name } });
}
api.post('/auth/token', tokenLogin);
api.post('/login', tokenLogin); // alias for mobilappene (Mobil v2)
// Logoer er offentlige favicons og trenger ingen innlogging (de vises også i <img> uten Authorization-header i appene).
api.get('/logo/:domain', async (c) => {
  const d = validDomain(c.req.param('domain'));
  const img = d ? await logo(d) : null;
  if (!img) return c.body(null, 404, { 'Cache-Control': 'public, max-age=86400' });
  const type = img[0] === 0x89 ? 'image/png' : img[0] === 0xff ? 'image/jpeg' : img[0] === 0x3c ? 'text/plain' : 'image/x-icon';
  if (type === 'text/plain') return c.body(null, 404);
  return c.body(img, 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
});
// Logobiblioteket (prompt 20): /logos/registry, /logos/file/:id og /logos/match, offentlig som /logo/:domain.
mountLogoRoutes(api);
mountP27Public(api); // prompt 27: lagrede butikklogoer (/merchants/logo/file/:file), offentlig som /logo/:domain
// Appen logger ut ved å trekke tilbake sitt eget token.
api.post('/auth/logout', async (c) => {
  const m = c.req.header('authorization')?.match(TOKEN_RE);
  if (m) q('DELETE FROM fh_tokens WHERE id=?').run(tokenKey(m[1]));
  return ok(c);
});

api.use('*', async (c, next) => {
  const a = access(c);
  if (!a) return bad(c, 'Ikke innlogget', 401);
  c.set('access', a);
  c.set('user', a.user);
  // ISO2: ingen «husholdning = admin» lenger. Alle får sitt eget regnskap (standardkategorier ved første bruk), og alt
  // under kjører som brukeren (me() i db.js, AI-logg, bakgrunnsjobber som startes herfra).
  ensureLedger(a.user);
  if (process.env.MOCK_DATA === '1' && a.user !== OWNER) mockDemo(a.user);
  return runAsUser(a.user, () => next());
});
// MOCK_DATA=1: hver bruker får sin egen demo (én gang), ikke eierens.
function mockDemo(u) {
  if (kv.get(u, 'fh_demo_v1', false) || q('SELECT 1 FROM fh_transactions WHERE user_id=? LIMIT 1').get(u)) return;
  kv.set(u, 'fh_demo_v1', Date.now());
  try { loadDemo(u); } catch (e) { console.warn('[finans] demo', e.message); }
}
const R = need('finance:read'), W = need('finance:write');
mountSubsAsk(api, { R, W }); // prompt 32: /subscriptions/knowledge (før /subscriptions/:id)
mountSubsLog46(api, { R, W }); // prompt 46: /subscriptions/log (+ .csv) – fakturaer og prøveperioder (server/subs-log46.js)
mountP27(api, { R, W }); // prompt 27: /forslag, /ai-audit, /merchants/logo, /receipts/:id/logo/ai, /subscriptions/from-screenshot
// Prompt 31: /subscriptions/trials (før /subscriptions/:id). «Behold» gjør prøven om til et vanlig abonnement.
mountShared37(api, { W, subOut }); // prompt 37: /subscriptions/:id/members og /leave
mountTrials(api, { R, W, toSubscription: (u, t) => subOut(q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,domain,charge_day,category,created,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
  .get(t.service.slice(0, 80), '', Math.round((t.price_after ?? 0) * 100), 'monthly', t.ends_at, 'Fra prøveperiode', domainFor(t.service), +t.ends_at.slice(8, 10), subsOs.categoryFor(t.service), Date.now(), u)) });
// Original + JPEG-kopi + miniatyr i samme forespørsel; et 48 MP-bilde fra iPhone kan alene være over 15 MB.
const upload = bodyLimit({ maxSize: Number(process.env.MAX_UPLOAD_MB ?? 40) * 1024 * 1024 + 4096, onError: (c) => bad(c, `Filen er for stor (maks ${process.env.MAX_UPLOAD_MB ?? 40} MB)`, 413) });

// Sidemenyen: Import ligger nå under Innstillinger, AI-søk har egen side etter Transaksjoner.
// Matplan er den felles Homelab-komponenten (bare for administratorer, som resten av regnskapet).
const NAV_DEFAULT = ['ov', 'tx', 'ai', 'kv', 'bud', 'fast', 'konto', 'aks', 'rap', 'sub', 'dir', 'finn', 'inn']; // Import ligger under Innstillinger
const NAV_FIXED = ['ov', 'inn'];
// Lagret rekkefølge beholdes; sider som er fjernet (f.eks. Matplan, som nå er i Homelab) faller bort, og nye sider
// (AI-søk, Import) settes inn rett etter nærmeste side som står foran dem i standardrekkefølgen.
export const navMerge = (saved, def = NAV_DEFAULT) => {
  if (!Array.isArray(saved) || !saved.length) return [...def];
  const keep = [...new Set(saved.filter((p) => def.includes(p)))];
  def.forEach((p, i) => {
    if (keep.includes(p)) return;
    const before = def.slice(0, i).reverse().find((x) => keep.includes(x));
    keep.splice(before ? keep.indexOf(before) + 1 : 0, 0, p);
  });
  return keep;
};
const navOrder = (uid) => navMerge(kv.get(uid, 'fh_nav', null));
const navHidden = (uid) => (kv.get(uid, 'fh_nav_hidden', []) ?? []).filter((p) => NAV_DEFAULT.includes(p) && !NAV_FIXED.includes(p));
// Egne navn på menypunkter (maks 30 tegn). Tomt navn betyr standardnavnet.
const cleanLabels = (v) => Object.fromEntries(Object.entries(v && typeof v === 'object' && !Array.isArray(v) ? v : {})
  .filter(([k, n]) => NAV_DEFAULT.includes(k) && typeof n === 'string' && n.trim()).map(([k, n]) => [k, n.replace(/\s+/g, ' ').trim().slice(0, 30)]));
const navLabels = (uid) => cleanLabels(kv.get(uid, 'fh_nav_labels', {}));
const prefsOut = (uid) => ({ nav: navOrder(uid), hidden: navHidden(uid), labels: navLabels(uid), navDefault: NAV_DEFAULT, navFixed: NAV_FIXED });
const VERSION = (() => { try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return null; } })();
// Profilbilde og servernavn kommer fra homelab-brukerne (auth.js); valgfritt så eldre versjoner av den fila virker.
const serverName = () => auth.serverName?.() ?? kv.get(OWNER, 'server_name', null) ?? 'Homelab';
const avatarOf = (a) => a.info.avatarUrl ?? auth.avatarUrl?.(a.user) ?? null;
const meOut = (a) => ({ id: a.user, username: a.info.username, role: a.info.role, name: a.info.name, admin: a.admin, totp: !!a.info.totp, version: VERSION,
  isMainAdmin: !!a.info.isMainAdmin, avatarUrl: avatarOf(a), serverName: serverName() });

api.get('/me', (c) => c.json(meOut(c.get('access'))));
// Brukere man kan dele mapper med. Administratorer ser navn, brukernavn og rolle; andre bare id, navn og profilbilde (prompt 21).
api.get('/users', (c) => c.json(c.get('access').admin
  ? listUsers().map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, avatarUrl: u.avatarUrl ?? null }))
  : listUsers().map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null }))));
// Personlige valg i FinansHub: rekkefølgen i sidemenyen.
// Reserve for /api/me/layout (finNav): rekkefølge og skjulte punkter i sidemenyen.
api.get('/prefs', (c) => c.json(prefsOut(c.get('user'))));
api.put('/prefs', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const uid = c.get('user');
  if (b.nav === null) kv.del(uid, 'fh_nav');
  else if (Array.isArray(b.nav)) kv.set(uid, 'fh_nav', [...new Set(b.nav.filter((p) => NAV_DEFAULT.includes(p)))]);
  if (b.hidden === null) kv.del(uid, 'fh_nav_hidden');
  else if (Array.isArray(b.hidden)) kv.set(uid, 'fh_nav_hidden', [...new Set(b.hidden.filter((p) => NAV_DEFAULT.includes(p) && !NAV_FIXED.includes(p)))]);
  if (b.labels === null) kv.del(uid, 'fh_nav_labels');
  else if (b.labels !== undefined) kv.set(uid, 'fh_nav_labels', cleanLabels(b.labels));
  return c.json(prefsOut(uid));
});

// ISO2: alle roller får sitt eget fulle regnskap (ingen restricted:true). settings har i tillegg server:{…} (bare admin kan endre)
// og user:{…} (brukerens egne valg); canEditServer sier om brukeren kan endre serveroppsettet.
api.get('/bootstrap', R, (c) => {
  const st = settings();
  const a = c.get('access'), u = a.user;
  const cats = q('SELECT * FROM fh_categories WHERE user_id=? ORDER BY sort, id').all(u);
  const accs = q(`SELECT a.*, a.opening_balance + COALESCE((SELECT SUM(amount) FROM fh_transactions WHERE account_id=a.id AND user_id=a.user_id),0) AS balance FROM fh_accounts a WHERE a.user_id=? ORDER BY sort, id`).all(u);
  const month = curMonth();
  return c.json({
    settings: settingsOut(c), month, period: period(month), profiles: PROFILES, user: st.name, restricted: false, canEditServer: a.admin,
    categories: cats.map(categoryOut39), // prompt 39: + source ('user'|'ai'), confirmed, icon
    accounts: accs.map((a) => ({ id: a.id, name: a.name, bank: a.bank, type: a.type, last4: a.last4, note: a.note, openingBalance: a.opening_balance / 100, balance: a.balance / 100 })),
    rules: q('SELECT r.*, c.name AS category FROM fh_rules r LEFT JOIN fh_categories c ON c.id=r.category_id WHERE r.user_id=? ORDER BY priority, id').all(u).map((r) => ({ id: r.id, pattern: r.pattern, categoryId: r.category_id, category: r.category, priority: r.priority })),
    goals: q('SELECT * FROM fh_goals WHERE user_id=? ORDER BY id').all(u).map(({ user_id, ...g }) => ({ ...g, saved: g.saved / 100, target: g.target / 100 })),
    reviewCount: q(`SELECT COUNT(*) n FROM fh_receipts WHERE status IN ('pending','processing','needs_review') AND ${RC_VISIBLE}`).get(u).n,
    hasData: !!q('SELECT 1 FROM fh_transactions WHERE user_id=? LIMIT 1').get(u), firstRun: backup.needsFirstRun(u), me: meOut(a), nav: navOrder(u), navHidden: navHidden(u), navLabels: navLabels(u), navDefault: NAV_DEFAULT, navFixed: NAV_FIXED,
  });
});

/* --- Oversikt --- */

api.get('/summary', need('read:summary', 'read:budget'), (c) => {
  const month = /^\d{4}-\d{2}$/.test(c.req.query('month') ?? '') ? c.req.query('month') : curMonth();
  const { from, to } = period(month);
  const cats = catById(), accs = accById();
  const kindOf = (id) => cats.get(id)?.kind ?? 'expense';
  const u = c.get('user');
  const sums = (f, t) => {
    const rows = q('SELECT amount, category_id FROM fh_transactions WHERE user_id=? AND date>=? AND date<?').all(u, f, t);
    let inn = 0, ut = 0; const byCat = {};
    for (const r of rows) {
      const k = kindOf(r.category_id);
      if (k === 'transfer') continue;
      if (r.amount > 0) inn += r.amount; else { ut -= r.amount; byCat[r.category_id ?? 0] = (byCat[r.category_id ?? 0] ?? 0) - r.amount; }
    }
    return { inn, ut, byCat };
  };
  const cur = sums(from, to);
  const prevP = period(shiftMonth(month, -1)), prev = sums(prevP.from, prevP.to);
  const series = [];
  for (let i = 11; i >= 0; i--) {
    const m = shiftMonth(month, -i), p = period(m), s = sums(p.from, p.to);
    series.push({ month: m, inn: s.inn / 100, ut: s.ut / 100 });
  }
  const bud = budgetsFor(month);
  const budTotal = Object.values(bud).reduce((a, b) => a + b, 0);
  const budUsed = Object.keys(bud).reduce((a, k) => a + (cur.byCat[k] ?? 0), 0);
  const end = new Date(to + 'T00:00'), now = new Date(today() + 'T00:00');
  const daysLeft = Math.max(1, Math.round((end - Math.max(now, new Date(from + 'T00:00'))) / 86400000));
  // Saldo-historikk: total saldo ved slutten av hver av de siste 12 månedene.
  const opening = q('SELECT COALESCE(SUM(opening_balance),0) s FROM fh_accounts WHERE user_id=?').get(u).s;
  const balanceAt = (d) => opening + q('SELECT COALESCE(SUM(amount),0) s FROM fh_transactions WHERE user_id=? AND date<?').get(u, d).s;
  const saldo = series.map((s) => balanceAt(period(s.month).to) / 100);
  const lastIncome = q("SELECT t.date, t.description FROM fh_transactions t JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND c.kind='income' AND t.date>=? AND t.date<? ORDER BY t.date DESC LIMIT 1").get(u, from, to);
  const yStart = `${month.slice(0, 4)}-01-01`;
  const ySum = sums(yStart, to);
  const recurring = q('SELECT * FROM fh_recurring WHERE active=1 AND user_id=?').all(u).map((r) => recurringOut(r, cats)).sort((a, b) => a.next.localeCompare(b.next));
  const recent = q(`${TX_SELECT} WHERE t.user_id=? ORDER BY t.date DESC, t.id DESC LIMIT 8`).all(u).map((t) => txOut(t, cats, accs));
  const review = q(`SELECT * FROM fh_receipts WHERE status IN ('pending','processing','needs_review') AND ${RC_VISIBLE} ORDER BY created DESC`).all(c.get('user')).map((r) => receiptOut(r, cats, accs));
  return c.json({
    month, from, to, daysLeft,
    inn: cur.inn / 100, ut: cur.ut / 100, prevInn: prev.inn / 100, prevUt: prev.ut / 100,
    budgetTotal: budTotal / 100, budgetUsed: budUsed / 100, left: (budTotal - budUsed) / 100,
    savedYear: (ySum.inn - ySum.ut) / 100, yearGoal: +settings().yearGoal || 0,
    balance: saldo[saldo.length - 1], balanceSeries: saldo, series, lastIncome,
    byCategory: Object.entries(cur.byCat).map(([id, v]) => ({ categoryId: +id || null, category: cats.get(+id)?.name ?? 'Ukategorisert', color: cats.get(+id)?.color ?? '#A0A0AA', amount: v / 100, budget: (bud[id] ?? 0) / 100 })).sort((a, b) => b.amount - a.amount),
    budgets: Object.entries(bud).map(([id, v]) => {
      const st = q("SELECT COUNT(*) n FROM fh_transactions WHERE user_id=? AND category_id=? AND amount<0 AND date>=? AND date<?").get(u, +id, from, to);
      const top = q("SELECT COALESCE(merchant, description) m, SUM(-amount) s FROM fh_transactions WHERE user_id=? AND category_id=? AND amount<0 AND date>=? AND date<? GROUP BY m ORDER BY s DESC LIMIT 1").get(u, +id, from, to);
      return { categoryId: +id, category: cats.get(+id)?.name, color: cats.get(+id)?.color, budget: v / 100, used: (cur.byCat[id] ?? 0) / 100,
        count: st.n, topMerchant: top?.m ?? null, prevUsed: (prev.byCat[id] ?? 0) / 100 };
    }).filter((b) => b.category),
    innMonthly: series.slice(-7).map((s) => s.inn),
    recent, review, upcoming: recurring.slice(0, 6),
    dailyOut: (() => { // utgifter per dag i perioden (til søylene i KPI-kortet)
      const rows = q('SELECT date, SUM(-amount) s FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND amount<0 AND COALESCE(c.kind,\'expense\')<>\'transfer\' AND date>=? AND date<? GROUP BY date').all(u, from, to);
      return rows.map((r) => ({ date: r.date, amount: r.s / 100 }));
    })(),
  });
});

/* --- Transaksjoner --- */

function txQuery(c) {
  const w = ['t.user_id=?'], p = [c.get('user')];
  const qs = c.req.query();
  if (qs.q) { w.push('(t.description LIKE ? OR t.merchant LIKE ? OR t.note LIKE ?)'); const s = `%${qs.q}%`; p.push(s, s, s); }
  if (qs.account) { w.push('t.account_id=?'); p.push(+qs.account); }
  if (qs.category) { w.push(qs.category === 'none' ? 't.category_id IS NULL' : 't.category_id=?'); if (qs.category !== 'none') p.push(+qs.category); }
  if (qs.type === 'inn') w.push('t.amount>0'); else if (qs.type === 'ut') w.push('t.amount<0');
  if (isDate(qs.from)) { w.push('t.date>=?'); p.push(qs.from); }
  if (isDate(qs.to)) { w.push('t.date<?'); p.push(qs.to); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

api.get('/transactions', need('read:transactions'), (c) => {
  const { where, params } = txQuery(c);
  const limit = Math.min(2000, +c.req.query('limit') || 500);
  const rows = q(`${TX_SELECT} ${where} ORDER BY t.date DESC, t.id DESC LIMIT ${limit}`).all(...params);
  const total = q(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM fh_transactions t ${where}`).get(...params);
  const cats = catById(), accs = accById();
  return c.json({ items: rows.map((t) => txOut(t, cats, accs)), count: total.n, net: total.s / 100 });
});

// Beløp: med type ('expense' | 'income') er beløpet positivt og fortegnet kommer fra typen; uten type brukes fortegnet som det er.
function signedAmount(b, fallback = null) {
  const v = b.amount !== undefined ? ore(b.amount) : null;
  if (v === null) return b.type && fallback !== null ? (b.type === 'income' ? Math.abs(fallback) : -Math.abs(fallback)) : fallback;
  return b.type === 'income' ? Math.abs(v) : b.type === 'expense' ? -Math.abs(v) : v;
}
const validId = (table, id, u = me()) => (id ? q(`SELECT id FROM ${table} WHERE id=? AND user_id=?`).get(id, u)?.id ?? undefined : null);
// Bolig brukeren kan legge poster i (medlem, ikke bare lesetilgang).
const canEditFolder = (folderId, u = me()) => !!q("SELECT 1 FROM fh_folder_members WHERE folder_id=? AND user_id=? AND role<>'viewer'").get(folderId, u);
// Delt mappe for en transaksjon: én post per transaksjon. null fjerner den fra mappen.
function setTxFolder(c, txId, folderId) {
  q('DELETE FROM fh_folder_entries WHERE tx_id=?').run(txId);
  if (!folderId) return;
  const t = q('SELECT * FROM fh_transactions WHERE id=? AND user_id=?').get(txId, c.get('user'));
  if (!t) return;
  const me = c.get('access').info;
  const payer = q('SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?').get(folderId, c.get('user'))?.name ?? me?.name ?? 'Meg';
  const e = q('INSERT INTO fh_folder_entries(folder_id,tx_id,description,date,amount,paid_by,category,created) VALUES(?,?,?,?,?,?,?,?) RETURNING id')
    .get(folderId, txId, t.merchant || t.description, t.date, Math.abs(t.amount), payer, null, Date.now());
  assignCategory(e.id, `${t.merchant ?? ''} ${t.description} ${t.note ?? ''}`, null);
}
// Kvittering: kobles til (bokført) eller løses fra (tilbake til gjennomgang).
function setTxReceipt(txId, receiptId, u = me()) {
  q("UPDATE fh_receipts SET transaction_id=NULL, status=CASE WHEN status='booked' THEN 'needs_review' ELSE status END WHERE transaction_id=? AND id IS NOT ? AND user_id=?").run(txId, receiptId ?? null, u);
  if (receiptId) q("UPDATE fh_receipts SET transaction_id=?, status='booked' WHERE id=? AND user_id=?").run(txId, receiptId, u);
}
const txValidate = (b) => {
  if (b.folderId !== undefined && b.folderId !== null && b.folderId !== '' && !canEditFolder(+b.folderId)) return 'Fant ikke boligen';
  if (b.categoryId && validId('fh_categories', +b.categoryId) === undefined) return 'Ukjent kategori';
  if (b.accountId && validId('fh_accounts', +b.accountId) === undefined) return 'Ukjent konto';
  if (b.receiptId && !q('SELECT 1 FROM fh_receipts WHERE id=? AND user_id=?').get(String(b.receiptId), me())) return 'Fant ikke kvitteringen';
  if (b.type !== undefined && !['expense', 'income'].includes(b.type)) return 'Type må være utgift eller inntekt';
  return null;
};
const txById = (id, u = me()) => txOut(q(`${TX_SELECT} WHERE t.id=? AND t.user_id=?`).get(id, u));

api.post('/transactions', need('write:transactions'), async (c) => {
  const b = await c.req.json();
  const amount = signedAmount(b);
  if (!isDate(b.date) || amount === null || !str(b.description)) return bad(c, 'Dato, beløp og beskrivelse må fylles ut');
  const err = txValidate(b); if (err) return bad(c, err);
  const desc = str(b.description);
  const catId = b.categoryId ? +b.categoryId : (settings().autoCat ? ruleFor(desc) : null);
  const t = q("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,note,source,created,user_id) VALUES(?,?,?,?,?,?,?,'manual',?,?) RETURNING *")
    .get(b.accountId ? +b.accountId : null, b.date, amount, desc, desc, catId, str(b.note, 500), Date.now(), c.get('user'));
  db.transaction(() => { if (b.folderId) setTxFolder(c, t.id, +b.folderId); if (b.receiptId) setTxReceipt(t.id, String(b.receiptId)); })();
  kickAi();
  return c.json(txById(t.id));
});

api.patch('/transactions/:id', need('write:transactions'), async (c) => {
  const b = await c.req.json();
  const cur = own('fh_transactions', +c.req.param('id'));
  if (!cur) return c.notFound();
  const err = txValidate(b); if (err) return bad(c, err);
  const amount = signedAmount(b, cur.amount);
  const n = {
    date: isDate(b.date) ? b.date : cur.date, amount: amount ?? cur.amount,
    description: b.description !== undefined ? str(b.description) || cur.description : cur.description,
    category_id: b.categoryId !== undefined ? (b.categoryId ? +b.categoryId : null) : cur.category_id,
    account_id: b.accountId !== undefined ? (b.accountId ? +b.accountId : null) : cur.account_id,
    note: b.note !== undefined ? str(b.note, 500) : cur.note,
  };
  // En ny beskrivelse er et nytt butikknavn; AI-teksten lages på nytt.
  const renamed = n.description !== cur.description;
  db.transaction(() => {
    q(`UPDATE fh_transactions SET date=?, amount=?, description=?, category_id=?, account_id=?, note=?${renamed ? ', merchant=?, ai_short=NULL, ai_long=NULL, ai_done=0' : ''} WHERE id=?`)
      .run(n.date, n.amount, n.description, n.category_id, n.account_id, n.note, ...(renamed ? [n.description] : []), cur.id);
    if (b.folderId !== undefined) setTxFolder(c, cur.id, b.folderId ? +b.folderId : null);
    else if (n.amount !== cur.amount || n.date !== cur.date || renamed) q('UPDATE fh_folder_entries SET amount=?, date=?, description=? WHERE tx_id=?').run(Math.abs(n.amount), n.date, n.description, cur.id);
    if (b.receiptId !== undefined) setTxReceipt(cur.id, b.receiptId ? String(b.receiptId) : null);
  })();
  if (renamed) kickAi();
  return c.json(txById(cur.id));
});

api.delete('/transactions/:id', need('write:transactions'), (c) => {
  const id = +c.req.param('id');
  if (!own('fh_transactions', id)) return c.notFound();
  db.transaction(() => {
    q("UPDATE fh_receipts SET transaction_id=NULL, status=CASE WHEN status='booked' THEN 'needs_review' ELSE status END WHERE transaction_id=?").run(id);
    q('DELETE FROM fh_folder_entries WHERE tx_id=?').run(id);
    q('DELETE FROM fh_transactions WHERE id=?').run(id);
  })();
  return ok(c);
});

// Originalene bak en transaksjon: kvitteringsbildet/PDF-en og bankraden slik den kom fra banken.
api.get('/transactions/:id/original', need('read:transactions'), (c) => {
  const t = own('fh_transactions', +c.req.param('id'));
  if (!t) return c.notFound();
  const r = q('SELECT id, mime, file, thumb, merchant, date, total, extraction, line_boxes, status FROM fh_receipts WHERE transaction_id=? AND user_id=? ORDER BY created DESC LIMIT 1').get(t.id, t.user_id);
  let ex = null; try { ex = r?.extraction ? JSON.parse(r.extraction) : null; } catch { ex = null; }
  let bank = null;
  try { bank = t.raw_bank_row ? JSON.parse(t.raw_bank_row) : null; } catch { bank = null; }
  const bankRow = bank ? { bookingDate: bank.bookingDate ?? null, valueDate: bank.valueDate ?? null, description: bank.description ?? null, amount: bank.amount ?? t.amount / 100,
    account: bank.account ?? null, bank: bank.bank ?? null, archiveReference: bank.archiveReference ?? null, source: bank.source ?? t.source, file: bank.file ?? null,
    importedAt: bank.importedAt ?? null, raw: bank.raw ?? {} } : null;
  return c.json({
    receipt: r ? { id: r.id, mime: r.mime, status: r.status, fileUrl: r.file ? `/finans/api/receipts/${r.id}/file` : null, thumbUrl: r.thumb ? `/finans/api/receipts/${r.id}/thumb` : null,
      merchant: r.merchant, date: r.date, total: r.total != null ? r.total / 100 : null,
      lines: receiptLines(r).map((l) => ({ description: l.text, amount: l.price, ...(l.bbox ? { bbox: l.bbox } : {}) })), hasBoxes: receiptLines(r).some((l) => l.bbox), vat: ex?.vat ?? [] } : null,
    bankRow,
  });
});

// Detaljvisning (Papir mobil, prompt 15): transaksjonen med kvitteringen (varelinjer, total, ✦-sammendrag) og bankraden.
const RECEIPT_STATE = (st) => (st === 'booked' ? 'attached' : 'needs_review');
api.get('/transactions/:id', need('read:transactions'), (c) => {
  const id = +c.req.param('id');
  if (!Number.isInteger(id)) return c.notFound();
  const t = q(`${TX_SELECT} WHERE t.id=? AND t.user_id=?`).get(id, c.get('user'));
  if (!t) return c.notFound();
  const out = txOut(t);
  const r = q('SELECT id, mime, file, total, extraction, line_boxes, status, ai_short FROM fh_receipts WHERE transaction_id=? AND user_id=? ORDER BY created DESC LIMIT 1').get(id, t.user_id);
  // Prompt 30: ?hl=tomat → hvilke linjer som skal markeres (og om bildet har posisjoner).
  const rl = r ? receiptLines(r) : [], hl = str(c.req.query('hl'), 100);
  let ex = null; try { ex = r?.extraction ? JSON.parse(r.extraction) : null; } catch { ex = null; }
  let bank = null; try { bank = t.raw_bank_row ? JSON.parse(t.raw_bank_row) : null; } catch { bank = null; }
  return c.json({
    ...out,
    aiSummary: out.aiLong ?? out.aiShort ?? null,
    receipt: r ? { id: r.id, status: RECEIPT_STATE(r.status), mime: r.mime, fileUrl: r.file ? `/finans/api/receipts/${r.id}/file` : null,
      lines: rl.map((l) => ({ name: l.text, price: l.price, ...(l.bbox ? { bbox: l.bbox } : {}) })), hasBoxes: rl.some((l) => l.bbox), total: r.total != null ? r.total / 100 : null,
      ...(hl ? { highlight: { query: hl, ...matchLines(rl, hl), hasBoxes: rl.some((l) => l.bbox) } } : {}),
      aiSummary: r.ai_short ?? out.aiShort ?? null } : null,
    bank: bank ? { bookingDate: bank.bookingDate ?? null, valueDate: bank.valueDate ?? null, description: bank.description ?? t.description,
      message: bank.message ?? bank.raw?.['Melding/KID/Fakt.nr'] ?? null, amount: bank.amount ?? t.amount / 100, account: bank.account ?? null,
      archiveReference: bank.archiveReference ?? null, raw: bank.raw ?? {} } : null,
  });
});

const csvCell = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const nok = (o) => (o / 100).toFixed(2).replace('.', ',');
api.get('/transactions.csv', need('read:transactions'), (c) => {
  const { where, params } = txQuery(c);
  const cats = catById(), accs = accById();
  const rows = q(`${TX_SELECT} ${where} ORDER BY t.date`).all(...params);
  const out = ['Dato;Beskrivelse;Konto;Kategori;Beløp;Notat;Kvittering',
    ...rows.map((t) => [t.date, t.description, accs.get(t.account_id)?.name ?? '', cats.get(t.category_id)?.name ?? '', nok(t.amount), t.note, t.receipt_status === 'booked' ? 'Vedlagt' : ''].map(csvCell).join(';'))];
  return c.body('﻿' + out.join('\r\n'), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="finanshub-transaksjoner.csv"' });
});

/* --- Import --- */

api.post('/import/csv', W, upload, async (c) => {
  const b = await c.req.parseBody();
  if (!(b.file instanceof File)) return bad(c, 'Mangler fil');
  const accountId = +b.accountId || null;
  if (!accountId || !own('fh_accounts', accountId)) return bad(c, 'Velg kontoen filen hører til');
  const profile = PROFILES.includes(b.profile) ? b.profile : settings().csvProfile;
  let parsed;
  const text = await b.file.text();
  // Ukjente kolonner: importmalene (innebygde, lagrede eller ✦ AI) tar over.
  try { parsed = parseCsv(text, accountId, profile); } catch (e) {
    const r = await importRows(splitRows(text), accountId);
    if (!r.rows.length) return bad(c, e.message);
    parsed = { rows: r.rows.map((x) => ({ ...x, merchant: x.description })), skipped: r.skipped };
  }
  const auto = settings().autoCat;
  const ins = q("INSERT OR IGNORE INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,external_id,raw_bank_row,created,user_id) VALUES(?,?,?,?,?,?,'csv',?,?,?,?)");
  const bankMeta = { account: accName(accountId), source: `CSV · ${profile}`, file: str(b.file.name, 120) || null, importedAt: Date.now() };
  let added = 0;
  db.transaction(() => { for (const r of parsed.rows) added += ins.run(accountId, r.date, r.amount, r.description, r.merchant, auto ? ruleFor(r.description) : null, r.external_id, bankJson(r.bank, bankMeta), Date.now(), c.get('user')).changes; })();
  saveSettings({ csvProfile: profile });
  kickAi();
  return c.json({ added, duplicates: parsed.rows.length - added, skipped: parsed.skipped.length });
});

/* --- Kvitteringer --- */

const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => x instanceof File);
// Én eller flere filer. Hver fil blir en jobb i køen; svaret kommer straks (felt fra første kvittering + jobs).
// scan/thumb (nedskalert av klienten) pares med filene i samme rekkefølge når antallet stemmer.
// E-post som kvittering (Subscription OS «Fra kvittering»): vedlegget leses hvis det er et bilde eller en PDF, ellers e-postteksten.
const isMail = (f) => /^(message\/rfc822|text\/plain)$/.test(f.type) || /\.(eml|txt)$/i.test(f.name ?? '');
async function mailReceipt(f, target) {
  const buf = Buffer.from(await f.arrayBuffer());
  if (!/\.eml$/i.test(f.name ?? '') && f.type !== 'message/rfc822') return ingestReceipt({ buffer: buf, mime: 'text/plain', name: f.name, target, source: 'upload' });
  const { simpleParser } = await import('mailparser');
  const m = await simpleParser(buf);
  const att = (m.attachments ?? []).find((a) => MIME[a.contentType]);
  if (att) return ingestReceipt({ buffer: att.content, mime: att.contentType, name: att.filename || m.subject, meta: { subject: m.subject, from: m.from?.text }, target, source: 'upload' });
  const text = [`Fra: ${m.from?.text ?? ''}`, `Emne: ${m.subject ?? ''}`, `Dato: ${m.date?.toISOString?.() ?? ''}`, '', m.text || String(m.html || '').replace(/<[^>]+>/g, ' ')].join('\n');
  return ingestReceipt({ buffer: Buffer.from(text.slice(0, 60000)), mime: 'text/plain', name: m.subject || f.name, meta: { subject: m.subject, from: m.from?.text }, target, source: 'upload' });
}
// Filtypen leses fra innholdet: apper og nettlesere sender ofte tom eller feil type (HEIC fra Filer, octet-stream, image/jpg).
async function typed(f) {
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(buf, f.type, f.name);
  return mime ? new File([buf], f.name || `kvittering.${MIME[mime]}`, { type: mime }) : f;
}
async function receiptUpload(c, target = null) {
  const b = await c.req.parseBody({ all: true });
  const raw = asList(b.file).concat(asList(b['file[]']), asList(b.files), asList(b['files[]']));
  const files = await Promise.all(raw.map(typed));
  for (const f of raw) console.info(`[skann] mottatt ${f.name || '(uten navn)'} · oppgitt ${f.type || 'ingen type'} · ${Math.round(f.size / 1024)} kB`);
  if (target === 'sub' && files.length && files.every((f) => MIME[f.type] || isMail(f))) {
    const ids = [];
    for (const f of files) ids.push(MIME[f.type] ? await saveReceipt(f, null, null, null, target, c.get('user')) : await mailReceipt(f, target));
    runQueue();
    return c.json({ ...receiptOut(origSelect.get(ids[0])), jobs: ids.map((id) => jobOut(origSelect.get(id))) });
  }
  if (!files.length) return bad(c, 'Fant ingen fil i opplastingen (feltet heter «file»)');
  const wrong = files.find((f) => !MIME[f.type]);
  if (wrong) return bad(c, `${wrong.name || 'Filen'} er ikke et bilde eller en PDF (${wrong.type || 'ukjent type'}). Last opp JPEG, PNG, WebP, HEIC eller PDF.`);
  if (files.length > 30) return bad(c, 'Maks 30 filer om gangen');
  const scans = await Promise.all(asList(b.scan).map(typed)), thumbs = await Promise.all(asList(b.thumb).map(typed));
  const pair = scans.length === files.length;
  const acc = (+b.accountId && own('fh_accounts', +b.accountId) ? +b.accountId : null) || q('SELECT id FROM fh_accounts WHERE user_id=? ORDER BY sort, id LIMIT 1').get(me())?.id || null;
  const ids = [];
  for (const [i, f] of files.entries()) ids.push(await saveReceipt(f, pair ? scans[i] : files.length === 1 ? scans[0] : null, thumbs.length === files.length ? thumbs[i] : files.length === 1 ? thumbs[0] : null, acc, target, c.get('user')));
  runQueue();
  const first = receiptOut(origSelect.get(ids[0]));
  return c.json({ ...first, jobs: ids.map((id) => jobOut(origSelect.get(id))) });
}
async function saveReceipt(f, scanFile, thumbFile, acc, target, uploadedBy = null) {
  const owner = uploadedBy || me();
  const id = randomUUID();
  const d = new Date(), sub = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  await mkdir(join(DIR, sub), { recursive: true });
  const file = `${sub}/${id}.${MIME[f.type]}`;
  await writeFile(join(DIR, file), Buffer.from(await f.arrayBuffer()));
  // Nettleseren sender en nedskalert JPEG (~1600 px) til AI-en og et lite miniatyrbilde. Originalen lagres urørt.
  let scan = null, thumb = null;
  if (scanFile?.type === 'image/jpeg') { scan = `${sub}/${id}_scan.jpg`; await writeFile(join(DIR, scan), Buffer.from(await scanFile.arrayBuffer())); }
  if (thumbFile?.type === 'image/jpeg') { thumb = `${sub}/${id}_t.jpg`; await writeFile(join(DIR, thumb), Buffer.from(await thumbFile.arrayBuffer())); }
  q("INSERT INTO fh_receipts(id,file,scan,thumb,mime,status,date,account_id,name,target,uploaded_by,created,user_id) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?,?)")
    .run(id, file, scan, thumb, f.type, today(), acc, str(f.name, 120) || null, target, uploadedBy, Date.now(), owner);
  queue.push({ id });
  scanLog(id, 'mottatt', `${f.name || 'kvittering'} · ${f.type} · ${Math.round(f.size / 1024)} kB${scan ? ' + JPEG-kopi' : ''}${thumb ? ' + miniatyr' : ''}`);
  const tm = String(target ?? '').match(/^tx:(\d+)$/);
  if (tm) q('UPDATE fh_receipts SET transaction_id=? WHERE id=?').run(+tm[1], id);
  // Mappe: posten vises med en gang («Gemini leser …») og fylles ut når AI-en er ferdig.
  const fm = String(target ?? '').match(/^folder:(\d+)(?::(.+))?$/);
  if (fm) {
    const payer = q('SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?').get(+fm[1], fm[2] ?? owner)?.name ?? settings(owner).name;
    q("INSERT INTO fh_folder_entries(folder_id,receipt_id,description,date,amount,paid_by,category,status,created) VALUES(?,?,?,?,0,?,?,'review',?)").run(+fm[1], id, str(f.name, 120) || 'Kvittering', today(), payer, null, Date.now());
  }
  return id;
}
// Kvittering fra e-post: vedlegg (eller e-postteksten som .txt) blir en jobb i samme kø som opplastinger.
export async function ingestReceipt({ buffer, mime, name, meta, target = null, source = 'email' }) {
  const ext = mime === 'text/plain' ? 'txt' : MIME[mime];
  if (!ext) throw new Error(`Filtypen ${mime} støttes ikke`);
  const id = randomUUID();
  const d = new Date(), sub = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  await mkdir(join(DIR, sub), { recursive: true });
  const file = `${sub}/${id}.${ext}`;
  await writeFile(join(DIR, file), buffer);
  // ISO2: kvitteringen tilhører brukeren i konteksten (forespørselen, eller e-postjobben som kjører for brukeren).
  const owner = me();
  const acc = q('SELECT id FROM fh_accounts WHERE user_id=? ORDER BY sort, id LIMIT 1').get(owner)?.id || null;
  q("INSERT INTO fh_receipts(id,file,mime,status,date,account_id,name,source,meta,target,created,user_id) VALUES(?,?,?,'pending',?,?,?,?,?,?,?,?)")
    .run(id, file, mime, today(), acc, str(name, 120) || 'E-post', source, JSON.stringify(meta ?? {}), target, Date.now(), owner);
  queue.push({ id });
  runQueue();
  return id;
}

api.post('/receipts', need('receipts:write'), upload, (c) => receiptUpload(c));
// Prompt 47: POST /receipts/ocr-text og /receipts/parsed (receipts47.js) – samme kø, samme datamodell og samme Til godkjenning.
mountReceipts47(api, { W: need('receipts:write'), enqueue: (id) => { queue.push({ id }); runQueue(); }, out: (id) => { const r = origSelect.get(id); return { ...receiptOut(r), jobs: [jobOut(r)] }; } });
// Prompt 48: POST /receipts/scan, GET /receipts/health, /receipts/schemas/:kind og rettelser (server/receipts48/) – samme kø og datamodell.
mountReceipts48(api, { W: need('receipts:write', 'finance:write'), R: need('finance:read', 'receipts:write'), adminOnly, sessionOnly, enqueue: (id) => { queue.push({ id }); runQueue(); }, out: (id) => { const r = origSelect.get(id); return { ...receiptOut(r), jobs: [jobOut(r)] }; } });
// Legg ved kvittering på en eksisterende transaksjon. AI-en leser den, og den bekreftes i gjennomgangskøen som vanlig.
api.post('/transactions/:id/receipt', need('receipts:write'), upload, (c) => {
  const id = +c.req.param('id');
  if (!own('fh_transactions', id)) return c.notFound();
  return receiptUpload(c, `tx:${id}`);
});

// Opplastingskøen: alt fra siste døgn med fremdrift. AI-en bruker typisk 5–15 s; fremdriften er et estimat.
function jobOut(r) {
  const progress = r.status === 'pending' ? 0 : r.status === 'processing' ? Math.min(92, Math.round(((Date.now() - (r.started ?? Date.now())) / 12000) * 90) + 5) : 100;
  return { id: r.id, name: r.name ?? r.merchant ?? 'Kvittering', status: r.status === 'failed' ? 'error' : r.status, progress, merchant: r.merchant, total: r.total != null ? r.total / 100 : null,
    error: r.error ?? null, thumb: r.thumb ? `/finans/api/receipts/${r.id}/thumb` : null, aiShort: r.ai_short ?? null, created: r.created, ...reanalyzeInfo(r),
    // Prompt 23: motoren som ikke svarte innen tidsgrensen, når jobben prøves igjen, og statusteksten i køen.
    timeoutEngine: r.timeout_engine ?? null, retryAt: r.retry_at ?? null,
    statusText: r.status === 'pending' || r.status === 'processing' ? (r.ai_short ?? `${providerName(settings().provider)} leser kvitteringen …`) : null };
}
// ISO2: hver bruker ser bare sine egne opplastinger (alle roller).
api.get('/receipts/jobs', R, (c) => {
  const rows = q(`SELECT * FROM fh_receipts WHERE created>? AND status<>'rejected' AND ${RC_VISIBLE} ORDER BY created DESC LIMIT 100`).all(Date.now() - 86400_000, c.get('user'));
  return c.json(rows.map(jobOut));
});
const origSelect = q('SELECT * FROM fh_receipts WHERE id=?');

// Prompt 34: kvitteringer som analyseres av AI nå (og de som venter i køen). Mobilens «✦ ANALYSERES AV AI · N».
// GET /receipts/analyzing (= /receipts?status=analyzing) → {count, items:[{id, receiptId, file, thumb, status:'queued'|'analyzing', model, progress,
//   step:'upload'|'read'|'fields'|'lines'|'category', stepLabel, steps:[{k, label, done}], partial:{store, sum, lines, category, confidence},
//   title, statusText, startedAt, jobId, chatId, cancellable}]}
// POST /receipts/:id/cancel-ai → {ok} (Avbryt: kvitteringen går til Til godkjenning for manuell utfylling)
const analyzing = (u) => { const items = q(`SELECT * FROM fh_receipts WHERE status IN ('pending','processing') AND ${RC_VISIBLE} ORDER BY created DESC LIMIT 50`).all(u).map(analyzingOut); return { count: items.length, items }; };
api.get('/receipts/analyzing', R, (c) => c.json(analyzing(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
api.post('/receipts/:id/cancel-ai', W, (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  if (!['pending', 'processing'].includes(r.status)) return bad(c, 'Kvitteringen analyseres ikke', 409);
  const live = rcLive.get(r.id);
  if (live) { live.ctrl.abort(); if (live.jobId) aiJobUpdate(live.jobId, { status: 'cancelled', error: 'Avbrutt av brukeren' }); }
  const i = queue.findIndex((x) => x.id === r.id); if (i >= 0) queue.splice(i, 1);
  q("UPDATE fh_receipts SET status='needs_review', error='Avbrutt av brukeren. Fyll ut manuelt.', confidence=0 WHERE id=?").run(r.id);
  return ok(c);
});
api.get('/receipts', R, (c) => {
  const status = c.req.query('status');
  if (status === 'analyzing' || (status === 'processing' && c.req.query('detail') === '1')) return c.json(analyzing(c.get('user')));
  // Banneret «N kvitteringer til gjennomgang»: bare tallet.
  if (c.req.query('count') === '1') {
    const st = status === 'queue' ? null : status || 'needs_review';
    const n = st ? q(`SELECT COUNT(*) FROM fh_receipts WHERE status=? AND ${RC_VISIBLE}`).pluck().get(st, c.get('user'))
      : q(`SELECT COUNT(*) FROM fh_receipts WHERE status IN ('pending','processing','needs_review') AND ${RC_VISIBLE}`).pluck().get(c.get('user'));
    return c.json({ count: n });
  }
  const where = status === 'queue' ? "WHERE status IN ('pending','processing','needs_review') AND" : status ? 'WHERE status=? AND' : 'WHERE';
  const rows = q(`SELECT * FROM fh_receipts ${where} ${RC_VISIBLE} ORDER BY created DESC LIMIT 300`).all(...(status && status !== 'queue' ? [status] : []), c.get('user'));
  const cats = catById(), accs = accById();
  return c.json(rows.map((r) => receiptOut(r, cats, accs)));
});

api.get('/receipts/:id', R, (c) => {
  const r = rcView(c);
  return r ? c.json(receiptOut(r, catById(r.user_id), accById(r.user_id))) : c.notFound();
});

async function sendFile(c, rel, mime) {
  if (!rel || rel.includes('..')) return c.notFound();
  try { return c.body(await readFile(join(DIR, rel)), 200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }); }
  catch { return c.notFound(); }
}
api.get('/receipts/:id/file', R, (c) => { const r = rcView(c); return r ? sendFile(c, r.file, r.mime) : c.notFound(); });
api.get('/receipts/:id/thumb', R, (c) => { const r = rcView(c); return r ? sendFile(c, r.thumb, 'image/jpeg') : c.notFound(); });

api.patch('/receipts/:id', W, async (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  const b = await c.req.json();
  if (b.categoryId && validId('fh_categories', +b.categoryId) === undefined) return bad(c, 'Ukjent kategori');
  if (b.accountId && validId('fh_accounts', +b.accountId) === undefined) return bad(c, 'Ukjent konto');
  q('UPDATE fh_receipts SET merchant=?, date=?, total=?, category_id=?, account_id=? WHERE id=?').run(
    b.merchant !== undefined ? str(b.merchant, 120) : r.merchant, isDate(b.date) ? b.date : r.date,
    b.total !== undefined ? ore(b.total) : r.total, b.categoryId !== undefined ? (+b.categoryId || null) : r.category_id,
    b.accountId !== undefined ? (+b.accountId || null) : r.account_id, r.id);
  // Ny dato eller nytt beløp kan gi en annen bankmatch.
  const u = origSelect.get(r.id);
  if (b.total !== undefined || b.date !== undefined) {
    const m = findMatch(u.total, u.date, JSON.parse(u.extraction ?? '{}').card_last4);
    q('UPDATE fh_receipts SET transaction_id=? WHERE id=?').run(m?.id ?? null, r.id);
  }
  return c.json(receiptOut(origSelect.get(r.id)));
});

api.post('/receipts/:id/book', W, async (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  if (r.status === 'booked') return bad(c, 'Kvitteringen er allerede bokført');
  if (!r.merchant || r.total == null || !isDate(r.date)) return bad(c, 'Butikk, dato og total må fylles ut før bokføring');
  const st = settings();
  let txId = r.transaction_id;
  const u = c.get('user');
  db.transaction(() => {
    if (txId && own('fh_transactions', txId, u)) {
      q('UPDATE fh_transactions SET category_id=COALESCE(?, category_id), merchant=?, ai_short=COALESCE(?, ai_short), ai_long=COALESCE(?, ai_long), domain=COALESCE(?, domain), ai_done=1 WHERE id=?')
        .run(r.category_id, r.merchant, r.ai_short, r.ai_long, r.domain, txId);
    } else {
      txId = q("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,ai_short,ai_long,domain,ai_done,created,user_id) VALUES(?,?,?,?,?,?,'receipt',?,?,?,1,?,?) RETURNING id")
        .get(validId('fh_accounts', r.account_id, u) ?? null, r.date, -r.total, r.merchant, r.merchant, validId('fh_categories', r.category_id, u) ?? null, r.ai_short, r.ai_long, r.domain, Date.now(), u).id;
    }
    q('UPDATE fh_folder_entries SET tx_id=? WHERE receipt_id=? AND tx_id IS NULL').run(txId, r.id);
    q("UPDATE fh_receipts SET status='booked', transaction_id=? WHERE id=?").run(txId, r.id);
    // Læring: rettet kategori blir en regel for butikken.
    const ex = r.extraction ? JSON.parse(r.extraction) : null;
    const suggested = ruleFor(r.merchant) ?? catIdByName(ex?.suggested_category);
    if (st.autoCat && r.category_id && suggested !== r.category_id) {
      const word = r.merchant.toUpperCase().replace(/[^A-ZÆØÅ0-9 ]/g, '').trim().split(/\s+/)[0];
      if (word && word.length >= 3 && validId('fh_categories', r.category_id, u) && !q('SELECT 1 FROM fh_rules WHERE pattern=? AND user_id=?').get(word + '*', u)) q('INSERT INTO fh_rules(pattern,category_id,priority,user_id) VALUES(?,?,50,?)').run(word + '*', r.category_id, u);
    }
  })();
  try { const rule = confirmOnBook39(u, origSelect.get(r.id)); if (rule) scanLog(r.id, 'regel', `✦ ${rule.pattern} → ${rule.category}`); } catch (e) { console.warn('[finans39] godkjenning:', e.message); } // prompt 39
  try { const booked = origSelect.get(r.id); correctionOnBook48(u, booked, catById(u).get(booked.category_id)?.name ?? null); } catch (e) { console.warn('[finans48] rettelse:', e.message); } // prompt 48: rettelser som testdata
  return c.json(receiptOut(origSelect.get(r.id)));
});

// Angre bokføring (↺ i Bokført): kvitteringen går tilbake til gjennomgang. En transaksjon som bokføringen selv lagde
// (source='receipt'), fjernes. En banktransaksjon kvitteringen var koblet til, beholdes og forblir koblet.
api.post('/receipts/:id/unbook', W, (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  if (r.status !== 'booked') return bad(c, 'Kvitteringen er ikke bokført');
  db.transaction(() => {
    const tx = r.transaction_id ? q('SELECT id, source FROM fh_transactions WHERE id=? AND user_id=?').get(r.transaction_id, c.get('user')) : null;
    const others = tx ? q('SELECT COUNT(*) n FROM fh_receipts WHERE transaction_id=? AND id<>?').get(tx.id, r.id).n : 0;
    if (tx && tx.source === 'receipt' && !others) {
      q('UPDATE fh_folder_entries SET tx_id=NULL WHERE tx_id=?').run(tx.id);
      q('DELETE FROM fh_transactions WHERE id=?').run(tx.id);
      q("UPDATE fh_receipts SET status='needs_review', transaction_id=NULL WHERE id=?").run(r.id);
    } else {
      q("UPDATE fh_receipts SET status='needs_review' WHERE id=?").run(r.id);
    }
  })();
  return c.json(receiptOut(origSelect.get(r.id)));
});

api.post('/receipts/:id/reject', W, (c) => { const r = rcGet(c); if (r) q("UPDATE fh_receipts SET status='rejected' WHERE id=?").run(r.id); return ok(c); });
// Prompt 41: «Flytt til gjennomgang» for en avvist kvittering (bildet beholdes alltid). → kvitteringen
api.post('/receipts/:id/review', W, (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  if (r.status !== 'rejected') return bad(c, 'Bare avviste kvitteringer kan flyttes til gjennomgang');
  q("UPDATE fh_receipts SET status='needs_review' WHERE id=?").run(r.id);
  scanLog(r.id, 'til-gjennomgang', 'Flyttet fra avvist til gjennomgang');
  return c.json(receiptOut(origSelect.get(r.id)));
});

api.post('/receipts/:id/reprocess', W, (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  const p = c.req.query('provider');
  q("UPDATE fh_receipts SET status='pending', candidate=NULL WHERE id=?").run(r.id);
  scanLog(r.id, 'les-på-nytt', ENGINES.includes(p) ? providerName(p) : 'valgt motor');
  queue.push({ id: r.id, force: ENGINES.includes(p) ? p : undefined });
  runQueue();
  return c.json(receiptOut(origSelect.get(r.id)));
});

// Prompt 30: «Les kvitteringen på nytt» for å få posisjoner (bbox) til markeringen. Leser originalfilen med valgt motor i
// bakgrunnen og bytter bare ut varelinjene (med bbox) – status, beløp, kategori og bokføring røres ikke.
// → 202 {queued:true, receiptId}. Klienten henter GET /receipts/:id (hasBoxes, lines) etterpå. Feil havner i skanneloggen.
const rereading = new Set();
let rereadImpl = null;
export const _setReread = (fn) => { rereadImpl = fn; };
api.post('/receipts/:id/reread', W, async (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  if (r.status === 'pending' || r.status === 'processing' || rereading.has(r.id)) return bad(c, 'Kvitteringen leses allerede', 409);
  if (r.mime === 'text/plain') return bad(c, 'E-postkvitteringer har ikke bilde, så posisjoner finnes ikke');
  if (!r.file) return bad(c, 'Kvitteringen har ingen fil å lese');
  rereading.add(r.id);
  scanLog(r.id, 'les-på-nytt', 'posisjoner for markering');
  const u = c.get('user');
  const job = (async () => {
    try {
      const img = await readFile(join(DIR, r.scan || r.file));
      const mime = r.scan ? 'image/jpeg' : r.mime;
      const cats = q("SELECT name FROM fh_categories WHERE kind='expense' AND user_id=? ORDER BY sort").all(u).map((x) => x.name);
      const res = rereadImpl ? await rereadImpl(img, mime) : await extract(img, mime, cats, undefined, { log: (step, d) => scanLog(r.id, step, d) });
      const cur = origSelect.get(r.id);
      let ex = {}; try { ex = JSON.parse(cur?.extraction ?? '{}') ?? {}; } catch { ex = {}; }
      q('UPDATE fh_receipts SET extraction=? WHERE id=?').run(JSON.stringify({ ...ex, lines: res.data?.lines ?? ex.lines ?? [] }), r.id);
      storeLines(r.id);
      const n = receiptLines(origSelect.get(r.id)).filter((l) => l.bbox).length;
      scanLog(r.id, 'les-på-nytt-ferdig', n ? `${n} linjer med posisjon` : 'motoren ga ingen posisjoner');
    } catch (e) { scanLog(r.id, 'feil', `Les på nytt: ${e.message}`); } finally { rereading.delete(r.id); }
  })();
  if (rereadImpl) await job; // tester venter på resultatet
  return c.json({ queued: true, receiptId: r.id }, 202);
});

// «✦ Analyser på nytt med Gemini»: originalfilen sendes til Gemini. Resultatet lagres som kandidat og vises
// side om side med det forrige; brukeren velger hvilket som beholdes (POST …/reanalyze/apply).
const readOut = (o) => ({ merchant: o.merchant ?? null, date: o.date ?? null, total: o.total ?? null, items: (o.lines ?? []).map((l) => ({ description: l.description, amount: l.amount, quantity: l.quantity ?? null })),
  confidence: o.confidence ?? null, engine: o.engine ?? null, model: o.model ?? null, category: o.category ?? null, error: o.error ?? null });
// Prompt 39: «✦ På nytt» med fremdrift. Samme lesing som før, men som jobb (ai-jobs.js) med steg og prosent:
//   {step:'upload'|'ocr'|'llm'|'verify'|'done'|'error', pct, msg, steps:[{k, label, state}]} på GET /finans/api/jobs/:id,
//   SSE /finans/api/jobs/:id/events og realtime «job» {channel:'job:<id>', jobId, kind:'reanalyze', receiptId, step, pct, msg}.
//   Uten async: venter og svarer som før {previous, result, candidateId} + jobId, confidence, verify.
//   async:true (eller progress:true, Prefer: respond-async, ?async=1): 202 {jobId, receiptId, statusUrl, eventsUrl, channel} med en gang.
//     Når jobben er ferdig, tas resultatet i bruk (apply:false lar det ligge som kandidat), og job.result har i tillegg
//     {applied, changed:['merchant','total','date','category'], receipt}. Varsel «Kvitteringen fra … er lest på nytt» (Glimt) når appen er i bakgrunnen.
//   DELETE /finans/api/jobs/:id avbryter: «Avbrutt · ingenting ble endret».
const reanalyzing = new Map(); // kvittering-id → jobb-id
export const reanalyzeJobOf = (r) => { const id = reanalyzing.get(r.id); const j = id ? getJob(r.user_id ?? OWNER, id) : null; return j && j.status === 'running' ? { jobId: j.id, step: j.progress?.step ?? 'upload', pct: j.progress?.pct ?? 0, msg: j.progress?.msg ?? null } : null; };
async function reanalyzeRun(r, u, engine, { signal = null, progress = () => {} } = {}) {
  const label = engine === 'tesseract' ? 'Lokal OCR' : 'Gemini';
  const log = (step, detail) => scanLog(r.id, step, detail);
  let at = 'upload', pct = 0;
  const P = (step, p, msg) => { at = step; pct = Math.max(pct, p); progress({ step, pct, msg, receiptId: r.id, steps: stepsOut39(step, label, step === 'error') }); };
  P('upload', 5, 'Laster opp bildet');
  log('reanalyse', `${label}, originalfilen`);
  let ex = null; try { ex = JSON.parse(r.extraction ?? 'null'); } catch { /* ugyldig */ }
  const previous = readOut({ merchant: r.merchant, date: r.date, total: r.total != null ? r.total / 100 : null, lines: ex?.lines, confidence: r.confidence,
    engine: r.provider ? providerName(r.provider) : null, model: r.model, category: catById(u).get(r.category_id)?.name, error: r.error });
  let res;
  // Prompt 41: mangler originalen, si det konkret (ikke en generisk feil).
  if (!r.file) { P('error', pct, '✕ Fant ikke originalbildet'); return { error: 'Fant ikke originalbildet. Last det opp på nytt for å lese det.', status: 404, missingOriginal: true }; }
  try { await readFile(join(DIR, r.file)); } catch (e) { if (e.code === 'ENOENT') { P('error', pct, '✕ Fant ikke originalbildet'); return { error: 'Fant ikke originalbildet. Last det opp på nytt for å lese det.', status: 404, missingOriginal: true }; } }
  try {
    const img = await readFile(join(DIR, r.file));
    P('upload', 15, 'Laster opp bildet');
    P('ocr', 25, 'Leser teksten (OCR)');
    const cats = q("SELECT name FROM fh_categories WHERE kind='expense' AND user_id=? ORDER BY sort").all(u).map((x) => x.name);
    const logp = (step, detail) => { log(step, detail); if (step === 'ai') P('llm', 45, `✦ ${label} tolker butikk, linjer og beløp`); else if (step === 'kontroll') P('verify', 80, String(detail)); };
    if (engine === 'tesseract') P('ocr', 40, 'Leser teksten (OCR)');
    else P('llm', 40, `✦ ${label} tolker butikk, linjer og beløp`);
    res = engine === 'tesseract' ? await extractOcr(img, r.mime)
      : r.mime === 'text/plain' ? await extractText(img.toString('utf8'), cats) : await extract(img, r.mime, cats, 'gemini', { log: logp });
  } catch (e) {
    log('feil', `${label}: ${e.message}`);
    P('error', pct, `✕ ${label} svarte ikke`);
    return { error: `${label} kunne ikke lese kvitteringen: ${e.message}`, status: e.missing ? 501 : 502 };
  }
  if (signal?.aborted) return { cancelled: true };
  P('verify', 90, 'Sjekker sum og dato');
  const d = res.data;
  if (!d.verify) { d.verify = verify39(d); d.status = d.verify.status; }
  const candidateId = randomUUID();
  q('UPDATE fh_receipts SET candidate=? WHERE id=?').run(JSON.stringify({ id: candidateId, at: Date.now(), provider: res.provider === 'tekst' ? 'gemini' : res.provider, model: res.model, seconds: res.seconds, data: d }), r.id);
  saveRead41(r.id, { engine: res.provider === 'tekst' ? 'gemini' : res.provider, model: res.model, data: d, candidateId }); // prompt 41: receipt_reads (forslaget)
  log('reanalyse-ferdig', `${d.merchant ?? 'ukjent butikk'} · ${d.total ?? '–'} kr · sikkerhet ${Math.round((d.confidence.total ?? 0) * 100)} %`);
  const confidence = Math.min(d.confidence.total, d.confidence.merchant || 1);
  return { previous, result: readOut({ ...d, confidence, engine: label, model: res.model, category: d.suggested_category }), candidateId, confidence, verify: (({ feedback, ...v }) => v)(d.verify) };
}
api.post('/receipts/:id/reanalyze', W, async (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  const b = await c.req.json().catch(() => ({}));
  // Prompt 41: lov for alle statuser. Bokført og avvist får alltid bare et forslag (apply:false) – ingenting endres før «Bruk endringene».
  if (['booked', 'rejected'].includes(r.status)) b.apply = false;
  if (r.status === 'pending' || r.status === 'processing') return bad(c, 'Kvitteringen leses fortsatt');
  const engine = b.engine === 'tesseract' ? 'tesseract' : 'gemini';
  const label = engine === 'tesseract' ? 'Lokal OCR' : 'Gemini';
  if (engine === 'gemini' && !hasGemini()) return bad(c, 'Legg inn en Gemini-nøkkel under Innstillinger → AI-motor for å analysere på nytt.');
  if (engine === 'tesseract' && r.mime === 'text/plain') return bad(c, 'Lokal OCR leser bare bilder og PDF, ikke e-posttekst');
  const u = c.get('user');
  const bg = b.async === true || b.progress === true || /respond-async/i.test(c.req.header('prefer') ?? '') || c.req.query('async') === '1';
  if (bg && reanalyzing.has(r.id) && getJob(u, reanalyzing.get(r.id))?.status === 'running') return c.json({ jobId: reanalyzing.get(r.id), receiptId: r.id, running: true, statusUrl: `/finans/api/jobs/${reanalyzing.get(r.id)}`, eventsUrl: `/finans/api/jobs/${reanalyzing.get(r.id)}/events`, channel: `job:${reanalyzing.get(r.id)}` }, 202);
  let errStatus = 502;
  const { job, promise } = startJob(u, 'reanalyze', async (ctx) => {
    const progress = (p) => { ctx.progress(p); try { broadcast('job', { channel: `job:${ctx.job.id}`, jobId: ctx.job.id, kind: 'reanalyze', ...p }, [u]); broadcast('receipt-job', { jobId: ctx.job.id, receiptId: r.id, step: p.step, pct: p.pct, msg: p.msg }, [u]); } catch { /* sanntid er best effort */ } };
    const out = await reanalyzeRun(r, u, engine, { signal: ctx.signal, progress });
    if (out.cancelled || ctx.signal.aborted) { progress({ step: 'error', pct: 0, msg: 'Avbrutt · ingenting ble endret' }); throw Object.assign(new Error('Avbrutt'), { cancelled: true }); }
    if (out.error) { errStatus = out.status ?? 502; throw new Error(out.error); }
    const pctTxt = Math.round((out.confidence ?? 0) * 100);
    if (bg && b.apply !== false) {
      const before = origSelect.get(r.id);
      const cand = JSON.parse(before.candidate ?? 'null');
      if (cand && !['booked', 'rejected'].includes(before.status)) {
        await applyCandidate(before, cand);
        scanLog(r.id, 'reanalyse-valgt', `${label}-resultatet tatt i bruk (✦ På nytt)`);
        const after = origSelect.get(r.id);
        out.changed = [['merchant', 'merchant'], ['total', 'total'], ['date', 'date'], ['category', 'category_id']].filter(([, k]) => before[k] !== after[k]).map(([n]) => n);
        out.applied = true;
        out.receipt = receiptOut(after);
      }
    }
    progress({ step: 'done', pct: 100, msg: `✦ Glimt har analysert på nytt · ${pctTxt} % sikker` });
    if (bg) {
      import('../notify.js').then(({ notifyUser }) => notifyUser(u, { title: 'Glimt', body: `Kvitteringen fra ${out.result?.merchant ?? r.merchant ?? 'butikken'} er lest på nytt · ${pctTxt} % sikker`, url: '/finans/#/kv', tag: `reanalyze-${r.id}`, category: 'finans',
        data: { kind: 'receipt.reanalyzed', receiptId: r.id, jobId: ctx.job.id, deepLink: 'finanshub://finans/kvitteringer', icon: '/assets/glimt-varsel.png', badge: '/assets/glimt-badge.png' } }, { realtime: false })).catch(() => {});
    }
    return out;
  });
  if (bg) {
    reanalyzing.set(r.id, job.id);
    promise.finally(() => { if (reanalyzing.get(r.id) === job.id) reanalyzing.delete(r.id); });
    return c.json({ jobId: job.id, receiptId: r.id, statusUrl: `/finans/api/jobs/${job.id}`, eventsUrl: `/finans/api/jobs/${job.id}/events`, channel: `job:${job.id}`, steps: stepsOut39('upload', label) }, 202);
  }
  const j = await promise;
  if (j.status !== 'done') return bad(c, j.error ?? 'Avbrutt', j.status === 'cancelled' ? 409 : errStatus);
  const { confidence, ...out } = j.result;
  return c.json({ ...out, jobId: j.id, status: r.status, ...(r.status === 'rejected' ? { offer: 'review', offerText: 'Flytt til gjennomgang' } : {}), ...(r.status === 'booked' ? { offer: 'apply', offerText: 'Bruk endringene' } : {}) });
});
// Prompt 39 (PWA): GET /finans/api/receipts/reanalyze/:jobId → {jobId, receiptId, status, step, pct, msg, steps, result?} · DELETE samme = Avbryt.
api.get('/receipts/reanalyze/:jobId', R, (c) => { const j = getJob(c.get('user'), c.req.param('jobId')); return j && j.kind === 'reanalyze' ? c.json({ ...jobView(j), steps: j.progress?.steps ?? null }) : bad(c, 'Fant ikke jobben', 404); });
api.delete('/receipts/reanalyze/:jobId', W, (c) => {
  const j = getJob(c.get('user'), c.req.param('jobId'));
  if (!j || j.kind !== 'reanalyze') return bad(c, 'Fant ikke jobben', 404);
  const v = cancelJob(c.get('user'), j.id);
  const rid = j.progress?.receiptId;
  if (rid && v.status === 'cancelled') { q('UPDATE fh_receipts SET candidate=NULL WHERE id=?').run(rid); if (reanalyzing.get(rid) === j.id) reanalyzing.delete(rid); }
  try { broadcast('receipt-job', { jobId: j.id, receiptId: rid ?? null, step: 'error', pct: 0, msg: 'Avbrutt · ingenting ble endret' }, [c.get('user')]); } catch { /* */ }
  return c.json({ ok: true, jobId: j.id, status: v.status, step: 'error', msg: 'Avbrutt · ingenting ble endret' });
});
// Prompt 39 (iOS/PWA): Avbryt «✦ På nytt» → {ok, jobId, status:'cancelled', step:'error', msg:'Avbrutt · ingenting ble endret'}
api.post('/receipts/:id/reanalyze/:jobId/cancel', W, (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  const v = cancelJob(c.get('user'), c.req.param('jobId'));
  if (!v) return bad(c, 'Fant ikke jobben', 404);
  if (reanalyzing.get(r.id) === c.req.param('jobId')) reanalyzing.delete(r.id);
  if (v.status === 'cancelled') q('UPDATE fh_receipts SET candidate=NULL WHERE id=?').run(r.id);
  try { broadcast('job', { channel: `job:${v.id}`, jobId: v.id, kind: 'reanalyze', receiptId: r.id, step: 'error', pct: 0, msg: 'Avbrutt · ingenting ble endret' }, [c.get('user')]); } catch { /* */ }
  return c.json({ ok: true, jobId: v.id, status: v.status, step: 'error', msg: 'Avbrutt · ingenting ble endret' });
});
api.post('/receipts/:id/reanalyze/apply', W, async (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  const b = await c.req.json().catch(() => ({}));
  let cand = null; try { cand = JSON.parse(r.candidate ?? 'null'); } catch { /* ugyldig */ }
  if (!cand || cand.id !== b.candidateId) return bad(c, 'Resultatet er utløpt. Analyser på nytt.');
  const keepNew = b.keep === 'new' || b.keepNew === true; // prompt 40: keepNew:true|false eller keep:'new'|'old'
  // Prompt 40: bokført kvittering med gyldig kandidat (Les på nytt, apply:false) → transaksjonen oppdateres (fortegn, historikk, Tilbakestill).
  const tx40 = keepNew && r.status === 'booked' && r.transaction_id ? q('SELECT * FROM fh_transactions WHERE id=? AND user_id=?').get(r.transaction_id, r.user_id ?? c.get('user')) : null;
  if (tx40) {
    applyRereadTx40(c.get('user'), tx40, r, cand);
    scanLog(r.id, 'reanalyse-valgt', `${cand.provider === 'tesseract' ? 'Lokal OCR' : 'Gemini'}-resultatet beholdes (bokført transaksjon oppdatert)`);
  } else if (keepNew) {
    // Prompt 41: avvist + «Flytt til gjennomgang» → resultatet tas i bruk og status blir til gjennomgang. Bokført uten transaksjon endres ikke.
    if (r.status === 'booked') return bad(c, 'Kvitteringen er bokført uten transaksjon – endre den fra transaksjonen');
    await applyCandidate(r, cand);
    scanLog(r.id, 'reanalyse-valgt', `${cand.provider === 'tesseract' ? 'Lokal OCR' : 'Gemini'}-resultatet beholdes`);
  } else {
    q('UPDATE fh_receipts SET candidate=NULL WHERE id=?').run(r.id);
    scanLog(r.id, 'reanalyse-valgt', 'forrige resultat beholdes');
  }
  return c.json(receiptOut(origSelect.get(r.id)));
});

// Prompt 41: «✦ Les på nytt med Glimt» for alle statuser = POST /receipts/:id/reanalyze (bokført/avvist: alltid apply:false) eller
// POST /transactions/:id/reread (p40.js). /receipts/:id/reread over er fortsatt «les posisjoner» (prompt 30).
// Prompt 41: receipt_reads – hver ny lesing lagres som forslag (receipt_id, engine, read_at, fields_json, lines_json, confidence). GET /receipts/:id/reads.
q(`CREATE TABLE IF NOT EXISTS receipt_reads (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_id TEXT NOT NULL, engine TEXT, model TEXT, read_at INTEGER NOT NULL, fields_json TEXT, lines_json TEXT, confidence REAL, candidate_id TEXT)`).run();
q('CREATE INDEX IF NOT EXISTS receipt_reads_r ON receipt_reads(receipt_id, read_at)').run();
function saveRead41(receiptId, { engine, model, data, candidateId }) {
  try {
    const d = data ?? {};
    q('INSERT INTO receipt_reads(receipt_id, engine, model, read_at, fields_json, lines_json, confidence, candidate_id) VALUES(?,?,?,?,?,?,?,?)').run(receiptId, engine ?? null, model ?? null, Date.now(),
      JSON.stringify({ merchant: d.merchant ?? null, date: d.date ?? null, total: d.total ?? null, category: d.suggested_category ?? null }), JSON.stringify(d.lines ?? d.items ?? []), d.confidence?.total ?? null, candidateId);
    q('DELETE FROM receipt_reads WHERE receipt_id=? AND id NOT IN (SELECT id FROM receipt_reads WHERE receipt_id=? ORDER BY read_at DESC LIMIT 20)').run(receiptId, receiptId);
  } catch (e) { console.warn('[finans] receipt_reads:', e.message); }
}
api.get('/receipts/:id/reads', R, (c) => {
  const r = rcGet(c);
  if (!r) return c.notFound();
  const pj = (s) => { try { return JSON.parse(s); } catch { return null; } };
  return c.json({ reads: q('SELECT * FROM receipt_reads WHERE receipt_id=? ORDER BY read_at DESC').all(r.id).map((x) => ({ id: x.id, engine: x.engine, model: x.model, readAt: new Date(x.read_at).toISOString(), fields: pj(x.fields_json), lines: pj(x.lines_json) ?? [], confidence: x.confidence, candidateId: x.candidate_id })) });
});

// Tar et lest resultat i bruk på kvitteringen: felt, kategori, bankmatch og sammendrag. Status blir alltid «til gjennomgang».
async function applyCandidate(r, cand) {
  {
    const d = cand.data, st = settings();
    const totalOre = d.total != null ? Math.round(d.total * 100) : null;
    const rule = st.autoCat && ruleFor(d.merchant, r.user_id ?? me());
    const k39 = rule ? null : (() => { try { return classify39(r.user_id ?? me(), d); } catch { return null; } })(); // prompt 39
    if (k39) d.cat39 = k39;
    if (!d.verify) { d.verify = verify39(d); d.status = d.verify.status; }
    const catId = rule || k39?.categoryId || catIdByName(d.suggested_category) || r.category_id;
    const acc = d.card_last4 ? q('SELECT id FROM fh_accounts WHERE last4=? AND user_id=?').get(d.card_last4, r.user_id ?? me())?.id : null;
    const tm = String(r.target ?? '').match(/^tx:(\d+)$/);
    const match = tm ? { id: +tm[1] } : findMatch(totalOre, d.date, d.card_last4, r.user_id ?? me());
    q(`UPDATE fh_receipts SET status='needs_review', error=NULL, provider=?, model=?, seconds=?, extraction=?, merchant=?, date=?, total=?, category_id=?,
       account_id=COALESCE(?, account_id), confidence=?, transaction_id=?, candidate=NULL WHERE id=?`)
      .run(cand.provider, cand.model, cand.seconds, JSON.stringify(d), d.merchant, d.date ?? r.date, totalOre, catId,
        acc ?? match?.account_id ?? null, Math.min(d.confidence.total, d.confidence.merchant || 1), match?.id ?? r.transaction_id ?? null, r.id);
    storeLines(r.id); // prompt 30: linjer med bbox
    try { const sum = await summarizeReceipt(d, catById().get(catId)?.name); q('UPDATE fh_receipts SET ai_short=?, ai_long=?, domain=? WHERE id=?').run(sum.short, sum.long, sum.domain, r.id); } catch { /* sammendraget er valgfritt */ }
    try { routeTarget(r.id); } catch { /* mappen kan være slettet */ }
  }
}

// «Les med lokal OCR» på flere kvitteringer: de som feilet (eller de valgte). Resultatet tas i bruk med en gang
// og havner til gjennomgang, siden det ikke finnes noe tidligere svar å sammenligne med.
api.get('/receipts/ocr', R, (c) => c.json({ count: q(`SELECT count(*) FROM fh_receipts WHERE status IN ('needs_review','failed') AND file IS NOT NULL AND COALESCE(mime,'') <> 'text/plain'
  AND (error IS NOT NULL OR merchant IS NULL OR total IS NULL) AND ${RC_VISIBLE}`).pluck().get(c.get('user')) }));
api.post('/receipts/ocr', W, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : null;
  const rows = ids ? ids.map((id) => rcGet(c, id)).filter(Boolean)
    // Standard: kvitteringer til gjennomgang som AI ikke klarte (feilmelding, eller mangler butikk eller beløp).
    : q(`SELECT id FROM fh_receipts WHERE status IN ('needs_review','failed') AND file IS NOT NULL AND COALESCE(mime,'') <> 'text/plain'
         AND (error IS NOT NULL OR merchant IS NULL OR total IS NULL) AND ${RC_VISIBLE} ORDER BY created DESC LIMIT 200`).all(c.get('user')).map((x) => origSelect.get(x.id)).filter(Boolean);
  const out = { done: 0, failed: 0, skipped: 0, errors: [] };
  for (const r of rows) {
    if (!r.file || r.mime === 'text/plain' || ['booked', 'rejected', 'pending', 'processing'].includes(r.status)) { out.skipped++; continue; }
    try {
      const res = await extractOcr(await readFile(join(DIR, r.file)), r.mime);
      await applyCandidate(r, { provider: res.provider, model: res.model, seconds: res.seconds, data: res.data });
      scanLog(r.id, 'ocr', `Lokal OCR: ${res.data.merchant ?? 'ukjent butikk'} · ${res.data.total ?? '–'} kr`);
      out.done++;
    } catch (e) {
      out.failed++; out.errors.push(`${r.merchant ?? r.id}: ${e.message}`);
      if (e.missing) { out.errors = ['Tesseract er ikke installert på serveren. Oppdater Docker-imaget.']; break; }
    }
  }
  out.message = `${out.done} kvittering${out.done === 1 ? '' : 'er'} lest med lokal OCR${out.failed ? ` · ${out.failed} feilet` : ''}${out.skipped ? ` · ${out.skipped} hoppet over` : ''}`;
  return c.json(out);
});

api.delete('/receipts/:id', W, async (c) => {
  const r = rcGet(c);
  if (!r) return ok(c);
  q('DELETE FROM fh_receipts WHERE id=?').run(r.id);
  for (const f of [r.file, r.thumb, r.scan]) if (f) await unlink(join(DIR, f)).catch(() => {});
  return ok(c);
});

/* --- Budsjett --- */

api.put('/budgets', W, async (c) => {
  const b = await c.req.json();
  const month = b.month && /^\d{4}-\d{2}$/.test(b.month) ? b.month : 'default';
  const amount = ore(b.amount);
  if (!own('fh_categories', +b.categoryId)) return bad(c, 'Ukjent kategori');
  if (amount === null || amount <= 0) q('DELETE FROM fh_budgets WHERE category_id=? AND month=? AND user_id=?').run(+b.categoryId, month, c.get('user'));
  else q('INSERT INTO fh_budgets(category_id,month,amount,user_id) VALUES(?,?,?,?) ON CONFLICT(category_id,month) DO UPDATE SET amount=excluded.amount').run(+b.categoryId, month, amount, c.get('user'));
  return ok(c);
});

/* --- Faste utgifter --- */

api.get('/recurring', R, (c) => { const cats = catById(); return c.json(q('SELECT * FROM fh_recurring WHERE user_id=? ORDER BY day, id').all(c.get('user')).map((r) => recurringOut(r, cats))); });
function recVals(b, cur = {}) {
  const amount = b.amount !== undefined ? ore(b.amount) : cur.amount;
  return { name: b.name !== undefined ? str(b.name, 80) : cur.name, amount: amount != null ? Math.abs(amount) : null,
    interval: ['monthly', 'yearly', 'weekly'].includes(b.interval) ? b.interval : cur.interval ?? 'monthly',
    day: b.day !== undefined ? Math.min(31, Math.max(1, +b.day || 1)) : cur.day ?? 1, month: b.month !== undefined ? (+b.month || null) : cur.month ?? null,
    category_id: b.categoryId !== undefined ? (validId('fh_categories', +b.categoryId) || null) : cur.category_id ?? null, account_id: b.accountId !== undefined ? (validId('fh_accounts', +b.accountId) || null) : cur.account_id ?? null,
    active: b.active !== undefined ? (b.active ? 1 : 0) : cur.active ?? 1 };
}
api.post('/recurring', W, async (c) => {
  const v = recVals(await c.req.json());
  if (!v.name || !v.amount) return bad(c, 'Navn og beløp må fylles ut');
  const r = q('INSERT INTO fh_recurring(name,amount,interval,day,month,category_id,account_id,active,user_id) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *').get(v.name, v.amount, v.interval, v.day, v.month, v.category_id, v.account_id, v.active, c.get('user'));
  return c.json(recurringOut(r));
});
api.patch('/recurring/:id', W, async (c) => {
  const cur = own('fh_recurring', +c.req.param('id'));
  if (!cur) return c.notFound();
  const v = recVals(await c.req.json(), cur);
  const r = q('UPDATE fh_recurring SET name=?, amount=?, interval=?, day=?, month=?, category_id=?, account_id=?, active=? WHERE id=? RETURNING *').get(v.name, v.amount, v.interval, v.day, v.month, v.category_id, v.account_id, v.active, cur.id);
  return c.json(recurringOut(r));
});
api.delete('/recurring/:id', W, (c) => { q('DELETE FROM fh_recurring WHERE id=? AND user_id=?').run(+c.req.param('id'), c.get('user')); return ok(c); });

// Oppdag gjentakende trekk: samme butikk i minst 3 ulike måneder siste 7 måneder, med omtrent likt beløp.
api.post('/recurring/detect', W, (c) => {
  const since = shiftMonth(curMonth(), -7) + '-01';
  const u = c.get('user');
  const rows = q(`SELECT t.* FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND t.amount<0 AND t.date>=? AND COALESCE(c.kind,'expense')='expense'`).all(u, since);
  const groups = new Map();
  for (const t of rows) {
    const key = (t.merchant || t.description).toUpperCase().replace(/[0-9*#.,:/-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
    if (key.length < 3) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(t);
  }
  const existing = new Set(q('SELECT upper(name) n FROM fh_recurring WHERE user_id=?').all(u).map((r) => r.n));
  let added = 0;
  for (const [key, list] of groups) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    if (months.size < 3 || existing.has(key)) continue;
    const amounts = list.map((t) => -t.amount).sort((a, b) => a - b), med = amounts[Math.floor(amounts.length / 2)];
    if (amounts.filter((a) => Math.abs(a - med) <= med * 0.1).length < 3) continue;
    const days = list.map((t) => +t.date.slice(8)).sort((a, b) => a - b), day = days[Math.floor(days.length / 2)];
    const name = key.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
    q('INSERT INTO fh_recurring(name,amount,interval,day,category_id,account_id,active,detected,user_id) VALUES(?,?,?,?,?,?,1,1,?)').run(name, med, 'monthly', day, list[0].category_id, list[0].account_id, u);
    added++;
  }
  return c.json({ added });
});

/* --- Kontoer, sparemål, kategorier, regler --- */

const ACC_TYPES = ['checking', 'savings', 'credit', 'cash'];
api.post('/accounts', W, async (c) => {
  const b = await c.req.json();
  if (!str(b.name)) return bad(c, 'Navn må fylles ut');
  const l4 = String(b.last4 ?? '').replace(/\D/g, '').slice(-4) || null; // aldri fullt kontonummer
  const u = c.get('user');
  const r = q('INSERT INTO fh_accounts(name,bank,type,last4,opening_balance,note,sort,user_id) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM fh_accounts WHERE user_id=?),?) RETURNING id')
    .get(str(b.name, 60), str(b.bank, 60), ACC_TYPES.includes(b.type) ? b.type : 'checking', l4, ore(b.openingBalance) ?? 0, str(b.note, 120), u, u);
  return c.json({ id: r.id });
});
api.patch('/accounts/:id', W, async (c) => {
  const cur = own('fh_accounts', +c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_accounts SET name=?, bank=?, type=?, last4=?, opening_balance=?, note=? WHERE id=?').run(
    b.name !== undefined ? str(b.name, 60) || cur.name : cur.name, b.bank !== undefined ? str(b.bank, 60) : cur.bank,
    ACC_TYPES.includes(b.type) ? b.type : cur.type, b.last4 !== undefined ? String(b.last4).replace(/\D/g, '').slice(-4) || null : cur.last4,
    b.openingBalance !== undefined ? ore(b.openingBalance) ?? cur.opening_balance : cur.opening_balance, b.note !== undefined ? str(b.note, 120) : cur.note, cur.id);
  return ok(c);
});
api.delete('/accounts/:id', W, (c) => { q('DELETE FROM fh_accounts WHERE id=? AND user_id=?').run(+c.req.param('id'), c.get('user')); return ok(c); });

api.post('/goals', W, async (c) => {
  const b = await c.req.json();
  if (!str(b.name) || !ore(b.target)) return bad(c, 'Navn og mål må fylles ut');
  q('INSERT INTO fh_goals(name,saved,target,color,user_id) VALUES(?,?,?,?,?)').run(str(b.name, 60), ore(b.saved) ?? 0, ore(b.target), hex(b.color) ?? '#5FD3A8', c.get('user'));
  return ok(c);
});
api.patch('/goals/:id', W, async (c) => {
  const cur = own('fh_goals', +c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_goals SET name=?, saved=?, target=?, color=? WHERE id=?').run(b.name !== undefined ? str(b.name, 60) || cur.name : cur.name,
    b.saved !== undefined ? ore(b.saved) ?? cur.saved : cur.saved, b.target !== undefined ? ore(b.target) || cur.target : cur.target, hex(b.color) ?? cur.color, cur.id);
  return ok(c);
});
api.delete('/goals/:id', W, (c) => { q('DELETE FROM fh_goals WHERE id=? AND user_id=?').run(+c.req.param('id'), c.get('user')); return ok(c); });

const KINDS = ['expense', 'income', 'transfer'];
// Prompt 39: {name, color?, icon?, kind?, source?:'user'|'ai', example_tx?} → {id, category:{id, name, color, kind, source, confirmed, icon}, existing?}
// source:'ai' lager en ubekreftet AI-kategori; finnes en med likt navn (likhet ≥ 0,85, «Skole» = «Skole og studier»), gis den (existing:true).
api.post('/categories', W, async (c) => {
  const b = await c.req.json();
  const name = str(b.name, 40);
  if (!name) return bad(c, 'Navn må fylles ut');
  const u = c.get('user');
  if (b.source === 'ai') {
    const k = createAiCategory(u, { name, color: hex(b.color), icon: typeof b.icon === 'string' ? b.icon.slice(0, 30) : null, reason: str(b.reason, 80) || null, exampleTx: b.example_tx ?? b.exampleTx ?? null });
    const row = q('SELECT * FROM fh_categories WHERE id=?').get(k.id);
    return c.json({ id: row.id, category: categoryOut39(row), ...(k.existing ? { existing: true } : {}) }, k.existing ? 200 : 201);
  }
  if (q('SELECT 1 FROM fh_categories WHERE lower(name)=lower(?) AND user_id=?').get(name, u)) return bad(c, 'Kategorien finnes allerede');
  const r = q("INSERT INTO fh_categories(name,color,kind,sort,user_id,source,confirmed,icon,created) VALUES(?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM fh_categories WHERE user_id=?),?,'user',1,?,?) RETURNING id")
    .get(name, hex(b.color) ?? '#8FD3FF', KINDS.includes(b.kind) ? b.kind : 'expense', u, u, typeof b.icon === 'string' ? b.icon.slice(0, 30) : null, Date.now());
  return c.json({ id: r.id, category: categoryOut39(q('SELECT * FROM fh_categories WHERE id=?').get(r.id)) });
});
api.patch('/categories/:id', W, async (c) => {
  const cur = own('fh_categories', +c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  const name = b.name !== undefined ? str(b.name, 40) || cur.name : cur.name;
  if (name !== cur.name && q('SELECT 1 FROM fh_categories WHERE lower(name)=lower(?) AND id<>? AND user_id=?').get(name, cur.id, cur.user_id)) return bad(c, 'Navnet er i bruk');
  q('UPDATE fh_categories SET name=?, color=?, kind=? WHERE id=?').run(name, hex(b.color) ?? cur.color, KINDS.includes(b.kind) ? b.kind : cur.kind, cur.id);
  // Prompt 39: ikon og «gjør permanent» (confirmed) for AI-kategorier; å gi nytt navn bekrefter også.
  if (typeof b.icon === 'string') q('UPDATE fh_categories SET icon=? WHERE id=?').run(b.icon.slice(0, 30), cur.id);
  if (b.confirmed === true || (cur.source === 'ai' && name !== cur.name)) q('UPDATE fh_categories SET confirmed=1 WHERE id=?').run(cur.id);
  return ok(c);
});
api.delete('/categories/:id', W, (c) => { q('DELETE FROM fh_categories WHERE id=? AND user_id=?').run(+c.req.param('id'), c.get('user')); return ok(c); });

api.post('/rules', W, async (c) => {
  const b = await c.req.json();
  const p = str(b.pattern, 60).toUpperCase();
  if (!p || !own('fh_categories', +b.categoryId)) return bad(c, 'Mønster og kategori må fylles ut');
  const r = q('INSERT INTO fh_rules(pattern,category_id,priority,user_id) VALUES(?,?,?,?) RETURNING id').get(p, +b.categoryId, Number.isInteger(b.priority) ? b.priority : 100, c.get('user'));
  return c.json({ id: r.id });
});
api.patch('/rules/:id', W, async (c) => {
  const cur = own('fh_rules', +c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_rules SET pattern=?, category_id=? WHERE id=?').run(b.pattern !== undefined ? str(b.pattern, 60).toUpperCase() || cur.pattern : cur.pattern, b.categoryId !== undefined ? validId('fh_categories', +b.categoryId) || cur.category_id : cur.category_id, cur.id);
  return ok(c);
});
api.delete('/rules/:id', W, (c) => { q('DELETE FROM fh_rules WHERE id=? AND user_id=?').run(+c.req.param('id'), c.get('user')); return ok(c); });
// Bruk reglene på ukategoriserte transaksjoner.
api.post('/rules/apply', W, (c) => {
  let n = 0;
  for (const t of q('SELECT id, description, merchant FROM fh_transactions WHERE category_id IS NULL AND user_id=?').all(c.get('user'))) {
    const cid = ruleFor(t.merchant || t.description);
    if (cid) { q('UPDATE fh_transactions SET category_id=? WHERE id=?').run(cid, t.id); n++; }
  }
  return c.json({ updated: n });
});

/* --- Rapporter --- */

api.get('/reports', R, (c) => {
  const mode = c.req.query('mode') === 'year' ? 'year' : 'month';
  const month = /^\d{4}-\d{2}$/.test(c.req.query('month') ?? '') ? c.req.query('month') : curMonth();
  const year = month.slice(0, 4);
  const { from, to } = mode === 'year' ? { from: `${year}-01-01`, to: `${+year + 1}-01-01` } : period(month);
  const cats = catById();
  const u = c.get('user');
  const rows = q('SELECT * FROM fh_transactions WHERE user_id=? AND date>=? AND date<?').all(u, from, to).filter((t) => (cats.get(t.category_id)?.kind ?? 'expense') !== 'transfer');
  const byCat = {}, byM = {};
  for (const t of rows) if (t.amount < 0) {
    byCat[t.category_id ?? 0] = (byCat[t.category_id ?? 0] ?? 0) - t.amount;
    const m = (t.merchant || t.description).replace(/\s+\d.*$/, '').split(' ').slice(0, 2).join(' ');
    (byM[m] ??= [0, 0]); byM[m][0] -= t.amount; byM[m][1]++;
  }
  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`, p = period(m);
    if (p.from > today()) break;
    let inn = 0, ut = 0;
    for (const t of q('SELECT amount, category_id FROM fh_transactions WHERE user_id=? AND date>=? AND date<?').all(u, p.from, p.to)) {
      if ((cats.get(t.category_id)?.kind ?? 'expense') === 'transfer') continue;
      if (t.amount > 0) inn += t.amount; else ut -= t.amount;
    }
    months.push({ month: m, inn: inn / 100, ut: ut / 100 });
  }
  return c.json({ mode, from, to, total: Object.values(byCat).reduce((a, b) => a + b, 0) / 100,
    byCategory: Object.entries(byCat).map(([id, v]) => ({ category: cats.get(+id)?.name ?? 'Ukategorisert', color: cats.get(+id)?.color ?? '#A0A0AA', amount: v / 100 })).sort((a, b) => b.amount - a.amount),
    merchants: Object.entries(byM).map(([name, [v, n]]) => ({ name, amount: v / 100, count: n })).sort((a, b) => b.amount - a.amount).slice(0, 8),
    months: months.reverse() });
});

/* --- Innstillinger, AI og tokens --- */

const SETTING_KEYS = { name: (v) => str(v, 40), currency: (v) => (['NOK', 'EUR', 'SEK'].includes(v) ? v : 'NOK'), monthStart: (v) => Math.min(28, Math.max(1, +v || 1)),
  yearGoal: (v) => Math.max(0, +v || 0), provider: (v) => (ENGINES.includes(v) ? v : 'ollama'), fallback: Boolean,
  ollamaUrl: (v) => (/^https?:\/\/\S+$/.test(v) ? v : DEFAULT_SETTINGS.ollamaUrl), ollamaModel: (v) => str(v, 60) || DEFAULT_SETTINGS.ollamaModel, ollamaTextModel: (v) => str(v, 60), embedModel: (v) => str(v, 60), aiSearchEmbed: Boolean,
  geminiModel: (v) => (/^[a-z0-9.\-]{3,60}$/i.test(v) ? v : DEFAULT_SETTINGS.geminiModel),
  groqModel: (v) => (/^[a-z0-9./_:\-]{2,80}$/i.test(String(v)) ? String(v) : ''), groqVisionModel: (v) => (/^[a-z0-9./_:\-]{2,80}$/i.test(String(v)) ? String(v) : ''),
  roboflowWorkflow: (v) => (/^[a-z0-9._\-/]{0,120}$/i.test(String(v)) ? String(v) : ''), minConf: (v) => Math.min(99, Math.max(50, +v || 85)),
  roboflowWorkspace: (v) => (/^[a-z0-9._\-]{0,80}$/i.test(String(v)) ? String(v) : ''), roboflowModel: (v) => (/^[a-z0-9._\-/]{0,120}$/i.test(String(v)) ? String(v) : ''),
  roboflowBarcodeModel: (v) => (/^[a-z0-9._\-/]{0,120}$/i.test(String(v)) ? String(v) : ''),
  // «Hvem gjør hva»: motor per oppgave. Ukjente oppgaver/motorer droppes; null = standard.
  aiTasks: (v) => Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([k, e]) => TASKS[k] && (k === 'barcode' ? ['roboflow', 'zbar'] : ENGINES).includes(e))),
  // Lokal OCR-reserve: null = følg OCR_FALLBACK. ocrLowConf = les også lokalt når AI er usikker.
  ocrFallback: (v) => (v === null ? null : !!v), ocrLowConf: Boolean,
  autoCat: Boolean, n80: Boolean, n100: Boolean, nRc: Boolean, nFast: Boolean, csvProfile: (v) => (PROFILES.includes(v) ? v : 'DNB'),
  // Prompt 23: tidsgrenser per motor (5–120 s), nye forsøk (0–3) og hva som skjer ved tidsavbrudd. Flettes med lagret verdi.
  aiTimeouts: (v) => cleanAiTimeouts(v, aiTimeoutsOf()),
  aiSummaries: Boolean, imapHost: (v) => (/^[a-z0-9.-]{0,120}$/i.test(v) ? v : ''), imapUser: (v) => str(v, 120), imapFolder: (v) => str(v, 60) || 'INBOX',
  // ISO2: Trading 212-miljøet er en personlig integrasjon (videresendes til setUserCfg via saveSettings).
  t212Env: (v) => (v === 'demo' ? 'demo' : 'live'), boligAiNew: Boolean,
  // Prompt 48: Mac-OCR-adressen (ugyldig → beholder lagret) og av/på per steg i kvitteringskjeden (flettes med lagret verdi).
  macOcrUrl: (v) => cleanMacOcrUrl(v) ?? settings().macOcrUrl, receipts48: (v) => cleanReceipts48(v, settings().receipts48) };
// Serveroppsett som vanlige brukere ikke får se (adresser, kontoer, arbeidsflyter). Modellnavn og motorvalg vises.
const SERVER_HIDDEN = new Set(['ollamaUrl', 'macOcrUrl', 'roboflowWorkflow', 'roboflowWorkspace', 'roboflowModel', 'roboflowBarcodeModel', 'smbShare', 'smbDir', 'smbUser', 'smbDomain', 'smbVersion']);
const SERVER_SECRETS = ['geminiKey', 'groqKey', 'roboflowKey', 'macOcrKey']; // prompt 48: macOcrKey
const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ISO2: serverfelt (SERVER_KEYS og Gemini/Groq/Roboflow-nøklene) kan bare endres av admin; en vanlig bruker som prøver å endre
// et av dem, får 403 (uendrede verdier som sendes med, ignoreres). Resten lagres hos brukeren. Body kan være flat eller {server:{…}, user:{…}}.
api.put('/settings', W, async (c) => {
  const b0 = await c.req.json();
  const b = { ...b0, ...(b0.user && typeof b0.user === 'object' ? b0.user : {}), ...(b0.server && typeof b0.server === 'object' ? b0.server : {}) };
  const a = c.get('access');
  const patch = {};
  for (const [k, fn] of Object.entries(SETTING_KEYS)) if (b[k] !== undefined) patch[k] = fn(b[k]);
  const cur = settings();
  const changed = Object.keys(patch).filter((k) => SERVER_KEYS.has(k) && !sameVal(patch[k], k === 'aiTimeouts' ? aiTimeoutsOf(cur) : cur[k]));
  const secrets = SERVER_SECRETS.filter((k) => typeof b[k] === 'string');
  if (!a.admin && (changed.length || secrets.length)) return bad(c, `Bare administratorer kan endre serveroppsettet (${[...changed, ...secrets].join(', ')})`, 403);
  for (const k of Object.keys(patch)) if (SERVER_KEYS.has(k) && !changed.includes(k)) delete patch[k];
  try { saveSettings(patch); } catch (e) { return bad(c, e.message); }
  // Nye nøkler: bare fra en økt i nettleseren, aldri fra et app-token. Tom streng sletter.
  for (const k of SERVER_SECRETS) if (typeof b[k] === 'string' && a.session) setSecret(k, b[k].trim());
  // Personlige hemmeligheter (egen IMAP og Trading 212) lagres hos brukeren (setUserCfg).
  try {
    if (typeof b.imapPass === 'string' && a.session) setSecret('imapPass', b.imapPass);
    for (const k of ['t212Key', 't212Secret']) if (typeof b[k] === 'string' && b[k].trim() && a.session) setSecret(k, cleanCred(b[k]));
  } catch (e) { return bad(c, e.message); }
  if (b.t212Key || b.t212Secret || b.t212Env) resetStocks();
  // Prompt 27: Chat- og logo-bryterne er personlige (settings.js), og appene lagrer dem her sammen med resten.
  const p27 = {};
  for (const k of P27_BOOL) if (b[k] !== undefined && b[k] !== null) p27[k] = /^(1|true|on)$/i.test(String(b[k])) ? '1' : '0';
  for (const k of P27_TEXT) if (typeof b[k] === 'string') p27[k] = b[k].trim();
  if (Object.keys(p27).length) { try { setUserCfg(c.get('user'), p27); } catch (e) { return bad(c, e.message); } }
  return c.json(settingsOut(c));
});
// Samme innstillinger som i /bootstrap (prompt 23: også for appene, som leser aiTimeouts her). Hemmeligheter sendes aldri ut.
// Flatt som før (bakoverkompatibelt), pluss server:{…} (felles serveroppsett, bare admin kan endre) og user:{…} (brukerens egne).
const P27_BOOL = ['chat_my_data', 'chat_ask_cloud', 'logo_local_receipts', 'logo_gemini', 'logo_verify', 'ai_think'];
const P27_TEXT = ['chat_default_model', 'chat_theme'];
function p27Out(u) {
  const o = {};
  for (const k of P27_BOOL) o[k] = /^(1|true|on)$/i.test(String(userCfg(u, k) ?? ''));
  for (const k of P27_TEXT) o[k] = userCfg(u, k) ?? '';
  return o;
}
function settingsOut(c) {
  const a = c.get('access');
  const out = { ...settings(), ...p27Out(c.get('user')) };
  const seen = (k) => a.admin || !SERVER_HIDDEN.has(k);
  const flat = Object.fromEntries(Object.entries(out).filter(([k]) => seen(k)));
  const aiTimeouts = aiTimeoutsOf(out), imapPin = out.imapPin ? { fingerprint: out.imapPin.fingerprint } : null;
  const server = { ...Object.fromEntries([...SERVER_KEYS].filter(seen).map((k) => [k, out[k]])), aiTimeouts,
    geminiKeySet: !!hasGemini(), groqKeySet: !!secret('groqKey'), roboflowKeySet: !!secret('roboflowKey'), ...(a.admin ? { macOcrKeySet: !!secret('macOcrKey') } : {}) };
  const user = { ...Object.fromEntries(Object.entries(out).filter(([k]) => !SERVER_KEYS.has(k))), imapPin, imapPassSet: !!secret('imapPass'), t212Set: t212Configured() };
  return { ...flat, aiTimeouts, aiTimeoutOptions: { steps: TIMEOUT_STEPS, retries: [0, 1, 2, 3], onTimeout: ON_TIMEOUT, defaults: AI_TIMEOUT_DEFAULTS },
    imapPin, geminiKeySet: server.geminiKeySet, groqKeySet: server.groqKeySet, roboflowKeySet: server.roboflowKeySet, imapPassSet: user.imapPassSet, t212Set: user.t212Set,
    server, user, canEditServer: a.admin, serverKeys: [...SERVER_KEYS].filter(seen), userKeys: Object.keys(user) };
}
api.get('/settings', R, (c) => c.json(settingsOut(c)));

api.get('/health/ai', R, async (c) => c.json(await health()));
// «Test tilkobling» per motor (ollama | gemini | groq) og for Roboflow-nøkkelen.
api.post('/ai/test', R, adminOnly, async (c) => { const b = await c.req.json().catch(() => ({})); return c.json(await testEngine(String(b.provider ?? settings().provider))); });
api.post('/ai/roboflow/test', R, adminOnly, async (c) => c.json(await testRoboflow()));
// Siste AI-kall (oppgave, motor, modell, ms, status) for feilsøking under Innstillinger → AI.
// Prompt 25: tidsgrensene klientene bruker (sekunder). clientTimeoutS = maks(motor) × (forsøk + 1) + 10.
api.get('/ai/limits', R, (c) => c.json(aiLimits()));
api.get('/ai/log', R, (c) => c.json({ items: aiLog(+c.req.query('limit') || 50) }));
// Ollama: installerte modeller, anbefalte for maskinen, installering med fremdrift og sletting.
api.get('/ai/ollama/models', R, adminOnly, async (c) => { try { return c.json(await ollamaModels()); } catch (e) { return c.json({ ok: false, error: e.message, pulls: pullStatus() }, e.status ?? 502); } });
api.get('/ai/ollama/pull', R, adminOnly, (c) => c.json({ pulls: pullStatus() }));
api.post('/ai/ollama/pull', sessionOnly, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  try { return c.json({ pulls: startPull(b.model) }, 202); } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
});
api.delete('/ai/ollama/models/:name{.+}', sessionOnly, adminOnly, async (c) => {
  try { await deleteModel(decodeURIComponent(c.req.param('name'))); return c.json(await ollamaModels()); } catch (e) { return c.json({ error: e.message }, e.status ?? 502); }
});

// Flere Gemini-nøkler (reserver ved brukt opp kvote). Nøklene vises aldri, bare de fire siste tegnene.
const keyErr = (c, e) => c.json({ error: e.message }, e.status ?? 400);
api.get('/ai/gemini-keys', R, adminOnly, (c) => c.json({ items: listKeysOut() }));
api.post('/ai/gemini-keys', sessionOnly, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  try { const id = addKey(b.label, b.key); return c.json({ id, items: listKeysOut() }, 201); } catch (e) { return keyErr(c, e); }
});
api.patch('/ai/gemini-keys/:id', sessionOnly, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  try { if (b.label != null) renameKey(c.req.param('id'), b.label); if (b.reset) resetKey(c.req.param('id')); return c.json({ items: listKeysOut() }); } catch (e) { return keyErr(c, e); }
});
api.delete('/ai/gemini-keys/:id', sessionOnly, adminOnly, (c) => { removeKey(c.req.param('id')); return c.json({ items: listKeysOut() }); });
api.put('/ai/gemini-keys/order', sessionOnly, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  orderKeys(Array.isArray(b.ids) ? b.ids.map(String) : []); return c.json({ items: listKeysOut() });
});
api.post('/ai/gemini-keys/:id/test', sessionOnly, adminOnly, async (c) => {
  try { const r = await testKey(c.req.param('id')); return c.json({ ...r, items: listKeysOut() }); } catch (e) { return c.json({ ok: false, message: e.message, items: listKeysOut() }, e.status ?? 502); }
});
// Strekkoder og QR fra et bilde (Sporing → «Skann strekkode»). zbar på serveren, med Roboflow-beskjæring hvis satt opp.
// 501 med årsak når serveren ikke har strekkodeleser; da bruker klienten sin egen.
api.post('/scan/barcode', R, async (c) => {
  const b = await c.req.parseBody().catch(() => ({}));
  const f = b.file;
  if (!(f instanceof File) || !f.size) return c.json({ error: 'Last opp et bilde (feltet «file»)' }, 400);
  if (f.size > 15 * 1024 * 1024) return c.json({ error: 'Bildet er for stort (maks 15 MB)' }, 413);
  const img = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(img, f.type, f.name) || 'image/jpeg';
  try { return c.json(await barcode(img, mime)); }
  catch (e) { return c.json({ error: e.message, codes: [] }, e.missing ? 501 : 502); }
});

// Personlige tokens (fh_pat_…): bare hashen lagres, tokenet vises én gang. Hver bruker ser og trekker tilbake sine egne.
const tokenOut = (t) => ({ id: t.id.slice(0, 12), name: t.name, scopes: t.scopes.split(' '), created: t.created, lastUsed: t.last_used, last_used: t.last_used, expires: t.expires, expired: !!t.expires && t.expires < Date.now() });
// Økt i nettleseren, eller et token med finance:write (mobilappens innstillinger). Et token kan ikke lage tokens med mer tilgang enn det selv har.
const tokenAdmin = async (c, next) => { const a = c.get('access'); if (!a.session && !a.scopes.has('finance:write')) return bad(c, 'Krever innlogging i nettleseren eller et token med finance:write', 403); await next(); };
api.get('/tokens', tokenAdmin, (c) => c.json(q('SELECT * FROM fh_tokens WHERE COALESCE(user_id, ?)=? ORDER BY created DESC').all(OWNER, c.get('user')).map((t) => ({ ...tokenOut(t), current: t.id === c.get('access').tokenId }))));
api.post('/tokens', tokenAdmin, async (c) => {
  const b = await c.req.json();
  const a = c.get('access');
  const scopes = (Array.isArray(b.scopes) ? b.scopes : ['finance:read', 'receipts:write']).filter((x) => SCOPES.includes(x) && (a.session || hasScope(a, x)));
  if (!scopes.length) return bad(c, 'Velg minst én tilgang');
  // expires: '30d' | '90d' | '1y' | 'never', eller expiresDays: 30 | 90 | 365 | null (mobilappen).
  const days = Object.hasOwn(b, 'expiresDays') ? (b.expiresDays === null ? null : Math.min(3650, Math.max(1, +b.expiresDays || 90))) : Object.hasOwn(EXPIRY, b.expires) ? EXPIRY[b.expires] : 90;
  const token = newToken();
  const row = q('INSERT INTO fh_tokens(id,name,scopes,created,user_id,expires) VALUES(?,?,?,?,?,?) RETURNING *').get(tokenKey(token), str(b.name, 60) || 'Token', scopes.join(' '), Date.now(), c.get('user'), days ? Date.now() + days * 86400_000 : null);
  return c.json({ token, ...tokenOut(row) }); // vises én gang
});
// Prompt 33 (SERVER33): companion-token for Kalender-appen (server/kalender33.js). Samme tabell, hash og tokenOut som over.
/** Tilgangen for forespørselen (økt eller fh_-token), eller null. → {user, info, admin, scopes:Set, session, tokenId?} */
export const tokenAccessOf = (c) => access(c);
/** Lager et token for userId. scopes må allerede være kontrollert (aldri bredere enn den som ber om det). → {token, ...tokenOut} */
export function issueToken(userId, { name, scopes, expires = null }) {
  const token = newToken();
  const row = q('INSERT INTO fh_tokens(id,name,scopes,created,user_id,expires) VALUES(?,?,?,?,?,?) RETURNING *').get(tokenKey(token), str(name, 60) || 'Token', scopes.join(' '), Date.now(), userId, expires);
  return { token, fullId: row.id, ...tokenOut(row) };
}
/** Tokenradene (tokenOut-form + fullId) for userId med de fulle id-ene. */
export const tokensById = (userId, fullIds) => (fullIds.length ? q(`SELECT * FROM fh_tokens WHERE COALESCE(user_id, ?)=? AND id IN (${fullIds.map(() => '?').join(',')})`).all(OWNER, userId, ...fullIds).map((t) => ({ fullId: t.id, ...tokenOut(t) })) : []);
/** Trekker tilbake et token (full id) som tilhører userId. → antall slettet */
export const revokeTokenOf = (userId, fullId) => q('DELETE FROM fh_tokens WHERE id=? AND COALESCE(user_id, ?)=?').run(fullId, OWNER, userId).changes;
export { SCOPES as TOKEN_SCOPES };
api.delete('/tokens/:id', tokenAdmin, (c) => { q('DELETE FROM fh_tokens WHERE substr(id,1,12)=? AND COALESCE(user_id, ?)=?').run(c.req.param('id'), OWNER, c.get('user')); return ok(c); });

/* --- Subscription OS --- */

// Pris lagres per trekk. Hvert 2. år: pris/24 per måned og pris/2 per år.
const CYCLES = { monthly: 1, yearly: 12, biennial: 24 };
const cycleIn = (v) => ({ monthly: 'monthly', mnd: 'monthly', yearly: 'yearly', 'år': 'yearly', biennial: 'biennial', '2år': 'biennial' }[v] ?? null);
const monthlyOre = (s) => s.price / (CYCLES[s.cycle] ?? 1);
function subOut(s) {
  return { id: s.id, name: s.name, plan: s.plan, price: s.price / 100, cycle: s.cycle, nextDate: s.next_date, usageNote: s.usage_note, lowUse: !!s.low_use,
    active: !!s.active, domain: s.domain || domainFor(s.name), aiShort: s.ai_short || heuristic({ merchant: s.name, category: 'Abonnementer' }).short, txId: s.tx_id,
    monthly: Math.round(monthlyOre(s)) / 100, yearly: Math.round(monthlyOre(s) * 12) / 100, perLabel: { monthly: '/mnd', yearly: '/år', biennial: '/2 år' }[s.cycle] ?? '/mnd',
    cycleName: { monthly: 'Månedlig', yearly: 'Årlig', biennial: 'Hvert 2. år' }[s.cycle] ?? 'Månedlig',
    status: subsOs.statusOf(s), chargeDay: subsOs.chargeDayOf(s), category: subsOs.categoryFor(s.name, s.category),
    prevPrice: s.prev_price != null ? s.prev_price / 100 : null, priceChanged: s.price_changed ?? null,
    // Prompt 14: faktureringsdato som dag + måned, tilstand (aktiv/sagt opp) og egen logo.
    billDay: subsOs.chargeDayOf(s), billMonth: billMonthOf(s), state: s.active ? 'active' : 'cancelled',
    logoUrl: s.logo_url || null, nextCharge: nextChargeOf(s) };
}
const MON_NB = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
// Måneden for årlige og 2-årige trekk: lagret måned, ellers måneden i neste trekk.
const billMonthOf = (s) => s.bill_month || (s.next_date ? +s.next_date.slice(5, 7) : null);
function nextChargeOf(s) {
  if (!s.next_date || !s.active) return null;
  const then = { monthly: 'deretter hver måned', yearly: 'deretter hvert år', biennial: 'deretter hvert 2. år' }[s.cycle] ?? 'deretter hver måned';
  return { date: s.next_date, label: `Neste trekk ${+s.next_date.slice(8, 10)}. ${MON_NB[+s.next_date.slice(5, 7) - 1]}, ${then}` };
}
const monthIn = (v) => { const n = Math.round(+v); return n >= 1 && n <= 12 ? n : null; };
// Neste trekk fra dag + måned (årlig / hvert 2. år): neste gang den datoen kommer, i år eller senere.
function nextFromDayMonth(day, month) {
  if (!day || !month) return null;
  const now = new Date(), t = new Date(now.toDateString());
  const at = (y) => new Date(y, month - 1, Math.min(day, new Date(y, month, 0).getDate()));
  let d = at(now.getFullYear());
  if (d < t) d = at(now.getFullYear() + 1);
  return d.toLocaleDateString('sv-SE');
}
const nextFor = (day, month, cycle) => (cycle !== 'monthly' && month ? nextFromDayMonth(day, month) : nextFromDay(day, cycle));
// status fra redigeringsarket: active / low_use (Lite brukt) / cancelled / paused (regnes som sagt opp).
function applyStatus(n, st) {
  if (st === 'active' || st === 'Aktiv') { n.active = 1; n.low_use = 0; }
  else if (st === 'low_use' || st === 'Lite brukt') { n.active = 1; n.low_use = 1; }
  else if (st === 'cancelled' || st === 'paused' || st === 'Sagt opp') n.active = 0;
}
const logoUrlIn = (v) => { const t = String(v ?? '').trim(); return /^\/finans\/api\/(?:logo\/[a-z0-9.-]+|subscriptions\/\d+\/logo(?:\?v=\d+)?|merchants\/logo\/file\/[a-z0-9-]+\.png(?:\?v=\d+)?|logos\/file\/[a-z0-9-]+)$/i.test(t) || /^https:\/\/[^\s"'<>]{4,400}$/.test(t) ? t : null; };
const dayIn = (v) => { const n = Math.round(+v); return n >= 1 && n <= 31 ? n : null; };
const catIn = (v) => (subsOs.SUB_CATEGORIES.includes(v) ? v : null);
// Neste trekk fra trekkdag: denne måneden hvis dagen ikke er passert, ellers neste.
function nextFromDay(day, cycle = 'monthly') {
  if (!day) return null;
  const now = new Date(), t = new Date(now.toDateString());
  const at = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  let d = at(now.getFullYear(), now.getMonth());
  if (d < t) d = at(now.getFullYear(), now.getMonth() + 1);
  return d.toLocaleDateString('sv-SE');
}
// Neste trekk kan skrives som dd.mm, dd.mm.åå eller ISO.
function dateIn(v) {
  const t = String(v ?? '').trim();
  if (!t || t === '–') return null;
  if (isDate(t)) return t;
  const m = t.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!m) return null;
  const now = new Date();
  let y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
  let d = new Date(y, +m[2] - 1, +m[1]);
  if (!m[3] && d < new Date(now.toDateString())) d = new Date(y + 1, +m[2] - 1, +m[1]);
  return d.toLocaleDateString('sv-SE');
}

api.get('/subscriptions', R, (c) => {
  const uid = c.get('user');
  const ownRows = subsOs.priceCheck(q('SELECT * FROM fh_subscriptions WHERE user_id=? ORDER BY active DESC, COALESCE(next_date, \'9999\'), name').all(uid));
  // Prompt 37: også delte abonnementer brukeren er medlem av; totaler, graf og kalender bruker «din del».
  const sharedRows = visibleSubs(uid).filter((x) => x.user_id !== uid);
  const full = [...ownRows, ...sharedRows].sort((a, b) => (b.active - a.active) || String(a.next_date ?? '9999').localeCompare(String(b.next_date ?? '9999')) || String(a.name).localeCompare(String(b.name), 'nb'));
  const rows = full.map((x) => decorateSub(subOut(x), x, uid));
  const raw = full.map((x) => asShare(x, uid));
  const act = rows.filter((s) => s.active);
  const monthly = act.reduce((a, s) => a + s.myShareMonthly, 0);
  const now = new Date(), year = +c.req.query('year') || now.getFullYear();
  const ym = (d) => d.toLocaleDateString('sv-SE').slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(c.req.query('month') ?? '') ? c.req.query('month') : ym(now);
  const prevMonth = ym(new Date(+month.slice(0, 4), +month.slice(5, 7) - 2, 1));
  const sum = (list) => Math.round(list.reduce((a, x) => a + x.amount, 0) * 100) / 100;
  const thisMonth = subsOs.chargesInMonth(raw, month);
  // Trend: samme sum som den var ved starten av måneden (uten nye abonnementer og med pris før en økning denne måneden).
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1), mIso = mStart.toLocaleDateString('sv-SE');
  const prevMonthly = raw.filter((s) => s.active && s.created < mStart.getTime())
    .reduce((a, s) => a + (s.prev_price && s.price_changed >= mIso ? s.prev_price : s.price) / (CYCLES[s.cycle] ?? 1), 0) / 100;
  const trials = trialsFor(uid);
  const ifKept = trials.reduce((a, t) => a + (t.priceAfter ?? 0), 0);
  return c.json({ items: rows, monthly: Math.round(monthly * 100) / 100, yearly: Math.round(act.reduce((a, x) => a + x.myShareMonthly * 12, 0) * 100) / 100,
    lowUse: Math.round(act.filter((s) => s.lowUse).reduce((a, s) => a + s.myShareMonthly, 0) * 100) / 100,
    trialsSummary: { count: trials.length, ifKept: Math.round(ifKept * 100) / 100, label: trials.length ? `+${Math.round(ifKept)} kr/mnd hvis du beholder` : null }, // prompt 37
    categories: subsOs.SUB_CATEGORIES, year, byMonth: subsOs.byMonth(raw, year), health: subsOs.health(raw), savings: subsOs.savings(raw),
    prevMonthly: Math.round(prevMonthly * 100) / 100, upcoming: subsOs.upcoming(raw, 7), month, thisMonth, monthTotal: sum(thisMonth), prevMonthTotal: sum(subsOs.chargesInMonth(raw, prevMonth)),
    today: now.toLocaleDateString('sv-SE'),
    trials, // prompt 31: aktive prøveperioder («Prøve · 12 dager igjen»)
    trialsVisible: trialsVisible46(uid) }); // prompt 46: {visible, count, editHint} – seksjonen skjules uten aktive prøveperioder
});
api.get('/subscriptions/candidates', R, (c) => c.json(subsOs.candidates(q('SELECT * FROM fh_subscriptions WHERE user_id=?').all(c.get('user')))
  .map((x) => ({ ...x, domain: x.domain || domainFor(x.merchant) }))));
api.post('/subscriptions', W, async (c) => {
  const b = await c.req.json();
  if (b.fromTx) { // gjør en transaksjon om til et abonnement
    const t = own('fh_transactions', +b.fromTx);
    if (!t) return c.notFound();
    const name = t.merchant || t.description;
    const s = q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,domain,ai_short,tx_id,created,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
      .get(name, str(b.plan, 80), Math.abs(t.amount), 'monthly', shiftDate(t.date, 1), 'Månedlig', t.domain || domainFor(name), t.ai_short, t.id, Date.now(), c.get('user'));
    return c.json(subOut(s));
  }
  if (b.fromCandidate) { // ✦ Fra transaksjoner: et fast trekk som ikke er registrert ennå
    const k = b.fromCandidate, name = str(k.merchant, 80), price = ore(k.amount), cycle = cycleIn(k.cycle) ?? 'monthly';
    if (!name || price === null) return bad(c, 'Mangler navn eller beløp');
    const last = isDate(k.lastDate) ? k.lastDate : null;
    let next = last ? shiftDate(last, CYCLES[cycle]) : null;
    while (next && next < new Date().toLocaleDateString('sv-SE')) next = shiftDate(next, CYCLES[cycle]);
    const s = q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,domain,tx_id,charge_day,category,created,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
      .get(name, str(k.plan, 80), Math.abs(price), cycle, next, `Funnet i banken · ${Math.max(0, Math.round(+k.count) || 0)} trekk`, validDomain(k.domain) || domainFor(name),
        Number.isInteger(+k.txId) && +k.txId > 0 && own('fh_transactions', +k.txId) ? +k.txId : null, last ? +last.slice(8, 10) : null, subsOs.categoryFor(name), Date.now(), c.get('user'));
    return c.json(subOut(s));
  }
  const price = ore(b.price);
  if (!str(b.name) || price === null) return bad(c, 'Tjeneste og pris må fylles ut');
  const cycle = cycleIn(b.cycle) ?? 'monthly', day = dayIn(b.billDay ?? b.chargeDay), month = monthIn(b.billMonth);
  const st = { active: 1, low_use: b.lowUse ? 1 : 0 };
  if (b.status !== undefined) applyStatus(st, b.status);
  const s = q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,low_use,active,domain,charge_day,bill_month,category,logo_url,created,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(str(b.name, 80), str(b.plan, 80), Math.abs(price), cycle, dateIn(b.nextDate) ?? nextFor(day, month, cycle), str(b.usageNote, 80) || 'Ny', st.low_use, st.active,
      validDomain(b.domain) || domainFor(b.name), day, cycle === 'monthly' ? null : month, catIn(b.category), logoUrlIn(b.logoUrl), Date.now(), c.get('user'));
  return c.json(subOut(s));
});
api.post('/subscriptions/receipts', need('receipts:write'), upload, (c) => receiptUpload(c, 'sub'));
api.patch('/subscriptions/:id', W, async (c) => {
  const cur = editableSub(+c.req.param('id'), c.get('user')); // prompt 37: eier eller betaler av et delt abonnement
  if (!cur) return c.notFound();
  const b = await c.req.json();
  const n = { ...cur };
  if (b.name !== undefined) n.name = str(b.name, 80) || cur.name;
  if (b.plan !== undefined) n.plan = str(b.plan, 80);
  if (b.price !== undefined && ore(b.price) !== null) n.price = Math.abs(ore(b.price));
  if (n.price > cur.price) { n.prev_price = cur.price; n.price_changed = new Date().toLocaleDateString('sv-SE'); } // «Pris økt» også når prisen endres for hånd
  if (b.cycle !== undefined) n.cycle = cycleIn(b.cycle) ?? cur.cycle;
  const dayV = b.billDay !== undefined ? b.billDay : b.chargeDay;
  if (dayV !== undefined) n.charge_day = dayIn(dayV);
  if (b.billMonth !== undefined) n.bill_month = monthIn(b.billMonth);
  if (n.cycle === 'monthly') n.bill_month = null;
  // Ny dag, måned eller syklus: regn ut neste trekk på nytt (med mindre nextDate er sendt med).
  if ((dayV !== undefined || b.billMonth !== undefined || b.cycle !== undefined) && b.nextDate === undefined && n.charge_day) n.next_date = nextFor(n.charge_day, n.bill_month, n.cycle);
  if (b.category !== undefined) n.category = catIn(b.category);
  if (b.status !== undefined) applyStatus(n, b.status);
  if (b.logoUrl !== undefined) n.logo_url = b.logoUrl ? logoUrlIn(b.logoUrl) : null;
  if (b.nextDate !== undefined) n.next_date = dateIn(b.nextDate);
  if (b.usageNote !== undefined) n.usage_note = str(b.usageNote, 80);
  if (b.lowUse !== undefined) n.low_use = b.lowUse ? 1 : 0;
  if (b.active !== undefined) n.active = b.active ? 1 : 0;
  if (b.domain !== undefined) { n.domain = validDomain(b.domain); if (n.domain) learnDomain(n.name, n.domain); }
  const s = q('UPDATE fh_subscriptions SET name=?, plan=?, price=?, cycle=?, next_date=?, usage_note=?, low_use=?, active=?, domain=?, charge_day=?, bill_month=?, category=?, prev_price=?, price_changed=?, logo_url=? WHERE id=? RETURNING *')
    .get(n.name, n.plan, n.price, n.cycle, n.next_date, n.usage_note, n.low_use, n.active, n.domain, n.charge_day, n.bill_month ?? null, n.category, n.prev_price, n.price_changed, n.logo_url ?? null, cur.id);
  return c.json(decorateSub(subOut(s), s, c.get('user')));
});
api.delete('/subscriptions/:id', W, async (c) => {
  const id = +c.req.param('id');
  if (!q('DELETE FROM fh_subscriptions WHERE id=? AND user_id=?').run(id, c.get('user')).changes) return ok(c);
  for (const ext of ['png', 'jpg', 'webp', 'svg']) await unlink(join(SUB_LOGOS, `${id}.${ext}`)).catch(() => {});
  return ok(c);
});
// Egen logo per abonnement: lastes opp (bilde), eller ✦ AI finner tjenestens domene og logoen hentes derfra.
const SUB_LOGOS = resolve(config.dataDir, 'finans', 'sublogos');
const LOGO_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const sniffLogo = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'webp' : null);
api.post('/subscriptions/:id/logo', W, bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => bad(c, 'Logoen kan være maks 4 MB', 413) }), async (c) => {
  const s = own('fh_subscriptions', +c.req.param('id'));
  if (!s) return c.notFound();
  const f = (await c.req.parseBody()).file;
  if (!(f instanceof File) || !f.size) return bad(c, 'Velg et bilde');
  const buf = Buffer.from(await f.arrayBuffer()), ext = sniffLogo(buf);
  if (!ext) return bad(c, 'Logoen må være PNG, JPEG eller WebP');
  await mkdir(SUB_LOGOS, { recursive: true });
  for (const e of Object.keys(LOGO_TYPES)) if (e !== ext) await unlink(join(SUB_LOGOS, `${s.id}.${e}`)).catch(() => {});
  await writeFile(join(SUB_LOGOS, `${s.id}.${ext}`), buf);
  const logoUrl = `/finans/api/subscriptions/${s.id}/logo?v=${Date.now()}`;
  q('UPDATE fh_subscriptions SET logo_url=? WHERE id=?').run(logoUrl, s.id);
  return c.json({ logoUrl, domain: s.domain || domainFor(s.name) || null, subscription: subOut(q('SELECT * FROM fh_subscriptions WHERE id=?').get(s.id)) });
});
api.get('/subscriptions/:id/logo', R, async (c) => {
  const id = +c.req.param('id');
  if (!own('fh_subscriptions', id)) return c.notFound();
  for (const [ext, type] of Object.entries(LOGO_TYPES)) {
    const buf = await readFile(join(SUB_LOGOS, `${id}.${ext}`)).catch(() => null);
    if (buf) return c.body(buf, 200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
  }
  return c.notFound();
});
// ✦ Finn logo med AI: kjent domene fra navnet, ellers spør AI-motoren om tjenestens nettsted. Logoen hentes via /logo/:domain.
let subLogoAsk = null;   // tester kan sette en egen «AI»
export const _setSubLogoAsk = (fn) => { subLogoAsk = fn; };
api.post('/subscriptions/:id/logo/ai', W, async (c) => {
  const s = own('fh_subscriptions', +c.req.param('id'));
  if (!s) return c.notFound();
  // Prompt 27: logo-kjeden (merchant_logos → rydd navnet → Brreg → Gemini med bare navnet → gjett domene → ikon). Ingen
  // AI-skrevne URL-er; bare domener som er sjekket. Klientens navn (redigeringsarket) brukes hvis det er sendt.
  const b0 = await c.req.json().catch(() => ({}));
  const chain = subLogoAsk ? null : await findLogo(str(b0.name, 120) || s.name, { force: true, u: c.get('user') }).catch(() => null);
  if (chain && !chain.none && chain.logoUrl) {
    if (chain.domain) learnDomain(s.name, chain.domain);
    q('UPDATE fh_subscriptions SET logo_url=?, domain=coalesce(?, domain) WHERE id=?').run(chain.logoUrl, chain.domain, s.id);
    return c.json({ logoUrl: chain.logoUrl, domain: chain.domain, source: chain.source, subscription: subOut(q('SELECT * FROM fh_subscriptions WHERE id=?').get(s.id)) });
  }
  const cands = [validDomain(s.domain), domainFor(s.name)].filter(Boolean);
  let domain = null;
  for (const d of cands) if (await logo(d)) { domain = d; break; }
  if (!domain && subLogoAsk) {
    let ai = null;
    try {
      const { askJson } = await import('./ai.js');
      ai = await (subLogoAsk ?? askJson)(`Hva er det offisielle nettstedet (domenet) til abonnementstjenesten «${s.name}»${s.plan ? ` (plan: ${s.plan})` : ''}? Tjenesten brukes i Norge. Svar KUN med JSON {"domain":"eksempel.no"}. Er du usikker, svar {"domain":null}.`,
        { type: 'object', properties: { domain: { type: ['string', 'null'] } }, required: ['domain'] }, { timeout: 20_000 });
    } catch { ai = null; }
    const d = validDomain(String(ai?.domain ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);
    if (d && (await logo(d))) domain = d;
  }
  if (!domain) return c.json({ error: 'Fant ingen logo. Last opp et bilde i stedet.', logoUrl: null, domain: null }, 404);
  learnDomain(s.name, domain);
  const logoUrl = `/finans/api/logo/${domain}`;
  q('UPDATE fh_subscriptions SET logo_url=?, domain=? WHERE id=?').run(logoUrl, domain, s.id);
  return c.json({ logoUrl, domain, subscription: subOut(q('SELECT * FROM fh_subscriptions WHERE id=?').get(s.id)) });
});

/* --- Delte mapper (boliger og felles utgifter) --- */
// Medlemmer er brukere i homelab (user_id) med rolle: owner = Eier, editor = Kan redigere, viewer = Kan se.
// Eldre mapper kan også ha navngitte personer uten innlogging (user_id null); de kan stå som betaler, men ser ikke mappen.
// Brukere ser bare mapper de er medlem av. Saldo = betalt − andel (likt delt eller egen fordelingsnøkkel).

export const FOLDER_CATS = [['Strøm', '#F2C14E'], ['Vann og avløp', '#7AA7FF'], ['Hage og uteområde', '#5FD3A8'], ['Håndverker', '#FF7A3D'], ['Basseng', '#4FC3E8'],
  ['Kommunale avgifter', '#B79CFF'], ['Vedlikehold', '#FFB08A'], ['Forsikring', '#A0A0AA'], ['Dagligvarer', '#C9E265'], ['Annet', '#6E6E78']];
const FCAT = Object.fromEntries(FOLDER_CATS);
const FOLDER_TYPES = ['Enebolig', 'Leilighet', 'Hytte', 'Utleie', 'Annet'];
const ROLES = { owner: 'Eier', editor: 'Kan redigere', viewer: 'Kan se' };
const ROLE_IN = { Eier: 'owner', 'Kan redigere': 'editor', 'Kan laste opp': 'editor', 'Kan se': 'viewer', owner: 'owner', editor: 'editor', uploader: 'editor', viewer: 'viewer', member: 'editor' };
const FREQS = ['Månedlig', 'Kvartalsvis', 'Halvårlig', 'Årlig', 'Annenhver måned'];
export function folderCategory(text) {
  const s = String(text ?? '');
  return /basseng|pool|spa\b/i.test(s) ? 'Basseng' : /snekker|bygg|elektriker|rørlegger|maler|håndverk/i.test(s) ? 'Håndverker'
    : /fjordkraft|tibber|strøm|hafslund|elvia|nettleie/i.test(s) ? 'Strøm' : /vann|avløp/i.test(s) ? 'Vann og avløp'
    : /plantasjen|mester grønn|blomst|hage|jord|gjødsel|plen|planter/i.test(s) ? 'Hage og uteområde'
    : /kommun|renovasjon|eiendomsskatt|feiing|avgift/i.test(s) ? 'Kommunale avgifter' : /forsikring|gjensidige|if skade|tryg|fremtind/i.test(s) ? 'Forsikring'
    : /rema|kiwi|meny|coop|extra|joker|bunnpris|spar\b/i.test(s) ? 'Dagligvarer' : /biltema|jernia|clas ohlson|obs bygg|maxbo|byggmakker|ikea|ved|pellets|maling|vedlikehold/i.test(s) ? 'Vedlikehold' : 'Annet';
}
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

const memberOf = (fid, uid) => q('SELECT * FROM fh_folder_members WHERE folder_id=? AND user_id=?').get(fid, uid);
// Henter mappen og sjekker tilgang. need: 'view' | 'edit' | 'owner'.
function folderFor(c, need = 'view', id = c.req.param('id')) {
  const f = q('SELECT * FROM fh_folders WHERE id=?').get(+id);
  if (!f) return { err: c.json({ error: 'Fant ikke boligen' }, 404) };
  const m = memberOf(f.id, c.get('user'));
  if (!m) return { err: c.json({ error: 'Fant ikke boligen' }, 404) };
  if (need === 'edit' && m.role === 'viewer') return { err: bad(c, 'Du har lesetilgang. Be en eier om redigeringstilgang.', 403) };
  if (need === 'owner' && m.role !== 'owner') return { err: bad(c, 'Bare eiere kan endre deling og innstillinger for boligen', 403) };
  if (need !== 'view' && !c.get('access').scopes.has('finance:write') && !c.get('access').session) return { err: bad(c, 'Tokenet mangler tilgangen finance:write', 403) };
  return { f, me: m };
}
const displayName = (u) => u?.name || u?.username || 'Ukjent';
function splitWeights(f, members) {
  let w = null; try { w = f.split && f.split !== 'equal' ? JSON.parse(f.split) : null; } catch { /* likt */ }
  return Object.fromEntries(members.map((m) => [m.name, w && Number.isFinite(+w[m.name]) ? Math.max(0, +w[m.name]) : 1]));
}

// Slettede brukere: navnet beholdes som betaler, men koblingen til kontoen fjernes (og dubletter slås sammen).
function pruneMembers(fid) {
  const ids = new Set(listUsers().map((u) => u.id));
  for (const m of q('SELECT * FROM fh_folder_members WHERE folder_id=? AND user_id IS NOT NULL').all(fid)) {
    if (ids.has(m.user_id)) continue;
    if (q('SELECT 1 FROM fh_folder_members WHERE folder_id=? AND name=? AND id<>?').get(fid, m.name, m.id)) q('DELETE FROM fh_folder_members WHERE id=?').run(m.id);
    else q('UPDATE fh_folder_members SET user_id=NULL WHERE id=?').run(m.id);
  }
}
function folderOut(f, uid, full = false) {
  pruneMembers(f.id);
  linkLegacy();
  const mem = q("SELECT * FROM fh_folder_members WHERE folder_id=? ORDER BY role='owner' DESC, id").all(f.id);
  const me = mem.find((m) => m.user_id === uid);
  const year = new Date().getFullYear(), ys = `${year}-01-01`;
  const entries = q('SELECT e.*, p.name AS project FROM fh_folder_entries e LEFT JOIN fh_folder_projects p ON p.id=e.project_id WHERE e.folder_id=? ORDER BY e.date DESC, e.id DESC').all(f.id);
  const yearRows = entries.filter((e) => e.date >= ys);
  const yearTotal = yearRows.reduce((a, e) => a + e.amount, 0);
  const out = { id: f.id, name: f.name, type: f.type, address: f.address, myRole: me ? ROLES[me.role] : null, role: me?.role ?? null,
    members: mem.map((m) => ({ id: m.id, userId: m.user_id, name: m.name, email: m.email, role: m.role, roleName: ROLES[m.role] ?? 'Kan redigere', you: m.user_id === uid, login: !!m.user_id })),
    total: entries.reduce((a, e) => a + e.amount, 0) / 100, yearTotal: yearTotal / 100, count: entries.length,
    budget: f.budget == null ? null : f.budget / 100, color: f.color ?? null, autoCat: f.auto_cat !== 0, notify: f.notify !== 0,
    review: entries.filter((e) => e.status === 'review').length, ...backgroundOf(f), mailAddress: mailAddress42(f) }; // prompt 42: «Send fra e-post»
  if (!full) return out;
  out.canEdit = !!me && me.role !== 'viewer';
  out.isOwner = me?.role === 'owner';
  out.owners = mem.filter((m) => m.role === 'owner').length;
  // Fordeling: likt eller egen nøkkel, saldo = betalt − andel.
  const weights = splitWeights(f, mem), wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const total = entries.reduce((a, e) => a + e.amount, 0);
  out.split = f.split === 'equal' ? 'equal' : 'custom';
  out.weights = weights;
  out.balances = mem.map((m) => {
    const paid = entries.filter((e) => e.paid_by === m.name).reduce((a, e) => a + e.amount, 0);
    return { name: m.name, paid: paid / 100, share: Math.round((total * weights[m.name]) / wsum) / 100, balance: Math.round(paid - (total * weights[m.name]) / wsum) / 100 };
  });
  // Utgifter per måned i år, delt på kategori.
  const nowM = new Date().getMonth();
  out.months = Array.from({ length: nowM + 1 }, (_, i) => {
    const mm = `${year}-${String(i + 1).padStart(2, '0')}`;
    const rows = yearRows.filter((e) => e.date.startsWith(mm));
    const by = {};
    for (const e of rows) { const k = entryCat(e).category; by[k] = (by[k] ?? 0) + e.amount / 100; }
    return { month: mm, label: MONTHS_SHORT[i], total: rows.reduce((a, e) => a + e.amount, 0) / 100, byCat: by };
  });
  // Kategorikortet: hovedkategoriene, hver med fordeling på underkategorier («Uten underkategori» når posten bare har hovedkategori).
  const catSum = {}, catMeta = {};
  for (const e of yearRows) {
    const ec = entryCat(e), k = ec.category;
    const g = (catSum[k] ??= { sum: 0, subs: {} });
    g.sum += e.amount / 100;
    const sk = ec.subcategory ?? '';
    g.subs[sk] = (g.subs[sk] ?? 0) + e.amount / 100;
    catMeta[k] ??= { color: ec.color, id: catPair(ec.categoryId).top?.id ?? null };
  }
  out.categories = Object.entries(catSum).sort((a, b) => b[1].sum - a[1].sum).map(([name, g]) => ({ id: catMeta[name].id, name, sum: g.sum, color: catMeta[name].color,
    pct: yearTotal ? (g.sum * 100) / (yearTotal / 100) : 0,
    subs: Object.entries(g.subs).filter(([sk]) => sk || Object.keys(g.subs).length > 1).sort((a, b) => b[1] - a[1]).map(([sk, sum]) => ({ name: sk || 'Uten underkategori', sum, pct: g.sum ? (sum * 100) / g.sum : 0 })) }));
  const strom = (m) => out.months[m]?.byCat['Strøm'] ?? 0;
  const projects = q('SELECT * FROM fh_folder_projects WHERE folder_id=? ORDER BY id').all(f.id).map((p) => {
    const spent = entries.filter((e) => e.project_id === p.id).reduce((a, e) => a + e.amount, 0) / 100;
    const inst = q('SELECT * FROM fh_project_installments WHERE project_id=? ORDER BY sort, id').all(p.id);
    return { id: p.id, name: p.name, vendor: p.vendor, category: p.category, status: p.status ?? 'Pågår', ownColor: p.color ?? null, color: p.color ?? colorOf(p.category) ?? FCAT[p.category] ?? '#FF7A3D', budget: p.budget / 100, // prompt 42: status/farge spent, used: spent, paid: spent, remaining: p.budget / 100 - spent,
      installments: inst.map((x) => ({ id: x.id, label: x.label, due: x.due, amount: x.amount / 100, paid: !!x.paid_at, paidAt: x.paid_at })) };
  });
  out.projects = projects;
  out.bills = q('SELECT * FROM fh_folder_bills WHERE folder_id=? ORDER BY id').all(f.id).map((b) => {
    const last = entries.find((e) => entryCat(e).category === b.category);
    return { id: b.id, name: b.name, category: b.category, color: colorOf(b.category) ?? FCAT[b.category] ?? '#A0A0AA', freq: b.freq, payer: b.payer, nextDue: b.next_due, last: last ? { amount: last.amount / 100, date: last.date } : null };
  });
  const months = nowM + 1;
  out.kpi = { yearTotal: yearTotal / 100, count: yearRows.length, perMonth: Math.round(yearTotal / months) / 100, months,
    stromYear: Object.values(out.months).reduce((a, m) => a + (m.byCat['Strøm'] ?? 0), 0), stromNow: strom(nowM), stromPrev: strom(nowM - 1),
    projectsLeft: projects.reduce((a, p) => a + Math.max(0, p.remaining), 0), projectNames: projects.map((p) => p.name), catCount: out.categories.length,
    review: out.review, budget: out.budget, budgetLeft: out.budget == null ? null : Math.round(out.budget * 100 - yearTotal) / 100 };
  out.entries = entries.map((e) => {
    const t = e.tx_id ? q('SELECT ai_short, domain FROM fh_transactions WHERE id=?').get(e.tx_id) : null;
    const r = e.receipt_id ? origSelect.get(e.receipt_id) : null;
    const pending = r && (r.status === 'pending' || r.status === 'processing');
    return { id: e.id, description: e.description, date: e.date, amount: e.amount / 100, paidBy: e.paid_by, ...entryCat(e), project: e.project, projectId: e.project_id,
      txId: e.tx_id, receiptId: e.receipt_id, editedBy: e.edited_by ?? null, editedAt: e.edited_at ?? null, pending: !!pending, status: e.status === 'review' ? 'review' : 'ok', domain: t?.domain || r?.domain || domainFor(e.description),
      aiShort: pending ? 'Gemini leser kvitteringen …' : t?.ai_short || r?.ai_short || heuristic({ merchant: e.description, amount: -e.amount / 100 }).short };
  });
  // Hovedkategorier (prosjekter og faste regninger) og hele treet med ID-er (utgifter).
  out.catOptions = catTree().map((t) => t.name);
  out.catTree = catOptions();
  out.layout = layoutFor(uid);
  out.upcoming = upcomingOf(out);
  // Kvitteringer i boligen (nyeste først), med bilde via boligens egen rute så også de som bare har Boliger-tilgang ser dem.
  out.receipts = out.entries.filter((e) => e.receiptId).map((e) => ({ entryId: e.id, receiptId: e.receiptId, description: e.description, date: e.date, amount: e.amount, pending: e.pending,
    category: e.categoryLabel ?? e.category, color: e.color, thumbUrl: `/finans/api/folders/${f.id}/receipts/${e.receiptId}/thumb`, fileUrl: `/finans/api/folders/${f.id}/receipts/${e.receiptId}/file` }));
  out.notices = noticesFor(f.id, Date.now() - 10 * 60_000);
  out.types = FOLDER_TYPES; out.freqs = FREQS;
  return out;
}
const fullOut = (c, f) => c.json(folderOut(q('SELECT * FROM fh_folders WHERE id=?').get(f.id), c.get('user'), true));

api.route('/boliger', bolApi);
api.get('/folders', (c) => c.json(q('SELECT f.* FROM fh_folders f JOIN fh_folder_members m ON m.folder_id=f.id AND m.user_id=? ORDER BY f.id').all(c.get('user')).map((f) => folderOut(f, c.get('user')))));
api.get('/folders/:id', (c) => { const { f, err } = folderFor(c); return err ?? fullOut(c, f); });
api.post('/folders', async (c) => {
  if (!c.get('access').session && !c.get('access').scopes.has('finance:write')) return bad(c, 'Tokenet mangler tilgangen finance:write', 403);
  const b = await c.req.json();
  if (!str(b.name)) return bad(c, 'Gi boligen et navn');
  const type = FOLDER_TYPES.includes(b.type) ? b.type : 'Annet';
  const me = c.get('access').info;
  const f = q('INSERT INTO fh_folders(name,type,address,owner_id,created) VALUES(?,?,?,?,?) RETURNING *').get(str(b.name, 60), type, str(b.address, 120), me.id, Date.now());
  const add = q('INSERT INTO fh_folder_members(folder_id,name,email,role,status,user_id) VALUES(?,?,?,?,?,?)');
  add.run(f.id, displayName(me), null, 'owner', 'active', me.id);
  const users = new Map(listUsers().map((u) => [u.id, u]));
  for (const x of (Array.isArray(b.share) ? b.share : [])) {
    const id = typeof x === 'object' ? x.userId : x, u = users.get(id);
    if (u && u.id !== me.id && !memberOf(f.id, u.id)) add.run(f.id, displayName(u), null, ROLE_IN[x.role] ?? 'editor', 'active', u.id);
  }
  // Boliger får de vanlige faste regningene som utgangspunkt.
  if (type !== 'Annet') {
    const bill = q('INSERT INTO fh_folder_bills(folder_id,name,category,freq) VALUES(?,?,?,?)');
    for (const [n, cat, fr] of [['Strømleverandør', 'Strøm', 'Månedlig'], ['Kommunen', 'Vann og avløp', 'Kvartalsvis'], ['Kommunen', 'Kommunale avgifter', 'Årlig'], ['Forsikringsselskap', 'Forsikring', 'Årlig']]) bill.run(f.id, n, cat, fr);
  }
  return fullOut(c, f);
});
api.patch('/folders/:id', async (c) => {
  const { f, err } = folderFor(c, 'owner'); if (err) return err;
  const b = await c.req.json();
  if (str(b.name)) q('UPDATE fh_folders SET name=? WHERE id=?').run(str(b.name, 60), f.id);
  if (FOLDER_TYPES.includes(b.type)) q('UPDATE fh_folders SET type=? WHERE id=?').run(b.type, f.id);
  if (b.address !== undefined) q('UPDATE fh_folders SET address=? WHERE id=?').run(str(b.address, 120), f.id);
  // Prompt 17: budsjett i kr (null fjerner), farge #rrggbb (null fjerner), automatisk kategorisering og varsler.
  if (b.budget !== undefined) {
    if (b.budget === null || b.budget === '') q('UPDATE fh_folders SET budget=NULL WHERE id=?').run(f.id);
    else { const v = ore(b.budget); if (v === null || v < 0) return bad(c, 'Budsjettet må være et beløp i kr'); q('UPDATE fh_folders SET budget=? WHERE id=?').run(v, f.id); }
  }
  if (b.color !== undefined) {
    if (b.color !== null && !/^#[0-9a-f]{6}$/i.test(String(b.color))) return bad(c, 'Farge må være #rrggbb');
    q('UPDATE fh_folders SET color=? WHERE id=?').run(b.color, f.id);
  }
  if (b.autoCat !== undefined) q('UPDATE fh_folders SET auto_cat=? WHERE id=?').run(b.autoCat ? 1 : 0, f.id);
  if (b.notify !== undefined) q('UPDATE fh_folders SET notify=? WHERE id=?').run(b.notify ? 1 : 0, f.id);
  // Prompt 24: bakgrunn 'color' | 'preset:stromstad' | 'upload:<versjon>' (må være lastet opp med PUT /folders/:id/bg). null = standard.
  if (b.background !== undefined) {
    if (b.background !== null && !validBackground(b.background)) return bad(c, "Bakgrunn må være 'color', 'preset:stromstad' eller 'upload:<id>'");
    if (typeof b.background === 'string' && b.background.startsWith('upload:') && kv.get(OWNER, `fh_bg_${f.id}`, null) !== b.background.slice(7)) return bad(c, 'Fant ikke det opplastede bildet. Last opp med PUT /folders/:id/bg.');
    q('UPDATE fh_folders SET background=? WHERE id=?').run(b.background, f.id);
  }
  if (b.split === 'equal') q("UPDATE fh_folders SET split='equal' WHERE id=?").run(f.id);
  else if (b.split && typeof b.split === 'object') q('UPDATE fh_folders SET split=? WHERE id=?').run(JSON.stringify(Object.fromEntries(Object.entries(b.split).slice(0, 30).map(([k, v]) => [str(k, 40), Math.max(0, Math.min(1000, +v || 0))]))), f.id);
  return fullOut(c, f);
});
// Bakgrunnsbilde per bolig (prompt 24): multipart (file/image/photo), image/* eller JSON {image: base64/data-URL}.
// Skaleres til maks 1200 px og lagres i DATA_DIR/boliger/<id>/bg.jpg. Eier laster opp; alle medlemmer kan hente det.
const BOLIG_BG_MAX = 12 * 1024 * 1024;
const bgFile = (id) => join(config.dataDir, 'boliger', String(Number(id)), 'bg.jpg');
const bgKind = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg' : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
  : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null);
let magickCmd;
async function magick() {
  if (magickCmd !== undefined) return magickCmd;
  const { execFile } = await import('node:child_process');
  for (const cmd of ['magick', 'convert']) {
    if (await new Promise((r) => execFile(cmd, ['-version'], { timeout: 5000 }, (e) => r(!e)))) return (magickCmd = cmd);
  }
  return (magickCmd = null);
}
async function shrinkBg(buf) {
  const cmd = await magick();
  if (!cmd) return buf;
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const p = spawn(cmd, ['-', '-auto-orient', '-resize', '1200x1200>', '-strip', '-quality', '82', 'jpg:-'], { timeout: 30_000 });
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', () => resolve(buf));
    p.on('close', (code) => { const r = Buffer.concat(out); resolve(code === 0 && bgKind(r) ? r : buf); });
    p.stdin.on('error', () => {});
    p.stdin.end(buf);
  });
}
api.put('/folders/:id/bg', bodyLimit({ maxSize: BOLIG_BG_MAX * 1.4, onError: (c) => bad(c, 'Bildet er for stort (maks 12 MB)', 413) }), async (c) => {
  const { f, err } = folderFor(c, 'owner'); if (err) return err;
  let buf = null;
  const type = c.req.header('content-type') ?? '';
  if (/multipart\/form-data/i.test(type)) {
    const form = await c.req.parseBody().catch(() => ({}));
    const file = form.file ?? form.image ?? form.photo;
    if (file instanceof File) buf = Buffer.from(await file.arrayBuffer());
    else if (typeof file === 'string') buf = Buffer.from(file.replace(/^data:image\/[\w+.-]+;base64,/, ''), 'base64');
  } else if (/^image\//i.test(type)) buf = Buffer.from(await c.req.arrayBuffer());
  else {
    const b = await c.req.json().catch(() => ({}));
    const raw = b.image ?? b.photo ?? b.data;
    if (typeof raw === 'string') buf = Buffer.from(raw.replace(/^data:image\/[\w+.-]+;base64,/, ''), 'base64');
  }
  if (!buf?.length) return bad(c, 'Mangler bilde (multipart «file», image/* eller JSON {image: base64})');
  if (buf.length > BOLIG_BG_MAX) return bad(c, 'Bildet er for stort (maks 12 MB)', 413);
  if (!bgKind(buf)) return bad(c, 'Bruk et JPEG-, PNG- eller WebP-bilde');
  const out = await shrinkBg(buf);
  await mkdir(join(config.dataDir, 'boliger', String(f.id)), { recursive: true });
  await writeFile(bgFile(f.id), out);
  const v = randomBytes(6).toString('hex');
  kv.set(OWNER, `fh_bg_${f.id}`, v);
  q('UPDATE fh_folders SET background=? WHERE id=?').run(`upload:${v}`, f.id);
  return c.json({ ok: true, bytes: out.length, resized: out !== buf, ...backgroundOf(q('SELECT * FROM fh_folders WHERE id=?').get(f.id)) });
});
api.get('/folders/:id/bg', async (c) => {
  const { f, err } = folderFor(c); if (err) return err;
  try {
    const b = await readFile(bgFile(f.id));
    return c.body(b, 200, { 'Content-Type': bgKind(b) ?? 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.json({ error: 'Ingen bakgrunnsbilde' }, 404); }
});
api.delete('/folders/:id', (c) => { const { f, err } = folderFor(c, 'owner'); if (err) return err; q('DELETE FROM fh_folders WHERE id=?').run(f.id); return ok(c); });
// Del med en bruker (eier). Bakoverkompatibelt: /invite med navn legger til en navngitt person uten innlogging.
// Prompt 30: {userIds[], role} deler med flere på én gang (rutenettet «Brukere i Homelab»), og mottakerne får push.
api.post('/folders/:id/members', async (c) => {
  const { f, me: mine, err } = folderFor(c, 'owner'); if (err) return err;
  const b = await c.req.json().catch(() => ({}));
  const users = listUsers();
  const many = Array.isArray(b.userIds);
  const picked = many ? [...new Set(b.userIds.map(String))].slice(0, 50).map((id) => users.find((x) => x.id === id)) : [users.find((x) => x.id === b.userId || (b.username && x.username === b.username))];
  if (!picked.length || picked.some((u) => !u)) return bad(c, 'Fant ikke brukeren. Nye brukere legges til av admin under Innstillinger → Innlogging i Homelab.');
  if (b.role !== undefined && !ROLE_IN[b.role]) return bad(c, 'Ugyldig rolle');
  const role = ROLE_IN[b.role] ?? 'editor';
  const fresh = picked.filter((u) => u.id !== c.get('user') && !memberOf(f.id, u.id));
  if (!many && !fresh.length) return bad(c, `${displayName(picked[0])} har allerede tilgang`);
  for (const u of fresh) {
    // En navngitt person med samme navn (uten innlogging) kobles til kontoen i stedet for å få en ny rad.
    const named = q('SELECT id FROM fh_folder_members WHERE folder_id=? AND user_id IS NULL AND lower(name)=lower(?)').get(f.id, displayName(u));
    if (named) q('UPDATE fh_folder_members SET user_id=?, role=? WHERE id=?').run(u.id, role, named.id);
    else q("INSERT INTO fh_folder_members(folder_id,name,email,role,status,user_id) VALUES(?,?,?,?,'active',?)").run(f.id, displayName(u), null, role, u.id);
  }
  const from = mine?.name || 'Noen';
  for (const u of fresh) broadcast('boliger', { action: 'shared', folderId: f.id, title: 'Boliger', body: `${from} delte ${f.name} med deg`, category: 'finans', url: `finanshub://boliger/${f.id}` }, [u.id]);
  return fullOut(c, f);
});
api.get('/users/shareable', (c) => {
  const { f, err } = folderFor(c, 'view', c.req.query('home')); if (err) return err;
  return c.json(shareableUsers(c.get('user'), f.id));
});
api.get('/folders/:id/shareable', (c) => { const { f, err } = folderFor(c); if (err) return err; return c.json(shareableUsers(c.get('user'), f.id)); });
api.get('/folders/:id/entries/:eid/history', (c) => {
  const { f, err } = folderFor(c); if (err) return err;
  const e = q('SELECT id FROM fh_folder_entries WHERE id=? AND folder_id=?').get(+c.req.param('eid'), f.id);
  if (!e) return c.notFound();
  return c.json(entryHistory(e.id).map((h) => ({ ...h, you: h.userId === c.get('user') })));
});
api.patch('/folders/:id/members/:mid', async (c) => {
  const { f, err } = folderFor(c, 'owner'); if (err) return err;
  const m = q('SELECT * FROM fh_folder_members WHERE id=? AND folder_id=?').get(+c.req.param('mid'), f.id);
  if (!m) return c.notFound();
  const role = ROLE_IN[(await c.req.json()).role];
  if (!role) return bad(c, 'Ugyldig rolle');
  if (m.role === 'owner' && role !== 'owner' && q("SELECT count(*) FROM fh_folder_members WHERE folder_id=? AND role='owner'").pluck().get(f.id) < 2) return bad(c, 'Mappen må ha minst én eier');
  q('UPDATE fh_folder_members SET role=? WHERE id=?').run(role, m.id);
  return fullOut(c, f);
});
// Eier fjerner et medlem, eller et medlem forlater mappen selv.
api.delete('/folders/:id/members/:mid', (c) => {
  const { f, me, err } = folderFor(c); if (err) return err;
  const m = q('SELECT * FROM fh_folder_members WHERE id=? AND folder_id=?').get(+c.req.param('mid'), f.id);
  if (!m) return c.notFound();
  if (m.id !== me.id && me.role !== 'owner') return bad(c, 'Bare eiere kan fjerne medlemmer', 403);
  if (m.role === 'owner' && q("SELECT count(*) FROM fh_folder_members WHERE folder_id=? AND role='owner'").pluck().get(f.id) < 2) return bad(c, 'Den siste eieren kan ikke forlate boligen. Gjør noen andre til eier først, eller slett boligen.');
  q('DELETE FROM fh_folder_members WHERE id=?').run(m.id);
  return m.id === me.id ? ok(c) : fullOut(c, f);
});
const memberNames = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
api.post('/folders/:id/invite', async (c) => {
  const { f, err } = folderFor(c, 'owner'); if (err) return err;
  const b = await c.req.json();
  const users = listUsers();
  for (const n of memberNames(b.emails ?? b.members)) {
    const u = users.find((x) => x.username === n.toLowerCase() || x.name.toLowerCase() === n.toLowerCase());
    if (u ? memberOf(f.id, u.id) : q('SELECT 1 FROM fh_folder_members WHERE folder_id=? AND name=?').get(f.id, n)) continue;
    q("INSERT INTO fh_folder_members(folder_id,name,email,role,status,user_id) VALUES(?,?,?,'editor','active',?)").run(f.id, u ? displayName(u) : n.slice(0, 40), /@/.test(n) ? n.slice(0, 120) : null, u?.id ?? null);
  }
  return fullOut(c, f);
});
api.post('/folders/:id/entries', async (c) => {
  const { f, me, err } = folderFor(c, 'edit'); if (err) return err;
  const b = await c.req.json();
  const members = new Set(q('SELECT name FROM fh_folder_members WHERE folder_id=?').all(f.id).map((m) => m.name));
  const paidBy = members.has(b.paidBy) ? b.paidBy : me.name;
  const proj = b.projectId ? q('SELECT * FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+b.projectId, f.id) : null;
  // Kategori: valgt i skjemaet (ID, eller navn fra eldre klienter), ellers prosjektets kategori, ellers heuristikk + AI.
  const chosen = b.categoryId ? bolCat(+b.categoryId)?.id : b.category ? catTree().find((t) => t.name === b.category)?.id : null;
  const projCat = !chosen && proj?.category ? catTree().find((t) => t.name === proj.category)?.id : null;
  const ins = q('INSERT INTO fh_folder_entries(folder_id,tx_id,description,date,amount,paid_by,category,project_id,created) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id');
  const place = (id, text) => (chosen ? assignCategory(id, text, chosen) : projCat ? assignCategory(id, text, projCat, { ai: false }) : assignCategory(id, text, null));
  if (b.txId) {
    // ISO2: bare egne transaksjoner (fra eget regnskap) kan legges i boligen.
    const t = own('fh_transactions', +b.txId);
    if (!t) return c.notFound();
    if (q('SELECT 1 FROM fh_folder_entries WHERE folder_id=? AND tx_id=?').get(f.id, t.id)) return bad(c, 'Transaksjonen ligger allerede i boligen');
    const e = ins.get(f.id, t.id, t.merchant || t.description, t.date, Math.abs(t.amount), paidBy, null, proj?.id ?? null, Date.now());
    place(e.id, `${t.merchant ?? ''} ${t.description} ${t.note ?? ''}`);
  } else {
    const amount = ore(b.amount);
    if (!str(b.description) || amount === null) return bad(c, 'Beskrivelse og beløp må fylles ut');
    const e = ins.get(f.id, null, str(b.description, 120), isDate(b.date) ? b.date : today(), Math.abs(amount), paidBy, null, proj?.id ?? null, Date.now());
    place(e.id, `${b.description} ${b.note ?? ''}`);
  }
  return fullOut(c, f);
});
api.patch('/folders/:id/entries/:eid', async (c) => {
  const { f, me: mine, err } = folderFor(c, 'edit'); if (err) return err;
  const e = q('SELECT * FROM fh_folder_entries WHERE id=? AND folder_id=?').get(+c.req.param('eid'), f.id);
  if (!e) return c.notFound();
  const b = await c.req.json();
  // Prompt 30: butikk/beskrivelse, beløp og dato kan endres (debounce i klientene), og alt logges med «endret av».
  const changes = {};
  const merchant = b.merchant !== undefined ? b.merchant : b.description;
  if (merchant !== undefined) {
    const v = str(merchant, 120);
    if (!v) return bad(c, 'Butikk/beskrivelse kan ikke være tom');
    if (v !== e.description) { q('UPDATE fh_folder_entries SET description=? WHERE id=?').run(v, e.id); changes.merchant = { from: e.description, to: v }; }
  }
  if (b.amount !== undefined) {
    const a = ore(b.amount);
    if (a === null || Math.abs(a) > 1e11) return bad(c, 'Ugyldig beløp');
    if (Math.abs(a) !== e.amount) { q('UPDATE fh_folder_entries SET amount=? WHERE id=?').run(Math.abs(a), e.id); changes.amount = { from: e.amount / 100, to: Math.abs(a) / 100 }; }
  }
  if (b.date !== undefined) {
    if (!isDate(b.date) || Number.isNaN(Date.parse(b.date))) return bad(c, 'Ugyldig dato (YYYY-MM-DD)');
    if (b.date !== e.date) { q('UPDATE fh_folder_entries SET date=? WHERE id=?').run(b.date, e.id); changes.date = { from: e.date, to: b.date }; }
  }
  if (b.categoryId !== undefined || b.category !== undefined) {
    const cid = b.categoryId ? bolCat(+b.categoryId)?.id : b.category ? catTree().find((t) => t.name === b.category)?.id : null;
    const before = entryCat(e);
    if (cid) { assignCategory(e.id, e.description, cid); const after = entryCat(q('SELECT * FROM fh_folder_entries WHERE id=?').get(e.id)); if (after.categoryId !== before.categoryId) changes.category = { from: before.categoryLabel ?? before.category, to: after.categoryLabel ?? after.category }; }
  }
  logEntryChange(e, c.get('user'), mine?.name || 'Ukjent', changes);
  if (b.projectId !== undefined) q('UPDATE fh_folder_entries SET project_id=? WHERE id=?').run(q('SELECT id FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+b.projectId, f.id)?.id ?? null, e.id);
  if (b.paidBy && q('SELECT 1 FROM fh_folder_members WHERE folder_id=? AND name=?').get(f.id, b.paidBy)) q('UPDATE fh_folder_entries SET paid_by=? WHERE id=?').run(b.paidBy, e.id);
  if (b.status !== undefined) {
    if (!['review', 'ok'].includes(b.status)) return bad(c, "status må være 'review' eller 'ok'");
    q('UPDATE fh_folder_entries SET status=? WHERE id=?').run(b.status, e.id);
  }
  return fullOut(c, f);
});
api.post('/folders/:id/receipts', need('receipts:write'), upload, (c) => {
  const { f, err } = folderFor(c, 'edit'); if (err) return err;
  return receiptUpload(c, `folder:${f.id}:${c.get('user')}`);
});
// Kvitteringsbilde i en bolig: bare kvitteringer som er koblet til en post i boligen, og bare for medlemmer.
for (const kind of ['thumb', 'file']) {
  api.get(`/folders/:id/receipts/:rid/${kind}`, (c) => {
    const { f, err } = folderFor(c); if (err) return err;
    const rid = c.req.param('rid'); // kvitterings-ID-er er UUID-er (tekst)
    if (!q('SELECT 1 FROM fh_folder_entries WHERE folder_id=? AND receipt_id=?').get(f.id, rid)) return c.notFound();
    const r = origSelect.get(rid);
    if (!r) return c.notFound();
    return kind === 'thumb' ? sendFile(c, r.thumb || r.file, r.thumb ? 'image/jpeg' : r.mime) : sendFile(c, r.file, r.mime);
  });
}
api.delete('/folders/:id/entries/:eid', (c) => { const { f, err } = folderFor(c, 'edit'); if (err) return err; q('DELETE FROM fh_folder_entries WHERE id=? AND folder_id=?').run(+c.req.param('eid'), f.id); return fullOut(c, f); });

// Prosjekter (f.eks. basseng med snekker) med budsjett og avdragsplan.
api.post('/folders/:id/projects', async (c) => {
  const { f, err } = folderFor(c, 'edit'); if (err) return err;
  const b = await c.req.json();
  const budget = ore(b.budget);
  if (!str(b.name) || budget === null) return bad(c, 'Prosjektet trenger navn og budsjett');
  const cat = FCAT[b.category] ? b.category : (() => { const k = folderCategory(`${b.name} ${b.vendor ?? ''}`); return ['Annet', 'Vedlikehold', 'Dagligvarer'].includes(k) ? 'Håndverker' : k; })();
  const p = q('INSERT INTO fh_folder_projects(folder_id,name,vendor,budget,category,created) VALUES(?,?,?,?,?,?) RETURNING id').get(f.id, str(b.name, 80), str(b.vendor, 80) || 'Håndverker', Math.abs(budget), cat, Date.now());
  const inst = q('INSERT INTO fh_project_installments(project_id,label,due,amount,sort) VALUES(?,?,?,?,?)');
  (Array.isArray(b.installments) ? b.installments : []).slice(0, 24).forEach((x, i) => { const a = ore(x.amount); if (str(x.label) && a !== null) inst.run(p.id, str(x.label, 80), str(x.due, 30) || null, Math.abs(a), i); });
  return fullOut(c, f);
});
api.patch('/folders/:id/projects/:pid', async (c) => {
  const { f, err } = folderFor(c, 'edit'); if (err) return err;
  const p = q('SELECT * FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+c.req.param('pid'), f.id);
  if (!p) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_folder_projects SET name=?, vendor=?, budget=?, category=? WHERE id=?').run(str(b.name, 80) || p.name, b.vendor !== undefined ? str(b.vendor, 80) : p.vendor,
    b.budget !== undefined && ore(b.budget) !== null ? Math.abs(ore(b.budget)) : p.budget, FCAT[b.category] ? b.category : p.category, p.id);
  return fullOut(c, f);
});
api.delete('/folders/:id/projects/:pid', (c) => { const { f, err } = folderFor(c, 'edit'); if (err) return err; q('DELETE FROM fh_folder_projects WHERE id=? AND folder_id=?').run(+c.req.param('pid'), f.id); return fullOut(c, f); });
api.post('/folders/:id/projects/:pid/installments', async (c) => {
  const { f, err } = folderFor(c, 'edit'); if (err) return err;
  const p = q('SELECT * FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+c.req.param('pid'), f.id);
  if (!p) return c.notFound();
  const b = await c.req.json(), a = ore(b.amount);
  if (!str(b.label) || a === null) return bad(c, 'Avdraget trenger navn og beløp');
  q('INSERT INTO fh_project_installments(project_id,label,due,amount,sort) VALUES(?,?,?,?,(SELECT ifnull(max(sort),0)+1 FROM fh_project_installments WHERE project_id=?))').run(p.id, str(b.label, 80), str(b.due, 30) || null, Math.abs(a), p.id);
  return fullOut(c, f);
});
// «Registrer betalt»: avdraget blir en utgift i mappen, knyttet til prosjektet, betalt av den som trykker.
api.post('/folders/:id/installments/:iid/pay', (c) => {
  const { f, me, err } = folderFor(c, 'edit'); if (err) return err;
  const x = q('SELECT i.*, p.vendor, p.category, p.id AS pid FROM fh_project_installments i JOIN fh_folder_projects p ON p.id=i.project_id WHERE i.id=? AND p.folder_id=?').get(+c.req.param('iid'), f.id);
  if (!x) return c.notFound();
  if (x.paid_at) return bad(c, 'Avdraget er allerede registrert som betalt');
  db.transaction(() => {
    const e = q('INSERT INTO fh_folder_entries(folder_id,description,date,amount,paid_by,category,project_id,created) VALUES(?,?,?,?,?,?,?,?) RETURNING id')
      .get(f.id, `${x.vendor} · ${x.label.toLowerCase()}`, today(), x.amount, me.name, x.category, x.pid, Date.now());
    q('UPDATE fh_project_installments SET paid_at=?, entry_id=? WHERE id=?').run(Date.now(), e.id, x.id);
  })();
  return fullOut(c, f);
});
api.delete('/folders/:id/installments/:iid', (c) => {
  const { f, err } = folderFor(c, 'edit'); if (err) return err;
  q('DELETE FROM fh_project_installments WHERE id=? AND project_id IN (SELECT id FROM fh_folder_projects WHERE folder_id=?)').run(+c.req.param('iid'), f.id);
  return fullOut(c, f);
});
// Faste regninger (strøm, vann, kommunale avgifter …).
api.post('/folders/:id/bills', async (c) => {
  const { f, err } = folderFor(c, 'edit'); if (err) return err;
  const b = await c.req.json();
  if (!str(b.name)) return bad(c, 'Skriv hvem regningen er fra');
  q('INSERT INTO fh_folder_bills(folder_id,name,category,freq,payer,next_due) VALUES(?,?,?,?,?,?)').run(f.id, str(b.name, 60), FCAT[b.category] ? b.category : folderCategory(b.name),
    FREQS.includes(b.freq) ? b.freq : 'Månedlig', str(b.payer, 40) || null, dateIn(b.nextDue) ?? (str(b.nextDue, 20) || null));
  return fullOut(c, f);
});
api.patch('/folders/:id/bills/:bid', async (c) => {
  const { f, err } = folderFor(c, 'edit'); if (err) return err;
  const cur = q('SELECT * FROM fh_folder_bills WHERE id=? AND folder_id=?').get(+c.req.param('bid'), f.id);
  if (!cur) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_folder_bills SET name=?, category=?, freq=?, payer=?, next_due=? WHERE id=?').run(str(b.name, 60) || cur.name, FCAT[b.category] ? b.category : cur.category,
    FREQS.includes(b.freq) ? b.freq : cur.freq, b.payer !== undefined ? str(b.payer, 40) || null : cur.payer, b.nextDue !== undefined ? dateIn(b.nextDue) ?? (str(b.nextDue, 20) || null) : cur.next_due, cur.id);
  return fullOut(c, f);
});
api.delete('/folders/:id/bills/:bid', (c) => { const { f, err } = folderFor(c, 'edit'); if (err) return err; q('DELETE FROM fh_folder_bills WHERE id=? AND folder_id=?').run(+c.req.param('bid'), f.id); return fullOut(c, f); });

/* --- Finn-handler --- */
// Handlene kommer fra Finn-e-poster (IMAP eller innlimt). Detaljsiden med annonse, kvittering, e-poster og bilder ligger i finn-routes.js.

function finnMatch(role, amountOre, date, u = me()) {
  const sign = role === 'sold' ? 1 : -1;
  return q("SELECT id FROM fh_transactions WHERE user_id=? AND amount BETWEEN ? AND ? AND date BETWEEN date(?, '-5 days') AND date(?, '+10 days') ORDER BY abs(julianday(date)-julianday(?)) LIMIT 1")
    .get(u, sign * amountOre - 100, sign * amountOre + 100, date, date, date)?.id ?? null;
}
// Ny handel, eller oppdatering av stegene når samme ordre kommer i en ny statusmail. Brukes også av e-postimporten.
function saveFinn(d) {
  const amountOre = Math.round(d.amount * 100);
  const source = d.source ?? null;
  const u = me();
  const existing = source ? q('SELECT * FROM fh_finn WHERE source=? AND user_id=?').get(source, u) : null;
  // Annonsen er allerede importert fra en lenke (samme Finn-kode, uten e-post): e-posten fyller inn handelen
  // i stedet for å lage en ny, så annonse, bilder og e-poster havner på samme sted.
  const byCode = !existing && d.finn_code ? q("SELECT * FROM fh_finn WHERE finn_code=? AND user_id=? AND (source IS NULL OR source LIKE 'ad:%') ORDER BY id LIMIT 1").get(d.finn_code, u) : null;
  if (byCode) {
    q(`UPDATE fh_finn SET role=?, item=CASE WHEN item='' OR item LIKE 'Finn-annonse %' THEN ? ELSE item END, counterpart=CASE WHEN counterpart='' THEN ? ELSE counterpart END,
       date=?, amount=?, steps=?, source=COALESCE(?, source), order_id=COALESCE(order_id, ?), tx_id=COALESCE(tx_id, ?) WHERE id=?`)
      .run(d.role, d.item, d.counterpart ?? '', d.date, amountOre, JSON.stringify(d.steps ?? []), source, d.order_id ?? null, finnMatch(d.role, amountOre, d.date), byCode.id);
    return q('SELECT * FROM fh_finn WHERE id=?').get(byCode.id);
  }
  if (existing) {
    q('UPDATE fh_finn SET steps=?, order_id=COALESCE(order_id, ?) WHERE id=?').run(JSON.stringify(d.steps), d.order_id ?? null, existing.id);
    return q('SELECT * FROM fh_finn WHERE id=?').get(existing.id);
  }
  return q('INSERT INTO fh_finn(role,item,counterpart,date,amount,steps,source,tx_id,order_id,created,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(d.role, d.item, d.counterpart ?? '', d.date, amountOre, JSON.stringify(d.steps ?? []), source, finnMatch(d.role, amountOre, d.date), d.order_id ?? null, Date.now(), u);
}
async function finnFromMail(text, parsed) {
  const d = await parseFinnEmail(String(text).slice(0, 50000));
  if (!d.item || !Number.isFinite(d.amount) || d.amount <= 0) throw new Error('Fant ikke gjenstand og beløp i Finn-e-posten');
  const f = saveFinn({ ...d, finn_code: d.finn_code ?? codesIn(`${parsed?.subject ?? ''}\n${text}`).code ?? null });
  attachParsed(f, parsed);
  return f;
}
mountFinnImport(api, { R, W, upload, finnFromMail });
mountFinn(api, { R, W, upload, saveFinn });

/* --- Kvitteringer fra e-post (Proton Mail Bridge / IMAP) --- */

const MAIL_KEYS = { mailOn: Boolean, imapHost: (v) => (/^[a-z0-9.\-:]{0,120}$/i.test(String(v).trim()) ? String(v).trim() : ''), imapPort: (v) => Math.min(65535, Math.max(1, +v || 143)),
  imapSecurity: (v) => (['starttls', 'tls', 'none'].includes(v) ? v : 'starttls'), imapUser: (v) => str(v, 120), imapFolder: (v) => str(v, 120) || 'INBOX',
  imapDoneFolder: (v) => str(v, 120), imapPollMinutes: (v) => Math.min(1440, Math.max(1, +v || 10)), imapFinnFolder: (v) => str(v, 120) };
const mailDeps = { ingest: ingestReceipt, finn: finnFromMail, finnLink: linkMail };
startMailWorker(mailDeps);
const mailOut = () => ({ config: mailConfig(), status: mailStatus(), recent: recentImports() });
api.get('/mail/config', R, (c) => c.json(mailOut()));
api.get('/mail/status', R, (c) => c.json({ status: mailStatus(), recent: recentImports() }));
api.put('/mail/config', sessionOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const patch = {};
  for (const [k, fn] of Object.entries(MAIL_KEYS)) if (b[k] !== undefined) patch[k] = fn(b[k]);
  const cur = settings();
  // Ny vert eller port: det pinnede sertifikatet gjelder ikke lenger.
  if (b.forgetPin || (patch.imapHost !== undefined && patch.imapHost !== cur.imapHost) || (patch.imapPort !== undefined && patch.imapPort !== cur.imapPort)) patch.imapPin = '';
  // ISO2: IMAP er brukerens egen (setUserCfg via saveSettings/setSecret).
  try {
    saveSettings(patch);
    if (typeof b.pass === 'string' && b.pass.trim()) setSecret('imapPass', b.pass.trim());
    if (b.clearPass) setSecret('imapPass', '');
  } catch (e) { return bad(c, e.message); }
  return c.json(mailOut());
});
api.post('/mail/test', sessionOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const o = {};
  for (const k of ['host', 'port', 'security', 'user', 'folder', 'doneFolder']) if (b[k] !== undefined && b[k] !== '') o[k] = k === 'port' ? +b[k] : String(b[k]).trim();
  if (typeof b.pass === 'string' && b.pass.trim()) o.pass = b.pass.trim();
  return c.json(await testMail(o));
});
api.post('/mail/run', sessionOnly, async (c) => c.json(await runMail(mailDeps)));


/* --- Import (XLSX, CSV, tekst) --- */
// Uten ?commit=1: forhåndsvisning. Med commit: lagres (duplikater hoppes over), AI kategoriserer og beskriver i bakgrunnen.

async function importHandler(c) {
  const b = await c.req.parseBody({ all: true });
  const files = asList(b.files).concat(asList(b['files[]']), asList(b.file));
  const text = typeof b.text === 'string' ? b.text : '';
  if (!files.length && !text.trim()) return bad(c, 'Velg filer eller lim inn tekst');
  if (+b.accountId && !own('fh_accounts', +b.accountId)) return bad(c, 'Ukjent konto');
  const accountId = +b.accountId || q("SELECT id FROM fh_accounts WHERE type='checking' AND user_id=? ORDER BY sort, id LIMIT 1").get(c.get('user'))?.id || null;
  const rows = [], errors = [], formats = [];
  let skipped = 0;
  // Formatet finnes med importmaler (innebygde, lagrede eller ✦ AI-tolket); se import-templates.js.
  const take = async (cells, source, file = null) => {
    const r = await importRows(cells, accountId ?? 0);
    rows.push(...r.rows.map((x) => ({ ...x, bank: { ...x.bank, source, file, template: r.format?.template.name ?? null } })));
    skipped += r.skipped.length;
    if (r.format) formats.push({ file: file ?? source, rows: r.rows.length, ...r.format });
  };
  for (const f of files.slice(0, 20)) { try { await take(await parseFile(f), /\.xlsx$/i.test(f.name ?? '') ? 'XLSX' : 'CSV', str(f.name, 120) || null); } catch (e) { errors.push(e.message); } }
  if (text.trim()) await take(splitRows(text), 'Innlimt tekst');
  if (!rows.length) return bad(c, errors[0] ?? (formats[0] ? `Fant ingen rader med dato, tekst og beløp (format: ${formats[0].template.name})` : 'Fant ingen rader med dato, tekst og beløp'));
  const cats = catById();
  const auto = settings().autoCat;
  const preview = rows.map((r) => {
    const catId = auto ? (ruleFor(r.raw) ?? ruleFor(r.description)) : null;
    const dup = !!q('SELECT 1 FROM fh_transactions WHERE external_id=? AND user_id=?').get(r.external_id, c.get('user'));
    return { ...r, amount: r.amount / 100, categoryId: catId, category: cats.get(catId)?.name ?? null, domain: domainFor(r.description) ?? domainFor(r.raw),
      aiShort: heuristic({ merchant: r.raw, amount: r.amount / 100, category: cats.get(catId)?.name }).short, duplicate: dup };
  });
  if (c.req.query('commit') !== '1') return c.json({ rows: preview, imported: 0, skipped, errors, formats, format: formats[0] ?? null });
  if (!accountId) return bad(c, 'Opprett en konto først');
  const ins = q("INSERT OR IGNORE INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,external_id,domain,raw_bank_row,created,user_id) VALUES(?,?,?,?,?,?,'import',?,?,?,?,?)");
  const bankMeta = { account: accName(accountId), importedAt: Date.now() };
  let imported = 0;
  db.transaction(() => { for (const r of preview) imported += ins.run(accountId, r.date, Math.round(r.amount * 100), r.description, r.description, r.categoryId, r.external_id, r.domain, bankJson(r.bank, bankMeta), Date.now(), c.get('user')).changes; })();
  kickAi();
  return c.json({ rows: preview, imported, duplicates: preview.length - imported, skipped, errors, formats, format: formats[0] ?? null });
}
api.post('/import', W, upload, importHandler);
api.post('/import/xlsx', W, upload, importHandler);

// Forhåndsvisning av formatet uten transaksjonene: hvilken mal, hvilke kolonner, og de første radene.
api.post('/import/preview', W, upload, async (c) => {
  const ct = c.req.header('content-type') ?? '';
  let cells;
  try {
    if (ct.includes('application/json')) { const b = await c.req.json().catch(() => ({})); cells = splitRows(String(b.text ?? '')); }
    else { const b = await c.req.parseBody(); const f = asList(b.file).concat(asList(b.files))[0]; cells = f ? await parseFile(f) : splitRows(typeof b.text === 'string' ? b.text : ''); }
  } catch (e) { return bad(c, e.message); }
  if (!cells.length) return bad(c, 'Velg en fil eller lim inn tekst');
  const r = await importRows(cells, 0);
  return c.json({ ...r.format, sample: r.sample, rows: r.rows.length, skipped: r.skipped.length });
});
api.get('/import/templates', R, (c) => c.json(listTemplates()));
api.delete('/import/templates/:id', W, (c) => (deleteTemplate(c.req.param('id')) ? c.json({ ok: true }) : bad(c, 'Innebygde maler kan ikke slettes', 404)));


/* --- Data --- */

api.get('/export.json', R, (c) => c.body(JSON.stringify(backup.exportJson(), null, 2), 200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="finanshub-${today()}.json"` }));

/* --- Aksjer (Trading 212) --- */

// Viser lengde og de fire første tegnene av nøkkel-ID-en (aldri secret), så brukeren kan se hva som faktisk er lagret.
const t212Info = () => { const k = cleanCred(secret('t212Key')), s = cleanCred(secret('t212Secret'));
  return { keyHint: k ? `${k.slice(0, 4)}… (${k.length} tegn)` : null, secretLength: s.length, keySource: secretSource('t212Key'), secretSource: secretSource('t212Secret') }; };

api.get('/stocks', R, async (c) => c.json({ ...(await stocks({ force: c.req.query('force') === '1' })), ...(c.get('access')?.session ? t212Info() : {}) }));
for (const part of ['summary', 'portfolio', 'orders', 'dividends']) {
  api.get(`/stocks/${part}`, R, async (c) => { const d = await stocks(); return c.json({ summary: d.summary, portfolio: d.positions, orders: d.orders, dividends: d.dividends }[part] ?? null); });
}
api.post('/stocks/sync', W, async (c) => c.json(await stocks({ force: true })));
api.put('/stocks/config', sessionOnly, async (c) => {
  const b = await c.req.json();
  // Miljø og nøkkel lagres sammen: en Live-nøkkel virker bare mot live.trading212.com og omvendt.
  // ISO2: Trading 212 er brukerens egen integrasjon (setUserCfg: t212_key, t212_secret, t212_env).
  const key = cleanCred(b.key), sec = cleanCred(b.secret);
  try {
    if (b.env === 'live' || b.env === 'demo') saveSettings({ t212Env: b.env });
    if (key) setSecret('t212Key', key);
    if (sec) setSecret('t212Secret', sec);
    if (b.clear) { setSecret('t212Key', ''); setSecret('t212Secret', ''); }
  } catch (e) { return bad(c, e.message); }
  if (key || sec || b.clear) kv.set(c.get('user'), 'fh_t212_auth', 'basic');
  resetStocks();
  return c.json({ configured: t212Configured(), env: settings().t212Env, base: t212Base(), ...t212Info() });
});
// «Test tilkobling»: tester verdiene i skjemaet (før lagring) eller de lagrede, og forklarer feilen konkret.
api.post('/stocks/test', sessionOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  return c.json(await testT212({ key: b.key, secret: b.secret, env: b.env }));
});

/* --- ✦ AI-søk --- */

// Tidligere spørsmål per bruker (maks 20, nyeste først).
const AI_HIST = 'fh_ai_history';
const aiHistory = (uid) => (kv.get(uid, AI_HIST, []) ?? []).slice(0, 20);
const flatSugg = () => suggestionGroups().flatMap((g) => g.items);
// Vanlig søk: butikk, varelinjer i kvitteringer, kategori, notat, måned, beløp, «største», «til gjennomgang». Ingen AI.
api.get('/search', R, (c) => {
  const text = str(c.req.query('q'), 300);
  if (!text) return c.json({ mode: 'plain', query: '', summary: '', hits: [], followUps: [], suggestions: flatSugg(), groups: suggestionGroups() });
  return c.json(annotateSearch(plainSearch(text), text, c.get('user')));
});
// ✦ AI-søk. Er motoren av eller nede, svares det med vanlig søk og aiUnavailable:true i stedet for en feil.
// Prompt 25: med «Prefer: respond-async», ?async=1 eller {async:true} blir et søk som tar mer enn ca. 4 s en jobb: 202 {jobId}.
// Raske svar (og eldre klienter uten jobbmodus) får det vanlige svaret direkte.
// Prompt 30: alle svar får {txId, receiptId, lineIndex[], matchedText} per treff.
async function aiSearch(uid, b, ctx = {}) { return annotateSearch(await aiSearch0(uid, b, ctx), str(b?.q, 300), uid); }
async function aiSearch0(uid, b, { signal = null, onEngine, status } = {}) {
  const text = str(b.q, 300);
  if (!text) return { answer: '', hits: [], followUps: [], suggestions: flatSugg(), groups: suggestionGroups() };
  if (b.save !== false) kv.set(uid, AI_HIST, [text, ...aiHistory(uid).filter((x) => x.toLowerCase() !== text.toLowerCase())].slice(0, 20));
  const plain = plainSearch(text);
  const extra = { q: text, followUps: plain.followUps, suggestions: plain.suggestions, history: aiHistory(uid) };
  if (b.mode === 'plain') return { ...plain, ...extra };
  // Prompt 32: spørsmål om abonnementer/tjenester/kategorier besvares fra Subscription OS (+ prøver) med Ja/Nei først.
  const subs = subscriptionAnswer(text, uid);
  if (subs) return { ...subs, ...extra, interpreted: plain.interpreted };
  // ✦ AI-bryteren på: force (eller ai:true / mode:'ai') kjører AI med en gang, også rett etter en feil.
  const force = b.force === true || b.ai === true || b.mode === 'ai';
  // Enkle ord: vanlig søk først. Gir det treff, brukes ikke AI (sparer kall og tid). force:true tvinger AI.
  if (!force && isSimpleQuery(text) && plain.hits.length) {
    const n = plain.total ?? plain.hits.length;
    return { ...plain, ...extra, mode: 'plain', plainFirst: true, engine: 'Vanlig søk', notice: `Fant ${n} treff med vanlig søk, så AI ble ikke brukt` };
  }
  try {
    const ai = await aiAnswer(text, { force, signal, onEngine, status });
    // Fant AI-søket ingenting, men vanlig søk gjorde det («sist jeg var på …», varelinjer): bruk det.
    if (ai.empty && plain.hits.length) return { ...plain, ...extra, engine: 'Vanlig søk' };
    return { mode: 'ai', ...ai, ...extra, interpreted: plain.interpreted };
  } catch (e) {
    if (!(e instanceof AiUnavailable)) throw e;
    // Årsaken vises (f.eks. «Ollama svarte ikke innen 60 s»), ellers ser det bare ut som at AI ikke virker.
    const k = e.kind ?? { kind: 'error', text: 'AI-motoren svarte ikke.' };
    return { ...plain, ...extra, aiUnavailable: true, aiError: e.message, aiErrorKind: k.kind, aiErrorText: k.text, engine: 'Vanlig søk',
      ...(e.timeouts?.length ? { timeouts: e.timeouts } : {}),
      notice: `${k.text} Detaljer: ${e.message.slice(0, 220)}. Dette er vanlig søk.` };
  }
}
const wantsAsync = (c, b) => /respond-async/i.test(c.req.header('prefer') ?? '') || c.req.query('async') === '1' || b.async === true;
api.post('/search/ai', R, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const uid = c.get('user');
  if (!wantsAsync(c, b) || !str(b.q, 300)) return c.json(await aiSearch(uid, b));
  if (runningFor(uid) >= MAX_RUNNING_PER_USER) return bad(c, 'Du har allerede flere AI-søk som kjører. Vent eller avbryt ett av dem.', 429);
  const { job, promise } = startJob(uid, 'search', (ctx) => aiSearch(uid, b, ctx));
  let timer;
  const quick = await Promise.race([promise, new Promise((r) => { timer = setTimeout(() => r(null), _jobTest.afterMs); })]);
  clearTimeout(timer);
  if (quick?.status === 'done') return c.json(quick.result);
  if (quick?.status === 'error') return c.json({ error: 'Intern feil' }, 500);
  c.header('Location', `/finans/api/jobs/${job.id}`);
  c.header('Preference-Applied', 'respond-async');
  return c.json({ ...jobView(job), statusUrl: `/finans/api/jobs/${job.id}`, eventsUrl: `/finans/api/jobs/${job.id}/events` }, 202);
});
// Jobbene (per bruker; andres jobber gir 404).
api.get('/jobs/:id', R, (c) => { const j = getJob(c.get('user'), c.req.param('id')); return j ? c.json(jobView(j)) : bad(c, 'Fant ikke jobben', 404); });
api.delete('/jobs/:id', R, (c) => { const v = cancelJob(c.get('user'), c.req.param('id')); return v ? c.json(v) : bad(c, 'Fant ikke jobben', 404); });
// SSE: en melding (uten navn, data = samme JSON som GET /jobs/:id) ved hver endring og hvert sekund. Strømmen lukkes når jobben er ferdig.
api.get('/jobs/:id/events', R, (c) => {
  const j = getJob(c.get('user'), c.req.param('id'));
  if (!j) return bad(c, 'Fant ikke jobben', 404);
  c.header('Cache-Control', 'no-cache');
  c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (sse) => {
    let id = 0, wake = null;
    const queue = [];
    const off = subscribe(j, (v) => { queue.push(v); wake?.(); });
    sse.onAbort(() => { off(); wake?.(); });
    try {
      await sse.writeSSE({ data: JSON.stringify(jobView(j)), id: String(id++) });
      while (j.status === 'running' && !sse.aborted) {
        await new Promise((r) => { wake = r; setTimeout(r, 1000); });
        wake = null;
        const v = queue.length ? queue.splice(0).at(-1) : jobView(j);
        if (!sse.aborted) await sse.writeSSE({ data: JSON.stringify(v), id: String(id++) });
      }
      if (!sse.aborted && queue.length) await sse.writeSSE({ data: JSON.stringify(jobView(j)), id: String(id++) });
    } finally { off(); }
  });
});
api.get('/search/history', R, (c) => c.json(aiHistory(c.get('user'))));
api.delete('/search/history', R, async (c) => {
  const uid = c.get('user'), one = c.req.query('q');
  kv.set(uid, AI_HIST, one ? aiHistory(uid).filter((x) => x !== one) : []);
  return c.json(aiHistory(uid));
});
// { groups:[{title, items}], items:[…] } – items er den flate listen (bakoverkompatibel med eldre klienter).
api.get('/search/suggestions', R, (c) => { const groups = suggestionGroups(); return c.json({ groups, items: groups.flatMap((g) => g.items) }); });

/* --- Backup og data --- */

// ISO2: SMB-backupen (hele databasen) er serveroppsett for hovedadmin. Andre får egen nedlasting/gjenoppretting og canSmb:false.
api.get('/backup', sessionOnly, async (c) => {
  const u = c.get('user');
  if (!isMain(c.get('access'))) return c.json({ config: null, smbclient: false, running: null, nextRun: null, last: null, history: [], firstRun: backup.needsFirstRun(u), counts: backup.currentCounts(u), canSmb: false });
  return c.json({ config: backup.smbConfig(), smbclient: await backup.smbAvailable(), running: backup.backupRunning(), nextRun: backup.nextRun(),
    last: kv.get(OWNER, 'fh_backup_last', null), history: q('SELECT * FROM fh_backups ORDER BY created DESC LIMIT 20').all(), firstRun: backup.needsFirstRun(u), counts: backup.currentCounts(u), canSmb: true });
});
api.get('/backup/export', R, (c) => {
  const f = c.req.query('format');
  if (f === 'xlsx') return c.body(backup.exportXlsx(), 200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="finanshub-database-${today()}.xlsx"` });
  if (f === 'csv') return c.redirect('/finans/api/transactions.csv');
  return c.body(JSON.stringify(backup.exportJson(), null, 2), 200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="finanshub-backup-${today()}.json"` });
});
const SMB_KEYS = { on: ['smbOn', Boolean], share: ['smbShare', (v) => backup.normShare(v) ?? ''], dir: ['smbDir', (v) => str(v, 120)], version: ['smbVersion', (v) => (['3.1.1', '3.0', '2.1'].includes(v) ? v : '3.1.1')],
  user: ['smbUser', (v) => str(v, 80)], domain: ['smbDomain', (v) => str(v, 60) || 'WORKGROUP'], schedule: ['smbSchedule', (v) => (['off', 'daily', 'weekly', 'change'].includes(v) ? v : 'off')],
  keep: ['smbKeep', (v) => Math.min(90, Math.max(1, +v || 14))], db: ['smbDb', Boolean], receipts: ['smbReceipts', Boolean], settings: ['smbSettings', Boolean], encrypt: ['smbEncrypt', Boolean] };
api.put('/backup/smb', sessionOnly, mainOnly, async (c) => {
  const b = await c.req.json();
  const patch = {};
  for (const [k, [key, fn]] of Object.entries(SMB_KEYS)) if (b[k] !== undefined) patch[key] = fn(b[k]);
  if (b.share !== undefined && b.share && !patch.smbShare) return bad(c, 'Ugyldig share. Bruk formen //server/share eller \\\\server\\share');
  saveSettings(patch);
  if (typeof b.pw === 'string' && b.pw) setSecret('smbPass', b.pw);
  if (typeof b.phrase === 'string' && b.phrase) { if (b.phrase.length < 8) return bad(c, 'Passfrasen må ha minst 8 tegn'); setSecret('backupPhrase', b.phrase); }
  return c.json(backup.smbConfig());
});
api.post('/backup/smb/test', sessionOnly, mainOnly, async (c) => c.json(await backup.smbTest()));
api.post('/backup/run', sessionOnly, mainOnly, async (c) => { const r = await backup.runBackup('manuell'); return r.started ? c.json(r) : bad(c, r.message); });
api.get('/backup/list', sessionOnly, mainOnly, async (c) => c.json(await backup.smbList()));
// Gjenoppretting i to steg: klargjør (forhåndsvisning med antall per tabell), deretter gjenopprett.
api.post('/backup/stage', sessionOnly, bodyLimit({ maxSize: 2 * 1024 * 1024 * 1024, onError: (c) => bad(c, 'Filen er for stor', 413) }), async (c) => {
  try {
    const main = isMain(c.get('access'));
    if ((c.req.header('content-type') ?? '').includes('multipart')) { const b = await c.req.parseBody(); return c.json(await backup.stage({ file: b.file instanceof File ? b.file : null, phrase: typeof b.phrase === 'string' ? b.phrase : '', allowArchive: main })); }
    const b = await c.req.json();
    if (!main) return bad(c, 'Bare hovedadministratoren kan hente backup fra SMB-sharen', 403);
    return c.json(await backup.stage({ remote: str(b.remote, 200), phrase: str(b.phrase, 200), allowArchive: true }));
  } catch (e) { return bad(c, e.message); }
});
api.post('/backup/restore', sessionOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  try { const counts = await backup.restore(str(b.stageId, 60), c.get('user'), { mainAdmin: isMain(c.get('access')) }); resetStocks(); return c.json({ ok: true, counts }); } catch (e) { return bad(c, e.message); }
});
api.post('/firstrun', sessionOnly, async (c) => { const b = await c.req.json().catch(() => ({})); backup.finishFirstRun(['empty', 'smb', 'file', 'demo'].includes(b.choice) ? b.choice : 'empty'); return ok(c); });

api.post('/demo', sessionOnly, async (c) => {
  if (q('SELECT 1 FROM fh_transactions WHERE user_id=? LIMIT 1').get(c.get('user'))) return bad(c, 'Demodata kan bare lastes inn når det ikke finnes transaksjoner');
  loadDemo(c.get('user'));
  return ok(c);
});

api.delete('/all', sessionOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.confirm !== 'SLETT') return bad(c, 'Skriv SLETT for å bekrefte');
  // Regnskapet slettes helt, men av Boliger bare de admin selv eier (prompt 21). Andres boliger, og kvitteringene i dem, blir liggende.
  const uid = c.get('user');
  const mine = q(`SELECT id FROM fh_folders f WHERE f.owner_id=? OR (f.owner_id IS NULL AND EXISTS (SELECT 1 FROM fh_folder_members m WHERE m.folder_id=f.id AND m.user_id=? AND m.role='owner'))`).pluck().all(uid, uid);
  const inMine = `(${mine.map(() => '?').join(',') || 'NULL'})`;
  db.transaction(() => {
    q(`DELETE FROM fh_project_installments WHERE project_id IN (SELECT id FROM fh_folder_projects WHERE folder_id IN ${inMine})`).run(...mine);
    for (const t of ['fh_folder_projects', 'fh_folder_bills', 'fh_folder_entries', 'fh_folder_members']) q(`DELETE FROM ${t} WHERE folder_id IN ${inMine}`).run(...mine);
    q(`DELETE FROM fh_folders WHERE id IN ${inMine}`).run(...mine);
    // ISO2: bare brukerens eget regnskap slettes, aldri andres.
    for (const t of ['fh_finn_files', 'fh_finn_emails', 'fh_finn_ad']) q(`DELETE FROM ${t} WHERE finn_id IN (SELECT id FROM fh_finn WHERE user_id=?)`).run(uid);
    for (const t of ['fh_finn', 'fh_subscriptions']) q(`DELETE FROM ${t} WHERE user_id=?`).run(uid);
    // Kvitteringer som hører til en gjenværende bolig (en post der, eller lastet opp dit), beholdes.
    q(`DELETE FROM fh_receipts WHERE user_id=? AND id NOT IN (SELECT receipt_id FROM fh_folder_entries WHERE receipt_id IS NOT NULL)
       AND NOT (target LIKE 'folder:%' AND CAST(substr(target, 8) AS INTEGER) IN (SELECT id FROM fh_folders))`).run(uid);
    q('UPDATE fh_receipts SET transaction_id=NULL WHERE user_id=?').run(uid);
    for (const t of ['fh_transactions', 'fh_budgets', 'fh_recurring', 'fh_goals', 'fh_accounts']) q(`DELETE FROM ${t} WHERE user_id=?`).run(uid);
  })();
  return ok(c);
});

export default api;
// Prompt 42 (SERVER42): transaksjonsformen og spørringen brukes av filteret i finans42.js.
export const txOut42 = (t) => txOut(t);
export const TX_SELECT42 = TX_SELECT;
