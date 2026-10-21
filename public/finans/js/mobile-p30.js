// Prompt 30 (PWA): oppdateringsbanner på Hjem og i Innstillinger + PROGRAMVARE (claude-code-oppdatering-mobil.md),
// felles SheetButton (claude-code-felles-knapper-ark.md), Chat-skriveboks over tastaturet (kbInit, claude-code-chat-tastatur.md),
// tilbake-sveip fra venstre kant i capture-fasen + history.pushState/popstate for detaljer og ark (swInit,
// claude-code-tilbake-swipe-ios.md), og en sentral «lukket»-krok med lett haptikk for alle popuper (claude-code-vaer-haptikk.md).
// Fasit: Mobil Papir App.dc.html (upVals, kbInit, swInit), Vaer.dc.html (haptic), Abonnement Legg til ark.dc.html (knappene).
// API (SERVER30): GET /api/system/update (sysupdate.js), GET /api/system/version {current, latest, notes[], updateAvailable},
// POST /api/system/update/start {password}, POST /api/system/update/rollback {password}, GET/PUT /api/system/update/settings
// {auto_update, notify_updates}. Eldre server: 404 → banneret bygger på /api/system/update alene, bryterne skjules.
import { esc, hlApi } from './core.js';
import { m, draw, flash, isIOS } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { updAdmin } from './mobile-upd.js';
import * as P23 from './mobile-p23.js';
import { U, loadUpdate, startUpdate, checkUpdate, running, state, watch, onUpdate } from '/assets/js/sysupdate.js';
import { glimt } from './mobile-p31.js';
import * as P36 from './mobile-p36.js'; // prompt 36: Sherlock-/snekker-Glimt, oppstartsside, tidligere versjoner

const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* =====================================================================
   1. Felles SheetButton: Ferdig (primary) · Lukk/Avbryt (secondary) · ‹ Tilbake (back)
   ===================================================================== */
const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
/** variant: 'pri' | 'sec' | 'back'. attrs: data-attributter som utløser handlingen i modulen som eier arket. */
export const sheetBtn = (label, variant = 'sec', attrs = '') => `<button type="button" class="p30-sb${variant === 'pri' ? ' p30-pri' : variant === 'back' ? ' p30-back' : ''}" ${attrs}>${variant === 'back' ? CHEV : ''}${esc(label)}</button>`;

/** Lett haptikk: navigator.vibrate (Android) og iOS 18+ systemhaptikk via en skjult <input type="checkbox" switch>. */
let swEl = null;
export function hapLight() {
  haptic('tap');
  if (!isIOS()) return;
  try {
    if (!swEl) {
      const l = document.createElement('label'); l.setAttribute('aria-hidden', 'true'); l.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      swEl = document.createElement('input'); swEl.type = 'checkbox'; swEl.setAttribute('switch', ''); swEl.tabIndex = -1; l.appendChild(swEl); document.body.appendChild(l);
    }
    swEl.parentElement.click();
  } catch {}
}

/* =====================================================================
   2. Oppdatering fra mobilen: banner (Hjem + Innstillinger) og PROGRAMVARE
   ===================================================================== */
