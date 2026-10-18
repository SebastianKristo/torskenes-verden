// Prompt 20 (mobil-PWA): Posisjon · Familie på Hjem (/api/family/positions, reserve /api/family), kartfliser via
// /tiles (/api/config/map, reserve CARTO), fargede Finans-fliser som kan flyttes (hold inne ~0,45 s), og logoer fra
// logoregisteret (/finans/api/logos/registry). Alt tåler en eldre server: et endepunkt som svarer 404 gir reserven.
import { esc, hlApi, logo as coreLogo } from './core.js';
import { m, draw } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { FM, famLoad } from './mobile-p16.js';
import { FT } from './mobile-p17.js';
import { dragStart } from './mobile-p21.js';

const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- Posisjon · Familie (kort h6 på Hjem) ---------- */

export const PS = { d: null, legacy: false, t: 0, err: '' };
const PAL = ['#b23a2a', '#2f5d8a', '#2f7a4f', '#a86a10', '#6b4fa3', '#c94f86', '#2a8a8a', '#4b55b0'];
const hash = (s) => [...String(s ?? '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const colorOf = (id) => PAL[hash(id) % PAL.length];
const ini2 = (s) => { const w = String(s ?? '').replace(/[^A-Za-zÆØÅæøåÜüÖöÄä\s-]/g, '').trim(); const c = w.slice(0, 2); return c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : '•'; };
const hm = (ts) => new Date(ts).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const STALE = 15 * 60000;
const ACT = { walking: 'Går', running: 'Løper', cycling: 'Sykler', driving: 'I bil', 'går': 'Går', sykler: 'Sykler', 'i bil': 'I bil' };
const bad = (s) => !s || /^ukjent( sted)?$/i.test(String(s).trim());

/** Henter kortet: /api/family/positions, ellers /api/family (eldre server). Kalles når Hjem lastes. */
export async function posLoad(force = false) {
  if (!force && Date.now() - PS.t < 20000 && PS.d) return;
  PS.t = Date.now();
  if (!PS.legacy) {
    try { const r = await hlApi('/family/positions'); PS.d = onePer((Array.isArray(r) ? r : r?.items ?? r?.positions ?? []).map(fromApi)); PS.err = ''; return; }
    catch (e) { if (e.status !== 404) { PS.err = e.message; if (PS.d) return; } else PS.legacy = true; }
  }
  await famLoad().catch(() => {});
  PS.d = FM.d ? fromFamily(FM.d) : null;
  PS.err = FM.err || PS.err;
}
// Prompt 24: én avatar per person (eldre server kan sende én post per enhet). Den ferskeste vinner.
const RANK = { fresh: 0, stale: 1, off: 2 };
function onePer(list) { const by = new Map(); for (const p of list) { const k = String(p.id); const o = by.get(k); if (!o || RANK[p.status] < RANK[o.status]) by.set(k, p); } return [...by.values()]; }
function fromApi(p) {
  const st = ['fresh', 'stale', 'off'].includes(p.status) ? p.status : 'off';
  const name = p.self ? 'Du' : String(p.navn ?? p.name ?? '').split(' ')[0];
  return { id: p.id, self: !!p.self, name, color: p.farge || p.color || colorOf(p.id), img: p.bilde || null, status: st, ini: p.self ? 'Du' : (p.initialer || ini2(name)), line2: !bad(p.linje2) ? p.linje2 : line2(p.sone, p.aktivitet, p.sted, p.oppdatert, st) };
}
function line2(sone, akt, sted, ts, status) {
  if (status === 'off') return ts ? `Sist sett ${hm(ts)}` : 'Deler ikke posisjon';
  if (!bad(sone)) return sone;
  const a = ACT[String(akt ?? '').toLowerCase()];
  if (a && !bad(sted)) return `${a} · ${sted}`;
  if (!bad(sted)) return sted;
  return a || (ts ? `${status === 'fresh' ? 'Oppdatert' : 'Sist sett'} ${hm(ts)}` : 'Deler ikke posisjon');
}
const dist = (a, b, c, d) => { const R = 6371e3, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r, h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
/** Reserve: lager samme rader fra /api/family (sone fra Familie → Soner, «Du» først og bare én gang). */
function fromFamily(d) {
  const me = d.me?.userId, seen = new Set(), rows = [];
  const mem = [...(d.members ?? [])].sort((a, b) => (b.self || b.userId === me) - (a.self || a.userId === me));
  for (const p of mem) {
    const self = !!p.self || (me != null && p.userId === me);
    const key = self ? '__self' : String(p.userId);
    if (seen.has(key) || seen.has(String(p.userId))) continue;
    seen.add(key); seen.add(String(p.userId));
    const l0 = p.last, on = p.sharing === 'on' && l0 && l0.lat != null;
    const fresh = on && Date.now() - new Date(l0.ts) < STALE;
    const z = on ? (d.zones ?? []).find((zz) => dist(l0.lat, l0.lon, zz.lat, zz.lon) <= (zz.radius ?? 0)) : null;
    const status = !on ? 'off' : fresh ? 'fresh' : 'stale';
    const name = self ? 'Du' : String(p.name || p.username || '').split(' ')[0];
    const moving = l0 && ['walking', 'running', 'cycling', 'driving'].includes(l0.activity) ? l0.activity : null;
    rows.push({ id: p.userId, self, name, color: p.color || p.farge || colorOf(p.userId), img: p.avatarUrl || null, status, ini: self ? 'Du' : ini2(name),
      line2: line2(z?.name, moving, l0?.place, on ? l0.ts : null, status) });
  }
  return rows;
}
export function posCard() {
  const rows = PS.d;
  const head = '<div class="pp-row"><span class="pp-lab">POSISJON · FAMILIE</span><span class="p20-kart">kart ›</span></div>';
  if (!rows) return `<a class="pp-card p17-pw p20-pw" href="#/fam" data-p20="pos">${head}<span class="pp-mut">${PS.err ? esc(PS.err) : 'Laster familien …'}</span></a>`;
  const show = rows.length > 4 ? rows.slice(0, 3) : rows, more = rows.length - show.length;
  const cell = (p) => `<span class="p20-pp"><span class="p20-av" style="background:${esc(p.color)}">${p.img ? `<img src="${esc(p.img)}" alt="">` : esc(p.ini)}<i class="${p.status}" aria-label="${p.status === 'fresh' ? 'Delt nå' : p.status === 'stale' ? 'Eldre enn 15 min' : 'Deler ikke'}"></i></span><span class="p20-rt"><b>${esc(p.name)}</b><small>${esc(p.line2)}</small></span></span>`;
  return `<a class="pp-card p17-pw p20-pw" href="#/fam" data-p20="pos">${head}
    <div class="p20-ppl">${show.map(cell).join('')}${more > 0 ? `<span class="p20-pp"><span class="p20-av more">+${more}</span><span class="p20-rt"><b>Flere</b><small>Åpne Familie</small></span></span>` : ''}</div>${rows.some((p) => !p.self && p.status !== 'off') ? '' : '<span class="pp-mut p21-pe">Ingen deler posisjon med deg ennå</span>'}</a>`;
}

/* ---------- Kartfliser: /tiles via /api/config/map ---------- */

const ERR_TILE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#d9d6cf"/></svg>')}`;
// Prompt 21: standard er Kartverket topo (gratis, uten nøkkel) via serverens /tiles. Mørkt tema = topo med
// mørkt CSS-filter (darkFilter), Papir = paperFilter. Eldre server uten /api/config/map: Kartverket direkte.
const KV_TOPO = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
const DARK_F = 'invert(.92) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.6)';
let mapCfg;
async function mapConfig() {
  if (mapCfg) return mapCfg;
  try { const r = await fetch('/api/config/map', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j?.tiles) return (mapCfg = j); } } catch {}
  return (mapCfg = { fallback: true, tiles: { topo: KV_TOPO }, attribution: '© Kartverket', default: 'topo', dark: 'topo', paper: 'topo', darkFilter: DARK_F, paperFilter: 'sepia(.25) saturate(.8)', maxZoom: 18 });
}
/** mode: 'dark' (mørkt tema), 'paper' (lyst Papir) eller 'default'. Bytter laget og filteret når temaet endres. */
export async function setTiles(Lf, map, el, mode) {
  const c = await mapConfig();
  const want = mode === 'dark' ? c.dark ?? c.default : mode === 'paper' || mode === 'light' ? c.paper ?? c.default : c.default;
  const st = c.tiles[want] ? want : c.tiles[c.default] ? c.default : Object.keys(c.tiles)[0], url = c.tiles[st];
  // Filter: et eget mørkt kartlag (f.eks. CARTO dark) trenger ikke filter; topo i mørkt tema gjør det.
  const darkStyle = /dark/i.test(st);
  const f = mode === 'dark' ? (darkStyle ? '' : c.darkFilter || DARK_F) : mode === 'paper' || mode === 'light' ? c.paperFilter || '' : '';
  if (el) { el.classList.toggle('p21-tf', !!f); el.style.setProperty('--p21-tf', f || 'none'); el.classList.remove('p20-sepia'); }
  if (map._p20 && map._p20.key === url) return;
  map._p20?.layer.remove();
  const err = mode === 'dark' && c.errorTileUrlDark ? c.errorTileUrlDark : c.errorTileUrl || ERR_TILE;
  const layer = Lf.tileLayer(url, { maxZoom: c.maxZooms?.[st] ?? c.maxZoom ?? 19, subdomains: 'abcd', crossOrigin: true, detectRetina: !c.fallback, errorTileUrl: err, attribution: c.attributions?.[st] || c.attribution || '© Kartverket' }).addTo(map);
  map._p20 = { key: url, layer };
}

/* ---------- Finans-flisene: farger og egen rekkefølge (papir_fm_order) ---------- */

export const FCOL = { hl: '#3d4652', budsjett: '#c0562a', kv: '#b23a2a', fast: '#7a5ad6', konto: '#2b5d8a', aks: '#2f7d4f', rap: '#a8661a', sub: '#c2417a', dir: '#3f7a6e', imp: '#4a5bbf', finn: '#2b6cb0', sok: '#7a3b6b', set: '#6b6558', liste: '#5b6470' };
const OKEY = 'papir_fm_order';
export const FO = { edit: false, order: Array.isArray(ls.get(OKEY)) ? ls.get(OKEY) : null };
/** Fra /api/me/layout (fmOrder), hvis serveren har lagret den. */
export function take20(r) { if (Array.isArray(r?.fmOrder) && r.fmOrder.length) { FO.order = r.fmOrder.map(String); ls.set(OKEY, FO.order); } }
export function fmSort(T) {
  const o = FO.live ?? FO.order ?? [], ix = (k) => { const i = o.indexOf(k); return i < 0 ? 1e3 : i; };
  return T.map((t, i) => [t, i]).sort((a, b) => ix(a[0][0]) - ix(b[0][0]) || a[1] - b[1]).map(([t]) => t);
}
// Redigeringslinja (prompt 21): egen Papir-pille med kortbakgrunn og skygge, lesbar over toppbildet i lyst og mørkt.
export const fmBar = () => (FO.edit ? '<div class="p21-fmbar" role="toolbar" aria-label="Flytt flisene"><span class="m-grow">Dra for å flytte</span><button class="p21-fmr" data-p20="fmreset">Tilbakestill</button><button class="p21-fmd" data-p20="fmdone">Ferdig</button></div>' : '');
function fmSave(order) {
  FO.order = order; ls.set(OKEY, order);
  hlApi('/me/layout', { method: 'PUT', json: { fmOrder: order } }).catch(() => {}); // eldre server: bare lokalt
}
const fmDrop = (vis) => {
  // Faner som ligger i fanelinja er skjult her; de beholder plassen sin bakerst i rekkefølgen.
  const rest = (FO.order ?? []).filter((k) => !vis.includes(k));
  fmSave([...vis, ...rest]); draw();
};
const fmDrag = (e, el) => dragStart(e, el, { sel: '.pp-fmt[data-fmk]', attr: 'data-fmk', drop: fmDrop });

// Hold inne 500 ms på en flis: redigering, og draget starter med en gang (som på iOS). Flytter fingeren seg mer
// enn 8 px før det, er det scrolling. Klikket etter et langt trykk åpner ikke siden.
let lp = null, lpFired = false;
export function p20Down(e) {
  lpFired = false;
  if ((e.button ?? 0) > 0) return;
  const t = e.target.closest?.('.pp-fmt[data-fmk]');
  if (!t) return;
  if (FO.edit) return fmDrag(e, t);
  const k = t.dataset.fmk, ev = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
    lp = null; lpFired = true; FO.edit = true; haptic('ok'); navigator.vibrate?.(15); draw();
    const n = document.querySelector(`.pp-fmt[data-fmk="${k}"]`);
    if (n) fmDrag(ev, n);
  }, 500) };
}
export function p20Move(e) {
  if (lp && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) { clearTimeout(lp.t); lp = null; }
}
export function p20Up() { if (lp) clearTimeout(lp.t); lp = null; }
/** Klikk: Ferdig, Tilbakestill, Posisjon-kortet (åpner Familie → Kart). Mens flisene redigeres, åpner de ingenting. */
export function p20Click(e, t) {
  if (lpFired && t.closest?.('.pp-fmt')) { lpFired = false; e.preventDefault(); return true; }
  const x = t.closest?.('[data-p20]');
  if (x?.dataset.p20 === 'fmdone') { e.preventDefault(); FO.edit = false; haptic('ok'); draw(); return true; }
  if (x?.dataset.p20 === 'fmreset') { e.preventDefault(); FO.order = null; ls.set(OKEY, null); hlApi('/me/layout', { method: 'PUT', json: { fmOrder: [] } }).catch(() => {}); haptic('tap'); draw(); return true; }
  if (x?.dataset.p20 === 'pos') { FT.tab = 'kart'; return false; }
  if (FO.edit && t.closest?.('.pp-fmt')) { e.preventDefault(); return true; }
  if (FO.edit && !t.closest?.('[data-p20]') && t.closest?.('.pp-fmgrid')) { e.preventDefault(); return true; }
  return false;
}
/** Når man går fra Mer, avsluttes redigeringen. */
export function p20Screen(scr) { if (scr !== 'fmer' && FO.edit) FO.edit = false; }

