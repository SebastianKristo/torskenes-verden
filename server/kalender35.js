// Prompt 35 (SERVER35): egne kalendere fra iCal-abonnement og Home Assistant i Kalender-appen (og Homelab/web/widgets).
// Per bruker (kv 'kal35_ext'). Hendelsene kommer med i alle hendelseslister (calendar.js eventsFor, via addEventSource) med
// appCalendar = kalenderens id og appColor = fargen. Kalendrene står i GET /api/kalender/calendars med source/badge.
//
// POST   /api/kalender/calendars/ical {url:'webcal://…'|'https://…ics', name?, color?} → 201 {calendar}
//        webcal:// → https://. Hentes med en gang (400 {error} hvis lenken ikke gir en kalender), så hver time i bakgrunnen
//        med ETag / If-Modified-Since. Navn: name, ellers X-WR-CALNAME, ellers gjettet fra domenet.
// POST   /api/kalender/calendars/ical/:id/refresh → {calendar}   (hent nå)
// GET    /api/kalender/ha/calendars → {connected, allowed, entities:[{entity_id, name, added}]}  (calendar.* fra HA /api/calendars)
// POST   /api/kalender/calendars/ha {entities:['calendar.familie', …], colors?:{entity_id:'#rrggbb'}} → {calendars:[…]}
//        Farger fordeles automatisk når de mangler. Home Assistant er serveroppsett: bare administratorer (403 ellers).
// PATCH  /api/kalender/calendars/:id {name?, color?, visible?, hidMenu?} og DELETE /api/kalender/calendars/:id virker også
//        for 'ical-…' og 'ha-…' (kalender33.js sender dem hit).
// calendar = {id:'ical-…'|'ha-…', key, name, color, textColor, lightColor, visible, hidMenu, builtin:false, writable:false,
//             source:'ical'|'ha', badge:'Abonnement'|'HA', url?, entity?, fetchedAt, error, count}
import { Hono } from 'hono';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { db, kv } from './db.js';
import { config } from './config.js';
import { authOrToken } from './mobile.js';
import { isAdmin } from './auth.js';
import { cfg, runAsUser } from './settings.js';
import { cached } from './cache.js';
import { addEventSource, typeOf } from './calendar.js';
import { parseIcs, expandIcs } from './ical-expand.js';
import { safeUrl } from './glimt35.js';

const MOCK = () => process.env.MOCK_DATA === '1';
export const PALETTE = ['#b23a2a', '#e8794a', '#a8661a', '#c9a227', '#2f7a4f', '#3d7f8a', '#2b5d8a', '#5b4fc4', '#8a3fa0', '#c2477a', '#6b665c', '#1b1a17'];
const COLOR = /^#[0-9a-f]{6}$/i;
const BUILTIN_COLORS = ['#b23a2a', '#2b5d8a', '#2f7a4f', '#a8661a', '#3d7f8a', '#8a3fa0']; // innebygde i kalender33.js
const MAX_EXT = 30;
const pad = (n) => String(n).padStart(2, '0');
const hashOf = (s) => createHash('sha1').update(String(s)).digest('hex');

let F = (u, i) => fetch(u, i), injected = false;
/** Bare for tester. */
export const _setKal35Fetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); injected = !!fn; };

const store = (u) => { const v = kv.get(u, 'kal35_ext', null) ?? {}; return { ical: Array.isArray(v.ical) ? v.ical : [], ha: Array.isArray(v.ha) ? v.ha : [] }; };
const save = (u, s) => kv.set(u, 'kal35_ext', s);
const icsFile = (id) => join(config.dataDir, 'ical35', `${id.replace(/[^\w-]/g, '')}.ics`);
export const isExtId = (id) => /^(ical|ha)-[\w.-]+$/.test(String(id ?? ''));

/** Tekstfarger fra fargen (mørk tx = 28 % mot svart, lys lt = 45 % mot hvit). */
export function shades(hex) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const mix = (t, f) => `#${c.map((v) => Math.round(v + (t - v) * f).toString(16).padStart(2, '0')).join('')}`;
  return { textColor: mix(0, 0.28), lightColor: mix(255, 0.45) };
}
const calOut = (x, source) => ({ id: x.id, key: x.id, name: x.name, color: x.color, ...shades(x.color), backend: source, sources: [source], visible: x.visible !== false, hidMenu: !!x.hidMenu,
  builtin: false, writable: false, source, badge: source === 'ical' ? 'Abonnement' : 'HA', ...(source === 'ical' ? { url: x.url } : { entity: x.entity }),
  fetchedAt: x.fetchedAt ? new Date(x.fetchedAt).toISOString() : null, error: x.error ?? null });
