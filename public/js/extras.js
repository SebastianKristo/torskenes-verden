// Søkebar, nyhetslinje og popup.
import { esc, hm, api, backdropClick } from './util.js';
import { store, on, emit } from './store.js';
import { clearBtn, syncSearch, bindSearchFields } from './searchfield.js';
import { addQuick, preview, quickLabel } from './kal-quick.js';

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
  pop().addEventListener('click', (e) => { if (backdropClick(e, pop()) || e.target.closest('[data-pop-close]')) closePopup(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop().hidden) { e.preventDefault(); closePopup(); }
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
export const SEARCH_STYLES = [['light', 'Lys, sentrert'], ['dark', 'Mørk, sentrert'], ['wideLight', 'Full bredde, lys'], ['wide', 'Full bredde, mørk']];

const isGoogle = () => /google\./.test(store.me.searchUrl ?? 'google.');

/* Prompt 29 (claude-code-hjem-sok-ai.md): søkemotor-valg til venstre (ikon + ▾) med menyen «SØK MED» i et eget lag over
   alt annet: System-AI (standard, svarer i Chat og legger til timer), Google, DuckDuckGo. Valget lagres per bruker
   (search_engine i /api/me/layout, nettleseren som reserve). Timer gjenkjennes uansett motor (quick-time.js) og legges
   til i bakgrunnen (kal-quick.js). ✦ AI åpner alltid Chat. */
export const ENGINES = { ai: ['System-AI', 'Spør AI eller skriv «time hos …»', 'Svarer i Chat og legger til timer'], google: ['Google', 'Søk på Google', 'Åpner google.com'], ddg: ['DuckDuckGo', 'Søk med DuckDuckGo', 'Åpner duckduckgo.com'] };
const EKEY = 'hl_search_engine';
let engine = (() => { try { const v = localStorage.getItem(EKEY); return ENGINES[v] ? v : 'ai'; } catch { return 'ai'; } })();
export const searchEngine = () => engine;
const engIcon = (k, big = false) => k === 'google' ? `<img class="sbar-g" src="/assets/google-g.svg" width="${big ? 20 : 18}" height="${big ? 20 : 18}" alt="" aria-hidden="true">`
  : k === 'ddg' ? '<span class="sq-ei ddg" aria-hidden="true">D</span>' : '<span class="sq-ei ai" aria-hidden="true">✦</span>';
export async function setSearchEngine(k, save = true) {
  if (!ENGINES[k]) return;
  engine = k;
  try { localStorage.setItem(EKEY, k); } catch { /* privat modus */ }
  if (save) api('/me/layout', { method: 'PUT', json: { search_engine: k } }).catch(() => {});
  // Feltene som står på siden får nytt ikon og ny plassholder uten å tegnes på nytt (teksten i feltet beholdes).
  document.querySelectorAll('[data-search]').forEach((f) => {
    const b = f.querySelector('[data-sq-eng]'); if (b) b.innerHTML = `${engIcon(k)}<span class="sq-caret" aria-hidden="true">▾</span>`;
    if (f.q) f.q.placeholder = ENGINES[k][1];
    f.closest('.search-wrap')?.querySelector('.gword')?.toggleAttribute('hidden', k !== 'google');
  });
}
let engLoaded = false;
function loadEngine() {
  if (engLoaded) return; engLoaded = true;
  api('/me/layout').then((l) => { const v = l?.search_engine ?? l?.searchEngine; if (ENGINES[v] && v !== engine) setSearchEngine(v, false); }).catch(() => {});
}

export function renderSearch() {
  const st = store.me.searchStyle;
  loadEngine();
  // Prompt 27: ✕ til venstre for feltet (etter motor-ikonet) når det står tekst i det (searchfield.js).
  const pick = `<button type="button" class="sq-eng" data-sq-eng aria-label="Velg søkemotor" title="Velg søkemotor" aria-haspopup="menu" aria-expanded="false">${engIcon(engine)}<span class="sq-caret" aria-hidden="true">▾</span></button>`;
  const form = (inner) => `<form class="sbar ${st}" data-search data-sf role="search">${inner}${clearBtn()}<input name="q" placeholder="${esc(ENGINES[engine][1])}" autocomplete="off" aria-label="Søk" role="combobox" aria-autocomplete="list" aria-expanded="false" enterkeyhint="go"><button type="button" class="sq-ai-tog" data-sq-ai aria-label="Spør AI" title="Spør AI i Chat">✦ AI</button><button type="submit">Søk</button><div class="sq-drop" role="listbox" hidden></div></form>`;
  bindSearchFields();
  if (st === 'light' || st === 'dark') return `<div class="search-wrap">${isGoogle() ? GWORD.replace('class="gword"', `class="gword"${engine === 'google' ? '' : ' hidden'}`) : ''}${form(pick)}</div>`;
  return `<div>${form(`${pick}<span class="sep"></span>`)}</div>`;
}

/* Menyen «SØK MED»: eget lag på <body> (position:fixed, z-index over kortene), plassert under motor-knappen. */
function closeEngMenu() { document.getElementById('sq-eng-menu')?.remove(); document.querySelectorAll('[data-sq-eng][aria-expanded=true]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
function openEngMenu(btn) {
  closeEngMenu();
  const r = btn.getBoundingClientRect(), m = document.createElement('div');
  m.id = 'sq-eng-menu'; m.className = `sq-eng-menu${document.documentElement.dataset.hl === '2c' ? ' paper' : ''}`; m.setAttribute('role', 'menu');
  m.innerHTML = `<span class="sq-eng-h">SØK MED</span>${Object.entries(ENGINES).map(([k, [n, , sub]]) => `<button type="button" role="menuitemradio" aria-checked="${engine === k}" data-sq-pick="${k}">${engIcon(k, true)}<span class="sq-eng-t"><b>${esc(n)}</b><span>${esc(sub)}</span></span><svg class="sq-eng-ck" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>`).join('')}`;
  document.body.appendChild(m);
  const w = m.offsetWidth, left = Math.max(8, Math.min(r.left - 6, innerWidth - w - 8));
  m.style.left = `${left}px`; m.style.top = `${r.bottom + 10}px`;
  btn.setAttribute('aria-expanded', 'true');
  m.querySelector('[aria-checked=true]')?.focus({ preventScroll: true });
}

/** Timen i feltet, hvis teksten ser ut som en avtale (dato + intensjon eller kjent type). */
function apptOf(v) {
  v = String(v ?? '').trim();
  if (v.length <= 4 || isUrl(v)) return null;
  const p = preview(v);
  return p.ok && p.isAppointment ? p : null;
}
function addAppt(form, q) {
  addQuick(q);
  form.q.value = ''; syncSearch(form.q); form.q.blur();
  const d = form.querySelector('.sq-drop'); if (d) d.hidden = true;
}

/* Forslag fra Google (via serveren) og søkehistorikk per bruker, delt med mobilappen. */
const sq = { hist: null, suggest: true, save: true, sugg: [], suggErr: '', sel: -1, items: [], timer: 0, seq: 0, ai: null };
// «✦ AI»-modus huskes per nettleser.
const aiOn = () => false; // prompt 27: ✦ AI åpner Chat i stedet for et svar i nedtrekket
const setAi = (on) => { try { localStorage.setItem('hl.searchAi', on ? '1' : '0'); } catch { /* privat modus */ } };
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
  const ai = sq.ai && sq.ai.q === v.trim() ? sq.ai : null;
  const err = lv && !sq.items.length && sq.suggErr ? sq.suggErr : '';
  const ap = apptOf(v);
  const open = document.activeElement === input && (sq.items.length > 0 || !lv || !!ai || !!err || !!ap);
  drop.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (!open) return;
  if (ai) { drop.innerHTML = aiPanel(ai); return; }
  // Mørkt forslag øverst: kalender-ikon · «Nina frisør» · «fre 25. sep · 14:30» · Legg i kalender (↵ gjør det samme).
  const apH = ap ? `<div class="sq-appt" role="option" data-sq-appt aria-label="Legg i kalender: ${esc(ap.title)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4"/></svg><span class="sq-appt-t"><b data-no-i18n>${esc(ap.title)}</b><span>${esc(quickLabel(ap))}</span></span><span class="sq-appt-b">Legg i kalender</span></div>` : '';
  if (err) { drop.innerHTML = apH + (apH ? '' : `<div class="sq-empty">Forslag utilgjengelig: ${esc(err)}</div>`); return; }
  const split = (t) => { const i = lv ? t.toLowerCase().indexOf(lv) : -1; return i === 0 ? `<span>${esc(t.slice(0, lv.length))}</span><b>${esc(t.slice(lv.length))}</b>` : `<b>${esc(t)}</b>`; };
  drop.innerHTML = apH + (!lv && hist.length ? '<div class="sq-head"><span>Nylige søk</span><button type="button" data-sq-clear>Tøm historikk</button></div>' : '')
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
    const r = await api(`/search/suggest?full=1&q=${encodeURIComponent(q)}`).catch((e) => ({ items: [], error: e.message }));
    if (my !== sq.seq || form.q.value.trim() !== q) return;
    sq.sugg = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : [];
    sq.suggErr = r?.error ?? '';
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
  // Ser det ut som en adresse, gå rett dit. Ellers valgt søkemotor (System-AI → ny samtale i Chat).
  if (isUrl(q)) { location.href = /^https?:\/\//i.test(q) ? q : `https://${q}`; return; }
  if (engine === 'ai') { document.querySelectorAll('[data-search]').forEach((f) => { f.q.value = ''; syncSearch(f.q); f.q.blur(); }); import('./chat.js').then((m) => m.openChat(q)).catch(() => { location.hash = '#/chat'; }); return; }
  location.href = engine === 'ddg' ? `https://duckduckgo.com/?q=${encodeURIComponent(q)}` : (isGoogle() && store.me.searchUrl ? store.me.searchUrl : 'https://www.google.com/search?q=') + encodeURIComponent(q);
}

/* ✦ AI: korte søk går til vanlig søk; ellers vises svaret fra AI-motoren i nedtrekket, med årsak hvis det feiler. */
function aiPanel(a) {
  if (a.loading) return '<div class="sq-ai"><div class="sq-ai-h">✦ AI tenker …</div><div class="skeleton" style="min-height:54px;border-radius:12px"></div></div>';
  if (a.error) return `<div class="sq-ai err"><div class="sq-ai-h">✦ AI</div><p>${esc(a.error)}</p><div class="sq-ai-act"><button type="button" data-sq-google="${esc(a.q)}">Søk på Google i stedet</button></div></div>`;
  const d = a.data;
  return `<div class="sq-ai"><div class="sq-ai-h">✦ AI · ${esc(d.provider ?? '')}</div><p>${esc(d.answer)}</p>
    ${d.followUps?.length ? `<div class="sq-ai-f">${d.followUps.map((f) => `<button type="button" data-sq-ask="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}
    <div class="sq-ai-act"><button type="button" data-sq-google="${esc(d.searchQuery || a.q)}">Søk på Google: ${esc(d.searchQuery || a.q)} ›</button></div></div>`;
}
async function askAi(form, q, force = false) {
  q = q.trim();
  if (!q) return;
  if (isUrl(q)) return runSearch(q);
  form.q.value = q;
  sq.ai = { q, loading: true };
  drawDrop(form);
  try {
    const r = await api('/search/ask', { method: 'POST', json: { q, force } });
    if (sq.ai?.q !== q) return;
    if (r.mode === 'plain') { sq.ai = null; return runSearch(q); }
    sq.ai = { q, data: r };
  } catch (e) { if (sq.ai?.q === q) sq.ai = { q, error: e.message }; }
  drawDrop(form);
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
    const q = it ? it.t : e.target.q.value;
    // Timer gjenkjennes uansett søkemotor og legges til i bakgrunnen.
    if (!it && apptOf(q)) { addAppt(e.target, q.trim()); return; }
    if (aiOn()) askAi(e.target, q); else runSearch(q);
  });
  // Søkemotor-menyen.
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-sq-eng]');
    if (b) { e.preventDefault(); if (b.getAttribute('aria-expanded') === 'true') closeEngMenu(); else openEngMenu(b); return; }
    const pk = e.target.closest?.('[data-sq-pick]');
    if (pk) { e.preventDefault(); setSearchEngine(pk.dataset.sqPick); closeEngMenu(); document.querySelector('[data-search] input[name=q]')?.focus(); return; }
    if (!e.target.closest?.('#sq-eng-menu')) closeEngMenu();
  });
  document.addEventListener('keydown', (e) => {
    const m = document.getElementById('sq-eng-menu');
    if (!m) return;
    if (e.key === 'Escape') { e.stopPropagation(); closeEngMenu(); document.querySelector('[data-sq-eng]')?.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const L = [...m.querySelectorAll('[data-sq-pick]')], i = L.indexOf(document.activeElement);
      L[(i + (e.key === 'ArrowDown' ? 1 : -1) + L.length) % L.length]?.focus();
    }
  }, true);
  window.addEventListener('resize', closeEngMenu);
  window.addEventListener('hashchange', closeEngMenu);
  document.addEventListener('scroll', (e) => { if (!e.target?.closest?.('#sq-eng-menu')) closeEngMenu(); }, true);
  // ✦ AI (prompt 27): åpner Chat og starter en ny samtale med teksten i feltet (tomt felt = bare åpne Chat).
  document.addEventListener('click', (e) => {
    const tog = e.target.closest?.('[data-sq-ai]');
    if (!tog) return;
    e.preventDefault();
    const f = formOf(e), q = (f?.q.value ?? '').trim();
    setAi(false);
    if (f) { f.q.value = ''; syncSearch(f.q); f.q.blur(); }
    import('./chat.js').then((m) => m.openChat(q)).catch(() => { location.hash = '#/chat'; });
  });
  document.addEventListener('sf:clear', (e) => {
    const f = formOf(e);
    if (!f) return;
    clearTimeout(sq.timer); sq.seq++; sq.sugg = []; sq.ai = null; sq.sel = -1;
    const d = f.querySelector('.sq-drop'); if (d) d.hidden = true;
    f.q.setAttribute('aria-expanded', 'false');
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
    if (e.target.closest('[data-sq-appt]')) return addAppt(f, f.q.value.trim());
    const del = e.target.closest('[data-sq-del]');
    if (del) return removeHist(f, sq.items[+del.dataset.sqDel]?.t);
    if (e.target.closest('[data-sq-clear]')) { sq.hist = []; drawDrop(f); api('/search/history', { method: 'DELETE' }).catch(() => {}); return; }
    const g = e.target.closest('[data-sq-google]');
    if (g) { sq.ai = null; return runSearch(g.dataset.sqGoogle); }
    const ask = e.target.closest('[data-sq-ask]');
    if (ask) return askAi(f, ask.dataset.sqAsk, true);
    const it = e.target.closest('[data-sq-i]');
    if (it) { const t = sq.items[+it.dataset.sqI].t; if (aiOn()) askAi(f, t); else runSearch(t); }
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
  const sp = el.querySelector('.ticker-speed .mono');
  if (sp) sp.textContent = u.newsSpeed ?? 5;
}

export function renderTicker() {
  const el = document.getElementById('ticker');
  applyTicker();
  const items = store.data.news?.items ?? [];
  el.hidden = store.me.hideNews || !items.length;
  if (el.hidden) return;
  const list = items.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener"><span class="ticker-src" style="background:${esc(n.color)}">${esc(n.src)}</span><span data-no-i18n>${esc(n.title)}</span><span class="mono muted" style="font-size:12px">${hm(new Date(n.date))}</span></a>`).join('');
  // Listen dupliseres så rullingen går sømløst; kopien skjules for skjermlesere.
  el.innerHTML = `<div class="ticker-label">SISTE NYTT</div><div class="ticker-view"><div class="ticker-track">${list}<span style="display:contents" aria-hidden="true">${list.replace(/<a /g, '<a tabindex="-1" ')}</span></div></div>
    <button class="ticker-speed" data-act="news-speed" title="Hastighet på nyhetsbaren" aria-label="Hastighet på nyhetsbaren"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0"/></svg><span class="mono">${store.me.ui?.newsSpeed ?? 5}</span></button>`;
}

export function menuLabels() {
  // Prompt 30: profilmenyen tegnes av profile-menu.js (tekstene følger hideSearch/hideNews).
  document.dispatchEvent(new Event('hl:menu'));
}

export async function toggle(key) {
  const k = { search: 'hideSearch', news: 'hideNews' }[key];
  store.me[k] = !store.me[k];
  menuLabels();
  await api(`/settings/hide_${key}`, { method: 'PUT', json: { value: store.me[k] } }).catch(() => {});
  if (key === 'news') renderTicker(); else emit('route');
}

on('news', renderTicker);
