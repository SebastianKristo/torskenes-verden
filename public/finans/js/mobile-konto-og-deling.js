// Prompt 21 (mobil-PWA): brukerskille på enheten (cacher tømmes ved utlogging og kontobytte, opplastingskøen per
// bruker), pakkelogo (butikk først, så fraktselskap, så bokstav) med liten fraktmerkelapp, avganger som kan utvides
// med holdeplassene på turen, «hold inne og dra» for Hjem-kortene og Finans-flisene, deling av huskelister og
// «Del med familien» for soner. Alt tåler en eldre server: et endepunkt som svarer 404 gir en reserve.
import { esc, hlApi, logoMatch } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import * as UPQ from './mobile-upq.js';
import { badge, carOf, carId, CAR_BUNDLED, logoMiss } from './mobile-track.js';

/* ---------- Brukerskille: cacher på enheten ---------- */

// Nøkler med data som tilhører den innloggede brukeren. Rene enhetsvalg (tema, design, fh_mprefs, værsted,
// logoregisteret) beholdes. Opplastingskøen beholdes også, men hvert element er merket med userId.
export const USER_KEYS = ['hl_search_hist', 'fh_p15', 'fh_p16', 'fh_p17', 'fh_mlayout', 'fh_sub_done', 'fh_bol_meta', 'papir_fm_order', 'fh_trk_prefs', 'fh_ai_hist'];
const UKEY = 'fh_uid';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
export function clearUserCaches(freeze = false) {
  for (const k of USER_KEYS) lsSet(k, null);
  try { sessionStorage.removeItem('hl_dom_sel'); } catch {}
  // Før siden forlates: moduler som fortsatt kjører skal ikke skrive den forrige brukerens data tilbake.
  if (freeze) { try { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === localStorage && USER_KEYS.includes(k)) return; return set.call(this, k, v); }; } catch {} }
}
/** Logg ut: tøm brukerens cacher på enheten, så neste bruker ikke ser dem. */
export async function logout() {
  lsSet(UKEY, null); clearUserCaches(true); UPQ.setUser(null);
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login?next=/finans/';
}
/**
 * Ved oppstart: hvem er logget inn? Er det en annen konto enn sist (innlogging på web, kontobytte), tømmes cachene og
 * siden lastes på nytt, så ingenting fra forrige bruker ligger i minnet. Setter brukeren for opplastingskøen.
 */
export async function accountInit() {
  let id = null;
  try { const r = await fetch('/finans/api/me', { cache: 'no-store' }); if (r.ok) id = (await r.json())?.id ?? null; } catch {}
  if (id == null) { try { const r = await fetch('/api/me', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); id = j?.id ?? j?.userId ?? null; } } catch {} }
  if (id == null) return null; // uten nett: behold det som er (køen vises ikke før brukeren er kjent)
  const prev = lsGet(UKEY);
  if (prev && prev !== String(id)) { lsSet(UKEY, String(id)); clearUserCaches(true); location.reload(); return null; }
  lsSet(UKEY, String(id));
  UPQ.setUser(id);
  return id;
}

/* ---------- Pakker: tittel, logo og «+N pakker» ---------- */

