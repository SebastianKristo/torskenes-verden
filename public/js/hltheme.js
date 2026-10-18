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
  // Profilmenyen: bytte av tema, og «Logg ut» i stedet for «Lås» i Vindu og papir.
  const sw = document.getElementById('menu-theme');
  if (sw) sw.textContent = theme === '2c' ? 'Bytt til nåværende tema' : 'Bytt til Vindu og papir';
  const lo = document.querySelector('.menu [data-act="logout"]');
  if (lo) { lo.dataset.def ??= lo.textContent; lo.textContent = theme === '2c' ? 'Logg ut' : lo.dataset.def; }
  renderBgMenu();
}

/** Henter valget fra serveren. Tåler at serveren ikke kjenner feltet ennå (da gjelder localStorage). */
export async function loadHlTheme() {
  const l = await api('/me/layout').catch(() => null);
  if (l && (l.hlTheme === '2c' || l.hlTheme === 'cur') && l.hlTheme !== theme) { theme = l.hlTheme; remember(theme); }
  if (l && PHOTO_KINDS.includes(l.photo)) photo = l.photo;
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

/* ---------- Fotovinduet ---------- */
// Bildet øverst på alle sider i Vindu og papir. Valget deles med mobilappene (/api/me/layout.photo) og hentes fra serveren
// (GET /api/photo-window), som laster ned og cacher bildene selv, så ingenting hotlinkes. Feiler et bilde, prøves neste
// i settet; feiler alle, vises gradienten med en liten melding.
const PHOTO_KINDS = ['cur', 'oslo', 'weather', 'planets', 'custom'];
const PHOTO_MENU = [['oslo', 'Oslo', 'Byen fra lufta'], ['weather', 'Vær nå', 'Følger været ute'], ['planets', 'Planeter', 'Dagens bilde fra NASA'], ['cur', 'Ingen bilde', 'Bare fargeovergang']];
const FALLBACK_GRAD = 'linear-gradient(170deg,#7d93aa,#4a5f76)';
let photo = 'oslo';
const cache = new Map(); // kind → { r, at, url, failed }
let bgOpen = false;

export const photoKind = () => photo;
const photoName = (k) => (k === 'custom' ? 'Eget bilde' : PHOTO_MENU.find((x) => x[0] === k)?.[1] ?? 'Bakgrunn');

function tryLoad(urls) {
  return new Promise((res) => {
    const next = (i) => {
      if (i >= urls.length) return res(null);
      const img = new Image();
      img.onload = () => res(urls[i]);
      img.onerror = () => { console.warn('[fotovindu] fikk ikke lastet', urls[i]); next(i + 1); };
      img.src = urls[i];
    };
    next(0);
  });
}

async function resolvePhoto(kind, force) {
  const hit = cache.get(kind);
  // «Vær nå» kan bytte bilde når været endrer seg: hentes på nytt hver time.
  if (hit && !force && (kind !== 'weather' || Date.now() - hit.at < 3600_000)) return hit;
  const ent = { at: Date.now(), r: null, url: null, failed: false, pending: true };
  cache.set(kind, ent);
  if (kind !== 'cur') {
    ent.r = await api(`/photo-window?kind=${kind}`).catch(() => null);
    const urls = [ent.r?.url, ...(ent.r?.fallbacks ?? [])].filter(Boolean);
    ent.url = urls.length ? await tryLoad(urls) : null;
    ent.failed = !ent.url && (urls.length > 0 || !ent.r);
  }
  ent.pending = false;
  return ent;
}

/** Laget med bildet; tegnes i fotovinduet og fylles når bildet er lastet. */
export const pwImg = () => `<div class="pw-img" aria-hidden="true"></div>`;

export function pwCredit() {
  const e = cache.get(photo);
  if (photo === 'cur') return '';
  if (e?.failed) return '';
  return e?.r?.credit ?? '';
}

/** Fyller alle fotovinduer på siden med valgt bilde (eller gradienten). */
export async function paintPhoto(force) {
  if (!is2c()) return;
  const e = await resolvePhoto(photo, force);
  const grad = e.r?.gradient || FALLBACK_GRAD;
  document.querySelectorAll('.pw-img').forEach((el) => {
    el.style.backgroundImage = e.url ? `url("${e.url.replace(/"/g, '%22')}")` : grad;
    el.classList.add('on');
  });
  document.querySelectorAll('.pw-credit').forEach((el) => { el.textContent = pwCredit(); });
  document.querySelectorAll('.pw-fail').forEach((el) => { el.hidden = !e.failed; });
  renderBgMenu();
}

/** Bakgrunnsvelgeren i topplinjen: egen nedtrekksmeny med miniatyrer, ✓ på valgt rad og «+ Eget bilde». */
export function renderBgMenu() {
  const host = document.getElementById('hl-bgdd');
  if (!host) return;
  if (!is2c()) { host.innerHTML = ''; return; }
  const custom = store.me?.layout?.photoCustom || cache.get('custom')?.url || photo === 'custom';
  const rows = [...PHOTO_MENU.slice(0, 3), ...(custom ? [['custom', 'Eget bilde', 'Ditt opplastede bilde']] : []), PHOTO_MENU[3]];
  const thumb = (k) => { const e = cache.get(k); return k !== 'cur' && e?.url ? `url('${e.url.replace(/['"()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))}')` : FALLBACK_GRAD; };
  host.innerHTML = `<button type="button" class="hl-bgdd-btn" data-bgdd aria-haspopup="menu" aria-expanded="${bgOpen}">${esc(photoName(photo))} ▾</button>
    <div class="hl-bgdd-menu${bgOpen ? ' open' : ''}" role="menu">${rows.map(([k, n, s]) => {
      const fail = cache.get(k)?.failed && k !== 'cur';
      return `<button type="button" role="menuitemradio" aria-checked="${photo === k}" data-photo="${k}"><span class="th" style="background-image:${thumb(k)}"></span><span class="tx"><span>${esc(n)}</span><small>${esc(fail ? 'Fikk ikke lastet bildet' : s)}</small></span><b>${photo === k ? '✓' : ''}</b></button>`;
    }).join('')}
      <label class="hl-bgdd-up">+ Eget bilde<input type="file" accept="image/*" hidden data-photo-up></label></div>`;
  // Miniatyrene lastes i bakgrunnen første gang menyen åpnes.
  if (bgOpen) for (const [k] of rows) if (k !== 'cur' && !cache.has(k)) resolvePhoto(k).then(() => bgOpen && renderBgMenu());
}

async function pickPhoto(k) {
  photo = k; bgOpen = false;
  (store.me.layout ??= {});
  paintPhoto();
  api('/me/layout', { method: 'PUT', json: { photo: k } }).catch(() => {});
}

/** Kobler bakgrunnsvelgeren og «trykk for å prøve igjen». Kalles én gang. */
export function bindPhoto() {
  document.addEventListener('click', (e) => {
    const host = document.getElementById('hl-bgdd');
    if (e.target.closest('[data-bgdd]')) { bgOpen = !bgOpen; document.getElementById('menu')?.setAttribute('hidden', ''); renderBgMenu(); return; }
    const p = e.target.closest('[data-photo]');
    if (p) { pickPhoto(p.dataset.photo); return; }
    if (e.target.closest('.pw-fail')) { cache.delete(photo); paintPhoto(true); return; }
    if (bgOpen && host && !host.contains(e.target)) { bgOpen = false; renderBgMenu(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bgOpen) { bgOpen = false; renderBgMenu(); } });
  document.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-photo-up]');
    if (!inp?.files?.[0]) return;
    const fd = new FormData();
    fd.append('file', inp.files[0]);
    try {
      await api('/me/photo-window', { method: 'POST', body: fd });
      cache.delete('custom');
      (store.me.layout ??= {}).photoCustom = true;
      await pickPhoto('custom');
    } catch (err) { console.warn('[fotovindu] opplasting feilet', err); alert('Kunne ikke laste opp bildet: ' + err.message); }
  });
}

