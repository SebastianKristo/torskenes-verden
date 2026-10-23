// Oppdatering av hele systemet fra nettsiden (Innstillinger → System → Oppdatering). Felles logikk for web og PWA;
// hver klient tegner selv. API: GET /api/system/update, POST …/check, POST …/start {password}, GET …/log.
// - 404 (eldre server uten API-et) → «ikke tilgjengelig». available:false → updater-containeren kjører ikke.
// - Under en jobb hentes status hvert 2. s. Når serveren er nede (restart), pinges /healthz hvert 3. s; når den
//   svarer og jobben er ferdig (eller ny versjon er installert), lastes siden på nytt.
import { reloadOnce } from './upd44.js';

const BASE = '/api/system/update';
export const UPD_CMD = 'bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/update.sh)"';
export const STEPS = [['downloading', 'Laster ned'], ['building', 'Bygger'], ['restarting', 'Starter på nytt'], ['done', 'Ferdig']];
const RUNNING = ['downloading', 'building', 'restarting'];

/** st: 'idle' (ikke hentet) | 'loading' | 'ok' | 'missing' (API finnes ikke) | 'forbidden' | 'error' */
export const U = { st: 'idle', d: null, err: '', checking: false, sheet: false, pw: '', starting: false, startErr: '', waiting: false, waitSince: 0, logOpen: false, log: null, prev: null, jobId: null, copied: false };
const subs = new Set();
export const onUpdate = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => { try { fn(U); } catch (e) { console.error(e); } });