const CAR_DOMAIN = { bring: 'bring.no', posten: 'posten.no', postnord: 'postnord.no', dhl: 'dhl.com', helthjem: 'helthjem.no', instabox: 'instabox.io', budbee: 'budbee.com', ups: 'ups.com', fedex: 'fedex.com', gls: 'gls-group.com', schenker: 'dbschenker.com', dbschenker: 'dbschenker.com', porterbuddy: 'porterbuddy.com' };
export const carrierDomain = (id) => CAR_DOMAIN[String(id ?? '').toLowerCase().replace(/[^a-z]/g, '')] ?? null;
const carN = (p) => p.carrierName || carOf(p.carrier).name || 'fraktselskapet';
// «Bring · 0750» er serverens gamle reservenavn (fraktselskap + del av sporingsnummeret). Det skal ikke vises.
const autoName = (p, n) => { const s = String(n ?? '').trim(); return !s || s === p.trackingNo || /·\s*[A-Z0-9]{3,6}$/i.test(s) && s.toLowerCase().startsWith(String(carN(p)).toLowerCase()); };
/** Tittel: varenavn eller butikk («Komplett · skjerm»), ellers «Pakke fra Bring». Aldri sporingsnummeret. */
export function pkgTitle(p) {
  if (p?.title && !autoName(p, p.title)) return p.title;
  if (!autoName(p, p.name)) return p.name;
  if (p.shop) return p.shop;
  return `Pakke fra ${carN(p)}`;
}
/** «+12 pakker ›» (antall minus denne), eller «13 pakker ›» når kortet er en samleoppføring. */
export function pkgMore(p, n) {
  const more = Number.isFinite(+p?.moreCount) ? +p.moreCount : n - 1;
  if (p?.group) return `${n} pakker ›`;
  return more > 0 ? `+${more} pakke${more === 1 ? '' : 'r'} ›` : '';
}
function shopSrc(p) {
  const L = p.logo ?? {};
  if (L.url && L.kind !== 'carrier' && L.kind !== 'letter') return L.url;
  if (L.id) return `/finans/api/logos/file/${encodeURIComponent(L.id)}`;
  const dom = L.domain || p.shopDomain || p.shop_domain || null;
  const it = logoMatch({ domain: dom, name: p.shop || null, merchant: p.shop || null });
  if (it && it.hasFile !== false) return `/finans/api/logos/file/${encodeURIComponent(it.id)}`;
  const d = dom || it?.domene;
  return d ? `/finans/api/logo/${encodeURIComponent(d)}` : null;
}
/**
 * Logoen på pakkekortet: butikken pakken kommer fra, med fraktselskapets logo som liten merkelapp nede til høyre.
 * Ukjent butikk: fraktselskapets logo. Feiler bildet: bokstav i fraktselskapets farge (aldri en tom boks).
 */
/**
 * Logo for fraktselskapet (prompt 22): serveren sender et objekt fra logobiblioteket. Mangler filen (url: null), vises
 * fargefyll med navnet (label), aldri et tilfeldig favicon. En streng er en eldre server sin logo-URL.
 */
export function carBadge(carrier, size, lg) {
  if (CAR_BUNDLED[carId(lg && typeof lg === 'object' ? lg.id || carrier : carrier)]) return badge(carrier, size, lg); // prompt 42: PostNord pakket med appen
  if (lg && typeof lg === 'object') {
    if (lg.url) return badge(carrier, size, lg.url);
    logoMiss(lg.name || lg.label || carrier); // prompt 42: reserven er 1–3 bokstaver, aldri hele navnet
    const l0 = String(lg.letter ?? '').trim(), txt = l0 && l0.length <= 3 ? l0 : String(lg.label || lg.name || '').split(/[\s-]+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 3).toUpperCase();
    const fs = size * (String(txt).length > 2 ? 0.3 : 0.42);
    return `<span class="trk-badge p22-cf" style="width:${size}px;height:${size}px;background:${esc(lg.color || carOf(carrier).c)};color:${esc(lg.fg || '#fff')};font-size:${fs.toFixed(1)}px;border-radius:${Math.round(size * 0.29)}px" aria-label="${esc(lg.label || lg.name || '')}">${esc(txt || '•')}</span>`;
  }
  return badge(carrier, size, lg || null);
}
export function pkgLogo(p, size = 52) {
  const L = p.logo ?? {}, car = L.carrierLogo || p.carrierLogo || null;
  if (L.kind === 'carrier' && !L.url && (L.label || L.name)) return `<span class="p21-pl" style="width:${size}px;height:${size}px">${carBadge(p.carrier, size, L)}</span>`;
  const hasShop = L.kind ? L.kind === 'shop' : !!(p.shop || L.domain || p.shopDomain || p.shop_domain);
  const shop = hasShop ? shopSrc(p) : null;
  if (!shop) return `<span class="p21-pl" style="width:${size}px;height:${size}px">${carBadge(p.carrier, size, car)}</span>`;
  const c = carOf(p.carrier), r = Math.round(size * 0.27), ini = String(L.letter || p.shop || c.ini || '•').replace(/[^A-Za-zÆØÅæøå0-9]/g, '').charAt(0).toUpperCase() || '•';
  return `<span class="p21-pl" style="width:${size}px;height:${size}px"><span class="trk-badge p21-shop" style="width:${size}px;height:${size}px;border-radius:${r}px;background:${esc(c.c)};color:${esc(c.fg)};font-size:${size * 0.4}px" aria-hidden="true">${esc(ini)}<img src="${esc(shop)}" alt="" loading="lazy"></span>
    <span class="p21-pcb">${carBadge(p.carrier, 18, car)}</span></span>`;
}

