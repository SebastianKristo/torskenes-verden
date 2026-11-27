// Prompt 57 (15.11): toppmenyen redigeres som hjemskjermen på iOS.
// - Hold inne en fane i 0,5 s (mus, penn eller finger), eller velg «Rediger faner» i profilmenyen → redigeringsmodus.
// - Fanene vibrerer og kan dras til ny rekkefølge. Rødt «−» skjuler en fane (ikke Oversikt).
// - «+» sist åpner «Legg til fane» med de skjulte fanene; den som legges til, kommer sist. «Ferdig» eller Esc avslutter.
// - Tastatur og skjermleser: i redigeringsmodus er fanene ikke lenker; hver fane har knappene «Skjul», «Flytt til venstre» og
//   «Flytt til høyre» (pilene vises når fanen har fokus), og endringene leses opp (#nav-edit-live).
// Oppsettet er det samme som i Innstillinger → Forside og meny → Faner, og lagres per bruker på serveren: rekkefølgen i
// layout_tabs (dnd.js setOrder), de skjulte i /api/me/layout → homelab.hiddenTabs (profile.js saveLayout). localStorage
// (hl_tabs52, startup.js) er bare bufferen som tegner menyen før serveren har svart.
import { esc, haptic } from './util.js';
import { setOrder } from './dnd.js';
import { TABS, FIXED_TABS, hiddenTabs, tabAllowed, tabLabel, saveLayout, applyNav } from './profile.js';
import { scheduleNavLayout } from './nav-overflow.js';

const HOLD_MS = 500, SLOP = 6;
let nav = null, bar = null, addBtn = null, menu = null, live = null, editing = false;

const anchors = () => [...nav.querySelectorAll(':scope > a[data-r]')];
// I synlig rekkefølge (dnd.js setter style.order; DOM-rekkefølgen er ikke nok).
const ordered = () => anchors().map((a, i) => [a, Number(a.style.order) || 0, i]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).map((x) => x[0]);
const shown = () => ordered().filter((a) => !a.hidden);
const nameOf = (a) => a.querySelector('.nav-tx')?.textContent ?? a.textContent.trim();
const say = (t) => { if (live) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = t; }); } };
const keepBarLast = () => { if (bar) bar.style.order = '10000'; const more = nav.querySelector(':scope > .nav-more'); if (more) more.style.order = '9999'; };

/** Lagrer rekkefølgen (indeksene i TABS, som dnd.js bruker) på serveren. */
function saveOrder() {
  const order = ordered().map((a) => Number(a.dataset.i)).filter(Number.isInteger);
  if (order.length) setOrder('tabs', order);
  keepBarLast();
}
async function saveHidden(set) {
  const ids = TABS.map(([k]) => k).filter((k) => tabAllowed(k) && set.has(k) && !FIXED_TABS.includes(k));
  await saveLayout({ hiddenTabs: ids });
  applyNav();
  decorate();
  keepBarLast();
}

/* ---------- Pynt på fanene i redigeringsmodus ---------- */

function decorate() {
  if (!editing) return;
  const vis = shown();
  for (const a of anchors()) {
    if (a.dataset.href == null && a.hasAttribute('href')) { a.dataset.href = a.getAttribute('href'); a.removeAttribute('href'); }
    if (!a.querySelector('.nav-tx')) { const t = a.textContent; a.textContent = ''; const s = document.createElement('span'); s.className = 'nav-tx'; s.textContent = t; a.appendChild(s); }
    a.querySelectorAll('.nav-x,.nav-mv').forEach((b) => b.remove());
    if (a.hidden) continue;
    const n = nameOf(a), i = vis.indexOf(a);
    const mk = (cls, txt, label, attr, dis) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = txt; b.setAttribute('aria-label', label);
      for (const [k, v] of Object.entries(attr)) b.setAttribute(k, v);
      if (dis) b.disabled = true;
      return b;
    };
    if (!FIXED_TABS.includes(a.dataset.r)) a.prepend(mk('nav-x', '−', `Skjul ${n}`, { 'data-nav-x': a.dataset.r }));
    a.append(mk('nav-mv', '‹', `Flytt ${n} til venstre`, { 'data-nav-mv': '-1' }, i <= 0), mk('nav-mv', '›', `Flytt ${n} til høyre`, { 'data-nav-mv': '1' }, i >= vis.length - 1));
  }
}
function undecorate() {
  for (const a of anchors()) {
    a.querySelectorAll('.nav-x,.nav-mv').forEach((b) => b.remove());
    const t = a.querySelector('.nav-tx'); if (t) a.textContent = t.textContent;
    if (a.dataset.href != null) { a.setAttribute('href', a.dataset.href); delete a.dataset.href; }
    a.classList.remove('nav-drag');
  }
}

