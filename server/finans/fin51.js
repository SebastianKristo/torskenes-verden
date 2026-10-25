// Prompt 51 (FIN51): Finans fase 2 – sparemål, faste utgifter-kalender med saldoprognose, skattehjelp, prishistorikk
// fra kvitteringsvarelinjer og abonnementsjeger. Montert under /finans/api FØR routes.js (index.js), med egen tilgangskontroll
// (økt eller API-token med finance:read / finance:write, som resten av FinansHub) – alt kjører som brukeren og filtrerer på user_id.
// «Finansdata forlater aldri huset»: ingen eksterne kall her. Oppsigelsesteksten lages av en lokal modell via ai-gate (run med
// localOnly), og sendes aldri automatisk – brukeren kopierer den selv.
//
// API (former i $S/SERVER51-API.md, seksjon FIN51):
//   GET    /fin51/goals                         → {items:[Goal], totals, roundUp, accounts:[{id, name, type, balance}]}
//   POST   /fin51/goals {name, target, saved?, deadline?, color?, accountId?, note?} → Goal
//   PATCH  /fin51/goals/:id {…}                 → Goal          · DELETE /fin51/goals/:id → {ok}
//   POST   /fin51/goals/:id/deposit {amount, note?} → Goal (negativt beløp = uttak)
//   GET    /fin51/goals/:id/moves               → {items:[{id, date, amount, source, note}]}
//   PUT    /fin51/goals/:id/image (bilde som body eller multipart «image», maks 4 MB) → Goal · DELETE …/image · GET …/image
//   GET    /fin51/roundup?step=10               → RoundUp     · PUT /fin51/roundup {step?, goalId?} → RoundUp
//   POST   /fin51/roundup/apply {goalId?, step?} → {goal, applied:{amount, count, from, until}}
//   GET    /fin51/calendar?days=30              → {from, to, days:[…], accounts:[…], total, lowest, items}
//   GET    /fin51/hunter?weeks=6                → {findings:[…], summary, signals}
//   POST   /fin51/hunter/used {subId}           → {ok, lastUsed}   (bruk-signal: «Jeg bruker den»)
//   POST   /fin51/hunter/dismiss {key}          → {ok}             · DELETE /fin51/hunter/dismiss → {ok} (vis alle igjen)
//   POST   /fin51/hunter/draft {subId | name, reason?} → {subject, text, engine:'lokal'|'mal', model, sent:false, note}
//   Skattehjelp → fin51-tax.js · Prishistorikk → fin51-prices.js
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db, kv } from './db.js';
import { config } from '../config.js';
import { auth42 } from './finans42.js';
import { recurringFromTx42 } from './finans42.js';
import { sniffMime } from './scan.js';
import { userInfo } from '../auth.js';
import { run as aiRun } from '../ai-run.js';
import { mountTax51 } from './fin51-tax.js';
import { mountPrices51 } from './fin51-prices.js';
import {
  q51 as q, today51, isDate51, addDays51, daysBetween51, addMonths51, r2, kr51, krText51, ore51, str51, bad51 as bad, dayLabel51, weekday51,
  key51, accounts51, defaultAccount51, tx51, median51, mostUsedAccount51,
} from './fin51-util.js';

const R = auth42('finance:read'), W = auth42('finance:write');
export const fin51Api = new Hono();
const ok = (c) => c.json({ ok: true });

/* ---------------- Skjema (additivt) ---------------- */

