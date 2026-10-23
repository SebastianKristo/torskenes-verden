// Prompt 46 (DATA46): Kart-API (claude-code-kart-side.md, fasit Kart.dc.html).
//   - Holdeplasser i synlig utsnitt: Entur Journey Planner v3 stopPlacesByBbox (cache 30 s).
//   - Avganger for en holdeplass: estimatedCalls (12 stk / 2 t).
//   - Kjøretøy i sanntid: Entur Vehicles API (boundingBox) BARE for valgte soner – området regnes ut på serveren:
//     sonesenter ± maks(3 × radius, 1200 m). Ingen cache (klientene poller hvert 10. sekund).
//   - Søk etter holdeplass: Entur Geocoder (layers=venue).
//   - Soner og personer fra Familie med de samme delingsreglene (bare de som deler med innlogget bruker; pause/av vises ikke;
//     omtrentlig presisjon gir avrundede koordinater). Ingen egen posisjonslagring her.
//   - Brukervalg per bruker: kv(bruker, 'kart_v1') = {z, c, show, md, vz}.
// Alle Entur-kall går via serveren med «ET-Client-Name: kristo-homelab». Svarer ikke Entur (eller MOCK_DATA=1), gis demodata
// med source:'demo' («DEMO-DATA» i klientene).
import { Hono } from 'hono';
import { kv } from './db.js';
import { userGuard, readJson, bad, MOCK } from './homeos-common.js';
import { family45, familyPeople37 } from './family.js';

export const ENTUR_CLIENT46 = () => process.env.ENTUR_CLIENT_NAME_46 || 'kristo-homelab';
const JP = 'https://api.entur.io/journey-planner/v3/graphql';
const VEH = 'https://api.entur.io/realtime/v2/vehicles/graphql';
const GEO = 'https://api.entur.io/geocoder/v1/autocomplete';
export const MODES46 = ['bus', 'metro', 'tram', 'rail', 'water'];
export const MODE_TEXT46 = { bus: 'Buss', metro: 'T-bane', tram: 'Trikk', rail: 'Tog', water: 'Båt' };
/** Entur-modus → én av våre fem (som nm() i fasiten): coach → buss, ferry → båt, ukjent → buss. */
export const mode46 = (m) => { const s = String(m ?? '').toLowerCase(); return s === 'coach' ? 'bus' : s === 'ferry' ? 'water' : MODES46.includes(s) ? s : 'bus'; };

let F = (u, i) => fetch(u, i);
let injected = false;
/** Bare for tester. */
export const _setKartFetch46 = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); injected = !!fn; };
const demoMode = () => MOCK && !injected;
const H = () => ({ 'Content-Type': 'application/json', Accept: 'application/json', 'ET-Client-Name': ENTUR_CLIENT46() });

