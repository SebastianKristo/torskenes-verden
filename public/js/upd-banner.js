// Prompt 30: oppdateringsbanner på Dashboard (admin) og øverst i Innstillinger → System, etter mobil-fasiten
// («Mobil Papir App.dc.html» → upVals). Tilstander: Tilgjengelig · Oppdaterer (steg + prosent) · Ferdig · Feilet.
// - Data fra sysupdate.js (GET /api/system/update). Release notes fra GET /api/system/version (notes[]), ellers CHANGELOG-
//   punktene i /api/system/update (changes[]).
// - «Oppdater nå», «Prøv igjen» og «Gjenopprett» åpner et passord-ark. Start: POST …/start {password}.
//   Gjenopprett: POST /api/system/update/rollback {password} (updateren laster ned forrige vellykkede versjon; data beholdes).
// - ✕ på Dashboard skjuler banneret i 24 t (localStorage «hl_upd_hide»). Under og etter oppdatering vises det alltid.
// - Fremdrift: status.steps [{key, state}] og status.pct fra SERVER30; eldre server: anslag ut fra steget.
// Prompt 31: navnet er Nordlys OS («Nordlys 4.22 er klar»). Trykk på kortet åpner Innstillinger → System; knappene
// (Oppdater nå, Hva er nytt, ✕, Ferdig) gjør fortsatt sin egen handling. Oppdater nå starter uten passord, med mindre
// admin har slått på «Krev passord for å oppdatere» (da passordarket).
import { esc, sheetBtn, haptic } from './util.js';
import { store } from './store.js';
import { U, onUpdate, loadUpdate, startUpdate, state, stepIndex, running, verTxt, watch, ms } from './sysupdate.js';
import { carpOnBar } from './glimt-outfits36.js'; // prompt 36: snekker-Glimt på fremdriftslinja

const HIDE_KEY = 'hl_upd_hide', ACK_KEY = 'hl_upd_ack';
const B = { notes: null, notesOpen: false, sheet: null, pw: '', busy: false, err: '', slots: new Set(), rolling: false };
const admin = () => store.me?.me?.role === 'admin';
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* privat modus */ } return null; };
const hidden24 = () => Date.now() - (+ls(HIDE_KEY) || 0) < 864e5;
const ver = (x) => (x?.version ? String(x.version) : verTxt(x));

// Grove anslag når serveren ikke sender pct: laster ned → backup → installerer → starter på nytt.
const STEP_TXT = { download: 'Laster ned {v} …', backup: 'Tar backup før oppdatering …', install: 'Installerer på hjemmeserveren …', restart: 'Starter tjenestene på nytt …' };
const STEP_PCT = { download: 8, backup: 35, install: 60, restart: 85 };
const LEGACY = ['download', 'install', 'restart', 'restart']; // sysupdate STEPS: downloading, building, restarting, done

export function progress() {
  const s = U.d?.status ?? {};
  let key = null;
  if (Array.isArray(s.steps) && s.steps.length) key = (s.steps.find((x) => x.state === 'running' || x.state === 'active') ?? s.steps.filter((x) => x.state === 'done').pop())?.key ?? null;
  if (U.waiting) key = 'restart';
  key ??= LEGACY[Math.max(0, stepIndex())] ?? 'download';
  const pct = Number.isFinite(+s.pct) && s.pct != null ? Math.max(0, Math.min(100, Math.round(+s.pct))) : STEP_PCT[key] ?? 10;
  return { key, pct, txt: (STEP_TXT[key] ?? STEP_TXT.download).replace('{v}', ver(U.d?.latest) || '') };
}

/** Hvilken tilstand banneret har nå, eller null (ingenting å vise). */
function phase() {
  if (!admin() || U.st !== 'ok' || !U.d) return null;
  const st = state(), s = U.d.status ?? {};
  if (running() || U.reloading) return 'run';
  if (st === 'failed') return ls(ACK_KEY) === `f:${s.id ?? s.finishedAt ?? ''}` ? (U.d.updateAvailable ? 'avail' : null) : 'fail';
  if (doneRecent()) return 'done';
  if (U.d.updateAvailable) return 'avail';
  return null;
}

