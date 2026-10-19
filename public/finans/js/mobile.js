// Mobil-PWA (prompt 06). Tema: iOS Liquid Glass på iPhone/iPad, ellers Android Material 3 Expressive (med Material You-farger).
// Appen åpner på Homelab. Finans er et «annet OS» med fanene Oversikt, Liste, Finn, Søk og Mer (Budsjett øverst i Mer); Matplan og Domener fyller hele skjermen.
// ≥ 600 px (åpen brettbar): navigasjonsrail + to paneler for Finans (liste/detalj).
import {
  S, api, esc, n0, n2, sgn, neg, dd, dWeek, today, monthName, cap, ini, greet, parseAmount,
  loadBoot, loadSummary, loadTx, loadReceipts, cats, accs, uploadReceipt, icon, aiLine, conic, navName } from './core.js';
import { logo, posLoad, regLoad, take20, p20Down, p20Move, p20Up, p20Click, p20Screen } from './mobile-p20.js';
import * as UPQ from './mobile-upq.js';
import { accountInit, logout, p21Bind, p21Sheets, dragMove, dragEnd } from './mobile-p21.js';
import { MODS, modView, modLoad, domNav, modBind, modAfterDraw } from './mobile-mods.js';
import { settingsView, settingsLoad, settingsBind } from './mobile-set.js';
import { hlView, hlLoad, hlBind, hlAfterDraw, LAY, loadLayout } from './mobile-hl.js';
import { PAGES, pageView, pageLoad, pagesBind, pageAfterDraw } from './mobile-pages.js';
import { txDetail, editForm, origOverlay, txBind } from './mobile-tx.js';
import { applyM3, applyPaper, c3 } from './mobile-theme.js';
import { matView, matLoad, matBind, matDark } from './mobile-mat.js';
import { finnView, finnLoad, finnBind } from './mobile-finn.js';
import { TR, trkView, trkLoad, trkBind, trkWatch } from './mobile-track.js';
import { haptic } from './mobile-haptics.js';
import { subsBind, soDown, soMove, soUp } from './mobile-subs.js';
import { paper, paperDark, paperHero, paperNav, paperScanSheet, paperHome, paperFin, paperMer, mediaView, mediaLoad, newsView, newsLoad, paperBind, photoLoad, takeDesign, paperState, paperDown, paperUp, paperMove } from './mobile-paper.js';
import { paperList, paperFinn, paperFinnSheet, paperFinnLoad, paperFinnBind, paperTrk, paperTrkSheet, paperTrkBind } from './mobile-paper2.js';
import { take15, edDown, edMove, edUp, edClick, edReset, paperSearch, fsBind, paperTx, txLoad, txBind15, finMerGrid, fmerLoad, rcCount, recentLoad, newShipSheet, nsBind, navSetBind, fabStyle } from './mobile-paper3.js';
import { wxView, wxLoad, wxBind, wxBindScroll, WX, wxAfterDraw, wxPlaces } from './mobile-wx.js';
import { wx22Down, wx22Move, wx22Up } from './mobile-wx22.js';
import * as P22 from './mobile-p22.js';
import * as P23 from './mobile-p23.js';
import * as P24 from './mobile-p24.js';
import * as P25 from './mobile-p25.js';
import * as P26 from './mobile-p26.js';
import * as KAL from './mobile-kal.js';
import * as P27 from './mobile-p27.js';
import * as CHAT from './mobile-chat.js';
import { takeApp, HK, p17Bind, p17Sheets, huskeView, tasksLoad, posWidget, bolWidgetLoad, appLoad, applyIcon, ptrBind, wsConnect, onRealtime } from './mobile-p17.js';
import { trkDown, trkMove, trkUp } from './mobile-paper2.js';
import { take16, p16Bind, p16Pointer, p16Move, p16Up, tabSheet, avgView, avgLoad, avgSheet, famView, famLoad, famSheet, famAfterDraw, bolView, bolLoad, AV, BO } from './mobile-p16.js';

const u = S.ui;
export const m = {
  screen: 'hl', sub: '', sel: null, budSel: null, rc: null, filter: '', toast: '', menu: false, jobs: [], uploading: 0, detail: false,
  sheet: false, min: false, tabIdx: 0, reveal: false, offline: [], me: null, edit: null, orig: null, pdet: null, txCache: {}, light: false,
};
const root = () => document.getElementById('app');
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const theme = () => { if (paper()) return 'and'; try { const t = localStorage.getItem('fh_theme'); if (t === 'ios' || t === 'and') return t; } catch {} return isIOS() ? 'ios' : 'and'; };
export const two = () => matchMedia('(min-width: 600px)').matches;
export const iosBg = () => { if (paper()) return false; try { return localStorage.getItem('fh_ios_bg') !== '0'; } catch { return true; } };
const ACTIVE = ['pending', 'processing'];
export const ACTIVE_JOBS = ACTIVE;
export const amtC = (v, th) => (v > 0 ? '#9FE3C6' : th === 'and' ? c3('#F0DFD7') : 'inherit');

/* ---------- Skjermer og faner ---------- */

// Faner kan skjules og flyttes i «Rediger forsiden» (LAY.hlTabs / LAY.finTabs).
// ISO2: Domener er fortsatt bare for admin. Rollen fra /api/me, ellers canEditServer fra /bootstrap (= admin).
export const domOk = () => (m.me?.role ? m.me.role === 'admin' : S.boot?.canEditServer !== false);
export const HLTABS = { hl: ['hl', 'Homelab', 'hlhome'], home: ['hjem', 'Finans', 'fin'], trk: ['spor', 'Sporing', 'box'], dom: ['dom', 'Domener', 'globe'], mat: ['mat', 'Mat', 'mat'] };
export const FINTABS = { home: ['hjem', 'Oversikt', 'home'], list: ['liste', 'Liste', 'list'], finn: ['finn', 'Finn', 'finn'], bud: ['budsjett', 'Budsjett', 'bud'], ai: ['sok', 'Søk', 'ai'], mer: ['mer', 'Mer', 'mer'] };
export const FIXED_HL = ['hl', 'home'], FIXED_FIN = ['home', 'mer'];
const FINMODS = ['sub', 'dir', 'finn'];
export const FIN = ['hjem', 'liste', 'budsjett', 'sok', 'skann', 'opp', ...PAGES, ...FINMODS];
const TWO = ['hjem', 'liste', 'budsjett', 'skann', 'opp', 'sok'];
const HLG = ['hl', 'spor', 'set'];
const ALL = [...new Set([...FIN, 'hl', 'spor', 'mat', 'dom', 'set', 'media', 'nyheter', 'fmer', 'vaer', 'avg', 'fam', 'huske', 'bd', 'kal', 'chat'])];
// Oversikt, Liste og Budsjett bruker egne navn fra Sidemeny; Søk og Mer beholder de korte navnene i fanelinja.
const RENAME = ['home', 'list', 'bud', 'finn'];
// Egne navn fra Innstillinger → Utseende → Navigasjonslinje (LAY.names) går foran; tomt felt gir standardnavnet.
export const tabName = (def, k) => LAY().names?.[(def === FINTABS ? 'fin.' : 'hl.') + k] || (def === FINTABS && RENAME.includes(k) ? navName(k, def[k][1]) : def[k][1]);
const tabsOf = (keys, def, fixed) => keys.filter((k) => def[k] && (fixed.includes(k) || !LAY().hide[k]) && (def[k][0] !== 'dom' || domOk())).map((k) => [def[k][0], tabName(def, k), def[k][2]]);
export const hlTabs = () => tabsOf(LAY().hlTabs, HLTABS, FIXED_HL);
export const finTabs = () => tabsOf(LAY().finTabs, FINTABS, FIXED_FIN);
// En skjult fane (f.eks. Budsjett når Finn har tatt plassen) markerer Mer, der den ligger øverst.
const finCur = (s) => { const c = ['liste', 'budsjett', 'sok', 'finn'].includes(s) ? s : [...PAGES, ...FINMODS].includes(s) ? 'mer' : 'hjem'; return c === 'hjem' || finTabs().some(([k]) => k === c) ? c : 'mer'; };

/* ---------- Valg på denne enheten (localStorage) ---------- */
const PDEF = { scanTap: 'cam', start: 'hl', hideAmt: false, appHide: false, lock: false, lockAfter: '5', crop: true, origImg: true, wifi: false, nSub: false, nDom: true, nWeek: false, m3Seed: 'sys', m3Mode: 'dark', pageColors: 'same', mDesign: 'klassisk', paperMode: 'auto', photo: 'cur', bgBlur: 0, bgDim: 0, bgAnimate: true, bgPlanet: 'auto', bgRotate: 'daily' };
let P = {};
// Prompt 22: en ny enhet (ingen lagrede valg) starter i Papir, så FinansHub-sidene får lys-tokenene fra start.
try { const raw = localStorage.getItem('fh_mprefs'); P = raw ? JSON.parse(raw) || {} : { mDesign: 'papir', startV2: 1 }; } catch { P = {}; }
if (P.start === 'hjem' && !P.startV2) { P.start = 'hl'; P.startV2 = 1; } // Homelab er ny standard startside
export const pref = (k) => P[k] ?? PDEF[k];
export function setPref(k, v) { P = { ...P, [k]: v, startV2: 1 }; try { localStorage.setItem('fh_mprefs', JSON.stringify(P)); } catch {} }
export const hide = (txt) => (pref('hideAmt') && !m.reveal ? '••••' : txt);

/* ---------- Startside og vei tilbake ---------- */
// Startside lagres per bruker (LAY.start). Med Finans som startside går «hjem» til Finans, og Homelab ligger i profilmenyen.
const START = { homelab: 'hl', 'fin-hjem': 'hjem', 'fin-liste': 'liste', 'fin-budsjett': 'budsjett' };
export const startScr = () => P24.profStart() ?? START[LAY().start] ?? (['hl', 'hjem', 'liste', 'budsjett'].includes(pref('start')) ? pref('start') : 'hl');
export const startFin = () => startScr() !== 'hl';
// Prompt 14: «Knapp i linjen» er fjernet. Pila øverst til venstre går alltid til startsiden.
export const backStyle = () => 'arrow';
const FINMAIN = ['hjem', 'liste', 'budsjett', 'finn', 'sok', 'mer'];
/** Pil øverst («‹ Homelab»/«‹ Finans») i moduler og Finans-fanene. Matplan har alltid pilen (den har ingen fanelinje). */
export function backTop(scr = m.screen) {
  if (scr === startScr() || scr === 'set') return false;
  if (scr === 'mat') return true;
  if (backStyle() === 'bar') return false;
  if (scr === 'dom') return true; // Abonnementer, Boliger og Finn har egen pil tilbake til Mer
  if (!startFin() && FINMAIN.includes(scr)) return !(m.detail && !two()) && !m.edit && !m.pdet && !(scr === 'finn' && m.sub);
  if (startFin() && (scr === 'hl' || scr === 'spor')) return true;
  return false;
}
const homeLbl = () => (startFin() ? 'Finans' : 'Homelab');
function topRow(th) {
  return `<div class="toprow"><a class="${th === 'ios' ? 'gtop' : 'atop'}" href="#/${startScr()}" aria-label="Tilbake til ${homeLbl()}">${th === 'ios' ? icon('chev', 18, 'currentColor', 2.6) : '←'}<span>${homeLbl()}</span></a><span class="m-grow"></span>${avatar('topav')}</div>`;
}

