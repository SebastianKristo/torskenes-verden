// Prompt 40 (PWA40) · Hjemlys – hele flyten (tillegg i kontrakt 40: 1a + 1b + 1c som deler av samme funksjon).
// Fasit: design_handoff_homelab/prompts/prompt-40-pakke/design/Hjemme trygt Varianter.dc.html, spec claude-code-hjemlys.md.
//   1a «Rolig og papir» (dagtid): kart med rute hjem, «Fra Majorstuen · 2,1 km», reisemåter med ankomsttid, mottakere,
//      «Start · hjemme ca. 23:38». Aktiv økt: stor tid, fremdrift, Følger med / Deler nå / Hvis du er sen, + 10 min, Avslutt.
//      Mottaker når noen er sen: «X er ikke hjemme ennå» med siste posisjon, rute, batteri/dekning, sist opplåst, var med.
//   1b «Glimt foreslår»: «Kinoen er ferdig. Skal jeg si fra til …?» (Ja, start / Ikke nå), Glimt-samtalen i økta
//      («Går innom Kiwi først» → + 10 min) og familiens logg.
//   1c «Nattmodus» (kl. 21–06 eller mørkt tema): mørk startside med ventetid og hva som deles, stor nedtellingsring,
//      store knapper, og rød alarmskjerm hos mottaker (Ring / Åpne kart / Ring 112).
//   Felles: Hjem-widget («Start for meg»), kortet i Familie.
// API (SERVER40, tåler 404): GET /api/hjemlys, /suggest ({suggest, reason, text, recipients, eta}), /route?mode=
// ({from:{name, km}, to?, options:[{mode, label, legs, eta, minutes}], geometry?}), POST /start, PATCH /:id, POST /:id/ok|home|end,
// GET /:id/log ([{at, text, who}]). Ingenting deles før økta er «late» – det håndhever serveren; her vises bare det den sender.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const pad = (n) => String(n).padStart(2, '0');
const hm = (t) => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const first = (n) => String(n ?? '').trim().split(/\s+/)[0] || '';
const X = (attr, cls = '') => `<button type="button" class="w32-x${cls}" ${attr} aria-label="Lukk"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
const meId = () => String(m.me?.id ?? '');

export const HJ = { d: null, t: 0, miss: false, busy: false, open: false, view: 'start', mode: null, route: null, routeT: 0, routeBusy: false, eta: '', custom: false, wait: 15, sug: null, sugT: 0, sugOff: false, log: {}, chat: [], q: '', alarm: null, seenAlarm: {}, who: null, watch: null, lastPos: null, lastAt: 0, tick: null };
const mine = () => { const M = HJ.d?.mine; return M && M.state !== 'ended' ? M : null; };
const others = () => (HJ.d?.household ?? []).filter((p) => p && String(p.userId) !== meId());
const activeOthers = () => others().filter((p) => p.state && p.state !== 'ended');
/** 1c: etter kl. 21 (til 06) eller i mørkt tema. */
export const night = () => { const h = new Date().getHours(); return h >= 21 || h < 6 || !m.light; };

export async function hjLoad(force = false) {
  if (HJ.miss || HJ.busy || (!force && Date.now() - HJ.t < 30e3)) return;
  HJ.busy = true;
  try { HJ.d = await hlApi('/hjemlys'); HJ.t = Date.now(); }
  catch (e) { if (e.status === 404 || e.status === 405) HJ.miss = true; HJ.t = Date.now(); }
  HJ.busy = false;
  if (!HJ.miss && Date.now() - HJ.sugT > 10 * 60e3) { HJ.sugT = Date.now(); hlApi('/hjemlys/suggest').then((r) => { HJ.sug = r?.suggest ? r : null; redraw(); }).catch(() => {}); }
  // Mottaker: noen i husstanden er sen → alarmskjermen (én gang per økt, kan lukkes).
  const late = activeOthers().find((p) => p.state === 'late' && !HJ.seenAlarm[p.sessionId ?? p.id ?? p.userId]);
  if (late && !HJ.alarm) { HJ.alarm = late; vib([30, 60, 30, 60, 30]); haptic('err'); }
  const M = mine(); if (M?.id && HJ.open) logLoad(M.id);
  watch(); tickOn();
  redraw();
}
const redraw = () => { if (['fam', 'hl'].includes(m.screen) || HJ.open || HJ.alarm) draw(); };
async function logLoad(id) {
  try { const L = await hlApi(`/hjemlys/${encodeURIComponent(id)}/log`); HJ.log[id] = Array.isArray(L) ? L : L?.items ?? []; } catch { HJ.log[id] ??= []; }
}
async function routeLoad(force = false) {
  if (HJ.routeBusy || (!force && HJ.route && Date.now() - HJ.routeT < 5 * 60e3)) return;
  HJ.routeBusy = true;
  try {
    const q = HJ.lastPos ? `?lat=${HJ.lastPos.lat.toFixed(5)}&lon=${HJ.lastPos.lon.toFixed(5)}` : '';
    HJ.route = await hlApi(`/hjemlys/route${q}`); HJ.routeT = Date.now();
    const o = opts(); if (!HJ.mode || !o.some((x) => x.mode === HJ.mode)) HJ.mode = o[0]?.mode ?? null;
    if (!HJ.custom) setEtaFrom(o.find((x) => x.mode === HJ.mode));
  } catch { HJ.route = null; HJ.routeT = Date.now(); }
  HJ.routeBusy = false; if (HJ.open) draw();
}
const opts = () => (Array.isArray(HJ.route?.options) ? HJ.route.options : []);
function setEtaFrom(o) {
  const d = o?.eta ? new Date(o.eta) : o?.minutes ? new Date(Date.now() + o.minutes * 60e3) : null;
  if (d && !Number.isNaN(+d)) HJ.eta = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function etaDate() {
  const [h, mi] = String(HJ.eta || '').split(':').map(Number); if (!Number.isFinite(h)) return null;
  const d = new Date(); d.setHours(h, mi || 0, 0, 0); if (d < Date.now() - 60e3) d.setDate(d.getDate() + 1);
  return d;
}

/* ---------- Byggesteiner ---------- */
const MODE_IC = { kollektiv: 'M6 4h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2zM4 11h16M8 21l2-3M16 21l-2-3M8 15h.01M16 15h.01', 'gå': 'M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 22l2-7 3 3v4M9 12l1-5 4 2 2 3M7 12l2-1', sykkel: 'M5.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 14.5l4-7h5l4 7M9.5 7.5L12 14.5', taxi: 'M5 11l2-5h10l2 5M3 11h18v6H3zM7 17v2M17 17v2M9 3h6' };
const ic = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const glow = (s = 36) => `<span class="h40-glow" style="width:${s}px;height:${s}px" aria-hidden="true"></span>`;
const av = (p, s = 30) => (p?.avatar ? `<img class="h40-av" src="${esc(p.avatar)}" alt="" style="width:${s}px;height:${s}px">` : `<i class="h40-av" style="width:${s}px;height:${s}px">${esc(first(p?.name).slice(0, 2) || '?')}</i>`);
const recips = () => { const M = mine(); const R = M?.recipients?.length ? M.recipients : others(); return R.map((r) => (typeof r === 'object' ? r : others().find((p) => String(p.userId) === String(r)) ?? { name: String(r) })); };
const names = (L) => { const n = L.map((p) => first(p.name)).filter(Boolean); return n.length > 1 ? `${n.slice(0, -1).join(', ')} og ${n[n.length - 1]}` : n[0] || 'Husstanden'; };
/** Enkelt kart: ruten fra geometry (lat/lon) normalisert, ellers en rolig kurve fra «deg» til hjem. */
function mapSvg(dark) {
  const G = Array.isArray(HJ.route?.geometry) ? HJ.route.geometry : Array.isArray(HJ.route?.geometry?.coordinates) ? HJ.route.geometry.coordinates.map(([lon, lat]) => [lat, lon]) : null;
  let path = 'M40 120 C 110 110, 120 60, 190 58 S 280 30, 300 26', a = [40, 120], b = [300, 26];
  if (G && G.length > 1) {
    const la = G.map((p) => +p[0] || +p.lat), lo = G.map((p) => +p[1] || +p.lon), x0 = Math.min(...lo), x1 = Math.max(...lo), y0 = Math.min(...la), y1 = Math.max(...la);
    const sx = (v) => 30 + ((v - x0) / Math.max(1e-6, x1 - x0)) * 280, sy = (v) => 130 - ((v - y0) / Math.max(1e-6, y1 - y0)) * 110;
    const P = G.map((p, i) => [sx(lo[i]), sy(la[i])]); path = P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '); a = P[0]; b = P[P.length - 1];
  }
  const st = dark ? { bg: '#16202c', st: 'rgba(255,255,255,.06)', rt: '#ffd27a' } : { bg: '#ebe4d6', st: 'rgba(27,26,23,.07)', rt: '#2b5d8a' };
  return `<svg class="h40-map" viewBox="0 0 340 150" role="img" aria-label="Kart med ruten hjem"><rect width="340" height="150" rx="18" fill="${st.bg}"/>
    ${[30, 70, 110].map((y) => `<path d="M0 ${y} Q170 ${y + 14} 340 ${y - 6}" stroke="${st.st}" stroke-width="10" fill="none"/>`).join('')}${[80, 170, 260].map((x) => `<path d="M${x} 0 Q${x + 18} 75 ${x - 8} 150" stroke="${st.st}" stroke-width="8" fill="none"/>`).join('')}
    <path d="${path}" stroke="${st.rt}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 0"/>
    <circle cx="${a[0]}" cy="${a[1]}" r="7" fill="#fff" stroke="${st.rt}" stroke-width="3"/>
    <g transform="translate(${b[0] - 13} ${b[1] - 13})"><circle cx="13" cy="13" r="13" fill="#F2A93B"/><path d="M7 14l6-5 6 5M9 13v6h8v-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
    <text x="16" y="142" font-size="10" font-weight="700" fill="${dark ? 'rgba(255,255,255,.5)' : 'rgba(27,26,23,.45)'}" font-family="IBM Plex Mono,monospace" letter-spacing="1.2">KART</text></svg>`;
}

/* ---------- Kortene (Familie og Hjem) ---------- */
function stateLine(p) {
  const st = p.state ?? 'onTheWay';
  if (st === 'home') return `hjemme ${hm(p.since ?? p.homeAt ?? Date.now())}`;
  if (st === 'late') return `${p.lateMinutes ? `${p.lateMinutes} min over` : 'forsinket'}`;
  return `på vei hjem${p.eta ? ` · ${hm(p.eta)}` : ''}`;
}
const dot = (st) => `<span class="h40-dot ${esc(st ?? 'onTheWay')}" aria-hidden="true"><i></i></span>`;
function minePill(M) {
  const left = M.eta ? Math.max(0, Math.round((new Date(M.eta) - Date.now()) / 60e3)) : null, st = M.state;
  return `<button type="button" class="h40-mine ${esc(st)}" data-p40="hjopen">${dot(st)}<span class="m-grow"><b>${st === 'late' ? `${M.lateMinutes ?? ''} min over`.trim() : left != null ? `Hjem om ${left} min` : 'På vei hjem'}</b><span>${st === 'late' ? 'Familien har fått beskjed' : `${esc(names(recips()))} følger med · ${hm(M.eta)}`}</span></span><span class="h40-go">›</span></button>`;
}
function sugCard() {
  const S0 = HJ.sug; if (!S0 || HJ.sugOff || mine()) return '';
  const R = Array.isArray(S0.recipients) && S0.recipients.length ? S0.recipients.map((r) => (typeof r === 'object' ? r : { name: r })) : others();
  const txt = S0.text || `${S0.reason ? `${S0.reason.replace(/[.·]\s*$/, '')}. ` : ''}Skal jeg si fra til ${names(R)} når du er hjemme?`;
  return `<div class="h40-sug"><span class="h40-gm">✦</span><span class="m-grow"><b>Glimt</b><span>${esc(txt)}</span>${S0.eta ? `<small>hjemme ca. ${esc(hm(S0.eta))}</small>` : ''}</span>
    <div class="h40-sugb"><button type="button" class="pri" data-p40="hjsugyes">Ja, start</button><button type="button" data-p40="hjsugno">Ikke nå</button></div></div>`;
}
/** Familie: Hjemlys i familien (status, egen økt, Glimt-forslag, logg). */
export function famCard() {
  hjLoad();
  if (HJ.miss) return '';
  const M = mine(), H = activeOthers();
  const logs = (HJ.d?.log ?? []).slice(0, 3);
  return `<div class="f22-card h40-card"><div class="h40-h">${glow()}<span class="m-grow"><b>Hjemlys</b><span>Et lite lys som står på til du er hjemme.</span></span>${M ? '' : '<button type="button" class="h40-start" data-p40="hjstart">Start</button>'}</div>
    ${M ? minePill(M) : ''}${sugCard()}
    ${H.length ? `<span class="h40-lab">HJEMLYS I FAMILIEN</span><div class="h40-fam">${H.map((p) => `<button type="button" data-p40="hjwho" data-u="${esc(p.userId)}">${av(p)}<span class="m-grow"><b>${esc(first(p.name))}</b><span class="${p.state === 'late' ? 'red' : ''}">${esc(stateLine(p))}</span></span>${dot(p.state)}</button>`).join('')}</div>` : '<span class="h40-note">Ingen i husstanden har Hjemlys på nå.</span>'}
    ${logs.length ? `<div class="h40-log">${logs.map((l) => `<span>${esc(hm(l.at))} · ${esc(l.text)}</span>`).join('')}</div>` : ''}
    <span class="h40-note">Ingenting deles før du er sen. Da får husstanden siste posisjon, ruten, batteri og dekning.</span></div>`;
}
/** Hjem-widgeten (h14): aktiv økt, husstanden, «Start for meg». */
export function homeCard(editing = false) {
  hjLoad();
  if (HJ.miss) return editing ? `<div class="pp-card h40-card"><div class="h40-h">${glow()}<span class="m-grow"><b>Hjemlys</b><span>Krever en nyere server</span></span></div></div>` : '';
  const M = mine(), H = others();
  return `<div class="pp-card h40-card"><div class="h40-h">${glow(30)}<span class="m-grow"><b class="h40-k">HJEMLYS</b></span></div>
    ${M ? minePill(M) : sugCard()}
    ${H.length ? `<div class="h40-fam sm">${H.slice(0, 4).map((p) => `<button type="button" data-p40="hjwho" data-u="${esc(p.userId)}">${av(p, 26)}<span class="m-grow"><b>${esc(first(p.name))}</b></span><span class="${p.state === 'late' ? 'red' : ''}">${esc(p.state && p.state !== 'ended' ? stateLine(p) : 'hjemme')}</span></button>`).join('')}</div>` : ''}
    ${M ? '' : '<button type="button" class="h40-startw" data-p40="hjstart">Start for meg</button>'}</div>`;
}

/* ---------- Fullskjerm: start, aktiv økt (dag/natt), samtale, mottaker ---------- */
function startView(dk) {
  const R = HJ.route, O = opts(), to = R?.to?.name ?? R?.home?.name ?? 'Hjem', from = R?.from;
  const rc = others(), eta = etaDate();
  const share = [['Posisjon'], ['Rute'], ['Batteri og dekning'], ['Siste opplåsing'], ['Hvem du var med']];
  return `<div class="h40-top"><button type="button" class="h40-back" data-p40="hjx">Avbryt</button><b>Hjemlys</b><span class="h40-sp"></span></div>
    ${dk ? '' : mapSvg(false)}
    <span class="h40-lab">${dk ? `HJEM: ${esc(to.toUpperCase())}${from?.km != null ? ` · ${esc(String(from.km).replace('.', ','))} KM` : ''}` : 'SI FRA NÅR JEG ER HJEMME'}</span>
    ${dk ? '' : `<div class="h40-dest"><b>${esc(to)}</b><span>${from?.name ? `Fra ${esc(from.name)}` : 'Fra der du er'}${from?.km != null ? ` · ${esc(String(from.km).replace('.', ','))} km` : ''}</span></div>`}
    ${O.length ? `<div class="h40-opts${dk ? ' grid' : ''}" role="radiogroup" aria-label="Reisemåte">${O.map((o) => `<button type="button" role="radio" aria-checked="${HJ.mode === o.mode && !HJ.custom}" data-p40="hjmode" data-v="${esc(o.mode)}"><span class="h40-oi">${ic(MODE_IC[o.mode] ?? MODE_IC['gå'])}</span><span class="m-grow"><b>${esc(o.label ?? o.mode)}</b>${dk ? '' : (o.legs?.length ? `<span>${esc(o.legs.map((l) => (typeof l === 'string' ? l : l.label ?? l.mode)).join(' · '))}</span>` : '')}</span><span class="h40-oe">${dk ? '' : 'ca. '}${esc(o.eta ? hm(o.eta) : o.minutes ? hm(Date.now() + o.minutes * 60e3) : '')}</span>${dk ? '' : `<span class="h40-ck">${HJ.mode === o.mode && !HJ.custom ? '✓' : ''}</span>`}</button>`).join('')}</div>`
      : HJ.routeBusy ? '<span class="h40-note">Finner veien hjem …</span>' : ''}
    <label class="h40-time"><span>${O.length ? 'Eller velg tid selv' : 'Forventet hjemme'}</span><input type="time" id="h40-eta" data-p40in="hjeta" value="${esc(HJ.eta)}"></label>
    <div class="h40-sec"><span class="h40-lab">${dk ? 'VENTER LITT FØR VARSEL' : 'HVIS JEG IKKE SVARER, SI FRA ETTER'}</span><div class="h40-seg">${[5, 15, 30].map((w) => `<button type="button" data-p40="hjwait" data-v="${w}" aria-pressed="${HJ.wait === w}">${w} min</button>`).join('')}</div></div>
    <div class="h40-rc"><span class="h40-lab">FÅR BESKJED</span><div>${rc.slice(0, 5).map((p) => av(p, 28)).join('')}<b>${esc(names(rc))}</b></div></div>
    ${dk ? `<div class="h40-sec"><span class="h40-lab">DELES HVIS DU ER SEN</span><div class="h40-share">${share.map(([n]) => `<span>✓ ${n}</span>`).join('')}</div></div>` : '<span class="h40-note">Tiden oppdateres etter hvor du er. Deler ingenting før du er sen, eller hvis du ikke svarer.</span>'}
    <button type="button" class="h40-big" data-p40="hjgo">${dk ? 'Start' : `Start · hjemme ca. ${esc(eta ? hm(eta) : '–')}`}</button>`;
}
function ring(M) {
  const end = new Date(M.eta), st0 = new Date(M.startedAt ?? Date.now() - 30 * 60e3), left = Math.max(0, end - Date.now()), tot = Math.max(1, end - st0);
  const p = M.state === 'late' ? 1 : Math.min(1, 1 - left / tot), R = 92, C = 2 * Math.PI * R;
  const mm = Math.floor(left / 60e3), ss = Math.floor((left % 60e3) / 1e3);
  return `<div class="h40-ring ${esc(M.state)}"><svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="${R}" stroke="rgba(255,255,255,.12)" stroke-width="12" fill="none"/><circle cx="110" cy="110" r="${R}" stroke="${M.state === 'late' ? '#ff6b57' : '#ffd27a'}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 110 110)"/></svg>
    <span class="h40-rt"><small>${M.state === 'late' ? 'SEN' : 'PÅ VEI HJEM'}</small><b data-h40cd>${M.state === 'late' ? `+${M.lateMinutes ?? Math.round((Date.now() - end) / 60e3)}` : `${mm}:${pad(ss)}`}</b><span>til ${esc(hm(M.eta))}</span></span></div>`;
}
function activeView(M, dk) {
  const end = new Date(M.eta), left = Math.max(0, Math.round((end - Date.now()) / 60e3)), late = M.state === 'late';
  const pr = Math.max(0.04, Math.min(1, M.progress ?? (Date.now() - new Date(M.startedAt ?? Date.now())) / Math.max(1, end - new Date(M.startedAt ?? Date.now()))));
  const leg = M.leg ? (typeof M.leg === 'string' ? M.leg : M.leg.label ?? '') : '';
  const L = [...(HJ.log[M.id] ?? []), ...HJ.chat.filter((c) => c.sid === M.id)].sort((a, b) => new Date(a.at) - new Date(b.at));
  const head = `<div class="h40-top"><button type="button" class="h40-back" data-p40="hjx">‹ ${m.screen === 'fam' ? 'Familie' : 'Tilbake'}</button><b>Hjemlys</b>${X('data-p40="hjx"', ' h40-x')}</div>`;
  const btns = late ? `<button type="button" class="h40-big" data-p40="hjok">Alt OK</button><button type="button" class="h40-big alt" data-p40="hjplus" data-v="15">+ 15 min</button>`
    : `<button type="button" class="h40-big alt" data-p40="hjplus" data-v="10">+ 10 min</button><button type="button" class="h40-big" data-p40="hjhome">Jeg er hjemme</button>`;
  const body = dk ? `${ring(M)}<span class="h40-leg">${esc(leg || (late ? 'Familien har fått beskjed med posisjonen din' : 'I rute'))}</span><span class="h40-fol">${esc(names(recips()))} følger med</span>`
    : `<div class="h40-act ${late ? 'late' : ''}"><span class="h40-lab">${late ? `${M.lateMinutes ?? ''} MIN OVER`.trim() : 'PÅ VEI HJEM'}</span><span class="h40-st">startet ${esc(hm(M.startedAt ?? Date.now()))}</span>
      <b class="h40-bt">${esc(hm(M.eta))}</b><span class="h40-om">${late ? 'familien har fått beskjed' : `om ${left} min`}</span>
      <div class="h40-prog"><span><i style="width:${(pr * 100).toFixed(0)}%"></i></span><div><small>${esc(HJ.route?.from?.name ?? 'Start')}</small><small>${esc(leg)}</small><small>Hjem</small></div></div>
      <div class="h40-rows"><div><span>Følger med</span><b>${esc(names(recips()))}</b></div><div><span>Deler nå</span><b>${late ? 'Posisjon, rute, batteri' : 'Ingenting'}</b></div><div><span>Hvis du er sen</span><b>Posisjon, rute, batteri +2</b></div></div></div>`;
  const chat = `<div class="h40-chat"><span class="h40-lab">✦ GLIMT FØLGER MED</span>${L.length ? L.slice(-8).map((c) => `<div class="${c.me ? 'me' : ''}">${esc(c.text)}<small>${esc(hm(c.at))}</small></div>`).join('') : `<div>Startet ${esc(hm(M.startedAt ?? Date.now()))}. ${esc(names(recips()))} får beskjed når du er hjemme, ca. ${esc(hm(M.eta))}.</div>`}
    <form class="h40-cf" data-p40form="hjchat"><input id="h40-q" data-p40in="hjq" value="${esc(HJ.q)}" placeholder="Skriv til Glimt …" autocomplete="off" enterkeyhint="send" aria-label="Skriv til Glimt"><button type="submit" aria-label="Send">↑</button></form></div>`;
  return `${head}${body}<div class="h40-btns">${btns}</div>${dk ? '' : ''}${chat}<button type="button" class="h40-end" data-p40="hjend">Avslutt Hjemlys</button>
    <span class="h40-note">Avsluttes av seg selv når telefonen kobler til hjemme-Wi-Fi eller er innenfor 60 m av hjemmet.</span>`;
}
/** Mottaker: «X er ikke hjemme ennå» (1a) / rød alarmskjerm (1c). */
function whoView(p, alarm) {
  const S0 = p.share ?? {}, pos = S0.pos ?? S0.position ?? null;
  const rows = [['Siste posisjon', pos ? `${pos.name ?? `${(+pos.lat).toFixed(4)}, ${(+pos.lon).toFixed(4)}`}${pos.at ? ` · ${hm(pos.at)}` : ''}` : null], ['Ruten', S0.route?.label ?? (Array.isArray(S0.route) ? `${S0.route.length} punkter` : S0.route ?? null)], ['Batteri · dekning', S0.battery != null || S0.signal ? `${S0.battery != null ? `${S0.battery} %` : '–'}${S0.signal ? ` · ${S0.signal}` : ''}` : null], ['Sist låst opp', S0.unlockedAt ? hm(S0.unlockedAt) : null], ['Var med', S0.with ? (Array.isArray(S0.with) ? S0.with.map((w) => w.name ?? w).join(', ') : S0.with.name ?? S0.with) : null]].filter(([, v]) => v);
  const late = p.state === 'late', nm = first(p.name);
  const map = pos ? `https://maps.apple.com/?q=${encodeURIComponent(`${pos.lat},${pos.lon}`)}` : null, tel = p.phone ? `tel:${String(p.phone).replace(/\s/g, '')}` : null;
  const withP = Array.isArray(S0.with) ? S0.with.find((w) => w?.phone) : S0.with?.phone ? S0.with : null;
  const title = !late ? (p.state === 'home' ? `${nm} er hjemme` : `${nm} er på vei hjem`) : alarm ? `${nm} er ${p.lateMinutes ?? ''} min forsinket`.replace('  ', ' ') : `${nm} er ikke hjemme ennå`;
  const sub = late ? `Ventet ${hm(p.eta)}${p.lateMinutes ? ` · ${p.lateMinutes} min over` : ''}${S0.okAsked ? ` · svarte ikke på «Alt OK?» kl. ${hm(S0.okAsked)}` : ''}` : p.state === 'home' ? `${hm(p.since ?? Date.now())} · delingen er stoppet` : `Hjemme ca. ${hm(p.eta)}`;
  return `<div class="h40-top"><span class="h40-lab">${alarm ? 'KRITISK · BRYTER IKKE FORSTYRR' : `${esc(first(m.me?.name ?? 'DU').toUpperCase())} SER DETTE`}</span>${X(`data-p40="${alarm ? 'hjalarmx' : 'hjx'}"`, ' h40-x')}</div>
    <b class="h40-wt">${esc(title)}</b><span class="h40-ws">${esc(sub)}</span>
    ${late ? (rows.length ? `<div class="h40-rows big">${rows.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>` : '<span class="h40-note">Ingen posisjon er delt ennå.</span>') : '<span class="h40-note">Ingenting deles før tiden har gått ut.</span>'}
    <div class="h40-btns col">${tel ? `<a class="h40-big" href="${esc(tel)}">Ring ${esc(nm)}</a>` : ''}${map ? `<a class="h40-big alt" href="${esc(map)}" target="_blank" rel="noopener">Åpne kart</a>` : ''}${alarm && withP ? `<a class="h40-big alt" href="tel:${esc(String(withP.phone).replace(/\s/g, ''))}">Ring ${esc(first(withP.name))}</a>` : ''}${alarm ? '<a class="h40-big red" href="tel:112">Ring 112</a>' : ''}</div>`;
}
export function layer() {
  if (HJ.alarm) {
    const p = others().find((x) => String(x.userId) === String(HJ.alarm.userId)) ?? HJ.alarm;
    return `<div class="h40-v alarm" role="alertdialog" aria-modal="true" aria-label="Hjemlys · forsinket"><div class="h40-in">${whoView(p, true)}</div></div>`;
  }
  if (!HJ.open) return '';
  const M = mine(), dk = night();
  let inner;
  if (HJ.view === 'who') { const p = others().find((x) => String(x.userId) === String(HJ.who)); inner = p ? whoView(p, false) : startView(dk); }
  else inner = M ? activeView(M, dk) : startView(dk);
  return `<div class="h40-v${dk ? ' dk' : ''}" role="dialog" aria-modal="true" aria-label="Hjemlys"><div class="h40-in">${inner}</div></div>`;
}

