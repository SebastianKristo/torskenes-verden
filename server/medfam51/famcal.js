// Prompt 51 (MEDFAM51): felles familiekalender med «hvem kjører?».
// Hendelser er felles for alle i familien (alle brukere på serveren). En hendelse kan ha kjøreoppgaver (henting/bringing) som
// tildeles et familiemedlem; den som får oppgaven varsles, uten sjåfør varsles alle når det nærmer seg, og sjåføren får en
// påminnelse før avreise. Ruter-forslaget kommer fra ruter41.js (Entur) mellom hjemmet i Familie › Steder og stedet på hendelsen.
// Hendelsene vises også i Kalender (egen kilde «Familiekalender»). API-formene står i SERVER51-API.md (seksjon MEDFAM51).
import { db, kv } from '../db.js';
import { isAdmin } from '../auth.js';
import { notifyUser } from '../notify.js';
import { family50 as F } from '../family.js';
import { tripBetween51 } from '../ruter41.js';
import { addEventSource } from '../calendar.js';
import { MIN, HOUR, DAY, clean, num, iso, hm, ymd, dayText, parseTime, osloAt } from './common.js';

db.exec(`CREATE TABLE IF NOT EXISTS famcal51_event (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, all_day INTEGER NOT NULL DEFAULT 0,
  place_name TEXT, lat REAL, lon REAL, note TEXT, color TEXT, created_by TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS famcal51_event_start ON famcal51_event(start);
CREATE TABLE IF NOT EXISTS famcal51_task (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, for_user TEXT,
  from_name TEXT, from_lat REAL, from_lon REAL, to_name TEXT, to_lat REAL, to_lon REAL, assignee TEXT, status TEXT NOT NULL DEFAULT 'open', note TEXT,
  created_by TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, assigned_at INTEGER, done_at INTEGER, reminded_at INTEGER, nag_at INTEGER);
CREATE INDEX IF NOT EXISTS famcal51_task_event ON famcal51_task(event_id);
CREATE INDEX IF NOT EXISTS famcal51_task_at ON famcal51_task(at);`);

const q = (sql) => db.prepare(sql);
export const KINDS51 = { henting: 'Henting', bringing: 'Bringing' };
const COLOR = /^#[0-9a-f]{6}$/i;
export const FAMCAL51_COLOR = '#7a3b6b';
const REMIND_BEFORE = 45 * MIN; // påminnelse til sjåføren
const NAG_BEFORE = 24 * HOUR; // ingen sjåfør ennå: alle varsles én gang innen et døgn før

/* ---------------- Personer ---------------- */

const everyone = (v) => F.everyone(v);
function personOf(v, id) {
  if (!id) return null;
  const e = everyone(v).find((p) => p.id === id);
  const name = e?.name ?? F.nameOf(id);
  return { userId: id, name, initials: F.initials(name), color: e?.color ?? F.colorOf(id), photoUrl: e?.photoUrl ?? null, self: id === v };
}
const isFamily = (v, id) => everyone(v).some((p) => p.id === id);
const who = (v, id) => (id === v ? 'Du' : personOf(v, id)?.name ?? 'Noen');
export const members51 = (v) => everyone(v).map((p) => personOf(v, p.id));

/** Hjemmet: stedet med type hjem i Familie › Steder (eget eller delt). */
export function homeOf51(v) {
  const z = F.zonesFor(v).find((x) => x.place_type === 'hjem');
  return z ? { name: z.name, lat: z.lat, lon: z.lon } : null;
}

/* ---------------- Ut ---------------- */

