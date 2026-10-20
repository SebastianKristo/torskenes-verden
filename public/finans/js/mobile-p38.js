// Prompt 38 (PWA38): AI-svarboblen lukkes med ✕ / sveip opp / trykk utenfor (fanget), nye kort i Now Brief (Pakker,
// Familie, Skole og jobb, Bursdager, Nordlys i natt) og Glimt i prestedrakt for bibelvers, ØKT i Konto (Lås skjermen,
// Logg ut, Logg ut av alle enheter), Glimt-oppsummering i Domener (✦-knappen erstatter Skann), og «Logg inn på ny enhet»
// med QR-skanner (BarcodeDetector, ellers lim inn kode) og godkjenn-ark med matchkode og biometri/passord.
// Fasit: design_handoff_homelab/prompts/prompt-38-pakke/design/ (Mobil Papir App, Glimt Brief, Bibelvers, Logg inn QR,
// Homelab Domener Papir). API (kontrakt 38, SERVER38): /api/auth/qr/scan|approve, /api/auth/logout-all, /api/me/sessions,
// /api/brief (packages|family|school|birthdays|aurora), POST /api/brief/gift, /api/glimt/settings cards, /api/domains/…/summary.
// Alt tåler 404 (eldre server): da vises lokale data eller en forklaring.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { G as G31 } from './mobile-p31.js';
import * as P35 from './mobile-p35.js';
import { TR } from './mobile-track.js';
import { BD } from './mobile-p24.js';
import { logout } from './mobile-p21.js';

const svg = (d, s = 16, w = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const QR_IC = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2';
const LOCK_IC = 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3';
const OUT_IC = 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9';
const ALL_IC = 'M2 7h13v10H2zM18 9h4v8h-4zM6 20h5';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} };
const MS3 = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'], WD3 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const dLbl = (v) => { const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T12:00:00` : v); return Number.isNaN(+d) ? String(v ?? '') : `${WD3[d.getDay()]} ${d.getDate()}. ${MS3[d.getMonth()]}`; };
const daysTo = (v) => { if (!v) return null; const d = new Date(String(v).slice(0, 10) + 'T12:00:00'), t = new Date(); t.setHours(12, 0, 0, 0); return Math.round((d - t) / 864e5); };
const AVC = ['#2b5d8a', '#b23a2a', '#2f6b45', '#a8661a', '#7a5ad6', '#c2477a', '#3d7f8a'];
const colOf = (s, c) => c || AVC[[...String(s ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVC.length];
const dark = () => document.querySelector('#app .m')?.classList.contains('pd') ?? matchMedia('(prefers-color-scheme: dark)').matches;

/* =====================================================================
   1. AI-svarboblen på Hjem: ✕, sveip opp (> 40 px) og trykk utenfor (fanget)
   ===================================================================== */
export function ansClose(slide = false) {
  if (!G31.ans) return;
  vib(6); haptic('tap');
  const el = document.querySelector('#app .p31-ans');
  const done = () => { G31.ans = null; G31.aid++; draw(); };
  if (slide && el && !reduce()) { el.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1),opacity .2s'; el.style.transform = 'translateY(-160px)'; el.style.opacity = '0'; setTimeout(done, 200); }
  else done();
}
let SW = null;
// Prompt 41 (claude-code-sok-pille-dra-til-chat.md): dra NED fra pillen åpner spørsmålet i Chat. Pillen strekker seg
// (bunnmarg 0,65 × dra, flytter seg 0,35 × dra), håndtaket blir bredere, og «Dra ned …» → «Slipp for å åpne i Chat» ved
// 70 px (lett haptikk begge veier). Etter 70 px gir draget motstand (0,4). Opp lukker som før.
const PULL = 70;
function ansDown(e) {
  const b = e.target.closest?.('#app .p31-ans');
  if (!b || e.target.closest('button:not([data-p31="ansx"]), a, input, select, textarea') || (e.target.closest('button') && b.classList.contains('ready'))) return;
  SW = { y: e.clientY, id: e.pointerId, el: b, dy: 0, over: false };
  b.style.transition = 'none';
}
function ansMove(e) {
  if (!SW || e.pointerId !== SW.id) return;
  const raw = e.clientY - SW.y;
  if (Math.abs(raw) > 4 && !SW.cap) { SW.cap = true; try { SW.el.setPointerCapture(e.pointerId); } catch {} }
  if (raw <= 0) {
    if (SW.down) pullPaint(SW.el, 0, false);
    SW.down = false; SW.dy = raw; SW.el.style.transform = `translateY(${raw}px)`; SW.el.style.opacity = String(Math.max(0, 1 + raw / 120));
  } else {
    const d = raw > PULL ? PULL + (raw - PULL) * 0.4 : raw, over = raw >= PULL;
    SW.down = true; SW.dy = raw; SW.el.style.opacity = '';
    if (over !== SW.over) { SW.over = over; vib(over ? 8 : 4); haptic('tap'); }
    pullPaint(SW.el, d, over);
  }
  if (SW.cap && e.cancelable) e.preventDefault();
}
function pullPaint(el, d, over) {
  el.style.transform = d ? `translateY(${(d * 0.35).toFixed(1)}px)` : '';
  el.style.paddingBottom = d ? `${(14 + d * 0.65).toFixed(1)}px` : '';
  el.classList.toggle('p41-pull', d > 0); el.classList.toggle('p41-over', !!over);
  let h = el.querySelector('.p41-pullt');
  if (d > 0 && !h) { h = document.createElement('span'); h.className = 'p41-pullt'; h.setAttribute('aria-hidden', 'true'); el.appendChild(h); }
  if (h) { h.textContent = over ? 'Slipp for å åpne i Chat' : 'Dra ned for å åpne i Chat'; h.style.opacity = String(Math.min(1, d / 40)); if (!d) h.remove(); }
  const ah = el.querySelector('.p38-ah'); if (ah) ah.style.width = d ? `${Math.min(80, 34 + d * 0.66)}px` : '';
}
function ansUp(e) {
  const s = SW; if (!s || e.pointerId !== s.id) return;
  SW = null;
  if (s.down) {
    ANS_SUP = Date.now();
    if (s.dy >= PULL && G31.ans?.q) { vib(10); globalThis.P41?.pillToChat ? globalThis.P41.pillToChat(s.el, G31.ans) : import('./mobile-chat.js').then((C) => { const q = G31.ans?.q; G31.ans = null; draw(); C.openChat(q ?? ''); }); return; }
    s.el.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1),padding-bottom .25s cubic-bezier(.2,.8,.2,1)'; pullPaint(s.el, 0, false); return;
  }
  if (s.dy < -40) { s.el.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1),opacity .2s'; ansClose(true); ANS_SUP = Date.now(); return; }
  s.el.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1),opacity .25s'; s.el.style.transform = ''; s.el.style.opacity = '';
  if (s.cap) ANS_SUP = Date.now();
}
let ANS_SUP = 0;
/** Trykk utenfor boblen: lukk, og fang trykket så kortet under (f.eks. Vær) ikke åpnes. */
function outsideClick(e) {
  if (!G31.ans || document.documentElement.dataset.ui !== 'mobile' || !document.querySelector('#app .p31-ans')) return;
  const t = e.target;
  if (t.closest?.('.p31-ans')) {
    if (Date.now() - ANS_SUP < 350) { e.preventDefault(); e.stopPropagation(); }
    return;
  }
  if (!t.closest?.('#app') || t.closest('.p29-sf, .p31-toast, .p31-bub')) return; // søkefeltet beholder boblen
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
  ansClose();
}
function outsideMove(e) { if (G31.ans && !G31.ans.busy && document.querySelector('#app .p31-ans') && !e.target.closest?.('.p31-ans') && !SW) ansClose(); }

