// Prompt 32 (SERVER32): Prøveperiode-widgets (iOS, Android/Glance, Samsung) + Hjem-widget h11 i appene.
// Sesjon eller app-token (GET: finance:read, POST: finance:write). Bare innlogget brukers aktive prøver (tabell trials).
//
// GET /api/widgets/trials → {today, count, empty, emptyText:'Ingen aktive prøver', addUrl, openUrl, deepLink,
//      next: trial|null, more:[trial ≤ 2], items:[next, ...more], updated}
//   trial = {id, name, endsAt, endLabel:'lør 1. nov', cancelBefore:'Avslutt før lør 1. nov', daysLeft, daysLabel:'12 dager igjen'|'1 dag igjen'|'i dag',
//            tone:'red'|'orange'|'ink', color:'#b23a2a'|'#a8661a'|null, startAt, progress (0–1, andel brukt; uten start 14 dager),
//            price|null, priceLabel:'149 kr/mnd'|'', afterLabel:'deretter 149 kr/mnd'|'', logoUrl|null, domain|null, cancelUrl|null,
//            deepLink:'finanshub://abonnement/prove/ID', url:'/finans/#/abonnement'}
// POST /api/widgets/trials/:id {action?:'done'|'kept'} eller {status:'cancelled'|'kept'}  (standard 'done' = «Avsluttet»: status cancelled, påminnelsene stopper;
//      'kept' = «Behold» via PATCH-logikken i FinansHub) → samme svar som GET (oppdatert widget). 404 for andres/ukjente prøver.
import { Hono } from 'hono';
import { db } from './db.js';
import { authOrToken } from './mobile.js';
import { osloTodayISO } from '../public/js/quick-time.js';
import { domainFor } from './finans/enrich.js';
import { cancelUrlFor, daysBetween, addDaysISO } from '../public/js/trial-parse.js';

const q = (sql) => db.prepare(sql);
const WDS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MNS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const shortDate = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${WDS[d.getUTCDay()]} ${d.getUTCDate()}. ${MNS[d.getUTCMonth()]}`; };
const priceLabel = (p) => (p == null ? '' : `${Number.isInteger(p) ? p : String(p.toFixed(2)).replace('.', ',')} kr/mnd`);
const isoOfMs = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });

export function trialCompact(row, today = osloTodayISO()) {
  const daysLeft = Math.max(0, daysBetween(today, row.ends_at));
  const start = row.created ? isoOfMs(row.created) : null;
  const s0 = start && start < row.ends_at ? start : addDaysISO(row.ends_at, -14);
  const total = Math.max(1, daysBetween(s0, row.ends_at));
  const progress = Math.round(Math.min(1, Math.max(0, daysBetween(s0, today) / total)) * 100) / 100;
  const tone = daysLeft <= 2 ? 'red' : daysLeft <= 7 ? 'orange' : 'ink';
  const domain = (() => { try { return domainFor(row.service) || null; } catch { return null; } })();
  const pl = priceLabel(row.price_after);
  return { id: row.id, name: row.service, endsAt: row.ends_at, endLabel: shortDate(row.ends_at), cancelBefore: `Avslutt før ${shortDate(row.ends_at)}`, daysLeft,
    daysLabel: daysLeft === 0 ? 'i dag' : daysLeft === 1 ? '1 dag igjen' : `${daysLeft} dager igjen`, tone, color: tone === 'red' ? '#b23a2a' : tone === 'orange' ? '#a8661a' : null,
    startAt: start, progress, price: row.price_after ?? null, priceLabel: pl, afterLabel: pl ? `deretter ${pl}` : '', logoUrl: domain ? `/finans/api/logo/${domain}` : null, domain,
    cancelUrl: row.cancel_url || cancelUrlFor(row.service) || null, deepLink: `finanshub://abonnement/prove/${row.id}`, url: '/finans/#/abonnement' };
}

export function trialsWidget(user, today = osloTodayISO()) {
  const rows = q("SELECT * FROM trials WHERE user_id=? AND status='active' AND ends_at>=? ORDER BY ends_at, id").all(user, today);
  const items = rows.slice(0, 3).map((r) => trialCompact(r, today));
  return { today, count: rows.length, empty: !rows.length, emptyText: 'Ingen aktive prøver', addLabel: '+ Legg til', addUrl: '/finans/#/abonnement/ny-prove',
    openUrl: '/finans/#/abonnement', deepLink: 'finanshub://abonnement', next: items[0] ?? null, more: items.slice(1), items, updated: new Date().toISOString() };
}

const api = new Hono();
api.use('*', (c, next) => authOrToken(c, next));
api.get('/', (c) => c.json(trialsWidget(c.get('user'))));
api.post('/:id{[0-9]+}', async (c) => {
  const user = c.get('user'), id = +c.req.param('id');
  const row = q('SELECT * FROM trials WHERE id=? AND user_id=?').get(id, user);
  if (!row) return c.json({ error: 'Fant ikke prøven' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const action = b?.action ?? (b?.status === 'kept' ? 'kept' : b?.status === undefined || b?.status === 'cancelled' ? 'done' : b.status);
  if (!['done', 'kept'].includes(action)) return c.json({ error: "action må være 'done' eller 'kept'" }, 400);
  if (action === 'done') q("UPDATE trials SET status='cancelled', updated=? WHERE id=?").run(Date.now(), id);
  else {
    // Samme logikk som appen (PATCH /finans/api/subscriptions/trials/:id {status:'kept'}): blir et vanlig abonnement.
    const { default: finansApi } = await import('./finans/routes.js');
    const r = await finansApi.request(`/subscriptions/trials/${id}`, { method: 'PATCH', headers: { cookie: c.req.header('cookie') ?? '', authorization: c.req.header('authorization') ?? '', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'kept' }) }, c.env);
    if (!r.ok) return c.json(await r.json().catch(() => ({ error: 'Kunne ikke beholde prøven' })), r.status);
  }
  return c.json({ ok: true, action, ...trialsWidget(user) });
});

export default api;
