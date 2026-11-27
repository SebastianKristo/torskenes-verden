import { api, esc, isMobile } from './util.js';
import { store, on, load, mountAll } from './store.js';
import { setupDnd, resetLayouts } from './dnd.js';
import { applyBackground, preloadAll } from './background.js';
import { bgState } from './bgsvc.js';
import { openSettings, bindSettings, applyTop, settingsOwnsHash, preloadSettings } from './settings.js';
import { bindPopup, bindSearch, menuLabels, toggle, renderTicker } from './extras.js';
import { applyHead, toggleHeadEdit, uiDefaults } from './topedit.js';
import { applyProfile, applyNav } from './profile.js';
import * as study from './study.js';
import { poll, wakePolls } from './lib/poll.js';
import { initI18n, setLang, lang } from './i18n.js';
import { loadUpdBanner } from './upd-banner.js';
import { loadProfileMenu, renderProfileMenu, profileMenuClick, profileMenuClosed } from './profile-menu.js';
import './finpreload.js';
import { logout, noteUser } from './usercache.js';
import { loadAppIdentity, appName } from './appicon.js';
import { scrollMemory } from './scrollmem.js';
import { startVersionCheck } from './vercheck.js';
import { initShell } from './shell.js'; // små ting i skallet (Vær-trykk, Mac-appen, låsetast, julemodus, Oslo-bakgrunn …)
import { initMai17, afterMai17 } from './mai17.js'; // 17. mai på Hjem
import { loadHlTheme, applyHlTheme, is2c, setHlTheme, pwHeader, paintPhoto, bindPhoto } from './hltheme.js';
import { initPageAddons, afterPageAddons, renderKart } from './page-addons.js'; // lys/mørk, GlimtInput, logg inn som, Glimt-agent og tillegg per side
import { renderFam51, renderMedia51, afterMedfam51 } from './mediakveld-familiekalender.js'; // prompt 51 (MEDFAM51): Familiekalender og «I kveld»
import { initWeb52, after52 } from './startup.js'; // oppstart, sideanimasjon, Ruter-buffer m.m.
import { initNavOverflow } from './nav-overflow.js'; // «Alle sider ▾» i toppmenyen (Q6, B-B1/B2)
import { initNavEdit, startNavEdit } from './nav-rediger.js'; // prompt 57: hold inne en fane for å redigere toppmenyen
import { bindAvkortet } from './ui/avkortet.js'; // hele teksten som tooltip når den er kuttet med «…» (Sporing og Media, E-B13)
import { pageCss } from './lib/page-css.js';
import { loadModuler, aliasTil, viewOf, navKeyOf, tittel, subtabs } from './moduler.js'; // Fase 6: modullisten (GET /api/moduler)
// Prompt 76 (SKJWEB): Skjold Lab (#/skjold) – skallet tegnes her, selve modulen (skjold.js) lastes ved behov.
// M5: stilarket hentes samtidig med modulen (ikke først når skjold.js er lastet), og det tomme skallet har plassen sin fra layout.css.
const renderSkjold76 = () => { pageCss('skjold'); return '<section class="sk76" id="sk76" aria-label="Skjold Lab" aria-busy="true"></section>'; };