/* ---------- Avganger: utvidbar rad med holdeplassene ---------- */

export const DEP = { open: null, all: {} };
const MODE_NB = { tram: 'Trikk', bus: 'Buss', metro: 'T-bane', rail: 'Tog', train: 'Tog', water: 'Båt', ferry: 'Båt', coach: 'Buss', regionbus: 'Buss' };
export const modeName = (d) => MODE_NB[d.mode] ?? (/^(Trikk|Buss|T-bane|Tog|Båt)$/.test(d.mode ?? '') ? d.mode : (d.modeName ?? ''));
const hm = (t) => (t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '');
export const depKey = (stop, d, i) => `${stop}|${d.line}|${d.aimed || d.expected || d.time || i}`;
export function delayOf(d) {
  if (Number.isFinite(+d.delayMin)) return +d.delayMin;
  if (Number.isFinite(+d.delay)) return +d.delay;
  return d.aimed && d.expected ? Math.round((new Date(d.expected) - new Date(d.aimed)) / 60000) : 0;
}
/** «Trikk · plattform B · i rute» / «… · 2 min forsinket» (forsinkelse i --lab). */
export function depStatus(d) {
  const dl = delayOf(d), st = d.status || (dl > 0 ? `${dl} min forsinket` : 'i rute');
  return { txt: [modeName(d), d.platform ? `plattform ${d.platform}` : '', d.cancelled ? 'innstilt' : st].filter(Boolean).join(' · '), late: d.cancelled || dl > 0 };
}
export function ruterLink(d, from) {
  if (d.ruterUrl) return d.ruterUrl;
  const last = d.stops?.at?.(-1)?.name ?? d.to ?? '';
  return `https://ruter.no/reiseplanlegger/?${new URLSearchParams({ from: from ?? '', to: last })}`;
}
/** Stopplisten under en åpen avgang: fylt sirkel først, hule sirkler ellers, første og siste i fet. */
export function stopList(d, key, color, from) {
  const all = Array.isArray(d.stops) ? d.stops : [];
  if (!all.length) return `<div class="p21-sl"><span class="pp-mut">Holdeplassene på turen krever en nyere server.</span><a class="p21-ru" href="${esc(ruterLink(d, from))}" target="_blank" rel="noopener">Åpne i Ruter ›</a></div>`;
  const full = DEP.all[key] || all.length <= 6;
  const rows = full ? all.map((s, i) => [s, i]) : [[all[0], 0], [all[1], 1], null, [all.at(-2), all.length - 2], [all.at(-1), all.length - 1]];
  const n = all.length;
  return `<div class="p21-sl" style="--lc:${esc(color)}">${rows.map((r) => {
    if (!r) return `<button class="p21-st more" data-p21="depall" data-k="${esc(key)}"><span class="p21-dt"><i class="t"></i><span class="p21-dd"></span><i class="b"></i></span><span class="m-grow">· · · ${n - 4} stopp</span></button>`;
    const [s, i] = r, edge = i === 0 || i === n - 1;
    return `<div class="p21-st${edge ? ' p21-end' : ''}"><span class="p21-dt"><i class="t"${i === 0 ? ' style="visibility:hidden"' : ''}></i><span class="p21-dd${i === 0 ? ' fill' : ''}"></span><i class="b"${i === n - 1 ? ' style="visibility:hidden"' : ''}></i></span><span class="m-grow m-ell">${esc(s.name ?? '')}</span><span class="p21-tm">${esc(s.clock || hm(s.expected || s.time || s.aimed))}</span></div>`;
  }).join('')}<a class="p21-ru" href="${esc(ruterLink(d, from))}" target="_blank" rel="noopener">Åpne i Ruter ›</a></div>`;
}

