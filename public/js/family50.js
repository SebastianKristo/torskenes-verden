// Prompt 50 (FAMWEB50): Familie i nytt design for web og PWA (claude-code-familie-nytt-design.md + klientdelen av
// claude-code-steder-flere-omrader-ruter.md). Fasit: design/Familie App.dc.html og Familie Redesign.dc.html 2a.
//   Faner: Folk · Steder · Helse · Sjekk inn (mørk pille nederst). Undersider: Kart, Personside, Sted (flere områder, 4b),
//   Helse for personen (5b) og Sendt (6b). Fold/brett/desktop: to kolonner – lista til venstre, kart/personside til høyre.
// Én modul for begge klientene: web (public/js/app.js, #/familie/…) og PWA-en (public/finans/js/mobile-p50f.js, #/fam/…).
// Undersidene har egen hash, så nettleserens tilbake, kant-sveip og Android-tilbake går dit du kom fra (Folk, Kart eller Helse).
// Rot-elementet (og Leaflet-kartene) beholdes mellom tegninger; verten legger det inn i en plassholder (mount50).
// API (SERVER50-API.md, SRVFAM50): /api/family/people50(/:id), /today50, /places(/:id/areas…), /health50(/:id, /goal, /:id/request),
// /checkin(…), /api/ruter/school50. Eldre: /api/family (Min deling), /family/me, /family/zones/:id/notify, /api/velfremme (På vei hjem).
// Personvern håndheves på serveren; her vises bare det den sender. Posisjonen sendes bare med selve innsjekken.
import { ZIC42, IFY42 } from './icons42.js';

const NB = new Intl.NumberFormat('nb-NO');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = (n) => (n == null ? '—' : NB.format(Math.round(n)).replace(/\s/g, ' '));
const HEX = /^#[0-9a-f]{6}$/i;
const PCOL = ['#b23a2a', '#2b5d8a', '#2f6b45', '#a8661a', '#7a3b6b'];
const colOf = (p) => (HEX.test(p?.color ?? '') ? p.color : PCOL[[...String(p?.userId ?? p?.name ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % PCOL.length]);
const iniOf = (p) => p?.initials || String(p?.name ?? '?').trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase());
const first = (n) => String(n ?? '').split(/\s+/)[0];
const join = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}`);
const hm = (t) => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const svg = (d, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${esc(d)}"/></svg>`;
const TYPES = [['hjem', 'Hjem'], ['skole', 'Skole'], ['jobb', 'Jobb'], ['annet', 'Annet']];
const TYPE_IC = { hjem: 'home', skole: 'school', jobb: 'work', annet: 'pin' };
const COLORS = ['#b23a2a', '#2b5d8a', '#a8661a', '#2f6b45', '#7a3b6b', '#2e6f75', '#d9662a', '#5b4bb5', '#c2417a', '#5c5850'];
const IC = {
  ring: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2', msg: 'M4 5h16v11H8l-4 4z', dir: 'M3 11l18-8-8 18-2-8z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0', pin: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
};
const placeIc = (z) => { const k = z?.icon; if (k && IFY42.test(k) && z.icp) return z.icp; return (ZIC42[k] ?? ZIC42[TYPE_IC[z?.type]] ?? ZIC42.pin)[1]; };
const placeCol = (z) => (HEX.test(z?.color ?? '') ? z.color : '#a8661a');
const rTxt = (r) => (r >= 1000 ? `${String(Math.round(r / 100) / 10).replace('.', ',')} km` : `${Math.round(r)} m`);

/* ---------------- Tilstand ---------------- */
const F = {
  o: { env: 'web', base: '#/familie', api: null, dark: () => false, home: null, settings: null, velfremme: null, ownHash: false, wide: 900 },
  root: null, sub: null, v: { v: 'folk' }, hist: [], d: {}, at: {}, err: {}, busy: {}, pp: {}, hp: {},
  draft: null, pick: false, addArea: null, editR: null, ci: null, sheet: 'mid', deling: false, plus: false, toast: '', toastT: 0,
  scroll: {}, two: false, live: 0, pollT: 0, seen: new Set(), pos: null, posT: 0,
};
const isTwo = () => (F.root?.isConnected ? (F.root.parentElement?.clientWidth || innerWidth) : innerWidth) >= F.o.wide;
const href = (sub) => `${F.o.base}${sub ? `/${sub}` : ''}`;

