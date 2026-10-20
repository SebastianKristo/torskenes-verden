// Prompt 38 (WEB38): Kalender på web = Kalender.app for Mac (claude-code-kalender-mac-lik-web.md, fasit Kalender Mac.dc.html,
// som bruker Kalender.dc.html variant «web» full). Funksjonene fra iPhone-appen (Kalender App.dc.html) som web manglet:
// - År-visning og zoom-overganger (kzIn/kzOut fra pekeren, Ctrl/⌘ + rullehjul eller to-finger-knip, trykk på tittelen = ut)
// - Glimt-feltet nederst («Spør Glimt eller skriv en hendelse …» + rød +) og Glimt-assistenten (panel med steg, svar som
//   skrives ut, kort, ledige tider og kart): «i morgen», skoleprøve (≠ prøveperiode), ledig tid, frister, bursdager, uka, været
// - adresse og kart på hendelser (serverens map/address fra kal37, ellers GET /api/kalender/geo?q=) med lokale kartfliser
// - ark og tastatur: arkene løftes over tastaturet (visualViewport), dra ned for å lukke på mobil
// - app-modus (/kalender?app=mac): window.kalApp.cmd('new'|'today'|'view:uke'|'search'|'settings'|…) for Mac-appens ⌘-snarveier.
// Selve kalenderen (data, visninger, ark) ligger i kalender.js, som gir denne modulen en kontekst med initKal38().
import { esc, isMobile, haptic } from './util.js';
import { glimt } from './glimt.js';
import { preview, quickLabel, addQuick } from './kal-quick.js';

let C = null;
/** kalender.js: { K, evOn, col, short, key, add, d0, mm, hmM, fromKey, curD, calById, paint, openDay, setView, openForm,
 *  openSel, askServer, noUrl, longDate } */
export function initKal38(ctx) { C = ctx; }

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* privat modus */ } } };

/* ---------------- App-modus (/kalender?app=mac) ---------------- */

/** 'mac' når siden er lastet av Kalender.app (hl-boot.js setter html[data-kal-app]). */
export const appMode = () => document.documentElement.dataset.kalApp || '';
/** Melding til den native appen: window.webkit.messageHandlers.kalMac.postMessage({type, …}) eller window.kalMac.post(type, data).
 *  Typer: ready, view, changed (etter lagring), logout, open {url}, macSettings, notify {title, body}. Ingen app = ingenting skjer. */
export function toNative(msg) {
  try {
    const h = window.webkit?.messageHandlers?.kalMac ?? window.webkit?.messageHandlers?.kalender;
    if (h) { h.postMessage(msg); return true; }
    if (typeof window.kalMac?.post === 'function') { const { type, ...data } = msg; window.kalMac.post(type, data); return true; }
  } catch { /* ikke i appen */ }
  return false;
}
let lastNative = '';
/** Etter hver tegning: fortell appen hvilken visning og tittel som vises (bare når noe endret seg, ingen løkker). */
export function noteView(view, title) {
  if (!appMode()) return;
  const s = `${view}|${title}`;
  if (s === lastNative) return;
  lastNative = s;
  toNative({ type: 'view', view, title });
}
/** Etter lagring/sletting: Mac-appen oppdaterer menylinje-kalenderen, Dock-ikonet og varslene. */
export const noteChanged = (what = 'event') => { if (appMode()) toNative({ type: 'changed', what }); };
export const COMMANDS = ['new', 'new:YYYY-MM-DD', 'today', 'search', 'settings', 'view:dag', 'view:3d', 'view:uke', 'view:mnd', 'view:ar', 'view:liste', 'prev', 'next', 'date:YYYY-MM-DD', 'event:<id>', 'glimt', 'glimt:<spørsmål>', 'sidebar', 'goto', 'newcal', 'weeks:1', 'weeks:0', 'close', 'refresh'];
/** window.kalApp – Mac-appen kaller kalApp.cmd(...) med evaluateJavaScript. Returnerer true når kommandoen ble utført.
 *  Kommandoer sendt før siden var klar ligger i window.__kalAppQueue (tømmes her), og kommer også som CustomEvent('kalapp:cmd'). */
export function installApi(run) {
  const exec = (c) => { try { return !!run(String(c ?? '').trim()); } catch (e) { console.warn('kalApp.cmd', c, e); return false; } };
  const api = { version: 2, ready: true, commands: COMMANDS, cmd: exec };
  window.kalApp = api;
  const drain = () => {
    const q = Array.isArray(window.__kalAppQueue) ? window.__kalAppQueue.splice(0) : [];
    q.forEach((c) => exec(typeof c === 'object' && c ? c.cmd ?? c.command : c));
    return q.length;
  };
  window.addEventListener('kalapp:cmd', (e) => {
    const c = typeof e.detail === 'object' && e.detail ? e.detail.cmd ?? e.detail.command : e.detail;
    const inQ = Array.isArray(window.__kalAppQueue) && window.__kalAppQueue.some((x) => (typeof x === 'object' && x ? x.cmd ?? x.command : x) === c);
    drain();
    if (c && !inQ) exec(c);
  });
  // Etter første tegning, så kommandoene treffer en ferdig kalender.
  setTimeout(() => { drain(); toNative({ type: 'ready', version: api.version, commands: COMMANDS }); }, 0);
}

/* ---------------- Zoom-overganger ---------------- */

