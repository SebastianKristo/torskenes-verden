// Papir (prompt 16): redigerbar fanelinje (hold inne på linja, eller Innstillinger → Fanelinje), fargetema for ikonene
// i Innstillinger, Avganger (egen side i nyhetsleser-stil med flere stopp fra Entur og sanntid), Familie og kart
// (OpenStreetMap via Leaflet, soner, personvern) og Boliger i full mobilversjon. Valgene lagres per bruker i /api/me/layout.
import * as P30B from './mobile-p30b.js';
import { FT, famTabs, personCard, healthView } from './mobile-p17.js';
const famTop = () => (paper() ? '' : famTabs()); // Papir: fanene ligger i fanelinja nederst
import { api, esc, n0, ini, hlApi, dd, today, cap } from './core.js';
import { m, draw, flash, domOk } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { fourth, fabStyle } from './mobile-paper3.js';
import { hlData, ruterUrl } from './mobile-hl.js';
import { paper, paperDark } from './mobile-paper.js';
import { setTiles } from './mobile-p20.js';
import { DEP, depKey, depStatus, stopList } from './mobile-p21.js';
import * as P24 from './mobile-p24.js';
import * as P22 from './mobile-p22.js';
import * as P25 from './mobile-p25.js';

/* ---------- Valg (lokal kopi + /api/me/layout) ---------- */

const LS = 'fh_p16';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };
/** Leser tabBar og iconTheme fra /api/me/layout. */
export function take16(r) {
  if (!r) return;
  // Serveren kjenner ikke «auto» (fjerde fane); den lokale kopien beholdes når den finnes.
  if (r.tabBar && Array.isArray(r.tabBar.items) && !L.tabBar) L.tabBar = { items: r.tabBar.items.filter((x) => TB[x?.id]).slice(0, 6) };
  if (ICON_THEMES[r.iconTheme]) L.iconTheme = r.iconTheme;
  keep();
}
function save16(patch) { Object.assign(L, patch); keep(); hlApi('/me/layout', { method: 'PUT', json: patch }).catch(() => {}); if (patch.tabBar) P24.markCustom({ tabBar: patch.tabBar }); }
/** Setter hovedlinja (profilvalg). null = standardfanene. push = lagre i /api/me/layout også. */
export function setTabBar(items, push = true) {
  if (items) L.tabBar = { items: items.filter((x) => TB[x?.id]).slice(0, 6) }; else delete L.tabBar;
  keep();
  if (push) hlApi('/me/layout', { method: 'PUT', json: { tabBar: L.tabBar ?? { items: defItems() } } }).catch(() => {});
}

/* ---------- Fanelinja ---------- */

// Faner som kan ligge i hovedlinja. «auto» er fjerde fane (Domener, eller Sporing når pakker er på vei).
// Id-ene er de samme som serveren bruker i /api/me/layout.tabBar.
export const TB = {
  hjem: ['hl', 'Hjem', '⌂'], finans: ['hjem', 'Finans', 'kr'], mat: ['mat', 'Mat', '◐'], auto: [null, 'Domener / Sporing', '◎'],
  domener: ['dom', 'Domener', '◎'], sporing: ['spor', 'Sporing', '▣'], sok: ['sok', 'Søk', '⌕'], boliger: ['dir', 'Boliger', '⌂'],
  avganger: ['avg', 'Avganger', '⇆'], familie: ['fam', 'Familie', '◉'], vaer: ['vaer', 'Vær', '☼'], nyheter: ['nyheter', 'Nyheter', '▤'],
  aksjer: ['aks', 'Aksjer', '↗'], abonnementer: ['sub', 'Abonnementer', '↻'], media: ['media', 'Media', '♪'], huske: ['huske', 'Gjøremål', '☑'], chat: ['chat', 'Chat', '✦'],
  // Prompt 40 (claude-code-fanelinje-alle-sider.md): alt som finnes i Mer kan legges i fanelinja.
  kalender: ['kal', 'Kalender', '▦'], bursdager: ['bd', 'Bursdager', '✿'], brief: ['brief', 'Now Brief', '✧'], bibel: ['bibel', 'Bibel', '✝'],
  nordlys: ['nordlys', 'Nordlys', '◇'], innstillinger: ['set', 'Innstillinger', '⚙'], mer: ['mer', 'Mer', '⋯'],
};
// Bibel bare for brukere med modulen (lest lat, så importrekkefølgen ikke endres).
let B37 = null; import('./mobile-p37b.js').then((x) => { B37 = x; }).catch(() => {});
const tbOk = (k) => k !== 'bibel' || !!B37?.bibleOn?.();
export const TB_ICONS = ['▦', '✿', '✧', '✝', '◇', '⚙', '☑', '⌂', 'kr', '◐', '◎', '▣', '⌕', '⇆', '◉', '☼', '▤', '↗', '↻', '♥', '★', '✦', '◔', '≡', '⇄', '▢', '✉', '♪', '⚑'];
const defItems = () => ['hjem', 'finans', 'mat', 'auto', ...(fabStyle() === 'float' ? ['sok'] : []), 'mer'].map((id) => ({ id }));
export const tbItems = () => {
  // ISO2: Domener bare for admin. En lagret Domener-fane filtreres bort for andre (og «auto» når Sporing alt ligger der).
  const all = L.tabBar?.items ?? defItems(), dOk = domOk(), hasSpor = all.some((x) => x.id === 'sporing');
  const v = all.filter((x) => TB[x.id] && x.id !== 'mer' && tbOk(x.id) && (dOk || (x.id !== 'domener' && !(x.id === 'auto' && hasSpor))));
  return [...v.slice(0, 5), { id: 'mer', ...(L.tabBar?.items ?? []).find((x) => x.id === 'mer') }];
};
const routeOf = (id) => (id === 'auto' ? fourth() : TB[id][0]);
const autoLbl = () => (fourth() === 'spor' || !domOk() ? ['Sporing', '▣'] : ['Domener', '◎']);
/** Hovedlinja i Papir: [rute, navn, ikon]. Hjem vises bare på Hjem (pila øverst til venstre går hjem). */
export function mainTabs(scr) {
  return tbItems().map((x) => {
    const [, n0_, ic0] = TB[x.id], [an, ai] = x.id === 'auto' ? autoLbl() : [n0_, ic0];
    return [routeOf(x.id), x.label || an, x.icon || ai];
  }).filter(([k]) => (k !== 'hl' || scr === 'hl') && (k !== 'dom' || domOk()));
}

export const TBE = { open: false };
let lp = null, lpFired = false;
/** Hold inne på fanelinja i ca. 0,5 s for å redigere den. */
export function p16Down(e) {
  lpFired = false;
  if ((e.button ?? 0) > 0 || TBE.open) return false;
  const nav = e.target.closest?.('.m.papir .pp-nav');
  if (!nav || nav.dataset.ctx !== 'main' || e.target.closest('[data-ppplus]')) return false;
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; lpFired = true; TBE.open = true; haptic('ok'); navigator.vibrate?.(15); draw(); }, 500) };
  return false;
}
export function p16Move(e) { if (lp && (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10)) { clearTimeout(lp.t); lp = null; } AV.lpMove?.(e); }
export function p16Up() { if (lp) clearTimeout(lp.t); lp = null; AV.lpUp?.(); }

