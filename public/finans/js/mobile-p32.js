// Prompt 32 (PWA): «Rediger fanelinjen» på Domener, Abonnement og Familie (hold inne på fanelinja, eller Innstillinger →
// Utseende og fanelinje → FANELINJE · ANDRE SIDER), Innstillinger → AI og tolkning → GLIMT I SØKEFELTET (hs_timeout_s),
// snarveier og logging i søkefeltet på Hjem, Hjem-widgeten Prøveperioder (h11), wiggle-knappene på egen rad og
// service worker-oppdatering (update ved oppstart/fokus/10 min, controllerchange → last inn på nytt én gang).
// Fasit: design/Mobil Papir App.dc.html → SECN, secNav(), ne, navDown, hsAsk() (NAV, TO, handoff()), hsLog(), trwVals().
// API (SERVER32): PUT /api/me/layout {secNav, hs_timeout_s} (400 på eldre server → bare på enheten),
// POST /api/search/history {q, engine, device:'mobil'}, GET /api/widgets/trials, PATCH /finans/api/subscriptions/trials/:id.
import { esc, hlApi, api } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import * as P25 from './mobile-p25.js';

const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* =====================================================================
   1. Fanelinje for Domener, Abonnement og Familie
   ===================================================================== */
export const SECN = {
  dom: { t: 'DOMENER', all: [['dom', 'Oversikt', '◎'], ['pub', 'Publikum', '◍'], ['ytl', 'Ytelse', '⚡'], ['inf', 'Infra', '▤']] },
  abo: { t: 'ABONNEMENT', all: [['home', 'Hjem', '⌂'], ['ins', 'Innsikt', '◔'], ['hist', 'Historikk', '↺']] },
  kart: { t: 'FAMILIE', all: [['kart', 'Kart', '◎'], ['soner', 'Soner', '◌'], ['helse', 'Helse', '♡']] },
};
const SEC_OF = { dom: 'dom', sub: 'abo', fam: 'kart' };
const ICONS = ['⌂', 'kr', '◐', '▣', '◎', '◍', '⚡', '▤', '◔', '↺', '↻', '◌', '♡', '◉', '★', '●', '◆', '♪', '✉', '⚑', '≡', '⇄', '☼', '✦'];
const valid = (k, v) => Array.isArray(v) && v.length ? v.filter((x) => x && SECN[k].all.some(([id]) => id === x.k)).slice(0, SECN[k].all.length) : null;
/** Lagret liste [{k, n?, ic?}] for en side, eller standard. */
export function secNav(k) {
  const v = valid(k, lsGet(`papir_nav_${k}`));
  return v && v.length ? v : SECN[k].all.map(([id]) => ({ k: id }));
}
/** [nøkkel, navn, ikon] for fanene på siden, i valgt rekkefølge. */
export function secTabs(k) { return secNav(k).map((x) => { const d = SECN[k].all.find(([id]) => id === x.k); return [x.k, x.n || d[1], x.ic || d[2]]; }); }
let syncT = null;
function secSave(k, v) {
  lsSet(`papir_nav_${k}`, v);
  clearTimeout(syncT);
  syncT = setTimeout(() => {
    // Serveren fletter per side; null fjerner siden (Tilbakestill). Eldre server: 400 → bare på enheten.
    hlApi('/me/layout', { method: 'PUT', json: { secNav: { [k]: v ?? null } } }).catch(() => {});
  }, 400);
}
/** Fra GET /api/me/layout: secNav {dom|abo|kart: [{k,n?,ic?}]}, hs_timeout_s. */
export function take32(r) {
  if (!r) return;
  const S = r.secNav ?? r.sec_nav;
  if (S && typeof S === 'object') for (const k of Object.keys(SECN)) { const v = valid(k, S[k]); if (v) lsSet(`papir_nav_${k}`, v); else if (S[k] === null) lsSet(`papir_nav_${k}`, null); }
  const to = +(r.hs_timeout_s ?? r.hsTimeoutS);
  if (TO_OPTS.includes(to)) lsSet('papir_hs_to', to);
}