/* ---------- Byggeklosser ---------- */

export const txItem = (t, th, on) => `<button class="item${on ? ' on' : ''}" data-tx="${t.id}">${logo(t, 40, th === 'ios' ? 20 : 12)}
  <span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(t.description)}</span>${aiLine(t.aiShort, 'm-ell ai')}<span class="m-ell s">${dd(t.date)} · ${esc(t.category)}</span></span>
  <span class="m-mono" style="font-weight:600;color:${amtC(t.amount, th)}">${sgn(t.amount)}</span></button>`;

function groups(items, th) {
  const by = new Map();
  for (const t of items) (by.get(t.date) ?? by.set(t.date, []).get(t.date)).push(t);
  return [...by].map(([d, list]) => `<div class="sec">${cap(dWeek(d))}</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${list.map((t) => txItem(t, th, m.sel === t.id)).join('')}</div>`).join('');
}

function hero(th) {
  const s = S.summary;
  if (!s) return `<div class="hero ${th === 'ios' ? 'glass' : ''}"><div class="m-spin"></div></div>`;
  const pct = s.budgetTotal ? Math.min(100, (s.budgetUsed / s.budgetTotal) * 100) : 0;
  return `<div class="hero ${th === 'ios' ? 'glass' : ''}"><div class="lbl">Igjen å bruke${th === 'ios' ? ` i ${monthName(s.month)}` : ''}</div>
    <div class="amt" data-mact="reveal">${hide(neg(s.left).replace(/,\d\d$/, ''))}<small> kr</small></div>
    <div class="m-bar"><i style="width:${pct}%;background:#FF8A4C"></i></div>
    <div class="foot"><span>Brukt ${hide(n0(s.budgetUsed))} kr</span><span>${hide(n0(Math.max(0, s.left) / Math.max(1, s.daysLeft)))} kr/dag</span></div></div>`;
}

const reviewCta = (th) => {
  const q = (S.summary?.review ?? []).filter((r) => r.status === 'needs_review');
  if (!q.length) return '';
  return `<a class="cta ${th === 'ios' ? 'glass' : ''}" href="#/kv"><span class="n">${q.length}</span><span class="m-grow"><b style="display:block;font-weight:600">${th === 'ios' ? 'Kvitteringer til gjennomgang' : 'Til gjennomgang'}</b><span class="m-ell" style="font-size:13px;opacity:.75">${esc(q.map((r) => r.merchant ?? 'Ny').join(' · '))}</span></span><span style="font-size:20px;opacity:.6">›</span></a>`;
};

function jobsPill(th) {
  const j = m.jobs; if (!j.length) return '';
  const run = j.filter((x) => ACTIVE.includes(x.status)).length, ready = j.filter((x) => x.status === 'needs_review').length;
  if (!run && !ready) return '';
  const pct = Math.round(j.reduce((a, x) => a + (ACTIVE.includes(x.status) ? x.progress ?? 0 : 100), 0) / j.length);
  return `<a class="pill ${th === 'ios' ? 'glass2' : ''}" href="#/opp"><span class="ring" style="background:${conic([{ value: pct, color: '#FF8A4C' }], 100, 0, th === 'ios' ? 'rgba(255,255,255,.15)' : c3('#31281F'))}"></span><span class="m-grow">${run ? `Gemini leser i bakgrunnen · ${j.length - run} av ${j.length} ferdig` : `${ready} kvitteringer klare til bekreftelse`}</span><span style="opacity:.6">›</span></a>`;
}

function andCards(s) {
  const inn = s.innMonthly?.length ? s.innMonthly.slice(-7) : [s.inn];
  const mx = Math.max(1, ...inn);
  const prev = inn.length > 1 ? inn[inn.length - 2] : null, up = prev === null || s.inn >= prev;
  const pct = s.yearGoal ? Math.min(100, (s.savedYear / s.yearGoal) * 100) : 0;
  return `<div class="tiles"><div class="tile"><span class="m-row" style="justify-content:space-between">Inn i ${monthName(s.month)}<em class="badge">${up ? '↑' : '↓'}</em></span><b>${hide(n0(s.inn))}</b>
      <span class="minibars">${inn.map((v, i) => `<i style="height:${Math.max(8, (v / mx) * 100)}%;${i === inn.length - 1 ? 'background:#9FE3C6' : ''}"></i>`).join('')}</span></div>
    <div class="tile"><span>Spart i år</span><span class="m-row" style="gap:12px"><span class="cring" style="background:${conic([{ value: pct, color: c3('#FFB68A') }], 100, 0, c3('#4A3C33'))}"><i>${Math.round(pct)}%</i></span><span style="display:flex;flex-direction:column"><b style="font-size:18px">${hide(n0(s.savedYear))}</b><small>av ${n0(s.yearGoal)}</small></span></span>
      <small>${s.yearGoal ? `${n0(Math.max(0, s.yearGoal - s.savedYear))} kr igjen` : 'Sett et årsmål på desktop'}</small></div></div>`;
}

export const meName = () => m.me?.name || S.boot?.settings?.name || 'Meg';
export const avatarUrl = () => m.me?.avatarUrl || null;
export const avInner = () => (avatarUrl() ? `<img src="${esc(avatarUrl())}" alt="">` : esc(ini(meName())));
export const avatar = (cls = '') => `<button class="m-av${avatarUrl() ? ' img' : ''}${cls ? ' ' + cls : ''}" data-mact="menu" aria-label="Profil og meny" aria-haspopup="dialog">${avInner()}</button>`;

/** iOS: rund glassknapp med bare ‹. Android: tonal knapp med ←. */
export function backBtn(th, href, label = 'Tilbake', act = '') {
  const a = act ? `data-mact="${act}"` : '';
  return th === 'ios'
    ? `<a class="gback" href="${href}" ${a} aria-label="${esc(label)}">${icon('chev', 20, 'currentColor', 2.6)}</a>`
    : `<a class="back" href="${href}" ${a} aria-label="${esc(label)}">←</a>`;
}

function home(th) {
  const s = S.summary;
  return `<div class="m-row" style="justify-content:space-between;align-items:flex-end;padding:6px 4px 0"><div><div class="hello">${greet()}, ${esc(meName())}</div><div class="title">${cap(monthName(S.summary?.month ?? today().slice(0, 7)))}</div></div>${avatar()}</div>
    ${hero(th)}
    ${jobsPill(th)}
    ${th === 'and' && s ? andCards(s) : ''}
    ${reviewCta(th)}
    <div class="sec">Siste</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${(s?.recent ?? []).slice(0, 6).map((t) => txItem(t, th, m.sel === t.id)).join('') || '<div class="m-empty">Ingen transaksjoner ennå.</div>'}</div>`;
}

function list(th) {
  const items = S.tx?.items ?? null;
  const chips = [['', 'Alle'], ['ut', 'Utgifter'], ['inn', 'Inntekter']].map(([k, n]) => `<button class="chip" data-filter="${k}" aria-pressed="${m.filter === k}">${n}</button>`).join('');
  const add = th === 'ios' ? `<button class="gbtn" data-mact="newtx" aria-label="Ny transaksjon">${icon('plus', 22, 'currentColor', 2.4)}</button>` : '<button class="tonal" data-mact="newtx">+ Ny</button>';
  return `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0"><div class="title">Transaksjoner</div><span class="m-row" style="gap:8px">${add}${avatar()}</span></div>
    <form class="search ${th === 'ios' ? 'glass2' : ''}" data-msearch role="search"><span style="opacity:.7">${icon('search', 18)}</span><input class="m-input" id="m-txq" name="q" value="${esc(u.q)}" placeholder="Søk i transaksjoner" aria-label="Søk" enterkeyhint="search" type="search"></form>
    <div style="display:flex;gap:8px;overflow-x:auto">${chips}</div>
    ${items === null ? '<div class="m-spin"></div>' : groups(items, th) || '<div class="m-empty">Ingen treff.</div>'}`;
}

function budCard(b, th, s) {
  const o = b.used > b.budget, on = m.budSel === b.categoryId, left = b.budget - b.used, days = Math.max(1, s.daysLeft);
  const trend = b.prevUsed ? Math.round(((b.used - b.prevUsed) / b.prevUsed) * 100) : null;
  const chips = [b.count != null ? `${b.count} kjøp` : '', b.topMerchant ? `Mest: ${esc(b.topMerchant)}` : '', trend !== null ? `${trend > 0 ? '↑' : '↓'} ${Math.abs(trend)} % mot forrige mnd` : ''].filter(Boolean);
  const hi = th === 'and' ? c3('#FFB68A') : '#FFB08A';
  return `<button class="${th === 'ios' ? 'glass2' : 'item'} bud${on ? ' on' : ''}" data-bud="${b.categoryId}">
    <span class="m-row" style="justify-content:space-between;width:100%"><b style="font-weight:600">${esc(b.category)}</b><span class="m-mono" style="font-size:14px;color:${o ? hi : th === 'and' ? c3('#D7C2B8') : 'rgba(255,255,255,.7)'}">${n0(b.used)} / ${n0(b.budget)}</span></span>
    <span class="m-bar" style="width:100%;height:8px;background:${th === 'ios' ? 'rgba(255,255,255,.14)' : c3('#31281F')}"><i style="width:${Math.min(100, (b.used / b.budget) * 100)}%;background:${o ? '#FF7A3D' : b.color}"></i></span>
    <span class="m-row" style="justify-content:space-between;width:100%;font-size:13px"><span style="color:${o ? hi : 'inherit'};opacity:${o ? 1 : 0.8}">${o ? `Over med ${n0(-left)} kr` : `${n0(left)} kr igjen · ${n0(left / days)} kr/dag`}</span><span style="opacity:.65">${Math.round((b.used / b.budget) * 100)} % brukt</span></span>
    ${chips.length ? `<span class="bchips">${chips.map((c) => `<em>${c}</em>`).join('')}</span>` : ''}</button>`;
}

function budget(th) {
  const s = S.summary;
  if (!s) return '<div class="m-spin"></div>';
  const rows = s.budgets.filter((b) => b.budget).sort((a, b) => b.used / b.budget - a.used / a.budget);
  return `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0"><div class="title">Budsjett</div>${avatar()}</div>
    <div class="bsum ${th === 'ios' ? 'glass' : ''}"><div><span>Budsjett</span><b>${n0(s.budgetTotal)}</b></div><div><span>Brukt</span><b>${n0(s.budgetUsed)}</b></div><div><span>Dager igjen</span><b>${s.daysLeft}</b></div></div>
    ${rows.map((b) => budCard(b, th, s)).join('') || '<div class="m-empty">Ingen budsjett satt. Sett opp på desktop under Budsjett.</div>'}`;
}

