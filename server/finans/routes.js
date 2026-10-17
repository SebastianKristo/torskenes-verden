// FinansHub-API: /finans/api/*. Tilgang med innlogget sesjon (nettleser) eller API-token med finans-scope (mobil/snarvei).
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db, OWNER, settings, saveSettings, secret, setSecret, DEFAULT_SETTINGS } from './db.js';
import { extract, health, providerName } from './ai.js';
import { parseCsv, PROFILES } from './csv.js';
import { sessionUser, clientIp, loginBlocked, loginFailed, loginSucceeded } from '../auth.js';
import { verifyPassword } from '../password.js';
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
    accountId: t.account_id, account: acc?.name ?? '–', receipt: t.receipt_status ?? null, receiptId: t.receipt_id ?? null };
}

const TX_SELECT = `SELECT t.*, r.status AS receipt_status, r.id AS receipt_id FROM fh_transactions t
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
    extraction: ex, match: match ? txOut(match, cats, accs) : null, created: r.created };
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
    q("UPDATE fh_receipts SET status='processing', error=NULL WHERE id=?").run(id);
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
    } catch (e) {
      console.warn('[finans] Kvittering', id, e.message);
      q("UPDATE fh_receipts SET status='needs_review', error=?, confidence=0 WHERE id=? AND status='processing'").run(`Kunne ikke leses automatisk: ${e.message}. Fyll ut manuelt.`, id);
    }
  }
  running = false;
}
// Gjenoppta bilag som ble avbrutt ved omstart.
setTimeout(() => {
  for (const r of q("SELECT id FROM fh_receipts WHERE status IN ('pending','processing')").all()) queue.push({ id: r.id });
  runQueue();
}, 2000).unref?.();

/* ---------------- Ruter ---------------- */

const api = new Hono();

// Innlogging fra de native appene: passord → token med finans-tilganger. Samme rate limiting som nettinnloggingen.
// Tokenet gir bare tilgang til /finans/api, aldri til resten av homelab.
api.post('/auth/token', async (c) => {
  const ip = clientIp(c);
  const wait = loginBlocked(ip);
  if (wait) return bad(c, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.`, 429);
  const b = await c.req.json().catch(() => ({}));
  if (!config.passwordHash || !verifyPassword(String(b.password ?? ''), config.passwordHash)) {
    loginFailed(ip);
    await new Promise((r) => setTimeout(r, 400));
    return bad(c, 'Feil passord', 401);
  }
  loginSucceeded(ip);
  const token = 'fh_' + randomBytes(24).toString('base64url');
  q('INSERT INTO fh_tokens(id,name,scopes,created) VALUES(?,?,?,?)').run(tokenKey(token), str(b.deviceName, 60) || 'Mobilapp', SCOPES.join(' '), Date.now());
  return c.json({ token, scopes: SCOPES, user: settings().name });
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
    settings: { ...st, geminiKeySet: !!secret('geminiKey') }, month, period: period(month), profiles: PROFILES, user: st.name,
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
    budgets: Object.entries(bud).map(([id, v]) => ({ categoryId: +id, category: cats.get(+id)?.name, color: cats.get(+id)?.color, budget: v / 100, used: (cur.byCat[id] ?? 0) / 100 })).filter((b) => b.category),
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
  return c.json({ added, duplicates: parsed.rows.length - added, skipped: parsed.skipped.length });
});

/* --- Kvitteringer --- */

const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

api.post('/receipts', need('receipts:write'), upload, async (c) => {
  const b = await c.req.parseBody();
  const f = b.file;
  if (!(f instanceof File) || !MIME[f.type]) return bad(c, 'Last opp et bilde (JPEG, PNG, WebP, HEIC) eller en PDF');
  const id = randomUUID();
  const d = new Date(), sub = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  await mkdir(join(DIR, sub), { recursive: true });
  const file = `${sub}/${id}.${MIME[f.type]}`;
  await writeFile(join(DIR, file), Buffer.from(await f.arrayBuffer()));
  // Nettleseren sender en nedskalert JPEG (~1600 px) til AI-en og et lite miniatyrbilde. Originalen lagres urørt.
  let scan = null, thumb = null;
  if (b.scan instanceof File && b.scan.type === 'image/jpeg') { scan = `${sub}/${id}_scan.jpg`; await writeFile(join(DIR, scan), Buffer.from(await b.scan.arrayBuffer())); }
  if (b.thumb instanceof File && b.thumb.type === 'image/jpeg') { thumb = `${sub}/${id}_t.jpg`; await writeFile(join(DIR, thumb), Buffer.from(await b.thumb.arrayBuffer())); }
  const acc = +b.accountId || q('SELECT id FROM fh_accounts ORDER BY sort, id LIMIT 1').get()?.id || null;
  q("INSERT INTO fh_receipts(id,file,scan,thumb,mime,status,date,account_id,created) VALUES(?,?,?,?,?,'pending',?,?,?)").run(id, file, scan, thumb, f.type, today(), acc, Date.now());
  queue.push({ id });
  runQueue();
  return c.json(receiptOut(q('SELECT * FROM fh_receipts WHERE id=?').get(id)));
});
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
      q('UPDATE fh_transactions SET category_id=COALESCE(?, category_id), merchant=? WHERE id=?').run(r.category_id, r.merchant, txId);
    } else {
      txId = q("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,created) VALUES(?,?,?,?,?,?,'receipt',?) RETURNING id")
        .get(r.account_id, r.date, -r.total, r.merchant, r.merchant, r.category_id, Date.now()).id;
    }
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
  autoCat: Boolean, n80: Boolean, n100: Boolean, nRc: Boolean, nFast: Boolean, csvProfile: (v) => (PROFILES.includes(v) ? v : 'DNB') };

api.put('/settings', W, async (c) => {
  const b = await c.req.json();
  const patch = {};
  for (const [k, fn] of Object.entries(SETTING_KEYS)) if (b[k] !== undefined) patch[k] = fn(b[k]);
  saveSettings(patch);
  if (typeof b.geminiKey === 'string' && c.get('access').session) setSecret('geminiKey', b.geminiKey.trim());
  return c.json({ ...settings(), geminiKeySet: !!secret('geminiKey') });
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

/* --- Data --- */

api.get('/export.json', R, (c) => {
  const dump = {};
  for (const t of ['fh_accounts', 'fh_categories', 'fh_transactions', 'fh_budgets', 'fh_recurring', 'fh_rules', 'fh_goals']) dump[t.slice(3)] = q(`SELECT * FROM ${t}`).all();
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
  db.transaction(() => { for (const t of ['fh_receipts', 'fh_transactions', 'fh_budgets', 'fh_recurring', 'fh_goals', 'fh_accounts']) q(`DELETE FROM ${t}`).run(); })();
  return ok(c);
});

export default api;