const NE = { k: null, ic: null, lp: null, fired: false };
export function secSheet() {
  const k = NE.k; if (!k || !SECN[k]) return '';
  const S = SECN[k], cur = secNav(k), max = S.all.length;
  const rows = cur.map((x, i) => {
    const d = S.all.find(([id]) => id === x.k), ic = x.ic || d[2];
    return `<div class="p26-fr"><div class="p26-frr"><button class="p26-fic${NE.ic === i ? ' on' : ''}" data-p32="neic" data-i="${i}" aria-label="Velg ikon for ${esc(x.n || d[1])}">${esc(ic)}</button>
      <input class="p26-fin" data-p32in="nen" data-i="${i}" value="${esc(x.n ?? '')}" placeholder="${esc(d[1])}" maxlength="14" aria-label="Navn på ${esc(d[1])}">
      <button class="p26-fb" data-p32="neup" data-i="${i}" aria-label="Flytt ${esc(d[1])} til venstre" style="opacity:${i ? 1 : 0.3}">↑</button><button class="p26-fb rm" data-p32="nerm" data-i="${i}" aria-label="Fjern ${esc(d[1])}" style="opacity:${cur.length > 1 ? 1 : 0.3}">−</button></div>
      ${NE.ic === i ? `<div class="p26-icg">${ICONS.map((g) => `<button class="${ic === g ? 'on' : ''}" data-p32="neset" data-i="${i}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}</div>`;
  }).join('');
  const adds = S.all.filter(([id]) => !cur.some((x) => x.k === id));
  // Forhåndsvisningen viser ingen ⋯ (disse sidene har ikke Mer).
  const pv = P25.styleSection(secTabs(k)).replace(/<span class="p25-pv(?: on)?"[^>]*>(?:<i aria-hidden="true">⋯<\/i>)?<span>Mer<\/span><\/span>/g, '').replace(/<span class="p25-pv(?: on)?"[^>]*><i aria-hidden="true">⋯<\/i><\/span>/g, '');
  return `<div class="sheet-bg" data-p32="nex"></div><div class="pp-sheet p26-fe p32-ne" role="dialog" aria-label="Rediger fanelinjen"><span class="pp-grab"></span>
    <div class="p26-feh"><div><span class="pp-lab">${S.t} · FANELINJE</span><b class="pp-serif">Rediger fanelinjen</b></div><button type="button" class="p30-sb p30-pri" data-p32="nex">Ferdig</button></div>
    <span class="pp-mut" style="font-size:12.5px">${cur.length} av ${max} faner</span>
    <div class="p26-frs">${rows}</div>
    ${pv}
    ${adds.length ? `<span class="pp-lab mut p26-fl">LEGG TIL</span><div class="p26-adds">${adds.map(([id, n, ic]) => `<button data-p32="neadd" data-k="${id}"><span>${esc(ic)}</span>+ ${esc(n)}</button>`).join('')}</div>` : ''}
    <button class="p26-reset" data-p32="nereset">Tilbakestill til standard</button></div>`;
}
/** Innstillinger → Utseende og fanelinje: FANELINJE · ANDRE SIDER. */
export function secNavSettings() {
  const R = [['dom', 'Domener'], ['abo', 'Abonnement'], ['kart', 'Familie']];
  return `<span class="pp-lab p17-gl">FANELINJE · ANDRE SIDER</span><div class="list p17-list p32-secs">${R.map(([k, n]) => `<button type="button" class="opt-row p17-row" data-p32="neopen" data-k="${k}"><span class="m-grow p17-rt"><b>${n}</b><small>${esc(secTabs(k).map(([, x]) => x).join(' · '))}</small></span><span class="sval">Rediger ›</span></button>`).join('')}</div>
    <div class="snote">Hold inne på fanelinjen på siden for å åpne det samme arket. Stilen (tekst eller ikoner) er felles for hele appen.</div>`;
}
const navCtx = (t) => t?.closest?.('.m.papir .pp-nav[data-ctx]');
export function down32(e) {
  NE.fired = false;
  if ((e.button ?? 0) > 0 || NE.k) return;
  const nav = navCtx(e.target), k = nav && SEC_OF[nav.dataset.ctx];
  if (!k || e.target.closest('[data-ppplus], .p25-home, .sb-red, [data-sb="sheet"]')) return;
  NE.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { NE.lp = null; NE.fired = true; NE.k = k; NE.ic = null; haptic('ok'); navigator.vibrate?.(12); draw(); }, 550) };
}
export function move32(e) { if (NE.lp && (Math.abs(e.clientX - NE.lp.x) > 10 || Math.abs(e.clientY - NE.lp.y) > 10)) { clearTimeout(NE.lp.t); NE.lp = null; } }
export function up32() { if (NE.lp) { clearTimeout(NE.lp.t); NE.lp = null; } }
export function leave32() { NE.k = null; NE.ic = null; }