/* ---------- Analyser på nytt med Gemini (prompt 12) ---------- */
// Serveren sier fra med canReanalyze; eldre servere: vis knappen ved feil eller lav sikkerhet.
const canRe = (R, high) => (R.canReanalyze ?? (!!R.error || R.status === 'error' || !high)) && !['booked', 'pending', 'processing'].includes(R.status);
const reBtn = (th, R, sub = R.reason) => `<button class="rean ${th === 'ios' ? 'glass2' : ''}" data-reanalyze="${esc(R.id)}"><span>✦</span><span class="m-grow">Analyser på nytt med Gemini${sub ? `<small>${esc(sub)}</small>` : ''}</span><span style="opacity:.6">›</span></button>`;
// «Les med lokal OCR» (Tesseract på serveren, uten AI). Vises på kvitteringer serveren sier kan leses (canOcr).
const ocrBtn = (th, R, sub = 'Uten AI · leses på serveren med Tesseract') => (R.canOcr ? `<button class="rean ${th === 'ios' ? 'glass2' : ''}" data-reanalyze="${esc(R.id)}" data-engine="tesseract"><span>⌗</span><span class="m-grow">Les med lokal OCR${sub ? `<small>${esc(sub)}</small>` : ''}</span><span style="opacity:.6">›</span></button>` : '');
// Dialogen (side om side, «Behold») ligger i reanalyze.js, som også brukes på desktop.
async function reanalyze(id, engine = 'gemini') {
  try {
    const mod = await import('./reanalyze.js');
    await mod.openReanalyze(id, { engine, onDone: async () => { await Promise.all([loadReceipts().catch(() => {}), loadJobs().catch(() => {})]); draw(); } });
  } catch (err) { flash(err?.message && !/import|module|fetch/i.test(err.message) ? err.message : 'Ny analyse er ikke tilgjengelig på denne serveren ennå.'); }
}

/* ---------- Venter på opplasting (prompt 18) ---------- */
// Filene ligger i IndexedDB (mobile-upq.js) og lastes opp av seg selv når nettet er tilbake.
const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);
export function upqList(th, compact = false) {
  const q = m.offline;
  if (!q.length) return '';
  const why = (x) => (x.legacy ? 'Lagt i køen før kontoene ble skilt · lastes bare opp når du trykker' : x.error ? `Feilet: ${x.error}` : x.reason === 'wifi' ? 'Venter på Wi-Fi' : 'Venter på nett');
  if (compact) return `<a class="upq-banner ${th === 'ios' ? 'glass2' : ''}" href="#/opp"><span class="upq-dot"></span><span class="m-grow"><b>${q.length} kvittering${q.length > 1 ? 'er' : ''} venter på opplasting</b><span>${navigator.onLine ? 'Trykk for å se køen' : 'Lastes opp når du er på nett igjen'}</span></span><span style="opacity:.6">›</span></a>`;
  return `<div class="sec">Venter på opplasting · ${q.length}</div><div class="list upq ${th === 'ios' ? 'glass2' : ''}">${q.map((x) => `<div class="item upq-it"><span class="m-ini upq-ic">↑</span><span class="m-grow" style="min-width:0"><span class="m-ell" style="font-weight:500">${esc(x.name)}</span><span class="m-ell s">${esc(why(x))} · ${kb(x.size)}${x.tries ? ` · ${x.tries} forsøk` : ''}</span></span><button class="upq-b" data-mact="upq-retry" data-id="${esc(x.id)}">Prøv igjen</button><button class="upq-b x" data-mact="upq-del" data-id="${esc(x.id)}" aria-label="Fjern fra køen">Fjern</button></div>`).join('')}</div>
    ${q.length > 1 ? `<button class="sec-b upq-all" data-mact="upq-all">Last opp alle nå</button>` : ''}`;
}
export async function refreshQueue() { try { m.offline = await UPQ.queued(); } catch { /* beholder forrige liste */ } }
async function sendOne(f) { const r = await uploadReceipt(f, null, { original: pref('origImg') }); return r; }

/* ---------- Last opp (kø i bakgrunnen) ---------- */

function uploadScreen(th) {
  const j = m.jobs;
  const st = (x) => (x.status === 'needs_review' ? ['Klar · trykk for å bekrefte', '#9FE3C6', 100] : x.status === 'booked' ? ['Bokført', '#9FE3C6', 100] : x.status === 'error' ? ['Feil – åpne for å fylle ut', '#FF8A6B', 100] : x.status === 'processing' ? [`Gemini leser … ${x.progress ?? 50} %`, th === 'and' ? c3('#FFB68A') : '#FF8A4C', x.progress ?? 50] : ['I kø', 'currentColor', 0]);
  return `<div class="m-row">${backBtn(th, '#/kv', 'Tilbake til Kvitteringer')}<b class="ptitle">Last opp</b></div>
    <label class="drop ${th === 'ios' ? 'glass' : ''}"><span class="n">${icon('up', 22)}</span><b>Velg kvitteringer</b><span>Bilder eller PDF – flere om gangen. Gemini leser dem i bakgrunnen. Du kan bruke appen mens du venter.</span><input class="m-file" type="file" accept="image/*,application/pdf" multiple data-mupload></label>
    <button class="cta ${th === 'ios' ? 'glass2' : ''}" data-mact="cam"><span class="n">${icon('cam', 20)}</span><span class="m-grow"><b style="display:block;font-weight:600">Ta bilde</b><span style="font-size:13px;opacity:.75">Bakkamera</span></span></button>
    ${upqList(th)}
    ${m.uploading ? `<div class="m-empty">Laster opp ${m.uploading} fil${m.uploading > 1 ? 'er' : ''} …</div>` : ''}
    ${j.length ? `<div class="sec">Kø</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${j.map((x) => { const [txt, c, p] = st(x); return `<button class="item job" data-job="${esc(x.id)}"><span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(x.merchant || x.name || 'Kvittering')}</span><span class="m-ell s" style="color:${c}">${txt}</span><span class="m-bar" style="height:4px;margin-top:6px;background:${th === 'ios' ? 'rgba(255,255,255,.12)' : c3('#31281F')}"><i style="width:${p}%;background:${c}"></i></span></span><span class="m-mono">${x.total != null ? n2(x.total) : ''}</span></button>`; }).join('')}</div>` : ''}
    ${j.filter((x) => x.canReanalyze ?? x.status === 'error').map((x) => reBtn(th, x, `${x.merchant || x.name || 'Kvittering'}${x.status === 'error' ? ' · mislyktes' : ' · usikker'}`)).join('')}`;
}

/* ---------- Kvitteringer: kø og bekreft ---------- */

function scanQueue(th) {
  const q = (S.receipts ?? []).filter((r) => ['pending', 'processing', 'needs_review'].includes(r.status));
  return `<div class="m-row">${backBtn(th, '#/kv', 'Tilbake til Kvitteringer')}<b class="ptitle">Skann</b></div>
    <button class="cta ${th === 'ios' ? 'glass' : ''}" data-scan><span class="n">${icon('scan', 20)}</span><span class="m-grow"><b style="display:block;font-weight:600">Ta bilde av kvittering</b><span style="font-size:13px;opacity:.75">Hold inne for Bilder eller Filer</span></span></button>
    ${q.length ? `<div class="sec">Til gjennomgang</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${q.map((r) => `<button class="item${m.rc === r.id ? ' on' : ''}" data-rc="${r.id}">${r.thumb ? `<span class="m-ini" style="border-radius:10px;background:#ECE8E0 center/cover;background-image:url('${r.thumb}')"></span>` : logo({ ...r, description: r.merchant ?? 'Kvittering' }, 40, 10)}<span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(r.merchant ?? 'Ny kvittering')}</span><span class="m-ell s">${r.status === 'needs_review' ? `${dd(r.date)} · ${esc(r.provider ?? 'manuell')}` : 'Leser …'}</span></span><span class="m-mono">${r.total != null ? n2(r.total) : ''}</span></button>`).join('')}</div>` : '<div class="m-empty">Ingen kvitteringer i køen.</div>'}`;
}

