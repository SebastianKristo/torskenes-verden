// Prompt 36 (PWA36): mobilpunktene i prompt-36-pakken (design_handoff_homelab/prompts/prompt-36-pakke/).
//  1. Glimt-brief: fast bredde mens Glimt guider, ringen som outline rundt selve kortet (CSS i mobile.css), og
//     sveip bort brief-kortet på Hjem fra venstre mot høyre med animasjon, hint de 2 første gangene og «Now Brief» i Mer
//     (claude-code-glimt-brief.md, fasit Mobil Papir App.dc.html → bsVals()).
//  2. Glimt: bare ÉN visning om gangen. Spørsmål svares i kortet under søket, handlinger går i pillen øverst.
//     Spørsmål med dato blir ikke kalenderavtaler, og dagslys/soloppgang/solnedgang regnes ut lokalt
//     (claude-code-glimt-en-indikator.md, fasit hsVals() isQ).
//  3. Nordlys OS: Sherlock-Glimt ved «Se etter», snekker-Glimt på fremdriftslinja, «Starter opp»-overlegg med Glimt
//     mens serveren starter, og TIDLIGERE VERSJONER (claude-code-system-oppdatering-nordlys.md, -nordlys-oppstartsside.md).
//  4. Konto med profilbilde (beskjæring i sirkel, 512 × 512 WebP), ikon på hver rad i Innstillinger, trykk/hold på
//     temperaturen (Vær / Yr), Mat «Felles for husstanden» med sanntid, og kvittering for backup til nettverksdisk.
// API (kontrakt 36, SERVER36): GET /api/system/changelog, GET /api/health {ready, steps}, PUT/DELETE /api/me/avatar,
// /api/assist → kind:'question'|'action', meal:changed på /api/ws, /api/backup/list med {fullPath, verified …}.
// Alt tåler 404 fra en eldre server.
import { esc, hlApi } from './core.js';
import { m, draw, flash, loadMe, meName, avatarUrl, avInner } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import * as P35 from './mobile-p35.js';
import * as P37B from './mobile-p37b.js'; // prompt 37: Profil i husstanden (onboarding)

