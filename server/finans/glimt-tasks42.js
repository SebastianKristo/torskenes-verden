// Prompt 42 (SERVER42): Økonomi → Glimt «Avanserte oppgaver» som bakgrunnsjobber + forbruksrapport som PDF.
// claude-code-glimt-avanserte-oppgaver.md, fasit Forbruksrapport.dc.html (A4, 2 sider).
//
//   POST   /finans/api/glimt/tasks {kind:'report'|'cut_subs'|'compare_year'|'clean_categories', params?:{period?:'YYYY-MM'|'month'|{from,to}, merchants?, …}}
//          eller {text:'lag en rapport over forbruket mitt i høst'} → 202 {jobId, job}
//          (alias POST /finans/api/glimt/jobs {type, period})
//   GET    /finans/api/glimt/tasks → {jobs:[job], running, max:2, kinds:[{kind, title, sub}]}
//   GET    /finans/api/glimt/tasks/:id → job · DELETE = slett (avbryter hvis den kjører)
//   GET    /finans/api/glimt/tasks/:id/events (SSE: data = job ved hver endring, ping hvert 2. s)
//   GET    /finans/api/glimt/tasks/:id/report.pdf → application/pdf, «Forbruksrapport-2026-10.pdf»
//   job = {id, jobId, kind, title, state:'queued'|'running'|'done'|'failed', step, steps:[{label, done}], pct, createdAt, startedAt, endedAt, doneText:'Ferdig · 20:51', result?, pdfUrl?, error?}
// Tallene regnes alltid i SQL. LLM skriver bare sammendraget (valgfritt, 6 s); ellers brukes en mal. Maks 2 samtidige per bruker.
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { db, settings } from './db.js';
import { config } from '../config.js';
import { subscriptionSources } from './subs-ask32.js';
import { Pdf42, A4 } from './pdf42.js';
import { parsePeriod42 } from './search42.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS glimt_jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, params TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'queued', step INTEGER NOT NULL DEFAULT 0, pct INTEGER NOT NULL DEFAULT 0, result TEXT, pdf TEXT, error TEXT,
  created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER);
