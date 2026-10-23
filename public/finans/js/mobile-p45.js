// Prompt 45 (PWA45): mobilpunktene i design_handoff_homelab/prompts/prompt-45-pakke/ (kontrakt CONTRACT45.md).
//   1. Glimt-agenten: alle Glimt-felt (Hjem, Gjøremål, Finans, Kalender) går via POST /api/glimt/agent. Spørsmål (ask),
//      bekreftelse (confirm, /api/glimt/agent/confirm) og treff (results) vises der svaret står. 404 → som før (/api/assist).
//   2. Brett (Fold utbrettet, iPad – én felles LayoutMode): skann-knappen med skann-ikon i navbaren, jevnere animasjon på den
//      røde Hjem-knappen, wiggle-knappene (+ · ↺ · ✓) nederst i navbaren, søkefeltet i Glimt-panelet over tastaturet,
//      navbar på Gjøremål, Familie i to kolonner (mobile-p22.js).
//   3. Finans → Mer med samme design som Mer (mobile-p44.js merNew mode 'fin'), Mer: tittel og de fire store boksene.
//   4. Ruter: antall anbefalte reiser (1 · 2 · 3), Vær: «Min posisjon», Sonevarsler (Familie → Soner, Innstillinger → Varsler),
//      Innstillinger samlet (Media, Ruter, Gjøremål …), Helse fra Home Assistant (mobilapp), Glimt-personlighet i AI-kontroll.
// Fasit: design/*.dc.html. Lastes med dynamisk import fra mobile.js (statiske importer herfra er trygge).
import { esc, hlApi, S, n0 } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { HK, tasksLoad } from './mobile-p17.js';
import * as P31 from './mobile-p31.js';
import * as P37 from './mobile-p37.js';
import * as PA3 from './mobile-paper3.js';

