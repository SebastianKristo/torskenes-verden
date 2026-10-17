// FinansHub-API: /finans/api/*. Tilgang med innlogget sesjon (nettleser) eller API-token med finans-scope (mobil/snarvei).
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db, OWNER, settings, saveSettings, secret, setSecret, DEFAULT_SETTINGS } from './db.js';
import { extract, health, providerName } from './ai.js';
import { parseCsv, PROFILES } from './csv.js';
import { domainFor, learnDomain, validDomain, logo, heuristic, kick as kickAi, summarizeReceipt } from './enrich.js';
import { parseFile, readText, rowsToTx } from './importer.js';
import { parseFinnEmail } from './finn.js';
import { sessionUser, clientIp, loginBlocked, loginFailed, loginSucceeded } from '../auth.js';
import { verifyPassword } from '../password.js';
import { passwordHash } from '../settings.js';
import { config } from '../config.js';

const DIR = resolve(config.dataDir, 'receipts');
const q = (sql) => db.prepare(sql);
const ok = (c) => c.json({ ok: true });
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);
const today = () => new Date().toLocaleDateString('sv-SE');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ore = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace('−', '-').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const hex = (v) => /^#[0-9a-f]{6}$/i.test(v) ? v : null;

/* ---------------- Tilgang ---------------- */

export const SCOPES = ['finance:read', 'finance:write', 'receipts:write'];
const tokenKey = (t) => createHmac('sha256', config.sessionSecret || 'dev').update('fh:' + t).digest('hex');