/* =====================================================================
   2. Now Brief: nye kort og Glimt i prestedrakt
   ===================================================================== */
/** Glimt i prestekjole/alb med rød stola, belte, bibel med ✝ og gylden glorie (fasit: Bibelvers.dc.html → priest). */
export function priest(S = 46, mood = 'idle') {
  const body = P35.fig('glimt', S, mood);
  const r = (n) => Math.round(n * 10) / 10;
  return `<span class="p38-pr" aria-hidden="true" style="width:${S}px;height:${S}px;margin-bottom:${r(S * 0.3)}px">
    <span class="p38-halo" style="top:${r(-S * 0.2)}px;width:${r(S * 0.78)}px;height:${r(S * 0.22)}px;margin-left:${r(-S * 0.39)}px;border-width:${r(S * 0.05)}px;box-shadow:0 0 ${r(S * 0.18)}px rgba(242,193,78,.75)"></span>${body}
    <svg class="p38-robe" width="${r(S * 1.16)}" height="${r(S * 0.62)}" viewBox="0 0 116 62" style="bottom:${r(-S * 0.34)}px;margin-left:${r(-S * 0.58)}px"><path d="M18 8 Q58 22 98 8 L110 58 Q58 66 6 58 Z" fill="#f6f1e7" stroke="#c9bfa9" stroke-width="1.6"/><path d="M44 12 L40 60 L50 60 L54 16 Z" fill="#b23a2a"/><path d="M72 12 L76 60 L66 60 L62 16 Z" fill="#b23a2a"/><path d="M42 34 h8 M66 34 h8" stroke="#f2c14e" stroke-width="2"/><path d="M24 40 Q58 48 92 40" stroke="#a8661a" stroke-width="3" fill="none"/></svg>
    <span class="p38-bk" style="right:${r(-S * 0.16)}px;bottom:${r(-S * 0.2)}px;width:${r(S * 0.36)}px;height:${r(S * 0.28)}px"><span style="font-size:${r(S * 0.16)}px">✝</span></span></span>`;
}