const addCol = (t, col, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
addCol('fh_goals', 'deadline', 'TEXT');        // ÅÅÅÅ-MM-DD
addCol('fh_goals', 'image', 'TEXT');           // filnavn under DATA_DIR/finans51/goals
addCol('fh_goals', 'account_id', 'INTEGER');   // sparekonto: «spart» følger saldoen
addCol('fh_goals', 'note', "TEXT NOT NULL DEFAULT ''");
addCol('fh_goals', 'created', 'INTEGER');
db.exec(`
CREATE TABLE IF NOT EXISTS fin51_goal_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,                  -- øre, negativt = uttak
  source TEXT NOT NULL DEFAULT 'manual',    -- manual | roundup | start
  note TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fin51_goal_moves_goal ON fin51_goal_moves(goal_id, date);
CREATE TABLE IF NOT EXISTS fin51_usage (
  user_id TEXT NOT NULL,
  sub_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (user_id, sub_id, source)
);
`);
const IMG_DIR = () => resolve(config.dataDir, 'finans51', 'goals');

/* ---------------- Sparemål ---------------- */

const AVG_MONTH = 30.44;
const goalRow = (u, id) => q('SELECT * FROM fh_goals WHERE id=? AND user_id=?').get(id, u);
/** «Spart»: saldoen på sparekontoen når målet følger en konto, ellers lagret beløp. (øre) */
function savedOf(g, accs) {
  if (g.account_id) { const a = accs.find((x) => x.id === g.account_id); if (a) return Math.max(0, a.balance); }
  return g.saved ?? 0;
}
/** Tempo (øre per måned) de siste 90 dagene: innskudd på målet, eller netto inn på kontoen. */
function paceOf(u, g, today) {
  const from = addDays51(today, -90);
  const sum = g.account_id
    ? q('SELECT COALESCE(SUM(amount),0) s FROM fh_transactions WHERE user_id=? AND account_id=? AND date>? AND date<=?').get(u, g.account_id, from, today).s
    : q("SELECT COALESCE(SUM(amount),0) s FROM fin51_goal_moves WHERE user_id=? AND goal_id=? AND date>? AND date<=? AND source<>'start'").get(u, g.id, from, today).s;
  return Math.max(0, sum) / 3;
}
export function goalOut51(u, g, { accs = accounts51(u), today = today51() } = {}) {
  const saved = savedOf(g, accs), target = g.target, remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 1000) / 10) : 0;
  const pace = paceOf(u, g, today);
  const daysLeft = g.deadline ? daysBetween51(today, g.deadline) : null;
  const monthsLeft = daysLeft != null ? Math.max(0, daysLeft / AVG_MONTH) : null;
  const perMonth = remaining && monthsLeft != null ? (monthsLeft >= 1 ? remaining / monthsLeft : remaining) : 0;
  const etaMonths = remaining && pace > 0 ? remaining / pace : null;
  const eta = etaMonths != null ? addDays51(today, Math.ceil(etaMonths * AVG_MONTH)) : null;
  let status, statusText;
  if (remaining <= 0) { status = 'done'; statusText = 'Målet er nådd'; }
  else if (daysLeft != null && daysLeft < 0) { status = 'overdue'; statusText = `Fristen gikk ut ${dayLabel51(g.deadline)} – ${krText51(kr51(remaining))} gjenstår`; }
  else if (daysLeft == null) { status = 'no_deadline'; statusText = eta ? `Med dagens tempo er du i mål rundt ${dayLabel51(eta)} ${eta.slice(0, 4)}` : saved > 0 ? `${krText51(kr51(remaining))} igjen – sett en frist for å få et månedsbeløp` : 'Ingen frist – sett inn et beløp for å komme i gang'; }
  else if (pace >= perMonth * 0.95) { status = 'on_track'; statusText = `Du er i rute – ${krText51(kr51(perMonth))} i måneden holder`; }
  else { status = 'behind'; statusText = `Spar ${krText51(kr51(perMonth))} i måneden for å nå målet ${dayLabel51(g.deadline)} ${g.deadline.slice(0, 4)}`; }
  const acc = g.account_id ? accs.find((x) => x.id === g.account_id) : null;
  const moves = q('SELECT id, date, amount, source, note FROM fin51_goal_moves WHERE user_id=? AND goal_id=? ORDER BY date DESC, id DESC LIMIT 5').all(u, g.id)
    .map((m) => ({ id: m.id, date: m.date, amount: kr51(m.amount), source: m.source, note: m.note }));
  return {
    id: g.id, name: g.name, color: g.color, note: g.note ?? '', target: kr51(target), saved: kr51(saved), remaining: kr51(remaining), pct,
    deadline: g.deadline ?? null, deadlineLabel: g.deadline ? `${dayLabel51(g.deadline)} ${g.deadline.slice(0, 4)}` : null, daysLeft, monthsLeft: monthsLeft != null ? r2(monthsLeft) : null,
    perMonth: kr51(Math.round(perMonth)), pace: kr51(Math.round(pace)), eta, status, statusText,
    accountId: acc?.id ?? null, account: acc ? acc.name : null, followsAccount: !!acc,
    imageUrl: g.image ? `/finans/api/fin51/goals/${g.id}/image?v=${encodeURIComponent(g.image.slice(0, 8))}` : null, moves,
  };
}
function goalVals(b, cur = {}) {
  const v = { ...cur };
  if (b.name !== undefined) v.name = str51(b.name, 60) || cur.name;
  if (b.target !== undefined) { const t = ore51(b.target); if (t && t > 0) v.target = t; }
  if (b.saved !== undefined) { const s = ore51(b.saved); if (s != null && s >= 0) v.saved = s; }
  if (b.deadline !== undefined) v.deadline = isDate51(b.deadline) ? b.deadline : null;
  if (b.color !== undefined) v.color = /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : cur.color ?? '#5FD3A8';
  if (b.note !== undefined) v.note = str51(b.note, 200);
  if (b.accountId !== undefined) v.account_id = b.accountId ? +b.accountId : null;
  return v;
}
fin51Api.get('/fin51/goals', R, (c) => {
  const u = c.get('user'), accs = accounts51(u), today = today51();
  const items = q('SELECT * FROM fh_goals WHERE user_id=? ORDER BY (deadline IS NULL), deadline, id').all(u).map((g) => goalOut51(u, g, { accs, today }));
  const saved = items.reduce((a, g) => a + g.saved, 0), target = items.reduce((a, g) => a + g.target, 0);
  return c.json({ items, totals: { saved: r2(saved), target: r2(target), pct: target ? Math.round((saved / target) * 1000) / 10 : 0, count: items.length }, roundUp: roundUp51(u, {}, today),
    accounts: accs.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: kr51(a.balance) })) });
});
fin51Api.post('/fin51/goals', W, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({}));
  const v = goalVals(b, { color: '#5FD3A8', saved: 0, note: '' });
  if (!v.name || !v.target) return bad(c, 'Navn og målbeløp må fylles ut');
  if (v.account_id && !q('SELECT 1 FROM fh_accounts WHERE id=? AND user_id=?').get(v.account_id, u)) return bad(c, 'Ukjent konto');
  const g = q('INSERT INTO fh_goals(name,saved,target,color,deadline,account_id,note,created,user_id) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(v.name, v.saved ?? 0, v.target, v.color, v.deadline ?? null, v.account_id ?? null, v.note ?? '', Date.now(), u);
  if (g.saved > 0) q("INSERT INTO fin51_goal_moves(goal_id,user_id,date,amount,source,note,created) VALUES(?,?,?,?,'start','Startbeløp',?)").run(g.id, u, today51(), g.saved, Date.now());
  return c.json(goalOut51(u, g));
});
fin51Api.patch('/fin51/goals/:id', W, async (c) => {
  const u = c.get('user'), cur = goalRow(u, +c.req.param('id'));
  if (!cur) return bad(c, 'Fant ikke sparemålet', 404);
  const v = goalVals(await c.req.json().catch(() => ({})), cur);
  if (v.account_id && !q('SELECT 1 FROM fh_accounts WHERE id=? AND user_id=?').get(v.account_id, u)) return bad(c, 'Ukjent konto');
  q('UPDATE fh_goals SET name=?, saved=?, target=?, color=?, deadline=?, account_id=?, note=? WHERE id=? AND user_id=?').run(v.name, v.saved, v.target, v.color, v.deadline ?? null, v.account_id ?? null, v.note ?? '', cur.id, u);
  return c.json(goalOut51(u, goalRow(u, cur.id)));
});
fin51Api.delete('/fin51/goals/:id', W, async (c) => {
  const u = c.get('user'), g = goalRow(u, +c.req.param('id'));
  if (!g) return ok(c);
  q('DELETE FROM fin51_goal_moves WHERE goal_id=? AND user_id=?').run(g.id, u);
  q('DELETE FROM fh_goals WHERE id=? AND user_id=?').run(g.id, u);
  if (g.image) await unlink(join(IMG_DIR(), g.image)).catch(() => {});
  return ok(c);
});
/** Setter inn (eller tar ut) et beløp på et mål. → goal-rad eller {error} */
export function deposit51(u, goalId, amountOre, { source = 'manual', note = '', date = today51() } = {}) {
  const g = goalRow(u, goalId);
  if (!g) return { error: 'Fant ikke sparemålet', status: 404 };
  if (g.account_id) return { error: 'Målet følger saldoen på sparekontoen – overfør pengene i nettbanken, så oppdateres målet når transaksjonen kommer inn', status: 409 };
  if (!amountOre) return { error: 'Skriv et beløp', status: 400 };
  const next = Math.max(0, (g.saved ?? 0) + amountOre);
  db.transaction(() => {
    q('INSERT INTO fin51_goal_moves(goal_id,user_id,date,amount,source,note,created) VALUES(?,?,?,?,?,?,?)').run(g.id, u, date, next - (g.saved ?? 0), source, note, Date.now());
    q('UPDATE fh_goals SET saved=? WHERE id=?').run(next, g.id);
  })();
  return { goal: goalRow(u, g.id) };
}
fin51Api.post('/fin51/goals/:id/deposit', W, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({}));
  const r = deposit51(u, +c.req.param('id'), ore51(b.amount), { note: str51(b.note, 120) });
  if (r.error) return bad(c, r.error, r.status);
  return c.json(goalOut51(u, r.goal));
});
fin51Api.get('/fin51/goals/:id/moves', R, (c) => {
  const u = c.get('user'), g = goalRow(u, +c.req.param('id'));
  if (!g) return bad(c, 'Fant ikke sparemålet', 404);
  return c.json({ items: q('SELECT id, date, amount, source, note FROM fin51_goal_moves WHERE user_id=? AND goal_id=? ORDER BY date DESC, id DESC LIMIT 200').all(u, g.id).map((m) => ({ ...m, amount: kr51(m.amount) })) });
});
const IMG_MAX = 4 * 1024 * 1024;
fin51Api.put('/fin51/goals/:id/image', W, async (c) => {
  const u = c.get('user'), g = goalRow(u, +c.req.param('id'));
  if (!g) return bad(c, 'Fant ikke sparemålet', 404);
  if (+(c.req.header('content-length') ?? 0) > IMG_MAX + 4096) return bad(c, 'Bildet kan være maks 4 MB', 413);
  let buf;
  if (/multipart\/form-data/i.test(c.req.header('content-type') ?? '')) {
    const f = (await c.req.formData().catch(() => null))?.get('image');
    if (!f || typeof f === 'string') return bad(c, 'Mangler bilde');
    buf = Buffer.from(await f.arrayBuffer());
  } else buf = Buffer.from(await c.req.arrayBuffer());
  if (!buf.length) return bad(c, 'Mangler bilde');
  if (buf.length > IMG_MAX) return bad(c, 'Bildet kan være maks 4 MB', 413);
  const mime = sniffMime(buf);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!ext) return bad(c, 'Bruk JPEG, PNG eller WebP');
  await mkdir(IMG_DIR(), { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  await writeFile(join(IMG_DIR(), file), buf);
  q('UPDATE fh_goals SET image=? WHERE id=? AND user_id=?').run(file, g.id, u);
  if (g.image) await unlink(join(IMG_DIR(), g.image)).catch(() => {});
  return c.json(goalOut51(u, goalRow(u, g.id)));
});
fin51Api.delete('/fin51/goals/:id/image', W, async (c) => {
  const u = c.get('user'), g = goalRow(u, +c.req.param('id'));
  if (!g) return bad(c, 'Fant ikke sparemålet', 404);
  q('UPDATE fh_goals SET image=NULL WHERE id=? AND user_id=?').run(g.id, u);
  if (g.image) await unlink(join(IMG_DIR(), g.image)).catch(() => {});
  return c.json(goalOut51(u, goalRow(u, g.id)));
});
fin51Api.get('/fin51/goals/:id/image', R, async (c) => {
  const u = c.get('user'), g = goalRow(u, +c.req.param('id'));
  if (!g?.image || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(g.image)) return c.body(null, 404);
  const buf = await readFile(join(IMG_DIR(), g.image)).catch(() => null);
  if (!buf) return c.body(null, 404);
  const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[g.image.split('.').pop()];
  return c.body(buf, 200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
});

/* ---------------- «Rund opp» ---------------- */

const STEPS = [5, 10, 20, 50, 100];
const ruCfg = (u) => ({ step: 10, goalId: null, until: null, ...(kv.get(u, 'fin51_roundup', null) ?? {}) });
/**
 * Forslag: hvert kjøp siste 30 dager (eller siden sist «rund opp» ble satt inn) rundes opp til nærmeste `step` kr,
 * og differansen foreslås satt inn på et sparemål. Bare utgifter (ikke overføringer, ikke inntekter).
 */
export function roundUp51(u, { step } = {}, today = today51()) {
  const cfg = ruCfg(u);
  const st = STEPS.includes(+step) ? +step : STEPS.includes(+cfg.step) ? +cfg.step : 10;
  const from = cfg.until && cfg.until >= addDays51(today, -30) ? addDays51(cfg.until, 1) : addDays51(today, -30);
  const rows = tx51(u, from, { to: today }).filter((t) => t.amount < 0 && t.kind === 'expense');
  const unit = st * 100;
  const parts = rows.map((t) => ({ t, up: Math.ceil(-t.amount / unit) * unit + t.amount })).filter((x) => x.up > 0);
  const amount = parts.reduce((a, x) => a + x.up, 0);
  const goals = q('SELECT id, name FROM fh_goals WHERE user_id=? ORDER BY id').all(u);
  const goal = goals.find((g) => g.id === cfg.goalId) ?? goals[0] ?? null;
  return {
    step: st, steps: STEPS, from, until: today, count: parts.length, purchases: rows.length, amount: kr51(amount),
    text: parts.length ? `Rund opp ${parts.length} kjøp til nærmeste ${st} kr: ${krText51(kr51(amount), amount % 100 !== 0)} til ${goal ? `«${goal.name}»` : 'et sparemål'}` : 'Ingen kjøp å runde opp siden sist',
    goalId: goal?.id ?? null, goal: goal?.name ?? null, lastApplied: cfg.until,
    sample: parts.slice(-5).reverse().map((x) => ({ date: x.t.date, name: x.t.name, amount: kr51(x.t.amount), roundUp: kr51(x.up) })),
  };
}
fin51Api.get('/fin51/roundup', R, (c) => c.json(roundUp51(c.get('user'), { step: c.req.query('step') })));
fin51Api.put('/fin51/roundup', W, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({})), cfg = ruCfg(u);
  if (b.step !== undefined) { if (!STEPS.includes(+b.step)) return bad(c, `Velg ${STEPS.join(', ')} kr`); cfg.step = +b.step; }
  if (b.goalId !== undefined) { if (b.goalId && !goalRow(u, +b.goalId)) return bad(c, 'Fant ikke sparemålet', 404); cfg.goalId = b.goalId ? +b.goalId : null; }
  kv.set(u, 'fin51_roundup', cfg);
  return c.json(roundUp51(u));
});
fin51Api.post('/fin51/roundup/apply', W, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({})), today = today51();
  const ru = roundUp51(u, { step: b.step }, today);
  const goalId = b.goalId ? +b.goalId : ru.goalId;
  const g = goalId ? goalRow(u, goalId) : null;
  if (!g) return bad(c, 'Lag et sparemål først', 404);
  if (!ru.count) return bad(c, 'Ingen kjøp å runde opp siden sist', 409);
  let goal;
  if (g.account_id) goal = g; // følger kontoen: brukeren overfører selv, vi merker bare at perioden er tatt
  else { const r = deposit51(u, g.id, Math.round(ru.amount * 100), { source: 'roundup', note: `Rund opp ${ru.count} kjøp (${dayLabel51(ru.from)}–${dayLabel51(ru.until)})` }); if (r.error) return bad(c, r.error, r.status); goal = r.goal; }
  kv.set(u, 'fin51_roundup', { ...ruCfg(u), step: ru.step, goalId: g.id, until: today });
  return c.json({ goal: goalOut51(u, goal), applied: { amount: ru.amount, count: ru.count, from: ru.from, until: ru.until, transferHint: g.account_id ? `Overfør ${krText51(ru.amount)} til sparekontoen i nettbanken` : null } });
});

