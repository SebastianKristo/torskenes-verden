// Prompt 36 (SERVER36): nye felles endepunkter under /api.
//
//   GET  /api/dashboard/layout?device=web   → {device, cols, gap, snap, items:[{id, x, y, w, h, auto, hidden}], v, at, alt?}
//   PUT  /api/dashboard/layout {device:'web', cols, gap, snap, items, v, at?, alt?:{cur:{…samme…}}} → det lagrede
//        Per bruker og enhetsklasse (web | mobile | tablet), kv «dash_layout_<device>». Ugyldige felt avvises (400).
//   GET  /api/weather/places/summary        → {places:[{id, name, region, lat, lon, temp, hi, lo, code, text, isDay, kind, sky,
//        cardBg, note, rainNote, timezone, utcOffset, localTime, otherTz, updatedAt}], source, updatedAt}
//        Alle lagrede steder i ett kall (Vær-sidepanelet). Open-Meteo i ett samlet kall (timezone=auto), cache 10 min,
//        MET via weatherFull som reserve per sted, eksempeldata med MOCK_DATA=1.
import { Hono } from 'hono';
import { kv } from './db.js';
import { authOrToken } from './mobile.js';
import { cached, fetchJson } from './cache.js';
import { DEFAULT_PLACES, wmoText, weatherKindOf, mockRaw, weatherFull } from './weather-full.js';

const api = new Hono();
const MOCK = process.env.MOCK_DATA === '1';

/* ---------------- Dashboard-layout ---------------- */

export const DEVICES = ['web', 'mobile', 'tablet'];
const COLS = [1, 2, 3, 4, 6, 8, 12];
const bad = (message) => Object.assign(new Error(message), { status: 400 });
const int = (v, lo, hi, name) => { if (!Number.isInteger(v) || v < lo || v > hi) throw bad(`${name} må være et heltall ${lo}–${hi}`); return v; };
function cleanRec(b, depth = 0) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Forventet et objekt');
  const cols = b.cols === undefined ? 12 : Number(b.cols);
  if (!COLS.includes(cols)) throw bad(`cols må være ${COLS.join(', ')}`);
  const gap = b.gap === undefined ? 16 : int(b.gap, 0, 64, 'gap');
  if (b.snap !== undefined && typeof b.snap !== 'boolean') throw bad('snap må være true/false');
  if (!Array.isArray(b.items ?? [])) throw bad('items må være en liste');
  const items = (b.items ?? []);
  if (items.length > 80) throw bad('Maks 80 widgets');
  const seen = new Set();
  const out = items.map((x, i) => {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[\w.:-]{1,48}$/.test(x.id)) throw bad(`items[${i}].id er ugyldig`);
    if (seen.has(x.id)) throw bad(`items[${i}].id finnes to ganger`);
    seen.add(x.id);
    const w = int(x.w ?? 1, 1, cols, `items[${i}].w`), xx = int(x.x ?? 0, 0, cols - 1, `items[${i}].x`);
    if (xx + w > cols) throw bad(`items[${i}] går utenfor ${cols} kolonner`);
    return { id: x.id, x: xx, y: int(x.y ?? 0, 0, 999, `items[${i}].y`), w, h: int(x.h ?? 1, 1, 48, `items[${i}].h`), ...(x.auto !== undefined ? { auto: !!x.auto } : {}), hidden: !!x.hidden };
  });
  const rec = { cols, gap, snap: b.snap ?? true, items: out, v: Number.isInteger(b.v) ? b.v : 1, at: Number.isFinite(+b.at) && +b.at > 0 ? Math.round(+b.at) : Date.now() };
  if (b.alt !== undefined && b.alt !== null) {
    if (depth || typeof b.alt !== 'object' || Array.isArray(b.alt)) throw bad('alt må være et objekt');
    rec.alt = {};
    for (const [k, v] of Object.entries(b.alt)) { if (!/^[\w-]{1,16}$/.test(k) || Object.keys(rec.alt).length >= 4) throw bad('Ugyldig nøkkel i alt'); if (v != null) rec.alt[k] = cleanRec(v, 1); }
  }
  return rec;
}
const deviceOf = (v) => (DEVICES.includes(v) ? v : 'web');
const layoutKey = (d) => `dash_layout_${d}`;
export const dashLayoutOf = (u, device = 'web') => kv.get(u, layoutKey(deviceOf(device)), null);