const CARD_IDS = { pk: 'pk', pakker: 'pk', packages: 'pk', fam: 'fam', familie: 'fam', family: 'fam', sk: 'sk', skole: 'sk', school: 'sk', bd: 'bd', bursdager: 'bd', birthdays: 'bd', nl: 'nl', nordlys: 'nl', aurora: 'nl' };
const CARD_N = { pk: 'Pakker', fam: 'Familie', sk: 'Skole og jobb', bd: 'Bursdager', nl: 'Nordlys i natt' };
const CARD_S = { pk: 'Bare når pakker er på vei', fam: 'Bare de som deler posisjon med deg', sk: 'Prøver, frister og møter neste 7 dager', bd: 'De neste 30 dagene', nl: 'Kveld og natt, når Kp ≥ 3' };
const DEF_ORDER = ['pk', 'fam', 'sk', 'bd', 'nl'];
/** Rekkefølge og av/på fra Innstillinger → Glimt → Brief (GET/PUT /api/glimt/settings → cards:[{id, on}]). */
export function cardOrder() {
  const L = Array.isArray(P35.cfg().cards) ? P35.cfg().cards : [];
  const seen = new Set(), out = [];
  for (const c of L) { const id = CARD_IDS[c?.id]; if (id && !seen.has(id)) { seen.add(id); out.push({ id, on: c.on !== false, raw: c.id }); } }
  for (const id of DEF_ORDER) if (!seen.has(id)) out.push({ id, on: true, raw: id });
  return out;
}
const BR = { gift: {}, busy: '' };
function pkItems(x) {
  const P = x?.packages;
  if (Array.isArray(P?.items)) return P.items.map((p) => ({ i: p.logo?.letter ?? p.ini ?? String(p.carrier ?? p.name ?? '?').slice(0, 2).toUpperCase(), img: typeof p.logo === 'string' ? p.logo : p.logo?.url ?? null, c: p.color ?? p.logo?.color ?? colOf(p.carrier), n: p.name ?? '', s: p.status ?? '', r: p.due ?? '', red: !!p.dueRed }));
  if (P && P.count === 0) return [];
  // Eldre server: bare antallet → aktive pakker fra Sporing.
  const L = (TR.data?.items ?? []).filter((p) => !p.archived && p.direction !== 'out' && !['delivered', 'returned'].includes(p.status));
  const rank = (p) => (p.status === 'ready_for_pickup' ? 0 : p.status === 'out_for_delivery' ? 1 : 2);
  return L.sort((a, b) => rank(a) - rank(b)).slice(0, 3).map((p) => {
    const pick = p.pickupPoint?.name ?? p.pickup?.name ?? null, d = daysTo(p.eta);
    return { i: p.carrierIni ?? String(p.carrierName ?? '?').slice(0, 2), img: null, c: p.carrierColor ?? colOf(p.carrier), n: p.title || p.name || p.shop || `Pakke fra ${p.carrierName ?? ''}`,
      s: `${p.statusText ?? ''}${pick ? ` · ${pick}` : ''}`, r: p.status === 'ready_for_pickup' && p.pickup?.deadline ? `Hent innen ${dLbl(p.pickup.deadline)}` : d === 0 ? 'I dag' : d === 1 ? 'I morgen' : d != null && d > 1 ? dLbl(p.eta) : '', red: p.status === 'ready_for_pickup' };
  });
}
function bdItems(x) {
  const B = x?.birthdays;
  if (Array.isArray(B?.items)) return B.items.map((b) => ({ n: b.name, age: b.age, date: b.date, d: b.daysLeft ?? daysTo(b.date), c: b.color }));
  return (BD.d?.items ?? []).filter((b) => b.daysLeft != null && b.daysLeft <= 30).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3).map((b) => ({ n: b.name, age: b.age, date: b.nextDate, d: b.daysLeft, c: b.color }));
}
const head = (n, k, kc = '') => `<div class="p38-bch"><b>${esc(n)}</b><span${kc ? ` style="color:${kc}"` : ''}>${esc(k)}</span></div>`;
const dleft = (d, red) => `<span class="p38-bdl"><b${red ? ' class="red"' : ''}>${d === 0 ? 'I dag' : esc(String(d))}</b>${d === 0 ? '' : `<span>${d === 1 ? 'dag' : 'dager'}</span>`}</span>`;
function cardHtml(id, x) {
  if (id === 'pk') {
    const L = pkItems(x); if (!L.length) return '';
    const n = x?.packages?.count ?? L.length;
    return `<div class="p38-bc" data-gb="pak">${head('Pakker', `${n} PÅ VEI`)}${L.map((p) => `<a class="p38-br" href="#/spor"><span class="p38-lg" style="background:${esc(p.c)}">${p.img ? `<img src="${esc(p.img)}" alt="">` : esc(p.i)}</span><span class="p38-bt"><b>${esc(p.n)}</b><span>${esc(p.s)}</span></span><span class="p38-bm${p.red ? ' red' : ''}">${esc(p.r)}</span></a>`).join('')}</div>`;
  }
  if (id === 'fam') {
    const L = Array.isArray(x?.family?.items) ? x.family.items : []; if (!L.length) return '';
    const DOT = { home: '#2f7a4f', hjemme: '#2f7a4f', moving: '#d9a400', 'på vei': '#d9a400', away: '#2b5d8a', school: '#2b5d8a', work: '#2b5d8a', stale: '#a39d90' };
    return `<div class="p38-bc" data-gb="fam">${head('Familie', L.length > 1 ? 'DELER POSISJON' : 'DELER POSISJON MED DEG')}<div class="p38-fam">${L.slice(0, 6).map((f) => `<a class="p38-fp" href="#/fam"><span class="p38-av" style="background:${esc(colOf(f.name, f.color))}">${f.avatar ? `<img src="${esc(f.avatar)}" alt="">` : esc(String(f.name ?? '?')[0])}<i style="background:${DOT[String(f.state ?? '').toLowerCase()] ?? '#2f7a4f'}"></i></span><span class="p38-bt"><b>${esc(f.name)}</b><span>${esc([f.place, f.since].filter(Boolean).join(' · '))}</span></span></a>`).join('')}</div></div>`;
  }
  if (id === 'sk') {
    const L = Array.isArray(x?.school?.items) ? x.school.items : []; if (!L.length) return '';
    return `<div class="p38-bc" data-gb="sko">${head('Skole og jobb', 'NESTE 7 DAGER')}${L.slice(0, 4).map((s) => { const d = s.daysLeft ?? daysTo(s.date); return `<a class="p38-br" href="#/kal${s.date ? `/${esc(String(s.date).slice(0, 10))}` : ''}"><span class="p38-bar" style="background:${esc(s.color ?? '#2b5d8a')}"></span><span class="p38-bt"><b>${esc(s.kind && !String(s.title).toLowerCase().startsWith(String(s.kind).toLowerCase()) ? `${s.kind === 'prove' ? 'Prøve' : s.kind === 'frist' ? 'Frist' : s.kind} · ${s.title}` : s.title)}</b><span>${esc([s.date ? dLbl(s.date) : '', s.time, s.place].filter(Boolean).join(' · '))}</span></span>${d != null ? dleft(d, s.red ?? d <= 4) : ''}</a>`; }).join('')}</div>`;
  }
  if (id === 'bd') {
    const L = bdItems(x); if (!L.length) return '';
    const f = L[0], done = BR.gift[f.n];
    return `<div class="p38-bc" data-gb="bur">${head('Bursdager', 'NESTE')}${L.map((b) => `<a class="p38-br" href="#/bd"><span class="p38-av" style="background:${esc(colOf(b.n, b.c))}">${esc(String(b.n ?? '?')[0])}</span><span class="p38-bt"><b>${esc(b.n)}</b><span>${esc([b.age != null ? `Fyller ${b.age}` : '', b.date ? dLbl(b.date) : ''].filter(Boolean).join(' · '))}</span></span>${b.d != null ? dleft(b.d, b.d <= 3) : ''}</a>`).join('')}
      <button type="button" class="p38-gift" data-p38="gift" data-n="${esc(f.n)}" data-d="${esc(f.date ?? '')}" ${done || BR.busy === 'gift' ? 'disabled' : ''}>${done ? '✓ Lagt i Gjøremål' : `+ Gave til ${esc(f.n)} i Gjøremål`}</button></div>`;
  }
  if (id === 'nl') {
    const A = x?.aurora; if (!A || A.show === false || A.kp == null) return '';
    const kp = Number(A.kp), cl = A.cloud == null ? '–' : `${Math.round(A.cloud)} %`;
    return `<div class="p38-bc p38-nl" data-gb="nor">${head('Nordlys i natt', `KP ${String(kp).replace('.', ',')} · ${kp >= 4 ? 'GODE' : 'MULIGE'} SJANSER`, '#bff5df')}<span class="p38-nlt">${esc(A.text ?? '')}</span>
      <div class="p38-nls">${[['KP-INDEKS', String(kp).replace('.', ',')], ['SKYDEKKE', cl], ['BEST', A.best ?? '–']].map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div><span class="p38-nlf">Kilde: NOAA SWPC · MET (skydekke)</span></div>`;
  }
  return '';
}
/** Kortene etter Abonnementer og før Nyheter, i rekkefølgen fra innstillingene. x = rådata fra /api/brief. */
export function briefCards(x) {
  return cardOrder().filter((c) => c.on).map((c) => cardHtml(c.id, x)).join('');
}
/** Innstillinger → Glimt → KORT I BRIEFEN: av/på og rekkefølge (▲▼). */
export function cardsCfg() {
  const L = cardOrder();
  return `<span class="p35-lab">KORT I BRIEFEN</span><div class="p35-list">${L.map((c, i) => `<div class="p35-row p38-crow"><button type="button" class="p35-rt" data-p38="ctog" data-k="${c.id}" role="switch" aria-checked="${c.on}"><b>${esc(CARD_N[c.id])}</b><span>${esc(CARD_S[c.id])}</span></button>
    <span class="p38-mv"><button type="button" data-p38="cup" data-k="${c.id}" ${i ? '' : 'disabled'} aria-label="Flytt ${esc(CARD_N[c.id])} opp">▲</button><button type="button" data-p38="cdn" data-k="${c.id}" ${i < L.length - 1 ? '' : 'disabled'} aria-label="Flytt ${esc(CARD_N[c.id])} ned">▼</button></span>
    <button type="button" class="p38-swb" data-p38="ctog" data-k="${c.id}" role="switch" aria-checked="${c.on}" aria-label="${esc(CARD_N[c.id])}"><span class="p35-sw${c.on ? ' on' : ''}" aria-hidden="true"><i></i></span></button></div>`).join('')}</div>
    <span class="p35-note">Kortene vises etter Abonnementer i briefen, og Glimt leser dem opp i denne rekkefølgen. Nordlys-varselet kl. 20 kommer når Kp ≥ 4 og skydekket er under 40 %.</span>`;
}
function cardsPut(L) { P35.cfgPut({ cards: L.map(({ raw, id, on }) => ({ id: raw && CARD_IDS[raw] === id ? raw : id, on })) }); }

