// Homelab-tema: «Nåværende» (cur) eller «Vindu og papir» (2c). Valget lagres per bruker i /api/me/layout.hlTheme,
// med localStorage som reserve (og for innloggingssiden, som ikke vet hvem brukeren er). Bare det visuelle byttes.
import { api, esc } from './util.js';
import { store } from './store.js';

const KEY = 'hl_theme';
const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
export const THEMES = [['cur', 'Nåværende', 'Mørkt glass over bakgrunnsbildet.'], ['2c', 'Vindu og papir', 'Bildet som et bredt vindu øverst, resten på lyst papir i avisspalter.']];

const local = () => { try { return localStorage.getItem(KEY) === '2c' ? '2c' : 'cur'; } catch { return 'cur'; } };
const remember = (t) => { try { localStorage.setItem(KEY, t); } catch { /* privat modus */ } };
let theme = document.documentElement.dataset.hl === '2c' ? '2c' : local();

export const hlTheme = () => theme;
export const is2c = () => theme === '2c';

export function applyHlTheme() {
  const root = document.documentElement;
  root.dataset.hl = theme;
  root.dataset.hlTheme = theme; // news.js bruker papirpaletten når denne er «2c»
  if (theme === '2c' && !document.querySelector('link[data-hl-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONTS; l.dataset.hlFonts = '';
    document.head.appendChild(l);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === '2c' ? '#f3efe6' : '#07080b');
  // Logoen er «OS» i dagens tema og navnet på serveren (Homelab) i Vindu og papir.
  const logo = document.querySelector('header.top .logo');
  if (logo) {
    logo.dataset.os ??= logo.textContent;
    logo.textContent = theme === '2c' ? (store.me?.serverName || 'Homelab') : logo.dataset.os;
  }
}

/** Henter valget fra serveren. Tåler at serveren ikke kjenner feltet ennå (da gjelder localStorage). */
export async function loadHlTheme() {
  const l = await api('/me/layout').catch(() => null);
  if (l && (l.hlTheme === '2c' || l.hlTheme === 'cur') && l.hlTheme !== theme) { theme = l.hlTheme; remember(theme); }
  applyHlTheme();
  return theme;
}

export async function setHlTheme(t) {
  theme = t === '2c' ? '2c' : 'cur';
  remember(theme);
  applyHlTheme();
  document.dispatchEvent(new Event('hl:theme'));
  await api('/me/layout', { method: 'PUT', json: { hlTheme: theme } }).catch(() => {});
}

/** Velgeren som finnes i begge temaene: to små kort med forhåndsvisning. */
export const themeCards = () => `<div class="hl-themes">${THEMES.map(([k, n, s]) => `<button type="button" class="hl-theme-opt" data-hl-theme="${k}" aria-pressed="${theme === k}">
  <span class="hl-theme-prev ${k}"><i></i><i></i><i></i></span><b>${esc(n)}</b><span>${esc(s)}</span></button>`).join('')}</div>`;

/* ---------- Fotovinduet (Dashboard og Rom i Vindu og papir) ---------- */

// Bakgrunnsbildet (background.js) tegnes i vinduet; valgene her er de samme som under Utseende → Bakgrunn.
const PLANETS = ['mane', 'jorda', 'saturn'];
export const pwKind = () => { const b = store.me?.bg; return b === 'oslo' ? 'oslo' : b === 'vaer' ? 'vaer' : b === 'egen' ? 'egen' : PLANETS.includes(b) ? 'planet' : 'none'; };
const CREDIT = { oslo: 'Foto: Wikimedia Commons (CC BY-SA)', vaer: 'Foto: Wikimedia Commons', planet: 'NASA / JPL', egen: 'Eget bilde', none: '' };

export function pwBgSel() {
  const k = pwKind();
  const opts = [['oslo', 'Oslo'], ['vaer', 'Vær nå'], ['planet', 'Planeter']];
  if (store.me?.bgCustom?.egen) opts.push(['egen', 'Eget bilde']);
  return `<div class="pw-bgsel" role="group" aria-label="Bakgrunn i vinduet">${opts.map(([v, n]) => `<button type="button" data-pw-bg="${v}" aria-pressed="${k === v}">${n}</button>`).join('')}</div>`;
}

// Planeter: dagens NASA-bilde fra serveren når det finnes (GET /api/photo-window), ellers Saturn fra forhåndsvalgene.
let apod = null, apodAsked = false;
export function pwCredit() {
  const k = pwKind();
  if (k === 'planet' && apod?.url) return apod.credit || 'NASA · dagens rombilde';
  return CREDIT[k] ?? '';
}
export function pwOverlay() {
  if (pwKind() !== 'planet') return '';
  if (!apodAsked) {
    apodAsked = true;
    api('/photo-window?kind=planets').then((r) => {
      if (r?.url) { apod = r; document.querySelectorAll('.pw-apod').forEach((el) => { el.style.backgroundImage = `url('${r.url.replace(/'/g, '%27')}')`; el.classList.add('on'); }); document.querySelectorAll('.pw-credit').forEach((el) => { el.textContent = pwCredit(); }); }
    }).catch(() => {});
  }
  return `<div class="pw-apod${apod?.url ? ' on' : ''}" style="${apod?.url ? `background-image:url('${esc(apod.url)}')` : ''}"></div>`;
}

/** Velger bakgrunn fra vinduet. Lagres som bakgrunnsbildet (samme innstilling som før) og som layout.photo for mobilappene. */
export async function pickPw(kind, applyBackground) {
  const map = { oslo: 'oslo', vaer: 'vaer', egen: 'egen', planet: PLANETS.includes(store.me.bg) ? store.me.bg : 'saturn' };
  const bg = map[kind];
  if (!bg) return;
  store.me.bg = bg;
  applyBackground();
  api('/settings/bg', { method: 'PUT', json: { value: bg } }).catch(() => {});
  api('/me/layout', { method: 'PUT', json: { photo: { oslo: 'oslo', vaer: 'weather', planet: 'planets', egen: 'custom' }[kind] } }).catch(() => {});
}
