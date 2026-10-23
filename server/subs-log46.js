// Prompt 46 (SERVER46), claude-code-subscription-logg.md – Subscription OS → Historikk → «Logg»: alle tidligere fakturaer og prøveperioder.
// claude-code-provperioder-skjul-tom.md (serverdelen): trialsVisible46 sier om Prøveperioder-kortet/-seksjonen skal vises.
//
// Tabell subscription_events (per bruker, additiv): {id, user_id, subscription_id|null, service, type, amount (øre, negativ = betalt),
//   old_amount (øre, price_change), currency, date, account, source: bank|email|manual|glimt|trial, raw_ref (unik per bruker), created}.
//   type: charge | trial_start | trial_end | trial_converted | trial_cancelled | price_change | cancelled
// Fylles av syncSubsLog46 (kalles ved lesing, idempotent via raw_ref):
//   - charge: hver belastning i fh_transactions som hører til et abonnement (tx_id-koblingen, eller merchant/beskrivelse som inneholder
//     navnet) – bakover minst 24 mnd ved første kjøring. Ingenting slettes når et abonnement sies opp.
//   - trial_start (når prøven ble lagt til), trial_converted (status kept / første belastning etter sluttdato), trial_cancelled (status
//     cancelled – «Spart N kr»). Prøven kan fjernes fra Hjem; loggen står.
//   - price_change: prev_price → price (price_changed-datoen på abonnementet).
// Ruter (FinansHub-API-et, /finans/api, samme tilgang som /subscriptions):
//   GET  /subscriptions/log?filter=all|charges|trials&months=3&before=YYYY-MM
//        → {summary:{charges, trials, paid12m, text}, filter, months:[{month, label, total, totalText, items:[event]}], more:{months, before}|null}
//        event: {id, service, type, typeLabel, trial:bool, badge:'PRØVE'|null, desc, amount, amountText, tone:'paid'|'saved'|'free'|'neutral',
//                date, dateText, account, logoUrl, oldPrice?, subscriptionId}
//   GET  /subscriptions/log.csv?filter=… → text/csv (semikolon, UTF-8 med BOM): Dato;Tjeneste;Type;Beløp
//   POST /subscriptions/log {service, type, amount, date, account?, subscriptionId?} (W) → 201 {event} (manuelle/Glimt-hendelser)
// Glimt (GLIMT46): subsLog46(user, {service?, from?, to?, types?}) og trialSavings46(user) – se SERVER46-API.md.
import { db } from './finans/db.js';
import { domainFor } from './finans/enrich.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS subscription_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, subscription_id INTEGER, service TEXT NOT NULL, type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0, old_amount INTEGER, currency TEXT NOT NULL DEFAULT 'NOK', date TEXT NOT NULL, account TEXT,
  source TEXT NOT NULL DEFAULT 'bank', raw_ref TEXT, created INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_ref ON subscription_events(user_id, raw_ref);
