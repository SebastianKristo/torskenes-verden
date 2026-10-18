// Innstillinger → App: navnet på appen (vises på Hjem, i innloggingen, i varsler og i nettleserfanen) og app-ikonet.
// Lagres for hele serveren (settings.app_name / app_icon via /api/app); bare administratorer kan endre.
import { esc } from './util.js';
import { store } from './store.js';
import { ICONS, iconSvg, appName, appIcon, saveAppIdentity, loadAppIdentity } from './appicon.js';

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

/** h = { group, row, note } fra settings.js */
export function appView(h) {
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
