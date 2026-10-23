// Prompt 46 (WEB46, claude-code-kart-side.md, fasit design/Kart.dc.html): Kart på web.
// Holdeplasser (Entur, fra zoom 14), filter per transportmiddel, Mine soner (samme som Familie → Soner), personer som deler
// posisjon med deg (samme regler som Familie), og kjøretøy i sanntid bare for soner man har valgt («Sanntid»).
// - Alle Entur-kall går via serveren (EP under, ET-Client-Name settes der). Svarer ikke serveren, vises «DEMO-DATA».
// - Brukervalg kart_v1 = {z, c, show, md, vz} lagres per bruker på serveren (synkes), med localStorage som reserve.
// - Bred visning (≥ 900 px): fast panel til venstre (372 px). Smalere: bunnark med tre høyder (lav/halv/høy).
// - Adressen #/kart?sone=Hjem&live=1 (Glimt «vis bussene rundt hjemme») åpner kartet på sonen med sanntid på.
// Kartet er Leaflet fra egen server (samme som Familie) med Kartverket-fliser via /tiles (gråtone når serveren har den).
import { api, esc } from './util.js';

// Server-API (DATA46, server/kart46.js): GET /api/kart → {prefs, zones, people, source}; /kart/stops?minLat&minLon&maxLat&maxLon;
// /kart/stops/:id/departures → {source, stop, calls}; /kart/vehicles?zones=1,2 → {source, vehicles}; /kart/search?q= → {results};
// GET/PUT /kart/prefs {z, c:[la,lo], show:{stops,vehicles,zones,people}, md:[…], vz:[…]}. Formene tåler også rå Entur-svar.
const EP = {
  state: '/kart',
  stops: (b) => `/kart/stops?minLat=${b.s.toFixed(5)}&minLon=${b.w.toFixed(5)}&maxLat=${b.n.toFixed(5)}&maxLon=${b.e.toFixed(5)}`,
  vehicles: (ids) => `/kart/vehicles?zones=${ids.map(encodeURIComponent).join(',')}`,
  departures: (id) => `/kart/stops/${encodeURIComponent(id)}/departures`,
  search: (q) => `/kart/search?q=${encodeURIComponent(q)}`,
  prefs: '/kart/prefs',
};
// Serverens form ↔ vår (kart_v1 i fasiten: show {stops, veh, zones, ppl}, md {bus:true…}, vz {id:true}).
const fromSrv = (p) => (!p || typeof p !== 'object' ? null : {
  z: p.z, c: Array.isArray(p.c) ? { la: +p.c[0], lo: +p.c[1] } : p.c,
  show: p.show ? { stops: p.show.stops, veh: p.show.vehicles ?? p.show.veh, zones: p.show.zones, ppl: p.show.people ?? p.show.ppl } : undefined,
  md: Array.isArray(p.md) ? Object.fromEntries(MK.map((k) => [k, p.md.includes(k)])) : p.md,
  vz: Array.isArray(p.vz) ? Object.fromEntries(p.vz.map((id) => [String(id), true])) : p.vz,
});
const toSrv = (p) => ({ z: p.z, c: [p.c.la, p.c.lo], show: { stops: !!p.show.stops, vehicles: !!p.show.veh, zones: !!p.show.zones, people: !!p.show.ppl }, md: MK.filter((k) => p.md[k]), vz: Object.keys(p.vz ?? {}).filter((k) => p.vz[k]).map((k) => (/^\d+$/.test(k) ? +k : k)) });

