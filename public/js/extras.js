// Søkebar, nyhetslinje og popup.
import { esc, hm, api, backdropClick, haptic } from './util.js';
import { store, on, emit } from './store.js';
import { clearBtn, syncSearch, bindSearchFields } from './searchfield.js';
import { addQuick, preview, quickLabel } from './kal-quick.js';
import { glimt, setGlimt } from './glimt.js';
import { assist, boldHtml, wxRoute } from './assist.js';
import { toast } from './toast.js';
import { isQuestion } from './ask36.js';
import { isHuske41, addFromSearch41 } from './tasks41.js'; // prompt 41: huskebeskjeder fra søket

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
   alt annet: Glimt (tidligere System-AI, standard, svarer i Chat og legger til timer), Google, DuckDuckGo. Valget lagres per bruker
   (search_engine i /api/me/layout, nettleseren som reserve). Timer gjenkjennes uansett motor (quick-time.js) og legges
   til i bakgrunnen (kal-quick.js). ✦ AI åpner alltid Chat. */
/* Prompt 31: «System-AI» heter Glimt. Ekte logoer (inline SVG, ikke bokstaver i sirkler): Glimt-merket, Googles firefargede G
   og DuckDuckGo-anda. Haken står til høyre i menyen og erstatter aldri logoen. */
export const ENGINES = { ai: ['Glimt', 'Spør om været, eller skriv «time hos …»', 'Svarer i Chat og legger til timer'], google: ['Google', 'Søk på Google', 'Åpner google.com'], ddg: ['DuckDuckGo', 'Søk med DuckDuckGo', 'Åpner duckduckgo.com'] };
const EKEY = 'hl_search_engine';
let engine = (() => { try { const v = localStorage.getItem(EKEY); return ENGINES[v] ? v : 'ai'; } catch { return 'ai'; } })();
export const searchEngine = () => engine;
export const GOOGLE_G = (s = 20) => `<svg class="sq-logo" width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
// DuckDuckGo-anda: oransje sirkel (#DE5833) med hvit ring, hvit and med mørkt øye, gult nebb og grønt sløyfebånd.
export const DDG_DUCK = (s = 20) => `<svg class="sq-logo" width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#DE5833"/><circle cx="24" cy="24" r="20.2" fill="none" stroke="#fff" stroke-width="1.6"/><path fill="#fff" d="M16.4 14.6c1.6-3.3 5.2-5 8.9-4.5 4.4.6 7.4 4.5 7.4 9.3 0 2.6-.6 4.4-1.6 6.3-.9 1.8-1.4 3.6-1.3 6.1.1 2.2.8 4.6 1.9 7.3a19 19 0 0 1-9.5.4c-.2-3.4-.9-6.6-2.2-9.9-1.4-3.6-3.1-6.8-3.9-9.6-.4-1.9-.4-3.8.3-5.4z"/><circle cx="25.6" cy="17.8" r="1.6" fill="#2D4F8E"/><circle cx="26.1" cy="17.3" r=".5" fill="#fff"/><path fill="#2D4F8E" d="M18.9 16.2c.6-.7 1.6-1 2.4-.6-.6.2-1 .5-1.3 1-.3-.2-.7-.3-1.1-.4z"/><path fill="#FDD20A" d="M22.2 24.4c1.2-.6 3.4-1 5.3-.8 1.7.2 3.3.6 4.4 1.3.5.3.4.9-.1 1.1-1.3.5-2.9.8-4.6.8-1.9 0-3.8-.4-5-1.2-.4-.3-.4-.9 0-1.2z"/><path fill="#65BC46" d="M22.6 29.8c.9-.3 2.2.4 3.2 1.3l.1-.1c.9-1 2.1-2 3-1.7.8.3.6 2.3.1 3.4-.4 1-1.2 1.4-2 1.2-.4-.1-.8-.4-1.1-.7l-.1.1c-.9.6-2 1-2.8.8-.9-.2-1.3-1.1-1.3-2.2 0-1 .3-1.9.9-2.1z"/></svg>`;
const engIcon = (k, big = false) => k === 'google' ? GOOGLE_G(big ? 22 : 18) : k === 'ddg' ? DDG_DUCK(big ? 22 : 18) : glimt(big ? 22 : 20, 'klar');
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
  const form = (inner) => `<form class="sbar ${st}" data-search data-sf role="search">${inner}${clearBtn()}<input name="q" placeholder="${esc(ENGINES[engine][1])}" autocomplete="off" aria-label="Søk" role="combobox" aria-autocomplete="list" aria-expanded="false" enterkeyhint="go"><button type="button" class="sq-ai-tog" data-sq-ai aria-label="Spør Glimt i Chat" title="Spør Glimt i Chat">✦ AI</button><button type="submit">Søk</button><div class="sq-drop" role="listbox" hidden></div></form>`;
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
  if (isQuestion(v)) return null; // prompt 36: spørsmål med dato er ikke en avtale
  const p = preview(v);
  return p.ok && p.isAppointment ? p : null;
}
// Prompt 41: huskebeskjeder i søket → «Legg i Huskeliste» (Glimt deler opp i bakgrunnen, samme animasjon som rask time).
function huskeOf(v) { const s = String(v ?? '').trim(); return s.length > 8 && !isUrl(s) && !apptOf(s) && isHuske41(s) ? s : null; }
function addHuske(form, q) {
  addFromSearch41(q);
  form.q.value = ''; syncSearch(form.q); form.q.blur();
  const d = form.querySelector('.sq-drop'); if (d) d.hidden = true;
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
  if (sq.hist && !force && Date.now() - (sq.at ?? 0) < 30_000) return sq;
  sq.at = Date.now();
  try { const r = await api('/search/history'); Object.assign(sq, { hist: r.items, suggest: r.suggest, save: r.save }); if (Array.isArray(r.entries)) sq.ent = r.entries; } catch { sq.hist ??= []; }
  // Prompt 32 (claude-code-sokehistorikk-synk.md): «Nylige søk» fra serveren, både web og mobil, maks 8, uten duplikater.
  try {
    const r = await fetch('/api/search-history?limit=8', { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) { const j = await r.json(); sq.ent = Array.isArray(j.items) ? j.items : []; sq.histOn = j.enabled !== false; }
  } catch { /* eldre server: tekstlisten over */ }
  return sq;
}
/** Nylige søk (uten tekst i feltet): oppføringer med id og enhet, ellers tekstlisten. */
function recent() {
  if (sq.histOn === false || sq.save === false) return [];
  if (Array.isArray(sq.ent)) {
    const seen = new Set(), out = [];
    for (const x of sq.ent) { const k = String(x.q ?? '').toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); out.push({ t: x.q, h: true, id: x.id, dev: x.device }); if (out.length >= 8) break; }
    return out;
  }
  return (sq.hist ?? []).slice(0, 8).map((t) => ({ t, h: true }));
}
export const searchState = () => sq;
export function setHistory(items) { sq.hist = items; }