/* ---------- Inn og ut av redigeringsmodus ---------- */

export const navEditing = () => editing;

export function startNavEdit() {
  if (!nav || editing || !nav.offsetParent) return;
  editing = true;
  haptic(12);
  nav.classList.add('nav-edit');
  document.body.classList.add('nav-editing');
  bar.hidden = false;
  keepBarLast();
  decorate();
  scheduleNavLayout();
  say('Redigerer fanene. Dra en fane for å flytte den, eller bruk knappene. Trykk Ferdig eller Escape for å avslutte.');
  (nav.querySelector(':scope > a[data-r]:not([hidden]) button') ?? bar.querySelector('.nav-done'))?.focus({ preventScroll: true });
}

export function stopNavEdit(focusBack = true) {
  if (!editing) return;
  editing = false;
  closeAdd();
  undecorate();
  nav.classList.remove('nav-edit');
  document.body.classList.remove('nav-editing');
  bar.hidden = true;
  scheduleNavLayout();
  document.dispatchEvent(new Event('hl:nav-saved')); // startup.js oppdaterer bufferen
  say('Ferdig med å redigere fanene.');
  if (focusBack) nav.querySelector(':scope > a[aria-current="page"]:not([hidden])')?.focus({ preventScroll: true });
}

/* ---------- Flytt, skjul og legg til ---------- */

function moveBy(a, d) {
  const vis = shown(), i = vis.indexOf(a), j = i + d;
  if (i < 0 || j < 0 || j >= vis.length) return;
  placeBefore(a, d < 0 ? vis[j] : vis[j + 1] ?? null);
  saveOrder();
  decorate();
  a.querySelector(`.nav-mv[data-nav-mv="${d}"]:not(:disabled)`)?.focus() ?? a.querySelector('.nav-mv:not(:disabled)')?.focus();
  say(`${nameOf(a)} flyttet til plass ${shown().indexOf(a) + 1} av ${vis.length}.`);
}
/** Flytter fanen rett foran `ref` (eller sist) i den synlige rekkefølgen, også forbi skjulte faner. */
function placeBefore(a, ref) {
  const all = ordered().filter((x) => x !== a);
  const at = ref ? all.indexOf(ref) : all.length;
  all.splice(at < 0 ? all.length : at, 0, a);
  all.forEach((x, k) => { x.style.order = k; });
}

async function hide(id) {
  const a = nav.querySelector(`:scope > a[data-r="${CSS.escape(id)}"]`);
  const n = a ? nameOf(a) : id;
  const next = shown()[shown().indexOf(a) + 1] ?? shown()[shown().indexOf(a) - 1];
  const set = hiddenTabs(); set.add(id);
  haptic(8);
  await saveHidden(set);
  say(`${n} er skjult. Legg den til igjen med «Legg til fane».`);
  (next?.querySelector('button') ?? addBtn)?.focus({ preventScroll: true });
}

async function add(id) {
  const a = nav.querySelector(`:scope > a[data-r="${CSS.escape(id)}"]`);
  if (!a) return;
  closeAdd();
  placeBefore(a, null);
  saveOrder();
  const set = hiddenTabs(); set.delete(id);
  await saveHidden(set);
  say(`${nameOf(a)} er lagt til sist i menyen.`);
  a.querySelector('button')?.focus({ preventScroll: true });
}

function openAdd() {
  const hid = hiddenTabs();
  const list = ordered().filter((a) => hid.has(a.dataset.r) && tabAllowed(a.dataset.r));
  menu.innerHTML = `<h2 class="nav-add-h">Legg til fane</h2>${list.length
    ? list.map((a) => `<button type="button" data-nav-add="${esc(a.dataset.r)}"><span class="nav-add-plus" aria-hidden="true">+</span>${esc(tabLabel(a.dataset.r, a.dataset.def ?? nameOf(a)))}</button>`).join('')
    : '<p class="nav-add-none">Alle fanene vises.</p>'}`;
  menu.hidden = false;
  addBtn.setAttribute('aria-expanded', 'true');
  const r = addBtn.getBoundingClientRect();
  menu.style.top = `${Math.round(r.bottom + 8)}px`;
  menu.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
  (menu.querySelector('button') ?? addBtn).focus({ preventScroll: true });
}
function closeAdd() {
  if (!menu || menu.hidden) return false;
  menu.hidden = true;
  addBtn.setAttribute('aria-expanded', 'false');
  return true;
}

/* ---------- Hold inne og dra ---------- */

let press = null; // { a, x, y, t, id }
let drag = null;  // { a, id, moved }

