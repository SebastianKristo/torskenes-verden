// Bursdager (prompt 24): én liste per bruker, med Google Kalender (OAuth 2.0 + PKCE, styrt fra serveren) og
// Home Assistant (calendar.*) som kilder. Alt er per bruker: rader, Google-tilkobling (refresh-token kryptert i kv
// under brukerens id) og HA-valg. HA-tilkoblingen er serveroppsett (Integrasjoner → Home Assistant), så bare
// administratorer kan importere fra og skrive til HA.
//
// Google:
//  - GET /google/auth (sesjon, ?token=<app-token> eller ?code=<kortlivet kode fra POST /google/start>) sender videre til
//    Google med PKCE (S256). GET /google/callback bytter koden, lagrer refresh-tokenet kryptert og sender tilbake til
//    ?return= (samme opprinnelse eller finanshub://).
//  - Les: hendelser med eventTypes=birthday og default, singleEvents=false (årlige gjentakelser kommer som én hendelse
//    med RRULE), så syncToken kan brukes (Google godtar ikke syncToken sammen med timeMin/timeMax). Navnet tolkes fra
//    summary. Inkrementell synk hvert 15. minutt og med POST /google/sync.
//  - Skriv: årlig heldagshendelse (RRULE:FREQ=YEARLY) med extendedProperties.private.homelab_id og birth_year.
// Home Assistant: GET /api/calendars, GET /api/calendars/<id>?start&end, calendar.create_event med rrule (reserve: årets og
// neste års hendelse), og WebSocket calendar/event/delete og calendar/event/update for sletting og endring.
// Prompt 27 (Kalender v2): scope calendar.events lagres fra token-svaret (gconf.scope); googleCanWrite, googleCalendarIds
// (Privat = valgt kalender, Familie = familyCalendarId eller en skrivbar «Famil…»-kalender) og googleEventWrite brukes av calendar.js.
// MOCK_DATA=1 uten Google-klient eller HA-token: innebygd Google og HA i minnet (per bruker), så klientene kan utvikles.
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { db, kv } from './db.js';
import { cfg } from './settings.js';
import { sessionUser, userInfo, listUsers, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { seal, unseal } from './finans/db.js';
import { broadcast } from './realtime.js';
import { notifyOf } from './notify.js';
import { photoUrl41 } from './birthdays41.js'; // prompt 41: bilder av personer

const MOCK = process.env.MOCK_DATA === '1';
const q = (sql) => db.prepare(sql);
const DAY = 86_400_000;
const TZ = 'Europe/Oslo';

db.exec(`
CREATE TABLE IF NOT EXISTS birthdays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  year INTEGER,
  relation TEXT NOT NULL DEFAULT 'annet',
  reminder_days INTEGER,
  source TEXT NOT NULL DEFAULT 'local',
  google_event_id TEXT,
  ha_uid TEXT,
  person_id TEXT,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS birthdays_user ON birthdays(user_id);
`);
// Kalenderen hendelsen ligger i (for «Åpne i Google Kalender», endring og sletting etter bytte av kalender).
if (!q('PRAGMA table_info(birthdays)').all().some((c) => c.name === 'google_cal')) db.exec('ALTER TABLE birthdays ADD COLUMN google_cal TEXT');

export const RELATIONS = ['familie', 'venn', 'jobb', 'annet'];
export const RELATION_LABEL = { familie: 'Familie', venn: 'Venn', jobb: 'Jobb', annet: 'Annet' };
export const RELATION_COLOR = { familie: '#b23a2a', venn: '#2b5d8a', jobb: '#2e6f75', annet: '#a8661a' };
const REMINDERS = [0, 1, 7];
const SOURCES = ['local', 'google', 'ha'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MONTHS_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/* ---------------- Datoer (norsk tid) ---------------- */

const pad = (n) => String(n).padStart(2, '0');
export const osloDate = (now = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(now));
const ymd = (s) => s.split('-').map(Number);
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const validDate = (m, d) => Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
/** Neste dato (i dag eller senere) for måned/dag. 29. februar blir 28. februar i år som ikke er skuddår. */
export function nextDateOf(month, day, today = osloDate()) {
  const [ty, tm, td] = ymd(today);
  const fix = (y) => (month === 2 && day === 29 && !isLeap(y) ? 28 : day);
  let y = ty;
  if (month < tm || (month === tm && fix(y) < td)) y += 1;
  return `${y}-${pad(month)}-${pad(fix(y))}`;
}
const daysBetween = (a, b) => Math.round((utc(...ymd(b)) - utc(...ymd(a))) / DAY);
const addDays = (s, n) => new Date(utc(...ymd(s)) + n * DAY).toISOString().slice(0, 10);
const weekday = (s) => WEEKDAYS[new Date(utc(...ymd(s))).getUTCDay()];
// Klokkeslett 09:00 norsk tid på en dato, som ISO (sommer- og vintertid).
function osloNine(date) {
  const [y, m, d] = ymd(date);
  for (const off of [2, 1]) {
    const t = Date.UTC(y, m - 1, d, 9 - off);
    if (new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)) === '09') return new Date(t).toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d, 8)).toISOString();
}

/* ---------------- Navn ---------------- */