function tbRows() {
  const it = tbItems();
  return it.map((x, i) => {
    const [, dn, di] = TB[x.id], [an, ai] = x.id === 'auto' ? autoLbl() : [dn, di], fixed = x.id === 'mer';
    return `<div class="p16-tbr"><button class="p16-ic" data-p16="tbicon" data-i="${i}" aria-label="Bytt ikon for ${esc(x.label || an)}">${esc(x.icon || ai)}</button>
      <input class="sinp p16-tbn" data-p16name="${i}" value="${esc(x.label ?? '')}" placeholder="${esc(an)}" maxlength="14" aria-label="Navn på ${esc(an)}">
      ${fixed ? '<span class="p16-fx">Alltid sist</span>' : `<button class="mini" data-p16="tbmv" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Flytt ${esc(an)} til venstre">▲</button><button class="mini" data-p16="tbmv" data-i="${i}" data-d="1" ${i < it.length - 2 ? '' : 'disabled'} aria-label="Flytt ${esc(an)} til høyre">▼</button><button class="mini danger" data-p16="tbrm" data-i="${i}" aria-label="Fjern ${esc(an)}">−</button>`}</div>`;
  }).join('');
}
function tbAdd() {
  const used = new Set(tbItems().map((x) => x.id)), free = Object.keys(TB).filter((k) => !used.has(k) && k !== 'mer' && tbOk(k) && !(k === 'auto' && (used.has('domener') || used.has('sporing'))) && (domOk() || (k !== 'domener' && k !== 'auto')));
  if (tbItems().length >= 6) return '<div class="pp-mut">Fanelinja har plass til 6 faner. Fjern en for å legge til en ny.</div>';
  return `<div class="p16-chips">${free.map((k) => `<button class="p16-chip" data-p16="tbadd" data-k="${k}">+ ${esc(TB[k][1])}</button>`).join('')}</div>`;
}
/** Selve redigeringen (brukes både i arket og under Innstillinger → Fanelinje). */
export function tabEditor() {
  // Prompt 25: STIL · FORHÅNDSVISNING over «Legg til» (samme valg som Innstillinger → Fanelinje-stil).
  return `<div class="pp-card p16-tbe">${tbRows()}</div>${P25.styleSection(mainTabs('hl'))}${globalThis.P42?.nhSection?.() ?? '' /* prompt 42: HJEM-KNAPP · FORHÅNDSVISNING */}${globalThis.P41?.scanRow?.(true) ?? '' /* prompt 41: Skanneknapp på Hjem */}
    <span class="pp-lab">LEGG TIL FANE</span>${tbAdd()}
    <div class="pp-mut">Trykk på ikonet for å bytte det. Et tomt navn gir standardnavnet. Hjem vises bare på Hjem, og Mer står alltid sist.</div>
    <button class="pp-btn sm" data-p16="tbreset" style="align-self:flex-start">Tilbakestill fanelinja</button>`;
}
export function tabSheet() {
  if (!TBE.open) return '';
  return `<div class="sheet-bg" data-p16="tbx"></div><div class="pp-sheet p16-sheet" role="dialog" aria-label="Rediger fanelinjen"><span class="pp-grab"></span>
    <div class="p26-feh"><div><span class="pp-lab">HJEM · FANELINJE</span><b class="pp-serif">Rediger fanelinjen</b></div><button type="button" class="p30-sb p30-pri" data-p16="tbx">Ferdig</button></div>${tabEditor()}</div>`; // prompt 32: samme topp som Finans, Domener, Abonnement og Familie
}
function setItems(items) {
  const clean = items.map(({ id, label, icon }) => ({ id, ...(label ? { label } : {}), ...(icon ? { icon } : {}) }));
  L.tabBar = { items: clean }; keep();
  // «auto» lagres som Domener på serveren (de andre enhetene får da Domener som fjerde fane).
  hlApi('/me/layout', { method: 'PUT', json: { tabBar: { items: clean.map((x) => (x.id === 'auto' ? { ...x, id: 'domener' } : x)) } } }).catch(() => {});
}

/* ---------- Ikonfarger i Innstillinger ---------- */