async function req(path, opts = {}) {
  const init = { cache: 'no-store', credentials: 'same-origin', ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const res = await fetch(BASE + path, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : await res.text().catch(() => '');
  if (!res.ok) throw Object.assign(new Error((data && data.error) || `Serveren svarte ${res.status}`), { status: res.status });
  return data;
}

/** Tilstanden til jobben. En forespørsel updateren ikke har plukket opp ennå (running, men gammel status) = «downloading». */
export function state() {
  const d = U.d;
  if (!d) return 'idle';
  const s = d.status ?? {}, st = s.state ?? 'idle';
  if (d.running && (!RUNNING.includes(st) || (U.jobId && s.id && s.id !== U.jobId))) return 'downloading';
  if (U.jobId && s.id && s.id !== U.jobId && !d.running) return 'idle';
  return st;
}
/** Tidspunkt i ms (updateren kan skrive sekunder). */
export const ms = (t) => { const n = Number(t); return Number.isFinite(n) && n > 0 ? (n < 1e11 ? n * 1000 : n) : typeof t === 'string' && /^\d{4}-\d\d-\d\d/.test(t) ? Date.parse(t) || null : null; };
export const running = () => RUNNING.includes(state()) || U.waiting;
export const shortSha = (s) => (s ? String(s).slice(0, 7) : '');
export const verTxt = (x) => (x?.version || x?.sha ? [x.version, shortSha(x.sha)].filter(Boolean).join(' · ') : '–');
/** Indeks for steget som pågår (0–3), -1 når ingen jobb. */
export function stepIndex() {
  if (U.waiting) return 2;
  const s = state(), i = STEPS.findIndex(([k]) => k === s);
  if (i >= 0) return i;
  if (s === 'failed') {
    const st = String(U.d?.status?.step ?? '').toLowerCase();
    const j = STEPS.findIndex(([k, n]) => st === k || st.includes(k) || st.startsWith(n.toLowerCase().slice(0, 5)));
    return j >= 0 ? j : /bygg|build/.test(st) ? 1 : /start|restart|health/.test(st) ? 2 : 0;
  }
  return -1;
}

let loadP = null;
/** Henter status. Hentes bare én gang om gangen. */
export function loadUpdate() {
  if (loadP) return loadP;
  if (U.st === 'idle') { U.st = 'loading'; emit(); }
  loadP = (async () => {
    try { U.d = await req(''); U.st = 'ok'; U.err = ''; }
    catch (e) {
      if (e.status === 404 || e.status === 405) U.st = 'missing';
      else if (e.status === 401 || e.status === 403) U.st = 'forbidden';
      else { U.st = U.d ? 'ok' : 'error'; U.err = e.message; }
    }
    loadP = null;
    if (U.st === 'ok' && RUNNING.includes(state())) watch();
    emit();
  })();
  return loadP;
}

export async function checkUpdate() {
  U.checking = true; U.err = ''; emit();
  try { await req('/check', { method: 'POST' }); } catch (e) { if (e.status === 404) U.st = 'missing'; else U.err = e.message; }
  U.checking = false;
  await loadUpdate();
}

export function openSheet(on = true) { U.sheet = on; U.pw = ''; U.startErr = ''; emit(); }

/**
 * Starter oppdateringen. Prompt 31: passord bare når admin har slått på «Krev passord for å oppdatere»
 * (settings.require_password). opt.allowEmpty = start uten passord; svarer serveren at passord kreves (eldre server
 * eller bryteren er på), returneres 'needpw' så klienten kan vise passordarket.
 */
export async function startUpdate(password = U.pw, opt = {}) {
  if (!password && !opt.allowEmpty) { U.startErr = 'Skriv inn passordet ditt.'; emit(); return false; }
  U.starting = true; U.startErr = ''; emit();
  try {
    const r = await req('/start', { method: 'POST', json: password ? { password } : opt.reauthToken ? { reauthToken: opt.reauthToken } : {} });
    U.prev = { sha: U.d?.installed?.sha ?? null, version: U.d?.installed?.version ?? null };
    U.jobId = r?.id ?? null;
    U.sheet = false; U.pw = ''; U.backup = r?.backup ?? null;
    U.d = { ...(U.d ?? {}), status: { ...(U.d?.status ?? {}), id: r?.id, state: 'downloading', step: 'downloading', error: null, startedAt: new Date().toISOString(), finishedAt: null } };
    U.starting = false; emit();
    // Prompt 40: oppstartssiden vises bare etter en ekte oppdatering (starting36.js leser flagget).
    try { sessionStorage.setItem('hl_updating', JSON.stringify({ at: Date.now(), version: U.d?.latest?.version ?? null })); } catch { /* privat modus */ }
    watch();
    return true;
  } catch (e) {
    U.starting = false;
    if (!password && (e.status === 401 || e.status === 403) && /passord|password/i.test(e.message)) { U.startErr = ''; emit(); return 'needpw'; }
    U.startErr = e.status === 404 ? 'Serveren har ikke oppdatering fra appen ennå.' : e.message;
    emit(); return false;
  }
}

export async function loadLog() {
  try { const t = await req('/log'); U.log = typeof t === 'string' ? t : t?.log ?? JSON.stringify(t); }
  catch (e) { U.log = U.d?.log ?? `Kunne ikke hente loggen: ${e.message}`; }
  emit();
}
export function toggleLog() { U.logOpen = !U.logOpen; emit(); if (U.logOpen && !running()) loadLog(); }

export async function copyCmd() {
  try { await navigator.clipboard.writeText(UPD_CMD); U.copied = true; }
  catch {
    // Reserve uten utklippstavle-API (http på lokalt nett): kopier via et skjult tekstfelt.
    const ta = document.createElement('textarea'); ta.value = UPD_CMD; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    try { U.copied = document.execCommand('copy'); } catch { U.copied = false; }
    ta.remove();
  }
  emit(); setTimeout(() => { U.copied = false; emit(); }, 2500);
  return U.copied;
}

/* ---------- Følg en jobb til den er ferdig ---------- */

let timer = null;
const sleep = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });
let watching = false, fails = 0, failSince = 0;
async function healthy() {
  try { const r = await fetch('/healthz', { cache: 'no-store' }); return r.ok; } catch { return false; }
}
function finished() {
  const s = U.d?.status ?? {}, i = U.d?.installed ?? {};
  if (U.d?.running) return false;
  if (s.state === 'done' && (!U.jobId || !s.id || s.id === U.jobId)) return true;
  return !!(U.prev && ((i.sha && i.sha !== U.prev.sha) || (i.version && U.prev.version && i.version !== U.prev.version)) && !RUNNING.includes(s.state));
}
/** Poller status hvert 2. s; er serveren nede, /healthz hvert 3. s. Laster siden på nytt når ny versjon svarer. */
export async function watch() {
  if (watching) return;
  watching = true;
  U.prev ??= { sha: U.d?.installed?.sha ?? null, version: U.d?.installed?.version ?? null };
  U.jobId ??= U.d?.running && !RUNNING.includes(U.d?.status?.state) ? null : U.d?.status?.id ?? null;
  while (watching) {
    if (U.waiting) {
      await sleep(3000);
      if (!(await healthy())) { emit(); continue; }
    } else await sleep(2000);
    try {
      const d = await req('');
      U.d = d; U.st = 'ok';
      if (U.logOpen && d.log) U.log = Array.isArray(d.log) ? d.log.join('\n') : d.log;
      // Prompt 44: én innlasting (upd44.js), koordinert med oppstartsskjermen og andre faner.
      if (finished()) { U.waiting = false; U.reloading = true; emit(); watching = false; const to = U.d?.installed?.version ?? U.d?.latest?.version ?? null; setTimeout(() => reloadOnce(to), 800); return; }
      U.waiting = false; fails = 0; failSince = 0;
      if (!RUNNING.includes(state())) { watching = false; emit(); return; }
      emit();
    } catch (e) {
      // Nettverksfeil eller 502/503 fra proxyen mens jobben pågår. Prompt 44: én feil (502 mens bildet hentes) betyr
      // ingenting; «venter på serveren» først etter 3 feil på rad over minst 6 s, eller når updateren sa «restarting».
      if (!U.waiting && (!e.status || e.status >= 500)) {
        fails++; failSince ||= Date.now();
        if (state() === 'restarting' || (fails >= 3 && Date.now() - failSince >= 6000)) { U.waiting = true; U.waitSince = Date.now(); }
      }
      else if (e.status === 401) { watching = false; location.reload(); return; } // økten ble borte: logg inn på nytt
      emit();
    }
  }
}
export function stopWatch() { watching = false; clearTimeout(timer); }
/** Minutter siden serveren gikk ned (for «Venter …»-teksten). */
export const waitMin = () => (U.waitSince ? Math.floor((Date.now() - U.waitSince) / 60000) : 0);