api.get('/dashboard/layout', authOrToken, (c) => {
  const device = deviceOf(c.req.query('device'));
  const r = dashLayoutOf(c.get('user'), device);
  return c.json(r ? { device, ...r } : { device, cols: 12, gap: 16, snap: true, items: [], v: 1, at: null, empty: true });
});
api.put('/dashboard/layout', authOrToken, async (c) => {
  const b = await c.req.json().catch(() => null);
  try {
    const device = deviceOf(b?.device ?? c.req.query('device'));
    const rec = cleanRec(b);
    kv.set(c.get('user'), layoutKey(device), rec);
    return c.json({ device, ...rec });
  } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
});
api.delete('/dashboard/layout', authOrToken, (c) => { kv.del(c.get('user'), layoutKey(deviceOf(c.req.query('device')))); return c.json({ ok: true }); });

/* ---------------- Vær for alle steder ---------------- */

// Kortfargen etter himmelen (Vaer.dc.html --vcard): natt, klart, overskyet, regn/torden, snø, tåke.
export const CARD_BG = { night: 'rgba(34,38,78,.58)', clear: 'rgba(24,82,168,.34)', cloudy: 'rgba(62,84,110,.42)', rain: 'rgba(34,42,56,.5)', snow: 'rgba(84,98,118,.4)', fog: 'rgba(52,64,80,.45)' };
const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const r0 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
const placesOf = (u) => { const v = kv.get(u, 'wx_places', null); return Array.isArray(v) ? v : DEFAULT_PLACES; };
const OSLO_TZ = 'Europe/Oslo';
const tzOffsetMin = (tz, t = Date.now()) => {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(t)).find((x) => x.type === 'timeZoneName')?.value ?? 'GMT';
    const m = p.match(/GMT([+-]\d+)(?::(\d+))?/); return m ? (+m[1]) * 60 + Math.sign(+m[1] || 1) * (+(m[2] ?? 0)) : 0;
  } catch { return 0; }
};

/** Én rad i sidepanelet fra Open-Meteo-formen {current, daily, timezone, utc_offset_seconds}. */
export function summaryRow(p, raw, now = Date.now()) {
  const C = raw?.current ?? {}, D = raw?.daily ?? {};
  const code = C.weather_code ?? D.weather_code?.[0] ?? 0, isDay = C.is_day != null ? !!C.is_day : true;
  const kind = weatherKindOf(code, isDay);
  const days = (D.time ?? []).map((t, i) => ({ t, p: D.precipitation_probability_max?.[i] ?? 0 })).slice(0, 4);
  const wet = days.reduce((a, d) => (d.p > (a?.p ?? -1) ? d : a), null);
  const rainNote = wet && wet.p >= 60 ? `${wet.p} % sjanse for regn ${wet.t === days[0]?.t ? 'i dag' : `på ${DAYS[new Date(wet.t + 'T12:00:00Z').getUTCDay()]}`}` : null;
  const offSec = Number.isFinite(raw?.utc_offset_seconds) ? raw.utc_offset_seconds : null;
  const tz = typeof raw?.timezone === 'string' ? raw.timezone : null;
  const otherTz = offSec != null && Math.round(offSec / 60) !== tzOffsetMin(OSLO_TZ, now);
  const local = offSec != null ? new Date(now + offSec * 1000) : null;
  const localTime = local ? `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}` : null;
  const text = wmoText(code);
  return { id: p.id, name: p.name, region: p.region ?? '', lat: p.lat, lon: p.lon, temp: r0(C.temperature_2m), hi: r0(D.temperature_2m_max?.[0]), lo: r0(D.temperature_2m_min?.[0]),
    code, text, isDay, kind, sky: kind, cardBg: CARD_BG[kind] ?? CARD_BG.cloudy, rainNote, note: rainNote ?? text,
    timezone: tz, utcOffset: offSec, localTime, otherTz, sub: otherTz && localTime ? localTime : (p.region ?? '') };
}

