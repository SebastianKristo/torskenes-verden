// Prompt 46 (PWA46): Kart – holdeplasser, sanntid og soner (claude-code-kart-side.md, fasit design/Kart.dc.html).
// Mer → Kart (#/tkart, Familie bruker «kart»). Fullskjerm uten fanelinje, «‹ Mer» først i chip-raden går tilbake.
//   · Kart: Leaflet med Kartverket-fliser via serverens /tiles (gråtone i lyst tema, mørkt filter i mørkt). Zoom 11–18.
//   · Holdeplasser for synlig utsnitt fra zoom 14 (ikon fra 15, navn fra 16), filter-chips per transportmiddel.
//   · Mine soner og personer fra Familie (/api/family: samme delingsregler – bare de som deler med deg).
//   · Kjøretøy i sanntid bare for valgte soner (sonesenter ± maks(3 × radius, 1200 m)), poll hvert 10. s, glir mellom posisjoner.
//   · Panel: bunnark (lav/halv/høy) på mobil, fast panel til venstre (372 px) fra 900 px. Faner Lag / Soner / Personer,
//     søk etter holdeplass, avganger for valgt holdeplass.
// Alle Entur-kall går via serveren (DATA46: /api/kart/*, ET-Client-Name settes der). Svarer ikke serveren (404 på eldre
// server): avganger og søk via /api/ruter/*, ellers DEMO-DATA. Valgene (kart_v1 = {z, c, show, md, vz}) lagres lokalt og
// per bruker (PUT /api/kart/prefs når serveren har det).
import { esc, hlApi } from './core.js';
import { m, draw } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { setTiles } from './mobile-p20.js';
import { paperDark } from './mobile-paper.js';

