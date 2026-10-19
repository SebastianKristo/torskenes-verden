// Prompt 30: profilmenyen øverst til høyre (fasit «Homelab Papir Web.dc.html» → meVals).
// - Fargede ikoner (26×26, radius 8), 250 px bred, rader 42 px. Overskrift: navn og rolle (ikke @brukernavn).
// - «✎ Tilpass denne menyen» bytter til redigering på stedet: avkrysning (vis/skjul), ▲ ▼ og Tilbakestill.
//   Logg ut ligger alltid nederst og kan ikke skjules eller flyttes.
// - Lagres per bruker i /api/me/layout som profile_menu {order[], hidden[]} (SERVER30). Eldre server: localStorage.
import { api, esc, haptic } from './util.js';
import { store } from './store.js';
import { lang } from './i18n.js';
import { is2c } from './hltheme.js';
import { roleName } from './settings-login.js';

export const PM_KEYS = ['innstillinger', 'tema', 'sprak', 'sokebar', 'nyhetslinje', 'tilpass', 'widgets', 'cv', 'las']; // prompt 36: «Rediger widgets»
const DEF = () => ({ order: [...PM_KEYS], hidden: ['sokebar', 'nyhetslinje', 'las'] });
const LS = 'hl_profile_menu';
const IC = {
  sprak: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  innstillinger: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  tema: 'M12 3a9 9 0 1 0 0 18V3zM12 3a9 9 0 0 1 0 18', sokebar: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  nyhetslinje: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5', tilpass: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  cv: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6', widgets: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 17.5h7M17.5 14v7', las: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3', out: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10',
};
const COL = { innstillinger: '#6b6558', tema: '#7a5ad6', sprak: '#2b5d8a', sokebar: '#7a3b6b', nyhetslinje: '#c0562a', tilpass: '#3f7a6e', widgets: '#b23a2a', cv: '#a8661a', las: '#1f6f78', out: '#b23a2a' };
// Handlingene finnes fra før i app.js (data-act); CV er en lenke.
const ACT = { innstillinger: 'settings', tema: 'hl-theme', sprak: 'lang', sokebar: 'toggle-search', nyhetslinje: 'toggle-news', tilpass: 'layout', widgets: 'dash-edit', las: 'lock' };
function label(k) {
  if (k === 'innstillinger') return 'Innstillinger';
  if (k === 'tema') return is2c() ? 'Bytt til nåværende tema' : 'Bytt til Vindu og papir';
  if (k === 'sprak') return lang() === 'en' ? 'Language: English → Norsk' : 'Språk: Norsk → English';
  if (k === 'sokebar') return store.me?.hideSearch ? 'Vis søkebar' : 'Skjul søkebar';
  if (k === 'nyhetslinje') return store.me?.hideNews ? 'Vis nyhetslinje' : 'Skjul nyhetslinje';
  if (k === 'tilpass') return 'Tilpass forside og meny';
  if (k === 'widgets') return 'Rediger widgets';
  if (k === 'cv') return 'CV ↗';
  return 'Lås skjermen';
}

const M = { pm: null, edit: false, loaded: false };
const clean = (v) => {
  const d = DEF(), o = Array.isArray(v?.order) ? v.order.filter((k) => PM_KEYS.includes(k)) : [];
  // Nye rader (prompt 36: «Rediger widgets») legges rett etter raden foran seg i standardrekkefølgen.
  const order = [...new Set(o)];
  PM_KEYS.forEach((k, i) => { if (order.includes(k)) return; const prev = PM_KEYS[i - 1], at = prev ? order.indexOf(prev) : -1; order.splice(at + 1, 0, k); });
  const hidden = Array.isArray(v?.hidden) ? [...new Set(v.hidden.filter((k) => PM_KEYS.includes(k)))] : d.hidden;
  return { order, hidden };
};
const local = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };
export async function loadProfileMenu() {
  try { const l = await api('/me/layout'); M.pm = clean(l?.profile_menu ?? local() ?? DEF()); } catch { M.pm = clean(local() ?? DEF()); }
  M.loaded = true;
}
async function save() {
  try { localStorage.setItem(LS, JSON.stringify(M.pm)); } catch { /* */ }
  try { await api('/me/layout', { method: 'PUT', json: { profile_menu: M.pm } }); } catch { /* eldre server: bare lokalt */ }
}
const ic = (k, sz = 26, isz = 14) => `<span class="pm-ic" style="width:${sz}px;height:${sz}px;background:${COL[k]}" aria-hidden="true"><svg width="${isz}" height="${isz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[k]}"/></svg></span>`;