/* ---------- Hold inne og dra (Hjem-kortene og Finans-flisene) ---------- */

let dr = null;
export const dragging = () => !!dr;
/**
 * Starter et drag av el (matcher sel, nøkkel i attr). Elementet følger fingeren, litt forstørret og gjennomsiktig,
 * og bytter plass med kortet under fingeren. drop(keys) får den nye rekkefølgen når fingeren slippes.
 */
export function dragStart(e, el, { sel, attr, drop }) {
  e?.preventDefault?.();
  const r = el.getBoundingClientRect();
  dr = { el, sel, attr, drop, k: el.getAttribute(attr), id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: e.clientX, y: e.clientY, moved: false };
  el.classList.add('p21-drag'); swAt = 0;
  try { el.setPointerCapture?.(e.pointerId); } catch {}
  follow(e.clientX, e.clientY);
}
const find = () => (dr.el.isConnected ? dr.el : document.querySelector(`${dr.sel}[${dr.attr}="${CSS.escape(dr.k)}"]`));
function follow(x, y) {
  const el = find(); if (!el) return;
  if (el !== dr.el) { dr.el = el; el.classList.add('p21-drag'); }
  el.style.transform = '';
  const r = el.getBoundingClientRect();
  el.style.transform = `translate(${x - dr.ox - r.left}px,${y - dr.oy - r.top}px) scale(1.03)`;
}
// Prompt 37 (claude-code-wiggle-krasj-ios.md, fasit edVals): ingen «bytte-storm». Bytt bare når pekeren er i midtre
// 30 % av målkortet og maks én gang per 140 ms, lett haptikk (4 ms) per bytte, try/catch rundt elementsFromPoint, og
// auto-scroll nær topp/bunn (40 px, maks 12 px per frame). Rekkefølgen lagres først ved slipp (drop i dragEnd).
let swAt = 0, asRaf = 0, asV = 0;
function autoScroll() {
  if (!dr || !asV) { asRaf = 0; return; }
  window.scrollBy(0, asV); follow(dr.x, dr.y);
  asRaf = requestAnimationFrame(autoScroll);
}
export function dragMove(e) {
  if (!dr || (e.pointerId != null && dr.id != null && e.pointerId !== dr.id)) return false;
  e.preventDefault?.();
  const el = find(); if (!el) { dr = null; return true; }
  dr.el = el; dr.moved = true; dr.x = e.clientX; dr.y = e.clientY;
  const H = window.innerHeight, y = e.clientY;
  // Prompt 39: auto-scroll innenfor 80 px fra toppen/bunnen, 9 px per frame.
  asV = y < 80 ? -9 : y > H - 80 ? 9 : 0;
  if (asV && !asRaf) asRaf = requestAnimationFrame(autoScroll);
  const now = Date.now();
  if (now - swAt >= 140) {
    let over = null;
    try { over = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x?.closest?.(dr.sel)).find((x) => x && x !== el && x.parentNode === el.parentNode && x.offsetParent !== null); } catch { over = null; }
    if (over) {
      const r = over.getBoundingClientRect(), mid = r.top + r.height / 2, band = Math.max(8, r.height * 0.15);
      if (Math.abs(e.clientY - mid) <= band) {
        const kids = [...el.parentNode.children], a = kids.indexOf(el), b = kids.indexOf(over);
        el.parentNode.insertBefore(el, a < b ? over.nextSibling : over);
        swAt = now; navigator.vibrate?.(4);
      }
    }
  }
  follow(e.clientX, e.clientY);
  return true;
}
export function dragEnd(e) {
  if (!dr || (e && e.pointerId != null && dr.id != null && e.pointerId !== dr.id)) return false;
  const el = find(), d = dr; dr = null; asV = 0;
  if (!el) return true;
  el.classList.remove('p21-drag'); el.style.transform = '';
  const keys = [...el.parentNode.querySelectorAll(`:scope > ${d.sel}`)].map((x) => x.getAttribute(d.attr));
  d.drop(keys);
  return true;
}
// Mens noe dras, skal ikke siden scrolle (touch-action ble bestemt før det lange trykket).
document.addEventListener('touchmove', (e) => { if (dr && e.cancelable) e.preventDefault(); }, { passive: false, capture: true }); // prompt 39: capture