/* ---------------- Faste utgifter-kalender med saldoprognose ---------------- */

const SUB_STEP = { monthly: 1, yearly: 12, biennial: 24 };
/** Datoene i [from, to] for et trekk som starter på `first` og gjentas hver `months` måned (eller `days` dag). */
function occurrences(first, { months = 0, days = 0 }, from, to, day = +first.slice(8, 10)) {
  const out = [];
  let d = first, i = 0, guard = 0;
  // Rull fram til perioden (gammel next_date).
  while (d < from && guard++ < 500) { i++; d = months ? addMonths51(first, months * i, day) : addDays51(first, days * i); }
  while (d <= to && guard++ < 1000) { out.push(d); i++; d = months ? addMonths51(first, months * i, day) : addDays51(first, days * i); }
  return out;
}
/** Neste dato for en fh_recurring-rad fra og med `from` (samme regel som routes.js). */
function recurringFirst(r, from) {
  const y = +from.slice(0, 4), m = +from.slice(5, 7);
  if (r.interval === 'yearly') { let x = addMonths51(`${y}-${String(r.month ?? 1).padStart(2, '0')}-01`, 0, r.day); if (x < from) x = addMonths51(x, 12, r.day); return { first: x, step: { months: 12 } }; }
  if (r.interval === 'weekly') { const wd = new Date(`${from}T12:00:00Z`).getUTCDay(); return { first: addDays51(from, ((r.day % 7) - wd + 7) % 7), step: { days: 7 } }; }
  let x = addMonths51(`${y}-${String(m).padStart(2, '0')}-01`, 0, r.day); if (x < from) x = addMonths51(x, 1, r.day);
  return { first: x, step: { months: 1 } };
}
/** Inntekter som kommer igjen (lønn o.l.): samme avsender ≥ 2 ganger siste 4 mnd, ca. hver måned, likt beløp (±20 %). */
export function incomeFromTx51(u, today = today51()) {
  const rows = tx51(u, addDays51(today, -125), { to: today }).filter((t) => t.amount > 0 && t.kind !== 'transfer');
  const by = new Map();
  for (const t of rows) { const k = key51(t.name); if (!k) continue; (by.get(k) ?? by.set(k, []).get(k)).push(t); }
  const out = [];
  for (const [k, list] of by) {
    if (list.length < 2) continue;
    const amts = list.map((t) => t.amount), med = median51(amts);
    if (amts.some((a) => Math.abs(a - med) > med * 0.2)) continue;
    const gaps = list.slice(1).map((t, i) => daysBetween51(list[i].date, t.date));
    if (!gaps.every((g) => Math.abs(g - 30) <= 5)) continue;
    const last = list.at(-1);
    out.push({ key: k, name: last.name, amount: Math.round(med), day: Math.round(median51(list.map((t) => +t.date.slice(8, 10)))), last: last.date, accountId: mostUsedAccount51(list) });
  }
  return out;
}
/**
 * Alle faste trekk og inntekter de neste `days` dagene, og saldoen dag for dag per konto.
 * Kilder (i prioritert rekkefølge, samme tjeneste telles bare én gang): abonnementer (Subscription OS) → faste utgifter →
 * gjentakende trekk funnet i transaksjonene → inntekter som kommer igjen.
 */