/* =====================================================================
   3. Konto → ØKT: Lås skjermen, Logg ut, Logg ut av alle enheter (+ Logg inn på ny enhet)
   ===================================================================== */
const K = { sheet: null, err: '', busy: false, sessions: null, sT: 0 };
async function sessionsLoad() {
  if (Date.now() - K.sT < 30e3) return; K.sT = Date.now();
  try { const r = await hlApi('/me/sessions'); K.sessions = r?.count ?? (Array.isArray(r?.items) ? r.items.length : Array.isArray(r) ? r.length : null); draw(); } catch { K.sessions = null; }
}
const rowIc = (d, c) => `<span class="set-ic fill" style="background:${c}">${svg(d, 17, 2.2).replace('stroke="currentColor"', 'stroke="#fff"')}</span>`;
/** Rad i Konto: «Logg inn på ny enhet». */
export const qrRow = () => `<button class="opt-row" data-p38="qropen"><span class="set-ic fill" style="background:#2b5d8a">${svg(QR_IC, 17, 2.2).replace('stroke="currentColor"', 'stroke="#fff"')}</span><span class="m-grow">Logg inn på ny enhet<br><span style="font-size:13px;opacity:.65">Skann QR-koden på skjermen</span></span><span style="opacity:.5">›</span></button>`;
/** Seksjonen ØKT nederst i Konto (G = gruppefunksjonen i mobile-set.js). */
export function oktGroup(G) {
  sessionsLoad();
  const n = K.sessions;
  return G('Økt', [
    `<button class="opt-row" data-p38="lock">${rowIc(LOCK_IC, '#2b5d8a')}<span class="m-grow">Lås skjermen<br><span style="font-size:13px;opacity:.65">Krever passord${webauthnOk() ? ' eller Face ID' : ''} for å fortsette</span></span></button>`,
    `<button class="opt-row" data-p38="out">${rowIc(OUT_IC, '#b23a2a')}<span class="m-grow" style="color:#b23a2a;font-weight:600">Logg ut</span></button>`,
    `<button class="opt-row" data-p38="outall">${rowIc(ALL_IC, '#8a6a4a')}<span class="m-grow">Logg ut av alle enheter<br><span style="font-size:13px;opacity:.65">${n != null ? `${n} ${n === 1 ? 'aktiv økt' : 'aktive økter'} · ` : ''}krever passord</span></span></button>`,
  ], 'Lås skjermen låser appen med en gang. Logg ut av alle enheter avslutter alle økter, også denne.');
}
function sheetHtml() {
  const s = K.sheet; if (!s) return '';
  const pw = (lbl) => `<label class="p38-pw"><span>${lbl}</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>`;
  let body = '';
  if (s === 'out') body = `<b class="p38-sht">Logge ut?</b><span class="p38-shs">Logge ut av Homelab på denne enheten?</span><button type="button" class="p38-ink red" data-p38="outgo">Logg ut</button><button type="button" class="p38-gh" data-p38="shx">Avbryt</button>`;
  else if (s === 'outall') body = `<form data-p38f="outall" class="p38-shf"><b class="p38-sht">Logg ut av alle enheter?</b><span class="p38-shs">Alle økter avsluttes${K.sessions != null ? ` (${K.sessions} ${K.sessions === 1 ? 'enhet' : 'enheter'})` : ''}, også denne. Apper med token må logge inn på nytt.</span>${pw('BEKREFT MED PASSORD')}${K.err ? `<span class="p38-err" role="alert">${esc(K.err)}</span>` : ''}<button type="submit" class="p38-ink red" ${K.busy ? 'disabled' : ''}>${K.busy ? 'Logger ut …' : 'Logg ut av alle'}</button><button type="button" class="p38-gh" data-p38="shx">Avbryt</button></form>`;
  else if (s === 'qr') body = qrSheet();
  if (!body) return '';
  return `<div class="p38-shb" data-p38="shx"></div><div class="p38-sh" role="dialog" aria-modal="true" aria-label="${s === 'qr' ? 'Logge inn på ny enhet' : 'Logg ut'}"><span class="p38-grab" aria-hidden="true"></span>${body}</div>`;
}
/** Lag i draw(): arkene (logg ut, alle enheter, godkjenn QR). */
export const layer38 = () => sheetHtml();