/** Ferdig de siste 24 t og ikke kvittert ut med «Ferdig». */
export function doneRecent() {
  const s = U.d?.status ?? {};
  return state() === 'done' && !!s.finishedAt && Date.now() - (Date.parse(s.finishedAt) || ms(s.finishedAt) || 0) < 864e5 && ls(ACK_KEY) !== `d:${s.id ?? s.finishedAt}`;
}
/** «Ferdig» trykket (banneret eller System-siden). */
export function ackDone() { const s = U.d?.status ?? {}; ls(ACK_KEY, `d:${s.id ?? s.finishedAt}`); haptic([10, 40, 10]); paint(); }
const requirePw = () => U.d?.settings?.require_password === true;
async function startNoPw() {
  if (requirePw()) { B.sheet = 'start'; B.err = ''; B.pw = ''; paint(); return; }
  B.busy = true; paint();
  const r = await startUpdate('', { allowEmpty: true });
  B.busy = false;
  if (r === 'needpw') { B.sheet = 'start'; B.err = ''; B.pw = ''; }
  else if (!r) flash(U.startErr || 'Kunne ikke starte oppdateringen.');
  paint();
}

async function loadNotes() {
  if (B.notes) return;
  try {
    const r = await fetch('/api/system/version', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j?.notes) && j.notes.length) { B.notes = j.notes.map(String); return; } }
  } catch { /* eldre server */ }
  B.notes = (U.d?.changes ?? []).flatMap((c) => c.items ?? []).slice(0, 8);
}

const IC_DOWN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const IC_OK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const IC_ERR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>';

/** Banneret. where: 'dash' (kan skjules i 24 t) eller 'set' (Innstillinger → System, kan ikke skjules). */
export function updBanner(where = 'dash') {
  if (!admin()) return '';
  if (U.st === 'idle') { loadUpdate(); }
  const ph = phase();
  const slot = (inner) => `<div class="ub-slot" data-ub-slot="${where}">${inner}</div>`;
  if (!ph || (where === 'dash' && ph === 'avail' && hidden24())) return slot('');
  const cur = ver(U.d.installed), nv = ver(U.d.latest), s = U.d.status ?? {};
  let ic = IC_DOWN, t = '', sub = '', body = '', btns = '', x = '', cls = '';
  if (ph === 'avail') {
    t = `Nordlys ${nv} er klar`; sub = `Du har ${cur}. Oppdaterer hjemmeserveren, web og appen.`;
    if (where === 'dash') x = '<button type="button" class="ub-x" data-ub="later" aria-label="Skjul i 24 timer" title="Skjul i 24 timer"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    if (B.notesOpen) body = `<div class="ub-notes" data-no-i18n>${(B.notes ?? []).length ? B.notes.map((n) => `<span><i>•</i><span>${esc(n)}</span></span>`).join('') : '<span>Ingen endringsnotater.</span>'}</div>`;
    btns = `<div class="ub-btns"><button type="button" class="ub-b pri" data-ub="start" ${B.busy ? 'disabled' : ''}>${B.busy ? 'Starter …' : 'Oppdater nå'}</button><button type="button" class="ub-b" data-ub="notes" aria-expanded="${B.notesOpen}">${B.notesOpen ? 'Skjul' : 'Hva er nytt'}</button></div>`;
  } else if (ph === 'run') {
    const p = progress();
    const rb44 = U.rollTo || (s.action === 'rollback' && s.version ? s.version : null); // prompt 44: tilbakerulling
    t = rb44 ? `Går tilbake til ${rb44}` : B.rolling ? `Gjenoppretter ${cur}` : 'Oppdaterer Nordlys OS'; sub = U.reloading ? 'Ny versjon svarer. Laster siden på nytt …' : 'Du kan bruke appen mens den oppdateres.';
    body = `<div class="ub-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><span class="ub-bar cp36-host">${carpOnBar(p.pct, 30)}<span style="width:${p.pct}%"></span></span><span class="ub-st"><span>${esc(p.txt)}</span><span class="ub-pct">${p.pct} %</span></span></div>`;
    cls = ' run';
  } else if (ph === 'done') {
    ic = IC_OK; t = `Oppdatert til Nordlys ${cur}`; sub = 'Alt kjører. Endringene er aktive i appen og på web.';
    btns = '<div class="ub-btns"><button type="button" class="ub-b pri wide" data-ub="ack">Ferdig</button></div>';
  } else {
    ic = IC_ERR; cls = ' fail'; t = 'Oppdateringen feilet'; sub = s.error ? String(s.error) : 'Ukjent feil. Se loggen under Innstillinger → System.';
    const rb = U.d.rollback, rbV = rb?.version ?? U.prev?.version ?? cur;
    btns = `<div class="ub-btns"><button type="button" class="ub-b pri" data-ub="retry">Prøv igjen</button>${rb && rb.available === false && !rb.version ? '' : `<button type="button" class="ub-b" data-ub="rollback">Gjenopprett ${esc(rbV)}</button>`}</div>`;
  }
  return slot(`<section class="ub${cls}" role="status" aria-live="polite" data-ub-card title="Åpne System"><div class="ub-h"><span class="ub-ic">${ic}</span><span class="ub-t"><b>${esc(t)}</b><span${ph === 'fail' ? ' data-no-i18n' : ''}>${esc(sub)}</span></span>${x}</div>${body}${btns}</section>`);
}

