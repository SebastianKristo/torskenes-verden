// Familie og kart (prompt 16): alle på serveren på et OpenStreetMap-kart (Leaflet fra egen server), med spor,
// sensorer, soner (trykk på kartet), varsler per person, hendelser og helse. Personvern håndheves på serveren;
// her vises bare det den gir oss. Nettleseren kan dele egen posisjon mens siden er åpen.
import { api, esc, initials, hm, nb } from './util.js';
import { onLive, liveOn } from './realtime.js';

const S = { tab: 'kart', d: null, sel: null, track: [], err: null, zoneDraft: null, zEdit: null, picking: false, sharingHere: false, watch: null, lastSent: 0 };
let map = null, L = null, layers = null, pollT = null, evSince = Date.now(), unLive = null;

const ACT = { still: 'I ro', walking: 'Går', running: 'Løper', cycling: 'Sykler', driving: 'Kjører' };
const SHARE = { on: 'Deler', paused: 'Pauset', off: 'Av' };
// Prompt 22 (fasit Familie.dc.html): 10 forhåndsvalgte sonefarger + fri farge, og 13 soneikoner (SVG-banene fra designet).
const COLORS = ['#b23a2a', '#d9662a', '#d9a400', '#2f7a4f', '#2e6f75', '#2b5d8a', '#5b4bb5', '#7a3b6b', '#c2417a', '#5c5850'];
const ZIC = {
  home: ['Hjem', 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6'], work: ['Jobb', 'M4 8h16v11H4zM9 8V5h6v3M4 13h16'],
  school: ['Skole', 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5'], heart: ['Familie', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  cabin: ['Hytte', 'M3 20h18M5 20V11l7-6 7 6v9M10 20v-5h4v5'], gym: ['Trening', 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12'],
  shop: ['Butikk', 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0'], ball: ['Sport', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18'],
  coffee: ['Kafé', 'M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M11 3v3'], tree: ['Natur', 'M12 3l6 9h-4l4 6H6l4-6H6zM12 18v3'],
  plane: ['Reise', 'M2 13l20-8-6 16-3-7-7-1z'], star: ['Favoritt', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  pin: ['Sted', 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
};
const zIc = (z) => (ZIC[z?.icon] ? z.icon : { Hjem: 'home', Jobb: 'work', Skole: 'school', Mormor: 'heart', Hytta: 'cabin', Hytte: 'cabin' }[String(z?.name ?? '').trim()] ?? 'pin');
const icSvg = (k, size = 18, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ZIC[k]?.[1] ?? ZIC.pin[1]}"/></svg>`;
const HEX = /^#[0-9a-f]{6}$/i;
const PCOL = ['#b23a2a', '#2b5d8a', '#2f6b45', '#a8661a', '#7a3b6b'];
const host = () => document.getElementById('fam');

const ago = (ts) => {
  if (!ts) return '–';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'nå';
  if (s < 3600) return `${Math.round(s / 60)} min siden`;
  if (s < 86400) return `${Math.round(s / 3600)} t siden`;
  return new Date(ts).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
};
const kmh = (ms) => (ms == null ? null : Math.round(ms * 3.6));
const me = () => S.d?.members.find((m) => m.self);
const person = (id) => S.d?.members.find((m) => m.userId === id);
// Brukerskille (prompt 21): deling er av som standard. Andre vises bare når de deler med deg; soner tilhører den som lagde dem.
const sharesWithMe = (m) => !m.self && m.sharing === 'on';
const myZone = (z) => (z.mine ?? (z.createdBy == null || z.createdBy === me()?.userId)) !== false;
// Profilbilde (prompt 22): Familie-overstyringen (photoUrl) eller kontobildet, ellers initialer på personfargen.
const photoOf = (m) => m?.photoUrl ?? m?.avatarUrl ?? null;
const colOf = (m) => (HEX.test(m?.color ?? '') ? m.color : PCOL[Math.abs([...String(m?.userId ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0)) % PCOL.length]);
// Statusprikk: grønn fersk, gul eldre enn 15 min, grå når deling er av eller pauset.
const fresh = (m) => (m.sharing !== 'on' || !m.last ? 'off' : Date.now() - m.last.ts > 15 * 60_000 ? 'stale' : 'fresh');
const avatar = (m, cls = '', dot = false) => `<span class="fam-av ${cls} s-${esc(m.sharing)}${photoOf(m) ? ' ph' : ''}" style="--pc:${esc(colOf(m))}">${photoOf(m) ? `<img src="${esc(photoOf(m))}" alt="" data-fam-img>` : ''}<em>${esc(initials(m.name))}</em>${dot ? `<i class="fam-st ${fresh(m)}"></i>` : ''}</span>`;

/* ---------------- Leaflet ---------------- */

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
    s.onload = () => res(window.L);
    s.onerror = () => rej(new Error('Kunne ikke laste kartet'));
    document.head.appendChild(s);
  });
}

// Kartfliser går via serverens proxy og cache (/tiles), aldri direkte mot OSM-flisserverne (prompt 20).
// Prompt 21: standard er Kartverket topo (gratis, uten nøkkel). Mørkt tema bruker samme topo-fliser med et mørkt
// CSS-filter (darkFilter), Vindu og papir får paperFilter. CARTO brukes bare når serveren sier det (og den er satt opp).
const TOPO_ATTR = '© <a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a>';
const TILE_FALLBACK = {
  tiles: { topo: '/tiles/topo/{z}/{x}/{y}.png' }, attributions: { topo: TOPO_ATTR }, maxZooms: { topo: 18 },
  default: 'topo', dark: 'topo', paper: 'topo', maxZoom: 18,
  paperFilter: 'sepia(.25) saturate(.8)', darkFilter: 'invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.6)',
};
const CARTO = new Set(['voyager', 'dark', 'light']);
let mapCfg = null;
const loadMapCfg = () => (mapCfg ??= api('/config/map').then((c) => (c?.tiles ? { ...TILE_FALLBACK, ...c, tiles: { ...TILE_FALLBACK.tiles, ...c.tiles }, attributions: { ...TILE_FALLBACK.attributions, ...(c.attributions ?? {}) }, maxZooms: { ...TILE_FALLBACK.maxZooms, ...(c.maxZooms ?? {}) } } : TILE_FALLBACK)).catch(() => TILE_FALLBACK));
const greyTile = (dark) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${dark ? '#2a2b2e' : '#e4e0d6'}"/></svg>`);
const isDarkUi = () => document.documentElement.dataset.hl !== '2c';
/** Stilen for temaet. En eldre server (uten darkFilter) sier fortsatt CARTO, som nå krever nøkkel: da brukes topo. */
function tileStyle(cfg) {
  const s = isDarkUi() ? cfg.dark ?? cfg.default : cfg.default;
  if (!cfg.tiles[s] || (CARTO.has(s) && !cfg.darkFilter)) return 'topo';
  return s;
}

async function addTiles(m) {
  const cfg = await loadMapCfg();
  if (map !== m) return; // kartet ble byttet mens konfigen ble hentet
  const style = tileStyle(cfg), dark = isDarkUi(), maxZoom = cfg.maxZooms?.[style] ?? cfg.maxZoom ?? 18;
  // detectRetina henter selv flisene ett zoomnivå opp på skjermer med høy tetthet, så {r} (@2x) droppes for å unngå dobbel oppskalering.
  const url = String(cfg.tiles[style] ?? TILE_FALLBACK.tiles.topo).replace('{r}', '');
  m.getContainer().dataset.tiles = style;
  // Mørke CARTO-fliser er mørke fra før; lyse fliser (topo m.fl.) får filteret fra konfigen.
  const filter = dark ? (style === 'dark' ? '' : cfg.darkFilter ?? TILE_FALLBACK.darkFilter) : cfg.paperFilter ?? TILE_FALLBACK.paperFilter;
  const pane = m.getPane('tilePane');
  if (pane) pane.style.filter = filter || 'none';
  L.tileLayer(url, { maxZoom, maxNativeZoom: maxZoom, detectRetina: true, crossOrigin: true, errorTileUrl: greyTile(dark), attribution: cfg.attributions?.[style] ?? (style === 'topo' ? TOPO_ATTR : cfg.attribution) ?? TOPO_ATTR }).addTo(m);
}

function setupMap() {
  const el = document.getElementById('fam-map');
  if (!el || !L) return;
  if (map && map.getContainer() === el) return;
  map?.remove();
  map = L.map(el, { zoomControl: false, attributionControl: true }).setView([59.9139, 10.7522], 12);
  addTiles(map);
  layers = { zones: L.layerGroup().addTo(map), track: L.layerGroup().addTo(map), people: L.layerGroup().addTo(map), draft: L.layerGroup().addTo(map) };
  map.on('click', (e) => { if (S.picking) openZone({ lat: e.latlng.lat, lon: e.latlng.lng }); });
  let fitted = false;
  map.whenReady(() => { drawMap(); if (!fitted) { fitAll(); fitted = true; } });
}

function fitAll() {
  const pts = (S.d?.members ?? []).filter((m) => m.last && (m.self || sharesWithMe(m))).map((m) => [m.last.lat, m.last.lon]);
  if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  else if (pts.length) map.setView(pts[0], 14);
}

function drawMap() {
  if (!map || !S.d) return;
  layers.zones.clearLayers(); layers.people.clearLayers(); layers.track.clearLayers(); layers.draft.clearLayers();
  // Soner: sirkel (fyll 13 %, kant 2 px), ikon i 28 px sirkel i sentrum og navnet i en hvit etikett rett under sirkelen.
  for (const z of S.d.zones) {
    const zc = HEX.test(z.color ?? '') ? z.color : COLORS[0];
    L.circle([z.lat, z.lon], { radius: z.radius, color: zc, weight: 2, fillColor: zc, fillOpacity: 0.13, interactive: false }).addTo(layers.zones);
    L.marker([z.lat, z.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'fam-zic-wrap', html: `<span class="fam-zic" style="background:${esc(zc)}">${icSvg(zIc(z), 15, 2.2)}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(layers.zones);
    L.marker([z.lat - z.radius / 111_320, z.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'fam-zlab-wrap', html: `<span class="fam-zlab">${esc(z.name)}</span>`, iconSize: [0, 0], iconAnchor: [0, -12] }) }).addTo(layers.zones);
  }
  // Spor (siste posisjoner) i personfargen, 55 % opasitet.
  if (S.track.length > 1) {
    const tc = colOf(person(S.sel));
    L.polyline(S.track.map((p) => [p.lat, p.lon]), { color: tc, weight: 3, opacity: 0.55, lineCap: 'round', lineJoin: 'round' }).addTo(layers.track);
    L.circleMarker([S.track[0].lat, S.track[0].lon], { radius: 4, color: tc, fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(layers.track);
  }
  // Personer: rund pin 40 px (50 px valgt) med hvit kant, profilbilde eller initialer, fart-badge når personen beveger seg.
  for (const m of S.d.members) {
    if (!m.last || !(m.self || sharesWithMe(m))) continue;
    const on = m.userId === S.sel, sz = on ? 50 : 40, sp = kmh(m.last.speed);
    const badge = sp != null && sp >= 2 ? `<span class="fam-spd">${sp}</span>` : '';
    const icon = L.divIcon({ className: 'fam-pin-wrap', html: `<div class="fam-pin${on ? ' on' : ''}" style="--s:${sz}px"><span class="fam-pav${photoOf(m) ? ' ph' : ''}" style="background-color:${esc(colOf(m))}">${photoOf(m) ? `<img src="${esc(photoOf(m))}" alt="" data-fam-img>` : ''}<em>${esc(initials(m.name))}</em>${badge}</span><i class="fam-ptip"></i></div>`, iconSize: [sz + 6, sz + 12], iconAnchor: [(sz + 6) / 2, sz + 12] });
    const mk = L.marker([m.last.lat, m.last.lon], { icon, title: m.name, zIndexOffset: on ? 1000 : 0 }).addTo(layers.people);
    mk.on('click', () => select(m.userId));
    if (m.last.acc && m.last.acc > 30) L.circle([m.last.lat, m.last.lon], { radius: m.last.acc, color: '#2f5d8a', weight: 1, fillOpacity: 0.06, interactive: false }).addTo(layers.people);
  }
  if (S.zoneDraft && S.zoneDraft.lat != null) {
    const z = S.zoneDraft;
    L.circle([z.lat, z.lon], { radius: z.radius, color: z.color, weight: 2, dashArray: '6 6', fillColor: z.color, fillOpacity: 0.18 }).addTo(layers.draft);
    L.marker([z.lat, z.lon], { interactive: false, icon: L.divIcon({ className: 'fam-zic-wrap', html: `<span class="fam-zic" style="background:${esc(z.color)}">${icSvg(z.icon ?? zIc(z), 15, 2.2)}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(layers.draft);
  }
}

/* ---------------- Data ---------------- */

async function load() {
  try {
    S.d = await api('/family');
    // Prompt 24: én person = én oppføring, selv om personen er logget inn på flere enheter (eldre server kan gi duplikater).
    if (Array.isArray(S.d?.members)) { const seen = new Set(); S.d.members = S.d.members.filter((m) => !seen.has(m.userId) && seen.add(m.userId)); }
    S.err = null;
    if (!S.sel) S.sel = (S.d.members.find((m) => sharesWithMe(m) && m.last) ?? me())?.userId ?? null;
  } catch (e) { S.err = e.message; }
  paint();
  if (S.sel) loadTrack();
}

async function loadTrack() {
  try { S.track = (await api(`/family/track/${encodeURIComponent(S.sel)}?hours=24`)).points ?? []; } catch { S.track = []; }
  drawMap();
}

async function pollEvents() {
  try {
    const r = await api(`/family/events?since=${evSince}`);
    evSince = r.now ?? Date.now();
    for (const e of r.events ?? []) toast(`${e.name} ${e.kind === 'enter' ? 'kom til' : 'forlot'} ${e.zone}`);
  } catch { /* stille */ }
}

function select(id) {
  S.sel = id; S.track = [];
  paint(); loadTrack();
  const m = person(id);
  if (m?.last && map) map.setView([m.last.lat, m.last.lon], Math.max(map.getZoom(), 14));
}

/* ---------------- Visning ---------------- */

// Enhetene til en person (prompt 24): «iPhone 15 Pro · 82 % · nå». Du velger selv hvilken enhet som er kilden («Automatisk» som standard).
const DEV_SVG = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const devIc = (d) => { const k = `${d.platform ?? ''} ${d.name ?? ''}`; return DEV_SVG(/watch|klokke/i.test(k) ? 'M8 6h8v12H8zM9 6l1-4h4l1 4M9 18l1 4h4l1-4' : /ipad|tablet|nettbrett/i.test(k) ? 'M5 3h14v18H5zM11 18h2' : 'M7 2h10v20H7zM11 18h2'); };
const devCount = (m) => m.deviceCount ?? (Array.isArray(m.devices) ? m.devices.length : 0);
function devicesCard(m) {
  const list = Array.isArray(m.devices) ? m.devices : [];
  if (list.length < 2 && !m.self) return '';
  if (!list.length) return '';
  const manual = m.sourceManual ?? m.sourceMode === 'manual' ?? false;
  const line = (d) => [d.battery != null ? `${Math.round(d.battery)} %` : null, d.lastSeen ? ago(d.lastSeen) : null].filter(Boolean).join(' · ');
  const isSrc = (d) => d.isSource || d.id === (m.sourceDevice?.id ?? m.sourceDevice);
  const rows = list.map((d) => {
    const on = manual && isSrc(d), inner = `<span class="fam-dev-ic" aria-hidden="true">${devIc(d)}</span><span class="fam-pmain"><b>${esc(d.name || 'Enhet')}</b><span class="fam-sub">${esc(line(d))}${isSrc(d) ? ' · brukes nå' : ''}</span></span>${m.self ? `<span class="fam-dev-r${on ? ' on' : ''}" aria-hidden="true"></span>` : ''}`;
    return m.self ? `<button type="button" class="fam-dev" data-fam-src="${esc(d.id)}" aria-pressed="${on}">${inner}</button>` : `<div class="fam-dev">${inner}</div>`;
  }).join('');
  const auto = m.self ? `<button type="button" class="fam-dev" data-fam-src="" aria-pressed="${!manual}"><span class="fam-dev-ic" aria-hidden="true">${DEV_SVG('M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')}</span><span class="fam-pmain"><b>Automatisk</b><span class="fam-sub">Nyeste og mest nøyaktige posisjon</span></span><span class="fam-dev-r${manual ? '' : ' on'}" aria-hidden="true"></span></button>` : '';
  return `<div class="fam-devs"><span class="fam-devh">ENHETER · ${list.length}</span>${auto}${rows}</div>`;
}

function memberRow(m) {
  const l = m.last, sp = kmh(l?.speed);
  const status = m.sharing !== 'on' ? `<span class="fam-tag warn">${SHARE[m.sharing]}</span>` : m.precision === 'approx' ? '<span class="fam-tag">Omtrentlig</span>' : '';
  const where = l ? (l.place ? `Hos ${esc(l.place)}` : l.approx ? 'Omtrentlig posisjon' : `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`) : m.sharing === 'on' ? 'Ingen posisjon ennå' : m.sharing === 'paused' ? 'Deling er pauset' : 'Deler ikke posisjon';
  const nDev = devCount(m);
  const bat = l?.battery != null ? `<span class="fam-pbat"><b class="${l.battery < 20 && !l.charging ? 'low' : ''}">${Math.round(l.battery)} %</b><span>${esc(ago(l.ts))}</span></span>` : '';
  return `<button type="button" class="fam-person${m.userId === S.sel ? ' on' : ''}" data-fam-sel="${esc(m.userId)}">
    ${avatar(m, 'lg', true)}
    <span class="fam-pmain"><span class="fam-pname"><b>${esc(m.name)}${m.self ? ' <i>(deg)</i>' : ''}</b>${status}</span><span class="fam-sub">${m.username ? `@${esc(m.username)} · ` : ''}${where}${nDev > 1 ? ` · ${nDev} enheter` : ''}</span>
      ${l ? `<span class="fam-sens">
        <span title="Sist sett">◷ ${ago(l.ts)}</span>
        ${l.activity ? `<span>${ACT[l.activity] ?? esc(l.activity)}</span>` : ''}
        ${sp != null && sp > 0 ? `<span>${sp} km/t</span>` : ''}
        ${l.charging ? '<span>⚡ Lader</span>' : ''}
        ${l.acc != null ? `<span title="GPS-nøyaktighet">±${l.acc >= 1000 ? `${nb(l.acc / 1000, 1)} km` : `${Math.round(l.acc)} m`}</span>` : ''}
      </span>` : ''}
    </span>${bat}</button>`;
}

// Personkortet for den valgte: sensorer, enhet, koordinater, veibeskrivelse og «Spill av lyd» (som i designet).
// Stor avatar i personkortet: trykk for å velge bilde (beskåret til 160 px, lagres bare for deg). ✎-merke nede til høyre.
function bigAvatar(m) {
  const own = m.photoUrl && m.photoUrl !== m.avatarUrl;
  return `<label class="fam-bigav" title="Bytt profilbilde">${avatar(m, 'xl')}<span class="fam-pen" aria-hidden="true">✎</span><input type="file" accept="image/*" data-fam-photo="${esc(m.userId)}" aria-label="Bytt profilbilde for ${esc(m.name)}"></label>${own ? `<button type="button" class="fam-link fam-unph" data-fam-unphoto="${esc(m.userId)}" title="Bruk kontobildet">Fjern bilde</button>` : ''}`;
}

function personCard() {
  const m = person(S.sel);
  if (!m) return '';
  const l = m.last, sp = kmh(l?.speed);
  if (m.sharing !== 'on' || !l) {
    return `<section class="card fam-card fam-pcard"><div class="fam-pchead">${bigAvatar(m)}<span class="fam-pmain"><b class="fam-pn">${esc(m.self ? 'Deg' : m.name)}</b><span class="fam-sub">${m.sharing !== 'on' ? `Deling er ${m.sharing === 'paused' ? 'satt på pause' : 'slått av'}` : 'Ingen posisjon ennå'}</span></span><button type="button" class="fam-x" data-fam-act="unsel" aria-label="Lukk">×</button></div></section>`;
  }
  const zone = (S.d?.zones ?? []).find((z) => l.place && z.name === l.place);
  const where = (l.place ? `I ${l.place}` : l.approx ? 'Omtrentlig posisjon' : ACT[l.activity] ?? 'Ukjent sted') + (sp ? ` · ${sp} km/t` : '');
  const cell = (k, v, cls = '') => (v == null || v === '' ? '' : `<div class="fam-cell"><span>${k}</span><b class="${cls}">${v}</b></div>`);
  const nav = `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}`;
  // Tre sensorruter først (Batteri, Bevegelse, Fart), som i designet. Resten under.
  const tri = (k, v, cls = '') => `<div class="fam-cell"><span>${k}</span><b class="mono ${cls}">${v ?? '–'}</b></div>`;
  return `<section class="card fam-card fam-pcard"><div class="fam-pchead">${bigAvatar(m)}<span class="fam-pmain"><b class="fam-pn">${esc(m.self ? 'Deg' : m.name)}</b><span class="fam-sub">${esc(where)} · oppdatert ${esc(ago(l.ts))}</span></span>
      <button type="button" class="fam-x" data-fam-act="unsel" aria-label="Lukk">×</button></div>
    <div class="fam-cells3">
      ${tri('Batteri', l.battery != null ? `${Math.round(l.battery)} %${l.charging ? ' ⚡' : ''}` : null, l.battery != null && l.battery < 20 && !l.charging ? 'low' : '')}
      ${tri('Bevegelse', l.activity ? ACT[l.activity] ?? esc(l.activity) : null)}
      ${tri('Fart', sp != null ? `${sp} km/t` : null)}
    </div>
    <div class="fam-cells">
      ${cell('Nøyaktighet', l.acc != null ? `± ${l.acc >= 1000 ? `${nb(l.acc / 1000, 1)} km` : `${Math.round(l.acc)} m`}` : null)}
      ${cell('Enhet', l.device ? esc(l.device) : null)}
      ${cell('Koordinater', l.approx ? 'Omtrentlig' : `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`)}
      ${zone ? cell('Sone', esc(zone.name)) : ''}
    </div>
    ${devicesCard(m)}
    <div class="fam-pbtns"><a class="fam-btn" href="${esc(nav)}" target="_blank" rel="noopener">Veibeskrivelse</a>${m.self ? '' : `<button type="button" class="fam-btn" data-fam-act="ping">Spill av lyd</button>`}</div>
  </section>`;
}

function healthCard() {
  const m = person(S.sel), h = m?.health;
  if (!m) return '';
  const t = h?.today ?? {};
  const tile = (k, v, u) => (v == null ? '' : `<div class="fam-ht"><span>${k}</span><b>${v}</b><i>${u}</i></div>`);
  const week = h?.week ?? [], max = Math.max(1, ...week.map((d) => d.steps ?? 0));
  return `<section class="card fam-card"><div class="fam-h"><span class="fam-k">Helse</span><span class="fam-sub">${esc(m.name)}${h ? ` · ${ago(h.updatedAt)}` : ''}</span></div>
    ${h ? `<div class="fam-htiles">${tile('Skritt', t.steps != null ? nb(t.steps) : null, 'i dag')}${tile('Hvilepuls', t.restingHr != null ? Math.round(t.restingHr) : null, 'slag/min')}${tile('Puls', t.hr != null ? Math.round(t.hr) : null, 'slag/min')}${tile('Søvn', t.sleepMin != null ? `${Math.floor(t.sleepMin / 60)} t ${t.sleepMin % 60}` : null, 'min')}${tile('Aktive kalorier', t.activeKcal != null ? nb(t.activeKcal) : null, 'kcal')}</div>
      ${week.some((d) => d.steps != null) ? `<div class="fam-week">${week.map((d) => `<div class="fam-wd"><i style="height:${Math.round(((d.steps ?? 0) / max) * 100)}%"></i><span>${new Date(d.date + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'narrow' })}</span></div>`).join('')}</div><div class="fam-sub">Skritt siste 7 dager</div>` : ''}`
      : `<div class="fam-empty">${m.self ? 'Helsedata sendes fra FinansHub-appen på telefonen (Apple Helse eller Health Connect). Nettleseren kan ikke lese helsedata.' : `${esc(m.name)} deler ikke helsedata.`}</div>`}
  </section>`;
}

function healthAll() {
  const keep = S.sel;
  const list = (S.d?.members ?? []).filter((m) => m.self || (m.health && m.sharing !== 'off' && m.sharing !== 'paused'));
  const cards = list.map((m) => { S.sel = m.userId; return healthCard(); }).join('') + (list.some((m) => !m.self) ? '' : '<section class="card fam-card"><div class="fam-empty fam-none"><b>Ingen deler helse med deg ennå</b>Helsedeling er av som standard.</div></section>');
  S.sel = keep;
  return `<div class="fam-hgrid">${cards}</div>
    <div class="fam-note">Apple Health og Health Connect kan bare leses av appen på telefonen. Homelab-appen sender et sammendrag hit hvert 15. minutt, og bare det personen har valgt å dele.</div>`;
}

// Prompt 32 (Familie.dc.html, web): «FAMILIEN · N personer» over et kort med rader (bilde med statusprikk, navn, sted, batteri, sist oppdatert).
function famRow(m) {
  const l = m.last, sp = kmh(l?.speed), nDev = devCount(m);
  const where = m.sharing !== 'on' ? (m.sharing === 'paused' ? 'Deling er satt på pause' : 'Deler ikke posisjon') : !l ? 'Ingen posisjon ennå'
    : `${l.place ? `I ${l.place}` : l.approx ? 'Omtrentlig posisjon' : ACT[l.activity] ?? 'Ukjent sted'}${sp ? ` · ${sp} km/t` : ''}`;
  const bat = l?.battery != null ? `${Math.round(l.battery)} %${l.charging ? ' ⚡' : ''}` : '';
  return `<button type="button" class="fam-wrow${m.userId === S.sel ? ' on' : ''}" data-fam-sel="${esc(m.userId)}">${avatar(m, 'lg', true)}
    <span class="fam-pmain"><b>${esc(m.name)}${m.self ? ' (deg)' : ''}</b><span class="fam-sub">${esc(where)}${nDev > 1 ? ` · ${nDev} enheter` : ''}</span></span>
    <span class="fam-wbat"><b class="${l?.battery != null && l.battery < 20 && !l.charging ? 'low' : ''}">${esc(bat)}</b><span>${l && m.sharing === 'on' ? esc(ago(l.ts)) : '–'}</span></span></button>`;
}
function peopleCard() {
  const all = S.d?.members ?? [], self = all.filter((m) => m.self), others = all.filter(sharesWithMe), list = [...self, ...others];
  const empty = others.length ? '' : `<div class="fam-empty fam-none"><b>Ingen deler posisjon med deg ennå</b>
    Deling er av som standard. Når noen i familien slår på deling, vises de her og på kartet.</div>`;
  return `<div class="fam-wblk"><span class="fam-wlab">FAMILIEN<span>${list.length} ${list.length === 1 ? 'person' : 'personer'}</span></span><section class="card fam-card fam-wlist">
    <div class="fam-people">${list.map(famRow).join('')}</div>${empty}</section></div>`;
}

// Ikonrutenett og farger (10 forhåndsvalgte + fri fargevelger med hex), felles for «Ny sone» og redigering.
function iconGrid(cur, attr) {
  return `<div class="fam-icons" role="radiogroup" aria-label="Ikon">${Object.entries(ZIC).map(([k, [n]]) => `<button type="button" role="radio" class="fam-ic${cur === k ? ' on' : ''}" aria-checked="${cur === k}" ${attr}="${k}" aria-label="${n}" title="${n}">${icSvg(k, 19, 1.9)}</button>`).join('')}</div>`;
}
function colorRow(cur, attr, pickAttr) {
  const custom = !COLORS.includes(String(cur).toLowerCase());
  return `<div class="fam-colors">${COLORS.map((c) => `<button type="button" class="fam-col${String(cur).toLowerCase() === c ? ' on' : ''}" style="background:${c}" ${attr}="${c}" aria-label="Farge ${c}" aria-pressed="${String(cur).toLowerCase() === c}"></button>`).join('')}
    <label class="fam-col fam-rainbow${custom ? ' on' : ''}" title="Velg egen farge"><input type="color" value="${esc(HEX.test(cur) ? cur : COLORS[0])}" ${pickAttr} aria-label="Velg egen farge"></label><span class="fam-hex mono">${esc(cur)}</span></div>`;
}
const rTxt = (r) => (r >= 1000 ? `${nb(r / 1000, 1)} km` : `${nb(r)} m`);

function zonesCard() {
  const z = S.d?.zones ?? [], others = (S.d?.members ?? []).filter(sharesWithMe);
  const here = (x) => (S.d?.members ?? []).filter((m) => m.last?.place === x.name && (m.self || sharesWithMe(m))).map((m) => (m.self ? 'deg' : m.name));
  const card = (x) => {
    const mine = myZone(x), ed = S.zEdit === x.id, zc = HEX.test(x.color ?? '') ? x.color : COLORS[0], who = here(x);
    return `<section class="card fam-card fam-zcard">
      <div class="fam-zrow"><button type="button" class="fam-zbig" style="background:${esc(zc)}" data-fam-zshow="${x.id}" aria-label="Vis ${esc(x.name)} på kartet">${icSvg(zIc(x), 21, 2)}</button>
        <span class="fam-pmain"><b>${esc(x.name)}</b><span class="fam-sub">${rTxt(x.radius)} · ${who.length ? `${esc(who.join(', '))} er der nå` : 'ingen der nå'}${mine ? '' : ` · fra ${esc(person(x.createdBy)?.name ?? 'familien')}`}</span></span>
        ${mine ? `<button type="button" class="fam-rb${ed ? ' on' : ''}" data-fam-zedit="${x.id}" aria-label="Rediger sone" aria-expanded="${ed}">✎</button><button type="button" class="fam-rm" data-fam-zrm="${x.id}" aria-label="Slett sone">−</button>` : ''}</div>
      ${ed ? `<div class="fam-zed">
        <input class="fam-inp" data-fam-ze="name" data-id="${x.id}" value="${esc(x.name)}" maxlength="60" aria-label="Navn">
        ${iconGrid(zIc(x), `data-id="${x.id}" data-fam-zeic`)}
        ${colorRow(zc, `data-id="${x.id}" data-fam-zecol`, `data-id="${x.id}" data-fam-ze="color"`)}
        <div class="fam-rl"><span>Radius</span><b class="mono" data-fam-zerv="${x.id}">${rTxt(x.radius)}</b></div>
        <input type="range" min="50" max="2000" step="25" value="${Math.min(2000, Math.max(50, x.radius))}" data-fam-ze="radius" data-id="${x.id}" style="accent-color:${esc(zc)}" aria-label="Radius">
        <label class="fam-sw"><input type="checkbox" data-fam-zshare="${x.id}" ${x.shared ? 'checked' : ''}><span>Del med familien</span></label>
      </div>` : ''}
      ${others.length ? `<div class="fam-notify">${others.map((m) => { const n = x.notify?.[m.userId] ?? {}; return `<div class="fam-nrow">${avatar(m, 'sm')}<span>${esc(m.name)}</span>
        <button type="button" class="fam-chip${n.enter ? ' on' : ''}" data-fam-notify="${x.id}" data-u="${esc(m.userId)}" data-k="enter">Kommer</button>
        <button type="button" class="fam-chip${n.leave ? ' on' : ''}" data-fam-notify="${x.id}" data-u="${esc(m.userId)}" data-k="leave">Forlater</button></div>`; }).join('')}</div>` : ''}
    </section>`;
  };
  return `${z.length ? z.map(card).join('') : '<section class="card fam-card"><div class="fam-empty">Ingen soner ennå. Trykk «+ Ny sone på kartet» og så på kartet. Sonene dine er private til du slår på «Del med familien».</div></section>'}
    ${others.length && z.length ? '<div class="fam-note">Trykk «Kommer» eller «Forlater» for å få varsel når en person kommer til eller forlater sonen.</div>' : ''}`;
}

// Prompt 32: like hendelser på rad (samme person, type og sone) slås sammen med teller «×7». Siste tidspunkt vises. Maks 12.
function groupEvents(ev) {
  const out = [];
  for (const e of ev) {
    const l = out[out.length - 1], n = e.count ?? e.n ?? 1;
    if (l && l.name === e.name && l.kind === e.kind && l.zone === e.zone) { l.n += n; continue; }
    out.push({ ...e, n });
  }
  return out.slice(0, 12);
}
function eventsCard() {
  const ev = groupEvents(S.d?.events ?? []);
  return `<div class="fam-wblk"><span class="fam-wlab">HENDELSER</span><section class="card fam-card fam-wlist">
    ${ev.length ? `<ul class="fam-ev">${ev.map((e) => `<li><span class="fam-dot ${e.kind}" style="${person(e.userId) ? `background:${esc(colOf(person(e.userId)))}` : ''}"></span><span>${esc(e.name)} ${e.kind === 'enter' ? 'kom til' : 'forlot'} ${esc(e.zone)}${e.n > 1 ? `<em class="fam-evn">×${e.n}</em>` : ''}</span><time>${hm(new Date(e.ts))}</time></li>`).join('')}</ul>` : '<div class="fam-empty">Ingen hendelser ennå.</div>'}
  </section></div>`;
}

function privacyCard() {
  const p = S.d?.me;
  if (!p) return '';
  const seg = (k, opts) => `<div class="fam-seg">${opts.map(([v, t]) => `<button type="button" class="${p[k] === v ? 'on' : ''}" data-fam-pref="${k}" data-v="${v}">${t}</button>`).join('')}</div>`;
  const hs = [['steps', 'Skritt'], ['restingHr', 'Hvilepuls'], ['hr', 'Puls'], ['sleep', 'Søvn'], ['activeKcal', 'Aktive kalorier'], ['week', 'Siste 7 dager']];
  return `<section class="card fam-card"><div class="fam-h"><b class="fam-wt">Min deling</b><span class="fam-sub">${p.sharing === 'on' ? 'De andre ser deg' : p.sharing === 'paused' ? 'De andre ser at du har pauset' : 'Av som standard. Ingen ser posisjonen eller helsen din'}</span></div>
    ${seg('sharing', [['on', 'Deler'], ['paused', 'Pause'], ['off', 'Av']])}
    ${seg('precision', [['exact', 'Nøyaktig'], ['approx', 'Omtrentlig (~1 km)']])}
    <label class="fam-sw"><input type="checkbox" data-fam-here ${S.sharingHere ? 'checked' : ''} ${p.sharing !== 'on' ? 'disabled' : ''}><span>Del posisjon fra denne nettleseren mens siden er åpen</span></label>
    <div class="fam-sub" style="margin-top:4px">Helse jeg deler</div>
    <div class="fam-chips">${hs.map(([k, t]) => `<button type="button" class="fam-chip${p.shareHealth?.[k] ? ' on' : ''}" data-fam-health="${k}">${t}</button>`).join('')}</div>
  </section>`;
}

function zoneSheet() {
  const z = S.zoneDraft;
  if (!z) return '';
  return `<div class="fam-sheet" role="dialog" aria-label="Ny sone">
    <div class="fam-h"><b class="fam-st-t">Ny sone</b><button type="button" class="fam-x" data-fam-act="zclose" aria-label="Avbryt">×</button></div>
    <input class="fam-inp" data-fam-z="name" value="${esc(z.name)}" placeholder="Navn, f.eks. Trening" maxlength="60" aria-label="Navn">
    <div class="fam-rl"><span>Radius</span><b class="mono" data-fam-rv>${rTxt(z.radius)}</b></div>
    <input type="range" min="50" max="2000" step="25" value="${z.radius}" data-fam-z="radius" aria-label="Radius" style="accent-color:${esc(z.color)}">
    <span class="fam-lab">Ikon</span>${iconGrid(z.icon ?? zIc(z), 'data-fam-zic')}
    <span class="fam-lab">Farge</span>${colorRow(z.color, 'data-fam-col', 'data-fam-z="color"')}
    <label class="fam-sw"><input type="checkbox" data-fam-z="shared" ${z.shared ? 'checked' : ''}><span>Del med familien</span></label>
    <div class="fam-sheetbtns"><button type="button" class="fam-btn" data-fam-act="zclose">Avbryt</button><button type="button" class="fam-btn pri" data-fam-act="zsave">Lagre sone</button></div>
  </div>`;
}

function tabs() {
  return `<div class="fam-tabs"><div class="fam-tpill" role="tablist">${[['kart', 'Kart'], ['soner', 'Soner'], ['helse', 'Helse']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}" data-fam-tab="${k}">${n}</button>`).join('')}</div>
    <span class="fam-live"><i class="${liveOn() ? 'on' : ''}"></i>${liveOn() ? `Sanntid · ${S.sharingHere ? 'din posisjon deles herfra' : 'oppdatert nå'}` : 'Oppdateres hvert 20. sekund'}</span></div>`;
}

function body() {
  if (S.err && !S.d) return `<div class="card fam-card"><div class="fam-empty">Kunne ikke hente familien: ${esc(S.err)}</div></div>`;
  if (!S.d) return '<div class="card fam-card"><div class="fam-empty">Laster …</div></div>';
  if (S.tab === 'helse') return tabs() + healthAll() + privacyCard();
  // Verktøyraden ligger over kartet (prompt 22): «+ Ny sone på kartet» til venstre, «Vis alle» og ↻ til høyre.
  const tools = `<div class="fam-tools"><button type="button" class="fam-tb pri" data-fam-act="pick" aria-pressed="${S.picking}">${S.picking ? 'Avbryt plassering' : '+ Ny sone på kartet'}</button><span class="fam-sp"></span>
    <button type="button" class="fam-tb" data-fam-act="fit">Vis alle</button><button type="button" class="fam-tb rnd" data-fam-act="refresh" aria-label="Oppdater posisjoner" title="Oppdater posisjoner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg></button></div>`;
  const mapCard = `<div class="fam-mapcol">${tools}<section class="card fam-mapcard"><div id="fam-map" class="fam-map${S.picking ? ' picking' : ''}"></div>
    ${S.picking ? '<div class="fam-hint">Trykk på kartet der sonen skal være</div>' : ''}
    <div class="fam-zoom"><button type="button" data-fam-act="zin" aria-label="Zoom inn">+</button><button type="button" data-fam-act="zout" aria-label="Zoom ut">−</button><button type="button" data-fam-act="fit" aria-label="Vis alle">◎</button></div>
    <div class="fam-livepill"><i class="${liveOn() ? 'on' : ''}"></i>${liveOn() ? 'Sanntid · oppdatert nå' : 'Hvert 20. sekund'}</div>
    ${zoneSheet()}</section></div>`;
  // Prompt 32: to kolonner på web – kartet (blir stående) til venstre, sidepanelet (320–400 px) til høyre i rekkefølgen
  // valgt person · Familien · Hendelser · Min deling. Under 900 px: én kolonne (kart øverst).
  const side = S.tab === 'soner'
    ? `<div class="fam-side">${zonesCard()}</div>`
    : `<div class="fam-side">${personCard()}${peopleCard()}${eventsCard()}${privacyCard()}</div>`;
  return `${tabs()}<div class="fam-grid">${mapCard}${side}</div>`;
}