CREATE INDEX IF NOT EXISTS glimt_jobs_u ON glimt_jobs(user_id, created_at);`);
const DIR = join(config.dataDir, 'glimt-reports');
mkdirSync(DIR, { recursive: true });

export const MAX_RUNNING42 = 2;
export const KINDS42 = {
  report: { title: 'Forbruksrapport nå', sub: 'Brukt, kategorier, største kjøp og råd · PDF', steps: ['Leser transaksjoner', 'Leser kvitteringer og varelinjer', 'Grupperer etter kategori', 'Skriver rapporten'] },
  cut_subs: { title: 'Abonnementer jeg kan kutte', sub: 'Lite brukt, dyre og overlappende', steps: ['Leser abonnementene', 'Ser på bruk og pris', 'Skriver forslagene'] },
  compare_year: { title: 'Sammenlign med i fjor', sub: 'Samme periode i fjor, per kategori', steps: ['Leser i år', 'Leser i fjor', 'Sammenligner kategoriene'] },
  clean_categories: { title: 'Rydd kategorier', sub: 'Ukategoriserte kjøp og forslag', steps: ['Finner ukategoriserte kjøp', 'Ser på butikkene', 'Lager forslag'] },
};
/** Fritekst → oppgave. «lag en rapport over forbruket mitt i høst» → {kind:'report', params:{period:{…}}} */
export function kindFromText42(text) {
  const t = String(text ?? '').toLowerCase();
  const kind = /abonnement|kutte|si opp/.test(t) ? 'cut_subs' : /i fjor|sammenlign/.test(t) ? 'compare_year' : /rydd|kategoris|ukategor/.test(t) ? 'clean_categories' : /rapport|forbruk|oversikt|brukt/.test(t) ? 'report' : null;
  const period = parsePeriod42(text);
  return kind ? { kind, params: period ? { period: { from: period.from, to: period.to, label: period.label } } : {} } : null;
}

/* ---------------- Tall (SQL) ---------------- */

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const krN = (v) => Math.round(Math.abs(v)).toLocaleString('nb-NO').replace(/\s/g, ' ');
const kr = (v) => `${krN(v)} kr`;
/** Perioden for rapporten. Standard: inneværende måned til i dag. → {from, to (eksklusiv), label, month:'YYYY-MM'|null, days} */
export function periodOf42(p, now = new Date()) {
  const today = iso(now);
  if (p && typeof p === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(p.from ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(p.to ?? '')) return { from: p.from, to: p.to, label: p.label ?? `${p.from}–${p.to}`, month: null };
  const m = typeof p === 'string' && /^\d{4}-\d{2}$/.test(p) ? p : today.slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const end = iso(new Date(y, mo, 1, 12));
  const to = end > today && m === today.slice(0, 7) ? addD(today, 1) : end;
  return { from: `${m}-01`, to, label: `${MONTHS[mo - 1][0].toUpperCase()}${MONTHS[mo - 1].slice(1)} ${y}`, month: m, partial: to !== end };
}
const spendRows = (u, from, to, f = {}) => {
  const w = ['t.user_id=?', 't.date>=?', 't.date<?', "COALESCE(c.kind,'expense')<>'transfer'"], a = [u, from, to];
  if (f.merchants?.length) { w.push(`(${f.merchants.map(() => 'lower(COALESCE(t.merchant,t.description)) LIKE ?').join(' OR ')})`); a.push(...f.merchants.map((m) => `%${String(m).toLowerCase()}%`)); }
  return q(`SELECT t.*, c.name AS cat, c.color AS color FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE ${w.join(' AND ')} ORDER BY t.date DESC`).all(...a);
};
/** Alle tallene i forbruksrapporten. */
export function reportData42(u, params = {}, now = new Date()) {
  const P = periodOf42(params.period, now);
  const rows = spendRows(u, P.from, P.to, params);
  const out = rows.filter((r) => r.amount < 0), inn = rows.filter((r) => r.amount > 0);
  const spent = out.reduce((s, r) => s - r.amount, 0) / 100, income = inn.reduce((s, r) => s + r.amount, 0) / 100;
  // Forrige periode: like mange dager rett før (samme dager i forrige måned for en måned).
  const len = Math.round((Date.parse(P.to) - Date.parse(P.from)) / 86400_000);
  const pf = P.month ? (() => { const d = new Date(`${P.from}T12:00:00`); d.setMonth(d.getMonth() - 1); return iso(d); })() : addD(P.from, -len);
  const prevSpent = spendRows(u, pf, addD(pf, len), params).filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0) / 100;
  const byCat = new Map();
  for (const r of out) { const k = r.cat ?? 'Ukategorisert'; const c = byCat.get(k) ?? { name: k, color: r.color ?? '#A0A0AA', sum: 0, count: 0 }; c.sum += -r.amount / 100; c.count++; byCat.set(k, c); }
  const categories = [...byCat.values()].sort((a, b) => b.sum - a.sum).map((c) => ({ ...c, sum: Math.round(c.sum * 100) / 100, pct: spent ? Math.round((c.sum / spent) * 100) : 0 }));
  const largest = out.slice().sort((a, b) => a.amount - b.amount).slice(0, 8).map((r) => ({ date: r.date, name: r.merchant || r.description, what: r.ai_short ?? null, category: r.cat ?? 'Ukategorisert', amount: -r.amount / 100 }));
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${P.from}T12:00:00`); d.setDate(1); d.setMonth(d.getMonth() - i);
    const f = iso(d), e = iso(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
    const s = spendRows(u, f, e, params).filter((r) => r.amount < 0).reduce((x, r) => x - r.amount, 0) / 100;
    months.push({ month: f.slice(0, 7), label: MON[d.getMonth()], sum: Math.round(s * 100) / 100, current: i === 0 });
  }
  let subs = [];
  try { subs = subscriptionSources(u).filter((s) => s.kind === 'abonnement').map((s) => ({ name: s.name, plan: s.plan, monthly: s.monthly, domain: s.domain })).sort((a, b) => b.monthly - a.monthly); } catch { /* */ }
  const subsMonthly = Math.round(subs.reduce((s, x) => s + x.monthly, 0));
  let budget = null;
  try {
    const m = P.month ?? P.from.slice(0, 7);
    const b = q("SELECT category_id, month, amount FROM fh_budgets WHERE user_id=? AND month IN ('default', ?)").all(u, m);
    const by = new Map(); for (const x of b) if (x.month === 'default' && !by.has(x.category_id)) by.set(x.category_id, x.amount); for (const x of b) if (x.month === m) by.set(x.category_id, x.amount);
    const total = [...by.values()].reduce((s, v) => s + v, 0) / 100;
    if (total) budget = { total, left: Math.round((total - spent) * 100) / 100 };
  } catch { /* */ }
  const daysLeft = P.month ? Math.max(0, Math.round((Date.parse(`${P.to}T12:00:00`) - Date.parse(`${iso(now)}T12:00:00`)) / 86400_000)) : 0;
  const change = prevSpent ? Math.round(((spent - prevSpent) / prevSpent) * 100) : null;
  const count = out.length;
  const top = categories[0] ?? null;
  const advice = advice42({ categories, subs, out, spent });
  const pace = P.partial && P.month ? Math.round(spent / Math.max(1, new Date(now).getDate()) * new Date(+P.month.slice(0, 4), +P.month.slice(5), 0).getDate()) : null;
  const summary = `Du har brukt ${kr(spent)}${P.partial ? ' hittil' : ''} i ${P.label.toLowerCase()}${change != null ? `, ${Math.abs(change)} % ${change <= 0 ? 'mindre' : 'mer'} enn i forrige periode` : ''}.`
    + (top ? ` ${top.name} er største post med ${kr(top.sum)}.` : '') + (pace ? ` Med samme tempo ender måneden på rundt ${kr(pace)}${budget ? `, ${pace <= budget.total ? 'under' : 'over'} budsjettet på ${kr(budget.total)}` : ''}.` : '');
  return { period: P, spent: Math.round(spent * 100) / 100, income: Math.round(income * 100) / 100, count, avg: count ? Math.round(spent / count) : 0, prevSpent: Math.round(prevSpent * 100) / 100, change,
    categories, largest, months, subs, subsMonthly, budget, daysLeft, top, advice, summary, summaryBy: 'mal', name: settings(u).name, generatedAt: new Date(now).toISOString() };
}
function advice42({ categories, subs, out }) {
  const tips = [];
  const food = categories.find((c) => /mat og dagligvarer/i.test(c.name));
  if (food && food.count >= 6) tips.push({ title: 'Samle storhandelen.', text: `Du handlet mat ${food.count} ganger. To faste storhandler i uka kan spare rundt ${kr(Math.round(food.sum * 0.08 / 10) * 10)} i måneden.` });
  const low = subs.find((s) => s.monthly >= 50) && subs.slice().sort((a, b) => b.monthly - a.monthly)[subs.length - 1];
  if (low) tips.push({ title: `Sjekk ${low.name}.`, text: `Oppsigelse sparer ${kr(low.monthly * 12)} i året.` });
  const charge = out.filter((r) => /circle k|lading|ladestasjon|recharge|mer\b|ionity|tesla/i.test(`${r.merchant} ${r.description}`));
  if (charge.length) { const s = charge.reduce((x, r) => x - r.amount, 0) / 100; tips.push({ title: 'Lad hjemme om natta.', text: `${kr(s)} på hurtiglading i perioden. Natt-strøm hjemme ville kostet ca. ${kr(Math.round(s * 0.36))}.` }); }
  const rest = categories.find((c) => /restaurant|kafé/i.test(c.name));
  if (tips.length < 3 && rest) tips.push({ title: 'Færre restaurantbesøk.', text: `${kr(rest.sum)} på restaurant og kafé. Ett besøk mindre i uka sparer rundt ${kr(Math.round(rest.sum / Math.max(1, rest.count) * 4))} i måneden.` });
  if (tips.length < 3 && categories[0]) tips.push({ title: `Følg med på ${categories[0].name.toLowerCase()}.`, text: `Største post med ${kr(categories[0].sum)} (${categories[0].pct} %).` });
  return tips.slice(0, 3);
}

