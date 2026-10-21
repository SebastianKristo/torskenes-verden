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
  // Prompt 30: overskriften i profilmenyen (navn + rolle, ikke @brukernavn) tegnes av profile-menu.js.
  document.dispatchEvent(new Event('hl:menu'));
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
export const TABS = [['dash', 'Dashboard'], ['vaer', 'Vær'], ['chat', 'Chat'], ['studie', 'Studie'], ['rom', 'Rom'], ['okonomi', 'Økonomi'], ['hjem', 'Hjem'], ['matplan', 'Mat'], ['sporing', 'Sporing'], ['familie', 'Familie'], ['domener', 'Domener'], ['nettverk', 'Nettverk'], ['huskeliste', 'Gjøremål'], ['bursdager', 'Bursdager'], ['kalender', 'Kalender'], ['media', 'Media']]; // prompt 43: Media (indeks 15) vises etter Familie
// ISO2: Hjem, Mat og Sporing har egne data per bruker; bare Domener er for administratorer.
const ADMIN_TABS = ['domener'];
export const FIXED_TABS = ['dash'];

const layout = () => (store.me.layout ??= {});
export const hiddenWidgets = () => new Set(layout().hiddenWidgets ?? []);
export const hiddenTabs = () => new Set([...(layout().hiddenTabs ?? []), ...(store.me.me?.role === 'admin' ? [] : ADMIN_TABS), ...(mediaAllowed() ? [] : ['media'])].filter((k) => !FIXED_TABS.includes(k)));
export const tabAllowed = (k) => (k === 'media' ? mediaAllowed() : store.me.me?.role === 'admin' || !ADMIN_TABS.includes(k));
// Prompt 43: Media er for admin og dem admin gir tilgang (modulen «media»; serveren sier fra med 403 ellers).
const mediaAllowed = () => { const me = store.me.me ?? {}; return me.role === 'admin' || me.media === true || (Array.isArray(me.modules) && me.modules.includes('media')); };

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
  // Prompt 32: «Vær» ble satt inn rett etter Dashboard (indeks 1). En lagret rekkefølge fra før (uten indeks 14) flyttes ett hakk.
  const lt = store.me?.layouts?.tabs;
  // (Gjelder lagrede rekkefølger med 14 faner, før Kalender kom som indeks 14.)
  if (Array.isArray(lt) && lt.length && Math.max(...lt) < 14 && !lt.includes(14)) {
    const m = lt.map((i) => (i >= 1 ? i + 1 : i)); m.splice(m.indexOf(0) + 1, 0, 1); store.me.layouts.tabs = m;
  }
  // Prompt 43: Media (indeks 15) settes rett etter Familie (indeks 9), både i lagret og i standard rekkefølge.
  const mi = TABS.findIndex(([k]) => k === 'media');
  if (store.me) {
    store.me.layouts ??= {};
    const cur = store.me.layouts.tabs;
    if (!Array.isArray(cur) || !cur.includes(mi)) {
      const base = Array.isArray(cur) && cur.length ? cur.filter((i) => i !== mi) : TABS.map((_, i) => i).filter((i) => i !== mi);
      const f = base.indexOf(TABS.findIndex(([k]) => k === 'familie'));
      base.splice(f < 0 ? base.length : f + 1, 0, mi); store.me.layouts.tabs = base;
    }
  }
  const hid = hiddenTabs();
  document.querySelectorAll('.pillnav [data-r], .bottomnav [data-r]').forEach((a) => {
    a.hidden = hid.has(a.dataset.r);
    a.dataset.def ??= a.textContent;
    a.textContent = tabLabel(a.dataset.r, a.dataset.def);
  });
}