const MD = { bus: { n: 'Buss', c: '#c8372d', p: 'M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2zM4 11h16M7 20v-4M17 20v-4' }, metro: { n: 'T-bane', c: '#d9661f', p: 'M5 5h14M12 5v15' }, tram: { n: 'Trikk', c: '#2b6fb3', p: 'M7 7h10v9H7zM9 3h6M12 3v4M8 21l2-5M16 21l-2-5' }, rail: { n: 'Tog', c: '#2f7a4f', p: 'M7 3h10v12H7zM7 10h10M9 19l-2 2M15 19l2 2' }, water: { n: 'Båt', c: '#5b4bb5', p: 'M3 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M6 13l1-5h10l1 5M12 4v4' } };
const MK = ['bus', 'metro', 'tram', 'rail', 'water'];
const nm = (x) => { const s = String(x ?? '').toLowerCase(); return s === 'coach' ? 'bus' : s === 'ferry' ? 'water' : s === 'train' ? 'rail' : s === 'subway' ? 'metro' : MD[s] ? s : 'bus'; };
const svg = (d, s = 16, w = 2, c = 'currentColor') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const hav = (a, b, c, d) => { const R = 6371e3, p = Math.PI / 180, x = Math.sin(((c - a) * p) / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(((d - b) * p) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const wideK = () => innerWidth >= 900;
const hm = (d) => d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
// Reserve når serveren ikke svarer (fasit DST): et utvalg holdeplasser i Oslo sentrum.
const DST = [['NSR:StopPlace:58404', 'Nationaltheatret', 59.9147, 10.7317, ['metro', 'tram', 'rail', 'bus']], ['NSR:StopPlace:58405', 'Stortinget', 59.9131, 10.7426, ['metro']], ['NSR:StopPlace:58366', 'Jernbanetorget', 59.9118, 10.7499, ['metro', 'tram', 'bus']], ['NSR:StopPlace:58381', 'Majorstuen', 59.9296, 10.7150, ['metro', 'tram', 'bus']], ['NSR:StopPlace:6488', 'Bislett', 59.9254, 10.7329, ['tram']], ['NSR:StopPlace:6505', 'Holbergs plass', 59.9196, 10.7340, ['tram', 'bus']], ['NSR:StopPlace:6452', 'Frogner plass', 59.9223, 10.7062, ['tram']], ['NSR:StopPlace:6562', 'Aker brygge', 59.9106, 10.7280, ['water', 'bus']], ['NSR:StopPlace:6274', 'Schous plass', 59.9201, 10.7595, ['tram']], ['NSR:StopPlace:58195', 'Carl Berners plass', 59.9256, 10.7779, ['metro', 'bus']], ['NSR:StopPlace:337', 'Oslo S', 59.9105, 10.7530, ['rail']], ['NSR:StopPlace:58227', 'Ullevål stadion', 59.9483, 10.7340, ['metro', 'tram']], ['NSR:StopPlace:58193', 'Forskningsparken', 59.9431, 10.7179, ['metro', 'tram']], ['NSR:StopPlace:6435', 'Adamstuen', 59.9339, 10.7356, ['tram']], ['NSR:StopPlace:6213', 'Alexander Kiellands plass', 59.9283, 10.7517, ['bus', 'tram']], ['NSR:StopPlace:6334', 'Stensgata', 59.9282, 10.7271, ['bus']], ['NSR:StopPlace:6431', 'Welhavens gate', 59.9227, 10.7313, ['bus']], ['NSR:StopPlace:6503', 'Pilestredet', 59.9206, 10.7350, ['bus']]].map(([id, n, la, lo, md]) => ({ id, n, la, lo, m: md }));
const DL = [['31', 'bus'], ['37', 'bus'], ['54', 'bus'], ['17', 'tram'], ['18', 'tram'], ['4', 'metro'], ['5', 'metro'], ['20', 'bus'], ['11', 'tram'], ['12', 'tram']];
const DDEST = { bus: ['Tonsenhagen', 'Nydalen', 'Kjelsås', 'Snarøya', 'Galgeberg'], tram: ['Rikshospitalet', 'Ljabru', 'Majorstuen', 'Kjelsås'], metro: ['Vestli', 'Sognsvann', 'Bergkrystallen', 'Ringen'], rail: ['Lillehammer', 'Drammen', 'Gardermoen'], water: ['Nesodden', 'Hovedøya'] };

const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const V0 = ls.get('kart_v1', {}) ?? {};
export const K = {
  z: V0.z || 15, c: V0.c || { la: 59.9235, lo: 10.7345 }, show: V0.show || { stops: true, veh: true, zones: true, ppl: true }, md: V0.md || { bus: true, metro: true, tram: true, rail: true, water: true }, vz: V0.vz || null,
  tab: 'lag', sheet: 'peek', q: '', res: null, sel: null, dep: null,
  stops: DST, stSrc: 'demo', veh: [], vSrc: 'demo', fam: null, famT: 0, miss: {}, tk: 0, prefsT: 0,
};
const zones = () => (K.fam?.zones ?? []).filter((z) => z.lat != null && z.lon != null).map((z, i) => ({ id: String(z.id ?? i), n: z.name || `Sone ${i + 1}`, lat: +z.lat, lon: +z.lon, r: +(z.radius ?? z.r ?? 200), c: z.color || ['#b23a2a', '#2b5d8a', '#a8661a', '#2f6b45'][i % 4] }));
const meId = () => K.fam?.me?.userId;
const isMe = (p) => p?.self || String(p?.userId) === String(meId());
// Samme regler som Familie-kartet: bare de som deler (sharing on); pauset deling vises ikke.
const people = () => (K.fam?.members ?? []).filter((p) => p.last?.lat != null && (p.sharing === 'on' || p.self) && !p.paused);
const vzOn = () => { if (K.vz) return K.vz; const z = zones()[0]; return z ? { [z.id]: true } : {}; };

/* ---------------- Data (via serveren) ---------------- */
async function api(path, fb) {
  const key = path.split('?')[0];
  if (K.miss[key]) return fb ? fb() : null;
  try { return await hlApi(path); } catch (e) { if (e.status === 404 || e.status === 405) K.miss[key] = true; if (fb) return fb(); throw e; }
}
let saveT = null;
// Serverformen (DATA46, /api/kart/prefs): {z, c:[lat,lon], show:{stops,vehicles,zones,people}, md:[…], vz:[soneId…]}.
const toSrv = () => { const V = K.vz ?? vzOn(); return { z: K.z, c: [K.c.la, K.c.lo], show: { stops: !!K.show.stops, vehicles: !!K.show.veh, zones: !!K.show.zones, people: !!K.show.ppl }, md: MK.filter((k) => K.md[k]), vz: Object.keys(V).filter((k) => V[k]).map((k) => (/^\d+$/.test(k) ? +k : k)) }; };
function fromSrv(v) {
  if (!v || typeof v !== 'object') return;
  if (Number.isFinite(+v.z)) K.z = Math.round(+v.z);
  if (Array.isArray(v.c) && v.c.length === 2) K.c = { la: +v.c[0], lo: +v.c[1] }; else if (v.c?.la != null) K.c = v.c;
  if (v.show) K.show = { stops: v.show.stops !== false, veh: (v.show.vehicles ?? v.show.veh) !== false, zones: v.show.zones !== false, ppl: (v.show.people ?? v.show.ppl) !== false };
  if (Array.isArray(v.md)) K.md = Object.fromEntries(MK.map((k) => [k, v.md.includes(k)]));
  if (Array.isArray(v.vz)) K.vz = Object.fromEntries(v.vz.map((x) => [String(x), true]));
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    ls.set('kart_v1', { z: K.z, c: K.c, show: K.show, md: K.md, vz: K.vz ?? vzOn() });
    if (!K.miss.prefs) hlApi('/kart/prefs', { method: 'PUT', json: toSrv() }).catch((e) => { if (e.status === 404 || e.status === 405) K.miss.prefs = true; });
  }, 500);
}
async function famLoad(force = false) {
  if (!force && K.fam && Date.now() - K.famT < 60000) return;
  K.famT = Date.now();
  // GET /api/kart: soner, personer (samme delingsregler som Familie) og brukervalgene. Eldre server: /api/family.
  let r = null;
  if (!K.miss.base) { try { r = await hlApi('/kart'); } catch (e) { if (e.status === 404 || e.status === 405) K.miss.base = true; } }
  if (r) {
    const synced = !!r.prefs && !K.prefsT; K.prefsT = Date.now();
    // Serveren svarer med standardvalg når brukeren aldri har lagret (z 14, c [59.9225, 10.735], vz []): da gjelder de lokale.
    const P0 = r.prefs, dflt = P0 && +P0.z === 14 && Array.isArray(P0.c) && +P0.c[0] === 59.9225 && +P0.c[1] === 10.735 && !(P0.vz ?? []).length;
    if (synced && P0 && !dflt) { fromSrv(P0); V0.c = V0.c ?? K.c; if (map) map.setView([K.c.la, K.c.lo], K.z, { animate: false }); }
    K.fam = { zones: r.zones ?? [], me: { userId: (r.people ?? []).find((p) => p.self)?.userId }, members: (r.people ?? []).map((p) => ({ userId: p.userId, name: p.fullName ?? p.name, self: !!p.self, color: p.color, photoUrl: p.photoUrl, sharing: 'on', zone: p.zone, last: { lat: p.lat, lon: p.lon, ts: p.updatedAt ? Date.parse(p.updatedAt) : null } })) };
    K.baseSrc = r.source;
  } else { try { K.fam = await hlApi('/family'); } catch { K.fam ??= { members: [], zones: [] }; } }
  // Første gang (ingen lagrede valg): vis sonene og personene.
  if (!V0.c && !K.fitted && map && window.L) { const pts = [...zones().map((z) => [z.lat, z.lon]), ...people().map((p) => [p.last.lat, p.last.lon])]; if (pts.length) { K.fitted = true; map.fitBounds(pts, { maxZoom: 15, paddingBottomRight: [20, wideK() ? 20 : 240], paddingTopLeft: [wideK() ? 400 : 20, 70] }); } }
  paint(); if (m.screen === 'tkart') draw();
}
const bboxOf = () => { const b = map?.getBounds(); return b ? { minLat: b.getSouth(), maxLat: b.getNorth(), minLon: b.getWest(), maxLon: b.getEast() } : null; };
let stQ = 0, stT = null;
function stopsSoon() { clearTimeout(stT); stT = setTimeout(stopsLoad, 450); }
async function stopsLoad() {
  if (!map || K.z < 14 || !K.show.stops) return;
  const B = bboxOf(); if (!B) return;
  const id = ++stQ, qs = new URLSearchParams(Object.fromEntries(Object.entries(B).map(([k, v]) => [k, v.toFixed(5)])));
  const r = await api(`/kart/stops?${qs}`, () => null).catch(() => null);
  if (id !== stQ) return;
  const L = Array.isArray(r) ? r : r?.stops ?? null;
  if (L && L.length) { K.stops = L.slice(0, 400).map((x) => ({ id: x.id, n: x.name ?? x.n, la: +(x.lat ?? x.latitude ?? x.la), lo: +(x.lon ?? x.longitude ?? x.lo), m: [].concat(x.modes ?? x.transportMode ?? x.m ?? 'bus').map(nm) })).filter((x) => Number.isFinite(x.la)); K.stSrc = r?.source === 'demo' ? 'demo' : 'entur'; }
  else if (L) { K.stops = []; K.stSrc = 'entur'; }
  paintStops(); if (m.screen === 'tkart') srcPatch();
}
async function vehLoad() {
  if (!K.show.veh) { K.veh = []; paintVeh(); return; }
  const Z = zones().filter((z) => vzOn()[z.id]);
  if (!Z.length) { K.veh = []; paintVeh(); srcPatch(); return; }
  // Serveren regner ut området (sonesenter ± maks(3 × radius, 1200 m)) og henter fra Entur Vehicles API.
  const r = await api(`/kart/vehicles?zones=${encodeURIComponent(Z.map((z) => z.id).slice(0, 5).join(','))}`, () => null).catch(() => null);
  const L = r?.vehicles ?? null, seen = new Set(), V = [];
  for (const v of L ?? []) { const id = v.id ?? v.vehicleId, la = +(v.lat ?? v.location?.latitude), lo = +(v.lon ?? v.location?.longitude); if (!id || seen.has(id) || !Number.isFinite(la)) continue; seen.add(id); V.push({ id: String(id), l: typeof v.line === 'string' ? v.line : v.line?.publicCode ?? '', m: nm(v.mode), la, lo, b: +(v.bearing ?? 0), to: v.destination ?? v.destinationName ?? '' }); }
  if (L) { K.veh = V; K.vSrc = r.source === 'demo' ? 'demo' : 'entur'; K.vLocal = false; } else { K.veh = []; K.vSrc = 'demo'; K.vLocal = true; }
  paintVeh(); srcPatch();
}
function demoVeh() {
  const t = K.tk * 2, V = [];
  zones().filter((z) => vzOn()[z.id]).forEach((z, zi) => {
    for (let i = 0; i < 6; i++) {
      const [l, md] = DL[(zi * 3 + i) % DL.length], R = 350 + i * 140, sp = (i % 2 ? 1 : -1) * (0.012 + i * 0.002) * (md === 'metro' ? 1.6 : 1), a = i * 1.05 + zi + t * sp;
      V.push({ id: `d${z.id}${i}`, l, m: md, la: z.lat + (R * Math.sin(a)) / 111320, lo: z.lon + (R * Math.cos(a)) / (111320 * Math.cos((z.lat * Math.PI) / 180)), b: (90 - ((a * 180) / Math.PI + (sp > 0 ? 90 : -90))) % 360, to: DDEST[md][i % DDEST[md].length] });
    }
  });
  return V;
}
async function depLoad(st) {
  K.dep = null; draw();
  const norm = (L, src) => ({ src, calls: L.slice(0, 12).map((c) => ({ l: c.line ?? '', m: nm(c.mode ?? c.transportMode), to: c.to ?? c.destination ?? '', q: c.quay?.publicCode ?? c.platform ?? c.quay ?? '', a: new Date(c.aimed ?? c.aimedDepartureTime ?? c.time), e: new Date(c.expected ?? c.expectedDepartureTime ?? c.time), x: !!c.cancelled })).filter((c) => !Number.isNaN(+c.e)) });
  let D = null;
  try { const r = /^NSR:StopPlace:\d+$/.test(st.id) ? await api(`/kart/stops/${encodeURIComponent(st.id)}/departures`, () => null) : null; const L = r?.calls ?? r?.departures ?? null; if (L) D = norm(L, r?.source === 'demo' ? 'demo' : 'entur'); } catch {}
  if (!D && /^NSR:StopPlace:\d+$/.test(st.id)) { try { const r = await hlApi(`/ruter/departures?stop=${encodeURIComponent(st.id)}&n=12`); if (r?.departures?.length) D = norm(r.departures, 'entur'); } catch {} }
  if (!D) {
    const n = Date.now(), C = [];
    (st.m?.length ? st.m : ['bus']).forEach((md, mi) => { const L = DL.filter((x) => x[1] === md); (L.length ? L : [[md === 'rail' ? 'L1' : 'B1', md]]).slice(0, 2).forEach(([l], li) => { for (let k = 0; k < 3; k++) { const a = new Date(n + (mi * 3 + li * 5 + k * 9 + 2) * 60000); C.push({ l, m: md, to: DDEST[md][(li + k) % DDEST[md].length], q: String(li + 1), a, e: new Date(+a + (k === 1 ? 120000 : 0)) }); } }); });
    D = { src: 'demo', calls: C.sort((a, b) => a.e - b.e).slice(0, 10) };
  }
  if (K.sel === st) { K.dep = D; if (m.screen === 'tkart') draw(); }
}
let qT = null, qN = 0;
async function search(q) {
  if (q.trim().length < 2) { K.res = null; draw(); return; }
  const id = ++qN;
  let R = null;
  try { const r = await api(`/kart/search?q=${encodeURIComponent(q)}`, () => null); const L = Array.isArray(r) ? r : r?.results ?? r?.items ?? null; if (L) R = L.map((x) => ({ id: x.id, n: x.name, sub: String(x.label ?? x.sub ?? x.locality ?? '').replace(new RegExp(`^${String(x.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s*`), ''), la: +(x.lat ?? NaN), lo: +(x.lon ?? NaN), m: [].concat(x.modes ?? []).map(nm) })); } catch {}
  if (!R) { try { const L = await hlApi(`/ruter/search?q=${encodeURIComponent(q)}`); if (Array.isArray(L)) R = L.map((x) => { const d = DST.find((y) => y.id === x.id || y.n === x.name); return { id: x.id, n: x.name, sub: x.locality ?? '', la: +(x.lat ?? d?.la ?? NaN), lo: +(x.lon ?? d?.lo ?? NaN), m: (x.modes ?? []).map(nm) }; }); } catch {} }
  if (!R) R = DST.filter((x) => x.n.toLowerCase().includes(q.toLowerCase()));
  if (id !== qN) return;
  K.res = R.slice(0, 8).map((r) => ({ ...r, sub: [r.sub, [...new Set((r.m ?? []).map((x) => MD[x]?.n).filter(Boolean))].join(', ')].filter(Boolean).join(' · ') }));
  draw();
}

/* ---------------- Leaflet-kartet (overlever nye tegninger) ---------------- */
let LF = null, mapEl = null, map = null, layZ = null, layS = null, layV = null, layP = null, vI = null, tI = null, mode0 = '';
function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (LF) return LF;
  LF = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/api/family/vendor/leaflet.css'; document.head.appendChild(css);
    const add = (src, next) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(window.L); s.onerror = next; document.head.appendChild(s); };
    add('/api/family/vendor/leaflet.js', () => { css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; add('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => { LF = null; rej(new Error('Kartet kunne ikke lastes')); }); });
  });
  return LF;
}
const divI = (Lf, html, cls = 'p46k-mk') => Lf.divIcon({ className: cls, html, iconSize: [0, 0] });
function paint() { paintZones(); paintStops(); paintVeh(); paintPpl(); }
function paintZones() {
  const Lf = window.L; if (!map || !Lf) return;
  layZ?.remove(); layZ = Lf.layerGroup().addTo(map);
  if (!K.show.zones) return;
  const V = vzOn();
  for (const z of zones()) {
    const live = !!V[z.id] && K.show.veh;
    Lf.circle([z.lat, z.lon], { radius: z.r, color: z.c, weight: 2, fillColor: z.c, fillOpacity: 0.15, dashArray: V[z.id] ? null : '6 5', interactive: false }).addTo(layZ);
    Lf.marker([z.lat + z.r / 111320, z.lon], { interactive: false, keyboard: false, icon: divI(Lf, `<span class="p46k-zl" style="background:${esc(z.c)}">${esc(z.n)}${live ? '<small>LIVE</small>' : ''}</span>`) }).addTo(layZ);
  }
}
function paintStops() {
  const Lf = window.L; if (!map || !Lf) return;
  layS?.remove(); layS = Lf.layerGroup().addTo(map);
  if (!K.show.stops || K.z < 14) return;
  const sz = K.z >= 16 ? 24 : K.z >= 15 ? 19 : 12, B = map.getBounds().pad(0.15);
  let n = 0;
  for (const st of K.stops) {
    if (n > 350) break;
    if (!st.m.some((x) => K.md[x]) || !B.contains([st.la, st.lo])) continue;
    n++;
    const pm = st.m.find((x) => K.md[x]) ?? st.m[0], on = K.sel?.id === st.id, s = on ? sz + 8 : sz;
    const html = `<button type="button" class="p46k-st${on ? ' on' : ''}" data-p46k="stop" data-id="${esc(st.id)}" aria-label="${esc(st.n)}" style="width:${s}px;height:${s}px;background:${MD[pm].c}">${K.z >= 15 ? svg(MD[pm].p, 12, 2.6, '#fff') : ''}${K.z >= 16 || on ? `<span>${esc(st.n)}</span>` : ''}</button>`;
    Lf.marker([st.la, st.lo], { keyboard: false, zIndexOffset: on ? 400 : 100, icon: divI(Lf, html) }).addTo(layS);
  }
}
const vMk = new Map();
function paintVeh() {
  const Lf = window.L; if (!map || !Lf) return;
  if (!layV) layV = Lf.layerGroup().addTo(map);
  const L = !K.show.veh ? [] : (K.vLocal ? demoVeh() : K.veh).filter((v) => K.md[v.m]);
  const keep = new Set();
  for (const v of L) {
    keep.add(v.id);
    const html = `<span class="p46k-vh${reduce() ? ' rm' : ''}"><i style="transform:rotate(${Math.round(v.b)}deg)"><svg width="34" height="34" viewBox="0 0 34 34"><path d="M17 1l5 7h-10z" fill="${MD[v.m].c}"/></svg></i><b style="background:${MD[v.m].c}">${esc(v.l || MD[v.m].n[0])}</b></span>`;
    const old = vMk.get(v.id);
    if (old) { old.setLatLng([v.la, v.lo]); if (old._h !== html) { old.setIcon(divI(Lf, html, 'p46k-mk p46k-vm')); old._h = html; } }
    else { const mk = Lf.marker([v.la, v.lo], { interactive: false, keyboard: false, zIndexOffset: 600, icon: divI(Lf, html, 'p46k-mk p46k-vm') }).addTo(layV); mk._h = html; vMk.set(v.id, mk); }
  }
  for (const [id, mk] of vMk) if (!keep.has(id)) { mk.remove(); vMk.delete(id); }
}
function paintPpl() {
  const Lf = window.L; if (!map || !Lf) return;
  layP?.remove(); layP = Lf.layerGroup().addTo(map);
  if (!K.show.ppl) return;
  for (const p of people()) {
    const me = isMe(p), c = p.color || '#2b5d8a', ph = p.photoUrl || p.avatarUrl;
    const html = `<button type="button" class="p46k-pp" data-p46k="pfly" data-id="${esc(p.userId)}" aria-label="${esc(me ? 'Du' : p.name ?? '')}">${me && !reduce() ? `<i style="background:${esc(c)}"></i>` : ''}<span style="background-color:${esc(c)}${ph ? `;background-image:url('${esc(ph)}')` : ''}">${ph ? '' : esc(String(p.name ?? '?').slice(0, 1).toUpperCase())}</span><b>${esc(me ? 'Du' : String(p.name ?? '').split(/\s+/)[0])}</b></button>`;
    Lf.marker([p.last.lat, p.last.lon], { keyboard: false, zIndexOffset: 800, icon: divI(Lf, html) }).addTo(layP);
  }
}
function fly(la, lo, z) { K.c = { la, lo }; K.z = z || Math.max(K.z, 15); if (map) map.setView([la, lo], K.z, { animate: !reduce() }); save(); }
function mountMap() {
  const slot = document.getElementById('p46k-slot'); if (!slot) return;
  if (!mapEl) { mapEl = document.createElement('div'); mapEl.className = 'p46k-map'; mapEl.innerHTML = '<div class="p46k-msg">Laster kart …</div>'; }
  if (mapEl.parentNode !== slot) slot.appendChild(mapEl);
  loadLeaflet().then((Lf) => {
    if (!map) {
      mapEl.innerHTML = '';
      map = Lf.map(mapEl, { zoomControl: false, attributionControl: true, minZoom: 11, maxZoom: 18, zoomSnap: 1 }).setView([K.c.la, K.c.lo], K.z);
      map.attributionControl.setPrefix('');
      map.on('moveend zoomend', () => { const c = map.getCenter(), z = map.getZoom(), zc = z !== K.z; K.c = { la: +c.lat.toFixed(5), lo: +c.lng.toFixed(5) }; K.z = z; save(); if (zc) paintStops(); stopsSoon(); });
      map.on('zoomstart', () => mapEl.classList.add('p46k-zooming')); map.on('zoomend', () => mapEl.classList.remove('p46k-zooming'));
      paint(); stopsLoad();
      if (!V0.c && !K.fitted && K.fam) { K.fitted = true; const pts = [...zones().map((z) => [z.lat, z.lon]), ...people().map((p) => [p.last.lat, p.last.lon])]; if (pts.length) map.fitBounds(pts, { maxZoom: 15, paddingBottomRight: [20, wideK() ? 20 : 240], paddingTopLeft: [wideK() ? 400 : 20, 70] }); }
    }
    const md = paperDark() ? 'dark' : 'paper';
    if (md !== mode0) { mode0 = md; mapEl.classList.toggle('p46k-gray', md === 'paper'); setTiles(Lf, map, mapEl, md).catch(() => {}); }
    setTimeout(() => map?.invalidateSize(), 30);
  }).catch((e) => { mapEl.innerHTML = `<div class="p46k-msg">${esc(e.message)}</div>`; });
}
function timers(on) {
  if (on && !vI) { vehLoad(); vI = setInterval(() => { if (document.hidden) return; vehLoad(); }, 10000); tI = setInterval(() => { if (K.vLocal && !document.hidden) { K.tk++; paintVeh(); } }, 2000); }
  if (!on && vI) { clearInterval(vI); clearInterval(tI); vI = null; tI = null; }
}
function srcPatch() { const el = document.querySelector('.p46k-src'); if (el) { const s = srcOf(); el.textContent = s.t; el.style.color = s.c; } }
const srcOf = () => (K.vSrc === 'entur' || K.stSrc === 'entur' || K.baseSrc === 'entur' ? { t: 'SANNTID · ENTUR', c: '#2f7a4f' } : { t: 'DEMO-DATA', c: '#a8661a' });