export const UP = { v: null, vt: 0, cfg: null, cfgT: 0, sheet: null, pw: '', err: '', busy: false, notes: false, hide: +(ls.get('papir_upd_hide') ?? 0) || 0 };
const JOB = 'p30_upd_job';
let subOn = false;
function upLoad() {
  if (!updAdmin()) return;
  if (!subOn) {
    subOn = true;
    onUpdate(() => {
      // Ferdig: be service workeren hente nytt appskall før sysupdate.js laster siden på nytt.
      if (U.reloading) navigator.serviceWorker?.getRegistration?.('/finans/').then((r) => r?.update()).catch(() => {});
      if (['hl', 'set'].includes(m.screen)) draw();
    });
  }
  if (U.st === 'idle') loadUpdate();
  if (Date.now() - UP.vt > 5 * 60000) {
    UP.vt = Date.now();
    hlApi('/system/version').then((v) => { UP.v = v; draw(); }).catch(() => { UP.v = null; });
    hlApi('/system/update/settings').then((c) => { UP.cfg = c ?? {}; draw(); }).catch((e) => { UP.cfg = e.status === 404 ? false : null; });
  }
}
const instSha = () => String(U.d?.installed?.sha ?? U.d?.installed?.commit ?? UP.v?.currentSha ?? UP.v?.sha ?? '').slice(0, 7);
export const ver = () => {
  const d = U.d ?? {};
  return { cur: d.installed?.version ?? UP.v?.current ?? '', lat: d.latest?.version ?? UP.v?.latest ?? '' };
};
const STEP_T = { download: (v) => `Laster ned ${v} …`, backup: () => 'Tar backup før oppdatering …', install: () => 'Installerer på hjemmeserveren …', restart: () => 'Starter tjenestene på nytt …' };
const STEP_PCT = { download: 10, backup: 40, install: 65, restart: 88 };
export function progress() {
  const s = U.d?.status ?? {}, st = state();
  let key = (s.steps ?? []).find((x) => /run|active|on|pending/.test(x.state ?? '') && x.state !== 'pending')?.key
    ?? (st === 'restarting' ? 'restart' : st === 'building' ? 'install' : 'download');
  if (U.waiting || U.reloading) key = 'restart';
  let pct = Number.isFinite(+s.pct) ? +s.pct : STEP_PCT[key] ?? 5;
  if (U.waiting) pct = Math.max(pct, 88);
  if (U.reloading) pct = 100;
  return { key, pct: Math.max(0, Math.min(100, Math.round(pct))), text: U.reloading ? 'Ny versjon svarer. Laster appen på nytt …' : (STEP_T[key] ?? STEP_T.download)(ver().lat || 'ny versjon') };
}
/** Tilstand: avail | run | done | fail | fresh | null (ikke admin / ikke lastet). */
export function upState() {
  if (!updAdmin()) return null;
  upLoad();
  if (U.st !== 'ok' || !U.d) return UP.v?.updateAvailable ? 'avail' : null;
  const job = ls.get(JOB), st = state(), s = U.d.status ?? {};
  if (job && Date.now() - (job.at ?? 0) > 36e5 * 24) ls.set(JOB, null);
  if (running() || U.reloading) return 'run';
  const recent = (t) => { const v = Date.parse(t ?? '') || 0; return v && Date.now() - v < 864e5; };
  if (st === 'failed' && (job || recent(s.finishedAt))) return 'fail';
  if (job && !U.d.updateAvailable) return 'done';
  if (U.d.updateAvailable || UP.v?.updateAvailable) return 'avail';
  return 'fresh';
}
const IC_DOWN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const IC_OK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const IC_ERR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>';
const X = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
// Prompt 31: tomme punkter («Kalender:» uten innhold) hoppes over.
const okNote = (t) => { const v = String(t ?? '').replace(/^[-*•\s]+/, '').trim(); return v && !/^[^:]{1,40}:\s*$/.test(v); };
export const notesOf = () => {
  // Prompt 36: underpunkter flates ut («Kalender: …»), tomme hoppes over. Notatene gjelder den NYE versjonen.
  const n = UP.v?.notes ?? UP.v?.latestNotes;
  if (Array.isArray(n) && n.length) { const L = P36.flatNotes(n).filter(okNote); if (L.length) return L.slice(0, 12); }
  const lat = String(ver().lat || '').replace(/^v/, ''), ch = U.d?.changes ?? [];
  const sec = ch.find((c) => String(c.version ?? '').replace(/^v/, '') === lat) ?? null;
  return P36.flatNotes(sec ? sec.items ?? [] : ch.flatMap((c) => c.items ?? [])).filter(okNote).slice(0, 12);
};
/** «4.22» av «4.22.0». */
const short = (v) => String(v ?? '').replace(/^v/, '').split('.').slice(0, 2).join('.');
/** where: 'home' (kan skjules i 24 t) | 'set' (alltid, unntatt «siste versjon»). */
export function updBanner(where) {
  const k = upState();
  if (!k || k === 'fresh') return '';
  if (where === 'home' && k === 'avail' && (Date.now() - UP.hide < 864e5 || UP.cfg?.notify_updates === false)) return '';
  const { cur, lat } = ver(), job = ls.get(JOB) ?? {}, P = k === 'run' ? progress() : null;
  const title = k === 'done' ? (job.rollback ? `Gjenopprettet til ${cur || job.to || ''}` : `Oppdatert til Nordlys ${cur || job.to || lat}`) : k === 'run' ? (job.rollback ? 'Gjenoppretter Nordlys OS' : 'Oppdaterer Nordlys OS') : k === 'fail' ? 'Oppdateringen feilet' : `Nordlys ${lat} er klar`;
  const sub = k === 'done' ? 'Alt kjører. Endringene er aktive i appen og på web.' : k === 'run' ? 'Du kan bruke appen mens den oppdateres.' : k === 'fail' ? (U.d?.status?.error || 'Noe gikk galt under oppdateringen.') : `Du har ${cur || 'en eldre versjon'}. Oppdaterer hjemmeserveren, web og appen.`;
  const notes = notesOf(), cm = P36.carpState(k, P?.pct ?? 0);
  bootWatch(k);
  return `<div class="p30-up p31-upc${k === 'fail' ? ' fail' : ''}" role="status" aria-live="polite" data-p30up="${k}" data-p31sys title="Åpne System">
    <div class="p30-uph"><span class="p30-upi">${k === 'done' ? IC_OK : k === 'fail' ? IC_ERR : IC_DOWN}</span><span class="m-grow"><b>${esc(title)}</b><span>${esc(sub)}</span></span>${where === 'home' && k === 'avail' ? `<button type="button" class="p30-upx" data-p30="uplater" aria-label="Skjul i 24 timer">${X}</button>` : ''}</div>
    ${P || cm ? `<div class="p30-upp p36-cpw">${cm ? P36.carpOnBar(P?.pct ?? 100, 28, cm, 38) : ''}<span class="p30-upb"><i style="width:${P?.pct ?? 100}%"></i></span>${P ? `<span class="p30-ups"><span>${esc(P.text)}</span><span class="p30-mono">${P.pct} %</span></span>` : ''}</div>` : ''}
    ${k === 'avail' && UP.notes ? `${notes.length ? `<ul class="p30-upn">${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}<a class="p30-uplink p36-prev" href="#/nordlys">Tidligere versjoner ›</a>` : ''}
    ${k === 'avail' ? `<div class="p30-upa"><button type="button" class="p30-upbtn pri" data-p30="upopen">Oppdater nå</button><button type="button" class="p30-upbtn" data-p30="upnotes" aria-expanded="${UP.notes}">${UP.notes ? 'Skjul' : 'Hva er nytt'}</button></div>` : ''}
    ${k === 'done' ? '<button type="button" class="p30-upbtn pri" data-p30="upok">Ferdig</button>' : ''}
    ${k === 'fail' ? `<div class="p30-upa"><button type="button" class="p30-upbtn pri" data-p30="upopen">Prøv igjen</button><button type="button" class="p30-upbtn" data-p30="uprb">Gjenopprett ${esc(job.from || cur || 'forrige')}</button></div>` : ''}
    ${updLinkRow(where)}</div>`;
}
// «Oppdater i nettleseren» er ikke lenger eneste vei; detaljer og logg ligger fortsatt under Innstillinger → Oppdatering.
const updLinkRow = (where) => (where === 'set' ? '<a class="p30-uplink" href="#/nordlys">Detaljer og logg ›</a>' : ''); // prompt 32: Oppdatering-siden er slått sammen med Nordlys OS

const tog = (key, label, sub, on) => `<button type="button" class="opt-row p17-row p30-tg" data-p30="uptog" data-k="${key}" role="switch" aria-checked="${!!on}"><span class="m-grow p17-rt"><b>${esc(label)}</b><small>${esc(sub)}</small></span><span class="sw" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
/** Gruppen PROGRAMVARE i Innstillinger (bare admin). row = radbyggeren i mobile-p17.js. */
export function progGroup(grp, row) {
  if (!updAdmin()) return '';
  const k = upState(), { cur, lat } = ver(), c = UP.cfg;
  // Prompt 31: navigasjonsrad (›) til System-siden «Nordlys OS». Høyre: «Oppdater» (rød) når ny versjon finnes, ✓ ellers.
  const vrow = row('#/nordlys', `Nordlys OS ${cur || ''}`.trim(), k === 'avail' ? `Ny versjon ${lat} er klar` : k === 'run' ? 'Oppdaterer …' : k === 'fail' ? 'Oppdateringen feilet' : k === 'done' ? 'Oppdatert · siste versjon' : 'Siste versjon', k === 'avail' ? 'Oppdater' : k === 'run' ? `${progress().pct} %` : k === 'fail' ? '!' : '✓', 'backup', 'oppd')
    .replace('<span class="sval">', `<span class="sval${k === 'avail' || k === 'fail' ? ' p31-red' : ' p31-ok'}">`);
  const rows = [vrow];
  if (c && typeof c === 'object') rows.push(tog('auto_update', 'Automatiske oppdateringer', 'Installeres om natten kl. 03:30, etter backup', c.auto_update === true)); // prompt 39: «Varsle om nye versjoner» ligger under Varsler
  return grp('PROGRAMVARE', rows).replace('<div class="list p17-list">', '<div class="list p17-list p30-prog">');
}

/** Prompt 39 (claude-code-varsler-versjon-app-ikon.md): «Varsle om nye versjoner» i Innstillinger → Varsler (samme nøkkel). tg = radbyggeren der. */
export function updNoteRow(tg) {
  if (UP.cfg == null) upLoad();
  const c = UP.cfg;
  if (!updAdmin() || !c || typeof c !== 'object') return '';
  return tg('data-p30="uptog" data-k="notify_updates"', 'Varsle om nye versjoner', 'Nordlys OS · banner på Hjem og push', c.notify_updates !== false);
}

/** Passord-arket for Oppdater nå / Gjenopprett. Legges i draw() sammen med de andre arkene. */
export function sheets30() {
  if (!UP.sheet) return '';
  const rb = UP.sheet === 'rollback', { cur, lat } = ver(), job = ls.get(JOB) ?? {};
  const t = rb ? `Gjenopprett ${job.from || 'forrige versjon'}` : 'Bekreft med passord';
  return `<div class="sheet-bg" data-p30="upx"></div><div class="pp-sheet p30-sheet" role="dialog" aria-modal="true" aria-label="${esc(t)}"><span class="pp-grab" aria-hidden="true"></span>
    <div class="p30-shh"><b class="pp-sh">${esc(t)}</b>${sheetBtn('Avbryt', 'sec', 'data-p30="upx"')}</div>
    <span class="pp-mut p30-sht">${rb ? `Går tilbake til forrige vellykkede versjon${cur ? ` (fra ${esc(cur)})` : ''}. Dataene dine beholdes – databasen rulles ikke tilbake.` : `Nordlys ${esc(lat || '')} installeres på hjemmeserveren, web og i appen. Det tas backup først, og serveren starter på nytt (ca. 2 minutter).`}</span>
    <input class="sinp" type="password" id="p30-pw" data-p30pw value="${esc(UP.pw)}" placeholder="Passord" autocomplete="current-password" aria-label="Passord" enterkeyhint="go">
    ${UP.err ? `<div class="upd-merr" role="alert">${esc(UP.err)}</div>` : ''}
    <button type="button" class="pp-btn ink p30-shgo" data-p30="upgo" ${UP.busy ? 'disabled' : ''}>${UP.busy ? 'Starter …' : rb ? 'Gjenopprett' : 'Oppdater'}</button></div>`;
}
/** Prompt 31: krever serveren passord (require_password på)? Eldre server uten bryteren: ja. */
const needPw = () => U.d?.needsPassword === true || (UP.cfg && typeof UP.cfg === 'object' ? UP.cfg.require_password === true : UP.cfg === false && U.d?.needsPassword !== false);
const pwErr = (e) => e && (e.status === 401 || e.status === 403 || e.status === 428) && /passord|password|reauth/i.test(e.message ?? '');
/** Start uten passord (standard). Samme tilstandsoppdatering som startUpdate() i sysupdate.js. */
async function startNoPw() {
  U.starting = true; U.startErr = '';
  try {
    const r = await hlApi('/system/update/start', { method: 'POST', json: {} });
    U.prev = { sha: U.d?.installed?.sha ?? null, version: U.d?.installed?.version ?? null }; U.jobId = r?.id ?? null; U.backup = r?.backup ?? null;
    U.d = { ...(U.d ?? {}), status: { ...(U.d?.status ?? {}), id: r?.id, state: 'downloading', step: 'downloading', error: null, startedAt: new Date().toISOString(), finishedAt: null } };
    U.starting = false; watch(); return true;
  } catch (e) { U.starting = false; U.startErr = e.message; if (pwErr(e)) throw e; return false; }
}
/** «Oppdater nå» (banner, System-siden): ett trykk, eller passordarket når admin har slått på «Krev passord». */
export async function upNow(rb = false) {
  if (UP.busy || running()) return;
  if (needPw()) { UP.sheet = rb ? 'rollback' : 'start'; UP.pw = ''; UP.err = ''; draw(); setTimeout(() => document.getElementById('p30-pw')?.focus(), 60); return; }
  UP.sheet = rb ? 'rollback' : 'start'; UP.pw = '';
  await upGo('');
}
async function upGo(pwIn) {
  const pw = pwIn ?? document.getElementById('p30-pw')?.value ?? UP.pw;
  if (!pw && needPw()) { UP.err = 'Skriv inn passordet ditt.'; return draw(); }
  const { cur, lat } = ver(), rb = UP.sheet === 'rollback';
  UP.busy = true; UP.err = ''; draw();
  if (!rb) {
    let ok;
    try { ok = pw ? await startUpdate(pw) : await startNoPw(); }
    catch (e) { UP.busy = false; UP.cfg = { ...(UP.cfg || {}), require_password: true }; UP.sheet = 'start'; UP.err = 'Serveren krever passord for å oppdatere.'; draw(); setTimeout(() => document.getElementById('p30-pw')?.focus(), 60); return; }
    UP.busy = false;
    if (!ok) { UP.err = U.startErr || 'Kunne ikke starte oppdateringen.'; if (!pw) { UP.sheet = null; flash(UP.err, 'err'); } return draw(); }
    ls.set(JOB, { from: cur, to: lat, at: Date.now() });
  } else {
    try {
      const r = await hlApi('/system/update/rollback', { method: 'POST', json: pw ? { password: pw } : {} });
      U.prev = { sha: U.d?.installed?.sha ?? null, version: U.d?.installed?.version ?? null }; U.jobId = r?.id ?? null;
      U.d = { ...(U.d ?? {}), running: true, status: { ...(U.d?.status ?? {}), id: r?.id, state: 'downloading', step: 'downloading', error: null, startedAt: new Date().toISOString(), finishedAt: null } };
      ls.set(JOB, { from: cur, to: (ls.get(JOB) ?? {}).from || '', rollback: true, at: Date.now() });
      watch();
    } catch (e) {
      UP.busy = false; UP.err = e.status === 404 ? 'Serveren kan ikke gjenopprette fra appen ennå.' : e.message;
      if (!pw && pwErr(e)) { UP.cfg = { ...(UP.cfg || {}), require_password: true }; UP.sheet = 'rollback'; UP.err = 'Serveren krever passord.'; } else if (!pw) { UP.sheet = null; flash(UP.err, 'err'); }
      return draw();
    }
    UP.busy = false;
  }
  UP.sheet = null; UP.pw = ''; hapLight(); draw();
}
async function upTog(k) {
  const c = UP.cfg; if (!c || typeof c !== 'object') return;
  const next = { ...c, [k]: k === 'notify_updates' ? !(c.notify_updates !== false) : !(c[k] === true) };
  UP.cfg = next; draw();
  try { UP.cfg = { ...next, ...((await hlApi('/system/update/settings', { method: 'PUT', json: { [k]: next[k] } })) ?? {}) }; flash(next[k] ? 'Slått på ✓' : 'Slått av'); }
  catch (e) { UP.cfg = c; flash(e.message, 'err'); }
}

/* =====================================================================
   3. Chat: skriveboksen over tastaturet (fasit kbInit)
   ===================================================================== */
const KB = { h: 0, base: 0, on: false };
// Prompt 35 (claude-code-chat-tastatur-ios.md): iOS endrer ikke innerHeight og panorerer siden, så den gamle formelen
// innerHeight − vv.height − vv.offsetTop ga nesten 0. Nå: base = høyeste høyde sett uten fokus, kbH = base − vv.height
// mens INPUT/TEXTAREA har fokus. Nullstill panoreringen (scrollTo 0,0) og mål på nytt mens tastaturet animeres.
function kbInit() {
  const vv = window.visualViewport;
  if (!vv || KB.on) return;
  KB.on = true;
  KB.base = Math.max(innerHeight, document.documentElement.clientHeight, vv.height);
  const f = () => {
    const ae = document.activeElement, typing = !!(ae && (/^(INPUT|TEXTAREA)$/.test(ae.tagName) || ae.isContentEditable));
    if (!typing && vv.height > KB.base - 40) KB.base = Math.max(vv.height, innerHeight);
    const k = typing ? Math.max(0, Math.round((KB.base || innerHeight) - vv.height)) : 0;
    if (k > 40 && (vv.offsetTop > 0 || scrollY > 0) && m.screen === 'chat') { try { window.scrollTo(0, 0); } catch {} }
    if (Math.abs(k - KB.h) <= 2) return;
    KB.h = k;
    const on = k > 40, r = document.documentElement;
    r.classList.toggle('p30-kb', on); r.style.setProperty('--p30-kb', `${on ? k : 0}px`);
    if (m.screen !== 'chat') return;
    setTimeout(() => { const sc = document.getElementById('ch27-sc'); if (sc) sc.scrollTop = sc.scrollHeight; }, 30);
  };
  vv.addEventListener('resize', f); vv.addEventListener('scroll', f);
  addEventListener('focusin', () => { f(); setTimeout(f, 80); setTimeout(f, 320); setTimeout(f, 650); });
  addEventListener('focusout', () => setTimeout(f, 120));
  addEventListener('orientationchange', () => { KB.base = 0; setTimeout(() => { if (!document.activeElement || !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) KB.base = Math.max(vv.height, innerHeight); f(); }, 400); });
}

/* =====================================================================
   4. Tilbake-sveip fra venstre kant: touch i capture-fasen (fasit swInit)
   ===================================================================== */
// Lytter på document i capture-fasen, så karuseller, sveip-rader og kart ikke kan stjele gesten. Starter bare innenfor
// 28 px fra venstre kant, ikke på rotsider, ikke i redigeringsmodus og ikke mens et ark er åpent. Retningen låses etter
// 8 px (horisontal når |dx| > 1,2·|dy| og dx > 0); da preventDefault + stopPropagation, og forhåndsvisningen i
// mobile-p23.js tar over (siden følger fingeren, slipp etter min(110 px, 28 %) går tilbake).
const EDGE = 28, SWP = { t: null, cb: null };
export const touchSwipe = () => SWP.cb != null && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
const blocked = () => document.querySelector('#app .p28-pills, #app [role="dialog"], #app .sheet-bg, #app .s28-sh, #app .p28-sheet') != null;
const fake = (e, t, type) => ({ type, pointerId: 'touch', clientX: t.clientX, clientY: t.clientY, button: 0, timeStamp: e.timeStamp, target: e.target, cancelable: e.cancelable, preventDefault: () => { if (e.cancelable) e.preventDefault(); }, stopPropagation() {} });
function swInit(cb) {
  SWP.cb = cb;
  const st = (e) => {
    SWP.t = null;
    if (e.touches.length !== 1 || document.documentElement.dataset.ui !== 'mobile') return;
    const t = e.touches[0];
    if (t.clientX > EDGE || blocked()) return;
    const to = cb.target();
    if (!to) return;
    SWP.t = { id: t.identifier, x0: t.clientX, y0: t.clientY, lock: null };
    P23.swDown(fake(e, t, 'pointerdown'), to);
  };
  const mv = (e) => {
    const g = SWP.t; if (!g) return;
    const t = [...e.changedTouches].find((x) => x.identifier === g.id); if (!t) return;
    const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (g.lock == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) g.lock = Math.abs(dx) > Math.abs(dy) * 1.2 && dx > 0 ? 'x' : 'y';
    if (g.lock === 'y') { P23.swEnd(fake(e, t, 'pointercancel')); SWP.t = null; return; }
    if (e.cancelable) e.preventDefault(); // ingen indre komponent eller nettleser-panorering får starte i kantsonen
    if (g.lock !== 'x') return;
    e.stopPropagation();
    P23.swMove(fake(e, t, 'pointermove'), cb.cancel);
  };
  const en = (e) => {
    const g = SWP.t; if (!g) return;
    const t = [...e.changedTouches].find((x) => x.identifier === g.id); if (!t) return;
    SWP.t = null;
    if (P23.swEnd(fake(e, t, e.type === 'touchcancel' ? 'pointercancel' : 'pointerup'))) e.stopPropagation();
  };
  document.addEventListener('touchstart', st, { capture: true, passive: true });
  document.addEventListener('touchmove', mv, { capture: true, passive: false });
  document.addEventListener('touchend', en, { capture: true });
  document.addEventListener('touchcancel', en, { capture: true });
}

/* =====================================================================
   5. Historikk for detaljer og ark + felles «lukket»-krok (haptikk)
   ===================================================================== */
// Hver side har allerede egen hash (#/…). Det som bare er tilstand – transaksjonsdetaljer, kvittering, ark og popuper –
// får en egen oppføring med history.pushState, så systemgesten / Android-tilbake lukker det øverste laget først.
// Lukkes laget i appen (Ferdig, ✕, trykk utenfor), fjernes oppføringen igjen med history.back().
const HS = { stack: [], ignore: 0, popping: false, dlg: new Set() };
const DLG_SEL = '#app [role="dialog"], #app .s28-sh, #app .p28-sheet';
function layers() {
  const L = [];
  if (m.detail && m.sel != null) L.push(`tx:${m.sel}`);
  if (m.pdet != null && m.pdet !== false) L.push(`pd:${m.pdet}`);
  if (m.orig) L.push('orig');
  for (const d of document.querySelectorAll(DLG_SEL)) {
    if (d.closest('[hidden]') || (d.offsetParent === null && getComputedStyle(d).position !== 'fixed')) continue;
    L.push(`dlg:${d.getAttribute('aria-label') || d.className.split(' ')[0]}`);
  }
  return [...new Set(L)];
}
function closeLayer(key) {
  if (key.startsWith('dlg:')) {
    const lab = key.slice(4), all = [...document.querySelectorAll(DLG_SEL)];
    const d = all.reverse().find((x) => (x.getAttribute('aria-label') || x.className.split(' ')[0]) === lab);
    if (!d) return false;
    const btn = d.querySelector('[data-p30close], .p30-sb:not(.p30-back), [aria-label="Lukk"], .pp-x, .p28-x')
      ?? [...d.querySelectorAll('button')].find((b) => /^(Lukk|Ferdig|Avbryt|✕)$/.test(b.textContent.trim()));
    const scrim = d.previousElementSibling?.matches?.('.sheet-bg, [class*="scrim"], [class*="-bg"]') ? d.previousElementSibling : null;
    const el = scrim ?? btn;
    if (!el) return false;
    el.click(); return true;
  }
  const back = document.querySelector('#app [data-mact="txback"], #app [data-mact="pdback"], #app [data-mact="origclose"]') ?? SWP.cb?.target();
  if (key === 'orig') { m.orig = null; draw(); return true; }
  if (!back) { if (key.startsWith('tx:')) { m.detail = false; draw(); return true; } return false; }
  back.click(); return true;
}
function histSync() {
  const cur = layers(), prev = HS.stack;
  // Lukket popup/ark: lett haptikk (ikke ved åpning).
  const dl = new Set(cur.filter((k) => k.startsWith('dlg:')));
  for (const k of HS.dlg) if (!dl.has(k)) { hapLight(); break; }
  HS.dlg = dl;
  if (HS.popping) { HS.stack = cur; HS.popping = false; return; }
  if (cur.length > prev.length) {
    for (let i = prev.length; i < cur.length; i++) { try { history.pushState({ ...(history.state ?? {}), p30d: i + 1, p30k: cur[i] }, ''); } catch {} }
  } else if (cur.length < prev.length) {
    const n = prev.length - cur.length, d = history.state?.p30d ?? 0;
    if (d === prev.length && n > 0) { HS.ignore += 1; try { history.go(-n); } catch { HS.ignore -= 1; } }
  }
  HS.stack = cur;
}
function onPop(e) {
  if (HS.ignore > 0) { HS.ignore -= 1; HS.stack = layers(); return; }
  const d = e.state?.p30d ?? 0, cur = layers();
  if (cur.length > d) {
    let guard = 4;
    while (layers().length > d && guard-- > 0) {
      const top = layers().pop();
      HS.popping = true;
      if (!closeLayer(top)) { HS.popping = false; break; }
    }
    HS.popping = false; HS.stack = layers();
    // Laget kunne ikke lukkes (f.eks. et ark uten lukkeknapp): legg oppføringen tilbake.
    for (let i = d; i < HS.stack.length; i++) { try { history.pushState({ ...(history.state ?? {}), p30d: i + 1, p30k: HS.stack[i] }, ''); } catch {} }
  } else if (d > cur.length && d > 0) {
    // Gammel oppføring for et lag som allerede er lukket: hopp over den.
    HS.ignore += 1; try { history.back(); } catch { HS.ignore -= 1; }
  }
}

/* =====================================================================
   Prompt 31: System-siden «Nordlys OS» (Innstillinger → PROGRAMVARE, banneret på Hjem)
   ===================================================================== */
// Ren visning: papirfarget topp (‹ Tilbake · Programvareoppdatering · System), ingen bakgrunnsbilde, ingen bunnmeny
// eller skanneknapp. Hero-kortet med nordlys-gradient er det eneste fargede. «Oppdater nå» ligger fast nederst med fade.
const size = (b) => (b ? `${Math.round(+b / 1e6)} MB` : '');
const dNo = (v) => { const d = new Date(v ?? ''); return Number.isNaN(+d) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
export const NS = { from: 'set' };
export function sysEnter(prev) { if (prev && prev !== 'nordlys') NS.from = prev; }
export function sysView() {
  const adm = updAdmin(), k = adm ? upState() : null, { cur, lat } = ver(), V = UP.v ?? {}, L = U.d?.latest ?? {}, P = k === 'run' ? progress() : null;
  const fresh = k === 'fresh' || k === 'done' || (!lat && cur), nv = lat || cur || '';
  const big = short(fresh ? cur || nv : nv) || '–';
  const hstate = k === 'run' ? 'Oppdaterer …' : k === 'done' ? 'Oppdatert' : UP.chk ? 'Ser etter oppdatering …' : k === 'fail' ? 'Oppdateringen feilet' : k === 'avail' ? 'Oppdatering tilgjengelig' : k === 'fresh' ? 'Du har siste versjon' : adm ? 'Henter versjon …' : 'Bare administrator kan oppdatere';
  const sha = String(L.sha ?? V.sha ?? V.latestSha ?? '').slice(0, 7), sz = k === 'avail' ? size(V.sizeBytes ?? L.sizeBytes) : '';
  const verLine = [nv, sha, sz].filter(Boolean).join(' · ') || '–';
  const inst = fresh ? 'Installert' : cur ? `Du har ${cur}` : '';
  const req = UP.cfg && typeof UP.cfg === 'object' && UP.cfg.require_password === true;
  const notes = notesOf(), date = dNo(V.publishedAt ?? V.date ?? L.date ?? L.publishedAt) || dNo(Date.now());
  const STEPS = [['backup', 'Tar backup av databasen'], ['download', `Laster ned ${nv}`], ['install', 'Bygger'], ['restart', 'Starter serveren på nytt']];
  const si = P ? Math.max(0, STEPS.findIndex(([x]) => x === (P.key === 'download' && P.pct >= 35 ? 'backup' : P.key))) : -1;
  const back = NS.from && NS.from !== 'nordlys' ? `#/${NS.from === 'set' ? 'set' : NS.from}` : '#/set';
  const cm = adm ? P36.carpState(k, P?.pct ?? 0) : null; bootWatch(k);
  return `<div class="n31">
    <div class="n31-top"><a class="n31-back" href="${back}" data-swipeback aria-label="Tilbake">${CHEV}<span>Tilbake</span></a><span class="n31-k">Programvareoppdatering</span><h1 class="n31-h">System</h1></div>
    <section class="n31-hero" aria-label="Nordlys OS ${esc(nv)}"><i class="n31-arc a1" aria-hidden="true"></i><i class="n31-arc a2" aria-hidden="true"></i>${P36.sherlockHtml()}
      <div class="n31-hr"><span class="n31-big">${esc(big)}</span>${adm ? `<button type="button" class="n31-chk" data-p30="upchk" ${k === 'run' || UP.chk ? 'disabled' : ''}>${UP.chk ? 'Ser etter …' : 'Se etter'}</button>` : ''}</div>
      <div class="n31-hb"><span class="n31-hs">${esc(hstate)}</span><span class="n31-name">Nordlys<span>OS</span></span><span class="n31-host">Homelab · ${esc(location.hostname)}</span>
        ${P ? `<div class="n31-prog p36-cpw">${cm ? P36.carpOnBar(P.pct, 34, cm) : ''}<span class="n31-bar"><i style="width:${P.pct}%"></i></span><span class="n31-pl"><span>${esc(P.text)}</span><span class="p30-mono">${P.pct} %</span></span>
          <div class="n31-steps">${STEPS.map(([, n], i) => `<span class="${i < si ? 'ok' : i === si ? 'on' : ''}">${i < si ? '✓' : i === si ? glimt(14, 'think') : '○'} ${esc(n)}</span>`).join('')}</div></div>` : ''}</div></section>
    <div class="n31-card"><div class="n31-row"><span class="m-grow"><b>Programvareversjon</b><span class="p30-mono">${esc(verLine)}</span></span><span class="n31-inst${fresh ? ' ok' : ''}">${esc(inst)}</span></div>
      ${adm && UP.cfg && typeof UP.cfg === 'object' ? `<button type="button" class="n31-row n31-tg" data-p30="uptog" data-k="require_password" role="switch" aria-checked="${req}"><span class="m-grow"><b>Krev passord for å oppdatere</b><span>${req ? 'Passord kreves før oppdateringen starter' : 'Av · admin kan oppdatere med ett trykk'}</span></span><span class="sw" aria-hidden="true" aria-checked="${req}"></span></button>` : ''}</div>
    <span class="n31-note">Oppdateringen gjøres av updater-containeren på serveren. .env, data/ og proton/ røres ikke.</span>
    ${globalThis.P44?.versionsSection?.() ?? '' /* prompt 44: TIDLIGERE VERSJONER (under «Krev passord», over endringsloggen) */}
    <div class="n31-new"><b class="n31-tag">Dette er Nordlys ${esc(short(nv))}. ${esc(V.tagline || 'Lys i mørket, kjørt hjemme.')}</b>
      ${notes.length ? `<span class="n31-lab">NYTT I ${esc(nv)}${date ? ` · ${esc(date)}` : ''}</span><ul>${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${P36.histSection(nv)}
      ${cur ? `<span class="p32-inst"><span class="p30-mono">Installert ${esc(cur)}${instSha() ? ` · build ${esc(instSha())}` : ''}</span><button type="button" class="p32-copy" data-p30="instcopy">Kopier</button></span>` : ''}</div></div>`;
}
/** Knappen fast nederst (utenfor scroll-innholdet), med fade fra bakgrunnsfargen. */
export function sysBottom() {
  if (m.screen !== 'nordlys' || !updAdmin()) return '';
  const k = upState(), P = k === 'run' ? progress() : null;
  const [lab, sub, cls] = k === 'run' ? [`Oppdaterer … ${P.pct} %`, 'Du kan bruke Homelab mens den oppdateres.', 'run']
    : k === 'done' ? ['Ferdig', 'Endringene er aktive på web og i appen.', 'ok']
    : k === 'fresh' ? [UP.chk ? 'Ser etter …' : 'Du har siste versjon', 'Sist sjekket nå', 'off']
    : k === 'fail' ? ['Prøv igjen', U.d?.status?.error || 'Oppdateringen feilet', '']
    : k === 'avail' ? ['Oppdater nå', 'Tar backup først · ca. 2 minutter · serveren starter på nytt', ''] : ['Henter versjon …', '', 'off'];
  return `<div class="n31-bot"><button type="button" class="n31-go ${cls}" data-p30="upbig" ${k === 'run' || UP.busy ? 'disabled' : ''}>${esc(UP.busy ? 'Starter …' : lab)}</button>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
}

/* =====================================================================
   Kroker fra mobile.js
   ===================================================================== */
let booted = false;
/** cb = { target: () => tilbakeknappen eller null, cancel: (e) => avbryt andre gester } */
export function boot30(cb) {
  if (booted) return; booted = true;
  kbInit(); swInit(cb);
  addEventListener('popstate', onPop);
  document.addEventListener('keydown', (e) => {
    if (!UP.sheet) return;
    if (e.key === 'Escape') { UP.sheet = null; draw(); }
    if (e.key === 'Enter' && e.target.matches?.('[data-p30pw]')) { e.preventDefault(); upGo(); }
  });
}
// Prompt 36: Sherlock-Glimt flyr inn i heroen og leter (minst 2,6 s), så kommer svaret i en boble.
async function sherlockCheck() {
  UP.chk = true; P36.sherlockStart(); haptic('tap'); draw();
  await Promise.all([checkUpdate().catch(() => {}), new Promise((ok) => setTimeout(ok, 2600))]);
  UP.vt = 0;
  try { UP.v = await hlApi('/system/version'); UP.vt = Date.now(); } catch {}
  UP.chk = false;
  const k = upState(); P36.sherlockResult(k !== 'avail', ver().lat); draw();
}
// Prompt 36: «Starter opp»-siden mens serveren starter på nytt etter oppdateringen (steget restart, eller ingen svar).
function bootWatch(k) {
  const restart = k === 'run' && (U.waiting || progress().key === 'restart' || state() === 'restarting');
  if (restart && !P36.startingOn()) setTimeout(() => P36.startingShow('update', ver().lat), 0);
}
export function afterDraw30() { try { histSync(); } catch {} try { if (updAdmin() && U.d && running()) bootWatch(upState()); } catch {} }
export function leave30() { UP.sheet = null; UP.notes = false; }
export function input30(e, t) { if (t.matches?.('[data-p30pw]')) { UP.pw = t.value; return true; } return false; }
export async function bind30(e, t) {
  const x = t.closest?.('[data-p30]');
  // Prompt 31: trykk hvor som helst på oppdateringskortet åpner System-siden (knappene beholder egen handling).
  if (!x && t.closest?.('[data-p31sys]') && !t.closest('a,button')) { e.preventDefault(); location.hash = '#/nordlys'; return true; }
  if (!x) return false;
  const a = x.dataset.p30;
  e.preventDefault();
  if (a === 'uplater') { UP.hide = Date.now(); ls.set('papir_upd_hide', UP.hide); flash('Du finner oppdateringen i Innstillinger'); return true; }
  if (a === 'upnotes') { UP.notes = !UP.notes; draw(); return true; }
  if (a === 'instcopy') { const v = ver().cur, t = `Nordlys OS ${v}${instSha() ? ` · build ${instSha()}` : ''}`; try { await navigator.clipboard.writeText(t); flash('Kopiert ✓'); } catch { flash(t); } return true; }
  if (a === 'upopen' || a === 'uprb') { await upNow(a === 'uprb'); return true; }
  if (a === 'upchk') { if (running() || UP.chk) return true; await sherlockCheck(); return true; }
  if (a === 'upbig') { const k = upState(); if (k === 'avail' || k === 'fail') await upNow(); else if (k === 'done') { ls.set(JOB, null); hapLight(); draw(); } else if (k === 'fresh' && !UP.chk) await sherlockCheck(); return true; }
  if (a === 'upx') { UP.sheet = null; draw(); return true; }
  if (a === 'upgo') { await upGo(); return true; }
  if (a === 'upok') { ls.set(JOB, null); try { navigator.vibrate?.([10, 40, 10]); } catch {} draw(); return true; }
  if (a === 'uptog') { await upTog(x.dataset.k); return true; }
  return false;
}
