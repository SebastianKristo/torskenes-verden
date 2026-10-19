// Rom (prompt 32, fasit design/Rom.dc.html variant «a» Kontrollrom, valgt som 1a i Rom Varianter.dc.html).
// Fullskjerm (position: fixed; inset: 0) uten toppmeny og fotovindu, som Vær, Kalender og Chat. Fast topplinje med «Rom» og ✕.
// Innhold maks 1600 px: mørkt kontrollrom (alle aktive satellitter på et verdenskart, kategorier, ISS og «Over <by> nå»),
// dagens bilde fra NASA (APOD, siste 7 dager) og nytt fra Mars-roverne.
// Data via serveren (SERVER32, cache og mock): GET /api/space/tle (TLE-tekst, alle aktive), /api/space/apod?days=7, /api/space/mars.
// Posisjonene regnes ut i nettleseren med satellite.js (SGP4, /vendor/satellite) hvert 4. sekund. Svarer serveren ikke
// (eldre server, ingen nett), vises eksempelbaner merket «Eksempeldata». Bilder vises aldri som eksempeldata (prompt 34):
// feiler NASA, står «Fikk ikke hentet bilder fra NASA akkurat nå · Prøv igjen». Kartet kan zoomes (1×–14×) og har Verden/Europa/Norge.
import { esc, api } from './util.js';
import { store } from './store.js';

const CATS = [
  ['station', 'Romstasjoner', '#ffffff', /\b(ISS|ZARYA|TIANHE|CSS|TIANGONG|WENTIAN|MENGTIAN)\b/],
  ['starlink', 'Starlink', '#e8794a', /^STARLINK/],
  ['oneweb', 'OneWeb', '#c86bd6', /^ONEWEB/],
  ['nav', 'Navigasjon (GPS, Galileo …)', '#3fbf9a', /(NAVSTAR|GPS|GALILEO|GSAT0|GLONASS|COSMOS 2[45]\d\d|BEIDOU|QZS|IRNSS)/],
  ['earth', 'Vær og jordobservasjon', '#5ab0ff', /(NOAA|METEOSAT|GOES|METOP|SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|JPSS|FENGYUN|HIMAWARI|WORLDVIEW|PLANET|FLOCK|SKYSAT)/],
  ['comm', 'Kommunikasjon', '#f2c14e', /(IRIDIUM|INTELSAT|SES|EUTELSAT|ORBCOMM|GLOBALSTAR|INMARSAT|VIASAT|TELESAT|THOR|O3B|KUIPER)/],
  ['other', 'Annet', '#8a93a6', /./],
];
const CITIES = { Oslo: [59.91, 10.75], Bergen: [60.39, 5.32], Trondheim: [63.43, 10.39], Tromsø: [69.65, 18.96] };
const D16 = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const nb = (n) => Math.round(n).toLocaleString('nb-NO');
const fd = (d) => { if (!d) return ''; const x = new Date(`${String(d).slice(0, 10)}T12:00`); return Number.isNaN(x.getTime()) ? '' : `${x.getDate()}. ${MON[x.getMonth()]}`; };
const catOf = (n) => (CATS.find((c) => c[3].test(n)) ?? CATS[6])[0];
const R = 6371;

const sp = {
  city: CITIES[store.me?.city] ? store.me.city : 'Oslo', off: {}, sel: 0, sats: null, sat: null, src: 'Henter …', mock: false,
  cnt: null, up: null, iss: null, pts: [], time: null, apod: null, apodErr: false, apodMock: false, mars: null, land: null, timer: null, started: false,
};
const root = () => document.getElementById('rom');