const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const svg = (d, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const isAdmin = () => m.me?.role === 'admin' || m.me?.isMainAdmin === true;
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const paper = () => !!document.querySelector('#app > .m.papir');
const NEWER = 'Krever en nyere Homelab-server';
const errMsg = (e) => (e?.status === 404 || e?.status === 405 ? NEWER : e?.message || 'Noe gikk galt');
const sw = (on) => `<span class="p45-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const SCAN_IC = 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8';
const STAR = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.3 6.4 6.7.6-5.1 4.4 1.6 6.6L12 17l-5.5 3.5 1.6-6.6L3 9.5l6.7-.6z" fill="currentColor"/></svg>';

/* =====================================================================
   0. LayoutMode (claude-code-ipad-brettoppsett.md): én felles kilde
   ===================================================================== */
/** Brett: tilgjengelig vindusbredde ≥ 700 px (Fold utbrettet, iPad, også Split View når vinduet er bredt nok). */
export const wide = () => innerWidth >= 700;
/** Navbaren står loddrett til venstre fra 600 px (CSS i mobile.css), som før. */
const railOn = () => innerWidth >= 600;

/* =====================================================================
   1. Glimt-agenten (POST /api/glimt/agent)
   ===================================================================== */
const AG = { miss: false, surf: {} };
const rid = () => { try { return crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, ''); } catch { return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; } };
async function agentCall(text, module, context = {}) {
  if (AG.miss) return null;
  try { return await hlApi('/glimt/agent', { method: 'POST', json: { text: String(text).slice(0, 1000), module, context, requestId: rid() } }); }
  catch (e) { if (e.status === 404 || e.status === 405) { AG.miss = true; return null; } throw e; }
}
const hashOf = (u) => { const s = String(u ?? ''); const i = s.indexOf('#'); return i >= 0 ? s.slice(i) : null; };
/** Svaret fra agenten i samme form som de gamle svarboblene ({text, src, …}) + agent: {results, ask, confirm, actions}. */
export function normAgent(r, module) {
  const acts = Array.isArray(r?.actions) ? r.actions : [];
  return {
    text: r?.reply ?? r?.text ?? '', src: r?.engine === 'lokal' ? 'Glimt · lokal' : 'Glimt', intent: r?.intent ?? '',
    agent: { module, rmod: r?.module ?? module, results: Array.isArray(r?.results) ? r.results : [], ask: r?.ask ?? null, confirm: r?.confirm ?? null, actions: acts },
    navHref: r?.intent === 'nav' ? hashOf(r?.nav?.web) : null,
    failed: acts.some((a) => a.status === 'failed') && !acts.some((a) => a.status === 'done'),
    undo: acts.map((a) => a.result?.undo?.token ?? a.result?.undoToken).find(Boolean) ?? null,
  };
}
export async function agentHome(q) { const r = await agentCall(q, 'home'); return r ? normAgent(r, 'home') : null; }
export async function agentTasks(q, ctx = {}) { const r = await agentCall(q, 'tasks', ctx); return r ? normAgent(r, 'tasks') : null; }
export async function agentFin(q) { const r = await agentCall(q, 'finance'); return r ? normAgent(r, 'finance') : null; }
export async function agentCal(q, ctx = {}) { const r = await agentCall(q, 'calendar', ctx); return r ? normAgent(r, 'calendar') : null; }

// Hvor et oppfølgingssvar (valgt alternativ, bekreftelse) skal vises: samme flate som spørsmålet kom fra.
const SURF = {
  home: { busy: (q) => { P31.G.ans = { q, busy: true }; }, set: (A, q) => { P31.G.ans = { q, busy: false, ...A }; } },
  tasks: { busy: () => { P37.G7.gBusy = 'Glimt tenker …'; P37.G7.gAns = null; }, set: (A) => { P37.G7.gBusy = ''; P37.G7.gAns = { text: A.text, res: [], undo: null, at: Date.now(), chat: false, agent: A.agent }; HK.t = 0; tasksLoad(true).then(draw).catch(() => {}); } },
  fin: { busy: () => { PA3.FS.busy = true; }, set: (A, q) => { PA3.FS.busy = false; PA3.FS.r = { q, agent45: A, mode: 'agent' }; } },
  cal: { busy: (q) => { CAL.a = { q, busy: true, A: null }; }, set: (A, q) => { CAL.a = { q, busy: false, A }; import('./mobile-kal.js').then((K) => K.kalLoad?.(true)).then(draw).catch(() => {}); } },
};
const MOD = { home: 'home', tasks: 'tasks', fin: 'finance', cal: 'calendar' };
const resWhen = (x) => [x.date ? new Date(`${x.date}T12:00`).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }) : '', x.time ?? ''].filter(Boolean).join(' ');
const kr = (v) => (v == null || v === '' ? '' : `${Number(v) < 0 ? '−' : ''}${n0(v)} kr`);
/** Resultatkort, spørsmål med valg og bekreftelse (ingenting er slettet før «Bekreft»). */
export function agentExtra(A, sid) {
  const G = A?.agent; if (!G) return '';
  if (A.q == null) A.q = sid === 'fin' ? PA3.FS.r?.q : sid === 'tasks' ? P37.G7.lastQ : sid === 'cal' ? CAL.a?.q : P31.G.ans?.q;
  AG.surf[sid] = A;
  let h = '';
  if (G.results?.length) h += `<div class="p45-ares" role="list">${G.results.slice(0, 8).map((x, i) => `<button type="button" role="listitem" class="p45-ar" data-p45="ares" data-sid="${sid}" data-i="${i}"><span class="p45-ark k-${esc(x.kind ?? '')}" aria-hidden="true">${{ event: '◷', task: '☑', receipt: '▤', transaction: '≡', category: '◔' }[x.kind] ?? '•'}</span><span class="m-grow"><b class="m-ell">${esc(x.title ?? '')}</b><small class="m-ell">${esc(x.subtitle || resWhen(x))}</small></span>${x.amount != null ? `<span class="p45-ara">${esc(kr(x.amount))}</span>` : '<span aria-hidden="true">›</span>'}</button>`).join('')}${G.results.length > 8 ? `<small class="p45-amut">+ ${G.results.length - 8} til</small>` : ''}</div>`;
  if (G.ask) { const same = String(G.ask.question ?? '').trim() === String(A.text ?? '').replace(/\*\*/g, '').trim(); h += `<div class="p45-aask">${same ? '' : `<b>${esc(G.ask.question ?? '')}</b>`}${(G.ask.options ?? []).length ? `<div class="p45-aopts">${G.ask.options.slice(0, 6).map((o, i) => `<button type="button" class="p45-aopt" data-p45="aopt" data-sid="${sid}" data-i="${i}">${esc(o.label ?? o.id)}</button>`).join('')}</div>` : ''}<form class="p45-aform" data-p45f="aans" data-sid="${sid}"><input name="a" placeholder="Svar Glimt …" autocomplete="off" enterkeyhint="send" aria-label="Svar Glimt"><button type="submit" aria-label="Send">${svg('M12 19V5M5 12l7-7 7 7', 15, 2.6)}</button></form></div>`; }
  if (G.confirm) h += `<div class="p45-aconf"><b>${esc(G.confirm.summary ?? 'Er du sikker?')}</b><div class="p45-aopts"><button type="button" class="p45-aopt" data-p45="acx" data-sid="${sid}">Avbryt</button><button type="button" class="p45-aopt red" data-p45="aconf" data-sid="${sid}">Bekreft</button></div></div>`;
  return h;
}
/** Finans → Søk med ✦ Glimt: eget kort over treffene. */
export function agentCard(A, sid) {
  return `<div class="pp-card pp-aians p45-agc"><span class="pp-lab">✦ GLIMT</span><span class="pp-serif">${P31.bold(A.text || (A.agent?.results?.length ? `Fant ${A.agent.results.length} treff.` : 'Fant ingenting som passer.'))}</span>${agentExtra(A, sid)}</div>`;
}
async function agentFollow(sid, run, q) {
  const S0 = SURF[sid]; if (!S0) return;
  S0.busy(q); draw();
  try { const r = await run(); if (r) S0.set(normAgent(r, MOD[sid]), q); else S0.set({ text: NEWER, agent: null }, q); haptic('ok'); }
  catch (e) { S0.set({ text: e.status === 404 ? 'Bekreftelsen har gått ut. Spør Glimt på nytt.' : e.status === 409 ? 'Dette er allerede gjort.' : `Fikk ikke til: ${e.message}`, src: 'Glimt', err: true }, q); haptic('err'); }
  draw();
}
async function openResult(x) {
  haptic('tap');
  if (x.kind === 'event') { location.hash = '#/kal'; return; }
  if (x.kind === 'task') { location.hash = '#/huske'; setTimeout(() => globalThis.P44?.vwOpen?.(x.id), 120); return; }
  const tx = x.kind === 'transaction' ? x.id : x.txId ?? x.transactionId;
  if (tx != null) { m.sel = String(tx); m.detail = true; m.edit = false; location.hash = '#/liste'; draw(); return; }
  if (x.kind === 'receipt') { location.hash = '#/kv'; return; }
  if (x.kind === 'category') { location.hash = '#/budsjett'; }
}

/* ---------- Kalender: Glimt-feltet (POST /api/glimt/agent, module:'calendar') ---------- */
const CAL = { a: null };
/** Kalender/rask time: true når agenten tok forespørselen (også ved feil), false = eldre server (bruk /kalender/quick). */
export async function agentCalRun(text, drop) {
  let A;
  try { A = await agentCal(text, { selectedId: globalThis.KAL45?.sel?.() ?? undefined }); }
  catch (e) { drop(); P31.aiDone(e.status === 429 ? 'Glimt har mye å gjøre akkurat nå. Prøv igjen om litt.' : `Fikk ikke til: ${String(e.message ?? '').slice(0, 60)}`, { ms: 4500 }); haptic('err'); return true; }
  if (!A) return false;
  drop();
  import('./mobile-kal.js').then((K) => K.kalLoad?.(true)).then(() => { if (m.screen === 'kal' || m.screen === 'hl') draw(); }).catch(() => {});
  const G = A.agent;
  if (G.ask || G.confirm || (G.results?.length && !G.actions.some((x) => x.status === 'done'))) { A.q = text; CAL.a = { q: text, busy: false, A }; haptic('tap'); draw(); return true; }
  haptic(A.failed ? 'err' : 'ok'); P31.aiDone(String(A.text || 'Ferdig').replace(/\*\*/g, '').slice(0, 120), { ms: 4500 });
  return true;
}
function calSheet() {
  const C = CAL.a; if (!C) return '';
  const A = C.A;
  return `<div class="p44-scrim" data-p45="calx"></div><div class="pp-sheet p45-calsh" role="dialog" aria-modal="true" aria-label="Glimt · Kalender"><span class="pp-grab"></span>
    <div class="p45-swh"><span class="p45-ck2">✦ GLIMT · KALENDER</span><button type="button" class="p44-done" data-p45="calx">Lukk</button></div>
    <span class="p45-amut m-ell">«${esc(C.q)}»</span>${C.busy ? '<div class="m-spin"></div>' : `<b class="p45-calt">${P31.bold(A?.text ?? '')}</b>${A ? agentExtra(A, 'cal') : ''}`}</div>`;
}

/* =====================================================================
   2. Brett: navbaren (skann, Hjem-knapp, wiggle) og søkefeltet over tastaturet
   ===================================================================== */
// Skann-knappen hører ikke hjemme på Kart, Aksjer, Mer, Bibelvers, Nordlys og Innstillinger (claude-code-fold-skann-i-navbar.md).
const NO_SCAN = ['aks', 'mer', 'fmer', 'bibel', 'nordlys', 'set', 'kart'];
let hadHome = null, edWas = false, homeBusy = false, homeIn = 0, homeOut = 0;
function railAfter(root) {
  const nav = root.querySelector(':scope > .pp-nav'), on = railOn() && paper() && !!nav;
  root.classList.toggle('p45-rail', on);
  root.classList.remove('p45-rs', 'p45-edr');
  if (!on) { hadHome = null; edWas = false; return; }
  // Rød Hjem-knapp: vokser inn (320 ms, lett fjæring) når man forlater Hjem.
  const hb = nav.querySelector('.p25-home');
  if (hb && hadHome === false) homeIn = Date.now();
  const dt = Date.now() - homeIn;
  if (hb && dt < 330) { hb.classList.add(reduce() ? 'p45-fade' : 'p45-in'); hb.style.animationDelay = `-${dt}ms`; } // en ny tegning midt i animasjonen fortsetter der den var
  if (hb && homeBusy) { const d2 = Date.now() - homeOut; hb.classList.remove('p45-in', 'p45-fade'); hb.classList.add(reduce() ? 'p45-outf' : 'p45-out'); hb.style.animationDelay = `-${d2}ms`; }
  hadHome = !!hb;
  if (nav.matches('.p21-fnav, .sb-nav')) return; // Familie og Abonnementer har egne knapper
  const E = PA3.edState?.();
  if (E && m.screen === 'hl') {
    // Wiggle: knappene ligger nederst i navbaren (ikke øverst, der de kolliderte med headeren). Skann skjules.
    root.classList.add('p45-edr', 'p45-rs');
    const box = document.createElement('div');
    box.className = `p45-redit${edWas ? '' : ' pop'}`;
    box.innerHTML = `<button type="button" class="p45-rb glass" data-ped="add" aria-label="Legg til widget${E.hidden ? ` (${E.hidden} skjult)` : ''}">${svg('M12 5v14M5 12h14', 20, 2.6)}${E.hidden ? `<b>${E.hidden}</b>` : ''}</button>${E.changed ? `<button type="button" class="p45-rb glass" data-p45="edreset" aria-label="Tilbakestill oppsettet">${svg('M3 12a9 9 0 1 0 3-6.7M3 4v5h5', 19, 2.4)}</button>` : ''}<button type="button" class="p45-rb lab" data-ped="done" aria-label="Ferdig">${svg('M5 12.5l4.5 4.5L19 7.5', 21, 2.8)}</button>`;
    nav.appendChild(box); edWas = true;
    nav.querySelectorAll('.pp-scan').forEach((b) => { b.style.display = 'none'; });
    return;
  }
  edWas = false;
  if (NO_SCAN.includes(m.screen)) { root.classList.add('p45-rs'); return; } // ingen flytende skann heller
  // Skann-knappen flyttes inn i navbaren (46 px, aksentfarge, skann-ikon). Trykk = valg, hold inne = last opp direkte (samme data-ppplus).
  const inNav = nav.querySelector('.pp-scan[data-ppplus]'), fab = root.querySelector(':scope > .pp-fab[data-ppplus]');
  if (inNav) { inNav.classList.add('p45-rscan'); inNav.innerHTML = svg(SCAN_IC, 22, 2.2); return; }
  if (!fab) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pp-scan p45-rscan'; b.dataset.ppplus = fab.dataset.ppplus;
  b.setAttribute('aria-label', fab.getAttribute('aria-label') ?? 'Skann'); b.title = fab.title || 'Skann';
  b.innerHTML = fab.dataset.ppplus === 'spor' || fab.dataset.ppplus === 'dom' ? svg('M12 5v14M5 12h14', 22, 2.4) : svg(SCAN_IC, 22, 2.2);
  nav.appendChild(b); root.classList.add('p45-rs');
}
/** Trykk på den røde Hjem-knappen: krymper og tones ut (200 ms), sidebyttet starter etter ca. 190 ms. Doble trykk ignoreres. */
function homeClick(e) {
  const a = e.target.closest?.('.p25-home'); if (!a || !railOn()) return;
  e.preventDefault(); e.stopPropagation();
  if (homeBusy) return;
  homeBusy = true; homeOut = Date.now(); haptic('tap');
  a.classList.remove('p45-in', 'p45-fade'); a.classList.add(reduce() ? 'p45-outf' : 'p45-out');
  setTimeout(() => { homeBusy = false; const h = a.getAttribute('href') || '#/hl'; if (location.hash !== h) location.hash = h; else draw(); }, reduce() ? 120 : 190);
}
/** Gjøremål på brett: samme navbar som Hjem (rød Hjem-knapp, faner, skann nederst). */
export function huskeRail(navFn) { return railOn() && paper() ? navFn() : ''; }

/* Tastaturet: søkefeltet i Glimt-panelet (Fold/iPad) og «Ny oppgave …» løftes over tastaturet (visualViewport). */
let kbT = 0;
function kbSync() {
  const vv = window.visualViewport, root = document.querySelector('#app > .m'); if (!vv || !root) return;
  const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
  const ae = document.activeElement, inPanel = !!ae?.closest?.('.p41-fmain'), on = kb > 80 && inPanel;
  root.style.setProperty('--p45kb', `${on ? kb : 0}px`);
  root.classList.toggle('p45-kb', on);
  if (on) { cancelAnimationFrame(kbT); kbT = requestAnimationFrame(() => { if (window.scrollY) window.scrollTo(0, 0); }); }
}

/* =====================================================================
   3. Finans → Mer (samme komponent som Mer, mode 'fin')
   ===================================================================== */
function finRows() {
  const s = S.summary, D = PA3.FM.d ?? {}, rv = PA3.rcNum(), acc = S.boot?.accounts ?? [];
  const bal = acc.reduce((a, x) => a + (x.balance ?? 0), 0), rec = (Array.isArray(D.rec) ? D.rec : D.rec?.items ?? []).filter((r) => r.active !== false);
  const nx = rec.map((r) => ({ r, d: Date.parse(r.next ?? r.nextDate ?? r.due ?? '') })).filter((x) => !isNaN(x.d) && x.d >= Date.now() - 864e5).sort((a, b) => a.d - b.d)[0];
  const st = D.stocks?.summary, dirs = Array.isArray(D.dirs) ? D.dirs : D.dirs?.items ?? null;
  const pctB = s?.budgetTotal ? Math.round(((s.spent ?? (s.budgetTotal - (s.left ?? 0))) / s.budgetTotal) * 100) : null;
  const dLeft = (() => { const n = new Date(), e = new Date(n.getFullYear(), n.getMonth() + 1, 0); return e.getDate() - n.getDate(); })();
  const mon = new Date().toLocaleDateString('nb-NO', { month: 'long' }).replace(/^./, (c) => c.toUpperCase());
  const banks = [...new Set(acc.map((a) => a.bank ?? a.institution ?? a.name).filter(Boolean))].slice(0, 2).join(' · ');
  const nxD = nx ? Math.round((nx.d - Date.now()) / 864e5) : null;
  const live = {
    saldo: { k: 'Disponibelt', v: acc.length ? `${bal < 0 ? '−' : ''}${n0(bal)} kr` : '–', s: banks || (acc.length ? `${acc.length} kontoer` : 'Ingen kontoer ennå'), row: acc.length ? `${n0(bal)} kr disponibelt` : 'Ingen kontoer ennå' },
    budsjett: pctB != null ? { k: mon, v: `${pctB} %`, s: `brukt · ${dLeft} dager igjen`, row: `${pctB} % brukt i ${mon.toLowerCase()}` } : { k: '', v: '', s: 'Ikke satt opp', row: 'Ikke satt opp' },
    kv: { k: '', v: String(rv ?? 0), s: rv ? 'til gjennomgang' : 'Ingen til gjennomgang', row: rv ? `${rv} til gjennomgang` : 'Ingen til gjennomgang', big: true },
    fast: nx ? { k: 'Neste', v: String(nx.r.name ?? nx.r.merchant ?? nx.r.description ?? 'Trekk'), s: `${nxD <= 0 ? 'i dag' : nxD === 1 ? 'i morgen' : `om ${nxD} dager`}${nx.r.amount != null ? ` · ${n0(nx.r.amount)} kr` : ''}`, row: `${nx.r.name ?? nx.r.merchant ?? 'Neste trekk'} ${nxD <= 0 ? 'i dag' : nxD === 1 ? 'i morgen' : `om ${nxD} d`}` } : { k: '', v: '', s: D.rec ? 'Ingen trekk de neste dagene' : 'Neste 30 dager', row: 'Neste 30 dager' },
  };
  const inTabs = PA3.finScreens?.() ?? [];
  const R = [
    { k: 'saldo', n: 'Saldo', s: live.saldo.row, href: 'konto' }, { k: 'budsjett', n: 'Budsjett', s: live.budsjett.row }, { k: 'kv', n: 'Kvitteringer', s: live.kv.row }, { k: 'fast', n: 'Faste trekk', s: live.fast.row },
    { k: 'aks', n: 'Aksjer', s: st ? `${n0(st.value ?? st.total ?? 0)} kr` : D.stocks?.configured === false ? 'Ikke koblet til' : 'Portefølje og kurser' },
    { k: 'finn', n: 'Finn', s: 'Kjøp og salg med Fiks ferdig' }, { k: 'dir', n: 'Boliger', s: dirs ? `${dirs.length} ${dirs.length === 1 ? 'bolig' : 'boliger'}` : 'Utgifter per bolig' },
    { k: 'sub', n: 'Abonnement', s: D.sub ? `${n0(D.sub.monthly ?? 0)} kr/mnd` : 'Abonnementer og prøveperioder' }, { k: 'liste', n: 'Transaksjoner', s: 'Alle kontoer' },
    { k: 'konto', n: 'Kontoer', s: banks || `${acc.length} kontoer` }, { k: 'imp', n: 'Import', s: 'Bank, CSV og e-post' }, { k: 'rap', n: 'Rapporter', s: 'Måned og år' },
    { k: 'set', n: 'Innstillinger', s: 'Kategorier, regler og fanelinje' },
  ].filter((r) => ['saldo', 'budsjett', 'kv', 'fast', 'set'].includes(r.k) || !inTabs.includes(r.k));
  return { R, live };
}
function finMer() {
  if (!globalThis.P44?.merNew) return null;
  if (!PA3.FM.d && !finMer.t) { finMer.t = Date.now(); PA3.fmerLoad?.().then(() => { if (m.screen === 'fmer') draw(); }).catch(() => {}); }
  const { R, live } = finRows();
  return globalThis.P44.merNew(R, { mode: 'fin', live, setHref: '#/set' });
}

/* =====================================================================
   4. Ruter: antall anbefalte reiser (1 · 2 · 3, standard 2)
   ===================================================================== */
const RU = { n: Math.min(3, Math.max(1, +(ls.get('papir_reco_n', 2) ?? 2) || 2)), loaded: false, menu: false };
export const recoN = () => RU.n;
async function recoLoad() { if (RU.loaded) return; RU.loaded = true; try { const s = await hlApi('/ruter/settings'); if ([1, 2, 3].includes(+s?.recoCount)) { RU.n = +s.recoCount; ls.set('papir_reco_n', RU.n); if (['avg', 'hl', 'set'].includes(m.screen)) draw(); } } catch {} }
async function recoSet(n) {
  if (![1, 2, 3].includes(n) || n === RU.n) return;
  RU.n = n; ls.set('papir_reco_n', n); haptic('tap'); draw();
  try { await hlApi('/ruter/settings', { method: 'PUT', json: { recoCount: n } }); } catch (e) { if (e.status !== 404) flash(e.message); }
}
export const recoSeg = () => `<div class="p45-seg" role="radiogroup" aria-label="Antall anbefalte reiser">${[1, 2, 3].map((n) => `<button type="button" role="radio" aria-checked="${RU.n === n}" class="${RU.n === n ? 'on' : ''}" data-p45="reco" data-n="${n}">${n}</button>`).join('')}</div>`;
/** ⋯ på kortet «Anbefalt for min reise». */
export const recoMenuBtn = () => `<button type="button" class="p45-rmb" data-p45="recomenu" aria-expanded="${RU.menu}" aria-label="Valg for anbefalte reiser">⋯</button>${RU.menu ? `<div class="p45-rmenu" role="dialog" aria-label="Antall anbefalte reiser"><span class="p45-rml">ANTALL ANBEFALTE REISER</span>${recoSeg()}<small>Samme valg i Innstillinger → Ruter.</small></div>` : ''}`;

/* =====================================================================
   5. Vær: «Min posisjon» (enheten som har appen åpen)
   ===================================================================== */
const HERE = { st: ls.get('p45_geo', null), pos: null, d: null, at: 0, busy: false, err: '', perm: null };
const near = (a, b) => a && b && a.lat != null && b.lat != null && Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180)) < 2;
async function permState() { try { const p = await navigator.permissions?.query?.({ name: 'geolocation' }); HERE.perm = p?.state ?? null; p && (p.onchange = () => { HERE.perm = p.state; draw(); }); } catch { HERE.perm = null; } }
function hereFetch(sel, force = false) {
  if (HERE.busy || !('geolocation' in navigator)) return;
  if (!force && HERE.at && Date.now() - HERE.at < 600000) return; // maks hvert 10. min
  HERE.busy = true;
  navigator.geolocation.getCurrentPosition(async (p) => {
    HERE.pos = { lat: p.coords.latitude, lon: p.coords.longitude }; HERE.st = 'on'; ls.set('p45_geo', 'on');
    const qs = new URLSearchParams({ lat: HERE.pos.lat.toFixed(3), lon: HERE.pos.lon.toFixed(3) });
    if (sel?.lat != null) { qs.set('selLat', sel.lat); qs.set('selLon', sel.lon); }
    try { HERE.d = await hlApi(`/weather/here?${qs}`); HERE.err = ''; } catch (e) { HERE.err = e.status === 404 ? 'miss' : e.message; }
    HERE.at = Date.now(); HERE.busy = false; if (m.screen === 'vaer') draw();
  }, (err) => { HERE.busy = false; HERE.at = Date.now(); HERE.st = err.code === 1 ? 'denied' : 'err'; ls.set('p45_geo', HERE.st === 'denied' ? 'denied' : null); if (m.screen === 'vaer') draw(); }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 12000 });
}
const PIN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3L3 10.5l7.5 2.5L13 21z"/></svg>';
export function hereLabel(sel) { return HERE.d && !HERE.d.sameAsSelected && !near(HERE.pos, sel) ? 'VALGT STED' : 'MIN POSISJON'; }
export function hereCard(sel) {
  if (!('geolocation' in navigator)) return '';
  if (HERE.perm === null && !permState.t) { permState.t = 1; permState().then(() => { if (HERE.perm === 'granted' || HERE.st === 'on') hereFetch(sel); else draw(); }); }
  if (HERE.st === 'on' || HERE.perm === 'granted') hereFetch(sel);
  const denied = HERE.perm === 'denied' || HERE.st === 'denied';
  if (HERE.err === 'miss') return '';
  if (denied || (HERE.perm !== 'granted' && HERE.st !== 'on')) {
    return `<div class="vx-card p45-here off"><span class="p45-wk">${PIN}MIN POSISJON</span><span class="p45-ht">${denied ? 'Posisjon er slått av for appen. Slå den på i nettleserens innstillinger for å se været der du er.' : 'Slå på posisjon for å se været der du er'}</span>${denied ? '' : '<button type="button" class="p45-hb" data-p45="geo">Tillat</button>'}</div>`;
  }
  const D = HERE.d;
  if (!D) return `<div class="vx-card p45-here"><span class="p45-wk">${PIN}MIN POSISJON</span><span class="p45-ht">${HERE.busy ? 'Finner posisjonen din …' : HERE.err ? esc(HERE.err) : 'Henter været der du er …'}</span></div>`;
  if (D.sameAsSelected || near(HERE.pos, sel)) return ''; // valgt sted = min posisjon (innen 2 km): bare ett kort
  const n = D.now ?? {}, t = D.today ?? {};
  return `<div class="vx-card p45-here" role="group" aria-label="Været der du er: ${esc(D.place?.name ?? '')}"><span class="p45-wk">${PIN}${esc(D.label ?? 'MIN POSISJON')}</span><span class="p45-hrow"><span class="m-grow"><b class="p45-hn">${esc(D.place?.name ?? 'Her')}</b><small>${esc(n.text ?? '')}${t.hi != null ? ` · H:${Math.round(t.hi)}°  L:${Math.round(t.lo)}°` : ''}</small></span>${/^(\/|https?:)/.test(String(n.icon ?? '')) ? `<img class="p45-hi" src="${esc(n.icon)}" alt="" width="34" height="34">` : ''}<b class="p45-htemp">${n.temp != null ? `${Math.round(n.temp)}°` : '–'}</b></span></div>`;
}

/* =====================================================================
   6. Sonevarsler (Familie → Soner, Innstillinger → Varsler → Familie)
   ===================================================================== */
const ZA = { d: null, t: 0, miss: false, busy: false, demo: null, demoT: null };
async function zaLoad(force = false) {
  if (ZA.miss || ZA.busy || (!force && ZA.d && Date.now() - ZA.t < 60000)) return;
  ZA.busy = true;
  try { ZA.d = await hlApi('/family/zone-alerts'); } catch (e) { if (e.status === 404) ZA.miss = true; }
  ZA.busy = false; ZA.t = Date.now();
  if (m.screen === 'fam' || m.screen === 'set') draw();
}
async function zaPut(patch, local) {
  if (!ZA.d) return;
  local(ZA.d); haptic('tap'); draw();
  try { const r = await hlApi('/family/zone-alerts', { method: 'PUT', json: patch }); if (r && typeof r === 'object') ZA.d = r; draw(); }
  catch (e) { flash(errMsg(e)); zaLoad(true); }
}
const ini2 = (n) => String(n ?? '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
export function zoneAlertsCard() {
  zaLoad();
  if (ZA.miss || !ZA.d) return '';
  const D = ZA.d, on = D.on !== false, ppl = D.people ?? [];
  return `<div class="f22-card p45-za"><button type="button" class="p45-zr main" data-p45="zaon" role="switch" aria-checked="${on}"><span class="m-grow"><b>Posisjonsvarsler</b><small>${on ? `Varsler når noen kommer eller går${ppl.length ? ` · ${ppl.filter((p) => p.on !== false).length} av ${ppl.length} personer` : ''}` : 'Av · ingen varsler om soner'}</small></span>${sw(on)}</button>
    <div class="p45-zpl${on ? '' : ' dim'}">${ppl.map((p) => `<button type="button" class="p45-zr" data-p45="zap" data-id="${esc(p.id)}" role="switch" aria-checked="${on && p.on !== false}" ${on ? '' : 'disabled'}><span class="p45-zav" style="background-color:${esc(p.color ?? '#3b5d8a')}${p.avatar ? `;background-image:url('${esc(p.avatar)}')` : ''}">${p.avatar ? '' : esc(p.initials ?? ini2(p.name))}</span><span class="m-grow"><b>${esc(p.name ?? '')}</b></span>${sw(on && p.on !== false)}</button>`).join('') || '<small class="p45-zmut">Ingen andre deler posisjon med deg ennå.</small>'}</div>
    <button type="button" class="p45-zdemo" data-p45="zademo">Vis eksempel på varsel</button></div>`;
}
/** Innstillinger → Varsler → Familie → Sonevarsler: hovedbryter + per sone (soneikon og farge). */
export function zoneAlertsSettings() {
  zaLoad();
  if (ZA.miss) return '';
  if (!ZA.d) return '<span class="pp-lab p17-gl">FAMILIE · SONEVARSLER</span><div class="list p17-list"><div class="m-spin"></div></div>';
  const D = ZA.d, on = D.on !== false, Z = D.zones ?? [];
  return `<span class="pp-lab p17-gl">FAMILIE · SONEVARSLER</span><div class="list p17-list p45-zaset">
    <button type="button" class="opt-row p17-row p45-zr main" data-p45="zaon" role="switch" aria-checked="${on}"><span class="m-grow p17-rt"><b>Varsle når noen kommer eller går</b><small>${on ? 'På · velg soner under' : 'Av · ingen sonevarsler sendes'}</small></span>${sw(on)}</button>
    ${Z.map((z) => `<button type="button" class="opt-row p17-row p45-zr${on ? '' : ' dim'}" data-p45="zaz" data-id="${esc(z.id)}" role="switch" aria-checked="${on && z.on !== false}" ${on ? '' : 'disabled'}><span class="p45-zic" style="background:${esc(z.color ?? '#2b5d8a')}">${z.iconUrl ? `<img src="${esc(z.iconUrl)}" alt="" width="22" height="22">` : esc(String(z.name ?? '?').slice(0, 1))}</span><span class="m-grow p17-rt"><b>${esc(z.name ?? '')}</b></span>${sw(on && z.on !== false)}</button>`).join('')}
    <button type="button" class="opt-row p17-row" data-p45="zademo"><span class="m-grow p17-rt"><b>Vis eksempel på varsel</b><small>Slik ser varselet ut med soneikonet</small></span><span class="p17-chev" aria-hidden="true">›</span></button></div>
    <div class="snote">Gjelder varslene du får. Hvem som deler posisjon endres ikke. Varselvelgeren per person på hver sone gjelder fortsatt når bryterne er på.</div>`;
}
/** Banneret i appen ser ut som iOS-varselet: soneikon i sonefarge, lite app-merke, tittel = sone, tekst = hendelse. */
function zoneBanner() {
  const B = ZA.demo; if (!B) return '';
  return `<button type="button" class="p45-zban" data-p45="zabx" role="status" aria-live="polite"><span class="p45-zbi" style="background:${esc(B.color ?? '#2b5d8a')}">${/^(\/|https?:)/.test(String(B.iconUrl ?? '')) ? `<img src="${esc(B.iconUrl)}" alt="" width="26" height="26">` : svg('M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6', 24, 2)}<span class="p45-zbb" aria-hidden="true">${B.badge && /^\/|^https?:/.test(B.badge) ? `<img src="${esc(B.badge)}" alt="">` : 'H'}</span></span><span class="m-grow"><span class="p45-zbh"><b>${esc(B.title ?? 'Hjem')}</b><small>nå</small></span><span class="p45-zbt">${esc(B.body ?? '')}</span></span></button>`;
}
export function showZoneBanner(B) { ZA.demo = B; clearTimeout(ZA.demoT); ZA.demoT = setTimeout(() => { ZA.demo = null; draw(); }, 4500); haptic('tap'); draw(); }

/* =====================================================================
   7. Innstillinger samlet + Ruter + Media + AI-personlighet
   ===================================================================== */
/** Innstillinger → MODULER: én rad per modul (de egne innstillingssidene i modulene er fjernet). */
export function modGroup(grp, row) {
  return grp('MODULER', [
    row('#/set/media', 'Media', 'Varsler, Kalender, avspilling og tjenester', '', 'look', 'media45'),
    row('#/set/ruter', 'Ruter', `Anbefalte reiser: ${RU.n} · Min reise på Hjem`, '', 'globe', 'ruter45'),
    row('#/vaer', 'Vær', 'Steder, Min posisjon og varsler', '', 'look', 'vaer45'),
    row('#/set/nyheter', 'Nyheter', 'Kilder, kategorier og Glimt-sammendrag', '', 'list', 'nyheter46'), // prompt 46: flyttet fra Nyheter-siden
    row('#/studie', 'Studie', 'Vitnemål, karakterer og dokumenter', '', 'list', 'studie45'),
  ]);
}
export function mediaSet() {
  const MD = globalThis.P43?.media;
  if (!MD?.mediaSetBody) return '<div class="m-spin"></div>';
  return `${MD.mediaSetBody()}<a class="opt-row p17-row p44-hlink" href="#/media"><span class="m-grow p17-rt"><b>Åpne Media</b><small>Kommer snart, Sonarr, Radarr, qBittorrent og Prowlarr</small></span><span class="p17-chev" aria-hidden="true">›</span></a>`;
}
export function ruterSet() {
  recoLoad();
  return `<span class="pp-lab p17-gl">MIN REISE</span><div class="list p17-list p45-rset"><div class="opt-row p17-row p45-rsrow"><span class="m-grow p17-rt"><b>Antall anbefalte reiser</b><small>Kortet «Anbefalt for min reise» viser nøyaktig så mange</small></span>${recoSeg()}</div></div>
    <div class="snote">Samme valg brukes på Ruter-siden og Hjem-kortet, og synkes mellom enhetene dine. Er det færre avganger enn valgt, vises det som finnes.</div>
    <a class="opt-row p17-row p44-hlink" href="#/avg"><span class="m-grow p17-rt"><b>Åpne Ruter</b><small>Avganger og Min reise</small></span><span class="p17-chev" aria-hidden="true">›</span></a>`;
}
/* Glimt-personlighet (AI-kontroll): Av · Litt · Full rakker. GET/PUT /api/glimt/agent/settings. */
const PERS = { v: ls.get('p45_pers', 'little'), loaded: false, miss: false };
async function persLoad() { if (PERS.loaded) return; PERS.loaded = true; try { const r = await hlApi('/glimt/agent/settings'); if (r?.personality) { PERS.v = r.personality; ls.set('p45_pers', PERS.v); if (m.screen === 'aictl') draw(); } } catch (e) { if (e.status === 404) { PERS.miss = true; if (m.screen === 'aictl') draw(); } } }
export function persCard() {
  persLoad();
  if (PERS.miss) return '';
  const O = [['off', 'Av'], ['little', 'Litt'], ['full', 'Full rakker']];
  return `<div class="p45-pers"><span class="pp-lab">GLIMT · PERSONLIGHET</span><div class="p45-perc"><b>Personlighet</b><small>En god nordmann og monarkist – og en liten rakker. Bekreftelsen kommer alltid først, maks én kort spøk, aldri ved feil, sletting eller økonomi.</small>
    <div class="p45-seg wide" role="radiogroup" aria-label="Personlighet">${O.map(([k, n]) => `<button type="button" role="radio" aria-checked="${PERS.v === k}" class="${PERS.v === k ? 'on' : ''}" data-p45="pers" data-k="${k}">${n}</button>`).join('')}</div></div></div>`;
}

/* =====================================================================
   Krokene fra mobile.js
   ===================================================================== */
export function view45(scr, sub, pp) {
  if (pp && scr === 'fmer') return finMer();
  if (scr === 'set' && sub === 'media') return mediaSet();
  if (scr === 'set' && sub === 'ruter') return ruterSet();
  if (scr === 'set' && sub === 'helseha') return globalThis.P45H?.haView?.() ?? '<div class="m-spin"></div>';
  return null;
}
export function layer45() { return zoneBanner() + calSheet() + (globalThis.P45H?.layer?.() ?? ''); }
export function afterDraw45() {
  const root = document.querySelector('#app > .m'); if (!root) return;
  root.classList.toggle('p45-and', /Android/i.test(navigator.userAgent));
  root.classList.toggle('p45-w', wide());
  root.classList.toggle('p45-hk', m.screen === 'huske');
  root.classList.toggle('p45-fmerpg', m.screen === 'fmer');
  railAfter(root);
  kbSync();
  if (m.screen !== 'avg') RU.menu = false;
  globalThis.P45H?.after?.(root);
}
export function load45(scr, sub) {
  if (scr === 'avg' || scr === 'hl' || (scr === 'set' && sub === 'ruter')) recoLoad();
  if (scr === 'fam' || (scr === 'set' && sub === 'varsler')) return zaLoad();
  if (scr === 'aictl') persLoad();
  return globalThis.P45H?.load?.(scr, sub) ?? null;
}
export async function bind45(e, t) {
  if (globalThis.P45H && await globalThis.P45H.bind(e, t)) return true;
  const x = t.closest?.('[data-p45]'); if (!x) { if (RU.menu && !t.closest?.('.p45-rmenu')) { RU.menu = false; draw(); } return false; }
  const a = x.dataset.p45;
  e.preventDefault();
  switch (a) {
    case 'aopt': { const A = AG.surf[x.dataset.sid], o = A?.agent?.ask?.options?.[+x.dataset.i]; if (!o) return true; haptic('tap'); const sid = x.dataset.sid; await agentFollow(sid, () => agentCall(o.label ?? o.id, MOD[sid], { selectedId: o.id }), o.label ?? o.id); return true; }
    case 'aconf': { const A = AG.surf[x.dataset.sid], tok = A?.agent?.confirm?.token; if (!tok) return true; haptic('tap'); await agentFollow(x.dataset.sid, () => hlApi('/glimt/agent/confirm', { method: 'POST', json: { token: tok } }), A.q ?? ''); return true; }
    case 'acx': { const sid = x.dataset.sid, S0 = SURF[sid]; if (S0) { S0.set({ text: 'Greit, ingenting er endret.', src: 'Glimt', agent: null }, AG.surf[sid]?.q ?? ''); draw(); } return true; }
    case 'ares': { const A = AG.surf[x.dataset.sid], r = A?.agent?.results?.[+x.dataset.i]; if (r) await openResult(r); return true; }
    case 'calx': CAL.a = null; draw(); return true;
    case 'edreset': PA3.edResetPage?.(); return true;
    case 'reco': await recoSet(+x.dataset.n); return true;
    case 'recomenu': RU.menu = !RU.menu; haptic('tap'); draw(); return true;
    case 'geo': haptic('tap'); HERE.st = 'asking'; hereFetch(null, true); draw(); return true;
    case 'zaon': { const v = !(ZA.d?.on !== false); await zaPut({ on: v }, (d) => { d.on = v; }); return true; }
    case 'zap': { const id = x.dataset.id, p = (ZA.d?.people ?? []).find((y) => String(y.id) === id); if (!p) return true; const v = p.on === false; await zaPut({ people: { [id]: v } }, () => { p.on = v; }); return true; }
    case 'zaz': { const id = x.dataset.id, z = (ZA.d?.zones ?? []).find((y) => String(y.id) === id); if (!z) return true; const v = z.on === false; await zaPut({ zones: { [id]: v } }, () => { z.on = v; }); return true; }
    case 'zademo': showZoneBanner(ZA.d?.sample ?? { title: 'Hjem', body: 'Ingrid forlot Hjem', color: '#2b5d8a' }); return true;
    case 'zabx': ZA.demo = null; draw(); return true;
    case 'pers': { const k = x.dataset.k; if (k === PERS.v) return true; PERS.v = k; ls.set('p45_pers', k); haptic('tab'); draw(); try { await hlApi('/glimt/agent/settings', { method: 'PUT', json: { personality: k } }); } catch (err) { flash(errMsg(err)); } return true; }
    default: return false;
  }
}
export function input45(e, t) { return globalThis.P45H?.input?.(e, t) ?? false; }
export async function change45(e, t) { return (await globalThis.P45H?.change?.(e, t)) ?? false; }
export async function submit45(e, f) {
  if (f.matches?.('[data-p45f="aans"]')) {
    e.preventDefault(); const sid = f.dataset.sid, v = String(f.a?.value ?? '').trim(); if (!v) return true;
    const A = AG.surf[sid], q0 = A?.q ?? '';
    // Svaret på spørsmålet sendes som ny forespørsel i samme modul, med spørsmålet som kontekst.
    await agentFollow(sid, () => agentCall(q0 ? `${q0} – ${v}` : v, MOD[sid], {}), v); return true;
  }
  return (await globalThis.P45H?.submit?.(e, f)) ?? false;
}

export function boot45() {
  globalThis.P45 = { ...globalThis.P45, wide, agentHome, agentTasks, agentFin, agentCal, agentCalRun, agentExtra, agentCard, normAgent, huskeRail, hereCard, hereLabel, zoneAlertsCard, zoneAlertsSettings, showZoneBanner, modGroup, persCard, recoN, recoSeg, recoMenuBtn };
  document.addEventListener('click', homeClick, true);
  // Bilder som ikke finnes (CSP tillater ikke onerror i HTML): fjern, eller vis bokstaven (data-p45fb).
  document.addEventListener('error', (e) => { const t = e.target; if (!(t instanceof HTMLImageElement)) return; if (t.hasAttribute('data-p45rm')) t.remove(); else if (t.dataset.p45fb) t.replaceWith(Object.assign(document.createElement('b'), { textContent: t.dataset.p45fb })); }, true);
  window.visualViewport?.addEventListener('resize', kbSync);
  window.visualViewport?.addEventListener('scroll', kbSync);
  document.addEventListener('focusin', () => setTimeout(kbSync, 60));
  document.addEventListener('focusout', () => setTimeout(kbSync, 60));
  let was = wide();
  addEventListener('resize', () => { const w = wide(); if (w !== was) { was = w; draw(); } });
  // Mer: tittelen og de fire store boksene følger kontoen (/api/me/layout pages.mer45hl / mer45fin).
  hlApi('/me/layout').then((r) => { if (r?.pages) { globalThis.P44?.merTake45?.(r.pages); if (m.screen === 'mer' || m.screen === 'fmer') draw(); } }).catch(() => {});
  // Når appen kommer tilbake i forgrunnen: oppdater «Min posisjon» (maks hvert 10. min).
  document.addEventListener('visibilitychange', () => { if (!document.hidden && m.screen === 'vaer' && HERE.st === 'on') hereFetch(null); });
  import('./mobile-p45h.js').then((x) => { globalThis.P45H = x; x.boot(); if (document.documentElement.dataset.ui === 'mobile') draw(); }).catch((err) => console.warn('mobile-p45h', err));
}
