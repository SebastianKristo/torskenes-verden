// Faste betalinger (Q4): abonnementer, faste utgifter og planlagte trekk i én form. Web og appene viser det serveren sender
// (navn, beløp per trekk og per måned, syklus, neste trekk, «label»), og regner ikke selv. Før lå dette i tre svar med hver sin
// form (/subscriptions, /recurring og /fin51/calendar), og klientene regnet ut trekkdager, månedssum og neste dato.
//
//   GET /finans/api/faste-betalinger?days=30
//   → { today, month, filters:[{id, name, count, monthly|total}], items:[Betaling], monthly, yearly, chargeDays:[{day, count, names}],
//       planned:{ days, from, to, items:[Trekk], total, lowest, warnings } }
//
// Betaling: {key, kind:'abonnement'|'fast', id, name, amount, monthly, yearly, cycle, cycleName, perLabel, nextDate, nextLabel, daysLeft,
//            label, active, category, color, source, href, duplicateOf}
// Trekk:    {date, label, kind:'abonnement'|'fast'|'funnet', id, name, amount (negativ), account, source}
//
// Beløp er kroner (to desimaler). For delte abonnementer er beløpet din del. En fast utgift med samme tjeneste som et abonnement
// telles bare én gang (duplicateOf). «I dag» er Oslo-datoen. Ingen eksterne kall (finansdata forlater aldri huset).
import { Hono } from 'hono';
import { auth42 } from './glimt-routes.js';
import { q51 as q, today51, addDays51, addMonths51, daysBetween51, dayLabel51, kr51, key51 } from './planning-util.js';
import { calendar51 } from './planning.js';
import { perMonth, nextCharge, seriesOf, chargesBetween, recurringNextDate, CYCLE_NAME, PER_LABEL } from './cycles.js';
import { visibleSubs, shareOre } from './shared-subs.js';
import { categoryFor } from './subs.js';

export const FILTERS = [['abonnementer', 'Abonnementer'], ['faste', 'Faste utgifter'], ['planlagte', 'Planlagte trekk']];
// fh_recurring.interval bruker de samme navnene som abonnementssyklusene (cycles.js).
const REC_CYCLES = ['monthly', 'yearly', 'weekly'];
const r2 = (v) => Math.round(v * 100) / 100;

const labelOf = (cycleName, nextDate, active) => (active ? `${cycleName}${nextDate ? ` · neste trekk ${dayLabel51(nextDate)}` : ''}` : `${cycleName} · av`);

function subItem(s, uid, today) {
  const cycle = s.cycle || 'monthly', share = shareOre(s, uid), active = !!s.active;
  const next = active && s.next_date ? nextCharge(seriesOf(s), today) ?? s.next_date : null;
  const cycleName = CYCLE_NAME[cycle] ?? 'Månedlig';
  return {
    key: `abonnement:${s.id}`, kind: 'abonnement', id: s.id, name: s.name, plan: s.plan || null,
    amount: kr51(share), monthly: r2(perMonth(share, cycle) / 100), yearly: r2((perMonth(share, cycle) * 12) / 100),
    cycle, cycleName, perLabel: PER_LABEL[cycle] ?? '/mnd', nextDate: next, nextLabel: next ? dayLabel51(next) : null,
    daysLeft: next ? daysBetween51(today, next) : null, label: labelOf(cycleName, next, active), active,
    category: categoryFor(s.name, s.category), color: null, source: 'Abonnement', shared: s.user_id !== uid || null,
    href: `#/fast/abonnementer/${s.id}`, duplicateOf: null,
  };
}

function recItem(r, cats, today) {
  const cycle = REC_CYCLES.includes(r.interval) ? r.interval : 'monthly', active = !!r.active;
  const next = active ? recurringNextDate(r, today) : null, cat = cats.get(r.category_id);
  const cycleName = CYCLE_NAME[cycle];
  return {
    key: `fast:${r.id}`, kind: 'fast', id: r.id, name: r.name, plan: null,
    amount: kr51(Math.abs(r.amount)), monthly: r2(perMonth(Math.abs(r.amount), cycle) / 100), yearly: r2((perMonth(Math.abs(r.amount), cycle) * 12) / 100),
    cycle, cycleName, perLabel: PER_LABEL[cycle], nextDate: next, nextLabel: next ? dayLabel51(next) : null,
    daysLeft: next ? daysBetween51(today, next) : null, label: labelOf(cycleName, next, active), active,
    category: cat?.name ?? null, color: cat?.color ?? null, source: r.detected ? 'Funnet i transaksjonene' : 'Fast utgift', detected: !!r.detected,
    day: r.day, month: r.month ?? null, href: `#/fast/faste/${r.id}`, duplicateOf: null,
  };
}