/** «Ingrids bursdag» → «Ingrid», «Ingrid – bursdag» → «Ingrid», «Bursdag: Ingrid» → «Ingrid», «Ingrid's birthday» → «Ingrid». */
export function parseName(summary) {
  const s0 = String(summary ?? '').replace(/[\u{1F382}\u{1F389}\u{1F381}\u{1F973}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!s0) return '';
  const W = '(?:bursdag|fødselsdag|birthday|geburtstag|f\\.dag)';
  const pats = [
    new RegExp(`^${W}\\s*(?:til|for|:|–|-|—)\\s*(.+)$`, 'i'), // «Bursdag: Ingrid», «Bursdag til Ingrid»
    new RegExp(`^(.+?)\\s+sin\\s+${W}\\b`, 'i'), // «Ingrid sin bursdag»
    new RegExp(`^(.+?)['’]s?\\s+${W}\\b`, 'i'), // «Ingrid's birthday», «Hans' bursdag»
    new RegExp(`^(.+?)\\s*[–—:-]\\s*${W}\\b`, 'i'), // «Ingrid – bursdag»
    new RegExp(`^(.+?)s\\s+${W}\\b`, 'i'), // «Ingrids bursdag»
    new RegExp(`^(.+?)\\s+${W}\\b`, 'i'), // «Ingrid bursdag»
  ];
  let s = s0;
  for (const re of pats) { const m = s0.match(re); if (m) { s = m[1]; break; } }
  s = s.replace(/\s+(?:fyller|blir)\s+\d+.*$/i, '').replace(/\s*\(\d+\s*(?:år)?\)\s*$/i, '').replace(/[,.:;–—-]+$/, '').trim();
  return s.slice(0, 60);
}
const norm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFC');
const firstWord = (s) => norm(s).split(/\s+/)[0] ?? '';
export const initials = (name) => { const w = String(name ?? '').trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };

/* ---------------- Familie-kobling ---------------- */

// Kobles til en bruker (Familie-person) når navnet er likt fullt navn, visningsnavn, brukernavn eller fornavnet.
function personFor(name) {
  const n = norm(name);
  if (!n) return null;
  const users = listUsers();
  const exact = users.find((u) => [u.displayName, u.name, u.username].some((x) => norm(x) === n));
  if (exact) return exact.id;
  const one = users.filter((u) => firstWord(u.displayName ?? u.name) === n);
  return one.length === 1 ? one[0].id : null;
}

/* ---------------- Utdata ---------------- */

const rowsOf = (user) => q('SELECT * FROM birthdays WHERE user_id=?').all(user);
const rowOf = (user, id) => q('SELECT * FROM birthdays WHERE id=? AND user_id=?').get(Number(id), user);

const googleUrl = (r) => (r.google_event_id ? `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${r.google_event_id} ${r.google_cal || 'primary'}`).toString('base64').replace(/=+$/, '')}` : null);

export function itemOut(r, today = osloDate()) {
  const nextDate = nextDateOf(r.month, r.day, today);
  const daysLeft = daysBetween(today, nextDate);
  const age = r.year ? Number(nextDate.slice(0, 4)) - r.year : null;
  const person = r.person_id ? userInfo(r.person_id) : null;
  const rel = RELATIONS.includes(r.relation) ? r.relation : 'annet';
  let remindAt = null;
  if (r.reminder_days != null) {
    let d = addDays(nextDate, -r.reminder_days);
    if (daysBetween(today, d) < 0 || (d === today && Date.parse(osloNine(d)) < Date.now())) d = addDays(nextDateOf(r.month, r.day, addDays(nextDate, 1)), -r.reminder_days);
    remindAt = osloNine(d);
  }
  return {
    id: r.id, name: r.name, month: r.month, day: r.day, year: r.year ?? null, age, nextDate, daysLeft, today: daysLeft === 0,
    weekday: weekday(nextDate), dateText: `${r.day}. ${MONTHS[r.month - 1]}`, dateLong: `${weekday(nextDate)} ${r.day}. ${MONTHS_LONG[r.month - 1]}`,
    relation: rel, relationLabel: RELATION_LABEL[rel], color: RELATION_COLOR[rel], initials: initials(r.name),
    reminderDays: r.reminder_days ?? null, remindAt, source: SOURCES.includes(r.source) ? r.source : 'local',
    personId: person ? r.person_id : null, photoUrl: photoUrl41(r.id), avatarUrl: photoUrl41(r.id) ?? person?.avatarUrl ?? null, familyAvatarUrl: person?.avatarUrl ?? null, // prompt 41: eget bilde foran
    googleEventId: r.google_event_id ?? null, googleUrl: googleUrl(r), haUid: r.ha_uid ?? null,
    created: r.created, updated: r.updated,
  };
}

const byNext = (a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, 'nb');
export function listFor(user, today = osloDate()) { return rowsOf(user).map((r) => itemOut(r, today)).sort(byNext); }

const joinNames = (ns) => (ns.length <= 1 ? ns.join('') : `${ns.slice(0, -1).join(', ')} og ${ns.at(-1)}`);
/** «Neste bursdag»: alle som har bursdag den første datoen, og de to neste etter den. */
export function nextOf(items) {
  if (!items.length) return null;
  const first = items[0], same = items.filter((x) => x.nextDate === first.nextDate);
  const rest = items.filter((x) => x.nextDate !== first.nextDate).slice(0, 2);
  return {
    ids: same.map((x) => x.id), names: same.map((x) => x.name), label: joinNames(same.map((x) => x.name)),
    date: first.nextDate, daysLeft: first.daysLeft, today: first.daysLeft === 0, age: same.length === 1 ? first.age : null,
    dateLong: first.dateLong, dateText: first.dateText, items: same,
    then: rest.map((x) => ({ id: x.id, name: x.name, date: x.nextDate, dateText: x.dateText, daysLeft: x.daysLeft, age: x.age })),
  };
}

/* ---------------- Google: transport ---------------- */

const G_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const G_TOKEN = 'https://oauth2.googleapis.com/token';
const G_REVOKE = 'https://oauth2.googleapis.com/revoke';
const G_CAL = 'https://www.googleapis.com/calendar/v3';
const G_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'];

let gFetch = null; // satt av testene
export const _setGoogleFetch = (fn) => { gFetch = fn; accessCache.clear(); };
const googleClient = () => ({ id: cfg('googleClientId').trim(), secret: cfg('googleClientSecret').trim(), redirect: cfg('googleRedirectUri').trim() });
const mockGoogle = () => MOCK && !gFetch && !googleClient().id;
const fetchG = (url, init) => (gFetch ?? (mockGoogle() ? fakeGoogle : fetch))(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });

const gconf = (user) => ({ calendarId: null, writeNew: true, contacts: true, syncedAt: null, ...(kv.get(user, 'bd_google', {}) ?? {}) });
/** Prompt 35: valgte kalendere (minst én). calendarId (= første) beholdes for eldre klienter. */
const calIdsOf = (g) => (Array.isArray(g.calendarIds) && g.calendarIds.length ? g.calendarIds : [g.calendarId || 'primary']);
const setG = (user, patch) => kv.set(user, 'bd_google', { ...gconf(user), ...patch });
const gConnected = (user) => !!gconf(user).refresh;

const accessCache = new Map(); // user → { token, exp }
async function tokenCall(params) {
  const r = await fetchG(G_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error_description || j.error || `Google svarte ${r.status}`), { code: j.error, status: r.status });
  return j;
}
async function accessToken(user) {
  const hit = accessCache.get(user);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  const refresh = unseal(gconf(user).refresh);
  if (!refresh) throw Object.assign(new Error('Ikke logget inn med Google'), { status: 409 });
  const { id, secret } = googleClient();
  try {
    const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: refresh, client_id: id, client_secret: secret });
    accessCache.set(user, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
    if (j.scope && j.scope !== gconf(user).scope) setG(user, { scope: String(j.scope) }); // prompt 27: tilgangene tokenet faktisk har
    return j.access_token;
  } catch (e) {
    if (e.code === 'invalid_grant') { setG(user, { refresh: null, error: 'Google-innloggingen er utløpt eller trukket tilbake. Logg inn på nytt.' }); accessCache.delete(user); }
    throw e;
  }
}
async function gapi(user, method, path, { query, body } = {}, retry = true) {
  const tok = await accessToken(user);
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  const r = await fetchG(`${G_CAL}${path}${qs}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && retry) { accessCache.delete(user); return gapi(user, method, path, { query, body }, false); }
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, json: j };
}
const gfail = (r, what) => Object.assign(new Error(`${what}: Google svarte ${r.status}${r.json?.error?.message ? ` (${r.json.error.message})` : ''}`), { status: 502 });

const eventBody = (row) => {
  const date = nextDateOf(row.month, row.day);
  const start = row.year ? `${row.year}-${pad(row.month)}-${pad(row.day)}` : date;
  const startDate = validDate(row.month, row.day) && (!row.year || row.month !== 2 || row.day !== 29 || isLeap(row.year)) ? start : date;
  return {
    summary: `${row.name} – bursdag`,
    start: { date: startDate }, end: { date: addDays(startDate, 1) },
    recurrence: ['RRULE:FREQ=YEARLY'], transparency: 'transparent',
    reminders: { useDefault: false, overrides: row.reminder_days == null ? [] : [{ method: 'popup', minutes: Math.max(0, row.reminder_days * 1440 - 540) }] },
    extendedProperties: { private: { homelab_id: String(row.id), ...(row.year ? { birth_year: String(row.year) } : {}) } },
  };
};

async function gInsert(user, row) {
  const cal = gconf(user).calendarId || 'primary';
  const r = await gapi(user, 'POST', `/calendars/${encodeURIComponent(cal)}/events`, { body: eventBody(row) });
  if (!r.ok) throw gfail(r, 'Kunne ikke lagre i Google Kalender');
  q('UPDATE birthdays SET google_event_id=?, google_cal=? WHERE id=?').run(r.json.id, cal, row.id);
}
async function gPatch(user, row) {
  const cal = row.google_cal || gconf(user).calendarId || 'primary';
  const r = await gapi(user, 'PATCH', `/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(row.google_event_id)}`, { body: eventBody(row) });
  if (!r.ok && r.status !== 404 && r.status !== 410) throw gfail(r, 'Kunne ikke endre i Google Kalender');
}
async function gDelete(user, row) {
  const cal = row.google_cal || gconf(user).calendarId || 'primary';
  const r = await gapi(user, 'DELETE', `/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(row.google_event_id)}`);
  if (!r.ok && r.status !== 404 && r.status !== 410) throw gfail(r, 'Kunne ikke slette i Google Kalender');
}