export const ICON_THEMES = {
  standard: ['Standard', null],
  varm: ['Varm', ['#E8833A', '#D9534F', '#E0B33A', '#C2185B', '#B23A2A', '#A0522D', '#E07A5F']],
  kjolig: ['Kjølig', ['#2F6FED', '#0A84FF', '#30B0C7', '#5E5CE6', '#2F7A4F', '#3E91FF', '#64A6C8']],
  mono: ['Blekk', ['#1b1a17']],
  fargerik: ['Fargerik', ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55']],
};
export const iconTheme = () => L.iconTheme ?? 'standard';
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Fargen på et ikon i Innstillinger: dagens farge i «Standard», ellers fra valgt fargetema. */
// Prompt 30: «Standard» bruker samme farger som sidemenyen i web-innstillingene (Innstillinger Web.dc.html → NAV).
const WEB_COL = { konto: '#2b5d8a', look: '#7a5ad6', appikon: '#7a5ad6', hjemnav: '#3f7a6e', appnavn: '#3f7a6e', mod: '#c0562a', dom: '#c0562a', varsler: '#b23a2a', navstil: '#5b6470', fanelinje: '#5b6470', integ: '#4a5bbf', kal: '#2f7d4f', t212: '#2f7d4f', fai: '#7a3b6b', tok: '#a8661a', sik: '#1f6f78', oppd: '#6b6558', sysbk: '#2f6b45', kat: '#c0562a', regel: '#5b6470', bank: '#2b5d8a', sub: '#c2417a', rss: '#a8661a' };
export function iconColor(key, orig) {
  const pal = ICON_THEMES[iconTheme()]?.[1];
  if (!pal) return WEB_COL[key] ?? orig;
  if (iconTheme() === 'mono') return document.querySelector('.m.papir.pd') ? '#ece7dc' : '#1b1a17';
  return pal[hash(key) % pal.length];
}
export const iconInk = (bg) => (bg === '#ece7dc' ? '#1b1a17' : '#fff');
export function iconThemeRow() {
  return `<div class="pp-card p16-themes">${Object.entries(ICON_THEMES).map(([k, [n, pal]]) => `<button class="p16-theme" data-p16="ictheme" data-k="${k}" aria-pressed="${iconTheme() === k}"><span class="p16-dots">${(pal ?? ['#5E8BFF', '#34C759', '#FF9F0A', '#BF5AF2']).slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</span><span>${esc(n)}</span>${iconTheme() === k ? '<b>✓</b>' : ''}</button>`).join('')}</div>`;
}

/* ---------- Avganger (Ruter / Entur) ---------- */

export const AV = { stops: null, deps: {}, err: '', q: '', res: null, sErr: '', busy: false, add: false, edit: false, more: {}, t: 0, legacy: false };
let avTimer = null, sT = null;
export async function avgLoad(force = false) {
  if (!force && AV.t > Date.now() - 25000 && AV.stops) return;
  AV.t = Date.now();
  try { AV.stops = await hlApi('/me/stops'); AV.legacy = false; }
  catch {
    // Eldre server: stoppene fra Homelab-forsiden (uten egen søk og rekkefølge).
    const H = hlData();
    AV.stops = (H?.ruter ?? []).map((x, i) => ({ id: null, name: x.from || `Stopp ${i + 1}`, legacy: x }));
    AV.legacy = true;
  }
  await Promise.all((AV.stops ?? []).map(async (s) => {
    if (!s.id) { const x = s.legacy; AV.deps[s.name] = { departures: (x?.departures ?? []).map((d) => ({ ...d, minutes: d.min ?? d.minutes, to: d.to ?? x.to })) }; return; }
    try { AV.deps[s.id] = await hlApi(`/ruter/departures?stop=${encodeURIComponent(s.id)}&n=20`); }
    catch (e) { AV.deps[s.id] = { error: e.status === 404 ? 'Krever nyere server' : e.message, departures: [] }; }
  }));
  clearTimeout(avTimer);
  avTimer = setTimeout(() => { if (m.screen === 'avg' && !AV.edit && !AV.add) avgLoad(true).then(draw).catch(() => {}); }, 30000);
}
const RUTER = { Trikk: '#0B91EF', Buss: '#E60000', 'T-bane': '#EC700C', Tog: '#003087', 'Båt': '#682C88', metro: '#EC700C', tram: '#0B91EF', bus: '#E60000', regionbus: '#75A300', water: '#682C88', ferry: '#682C88', rail: '#003087', train: '#003087' };
const lineBg = (d) => d.color || RUTER[d.mode] || (/^\d$/.test(String(d.line)) ? RUTER.metro : /^1[1-9]$/.test(String(d.line)) ? RUTER.tram : RUTER.bus);
const hm = (t) => (t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '');
const minOf = (d) => d.minutes ?? d.min ?? (d.expected ? Math.round((new Date(d.expected) - Date.now()) / 60000) : null);
// Ruter-bildet øverst (prompt 21): ekte foto fra serveren (GET /api/background?type=ruter), ellers rolig gradient.
const RB = { url: null, t: 0, busy: false };
function ruterBg() {
  if (!RB.busy && Date.now() - RB.t > 30 * 60000) {
    RB.busy = true; RB.t = Date.now();
    const w = Math.min(1600, Math.round((innerWidth || 400) * Math.min(2, devicePixelRatio || 1)));
    hlApi(`/background?type=ruter&w=${w}`).then((r) => {
      const list = [r?.image_url ?? r?.url, ...(r?.fallbacks ?? [])].filter(Boolean);
      const next = (i) => { if (i >= list.length) return; const im = new Image(), to = setTimeout(() => { im.onload = im.onerror = null; next(i + 1); }, 9000); im.onload = () => { clearTimeout(to); RB.url = list[i]; if (m.screen === 'avg') draw(); }; im.onerror = () => { clearTimeout(to); next(i + 1); }; im.src = list[i]; };
      next(0);
    }).catch(() => {}).finally(() => { RB.busy = false; });
  }
  return RB.url ? `url('${esc(RB.url)}')` : 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)';
}
/** Bakgrunn i toppbildet for sider med eget bilde (Avganger). null = brukerens bakgrunn. */
export function heroBg(scr) {
  if (scr === 'avg') return `background-image:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0) 35%,rgba(0,0,0,.45)),${ruterBg()};background-size:cover;background-position:center 40%`;
  if (scr === 'dir' && paper()) return P24.bolHero();
  if (scr === 'fam') return 'background-image:linear-gradient(180deg,rgba(0,0,0,.2),rgba(0,0,0,0) 40%,rgba(0,0,0,.45)),linear-gradient(160deg,#5c7a5a 0%,#3d5a6b 55%,#26323d 100%)';
  return null;
}

// Prompt 21: trykk på en avgang utvider raden med holdeplassene fra stoppet til endestasjonen (bare én åpen).
function depRow(d, key, from) {
  const mn = minOf(d), { txt, late } = depStatus(d), open = DEP.open === key, c = lineBg(d);
  const clock = hm(d.expected || d.aimed || d.time);
  return `<div class="p16-dep p21-dep${d.cancelled ? ' x' : ''}${open ? ' open' : ''}"><button class="p21-dh" data-p21="dep" data-k="${esc(key)}" aria-expanded="${open}"><span class="pp-line" style="background:${esc(c)};color:${esc(d.textColor || '#fff')}">${esc(d.line)}</span>
    <span class="m-grow p16-dt"><b>${esc(d.to ?? '')}</b><span class="${late ? 'pp-lab-c' : 'pp-mut'}">${esc(txt)}</span>
      ${d.situation ? `<span class="p16-sit">${esc(d.situation)}</span>` : ''}</span>
    <span class="p16-min p21-min"><b class="pp-serif">${mn == null ? '–' : mn <= 0 ? 'Nå' : `${mn} min`}</b>${clock ? `<small>${esc(clock)}</small>` : ''}</span></button>
    <div class="p28-col${open ? ' on' : ''}" data-depcol="${esc(key)}"><div>${stopList(d, key, c, from)}</div></div></div>`;
}
function stopCard(s, i, n) {
  const key = s.id ?? s.name, D = AV.deps[key] ?? {}, list = D.departures ?? [], more = AV.more[key];
  const ctrl = AV.edit ? `<div class="pp-edc"><button data-p16="avmv" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Flytt ${esc(s.name)} opp">▲</button><button data-p16="avmv" data-i="${i}" data-d="1" ${i < n - 1 ? '' : 'disabled'} aria-label="Flytt ${esc(s.name)} ned">▼</button><button class="hide" data-p16="avrm" data-i="${i}" aria-label="Fjern ${esc(s.name)}">−</button></div>` : '';
  return `<div class="pp-ed${AV.edit ? ' on' : ''}" data-avk="${i}" id="avs-${i}">${ctrl}<div class="pp-card p16-stop">
    <div class="pp-row" style="align-items:center"><span class="m-grow" style="min-width:0"><span class="pp-lab">${esc((D.stop?.locality || s.locality || 'STOPP').toUpperCase())}</span><h2 class="pp-serif p16-sn">${esc(D.stop?.name || s.name)}</h2></span>
      <a class="pp-btn sm" href="${esc(ruterUrl(s.name))}" target="_blank" rel="noopener">Ruter ↗</a></div>
    ${D.error ? `<div class="pp-mut">${esc(D.error)}</div>` : ''}
    <div class="p16-deps">${list.slice(0, more ? 20 : 6).map((d, j) => depRow(d, depKey(key, d, j), D.stop?.name || s.name)).join('') || (D.error ? '' : '<div class="pp-mut" style="padding:8px 0">Ingen avganger den neste timen.</div>')}</div>
    ${list.length > 6 ? `<button class="pp-btn sm ghost" data-p16="avmore" data-k="${esc(key)}">${more ? 'Vis færre' : `Vis ${Math.min(20, list.length) - 6} flere ›`}</button>` : ''}</div></div>`;
}
export function avgView() {
  if (!AV.stops) return '<div class="m-spin"></div>';
  const st = AV.stops, upd = AV.t ? hm(AV.t) : '';
  const chips = `<div class="p16-stopchips" role="tablist" aria-label="Stopp">${st.map((s, i) => `<a href="#avs-${i}" data-p16="avjump" data-i="${i}">${esc(s.name)}</a>`).join('')}<button data-p16="avadd" aria-label="Legg til stopp">+ Stopp</button></div>`;
  const bar = AV.edit ? `<div class="pp-edbar" role="toolbar" aria-label="Rediger stopp"><div class="pp-row" style="align-items:center"><span>Flytt med ▲ ▼, fjern med −</span><button class="pp-btn sm" data-p16="avdone">Ferdig</button></div></div>` : '';
  return `<div class="pp-card p16-avtop"><div class="pp-row" style="align-items:center"><span class="pp-lab">SANNTID · ENTUR</span><span class="pp-mut">${upd ? `Oppdatert ${upd}` : ''}</span></div>${chips}</div>
    ${bar}${st.map((s, i) => stopCard(s, i, st.length)).join('') || '<div class="pp-card"><div class="pp-mut">Ingen stopp ennå. Trykk «+ Stopp» for å søke etter et stopp hos Ruter og Entur.</div></div>'}
    ${AV.edit || !st.length ? '' : '<span class="pp-edhint">Hold inne et stopp for å flytte eller fjerne det</span>'}
    ${AV.legacy ? '<div class="pp-mut" style="text-align:center">Søk etter flere stopp krever en nyere server.</div>' : ''}`;
}
export function avgSheet() {
  if (!AV.add) return '';
  const res = AV.res ?? [];
  return `<div class="sheet-bg" data-p16="avx"></div><div class="pp-sheet p16-sheet" role="dialog" aria-label="Legg til stopp"><span class="pp-grab"></span>
    <div class="pp-sh">Legg til stopp</div><div class="pp-mut">Søk i Ruter og Entur. Avgangene vises med sanntid.</div>
    <input class="sinp p16-inp" id="p16-avq" data-p16q="av" value="${esc(AV.q)}" placeholder="f.eks. Majorstuen eller Jernbanetorget" autocomplete="off" enterkeyhint="search">
    <div class="p16-res">${AV.sErr ? `<div class="pp-mut">${esc(AV.sErr)}</div>` : ''}${res.map((r, i) => `<button class="p16-ri" data-p16="avpick" data-i="${i}"><span class="m-grow"><b>${esc(r.name)}</b><span class="pp-mut">${esc([r.locality, (r.modes ?? []).map((x) => MODE_NB[x] ?? x).join(', ')].filter(Boolean).join(' · '))}</span></span><span class="pp-lab-c">+ Legg til</span></button>`).join('') || (AV.q.length > 1 && !AV.busy && !AV.sErr ? '<div class="pp-mut">Ingen treff.</div>' : AV.busy ? '<div class="m-spin"></div>' : '')}</div>
    <button class="pp-btn" data-p16="avx">Lukk</button></div>`;
}
const MODE_NB = { bus: 'buss', metro: 'T-bane', tram: 'trikk', rail: 'tog', water: 'båt', coach: 'ekspressbuss', air: 'fly' };
async function avSearch() {
  const q = AV.q.trim();
  if (q.length < 2) { AV.res = null; AV.sErr = ''; draw(); return; }
  AV.busy = true; draw();
  try { AV.res = await hlApi(`/ruter/search?q=${encodeURIComponent(q)}`); AV.sErr = ''; }
  catch (e) { AV.res = []; AV.sErr = e.status === 404 ? 'Søk etter stopp krever en nyere server. Oppdater Homelab.' : e.message; }
  AV.busy = false; draw();
  const el = document.getElementById('p16-avq'); if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); }
}
async function saveStops(list) {
  AV.stops = list;
  if (AV.legacy) return;
  try { await hlApi('/me/stops', { method: 'PUT', json: { stops: list.map(({ id, name }) => ({ id, name })) } }); } catch (e) { flash(e.message); }
}
// Hold inne et stopp-kort for å redigere stoppene.
let avlp = null, avFired = false;
function avDown(e) {
  avFired = false;
  if (m.screen !== 'avg' || AV.edit || (e.button ?? 0) > 0) return;
  const b = e.target.closest?.('[data-avk]');
  if (!b || e.target.closest('a,button,input')) return;
  avlp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { avlp = null; avFired = true; AV.edit = true; haptic('ok'); navigator.vibrate?.(15); draw(); }, 500) };
}
AV.lpMove = (e) => { if (avlp && (Math.abs(e.clientX - avlp.x) > 10 || Math.abs(e.clientY - avlp.y) > 10)) { clearTimeout(avlp.t); avlp = null; } };
AV.lpUp = () => { if (avlp) clearTimeout(avlp.t); avlp = null; };

/* ---------- Familie og kart ---------- */