function onDown(e) {
  const a = e.target.closest?.('a[data-r]') ?? null;
  if (!a || a.parentElement !== nav || document.querySelector('header.top.hp-edit')) return;
  // Fanene dras bare her (ikke av dnd.js eller hele topplinja).
  e.stopPropagation();
  if (e.button !== 0) return;
  if (editing) {
    if (e.target.closest('button')) return;
    drag = { a, id: e.pointerId, moved: false, x: e.clientX, y: e.clientY };
    return;
  }
  press = { a, x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(() => { press = null; startNavEdit(); }, HOLD_MS) };
}
function cancelPress() { if (press) { clearTimeout(press.t); press = null; } }
function onMove(e) {
  if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancelPress();
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < SLOP) return;
  if (!drag.moved) { drag.moved = true; drag.a.classList.add('nav-drag'); document.body.classList.add('dnd-active'); try { drag.a.setPointerCapture(e.pointerId); } catch { /* */ } }
  e.preventDefault();
  const over = shown().find((x) => { if (x === drag.a) return false; const r = x.getBoundingClientRect(); return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top - 6 && e.clientY < r.bottom + 6; });
  if (!over) return;
  const vis = shown(), from = vis.indexOf(drag.a), to = vis.indexOf(over);
  placeBefore(drag.a, from < to ? vis[to + 1] ?? null : over);
}
function onUp(e) {
  cancelPress();
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  d.a.classList.remove('nav-drag');
  document.body.classList.remove('dnd-active');
  if (d.moved) { saveOrder(); decorate(); haptic(8); say(`${nameOf(d.a)} flyttet til plass ${shown().indexOf(d.a) + 1}.`); }
}

/** Kobler redigeringen på toppmenyen. Kalles én gang ved oppstart, etter setupDnd og initNavOverflow. */
export function initNavEdit() {
  nav = document.querySelector('header.top .pillnav');
  if (!nav || bar) return;
  bar = document.createElement('span');
  bar.className = 'nav-edit-bar';
  bar.hidden = true;
  bar.innerHTML = '<button type="button" class="nav-add" aria-label="Legg til fane" aria-haspopup="dialog" aria-expanded="false">+</button><button type="button" class="nav-done">Ferdig</button>';
  nav.appendChild(bar);
  addBtn = bar.querySelector('.nav-add');
  menu = document.createElement('div');
  menu.className = 'nav-more-menu nav-add-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Legg til fane');
  menu.hidden = true;
  document.body.appendChild(menu);
  live = document.createElement('div');
  live.id = 'nav-edit-live';
  live.className = 'nav-live';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  // Fangstfase: før dnd.js (fanene og hele topplinja) og før lenken får trykket.
  nav.addEventListener('pointerdown', onDown, true);
  nav.addEventListener('touchstart', (e) => { if (e.target.closest?.('a[data-r]')?.parentElement === nav && !document.querySelector('header.top.hp-edit')) e.stopPropagation(); }, { capture: true, passive: true });
  nav.addEventListener('contextmenu', (e) => { if ((press || editing) && e.target.closest?.('a[data-r]')) e.preventDefault(); });
  nav.addEventListener('dragstart', (e) => { if (e.target.closest?.('a[data-r]')) e.preventDefault(); });
  addEventListener('pointermove', onMove, { passive: false });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);

  nav.addEventListener('click', (e) => {
    if (!editing) return;
    const x = e.target.closest('[data-nav-x]'), mv = e.target.closest('[data-nav-mv]');
    if (x) { e.preventDefault(); hide(x.dataset.navX); return; }
    if (mv) { e.preventDefault(); moveBy(mv.closest('a[data-r]'), Number(mv.dataset.navMv)); return; }
    if (e.target.closest('.nav-add')) { e.preventDefault(); if (!closeAdd()) openAdd(); return; }
    if (e.target.closest('.nav-done')) { e.preventDefault(); stopNavEdit(); return; }
    if (e.target.closest('a[data-r]')) e.preventDefault(); // fanene er ikke lenker mens de redigeres
  });
  menu.addEventListener('click', (e) => { const b = e.target.closest('[data-nav-add]'); if (b) add(b.dataset.navAdd); });
  document.addEventListener('click', (e) => { if (menu && !menu.hidden && !menu.contains(e.target) && !addBtn.contains(e.target)) closeAdd(); });
  document.addEventListener('keydown', (e) => {
    if (!editing || e.key !== 'Escape') return;
    e.preventDefault();
    if (closeAdd()) { addBtn.focus(); return; }
    stopNavEdit();
  });
  // Modullisten kan bygge fanene på nytt (applyNav); pynten legges på igjen.
  new MutationObserver(() => { if (editing && anchors().some((a) => a.hasAttribute('href') || !a.querySelector('.nav-tx'))) decorate(); }).observe(nav, { childList: true });
  addEventListener('hashchange', () => closeAdd());
}