/* ---------------- PDF ---------------- */

const C = { ink: '#1b1a17', mute: '#5e5a52', line: '#d6cdbb', red: '#b23a2a', paper: '#fbf7ee', card: '#f3ecdd', green: '#2f6b4a' };
/** Forbruksrapporten som PDF (A4, 2 sider). → Buffer */
export function reportPdf42(d) {
  const pdf = new Pdf42({ title: `Forbruksrapport ${d.period.label}`, author: 'Glimt · FinansHub' });
  const L = 48, R = A4.w - 48, W = R - L;
  const stamp = new Date(d.generatedAt).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' kl.');
  const foot = (n) => { pdf.line(L, 806, R, 806); pdf.text(L, 822, `FinansHub · Forbruksrapport ${d.period.label.toLowerCase()}`, { size: 8, color: C.mute }); pdf.text(R, 822, `Side ${n} av 2`, { size: 8, color: C.mute, align: 'right' }); };
  // Side 1
  pdf.rect(L, 40, 22, 22, { fill: '#1f3350' }); pdf.text(L + 30, 56, 'FinansHub', { size: 13, font: 'bold' });
  pdf.text(R, 56, `LAGET AV GLIMT · ${stamp}`.toUpperCase(), { size: 8, font: 'mono', color: C.mute, align: 'right' });
  pdf.text(L, 96, 'FORBRUKSRAPPORT', { size: 9, font: 'monob', color: C.red });
  pdf.text(L, 132, d.period.label, { size: 34, font: 'serif' });
  const last = addD(d.period.to, -1);
  pdf.text(L, 152, `${d.period.month ? `${+d.period.from.slice(8)}.–${+last.slice(8)}. ${MONTHS[+d.period.month.slice(5) - 1]}` : `${d.period.from} – ${last}`} · ${d.name ?? ''} · alle kontoer`, { size: 10, color: C.mute });
  pdf.rect(L, 168, W, 78, { fill: C.card });
  pdf.circle(L + 20, 188, 9, { fill: C.red }); pdf.text(L + 20, 192, '*', { size: 12, font: 'bold', color: '#ffffff', align: 'center' });
  pdf.para(L + 40, 186, d.summary, W - 56, { size: 10.5, lead: 1.45 });
  const kpi = [['Brukt', kr(d.spent), d.change != null ? `${d.change <= 0 ? '▼' : '▲'} ${Math.abs(d.change)} % mot forrige` : ''], ['Inn', kr(d.income), ''], ['Antall kjøp', String(d.count), `Snitt ${kr(d.avg)}`],
    ['Budsjett igjen', d.budget ? kr(d.budget.left) : '–', d.budget && d.daysLeft ? `${d.daysLeft} dager igjen` : '']];
  const kw = (W - 3 * 10) / 4;
  kpi.forEach(([l, v, s], i) => { const x = L + i * (kw + 10); pdf.rect(x, 262, kw, 70, { stroke: C.line }); pdf.text(x + 10, 280, l, { size: 9, color: C.mute }); pdf.text(x + 10, 304, v, { size: 15, font: 'monob' }); if (s) pdf.text(x + 10, 322, s, { size: 8, color: C.mute }); });
  pdf.text(L, 362, 'Kategorier', { size: 15, font: 'serif' });
  const maxC = Math.max(1, ...d.categories.map((c) => c.sum));
  let y = 384;
  for (const c of d.categories.slice(0, 8)) {
    pdf.text(L, y, c.name, { size: 10 }); pdf.text(L + 290, y, kr(c.sum), { size: 10, font: 'mono', align: 'right' });
    pdf.rect(L + 300, y - 8, (W - 300) * (c.sum / maxC), 9, { fill: c.color || C.red }); y += 20;
  }
  y = Math.max(y + 16, 560);
  pdf.text(L, y, 'Siste 6 måneder', { size: 15, font: 'serif' });
  const maxM = Math.max(1, ...d.months.map((m) => m.sum)), bw = W / 6, bh = 150, base = y + 30 + bh;
  d.months.forEach((m, i) => {
    const h = (m.sum / maxM) * bh, x = L + i * bw + bw * 0.2;
    pdf.rect(x, base - h, bw * 0.6, h, { fill: m.current ? C.red : '#c9bfa9' });
    pdf.text(x + bw * 0.3, base - h - 6, (m.sum / 1000).toFixed(1).replace('.', ','), { size: 8, font: 'mono', align: 'center' });
    pdf.text(x + bw * 0.3, base + 14, `${m.label}${m.current && d.period.partial ? '*' : ''}`, { size: 9, color: C.mute, align: 'center' });
  });
  pdf.text(L, base + 32, `Tusen kroner.${d.period.partial ? ' *Inneværende måned til og med i dag.' : ''}`, { size: 8, color: C.mute });
  foot(1);
  // Side 2
  pdf.page();
  pdf.text(L, 70, 'Største kjøp', { size: 15, font: 'serif' });
  y = 94;
  for (const [x, t] of [[L, 'Dato'], [L + 60, 'Hvor'], [L + 290, 'Kategori']]) pdf.text(x, y, t, { size: 8.5, font: 'bold', color: C.mute });
  pdf.text(R, y, 'Beløp', { size: 8.5, font: 'bold', color: C.mute, align: 'right' });
  pdf.line(L, y + 6, R, y + 6);
  y += 22;
  for (const r of d.largest) {
    pdf.text(L, y, `${r.date.slice(8)}.${r.date.slice(5, 7)}`, { size: 9.5, font: 'mono' });
    pdf.text(L + 60, y, `${r.name}${r.what ? ` · ${r.what}` : ''}`.slice(0, 44), { size: 9.5 });
    pdf.text(L + 290, y, r.category.slice(0, 26), { size: 9.5, color: C.mute });
    pdf.text(R, y, kr(r.amount), { size: 9.5, font: 'mono', align: 'right' });
    pdf.line(L, y + 7, R, y + 7, { color: '#ece4d4' }); y += 20;
  }
  y += 24;
  pdf.text(L, y, 'Abonnementer', { size: 15, font: 'serif' }); y += 22;
  for (const s of d.subs.slice(0, 10)) { pdf.text(L, y, `${s.name}${s.plan ? ` · ${s.plan}` : ''}`.slice(0, 60), { size: 9.5 }); pdf.text(R, y, kr(s.monthly), { size: 9.5, font: 'mono', align: 'right' }); y += 17; }
  pdf.line(L, y - 9, R, y - 9, { color: C.ink }); pdf.text(L, y + 4, 'Til sammen per måned', { size: 9.5, font: 'bold' }); pdf.text(R, y + 4, kr(d.subsMonthly), { size: 9.5, font: 'monob', align: 'right' });
  y += 40;
  pdf.text(L, y, 'Glimt foreslår', { size: 15, font: 'serif' }); y += 22;
  d.advice.forEach((a, i) => { pdf.circle(L + 8, y - 3, 8, { fill: C.red }); pdf.text(L + 8, y + 1, String(i + 1), { size: 9, font: 'bold', color: '#ffffff', align: 'center' }); pdf.text(L + 24, y, a.title, { size: 10, font: 'bold' }); y = pdf.para(L + 24, y + 14, a.text, W - 24, { size: 9.5, color: C.mute }) + 8; });
  pdf.para(L, 770, `Tallene er hentet fra kontoene, kvitteringene og abonnementene i FinansHub per ${stamp}. Glimt skrev sammendraget og forslagene ut fra disse tallene.`, W, { size: 8, color: C.mute });
  foot(2);
  return pdf.output();
}
export const reportFileName42 = (d) => `Forbruksrapport-${d.period.month ?? d.period.from.slice(0, 7)}.pdf`;