/* ---------- Handlinger ---------- */
function open(eta) {
  HJ.open = true; HJ.view = 'start'; HJ.custom = !!eta;
  if (eta) { const d = new Date(eta); if (!Number.isNaN(+d)) HJ.eta = `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  else if (!HJ.eta) { const d = new Date(Date.now() + 30 * 60e3); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); HJ.eta = `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  const M = mine(); if (M?.id) logLoad(M.id).then(draw); else routeLoad();
  haptic('tap'); draw();
}
async function act(path, json, say) {
  const M = mine(); if (!M?.id) return;
  try { const r = await hlApi(`/hjemlys/${encodeURIComponent(M.id)}${path}`, { method: path ? 'POST' : 'PATCH', json }); if (r?.session) HJ.d = { ...(HJ.d ?? {}), mine: r.session }; haptic('ok'); if (say) glimtSay(M.id, say(r?.session ?? mine())); }
  catch (e) { flash(e.message, 'err'); }
  if (path === '/home' || path === '/end') { HJ.open = false; if (path === '/home') { vib([8, 30, 12]); flash(`Hjemme ${hm(Date.now())} ✓ · ${names(recips())} har fått beskjed`, 'ok'); } }
  await hjLoad(true);
}
function glimtSay(sid, text, me = false) { if (text) HJ.chat.push({ sid, at: new Date().toISOString(), text, me }); }
async function start() {
  const d = etaDate(); if (!d) { flash('Velg når du er hjemme', 'err'); return; }
  try {
    const r = await hlApi('/hjemlys/start', { method: 'POST', json: { eta: d.toISOString(), mode: HJ.custom ? 'manual' : HJ.mode ?? 'manual', waitMin: HJ.wait, recipients: others().map((p) => p.userId) } });
    HJ.d = { ...(HJ.d ?? {}), mine: r?.session ?? r }; haptic('ok'); vib([8, 30, 12]);
    const M = mine(); if (M?.id) { glimtSay(M.id, `Startet ${hm(Date.now())}. ${names(recips())} får beskjed når du er hjemme, ca. ${hm(M.eta)}.`); logLoad(M.id).then(draw); }
    HJ.view = 'start'; HJ.sugOff = true;
  } catch (e) { flash(e.status === 404 ? 'Hjemlys krever en nyere server' : e.message, 'err'); }
  await hjLoad(true); watch(true);
}
/** 1b: korte svar fra Glimt i økta (lokalt; serveren logger hendelsene). */
async function chat(q) {
  const M = mine(); if (!M?.id || !q.trim()) return;
  glimtSay(M.id, q.trim(), true); HJ.q = ''; draw();
  const s = q.toLowerCase(), n = /(\d{1,3})\s*min/.exec(s);
  if (/hjemme|framme|fremme/.test(s)) { await act('/home'); return; }
  if (/avslutt|stopp/.test(s)) { await act('/end'); return; }
  if (/\bok\b|alt (er )?(bra|ok|fint)/.test(s) && M.state === 'late') { await act('/ok', undefined, () => 'Godt å høre. Jeg sier fra til familien at alt er i orden.'); return; }
  const add = n ? Math.min(120, +n[1]) : /innom|stopper|senere|forsink|tar litt|kiwi|butikk|venter/.test(s) ? 10 : 0;
  if (add) { await act('', { plus: add }, (S2) => `Greit, jeg legger til ${add} minutter. Ny tid ca. ${hm(S2?.eta ?? Date.now())}. Familien ser bare den nye tiden.`); return; }
  glimtSay(M.id, `Jeg følger med. Du er ventet hjemme ca. ${hm(M.eta)}. Skriv «+ 10 min» eller «hjemme».`); draw();
}
/** Nedtellingen i nattmodus oppdateres i DOM hvert sekund (ingen ny tegning). */
function tickOn() {
  const on = !!mine() && (HJ.open || ['fam', 'hl'].includes(m.screen));
  if (on && !HJ.tick) HJ.tick = setInterval(() => {
    const M = mine(), el = document.querySelector('#app [data-h40cd]'); if (!M || !el || M.state === 'late') return;
    const left = Math.max(0, new Date(M.eta) - Date.now()); el.textContent = `${Math.floor(left / 60e3)}:${pad(Math.floor((left % 60e3) / 1e3))}`;
  }, 1000);
  if (!on && HJ.tick) { clearInterval(HJ.tick); HJ.tick = null; }
}
/** Posisjon mens økta er aktiv (maks hvert 30. s / 50 m). Starter bare etter at brukeren selv har startet Hjemlys. */
function watch(user = false) {
  const M = mine(), on = !!(M && (M.state === 'onTheWay' || M.state === 'late'));
  if (!on) { if (HJ.watch != null) { try { navigator.geolocation.clearWatch(HJ.watch); } catch {} HJ.watch = null; } return; }
  if (HJ.watch != null || !navigator.geolocation || (!user && !HJ.watchOk)) return;
  HJ.watchOk = true;
  try {
    HJ.watch = navigator.geolocation.watchPosition(async (p) => {
      const c = p.coords, L = HJ.lastPos, now = Date.now();
      const dist = L ? Math.hypot((c.latitude - L.lat) * 111e3, (c.longitude - L.lon) * 111e3 * Math.cos((c.latitude * Math.PI) / 180)) : 1e9;
      if (now - HJ.lastAt < 30e3 && dist < 50) return;
      HJ.lastPos = { lat: c.latitude, lon: c.longitude }; HJ.lastAt = now;
      let battery; try { const b = await navigator.getBattery?.(); if (b) battery = Math.round(b.level * 100); } catch {}
      const cur = mine(); if (!cur?.id) return;
      hlApi(`/hjemlys/${encodeURIComponent(cur.id)}`, { method: 'PATCH', json: { pos: { lat: c.latitude, lon: c.longitude, acc: Math.round(c.accuracy) }, battery, signal: navigator.connection?.effectiveType } })
        .then((r) => { if (r?.session) { HJ.d = { ...(HJ.d ?? {}), mine: r.session }; redraw(); } }).catch(() => {});
    }, () => {}, { enableHighAccuracy: false, maximumAge: 30e3, timeout: 20e3 });
  } catch {}
}
export async function bind(k, x, e) {
  switch (k) {
    case 'hjstart': open(x.dataset.eta || null); return true;
    case 'hjopen': open(null); return true;
    case 'hjx': HJ.open = false; HJ.view = 'start'; haptic('tap'); draw(); return true;
    case 'hjwho': HJ.who = x.dataset.u; HJ.view = 'who'; HJ.open = true; haptic('tap'); draw(); return true;
    case 'hjalarmx': { const a = HJ.alarm; if (a) HJ.seenAlarm[a.sessionId ?? a.id ?? a.userId] = 1; HJ.alarm = null; draw(); return true; }
    case 'hjmode': { HJ.mode = x.dataset.v; HJ.custom = false; setEtaFrom(opts().find((o) => o.mode === HJ.mode)); haptic('tab'); draw(); return true; }
    case 'hjwait': HJ.wait = +x.dataset.v; haptic('tab'); draw(); return true;
    case 'hjgo': e.preventDefault(); start(); return true;
    case 'hjsugyes': { HJ.custom = !!HJ.sug?.eta; if (HJ.sug?.eta) { const d = new Date(HJ.sug.eta); HJ.eta = `${pad(d.getHours())}:${pad(d.getMinutes())}`; } HJ.open = true; await start(); HJ.open = true; draw(); return true; }
    case 'hjsugno': HJ.sugOff = true; haptic('tap'); draw(); return true;
    case 'hjplus': act('', { plus: +x.dataset.v || 10 }, (S2) => `Lagt til ${+x.dataset.v || 10} min. Ny tid ca. ${hm(S2?.eta ?? Date.now())}.`); return true;
    case 'hjhome': act('/home'); return true;
    case 'hjok': act('/ok', undefined, () => 'Takk! Familien får beskjed om at alt er OK.'); return true;
    case 'hjend': act('/end'); return true;
    default: return false;
  }
}
export function input(t) {
  if (t.dataset?.p40in === 'hjeta') { HJ.eta = t.value; HJ.custom = true; const b = document.querySelector('#app [data-p40="hjgo"]'); const d = etaDate(); if (b && d && !night()) b.textContent = `Start · hjemme ca. ${hm(d)}`; document.querySelectorAll('#app .h40-opts [role=radio]').forEach((r) => r.setAttribute('aria-checked', 'false')); return true; }
  if (t.dataset?.p40in === 'hjq') { HJ.q = t.value; return true; }
  return false;
}
export function submit(f) { if (f === 'hjchat') { chat(HJ.q); return true; } return false; }
export function onRt(d) { HJ.t = 0; hjLoad(true); const M = mine(); if (M?.id && d?.text) glimtSay(M.id, d.text); }
export function afterDraw() { tickOn(); const r = document.documentElement; r.classList.toggle('h40-ov', !!(HJ.open || HJ.alarm)); }
export function visible() { if (['fam', 'hl'].includes(m.screen) || HJ.open) { HJ.t = 0; hjLoad(true); } }