function access(c) {
  if (sessionUser(c)) return { user: OWNER, scopes: new Set(SCOPES), session: true };
  const m = c.req.header('authorization')?.match(/^Bearer\s+(fh_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const row = q('SELECT * FROM fh_tokens WHERE id=?').get(tokenKey(m[1]));
  if (!row) return null;
  q('UPDATE fh_tokens SET last_used=? WHERE id=?').run(Date.now(), row.id);
  return { user: OWNER, scopes: new Set(row.scopes.split(' ')), session: false };
}

// For andre moduler (Matplan) som vil godta mobilappens token: true når økt eller token med scope finnes.
export function bearerOk(c, scope = 'finance:read') { const a = access(c); return !!a && a.scopes.has(scope); }

const need = (scope) => async (c, next) => {
  const a = c.get('access');
  if (!a.scopes.has(scope)) return bad(c, `Tokenet mangler tilgangen ${scope}`, 403);
  await next();
};
const sessionOnly = async (c, next) => { if (!c.get('access').session) return bad(c, 'Krever innlogging i nettleseren', 403); await next(); };

/* ---------------- Hjelpere ---------------- */

const catById = () => new Map(q('SELECT * FROM fh_categories').all().map((x) => [x.id, x]));
const accById = () => new Map(q('SELECT * FROM fh_accounts').all().map((x) => [x.id, x]));

function txOut(t, cats = catById(), accs = accById()) {
  const cat = cats.get(t.category_id), acc = accs.get(t.account_id);
  return { id: t.id, date: t.date, amount: t.amount / 100, description: t.description, merchant: t.merchant, note: t.note, source: t.source,
    categoryId: t.category_id, category: cat?.name ?? 'Ukategorisert', color: cat?.color ?? '#A0A0AA', kind: cat?.kind ?? 'expense',
    accountId: t.account_id, account: acc?.name ?? '–', receipt: t.receipt_status ?? null, receiptId: t.receipt_id ?? null, ...aiOf(t, cat?.name) };
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
  (SELECT f.name FROM fh_folder_entries e JOIN fh_folders f ON f.id=e.folder_id WHERE e.tx_id=t.id LIMIT 1) AS folder_name FROM fh_transactions t
  LEFT JOIN fh_receipts r ON r.transaction_id = t.id`;

// Regler: * er jokertegn, ingen skiller på store/små bokstaver. Mønsteret kan starte ved et hvilket som helst ord,
// så «REMA*» treffer også bankteksten «VARER REMA 1000 MAJORSTUEN». Lavest prioritet, deretter lengste mønster, vinner.
function ruleFor(text) {
  const t = String(text ?? '').toUpperCase();
  const rules = q('SELECT * FROM fh_rules ORDER BY priority, length(pattern) DESC').all();
  for (const r of rules) {
    const re = new RegExp('(?:^|\\s)' + r.pattern.toUpperCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (re.test(t)) return r.category_id;
  }
  return null;
}
const catIdByName = (name) => (name ? q('SELECT id FROM fh_categories WHERE lower(name)=lower(?)').get(name)?.id ?? null : null);

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

function budgetsFor(month) {
  const rows = q("SELECT category_id, month, amount FROM fh_budgets WHERE month IN ('default', ?)").all(month);
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
  const match = r.transaction_id ? q('SELECT * FROM fh_transactions WHERE id=?').get(r.transaction_id) : null;
  return { id: r.id, status: r.status, provider: r.provider ? providerName(r.provider) : null, rawProvider: r.provider, model: r.model, seconds: r.seconds,
    merchant: r.merchant, date: r.date, total: r.total != null ? r.total / 100 : null, categoryId: r.category_id, category: cats.get(r.category_id)?.name ?? null,
    accountId: r.account_id, account: accs.get(r.account_id)?.name ?? null, confidence: r.confidence, flag, error: r.error, mime: r.mime,
    file: r.file ? `/finans/api/receipts/${r.id}/file` : null, thumb: r.thumb ? `/finans/api/receipts/${r.id}/thumb` : null,
    extraction: ex, match: match ? txOut(match, cats, accs) : null, created: r.created, name: r.name ?? null,
    aiShort: r.ai_short ?? (r.status === 'pending' || r.status === 'processing' ? 'Gemini leser kvitteringen …' : null), aiLong: r.ai_long ?? null,
    domain: r.domain || domainFor(r.merchant), target: r.target ?? null };
}

// Finn banktransaksjon: samme beløp ±1 kr og dato ±3 dager, uten kvittering fra før. Kort-siffer gir forrang.
function findMatch(totalOre, date, last4) {
  if (totalOre == null || !date) return null;
  const rows = q(`SELECT t.*, a.last4 FROM fh_transactions t LEFT JOIN fh_accounts a ON a.id=t.account_id
    WHERE t.amount BETWEEN ? AND ? AND t.date BETWEEN date(?, '-3 days') AND date(?, '+3 days')
    AND NOT EXISTS (SELECT 1 FROM fh_receipts r WHERE r.transaction_id=t.id AND r.status='booked')`).all(-totalOre - 100, -totalOre + 100, date, date);
  rows.sort((a, b) => ((b.last4 && b.last4 === last4) - (a.last4 && a.last4 === last4)) || Math.abs(Date.parse(a.date) - Date.parse(date)) - Math.abs(Date.parse(b.date) - Date.parse(date)));
  return rows[0] ?? null;
}

/* ---------------- Kvitteringskø ---------------- */

const queue = [];
let running = false;
async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { id, force } = queue.shift();
    const r = q('SELECT * FROM fh_receipts WHERE id=?').get(id);
    if (!r) continue;
    q("UPDATE fh_receipts SET status='processing', error=NULL, started=? WHERE id=?").run(Date.now(), id);
    try {
      const img = await readFile(join(DIR, r.scan ?? r.file));
      const cats = q("SELECT name FROM fh_categories WHERE kind='expense' ORDER BY sort").all().map((x) => x.name);
      const res = await extract(img, r.scan ? 'image/jpeg' : r.mime, cats, force);
      const d = res.data;
      const totalOre = d.total != null ? Math.round(d.total * 100) : null;
      const st = settings();
      // Regler går foran AI-forslaget.
      const catId = (st.autoCat && ruleFor(d.merchant)) || catIdByName(d.suggested_category) || r.category_id;
      const acc = d.card_last4 ? q('SELECT id FROM fh_accounts WHERE last4=?').get(d.card_last4)?.id : null;
      const match = findMatch(totalOre, d.date, d.card_last4);
      q(`UPDATE fh_receipts SET status='needs_review', provider=?, model=?, seconds=?, extraction=?, merchant=?, date=?, total=?, category_id=?,
         account_id=COALESCE(?, account_id), confidence=?, transaction_id=? WHERE id=? AND status='processing'`)
        .run(res.provider, res.model, res.seconds, JSON.stringify(d), d.merchant, d.date ?? r.date, totalOre, catId,
          acc ?? match?.account_id ?? null, Math.min(d.confidence.total, d.confidence.merchant || 1), match?.id ?? null, id);
      const sum = await summarizeReceipt(d, catById().get(catId)?.name);
      q('UPDATE fh_receipts SET ai_short=?, ai_long=?, domain=? WHERE id=?').run(sum.short, sum.long, sum.domain, id);
      routeTarget(id);
    } catch (e) {
      console.warn('[finans] Kvittering', id, e.message);
      q("UPDATE fh_receipts SET status='needs_review', error=?, confidence=0 WHERE id=? AND status='processing'").run(`Kunne ikke leses automatisk: ${e.message}. Fyll ut manuelt.`, id);
    }
  }
  running = false;
}
// Kvitteringer lastet opp fra Subscription OS eller en delt mappe havner også der når AI-en er ferdig.
function routeTarget(id) {
  const r = origSelect.get(id);
  if (!r?.target || r.total == null) return;
  if (r.target === 'sub' && !q('SELECT 1 FROM fh_subscriptions WHERE name=? AND active=1').get(r.merchant)) {
    q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,domain,ai_short,created) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(r.merchant || 'Ukjent', 'Fra kvittering', r.total, 'monthly', r.date ? shiftDate(r.date, 1) : null, 'Ny', r.domain, r.ai_short, Date.now());
  }
  const f = r.target.match(/^folder:(\d+)$/);
  if (f && q('SELECT 1 FROM fh_folders WHERE id=?').get(+f[1]) && !q('SELECT 1 FROM fh_folder_entries WHERE receipt_id=?').get(r.id)) {
    const owner = q("SELECT name FROM fh_folder_members WHERE folder_id=? ORDER BY role='owner' DESC, id LIMIT 1").get(+f[1])?.name ?? settings().name;
    q('INSERT INTO fh_folder_entries(folder_id,receipt_id,tx_id,description,date,amount,paid_by,created) VALUES(?,?,?,?,?,?,?,?)')
      .run(+f[1], r.id, r.transaction_id, r.merchant || 'Kvittering', r.date || today(), r.total, owner, Date.now());
  }
}
const shiftDate = (iso, months) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1 + months, Math.min(d, 28)); return x.toLocaleDateString('sv-SE'); };
// Gjenoppta bilag som ble avbrutt ved omstart.
setTimeout(() => {
  for (const r of q("SELECT id FROM fh_receipts WHERE status IN ('pending','processing')").all()) queue.push({ id: r.id });
  runQueue();
}, 2000).unref?.();

/* ---------------- Ruter ---------------- */

const api = new Hono();

// Innlogging fra de native appene: passord → token med finans-tilganger. Samme rate limiting som nettinnloggingen.
// Tokenet gir bare tilgang til /finans/api, aldri til resten av homelab.
async function tokenLogin(c) {
  const ip = clientIp(c);
  const wait = loginBlocked(ip);
  if (wait) return bad(c, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.`, 429);
  const b = await c.req.json().catch(() => ({}));
  if (!passwordHash() || !verifyPassword(String(b.password ?? ''), passwordHash())) {
    loginFailed(ip);
    await new Promise((r) => setTimeout(r, 400));
    return bad(c, 'Feil passord', 401);
  }
  loginSucceeded(ip);
  const token = 'fh_' + randomBytes(24).toString('base64url');
  q('INSERT INTO fh_tokens(id,name,scopes,created) VALUES(?,?,?,?)').run(tokenKey(token), str(b.deviceName ?? b.device, 60) || 'Mobilapp', SCOPES.join(' '), Date.now());
  return c.json({ token, scopes: SCOPES, user: settings().name });
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
// Appen logger ut ved å trekke tilbake sitt eget token.
api.post('/auth/logout', async (c) => {
  const m = c.req.header('authorization')?.match(/^Bearer\s+(fh_[A-Za-z0-9_-]{20,})$/);
  if (m) q('DELETE FROM fh_tokens WHERE id=?').run(tokenKey(m[1]));
  return ok(c);
});

api.use('*', async (c, next) => {
  const a = access(c);
  if (!a) return bad(c, 'Ikke innlogget', 401);
  c.set('access', a);
  await next();
});
const R = need('finance:read'), W = need('finance:write');
const upload = bodyLimit({ maxSize: Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024 + 4096, onError: (c) => bad(c, `Filen er for stor (maks ${process.env.MAX_UPLOAD_MB ?? 15} MB)`, 413) });

api.get('/bootstrap', R, (c) => {
  const st = settings();
  const cats = q('SELECT * FROM fh_categories ORDER BY sort, id').all();
  const accs = q(`SELECT a.*, a.opening_balance + COALESCE((SELECT SUM(amount) FROM fh_transactions WHERE account_id=a.id),0) AS balance FROM fh_accounts a ORDER BY sort, id`).all();
  const month = curMonth();
  return c.json({
    settings: { ...st, geminiKeySet: !!secret('geminiKey'), imapPassSet: !!secret('imapPass') }, month, period: period(month), profiles: PROFILES, user: st.name,
    categories: cats.map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind })),
    accounts: accs.map((a) => ({ id: a.id, name: a.name, bank: a.bank, type: a.type, last4: a.last4, note: a.note, openingBalance: a.opening_balance / 100, balance: a.balance / 100 })),
    rules: q('SELECT r.*, c.name AS category FROM fh_rules r LEFT JOIN fh_categories c ON c.id=r.category_id ORDER BY priority, id').all().map((r) => ({ id: r.id, pattern: r.pattern, categoryId: r.category_id, category: r.category, priority: r.priority })),
    goals: q('SELECT * FROM fh_goals ORDER BY id').all().map((g) => ({ ...g, saved: g.saved / 100, target: g.target / 100 })),
    reviewCount: q("SELECT COUNT(*) n FROM fh_receipts WHERE status IN ('pending','processing','needs_review')").get().n,
    hasData: !!q('SELECT 1 FROM fh_transactions LIMIT 1').get(),
  });
});

/* --- Oversikt --- */