export const ZL = ['ar', 'mnd', 'uke', '3d', 'dag'];
let zfx = null, zwAt = 0;
const zi = (v) => ZL.indexOf(v === 'liste' ? 'mnd' : v);
/** Retning fra en visning til en annen: inn (mer detaljer) eller ut. */
export const zoomDir = (from, to) => (to === 'liste' ? 'in' : zi(to) > zi(from) ? 'in' : 'out');
/** Husk retning og opphav (pekeren) til neste tegning. */
export function markZoom(dir, ev) {
  const el = document.querySelector('#kal .k2-view');
  let o = '50% 40%';
  if (ev && el && ev.clientX != null) {
    const R = el.getBoundingClientRect();
    o = `${Math.max(0, Math.min(100, Math.round((ev.clientX - R.left) / Math.max(1, R.width) * 100)))}% ${Math.max(0, Math.min(100, Math.round((ev.clientY - R.top) / Math.max(1, R.height) * 100)))}%`;
  }
  zfx = { dir, o };
}
/** Kjøres etter at visningen er tegnet: skaler inn/ut fra opphavet (0,38 s). */
export function applyZoom(h) {
  const z = zfx; zfx = null;
  if (!z || reduced()) return;
  const el = h.querySelector('.k2-view');
  if (!el) return;
  el.style.transformOrigin = z.o;
  el.classList.add(z.dir === 'in' ? 'k38-zin' : 'k38-zout');
  el.addEventListener('animationend', () => el.classList.remove('k38-zin', 'k38-zout'), { once: true });
}
/** Ett steg inn/ut. Dagen eller måneden under pekeren blir den nye visningen. */
export function zoomStep(dir, ev) {
  const v = C.K.view, i = zi(v), j = Math.max(0, Math.min(ZL.length - 1, i + (dir === 'in' ? 1 : -1)));
  if (j === i) return false;
  const t = ev?.target?.closest?.('[data-k-day],[data-k-go],[data-k-mo],[data-k-wk]');
  const at = t ? (t.dataset.kDay || t.dataset.kGo || t.dataset.kMo || t.dataset.kWk) : undefined;
  haptic(6);
  C.setView(ZL[j], at, ev, dir);
  return true;
}
/** Ctrl/⌘ + rullehjul (også knip på styreflaten) over visningen. */
export function onWheel(e) {
  if (!(e.ctrlKey || e.metaKey) || !e.target.closest?.('.k2-view')) return;
  e.preventDefault();
  const now = Date.now();
  if (now - zwAt < 450 || Math.abs(e.deltaY) < 4) return;
  zwAt = now;
  zoomStep(e.deltaY < 0 ? 'in' : 'out', e);
}
let pinch = null;
/** To fingre: knip ut = inn, knip sammen = ut. Returnerer true når berøringen er et knip (sveip skal da ignoreres). */
export function touchStart(e) {
  if (e.touches.length !== 2) { pinch = null; return false; }
  const [a, b] = e.touches;
  pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), r: 1, c: { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2, target: e.target } };
  return true;
}
export function touchMove(e) {
  if (!pinch || e.touches.length !== 2) return;
  const [a, b] = e.touches;
  pinch.r = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(1, pinch.d);
}
export function touchEnd() {
  if (!pinch) return false;
  const p = pinch; pinch = null;
  if (p.r > 1.22) zoomStep('in', p.c); else if (p.r < 0.82) zoomStep('out', p.c);
  return true;
}
/** Trykk på tittelen: ett steg ut (Dag → 3 dager → Uke → Måned → År). */
export const TITLE_OUT = { dag: '3d', '3d': 'uke', uke: 'mnd', mnd: 'ar', ar: 'ar', liste: 'mnd' };

/* ---------------- År ---------------- */

