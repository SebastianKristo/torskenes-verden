// Mobil-PWA (prompt 06). Tema: iOS Liquid Glass på iPhone/iPad, ellers Android Material 3 Expressive (med Material You-farger).
// Appen åpner på Homelab. Finans er et «annet OS» med fanene Oversikt, Liste, Budsjett, Søk og Mer; Matplan og Domener fyller hele skjermen.
// ≥ 600 px (åpen brettbar): navigasjonsrail + to paneler for Finans (liste/detalj).
import {
  S, api, esc, n0, n2, sgn, neg, dd, dWeek, today, monthName, cap, ini, greet, parseAmount,
  loadBoot, loadSummary, loadTx, loadReceipts, cats, accs, uploadReceipt, icon, logo, aiLine, conic, navName } from './core.js';
import { MODS, modView, modLoad, domNav, modBind } from './mobile-mods.js';
import { settingsView, settingsLoad, settingsBind } from './mobile-set.js';
import { hlView, hlLoad, hlBind, hlAfterDraw, LAY, loadLayout } from './mobile-hl.js';
import { PAGES, pageView, pageLoad, pagesBind, pageAfterDraw } from './mobile-pages.js';
import { txDetail, editForm, origOverlay, txBind } from './mobile-tx.js';
import { applyM3, c3 } from './mobile-theme.js';

const u = S.ui;
export const m = {
  screen: 'hl', sub: '', sel: null, budSel: null, rc: null, filter: '', toast: '', menu: false, jobs: [], uploading: 0, detail: false,
  sheet: false, min: false, tabIdx: 0, reveal: false, offline: [], me: null, edit: null, orig: null, pdet: null, txCache: {}, light: false,
};
const root = () => document.getElementById('app');
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const theme = () => { try { const t = localStorage.getItem('fh_theme'); if (t === 'ios' || t === 'and') return t; } catch {} return isIOS() ? 'ios' : 'and'; };
export const two = () => matchMedia('(min-width: 600px)').matches;
export const iosBg = () => { try { return localStorage.getItem('fh_ios_bg') !== '0'; } catch { return true; } };
const ACTIVE = ['pending', 'processing'];
export const amtC = (v, th) => (v > 0 ? '#9FE3C6' : th === 'and' ? c3('#F0DFD7') : 'inherit');

/* ---------- Skjermer og faner ---------- */

// Faner kan skjules og flyttes i «Rediger forsiden» (LAY.hlTabs / LAY.finTabs).
export const HLTABS = { hl: ['hl', 'Homelab', 'hlhome'], home: ['hjem', 'Finans', 'fin'], dom: ['dom', 'Domener', 'globe'], mat: ['mat', 'Matplan', 'mat'] };
export const FINTABS = { home: ['hjem', 'Oversikt', 'home'], list: ['liste', 'Liste', 'list'], bud: ['budsjett', 'Budsjett', 'bud'], ai: ['sok', 'Søk', 'ai'], mer: ['mer', 'Mer', 'mer'] };
export const FIXED_HL = ['hl', 'home'], FIXED_FIN = ['home', 'mer'];
const FINMODS = ['sub', 'dir', 'finn'];
export const FIN = ['hjem', 'liste', 'budsjett', 'sok', 'skann', 'opp', ...PAGES, ...FINMODS];
const TWO = ['hjem', 'liste', 'budsjett', 'skann', 'opp', 'sok'];
const HLG = ['hl', 'mat', 'set'];
const ALL = [...new Set([...FIN, 'hl', 'mat', 'dom', 'set'])];
// Oversikt, Liste og Budsjett bruker egne navn fra Sidemeny; Søk og Mer beholder de korte navnene i fanelinja.
const RENAME = ['home', 'list', 'bud'];
const tabsOf = (keys, def, fixed) => keys.filter((k) => def[k] && (fixed.includes(k) || !LAY().hide[k])).map((k) => (def === FINTABS && RENAME.includes(k) ? [def[k][0], navName(k, def[k][1]), def[k][2]] : def[k]));
export const hlTabs = () => tabsOf(LAY().hlTabs, HLTABS, FIXED_HL);
export const finTabs = () => tabsOf(LAY().finTabs, FINTABS, FIXED_FIN);
const finCur = (s) => (s === 'liste' ? 'liste' : s === 'budsjett' ? 'budsjett' : s === 'sok' ? 'sok' : [...PAGES, ...FINMODS].includes(s) ? 'mer' : 'hjem');

