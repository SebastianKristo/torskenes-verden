// Prompt 70 (GLIMTCAL70, claude-code-glimt-kalender-ikke-spor.md): Glimt legger avtalen rett i standardkalenderen og bekrefter med
// kort A. Denne modulen lager kortdataene (card70) og endepunktene kortet bruker:
//   PATCH /api/glimt/agent/calendar70/:id {calendarId}  → flytter avtalen til en annen kalender med en gang (B: pillen i kortet)
//   POST  /api/glimt/agent/calendar70/:id/undo           → Angre (kortet viser knappen i 10 s; serveren godtar 60 s)
//   GET   /api/glimt/agent/calendar70/:id                → kortet på nytt (etter omlasting)
// Kortet (result.card70 på calendar.create, og created.card70 i /api/assist):
//   {v:1, eventId, title, date, start, end, allDay, place, address, with:[…], withText, day:{mon,n,wd}, line, timeText,
//    calendar:{id,name,color,source}, calendars:[{id,name,color,source,suggested,default,selected}], reminder:{key,label},
//    undo:{method,url,ttlMs,expiresAt}, move:{method,url,field:'calendarId'}, open:{web, deepLink, kalender}}
// Alt er per bruker (runAsUser + user i alle kall). Ingen nøkler eller tokens i kortet.
import { kv } from '../db.js';
import { runAsUser } from '../settings.js';
import { broadcast } from '../realtime.js';

const MADE = 'glimt70_made';
export const UNDO_UI_MS70 = 10_000;
const UNDO_SERVER_MS70 = 60_000;
const KEEP_MS70 = 7 * 24 * 3600_000;
const MON70 = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DES'];
const WD70 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const REM70 = { none: 'Uten varsel', '15m': 'Varsel 15 min før', '1h': 'Varsel 1 t før', day: 'Varsel dagen før' };
const base70 = (id) => String(id ?? '').split('~')[0];
const enc = encodeURIComponent;

/* ---------------- Hva Glimt har laget (for flytting og angre) ---------------- */

function madeAll(user) { const m = kv.get(user, MADE, null); return m && typeof m === 'object' ? m : {}; }
function saveMade(user, m) {
  const now = Date.now();
  for (const [k, v] of Object.entries(m)) if (!v || now - (v.at ?? 0) > KEEP_MS70) delete m[k];
  const keys = Object.keys(m);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete m[k];
  try { kv.set(user, MADE, m); } catch { /* best effort */ }
}
export const made70 = (user, id) => madeAll(user)[base70(id)] ?? null;
/** Husk avtalen Glimt nettopp la inn (felt for å lage den på nytt i en annen kalender). */
export function rememberMade70(user, eventId, a, extra = {}) {
  if (!eventId) return;
  const m = madeAll(user);
  m[base70(eventId)] = { at: Date.now(), id: String(eventId), calendarId: a.calendarId, source: a.calendarSource ?? 'app', calId: a.calId ?? null, backend: a.backend ?? 'privat',
    ev: { title: a.title, date: a.date, start: a.start ?? null, end: a.end ?? null, allDay: !!a.allDay, location: a.location ?? null, reminder: a.reminder ?? null, note: a.note ?? null },
    with: Array.isArray(a.with) ? a.with.slice(0, 4) : [], suggest: a.suggestCalendar ?? null, address: a.place?.address ?? null, poster: a.movie?.poster ?? null, ...extra };
  saveMade(user, m);
}

/* ---------------- Kortet ---------------- */