/* ---------------- Andre oppgaver ---------------- */

function cutSubs(u) {
  const subs = subscriptionSources(u).filter((s) => s.kind === 'abonnement');
  const rows = q('SELECT name, low_use, usage_note, price, cycle FROM fh_subscriptions WHERE user_id=? AND active=1').all(u);
  const low = new Map(rows.map((r) => [r.name, r]));
  const items = subs.map((s) => ({ name: s.name, monthly: s.monthly, yearly: Math.round(s.monthly * 12), lowUse: !!low.get(s.name)?.low_use, usage: low.get(s.name)?.usage_note ?? null, domain: s.domain }))
    .filter((s) => s.lowUse || s.monthly >= 200).sort((a, b) => (b.lowUse - a.lowUse) || b.monthly - a.monthly);
  const save = items.filter((s) => s.lowUse).reduce((x, s) => x + s.yearly, 0);
  return { items, save, text: items.length ? `Glimt fant ${items.length} abonnementer du kan vurdere å si opp. Lite brukte gir til sammen ${kr(save)} i året.` : 'Glimt fant ingen abonnementer som bør kuttes.' };
}
function compareYear(u, params, now) {
  const P = periodOf42(params.period, now);
  const ly = (s) => `${+s.slice(0, 4) - 1}${s.slice(4)}`;
  const sum = (rows) => { const m = new Map(); for (const r of rows.filter((x) => x.amount < 0)) m.set(r.cat ?? 'Ukategorisert', (m.get(r.cat ?? 'Ukategorisert') ?? 0) - r.amount / 100); return m; };
  const a = sum(spendRows(u, P.from, P.to, params)), b = sum(spendRows(u, ly(P.from), ly(P.to), params));
  const cats = [...new Set([...a.keys(), ...b.keys()])].map((name) => ({ name, now: Math.round(a.get(name) ?? 0), before: Math.round(b.get(name) ?? 0) })).map((c) => ({ ...c, change: c.before ? Math.round(((c.now - c.before) / c.before) * 100) : null })).sort((x, y) => y.now - x.now);
  const tn = cats.reduce((s, c) => s + c.now, 0), tb = cats.reduce((s, c) => s + c.before, 0);
  return { period: P, categories: cats, now: tn, before: tb, text: `${P.label}: ${kr(tn)} mot ${kr(tb)} samme periode i fjor${tb ? ` (${tn >= tb ? '+' : '−'}${Math.abs(Math.round(((tn - tb) / tb) * 100))} %)` : ''}.` };
}
function cleanCategories(u) {
  const rows = q("SELECT id, COALESCE(merchant, description) AS name, amount, date FROM fh_transactions WHERE user_id=? AND category_id IS NULL ORDER BY date DESC LIMIT 500").all(u);
  const known = q('SELECT COALESCE(t.merchant, t.description) AS name, c.name AS cat, count(*) n FROM fh_transactions t JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? GROUP BY 1,2 ORDER BY n DESC').all(u);
  const best = new Map(); for (const k of known) if (!best.has(k.name)) best.set(k.name, k.cat);
  const suggestions = rows.map((r) => ({ txId: r.id, name: r.name, amount: r.amount / 100, date: r.date, suggested: best.get(r.name) ?? null })).filter((s) => s.suggested);
  return { uncategorized: rows.length, suggestions: suggestions.slice(0, 50), text: rows.length ? `${rows.length} kjøp mangler kategori. Glimt har forslag til ${suggestions.length}.` : 'Alle kjøp har kategori.' };
}

