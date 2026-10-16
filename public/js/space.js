import { esc, api } from './util.js';
import { store, widget, card, refresh } from './store.js';

const CITIES = { Oslo: [59.91, 10.75], Bergen: [60.39, 5.32], Trondheim: [63.43, 10.39], Tromsø: [69.65, 18.96] };
const NORWAY = { latMin: 57.9, latMax: 71.2, lonMin: 4.5, lonMax: 31.1 };
const AU_KM = 149597870.7;
const sp = { sats: null, err: null, stats: null, timer: null, apod: null, gal: {}, sat: null, loaded: false };

widget('r_starlink', { cls: 'card space-grid', render() {
  const s = sp.stats, city = store.me.city in CITIES ? store.me.city : 'Oslo';
  const v = (x) => (s ? x : '…');
  const list = (s?.top ?? []).map((p) => `<div class="row mono" style="padding:8px 12px;border-radius:12px;font-size:13px"><span>${esc(p.name)}${p.visible ? ' <span style="color:var(--yellow)">★</span>' : ''}</span><span class="sub">${p.el}° høyde · ${p.az}° retning</span></div>`).join('');
  return `<div style="display:flex;flex-direction:column;gap:16px">
      <div><div class="card-title">Starlink over Norge</div><div class="card-sub">Beregnet fra CelesTrak-banedata · oppdatert ${s ? s.time.toLocaleTimeString('nb-NO') : 'laster…'}</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="stat"><b>${v(s?.over)}</b><span class="card-sub">over Norge geografisk</span></div>
        <div class="stat"><b>${v(s?.up)}</b><span class="card-sub">over horisonten (&gt;10°) fra ${esc(city)}</span></div>
      </div>
      <div class="chips">${Object.keys(CITIES).map((c) => `<button class="chip" data-city="${c}" aria-pressed="${c === city}">${c}</button>`).join('')}</div>
      <div class="card-sub">${s ? (s.dark ? `<b style="color:var(--yellow)">${s.visible}</b> synlige fra bakken nå (solbelyst satellitt, mørk himmel) ★` : 'For lyst til å se satellitter nå (sola er over −6°).') : ''}</div>
      <div class="muted" style="font-size:13px">Høyest på himmelen nå</div>
      <div style="display:flex;flex-direction:column;gap:6px" id="sat-list">${list}</div>
      <div class="muted" style="font-size:12px">Totalt ${v(s?.total)} Starlink-satellitter i bane. <a href="https://www.n2yo.com/passes/?s=44238" target="_blank" rel="noopener" style="color:var(--blue)">Synlige passeringer ↗</a></div>
      ${sp.err ? `<div class="err">Kunne ikke hente banedata fra CelesTrak. ${esc(sp.err)}</div>` : ''}
    </div><canvas class="sat-map" id="sat-map" aria-label="Kart over satellitter over Norge"></canvas>`;
}, mounted: () => draw() });

widget('r_apod', { cls: 'card space-grid', render() {
  const a = sp.apod;
  let media = '<div class="photo"></div>';
  if (a?.error) media = `<div class="photo" style="display:grid;place-items:center"><span class="err">${esc(a.error)}</span></div>`;
  else if (a?.media_type === 'image') media = `<a class="photo" href="${esc(a.hdurl || a.url)}" target="_blank" rel="noopener" style="background-image:url('${esc(a.url)}')"></a>`;
  else if (a) media = `<a class="photo" href="${esc(a.url)}" target="_blank" rel="noopener" style="display:grid;place-items:center;color:var(--blue);${a.thumbnail_url ? `background-image:url('${esc(a.thumbnail_url)}')` : ''}">Dagens bilde er en video ↗</a>`;
  return `${media}<div style="display:flex;flex-direction:column;gap:10px"><div class="mono muted" style="font-size:12px;letter-spacing:.1em">NASA · DAGENS ROMBILDE · ${esc(a?.date ?? '')}</div>
    <div style="font-size:26px;font-weight:600">${esc(a?.title ?? '')}</div><div class="sub" style="font-size:14px;line-height:1.6;max-height:220px;overflow:auto">${esc(a?.explanation ?? '')}</div>
    ${a?.copyright ? `<div class="muted" style="font-size:12px">© ${esc(a.copyright)}</div>` : ''}</div>`;
} });

const GALS = [['mars', 'Mars-rovere'], ['webb', 'James Webb-teleskopet'], ['hubble', 'Hubble-teleskopet']];
for (const [k, name] of GALS) widget('r_gal_' + k, { render() {
  const items = sp.gal[k] ?? [];
  return `<div class="card-title">${name}</div><div class="hscroll">${items.map((i) => `<a class="gal-item" href="${esc(i.url)}" target="_blank" rel="noopener"><div style="background-image:url('${esc(i.img)}')"></div><span>${esc(i.title)}</span><span class="mono muted" style="font-size:11px">${esc(i.date)}</span></a>`).join('') || '<div class="gal-item"><div></div></div>'.repeat(4)}</div>`;
} });

export function render() {
  load();
  return `<div style="display:flex;flex-direction:column;gap:20px"><div class="page-title">Satellitt <b>og teleskop</b></div>
    ${card('r_starlink')}${card('r_apod')}${GALS.map(([k]) => card('r_gal_' + k)).join('')}</div>`;
}