/* ---------------- Google: synk ---------------- */

const BDAY_RE = /bursdag|fødselsdag|birthday|geburtstag|f\.dag/i;
function applyGoogleEvent(user, ev, cal, now) {
  if (ev.status === 'cancelled') {
    q("DELETE FROM birthdays WHERE user_id=? AND google_event_id=? AND source='google'").run(user, ev.id);
    q('UPDATE birthdays SET google_event_id=NULL, google_cal=NULL WHERE user_id=? AND google_event_id=?').run(user, ev.id);
    return 0;
  }
  const priv = ev.extendedProperties?.private ?? {};
  const isBday = ev.eventType === 'birthday' || !!priv.homelab_id || BDAY_RE.test(ev.summary ?? '');
  if (!isBday) return 0;
  if (ev.eventType === 'birthday' && ev.birthdayProperties?.type && !['birthday', 'self'].includes(ev.birthdayProperties.type)) return 0;
  const date = ev.start?.date ?? (ev.start?.dateTime ? String(ev.start.dateTime).slice(0, 10) : null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return 0;
  const [y, m, d] = ymd(date);
  const name = parseName(ev.summary) || parseName(ev.birthdayProperties?.contact ?? '');
  if (!name || !validDate(m, d)) return 0;
  const thisYear = Number(osloDate().slice(0, 4));
  let year = /^\d{4}$/.test(priv.birth_year ?? '') ? Number(priv.birth_year) : null;
  if (!year && ev.eventType === 'birthday' && y > 1900 && y < thisYear) year = y;
  const own = priv.homelab_id && /^\d+$/.test(priv.homelab_id) ? rowOf(user, priv.homelab_id) : null;
  const cur = q('SELECT * FROM birthdays WHERE user_id=? AND google_event_id=?').get(user, ev.id) ?? own
    ?? q('SELECT * FROM birthdays WHERE user_id=? AND lower(name)=lower(?) AND month=? AND day=?').get(user, name, m, d);
  if (cur) {
    q('UPDATE birthdays SET name=?, month=?, day=?, year=COALESCE(?, year), google_event_id=?, google_cal=?, person_id=COALESCE(person_id, ?), updated=? WHERE id=?')
      .run(name, m, d, year, ev.id, cal, personFor(name), now, cur.id);
  } else {
    q("INSERT INTO birthdays(user_id,name,month,day,year,relation,reminder_days,source,google_event_id,google_cal,person_id,created,updated) VALUES(?,?,?,?,?,?,1,'google',?,?,?,?,?)")
      .run(user, name, m, d, year, personFor(name) ? 'familie' : 'venn', ev.id, cal, personFor(name), now, now);
  }
  return 1;
}

async function syncCalendar(user, cal, tokenKey, types) {
  const conf = gconf(user), now = Date.now();
  let token = conf[tokenKey] ?? null, pageToken = null, n = 0, nextSync = null;
  for (let page = 0; page < 40; page++) {
    const query = new URLSearchParams({ singleEvents: 'false', showDeleted: 'true', maxResults: '250' });
    for (const t of types) query.append('eventTypes', t);
    if (token) query.set('syncToken', token);
    if (pageToken) query.set('pageToken', pageToken);
    const r = await gapi(user, 'GET', `/calendars/${encodeURIComponent(cal)}/events`, { query });
    if (r.status === 410 && token) { token = null; pageToken = null; setG(user, { [tokenKey]: null }); continue; } // syncToken utløpt: full synk
    if (!r.ok) throw gfail(r, 'Kunne ikke hente bursdager fra Google');
    db.transaction(() => { for (const ev of r.json?.items ?? []) n += applyGoogleEvent(user, ev, cal, now); })();
    pageToken = r.json?.nextPageToken ?? null;
    nextSync = r.json?.nextSyncToken ?? nextSync;
    if (!pageToken) break;
  }
  setG(user, { [tokenKey]: nextSync });
  return n;
}

const syncing = new Map();
export function syncGoogle(user, { full = false } = {}) {
  if (!gConnected(user)) return Promise.resolve({ ok: false, error: 'Ikke logget inn med Google' });
  if (syncing.has(user)) return syncing.get(user);
  const p = (async () => {
    if (full) setG(user, { syncToken: null, syncTokenContacts: null });
    const conf = gconf(user), ids = calIdsOf(conf), cal = ids[0];
    let n = await syncCalendar(user, cal, 'syncToken', conf.contacts ? ['birthday', 'default'] : ['default']);
    // Prompt 35: flere valgte kalendere (calendarIds) hentes og slås sammen.
    for (const extra of ids.slice(1)) n += await syncCalendar(user, extra, `syncToken:${extra}`, extra === 'primary' && conf.contacts ? ['birthday', 'default'] : ['default']);
    // Bursdager fra Google-kontakter ligger i hovedkalenderen (eventType=birthday).
    if (conf.contacts && !ids.includes('primary')) n += await syncCalendar(user, 'primary', 'syncTokenContacts', ['birthday']);
    setG(user, { syncedAt: new Date().toISOString(), error: null });
    return { ok: true, changed: n };
  })().catch((e) => { setG(user, { error: e.message }); return { ok: false, error: e.message }; }).finally(() => syncing.delete(user));
  syncing.set(user, p);
  return p;
}

/* ---------------- Prompt 26: Kalender (calendar.js) leser Google og koblingene ---------------- */

/** Kalender-koblingene til user (Innstillinger → Kalendere): Google og Home Assistant. */
export function calendarLinks(user) {
  const g = gconf(user), h = haConf(user);
  return {
    google: { connected: !!g.refresh, configured: !!googleClient().id || mockGoogle(), email: g.email ?? null, calendarId: g.calendarId ?? (g.refresh ? 'primary' : null), error: g.error ?? null },
    ha: { connected: !!h.entityId, entityId: h.entityId ?? null, configured: !!(haBase() && haToken()) || mockHa(), allowed: isAdmin(user) },
  };
}
/** Hendelser fra brukerens valgte Google-kalender (eller calId) i [from, to) (ikke bursdager, de kommer fra Bursdager). null = ikke koblet. */
export async function googleCalendarEvents(user, from, to, calId = null) {
  if (!gConnected(user)) return null;
  const cal = calId || gconf(user).calendarId || 'primary', out = [];
  let pageToken = null;
  for (let i = 0; i < 5; i++) {
    const query = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), maxResults: '250' });
    if (pageToken) query.set('pageToken', pageToken);
    const r = await gapi(user, 'GET', `/calendars/${encodeURIComponent(cal)}/events`, { query });
    if (!r.ok) throw gfail(r, 'Kunne ikke hente Google Kalender');
    for (const ev of r.json?.items ?? []) {
      if (ev.status === 'cancelled' || ev.eventType === 'birthday' || ev.extendedProperties?.private?.homelab_id) continue;
      out.push(ev);
    }
    pageToken = r.json?.nextPageToken ?? null;
    if (!pageToken) break;
  }
  return out;
}

/* ---------------- Prompt 27: Kalender v2 skriver til Google (Privat og Familie) ---------------- */