async function gql(url, query, variables) {
  const r = await F(url, { method: 'POST', headers: H(), body: JSON.stringify(variables ? { query, variables } : { query }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Entur svarte ${r.status}`);
  const d = await r.json();
  if (d.errors?.length) throw new Error(`Entur: ${String(d.errors[0].message).slice(0, 120)}`);
  return d.data ?? {};
}

/* ---------------- Brukervalg ---------------- */

export const KART_DEFAULT46 = { z: 14, c: [59.9225, 10.735], show: { stops: true, vehicles: true, zones: true, people: true }, md: [...MODES46], vz: [] };
const num = (v, lo, hi) => { const n = +v; return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
export function prefsOf46(u) { const p = kv.get(u, 'kart_v1', null) ?? {}; return cleanPrefs46({ ...KART_DEFAULT46, ...p }, KART_DEFAULT46); }
export function cleanPrefs46(b, base) {
  const out = { ...base };
  if (b.z != null) { const z = num(b.z, 11, 18); if (z != null) out.z = Math.round(z * 100) / 100; }
  if (Array.isArray(b.c) && b.c.length === 2) { const la = num(b.c[0], 57, 72), lo = num(b.c[1], 3, 32); if (la != null && lo != null) out.c = [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]; }
  if (b.show && typeof b.show === 'object') out.show = Object.fromEntries(Object.keys(KART_DEFAULT46.show).map((k) => [k, typeof b.show[k] === 'boolean' ? b.show[k] : (base.show?.[k] ?? true)]));
  if (Array.isArray(b.md)) out.md = [...new Set(b.md.filter((m) => MODES46.includes(m)))];
  if (Array.isArray(b.vz)) out.vz = [...new Set(b.vz.map((x) => (typeof x === 'number' || /^\d+$/.test(String(x)) ? +x : String(x).slice(0, 40))))].slice(0, 20);
  return out;
}

/* ---------------- Soner og personer (Familie) ---------------- */

function zonesFor46(u, vz = prefsOf46(u).vz) {
  if (MOCK) family45.seedMock(u); // demosonene i Familie (samme som GET /api/family)
  return family45.zonesFor(u).map((z) => family45.zoneOut(z, u)).map((z) => ({ id: z.id, name: z.name, lat: z.lat, lon: z.lon, radius: z.radius, color: z.color, icon: z.icon, mine: z.mine, shared: z.shared, live: vz.map(String).includes(String(z.id)) }));
}
/** Personer på kartet: deg selv og dem som deler med deg – samme kilde og tillatelser som Familie. Pause/av og uten posisjon vises ikke. */
export function people46(u) {
  const zones = family45.zonesFor(u);
  const dist = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  return familyPeople37(u).filter((m) => m.visible && (m.self || m.sharing === 'on') && m.last && Number.isFinite(m.last.lat) && Number.isFinite(m.last.lon)).map((m) => {
    const z = zones.find((x) => dist(m.last, x) <= x.radius);
    return { userId: m.userId, name: m.self ? 'Du' : m.name, fullName: m.name, color: m.color, photoUrl: m.photoUrl ?? null, self: !!m.self, lat: m.last.lat, lon: m.last.lon,
      acc: m.last.acc ?? null, approx: !!m.last.approx, heading: m.last.heading ?? null, updatedAt: m.last.ts ? new Date(m.last.ts).toISOString() : null,
      zoneId: z?.id ?? null, zone: z?.name ?? m.last.place ?? null, pulse: !!m.self, ...(m.mock ? { mock: true } : {}) };
  });
}

/* ---------------- Holdeplasser ---------------- */

/** bbox fra query: minLat,minLon,maxLat,maxLon (eller fire felt). Maks ca. zoom 13-utsnitt, så ingen henter hele landet. */
export function bbox46(qr) {
  const parts = qr.bbox ? String(qr.bbox).split(',') : [qr.minLat, qr.minLon, qr.maxLat, qr.maxLon];
  const [a, b, c, d] = parts.map((x) => +x);
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const minLat = Math.min(a, c), maxLat = Math.max(a, c), minLon = Math.min(b, d), maxLon = Math.max(b, d);
  if (minLat < 57 || maxLat > 72 || minLon < 3 || maxLon > 32) return null;
  if (maxLat - minLat > 0.12 || maxLon - minLon > 0.25) return { tooBig: true };
  return { minLat, minLon, maxLat, maxLon };
}
const stopCache = new Map();
const STOP_TTL = 30_000;
export const _clearKart46 = () => stopCache.clear();
const DEMO_STOPS = [
  ['NSR:StopPlace:58366', 'Jernbanetorget', 59.9115, 10.7505, ['metro', 'tram', 'bus']], ['NSR:StopPlace:59872', 'Oslo S', 59.9104, 10.7531, ['rail']],
  ['NSR:StopPlace:58404', 'Nationaltheatret', 59.9146, 10.7340, ['metro', 'rail', 'tram']], ['NSR:StopPlace:6505', 'Bislett', 59.9255, 10.7320, ['tram']],
  ['NSR:StopPlace:6549', 'Majorstuen', 59.9298, 10.7151, ['metro', 'tram', 'bus']], ['NSR:StopPlace:58195', 'Aker brygge', 59.9110, 10.7290, ['water', 'bus']],
  ['NSR:StopPlace:4029', 'Stensgata', 59.9284, 10.7364, ['bus']], ['NSR:StopPlace:6488', 'Holbergs plass', 59.9195, 10.7365, ['tram', 'bus']],
].map(([id, name, lat, lon, modes]) => ({ id, name, lat, lon, modes }));
export async function stops46(bb) {
  const key = [bb.minLat, bb.minLon, bb.maxLat, bb.maxLon].map((x) => x.toFixed(4)).join(',');
  const hit = stopCache.get(key);
  if (hit && Date.now() - hit.at < STOP_TTL) return hit.value;
  const inBox = (s) => s.lat >= bb.minLat && s.lat <= bb.maxLat && s.lon >= bb.minLon && s.lon <= bb.maxLon;
  let value;
  if (demoMode()) value = { source: 'demo', stops: DEMO_STOPS.filter(inBox) };
  else {
    try {
      const q = `{stopPlacesByBbox(minimumLatitude:${bb.minLat.toFixed(5)},maximumLatitude:${bb.maxLat.toFixed(5)},minimumLongitude:${bb.minLon.toFixed(5)},maximumLongitude:${bb.maxLon.toFixed(5)}){id name latitude longitude transportMode}}`;
      const d = await gql(JP, q);
      const list = (d.stopPlacesByBbox ?? []).filter((x) => x && Number.isFinite(x.latitude) && Number.isFinite(x.longitude)).slice(0, 400)
        .map((x) => ({ id: x.id, name: x.name, lat: x.latitude, lon: x.longitude, modes: [...new Set([].concat(x.transportMode ?? 'bus').map(mode46))] }));
      value = { source: 'entur', stops: list };
    } catch (e) { console.warn('[kart46] holdeplasser:', e.message); value = { source: 'demo', stops: DEMO_STOPS.filter(inBox), error: 'Entur svarer ikke · viser demodata' }; }
  }
  stopCache.set(key, { at: Date.now(), value });
  if (stopCache.size > 500) stopCache.delete(stopCache.keys().next().value);
  return value;
}

/* ---------------- Avganger ---------------- */

const STOP_ID = /^NSR:StopPlace:\d{1,10}$/;
const minutesTo = (t, now = Date.now()) => Math.max(0, Math.round((Date.parse(t) - now) / 60_000));
export async function departures46(id) {
  if (!STOP_ID.test(id)) return null;
  const demo = () => {
    const s = DEMO_STOPS.find((x) => x.id === id) ?? { id, name: 'Holdeplass', modes: ['bus'] };
    const now = Date.now();
    const calls = Array.from({ length: 12 }, (_, i) => { const m = s.modes[i % s.modes.length], aimed = new Date(now + (2 + i * 4) * 60_000), delay = i % 5 === 2 ? 2 : 0;
      return { line: m === 'metro' ? String(1 + (i % 5)) : m === 'tram' ? String(11 + (i % 7)) : m === 'rail' ? `L${1 + (i % 3)}` : m === 'water' ? 'B9' : String(20 + i), mode: m, to: ['Sentrum', 'Storo', 'Ljabru', 'Bekkestua'][i % 4], platform: String.fromCharCode(65 + (i % 3)),
        aimed: aimed.toISOString(), expected: new Date(aimed.getTime() + delay * 60_000).toISOString(), minutes: 2 + i * 4 + delay, delayMin: delay, realtime: false }; });
    return { source: 'demo', stop: { id: s.id, name: s.name, modes: s.modes }, calls };
  };
  if (demoMode()) return demo();
  try {
    const q = `query($id:String!){stopPlace(id:$id){id name transportMode estimatedCalls(numberOfDepartures:12,timeRange:7200){realtime aimedDepartureTime expectedDepartureTime destinationDisplay{frontText} quay{publicCode} serviceJourney{line{publicCode transportMode}}}}}`;
    const d = await gql(JP, q, { id });
    const sp = d.stopPlace;
    if (!sp) return { source: 'entur', stop: null, calls: [] };
    const now = Date.now();
    const calls = (sp.estimatedCalls ?? []).map((c) => {
      const aimed = c.aimedDepartureTime, exp = c.expectedDepartureTime ?? aimed;
      return { line: c.serviceJourney?.line?.publicCode ?? '', mode: mode46(c.serviceJourney?.line?.transportMode), to: c.destinationDisplay?.frontText ?? '', platform: c.quay?.publicCode ?? null,
        aimed, expected: exp, minutes: minutesTo(exp, now), delayMin: aimed && exp ? Math.round((Date.parse(exp) - Date.parse(aimed)) / 60_000) : 0, realtime: !!c.realtime };
    });
    return { source: 'entur', stop: { id: sp.id, name: sp.name, modes: [...new Set([].concat(sp.transportMode ?? 'bus').map(mode46))] }, calls };
  } catch (e) { console.warn('[kart46] avganger:', e.message); return { ...demo(), error: 'Entur svarer ikke · viser demodata' }; }
}

/* ---------------- Kjøretøy (bare valgte soner) ---------------- */

/** Område for en sone: senter ± maks(3 × radius, 1200 m). */
export function zoneBox46(z) {
  const R = Math.max(3 * (+z.radius || 0), 1200);
  const dla = R / 111320, dlo = R / (111320 * Math.cos((z.lat * Math.PI) / 180));
  return { minLat: z.lat - dla, minLon: z.lon - dlo, maxLat: z.lat + dla, maxLon: z.lon + dlo };
}
export async function vehicles46(u, ids) {
  const vis = zonesFor46(u);
  const want = (ids?.length ? ids : prefsOf46(u).vz).map(String);
  const zones = vis.filter((z) => want.includes(String(z.id))).slice(0, 5); // andres private soner kan ikke velges
  if (!zones.length) return { source: demoMode() ? 'demo' : 'entur', zones: [], vehicles: [], pollMs: 10_000 };
  const out = new Map();
  let source = 'entur', error = null;
  for (const z of zones) {
    const b = zoneBox46(z);
    let list;
    if (demoMode()) list = demoVehicles(z);
    else {
      try {
        const q = `{vehicles(boundingBox:{minLat:${b.minLat.toFixed(5)},minLon:${b.minLon.toFixed(5)},maxLat:${b.maxLat.toFixed(5)},maxLon:${b.maxLon.toFixed(5)}}){vehicleId mode bearing destinationName lastUpdated line{publicCode} location{latitude longitude}}}`;
        const d = await gql(VEH, q);
        list = (d.vehicles ?? []).filter((v) => v?.location && Number.isFinite(v.location.latitude)).map((v) => ({ id: String(v.vehicleId), line: v.line?.publicCode ?? '', mode: mode46(v.mode), bearing: Number.isFinite(v.bearing) ? v.bearing : null,
          lat: v.location.latitude, lon: v.location.longitude, destination: v.destinationName ?? null, updatedAt: v.lastUpdated ?? null }));
      } catch (e) { console.warn('[kart46] kjøretøy:', e.message); list = demoVehicles(z); source = 'demo'; error = 'Entur svarer ikke · viser demodata'; }
    }
    for (const v of list) if (!out.has(v.id)) out.set(v.id, { ...v, zoneId: z.id });
  }
  return { source: demoMode() ? 'demo' : source, ...(error ? { error } : {}), zones: zones.map((z) => ({ id: z.id, name: z.name, box: zoneBox46(z) })), vehicles: [...out.values()].slice(0, 300), pollMs: 10_000 };
}
function demoVehicles(z) {
  const t = Date.now() / 1000;
  return ['bus', 'tram', 'metro'].map((m, i) => { const a = (t / (60 + i * 20)) + i * 2.1, R = Math.max(z.radius * 2, 600);
    const dla = (R * Math.sin(a)) / 111320, dlo = (R * Math.cos(a)) / (111320 * Math.cos((z.lat * Math.PI) / 180));
    return { id: `demo-${z.id}-${i}`, line: ['31', '17', '5'][i], mode: m, bearing: Math.round(((90 - ((a * 180) / Math.PI + 90)) % 360 + 360) % 360), lat: z.lat + dla, lon: z.lon + dlo, destination: ['Snarøya', 'Rikshospitalet', 'Vestli'][i], updatedAt: new Date().toISOString() }; });
}

/* ---------------- Søk ---------------- */

export async function search46(text) {
  const t = String(text ?? '').trim().slice(0, 80);
  if (t.length < 2) return { source: 'entur', results: [] };
  const demo = () => ({ source: 'demo', results: DEMO_STOPS.filter((s) => s.name.toLowerCase().includes(t.toLowerCase())).map((s) => ({ id: s.id, name: s.name, label: `${s.name}, Oslo`, lat: s.lat, lon: s.lon, modes: s.modes })) });
  if (demoMode()) return demo();
  try {
    const r = await F(`${GEO}?text=${encodeURIComponent(t)}&layers=venue&size=8&lang=no`, { headers: { Accept: 'application/json', 'ET-Client-Name': ENTUR_CLIENT46() }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Entur svarte ${r.status}`);
    const d = await r.json();
    return { source: 'entur', results: (d.features ?? []).filter((f) => f?.geometry?.coordinates).map((f) => ({ id: f.properties?.id ?? null, name: f.properties?.name ?? '', label: f.properties?.label ?? f.properties?.name ?? '',
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], modes: [...new Set([].concat(f.properties?.category ?? []).map((c) => ({ onstreetBus: 'bus', busStation: 'bus', metroStation: 'metro', onstreetTram: 'tram', tramStation: 'tram', railStation: 'rail', ferryStop: 'water', harbourPort: 'water' })[c]).filter(Boolean))] })) };
  } catch (e) { console.warn('[kart46] søk:', e.message); return { ...demo(), error: 'Entur svarer ikke · viser demodata' }; }
}