/** iCal- og HA-kalendrene til u (samme form som appCalendarsOf). */
export function extCalendarsOf(u) { const s = store(u); return [...s.ical.map((x) => calOut(x, 'ical')), ...s.ha.map((x) => calOut(x, 'ha'))]; }
const nextColor = (u, used = []) => { const taken = new Set([...BUILTIN_COLORS, ...extCalendarsOf(u).map((c) => c.color), ...used]); return PALETTE.find((c) => !taken.has(c)) ?? PALETTE[(extCalendarsOf(u).length + used.length) % PALETTE.length]; };

/* ---------------- iCal ---------------- */

export function normalizeIcalUrl(raw) {
  const s = String(raw ?? '').trim().replace(/^webcals?:\/\//i, 'https://');
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && !u.username ? u.href : null; } catch { return null; }
}
export function guessName(url) {
  try {
    const host = new URL(url).hostname.replace(/^(www|calendar|cal|ics|ical|kalender)\./i, '');
    const w = host.split('.').slice(0, -1).pop() ?? host;
    return w.charAt(0).toUpperCase() + w.slice(1);
  } catch { return 'Abonnement'; }
}
function mockIcs(url) {
  const d = new Date(), y = d.getUTCFullYear(), m = pad(d.getUTCMonth() + 1), day = pad(d.getUTCDate());
  const sat = new Date(d.getTime() + ((6 - d.getUTCDay() + 7) % 7 || 7) * 86400_000).toISOString().slice(0, 10).replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homelab//mock//NO', `X-WR-CALNAME:${guessName(url)}`, 'X-WR-TIMEZONE:Europe/Oslo',
    'BEGIN:VEVENT', 'UID:mock-trening@homelab', `DTSTART;TZID=Europe/Oslo:${y}${m}${day}T180000`, `DTEND;TZID=Europe/Oslo:${y}${m}${day}T193000`, 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=20', 'SUMMARY:Trening', 'LOCATION:Bislett', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:mock-turnering@homelab', `DTSTART;VALUE=DATE:${sat}`, 'SUMMARY:Turnering', 'END:VEVENT',
    'END:VCALENDAR', ''].join('\r\n');
}
/** Henter lenken (ETag/If-Modified-Since). → {text|null (304), etag, lastModified} */
async function fetchIcs(url, meta = {}, admin = true) {
  if (MOCK() && !injected) return { text: mockIcs(url), etag: null, lastModified: null };
  if (!injected && !admin && !(await safeUrl(url))) throw new Error('Lenken peker til en privat adresse');
  const headers = { 'User-Agent': 'homelab-os kalender', Accept: 'text/calendar, */*' };
  if (meta.etag) headers['If-None-Match'] = meta.etag;
  if (meta.lastModified) headers['If-Modified-Since'] = meta.lastModified;
  let r;
  try { r = await F(url, { headers, signal: AbortSignal.timeout(15_000) }); } catch (e) { throw new Error(`Fikk ikke kontakt (${e.cause?.code ?? e.name})`); }
  if (r.status === 304) return { text: null, etag: meta.etag, lastModified: meta.lastModified };
  if (!r.ok) throw new Error(`Serveren svarte ${r.status}`);
  const text = await r.text();
  if (text.length > 15 * 1024 * 1024) throw new Error('Kalenderen er for stor');
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Lenken ga ikke en iCal-kalender (.ics)');
  return { text, etag: r.headers.get('etag'), lastModified: r.headers.get('last-modified') };
}
const parsedCache = new Map(); // id → {at, cal}
function parsedOf(id) {
  const f = icsFile(id);
  if (!existsSync(f)) return null;
  const p = parsedCache.get(id);
  if (p) return p.cal;
  const cal = parseIcs(readFileSync(f, 'utf8'));
  parsedCache.set(id, { cal });
  return cal;
}
/** Henter én iCal-kalender på nytt. → oppdatert rad */
export async function refreshIcal(u, id) {
  const s = store(u), x = s.ical.find((c) => c.id === id);
  if (!x) return null;
  try {
    const r = await fetchIcs(x.url, x, isAdmin(u));
    if (r.text != null) { mkdirSync(join(config.dataDir, 'ical35'), { recursive: true }); writeFileSync(icsFile(id), r.text); parsedCache.delete(id); }
    Object.assign(x, { etag: r.etag ?? null, lastModified: r.lastModified ?? null, fetchedAt: Date.now(), error: null });
  } catch (e) { x.error = e.message; x.fetchedAt = Date.now(); }
  const cur = store(u); cur.ical = cur.ical.map((c) => (c.id === id ? { ...c, ...x } : c)); save(u, cur);
  return x;
}
export async function addIcal(u, b) {
  const url = normalizeIcalUrl(b?.url);
  if (!url) return { error: 'Skriv en iCal-lenke (webcal:// eller https://…ics)' };
  if (b.color !== undefined && !COLOR.test(String(b.color))) return { error: 'Farge må være #rrggbb' };
  const s = store(u);
  if (s.ical.length + s.ha.length >= MAX_EXT) return { error: `Du kan ha maks ${MAX_EXT} abonnementer` };
  if (s.ical.some((c) => c.url === url)) return { error: 'Du abonnerer allerede på denne kalenderen', status: 409 };
  let r;
  try { r = await fetchIcs(url, {}, isAdmin(u)); } catch (e) { return { error: `Fikk ikke hentet kalenderen: ${e.message}` }; }
  const id = `ical-${randomBytes(5).toString('hex')}`;
  mkdirSync(join(config.dataDir, 'ical35'), { recursive: true });
  writeFileSync(icsFile(id), r.text);
  const calName = r.text.match(/^X-WR-CALNAME:(.+)$/im)?.[1]?.trim();
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || calName?.slice(0, 40) || guessName(url);
  const row = { id, url, name, color: (b.color ?? nextColor(u)).toLowerCase(), visible: true, hidMenu: false, created: Date.now(), etag: r.etag ?? null, lastModified: r.lastModified ?? null, fetchedAt: Date.now(), error: null };
  save(u, { ...s, ical: [...s.ical, row] });
  return { calendar: calOut(row, 'ical') };
}