async function api(path, opts = {}) {
  if (F.o.api) return F.o.api(path, opts);
  const init = { credentials: 'same-origin', ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const r = await fetch(`/api${path}`, init);
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Feil ${r.status}`), { status: r.status, code: d?.code, data: d });
  return d;
}
const errMsg = (e) => (e?.status === 404 || e?.status === 405 ? 'Krever en nyere Homelab-server' : e?.message || 'Noe gikk galt');
function toast(msg) {
  F.toast = msg; clearTimeout(F.toastT);
  F.toastT = setTimeout(() => { F.toast = ''; F.root?.querySelector('.f50-toast')?.remove(); }, 3800);
  const t = F.root?.querySelector('.f50-toast');
  if (t) t.textContent = msg; else F.root?.insertAdjacentHTML('beforeend', `<div class="f50-toast" role="status">${esc(msg)}</div>`);
}

/* ---------------- Ruter (hash) ---------------- */
// Undersider: kart · person/<id>[/<fra>] · steder · steder/<id> · steder/ny/<type> · helse · helse/<id> · sjekk · sjekk/<id> · hjem (web: På vei hjem).
// Serverens lenker (?sted=, ?ny=, ?id=, ?igjen=, ?req=) godtas også.
export function parse50(sub) {
  const [p, qs] = String(sub ?? '').replace(/^\/+/, '').split('?'), a = p.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const q = new URLSearchParams(qs ?? '');
  switch (a[0]) {
    case 'kart': return { v: 'kart', tab: 'folk' };
    case 'person': { const from = a[2] === 'helse' && a[3] ? `helse:${a[3]}` : a[2] || q.get('fra') || 'folk'; return { v: 'person', id: a[1], from, tab: /^helse/.test(from) ? 'helse' : 'folk' }; }
    case 'steder': case 'sted': case 'soner': {
      if (q.get('ny') || a[1] === 'ny') return { v: 'sted', id: 'ny', type: q.get('ny') || a[2] || 'annet', tab: 'steder' };
      const id = q.get('sted') || a[1];
      return id ? { v: 'sted', id, tab: 'steder' } : { v: 'steder', tab: 'steder' };
    }
    case 'helse': return a[1] ? { v: 'helsep', id: a[1], tab: 'helse' } : { v: 'helse', tab: 'helse' };
    case 'sjekk': case 'hjemlys': case 'velfremme': {
      if (a[1] === 'svar' && a[2]) return { v: 'sjekk', tab: 'sjekk', req: a[2] }; // PWA: #/fam/sjekk/svar/<forespørsel>
      const id = a[1] || q.get('id');
      if (id) return { v: 'sendt', id, tab: 'sjekk' };
      return { v: 'sjekk', tab: 'sjekk', again: q.get('igjen'), req: q.get('req') };
    }
    case 'hjem': return { v: 'vel', tab: 'sjekk' };
    default: {
      // Eldre lenker: #/familie?person=<id> («Hvor er Ingrid?» → Vis på kart) og ?tab=soner|helse|hjemlys.
      if (q.get('person')) return { v: 'person', id: q.get('person'), from: 'folk', tab: 'folk' };
      const t = q.get('tab');
      if (t === 'soner' || t === 'steder') return { v: 'steder', tab: 'steder' };
      if (t === 'helse') return { v: 'helse', tab: 'helse' };
      if (t === 'hjemlys' || t === 'velfremme' || t === 'sjekk') return { v: 'sjekk', tab: 'sjekk' };
      if (t === 'kart') return { v: 'kart', tab: 'folk' };
      return { v: 'folk', tab: 'folk' };
    }
  }
}
const subOf = (v) => {
  switch (v.v) {
    case 'kart': return 'kart';
    case 'person': return `person/${encodeURIComponent(v.id)}${v.from && v.from !== 'folk' ? `/${String(v.from).replace(':', '/')}` : ''}`;
    case 'steder': return 'steder';
    case 'sted': return v.id === 'ny' ? `steder/ny/${v.type || 'annet'}` : `steder/${v.id}`;
    case 'helse': return 'helse';
    case 'helsep': return `helse/${encodeURIComponent(v.id)}`;
    case 'sjekk': return 'sjekk';
    case 'sendt': return `sjekk/${v.id}`;
    case 'vel': return 'hjem';
    default: return '';
  }
};
const parentOf = (v) => {
  if (v.v === 'person') return v.from === 'kart' ? 'kart' : v.from === 'helse' ? 'helse' : /^helse:/.test(v.from) ? `helse/${encodeURIComponent(v.from.slice(6))}` : '';
  if (v.v === 'kart') return '';
  if (v.v === 'sted') return 'steder';
  if (v.v === 'helsep') return 'helse';
  if (v.v === 'sendt' || v.v === 'vel') return 'sjekk';
  return null;
};
function go(sub) {
  const h = href(sub);
  if (location.hash === h) { setSub(sub); return; }
  location.hash = h; // web: hashchange → setSub · PWA: route() → draw → mount50
}
/** «‹ Folk», «‹ Familie» osv.: går tilbake i historikken når forrige side var Familie, ellers til forelderen. */
function back() {
  const par = parentOf(F.v);
  if (F.hist.length > 1 && F.hist[F.hist.length - 2] === par) { history.back(); return; }
  if (par == null) { home(); return; }
  go(par);
}
function home() { if (F.o.home) F.o.home(); else location.hash = '#/dash'; }

/** Ny underside (fra verten eller hashchange). */
export function setSub(sub) {
  sub = String(sub ?? '');
  if (sub === F.sub && F.root?.childElementCount) return;
  const h = F.hist;
  if (h.length > 1 && h[h.length - 2] === sub) h.pop(); else if (h[h.length - 1] !== sub) h.push(sub);
  if (h.length > 30) h.splice(0, h.length - 30);
  F.sub = sub;
  const v = parse50(sub);
  const prevSted = F.v.v === 'sted' ? F.v.id : null;
  F.v = v; F.plus = false;
  if (v.v !== 'sted' || String(prevSted) !== String(v.id)) { F.draft = null; F.pick = false; F.addArea = null; F.editR = null; }
  if (v.v === 'kart') F.sheet = 'mid';
  enter(v);
  paint();
}

/* ---------------- Data ---------------- */
async function loadKey(k, path, force = false, maxAge = 15_000) {
  if (F.busy[k] || (!force && F.d[k] && Date.now() - (F.at[k] ?? 0) < maxAge)) return F.d[k];
  F.busy[k] = true;
  try { F.d[k] = await api(path); F.at[k] = Date.now(); F.err[k] = null; }
  catch (e) { F.err[k] = errMsg(e); }
  F.busy[k] = false;
  return F.d[k];
}
const loadPeople = (f) => loadKey('ppl', '/family/people50', f);
const loadToday = (f) => loadKey('today', '/family/today50', f);
const loadPlaces = (f) => loadKey('places', '/family/places', f, 30_000);
const loadHealth = (f) => loadKey('health', '/family/health50', f, 60_000);
const loadFam = (f) => loadKey('fam', '/family', f, 30_000);
async function loadCi(force = false) {
  const p = F.pos && Date.now() - F.posT < 120_000 ? `?lat=${F.pos.lat}&lon=${F.pos.lon}&acc=${Math.round(F.pos.acc ?? 0)}` : '';
  return loadKey('ci', `/family/checkin${p}`, force, 20_000);
}
async function loadPerson(id, force = false) {
  if (!id) return;
  const k = `p:${id}`;
  if (F.busy[k] || (!force && F.pp[id] && Date.now() - (F.at[k] ?? 0) < 15_000)) return;
  F.busy[k] = true;
  try { F.pp[id] = await api(`/family/people50/${encodeURIComponent(id)}`); F.at[k] = Date.now(); F.err[k] = null; }
  catch (e) { F.err[k] = e.status === 404 ? 'Personen deler ikke posisjon med deg' : errMsg(e); }
  F.busy[k] = false;
}
async function loadHp(id, force = false) {
  const k = `h:${id}`;
  if (F.busy[k] || (!force && F.hp[id] && Date.now() - (F.at[k] ?? 0) < 30_000)) return;
  F.busy[k] = true;
  try { F.hp[id] = await api(`/family/health50/${encodeURIComponent(id)}`); F.at[k] = Date.now(); F.err[k] = null; }
  catch (e) { F.err[k] = errMsg(e); }
  F.busy[k] = false;
}
async function loadCheckin(id) {
  const k = `c:${id}`;
  if (F.busy[k]) return;
  F.busy[k] = true;
  try { const r = await api(`/family/checkin/${encodeURIComponent(id)}`); F.d[k] = r?.checkin ?? null; F.err[k] = null; }
  catch (e) { F.err[k] = e.status === 404 ? 'Fant ikke innsjekken' : errMsg(e); }
  F.busy[k] = false;
  const c = F.d[k];
  if (c && !c.mine && !F.seen.has(c.id) && (c.to ?? []).some((t) => t.self && !t.seenAt)) {
    F.seen.add(c.id);
    api(`/family/checkin/${c.id}/seen`, { method: 'POST', json: {} }).then((r) => { if (r?.checkin) F.d[k] = r.checkin; }).catch(() => {});
  }
}
/** Data for siden som åpnes. Tegner på nytt når noe kommer inn. */
function enter(v) {
  const jobs = [loadPeople()];
  if (v.v === 'folk' || v.v === 'kart') jobs.push(loadToday(), loadPlaces());
  if (v.v === 'person') jobs.push(loadPerson(v.id), loadPlaces());
  if (v.v === 'steder' || v.v === 'sted') jobs.push(loadPlaces());
  if (v.v === 'helse' || v.v === 'helsep') jobs.push(loadHealth());
  if (v.v === 'helsep') jobs.push(loadHp(v.id));
  if (v.v === 'sjekk' || v.v === 'sendt') { jobs.push(loadCi()); askPos(); }
  if (v.v === 'sendt') jobs.push(loadCheckin(v.id));
  if (v.v === 'vel') jobs.push(loadFam());
  if (F.deling) jobs.push(loadFam());
  Promise.all(jobs).then(() => { initCi(); applyReq(v); paint(); }).catch(() => paint());
}
/** Posisjonen til Sjekk inn (bare når fanen er åpen; sendes bare med selve innsjekken). */
function askPos(cb) {
  if (F.pos && Date.now() - F.posT < 60_000) { cb?.(F.pos); return; }
  if (!navigator.geolocation) { cb?.(null); return; }
  navigator.geolocation.getCurrentPosition((p) => {
    const had = !!F.pos;
    F.pos = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: p.coords.accuracy }; F.posT = Date.now();
    cb?.(F.pos);
    if (!had && (F.v.v === 'sjekk' || F.v.v === 'sendt')) loadCi(true).then(() => { initCi(true); paint(); });
  }, () => cb?.(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 });
}

/* ---------------- Byggeklosser ---------------- */
function av(p, size = 38, cls = '') {
  const ph = p?.photoUrl, c = colOf(p);
  return `<span class="f50-av ${cls}" style="--s:${size}px;--pc:${esc(c)}">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<em>${esc(iniOf(p))}</em></span>`;
}
const btn = (attr, label, cls = '') => `<button type="button" class="${cls}" ${attr}>${label}</button>`;
const lab = (t, cls = '') => `<div class="f50-lab ${cls}">${esc(t)}</div>`;
const ppl = () => F.d.ppl?.people ?? [];
const personBy = (id) => ppl().find((p) => String(p.userId) === String(id));
const me = () => ppl().find((p) => p.self);
const batTxt = (p) => (p?.battery == null ? '' : `${Math.round(p.battery)} %${p.charging ? ' ⚡' : ''}`);
const loading = (k) => `<div class="f50-card f50-empty">${F.err[k] ? esc(F.err[k]) : 'Laster …'}</div>`;
function head(title, sub, left = '', right = '') {
  return `${left || right ? `<div class="f50-topbar">${left}<span class="f50-grow"></span>${right}</div>` : '<div class="f50-topgap"></div>'}
    <div class="f50-head"><h1 class="f50-h1">${esc(title)}</h1>${sub ? `<div class="f50-sub">${sub}</div>` : ''}</div>`;
}
const homeBtn = () => (F.o.env === 'pwa' ? btn('data-f50="home"', '‹ Hjem', 'f50-pill') : '');
const backBtn = (label, cls = 'f50-pill') => btn('data-f50="back"', `‹ ${esc(label)}`, cls);

/* ---------------- 1 · Folk ---------------- */
function folkCard(p) {
  const low = !!p.lowBattery && !p.charging, off = p.status === 'off';
  return `<button type="button" class="f50-card f50-pc${low ? ' low' : ''}${off ? ' off' : ''}" data-f50="person" data-id="${esc(p.userId)}" aria-label="${esc(`${p.name}: ${p.place ?? ''}`)}">
    <span class="f50-pch">${av(p, 38)}${p.battery != null ? `<span class="f50-bat${low ? ' low' : ''}">${esc(batTxt(p))}</span>` : ''}</span>
    <span class="f50-pcb"><b class="f50-pn">${esc(p.self ? `${p.name} (deg)` : p.name)}</b><span class="f50-place">${esc(p.place ?? '—')}</span><span class="f50-since">${esc(p.sub ?? (p.status === 'stale' ? 'sist sett tidligere' : ' '))}</span></span>
  </button>`;
}
function todayRows(items, empty = 'Ingen hendelser i dag ennå.') {
  if (!items?.length) return `<div class="f50-list"><div class="f50-row f50-mut">${esc(empty)}</div></div>`;
  return `<div class="f50-list">${items.slice(0, 12).map((e) => `<div class="f50-row${e.checkinId ? ' tap' : ''}"${e.checkinId ? ` data-f50="ci" data-id="${esc(e.checkinId)}" role="button" tabindex="0"` : ''}>${av(e.avatar, 28, 'sm')}<span class="f50-grow f50-rt"><b>${esc(e.title)}</b>${e.sub ? `<span>${esc(e.sub)}</span>` : ''}</span><span class="f50-when${e.pending || e.alert ? ' red' : ''}">${esc(e.right ?? e.time ?? '')}</span></div>`).join('')}</div>`;
}
function delingPanel() {
  if (!F.deling) return '';
  const p = F.d.fam?.me;
  if (!p) return `<div class="f50-card f50-empty">${F.err.fam ? esc(F.err.fam) : 'Laster …'}</div>`;
  const seg = (k, opts) => `<div class="f50-seg">${opts.map(([v, t]) => `<button type="button" aria-pressed="${p[k] === v}" data-f50="pref" data-k="${k}" data-v="${v}">${t}</button>`).join('')}</div>`;
  const hs = [['steps', 'Skritt'], ['restingHr', 'Hvilepuls'], ['hr', 'Puls'], ['sleep', 'Søvn'], ['activeKcal', 'Aktive kalorier'], ['week', 'Siste 7 dager']];
  return `<div class="f50-card f50-deling"><b>Min deling</b><span class="f50-mut">${p.sharing === 'on' ? 'Familien ser hvor du er' : p.sharing === 'paused' ? 'Pauset · de andre ser at du har pauset' : 'Av · ingen ser posisjonen din'}</span>
    ${seg('sharing', [['on', 'Deler'], ['paused', 'Pause'], ['off', 'Av']])}${seg('precision', [['exact', 'Nøyaktig'], ['approx', 'Omtrentlig (~1 km)']])}
    <span class="f50-lab sm">HELSE JEG DELER</span><div class="f50-chips">${hs.map(([k, t]) => `<button type="button" class="f50-chip" aria-pressed="${!!p.shareHealth?.[k]}" data-f50="hshare" data-k="${k}">${t}</button>`).join('')}</div></div>`;
}
function folkList() {
  const D = F.d.ppl;
  const plus = `<span class="f50-plusw">${btn('data-f50="plus" aria-label="Nytt sted eller inviter" aria-expanded="' + F.plus + '"', '+', 'f50-round ink')}${F.plus ? `<span class="f50-menu" role="menu">${btn('data-f50="nysted" role="menuitem"', 'Nytt sted')}${btn('data-f50="invite" role="menuitem"', 'Inviter til familien')}</span>` : ''}</span>`;
  if (!D) return head('Familie', '', homeBtn(), plus) + loading('ppl');
  const L = D.people ?? [];
  const today = F.d.today?.items ?? [];
  const mine = me();
  return `${head(D.title ?? 'Familie', esc(D.subtitle ?? `${L.length} personer`), homeBtn(), plus)}
    <div class="f50-grid2">${L.map(folkCard).join('')}</div>
    ${F.two ? '' : `<div class="f50-strip"><div class="f50-mapslot" data-f50-map="strip"></div>${btn('data-f50="kart"', 'Åpne kart', 'f50-pill ink f50-stripb')}</div>`}
    ${lab('I DAG', 'red')}${F.d.today ? todayRows(today) : loading('today')}
    ${mine ? `<button type="button" class="f50-link f50-delb" data-f50="deling" aria-expanded="${F.deling}">${svg(IC.pin, 15)}<span class="f50-grow">Min deling · ${esc(mine.sharing === 'on' ? (mine.precision === 'approx' ? 'Deler omtrentlig' : 'Deler') : mine.sharing === 'paused' ? 'Pauset' : 'Av')}</span><b>${F.deling ? 'Skjul' : 'Endre ›'}</b></button>${delingPanel()}` : ''}`;
}

/* ---------------- 2 · Kart ---------------- */
function kartRows() {
  const L = ppl();
  return `<div class="f50-list">${L.map((p) => `<button type="button" class="f50-row f50-krow" data-f50="person" data-id="${esc(p.userId)}">${av(p, 42)}<span class="f50-grow f50-rt"><b class="big">${esc(p.self ? `${p.name} (deg)` : p.name)}</b><span>${esc([p.place, p.status === 'off' ? null : p.since ? hm(p.since) : p.activity && p.activity.toLowerCase() !== String(p.place ?? '').toLowerCase() ? p.activity : p.updatedAt ? hm(p.updatedAt) : null].filter(Boolean).join(' · '))}</span></span>
    <span class="f50-kr"><b class="${p.lowBattery && !p.charging ? 'red' : 'green'}">${esc(batTxt(p))}</b><span>${esc(p.self ? 'Her' : p.fromMe?.text ?? '')}</span></span></button>`).join('')}</div>`;
}
function kartView() {
  const L = ppl();
  return `<div class="f50-mapfull"><div class="f50-mapslot" data-f50-map="big"></div>
    <div class="f50-mtop">${F.two ? '<span></span>' : backBtn('Familie', 'f50-pill sh')}${btn('data-f50="findme" aria-label="Finn meg"', svg('M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3', 18, 2.2), 'f50-round sh')}</div>
    ${F.two ? '' : `<div class="f50-sheet ${F.sheet}" data-f50-sheet><span class="f50-grab" data-f50-grab aria-hidden="true"></span><div class="f50-sheet-in"><div class="f50-sht">${L.length} ${L.length === 1 ? 'person' : 'personer'}</div>${kartRows()}</div></div>`}</div>`;
}

/* ---------------- 3 · Personside ---------------- */
const isApple = () => /iPhone|iPad|Macintosh/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
function personView() {
  const id = F.v.id, P = F.pp[id] ?? personBy(id);
  const fromLabel = F.v.from === 'kart' ? 'Kart' : /^helse/.test(F.v.from) ? 'Helse' : 'Folk';
  const top = `<div class="f50-mtop">${F.two ? '<span></span>' : backBtn(fromLabel, 'f50-pill sh')}</div>`;
  if (!P) return `<div class="f50-mapfull">${top}<div class="f50-sheet tall"><div class="f50-sheet-in">${loading(`p:${id}`)}</div></div></div>`;
  const H = F.pp[id]?.health ?? null, T = H?.today ?? {}, sh = !!H?.shared;
  const dest = P.lat != null ? (isApple() ? `https://maps.apple.com/?daddr=${P.lat},${P.lon}` : `https://www.google.com/maps/dir/?api=1&destination=${P.lat},${P.lon}`) : null;
  const tel = P.phone ? `tel:${String(P.phone).replace(/[^\d+]/g, '')}` : null, sms = P.phone ? `sms:${String(P.phone).replace(/[^\d+]/g, '')}` : null;
  const act = (ic, n, h, attr) => (h ? `<a class="f50-act" href="${esc(h)}"${/^https/.test(h) ? ' target="_blank" rel="noopener"' : ''}>${svg(ic)}${n}</a>` : `<button type="button" class="f50-act" ${attr}>${svg(ic)}${n}</button>`);
  const stat = (k, v, s) => `<div class="f50-stat"><span class="f50-k">${esc(k)}</span><b>${esc(v ?? '—')}</b><span>${esc(s ?? '')}</span></div>`;
  const week = sh && Array.isArray(H.week) && H.week.some((d) => d.steps != null) ? H.week : null;
  const mx = week ? Math.max(1, ...week.map((d) => d.steps ?? 0), T.goal ?? 0) : 1, c = colOf(P);
  const body = `<div class="f50-ph">${av(P, 52)}<span class="f50-grow"><b class="f50-pnm">${esc(P.self ? `${P.name} (deg)` : P.name)}</b><span class="f50-pst">${esc(P.statusLine ?? P.place ?? '')}</span></span></div>
    ${P.self ? '' : `<div class="f50-acts">${act(IC.ring, 'Ring', tel, 'data-f50="nophone"')}${act(IC.msg, 'Melding', sms, 'data-f50="nophone"')}${act(IC.dir, 'Veibeskrivelse', dest, 'data-f50="nopos"')}</div>`}
    <div class="f50-stats">${stat('BATTERI', P.battery != null ? `${Math.round(P.battery)} %` : null, P.battery == null ? 'Ukjent' : P.charging ? 'Lader' : 'Lader ikke')}${stat('NØYAKTIGHET', P.acc != null ? (P.approx ? 'Omtrentlig' : rTxt(P.acc)) : null, P.device ?? (P.approx ? '~1 km' : ''))}
      ${stat('SKRITT I DAG', sh && T.steps != null ? nf(T.steps) : null, sh ? (T.goalReached ? 'Målet nådd' : T.goal ? `av ${nf(T.goal)}` : '') : 'Ikke delt')}${stat('SØVN', sh ? T.sleepText : null, sh ? (T.restingHr != null ? `Hvilepuls ${T.restingHr}` : '') : 'Ikke delt')}</div>
    ${week ? `<div class="f50-card f50-wk"><span class="f50-k">SKRITT · SISTE 7 DAGER</span><div class="f50-bars">${week.map((d) => `<span title="${esc(`${d.day}: ${nf(d.steps)}`)}" style="height:${Math.max(6, ((d.steps ?? 0) / mx) * 100)}%;background:${d.today ? esc(c) : `color-mix(in oklab, ${esc(c)} 28%, var(--f-line))`}"></span>`).join('')}</div></div>`
      : H && !sh ? `<div class="f50-note">${esc(H.text ?? `${first(P.name)} deler ikke helse med deg`)}</div>` : !H && !P.self && P.healthShared === false ? `<div class="f50-note">${esc(`${first(P.name)} deler ikke helse med deg`)}</div>` : ''}
    ${P.status === 'off' ? `<div class="f50-note">${esc(P.self ? 'Du deler ikke posisjon. Slå på under Folk → Min deling.' : `${first(P.name)} deler ikke posisjon med deg nå.`)}</div>` : ''}`;
  return `<div class="f50-mapfull f50-pv"><div class="f50-mapslot" data-f50-map="person"></div>${top}<div class="f50-sheet tall"><span class="f50-grab" aria-hidden="true"></span><div class="f50-sheet-in">${body}</div></div></div>`;
}

/* ---------------- 4 · Steder ---------------- */
function placeCard(z) {
  const multi = (z.areas?.length ?? 0) > 1;
  return `<div class="f50-card f50-zc" data-f50="sted" data-id="${esc(z.id)}" role="button" tabindex="0">
    <div class="f50-zh"><span class="f50-zi" style="background:${esc(placeCol(z))}">${svg(placeIc(z), 22)}</span><span class="f50-grow f50-rt"><b class="big">${esc(z.name)}</b><span>${esc(z.hereText ?? '')}${multi ? ` · ${esc(z.areaText ?? `${z.areas.length} områder`)}` : ''}${z.mine === false ? ` · delt av ${esc(first(personBy(z.createdBy)?.name ?? 'familien'))}` : ''}</span></span>
      <span class="f50-who">${(z.here ?? []).slice(0, 4).map((w) => av(w, 30, 'ring')).join('')}</span></div>
    ${multi ? `<div class="f50-chips">${z.areas.map((a) => `<span class="f50-achip">${esc(a.name)}<i>${esc(rTxt(a.radius_m))}</i></span>`).join('')}</div>` : ''}
    <div class="f50-zn">${svg(IC.bell, 15)}<span class="f50-grow">${esc(z.notifyText ?? 'Ingen varsler')}</span><button type="button" class="f50-red" data-f50="sted" data-id="${esc(z.id)}" data-sec="varsler">Endre</button></div>
  </div>`;
}
function stederList() {
  const D = F.d.places;
  if (!D) return head('Steder', 'Få beskjed når noen kommer eller drar') + loading('places');
  const L = D.places ?? [];
  return `${head('Steder', 'Få beskjed når noen kommer eller drar', homeBtn())}<div class="f50-col">${L.map(placeCard).join('')}
    ${L.length ? '' : '<div class="f50-card f50-empty">Ingen steder ennå. Legg til Hjem, Skole eller Jobb, så får du beskjed når noen kommer eller drar.</div>'}
    ${btn('data-f50="nysted"', '+ Nytt sted', 'f50-dash')}</div>`;
}

/* ---------------- 4b · Sted med flere områder ---------------- */
function placeById(id) { return (F.d.places?.places ?? []).find((z) => String(z.id) === String(id)); }
function draftFor(v) {
  if (F.draft && F.draft.key === `${v.id}`) return F.draft;
  if (v.id === 'ny') {
    const t = TYPES.some(([k]) => k === v.type) ? v.type : 'annet';
    const nm = { hjem: 'Hjem', skole: 'Skole', jobb: 'Jobb' }[t] ?? '';
    F.draft = { key: 'ny', id: null, name: nm, type: t, color: { hjem: '#b23a2a', skole: '#a8661a', jobb: '#2b5d8a' }[t] ?? '#2f6b45', shared: true, icon: TYPE_IC[t], areas: [], mine: true, dirty: false };
    if (!F.pick) F.pick = true;
    return F.draft;
  }
  const z = placeById(v.id);
  if (!z) return null;
  F.draft = { key: `${v.id}`, id: z.id, name: z.name, type: z.type ?? 'annet', color: placeCol(z), shared: !!z.shared, icon: z.icon, icp: z.icp, mine: z.canEdit ?? z.mine !== false,
    areas: (z.areas ?? []).map((a) => ({ ...a })), del: [], dirty: false, notify: z.notify ?? {}, usedByText: z.usedByText, notifyText: z.notifyText, createdBy: z.createdBy };
  return F.draft;
}
function stedView() {
  const v = F.v;
  if (!F.d.places) return `<div class="f50-sted">${F.two ? '' : `<div class="f50-mtop static">${backBtn('Steder', 'f50-pill sh')}</div>`}${loading('places')}</div>`;
  const D = draftFor(v);
  if (!D) return `<div class="f50-sted"><div class="f50-mtop static">${backBtn('Steder', 'f50-pill sh')}</div><div class="f50-card f50-empty">Fant ikke stedet. Det kan være slettet eller ikke delt med deg.</div></div>`;
  const ed = D.mine, n = D.areas.length, c = D.color;
  const rows = D.areas.map((a, i) => `<div class="f50-arow"><span class="f50-adot" style="--c:${esc(c)}"></span>${ed ? `<input class="f50-ain" value="${esc(a.name)}" data-f50in="aname" data-i="${i}" aria-label="Navn på området" maxlength="60">` : `<b class="f50-grow">${esc(a.name)}</b>`}
      ${ed ? btn(`data-f50="aradius" data-i="${i}" aria-expanded="${F.editR === i}"`, esc(rTxt(a.radius_m)), 'f50-rpill') : `<span class="f50-rpill">${esc(rTxt(a.radius_m))}</span>`}
      ${ed ? btn(`data-f50="arm" data-i="${i}" aria-label="Fjern ${esc(a.name)}"${n < 2 ? ' disabled title="Det siste området kan ikke fjernes. Slett heller stedet."' : ''}`, '✕', 'f50-ax') : ''}</div>
    ${ed && F.editR === i ? `<div class="f50-rrow"><input type="range" min="25" max="1000" step="5" value="${a.radius_m}" data-f50in="aradius" data-i="${i}" aria-label="Radius" style="accent-color:${esc(c)}"><input type="number" min="25" max="1000" step="5" value="${a.radius_m}" data-f50in="aradiusn" data-i="${i}" aria-label="Radius i meter"><span>m</span></div>` : ''}`).join('');
  const add = F.addArea ? `<div class="f50-card f50-addf"><b>Nytt område</b><input class="f50-in" id="f50-aname" value="${esc(F.addArea.name)}" data-f50in="newname" placeholder="Navn, f.eks. Idrettshallen" maxlength="60" autocomplete="off">
      <div class="f50-rrow"><input type="range" min="25" max="1000" step="5" value="${F.addArea.radius_m}" data-f50in="newr" aria-label="Radius" style="accent-color:${esc(c)}"><b data-f50-newr>${esc(rTxt(F.addArea.radius_m))}</b></div>
      <div class="f50-two">${btn('data-f50="addx"', 'Avbryt', 'f50-btn')}${btn('data-f50="addok"', 'Legg til område', 'f50-btn ink')}</div></div>`
    : ed ? btn('data-f50="addarea" aria-pressed="' + F.pick + '"', F.pick ? 'Trykk på kartet der området skal være · Avbryt' : '+ Legg til område på kartet', `f50-dash sm${F.pick ? ' on' : ''}`) : '';
  const others = ppl().filter((p) => !p.self);
  const notify = others.length ? `${lab('VARSLER', 'sm')}<div class="f50-list" id="f50-varsler">${others.map((p) => { const x = D.notify?.[p.userId] ?? {}; return `<div class="f50-row">${av(p, 28, 'sm')}<b class="f50-grow">${esc(p.name)}</b>${btn(`data-f50="notify" data-u="${esc(p.userId)}" data-k="enter" aria-pressed="${!!x.enter}"`, 'Kommer', 'f50-chip')}${btn(`data-f50="notify" data-u="${esc(p.userId)}" data-k="leave" aria-pressed="${!!x.leave}"`, 'Drar', 'f50-chip')}</div>`; }).join('')}</div>` : '';
  const descr = n ? `${n === 1 ? 'Ett sted med ett område.' : `Ett sted med ${n} områder.`} Er du i ${n === 1 ? 'det' : 'ett av dem'}, er du på ${D.name || 'stedet'}.` : 'Trykk på kartet for å legge til det første området.';
  return `<div class="f50-sted"><div class="f50-smap"><div class="f50-mapslot" data-f50-map="sted"></div>
      <div class="f50-mtop">${F.two ? '<span></span>' : backBtn('Steder', 'f50-pill sh')}${ed ? btn(`data-f50="save"${F.busy.save ? ' disabled' : ''}`, F.busy.save ? 'Lagrer …' : 'Lagre', 'f50-pill ink') : ''}</div>
      ${F.pick ? '<div class="f50-hint">Trykk på kartet der området skal være</div>' : ''}</div>
    <div class="f50-shead">${ed ? `<input class="f50-tin" value="${esc(D.name)}" data-f50in="pname" placeholder="Navn på stedet" maxlength="60" aria-label="Navn på stedet">` : `<b class="f50-tin">${esc(D.name)}</b>`}<span class="f50-mut">${esc(descr)}</span></div>
    ${n ? `<div class="f50-list f50-alist">${rows}</div>` : ''}${add}
    ${lab('TYPE', 'sm')}<div class="f50-seg f50-types">${TYPES.map(([k, t]) => `<button type="button" aria-pressed="${D.type === k}" data-f50="ptype" data-v="${k}"${ed ? '' : ' disabled'}>${t}</button>`).join('')}</div>
    ${ed ? `${lab('FARGE', 'sm')}<div class="f50-cols">${COLORS.map((x) => `<button type="button" class="f50-colb" style="background:${x}" aria-pressed="${x === c}" aria-label="Farge ${x}" data-f50="pcolor" data-v="${x}"></button>`).join('')}</div>
      <button type="button" class="f50-swrow" role="switch" aria-checked="${D.shared}" data-f50="pshare"><span class="f50-grow">Del med familien</span><i class="f50-sw${D.shared ? ' on' : ''}"></i></button>` : ''}
    ${D.usedByText || D.notifyText ? `<div class="f50-note">${esc([D.usedByText, D.notifyText].filter(Boolean).join('. '))}.</div>` : ''}
    ${D.id ? notify : ''}
    ${ed && D.id ? btn('data-f50="pdel"', 'Slett stedet', 'f50-btn f50-danger') : ''}
  </div>`;
}

/* ---------------- 5 · Helse ---------------- */
function healthCard(h) {
  const on = !!h.shared, c = colOf(h), T = h.today ?? {}, W = Array.isArray(h.week) ? h.week : [];
  const mx = Math.max(1, ...W.map((d) => d.steps ?? 0), (T.goal ?? 0) * 1.0);
  const bars = (W.length ? W : Array.from({ length: 7 }, () => ({}))).map((d, k, a) => `<span style="height:${on && d.steps != null ? Math.max(8, (d.steps / mx) * 100) : 8}%;background:${on && (d.today || k === a.length - 1) ? esc(c) : `color-mix(in oklab, ${esc(c)} 30%, var(--f-line))`}"></span>`).join('');
  const mini = [['SØVN', T.sleepText], ['HVILEPULS', T.restingHr != null ? `${T.restingHr} bpm` : null], ['AKTIV', T.activeKcal != null ? `${nf(T.activeKcal)} kcal` : null]];
  return `<div class="f50-card f50-hc${on ? '' : ' off'}" ${on ? `data-f50="helsep" data-id="${esc(h.userId)}" role="button" tabindex="0"` : ''}>
    <div class="f50-hrow"><span class="f50-hl"><span class="f50-hn">${av(h, 26, 'sm')}<b>${esc(h.self ? 'Du' : h.name)}</b></span><b class="f50-hs">${on ? esc(T.stepsText ?? nf(T.steps)) : '—'}</b></span><span class="f50-hbars">${bars}</span>${on ? '<span class="f50-chev" aria-hidden="true">›</span>' : ''}</div>
    ${on ? `<div class="f50-mini">${mini.map(([k, v]) => `<span><i>${k}</i><b>${esc(v ?? '—')}</b></span>`).join('')}</div>`
      : `<span class="f50-off">${esc(h.short && h.short !== 'Ikke delt' ? h.short : 'Ikke delt')} · Deler ikke helse med deg${h.action ? ` · ${btn(`data-f50="hreq" data-id="${esc(h.userId)}"`, esc(h.action.label ?? 'Be om deling ›'), 'f50-inl')}` : ''}</span>`}
  </div>`;
}
function helseList() {
  const D = F.d.health;
  if (!D) return head('Helse', '') + loading('health');
  return `${head(D.title ?? 'Helse', '', homeBtn())}${D.summary ? `<div class="f50-summ">${esc(D.summary)}</div>` : ''}<div class="f50-col">${(D.people ?? []).map(healthCard).join('')}</div>
    <div class="f50-note">Apple Health og Health Connect leses av appen på telefonen. Bare det personen velger å dele vises her.</div>`;
}

/* ---------------- 5b · Helse for personen ---------------- */
function helsepView(id = F.v.id) {
  const h = F.hp[id] ?? (F.d.health?.people ?? []).find((x) => String(x.userId) === String(id));
  const top = `<div class="f50-topbar">${F.two ? '' : backBtn('Helse')}<span class="f50-grow"></span>${btn('data-f50="hpos"', 'Posisjon ›', 'f50-pill')}</div>`;
  if (!h) return `${top}${loading(`h:${id}`)}`;
  if (!h.shared) return `${top}<div class="f50-ph pad">${av(h, 52)}<span><b class="f50-pnm">${esc(h.name)}</b><span class="f50-mut">${esc(h.text ?? 'Deler ikke helse med deg')}</span></span></div>${h.action ? `<div class="f50-col">${btn(`data-f50="hreq" data-id="${esc(h.userId)}"`, esc(h.action.label ?? 'Be om deling ›'), 'f50-btn ink')}</div>` : ''}`;
  const T = h.today ?? {}, W = h.week ?? [], c = colOf(h), goal = T.goal ?? 10000;
  const mx = Math.max(goal * 1.3, ...W.map((d) => d.steps ?? 0)) || 1;
  const bars = W.map((d) => `<span style="height:${Math.max(4, ((d.steps ?? 0) / mx) * 100)}%;background:${d.today ? esc(c) : (d.steps ?? 0) >= goal ? `color-mix(in oklab, ${esc(c)} 45%, var(--f-card))` : `color-mix(in oklab, ${esc(c)} 22%, var(--f-card))`}" title="${esc(`${d.day}: ${nf(d.steps)}`)}"></span>`).join('');
  const stat = (k, v, s) => `<div class="f50-stat"><span class="f50-k">${esc(k)}</span><b>${esc(v ?? '—')}</b><span>${esc(s ?? '')}</span></div>`;
  return `${top}<div class="f50-ph pad">${av(h, 52)}<span><b class="f50-pnm">${esc(h.self ? `${h.name} (deg)` : h.name)}</b><span class="f50-mut">${esc(h.sourceText ?? 'I dag')}</span></span></div>
    <div class="f50-card f50-big">
      <div class="f50-bh"><span><span class="f50-k">SKRITT I DAG</span><b class="f50-huge">${esc(T.stepsText ?? nf(T.steps))}</b></span>${T.badge ? `<span class="f50-badge${T.goalReached ? ' ok' : ''}">${esc(T.badge)}</span>` : ''}</div>
      ${W.length ? `<div class="f50-gbars"><span class="f50-gline" style="bottom:${(goal / mx) * 100}%"></span><span class="f50-gtag" style="bottom:${(goal / mx) * 100}%">MÅL ${esc(T.goalText ?? nf(goal))}</span>${bars}</div>
      <div class="f50-days">${W.map((d) => `<span class="${d.today ? 'on' : ''}">${esc(String(d.day ?? '').replace(/^./, (x) => x.toUpperCase()))}</span>`).join('')}</div>` : ''}
      ${h.weekText ? `<span class="f50-mut">${esc(h.weekText)}</span>` : ''}
      ${h.self ? `<div class="f50-goal"><span class="f50-mut">Mitt skrittmål</span><input type="number" min="1000" max="100000" step="500" value="${goal}" data-f50in="goal" aria-label="Skrittmål"></div>` : ''}
    </div>
    <div class="f50-stats pad">${stat('SØVN I NATT', T.sleepText, T.sleepRange ?? '')}${stat('HVILEPULS', T.restingHr != null ? `${T.restingHr} bpm` : null, T.hr != null ? `Puls nå ${T.hr}` : '')}${stat('AKTIVE KALORIER', T.activeKcal != null ? `${nf(T.activeKcal)} kcal` : null, 'I dag')}${stat('BATTERI', T.battery != null ? `${Math.round(T.battery)} %` : null, T.battery == null ? '' : T.charging ? 'Lader' : 'Lader ikke')}</div>
    <div class="f50-shline"><span class="f50-grow">${esc(h.shareText ?? '')}</span>${btn('data-f50="deling2"', esc(h.shareAction?.label ?? 'Deling ›'), 'f50-inl b')}</div>`;
}

/* ---------------- 6 · Sjekk inn ---------------- */
function initCi(force = false) {
  const D = F.d.ci;
  if (!D || (F.ci && !force)) return;
  let to = [];
  try { to = JSON.parse(localStorage.getItem('f50_to') || '[]'); } catch { /* privat modus */ }
  const ids = new Set((D.people ?? []).map((p) => String(p.userId)));
  const prev = F.ci;
  F.ci = { sug: 0, quick: D.quick?.[0]?.id ?? 'arrived', custom: false, text: '', to: new Set((prev?.to ? [...prev.to] : to).filter((x) => ids.has(String(x)))), remind: prev?.remind ?? '', place: null, placeEdit: false, placeText: '', req: prev?.req ?? null, ...(prev && force ? { quick: prev.quick, custom: prev.custom, text: prev.text, place: prev.place } : {}) };
  const rq = F.v.req ? (D.requests ?? []).find((r) => String(r.id) === String(F.v.req)) : null;
  if (rq) { F.ci.req = rq.id; F.ci.to = new Set([String(rq.from?.userId)]); }
}
/** «Sjekk inn» fra varselet om en forespørsel (?req=<id>): svaret går til den som spurte. */
function applyReq(v) {
  if (v.v !== 'sjekk' || !v.req || !F.ci || F.ci.reqDone === v.req) return;
  const r = (F.d.ci?.requests ?? []).find((x) => String(x.id) === String(v.req)) ?? F.d[`c:${v.req}`];
  F.ci.reqDone = v.req; F.ci.req = v.req;
  if (r?.from?.userId) F.ci.to = new Set([String(r.from.userId)]);
}
const ciPlace = () => {
  const D = F.d.ci, C = F.ci;
  if (C?.place) return C.place;
  const s = (D?.suggestions ?? [])[C?.sug ?? 0] ?? D?.suggestion ?? null;
  return s;
};
function ciForm() {
  const D = F.d.ci;
  if (!D) return head('Sjekk inn', 'Si fra hvor du er og at alt er bra', homeBtn()) + loading('ci');
  initCi();
  const C = F.ci, s = ciPlace(), P = D.people ?? [];
  const src = s ? [s.source === 'calendar' ? 'Fra kalenderen' : s.source === 'place' ? 'Et av stedene dine' : s.source === 'custom' ? 'Skrevet selv' : 'Nær deg', s.detail, s.acc != null ? `± ${Math.round(s.acc)} m` : F.pos ? `± ${Math.round(F.pos.acc)} m` : null].filter(Boolean).join(' · ') : F.pos ? 'Posisjonen sendes med innsjekken' : 'Uten posisjon';
  const toL = P.filter((p) => C.to.has(String(p.userId))).map((p) => first(p.name));
  const req = C.req ? (D.requests ?? []).find((r) => String(r.id) === String(C.req)) : null;
  const reqs = (D.requests ?? []).filter((r) => r.pending !== false);
  const where = `<div class="f50-ciw"><span class="f50-zi plum">${svg(s?.source === 'calendar' ? IC.cal : IC.pin, 22)}</span><span class="f50-grow f50-rt"><b class="big">${esc(s?.title ?? s?.name ?? 'Hvor er du?')}</b><span>${esc(src)}</span></span>${btn('data-f50="cplace" aria-expanded="' + C.placeEdit + '"', C.placeEdit ? 'Ferdig' : 'Endre', 'f50-red')}</div>
    ${C.placeEdit ? `<div class="f50-chips">${(D.suggestions ?? []).map((x, i) => `<button type="button" class="f50-chip" aria-pressed="${!C.place && C.sug === i}" data-f50="csug" data-i="${i}">${esc(x.title)}</button>`).join('')}${(F.d.places?.places ?? []).slice(0, 6).map((z) => `<button type="button" class="f50-chip" aria-pressed="${C.place?.placeId === z.id}" data-f50="cplc" data-id="${esc(z.id)}">${esc(z.name)}</button>`).join('')}</div>
      <input class="f50-in" id="f50-cpt" value="${esc(C.placeText)}" data-f50in="cplace" placeholder="Skriv hvor du er, f.eks. Hos Mari" maxlength="80" autocomplete="off">` : ''}`;
  const quick = (D.quick ?? []).map((q) => `<button type="button" class="f50-qchip${q.priority === 'high' ? ' hi' : ''}" aria-pressed="${!C.custom && C.quick === q.id}" data-f50="cquick" data-v="${esc(q.id)}">${esc(q.text)}</button>`).join('') + `<button type="button" class="f50-qchip" aria-pressed="${C.custom}" data-f50="ccustom">Egen tekst</button>`;
  const send = !P.length ? 'Ingen i familien å sjekke inn til' : !toL.length ? 'Velg hvem som får beskjed' : req && !C.quick ? `Svar ${join(toL)}` : `${!C.custom && C.quick === 'pickup' ? 'Hent meg – send til' : req ? 'Svar' : 'Sjekk inn til'} ${join(toL)}`;
  return `${head(D.title ?? 'Sjekk inn', 'Si fra hvor du er og at alt er bra', homeBtn())}
    ${reqs.map((r) => `<div class="f50-card f50-reqc${String(r.id) === String(C.req) ? ' on' : ''}">${av(r.from, 34)}<span class="f50-grow f50-rt"><b>${esc(r.title ?? `${r.from?.name} ber deg sjekke inn`)}</b><span>${esc([r.text, r.time].filter(Boolean).join(' · '))}</span></span>${btn(`data-f50="rqok" data-id="${esc(r.id)}"`, '👍 Alt bra', 'f50-pill')}${btn(`data-f50="rqpick" data-id="${esc(r.id)}"`, String(r.id) === String(C.req) ? 'Valgt' : 'Svar', 'f50-pill ink')}</div>`).join('')}
    <div class="f50-card f50-ci">${where}
      <div class="f50-cis"><span class="f50-k">HVA VIL DU SI?</span><div class="f50-chips">${quick}</div>${C.custom ? `<textarea class="f50-in" id="f50-ctext" rows="2" maxlength="280" data-f50in="ctext" placeholder="Skriv en kort melding">${esc(C.text)}</textarea>` : ''}</div>
      <div class="f50-cis"><span class="f50-k">TIL</span><div class="f50-to">${P.map((p) => { const on = C.to.has(String(p.userId)); return `<button type="button" class="f50-toi${on ? ' on' : ''}" role="checkbox" aria-checked="${on}" data-f50="cto" data-id="${esc(p.userId)}"><span class="f50-tav">${av(p, 46)}${on ? '<i>✓</i>' : ''}</span><span>${esc(first(p.name))}</span></button>`; }).join('')}</div></div>
      <label class="f50-rem"><span class="f50-grow">Minn meg på å sjekke inn igjen</span><input type="time" value="${esc(C.remind)}" data-f50in="cremind" aria-label="Klokkeslett for påminnelse"><span class="f50-rpill">${C.remind ? `kl. ${esc(C.remind)}` : 'Av'}</span>${C.remind ? btn('data-f50="cremx" aria-label="Fjern påminnelse"', '✕', 'f50-ax') : ''}</label>
    </div>
    ${btn(`data-f50="csend"${toL.length && !F.busy.send ? '' : ' disabled'}`, F.busy.send ? 'Sender …' : esc(send), `f50-main${!C.custom && C.quick === 'pickup' ? ' red' : ''}`)}
    <div class="f50-two">${F.o.env === 'pwa' ? '<button type="button" class="f50-btn" data-p40="hjopen">På vei hjem</button>' : btn('data-f50="velfremme"', 'På vei hjem', 'f50-btn')}${btn('data-f50="creq"' + (F.busy.req ? ' disabled' : ''), 'Be noen sjekke inn', 'f50-btn')}</div>
    ${D.latest ? `${lab('DIN SISTE INNSJEKK', 'sm')}${sentCard(D.latest)}` : ''}
    ${lab(D.log?.title ?? 'I DAG I FAMILIEN', 'sm')}${todayRows(D.log?.items ?? [], 'Ingen innsjekker i dag ennå.')}`;
}
function sentCard(c) {
  if (!c) return '';
  if (c.mine) {
    const reqTo = c.kind === 'request';
    return `<div class="f50-dark"><div class="f50-dh"><span class="f50-ok">${reqTo ? '?' : '✓'}</span><b class="f50-grow">${esc(c.title)}</b><span class="f50-o7">${esc(c.seenText ?? '')}</span></div>
      ${c.text || c.place ? `<span class="f50-dmsg">${c.text ? `«${esc(c.text)}»` : ''}${c.place?.label || c.place?.name ? `${c.text ? ' · ' : ''}${esc(c.place.label ?? c.place.name)}` : ''}</span>` : ''}
      ${c.reminder && !c.reminder.done ? `<span class="f50-o7">${esc(c.reminder.text ?? `Påminnelse ${c.reminder.time}`)} · ${btn(`data-f50="remx" data-id="${esc(c.id)}"`, 'Fjern', 'f50-inl w')}</span>` : ''}
      ${(c.to ?? []).some((t) => t.reply) ? `<span class="f50-o7">${esc((c.to ?? []).filter((t) => t.reply).map((t) => `${first(t.name)}: ${t.replyText ?? t.reply}`).join(' · '))}</span>` : ''}
      ${reqTo ? '' : `<div class="f50-two">${btn(`data-f50="pickup" data-id="${esc(c.id)}"${F.busy.pick ? ' disabled' : ''}`, 'Hent meg', 'f50-btn wh')}${btn('data-f50="again"', 'Sjekk inn igjen', 'f50-btn ol')}</div>`}</div>`;
  }
  const isReq = c.kind === 'request', mineTo = (c.to ?? []).find((t) => t.self), pos = c.position;
  return `<div class="f50-dark${c.priority === 'high' ? ' hi' : ''}"><div class="f50-dh">${av(c.from, 28, 'sm')}<b class="f50-grow">${esc(c.title)}</b><span class="f50-o7">${esc(c.time ?? '')}</span></div>
    ${c.text || c.place ? `<span class="f50-dmsg">${c.text ? `«${esc(c.text)}»` : ''}${c.place?.label ? `${c.text ? ' · ' : ''}${esc(c.place.label)}` : ''}</span>` : ''}
    ${pos ? `<span class="f50-o7"><a href="${esc(isApple() ? pos.appleUrl : pos.googleUrl)}" target="_blank" rel="noopener">Vis posisjonen${pos.acc ? ` (± ${Math.round(pos.acc)} m)` : ''} ›</a></span>` : ''}
    ${mineTo?.reply ? `<span class="f50-o7">Du svarte ${esc(mineTo.replyText ?? mineTo.reply)}</span>` : ''}
    ${isReq ? `<div class="f50-two">${btn(`data-f50="reply" data-id="${esc(c.id)}" data-v="ok"`, '👍 Alt bra', 'f50-btn wh')}${btn(`data-f50="rqpick" data-id="${esc(c.id)}"`, 'Sjekk inn', 'f50-btn ol')}</div>`
      : `<div class="f50-three">${btn(`data-f50="reply" data-id="${esc(c.id)}" data-v="ok"`, '👍', 'f50-btn wh')}${btn(`data-f50="reply" data-id="${esc(c.id)}" data-v="call"`, 'Ring', 'f50-btn ol')}${btn(`data-f50="reply" data-id="${esc(c.id)}" data-v="pickup"`, 'Hent', 'f50-btn ol')}</div>`}</div>`;
}
function sendtView() {
  const id = F.v.id, c = F.d[`c:${id}`] ?? (String(F.d.ci?.latest?.id) === String(id) ? F.d.ci.latest : null);
  const D = F.d.ci;
  return `${head('Sjekk inn', '', F.two ? '' : backBtn('Sjekk inn'))}${c ? sentCard(c) : loading(`c:${id}`)}
    ${lab(D?.log?.title ?? 'I DAG I FAMILIEN', 'sm')}${D ? todayRows(D.log?.items ?? [], 'Ingen innsjekker i dag ennå.') : loading('ci')}`;
}
function velView() {
  // Web: dagens Vel fremme-tur (hjemlys41.js) – PWA-en åpner sitt eget Vel fremme-ark (data-p40="hjopen").
  const html = F.o.velfremme?.(F.d.fam, () => paint());
  return `${head('På vei hjem', 'Si fra når du drar, med ETA og varsel hvis du er sen', F.two ? '' : backBtn('Sjekk inn'))}${html ?? (F.d.fam ? '<div class="f50-card f50-empty">Vel fremme er ikke tilgjengelig her.</div>' : loading('fam'))}`;
}

/* ---------------- Side og to kolonner ---------------- */
const TABS = [['folk', 'Folk'], ['steder', 'Steder'], ['helse', 'Helse'], ['sjekk', 'Sjekk inn']];
const tabBar = () => `<nav class="f50-tabs" aria-label="Familie">${TABS.map(([k, n]) => `<a href="${esc(href(k === 'folk' ? '' : k))}" class="${F.v.tab === k ? 'on' : ''}" aria-current="${F.v.tab === k ? 'page' : 'false'}" data-f50="tab" data-v="${k}">${n}</a>`).join('')}</nav>`;
function listFor(tab) { return tab === 'steder' ? stederList() : tab === 'helse' ? helseList() : tab === 'sjekk' ? ciForm() : folkList(); }
function oneCol() {
  const v = F.v.v;
  if (v === 'kart') return { html: kartView(), full: true };
  if (v === 'person') return { html: personView(), full: true };
  if (v === 'sted') return { html: stedView(), full: true, noTabs: true };
  if (v === 'helsep') return { html: helsepView() };
  if (v === 'sendt') return { html: sendtView() };
  if (v === 'vel') return { html: velView() };
  if (v === 'steder') return { html: stederList() };
  if (v === 'helse') return { html: helseList() };
  if (v === 'sjekk') return { html: ciForm() };
  return { html: folkList() };
}
function rightCol() {
  const v = F.v.v;
  if (v === 'person') return personView();
  if (v === 'sted') return stedView();
  if (v === 'helsep') return `<div class="f50-rs">${helsepView()}</div>`;
  if (v === 'sendt') return `<div class="f50-rs">${sendtView()}</div>`;
  if (v === 'vel') return `<div class="f50-rs">${velView()}</div>`;
  if (F.v.tab === 'helse') { const h = (F.d.health?.people ?? []).find((x) => x.shared && !x.self) ?? (F.d.health?.people ?? []).find((x) => x.shared); if (h) loadHp(h.userId).then(() => { if (F.v.v === 'helse') paint(); }); return h ? `<div class="f50-rs">${helsepView(h.userId)}</div>` : kartView(); }
  if (F.v.tab === 'sjekk') { const D = F.d.ci; return `<div class="f50-rs">${D?.latest ? `${head('Siste innsjekk', '')}${sentCard(D.latest)}` : head('I dag i familien', '')}${D ? todayRows(D.log?.items ?? [], 'Ingen innsjekker i dag ennå.') : ''}</div>`; }
  return kartView();
}
/** Høyre kolonne viser «kart» når ingenting er valgt; på Helse og Sjekk inn noe nyttig fra fanen. */
function body() {
  F.two = isTwo();
  if (F.two) {
    const left = listFor(F.v.tab);
    const right = rightCol();
    return `<div class="f50-two-col"><section class="f50-left" data-f50-scroll="l:${esc(F.v.tab)}">${left}<div class="f50-tabpad"></div>${tabBar()}</section><section class="f50-right">${right}</section></div>`;
  }
  const r = oneCol();
  return `<section class="f50-one${r.full ? ' full' : ''}" data-f50-scroll="o:${esc(F.sub ?? '')}">${r.html}${r.full ? '' : '<div class="f50-tabpad"></div>'}</section>${r.full || r.noTabs ? '' : tabBar()}`;
}

/* ---------------- Tegning ---------------- */
function saveScroll() {
  F.root?.querySelectorAll('[data-f50-scroll]').forEach((el) => { F.scroll[el.dataset.f50Scroll] = el.scrollTop; });
  F.root?.querySelectorAll('[data-f50-sheet] .f50-sheet-in').forEach((el) => { F.scroll.sheet = el.scrollTop; });
}
function restoreScroll() {
  F.root?.querySelectorAll('[data-f50-scroll]').forEach((el) => { const y = F.scroll[el.dataset.f50Scroll]; if (y) el.scrollTop = y; });
}
let paintQ = 0;
export function paint() {
  const R = F.root;
  if (!R) return;
  if (paintQ) return;
  paintQ = requestAnimationFrame(() => { paintQ = 0; paintNow(); });
}
function paintNow() {
  const R = F.root;
  if (!R || !R.isConnected) return;
  const ae = document.activeElement, keep = ae && R.contains(ae) && ae.id ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  saveScroll();
  for (const k of Object.keys(MAPS)) MAPS[k].el.remove();
  R.classList.toggle('f50-dark-ui', !!F.o.dark?.());
  R.classList.toggle('two', isTwo());
  R.dataset.v = F.v.v;
  R.innerHTML = body() + (F.toast ? `<div class="f50-toast" role="status">${esc(F.toast)}</div>` : '');
  restoreScroll();
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch { /* time/number */ } } }
  mountMaps();
  if (F.scrollTo) { const id = F.scrollTo; F.scrollTo = null; setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250); }
}