/* ---------- Lås skjermen (lokalt overlegg; låses opp med passord via /api/auth/reauth, eller passkey) ---------- */
const webauthnOk = () => !!(window.PublicKeyCredential && window.isSecureContext && lsGet('p38_cred'));
let lockEl = null;
export function lockShow() {
  ssSet('p38_lock', '1');
  if (lockEl) return;
  lockEl = document.createElement('div');
  lockEl.className = `p38-lock${dark() ? ' pd' : ''}`; lockEl.setAttribute('role', 'dialog'); lockEl.setAttribute('aria-modal', 'true'); lockEl.setAttribute('aria-label', 'Låst');
  const nm = m.me?.name ?? 'Homelab', av = m.me?.avatarUrl;
  lockEl.innerHTML = `<div class="p38-lin"><span class="p38-lav">${av ? `<img src="${esc(av)}" alt="">` : esc(String(nm)[0] ?? 'H')}</span><b>Låst</b><span>${esc(nm)}${m.me?.username ? ` · @${esc(m.me.username)}` : ''}</span>
    <form class="p38-lf"><input type="password" name="password" autocomplete="current-password" placeholder="Passord" aria-label="Passord"><button type="submit">Lås opp</button></form>
    ${webauthnOk() ? '<button type="button" class="p38-lbio" data-l="bio">Lås opp med Face ID</button>' : ''}<span class="p38-lerr" role="alert"></span>
    <button type="button" class="p38-lout" data-l="out">Logg ut</button></div>`;
  document.body.appendChild(lockEl);
  document.documentElement.classList.add('p38-locked');
  const err = lockEl.querySelector('.p38-lerr');
  lockEl.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = e.target.password.value; if (!pw) return;
    try { await hlApi('/auth/reauth', { method: 'POST', json: { password: pw } }); lockHide(); haptic('ok'); }
    catch (x) {
      if (x.status === 404) { lockHide(); return; } // eldre server: ingen kontroll mulig
      if (x.status === 401 && /innlogg/i.test(x.message)) { location.href = '/login?next=/finans/'; return; }
      err.textContent = x.status === 429 ? 'For mange forsøk. Vent litt.' : 'Feil passord'; haptic('err'); e.target.password.value = '';
    }
  });
  lockEl.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-l]')?.dataset.l;
    if (k === 'out') logout();
    if (k === 'bio') { if (await bioCheck()) { lockHide(); haptic('ok'); } else err.textContent = 'Face ID ble avbrutt. Bruk passordet.'; }
  });
  setTimeout(() => lockEl?.querySelector('input')?.focus(), 60);
}
function lockHide() { ssSet('p38_lock', null); document.documentElement.classList.remove('p38-locked'); lockEl?.remove(); lockEl = null; }

