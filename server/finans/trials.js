// Prompt 31 (SERVER31): gratis prøveperioder – «påminn meg om å avslutte» (claude-code-prove-paminnelse.md).
// Tabell trials (per bruker). Montert i FinansHub-API-et (samme tilgang: økt eller token; skriving krever finance:write):
//   GET   /finans/api/subscriptions/trials[?all=1]  → {items:[trial], cancelLinks, remindOptions, today}
//         trial = {id, service, endsAt, priceAfter, priceLabel, remindOffsetsDays, status, created, daysLeft, badge,
//                  cancelUrl, snoozeUntil, subscriptionId, notifications:[{key, kind, date, time, at, title, body, sent,
//                  actions}]}  – notifications er kjente tidspunkter appene kan planlegge som lokale varsler.
//   POST  /finans/api/subscriptions/trials        {service, endsAt, priceAfter?, remindOffsetsDays?} eller {text} → 201 trial
//   POST  /finans/api/subscriptions/trials/parse  {text, today?} → parseTrial + preview
//   PATCH /finans/api/subscriptions/trials/:id    {status:'active'|'cancelled'|'kept'} | {snooze:'tomorrow'} | felt
//         status 'kept' gjør prøven om til et vanlig abonnement (pris etterpå, neste trekk = sluttdato) → {…trial, subscription}
// Varslene sendes av server/trials-notify.js (kl. 09:00 Oslo ends_at − offset, siste varsel 18:00 på sluttdagen).
// Kalender: prøvene vises som heldagshendelser i Privat (virtuell kilde «trials», se trialCalendarItems).
import { db } from '../db.js';
import { parseTrial, trialSchedule, trialTitle, trialBody, trialBadge, trialPreview, cancelUrlFor, CANCEL_LINKS, REMIND_OPTIONS, DEFAULT_OFFSETS, daysBetween, addDaysISO } from '../../public/js/trial-parse.js';
import { osloTodayISO } from '../../public/js/quick-time.js';

db.exec(`CREATE TABLE IF NOT EXISTS trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  price_after REAL,
  remind_offsets_days TEXT NOT NULL DEFAULT '[1]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','kept')),
  created INTEGER NOT NULL,
  updated INTEGER,
  snooze_until TEXT,
  sent TEXT NOT NULL DEFAULT '[]',
  cancel_url TEXT,
  source TEXT,
  subscription_id INTEGER
);
CREATE INDEX IF NOT EXISTS trials_user ON trials(user_id, status, ends_at);`);
const q = (sql) => db.prepare(sql);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => DATE.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const parseJ = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const pad = (n) => String(n).padStart(2, '0');

/** Veggklokke i Oslo (dato + HH:MM) → ms UTC (sommer- og vintertid). */
export function osloMs(date, hm) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  for (const off of [1, 2]) {
    const t = Date.UTC(y, m - 1, d, h - off, mi);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === `${pad(h)}:${pad(mi)}`) return t;
  }
  return Date.UTC(y, m - 1, d, h - 1, mi);
}

export const offsetsOf = (row) => { const v = parseJ(row.remind_offsets_days, DEFAULT_OFFSETS); return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [...DEFAULT_OFFSETS]; };
const plain = (row) => ({ service: row.service, endsAt: row.ends_at, priceAfter: row.price_after, remindOffsetsDays: offsetsOf(row), snoozeUntil: row.snooze_until });

/** Varslene for en rad med tekst og tidspunkt. */
export function notificationsOf(row) {
  const t = plain(row), sent = new Set(parseJ(row.sent, []));
  return trialSchedule(t).map((s) => ({ key: s.key, kind: s.kind, date: s.date, time: s.time, at: new Date(osloMs(s.date, s.time)).toISOString(),
    title: trialTitle(t.service, daysBetween(s.date, t.endsAt)), body: trialBody(t, s.kind === 'final'), sent: sent.has(s.key),
    actions: [{ id: 'cancel', title: 'Avslutt nå' }, { id: 'keep', title: 'Behold' }, { id: 'snooze', title: 'Minn meg i morgen' }] }));
}

export function trialOut(row, today = osloTodayISO()) {
  const t = plain(row);
  const price = row.price_after;
  return { id: row.id, service: row.service, endsAt: row.ends_at, priceAfter: price, priceLabel: price != null ? `${Number.isInteger(price) ? price : String(price.toFixed(2)).replace('.', ',')} kr/mnd` : '',
    remindOffsetsDays: t.remindOffsetsDays, status: row.status, created: row.created, daysLeft: daysBetween(today, row.ends_at), badge: trialBadge(row.ends_at, today),
    cancelUrl: row.cancel_url || cancelUrlFor(row.service), snoozeUntil: row.snooze_until ?? null, subscriptionId: row.subscription_id ?? null,
    calendarEventId: `trial-${row.id}`, notifications: row.status === 'active' ? notificationsOf(row) : [] };
}

