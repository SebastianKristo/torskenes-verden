// Profil (navn og bilde i menyknappen) og oppsett av forsiden: skjulte widgets og faner.
import { esc, api } from './util.js';
import { store } from './store.js';

/* ---------- Profil ---------- */

export const initial = (name) => esc((String(name || '?').trim()[0] ?? '?').toUpperCase());

export function avatarHtml(me, cls = '') {
  return me?.avatarUrl ? `<img class="${cls}" src="${esc(me.avatarUrl)}" alt="">` : initial(me?.name);
}

/** Navn og bilde i menyknappen øverst til høyre. */
export function applyProfile() {
  const me = store.me.me ?? {};
  const av = document.getElementById('avatar');
  av.innerHTML = avatarHtml(me);
  av.classList.toggle('has-img', !!me.avatarUrl);
  document.getElementById('menu-name').innerHTML = `${esc(me.name ?? '')}<span>${esc(me.username ? '@' + me.username : '')}${store.me.serverName ? ' · ' + esc(store.me.serverName) : ''}</span>`;
}

/** Beskjærer bildet til et kvadrat på 256×256 og gjør det om til JPEG (kvalitet 0,85) før opplasting. */
export async function cropAvatar(file, size = 256) {
  let src;
  try { src = await createImageBitmap(file); } catch {
    src = await new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error('Kunne ikke lese bildet. Prøv JPG eller PNG.')); img.src = URL.createObjectURL(file); });
  }
  const c = document.createElement('canvas'), k = Math.max(size / src.width, size / src.height);
  c.width = c.height = size;
  c.getContext('2d').drawImage(src, (size - src.width * k) / 2, (size - src.height * k) / 2, src.width * k, src.height * k);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}

export async function uploadAvatar(file) {
  const blob = await cropAvatar(file);
  const fd = new FormData(); fd.append('file', blob, 'avatar.jpg');
  store.me.me = await api('/me/avatar', { method: 'POST', body: fd });
  applyProfile();
  return store.me.me;
}
export async function removeAvatar() {
  store.me.me = await api('/me/avatar', { method: 'DELETE' });
  applyProfile();
}

/* ---------- Forside og meny ---------- */

// Widgets på dashboardet som kan skjules (id → navn). Rekkefølgen styres av dra-og-slipp / ▲▼.
export const DASH_WIDGETS = [['d_cal', 'Skolekalender'], ['d_agenda', 'Agenda'], ['d_trading', 'Trading 212'], ['d_energy', 'Energi'], ['d_eco', 'Økonomi'], ['d_links', 'Snarveier'], ['d_upcoming', 'Kommer ut'], ['d_media', 'Media'], ['d_media_hist', 'Mediehistorikk'], ['d_pos', 'Posisjon · familie'], ['d_bday', 'Bursdager · neste'], ['d_kal', 'Kalender']];
export const MOBILE_WIDGETS = [['d_weather_m', 'Vær og pakker'], ['d_agenda', 'I dag'], ['d_trading', 'Trading 212'], ['d_energy', 'Energi'], ['d_eco', 'Økonomi'], ['d_upcoming', 'Kommer ut'], ['d_media', 'Media'], ['d_media_hist', 'Mediehistorikk'], ['d_pos', 'Posisjon · familie'], ['d_bday', 'Bursdager · neste'], ['d_kal', 'Kalender']];
export const TABS = [['dash', 'Dashboard'], ['chat', 'Chat'], ['studie', 'Studie'], ['rom', 'Rom'], ['okonomi', 'Økonomi'], ['hjem', 'Hjem'], ['matplan', 'Mat'], ['sporing', 'Sporing'], ['familie', 'Familie'], ['domener', 'Domener'], ['nettverk', 'Nettverk'], ['huskeliste', 'Huskeliste'], ['bursdager', 'Bursdager'], ['kalender', 'Kalender']];
// ISO2: Hjem, Mat og Sporing har egne data per bruker; bare Domener er for administratorer.
const ADMIN_TABS = ['domener'];
export const FIXED_TABS = ['dash'];

const layout = () => (store.me.layout ??= {});
export const hiddenWidgets = () => new Set(layout().hiddenWidgets ?? []);
export const hiddenTabs = () => new Set([...(layout().hiddenTabs ?? []), ...(store.me.me?.role === 'admin' ? [] : ADMIN_TABS)].filter((k) => !FIXED_TABS.includes(k)));
export const tabAllowed = (k) => store.me.me?.role === 'admin' || !ADMIN_TABS.includes(k);

export async function saveLayout(changes) {
  Object.assign(layout(), changes);
  const r = await api('/me/layout', { method: 'PUT', json: { homelab: changes } }).catch(() => null);
  if (r?.homelab) store.me.layout = r.homelab;
}

const DEF_NAME = Object.fromEntries(TABS);
/** Navnet brukeren har gitt fanen, eller standardnavnet. */
export const tabLabel = (id, def = DEF_NAME[id] ?? id) => layout().labels?.[id] || def;

/** Skjuler og gir nytt navn til faner i topplinjen og bunnmenyen. Skjulte sider kan fortsatt åpnes med lenke. */
export function applyNav() {
  const hid = hiddenTabs();
  document.querySelectorAll('.pillnav [data-r], .bottomnav [data-r]').forEach((a) => {
    a.hidden = hid.has(a.dataset.r);
    a.dataset.def ??= a.textContent;
    a.textContent = tabLabel(a.dataset.r, a.dataset.def);
  });
}