export const FM = { d: null, err: '', sel: null, track: {}, zone: null, zoneMode: false, geo: false, geoErr: '', last: 0, seen: 0, busy: false };
let LF = null, mapEl = null, map = null, layer = null, famTimer = null, watchId = null;
export async function famLoad() {
  try { FM.d = await hlApi('/family'); if (Array.isArray(FM.d?.members)) FM.d.members = P22.groupMembers(FM.d.members); FM.err = ''; }
  catch (e) { FM.err = e.status === 404 ? 'Familie og kart krever en nyere server. Oppdater Homelab.' : e.message; }
  if (FM.sel) await trackLoad(FM.sel);
  clearTimeout(famTimer);
  famTimer = setTimeout(() => { if (m.screen === 'fam') famLoad().then(() => { draw(); }).catch(() => {}); }, 30000);
  // Hendelser (inn i eller ut av en sone) vises som et varsel i appen.
  const ev = (FM.d?.events ?? []).filter((x) => x.ts > (FM.seen || Date.now() - 60000));
  if (FM.seen && ev.length) flash(evText(ev[0]));
  FM.seen = Math.max(FM.seen || Date.now(), ...(FM.d?.events ?? []).map((x) => x.ts ?? 0));
}
async function trackLoad(uid) { try { const r = await hlApi(`/family/track/${encodeURIComponent(uid)}?hours=24`); FM.track[uid] = Array.isArray(r) ? r : r?.points ?? []; } catch { FM.track[uid] = []; } }
const memOf = (uid) => (FM.d?.members ?? []).find((x) => String(x.userId) === String(uid));
const zoneOf = (id) => (FM.d?.zones ?? []).find((z) => String(z.id) === String(id));
function evText(x) { const p = memOf(x.userId), z = zoneOf(x.zoneId); return `${(x.name ?? p?.name)?.split(' ')[0] ?? 'Noen'} ${x.kind === 'enter' ? 'kom til' : 'forlot'} ${x.zone ?? z?.name ?? 'en sone'}`; }
const ago = (ts) => { if (!ts) return ''; const s = Math.round((Date.now() - new Date(ts)) / 1000); return s < 60 ? 'nå' : s < 3600 ? `${Math.round(s / 60)} min siden` : s < 86400 ? `${Math.round(s / 3600)} t siden` : dd(new Date(ts).toLocaleDateString('sv-SE')); };
const ACT = { still: 'I ro', walking: 'Går', running: 'Løper', cycling: 'Sykler', driving: 'Kjører' };
const SHARE = { on: ['Deler', 'pos'], paused: ['Pauset', 'warn'], off: ['Av', 'mut'] };
const ZCOL = ['#b23a2a', '#2f7a4f', '#2f5d8a', '#a86a10', '#6b4fa3', '#1b1a17'];