const MD = {
  bus: { n: 'Buss', c: '#c8372d', p: 'M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2zM4 11h16M7 20v-4M17 20v-4' },
  metro: { n: 'T-bane', c: '#d9661f', p: 'M5 5h14M12 5v15' },
  tram: { n: 'Trikk', c: '#2b6fb3', p: 'M7 7h10v9H7zM9 3h6M12 3v4M8 21l2-5M16 21l-2-5' },
  rail: { n: 'Tog', c: '#2f7a4f', p: 'M7 3h10v12H7zM7 10h10M9 19l-2 2M15 19l2 2' },
  water: { n: 'Båt', c: '#5b4bb5', p: 'M3 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M6 13l1-5h10l1 5M12 4v4' },
};
const MK = ['bus', 'metro', 'tram', 'rail', 'water'];
const nm = (m) => { m = String(m || '').toLowerCase(); return m === 'coach' ? 'bus' : m === 'ferry' ? 'water' : m === 'funicular' || m === 'cableway' ? 'tram' : MD[m] ? m : 'bus'; };
const svg = (d, sz = 16, sw = 2, col = 'currentColor') => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const hav = (a, b, c, d) => { const R = 6371e3, p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const hm = (d) => d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const HEX = /^#[0-9a-f]{6}$/i;
const ZCOL = ['#b23a2a', '#2b5d8a', '#a8661a', '#2f6b45', '#5b4bb5', '#7a3b6b'];
const PCOL = ['#b23a2a', '#2b5d8a', '#2f6b45', '#a8661a', '#7a3b6b'];
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reserve når Entur ikke svarer (samme holdeplasser som fasiten).
const DST = [['NSR:StopPlace:58404', 'Nationaltheatret', 59.9147, 10.7317, ['metro', 'tram', 'rail', 'bus']], ['NSR:StopPlace:58405', 'Stortinget', 59.9131, 10.7426, ['metro']], ['NSR:StopPlace:58366', 'Jernbanetorget', 59.9118, 10.7499, ['metro', 'tram', 'bus']], ['NSR:StopPlace:58381', 'Majorstuen', 59.9296, 10.7150, ['metro', 'tram', 'bus']], ['NSR:StopPlace:6488', 'Bislett', 59.9254, 10.7329, ['tram']], ['NSR:StopPlace:6505', 'Holbergs plass', 59.9196, 10.7340, ['tram', 'bus']], ['NSR:StopPlace:6452', 'Frogner plass', 59.9223, 10.7062, ['tram']], ['NSR:StopPlace:6562', 'Aker brygge', 59.9106, 10.7280, ['water', 'bus']], ['NSR:StopPlace:6274', 'Schous plass', 59.9201, 10.7595, ['tram']], ['NSR:StopPlace:58195', 'Carl Berners plass', 59.9256, 10.7779, ['metro', 'bus']], ['NSR:StopPlace:337', 'Oslo S', 59.9105, 10.7530, ['rail']], ['NSR:StopPlace:58227', 'Ullevål stadion', 59.9483, 10.7340, ['metro', 'tram']], ['NSR:StopPlace:58193', 'Forskningsparken', 59.9431, 10.7179, ['metro', 'tram']], ['NSR:StopPlace:6435', 'Adamstuen', 59.9339, 10.7356, ['tram']], ['NSR:StopPlace:6213', 'Alexander Kiellands plass', 59.9283, 10.7517, ['bus', 'tram']], ['NSR:StopPlace:6334', 'Stensgata', 59.9282, 10.7271, ['bus']], ['NSR:StopPlace:6467', 'Dalsbergstien', 59.9261, 10.7343, ['tram']], ['NSR:StopPlace:6431', 'Welhavens gate', 59.9227, 10.7313, ['bus']], ['NSR:StopPlace:6503', 'Pilestredet', 59.9206, 10.7350, ['bus']]].map(([id, n, la, lo, m]) => ({ id, n, la, lo, m }));
const DL = [['31', 'bus'], ['37', 'bus'], ['54', 'bus'], ['17', 'tram'], ['18', 'tram'], ['4', 'metro'], ['5', 'metro'], ['20', 'bus'], ['11', 'tram'], ['12', 'tram']];
const DDEST = { bus: ['Tonsenhagen', 'Nydalen', 'Kjelsås', 'Snarøya', 'Galgeberg'], tram: ['Rikshospitalet', 'Ljabru', 'Majorstuen', 'Kjelsås'], metro: ['Vestli', 'Sognsvann', 'Bergkrystallen', 'Ringen'], rail: ['Lillehammer', 'Drammen', 'Gardermoen'], water: ['Nesodden', 'Hovedøya'] };

const LS = 'kart_v1';
const DEF = { z: 15, c: { la: 59.9235, lo: 10.7345 }, show: { stops: true, veh: true, zones: true, ppl: true }, md: { bus: true, metro: true, tram: true, rail: true, water: true }, vz: null };
const S = { p: null, zones: [], ppl: [], stops: DST, stSrc: 'demo', veh: [], vSrc: 'demo', vOk: false, tab: 'lag', sheet: 'peek', q: '', res: null, sel: null, dep: null, tk: 0 };
let map = null, L = null, layers = null, host = null, timers = [], vMarks = new Map(), saveT = 0, stopT = 0, qT = 0, seq = { st: 0, q: 0, dep: 0 };

/* ---------------- Lagring ---------------- */
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* privat modus */ } };
function normPrefs(v) {
  const o = v && typeof v === 'object' ? v : {};
  const c = o.c && Number.isFinite(+o.c.la) && Number.isFinite(+o.c.lo) ? { la: +o.c.la, lo: +o.c.lo } : DEF.c;
  return { z: Math.max(11, Math.min(18, Number.isFinite(+o.z) ? Math.round(+o.z) : DEF.z)), c, show: { ...DEF.show, ...(o.show ?? {}) }, md: { ...DEF.md, ...(o.md ?? {}) }, vz: o.vz && typeof o.vz === 'object' ? { ...o.vz } : null };
}
let state0 = null; // GET /api/kart (prefs, soner og personer i ett kall)
async function loadPrefs() {
  let v = null;
  try {
    state0 = await api(EP.state);
    const sp = state0?.prefs;
    // Serverens standardvalg (aldri lagret) regnes som «første gang»: da gjelder lokalt lagret valg, ellers fasitens standard.
    const isDef = sp && sp.z === 14 && Array.isArray(sp.c) && sp.c[0] === 59.9225 && sp.c[1] === 10.735 && !(sp.vz ?? []).length;
    v = isDef ? null : fromSrv(sp ?? null);
  } catch { state0 = null; }
  if (!v && !state0) { try { const r = await api(EP.prefs); v = fromSrv(r?.kart_v1 ?? r?.prefs ?? r); if (!v || !('z' in v || 'show' in v)) v = null; } catch { /* 404: eldre server */ } }
  if (!v) { try { const l = await api('/me/layout'); v = l?.kart_v1 ?? null; } catch { /* */ } }
  const src = v ?? lsGet();
  return { ...normPrefs(src), fresh: !src };
}
let layoutOk = true; // eldre server avviser ukjente felt i /me/layout (400): da prøves det ikke igjen
function savePrefs() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const v = { z: S.p.z, c: S.p.c, show: S.p.show, md: S.p.md, vz: S.p.vz ?? {} };
    lsSet(v);
    try { await api(EP.prefs, { method: 'PUT', json: toSrv(S.p) }); } catch { if (layoutOk) api('/me/layout', { method: 'PUT', json: { kart_v1: v } }).catch((e) => { if (e.status === 400) layoutOk = false; }); }
  }, 400);
}