function paint() {
  const h = host();
  if (!h) return;
  // Kartet beholdes mellom oppdateringer; bare kortene rundt tegnes på nytt.
  const mapEl = document.getElementById('fam-map');
  if (mapEl && S.d) {
    const keep = mapEl;
    h.innerHTML = body();
    document.getElementById('fam-map')?.replaceWith(keep); // Helse har ikke kart
    keep.classList.toggle('picking', S.picking);
    map?.invalidateSize();
  } else {
    h.innerHTML = body();
  }
  if (L) setupMap();
  drawMap();
}

let toastT = null;
function toast(msg) {
  const t = document.getElementById('fam-toast');
  if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 5000);
}

/* ---------------- Handlinger ---------------- */

function openZone(at) {
  S.picking = false;
  S.zoneDraft = { name: '', radius: 150, color: COLORS[0], icon: null, ...at };
  paint();
  document.querySelector('[data-fam-z="name"]')?.focus();
}

async function savePref(patch) {
  try { const r = await api('/family/me', { method: 'PUT', json: patch }); S.d.me = r.me; } catch (e) { toast(e.message); }
  if (S.d.me.sharing !== 'on') stopHere();
  load();
}

function startHere() {
  if (!navigator.geolocation) { toast('Nettleseren støtter ikke posisjon'); return; }
  S.sharingHere = true;
  S.watch = navigator.geolocation.watchPosition(async (p) => {
    if (Date.now() - S.lastSent < 20_000) return;
    S.lastSent = Date.now();
    const c = p.coords;
    let battery = null, charging = null;
    try { const b = await navigator.getBattery?.(); if (b) { battery = Math.round(b.level * 100); charging = b.charging; } } catch { /* ikke støttet */ }
    try {
      const r = await api('/family/location', { method: 'POST', json: { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: c.speed ?? undefined, heading: c.heading ?? undefined, alt: c.altitude ?? undefined, battery, charging, ts: p.timestamp } });
      for (const e of r.events ?? []) toast(`Du ${e.kind === 'enter' ? 'kom til' : 'forlot'} ${e.zone}`);
    } catch (e) { toast(e.message); }
  }, (e) => { toast(e.code === 1 ? 'Du må gi nettleseren tilgang til posisjon' : 'Fant ikke posisjonen'); stopHere(); paint(); }, { enableHighAccuracy: true, maximumAge: 15_000 });
}
function stopHere() { if (S.watch != null) navigator.geolocation.clearWatch(S.watch); S.watch = null; S.sharingHere = false; }