function avOf(p, size = 40) {
  const u = p.avatarUrl;
  return `<span class="p16-av" style="width:${size}px;height:${size}px">${u ? `<img src="${esc(u)}" alt="">` : esc(ini(p.name || p.username))}</span>`;
}
function memberCard(p) {
  const L0 = p.last, [sn, sc] = SHARE[p.sharing] ?? SHARE.off, h = p.self || p.sharing === 'on' ? p.health?.today ?? p.health : null, on = String(FM.sel) === String(p.userId);
  const sens = L0 ? [L0.battery != null ? `${L0.charging ? '⚡ ' : ''}${Math.round(L0.battery * (L0.battery <= 1 ? 100 : 1))} %` : '', ACT[L0.activity] ?? '', L0.speed != null && p.precision !== 'approx' ? `${Math.round(L0.speed * 3.6)} km/t` : '', L0.acc != null ? `±${Math.round(L0.acc)} m` : ''].filter(Boolean) : [];
  return `<button class="pp-card p16-mem${on ? ' on' : ''}" data-p16="famsel" data-id="${esc(p.userId)}">
    <div class="pp-row" style="align-items:center">${avOf(p)}<span class="m-grow" style="min-width:0"><b class="pp-serif p16-mn">${esc(p.name || p.username)}${p.self ? ' <span class="pp-mut">(deg)</span>' : ''}</b><span class="pp-mut">${p.username ? `@${esc(p.username)} · ` : ''}${L0 && p.sharing === 'on' ? `${esc(L0.place || (p.precision === 'approx' ? 'Omtrentlig posisjon' : 'Posisjon'))} · ${ago(L0.ts)}` : p.sharing === 'paused' ? 'Har pauset delingen' : p.sharing === 'off' ? 'Deler ikke posisjon' : 'Ingen posisjon ennå'}</span></span><span class="p16-st ${sc}">${sn}</span></div>
    ${sens.length && p.sharing === 'on' ? `<div class="p16-sens">${sens.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
    ${h ? `<div class="p16-hl">${[['Skritt', h.steps != null ? n0(h.steps) : null], ['Hvilepuls', h.restingHr != null ? `${Math.round(h.restingHr)}` : null], ['Puls', h.hr != null ? `${Math.round(h.hr)}` : null], ['Søvn', h.sleepMin != null ? `${Math.floor(h.sleepMin / 60)} t ${h.sleepMin % 60} m` : null], ['Aktive kcal', h.activeKcal != null ? n0(h.activeKcal) : null]].filter(([, v]) => v != null).map(([k, v]) => `<span><small>${k}</small><b>${esc(v)}</b></span>`).join('')}</div>` : ''}</button>`;
}
function zoneCard(z) {
  // Soner tilhører den som lagde dem (prompt 21). Eldre server uten «mine»: alle kan endre.
  const mineZ = z.mine ?? (z.createdBy == null || String(z.createdBy) === String(FM.d?.me?.userId));
  const me = FM.d?.me?.userId, others = (FM.d?.members ?? []).filter((p) => String(p.userId) !== String(me));
  const nt = z.notify ?? {};
  return `<div class="pp-card p16-zone"><div class="pp-row" style="align-items:center"><span class="p16-zd" style="background:${esc(z.color || '#b23a2a')}"></span><span class="m-grow"><b>${esc(z.name)}</b><span class="pp-mut">Radius ${n0(z.radius)} m${mineZ ? (z.shared ? ' · delt med familien' : ' · bare deg') : ` · delt av ${esc(((memOf(z.createdBy)?.name) ?? 'familien').split(' ')[0])}`}</span></span>${mineZ ? `<button class="mini danger" data-p16="zdel" data-id="${esc(z.id)}" aria-label="Slett ${esc(z.name)}">Slett</button>` : ''}</div>
    ${mineZ && 'shared' in z ? `<button class="pp-srow p21-zsh" data-p16="zshare" data-id="${esc(z.id)}" role="switch" aria-checked="${!!z.shared}"><span class="m-grow"><b>Del med familien</b><span class="pp-mut">${z.shared ? 'Familien ser sonen og kan få varsel.' : 'Av: bare du ser sonen.'}</span></span><span class="sw" aria-checked="${!!z.shared}"></span></button>` : ''}
    ${others.length ? `<div class="p16-zn">${others.map((p) => { const v = nt[p.userId] ?? {}; return `<div class="p16-znr"><span class="m-grow m-ell">${esc((p.name || p.username || '').split(' ')[0])}</span><button class="p16-tg" data-p16="znot" data-z="${esc(z.id)}" data-u="${esc(p.userId)}" data-k="enter" aria-pressed="${!!v.enter}">Kommer</button><button class="p16-tg" data-p16="znot" data-z="${esc(z.id)}" data-u="${esc(p.userId)}" data-k="leave" aria-pressed="${!!v.leave}">Drar</button></div>`; }).join('')}</div>` : ''}</div>`;
}
export function famView() {
  if (FM.err && !FM.d) return `<div class="pp-card"><div class="pp-mut">${esc(FM.err)}</div></div>`;
  if (!FM.d) return '<div class="m-spin"></div>';
  const me = FM.d.me ?? {}, mem = FM.d.members ?? [], zones = FM.d.zones ?? [], ev = (FM.d.events ?? []).slice(0, 12);
  const sh = me.sharing ?? 'off', pr = me.precision ?? 'exact';
  // Bare personer som deler med deg (prompt 21). Deling er av som standard.
  const others = mem.filter((p) => !p.self && String(p.userId) !== String(me.userId)), sharers = others.filter((p) => p.sharing === 'on');
  // Fanene Kart, Soner og Helse (design/Familie.dc.html). Kartet ligger på Kart og Soner.
  const tab = FT.tab;
  if (tab === 'helse') return famTop() + healthView();
  const mapCard = `<div class="pp-card p16-mapc"><div id="fam-slot" class="p16-map"></div>
      <div class="pp-row p16-mapbar"><button class="pp-btn sm${FM.zoneMode ? ' ink' : ''}" data-p16="zmode">${FM.zoneMode ? 'Trykk på kartet …' : '+ Ny sone'}</button><button class="pp-btn sm" data-p16="famfit">Vis alle</button></div></div>`;
  if (tab === 'soner') return `${famTop()}${mapCard}<span class="pp-lab">SONER</span>${zones.map(zoneCard).join('') || '<div class="pp-card"><div class="pp-mut">Ingen soner ennå. Trykk «+ Ny sone» og så på kartet, for eksempel hjemme, skolen eller jobben.</div></div>'}
    <span class="pp-mut" style="font-size:12px;padding:0 4px">Trykk «Kommer» eller «Drar» for å få varsel når en person kommer til eller forlater sonen.</span>`;
  return `${famTop()}${personCard()}<div class="pp-card p16-mapc"><div id="fam-slot" class="p16-map"></div>
      <div class="pp-row p16-mapbar"><button class="pp-btn sm${FM.zoneMode ? ' ink' : ''}" data-p16="zmode">${FM.zoneMode ? 'Trykk på kartet …' : '+ Ny sone'}</button><button class="pp-btn sm" data-p16="famfit">Vis alle</button></div></div>
    <span class="pp-lab">FAMILIEN</span>${mem.map(memberCard).join('')}${sharers.length ? '' : '<div class="pp-card p21-empty"><b class="pp-serif">Ingen deler posisjon med deg ennå</b><div class="pp-mut">Deling er av som standard. Når noen i familien slår på deling i sin app, vises de her og på kartet.</div></div>'}
    <span class="pp-lab">DIN DELING</span><div class="pp-card p16-me">
      <div class="p16-seg">${Object.entries(SHARE).map(([k, [n]]) => `<button data-p16="famshare" data-k="${k}" aria-pressed="${sh === k}">${n}</button>`).join('')}</div>
      <div class="p16-seg">${[['exact', 'Nøyaktig'], ['approx', 'Omtrentlig']].map(([k, n]) => `<button data-p16="famprec" data-k="${k}" aria-pressed="${pr === k}">${n}</button>`).join('')}</div>
      <div class="pp-mut">${sh === 'paused' ? 'De andre ser at du har pauset delingen.' : sh === 'off' ? 'Av som standard: posisjonen og helsedataene dine vises ikke for noen før du slår på deling.' : pr === 'approx' ? 'De andre ser bare et område på ca. 1 km, og ikke farten din.' : 'De andre ser posisjonen, sporet og farten din.'}</div>
      <button class="pp-srow" data-p16="famgeo"><span class="m-grow"><b>Del fra denne nettleseren</b><span class="pp-mut">${FM.geoErr ? esc(FM.geoErr) : FM.geo ? 'På · sender mens siden er åpen' : 'Posisjon sendes bare mens appen er åpen her'}</span></span><span class="sw" aria-checked="${FM.geo}"></span></button>
      <div class="pp-mut">Helsedata (skritt, puls, søvn og kalorier) kan bare leses av iOS- og Android-appene med ditt samtykke. Nettleseren har ikke tilgang til dem.</div></div>
    <span class="pp-lab">HENDELSER</span><div class="pp-card">${ev.map((x) => `<div class="p16-ev"><span class="p16-zd" style="background:${esc(zoneOf(x.zoneId)?.color || '#b23a2a')}"></span><span class="m-grow">${esc(evText(x))}</span><span class="pp-mut">${ago(x.ts)}</span></div>`).join('') || '<div class="pp-mut">Ingen hendelser ennå.</div>'}</div>`;
}
export function famSheet() {
  const z = FM.zone;
  if (!z) return '';
  return `<div class="sheet-bg" data-p16="zx"></div><div class="pp-sheet p16-sheet" role="dialog" aria-label="Ny sone"><span class="pp-grab"></span>
    <div class="pp-sh">Ny sone</div><div class="pp-mut">${z.lat.toFixed(5)}, ${z.lon.toFixed(5)}</div>
    <input class="sinp p16-inp" id="p16-zn" data-p16z="name" value="${esc(z.name)}" placeholder="Navn, f.eks. Hjemme" maxlength="40">
    <label class="p16-rad"><span>Radius</span><input type="range" min="50" max="2000" step="50" value="${z.radius}" data-p16z="radius"><b>${n0(z.radius)} m</b></label>
    <div class="p16-cols">${ZCOL.map((c) => `<button data-p16="zcol" data-c="${c}" style="background:${c}" aria-pressed="${z.color === c}" aria-label="Farge"></button>`).join('')}</div>
    <button class="pp-btn ink" data-p16="zsave" ${z.name.trim() ? '' : 'disabled'}>Lagre sone</button><button class="pp-btn" data-p16="zx">Avbryt</button></div>`;
}
function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (LF) return LF;
  LF = new Promise((res, rej) => {
    // Leaflet ligger på serveren (/api/family/vendor); unpkg er reserve for eldre servere.
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/api/family/vendor/leaflet.css'; document.head.appendChild(css);
    const add = (src, next) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(window.L); s.onerror = next; document.head.appendChild(s); };
    add('/api/family/vendor/leaflet.js', () => {
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      add('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => { LF = null; rej(new Error('Kartet kunne ikke lastes')); });
    });
  });
  return LF;
}
/** Etter hver tegning: flytt det faste kartelementet inn på plassen sin (Leaflet-kartet overlever nye tegninger). */
export function famAfterDraw() {
  const slot = document.getElementById('fam-slot');
  if (!slot) return;
  if (!mapEl) { mapEl = document.createElement('div'); mapEl.className = 'p16-mapin'; mapEl.innerHTML = '<div class="p16-mapmsg">Laster kart …</div>'; }
  slot.appendChild(mapEl);
  loadLeaflet().then((Lf) => {
    if (!map) {
      mapEl.innerHTML = '';
      map = Lf.map(mapEl, { zoomControl: false, attributionControl: true }).setView([59.9139, 10.7522], 11);
      map.on('click', (ev) => { if (!FM.zoneMode) return; FM.zoneMode = false; FM.zone = { lat: ev.latlng.lat, lon: ev.latlng.lng, name: '', radius: 200, color: ZCOL[0] }; draw(); setTimeout(() => document.getElementById('p16-zn')?.focus(), 50); });
      paint(Lf, true);
    } else { paint(Lf, false); }
    // Fliser via serverens /tiles: Kartverket topo, med mørkt filter i mørkt tema og papirfilter i Papir (prompt 21).
    setTiles(Lf, map, mapEl, paper() ? (paperDark() ? 'dark' : 'paper') : 'dark').catch(() => {});
    setTimeout(() => map?.invalidateSize(), 30);
  }).catch((e) => { mapEl.innerHTML = `<div class="p16-mapmsg">${esc(e.message)} · listen under virker likevel</div>`; });
}
function paint(Lf, fit) {
  layer?.remove(); layer = Lf.layerGroup().addTo(map);
  const pts = [];
  for (const z of FM.d?.zones ?? []) Lf.circle([z.lat, z.lon], { radius: z.radius, color: z.color || '#b23a2a', weight: 2, fillOpacity: 0.12 }).bindTooltip(z.name).addTo(layer);
  for (const p of FM.d?.members ?? []) {
    const L0 = p.last;
    if (!L0 || p.sharing !== 'on' || L0.lat == null) continue;
    const html = `<span class="p16-pin${String(FM.sel) === String(p.userId) ? ' on' : ''}">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(ini(p.name))}</span>`;
    Lf.marker([L0.lat, L0.lon], { icon: Lf.divIcon({ html, className: 'p16-pinw', iconSize: [40, 40], iconAnchor: [20, 20] }) }).on('click', () => { FM.sel = p.userId; trackLoad(p.userId).then(draw); }).addTo(layer);
    if (p.precision === 'approx') Lf.circle([L0.lat, L0.lon], { radius: 1000, color: '#1b1a17', weight: 1, dashArray: '4 4', fillOpacity: 0.05 }).addTo(layer);
    else if (L0.acc) Lf.circle([L0.lat, L0.lon], { radius: L0.acc, color: '#2f5d8a', weight: 0, fillOpacity: 0.12 }).addTo(layer);
    pts.push([L0.lat, L0.lon]);
  }
  const tr = FM.sel ? FM.track[FM.sel] : null;
  if (tr?.length > 1) Lf.polyline(tr.map((x) => [x.lat, x.lon]), { color: '#b23a2a', weight: 4, opacity: 0.8 }).addTo(layer);
  if (fit && pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
}
async function famGeo(on) {
  if (!on) { if (watchId != null) navigator.geolocation?.clearWatch(watchId); watchId = null; FM.geo = false; draw(); return; }
  if (!navigator.geolocation) { FM.geoErr = 'Nettleseren har ikke tilgang til posisjon'; draw(); return; }
  FM.geo = true; FM.geoErr = ''; draw();
  let sent = 0;
  watchId = navigator.geolocation.watchPosition(async (pos) => {
    if (Date.now() - sent < 30000) return;
    sent = Date.now();
    const c = pos.coords, b = await navigator.getBattery?.().catch(() => null);
    const speed = c.speed ?? null;
    const body = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed, heading: c.heading ?? null, alt: c.altitude ?? null, battery: b ? b.level : null, charging: b ? b.charging : null, activity: speed == null ? null : speed < 0.5 ? 'still' : speed < 2.2 ? 'walking' : speed < 4 ? 'running' : speed < 8 ? 'cycling' : 'driving', ts: new Date(pos.timestamp).toISOString() };
    try { const r = await hlApi('/family/location', { method: 'POST', json: body }); for (const x of r?.events ?? []) flash(evText(x)); } catch {}
  }, (err) => { FM.geo = false; FM.geoErr = err.code === 1 ? 'Du har ikke gitt tilgang til posisjon' : 'Fant ikke posisjonen'; draw(); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}

/* ---------- Boliger (full mobilversjon) ---------- */

export const BO = { list: null, err: '', d: {}, tab: 'over', add: false, ny: false, f: { description: '', amount: '', date: '', categoryId: '' }, nf: { name: '', type: 'Hytte', address: '' }, q: '', busy: false, up: 0 };
const BTABS = [['over', 'Oversikt'], ['utg', 'Utgifter'], ['proj', 'Prosjekter'], ['reg', 'Regninger'], ['kv', 'Kvitteringer'], ['tilg', 'Tilgang']]; // prompt 30: Tilgang (Del boligen)
const TYPE_IC = { Enebolig: '⌂', Leilighet: '▦', Rekkehus: '▥', Hytte: '△', Fritidsbolig: '△', Utleie: '⚿', Annet: '◇' };
const kr = (v) => `${(v ?? 0) < 0 ? '−' : ''}${n0(v)} kr`;
export async function bolLoad(sub) {
  try { BO.list = await api('/folders'); BO.err = ''; } catch (e) { BO.err = e.message; }
  const id = +String(sub ?? '').split('/')[0];
  if (id) { try { BO.d[id] = await api(`/folders/${id}`); } catch (e) { BO.d[id] = { error: e.message }; } }
}
const bolId = () => +String(m.sub ?? '').split('/')[0] || null;
/** Toppbildets tittel og undertittel for en bolig. */
export const bolTitle = () => { const d = BO.d[bolId()]; return d && !d.error ? [d.name, [d.type, d.address].filter(Boolean).join(' · ')] : null; };
function bars(months) {
  const mx = Math.max(1, ...months.map((x) => x.total));
  return `<div class="p16-bars" aria-hidden="true">${months.map((x) => `<span><i style="height:${Math.max(3, (x.total / mx) * 72)}px">${Object.entries(x.byCat ?? {}).length ? '' : ''}</i><small>${esc(x.label)}</small></span>`).join('')}</div>`;
}
function bolList() {
  const L0 = BO.list ?? [], sum = L0.reduce((a, f) => a + (f.yearTotal ?? 0), 0);
  return `<div class="pp-card p16-bover"><span class="pp-lab">I ÅR · ALLE BOLIGER</span><b class="pp-serif p16-big">${kr(sum)}</b><span class="pp-mut">${L0.length} bolig${L0.length === 1 ? '' : 'er'} · ${L0.reduce((a, f) => a + (f.count ?? 0), 0)} poster</span>
      <div class="p16-qa"><button class="pp-btn sm ink" data-p16="bolny">+ Ny bolig</button></div></div>
    ${L0.map((f) => `<a class="pp-card p16-bol" href="#/dir/${f.id}" data-p24bol="${f.id}" draggable="false"><span class="p16-bic">${TYPE_IC[f.type] ?? '◇'}</span><span class="m-grow" style="min-width:0"><b class="pp-serif p16-bn">${esc(f.name)}</b><span class="pp-mut">${esc([f.type, f.address].filter(Boolean).join(' · '))}</span><span class="pp-mut">${f.members?.length > 1 ? `Delt med ${f.members.length - 1} · ` : ''}${esc(f.myRole ?? '')}</span></span><span class="p16-br"><b>${kr(f.yearTotal)}</b><small>i år</small></span></a>`).join('') || '<div class="pp-card"><div class="pp-mut">Ingen boliger ennå. Lag en for huset, hytta eller utleieleiligheten, og last opp kvitteringer rett i den.</div></div>'}
    ${BO.ny ? newBolSheet() : ''}`;
}
function newBolSheet() {
  const types = ['Enebolig', 'Leilighet', 'Rekkehus', 'Hytte', 'Utleie', 'Annet'];
  return `<div class="sheet-bg" data-p16="bolnyx"></div><div class="pp-sheet p16-sheet" role="dialog" aria-label="Ny bolig"><span class="pp-grab"></span><div class="pp-sh">Ny bolig</div>
    <input class="sinp p16-inp" data-p16b="name" value="${esc(BO.nf.name)}" placeholder="Navn, f.eks. Hytta på Geilo" maxlength="60">
    <div class="p16-chips">${types.map((t) => `<button class="p16-chip" data-p16="boltype" data-k="${t}" aria-pressed="${BO.nf.type === t}">${TYPE_IC[t] ?? ''} ${t}</button>`).join('')}</div>
    <input class="sinp p16-inp" data-p16b="address" value="${esc(BO.nf.address)}" placeholder="Adresse (valgfritt)" maxlength="120">
    <button class="pp-btn ink" data-p16="bolnysave">Lag bolig</button><button class="pp-btn" data-p16="bolnyx">Avbryt</button></div>`;
}
function bolDetail(d) {
  const k = d.kpi ?? {};
  const head = `<div class="pp-card p16-bover"><div class="pp-row" style="align-items:center"><span class="pp-lab">I ÅR</span><span class="pp-mut">${esc(d.myRole ?? '')}</span></div><b class="pp-serif p16-big">${kr(k.yearTotal ?? d.yearTotal)}</b>
      <div class="p16-kpi"><span><small>Per måned</small><b>${kr(k.perMonth)}</b></span><span><small>Poster</small><b>${n0(k.count ?? d.count)}</b></span><span><small>Prosjekter igjen</small><b>${kr(k.projectsLeft)}</b></span><span><small>Strøm denne mnd.</small><b>${kr(k.stromNow)}</b></span></div>
      <div class="p16-qa">${d.canEdit ? `<label class="pp-btn sm ink">↑ Last opp kvittering<input class="m-file" type="file" multiple accept="image/*,application/pdf,.heic" data-p16up="${d.id}"></label><button class="pp-btn sm" data-p16="boladd">+ Utgift</button>` : ''}</div>
      ${BO.up ? `<div class="pp-mut">✦ Laster opp ${BO.up} …</div>` : ''}</div>
    <div class="p16-tabs" role="tablist">${BTABS.map(([t, n]) => `<button role="tab" data-p16="boltab" data-k="${t}" aria-selected="${BO.tab === t}">${n}</button>`).join('')}</div>`;
  const body = { over: bolOver, utg: bolEntries, proj: bolProj, reg: bolBills, kv: bolRc, tilg: P30B.accessTab }[BO.tab] ?? bolOver;
  return head + body(d) + (BO.add ? addSheet(d) : '') + P30B.entSheet(d); // prompt 30: detaljarket for en utgift
}
function bolOver(d) {
  const cats = d.categories ?? [], up = d.upcoming ?? [], bal = (d.balances ?? []).filter((b) => Math.abs(b.balance) > 0.5);
  return `${P30B.reviewCard(d)}${d.months?.length ? `<div class="pp-card"><span class="pp-lab">MÅNED FOR MÅNED</span>${bars(d.months)}</div>` : ''}
    ${cats.length ? `<div class="pp-card"><span class="pp-lab">KATEGORIER</span>${cats.slice(0, 8).map((c) => `<div class="p16-cat"><span class="p16-zd" style="background:${esc(c.color || '#a0a0aa')}"></span><span class="m-grow">${esc(c.name)}</span><b>${kr(c.sum)}</b></div><span class="p16-pb"><i style="width:${Math.max(2, c.pct ?? 0)}%;background:${esc(c.color || '#a0a0aa')}"></i></span>`).join('')}</div>` : ''}
    ${up.length ? `<div class="pp-card"><span class="pp-lab">KOMMER</span>${up.slice(0, 5).map((x) => `<div class="p16-cat"><span class="m-grow">${esc(x.name ?? x.title ?? x.label ?? '')}</span><span class="pp-mut">${x.date || x.due ? dd(x.date || x.due) : ''}</span>${x.amount != null ? `<b>${kr(x.amount)}</b>` : ''}</div>`).join('')}</div>` : ''}
    ${bal.length ? `<div class="pp-card"><span class="pp-lab">FORDELING</span>${bal.map((b) => `<div class="p16-cat"><span class="m-grow">${esc(b.name)}</span><b class="${b.balance > 0 ? 'pp-pos' : 'pp-lab-c'}">${b.balance > 0 ? 'Har til gode ' : 'Skylder '}${kr(Math.abs(b.balance))}</b></div>`).join('')}</div>` : ''}
    ${!d.months?.length && !cats.length ? '<div class="pp-card"><div class="pp-mut">Ingen utgifter i år ennå. Last opp en kvittering eller legg til en utgift.</div></div>' : ''}`;
}
function bolEntries(d) {
  const q = BO.q.trim().toLowerCase(), rows = (d.entries ?? []).filter((e) => !q || `${e.description} ${e.categoryLabel ?? e.category ?? ''} ${e.project ?? ''}`.toLowerCase().includes(q));
  const by = {};
  for (const e of rows) (by[e.date.slice(0, 7)] ??= []).push(e);
  return `<input class="sinp p16-inp" id="p16-boq" data-p16b="q" value="${esc(BO.q)}" placeholder="Søk i utgiftene" type="search">
    ${Object.entries(by).map(([mo, list]) => `<span class="pp-lab">${esc(cap(new Date(mo + '-15').toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })).toUpperCase())}</span><div class="pp-card pp-tight">${list.map((e) => `<button type="button" class="p16-ent b30-ent" data-b30="ent" data-id="${e.id}"><span class="p16-zd" style="background:${esc(e.color || '#a0a0aa')}"></span><span class="m-grow" style="min-width:0"><b>${esc(e.description)}</b><span class="pp-mut">${esc([dd(e.date), e.categoryLabel ?? e.category, e.project, e.paidBy].filter(Boolean).join(' · '))}</span>${e.aiShort ? `<span class="p16-ai">✦ ${esc(e.aiShort)}</span>` : ''}</span><b class="p16-amt">${kr(e.amount)}</b>${e.status === 'review' ? '<span class="b30-rv">Til gjennomgang</span>' : ''}</button>`).join('')}</div>`).join('') || '<div class="pp-card"><div class="pp-mut">Ingen treff.</div></div>'}`;
}
function bolProj(d) {
  return (d.projects ?? []).map((p) => {
    const pct = p.budget ? Math.min(100, (p.spent / p.budget) * 100) : 0;
    return `<div class="pp-card"><div class="pp-row" style="align-items:center"><span class="m-grow"><b class="pp-serif p16-bn">${esc(p.name)}</b><span class="pp-mut">${esc([p.vendor, p.category].filter(Boolean).join(' · '))}</span></span><span class="p16-br"><b>${kr(p.spent)}</b><small>av ${kr(p.budget)}</small></span></div>
      <span class="p16-pb"><i style="width:${Math.max(2, pct)}%;background:${pct >= 100 ? 'var(--pp-lab)' : esc(p.color || 'var(--pp-pos)')}"></i></span><span class="pp-mut">${p.remaining >= 0 ? `${kr(p.remaining)} igjen` : `${kr(-p.remaining)} over budsjett`}</span>
      ${(p.installments ?? []).map((x) => `<div class="p16-cat"><span class="m-grow">${esc(x.label)}${x.due ? ` · ${dd(x.due)}` : ''}</span><b>${kr(x.amount)}</b>${x.paid ? '<span class="pp-pos">✓ Betalt</span>' : d.canEdit ? `<button class="mini" data-p16="instpay" data-id="${x.id}">Marker betalt</button>` : ''}</div>`).join('')}</div>`;
  }).join('') || '<div class="pp-card"><div class="pp-mut">Ingen prosjekter. Lag prosjekter med budsjett og avdrag på nettsiden under Boliger.</div></div>';
}
function bolBills(d) {
  const F = { monthly: 'Hver måned', quarterly: 'Hvert kvartal', yearly: 'Hvert år', biannual: 'Hvert halvår' };
  return `<div class="pp-card pp-tight">${(d.bills ?? []).map((b) => `<div class="p16-ent"><span class="p16-zd" style="background:${esc(b.color || '#a0a0aa')}"></span><span class="m-grow"><b>${esc(b.name)}</b><span class="pp-mut">${esc([F[b.freq] ?? b.freq, b.payer].filter(Boolean).join(' · '))}${b.last ? ` · sist ${kr(b.last.amount)}` : ''}</span></span><span class="p16-br"><b>${b.nextDue ? dd(b.nextDue) : '–'}</b><small>neste</small></span></div>`).join('') || '<div class="pp-mut">Ingen faste regninger lagt inn.</div>'}</div>`;
}
function bolRc(d) {
  const rc = d.receipts ?? [];
  return `${d.canEdit ? `<label class="pp-card p16-drop" data-p16drop="${d.id}"><b>Slipp kvitteringer her</b><span class="pp-mut">eller trykk for å ta bilde eller velge filer. ✦ AI leser og velger kategori.</span><input class="m-file" type="file" multiple accept="image/*,application/pdf,.heic" data-p16up="${d.id}"></label>` : ''}
    <div class="p16-rcg">${rc.map((r) => `<a class="p16-rc" href="${esc(r.fileUrl)}" target="_blank" rel="noopener"${r.entryId ? ` data-b30="ent" data-id="${r.entryId}"` : ''}><span class="p16-rci" style="background-image:url('${esc(r.thumbUrl)}')"></span><b class="m-ell">${esc(r.description)}</b><span class="pp-mut">${r.pending ? '✦ Leser …' : `${dd(r.date)} · ${kr(r.amount)}`}</span></a>`).join('')}</div>
    ${rc.length ? '' : '<div class="pp-card"><div class="pp-mut">Ingen kvitteringer i denne boligen ennå.</div></div>'}`;
}
function addSheet(d) {
  const f = BO.f, tree = d.catTree ?? [];
  const opts = tree.flatMap((t) => [[t.id, t.label ?? t.name], ...(t.children ?? t.subs ?? []).map((c) => [c.id, `${t.label ?? t.name} › ${c.label ?? c.name}`])]);
  return `<div class="sheet-bg" data-p16="boladdx"></div><div class="pp-sheet p16-sheet" role="dialog" aria-label="Ny utgift"><span class="pp-grab"></span><div class="pp-sh">Ny utgift i ${esc(d.name)}</div>
    <input class="sinp p16-inp" data-p16f="description" value="${esc(f.description)}" placeholder="Beskrivelse, f.eks. Maling til terrassen" maxlength="120">
    <div class="p16-two"><input class="sinp p16-inp" data-p16f="amount" value="${esc(f.amount)}" placeholder="Beløp" inputmode="decimal"><input class="sinp p16-inp" data-p16f="date" type="date" value="${esc(f.date || today())}"></div>
    <select class="sinp p16-inp" data-p16f="categoryId"><option value="">✦ La AI velge kategori</option>${opts.map(([id, n]) => `<option value="${esc(id)}"${String(f.categoryId) === String(id) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <button class="pp-btn ink" data-p16="boladdsave">Lagre utgift</button><button class="pp-btn" data-p16="boladdx">Avbryt</button></div>`;
}
export function bolView() {
  if (BO.err && !BO.list) return `<div class="pp-card"><div class="pp-mut">${esc(BO.err)}</div></div>`;
  if (!BO.list) return '<div class="m-spin"></div>';
  const id = bolId(), pills = paper() ? P24.bolPills() : ''; // Prompt 24: bolig-pillene (hold inne = Rediger bolig)
  if (!id) return pills + bolList();
  const d = BO.d[id];
  if (!d) return pills + '<div class="m-spin"></div>';
  if (d.error) return `${pills}<div class="pp-card"><div class="pp-mut">${esc(d.error)}</div></div>`;
  return pills + bolDetail(d);
}
export const bolIdNow = () => bolId();
export async function bolUpload(id, files) {
  if (!files.length) return;
  BO.up = files.length; draw();
  let ok = 0;
  for (const f of files) {
    const fd = new FormData(); fd.append('file', f, f.name || 'kvittering.jpg');
    try { await api(`/folders/${id}/receipts`, { method: 'POST', body: fd }); ok++; } catch (e) { flash(e.message); }
    BO.up--; draw();
  }
  if (ok) flash(`${ok} kvittering${ok > 1 ? 'er' : ''} lastet opp ✓ · ✦ AI leser i bakgrunnen`);
  await bolLoad(String(id)); BO.tab = 'kv'; draw();
  setTimeout(() => { if (m.screen === 'dir') bolLoad(String(id)).then(draw).catch(() => {}); }, 8000);
}

/* ---------- Hendelser ---------- */

export function p16Pointer(e) { avDown(e); return p16Down(e); }
export async function p16Bind(e, t) {
  if (e.type === 'input') {
    if (t.dataset?.p16q === 'av') { AV.q = t.value; clearTimeout(sT); sT = setTimeout(avSearch, 280); return true; }
    if (t.dataset?.p16b === 'q') { BO.q = t.value; draw(); const el = document.getElementById('p16-boq'); el?.focus({ preventScroll: true }); el?.setSelectionRange(el.value.length, el.value.length); return true; }
    if (t.dataset?.p16b) { BO.nf[t.dataset.p16b] = t.value; return true; }
    if (t.dataset?.p16f) { BO.f[t.dataset.p16f] = t.value; return true; }
    if (t.dataset?.p16z === 'name') { FM.zone.name = t.value; const b = document.querySelector('[data-p16="zsave"]'); if (b) b.disabled = !t.value.trim(); return true; }
    if (t.dataset?.p16z === 'radius') { FM.zone.radius = +t.value; const b = t.parentElement?.querySelector('b'); if (b) b.textContent = `${n0(+t.value)} m`; return true; }
    return false;
  }
  if (e.type === 'change') {
    if (t.dataset?.p16name != null) { const it = tbItems(), i = +t.dataset.p16name; it[i] = { ...it[i], label: t.value.trim() }; setItems(it); draw(); return true; }
    if (t.dataset?.p16up) { const files = [...t.files]; t.value = ''; await bolUpload(+t.dataset.p16up, files); return true; }
    if (t.dataset?.p16f) { BO.f[t.dataset.p16f] = t.value; return true; }
    return false;
  }
  if (e.type === 'drop') {
    const z = t.closest?.('[data-p16drop]'); if (!z) return false;
    e.preventDefault(); await bolUpload(+z.dataset.p16drop, [...(e.dataTransfer?.files ?? [])]); return true;
  }
  if (e.type !== 'click') return false;
  if (lpFired && t.closest?.('.pp-nav')) { lpFired = false; e.preventDefault(); return true; }
  if (avFired && t.closest?.('[data-avk]')) { avFired = false; e.preventDefault(); return true; }
  const x = t.closest?.('[data-p16]');
  if (!x) return false;
  if (x.tagName !== 'LABEL') e.preventDefault();
  const k = x.dataset.p16, it = tbItems(), i = +x.dataset.i;
  switch (k) {
    // Fanelinja
    case 'tbx': TBE.open = false; break;
    case 'tbicon': { const cur = it[i].icon || (it[i].id === 'auto' ? autoLbl()[1] : TB[it[i].id][2]); it[i] = { ...it[i], icon: TB_ICONS[(TB_ICONS.indexOf(cur) + 1) % TB_ICONS.length] }; setItems(it); haptic('tab'); break; }
    case 'tbmv': { const j = i + +x.dataset.d; if (j < 0 || j >= it.length - 1) return true; [it[i], it[j]] = [it[j], it[i]]; setItems(it); haptic('tab'); break; }
    case 'tbrm': { if (it.length <= 2) { flash('Fanelinja må ha minst én fane i tillegg til Mer'); return true; } it.splice(i, 1); setItems(it); haptic('tap'); break; }
    case 'tbadd': { if (it.length >= 6) return true; it.splice(it.length - 1, 0, { id: x.dataset.k }); setItems(it); haptic('tap'); break; }
    case 'tbreset': L.tabBar = null; keep(); hlApi('/me/layout', { method: 'PUT', json: { tabBar: null } }).catch(() => {}); flash('Fanelinja er tilbakestilt'); break;
    case 'ictheme': save16({ iconTheme: x.dataset.k }); haptic('tab'); break;
    // Avganger
    case 'avadd': AV.add = true; AV.q = ''; AV.res = null; AV.sErr = ''; draw(); setTimeout(() => document.getElementById('p16-avq')?.focus(), 40); return true;
    case 'avx': AV.add = false; break;
    case 'avpick': { const r = AV.res?.[i]; if (!r) return true; if ((AV.stops ?? []).some((s) => s.id === r.id)) { flash(`${r.name} er allerede lagt til`); return true; } AV.add = false; await saveStops([...(AV.stops ?? []), { id: r.id, name: r.name, locality: r.locality }]); AV.t = 0; await avgLoad(true); flash(`${r.name} er lagt til ✓`); break; }
    case 'avmore': AV.more[x.dataset.k] = !AV.more[x.dataset.k]; break;
    case 'avdone': AV.edit = false; haptic('ok'); break;
    case 'avmv': { const s = [...AV.stops], j = i + +x.dataset.d; if (j < 0 || j >= s.length) return true; [s[i], s[j]] = [s[j], s[i]]; await saveStops(s); haptic('tab'); break; }
    case 'avrm': { const s = [...AV.stops]; s.splice(i, 1); await saveStops(s); haptic('tap'); break; }
    case 'avjump': document.getElementById(`avs-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true;
    // Familie
    case 'famsel': FM.sel = String(FM.sel) === x.dataset.id ? null : x.dataset.id; if (FM.sel) { await trackLoad(FM.sel); const p = memOf(FM.sel); if (map && p?.last?.lat != null) map.setView([p.last.lat, p.last.lon], 14); } break;
    case 'famfit': { const pts = (FM.d?.members ?? []).filter((p) => p.last?.lat != null && p.sharing === 'on').map((p) => [p.last.lat, p.last.lon]); if (map && pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); return true; }
    case 'famshare': case 'famprec': {
      const patch = k === 'famshare' ? { sharing: x.dataset.k } : { precision: x.dataset.k };
      try { await hlApi('/family/me', { method: 'PUT', json: patch }); FM.d.me = { ...FM.d.me, ...patch }; if (patch.sharing && patch.sharing !== 'on') famGeo(false); } catch (err) { flash(err.message); }
      haptic('tab'); break;
    }
    case 'famgeo': await famGeo(!FM.geo); return true;
    case 'zmode': FM.zoneMode = !FM.zoneMode; if (FM.zoneMode) flash('Trykk på kartet der sonen skal være'); break;
    case 'zx': FM.zone = null; break;
    case 'zcol': FM.zone.color = x.dataset.c; break;
    case 'zsave': { const z = FM.zone; try { await hlApi('/family/zones', { method: 'POST', json: { name: z.name.trim(), lat: z.lat, lon: z.lon, radius: z.radius, color: z.color } }); FM.zone = null; await famLoad(); flash('Sonen er lagret ✓'); } catch (err) { flash(err.message); } break; }
    case 'zshare': {
      const z = zoneOf(x.dataset.id); if (!z) break;
      z.shared = !z.shared; draw();
      try { await hlApi(`/family/zones/${x.dataset.id}`, { method: 'PATCH', json: { shared: z.shared } }); haptic('ok'); await famLoad(); } catch (err) { z.shared = !z.shared; flash(err.message); }
      break;
    }
    case 'zdel': try { await hlApi(`/family/zones/${x.dataset.id}`, { method: 'DELETE' }); await famLoad(); } catch (err) { flash(err.message); } break;
    case 'znot': {
      const z = zoneOf(x.dataset.z), u = x.dataset.u, cur = z?.notify?.[u] ?? {}, nv = { enter: !!cur.enter, leave: !!cur.leave, [x.dataset.k]: !cur[x.dataset.k] };
      try { await hlApi(`/family/zones/${x.dataset.z}/notify`, { method: 'PUT', json: { userId: u, ...nv } }); z.notify = { ...(z.notify ?? {}), [u]: nv }; } catch (err) { flash(err.message); }
      haptic('tab'); break;
    }
    // Boliger
    case 'bolny': BO.ny = true; break;
    case 'bolnyx': BO.ny = false; break;
    case 'boltype': BO.nf.type = x.dataset.k; break;
    case 'bolnysave': {
      if (!BO.nf.name.trim()) { flash('Gi boligen et navn'); return true; }
      try { const f = await api('/folders', { method: 'POST', json: BO.nf }); BO.ny = false; BO.nf = { name: '', type: 'Hytte', address: '' }; await bolLoad(); if (f?.id) { location.hash = `#/dir/${f.id}`; return true; } } catch (err) { flash(err.message); }
      break;
    }
    case 'boltab': BO.tab = x.dataset.k; window.scrollTo(0, 0); break;
    case 'boladd': BO.add = true; BO.f = { description: '', amount: '', date: today(), categoryId: '' }; break;
    case 'boladdx': BO.add = false; break;
    case 'boladdsave': {
      const id = bolId(), f = BO.f, amount = parseFloat(String(f.amount).replace(/\s/g, '').replace(',', '.'));
      if (!f.description.trim() || !Number.isFinite(amount)) { flash('Fyll inn beskrivelse og beløp'); return true; }
      try { BO.d[id] = await api(`/folders/${id}/entries`, { method: 'POST', json: { description: f.description.trim(), amount, date: f.date || today(), ...(f.categoryId ? { categoryId: +f.categoryId } : {}) } }); BO.add = false; BO.tab = 'utg'; flash('Utgiften er lagret ✓'); } catch (err) { flash(err.message); }
      break;
    }
    case 'instpay': { const id = bolId(); try { BO.d[id] = await api(`/folders/${id}/installments/${x.dataset.id}/pay`, { method: 'POST' }); flash('Markert som betalt ✓'); } catch (err) { flash(err.message); } break; }
    default: return false;
  }
  draw(); return true;
}
