// Innstillinger – den lette inngangen som skallet og sidene importerer (Fase 3, B §3 P1).
// Selve vinduet (settings-view.js) drar med seg rundt 45 sidemoduler. Det lastes først når innstillingene åpnes:
// openSettings(), en lenke til #/innstillinger/…, eller hendelsen hl:open-settings. Det som må virke før det, ligger her:
// startsidens avstander (applyTop) og om en hashendring kom fra innstillingene selv (settingsOwnsHash).
import { store } from './store.js';

/** Avstandene i toppmenyen (Innstillinger → Startside). */
export function applyTop() {
  const t = store.me.top ?? {}, r = document.documentElement.style;
  r.setProperty('--hl-head-gap', (t.head ?? 16) + 'px');
  r.setProperty('--hl-tab-gap', (t.tab ?? 2) + 'px');
  r.setProperty('--hl-tab-pad', (t.pad ?? 12) + 'px');
}

// Prompt 30: lukking går tilbake i historikken (history.back()). Den hashendringen skal ikke tegne siden under på nytt.
let urlBack = false;
/** Kalles av settings-view.js rett før den går tilbake i historikken. */
export function noteUrlBack() { urlBack = true; }
/** Ble hashendringen laget av innstillingene selv (åpne/lukke)? Da skal ikke siden under tegnes på nytt. */
export const settingsOwnsHash = () => /^#\/innstillinger/.test(location.hash) || (urlBack && !(urlBack = false));

let view = null, bound = false;
const wanted = () => /^#\/innstillinger(\/|$)/.test(location.hash);
/** Laster vinduet (én gang) og kobler det til. */
function loadView() {
  view ??= import('./settings-view.js').then((m) => { if (!bound) { bound = true; m.bindSettings(); } return m; });
  return view;
}

/** Åpner innstillingene på en fane (og eventuelt en underside). */
export function openSettings(which = 'konto', subPage = null) {
  return loadView().then((m) => m.openSettings(which, subPage));
}
export function closeSettings() { view?.then((m) => m.closeSettings()); }

/** Kalles én gang ved oppstart. Er adressen allerede #/innstillinger/…, lastes vinduet med en gang (det åpner seg selv). */
export function bindSettings() {
  if (wanted()) { loadView(); return; }
  const onHash = () => { if (!wanted() || bound) return; removeEventListener('hashchange', onHash); loadView(); };
  addEventListener('hashchange', onHash);
  // «Flere valg …» i bakgrunnsmenyen: før vinduet er lastet tar vi imot hendelsen her; etterpå lytter vinduet selv.
  document.addEventListener('hl:open-settings', (e) => {
    if (bound) return;
    const [a, b] = String(e.detail ?? 'look/bg').split('/');
    openSettings(a, b ?? null);
  });
}

/** Forhåndslaster vinduet når nettleseren er ledig (så første åpning går like fort som før). */
export function preloadSettings() { loadView().catch(() => { view = null; }); }