export const googleConnected = (user) => gConnected(user);
/** Har tokenet skrivetilgang (calendar.events eller calendar)? Ukjent scope (eldre kobling) = prøv og se. */
export function googleCanWrite(user) {
  const s = gconf(user).scope;
  return !s || /auth\/calendar(\.events)?(\s|$)/.test(String(s));
}
/** Kalender-id-ene for Privat (valgt kalender) og Familie (egen innstilling, ellers en skrivbar kalender som heter «Familie…»). */
export async function googleCalendarIds(user) {
  const g = gconf(user);
  const privat = g.mainCalendarId || g.calendarId || 'primary'; // prompt 36b: valgt hovedkalender (Personlig)
  if (g.familyCalendarId !== undefined) return { privat, familie: g.familyCalendarId };
  let familie = null;
  try {
    const r = await gapi(user, 'GET', '/users/me/calendarList', { query: { minAccessRole: 'writer' } });
    if (r.ok) familie = (r.json?.items ?? []).find((x) => !x.primary && /famil/i.test(x.summaryOverride ?? x.summary ?? ''))?.id ?? null;
    setG(user, { familyCalendarId: familie });
  } catch { /* uten Familie */ }
  return { privat, familie };
}
const reconnect = () => Object.assign(new Error('Google-koblingen mangler skrivetilgang til kalenderen. Logg inn med Google på nytt.'), { status: 409, reconnect: true });
/** POST/PATCH/DELETE mot /calendars/{cal}/events[/{id}]. 409 + reconnect når tokenet ikke har skrivetilgang. */
export async function googleEventWrite(user, method, calId, eventId, body) {
  if (!gConnected(user)) throw Object.assign(new Error('Logg inn med Google for å lagre i Privat eller Familie.'), { status: 409, reconnect: true });
  if (!googleCanWrite(user)) throw reconnect();
  const path = `/calendars/${encodeURIComponent(calId || 'primary')}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
  const r = await gapi(user, method, path, body ? { body } : {});
  if (r.status === 403 && /insufficient|scope|permission/i.test(JSON.stringify(r.json ?? {}))) { setG(user, { scope: 'readonly' }); throw reconnect(); }
  if (!r.ok && !(method === 'DELETE' && (r.status === 404 || r.status === 410))) throw gfail(r, 'Kunne ikke lagre i Google Kalender');
  return r.json;
}

/* ---------------- Prompt 36b: hovedkalender og flere Google-kalendere i Kalender ---------------- */
export const googleConfOf = (user) => gconf(user);
export const googleConfSet = (user, patch) => setG(user, patch);
/** Alle kalendere i Google-kontoen (minst lesetilgang). id 'primary' for hovedkalenderen i kontoen. */
export async function googleCalendarList(user) {
  const r = await gapi(user, 'GET', '/users/me/calendarList', { query: { minAccessRole: 'reader' } });
  if (!r.ok) throw gfail(r, 'Kunne ikke hente kalendere');
  return (r.json?.items ?? []).map((x) => ({ id: x.primary ? 'primary' : x.id, googleId: x.id, name: x.summaryOverride ?? x.summary ?? x.id, primary: !!x.primary,
    writable: ['owner', 'writer'].includes(x.accessRole), access: x.accessRole ?? 'reader', color: x.backgroundColor ?? null }));
}

/* ---------------- Google: OAuth (PKCE) ---------------- */

const pending = new Map(); // state → { user, verifier, ret, redirect, exp }
const startCodes = new Map(); // kortlivet kode → { user, exp }
const b64u = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function sweep() { const t = Date.now(); for (const m of [pending, startCodes]) for (const [k, v] of m) if (v.exp < t) m.delete(k); }

const RETURN_OK = /^finanshub:\/\/[\w./?=&%#-]*$/i;
// Bare finanshub:// (appene) og serverens egen opprinnelse (sti eller full adresse med samme vert).
function safeReturn(v, origin = null) {
  const s = String(v ?? '').trim();
  if (RETURN_OK.test(s)) return s;
  if (origin && s.startsWith(`${origin}/`) && /^[\w:./?=&%#-]*$/.test(s)) return s;
  if (/^\/(?!\/)[\w./?=&%#-]*$/.test(s)) return s;
  return '/?bursdager=1#bursdager';
}
function withQuery(url, params) {
  const [base, hash] = url.split('#');
  const qs = new URLSearchParams(params).toString();
  return `${base}${base.includes('?') ? '&' : '?'}${qs}${hash !== undefined ? `#${hash}` : ''}`;
}
function originOf(c) {
  const u = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim() || u.protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host')?.split(',')[0].trim() || c.req.header('host') || u.host;
  return `${proto}://${host}`;
}
function redirectUri(c) {
  const fixed = googleClient().redirect;
  if (fixed) return fixed;
  const u = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim() || u.protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host')?.split(',')[0].trim() || c.req.header('host') || u.host;
  return `${proto}://${host}/api/birthdays/google/callback`;
}

/* ---------------- Innebygd Google i minnet (MOCK_DATA=1 uten Google-klient) ---------------- */