export const trialRow = (user, id) => q('SELECT * FROM trials WHERE id=? AND user_id=?').get(id, user);
export const activeTrials = (user) => q("SELECT * FROM trials WHERE user_id=? AND status='active' ORDER BY ends_at, id").all(user);
export const trialsFor = (user, all = false) => (all ? q('SELECT * FROM trials WHERE user_id=? ORDER BY status=\'active\' DESC, ends_at, id').all(user) : activeTrials(user)).map((r) => trialOut(r));

/** Validerer og lagrer en prøve. → {row} eller {error}. Brukes også av Glimt (intent trial.create). */
export function createTrial(user, b, { source = 'skjema', today = osloTodayISO() } = {}) {
  let v = b ?? {};
  if (typeof v.text === 'string' && !v.service && !v.endsAt) {
    const p = parseTrial(v.text, today);
    if (!p.ok) return { error: p.question, missing: p.missing, parsed: p };
    v = { ...p, ...v, service: p.service, endsAt: p.endsAt, priceAfter: v.priceAfter ?? p.priceAfter };
  }
  const service = String(v.service ?? '').trim().replace(/\s+/g, ' ');
  if (!service || service.length > 60) return { error: 'Skriv hvilken tjeneste prøven gjelder (1–60 tegn).' };
  const endsAt = String(v.endsAt ?? '');
  if (!validDate(endsAt)) return { error: 'Ugyldig sluttdato (YYYY-MM-DD).' };
  if (endsAt < today) return { error: 'Sluttdatoen er passert.' };
  if (endsAt > addDaysISO(today, 400)) return { error: 'Sluttdatoen er for langt frem i tid.' };
  let price = v.priceAfter ?? null;
  if (price !== null && price !== '') { price = Number(String(price).replace(',', '.')); if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: 'Ugyldig pris.' }; price = Math.round(price * 100) / 100; } else price = null;
  let offsets = v.remindOffsetsDays ?? DEFAULT_OFFSETS;
  if (!Array.isArray(offsets) || offsets.length > 4 || offsets.some((x) => !Number.isInteger(x) || x < 0 || x > 30)) return { error: 'Varsle meg: opptil 4 valg mellom 0 og 30 dager før.' };
  offsets = [...new Set(offsets)].sort((a, b) => a - b);
  if (q("SELECT count(*) FROM trials WHERE user_id=? AND status='active'").pluck().get(user) >= 100) return { error: 'For mange aktive prøver.' };
  const now = Date.now();
  // Varsler som allerede er passert når prøven legges inn, regnes som sendt (bortsett fra siste varsel samme dag).
  const sent = trialSchedule({ endsAt, remindOffsetsDays: offsets }).filter((s) => s.kind !== 'final' && osloMs(s.date, s.time) < now - 60_000).map((s) => s.key);
  const row = q('INSERT INTO trials(user_id, service, ends_at, price_after, remind_offsets_days, status, created, updated, sent, cancel_url, source) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(user, service, endsAt, price, JSON.stringify(offsets), 'active', now, now, JSON.stringify(sent), cancelUrlFor(service), source);
  return { row };
}

/** Heldagshendelser i Kalender (Privat) for aktive prøver mellom to datoer. Formen er rådata; calendar.js lager hendelsen. */
export function trialCalendarItems(user, fromDate, toDate) {
  return q("SELECT * FROM trials WHERE user_id=? AND status='active' AND ends_at>=? AND ends_at<=? ORDER BY ends_at").all(user, fromDate, toDate)
    .map((r) => ({ id: `trial-${r.id}`, trialId: r.id, title: `${r.service}-prøven slutter`, date: r.ends_at, note: r.price_after != null ? `Avslutt før i dag for å slippe ${r.price_after} kr/mnd.` : 'Gratis prøveperiode slutter.', url: r.cancel_url || cancelUrlFor(r.service) }));
}