async function load() {
  if (sp.loaded) { start(); return; }
  sp.loaded = true;
  api('/space/apod').then((a) => { sp.apod = a; }).catch((e) => { sp.apod = { error: e.message }; }).finally(() => refresh('r_apod'));
  for (const [k] of GALS) api('/space/gallery/' + k).then((d) => { sp.gal[k] = d.items; refresh('r_gal_' + k); }).catch(() => {});
  try {
    const [sat, tle] = await Promise.all([import('/vendor/satellite/index.js'), api('/space/tle')]);
    sp.sat = sat;
    const L = tle.text.trim().split(/\r?\n/), recs = [];
    for (let i = 0; i + 2 < L.length; i += 3) {
      try { recs.push({ name: L[i].trim(), rec: sat.twoline2satrec(L[i + 1].trim(), L[i + 2].trim()) }); } catch {}
    }
    sp.sats = recs;
    start();
  } catch (e) { sp.err = e.message; refresh('r_starlink'); }
}

function start() {
  if (!sp.sats || sp.timer) return;
  compute();
  sp.timer = setInterval(() => {
    if (!document.getElementById('sat-map')) { clearInterval(sp.timer); sp.timer = null; return; }
    compute();
  }, 3000);
}

function compute() {
  const sat = sp.sat, now = new Date(), gm = sat.gstime(now);
  const cityName = store.me.city in CITIES ? store.me.city : 'Oslo';
  const [clat, clon] = CITIES[cityName];
  const obs = { latitude: sat.degreesToRadians(clat), longitude: sat.degreesToRadians(clon), height: 0.05 };
  // Solas høyde for observatøren avgjør om himmelen er mørk nok.
  const sun = sat.sunPos(sat.jday(now));
  const sunKm = { x: sun.rsun.x * AU_KM, y: sun.rsun.y * AU_KM, z: sun.rsun.z * AU_KM };
  const sunEl = sat.radiansToDegrees(sat.ecfToLookAngles(obs, sat.eciToEcf(sunKm, gm)).elevation);
  const dark = sunEl < -6;
  const pts = [], up = [];
  let visible = 0;
  for (const s of sp.sats) {
    const pv = sat.propagate(s.rec, now);
    if (!pv || !pv.position || typeof pv.position === 'boolean') continue;
    const g = sat.eciToGeodetic(pv.position, gm);
    const lat = sat.degreesLat(g.latitude), lon = sat.degreesLong(g.longitude);
    if (lat > 54 && lat < 74 && lon > -2 && lon < 36) pts.push({ lat, lon });
    const la = sat.ecfToLookAngles(obs, sat.eciToEcf(pv.position, gm));
    const el = sat.radiansToDegrees(la.elevation);
    if (el > 10) {
      const lit = dark && sat.shadowFraction(sun.rsun, pv.position) < 0.5;
      if (lit) visible++;
      up.push({ name: s.name, el: Math.round(el), az: Math.round((sat.radiansToDegrees(la.azimuth) + 360) % 360), visible: lit });
    }
  }
  up.sort((a, b) => b.el - a.el);
  const over = pts.filter((p) => p.lat > NORWAY.latMin && p.lat < NORWAY.latMax && p.lon > NORWAY.lonMin && p.lon < NORWAY.lonMax).length;
  sp.stats = { over, up: up.length, top: up.slice(0, 8), total: sp.sats.length, time: now, pts, dark, visible };
  refresh('r_starlink');
}

function draw() {
  const c = document.getElementById('sat-map');
  if (!c || !sp.stats) return;
  const x = c.getContext('2d'), W = (c.width = c.clientWidth * 2), H = (c.height = c.clientHeight * 2);
  const px = (lon) => ((lon + 2) / 38) * W, py = (lat) => ((74 - lat) / 20) * H;
  x.fillStyle = '#0b0e15'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#1c2230'; x.lineWidth = 1;
  for (let l = 56; l < 74; l += 2) { x.beginPath(); x.moveTo(0, py(l)); x.lineTo(W, py(l)); x.stroke(); }
  for (let l = 0; l < 36; l += 4) { x.beginPath(); x.moveTo(px(l), 0); x.lineTo(px(l), H); x.stroke(); }
  x.strokeStyle = '#3a4560'; x.setLineDash([8, 8]);
  x.strokeRect(px(NORWAY.lonMin), py(NORWAY.latMax), px(NORWAY.lonMax) - px(NORWAY.lonMin), py(NORWAY.latMin) - py(NORWAY.latMax));
  x.setLineDash([]);
  x.fillStyle = '#a8d4fb';
  for (const p of sp.stats.pts) { x.beginPath(); x.arc(px(p.lon), py(p.lat), 3.5, 0, 7); x.fill(); }
  x.font = '22px Outfit, sans-serif';
  const city = store.me.city in CITIES ? store.me.city : 'Oslo';
  for (const [n, [la, lo]] of Object.entries(CITIES)) {
    const sel = n === city;
    x.fillStyle = sel ? '#f3d38a' : '#eef0f4';
    x.beginPath(); x.arc(px(lo), py(la), sel ? 8 : 5, 0, 7); x.fill();
    x.fillText(n, px(lo) + 12, py(la) + 7);
  }
}

export function bind(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-city]');
    if (!b) return;
    store.me.city = b.dataset.city;
    api('/settings/city', { method: 'PUT', json: { value: store.me.city } });
    if (sp.sats) compute(); else refresh('r_starlink');
  });
}