const FAKE = new Map(); // user → { seq, cals: Map(id → Map(eventId → ev)) }
const fakeOf = (user) => {
  if (!FAKE.has(user)) {
    const prim = new Map(), seed = [['Henrik', '1988-10-19'], ['Sofie', '2009-12-24'], ['Marius', '1994-02-03']];
    seed.forEach(([n, d], i) => prim.set(`gb${i}`, { id: `gb${i}`, status: 'confirmed', eventType: 'birthday', birthdayProperties: { type: 'birthday' }, summary: n, start: { date: d }, end: { date: addDays(d, 1) }, recurrence: ['RRULE:FREQ=YEARLY'], seq: 1 }));
    FAKE.set(user, { seq: 1, cals: new Map([['primary', prim], ['familie@group.calendar.google.com', new Map()]]) });
  }
  return FAKE.get(user);
};
const fakeJson = (b, status = 200) => new Response(status === 204 ? null : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
async function fakeGoogle(url, init = {}) {
  const u = new URL(url), method = init.method ?? 'GET';
  if (u.href.startsWith(G_TOKEN)) {
    const p = new URLSearchParams(init.body);
    const user = p.get('grant_type') === 'refresh_token' ? p.get('refresh_token').replace(/^mock-rt-/, '') : p.get('code').replace(/^mock-/, '');
    return fakeJson({ access_token: `mock-at-${user}`, expires_in: 3600, refresh_token: `mock-rt-${user}`,
      id_token: `x.${b64u(Buffer.from(JSON.stringify({ email: `${userInfo(user)?.username ?? 'demo'}@gmail.com` })))}.x` });
  }
  if (u.href.startsWith(G_REVOKE)) return fakeJson({});
  const user = String(init.headers?.authorization ?? '').replace(/^Bearer mock-at-/, '');
  if (!userInfo(user)) return fakeJson({ error: { message: 'unauthorized' } }, 401);
  const f = fakeOf(user);
  const path = decodeURIComponent(u.pathname.replace('/calendar/v3', ''));
  if (path === '/users/me/calendarList') return fakeJson({ items: [{ id: 'primary', summary: `${userInfo(user)?.username}@gmail.com`, primary: true, accessRole: 'owner' }, { id: 'familie@group.calendar.google.com', summary: 'Familie', accessRole: 'owner' }] });
  const m = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
  if (!m) return fakeJson({ error: { message: 'not found' } }, 404);
  const cal = f.cals.get(m[1]) ?? f.cals.set(m[1], new Map()).get(m[1]);
  if (method === 'GET' && !m[2]) {
    const since = Number(String(u.searchParams.get('syncToken') ?? 's0').slice(1)) || 0;
    const types = u.searchParams.getAll('eventTypes');
    const items = [...cal.values()].filter((e) => e.seq > since && (!types.length || types.includes(e.eventType ?? 'default')) && (since || e.status !== 'cancelled'));
    return fakeJson({ items, nextSyncToken: `s${f.seq}` });
  }
  const b = init.body ? JSON.parse(init.body) : {};
  if (method === 'POST') { const id = `ev${++f.seq}${randomBytes(3).toString('hex')}`; const ev = { ...b, id, status: 'confirmed', eventType: 'default', seq: f.seq }; cal.set(id, ev); return fakeJson(ev); }
  const ev = cal.get(m[2]);
  if (!ev || ev.status === 'cancelled') return fakeJson({ error: { message: 'gone' } }, 410);
  if (method === 'PATCH') { Object.assign(ev, b, { seq: ++f.seq }); return fakeJson(ev); }
  if (method === 'DELETE') { ev.status = 'cancelled'; ev.seq = ++f.seq; return fakeJson(null, 204); }
  return fakeJson(ev);
}
export const _fakeGoogle = (user) => fakeOf(user);

/* ---------------- Home Assistant ---------------- */

const haConf = (user) => ({ entityId: null, twoWay: false, syncedAt: null, ...(kv.get(user, 'bd_ha', {}) ?? {}) });
const setHa = (user, patch) => kv.set(user, 'bd_ha', { ...haConf(user), ...patch });
const haBase = () => String(cfg('ha_url') || '').replace(/\/+$/, '');
const haToken = () => cfg('ha_token') || '';

let haT = null; // testene kan bytte transporten: { rest(method, path, body) → {status, json}, ws(cmd) → result }
export const _setHaTransport = (t) => { haT = t; };
const mockHa = () => MOCK && !haT && !haToken();
const FAKE_HA = { 'calendar.bursdager': { name: 'Bursdager', events: [['Bestefar Arne', '11-08', 1950], ['Tante Liv', '09-02', 1972]].map(([n, md, y], i) => ({ uid: `ha${i}`, summary: `${n} – bursdag`, md, description: `Født ${y}`, rrule: 'FREQ=YEARLY' })) }, 'calendar.familie': { name: 'Familie', events: [] } };
const fakeHaRest = async (method, path, body) => {
  if (path === '/api/calendars') return { status: 200, json: Object.entries(FAKE_HA).map(([entity_id, c]) => ({ entity_id, name: c.name })) };
  const m = path.match(/^\/api\/calendars\/([\w.]+)\?start=([^&]+)&end=(.+)$/);
  if (m) {
    const cal = FAKE_HA[m[1]]; if (!cal) return { status: 404, json: null };
    const start = decodeURIComponent(m[2]).slice(0, 10), out = [];
    for (const e of cal.events) { const d = nextDateOf(...e.md.split('-').map(Number), start); out.push({ uid: e.uid, summary: e.summary, description: e.description, start: { date: d }, end: { date: addDays(d, 1) }, rrule: e.rrule }); }
    return { status: 200, json: out };
  }
  if (path === '/api/services/calendar/create_event') {
    const cal = FAKE_HA[body.entity_id]; if (!cal) return { status: 400, json: { message: 'Unknown entity' } };
    cal.events.push({ uid: `ha${Date.now().toString(36)}${randomBytes(2).toString('hex')}`, summary: body.summary, md: body.start_date.slice(5), description: body.description, rrule: body.rrule });
    return { status: 200, json: [] };
  }
  return { status: 404, json: null };
};
const fakeHaWs = async (cmd) => {
  const cal = FAKE_HA[cmd.entity_id];
  if (!cal) throw new Error('Ukjent kalender');
  const i = cal.events.findIndex((e) => e.uid === cmd.uid);
  if (i < 0) throw new Error('Fant ikke hendelsen');
  if (cmd.type === 'calendar/event/delete') cal.events.splice(i, 1);
  if (cmd.type === 'calendar/event/update') Object.assign(cal.events[i], { summary: cmd.event.summary, md: cmd.event.dtstart.slice(5), description: cmd.event.description });
  return null;
};

async function haRest(method, path, body) {
  if (haT) return haT.rest(method, path, body);
  if (mockHa()) return fakeHaRest(method, path, body);
  if (!haBase() || !haToken()) throw Object.assign(new Error('Home Assistant er ikke satt opp (Integrasjoner → Home Assistant)'), { status: 409 });
  const r = await fetch(`${haBase()}${path}`, { method, headers: { authorization: `Bearer ${haToken()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
function haWs(cmd) {
  if (haT) return haT.ws(cmd);
  if (mockHa()) return fakeHaWs(cmd);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${haBase().replace(/^http/, 'ws')}/api/websocket`);
    const done = (fn, v) => { clearTimeout(t); try { ws.close(); } catch { /* lukket */ } fn(v); };
    const t = setTimeout(() => done(reject, new Error('Home Assistant svarte ikke')), 8000);
    ws.on('error', (e) => done(reject, e));
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: haToken() }));
      else if (m.type === 'auth_invalid') done(reject, new Error('Home Assistant avviste tokenet'));
      else if (m.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, ...cmd }));
      else if (m.type === 'result' && m.id === 1) (m.success ? done(resolve, m.result) : done(reject, new Error(m.error?.message ?? 'Home Assistant avviste kallet')));
    });
  });
}

export async function haCalendars() {
  const r = await haRest('GET', '/api/calendars');
  if (r.status !== 200 || !Array.isArray(r.json)) throw Object.assign(new Error(`Home Assistant svarte ${r.status}`), { status: 502 });
  return r.json.filter((x) => /^calendar\./.test(x.entity_id)).map((x) => ({ entityId: x.entity_id, name: x.name ?? x.entity_id }));
}
async function haEvents(entity) {
  const start = new Date(Date.now() - DAY).toISOString(), end = new Date(Date.now() + 397 * DAY).toISOString();
  const r = await haRest('GET', `/api/calendars/${encodeURIComponent(entity)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (r.status !== 200 || !Array.isArray(r.json)) throw Object.assign(new Error(`Home Assistant svarte ${r.status}`), { status: 502 });
  return r.json;
}
const evDate = (e) => String(e.start?.date ?? e.start?.dateTime ?? e.start ?? '').slice(0, 10);

/** Importerer fra valgt calendar.*. Samme navn og dato som en eksisterende bursdag (fra hvilken som helst kilde) gir ingen ny rad. */
export async function importHa(user) {
  const { entityId } = haConf(user);
  if (!entityId) throw Object.assign(new Error('Velg en kalender i Home Assistant først'), { status: 400 });
  const events = await haEvents(entityId), now = Date.now();
  let added = 0, linked = 0;
  const seen = new Set();
  db.transaction(() => {
    for (const e of events) {
      const date = evDate(e);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const [, m, d] = ymd(date), name = parseName(e.summary);
      const key = `${norm(name)}|${m}|${d}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const ym = String(e.description ?? '').match(/\b(19\d{2}|20\d{2})\b/);
      const year = ym ? Number(ym[1]) : null;
      const cur = (e.uid && q('SELECT * FROM birthdays WHERE user_id=? AND ha_uid=?').get(user, e.uid)) ?? q('SELECT * FROM birthdays WHERE user_id=? AND lower(name)=lower(?) AND month=? AND day=?').get(user, name, m, d);
      if (cur) {
        if (!cur.ha_uid && e.uid) { q('UPDATE birthdays SET ha_uid=?, year=COALESCE(year, ?), updated=? WHERE id=?').run(e.uid, year, now, cur.id); linked++; }
        continue;
      }
      q("INSERT INTO birthdays(user_id,name,month,day,year,relation,reminder_days,source,ha_uid,person_id,created,updated) VALUES(?,?,?,?,?,?,1,'ha',?,?,?,?)")
        .run(user, name, m, d, year, personFor(name) ? 'familie' : 'annet', e.uid ?? null, personFor(name), now, now);
      added++;
    }
  })();
  setHa(user, { syncedAt: new Date().toISOString(), error: null });
  return { ok: true, added, linked, total: events.length };
}