const placeOut = (name, lat, lon) => (name || lat != null ? { name: name ?? null, lat: lat ?? null, lon: lon ?? null } : null);
export function taskOut51(t, v, ev = null, now = Date.now()) {
  const e = ev ?? q('SELECT * FROM famcal51_event WHERE id=?').get(t.event_id);
  const forP = personOf(v, t.for_user);
  const label = KINDS51[t.kind] ?? t.kind;
  const status = t.status === 'done' ? 'done' : t.assignee ? 'assigned' : 'open';
  const title = `${label}${forP ? ` av ${forP.self ? 'deg' : forP.name}` : ''}${e ? ` · ${e.title}` : ''}`;
  return {
    id: t.id, eventId: t.event_id, kind: t.kind, kindLabel: label, title, at: iso(t.at), atText: `${dayText(t.at, now)} ${hm(t.at)}`, time: hm(t.at),
    for: forP, from: placeOut(t.from_name, t.from_lat, t.from_lon), to: placeOut(t.to_name, t.to_lat, t.to_lon), note: t.note ?? '',
    assignee: personOf(v, t.assignee), status, statusText: status === 'done' ? 'Gjort' : status === 'assigned' ? `${who(v, t.assignee)} kjører` : 'Ingen kjører ennå',
    mine: t.assignee === v, canEdit: true, overdue: status !== 'done' && t.at < now,
  };
}
function eventOut(e, v, now = Date.now()) {
  const tasks = q('SELECT * FROM famcal51_task WHERE event_id=? ORDER BY at, id').all(e.id).map((t) => taskOut51(t, v, e, now));
  const open = tasks.filter((t) => t.status === 'open').length;
  return {
    id: e.id, title: e.title, start: e.all_day ? ymd(e.start) : iso(e.start), end: e.all_day ? ymd(e.end) : iso(e.end), allDay: !!e.all_day, date: ymd(e.start),
    time: e.all_day ? null : `${hm(e.start)}–${hm(e.end)}`, place: placeOut(e.place_name, e.lat, e.lon), note: e.note ?? '', color: e.color ?? FAMCAL51_COLOR,
    createdBy: personOf(v, e.created_by), canEdit: e.created_by === v || isAdmin(v), tasks, needsDriver: open, needsDriverText: open ? `${open} ${open === 1 ? 'oppgave' : 'oppgaver'} uten sjåfør` : null,
  };
}

/* ---------------- Inn ---------------- */

function placeIn(p, partial) {
  if (p === undefined) return partial ? undefined : null;
  if (p === null) return null;
  if (typeof p === 'string') return { name: clean(p, 120) || null, lat: null, lon: null };
  if (typeof p !== 'object') return 'Ugyldig sted';
  const lat = p.lat == null ? null : num(p.lat, -90, 90), lon = p.lon == null ? null : num(p.lon, -180, 180);
  if ((p.lat != null && lat == null) || (p.lon != null && lon == null) || (lat == null) !== (lon == null)) return 'Ugyldige koordinater';
  return { name: clean(p.name, 120) || null, lat, lon };
}
function eventIn(b, cur = null) {
  const o = {};
  if (b.title !== undefined || !cur) { const t = clean(b.title, 120); if (!t) return 'Gi hendelsen en tittel'; o.title = t; }
  const allDay = b.allDay !== undefined ? !!b.allDay : cur ? !!cur.all_day : false;
  o.all_day = allDay ? 1 : 0;
  if (b.start !== undefined || !cur) {
    const s = parseTime(b.start ?? b.date);
    if (s == null) return 'Ugyldig start (bruk ISO-tid eller YYYY-MM-DDTHH:MM)';
    o.start = allDay ? osloAt(ymd(s)) : s;
  }
  if (b.end !== undefined || !cur || b.start !== undefined) {
    const s = o.start ?? cur.start;
    let e = b.end !== undefined ? parseTime(b.end) : cur && b.start === undefined ? cur.end : null;
    if (e == null) e = allDay ? s + DAY : s + HOUR;
    if (allDay && e <= s) e = s + DAY;
    if (e < s) return 'Slutt kan ikke være før start';
    if (e - s > 31 * DAY) return 'En hendelse kan vare maks 31 dager';
    o.end = e;
  }
  if (b.place !== undefined) { const p = placeIn(b.place, true); if (typeof p === 'string') return p; o.place_name = p?.name ?? null; o.lat = p?.lat ?? null; o.lon = p?.lon ?? null; }
  if (b.note !== undefined) o.note = clean(b.note, 1000) || null;
  if (b.color !== undefined) { if (b.color !== null && !COLOR.test(String(b.color))) return 'Ugyldig farge (bruk #rrggbb)'; o.color = b.color ? String(b.color).toLowerCase() : null; }
  return o;
}
function taskIn(b, v, ev, cur = null) {
  const o = {};
  if (b.kind !== undefined || !cur) { if (!KINDS51[b.kind]) return 'kind må være henting eller bringing'; o.kind = b.kind; }
  const kind = o.kind ?? cur?.kind;
  if (b.at !== undefined) { const t = parseTime(b.at); if (t == null) return 'Ugyldig tidspunkt'; o.at = t; }
  else if (!cur) o.at = kind === 'bringing' ? ev.start : ev.end; // bringing: framme til start · henting: når hendelsen er ferdig
  if (b.for !== undefined || b.forUser !== undefined) { const f = b.for ?? b.forUser; if (f !== null && f !== '' && !isFamily(v, f)) return 'Ukjent familiemedlem i «for»'; o.for_user = f || null; }
  if (b.assignee !== undefined) { if (b.assignee !== null && b.assignee !== '' && !isFamily(v, b.assignee)) return 'Ukjent familiemedlem'; o.assignee = b.assignee || null; }
  for (const k of ['from', 'to']) {
    if (b[k] === undefined) continue;
    const p = placeIn(b[k], true); if (typeof p === 'string') return p;
    o[`${k}_name`] = p?.name ?? null; o[`${k}_lat`] = p?.lat ?? null; o[`${k}_lon`] = p?.lon ?? null;
  }
  if (b.note !== undefined) o.note = clean(b.note, 500) || null;
  if (b.status !== undefined) { if (!['open', 'done'].includes(b.status)) return 'status må være open eller done'; o.status = b.status; }
  return o;
}
const setSql = (o) => Object.keys(o).map((k) => `${k}=@${k}`).join(', ');