export function yearView(today) {
  const { evOn, key, col } = C, cur = C.curD(), Y = cur.getFullYear(), tk = key(today), web = !isMobile();
  const head = [1, 2, 3, 4, 5, 6, 0].map((i) => `<span>${'SMTOTFL'[i]}</span>`).join('');
  const months = MN.map((n, mi) => {
    const f = new Date(Y, mi, 1, 12), off = (f.getDay() + 6) % 7, dim = new Date(Y, mi + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<span></span>';
    for (let d = 1; d <= dim; d++) {
      const dd = new Date(Y, mi, d, 12), k = key(dd), L = evOn(dd).filter((e) => e.kind !== 'time'), isT = k === tk;
      cells += `<button type="button" class="k38-yd${isT ? ' today' : dd.getDay() === 0 ? ' sun' : ''}" data-k-day="${k}" aria-label="${esc(`${d}. ${n}`)}${L.length ? `, ${L.length} hendelser` : ''}">${d}${L.length && web ? `<i style="background:${esc(isT ? '#fff' : col(L[0]))}"></i>` : ''}</button>`;
    }
    const isM = Y === today.getFullYear() && mi === today.getMonth();
    return `<div class="k38-ym"><button type="button" class="k38-ymt${isM ? ' on' : ''}" data-k-mo="${Y}-${String(mi + 1).padStart(2, '0')}-01">${esc(cap(n))}</button><div class="k38-ymg">${head}${cells}</div></div>`;
  }).join('');
  return { st: new Date(Y, 0, 1, 12), end: new Date(Y, 11, 31, 12), html: `<div class="k38-year" data-k-list>${months}</div>` };
}

/* ---------------- Kart (adresse + kart ved hendelser) ---------------- */

const GEO_KEY = 'kal_geo38';
const GEO = (() => { try { return new Map(Object.entries(JSON.parse(ls.get(GEO_KEY) || '{}'))); } catch { return new Map(); } })();
const geoBusy = new Set();
const ROOM = /^[A-Z]{1,2}-?\d{2,4}\b|^(aula|hall|gym|gymsal|gymsalen|bibl|biblioteket|canvas|rom|sal|lab)\b/i;
const STREET = /[a-zæøå](veien|vegen|vei|veg|gata|gaten|gate|plass|plassen|allé|alle|torget|bakken|stien|brygge|kaia)\s+\d+/i;
/** Stedet som kan slås opp: gateadresse eller «Sted, by». Rom på skolen («A-112») slås ikke opp. */
export function geoQuery(e) {
  const loc = String(e?.addr || e?.r || '').trim();
  if (!loc || loc.length < 4 || ROOM.test(loc) || e.kind === 'time' || e.kind === 'bursdag') return '';
  return STREET.test(loc) || /,\s*\p{L}/u.test(loc) || /\b\d{4}\b/.test(loc) ? loc : '';
}
/** Koordinater for hendelsen: serverens map, ellers cachen. Starter oppslag i bakgrunnen (repaint når det er ferdig). */
export function geoOf(e) {
  if (e?.gmap && Number.isFinite(+e.gmap.lat) && Number.isFinite(+e.gmap.lon)) return { lat: +e.gmap.lat, lon: +e.gmap.lon, label: e.addr || e.gmap.label || e.r, apple: e.gmap.appleUrl, google: e.gmap.googleUrl, url: e.gmap.url };
  const q = geoQuery(e);
  if (!q) return null;
  const v = GEO.get(q);
  if (v && v.lat != null) return v;
  if (v && v.fail && Date.now() - v.fail < 36e5) return null;
  if (!geoBusy.has(q)) {
    geoBusy.add(q);
    fetch(`/api/kalender/geo?q=${encodeURIComponent(q)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const g = j && (j.found || j.lat != null) && Number.isFinite(+j.lat) ? { lat: +j.lat, lon: +j.lon, label: j.address || j.label || q, apple: j.map?.appleUrl, google: j.map?.googleUrl, url: j.map?.url } : { fail: Date.now() };
        GEO.set(q, g);
        try { ls.set(GEO_KEY, JSON.stringify(Object.fromEntries([...GEO].slice(-200)))); } catch { /* */ }
        if (g.lat != null) C?.paint();
      })
      .catch(() => { GEO.set(q, { fail: Date.now() }); })
      .finally(() => geoBusy.delete(q));
  }
  return null;
}
const links = (g) => ({
  apple: g.apple || `https://maps.apple.com/?q=${encodeURIComponent(g.label || '')}&ll=${g.lat},${g.lon}`,
  google: g.google || `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lon}`,
});
/** Lite kart av lokale fliser (/tiles/topo, samme som Familie og Sporing) med nål i midten. */
export function mapHtml(g, { h = 150, cls = '' } = {}) {
  const z = 16, n = 2 ** z, xf = (g.lon + 180) / 360 * n, lr = g.lat * Math.PI / 180;
  const yf = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
  const tx = Math.floor(xf), ty = Math.floor(yf), px = Math.round((xf - tx) * 256), py = Math.round((yf - ty) * 256);
  let tiles = '';
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    tiles += `<img alt="" loading="lazy" decoding="async" draggable="false" src="/tiles/topo/${z}/${tx + dx}/${ty + dy}.png" style="left:calc(50% + ${dx * 256 - px}px);top:calc(50% + ${dy * 256 - py}px)">`;
  }
  const L = links(g);
  return `<a class="k38-map ${cls}" href="${esc(L.google)}" target="_blank" rel="noopener" style="height:${h}px" aria-label="${esc(`Kart: ${g.label || ''}`)}"><span class="k38-tiles" aria-hidden="true">${tiles}</span>
    <span class="k38-pin" aria-hidden="true"><svg width="26" height="32" viewBox="0 0 26 32"><path d="M13 31s11-10.2 11-18A11 11 0 0 0 2 13c0 7.8 11 18 11 18z" fill="#b23a2a" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13" r="4" fill="#fff"/></svg></span>
    <span class="k38-addr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.3"/></svg><span data-no-i18n>${esc(g.label || '')}</span></span></a>`;
}
/** Kartblokken i detaljarket: kart + «Åpne i Kart» og «Veibeskrivelse». Tom når stedet ikke kan slås opp. */
export function detailMap(e) {
  const g = geoOf(e);
  if (!g) return geoQuery(e) && !e.gmap ? '<div class="k38-map k38-map-wait" aria-hidden="true"></div>' : '';
  const L = links(g);
  return `<div class="k38-mapbox">${mapHtml(g, { h: 160 })}<div class="k2-btns"><a class="k2-b line" href="${esc(L.apple)}" target="_blank" rel="noopener">Åpne i Kart ↗</a><a class="k2-b line" href="${esc(L.google)}" target="_blank" rel="noopener">Veibeskrivelse ↗</a></div></div>`;
}

/* ---------------- Glimt-feltet og assistenten ---------------- */

const SUG = ['Hva skjer i morgen?', 'Når er neste prøve?', 'Finn ledig tid fredag', 'Oppsummer uka', 'Neste frist?', 'Neste bursdag?'];
export const G = { goto: false, open: false, msgs: [], bar: '', gq: '', focusBar: false, focusGq: false, sug: false, wx: null, wxAt: 0 };
let glTimer = 0, glType = 0, mid = 0;

const isQ = (t) => { const s = t.trim().toLowerCase(); return /\?\s*$/.test(s) || /^(hva|når|hvem|hvor|hvordan|hvilke|hvilken|har jeg|er jeg|finn|oppsummer|kan jeg|skal jeg|blir det|neste)\b/.test(s); };
function loadWx() {
  if (G.wx && Date.now() - G.wxAt < 30 * 60_000) return;
  G.wxAt = Date.now();
  fetch('/api/kalender/weather', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (j?.days) G.wx = Object.fromEntries(j.days.map((d) => [d.date, d]));
  }).catch(() => {});
}

