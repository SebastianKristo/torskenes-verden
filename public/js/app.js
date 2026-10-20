import { api, esc, isMobile } from './util.js';
import { store, on, load, mountAll } from './store.js';
import { setupDnd, resetLayouts } from './dnd.js';
import { applyBackground, preloadAll } from './background.js';
import { bgState } from './bgsvc.js';
import { openSettings, bindSettings, applyTop, settingsOwnsHash } from './settings.js';
import { bindPopup, bindSearch, menuLabels, toggle, renderTicker } from './extras.js';
import { applyHead, toggleHeadEdit, uiDefaults } from './topedit.js';
import { applyProfile, applyNav } from './profile.js';
import * as dash from './dash.js';
import * as study from './study.js';
import * as space from './space.js';
import * as net from './net.js';
import * as home from './home.js';
import * as mat from './mat.js';
import * as domains from './domains.js';
import * as tracking from './tracking.js';
import * as family from './family.js';
import * as tasks from './tasks.js';
import * as weatherPage from './weather-page.js';
import * as birthdays from './birthdays.js';
import * as kalender from './kalender.js';
import * as chat from './chat.js';
import { initI18n, setLang, lang } from './i18n.js';
import { loadUpdBanner } from './upd-banner.js';
import { loadProfileMenu, renderProfileMenu, profileMenuClick, profileMenuClosed } from './profile-menu.js';
import './finpreload.js';
import { logout, noteUser } from './usercache.js';
import { loadAppIdentity, appName } from './appicon.js';
import { scrollMemory } from './scrollmem.js';
import { startVersionCheck } from './vercheck.js';
import { mountDash, startEdit } from './dash-edit36.js';
import { initWeb36 } from './web36.js';
import { initWeb37 } from './web37.js';
import { initWeb38 } from './web38.js';
import { initWeb40 } from './web40.js';
import { initWeb41, after41 } from './web41.js';
import { loadHlTheme, applyHlTheme, is2c, setHlTheme, pwHeader, paintPhoto, bindPhoto } from './hltheme.js';

const ROUTES = { dash: dash.render, studie: study.render, rom: space.render, hjem: home.render, matplan: mat.render, sporing: tracking.render, familie: family.render, huskeliste: tasks.render, gjoremal: tasks.render, vaer: weatherPage.render, bursdager: birthdays.render, kalender: kalender.render, chat: chat.render, domener: domains.render, nettverk: net.render, mer: net.renderMore };
const view = document.getElementById('view');
const KAL_APP = !!document.documentElement.dataset.kalApp;
const scrollMem = scrollMemory();
let route = null, wasMobile = isMobile(), isEditingPending = false;

function current() {
  // Prompt 30: undersider i adressen (#/kalender/dag/2026-10-21) hører til første ledd.
  const r = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0];
  // Økonomi er nå FinansHub, en egen fullskjerm-app.
  if (r === 'okonomi') { location.replace('/finans/'); return 'dash'; }
  if (r === 'mer' && !isMobile()) return 'nettverk';
  // Prompt 38: Kalender.app for Mac (/kalender?app=mac) viser bare kalenderen.
  if (KAL_APP) return 'kalender';
  return ROUTES[r] ? r : 'dash';
}