const sourceLabel70 = (c) => (c.source === 'google' ? 'Google' : c.google ? 'Google' : c.backend === 'local' ? 'Innebygd' : 'Innebygd');
async function calendarsOf70(user, selectedId, suggest) {
  const C46 = await import('./calendar46.js');
  const k = await import('../kalender33.js');
  const cals = await C46.writableCalendars46(user);
  const colors = new Map(k.appCalendarsOf(user).map((c) => [c.id, c.color ?? null]));
  const list = cals.calendars.filter((c) => c.id !== 'bursdager').map((c) => ({ id: c.id, name: C46.calendarLabel46(c), color: colors.get(c.id) ?? (c.id === 'familie' ? '#a8661a' : '#7a7468'), source: sourceLabel70(c),
    default: c.id === cals.defaultId, selected: c.id === selectedId, suggested: !!suggest && c.id === suggest && c.id !== cals.defaultId }));
  // Foreslått (Familie når brukeren nevnte pappa …) øverst, så standard, så resten i appens rekkefølge.
  list.sort((a, b) => (b.suggested - a.suggested) || (b.default - a.default));
  return list.slice(0, 8);
}
function withText70(w) {
  const a = (w ?? []).filter(Boolean);
  if (!a.length) return null;
  return `Med ${a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}`}`;
}
/** Kortdata for en avtale Glimt har lagt inn. a = validerte argumenter (eller lagret post), ev = hendelsen fra lagringen. */
export async function card70(user, a, ev) {
  const id = ev?.id ?? a.eventId ?? null;
  if (!id) return null;
  const date = a.date ?? ev?.date;
  const x = new Date(`${date}T12:00:00Z`);
  const timeText = a.allDay ? 'Hele dagen' : `${a.start}${a.end ? `–${a.end}` : ''}`;
  const placeName = a.location ?? ev?.room ?? null;
  const calendars = await calendarsOf70(user, a.calendarId, a.suggestCalendar ?? a.suggest ?? null);
  const cur = calendars.find((c) => c.id === a.calendarId) ?? { id: a.calendarId, name: a.calendarName ?? a.calendarId, color: '#b23a2a', source: 'Innebygd' };
  const rem = a.reminder ?? (a.allDay ? 'none' : '1h');
  const at = a.madeAt ?? Date.now();
  return {
    v: 1, eventId: String(id), title: a.title, date, start: a.start ?? null, end: a.end ?? null, allDay: !!a.allDay,
    place: placeName, address: a.place?.address ?? a.address ?? ev?.address ?? null, with: a.with ?? [], withText: withText70(a.with),
    day: { mon: MON70[x.getUTCMonth()], n: x.getUTCDate(), wd: WD70[x.getUTCDay()] }, timeText, line: [timeText, placeName].filter(Boolean).join(' · '),
    calendar: { id: cur.id, name: cur.name, color: cur.color, source: cur.source }, calendars,
    reminder: { key: rem, label: REM70[rem] ?? 'Varsel 1 t før' },
    undo: { method: 'POST', url: `/api/glimt/agent/calendar70/${enc(id)}/undo`, ttlMs: UNDO_UI_MS70, expiresAt: new Date(at + UNDO_UI_MS70).toISOString() },
    move: { method: 'PATCH', url: `/api/glimt/agent/calendar70/${enc(id)}`, field: 'calendarId' },
    open: { web: `#/kalender/dag/${date}`, deepLink: `finanshub://kalender?date=${date}&id=${enc(id)}`, kalender: `kalender://hendelse?id=${enc(id)}&date=${date}` },
    ...(a.durationAssumed ? { durationAssumed: true } : {}),
  };
}

/* ---------------- Flytte og angre ---------------- */

async function deleteMade(user, rec) {
  if (rec.source === 'google' && rec.calId) { const { googleEventWrite } = await import('../birthdays.js'); await googleEventWrite(user, 'DELETE', rec.calId, rec.id); return; }
  const { deleteEvent } = await import('../calendar.js');
  await runAsUser(user, () => deleteEvent(user, rec.id));
  try { const k = await import('../kalender33.js'); k.kal46.setCalendar(user, rec.id, null); } catch { /* */ }
}
async function createIn(user, rec, cal) {
  const { eventInput, createEvent, googleBody } = await import('../calendar.js');
  const e = rec.ev;
  const v = eventInput({ title: e.title, allDay: e.allDay, date: e.date, start: e.start, end: e.end, location: e.location ?? '', calendar: cal.backend === 'familie' ? 'familie' : 'privat', repeat: 'none', reminder: e.reminder ?? (e.allDay ? 'none' : '1h'), note: e.note ?? '' });
  if (v.error) throw Object.assign(new Error(v.error), { status: 400 });
  if (cal.source === 'google' && cal.calId) {
    const { googleEventWrite } = await import('../birthdays.js');
    const g = await googleEventWrite(user, 'POST', cal.calId, null, googleBody({ ...v.value, origin: 'Glimt' }));
    return { id: g?.id ?? null, calId: cal.calId };
  }
  const ev = await runAsUser(user, () => createEvent(user, { ...v.value, origin: 'Glimt' }));
  return { id: ev?.id ?? null, calId: null };
}
/**
 * Flytt en avtale Glimt la inn til en annen skrivbar kalender. Samme lagring (Privat ↔ app-kalendere): bare appens kalender byttes.
 * Annen lagring (Familie, en Google-kalender): lages i målet og slettes i den gamle. → {card70} | {error, status}
 */