/** Feltet nederst: ✦ (åpner Glimt) · tekst · ↑ og den røde + (ny hendelse). Forhåndsvisning over feltet mens man skriver. */
export function glimtBar() {
  const v = G.bar, has = !!v.trim();
  return `<div class="k38-gbar" data-k38-gbar>
    <div class="k38-gpv" data-k38-pv${has || G.sug ? '' : ' hidden'}>${barPreview()}</div>
    <div class="k38-grow">
      <div class="k38-gin"><button type="button" class="k38-gsp" data-k38-gopen aria-label="Åpne Glimt" title="Glimt">${glimt(22, 'klar')}</button>
        <input data-k38-bar value="${esc(v)}" placeholder="Spør Glimt eller skriv en hendelse …" autocomplete="off" enterkeyhint="send" aria-label="Spør Glimt eller skriv en hendelse">
        <button type="button" class="k38-gsend" data-k38-bsend aria-label="Send"${has ? '' : ' hidden'}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div>
      <button type="button" class="k38-gplus" data-k-new aria-label="Ny hendelse" title="Ny hendelse (N)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
    </div></div>`;
}
function barPreview() {
  const v = G.bar.trim();
  if (!v) return G.sug ? `<div class="k38-sugs">${SUG.slice(0, 4).map((s, i) => `<button type="button" data-k38-sug="${i}">${esc(s)}</button>`).join('')}</div>` : '';
  if (isQ(v)) return `<button type="button" class="k38-pvq" data-k38-bsend>${glimt(20, 'klar')}<span class="k2-grow"><span class="k38-pvl">SPØR GLIMT</span><b data-no-i18n>${esc(v)}</b></span><span class="k38-pvk">Enter ›</span></button>`;
  const p = preview(v);
  if (!p.ok || !p.date) return `<button type="button" class="k38-pvq" data-k38-bsend>${glimt(20, 'klar')}<span class="k2-grow"><span class="k38-pvl">SPØR GLIMT</span><b data-no-i18n>${esc(v)}</b></span><span class="k38-pvk">Enter ›</span></button>`;
  const when = `${quickLabel({ date: p.date })}${p.start ? ` · ${p.start}–${p.end}` : ' · hele dagen'}`;
  return `<div class="k38-pva"><span class="k38-pvl">GLIMT FORSTÅR <i style="background:${esc(C.calById('privat').color)}"></i> Privat</span><b data-no-i18n>${esc(p.title || 'Hendelse')}</b><span>${esc(when)}${p.place ? ` · <span data-no-i18n>${esc(p.place)}</span>` : ''}</span><span>${p.start ? 'Varsel 1 time før' : 'Uten varsel'}</span>
    <span class="k38-pvr"><span>Enter for å legge til</span><button type="button" class="k38-pvb" data-k38-badd>Legg til</button></span></div>`;
}
/** Oppdaterer bare forhåndsvisningen (feltet beholder fokus og markør). */
export function paintBar(h) {
  const pv = h?.querySelector('[data-k38-pv]');
  if (pv) { pv.innerHTML = barPreview(); pv.hidden = !(G.bar.trim() || G.sug); }
  const s = h?.querySelector('.k38-gsend'); if (s) s.hidden = !G.bar.trim();
}
/** Enter / ↑ i feltet: et spørsmål går til Glimt, en hendelse legges til (i bakgrunnen, med Angre i banneret). */
export function submitBar(force) {
  const v = G.bar.trim();
  if (!v) { openGlimt(); return; }
  const p = isQ(v) ? null : preview(v);
  if (force !== 'ask' && p?.ok && p.date) { G.bar = ''; G.sug = false; haptic(10); addQuick(v); C.paint(); return; }
  G.bar = ''; G.sug = false; G.focusBar = false;
  openGlimt(v);
}
export function openGlimt(q) {
  G.open = true; G.focusGq = true; loadWx();
  C.paint();
  if (q) send(q);
}
export function closeGlimt() {
  if (!G.open) return false;
  G.open = false; clearTimeout(glTimer); clearInterval(glType);
  G.msgs = G.msgs.map((m) => (m.r === 'a' ? { ...m, th: false, n: 1e9 } : m));
  C.paint();
  return true;
}