export function calendar51(u, { days = 30, today = today51() } = {}) {
  const n = Math.min(92, Math.max(7, Math.round(+days) || 30));
  const from = today, to = addDays51(today, n - 1);
  const accs = accounts51(u), defAcc = defaultAccount51(accs);
  const hist = tx51(u, addDays51(today, -400), { to: today });
  const histBy = new Map();
  for (const t of hist) { const k = key51(t.name); if (k) (histBy.get(k) ?? histBy.set(k, []).get(k)).push(t); }
  const accFor = (k, given = null) => given ?? mostUsedAccount51((histBy.get(k) ?? []).filter((t) => t.amount < 0)) ?? defAcc?.id ?? null;
  // Allerede bokført i perioden (i dag): samme tjeneste ±2 dager → ikke tell den igjen.
  const booked = (k, date) => (histBy.get(k) ?? []).some((t) => Math.abs(daysBetween51(t.date, date)) <= 2 && t.date <= today && date <= today);
  const items = [], seen = new Set();
  const push = (src) => (date) => { if (!booked(src.key, date)) items.push({ date, ...src }); };
  for (const s of q("SELECT * FROM fh_subscriptions WHERE user_id=? AND active=1").all(u)) {
    const k = key51(s.name) ?? `sub${s.id}`;
    const first = s.next_date && isDate51(s.next_date) ? s.next_date : null;
    if (!first) continue;
    seen.add(k);
    const src = { kind: 'sub', id: s.id, key: k, name: s.name, amount: -Math.abs(s.price), accountId: accFor(k), source: 'Abonnement' };
    occurrences(first, { months: SUB_STEP[s.cycle] ?? 1 }, from, to, s.charge_day || +first.slice(8, 10)).forEach(push(src));
  }
  for (const r of q('SELECT * FROM fh_recurring WHERE user_id=? AND active=1').all(u)) {
    const k = key51(r.name) ?? `rec${r.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const { first, step } = recurringFirst(r, from);
    const src = { kind: 'recurring', id: r.id, key: k, name: r.name, amount: -Math.abs(r.amount), accountId: accFor(k, r.account_id), source: 'Fast utgift' };
    occurrences(first, step, from, to, step.months ? r.day : undefined).forEach(push(src));
  }
  let detected = [];
  try { detected = recurringFromTx42(u, new Date(`${today}T12:00:00`)); } catch { detected = []; }
  for (const d of detected) {
    const k = key51(d.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const step = d.interval === 7 ? { days: 7 } : { months: { 30: 1, 90: 3, 365: 12 }[d.interval] ?? 1 };
    const src = { kind: 'detected', id: null, key: k, name: d.name, amount: -Math.round(d.amount * 100), accountId: accFor(k), source: 'Funnet i transaksjonene' };
    // Månedlige/årlige trekk: samme dag i måneden som sist (finans42 regner +30 dager).
    let first = step.months && isDate51(d.last) ? addMonths51(d.last, step.months) : d.nextDate;
    if (step.months) { const dd = +first.slice(8, 10); while (first < from) first = addMonths51(first, step.months, dd); }
    occurrences(first, step, from, to).forEach(push(src));
  }
  for (const inc of incomeFromTx51(u, today)) {
    if (seen.has(inc.key)) continue;
    seen.add(inc.key);
    let first = addMonths51(inc.last, 1, inc.day);
    while (first < from) first = addMonths51(first, 1, inc.day);
    const src = { kind: 'income', id: null, key: inc.key, name: inc.name, amount: inc.amount, accountId: inc.accountId ?? defAcc?.id ?? null, source: 'Inntekt' };
    occurrences(first, { months: 1 }, from, to, inc.day).forEach(push(src));
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount || a.name.localeCompare(b.name, 'nb'));
  const accName = new Map(accs.map((a) => [a.id, a.name]));
  const outItem = (it) => ({ date: it.date, kind: it.kind, id: it.id, name: it.name, amount: kr51(it.amount), accountId: it.accountId, account: accName.get(it.accountId) ?? null, source: it.source });
  // Saldo dag for dag per konto (slutten av dagen).
  const dayList = []; for (let i = 0; i < n; i++) dayList.push(addDays51(from, i));
  const accOut = accs.map((a) => {
    let bal = a.balance, min = a.balance, minDate = from;
    const series = dayList.map((date) => { for (const it of items) if (it.date === date && it.accountId === a.id) bal += it.amount; if (bal < min) { min = bal; minDate = date; } return { date, balance: kr51(bal) }; });
    const out = items.filter((it) => it.accountId === a.id);
    return { id: a.id, name: a.name, type: a.type, start: kr51(a.balance), end: kr51(bal), min: kr51(min), minDate, series,
      out: kr51(out.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0)), in: kr51(out.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0)),
      warn: min < 0 && a.type !== 'credit' ? `${a.name} går i minus ${dayLabel51(minDate)} (${krText51(kr51(min))})` : null };
  });
  const unassigned = items.filter((it) => !it.accountId || !accName.has(it.accountId));
  const daysOut = dayList.map((date) => {
    const its = items.filter((x) => x.date === date);
    return { date, label: `${weekday51(date)} ${dayLabel51(date)}`, today: date === today, items: its.map(outItem), total: kr51(its.reduce((s, x) => s + x.amount, 0)) };
  });
  // Lavest saldo: blant kontoene som har trekk i perioden (en liten kontantkonto uten trekk er ikke interessant).
  const lowest = accOut.filter((a) => a.type !== 'credit' && items.some((it) => it.accountId === a.id)).sort((a, b) => a.min - b.min)[0] ?? null;
  return {
    from, to, days: daysOut, items: items.map(outItem), accounts: accOut,
    total: { out: kr51(items.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0)), in: kr51(items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0)), count: items.length },
    lowest: lowest ? { accountId: lowest.id, account: lowest.name, balance: lowest.min, date: lowest.minDate } : null,
    warnings: accOut.map((a) => a.warn).filter(Boolean),
    unassigned: unassigned.length ? { count: unassigned.length, text: 'Noen trekk mangler konto – legg til en konto for å få prognose' } : null,
  };
}
fin51Api.get('/fin51/calendar', R, (c) => c.json(calendar51(c.get('user'), { days: c.req.query('days') })));

/* ---------------- Abonnementsjeger ---------------- */

// Tjenester som gjør det samme – to samtidig er ofte én for mye.
const OVERLAP = [
  ['Musikk', /\b(spotify|apple ?music|tidal|deezer|youtube ?music|amazon ?music|soundcloud)\b/i],
  ['Lagring i skyen', /\b(icloud|google ?one|dropbox|onedrive|microsoft ?365|jottacloud|pcloud|box\.com)\b/i],
  ['Passordbehandler', /\b(1password|lastpass|dashlane|bitwarden|keeper)\b/i],
  ['VPN', /\b(nordvpn|expressvpn|surfshark|protonvpn|mullvad|cyberghost)\b/i],
  ['Lydbøker', /\b(storytel|bookbeat|audible|nextory|fabel)\b/i],
];
const monthlyOre = (s) => s.price / (SUB_STEP[s.cycle] ?? 1);
/** Siste bruk-signal (ms) per abonnement: «Jeg bruker den» og avspilling på Plex/Jellyfin. */
function usageSignals(u, subs) {
  const out = new Map();
  for (const r of q('SELECT sub_id, MAX(ts) ts FROM fin51_usage WHERE user_id=? GROUP BY sub_id').all(u)) out.set(r.sub_id, { ts: r.ts, source: 'Merket som brukt' });
  let plays = null;
  try { plays = q('SELECT server, MAX(started) ts FROM plays44 GROUP BY server').all(); } catch { plays = null; }
  if (plays?.length) {
    for (const s of subs) {
      const srv = /\bplex\b/i.test(s.name) ? 'plex' : /\bjellyfin\b/i.test(s.name) ? 'jellyfin' : null;
      const p = srv ? plays.find((x) => x.server === srv) : null;
      if (p?.ts) { const ms = p.ts < 1e12 ? p.ts * 1000 : p.ts; const cur = out.get(s.id); if (!cur || cur.ts < ms) out.set(s.id, { ts: ms, source: srv === 'plex' ? 'Avspilling på Plex' : 'Avspilling på Jellyfin' }); }
    }
  }
  return out;
}
/** Prisøkning sett i banktrekkene: siste trekk høyere enn medianen av de forrige (≥ 2 % og ≥ 5 kr). */
function txPriceUp(list) {
  const neg = list.filter((t) => t.amount < 0);
  if (neg.length < 3) return null;
  const last = neg.at(-1), before = neg.slice(-4, -1).map((t) => -t.amount), med = median51(before);
  const now = -last.amount;
  if (med <= 0 || now - med < 500 || now < med * 1.02) return null;
  let i = neg.length - 1;
  while (i > 0 && -neg[i - 1].amount >= now * 0.99) i--; // første trekk med den nye prisen
  return { from: med, to: now, pct: Math.round(((now - med) / med) * 1000) / 10, date: neg[i].date };
}
export function hunter51(u, { weeks = 6, today = today51() } = {}) {
  const N = Math.min(52, Math.max(1, Math.round(+weeks) || 6));
  const subs = q('SELECT * FROM fh_subscriptions WHERE user_id=? AND active=1 ORDER BY name').all(u);
  const hist = tx51(u, addDays51(today, -400), { to: today });
  const by = new Map();
  for (const t of hist) { const k = key51(t.name); if (k) (by.get(k) ?? by.set(k, []).get(k)).push(t); }
  const dismissed = new Set(kv.get(u, 'fin51_hunter_dismissed', []) ?? []);
  const findings = [];
  const add = (f) => { if (!dismissed.has(f.key)) findings.push(f); };
  const subKey = new Map(subs.map((s) => [s.id, key51(s.name) ?? `sub${s.id}`]));
  // 1) Prisøkninger: fra abonnementet (prev_price) og fra banktrekkene.
  const priced = new Set();
  for (const s of subs) {
    const k = subKey.get(s.id);
    if (s.prev_price && s.price > s.prev_price && (!s.price_changed || s.price_changed >= addDays51(today, -365))) {
      const pct = Math.round(((s.price - s.prev_price) / s.prev_price) * 1000) / 10;
      priced.add(k);
      add({ key: `price:${s.id}:${s.price}`, kind: 'price_up', subId: s.id, name: s.name, title: `${s.name} har økt prisen ${String(pct).replace('.', ',')} %`,
        text: `Fra ${krText51(kr51(s.prev_price), true)} til ${krText51(kr51(s.price), true)} per trekk${s.price_changed ? ` (${dayLabel51(s.price_changed)} ${s.price_changed.slice(0, 4)})` : ''}. Sjekk om en billigere plan holder.`,
        from: kr51(s.prev_price), to: kr51(s.price), pct, date: s.price_changed ?? null, monthly: kr51(monthlyOre(s)), saving: kr51((s.price - s.prev_price) / (SUB_STEP[s.cycle] ?? 1)), source: 'abonnement' });
    }
  }
  const txKeys = new Set([...subKey.values()]), weekly = new Set();
  try { for (const d of recurringFromTx42(u, new Date(`${today}T12:00:00`))) { const k = key51(d.name); if (!k) continue; txKeys.add(k); if (d.interval === 7) weekly.add(k); } } catch { /* */ }
  for (const k of txKeys) {
    if (priced.has(k)) continue;
    const p = txPriceUp(by.get(k) ?? []);
    if (!p) continue;
    const s = subs.find((x) => subKey.get(x.id) === k);
    const name = s?.name ?? (by.get(k).at(-1).name);
    add({ key: `txprice:${k}:${p.to}`, kind: 'price_up', subId: s?.id ?? null, name, title: `${name} har økt prisen ${String(p.pct).replace('.', ',')} %`,
      text: `Banktrekket gikk fra ${krText51(kr51(p.from), true)} til ${krText51(kr51(p.to), true)} (${dayLabel51(p.date)} ${p.date.slice(0, 4)}).`,
      from: kr51(p.from), to: kr51(p.to), pct: p.pct, date: p.date, monthly: kr51(p.to), saving: kr51(p.to - p.from), source: 'transaksjoner' });
  }
  // 2) Doble abonnementer: samme tjeneste to ganger, to tjenester som gjør det samme, eller to trekk samme måned.
  const byKey = new Map();
  for (const s of subs) { const k = subKey.get(s.id); (byKey.get(k) ?? byKey.set(k, []).get(k)).push(s); }
  for (const [k, list] of byKey) {
    if (list.length < 2) continue;
    const cheapest = list.reduce((a, b) => (monthlyOre(a) <= monthlyOre(b) ? a : b));
    add({ key: `dup:${list.map((s) => s.id).sort().join(',')}`, kind: 'double', subIds: list.map((s) => s.id), name: list[0].name, title: `${list[0].name} står ${list.length} ganger`,
      text: `${list.map((s) => `${s.name}${s.plan ? ` (${s.plan})` : ''} ${krText51(kr51(monthlyOre(s)))}/mnd`).join(' og ')}. Trenger du begge?`,
      monthly: kr51(list.reduce((a, s) => a + monthlyOre(s), 0)), saving: kr51(list.filter((s) => s !== cheapest).reduce((a, s) => a + monthlyOre(s), 0)), group: k, source: 'abonnement' });
  }
  for (const [label, re] of OVERLAP) {
    const list = subs.filter((s) => re.test(s.name));
    const keys = new Set(list.map((s) => subKey.get(s.id)));
    if (keys.size < 2) continue;
    const cheapest = list.reduce((a, b) => (monthlyOre(a) <= monthlyOre(b) ? a : b));
    add({ key: `overlap:${label}:${list.map((s) => s.id).sort().join(',')}`, kind: 'double', subIds: list.map((s) => s.id), name: label, title: `${list.length} abonnementer på ${label.toLowerCase()}`,
      text: `${list.map((s) => `${s.name} ${krText51(kr51(monthlyOre(s)))}/mnd`).join(', ')} gjør omtrent det samme.`,
      monthly: kr51(list.reduce((a, s) => a + monthlyOre(s), 0)), saving: kr51(list.filter((s) => s !== cheapest).reduce((a, s) => a + monthlyOre(s), 0)), group: label, source: 'abonnement' });
  }
  for (const k of txKeys) {
    if (weekly.has(k)) continue;
    const list = (by.get(k) ?? []).filter((t) => t.amount < 0 && t.date >= addDays51(today, -62));
    const months = new Map();
    for (const t of list) (months.get(t.date.slice(0, 7)) ?? months.set(t.date.slice(0, 7), []).get(t.date.slice(0, 7))).push(t);
    const twice = [...months.entries()].filter(([, l]) => l.length >= 2).at(-1);
    if (!twice) continue;
    const s = subs.find((x) => subKey.get(x.id) === k);
    if (s && s.cycle !== 'monthly') continue;
    const name = s?.name ?? twice[1][0].name;
    add({ key: `twice:${k}:${twice[0]}`, kind: 'double', subId: s?.id ?? null, name, title: `${name} ble trukket ${twice[1].length} ganger i ${twice[0].slice(5) === today.slice(5, 7) ? 'måneden' : 'samme måned'}`,
      text: `${twice[1].map((t) => `${dayLabel51(t.date)}: ${krText51(kr51(-t.amount), true)}`).join(', ')}. Kan det være to kontoer eller et dobbelt trekk?`,
      monthly: kr51(twice[1].reduce((a, t) => a - t.amount, 0)), saving: kr51(Math.min(...twice[1].map((t) => -t.amount))), month: twice[0], source: 'transaksjoner' });
  }
  // 3) Ubrukte: bare der det finnes et bruk-signal (ellers vet vi ikke) – ingen bruk på N uker. Pluss de du har merket «Lite brukt».
  const sig = usageSignals(u, subs);
  const limit = Date.parse(`${today}T12:00:00Z`) - N * 7 * 86400_000;
  for (const s of subs) {
    const g = sig.get(s.id);
    if (g && g.ts < limit) {
      const w = Math.floor(Math.round((Date.parse(`${today}T12:00:00Z`) - g.ts) / 86400_000) / 7); // hele dager, så klokkeslettet ikke gir én uke for lite
      add({ key: `unused:${s.id}:${N}`, kind: 'unused', subId: s.id, name: s.name, title: `${s.name} er ikke brukt på ${w} uker`, text: `Siste bruk-signal: ${g.source.toLowerCase()} ${dayLabel51(new Date(g.ts).toISOString().slice(0, 10))}. Si opp, eller trykk «Jeg bruker den».`,
        lastUsed: new Date(g.ts).toISOString(), weeks: w, signal: g.source, monthly: kr51(monthlyOre(s)), saving: kr51(monthlyOre(s)), source: 'bruk' });
    } else if (!g && s.low_use) {
      add({ key: `lowuse:${s.id}`, kind: 'unused', subId: s.id, name: s.name, title: `${s.name} er merket som lite brukt`, text: `${s.usage_note ? `${s.usage_note}. ` : ''}Vurder å si det opp.`,
        lastUsed: null, weeks: null, signal: 'Merket «Lite brukt»', monthly: kr51(monthlyOre(s)), saving: kr51(monthlyOre(s)), source: 'abonnement' });
    }
  }
  const ORDER = { unused: 0, double: 1, price_up: 2 };
  findings.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.saving - a.saving);
  const saving = r2(findings.reduce((a, f) => a + (f.saving ?? 0), 0));
  return {
    findings, weeks: N,
    summary: { count: findings.length, monthlySaving: saving, yearlySaving: r2(saving * 12), dismissed: dismissed.size,
      text: findings.length ? `${findings.length} funn – opptil ${krText51(saving)} i måneden å spare` : 'Fant ingen prisøkninger, doble eller ubrukte abonnementer' },
    signals: { sources: ['«Jeg bruker den» i abonnementsjegeren', 'Avspilling på Plex/Jellyfin (for Plex- og Jellyfin-abonnementer)'], tracked: sig.size,
      note: `Et abonnement regnes som ubrukt bare når det finnes et bruk-signal og det siste er eldre enn ${N} uker.` },
  };
}
fin51Api.get('/fin51/hunter', R, (c) => c.json(hunter51(c.get('user'), { weeks: c.req.query('weeks') })));
fin51Api.post('/fin51/hunter/used', W, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({}));
  const s = q('SELECT id FROM fh_subscriptions WHERE id=? AND user_id=?').get(+b.subId, u);
  if (!s) return bad(c, 'Fant ikke abonnementet', 404);
  const ts = Date.now();
  q("INSERT INTO fin51_usage(user_id,sub_id,ts,source) VALUES(?,?,?,'manual') ON CONFLICT(user_id,sub_id,source) DO UPDATE SET ts=excluded.ts").run(u, s.id, ts);
  return c.json({ ok: true, lastUsed: new Date(ts).toISOString() });
});
fin51Api.post('/fin51/hunter/dismiss', W, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({}));
  const k = str51(b.key, 200);
  if (!k) return bad(c, 'Mangler key');
  const list = [...new Set([...(kv.get(u, 'fin51_hunter_dismissed', []) ?? []), k])].slice(-300);
  kv.set(u, 'fin51_hunter_dismissed', list);
  return ok(c);
});
fin51Api.delete('/fin51/hunter/dismiss', W, (c) => { kv.set(c.get('user'), 'fin51_hunter_dismissed', []); return ok(c); });

/** Oppsigelsestekst som mal (brukes når den lokale modellen ikke svarer, og som utgangspunkt for modellen). */
export function cancelTemplate51({ service, plan = '', name = '', reason = '' }) {
  const subject = `Oppsigelse av ${service}${plan ? ` (${plan})` : ''}`;
  const text = [`Hei,`, '', `Jeg ønsker å si opp abonnementet mitt på ${service}${plan ? ` (${plan})` : ''} fra og med neste mulige dato.`,
    reason ? `Grunnen er at ${reason.replace(/\.$/, '')}.` : null,
    'Vennligst bekreft oppsigelsen skriftlig, med dato for når abonnementet avsluttes og at det ikke kommer flere trekk etter det.', '',
    'Med vennlig hilsen', name || '[Navnet ditt]'].filter((x) => x !== null).join('\n');
  return { subject, text };
}
let draftAi = (o) => aiRun('fsok', o);
export const _setDraftAi51 = (fn) => { draftAi = fn ?? ((o) => aiRun('fsok', o)); };
fin51Api.post('/fin51/hunter/draft', W, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => ({}));
  const s = b.subId ? q('SELECT name, plan FROM fh_subscriptions WHERE id=? AND user_id=?').get(+b.subId, u) : null;
  if (b.subId && !s) return bad(c, 'Fant ikke abonnementet', 404);
  const service = s?.name ?? str51(b.name, 80);
  if (!service) return bad(c, 'Velg et abonnement');
  const who = (() => { try { return userInfo(u)?.name ?? ''; } catch { return ''; } })();
  const base = cancelTemplate51({ service, plan: s?.plan ?? '', name: who, reason: str51(b.reason, 200) });
  let text = base.text, engine = 'mal', model = null, notice = null;
  try {
    // Bare lokal modell («Finansdata forlater aldri huset»). Ingen beløp, kontonumre eller andre persondata i forespørselen.
    const r = await draftAi({ localOnly: true, title: 'Finans · oppsigelsestekst', timeoutMs: 45_000, temperature: 0.3, numPredict: 400,
      system: 'Du skriver korte, høflige oppsigelser på norsk bokmål. Svar bare med selve e-postteksten, uten emnelinje, uten forklaring og uten plassholdere utover [Kundenummer] hvis det trengs.',
      prompt: `Skriv en kort oppsigelse av abonnementet «${service}»${s?.plan ? ` (${s.plan})` : ''}. Be om skriftlig bekreftelse med sluttdato og at det ikke kommer flere trekk.${b.reason ? ` Grunn: ${str51(b.reason, 200)}.` : ''} Avslutt med «Med vennlig hilsen» og navnet «${who || '[Navnet ditt]'}».` });
    const t = String(r?.text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (t.length >= 60 && r?.provider === 'ollama') { text = t.slice(0, 2000); engine = 'lokal'; model = r.model ?? null; }
  } catch (e) { notice = 'Den lokale modellen svarte ikke – dette er malen'; }
  return c.json({ subject: base.subject, text, engine, model, sent: false, notice, note: 'Teksten sendes aldri automatisk. Kopier den og send den selv til tjenesten.' });
});

/* ---------------- Skattehjelp og prishistorikk ---------------- */

mountTax51(fin51Api, { R, W });
mountPrices51(fin51Api, { R });

export default fin51Api;