/* ---------- Logoer fra registeret ---------- */

const RKEY = 'fh_logoreg';
export const LR = { items: null, by: null, t: 0 };
const norm = (s) => String(s ?? '').toLowerCase().replace(/ü/g, 'u').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(vipps\*|vipps |klarna\*|klarna |iz \*|izettle\*|sumup \*|sumup\*|zettle_\*|paypal \*|nets\*|dnb\*|varekjøp |varekjop |kortkjop |kortkjøp )+/g, '')
  .replace(/\*+/g, ' ').replace(/\b\d+\b/g, ' ').replace(/[^a-z0-9.&+ ]/g, ' ').replace(/\s+/g, ' ').trim();
function index(items) {
  const by = new Map(), dom = new Map();
  for (const it of items) {
    if (it.domene) dom.set(String(it.domene).toLowerCase().replace(/^www\./, ''), it);
    for (const n of [it.navn, it.id, ...(it.alias ?? [])]) { const k = norm(n); if (k && !by.has(k)) by.set(k, it); }
  }
  LR.by = by; LR.dom = dom;
  LR.keys = [...by.keys()].filter((k) => k.length >= 3).sort((a, b) => b.length - a.length);
}
(() => { const c = ls.get(RKEY); if (Array.isArray(c?.items)) { LR.items = c.items; index(c.items); } })();
/** Henter registeret (ETag, If-None-Match) og lagrer det lokalt. Høyst hver sjette time. */
export async function regLoad() {
  if (Date.now() - LR.t < 6 * 3600000) return;
  LR.t = Date.now();
  const c = ls.get(RKEY);
  try {
    const r = await fetch('/finans/api/logos/registry', { headers: c?.etag ? { 'If-None-Match': c.etag } : {} });
    if (r.status === 304 || !r.ok) return;
    const j = await r.json(), items = Array.isArray(j) ? j : j?.items;
    if (!Array.isArray(items)) return;
    LR.items = items; index(items); ls.set(RKEY, { etag: r.headers.get('etag'), version: j.version, items });
    draw();
  } catch {}
}
/** Finner butikken i registeret: domene, eksakt navn/alias, så prefiks (ord for ord). */
export function regMatch(t) {
  if (!LR.by) return null;
  if (t?.domain) { const d = LR.dom.get(String(t.domain).toLowerCase().replace(/^www\./, '')); if (d) return d; }
  const q = norm(t?.merchant || t?.description || t?.name);
  if (!q) return null;
  if (LR.by.has(q)) return LR.by.get(q);
  for (const k of LR.keys) if (q.startsWith(k + ' ')) return LR.by.get(k);
  return null;
}
const fileUrl = (it) => `/finans/api/logos/file/${encodeURIComponent(it.id)}`;
/** Som core.logo(), men med logo og farge fra registeret. Mangler filen (404), vises bokstaven. */
export function logo(t, size = 40, radius = 12) {
  const it = regMatch(t);
  if (!it) return coreLogo(t, size, radius);
  const c = t?.color && t.color !== '#A0A0AA' ? t.color : it.farge || t?.color;
  if (it.hasFile === false) return coreLogo({ ...t, domain: t?.domain || it.domene || null, color: c }, size, radius);
  const name = t?.description ?? t?.merchant ?? t?.name ?? it.navn;
  return `<span class="m-logo" style="width:${size}px;height:${size}px;border-radius:${radius}px;flex:none"><img src="${fileUrl(it)}" alt="" loading="lazy" width="${size - 8}" height="${size - 8}"><i style="color:${esc(c || '#A0A0AA')}">${esc(String(name).replace(/[^A-Za-zÆØÅæøå0-9]/g, '').charAt(0).toUpperCase() || '•')}</i></span>`;
}
/** Papir-radene (.pp-ti): bokstav i butikkens farge, med logo over når registeret har en fil. */
export function ppTi(t, letter, color) {
  const it = regMatch(t), bg = it?.farge || color || '#6b665c';
  const src = it ? (it.hasFile !== false ? fileUrl(it) : it.domene ? `/finans/api/logo/${encodeURIComponent(it.domene)}` : null) : t?.domain ? `/finans/api/logo/${encodeURIComponent(t.domain)}` : null;
  return `<span class="pp-ti${src ? ' p20-lg' : ''}" style="background:${esc(color && color !== '#6b665c' && !it ? color : bg)}">${esc(letter)}${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</span>`;
}
// En logo som ikke finnes (404) eller er et tomt bilde: vis bokstaven under.
document.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('p20-lg')) { img.parentNode.classList.remove('p20-lg'); img.remove(); } }, true);
document.addEventListener('load', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('p20-lg') && img.naturalWidth <= 16) { img.parentNode.classList.remove('p20-lg'); img.remove(); } }, true);