function confirmRc(th) {
  const all = S.receipts ?? [];
  const q = all.filter((r) => r.status === 'needs_review');
  const R = all.find((r) => r.id === m.rc);
  if (!R) return two() ? '<div class="m-empty">Velg en kvittering.</div>' : scanQueue(th);
  if (R.status === 'pending' || R.status === 'processing') return `${rcBar(th, 'Skann')}<div style="padding:60px 0;display:flex;flex-direction:column;gap:14px;text-align:center"><div class="m-spin"></div>Leser kvitteringen med ${S.boot.settings.provider === 'ollama' ? 'Ollama' : 'Gemini'} …</div>`;
  const ex = R.extraction ?? {}, st = S.boot.settings;
  const high = !R.error && (R.confidence ?? 0) >= st.minConf / 100 && !R.flag;
  const paper = R.file && R.mime?.startsWith('image/') ? `<div class="m-photo" style="background-image:url('${R.file}')" role="img" aria-label="Kvittering"></div>`
    : `<div class="m-receipt"><b style="text-align:center;font-size:14px">${esc((R.merchant ?? '').toUpperCase())}</b>${(ex.lines ?? []).map((l) => `<span class="ln"><span>${esc(l.description)}</span><span>${n2(l.amount)}</span></span>`).join('')}<span class="dash"></span><b class="ln"><span>TOTAL</span><span>${R.total != null ? n2(R.total) : '–'}</span></b></div>`;
  const catChips = cats('expense').map((c) => `<button class="chip" data-mcat="${c.id}" aria-pressed="${R.categoryId === c.id}">${esc(c.name)}</button>`).join('');
  const idx = q.findIndex((r) => r.id === R.id);
  const fields = th === 'ios'
    ? `<div class="list glass2"><label class="field"><span>Butikk</span><input data-mf="merchant" value="${esc(R.merchant ?? '')}"></label><label class="field"><span>Dato</span><input type="date" data-mf="date" value="${R.date ?? ''}"></label><label class="field"><span>Total</span><input class="m-mono" data-mf="total" inputmode="decimal" value="${R.total != null ? n2(R.total).replace(/\s/g, '') : ''}" style="color:#FFB08A"></label><label class="field"><span>Konto</span><select data-mf="accountId">${accs().map((a) => `<option value="${a.id}"${a.id === R.accountId ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>`
    : `<div class="fields"><label class="field">Butikk<input data-mf="merchant" value="${esc(R.merchant ?? '')}"></label><div class="two"><label class="field">Dato<input type="date" data-mf="date" value="${R.date ?? ''}"></label><label class="field">Total<input class="m-mono" data-mf="total" inputmode="decimal" value="${R.total != null ? n2(R.total).replace(/\s/g, '') : ''}"></label></div><label class="field">Konto<select data-mf="accountId">${accs().map((a) => `<option value="${a.id}"${a.id === R.accountId ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>`;
  return `${rcBar(th, 'Bekreft kvittering', idx > -1 ? `${idx + 1} av ${q.length}` : '')}
    ${th === 'ios' ? '<div class="title" style="font-size:28px">Bekreft kvittering</div>' : ''}
    ${paper}
    <div class="conf"><span>${R.provider && R.provider !== 'Manuell' ? `Lest av ${esc(R.provider)}${R.seconds ? ` · ${n2(R.seconds).replace(/0$/, '')} s` : ''}` : 'Manuell utfylling'}</span><span style="color:${high ? '#9FE3C6' : '#FFB08A'};font-weight:600">● ${R.error ? 'Fyll ut' : high ? 'Høy sikkerhet' : 'Sjekk beløp'}</span></div>
    ${R.error ? `<div style="font-size:13px;color:#FFB08A;padding:0 6px">${esc(R.error)}</div>` : ''}
    ${canRe(R, high) ? reBtn(th, R) : ''}${!['booked', 'pending', 'processing'].includes(R.status) ? ocrBtn(th, R) : ''}
    ${fields}
    <div style="display:flex;flex-wrap:wrap;gap:8px">${catChips}</div>
    <div class="m-match ${R.match ? '' : 'none'}"><b style="font-weight:600;${R.match ? 'color:#9FE3C6' : ''}">${R.match ? 'Matchet mot kortkjøp' : 'Ingen bankmatch'}</b><br><span style="opacity:.8">${R.match ? `${dd(R.match.date)} · ${sgn(R.match.amount)} kr · ${esc(R.match.account)}` : 'Bokføres som ny transaksjon'}</span></div>
    <div class="btn2"><button class="sec-b" data-mact="reject">Avvis</button><button class="pri-b" data-mact="book">Bokfør</button></div>`;
}

function rcBar(th, title, right = '') {
  if (two()) return right ? `<div class="m-row" style="justify-content:flex-end;opacity:.7;font-size:14px">${right}</div>` : '';
  return th === 'ios'
    ? `<div class="m-row" style="justify-content:space-between">${backBtn(th, '#/kv', 'Tilbake', 'back')}<span style="opacity:.7;font-size:14px">${right}</span></div>`
    : `<div class="m-row">${backBtn(th, '#/kv', 'Tilbake', 'back')}<b class="ptitle">${esc(title)}</b><span style="font-size:14px;color:${c3('#D7C2B8')}">${right}</span></div>`;
}

/* ---------- Detaljpanel (to paneler) ---------- */

export const selTx = () => {
  const pool = [...(S.tx?.items ?? []), ...(S.summary?.recent ?? []), ...Object.values(m.txCache)];
  return pool.find((x) => x.id === m.sel) ?? (two() && TWO.includes(m.screen) && m.screen !== 'sok' ? pool[0] : null);
};

function detail(th) {
  if (m.edit) return editForm(th);
  if (m.screen === 'skann') { m.rc ??= (S.receipts ?? []).find((r) => r.status === 'needs_review')?.id ?? null; return confirmRc(th); }
  if (m.screen === 'budsjett') {
    const b = S.summary?.budgets.find((x) => x.categoryId === m.budSel) ?? S.summary?.budgets.find((x) => x.budget);
    if (!b) return '<div class="m-empty">Velg en kategori.</div>';
    const o = b.used > b.budget, items = (S.tx?.items ?? []).filter((t) => t.categoryId === b.categoryId && t.date >= S.summary.from && t.date < S.summary.to);
    return `<div class="title" style="font-size:28px">${esc(b.category)}</div>
      <div class="${th === 'ios' ? 'glass hero' : 'hero alt'}"><div class="lbl">Brukt av ${n0(b.budget)} kr</div><div class="amt">${n0(b.used)}<small> kr</small></div>
        <div class="m-bar" style="background:rgba(255,255,255,.12)"><i style="width:${Math.min(100, (b.used / b.budget) * 100)}%;background:${o ? '#FF7A3D' : b.color}"></i></div>
        <div style="font-size:14px;opacity:.85">${o ? `Over budsjett med ${n0(b.used - b.budget)} kr.` : `${n0(b.budget - b.used)} kr igjen denne måneden.`}</div></div>
      ${items.length ? `<div class="sec">Transaksjoner</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${items.map((t) => txItem(t, th)).join('')}</div>` : ''}`;
  }
  if (m.screen === 'opp') return confirmRc(th);
  return txDetail(th, selTx());
}

/* ---------- Meny bak profilbildet ---------- */

function menuSheet(th) {
  if (!m.menu) return '';
  const scr = m.screen, who = m.me?.username ? `@${esc(m.me.username)}${m.me.role ? ' · ' + esc(m.me.role) : ''}` : esc(m.me?.serverName ?? 'Homelab');
  const row = (href, ic, n, s, on, act = 'menu') => `<a class="opt-row${on ? ' on' : ''}" href="${href}" data-mact="${act}"><span class="set-ic">${icon(ic, 18)}</span><span class="m-grow"><b style="font-weight:500">${n}</b>${s ? `<br><span style="font-size:13px;opacity:.65">${s}</span>` : ''}</span>${on ? '<span style="color:var(--m-acc)">✓</span>' : '<span style="opacity:.6">›</span>'}</a>`;
  const others = MODS.filter(([k]) => k === 'mat' || (k === 'dom' && domOk()));
  return `<div class="sheet-bg" data-mact="menu"></div><div class="sheet${two() ? ' left' : ''} ${th === 'ios' ? 'glass' : ''}" role="dialog" aria-label="Meny">
    <div class="m-row" style="gap:12px"><span class="m-av${avatarUrl() ? ' img' : ''}">${avInner()}</span><div class="m-grow"><b>${esc(meName())}</b><div style="font-size:13px;opacity:.65">${who}</div></div><button class="mini" data-mact="menu" aria-label="Lukk">${icon('close', 18)}</button></div>
    ${(() => {
      // Startsiden står øverst; resten ligger under «Andre OS».
      const hl = row('#/hl', 'hlhome', 'Homelab', 'Dashbord, søk og snarveier', scr === 'hl'), fin = row(`#/${startFin() ? startScr() : 'hjem'}`, 'wallet', 'Finans', 'Hjem, liste, budsjett og mer', FIN.includes(scr));
      const rest = others.map(([k, n, s2, ic]) => row('#/' + k, ic, n, s2, scr === k)).join('');
      return `<div class="list ${th === 'ios' ? 'glass2' : ''}">${startFin() ? fin : hl}</div><div class="sec">Andre OS</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${startFin() ? hl : fin}${rest}</div>`;
    })()}
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${row('#/hl', 'edit', 'Rediger forsiden', '', false, 'edithome')}${row('#/nyheter', 'hist', 'Nyhetsleser', 'Siste nytt fra kildene dine', scr === 'nyheter')}${row('#/set', 'gear', 'Innstillinger', '', scr === 'set')}<button class="opt-row" data-mact="logout"><span class="set-ic" style="color:#FF8A6B">${icon('key', 18)}</span><span class="m-grow" style="color:#FF8A6B">Lås</span></button></div></div>`;
}

/* Arket som åpnes når skanneknappen holdes inne (eller trykkes, hvis det er valgt i Innstillinger). */
function scanSheet(th) {
  if (!m.sheet) return '';
  return `<div class="sheet-bg" data-mact="sheet"></div><div class="actsheet ${th === 'ios' ? 'glass' : ''}" role="dialog" aria-label="Legg til kvittering">
    <div class="list ${th === 'ios' ? 'glass2' : ''}">
      <button class="opt-row" data-mact="cam"><span class="set-ic">${icon('cam', 18)}</span><span class="m-grow">Ta bilde</span></button>
      <label class="opt-row"><span class="set-ic">${icon('img', 18)}</span><span class="m-grow">Velg fra Bilder</span><input class="m-file" type="file" accept="image/*" multiple data-mupload></label>
      <label class="opt-row"><span class="set-ic">${icon('file', 18)}</span><span class="m-grow">Velg fil<br><span style="font-size:12px;opacity:.6">PDF, JPG, HEIC</span></span><input class="m-file" type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif" multiple data-mupload></label>
    </div>
    <button class="opt-row cancel ${th === 'ios' ? 'glass2' : ''}" data-mact="sheet">Avbryt</button></div>`;
}

/* ---------- Navigasjon ---------- */

const group = (scr) => (scr === 'dom' ? 'dom' : scr === 'mat' ? 'mat' : HLG.includes(scr) ? 'hl' : 'fin');

function navModel() {
  const scr = m.screen, g = group(scr);
  // Hjem-knapp i linjen bare med «Knapp i linjen», og ikke når man allerede er på startsiden.
  const home = backStyle() === 'bar' && scr !== startScr() && !(g === 'hl' && !startFin());
  if (g === 'mat') return { tabs: [], cur: '', home: false, scan: false, none: true };
  if (g === 'dom') return { tabs: domNav(), cur: domNav.cur(), home, scan: false, gear: true };
  if (g === 'hl') return { tabs: hlTabs(), cur: scr, home, scan: false };
  return { tabs: finTabs(), cur: finCur(scr), home, scan: !['skann', 'opp'].includes(scr) && !m.edit && !(m.detail && !two()) && !m.pdet };
}

const homeAria = () => `Til ${homeLbl()}`;
// iOS 26: kapsel med glassmarkør som kan dras mellom fanene. Til høyre i samme rad: rund oransje glassknapp for Skann
// (Finans) eller tannhjul (Domener). Med «Knapp i linjen» står en rund husknapp til venstre.
function iosNav(n) {
  if (n.none) return '';
  const idx = n.tabs.findIndex(([k]) => k === n.cur);
  if (idx >= 0) m.tabIdx = idx;
  const side = n.scan ? `<button class="scanbtn lg" data-scan aria-label="Skann kvittering (hold inne for Bilder og Filer)">${icon('scan', 26, 'currentColor', 2.2)}</button>`
    : n.gear ? `<a class="scanbtn lg gear" href="#/set/dom" aria-label="Domeneinnstillinger">${icon('gear', 24, 'currentColor', 2)}</a>` : '';
  return `<div class="tabbar${m.min ? ' min' : ''}${n.home ? ' hashome' : ''}${side ? ' hasside' : ''}" data-key="${n.tabs.map(([k]) => k).join(',')}${n.home ? '+h' : ''}">
    ${n.home ? `<a class="hbtn lg" href="#/${startScr()}" aria-label="${homeAria()}">${icon(startFin() ? 'fin' : 'hlhome', 24)}</a>` : ''}
    <nav class="tabs lg" aria-label="Faner" data-tabdrag style="--n:${n.tabs.length};--i:${m.tabIdx};--on:${idx < 0 ? 0 : 1}">
    <span class="mark" aria-hidden="true"></span>${n.tabs.map(([k, nm, ic], i) => `<a href="#/${k}" data-tab="${k}" draggable="false" ${i === idx ? 'aria-current="page"' : ''}>${icon(ic, 23)}<span>${esc(nm)}</span></a>`).join('')}</nav>
    ${side}</div><div class="edge" aria-hidden="true"></div>`;
}
function andNav(n) {
  if (n.none) return '';
  return `${n.scan ? `<button class="fab" data-scan aria-label="Skann kvittering (hold inne for Bilder og Filer)">${icon('scan', 24, 'currentColor', 2.2)}<span>Skann</span></button>` : ''}
    <nav class="navbar" aria-label="Faner">${n.home ? `<a class="hl" href="#/${startScr()}" aria-label="${homeAria()}"><span>${icon(startFin() ? 'fin' : 'hlhome', 20)}</span>${homeLbl()}</a><i class="nsep" aria-hidden="true"></i>` : ''}${n.tabs.map(([k, nm, ic]) => `<a href="#/${k}" data-tab="${k}" ${n.cur === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${esc(nm)}</a>`).join('')}</nav>`;
}
function rail(n) {
  return `<nav class="rail" aria-label="Faner">${n.home ? `<a class="r-home" href="#/${startScr()}" aria-label="${homeAria()}">${icon(startFin() ? 'fin' : 'hlhome', 22)}</a>` : ''}
    ${n.scan ? `<button class="r-scan" data-scan aria-label="Skann kvittering">${icon('scan', 24, 'currentColor', 2.2)}</button>` : ''}
    ${n.tabs.map(([k, nm, ic]) => `<a href="#/${k}" data-tab="${k}" ${n.cur === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${esc(nm)}</a>`).join('')}
    <span style="flex:1"></span><button class="m-av r-av${avatarUrl() ? ' img' : ''}" data-mact="menu" aria-label="Meny: Homelab, andre OS og innstillinger" aria-haspopup="dialog">${avInner()}</button></nav>`;
}

/* ---------- Tegning ---------- */

export function draw() {
  const pp = paper(), th = theme(), wide = two() && !pp, scr = m.screen;
  // Nye sider åpner øverst; går man tilbake, gjenopprettes posisjonen (prompt 23). Den forrige siden flyttes ut av #app
  // og ligger ferdig tegnet bak, så sveip tilbake viser den.
  const vk = [scr, m.sub, m.detail ? m.sel : '', m.edit ? 'e' : '', m.rc ?? '', m.pdet ?? '', BO.tab, m.vk ?? ''].join('|');
  const vkChanged = P23.leave(vk);
  const fad = pp && scr === 'finn' && /^ad\/\d+/.test(m.sub ?? '');
  m.light = pp ? applyPaper(paperDark()) : applyM3(th === 'and', pref('m3Seed'), pref('m3Mode'), () => draw(), pref('pageColors') !== 'per');
  const fin = FIN.includes(scr), twoPane = wide && TWO.includes(scr);
  const confirmView = scr === 'skann' && m.rc && !wide;
  const scrs = { hjem: home, liste: list, budsjett: budget, opp: uploadScreen };
  const plain = !m.detail && !m.edit;
  const ppMain = !pp ? null : scr === 'hl' ? paperHome() : m.detail && !m.edit && m.sel != null && ['liste', 'sok', 'hjem'].includes(scr) ? paperTx(m.sel)
    : scr === 'hjem' && plain ? paperFin() : scr === 'mer' ? paperMer()
    : scr === 'bd' ? P24.bdView() : scr === 'kal' ? KAL.kalView() : scr === 'fmer' ? finMerGrid() : scr === 'kv' && plain ? P23.kvView() : fad ? P23.finnAdView() : scr === 'sok' && plain ? paperSearch() : scr === 'liste' && plain ? paperList() : scr === 'finn' && !m.sub ? paperFinn() : scr === 'spor' ? paperTrk() : scr === 'dir' ? bolView() : scr === 'avg' ? P24.ruterView() : scr === 'fam' ? P22.famView22() : null;
  const main = scr === 'chat' ? CHAT.chatView() : scr === 'vaer' ? wxView() : scr === 'nyheter' ? newsView() : scr === 'huske' ? (pp ? P22.huske22() : '<div class="m-row" style="padding:6px 4px 0"><div class="title">Huskeliste</div></div>' + huskeView()) : !pp && scr === 'avg' ? avgView() : !pp && scr === 'fam' ? famView()
    : scr === 'kal' && !pp ? KAL.kalView() : scr === 'media' ? (pp ? '' : '<div class="m-row" style="padding:6px 4px 0"><div class="title">Media</div></div>') + mediaView()
    : ppMain ?? (scr === 'set' ? settingsView(th, m.sub)
    : scr === 'hl' ? hlView(th)
    : scr === 'spor' ? trkView(th)
    : scr === 'mat' ? matView(th)
    : m.edit && !twoPane ? editForm(th)
    : m.detail && !twoPane && m.sel && FIN.includes(scr) ? txDetail(th, selTx())
    : PAGES.includes(scr) ? pageView(scr, th)
    : scr === 'finn' ? finnView(th, m.sub)
    : !fin || FINMODS.includes(scr) ? modView(scr, th, m.sub)
    : scrs[scr] ? scrs[scr](th) : confirmView ? confirmRc(th) : scanQueue(th));
  // Prompt 24: Ruter-visningen (Avganger) er et fullskjerm-overlegg uten fanelinje og skanneknapp, med eget toppbilde.
  const rv = pp && scr === 'avg', fsx = scr === 'chat' || scr === 'kal'; // Prompt 27: Chat og Kalender i fullskjerm
  const n = navModel(), dom = scr === 'dom', bt = !pp && backTop(scr) && scr !== 'vaer', hero = pp && scr !== 'nyheter' && scr !== 'vaer' && !fad && !rv && !fsx;
  const nav = scr === 'nyheter' || scr === 'vaer' || fad || rv || fsx ? '' : pp ? P25.nav25(scr === 'huske' ? P22.huskeNav(paperNav(scr)) + P22.huskeDock() : paperNav(scr), scr) : th === 'ios' ? iosNav(n) : andNav(n);
  // Bevar fokus og markør i et felt når skjermen tegnes på nytt (f.eks. søk mens forslag kommer inn).
  const ae = document.activeElement, keep = ae?.id && root().contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  root().innerHTML = `<div class="m ${th}${fad ? ' p23-fad' : ''}${rv ? ' p24-rvm' : ''}${fsx ? ' p27-fs' : ''}${pp ? ` papir ${m.light ? 'pl' : 'pd'}${hero ? ' ph' : ''}${fabStyle() === 'float' ? ' flyt' : ''}` : ''}${scr === 'nyheter' ? ' news' : ''}${scr === 'vaer' ? ' vaer' : ''}${wide ? ' two' : ''}${twoPane ? '' : ' full'}${dom ? ' dom' : ''}${scr === 'mat' ? ` matp ${matDark() ? 'mdark' : 'mlight'}` : ''}${th === 'and' && pref('pageColors') !== 'per' ? ' same' : ''}${scr === 'hl' ? ' hlp' : ''}${bt ? ' backtop' : ''}${n.none && !pp ? ' nobar' : ''}${m.light ? ' light' : ''}${th === 'ios' && !iosBg() ? ' nobg' : ''}${m.blur ? ' blurred' : ''}">${th === 'ios' && iosBg() ? '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' : ''}
    ${pp ? '' : rail(n)}${hero ? paperHero(scr) : ''}<div class="m-scroll">${bt ? topRow(th) : ''}${main}</div><div class="m-detail">${twoPane ? detail(th) : ''}</div>${nav}
    ${menuSheet(th)}${scanSheet(th)}${pp ? paperScanSheet() + paperFinnSheet() + paperTrkSheet() + newShipSheet() + tabSheet() + P26.sheets26() + P27.sheets27() : ''}${avgSheet()}${pp ? "" : famSheet()}${p17Sheets()}${p21Sheets(HK)}${P22.p22Sheets()}${pp ? P24.sheets24() : ''}${origOverlay(th)}${m.toast ? `<div class="m-toast" role="status">${esc(m.toast)}</div>` : ''}
    <input class="m-file" id="m-capture" type="file" accept="image/*" capture="environment" data-mupload data-confirm></div>`;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch {} } }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', pp ? (m.light ? '#f3efe6' : '#14130f') : th === 'ios' ? '#07070A' : getComputedStyle(root().firstElementChild).backgroundColor || '#19120E');
  hlAfterDraw(); pageAfterDraw(); if (scr === 'dom') modAfterDraw(th); if (scr === 'fam') { if (pp) P22.famAfterDraw22(); else famAfterDraw(); } wxAfterDraw(); P22.afterDraw(scr, pp);
  if (fad) P23.finnAdAfterDraw();
  P23.arrive(vk, vkChanged);
  P25.afterDraw();
  P27.afterDraw27();
  // Glassmarkøren glir med fjæring mellom fanene. Fanelinja tegnes på nytt ved hver oppdatering, så animasjonen
  // (Web Animations) gjenopptas med medgått tid hvis en ny tegning kommer midt i den.
  const mk = root().querySelector('.tabs .mark');
  if (mk && !m.min) {
    const x = mk.offsetLeft, now = performance.now();
    if (m.markX != null && x !== m.markX) m.markAnim = { from: m.markX, to: x, t0: now };
    const an = m.markAnim;
    if (an && an.to === x && now - an.t0 < 500) mk.animate([{ left: `${an.from}px` }, { left: `${x}px` }], { duration: 500, easing: 'cubic-bezier(.3,1.35,.5,1)' }).currentTime = now - an.t0;
    else m.markAnim = null;
    m.markX = x;
  }
}

let toastT;
// Fullførte handlinger gir en kort «suksess»-vibrasjon; feil kommer via safe() eller haptic('err') der de oppstår.
const OK_RE = /✓|lagt til|lagret|slettet|bokført|importert|synket|opprettet|oppdatert|er aktiv|sagt opp|arkivert|kopiert/i;
export const flash = (t, kind) => {
  // Innloggingen tas av Papir-innloggingen (core.js), ikke av en toast midt i innholdet.
  if (t === 'Ikke innlogget') return;
  m.toast = t; if (kind || OK_RE.test(t)) haptic(kind || 'ok'); draw(); clearTimeout(toastT); toastT = setTimeout(() => { m.toast = ''; draw(); }, 1800); };

export async function loadMe() {
  // Kontoinfo: /finans/api/me, ellers Homelabs /api/me (samme sesjon). avatarUrl og serverName kommer fra Homelab.
  const [a, b] = await Promise.all([api('/me').catch(() => null), fetch('/api/me').then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  m.me = { name: S.boot?.settings?.name, ...(b ?? {}), ...(a ?? {}), avatarUrl: a?.avatarUrl ?? b?.avatarUrl ?? null, serverName: a?.serverName ?? b?.serverName ?? null };
}

async function load() {
  try {
    const jobs = [], scr = m.screen;
    if (FIN.includes(scr)) {
      if (!FINMODS.includes(scr)) jobs.push(loadSummary());
      if (scr === 'liste' || (two() && (scr === 'hjem' || scr === 'budsjett'))) jobs.push(loadTx());
      if (scr === 'skann' || scr === 'kv' || (two() && scr === 'opp')) jobs.push(loadReceipts());
      jobs.push(loadJobs());
    }
    if (PAGES.includes(scr)) jobs.push(pageLoad(scr, m.sub));
    else if (scr === 'set') jobs.push(settingsLoad(m.sub), ...(String(m.sub).startsWith('integ') ? [P23.integLoad().catch(() => {}), P24.integLoad24(true).catch(() => {}), P24.bdLoad().catch(() => {})] : m.sub === 'kal' ? [P24.integLoad24(true).catch(() => {}), P24.bdLoad(true).catch(() => {})] : !m.sub ? [P24.integLoad24().catch(() => {})] : []));
    else if (scr === 'hl') jobs.push(hlLoad());
    else if (scr === 'spor') jobs.push(trkLoad().then(() => trkWatch()));
    else if (scr === 'mat') jobs.push(matLoad());
    else if (scr === 'media') jobs.push(mediaLoad());
    else if (scr === 'nyheter') jobs.push(newsLoad());
    else if (scr === 'vaer') jobs.push(wxLoad());
    else if (scr === 'avg') jobs.push(avgLoad());
    else if (scr === 'fam') jobs.push(famLoad());
    else if (scr === 'huske') jobs.push(tasksLoad(true));
    else if (scr === 'bd') jobs.push(P24.bdLoad(true));
    else if (scr === 'kal') jobs.push(KAL.kalLoad());
    else if (scr === 'chat') jobs.push(CHAT.chatLoad());
    else if (scr === 'dir' && paper()) { P24.noteBol(m.sub); jobs.push(bolLoad(m.sub)); }
    else if (scr === 'finn' && paper() && /^ad\/\d+/.test(m.sub ?? '')) jobs.push(P23.finnAdLoad(+m.sub.split('/')[1]));
    else if (scr === 'finn') jobs.push(paper() && !m.sub ? paperFinnLoad() : finnLoad(m.sub));
    else if (scr === 'fmer') jobs.push(loadSummary().catch(() => {}), fmerLoad().catch(() => {}));
    else if ((!FIN.includes(scr) || FINMODS.includes(scr)) && !['media', 'nyheter', 'vaer'].includes(scr)) jobs.push(modLoad(scr, m.sub));
    if (paper()) {
      jobs.push(regLoad().catch(() => {}));
      jobs.push(photoLoad().then(() => draw()).catch(() => {}));
      if (scr === 'hl') jobs.push(matLoad().catch(() => {}), loadSummary().catch(() => {}), newsLoad().catch(() => {}), tasksLoad().catch(() => {}), posLoad().catch(() => {}), bolWidgetLoad().catch(() => {}), P24.bdLoad().catch(() => {}), KAL.kalLoad().catch(() => {}));
      if (scr === 'mer' || scr === 'hjem') jobs.push(loadSummary().catch(() => {}));
      if (scr === 'hjem') jobs.push(recentLoad().catch(() => {}), rcCount().catch(() => {}));
      if (m.detail && m.sel != null) jobs.push(txLoad(m.sel).catch(() => {}));
      if (!TRK_SEEN && scr !== 'spor') { TRK_SEEN = true; jobs.push(trkLoad().catch(() => {})); } // fjerde fane: pakker på vei
      if (scr === 'liste' && !S.summary) jobs.push(loadSummary().catch(() => {}));
    }
    if (!m.me) jobs.push(loadMe().catch(() => { m.me = { name: S.boot?.settings?.name }; }));
    await Promise.all(jobs);
  } catch (e) { flash(e.message); }
  draw();
  poll();
}
// Jobbkø fra serveren; eldre server uten /receipts/jobs faller tilbake til kvitteringslisten.
export async function loadJobs() {
  const before = new Map(m.jobs.map((j) => [j.id, j.status]));
  try { m.jobs = await api('/receipts/jobs'); }
  catch { try { await loadReceipts(); } catch {} m.jobs = (S.receipts ?? []).filter((r) => [...ACTIVE, 'needs_review'].includes(r.status)).map((r) => ({ id: r.id, name: r.merchant, merchant: r.merchant, total: r.total, status: r.status, progress: r.status === 'processing' ? 50 : 0 })); }
  // Lokalt varsel når en kvittering er ferdig lest (Web Push er ikke satt opp; dette virker mens appen er åpen).
  const done = m.jobs.filter((j) => j.status === 'needs_review' && ACTIVE.includes(before.get(j.id)));
  if (done.length && S.boot?.settings?.nRc && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification('Kvittering lest', { body: done.map((j) => j.merchant || j.name || 'Kvittering').join(', ') + ' · trykk for å bekrefte', icon: '/assets/finans/icons/icon-192.png' }); } catch {}
  }
}
let pollT, TRK_SEEN = false;
function poll() {
  clearTimeout(pollT);
  const busy = m.jobs.some((r) => ACTIVE.includes(r.status)) || (S.receipts ?? []).some((r) => ACTIVE.includes(r.status));
  if (busy) pollT = setTimeout(async () => { try { await loadJobs(); if (['skann', 'opp', 'kv'].includes(m.screen)) await loadReceipts(); } catch {} draw(); poll(); }, 2000);
}

export function route() {
  // Prompt 24: Google-innloggingen kommer tilbake til #/bd?ok=1&google=ok (eller ?error=…).
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?'), parts = path.split('/');
  if (qs) { history.replaceState(null, '', `#/${path}`); if (/google=ok/.test(qs)) setTimeout(() => flash('Koblet til Google Kalender ✓'), 300); else if (/google=error/.test(qs)) setTimeout(() => flash(`Google: ${decodeURIComponent((qs.match(/error=([^&]*)/) ?? [])[1] ?? 'innloggingen feilet')}`), 300); }
  const h = parts[0];
  // Desktop- og eldre lenker
  const map = { ov: 'hjem', tx: 'liste', bud: 'budsjett', inn: 'set', meg: 'set', homelab: 'hl', ai: 'sok', matplan: 'mat', domener: 'dom', aksjer: 'aks', abonnement: 'sub', mapper: 'dir', sporing: 'spor', trk: 'spor', news: 'nyheter', nyhetsleser: 'nyheter', rss: 'nyheter', bursdager: 'bd', bursdag: 'bd', birthdays: 'bd', ruter: 'avg', avganger: 'avg', kalender: 'kal', calendar: 'kal', timeplan: 'kal', ollama: 'chat' };
  const start = startScr();
  let next = map[h] ?? (ALL.includes(h) ? h : start);
  if (next === 'fmer' && !paper()) next = 'mer';
  if (!domOk() && (next === 'dom' || (next === 'set' && parts[1] === 'dom'))) { next = next === 'dom' ? 'hl' : 'set'; if (location.hash !== `#/${next}`) { history.replaceState(null, '', `#/${next}`); parts.length = 1; } }
  const sub = parts.slice(1).join('/');
  if (next !== m.screen || sub !== m.sub) {
    if (next !== m.screen) { edReset(); P26.leave26(); P27.leave27(next); if (m.screen === 'chat') CHAT.chatLeave(); if (next === 'chat') CHAT.chatEnter(m.screen); if (next === 'kal') m.kalFrom = m.screen; if (next === 'vaer') WX.from = m.screen; m.edit = null; m.pdet = null; if (next === 'dom') m.domFrom = m.screen === 'dom' ? m.domFrom : m.screen; if (next === 'set') m.setFrom = m.screen === 'set' ? m.setFrom : m.screen; }
    p20Screen(next);
    m.screen = next; m.sub = sub; m.detail = false; m.menu = false; m.sheet = false; m.min = false; m.orig = null; paperState.scan = false; paperState.open = paperState.open && next === 'hl';
    if (next !== 'skann' && next !== 'opp') m.rc = null;
  }
  u.type = m.filter;
  draw();
  load();
}

