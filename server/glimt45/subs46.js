// Prompt 46 (GLIMT46): Glimt finner og bruker abonnementer, faste utgifter og prøveperioder (claude-code-glimt-finn-og-bruk-data-
// abonnementer.md, claude-code-glimt-provperiode-paaminnelse-subscription.md). Alt regnes ut deterministisk her – modellen velger
// bare verktøy og rangering; summer, normalisering og sortering gjøres av koden.
//
// Datakildene (eksisterende, ingenting nytt):
//   fh_subscriptions  – registrerte abonnementer (Subscription OS): price i øre per trekk, cycle monthly|yearly|biennial,
//                       prev_price/price_changed (prisendring), active, delte via subscription_members (shared37.js).
//   fh_recurring      – faste trekk (Budsjett): amount i øre, interval monthly|yearly|weekly, active.
//   trials            – gratis prøveperioder (finans/trials.js): ends_at, price_after, status active|cancelled|kept, subscription_id.
// trials får to nye kolonner (additivt): cancel_by (avslutningsfristen brukeren oppga) og ends_kind ('trial_end' = ends_at er når
// prøven faktisk slutter, 'cancel_by' = ends_at er bare fristen brukeren ga Glimt, prøveslutten er ukjent).
import { db } from '../db.js';
import { addDays45, todayOslo45 } from './dates.js';

const q = (sql) => db.prepare(sql);
const cols = (t) => { try { return q(`PRAGMA table_info(${t})`).all().map((c) => c.name); } catch { return []; } };
let trialCols = null;
function ensureTrialCols() {
  if (trialCols) return;
  try {
    // trials lages av finans/trials.js; Glimt legger til to kolonner hvis de mangler (ingen data slettes).
    const c = cols('trials');
    if (!c.length) return;
    if (!c.includes('cancel_by')) db.exec('ALTER TABLE trials ADD COLUMN cancel_by TEXT');
    if (!c.includes('ends_kind')) db.exec("ALTER TABLE trials ADD COLUMN ends_kind TEXT NOT NULL DEFAULT 'trial_end'");
    trialCols = true;
  } catch (e) { console.warn('[glimt46] trials-kolonner:', e.message); }
}

/* ---------------- Normalisering ---------------- */

// Måneder per trekk. Ukjent syklus → null (sammenligningen er usikker, ikke gjett).
export const CYCLE_MONTHS46 = { weekly: 12 / 52, monthly: 1, quarterly: 3, halfyearly: 6, semiannual: 6, yearly: 12, annual: 12, biennial: 24 };
export const CYCLE_LABEL46 = { weekly: 'uke', monthly: 'måned', quarterly: 'kvartal', halfyearly: 'halvår', semiannual: 'halvår', yearly: 'år', annual: 'år', biennial: 'andre år' };
const r2 = (v) => Math.round(v * 100) / 100;
/** Pris per trekk (kr) + syklus → {monthly, yearly} eller {uncertain:'cycle'|'price'}. */
export function normalizeCost46(priceKr, cycle) {
  const m = CYCLE_MONTHS46[String(cycle ?? '').toLowerCase()];
  if (!(priceKr > 0)) return { monthly: null, yearly: null, uncertain: 'price' };
  if (!m) return { monthly: null, yearly: null, uncertain: 'cycle' };
  return { monthly: r2(priceKr / m), yearly: r2((priceKr / m) * 12), uncertain: null };
}

/* ---------------- Abonnementer ---------------- */

let shareOf = null;
async function shareFn() {
  if (shareOf) return shareOf;
  try { const m = await import('../finans/shared37.js'); shareOf = { visible: m.visibleSubs, share: m.shareOre, members: m.memberIds }; } catch { shareOf = { visible: null, share: null, members: () => [] }; }
  return shareOf;
}
let failImpl = null;
/** Bare for tester: (kilde) → kast for å simulere at datakilden ikke svarer. */
export const _setSubsFail46 = (fn) => { failImpl = fn ?? null; };

/**
 * Alle aktive abonnementer brukeren betaler for (egne + delte), normalisert. Prøveperioder kommer med som egne rader (gratis nå).
 * → {items:[{id, kind:'subscription'|'trial', name, plan, price, cycle, cycleLabel, monthly, yearly, uncertain, shared, share, fullPrice,
 *            nextDate, prevPrice, priceChanged, increasePct, status, endsAt?, priceAfter?}], counts}
 */