/* =====================================================================
   2. GLIMT I SØKEFELTET: «Send til Chat etter» 5 / 8 / 15 / 30 s
   ===================================================================== */
export const TO_OPTS = [5, 8, 15, 30];
export const hsTimeout = () => { const v = +lsGet('papir_hs_to', 8); return TO_OPTS.includes(v) ? v : 8; };
export function glimtSearchSection() {
  const cur = hsTimeout();
  return `<span class="pp-lab p17-gl">GLIMT I SØKEFELTET</span><div class="list p17-list p27-set p32-hs"><button type="button" class="opt-row p17-row" data-p32="hsto"><span class="m-grow p17-rt"><b>Send til Chat etter</b><small>Enkle oppgaver fullføres i søkefeltet. Tar svaret lengre tid, fortsetter det i Chat.</small></span><span class="p32-seg" aria-label="Velg tid">${TO_OPTS.map((s) => `<i class="${s === cur ? 'on' : ''}">${s} s</i>`).join('')}</span></button></div>`;
}
function hsCycle() {
  const cur = hsTimeout(), nx = TO_OPTS[(TO_OPTS.indexOf(cur) + 1) % TO_OPTS.length];
  lsSet('papir_hs_to', nx); haptic('tab');
  hlApi('/me/layout', { method: 'PUT', json: { hs_timeout_s: nx } }).catch(() => {});
}

/* =====================================================================
   3. Søkefeltet på Hjem: snarveier og logg (ingen «Nylige søk» på mobil)
   ===================================================================== */
const NAV = [
  [/oppdater|nordlys|ny versjon|versjon/, '#/nordlys', 'Nordlys OS · oppdatering'], [/kalender|timeplan/, '#/kal', 'Kalender'],
  [/v(æ|ae)ret? (side|app)|værside|åpne vær/, '#/vaer', 'Vær'], [/innstilling/, '#/set', 'Innstillinger'], [/pakke|sporing|sending/, '#/spor', 'Sporing'],
  [/budsjett/, '#/budsjett', 'Budsjett'], [/kvittering/, '#/kv', 'Kvitteringer'], [/finans|økonomi|saldo|konto/, '#/hjem', 'Finans'],
  [/abonnement|prøveperiode/, '#/sub', 'Abonnement'], [/domene/, '#/dom', 'Domener'], [/familie|posisjon|hvor er/, '#/fam', 'Familie'],
  [/middag|matplan|oppskrift|\bmat\b/, '#/mat', 'Mat'], [/huskeliste|handleliste|todo/, '#/huske', 'Huskeliste'], [/bursdag/, '#/bd', 'Bursdager'], [/\bchat\b/, '#/chat', 'Chat'],
];
// Serverens intent «nav» bruker sidenavn (claude-code-sok-fullfor-forst.md).
export const NAV_T = { nordlys: '#/nordlys', kalender: '#/kal', kal: '#/kal', vaer: '#/vaer', innst: '#/set', innstillinger: '#/set', sporing: '#/spor', budsjett: '#/budsjett', kvitt: '#/kv', kvitteringer: '#/kv', finans: '#/hjem', abo: '#/sub', abonnement: '#/sub', domener: '#/dom', kart: '#/fam', familie: '#/fam', mat: '#/mat', huske: '#/huske', huskeliste: '#/huske', bursdag: '#/bd', bursdager: '#/bd', chat: '#/chat' };
/** {href, label} hvis teksten er en sidesnarvei («vis meg oppdatering», «kalender»), ellers null. */
export function shortcut(q) {
  const n = String(q ?? '').toLowerCase().trim();
  if (!n) return null;
  if (!/^(vis( meg)?|åpne|gå til|ta meg til|hvor (er|finner jeg)|finn)\b/.test(n) && n.split(/\s+/).length > 2) return null;
  const hit = NAV.find(([re]) => re.test(n));
  return hit ? { href: hit[1], label: hit[2] } : null;
}
// Ikke logg passord, koder, kortnummer eller personnummer.
const SECRET = /\b\d{11}\b|\b(?:\d[ -]?){13,19}\b|passord|password|pin-?kode|\b\d{4,8}\b\s*$/i;
/** Logger søket for brukeren (vises bare på web under «Nylige søk»). */
export function hsLog(q, engine = 'glimt') {
  const t = String(q ?? '').trim(); if (!t || SECRET.test(t)) return;
  hlApi('/search-history', { method: 'POST', json: { q: t, engine, device: 'mobil' } })
    .catch((e) => { if (e.status === 404) hlApi('/search/history', { method: 'POST', json: { q: t } }).catch(() => {}); });
}