/* ---------- Prompt 46 (claude-code-oppdatering-henger-55.md): «Står fast» ----------
   Serveren (SERVER46) har en vakt: ingen fremgang på 3 min → status.stuck med stuckMessage, glimt (årsak) og actions
   ['retry','abort','log'] (+ 'prune' ved lite plass). Knappene sender bare {action} – serveren skriver forespørselen til updateren. */
export const stuck46 = () => { const s = U.d?.status ?? {}; return s.stuck ? { message: s.stuckMessage || 'Oppdateringen står fast', cause: s.glimt || null, actions: s.actions ?? ['retry', 'abort', 'log'], abortLabel: s.abortLabel || 'Avbryt og gå tilbake' } : null; };
export async function control46(action) {
  U.ctl = { busy: action, msg: '', err: '' }; emit();
  try {
    const r = await req(`/${action}`, { method: 'POST', json: {} });
    U.ctl = { busy: null, msg: r?.message ?? (action === 'prune' ? 'Rydder …' : action === 'abort' ? 'Avbryter …' : 'Prøver på nytt …'), err: '' };
    if (r?.id && action === 'retry' && r.mode !== 'step') U.jobId = r.id;
  } catch (e) { U.ctl = { busy: null, msg: '', err: e.status === 404 ? 'Serveren støtter ikke dette ennå. Oppdater Homelab-serveren.' : e.message }; }
  emit();
  await loadUpdate();
  if (running()) watch();
}
