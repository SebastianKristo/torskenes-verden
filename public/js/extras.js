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
  const form = (inner) => `<form class="sbar ${st}" data-search role="search">${inner}<input name="q" placeholder="${ph}" autocomplete="off" aria-label="Søk" role="combobox" aria-autocomplete="list" aria-expanded="false" enterkeyhint="search"><button type="submit">Søk</button><div class="sq-drop" role="listbox" hidden></div></form>`;
  if (st === 'light' || st === 'dark') return `<div class="search-wrap">${isGoogle() ? GWORD : ''}${form(ICON(light ? '#5f6368' : '#8a93a6'))}</div>`;
  return `<div>${form(isGoogle() ? `${GWORD}<span class="sep"></span>` : ICON(light ? '#5f6368' : '#8a93a6'))}</div>`;
}

/* Forslag fra Google (via serveren) og søkehistorikk per bruker, delt med mobilappen. */
const sq = { hist: null, suggest: true, save: true, sugg: [], sel: -1, items: [], timer: 0, seq: 0 };
const HIC = 'M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4', SIC = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5';
const isUrl = (q) => !/\s/.test(q) && /^(https?:\/\/\S+|[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?)$/i.test(q);

export async function loadHistory(force = false) {
  if (sq.hist && !force) return sq;
  try { const r = await api('/search/history'); Object.assign(sq, { hist: r.items, suggest: r.suggest, save: r.save }); } catch { sq.hist ??= []; }
  return sq;
}
export const searchState = () => sq;
export function setHistory(items) { sq.hist = items; }

function drawDrop(form) {
  const drop = form.querySelector('.sq-drop'), input = form.q;
  if (!drop) return;
  const v = input.value, lv = v.trim().toLowerCase(), hist = sq.hist ?? [];
  const hm = lv ? hist.filter((x) => x.toLowerCase().includes(lv)).slice(0, 4) : hist.slice(0, 8);
  const sg = lv ? sq.sugg.filter((x) => !hm.some((y) => y.toLowerCase() === x.toLowerCase())).slice(0, 6) : [];
  sq.items = [...hm.map((t) => ({ t, h: true })), ...sg.map((t) => ({ t, h: false }))];
  if (sq.sel >= sq.items.length) sq.sel = -1;
  const open = document.activeElement === input && (sq.items.length > 0 || !lv);
  drop.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (!open) return;
  const split = (t) => { const i = lv ? t.toLowerCase().indexOf(lv) : -1; return i === 0 ? `<span>${esc(t.slice(0, lv.length))}</span><b>${esc(t.slice(lv.length))}</b>` : `<b>${esc(t)}</b>`; };
  drop.innerHTML = (!lv && hist.length ? '<div class="sq-head"><span>Nylige søk</span><button type="button" data-sq-clear>Tøm historikk</button></div>' : '')
    + sq.items.map((x, i) => `<div class="sq-item" role="option" id="sq-${i}" aria-selected="${sq.sel === i}" data-sq-i="${i}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${x.h ? HIC : SIC}"/></svg><span class="sq-t">${split(x.t)}</span>${x.h ? `<button type="button" class="sq-del" data-sq-del="${i}" aria-label="Fjern fra historikk">×</button>` : ''}</div>`).join('')
    + (!lv && !hist.length ? '<div class="sq-empty">Ingen søkehistorikk ennå</div>' : '');
  if (sq.sel >= 0) input.setAttribute('aria-activedescendant', `sq-${sq.sel}`); else input.removeAttribute('aria-activedescendant');
}

function fetchSugg(form) {
  clearTimeout(sq.timer);
  const q = form.q.value.trim();
  if (!sq.suggest || !q) { sq.sugg = []; drawDrop(form); return; }
  sq.timer = setTimeout(async () => {
    const my = ++sq.seq;
    const list = await api(`/search/suggest?q=${encodeURIComponent(q)}`).catch(() => []);
    if (my !== sq.seq || form.q.value.trim() !== q) return;
    sq.sugg = Array.isArray(list) ? list : [];
    drawDrop(form);
  }, 145);
}

function runSearch(q) {
  q = q.trim();
  if (!q) return;
  if (sq.save) {
    sq.hist = [q, ...(sq.hist ?? []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 500);
    // keepalive: lagringen fullføres selv om siden byttes ut med søkeresultatet.
    fetch('/api/search/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }), keepalive: true }).catch(() => {});
  }
  // Ser det ut som en adresse, gå rett dit.
  location.href = isUrl(q) ? (/^https?:\/\//i.test(q) ? q : `https://${q}`) : store.me.searchUrl + encodeURIComponent(q);
}

async function removeHist(form, t) {
  sq.hist = (sq.hist ?? []).filter((x) => x !== t);
  drawDrop(form);
  await api(`/search/history/${encodeURIComponent(t)}`, { method: 'DELETE' }).catch(() => {});
}

export function bindSearch() {
  const formOf = (e) => e.target.closest?.('[data-search]');
  document.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-search]')) return;
    e.preventDefault();
    const it = sq.items[sq.sel];
    runSearch(it ? it.t : e.target.q.value);
  });
  document.addEventListener('focusin', async (e) => {
    const f = formOf(e);
    if (!f || e.target.name !== 'q') return;
    sq.sel = -1; drawDrop(f);
    await loadHistory(); drawDrop(f);
  });
  document.addEventListener('focusout', (e) => {
    const f = formOf(e);
    if (f && e.target.name === 'q') setTimeout(() => { if (document.activeElement !== f.q) { const d = f.querySelector('.sq-drop'); if (d) d.hidden = true; f.q.setAttribute('aria-expanded', 'false'); sq.sel = -1; } }, 120);
  });
  document.addEventListener('input', (e) => {
    const f = formOf(e);
    if (!f || e.target.name !== 'q') return;
    sq.sel = -1; drawDrop(f); fetchSugg(f);
  });
  document.addEventListener('keydown', (e) => {
    const f = formOf(e);
    if (!f || e.target.name !== 'q') return;
    const n = sq.items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); sq.sel = n ? (sq.sel + 1) % n : -1; drawDrop(f); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sq.sel = n ? (sq.sel - 1 + n) % n : -1; drawDrop(f); }
    else if (e.key === 'Escape') { const d = f.querySelector('.sq-drop'); if (d && !d.hidden) { e.stopPropagation(); d.hidden = true; sq.sel = -1; f.q.setAttribute('aria-expanded', 'false'); } }
  });
  // mousedown (ikke click): feltet beholder fokus, så listen ikke lukkes før klikket er registrert.
  document.addEventListener('mousedown', (e) => {
    const f = formOf(e);
    if (!f || !e.target.closest('.sq-drop')) return;
    e.preventDefault();
    const del = e.target.closest('[data-sq-del]');
    if (del) return removeHist(f, sq.items[+del.dataset.sqDel]?.t);
    if (e.target.closest('[data-sq-clear]')) { sq.hist = []; drawDrop(f); api('/search/history', { method: 'DELETE' }).catch(() => {}); return; }
    const it = e.target.closest('[data-sq-i]');
    if (it) runSearch(sq.items[+it.dataset.sqI].t);
  });
  document.addEventListener('mouseover', (e) => {
    const it = e.target.closest?.('[data-sq-i]'), f = formOf(e);
    if (it && f && sq.sel !== +it.dataset.sqI) { sq.sel = +it.dataset.sqI; f.querySelectorAll('.sq-item').forEach((el, i) => el.setAttribute('aria-selected', String(i === sq.sel))); }
  });
}

/* ---------- Nyhetslinje ---------- */

// Hastighet 1–10: én runde tar 350 s / hastighet (standard 5 → 70 s).
export function applyTicker() {
  const el = document.getElementById('ticker'), u = store.me.ui ?? {};
  el.style.setProperty('--news-dur', Math.round(350 / (u.newsSpeed ?? 5)) + 's');
  el.classList.toggle('no-pause', u.newsPause === false);
}

export function renderTicker() {
  const el = document.getElementById('ticker');
  applyTicker();
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