function sheetHtml() {
  if (!B.sheet) return '';
  const rb = B.sheet === 'rollback', nv = ver(U.d?.latest);
  return `<div class="ub-scrim" data-ub="close"></div><form class="ub-sheet" role="dialog" aria-modal="true" aria-labelledby="ub-sh-t" data-ub-form>
    <div class="ub-sh-h"><b id="ub-sh-t">${rb ? 'Gjenopprett forrige versjon' : nv ? `Oppdater til Nordlys ${esc(nv)}` : 'Oppdater Nordlys OS'}</b>${sheetBtn('Avbryt', 'data-ub="close"', 'sec')}</div>
    <p>${rb ? 'Updateren installerer forrige vellykkede versjon igjen. Dataene dine beholdes (backupen fra før oppdateringen gjenopprettes ikke automatisk).' : 'Det tas backup først. Serveren starter på nytt, det tar vanligvis 2–5 minutter. Du kan bruke appen imens.'}</p>
    <label class="ub-f"><span>Passord</span><input type="password" name="ubpw" value="${esc(B.pw)}" autocomplete="current-password" placeholder="Ditt passord" required data-ub-pw></label>
    ${B.err ? `<div class="ub-err" role="alert">${esc(B.err)}</div>` : ''}
    <button type="submit" class="ub-b pri wide" ${B.busy ? 'disabled' : ''}>${B.busy ? (rb ? 'Gjenoppretter …' : 'Starter …') : rb ? 'Gjenopprett' : 'Oppdater nå'}</button></form>`;
}

function paint() {
  document.querySelectorAll('[data-ub-slot]').forEach((el) => { const w = el.dataset.ubSlot; const tmp = document.createElement('div'); tmp.innerHTML = updBanner(w); el.replaceWith(tmp.firstElementChild); });
  let host = document.getElementById('ub-host');
  if (!B.sheet) { host?.remove(); return; }
  if (!host) { host = document.createElement('div'); host.id = 'ub-host'; host.className = 'ub-host'; document.body.appendChild(host); }
  const had = host.querySelector('[data-ub-pw]') === document.activeElement;
  host.innerHTML = sheetHtml();
  const i = host.querySelector('[data-ub-pw]'); if (i && (had || !B.busy)) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch { /* */ } }
}