/* ---------------- Eksempeldata (ingen nett eller eldre server) ---------------- */
// Enkle sirkulære baner (inklinasjon, oppstigende knute, fase, høyde) gir en levende kart- og himmelvisning uten TLE.
function mockSats() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [], add = (n, name, inc, alt, spread = 1) => { for (let i = 0; i < n; i++) out.push({ n: typeof name === 'function' ? name(i) : name, inc: (inc + (rnd() - 0.5) * spread) * Math.PI / 180, raan: rnd() * 2 * Math.PI, u0: rnd() * 2 * Math.PI, alt: alt * (0.97 + rnd() * 0.06) }); };
  add(1, 'ISS (ZARYA)', 51.64, 420, 0); add(1, 'CSS (TIANHE)', 41.47, 385, 0); add(1, 'CSS (WENTIAN)', 41.47, 385, 0);
  add(6200, (i) => `STARLINK-${1007 + i}`, 53.05, 550, 18);
  add(630, (i) => `ONEWEB-${String(12 + i).padStart(4, '0')}`, 87.9, 1200, 1);
  add(32, (i) => `GPS BIIF-${i + 1} (NAVSTAR ${66 + i})`, 55, 20180, 2); add(28, (i) => `GALILEO ${i + 1} (GSAT0${200 + i})`, 56, 23222, 1); add(24, (i) => `COSMOS 25${10 + i} (GLONASS)`, 64.8, 19100, 1); add(45, (i) => `BEIDOU-3 M${i + 1}`, 55, 21500, 2);
  add(310, (i) => ['NOAA 20', 'SENTINEL-2A', 'LANDSAT 9', 'METOP-C', 'TERRA', 'AQUA', 'SUOMI NPP', 'FLOCK 4Q', 'SKYSAT-C', 'PLANET'][i % 10] + (i >= 10 ? ` ${i}` : ''), 97.6, 650, 3);
  add(420, (i) => ['IRIDIUM', 'ORBCOMM', 'GLOBALSTAR M', 'KUIPER-P', 'INTELSAT', 'EUTELSAT'][i % 6] + ` ${100 + i}`, 70, 900, 40);
  add(1450, (i) => `OBJECT ${String.fromCharCode(65 + (i % 26))}${i}`, 60, 800, 70);
  return out.map((x) => ({ ...x, cat: catOf(x.n), mock: true, nmo: Math.sqrt(398600.4418 / (R + x.alt) ** 3) * 60 })); // rad/min
}
const gmst = (d) => { const jd = d.getTime() / 864e5 + 2440587.5, t = (jd - 2451545) / 36525; return ((280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t) % 360) * Math.PI / 180; };
function mockPos(s, d) {
  const u = s.u0 + s.nmo * (d.getTime() / 6e4 % 1e7), ci = Math.cos(s.inc), cu = Math.cos(u), su = Math.sin(u), cr = Math.cos(s.raan), sr = Math.sin(s.raan);
  const x = cr * cu - sr * su * ci, y = sr * cu + cr * su * ci, z = su * Math.sin(s.inc), g = gmst(d);
  const ex = x * Math.cos(-g) - y * Math.sin(-g), ey = x * Math.sin(-g) + y * Math.cos(-g), r = R + s.alt;
  return { lat: Math.asin(z) * 180 / Math.PI, lon: Math.atan2(ey, ex) * 180 / Math.PI, alt: s.alt, ecf: { x: ex * r, y: ey * r, z: z * r }, spd: Math.sqrt(398600.4418 / r) * 3600 };
}
function lookFrom(c, e) {
  const la = c[0] * Math.PI / 180, lo = c[1] * Math.PI / 180, o = { x: R * Math.cos(la) * Math.cos(lo), y: R * Math.cos(la) * Math.sin(lo), z: R * Math.sin(la) };
  const d = { x: e.x - o.x, y: e.y - o.y, z: e.z - o.z }, n = Math.hypot(d.x, d.y, d.z);
  const up = (Math.cos(la) * Math.cos(lo) * d.x + Math.cos(la) * Math.sin(lo) * d.y + Math.sin(la) * d.z) / n;
  const east = (-Math.sin(lo) * d.x + Math.cos(lo) * d.y) / n, north = (-Math.sin(la) * Math.cos(lo) * d.x - Math.sin(la) * Math.sin(lo) * d.y + Math.cos(la) * d.z) / n;
  return { el: Math.asin(up) * 180 / Math.PI, az: ((Math.atan2(east, north) * 180 / Math.PI) + 360) % 360 };
}
// Prompt 34: ingen eksempelbilder (gradienter / «© Eksempel») lenger – feiler NASA, vises en tom tilstand med «Prøv igjen».
const NO_CITIES = { Oslo: [59.91, 10.75], Bergen: [60.39, 5.32], Trondheim: [63.43, 10.39], Tromsø: [69.65, 18.96], Bodø: [67.28, 14.4], Stavanger: [58.97, 5.73], Kristiansand: [58.15, 8.0], Alta: [69.97, 23.27] };
const VIEWS = [['Verden', { lon: 0, lat: 0, z: 1 }], ['Europa', { lon: 12, lat: 54, z: 3.2 }], ['Norge', { lon: 15, lat: 65, z: 6 }]];
const VKEY = 'rom_view';
const mv = { v: (() => { try { const v = JSON.parse(localStorage.getItem(VKEY)); if (v && Number.isFinite(v.z)) return v; } catch { /* */ } return { lon: 0, lat: 0, z: 1 }; })(), anim: 0 };