/* ---------- Valg på denne enheten (localStorage) ---------- */
const PDEF = { scanTap: 'cam', start: 'hl', hideAmt: false, appHide: false, lock: false, lockAfter: '5', crop: true, origImg: true, wifi: false, nSub: false, nDom: true, nWeek: false, m3Seed: 'sys', m3Mode: 'dark' };
let P = {};
try { P = JSON.parse(localStorage.getItem('fh_mprefs') || '{}') || {}; } catch { P = {}; }
if (P.start === 'hjem' && !P.startV2) { P.start = 'hl'; P.startV2 = 1; } // Homelab er ny standard startside
export const pref = (k) => P[k] ?? PDEF[k];
export function setPref(k, v) { P = { ...P, [k]: v, startV2: 1 }; try { localStorage.setItem('fh_mprefs', JSON.stringify(P)); } catch {} }
export const hide = (txt) => (pref('hideAmt') && !m.reveal ? '••••' : txt);

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
  if (S.boot?.restricted) return `<div class="m-row" style="justify-content:space-between;padding:6px 4px 0"><div class="title">Finans</div>${avatar()}</div>
    <div class="m-empty">Kontoen din har tilgang til Boliger. Regnskapet tilhører eieren av serveren.</div><a class="cta ${th === 'ios' ? 'glass' : ''}" href="#/dir"><span class="m-grow"><b style="font-weight:600">Boliger</b></span><span style="opacity:.6">›</span></a>`;
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

/* ---------- Last opp (kø i bakgrunnen) ---------- */

function uploadScreen(th) {
  const j = m.jobs;
  const st = (x) => (x.status === 'needs_review' ? ['Klar · trykk for å bekrefte', '#9FE3C6', 100] : x.status === 'booked' ? ['Bokført', '#9FE3C6', 100] : x.status === 'error' ? ['Feil – åpne for å fylle ut', '#FF8A6B', 100] : x.status === 'processing' ? [`Gemini leser … ${x.progress ?? 50} %`, th === 'and' ? c3('#FFB68A') : '#FF8A4C', x.progress ?? 50] : ['I kø', 'currentColor', 0]);
  return `<div class="m-row">${backBtn(th, '#/kv', 'Tilbake til Kvitteringer')}<b class="ptitle">Last opp</b></div>
    <label class="drop ${th === 'ios' ? 'glass' : ''}"><span class="n">${icon('up', 22)}</span><b>Velg kvitteringer</b><span>Bilder eller PDF – flere om gangen. Gemini leser dem i bakgrunnen. Du kan bruke appen mens du venter.</span><input class="m-file" type="file" accept="image/*,application/pdf" multiple data-mupload></label>
    <button class="cta ${th === 'ios' ? 'glass2' : ''}" data-mact="cam"><span class="n">${icon('cam', 20)}</span><span class="m-grow"><b style="display:block;font-weight:600">Ta bilde</b><span style="font-size:13px;opacity:.75">Bakkamera</span></span></button>
    ${m.offline.length ? `<div class="m-empty">${m.offline.length} fil${m.offline.length > 1 ? 'er' : ''} venter på ${pref('wifi') ? 'Wi-Fi' : 'nett'} og lastes opp automatisk.</div>` : ''}
    ${m.uploading ? `<div class="m-empty">Laster opp ${m.uploading} fil${m.uploading > 1 ? 'er' : ''} …</div>` : ''}
    ${j.length ? `<div class="sec">Kø</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${j.map((x) => { const [txt, c, p] = st(x); return `<button class="item job" data-job="${esc(x.id)}"><span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(x.merchant || x.name || 'Kvittering')}</span><span class="m-ell s" style="color:${c}">${txt}</span><span class="m-bar" style="height:4px;margin-top:6px;background:${th === 'ios' ? 'rgba(255,255,255,.12)' : c3('#31281F')}"><i style="width:${p}%;background:${c}"></i></span></span><span class="m-mono">${x.total != null ? n2(x.total) : ''}</span></button>`; }).join('')}</div>` : ''}`;
}