// Mock: samme eksempeldata som Vær (mockRaw) per sted.
function mockSummaryRaw(p) {
  const raw = mockRaw(p), H = raw.hourly, D = raw.daily;
  const nowIso = new Date().toLocaleString('sv-SE', { timeZone: OSLO_TZ }).replace(' ', 'T').slice(0, 13);
  const i = Math.max(0, H.time.findIndex((t) => t >= nowIso));
  const di = Math.max(0, D.time.indexOf(nowIso.slice(0, 10)));
  return { current: { temperature_2m: H.temperature_2m[i], weather_code: H.weather_code[i], is_day: H.is_day[i] }, timezone: OSLO_TZ, utc_offset_seconds: tzOffsetMin(OSLO_TZ) * 60,
    daily: { time: D.time.slice(di), temperature_2m_max: D.temperature_2m_max.slice(di), temperature_2m_min: D.temperature_2m_min.slice(di), weather_code: D.weather_code.slice(di), precipitation_probability_max: D.precipitation_probability_max.slice(di) } };
}

let F = (u, i) => fetchJson(u, i, 8000);
/** Bare for tester. */
export const _setSummaryFetch = (fn) => { F = fn ?? ((u, i) => fetchJson(u, i, 8000)); };

/** Bulk-kall til Open-Meteo for alle stedene (latitude=a,b&longitude=c,d gir en liste). */
async function openMeteoBulk(places) {
  const lat = places.map((p) => p.lat).join(','), lon = places.map((p) => p.lon).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=5`
    + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max';
  const r = await F(url, { headers: { 'User-Agent': 'homelab-os', Accept: 'application/json' } });
  return Array.isArray(r) ? r : [r];
}

export async function placesSummary(places) {
  if (!places.length) return { places: [], source: null, updatedAt: new Date().toISOString() };
  if (MOCK) return { places: places.map((p) => summaryRow(p, mockSummaryRaw(p))), source: 'mock', updatedAt: new Date().toISOString() };
  const key = `wx36sum:${places.map((p) => `${p.lat},${p.lon}`).join(';')}`;
  try {
    const list = await cached(key, 10 * 60_000, () => openMeteoBulk(places));
    return { places: places.map((p, i) => summaryRow(p, list[i])), source: 'open-meteo', credit: 'Data fra Open-Meteo', updatedAt: new Date().toISOString() };
  } catch (e) {
    // Reserve: MET/Open-Meteo per sted via weatherFull (egen cache 10 min).
    const rows = await Promise.all(places.map(async (p) => {
      try {
        const w = await weatherFull({ lat: p.lat, lon: p.lon, name: p.name });
        const d = w.days ?? [];
        return summaryRow(p, { current: { temperature_2m: w.current?.temp, weather_code: w.current?.code, is_day: w.current?.isDay ? 1 : 0 },
          daily: { time: d.map((x) => x.date), temperature_2m_max: d.map((x) => x.hi), temperature_2m_min: d.map((x) => x.lo), precipitation_probability_max: d.map((x) => x.precipProb) } });
      } catch { return { ...summaryRow(p, null), temp: null, text: 'Ingen data', note: 'Ingen data', error: true }; }
    }));
    return { places: rows, source: 'met', error: `Open-Meteo: ${e.message}`, updatedAt: new Date().toISOString() };
  }
}

api.get('/weather/places/summary', authOrToken, async (c) => c.json(await placesSummary(placesOf(c.get('user')))));

export default api;