/* ---------------- Data ---------------- */
async function loadSats() {
  try {
    const t = await api('/space/tle?group=active').catch(() => api('/space/tle'));
    const text = typeof t === 'string' ? t : t?.text;
    if (!text || !/^1 /m.test(text)) throw new Error('Ingen banedata');
    const sat = await import('/vendor/satellite/index.js');
    const L = text.trim().split(/\r?\n/), out = [];
    for (let i = 0; i + 2 < L.length; i += 3) { const n = L[i].trim(); try { out.push({ n, cat: catOf(n), rec: sat.twoline2satrec(L[i + 1].trim(), L[i + 2].trim()) }); } catch { /* ugyldig TLE */ } }
    if (!out.length) throw new Error('Ingen banedata');
    sp.sat = sat; sp.sats = out; sp.mock = !!t?.mock;
    sp.src = t?.mock ? 'Eksempeldata' : `CelesTrak · ${t?.group && t.group !== 'active' ? 'utvalgte grupper' : 'alle aktive'}`;
  } catch {
    sp.sats = mockSats(); sp.mock = true; sp.src = 'Eksempeldata · CelesTrak svarte ikke';
  }
  tick();
}
async function loadApod() {
  try {
    const a = await api('/space/apod?days=7');
    const list = (Array.isArray(a) ? a : a?.items ?? a?.days ?? (a?.title ? [a] : [])).filter((x) => x && x.title);
    if (!list.length) throw new Error('tom');
    sp.apod = list.sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 7);
    sp.apodMock = list.some((x) => x.mock) || !!a?.mock;
    sp.apodSrc = a?.source ?? (list.some((x) => x.link) ? 'NASA' : 'NASA APOD');
    sp.apodErr = false;
  } catch { sp.apod = []; sp.apodErr = true; }
  paint();
}
const photoOf = (p) => ({ img: p.img ?? p.img_src ?? p.url ?? p.src, cam: p.cam ?? p.camera?.full_name ?? p.camera ?? '', u: p.u ?? p.link ?? p.page ?? p.img ?? p.img_src });
function roverOf(r) {
  const P = (r.photos ?? r.ph ?? r.latest_photos ?? []).map(photoOf).filter((x) => x.img);
  return { n: r.name ?? r.n ?? (r.key ? r.key[0].toUpperCase() + r.key.slice(1) : 'Rover'), st: r.status ?? r.st ?? 'active', sol: r.sol ?? null, date: r.earthDate ?? r.earth_date ?? r.date ?? null,
    count: r.count ?? r.total ?? P.length, cams: r.cameras ?? r.cams ?? [...new Set(P.map((x) => x.cam).filter(Boolean))], ph: P.slice(0, 6), arch: !!(r.archive ?? r.arch), err: !!r.error, mock: !!r.mock };
}
async function loadMars() {
  try {
    const m = await api('/space/mars');
    const list = (Array.isArray(m) ? m : m?.rovers ?? []).map(roverOf);
    if (!list.length) throw new Error('tom');
    sp.mars = list;
  } catch {
    // Eldre server: NASA-arkivet (images.nasa.gov) via /api/space/gallery/mars for Perseverance, eksempel for Curiosity.
    const g = await api('/space/gallery/mars').catch(() => null);
    sp.mars = g?.items?.length ? [{ n: 'Perseverance', st: 'active', sol: null, date: g.items[0].date, count: g.items.length, cams: [], arch: true, ph: g.items.slice(0, 6).map((i) => ({ img: i.img, cam: i.title, u: i.url })) }]
      : [{ n: 'Perseverance', err: true, ph: [] }, { n: 'Curiosity', err: true, ph: [] }];
  }
  paint();
}
let landP = null;
function loadLand() {
  landP ??= (async () => {
    if (!window.topojson) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/domains/api/vendor/topojson-client.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const t = await fetch('/domains/api/vendor/countries-110m.json', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
    sp.land = window.topojson.feature(t, t.objects.countries).features.map((f) => { const g = f.geometry; return { no: String(f.id) === '578', rings: g ? (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat() : [] }; });
    draw();
  })().catch(() => { sp.land = []; });
}

/* ---------------- Beregning ---------------- */
function tick() {
  if (!sp.sats) return;
  const now = new Date(), c = CITIES[sp.city], sat = sp.sat, cnt = {}, pts = [], up = [];
  let iss = null;
  const gm = sat ? sat.gstime(now) : 0, obs = sat ? { latitude: sat.degreesToRadians(c[0]), longitude: sat.degreesToRadians(c[1]), height: 0.05 } : null;
  for (const s of sp.sats) {
    let lat, lon, alt, el, az, spd = 0, ecf = null;
    if (s.mock) { const p = mockPos(s, now); ({ lat, lon, alt, spd, ecf } = p); ({ el, az } = lookFrom(c, ecf)); }
    else {
      const pv = sat.propagate(s.rec, now);
      if (!pv || !pv.position || typeof pv.position === 'boolean' || Number.isNaN(pv.position.x)) continue;
      const g = sat.eciToGeodetic(pv.position, gm), la = sat.ecfToLookAngles(obs, sat.eciToEcf(pv.position, gm));
      lat = sat.degreesLat(g.latitude); lon = sat.degreesLong(g.longitude); alt = g.height; el = sat.radiansToDegrees(la.elevation); az = (sat.radiansToDegrees(la.azimuth) + 360) % 360;
      const v = pv.velocity; spd = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 3600;
    }
    cnt[s.cat] = (cnt[s.cat] ?? 0) + 1;
    pts.push([lon, lat, s.cat]);
    if (el > 10) up.push({ n: s.n, cat: s.cat, el: Math.round(el), az: D16[Math.round(az / 22.5) % 16] });
    if (!iss && /\b(ISS|ZARYA)\b/.test(s.n)) iss = { lat, lon, alt, spd, el: Math.round(el), s };
  }
  up.sort((a, b) => (b.cat === 'station') - (a.cat === 'station') || b.el - a.el);
  // ISS-bakkebane ±45 min (stiplet).
  if (iss) {
    const tr = [];
    for (let m = -45; m <= 45; m += 2) {
      const t = new Date(now.getTime() + m * 6e4);
      if (iss.s.mock) { const p = mockPos(iss.s, t); tr.push([p.lon, p.lat]); continue; }
      const p = sat.propagate(iss.s.rec, t);
      if (p?.position && typeof p.position !== 'boolean') { const g = sat.eciToGeodetic(p.position, sat.gstime(t)); tr.push([sat.degreesLong(g.longitude), sat.degreesLat(g.latitude)]); }
    }
    iss.tr = tr;
  }
  Object.assign(sp, { cnt, pts, up, iss, time: now });
  // Bare kontrollrommet tegnes på nytt hvert 4. sekund (bildene under står i ro).
  // Prompt 34: kartet (canvas med zoom/panorering) blir stående; bare tekstdelene byttes.
  const el = root()?.querySelector('.rom-ctl');
  if (el) { for (const [k, fn] of Object.entries(PARTS)) { const p = el.querySelector(`[data-rom-part="${k}"]`); if (p) p.innerHTML = fn(); } el.querySelector('.rom-load')?.remove(); draw(); } else paint();
}

function draw() {
  const cv = root()?.querySelector('.rom-map canvas');
  if (!cv || !cv.clientWidth) return;
  const V = mv.v, z = V.z, W = cv.clientWidth * 2, H = cv.clientHeight * 2;
  if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
  const x = cv.getContext('2d'), px = (l) => W / 2 + ((l - V.lon) / 360) * W * z, py = (l) => H / 2 - ((l - V.lat) / 180) * H * z;
  syncMapUi();
  x.fillStyle = '#0f1a2e'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1;
  for (let l = -60; l <= 60; l += 30) { x.beginPath(); x.moveTo(0, py(l)); x.lineTo(W, py(l)); x.stroke(); }
  for (const f of sp.land ?? []) {
    x.beginPath();
    for (const r of f.rings) { let pl = null; r.forEach(([lo, la], i) => { const X = px(lo), Y = py(la); if (!i || (pl != null && Math.abs(lo - pl) > 180)) x.moveTo(X, Y); else x.lineTo(X, Y); pl = lo; }); x.closePath(); }
    x.fillStyle = f.no ? '#2a3a58' : '#1b2740'; x.fill('evenodd');
    if (f.no) { x.strokeStyle = '#7fa3d6'; x.lineWidth = 1.5; x.stroke(); }
  }
  const col = Object.fromEntries(CATS.map((c) => [c[0], c[2]]));
  const ds = Math.min(7, 3 + Math.log2(z) * 1.2), dh = ds / 2;
  for (const [lo, la, cat] of sp.pts) { if (sp.off[cat] || cat === 'station') continue; const X = px(lo), Y = py(la); if (X < -4 || X > W + 4 || Y < -4 || Y > H + 4) continue; x.fillStyle = col[cat]; x.globalAlpha = cat === 'starlink' ? 0.55 : 0.85; x.fillRect(X - dh, Y - dh, ds, ds); }
  x.globalAlpha = 1;
  const I = sp.iss;
  if (I && !sp.off.station) {
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.setLineDash([8, 6]); x.lineWidth = 2; x.beginPath();
    let pl = null; (I.tr ?? []).forEach(([lo, la], i) => { if (!i || Math.abs(lo - pl) > 180) x.moveTo(px(lo), py(la)); else x.lineTo(px(lo), py(la)); pl = lo; });
    x.stroke(); x.setLineDash([]);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(px(I.lon), py(I.lat), 9, 0, 7); x.fill();
    x.font = '700 24px Manrope, system-ui, sans-serif'; x.fillText('ISS', px(I.lon) + 14, py(I.lat) - 10);
  }
  // Fra ×3: norske byer som prikker med navn.
  if (z >= 3) {
    x.font = '600 22px Manrope, system-ui, sans-serif';
    for (const [n, [la, lo]] of Object.entries(NO_CITIES)) { const X = px(lo), Y = py(la); if (X < 0 || X > W || Y < 0 || Y > H) continue; x.fillStyle = '#e9eef7'; x.beginPath(); x.arc(X, Y, 5, 0, 7); x.fill(); x.fillStyle = 'rgba(233,238,247,.85)'; x.fillText(n, X + 10, Y + 7); }
  }
  const c = CITIES[sp.city];
  x.strokeStyle = '#e8794a'; x.lineWidth = 3; x.beginPath(); x.arc(px(c[1]), py(c[0]), 10, 0, 7); x.stroke();
}

/* ---------------- Zoom og visninger (prompt 34, fasit Rom.dc.html vw/setVw/bindMap) ---------------- */
function clampV(o) {
  const z = Math.max(1, Math.min(14, o.z)), hl = 180 / z, hv = 90 / z;
  return { z, lon: Math.max(-180 + hl, Math.min(180 - hl, o.lon)), lat: Math.max(-90 + hv, Math.min(90 - hv, o.lat)) };
}
function setVw(v, anim = false) {
  const T = clampV(v);
  cancelAnimationFrame(mv.anim);
  const save = () => { try { localStorage.setItem(VKEY, JSON.stringify(T)); } catch { /* */ } };
  if (!anim || matchMedia('(prefers-reduced-motion: reduce)').matches) { mv.v = T; draw(); save(); return; }
  const F = { ...mv.v }, t0 = performance.now(), D = 420;
  const st = () => { const k = Math.min(1, (performance.now() - t0) / D), e = 1 - (1 - k) ** 3; mv.v = { z: F.z + (T.z - F.z) * e, lon: F.lon + (T.lon - F.lon) * e, lat: F.lat + (T.lat - F.lat) * e }; draw(); if (k < 1) mv.anim = requestAnimationFrame(st); else { mv.v = T; save(); draw(); } };
  st();
}
function syncMapUi() {
  const m = root()?.querySelector('.rom-map');
  if (!m) return;
  const zl = m.querySelector('.rom-zl'); if (zl) zl.textContent = `×${(Math.round(mv.v.z * 10) / 10).toLocaleString('nb-NO')}`;
  m.querySelectorAll('[data-rom-vw]').forEach((b) => { const v = VIEWS[+b.dataset.romVw][1]; b.setAttribute('aria-pressed', String(Math.abs(mv.v.z - v.z) < 0.05 && Math.abs(mv.v.lon - v.lon) < 1)); });
}
function bindMap(el) {
  if (!el || el._bound) return;
  el._bound = 1;
  const pts = new Map(); let last = 0;
  const frac = (e) => { const r = el.getBoundingClientRect(); return { fx: (e.clientX - r.left) / r.width - 0.5, fy: (e.clientY - r.top) / r.height - 0.5, r }; };
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const V = mv.v, { fx, fy } = frac(e), z = Math.max(1, Math.min(14, V.z * Math.exp(-e.deltaY * 0.0022)));
    // Punktet under pekeren står stille.
    const lon = V.lon + fx * 360 / V.z, lat = V.lat - fy * 180 / V.z;
    setVw({ z, lon: lon - fx * 360 / z, lat: lat + fy * 180 / z });
  }, { passive: false });
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; el.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.classList.add('drag'); if (pts.size === 2) { const [a, b] = [...pts.values()]; last = Math.hypot(a.x - b.x, a.y - b.y); } });
  el.addEventListener('pointermove', (e) => {
    const pr = pts.get(e.pointerId);
    if (!pr) return;
    const V = mv.v, r = el.getBoundingClientRect();
    if (pts.size === 2) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (last) setVw({ ...V, z: V.z * d / last }); last = d; return; }
    setVw({ ...V, lon: V.lon - (e.clientX - pr.x) / r.width * 360 / V.z, lat: V.lat + (e.clientY - pr.y) / r.height * 180 / V.z });
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) last = 0; if (!pts.size) el.classList.remove('drag'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('dblclick', (e) => { if (e.target.closest('button')) return; const V = mv.v, { fx, fy } = frac(e); setVw({ z: V.z * 2, lon: V.lon + fx * 360 / V.z, lat: V.lat - fy * 180 / V.z }, true); });
}