function renderRoute() {
  const next = current();
  route = next;
  // Bakgrunnsbilde og «Siste nytt» vises bare på dashboardet.
  document.body.classList.toggle('not-dash', route !== 'dash');
  // Vindu og papir: alle sider har et fotovindu øverst som topplinjen ligger oppå (høyt på Dashboard, lavt ellers).
  document.body.classList.toggle('pw-on', is2c());
  document.body.classList.toggle('pw-low', is2c() && route !== 'dash');
  document.body.dataset.route = route;
  // Nyhetsbaren kan ligge inne i visningen (Vindu og papir); flytt den ut før visningen tegnes på nytt.
  const tk = document.getElementById('ticker');
  if (tk && view.contains(tk)) document.querySelector('header.top').after(tk);
  // Værsiden er en egen fullskjermside (systemfont, animert himmel) uten fotovindu.
  // Prompt 40: Gjøremål er fullskjerm på web (som Chat), uten fotovindu og toppmeny.
  const fsTasks = (route === 'huskeliste' || route === 'gjoremal') && !isMobile();
  document.body.classList.toggle('tk-fs40', fsTasks);
  view.innerHTML = (is2c() && route !== 'vaer' && route !== 'rom' && route !== 'chat' && !fsTasks ? pwHeader(route) : '') + ROUTES[route](); // Vær, Rom (prompt 32) og Chat (prompt 33) er fullskjerm
  placeTicker();
  paintPhoto();
  mountAll(view);
  setupDnd(view);
  if (route === 'dash') { mountDash(view); if (isEditingPending) { isEditingPending = false; requestAnimationFrame(() => startEdit()); } }
  after41(route, view); // prompt 41: 17. mai på Hjem
  // Rom er en underside av «Mer» på mobil.
  const navKey = isMobile() && ['chat', 'rom', 'nettverk', 'hjem', 'matplan', 'sporing', 'familie', 'huskeliste', 'gjoremal', 'domener', 'bursdager', 'kalender'].includes(route) ? 'mer' : route;
  document.querySelectorAll('[data-r]').forEach((a) => { if (a.dataset.r === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  setTitle();
  // Prompt 23: tilbake gir samme scrollposisjon som før, nye sider åpner øverst.
  scrollMem.enter(route);
}

// Fanetittelen: «Side · Appnavn» (appnavnet fra Innstillinger → App, standard «Homelab»).
const TITLES = { chat: 'Chat', vaer: 'Vær', studie: 'Studie', rom: 'Rom', hjem: 'Hjem', matplan: 'Mat', sporing: 'Sporing', familie: 'Familie', huskeliste: 'Gjøremål', gjoremal: 'Gjøremål', bursdager: 'Bursdager', kalender: 'Kalender', domener: 'Domener', nettverk: 'Nettverk', mer: 'Mer' };
function setTitle() { document.title = KAL_APP ? 'Kalender' : TITLES[route] ? `${TITLES[route]} · ${appName()}` : appName(); }

// Nyhetsbaren ligger under topplinjen, men i Vindu og papir under søkefeltet på papiret.
function placeTicker() {
  const t = document.getElementById('ticker'), slot = document.getElementById('p-ticker-slot');
  if (!t) return;
  if (slot) slot.appendChild(t);
  else if (t.parentElement !== document.querySelector('.shell')) document.querySelector('header.top').after(t);
}

// «SISTE NYTT ›» åpner den felles nyhetsleseren (news.js). Finnes den ikke ennå, skjer ingenting.
async function openNewsReader() {
  try { const m = await import('./news.js'); (m.openNews ?? m.default)?.(); } catch (e) { console.warn('Nyhetsleseren er ikke tilgjengelig', e); }
}

function weatherPill() {
  const w = store.data.weather, el = document.getElementById('wx-pill');
  if (!w) { if (store.errors.weather) el.innerHTML = '<span class="muted">Vær utilgjengelig</span>'; return; }
  el.innerHTML = isMobile() ? `<b>${w.temp}°</b>` : `<b>${w.temp}°C</b> ${esc(w.text)} <span class="muted">· ${w.wind} m/s</span>`;
}

// Profilmenyen: «Språk: Norsk → English» / «Language: English → Norsk».
function langLabel() { renderProfileMenu(); }

function bindShell() {
  const btn = document.getElementById('profile-btn'), menu = document.getElementById('menu');
  // Prompt 30: menyen tegnes av profile-menu.js (fargede ikoner, egen rekkefølge, «Tilpass denne menyen»).
  const close = () => { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); profileMenuClosed(); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) renderProfileMenu(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); if (menu.hidden) profileMenuClosed(); });
  // Klikk i redigeringen (som tegner menyen på nytt) skal ikke lukke den.
  menu.addEventListener('click', async (e) => { if (await profileMenuClick(e)) e.hlMenu = true; });
  document.addEventListener('click', (e) => { if (!e.hlMenu && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
  document.addEventListener('hl:menu', renderProfileMenu);
  document.addEventListener('click', async (e) => {
    if (e.target.closest('.ticker-label')) { e.preventDefault(); openNewsReader(); return; }
    if (e.hlMenu) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    // «Innstillinger» åpner alltid innstillingene (fullskjerm, #/innstillinger/konto).
    if (act === 'settings') { e.preventDefault(); openSettings('konto'); }
    if (act === 'lock') await logout();
    if (act === 'integrations') { e.preventDefault(); openSettings('int'); }
    if (act === 'hl-theme') await setHlTheme(is2c() ? 'cur' : '2c');
    if (act === 'lang') { await setLang(lang() === 'en' ? 'nb' : 'en'); langLabel(); }
    if (act === 'layout') openSettings('top');
    if (act === 'news-speed') openSettings('top', 'speed');
    if (act === 'reset-layout') await resetLayouts();
    if (act === 'toggle-search') await toggle('search');
    if (act === 'toggle-news') await toggle('news');
    if (act === 'head-edit') toggleHeadEdit();
    if (act === 'dash-edit') { if (current() !== 'dash') { isEditingPending = true; location.hash = '#/dash'; } else startEdit(); }
    if (act === 'logout') {
      if (!confirm('Logge ut? Denne enheten må da logge inn med passord igjen.')) return;
      const d = await api('/devices').catch(() => null), cur = d?.devices?.find((x) => x.current);
      if (cur) await api(`/devices/${cur.id}`, { method: 'DELETE' }).catch(() => {});
      await logout();
    }
  });
  // Innstillinger legger #/innstillinger/<fane> i adressen (og fjerner den igjen) uten at siden under skal tegnes på nytt.
  window.addEventListener('hashchange', () => { if (!settingsOwnsHash()) renderRoute(); });
  document.addEventListener('hl:theme', () => { route = null; renderRoute(); weatherPill(); });
  // Nytt språk: tegn visningen på nytt (tekster fra t() og Intl-datoer).
  document.addEventListener('hl:lang', () => { route = null; renderRoute(); weatherPill(); langLabel(); renderTicker(); });
  document.addEventListener('hl:name', renderRoute); // nytt navn i hilsenen med en gang
  document.addEventListener('hl:dash36', () => { if (route === 'dash') { route = null; renderRoute(); } }); // prompt 36: widget lagt til igjen
  // Prompt 40: julemodus endret (figurbiblioteket) → siden tegnes på nytt, så Glimt får lua med en gang. Ikke i Chat (strømmer).
  window.addEventListener('glimt-jul', () => { if (route !== 'chat') { route = null; renderRoute(); } });
  document.addEventListener('hl:app', () => { setTitle(); applyHlTheme(); }); // nytt appnavn eller ikon
  window.addEventListener('resize', () => { if (isMobile() !== wasMobile) { wasMobile = isMobile(); renderRoute(); weatherPill(); } });
}

async function main() {
  const [me, ui] = await Promise.all([api('/state'), api('/ui').catch(() => uiDefaults()), loadHlTheme(), loadAppIdentity()]);
  store.me = me;
  noteUser(me?.me?.id); // kontobytte: tøm den forrige brukerens cacher
  store.me.ui = { ...uiDefaults(), ...ui };
  await initI18n(me?.me?.language ?? me?.language ?? me?.settings?.language);
  loadProfileMenu().then(renderProfileMenu);
  langLabel();
  applyHlTheme();
  applyProfile();
  applyNav();
  menuLabels();
  bindShell();
  bindPhoto();
  bindSettings();
  if (!KAL_APP) loadUpdBanner(); // prompt 30: oppdateringsbanner (bare admin)
  bindPopup();
  initWeb36();
  if (!KAL_APP) initWeb37(); // onboarding og Vær-tilbake hører ikke hjemme i Mac-appen
  initWeb38();
  initWeb40();
  initWeb41();
  bindSearch();
  setupDnd(document.querySelector('header'));
  study.bind(view); space.bind(view); home.bind(view); mat.bind(view); tracking.bind(view); domains.bind(view);
  applyTop();
  applyHead();
  renderTicker();
  preloadAll();
  applyBackground();
  renderRoute();

  // Henter data parallelt; hver widget oppdateres når sine data kommer.
  const poll = (key, ms, path) => { load(key, path); setInterval(() => { if (!document.hidden) load(key, path); }, ms); };
  poll('ruter', 30_000);
  poll('weather', 15 * 60_000);
  poll('school', 15 * 60_000);
  poll('trading', 60_000);
  poll('energy', 60_000);
  poll('health', 60_000);
  poll('upcoming', 10 * 60_000);
  poll('news', 5 * 60_000);
  poll('finans', 5 * 60_000, '/../finans/api/summary');
  study.loadStudy();

  on('weather', () => { weatherPill(); if (bgState().type === 'weather') { applyBackground(); paintPhoto(); } });
  on('route', renderRoute);

  setInterval(() => { store.now = new Date(); if (route === 'dash') dash.tick(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load('ruter'); });

  // Prompt 24: ikonene i Nyhetsleser lastes på forhånd, så de vises med en gang leseren åpnes.
  setTimeout(() => import('./news.js').then((m) => m.preloadNewsIcons?.()).catch(() => {}), 1200);

  // Prompt 32: SW-oppdatering (oppstart, fokus, 10 min, controllerchange) og versjonssjekk mot /version.json (5 min, fokus).
  startVersionCheck({ sw: '/sw.js' });
  // Prompt 31: presence-heartbeat mens fanen er synlig (serveren holder push tilbake da) og Web Push hvis slått på her.
  import('./webpush.js').then((m) => m.startPresence()).catch(() => {});
}

main().catch((e) => { view.innerHTML = `<div class="err">Kunne ikke starte: ${esc(e.message)}</div>`; });