async function haCreate(user, row) {
  const { entityId } = haConf(user);
  if (!entityId) throw Object.assign(new Error('Velg en kalender i Home Assistant først (Bursdager → Kalendere)'), { status: 400 });
  const date = nextDateOf(row.month, row.day);
  const base = { entity_id: entityId, summary: `${row.name} – bursdag`, ...(row.year ? { description: `Født ${row.year}` } : {}) };
  const r = await haRest('POST', '/api/services/calendar/create_event', { ...base, start_date: date, end_date: addDays(date, 1), rrule: 'FREQ=YEARLY' });
  if (r.status >= 200 && r.status < 300) return;
  // Kalendere uten rrule-støtte: årets og neste års hendelse.
  const next = nextDateOf(row.month, row.day, addDays(date, 1));
  for (const d of [date, next]) {
    const x = await haRest('POST', '/api/services/calendar/create_event', { ...base, start_date: d, end_date: addDays(d, 1) });
    if (x.status < 200 || x.status >= 300) throw Object.assign(new Error(`Home Assistant svarte ${x.status}`), { status: 502 });
  }
}
async function haUidFor(user, row) {
  if (row.ha_uid) return row.ha_uid;
  const { entityId } = haConf(user);
  if (!entityId) return null;
  const e = (await haEvents(entityId)).find((x) => norm(parseName(x.summary)) === norm(row.name) && evDate(x).slice(5) === `${pad(row.month)}-${pad(row.day)}`);
  return e?.uid ?? null;
}
async function haDelete(user, row) {
  const { entityId } = haConf(user), uid = await haUidFor(user, row);
  if (entityId && uid) await haWs({ type: 'calendar/event/delete', entity_id: entityId, uid });
}
async function haUpdate(user, row) {
  const { entityId } = haConf(user), uid = await haUidFor(user, row);
  if (!entityId || !uid) return;
  const date = nextDateOf(row.month, row.day);
  await haWs({ type: 'calendar/event/update', entity_id: entityId, uid, event: { summary: `${row.name} – bursdag`, dtstart: date, dtend: addDays(date, 1), rrule: 'FREQ=YEARLY', ...(row.year ? { description: `Født ${row.year}` } : {}) } });
}

/* ---------------- Mockdata ---------------- */