/* =====================================================================
   4. Hjem-widget h11: Prøveperioder
   ===================================================================== */
const TR = { d: null, t: 0, busy: false, src: '' };
const DOM = { viaplay: 'viaplay.no', netflix: 'netflix.com', 'hbo max': 'max.com', max: 'max.com', 'disney+': 'disneyplus.com', spotify: 'spotify.com', 'tv 2 play': 'tv2.no', storytel: 'storytel.com', bookbeat: 'bookbeat.com', 'apple tv+': 'tv.apple.com', 'youtube premium': 'youtube.com', 'amazon prime': 'amazon.com', audible: 'audible.com', strava: 'strava.com', tidal: 'tidal.com', chatgpt: 'openai.com' };
const domOf = (n) => DOM[String(n ?? '').toLowerCase()] ?? `${String(n ?? 'x').toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`;
const t0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const MS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'], WDS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
function normTrial(x) {
  const end = String(x.end ?? x.endsAt ?? x.ends_at ?? '').slice(0, 10); if (!end) return null;
  const e = new Date(`${end}T00:00`), dd = x.daysLeft ?? x.dd ?? Math.round((e - t0()) / 864e5);
  const st = x.start ?? x.startAt ?? x.startedAt ?? x.started_at ?? x.created_at ?? x.createdAt;
  const s0 = st ? new Date(`${String(st).slice(0, 10)}T00:00`) : new Date(e.getTime() - 14 * 864e5), tot = Math.max(1, Math.round((e - s0) / 864e5));
  const pct = x.progress != null ? Math.round(+x.progress <= 1 ? +x.progress * 100 : +x.progress) : Math.round(((tot - Math.max(0, dd)) / tot) * 100);
  const name = x.n ?? x.name ?? x.service ?? 'Prøve', p = x.p ?? x.price ?? x.priceAfter ?? x.price_after;
  return { id: x.id, n: name, end, e, dd, pct: Math.max(4, Math.min(100, pct)), p, pl: x.priceLabel ?? (p != null && p !== '' ? (typeof p === 'number' ? `${Math.round(p)} kr/mnd` : String(p)) : ''), logo: x.logoUrl ?? x.logo ?? `/finans/api/logo/${x.domain ?? domOf(name)}`, cancelUrl: x.cancelUrl ?? x.cancel_url ?? null, done: x.done || (x.status && x.status !== 'active') };
}
export async function trialsWLoad(force = false) {
  if (TR.busy || (!force && TR.d && Date.now() - TR.t < 60000)) return;
  TR.busy = true; TR.t = Date.now();
  try { const r = await hlApi('/widgets/trials'); TR.d = (Array.isArray(r) ? r : r?.items ?? r?.trials ?? (r?.next ? [r.next, ...(r.more ?? [])] : [])); TR.src = 'w'; TR.empty = r?.emptyText ?? null; }
  catch {
    try { const r = await api('/subscriptions/trials'); TR.d = Array.isArray(r) ? r : r?.items ?? r?.trials ?? []; TR.src = 'f'; }
    catch { TR.d = lsGet('papir_trials', []); TR.src = 'l'; }
  }
  TR.busy = false;
}
const tcol = (d) => (d <= 2 ? '#b23a2a' : d <= 7 ? '#a8661a' : 'var(--pp-ink)');
const lg = (x, s) => `<span class="p32-tlg" style="width:${s}px;height:${s}px"><b>${esc(String(x.n).slice(0, 1).toUpperCase())}</b><img class="p32-li" src="${esc(x.logo)}" alt="" loading="lazy"></span>`;
export function trialsWidget() {
  if (!TR.d && !TR.busy) trialsWLoad().then(() => { if (m.screen === 'hl') draw(); }).catch(() => {});
  const A = (TR.d ?? []).map(normTrial).filter((x) => x && !x.done && x.dd >= 0).sort((a, b) => a.dd - b.dd), top = A[0];
  const head = `<div class="pp-row"><span class="pp-lab">PRØVEPERIODER · ${A.length ? `${A.length} AKTIVE` : 'INGEN'}</span><span class="pp-mut">alle ›</span></div>`;
  if (!top) return `<a class="pp-card p32-trw" href="#/sub">${head}<span class="p32-trn"><span class="pp-mut">${TR.d ? 'Ingen aktive prøver. Skriv «Viaplay gratis i 14 dager» i søket.' : 'Henter prøveperioder …'}</span>${TR.d ? '<button type="button" class="p32-trb" data-p32="tradd">+ Legg til</button>' : ''}</span></a>`;
  const c = tcol(top.dd), when = `${WDS[top.e.getDay()]} ${top.e.getDate()}. ${MS[top.e.getMonth()]}`;
  return `<a class="pp-card p32-trw" href="#/sub">${head}
    <span class="p32-trt">${lg(top, 40)}<span class="m-grow p32-trm"><b class="pp-serif m-ell">${esc(top.n)}</b><span class="pp-mut m-ell">Avslutt før ${esc(when)}${top.pl ? ` · deretter ${esc(top.pl)}` : ''}</span></span><span class="p32-trd" style="color:${c}"><b class="pp-serif">${top.dd}</b><span>${top.dd === 1 ? 'dag igjen' : 'dager igjen'}</span></span></span>
    <span class="p32-trp"><i style="width:${top.pct}%;background:${c}"></i></span>
    ${A.length > 1 ? `<span class="p32-trmore">${A.slice(1, 3).map((x) => `<span>${lg(x, 16)}<b class="m-ell">${esc(x.n)}</b><em style="color:${tcol(x.dd)}">${x.dd} d</em></span>`).join('')}</span>` : ''}
    <span class="p32-trbs"><button type="button" class="p32-trb ink" data-p32="trdone" data-id="${esc(top.id)}">Jeg har avsluttet</button><button type="button" class="p32-trb" data-p32="trkeep" data-id="${esc(top.id)}">Behold</button></span></a>`;
}
async function trialSet(id, status) {
  const L = lsGet('papir_trials', []);
  if (TR.src === 'l' || String(id).startsWith('t') && L.some((x) => String(x.id) === String(id))) { lsSet('papir_trials', L.map((x) => (String(x.id) === String(id) ? { ...x, status } : x))); }
  else {
    const viaW = () => hlApi(`/widgets/trials/${encodeURIComponent(id)}`, { method: 'POST', json: { action: status === 'kept' ? 'kept' : 'done' } });
    const viaF = () => api(`/subscriptions/trials/${encodeURIComponent(id)}`, { method: 'PATCH', json: { status } });
    try { await (TR.src === 'w' ? viaW() : viaF()); } catch (e) { if (e.status !== 404 && e.status !== 405) throw e; await (TR.src === 'w' ? viaF() : viaW()); }
  }
  TR.d = (TR.d ?? []).filter((x) => String(x.id) !== String(id));
  const P31 = await import('./mobile-p31.js'); P31.G.trials = null;
  trialsWLoad(true).then(draw).catch(() => {});
}

