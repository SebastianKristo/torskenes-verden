// Skallet på web: små ting som kobles på én gang ved oppstart (initShell, kalles fra app.js).
// - Temperaturen i toppbildet: trykk åpner Vær-siden, hold inne ≥ 550 ms åpner yr.no (ny fane). Cmd/ctrl-klikk = yr i ny fane.
// - Domener forhåndshentes når web er ledig. Oppstartssiden vises når web mister kontakt med serveren (starting.js), og
//   når updateren selv sier «restarting».
// - Vær åpnet fra briefen (brief.js → openVaer): ✕ øverst til høyre går tilbake til briefen på samme scroll-posisjon.
//   Onboarding med profil (onboarding.js) når den innloggede brukeren ikke er koblet til en profil. Ikke i Mac-appen.
// - Kalender.app for Mac (/kalender?app=mac, html[data-kal-app]): fanetittel «Kalender», lenker til andre sider åpnes i
//   nettleseren (melding open {url} til appen), og 401 fra API-et gir meldingen logout i stedet for /login inne i vinduet.
// - Ctrl+Alt+L låser skjermen (account-session.js). Fartknappen på nyhetslinjen.
// - Julemodus fra Glimt-innstillingene (glimt-figs.js → julOn), og /gjoremal → #/gjoremal.
// - Bakgrunn «Oslo» gjennom døgnet: sjekker hvert minutt om timen/tidsrommet er endret, forhåndslaster neste times bilde
//   5 min før, og bytter når det er lastet. Soloppgang/solnedgang fra Vær.
import { haptic } from './util.js';
import { store, on } from './store.js';
import { toNative } from './kalender-mac.js';
import { bindLockKey } from './account-session.js';
import { loadGlimt } from './glimt-settings.js';
import { onLive } from './realtime.js';
import { bgState, osloKey41, osloUrls41, setSun41 } from './bgsvc.js';
import { applyBackground } from './background.js';
import { paintPhoto } from './hltheme.js';

/* ---------- Temperaturen i toppbildet ---------- */
const HOLD = 550;

function bindWxTap() {
  let t = null, fired = false, el = null, sx = 0, sy = 0;
  const end = () => { clearTimeout(t); t = null; el?.classList.remove('wx36-press'); };
  document.addEventListener('pointerdown', (e) => {
    const a = e.target.closest('[data-wxtap]');
    if (!a || (e.button && e.button !== 0)) return;
    el = a; fired = false; sx = e.clientX; sy = e.clientY;
    a.classList.add('wx36-press');
    clearTimeout(t);
    t = setTimeout(() => { t = null; fired = true; a.classList.remove('wx36-press'); haptic(15); window.open(a.href, '_blank', 'noopener'); }, HOLD);
  });
  document.addEventListener('pointermove', (e) => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) end(); });
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-wxtap]');
    if (!a) return;
    if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // åpner yr i ny fane som en vanlig lenke
    e.preventDefault();
    location.hash = '#/vaer';
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-wxtap]')) e.preventDefault(); });
}

// Domener: forhåndshent når web er ledig, og igjen ved hover på fanen (domains.js holder 60 s-grensen).
function prefetchDomains() {
  const go = () => import('./domains.js').then((m) => m.prefetchDomains?.()).catch(() => {});
  (window.requestIdleCallback ?? ((f) => setTimeout(f, 1500)))(go, { timeout: 4000 });
  document.addEventListener('pointerover', (e) => { if (e.target.closest?.('a[data-r="domener"]')) go(); });
}

function watchServer() {
  import('./starting.js').then((m) => m.watchServer()).catch(() => {});
  // Oppstartssiden vises bare når updateren selv sier «restarting» (ikke ved én feilet statusforespørsel, ikke ut fra
  // fremdriftssteget). Fremdriften 0–99 % vises bare i oppdateringskortet.
  import('./sysupdate.js').then((su) => {
    su.onUpdate?.((U) => { try { if (su.state?.() === 'restarting') document.dispatchEvent(new CustomEvent('hl:restarting', { detail: { to: U?.d?.status?.version ?? U?.d?.latest?.version ?? null } })); } catch { /* */ } });
  }).catch(() => {});
}

/* ---------- Vær fra briefen: tilbake til briefen ---------- */
const BACK = 'gb37_back';

function backInfo() {
  try { const v = JSON.parse(sessionStorage.getItem(BACK) ?? 'null'); return v && Date.now() - v.at < 30 * 60_000 ? v : null; } catch { return null; }
}
function vaerBack() {
  const onVaer = /^#\/vaer(\/|\?|$)/.test(location.hash);
  let b = document.getElementById('gb37-vback');
  const info = onVaer ? backInfo() : null;
  if (!onVaer) { b?.remove(); try { if (!/^#\/(dash)?$/.test(location.hash)) sessionStorage.removeItem(BACK); } catch { /* */ } return; }
  if (!info) { b?.remove(); return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'gb37-vback'; b.type = 'button'; b.className = 'gb37-vback'; b.setAttribute('aria-label', 'Lukk Vær og gå tilbake til briefen'); b.title = 'Tilbake til briefen';
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    b.addEventListener('click', goBack);
    document.body.appendChild(b);
  }
}
async function goBack() {
  const info = backInfo();
  try { sessionStorage.removeItem(BACK); } catch { /* */ }
  document.getElementById('gb37-vback')?.remove();
  location.hash = '#/dash';
  const m = await import('./brief.js');
  setTimeout(() => m.reopenBrief?.(info?.sc ?? 0), 60);
}
function bindVaerBack() {
  window.addEventListener('hashchange', vaerBack);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('gb37-vback') && !document.querySelector('.modal:not([hidden]), .tk-layer, .gb-layer')) { e.preventDefault(); goBack(); } });
  vaerBack();
}

