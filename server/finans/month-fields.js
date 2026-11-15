// Saldokortet og månedstoppen i Liste (prompt 43): feltene som /summary, /overview og /transactions legger på svaret.
//   saldoFields43(summary) → {spentMonth, day, daysInMonth, monthName, spentLabel, ring, dayText}
//   monthsOf43(u, filter)  → [{month, label, labelShort, name, year, count, net, inn, ut, netText}] (netto per måned, samme filter som Liste)
// Egen fil uten ruter, så routes.js, glimt-routes.js og overview.js kan bruke den uten sirkulær import.
import { q } from './db.js';
import { osloDate } from '../dates/oslo.js';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const today = () => osloDate();
const kr = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')} kr`;

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

/** /summary-svaret med saldokortets felt (bare de som mangler). */
export function withSaldo43(j) {
  const add = saldoFields43(j);
  return { ...j, ...Object.fromEntries(Object.entries(add).filter(([k]) => j[k] === undefined)) };
}

/** Transaksjonslista med months:[…] for månedene som er med i svaret (samme filter på konto, kategori og type). */
export function withMonths43(u, qs, j) {
  if (!u || !Array.isArray(j.items) || j.months) return j;
  const want = new Set(j.items.map((t) => String(t.date ?? '').slice(0, 7)));
  return { ...j, months: monthsOf43(u, { account: qs.account, category: qs.category, type: qs.type }).filter((m) => want.has(m.month)) };
}