async function rollback(password) {
  const r = await fetch('/api/system/update/rollback', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(password ? { password } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!password && (r.status === 401 || r.status === 403) && /passord|password/i.test(j.error ?? '')) throw Object.assign(new Error(''), { needpw: true });
  if (!r.ok) throw new Error(r.status === 404 ? 'Serveren har ikke gjenoppretting ennå. Oppdater Homelab først, eller kjør update.sh på serveren.' : j.error || `Serveren svarte ${r.status}`);
  U.jobId = j.id ?? null;
  U.d = { ...(U.d ?? {}), status: { ...(U.d?.status ?? {}), id: j.id, state: 'downloading', step: 'downloading', error: null, startedAt: new Date().toISOString(), finishedAt: null } };
  watch();
}

let bound = false;
/** Kobler på klikk og abonnement (én gang). Kalles fra app.js og innstillingene. */
export function loadUpdBanner() {
  if (bound || !admin()) return;
  bound = true;
  onUpdate(paint);
  loadUpdate();
  // Sanntid (SERVER30): ny versjon tilgjengelig → hent status på nytt.
  import('./realtime.js').then((m) => m.onLive?.('system-update-available', () => { U.st = 'ok'; loadUpdate(); })).catch(() => {});
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ub]');
    // Trykk på selve kortet (ikke en knapp) åpner System-siden. Inne i Innstillinger → System er man der allerede.
    if (!b) {
      const card = e.target.closest('[data-ub-card]');
      if (card && !e.target.closest('button,a,input') && card.closest('[data-ub-slot]')?.dataset.ubSlot === 'dash') { e.preventDefault(); haptic(6); document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'system' })); }
      return;
    }
    const a = b.dataset.ub;
    if (a === 'close' && e.target !== b && b.classList.contains('ub-scrim')) return;
    e.preventDefault();
    if (a === 'later') { ls(HIDE_KEY, String(Date.now())); haptic(8); paint(); flash('Du finner oppdateringen i Innstillinger → System'); return; }
    if (a === 'notes') { B.notesOpen = !B.notesOpen; if (B.notesOpen) await loadNotes(); paint(); return; }
    if (a === 'start' || a === 'retry') { if (state() === 'failed') { const s = U.d?.status ?? {}; ls(ACK_KEY, `f:${s.id ?? s.finishedAt ?? ''}`); } await startNoPw(); return; }
    if (a === 'rollback') {
      if (requirePw()) { B.sheet = 'rollback'; B.err = ''; B.pw = ''; paint(); return; }
      const s = U.d?.status ?? {}; ls(ACK_KEY, `f:${s.id ?? s.finishedAt ?? ''}`);
      B.rolling = true; B.busy = true; paint();
      try { await rollback(''); } catch (err) { B.rolling = false; if (err.needpw) { B.sheet = 'rollback'; B.err = ''; B.pw = ''; } else flash(err.message); }
      B.busy = false; paint(); return;
    }
    if (a === 'close') { B.sheet = null; haptic(8); paint(); return; }
    if (a === 'ack') ackDone();
  });
  document.addEventListener('input', (e) => { if (e.target.matches?.('[data-ub-pw]')) B.pw = e.target.value; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && B.sheet) { e.preventDefault(); e.stopPropagation(); B.sheet = null; paint(); } }, true);
  document.addEventListener('submit', async (e) => {
    if (!e.target.matches?.('[data-ub-form]')) return;
    e.preventDefault();
    const pw = e.target.querySelector('[data-ub-pw]')?.value ?? B.pw;
    if (!pw) { B.err = 'Skriv inn passordet ditt.'; paint(); return; }
    const s = U.d?.status ?? {};
    if (state() === 'failed') ls(ACK_KEY, `f:${s.id ?? s.finishedAt ?? ''}`);
    B.busy = true; B.err = ''; paint();
    try {
      if (B.sheet === 'rollback') { B.rolling = true; await rollback(pw); }
      else { B.rolling = false; const ok = await startUpdate(pw); if (!ok) throw new Error(U.startErr || 'Kunne ikke starte oppdateringen.'); }
      B.sheet = null; B.pw = '';
    } catch (err) { B.err = err.message; B.rolling = false; }
    B.busy = false; paint();
  });
}

function flash(text) {
  let t = document.getElementById('ub-toast');
  if (!t) { t = document.createElement('div'); t.id = 'ub-toast'; t.className = 'ub-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text; t.classList.add('on');
  clearTimeout(flash.t); flash.t = setTimeout(() => t.classList.remove('on'), 2600);
}