/* ---------- Kalender.app for Mac ---------- */
function kalAppShell() {
  document.body.classList.add('kal-app');
  const t = () => { if (document.title !== 'Kalender') document.title = 'Kalender'; };
  t(); window.addEventListener('hashchange', () => setTimeout(t, 0));
  // Bare kalenderen og Innstillinger hører hjemme i vinduet; alt annet åpnes i nettleseren.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href') ?? '';
    if (/^(javascript:|mailto:|tel:)/i.test(href) || href === '#') return;
    let u; try { u = new URL(href, location.href); } catch { return; }
    const same = u.origin === location.origin;
    const inside = same && u.pathname === location.pathname && (/^#\/(kalender|innstillinger)/.test(u.hash) || (!u.hash && u.search === location.search));
    if (inside && a.target !== '_blank') return;
    e.preventDefault();
    if (!toNative({ type: 'open', url: u.href })) window.open(u.href, '_blank', 'noopener');
  }, true);
  // Utløpt økt: appen logger inn på nytt (native innlogging + /api/auth/app-session).
  const f0 = window.fetch.bind(window);
  let told = false;
  window.fetch = async (...args) => {
    const r = await f0(...args);
    if (r.status === 401 && !told) {
      const url = String(args[0]?.url ?? args[0] ?? '');
      if (/\/api\/(state|me|kalender)/.test(url)) { told = true; toNative({ type: 'logout' }); }
    }
    return r;
  };
}

/* ---------- Hjem: fartknappen på nyhetslinjen ---------- */
function bindTicker() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('[data-tick-sp]')) return;
    e.preventDefault();
    import('./extras.js').then((m) => m.cycleTick());
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.ticker-label')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('hl:theme', () => import('./extras.js').then((m) => m.renderTicker()));
}

/* ---------- Julemodus og Gjøremål-lenken ---------- */
function initJulAndTasksLink() {
  // Julemodus fra serveren (gjelder på alle enheter). loadGlimt kaller setJul når svaret kommer.
  // Endring → «glimt-jul» → app.js tegner siden på nytt.
  loadGlimt(null).catch?.(() => {});
  onLive('glimt:settings', () => { loadGlimt(null, true); });
  // Direktelenke /gjoremal → #/gjoremal (krever at serveren svarer med app.html på /gjoremal).
  if (/^\/gjoremal\/?$/.test(location.pathname) && !location.hash) history.replaceState(null, '', `/#/gjoremal${location.search}`);
}

/* ---------- Oslo-bakgrunnen gjennom døgnet ---------- */
let lastKey = null, preKey = null;
function sunFromWeather() {
  const w = store.data?.weather;
  const rise = w?.sunrise ?? w?.daily?.sunrise?.[0], set = w?.sunset ?? w?.daily?.sunset?.[0];
  if (rise && set) setSun41(rise, set);
}
function osloTick() {
  if (bgState().type !== 'oslo' || document.hidden) return;
  sunFromWeather();
  const k = osloKey41();
  if (lastKey && k !== lastKey) { applyBackground(); paintPhoto(); }
  lastKey = k;
  // 5 min før hel time: last neste times bilde i bakgrunnen (nettleserens cache tar vare på det).
  const n = new Date();
  if (n.getMinutes() >= 55) {
    const next = new Date(n); next.setHours(n.getHours() + 1, 0, 0, 0);
    const nk = osloKey41(next);
    if (nk !== preKey) { preKey = nk; const img = new Image(); img.src = osloUrls41(next).urls[0]; }
  }
}
function initOsloBackground() {
  // Nøkkelen huskes fra start (før været har gitt soloppgang/solnedgang), og sjekkes straks været kommer. Før ble et
  // endret tidsrom først oppdaget ved neste fanebytte, så bakgrunnen ble hentet og byttet midt i byttet.
  lastKey = bgState().type === 'oslo' ? osloKey41() : null;
  setInterval(osloTick, 60_000);
  setTimeout(osloTick, 4000);
  on?.('weather', () => { sunFromWeather(); osloTick(); });
}

/** Kobler på skallet. kalApp = Kalender.app for Mac (html[data-kal-app]). */
export function initShell(kalApp) {
  bindWxTap();
  prefetchDomains();
  watchServer();
  if (!kalApp) {
    bindVaerBack();
    // Onboarding etter at siden er tegnet (ikke i veien for første visning).
    setTimeout(() => import('./onboarding.js').then((m) => m.maybeOnboard()).catch(() => {}), 1200);
  }
  if (kalApp) kalAppShell();
  else { bindLockKey(); bindTicker(); }
  initJulAndTasksLink();
  initOsloBackground();
}
