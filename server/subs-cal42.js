// Prompt 42 (SERVER42): Abonnementer som egen, innebygd kalender – trekkdatoene fra Subscription OS (claude-code-abonnement-kalender.md).
// Virtuell kalender (ingen kopi i Google), bygget fra fh_subscriptions (+ prøveperioder) for den innloggede brukeren.
//
//   GET   /api/kalender/calendars (mellomvare) → calendars får {id:'abonnementer', key:'ab', name:'Abonnementer', color:'#3d7f8a', textColor:'#2a5c64', lightColor:'#8fcdd6',
//                                                source:'builtin', sourceLabel:'Finans', badge:'INNEBYGD', visible, hidMenu, notify, writable:false, removable:false, virtual:true}
//   PATCH /api/kalender/calendars/abonnementer {visible?, color?, hidMenu?, notify?:'off'|'day_before'|'trials_yearly', showInBrief?} → {calendar}
//   GET   /api/kalender/abonnementer/events?from=&to= · GET /api/calendars/events?cal=ab&start=&end= → {calendar, events:[…]}
//   GET   /api/kalender/abonnementer.ics → iCal-feed (innlogget / app-token)
//   Hendelsene kommer også med i alle vanlige hendelseslister (calendar.js eventsFor via addEventSource), med appCalendar:'abonnementer'.
//   Hendelse: {id:'ab-<subId>-YYYYMMDD', title:'Netflix · 149 kr', allDay:true, date, kind:'trekk'|'trial'|'renewal', badge:'TREKK'|'PRØVE'|'ÅRLIG', subId, amount, currency,
//              account, logo, interval:'Hver måned den 22.', deepLink:'finans://abonnement/<id>', openLabel:'Åpne i Finans ›', editable:false, note:'Endres i Finans → Abonnementer'}
import { Hono } from 'hono';
import { kv } from './db.js';
import { db as fhDb } from './finans/db.js';
import { authOrToken } from './mobile.js';
import { addEventSource, addEventDecorator } from './calendar.js';
import { broadcast } from './realtime.js';

const q = (sql) => fhDb.prepare(sql);
export const AB42 = { id: 'abonnementer', key: 'ab', name: 'Abonnementer', color: '#3d7f8a', textColor: '#2a5c64', lightColor: '#8fcdd6' };
const NOTIFY = { off: 'Av', day_before: 'Dagen før', trials_yearly: 'Prøveperioder og årlige' };
const NS = { av: 'off', 'dagen-for': 'day_before', 'prove-arlige': 'trials_yearly' };
const SN = { off: 'av', day_before: 'dagen-for', trials_yearly: 'prove-arlige' };
// Varsler følger Kalender-prefs notifySubscriptions ('av'|'dagen-for'|'prove-arlige'), lagret i kal33_cals.prefs (PUT /api/kalender/calendars/prefs).
const prefsOf = (u) => { const p = { visible: true, hidMenu: false, color: AB42.color, showInBrief: true, ...(kv.get(u, 'kal42_ab', {}) ?? {}) }; const k = kv.get(u, 'kal33_cals', null)?.prefs?.notifySubscriptions; p.notify = NS[k] ?? p.notify ?? 'trials_yearly'; return p; };
export function abCalendar42(u, count = null) {
  const p = prefsOf(u);
  return { ...AB42, color: p.color, source: 'builtin', origin: 'finans', sourceLabel: 'Finans', src: 'Finans', badge: 'INNEBYGD', visible: p.visible !== false, hidMenu: !!p.hidMenu, notify: p.notify, notifySubscriptions: SN[p.notify] ?? 'prove-arlige', notifyLabel: NOTIFY[p.notify] ?? 'Av',
    notifyOptions: Object.entries(NOTIFY).map(([id, label]) => ({ id, label })), showInBrief: p.showInBrief !== false, builtin: true, writable: false, removable: false, virtual: true, kind: 'finans', backend: 'finans',
    count: count ?? 0, shape39: true, note: 'Endres i Finans → Abonnementer' };
}

/* ---------------- Hendelsene ---------------- */