const pad = (n) => String(n).padStart(2, '0');
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const svg = (d, s = 18, w = 2, extra = '') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}><path d="${d}"/></svg>`;
const CK = 'M5 12.5l4.5 4.5L19 7.5';

/* =====================================================================
   1. Sveip bort brief-kortet på Hjem (venstre → høyre)
   ===================================================================== */
// Skjult til neste brief: lagres per dag og periode (morgen < 11, dag < 17, kveld < 21, natt) i glimt_brief_hide.
const HIDE = 'glimt_brief_hide', HINT = 'glimt_brief_swhint';
const period = (h = new Date().getHours()) => (h < 11 ? 'morgen' : h < 17 ? 'dag' : h < 21 ? 'kveld' : 'natt');
const bsKey = () => `${new Date().toDateString()}|${period()}`;
const nextBrief = () => { const h = new Date().getHours(); return h < 11 ? 'dagsbriefen kl. 11' : h < 17 ? 'kveldsbriefen kl. 17' : h < 21 ? 'nattbriefen kl. 21' : 'morgenbriefen kl. 07'; };
export const briefHidden = () => lsGet(HIDE) === bsKey();
const BS = { g: null, moved: 0, ph: '', toast: false, toT: null, hint: false, hintT: null, visit: false, lastScr: null };

/** Hjem-kortet h12 med sveip. Skjult (og ikke i redigering) → ingenting, så widgetene under glir opp. */
export function briefCard(inner, editing = false) {
  if (!inner) return '';
  if (briefHidden() && !editing) return '';
  if (editing) return inner;
  const hint = BS.hint && !reduce();
  return `<div class="p36-bs${hint ? ' hint' : ''}" data-p36bs>
    <div class="p36-bsr" aria-hidden="true"><span class="p36-bsi">${svg(CK, 15, 2.8)}</span><span class="p36-bst"><b>${hint ? 'Sveip → for å skjule' : 'Sveip for å skjule'}</b><span>Kommer tilbake med ${esc(nextBrief())}</span></span></div>
    <div class="p36-bsc" data-p36bsc>${inner}</div></div>`;
}
const bsEls = () => { const w = document.querySelector('#app [data-p36bs]'); return w ? { w, c: w.querySelector('[data-p36bsc]'), r: w.querySelector('.p36-bsr'), b: w.querySelector('.p36-bst b'), i: w.querySelector('.p36-bsi') } : null; };
function bsPaint(dx, W) {
  const E = bsEls(); if (!E) return;
  const p = Math.min(1, dx / (W * 0.38));
  E.c.style.transition = 'none';
  E.c.style.transform = `translateX(${dx}px) rotate(${((dx / W) * 5).toFixed(2)}deg)`;
  E.r.style.opacity = dx > 4 ? String(Math.min(1, 0.35 + p)) : '0';
  E.w.classList.toggle('arm', p >= 1);
  E.i.style.transform = `scale(${p >= 1 ? 1.15 : (0.7 + p * 0.3).toFixed(2)})`;
  E.b.textContent = p >= 1 ? 'Slipp for å skjule' : 'Sveip for å skjule';
}
function bsHintOff() {
  if (!BS.hint) return;
  BS.hint = false; clearTimeout(BS.hintT);
  const E = bsEls(); if (E) { E.w.classList.remove('hint'); E.b.textContent = 'Sveip for å skjule'; }
}
function bsDown(e) {
  const c = e.target.closest?.('#app [data-p36bsc]');
  if (!c || (e.button ?? 0) > 0 || BS.ph) return;
  bsHintOff();
  BS.g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), W: c.getBoundingClientRect().width || 360, lock: null, dx: 0, armed: false };
  BS.moved = 0;
}
function bsMove(e) {
  const g = BS.g; if (!g || e.pointerId !== g.id) return;
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (g.lock == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) g.lock = Math.abs(dx) > Math.abs(dy) * 1.2 && dx > 0 ? 'x' : 'y';
  if (g.lock !== 'x') { if (g.lock === 'y') BS.g = null; return; }
  if (e.cancelable) e.preventDefault();
  if (!BS.moved) { try { bsEls()?.c.setPointerCapture?.(e.pointerId); } catch {} }
  BS.moved = Date.now();
  g.dx = Math.max(0, dx);
  const arm = g.dx >= g.W * 0.38;
  if (arm && !g.armed) haptic('tick');
  g.armed = arm;
  bsPaint(g.dx, g.W);
}
function bsUp(e) {
  const g = BS.g; if (!g || e.pointerId !== g.id) return;
  BS.g = null;
  if (g.lock !== 'x') return;
  BS.moved = Date.now();
  const vel = g.dx / Math.max(1, performance.now() - g.t), E = bsEls();
  if (!E) return;
  if (g.dx >= g.W * 0.38 || (g.dx > 60 && vel > 0.6)) { bsDismiss(E); return; }
  // Under terskelen: kortet fjærer tilbake (0,38 s, lett overshoot).
  E.c.style.transition = 'transform .38s cubic-bezier(.3,1.4,.5,1)'; E.c.style.transform = '';
  E.r.style.transition = 'opacity .3s'; E.r.style.opacity = '0'; E.w.classList.remove('arm');
}
function bsDismiss(E) {
  BS.ph = 'out'; vib([8, 30, 12]);
  E.w.classList.add('arm', 'out'); E.b.textContent = 'Brief skjult';
  E.r.style.opacity = '1'; E.i.style.transform = 'scale(1.15)';
  E.c.style.transition = reduce() ? 'opacity .25s' : 'transform .34s cubic-bezier(.4,0,.6,1)';
  if (reduce()) E.c.style.opacity = '0'; else E.c.style.transform = 'translateX(115%) rotate(7deg)';
  setTimeout(() => {
    // Høyden kollapser til 0, så de andre widgetene glir opp.
    const host = E.w.closest('.pp-ed') ?? E.w;
    host.style.maxHeight = `${host.offsetHeight}px`; host.style.overflow = 'hidden';
    requestAnimationFrame(() => { host.style.transition = 'max-height .34s cubic-bezier(.4,0,.2,1) .05s, opacity .25s, margin .34s'; host.style.maxHeight = '0px'; host.style.opacity = '0'; host.style.marginTop = '0'; host.style.marginBottom = '0'; });
    setTimeout(() => {
      lsSet(HIDE, bsKey()); BS.ph = ''; BS.toast = true; draw();
      clearTimeout(BS.toT); BS.toT = setTimeout(() => { BS.toast = false; draw(); }, 4500);
    }, 420);
  }, 340);
}
export function briefUndo() { lsSet(HIDE, null); clearTimeout(BS.toT); BS.toast = false; BS.ph = ''; haptic('tap'); draw(); }
/** Mer: undertekst for Now Brief. */
export const briefMerSub = () => (briefHidden() ? 'Skjult på Hjem · trykk for å åpne' : 'Glimt oppsummerer dagen');
// Hintet: de 2 første gangene Hjem åpnes glir kortet 72 px til høyre og tilbake, så 40 px og tilbake (bsNudge 2,4 s).
function bsVisit() {
  const n = +(lsGet(HINT) ?? 0) || 0;
  if (n >= 2 || briefHidden() || P35.cfg().brief === false) return;
  lsSet(HINT, String(n + 1));
  clearTimeout(BS.hintT);
  BS.hintT = setTimeout(() => {
    if (m.screen !== 'hl' || !document.querySelector('#app [data-p36bs]')) return;
    BS.hint = true; const E = bsEls(); if (E) { E.w.classList.add('hint'); E.b.textContent = 'Sveip → for å skjule'; }
    BS.hintT = setTimeout(bsHintOff, 3000);
  }, 1200);
}

/* =====================================================================
   2. Spørsmål eller handling (én Glimt-visning om gangen)
   ===================================================================== */
const B = '(?=[\\s,.!?:;]|$)';
const Q_START = new RegExp(`^(spørsmål|spm|hva|hvor|hvem|hvilken|hvilket|hvilke|hvordan|hvorfor|når|kan du|vet du|fortell|er det|blir det|what|when|where|how|who|why|which)${B}`, 'i');
const Q_IN = new RegExp(`(^|\\s)(hvor (mange|mye|lenge|langt)|hva er|hva blir|hva skjer|når går|når er|hvordan blir)${B}`, 'i');
const ACT_START = new RegExp(`^(legg (til|inn)|book|bestill|påminn|minn meg|husk å|lagre|last opp|avbestill|add|remind me)${B}`, 'i');
/** Spørsmål: «?», spørreord først, eller «hvor mange / hva er …». Eksplisitt «legg til / book / bestill / påminn» er handling. */
export function isQ(t) {
  const s = String(t ?? '').trim().replace(/^["«]/, '');
  if (!s || ACT_START.test(s)) return false;
  return s.includes('?') || Q_START.test(s) || Q_IN.test(s);
}
/** Handling/beskjed (noe skal gjøres i bakgrunnen): handlingsverb uten spørsmål. */
export const isAction = (t) => !isQ(t) && (ACT_START.test(String(t ?? '').trim()) || /(^|\s)(påminn|påminnelse|legg til|avbestill|si opp)(\s|$)/i.test(String(t ?? '')));
/** Intensjonsord som hele ord: «timer», «timeplan» og «sommertid» teller ikke som «time». */
export const hasApptWord = (t) => /(^|[^\p{L}])(time|timen|timeavtale|avtale|avtalen)(?![\p{L}])/iu.test(String(t ?? ''));

/* ---------- Dagslys, soloppgang og solnedgang (suncalc-formelen, lokalt) ---------- */
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const SUN_RE = /dagslys|soloppgang|solnedgang|sola (går|står|stiger)|sol(a)? opp|sol(a)? ned|lyst ute|daylight|sunrise|sunset/i;
export const isSunQ = (q) => SUN_RE.test(String(q ?? ''));
function dateIn(q) {
  const s = String(q ?? '').toLowerCase(), now = new Date();
  let x = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s);
  if (x) return new Date(+x[3] < 100 ? 2000 + +x[3] : +x[3], +x[2] - 1, +x[1], 12);
  x = new RegExp(`(\\d{1,2})\\.?\\s*(${MON.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|des)\\w*\\s*(\\d{4})?`).exec(s);
  if (x) { const mi = MON.findIndex((mn) => mn.startsWith(x[2].slice(0, 3))); return new Date(x[3] ? +x[3] : now.getFullYear(), mi, +x[1], 12); }
  x = /(^|\s)(\d{1,2})\.(\d{1,2})(?![.\d])/.exec(s);
  if (x) return new Date(now.getFullYear(), +x[3] - 1, +x[2], 12);
  if (/i\s*morgen|tomorrow/.test(s)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}
/** suncalc (Agafonkin, BSD): soloppgang/-nedgang for dato og sted. Ingen avhengighet. */
export function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397, sin = Math.sin, cos = Math.cos;
  const toDays = (d) => d.valueOf() / 864e5 - 0.5 + J1970 - J2000, fromJ = (j) => new Date((j + 0.5 - J1970) * 864e5);
  const lw = rad * -lon, phi = rad * lat, d = toDays(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)));
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI)), ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds), C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI, dec = Math.asin(sin(e) * sin(L));
  const Jnoon = J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
  const cw = (sin(rad * -0.833) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec));
  if (cw < -1) return { polar: 'day', noon: fromJ(Jnoon) };
  if (cw > 1) return { polar: 'night', noon: fromJ(Jnoon) };
  const w = Math.acos(cw), a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
  const Jset = J2000 + a + 0.0053 * sin(M) - 0.0069 * sin(2 * L), Jrise = Jnoon - (Jset - Jnoon);
  return { rise: fromJ(Jrise), set: fromJ(Jset), noon: fromJ(Jnoon) };
}
const hmTz = (d, tz) => { try { return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'Europe/Oslo' }).replace('.', ':'); } catch { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; } };
/** Svar på «hvor mange timer med dagslys er det 29.06.2027 (i Oslo)?» → {text, open, src}. */
export async function sunAnswer(q) {
  const day = dateIn(q), name = P35.wxPlace(q);
  let P = { name: 'Oslo', lat: 59.9139, lon: 10.7522, tz: 'Europe/Oslo' };
  if (name && !/^oslo$/i.test(name)) {
    try { const r = await hlApi(`/weather/place?q=${encodeURIComponent(name)}`); const x = r?.place; if (x?.lat != null) P = { name: x.label ?? x.name ?? name, lat: +x.lat, lon: +x.lon, tz: x.timezone ?? x.tz ?? null }; }
    catch {
      try { const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=nb`).then((x) => x.json()); const x = g?.results?.[0]; if (x) P = { name: x.name, lat: x.latitude, lon: x.longitude, tz: x.timezone }; } catch {}
    }
  } else if (!name) {
    const W = (await import('./mobile-hl.js')).hlData?.()?.weather;
    if (W?.lat != null) P = { name: W.place || 'Oslo', lat: +W.lat, lon: +W.lon, tz: 'Europe/Oslo' };
  }
  const T = sunTimes(day, P.lat, P.lon), dl = `${day.getDate()}. ${MON[day.getMonth()]} ${day.getFullYear()}`;
  let text;
  if (T.polar === 'day') text = `${dl} i ${P.name}: **midnattssol**, sola går ikke ned (24 t dagslys).`;
  else if (T.polar === 'night') text = `${dl} i ${P.name}: **mørketid**, sola står ikke opp.`;
  else { const min = Math.round((T.set - T.rise) / 60000); text = `${dl} i ${P.name}: soloppgang ${hmTz(T.rise, P.tz)}, solnedgang ${hmTz(T.set, P.tz)}, **${Math.floor(min / 60)} t ${min % 60} min dagslys**.`; }
  return { text, open: { route: 'vaer', name: P.name, lat: P.lat, lon: P.lon, label: P.name }, src: 'Glimt · sol og dagslys', kind: 'question' };
}

/* =====================================================================
   3. Drakter: Sherlock (Se etter oppdatering) og snekker (mens den oppdaterer)
   ===================================================================== */