function seedMock(user) {
  if (!MOCK || kv.get(user, 'bd_mock_seeded')) return;
  kv.set(user, 'bd_mock_seeded', true);
  if (rowsOf(user).length) return;
  const now = Date.now();
  const ins = q('INSERT INTO birthdays(user_id,name,month,day,year,relation,reminder_days,source,person_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  for (const [n, m, d, y, rel, src] of [['Ingrid', 11, 2, 1985, 'familie', 'local'], ['Rune', 11, 17, 1962, 'familie', 'local'], ['Cybele', 1, 9, 2005, 'venn', 'local'], ['Henrik', 10, 19, 1988, 'venn', 'local']]) ins.run(user, n, m, d, y, rel, 1, src, personFor(n), now, now);
}

/* ---------------- Påminnelser (kl. 09:00, N dager før) ---------------- */

// Det finnes ingen push-tjeneste på serveren: kl. 09 norsk tid sendes en sanntidsmelding (type «birthdays») til brukerens
// åpne klienter, og hver rad har remindAt så appene kan planlegge et lokalt varsel. Kategorien «birthdays» i
// Innstillinger → Varsler slår begge av.
export function dueReminders(user, now = Date.now()) {
  const today = osloDate(now);
  return listFor(user, today).filter((x) => x.reminderDays != null && x.daysLeft === x.reminderDays);
}
function reminderTick(now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
  if (hour !== 9) return 0;
  let sent = 0;
  const today = osloDate(now);
  for (const { user_id: user } of q('SELECT DISTINCT user_id FROM birthdays WHERE reminder_days IS NOT NULL').all()) {
    if (!userInfo(user)) continue;
    const n = notifyOf(user);
    if (n.on === false || n.groups?.birthdays === false) continue;
    const done = kv.get(user, 'bd_reminded', {}) ?? {};
    const due = dueReminders(user, now).filter((x) => !done[`${x.id}:${x.nextDate}`]);
    if (!due.length) continue;
    for (const x of due) {
      done[`${x.id}:${x.nextDate}`] = today;
      const when = x.daysLeft === 0 ? 'i dag' : x.daysLeft === 1 ? 'i morgen' : `om ${x.daysLeft} dager`;
      broadcast('birthdays', { action: 'reminder', id: x.id, title: 'Bursdager', body: `${x.name} har bursdag ${when}${x.age ? ` (fyller ${x.age})` : ''}`, category: 'birthdays', url: 'finanshub://bursdager' }, [user]);
      sent++;
    }
    // Rydd gamle nøkler (eldre enn 400 dager).
    for (const [k, d] of Object.entries(done)) if (daysBetween(d, today) > 400) delete done[k];
    kv.set(user, 'bd_reminded', done);
  }
  return sent;
}
export const _reminderTick = reminderTick;

let worker = null;
export function startBirthdayWorker() {
  if (worker) return;
  let ticks = 0;
  worker = setInterval(() => {
    try { reminderTick(); } catch (e) { console.warn('[bursdager] påminnelser:', e.message); }
    if (++ticks % 15 !== 0) return; // hvert 15. minutt: Google (inkrementelt) og HA med «Synk to veier»
    for (const u of listUsers()) {
      if (gConnected(u.id)) syncGoogle(u.id).catch(() => {});
      const h = haConf(u.id);
      if (h.twoWay && h.entityId && isAdmin(u.id)) importHa(u.id).catch((e) => setHa(u.id, { error: e.message }));
    }
  }, 60_000);
  worker.unref?.();
}

/* ---------------- API ---------------- */

const api = new Hono();
const bad = (c, msg, status = 400) => c.json({ error: msg }, status);
const body = (c) => c.req.json().catch(() => ({}));
const fail = (c, e) => c.json({ error: e.message }, e.status && e.status < 600 ? e.status : 502);

// Sesjon eller app-token (header, eller ?token= på /google/auth som åpnes i nettleseren). Lesing: finance:read; endring:
// finance:read holder også, siden bursdagene er brukerens egne data (som Familie og Varsler).
const TOKEN_Q = /^fh_[A-Za-z0-9_-]{20,}$/;
const auth = async (c, next) => {
  let id = sessionUser(c);
  if (!id) {
    const t = c.req.query('token');
    if (t && TOKEN_Q.test(t) && !c.req.header('authorization') && c.req.path.endsWith('/google/auth')) c.req.raw.headers.set('authorization', `Bearer ${t}`);
    if (bearerOk(c, 'finance:read')) id = c.get('user');
  }
  if (!id || !userInfo(id)) return bad(c, 'Ikke innlogget', 401);
  c.set('user', id);
  await next();
};
const adminHa = (c) => (isAdmin(c.get('user')) ? null : c.json({ error: 'Home Assistant er serveroppsett. Bare administratorer kan importere fra og skrive til Home Assistant.', restricted: true }, 403));

function stateOut(user) {
  const items = listFor(user), g = gconf(user), h = haConf(user), client = googleClient();
  return {
    items, next: nextOf(items),
    google: { connected: !!g.refresh, configured: !!client.id || mockGoogle(), calendarId: g.calendarId ?? (g.refresh ? 'primary' : null), calendarIds: g.refresh || g.calendarIds ? calIdsOf(g) : [], email: g.email ?? null,
      writeNew: g.writeNew !== false, contacts: g.contacts !== false, syncedAt: g.syncedAt ?? null, error: g.error ?? null, mock: mockGoogle() || undefined },
    ha: { entityId: h.entityId ?? null, twoWay: !!h.twoWay, syncedAt: h.syncedAt ?? null, error: h.error ?? null, allowed: isAdmin(user), configured: !!(haBase() && haToken()) || mockHa() },
    relations: RELATIONS.map((id) => ({ id, label: RELATION_LABEL[id], color: RELATION_COLOR[id] })), reminders: [0, 1, 7, null],
  };
}

// Google-rutene (callback må være åpen: Google sender nettleseren tilbake uten app-token).
api.get('/google/callback', async (c) => {
  sweep();
  const st = pending.get(c.req.query('state') ?? '');
  if (!st) return c.html('<!doctype html><meta charset="utf-8"><title>Bursdager</title><p>Innloggingen er utløpt. Gå tilbake til appen og prøv igjen.</p>', 400);
  pending.delete(c.req.query('state'));
  if (c.req.query('error')) return c.redirect(withQuery(st.ret, { error: c.req.query('error'), google: 'error' }));
  const { id, secret } = googleClient();
  try {
    const j = await tokenCall({ grant_type: 'authorization_code', code: c.req.query('code') ?? '', client_id: id, client_secret: secret, redirect_uri: st.redirect, code_verifier: st.verifier });
    let email = null;
    try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64').toString()).email ?? null; } catch { /* uten e-post */ }
    const cur = gconf(st.user);
    const refresh = j.refresh_token ? seal(j.refresh_token) : cur.refresh;
    if (!refresh) throw new Error('Google ga ikke noe refresh-token. Fjern tilgangen under myaccount.google.com → Sikkerhet og prøv igjen.');
    setG(st.user, { refresh, email, connectedAt: new Date().toISOString(), error: null, syncToken: null, syncTokenContacts: null, calendarId: cur.calendarId ?? 'primary', scope: j.scope ? String(j.scope) : (mockGoogle() ? G_SCOPES.join(' ') : null) });
    accessCache.set(st.user, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
    syncGoogle(st.user).catch(() => {});
    return c.redirect(withQuery(st.ret, { ok: '1', google: 'ok' }));
  } catch (e) {
    return c.redirect(withQuery(st.ret, { error: e.message.slice(0, 200), google: 'error' }));
  }
});

// Åpnes i nettleseren (ASWebAuthenticationSession / Custom Tab / vanlig fane). ?code= fra POST /google/start er det
// tryggeste for appene (tokenet havner ikke i nettleserloggen); ?token= godtas også.
api.get('/google/auth', async (c, next) => {
  sweep();
  const code = c.req.query('code');
  if (code && startCodes.has(code)) { const s = startCodes.get(code); startCodes.delete(code); c.set('user', s.user); c.set('ret', s.ret); return next(); }
  return auth(c, next);
}, (c) => {
  const client = googleClient();
  if (!client.id && !mockGoogle()) return c.html('<!doctype html><meta charset="utf-8"><title>Bursdager</title><p>Google Kalender er ikke satt opp. En administrator må legge inn klient-ID og hemmelighet under Innstillinger → Integrasjoner → Google Kalender.</p>', 409);
  const verifier = b64u(randomBytes(32)), state = b64u(randomBytes(18));
  const redirect = redirectUri(c);
  let ret = c.get('ret') ?? safeReturn(c.req.query('return'), originOf(c));
  // Google godtar bare offentlige https-adresser som omdirigering. Startet innloggingen på en annen adresse (f.eks. lokal IP),
  // sendes nettleseren tilbake dit etterpå i stedet for til den offentlige adressen i omdirigerings-URI-en.
  if (ret.startsWith('/')) ret = `${originOf(c)}${ret}`;
  pending.set(state, { user: c.get('user'), verifier, ret, redirect, exp: Date.now() + 10 * 60_000 });
  if (mockGoogle()) return c.redirect(`/api/birthdays/google/callback?state=${state}&code=mock-${encodeURIComponent(c.get('user'))}`);
  const p = new URLSearchParams({ client_id: client.id, redirect_uri: redirect, response_type: 'code', scope: G_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    code_challenge: b64u(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', state });
  return c.redirect(`${G_AUTH}?${p}`);
});

api.use('*', auth);

api.get('/', (c) => { seedMock(c.get('user')); return c.json(stateOut(c.get('user'))); });
api.get('/reminders', (c) => c.json({ items: listFor(c.get('user')).filter((x) => x.remindAt).map((x) => ({ id: x.id, name: x.name, remindAt: x.remindAt, nextDate: x.nextDate, daysLeft: x.daysLeft, reminderDays: x.reminderDays, age: x.age })) }));

function input(b, cur) {
  const o = {};
  if (b.name !== undefined || !cur) { const n = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!n || /[<>]/.test(n)) return 'Skriv et navn'; o.name = n; }
  const month = b.month !== undefined ? Number(b.month) : cur?.month, day = b.day !== undefined ? Number(b.day) : cur?.day;
  if (!validDate(month, day)) return 'Ugyldig dato';
  o.month = month; o.day = day;
  if (b.year !== undefined) {
    if (b.year === null || b.year === '') o.year = null;
    else { const y = Number(b.year), ty = Number(osloDate().slice(0, 4)); if (!Number.isInteger(y) || y < 1900 || y > ty) return `Året må være mellom 1900 og ${ty}`; o.year = y; }
  }
  if (b.relation !== undefined || !cur) { const r = String(b.relation ?? 'annet').toLowerCase(); if (!RELATIONS.includes(r)) return 'Hvem må være familie, venn, jobb eller annet'; o.relation = r; }
  if (b.reminderDays !== undefined || !cur) { const v = b.reminderDays === undefined ? 1 : b.reminderDays; if (v !== null && !REMINDERS.includes(Number(v))) return 'Påminnelse må være 0, 1, 7 eller null'; o.reminder_days = v === null ? null : Number(v); }
  if (o.month === 2 && o.day === 29 && (o.year ?? cur?.year) && !isLeap(o.year ?? cur.year)) return '29. februar finnes ikke det året';
  return o;
}

api.post('/', async (c) => {
  const user = c.get('user'), b = await body(c);
  const o = input(b, null);
  if (typeof o === 'string') return bad(c, o);
  const saveTo = b.saveTo ?? 'local';
  if (!SOURCES.includes(saveTo)) return bad(c, 'saveTo må være google, ha eller local');
  if (saveTo === 'google' && !gConnected(user)) return bad(c, 'Logg inn med Google først', 409);
  if (saveTo === 'ha') { const e = adminHa(c); if (e) return e; if (!haConf(user).entityId) return bad(c, 'Velg en kalender i Home Assistant først', 409); }
  const now = Date.now();
  const r = q('INSERT INTO birthdays(user_id,name,month,day,year,relation,reminder_days,source,person_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(user, o.name, o.month, o.day, o.year ?? null, o.relation, o.reminder_days, saveTo, personFor(o.name), now, now);
  try {
    if (saveTo === 'google') await gInsert(user, r);
    if (saveTo === 'ha') await haCreate(user, r);
  } catch (e) {
    // Kilden avviste: behold bursdagen lokalt, så ingenting går tapt, og si fra.
    q("UPDATE birthdays SET source='local' WHERE id=?").run(r.id);
    return c.json({ item: itemOut(rowOf(user, r.id)), warning: `Lagret bare her: ${e.message}`, ...stateOut(user) }, 201);
  }
  if (saveTo === 'ha') importHa(user).catch(() => {}); // henter uid-en fra HA
  return c.json({ item: itemOut(rowOf(user, r.id)), ...stateOut(user) }, 201);
});

api.patch('/:id{[0-9]+}', async (c) => {
  const user = c.get('user'), cur = rowOf(user, c.req.param('id'));
  if (!cur) return bad(c, 'Fant ikke bursdagen', 404);
  const o = input(await body(c), cur);
  if (typeof o === 'string') return bad(c, o);
  const n = { ...cur, ...o };
  q('UPDATE birthdays SET name=?, month=?, day=?, year=?, relation=?, reminder_days=?, person_id=?, updated=? WHERE id=?')
    .run(n.name, n.month, n.day, n.year ?? null, n.relation, n.reminder_days ?? null, personFor(n.name) ?? null, Date.now(), cur.id);
  const row = rowOf(user, cur.id);
  let warning;
  try {
    if (row.google_event_id && gConnected(user)) await gPatch(user, row);
    if (row.source === 'ha' && isAdmin(user) && haConf(user).twoWay) await haUpdate(user, row);
  } catch (e) { warning = `Endret her, men ikke i kilden: ${e.message}`; }
  return c.json({ item: itemOut(row), ...(warning ? { warning } : {}), ...stateOut(user) });
});

// Sletter også i kilden (Google-hendelsen og HA-hendelsen). Feiler kilden, beholdes raden og feilen vises.
api.delete('/:id{[0-9]+}', async (c) => {
  const user = c.get('user'), cur = rowOf(user, c.req.param('id'));
  if (!cur) return bad(c, 'Fant ikke bursdagen', 404);
  try {
    if (cur.google_event_id && gConnected(user)) await gDelete(user, cur);
    if (cur.source === 'ha' && isAdmin(user)) await haDelete(user, cur);
  } catch (e) { return c.json({ error: `Kunne ikke slette i kilden: ${e.message}` }, 502); }
  q('DELETE FROM birthdays WHERE id=? AND user_id=?').run(cur.id, user);
  return c.json({ ok: true, ...stateOut(user) });
});

// For appene: en kortlivet kode (2 min, engangs) til /google/auth, så app-tokenet ikke legges i URL-en.
api.post('/google/start', async (c) => {
  sweep();
  const b = await body(c);
  const code = b64u(randomBytes(24));
  startCodes.set(code, { user: c.get('user'), ret: safeReturn(b.return ?? c.req.query('return'), originOf(c)), exp: Date.now() + 120_000 });
  return c.json({ url: `/api/birthdays/google/auth?code=${code}`, expiresIn: 120 });
});
api.get('/google/calendars', async (c) => {
  const user = c.get('user');
  if (!gConnected(user)) return bad(c, 'Logg inn med Google først', 409);
  try {
    const r = await gapi(user, 'GET', '/users/me/calendarList', { query: { minAccessRole: 'reader' } });
    if (!r.ok) throw gfail(r, 'Kunne ikke hente kalendere');
    const sel = calIdsOf(gconf(user));
    return c.json({ items: (r.json?.items ?? []).map((x) => ({ id: x.primary ? 'primary' : x.id, googleId: x.id, name: x.summaryOverride ?? x.summary ?? x.id, primary: !!x.primary, writable: ['owner', 'writer'].includes(x.accessRole), selected: sel.includes(x.primary ? 'primary' : x.id), color: x.backgroundColor ?? null })) });
  } catch (e) { return fail(c, e); }
});
api.put('/google', async (c) => {
  const user = c.get('user'), b = await body(c), patch = {};
  if (b.calendarId !== undefined) { const id = String(b.calendarId ?? '').trim(); if (!id || id.length > 300) return bad(c, 'Ugyldig kalender'); if (id !== gconf(user).calendarId) Object.assign(patch, { calendarId: id, syncToken: null, calendarIds: [id] }); }
  // Prompt 35: «velg flere kalendere» – calendarIds (eller cals) er en liste, minst én; calendarId = første.
  const many = b.calendarIds ?? b.cals;
  if (many !== undefined) {
    if (!Array.isArray(many) || !many.length || many.length > 20 || many.some((x) => typeof x !== 'string' || !x.trim() || x.length > 300)) return bad(c, 'Velg minst én kalender (calendarIds)');
    const ids = [...new Set(many.map((x) => x.trim()))];
    delete patch.calendarIds; delete patch.calendarId;
    if (JSON.stringify(ids) !== JSON.stringify(calIdsOf(gconf(user)))) Object.assign(patch, { calendarIds: ids, calendarId: ids[0], syncToken: null });
  }
  for (const k of ['writeNew', 'contacts']) if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') return bad(c, `${k} må være true/false`); patch[k] = b[k]; if (k === 'contacts') patch.syncTokenContacts = null; }
  setG(user, patch);
  if (gConnected(user) && (patch.calendarId || patch.calendarIds || patch.contacts !== undefined)) await syncGoogle(user, { full: true });
  return c.json(stateOut(user));
});
api.post('/google/sync', async (c) => {
  const user = c.get('user');
  if (!gConnected(user)) return bad(c, 'Logg inn med Google først', 409);
  const r = await syncGoogle(user, { full: (await body(c)).full === true });
  return c.json({ ...r, ...stateOut(user) }, r.ok ? 200 : 502);
});
// Logg ut: trekker tilbake tokenet hos Google og glemmer det. Bursdagene beholdes (som lokale), ingenting slettes.
api.delete('/google', async (c) => {
  const user = c.get('user'), refresh = unseal(gconf(user).refresh);
  if (refresh) await fetchG(`${G_REVOKE}?token=${encodeURIComponent(refresh)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => {});
  accessCache.delete(user);
  setG(user, { refresh: null, email: null, syncToken: null, syncTokenContacts: null, syncedAt: null, error: null });
  q("UPDATE birthdays SET source='local' WHERE user_id=? AND source='google'").run(user);
  q('UPDATE birthdays SET google_event_id=NULL, google_cal=NULL WHERE user_id=?').run(user);
  return c.json(stateOut(user));
});

api.get('/ha/calendars', async (c) => {
  const e = adminHa(c); if (e) return e;
  try { const sel = haConf(c.get('user')).entityId; return c.json({ items: (await haCalendars()).map((x) => ({ ...x, selected: x.entityId === sel })) }); } catch (err) { return fail(c, err); }
});
api.put('/ha', async (c) => {
  const e = adminHa(c); if (e) return e;
  const user = c.get('user'), b = await body(c), patch = {};
  if (b.entityId !== undefined) { if (b.entityId !== null && !/^calendar\.[a-z0-9_]{1,80}$/.test(String(b.entityId))) return bad(c, 'Velg en calendar.*-entitet'); patch.entityId = b.entityId; }
  if (b.twoWay !== undefined) { if (typeof b.twoWay !== 'boolean') return bad(c, 'twoWay må være true/false'); patch.twoWay = b.twoWay; }
  setHa(user, patch);
  return c.json(stateOut(user));
});
api.post('/ha/import', async (c) => {
  const e = adminHa(c); if (e) return e;
  try { const r = await importHa(c.get('user')); return c.json({ ...r, ...stateOut(c.get('user')) }); } catch (err) { setHa(c.get('user'), { error: err.message }); return fail(c, err); }
});

/** Kompakt svar for widgets (WidgetKit, Glance og Hjem): de tre neste og «neste bursdag». */
export function widgetOut(user) {
  seedMock(user);
  const items = listFor(user);
  const short = (x) => ({ id: x.id, name: x.name, month: x.month, day: x.day, year: x.year, nextDate: x.nextDate, date: x.nextDate, dateText: x.dateText, daysLeft: x.daysLeft, soon: x.daysLeft <= 7, today: x.today, age: x.age,
    relation: x.relation, color: x.color, initials: x.initials, avatarUrl: x.avatarUrl, source: x.source });
  const nx = nextOf(items);
  return { updatedAt: new Date().toISOString(), count: items.length, deepLink: 'finanshub://bursdager', addLink: 'finanshub://bursdager/ny',
    next: nx && { names: nx.names, label: nx.label, date: nx.date, dateText: nx.dateText, dateLong: nx.dateLong, daysLeft: nx.daysLeft, today: nx.today, age: nx.age },
    items: items.slice(0, 3).map(short) };
}

export default api;