/* ---------- Biometri: plattform-passkey (WebAuthn) når den finnes; ellers passord (/api/auth/reauth) ---------- */
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function bioAvail() { try { return !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; } }
/** Lokal brukerverifisering (Face ID / Touch ID / fingeravtrykk). Første gang lages en passkey på enheten. */
async function bioCheck() {
  if (!(await bioAvail())) return false;
  const id = lsGet('p38_cred');
  try {
    if (id) { await navigator.credentials.get({ publicKey: { challenge: rnd(32), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60000 } }); return true; }
    const c = await navigator.credentials.create({ publicKey: { challenge: rnd(32), rp: { name: 'Homelab', id: location.hostname }, user: { id: rnd(16), name: m.me?.username ?? 'homelab', displayName: m.me?.name ?? 'Homelab' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
    if (c?.rawId) lsSet('p38_cred', b64(c.rawId));
    return !!c;
  } catch { return false; }
}

/* =====================================================================
   4. Logg inn på ny enhet: QR-skanner og godkjenn-ark med matchkode
   ===================================================================== */
const Q = { st: null, info: null, code: '', err: '', busy: false, bio: null, needPw: false, res: null };
/** «sid.nonce» fra en skannet URL (https://…/l/<sid>.<nonce>), en deep link (homelab://login?c=…) eller limt inn tekst. */
export function qrCode(raw) {
  const s = String(raw ?? '').trim();
  const m1 = s.match(/[?&]c=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/) ?? s.match(/\/l\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/) ?? s.match(/^([A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,})$/);
  return m1 ? m1[1] : null;
}
let camEl = null, camStream = null, scanT = null;
function camStop() { clearTimeout(scanT); scanT = null; camStream?.getTracks().forEach((t) => t.stop()); camStream = null; camEl?.remove(); camEl = null; document.documentElement.classList.remove('p38-camon'); }
export async function qrOpen() {
  camStop(); Q.st = 'cam'; Q.err = ''; Q.info = null; Q.res = null;
  camEl = document.createElement('div');
  camEl.className = 'p38-cam'; camEl.setAttribute('role', 'dialog'); camEl.setAttribute('aria-modal', 'true'); camEl.setAttribute('aria-label', 'Skann QR-kode');
  const hasBD = 'BarcodeDetector' in window, canCam = !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  camEl.innerHTML = `<video autoplay playsinline muted></video><div class="p38-ctop"><button type="button" data-c="x" aria-label="Lukk">${svg('M6 6l12 12M18 6L6 18', 20, 2.6)}</button><b>Logg inn på ny enhet</b><span></span></div>
    <div class="p38-cfr"><i></i>${reduce() ? '' : '<span class="p38-cln"></span>'}</div>
    <div class="p38-cmsg">${canCam && hasBD ? 'Hold mobilen over QR-koden på den nye skjermen' : canCam ? 'Denne nettleseren kan ikke lese QR-koder selv. Skann med kameraet på telefonen, eller lim inn koden under.' : 'Kameraet krever https. Skann med kameraet på telefonen, eller lim inn koden under.'}</div>
    <form class="p38-cpaste"><input name="c" placeholder="Lim inn kode eller lenke" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Kode fra den nye enheten"><button type="submit">Bruk</button></form>`;
  document.body.appendChild(camEl); document.documentElement.classList.add('p38-camon');
  const video = camEl.querySelector('video'), msg = camEl.querySelector('.p38-cmsg');
  camEl.addEventListener('click', (e) => { if (e.target.closest('[data-c="x"]')) { camStop(); Q.st = null; draw(); } });
  camEl.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = qrCode(e.target.c.value);
    if (!c) { msg.textContent = 'Fant ingen gyldig kode. Den ser ut som «abc123.xyz789» eller en lenke med /l/.'; haptic('err'); return; }
    camStop(); qrScan(c);
  });
  if (!canCam) return;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (!camEl) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; return; }
    video.srcObject = camStream;
  } catch { msg.textContent = 'Fikk ikke tilgang til kameraet. Lim inn koden under.'; return; }
  if (!hasBD) return;
  let det = null; try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { return; }
  const loop = async () => {
    if (!camEl || !det) return;
    try {
      if (video.readyState >= 2) {
        const r = await det.detect(video);
        const c = r.map((x) => qrCode(x.rawValue)).find(Boolean);
        if (c) { vib(12); camStop(); qrScan(c); return; }
        if (r.length) msg.textContent = 'Det er ikke en Homelab-innloggingskode.';
      }
    } catch {}
    scanT = setTimeout(loop, 250);
  };
  loop();
}
/** POST /api/auth/qr/scan {code} → {sid, device:{name, os, browser, ip, place}, account, match}. */
export async function qrScan(code) {
  Q.code = code; Q.st = 'ask'; Q.busy = true; Q.err = ''; Q.info = null; Q.needPw = false; K.sheet = 'qr'; draw();
  Q.bio = await bioAvail();
  try { Q.info = await hlApi('/auth/qr/scan', { method: 'POST', json: { code } }); }
  catch (e) { Q.err = e.status === 404 ? 'QR-innlogging finnes ikke på serveren ennå. Oppdater Homelab.' : e.status === 410 ? 'Koden er utløpt. Den nye skjermen viser en ny kode – skann igjen.' : e.status === 429 ? 'For mange forsøk. Vent litt.' : e.message; haptic('err'); }
  Q.busy = false; draw();
}
function qrSheet() {
  if (Q.st === 'done') {
    const two = Q.res?.needs2fa;
    return `<span class="p38-ok">✓</span><b class="p38-sht c">${two ? 'Godkjent' : 'Logget inn'}</b><span class="p38-shs c">${two ? 'Skriv koden fra autentiseringsappen på den nye enheten.' : `${esc(devName(Q.info?.device) || 'Enheten')} er lagt til under Pålitelige enheter.`}</span><button type="button" class="p38-ink" data-p38="shx">Ferdig</button>`;
  }
  if (Q.st === 'denied') return `<b class="p38-sht">Innloggingen ble avvist</b><span class="p38-shs">Den nye enheten får ikke tilgang. Den viser en ny kode.</span><button type="button" class="p38-ink" data-p38="shx">Lukk</button>`;
  if (Q.busy && !Q.info) return `<b class="p38-sht">Logge inn på ny enhet?</b><div class="m-spin"></div>`;
  if (!Q.info) return `<b class="p38-sht">Logge inn på ny enhet?</b><span class="p38-err" role="alert">${esc(Q.err || 'Fant ikke innloggingen.')}</span><button type="button" class="p38-ink" data-p38="qropen">Skann igjen</button><button type="button" class="p38-gh" data-p38="shx">Lukk</button>`;
  const I = Q.info, D = I.device ?? {}, match = String(I.match ?? '');
  const acc = typeof I.account === 'string' ? I.account : I.account?.name ?? I.account?.username ?? m.me?.name ?? '';
  const rows = [['Enhet', devName(D) || 'Ukjent enhet'], ['Sted', [D.place, D.ip].filter(Boolean).join(' · ') || '–'], ['Konto', acc]];
  return `<b class="p38-sht">Logge inn på ny enhet?</b>
    <div class="p38-qi">${rows.map(([k, v]) => `<span><span>${k}</span><b>${esc(v)}</b></span>`).join('')}<span><span>Kode</span><b class="p38-mono">${esc(match)}</b></span></div>
    <div class="p38-match" aria-label="Matchkode ${esc(match.split('').join(' '))}">${match.split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div>
    <span class="p38-shs">Sjekk at tallene ${esc(match)} også står på den nye skjermen. Godkjenn bare hvis det er deg.</span>
    ${Q.needPw ? `<form data-p38f="qrpw" class="p38-shf"><label class="p38-pw"><span>BEKREFT MED PASSORD</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>${Q.err ? `<span class="p38-err" role="alert">${esc(Q.err)}</span>` : ''}<button type="submit" class="p38-ink" ${Q.busy ? 'disabled' : ''}>${Q.busy ? 'Godkjenner …' : 'Godkjenn'}</button></form>`
    : `${Q.err ? `<span class="p38-err" role="alert">${esc(Q.err)}</span>` : ''}<button type="button" class="p38-ink" data-p38="qrok" ${Q.busy ? 'disabled' : ''}>${Q.busy ? 'Godkjenner …' : Q.bio ? 'Godkjenn med Face ID' : 'Godkjenn med passord'}</button>`}
    <button type="button" class="p38-gh red" data-p38="qrno" ${Q.busy ? 'disabled' : ''}>Avvis</button>`;
}
const devName = (D) => (D ? [D.name, D.browser].filter(Boolean).join(' · ') || D.os || '' : '');
async function qrApprove(extra = {}) {
  Q.busy = true; Q.err = ''; draw();
  try {
    Q.res = await hlApi('/auth/qr/approve', { method: 'POST', json: { sid: Q.info?.sid, approve: true, biometric: true, ...extra } });
    Q.st = 'done'; haptic('ok');
  } catch (e) { Q.err = e.status === 410 ? 'Koden er utløpt. Skann den nye koden.' : e.status === 403 ? 'Bekreftelsen ble ikke godtatt.' : e.message; haptic('err'); }
  Q.busy = false; draw();
}