/* ---------- Toppen av hver side ---------- */
// Dashboardet har et høyt vindu med hilsen og vær; de andre sidene et lavt (240 px) med kicker og sidetittel.
const weekNo = (d = new Date()) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
const HEAD = {
  studie: () => [`Uke ${weekNo()}`, 'Studie'],
  rom: () => ['NASA · dagens rombilde', 'Satellitt og teleskop'],
  hjem: () => ['Home Assistant', 'Hjem'],
  matplan: () => [`Uke ${weekNo()}`, 'Mat'],
  sporing: () => ['Pakker og sendinger', 'Sporing'],
  domener: () => ['Trafikk, oppetid og sikkerhet', 'Domener'],
  nettverk: () => ['Nettverk og lenker', 'Nettverk'],
  mer: () => ['Alle sider', 'Mer'],
};

/** Det lave fotovinduet øverst på alle sider unntatt Dashboard. */
export function pwHeader(route) {
  const h = HEAD[route]?.();
  if (!h) return '';
  return `<section class="pw pw-low">${pwImg()}<div class="pw-bottom"><div><div class="pw-kick">${esc(h[0])}</div><div class="pw-title">${esc(h[1])}</div></div></div>
    <button type="button" class="pw-fail" hidden>Fikk ikke lastet bildet · trykk for å prøve igjen</button></section>`;
}