/* ---------------- Visning ---------------- */
function headHtml() {
  const cnt = sp.cnt ?? {}, tot = Object.values(cnt).reduce((a, b) => a + b, 0);
  const time = sp.time ? sp.time.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'laster …';
  return `<div class="rom-ctlt"><span class="rom-k">I BANE NÅ · ${esc(time)}</span><b class="rom-tot">${tot ? nb(tot) : '…'} satellitter</b><span class="rom-src">${esc(sp.src)}</span></div>
      <div class="rom-cities" role="group" aria-label="By">${Object.keys(CITIES).map((n) => `<button type="button" data-rom-city="${esc(n)}" aria-pressed="${sp.city === n}">${esc(n)}</button>`).join('')}</div>`;
}
function catsHtml() {
  const cnt = sp.cnt ?? {};
  return CATS.map(([k, n, c]) => `<button type="button" data-rom-cat="${k}" aria-pressed="${!sp.off[k]}"><i style="background:${c}"></i>${esc(n)}<span>${cnt[k] ? nb(cnt[k]) : '–'}</span></button>`).join('');
}
function rightHtml() {
  const I = sp.iss, up = (sp.up ?? []).slice(0, 8);
  const iss = I ? [['Posisjon', `${Math.abs(I.lat).toFixed(1)}° ${I.lat >= 0 ? 'N' : 'S'} · ${Math.abs(I.lon).toFixed(1)}° ${I.lon >= 0 ? 'Ø' : 'V'}`], ['Høyde', `${nb(I.alt)} km`], ['Fart', `${nb(I.spd)} km/t`], [`Fra ${sp.city}`, I.el > 0 ? `${I.el}° over horisonten` : 'Under horisonten']]
    : [['Posisjon', '…'], ['Høyde', '…'], ['Fart', '…'], [`Fra ${sp.city}`, '…']];
  return `<div class="rom-box"><span class="rom-k">ISS · ROMSTASJONEN</span><div class="rom-iss">${iss.map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
        <div class="rom-box"><span class="rom-k rom-kb"><span>OVER ${esc(sp.city.toUpperCase())} NÅ</span><span>${sp.up ? `${sp.up.length} over horisonten` : ''}</span></span>
          ${up.map((u) => `<div class="rom-up"><i style="background:${(CATS.find((c) => c[0] === u.cat) ?? CATS[6])[2]}"></i><span>${esc(u.n)}</span><b>${u.el}° · ${esc(u.az)}</b></div>`).join('')}
          ${sp.up ? (up.length ? '' : '<span class="rom-mut">Ingen over 10° akkurat nå.</span>') : '<span class="rom-mut">Venter på data …</span>'}</div>`;
}
const PARTS = { head: headHtml, cats: catsHtml, right: rightHtml };
function controlHtml() {
  const tot = Object.values(sp.cnt ?? {}).reduce((a, b) => a + b, 0);
  return `<section class="rom-ctl" aria-label="Satellitter i bane">
    <div class="rom-ctlh" data-rom-part="head">${headHtml()}</div>
    <div class="rom-grid"><div class="rom-left"><div class="rom-map"><canvas aria-label="Verdenskart med alle satellitter. Rull eller klyp for å zoome, dra for å flytte."></canvas>${tot ? '' : '<span class="rom-load">Henter baner fra CelesTrak …</span>'}
          <div class="rom-vws" role="group" aria-label="Visning">${VIEWS.map(([n], i) => `<button type="button" data-rom-vw="${i}" aria-pressed="false">${esc(n)}</button>`).join('')}</div>
          <div class="rom-zm"><button type="button" data-rom-z="1" aria-label="Zoom inn">+</button><span class="rom-zl">×1</span><button type="button" data-rom-z="-1" aria-label="Zoom ut">−</button></div></div>
        <div class="rom-cats" data-rom-part="cats">${catsHtml()}</div></div>
      <div class="rom-right" data-rom-part="right">${rightHtml()}</div></div>
  </section>`;
}
const ytId = (u) => String(u ?? '').match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/)?.[1] ?? '';
/** Bilde-URL for et APOD-element. Video: thumbnail_url, ellers YouTube-miniatyren. */
const apodImg = (a) => (a?.media_type === 'video' ? a.thumbnail_url || (ytId(a.url) ? `https://img.youtube.com/vi/${ytId(a.url)}/hqdefault.jpg` : '') : a?.url || a?.thumbnail_url || '');
const apodThumb = (a) => a?.thumbnail_url || apodImg(a);
/** <img> med lazy-lasting og reserve til miniatyren (data-fb) ved feil. */
const img = (u, fb, alt = '') => (u ? `<img src="${esc(u)}"${fb && fb !== u ? ` data-fb="${esc(fb)}"` : ''} alt="${esc(alt)}" loading="lazy" decoding="async">` : '');
function apodHtml() {
  const L = sp.apod, A = L?.[sp.sel] ?? null;
  if (L && !L.length) return `<section class="rom-two"><div class="rom-apod"><span class="rom-lab">DAGENS BILDE FRA VERDENSROMMET · NASA</span>
      <div class="rom-empty"><b>Fikk ikke hentet bilder fra NASA akkurat nå</b><span>Legg gjerne inn en egen NASA-nøkkel (gratis på api.nasa.gov) i Innstillinger.</span><button type="button" data-rom-retry>Prøv igjen</button></div></div></section>`;
  const page = A?.link || (A?.date ? `https://apod.nasa.gov/apod/ap${String(A.date).slice(2, 10).replace(/-/g, '')}.html` : 'https://apod.nasa.gov/');
  const meta = A ? `${fd(A.date)}${A.copyright ? ` · © ${String(A.copyright).trim()}` : ` · ${A.source ?? 'NASA'}`}` : '';
  return `<section class="rom-two"><div class="rom-apod"><span class="rom-lab">DAGENS BILDE FRA VERDENSROMMET · NASA</span>
      <a class="rom-apodimg" href="${esc(page)}" target="_blank" rel="noopener" aria-label="${esc(A?.title ?? 'Dagens bilde')}">${A ? img(apodImg(A), apodThumb(A), A.title) : ''}${A?.media_type === 'video' ? '<span class="rom-play">▶ Video</span>' : ''}</a>
      <b class="rom-apt">${esc(A?.title ?? 'Henter dagens bilde …')}</b><span class="rom-meta">${esc(meta)}</span><p class="rom-ex">${esc(A?.explanation ?? '')}</p></div>
    <div class="rom-week"><span class="rom-lab">SISTE 7 DAGER</span><div class="rom-wgrid">${(L ?? []).map((a, i) => `<button type="button" data-rom-sel="${i}" aria-pressed="${i === sp.sel}"><span class="rom-wimg">${img(apodThumb(a), apodImg(a))}${a.media_type === 'video' ? '<i class="rom-wplay">▶</i>' : ''}</span><span class="rom-wd">${esc(fd(a.date))}</span><span class="rom-wt">${esc(a.title)}</span></button>`).join('')}</div></div></section>`;
}
function marsHtml() {
  const L = sp.mars ?? [{ n: 'Perseverance', ph: [] }, { n: 'Curiosity', ph: [] }];
  return `<section class="rom-mars"><span class="rom-lab">FRA MARS · ROVERNE</span><div class="rom-rgrid">${L.map((r) => {
    const st = r.err ? 'Ingen data' : r.st === 'active' ? 'Aktiv' : r.st ? 'Avsluttet' : '', sc = r.err || r.st !== 'active' ? '#7f8fa8' : '#3fbf9a';
    const sub = r.err ? 'Fikk ikke hentet bilder fra NASA akkurat nå.' : r.sol != null ? `Sol ${r.sol} · ${fd(r.date)} · ${r.count} nye bilder` : r.arch ? `Siste bilder fra NASA-arkivet · ${fd(r.date)}` : 'Henter …';
    return `<div class="rom-rover"><div class="rom-rh"><b>${esc(r.n)}</b>${st ? `<span style="color:${sc}"><i style="background:${sc}"></i>${st}</span>` : ''}</div><span class="rom-rsub">${esc(sub)}</span>
      <div class="rom-ph">${(r.ph?.length ? r.ph : Array.from({ length: 6 }, () => null)).map((p) => (p ? `<a href="${esc(p.u ?? '#')}" target="_blank" rel="noopener" title="${esc(p.cam ?? '')}">${img(p.img, '', p.cam ?? '')}</a>` : '<span></span>')).join('')}</div>
      ${r.err ? '<button type="button" class="rom-retry" data-rom-retry>Prøv igjen</button>' : ''}
      <span class="rom-cams">${esc((r.cams ?? []).join(' · '))}</span></div>`;
  }).join('')}</div></section>`;
}
function paint() {
  const r = root();
  if (!r) return;
  const c = r.querySelector('.rom-c'), sc = r.scrollTop;
  c.innerHTML = `${controlHtml()}${apodHtml()}${marsHtml()}<span class="rom-foot">Baner: CelesTrak (TLE, oppdateres hver 2. time) · Bilder: NASA APOD og Mars Rover Photos · Posisjoner regnes ut i nettleseren hvert 4. sekund.</span>`;
  r.scrollTop = sc;
  bindMap(r.querySelector('.rom-map'));
  draw();
}