const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const D = (s) => new Date(`${s}T12:00:00Z`);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMonths = (s, n, day) => { const d = D(s); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day ?? +s.slice(8), last)); return iso(d); };
/** Første virkedag (lørdag/søndag → mandag). */
export const bankDay42 = (s) => { const w = D(s).getUTCDay(); return w === 6 ? addDays(s, 2) : w === 0 ? addDays(s, 1) : s; };
const krN = (v) => Math.round(v).toLocaleString('nb-NO').replace(/\s/g, ' ');
const CYC = { monthly: 1, quarterly: 3, yearly: 12, biennial: 24 };
/** Trekkdatoene i [from, to] for brukeren. */
export function abEvents42(u, from, to) {
  const out = [];
  let subs = [];
  try { subs = q('SELECT s.*, a.name AS acc FROM fh_subscriptions s LEFT JOIN fh_accounts a ON a.id=(SELECT account_id FROM fh_transactions WHERE id=s.tx_id) WHERE s.user_id=? AND s.active=1 AND s.next_date IS NOT NULL').all(u); } catch { return out; }
  const color = prefsOf(u).color;
  for (const s of subs) {
    const step = CYC[s.cycle] ?? 1, day = s.charge_day || +s.next_date.slice(8);
    const price = s.price / 100;
    const yearly = step >= 12;
    let d = s.next_date, n = 0;
    while (d < from && n++ < 400) d = addMonths(d, step, day);
    for (let i = 0; d <= to && i < 24; i++, d = addMonths(d, step, day)) {
      const real = bankDay42(d);
      if (real < from || real > to) continue;
      const title = yearly ? `${s.name} fornyes · ${krN(price)} kr` : `${s.name} · ${krN(price)} kr`;
      out.push({ id: `ab-${s.id}-${real.replace(/-/g, '')}`, title, short: title.length > 18 ? `${title.slice(0, 17)}…` : title, subject: null, room: '', teacher: '', note: 'Endres i Finans → Abonnementer',
        start: real, end: addDays(real, 1), allDay: true, date: real, time: null, inAllDayRow: true, type: 'abonnement', color, source: 'abonnementer', calendar: 'abonnementer', editable: false, reminder: yearly ? 'week' : 'none',
        kind: 'trekk', renewal: yearly, badge: yearly ? 'ÅRLIG' : 'TREKK', cancelled: false, cancelUrl: null, nextCharge: s.next_date, subId: s.id, amount: price, currency: 'NOK', account: s.acc ? `Trekkes fra ${s.acc}` : null, agreedDate: real !== d ? d : null,
        logo: s.logo_url || (s.domain ? `/finans/api/logo/${s.domain}` : null), domain: s.domain ?? null, interval: step === 1 ? 'monthly' : step === 12 ? 'yearly' : step === 24 ? 'biennial' : 'quarterly', intervalText: step === 1 ? `Hver måned den ${day}.` : step === 12 ? 'Hvert år' : step === 24 ? 'Annethvert år' : `Hver ${step}. måned`,
        nextDate: s.next_date, deepLink: `finans://abonnement/${s.id}`, url: `/finans/#/abonnement/${s.id}`, openLabel: 'Åpne i Finans ›', origin: 'Finans · Abonnementer', appCalendar: 'abonnementer', appColor: color });
    }
  }
  let trials = [];
  try { trials = q("SELECT * FROM trials WHERE user_id=? AND status='active' AND ends_at>=? AND ends_at<=?").all(u, from, to); } catch { /* tabellen finnes ikke */ }
  for (const t of trials) {
    const price = t.price_after ?? 0;
    const title = `${t.service}: prøveperioden slutter${price ? ` · ${krN(price)} kr fra i morgen` : ''}`;
    out.push({ id: `ab-trial-${t.id}-${String(t.ends_at).replace(/-/g, '')}`, title, short: title.slice(0, 17) + '…', subject: null, room: '', teacher: '', note: 'Endres i Finans → Abonnementer',
      start: t.ends_at, end: addDays(t.ends_at, 1), allDay: true, date: t.ends_at, time: null, inAllDayRow: true, type: 'abonnement', color, source: 'abonnementer', calendar: 'abonnementer', editable: false, reminder: 'day',
      kind: 'trial', badge: 'PRØVE', trialId: t.id, amount: price, currency: 'NOK', deepLink: 'finans://abonnement', url: '/finans/#/abonnement', openLabel: 'Åpne i Finans ›', origin: 'Finans · Abonnementer', appCalendar: 'abonnementer', appColor: color });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'nb'));
}
/** «3 trekk · 627 kr» per dag (måned-chips). */
export function abDaySummary42(events) {
  const by = new Map();
  for (const e of events) { const x = by.get(e.date) ?? { date: e.date, count: 0, sum: 0 }; x.count++; x.sum += e.amount ?? 0; by.set(e.date, x); }
  return [...by.values()].map((x) => ({ ...x, text: x.count > 1 ? `${x.count} trekk · ${krN(x.sum)} kr` : null }));
}
// Med i alle hendelseslister (Kalender-appen, web, widgets, brief) når kalenderen er synlig.
addEventSource(async (u, fromDate, toDate) => (prefsOf(u).visible === false ? null : { id: 'abonnementer', name: 'Abonnementer', events: abEvents42(u, fromDate, toDate) }));
addEventDecorator((u, events) => { const col = prefsOf(u).color; for (const e of events) if (e.source === 'abonnementer') { e.appCalendar = 'abonnementer'; e.appColor = col; } });

/* ---------------- Ruter ---------------- */