/* ---------- Opplasting (med kø uten nett / bare på Wi-Fi) ---------- */

const onWifi = () => { const c = navigator.connection; return !c?.type || c.type === 'wifi' || c.type === 'ethernet'; };
export async function upload(files, { confirm = false, stay = false } = {}) {
  if (!files.length) return;
  m.sheet = false;
  if (pref('wifi') && !onWifi()) { for (const f of files) await UPQ.enqueue(f, 'wifi'); await refreshQueue(); if (location.hash !== '#/opp') location.hash = '#/opp'; else draw(); return flash('Venter på Wi-Fi før opplasting'); }
  if (!confirm && !stay && location.hash !== '#/opp') location.hash = '#/opp';
  m.uploading = files.length; draw();
  let first = null;
  for (const f of files) {
    try { const r = await sendOne(f); first ??= r; }
    catch (e) {
      // Uten nett, tapt forbindelse eller serverfeil: legg den i «Venter på opplasting» i stedet for å miste den.
      if (UPQ.transient(e)) { await UPQ.enqueue(f, navigator.onLine ? 'server' : 'offline'); await refreshQueue(); flash(navigator.onLine ? 'Serveren svarte ikke – lagt i «Venter på opplasting»' : 'Uten nett – lastes opp når du er på nett igjen'); }
      else flash(`${f.name || 'Kvittering'}: ${e.message}`);
    }
    m.uploading--; await loadJobs(); draw();
  }
  // Ett kamerabilde: gå rett til «Bekreft kvittering» (viser «Leser …» til AI-en er ferdig).
  if (confirm && first?.id) { m.rc = first.id; await loadReceipts().catch(() => {}); if (location.hash !== '#/skann') location.hash = '#/skann'; else draw(); }
  else if (two()) await loadReceipts().catch(() => {});
  draw(); poll();
}
export const retryUpload = (ids) => retryOffline(ids, true);
async function retryOffline(ids = null, force = false) {
  await refreshQueue();
  if (!m.offline.length || !navigator.onLine || (!force && pref('wifi') && !onWifi())) return draw();
  const r = await UPQ.flush(sendOne, ids);
  await refreshQueue();
  if (r.done) { flash(`${r.done} kvittering${r.done > 1 ? 'er' : ''} lastet opp`); await loadJobs().catch(() => {}); poll(); }
  else if (r.failed && force) flash(m.offline.find((x) => x.error)?.error ?? 'Fikk ikke lastet opp');
  draw();
}

