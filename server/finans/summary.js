// Prompt 27: kort tekstsammendrag av Finans for Chat («Mine data»). Bare tall og navn på butikker/kategorier for brukeren selv,
// ingen kontonumre, kortdata eller varelinjer. Brukes av /api/chat/mydata og systemprompten når «Mine data» er på.
import { db, me } from './db.js';

const q = (sql) => db.prepare(sql);
const kr = (ore) => `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(Math.abs(ore) / 100)).replace(/\s/g, ' ')} kr`;
const dd = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export function finansSummary(u = me(), days = 30) {
  const from = new Date(Date.now() - days * 86400_000).toLocaleDateString('sv-SE');
  const base = `FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=@u AND t.date>=@from AND coalesce(c.kind,'expense')<>'transfer'`;
  const tot = q(`SELECT count(*) n, total(CASE WHEN t.amount<0 THEN -t.amount END) ut, total(CASE WHEN t.amount>0 THEN t.amount END) inn ${base}`).get({ u, from });
  if (!tot.n) return `Finans siste ${days} dager: ingen transaksjoner.`;
  const cats = q(`SELECT coalesce(c.name,'Ukategorisert') n, -total(t.amount) s ${base} AND t.amount<0 GROUP BY n ORDER BY s DESC LIMIT 5`).all({ u, from });
  const stores = q(`SELECT coalesce(nullif(t.merchant,''), t.description) n, count(*) k, -total(t.amount) s ${base} AND t.amount<0 GROUP BY n ORDER BY k DESC, s DESC LIMIT 5`).all({ u, from });
  const last = q(`SELECT t.date, coalesce(nullif(t.merchant,''), t.description) n, t.amount ${base} ORDER BY t.date DESC, t.id DESC LIMIT 3`).all({ u, from });
  let subs = null;
  try { subs = q("SELECT count(*) n, total(CASE cycle WHEN 'yearly' THEN price/12.0 WHEN 'biennial' THEN price/24.0 ELSE price END) m FROM fh_subscriptions WHERE user_id=? AND active=1").get(u); } catch { /* tabellen mangler */ }
  const parts = [`Finans siste ${days} dager (${tot.n} transaksjoner): utgifter ${kr(tot.ut)}, inntekter ${kr(tot.inn)}.`];
  if (cats.length) parts.push(`Største kategorier: ${cats.map((x) => `${x.n} ${kr(x.s)}`).join(', ')}.`);
  if (stores.length) parts.push(`Mest handlet: ${stores.map((x) => `${x.n} (${x.k} kjøp, ${kr(x.s)})`).join(', ')}.`);
  if (last.length) parts.push(`Siste: ${last.map((x) => `${dd(x.date)} ${x.n} ${x.amount < 0 ? '−' : '+'}${kr(x.amount)}`).join(', ')}.`);
  if (subs?.n) parts.push(`Aktive abonnementer: ${subs.n}, ca. ${kr(subs.m)} i måneden.`);
  return parts.join(' ');
}