/** Tegner menyen i #menu. */
export function renderProfileMenu() {
  const el = document.getElementById('menu');
  if (!el) return;
  const pm = M.pm ?? clean(local() ?? DEF()), me = store.me?.me ?? {};
  const head = `<div class="menu-head pm-head" id="menu-name"><b data-no-i18n>${esc(me.name || me.username || store.me?.user || '')}</b><span>${esc(roleName(me.role))}</span></div>`;
  if (M.edit) {
    el.innerHTML = `${head}<div class="pm-edh"><span>TILPASS MENYEN</span><button type="button" class="sbtn pri pm-done" data-pm="done"><span>Ferdig</span></button></div>
      ${pm.order.map((k, i) => { const on = !pm.hidden.includes(k); return `<div class="pm-er${on ? '' : ' off'}"><button type="button" class="pm-ck${on ? ' on' : ''}" data-pm="tog:${k}" role="checkbox" aria-checked="${on}" aria-label="Vis ${esc(label(k))}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>${ic(k, 24, 13)}<span class="pm-n">${esc(label(k))}</span>
        <button type="button" class="pm-mv" data-pm="up:${k}" aria-label="Flytt opp"${i ? '' : ' disabled'}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg></button><button type="button" class="pm-mv" data-pm="dn:${k}" aria-label="Flytt ned"${i < pm.order.length - 1 ? '' : ' disabled'}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button></div>`; }).join('')}
      <div class="pm-foot"><span>Logg ut ligger alltid nederst.</span><button type="button" class="pm-reset" data-pm="reset">Tilbakestill</button></div>`;
    return;
  }
  const items = pm.order.filter((k) => !pm.hidden.includes(k) && (k !== 'widgets' || window.innerWidth >= 900)).map((k) => (k === 'cv'
    ? `<a role="menuitem" class="pm-it" href="/cv" target="_blank" rel="noopener">${ic(k)}<span>${esc(label(k))}</span></a>`
    : `<button role="menuitem" class="pm-it" data-act="${ACT[k]}"${k === 'sprak' ? ' data-no-i18n id="menu-lang"' : ''}>${ic(k)}<span>${esc(label(k))}</span></button>`)).join('');
  el.innerHTML = `${head}${items}<button role="menuitem" class="pm-it danger" data-act="logout">${ic('out')}<span>Logg ut</span></button>
    <button type="button" class="pm-edit" data-pm="edit"><span aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>Tilpass denne menyen</button>`;
}

/** Klikk på redigeringsknappene. Returnerer true når klikket hørte til redigeringen (menyen skal ikke lukkes). */
export async function profileMenuClick(e) {
  const b = e.target.closest('[data-pm]');
  if (!b) return M.edit; // klikk inne i menyen i redigering lukker den ikke
  const [a, k] = b.dataset.pm.split(':');
  const pm = M.pm ?? clean(local() ?? DEF());
  M.pm = pm;
  if (a === 'edit') { M.edit = true; haptic(8); }
  else if (a === 'done') { M.edit = false; haptic(8); }
  else if (a === 'reset') { M.pm = DEF(); save(); }
  else if (a === 'tog') { pm.hidden = pm.hidden.includes(k) ? pm.hidden.filter((x) => x !== k) : [...pm.hidden, k]; save(); }
  else if (a === 'up' || a === 'dn') {
    const i = pm.order.indexOf(k), j = i + (a === 'up' ? -1 : 1);
    if (i >= 0 && j >= 0 && j < pm.order.length) { [pm.order[i], pm.order[j]] = [pm.order[j], pm.order[i]]; save(); }
  }
  renderProfileMenu();
  if (a === 'up' || a === 'dn') document.querySelector(`#menu [data-pm="${a}:${k}"]:not(:disabled)`)?.focus();
  return true;
}
export const profileMenuEditing = () => M.edit;
export function profileMenuClosed() { if (M.edit) { M.edit = false; renderProfileMenu(); } }