/* ---------------- API (/api/kart) ---------------- */

export const kart46Api = new Hono();
kart46Api.use('*', userGuard);
kart46Api.get('/', (c) => {
  const u = c.get('user'), p = prefsOf46(u);
  return c.json({ prefs: p, zones: zonesFor46(u, p.vz), people: people46(u), modes: MODES46.map((m) => ({ id: m, name: MODE_TEXT46[m] })), source: demoMode() ? 'demo' : 'entur',
    sourceText: demoMode() ? 'DEMO-DATA' : 'SANNTID · ENTUR', tiles: { url: '/tiles/topograatone/{z}/{x}/{y}.png', style: 'topograatone', directUrl: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png', minZoom: 11, maxZoom: 18, attribution: '© Kartverket' },
    stopsFromZoom: 14, iconsFromZoom: 15, namesFromZoom: 16, vehiclePollMs: 10_000 });
});
kart46Api.get('/prefs', (c) => c.json(prefsOf46(c.get('user'))));
kart46Api.put('/prefs', async (c) => {
  const u = c.get('user'), b = await readJson(c);
  const next = cleanPrefs46(b, prefsOf46(u));
  // Sanntid kan bare slås på for soner du ser i Familie.
  const vis = new Set(zonesFor46(u, []).map((z) => String(z.id)));
  next.vz = next.vz.filter((id) => vis.has(String(id)));
  kv.set(u, 'kart_v1', next);
  return c.json(next);
});
kart46Api.post('/live', async (c) => {
  const u = c.get('user'), b = await readJson(c), p = prefsOf46(u);
  const z = zonesFor46(u, []).find((x) => String(x.id) === String(b.zoneId) || (b.zone && x.name.toLowerCase() === String(b.zone).toLowerCase()));
  if (!z) return bad(c, 'Fant ikke sonen', 404);
  const on = b.on !== false;
  p.vz = on ? [...new Set([...p.vz.map(String), String(z.id)])].map((x) => (/^\d+$/.test(x) ? +x : x)) : p.vz.filter((x) => String(x) !== String(z.id));
  if (on) p.show = { ...p.show, vehicles: true, zones: true };
  kv.set(u, 'kart_v1', p);
  return c.json({ ok: true, zone: { id: z.id, name: z.name, lat: z.lat, lon: z.lon, radius: z.radius }, prefs: p, open: { page: 'tkart', web: '#/kart', zoneId: z.id, live: on } });
});
kart46Api.get('/zones', (c) => c.json({ zones: zonesFor46(c.get('user')) }));
kart46Api.get('/people', (c) => c.json({ people: people46(c.get('user')) }));
kart46Api.get('/stops', async (c) => {
  const bb = bbox46(c.req.query());
  if (!bb) return bad(c, 'Ugyldig utsnitt (minLat,minLon,maxLat,maxLon)');
  if (bb.tooBig) return c.json({ source: demoMode() ? 'demo' : 'entur', stops: [], tooBig: true, message: 'Zoom inn for å se holdeplasser' });
  return c.json(await stops46(bb));
});
kart46Api.get('/stops/:id/departures', async (c) => {
  const r = await departures46(c.req.param('id'));
  if (!r) return bad(c, 'Ugyldig holdeplass-id (NSR:StopPlace:…)');
  return c.json(r);
});
kart46Api.get('/vehicles', async (c) => {
  const ids = String(c.req.query('zones') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5);
  return c.json(await vehicles46(c.get('user'), ids));
});
kart46Api.get('/search', async (c) => c.json(await search46(c.req.query('q'))));
