// Rom (prompt 32, fasit design/Rom.dc.html variant «a» Kontrollrom, valgt som 1a i Rom Varianter.dc.html).
// Fullskjerm (position: fixed; inset: 0) uten toppmeny og fotovindu, som Vær, Kalender og Chat. Fast topplinje med «Rom» og ✕.
// Innhold maks 1600 px: mørkt kontrollrom (alle aktive satellitter på et verdenskart, kategorier, ISS og «Over <by> nå»),
// dagens bilde fra NASA (APOD, siste 7 dager) og nytt fra Mars-roverne.
// Data via serveren (SERVER32, cache og mock): GET /api/space/tle (TLE-tekst, alle aktive), /api/space/apod?days=7, /api/space/mars.
// Posisjonene regnes ut i nettleseren med satellite.js (SGP4, /vendor/satellite) hvert 4. sekund. Svarer serveren ikke
// (eldre server, ingen nett), vises eksempeldata merket «Eksempeldata», så siden alltid kan brukes.
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
const bg = (u) => (u ? `url(&quot;${esc(u)}&quot;)` : 'none');
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
const grad = (h1, h2) => `radial-gradient(circle at 30% 35%,${h1},transparent 55%),radial-gradient(circle at 75% 70%,${h2},transparent 50%),#0b1220`;
const MOCK_APOD = [
  ['Ørnetåken i infrarødt', 'Søylene av gass og støv i Ørnetåken, M16, er stjernefødesteder omtrent 7000 lysår unna. I infrarødt lys ser teleskopet gjennom støvet og avslører unge stjerner som ennå er pakket inn i skyene de ble født i.', '#c9653a', '#3a5fc9'],
  ['Nordlys over Lofoten', 'En kraftig solstorm ga grønt og fiolett nordlys langt sør i Norge. Bildet er satt sammen av 12 eksponeringer fra en fjelltopp over Reine.', '#3fbf9a', '#8a5fd6'],
  ['Saturn med ringene på skrå', 'Ringene til Saturn står nesten på kant sett fra Jorda denne høsten, og skyggen deres faller som et mørkt bånd over skydekket.', '#e3c27a', '#6b4f2a'],
  ['Andromedagalaksen', 'Vår nærmeste store nabogalakse, M31, er 2,5 millioner lysår unna og inneholder rundt en billion stjerner. De to små satellittgalaksene M32 og M110 ses også.', '#b7a6e8', '#3d4f8a'],
  ['Månen over Oslofjorden', 'En voksende sigd står lavt over fjorden etter solnedgang. Det svake lyset på den mørke delen er jordskinn – sollys reflektert fra Jorda.', '#e9eef7', '#2a3a58'],
  ['Komet med to haler', 'Støvhalen bøyer seg langs banen, mens den blå ionehalen peker rett vekk fra sola, drevet av solvinden.', '#5ab0ff', '#f2c14e'],
  ['Hestehodetåken', 'Den mørke støvskyen formet som et hestehode ligger i Orion og avtegner seg mot rødt, lysende hydrogen bak.', '#e8794a', '#5a1f2a'],
].map(([title, explanation, a, b], i) => ({ title, explanation, date: new Date(Date.now() - i * 864e5).toLocaleDateString('sv-SE'), media_type: 'mock', mockBg: grad(a, b), copyright: 'Eksempel' }));
const MOCK_MARS = [
  { n: 'Perseverance', st: 'active', sol: 1650, date: new Date(Date.now() - 864e5).toLocaleDateString('sv-SE'), count: 32, cams: ['NAVCAM_LEFT', 'MCZ_RIGHT', 'SHERLOC_WATSON', 'FRONT_HAZCAM'], ph: [['#c9653a', '#6b2f1a'], ['#d98a5a', '#4a2a1a'], ['#b8743f', '#7a4a2a'], ['#e0a070', '#5a3020'], ['#a85a30', '#3a1a10'], ['#c98a60', '#6a3a20']].map(([a, b], i) => ({ bgc: grad(a, b), cam: ['Navigasjonskamera', 'Mastcam-Z', 'WATSON', 'Hazcam'][i % 4], u: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/' })), mock: true },
  { n: 'Curiosity', st: 'active', sol: 4710, date: new Date(Date.now() - 2 * 864e5).toLocaleDateString('sv-SE'), count: 18, cams: ['MAST', 'NAVCAM', 'CHEMCAM'], ph: [['#b0703a', '#5a3a20'], ['#d0905a', '#6a4020'], ['#a0603a', '#4a2a18'], ['#c08050', '#603820'], ['#b87848', '#583018'], ['#d8a070', '#704828']].map(([a, b], i) => ({ bgc: grad(a, b), cam: ['Mastcam', 'Navcam', 'ChemCam'][i % 3], u: 'https://mars.nasa.gov/msl/multimedia/raw-images/' })), mock: true },
];

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
  } catch { sp.apod = MOCK_APOD; sp.apodMock = true; }
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
    sp.mars = g?.items?.length ? [{ n: 'Perseverance', st: 'active', sol: null, date: g.items[0].date, count: g.items.length, cams: [], arch: true, ph: g.items.slice(0, 6).map((i) => ({ img: i.img, cam: i.title, u: i.url })) }, MOCK_MARS[1]] : MOCK_MARS;
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
  const el = root()?.querySelector('.rom-ctl');
  if (el) { el.outerHTML = controlHtml(); draw(); } else paint();
}

function draw() {
  const cv = root()?.querySelector('.rom-map canvas');
  if (!cv || !cv.clientWidth) return;
  const x = cv.getContext('2d'), W = (cv.width = cv.clientWidth * 2), H = (cv.height = cv.clientHeight * 2), px = (l) => ((l + 180) / 360) * W, py = (l) => ((90 - l) / 180) * H;
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
  for (const [lo, la, cat] of sp.pts) { if (sp.off[cat] || cat === 'station') continue; x.fillStyle = col[cat]; x.globalAlpha = cat === 'starlink' ? 0.55 : 0.85; x.fillRect(px(lo) - 1.5, py(la) - 1.5, 3, 3); }
  x.globalAlpha = 1;
  const I = sp.iss;
  if (I && !sp.off.station) {
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.setLineDash([8, 6]); x.lineWidth = 2; x.beginPath();
    let pl = null; (I.tr ?? []).forEach(([lo, la], i) => { if (!i || Math.abs(lo - pl) > 180) x.moveTo(px(lo), py(la)); else x.lineTo(px(lo), py(la)); pl = lo; });
    x.stroke(); x.setLineDash([]);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(px(I.lon), py(I.lat), 9, 0, 7); x.fill();
    x.font = '700 24px Manrope, system-ui, sans-serif'; x.fillText('ISS', px(I.lon) + 14, py(I.lat) - 10);
  }
  const c = CITIES[sp.city];
  x.strokeStyle = '#e8794a'; x.lineWidth = 3; x.beginPath(); x.arc(px(c[1]), py(c[0]), 10, 0, 7); x.stroke();
}

/* ---------------- Visning ---------------- */
function controlHtml() {
  const cnt = sp.cnt ?? {}, tot = Object.values(cnt).reduce((a, b) => a + b, 0), I = sp.iss;
  const time = sp.time ? sp.time.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'laster …';
  const iss = I ? [['Posisjon', `${Math.abs(I.lat).toFixed(1)}° ${I.lat >= 0 ? 'N' : 'S'} · ${Math.abs(I.lon).toFixed(1)}° ${I.lon >= 0 ? 'Ø' : 'V'}`], ['Høyde', `${nb(I.alt)} km`], ['Fart', `${nb(I.spd)} km/t`], [`Fra ${sp.city}`, I.el > 0 ? `${I.el}° over horisonten` : 'Under horisonten']]
    : [['Posisjon', '…'], ['Høyde', '…'], ['Fart', '…'], [`Fra ${sp.city}`, '…']];
  const up = (sp.up ?? []).slice(0, 8);
  return `<section class="rom-ctl" aria-label="Satellitter i bane">
    <div class="rom-ctlh"><div class="rom-ctlt"><span class="rom-k">I BANE NÅ · ${esc(time)}</span><b class="rom-tot">${tot ? nb(tot) : '…'} satellitter</b><span class="rom-src">${esc(sp.src)}</span></div>
      <div class="rom-cities" role="group" aria-label="By">${Object.keys(CITIES).map((n) => `<button type="button" data-rom-city="${esc(n)}" aria-pressed="${sp.city === n}">${esc(n)}</button>`).join('')}</div></div>
    <div class="rom-grid"><div class="rom-left"><div class="rom-map"><canvas aria-label="Verdenskart med alle satellitter"></canvas>${tot ? '' : '<span class="rom-load">Henter baner fra CelesTrak …</span>'}</div>
        <div class="rom-cats">${CATS.map(([k, n, c]) => `<button type="button" data-rom-cat="${k}" aria-pressed="${!sp.off[k]}"><i style="background:${c}"></i>${esc(n)}<span>${cnt[k] ? nb(cnt[k]) : '–'}</span></button>`).join('')}</div></div>
      <div class="rom-right"><div class="rom-box"><span class="rom-k">ISS · ROMSTASJONEN</span><div class="rom-iss">${iss.map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
        <div class="rom-box"><span class="rom-k rom-kb"><span>OVER ${esc(sp.city.toUpperCase())} NÅ</span><span>${sp.up ? `${sp.up.length} over horisonten` : ''}</span></span>
          ${up.map((u) => `<div class="rom-up"><i style="background:${(CATS.find((c) => c[0] === u.cat) ?? CATS[6])[2]}"></i><span>${esc(u.n)}</span><b>${u.el}° · ${esc(u.az)}</b></div>`).join('')}
          ${sp.up ? (up.length ? '' : '<span class="rom-mut">Ingen over 10° akkurat nå.</span>') : '<span class="rom-mut">Venter på data …</span>'}</div></div></div>
  </section>`;
}
const apodImg = (a) => (a?.media_type === 'image' ? a.url : a?.thumbnail_url || (a?.media_type === 'mock' ? '' : a?.url) || '');
const apodBg = (a) => (a?.mockBg ? a.mockBg : bg(apodImg(a)));
function apodHtml() {
  const L = sp.apod, A = L?.[sp.sel] ?? null;
  const page = A?.date && !A.mockBg ? `https://apod.nasa.gov/apod/ap${String(A.date).slice(2, 10).replace(/-/g, '')}.html` : 'https://apod.nasa.gov/';
  const meta = A ? `${fd(A.date)}${A.copyright ? ` · © ${String(A.copyright).trim()}` : ' · NASA'}${sp.apodMock ? ' · eksempeldata' : ''}` : '';
  return `<section class="rom-two"><div class="rom-apod"><span class="rom-lab">DAGENS BILDE FRA VERDENSROMMET · NASA</span>
      <a class="rom-apodimg" href="${esc(page)}" target="_blank" rel="noopener" style="background:${A ? apodBg(A) : '#0b1220'};background-size:cover;background-position:center" aria-label="${esc(A?.title ?? 'Dagens bilde')}">${A?.media_type === 'video' ? '<span class="rom-play">▶ Video</span>' : ''}</a>
      <b class="rom-apt">${esc(A?.title ?? (L ? 'Fikk ikke hentet dagens bilde' : 'Henter dagens bilde …'))}</b><span class="rom-meta">${esc(meta)}</span><p class="rom-ex">${esc(A?.explanation ?? '')}</p></div>
    <div class="rom-week"><span class="rom-lab mut">SISTE 7 DAGER</span><div class="rom-wgrid">${(L ?? []).map((a, i) => `<button type="button" data-rom-sel="${i}" aria-pressed="${i === sp.sel}"><span class="rom-wimg" style="background:${apodBg(a)};background-size:cover;background-position:center"></span><span class="rom-wd">${esc(fd(a.date))}</span><span class="rom-wt">${esc(a.title)}</span></button>`).join('')}</div></div></section>`;
}
function marsHtml() {
  const L = sp.mars ?? [{ n: 'Perseverance', ph: [] }, { n: 'Curiosity', ph: [] }];
  return `<section class="rom-mars"><span class="rom-lab">FRA MARS · ROVERNE</span><div class="rom-rgrid">${L.map((r) => {
    const st = r.err ? 'Ingen data' : r.st === 'active' ? 'Aktiv' : r.st ? 'Avsluttet' : '', sc = r.err || r.st !== 'active' ? '#8f897c' : '#2f7a4f';
    const sub = r.err ? 'Fikk ikke hentet bilder akkurat nå.' : r.sol != null ? `Sol ${r.sol} · ${fd(r.date)} · ${r.count} nye bilder${r.mock ? ' · eksempeldata' : ''}` : r.arch ? `Siste bilder fra NASA-arkivet · ${fd(r.date)}` : 'Henter …';
    return `<div class="rom-rover"><div class="rom-rh"><b>${esc(r.n)}</b>${st ? `<span style="color:${sc}"><i style="background:${sc}"></i>${st}</span>` : ''}</div><span class="rom-rsub">${esc(sub)}</span>
      <div class="rom-ph">${(r.ph?.length ? r.ph : Array.from({ length: 6 }, () => null)).map((p) => (p ? `<a href="${esc(p.u ?? '#')}" target="_blank" rel="noopener" title="${esc(p.cam ?? '')}" style="background:${p.bgc ?? bg(p.img)};background-size:cover;background-position:center"></a>` : '<span></span>')).join('')}</div>
      <span class="rom-cams">${esc((r.cams ?? []).join(' · '))}</span></div>`;
  }).join('')}</div></section>`;
}
function paint() {
  const r = root();
  if (!r) return;
  const c = r.querySelector('.rom-c'), sc = r.scrollTop;
  c.innerHTML = `${controlHtml()}${apodHtml()}${marsHtml()}<span class="rom-foot">Baner: CelesTrak (TLE, oppdateres hver 2. time) · Bilder: NASA APOD og Mars Rover Photos · Posisjoner regnes ut i nettleseren hvert 4. sekund.</span>`;
  r.scrollTop = sc;
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
    const b = e.target.closest('[data-rom-city],[data-rom-cat],[data-rom-sel]');
    if (!b || !root()?.contains(b)) return;
    if (b.dataset.romCity) { sp.city = b.dataset.romCity; store.me.city = sp.city; api('/settings/city', { method: 'PUT', json: { value: sp.city } }).catch(() => {}); return tick(); }
    if (b.dataset.romCat) { sp.off = { ...sp.off, [b.dataset.romCat]: !sp.off[b.dataset.romCat] }; return paint(); }
    if (b.dataset.romSel != null) { sp.sel = +b.dataset.romSel; return paint(); }
  });
  view.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root() && !document.querySelector('[role=dialog]:not([hidden])')) location.hash = '#/dash'; });
  window.addEventListener('resize', () => { clearTimeout(resT); resT = setTimeout(draw, 120); });
}