const zoneById = (id) => S.d?.zones.find((x) => String(x.id) === String(id));
// Endringer på en eksisterende sone lagres med en gang (navn, radius og fri farge litt forsinket mens man drar/skriver).
const zTimers = new Map();
function patchZone(id, patch, now) {
  const z = zoneById(id);
  if (!z) return;
  Object.assign(z, patch);
  drawMap();
  if (now) paint();
  clearTimeout(zTimers.get(z.id));
  zTimers.set(z.id, setTimeout(async () => {
    zTimers.delete(z.id);
    try { const r = await api(`/family/zones/${z.id}`, { method: 'PATCH', json: patch.radius != null ? { radius: +patch.radius } : patch }); if (r?.id) Object.assign(z, r, r.icon ? {} : { icon: patch.icon ?? z.icon }); } catch (er) { toast(er.message); }
  }, now ? 0 : 400));
}

// Profilbilde for en person, bare for deg: beskjæres til kvadrat 160 px (JPEG) og sendes som {image: dataURL}.
async function setPhoto(userId, file) {
  let dataUrl;
  try {
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
    c.width = c.height = 160;
    c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 160, 160);
    dataUrl = c.toDataURL('image/jpeg', 0.88);
  } catch { return toast('Kunne ikke lese bildet'); }
  const m = person(userId);
  if (m) { m.photoUrl = dataUrl; paint(); }
  try {
    await api(`/family/photo/${encodeURIComponent(userId)}`, { method: 'PUT', json: { image: dataUrl } });
    toast('Bildet er lagret');
  } catch (er) { toast(er.status === 404 ? 'Serveren støtter ikke egne bilder ennå' : er.message); }
  load();
}