function start() {
  if (!sp.started) { sp.started = true; loadSats(); loadApod(); loadMars(); }
  loadLand();
  clearInterval(sp.timer);
  sp.timer = setInterval(() => { if (!root()) { clearInterval(sp.timer); sp.timer = null; return; } if (!document.hidden) tick(); }, 4000);
}

export function render() {
  setTimeout(() => { if (!root()) return; loadCss(); paint(); start(); });
  return `<div id="rom" class="rom" role="region" aria-label="Rom"><div class="rom-bar"><b>Rom</b><a class="rom-x" href="#/dash" aria-label="Lukk" title="Lukk"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></a></div><div class="rom-c"></div></div>`;
}
function loadCss() {
  if (document.querySelector('link[data-rom-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/space.css'; l.dataset.romCss = ''; document.head.appendChild(l);
}
loadCss();

let resT = null;
export function bind(view) {
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rom-city],[data-rom-cat],[data-rom-sel],[data-rom-vw],[data-rom-z],[data-rom-retry]');
    if (!b || !root()?.contains(b)) return;
    if (b.dataset.romVw != null) { try { navigator.vibrate?.(8); } catch { /* */ } return setVw(VIEWS[+b.dataset.romVw][1], true); }
    if (b.dataset.romZ) { const V = mv.v; return setVw({ ...V, z: +b.dataset.romZ > 0 ? V.z * 1.6 : V.z / 1.6 }, true); }
    if (b.dataset.romRetry != null) { sp.apod = null; sp.mars = null; paint(); loadApod(); loadMars(); return; }
    if (b.dataset.romCity) { sp.city = b.dataset.romCity; if (NO_CITIES[sp.city] && mv.v.z < 3) setVw(VIEWS[2][1], true); store.me.city = sp.city; api('/settings/city', { method: 'PUT', json: { value: sp.city } }).catch(() => {}); return tick(); }
    if (b.dataset.romCat) { sp.off = { ...sp.off, [b.dataset.romCat]: !sp.off[b.dataset.romCat] }; return paint(); }
    if (b.dataset.romSel != null) { sp.sel = +b.dataset.romSel; return paint(); }
  });
  view.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root() && !document.querySelector('[role=dialog]:not([hidden])')) location.hash = '#/dash'; });
  window.addEventListener('resize', () => { clearTimeout(resT); resT = setTimeout(draw, 120); });
  // Bilder som ikke laster: prøv miniatyren (data-fb), ellers skjul bildet (plassholderfargen står).
  view.addEventListener('error', (e) => { const t = e.target; if (t?.tagName !== 'IMG' || !t.closest('#rom')) return; if (t.dataset.fb) { const f = t.dataset.fb; delete t.dataset.fb; t.src = f; } else t.classList.add('gone'); }, true);
}