/* ---------------- Home Assistant ---------------- */

const haBase = () => String(cfg('ha_url') || '').replace(/\/+$/, '');
const haToken = () => cfg('ha_token') || '';
const mockHa = () => MOCK() && !injected && !haToken();
const MOCK_HA = [['calendar.familie', 'Familie (HA)'], ['calendar.soppeltomming', 'Søppeltømming'], ['calendar.skoleferier', 'Skoleferier'], ['calendar.jobb_vakter', 'Vaktliste']];
async function haGet(path) {
  let r;
  try { r = await F(`${haBase()}${path}`, { headers: { Authorization: `Bearer ${haToken()}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }); }
  catch (e) { throw new Error(`Fikk ikke kontakt med Home Assistant (${e.cause?.code ?? e.name})`); }
  if (r.status === 401 || r.status === 403) throw new Error('Home Assistant avviste tokenet (401)');
  if (!r.ok) throw new Error(`Home Assistant svarte ${r.status}`);
  return r.json();
}
export async function haEntities(u) {
  if (mockHa()) return { connected: true, mock: true, list: MOCK_HA.map(([entity_id, name]) => ({ entity_id, name })) };
  if (!haBase() || !haToken()) return { connected: false, list: [] };
  const list = await haGet('/api/calendars');
  return { connected: true, list: (Array.isArray(list) ? list : []).filter((x) => /^calendar\./.test(x.entity_id ?? '')).map((x) => ({ entity_id: x.entity_id, name: x.name ?? x.entity_id })) };
}
export async function addHa(u, b) {
  if (!isAdmin(u)) return { error: 'Home Assistant er serveroppsett. Bare administratorer kan legge til kalendere fra Home Assistant.', status: 403 };
  const want = Array.isArray(b?.entities) ? [...new Set(b.entities.map(String))] : null;
  if (!want?.length) return { error: 'Velg minst én kalender (entities)' };
  const colors = b.colors && typeof b.colors === 'object' ? b.colors : {};
  for (const v of Object.values(colors)) if (!COLOR.test(String(v))) return { error: 'Farge må være #rrggbb' };
  let ents;
  try { ents = await haEntities(u); } catch (e) { return { error: e.message, status: 502 }; }
  if (!ents.connected) return { error: 'Home Assistant er ikke koblet til (Innstillinger → Integrasjoner)', status: 409 };
  const s = store(u), used = [], added = [];
  for (const e of want) {
    const ent = ents.list.find((x) => x.entity_id === e);
    if (!ent) return { error: `Fant ikke ${e} i Home Assistant`, status: 404 };
    if (s.ha.some((x) => x.entity === e)) continue;
    if (s.ical.length + s.ha.length >= MAX_EXT) return { error: `Du kan ha maks ${MAX_EXT} abonnementer` };
    const color = (colors[e] ?? nextColor(u, used)).toLowerCase(); used.push(color);
    const row = { id: `ha-${e.replace(/^calendar\./, '').replace(/[^\w-]/g, '').slice(0, 40) || hashOf(e).slice(0, 8)}`, entity: e, name: ent.name.slice(0, 40), color, visible: true, hidMenu: false, created: Date.now() };
    if (s.ha.some((x) => x.id === row.id)) row.id += `-${hashOf(e).slice(0, 4)}`;
    s.ha.push(row); added.push(row.id);
  }
  save(u, s);
  return { calendars: extCalendarsOf(u).filter((c) => c.source === 'ha') };
}
async function haEvents(row, fromMs, toMs) {
  if (mockHa()) {
    const out = [];
    for (let t = fromMs; t < toMs; t += 86400_000) {
      const d = new Date(t).toISOString().slice(0, 10), wd = new Date(t).getUTCDay();
      if (row.entity === 'calendar.soppeltomming' && wd === 3) out.push({ summary: 'Restavfall', start: { date: d }, end: { date: d }, uid: `m-${d}` });
      if (row.entity === 'calendar.familie' && wd === 0) out.push({ summary: 'Søndagsmiddag hos mormor', start: { dateTime: `${d}T15:00:00+01:00` }, end: { dateTime: `${d}T18:00:00+01:00` }, uid: `f-${d}` });
      if (row.entity === 'calendar.jobb_vakter' && wd === 5) out.push({ summary: 'Kveldsvakt', start: { dateTime: `${d}T16:00:00+01:00` }, end: { dateTime: `${d}T22:00:00+01:00` }, uid: `v-${d}` });
    }
    return out;
  }
  if (!haBase() || !haToken()) return [];
  const key = `kal35:ha:${row.entity}:${Math.floor(fromMs / 3600_000)}:${Math.floor(toMs / 3600_000)}`;
  return cached(key, 15 * 60_000, () => haGet(`/api/calendars/${encodeURIComponent(row.entity)}?start=${encodeURIComponent(new Date(fromMs).toISOString())}&end=${encodeURIComponent(new Date(toMs).toISOString())}`));
}

/* ---------------- Felles ---------------- */

export function patchExt(u, id, b) {
  const s = store(u), list = id.startsWith('ical-') ? s.ical : s.ha, x = list.find((c) => c.id === id);
  if (!x) return { error: 'Fant ikke kalenderen', status: 404 };
  if (b.name !== undefined) { const n = String(b.name ?? '').replace(/\s+/g, ' ').trim(); if (!n || n.length > 40) return { error: 'Navnet må være 1–40 tegn' }; x.name = n; }
  if (b.color !== undefined) { if (!COLOR.test(String(b.color))) return { error: 'Farge må være #rrggbb' }; x.color = b.color.toLowerCase(); }
  for (const k of ['visible', 'hidMenu']) if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') return { error: `${k} må være true eller false` }; x[k] = b[k]; }
  save(u, s);
  return { calendar: extCalendarsOf(u).find((c) => c.id === id) };
}
export function removeExt(u, id) {
  const s = store(u);
  const n = s.ical.length + s.ha.length;
  s.ical = s.ical.filter((c) => c.id !== id); s.ha = s.ha.filter((c) => c.id !== id);
  if (s.ical.length + s.ha.length === n) return false;
  save(u, s);
  try { if (id.startsWith('ical-') && existsSync(icsFile(id))) unlinkSync(icsFile(id)); } catch { /* */ }
  parsedCache.delete(id);
  return true;
}

const OSLO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const oslo = (ms) => { const p = Object.fromEntries(OSLO.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` }; };
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
function evOut(cal, src, { uid, title, allDay, date, endDate, startMs, endMs, room = '', desc = '' }) {
  const t = title || '(uten tittel)';
  const s = allDay ? null : oslo(startMs), e = allDay ? null : oslo(endMs);
  const d = allDay ? date : s.date;
  const key = allDay ? d.replace(/-/g, '') : `${d.replace(/-/g, '')}T${s.hm.replace(':', '')}`;
  const dur = allDay ? 0 : endMs - startMs;
  return { id: `${cal.id}-${hashOf(uid || t).slice(0, 10)}-${key}`, title: t, short: t.length > 18 ? `${t.slice(0, 17)}…` : t, subject: null, room, teacher: '', note: String(desc).trim().slice(0, 500) || null,
    start: allDay ? d : new Date(startMs).toISOString(), end: allDay ? (endDate && endDate > d ? endDate : addDays(d, 1)) : new Date(endMs).toISOString(),
    allDay, date: d, time: allDay ? null : dur === 0 ? s.hm : `${s.hm}–${e.hm}`, inAllDayRow: allDay || dur === 0,
    type: typeOf({ title: t, allDay, source: 'google', durationMs: dur }), color: cal.color, source: src, calendar: cal.id, editable: false, reminder: 'none', extCalendar: cal.id, origin: cal.name };
}
/** Hendelsene fra iCal/HA-kalenderne i [fromMs, toMs). */
export async function extEvents(u, fromMs, toMs) {
  const s = store(u), out = [];
  for (const x of s.ical) {
    try { const cal = parsedOf(x.id); if (!cal) continue; for (const i of expandIcs(cal, fromMs, toMs)) out.push(evOut(x, 'ical35', { uid: i.uid, title: i.summary, allDay: i.allDay, date: i.date, endDate: i.endDate, startMs: i.startMs, endMs: i.endMs, room: i.location ?? '', desc: i.description ?? '' })); }
    catch (e) { console.warn('[kalender35] iCal', x.id, e.message); }
  }
  for (const x of s.ha) {
    try {
      for (const h of await haEvents(x, fromMs, toMs)) {
        const allDay = !!h.start?.date;
        const startMs = allDay ? Date.parse(`${h.start.date}T00:00:00Z`) : Date.parse(h.start?.dateTime ?? h.start);
        const endMs = allDay ? Date.parse(`${h.end?.date ?? h.start.date}T00:00:00Z`) : Date.parse(h.end?.dateTime ?? h.end ?? h.start?.dateTime);
        if (!Number.isFinite(startMs)) continue;
        out.push(evOut(x, 'ha', { uid: h.uid ?? `${h.summary}|${startMs}`, title: h.summary, allDay, date: allDay ? h.start.date : null, endDate: allDay ? h.end?.date : null, startMs, endMs: Number.isFinite(endMs) ? endMs : startMs, room: h.location ?? '', desc: h.description ?? '' }));
      }
    } catch (e) { console.warn('[kalender35] HA', x.entity, e.message); }
  }
  return out;
}
addEventSource(async (user, fromDate, toDate, fromMs, toMs) => {
  const s = store(user);
  if (!s.ical.length && !s.ha.length) return null;
  return { id: 'ext35', name: 'Abonnementer (iCal/HA)', events: await runAsUser(user, () => extEvents(user, fromMs, toMs)) };
});

/** Hver time: alle iCal-abonnementer hentes på nytt (ETag / If-Modified-Since). */
export async function refreshAllIcal() {
  let n = 0;
  for (const { id } of db.prepare('SELECT id FROM users').all()) for (const x of store(id).ical) { await refreshIcal(id, x.id); n++; }
  return n;
}
if (process.env.NODE_ENV !== 'test') setInterval(() => { refreshAllIcal().catch((e) => console.warn('[kalender35]', e.message)); }, 3600_000).unref?.();

/* ---------------- Ruter ---------------- */

export const haApi = new Hono();
haApi.use('*', authOrToken);
haApi.get('/calendars', async (c) => {
  const u = c.get('user');
  if (!isAdmin(u)) return c.json({ connected: !!(haBase() && haToken()) || mockHa(), allowed: false, entities: [], error: 'Bare administratorer kan legge til kalendere fra Home Assistant.' });
  try {
    const r = await runAsUser(u, () => haEntities(u));
    const have = new Set(store(u).ha.map((x) => x.entity));
    return c.json({ connected: r.connected, allowed: true, ...(r.mock ? { mock: true } : {}), entities: r.list.map((x) => ({ ...x, added: have.has(x.entity_id) })) });
  } catch (e) { return c.json({ connected: false, allowed: true, entities: [], error: e.message }); }
});
/** Monteres på calendarsApi i kalender33.js (før /:id). */
export function mountExt(api) {
  api.post('/ical', async (c) => {
    const r = await addIcal(c.get('user'), await c.req.json().catch(() => ({})));
    return r.error ? c.json({ error: r.error }, r.status ?? 400) : c.json(r, 201);
  });
  api.post('/ical/:id/refresh', async (c) => {
    const u = c.get('user'), x = await refreshIcal(u, c.req.param('id'));
    return x ? c.json({ calendar: extCalendarsOf(u).find((k) => k.id === x.id) }) : c.json({ error: 'Fant ikke kalenderen' }, 404);
  });
  api.post('/ha', async (c) => {
    const u = c.get('user');
    const r = await runAsUser(u, async () => addHa(u, await c.req.json().catch(() => ({}))));
    return r.error ? c.json({ error: r.error }, r.status ?? 400) : c.json(r);
  });
}