function bind(h) {
  if (h.dataset.famBound) return;
  h.dataset.famBound = '1';
  h.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.famTab) { S.tab = t.dataset.famTab; if (S.tab !== 'soner') S.picking = false; return paint(); }
    if (t.dataset.famSel) return select(t.dataset.famSel);
    if (t.dataset.famSrc !== undefined) {
      try { await api('/family/me/source', { method: 'PUT', json: { deviceId: t.dataset.famSrc || null } }); toast(t.dataset.famSrc ? 'Kilden er valgt' : 'Automatisk valg av enhet'); }
      catch (er) { return toast(er.status === 404 ? 'Serveren støtter ikke valg av enhet ennå' : er.message); }
      return load();
    }
    if (t.dataset.famPref) return savePref({ [t.dataset.famPref]: t.dataset.v });
    if (t.dataset.famHealth) { const cur = S.d.me.shareHealth ?? {}; return savePref({ shareHealth: { [t.dataset.famHealth]: !cur[t.dataset.famHealth] } }); }
    if (t.dataset.famCol) { S.zoneDraft.color = t.dataset.famCol; return paint(); }
    if (t.dataset.famZic) { S.zoneDraft.icon = t.dataset.famZic; return paint(); }
    if (t.dataset.famZshow) { const z = zoneById(t.dataset.famZshow); if (z && map) map.setView([z.lat, z.lon], 15); return; }
    if (t.dataset.famZedit) { const z = zoneById(t.dataset.famZedit); S.zEdit = S.zEdit === z?.id ? null : z?.id ?? null; if (S.zEdit != null && map) map.setView([z.lat, z.lon], 15); return paint(); }
    if (t.dataset.famZeic) return patchZone(t.dataset.id, { icon: t.dataset.famZeic }, true);
    if (t.dataset.famZecol) return patchZone(t.dataset.id, { color: t.dataset.famZecol }, true);
    if (t.dataset.famZrm) {
      const z = zoneById(t.dataset.famZrm);
      if (!z || !confirm(`Slette sonen «${z.name}»?`)) return;
      try { await api(`/family/zones/${z.id}`, { method: 'DELETE' }); } catch (er) { return toast(er.message); }
      if (S.zEdit === z.id) S.zEdit = null;
      return load();
    }
    if (t.dataset.famUnphoto) {
      try { await api(`/family/photo/${encodeURIComponent(t.dataset.famUnphoto)}`, { method: 'DELETE' }); toast('Bruker kontobildet igjen'); } catch (er) { return toast(er.status === 404 ? 'Serveren støtter ikke egne bilder ennå' : er.message); }
      return load();
    }
    if (t.dataset.famNotify) {
      const z = S.d.zones.find((x) => x.id === +t.dataset.famNotify), n = { ...(z.notify?.[t.dataset.u] ?? {}) };
      n[t.dataset.k] = !n[t.dataset.k];
      try { const r = await api(`/family/zones/${z.id}/notify`, { method: 'PUT', json: { userId: t.dataset.u, enter: !!n.enter, leave: !!n.leave } }); Object.assign(z, r); } catch (er) { toast(er.message); }
      return paint();
    }
    switch (t.dataset.famAct) {
      case 'pick': S.picking = !S.picking; S.zoneDraft = null; return paint();
      case 'fit': return map && fitAll();
      case 'refresh': t.classList.add('spin'); await load(); setTimeout(() => t.classList.remove('spin'), 500); return;
      case 'zin': return map?.zoomIn();
      case 'zout': return map?.zoomOut();
      case 'unsel': S.sel = null; S.track = []; paint(); return drawMap();
      case 'ping': {
        const m = person(S.sel);
        try { await api(`/family/ping/${encodeURIComponent(S.sel)}`, { method: 'POST' }); toast(`Ber ${m?.name ?? 'telefonen'} spille av lyd`); }
        catch (er) { toast(er.status === 403 ? 'Slå på deling av din posisjon for å spille av lyd hos andre' : /404|finnes ikke|Not Found/i.test(er.message) ? 'Serveren støtter ikke «Spill av lyd» ennå' : er.message); }
        return;
      }
      case 'zclose': S.zoneDraft = null; return paint();
      case 'zsave': {
        const z = S.zoneDraft, payload = { name: z.name.trim(), lat: z.lat, lon: z.lon, radius: +z.radius, color: z.color, icon: z.icon ?? zIc(z), shared: !!z.shared };
        if (!payload.name) return toast('Gi sonen et navn');
        try { await api('/family/zones', { method: 'POST', json: payload }); } catch (er) { return toast(er.message); }
        S.zoneDraft = null; toast('Sonen er lagret'); return load();
      }
    }
  });
  h.addEventListener('input', (e) => {
    const ke = e.target.dataset.famZe;
    if (ke) {
      const id = e.target.dataset.id, v = ke === 'radius' ? +e.target.value : e.target.value;
      if (ke === 'name' && !v.trim()) return;
      if (ke === 'radius') { const r = h.querySelector(`[data-fam-zerv="${id}"]`); if (r) r.textContent = rTxt(v); }
      if (ke === 'color') { const hx = e.target.closest('.fam-colors')?.querySelector('.fam-hex'); if (hx) hx.textContent = v; }
      return patchZone(id, { [ke]: v }, false);
    }
    const k = e.target.dataset.famZ;
    if (!k || !S.zoneDraft) return;
    S.zoneDraft[k] = k === 'radius' ? +e.target.value : k === 'shared' ? e.target.checked : e.target.value;
    if (k === 'radius') { const v = h.querySelector('[data-fam-rv]'); if (v) v.textContent = rTxt(+e.target.value); drawMap(); }
    if (k === 'color') { const hx = h.querySelector('.fam-sheet .fam-hex'); if (hx) hx.textContent = e.target.value; drawMap(); }
  });
  h.addEventListener('change', (e) => {
    if (e.target.matches('[data-fam-here]')) { if (e.target.checked) startHere(); else stopHere(); }
    if (e.target.matches('[data-fam-z="color"]')) return paint(); // fri farge valgt: marker regnbuerundingen
    if (e.target.matches('[data-fam-ze="color"]')) return paint();
    if (e.target.matches('[data-fam-photo]')) { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto(e.target.dataset.famPhoto, f); return; }
    const zs = e.target.closest('[data-fam-zshare]');
    if (zs) {
      const z = S.d.zones.find((x) => x.id === +zs.dataset.famZshare);
      if (!z) return;
      const want = zs.checked;
      api(`/family/zones/${z.id}`, { method: 'PATCH', json: { shared: want } })
        .then((r) => { Object.assign(z, r?.id ? r : { shared: want }); toast(want ? `«${z.name}» deles med familien` : `«${z.name}» er privat`); })
        .catch((er) => { zs.checked = !want; toast(er.message); });
    }
  });
}

export function render() {
  setTimeout(async () => {
    const h = host();
    if (!h) return;
    bind(h);
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (!host()) { clearInterval(pollT); stopHere(); map?.remove(); map = null; unLive?.(); unLive = null; return; }
      if (!document.hidden && !S.zoneDraft) { if (!liveOn()) load(); pollEvents(); }
    }, 20_000);
    unLive?.();
    unLive = onLive('family', (m) => {
      if (!host()) { unLive?.(); unLive = null; return; }
      for (const e of m.events ?? (m.event ? [m.event] : [])) toast(`${e.name} ${e.kind === 'enter' ? 'kom til' : 'forlot'} ${e.zone}`);
      if (!S.zoneDraft) load();
    });
    try { L = await loadLeaflet(); } catch (e) { S.err = e.message; }
    await load();
  });
  return `<div class="fam-top"><div class="os-title">Famil<b>ie</b></div><div class="fam-sub">Posisjon, soner og helse fra dem som deler med deg. Deling er av som standard.</div></div>
    <div id="fam" class="fam">${body()}</div><div id="fam-toast" class="fam-toast" role="status" aria-live="polite" hidden></div>`;
}