/* ---------- Huskeliste: eier, «Delt med …» og «Del liste» ---------- */

export const SH = { list: null, sel: null, busy: false, err: '' };
const first = (s) => String(s ?? '').split(' ')[0];
/** Linja under listevelgeren: hvem som eier den valgte listen og hvem den er delt med. */
export function listShareLine(l, members, meId) {
  if (!l || l.owner == null && l.mine == null) return '';
  const mine = l.mine ?? String(l.owner) === String(meId);
  const mem = (l.members ?? []).map((x) => (typeof x === 'object' ? x : members.find((p) => String(p.id ?? p.userId) === String(x)) ?? { id: x, name: x }));
  const owner = mine ? 'Din liste' : `${esc(first(l.ownerName ?? members.find((p) => String(p.id ?? p.userId) === String(l.owner))?.name ?? 'Noen'))} sin liste`;
  const shared = mem.length ? `Delt med ${esc(mem.map((p) => first(p.name ?? p.username)).join(', '))}` : 'Bare deg';
  return `<div class="pp-card p21-lsh"><span class="m-grow"><b>${owner}</b><span class="pp-mut">${mine ? shared : `Delt med deg${mem.length > 1 ? ` og ${mem.length - 1} til` : ''}`}</span></span>${mine ? `<button class="pp-btn sm" data-p21="lshare" data-id="${esc(l.id)}">Del liste</button>` : `<button class="pp-btn sm ghost" data-p21="lleave" data-id="${esc(l.id)}">Forlat</button>`}</div>`;
}
export function shareSheet(HK) {
  if (!SH.list) return '';
  const l = (HK.d?.lists ?? []).find((x) => String(x.id) === String(SH.list));
  if (!l) return '';
  const meId = m.me?.id ?? UPQ.currentUser(), people = (HK.d?.members ?? []).filter((p) => String(p.id ?? p.userId) !== String(meId) && String(p.id ?? p.userId) !== String(l.owner));
  return `<div class="sheet-bg" data-p21="lsx"></div><div class="pp-sheet p21-sheet" role="dialog" aria-label="Del ${esc(l.name)}"><span class="pp-grab"></span>
    <div class="pp-sh">Del «${esc(l.name)}»</div><div class="pp-mut">Bare personene du velger ser listen. De kan legge til, endre og fullføre oppgaver. Bare du kan dele eller slette listen.</div>
    <div class="pp-card pp-tight">${people.map((p) => { const id = String(p.id ?? p.userId), on = SH.sel.includes(id); return `<button class="pp-srow p21-pr" data-p21="lpick" data-id="${esc(id)}" role="switch" aria-checked="${on}"><span class="p21-av">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(first(p.name ?? p.username).slice(0, 2))}</span><span class="m-grow"><b>${esc(p.name ?? p.username ?? id)}</b></span><span class="sw" aria-checked="${on}"></span></button>`; }).join('') || '<div class="pp-mut" style="padding:12px 14px">Ingen andre brukere på serveren ennå.</div>'}</div>
    ${SH.err ? `<div class="pp-lab-c" style="font-size:13px">${esc(SH.err)}</div>` : ''}
    <button class="pp-btn ink" data-p21="lsave" ${SH.busy ? 'disabled' : ''}>${SH.busy ? 'Lagrer …' : 'Lagre deling'}</button><button class="pp-btn" data-p21="lsx">Avbryt</button></div>`;
}
async function shareSave(HK, reload) {
  SH.busy = true; SH.err = ''; draw();
  try {
    const r = await hlApi(`/tasks/lists/${encodeURIComponent(SH.list)}/members`, { method: 'PUT', json: { userIds: SH.sel } });
    const nl = r?.list ?? (r?.id ? r : null);
    if (Array.isArray(r?.lists) && HK.d) HK.d.lists = r.lists;
    else if (nl && HK.d) HK.d.lists = HK.d.lists.map((x) => (String(x.id) === String(nl.id) ? { ...x, ...nl } : x));
    SH.list = null; flash(SH.sel.length ? 'Listen er delt ✓' : 'Listen er ikke delt lenger ✓');
    await reload?.();
  } catch (e) { SH.err = e.status === 404 ? 'Deling av lister krever en nyere server. Oppdater Homelab.' : e.status === 403 ? 'Bare eieren kan dele listen.' : e.message; }
  SH.busy = false; draw();
}