// Fase 3 (B §3 P1): rutemodulene lastes når ruten åpnes (import()), ikke alle ved oppstart. Før lastet hver rute ca. 180 moduler.
// Skallet (topplinje, meny, søk, Glimt-feltet, temaer, innstillingsinngangen) er fortsatt statisk importert over.
// MODS: modulnøkkel → lasting. ROUTES: rute → [modulnøkkel eller null, tegnefunksjon(modul)].
const MODS = {
  dash: () => Promise.all([import('./dash.js'), import('./dash-edit.js')]).then(([d, e]) => ({ ...d, mountDash: e.mountDash, startEdit: e.startEdit })),
  studie: () => import('./study-page.js'), // prompt 44: nytt Studie-design
  rom: () => import('./space.js'),
  hjem: () => import('./home.js'),
  matplan: () => import('./mat.js'),
  sporing: () => import('./tracking.js'),
  familie: () => import('./family-web.js'), // prompt 50 (FAMWEB50): Familie i nytt design (family.js)
  tasks: () => import('./tasks.js'),
  reise: () => import('./reise.js'), // Fase 6 (Q8): Reise – avganger og kart
  vaer: () => import('./weather-page.js'),
  bursdager: () => import('./birthdays.js'),
  kalender: () => import('./kalender.js'),
  chat: () => import('./chat.js'),
  media: () => import('./media-side.js'), // prompt 43: Media (Sonarr, Radarr, qBittorrent, Prowlarr)
  domener: () => import('./domains.js'),
  helse: () => import('./helse.js'), // prompt 57: egen Helse-side (#/helse, #/helse/maned)
  net: () => import('./net.js'),
};
// Modulene som kobler lyttere til visningen (#view) gjør det én gang, når de lastes.
const BIND = { rom: (m) => m.bind(view), hjem: (m) => m.bind(view), matplan: (m) => m.bind(view), sporing: (m) => m.bind(view), domener: (m) => m.bind(view) };
const r0 = (m) => m.render();
// Nøklene er visningene på web (body[data-route]); adressen oversettes til dem i moduler.js (viewOf): #/oversikt → dash,
// #/kalender/bursdager → bursdager, #/kalender/familie → familiekalender, #/reise/kart → kart. Gamle adresser (#/dash, #/huskeliste,
// #/bursdager, #/familiekalender, #/kart …) videresendes etter aliasene i modullisten (aliasTil).
const ROUTES = { dash: ['dash', r0], studie: ['studie', r0], rom: ['rom', r0], hjem: ['hjem', r0], matplan: ['matplan', r0], sporing: ['sporing', r0], familie: ['familie', r0], gjoremal: ['tasks', r0], vaer: ['vaer', r0], bursdager: ['bursdager', (m) => subtabs('kalender', 'bursdager', 'filter') + m.render()], kalender: ['kalender', r0], chat: ['chat', r0], media: ['media', r0], reise: ['reise', r0], kart: ['reise', (m) => m.kartTabs() + renderKart()], familiekalender: [null, () => subtabs('kalender', 'familie', 'filter') + renderFam51()], mediakveld: [null, renderMedia51], skjold: [null, renderSkjold76], domener: ['domener', r0], helse: ['helse', r0], nettverk: ['net', r0], mer: ['net', (m) => m.renderMore()] };
const mods = {}, loading = {};
function loadMod(k) {
  if (!k || mods[k]) return Promise.resolve(mods[k]);
  loading[k] ??= MODS[k]().then((m) => { mods[k] = m; BIND[k]?.(m); return m; }, (e) => { delete loading[k]; throw e; });
  return loading[k];
}
// Forhåndslasting: fanene ved siden av den åpne (i menyens rekkefølge) når nettleseren er ledig, og en fane man holder pekeren over.
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 2000));
function preloadNeighbours() {
  const tabs = [...document.querySelectorAll('nav [data-r]')].filter((a) => !a.hidden && !a.closest('[hidden]')).map((a) => a.dataset.r);
  const i = tabs.indexOf(route);
  const near = i < 0 ? ['dash'] : [tabs[i - 1], tabs[i + 1]];
  for (const r of near) if (ROUTES[r]?.[0]) loadMod(ROUTES[r][0]).catch(() => {});
}
const view = document.getElementById('view');
const KAL_APP = !!document.documentElement.dataset.kalApp;
const scrollMem = scrollMemory();
let route = null, wasMobile = isMobile(), isEditingPending = false;

function current() {
  // Prompt 38: Kalender.app for Mac (/kalender?app=mac) viser bare kalenderen.
  if (KAL_APP) return 'kalender';
  // Fase 6: gamle adresser videresendes (#/dash → #/oversikt, #/kart → #/reise/kart …). #/okonomi og #/finans går til /finans/.
  const to = aliasTil(location.hash);
  if (to && !to.startsWith('#')) { location.replace(to); return 'dash'; }
  if (to) history.replaceState(history.state, '', `${location.pathname}${location.search}${to}`);
  // Undersider i adressen (#/kalender/dag/2026-10-21) hører til visningen for første ledd (moduler.js viewOf).
  const r = viewOf(location.hash);
  if (r === 'mer' && !isMobile()) return 'nettverk';
  if (r === 'nyheter') return 'nyheter';
  return ROUTES[r] ? r : 'dash';
}

