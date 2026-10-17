// Søkebar, nyhetslinje og popup.
import { esc, hm, api } from './util.js';
import { store, on, emit } from './store.js';

/* ---------- Popup ---------- */

const pop = () => document.getElementById('popup');
let lastFocus = null;

export function openPopup(title, body) {
  lastFocus = document.activeElement;
  pop().innerHTML = `<div class="popup-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="popup-head"><b>${esc(title)}</b><button class="x" data-pop-close aria-label="Lukk">×</button></div>${body}</div>`;
  pop().hidden = false;
  pop().querySelector('[data-pop-close]').focus();
}
export function closePopup() { pop().hidden = true; pop().innerHTML = ''; lastFocus?.focus?.(); }

// Klikkbare elementer registrerer innholdet sitt her: data-pop="<nøkkel>".
const handlers = new Map();
export function popHandler(prefix, fn) { handlers.set(prefix, fn); }

export function bindPopup() {
  pop().addEventListener('click', (e) => { if (e.target === pop() || e.target.closest('[data-pop-close]')) closePopup(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop().hidden) closePopup();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-pop]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pop]');
    if (!t || e.target.closest('a:not([data-pop]),input,select,button:not([data-pop])')) return;
    const [prefix, ...rest] = t.dataset.pop.split(':');
    const fn = handlers.get(prefix);
    if (!fn) return;
    e.preventDefault();
    const r = fn(rest.join(':'), t);
    if (r) openPopup(r.title, r.body);
  });
}

/* ---------- Søkebar ---------- */

export const GWORD = '<span class="gword" aria-label="Google"><i>G</i><i>o</i><i>o</i><i>g</i><i>l</i><i>e</i></span>';
const ICON = (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;
export const SEARCH_STYLES = [['light', 'Lys, sentrert'], ['dark', 'Mørk, sentrert'], ['wideLight', 'Full bredde, lys'], ['wide', 'Full bredde, mørk']];

const isGoogle = () => /google\./.test(store.me.searchUrl);

export function renderSearch() {
  const st = store.me.searchStyle, light = st === 'light' || st === 'wideLight';
  const ph = isGoogle() ? 'Søk på Google eller skriv inn en adresse' : 'Søk eller skriv inn en adresse';
  const form = (inner) => `<form class="sbar ${st}" data-search role="search">${inner}<input name="q" placeholder="${ph}" autocomplete="off" aria-label="Søk"><button type="submit">Søk</button></form>`;
  if (st === 'light' || st === 'dark') return `<div class="search-wrap">${isGoogle() ? GWORD : ''}${form(ICON(light ? '#5f6368' : '#8a93a6'))}</div>`;
  return `<div>${form(isGoogle() ? `${GWORD}<span class="sep"></span>` : ICON(light ? '#5f6368' : '#8a93a6'))}</div>`;
}

export function bindSearch() {
  document.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-search]')) return;
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    // Ser det ut som en adresse, gå rett dit.
    if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(q) && !/\s/.test(q)) location.href = /^https?:\/\//.test(q) ? q : `https://${q}`;
    else location.href = store.me.searchUrl + encodeURIComponent(q);
  });
}

/* ---------- Nyhetslinje ---------- */

export function renderTicker() {
  const el = document.getElementById('ticker');
  const items = store.data.news?.items ?? [];
  el.hidden = store.me.hideNews || !items.length;
  if (el.hidden) return;
  const list = items.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener"><span class="ticker-src" style="background:${esc(n.color)}">${esc(n.src)}</span><span>${esc(n.title)}</span><span class="mono muted" style="font-size:12px">${hm(new Date(n.date))}</span></a>`).join('');
  // Listen dupliseres så rullingen går sømløst; kopien skjules for skjermlesere.
  el.innerHTML = `<div class="ticker-label">SISTE NYTT</div><div class="ticker-view"><div class="ticker-track">${list}<span style="display:contents" aria-hidden="true">${list.replace(/<a /g, '<a tabindex="-1" ')}</span></div></div>`;
}

export function menuLabels() {
  document.getElementById('menu-search').textContent = store.me.hideSearch ? 'Vis søkebar' : 'Skjul søkebar';
  document.getElementById('menu-news').textContent = store.me.hideNews ? 'Vis nyhetslinje' : 'Skjul nyhetslinje';
}

export async function toggle(key) {
  const k = { search: 'hideSearch', news: 'hideNews' }[key];
  store.me[k] = !store.me[k];
  menuLabels();
  await api(`/settings/hide_${key}`, { method: 'PUT', json: { value: store.me[k] } }).catch(() => {});
  if (key === 'news') renderTicker(); else emit('route');
}

on('news', renderTicker);