/* =====================================================================
   5. Wiggle-knappene: ren stripe når man scroller (claude-code-rediger-knapper-plass.md)
   ===================================================================== */
function pillsStuck() {
  const el = document.querySelector('#app .m-scroll > .p28-pills');
  if (el) el.classList.toggle('p32-stuck', el.getBoundingClientRect().top <= 1);
}

/* =====================================================================
   6. Service worker: ny versjon uten Cmd+Shift+R (claude-code-web-cache-fiks.md)
   ===================================================================== */
function swBoot() {
  const sw = navigator.serviceWorker; if (!sw) return;
  const had = !!sw.controller; // første installasjon (clients.claim) skal ikke laste siden på nytt
  const up = () => sw.getRegistration('/finans/').then((r) => r?.update()).catch(() => {});
  up();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') up(); });
  setInterval(up, 10 * 60000);
  sw.addEventListener('controllerchange', () => {
    if (!had) return;
    let last = 0; try { last = +sessionStorage.getItem('p32_swr') || 0; } catch {}
    if (Date.now() - last < 15000) return; // beskytt mot løkke
    try { sessionStorage.setItem('p32_swr', String(Date.now())); } catch {}
    const ae = document.activeElement, busy = ae && /INPUT|TEXTAREA/.test(ae.tagName) && ae.value;
    if (busy) return; // ulagret tekst: neste åpning får ny versjon
    location.reload();
  });
}

