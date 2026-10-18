import { api, esc, isMobile } from './util.js';
import { store, on, load, mountAll } from './store.js';
import { setupDnd, resetLayouts } from './dnd.js';
import { applyBackground, preloadAll } from './background.js';
import { bgState } from './bgsvc.js';
import { openSettings, bindSettings, applyTop } from './settings.js';
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
import './finpreload.js';
import { logout, noteUser } from './usercache.js';
import { loadAppIdentity, appName } from './appicon.js';
import { scrollMemory } from './scrollmem.js';
import { loadHlTheme, applyHlTheme, is2c, setHlTheme, pwHeader, paintPhoto, bindPhoto } from './hltheme.js';

const ROUTES = { dash: dash.render, studie: study.render, rom: space.render, hjem: home.render, matplan: mat.render, sporing: tracking.render, familie: family.render, huskeliste: tasks.render, vaer: weatherPage.render, domener: domains.render, nettverk: net.render, mer: net.renderMore };
const view = document.getElementById('view');
const scrollMem = scrollMemory();
let route = null, wasMobile = isMobile();

function current() {
  const r = location.hash.replace(/^#\/?/, '');
  // Økonomi er nå FinansHub, en egen fullskjerm-app.
  if (r === 'okonomi') { location.replace('/finans/'); return 'dash'; }
  if (r === 'mer' && !isMobile()) return 'nettverk';
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
  view.innerHTML = (is2c() && route !== 'vaer' ? pwHeader(route) : '') + ROUTES[route]();
  placeTicker();
  paintPhoto();
  mountAll(view);
  setupDnd(view);
  // Rom er en underside av «Mer» på mobil.
  const navKey = isMobile() && ['rom', 'nettverk', 'hjem', 'matplan', 'sporing', 'familie', 'huskeliste', 'domener'].includes(route) ? 'mer' : route;
  document.querySelectorAll('[data-r]').forEach((a) => { if (a.dataset.r === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  setTitle();
  // Prompt 23: tilbake gir samme scrollposisjon som før, nye sider åpner øverst.
  scrollMem.enter(route);
}

// Fanetittelen: «Side · Appnavn» (appnavnet fra Innstillinger → App, standard «Homelab»).
const TITLES = { vaer: 'Vær', studie: 'Studie', rom: 'Rom', hjem: 'Hjem', matplan: 'Mat', sporing: 'Sporing', familie: 'Familie', huskeliste: 'Huskeliste', domener: 'Domener', nettverk: 'Nettverk', mer: 'Mer' };
function setTitle() { document.title = TITLES[route] ? `${TITLES[route]} · ${appName()}` : appName(); }

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

function bindShell() {
  const btn = document.getElementById('profile-btn'), menu = document.getElementById('menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('click', async (e) => {
    if (e.target.closest('.ticker-label')) { e.preventDefault(); openNewsReader(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    if (act === 'settings') openSettings();
    if (act === 'hl-theme') await setHlTheme(is2c() ? 'cur' : '2c');
    if (act === 'layout') openSettings('top');
    if (act === 'news-speed') openSettings('top', 'speed');
    if (act === 'reset-layout') await resetLayouts();
    if (act === 'toggle-search') await toggle('search');
    if (act === 'toggle-news') await toggle('news');
    if (act === 'head-edit') toggleHeadEdit();
    if (act === 'logout') await logout();
  });
  window.addEventListener('hashchange', renderRoute);
  document.addEventListener('hl:theme', () => { route = null; renderRoute(); weatherPill(); });
  document.addEventListener('hl:name', renderRoute); // nytt navn i hilsenen med en gang
  document.addEventListener('hl:app', () => { setTitle(); applyHlTheme(); }); // nytt appnavn eller ikon
  window.addEventListener('resize', () => { if (isMobile() !== wasMobile) { wasMobile = isMobile(); renderRoute(); weatherPill(); } });
}

async function main() {
  const [me, ui] = await Promise.all([api('/state'), api('/ui').catch(() => uiDefaults()), loadHlTheme(), loadAppIdentity()]);
  store.me = me;
  noteUser(me?.me?.id); // kontobytte: tøm den forrige brukerens cacher
  store.me.ui = { ...uiDefaults(), ...ui };
  applyHlTheme();
  applyProfile();
  applyNav();
  menuLabels();
  bindShell();
  bindPhoto();
  bindSettings();
  bindPopup();
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

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

main().catch((e) => { view.innerHTML = `<div class="err">Kunne ikke starte: ${esc(e.message)}</div>`; });