export async function subscriptions46(user, today = todayOslo45()) {
  if (failImpl) failImpl('subscriptions');
  const sh = await shareFn();
  const rows = sh.visible ? sh.visible(user) : q('SELECT * FROM fh_subscriptions WHERE user_id=?').all(user);
  const items = [];
  for (const s of rows) {
    if (!s.active) continue;
    const members = sh.members?.(s.id) ?? [];
    const shared = members.length > 0;
    const shareOre = shared && sh.share ? sh.share(s, user) : s.price;
    const price = (shareOre ?? 0) / 100;
    const n = normalizeCost46(price, s.cycle);
    const prev = s.prev_price && s.prev_price !== s.price ? s.prev_price / 100 : null;
    items.push({ id: s.id, kind: 'subscription', name: s.name, plan: s.plan || '', price, fullPrice: s.price / 100, cycle: s.cycle, cycleLabel: CYCLE_LABEL46[s.cycle] ?? null,
      monthly: n.monthly, yearly: n.yearly, uncertain: n.uncertain, shared, share: shared ? price : null, nextDate: s.next_date ?? null,
      prevPrice: prev, priceChanged: s.price_changed ?? null, increasePct: prev && s.price > s.prev_price ? Math.round(((s.price - s.prev_price) / s.prev_price) * 100) : null,
      status: s.low_use ? 'lite brukt' : 'aktiv', open: { web: `/finans/#/abonnement/${s.id}`, deepLink: `finanshub://abonnement?id=${s.id}` } });
  }
  let trials = [];
  try { trials = q("SELECT * FROM trials WHERE user_id=? AND status='active' ORDER BY ends_at").all(user); } catch { /* tabellen finnes ikke */ }
  for (const t of trials) {
    if (items.some((x) => x.kind === 'subscription' && fold(x.name) === fold(t.service))) continue;
    items.push({ id: `trial-${t.id}`, trialId: t.id, kind: 'trial', name: t.service, plan: 'Gratis prøveperiode', price: 0, cycle: 'monthly', cycleLabel: 'måned', monthly: 0, yearly: 0,
      uncertain: null, shared: false, share: null, nextDate: t.ends_at, endsAt: t.ends_at, priceAfter: t.price_after ?? null, status: 'prøve',
      open: { web: '/finans/#/abonnement', deepLink: 'finanshub://abonnement' } });
  }
  return { items, counts: { subscriptions: items.filter((x) => x.kind === 'subscription').length, trials: items.filter((x) => x.kind === 'trial').length } };
}

