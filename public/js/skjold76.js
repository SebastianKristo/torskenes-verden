// Prompt 76 (SKJWEB): Skjold Lab på web/PWA – personlig sorteringssystem for deler i skuffeskap.
// - Søk øverst med forslag mens man skriver (/api/skjold/suggest), treffliste med bilde, navn, specs, antall og plassering.
// - Detaljside: stort bilde, plassering («Hovedskap · Rad 4 · Skuff 2»), antall ±, Flytt / Endre / Slett (angre).
// - Tegning av skapet (skjold76-draw.js) med valgt skuff uthevet; trykk på en skuff viser innholdet. Har skapet bilde med
//   4 hjørner, kan man bytte til «Bilde» og se uthevingen lagt over bildet i perspektiv (matrix3d).
// - Ny/endre del og skap-oppsett ligger i skjold76-edit.js. Etiketter: /api/skjold/labels?cabinet=<id> (utskriftsside).
// - Offline: siste fulle liste caches i localStorage (sk76_cache, tømmes ved kontobytte), så søk virker uten nett.
//   Endringer krever nett og sier tydelig fra.
// Adresser: #/skjold · #/skjold/del/<id> · #/skjold/ny · #/skjold/skap/<id>[/<rad>-<skuff>] · #/skjold/oppsett[/<id>]
import { api, esc, isMobile, haptic } from './util.js';
import { toast } from './toast.js';
import { drawCabinet76, overlayGrid76, layoutPhoto76, cornersOk76, long76, short76, ownLabel76 } from './skjold76-draw.js';
import { editHtml, setupHtml, editClick, setupClick, editMount, setupMount, editInput, setupInput, startEdit, startSetup } from './skjold76-edit.js';
import { headBtns77, gearHtml77, click77, key77, tidyHtml77, tidyRoute77, startTidy77, stopTidy77 } from './skjold77-ai.js'; // prompt 77: Glimt-forslag, Rydd opp, ⚙
import { locateBtn78, listBtn78, listAllBtn78, litBarHtml78, afterPart78, onCabs78, click78, input78, submit78, route78 } from './skjold78-leds.js'; // prompt 78: LED over skuffene
import { pickBtn79, pickShellHtml79, click79, key79, route79, loadPick79 } from './skjold79-pick.js'; // prompt 79: plukkliste