/* =====================================================================
   5. Domener: Glimt-oppsummering (✦-knappen nede til høyre) og forhåndshenting
   ===================================================================== */
export const DG = { open: false, d: {}, busy: '', err: '' };
const sumKey = (d) => (d === '*' || !d ? '*' : d);
export async function domSumLoad(d, make = false) {
  const k = sumKey(d);
  if (DG.busy === k) return;
  DG.busy = k; DG.err = ''; draw();
  try { DG.d[k] = await hlApi(`/domains/${encodeURIComponent(k)}/summary`, make ? { method: 'POST', json: {} } : {}); }
  catch (e) { DG.err = e.status === 404 ? 'Glimt-oppsummering finnes ikke på serveren ennå.' : e.message; }
  DG.busy = ''; draw();
}
/** Kortet øverst på Domener → Oversikt. sel = valgt domene (eller «*»). */
export function domGlimt(sel) {
  const k = sumKey(sel), S = DG.d[k], busy = DG.busy === k;
  if (!DG.open) return `<div class="p38-dgc"><button type="button" class="p38-dgo" data-p38="dgopen"><span>GLIMT</span>${S ? 'Dagens oppsummering er klar ›' : 'Vis oppsummering av siste døgn'}</button></div>`;
  const pts = Array.isArray(S?.pts) ? S.pts : [];
  return `<section class="pp-card p38-dg" aria-live="polite"><div class="p38-dgh"><span class="p38-dgm">${P35.fig('glimt', 34, busy ? 'talk' : 'idle')}</span><span class="m-grow"><span class="p38-dgk">GLIMT · OPPSUMMERING</span><span class="p38-dgt">${esc(S?.meta ?? (k === '*' ? 'Alle domener' : k))}</span></span>
      <button type="button" class="p38-dgb" data-p38="dgnew" ${busy ? 'disabled' : ''}>${svg('M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', 14, 2.4)}${busy ? 'Lager …' : 'Lag ny'}</button><button type="button" class="p38-dgx" data-p38="dgclose" aria-label="Skjul oppsummering">${svg('M6 15l6-6 6 6', 14, 2.6)}</button></div>
    ${busy && !S ? '<div class="p38-sk"><i style="width:80%"></i><i></i><i style="width:60%"></i></div>' : S ? `<b class="p38-dghd">${esc(S.head ?? '')}</b><div class="p38-dgp">${pts.map((p) => `<span><i style="background:${esc(p.color ?? '#8f897c')}"></i>${esc(p.t ?? p)}</span>`).join('')}</div>` : `<span class="pp-mut">${esc(DG.err || 'Ingen oppsummering ennå.')}</span>`}</section>`;
}
/** ✦-knappen: åpne Oversikt, åpne oppsummeringen (lag den om dagens mangler) og rull til toppen. */
export function domGlimtGo(sel) {
  vib(8); haptic('tap');
  DG.open = true;
  if (location.hash !== '#/dom') location.replace('#/dom');
  const k = sumKey(sel);
  if (!DG.d[k]) domSumLoad(k); else draw();
  setTimeout(() => window.scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' }), 60);
}

/* =====================================================================
   Hendelser
   ===================================================================== */
export async function bind38(e, t) {
  const x = t.closest?.('[data-p38]'); if (!x) return false;
  const a = x.dataset.p38;
  e.preventDefault(); e.stopPropagation?.();
  switch (a) {
    case 'shx': if (Q.st === 'ask' && Q.info && !Q.busy) hlApi('/auth/qr/approve', { method: 'POST', json: { sid: Q.info.sid, approve: false } }).catch(() => {}); K.sheet = null; K.err = ''; Q.st = null; draw(); return true;
    case 'lock': haptic('tap'); lockShow(); return true;
    case 'out': K.sheet = 'out'; draw(); return true;
    case 'outgo': await logout(); return true;
    case 'outall': K.sheet = 'outall'; K.err = ''; draw(); return true;
    case 'qropen': K.sheet = null; draw(); qrOpen(); return true;
    case 'qrok': {
      if (Q.bio) { if (await bioCheck()) return qrApprove(), true; Q.err = 'Face ID ble avbrutt. Bekreft med passord.'; }
      Q.needPw = true; draw(); return true;
    }
    case 'qrno': Q.busy = true; draw(); try { await hlApi('/auth/qr/approve', { method: 'POST', json: { sid: Q.info?.sid, approve: false } }); } catch {} Q.busy = false; Q.st = 'denied'; haptic('tap'); draw(); return true;
    case 'gift': {
      const n = x.dataset.n, d = x.dataset.d; BR.busy = 'gift'; draw();
      try { await hlApi('/brief/gift', { method: 'POST', json: { name: n, date: d } }); BR.gift[n] = true; flash(`✓ «Kjøp gave til ${n}» er lagt i Gjøremål`); }
      catch (err) { flash(err.status === 404 ? 'Serveren kan ikke legge til gaver ennå' : err.message, 'err'); }
      BR.busy = ''; draw(); return true;
    }
    case 'ctog': case 'cup': case 'cdn': {
      const L = cardOrder(), i = L.findIndex((c) => c.id === x.dataset.k); if (i < 0) return true;
      if (a === 'ctog') L[i].on = !L[i].on;
      else { const j = a === 'cup' ? i - 1 : i + 1; if (j < 0 || j >= L.length) return true; [L[i], L[j]] = [L[j], L[i]]; }
      haptic('tab'); cardsPut(L); return true;
    }
    case 'dgopen': DG.open = true; { const s = domSel(); if (!DG.d[sumKey(s)]) domSumLoad(s); else draw(); } return true;
    case 'dgclose': DG.open = false; draw(); return true;
    case 'dgnew': domSumLoad(domSel(), true); return true;
    case 'domg': domGlimtGo(domSel()); return true;
  }
  return false;
}
let SELF = () => '*';
const domSel = () => SELF();
/** mobile-mods.js sier hvilket domene som er valgt. */
export const domSelHook = (fn) => { SELF = fn; };
export async function submit38(e, t) {
  const f = t.dataset?.p38f; if (!f) return false;
  e.preventDefault();
  const pw = t.password?.value ?? '';
  if (f === 'outall') {
    K.busy = true; K.err = ''; draw();
    try {
      const r = await hlApi('/auth/logout-all', { method: 'POST', json: { password: pw } });
      flash(`Logget ut av ${r?.count ?? 'alle'} ${r?.count === 1 ? 'enhet' : 'enheter'}`);
      setTimeout(() => logout(), 600);
    } catch (err) { K.err = err.status === 404 ? 'Serveren støtter ikke dette ennå. Oppdater Homelab.' : err.status === 401 || err.status === 403 ? 'Feil passord' : err.status === 429 ? 'For mange forsøk. Vent litt.' : err.message; haptic('err'); }
    K.busy = false; draw(); return true;
  }
  if (f === 'qrpw') {
    Q.busy = true; Q.err = ''; draw();
    let tok = null;
    try { tok = (await hlApi('/auth/reauth', { method: 'POST', json: { password: pw } }))?.reauthToken ?? null; }
    catch (err) { Q.busy = false; Q.err = err.status === 429 ? 'For mange forsøk. Vent litt.' : 'Feil passord'; haptic('err'); draw(); return true; }
    Q.busy = false;
    await qrApprove(tok ? { reauthToken: tok } : {});
    return true;
  }
  return false;
}
/** route(): #/l/<sid>.<nonce> eller #/login?c=… (fra systemkameraet / universal link) åpner godkjenn-arket. */
export function route38(hash) {
  const h = String(hash ?? '');
  if (!/^#\/?(l\/|login\?|qr)/.test(h)) return false;
  const c = qrCode(h.replace(/^#\/?/, '/'));
  history.replaceState(null, '', '#/set/konto');
  if (c) setTimeout(() => qrScan(c), 0); else setTimeout(() => qrOpen(), 0);
  return true;
}
export function boot38() {
  document.addEventListener('click', outsideClick, true);
  document.addEventListener('touchmove', outsideMove, { capture: true, passive: true });
  document.addEventListener('wheel', outsideMove, { capture: true, passive: true });
  document.addEventListener('pointerdown', ansDown, true);
  document.addEventListener('pointermove', ansMove, { capture: true, passive: false });
  document.addEventListener('pointerup', ansUp, true);
  document.addEventListener('pointercancel', ansUp, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (G31.ans && m.screen === 'hl') ansClose(); else if (K.sheet) { K.sheet = null; draw(); } } });
  if (ssGet('p38_lock') === '1') lockShow();
  // Domener: forhåndshent når appen er ledig og når den kommer tilbake (maks hvert 5. min), bare for admin.
  let tries = 0;
  const pre = () => import('./mobile.js').then((M) => { if (!m.me) { if (tries++ < 5) setTimeout(pre, 3000); return; } if (M.domOk()) return import('./mobile-mods.js').then((x) => x.domPrefetch()); }).catch(() => {});
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 2500));
  setTimeout(() => idle(pre, { timeout: 6000 }), 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) idle(pre, { timeout: 4000 }); });
}