/** Glimt-panelet: til høyre på web, ark nedenfra på mobil. */
export function glimtPanel() {
  if (!G.open) return '';
  const th = G.msgs.some((m) => m.th);
  return `<div class="k38-gl-bg" data-k38-gclose></div><aside class="k38-gl" role="dialog" aria-modal="true" aria-label="Glimt – kalender-assistent">
    <span class="k2-grip k38-grip" aria-hidden="true"></span>
    <div class="k38-gl-h"><span class="k38-orb${th ? ' th' : ''}" aria-hidden="true"><i></i><i></i><b>${glimt(20, th ? 'tenker' : 'klar')}</b></span><span class="k2-grow"><b>Glimt</b><span data-k38-gsub>${th ? 'TENKER …' : 'KALENDER-ASSISTENT · LOKALT + SERVER'}</span></span><button type="button" class="k38-done" data-k38-gclose>Ferdig</button></div>
    <div class="k38-gl-b" data-k38-glb>${msgsHtml()}</div>
    <div class="k38-gl-f">${G.msgs.length ? `<div class="k38-sugs">${SUG.map((s, i) => `<button type="button" data-k38-sug="${i}">${esc(s)}</button>`).join('')}</div>` : ''}
      <form class="k38-gq" data-k38-gform>${glimt(20, 'klar')}<input data-k38-gq value="${esc(G.gq)}" placeholder="Spør Glimt …" autocomplete="off" enterkeyhint="send" aria-label="Spør Glimt"><button type="submit" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></form></div>
  </aside>`;
}
function msgsHtml() {
  if (!G.msgs.length) {
    return `<div class="k38-gl-e"><span class="k38-orb big" aria-hidden="true"><i></i><i></i><b>${glimt(40, 'klar')}</b></span><b>Hva lurer du på?</b><span>Spør om kalenderen din, finn ledig tid, eller lim inn en melding, så legger jeg den inn.</span>
      <div class="k38-sugs">${SUG.map((s, i) => `<button type="button" data-k38-sug="${i}">${esc(s)}</button>`).join('')}</div></div>`;
  }
  return G.msgs.map(msgHtml).join('');
}
function msgHtml(m) {
  if (m.r === 'u') return `<div class="k38-mu" data-k38-m="${m.id}"><span data-no-i18n>${esc(m.t)}</span></div>`;
  const R = m.full ?? {}, steps = R.steps ?? [], words = String(R.txt ?? '').split(' ');
  const typing = !m.th && m.n < words.length, txt = m.th ? '' : words.slice(0, Math.max(0, m.n)).join(' ');
  const stepsH = m.th ? `<div class="k38-steps"><span class="k38-stl">Glimt tenker</span>${steps.map((s, i) => `<span class="${i < m.step ? 'ok' : i === m.step ? 'on' : ''}"><i>${i < m.step ? '✓' : ''}</i>${esc(s)}</span>`).join('')}</div>` : '';
  const done = !m.th && !typing;
  const cards = done ? (R.cards ?? []).slice(0, 5).map((x) => {
    const g = geoOf(x.e);
    return `<div class="k38-card"><button type="button" class="k38-cb" data-k-sel="${esc(x.e.id)}" style="--c:${esc(C.col(x.e))}"><span class="k38-cs"></span><span class="k2-grow"><b data-no-i18n>${esc(C.short(x.e))}</b><span data-no-i18n>${esc([cap(C.longDate(x.d)), C.noUrl(x.e.r)].filter(Boolean).join(' · '))}</span></span><span class="k38-ct">${esc(x.e.s || 'Hele')}</span></button>${g ? mapHtml(g, { h: 120, cls: 'sm' }) : ''}</div>`;
  }).join('') : '';
  const slots = done && R.slots?.length ? `<div class="k38-slots">${R.slots.map((s) => `<button type="button" data-k38-slot="${esc(`${s.k}|${s.s}|${s.e}`)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${esc(`${C.hmM(s.s)}–${C.hmM(s.e)}`)}</button>`).join('')}</div>` : '';
  const err = done && R.err ? `<span class="k38-err" role="alert">${esc(R.err)}</span>` : '';
  return `<div class="k38-ma" data-k38-m="${m.id}"><span class="k38-mi" aria-hidden="true">${glimt(22, m.th ? 'tenker' : typing ? 'svarer' : 'ferdig')}</span><div class="k2-grow">${stepsH}${m.th ? '' : `<span class="k38-txt" data-no-i18n>${esc(txt)}${typing ? '<i class="k38-caret"></i>' : ''}</span>`}${cards}${slots}${err}</div></div>`;
}
/** Tegner bare én melding på nytt (steg og skriving), så panelet ikke blinker. */
function paintMsg(m) {
  const h = document.getElementById('kal'), el = h?.querySelector(`[data-k38-m="${m.id}"]`), box = h?.querySelector('[data-k38-glb]');
  if (!el || !box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  el.outerHTML = msgHtml(m);
  const sub = h.querySelector('[data-k38-gsub]'); if (sub) sub.textContent = m.th ? 'TENKER …' : 'KALENDER-ASSISTENT · LOKALT + SERVER';
  h.querySelector('.k38-gl .k38-orb')?.classList.toggle('th', !!m.th);
  if (near) box.scrollTop = box.scrollHeight;
}
/** Sender et spørsmål: lokalt svar med steg (420 ms hver) og ord-for-ord-skriving; ukjent → serveren (Glimt / søk). */
export async function send(q) {
  q = String(q ?? '').trim();
  if (!q) return;
  haptic(8);
  // Har man bladd langt bort, er kanskje ikke dagene rundt i dag hentet: hent dem før Glimt svarer.
  await C.ensureNow?.();
  clearTimeout(glTimer); clearInterval(glType);
  G.msgs = G.msgs.map((m) => (m.r === 'a' ? { ...m, th: false, n: 1e9 } : m));
  const local = ask(q), id = ++mid;
  const m = { id: `a${id}`, r: 'a', th: true, step: 0, full: local ?? { steps: ['Leser kalenderen', 'Spør Glimt på serveren'], txt: '' }, n: 0 };
  G.msgs.push({ id: `u${id}`, r: 'u', t: q }, m);
  G.gq = ''; G.open = true;
  C.paint();
  const box = document.querySelector('#kal [data-k38-glb]'); if (box) box.scrollTop = box.scrollHeight;
  const type = () => {
    m.th = false; m.n = 0; paintMsg(m);
    const words = String(m.full.txt ?? '').split(' ').length;
    glType = setInterval(() => {
      m.n += 2; paintMsg(m);
      if (m.n >= words) { clearInterval(glType); haptic(6); }
    }, reduced() ? 1 : 45);
  };
  const ns = m.full.steps.length;
  const tick = () => {
    m.step++; paintMsg(m);
    if (m.step < ns) { glTimer = setTimeout(tick, 420); return; }
    if (local) { glTimer = setTimeout(type, 260); return; }
    // Ukjent lokalt: serveren svarer (POST /api/glimt tool:calendar og /api/kalender/search?ai=1, 12 s).
    C.askServer(q).then((ans) => {
      if (!G.msgs.includes(m)) return;
      m.full = ans?.txt ? { steps: m.full.steps, txt: ans.txt, cards: ans.items ?? [] }
        : { steps: m.full.steps, txt: 'Jeg kan svare på ting som «Hva skjer i morgen?», «Når er neste prøve?» og «Finn ledig tid fredag», eller legge inn hendelser du skriver eller limer inn.', err: ans?.err ? `Glimt fikk ikke svar: ${ans.err}` : '' };
      type();
    });
  };
  glTimer = setTimeout(tick, 380);
}

/** Lokale svar (samme regler som iPhone-appens ask()). null = la serveren svare. */
export function ask(q) {
  const { evOn, key, add, d0, mm, hmM, short, noUrl } = C;
  const now = new Date(), T = d0(now), tk = key(T), tmr = key(add(T, 1)), nm = now.getHours() * 60 + now.getMinutes();
  const ql = ` ${q.toLowerCase().replace(/[?!.,:;«»"]/g, ' ').replace(/\s+/g, ' ')} `;
  const fd = (d) => `${WD[d.getDay()]} ${d.getDate()}. ${MN[d.getMonth()]}`;
  const rel = (d) => { const k = key(d); return k === tk ? 'i dag' : k === tmr ? 'i morgen' : fd(d); };
  const on = (d) => evOn(d);
  const up = [];
  for (let i = 0; i < 120; i++) { const d = add(T, i); for (const e of evOn(d)) if (i > 0 || !e.e || !e.s || mm(e.e) > nm) up.push({ e, d }); }
  const wxD = (d) => { const w = G.wx?.[key(d)]; if (!w) return ''; const rain = /regn|byge|yr|sludd/i.test(w.text ?? '') || (w.precipProb ?? 0) >= 60; return ` Været: ${String(w.text ?? '').toLowerCase()}, ${w.lo}–${w.hi} grader${rain ? ', så ta med paraply.' : '.'}`; };
  const dayOf = () => {
    if (/ (i )?(overmorgen|overimorgen|over i morgen) /.test(ql) || / day after tomorrow /.test(ql)) return add(T, 2);
    if (/ (i ?morgen|i ?morra|imorgo|tomorrow) /.test(ql)) return add(T, 1);
    if (/ (i ?dag|i ?kveld|i natt|today|tonight) /.test(ql)) return T;
    if (/ i går /.test(ql)) return add(T, -1);
    const m = ql.match(/(neste\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)/);
    if (m) { let df = (WD.indexOf(m[2]) - T.getDay() + 7) % 7 || 7; if (m[1] && df < 7) df += 7; return add(T, df); }
    const m2 = ql.match(/(\d{1,2})\.(\d{1,2})/);
    if (m2) return new Date(T.getFullYear(), +m2[2] - 1, +m2[1], 12);
    return null;
  };
  const card = (x) => ({ e: x.e, d: x.d });
  const tm = (e) => (e.s ? ` kl. ${e.s}` : '');
  // Ledig tid: hull på minst 45 min mellom 08 og 21.
  if (/ledig|fri tid|finn tid|når kan jeg|har jeg tid/.test(ql)) {
    const d = dayOf() || add(T, 1), ev = on(d).filter((e) => e.s && e.e && e.kind !== 'innl').map((e) => [mm(e.s), mm(e.e)]).sort((a, b) => a[0] - b[0]);
    let t0 = key(d) === tk ? Math.max(480, Math.ceil(nm / 30) * 30) : 480;
    const gaps = [];
    ev.forEach(([a, b]) => { if (a - t0 >= 45) gaps.push([t0, a]); t0 = Math.max(t0, b); });
    if (1260 - t0 >= 45) gaps.push([t0, 1260]);
    return { steps: [`Leser ${rel(d)} i kalenderen`, 'Finner hull på minst 45 min', 'Foreslår tider'],
      txt: gaps.length ? `${cap(rel(d))} er du ledig ${gaps.map((g) => `${hmM(g[0])}–${hmM(g[1])}`).join(', ').replace(/, ([^,]*)$/, ' og $1')}. Trykk på en tid for å legge inn en hendelse.` : `${cap(rel(d))} er det fullt mellom 08 og 21.`,
      slots: gaps.slice(0, 4).map((g) => ({ k: key(d), s: g[0], e: Math.min(g[1], g[0] + 60) })) };
  }
  if (/bursdag/.test(ql)) {
    const L = up.filter((x) => x.e.kind === 'bursdag' || x.e.cal === 'bursdager').slice(0, 3);
    return { steps: ['Ser i Bursdager'], txt: L.length ? `De neste bursdagene: ${L.map((x) => `${x.e.t.replace(/ har bursdag$/, '')} ${rel(x.d)}`).join(', ')}.` : 'Ingen bursdager de neste ukene.', cards: L.map(card) };
  }
  if (/frist|innlevering|oblig/.test(ql) && !/prøve|eksamen/.test(ql)) {
    const L = up.filter((x) => x.e.kind === 'innl').slice(0, 4), nm2 = (x) => x.e.t.replace(/^Frist:\s*/i, '');
    return { steps: ['Ser i Studie', 'Sorterer frister'], txt: L.length ? `Neste frist er ${nm2(L[0])} ${rel(L[0].d)}.${L.length > 1 ? ` Etter det: ${L.slice(1).map((x) => `${nm2(x)} ${rel(x.d)}`).join(', ')}.` : ''}` : 'Ingen frister fremover.', cards: L.map(card) };
  }
  if (/(oppsummer|hva skjer|hva har jeg|program|plan |hvordan ser|hva står)/.test(ql)) {
    if (/ uka | uke | uken |denne uken|neste uke/.test(ql)) {
      const s0 = / neste uke /.test(ql) ? add(T, 7 - ((T.getDay() + 6) % 7)) : T, days = Array.from({ length: 7 }, (_, i) => add(s0, i));
      const L = days.flatMap((d) => on(d).map((e) => ({ e, d })));
      const busy = days.map((d) => [d, on(d).length]).sort((a, b) => b[1] - a[1])[0];
      const fr = L.find((x) => x.e.kind === 'innl' || x.e.kind === 'prove'), bd = L.find((x) => x.e.kind === 'bursdag');
      return { steps: ['Leser 7 dager', 'Finner travleste dag', 'Skriver oppsummering'],
        txt: `Du har ${L.length} hendelser de neste 7 dagene. Travlest er ${rel(busy[0])} med ${busy[1]}.${fr ? ` Husk ${fr.e.kind === 'prove' ? 'prøven' : 'fristen'}: ${short(fr.e)} ${rel(fr.d)}.` : ''}${bd ? ` Bursdag: ${bd.e.t}.` : ''}`,
        cards: L.filter((x) => x.e.kind !== 'time').slice(0, 4) };
    }
    const d = dayOf() || T, L = on(d), tt = L.filter((e) => e.s && e.e && e.kind !== 'innl');
    return { steps: [`Leser ${rel(d)}`, 'Sjekker været', 'Skriver oppsummering'],
      txt: L.length ? `${cap(rel(d))} har du ${L.length} ${L.length === 1 ? 'hendelse' : 'hendelser'}.${tt.length ? ` Første er ${short(tt[0])} kl. ${tt[0].s}, og dagen er ferdig ${hmM(Math.max(...tt.map((e) => mm(e.e))))}.` : ''}${wxD(d)}` : `${cap(rel(d))} er helt fri.${wxD(d)}`,
      cards: L.slice(0, 5).map((e) => ({ e, d })) };
  }
  if (/ vær | været | regn | paraply /.test(ql)) {
    const d = dayOf() || T, w = wxD(d).trim();
    return { steps: ['Henter værvarselet'], txt: w ? w.replace(/^Været:/, `${cap(rel(d))}:`) : 'Har ikke værvarsel for den dagen ennå.' };
  }
  // «i morgen»: bare dagen («hva har jeg i morgen», «i morgen?»).
  if (/ (i ?morgen|i ?morra|tomorrow|overmorgen) /.test(ql) && !/ neste | når /.test(ql)) {
    const d = dayOf() || add(T, 1), L = on(d), tt = L.filter((e) => e.s && e.e);
    return { steps: [`Leser ${rel(d)}`, 'Sjekker været'], txt: L.length ? `${cap(rel(d))} har du ${L.length} ${L.length === 1 ? 'hendelse' : 'hendelser'}.${tt.length ? ` Første er ${short(tt[0])} kl. ${tt[0].s}.` : ''}${wxD(d)}` : `${cap(rel(d))} er helt fri.${wxD(d)}`, cards: L.slice(0, 5).map((e) => ({ e, d })) };
  }
  // Skoleprøve ≠ prøveperiode (abonnement): «når er neste prøve på skolen».
  const isTrial = /prøveperiode|prøvetid|gratis ?periode|abonnement|trial|viaplay|netflix| max |disney/.test(ql);
  const isSchool = / (skole|skolen|skola|universitet|universitetet|uni|uio|ntnu|oslomet|høgskole|høgskolen|studie|studiet|studier|klassen|fag) /.test(ql);
  const isTest = / (prøve|prøva|prøven|prøver|eksamen|eksamenen|test|testen|quiz|midtveis|tentamen|heldagsprøve) /.test(ql);
  if (isTest && !isTrial) {
    const TRx = /prøven slutter|prøveperiode|abonnement/i, TX = /prøve|eksamen|test|quiz|midtveis|tentamen/i, SCH = new Set(['timeplan', 'prover', 'skole']);
    const L = up.filter((x) => x.e.k37 !== 'trial' && !TRx.test(x.e.t) && (x.e.kind === 'prove' || TX.test(x.e.t)) && (!isSchool || SCH.has(x.e.cal) || x.e.kind === 'prove'));
    if (L.length) {
      const m = L[0], days = Math.round((m.d - T) / 864e5), what = short(m.e).replace(/^Prøve · /, 'prøve i ').replace(/^Eksamen /, 'eksamen i ');
      return { steps: ['Ser i Studie-kalenderen', `Fant ${L.length} ${L.length === 1 ? 'prøve' : 'prøver/eksamener'}`],
        txt: `Neste ${isSchool ? 'prøve på skolen' : 'prøve'} er ${what} ${rel(m.d)}${tm(m.e)}${m.e.r ? `, ${noUrl(m.e.r)}` : ''}.${days > 1 ? ` Det er om ${days} dager.` : ''}${L.length > 1 ? ` Etter det: ${L.slice(1, 3).map((x) => `${short(x.e)} ${rel(x.d)}`).join(', ')}.` : ''}`,
        cards: L.slice(0, 3).map(card) };
    }
    const nf = up.find((x) => x.e.kind === 'innl');
    return { steps: ['Ser i Studie-kalenderen', 'Ingen prøver funnet'], txt: `Jeg finner ingen prøver eller eksamener i Studie-kalenderen.${nf ? ` Neste frist er ${short(nf.e)} ${rel(nf.d)}.` : ''}`, cards: nf ? [card(nf)] : [] };
  }
  if (/ neste | når er | når har | når skal | når må /.test(ql)) {
    const stop = new Set(['når', 'er', 'neste', 'min', 'mitt', 'mine', 'har', 'jeg', 'skal', 'må', 'time', 'timen', 'timer', 'hos', 'til', 'på', 'i', 'en', 'et', 'den', 'det', 'avtale', 'avtalen', 'hva', 'meg', 'skole', 'skolen', 'universitet', 'universitetet', 'studie', 'studiet', 'gang']);
    const terms = ql.split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).map((w) => w.replace(/(timen|timer|time|en|et|er)$/, '')).filter((w) => w.length > 2);
    const hay = (x) => `${x.e.t} ${x.e.r ?? ''} ${C.calById(x.e.cal).name}`.toLowerCase();
    const m = terms.length ? up.find((x) => x.e.s && terms.some((t) => hay(x).includes(t))) || up.find((x) => terms.some((t) => hay(x).includes(t))) : up.find((x) => x.e.s);
    if (m) {
      const days = Math.round((m.d - T) / 864e5);
      return { steps: [`Søker etter «${terms.join(' ') || 'neste'}»`, `Fant ${short(m.e)}`], txt: `${terms.length ? `Neste ${terms.join(' ')} er ` : `Neste er ${short(m.e)} `}${rel(m.d)}${tm(m.e)}${m.e.r ? `, ${noUrl(m.e.r)}` : ''}.${days > 1 ? ` Det er om ${days} dager.` : ''}`, cards: [card(m)] };
    }
    return null; // la serveren lete lenger tilbake/frem
  }
  // En hendelse skrevet eller limt inn: legges til i bakgrunnen (kal-quick: Angre i banneret).
  const P = isQ(q) ? null : preview(q);
  if (P?.ok && P.date && (P.start || /\d/.test(q) || q.length > 50)) {
    addQuick(q);
    return { steps: ['Leser teksten', 'Finner dato og tid', 'Legger inn i Privat'], txt: `Jeg legger «${P.title || 'hendelsen'}» inn ${rel(new Date(P.date + 'T12:00'))}${P.start ? ` kl. ${P.start}` : ''} i Privat${P.start ? ', med varsel 1 time før' : ''}. Du kan angre i banneret øverst.` };
  }
  return null;
}

