// Profil (navn og bilde i menyknappen) og oppsett av forsiden: skjulte widgets og faner.
import { esc, api } from './util.js';
import { store } from './store.js';
import { setOrder } from './dnd.js';
import { liste, webModuler, modul, harModul, navn } from './moduler.js'; // Fase 6: fanene kommer fra modullisten

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
// Fanene i toppmenyen: alle sidene på web fra modullisten (moduler.js, GET /api/moduler), i listens rekkefølge. [id, navn].
// Fylles når lista er hentet (buildNav); ark (Nyheter) og Økonomi-snarveien er med, siden de kan stå som faner.
export const TABS = [];
export const FIXED_TABS = ['oversikt'];
// De gamle fanene før Fase 6, i den gamle rekkefølgen. Bare til å flytte en lagret rekkefølge (indekser i denne lista) og lagrede
// navn/skjulte faner over til modul-id-ene (migrateNav6). Ikke bruk den til noe annet.
const OLD_TABS = ['dash', 'vaer', 'chat', 'studie', 'rom', 'okonomi', 'hjem', 'matplan', 'sporing', 'familie', 'domener', 'nettverk', 'huskeliste', 'bursdager', 'kalender', 'media', 'kart', 'skjold'];
const OLD_ID = { okonomi: 'finans', dash: 'oversikt', hjem: 'smarthjem', matplan: 'mat', huskeliste: 'gjoremal', gjoremal: 'gjoremal', bursdager: 'kalender', kart: 'reise' };
const newId = (k) => OLD_ID[k] ?? k;

const layout = () => (store.me.layout ??= {});
export const hiddenWidgets = () => new Set(layout().hiddenWidgets ?? []);
/** Moduler brukeren har tilgang til (serveren sender bare dem: Domener for admin, Media med tilgang). */
export const tabAllowed = (k) => harModul(k);
// Q6: uten eget valg står bare de faste fanene i toppmenyen; resten ligger under «Alle sider ▾».
const defaultHidden = () => TABS.map(([k]) => k).filter((k) => !liste().toppmeny.includes(k));
export const hiddenTabs = () => new Set([...(layout().hiddenTabs ?? defaultHidden()), ...TABS.map(([k]) => k).filter((k) => !tabAllowed(k))].filter((k) => !FIXED_TABS.includes(k)));

export async function saveLayout(changes) {
  Object.assign(layout(), changes);
  const r = await api('/me/layout', { method: 'PUT', json: { homelab: changes } }).catch(() => null);
  if (r?.homelab) store.me.layout = r.homelab;
}

/** Navnet brukeren har gitt fanen, eller standardnavnet fra modullisten. */
export const tabLabel = (id, def = navn(id)) => layout().labels?.[id] || def;

const tabHtml = (m) => `<a href="${esc(m.rute)}" data-r="${esc(m.id)}">${esc(m.navn)}</a>`;
/** Bygger fanene i toppmenyen og bunnmenyen fra modullisten (samme rekkefølge som app.html, så nav-boot.js kan vise dem straks). */
function buildNav() {
  const tabs = webModuler();
  TABS.splice(0, TABS.length, ...tabs.map((m) => [m.id, m.navn]));
  const top = document.querySelector('.pillnav');
  if (top) {
    const have = [...top.querySelectorAll(':scope > a[data-r]')].map((a) => a.dataset.r).join();
    if (have !== tabs.map((m) => m.id).join()) {
      top.querySelectorAll(':scope > a[data-r]').forEach((a) => a.remove());
      top.insertAdjacentHTML('afterbegin', tabs.map(tabHtml).join(''));
    }
  }
  const bottom = document.querySelector('.bottomnav');
  if (bottom) {
    const want = [...liste().bunnmeny.map(modul).filter(Boolean), { id: 'mer', rute: '#/mer', navn: 'Mer' }];
    if ([...bottom.querySelectorAll('[data-r]')].map((a) => a.dataset.r).join() !== want.map((m) => m.id).join()) bottom.innerHTML = want.map(tabHtml).join('');
  }
}

/**
 * Fase 6: rekkefølgen, navnene og de skjulte fanene brukeren har valgt, flyttes fra de gamle nøklene (dash, huskeliste, indekser i
 * den gamle lista) til modul-id-ene. Kjøres én gang per bruker (layout.navV = 6). Uten eget valg brukes standarden (Q6).
 */
function migrateNav6() {
  if (!store.me || layout().navV === 6 || !TABS.length) return;
  store.me.layouts ??= {};
  const ids = TABS.map(([k]) => k), changes = { navV: 6 };
  const lt = store.me.layouts.tabs;
  if (Array.isArray(lt) && lt.length) {
    const order = [...new Set(lt.map((i) => newId(OLD_TABS[i])).filter((k) => ids.includes(k)))];
    for (const k of ids) if (!order.includes(k)) order.push(k);
    setOrder('tabs', order.map((k) => ids.indexOf(k)));
  }
  const L = layout();
  if (Array.isArray(L.hiddenTabs)) changes.hiddenTabs = [...new Set(L.hiddenTabs.map(newId))];
  if (L.labels && typeof L.labels === 'object') changes.labels = Object.fromEntries(Object.entries(L.labels).map(([k, v]) => [newId(k), v]));
  saveLayout(changes);
}

/** Skjuler og gir nytt navn til faner i topplinjen og bunnmenyen. Skjulte sider kan fortsatt åpnes med lenke og fra «Alle sider». */
export function applyNav() {
  buildNav();
  migrateNav6();
  // Uten lagret rekkefølge: de faste fanene (Q6) først, i den rekkefølgen, så resten i listens rekkefølge.
  if (store.me && !(store.me.layouts?.tabs?.length)) {
    const ids = TABS.map(([k]) => k), first = liste().toppmeny.filter((k) => ids.includes(k));
    store.me.layouts ??= {};
    store.me.layouts.tabs = [...first, ...ids.filter((k) => !first.includes(k))].map((k) => ids.indexOf(k));
  }
  const hid = hiddenTabs();
  document.querySelectorAll('.pillnav [data-r], .bottomnav [data-r]').forEach((a) => {
    // Bunnmenyen på mobil viser alltid sine faner (så sant brukeren har modulen); valget i toppmenyen gjelder bare toppmenyen.
    a.hidden = a.closest('.bottomnav') ? a.dataset.r !== 'mer' && !tabAllowed(a.dataset.r) : hid.has(a.dataset.r);
    a.dataset.def ??= a.textContent;
    a.textContent = tabLabel(a.dataset.r, a.dataset.def);
  });
}