/* ---------------- Data ---------------- */
const normZones = (L) => (L ?? []).filter((z) => Number.isFinite(+z.lat) && Number.isFinite(+z.lon)).map((z, i) => ({ id: String(z.id ?? `z${i}`), n: z.name ?? 'Sone', lat: +z.lat, lon: +z.lon, r: Math.round(+z.radius || 150), c: HEX.test(z.color ?? '') ? z.color : ZCOL[i % ZCOL.length] }));
async function loadFamily(fresh) {
  // Fra /api/kart (samme delingsregler som Familie, avgjort på serveren). Eldre server: /api/family med samme filter her.
  try {
    const d = fresh || !state0 ? await api(EP.state) : state0; state0 = null;
    if (!Array.isArray(d?.zones) || !Array.isArray(d?.people)) throw new Error('mangler');
    S.zones = normZones(d.zones);
    S.ppl = d.people.filter((m) => Number.isFinite(+m.lat)).map((m, i) => ({ id: m.userId, me: !!m.self, n: m.self ? (m.fullName || 'Du') : (m.fullName || m.name || 'Ukjent'), c: HEX.test(m.color ?? '') ? m.color : PCOL[i % PCOL.length], la: +m.lat, lo: +m.lon, ts: Date.parse(m.updatedAt ?? '') || null, photo: m.photoUrl ?? null }));
    if (!S.p.vz) { S.p.vz = {}; const h = S.zones.find((z) => /^hjem/i.test(z.n)) ?? S.zones[0]; if (h) S.p.vz[h.id] = true; }
    return;
  } catch { /* faller tilbake til Familie */ }
  try {
    const d = await api('/family');
    S.zones = normZones(d?.zones);
    // Samme regler som Familie: du selv, og andre bare når de deler med deg (sharing «on»). Pauset/av vises ikke.
    S.ppl = (d?.members ?? []).filter((m) => m.last && Number.isFinite(+m.last.lat) && (m.self || m.sharing === 'on')).map((m, i) => ({
      id: m.userId, me: !!m.self, n: m.name || m.username || 'Ukjent', c: HEX.test(m.color ?? '') ? m.color : PCOL[i % PCOL.length], la: +m.last.lat, lo: +m.last.lon, ts: m.last.ts, photo: m.photoUrl ?? m.avatarUrl ?? null }));
  } catch { S.zones = []; S.ppl = []; }
  if (!S.p.vz) { S.p.vz = {}; const h = S.zones.find((z) => /^hjem/i.test(z.n)) ?? S.zones[0]; if (h) S.p.vz[h.id] = true; }
}
const asStop = (x) => ({ id: x.id, n: x.name ?? x.n, la: +(x.latitude ?? x.lat ?? x.la), lo: +(x.longitude ?? x.lon ?? x.lo), m: [].concat(x.modes ?? x.transportMode ?? x.m ?? 'bus').map(nm).filter((v, i, a) => a.indexOf(v) === i) });
function bbox() { const b = map.getBounds(); return { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() }; }
async function fetchStops() {
  if (!map || map.getZoom() < 14) return;
  const id = ++seq.st;
  try {
    const r = await api(EP.stops(bbox()));
    if (id !== seq.st) return;
    const list = Array.isArray(r) ? r : r?.stops ?? r?.data?.stopPlacesByBbox ?? r?.stopPlacesByBbox ?? [];
    S.stops = list.map(asStop).filter((x) => x.id && Number.isFinite(x.la)).slice(0, 400);
    S.stSrc = r?.source === 'demo' || r?.demo ? 'demo' : 'entur';
  } catch { if (id === seq.st) { S.stops = DST; S.stSrc = 'demo'; } }
  drawStops(); paintSrc();
}
const liveZones = () => S.zones.filter((z) => S.p.vz?.[z.id]);
async function fetchVeh() {
  if (!S.p.show.veh) { S.veh = []; drawVeh(); return; }
  const Z = liveZones();
  if (!Z.length) { S.veh = []; S.vSrc = S.vOk ? 'entur' : S.vSrc; drawVeh(); paintSrc(); return; }
  try {
    const r = await api(EP.vehicles(Z.map((z) => z.id)));
    const list = Array.isArray(r) ? r : r?.vehicles ?? r?.data?.vehicles ?? [];
    const seen = new Set();
    S.veh = list.filter((v) => { const k = v.vehicleId ?? v.id; if (seen.has(k)) return false; seen.add(k); return true; }).map((v) => ({ id: String(v.vehicleId ?? v.id), l: v.line?.publicCode ?? v.line ?? v.l ?? '', m: nm(v.mode ?? v.m), la: +(v.location?.latitude ?? v.lat ?? v.la), lo: +(v.location?.longitude ?? v.lon ?? v.lo), b: +(v.bearing ?? v.b ?? 0) || 0, to: v.destination ?? v.destinationName ?? v.to ?? '' })).filter((v) => Number.isFinite(v.la));
    S.vSrc = r?.source === 'demo' || r?.demo ? 'demo' : 'entur'; S.vOk = S.vSrc === 'entur'; S.vLocal = false;
  } catch { S.vSrc = 'demo'; S.vOk = false; S.vLocal = true; }
  drawVeh(); paintSrc();
}
// Demo-kjøretøy: går i ring rundt sonene med sanntid på (fasiten).
function demoVeh() {
  const t = S.tk * 2, V = [];
  liveZones().forEach((z, zi) => {
    for (let i = 0; i < 6; i++) {
      const [l, m] = DL[(zi * 3 + i) % DL.length], R = 350 + i * 140, sp = (i % 2 ? 1 : -1) * (0.012 + i * 0.002) * (m === 'metro' ? 1.6 : 1), a = i * 1.05 + zi + t * sp;
      const dla = R * Math.sin(a) / 111320, dlo = R * Math.cos(a) / (111320 * Math.cos(z.lat * Math.PI / 180)), bd = (90 - (a * 180 / Math.PI + (sp > 0 ? 90 : -90))) % 360;
      V.push({ id: `${z.id}-${i}`, l, m, la: z.lat + dla, lo: z.lon + dlo, b: bd, to: DDEST[m][i % DDEST[m].length] });
    }
  });
  return V;
}
function demoDeps(st) {
  const now = Date.now(), ms = st.m?.length ? st.m : ['bus'];
  const lines = DL.filter(([, m]) => ms.includes(m)); const L2 = lines.length ? lines : ms.map((m, i) => [String(10 + i * 7), m]);
  return Array.from({ length: 10 }, (_, i) => { const [l, m] = L2[i % L2.length], a = new Date(now + (2 + i * 4) * 60000), late = i % 4 === 2 ? 2 : 0; return { l, m, to: DDEST[m][i % DDEST[m].length], q: String.fromCharCode(65 + (i % 3)), a, e: new Date(+a + late * 60000) }; });
}
async function pick(st) {
  S.sel = st; S.dep = null; S.res = null; S.q = '';
  if (S.sheet === 'peek') S.sheet = 'half';
  paintPanel(); drawStops();
  const id = ++seq.dep;
  try {
    const r = await api(EP.departures(st.id));
    if (id !== seq.dep || S.sel !== st) return;
    const calls = r?.calls ?? r?.departures ?? r?.estimatedCalls ?? r?.data?.stopPlace?.estimatedCalls ?? r?.stopPlace?.estimatedCalls ?? [];
    if (!calls.length && !Array.isArray(r?.calls ?? r?.departures)) throw new Error('tom');
    S.dep = { src: r?.source === 'demo' ? 'demo' : 'entur', calls: calls.map((c) => ({ l: c.line?.publicCode ?? c.line ?? c.serviceJourney?.line?.publicCode ?? '', m: nm(c.mode ?? c.serviceJourney?.line?.transportMode), to: c.to ?? c.destination ?? c.destinationDisplay?.frontText ?? '', q: c.platform ?? c.quay?.publicCode ?? '', a: new Date(c.aimed ?? c.aimedDepartureTime), e: new Date(c.expected ?? c.expectedDepartureTime ?? c.aimed ?? c.aimedDepartureTime) })).filter((c) => !Number.isNaN(+c.e)).slice(0, 12) };
  } catch { if (id === seq.dep && S.sel === st) S.dep = { src: 'demo', calls: demoDeps(st) }; }
  if (S.sel === st) paintPanel();
}
async function search(q) {
  if (q.trim().length < 2) { S.res = null; return paintPanel(); }
  const id = ++seq.q;
  try {
    const r = await api(EP.search(q));
    if (id !== seq.q) return;
    const list = Array.isArray(r) ? r : r?.results ?? r?.features ?? [];
    S.res = list.map((f) => { const p = f.properties ?? f, g = f.geometry?.coordinates; const m = [].concat(p.modes ?? p.category ?? []).map(nm).filter((v, i, a) => a.indexOf(v) === i);
      const place = p.locality ?? p.county ?? (p.label && p.label !== p.name ? String(p.label).split(',').slice(1).join(',').trim() : '');
      return { id: p.id, n: p.name, sub: [place, m.map((x) => MD[x].n).join(', ')].filter(Boolean).join(' · '), la: +(g ? g[1] : p.lat ?? p.la), lo: +(g ? g[0] : p.lon ?? p.lo), m }; }).filter((x) => x.id && Number.isFinite(x.la)).slice(0, 6);
  } catch {
    if (id !== seq.q) return;
    S.res = DST.filter((x) => x.n.toLowerCase().includes(q.trim().toLowerCase())).map((x) => ({ ...x, sub: x.m.map((m) => MD[m].n).join(', ') }));
  }
  paintPanel();
}

