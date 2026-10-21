// Prompt 43 (SERVER43): Finans – saldokortet (4b, claude-code-finans-saldokort.md) og månedstopp i Liste (claude-code-finans-liste-maned-topp.md).
//   GET /finans/api/overview?month=YYYY-MM → alt fra /summary + {balance, spentMonth, day, daysInMonth, monthName, spentLabel, ring}
//   GET /finans/api/summary (mellomvare)    → får de samme feltene når de mangler
//   GET /finans/api/transactions/months?category=&account=&type=&from=&to= → {months:[{month, label, labelShort, count, net, inn, ut, netText}]}
//   GET /finans/api/transactions (mellomvare) → får months:[…] for månedene i svaret (samme filter på kategori/konto/type)
import { Hono } from 'hono';
import { db } from './db.js';
import { auth42 } from './finans42.js';
import finansApi from './routes.js';

const q = (sql) => db.prepare(sql);
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const kr = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')} kr`;
const R = auth42('finance:read');

/** Feltene saldokortet trenger, regnet fra et /summary-svar. */
export function saldoFields43(j) {
  const month = /^\d{4}-\d{2}$/.test(j?.month ?? '') ? j.month : today().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const t = today(), cur = t.slice(0, 7);
  const day = month === cur ? +t.slice(8, 10) : month < cur ? daysInMonth : 0;
  const monthName = MONTHS[m - 1];
  const spentMonth = Math.round((j?.ut ?? 0) * 100) / 100;
  return { spentMonth, day, daysInMonth, monthName, spentLabel: `Brukt i ${monthName} · dag ${day} av ${daysInMonth}`, ring: daysInMonth ? Math.round((day / daysInMonth) * 1000) / 1000 : 0, dayText: `${day}.` };
}
export async function summaryMw43(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200) return;
  try {
    const j = await c.res.clone().json();
    const add = saldoFields43(j);
    const miss = Object.fromEntries(Object.entries(add).filter(([k]) => j[k] === undefined));
    if (Object.keys(miss).length) c.res = c.json({ ...j, ...miss }, 200, { 'Cache-Control': 'no-store' });
  } catch { /* svaret står */ }
}

/** Netto per måned (samme som Liste: alle poster i måneden, med valgfritt filter). */
export function monthsOf43(u, f = {}) {
  const w = ['t.user_id=?'], p = [u];
  if (f.account && /^\d+$/.test(f.account)) { w.push('t.account_id=?'); p.push(+f.account); }
  if (f.category) { if (f.category === 'none') w.push('t.category_id IS NULL'); else if (/^\d+$/.test(f.category)) { w.push('t.category_id=?'); p.push(+f.category); } }
  if (f.type === 'inn') w.push('t.amount>0'); else if (f.type === 'ut') w.push('t.amount<0');
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from ?? '')) { w.push('t.date>=?'); p.push(f.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to ?? '')) { w.push('t.date<?'); p.push(f.to); }
  const cat = f.category && /^\d+$/.test(f.category) ? q('SELECT name FROM fh_categories WHERE id=? AND user_id=?').pluck().get(+f.category, u) : null;
  return q(`SELECT substr(t.date,1,7) m, count(*) n, coalesce(sum(t.amount),0) s, coalesce(sum(CASE WHEN t.amount>0 THEN t.amount END),0) i, coalesce(sum(CASE WHEN t.amount<0 THEN -t.amount END),0) o
    FROM fh_transactions t WHERE ${w.join(' AND ')} GROUP BY m ORDER BY m DESC LIMIT 60`).all(...p).map((r) => {
    const mn = MONTHS[+r.m.slice(5, 7) - 1];
    const label = cat ? `${cat.toUpperCase()} · ${mn.slice(0, 3).toUpperCase()} · ${r.n}` : `${mn.toUpperCase()} · ${r.n}`;
    return { month: r.m, label, labelShort: mn.slice(0, 3).toUpperCase(), name: mn, year: +r.m.slice(0, 4), count: r.n, net: r.s / 100, inn: r.i / 100, ut: r.o / 100, netText: `Netto ${kr(r.s / 100)}` };
  });
}
export async function transactionsMw43(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/\/transactions\/?$/.test(c.req.path)) return;
  try {
    const u = c.get('user');
    if (!u) return;
    const j = await c.res.clone().json();
    if (!Array.isArray(j.items) || j.months) return;
    const want = new Set(j.items.map((t) => String(t.date ?? '').slice(0, 7)));
    const qs = c.req.query();
    const months = monthsOf43(u, { account: qs.account, category: qs.category, type: qs.type }).filter((m) => want.has(m.month));
    c.res = c.json({ ...j, months }, 200, { 'Cache-Control': 'no-store' });
  } catch { /* svaret står */ }
}

export const finans43Api = new Hono();
finans43Api.get('/overview', R, async (c) => {
  const month = /^\d{4}-\d{2}$/.test(c.req.query('month') ?? '') ? c.req.query('month') : '';
  const h = {}; for (const k of ['cookie', 'authorization']) { const v = c.req.header(k); if (v) h[k] = v; }
  const r = await finansApi.request(`/summary${month ? `?month=${month}` : ''}`, { headers: h }, c.env);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return c.json(j, r.status);
  return c.json({ ...j, ...saldoFields43(j) });
});
finans43Api.get('/transactions/months', R, (c) => c.json({ months: monthsOf43(c.get('user'), c.req.query()) }));