export async function move70(user, id, calendarId) {
  const rec = made70(user, id);
  if (!rec) return { error: 'Fant ikke avtalen Glimt la inn. Flytt den i Kalender.', status: 404 };
  const C46 = await import('./calendar46.js');
  const cals = await C46.writableCalendars46(user);
  const cal = cals.calendars.find((c) => c.id === calendarId);
  if (!cal) {
    const ro = cals.readOnly.find((c) => c.id === calendarId);
    return { error: ro ? `${ro.name} er skrivebeskyttet.` : 'Ukjent kalender', status: 400, ...(ro ? { readOnly: true } : {}) };
  }
  const k = await import('../kalender33.js');
  let newId = rec.id, calId = null;
  const sameStore = rec.source !== 'google' && cal.source !== 'google' && (cal.backend ?? 'privat') === (rec.backend ?? 'privat');
  if (cal.id === rec.calendarId) { /* allerede der */ }
  else if (sameStore) {
    if (cal.id === 'familie') k.kal46.setCalendar(user, rec.id, null); else k.kal46.setCalendar(user, rec.id, cal.id);
  } else {
    const made = await createIn(user, rec, cal);
    if (!made.id) return { error: 'Fikk ikke flyttet avtalen', status: 502 };
    newId = made.id; calId = made.calId;
    try { if (cal.source !== 'google' && cal.id !== 'familie') k.kal46.setCalendar(user, newId, cal.id); } catch { /* */ }
    await deleteMade(user, rec).catch(() => null);
    if (rec.poster) { try { C46.rememberPoster46(user, newId, rec.poster); } catch { /* */ } }
  }
  const m = madeAll(user);
  delete m[base70(rec.id)];
  const next = { ...rec, id: String(newId), calendarId: cal.id, source: cal.source, calId, backend: cal.backend ?? 'privat' };
  m[base70(newId)] = next;
  saveMade(user, m);
  try { const { clearCalendarCache } = await import('../calendar.js'); clearCalendarCache(user); } catch { /* */ }
  broadcast('kalender', { action: 'updated', id: String(newId) }, [user]);
  return { ok: true, moved: cal.id !== rec.calendarId, card70: await card70(user, { ...rec.ev, ...next, eventId: newId, calendarId: cal.id, calendarName: C46.calendarLabel46(cal), madeAt: rec.at }, { id: newId }) };
}
/** Angre: sletter avtalen Glimt nettopp la inn. Bare innen 60 s (kortet viser knappen i 10 s). */
export async function undo70(user, id) {
  const rec = made70(user, id);
  if (!rec) return { error: 'Fant ikke avtalen (allerede angret?)', status: 404 };
  if (Date.now() - (rec.at ?? 0) > UNDO_SERVER_MS70) return { error: 'For sent å angre. Slett avtalen i Kalender.', status: 409 };
  try { await deleteMade(user, rec); } catch (e) { return { error: String(e?.message ?? e).slice(0, 200), status: e?.status ?? 502 }; }
  const m = madeAll(user); delete m[base70(rec.id)]; saveMade(user, m);
  try { const { clearCalendarCache } = await import('../calendar.js'); clearCalendarCache(user); } catch { /* */ }
  broadcast('kalender', { action: 'deleted', id: rec.id }, [user]);
  return { ok: true, undone: true, eventId: rec.id, text: `Angret · «${rec.ev.title}» er fjernet.` };
}

/* ---------------- Ruter ---------------- */

const ID70 = /^[A-Za-z0-9_@.~:-]{1,200}$/;
export function installCal70(api) {
  api.get('/calendar70/:id', async (c) => {
    const u = c.get('user'), id = c.req.param('id');
    if (!ID70.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
    const rec = made70(u, id);
    if (!rec) return c.json({ error: 'Fant ikke avtalen' }, 404);
    const C46 = await import('./calendar46.js');
    const cals = await C46.writableCalendars46(u);
    const cal = cals.calendars.find((x) => x.id === rec.calendarId);
    return c.json({ card70: await card70(u, { ...rec.ev, ...rec, eventId: rec.id, calendarName: cal ? C46.calendarLabel46(cal) : rec.calendarId, madeAt: rec.at }, { id: rec.id }) }, 200, { 'Cache-Control': 'no-store' });
  });
  api.patch('/calendar70/:id', async (c) => {
    const u = c.get('user'), id = c.req.param('id');
    if (!ID70.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
    const b = await c.req.json().catch(() => null);
    const calId = typeof b?.calendarId === 'string' ? b.calendarId.slice(0, 120) : '';
    if (!calId) return c.json({ error: 'Forventet {calendarId}' }, 400);
    try {
      const r = await runAsUser(u, () => move70(u, id, calId));
      return r.error ? c.json({ error: r.error, ...(r.readOnly ? { readOnly: true } : {}) }, r.status ?? 400) : c.json(r);
    } catch (e) { return c.json({ error: String(e?.message ?? e).slice(0, 200) }, e?.status ?? 502); }
  });
  api.post('/calendar70/:id/undo', async (c) => {
    const u = c.get('user'), id = c.req.param('id');
    if (!ID70.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
    const r = await runAsUser(u, () => undo70(u, id));
    return r.error ? c.json({ error: r.error }, r.status ?? 400) : c.json(r);
  });
}