/* ---------------- Visning ---------------- */
export function kartView() {
  const W = wideK(), z0 = zones(), V = vzOn(), vzN = z0.filter((q) => V[q.id]).length, src = srcOf();
  const sw = (on) => `<span class="p46k-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
  const chips = `<div class="p46k-chips"><button type="button" class="p46k-back p46-back" data-p46k="back">‹ Mer</button>${MK.map((k) => { const on = !!K.md[k]; return `<button type="button" class="p46k-chip${on ? ' on' : ''}" data-p46k="md" data-k="${k}" aria-pressed="${on}"><span style="background:${on ? MD[k].c : '#b9b2a4'}">${svg(MD[k].p, 11, 2.8, '#fff')}</span>${MD[k].n}</button>`; }).join('')}</div>`;
  const ctl = `<div class="p46k-ctl"><div class="p46k-zm"><button type="button" data-p46k="zin" aria-label="Zoom inn">+</button><i></i><button type="button" data-p46k="zout" aria-label="Zoom ut">−</button></div><button type="button" class="p46k-me" data-p46k="tome" aria-label="Min posisjon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3L3 10.5l7.5 2.9L13.4 21z"/></svg></button></div>`;
  const res = K.res ?? [];
  let body = '';
  if (res.length) body = `<div class="p46k-card">${res.map((r, i) => `<button type="button" class="p46k-res" data-p46k="res" data-i="${i}"><b>${esc(r.n)}</b><small>${esc(r.sub)}</small></button>`).join('')}</div>`;
  else if (K.res && K.q.trim().length >= 2) body = `<span class="p46k-mut">Fant ingen holdeplasser som heter «${esc(K.q.trim())}».</span>`;
  else if (K.sel) {
    const D = K.dep, now = Date.now();
    body = `<div class="p46k-sel"><div class="p46k-selh"><span class="m-grow"><span class="p46k-lab red" style="color:#b23a2a">HOLDEPLASS</span><b class="p46k-seln">${esc(K.sel.n)}</b><span class="p46k-mds">${(K.sel.m ?? []).map((x) => `<span style="background:${MD[x].c}">${MD[x].n}</span>`).join('')}</span></span><button type="button" class="p46k-x" data-p46k="selx" aria-label="Lukk">×</button></div>
      <span class="p46k-lab">AVGANGER · ${D ? (D.src === 'entur' ? 'SANNTID FRA ENTUR' : 'DEMO') : '…'}</span>${D ? '' : '<span class="p46k-mut">Henter avganger …</span>'}
      ${D ? `<div class="p46k-card">${D.calls.map((c) => { const mn = Math.round((c.e - now) / 60000), late = Math.round((c.e - c.a) / 60000); return `<div class="p46k-dep${c.x ? ' x' : ''}"><span class="p46k-ln" style="background:${MD[c.m].c}">${esc(c.l)}</span><span class="m-grow"><b>${esc(c.to)}</b><small>${esc([MD[c.m].n, c.q ? `Plattform ${c.q}` : '', c.x ? 'Innstilt' : late > 0 ? `+${late} min forsinket` : ''].filter(Boolean).join(' · '))}</small></span><span class="p46k-t${late > 0 ? ' late' : ''}">${mn <= 0 ? 'nå' : mn <= 30 ? `${mn} min` : hm(c.e)}</span></div>`; }).join('') || '<span class="p46k-mut pad">Ingen avganger de neste to timene.</span>'}</div>` : ''}
      <button type="button" class="p46k-fly" data-p46k="selfly">Vis på kartet</button></div>`;
  } else if (K.tab === 'soner') {
    const me = people().find(isMe);
    body = `<span class="p46k-lab">MINE SONER · ${z0.length}</span>${z0.length ? `<div class="p46k-card pad">${z0.map((q) => { const on = !!V[q.id], here = me && hav(me.last.lat, me.last.lon, q.lat, q.lon) <= q.r; return `<div class="p46k-zr"><button type="button" class="m-grow" data-p46k="zfly" data-id="${esc(q.id)}"><i style="background:${esc(q.c)}"></i><span class="m-grow"><b>${esc(q.n)}</b><small>Radius ${Math.round(q.r)} m${here ? ' · du er her' : ''}</small></span></button><button type="button" class="p46k-live${on ? ' on' : ''}" data-p46k="zlive" data-id="${esc(q.id)}" aria-pressed="${on}" aria-label="Kjøretøy i sanntid for ${esc(q.n)}">${on ? '● Sanntid' : 'Sanntid'}</button></div>`; }).join('')}</div>` : `<span class="p46k-mut">${K.fam ? 'Ingen soner ennå.' : 'Henter soner …'}</span>`}
      <span class="p46k-mut">Slå på «Sanntid» for å se busser, trikker og T-baner som kjører i og rundt sonen. Soner endres under <a href="#/fam">Familie → Soner</a>.</span>`;
  } else if (K.tab === 'ppl') {
    const P = people(), ago = (ts) => { const n = Math.round((Date.now() - ts) / 60000); return !ts ? '' : n <= 1 ? 'nå' : n < 60 ? `${n} min` : `${Math.round(n / 60)} t`; };
    body = `<span class="p46k-lab">PERSONER</span>${P.length ? `<div class="p46k-card pad">${P.map((p) => { const zz = z0.find((q) => hav(p.last.lat, p.last.lon, q.lat, q.lon) <= q.r); return `<button type="button" class="p46k-pr" data-p46k="pfly" data-id="${esc(p.userId)}"><span class="p46k-pa" style="background:${esc(p.color || '#2b5d8a')}">${esc(String(p.name ?? '?').slice(0, 1).toUpperCase())}</span><span class="m-grow"><b>${esc(isMe(p) ? `${p.name} (deg)` : p.name)}</b><small>${zz ? `I sone ${esc(zz.n)}` : 'Utenfor sonene'}</small></span><small>${esc(ago(p.last.ts))}</small></button>`; }).join('')}</div>` : `<span class="p46k-mut">${K.fam ? 'Ingen deler posisjonen sin med deg akkurat nå.' : 'Henter …'}</span>`}`;
  } else {
    const L = [['stops', 'Holdeplasser', 'Buss, T-bane, trikk, tog og båt', 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', '#b23a2a'], ['veh', 'Kjøretøy i sanntid', vzN ? `I ${vzN} ${vzN === 1 ? 'sone' : 'soner'}` : 'Velg soner under Soner', MD.bus.p, '#2b6fb3'], ['zones', 'Mine soner', `${z0.length} ${z0.length === 1 ? 'sone' : 'soner'} fra Familie`, 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9v6M9 12h6', '#2f6b4a'], ['ppl', 'Personer', 'Hvor familien er nå', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7', '#5b4bb5']];
    body = `<span class="p46k-lab">VIS PÅ KARTET</span><div class="p46k-card pad">${L.map(([k, n, s, p, c]) => `<button type="button" class="p46k-lay" data-p46k="lay" data-k="${k}" role="switch" aria-checked="${!!K.show[k]}"><span class="p46k-li" style="background:color-mix(in srgb, ${c} 14%, var(--pp-card,#fff));color:${c}">${svg(p, 16)}</span><span class="m-grow"><b>${n}</b><small>${esc(s)}</small></span>${sw(!!K.show[k])}</button>`).join('')}</div>
      <span class="p46k-mut">Holdeplasser vises når du zoomer inn. Busser, trikker og T-baner i sanntid vises i sonene du har valgt under Soner.</span>`;
  }
  const tabs = !K.sel && !res.length ? `<div class="p46k-tabs" role="tablist">${[['lag', 'Lag'], ['soner', 'Soner'], ['ppl', 'Personer']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${K.tab === k}" class="${K.tab === k ? 'on' : ''}" data-p46k="tab" data-k="${k}">${n}</button>`).join('')}</div>` : '';
  const panel = `<div class="p46k-pan${W ? ' wide' : ` s-${K.sheet}`}">${W ? '' : '<button type="button" class="p46k-hdl" data-p46k="sheet" aria-label="Endre størrelse"><span></span></button>'}
    <div class="p46k-ph"><div class="p46k-tt"><b>Kart</b><span class="p46k-src" style="color:${src.c}">${src.t}</span></div>
      <label class="p46k-q">${svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4', 16, 2)}<input id="p46k-q" data-p46kin="q" value="${esc(K.q)}" placeholder="Søk etter holdeplass" autocomplete="off" enterkeyhint="search" aria-label="Søk etter holdeplass">${K.q ? '<button type="button" data-p46k="qx" aria-label="Tøm søket">×</button>' : ''}</label>${tabs}</div>
    <div class="p46k-pb">${body}</div></div>`;
  return `<div class="p46k${W ? ' wide' : ''}"><div class="p46k-slot" id="p46k-slot"></div>${chips}${ctl}${panel}</div>`;
}

/* ---------------- Kroker ---------------- */
export function afterKart() {
  if (m.screen !== 'tkart') { timers(false); return; }
  mountMap(); timers(true);
}
export function loadKart(sub) {
  // Dyp lenke fra Glimt: #/tkart/sone/<id eller navn> → fly dit med sanntid på.
  let mm = /^sone\/(.+)$/.exec(sub ?? '');
  const q = globalThis.__p46kq ? new URLSearchParams(globalThis.__p46kq) : null; globalThis.__p46kq = null;
  if (!mm && q && (q.get('zone') || q.get('sone'))) mm = [null, encodeURIComponent(q.get('zone') || q.get('sone'))];
  const go = () => { if (!mm) return; const k = decodeURIComponent(mm[1]).toLowerCase(), z = zones().find((q) => q.id.toLowerCase() === k || q.n.toLowerCase() === k); if (z) { K.vz = { ...vzOn(), [z.id]: true }; K.show = { ...K.show, veh: true }; fly(z.lat, z.lon, 15); paintZones(); vehLoad(); draw(); } };
  return famLoad().then(go);
}
export async function bindKart(e, t) {
  if (m.screen !== 'tkart') return false;
  const x = t.closest?.('[data-p46k]'); if (!x) return false;
  e.preventDefault();
  const a = x.dataset.p46k, id = x.dataset.id;
  switch (a) {
    case 'back': if (history.length > 1) history.back(); else location.hash = '#/mer'; return true;
    case 'md': K.md = { ...K.md, [x.dataset.k]: !K.md[x.dataset.k] }; haptic('tab'); save(); paintStops(); paintVeh(); break;
    case 'zin': map?.zoomIn(); haptic('tap'); return true;
    case 'zout': map?.zoomOut(); haptic('tap'); return true;
    case 'tome': {
      haptic('tap');
      const me = people().find(isMe);
      if ('geolocation' in navigator) navigator.geolocation.getCurrentPosition((p) => fly(p.coords.latitude, p.coords.longitude, 16), () => { if (me) fly(me.last.lat, me.last.lon, 16); }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 });
      else if (me) fly(me.last.lat, me.last.lon, 16);
      return true;
    }
    case 'sheet': K.sheet = K.sheet === 'peek' ? 'half' : K.sheet === 'half' ? 'full' : 'peek'; haptic('tap'); break;
    case 'tab': K.tab = x.dataset.k; if (!wideK() && K.sheet === 'peek') K.sheet = 'half'; haptic('tab'); break;
    case 'lay': K.show = { ...K.show, [x.dataset.k]: !K.show[x.dataset.k] }; haptic('tab'); save(); paint(); if (x.dataset.k === 'veh') vehLoad(); if (x.dataset.k === 'stops') stopsLoad(); break;
    case 'zlive': { const V = vzOn(), on = !V[id]; K.vz = { ...V, [id]: on }; K.show = { ...K.show, veh: true }; haptic('tab'); save(); paintZones(); vehLoad(); break; }
    case 'zfly': { const z = zones().find((q) => q.id === id); if (z) { fly(z.lat, z.lon, 15); haptic('tap'); } return true; }
    case 'pfly': { const p = people().find((q) => String(q.userId) === id); if (p) { fly(p.last.lat, p.last.lon, 16); if (!wideK()) K.sheet = 'peek'; haptic('tap'); } break; }
    case 'stop': { const st = K.stops.find((s) => s.id === id); if (!st) return true; K.sel = st; K.res = null; K.q = ''; if (!wideK() && K.sheet === 'peek') K.sheet = 'half'; haptic('tap'); paintStops(); depLoad(st); return true; }
    case 'selx': K.sel = null; K.dep = null; paintStops(); break;
    case 'selfly': if (K.sel) { fly(K.sel.la, K.sel.lo, 16); if (!wideK()) K.sheet = 'peek'; } break;
    case 'res': { const r = K.res?.[+x.dataset.i]; if (!r) return true; const st = { id: r.id, n: r.n, la: r.la, lo: r.lo, m: r.m?.length ? r.m : ['bus'] }; K.res = null; K.q = ''; K.sel = st; if (Number.isFinite(r.la)) { if (!K.stops.some((s) => s.id === st.id)) K.stops = [...K.stops, st]; fly(r.la, r.lo, 16); } if (!wideK() && K.sheet === 'peek') K.sheet = 'half'; haptic('tap'); paintStops(); depLoad(st); return true; }
    case 'qx': K.q = ''; K.res = null; break;
    default: return false;
  }
  draw(); return true;
}
export function inputKart(e, t) {
  if (!t.matches?.('[data-p46kin="q"]')) return false;
  K.q = t.value; clearTimeout(qT);
  if (!K.q.trim()) { K.res = null; draw(); return true; }
  qT = setTimeout(() => search(K.q), 280); return true;
}
export function leaveKart() { timers(false); }
