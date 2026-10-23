// Prompt 45 (SERVER45): små serverdeler – Vær «Min posisjon», Gjøremål-synk som rad (Innstillinger → Gjøremål) og Innstillinger samlet.
//   GET /api/weather/here?lat=&lon=[&selLat=&selLon=] → {label, place, now, today, sameAsSelected, distanceKm, updatedAt, refreshAfterSec}
//        Posisjonen kommer fra enheten som har appen åpen; den lagres ikke (avrundes til ~100 m før oppslag og cache).
//   GET /api/tasks/ha/summary → {enabled, linked, lists, syncedAt, syncedText, text, settings, canEdit}  (alle innloggede; endring fortsatt bare admin)
//   GET /api/settings/sections → {sections:[{id, title, icon, color, route, items, api}]}  (én seksjon per modul, admin-sider skjult for andre)
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { authOrToken } from './mobile.js';
import { isAdmin } from './auth.js';
import { weatherFull, iconOf, wmoText } from './weather-full.js';
import { indexFor } from './settings-ask30.js';

const q = (sql) => db.prepare(sql);
const MOCK = () => process.env.MOCK_DATA === '1';

/* ---------------- Vær: Min posisjon ---------------- */

const KNOWN = [['Oslo', 59.9139, 10.7522], ['Majorstuen', 59.9296, 10.7146], ['Grünerløkka', 59.9235, 10.7590], ['Frogner', 59.9201, 10.7067], ['Bergen', 60.3913, 5.3221], ['Trondheim', 63.4305, 10.3951], ['Tromsø', 69.6492, 18.9553], ['Hafjell', 61.2331, 10.4372], ['Stavanger', 58.9700, 5.7331], ['Kristiansand', 58.1467, 7.9956]];
const km = (a, b, c, d) => { const R = 6371, x = ((c - a) * Math.PI) / 180, y = ((d - b) * Math.PI) / 180; const h = Math.sin(x / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const nearestKnown = (lat, lon) => KNOWN.map(([n, a, b]) => [n, km(lat, lon, a, b)]).sort((x, y) => x[1] - y[1])[0];
const geoCache = new Map(); let lastGeo = 0;
let fetchGeo = null;
/** Bare for tester: erstatter omvendt geokoding (lat, lon) → navn. */
export const _setHereGeo45 = (fn) => { fetchGeo = fn; geoCache.clear(); };
async function placeName(lat, lon) {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (geoCache.has(k)) return geoCache.get(k);
  let name = null;
  if (fetchGeo) name = await fetchGeo(lat, lon).catch(() => null);
  else if (!MOCK() && Date.now() - lastGeo > 1100) {
    lastGeo = Date.now();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=nb&lat=${lat}&lon=${lon}`, { headers: { 'User-Agent': 'homelab-os (vær min posisjon)', Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      const a = r.ok ? (await r.json())?.address ?? {} : {};
      name = a.suburb ?? a.city_district ?? a.village ?? a.town ?? a.city ?? a.municipality ?? null;
    } catch { /* faller tilbake */ }
  }
  if (!name) { const [n, d] = nearestKnown(lat, lon); name = d < 15 ? n : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`; }
  if (geoCache.size > 500) geoCache.clear();
  geoCache.set(k, name);
  return name;
}
export async function weatherHere45(lat, lon, sel = null) {
  const la = Math.round(lat * 1000) / 1000, lo = Math.round(lon * 1000) / 1000;
  const [w, name] = await Promise.all([weatherFull({ lat: la, lon: lo, name: 'Min posisjon' }), placeName(la, lo)]);
  const cur = w.current ?? {}, code = cur.code ?? 0;
  const dist = sel ? Math.round(km(la, lo, sel.lat, sel.lon) * 10) / 10 : null;
  return { label: 'MIN POSISJON', place: { name, lat: la, lon: lo }, now: { temp: cur.temp ?? null, text: cur.text ?? wmoText(code), code, icon: iconOf(code), isDay: cur.isDay !== false, wind: cur.wind ?? null },
    today: { hi: w.today?.hi ?? null, lo: w.today?.lo ?? null, precipProb: w.today?.precipProb ?? null }, sameAsSelected: dist != null && dist <= 2, distanceKm: dist,
    source: w.source ?? null, updatedAt: new Date().toISOString(), refreshAfterSec: 600 };
}
export const weather45Api = new Hono();
weather45Api.get('/here', authOrToken, async (c) => {
  const lat = Number(c.req.query('lat')), lon = Number(c.req.query('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || c.req.query('lat') === '' || c.req.query('lon') === '') return c.json({ error: 'Mangler gyldig posisjon (lat, lon)', needsPermission: true, text: 'Slå på posisjon for å se været der du er', button: 'Tillat' }, 400);
  const sl = Number(c.req.query('selLat')), sn = Number(c.req.query('selLon'));
  try { return c.json(await weatherHere45(lat, lon, Number.isFinite(sl) && Number.isFinite(sn) && c.req.query('selLat') ? { lat: sl, lon: sn } : null), 200, { 'Cache-Control': 'private, max-age=300' }); }
  catch (e) { return c.json({ error: `Fikk ikke hentet været: ${e.message}` }, 502); }
});

/* ---------------- Gjøremål: synk-raden ---------------- */

const hm = (t) => new Date(t).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
export function tasksHaSummary45(u) {
  const conf = { enabled: false, syncedAt: null, ...(kv.get(OWNER, 'huske_ha', {}) ?? {}) };
  let rows = [];
  try { rows = q(`SELECT m.list_id, m.entity_id, l.name FROM huske_ha_map m LEFT JOIN hl_task_lists l ON l.id = m.list_id WHERE l.owner=? OR l.id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?) OR ?`).all(u, u, isAdmin(u) ? 1 : 0); } catch { rows = []; }
  const synced = conf.syncedAt ? Number(conf.syncedAt) || Date.parse(conf.syncedAt) : null;
  const sameDay = synced && new Date(synced).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }) === new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const syncedText = synced ? `Synket ${sameDay ? hm(synced) : new Date(synced).toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short' })}` : conf.enabled ? 'Ikke synket ennå' : 'Av';
  return { enabled: !!conf.enabled, linked: rows.length, lists: rows.map((r) => ({ listId: r.list_id, name: r.name ?? null, entityId: r.entity_id })), syncedAt: synced ? new Date(synced).toISOString() : null, syncedText,
    text: `Synk med Home Assistant · ${conf.enabled ? syncedText : 'av'}`, hint: 'endres i Innstillinger → Gjøremål', settings: { web: '#/innstillinger/gjoremal', mobile: '#/set/huske', detail: 'huske', event: 'papir-open-settings' }, canEdit: isAdmin(u),
    integrationText: rows.length ? `Gjøremål: ${rows.length} ${rows.length === 1 ? 'liste' : 'lister'} koblet` : 'Gjøremål: ingen lister koblet' };
}
export const tasks45Api = new Hono();
tasks45Api.get('/ha/summary', authOrToken, (c) => c.json(tasksHaSummary45(c.get('user'))));

/* ---------------- Innstillinger samlet ---------------- */

// Én seksjon per modul (claude-code-innstillinger-samlet.md, Innstillinger Web.dc.html). items = oppføringer fra søkeindeksen med samme prefiks.
const SECTIONS = [
  ['media', 'Media', 'film', '#35c5f4', 'media', 'media', ['/api/media/servers', '/api/media/settings', '/api/playback/status']],
  ['gjoremal', 'Gjøremål', 'check', '#b23a2a', 'gjoremal', 'huske', ['/api/tasks/ha', '/api/tasks/ha/summary', '/api/tasks/lists/order', '/api/tasks/glimt/tips']],
  ['kalendere', 'Kalender', 'cal', '#2f7d4f', 'kal', 'kal', ['/api/calendars']],
  ['ruter', 'Ruter', 'bus', '#e05a2b', 'ruter', 'ruter', ['/api/ruter/settings', '/api/ruter/my-routes']],
  ['vaer', 'Vær', 'sun', '#2b6cb0', 'vaer', 'vaer', ['/api/weather/layout']],
  ['finans', 'Finans', 'bank', '#2f7a4f', 'finans', 'finans', []],
  ['studie', 'Studie', 'book', '#7a5ad6', 'studie', 'studie', ['/api/study/documents']],
  ['familie', 'Familie', 'users', '#a8456b', 'familie', 'familie', ['/api/family/zone-alerts', '/api/family/health/ha']],
  ['helse', 'Helse (Familie)', 'heart', '#c0392b', 'helse', 'helse', ['/api/family/health/ha']],
  ['ai', 'Glimt og AI', 'ai', '#7a3b6b', 'ai', 'ai', ['/api/ai/import/sources', '/api/glimt/settings']],
  ['varsler', 'Varsler', 'bell', '#b23a2a', 'varsel', 'varsler', ['/api/me/notify', '/api/family/zone-alerts']],
  ['server', 'Server', 'sys', '#6b6558', 'system', 'oppd', ['/api/system/update', '/api/system/containers', '/api/system/docker/setup'], true],
];
export function settingsSections45(u) {
  const admin = isAdmin(u), idx = indexFor(admin);
  return { sections: SECTIONS.filter((s) => admin || !s[7]).map(([id, title, icon, color, web, mobile, api, adm]) => ({ id, title, icon, color, route: { web: `#/innstillinger/${web}`, mobile: `#/set/${mobile}` },
    items: idx.filter((x) => x.id === id || x.id.startsWith(`${id}.`)).map((x) => ({ id: x.id, title: x.title, path: x.path, route: x.route, anchor: x.anchor ?? null })), api, ...(adm ? { admin: true } : {}) })) };
}
export const settings45Api = new Hono();
settings45Api.get('/sections', authOrToken, (c) => c.json(settingsSections45(c.get('user'))));
