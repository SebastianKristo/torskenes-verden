import { api, esc, isMobile } from './util.js';
import { store, on, load, mountAll } from './store.js';
import { setupDnd, resetLayouts } from './dnd.js';
import { applyBackground, preloadAll } from './background.js';
import { openSettings, bindSettings, applyTop } from './settings.js';
import { bindPopup, bindSearch, menuLabels, toggle, renderTicker } from './extras.js';
import { applyHead, toggleHeadEdit, uiDefaults } from './topedit.js';
import * as dash from './dash.js';
import * as study from './study.js';
import * as space from './space.js';
import * as net from './net.js';
import * as home from './home.js';
import * as mat from './mat.js';
import * as domains from './domains.js';

const ROUTES = { dash: dash.render, studie: study.render, rom: space.render, hjem: home.render, matplan: mat.render, domener: domains.render, nettverk: net.render, mer: net.renderMore };
const view = document.getElementById('view');
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
  if (next !== route) window.scrollTo(0, 0);
  route = next;
  view.innerHTML = ROUTES[route]();
  mountAll(view);
  setupDnd(view);
  // Rom er en underside av «Mer» på mobil.
  const navKey = isMobile() && ['rom', 'nettverk', 'hjem', 'matplan', 'domener'].includes(route) ? 'mer' : route;
  document.querySelectorAll('[data-r]').forEach((a) => { if (a.dataset.r === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = { dash: 'OS', studie: 'Studie · OS', rom: 'Rom · OS', hjem: 'Hjem · OS', matplan: 'Matplan · OS', domener: 'Domener · OS', nettverk: 'Nettverk · OS', mer: 'Mer · OS' }[route];
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
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    if (act === 'settings') openSettings();
    if (act === 'reset-layout') await resetLayouts();
    if (act === 'toggle-search') await toggle('search');
    if (act === 'toggle-news') await toggle('news');
    if (act === 'head-edit') toggleHeadEdit();
    if (act === 'logout') { await api('/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; }
  });
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('resize', () => { if (isMobile() !== wasMobile) { wasMobile = isMobile(); renderRoute(); weatherPill(); } });
}

async function main() {
  const [me, ui] = await Promise.all([api('/state'), api('/ui').catch(() => uiDefaults())]);
  store.me = me;
  store.me.ui = { ...uiDefaults(), ...ui };
  document.getElementById('menu-name').textContent = store.me.user;
  document.getElementById('avatar').textContent = store.me.user[0] ?? 'S';
  menuLabels();
  bindShell();
  bindSettings();
  bindPopup();
  bindSearch();
  setupDnd(document.querySelector('header'));
  study.bind(view); space.bind(view); home.bind(view); mat.bind(view); domains.bind(view);
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

  on('weather', () => { weatherPill(); if (store.me.bg === 'vaer') applyBackground(); });
  on('route', renderRoute);

  setInterval(() => { store.now = new Date(); if (route === 'dash') dash.tick(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load('ruter'); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

main().catch((e) => { view.innerHTML = `<div class="err">Kunne ikke starte: ${esc(e.message)}</div>`; });