/** Faste utgifter: abonnementer + faste trekk i Budsjett (fh_recurring), uten doble navn. */
export async function fixedCosts46(user, today = todayOslo45()) {
  if (failImpl) failImpl('fixed');
  const subs = (await subscriptions46(user, today)).items.filter((x) => x.kind === 'subscription');
  let rec = [];
  try { rec = q('SELECT * FROM fh_recurring WHERE user_id=? AND active=1').all(user); } catch { rec = []; }
  const out = subs.map((s) => ({ ...s, source: 'Abonnement' }));
  for (const r of rec) {
    if (out.some((x) => fold(x.name) === fold(r.name))) continue;
    const price = Math.abs(r.amount) / 100;
    const n = normalizeCost46(price, r.interval);
    out.push({ id: `rec-${r.id}`, kind: 'recurring', name: r.name, plan: '', price, cycle: r.interval, cycleLabel: CYCLE_LABEL46[r.interval] ?? null, monthly: n.monthly, yearly: n.yearly, uncertain: n.uncertain,
      day: r.day, month: r.month ?? null, nextDate: nextRecurring(r, today), source: 'Fast trekk', open: { web: '/finans/#/budsjett', deepLink: 'finanshub://budsjett' } });
  }
  return out;
}
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function nextRecurring(r, today) {
  const y = +today.slice(0, 4), mo = +today.slice(5, 7);
  if (r.interval === 'weekly') return null;
  if (r.interval === 'yearly' && r.month) { const d = `${y}-${pad(r.month)}-${pad(Math.min(r.day || 1, lastDay(y, r.month)))}`; return d >= today ? d : `${y + 1}-${pad(r.month)}-${pad(Math.min(r.day || 1, lastDay(y + 1, r.month)))}`; }
  const d = `${y}-${pad(mo)}-${pad(Math.min(r.day || 1, lastDay(y, mo)))}`;
  if (d >= today) return d;
  const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(r.day || 1, lastDay(ny, nm)))}`;
}
/** Trekk i en måned (YYYY-MM) for abonnementer (subs.js chargesInMonth) og faste trekk. */
export async function chargesInMonth46(user, ym, today = todayOslo45()) {
  const list = await fixedCosts46(user, today);
  const out = [];
  let subsOs = null; try { subsOs = await import('../finans/subs.js'); } catch { /* */ }
  const rows = q('SELECT * FROM fh_subscriptions WHERE user_id=? AND active=1').all(user);
  for (const x of list) {
    if (x.kind === 'subscription' && subsOs) {
      const raw = rows.find((r) => r.id === x.id) ?? { ...x, active: 1, price: Math.round(x.price * 100), next_date: x.nextDate };
      for (const d of subsOs.chargesInYear(raw, +ym.slice(0, 4))) if (d.startsWith(ym)) out.push({ ...x, date: d });
    } else if (x.kind === 'recurring') {
      if (x.cycle === 'monthly' || (x.cycle === 'yearly' && x.month === +ym.slice(5, 7))) out.push({ ...x, date: `${ym}-${pad(Math.min(x.day || 1, lastDay(+ym.slice(0, 4), +ym.slice(5, 7))))}` });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ---------------- Prøveperiode / avslutningspåminnelse ---------------- */

export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå+]+/g, ' ').trim();
const sameService = (a, b) => { const x = fold(a).replace(/\s+/g, ''), y = fold(b).replace(/\s+/g, ''); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

/** Tjenester brukeren allerede har (abonnementer og prøver) som matcher navnet. → [{kind, id, name, …}] */
export function findService46(user, name) {
  if (!name) return [];
  ensureTrialCols();
  const subs = q('SELECT * FROM fh_subscriptions WHERE user_id=? AND active=1').all(user).filter((s) => sameService(s.name, name) || sameService(`${s.name} ${s.plan ?? ''}`, name));
  let trials = [];
  try { trials = q("SELECT * FROM trials WHERE user_id=? AND status='active'").all(user).filter((t) => sameService(t.service, name)); } catch { /* */ }
  return [...subs.map((s) => ({ kind: 'subscription', id: s.id, name: s.name, plan: s.plan || '', price: s.price / 100, cycle: s.cycle, row: s })), ...trials.map((t) => ({ kind: 'trial', id: t.id, name: t.service, row: t }))];
}
/** Navn fra brukerens egne abonnementer/prøver som står i teksten (lengste først). */
export function serviceInText46(user, text) {
  const t = ` ${fold(text)} `;
  let names = [];
  try { names = q('SELECT name FROM fh_subscriptions WHERE user_id=?').pluck().all(user); } catch { /* */ }
  try { names.push(...q('SELECT service FROM trials WHERE user_id=?').pluck().all(user)); } catch { /* */ }
  return [...new Set(names)].sort((a, b) => b.length - a.length).find((n) => fold(n).length >= 3 && t.includes(` ${fold(n)} `)) ?? null;
}

let logHook = null;
/** Subscription-loggen (SERVER46) kan registrere seg her: (user, {type:'trial_start'|'trial_updated', service, trialId, endsAt, cancelBy, source}). */
export const registerTrialLog46 = (fn) => { logHook = fn ?? null; };
async function logTrial(user, row) {
  try {
    if (logHook) return void await logHook(user, row);
    // Subscription-loggen (SERVER46, server/subs-log46.js) lager trial_start fra trials-tabellen; synk med en gang så loggen er oppdatert.
    const m = await import('../subs-log46.js').catch(() => null);
    if (m?.syncSubsLog46) m.syncSubsLog46(user);
  } catch (e) { console.warn('[glimt46] abonnementslogg:', e.message); }
}

/**
 * Registrer eller oppdater at en tjeneste må avsluttes innen `date` (Subscription OS → Prøveperioder). Lager aldri duplikater:
 * finnes en aktiv prøve for tjenesten, oppdateres fristen (pris/varsler/lenke beholdes). Finnes tjenesten som abonnement, kobles
 * prøven til det (subscription_id) og prisen etterpå hentes derfra – abonnementet selv endres ikke.
 * → {status:'created'|'updated'|'unchanged', trial, subscription?} | kaster
 */
export async function upsertCancelDeadline46(user, { service, date, trialEnd = null, priceAfter = null, subscriptionId = null, today = todayOslo45(), source = 'glimt' }) {
  ensureTrialCols();
  if (failImpl) failImpl('trials');
  const tr = await import('../finans/trials.js');
  const existing = findService46(user, service);
  const trial = existing.find((x) => x.kind === 'trial');
  const sub = subscriptionId ? existing.find((x) => x.kind === 'subscription' && x.id === subscriptionId) : existing.find((x) => x.kind === 'subscription');
  const now = Date.now();
  if (trial) {
    const r = trial.row;
    const knownEnd = (r.ends_kind ?? 'trial_end') === 'trial_end';
    const patch = { cancel_by: date };
    // Prøveslutten endres bare når brukeren oppga den, eller når den gamle sluttdatoen bare var en frist fra Glimt.
    if (trialEnd) patch.ends_at = trialEnd, patch.ends_kind = 'trial_end';
    else if (!knownEnd) patch.ends_at = date;
    if (priceAfter != null && r.price_after == null) patch.price_after = priceAfter;
    if (sub && !r.subscription_id) patch.subscription_id = sub.id;
    const changed = Object.entries(patch).some(([k, v]) => r[k] !== v);
    if (changed) {
      const sets = Object.keys(patch).map((k) => `${k}=@${k}`).join(', ');
      q(`UPDATE trials SET ${sets}, updated=@now WHERE id=@id AND user_id=@u`).run({ ...patch, now, id: r.id, u: user });
      await logTrial(user, { type: 'trial_updated', service: r.service, trialId: r.id, endsAt: patch.ends_at ?? r.ends_at, cancelBy: date, source });
    }
    const row = tr.trialRow(user, r.id);
    return { status: changed ? 'updated' : 'unchanged', trial: trialOut46(tr, row, today), previous: { endsAt: r.ends_at, cancelBy: r.cancel_by ?? null }, ...(sub ? { subscription: subOut46(sub) } : {}) };
  }
  const after = priceAfter ?? (sub && sub.price > 0 ? Math.round(((sub.price) / (CYCLE_MONTHS46[sub.cycle] ?? 1)) * 100) / 100 : null);
  const r = tr.createTrial(user, { service: sub?.name ?? service, endsAt: trialEnd ?? date, priceAfter: after, remindOffsetsDays: trialEnd && trialEnd > date ? [Math.min(30, daysBetween(date, trialEnd))] : [0] }, { source, today });
  if (r.error) throw Object.assign(new Error(r.error), { status: 400 });
  q('UPDATE trials SET cancel_by=?, ends_kind=?, subscription_id=COALESCE(subscription_id, ?) WHERE id=?').run(date, trialEnd ? 'trial_end' : 'cancel_by', sub?.id ?? null, r.row.id);
  const row = tr.trialRow(user, r.row.id);
  await logTrial(user, { type: 'trial_start', service: row.service, trialId: row.id, endsAt: row.ends_at, cancelBy: date, source });
  return { status: 'created', trial: trialOut46(tr, row, today), ...(sub ? { subscription: subOut46(sub) } : {}) };
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
const subOut46 = (s) => ({ id: s.id, name: s.name, plan: s.plan, price: s.price, cycle: s.cycle });
function trialOut46(tr, row, today) {
  const t = tr.trialOut(row, today);
  return { ...t, cancelBy: row.cancel_by ?? null, endsKind: row.ends_kind ?? 'trial_end' };
}
/** Leser prøven tilbake fra datakilden (kontroll før svaret). */
export function trialById46(user, id) { ensureTrialCols(); try { return q('SELECT * FROM trials WHERE id=? AND user_id=?').get(id, user) ?? null; } catch { return null; } }
/** Prøvene som vises i Subscription OS → Prøveperioder (samme spørring som GET /finans/api/subscriptions/trials). */
export async function activeTrialList46(user) { const tr = await import('../finans/trials.js'); return tr.trialsFor(user); }
export { addDays45 };