/* ---------------- Varsler ---------------- */

async function notifyAssigned(t, actor) {
  if (!t.assignee || t.assignee === actor) return;
  const ev = q('SELECT * FROM famcal51_event WHERE id=?').get(t.event_id);
  const o = taskOut51(t, t.assignee, ev);
  await notifyUser(t.assignee, { title: `Du kjører: ${o.kindLabel.toLowerCase()} ${o.atText}`, body: `${who(t.assignee, actor)} satte deg på «${ev?.title ?? 'familiekalenderen'}»${o.for && !o.for.self ? ` (${o.for.name})` : ''}.`,
    url: '/#/familiekalender', tag: `famcal51-task-${t.id}`, category: 'familie', data: { kind: 'famcal51', taskId: t.id, eventId: t.event_id } }).catch(() => {});
}

/** Påminnelser: sjåføren før avreise, og alle én gang når en oppgave i løpet av et døgn mangler sjåfør. */
export async function sweepFamcal51(now = Date.now()) {
  let sent = 0;
  for (const t of q("SELECT * FROM famcal51_task WHERE status!='done' AND assignee IS NOT NULL AND reminded_at IS NULL AND at>? AND at<=?").all(now - 10 * MIN, now + REMIND_BEFORE)) {
    q('UPDATE famcal51_task SET reminded_at=? WHERE id=?').run(now, t.id);
    const o = taskOut51(t, t.assignee, null, now);
    const ruter = await ruterFor51(t, t.assignee, now).catch(() => null);
    const tip = ruter?.options?.[0] ? ` Kollektivt: ${ruter.options[0].strip} (${ruter.options[0].depLabel}).` : '';
    await notifyUser(t.assignee, { title: `Snart ${o.kindLabel.toLowerCase()} kl. ${o.time}`, body: `${o.title}.${tip}`, url: '/#/familiekalender', tag: `famcal51-remind-${t.id}`, category: 'familie', data: { kind: 'famcal51', taskId: t.id } }).catch(() => {});
    sent++;
  }
  for (const t of q("SELECT * FROM famcal51_task WHERE status!='done' AND assignee IS NULL AND nag_at IS NULL AND at>? AND at<=?").all(now, now + NAG_BEFORE)) {
    q('UPDATE famcal51_task SET nag_at=? WHERE id=?').run(now, t.id);
    for (const p of everyone(t.created_by).filter((x) => !x.mock)) {
      const o = taskOut51(t, p.id, null, now);
      await notifyUser(p.id, { title: 'Hvem kjører?', body: `${o.title} ${o.atText} har ingen sjåfør ennå.`, url: '/#/familiekalender', tag: `famcal51-nag-${t.id}`, category: 'familie', data: { kind: 'famcal51', taskId: t.id } }).catch(() => {});
      sent++;
    }
  }
  return sent;
}

/* ---------------- Ruter ---------------- */