/* ---------- Kamera (fullskjerm med ramme, utløser, Bilder og Filer) ---------- */

let camEl = null, camStream = null;
function closeCam() { camStream?.getTracks().forEach((t) => t.stop()); camStream = null; camEl?.remove(); camEl = null; }
export function openCam() {
  m.sheet = false;
  // getUserMedia krever https (eller localhost). Over http på hjemmenettet brukes systemkameraet via filfeltet.
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { document.getElementById('m-capture')?.click(); draw(); return; }
  closeCam();
  camEl = document.createElement('div');
  camEl.className = `cam ${theme()}`;
  camEl.setAttribute('role', 'dialog'); camEl.setAttribute('aria-label', 'Kamera');
  camEl.innerHTML = `<video autoplay playsinline muted></video><div class="cam-frame"><i></i><i></i><i></i><i></i></div>
    <div class="cam-top"><button data-c="close" aria-label="Lukk">${icon('close', 22)}</button><span>Hold kvitteringen innenfor rammen</span></div>
    <div class="cam-msg" hidden></div>
    <div class="cam-bar"><label>${icon('img', 22)}<span>Bilder</span><input class="m-file" type="file" accept="image/*" multiple></label>
      <button class="shutter" data-c="shoot" aria-label="Ta bilde"><i></i></button>
      <label>${icon('file', 22)}<span>Filer</span><input class="m-file" type="file" accept="application/pdf,image/*,.heic,.heif" multiple></label></div>`;
  document.body.appendChild(camEl);
  const video = camEl.querySelector('video'), msg = camEl.querySelector('.cam-msg');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
    .then((st) => { if (!camEl) { st.getTracks().forEach((t) => t.stop()); return; } camStream = st; video.srcObject = st; })
    .catch(() => { msg.hidden = false; msg.textContent = 'Fikk ikke tilgang til kameraet. Velg fra Bilder eller Filer.'; });
  camEl.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'close') return closeCam();
    if (c === 'shoot' && video.videoWidth) {
      const cv = document.createElement('canvas'); cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext('2d').drawImage(video, 0, 0);
      cv.toBlob((b) => { closeCam(); if (b) upload([new File([b], `kvittering-${Date.now()}.jpg`, { type: 'image/jpeg' })], { confirm: true }); }, 'image/jpeg', 0.92);
    }
  });
  camEl.addEventListener('change', (e) => { const f = [...(e.target.files ?? [])]; if (!f.length) return; closeCam(); upload(f); });
}