/* ---------- Klikk ---------- */

export async function p21Bind(e, t, ctx = {}) {
  const x = t.closest?.('[data-p21]');
  if (!x) return false;
  const k = x.dataset.p21;
  // Prompt 28 (claude-code-ruter-hjem.md): stopplisten ligger alltid i layouten og animerer høyden (grid-template-rows
  // 0fr ↔ 1fr). Bare én åpen om gangen; ingen ny tegning og ingen scrolling, så raden blir liggende der den er.
  if (k === 'dep') {
    e.preventDefault(); DEP.open = DEP.open === x.dataset.k ? null : x.dataset.k; haptic('tab');
    const cols = document.querySelectorAll('[data-depcol]');
    if (!cols.length) { draw(); return true; }
    for (const c of cols) { const on = c.dataset.depcol === DEP.open; c.classList.toggle('on', on); c.parentElement?.classList.toggle('open', on); c.previousElementSibling?.setAttribute?.('aria-expanded', String(on)); }
    return true;
  }
  if (k === 'depall') { e.preventDefault(); DEP.all[x.dataset.k] = true; draw(); return true; }
  const HK = ctx.HK;
  if (k === 'lshare' && HK) { e.preventDefault(); const l = HK.d.lists.find((y) => String(y.id) === String(x.dataset.id)); SH.list = x.dataset.id; SH.sel = (l?.members ?? []).map((p) => String(typeof p === 'object' ? p.id ?? p.userId : p)); SH.err = ''; draw(); return true; }
  if (k === 'lpick') { e.preventDefault(); const id = x.dataset.id; SH.sel = SH.sel.includes(id) ? SH.sel.filter((y) => y !== id) : [...SH.sel, id]; haptic('tab'); draw(); return true; }
  if (k === 'lsave' && HK) { e.preventDefault(); await shareSave(HK, ctx.reload); return true; }
  if (k === 'lleave' && HK) {
    e.preventDefault();
    if (!confirm('Forlate listen? Du ser den ikke lenger før eieren deler den med deg igjen.')) return true;
    try { await hlApi(`/tasks/lists/${encodeURIComponent(x.dataset.id)}/members/me`, { method: 'DELETE' }); HK.cur = 'alle'; flash('Du har forlatt listen ✓'); await ctx.reload?.(); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (k === 'lsx') { e.preventDefault(); SH.list = null; draw(); return true; }
  return false;
}
export const p21Sheets = (HK) => (m.screen === 'huske' ? shareSheet(HK) : '');