CREATE INDEX IF NOT EXISTS subscription_events_user ON subscription_events(user_id, date);`);

export const EVENT_TYPES46 = ['charge', 'trial_start', 'trial_end', 'trial_converted', 'trial_cancelled', 'price_change', 'cancelled'];
const TRIAL_TYPES = new Set(['trial_start', 'trial_end', 'trial_converted', 'trial_cancelled']);
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const addMonths = (iso, n) => { const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const kr = (ore) => { const v = Math.abs(ore) / 100; return `${Number.isInteger(v) ? v.toLocaleString('nb-NO') : v.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`; };
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON_S = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const dText = (iso) => `${+iso.slice(8, 10)}. ${MON_S[+iso.slice(5, 7) - 1]}`;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\+/g, ' plus').replace(/[^a-z0-9æøå ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ins = () => q(`INSERT OR IGNORE INTO subscription_events(user_id, subscription_id, service, type, amount, old_amount, currency, date, account, source, raw_ref, created)
  VALUES(@user_id, @subscription_id, @service, @type, @amount, @old_amount, 'NOK', @date, @account, @source, @raw_ref, @created)`);

/** Fyller loggen fra transaksjoner, prøveperioder og prisendringer. Idempotent. → antall nye hendelser */
export function syncSubsLog46(user, { months = 24, now = today() } = {}) {
  const subs = q('SELECT * FROM fh_subscriptions WHERE user_id=?').all(user);
  const from = addMonths(now, -Math.max(24, months));
  const st = ins();
  let n = 0;
  const add = (e) => { n += st.run({ user_id: user, subscription_id: null, old_amount: null, account: null, source: 'bank', created: Date.now(), ...e }).changes; };
  const tx = q(`SELECT t.id, t.date, t.amount, t.merchant, t.description, a.name AS account, a.type AS atype FROM fh_transactions t LEFT JOIN fh_accounts a ON a.id=t.account_id
    WHERE t.user_id=? AND t.amount < 0 AND t.date >= ? ORDER BY t.date`).all(user, from);
  const keys = subs.map((s) => ({ s, k: norm(s.name).split(' ').filter((w) => w.length >= 3 && !['plus', 'premium', 'family', 'familie', 'abonnement'].includes(w)) }))
    .filter((x) => x.k.length || norm(x.s.name).length >= 2);
  db.transaction(() => {
    for (const t of tx) {
      const text = ` ${norm(`${t.merchant ?? ''} ${t.description ?? ''}`)} `;
      const linked = subs.find((s) => s.tx_id === t.id);
      const m = linked ?? keys.find(({ s, k }) => (k.length ? k.every((w) => text.includes(` ${w}`)) : text.includes(` ${norm(s.name)} `)))?.s;
      if (!m) continue;
      const acc = t.atype === 'credit' ? 'Kredittkort' : t.account ?? null;
      add({ subscription_id: m.id, service: m.name, type: 'charge', amount: t.amount, date: t.date, account: acc, raw_ref: `tx:${t.id}` });
    }
    for (const s of subs) {
      if (s.prev_price != null && s.price_changed && s.prev_price !== s.price) add({ subscription_id: s.id, service: s.name, type: 'price_change', amount: -s.price, old_amount: -s.prev_price, date: s.price_changed, source: 'manual', raw_ref: `price:${s.id}:${s.price_changed}` });
    }
    let trials = [];
    try { trials = q('SELECT * FROM trials WHERE user_id=?').all(user); } catch { trials = []; }
    for (const t of trials) {
      const start = new Date(t.created).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
      const price = Math.round((t.price_after ?? 0) * 100);
      add({ subscription_id: t.subscription_id ?? null, service: t.service, type: 'trial_start', amount: 0, old_amount: price || null, date: start, source: t.source === 'glimt' ? 'glimt' : 'trial', raw_ref: `trial:${t.id}:start` });
      if (t.status === 'cancelled') add({ subscription_id: t.subscription_id ?? null, service: t.service, type: 'trial_cancelled', amount: 0, old_amount: price || null, date: t.updated ? new Date(t.updated).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }) : t.ends_at, source: 'trial', raw_ref: `trial:${t.id}:end` });
      else if (t.status === 'kept') add({ subscription_id: t.subscription_id ?? null, service: t.service, type: 'trial_converted', amount: -price, date: t.ends_at, source: 'trial', raw_ref: `trial:${t.id}:end` });
      else if (t.ends_at < now) {
        // Sluttdato passert uten avklaring: første belastning etter sluttdato = gikk over til betalt.
        const hit = q("SELECT 1 FROM subscription_events WHERE user_id=? AND type='charge' AND lower(service)=lower(?) AND date>=? LIMIT 1").get(user, t.service, t.ends_at);
        if (hit) add({ subscription_id: t.subscription_id ?? null, service: t.service, type: 'trial_converted', amount: -price, date: t.ends_at, source: 'trial', raw_ref: `trial:${t.id}:end` });
      }
    }
  })();
  return n;
}

const TYPE_LABEL = { charge: 'Faktura', trial_start: 'Prøveperiode startet', trial_end: 'Prøveperiode slutt', trial_converted: 'Gikk over til betalt', trial_cancelled: 'Prøveperiode avsluttet', price_change: 'Prisendring', cancelled: 'Sagt opp' };
function eventOut(e, prices, trialDays = new Map()) {
  const trial = TRIAL_TYPES.has(e.type);
  const amount = e.amount / 100;
  let desc = '', amountText = '', tone = 'neutral';
  if (e.type === 'charge') {
    const cur = prices.get(e.subscription_id);
    const older = cur != null && -e.amount < cur;
    desc = `Faktura · ${dText(e.date)}${e.account ? ` · ${e.account}` : ''}${older ? ' · gammel pris' : ''}`;
    amountText = `−${kr(e.amount)}`; tone = 'paid';
  } else if (e.type === 'trial_start') {
    const days = trialDays.get(e.raw_ref) ?? null;
    desc = `Prøveperiode · ${dText(e.date)} · gratis${days ? ` i ${days} dager` : ''}`; amountText = '0 kr'; tone = 'free';
  } else if (e.type === 'trial_cancelled') {
    desc = `Prøveperiode · sagt opp i tide · ${dText(e.date)}`; amountText = e.old_amount ? `Spart ${kr(e.old_amount)}` : 'Spart'; tone = 'saved';
  } else if (e.type === 'trial_converted') {
    desc = `Prøveperiode · gikk over til betalt · ${dText(e.date)}${e.amount ? ` · ${kr(e.amount)}/mnd` : ''}`; amountText = e.amount ? `−${kr(e.amount)}` : '0 kr'; tone = 'paid';
  } else if (e.type === 'price_change') {
    desc = `Prisendring · ${dText(e.date)} · ${kr(e.old_amount ?? 0)} → ${kr(e.amount)}`; amountText = `${kr(e.amount)}/mnd`;
  } else { desc = `${TYPE_LABEL[e.type] ?? e.type} · ${dText(e.date)}`; amountText = e.amount ? `−${kr(e.amount)}` : ''; }
  const domain = (() => { try { return domainFor(e.service) || null; } catch { return null; } })();
  return { id: e.id, service: e.service, type: e.type, typeLabel: TYPE_LABEL[e.type] ?? e.type, trial, badge: trial ? 'PRØVE' : null, desc, amount, amountText, tone,
    date: e.date, dateText: dText(e.date), account: e.account ?? null, source: e.source, logoUrl: domain ? `/finans/api/logo/${domain}` : null,
    ...(e.old_amount != null && e.type === 'price_change' ? { oldPrice: -e.old_amount / 100 } : {}), subscriptionId: e.subscription_id ?? null };
}
const FILTERS = { all: null, charges: ['charge', 'trial_converted', 'price_change', 'cancelled'], trials: [...TRIAL_TYPES] };
const rowsOf = (user, filter) => {
  const types = FILTERS[filter] ?? null;
  return q(`SELECT * FROM subscription_events WHERE user_id=? ${types ? `AND type IN (${types.map(() => '?').join(',')})` : ''} ORDER BY date DESC, id DESC`).all(user, ...(types ?? []));
};
/** Loggen gruppert per måned. */
export function subsLogOut46(user, { filter = 'all', months = 3, before = null, now = today() } = {}) {
  syncSubsLog46(user, { now });
  const f = FILTERS[filter] !== undefined ? filter : 'all';
  const prices = new Map(q('SELECT id, price FROM fh_subscriptions WHERE user_id=?').all(user).map((s) => [s.id, s.price]));
  const trialDays = new Map();
  try { for (const t of q('SELECT id, created, ends_at FROM trials WHERE user_id=?').all(user)) { const d = Math.round((Date.parse(`${t.ends_at}T12:00:00Z`) - t.created) / 86400_000); if (d > 0 && d < 400) trialDays.set(`trial:${t.id}:start`, d); } } catch { /* */ }
  const all = rowsOf(user, f);
  const ev = rowsOf(user, 'all');
  const since12 = addMonths(now, -12);
  const charges = ev.filter((e) => e.type === 'charge').length, trials = ev.filter((e) => e.type === 'trial_start').length;
  const paid12 = ev.filter((e) => (e.type === 'charge') && e.date >= since12).reduce((a, e) => a - e.amount, 0);
  const groups = new Map();
  for (const e of all) { const m = e.date.slice(0, 7); if (before && m >= before) continue; if (!groups.has(m)) groups.set(m, []); groups.get(m).push(e); }
  const keys = [...groups.keys()].sort().reverse();
  const shown = keys.slice(0, Math.max(1, Math.min(36, months)));
  const out = shown.map((m) => {
    const list = groups.get(m);
    const total = list.filter((e) => e.amount < 0 && e.type !== 'price_change').reduce((a, e) => a - e.amount, 0);
    return { month: m, label: `${MON[+m.slice(5, 7) - 1].replace(/^./, (c) => c.toUpperCase())} ${m.slice(0, 4)}`, total: total / 100, totalText: total ? `−${kr(total)}` : '0 kr', items: list.map((e) => eventOut(e, prices, trialDays)) };
  });
  const rest = keys.length - shown.length;
  return { filter: f, summary: { charges, trials, paid12m: paid12 / 100, text: `${charges} ${charges === 1 ? 'faktura' : 'fakturaer'} · ${trials} ${trials === 1 ? 'prøveperiode' : 'prøveperioder'} · ${kr(paid12)} betalt siste 12 mnd` },
    months: out, more: rest > 0 ? { months: rest, before: shown[shown.length - 1], label: `Vis eldre (${rest} ${rest === 1 ? 'måned' : 'måneder'})` } : null,
    // Flat liste (WEB46/ANDROID46 grupperer selv): hendelsene i de siste `months` månedene, amount positivt for belastninger.
    events: ev.filter((e) => e.date >= addMonths(now, -(Math.max(1, Math.min(36, months)) - 1))).map((e) => { const o = eventOut(e, prices, trialDays);
      return { id: o.id, subscriptionId: o.subscriptionId, service: o.service, type: o.type, amount: Math.abs(o.amount), currency: 'NOK', date: o.date, account: o.account, source: o.source,
        ...(e.type === 'price_change' ? { oldPrice: Math.abs(e.old_amount ?? 0) / 100, newPrice: Math.abs(e.amount) / 100 } : {}), ...(TRIAL_TYPES.has(e.type) && e.old_amount ? { priceAfter: Math.abs(e.old_amount) / 100 } : {}),
        ...(trialDays.get(e.raw_ref) ? { days: trialDays.get(e.raw_ref) } : {}), logoUrl: o.logoUrl, domain: o.logoUrl ? o.logoUrl.split('/').pop() : null }; }),
    filters: [{ id: 'all', label: 'Alle' }, { id: 'charges', label: 'Fakturaer' }, { id: 'trials', label: 'Prøveperioder' }], csv: `/finans/api/subscriptions/log.csv?filter=${f}` };
}
/** CSV (semikolon, UTF-8 med BOM): Dato;Tjeneste;Type;Beløp. */
export function subsLogCsv46(user, filter = 'all') {
  syncSubsLog46(user);
  const cell = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = ['Dato;Tjeneste;Type;Beløp'];
  for (const e of rowsOf(user, FILTERS[filter] !== undefined ? filter : 'all')) lines.push([e.date, e.service, TYPE_LABEL[e.type] ?? e.type, (e.amount / 100).toFixed(2).replace('.', ',')].map(cell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/* ---------------- Glimt ---------------- */

/** For Glimt: hendelser filtrert på tjeneste/periode/type. → [{date, service, type, typeLabel, amount (kr), account}] */
export function subsLog46(user, { service = null, from = null, to = null, types = null } = {}) {
  syncSubsLog46(user);
  const s = service ? norm(service) : null;
  return rowsOf(user, 'all').filter((e) => (!s || norm(e.service).includes(s) || s.includes(norm(e.service))) && (!from || e.date >= from) && (!to || e.date <= to) && (!types || types.includes(e.type)))
    .map((e) => ({ date: e.date, service: e.service, type: e.type, typeLabel: TYPE_LABEL[e.type] ?? e.type, amount: e.amount / 100, account: e.account ?? null }));
}
/** «Hvor mye har jeg spart på å si opp prøveperioder?» → {count, saved (kr/mnd), items:[{service, date, saved}]} */
export function trialSavings46(user) {
  syncSubsLog46(user);
  const items = rowsOf(user, 'trials').filter((e) => e.type === 'trial_cancelled').map((e) => ({ service: e.service, date: e.date, saved: (e.old_amount ?? 0) / 100 }));
  return { count: items.length, saved: Math.round(items.reduce((a, x) => a + x.saved, 0) * 100) / 100, items };
}

/* ---------------- Prøveperioder: vis bare når det finnes aktive ---------------- */

/** Aktive = status active og sluttdato i dag eller senere. → {visible, count, editHint} */
export function trialsVisible46(user, now = today()) {
  let n = 0;
  try { n = q("SELECT count(*) FROM trials WHERE user_id=? AND status='active' AND ends_at >= ?").pluck().get(user, now); } catch { n = 0; }
  return { visible: n > 0, count: n, editHint: 'Vises når du har en aktiv prøveperiode' };
}

/* ---------------- Ruter ---------------- */

export function mountSubsLog46(api, { R, W }) {
  api.get('/subscriptions/log', R, (c) => {
    const months = Math.max(1, Math.min(36, parseInt(c.req.query('months') ?? '3', 10) || 3));
    const before = /^\d{4}-\d{2}$/.test(c.req.query('before') ?? '') ? c.req.query('before') : null;
    return c.json(subsLogOut46(c.get('user'), { filter: c.req.query('filter') ?? 'all', months, before }));
  });
  api.get('/subscriptions/log.csv', R, (c) => c.body(subsLogCsv46(c.get('user'), c.req.query('filter') ?? 'all'), 200, {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="abonnement-logg-${today()}.csv"`, 'Cache-Control': 'no-store' }));
  api.post('/subscriptions/log', W, async (c) => {
    const b = await c.req.json().catch(() => null);
    const service = String(b?.service ?? '').trim().slice(0, 80), type = String(b?.type ?? 'charge');
    if (!service) return c.json({ error: 'Mangler tjeneste' }, 400);
    if (!EVENT_TYPES46.includes(type)) return c.json({ error: `type må være ${EVENT_TYPES46.join(', ')}` }, 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b?.date ?? '') ? b.date : today();
    const amt = Number(b?.amount ?? 0);
    if (!Number.isFinite(amt) || Math.abs(amt) > 1e6) return c.json({ error: 'Ugyldig beløp' }, 400);
    const ref = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const user = c.get('user');
    ins().run({ user_id: user, subscription_id: Number.isInteger(b?.subscriptionId) ? b.subscriptionId : null, service, type, amount: -Math.round(Math.abs(amt) * 100) * (type === 'trial_cancelled' || type === 'trial_start' ? 0 : 1),
      old_amount: type === 'trial_cancelled' || type === 'trial_start' ? Math.round(Math.abs(amt) * 100) : null, date, account: b?.account ? String(b.account).slice(0, 40) : null, source: b?.source === 'glimt' ? 'glimt' : b?.source === 'email' ? 'email' : 'manual', raw_ref: ref, created: Date.now() });
    const e = q('SELECT * FROM subscription_events WHERE user_id=? AND raw_ref=?').get(user, ref);
    return c.json({ event: eventOut(e, new Map()) }, 201);
  });
}