api.get('/summary', R, (c) => {
  const month = /^\d{4}-\d{2}$/.test(c.req.query('month') ?? '') ? c.req.query('month') : curMonth();
  const { from, to } = period(month);
  const cats = catById(), accs = accById();
  const kindOf = (id) => cats.get(id)?.kind ?? 'expense';
  const sums = (f, t) => {
    const rows = q('SELECT amount, category_id FROM fh_transactions WHERE date>=? AND date<?').all(f, t);
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
  const opening = q('SELECT COALESCE(SUM(opening_balance),0) s FROM fh_accounts').get().s;
  const balanceAt = (d) => opening + q('SELECT COALESCE(SUM(amount),0) s FROM fh_transactions WHERE date<?').get(d).s;
  const saldo = series.map((s) => balanceAt(period(s.month).to) / 100);
  const lastIncome = q("SELECT t.date, t.description FROM fh_transactions t JOIN fh_categories c ON c.id=t.category_id WHERE c.kind='income' AND t.date>=? AND t.date<? ORDER BY t.date DESC LIMIT 1").get(from, to);
  const yStart = `${month.slice(0, 4)}-01-01`;
  const ySum = sums(yStart, to);
  const recurring = q('SELECT * FROM fh_recurring WHERE active=1').all().map((r) => recurringOut(r, cats)).sort((a, b) => a.next.localeCompare(b.next));
  const recent = q(`${TX_SELECT} ORDER BY t.date DESC, t.id DESC LIMIT 8`).all().map((t) => txOut(t, cats, accs));
  const review = q("SELECT * FROM fh_receipts WHERE status IN ('pending','processing','needs_review') ORDER BY created DESC").all().map((r) => receiptOut(r, cats, accs));
  return c.json({
    month, from, to, daysLeft,
    inn: cur.inn / 100, ut: cur.ut / 100, prevInn: prev.inn / 100, prevUt: prev.ut / 100,
    budgetTotal: budTotal / 100, budgetUsed: budUsed / 100, left: (budTotal - budUsed) / 100,
    savedYear: (ySum.inn - ySum.ut) / 100, yearGoal: +settings().yearGoal || 0,
    balance: saldo[saldo.length - 1], balanceSeries: saldo, series, lastIncome,
    byCategory: Object.entries(cur.byCat).map(([id, v]) => ({ categoryId: +id || null, category: cats.get(+id)?.name ?? 'Ukategorisert', color: cats.get(+id)?.color ?? '#A0A0AA', amount: v / 100, budget: (bud[id] ?? 0) / 100 })).sort((a, b) => b.amount - a.amount),
    budgets: Object.entries(bud).map(([id, v]) => {
      const st = q("SELECT COUNT(*) n FROM fh_transactions WHERE category_id=? AND amount<0 AND date>=? AND date<?").get(+id, from, to);
      const top = q("SELECT COALESCE(merchant, description) m, SUM(-amount) s FROM fh_transactions WHERE category_id=? AND amount<0 AND date>=? AND date<? GROUP BY m ORDER BY s DESC LIMIT 1").get(+id, from, to);
      return { categoryId: +id, category: cats.get(+id)?.name, color: cats.get(+id)?.color, budget: v / 100, used: (cur.byCat[id] ?? 0) / 100,
        count: st.n, topMerchant: top?.m ?? null, prevUsed: (prev.byCat[id] ?? 0) / 100 };
    }).filter((b) => b.category),
    innMonthly: series.slice(-7).map((s) => s.inn),
    recent, review, upcoming: recurring.slice(0, 6),
    dailyOut: (() => { // utgifter per dag i perioden (til søylene i KPI-kortet)
      const rows = q('SELECT date, SUM(-amount) s FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE amount<0 AND COALESCE(c.kind,\'expense\')<>\'transfer\' AND date>=? AND date<? GROUP BY date').all(from, to);
      return rows.map((r) => ({ date: r.date, amount: r.s / 100 }));
    })(),
  });
});

/* --- Transaksjoner --- */

function txQuery(c) {
  const w = [], p = [];
  const qs = c.req.query();
  if (qs.q) { w.push('(t.description LIKE ? OR t.merchant LIKE ? OR t.note LIKE ?)'); const s = `%${qs.q}%`; p.push(s, s, s); }
  if (qs.account) { w.push('t.account_id=?'); p.push(+qs.account); }
  if (qs.category) { w.push(qs.category === 'none' ? 't.category_id IS NULL' : 't.category_id=?'); if (qs.category !== 'none') p.push(+qs.category); }
  if (qs.type === 'inn') w.push('t.amount>0'); else if (qs.type === 'ut') w.push('t.amount<0');
  if (isDate(qs.from)) { w.push('t.date>=?'); p.push(qs.from); }
  if (isDate(qs.to)) { w.push('t.date<?'); p.push(qs.to); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

api.get('/transactions', R, (c) => {
  const { where, params } = txQuery(c);
  const limit = Math.min(2000, +c.req.query('limit') || 500);
  const rows = q(`${TX_SELECT} ${where} ORDER BY t.date DESC, t.id DESC LIMIT ${limit}`).all(...params);
  const total = q(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM fh_transactions t ${where}`).get(...params);
  const cats = catById(), accs = accById();
  return c.json({ items: rows.map((t) => txOut(t, cats, accs)), count: total.n, net: total.s / 100 });
});

api.post('/transactions', W, async (c) => {
  const b = await c.req.json();
  const amount = ore(b.amount);
  if (!isDate(b.date) || amount === null || !str(b.description)) return bad(c, 'Dato, beløp og beskrivelse må fylles ut');
  const desc = str(b.description);
  const catId = b.categoryId ? +b.categoryId : (settings().autoCat ? ruleFor(desc) : null);
  const t = q("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,note,source,created) VALUES(?,?,?,?,?,?,?,'manual',?) RETURNING *")
    .get(b.accountId ? +b.accountId : null, b.date, amount, desc, desc, catId, str(b.note, 500), Date.now());
  kickAi();
  return c.json(txOut(t));
});

api.patch('/transactions/:id', W, async (c) => {
  const b = await c.req.json();
  const cur = q('SELECT * FROM fh_transactions WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const n = {
    date: isDate(b.date) ? b.date : cur.date, amount: b.amount !== undefined && ore(b.amount) !== null ? ore(b.amount) : cur.amount,
    description: b.description !== undefined ? str(b.description) || cur.description : cur.description,
    category_id: b.categoryId !== undefined ? (b.categoryId ? +b.categoryId : null) : cur.category_id,
    account_id: b.accountId !== undefined ? (b.accountId ? +b.accountId : null) : cur.account_id,
    note: b.note !== undefined ? str(b.note, 500) : cur.note,
  };
  const t = q('UPDATE fh_transactions SET date=?, amount=?, description=?, category_id=?, account_id=?, note=? WHERE id=? RETURNING *')
    .get(n.date, n.amount, n.description, n.category_id, n.account_id, n.note, cur.id);
  return c.json(txOut(q(`${TX_SELECT} WHERE t.id=?`).get(t.id)));
});

api.delete('/transactions/:id', W, (c) => {
  q("UPDATE fh_receipts SET transaction_id=NULL, status=CASE WHEN status='booked' THEN 'needs_review' ELSE status END WHERE transaction_id=?").run(+c.req.param('id'));
  q('DELETE FROM fh_transactions WHERE id=?').run(+c.req.param('id'));
  return ok(c);
});

const csvCell = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const nok = (o) => (o / 100).toFixed(2).replace('.', ',');
api.get('/transactions.csv', R, (c) => {
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
  if (!accountId || !q('SELECT 1 FROM fh_accounts WHERE id=?').get(accountId)) return bad(c, 'Velg kontoen filen hører til');
  const profile = PROFILES.includes(b.profile) ? b.profile : settings().csvProfile;
  let parsed;
  try { parsed = parseCsv(await b.file.text(), accountId, profile); } catch (e) { return bad(c, e.message); }
  const auto = settings().autoCat;
  const ins = q("INSERT OR IGNORE INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,external_id,created) VALUES(?,?,?,?,?,?,'csv',?,?)");
  let added = 0;
  db.transaction(() => { for (const r of parsed.rows) added += ins.run(accountId, r.date, r.amount, r.description, r.merchant, auto ? ruleFor(r.description) : null, r.external_id, Date.now()).changes; })();
  saveSettings({ csvProfile: profile });
  kickAi();
  return c.json({ added, duplicates: parsed.rows.length - added, skipped: parsed.skipped.length });
});

/* --- Kvitteringer --- */

const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => x instanceof File);
// Én eller flere filer. Hver fil blir en jobb i køen; svaret kommer straks (felt fra første kvittering + jobs).
// scan/thumb (nedskalert av klienten) pares med filene i samme rekkefølge når antallet stemmer.
async function receiptUpload(c, target = null) {
  const b = await c.req.parseBody({ all: true });
  const files = asList(b.file).concat(asList(b['file[]']), asList(b.files), asList(b['files[]']));
  if (!files.length || files.some((f) => !MIME[f.type])) return bad(c, 'Last opp bilder (JPEG, PNG, WebP, HEIC) eller PDF-er');
  if (files.length > 30) return bad(c, 'Maks 30 filer om gangen');
  const scans = asList(b.scan), thumbs = asList(b.thumb);
  const pair = scans.length === files.length;
  const acc = +b.accountId || q('SELECT id FROM fh_accounts ORDER BY sort, id LIMIT 1').get()?.id || null;
  const ids = [];
  for (const [i, f] of files.entries()) ids.push(await saveReceipt(f, pair ? scans[i] : files.length === 1 ? scans[0] : null, thumbs.length === files.length ? thumbs[i] : files.length === 1 ? thumbs[0] : null, acc, target));
  runQueue();
  const first = receiptOut(origSelect.get(ids[0]));
  return c.json({ ...first, jobs: ids.map((id) => jobOut(origSelect.get(id))) });
}
async function saveReceipt(f, scanFile, thumbFile, acc, target) {
  const id = randomUUID();
  const d = new Date(), sub = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  await mkdir(join(DIR, sub), { recursive: true });
  const file = `${sub}/${id}.${MIME[f.type]}`;
  await writeFile(join(DIR, file), Buffer.from(await f.arrayBuffer()));
  // Nettleseren sender en nedskalert JPEG (~1600 px) til AI-en og et lite miniatyrbilde. Originalen lagres urørt.
  let scan = null, thumb = null;
  if (scanFile?.type === 'image/jpeg') { scan = `${sub}/${id}_scan.jpg`; await writeFile(join(DIR, scan), Buffer.from(await scanFile.arrayBuffer())); }
  if (thumbFile?.type === 'image/jpeg') { thumb = `${sub}/${id}_t.jpg`; await writeFile(join(DIR, thumb), Buffer.from(await thumbFile.arrayBuffer())); }
  q("INSERT INTO fh_receipts(id,file,scan,thumb,mime,status,date,account_id,name,target,created) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)")
    .run(id, file, scan, thumb, f.type, today(), acc, str(f.name, 120) || null, target, Date.now());
  queue.push({ id });
  return id;
}
api.post('/receipts', need('receipts:write'), upload, (c) => receiptUpload(c));

// Opplastingskøen: alt fra siste døgn med fremdrift. AI-en bruker typisk 5–15 s; fremdriften er et estimat.
function jobOut(r) {
  const progress = r.status === 'pending' ? 0 : r.status === 'processing' ? Math.min(92, Math.round(((Date.now() - (r.started ?? Date.now())) / 12000) * 90) + 5) : 100;
  return { id: r.id, name: r.name ?? r.merchant ?? 'Kvittering', status: r.status === 'failed' ? 'error' : r.status, progress, merchant: r.merchant, total: r.total != null ? r.total / 100 : null,
    error: r.error ?? null, thumb: r.thumb ? `/finans/api/receipts/${r.id}/thumb` : null, aiShort: r.ai_short ?? null, created: r.created };
}
api.get('/receipts/jobs', R, (c) => c.json(q("SELECT * FROM fh_receipts WHERE created>? AND status<>'rejected' ORDER BY created DESC LIMIT 100").all(Date.now() - 86400_000).map(jobOut)));
const origSelect = q('SELECT * FROM fh_receipts WHERE id=?');

api.get('/receipts', R, (c) => {
  const status = c.req.query('status');
  const where = status === 'queue' ? "WHERE status IN ('pending','processing','needs_review')" : status ? 'WHERE status=?' : '';
  const rows = q(`SELECT * FROM fh_receipts ${where} ORDER BY created DESC LIMIT 300`).all(...(status && status !== 'queue' ? [status] : []));
  const cats = catById(), accs = accById();
  return c.json(rows.map((r) => receiptOut(r, cats, accs)));
});

api.get('/receipts/:id', R, (c) => {
  const r = origSelect.get(c.req.param('id'));
  return r ? c.json(receiptOut(r)) : c.notFound();
});

async function sendFile(c, rel, mime) {
  if (!rel || rel.includes('..')) return c.notFound();
  try { return c.body(await readFile(join(DIR, rel)), 200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }); }
  catch { return c.notFound(); }
}
api.get('/receipts/:id/file', R, (c) => { const r = origSelect.get(c.req.param('id')); return r ? sendFile(c, r.file, r.mime) : c.notFound(); });
api.get('/receipts/:id/thumb', R, (c) => { const r = origSelect.get(c.req.param('id')); return r ? sendFile(c, r.thumb, 'image/jpeg') : c.notFound(); });

api.patch('/receipts/:id', W, async (c) => {
  const r = origSelect.get(c.req.param('id'));
  if (!r) return c.notFound();
  const b = await c.req.json();
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
  const r = origSelect.get(c.req.param('id'));
  if (!r) return c.notFound();
  if (r.status === 'booked') return bad(c, 'Kvitteringen er allerede bokført');
  if (!r.merchant || r.total == null || !isDate(r.date)) return bad(c, 'Butikk, dato og total må fylles ut før bokføring');
  const st = settings();
  let txId = r.transaction_id;
  db.transaction(() => {
    if (txId && q('SELECT 1 FROM fh_transactions WHERE id=?').get(txId)) {
      q('UPDATE fh_transactions SET category_id=COALESCE(?, category_id), merchant=?, ai_short=COALESCE(?, ai_short), ai_long=COALESCE(?, ai_long), domain=COALESCE(?, domain), ai_done=1 WHERE id=?')
        .run(r.category_id, r.merchant, r.ai_short, r.ai_long, r.domain, txId);
    } else {
      txId = q("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,ai_short,ai_long,domain,ai_done,created) VALUES(?,?,?,?,?,?,'receipt',?,?,?,1,?) RETURNING id")
        .get(r.account_id, r.date, -r.total, r.merchant, r.merchant, r.category_id, r.ai_short, r.ai_long, r.domain, Date.now()).id;
    }
    q('UPDATE fh_folder_entries SET tx_id=? WHERE receipt_id=? AND tx_id IS NULL').run(txId, r.id);
    q("UPDATE fh_receipts SET status='booked', transaction_id=? WHERE id=?").run(txId, r.id);
    // Læring: rettet kategori blir en regel for butikken.
    const ex = r.extraction ? JSON.parse(r.extraction) : null;
    const suggested = ruleFor(r.merchant) ?? catIdByName(ex?.suggested_category);
    if (st.autoCat && r.category_id && suggested !== r.category_id) {
      const word = r.merchant.toUpperCase().replace(/[^A-ZÆØÅ0-9 ]/g, '').trim().split(/\s+/)[0];
      if (word && word.length >= 3 && !q('SELECT 1 FROM fh_rules WHERE pattern=?').get(word + '*')) q('INSERT INTO fh_rules(pattern,category_id,priority) VALUES(?,?,50)').run(word + '*', r.category_id);
    }
  })();
  return c.json(receiptOut(origSelect.get(r.id)));
});

api.post('/receipts/:id/reject', W, (c) => { q("UPDATE fh_receipts SET status='rejected' WHERE id=?").run(c.req.param('id')); return ok(c); });

api.post('/receipts/:id/reprocess', W, (c) => {
  const r = origSelect.get(c.req.param('id'));
  if (!r) return c.notFound();
  const p = c.req.query('provider');
  q("UPDATE fh_receipts SET status='pending' WHERE id=?").run(r.id);
  queue.push({ id: r.id, force: ['ollama', 'gemini'].includes(p) ? p : undefined });
  runQueue();
  return c.json(receiptOut(origSelect.get(r.id)));
});

api.delete('/receipts/:id', W, async (c) => {
  const r = origSelect.get(c.req.param('id'));
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
  if (!q('SELECT 1 FROM fh_categories WHERE id=?').get(+b.categoryId)) return bad(c, 'Ukjent kategori');
  if (amount === null || amount <= 0) q('DELETE FROM fh_budgets WHERE category_id=? AND month=?').run(+b.categoryId, month);
  else q('INSERT INTO fh_budgets(category_id,month,amount) VALUES(?,?,?) ON CONFLICT(category_id,month) DO UPDATE SET amount=excluded.amount').run(+b.categoryId, month, amount);
  return ok(c);
});

/* --- Faste utgifter --- */

api.get('/recurring', R, (c) => { const cats = catById(); return c.json(q('SELECT * FROM fh_recurring ORDER BY day, id').all().map((r) => recurringOut(r, cats))); });
function recVals(b, cur = {}) {
  const amount = b.amount !== undefined ? ore(b.amount) : cur.amount;
  return { name: b.name !== undefined ? str(b.name, 80) : cur.name, amount: amount != null ? Math.abs(amount) : null,
    interval: ['monthly', 'yearly', 'weekly'].includes(b.interval) ? b.interval : cur.interval ?? 'monthly',
    day: b.day !== undefined ? Math.min(31, Math.max(1, +b.day || 1)) : cur.day ?? 1, month: b.month !== undefined ? (+b.month || null) : cur.month ?? null,
    category_id: b.categoryId !== undefined ? (+b.categoryId || null) : cur.category_id ?? null, account_id: b.accountId !== undefined ? (+b.accountId || null) : cur.account_id ?? null,
    active: b.active !== undefined ? (b.active ? 1 : 0) : cur.active ?? 1 };
}
api.post('/recurring', W, async (c) => {
  const v = recVals(await c.req.json());
  if (!v.name || !v.amount) return bad(c, 'Navn og beløp må fylles ut');
  const r = q('INSERT INTO fh_recurring(name,amount,interval,day,month,category_id,account_id,active) VALUES(?,?,?,?,?,?,?,?) RETURNING *').get(v.name, v.amount, v.interval, v.day, v.month, v.category_id, v.account_id, v.active);
  return c.json(recurringOut(r));
});
api.patch('/recurring/:id', W, async (c) => {
  const cur = q('SELECT * FROM fh_recurring WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const v = recVals(await c.req.json(), cur);
  const r = q('UPDATE fh_recurring SET name=?, amount=?, interval=?, day=?, month=?, category_id=?, account_id=?, active=? WHERE id=? RETURNING *').get(v.name, v.amount, v.interval, v.day, v.month, v.category_id, v.account_id, v.active, cur.id);
  return c.json(recurringOut(r));
});
api.delete('/recurring/:id', W, (c) => { q('DELETE FROM fh_recurring WHERE id=?').run(+c.req.param('id')); return ok(c); });

// Oppdag gjentakende trekk: samme butikk i minst 3 ulike måneder siste 7 måneder, med omtrent likt beløp.
api.post('/recurring/detect', W, (c) => {
  const since = shiftMonth(curMonth(), -7) + '-01';
  const rows = q(`SELECT t.* FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.amount<0 AND t.date>=? AND COALESCE(c.kind,'expense')='expense'`).all(since);
  const groups = new Map();
  for (const t of rows) {
    const key = (t.merchant || t.description).toUpperCase().replace(/[0-9*#.,:/-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
    if (key.length < 3) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(t);
  }
  const existing = new Set(q('SELECT upper(name) n FROM fh_recurring').all().map((r) => r.n));
  let added = 0;
  for (const [key, list] of groups) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    if (months.size < 3 || existing.has(key)) continue;
    const amounts = list.map((t) => -t.amount).sort((a, b) => a - b), med = amounts[Math.floor(amounts.length / 2)];
    if (amounts.filter((a) => Math.abs(a - med) <= med * 0.1).length < 3) continue;
    const days = list.map((t) => +t.date.slice(8)).sort((a, b) => a - b), day = days[Math.floor(days.length / 2)];
    const name = key.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
    q('INSERT INTO fh_recurring(name,amount,interval,day,category_id,account_id,active,detected) VALUES(?,?,?,?,?,?,1,1)').run(name, med, 'monthly', day, list[0].category_id, list[0].account_id);
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
  const r = q('INSERT INTO fh_accounts(name,bank,type,last4,opening_balance,note,sort) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM fh_accounts)) RETURNING id')
    .get(str(b.name, 60), str(b.bank, 60), ACC_TYPES.includes(b.type) ? b.type : 'checking', l4, ore(b.openingBalance) ?? 0, str(b.note, 120));
  return c.json({ id: r.id });
});
api.patch('/accounts/:id', W, async (c) => {
  const cur = q('SELECT * FROM fh_accounts WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_accounts SET name=?, bank=?, type=?, last4=?, opening_balance=?, note=? WHERE id=?').run(
    b.name !== undefined ? str(b.name, 60) || cur.name : cur.name, b.bank !== undefined ? str(b.bank, 60) : cur.bank,
    ACC_TYPES.includes(b.type) ? b.type : cur.type, b.last4 !== undefined ? String(b.last4).replace(/\D/g, '').slice(-4) || null : cur.last4,
    b.openingBalance !== undefined ? ore(b.openingBalance) ?? cur.opening_balance : cur.opening_balance, b.note !== undefined ? str(b.note, 120) : cur.note, cur.id);
  return ok(c);
});
api.delete('/accounts/:id', W, (c) => { q('DELETE FROM fh_accounts WHERE id=?').run(+c.req.param('id')); return ok(c); });

api.post('/goals', W, async (c) => {
  const b = await c.req.json();
  if (!str(b.name) || !ore(b.target)) return bad(c, 'Navn og mål må fylles ut');
  q('INSERT INTO fh_goals(name,saved,target,color) VALUES(?,?,?,?)').run(str(b.name, 60), ore(b.saved) ?? 0, ore(b.target), hex(b.color) ?? '#5FD3A8');
  return ok(c);
});
api.patch('/goals/:id', W, async (c) => {
  const cur = q('SELECT * FROM fh_goals WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_goals SET name=?, saved=?, target=?, color=? WHERE id=?').run(b.name !== undefined ? str(b.name, 60) || cur.name : cur.name,
    b.saved !== undefined ? ore(b.saved) ?? cur.saved : cur.saved, b.target !== undefined ? ore(b.target) || cur.target : cur.target, hex(b.color) ?? cur.color, cur.id);
  return ok(c);
});
api.delete('/goals/:id', W, (c) => { q('DELETE FROM fh_goals WHERE id=?').run(+c.req.param('id')); return ok(c); });

const KINDS = ['expense', 'income', 'transfer'];
api.post('/categories', W, async (c) => {
  const b = await c.req.json();
  const name = str(b.name, 40);
  if (!name) return bad(c, 'Navn må fylles ut');
  if (q('SELECT 1 FROM fh_categories WHERE lower(name)=lower(?)').get(name)) return bad(c, 'Kategorien finnes allerede');
  const r = q('INSERT INTO fh_categories(name,color,kind,sort) VALUES(?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM fh_categories)) RETURNING id').get(name, hex(b.color) ?? '#8FD3FF', KINDS.includes(b.kind) ? b.kind : 'expense');
  return c.json({ id: r.id });
});
api.patch('/categories/:id', W, async (c) => {
  const cur = q('SELECT * FROM fh_categories WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  const name = b.name !== undefined ? str(b.name, 40) || cur.name : cur.name;
  if (name !== cur.name && q('SELECT 1 FROM fh_categories WHERE lower(name)=lower(?) AND id<>?').get(name, cur.id)) return bad(c, 'Navnet er i bruk');
  q('UPDATE fh_categories SET name=?, color=?, kind=? WHERE id=?').run(name, hex(b.color) ?? cur.color, KINDS.includes(b.kind) ? b.kind : cur.kind, cur.id);
  return ok(c);
});
api.delete('/categories/:id', W, (c) => { q('DELETE FROM fh_categories WHERE id=?').run(+c.req.param('id')); return ok(c); });

api.post('/rules', W, async (c) => {
  const b = await c.req.json();
  const p = str(b.pattern, 60).toUpperCase();
  if (!p || !q('SELECT 1 FROM fh_categories WHERE id=?').get(+b.categoryId)) return bad(c, 'Mønster og kategori må fylles ut');
  const r = q('INSERT INTO fh_rules(pattern,category_id,priority) VALUES(?,?,?) RETURNING id').get(p, +b.categoryId, Number.isInteger(b.priority) ? b.priority : 100);
  return c.json({ id: r.id });
});
api.patch('/rules/:id', W, async (c) => {
  const cur = q('SELECT * FROM fh_rules WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  q('UPDATE fh_rules SET pattern=?, category_id=? WHERE id=?').run(b.pattern !== undefined ? str(b.pattern, 60).toUpperCase() || cur.pattern : cur.pattern, b.categoryId !== undefined ? +b.categoryId || cur.category_id : cur.category_id, cur.id);
  return ok(c);
});
api.delete('/rules/:id', W, (c) => { q('DELETE FROM fh_rules WHERE id=?').run(+c.req.param('id')); return ok(c); });
// Bruk reglene på ukategoriserte transaksjoner.
api.post('/rules/apply', W, (c) => {
  let n = 0;
  for (const t of q('SELECT id, description, merchant FROM fh_transactions WHERE category_id IS NULL').all()) {
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
  const rows = q('SELECT * FROM fh_transactions WHERE date>=? AND date<?').all(from, to).filter((t) => (cats.get(t.category_id)?.kind ?? 'expense') !== 'transfer');
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
    for (const t of q('SELECT amount, category_id FROM fh_transactions WHERE date>=? AND date<?').all(p.from, p.to)) {
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

const SETTING_KEYS = { name: (v) => str(v, 40) || 'Sebastian', currency: (v) => (['NOK', 'EUR', 'SEK'].includes(v) ? v : 'NOK'), monthStart: (v) => Math.min(28, Math.max(1, +v || 1)),
  yearGoal: (v) => Math.max(0, +v || 0), provider: (v) => (v === 'gemini' ? 'gemini' : 'ollama'), fallback: Boolean,
  ollamaUrl: (v) => (/^https?:\/\/\S+$/.test(v) ? v : DEFAULT_SETTINGS.ollamaUrl), ollamaModel: (v) => str(v, 60) || DEFAULT_SETTINGS.ollamaModel,
  geminiModel: (v) => (/^[a-z0-9.\-]{3,60}$/i.test(v) ? v : DEFAULT_SETTINGS.geminiModel), minConf: (v) => Math.min(99, Math.max(50, +v || 85)),
  autoCat: Boolean, n80: Boolean, n100: Boolean, nRc: Boolean, nFast: Boolean, csvProfile: (v) => (PROFILES.includes(v) ? v : 'DNB'),
  aiSummaries: Boolean, imapHost: (v) => (/^[a-z0-9.-]{0,120}$/i.test(v) ? v : ''), imapUser: (v) => str(v, 120), imapFolder: (v) => str(v, 60) || 'INBOX' };

api.put('/settings', W, async (c) => {
  const b = await c.req.json();
  const patch = {};
  for (const [k, fn] of Object.entries(SETTING_KEYS)) if (b[k] !== undefined) patch[k] = fn(b[k]);
  saveSettings(patch);
  if (typeof b.geminiKey === 'string' && c.get('access').session) setSecret('geminiKey', b.geminiKey.trim());
  if (typeof b.imapPass === 'string' && c.get('access').session) setSecret('imapPass', b.imapPass);
  return c.json({ ...settings(), geminiKeySet: !!secret('geminiKey'), imapPassSet: !!secret('imapPass') });
});

api.get('/health/ai', R, async (c) => c.json(await health()));

api.get('/tokens', sessionOnly, (c) => c.json(q('SELECT id, name, scopes, created, last_used FROM fh_tokens ORDER BY created DESC').all().map((t) => ({ ...t, id: t.id.slice(0, 12), scopes: t.scopes.split(' ') }))));
api.post('/tokens', sessionOnly, async (c) => {
  const b = await c.req.json();
  const scopes = (Array.isArray(b.scopes) ? b.scopes : ['finance:read', 'receipts:write']).filter((s) => SCOPES.includes(s));
  if (!scopes.length) return bad(c, 'Velg minst én tilgang');
  const token = 'fh_' + randomBytes(24).toString('base64url');
  q('INSERT INTO fh_tokens(id,name,scopes,created) VALUES(?,?,?,?)').run(tokenKey(token), str(b.name, 60) || 'Mobil', scopes.join(' '), Date.now());
  return c.json({ token, scopes }); // vises én gang
});
api.delete('/tokens/:id', sessionOnly, (c) => { q('DELETE FROM fh_tokens WHERE substr(id,1,12)=?').run(c.req.param('id')); return ok(c); });

/* --- Subscription OS --- */

const monthlyOre = (s) => (s.cycle === 'yearly' ? s.price / 12 : s.price);
function subOut(s) {
  return { id: s.id, name: s.name, plan: s.plan, price: s.price / 100, cycle: s.cycle, nextDate: s.next_date, usageNote: s.usage_note, lowUse: !!s.low_use,
    active: !!s.active, domain: s.domain || domainFor(s.name), aiShort: s.ai_short || heuristic({ merchant: s.name, category: 'Abonnementer' }).short, txId: s.tx_id,
    monthly: monthlyOre(s) / 100 };
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
  const rows = q('SELECT * FROM fh_subscriptions ORDER BY active DESC, COALESCE(next_date, \'9999\'), name').all().map(subOut);
  const act = rows.filter((s) => s.active);
  const monthly = act.reduce((a, s) => a + s.monthly, 0);
  return c.json({ items: rows, monthly: Math.round(monthly * 100) / 100, yearly: Math.round(monthly * 1200) / 100,
    lowUse: Math.round(act.filter((s) => s.lowUse).reduce((a, s) => a + s.monthly, 0) * 100) / 100 });
});
api.post('/subscriptions', W, async (c) => {
  const b = await c.req.json();
  if (b.fromTx) { // gjør en transaksjon om til et abonnement
    const t = q('SELECT * FROM fh_transactions WHERE id=?').get(+b.fromTx);
    if (!t) return c.notFound();
    const name = t.merchant || t.description;
    const s = q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,domain,ai_short,tx_id,created) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *')
      .get(name, str(b.plan, 80), Math.abs(t.amount), 'monthly', shiftDate(t.date, 1), 'Månedlig', t.domain || domainFor(name), t.ai_short, t.id, Date.now());
    return c.json(subOut(s));
  }
  const price = ore(b.price);
  if (!str(b.name) || price === null) return bad(c, 'Tjeneste og pris må fylles ut');
  const s = q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,low_use,domain,created) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(str(b.name, 80), str(b.plan, 80), Math.abs(price), b.cycle === 'yearly' ? 'yearly' : 'monthly', dateIn(b.nextDate), str(b.usageNote, 80) || 'Ny', b.lowUse ? 1 : 0,
      validDomain(b.domain) || domainFor(b.name), Date.now());
  return c.json(subOut(s));
});
api.post('/subscriptions/receipts', need('receipts:write'), upload, (c) => receiptUpload(c, 'sub'));
api.patch('/subscriptions/:id', W, async (c) => {
  const cur = q('SELECT * FROM fh_subscriptions WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  const n = { ...cur };
  if (b.name !== undefined) n.name = str(b.name, 80) || cur.name;
  if (b.plan !== undefined) n.plan = str(b.plan, 80);
  if (b.price !== undefined && ore(b.price) !== null) n.price = Math.abs(ore(b.price));
  if (b.cycle !== undefined) n.cycle = b.cycle === 'yearly' ? 'yearly' : 'monthly';
  if (b.nextDate !== undefined) n.next_date = dateIn(b.nextDate);
  if (b.usageNote !== undefined) n.usage_note = str(b.usageNote, 80);
  if (b.lowUse !== undefined) n.low_use = b.lowUse ? 1 : 0;
  if (b.active !== undefined) n.active = b.active ? 1 : 0;
  if (b.domain !== undefined) { n.domain = validDomain(b.domain); if (n.domain) learnDomain(n.name, n.domain); }
  const s = q('UPDATE fh_subscriptions SET name=?, plan=?, price=?, cycle=?, next_date=?, usage_note=?, low_use=?, active=?, domain=? WHERE id=? RETURNING *')
    .get(n.name, n.plan, n.price, n.cycle, n.next_date, n.usage_note, n.low_use, n.active, n.domain, cur.id);
  return c.json(subOut(s));
});
api.delete('/subscriptions/:id', W, (c) => { q('DELETE FROM fh_subscriptions WHERE id=?').run(+c.req.param('id')); return ok(c); });

/* --- Delte mapper --- */
// Én bruker i homelab: medlemmer er navngitte personer (med valgfri e-post). Saldo = betalt − lik andel.
// Invitasjon lagrer e-posten som «invitert»; selve utsendingen krever SMTP og er ikke satt opp ennå.

function folderOut(f, full = false) {
  const mem = q('SELECT * FROM fh_folder_members WHERE folder_id=? ORDER BY role=\'owner\' DESC, id').all(f.id);
  const entries = q('SELECT * FROM fh_folder_entries WHERE folder_id=? ORDER BY date DESC, id DESC').all(f.id);
  const total = entries.reduce((a, e) => a + e.amount, 0);
  const out = { id: f.id, name: f.name, members: mem.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, status: m.status })), total: total / 100, count: entries.length };
  if (!full) return out;
  const share = mem.length ? total / mem.length : 0;
  out.balances = mem.map((m) => ({ name: m.name, paid: entries.filter((e) => e.paid_by === m.name).reduce((a, e) => a + e.amount, 0) / 100,
    balance: Math.round(entries.filter((e) => e.paid_by === m.name).reduce((a, e) => a + e.amount, 0) - share) / 100 }));
  out.entries = entries.map((e) => {
    const t = e.tx_id ? q('SELECT ai_short, domain, merchant, description, amount FROM fh_transactions WHERE id=?').get(e.tx_id) : null;
    const r = e.receipt_id ? origSelect.get(e.receipt_id) : null;
    const pending = r && (r.status === 'pending' || r.status === 'processing');
    return { id: e.id, description: e.description, date: e.date, amount: e.amount / 100, paidBy: e.paid_by, split: e.split === 'equal' ? `Likt på ${mem.length}` : e.split,
      txId: e.tx_id, receiptId: e.receipt_id, domain: t?.domain || r?.domain || domainFor(e.description),
      aiShort: pending ? 'Gemini leser kvitteringen …' : t?.ai_short || r?.ai_short || heuristic({ merchant: e.description, amount: -e.amount / 100 }).short };
  });
  return out;
}
const memberNames = (v) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
  .map((x) => /@/.test(x) ? { name: x.split('@')[0].replace(/[._-]+/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase()).slice(0, 40), email: x.slice(0, 120), status: 'invited' } : { name: x.slice(0, 40), email: null, status: 'active' });

api.get('/folders', R, (c) => c.json(q('SELECT * FROM fh_folders ORDER BY id').all().map((f) => folderOut(f))));
api.get('/folders/:id', R, (c) => { const f = q('SELECT * FROM fh_folders WHERE id=?').get(+c.req.param('id')); return f ? c.json(folderOut(f, true)) : c.notFound(); });
api.post('/folders', W, async (c) => {
  const b = await c.req.json();
  if (!str(b.name)) return bad(c, 'Gi mappen et navn');
  const f = q('INSERT INTO fh_folders(name,created) VALUES(?,?) RETURNING *').get(str(b.name, 60), Date.now());
  const add = q('INSERT INTO fh_folder_members(folder_id,name,email,role,status) VALUES(?,?,?,?,?)');
  add.run(f.id, settings().name, null, 'owner', 'active');
  for (const m of memberNames(b.members ?? b.invite)) if (m.name !== settings().name) add.run(f.id, m.name, m.email, 'member', m.status);
  return c.json(folderOut(f, true));
});
api.patch('/folders/:id', W, async (c) => {
  const b = await c.req.json();
  if (str(b.name)) q('UPDATE fh_folders SET name=? WHERE id=?').run(str(b.name, 60), +c.req.param('id'));
  const f = q('SELECT * FROM fh_folders WHERE id=?').get(+c.req.param('id'));
  return f ? c.json(folderOut(f, true)) : c.notFound();
});
api.delete('/folders/:id', W, (c) => { q('DELETE FROM fh_folders WHERE id=?').run(+c.req.param('id')); return ok(c); });
api.post('/folders/:id/invite', W, async (c) => {
  const f = q('SELECT * FROM fh_folders WHERE id=?').get(+c.req.param('id'));
  if (!f) return c.notFound();
  const b = await c.req.json();
  const add = q('INSERT INTO fh_folder_members(folder_id,name,email,role,status) VALUES(?,?,?,?,?)');
  for (const m of memberNames(b.emails ?? b.members)) if (!q('SELECT 1 FROM fh_folder_members WHERE folder_id=? AND (name=? OR email=?)').get(f.id, m.name, m.email)) add.run(f.id, m.name, m.email, 'member', m.status);
  return c.json(folderOut(f, true));
});
api.delete('/folders/:id/members/:mid', W, (c) => { q("DELETE FROM fh_folder_members WHERE id=? AND folder_id=? AND role<>'owner'").run(+c.req.param('mid'), +c.req.param('id')); return ok(c); });
api.post('/folders/:id/entries', W, async (c) => {
  const f = q('SELECT * FROM fh_folders WHERE id=?').get(+c.req.param('id'));
  if (!f) return c.notFound();
  const b = await c.req.json();
  const owner = q("SELECT name FROM fh_folder_members WHERE folder_id=? ORDER BY role='owner' DESC, id LIMIT 1").get(f.id)?.name ?? settings().name;
  const members = new Set(q('SELECT name FROM fh_folder_members WHERE folder_id=?').all(f.id).map((m) => m.name));
  const paidBy = members.has(b.paidBy) ? b.paidBy : owner;
  const ins = q('INSERT INTO fh_folder_entries(folder_id,tx_id,description,date,amount,paid_by,created) VALUES(?,?,?,?,?,?,?)');
  if (b.txId) {
    const t = q('SELECT * FROM fh_transactions WHERE id=?').get(+b.txId);
    if (!t) return c.notFound();
    if (q('SELECT 1 FROM fh_folder_entries WHERE folder_id=? AND tx_id=?').get(f.id, t.id)) return bad(c, 'Transaksjonen ligger allerede i mappen');
    ins.run(f.id, t.id, t.merchant || t.description, t.date, Math.abs(t.amount), paidBy, Date.now());
  } else {
    const amount = ore(b.amount);
    if (!str(b.description) || amount === null) return bad(c, 'Beskrivelse og beløp må fylles ut');
    ins.run(f.id, null, str(b.description, 120), isDate(b.date) ? b.date : today(), Math.abs(amount), paidBy, Date.now());
  }
  return c.json(folderOut(f, true));
});
api.post('/folders/:id/receipts', need('receipts:write'), upload, (c) => q('SELECT 1 FROM fh_folders WHERE id=?').get(+c.req.param('id')) ? receiptUpload(c, `folder:${+c.req.param('id')}`) : c.notFound());
api.delete('/folders/:id/entries/:eid', W, (c) => { q('DELETE FROM fh_folder_entries WHERE id=? AND folder_id=?').run(+c.req.param('eid'), +c.req.param('id')); return ok(c); });

/* --- Finn-handler --- */
// Kilde: e-postkvitteringer fra Finn. Automatisk henting via IMAP (innstillingene imapHost/imapUser/imapPass)
// er ikke koblet på ennå; inntil videre limes e-posten inn, og AI (med regex-reserve) trekker ut handelen.

function finnOut(f) {
  const steps = JSON.parse(f.steps || '[]');
  return { id: f.id, role: f.role, item: f.item, counterpart: f.counterpart, date: f.date, amount: f.amount / 100, steps, txId: f.tx_id,
    done: steps.length > 0 && steps.every((s) => s.done), domain: 'finn.no' };
}
api.get('/finn', R, (c) => {
  const rows = q('SELECT * FROM fh_finn ORDER BY date DESC, id DESC').all().map(finnOut);
  const y = String(new Date().getFullYear());
  const sum = (role) => rows.filter((r) => r.role === role && r.date.startsWith(y)).reduce((a, r) => a + r.amount, 0);
  return c.json({ items: rows, bought: sum('bought'), sold: sum('sold'), ongoing: rows.filter((r) => !r.done).length,
    imap: { configured: !!(settings().imapHost && settings().imapUser && secret('imapPass')) } });
});
function finnMatch(role, amountOre, date) {
  const sign = role === 'sold' ? 1 : -1;
  return q("SELECT id FROM fh_transactions WHERE amount BETWEEN ? AND ? AND date BETWEEN date(?, '-5 days') AND date(?, '+10 days') ORDER BY abs(julianday(date)-julianday(?)) LIMIT 1")
    .get(sign * amountOre - 100, sign * amountOre + 100, date, date, date)?.id ?? null;
}
api.post('/finn', W, async (c) => {
  const b = await c.req.json();
  let d;
  if (str(b.email, 50000)) {
    try { d = await parseFinnEmail(String(b.email).slice(0, 50000)); } catch (e) { return bad(c, e.message); }
  } else {
    d = { role: b.role === 'sold' ? 'sold' : 'bought', item: str(b.item, 120), counterpart: str(b.counterpart, 80), date: isDate(b.date) ? b.date : today(), amount: +String(b.amount ?? '').replace(',', '.'),
      steps: Array.isArray(b.steps) ? b.steps.slice(0, 8).map((s) => ({ t: str(s.t ?? s, 60), done: !!s.done })) : [{ t: 'Trygg betaling', done: true }] };
  }
  if (!d.item || !Number.isFinite(d.amount) || d.amount <= 0) return bad(c, 'Fant ikke gjenstand og beløp');
  const amountOre = Math.round(d.amount * 100);
  const source = d.source ?? null;
  const existing = source ? q('SELECT * FROM fh_finn WHERE source=?').get(source) : null;
  if (existing) { // samme handel, ny statusmail: oppdater stegene
    q('UPDATE fh_finn SET steps=? WHERE id=?').run(JSON.stringify(d.steps), existing.id);
    return c.json(finnOut(q('SELECT * FROM fh_finn WHERE id=?').get(existing.id)));
  }
  const f = q('INSERT INTO fh_finn(role,item,counterpart,date,amount,steps,source,tx_id,created) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(d.role, d.item, d.counterpart ?? '', d.date, amountOre, JSON.stringify(d.steps ?? []), source, finnMatch(d.role, amountOre, d.date), Date.now());
  return c.json(finnOut(f));
});
api.patch('/finn/:id', W, async (c) => {
  const cur = q('SELECT * FROM fh_finn WHERE id=?').get(+c.req.param('id'));
  if (!cur) return c.notFound();
  const b = await c.req.json();
  const steps = Array.isArray(b.steps) ? JSON.stringify(b.steps.slice(0, 8).map((s) => ({ t: str(s.t, 60), done: !!s.done }))) : cur.steps;
  q('UPDATE fh_finn SET item=?, counterpart=?, steps=? WHERE id=?').run(b.item !== undefined ? str(b.item, 120) || cur.item : cur.item, b.counterpart !== undefined ? str(b.counterpart, 80) : cur.counterpart, steps, cur.id);
  return c.json(finnOut(q('SELECT * FROM fh_finn WHERE id=?').get(cur.id)));
});
api.delete('/finn/:id', W, (c) => { q('DELETE FROM fh_finn WHERE id=?').run(+c.req.param('id')); return ok(c); });

/* --- Import (XLSX, CSV, tekst) --- */
// Uten ?commit=1: forhåndsvisning. Med commit: lagres (duplikater hoppes over), AI kategoriserer og beskriver i bakgrunnen.

api.post('/import', W, upload, async (c) => {
  const b = await c.req.parseBody({ all: true });
  const files = asList(b.files).concat(asList(b['files[]']), asList(b.file));
  const text = typeof b.text === 'string' ? b.text : '';
  if (!files.length && !text.trim()) return bad(c, 'Velg filer eller lim inn tekst');
  const accountId = +b.accountId || q("SELECT id FROM fh_accounts WHERE type='checking' ORDER BY sort, id LIMIT 1").get()?.id || null;
  const rows = [], errors = [];
  let skipped = 0;
  const take = (cells) => { const r = rowsToTx(cells, accountId ?? 0); rows.push(...r.rows); skipped += r.skipped.length; };
  for (const f of files.slice(0, 20)) { try { take(await parseFile(f)); } catch (e) { errors.push(e.message); } }
  if (text.trim()) take(readText(text));
  if (!rows.length) return bad(c, errors[0] ?? 'Fant ingen rader med dato, tekst og beløp');
  const cats = catById();
  const auto = settings().autoCat;
  const preview = rows.map((r) => {
    const catId = auto ? (ruleFor(r.raw) ?? ruleFor(r.description)) : null;
    const dup = !!q('SELECT 1 FROM fh_transactions WHERE external_id=?').get(r.external_id);
    return { ...r, amount: r.amount / 100, categoryId: catId, category: cats.get(catId)?.name ?? null, domain: domainFor(r.description) ?? domainFor(r.raw),
      aiShort: heuristic({ merchant: r.raw, amount: r.amount / 100, category: cats.get(catId)?.name }).short, duplicate: dup };
  });
  if (c.req.query('commit') !== '1') return c.json({ rows: preview, imported: 0, skipped, errors });
  if (!accountId) return bad(c, 'Opprett en konto først');
  const ins = q("INSERT OR IGNORE INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,external_id,domain,created) VALUES(?,?,?,?,?,?,'import',?,?,?)");
  let imported = 0;
  db.transaction(() => { for (const r of preview) imported += ins.run(accountId, r.date, Math.round(r.amount * 100), r.description, r.description, r.categoryId, r.external_id, r.domain, Date.now()).changes; })();
  kickAi();
  return c.json({ rows: preview, imported, duplicates: preview.length - imported, skipped, errors });
});


/* --- Data --- */

api.get('/export.json', R, (c) => {
  const dump = {};
  for (const t of ['fh_accounts', 'fh_categories', 'fh_transactions', 'fh_budgets', 'fh_recurring', 'fh_rules', 'fh_goals', 'fh_subscriptions', 'fh_folders', 'fh_folder_members', 'fh_folder_entries', 'fh_finn']) dump[t.slice(3)] = q(`SELECT * FROM ${t}`).all();
  dump.receipts = q('SELECT id, status, provider, model, merchant, date, total, category_id, account_id, transaction_id, created FROM fh_receipts').all();
  dump.settings = settings();
  dump.note = 'Beløp er i øre. Kvitteringsbildene ligger i data/receipts på serveren.';
  return c.body(JSON.stringify(dump, null, 2), 200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="finanshub-${today()}.json"` });
});

api.post('/demo', sessionOnly, async (c) => {
  if (q('SELECT 1 FROM fh_transactions LIMIT 1').get()) return bad(c, 'Demodata kan bare lastes inn når det ikke finnes transaksjoner');
  const { loadDemo } = await import('./demo.js');
  loadDemo();
  return ok(c);
});

api.delete('/all', sessionOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.confirm !== 'SLETT') return bad(c, 'Skriv SLETT for å bekrefte');
  db.transaction(() => { for (const t of ['fh_folder_entries', 'fh_folder_members', 'fh_folders', 'fh_finn', 'fh_subscriptions', 'fh_receipts', 'fh_transactions', 'fh_budgets', 'fh_recurring', 'fh_goals', 'fh_accounts']) q(`DELETE FROM ${t}`).run(); })();
  return ok(c);
});

export default api;