export async function ruterFor51(t, v, now = Date.now()) {
  const ev = q('SELECT * FROM famcal51_event WHERE id=?').get(t.event_id);
  const home = homeOf51(v);
  const evPlace = ev?.lat != null ? { name: ev.place_name ?? ev.title, lat: ev.lat, lon: ev.lon } : null;
  const own = (k) => (t[`${k}_lat`] != null ? { name: t[`${k}_name`] ?? (k === 'from' ? 'Fra' : 'Til'), lat: t[`${k}_lat`], lon: t[`${k}_lon`] } : null);
  // Bringing: hjem → stedet, framme til tiden. Henting: hjem → stedet, avreise så sjåføren er der til tiden.
  const from = own('from') ?? home, to = own('to') ?? evPlace;
  const r = await tripBetween51(from, to, { at: t.at, arriveBy: true });
  const best = r.options?.[0] ?? null;
  return { taskId: t.id, from, to, arriveBy: iso(t.at), source: r.source, options: r.options ?? [], ...(r.error ? { error: r.error } : {}),
    text: best ? `Gå hjemmefra ${best.depLabel}: ${best.strip} (${best.minutes} min)` : r.error ?? 'Fant ingen reiseforslag', leaveAt: best?.dep ?? null };
}

/* ---------------- Operasjoner (brukes av API-et) ---------------- */

export function listEvents51(v, from, to, now = Date.now()) {
  const a = osloAt(from), b = osloAt(to) + DAY;
  return q('SELECT * FROM famcal51_event WHERE start < ? AND end > ? ORDER BY start, id').all(b, a).map((e) => eventOut(e, v, now));
}
export const getEvent51 = (id) => q('SELECT * FROM famcal51_event WHERE id=?').get(id) ?? null;
export const getTask51 = (id) => q('SELECT * FROM famcal51_task WHERE id=?').get(id) ?? null;
export const eventOut51 = eventOut;

