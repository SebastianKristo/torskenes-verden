// Familie og kart (prompt 16): alle på serveren på et OpenStreetMap-kart (Leaflet fra egen server), med spor,
// sensorer, soner (trykk på kartet), varsler per person, hendelser og helse. Personvern håndheves på serveren;
// her vises bare det den gir oss. Nettleseren kan dele egen posisjon mens siden er åpen.
import { api, esc, initials, hm, nb } from './util.js';

const S = { d: null, sel: null, track: [], err: null, zoneDraft: null, picking: false, sharingHere: false, watch: null, lastSent: 0 };
let map = null, L = null, layers = null, pollT = null, evSince = Date.now();

const ACT = { still: 'I ro', walking: 'Går', running: 'Løper', cycling: 'Sykler', driving: 'Kjører' };
const SHARE = { on: 'Deler', paused: 'Pauset', off: 'Av' };
const COLORS = ['#b23a2a', '#2f7a4f', '#2f5d8a', '#c98a1b', '#6b4fa0', '#1b1a17'];
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
const avatar = (m, cls = '') => `<span class="fam-av ${cls} s-${esc(m.sharing)}">${m.avatarUrl ? `<img src="${esc(m.avatarUrl)}" alt="">` : esc(initials(m.name))}</span>`;

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

function setupMap() {
  const el = document.getElementById('fam-map');
  if (!el || !L) return;
  if (map && map.getContainer() === el) return;
  map?.remove();
  map = L.map(el, { zoomControl: true, attributionControl: true }).setView([59.9139, 10.7522], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
  layers = { zones: L.layerGroup().addTo(map), track: L.layerGroup().addTo(map), people: L.layerGroup().addTo(map), draft: L.layerGroup().addTo(map) };
  map.on('click', (e) => { if (S.picking) openZone({ lat: e.latlng.lat, lon: e.latlng.lng }); });
  let fitted = false;
  map.whenReady(() => { drawMap(); if (!fitted) { fitAll(); fitted = true; } });
}

function fitAll() {
  const pts = (S.d?.members ?? []).filter((m) => m.last).map((m) => [m.last.lat, m.last.lon]);
  if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  else if (pts.length) map.setView(pts[0], 14);
}

function drawMap() {
  if (!map || !S.d) return;
  layers.zones.clearLayers(); layers.people.clearLayers(); layers.track.clearLayers(); layers.draft.clearLayers();
  for (const z of S.d.zones) {
    L.circle([z.lat, z.lon], { radius: z.radius, color: z.color, weight: 2, fillColor: z.color, fillOpacity: 0.12 }).addTo(layers.zones).bindTooltip(esc(z.name), { direction: 'top' });
  }
  if (S.track.length > 1) {
    L.polyline(S.track.map((p) => [p.lat, p.lon]), { color: '#b23a2a', weight: 3, opacity: 0.8 }).addTo(layers.track);
    L.circleMarker([S.track[0].lat, S.track[0].lon], { radius: 4, color: '#b23a2a', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(layers.track);
  }
  for (const m of S.d.members) {
    if (!m.last) continue;
    const icon = L.divIcon({ className: 'fam-pin-wrap', html: `<div class="fam-pin${m.userId === S.sel ? ' on' : ''}">${avatar(m)}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] });
    const mk = L.marker([m.last.lat, m.last.lon], { icon, title: m.name }).addTo(layers.people);
    mk.on('click', () => select(m.userId));
    if (m.last.acc && m.last.acc > 30) L.circle([m.last.lat, m.last.lon], { radius: m.last.acc, color: '#2f5d8a', weight: 1, fillOpacity: 0.06, interactive: false }).addTo(layers.people);
  }
  if (S.zoneDraft) {
    const z = S.zoneDraft;
    L.circle([z.lat, z.lon], { radius: z.radius, color: z.color, weight: 2, dashArray: '6 6', fillColor: z.color, fillOpacity: 0.18 }).addTo(layers.draft);
  }
}

/* ---------------- Data ---------------- */

async function load() {
  try {
    S.d = await api('/family');
    S.err = null;
    if (!S.sel) S.sel = (S.d.members.find((m) => !m.self && m.last) ?? me())?.userId ?? null;
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

function memberRow(m) {
  const l = m.last, sp = kmh(l?.speed);
  const status = m.sharing !== 'on' ? `<span class="fam-tag warn">${SHARE[m.sharing]}</span>` : m.precision === 'approx' ? '<span class="fam-tag">Omtrentlig</span>' : '';
  const where = l ? (l.place ? `Hos ${esc(l.place)}` : l.approx ? 'Omtrentlig posisjon' : `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`) : m.sharing === 'on' ? 'Ingen posisjon ennå' : 'Deling er pauset';
  return `<button type="button" class="fam-person${m.userId === S.sel ? ' on' : ''}" data-fam-sel="${esc(m.userId)}">
    ${avatar(m, 'lg')}
    <span class="fam-pmain"><span class="fam-pname"><b>${esc(m.name)}${m.self ? ' <i>(deg)</i>' : ''}</b>${status}</span><span class="fam-sub">@${esc(m.username)} · ${where}</span>
      ${l ? `<span class="fam-sens">
        <span title="Sist sett">◷ ${ago(l.ts)}</span>
        ${l.activity ? `<span>${ACT[l.activity] ?? esc(l.activity)}</span>` : ''}
        ${sp != null && sp > 0 ? `<span>${sp} km/t</span>` : ''}
        ${l.battery != null ? `<span class="${l.battery < 20 && !l.charging ? 'low' : ''}">${l.charging ? '⚡' : '▮'} ${Math.round(l.battery)} %</span>` : ''}
        ${l.acc != null ? `<span title="GPS-nøyaktighet">±${l.acc >= 1000 ? `${nb(l.acc / 1000, 1)} km` : `${Math.round(l.acc)} m`}</span>` : ''}
      </span>` : ''}
    </span></button>`;
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

function zonesCard() {
  const z = S.d?.zones ?? [], others = (S.d?.members ?? []).filter((m) => !m.self);
  return `<section class="card fam-card"><div class="fam-h"><span class="fam-k">Soner</span>
      <button type="button" class="fam-btn${S.picking ? ' pri' : ''}" data-fam-act="pick">${S.picking ? 'Trykk på kartet …' : '+ Ny sone'}</button></div>
    ${z.length ? z.map((x) => `<div class="fam-zone">
      <div class="fam-zrow"><span class="fam-dot" style="background:${esc(x.color)}"></span><b>${esc(x.name)}</b><span class="fam-sub">${nb(x.radius)} m</span>
        <button type="button" class="fam-link" data-fam-zedit="${x.id}">Endre</button></div>
      ${others.length ? `<div class="fam-notify">${others.map((m) => { const n = x.notify?.[m.userId] ?? {}; return `<div class="fam-nrow"><span>${esc(m.name)}</span>
        <button type="button" class="fam-chip${n.enter ? ' on' : ''}" data-fam-notify="${x.id}" data-u="${esc(m.userId)}" data-k="enter">Kommer</button>
        <button type="button" class="fam-chip${n.leave ? ' on' : ''}" data-fam-notify="${x.id}" data-u="${esc(m.userId)}" data-k="leave">Forlater</button></div>`; }).join('')}</div>` : ''}
    </div>`).join('') : '<div class="fam-empty">Ingen soner ennå. Trykk «+ Ny sone» og så på kartet.</div>'}
  </section>`;
}

function eventsCard() {
  const ev = S.d?.events ?? [];
  return `<section class="card fam-card"><div class="fam-h"><span class="fam-k">Hendelser</span></div>
    ${ev.length ? `<ul class="fam-ev">${ev.slice(0, 12).map((e) => `<li><span class="fam-dot ${e.kind}"></span><span><b>${esc(e.name)}</b> ${e.kind === 'enter' ? 'kom til' : 'forlot'} <b>${esc(e.zone)}</b></span><time>${hm(new Date(e.ts))}</time></li>`).join('')}</ul>` : '<div class="fam-empty">Ingen hendelser ennå.</div>'}
  </section>`;
}

function privacyCard() {
  const p = S.d?.me;
  if (!p) return '';
  const seg = (k, opts) => `<div class="fam-seg">${opts.map(([v, t]) => `<button type="button" class="${p[k] === v ? 'on' : ''}" data-fam-pref="${k}" data-v="${v}">${t}</button>`).join('')}</div>`;
  const hs = [['steps', 'Skritt'], ['restingHr', 'Hvilepuls'], ['hr', 'Puls'], ['sleep', 'Søvn'], ['activeKcal', 'Aktive kalorier'], ['week', 'Siste 7 dager']];
  return `<section class="card fam-card"><div class="fam-h"><span class="fam-k">Min deling</span><span class="fam-sub">${p.sharing === 'on' ? 'De andre ser deg' : p.sharing === 'paused' ? 'De andre ser at du har pauset' : 'Deling er av, og sporet ditt er slettet'}</span></div>
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
  return `<div class="fam-sheet" role="dialog" aria-label="${z.id ? 'Endre sone' : 'Ny sone'}">
    <div class="fam-h"><span class="fam-k">${z.id ? 'Endre sone' : 'Ny sone'}</span><button type="button" class="fam-link" data-fam-act="zclose">Avbryt</button></div>
    <label class="fam-f"><span>Navn</span><input data-fam-z="name" value="${esc(z.name)}" placeholder="f.eks. Hjem, Skole, Jobb" maxlength="60"></label>
    <label class="fam-f"><span>Radius · <b data-fam-rv>${nb(z.radius)} m</b></span><input type="range" min="50" max="2000" step="25" value="${z.radius}" data-fam-z="radius"></label>
    <div class="fam-f"><span>Farge</span><div class="fam-colors">${COLORS.map((c) => `<button type="button" class="fam-col${z.color === c ? ' on' : ''}" style="background:${c}" data-fam-col="${c}" aria-label="Farge ${c}"></button>`).join('')}</div></div>
    <div class="fam-sheetbtns">${z.id ? '<button type="button" class="fam-btn danger" data-fam-act="zdel">Slett</button>' : ''}<button type="button" class="fam-btn pri" data-fam-act="zsave">Lagre</button></div>
  </div>`;
}

function body() {
  if (S.err && !S.d) return `<div class="card fam-card"><div class="fam-empty">Kunne ikke hente familien: ${esc(S.err)}</div></div>`;
  if (!S.d) return '<div class="card fam-card"><div class="fam-empty">Laster …</div></div>';
  return `<div class="fam-grid">
    <section class="card fam-mapcard"><div id="fam-map" class="fam-map${S.picking ? ' picking' : ''}"></div>${zoneSheet()}</section>
    <div class="fam-side">
      <section class="card fam-card"><div class="fam-h"><span class="fam-k">Familien</span><span class="fam-sub">${S.d.members.filter((m) => m.last).length} av ${S.d.members.length} synlige</span></div>
        <div class="fam-people">${S.d.members.map(memberRow).join('')}</div></section>
      ${healthCard()}
    </div>
    <div class="fam-row3">${zonesCard()}${eventsCard()}${privacyCard()}</div>
  </div>`;
}

function paint() {
  const h = host();
  if (!h) return;
  // Kartet beholdes mellom oppdateringer; bare kortene rundt tegnes på nytt.
  const mapEl = document.getElementById('fam-map');
  if (mapEl && S.d) {
    const keep = mapEl;
    h.innerHTML = body();
    document.getElementById('fam-map').replaceWith(keep);
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
  S.zoneDraft = { name: '', radius: 150, color: COLORS[0], ...at };
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

function bind(h) {
  if (h.dataset.famBound) return;
  h.dataset.famBound = '1';
  h.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.famSel) return select(t.dataset.famSel);
    if (t.dataset.famPref) return savePref({ [t.dataset.famPref]: t.dataset.v });
    if (t.dataset.famHealth) { const cur = S.d.me.shareHealth ?? {}; return savePref({ shareHealth: { [t.dataset.famHealth]: !cur[t.dataset.famHealth] } }); }
    if (t.dataset.famCol) { S.zoneDraft.color = t.dataset.famCol; return paint(); }
    if (t.dataset.famZedit) { const z = S.d.zones.find((x) => x.id === +t.dataset.famZedit); S.zoneDraft = { ...z }; map?.setView([z.lat, z.lon], 15); return paint(); }
    if (t.dataset.famNotify) {
      const z = S.d.zones.find((x) => x.id === +t.dataset.famNotify), n = { ...(z.notify?.[t.dataset.u] ?? {}) };
      n[t.dataset.k] = !n[t.dataset.k];
      try { const r = await api(`/family/zones/${z.id}/notify`, { method: 'PUT', json: { userId: t.dataset.u, enter: !!n.enter, leave: !!n.leave } }); Object.assign(z, r); } catch (er) { toast(er.message); }
      return paint();
    }
    switch (t.dataset.famAct) {
      case 'pick': S.picking = !S.picking; return paint();
      case 'zclose': S.zoneDraft = null; return paint();
      case 'zdel': {
        if (!confirm(`Slette sonen «${S.zoneDraft.name}»?`)) return;
        try { await api(`/family/zones/${S.zoneDraft.id}`, { method: 'DELETE' }); } catch (er) { return toast(er.message); }
        S.zoneDraft = null; return load();
      }
      case 'zsave': {
        const z = S.zoneDraft, payload = { name: z.name.trim(), lat: z.lat, lon: z.lon, radius: +z.radius, color: z.color };
        if (!payload.name) return toast('Gi sonen et navn');
        try { await api(z.id ? `/family/zones/${z.id}` : '/family/zones', { method: z.id ? 'PATCH' : 'POST', json: payload }); } catch (er) { return toast(er.message); }
        S.zoneDraft = null; toast('Sonen er lagret'); return load();
      }
    }
  });
  h.addEventListener('input', (e) => {
    const k = e.target.dataset.famZ;
    if (!k || !S.zoneDraft) return;
    S.zoneDraft[k] = k === 'radius' ? +e.target.value : e.target.value;
    if (k === 'radius') { const v = h.querySelector('[data-fam-rv]'); if (v) v.textContent = `${nb(+e.target.value)} m`; drawMap(); }
  });
  h.addEventListener('change', (e) => {
    if (e.target.matches('[data-fam-here]')) { if (e.target.checked) startHere(); else stopHere(); }
  });
}

export function render() {
  setTimeout(async () => {
    const h = host();
    if (!h) return;
    bind(h);
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (!host()) { clearInterval(pollT); stopHere(); map?.remove(); map = null; return; }
      if (!document.hidden && !S.zoneDraft) { load(); pollEvents(); }
    }, 20_000);
    try { L = await loadLeaflet(); } catch (e) { S.err = e.message; }
    await load();
  });
  return `<div class="fam-top"><div class="os-title">Famil<b>ie</b></div><div class="fam-sub">Posisjon, soner og helse for alle som bruker appen</div></div>
    <div id="fam" class="fam">${body()}</div><div id="fam-toast" class="fam-toast" role="status" aria-live="polite" hidden></div>`;
}