/* ---------------- Kart ---------------- */
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!document.querySelector('link[data-leaflet]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/api/family/vendor/leaflet.css'; l.dataset.leaflet = '1';
    document.head.appendChild(l);
  }
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/api/family/vendor/leaflet.js';
    s.onload = () => res(window.L); s.onerror = () => rej(new Error('Kunne ikke laste kartet'));
    document.head.appendChild(s);
  });
}
const isDark = () => document.documentElement.dataset.hl !== '2c' || document.documentElement.getAttribute('data-mode') === 'dark';
async function addTiles() {
  // Gråtone fra serveren hvis den finnes (topograatone), ellers topo med gråtonefilter (samme uttrykk som fasiten).
  let cfg = null; try { cfg = await api('/config/map'); } catch { /* */ }
  const t = cfg?.tiles ?? {}, k = ['topograatone', 'graatone', 'gray', 'grey'].find((x) => t[x]);
  const url = String(k ? t[k] : t.topo ?? '/tiles/topo/{z}/{x}/{y}.png').replace('{r}', '');
  host.dataset.tiles = k ? 'graa' : 'topo';
  L.tileLayer(url, { minZoom: 11, maxZoom: 18, maxNativeZoom: 18, crossOrigin: true, attribution: '© <a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a> · Entur' }).addTo(map);
}
const wide = () => (host?.clientWidth ?? 0) >= 900;
const sheetH = () => { const H = host?.clientHeight ?? 700; return { peek: 228, half: Math.round(H * 0.52), full: Math.round(H * 0.86) }[S.sheet]; };
/** Sentrum som ligger midt i den synlige delen (ved siden av panelet / over bunnarket). */
function offset() { return wide() ? [-194, 0] : [0, Math.round(sheetH() / 2) - 20]; }
function fly(la, lo, z) {
  if (!map) return;
  const zz = z ?? Math.max(map.getZoom(), 15), [dx, dy] = offset();
  const p = map.project([la, lo], zz).add([dx, dy]);
  map.setView(map.unproject(p, zz), zz, { animate: !reduce() });
}
function visCenter() { const [dx, dy] = offset(), p = map.project(map.getCenter(), map.getZoom()).subtract([dx, dy]); const c = map.unproject(p, map.getZoom()); return { la: +c.lat.toFixed(5), lo: +c.lng.toFixed(5) }; }