export async function createEvent51(v, b, now = Date.now()) {
  const o = eventIn(b);
  if (typeof o === 'string') return { error: o };
  const ev = q(`INSERT INTO famcal51_event(title,start,end,all_day,place_name,lat,lon,note,color,created_by,created,updated) VALUES(@title,@start,@end,@all_day,@place_name,@lat,@lon,@note,@color,@created_by,@now,@now) RETURNING *`)
    .get({ place_name: null, lat: null, lon: null, note: null, color: null, ...o, created_by: v, now });
  const tasks = Array.isArray(b.tasks) ? b.tasks.slice(0, 6) : [];
  for (const tb of tasks) { const r = await addTask51(v, ev.id, tb, now); if (r.error) { q('DELETE FROM famcal51_task WHERE event_id=?').run(ev.id); q('DELETE FROM famcal51_event WHERE id=?').run(ev.id); return r; } }
  return { event: eventOut(getEvent51(ev.id), v, now) };
}
export function patchEvent51(v, id, b, now = Date.now()) {
  const cur = getEvent51(id);
  if (!cur) return { error: 'Fant ikke hendelsen', status: 404 };
  if (cur.created_by !== v && !isAdmin(v)) return { error: 'Bare den som la inn hendelsen (eller en administrator) kan endre den', status: 403 };
  const o = eventIn(b, cur);
  if (typeof o === 'string') return { error: o };
  q(`UPDATE famcal51_event SET ${setSql(o)}, updated=@now WHERE id=@id`).run({ ...o, now, id });
  return { event: eventOut(getEvent51(id), v, now) };
}
export function deleteEvent51(v, id) {
  const cur = getEvent51(id);
  if (!cur) return { error: 'Fant ikke hendelsen', status: 404 };
  if (cur.created_by !== v && !isAdmin(v)) return { error: 'Bare den som la inn hendelsen (eller en administrator) kan slette den', status: 403 };
  q('DELETE FROM famcal51_task WHERE event_id=?').run(id);
  q('DELETE FROM famcal51_event WHERE id=?').run(id);
  return { ok: true };
}
export async function addTask51(v, eventId, b, now = Date.now()) {
  const ev = getEvent51(eventId);
  if (!ev) return { error: 'Fant ikke hendelsen', status: 404 };
  if (q('SELECT count(*) FROM famcal51_task WHERE event_id=?').pluck().get(eventId) >= 6) return { error: 'Maks 6 kjøreoppgaver per hendelse' };
  const o = taskIn(b, v, ev);
  if (typeof o === 'string') return { error: o };
  const t = q(`INSERT INTO famcal51_task(event_id,kind,at,for_user,from_name,from_lat,from_lon,to_name,to_lat,to_lon,assignee,status,note,created_by,created,updated,assigned_at)
    VALUES(@event_id,@kind,@at,@for_user,@from_name,@from_lat,@from_lon,@to_name,@to_lat,@to_lon,@assignee,@status,@note,@created_by,@now,@now,@assigned_at) RETURNING *`)
    .get({ for_user: null, from_name: null, from_lat: null, from_lon: null, to_name: null, to_lat: null, to_lon: null, assignee: null, status: 'open', note: null, ...o, event_id: eventId, created_by: v, now, assigned_at: o.assignee ? now : null });
  await notifyAssigned(t, v);
  return { task: taskOut51(t, v, ev, now) };
}
export async function patchTask51(v, id, b, now = Date.now()) {
  const cur = getTask51(id);
  if (!cur) return { error: 'Fant ikke oppgaven', status: 404 };
  const ev = getEvent51(cur.event_id);
  const o = taskIn(b, v, ev, cur);
  if (typeof o === 'string') return { error: o };
  if (o.assignee !== undefined && o.assignee !== cur.assignee) { o.assigned_at = o.assignee ? now : null; o.reminded_at = null; }
  if (o.at !== undefined && o.at !== cur.at) { o.reminded_at = null; o.nag_at = null; }
  if (o.status === 'done' && cur.status !== 'done') o.done_at = now;
  if (o.status === 'open') o.done_at = null;
  if (!Object.keys(o).length) return { task: taskOut51(cur, v, ev, now) };
  q(`UPDATE famcal51_task SET ${setSql(o)}, updated=@now WHERE id=@id`).run({ ...o, now, id });
  const t = getTask51(id);
  if (o.assignee !== undefined && o.assignee !== cur.assignee) await notifyAssigned(t, v);
  return { task: taskOut51(t, v, ev, now) };
}
export function deleteTask51(v, id) {
  const cur = getTask51(id);
  if (!cur) return { error: 'Fant ikke oppgaven', status: 404 };
  q('DELETE FROM famcal51_task WHERE id=?').run(id);
  return { ok: true };
}
/** «Hvem kjører?»: kommende kjøreoppgaver (14 dager), mine først. */
export function drives51(v, { mine = false, days = 14 } = {}, now = Date.now()) {
  const rows = q("SELECT * FROM famcal51_task WHERE status!='done' AND at>=? AND at<=? ORDER BY at, id").all(now - 2 * HOUR, now + days * DAY)
    .filter((t) => !mine || t.assignee === v);
  const tasks = rows.map((t) => taskOut51(t, v, null, now));
  const open = tasks.filter((t) => t.status === 'open').length;
  return { tasks, open, mine: tasks.filter((t) => t.mine).length, text: !tasks.length ? 'Ingen kjøring de neste dagene' : open ? `${open} uten sjåfør` : 'Alle har sjåfør' };
}

/* ---------------- Kalender ---------------- */

// Hendelsene vises i Kalender for alle i familien (lesing; endres i Familie › Familiekalender).
addEventSource(async (u, from, to) => {
  if (kv.get(u, 'famcal51_in_calendar', true) === false) return null;
  const list = listEvents51(u, from, to);
  if (!list.length) return null;
  return {
    id: 'familie51', name: 'Familiekalender',
    events: list.map((e) => {
      const ev = getEvent51(e.id);
      const drivers = e.tasks.map((t) => `${t.kindLabel}: ${t.assignee ? t.assignee.name : 'ingen sjåfør'}`).join(' · ');
      const title = e.needsDriver ? `${e.title} · trenger sjåfør` : e.title;
      return { id: `famcal51-${e.id}`, title, short: title.length > 18 ? `${title.slice(0, 17)}…` : title, subject: null, room: e.place?.name ?? '', teacher: '', note: [e.note, drivers].filter(Boolean).join('\n'),
        start: e.allDay ? e.date : iso(ev.start), end: e.allDay ? ymd(ev.end) : iso(ev.end), allDay: e.allDay, date: e.date, time: e.allDay ? null : e.time, inAllDayRow: e.allDay,
        type: 'familie', color: e.color, source: 'familie51', calendar: 'familie51', editable: false, url: '/#/familiekalender', openLabel: 'Åpne i Familiekalender ›', origin: 'Familiekalender', appCalendar: 'familie51', appColor: e.color };
    }),
  };
});