let renderSeq = 0;
function renderRoute() {
  let next = current();
  // Nyheter (Q10) er et ark over siden: #/nyheter åpner leseren over Oversikt.
  if (next === 'nyheter') { history.replaceState(history.state, '', `${location.pathname}${location.search}#/oversikt`); openNewsReader(); next = 'dash'; if (route === 'dash') return; }
  const seq = ++renderSeq;
  const [mk, draw] = ROUTES[next];
  // Modulen er ikke lastet ennå: siden som vises blir stående til den er klar (lokalt noen få ms).
  if (mk && !mods[mk]) {
    loadMod(mk).then(() => { if (seq === renderSeq) renderRoute(); }, (e) => { if (seq === renderSeq) swapView(`<div class="err">Kunne ikke laste siden: ${esc(e.message)}</div>`); });
    return;
  }
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
  const fsTasks = route === 'gjoremal' && !isMobile();
  document.body.classList.toggle('tk-fs40', fsTasks);
  swapView((is2c() && route !== 'vaer' && route !== 'rom' && route !== 'chat' && route !== 'media' && !fsTasks ? pwHeader(route) : '') + draw(mods[mk])); // Vær, Rom (prompt 32) og Chat (prompt 33) er fullskjerm
  placeTicker();
  paintPhoto();
  mountAll(view);
  setupDnd(view);
  if (route === 'dash') { mods.dash.mountDash(view); if (isEditingPending) { isEditingPending = false; requestAnimationFrame(() => mods.dash.startEdit()); } }
  afterMai17(route, view); // 17. mai på Hjem
  afterPageAddons(route, view);
  afterMedfam51(route, view); // prompt 51 (MEDFAM51)
  after52(route, view); // oppstart og sideanimasjon (startup.js)
  if (route === 'skjold') import('./skjold.js').then((m) => m.mount(view)).catch((e) => console.warn('skjold76', e)); // prompt 76
  // Fanen som markeres: modulen visningen hører til (bursdager → kalender). På mobil er alt som ikke står i bunnmenyen under «Mer».
  const mk2 = navKeyOf(route);
  const navKey = isMobile() && route !== 'mer' && !document.querySelector(`.bottomnav [data-r="${mk2}"]`) ? 'mer' : route === 'mer' ? 'mer' : mk2;
  document.querySelectorAll('[data-r]').forEach((a) => { if (a.dataset.r === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  setTitle();
  // Prompt 23: tilbake gir samme scrollposisjon som før, nye sider åpner øverst.
  scrollMem.enter(route);
  wakePolls(); // hentinger som venter på at ruten vises
  idle(preloadNeighbours);
}

// Prompt 87 (claude-code-web-navigasjon-uten-reload.md): fotovinduet øverst hører til skallet og skal ikke tegnes på nytt ved fanebytte.
// Før ble hele visningen (også fotovinduet) byttet med innerHTML, så bildet startet tomt og ble tonet inn igjen for hvert trykk.
//  - Lavt vindu → lavt vindu (Studie → Hjem): samme element blir stående; bare kicker og tittel byttes, og innholdet under.
//  - Ellers (Dashboard ↔ andre sider): det nye vinduet overtar bildelaget som allerede er malt, så bildet aldri er borte.
function swapView(html) {
  const oldPw = view.querySelector('.pw'), oldImg = oldPw?.querySelector(':scope > .pw-img');
  if (oldPw?.classList.contains('pw-low') && oldPw === view.firstElementChild && oldImg) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const nextPw = tpl.content.firstElementChild;
    const nextBottom = nextPw?.classList.contains('pw-low') ? nextPw.querySelector(':scope > .pw-bottom') : null;
    const oldBottom = oldPw.querySelector(':scope > .pw-bottom');
    if (nextBottom && oldBottom) {
      if (oldBottom.innerHTML !== nextBottom.innerHTML) oldBottom.replaceWith(nextBottom);
      nextPw.remove();
      while (oldPw.nextSibling) oldPw.nextSibling.remove();
      view.appendChild(tpl.content);
      return;
    }
  }
  view.innerHTML = html;
  const img = view.querySelector('.pw > .pw-img');
  if (oldImg && img && oldImg.style.backgroundImage) img.replaceWith(oldImg);
}

// Fanetittelen: «Side · Appnavn» (appnavnet fra Innstillinger → Utseende, standard «Homelab»). Navnet på siden kommer fra modullisten
// (moduler.js tittel): undersiden når den har egen adresse (Bursdager, I kveld, Kart), ellers modulen. Oversikt har bare appnavnet.
// Mens Innstillinger er åpne, eier de tittelen (settings-view.js); når de lukkes, sendes hl:title og tittelen settes her igjen.
function setTitle() {
  if (document.body.classList.contains('set-open')) return;
  const t = route === 'mer' ? 'Mer' : route === 'dash' ? null : tittel(location.hash);
  document.title = KAL_APP ? 'Kalender' : t ? `${t} · ${appName()}` : appName();
}

// Nyhetsbaren ligger under topplinjen, men i Vindu og papir under søkefeltet på papiret.
function placeTicker() {
  const t = document.getElementById('ticker'), slot = document.getElementById('p-ticker-slot');
  if (!t) return;
  if (slot) slot.appendChild(t);
  else if (t.parentElement !== document.querySelector('.shell')) document.querySelector('header.top').after(t);
}

// «SISTE NYTT ›» åpner den felles nyhetsleseren (news.js). Finnes den ikke ennå, skjer ingenting.
async function openNewsReader() {
  try { const m = await import('./news.js'); (m.openNews ?? m.default)?.(); } catch (e) { console.warn('Nyheter er ikke tilgjengelig', e); }
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
    if (act === 'lang') { await setLang(lang() === 'en' ? 'nb' : 'en'); langLabel(); }
    if (act === 'layout') openSettings('top');
    if (act === 'news-speed') openSettings('top', 'speed');
    if (act === 'reset-layout') await resetLayouts();
    if (act === 'toggle-search') await toggle('search');
    if (act === 'toggle-news') await toggle('news');
    if (act === 'head-edit') toggleHeadEdit();
    if (act === 'nav-edit') startNavEdit();
    if (act === 'dash-edit') { if (current() !== 'dash' || !mods.dash) { isEditingPending = true; location.hash = '#/oversikt'; } else mods.dash.startEdit(); }
    if (act === 'logout') {
      if (!confirm('Logge ut? Denne enheten må da logge inn med passord igjen.')) return;
      const d = await api('/devices').catch(() => null), cur = d?.devices?.find((x) => x.current);
      if (cur) await api(`/devices/${cur.id}`, { method: 'DELETE' }).catch(() => {});
      await logout();
    }
  });
  // Innstillinger legger #/innstillinger/<fane> i adressen (og fjerner den igjen) uten at siden under skal tegnes på nytt.
  // Prompt 44: Media styrer sin egen adresse (#/media/sonarr/s/12 …, frem/tilbake), så siden tegnes ikke på nytt for den.
  window.addEventListener('hashchange', (e) => { store.prevUrl = e.oldURL; }); // Chat (lastes ved behov) vil vite hvor man kom fra
  window.addEventListener('hashchange', () => { if (!settingsOwnsHash() && !(route === 'media' && current() === 'media' && mods.media?.ownsHash?.()) && !(route === 'familie' && current() === 'familie' && mods.familie?.ownsHash?.()) && !(route === 'skjold' && current() === 'skjold')) renderRoute(); }); // prompt 76: Skjold Lab styrer sine egne undersider
  // Pekeren over en fane eller profilknappen: last modulen (eller innstillingene) før trykket.
  document.querySelector('nav')?.addEventListener('pointerover', (e) => { const r = e.target.closest?.('[data-r]')?.dataset.r; if (ROUTES[r]?.[0]) loadMod(ROUTES[r][0]).catch(() => {}); }, { passive: true });
  btn.addEventListener('pointerenter', preloadSettings, { once: true, passive: true });
  document.addEventListener('hl:theme', () => { route = null; renderRoute(); weatherPill(); });
  // Nytt språk: tegn visningen på nytt (tekster fra t() og Intl-datoer).
  document.addEventListener('hl:lang', () => { route = null; renderRoute(); weatherPill(); langLabel(); renderTicker(); });
  document.addEventListener('hl:name', renderRoute); // nytt navn i hilsenen med en gang
  document.addEventListener('hl:dash36', () => { if (route === 'dash') { route = null; renderRoute(); } }); // prompt 36: widget lagt til igjen
  // Prompt 40: julemodus endret (figurbiblioteket) → siden tegnes på nytt, så Glimt får lua med en gang. Ikke i Chat (strømmer).
  window.addEventListener('glimt-jul', () => { if (route !== 'chat') { route = null; renderRoute(); } });
  document.addEventListener('hl:app', () => { setTitle(); applyHlTheme(); }); // nytt appnavn eller ikon
  document.addEventListener('hl:title', setTitle); // Innstillinger ble lukket (E-B10)
  bindAvkortet();
  window.addEventListener('resize', () => { if (isMobile() !== wasMobile) { wasMobile = isMobile(); renderRoute(); weatherPill(); } });
}