/* ---------------- Ark og tastatur ---------------- */

/** Tastaturet på mobil/nettbrett: --k38-kb = høyden det dekker, så ark og Glimt-feltet ligger over det. */
export function bindKeyboard() {
  const vv = window.visualViewport;
  if (!vv || bindKeyboard.done) return;
  bindKeyboard.done = true;
  const upd = () => {
    const h = document.getElementById('kal');
    if (!h) return;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    h.style.setProperty('--k38-kb', `${kb > 60 ? kb : 0}px`);
    h.classList.toggle('k38-kbon', kb > 60);
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
}
/** Dra ned på et ark (fra håndtaket/toppen) lukker det, under terskelen spretter det tilbake. */
export function bindSheetDrag(h, close) {
  if (h.dataset.k38Drag) return;
  h.dataset.k38Drag = '1';
  let d = null;
  h.addEventListener('touchstart', (e) => {
    const sh = e.target.closest?.('.k2-sheet, .k38-gl, .k3-sr');
    if (!sh || e.touches.length !== 1 || !isMobile()) { d = null; return; }
    const sc = e.target.closest('[data-k38-glb], .k3-sb, .k2-sheet');
    if (e.target.closest('input, textarea, select') || (sc && sc.scrollTop > 0 && !e.target.closest('.k2-grip, .k2-det-h, .k38-gl-h, .k2-qa-h'))) { d = null; return; }
    d = { sh, y: e.touches[0].clientY, dy: 0 };
  }, { passive: true });
  h.addEventListener('touchmove', (e) => {
    if (!d) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y);
    if (d.dy > 4) { d.sh.style.transition = 'none'; d.sh.style.transform = `translateY(${d.dy}px)`; }
  }, { passive: true });
  h.addEventListener('touchend', () => {
    if (!d) return;
    const { sh, dy } = d; d = null;
    if (dy > 90) { haptic(8); sh.style.transition = 'transform .18s ease'; sh.style.transform = 'translateY(100%)'; setTimeout(close, 170); return; }
    sh.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)'; sh.style.transform = '';
  });
}

/* ---------------- Tema i app-modus ---------------- */

/** Mac-appen følger systemets lyse/mørke tema (prefers-color-scheme). Kartflisene får mørkt filter i mørkt tema. */
export function bindScheme(onChange) {
  if (!appMode() || bindScheme.done) return;
  bindScheme.done = true;
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => onChange?.()); } catch { /* eldre motor */ }
}

export { SUG };

/* ---------------- «Gå til dato» (kalApp.cmd('goto'), ⌘⇧T i Mac-appen) ---------------- */
export function gotoSheet(today) {
  if (!G.goto) return '';
  return `<div class="k2-sheet-bg" data-k38-gtclose><div class="k2-sheet k38-goto" role="dialog" aria-modal="true" aria-label="Gå til dato">
    <div class="k2-det-h"><b class="k2-grow k2-fh">Gå til dato</b><button type="button" class="k2-x" data-k38-gtclose aria-label="Lukk">✕</button></div>
    <form class="k2-form" data-k38-gtform><input class="k2-in" type="date" name="d" value="${esc(C.key(today))}" required aria-label="Dato"><button type="submit" class="k2-b ink">Gå til</button></form></div></div>`;
}
