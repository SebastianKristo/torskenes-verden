// Tema per bruker (synket mellom enheter, automatisk etter sola eller klokka). Før i webx51.js; montert fra system/index.js.
//   GET/PUT /api/me/theme51 → {mode:'light'|'dark'|'system'|'auto', auto:{by:'sun'|'time', lightAt, darkAt, place}, palette, updatedAt,
//                              effective, next:{at, mode}|null, sun}   (PUT med eldre updatedAt → 409 med det lagrede)
// Posisjonen til «etter sola» kommer fra Familie (siste kjente posisjon), ellers et valgt sted, ellers Oslo.
import { Hono } from 'hono';
import { kv } from '../db.js';
import { authOrToken } from '../mobile.js';
import { broadcast } from '../realtime.js';
import { family50 as F } from '../familie/positions.js';
import { sunTime } from '../vaer/met.js';
import { osloDate } from '../dates/oslo.js';

const MIN = 60_000, DAY = 86_400_000;
const NO_STORE = { 'Cache-Control': 'no-store' };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status, NO_STORE);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const isoOf = (t) => (t ? new Date(t).toISOString() : null);
const ymdOslo = (t = Date.now()) => osloDate(t);

const MODES = ['light', 'dark', 'system', 'auto'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEF_THEME = { mode: 'system', auto: { by: 'sun', lightAt: '07:00', darkAt: '21:00', place: null }, palette: 'papir', updatedAt: 0 };
export function themeOf(u) {
  const s = kv.get(u, 'theme51', null);
  if (s && typeof s === 'object') return { ...DEF_THEME, ...s, auto: { ...DEF_THEME.auto, ...(s.auto ?? {}) } };
  // Fra før: web_theme (prompt 44) light/dark/system.
  const web = kv.get(u, 'layout', {})?.web_theme;
  return { ...DEF_THEME, mode: ['light', 'dark', 'system'].includes(web) ? web : DEF_THEME.mode };
}
/** Klokkeslett «HH:MM» i Oslo på dagen ymd → ms. */
function osloAt(ymd, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.parse(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const local = Date.parse(new Date(guess).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(' ', 'T') + 'Z');
  return guess - (local - guess);
}
function placeFor(u, t) {
  try {
    const p = F.lastRaw(u);
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100, name: 'Din posisjon', source: 'family' };
  } catch { /* */ }
  const m = t.auto?.place;
  if (m && Number.isFinite(m.lat) && Number.isFinite(m.lon)) return { lat: m.lat, lon: m.lon, name: m.name ?? 'Valgt sted', source: 'manual' };
  return { lat: 59.91, lon: 10.75, name: 'Oslo', source: 'default' };
}
/** Beregner effektivt tema nå + neste bytte. */
export function computeTheme(u, t = themeOf(u), now = Date.now()) {
  if (t.mode === 'light' || t.mode === 'dark') return { effective: t.mode, next: null, sun: null };
  if (t.mode === 'system') return { effective: null, next: null, sun: null };
  const today = ymdOslo(now), tomorrow = ymdOslo(now + DAY);
  if (t.auto.by === 'time') {
    const l = osloAt(today, t.auto.lightAt), d = osloAt(today, t.auto.darkAt);
    const light = l < d ? now >= l && now < d : !(now >= d && now < l);
    const cands = [l, d, osloAt(tomorrow, t.auto.lightAt), osloAt(tomorrow, t.auto.darkAt)].filter((x) => x > now).sort((a, b) => a - b);
    const nx = cands[0];
    return { effective: light ? 'light' : 'dark', next: nx ? { at: isoOf(nx), mode: [osloAt(today, t.auto.lightAt), osloAt(tomorrow, t.auto.lightAt)].includes(nx) ? 'light' : 'dark' } : null, sun: null };
  }
  const p = placeFor(u, t);
  const rise = sunTime(today, p.lat, p.lon, -0.833, true), set = sunTime(today, p.lat, p.lon, -0.833, false);
  const riseMs = rise ? +new Date(rise) : null, setMs = set ? +new Date(set) : null;
  if (!riseMs || !setMs) {
    // Midnattssol eller mørketid: deklinasjonen avgjør (samme formel som vaer/sun.js).
    const rad = Math.PI / 180, n = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.UTC(2000, 0, 1, 12)) / DAY) - p.lon / 360;
    const M = (357.5291 + 0.98560028 * n) % 360, C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad);
    const L = (M + C + 180 + 102.9372) % 360, decl = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));
    const polar = Math.sign(p.lat) === Math.sign(decl) ? 'midnattssol' : 'mørketid';
    return { effective: polar === 'midnattssol' ? 'light' : 'dark', next: null, sun: { sunrise: null, sunset: null, polar, place: p.name } };
  }
  const light = now >= riseMs && now < setMs;
  let next = null;
  if (now < riseMs) next = { at: isoOf(riseMs), mode: 'light' };
  else if (now < setMs) next = { at: isoOf(setMs), mode: 'dark' };
  else { const r2 = sunTime(tomorrow, p.lat, p.lon, -0.833, true); if (r2) next = { at: isoOf(+new Date(r2)), mode: 'light' }; }
  return { effective: light ? 'light' : 'dark', next, sun: { sunrise: isoOf(riseMs), sunset: isoOf(setMs), polar: null, place: p.name } };
}
const themeOut = (u, t = themeOf(u)) => {
  const { place, ...auto } = t.auto ?? {};
  return { mode: t.mode, auto: { ...auto, place: place ?? null }, palette: t.palette, updatedAt: t.updatedAt || 0, ...computeTheme(u, t) };
};
function themeIn(b, cur) {
  const next = { ...cur, auto: { ...cur.auto } };
  if (b.mode !== undefined) { if (!MODES.includes(b.mode)) return 'mode må være light, dark, system eller auto'; next.mode = b.mode; }
  if (b.palette !== undefined) { if (!['papir', 'noytral'].includes(b.palette)) return 'palette må være papir eller noytral'; next.palette = b.palette; }
  if (b.auto !== undefined) {
    const a = b.auto;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return 'auto må være et objekt';
    if (a.by !== undefined) { if (!['sun', 'time'].includes(a.by)) return 'auto.by må være sun eller time'; next.auto.by = a.by; }
    for (const k of ['lightAt', 'darkAt']) if (a[k] !== undefined) { if (!HHMM.test(String(a[k]))) return `auto.${k} må være HH:MM`; next.auto[k] = a[k]; }
    if (a.lightAt !== undefined || a.darkAt !== undefined) if (next.auto.lightAt === next.auto.darkAt) return 'Lys og mørk kan ikke starte samtidig';
    if (a.place !== undefined) {
      if (a.place === null) next.auto.place = null;
      else {
        const lat = Number(a.place?.lat), lon = Number(a.place?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'auto.place må ha lat og lon';
        // Avrundet: temaet trenger ikke mer enn ~1 km.
        next.auto.place = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name: clean(a.place.name, 60) || 'Valgt sted' };
      }
    }
  }
  return next;
}