/* ---------- Kvitteringer: kø og bekreft ---------- */

function scanQueue(th) {
  const q = (S.receipts ?? []).filter((r) => ['pending', 'processing', 'needs_review'].includes(r.status));
  return `<div class="m-row">${backBtn(th, '#/kv', 'Tilbake til Kvitteringer')}<b class="ptitle">Skann</b></div>
    <button class="cta ${th === 'ios' ? 'glass' : ''}" data-scan><span class="n">${icon('scan', 20)}</span><span class="m-grow"><b style="display:block;font-weight:600">Ta bilde av kvittering</b><span style="font-size:13px;opacity:.75">Hold inne for Bilder eller Filer</span></span></button>
    ${q.length ? `<div class="sec">Til gjennomgang</div><div class="list ${th === 'ios' ? 'glass2' : ''}">${q.map((r) => `<button class="item${m.rc === r.id ? ' on' : ''}" data-rc="${r.id}"><span class="m-ini" style="border-radius:10px;background:#ECE8E0 center/cover;${r.thumb ? `background-image:url('${r.thumb}')` : ''}"></span><span class="m-grow"><span class="m-ell" style="font-weight:500">${esc(r.merchant ?? 'Ny kvittering')}</span><span class="m-ell s">${r.status === 'needs_review' ? `${dd(r.date)} · ${esc(r.provider ?? 'manuell')}` : 'Leser …'}</span></span><span class="m-mono">${r.total != null ? n2(r.total) : ''}</span></button>`).join('')}</div>` : '<div class="m-empty">Ingen kvitteringer i køen.</div>'}`;
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
  const others = MODS.filter(([k]) => k === 'mat' || k === 'dom');
  return `<div class="sheet-bg" data-mact="menu"></div><div class="sheet${two() ? ' left' : ''} ${th === 'ios' ? 'glass' : ''}" role="dialog" aria-label="Meny">
    <div class="m-row" style="gap:12px"><span class="m-av${avatarUrl() ? ' img' : ''}">${avInner()}</span><div class="m-grow"><b>${esc(meName())}</b><div style="font-size:13px;opacity:.65">${who}</div></div><button class="mini" data-mact="menu" aria-label="Lukk">${icon('close', 18)}</button></div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${row('#/hl', 'hlhome', 'Homelab', 'Dashbord, søk og snarveier', scr === 'hl')}</div>
    <div class="sec">Andre OS</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${row('#/hjem', 'wallet', 'Finans', 'Hjem, liste, budsjett og mer', FIN.includes(scr))}${others.map(([k, n, s2, ic]) => row('#/' + k, ic, n, s2, scr === k)).join('')}</div>
    <div class="list ${th === 'ios' ? 'glass2' : ''}">${row('#/hl', 'edit', 'Rediger forsiden', '', false, 'edithome')}${row('#/set', 'gear', 'Innstillinger', '', scr === 'set')}<button class="opt-row" data-mact="logout"><span class="set-ic" style="color:#FF8A6B">${icon('key', 18)}</span><span class="m-grow" style="color:#FF8A6B">Lås</span></button></div></div>`;
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

const group = (scr) => (scr === 'dom' ? 'dom' : HLG.includes(scr) ? 'hl' : 'fin');

function navModel() {
  const scr = m.screen, g = group(scr);
  if (g === 'dom') return { tabs: domNav(), cur: domNav.cur(), home: true, scan: false };
  if (g === 'hl') return { tabs: hlTabs(), cur: scr, home: false, scan: false };
  return { tabs: finTabs(), cur: finCur(scr), home: true, scan: !['skann', 'opp'].includes(scr) && !m.edit && !(m.detail && !two()) && !m.pdet };
}

const homeLbl = 'Til Homelab';
// iOS 26: fanelinje i full bredde, rund glassknapp med hus til venstre og en flytende «Skann»-pille over til høyre.
function iosNav(n) {
  const idx = n.tabs.findIndex(([k]) => k === n.cur);
  if (idx >= 0) m.tabIdx = idx;
  return `<div class="tabbar${m.min ? ' min' : ''}${n.home ? ' hashome' : ''}" data-key="${n.tabs.map(([k]) => k).join(',')}${n.home ? '+h' : ''}">
    ${n.home ? `<a class="hbtn lg" href="#/hl" aria-label="${homeLbl}">${icon('hlhome', 24)}</a>` : ''}
    <nav class="tabs lg" aria-label="Faner" style="--n:${n.tabs.length};--i:${m.tabIdx};--on:${idx < 0 ? 0 : 1}">
    <span class="mark" aria-hidden="true"></span>${n.tabs.map(([k, nm, ic], i) => `<a href="#/${k}" data-tab="${k}" ${i === idx ? 'aria-current="page"' : ''}>${icon(ic, 23)}<span>${nm}</span></a>`).join('')}</nav>
    ${n.scan ? `<button class="scanpill lg" data-scan aria-label="Skann kvittering (hold inne for Bilder og Filer)">${icon('scan', 24, 'currentColor', 2.2)}<span>Skann</span></button>` : ''}</div><div class="edge" aria-hidden="true"></div>`;
}
function andNav(n) {
  return `${n.scan ? `<button class="fab" data-scan aria-label="Skann kvittering (hold inne for Bilder og Filer)">${icon('scan', 24, 'currentColor', 2.2)}<span>Skann</span></button>` : ''}
    <nav class="navbar" aria-label="Faner">${n.home ? `<a class="hl" href="#/hl" aria-label="${homeLbl}"><span>${icon('hlhome', 20)}</span>Homelab</a><i class="nsep" aria-hidden="true"></i>` : ''}${n.tabs.map(([k, nm, ic]) => `<a href="#/${k}" data-tab="${k}" ${n.cur === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${nm}</a>`).join('')}</nav>`;
}
function rail(n) {
  return `<nav class="rail" aria-label="Faner">${n.home ? `<a class="r-home" href="#/hl" aria-label="${homeLbl}">${icon('hlhome', 22)}</a>` : ''}
    ${n.scan ? `<button class="r-scan" data-scan aria-label="Skann kvittering">${icon('scan', 24, 'currentColor', 2.2)}</button>` : ''}
    ${n.tabs.map(([k, nm, ic]) => `<a href="#/${k}" data-tab="${k}" ${n.cur === k ? 'aria-current="page"' : ''}><span>${icon(ic, 22)}</span>${nm}</a>`).join('')}
    <span style="flex:1"></span><button class="m-av r-av${avatarUrl() ? ' img' : ''}" data-mact="menu" aria-label="Meny: Homelab, andre OS og innstillinger" aria-haspopup="dialog">${avInner()}</button></nav>`;
}

/* ---------- Tegning ---------- */

export function draw() {
  const th = theme(), wide = two(), scr = m.screen;
  m.light = applyM3(th === 'and', pref('m3Seed'), pref('m3Mode'), () => draw());
  const fin = FIN.includes(scr), twoPane = wide && TWO.includes(scr) && !(S.boot?.restricted);
  const confirmView = scr === 'skann' && m.rc && !wide;
  const scrs = { hjem: home, liste: list, budsjett: budget, opp: uploadScreen };
  const main = scr === 'set' ? settingsView(th, m.sub)
    : scr === 'hl' ? hlView(th)
    : m.edit && !twoPane ? editForm(th)
    : m.detail && !twoPane && m.sel && FIN.includes(scr) ? txDetail(th, selTx())
    : PAGES.includes(scr) ? pageView(scr, th)
    : !fin || FINMODS.includes(scr) ? modView(scr, th, m.sub)
    : scrs[scr] ? scrs[scr](th) : confirmView ? confirmRc(th) : scanQueue(th);
  const n = navModel(), dom = scr === 'dom';
  const nav = th === 'ios' ? iosNav(n) : andNav(n);
  // Bevar fokus og markør i et felt når skjermen tegnes på nytt (f.eks. søk mens forslag kommer inn).
  const ae = document.activeElement, keep = ae?.id && root().contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  root().innerHTML = `<div class="m ${th}${wide ? ' two' : ''}${twoPane ? '' : ' full'}${dom ? ' dom' : ''}${scr === 'hl' ? ' hlp' : ''}${m.light ? ' light' : ''}${th === 'ios' && !iosBg() ? ' nobg' : ''}${m.blur ? ' blurred' : ''}">${th === 'ios' && iosBg() ? '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' : ''}
    ${rail(n)}<div class="m-scroll">${main}</div><div class="m-detail">${twoPane ? detail(th) : ''}</div>${nav}
    ${menuSheet(th)}${scanSheet(th)}${origOverlay(th)}${m.toast ? `<div class="m-toast" role="status">${esc(m.toast)}</div>` : ''}
    <input class="m-file" id="m-capture" type="file" accept="image/*" capture="environment" data-mupload data-confirm></div>`;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch {} } }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', th === 'ios' ? '#07070A' : getComputedStyle(root().firstElementChild).backgroundColor || '#19120E');
  hlAfterDraw(); pageAfterDraw();
  // Glassmarkøren glir med fjæring mellom fanene. Fanelinja tegnes på nytt ved hver oppdatering, så animasjonen
  // (Web Animations) gjenopptas med medgått tid hvis en ny tegning kommer midt i den.
  const mk = root().querySelector('.tabs .mark');
  if (mk && !m.min) {
    const x = mk.offsetLeft, now = performance.now();
    if (m.markX != null && x !== m.markX) m.markAnim = { from: m.markX, to: x, t0: now };
    const an = m.markAnim;
    if (an && an.to === x && now - an.t0 < 450) mk.animate([{ left: `${an.from}px` }, { left: `${x}px` }], { duration: 450, easing: 'cubic-bezier(.3,1.35,.5,1)' }).currentTime = now - an.t0;
    else m.markAnim = null;
    m.markX = x;
  }
}