function drawDrop(form) {
  const drop = form.querySelector('.sq-drop'), input = form.q;
  if (!drop) return;
  const v = input.value, lv = v.trim().toLowerCase(), hist = sq.histOn === false || sq.save === false ? [] : sq.hist ?? [];
  const rec = lv ? [] : recent();
  const hm = lv ? hist.filter((x) => x.toLowerCase().includes(lv)).slice(0, 4) : [];
  const sg = lv ? sq.sugg.filter((x) => !hm.some((y) => y.toLowerCase() === x.toLowerCase())).slice(0, 6) : [];
  sq.items = lv ? [...hm.map((t) => ({ t, h: true })), ...sg.map((t) => ({ t, h: false }))] : rec;
  if (sq.sel >= sq.items.length) sq.sel = -1;
  const ai = sq.ai && sq.ai.q === v.trim() ? sq.ai : null;
  const err = lv && !sq.items.length && sq.suggErr ? sq.suggErr : '';
  const ap = apptOf(v), hu = huskeOf(v);
  const open = document.activeElement === input && (sq.items.length > 0 || !lv || !!ai || !!err || !!ap || !!hu);
  drop.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (!open) return;
  if (ai) { drop.innerHTML = aiPanel(ai); return; }
  // Mørkt forslag øverst: kalender-ikon · «Nina frisør» · «fre 25. sep · 14:30» · Legg i kalender (↵ gjør det samme).
  const apH = ap ? `<div class="sq-appt" role="option" data-sq-appt aria-label="Legg i kalender: ${esc(ap.title)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4"/></svg><span class="sq-appt-t"><b data-no-i18n>${esc(ap.title)}</b><span>${esc(quickLabel(ap))}</span></span><span class="sq-appt-b">Legg i kalender</span></div>` : '';
  const huH = hu ? `<div class="sq-appt sq-huske41" role="option" data-sq-huske aria-label="Legg i Huskeliste: ${esc(hu)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/></svg><span class="sq-appt-t"><b data-no-i18n>${esc(hu.length > 70 ? `${hu.slice(0, 70)} …` : hu)}</b><span>Glimt deler opp i punkter</span></span><span class="sq-appt-b">Legg i Huskeliste</span></div>` : '';
  if (huH) { drop.innerHTML = huH + (sq.items.length ? sq.items.slice(0, 4).map((x, i) => `<div class="sq-item" role="option" id="sq-${i}" aria-selected="${sq.sel === i}" data-sq-i="${i}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${x.h ? HIC : SIC}"/></svg><span class="sq-t" data-no-i18n><b>${esc(x.t)}</b></span></div>`).join('') : ''); return; }
  if (err) { drop.innerHTML = apH + (apH ? '' : `<div class="sq-empty">Forslag utilgjengelig: ${esc(err)}</div>`); return; }
  const split = (t) => { const i = lv ? t.toLowerCase().indexOf(lv) : -1; return i === 0 ? `<span>${esc(t.slice(0, lv.length))}</span><b>${esc(t.slice(lv.length))}</b>` : `<b>${esc(t)}</b>`; };
  const off = sq.histOn === false || sq.save === false;
  drop.innerHTML = apH + (!lv && sq.items.length ? '<div class="sq-head"><span>Nylige søk</span><button type="button" data-sq-clear>Tøm historikk</button></div>' : '')
    + sq.items.map((x, i) => `<div class="sq-item" role="option" id="sq-${i}" aria-selected="${sq.sel === i}" data-sq-i="${i}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${x.h ? HIC : SIC}"/></svg><span class="sq-t" data-no-i18n>${split(x.t)}</span>${x.dev === 'mobil' ? '<span class="sq-dev">mobil</span>' : ''}${x.h ? `<button type="button" class="sq-del" data-sq-del="${i}" aria-label="Fjern fra historikk">×</button>` : ''}</div>`).join('')
    + (!lv && !sq.items.length && !off ? '<div class="sq-empty">Ingen søkehistorikk ennå</div>' : '');
  if (!lv && !sq.items.length && off && !apH) { drop.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
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

function logSearch(q, eng) {
  if (!sq.save) return;
  sq.hist = [q, ...(sq.hist ?? []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 500);
  if (Array.isArray(sq.ent)) sq.ent = [{ id: null, q, engine: eng, device: 'web', createdAt: new Date().toISOString() }, ...sq.ent.filter((x) => String(x.q).toLowerCase() !== q.toLowerCase())].slice(0, 20);
  sq.at = 0; // neste fokus henter listen (med id-er) fra serveren
  // keepalive: lagringen fullføres selv om siden byttes ut med søkeresultatet. Den eldre ruten speiles i /api/search-history.
  fetch('/api/search/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, engine: eng, device: 'web' }), keepalive: true }).catch(() => {});
}
function runSearch(q) {
  q = q.trim();
  if (!q) return;
  // Prompt 32: snarveier til sider («vis meg oppdatering», «kalender») åpnes lokalt med en gang (claude-code-sok-fullfor-forst.md).
  const nv = navOf(q, engine === 'ai');
  logSearch(q, nv ? 'snarvei' : isUrl(q) ? 'url' : engine === 'ai' ? 'glimt' : engine);
  if (nv) { document.querySelectorAll('[data-search]').forEach((f) => { f.q.value = ''; syncSearch(f.q); f.q.blur(); const d = f.querySelector('.sq-drop'); if (d) d.hidden = true; }); openNav(q, nv, document.activeElement?.closest?.('[data-search]') ?? lastForm); return; }
  // Ser det ut som en adresse, gå rett dit. Ellers valgt søkemotor (Glimt → svarboble under feltet).
  if (isUrl(q)) { location.href = /^https?:\/\//i.test(q) ? q : `https://${q}`; return; }
  // Prompt 31: Glimt svarer i en boble rett under feltet (vær, kalender … via /api/assist). Hopper ikke til Chat.
  if (engine === 'ai') { document.querySelectorAll('[data-search]').forEach((f) => { f.q.value = ''; syncSearch(f.q); f.q.blur(); const d = f.querySelector('.sq-drop'); if (d) d.hidden = true; }); askGlimt(q, document.activeElement?.closest?.('[data-search]') ?? lastForm); return; }
  location.href = engine === 'ddg' ? `https://duckduckgo.com/?q=${encodeURIComponent(q)}` : (isGoogle() && store.me.searchUrl ? store.me.searchUrl : 'https://www.google.com/search?q=') + encodeURIComponent(q);
}

/* ---------- Snarveier og «fullfør først» (prompt 32, claude-code-sok-fullfor-forst.md, fasit hsAsk) ---------- */
// Samme liste som serveren (server/assist.js NAV). Med Glimt: «vis meg / åpne / gå til / ta meg til / hvor finner jeg / finn …»
// eller 1–2 ord. Med Google/DuckDuckGo bare med «åpne / gå til / ta meg til / vis meg» foran.
const NAV = [
  [/oppdater|nordlys|ny versjon|versjon/, 'Nordlys OS · oppdatering', 'set:system'],
  [/kalender|timeplan/, 'Kalender', '#/kalender'],
  [/v(æ|ae)ret? ?(side|app)|værside|vaerside|^(vis( meg)?|åpne|gå til) v(æ|ae)r(et)?$|^v(æ|ae)r(et)?$/, 'Vær', '#/vaer'],
  [/innstilling/, 'Innstillinger', 'set:konto'],
  [/pakke|sporing|sending/, 'Sporing', '#/sporing'],
  [/budsjett/, 'Budsjett', '/finans/#/budsjett'],
  [/kvittering/, 'Kvitteringer', '/finans/#/kv'],
  [/finans|økonomi|saldo/, 'Finans', '/finans/'],
  [/abonnement|prøveperiode/, 'Abonnement', '/finans/#/abonnement'],
  [/domene/, 'Domener', '#/domener'],
  [/familie|posisjon|hvor er/, 'Familie', '#/familie'],
  [/middag|matplan|oppskrift|^mat$|\bmat\b/, 'Mat', '#/matplan'],
  [/gjøremål|to-?do|huskeliste|handleliste/, 'Gjøremål', '#/huskeliste'],
  [/bursdag/, 'Bursdager', '#/bursdager'],
  [/\brom\b|satellitt|rombilde|mars-?rover/, 'Rom', '#/rom'],
  [/\bchat\b/, 'Chat', '#/chat'],
];
const NAV_PRE = /^(vis( meg)?|åpne|gå til|ta meg til|hvor finner jeg|finn)\b/, NAV_PRE_STRICT = /^(vis meg|åpne|gå til|ta meg til)\b/;
function navOf(q, glimtOn) {
  const n = String(q ?? '').toLowerCase().replace(/[?!.]+$/, '').trim();
  if (!n || isUrl(n) || apptOf(q)) return null;
  if (!(glimtOn ? NAV_PRE.test(n) || n.split(/\s+/).length <= 2 : NAV_PRE_STRICT.test(n))) return null;
  const hit = NAV.find(([re]) => re.test(n));
  return hit ? { label: hit[1], to: hit[2] } : null;
}
function goNav(to) {
  if (to.startsWith('set:')) { document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: to.slice(4) })); return; }
  if (to.startsWith('#')) { location.hash = to; return; }
  location.href = to;
}
function openNav(q, nv, form) {
  closeAns();
  ansForm = form;
  Object.assign(GL, { q, busy: false, ans: { text: `Åpner **${nv.label}**.`, source: 'Snarvei', nav: true }, err: '' });
  paintAns();
  const my = GL.seq;
  setTimeout(() => { if (my !== GL.seq) return; closeAns(); goNav(nv.to); }, 450);
}
// «Send til Chat etter» 5 / 8 / 15 / 30 s (hs_timeout_s i /api/me/layout, standard 8).
let hsT = null;
async function hsTimeout() {
  if (hsT == null) { hsT = 8; try { const l = await api('/me/layout'); const v = +(l?.hs_timeout_s ?? l?.hsTimeoutS); if ([5, 8, 15, 30].includes(v)) hsT = v; } catch { /* standard */ } }
  return hsT;
}
export function setHsTimeout(v) { if ([5, 8, 15, 30].includes(+v)) hsT = +v; }
/** Flytter jobben til Chat: POST /api/assist/:id/handoff → {chatId}. Uten jobb (eller eldre server): ny samtale med spørsmålet. */
async function handoff(q, jobId) {
  let chatId = null;
  if (jobId) {
    try {
      const r = await fetch(`/api/assist/${encodeURIComponent(jobId)}/handoff`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r.ok) chatId = (await r.json())?.chatId ?? null;
    } catch { /* faller tilbake */ }
  }
  const m = await import('./chat.js').catch(() => null);
  if (!m) { location.hash = '#/chat'; return; }
  if (chatId && m.openChatId) m.openChatId(chatId); else m.openChat(q);
}

/* ---------- Glimt-svarboble (prompt 31, claude-code-sok-ai-svarboble.md) ---------- */
// Mørk glass rgba(22,20,18,.78) + blur 30, radius 26. Mens Glimt tenker: animert merke + «Tenker på «…» …».
// Ferdig: svaret (det viktigste fet og hvitt), kilde «✦ …» og «Fortsett i Chat ›». Trykk på boblen eller et nytt søk lukker.
const GL = { q: '', busy: false, ans: null, err: '', ctl: null, seq: 0 };
let lastForm = null;
function ansHtml() {
  if (!GL.q) return '';
  const body = GL.slow ? `<div class="gl-busy">${glimt(22, 'svarer', { dark: true })}<span>Dette tar litt tid. <b>Fortsetter i Chat</b> …</span></div>`
    : GL.busy ? `<div class="gl-busy">${glimt(22, 'tenker', { dark: true })}<span>Tenker på «<span data-no-i18n>${esc(GL.q)}</span>» …</span></div>`
    // Prompt 34: feil vises tydelig («Glimt fikk ikke svar fra {modell}: {feil}») med Prøv igjen og Åpne AI-kontroll.
    : GL.err || !GL.ans?.text ? `<span class="gl-txt gl-err" data-no-i18n>${esc(GL.err || 'Glimt fant ikke noe svar.')}</span><div class="gl-foot"><span class="gl-src">✦ ${esc(GL.ans?.model || GL.ans?.source || 'Glimt')}</span><button type="button" class="gl-chat" data-gl-retry>Prøv igjen</button><button type="button" class="gl-chat" data-gl-aictl>Åpne AI-kontroll ›</button></div>`
    : `<span class="gl-txt" data-no-i18n>${boldHtml(GL.ans.text)}</span>${GL.ans.notice ? `<span class="gl-note" data-no-i18n>${esc(GL.ans.notice)}</span>` : ''}<div class="gl-foot"><span class="gl-src">✦ ${esc(GL.ans?.source || 'Glimt')}</span>${GL.ans?.apply?.count && !GL.applied ? `<button type="button" class="gl-chat" data-gl-apply>Endre ${GL.ans.apply.count} ${GL.ans.apply.count === 1 ? 'avtale' : 'avtaler'} ›</button>` : ''}${GL.ans?.open?.route === 'vaer' ? `<button type="button" class="gl-chat" data-gl-wx>${GL.ans.open.name ? `Åpne Vær for ${esc(GL.ans.open.name)}` : 'Åpne Vær'} ›</button>` : ''}${GL.ans?.open?.route === 'familie' ? '<button type="button" class="gl-chat" data-gl-fam>Vis på kart ›</button>' : ''}${GL.ans?.nav ? '' : '<button type="button" class="gl-chat" data-gl-chat>Fortsett i Chat ›</button>'}</div>`;
  // Prompt 38: lukkes med ✕, sveip opp eller trykk utenfor (laget under fanger trykket); trykk i boblen lukker ikke.
  return `<div class="gl-ans" data-gl-ans role="status" aria-live="polite"><button type="button" class="gl-x" data-gl-x aria-label="Lukk svaret" title="Lukk (Esc)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>${body}<span class="gl-grab" aria-hidden="true"></span></div>`;
}
// Boblen ligger i et eget lag på <body> (over nyhetslinjen og kortene), plassert rett under søkefeltet som ble brukt.
let ansForm = null;
function placeAns() {
  const el = document.getElementById('gl-layer');
  if (!el) return;
  const f = ansForm?.isConnected ? ansForm : document.querySelector('[data-search]');
  if (!f || !f.offsetParent) { el.style.display = 'none'; return; }
  const r = f.getBoundingClientRect(), w = Math.min(r.width, 680);
  el.style.display = '';
  el.style.width = `${w}px`;
  el.style.left = `${r.left + window.scrollX + (r.width - w) / 2}px`;
  el.style.top = `${r.bottom + window.scrollY + 10}px`;
}
/* Prompt 38: usynlig lag under boblen. Trykk (eller rull/touchmove) der lukker boblen og når ikke kortet under. */
function scrim(on) {
  let s = document.getElementById('gl-scrim');
  if (!on) { s?.remove(); return; }
  if (s) return;
  s = document.createElement('div'); s.id = 'gl-scrim'; s.className = 'gl-scrim'; s.setAttribute('aria-hidden', 'true');
  const shut = (e) => { e.preventDefault(); e.stopPropagation(); haptic(6); closeAns(); };
  s.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  s.addEventListener('click', shut);
  s.addEventListener('wheel', (e) => { closeAns(); e.stopPropagation(); }, { passive: true });
  s.addEventListener('touchmove', (e) => { closeAns(); e.stopPropagation(); }, { passive: true });
  document.body.appendChild(s);
}
/** Sveip opp på boblen (> 40 px) lukker med glid og fade; under terskelen spretter den tilbake. */
function bindSwipe(el) {
  if (el.dataset.glSw) return;
  el.dataset.glSw = '1';
  let st = null;
  el.addEventListener('pointerdown', (e) => { if (e.button || e.target.closest('button, a') || getSelection()?.toString()) { st = null; return; } st = { y: e.clientY, x: e.clientX, id: e.pointerId, dy: 0 }; });
  el.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    st.dy = Math.min(0, e.clientY - st.y);
    if (Math.abs(e.clientX - st.x) > 30 && st.dy > -10) { st = null; el.style.transform = ''; return; }
    if (st.dy < -6) { const a = el.querySelector('.gl-ans'); if (a) { a.style.transition = 'none'; a.style.transform = `translateY(${st.dy}px)`; a.style.opacity = String(Math.max(0.3, 1 + st.dy / 160)); } }
  });
  const end = () => {
    if (!st) return;
    const dy = st.dy, a = el.querySelector('.gl-ans'); st = null;
    if (!a) return;
    if (dy < -40) { a.style.transition = 'transform .2s ease, opacity .2s ease'; a.style.transform = 'translateY(-60px)'; a.style.opacity = '0'; haptic(6); setTimeout(closeAns, 190); return; }
    a.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .2s'; a.style.transform = ''; a.style.opacity = '';
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
function paintAns() {
  let el = document.getElementById('gl-layer');
  const h = ansHtml();
  scrim(!!h);
  if (!h) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'gl-layer'; el.className = 'gl-layer'; document.body.appendChild(el); }
  bindSwipe(el);
  el.innerHTML = h;
  placeAns();
  clearInterval(placeT); placeT = setInterval(() => { if (!document.getElementById('gl-layer')) { clearInterval(placeT); placeT = 0; return; } placeAns(); }, 400);
}
window.addEventListener('resize', placeAns);
let placeT = 0; // siden kan tegnes på nytt (data kommer inn), så posisjonen sjekkes jevnlig mens boblen vises

export function closeAns() { GL.ctl?.abort(); GL.seq++; clearTimeout(GL.toT); Object.assign(GL, { q: '', busy: false, ans: null, err: '', ctl: null, applied: false, slow: false, jobId: null, toT: 0 }); document.querySelectorAll('[data-search] [data-sq-eng]').forEach((b) => setGlimt(b, 'klar')); paintAns(); }
async function askGlimt(q, form = null) {
  closeAns();
  ansForm = form;
  const my = GL.seq, ctl = new AbortController();
  Object.assign(GL, { q, busy: true, ctl });
  paintAns();
  // Motor-ikonet i feltet (Glimt) tenker også mens svaret lages.
  const engState = (st) => document.querySelectorAll('[data-search] [data-sq-eng]').forEach((b) => setGlimt(b, st));
  engState('tenker');
  // Prompt 32: tar svaret lengre tid enn grensen, flyttes jobben til Chat (den avbrytes ikke på serveren).
  hsTimeout().then((sec) => {
    if (my !== GL.seq || !GL.busy) return;
    GL.toT = setTimeout(() => {
      if (my !== GL.seq || !GL.busy) return;
      GL.slow = true; paintAns();
      setTimeout(() => {
        if (my !== GL.seq || !GL.slow) return;
        const jobId = GL.jobId;
        GL.ctl?.abort(); GL.ctl = null; closeAns(); engState('klar');
        handoff(q, jobId);
      }, 700);
    }, sec * 1000);
  });
  try {
    const a = await assist(q, { source: 'search', signal: ctl.signal, onJob: (id) => { if (my === GL.seq) GL.jobId = id; }, hideToast: () => !!document.querySelector('[data-gl-ans]') && !document.hidden });
    if (my !== GL.seq) return;
    clearTimeout(GL.toT);
    // Serveren svarte med en snarvei (intent nav): åpne siden etter 0,45 s.
    const nv = a.intent === 'nav' && (a.nav?.web || a.target) ? a.nav?.web || null : null;
    if (nv) { GL.busy = false; GL.ans = { ...a, source: a.source || 'Snarvei', nav: true }; engState('klar'); paintAns(); setTimeout(() => { if (my !== GL.seq) return; closeAns(); const to = nv.startsWith('/#/innstillinger/') ? `set:${nv.split('/').pop() || 'konto'}` : nv.startsWith('/#/') ? nv.slice(1) : nv; goNav(to); }, a.nav?.delayMs ?? 450); return; }
    GL.ans = a; GL.err = a.error || '';
  } catch (e) { if (e.name === 'AbortError' || my !== GL.seq) { if (my === GL.seq || !GL.busy) engState('klar'); return; } GL.err = e.message || 'Glimt fikk ikke svart akkurat nå.'; }
  GL.busy = false; GL.ctl = null;
  engState('klar');
  paintAns();
}

/* ✦ AI: korte søk går til vanlig søk; ellers vises svaret fra AI-motoren i nedtrekket, med årsak hvis det feiler. */
function aiPanel(a) {
  if (a.loading) return `<div class="sq-ai"><div class="sq-ai-h">${glimt(16, 'tenker')} Glimt tenker …</div><div class="skeleton" style="min-height:54px;border-radius:12px"></div></div>`;
  if (a.error) return `<div class="sq-ai err"><div class="sq-ai-h">✦ AI</div><p>${esc(a.error)}</p><div class="sq-ai-act"><button type="button" data-sq-google="${esc(a.q)}">Søk på Google i stedet</button><button type="button" data-sq-aictl>Åpne AI-kontroll</button></div></div>`;
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

async function removeHist(form, it) {
  const t = it?.t;
  if (!t) return;
  sq.hist = (sq.hist ?? []).filter((x) => x.toLowerCase() !== t.toLowerCase());
  if (Array.isArray(sq.ent)) sq.ent = sq.ent.filter((x) => String(x.q).toLowerCase() !== t.toLowerCase());
  drawDrop(form);
  // Sletter fra serveren (og dermed fra mobilloggen). Uten id (nettopp logget) eller eldre server: etter tekst.
  if (it.id != null) { const r = await fetch(`/api/search-history/${encodeURIComponent(it.id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null); if (r?.ok) return; }
  await api(`/search/history/${encodeURIComponent(t)}`, { method: 'DELETE' }).catch(() => {});
}
async function clearHist(form) {
  const prevH = sq.hist, prevE = sq.ent;
  sq.hist = []; if (Array.isArray(sq.ent)) sq.ent = [];
  drawDrop(form);
  let items = null;
  try { const r = await fetch('/api/search-history', { method: 'DELETE', credentials: 'same-origin' }); if (r.ok) items = (await r.json())?.items ?? null; else await api('/search/history', { method: 'DELETE' }); } catch { await api('/search/history', { method: 'DELETE' }).catch(() => {}); }
  toast('Historikken er tømt', { action: 'Angre', onAction: async () => {
    if (items?.length) await fetch('/api/search-history/restore', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).catch(() => {});
    else for (const q of [...(prevH ?? [])].reverse().slice(-40)) await fetch('/api/search/history', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) }).catch(() => {});
    sq.hist = prevH; sq.ent = prevE; await loadHistory(true);
    toast('Historikken er tilbake');
  } });
}

export function bindSearch() {
  const formOf = (e) => e.target.closest?.('[data-search]');
  document.addEventListener('focusin', (e) => { const f = formOf(e); if (f) lastForm = f; });
  document.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-search]')) return;
    e.preventDefault();
    const it = sq.items[sq.sel];
    const q = it ? it.t : e.target.q.value;
    // Timer gjenkjennes uansett søkemotor og legges til i bakgrunnen.
    if (GL.q) closeAns();
    if (!it && apptOf(q)) { addAppt(e.target, q.trim()); return; }
    if (!it && huskeOf(q)) { addHuske(e.target, q.trim()); return; }
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
  // Svarboblen: «Fortsett i Chat ›» åpner en ny samtale med spørsmålet; trykk ellers på boblen lukker den.
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-gl-ans]');
    if (!b) return; // trykk utenfor håndteres av laget under boblen (gl-scrim)
    e.preventDefault(); e.stopPropagation();
    if (e.target.closest('[data-gl-x]')) { haptic(6); closeAns(); return; }
    // Prompt 33: «Endre tittel på N avtaler?» etter «husk at Påhåret er frisøren min».
    if (e.target.closest('[data-gl-apply]')) {
      const ap = GL.ans?.apply;
      if (ap?.memoryId) {
        GL.applied = true;
        fetch(`/api/glimt/memory/${encodeURIComponent(ap.memoryId)}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json()).then((d) => {
          GL.ans = { ...GL.ans, text: `Ferdig: **${d.count ?? 0} ${d.count === 1 ? 'avtale' : 'avtaler'}** heter nå «${ap.title}».` };
          paintAns();
        }).catch(() => {});
      }
      return;
    }
    if (e.target.closest('[data-gl-chat]')) { const q = GL.q, jobId = GL.busy ? GL.jobId : null; closeAns(); handoff(q, jobId); return; }
    // Prompt 35: værsvar for et sted – trykk på svaret (eller «Åpne Vær for …») åpner Vær for stedet.
    if (e.target.closest('[data-gl-fam]') && GL.ans?.open?.route === 'familie') { const o = GL.ans.open, pid = o.person?.userId ?? o.person?.id ?? o.person ?? GL.ans.person?.userId ?? GL.ans.person?.id; closeAns(); location.hash = `#/familie${pid ? `?person=${encodeURIComponent(pid)}` : ''}`; return; }
    if (GL.ans?.open?.route === 'vaer' && !GL.busy && !e.target.closest('button:not([data-gl-wx])')) { const o = GL.ans.open; closeAns(); location.hash = wxRoute(o); return; }
    if (e.target.closest('[data-gl-retry]')) { const q = GL.q, f = ansForm; askGlimt(q, f); return; }
    if (e.target.closest('[data-gl-aictl]')) { closeAns(); import('./ai-control.js').then((m) => { m.openAiControl({ tab: 'ov', theme: document.documentElement.dataset.hlTheme === '2c' ? 'papir' : 'mork', admin: store.me?.me?.role === 'admin' }); m.runSelftest(); }).catch(() => {}); return; }
    // Prompt 38: trykk ellers i boblen lukker den ikke (tekst kan markeres og leses).
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && GL.q && !document.getElementById('sq-eng-menu')) closeAns(); });
  window.addEventListener('hashchange', () => { if (GL.q && !GL.busy) closeAns(); });
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
    if (e.target.closest('[data-sq-huske]')) return addHuske(f, f.q.value.trim());
    if (e.target.closest('[data-sq-appt]')) return addAppt(f, f.q.value.trim());
    const del = e.target.closest('[data-sq-del]');
    if (del) return removeHist(f, sq.items[+del.dataset.sqDel]);
    if (e.target.closest('[data-sq-clear]')) return clearHist(f);
    if (e.target.closest('[data-sq-aictl]')) { e.preventDefault(); import('./ai-control.js').then((m) => { m.openAiControl({ tab: 'ov', theme: document.documentElement.dataset.hlTheme === '2c' ? 'papir' : 'mork', admin: store.me?.me?.role === 'admin' }); m.runSelftest(); }).catch(() => {}); return; }
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
/* Prompt 38 (Hjem web 1c): i Vindu og papir ruller nyhetslinjen med ≈ 7 s per sak (min. 30 s) delt på farten.
   Fartknappen ⏱ går 1 → 2 → 0,5 → 0 (stopp) → 1, lagres i hl_tick_sp. */