const bad = (c, error, status = 400) => c.json({ error }, status);
/** Mellomvare foran /api/kalender/calendars: legger Abonnementer i lista og håndterer PATCH av den. */
export async function abCalendarsMw42(c, next) {
  const path = c.req.path.replace(/\/+$/, '');
  if (c.req.method === 'PATCH' && /\/calendars\/abonnementer$/.test(path)) {
    return authOrToken(c, async () => {
      const u = c.get('user'), b = await c.req.json().catch(() => null);
      if (!b || typeof b !== 'object') { c.res = bad(c, 'Forventet et objekt'); return; }
      const p = kv.get(u, 'kal42_ab', {}) ?? {};
      if (b.visible !== undefined) { if (typeof b.visible !== 'boolean') { c.res = bad(c, 'visible må være true eller false'); return; } p.visible = b.visible; }
      if (b.hidMenu !== undefined) p.hidMenu = !!b.hidMenu;
      if (b.showInBrief !== undefined) p.showInBrief = !!b.showInBrief;
      if (b.color !== undefined) { if (!/^#[0-9a-f]{6}$/i.test(String(b.color))) { c.res = bad(c, 'Farge må være #rrggbb'); return; } p.color = b.color.toLowerCase(); }
      const nv = b.notifySubscriptions !== undefined ? NS[b.notifySubscriptions] : b.notify;
      if (nv !== undefined || b.notifySubscriptions !== undefined) {
        if (!NOTIFY[nv]) { c.res = bad(c, 'notifySubscriptions må være av, dagen-for eller prove-arlige'); return; }
        p.notify = nv;
        const st = kv.get(u, 'kal33_cals', null) ?? {}; kv.set(u, 'kal33_cals', { ...st, prefs: { ...(st.prefs ?? {}), notifySubscriptions: SN[nv] } });
      }
      if (b.name !== undefined && String(b.name).trim() !== AB42.name) { c.res = bad(c, 'Abonnementer-kalenderen kan ikke gis nytt navn', 403); return; }
      kv.set(u, 'kal42_ab', p);
      try { broadcast('kalender', { action: 'calendars' }, [u]); } catch { /* */ }
      c.res = c.json({ calendar: abCalendar42(u) });
    });
  }
  if (c.req.method === 'DELETE' && /\/calendars\/abonnementer$/.test(path)) return c.json({ error: 'De innebygde kalenderne kan ikke slettes. Skjul den i stedet.' }, 403);
  await next();
  if (c.req.method !== 'GET' || !/\/calendars$/.test(path) || c.res?.status !== 200) return;
  try {
    const j = await c.res.clone().json();
    if (!Array.isArray(j.calendars) || j.calendars.some((x) => x.id === AB42.id)) return;
    const u = c.get('user');
    if (!u) return;
    const t = new Date().toISOString().slice(0, 10);
    const n = abEvents42(u, t, addDays(t, 29)).length;
    c.res = c.json({ ...j, calendars: [...j.calendars, abCalendar42(u, n)] }, 200, { 'Cache-Control': 'no-store' });
  } catch { /* lista står */ }
}
export const abApi42 = new Hono();
abApi42.use('*', authOrToken);
const range = (c) => {
  const t = new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('from') ?? c.req.query('start') ?? '') ? (c.req.query('from') ?? c.req.query('start')) : t;
  let to = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('to') ?? c.req.query('end') ?? '') ? (c.req.query('to') ?? c.req.query('end')) : addMonths(t, 12);
  if (to < from) to = from;
  return { from, to: to > addDays(from, 800) ? addDays(from, 800) : to };
};
abApi42.get('/events', (c) => { const u = c.get('user'), { from, to } = range(c); const events = abEvents42(u, from, to); return c.json({ calendar: abCalendar42(u, events.length), events, days: abDaySummary42(events), from, to }); });
const icsEsc = (s) => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
export function abIcs42(c) {
  const u = c.get('user'), { from, to } = range(c);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homelab//Abonnementer//NO', 'X-WR-CALNAME:Abonnementer', 'CALSCALE:GREGORIAN'];
  for (const e of abEvents42(u, from, to)) lines.push('BEGIN:VEVENT', `UID:${e.id}@homelab`, `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${e.end.replace(/-/g, '')}`, `SUMMARY:${icsEsc(e.title)}`, `DESCRIPTION:${icsEsc(e.note)}`, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return c.body(lines.join('\r\n'), 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="abonnementer.ics"' });
}
/** GET /api/calendars/events?cal=ab&start&end (navnet i specen). */
export const calendarsEvents42 = new Hono();
calendarsEvents42.use('*', authOrToken);
calendarsEvents42.get('/events', (c) => {
  const cal = c.req.query('cal');
  if (cal && !['ab', 'abonnementer'].includes(cal)) return bad(c, 'Bare cal=ab (Abonnementer) finnes her. Bruk /api/kalender/events for de andre.', 404);
  const u = c.get('user'), { from, to } = range(c); const events = abEvents42(u, from, to);
  return c.json({ calendar: abCalendar42(u, events.length), events, from, to });
});