function drawZones() {
  if (!layers) return;
  layers.zones.clearLayers();
  if (!S.p.show.zones) return;
  for (const z of S.zones) {
    const on = !!S.p.vz?.[z.id];
    L.circle([z.lat, z.lon], { radius: z.r, color: z.c, weight: 2, dashArray: on ? null : '6 5', fillColor: z.c, fillOpacity: 0.15, interactive: false }).addTo(layers.zones);
    L.marker([z.lat + z.r / 111320, z.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'k46-zl-w', html: `<span class="k46-zl" style="background:${esc(z.c)}">${esc(z.n)}${on && S.p.show.veh ? '<em>LIVE</em>' : ''}</span>`, iconSize: [0, 0], iconAnchor: [0, 6] }) }).addTo(layers.zones);
  }
}
function drawStops() {
  if (!layers) return;
  layers.stops.clearLayers();
  const z = map.getZoom();
  if (!S.p.show.stops || z < 14) return;
  const sz = z >= 16 ? 24 : z >= 15 ? 19 : 12, b = map.getBounds().pad(0.1);
  let n = 0;
  for (const st of S.stops) {
    if (n >= 350) break;
    const pm = st.m.find((m) => S.p.md[m]);
    if (!pm || !b.contains([st.la, st.lo])) continue;
    n++;
    const on = S.sel?.id === st.id, s2 = on ? sz + 8 : sz, d = MD[pm];
    const html = `<span class="k46-st${on ? ' on' : ''}" style="width:${s2}px;height:${s2}px;background:${d.c}">${z >= 15 ? svg(d.p, 12, 2.6, '#fff') : ''}</span>${z >= 16 || on ? `<span class="k46-stn">${esc(st.n)}</span>` : ''}`;
    const mk = L.marker([st.la, st.lo], { title: st.n, keyboard: true, zIndexOffset: on ? 700 : 0, icon: L.divIcon({ className: 'k46-st-w', html, iconSize: [s2, s2], iconAnchor: [s2 / 2, s2 / 2] }) }).addTo(layers.stops);
    mk.on('click', () => pick(st));
  }
}
function drawVeh() {
  if (!layers) return;
  const list = !S.p.show.veh ? [] : (S.vLocal ? demoVeh() : S.veh).filter((v) => S.p.md[v.m]);
  const keep = new Set();
  for (const v of list) {
    keep.add(v.id);
    const d = MD[v.m], html = `<span class="k46-vh" style="--c:${d.c}"><i style="transform:rotate(${Math.round(v.b)}deg)">${'<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><path d="M17 1l5 7h-10z" fill="currentColor"/></svg>'}</i><b>${esc(v.l || d.n[0])}</b></span>`;
    let mk = vMarks.get(v.id);
    if (!mk) {
      mk = L.marker([v.la, v.lo], { interactive: false, keyboard: false, zIndexOffset: 500, icon: L.divIcon({ className: `k46-vm${S.vLocal ? ' demo' : ''}`, html, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(layers.veh);
      vMarks.set(v.id, mk); mk._h = html;
    } else {
      mk.setLatLng([v.la, v.lo]);
      if (mk._h !== html) { const el = mk.getElement(); if (el) el.innerHTML = html; mk._h = html; }
    }
  }
  for (const [id, mk] of vMarks) if (!keep.has(id)) { layers.veh.removeLayer(mk); vMarks.delete(id); }
}
function drawPeople() {
  if (!layers) return;
  layers.ppl.clearLayers();
  if (!S.p.show.ppl) return;
  for (const p of S.ppl) {
    const html = `<span class="k46-pp${p.me ? ' me' : ''}" style="--c:${esc(p.c)}">${p.me ? '<i></i>' : ''}<b>${p.photo ? `<img src="${esc(p.photo)}" alt="" onerror="this.remove()">` : ''}${esc(p.n.slice(0, 1).toUpperCase())}</b><em>${esc(p.me ? 'Du' : p.n)}</em></span>`;
    const mk = L.marker([p.la, p.lo], { title: p.me ? 'Du' : p.n, zIndexOffset: 800, icon: L.divIcon({ className: 'k46-pp-w', html, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(layers.ppl);
    mk.on('click', () => fly(p.la, p.lo, 16));
  }
}
const drawAll = () => { drawZones(); drawStops(); drawVeh(); drawPeople(); };

/* ---------------- Panel ---------------- */
const zoneOf = (la, lo) => S.zones.find((q) => hav(la, lo, q.lat, q.lon) <= q.r);
const ago = (ts) => { const m = Math.round((Date.now() - (+ts || Date.now())) / 60000); return m <= 1 ? 'nå' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} t` : `${Math.round(m / 1440)} d`; };
function srcLabel() {
  const live = liveZones().length && S.p.show.veh;
  const demo = live ? S.vSrc === 'demo' : S.stSrc === 'demo';
  return demo ? '<span class="k46-src demo">DEMO-DATA</span>' : '<span class="k46-src">SANNTID · ENTUR</span>';
}
function paintSrc() { const el = host?.querySelector('[data-k46-src]'); if (el) el.innerHTML = srcLabel(); }
function lagHtml() {
  const vzN = liveZones().length, me = S.ppl.find((p) => p.me);
  const rows = [['stops', 'Holdeplasser', 'Buss, T-bane, trikk, tog og båt', 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'red'],
    ['veh', 'Kjøretøy i sanntid', vzN ? `I ${vzN} ${vzN === 1 ? 'sone' : 'soner'}` : 'Velg soner under Soner', MD.bus.p, 'blue'],
    ['zones', 'Mine soner', `${S.zones.length} ${S.zones.length === 1 ? 'sone' : 'soner'} fra Familie`, 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9v6M9 12h6', 'green'],
    ['ppl', 'Personer', S.ppl.length > (me ? 1 : 0) ? 'Hvor familien er nå' : 'Ingen deler posisjon med deg', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7', 'violet']];
  return `<span class="k46-k">VIS PÅ KARTET</span><div class="k46-box">${rows.map(([k, n, s, p, c]) => `<button type="button" class="k46-lr" data-k46-show="${k}" role="switch" aria-checked="${!!S.p.show[k]}"><span class="k46-li ${c}">${svg(p, 16)}</span><span class="k46-tx"><b>${n}</b><span>${esc(s)}</span></span><span class="k46-sw${S.p.show[k] ? ' on' : ''}"><i></i></span></button>`).join('')}</div>
    <span class="k46-hint">Holdeplasser vises når du zoomer inn. Busser, trikker og T-baner i sanntid vises i sonene du har valgt under Soner.</span>`;
}
function sonHtml() {
  const me = S.ppl.find((p) => p.me), here = me ? zoneOf(me.la, me.lo) : null;
  return `<span class="k46-k">MINE SONER · ${S.zones.length}</span><div class="k46-box">${S.zones.map((z) => { const on = !!S.p.vz?.[z.id]; return `<div class="k46-zr"><button type="button" class="k46-zf" data-k46-zfly="${esc(z.id)}"><span class="k46-zd" style="background:${esc(z.c)}"></span><span class="k46-tx"><b>${esc(z.n)}</b><span>Radius ${z.r} m${here === z ? ' · du er her' : ''}</span></span></button><button type="button" class="k46-zv${on ? ' on' : ''}" data-k46-zlive="${esc(z.id)}" aria-pressed="${on}" aria-label="Kjøretøy i sanntid i ${esc(z.n)}">${on ? '● Sanntid' : 'Sanntid'}</button></div>`; }).join('') || '<div class="k46-empty">Ingen soner ennå. Lag soner under Familie → Soner.</div>'}</div>
    <span class="k46-hint">Slå på «Sanntid» for å se busser, trikker og T-baner som kjører i og rundt sonen. Soner endres under <a href="#/familie" data-k46-fam>Familie → Soner</a>.</span>`;
}
function pplHtml() {
  return `<span class="k46-k">PERSONER</span><div class="k46-box">${S.ppl.map((p) => { const zz = zoneOf(p.la, p.lo); return `<button type="button" class="k46-pr" data-k46-pfly="${esc(p.id)}"><span class="k46-pa" style="background:${esc(p.c)}">${p.photo ? `<img src="${esc(p.photo)}" alt="" onerror="this.remove()">` : ''}${esc(p.n.slice(0, 1).toUpperCase())}</span><span class="k46-tx"><b>${esc(p.me ? `${p.n} (deg)` : p.n)}</b><span>${zz ? `I sone ${esc(zz.n)}` : 'Utenfor sonene'}</span></span><span class="k46-pt">${esc(ago(p.ts))}</span></button>`; }).join('') || '<div class="k46-empty">Ingen deler posisjon med deg. Deling slås på under Familie.</div>'}</div>`;
}
function selHtml() {
  const st = S.sel, D = S.dep, now = Date.now();
  const deps = D ? D.calls.map((c) => { const m = Math.round((c.e - now) / 60000), late = Math.round((c.e - c.a) / 60000), d = MD[c.m] ?? MD.bus;
    return `<div class="k46-dr"><span class="k46-dl" style="background:${d.c}">${esc(c.l)}</span><span class="k46-tx"><b>${esc(c.to)}</b><span>${esc([d.n, c.q ? `Plattform ${c.q}` : '', late > 0 ? `+${late} min forsinket` : ''].filter(Boolean).join(' · '))}</span></span><span class="k46-dt${late > 0 ? ' late' : ''}">${m <= 0 ? 'nå' : m <= 30 ? `${m} min` : hm(c.e)}</span></div>`; }).join('') : '';
  return `<div class="k46-selh"><span class="k46-tx"><span class="k46-k red">HOLDEPLASS</span><b class="k46-seln">${esc(st.n)}</b><span class="k46-chips">${(st.m ?? []).map((m) => `<span style="background:${MD[m].c}">${MD[m].n}</span>`).join('')}</span></span><button type="button" class="k46-x" data-k46="sel-close" aria-label="Lukk">×</button></div>
    <span class="k46-k">AVGANGER · ${D ? (D.src === 'entur' ? 'SANNTID FRA ENTUR' : 'DEMO') : '…'}</span>
    ${D ? '' : '<span class="k46-hint">Henter avganger …</span>'}
    ${D ? `<div class="k46-box flat">${deps || '<div class="k46-empty">Ingen avganger de neste to timene.</div>'}</div>` : ''}
    <button type="button" class="k46-fly" data-k46="sel-fly">Vis på kartet</button>`;
}
function paintPanel() {
  const pan = host?.querySelector('[data-k46-pan]');
  if (!pan) return;
  const body = pan.querySelector('[data-k46-body]'), sc = body?.scrollTop ?? 0;
  const res = S.res ?? [];
  const tabs = !S.sel && !res.length ? `<div class="k46-tabs" role="tablist">${[['lag', 'Lag'], ['soner', 'Soner'], ['ppl', 'Personer']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}" data-k46-tab="${k}">${n}</button>`).join('')}</div>` : '';
  const inner = res.length ? `<div class="k46-box flat">${res.map((r, i) => `<button type="button" class="k46-rr" data-k46-res="${i}"><b>${esc(r.n)}</b><span>${esc(r.sub)}</span></button>`).join('')}</div>`
    : S.sel ? selHtml() : S.tab === 'soner' ? sonHtml() : S.tab === 'ppl' ? pplHtml() : lagHtml();
  const head = pan.querySelector('[data-k46-tabs]');
  if (head) head.innerHTML = tabs;
  if (body) { body.innerHTML = inner; body.scrollTop = sc; }
  pan.dataset.sheet = S.sheet;
  host.classList.toggle('k46-nar', !wide());
  if (!wide()) pan.style.height = `${sheetH()}px`; else pan.style.height = '';
  paintSrc();
}
function paintChips() {
  const el = host?.querySelector('[data-k46-chips]');
  if (!el) return;
  el.innerHTML = MK.map((k) => { const on = !!S.p.md[k]; return `<button type="button" class="k46-chip${on ? ' on' : ''}" data-k46-md="${k}" aria-pressed="${on}"><span style="background:${on ? MD[k].c : '#b9b2a4'}">${svg(MD[k].p, 11, 2.8, '#fff')}</span>${MD[k].n}</button>`; }).join('');
}

/* ---------------- Side ---------------- */
export function render() {
  return `<section class="k46" id="k46" aria-label="Kart">
    <div class="k46-map" data-k46-map></div>
    <div class="k46-chiprow" data-k46-chips></div>
    <div class="k46-ctl"><div class="k46-zm"><button type="button" data-k46="zin" aria-label="Zoom inn">+</button><span></span><button type="button" data-k46="zout" aria-label="Zoom ut">−</button></div>
      <button type="button" class="k46-me" data-k46="me" aria-label="Min posisjon" title="Min posisjon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3L3 10.5l7.5 2.9L13.4 21z"/></svg></button></div>
    <aside class="k46-pan" data-k46-pan data-sheet="peek">
      <button type="button" class="k46-handle" data-k46="sheet" aria-label="Endre størrelse"><span></span></button>
      <div class="k46-ph"><div class="k46-tt"><b>Kart</b><span data-k46-src></span></div>
        <div class="k46-q"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4"/></svg><input type="search" data-k46-q placeholder="Søk etter holdeplass" autocomplete="off" aria-label="Søk etter holdeplass" data-glimt="off"></div>
        <div data-k46-tabs></div></div>
      <div class="k46-pb" data-k46-body></div>
    </aside>
  </section>`;
}

/** Kartet fyller høyden fra toppen av kortet til bunnen av vinduet (over bunnmenyen på mobil). */
function fit() {
  if (!host?.isConnected) return;
  const top = host.getBoundingClientRect().top + scrollY, nav = document.querySelector('.bottomnav');
  const navH = nav && getComputedStyle(nav).display !== 'none' && nav.offsetHeight ? innerHeight - nav.getBoundingClientRect().top + 8 : 16;
  host.style.height = `${Math.max(440, Math.round(innerHeight - top - navH))}px`;
  map?.invalidateSize();
}
const onResize = () => { fit(); paintPanel(); };
function stop() { removeEventListener('resize', onResize); timers.forEach(clearInterval); timers = []; clearTimeout(stopT); clearTimeout(qT); try { map?.remove(); } catch { /* */ } map = null; layers = null; vMarks = new Map(); }

export async function mount(view) {
  stop();
  host = view.querySelector('#k46');
  if (!host) return;
  S.sel = null; S.dep = null; S.res = null; S.q = ''; S.sheet = 'peek';
  fit(); addEventListener('resize', onResize);
  S.p = await loadPrefs();
  // #/kart?sone=Hjem&live=1
  const qs = new URLSearchParams(location.hash.split('?')[1] ?? '');
  paintChips();
  try { L = await loadLeaflet(); } catch (e) { host.querySelector('[data-k46-map]').innerHTML = `<div class="k46-err">${esc(e.message)}</div>`; return; }
  if (!host.isConnected) return;
  const el = host.querySelector('[data-k46-map]');
  map = L.map(el, { zoomControl: false, minZoom: 11, maxZoom: 18, attributionControl: true, zoomSnap: 1, wheelPxPerZoomLevel: 90 });
  map.attributionControl.setPrefix(false);
  map.setView([S.p.c.la, S.p.c.lo], S.p.z, { animate: false });
  layers = { zones: L.layerGroup().addTo(map), stops: L.layerGroup().addTo(map), veh: L.layerGroup().addTo(map), ppl: L.layerGroup().addTo(map) };
  addTiles();
  bind();
  await loadFamily();
  if (!host.isConnected) return;
  // Lagret senter er synlig sentrum; kartets sentrum flyttes så det havner ved siden av panelet.
  // Første gang: sentrer på deg selv, ellers sonen med sanntid (Hjem), ellers Oslo sentrum.
  if (S.p.fresh) { const me = S.ppl.find((p) => p.me), z = liveZones()[0]; if (me) S.p.c = { la: me.la, lo: me.lo }; else if (z) S.p.c = { la: z.lat, lo: z.lon }; }
  fly(S.p.c.la, S.p.c.lo, S.p.z);
  const zq = qs.get('sone') ?? qs.get('zone') ?? qs.get('zoneId');
  if (zq) {
    const z = S.zones.find((x) => x.n.toLowerCase() === zq.toLowerCase() || x.id === String(zq));
    if (z) { if (qs.get('live') !== '0') { S.p.vz = { ...(S.p.vz ?? {}), [z.id]: true }; S.p.show.veh = true; } S.tab = 'soner'; fly(z.lat, z.lon, 15); savePrefs(); }
  }
  paintPanel(); drawAll();
  fetchStops(); fetchVeh();
  map.on('moveend', () => { clearTimeout(stopT); stopT = setTimeout(fetchStops, 450); const c = visCenter(); S.p.c = c; S.p.z = map.getZoom(); savePrefs(); });
  map.on('zoomend', () => { drawStops(); });
  map.on('zoomstart', () => host?.classList.add('k46-zooming'));
  map.on('zoomend', () => setTimeout(() => host?.classList.remove('k46-zooming'), 50));
  const alive = () => { if (!host?.isConnected) { stop(); return false; } return true; };
  timers.push(setInterval(() => { if (alive() && !document.hidden) fetchVeh(); }, 10_000));
  timers.push(setInterval(() => { if (alive() && S.vLocal && liveZones().length && S.p.show.veh) { S.tk++; drawVeh(); } }, 2000));
  timers.push(setInterval(() => { if (alive() && !document.hidden) loadFamily(true).then(() => { drawZones(); drawPeople(); if (S.tab === 'ppl' && !S.sel) paintPanel(); }); }, 60_000));
  // Bredde endret (panel ↔ bunnark): tegn panelet og oppdater kartstørrelsen.
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!alive()) { ro.disconnect(); return; } map?.invalidateSize(); paintPanel(); }); ro.observe(host); }
}

function bind() {
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-k46],[data-k46-md],[data-k46-tab],[data-k46-show],[data-k46-zfly],[data-k46-zlive],[data-k46-pfly],[data-k46-res],[data-k46-fam]');
    if (!t) return;
    const a = t.dataset.k46;
    if (a === 'zin') return map?.zoomIn();
    if (a === 'zout') return map?.zoomOut();
    if (a === 'me') {
      const me = S.ppl.find((p) => p.me);
      if (me) return fly(me.la, me.lo, 16);
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => fly(p.coords.latitude, p.coords.longitude, 16), () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
      return;
    }
    if (a === 'sheet') { S.sheet = S.sheet === 'peek' ? 'half' : S.sheet === 'half' ? 'full' : 'peek'; return paintPanel(); }
    if (a === 'sel-close') { S.sel = null; S.dep = null; paintPanel(); return drawStops(); }
    if (a === 'sel-fly') { if (S.sel) { if (!wide()) { S.sheet = 'peek'; paintPanel(); } fly(S.sel.la, S.sel.lo, 16); } return; }
    if (t.dataset.k46Md) { const k = t.dataset.k46Md; S.p.md[k] = !S.p.md[k]; paintChips(); drawStops(); drawVeh(); return savePrefs(); }
    if (t.dataset.k46Tab) { S.tab = t.dataset.k46Tab; if (!wide() && S.sheet === 'peek') S.sheet = 'half'; return paintPanel(); }
    if (t.dataset.k46Show) { const k = t.dataset.k46Show; S.p.show[k] = !S.p.show[k]; paintPanel(); drawAll(); if (k === 'veh') fetchVeh(); if (k === 'stops') fetchStops(); return savePrefs(); }
    if (t.dataset.k46Zfly) { const z = S.zones.find((x) => x.id === t.dataset.k46Zfly); if (z) { if (!wide()) { S.sheet = 'peek'; paintPanel(); } fly(z.lat, z.lon, 15); } return; }
    if (t.dataset.k46Zlive) { const id = t.dataset.k46Zlive, on = !S.p.vz?.[id]; S.p.vz = { ...(S.p.vz ?? {}), [id]: on }; if (on) S.p.show.veh = true; paintPanel(); drawZones(); fetchVeh(); return savePrefs(); }
    if (t.dataset.k46Pfly) { const p = S.ppl.find((x) => x.id === t.dataset.k46Pfly); if (p) { if (!wide()) { S.sheet = 'peek'; paintPanel(); } fly(p.la, p.lo, 16); } return; }
    if (t.dataset.k46Res !== undefined) { const r = (S.res ?? [])[+t.dataset.k46Res]; if (!r) return; const st = { id: r.id, n: r.n, la: r.la, lo: r.lo, m: r.m?.length ? r.m : ['bus'] }; const q = host.querySelector('[data-k46-q]'); if (q) q.value = ''; pick(st); fly(r.la, r.lo, 16); }
  });
  host.addEventListener('input', (e) => {
    if (!e.target.matches('[data-k46-q]')) return;
    S.q = e.target.value; clearTimeout(qT);
    if (!S.q) { S.res = null; return paintPanel(); }
    qT = setTimeout(() => search(S.q), 280);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (S.sel || S.res)) { e.stopPropagation(); S.sel = null; S.res = null; S.dep = null; const q = host.querySelector('[data-k46-q]'); if (q) q.value = ''; paintPanel(); drawStops(); }
  });
}
export const unmount = stop;