const TICK_SP = [1, 2, 0.5, 0];
export const tickSpeed = () => { try { const v = parseFloat(localStorage.getItem('hl_tick_sp') ?? '1'); return TICK_SP.includes(v) ? v : 1; } catch { return 1; } };
const paper = () => document.documentElement.dataset.hl === '2c';
export function cycleTick() {
  const i = TICK_SP.indexOf(tickSpeed()), v = TICK_SP[(i + 1) % TICK_SP.length];
  try { localStorage.setItem('hl_tick_sp', String(v)); } catch { /* */ }
  applyTicker();
}
export function applyTicker() {
  const el = document.getElementById('ticker'), u = store.me.ui ?? {};
  if (paper()) {
    const n = Math.max(1, store.data.news?.items?.length ?? 6), sp = tickSpeed();
    el.style.setProperty('--news-dur', `${Math.round(Math.max(30, 7 * n) / (sp || 1))}s`);
    el.classList.toggle('t38-stop', sp === 0);
    const b = el.querySelector('[data-tick-sp]');
    if (b) { b.querySelector('.mono').textContent = sp === 0 ? 'Stopp' : `${String(sp).replace('.', ',')}×`; b.setAttribute('aria-label', `Fart på nyhetslinjen: ${sp === 0 ? 'stoppet' : `${String(sp).replace('.', ',')}×`}. Trykk for å endre`); }
    el.classList.toggle('no-pause', false);
    return;
  }
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
  const spBtn = paper()
    ? `<button type="button" class="ticker-speed t38-sp" data-tick-sp title="Fart: 1× → 2× → 0,5× → stopp"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/></svg><span class="mono"></span></button>`
    : `<button class="ticker-speed" data-act="news-speed" title="Hastighet på nyhetsbaren" aria-label="Hastighet på nyhetsbaren"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0"/></svg><span class="mono">${store.me.ui?.newsSpeed ?? 5}</span></button>`;
  el.innerHTML = `<div class="ticker-label" role="button" tabindex="0">SISTE NYTT</div><div class="ticker-view"><div class="ticker-track">${list}<span style="display:contents" aria-hidden="true">${list.replace(/<a /g, '<a tabindex="-1" ')}</span></div></div>
    ${spBtn}`;
  applyTicker();
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