/** Monteres fra finans/routes.js (før /subscriptions/:id). */
export function mountTrials(api, { R, W, toSubscription }) {
  api.get('/subscriptions/trials', R, (c) => c.json({ items: trialsFor(c.get('user'), c.req.query('all') === '1'), cancelLinks: CANCEL_LINKS, remindOptions: REMIND_OPTIONS, today: osloTodayISO() }));
  api.post('/subscriptions/trials/parse', R, async (c) => {
    const b = await c.req.json().catch(() => null);
    if (typeof b?.text !== 'string') return c.json({ error: 'Forventet {text}' }, 400);
    const today = typeof b.today === 'string' && validDate(b.today) ? b.today : osloTodayISO();
    const r = parseTrial(b.text, today);
    return c.json({ ...r, preview: r.ok ? trialPreview(r) : null });
  });
  api.post('/subscriptions/trials', W, async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {service, endsAt, priceAfter?, remindOffsetsDays?}' }, 400);
    const r = createTrial(c.get('user'), b);
    if (r.error) return c.json({ error: r.error, ...(r.missing ? { missing: r.missing } : {}) }, 400);
    return c.json(trialOut(r.row), 201);
  });
  api.patch('/subscriptions/trials/:id{[0-9]+}', W, async (c) => {
    const user = c.get('user'), row = trialRow(user, +c.req.param('id'));
    if (!row) return c.json({ error: 'Fant ikke prøven' }, 404);
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {status} eller {snooze}' }, 400);
    const now = Date.now();
    if (b.snooze !== undefined) {
      if (b.snooze !== 'tomorrow') return c.json({ error: "snooze må være 'tomorrow'" }, 400);
      if (row.status !== 'active') return c.json({ error: 'Prøven er ikke aktiv' }, 409);
      const tomorrow = addDaysISO(osloTodayISO(), 1);
      q('UPDATE trials SET snooze_until=?, updated=? WHERE id=?').run(tomorrow > row.ends_at ? row.ends_at : tomorrow, now, row.id);
    }
    const edit = {};
    if (b.service !== undefined || b.endsAt !== undefined || b.priceAfter !== undefined || b.remindOffsetsDays !== undefined) {
      const chk = createTrialCheck({ service: b.service ?? row.service, endsAt: b.endsAt ?? row.ends_at, priceAfter: b.priceAfter !== undefined ? b.priceAfter : row.price_after, remindOffsetsDays: b.remindOffsetsDays ?? offsetsOf(row) });
      if (chk.error) return c.json({ error: chk.error }, 400);
      Object.assign(edit, chk.value);
      q('UPDATE trials SET service=?, ends_at=?, price_after=?, remind_offsets_days=?, cancel_url=?, updated=? WHERE id=?')
        .run(edit.service, edit.endsAt, edit.priceAfter, JSON.stringify(edit.remindOffsetsDays), cancelUrlFor(edit.service), now, row.id);
      // Ny sluttdato eller nye tidspunkter: varsler som ikke er passert sendes på nytt.
      if (edit.endsAt !== row.ends_at || JSON.stringify(edit.remindOffsetsDays) !== row.remind_offsets_days) q("UPDATE trials SET sent='[]' WHERE id=?").run(row.id);
    }
    let subscription;
    if (b.status !== undefined) {
      if (!['active', 'cancelled', 'kept'].includes(b.status)) return c.json({ error: "status må være 'active', 'cancelled' eller 'kept'" }, 400);
      q('UPDATE trials SET status=?, updated=? WHERE id=?').run(b.status, now, row.id);
      if (b.status === 'kept' && !row.subscription_id && toSubscription) {
        const cur = trialRow(user, row.id);
        subscription = toSubscription(user, cur);
        if (subscription?.id) q('UPDATE trials SET subscription_id=? WHERE id=?').run(subscription.id, row.id);
      }
    }
    return c.json({ ...trialOut(trialRow(user, row.id)), ...(subscription ? { subscription } : {}) });
  });
}

function createTrialCheck(v) {
  const service = String(v.service ?? '').trim().replace(/\s+/g, ' ');
  if (!service || service.length > 60) return { error: 'Skriv hvilken tjeneste prøven gjelder (1–60 tegn).' };
  if (!validDate(String(v.endsAt ?? ''))) return { error: 'Ugyldig sluttdato (YYYY-MM-DD).' };
  let price = v.priceAfter;
  if (price === '' || price === undefined) price = null;
  if (price !== null) { price = Number(String(price).replace(',', '.')); if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: 'Ugyldig pris.' }; }
  const o = v.remindOffsetsDays;
  if (!Array.isArray(o) || o.length > 4 || o.some((x) => !Number.isInteger(x) || x < 0 || x > 30)) return { error: 'Varsle meg: opptil 4 valg mellom 0 og 30 dager før.' };
  return { value: { service, endsAt: v.endsAt, priceAfter: price, remindOffsetsDays: [...new Set(o)].sort((a, b) => a - b) } };
}
