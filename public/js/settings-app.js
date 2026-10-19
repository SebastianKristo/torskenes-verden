// Innstillinger → App: navnet på appen (vises på Hjem, i innloggingen, i varsler og i nettleserfanen) og app-ikonet.
// Lagres for hele serveren (settings.app_name / app_icon via /api/app); bare administratorer kan endre.
import { esc } from './util.js';
import { store } from './store.js';
import { ICONS, iconSvg, appName, appIcon, saveAppIdentity, loadAppIdentity } from './appicon.js';
import { RELEASES, WIDGET_STEPS, WIDGET_NOTE, KAL_APP } from './widget-help.js';

const SUGGEST = ['Homelab', 'Torskenes Verden'];
const S = { draft: null, msg: '', err: '', busy: false, loaded: false };
let rerender = () => {};
const admin = () => store.me?.me?.role === 'admin';

export async function loadApp(onChange) {
  if (onChange) rerender = onChange;
  if (!S.loaded) { await loadAppIdentity(); S.loaded = true; }
  rerender();
}

const preview = (k, name) => `<span class="ai-prev">${iconSvg(k, name)}</span>`;

const steps = (l) => `<ol class="wh-steps">${l.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
// Prompt 33: «Slik legger du til widget» (iPhone, Samsung, Android) og «Kalender-appen» (forklaring + lenke til release).
function widgetsView(h) {
  return { title: 'Slik legger du til widget', sub: 'App · Widgets på iPhone, Samsung og Android', groups: [
    ...WIDGET_STEPS.map(([, n, l], i) => h.group(n, [steps(l)], i === WIDGET_STEPS.length - 1 ? WIDGET_NOTE : '')),
  ] };
}
function kalAppView(h) {
  return { title: 'Kalender-appen', sub: 'App · Egen app for kalenderen', groups: [
    h.group('Om appen', [`<div class="sg-row wh-lead">${esc(KAL_APP.lead)}</div>`, steps(KAL_APP.points)]),
    h.group('Last ned', [`<a class="sg-row wh-link" href="${RELEASES}" target="_blank" rel="noopener"><span class="sg-txt"><b>Siste versjon på GitHub</b><span>Kalender-…-unsigned.ipa (iPhone) og Kalender-….apk (Android)</span></span><span class="sg-btn2">Åpne ↗</span></a>`], 'Samme konto og samme server som Homelab. Ingen data lagres bare på telefonen – appen har en kopi for visning uten nett og i widgetene.'),
  ] };
}

/** h = { group, row, note, sub } fra settings.js */
export function appView(h) {
  if (h.sub === 'widgets') return widgetsView(h);
  if (h.sub === 'kalapp') return kalAppView(h);
  const name = S.draft ?? appName(), can = admin();
  return { groups: [
    h.group('Navn på appen', [
      `<div class="sg-row ai-name"><input data-app-name value="${esc(name)}" maxlength="40" placeholder="Homelab" aria-label="Navn på appen" ${can ? '' : 'disabled'}>
        <button type="button" class="ai-save" data-app-act="save" ${can && !S.busy && name.trim() && name.trim() !== appName() ? '' : 'disabled'}>${S.busy ? 'Lagrer …' : 'Lagre'}</button></div>`,
      `<div class="sg-row ai-sugg">${SUGGEST.map((n) => `<button type="button" class="sg-pill${appName() === n ? ' on' : ''}" data-app-sugg="${esc(n)}" ${can ? '' : 'disabled'}>${esc(n)}</button>`).join('')}</div>`,
    ], S.err ? `<span class="red">${esc(S.err)}</span>` : S.msg ? `<span class="green">${esc(S.msg)}</span>` : can ? 'Vises på Hjem, i innloggingen, i varsler og i fanen i nettleseren. Gjelder alle brukerne på serveren.' : 'Settes opp av administrator. Gjelder alle brukerne på serveren.'),
    h.group('App-ikon', [
      `<div class="ai-icons">${ICONS.map(([k, n]) => `<button type="button" class="ai-icon${appIcon() === k ? ' on' : ''}" data-app-icon="${k}" aria-pressed="${appIcon() === k}" ${can ? '' : 'disabled'}>${preview(k, name)}<span>${esc(n)}</span></button>`).join('')}</div>`,
    ], 'På iPhone finnes hvert ikon i standard, mørk og tonet variant, og på Android som tematisk (Material You) ikon. Velg ikonet i appens innstillinger på telefonen. Her settes ikonet for nettleseren og PWA-en.'),
    h.group('Mobilapper', [
      h.row({ t: 'Widgets', k: 'widget hjem låseskjerm iphone samsung android prøveperioder kalender', s: 'Slik legger du til widget på iPhone, Samsung og Android.', btn: 'Vis', go: 'app|widgets' }),
      h.row({ t: 'Kalender-appen', k: 'kalender app ipa apk last ned installer', s: 'Egen app med samme konto og data. Last ned IPA eller APK.', btn: 'Vis', go: 'app|kalapp' }),
    ]),
  ] };
}

export async function appClick(e) {
  const b = e.target.closest('[data-app-act],[data-app-sugg],[data-app-icon]');
  if (!b) return false;
  if (!admin()) return true;
  const patch = b.dataset.appSugg ? { name: b.dataset.appSugg } : b.dataset.appIcon ? { icon: b.dataset.appIcon } : { name: (S.draft ?? appName()).trim() };
  S.busy = true; S.err = ''; S.msg = ''; rerender();
  try { await saveAppIdentity(patch); S.draft = null; S.msg = patch.icon ? 'Ikonet er byttet' : `Appen heter nå «${appName()}»`; }
  catch (er) { S.err = er.message; }
  S.busy = false; rerender();
  return true;
}

export function appInput(e) {
  if (!e.target.matches?.('[data-app-name]')) return false;
  S.draft = e.target.value;
  const btn = e.target.parentElement.querySelector('[data-app-act="save"]');
  if (btn) btn.disabled = !e.target.value.trim() || e.target.value.trim() === appName();
  return true;
}

export async function appKey(e) {
  if (e.key !== 'Enter' || !e.target.matches?.('[data-app-name]')) return false;
  e.preventDefault();
  e.target.parentElement.querySelector('[data-app-act="save"]')?.click();
  return true;
}