function scanTap() {
  // På PC (mus) brukes filopplasting, ikke kamera.
  if (!matchMedia('(pointer: coarse)').matches) { location.hash = '#/opp'; return; }
  if (pref('scanTap') === 'sheet') { m.sheet = true; return draw(); }
  openCam();
}
export const openSheet = () => { m.sheet = true; draw(); };

/* ---------- iOS: dra glassmarkøren mellom fanene (Liquid Glass) ---------- */
// Etter 6 px fanges pekeren, og linsen følger fingeren uten overgang: løftet (scale 1.18/1.22), lysere kant og glans,
// strekkes etter farten og gummibånd ved kantene. Ved slipp snapper den til nærmeste fane med fjæring, og klikket stoppes.
let tdrag = null, tsup = 0;
function tabDown(e) {
  const nav = e.target.closest?.('.tabs.lg[data-tabdrag]');
  if (!nav || m.min || (e.button ?? 0) > 0) return false;
  const links = [...nav.querySelectorAll('a[data-tab]')], mk = nav.querySelector('.mark');
  if (links.length < 2 || !mk) return false;
  const r = nav.getBoundingClientRect(), pad = 5, cw = (r.width - pad * 2) / links.length;
  tdrag = { nav, mk, links, sx: e.clientX, lx: e.clientX, id: e.pointerId, cw, pad, moved: false, x: mk.offsetLeft, over: -1 };
  return true;
}
function tabMove(e) {
  const d = tdrag;
  if (!d || e.pointerId !== d.id) return false;
  if (!d.moved) {
    if (Math.abs(e.clientX - d.sx) < 6) return true;
    d.moved = true;
    try { d.nav.setPointerCapture(e.pointerId); } catch {}
    d.mk.getAnimations?.().forEach((a) => a.cancel());
    d.nav.classList.add('drag'); d.nav.parentElement.classList.add('drag');
  }
  const r = d.nav.getBoundingClientRect(), lo = d.pad, hi = r.width - d.pad - d.cw, raw = e.clientX - r.left - d.cw / 2;
  const x = raw < lo ? lo - (lo - raw) * 0.25 : raw > hi ? hi + (raw - hi) * 0.25 : raw;
  const v = e.clientX - d.lx;
  d.lx = e.clientX; d.x = Math.max(lo, Math.min(hi, x));
  d.mk.style.left = `${x}px`; d.mk.style.width = `${d.cw}px`;
  d.mk.style.setProperty('--sx', (1.18 + Math.min(0.12, Math.abs(v) / 40)).toFixed(3));
  d.mk.style.setProperty('--sy', (1.22 - Math.min(0.1, Math.abs(v) / 60)).toFixed(3));
  const i = Math.max(0, Math.min(d.links.length - 1, Math.round((d.x - lo) / d.cw)));
  if (i !== d.over) { if (d.over >= 0) navigator.vibrate?.(4); d.over = i; d.links.forEach((a, j) => a.classList.toggle('lens', j === i)); }
  if (e.cancelable) e.preventDefault();
  return true;
}
function tabUp(e) {
  const d = tdrag;
  if (!d || e.pointerId !== d.id) return false;
  tdrag = null;
  try { d.nav.releasePointerCapture(e.pointerId); } catch {}
  if (!d.moved) return true;
  tsup = Date.now();
  navigator.vibrate?.(8);
  const i = Math.max(0, Math.min(d.links.length - 1, Math.round((d.x - d.pad) / d.cw))), a = d.links[i];
  d.nav.classList.remove('drag'); d.nav.parentElement.classList.remove('drag'); d.links.forEach((y) => y.classList.remove('lens'));
  const to = d.pad + i * d.cw;
  if (e.type === 'pointercancel' || location.hash === a.getAttribute('href')) {
    d.mk.animate([{ left: `${d.x}px` }, { left: `${to}px` }], { duration: 500, easing: 'cubic-bezier(.3,1.35,.5,1)' }).onfinish = () => { d.mk.style.left = ''; d.mk.style.width = ''; };
    d.mk.style.left = `${to}px`;
    return true;
  }
  m.markX = d.x; m.markAnim = null; // draw() fjærer markøren fra slippunktet til fanen
  if (a.dataset.tab === 'sok') { history.pushState(null, '', '#/sok'); route(); document.getElementById('m-aiq')?.focus(); }
  else location.hash = a.getAttribute('href');
  return true;
}

/* ---------- Sveip fra venstre kant for å gå tilbake (iOS-stil) ---------- */
// Prompt 23: forrige side ligger ferdig tegnet bak (mobile-p23.js) med parallakse og slør. Virker der det finnes en
// tilbakepil, men ikke på rotsidene (hovedfanene).
const BACK_SEL = '.pp-hero .pp-back, .m-scroll .gback, .m-scroll .back, .m-scroll .gtop, .m-scroll .atop, .m-scroll [data-mact="txback"], .m-scroll [data-mact="pdback"], .m-scroll [data-swipeback]';
function backTarget() {
  const r = root();
  if (m.orig || m.menu || m.sheet) return null;
  return [...r.querySelectorAll(BACK_SEL)].find((x) => x.offsetParent !== null || getComputedStyle(x).position === 'fixed') ?? null;
}
// Når sveipet tar over, avbrytes lange trykk, dra-og-slipp og karuseller som fikk samme pekerhendelse.
function cancelOthers(e) {
  clearTimeout(lpTimer); tdrag = null;
  const c = { type: 'pointercancel', pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, target: e.target, button: 0, preventDefault() {}, stopPropagation() {} };
  for (const f of [dragEnd, (x) => wx22Up(x, wxPlaces()), P22.up, paperUp, edUp, p16Up, trkUp, p20Up]) { try { f(c); } catch { /* hver modul rydder selv */ } }
}
const swDown = (e) => P23.swDown(e, backTarget());
const swMove = (e) => P23.swMove(e, cancelOthers);
const swEnd = (e) => P23.swEnd(e);

/* ---------- Hendelser ---------- */

const safe = (fn) => async (e) => { try { await fn(e); } catch (err) { flash(err.message, 'err'); } };
let globalBound = false, lpTimer = null, lpFired = false, lastY = 0, hiddenAt = 0;

function setMin(on) {
  if (m.min === on) return;
  m.min = on;
  document.querySelector('.m .tabbar')?.classList.toggle('min', on);
}

function bindGlobal() {
  if (globalBound) return;
  globalBound = true;
  addEventListener('scroll', () => {
    if (document.documentElement.dataset.ui !== 'mobile' || two()) return;
    const y = scrollY;
    if (y > lastY + 6 && y > 80) setMin(true); else if (y < lastY - 6) setMin(false);
    lastY = y;
  }, { passive: true });
  addEventListener('online', () => retryOffline());
  navigator.connection?.addEventListener?.('change', () => retryOffline());
  // Køen fra forrige gang (appen ble lukket uten nett), og et nytt forsøk hvert minutt så lenge noe venter.
  // Køen er per bruker (prompt 21): først når kontoen er kjent, vises og sendes den innloggede brukerens filer.
  accountInit().then(() => refreshQueue()).then(() => { if (m.offline.length) { draw(); retryOffline(); } });
  setInterval(() => { if (m.offline.length && navigator.onLine) retryOffline(); }, 60_000);
  // Skjul beløp i appveksleren og lås etter valgt tid i bakgrunnen.
  document.addEventListener('visibilitychange', () => {
    if (document.documentElement.dataset.ui !== 'mobile') return;
    if (document.hidden) { hiddenAt = Date.now(); if (pref('appHide')) { m.blur = true; draw(); } return; }
    const away = Date.now() - hiddenAt;
    if (pref('lock') && hiddenAt && away >= +pref('lockAfter') * 60000) { fetch('/api/logout', { method: 'POST' }).finally(() => { location.href = '/login?next=/finans/'; }); return; }
    if (m.blur) { m.blur = false; draw(); }
    if (paper() && m.screen === 'hjem') rcCount(true).then(draw).catch(() => {});
    retryOffline(); // tilbake i appen: prøv køen igjen
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.orig) { m.orig = null; draw(); } });
}

