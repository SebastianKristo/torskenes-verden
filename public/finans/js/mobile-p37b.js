// Prompt 37 (PWA37), del 2: bibelvers, onboarding med profil, «hvor er X», Pakker-widgeten «bare når det er pakker»,
// gratis prøveperioder og delte abonnementer i Subscription OS, og husstandens sporingsnøkkel.
// Fasit: design_handoff_homelab/prompts/prompt-37-pakke/design/Bibelvers.dc.html (brief/home/page), Onboarding.dc.html,
// Subscription OS.dc.html (trVals, soVals, esh, mv), Mobil Papir App.dc.html (whereIs, h2o/h2Menu, goSet).
// API (kontrakt 37, SERVER37): /api/bible/today|next|settings|stats|read, /api/profiles, /api/onboarding/link,
// /api/assist → intent:'family.where', /api/tracking/keys, PUT /finans/api/subscriptions/:id/members, …/:id/leave.
// Alt tåler 404 (eldre server): da brukes lokale data og lokale vers (Bibelen 1930, fri bruk).
import { esc, hlApi, api } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

import * as P38 from './mobile-p38.js'; // prompt 38: Glimt i prestedrakt
import { TT as TT35 } from './mobile-p35.js';
const TTalk = () => TT35?.who != null;

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => iso(new Date());
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const svg = (d, s = 16, w = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const X_IC = svg('M6 6l12 12M18 6L6 18', 15, 2.8);
const MS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], WD = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const MS3 = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'], WD3 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const first = (s) => String(s ?? '').split(/\s+/)[0];
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a');
const AVC = ['#2b5d8a', '#b23a2a', '#2f6b45', '#a8661a', '#7a5ad6', '#c2477a', '#3d7f8a'];
const colOf = (id, c) => c || AVC[[...String(id ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVC.length];

/* =====================================================================
   1. Dagens bibelvers (bare brukere med modulen; standard bare sebastian)
   ===================================================================== */
// Lokal reserve (Bibelen 1930). Serveren har ≥ 365 + 365 vers og velger deterministisk per dag og periode.
const VERS = [
  ['Det er Herrens miskunn at det ikke er ute med oss; for hans barmhjertighet har ennu ikke ende; den er ny hver morgen, din trofasthet er stor.', 'Klagesangene 3,22–23', 'm'],
  ['Dette er dagen som Herren har gjort; la oss fryde og glede oss på den!', 'Salme 118,24', 'm'],
  ['Alt formår jeg i ham som gjør mig sterk.', 'Filipperne 4,13', 'm'],
  ['Frykt ikke, for jeg er med dig; se dig ikke engstelig om, for jeg er din Gud; jeg styrker dig, ja, jeg hjelper dig.', 'Jesaja 41,10', 'm'],
  ['Herren er min hyrde, jeg skal intet mangle.', 'Salme 23,1', 'm'],
  ['Overlat din vei til Herren og stol på ham, så skal han gjøre det.', 'Salme 37,5', 'm'],
  ['Men de som venter på Herren, får ny kraft, de løfter vingene som ørner.', 'Jesaja 40,31', 'm'],
  ['I fred vil jeg både legge mig ned og sove; for du, Herre, du alene lar mig bo i trygghet.', 'Salme 4,9', 'k'],
  ['Kom til mig, alle I som strever og har tungt å bære, og jeg vil gi eder hvile!', 'Matteus 11,28', 'k'],
  ['Kast all eders bekymring på ham! for han har omsorg for eder.', '1. Peter 5,7', 'k'],
  ['For så har Gud elsket verden at han gav sin Sønn, den enbårne, forat hver den som tror på ham, ikke skal fortapes, men ha evig liv.', 'Johannes 3,16', 'k'],
  ['Fred efterlater jeg eder, min fred gir jeg eder.', 'Johannes 14,27', 'k'],
  ['Herren skal bevare din utgang og din inngang fra nu og inntil evig tid.', 'Salme 121,8', 'k'],
];
export const BB = { set: null, setT: 0, miss: false, v: {}, vT: {}, off: 0, stats: null, statT: 0, copied: false, sheet: false, ex: null, plan: null, sw: null, moved: 0, ph: '', rt: null, seen: 0, visT: 0 };
const per = (h = new Date().getHours()) => (h >= 5 && h < 15 ? 'm' : 'k');
const isSebastian = () => String(m.me?.username ?? '').toLowerCase() === 'sebastian';
/** Har brukeren modulen? Serveren bestemmer (enabled); eldre server: bare brukernavnet sebastian. */
export function bibleOn() {
  if (!BB.set && !BB.miss && Date.now() - BB.setT > 30e3) bibleSetLoad();
  if (BB.set) return BB.set.enabled === true;
  return BB.miss ? isSebastian() : false;
}
async function bibleSetLoad() {
  BB.setT = Date.now();
  try { BB.set = await hlApi('/bible/settings'); BB.miss = false; }
  catch (e) { if (e.status === 404 || e.status === 405) BB.miss = true; else if (e.status === 403) BB.set = { enabled: false }; }
  draw();
}
function localPick(p, off = 0) {
  const d = new Date(), day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5), L = VERS.filter((x) => x[2] === p);
  const x = L[(day + off) % L.length];
  return { text: x[0], ref: x[1], period: p, context: { before: [], after: [] }, translation: '1930', local: true };
}
/** Dagens vers for perioden (m/k), fra serveren hvis den har det. off > 0 = «↻ nytt vers» bare for denne visningen. */
export function verse(p = per(), off = BB.off) {
  const k = `${todayIso()}|${p}|${off}`;
  if (BB.v[k]) return BB.v[k];
  if (!BB.vT[k]) {
    BB.vT[k] = 1;
    const q = off ? `/bible/next?offset=${off}&period=${p === 'm' ? 'morning' : 'evening'}` : `/bible/today?period=${p === 'm' ? 'morning' : 'evening'}`;
    hlApi(q).then((r) => { if (r?.text) { BB.v[k] = { ...r, period: p }; draw(); } else if (r?.enabled === false) { BB.set = { ...(BB.set ?? {}), enabled: false }; draw(); } }).catch(() => {});
  }
  return localPick(p, off);
}
const dateLbl = () => { const d = new Date(); return `${WD[d.getDay()]} ${d.getDate()}. ${MS[d.getMonth()]}`; };
const look = (p) => (p === 'm'
  ? { bg: 'linear-gradient(160deg,#fbe9d6 0%,#f6d6b8 100%)', fg: '#3b2a1a', lab: '#b23a2a', mut: '#8a6a4a', chip: 'rgba(59,42,26,.08)', glow: 'radial-gradient(closest-side,rgba(255,200,120,.55),transparent)', kick: 'MORGENVERS · GLIMT' }
  : { bg: 'linear-gradient(160deg,#1f2b4a 0%,#2b2350 100%)', fg: '#f3efe6', lab: '#ffd9c2', mut: 'rgba(243,239,230,.6)', chip: 'rgba(255,255,255,.12)', glow: 'radial-gradient(closest-side,rgba(255,231,168,.25),transparent)', kick: 'KVELDSVERS · GLIMT' });
// bibel_home = {d, read, gone, s}: lest (ny økt skjuler den) eller sveipet bort (resten av dagen nederst i briefen).
const SESS = 'bibel_sess';
const sess = () => { let s = ssGet(SESS); if (!s) { s = String(Date.now()); ssSet(SESS, s); } return s; };
const homeSt = () => { const v = lsGet('bibel_home', null); return v && v.d === todayIso() ? v : null; };
export const hiddenHome = () => { const v = homeSt(); if (!v) return false; if (v.gone) return true; return !!(v.read && v.s !== sess()); };
const bibleAfter = () => { const v = homeSt(); return !!(v && (v.read || v.gone)); };
/** Brief-kortet. place: 'top' (morgen 05–11, kveld 17–05, før det er lest) eller 'bottom' (resten av dagen). */
export function bibleBrief(place) {
  if (!bibleOn()) return '';
  const h = new Date().getHours(), after = bibleAfter();
  if (place === 'top' && (after || (h >= 11 && h < 17))) return '';
  if (place === 'bottom' && !after) return '';
  const p = h >= 5 && h < 17 ? 'm' : 'k';
  if (place === 'top' && BB.set && BB.set[p === 'm' ? 'morning' : 'evening'] === false) return '';
  const v = verse(p), L = look(p);
  // Prompt 40 (claude-code-brief-bibel-trykk.md): hele kortet åpner Bibel-siden (mobile-p40.js tar trykket).
  return `<div class="p37-bv p40-bvo" data-gb="bibel" data-p40="bibel" role="button" tabindex="0" aria-label="Åpne Bibel" style="background:${L.bg};color:${L.fg}"><i class="p37-bvg" style="background:${L.glow}"></i>
    <div class="p37-bvh p38-bvh"><span class="p38-bvk"><span style="color:${L.lab}">${L.kick}</span><span style="color:${L.mut}">${esc(dateLbl())}</span></span><span class="p38-bvf">${P38.priest(46, TTalk() ? 'talk' : 'idle') /* prompt 38: Glimt i prestedrakt */}</span></div>
    <span class="p37-bvt">«${esc(v.text)}»</span>
    <div class="p37-bvf"><b>${esc(v.ref)}</b><span><button type="button" style="background:${L.chip};color:${L.fg}" data-p37b="bcopy">${BB.copied ? 'Kopiert' : 'Kopier'}</button><button type="button" class="ic" style="background:${L.chip};color:${L.fg}" data-p37b="bnext" aria-label="Nytt vers">${svg('M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', 14, 2.4)}</button></span></div></div>`;
}
export const bibleSay = () => { if (!bibleOn() || bibleAfter()) return ''; const v = verse(new Date().getHours() < 17 && new Date().getHours() >= 5 ? 'm' : 'k'); return `Dagens vers er fra ${v.ref}: ${v.text}`; };
/** Hjem-widgeten «DAGENS BIBELVERS» (h13), med sveip bort mot høyre. */
export function bibleHome(editing = false) {
  if (!bibleOn()) return '';
  if (hiddenHome() && !editing) return '';
  const v = verse(per(), 0);
  const card = `<div class="p37-bh" data-p37bvc role="button" tabindex="0" aria-label="Dagens bibelvers: ${esc(v.ref)}"><div class="p37-bhh"><span>DAGENS BIBELVERS</span><span>${esc(v.ref)}</span></div><span class="p37-bht">«${esc(v.text)}»</span></div>`;
  if (editing) return card;
  // Prompt 39: etikettene byttes med opacity, sveipet drives av mobile-p39.js (ingen tegning midt i gesten).
  return `<div class="p37-bsw" data-p37bv><div class="p37-bsr" data-sw-rev aria-hidden="true"><span class="p39-swl"><b data-sw-idle>✓ Sveip for å skjule</b><b data-sw-armed>✓ Slipp for å skjule</b><b data-sw-done>✓ Flyttet til briefen</b></span><small>Nederst i briefen resten av dagen</small></div>${card}</div>`;
}
/** Prompt 39: sveipet er fullført (mobile-p39.js) – verset ligger nederst i briefen resten av dagen. */
export function bibleCommit() {
  lsSet('bibel_home', { d: todayIso(), read: true, gone: true, s: sess() }); BB.ph = ''; draw(); flash('Verset ligger nederst i briefen resten av dagen');
}
// Lesetid: synlig ≥ 60 % i 4 s + 45 ms per tegn (maks 14 s), appen i forgrunnen.
let io = null, ioEl = null;
function readWatch() {
  const el = document.querySelector('#app [data-p37bvc]');
  if (!el || homeSt()?.read) { if (!el) { ioEl = null; io?.disconnect(); } return; }
  if (el === ioEl) return;
  io?.disconnect(); ioEl = el; BB.seen = 0; BB.visT = 0;
  const need = Math.min(14000, 4000 + verse(per(), 0).text.length * 45);
  const tick = () => {
    if (!ioEl?.isConnected) { clearInterval(BB.rt); BB.rt = null; return; }
    if (BB.visT && !document.hidden) { BB.seen += Date.now() - BB.visT; BB.visT = Date.now(); }
    if (BB.seen >= need) { clearInterval(BB.rt); BB.rt = null; const v = homeSt(); if (!v?.read) lsSet('bibel_home', { d: todayIso(), read: true, gone: !!v?.gone, s: sess() }); }
  };
  if (!('IntersectionObserver' in window)) { BB.visT = Date.now(); clearInterval(BB.rt); BB.rt = setInterval(tick, 500); return; }
  io = new IntersectionObserver((es) => { for (const e of es) { if (e.intersectionRatio >= 0.6) { BB.visT = Date.now(); if (!BB.rt) BB.rt = setInterval(tick, 500); } else { tick(); BB.visT = 0; } } }, { threshold: [0, 0.6, 1] });
  io.observe(el);
}
// Sveip venstre → høyre (samme gest som brief-kortet): grønt ved 38 %, kortet flyr ut og høyden kollapser.
const bsE = () => { const w = document.querySelector('#app [data-p37bv]'); return w ? { w, c: w.querySelector('[data-p37bvc]'), r: w.querySelector('.p37-bsr'), b: w.querySelector('.p37-bsr span') } : null; };
function bvDown(e) { const c = e.target.closest?.('#app [data-p37bvc]'); if (!c || !c.closest('[data-p37bv]') || BB.ph || (e.button ?? 0) > 0) return; BB.sw = { id: e.pointerId, x: e.clientX, y: e.clientY, W: c.getBoundingClientRect().width || 360, lock: null, dx: 0, t: performance.now(), armed: false }; }
function bvMove(e) {
  const g = BB.sw; if (!g || e.pointerId !== g.id) return;
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (g.lock == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) g.lock = Math.abs(dx) > Math.abs(dy) * 1.2 && dx > 0 ? 'x' : 'y';
  if (g.lock !== 'x') { if (g.lock === 'y') BB.sw = null; return; }
  if (e.cancelable) e.preventDefault();
  const E = bsE(); if (!E) return;
  if (!BB.moved) { try { E.c.setPointerCapture?.(e.pointerId); } catch {} }
  BB.moved = Date.now(); g.dx = Math.max(0, dx);
  const p = Math.min(1, g.dx / (g.W * 0.38)), arm = p >= 1;
  if (arm && !g.armed) haptic('tick'); g.armed = arm;
  E.c.style.transition = 'none'; E.c.style.transform = `translateX(${g.dx}px) rotate(${((g.dx / g.W) * 4).toFixed(2)}deg)`;
  E.r.style.opacity = g.dx > 4 ? String(Math.min(1, 0.35 + p)) : '0'; E.w.classList.toggle('arm', arm); E.b.textContent = arm ? 'Slipp for å skjule' : 'Sveip for å skjule';
}
function bvUp(e) {
  const g = BB.sw; if (!g || e.pointerId !== g.id) return;
  BB.sw = null; if (g.lock !== 'x') return;
  BB.moved = Date.now();
  const E = bsE(); if (!E) return;
  const vel = g.dx / Math.max(1, performance.now() - g.t);
  if (g.dx >= g.W * 0.38 || (g.dx > 60 && vel > 0.6)) {
    BB.ph = 'out'; vib([8, 30, 12]); E.w.classList.add('arm'); E.b.textContent = 'Flyttet til briefen'; E.r.style.opacity = '1';
    E.c.style.transition = reduce() ? 'opacity .25s' : 'transform .34s cubic-bezier(.4,0,.6,1)'; if (reduce()) E.c.style.opacity = '0'; else E.c.style.transform = 'translateX(115%) rotate(6deg)';
    setTimeout(() => {
      const host = E.w.closest('.pp-ed') ?? E.w; host.style.maxHeight = `${host.offsetHeight}px`; host.style.overflow = 'hidden';
      requestAnimationFrame(() => { host.style.transition = 'max-height .34s cubic-bezier(.4,0,.2,1), opacity .25s, margin .34s'; host.style.maxHeight = '0px'; host.style.opacity = '0'; host.style.marginTop = '0'; host.style.marginBottom = '0'; });
      setTimeout(() => { lsSet('bibel_home', { d: todayIso(), read: true, gone: true, s: sess() }); BB.ph = ''; draw(); flash('Verset ligger nederst i briefen resten av dagen'); }, 400);
    }, 480);
    return;
  }
  E.c.style.transition = 'transform .38s cubic-bezier(.3,1.4,.5,1)'; E.c.style.transform = ''; E.r.style.opacity = '0'; E.w.classList.remove('arm');
}
/** Arket med hele verset og sammenhengen (trykk på Hjem-kortet). */
function bibleSheet() {
  if (!BB.sheet || !bibleOn()) return '';
  const v = verse(per(), 0), c = v.context ?? {}, ctx = (a) => (Array.isArray(a) ? a : []).map((x) => (typeof x === 'string' ? x : `${x.text ?? ''}${x.ref ? ` (${x.ref})` : ''}`)).filter(Boolean);
  const bf = ctx(c.before), af = ctx(c.after);
  return `<div class="p37-scrim" data-p37b="bsx"></div><div class="p37-sheet" role="dialog" aria-modal="true" aria-label="Dagens bibelvers"><span class="p37-grab"></span>
    <div class="p37-shh"><button type="button" class="p37-cx" data-p37b="bsx" aria-label="Lukk">${X_IC}</button><b>Dagens vers</b><button type="button" class="p37-ok" data-p37b="bsx">Ferdig</button></div>
    <div class="p37-card p37-bvs">${bf.map((t) => `<p class="ctx">${esc(t)}</p>`).join('')}<p class="main">«${esc(v.text)}»</p>${af.map((t) => `<p class="ctx">${esc(t)}</p>`).join('')}<b>${esc(v.ref)}</b>${bf.length || af.length ? '' : '<small>Sammenhengen vises når serveren har hele kapitlet. Les mer på bibel.no.</small>'}</div>
    <div class="p37-row2"><button type="button" class="p37-pill ink" data-p37b="bshare">Del</button><button type="button" class="p37-pill" data-p37b="bcopy">${BB.copied ? 'Kopiert' : 'Kopier'}</button><a class="p37-pill" href="#/bibel" data-p37b="bpage">Bibel-siden ›</a></div>
    <span class="p37-hint">Tekst: Bibelen 1930 (fri bruk).</span></div>`;
}
/** Innstillinger → Glimt → Bibelvers (bare for brukere med modulen). */
export function bibleSettings() {
  if (!bibleOn()) return '';
  const S0 = BB.set ?? {}, on = (k, d) => (S0[k] == null ? d : !!S0[k]);
  const row = (k, n, sub, d) => `<button type="button" class="p37-r" data-p37b="bset" data-k="${k}" role="switch" aria-checked="${on(k, d)}"><span class="m-grow"><b>${n}</b><small>${sub}</small></span><span class="p37-sw${on(k, d) ? ' on' : ''}"><i></i></span></button>`;
  return `<span class="p35-lab">BIBELVERS</span><div class="p37-card p37-grp">${row('morning', 'I morgenbriefen', 'Morgenvers 05–11', true)}${row('evening', 'I kveldsbriefen', 'Kveldsvers 17–05', true)}${row('notify', 'Varsel kl. 07:00 og 21:00', '«Dagens vers er klart»', false)}<div class="p37-r"><span class="m-grow"><b>Oversettelse</b><small>Bibelen 1930 (fri bruk)</small></span></div></div><a class="p37-pill" href="#/bibel" style="align-self:flex-start">Åpne Bibel-siden ›</a>`;
}
/* ---------- Bibel-siden: rekke, dagens vers, leseplan, statistikk, lagrede vers, påminnelse ---------- */
const PL = { joh: ['Johannes på 21 dager', 21, (d) => `Johannes ${d}`], sal: ['Salmene på 30 dager', 30, (d) => `Salme ${d * 5 - 4}–${d * 5}`], ord: ['Ordspråkene på 31 dager', 31, (d) => `Ordspråkene ${d}`], mark: ['Markus på 16 dager', 16, (d) => `Markus ${d}`] };
const skLocal = () => lsGet('bibel_streak', null) ?? { days: [], best: 0, saved: [], plan: 'joh', pday: 0, pdone: null, rem: false };
const skSave = (v) => lsSet('bibel_streak', v);
async function statsLoad(force = false) {
  if (!force && Date.now() - BB.statT < 60e3) return;
  BB.statT = Date.now();
  try { BB.stats = await hlApi('/bible/stats'); } catch { BB.stats = null; }
  draw();
}
function days() {
  const S = skLocal(), srv = (BB.stats?.readDays ?? []).map((x) => String(x).slice(0, 10));
  return new Set([...S.days.map((x) => (/^\d{4}-/.test(x) ? x : iso(new Date(x)))), ...srv]);
}
function streak(has) { let n = 0; const c = new Date(); if (!has.has(iso(c))) c.setDate(c.getDate() - 1); while (has.has(iso(c))) { n++; c.setDate(c.getDate() - 1); } return n; }
async function markRead() {
  const S = skLocal(), t = todayIso();
  if (!S.days.includes(t)) S.days.push(t);
  const n = streak(days().add(t)); S.best = Math.max(S.best || 0, n); skSave(S);
  vib([8, 30, 12]); haptic('ok');
  const v = homeSt(); lsSet('bibel_home', { d: t, read: true, gone: !!v?.gone, s: v?.s ?? 'lest' });
  hlApi('/bible/read', { method: 'POST', json: { date: t, period: per() === 'm' ? 'morning' : 'evening' } }).then(() => statsLoad(true)).catch(() => {});
  draw();
}
export function bibleView() {
  if (!bibleOn()) return `<div class="p37-empty">${BB.set || BB.miss ? 'Bibelvers er ikke slått på for deg. Admin kan slå det på under Innstillinger → Brukere → Moduler.' : 'Laster …'}</div>`;
  statsLoad();
  const S = skLocal(), has = days(), t = todayIso(), n = BB.stats?.streak ?? streak(has), readToday = has.has(t), best = Math.max(BB.stats?.best ?? 0, S.best || 0, n);
  const p = per(), v = verse(p, 0), L = look(p);
  const T0 = new Date(), mon = new Date(T0); mon.setDate(T0.getDate() - ((T0.getDay() + 6) % 7));
  const week = ['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((l, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); const k = iso(d), on = has.has(k), isT = k === t; return `<span class="p37-wd${on ? ' on' : ''}${isT ? ' t' : ''}"><small>${l}</small><i>${on ? '✓' : ''}</i></span>`; }).join('');
  const pk = PL[S.plan] ? S.plan : 'joh', P = PL[pk], pd = Math.min(P[1], (S.pday || 0) + 1), pdone = S.pdone === t, saved = S.saved || [], isSaved = saved.some((x) => x.ref === v.ref);
  const tip = readToday ? 'Bra! Kom tilbake i morgen for å holde rekken.' : n ? `Les dagens vers for å holde rekken på ${n} dager.` : 'Les dagens vers for å starte en ny rekke.';
  return `<div class="p37-bp">
    <div class="p37-stk"><i class="p37-stg"></i><div class="p37-sth"><span class="p37-flm${readToday ? ' on' : ''}"><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.6 1.4-4 2.5-5 .3 1.6 1 2.6 2 3 .4-3-1-6.5.5-9z" fill="currentColor"/></svg></span>
      <span class="p37-stn"><b>${n}</b><span>${n === 1 ? 'dag på rad' : 'dager på rad'}</span></span><span class="p37-stb"><small>LENGSTE</small><b>${best} dager</b></span></div>
      <div class="p37-wk">${week}</div><span class="p37-stt">${esc(tip)}</span></div>
    <div class="p37-bv page" style="background:${L.bg};color:${L.fg}"><div class="p37-bvh p38-bvh"><span class="p38-bvk"><span style="color:${L.lab}">DAGENS VERS</span><span style="color:${L.mut}">${esc(dateLbl())}</span><span class="p38-bvr" style="color:${L.mut}">Glimt leser dagens vers med deg.</span></span><span class="p38-bvf pg">${P38.priest(72, TTalk() ? 'talk' : 'idle')}</span></div><span class="p37-bvt big">«${esc(v.text)}»</span><b>${esc(v.ref)}</b>
      <div class="p37-bvb"><button type="button" data-p37b="bread" style="background:${readToday ? '#2f7a4f' : L.fg};color:${readToday ? '#fff' : L.fg === '#f3efe6' ? '#1b1a17' : '#fff'}">${readToday ? '✓ Lest i dag' : 'Jeg har lest'}</button><button type="button" data-p37b="bsave" style="background:${L.chip};color:${L.fg}">${isSaved ? '♥ Lagret' : '♡ Lagre'}</button><button type="button" data-p37b="bex" style="background:${L.chip};color:${L.fg}">✦ Forklar</button><button type="button" data-p37b="bcopy" style="background:${L.chip};color:${L.fg}">${BB.copied ? 'Kopiert' : 'Kopier'}</button></div>
      ${BB.ex ? `<div class="p37-bex" style="background:${L.chip}"><small style="color:${L.lab}">GLIMT</small><span>${esc(BB.ex)}</span></div>` : ''}</div>
    <span class="p37-lab">LESEPLAN</span>
    <div class="p37-card p37-plan"><div class="p37-plh"><b>${esc(P[0])}</b><span>Dag ${pd} av ${P[1]}</span></div><span class="p37-bar"><i style="width:${Math.round(((S.pday || 0) / P[1]) * 100)}%"></i></span>
      <div class="p37-pld"><span class="m-grow"><small>I DAG</small><b>${esc(P[2](pd))}</b><span>${pdone ? 'Fullført i dag · neste i morgen' : 'Ca. 5 minutter'}</span></span><a href="https://www.bibel.no/nettbibelen?parse=${encodeURIComponent(P[2](pd))}" target="_blank" rel="noopener">Les ›</a><button type="button" data-p37b="pdone" class="${pdone ? 'ok' : ''}">${pdone ? '✓ Lest' : 'Ferdig'}</button></div>
      <div class="p37-chips">${Object.entries(PL).map(([k, x]) => `<button type="button" class="p37-sc${k === pk ? ' on' : ''}" data-p37b="plan" data-k="${k}">${esc(x[0])}</button>`).join('')}</div></div>
    <div class="p37-stats">${[['DAGER LEST', has.size], ['LAGREDE', saved.length], ['LESEPLAN', `${Math.round(((S.pday || 0) / P[1]) * 100)} %`]].map(([k, x]) => `<div class="p37-card"><small>${k}</small><b>${x}</b></div>`).join('')}</div>
    <span class="p37-lab">LAGREDE VERS · ${saved.length}</span>
    ${saved.length ? saved.map((x, i) => `<div class="p37-card p37-sv"><span class="m-grow"><i>«${esc(x.t)}»</i><b>${esc(x.ref)}</b></span><button type="button" class="p37-ib x" data-p37b="srm" data-i="${i}" aria-label="Fjern">×</button></div>`).join('') : '<span class="p37-hint">Trykk «Lagre» på et vers for å samle det her.</span>'}
    <div class="p37-card p37-grp"><button type="button" class="p37-r" data-p37b="rem" role="switch" aria-checked="${!!S.rem}"><span class="m-grow"><b>Daglig påminnelse</b><small>${S.rem ? 'Kl. 07:00 · «Dagens vers er klart»' : 'Av'}</small></span><span class="p37-sw${S.rem ? ' on' : ''}"><i></i></span></button></div>
    <span class="p37-hint">Tekst: Bibelen 1930 (fri bruk). «Les ›» åpner kapitlet på bibel.no.</span></div>`;
}
async function explain(v) {
  if (BB.ex) { BB.ex = null; draw(); return; }
  BB.ex = 'Glimt tenker …'; draw();
  const fb = `«${v.ref}»: verset handler om å stole på Gud i hverdagen. Les gjerne versene rundt for sammenhengen, og tenk over hva det betyr for deg i dag.`;
  try {
    const r = await Promise.race([hlApi('/assist', { method: 'POST', json: { q: `Forklar kort (3–4 setninger, norsk, varm og saklig) sammenhengen og betydningen av dette bibelverset: ${v.ref} «${v.text}»`, source: 'bible', kind: 'question' } }), new Promise((_, no) => setTimeout(() => no(new Error('tid')), 9000))]);
    const t = r?.text ?? r?.answer; BB.ex = t && !r?.jobId ? String(t).replace(/\*\*/g, '') : fb;
  } catch { BB.ex = fb; }
  draw();
}

/* =====================================================================
   2. Onboarding: koble brukeren til en profil i husstanden
   ===================================================================== */
export const OB = { on: false, st: 1, d: null, sel: null, isNew: false, newN: '', ln: { location: true, lists: true, subs: true, calendars: true, health: false }, busy: false, err: '', prof: null, checked: false };
export async function obCheck(force = false) {
  if (OB.checked && !force) return; OB.checked = true;
  try { OB.d = await hlApi('/profiles'); } catch { OB.d = null; return; }
  if (!OB.d || !Array.isArray(OB.d.profiles)) return;
  const linked = OB.d.me?.profileId != null;
  if (linked && !force) return;
  if (!force && lsGet('p37_onb_done', false)) return;
  const u = norm(m.me?.username ?? '');
  const sug = OB.d.profiles.find((p) => p.suggested) ?? OB.d.profiles.find((p) => !p.userId && (norm(first(p.name)) === u || u.startsWith(norm(first(p.name)))));
  OB.sel = linked ? String(OB.d.me.profileId) : sug ? String(sug.id) : null; OB.isNew = false; OB.st = 1; OB.err = ''; OB.on = true; draw();
}
const obProf = () => (OB.d?.profiles ?? []).find((p) => String(p.id) === String(OB.sel));
const hasTxt = (h) => [h?.location ? 'Posisjon' : '', h?.lists ? `${typeof h.lists === 'number' ? h.lists : ''} delte lister`.trim() : '', h?.subs ? (typeof h.subs === 'string' ? h.subs : 'Delte abonnementer') : ''].filter(Boolean).join(' · ');
function obView() {
  if (!OB.on) return '';
  const user = m.me?.username ?? 'bruker', P = OB.isNew ? { name: OB.newN.trim() || 'Ny profil', color: '#3d7f8a' } : obProf() ?? { name: first(m.me?.name ?? 'Deg'), color: '#2b5d8a' };
  const dots = [0, 1, 2, 3].map((i) => `<i class="${i === OB.st ? 'on' : i < OB.st ? 'past' : ''}"></i>`).join('');
  const av = (p, s = 44) => `<span class="p37-oav" style="width:${s}px;height:${s}px;background:${colOf(p.id ?? p.name, p.color)};font-size:${Math.round(s * 0.4)}px">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(String(p.name || '?').slice(0, 1).toUpperCase())}</span>`;
  let body = '';
  if (OB.st === 1) {
    const locked = OB.d?.locked;
    const sug = obProf();
    body = locked ? `<span class="p37-ok2">STEG 2 AV 3</span><b class="p37-oh">Hvem er du?</b><span class="p37-os">${sug ? `Admin har koblet deg til <b>${esc(sug.name)}</b>.` : 'Admin kobler brukere til profiler i denne husstanden. Du får beskjed når det er gjort.'}</span><span class="m-grow"></span><button type="button" class="p37-obtn" data-p37b="${sug ? 'ob2' : 'obskip'}">${sug ? 'Bekreft' : 'Fortsett'}</button>`
      : `<span class="p37-ok2">STEG 2 AV 3</span><b class="p37-oh">Hvem er du?</b><span class="p37-os">Koble brukeren <b>@${esc(user)}</b> til en profil. Profilen har posisjon, gjøremål, delte abonnementer og kalendere som allerede finnes.</span>
      ${sug && !OB.isNew ? `<div class="p37-osug"><b>✦</b><span>Glimt tror du er <b>${esc(sug.name)}</b>${sug.suggested ? '' : ' (samme navn som brukeren)'}.</span></div>` : ''}
      <div class="p37-olist">${(OB.d?.profiles ?? []).map((p) => { const taken = p.userId != null && String(p.userId) !== String(m.me?.id ?? ''), on = String(p.id) === String(OB.sel) && !OB.isNew; return `<button type="button" class="p37-op${on ? ' on' : ''}" data-p37b="obsel" data-k="${esc(p.id)}" ${taken ? 'aria-disabled="true"' : ''} style="opacity:${taken ? 0.45 : 1}">${av(p)}<span class="m-grow"><b>${esc(p.name)}</b><small>${esc(taken ? `Koblet til @${p.username ?? 'en annen'}` : hasTxt(p.has) || 'Ingen data ennå')}</small></span><span class="p37-orb">${on ? '✓' : ''}</span></button>`; }).join('')}
        <button type="button" class="p37-op new${OB.isNew ? ' on' : ''}" data-p37b="obnew"><span class="p37-oav plus">+</span><span class="m-grow"><b>Jeg er ny i husstanden</b><small>Lag en ny profil for meg</small></span></button>
        ${OB.isNew ? `<input class="p37-oin" id="p37-obn" value="${esc(OB.newN)}" placeholder="Navnet ditt" data-p37bin="obn" autocomplete="name">` : ''}</div>
      <span class="m-grow"></span><button type="button" class="p37-obtn" data-p37b="ob2" ${(OB.isNew ? OB.newN.trim() : OB.sel) ? '' : 'disabled'}>${OB.isNew ? 'Lag profil' : 'Dette er meg'}</button>`;
  } else if (OB.st === 2) {
    const L = [['location', 'Posisjon og Familie-kart', 'Del posisjonen din med husstanden', 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z', '#2f6b45'], ['lists', 'Gjøremål', OB.isNew ? 'Du blir lagt til i felles lister' : 'Delte lister i husstanden', 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2', '#b23a2a'], ...(OB.isNew ? [] : [['subs', 'Delte abonnementer', typeof obProf()?.has?.subs === 'string' ? obProf().has.subs : 'Abonnementer du er med i', 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', '#a8661a']]), ['calendars', 'Kalendere', 'Familie og felles kalender', 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4', '#2b5d8a'], ['health', 'Helse', 'Apple Health / Health Connect på denne enheten', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', '#c2477a']];
    body = `<span class="p37-ok2">STEG 3 AV 3</span><b class="p37-oh">Dette kobles til deg</b>
      <div class="p37-ome">${av(P, 48)}<span class="m-grow"><b>${esc(P.name)}</b><small>@${esc(user)} ⟷ profil</small></span></div>
      <div class="p37-card p37-grp">${L.map(([k, n, s, d, c]) => `<button type="button" class="p37-r" data-p37b="obln" data-k="${k}" role="switch" aria-checked="${!!OB.ln[k]}"><span class="p37-ri" style="--c:${c}">${svg(d, 16)}</span><span class="m-grow"><b>${esc(n)}</b><small>${esc(s)}</small></span><span class="p37-sw${OB.ln[k] ? ' on' : ''}"><i></i></span></button>`).join('')}</div>
      <span class="p37-hint">Du kan endre koblingen senere i Innstillinger → Konto → Profil. Admin får beskjed om nye koblinger.</span>${OB.err ? `<span class="p37-err">${esc(OB.err)}</span>` : ''}
      <span class="m-grow"></span><button type="button" class="p37-obtn" data-p37b="oblink" ${OB.busy ? 'disabled' : ''}>${OB.busy ? 'Kobler …' : 'Koble og fortsett'}</button>`;
  } else {
    const nm = first(OB.prof?.name ?? P.name), n = Object.entries(OB.ln).filter(([k, v]) => v && (!OB.isNew || k !== 'subs')).length;
    body = `<span class="m-grow"></span><span class="p37-opop">${av(OB.prof ?? P, 96)}</span><b class="p37-oh c">Hei, ${esc(nm)}!</b><span class="p37-os c">@${esc(user)} er nå koblet til ${esc(OB.prof?.name ?? P.name)}. ${n} ting er satt opp for deg, og resten av husstanden ser deg som ${esc(nm)}.</span><span class="m-grow"></span><button type="button" class="p37-obtn" data-p37b="obdone">Gå til Hjem</button>`;
  }
  return `<div class="p37-ob" role="dialog" aria-modal="true" aria-label="Koble til profil"><div class="p37-obi"><div class="p37-obt">${OB.st > 1 && OB.st < 3 ? `<button type="button" class="p37-cx" data-p37b="obback" aria-label="Tilbake">${svg('M15 6l-6 6 6 6', 16, 2.6)}</button>` : '<span class="p37-cx sp"></span>'}<span class="p37-odots">${dots}</span>${OB.st < 3 ? '<button type="button" class="p37-oskip" data-p37b="obskip">Hopp over</button>' : '<span class="p37-cx sp"></span>'}</div><div class="p37-obb">${body}</div></div></div>`;
}
async function obLink() {
  OB.busy = true; OB.err = ''; draw();
  const body = { ...(OB.isNew ? { newProfileName: OB.newN.trim() } : { profileId: OB.sel }), consents: { ...OB.ln, ...(OB.isNew ? { subs: false } : {}) } };
  try { const r = await hlApi('/onboarding/link', { method: 'POST', json: body }); OB.prof = r?.profile ?? obProf() ?? { name: OB.newN.trim() }; OB.st = 3; vib([10, 40, 10]); haptic('ok'); lsSet('p37_onb_done', true); }
  catch (e) { OB.err = e.status === 409 ? 'Profilen er allerede koblet til en annen bruker. Velg en annen, eller spør admin.' : e.status === 404 ? 'Serveren har ikke profiler ennå. Oppdater Homelab.' : e.message; haptic('err'); }
  OB.busy = false; draw();
}
/** Innstillinger → Konto: raden «Profil i husstanden». */
export function obRow() {
  if (!OB.d && !OB.checked) obCheck();
  if (!OB.d?.profiles) return '';
  const p = OB.d.profiles.find((x) => String(x.id) === String(OB.d.me?.profileId));
  return `<div class="sec">Profil i husstanden</div><div class="list"><button type="button" class="opt-row" data-p37b="obopen"><span class="m-grow">${p ? esc(p.name) : 'Ikke koblet'}<br><span style="font-size:13px;opacity:.65">${p ? 'Posisjon, gjøremål, delte abonnementer og kalendere' : 'Koble brukeren til en profil i husstanden'}</span></span><span class="sval">${p ? 'Endre →' : 'Koble →'}</span></button></div>`;
}

/* =====================================================================
   3. «Hvor er Ingrid?» (Hjem-søket)
   ===================================================================== */
const WHERE = /(?:^|\s)(?:hvor|kor)\s+(?:er|befinner|holder)\s+(?:seg\s+)?([a-zæøåA-ZÆØÅ]+)|(?:^|\s)er\s+([a-zæøåA-ZÆØÅ]+)\s+(?:hjemme|på skolen|på jobb|på vei|hos)|(?:^|\s)where\s+is\s+([a-zA-Z]+)|(?:^|\s)posisjon(?:en)?\s+(?:til|på)\s+([a-zæøåA-ZÆØÅ]+)/i;
export const isWhereQ = (q) => WHERE.test(String(q ?? ''));
const hav = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const agoTxt = (ts) => { const s = Math.max(0, Math.round((Date.now() - +new Date(ts)) / 1000)); return s < 90 ? 'nå' : s < 3600 ? `${Math.round(s / 60)} min siden` : s < 86400 ? `${Math.round(s / 3600)} t siden` : `${Math.round(s / 86400)} d siden`; };
const ACT = { driving: 'i bil', walking: 'til fots', running: 'løper', cycling: 'på sykkel', still: '' };
/** Svar på «hvor er X»: serverens family.where først, ellers Familie-dataene her (samme personvern: bare de som deler). */
export async function whereAnswer(q) {
  try {
    const r = await hlApi('/assist', { method: 'POST', json: { q, source: 'search', kind: 'question' } });
    if (r?.intent === 'family.where' && (r.text || r.answer)) return { text: r.text ?? r.answer, src: r.source ?? 'Familie · posisjon', open: r.open ?? (r.person ? { route: 'familie', person: r.person } : null), intent: 'family.where' };
  } catch {}
  const mm = WHERE.exec(String(q)); if (!mm) return null;
  let who = norm(mm[1] || mm[2] || mm[3] || mm[4] || '');
  const P16 = await import('./mobile-p16.js');
  if (!P16.FM.d) await P16.famLoad().catch(() => {});
  const mem = P16.FM.d?.members ?? [], me = mem.find((p) => p.self) ?? mem.find((p) => String(p.userId) === String(m.me?.id));
  if (!mem.length) return { text: 'Familie og kart er ikke satt opp ennå.', src: 'Familie' };
  const p = ['jeg', 'meg', 'i'].includes(who) ? me : mem.find((x) => norm(first(x.name)) === who || norm(x.username) === who || norm(x.name) === who);
  const sharers = mem.filter((x) => !x.self && x.sharing === 'on').map((x) => first(x.name));
  const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}` : a[0] ?? 'ingen');
  if (!p) return { text: `Jeg finner ikke «${mm[1] || mm[2] || mm[3] || mm[4]}» i Familie. Personer med deling: **${list(sharers)}**.`, src: 'Familie' };
  const nm = first(p.name);
  if (p !== me && p.sharing !== 'on') return { text: `**${nm}** deler ikke posisjon med deg.`, src: 'Familie · posisjon' };
  const L0 = p.last;
  if (!L0 || L0.lat == null) return { text: `**${nm}** har ingen posisjon ennå.`, src: 'Familie · posisjon' };
  const zone = (P16.FM.d?.zones ?? []).find((z) => z.lat != null && hav(z.lat, z.lon, L0.lat, L0.lon) * 1000 <= (z.radius ?? 150));
  // Uten sone: stedsnavnet fra serveren (omvendt geokoding der), ellers avstanden til nærmeste kjente sone.
  let place = zone ? zone.name : L0.place || null;
  if (!place) { const nz = (P16.FM.d?.zones ?? []).filter((z) => z.lat != null).map((z) => ({ z, d: hav(z.lat, z.lon, L0.lat, L0.lon) })).sort((a, b) => a.d - b.d)[0]; place = nz ? `${nz.d.toFixed(1).replace('.', ',')} km fra ${nz.z.name}` : 'et ukjent sted'; }
  const act = ACT[L0.activity] ?? '', old = Date.now() - +new Date(L0.ts) > 3600e3;
  const km = me && me !== p && me.last?.lat != null ? hav(me.last.lat, me.last.lon, L0.lat, L0.lon) : null;
  const where = zone ? (/^hjem/i.test(zone.name) ? 'hjemme' : `på ${zone.name}`) : `${act ? `${act} ` : ''}${/ km fra /.test(place) ? `ca. ${place}` : `ved ${place}`}`;
  const bat = L0.battery != null ? ` · batteri ${Math.round(L0.battery <= 1 ? L0.battery * 100 : L0.battery)} %` : '';
  const text = old ? `**${nm}** ble sist sett for ${agoTxt(L0.ts).replace(' siden', '')} siden ${zone ? where : `ved ${place}`}.${bat ? ` Batteri ${bat.replace(' · batteri ', '')}.` : ''}`
    : `**${p === me ? 'Du' : nm}** er **${zone && act ? `${act} ` : ''}${where}**${km != null ? ` (${km.toFixed(1).replace('.', ',')} km fra deg)` : ''}. Oppdatert ${agoTxt(L0.ts)}${bat}.`;
  return { text, src: 'Familie · posisjon', open: { route: 'familie', person: p.userId }, intent: 'family.where' };
}
export const famOpenBtn = (o) => (o?.route === 'familie' ? `<button type="button" class="p35-wxo" data-p37b="famopen" data-k="${esc(o.person ?? '')}">Vis på kart ›</button>` : '');

/* =====================================================================
   4. Pakker-widgeten på Hjem: «Vis bare når det er pakker» og antall (papir_wopt.h2)
   ===================================================================== */
export const H2 = { open: false, last: null };
export const h2opt = () => { const o = lsGet('papir_wopt', {})?.h2 ?? {}; return { auto: o.auto !== false, n: [1, 2, 3].includes(+o.n) ? +o.n : 1 }; };
function h2save(patch) {
  const all = lsGet('papir_wopt', {}) || {}; all.h2 = { ...h2opt(), ...patch }; lsSet('papir_wopt', all);
  hlApi('/me/layout', { method: 'PUT', json: { wopt: all } }).catch(() => {});
}
export function takeWopt(r) { if (r?.wopt && typeof r.wopt === 'object') lsSet('papir_wopt', { ...(lsGet('papir_wopt', {}) || {}), ...r.wopt }); }
/** card = det vanlige kortet (første pakke) eller tomt-kortet; rows = de neste pakkene (opptil n−1). */
export function h2Widget(card, empty, n, rows, editing) {
  const o = h2opt();
  const back = H2.last === 0 && n > 0; H2.last = n;
  if (!n && o.auto) return editing ? `<div class="p37-h2dim">${empty}<span class="p37-h2b">Skjult når ingen pakker</span></div>` : '';
  const more = n ? rows.slice(0, o.n - 1) : [];
  return `<div class="p37-h2${back && !reduce() ? ' in' : ''}">${n ? card : empty}${more.length ? `<div class="p37-h2m">${more.join('')}</div>` : ''}</div>`;
}
function h2Sheet(n) {
  if (!H2.open || m.screen !== 'hl') return '';
  const o = h2opt();
  return `<div class="p37-scrim" data-p37b="h2x"></div><div class="p37-sheet sm" role="dialog" aria-modal="true" aria-label="Rediger Pakker"><span class="p37-grab"></span>
    <div class="p37-shh"><span></span><b>Pakker</b><button type="button" class="p37-ok" data-p37b="h2x">Ferdig</button></div>
    <div class="p37-card p37-grp"><button type="button" class="p37-r" data-p37b="h2auto" role="switch" aria-checked="${o.auto}"><span class="m-grow"><b>Vis bare når det er pakker</b><small>${n ? `${n} ${n === 1 ? 'pakke' : 'pakker'} på vei nå` : `Ingen pakker nå${o.auto ? ' · widgeten er skjult' : ''}`}</small></span><span class="p37-sw${o.auto ? ' on' : ''}"><i></i></span></button>
      <div class="p37-rc"><b>Pakker som vises</b><div class="p37-seg">${[1, 2, 3].map((k) => `<button type="button" class="${o.n === k ? 'on' : ''}" data-p37b="h2n" data-v="${k}" aria-pressed="${o.n === k}">${k}</button>`).join('')}</div></div></div></div>`;
}
export const h2Open = () => { H2.open = true; draw(); };

/* =====================================================================
   5. Subscription OS: GRATIS PRØVEPERIODER og delte abonnementer
   ===================================================================== */
export const TRS = { add: false, f: { n: '', end: '', p: '' }, links: null, busy: false };
const DOM = { viaplay: 'viaplay.no', netflix: 'netflix.com', 'hbo max': 'max.com', max: 'max.com', 'disney+': 'disneyplus.com', spotify: 'spotify.com', 'tv 2 play': 'tv2.no', storytel: 'storytel.com', bookbeat: 'bookbeat.com', 'apple tv+': 'tv.apple.com', 'youtube premium': 'youtube.com', 'amazon prime': 'amazon.com', audible: 'audible.com', strava: 'strava.com', tidal: 'tidal.com', chatgpt: 'openai.com', overleaf: 'overleaf.com' };
const dom = (n) => DOM[String(n ?? '').toLowerCase()] ?? `${String(n ?? 'x').toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`;
const dLeft = (d) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(`${String(d).slice(0, 10)}T00:00`) - t) / 864e5); };
const fdate = (d) => { const x = new Date(`${String(d).slice(0, 10)}T12:00`); return `${WD3[x.getDay()]} ${x.getDate()}. ${MS3[x.getMonth()]}`; };
async function linksLoad() { if (TRS.links) return; TRS.links = {}; try { const r = await api('/subscriptions/trials'); for (const l of r?.cancelLinks ?? []) TRS.links[String(l.name).toLowerCase()] = l.cancelUrl; } catch {} }
/** Kortet øverst på Oversikt. trials = P31.G.trials (aktive prøver). */
export function trialsCard(trials) {
  linksLoad();
  const A = (trials ?? []).map((x) => { const end = x.ends_at ?? x.endsAt ?? x.end, dd = x.daysLeft ?? dLeft(end), st = x.started_at ?? x.startedAt ?? x.start, tot = st ? Math.max(1, dLeft(end) - dLeft(st)) : 14; return { ...x, end, dd, pct: Math.max(4, Math.min(100, Math.round(((tot - Math.max(0, dd)) / tot) * 100))) }; }).filter((x) => x.dd >= 0).sort((a, b) => a.dd - b.dd);
  const col = (d) => (d <= 2 ? 'var(--p37-red,#d9483a)' : d <= 7 ? '#d9961a' : 'currentColor');
  const price = (x) => { const v = x.priceAfter ?? x.price_after ?? x.priceLabel; return v == null || v === '' ? '' : typeof v === 'number' ? ` · deretter ${Math.round(v)} kr/mnd` : ` · deretter ${esc(v)}`; };
  const F = TRS.f;
  return `<div class="p37-trc"><div class="p37-trh"><span>GRATIS PRØVEPERIODER · ${A.length}</span><button type="button" data-p37b="tradd">${TRS.add ? 'Avbryt' : '+ Legg til'}</button></div>
    ${TRS.add ? `<form class="p37-trf" data-p37bform="trial"><input id="p37-trn" value="${esc(F.n)}" placeholder="Tjeneste, f.eks. Storytel" data-p37bin="trn" autocomplete="off"><div><input type="date" value="${esc(F.end)}" data-p37bin="tre" aria-label="Sluttdato"><input value="${esc(F.p)}" inputmode="numeric" placeholder="Pris etterpå" data-p37bin="trp"></div><button type="submit" ${TRS.busy ? 'disabled' : ''}>${TRS.busy ? 'Lagrer …' : 'Legg til · påminn dagen før'}</button></form>` : ''}
    ${!A.length && !TRS.add ? '<span class="p37-trnone">Ingen aktive prøveperioder. Legg til en, så minner Glimt deg på å avslutte i tide.</span>' : ''}
    ${A.map((x) => { const cu = x.cancelUrl ?? x.cancel_url ?? TRS.links?.[String(x.service).toLowerCase()] ?? ''; const rem = new Date(`${String(x.end).slice(0, 10)}T12:00`); rem.setDate(rem.getDate() - 1); return `<div class="p37-trr"><div class="p37-trt"><span class="p37-trl" style="background-image:url('/finans/api/logo/${esc(dom(x.service))}')">${esc(String(x.service ?? '?').slice(0, 1).toUpperCase())}</span><span class="m-grow"><b>${esc(x.service)}</b><small>Slutter ${esc(fdate(x.end))}${price(x)}</small></span><span class="p37-trd" style="color:${col(x.dd)}"><b>${x.dd}</b><small>${x.dd === 1 ? 'dag igjen' : 'dager igjen'}</small></span></div>
      <span class="p37-bar"><i style="width:${x.pct}%;background:${col(x.dd)}"></i></span>
      <div class="p37-trb"><button type="button" class="ink" data-p37b="trcancel" data-id="${esc(x.id)}" data-u="${esc(cu)}">Avslutt nå ↗</button><button type="button" data-p37b="trkeep" data-id="${esc(x.id)}">Behold · legg til</button><small>Varsel ${esc(fdate(iso(rem)))}</small></div></div>`; }).join('')}</div>`;
}
/** Husstandens brukere (til deling): profiler med bruker, ellers Gjøremål-medlemmene. */
export async function household() {
  if (OB.d?.profiles) { const L = OB.d.profiles.filter((p) => p.userId).map((p) => ({ id: String(p.userId), name: p.name, color: p.color })); if (L.length) return L; }
  try { const r = await hlApi('/tasks/lists'); const L = (r?.members ?? []).map((p) => ({ id: String(p.userId ?? p.id), name: p.name ?? p.displayName ?? p.username, color: p.color ?? null })); if (L.length) return L; } catch {}
  return m.me ? [{ id: String(m.me.id), name: m.me.name ?? 'Meg' }] : [];
}
/** Din del av abonnementet (myShare fra serveren, ellers lik deling / betaler). */
export function myShare(x) {
  if (x.myShareMonthly != null) return +x.myShareMonthly; // kr/mnd (myShare er per trekk)
  if (x.myShare != null) return +x.myShare;
  const mem = Array.isArray(x.members) ? x.members : [], per = x.monthly ?? (x.cycle === 'yearly' ? x.price / 12 : x.price);
  if (mem.length < 2) return per;
  if (x.split === 'payer') return String(x.payerId) === String(m.me?.id) ? per : 0;
  return per / mem.length;
}
export const subAvs = (x) => { const mem = Array.isArray(x.members) ? x.members : []; return mem.length > 1 ? `<span class="p37-avs sm">${mem.slice(0, 3).map((p, i) => `<i style="width:16px;height:16px;background:${colOf(p.userId ?? p.id, p.color)};margin-left:${i ? -5 : 0}px">${esc(String(p.name ?? '?').slice(0, 1).toUpperCase())}</i>`).join('')}</span>` : ''; };
export const subShareLine = (x) => ((x.members ?? []).length > 1 ? `<span class="p37-shl">Delt · din del ${Math.round(myShare(x)).toLocaleString('nb-NO')} kr/mnd</span>` : '');
/** Seksjonen «Del med husstanden» i redigeringsarket. ed = SB.ed (members, split, payerId), ppl = husstanden. */
export function shareSection(ed, ppl, price) {
  const mem = ed.members ?? [meIdS()], shared = mem.length > 1, n = mem.length || 1, pr = parseFloat(String(price ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
  const hint = !shared ? 'Velg hvem som er med. Alle ser abonnementet, trekkdato og varsler.' : ed.split === 'payer' ? `${String(ed.payerId ?? meIdS()) === meIdS() ? 'Du' : first(ppl.find((p) => p.id === String(ed.payerId))?.name ?? 'Betaleren')} betaler hele beløpet. Alle ser abonnementet, trekkdato og varsler.` : `Hver betaler ${Math.round(pr / n).toLocaleString('nb-NO')} kr/mnd. Alle ser abonnementet, trekkdato og varsler. Bare din del teller i ditt budsjett.`;
  return `<div class="p37-esh"><span class="p37-eshh"><b>Del med husstanden</b><small>${shared ? `${n} personer` : 'Bare deg'}</small></span>
    <div class="p37-chips p37-wr">${ppl.map((u) => { const on = mem.includes(u.id), me = u.id === meIdS(); return `<button type="button" class="p37-pc${on ? ' on' : ''}" data-p37b="shmem" data-k="${esc(u.id)}" ${me ? 'aria-disabled="true"' : ''}><i style="background:${colOf(u.id, u.color)}">${esc(String(u.name ?? '?').slice(0, 1).toUpperCase())}</i>${esc(me ? `${first(u.name)} (deg)` : first(u.name))}</button>`; }).join('')}</div>
    ${shared ? `<div class="p37-seg">${[['equal', 'Del likt'], ['payer', 'Jeg betaler']].map(([k, nm]) => `<button type="button" class="${(ed.split ?? 'equal') === k ? 'on' : ''}" data-p37b="shsplit" data-v="${k}">${nm}</button>`).join('')}</div>` : ''}
    <small class="p37-eshn">${esc(hint)}</small></div>`;
}
const meIdS = () => String(m.me?.id ?? '');
export async function shareSave(id, ed) {
  const mem = ed.members ?? []; if (id == null) return;
  try { await api(`/subscriptions/${encodeURIComponent(id)}/members`, { method: 'PUT', json: { members: mem, split: ed.split ?? 'equal', payerId: ed.split === 'payer' ? (ed.payerId ?? meIdS()) : null } }); }
  catch (e) { if (e.status !== 404 && e.status !== 405) flash(`Delingen ble ikke lagret: ${e.message}`, 'err'); else if (mem.length > 1) flash('Serveren støtter ikke delte abonnementer ennå'); }
}

/* =====================================================================
   6. Sporing: husstandens nøkler (maskert) og kvote
   ===================================================================== */
export const TK = { d: null, t: 0, miss: false };
async function tkLoad() { if (TK.miss || Date.now() - TK.t < 120e3) return; TK.t = Date.now(); try { TK.d = await hlApi('/tracking/keys'); } catch (e) { if (e.status === 404 || e.status === 405) TK.miss = true; } draw(); }
/** «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen» under pakkelisten (null = bruk den gamle linja). */
export function trkKeyLine() {
  tkLoad(); const d = TK.d; if (!d) return null;
  const pa = (d.providers ?? []).find((p) => /parcels/i.test(p.id ?? p.name)) ?? (d.providers ?? []).find((p) => p.set);
  if (!pa?.set) return '';
  const q = d.quota ?? {}, left = q.limit != null ? Math.max(0, (q.limit ?? 0) - (q.used ?? 0)) : null;
  return `<span class="p37-tkl">Bruker husstandens ${esc(pa.name ?? 'ParcelsApp')}-nøkkel${left != null ? ` · ${left} oppslag igjen` : ''}${q.mine != null && q.limit ? ` · du har brukt ${q.mine} av ${q.limit}` : ''}</span>`;
}
/** Listen i Sporing → ⚙: én rad per leverandør, maskert nøkkel og «lagt inn av». Bare admin kan endre (på web). */
export function trkKeysSection() {
  tkLoad(); const L = TK.d?.providers ?? []; if (!L.length) return '';
  return `<span class="pp-lab">DELT I HUSSTANDEN</span><div class="pp-card pp-tight">${L.map((p) => `<div class="p37-tkr"><i class="${p.set ? (p.status === 'error' ? 'bad' : 'ok') : 'off'}"></i><span class="m-grow"><b>${esc(p.name ?? p.id)}</b><small>${p.set ? `Delt i husstanden${p.addedBy ? ` · lagt inn av ${esc(first(p.addedBy?.name ?? p.addedBy))}` : ''}` : 'Ikke satt opp'}</small></span><code>${p.set ? `••••${esc(p.tail ?? '')}` : '–'}</code></div>`).join('')}</div><span class="pp-mut" style="font-size:12px">${TK.d?.admin ? 'Endre nøklene under Innstillinger → Integrasjoner på web.' : 'Administreres av admin. Pakkene dine er alltid private.'}</span>`;
}

/* =====================================================================
   Lag, kroker og hendelser
   ===================================================================== */
export function layer37b(nPk = 0) {
  return (m.screen === 'hl' ? bibleSheet() + h2Sheet(nPk) : '') + obView();
}
let booted = false, hidAt = 0;
export function boot37b() {
  if (booted) return; booted = true;
  sess();
  // Prompt 39: sveip bort Hjem-kortet ligger i mobile-p39.js (felles motor med brief-kortet).
  // Ny økt når appen kommer tilbake fra bakgrunnen etter mer enn 5 minutter.
  document.addEventListener('visibilitychange', () => { if (document.hidden) hidAt = Date.now(); else if (hidAt && Date.now() - hidAt > 5 * 60e3) { ssSet(SESS, String(Date.now())); draw(); } });
}
export function afterDraw37b() { if (m.screen === 'hl') readWatch(); }
export function input37b(e, t) {
  const k = t.dataset?.p37bin; if (!k) return false;
  if (k === 'obn') { OB.newN = t.value; const b = document.querySelector('#app [data-p37b="ob2"]'); if (b) b.disabled = !t.value.trim(); return true; }
  if (k === 'trn') TRS.f.n = t.value; else if (k === 'tre') TRS.f.end = t.value; else if (k === 'trp') TRS.f.p = t.value.replace(/[^0-9]/g, '');
  return true;
}
export async function submit37b(e, t) {
  if (t.dataset?.p37bform !== 'trial') return false;
  e.preventDefault();
  const F = TRS.f; if (!F.n.trim() || !F.end) { haptic('err'); flash('Fyll inn tjeneste og sluttdato'); return true; }
  TRS.busy = true; draw();
  const body = { service: F.n.trim(), endsAt: F.end, priceAfter: F.p ? +F.p : null, remindOffsetsDays: [1, 0], remindAt: '09:00', source: 'form' };
  try { await api('/subscriptions/trials', { method: 'POST', json: body }); }
  catch (err) { if (err.status !== 404 && err.status !== 405) { TRS.busy = false; flash(err.message, 'err'); draw(); return true; } const L = lsGet('papir_trials', []) || []; L.push({ id: `t${Date.now()}`, ...body, status: 'active', local: true }); lsSet('papir_trials', L); }
  TRS.busy = false; TRS.add = false; TRS.f = { n: '', end: '', p: '' };
  const P31 = await import('./mobile-p31.js'); P31.G.trials = null; await P31.trialsLoad(true).catch(() => {});
  flash(`${body.service} er lagt til · Glimt minner deg på dagen før ✓`); draw(); return true;
}
async function trialSet(id, status) {
  const P31 = await import('./mobile-p31.js');
  try { await api(`/subscriptions/trials/${encodeURIComponent(id)}`, { method: 'PATCH', json: { status, res: status === 'kept' ? 'beholdt' : 'avsluttet' } }); }
  catch (e) { if (e.status === 404) { const L = (lsGet('papir_trials', []) || []).map((x) => (String(x.id) === String(id) ? { ...x, status } : x)); lsSet('papir_trials', L); } else { flash(e.message, 'err'); return; } }
  P31.G.trials = null; await P31.trialsLoad(true).catch(() => {});
}
export async function bind37b(e, t) {
  const x = t.closest?.('[data-p37b]');
  if (!x) {
    const c = t.closest?.('#app [data-p37bvc]');
    if (c && e.type === 'click' && c.closest('[data-p37bv]')) { BB.sheet = true; haptic('tap'); draw(); return true; }
    return false;
  }
  const a = x.dataset.p37b;
  if (a === 'bpage') { BB.sheet = false; return false; } // lenken åpner #/bibel
  e.preventDefault();
  const v = verse(per(), 0);
  switch (a) {
    case 'bcopy': { const vv = m.screen === 'brief' ? verse(new Date().getHours() >= 5 && new Date().getHours() < 17 ? 'm' : 'k') : v; try { await navigator.clipboard?.writeText(`«${vv.text}» ${vv.ref}`); } catch {} BB.copied = true; haptic('ok'); draw(); setTimeout(() => { BB.copied = false; draw(); }, 1600); return true; }
    case 'bnext': BB.off += 1; vib(6); draw(); return true;
    case 'bsx': BB.sheet = false; draw(); return true;
    case 'bshare': try { if (navigator.share) await navigator.share({ text: `«${v.text}» ${v.ref}` }); else { await navigator.clipboard?.writeText(`«${v.text}» ${v.ref}`); flash('Kopiert ✓'); } } catch {} return true;
    case 'bset': { const k = x.dataset.k, cur = BB.set?.[k] ?? (k !== 'notify'); BB.set = { ...(BB.set ?? { enabled: true }), [k]: !cur }; haptic('tab'); draw(); hlApi('/bible/settings', { method: 'PUT', json: { [k]: !cur } }).catch(() => {}); return true; }
    case 'bread': if (!days().has(todayIso())) await markRead(); return true;
    case 'bsave': { const S = skLocal(), on = S.saved.some((y) => y.ref === v.ref); S.saved = on ? S.saved.filter((y) => y.ref !== v.ref) : [{ t: v.text, ref: v.ref }, ...S.saved]; skSave(S); haptic('tap'); draw(); return true; }
    case 'srm': { const S = skLocal(); S.saved.splice(+x.dataset.i, 1); skSave(S); draw(); return true; }
    case 'bex': await explain(v); return true;
    case 'plan': { const S = skLocal(); if (S.plan !== x.dataset.k) { S.plan = x.dataset.k; S.pday = 0; S.pdone = null; skSave(S); } haptic('tab'); draw(); return true; }
    case 'pdone': { const S = skLocal(), td = todayIso(); if (S.pdone === td) return true; S.pday = Math.min(PL[S.plan]?.[1] ?? 21, (S.pday || 0) + 1); S.pdone = td; skSave(S); vib(10); if (!days().has(td)) await markRead(); else draw(); return true; }
    case 'rem': { const S = skLocal(); S.rem = !S.rem; skSave(S); hlApi('/bible/settings', { method: 'PUT', json: { notify: S.rem } }).catch(() => {}); if (S.rem && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); haptic('tab'); draw(); return true; }
    case 'obsel': { if (x.getAttribute('aria-disabled') === 'true') return true; OB.sel = x.dataset.k; OB.isNew = false; vib(8); draw(); return true; }
    case 'obnew': OB.isNew = true; OB.sel = null; draw(); setTimeout(() => document.getElementById('p37-obn')?.focus(), 60); return true;
    case 'ob2': if (OB.d?.locked && OB.sel) { await obLink(); return true; } OB.st = 2; vib(8); draw(); return true;
    case 'obback': OB.st = Math.max(1, OB.st - 1); draw(); return true;
    case 'obln': OB.ln[x.dataset.k] = !OB.ln[x.dataset.k]; haptic('tab'); draw(); return true;
    case 'oblink': await obLink(); return true;
    case 'obskip': OB.on = false; lsSet('p37_onb_done', true); draw(); return true;
    case 'obdone': OB.on = false; OB.checked = false; obCheck().catch(() => {}); if (location.hash !== '#/hl') location.hash = '#/hl'; else draw(); return true;
    case 'obopen': OB.checked = false; await obCheck(true); if (!OB.on) flash('Serveren har ikke profiler ennå'); return true;
    case 'famopen': { const P31 = await import('./mobile-p31.js'), P16 = await import('./mobile-p16.js'); P31.G.ans = null; if (x.dataset.k) P16.FM.sel = x.dataset.k; haptic('tap'); location.hash = '#/fam'; return true; }
    case 'h2x': H2.open = false; draw(); return true;
    case 'h2auto': h2save({ auto: !h2opt().auto }); haptic('tab'); draw(); return true;
    case 'h2n': h2save({ n: +x.dataset.v }); haptic('tab'); draw(); return true;
    case 'tradd': TRS.add = !TRS.add; draw(); if (TRS.add) setTimeout(() => document.getElementById('p37-trn')?.focus(), 60); return true;
    case 'trcancel': { const u = x.dataset.u || `https://www.google.com/search?q=${encodeURIComponent('avslutt abonnement')}`; window.open(u, '_blank', 'noopener'); await trialSet(x.dataset.id, 'cancelled'); flash('Markert som avsluttet ✓'); draw(); return true; }
    case 'trkeep': { await trialSet(x.dataset.id, 'kept'); const S = await import('./mobile-subs.js'); await S.subsLoad?.().catch(() => {}); flash('Beholdt · lagt til som abonnement ✓'); draw(); return true; }
    default: return false;
  }
}