const CHK = (id) => `<defs><pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#8a6a45"/><rect width="4" height="8" fill="#a5825a" opacity=".8"/><rect width="8" height="4" fill="#6f5333" opacity=".55"/></pattern></defs>`;
let pid = 0;
/** Glimt (brukerens figur) med Sherlock-drakt: deerstalker, rutete kappe og forstørrelsesglass. */
export function sherlockFig(S = 52) {
  const id = `p36sh${++pid}`, f = `url(#${id})`;
  const hat = `<svg class="p36-shh" width="${S * 1.05}" height="${S * 0.62}" viewBox="0 0 100 60" style="left:50%;top:${-S * 0.36}px;margin-left:${-S * 0.525}px">${CHK(id)}<path d="M6 44 Q2 52 14 50 L30 44 Z" fill="${f}" stroke="#4e3920" stroke-width="1.5"/><path d="M94 44 Q98 52 86 50 L70 44 Z" fill="${f}" stroke="#4e3920" stroke-width="1.5"/><path d="M14 46 Q14 10 50 8 Q86 10 86 46 Z" fill="${f}" stroke="#4e3920" stroke-width="1.6"/><path d="M50 8 L50 46" stroke="#4e3920" stroke-width="1" opacity=".5"/><path d="M22 40 Q12 52 20 58 Q26 52 28 42 Z" fill="${f}" stroke="#4e3920" stroke-width="1.3"/><path d="M78 40 Q88 52 80 58 Q74 52 72 42 Z" fill="${f}" stroke="#4e3920" stroke-width="1.3"/><path d="M43 6 Q50 0 57 6 Q50 9 43 6 Z" fill="#6f5333" stroke="#4e3920" stroke-width="1.2"/></svg>`;
  const cape = `<svg class="p36-shc" width="${S * 1.2}" height="${S * 0.5}" viewBox="0 0 120 50" style="left:50%;bottom:${-S * 0.12}px;margin-left:${-S * 0.6}px"><path d="M14 4 Q60 22 106 4 L114 40 Q60 52 6 40 Z" fill="${f}" stroke="#4e3920" stroke-width="1.6" opacity=".96"/></svg>`;
  const glass = `<span class="p36-shg" style="right:${-S * 0.62}px;top:${S * 0.28}px;width:${S * 0.7}px;height:${S * 0.7}px"><svg width="${S * 0.7}" height="${S * 0.7}" viewBox="0 0 50 50"><line x1="6" y1="44" x2="20" y2="30" stroke="#5b3d1e" stroke-width="6" stroke-linecap="round"/><circle cx="30" cy="20" r="15" fill="rgba(190,230,255,.35)" stroke="#c8a24a" stroke-width="4"/><path d="M22 13 Q26 9 31 9" stroke="rgba(255,255,255,.85)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg></span>`;
  return `<span class="p36-fig">${cape}${P35.fig(P35.hostFor(), S, 'talk')}${hat}${glass}</span>`;
}
/** Snekker-drakt: gul vernehjelm, verktøybelte og hammer, med 3 spon ved slaget. mood: run | done | fail. */
export function carpFig(S = 30, mood = 'run') {
  const hat = mood === 'done' ? '' : `<svg class="p36-cph" width="${S * 0.95}" height="${S * 0.5}" viewBox="0 0 100 52" style="left:50%;top:${-S * 0.24}px;margin-left:${-S * 0.475}px"><path d="M14 40 Q14 6 50 4 Q86 6 86 40 Z" fill="#f2c14e" stroke="#b8860b" stroke-width="2"/><path d="M50 4 L50 40" stroke="#d9a520" stroke-width="6"/><rect x="2" y="38" width="96" height="9" rx="4.5" fill="#e0ad2c" stroke="#b8860b" stroke-width="2"/><path d="M26 16 Q34 10 42 9" stroke="rgba(255,255,255,.7)" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  const belt = `<svg class="p36-cpb" width="${S * 1.02}" height="${S * 0.34}" viewBox="0 0 100 34" style="left:50%;bottom:${S * 0.1}px;margin-left:${-S * 0.51}px"><rect x="4" y="2" width="92" height="9" rx="4" fill="#8a5a2b" stroke="#5b3a1a" stroke-width="1.5"/><rect x="44" y="1" width="12" height="11" rx="2" fill="none" stroke="#c8a24a" stroke-width="2"/><path d="M12 10 h20 v16 q-10 6 -20 0 z" fill="#a06a33" stroke="#5b3a1a" stroke-width="1.5"/><path d="M68 10 h18 v13 q-9 5 -18 0 z" fill="#a06a33" stroke="#5b3a1a" stroke-width="1.5"/><rect x="20" y="0" width="3" height="12" fill="#6b6b6b"/><rect x="76" y="-6" width="4" height="16" rx="1" fill="#b23a2a"/></svg>`;
  const ham = mood === 'run' ? `<span class="p36-cpm" style="right:${-S * 0.5}px;top:${S * 0.1}px;width:${S * 0.7}px;height:${S * 0.7}px"><svg width="${S * 0.7}" height="${S * 0.7}" viewBox="0 0 50 50"><g transform="rotate(-35 11 45)"><rect x="8" y="14" width="7" height="34" rx="3" fill="#a06a33" stroke="#5b3a1a" stroke-width="1.4"/><path d="M14 4 h22 v10 h-22 z" fill="#9aa3ad" stroke="#4c535b" stroke-width="1.6"/><path d="M36 4 q8 4 4 10 h-4 z" fill="#7d858e"/></g></svg></span>` : '';
  const chips = mood === 'run' ? [0, 1, 2].map((i) => `<i class="p36-cpc" style="right:${-S * (0.55 + i * 0.05)}px;background:${i === 1 ? '#f2c14e' : '#c8925a'};--cx:${8 + i * 7}px;--cy:${-10 - i * 5}px;animation-delay:${(i * 0.05).toFixed(2)}s"></i>`).join('') : '';
  const q = mood === 'fail' ? '<b class="p36-cpq">?</b>' : '';
  return `<span class="p36-fig p36-cp ${mood}">${P35.fig(P35.hostFor(), S, mood === 'fail' ? 'idle' : mood === 'done' ? 'glad' : 'idle')}${belt}${hat}${ham}${chips}${q}</span>`;
}
/** Snekkeren står oppå linja ved enden av fyllet (left = pct, holdt innenfor kortet). */
export function carpOnBar(pct, S = 30, mood = 'run', padTop = 40) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return `<span class="p36-carp ${mood}" aria-hidden="true" style="top:${padTop - S - 1}px;left:clamp(${S * 0.6}px,${p}%,calc(100% - ${S * 1.1}px));margin-left:${-S * 0.5}px">${carpFig(S, mood)}</span>`;
}
// Snekker-status: haptikk hvert 25 %, vinker 0,8 s når den er ferdig.
const CP = { q: -1, st: null, doneAt: 0 };
export function carpState(st, pct) {
  if (st === 'run') { const q = Math.floor(pct / 25); if (CP.q >= 0 && q > CP.q) haptic('tick'); CP.q = q; }
  if (CP.st === 'run' && st === 'done') { CP.doneAt = Date.now(); setTimeout(draw, 900); }
  if (st !== 'run') CP.q = -1;
  CP.st = st;
  return st === 'run' ? 'run' : st === 'fail' ? 'fail' : st === 'done' && Date.now() - CP.doneAt < 800 ? 'done' : null;
}

/* ---------- Sherlock i Nordlys-heroen ---------- */
// Flybanen (shFlyM 3,6 s) styres av starttiden. draw() bygger heroen på nytt, så figuren tegnes med negativ
// animation-delay og fortsetter der den var.
const SH = { t0: 0, res: null, T: null };
export function sherlockStart() {
  SH.t0 = Date.now(); SH.res = null; vib(8);
  clearTimeout(SH.T); SH.T = setTimeout(() => { SH.t0 = 0; draw(); }, 3700);
}
export function sherlockResult(fresh, ver = '') {
  // Kom svaret sent (treg GitHub), hoppes animasjonen tilbake til «leter»-delen så boblen rekker å vises.
  const el = Date.now() - SH.t0; if (el > 2450) SH.t0 = Date.now() - 2450;
  clearTimeout(SH.T); SH.T = setTimeout(() => { SH.t0 = 0; draw(); }, 3700 - Math.min(el, 2450));
  SH.res = fresh ? 'Elementært! Du har siste versjon.' : `Aha! Jeg fant Nordlys ${String(ver).replace(/^v/, '').split('.').slice(0, 2).join('.')}.`; vib([8, 40, 8]); }
export const sherlockBusy = () => SH.t0 && Date.now() - SH.t0 < 3700;
export function sherlockHtml() {
  if (!sherlockBusy()) return '';
  const el = Date.now() - SH.t0, dl = `animation-delay:-${el}ms`;
  return `<span class="p36-sher${reduce() ? ' rm' : ''}" aria-hidden="true" style="${dl}"><span class="p36-shbob">${sherlockFig(52)}</span>${SH.res ? `<span class="p36-shb" style="${dl}">${esc(SH.res)}</span>` : ''}</span>`;
}

/* =====================================================================
   4. «Starter opp» med Glimt (mens serveren starter på nytt)
   ===================================================================== */
const ST_STEPS = [['db', 'Starter databasen'], ['migrate', 'Kjører migrasjoner'], ['api', 'Starter web og API'], ['ai', 'Vekker Glimt og AI-modellene'], ['integrations', 'Kobler til integrasjoner']];
const LINES = ['Serveren starter på nytt etter oppdateringen. Glimt sover litt …', 'Glimt våkner og sjekker at alt er på plass.', 'Nesten klar. Glimt varmer opp modellene.', 'Alt kjører! Laster inn Homelab …'];
const BOOT = { el: null, t0: 0, poll: null, tick: null, steps: null, ready: false, ver: '', why: '', closing: false };
/** Viser overlegget (idempotent). why: 'update' | 'lost'. */
export function startingShow(why = 'update', ver = '') {
  if (BOOT.el) { if (ver) BOOT.ver = ver; return; }
  BOOT.t0 = Date.now(); BOOT.ready = false; BOOT.steps = null; BOOT.why = why; BOOT.ver = ver; BOOT.closing = false;
  const el = document.createElement('div');
  el.className = `p36-boot${reduce() ? ' rm' : ''}`; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Starter opp');
  const R = 92, C = 2 * Math.PI * R;
  el.innerHTML = `<span class="p36-baur" aria-hidden="true"><i></i></span><div class="p36-bin">
    <span class="p36-bhero"><svg width="208" height="208" viewBox="0 0 208 208" class="p36-bring" aria-hidden="true"><defs><linearGradient id="p36nsG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3fbf9a"/><stop offset="55%" stop-color="#ffd9c2"/><stop offset="100%" stop-color="#ff8a5c"/></linearGradient></defs><circle cx="104" cy="104" r="${R}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="5"/><circle class="p36-bprog" cx="104" cy="104" r="${R}" fill="none" stroke="url(#p36nsG)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
      <span class="p36-borb" aria-hidden="true">${[0, 120, 240].map((a) => `<i style="background:${a === 0 ? '#ffd9c2' : a === 120 ? '#3fbf9a' : '#a78bfa'};transform:rotate(${a}deg) translateY(-104px)"></i>`).join('')}</span>
      <span class="p36-bfig"></span><span class="p36-bz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span><span class="p36-bpct">0 %</span></span>
    <div class="p36-bt"><span class="p36-bk">STARTER OPP</span><b>Nordlys<span>OS</span> <em class="p36-bv"></em></b><span class="p36-bl" aria-live="polite"></span></div>
    <div class="p36-bsteps"></div>
    <div class="p36-bf"><span class="p36-bft"></span><button type="button" class="p36-brl" hidden>Last inn på nytt nå</button><a class="p36-blog" href="#/nordlys" hidden>Vis logg</a></div></div>`;
  el.querySelector('.p36-brl').addEventListener('click', () => location.reload());
  el.querySelector('.p36-blog').addEventListener('click', () => startingHide(true));
  document.body.appendChild(el); BOOT.el = el; BOOT.sig = '';
  document.documentElement.classList.add('p36-booting');
  // Prompt 38: samme farge bak overlegget og i statuslinja, så overgangene ikke blinker hvitt.
  BOOT.tc = document.querySelector('meta[name=theme-color]')?.getAttribute('content') ?? null;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#101a2e');
  bootPaint(); clearInterval(BOOT.tick); BOOT.tick = setInterval(bootPaint, 1000);
  clearTimeout(BOOT.poll); bootPoll();
}
export function startingHide(now = false) {
  clearInterval(BOOT.tick); clearTimeout(BOOT.poll);
  const el = BOOT.el; BOOT.el = null; document.documentElement.classList.remove('p36-booting');
  if (!el) return;
  if (BOOT.tc) document.querySelector('meta[name=theme-color]')?.setAttribute('content', BOOT.tc);
  if (now || reduce()) el.remove(); else { el.classList.add('bye'); setTimeout(() => el.remove(), 380); }
}
export const startingOn = () => !!BOOT.el;
function bootIdx() {
  const s = BOOT.steps;
  if (BOOT.ready) return ST_STEPS.length;
  if (!s) return 0;
  const i = ST_STEPS.findIndex(([id]) => (s.find((x) => x.id === id)?.status ?? 'wait') !== 'ok');
  return i < 0 ? ST_STEPS.length : i;
}
function bootPaint() {
  const el = BOOT.el; if (!el) return;
  const i = bootIdx(), done = BOOT.ready, phase = done ? 3 : i < 2 ? 0 : i < 4 ? 1 : 2, mood = phase === 0 ? 'sov' : phase === 3 ? 'talk' : 'idle';
  const pct = done ? 100 : Math.round((i / ST_STEPS.length) * 100), C = 2 * Math.PI * 92;
  el.classList.toggle('sleep', phase === 0); el.classList.toggle('awake', phase > 0);
  const fg = el.querySelector('.p36-bfig');
  if (fg.dataset.mood !== mood) { fg.dataset.mood = mood; fg.innerHTML = P35.fig(P35.hostFor(), 128, mood); }
  el.querySelector('.p36-bprog').style.strokeDashoffset = String(C * (1 - pct / 100));
  el.querySelector('.p36-bpct').textContent = `${pct} %`;
  el.querySelector('.p36-bk').textContent = done ? 'KLAR' : 'STARTER OPP';
  el.querySelector('.p36-bv').textContent = String(BOOT.ver || '').replace(/^v/, '').split('.').slice(0, 2).join('.');
  el.querySelector('.p36-bl').textContent = LINES[phase];
  const S = BOOT.steps ?? [];
  // Prompt 38 (flimmer): steglista bygges bare på nytt når status endres – ellers startet ✓-animasjonen hvert sekund.
  const S0 = BOOT.steps ?? [], sig = `${i}|${done}|${S0.map((x) => `${x.id}:${x.status}:${x.ms ?? ''}`).join(',')}`;
  if (sig !== BOOT.sig) { BOOT.sig = sig; el.querySelector('.p36-bsteps').innerHTML = ST_STEPS.map(([id, n], k) => {
    const x = S.find((y) => y.id === id), ok = done || k < i, on = !ok && k === i, ms = x?.ms ?? null;
    return `<div class="p36-brow${ok ? ' ok' : on ? ' on' : ''}"><span class="p36-bic">${ok ? `<svg width="20" height="20" viewBox="0 0 24 24" class="p36-bok"><circle cx="12" cy="12" r="11" fill="#2f7d4f"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : on ? '<i class="p36-bsp"></i>' : '<i class="p36-bw"></i>'}</span><span class="p36-bn">${esc(x?.label || n)}</span><span class="p36-bms">${ok && ms != null ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : on ? '…' : ''}</span></div>`;
  }).join(''); }
  const s = Math.floor((Date.now() - BOOT.t0) / 1000);
  el.querySelector('.p36-bft').textContent = done ? 'Laster inn siden …' : s >= 180 ? 'Det tar lengre tid enn vanlig' : `Siden lastes inn automatisk når serveren svarer · ${s} s`;
  el.querySelector('.p36-brl').hidden = done || s < 40;
  el.querySelector('.p36-blog').hidden = done || s < 180;
}
/** GET /api/health hvert 1,5 s. Ikke svar / 502 / 503 = første steg aktivt. Svar uten ready-feltet (eldre server) = klar. */
async function bootPoll() {
  if (!BOOT.el) return;
  let ready = false;
  try {
    const r = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' });
    if (r.status === 502 || r.status === 503 || r.status === 504) ready = false;
    else {
      const j = (r.headers.get('content-type') || '').includes('json') ? await r.json().catch(() => null) : null;
      if (j && Array.isArray(j.steps)) BOOT.steps = j.steps;
      if (j?.version) BOOT.ver = j.version;
      ready = j && 'ready' in j ? j.ready === true : r.status < 500;
    }
  } catch { ready = false; }
  if (!BOOT.el) return;
  if (ready) {
    BOOT.ready = true; clearInterval(BOOT.tick); bootPaint(); haptic('ok');
    setTimeout(async () => {
      // Mobil: hent versjonen på nytt og fjern overlegget. Ny versjon → nytt appskall (service worker) og ny innlasting.
      let v = null; try { v = await hlApi('/system/version'); } catch {}
      const cur = v?.current ?? v?.version ?? null;
      if (BOOT.why === 'update' && cur && BOOT.ver && cur !== BOOT.ver) {
        try { const reg = await navigator.serviceWorker?.getRegistration?.('/finans/'); await reg?.update(); reg?.waiting?.postMessage('skipWaiting'); } catch {}
        // Prompt 38: fade ut 0,3 s før innlastingen (mørk bakgrunn i mellomtiden), så det ikke blinker hvitt.
        document.documentElement.classList.add('p38-reload'); BOOT.el?.classList.add('bye'); setTimeout(() => location.reload(), 300); return;
      }
      startingHide(); draw();
    }, 800);
    return;
  }
  bootPaint();
  BOOT.poll = setTimeout(bootPoll, 1500);
}
// Mistet kontakt utenom oppdatering: sjekk /api/health når appen kommer tilbake (502/503 → overlegget).
async function healthProbe() {
  if (BOOT.el || document.hidden || !navigator.onLine) return;
  try { const r = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' }); if (r.status === 502 || r.status === 503) startingShow('lost'); } catch {}
}

/* =====================================================================
   5. TIDLIGERE VERSJONER (Nordlys-siden)
   ===================================================================== */
export const HV = { items: null, more: false, busy: false, miss: false, open: '', t: 0 };
const dNo = (v) => { const d = new Date(v ?? ''); return Number.isNaN(+d) ? String(v ?? '') : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
const dtNo = (v) => { const d = new Date(v ?? ''); return Number.isNaN(+d) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} kl. ${pad(d.getHours())}.${pad(d.getMinutes())}`; };
/** Punkter: tomme («Kalender:») hoppes over, underpunkter flates ut som «Kalender: …». */
export function flatNotes(list) {
  const out = [];
  const ok = (t) => { const v = String(t ?? '').replace(/^[-*•\s]+/, '').trim(); return v && !/^[^:]{1,40}:\s*$/.test(v) ? v : null; };
  for (const x of Array.isArray(list) ? list : []) {
    if (typeof x === 'string') { const v = ok(x); if (v) out.push(v); continue; }
    const head = String(x?.text ?? x?.title ?? '').replace(/:\s*$/, '').trim(), kids = x?.items ?? x?.children ?? x?.notes ?? [];
    if (Array.isArray(kids) && kids.length) for (const k of kids) { const v = ok(typeof k === 'string' ? k : k?.text); if (v) out.push(head ? `${head}: ${v}` : v); }
    else { const v = ok(head); if (v) out.push(v); }
  }
  return out;
}
export async function histLoad(more = false) {
  if (HV.busy || HV.miss || (!more && HV.items && Date.now() - HV.t < 10 * 60e3)) return;
  HV.busy = true;
  const before = more && HV.items?.length ? `&before=${encodeURIComponent(HV.items[HV.items.length - 1].version)}` : '';
  try {
    const r = await hlApi(`/system/changelog?limit=20${before}`);
    const L = (Array.isArray(r) ? r : r?.items ?? []).map((x) => ({ version: String(x.version ?? '').replace(/^v/, ''), date: x.date ?? '', notes: flatNotes(x.notes ?? x.items ?? []), installedAt: x.installedAt ?? null, failed: !!x.failed, log: x.logUrl ?? null })).filter((x) => x.version);
    HV.items = more ? [...(HV.items ?? []), ...L] : L; HV.more = !!r?.more; HV.t = Date.now();
  } catch (e) { if (e.status === 404 || e.status === 405) HV.miss = true; HV.items ??= []; }
  HV.busy = false;
  if (m.screen === 'nordlys') draw();
}
const CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
/** Liste under «NYTT I x.y.z». cur = installert, nv = versjonen som vises øverst (hoppes over). */
export function histSection(nv) {
  if (!HV.items && !HV.busy && !HV.miss) histLoad();
  const L = (HV.items ?? []).filter((x) => x.version !== String(nv ?? '').replace(/^v/, ''));
  if (!L.length) return HV.busy && !HV.items ? '<span class="n31-lab p36-hl">TIDLIGERE VERSJONER</span><div class="p36-hist"><span class="p36-hld">Henter …</span></div>' : '';
  return `<span class="n31-lab p36-hl">TIDLIGERE VERSJONER</span><div class="p36-hist">${L.map((x) => {
    const o = HV.open === x.version, n = x.notes.length;
    const meta = [dNo(x.date), `${n} ${n === 1 ? 'endring' : 'endringer'}`].filter(Boolean).join(' · ');
    return `<div class="p36-hv${o ? ' open' : ''}"><button type="button" class="p36-hr" data-p36="hist" data-v="${esc(x.version)}" aria-expanded="${o}"><span class="m-grow"><b>Nordlys ${esc(x.version)}</b><span>${esc(meta)}${x.failed ? ' · <em class="p36-fail">Feilet</em>' : x.installedAt ? ` · Installert ${esc(dtNo(x.installedAt))}` : ''}</span></span><span class="p36-hc">${CHEV}</span></button>
      ${o ? `<ul class="p36-hn">${x.notes.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>Ingen endringsnotater.</li>'}${x.failed ? '<li><a href="#/nordlys" data-p36="histlog">Se loggen ›</a></li>' : ''}</ul>` : ''}</div>`;
  }).join('')}${HV.more ? `<button type="button" class="p36-hmore" data-p36="histmore" ${HV.busy ? 'disabled' : ''}>${HV.busy ? 'Henter …' : 'Vis flere'}</button>` : ''}</div>`;
}

/* =====================================================================
   6. Konto: profilbildet (beskjæring i sirkel, 512 × 512)
   ===================================================================== */
const AV = { crop: null, busy: false, conf: false };
const CAM = 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';
const avBig = (S) => `<label class="p36-avb" style="width:${S}px;height:${S}px">${avatarUrl() ? `<img src="${esc(avatarUrl())}" alt="Profilbildet ditt">` : `<span class="p36-avi" style="font-size:${Math.round(S * 0.36)}px">${esc(String(meName() || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span>`}<span class="p36-avo">${svg(CAM, 20)}<span>Endre</span></span><input class="m-file" type="file" accept="image/*" data-p36av aria-label="Endre profilbilde"></label>`;
/** Toppen av Konto (bildet 88 px sentrert over navnet) og raden «Profilbilde» med miniatyr og knapper. */
export function kontoTop() {
  const me = m.me ?? {}, has = !!avatarUrl();
  return `<div class="p36-kt">${avBig(88)}<b class="pp-serif">${esc(meName() || 'Konto')}</b><span>${me.username ? `@${esc(me.username)}` : ''}${me.role ? ` · ${me.role === 'admin' ? 'Administrator' : 'Bruker'}` : ''}</span>
    <label class="p36-ktb">Endre bilde<input class="m-file" type="file" accept="image/*" data-p36av></label></div>
    <div class="sec">Profilbilde</div><div class="list"><label class="opt-row p36-pbr"><span class="m-grow">Profilbilde<br><span style="font-size:13px;opacity:.65">${has ? 'Vises i menyen, hilsenen, appene og delte boliger' : 'Ikke lagt til'}</span></span>${has ? `<span class="p36-pbt"><img src="${esc(avatarUrl())}" alt=""></span>` : ''}<span class="sval">Endre →</span><input class="m-file" type="file" accept="image/*" data-p36av></label>
    <div class="opt-row p36-pbb"><label class="p36-pbk">Last opp nytt<input class="m-file" type="file" accept="image/*" data-p36av></label><label class="p36-pbk">Ta bilde<input class="m-file" type="file" accept="image/*" capture="user" data-p36av></label>${has ? `<button type="button" class="p36-pbk red" data-p36="avdel">${AV.conf ? 'Trykk igjen for å fjerne' : 'Fjern'}</button>` : ''}</div></div>${P37B.obRow()}`;
}
async function avPick(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { AV.crop = { url, w: img.naturalWidth, h: img.naturalHeight, z: 1, x: 0, y: 0, img }; draw(); };
  img.onerror = () => { URL.revokeObjectURL(url); flash('Kunne ikke lese bildet', 'err'); };
  img.src = url;
}
const VP = 260;
function cropGeom(c) { const base = VP / Math.min(c.w, c.h), s = base * c.z, w = c.w * s, h = c.h * s; const mx = Math.max(0, (w - VP) / 2), my = Math.max(0, (h - VP) / 2); c.x = Math.max(-mx, Math.min(mx, c.x)); c.y = Math.max(-my, Math.min(my, c.y)); return { w, h, s }; }
function cropSheet() {
  const c = AV.crop; if (!c) return '';
  const g = cropGeom(c);
  return `<div class="sheet-bg" data-p36="cropx"></div><div class="pp-sheet p36-crop" role="dialog" aria-modal="true" aria-label="Beskjær profilbildet"><span class="pp-grab" aria-hidden="true"></span>
    <div class="pp-row"><b class="pp-sh">Beskjær bildet</b><button type="button" class="p30-sb" data-p36="cropx">Avbryt</button></div>
    <div class="p36-cv" data-p36crop style="width:${VP}px;height:${VP}px"><img src="${esc(c.url)}" alt="" draggable="false" style="width:${g.w}px;height:${g.h}px;transform:translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px))"><i class="p36-cm" aria-hidden="true"></i></div>
    <label class="p36-cz"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="${c.z}" data-p36zoom aria-label="Zoom"></label>
    <span class="pp-mut">Dra for å flytte. Lagres som 512 × 512 og vises med en gang i menyen, hilsenen og appene.</span>
    <button type="button" class="pp-btn ink" data-p36="cropok" ${AV.busy ? 'disabled' : ''}>${AV.busy ? 'Lagrer …' : 'Bruk bildet'}</button></div>`;
}
function cropApply() { const c = AV.crop, el = document.querySelector('#app [data-p36crop] img'); if (!c || !el) return; const g = cropGeom(c); el.style.width = `${g.w}px`; el.style.height = `${g.h}px`; el.style.transform = `translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px))`; }
async function cropSave() {
  const c = AV.crop; if (!c || AV.busy) return;
  AV.busy = true; draw();
  const g = cropGeom(c), Z = 512, k = Z / VP, cv = document.createElement('canvas');
  cv.width = cv.height = Z;
  const x = cv.getContext('2d');
  x.drawImage(c.img, (VP / 2 + c.x - g.w / 2) * k, (VP / 2 + c.y - g.h / 2) * k, g.w * k, g.h * k);
  const webp = cv.toDataURL('image/webp').startsWith('data:image/webp');
  const blob = await new Promise((r) => cv.toBlob(r, webp ? 'image/webp' : 'image/jpeg', 0.86));
  const fd = new FormData(); fd.append('file', blob, webp ? 'avatar.webp' : 'avatar.jpg');
  let r = null;
  try { r = await hlApi('/me/avatar', { method: 'PUT', body: fd }); }
  catch (e) {
    if (e.status === 404 || e.status === 405) {
      // Eldre server: POST (maks 1 MB, JPEG).
      try { const jb = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.85)); const f2 = new FormData(); f2.append('file', jb, 'avatar.jpg'); r = await hlApi('/me/avatar', { method: 'POST', body: f2 }); }
      catch (e2) { AV.busy = false; flash(e2.message, 'err'); draw(); return; }
    } else { AV.busy = false; flash(e.message, 'err'); draw(); return; }
  }
  if (r?.url && m.me) m.me.avatarUrl = r.url;
  URL.revokeObjectURL(c.url); AV.crop = null; AV.busy = false;
  await loadMe().catch(() => {}); if (r?.url && m.me) m.me.avatarUrl = r.url;
  flash('Profilbilde oppdatert ✓'); draw();
}
let cropDrag = null;

/* =====================================================================
   7. Ikon på hver rad i Innstillinger (Lucide-linjeikoner, strek 2)
   ===================================================================== */
const LU = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', at: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  keyr: 'M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4zM16.5 7.5h.01', laptop: 'M4 5h16v11H4zM2 20h20', devices: 'M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8M10 19v-4M7 19h5M16 12h6v10h-6z',
  lock: 'M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4', history: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sunmoon: 'M12 8a4 4 0 1 0 4 4M12 2v2M4.9 4.9l1.4 1.4M2 12h2M4.9 19.1l1.4-1.4M12 20v2M20.5 14.5A5 5 0 0 1 15 9a5 5 0 1 0 5.5 5.5z', palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22zM7.5 10.5h.01M10.5 7.5h.01M15.5 7.5h.01M17.5 11.5h.01',
  type: 'M4 7V4h16v3M9 20h6M12 4v16', lang: 'M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6', move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  appw: 'M2 4h20v16H2zM2 8h20M6 4v4M10 4v4', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01', cols: 'M3 3h18v18H3zM9 3v18M15 3v18',
  news: 'M4 22h16a2 2 0 0 0 2-2V4H8v16a2 2 0 0 1-4 0V11h4M18 14h-8M15 18h-5M10 6h8v4h-8z', hand: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20', cloud: 'M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  sparkles: 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2zM19 3v4M21 5h-4', activity: 'M22 12h-4l-3 9L9 3l-3 9H2', bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  bellring: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0M4 2C2.8 3.7 2 5.7 2 8M22 8c0-2.3-.8-4.3-2-6', mail: 'M2 4h20v16H2zM22 7l-10 6L2 7', moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  cal: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18', pkg: 'M16.5 9.4L7.5 4.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7L12 12l8.7-5M12 22V12',
  timer: 'M10 2h4M12 14l3-3M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', hdd: 'M22 12H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1zM6 16h.01M10 16h.01',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', face: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  vibrate: 'M2 8l2 2-2 2 2 2-2 2M22 8l-2 2 2 2-2 2 2 2M8 5h8v14H8z', phone: 'M5 2h14v20H5zM12 18h.01', refresh: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5',
  refreshccw: 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5', kbd: 'M2 4h20v16H2zM6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71', eyeoff: 'M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M14.1 14.1a3 3 0 1 1-4.2-4.2',
  checkc: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9 12l2 2 4-4', alert: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01', play: 'M6 3l14 9-14 9z', calclock: 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M16 2v4M8 2v4M3 10h5M17.5 17.5L16 16.3V14M16 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
  repeat: 'M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3', archive: 'M2 3h20v5H2zM4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4', server: 'M2 2h20v8H2zM2 14h20v8H2zM6 6h.01M6 18h.01',
  checks: 'M3 17l2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8', rotate: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5', lockk: 'M4 10h16v12H4zM7 10V7a5 5 0 0 1 10 0v3M12 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  cpu: 'M4 4h16v16H4zM9 9h6v6H9zM15 2v2M9 2v2M15 20v2M9 20v2M20 9h2M20 14h2M2 9h2M2 14h2', dlc: 'M4.4 15.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M12 12v9M8 17l4 4 4-4',
  coins: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8', key: 'M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3M7.5 13a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
  todo: 'M3 5h6v6H3zM3 17l2 2 4-4M13 6h8M13 12h8M13 18h8', audio: 'M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3', sunrise: 'M12 2v8M4.9 10.9l1.4 1.4M2 18h2M20 18h2M19.1 10.9l-1.4 1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01', shieldc: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4', info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
  scroll: 'M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3', network: 'M9 2h6v6H9zM16 16h6v6h-6zM2 16h6v6H2zM5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8',
  power: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', folder: 'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9z', file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6', tag: 'M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4zM7 7h.01', bank: 'M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l10 5H2z',
  chart: 'M3 3v18h18M7 16l4-4 4 4 5-6', map: 'M9 3L3 6v15l6-3 6 3 6-3V3l-6 3zM9 3v15M15 6v15', home: 'M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10', test: 'M9 2v6L4 20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 8V2M8 2h8M7 15h10',
};
// [mønster, ikon, rød?] – første treff vinner. Tittelen er teksten før undertekst/verdi.
const RULES = [
  [/^logg ut|logg ut overalt/i, 'logout', 1], [/^(slett|fjern|tilbakestill|nullstill)/i, 'trash', 1], [/start på nytt|restart/i, 'power', 1],
  [/siste backup/i, 'checkc'], [/ta backup nå|^start\b/i, 'play'], [/automatisk backup/i, 'calclock'], [/hvor ofte|tidsplan|frekvens/i, 'repeat'], [/^behold/i, 'archive'], [/backup feiler|varsle meg når/i, 'bellring'],
  [/nettverksdisk|smb|share|mål\b|lagres på/i, 'server'], [/hva tas med|moduler/i, 'checks'], [/gjenopprett/i, 'rotate'], [/krypter|gjenopprettingsnøkkel/i, 'lockk'], [/kopi til sky|sky\b/i, 'cloud'], [/last ned/i, 'download'],
  [/^navn\b|navn på/i, 'user'], [/brukernavn/i, 'at'], [/^rolle/i, 'shield'], [/profilbilde|^bilde/i, 'image'], [/tofaktor|totrinn|2fa/i, 'keyr'], [/pålitelig enhet\b|denne enheten|^enhet/i, 'laptop'], [/pålitelige enheter|enheter|økter på/i, 'devices'],
  [/passord|krev .*(face id|passord)|lås\b|låse/i, 'lock'], [/økter|historikk|tidligere versjoner/i, 'history'], [/api-token|tokens?\b|nøkkel|api-nøkler/i, 'key'], [/brukere|kontoer|familie/i, 'users'], [/status|aktiv\b/i, 'activity'],
  [/^tema|lys eller mørk|mørk modus|^modus|utseende/i, 'sunmoon'], [/fargetema|farger|ikonfarge|farge\b/i, 'palette'], [/bakgrunn/i, 'image'], [/tekststørrelse|skrift/i, 'type'], [/språk|language/i, 'lang'], [/reduser bevegelse|bevegelse/i, 'move'], [/app-ikon|ikon\b/i, 'appw'],
  [/widget/i, 'grid'], [/rekkefølge|flytt/i, 'grip'], [/kolonner/i, 'cols'], [/nyhet|rss|kilder/i, 'news'], [/hilsen/i, 'hand'], [/fanelinje|navigasjon|faner/i, 'grip'], [/startside|oppstart/i, 'home'],
  [/domene/i, 'globe'], [/cloudflare/i, 'cloud'], [/search console|søk|søkebar/i, 'search'], [/glimt|oppsummering|ai\b|ai-|modell/i, 'sparkles'], [/nedetid|oppetid/i, 'activity'],
  [/push|varsel|varsle|varsler/i, 'bell'], [/e-post|epost|mail/i, 'mail'], [/stille timer|natt/i, 'moon'], [/kalender/i, 'cal'], [/pakke|sporing/i, 'pkg'], [/prøveperiode|abonnement/i, 'timer'], [/oppdatering/i, 'download'],
  [/face id|biometri|fingeravtrykk/i, 'face'], [/haptikk|vibr/i, 'vibrate'], [/bakgrunnsoppdatering|synk/i, 'refresh'], [/hurtigtast/i, 'kbd'], [/ical|lenke|adresse|url/i, 'link'], [/skjul/i, 'eyeoff'],
  [/last ned modeller/i, 'dlc'], [/forbruk|kostnad|tokens/i, 'coins'], [/jobber|kø\b/i, 'todo'], [/stemme|les opp|opplesning/i, 'audio'], [/brief/i, 'sunrise'], [/figur/i, 'smile'], [/personvern/i, 'shieldc'],
  [/versjon|om\b|om finanshub|lisenser|plattform/i, 'info'], [/se etter/i, 'search'], [/automatiske oppdateringer/i, 'refreshccw'], [/logg\b|logger/i, 'scroll'], [/lagring|hurtigbuffer|disk/i, 'hdd'], [/nettverk|server|tilkobling/i, 'network'],
  [/kategori/i, 'tag'], [/regel|regler/i, 'checks'], [/bank|import|csv/i, 'bank'], [/aksjer|trading/i, 'chart'], [/kart|posisjon|sted/i, 'map'], [/test/i, 'test'], [/kamera|skann/i, 'face'], [/fil|eksporter|excel/i, 'file'], [/wi-?fi/i, 'wifi'],
];
const PAGE_C = { konto: '#2b5d8a', profil: '#2b5d8a', sik: '#2f7d4f', tok: '#8a5a1e', sysbk: '#2f7d4f', bk: '#2f7d4f', look: '#7a5ad6', varsler: '#c2410c', notif: '#c2410c', hap: '#c2410c', integ: '#0e7490', kal: '#b23a2a', dom: '#be185d', srv: '#0e7490', data: '#475569', om: '#475569', fai: '#7a5ad6', kat: '#a16207', regel: '#a16207', bank: '#1f7a45', t212: '#1f7a45', widgets: '#2b5d8a', kalapp: '#b23a2a', mod: '#2b5d8a', fanelinje: '#7a5ad6', nav: '#7a5ad6', scan: '#0e7490', sokbar: '#0e7490' };
const iconFor = (label) => { for (const [re, ic, red] of RULES) if (re.test(label)) return [ic, !!red]; return null; };
/** Etter tegning: rader i Innstillinger uten ikon får en ikonbrikke (sidens farge 12 %, ikon i sidens farge). */
function iconize() {
  if (m.screen !== 'set' && m.screen !== 'glimt') return;
  const sub = String(m.sub ?? '').split('/')[0], col = PAGE_C[sub] ?? '#b23a2a';
  for (const r of document.querySelectorAll('#app .m-scroll .opt-row, #app .m-scroll .p35-row')) {
    if (r.dataset.p36ic || r.classList.contains('col') || r.classList.contains('navrow') || r.classList.contains('p29-mod') || r.classList.contains('p36-pbb') || r.classList.contains('p29-smbw') || r.classList.contains('p29-run')) continue;
    // Backup-sidens gamle røde brikker (samme ikon på flere rader) byttes til radens eget ikon.
    if (r.firstElementChild?.matches?.('.p29-bic')) r.firstElementChild.remove();
    const f = r.firstElementChild;
    if (!f || f.matches('.set-ic, .m-av, .p36-ic, .p29-cb, .p35-ic, .p36-avb, img, svg, [class*="ic"]:not(.m-grow)')) { r.dataset.p36ic = '0'; continue; }
    if (r.querySelector('.set-ic, .m-av, .p16-av, .p17-ici, input[type="text"], input[type="password"], select, textarea, .schips')) { r.dataset.p36ic = '0'; continue; }
    const tEl = r.querySelector('b') ?? f;
    let label = '';
    for (const n of tEl.childNodes) { if (n.nodeName === 'BR' || (n.nodeType === 1 && n.matches?.('small, span'))) break; label += n.textContent; }
    label = (label.trim() || String(tEl.textContent ?? '')).trim();
    const hit = iconFor(label);
    r.dataset.p36ic = '1';
    if (!hit) continue;
    let [ic, red] = hit, c = col;
    // Status-rader: grønn eller rød etter status. Farlige handlinger: rød brikke og rød tittel.
    if (ic === 'checkc') { const bad = r.querySelector('.p29-bad'); c = bad ? '#b23a2a' : '#2f7d4f'; if (bad) ic = 'alert'; }
    if (red) { c = '#b23a2a'; r.classList.add('p36-danger'); }
    const s = document.createElement('span');
    s.className = 'p36-ic'; s.setAttribute('aria-hidden', 'true'); s.style.setProperty('--c', c);
    s.innerHTML = svg(LU[ic], 18, 2);
    r.insertBefore(s, f); r.classList.add('p36-hasic');
  }
}

/* =====================================================================
   8. Temperaturen på Hjem: trykk → Vær, hold inne ≥ 550 ms → Yr
   ===================================================================== */
const TP = { t: null, el: null, fired: false, x: 0, y: 0, until: 0 };
function tempDown(e) {
  const a = e.target.closest?.('#app [data-p36temp]');
  if (!a || (e.button ?? 0) > 0) return;
  TP.el = a; TP.fired = false; TP.x = e.clientX; TP.y = e.clientY;
  a.classList.add('p36-hold');
  clearTimeout(TP.t); TP.t = setTimeout(() => { TP.fired = true; haptic('ok'); a.classList.add('p36-yr'); }, 550);
}
function tempMove(e) { if (TP.el && Math.hypot(e.clientX - TP.x, e.clientY - TP.y) > 10) tempCancel(); }
function tempCancel() { clearTimeout(TP.t); TP.el?.classList.remove('p36-hold', 'p36-yr'); TP.el = null; TP.fired = false; }
function tempUp() {
  const a = TP.el; if (!a) return;
  clearTimeout(TP.t); a.classList.remove('p36-hold', 'p36-yr');
  if (TP.fired) { TP.until = Date.now() + 700; window.open(a.getAttribute('href'), '_blank', 'noopener'); } // åpnes ved slipp (brukerhandling), ikke fra en timer
  TP.el = null; TP.fired = false;
}

/* =====================================================================
   9. Mat: felles for husstanden + sanntid (meal:changed)
   ===================================================================== */
const hmDot = (iso) => { const d = new Date(iso ?? ''); return Number.isNaN(+d) ? '' : `${pad(d.getHours())}.${pad(d.getMinutes())}`; };
/** «Felles for husstanden · Endret av Nina 18.42» under Mat-tittelen. */
export function matShared(w) {
  if (w?.sharedNote) return `<div class="p36-mshared">${esc(w.sharedNote)}</div>`;
  const by = w?.updatedBy?.name ?? w?.updatedBy ?? null, at = hmDot(w?.updatedAt);
  return `<div class="p36-mshared">Felles for husstanden${by ? ` · Endret av ${esc(String(by).split(/\s+/)[0])}${at ? ` ${at}` : ''}` : ''}</div>`;
}
let mealT = null;
export function onMeal(d) {
  clearTimeout(mealT);
  mealT = setTimeout(async () => {
    const MAT = await import('./mobile-mat.js');
    await MAT.matLoad().catch(() => {});
    const who = d?.updatedBy?.name ?? d?.updatedBy ?? d?.byName ?? null, me = String(meName() || '').split(/\s+/)[0];
    if (who && String(who).split(/\s+/)[0] !== me && (m.screen === 'mat' || m.screen === 'hl')) flash(`Oppdatert av ${String(who).split(/\s+/)[0]}`);
    else if (m.screen === 'mat' || m.screen === 'hl') draw();
  }, 200);
}

/* =====================================================================
   10. Backup: kvittering (verifisert fil på nettverksdisken)
   ===================================================================== */
export const smbUrl = (t, full = null) => {
  const p = full ?? t?.fullPath ?? null;
  if (p && /^smb:\/\//i.test(p)) return p;
  const host = t?.host ?? t?.target?.host, share = t?.share ?? t?.target?.share, path = p ?? t?.path ?? t?.target?.path ?? '';
  if (!host) return p || t?.label || '';
  return `smb://${host}/${String(share ?? '').replace(/^\/+|\/+$/g, '')}${path ? `/${String(path).replace(/^\/+/, '')}` : ''}`;
};
const gb = (b) => (b == null ? '' : b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);
const BR = { log: false };
/** Raden under «Siste backup»: ✓ 2,4 GB · smb://…/homelab-…tar.zst · verifisert, med Åpne mappe › og Vis logg. */
export function bkReceipt(last) {
  if (!last || !(last.fullPath || last.verified != null || last.target)) return '';
  const bad = last.ok === false || !!last.error, ver = last.verified === true;
  const url = smbUrl(last.target ?? {}, last.fullPath ?? null);
  const head = bad ? `✗ Feilet${last.error ? ` · ${last.error}` : ''}` : `${ver ? '✓' : '!'} ${[gb(last.bytes ?? last.size), url, ver ? 'verifisert' : 'ikke verifisert'].filter(Boolean).join(' · ')}`;
  const log = BR.log ? `<dl class="p36-bkl">${[['Mål', url], ['Metode', last.method], ['Skrevet', gb(last.bytes ?? last.size)], ['SHA-256', last.sha256 ? `${String(last.sha256).slice(0, 16)}…` : ''], ['Verifisert', last.verified == null ? '' : last.verified ? 'Ja (stat, størrelse og liste)' : 'Nei'], ['Rydding', Array.isArray(last.retention) ? (last.retention.length ? last.retention.map((x) => (typeof x === 'string' ? x : x?.name ?? x?.file ?? '')).join(', ') : 'Ingenting slettet') : ''], ['Tid', last.ms != null ? `${(last.ms / 1000).toFixed(1).replace('.', ',')} s` : ''], ['Feil', last.error]].filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
  return `<div class="opt-row p17-row col p36-bkr${bad ? ' bad' : ver ? ' ok' : ''}"><span class="p36-bkt">${esc(head)}</span><span class="p36-bka">${last.target || url.startsWith('smb://') ? '<button type="button" data-p29="bksmb">Åpne mappe ›</button>' : ''}<button type="button" data-p36="bklog" aria-expanded="${BR.log}">${BR.log ? 'Skjul logg' : 'Vis logg'}</button></span>${log}</div>`;
}

/* =====================================================================
   11. Innstillinger → Kalendere → Google: Hovedkalender og «Vis også i Kalender»
   ===================================================================== */
// GET/PUT /api/kalender/calendars/google → {connected, email, main:{id,name}, calendars:[{id, googleId, name, primary, color, writable, access, main, shown}]}
const GC = { d: null, busy: false, miss: false, t: 0, save: false };
async function gcLoad(force = false) {
  if (GC.busy || GC.miss || (!force && GC.d && Date.now() - GC.t < 60e3)) return;
  GC.busy = true;
  try { GC.d = await hlApi('/kalender/calendars/google'); GC.t = Date.now(); }
  catch (e) { if (e.status === 404 || e.status === 405) GC.miss = true; GC.d ??= null; }
  GC.busy = false; draw();
}
async function gcPut(body) {
  GC.save = true; draw();
  try { GC.d = await hlApi('/kalender/calendars/google', { method: 'PUT', json: body }); GC.t = Date.now(); haptic('ok'); }
  catch (e) { flash(e.status === 400 ? 'Den kalenderen kan ikke skrives til' : e.message, 'err'); }
  GC.save = false; draw();
}
const gcKey = (c) => (c.primary ? 'primary' : c.googleId ?? c.id);
export function gcalSection() {
  if (!GC.d && !GC.busy && !GC.miss) gcLoad();
  if (GC.miss || (GC.d && GC.d.connected === false)) return '';
  if (!GC.d) return '<span class="p24-mut">Henter Google-kalenderne …</span>';
  const L = Array.isArray(GC.d.calendars) ? GC.d.calendars : [];
  const mainId = GC.d.main?.id ?? L.find((c) => c.main)?.id ?? 'primary';
  const isMain = (c) => c.main || gcKey(c) === mainId || c.id === mainId || c.googleId === mainId;
  const W = L.filter((c) => c.writable !== false).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  const others = L.filter((c) => !isMain(c));
  const dot = (c) => `<i class="p36-gcd" style="background:${esc(c.color || '#4285F4')}"></i>`;
  return `<div class="p36-gc"><span class="p24-fl">Hovedkalender</span><div class="p36-gcl" role="radiogroup" aria-label="Hovedkalender">${W.map((c) => {
    const on = isMain(c);
    return `<button type="button" class="p36-gcr" role="radio" aria-checked="${on}" data-p36="gcmain" data-v="${esc(gcKey(c))}" ${GC.save ? 'disabled' : ''}><span class="p36-gro${on ? ' on' : ''}" aria-hidden="true"></span>${dot(c)}<span class="m-grow"><b>${esc(c.primary ? 'Personlig' : c.name)}</b><small>${c.primary ? `${esc(GC.d.email ?? c.name ?? '')} · ` : ''}${on ? 'Nye hendelser lagres her' : 'Skrivbar'}</small></span></button>`;
  }).join('') || '<span class="p24-mut">Ingen skrivbare kalendere.</span>'}</div>
    ${others.length ? `<span class="p24-fl">Vis også i Kalender</span><div class="p36-gcl">${others.map((c) => {
      const on = c.shown !== false && c.shown != null ? !!c.shown : false, k = c.googleId ?? c.id;
      return `<button type="button" class="p36-gcr" role="switch" aria-checked="${on}" data-p36="gcshow" data-v="${esc(k)}" ${GC.save ? 'disabled' : ''}>${dot(c)}<span class="m-grow"><b>${esc(c.name)}</b><small>${c.writable === false || /reader|freeBusy/i.test(c.access ?? '') ? 'Bare lesing' : 'Kan også skrives til'}</small></span><span class="sw" aria-hidden="true" aria-checked="${on}"></span></button>`;
    }).join('')}</div>` : ''}</div>`;
}
async function gcBind(a, x) {
  if (a === 'gcmain') { haptic('tap'); await gcPut({ main: x.dataset.v }); return; }
  if (a === 'gcshow') {
    const L = GC.d?.calendars ?? [], k = x.dataset.v;
    const cur = L.filter((c) => c.shown && !c.main).map((c) => c.googleId ?? c.id);
    const next = cur.includes(k) ? cur.filter((y) => y !== k) : [...cur, k];
    haptic('tap'); await gcPut({ show: next });
  }
}

/* =====================================================================
   Kroker fra mobile.js
   ===================================================================== */
let booted = false;
export function boot36() {
  if (booted) return; booted = true;
  // Klikk etter et sveip åpner ikke briefen (click capture). Klikk etter hold på temperaturen åpner ikke Vær.
  document.addEventListener('click', (e) => {
    if (BS.moved && Date.now() - BS.moved < 400 && e.target.closest?.('[data-p36bs]')) { e.preventDefault(); e.stopPropagation(); }
    if (TP.until > Date.now() && e.target.closest?.('[data-p36temp]')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('pointerdown', (e) => { bsDown(e); tempDown(e); cropDown(e); }, true);
  document.addEventListener('pointermove', (e) => { bsMove(e); tempMove(e); cropMove(e); }, { capture: true, passive: false });
  const up = (e) => { bsUp(e); if (e.type === 'pointercancel') tempCancel(); else tempUp(e); cropDrag = null; };
  document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-p36temp], [data-p36bsc]')) e.preventDefault(); }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) healthProbe(); });
  addEventListener('online', healthProbe);
}
function cropDown(e) { const v = e.target.closest?.('#app [data-p36crop]'); if (!v || !AV.crop) return; cropDrag = { x: e.clientX, y: e.clientY, cx: AV.crop.x, cy: AV.crop.y }; try { v.setPointerCapture?.(e.pointerId); } catch {} e.preventDefault(); }
function cropMove(e) { if (!cropDrag || !AV.crop) return; AV.crop.x = cropDrag.cx + (e.clientX - cropDrag.x); AV.crop.y = cropDrag.cy + (e.clientY - cropDrag.y); cropApply(); if (e.cancelable) e.preventDefault(); }

/** Lag over alle sider: toasten «Brief skjult …» og beskjæringsarket. */
export function layer36() {
  const toast = BS.toast && m.screen === 'hl' ? `<div class="p36-bstoast" role="status"><span>Brief skjult til ${esc(nextBrief())}</span><button type="button" data-p36="bsundo">Angre</button></div>` : '';
  return toast + (m.screen === 'set' ? cropSheet() : '');
}
export function afterDraw36() {
  if (m.screen === 'hl' && BS.lastScr !== 'hl') bsVisit();
  BS.lastScr = m.screen;
  try { iconize(); } catch {}
}
export function input36(e, t) {
  if (t.matches?.('[data-p36zoom]') && AV.crop) { AV.crop.z = +t.value || 1; cropApply(); return true; }
  if (e.type === 'change' && t.matches?.('[data-p36av]')) { const f = t.files?.[0]; t.value = ''; avPick(f); return true; }
  return false;
}
export async function bind36(e, t) {
  const tp = t.closest?.('[data-p36temp]');
  if (tp && e.type === 'click') {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return false; // Cmd/ctrl-klikk: Yr i ny fane (lenkens href)
    e.preventDefault(); haptic('tap'); location.hash = '#/vaer'; return true;
  }
  const x = t.closest?.('[data-p36]'); if (!x) return false;
  const a = x.dataset.p36;
  e.preventDefault();
  if (a === 'bsundo') { briefUndo(); return true; }
  if (a === 'hist') { HV.open = HV.open === x.dataset.v ? '' : x.dataset.v; haptic('tap'); draw(); return true; }
  if (a === 'histmore') { await histLoad(true); return true; }
  if (a === 'histlog') { location.hash = '#/nordlys'; return true; }
  if (a === 'cropx') { if (AV.crop) URL.revokeObjectURL(AV.crop.url); AV.crop = null; draw(); return true; }
  if (a === 'cropok') { await cropSave(); return true; }
  if (a === 'avdel') {
    if (!AV.conf) { AV.conf = true; draw(); setTimeout(() => { AV.conf = false; draw(); }, 3000); return true; }
    AV.conf = false;
    try { await hlApi('/me/avatar', { method: 'DELETE' }); if (m.me) m.me.avatarUrl = null; await loadMe().catch(() => {}); flash('Profilbildet er fjernet'); } catch (err) { flash(err.message, 'err'); }
    draw(); return true;
  }
  if (a === 'bklog') { BR.log = !BR.log; draw(); return true; }
  if (a === 'gcmain' || a === 'gcshow') { await gcBind(a, x); return true; }
  return false;
}
export { avInner };