export function bind() {
  const el = root();
  bindGlobal();
  // Prompt 17: navn og ikon på appen, dra for å oppdatere og sanntid (Huskeliste, Familie og Sporing).
  applyIcon(); appLoad().then(() => draw()).catch(() => {}); ptrBind(); wsConnect(onRealtime);
  wxBindScroll(); P23.icBoot(); P25.boot(); P26.boot26(); P27.boot27();
  addEventListener('fh-design', (e) => { const d = e.detail ?? {}; takeDesign(d); if (typeof d.lock === 'boolean') setPref('lock', d.lock); if (typeof d.hap === 'boolean') setPref('hap', d.hap); if (d.photo) photoLoad(d.photo).then(draw).catch(() => {}); draw(); });
  loadLayout().then((r) => {
    takeDesign(r); take15(r); take16(r); take20(r); P24.take24(r); P25.take25(r); P26.take26(r); P27.take27(r); takeApp(r);
    // Første gang etter innlogging (nye installasjoner): onboarding i tre steg.
    if (r && r.onboarded === false) import('./mobile-gate.js').then((g) => g.showOnboarding(r)).catch(() => {});
    if (document.documentElement.dataset.ui === 'mobile') draw();
  }).catch(() => {});
  // Skanneknappen: trykk = kamera (eller valg), hold inne ~480 ms = arket med Bilder/Filer.
  el.addEventListener('pointerdown', (e) => {
    swDown(e); // sveip tilbake fra kanten ser hendelsen først, men stopper ingen andre før den tar over
    P26.down26(e); // Prompt 26: hold inne på Finans-fanelinja og på kortene i Kalender, sveip i uke/måned
    if (soDown(e)) return;
    p20Down(e); edDown(e); // først: nullstiller også «klikket etter et langt trykk»
    if (paper()) { p16Pointer(e); trkDown(e); P24.down24(e); }
    if (m.screen === 'vaer' && wx22Down(e, wxPlaces())) return;
    if (P22.down(e)) return;
    if (paperDown(e)) return;
    if (tabDown(e)) return;
    if (hlBind(e, e.target)) return;
    if (!e.target.closest('[data-scan]')) return;
    lpFired = false; clearTimeout(lpTimer);
    lpTimer = setTimeout(() => { lpFired = true; m.sheet = true; navigator.vibrate?.(10); draw(); }, 480);
  });
  const cancelLp = () => clearTimeout(lpTimer);
  el.addEventListener('pointerup', cancelLp); el.addEventListener('pointercancel', cancelLp);
  el.addEventListener('pointerup', (e) => { P26.up26(e); P24.up24(e); soUp(e); dragEnd(e); wx22Up(e, wxPlaces()); P22.up(e); paperUp(e); edUp(e); p16Up(e); trkUp(e); p20Up(e); }); el.addEventListener('pointercancel', (e) => { P26.up26(e); P24.up24(e); soUp(e); dragEnd(e); wx22Up(e, wxPlaces()); P22.up(e); paperUp(e); edUp(e); p16Up(e); trkUp(e); p20Up(e); });
  el.addEventListener('dragover', (e) => { if (e.target.closest('[data-p16drop]')) e.preventDefault(); });
  el.addEventListener('drop', safe(async (e) => { await p16Bind(e, e.target); }));
  el.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-ppplus], [data-edk], [data-pk], [data-fmk], [data-sk], [data-p24bol], [data-p24lp]')) e.preventDefault(); });
  el.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-scan], [data-kc], .pp-nav[data-ctx="fin"]')) e.preventDefault(); });
  el.addEventListener('click', safe(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if (Date.now() - tsup < 400 && d('.tabs')) { e.preventDefault(); e.stopPropagation(); return; }
    if (P23.swGuard()) { e.preventDefault(); e.stopPropagation(); return; } // klikket etter et sveip tilbake
    if (await P27.bind27(e, t)) return; // Prompt 27: Chat, Kalender v2-ark, ✕ i søk, søkeforslag, Ruter-kortet, nyheter, abonnement fra skjermbilde
    if (await P26.bind26(e, t, { items: () => TR.data?.items ?? [], reload: () => trkLoad() })) return; // Prompt 26: Kalender, Integrasjoner, SPOR VIA, Finans-fanelinja og aktiv fane
    if (P25.bind25(e, t)) return;
    if (await P24.bind24(e, t)) return;
    if (await P23.bind(e, t)) return;
    if (paper() && m.screen === 'spor' && await paperTrkBind(e, t)) return; // velg flere pakker går foran tilpass siden
    if (paper() && p20Click(e, t)) return; // Finans-flisene (flytt) og Posisjon-kortet
    if (paper() && edClick(e, t)) return; // tilpass siden: ▲ ▼ −, Ferdig, og klikket etter et langt trykk
    if (await P22.bind(e, t)) return;
    if (await p21Bind(e, t, { HK, reload: () => import('./mobile-p17.js').then((x) => x.tasksLoad(true)) })) return;
    if (await p17Bind(e, t)) return;
    if (await p16Bind(e, t)) return;
    if (await wxBind(e, t)) return;
    // Domener i Papir: å bytte mellom Oversikt, Publikum, Ytelse og Infra legges ikke i tilbake-historikken.
    if (paper() && m.screen === 'dom' && (x = d('.pp-nav [data-tab^="dom"]'))) { e.preventDefault(); location.replace('#/' + x.dataset.tab); return; }
    // Haptikk: faner og chips gir «valg», andre knapper og lenker et lett trykk.
    if (d('[data-tab], .chip, .hchip, [role="tab"], [role="radio"]')) haptic('tab');
    else if (d('button, a[href], [role="button"], label.opt-row')) haptic('tap');
    if (d('[data-scan]')) { e.preventDefault(); if (lpFired) { lpFired = false; return; } return scanTap(); }
    // Knapper inne i en klikkbar rad (f.eks. «Bokfør») går foran raden.
    if (d('.pact') && await pagesBind(e, t)) return;
    // Krympet fanelinje: første trykk utvider den.
    if (d('.tabbar.min .tabs')) { e.preventDefault(); return setMin(false); }
    // Søk-fanen: bytt skjerm i samme trykk, så tastaturet kommer opp med en gang (iOS krever brukerhandling).
    if ((x = d('[data-tab="sok"]'))) { e.preventDefault(); history.pushState(null, '', '#/sok'); route(); (document.getElementById('pp-fsq') ?? document.getElementById('m-aiq'))?.focus(); return; }
    if ((x = d('[data-tx]'))) { m.sel = +x.dataset.tx; m.edit = null; m.detail = true; window.scrollTo(0, 0); if (paper()) txLoad(m.sel).then(draw).catch(() => {}); return draw(); }
    if ((x = d('[data-reanalyze]'))) { e.preventDefault(); return reanalyze(x.dataset.reanalyze, x.dataset.engine === 'tesseract' ? 'tesseract' : 'gemini'); }
    if ((x = d('[data-job]'))) { const j = m.jobs.find((y) => y.id === x.dataset.job); if (j && j.status !== 'booked' && !ACTIVE.includes(j.status)) { m.rc = j.id; if (two()) { await loadReceipts(); return draw(); } location.hash = '#/skann'; } return; }
    if ((x = d('[data-rc]'))) { m.rc = x.dataset.rc; if (m.screen !== 'skann') { location.hash = '#/skann'; return; } return draw(); }
    if ((x = d('[data-bud]'))) { m.budSel = +x.dataset.bud; if (!S.tx) await loadTx(); return draw(); }
    if ((x = d('[data-filter]'))) { m.filter = x.dataset.filter; u.type = m.filter; await loadTx(); return draw(); }
    if ((x = d('[data-mcat]'))) { const r = await api(`/receipts/${m.rc}`, { method: 'PATCH', json: { categoryId: +x.dataset.mcat } }); S.receipts = S.receipts.map((y) => (y.id === r.id ? r : y)); return draw(); }
    if (paper() && await paperFinnBind(e, t)) return;
    if (paper() && await paperTrkBind(e, t)) return;
    if (paper() && (await nsBind(e, t) || await fsBind(e, t) || await txBind15(e, t) || navSetBind(e, t))) return;
    if (await paperBind(e, t)) return;
    if (await matBind(e, t)) return;
    if (await finnBind(e, t)) return;
    if (hlBind(e, t)) return;
    if (await trkBind(e, t)) return;
    if (await txBind(e, t)) return;
    if (await pagesBind(e, t)) return;
    if (await modBind(e, t)) return;
    if (await settingsBind(e, t)) return;
    const act = d('[data-mact]')?.dataset.mact;
    if (act === 'back') { e.preventDefault(); m.rc = null; if (m.screen === 'skann') return draw(); return; }
    if (act === 'txback') { e.preventDefault(); m.detail = false; return draw(); }
    if (act === 'menu') {
      e.preventDefault();
      const a = t.closest('a[href]');
      if (a && m.menu) { m.menu = false; const h = a.getAttribute('href'); if (location.hash !== h) location.hash = h; else draw(); return; }
      m.menu = !m.menu; return draw();
    }
    if (act === 'edithome') { m.menu = false; return; } // hlBind tar resten etter at Homelab er åpnet
    if (act === 'sheet') { m.sheet = false; return draw(); }
    if (act === 'cam') { return openCam(); }
    if (act === 'upq-retry') { e.preventDefault(); return retryOffline([d('[data-mact]').dataset.id], true); }
    if (act === 'upq-all') { e.preventDefault(); return retryOffline(null, true); }
    if (act === 'upq-del') { e.preventDefault(); await UPQ.remove(d('[data-mact]').dataset.id); await refreshQueue(); return draw(); }
    if (act === 'reveal') { if (pref('hideAmt')) { m.reveal = !m.reveal; draw(); } return; }
    if (act === 'book' || act === 'reject') {
      await api(`/receipts/${m.rc}/${act}`, { method: 'POST' });
      const nx = (S.receipts ?? []).find((y) => y.id !== m.rc && y.status === 'needs_review');
      m.rc = nx?.id ?? null;
      await Promise.all([loadReceipts(), loadBoot(), loadSummary()]);
      return flash(act === 'book' ? 'Bokført ✓' : 'Kvittering avvist');
    }
    if (act === 'logout') { await logout(); }
  }));
  el.addEventListener('input', (e) => { if (P27.input27(e, e.target)) return; if (P26.input26(e, e.target)) return; if (P24.bind24(e, e.target) === true) return; P23.bind(e, e.target); P22.bind(e, e.target); p17Bind(e, e.target); p16Bind(e, e.target); wxBind(e, e.target); if (paper()) { paperFinnBind(e, e.target); paperTrkBind(e, e.target); nsBind(e, e.target); fsBind(e, e.target); } paperBind(e, e.target); matBind(e, e.target); if (m.screen === 'finn') finnBind(e, e.target); hlBind(e, e.target); trkBind(e, e.target); if (m.screen === 'sub') subsBind(e, e.target); txBind(e, e.target); pagesBind(e, e.target); settingsBind(e, e.target); });
  el.addEventListener('change', safe(async (e) => {
    const t = e.target;
    if (await P27.change27(e, t)) return;
    if (t.matches('[data-mupload]')) { const f = [...t.files]; t.value = ''; await upload(f, { confirm: t.hasAttribute('data-confirm') && f.length === 1, stay: t.hasAttribute('data-stay') }); return; }
    if (t.dataset.mf) {
      const f = t.dataset.mf;
      const r = await api(`/receipts/${m.rc}`, { method: 'PATCH', json: { [f]: f === 'total' ? parseAmount(t.value) : f === 'accountId' ? +t.value : t.value } });
      S.receipts = S.receipts.map((y) => (y.id === r.id ? r : y)); return draw();
    }
    if (await P24.bind24(e, t)) return;
    if (await P22.bind(e, t)) return;
    if (await p17Bind(e, t)) return;
    if (await p16Bind(e, t)) return;
    if (paper() && await paperFinnBind(e, t)) return;
    if (paper() && (await nsBind(e, t) || await txBind15(e, t))) return;
    if (await paperBind(e, t)) return;
    if (await matBind(e, t)) return;
    if (await finnBind(e, t)) return;
    if (await txBind(e, t)) return;
    if (await pagesBind(e, t)) return;
    if (await modBind(e, t)) return;
    await settingsBind(e, t);
  }));
  el.addEventListener('submit', safe(async (e) => {
    if (await P27.submit27(e, e.target)) return;
    if (e.target.matches('[data-msearch]')) { e.preventDefault(); u.q = e.target.q.value; await loadTx(); return draw(); }
    if (await P24.bind24(e, e.target)) return;
    if (await P23.bind(e, e.target)) return;
    if (await P22.bind(e, e.target)) return;
    if (await wxBind(e, e.target)) return;
    if (await p17Bind(e, e.target)) return;
    if (paper() && await paperFinnBind(e, e.target)) return;
    if (paper() && await paperTrkBind(e, e.target)) return;
    if (paper() && (await nsBind(e, e.target) || await fsBind(e, e.target))) return;
    if (await paperBind(e, e.target)) return;
    if (await matBind(e, e.target)) return;
    if (await finnBind(e, e.target)) return;
    if (hlBind(e, e.target)) return;
    if (await trkBind(e, e.target)) return;
    if (await txBind(e, e.target)) return;
    if (await pagesBind(e, e.target)) return;
    if (await modBind(e, e.target)) return;
    await settingsBind(e, e.target);
  }));
  el.addEventListener('keydown', (e) => { P27.key27(e); hlBind(e, e.target); });
  el.addEventListener('focusin', (e) => { hlBind(e, e.target); });
  el.addEventListener('focusout', (e) => { hlBind(e, e.target); });
  el.addEventListener('pointermove', (e) => { if (swMove(e)) return; P26.move26(e); if (soMove(e)) return; if (dragMove(e)) return; if (wx22Move(e)) return; if (P22.move(e)) return; p20Move(e); paperMove(e); edMove(e); p16Move(e); P24.move24(e); trkMove(e); if (tabMove(e)) return; hlBind(e, e.target); }, { passive: false });
  el.addEventListener('pointerup', (e) => { if (swEnd(e)) return; if (tabUp(e)) return; hlBind(e, e.target); });
  el.addEventListener('pointercancel', (e) => { if (swEnd(e)) return; tabUp(e); });
  // Hindrer at nettleseren tar over berøringen (og sender pointercancel) mens man sveiper tilbake.
  el.addEventListener('touchmove', (e) => { if (P23.swOn() && e.cancelable) e.preventDefault(); }, { passive: false });
}