if (typeof document !== 'undefined' && !document.querySelector('link[data-sk76-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/skjold76.css'; l.dataset.sk76Css = ''; document.head.appendChild(l);
}

export const S = {
  cabs: null, cabId: null, maps: {}, cats: [], items: [], total: 0, parts: {}, q: '', cat: '', low: false,
  offline: false, loading: false, route: { v: 'list' }, mode: 'tegning', pick: null, form: null, setup: null,
  sugg: [], suggOpen: false, suggI: -1, drawerParts: null, pulseKey: '', err: null,
};
const LS = 'sk76_cache', LS_MODE = 'sk76_mode';
try { S.mode = localStorage.getItem(LS_MODE) === 'bilde' ? 'bilde' : 'tegning'; } catch { /* */ }

/* ---------------- API ---------------- */

export const sk = (path, opts) => api('/skjold' + path, opts);
const isNet = (e) => e instanceof TypeError || !navigator.onLine;
/** Skrivinger: sjekker nett først og gir en tydelig melding. */
export async function write(fn, okMsg) {
  if (!navigator.onLine) { toast('Endringer krever nett. Prøv igjen når du er tilkoblet.'); return null; }
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? {}; } catch (e) {
    toast(isNet(e) ? 'Endringer krever nett. Prøv igjen når du er tilkoblet.' : (e.message || 'Noe gikk galt'));
    return null;
  }
}
/** Opplasting (multipart, feltet «file»). */
export async function upload(path, file) {
  const fd = new FormData(); fd.append('file', file, file.name || 'bilde.jpg');
  const r = await fetch('/api/skjold' + path, { method: 'POST', body: fd, credentials: 'same-origin' });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Opplasting feilet (${r.status})`), { status: r.status });
  return d;
}

/* ---------------- Hjelpere for deler ---------------- */

export const fileUrl = (n) => (/^(\/|https?:|data:|blob:)/.test(n) ? n : `/api/skjold/files/${encodeURIComponent(n)}`);
export function photoUrls(p) {
  if (Array.isArray(p?.photoUrls) && p.photoUrls.length) return p.photoUrls.map((u) => (typeof u === 'string' ? { url: u, thumb: u } : { url: u.url, thumb: u.thumbUrl ?? u.url }));
  return (Array.isArray(p?.photos) ? p.photos : []).map((x, i) => (typeof x === 'string' ? { n: i, url: fileUrl(x), thumb: fileUrl(x) } : { n: x.n ?? i, url: fileUrl(x.url ?? x.name ?? x.file), thumb: fileUrl(x.thumbUrl ?? x.thumb ?? x.url ?? x.name ?? x.file) }));
}
export const thumbOf = (p) => p?.thumbUrl || photoUrls(p)[0]?.thumb || '';
export const minOf = (p) => { const m = p?.min_qty ?? p?.minQty; return m == null || m === '' ? null : +m; };
export const isLow = (p) => { const m = minOf(p); return m != null && m > 0 && +p.qty <= m; };
export function locOf(p) {
  const l = p?.location;
  if (l && (l.cabinetId ?? l.cabinet_id) != null && l.row) return { cabinetId: l.cabinetId ?? l.cabinet_id, row: +l.row, col: +l.col, compartment: l.compartment ?? null, text: l.text, cabinet: l.cabinet };
  const cid = p?.cabinet_id ?? p?.cabinetId;
  if (cid != null && p.row) return { cabinetId: cid, row: +p.row, col: +p.col, compartment: p.compartment ?? null };
  return null;
}
export const cabById = (id) => (S.cabs ?? []).find((c) => String(c.id) === String(id)) ?? null;
export function locText(l) {
  if (!l) return 'Uten plass';
  if (l.text) return l.text;
  const c = cabById(l.cabinetId);
  return [c?.name ?? l.cabinet ?? 'Skap', long76(l.row, l.col), l.compartment ? `Rom ${l.compartment}` : ''].filter(Boolean).join(' · ');
}
const specsText = (p) => {
  const s = p?.specs && typeof p.specs === 'object' ? p.specs : {};
  return Object.values(s).filter((v) => v != null && v !== '').map(String).join(' · ');
};
const qtyText = (p) => `${p.qty ?? 0} ${p.unit || 'stk'}`;
const ini = (n) => (String(n ?? '').match(/[\p{L}\p{N}]/gu) ?? ['•']).slice(0, 2).join('').toUpperCase();
export const thumbHtml = (p, cls = '') => `<span class="sk76-th ${cls}" aria-hidden="true"><b>${esc(ini(p?.name ?? p?.text))}</b>${thumbOf(p) ? `<img src="${esc(thumbOf(p))}" alt="" loading="lazy" decoding="async" data-sk76-img>` : ''}</span>`;

/* Søk uten nett: samme regler som serveren så godt det går (store/små bokstaver, æøå, prefiks, «10k» ~ «10 kΩ»). */
export const fold76 = (s) => String(s ?? '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[Ωω]/g, '');
function localSearch(items, q, cat, low) {
  const toks = fold76(q).split(/[\s,]+/).filter(Boolean);
  const hay = (p) => { const h = fold76([p.name, p.category, p.description, specsText(p), (p.tags ?? []).join(' '), p.location?.text].join(' ')); return [h, h.replace(/\s+/g, '')]; };
  const out = items.filter((p) => (!cat || p.category === cat) && (!low || isLow(p)) && (!toks.length || (() => { const [h, hc] = hay(p); return toks.every((t) => h.includes(t) || hc.includes(t)); })()));
  const nq = fold76(q).trim();
  const rank = (p) => { const n = fold76(p.name); return n === nq ? 0 : n.startsWith(nq) ? 1 : 2; };
  return nq ? out.sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), 'nb')) : out;
}
function saveCache(items) {
  try {
    const slim = items.slice(0, 600).map((p) => ({ id: p.id, name: p.name, category: p.category, description: String(p.description ?? '').slice(0, 200), specs: p.specs, qty: p.qty, unit: p.unit, min_qty: minOf(p), tags: p.tags, location: locOf(p) ? { ...locOf(p), text: locText(locOf(p)) } : null, thumbUrl: thumbOf(p) }));
    localStorage.setItem(LS, JSON.stringify({ at: Date.now(), items: slim, cabs: S.cabs ?? [], cats: S.cats }));
  } catch { /* full lagring eller privat modus */ }
}
function readCache() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } }

/* ---------------- Data ---------------- */

export async function loadCabs(force) {
  if (S.cabs && !force) return S.cabs;
  try { const r = await sk('/cabinets'); S.cabs = Array.isArray(r) ? r : r?.items ?? []; S.offline = false; } catch (e) {
    const c = readCache(); S.cabs = c?.cabs ?? []; if (isNet(e)) S.offline = true; else S.err = e.message;
  }
  if (!cabById(S.cabId)) S.cabId = S.cabs[0]?.id ?? null;
  onCabs78(S.cabs); // prompt 78
  return S.cabs;
}
export async function loadMap(id, force) {
  if (id == null) return null;
  if (S.maps[id] && !force) return S.maps[id];
  try { S.maps[id] = await sk(`/cabinets/${encodeURIComponent(id)}/map`); } catch { S.maps[id] ??= null; }
  return S.maps[id];
}
let listSeq = 0;
export async function loadList() {
  const seq = ++listSeq, full = !S.q && !S.cat && !S.low;
  const qs = new URLSearchParams({ limit: full ? '600' : '200' });
  if (S.q) qs.set('q', S.q); if (S.cat) qs.set('category', S.cat); if (S.low) qs.set('low', '1');
  S.loading = true; paintMain();
  try {
    const r = await sk(`/parts?${qs}`);
    if (seq !== listSeq) return;
    S.items = r?.items ?? []; S.total = r?.total ?? S.items.length; S.offline = false;
    for (const p of S.items) S.parts[p.id] = { ...(S.parts[p.id] ?? {}), ...p };
    if (full) saveCache(S.items);
  } catch (e) {
    if (seq !== listSeq) return;
    const c = readCache();
    if (isNet(e) && c) { S.offline = true; S.items = localSearch(c.items ?? [], S.q, S.cat, S.low); S.total = S.items.length; } else { S.items = []; S.total = 0; S.err = e.message; S.offline = isNet(e); }
  }
  S.loading = false;
  paintMain(); paintBanner();
}
async function loadCats() {
  try { const r = await sk('/categories'); S.cats = (Array.isArray(r) ? r : r?.items ?? []).map((c) => (typeof c === 'string' ? { name: c, count: 0 } : { name: c.name ?? c.category, count: c.count ?? c.n ?? 0 })).filter((c) => c.name); } catch { S.cats = readCache()?.cats ?? S.cats; }
  paintFilters();
}
export async function loadPart(id) {
  try { const p = await sk(`/parts/${encodeURIComponent(id)}`); S.parts[id] = p?.part ?? p; } catch (e) {
    if (!S.parts[id]) { const c = readCache()?.items?.find((x) => String(x.id) === String(id)); if (c) S.parts[id] = c; else S.err = isNet(e) ? 'Uten nett – delen er ikke lagret på enheten.' : e.message; }
    if (isNet(e)) S.offline = true;
  }
  return S.parts[id];
}
/** Etter endringer: kart, liste og kategorier hentes på nytt. */
export async function refreshAll(cabIds = []) {
  for (const id of new Set([S.cabId, ...cabIds].filter((x) => x != null))) delete S.maps[id];
  await loadCabs(true);
  loadList(); loadCats();
  await loadMap(S.cabId, true);
  paintSide();
}

/* ---------------- Adresse ---------------- */

function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const seg = path.split('/').map(decodeURIComponent);
  const q = new URLSearchParams(qs ?? '');
  if (seg[1] === 'del' && seg[2]) return { v: 'part', id: seg[2] };
  if (seg[1] === 'ny') return { v: 'edit', id: null, cab: q.get('skap'), at: q.get('at') };
  if (seg[1] === 'endre' && seg[2]) return { v: 'edit', id: seg[2] };
  if (seg[1] === 'oppsett') return { v: 'setup', id: seg[2] ?? null };
  if (tidyRoute77(seg)) return tidyRoute77(seg); // prompt 77: #/skjold/rydd[/<jobId>]
  if (seg[1] === 'skap' && seg[2]) {
    const m = /^(\d+)-(\d+)$/.exec(seg[3] ?? '');
    return m ? { v: 'drawer', cab: seg[2], row: +m[1], col: +m[2] } : { v: 'list', cab: seg[2] };
  }
  return { v: 'list', q: q.get('q') ?? null };
}
export const go = (h) => { if (location.hash !== h) location.hash = h; else onHash(); };

/* ---------------- Tegning ---------------- */

function currentSel() {
  const r = S.route;
  if (r.v === 'part') { const l = locOf(S.parts[r.id]); return l && String(l.cabinetId) === String(S.cabId) ? l : null; }
  if (r.v === 'drawer' && String(r.cab) === String(S.cabId)) return { row: r.row, col: r.col };
  if (r.v === 'edit' && S.form?.loc && String(S.form.loc.cabinetId) === String(S.cabId)) return S.form.loc;
  if (S.pick?.at && String(S.pick.at.cabinetId) === String(S.cabId)) return S.pick.at;
  return null;
}
function sideHtml() {
  const cab = cabById(S.cabId);
  if (!cab) return `<div class="sk76-card sk76-cab"><p class="sk76-mut">${S.cabs ? 'Ingen skap ennå.' : 'Henter skapet …'}</p></div>`;
  const map = S.maps[cab.id], sel = currentSel(), key = sel ? `${cab.id}:${sel.row}-${sel.col}-${sel.compartment ?? ''}` : '';
  const pulse = key && key !== S.pulseKey; if (pulse) S.pulseKey = key;
  const hasPhoto = !!(cab.photoUrl && cornersOk76(cab.corners));
  const photo = hasPhoto && S.mode === 'bilde';
  const tabs = (S.cabs ?? []).length > 1 ? `<div class="sk76-ctabs" role="tablist" aria-label="Skap">${S.cabs.map((c) => `<button type="button" role="tab" aria-selected="${String(c.id) === String(cab.id)}" data-sk76-cab="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>` : `<b class="sk76-cname">${esc(cab.name)}</b>`;
  const seg = hasPhoto ? `<div class="sk76-seg" role="group" aria-label="Visning"><button type="button" aria-pressed="${!photo}" data-sk76-mode="tegning">Tegning</button><button type="button" aria-pressed="${photo}" data-sk76-mode="bilde">Bilde</button></div>` : '';
  const used = map?.drawers?.filter((d) => +d.count > 0).length ?? cab.counts?.usedDrawers ?? 0;
  const parts = cab.counts?.parts ?? (map?.drawers ?? []).reduce((a, d) => a + (+d.count || 0), 0);
  let pick = '';
  if (S.pick) {
    const st = S.pick.stage;
    const comps = st ? Math.max(1, +(map?.drawers?.find((d) => d.row === st.row && d.col === st.col)?.compartments) || 1) : 1;
    pick = `<div class="sk76-pick" role="status">${st && comps > 1 ? `<span>${esc(long76(st.row, st.col))}: velg rom</span><span class="sk76-roms">${Array.from({ length: comps }, (_, i) => `<button type="button" data-sk76-rom="${i + 1}">Rom ${i + 1}</button>`).join('')}<button type="button" data-sk76-rom="0">Hele</button></span>` : `<span>${S.pick.kind === 'move' ? 'Trykk på skuffen delen skal flyttes til' : 'Trykk på skuffen delen skal ligge i'}</span>`}<button type="button" class="sk76-link" data-sk76="pick-cancel">Avbryt</button></div>`;
  }
  const body = photo
    ? `<div class="sk76-photo" data-sk76-photo><img src="${esc(cab.photoUrl)}" alt="${esc(`Bilde av ${cab.name}`)}" decoding="async">${overlayGrid76(cab, sel)}</div>`
    : `<div class="sk76-draw${pulse ? '' : ' nopulse'}">${drawCabinet76(cab, map, { sel, pick: !!S.pick, pulse })}</div>`;
  return `<section class="sk76-card sk76-cab" aria-label="Skapet">
    <div class="sk76-cabhead">${tabs}${seg}</div>${pick}${body}
    <p class="sk76-legend">${sel ? `<b>${esc(short76(sel.row, sel.col))}</b> ${esc(long76(sel.row, sel.col))}${sel.compartment ? ` · Rom ${esc(sel.compartment)}` : ''} · ` : ''}${esc(`${cab.rows} × ${cab.cols} skuffer · ${parts} ${parts === 1 ? 'del' : 'deler'} i ${used} skuffer`)}</p>
  </section>`;
}
let ro = null;
function mountPhoto(root) {
  const box = root.querySelector('[data-sk76-photo]'), cab = cabById(S.cabId);
  ro?.disconnect(); ro = null;
  if (!box || !cab) return;
  const img = box.querySelector('img'), lay = () => layoutPhoto76(box, cab, cab.corners);
  if (img.complete && img.naturalWidth) lay(); else img.addEventListener('load', lay, { once: true });
  img.addEventListener('error', () => { box.classList.add('bad'); }, { once: true });
  if ('ResizeObserver' in window) { ro = new ResizeObserver(lay); ro.observe(box); }
}

/* ---------------- Visninger ---------------- */

function listHtml() {
  if (S.loading && !S.items.length) return '<div class="sk76-card sk76-empty" aria-busy="true">Henter deler …</div>';
  if (!S.items.length) {
    const any = S.q || S.cat || S.low;
    return `<div class="sk76-card sk76-empty"><b>${any ? 'Ingen treff' : 'Ingen deler ennå'}</b><span>${any ? 'Prøv et annet ord, eller fjern filteret.' : 'Legg til den første delen, så finner du den igjen her.'}</span>${any ? '' : '<a class="sk76-btn pri" href="#/skjold/ny">+ Ny del</a>'}</div>`;
  }
  const head = `<div class="sk76-count">${esc(S.total === 1 ? '1 del' : `${S.total} deler`)}${S.q ? ` for «${esc(S.q)}»` : ''}${S.offline ? ' · lagret liste' : ''}${listAllBtn78(S.items)}</div>`;
  return `${head}<ul class="sk76-list" role="list">${S.items.map((p) => {
    const l = locOf(p), sp = specsText(p), lb = listBtn78(p); // prompt 78: 💡 ved treffet
    return `<li class="sk78-li"><a class="sk76-item" href="#/skjold/del/${encodeURIComponent(p.id)}">${thumbHtml(p)}<span class="sk76-it"><b>${esc(p.name)}</b>${sp ? `<span class="sk76-sp">${esc(sp)}</span>` : ''}<span class="sk76-loc">${l ? `<i class="sk76-code">${esc(short76(l.row, l.col))}</i>` : ''}${esc(l ? locText(p.location?.text ? p.location : l) : 'Uten plass')}</span></span><span class="sk76-q${isLow(p) ? ' low' : ''}">${esc(qtyText(p))}${isLow(p) ? '<em>Lavt</em>' : ''}</span></a>${lb}${pickBtn79(p)}</li>`;
  }).join('')}</ul>`;
}
function partHtml() {
  const id = S.route.id, p = S.parts[id];
  if (!p) return `<div class="sk76-card sk76-empty">${S.err ? esc(S.err) : 'Henter delen …'}</div>`;
  const l = locOf(p), ph = photoUrls(p), sel = S.photoI ?? 0, sp = p.specs && typeof p.specs === 'object' ? Object.entries(p.specs).filter(([, v]) => v != null && v !== '') : [];
  const tags = Array.isArray(p.tags) ? p.tags : [];
  const hist = Array.isArray(p.history) ? p.history.slice(0, 8) : [];
  return `<article class="sk76-card sk76-part" aria-label="${esc(p.name)}">
    <a class="sk76-back" href="#/skjold">‹ Alle deler</a>
    ${p.deletedAt || p.deleted_at ? `<div class="sk76-warn">Delen er slettet. <button type="button" class="sk76-link" data-sk76="restore">Angre sletting</button></div>` : ''}
    <div class="sk76-ptop">
      <div class="sk76-big${ph.length ? '' : ' empty'}">${ph.length ? `<img src="${esc(ph[Math.min(sel, ph.length - 1)].url)}" alt="${esc(p.name)}" decoding="async">` : `<span class="sk76-noph"><b>${esc(ini(p.name))}</b>Ingen bilde</span>`}</div>
      ${ph.length > 1 ? `<div class="sk76-thumbs">${ph.map((x, i) => `<button type="button" data-sk76-ph="${i}" aria-label="Bilde ${i + 1}" aria-pressed="${i === sel}"><img src="${esc(x.thumb)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    </div>
    <div class="sk76-pinfo">
      ${p.category ? `<span class="sk76-kick">${esc(String(p.category).toUpperCase())}</span>` : ''}
      <h2 class="sk76-pname">${esc(p.name)}</h2>
      ${p.description ? `<p class="sk76-desc">${esc(p.description)}</p>` : ''}
      <div class="sk76-locbox${l ? '' : ' none'}"><span class="sk76-bigcode">${l ? esc(short76(l.row, l.col)) : '–'}</span><span><span class="sk76-kick">PLASSERING</span><b>${esc(l ? locText(p.location?.text ? p.location : l) : 'Uten plass')}</b></span></div>
      ${locateBtn78(p)}
      <div class="sk79-prow">${pickBtn79(p, true)}</div>
      <div class="sk76-qty" role="group" aria-label="Antall">
        <button type="button" class="sk76-qb" data-sk76-qty="-1" aria-label="Én mindre">−</button>
        <span class="sk76-qv${isLow(p) ? ' low' : ''}"><b>${esc(p.qty ?? 0)}</b> ${esc(p.unit || 'stk')}${minOf(p) != null ? `<small>min ${esc(minOf(p))}</small>` : ''}</span>
        <button type="button" class="sk76-qb" data-sk76-qty="1" aria-label="Én til">+</button>
        ${isLow(p) ? '<span class="sk76-lowb">Lavt lager</span>' : ''}
      </div>
      <div class="sk76-pacts">
        <button type="button" class="sk76-btn" data-sk76="move">Flytt</button>
        <a class="sk76-btn" href="#/skjold/endre/${encodeURIComponent(p.id)}">Endre</a>
        <button type="button" class="sk76-btn danger" data-sk76="delete">Slett</button>
      </div>
      ${sp.length ? `<dl class="sk76-specs">${sp.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${tags.length ? `<div class="sk76-tags">${tags.map((t) => `<button type="button" class="sk76-tag" data-sk76-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
      ${p.url || p.price != null || p.supplier ? `<p class="sk76-meta">${[p.supplier ? esc(p.supplier) : '', p.price != null && p.price !== '' ? `${esc(Number(p.price).toLocaleString('nb-NO', { maximumFractionDigits: 2 }))} kr` : '', p.url && /^https?:\/\//.test(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Datablad / kjøp ↗</a>` : ''].filter(Boolean).join(' · ')}</p>` : ''}
      ${hist.length ? `<details class="sk76-hist"><summary>Historikk</summary><ul>${hist.map((h) => `<li><time>${esc(new Date(h.at).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time> ${esc(h.action)}${h.from != null || h.to != null ? ` <span class="sk76-mut">${esc([h.from, h.to].filter((x) => x != null && x !== '').join(' → '))}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
    </div>
  </article>`;
}
function drawerHtml() {
  const r = S.route, cab = cabById(r.cab), map = S.maps[r.cab], d = map?.drawers?.find((x) => x.row === r.row && x.col === r.col);
  const L = S.drawerParts ?? d?.parts ?? [];
  const comps = Math.max(1, +d?.compartments || 1);
  return `<section class="sk76-card sk76-drawer" aria-label="${esc(long76(r.row, r.col))}">
    <a class="sk76-back" href="#/skjold">‹ Alle deler</a>
    <div class="sk76-locbox"><span class="sk76-bigcode">${esc(short76(r.row, r.col))}</span><span><span class="sk76-kick">${esc(String(cab?.name ?? 'Skap').toUpperCase())}</span><b>${esc(long76(r.row, r.col))}${ownLabel76(d) ? ` · ${esc(ownLabel76(d))}` : ''}</b></span></div>
    ${L.length ? `<ul class="sk76-list" role="list">${L.map((p) => { const l = locOf(p); return `<li><a class="sk76-item" href="#/skjold/del/${encodeURIComponent(p.id)}">${thumbHtml(p)}<span class="sk76-it"><b>${esc(p.name)}</b>${specsText(p) ? `<span class="sk76-sp">${esc(specsText(p))}</span>` : ''}${l?.compartment ? `<span class="sk76-loc">Rom ${esc(l.compartment)}</span>` : ''}</span><span class="sk76-q${isLow(p) ? ' low' : ''}">${esc(qtyText(p))}</span></a></li>`; }).join('')}</ul>` : '<p class="sk76-mut sk76-pad">Skuffen er tom.</p>'}
    <div class="sk76-pacts"><a class="sk76-btn pri" href="#/skjold/ny?skap=${encodeURIComponent(r.cab)}&at=${r.row}-${r.col}">+ Ny del her</a></div>
    <form class="sk76-dform" data-sk76-dform>
      <span class="sk76-kick">SKUFFEN</span>
      <label>Etikett<input name="label" maxlength="40" value="${esc(ownLabel76(d))}" placeholder="${esc(`R${r.row}·S${r.col}`)}"></label>
      <label>Rom (skillevegger)<select name="compartments">${[1, 2, 3, 4].map((n) => `<option value="${n}"${n === comps ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Farge<input name="color" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(d?.color ?? '') ? d.color : '#e8ecef')}"></label>
      <button type="submit" class="sk76-btn">Lagre skuffen</button>
    </form>
  </section>`;
}

/* ---------------- Tegning av siden ---------------- */

const root = () => document.getElementById('sk76');
function shellHtml() {
  return `<header class="sk76-head">
      <div><span class="sk76-kick">SKJOLD LAB</span><h1 class="sk76-h1">Deler <em>og skuffer</em></h1></div>
      <div class="sk76-acts">
        <a class="sk76-btn pri" href="#/skjold/ny">+ Ny del</a>
        <a class="sk76-btn" href="#/skjold/oppsett">Skap</a>
        <button type="button" class="sk76-btn" data-sk76="labels">Etiketter</button>
        <span data-sk77-head>${headBtns77()}</span>
      </div>
    </header>
    <div data-sk77-gearbox>${gearHtml77()}</div>
    <form class="sk76-search" role="search" data-sk76-search autocomplete="off">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <input type="search" name="q" placeholder="Søk etter deler: M3, 10k, ESP32 …" aria-label="Søk etter deler" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sk76-sug" value="${esc(S.q)}" enterkeyhint="search">
      <ul class="sk76-sug" id="sk76-sug" role="listbox" hidden></ul>
    </form>
    <div class="sk76-filters" data-sk76-filters></div>
    <div class="sk76-off" data-sk76-off hidden></div>
    ${litBarHtml78()}
    <div class="sk76-cols"><div class="sk76-main" data-sk76-main></div><aside class="sk76-side" data-sk76-side></aside></div>
    ${pickShellHtml79()}`;
}
export function paintMain() {
  const el = root()?.querySelector('[data-sk76-main]');
  if (!el) return;
  const v = S.route.v;
  el.innerHTML = v === 'part' ? partHtml() : v === 'drawer' ? drawerHtml() : v === 'edit' ? editHtml() : v === 'setup' ? setupHtml() : v === 'tidy' ? tidyHtml77() : listHtml();
  root().dataset.v = v;
  if (v === 'edit') editMount(el);
  if (v === 'setup') setupMount(el);
}
export function paintSide() {
  const el = root()?.querySelector('[data-sk76-side]');
  if (!el) return;
  el.hidden = S.route.v === 'setup' || S.route.v === 'tidy';
  if (el.hidden) return;
  el.innerHTML = sideHtml();
  mountPhoto(el);
}
function paintFilters() {
  const el = root()?.querySelector('[data-sk76-filters]');
  if (!el) return;
  el.hidden = S.route.v !== 'list';
  const chip = (attr, on, label) => `<button type="button" class="sk76-chip${on ? ' on' : ''}" ${attr} aria-pressed="${on}">${label}</button>`;
  el.innerHTML = chip('data-sk76-low', S.low, 'Lavt lager') + chip('data-sk76-catv=""', !S.cat, 'Alle') + S.cats.slice(0, 14).map((c) => chip(`data-sk76-catv="${esc(c.name)}"`, S.cat === c.name, `${esc(c.name)}${c.count ? ` <small>${esc(c.count)}</small>` : ''}`)).join('');
}
function paintBanner() {
  const el = root()?.querySelector('[data-sk76-off]');
  if (!el) return;
  el.hidden = !S.offline;
  const c = readCache();
  el.textContent = S.offline ? `Uten nett – viser lagret liste${c?.at ? ` fra ${new Date(c.at).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}. Søk virker, men endringer krever nett.` : '';
}
export function paint() { paintFilters(); paintBanner(); paintMain(); paintSide(); }

/* ---------------- Ruting ---------------- */

async function onHash() {
  const el = root();
  if (!el) return;
  const prev = S.route;
  S.route = parseHash(); S.err = null;
  const r = S.route;
  if (S.suggOpen) closeSugg();
  if (r.v !== 'part' || prev.id !== r.id) S.photoI = 0;
  if (S.pick && !(r.v === 'part' && S.pick.kind === 'move' && prev.id === r.id) && r.v !== 'edit') S.pick = null;
  if (r.v !== 'edit') S.form = null;
  if (r.v !== 'setup') S.setup = null;
  if (r.v !== 'tidy') stopTidy77();
  route78(r); // prompt 78
  route79(r); // prompt 79: plukkliste
  if (r.v === 'list' && r.q != null && r.q !== S.q) { S.q = r.q; const i = el.querySelector('[data-sk76-search] input'); if (i) i.value = S.q; loadList(); }
  if (r.cab && cabById(r.cab)) S.cabId = cabById(r.cab).id;
  if (r.v === 'drawer') S.drawerParts = null;
  paint();
  window.scrollTo?.({ top: 0 });
  if (r.v === 'part') {
    const p = await loadPart(r.id), l = locOf(p);
    if (S.route !== r) return;
    if (l && cabById(l.cabinetId)) S.cabId = cabById(l.cabinetId).id;
    paintMain(); if (p) afterPart78(p); // prompt 78: lys opp automatisk når det er slått på
    await loadMap(S.cabId); if (S.route === r) paintSide();
  } else if (r.v === 'drawer') {
    await loadMap(r.cab); if (S.route !== r) return; paint();
    try { const d = await sk(`/parts?cabinet=${encodeURIComponent(r.cab)}&row=${r.row}&col=${r.col}&limit=100`); if (S.route === r) { S.drawerParts = d?.items ?? []; paintMain(); } } catch { /* kartet holder */ }
  } else if (r.v === 'edit') {
    if (r.id) await loadPart(r.id);
    if (S.route !== r) return;
    startEdit(r); paint();
  } else if (r.v === 'tidy') {
    startTidy77(r);
  } else if (r.v === 'setup') {
    startSetup(r); paint();
    await loadCabs(true); if (S.route !== r) return;
    if (S.setup) S.setup = null; startSetup(r); paint(); // ferske tellinger og bilder
  } else {
    await loadMap(S.cabId); if (S.route === r) paintSide();
  }
}

/* ---------------- Handlinger ---------------- */

async function changeQty(delta) {
  const p = S.parts[S.route.id]; if (!p) return;
  haptic(8);
  const r = await write(() => sk(`/parts/${encodeURIComponent(p.id)}/qty`, { method: 'POST', json: { delta } }));
  if (!r) return;
  S.parts[p.id] = { ...p, ...(r.part ?? r), qty: (r.part ?? r).qty ?? Math.max(0, (+p.qty || 0) + delta) };
  paintMain(); loadList();
}
async function doMove(part, to) {
  const from = locOf(part);
  const r = await write(() => sk(`/parts/${encodeURIComponent(part.id)}/move`, { method: 'POST', json: to }));
  if (!r) return;
  S.pick = null;
  if (r.part) S.parts[part.id] = r.part; else await loadPart(part.id);
  const occ = (r.occupied ?? []).filter((x) => String(x.id) !== String(part.id));
  const txt = `Flyttet til ${locText(locOf(S.parts[part.id]) ?? to)}${occ.length ? `. Merk: ${occ.slice(0, 2).map((x) => x.name).join(', ')}${occ.length > 2 ? ` +${occ.length - 2}` : ''} ligger der også` : ''}`;
  toast(txt, { action: 'Angre', ms: 10_000, onAction: async () => {
    const back = r.undo ?? (from ? { cabinetId: from.cabinetId, row: from.row, col: from.col, compartment: from.compartment ?? null } : { cabinetId: null, row: null, col: null, compartment: null });
    const u = await write(() => sk(`/parts/${encodeURIComponent(part.id)}/move`, { method: 'POST', json: back }), 'Flyttingen er angret');
    if (u) { if (u.part) S.parts[part.id] = u.part; else await loadPart(part.id); await refreshAll([from?.cabinetId, to.cabinetId]); paintMain(); }
  } });
  await refreshAll([from?.cabinetId, to.cabinetId]);
  paintMain();
}
async function doDelete() {
  const p = S.parts[S.route.id]; if (!p) return;
  if (!confirm(`Slette «${p.name}»? Du kan angre i 30 dager.`)) return;
  const r = await write(() => sk(`/parts/${encodeURIComponent(p.id)}`, { method: 'DELETE' }));
  if (!r) return;
  const id = p.id, cabId = locOf(p)?.cabinetId;
  delete S.parts[id];
  toast(`«${p.name}» er slettet`, { action: 'Angre', ms: 10_000, onAction: () => restore(id) });
  go('#/skjold');
  refreshAll([cabId]);
}
async function restore(id) {
  const r = await write(() => sk(`/parts/${encodeURIComponent(id)}/restore`, { method: 'POST' }), 'Delen er tilbake');
  if (!r) return;
  await loadPart(id); refreshAll([locOf(S.parts[id])?.cabinetId]);
  go(`#/skjold/del/${encodeURIComponent(id)}`);
}
async function onDrawer(key) {
  const [row, col] = key.split('-').map(Number), cab = cabById(S.cabId);
  if (!cab) return;
  haptic(6);
  if (S.pick) {
    const comps = Math.max(1, +(S.maps[cab.id]?.drawers?.find((d) => d.row === row && d.col === col)?.compartments) || 1);
    if (S.pick.kind === 'edit') { editInput({ pick: { cabinetId: cab.id, row, col, compartment: null } }); return; }
    if (comps > 1) { S.pick.stage = { row, col }; S.pick.at = { cabinetId: cab.id, row, col }; paintSide(); return; }
    const p = S.parts[S.pick.partId]; if (p) await doMove(p, { cabinetId: cab.id, row, col, compartment: null });
    return;
  }
  go(`#/skjold/skap/${encodeURIComponent(cab.id)}/${row}-${col}`);
}
async function onRom(n) {
  const st = S.pick?.stage, cab = cabById(S.cabId);
  if (!st || !cab) return;
  const p = S.parts[S.pick.partId]; if (p) await doMove(p, { cabinetId: cab.id, row: st.row, col: st.col, compartment: n || null });
}
async function saveDrawer(f) {
  const r = S.route, fd = new FormData(f);
  const body = { label: String(fd.get('label') ?? '').trim(), compartments: +fd.get('compartments') || 1, color: fd.get('color') === '#e8ecef' ? null : fd.get('color') };
  const ok = await write(() => sk(`/cabinets/${encodeURIComponent(r.cab)}/drawers/${r.row}/${r.col}`, { method: 'PUT', json: body }), 'Skuffen er lagret');
  if (ok) { delete S.maps[r.cab]; await loadMap(r.cab, true); paint(); }
}

/* ---------------- Søkefelt med forslag ---------------- */

let sugT = 0, listT = 0, sugSeq = 0;
function paintSugg(form) {
  const ul = form.querySelector('.sk76-sug'), inp = form.querySelector('input');
  const show = S.suggOpen && S.sugg.length > 0;
  ul.hidden = !show; inp.setAttribute('aria-expanded', String(show));
  if (!show) { inp.removeAttribute('aria-activedescendant'); return; }
  ul.innerHTML = S.sugg.map((s, i) => `<li id="sk76-s${i}" role="option" aria-selected="${i === S.suggI}" data-sk76-sug="${i}">${s.id != null ? thumbHtml(s, 'sm') : ''}<span><b>${esc(s.name ?? s.text)}</b>${s.sub || s.location?.text ? `<small>${esc(s.sub ?? s.location?.text)}</small>` : ''}</span></li>`).join('');
  if (S.suggI >= 0) inp.setAttribute('aria-activedescendant', `sk76-s${S.suggI}`); else inp.removeAttribute('aria-activedescendant');
}
function closeSugg() { const f = root()?.querySelector('[data-sk76-search]'); S.suggOpen = false; if (f) paintSugg(f); }
function onSearchInput(form) {
  const q = form.querySelector('input').value.trim();
  clearTimeout(sugT); clearTimeout(listT);
  S.suggI = -1;
  if (S.route.v !== 'list' && q) { history.replaceState(null, '', '#/skjold'); S.route = { v: 'list' }; S.pick = null; paint(); }
  sugT = setTimeout(async () => {
    const seq = ++sugSeq;
    if (!q) { S.sugg = []; paintSugg(form); return; }
    let L = [];
    try { const r = await sk(`/suggest?q=${encodeURIComponent(q)}`); L = (Array.isArray(r) ? r : r?.items ?? r?.suggestions ?? []).map((x) => (typeof x === 'string' ? { text: x } : x)); } catch {
      const c = readCache(); L = localSearch(c?.items ?? [], q, '', false);
    }
    if (seq !== sugSeq) return;
    S.sugg = L.slice(0, 8); S.suggOpen = document.activeElement === form.querySelector('input'); paintSugg(form);
  }, 120);
  listT = setTimeout(() => { if (S.q !== q) { S.q = q; loadList(); } }, 220);
}
function pickSugg(form, i) {
  const s = S.sugg[i]; if (!s) return;
  S.suggOpen = false; paintSugg(form);
  if (s.id != null) { form.querySelector('input').blur(); go(`#/skjold/del/${encodeURIComponent(s.id)}`); return; }
  const inp = form.querySelector('input');
  if (s.kind === 'category') { inp.value = ''; S.q = ''; S.cat = s.text; paintFilters(); loadList(); return; }
  inp.value = s.text ?? s.name; S.q = inp.value.trim(); loadList();
}

/* ---------------- Montering ---------------- */

let bound = false;
function bind() {
  if (bound) return; bound = true;
  window.addEventListener('hashchange', () => { if (root() && /^#\/skjold(\/|\?|$)/.test(location.hash)) onHash(); });
  window.addEventListener('online', () => { if (root() && S.offline) { S.offline = false; loadCabs(true).then(() => paint()); loadList(); } });
  document.addEventListener('click', (e) => {
    const el = root(); if (!el || !el.contains(e.target)) { const f = el?.querySelector('[data-sk76-search]'); if (f && S.suggOpen) { S.suggOpen = false; paintSugg(f); } return; }
    const t = e.target;
    if (S.suggOpen && !t.closest('[data-sk76-search]')) closeSugg();
    const sug = t.closest('[data-sk76-sug]'); if (sug) { e.preventDefault(); pickSugg(el.querySelector('[data-sk76-search]'), +sug.dataset.sk76Sug); return; }
    if (click77(t)) return; // prompt 77: ⋯-meny, ⚙ og Rydd opp
    if (click79(t)) return; // prompt 79: plukkliste og Feilsøk LED
    if (click78(t)) return; // prompt 78: 💡 Vis i skapet, LED-oppsett og kalibrering
    if (S.route.v === 'edit' && editClick(t, e)) return;
    if (S.route.v === 'setup' && setupClick(t, e)) return;
    const dr = t.closest('[data-sk76-dr]'); if (dr) { onDrawer(dr.dataset.sk76Dr); return; }
    const cab = t.closest('[data-sk76-cab]'); if (cab) { S.cabId = cabById(cab.dataset.sk76Cab)?.id ?? S.cabId; paintSide(); loadMap(S.cabId).then(paintSide); return; }
    const mode = t.closest('[data-sk76-mode]'); if (mode) { S.mode = mode.dataset.sk76Mode; try { localStorage.setItem(LS_MODE, S.mode); } catch { /* */ } paintSide(); return; }
    const rom = t.closest('[data-sk76-rom]'); if (rom) { onRom(+rom.dataset.sk76Rom); return; }
    const qty = t.closest('[data-sk76-qty]'); if (qty) { changeQty(+qty.dataset.sk76Qty); return; }
    const ph = t.closest('[data-sk76-ph]'); if (ph) { S.photoI = +ph.dataset.sk76Ph; paintMain(); return; }
    const tag = t.closest('[data-sk76-tag]'); if (tag) { S.q = tag.dataset.sk76Tag; const i = el.querySelector('[data-sk76-search] input'); i.value = S.q; go('#/skjold'); loadList(); return; }
    const lw = t.closest('[data-sk76-low]'); if (lw) { S.low = !S.low; paintFilters(); loadList(); return; }
    const cv = t.closest('[data-sk76-catv]'); if (cv) { S.cat = cv.dataset.sk76Catv; paintFilters(); loadList(); return; }
    const act = t.closest('[data-sk76]')?.dataset.sk76;
    if (act === 'labels') { window.open(`/api/skjold/labels${S.cabId != null ? `?cabinet=${encodeURIComponent(S.cabId)}` : ''}`, '_blank', 'noopener'); return; }
    if (act === 'move') {
      const p = S.parts[S.route.id]; if (!p) return;
      S.pick = { kind: 'move', partId: p.id }; paintSide();
      root()?.querySelector('[data-sk76-side]')?.scrollIntoView?.({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (act === 'pick-cancel') { S.pick = null; paintSide(); return; }
    if (act === 'delete') { doDelete(); return; }
    if (act === 'restore') { restore(S.route.id); return; }
  });
  document.addEventListener('keydown', (e) => {
    const el = root(); if (!el || !el.contains(e.target)) return;
    if (key79(e)) return; // prompt 79: Esc lukker plukklista
    if (key77(e)) return; // prompt 77: Esc lukker ⋯ og ⚙
    const dr = e.target.closest?.('[data-sk76-dr]');
    if (dr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onDrawer(dr.dataset.sk76Dr); return; }
    const form = e.target.closest?.('[data-sk76-search]');
    if (form && e.target.matches('input')) {
      if (e.key === 'ArrowDown' && S.sugg.length) { e.preventDefault(); S.suggOpen = true; S.suggI = Math.min(S.sugg.length - 1, S.suggI + 1); paintSugg(form); }
      else if (e.key === 'ArrowUp' && S.sugg.length) { e.preventDefault(); S.suggI = Math.max(-1, S.suggI - 1); paintSugg(form); }
      else if (e.key === 'Escape') { S.suggOpen = false; paintSugg(form); }
      else if (e.key === 'Enter' && S.suggOpen && S.suggI >= 0) { e.preventDefault(); pickSugg(form, S.suggI); }
    }
    if (e.key === 'Escape' && S.pick) { S.pick = null; paintSide(); }
  });
  document.addEventListener('input', (e) => {
    const el = root(); if (!el || !el.contains(e.target)) return;
    const form = e.target.closest('[data-sk76-search]'); if (form) { onSearchInput(form); return; }
    if (input78(e.target)) return; // prompt 78
    if (S.route.v === 'edit') editInput({ target: e.target });
    else if (S.route.v === 'setup') setupInput(e.target);
  });
  // Bilder som ikke kan lastes (uten nett, slettet) fjernes, så initialene under vises. CSP tillater ikke onerror="…".
  document.addEventListener('error', (e) => { const t = e.target; if (t?.tagName === 'IMG' && t.closest?.('#sk76') && (t.hasAttribute('data-sk76-img') || t.closest('.sk76-th'))) t.remove(); }, true);
  document.addEventListener('focusin', (e) => { const form = e.target.closest?.('#sk76 [data-sk76-search]'); if (form && S.sugg.length) { S.suggOpen = true; paintSugg(form); } });
  document.addEventListener('submit', (e) => {
    const el = root(); if (!el || !el.contains(e.target)) return;
    if (submit78(e)) return; // prompt 78: lysoppsettet
    if (e.target.matches('[data-sk76-search]')) { e.preventDefault(); clearTimeout(listT); S.suggOpen = false; paintSugg(e.target); S.q = e.target.querySelector('input').value.trim(); if (S.route.v !== 'list') go('#/skjold'); loadList(); return; }
    if (e.target.matches('[data-sk76-dform]')) { e.preventDefault(); saveDrawer(e.target); }
  });
}

/** Skallet som app.js tegner med en gang (rute #/skjold). */
export function renderShell76() { return '<section class="sk76" id="sk76" aria-label="Skjold Lab" aria-busy="true"></section>'; }
/** Kalles etter at app.js har tegnet siden. */
export async function mount(view) {
  const el = view.querySelector('#sk76');
  if (!el) return;
  bind();
  el.innerHTML = shellHtml();
  el.removeAttribute('aria-busy');
  el.classList.toggle('mob', isMobile());
  S.route = parseHash();
  paint();
  await loadCabs();
  loadPick79(); // prompt 79
  loadCats();
  if (S.route.v === 'list' && S.route.q != null) S.q = S.route.q;
  const i = el.querySelector('[data-sk76-search] input'); if (i) i.value = S.q;
  loadList();
  onHash();
}