/* =====================================================================
   Kroker fra mobile.js
   ===================================================================== */
let booted = false;
export function boot32() {
  if (booted) return; booted = true;
  swBoot();
  addEventListener('scroll', pillsStuck, { passive: true, capture: true });
  // Logoer som ikke finnes: bokstavmerket under blir stående.
  document.addEventListener('error', (e) => { const t = e.target; if (t?.classList?.contains('p32-li')) t.remove(); }, true);
  document.addEventListener('load', (e) => { const t = e.target; if (t?.classList?.contains('p32-li')) { if (t.naturalWidth && t.naturalWidth < 17) t.remove(); else t.parentElement?.classList.add('ok'); } }, true);
}
export function afterDraw32() { pillsStuck(); }
export const sheets32 = () => secSheet();

export function input32(e, t) {
  if (t.dataset?.p32in !== 'nen' || !NE.k) return false;
  const k = NE.k, cur = secNav(k).map((x) => ({ ...x })), i = +t.dataset.i, v = t.value.trim();
  if (!cur[i]) return true;
  if (v) cur[i].n = v; else delete cur[i].n;
  secSave(k, cur);
  if (e.type === 'change') draw();
  return true;
}
export async function bind32(e, t) {
  if (e.type !== 'click') return false;
  if (NE.fired) { NE.fired = false; e.preventDefault(); e.stopPropagation(); return true; }
  const x = t.closest?.('[data-p32]');
  if (!x) return false;
  e.preventDefault(); e.stopPropagation();
  const a = x.dataset.p32, k = NE.k, cur = k ? secNav(k).map((y) => ({ ...y })) : [], i = +x.dataset.i;
  switch (a) {
    case 'neopen': NE.k = x.dataset.k; NE.ic = null; haptic('tap'); break;
    case 'nex': NE.k = null; NE.ic = null; haptic('ok'); break;
    case 'neic': NE.ic = NE.ic === i ? null : i; break;
    case 'neset': if (cur[i]) { cur[i].ic = x.dataset.g; secSave(k, cur); } NE.ic = null; haptic('tab'); break;
    case 'neup': if (i > 0) { [cur[i - 1], cur[i]] = [cur[i], cur[i - 1]]; secSave(k, cur); haptic('tab'); } break;
    case 'nerm': if (cur.length > 1) { secSave(k, cur.filter((_, j) => j !== i)); NE.ic = null; haptic('tap'); } else { haptic('err'); flash('Minst én fane'); } break;
    case 'neadd': if (cur.length < SECN[k].all.length) { secSave(k, [...cur, { k: x.dataset.k }]); haptic('tab'); } break;
    case 'nereset': lsSet(`papir_nav_${k}`, null); secSave(k, null); NE.ic = null; flash(`Fanelinja i ${SECN[k].t.toLowerCase().replace(/^./, (c) => c.toUpperCase())} er tilbakestilt`); break;
    case 'hsto': hsCycle(); break;
    case 'tradd': location.hash = '#/sub'; return true;
    case 'trdone': try { await trialSet(x.dataset.id, 'cancelled'); haptic('ok'); flash('Markert som avsluttet ✓'); } catch (err) { flash(err.message, 'err'); } break;
    case 'trkeep': try { await trialSet(x.dataset.id, 'kept'); haptic('ok'); flash('Beholdt · lagt til som abonnement ✓'); } catch (err) { flash(err.message, 'err'); } break;
    default: return true;
  }
  draw(); return true;
}