/* ---------------- Kart (Leaflet) ---------------- */
const MAPS = {};
let LL = null, llP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve((LL = window.L));
  if (!document.querySelector('link[data-leaflet]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/api/family/vendor/leaflet.css'; l.dataset.leaflet = '1'; document.head.appendChild(l); }
  return (llP ??= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/api/family/vendor/leaflet.js';
    s.onload = () => res((LL = window.L)); s.onerror = () => { llP = null; rej(new Error('Kunne ikke laste kartet')); };
    document.head.appendChild(s);
  }));
}
function mountMaps() {
  const slots = F.root?.querySelectorAll('[data-f50-map]');
  if (!slots?.length) return;
  if (!LL) { loadLeaflet().then(() => mountMaps()).catch(() => slots.forEach((s) => { s.innerHTML = '<div class="f50-mapx">Kartet kunne ikke lastes</div>'; })); return; }
  slots.forEach((slot) => {
    const k = slot.dataset.f50Map;
    const M = MAPS[k] ?? (MAPS[k] = makeMap(k));
    slot.appendChild(M.el);
    M.map.invalidateSize();
    try { drawMap(k, M); } catch (e) { console.warn('family50 kart', e); }
  });
}
function makeMap(k) {
  const el = document.createElement('div');
  el.className = `f50-lmap f50-lmap-${k}`;
  const still = k === 'strip';
  const map = LL.map(el, { zoomControl: false, attributionControl: !still, dragging: !still, scrollWheelZoom: !still, doubleClickZoom: !still, touchZoom: !still, boxZoom: false, keyboard: !still }).setView([59.9139, 10.7522], 12);
  const dark = !!F.o.dark?.();
  LL.tileLayer('/tiles/topo/{z}/{x}/{y}.png', { maxZoom: 18, detectRetina: true, attribution: '© <a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a>' }).addTo(map);
  if (!still && k !== 'person' && !matchMedia('(pointer: coarse)').matches) LL.control.zoom({ position: 'topright' }).addTo(map);
  const pane = map.getPane('tilePane'); if (pane) pane.style.filter = dark ? 'invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.6)' : 'sepia(.25) saturate(.8)';
  const M = { el, map, g: LL.layerGroup().addTo(map), fitted: '', k, sz: '' };
  // Størrelsen endres når CSS-en lastes, kolonnene byttes eller arket dras: tilpass kartet og tilpass utsnittet på nytt første gang.
  try {
    new ResizeObserver(() => {
      if (!el.isConnected || !el.clientWidth) return;
      const sz = `${el.clientWidth}x${el.clientHeight}`;
      if (sz === M.sz) return;
      const firstReal = !M.sz || M.sz.startsWith('0x');
      M.sz = sz; map.invalidateSize();
      if (firstReal) { M.fitted = ''; try { drawMap(k, M); } catch { /* */ } } else if (M.edges) edgeLabels(M);
    }).observe(el);
  } catch { /* eldre nettleser */ }
  if (k === 'big') {
    M.edges = document.createElement('div'); M.edges.className = 'f50-edges'; el.appendChild(M.edges);
    map.on('moveend zoomend resize', () => edgeLabels(M));
  }
  if (k === 'sted') map.on('click', (e) => { if (F.pick && F.draft?.mine) { F.pick = false; F.addArea = { lat: e.latlng.lat, lng: e.latlng.lng, name: '', radius_m: 100 }; paint(); setTimeout(() => document.getElementById('f50-aname')?.focus(), 60); } });
  return M;
}
const pinIcon = (p, size, ring = 3) => LL.divIcon({ className: 'f50-pinw', html: `<span class="f50-pin" style="--s:${size}px;--b:${ring}px;--pc:${esc(colOf(p))}">${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" onerror="this.remove()">` : ''}<em>${esc(iniOf(p))}</em></span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const located = () => ppl().filter((p) => p.lat != null && p.lon != null);
function drawMap(k, M) {
  const g = M.g; g.clearLayers();
  const map = M.map;
  if (k === 'strip' || k === 'big') {
    if (k === 'big') for (const z of F.d.places?.places ?? []) for (const a of z.areas ?? [{ lat: z.lat, lon: z.lon, radius_m: z.radius }]) LL.circle([a.lat, a.lon], { radius: a.radius_m, color: placeCol(z), weight: 1.5, fillColor: placeCol(z), fillOpacity: 0.1, interactive: false }).addTo(g);
    const L = located();
    for (const p of L) {
      const mk = LL.marker([p.lat, p.lon], { icon: pinIcon(p, k === 'strip' ? 26 : 38, k === 'strip' ? 2 : 3), title: p.name, keyboard: k !== 'strip', interactive: k !== 'strip', zIndexOffset: p.self ? 0 : 100 }).addTo(g);
      if (k === 'big') mk.on('click', () => openPerson(p.userId, 'kart'));
    }
    const sig = L.map((p) => `${p.userId}`).join(',');
    if (M.fitted !== sig) {
      M.fitted = sig;
      const pts = L.map((p) => [p.lat, p.lon]);
      if (pts.length > 1) map.fitBounds(pts, { padding: k === 'strip' ? [18, 18] : [50, 50], maxZoom: 14, ...(k === 'big' && !F.two ? { paddingBottomRight: [50, 300] } : {}) });
      else if (pts.length) map.setView(pts[0], 14);
      else if (k === 'big' && F.d.places?.places?.length) { const z = F.d.places.places[0]; map.setView([z.lat, z.lon], 13); }
    }
    if (k === 'big') edgeLabels(M);
    return;
  }
  if (k === 'person') {
    const P = F.pp[F.v.id] ?? personBy(F.v.id);
    if (!P || P.lat == null) { M.fitted = ''; return; }
    if (P.acc) LL.circle([P.lat, P.lon], { radius: Math.max(10, P.acc), color: colOf(P), weight: 1.5, opacity: 0.5, fillColor: colOf(P), fillOpacity: 0.16, interactive: false }).addTo(g);
    LL.marker([P.lat, P.lon], { icon: pinIcon(P, 44), interactive: false }).addTo(g);
    const sig = `${P.userId}`;
    if (M.fitted !== sig) {
      M.fitted = sig;
      const z = P.acc > 600 ? 13 : 15;
      map.setView([P.lat, P.lon], z, { animate: false });
      if (!F.two) { const h = M.el.clientHeight; map.panBy([0, h * 0.28], { animate: false }); }
    }
    return;
  }
  if (k === 'sted') {
    const D = F.draft, c = D?.color ?? '#a8661a';
    const A = D?.areas ?? [];
    A.forEach((a, i) => {
      LL.circle([a.lat, a.lon], { radius: a.radius_m, color: c, weight: 2, fillColor: c, fillOpacity: 0.2, interactive: false }).addTo(g);
      LL.marker([a.lat, a.lon], { interactive: !!D?.mine, draggable: !!D?.mine, icon: LL.divIcon({ className: 'f50-alabw', html: `<span class="f50-alab">${esc(a.name || `Område ${i + 1}`)}</span>`, iconSize: [0, 0] }) }).addTo(g)
        .on('dragend', (e) => { const ll = e.target.getLatLng(); a.lat = +ll.lat.toFixed(6); a.lon = +ll.lng.toFixed(6); a.dirty = true; D.dirty = true; drawMap('sted', M); });
    });
    if (F.addArea) LL.circle([F.addArea.lat, F.addArea.lng], { radius: F.addArea.radius_m, color: c, weight: 2, dashArray: '6 6', fillColor: c, fillOpacity: 0.15, interactive: false }).addTo(g);
    M.el.classList.toggle('picking', !!F.pick);
    const sig = `${D?.key}:${A.length}`;
    if (M.fitted !== sig && !F.addArea) {
      M.fitted = sig;
      if (A.length) map.fitBounds(A.map((a) => LL.latLng(a.lat, a.lon).toBounds(a.radius_m * 2.4)).reduce((b, x) => b.extend(x)), { padding: [30, 30], maxZoom: 17 });
      else { const m0 = me(); if (m0?.lat != null) map.setView([m0.lat, m0.lon], 15); else if (F.d.places?.places?.[0]) map.setView([F.d.places.places[0].lat, F.d.places.places[0].lon], 14); }
    }
  }
}
const ARROW = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
/** Personer utenfor utsnittet: merkelapp i kartkanten, «Kari · 7,4 km sør ↓». Trykk sentrerer på personen. */
function edgeLabels(M) {
  if (!M.edges) return;
  const map = M.map, sz = map.getSize(), b = map.getBounds(), padB = !F.two && F.v.v === 'kart' ? (M.el.closest('.f50-mapfull')?.querySelector('[data-f50-sheet]')?.offsetHeight ?? 0) + 12 : 12;
  // Utenfor = utenfor kartet eller skjult under arket.
  const out = located().filter((p) => { if (p.self) return false; if (!b.contains([p.lat, p.lon])) return true; const q = map.latLngToContainerPoint([p.lat, p.lon]); return q.y > sz.y - padB + 10; });
  M.edges.innerHTML = out.slice(0, 6).map((p) => {
    const pt = map.latLngToContainerPoint([p.lat, p.lon]), cx = sz.x / 2, cy = (sz.y - padB) / 2;
    const ang = (Math.atan2(pt.x - cx, cy - pt.y) * 180) / Math.PI, ar = ARROW[Math.round(((ang + 360) % 360) / 45) % 8];
    const x = Math.min(sz.x - 90, Math.max(90, pt.x)), y = Math.min(sz.y - padB - 22, Math.max(70, pt.y));
    const label = p.fromMe?.label ?? p.name;
    return `<button type="button" class="f50-edge" style="left:${x}px;top:${y}px" data-f50="center" data-id="${esc(p.userId)}">${av(p, 24, 'sm')}${esc(label)} ${ar}</button>`;
  }).join('');
}

/* ---------------- Handlinger ---------------- */
function openPerson(id, from) { go(`person/${encodeURIComponent(id)}${from && from !== 'folk' ? `/${from}` : ''}`); }
async function savePref(patch) {
  try { const r = await api('/family/me', { method: 'PUT', json: patch }); if (F.d.fam) F.d.fam.me = r?.me ?? { ...F.d.fam.me, ...patch }; }
  catch (e) { toast(errMsg(e)); }
  loadPeople(true).then(paint); paint();
}
const remindIso = (t) => { if (!/^\d{2}:\d{2}$/.test(t)) return null; const [h, mi] = t.split(':').map(Number), d = new Date(); d.setHours(h, mi, 0, 0); if (d.getTime() < Date.now() + 60_000) d.setDate(d.getDate() + 1); return d.toISOString(); };
async function sendCheckin() {
  const C = F.ci, D = F.d.ci;
  if (!C || !C.to.size || F.busy.send) return;
  const s = ciPlace();
  const body = { to: [...C.to] };
  if (C.custom) { if (!C.text.trim()) { toast('Skriv en melding først'); return; } body.text = C.text.trim(); } else { body.quick = C.quick; const qt = (D?.quick ?? []).find((q) => q.id === C.quick)?.text; if (qt) body.text = qt; } // teksten er tilpasset hendelsen («Er på bursdag hos Mari, alt bra»)
  if (s) body.place = s.source === 'custom' ? { name: s.title } : { name: s.title ?? s.name, detail: s.detail ?? undefined };
  if (s?.source === 'calendar') body.eventTitle = s.title;
  if (F.pos) Object.assign(body, { lat: F.pos.lat, lon: F.pos.lon, acc: Math.round(F.pos.acc ?? 0) });
  const rem = remindIso(C.remind); if (rem) body.remindAt = rem;
  if (C.req) body.requestId = C.req;
  F.busy.send = true; paint();
  try {
    const r = await api('/family/checkin', { method: 'POST', json: body });
    try { localStorage.setItem('f50_to', JSON.stringify([...C.to])); } catch { /* privat modus */ }
    F.busy.send = false; C.req = null;
    const c = r?.checkin;
    if (c) { F.d[`c:${c.id}`] = c; if (D) D.latest = c; }
    toast(r?.delivered === 0 ? 'Sendt · mottakerne har ikke varsler på ennå' : body.quick === 'pickup' ? 'Hent meg er sendt' : 'Innsjekken er sendt');
    loadCi(true).then(paint); loadToday(true);
    if (c) go(`sjekk/${c.id}`); else paint();
  } catch (e) { F.busy.send = false; toast(errMsg(e)); paint(); }
}
async function reqCheckin() {
  const C = F.ci;
  if (!C?.to.size) { toast('Velg hvem du vil be om innsjekk under TIL'); return; }
  F.busy.req = true; paint();
  try { const r = await api('/family/checkin/request', { method: 'POST', json: { to: [...C.to] } }); toast(`Ba ${join((F.d.ci?.people ?? []).filter((p) => C.to.has(String(p.userId))).map((p) => first(p.name)))} sjekke inn${r?.delivered === 0 ? ' · ingen varsler levert' : ''}`); loadCi(true).then(paint); }
  catch (e) { toast(errMsg(e)); }
  F.busy.req = false; paint();
}
async function reply(id, v) {
  try {
    const pos = v === 'pickup' || v === 'ok' ? F.pos : null;
    const r = await api(`/family/checkin/${encodeURIComponent(id)}/reply`, { method: 'POST', json: { reply: v, ...(pos ? { lat: pos.lat, lon: pos.lon } : {}) } });
    if (r?.checkin) F.d[`c:${r.checkin.id}`] = r.checkin;
    if (v === 'call') { const ph = r?.call?.phone; if (ph) location.href = `tel:${String(ph).replace(/[^\d+]/g, '')}`; else toast(`${r?.call?.name ?? 'De'} har ikke lagt inn telefonnummer`); }
    else toast(v === 'pickup' ? 'Sendt: du kommer og henter' : 'Sendt 👍');
    loadCi(true).then(paint); paint();
  } catch (e) { toast(errMsg(e)); }
}
async function savePlace() {
  const D = F.draft;
  if (!D || F.busy.save) return;
  if (!D.name.trim()) { toast('Gi stedet et navn'); return; }
  if (!D.areas.length) { toast('Legg til minst ett område på kartet'); return; }
  F.busy.save = true; paint();
  try {
    if (!D.id) {
      const r = await api('/family/places', { method: 'POST', json: { name: D.name.trim(), type: D.type, color: D.color, icon: D.icon ?? TYPE_IC[D.type], shared: D.shared, areas: D.areas.map((a) => ({ name: a.name || D.name, lat: a.lat, lon: a.lon, radius_m: a.radius_m })) } });
      toast(`«${r?.name ?? D.name}» er lagret`);
    } else {
      const id = D.id;
      await api(`/family/places/${id}`, { method: 'PATCH', json: { name: D.name.trim(), type: D.type, color: D.color, shared: D.shared, ...(D.iconChanged ? { icon: D.icon } : {}) } });
      for (const a of D.areas) {
        if (a.id == null) await api(`/family/places/${id}/areas`, { method: 'POST', json: { name: a.name || D.name, lat: a.lat, lon: a.lon, radius_m: a.radius_m } });
        else if (a.dirty) await api(`/family/places/${id}/areas/${a.id}`, { method: 'PATCH', json: { name: a.name || D.name, lat: a.lat, lon: a.lon, radius_m: a.radius_m } });
      }
      for (const aid of D.del ?? []) await api(`/family/places/${id}/areas/${aid}`, { method: 'DELETE' });
      toast('Lagret');
    }
    F.busy.save = false; F.draft = null; F.pick = false; F.addArea = null;
    await loadPlaces(true);
    back();
  } catch (e) { F.busy.save = false; toast(e.data?.code === 'last_area' || e.code === 'last_area' ? e.message : errMsg(e)); await loadPlaces(true); F.draft = null; paint(); }
}

async function onClick(e) {
  const t = e.target.closest?.('[data-f50]');
  if (F.plus && !e.target.closest?.('.f50-plusw')) { F.plus = false; if (!t) paint(); }
  if (!t || !F.root?.contains(t) || t.disabled) return;
  const a = t.dataset.f50, id = t.dataset.id;
  if (a === 'tab') { e.preventDefault(); const k = t.dataset.v; go(k === 'folk' ? '' : k); return; }
  e.preventDefault();
  switch (a) {
    case 'home': home(); return;
    case 'back': if (F.v.v === 'sted' && F.draft?.dirty && !confirm('Forkaste endringene på stedet?')) return; back(); return;
    case 'plus': F.plus = !F.plus; paint(); return;
    case 'nysted': F.plus = false; go('steder/ny/annet'); return;
    case 'invite': F.plus = false; F.o.settings?.('familie'); return;
    case 'kart': go('kart'); return;
    case 'person': openPerson(id, F.v.v === 'kart' || (F.two && F.v.tab === 'folk' && t.closest('.f50-right')) ? 'kart' : 'folk'); return;
    case 'center': { const p = personBy(id), M = MAPS.big; if (p && M) M.map.setView([p.lat, p.lon], Math.max(M.map.getZoom(), 13)); return; }
    case 'findme': { const m0 = me(), M = MAPS.big; if (!M) return; if (m0?.lat != null) M.map.setView([m0.lat, m0.lon], 14); else { M.fitted = ''; drawMap('big', M); toast('Du deler ikke posisjon – viser hele familien'); } return; }
    case 'nophone': toast('Ingen telefonnummer lagret. Det legges inn under Vel fremme.'); return;
    case 'nopos': toast('Posisjonen er ikke kjent'); return;
    case 'deling': F.deling = !F.deling; if (F.deling) loadFam().then(paint); paint(); return;
    case 'deling2': if (F.o.settings) F.o.settings('familie'); else { go(''); F.deling = true; loadFam().then(paint); } return;
    case 'pref': return savePref({ [t.dataset.k]: t.dataset.v });
    case 'hshare': { const cur = F.d.fam?.me?.shareHealth ?? {}; return savePref({ shareHealth: { [t.dataset.k]: !cur[t.dataset.k] } }); }
    case 'sted': if (t.dataset.sec) F.scrollTo = 'f50-varsler'; go(`steder/${id}`); return;
    case 'addarea': if (F.addArea) return; F.pick = !F.pick; paint(); return;
    case 'addx': F.addArea = null; paint(); return;
    case 'addok': {
      const A = F.addArea, D = F.draft; if (!A || !D) return;
      D.areas.push({ id: null, name: A.name.trim() || (D.areas.length ? `Område ${D.areas.length + 1}` : D.name || 'Område'), lat: +A.lat.toFixed(6), lon: +A.lng.toFixed(6), radius_m: A.radius_m });
      D.dirty = true; F.addArea = null; if (MAPS.sted) MAPS.sted.fitted = ''; paint(); return;
    }
    case 'aradius': { const i = +t.dataset.i; F.editR = F.editR === i ? null : i; paint(); return; }
    case 'arm': {
      const D = F.draft, i = +t.dataset.i; if (!D || D.areas.length < 2) { toast('Det siste området kan ikke fjernes. Slett heller stedet.'); return; }
      const [x] = D.areas.splice(i, 1); if (x?.id != null) (D.del ??= []).push(x.id); D.dirty = true; F.editR = null; if (MAPS.sted) MAPS.sted.fitted = ''; paint(); return;
    }
    case 'ptype': { const D = F.draft; if (!D) return; const was = D.type; D.type = t.dataset.v; if (!D.icon || D.icon === TYPE_IC[was]) { D.icon = TYPE_IC[D.type]; D.iconChanged = true; } D.dirty = true; paint(); return; }
    case 'pcolor': if (F.draft) { F.draft.color = t.dataset.v; F.draft.dirty = true; paint(); } return;
    case 'pshare': if (F.draft) { F.draft.shared = !F.draft.shared; F.draft.dirty = true; paint(); } return;
    case 'save': return savePlace();
    case 'pdel': {
      const D = F.draft; if (!D?.id || !confirm(`Slette stedet «${D.name}» med alle områdene?`)) return;
      try { await api(`/family/places/${D.id}`, { method: 'DELETE' }); toast(`«${D.name}» er slettet`); F.draft = null; await loadPlaces(true); go('steder'); } catch (er) { toast(errMsg(er)); }
      return;
    }
    case 'notify': {
      const D = F.draft; if (!D?.id) return;
      const u = t.dataset.u, n = { ...(D.notify?.[u] ?? {}) }; n[t.dataset.k] = !n[t.dataset.k];
      D.notify = { ...(D.notify ?? {}), [u]: n }; paint();
      try { const r = await api(`/family/zones/${D.id}/notify`, { method: 'PUT', json: { userId: u, enter: !!n.enter, leave: !!n.leave } }); if (r?.notify) D.notify = r.notify; loadPlaces(true).then(() => { const z = placeById(D.id); if (z && F.draft) { F.draft.notifyText = z.notifyText; } paint(); }); }
      catch (er) { toast(errMsg(er)); }
      return;
    }
    case 'helsep': go(`helse/${encodeURIComponent(id)}`); return;
    case 'hpos': openPerson(F.v.id, F.v.v === 'helsep' ? `helse/${encodeURIComponent(F.v.id)}` : 'helse'); return;
    case 'hreq': {
      try { const r = await api(`/family/health50/${encodeURIComponent(id)}/request`, { method: 'POST', json: {} }); toast(r?.text ?? (r?.throttled ? 'Du har nettopp spurt – prøv igjen om en time' : 'Forespørselen er sendt')); }
      catch (er) { toast(errMsg(er)); }
      return;
    }
    case 'ci': go(`sjekk/${encodeURIComponent(id)}`); return;
    case 'cplace': F.ci.placeEdit = !F.ci.placeEdit; if (F.ci.placeEdit) loadPlaces().then(paint); paint(); if (F.ci.placeEdit) setTimeout(() => document.getElementById('f50-cpt')?.focus(), 50); return;
    case 'csug': F.ci.sug = +t.dataset.i; F.ci.place = null; F.ci.placeText = ''; paint(); return;
    case 'cplc': { const z = placeById(id); if (z) { F.ci.place = { source: 'place', title: z.name, placeId: z.id }; F.ci.placeText = ''; } paint(); return; }
    case 'cquick': F.ci.quick = t.dataset.v; F.ci.custom = false; paint(); return;
    case 'ccustom': F.ci.custom = true; paint(); setTimeout(() => document.getElementById('f50-ctext')?.focus(), 50); return;
    case 'cto': { const s = F.ci.to, k = String(id); if (s.has(k)) s.delete(k); else s.add(k); paint(); return; }
    case 'cremx': F.ci.remind = ''; paint(); return;
    case 'csend': return sendCheckin();
    case 'creq': return reqCheckin();
    case 'velfremme': go('hjem'); return;
    case 'rqok': return reply(id, 'ok');
    case 'rqpick': {
      const r = (F.d.ci?.requests ?? []).find((x) => String(x.id) === String(id)) ?? F.d[`c:${id}`];
      if (F.v.v !== 'sjekk') { go('sjekk'); }
      initCi(); F.ci.req = id; if (r?.from?.userId) F.ci.to = new Set([String(r.from.userId)]); paint(); return;
    }
    case 'reply': return reply(id, t.dataset.v);
    case 'again': go('sjekk'); return;
    case 'pickup': {
      F.busy.pick = true; paint();
      askPos(async (pos) => {
        try { const r = await api(`/family/checkin/${encodeURIComponent(id)}/pickup`, { method: 'POST', json: pos ? { lat: pos.lat, lon: pos.lon, acc: Math.round(pos.acc ?? 0) } : {} }); toast('Hent meg er sendt med posisjonen din'); if (r?.checkin) { F.d[`c:${r.checkin.id}`] = r.checkin; loadCi(true).then(paint); go(`sjekk/${r.checkin.id}`); } }
        catch (er) { toast(errMsg(er)); }
        F.busy.pick = false; paint();
      });
      return;
    }
    case 'remx': try { const r = await api(`/family/checkin/${encodeURIComponent(id)}/reminder`, { method: 'DELETE' }); if (r?.checkin) F.d[`c:${id}`] = r.checkin; if (F.d.ci?.latest && String(F.d.ci.latest.id) === String(id)) F.d.ci.latest = r?.checkin ?? F.d.ci.latest; toast('Påminnelsen er fjernet'); paint(); } catch (er) { toast(errMsg(er)); } return;
    default:
  }
}
let goalT = 0;
function onInput(e) {
  const t = e.target, k = t.dataset?.f50in;
  if (!k || !F.root?.contains(t)) return;
  const D = F.draft, i = +t.dataset.i;
  switch (k) {
    case 'pname': if (D) { D.name = t.value; D.dirty = true; } return;
    case 'aname': if (D?.areas[i]) { D.areas[i].name = t.value; D.areas[i].dirty = true; D.dirty = true; } return;
    case 'aradius': case 'aradiusn': {
      if (!D?.areas[i]) return; const r = Math.max(25, Math.min(1000, Math.round(+t.value || 0)));
      if (k === 'aradiusn' && (+t.value < 25 || +t.value > 1000)) return;
      D.areas[i].radius_m = r; D.areas[i].dirty = true; D.dirty = true;
      const row = t.closest('.f50-rrow'); row?.querySelectorAll('input').forEach((x) => { if (x !== t) x.value = r; });
      const pill = row?.previousElementSibling?.querySelector('.f50-rpill'); if (pill) pill.textContent = rTxt(r);
      if (MAPS.sted) drawMap('sted', MAPS.sted); return;
    }
    case 'newname': if (F.addArea) F.addArea.name = t.value; return;
    case 'newr': if (F.addArea) { F.addArea.radius_m = +t.value; const b = F.root.querySelector('[data-f50-newr]'); if (b) b.textContent = rTxt(+t.value); if (MAPS.sted) drawMap('sted', MAPS.sted); } return;
    case 'ctext': if (F.ci) F.ci.text = t.value; return;
    case 'cplace': if (F.ci) { F.ci.placeText = t.value; F.ci.place = t.value.trim() ? { source: 'custom', title: t.value.trim() } : null; } return;
    case 'cremind': if (F.ci) { F.ci.remind = t.value; const p = t.parentElement?.querySelector('.f50-rpill'); if (p) p.textContent = t.value ? `kl. ${t.value}` : 'Av'; } return;
    case 'goal': clearTimeout(goalT); goalT = setTimeout(async () => { const v = Math.round(+t.value); if (!(v >= 1000 && v <= 100000)) return; try { await api('/family/health50/goal', { method: 'PUT', json: { steps: v } }); await Promise.all([loadHealth(true), loadHp(F.v.id, true)]); paint(); } catch (er) { toast(errMsg(er)); } }, 700); return;
    default:
  }
}
function onChange(e) { if (e.target?.dataset?.f50in === 'cremind' || e.target?.dataset?.f50in === 'aradiusn') paint(); }
function onKey(e) {
  if (e.key === 'Enter' && e.target?.dataset?.f50in === 'newname') { e.preventDefault(); F.root.querySelector('[data-f50="addok"]')?.click(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('[role="button"][data-f50]')) { e.preventDefault(); e.target.click(); }
}
/** Arket på Kart: dra i håndtaket for å bytte mellom lavt og høyt. */
function onDown(e) {
  const g = e.target.closest?.('[data-f50-grab]');
  if (!g) return;
  const sh = g.closest('[data-f50-sheet]'), y0 = e.clientY, h0 = sh.offsetHeight;
  sh.classList.add('drag');
  const mv = (ev) => { sh.style.height = `${Math.max(120, Math.min(innerHeight * 0.85, h0 + (y0 - ev.clientY)))}px`; };
  const up = (ev) => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    sh.classList.remove('drag'); const dy = y0 - ev.clientY;
    F.sheet = Math.abs(dy) < 6 ? (F.sheet === 'low' ? 'mid' : 'low') : dy > 0 ? (F.sheet === 'low' ? 'mid' : 'high') : (F.sheet === 'high' ? 'mid' : 'low');
    sh.style.height = ''; sh.className = `f50-sheet ${F.sheet}`;
    setTimeout(() => { if (MAPS.big) edgeLabels(MAPS.big); }, 260);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

/* ---------------- Sanntid ---------------- */
let liveT = 0;
/** WebSocket-meldinger (type 'family'): steder, innsjekker, posisjoner og hendelser. */
export function live50(msg) {
  if (!msg || (msg.type && msg.type !== 'family')) return;
  const kind = msg.kind;
  if (kind === 'ping') return;
  clearTimeout(liveT);
  liveT = setTimeout(async () => {
    if (!F.root?.isConnected) { F.at = {}; return; }
    const jobs = [];
    if (kind === 'places') jobs.push(loadPlaces(true));
    else if (kind === 'checkin') { jobs.push(loadCi(true), loadToday(true)); if (F.v.v === 'sendt') jobs.push(loadCheckin(F.v.id)); }
    else {
      jobs.push(loadPeople(true), loadToday(true));
      if (F.v.v === 'person') jobs.push(loadPerson(F.v.id, true));
      if (F.v.tab === 'helse' && kind !== 'event') jobs.push(loadHealth(true));
      if (F.v.tab === 'sjekk' && kind !== 'event') jobs.push(loadCi(true));
      if (F.v.tab === 'steder' && kind !== 'event') jobs.push(loadPlaces(true));
    }
    await Promise.all(jobs);
    if (kind === 'places' && F.draft && !F.draft.dirty) F.draft = null;
    paint();
  }, 400);
}

/* ---------------- Montering ---------------- */
function ensureCss() {
  if (!document.querySelector('link[data-f50css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/family50.css'; l.dataset.f50css = '1'; document.head.appendChild(l); }
  if (!document.querySelector('link[data-f50fonts], link[data-hl-fonts], link[href*="Newsreader"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.f50fonts = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap';
    document.head.appendChild(l);
  }
}
let rz = 0, wasTwo = null;
/**
 * Legger Familie inn i plassholderen. opts: {env:'web'|'pwa', base:'#/familie'|'#/fam', sub, api?, dark?(), home?(), settings?(tab),
 * velfremme?(famData, repaint) → html, ownHash?, wide?}. Kalles på nytt ved hver tegning hos verten; rot-elementet beholdes.
 */
export function mount50(slot, opts = {}) {
  ensureCss();
  Object.assign(F.o, opts);
  if (!F.root) {
    F.root = document.createElement('div');
    F.root.className = 'f50';
    F.root.addEventListener('click', onClick);
    F.root.addEventListener('input', onInput);
    F.root.addEventListener('change', onChange);
    F.root.addEventListener('keydown', onKey);
    F.root.addEventListener('pointerdown', onDown);
    F.root.addEventListener('scroll', (e) => { const k = e.target?.dataset?.f50Scroll; if (k) F.scroll[k] = e.target.scrollTop; }, true); // verten kan flytte rota (PWA tegner på nytt)
    document.addEventListener('click', (e) => { if (F.plus && F.root?.isConnected && !F.root.contains(e.target)) { F.plus = false; paint(); } });
    addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!F.root?.isConnected) return; const t = isTwo(); if (t !== wasTwo) { wasTwo = t; paintNow(); } else for (const k of Object.keys(MAPS)) MAPS[k].map.invalidateSize(); }, 120); });
    addEventListener('hashchange', () => { if (!F.o.ownHash || !F.root?.isConnected) return; const h = location.hash; if (h === F.o.base || h.startsWith(`${F.o.base}/`) || h.startsWith(`${F.o.base}?`)) setSub(h.slice(F.o.base.length).replace(/^\//, '')); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && F.root?.isConnected) live50({ type: 'family', kind: 'refresh' }); });
  }
  F.root.classList.toggle('pwa', F.o.env === 'pwa');
  F.root.classList.toggle('web', F.o.env !== 'pwa');
  if (slot && slot !== F.root) { slot.replaceWith(F.root); restoreScroll(); }
  wasTwo = isTwo();
  clearInterval(F.pollT);
  F.pollT = setInterval(() => { if (!F.root?.isConnected) { clearInterval(F.pollT); return; } if (!document.hidden && !F.draft?.dirty) live50({ type: 'family', kind: 'poll' }); }, 45_000);
  const sub = opts.sub ?? F.sub ?? '';
  if (sub !== F.sub || !F.root.childElementCount) { F.sub = null; setSub(sub); }
  else { paintNow(); }
}
/** Web: undersider (#/familie/…) håndteres her uten at hele ruten tegnes på nytt. */
export const ownsHash50 = () => !!F.root?.isConnected && !!F.o.ownHash;
export const state50 = F;