async function main() {
  loadMod(ROUTES[current()]?.[0]).catch(() => {}); // rutemodulen lastes mens oppstartsdataene hentes
  const [me, ui, , , lay44] = await Promise.all([api('/state'), api('/ui').catch(() => uiDefaults()), loadHlTheme(), loadAppIdentity(), api('/me/layout').catch(() => null), loadModuler(api)]);
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
  initShell(KAL_APP); // onboarding og Vær-tilbake hører ikke hjemme i Mac-appen
  initMai17();
  initPageAddons(lay44);
  initWeb52();
  bindSearch();
  setupDnd(document.querySelector('header'));
  if (!KAL_APP) { initNavOverflow(); initNavEdit(); } // etter setupDnd: «Mer ▾» er ikke en flyttbar fane
  study.bind(view); // Rom, Hjem, Mat, Sporing og Domener kobler seg til når modulen lastes (BIND)
  applyTop();
  applyHead();
  renderTicker();
  preloadAll();
  applyBackground();
  renderRoute();

  // Henter data parallelt; hver widget oppdateres når sine data kommer.
  // Fase 3 (B §3 P2/B7): det som bare vises på Dashboard (og Nettverk/Mer for helse), hentes periodisk bare mens den ruten
  // vises og fanen er synlig (lib/poll.js). Første henting skjer med en gang på riktig rute, ellers én gang når nettleseren
  // er ledig, så dashbordet er klart når man går dit. Vær (topplinjen) og skole (Kalender, Studie, Dashboard) hentes alltid.
  const onDash = () => route === 'dash', onNet = () => route === 'nettverk' || route === 'mer';
  const every = (key, ms, visible, path) => poll(() => load(key, path), ms, visible ? { visible, first: 'idle' } : { first: 'now' });
  every('ruter', 30_000, () => route === 'dash' || route === 'reise'); // avgangene vises på Oversikt og i Reise
  every('weather', 15 * 60_000);
  every('school', 15 * 60_000);
  every('trading', 60_000, onDash);
  every('energy', 60_000, onDash);
  every('health', 60_000, onNet);
  every('upcoming', 10 * 60_000, onDash);
  every('news', 5 * 60_000, onDash);
  every('finans', 5 * 60_000, onDash, '/../finans/api/summary');
  study.loadStudy();

  on('weather', () => { weatherPill(); if (bgState().type === 'weather') { applyBackground(); paintPhoto(); } });
  on('route', renderRoute);

  setInterval(() => { store.now = new Date(); if (route === 'dash' && !document.hidden) mods.dash?.tick(); }, 1000);

  // Prompt 24: ikonene i Nyhetsleser lastes på forhånd, så de vises med en gang leseren åpnes.
  setTimeout(() => import('./news.js').then((m) => m.preloadNewsIcons?.()).catch(() => {}), 1200);

  // Prompt 32: SW-oppdatering (oppstart, fokus, 10 min, controllerchange) og versjonssjekk mot /version.json (5 min, fokus).
  startVersionCheck({ sw: '/sw.js' });
  // Prompt 31: presence-heartbeat mens fanen er synlig (serveren holder push tilbake da) og Web Push hvis slått på her.
  import('./webpush.js').then((m) => m.startPresence()).catch(() => {});
}

// Logo som ikke lar seg hente (Media-brikker på Dashboard, transportører i Sporing): skjul bildet (CSP tillater ikke inline onerror).
// Lå i media.js; flyttet hit i Fase 3 fordi media.js nå lastes med Dashboard, og Sporing kan åpnes først.
document.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && (img.parentNode?.classList?.contains('media-chip') || img.classList.contains('trk-logo'))) img.remove(); }, true);

main().catch((e) => { view.innerHTML = `<div class="err">Kunne ikke starte: ${esc(e.message)}</div>`; });