export const themeApi = new Hono();
themeApi.get('/me/theme51', authOrToken, (c) => c.json(themeOut(c.get('user')), 200, NO_STORE));
themeApi.put('/me/theme51', authOrToken, async (c) => {
  const u = c.get('user'), b = await body(c), cur = themeOf(u);
  const at = b.updatedAt != null ? Number(b.updatedAt) : Date.now();
  if (!Number.isFinite(at)) return bad(c, 'updatedAt må være et tall (ms)');
  if (cur.updatedAt && at < cur.updatedAt) return c.json({ error: 'En nyere endring finnes allerede', theme: themeOut(u, cur) }, 409, NO_STORE);
  const next = themeIn(b, cur);
  if (typeof next === 'string') return bad(c, next);
  next.updatedAt = Math.min(at, Date.now() + 5 * MIN);
  kv.set(u, 'theme51', next);
  // Bakoverkompatibelt: eldre web-kode leser web_theme fra /api/me/layout.
  if (['light', 'dark', 'system'].includes(next.mode)) kv.set(u, 'layout', { ...(kv.get(u, 'layout', {}) ?? {}), web_theme: next.mode });
  const out = themeOut(u, next);
  try { broadcast('theme51', { theme: out }, [u]); } catch { /* */ }
  return c.json(out, 200, NO_STORE);
});