/* ---------------- Jobbkø ---------------- */

/** Bare for tester: (prompt, data) → tekst. null = Glimt-kjeden (6 s, faller tilbake til malen). */
export const _taskLlm42 = { impl: null, ms: 6000, delayMs: 0 };
const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const hhmm = (t) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const isoT = (t) => (t ? new Date(t).toISOString() : null);
const row = (id) => q('SELECT * FROM glimt_jobs WHERE id=?').get(id);
const listeners = new Map(); // jobId → Set(fn)
export function jobOut42(r) {
  if (!r) return null;
  const k = KINDS42[r.kind] ?? { title: r.title, steps: [] };
  const res = parseJ(r.result, null);
  return { id: r.id, jobId: r.id, kind: r.kind, title: r.title, params: parseJ(r.params, {}), state: r.state, step: r.step, pct: r.pct,
    stepLabel: r.state === 'running' ? k.steps[Math.min(r.step, k.steps.length - 1)] ?? null : null,
    steps: k.steps.map((label, i) => ({ label, done: r.state === 'done' || i < r.step, current: r.state === 'running' && i === r.step })),
    createdAt: isoT(r.created_at), startedAt: isoT(r.started_at), endedAt: isoT(r.ended_at), doneText: r.state === 'done' && r.ended_at ? `Ferdig · ${hhmm(r.ended_at)}` : null,
    ...(res ? { result: res } : {}), ...(r.pdf ? { pdfUrl: `/finans/api/glimt/tasks/${r.id}/report.pdf`, pdfName: res?.fileName ?? 'Forbruksrapport.pdf', openLabel: 'Åpne rapport' } : {}), ...(r.error ? { error: r.error } : {}) };
}
function emit(id) {
  const r = row(id); if (!r) return;
  const v = jobOut42(r);
  for (const fn of listeners.get(id) ?? []) { try { fn(v); } catch { /* */ } }
  import('../realtime.js').then(({ broadcast }) => broadcast('glimt-task', v, [r.user_id])).catch(() => {});
}
export function subscribe42(id, fn) { const s = listeners.get(id) ?? new Set(); s.add(fn); listeners.set(id, s); return () => { s.delete(fn); if (!s.size) listeners.delete(id); }; }
const running = new Map(); // bruker → antall
const queues = new Map();  // bruker → [jobId]
/** Starter (eller køer) en oppgave. → job */
export function startTask42(u, kind, params = {}, now = () => new Date()) {
  if (!KINDS42[kind]) throw Object.assign(new Error('Ukjent oppgave (kind)'), { status: 400 });
  if (q("SELECT count(*) FROM glimt_jobs WHERE user_id=? AND state IN ('queued','running')").pluck().get(u) >= 10) throw Object.assign(new Error('Glimt har mange oppgaver i kø. Vent litt.'), { status: 429 });
  const id = 'gt' + randomBytes(7).toString('hex');
  const title = kind === 'report' && params?.period?.label ? `Forbruksrapport · ${params.period.label}` : KINDS42[kind].title;
  q('INSERT INTO glimt_jobs(id, user_id, kind, title, params, created_at) VALUES(?,?,?,?,?,?)').run(id, u, kind, title, JSON.stringify(params ?? {}), Date.now());
  const qu = queues.get(u) ?? []; qu.push(id); queues.set(u, qu);
  emit(id);
  setImmediate(() => pump(u, now));
  return jobOut42(row(id));
}
function pump(u, now) {
  const qu = queues.get(u) ?? [];
  while ((running.get(u) ?? 0) < MAX_RUNNING42 && qu.length) {
    const id = qu.shift();
    running.set(u, (running.get(u) ?? 0) + 1);
    runTask(id, now).catch((e) => console.warn('[glimt-oppgaver]', e.message)).finally(() => { running.set(u, (running.get(u) ?? 1) - 1); pump(u, now); });
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runTask(id, now) {
  let r = row(id);
  if (!r || r.state !== 'queued') return;
  q("UPDATE glimt_jobs SET state='running', started_at=?, step=0, pct=5 WHERE id=?").run(Date.now(), id); emit(id);
  const set = (step, pct) => { if (row(id)?.state !== 'running') throw Object.assign(new Error('Avbrutt'), { cancelled: true }); q('UPDATE glimt_jobs SET step=?, pct=? WHERE id=?').run(step, pct, id); emit(id); };
  const params = parseJ(r.params, {});
  const u = r.user_id;
  try {
    let result, pdfFile = null;
    if (_taskLlm42.delayMs) await sleep(_taskLlm42.delayMs);
    if (r.kind === 'report') {
      set(0, 15); const d = reportData42(u, params, now());
      set(1, 40); await sleep(0);
      set(2, 65);
      set(3, 85);
      // Glimt skriver sammendraget (valgfritt) ut fra tallene; malen brukes ellers.
      if (_taskLlm42.impl || process.env.NODE_ENV !== 'test') {
        try {
          const prompt = `Skriv et kort sammendrag (2–3 setninger, norsk) av forbruket. Bruk bare disse tallene og ikke finn på nye.\n${JSON.stringify({ periode: d.period.label, brukt: d.spent, forrige: d.prevSpent, endring_pst: d.change, kategorier: d.categories.slice(0, 5).map((c) => [c.name, c.sum]), abonnementer_mnd: d.subsMonthly })}`;
          const text = await Promise.race([_taskLlm42.impl ? Promise.resolve(_taskLlm42.impl(prompt, d)) : import('../ai-run.js').then(({ run }) => run('glimt', { user: u, prompt, numPredict: 220, timeoutMs: _taskLlm42.ms, background: true, title: 'Glimt · forbruksrapport' }).then((x) => x.text)),
            sleep(_taskLlm42.ms).then(() => null)]);
          if (text && String(text).trim()) { d.summary = String(text).replace(/\s+/g, ' ').trim().slice(0, 600); d.summaryBy = 'glimt'; }
        } catch { /* malen står */ }
      }
      const buf = reportPdf42(d);
      pdfFile = `${id}.pdf`;
      await writeFile(join(DIR, pdfFile), buf);
      result = { ...d, fileName: reportFileName42(d), pdfBytes: buf.length, text: d.summary };
    } else if (r.kind === 'cut_subs') { set(0, 30); set(1, 60); set(2, 85); result = cutSubs(u); }
    else if (r.kind === 'compare_year') { set(0, 30); set(1, 60); set(2, 85); result = compareYear(u, params, now()); }
    else { set(0, 30); set(1, 60); set(2, 85); result = cleanCategories(u); }
    if (row(id)?.state !== 'running') return;
    q("UPDATE glimt_jobs SET state='done', step=?, pct=100, result=?, pdf=?, ended_at=? WHERE id=?").run(KINDS42[r.kind].steps.length, JSON.stringify(result), pdfFile, Date.now(), id);
    emit(id);
    import('../notify.js').then(({ notifyUser }) => notifyUser(u, { title: 'Glimt', body: r.kind === 'report' ? 'Glimt: rapporten er klar' : `Glimt: «${r.title}» er ferdig`, url: '/finans/#/glimt', tag: `glimt-task-${id}`, category: 'ai',
      data: { kind: 'glimt.task', jobId: id, icon: '/assets/glimt-varsel.png', badge: '/assets/glimt-badge.png' } }, { realtime: false })).catch(() => {});
  } catch (e) {
    if (e.cancelled) return;
    q("UPDATE glimt_jobs SET state='failed', error=?, ended_at=? WHERE id=?").run(String(e.message).slice(0, 300), Date.now(), id); emit(id);
  }
}
/** Venter til jobben er ferdig (tester). */
export async function waitTask42(id, ms = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = row(id); if (r && ['done', 'failed'].includes(r.state)) return jobOut42(r); await sleep(20); }
  return jobOut42(row(id));
}
export const listTasks42 = (u) => q('SELECT * FROM glimt_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(u).map(jobOut42);
export const getTask42 = (u, id) => { const r = row(id); return r && r.user_id === u ? r : null; };
export async function deleteTask42(u, id) {
  const r = getTask42(u, id); if (!r) return false;
  q('DELETE FROM glimt_jobs WHERE id=?').run(id);
  const qu = queues.get(u); if (qu) { const i = qu.indexOf(id); if (i >= 0) qu.splice(i, 1); }
  if (r.pdf) await unlink(join(DIR, r.pdf)).catch(() => {});
  return true;
}
export const reportFile42 = (r) => (r?.pdf ? readFile(join(DIR, r.pdf)) : null);