let toastT;
export const flash = (t) => { m.toast = t; draw(); clearTimeout(toastT); toastT = setTimeout(() => { m.toast = ''; draw(); }, 1800); };

export async function loadMe() {
  // Kontoinfo: /finans/api/me, ellers Homelabs /api/me (samme sesjon). avatarUrl og serverName kommer fra Homelab.
  const [a, b] = await Promise.all([api('/me').catch(() => null), fetch('/api/me').then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  m.me = { name: S.boot?.settings?.name, ...(b ?? {}), ...(a ?? {}), avatarUrl: a?.avatarUrl ?? b?.avatarUrl ?? null, serverName: a?.serverName ?? b?.serverName ?? null };
}

async function load() {
  try {
    const jobs = [], scr = m.screen;
    const restricted = S.boot?.restricted;
    if (FIN.includes(scr) && !restricted) {
      if (!FINMODS.includes(scr)) jobs.push(loadSummary());
      if (scr === 'liste' || (two() && (scr === 'hjem' || scr === 'budsjett'))) jobs.push(loadTx());
      if (scr === 'skann' || scr === 'kv' || (two() && scr === 'opp')) jobs.push(loadReceipts());
      jobs.push(loadJobs());
    }
    if (PAGES.includes(scr)) jobs.push(pageLoad(scr, m.sub));
    else if (scr === 'set') jobs.push(settingsLoad(m.sub));
    else if (scr === 'hl') jobs.push(hlLoad());
    else if (!FIN.includes(scr) || FINMODS.includes(scr)) jobs.push(modLoad(scr, m.sub));
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
let pollT;
function poll() {
  clearTimeout(pollT);
  const busy = m.jobs.some((r) => ACTIVE.includes(r.status)) || (S.receipts ?? []).some((r) => ACTIVE.includes(r.status));
  if (busy) pollT = setTimeout(async () => { try { await loadJobs(); if (['skann', 'opp', 'kv'].includes(m.screen)) await loadReceipts(); } catch {} draw(); poll(); }, 2000);
}

export function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const h = parts[0];
  // Desktop- og eldre lenker
  const map = { ov: 'hjem', tx: 'liste', bud: 'budsjett', inn: 'set', meg: 'set', homelab: 'hl', ai: 'sok', matplan: 'mat', domener: 'dom', aksjer: 'aks', abonnement: 'sub', mapper: 'dir' };
  const start = ALL.includes(pref('start')) ? pref('start') : 'hl';
  let next = map[h] ?? (ALL.includes(h) ? h : start);
  if (S.boot?.restricted && FIN.includes(next) && next !== 'dir') next = next === 'hjem' ? 'hjem' : 'dir';
  const sub = parts.slice(1).join('/');
  if (next !== m.screen || sub !== m.sub) {
    if (next !== m.screen) { m.edit = null; m.pdet = null; }
    m.screen = next; m.sub = sub; m.detail = false; m.menu = false; m.sheet = false; m.min = false; m.orig = null;
    if (next !== 'skann' && next !== 'opp') m.rc = null;
    window.scrollTo(0, 0);
  }
  u.type = m.filter;
  draw();
  load();
}

/* ---------- Opplasting (med kø uten nett / bare på Wi-Fi) ---------- */

const onWifi = () => { const c = navigator.connection; return !c?.type || c.type === 'wifi' || c.type === 'ethernet'; };
export async function upload(files, { confirm = false } = {}) {
  if (!files.length) return;
  m.sheet = false;
  if (pref('wifi') && !onWifi()) { m.offline.push(...files); if (location.hash !== '#/opp') location.hash = '#/opp'; return flash('Venter på Wi-Fi før opplasting'); }
  if (!confirm && location.hash !== '#/opp') location.hash = '#/opp';
  m.uploading = files.length; draw();
  let first = null;
  for (const f of files) {
    try { const r = await uploadReceipt(f, null, { original: pref('origImg') }); first ??= r; }
    catch (e) {
      if (e instanceof TypeError || !navigator.onLine) { m.offline.push(f); flash('Uten nett – lastes opp når du er på nett igjen'); }
      else flash(`${f.name || 'Kvittering'}: ${e.message}`);
    }
    m.uploading--; await loadJobs(); draw();
  }
  // Ett kamerabilde: gå rett til «Bekreft kvittering» (viser «Leser …» til AI-en er ferdig).
  if (confirm && first?.id) { m.rc = first.id; await loadReceipts().catch(() => {}); if (location.hash !== '#/skann') location.hash = '#/skann'; else draw(); }
  else if (two()) await loadReceipts().catch(() => {});
  draw(); poll();
}
function retryOffline() { if (!m.offline.length || !navigator.onLine || (pref('wifi') && !onWifi())) return; const f = m.offline.splice(0); upload(f); }

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

/* ---------- Hendelser ---------- */

const safe = (fn) => async (e) => { try { await fn(e); } catch (err) { flash(err.message); } };
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
  addEventListener('online', retryOffline);
  navigator.connection?.addEventListener?.('change', retryOffline);
  // Skjul beløp i appveksleren og lås etter valgt tid i bakgrunnen.
  document.addEventListener('visibilitychange', () => {
    if (document.documentElement.dataset.ui !== 'mobile') return;
    if (document.hidden) { hiddenAt = Date.now(); if (pref('appHide')) { m.blur = true; draw(); } return; }
    const away = Date.now() - hiddenAt;
    if (pref('lock') && hiddenAt && away >= +pref('lockAfter') * 60000) { fetch('/api/logout', { method: 'POST' }).finally(() => { location.href = '/login?next=/finans/'; }); return; }
    if (m.blur) { m.blur = false; draw(); }
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.orig) { m.orig = null; draw(); } });
}

export function bind() {
  const el = root();
  bindGlobal();
  loadLayout().then(() => { if (document.documentElement.dataset.ui === 'mobile') draw(); }).catch(() => {});
  // Skanneknappen: trykk = kamera (eller valg), hold inne ~480 ms = arket med Bilder/Filer.
  el.addEventListener('pointerdown', (e) => {
    if (hlBind(e, e.target)) return;
    if (!e.target.closest('[data-scan]')) return;
    lpFired = false; clearTimeout(lpTimer);
    lpTimer = setTimeout(() => { lpFired = true; m.sheet = true; navigator.vibrate?.(10); draw(); }, 480);
  });
  const cancelLp = () => clearTimeout(lpTimer);
  el.addEventListener('pointerup', cancelLp); el.addEventListener('pointercancel', cancelLp);
  el.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-scan]')) e.preventDefault(); });
  el.addEventListener('click', safe(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if (d('[data-scan]')) { e.preventDefault(); if (lpFired) { lpFired = false; return; } return scanTap(); }
    // Knapper inne i en klikkbar rad (f.eks. «Bokfør») går foran raden.
    if (d('.pact') && await pagesBind(e, t)) return;
    // Krympet fanelinje: første trykk utvider den.
    if (d('.tabbar.min .tabs')) { e.preventDefault(); return setMin(false); }
    // Søk-fanen: bytt skjerm i samme trykk, så tastaturet kommer opp med en gang (iOS krever brukerhandling).
    if ((x = d('[data-tab="sok"]'))) { e.preventDefault(); history.pushState(null, '', '#/sok'); route(); document.getElementById('m-aiq')?.focus(); return; }
    if ((x = d('[data-tx]'))) { m.sel = +x.dataset.tx; m.edit = null; m.detail = true; window.scrollTo(0, 0); return draw(); }
    if ((x = d('[data-job]'))) { const j = m.jobs.find((y) => y.id === x.dataset.job); if (j && j.status !== 'booked' && !ACTIVE.includes(j.status)) { m.rc = j.id; if (two()) { await loadReceipts(); return draw(); } location.hash = '#/skann'; } return; }
    if ((x = d('[data-rc]'))) { m.rc = x.dataset.rc; if (m.screen !== 'skann') { location.hash = '#/skann'; return; } return draw(); }
    if ((x = d('[data-bud]'))) { m.budSel = +x.dataset.bud; if (!S.tx) await loadTx(); return draw(); }
    if ((x = d('[data-filter]'))) { m.filter = x.dataset.filter; u.type = m.filter; await loadTx(); return draw(); }
    if ((x = d('[data-mcat]'))) { const r = await api(`/receipts/${m.rc}`, { method: 'PATCH', json: { categoryId: +x.dataset.mcat } }); S.receipts = S.receipts.map((y) => (y.id === r.id ? r : y)); return draw(); }
    if (hlBind(e, t)) return;
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
    if (act === 'reveal') { if (pref('hideAmt')) { m.reveal = !m.reveal; draw(); } return; }
    if (act === 'book' || act === 'reject') {
      await api(`/receipts/${m.rc}/${act}`, { method: 'POST' });
      const nx = (S.receipts ?? []).find((y) => y.id !== m.rc && y.status === 'needs_review');
      m.rc = nx?.id ?? null;
      await Promise.all([loadReceipts(), loadBoot(), loadSummary()]);
      return flash(act === 'book' ? 'Bokført ✓' : 'Kvittering avvist');
    }
    if (act === 'logout') { await fetch('/api/logout', { method: 'POST' }); location.href = '/login?next=/finans/'; }
  }));
  el.addEventListener('input', (e) => { hlBind(e, e.target); txBind(e, e.target); pagesBind(e, e.target); settingsBind(e, e.target); });
  el.addEventListener('change', safe(async (e) => {
    const t = e.target;
    if (t.matches('[data-mupload]')) { const f = [...t.files]; t.value = ''; await upload(f, { confirm: t.hasAttribute('data-confirm') && f.length === 1 }); return; }
    if (t.dataset.mf) {
      const f = t.dataset.mf;
      const r = await api(`/receipts/${m.rc}`, { method: 'PATCH', json: { [f]: f === 'total' ? parseAmount(t.value) : f === 'accountId' ? +t.value : t.value } });
      S.receipts = S.receipts.map((y) => (y.id === r.id ? r : y)); return draw();
    }
    if (await txBind(e, t)) return;
    if (await pagesBind(e, t)) return;
    if (await modBind(e, t)) return;
    await settingsBind(e, t);
  }));
  el.addEventListener('submit', safe(async (e) => {
    if (e.target.matches('[data-msearch]')) { e.preventDefault(); u.q = e.target.q.value; await loadTx(); return draw(); }
    if (hlBind(e, e.target)) return;
    if (await txBind(e, e.target)) return;
    if (await pagesBind(e, e.target)) return;
    if (await modBind(e, e.target)) return;
    await settingsBind(e, e.target);
  }));
  el.addEventListener('keydown', (e) => { hlBind(e, e.target); });
  el.addEventListener('focusin', (e) => { hlBind(e, e.target); });
  el.addEventListener('focusout', (e) => { hlBind(e, e.target); });
  el.addEventListener('pointermove', (e) => { hlBind(e, e.target); });
  el.addEventListener('pointerup', (e) => { hlBind(e, e.target); });
}