const PLAN_KIND = { sub: 'abonnement', recurring: 'fast', detected: 'funnet' };

/** Hele svaret for brukeren uid. Ren funksjon av databasen og datoen (testbar uten HTTP). */
export function fasteBetalinger(uid, { today = today51(), days = 30 } = {}) {
  const cats = new Map(q('SELECT id, name, color FROM fh_categories WHERE user_id=?').all(uid).map((c) => [c.id, c]));
  const subRows = visibleSubs(uid);
  const subs = subRows.map((s) => subItem(s, uid, today));
  const recs = q('SELECT * FROM fh_recurring WHERE user_id=? ORDER BY day, id').all(uid).map((r) => recItem(r, cats, today));
  // Samme tjeneste registrert både som abonnement og fast utgift: abonnementet teller, den faste utgiften peker dit.
  const subKey = new Map(subs.filter((s) => s.active).map((s) => [key51(s.name), s.key]).filter(([k]) => k));
  for (const r of recs) { const k = key51(r.name); if (k && subKey.has(k)) r.duplicateOf = subKey.get(k); }
  const items = [...subs, ...recs];
  const counted = items.filter((x) => x.active && !x.duplicateOf);
  const sum = (list, f) => r2(list.reduce((a, x) => a + x[f], 0));
  const monthOf = (kind) => sum(counted.filter((x) => x.kind === kind), 'monthly');

  const cal = calendar51(uid, { days, today });
  const plannedItems = cal.items.filter((x) => x.amount < 0).map((x) => ({
    date: x.date, label: dayLabel51(x.date), kind: PLAN_KIND[x.kind] ?? x.kind, id: x.id, name: x.name, amount: x.amount, account: x.account, source: x.source,
  }));
  const planned = { days: cal.days.length, from: cal.from, to: cal.to, items: plannedItems, total: sum(plannedItems, 'amount'),
    lowest: cal.lowest, warnings: cal.warnings, accounts: cal.accounts.map(({ series, ...a }) => a) };

  // Trekkdagene i inneværende måned (kalenderen på Faste utgifter), regnet her i stedet for i klienten.
  const month = today.slice(0, 7), monthEnd = addDays51(addMonths51(`${month}-01`, 1, 1), -1), byDay = new Map();
  const add = (d, name) => { const k = +d.slice(8, 10); (byDay.get(k) ?? byDay.set(k, []).get(k)).push(name); };
  const rowOf = new Map(subRows.map((s) => [s.id, s]));
  for (const x of counted) {
    if (x.kind === 'fast') {
      const r = { interval: x.cycle, day: x.day, month: x.month };
      for (let d = recurringNextDate(r, `${month}-01`); d <= monthEnd; d = recurringNextDate(r, addDays51(d, 1))) add(d, x.name);
    } else {
      const sr = seriesOf(rowOf.get(x.id) ?? {});
      if (sr) chargesBetween(sr, `${month}-01`, monthEnd, { backward: true }).forEach((d) => add(d, x.name));
    }
  }
  const chargeDays = [...byDay].sort((a, b) => a[0] - b[0]).map(([day, names]) => ({ day, count: names.length, names }));

  return {
    today, month,
    filters: [
      { id: 'abonnementer', name: 'Abonnementer', count: subs.length, active: subs.filter((s) => s.active).length, monthly: monthOf('abonnement') },
      { id: 'faste', name: 'Faste utgifter', count: recs.length, active: recs.filter((r) => r.active).length, monthly: monthOf('fast') },
      { id: 'planlagte', name: 'Planlagte trekk', count: plannedItems.length, total: planned.total, days: planned.days },
    ],
    items, monthly: sum(counted, 'monthly'), yearly: sum(counted, 'yearly'), chargeDays, planned,
  };
}

const R = auth42('finance:read');
export const fasteBetalingerApi = new Hono();
fasteBetalingerApi.get('/faste-betalinger', R, (c) => c.json(fasteBetalinger(c.get('user'), { days: Math.min(92, Math.max(7, +c.req.query('days') || 30)) })));
export default fasteBetalingerApi;
