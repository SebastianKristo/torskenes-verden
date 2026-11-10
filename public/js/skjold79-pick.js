// Prompt 79 (PICKWEB): plukkliste og «Feilsøk LED» i Skjold Lab på web.
// - + på hvert treff i lista og på detaljsiden legger delen i plukklista (✓ når den er med, nytt trykk fjerner den).
// - Plukklistelinja nederst (sticky): «Plukkliste (n)» · «💡 Vis alle med LED» · Åpne. Når delene lyser: nedtelling og «Slå av».
// - Plukklista åpnes som et ark: bilde, navn, plassering og fargeprikk når delen lyser, ± for antall jeg tar, Fjern, Tøm og
//   «Ta ut av lager» (POST /parts/:id/qty {delta:-n} for alle, med angre).
// - «Vis alle med LED»: POST /api/skjold/locate {partIds, colors:true} → lit[].color per del (egen palett hvis serveren ikke gir farge).
// - Lista lagres lokalt per bruker (localStorage «sk79_pick») og synkes med GET|PUT /api/skjold/picklist når serveren har det (404 → bare lokalt).
// - «Feilsøk LED» i LED-oppsettet: POST /cabinets/:id/leds/diagnose → {steps, hint}; veiviser med «Lyste stripa rødt? Ja/Nei» og
//   «Lyste én LED blått? Ja/Nei», og hint ut fra svarene.
import { esc, haptic } from './util.js';
import { toast } from './toast.js';
import { S, sk, write, locOf, locText, cabById, thumbHtml, thumbOf, paintMain, loadPart } from './skjold76.js';
import { short76 } from './skjold76-draw.js';
import { M as M78, locate78, off78, cfgOf78, ledSetupHtml78 } from './skjold78-leds.js';
import { secsLeft78 } from './skjold78-logic.js';
import { pickTargetHtml82, pickTarget82, afterPickTake82 } from './skjold82-projects.js'; // prompt 82: «Til produkt» ved «Ta ut av lager»
import { MAX_LIT79, normPick79, has79, toggle79, setQty79, snap79, pickBody79, locateBody79, colorsOf79, skippedOf79, hint79, steps79, report79 } from './skjold79-logic.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-sk79-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/skjold79.css'; l.dataset.sk79Css = ''; document.head.appendChild(l);
}

/** items: plukklista · lit: lyset vi tente (for fargene) · open: arket · diag: feilsøkingen. */
export const P = { items: [], lit: null, open: false, diag: null, loaded: false, serverOff: false, at: 0 };
const LS = 'sk79_pick';
const enc = encodeURIComponent;
const uid = () => { try { return localStorage.getItem('hl_uid') || ''; } catch { return ''; } };
const isNet = (e) => e instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);

/* ================= Lagring ================= */

function readLocal() {
  try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); if (o && (!o.uid || String(o.uid) === uid())) return o; } catch { /* privat modus */ }
  return null;
}
function saveLocal() { try { localStorage.setItem(LS, JSON.stringify({ uid: uid(), at: P.at, items: P.items })); } catch { /* full lagring eller privat modus */ } }
let putT = 0;
function changed(items) {
  P.items = items; P.at = Date.now(); saveLocal();
  if (!P.lit || !M78.lit) P.lit = null;
  paint79();
  if (P.serverOff) return;
  clearTimeout(putT);
  putT = setTimeout(async () => {
    try { await sk('/picklist', { method: 'PUT', json: pickBody79(P.items) }); } catch (e) { if (e?.status === 404) P.serverOff = true; }
  }, 600);
}
/** Lastes én gang når Skjold Lab åpnes. Serveren vinner hvis den er nyere enn det lokale. */
export async function loadPick79() {
  if (P.loaded) return;
  P.loaded = true;
  const l = readLocal();
  P.items = normPick79(l?.items); P.at = +l?.at || 0;
  paint79();
  try {
    const r = await sk('/picklist');
    const items = normPick79(r), sAt = Date.parse(r?.updatedAt ?? r?.updated_at ?? '') || 0;
    if (items.length && (sAt >= P.at || !P.items.length)) {
      const old = new Map(P.items.map((x) => [x.id, x]));
      P.items = items.map((x) => ({ ...old.get(x.id), ...x })); P.at = sAt || Date.now(); saveLocal();
    } else if (P.items.length && (!items.length || P.at > sAt)) {
      sk('/picklist', { method: 'PUT', json: pickBody79(P.items) }).catch(() => {});
    }
  } catch (e) { if (e?.status === 404) P.serverOff = true; }
  enrich();
  paint79();
}
/** Fyller inn navn, bilde og plassering for deler som bare har id (fra serveren eller en annen enhet). */
let enriching = false;
async function enrich() {
  if (enriching) return; enriching = true;
  try {
    for (const x of P.items.slice(0, 60)) {
      if (S.parts[x.id] || x.name) continue;
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      await loadPart(x.id);
    }
  } finally { enriching = false; }
  refreshSnaps(); paint79();
}
/** Oppdaterer øyeblikksbildene fra delene som er hentet (navn, bilde, plassering, lager). */
function refreshSnaps() {
  let dirty = false;
  P.items = P.items.map((x) => {
    const p = S.parts[x.id]; if (!p) return x;
    const l = locOf(p), n = { ...x, ...snap79(p), thumb: thumbOf(p) || x.thumb || '', loc: l ? { cabinetId: l.cabinetId, row: l.row, col: l.col } : undefined, locText: l ? locText(p.location?.text ? p.location : l) : 'Uten plass', code: l ? short76(l.row, l.col) : '' };
    if (!n.thumb) delete n.thumb; if (!n.loc) delete n.loc;
    if (JSON.stringify(n) !== JSON.stringify(x)) dirty = true;
    return n;
  });
  if (dirty) saveLocal();
}

/* ================= Knapper ================= */

/** + / ✓ på et treff i lista eller på detaljsiden. */
export function pickBtn79(p, big = false) {
  if (!p || p.deletedAt || p.deleted_at) return '';
  const on = has79(P.items, p.id);
  const label = on ? `Fjern ${p.name} fra plukklista` : `Legg ${p.name} i plukklista`;
  if (big) return `<button type="button" class="sk76-btn sk79-pd${on ? ' on' : ''}" data-sk79-add="${esc(p.id)}" aria-pressed="${on}">${on ? '✓ I plukklista' : '+ Plukkliste'}</button>`;
  return `<button type="button" class="sk79-pb${on ? ' on' : ''}" data-sk79-add="${esc(p.id)}" aria-pressed="${on}" aria-label="${esc(label)}" title="${on ? 'I plukklista' : 'Legg i plukklista'}">${on ? '✓' : '+'}</button>`;
}

/** Skallet: plukklistelinja (settes inn nederst i #sk76). */
export const pickShellHtml79 = () => '<div class="sk79-bar" data-sk79-bar hidden></div>';

const root = () => document.getElementById('sk76');
/* Arket ligger rett under <body> (#sk79-port): .shell har sin egen stabel (z-index 1), og mobilmenyen nederst (z-index 6) ville ellers ligge over.
   Porten har klassen sk76 (display: contents), så fargene og knappene følger Skjold Lab. */
let portBound = false;
function port() {
  let el = document.getElementById('sk79-port');
  if (!el) {
    el = document.createElement('div'); el.id = 'sk79-port'; el.className = 'sk76 sk79-port';
    el.innerHTML = '<div class="sk79-scrim" data-sk79-scrim hidden></div><div class="sk79-sheet" data-sk79-sheet role="dialog" aria-modal="true" aria-labelledby="sk79-h" hidden></div>';
    document.body.appendChild(el);
  }
  if (!portBound) {
    portBound = true;
    document.addEventListener('click', (e) => { const t = e.target; if (t.closest?.('#sk79-port')) click79(t); });
    document.addEventListener('keydown', (e) => { if (P.open && !root()?.contains(e.target)) key79(e); });
    document.addEventListener('error', (e) => { const t = e.target; if (t?.tagName === 'IMG' && t.closest?.('#sk79-port .sk76-th')) t.remove(); }, true);
    window.addEventListener('hashchange', () => { if (!/^#\/skjold(\/|\?|$)/.test(location.hash)) closeSheet(false); });
  }
  return el;
}
/** Linja ligger over mobilmenyen når den vises. */
function placeBar(el) {
  const nav = document.querySelector('.bottomnav');
  let off = '';
  if (nav && getComputedStyle(nav).position === 'fixed' && nav.offsetHeight) { const d = innerHeight - nav.getBoundingClientRect().top; if (d > 0 && d < innerHeight / 2) off = `${Math.round(d + 10)}px`; }
  if (off) el.style.setProperty('--sk79-bot', off); else el.style.removeProperty('--sk79-bot');
}
const litNow = () => !!(P.lit && M78.lit && M78.lit === P.lit.ref && secsLeft78(M78.lit.until) > 0);

let tick = 0;
function ensureTick() {
  clearInterval(tick);
  if (litNow()) tick = setInterval(() => { if (!litNow()) { clearInterval(tick); P.lit = null; paint79(); } else { paintBar(); paintSheetLit(); } }, 1000);
}

function paintBar() {
  const el = root()?.querySelector('[data-sk79-bar]'); if (!el) return;
  const n = P.items.length, hide = !n || S.route.v === 'setup' || S.route.v === 'edit' || S.route.v === 'tidy';
  el.hidden = hide; root().classList.toggle('sk79-has', !hide);
  if (hide) { el.innerHTML = ''; return; }
  placeBar(el);
  const lit = litNow(), left = lit ? secsLeft78(M78.lit.until) : 0;
  const dots = lit ? Object.values(P.lit.colors).slice(0, 6).map((c) => `<i class="sk79-dot" style="background:${esc(c)}"></i>`).join('') : '';
  el.innerHTML = `<button type="button" class="sk79-open" data-sk79="open" aria-haspopup="dialog"><b>Plukkliste (${n})</b>${dots ? `<span class="sk79-dots" aria-hidden="true">${dots}</span>` : ''}</button>
    ${lit ? `<span class="sk79-sec" role="status">${left} s</span><button type="button" class="sk76-btn" data-sk79="off">Slå av</button>` : `<button type="button" class="sk76-btn pri sk79-all" data-sk79="show"${anyLed() ? '' : ' disabled title="Ingen av delene ligger i et skap med lys"'}>💡 <span class="sk79-l">Vis alle med LED</span><span class="sk79-s">Vis med LED</span></button>`}
    <button type="button" class="sk79-chev" data-sk79="open" aria-label="Åpne plukklista">›</button>`;
}
/** Har minst én del i lista et skap med lys? (ukjent → ja, serveren avgjør) */
function anyLed() {
  return P.items.some((x) => {
    const l = (S.parts[x.id] && locOf(S.parts[x.id])) || x.loc; if (!l) return false;
    const c = cabById(l.cabinetId); if (!c) return true;
    const L = M78.cfg[c.id]; if (L) return !!(L.enabled && L.host);
    const b = c.leds; return b && typeof b === 'object' && typeof b.enabled === 'boolean' ? b.enabled : true;
  });
}

/* ================= Arket ================= */

function rowHtml(x, i) {
  const p = S.parts[x.id] ?? { id: x.id, name: x.name ?? `Del ${x.id}`, thumbUrl: x.thumb };
  const l = locOf(S.parts[x.id]) ?? x.loc, where = S.parts[x.id] ? (l ? locText(S.parts[x.id].location?.text ? S.parts[x.id].location : l) : 'Uten plass') : x.locText ?? (l ? '' : 'Uten plass');
  const color = litNow() ? P.lit.colors[x.id] : null, skip = litNow() ? P.lit.skipped[x.id] : null;
  const stock = Number.isFinite(+p.qty) ? +p.qty : x.stock, over = Number.isFinite(stock) && x.qty > stock;
  return `<li class="sk79-row" data-sk79-row="${esc(x.id)}">
    <a class="sk79-pi" href="#/skjold/del/${enc(x.id)}" data-sk79="close-nav">${thumbHtml(p, 'sm')}<span class="sk79-it"><b>${color ? `<i class="sk79-dot" style="background:${esc(color)}" title="Lyser i denne fargen"></i>` : ''}${esc(p.name)}</b>
      <span class="sk79-loc">${l ? `<i class="sk76-code">${esc(short76(l.row, l.col))}</i>` : ''}${esc(where)}${skip ? ` · <em class="sk79-skip">${esc(skip)}</em>` : ''}</span>
      ${Number.isFinite(stock) ? `<span class="sk79-stock${over ? ' bad' : ''}">${esc(`${stock} ${p.unit || x.unit || 'stk'} på lager`)}</span>` : ''}</span></a>
    <span class="sk79-qty" role="group" aria-label="${esc(`Antall jeg tar av ${p.name}`)}"><button type="button" data-sk79-q="${esc(x.id)}:-1" aria-label="Én mindre"${x.qty <= 1 ? ' disabled' : ''}>−</button><b aria-live="polite">${esc(x.qty)}</b><button type="button" data-sk79-q="${esc(x.id)}:1" aria-label="Én til">+</button></span>
    <button type="button" class="sk76-link sk79-rm" data-sk79-rm="${esc(x.id)}" aria-label="${esc(`Fjern ${p.name}`)}">Fjern</button>
    ${i >= MAX_LIT79 ? '<span class="sk79-max">Over 20 – lyser ikke</span>' : ''}
  </li>`;
}
function litLine() {
  if (!litNow()) return '';
  const n = P.lit.n;
  return `<div class="sk79-litl" data-sk79-litl role="status"><span class="sk78-dot" aria-hidden="true"></span><span><b>${esc(n === 1 ? '1 skuff lyser' : `${n} skuffer lyser`)}</b> · <span data-sk79-sec>${secsLeft78(M78.lit.until)} s</span></span><button type="button" class="sk76-btn" data-sk79="off">Slå av</button></div>`;
}
function paintSheetLit() { const el = document.querySelector('#sk79-port [data-sk79-sec]'); if (el && litNow()) el.textContent = `${secsLeft78(M78.lit.until)} s`; }
function sheetHtml() {
  const n = P.items.length;
  return `<div class="sk79-sh">
      <span class="sk79-grab" aria-hidden="true"></span>
      <div class="sk79-shh"><div><span class="sk76-kick">SKJOLD LAB</span><h2 id="sk79-h" class="sk79-h2">Plukkliste <em>${esc(n === 1 ? '1 del' : `${n} deler`)}</em></h2></div>
      <button type="button" class="sk77-x sk79-x" data-sk79="close" aria-label="Lukk plukklista">×</button></div>
      ${litLine()}
    </div>
    ${n ? `<ul class="sk79-list" role="list">${P.items.map(rowHtml).join('')}</ul>` : '<div class="sk79-empty"><b>Plukklista er tom</b><span>Trykk + ved en del i lista eller på detaljsiden, så samles de her. Da kan du tenne alle skuffene på én gang.</span></div>'}
    ${n ? `<div class="sk79-acts">
      ${litNow() ? '<button type="button" class="sk76-btn" data-sk79="off">Slå av lyset</button>' : `<button type="button" class="sk76-btn pri" data-sk79="show"${anyLed() ? '' : ' disabled'}>💡 Vis alle med LED</button>`}
      ${pickTargetHtml82()}
      <button type="button" class="sk76-btn" data-sk79="take">Ta ut av lager</button>
      <button type="button" class="sk76-btn danger" data-sk79="clear">Tøm</button>
    </div>
    <p class="sk76-mut sk79-foot">${P.serverOff ? 'Lista er lagret på denne enheten.' : 'Lista er lagret og følger deg mellom enheter.'}${n > MAX_LIT79 ? ` Maks ${MAX_LIT79} lyser samtidig.` : ''}</p>` : ''}`;
}
let lastFocus = null;
function paintSheet() {
  if (!P.open && !document.getElementById('sk79-port')) return;
  const pt = port(), el = pt.querySelector('[data-sk79-sheet]'), sc = pt.querySelector('[data-sk79-scrim]');
  el.hidden = !P.open; if (sc) sc.hidden = !P.open;
  document.documentElement.classList.toggle('sk79-lock', P.open);
  if (!P.open) { el.innerHTML = ''; return; }
  const f = document.activeElement?.closest?.('[data-sk79-sheet]') ? document.activeElement : null;
  const key = f ? [f.dataset.sk79Q, f.dataset.sk79Rm, f.dataset.sk79].join('|') : '';
  el.innerHTML = sheetHtml();
  if (key) { const again = [...el.querySelectorAll('button')].find((b) => [b.dataset.sk79Q, b.dataset.sk79Rm, b.dataset.sk79].join('|') === key && !b.disabled); (again ?? el.querySelector('[data-sk79="close"]'))?.focus(); }
}
function openSheet() {
  lastFocus = document.activeElement;
  P.open = true; refreshSnaps(); paintSheet(); enrich();
  document.querySelector('#sk79-port [data-sk79="close"]')?.focus();
}
function closeSheet(restore = true) {
  if (!P.open) return;
  P.open = false; paintSheet();
  if (restore && lastFocus?.isConnected) lastFocus.focus?.();
}

/** Tegner linja, arket og knappene på nytt (+ i lista og på detaljsiden). */
export function paint79() {
  paintBar(); if (P.open) paintSheet();
  document.querySelectorAll('#sk76 [data-sk79-add]').forEach((b) => {
    const p = S.parts[b.dataset.sk79Add] ?? { id: b.dataset.sk79Add, name: '' };
    const tmp = document.createElement('div'); tmp.innerHTML = pickBtn79(p, b.classList.contains('sk79-pd'));
    if (tmp.firstElementChild) b.replaceWith(tmp.firstElementChild);
  });
}

/* ================= Handlinger ================= */

function toggle(id) {
  const p = S.parts[id] ?? S.items.find((x) => String(x.id) === String(id)) ?? { id };
  const was = has79(P.items, id);
  haptic(was ? 6 : 12);
  let items = toggle79(P.items, p);
  if (!was) { const l = locOf(p); items = items.map((x) => (x.id === String(id) ? { ...x, thumb: thumbOf(p) || undefined, loc: l ? { cabinetId: l.cabinetId, row: l.row, col: l.col } : undefined, locText: l ? locText(p.location?.text ? p.location : l) : 'Uten plass' } : x)); }
  changed(normPick79(items));
  toast(was ? `«${p.name ?? 'Delen'}» er fjernet fra plukklista` : `«${p.name ?? 'Delen'}» er lagt i plukklista (${P.items.length})`);
}
async function showAll() {
  if (!P.items.length) return;
  const cab = cabById(((S.parts[P.items[0].id] && locOf(S.parts[P.items[0].id])) || P.items[0].loc)?.cabinetId);
  const first = cab ? cfgOf78(cab.id)?.color ?? null : null;
  haptic(10);
  const r = await locate78(locateBody79(P.items)); // viser selv feilmeldingen (nett, 429, ingen lys)
  const lit = Array.isArray(r?.lit) ? r.lit : [];
  if (!lit.length || r?.ok === false) return;
  const colors = colorsOf79(P.items, lit, first), skipped = skippedOf79(r.skipped);
  const drawers = new Set(lit.map((l) => `${l.cabinetId}:${l.row}-${l.col}`)).size;
  P.lit = { ref: M78.lit, colors, skipped, n: drawers };
  ensureTick(); paint79();
  const sk2 = Object.keys(skipped).length;
  toast(`💡 ${drawers === 1 ? '1 skuff lyser' : `${drawers} skuffer lyser`}${sk2 ? ` · ${sk2} uten lys` : ''}`);
}
async function off() {
  P.lit = null; clearInterval(tick);
  const done = off78(); // samme som «Slå av» i lyslinja øverst (tømmer den også)
  paint79(); await done;
}
/** Ta ut av lager: POST /picklist/take (angre: /picklist/undo); gammel server → én og én med /parts/:id/qty. */
async function takeOut() {
  const list = P.items.slice();
  if (!list.length) return;
  if (!navigator.onLine) { toast('Endringer krever nett. Prøv igjen når du er tilkoblet.'); return; }
  const to = pickTarget82(); // prompt 82: {} | {projectId} | {projectName} – alt eller ingenting, 409 ved for lite
  if (to.error) { toast(to.error); return; }
  let undo = [], fail = [], bulk = true, token = null, proj = null;
  try {
    const r = await sk('/picklist/take', { method: 'POST', json: { ...pickBody79(list), ...to } });
    if (r?.undoToken) { token = r.undoToken; proj = r.project?.name ?? null; afterPickTake82(r); }
    for (const x of Array.isArray(r?.parts) ? r.parts : []) { const id = String(x.partId); if (S.parts[id]) S.parts[id] = { ...S.parts[id], qty: x.after }; }
    undo = (Array.isArray(r?.undo) ? r.undo : []).map((u) => ({ id: String(u.partId), set: u.set }));
    fail = (Array.isArray(r?.skipped) ? r.skipped : []).map((x) => S.parts[x.partId]?.name ?? x.partId);
  } catch (e) {
    if (e?.status !== 404 || to.projectId || to.projectName) { toast(isNet(e) ? 'Endringer krever nett. Prøv igjen når du er tilkoblet.' : e?.message || 'Fikk ikke trukket fra lageret.'); return; }
    bulk = false;
    for (const x of list) {
      try { const r = await sk(`/parts/${enc(x.id)}/qty`, { method: 'POST', json: { delta: -x.qty } }); undo.push({ id: x.id, set: r?.undo?.set ?? null, qty: x.qty }); if (r?.part) S.parts[x.id] = { ...(S.parts[x.id] ?? {}), ...r.part }; } catch (e2) { fail.push(S.parts[x.id]?.name ?? x.name ?? x.id); if (isNet(e2)) break; }
    }
  }
  if (!undo.length) { toast('Fikk ikke trukket fra lageret.'); return; }
  const taken = list.filter((x) => undo.some((u) => u.id === x.id));
  changed(list.filter((x) => !undo.some((u) => u.id === x.id)));
  if (P.open && !P.items.length) closeSheet();
  haptic(12);
  toast(`Tok ut ${taken.length === 1 ? '1 del' : `${taken.length} deler`} av lageret${proj ? ` til «${proj}»` : ''}${fail.length ? ` · feilet for ${fail.slice(0, 2).join(', ')}` : ''}`, {
    action: 'Angre', ms: 10_000, onAction: async () => {
      const ok = await write(async () => {
        if (token) return sk('/checkout/undo', { method: 'POST', json: { undoToken: token } }); // prompt 82: legger tilbake og sletter utsjekkingen
        if (bulk) return sk('/picklist/undo', { method: 'POST', json: { undo: undo.map((u) => ({ partId: /^\d+$/.test(u.id) ? Number(u.id) : u.id, set: u.set })) } });
        for (const u of undo) await sk(`/parts/${enc(u.id)}/qty`, { method: 'POST', json: u.set != null ? { set: u.set } : { delta: u.qty } });
        return {};
      }, 'Lageret er satt tilbake');
      if (ok) { if (token) afterPickTake82(null); changed(normPick79([...taken, ...P.items])); for (const u of undo) delete S.parts[u.id]; enrich(); paintMain(); }
    },
  });
  paintMain();
}
function clearAll() {
  const prev = P.items.slice(); if (!prev.length) return;
  changed([]); closeSheet();
  toast('Plukklista er tømt', { action: 'Angre', ms: 8000, onAction: () => changed(prev) });
}

/* ================= Feilsøk LED ================= */

/** Knappen i LED-oppsettet. */
export const diagBtn79 = (c) => `<button type="button" class="sk76-btn" data-sk79="diag" data-cab="${esc(c.id)}"${P.diag?.cabId === c.id ? ' aria-pressed="true"' : ''}>Feilsøk LED</button>`;
function repaintSetup() {
  const box = document.querySelector('#sk76 [data-sk78-setup]'), c = cabById(box?.dataset.sk78Setup);
  if (box && c) box.outerHTML = ledSetupHtml78(c);
}
const yesNo = (k, v) => `<span class="sk79-yn" role="group"><button type="button" class="sk76-btn${v === true ? ' pri' : ''}" data-sk79-ans="${k}:1" aria-pressed="${v === true}">Ja</button><button type="button" class="sk76-btn${v === false ? ' pri' : ''}" data-sk79-ans="${k}:0" aria-pressed="${v === false}">Nei</button></span>`;
const stepsHtml = (steps) => (steps.length ? `<ul class="sk79-steps">${steps.map((s) => `<li class="${s.ok === true ? 'ok' : s.ok === false ? 'bad' : ''}"><i aria-hidden="true">${s.ok === true ? '✓' : s.ok === false ? '✗' : '·'}</i><span><b>${esc(s.name)}</b>${s.detail ? `<small>${esc(s.detail)}</small>` : ''}</span></li>`).join('')}</ul>` : '');
/** Veiviseren (settes inn i LED-kortet når den er åpen for dette skapet).
 *  Faser: intro → check → red (spør) → blue (spør) → restore → done. Gammel server uten «step» → alt i ett kall (all) og spørsmålene etterpå. */
export function diagHtml79(c) {
  const D = P.diag; if (!D || D.cabId !== c.id) return '';
  let body = '';
  const busy = D.busy ? ' disabled aria-busy="true"' : '';
  if (D.phase === 'intro') {
    body = `<ol class="sk79-plan"><li>Vi sjekker at WLED svarer, og leser segmentet.</li><li><b>Hele stripa lyser rødt i 3 s</b> med vanlig farge.</li><li><b>Én LED lyser blått i 3 s</b> slik Skjold Lab tenner skuffer.</li><li>Lyset settes tilbake slik det var.</li></ol>
      <p class="sk76-mut sk78-p">Stå slik at du ser stripa, og trykk Start.</p>
      <div class="sk79-yn"><button type="button" class="sk76-btn pri" data-sk79="diag-run">Start feilsøking</button></div>`;
  } else if (D.phase === 'check' || D.phase === 'restore') {
    body = `${stepsHtml(D.steps)}<p class="sk79-now" aria-live="polite"><span class="sk78-dot" aria-hidden="true"></span><b>${D.phase === 'check' ? 'Sjekker WLED …' : 'Setter lyset tilbake …'}</b></p>`;
  } else if (D.phase === 'all') {
    const t = (Date.now() - D.t0) / 1000;
    body = `<p class="sk79-now" aria-live="polite"><span class="sk78-dot${t >= 1.5 && t < 4.5 ? ' red' : ''}" aria-hidden="true"></span><b>${t < 1.5 ? 'Sjekker WLED …' : t < 4.5 ? 'Se på stripa: den skal lyse rødt nå' : t < 8 ? 'Se på stripa: én LED skal lyse blått nå' : 'Setter lyset tilbake …'}</b></p>`;
  } else if (D.phase === 'red' || D.phase === 'blue') {
    const red = D.phase === 'red';
    body = `${stepsHtml(D.steps)}<div class="sk79-q" aria-live="polite"><span class="sk79-now"><span class="sk78-dot${red ? ' red' : ''}" aria-hidden="true"></span><span>${red ? 'Hele stripa skal lyse <b>rødt</b> i 3 s. <b>Lyste stripa rødt?</b>' : 'Én LED skal lyse <b>blått</b> i 3 s. <b>Lyste én LED blått?</b>'}</span></span>${yesNo(D.phase, D[D.phase])}</div>
      <div class="sk79-yn"><button type="button" class="sk76-link" data-sk79="diag-again"${busy}>${red ? 'Vis rødt igjen' : 'Vis blått igjen'}</button></div>`;
  } else {
    const h = hint79(D.red, D.blue);
    const ask = !D.err && D.mode === 'all' && D.steps.length && !D.steps.slice(0, 2).some((s) => s.ok === false);
    body = `${D.err ? `<p class="sk79-err" role="alert">${esc(D.err)}</p>` : ''}${stepsHtml(D.steps)}
      ${ask ? `<div class="sk79-q"><span>Lyste stripa <b>rødt</b>?</span>${yesNo('red', D.red)}</div>${D.red != null ? `<div class="sk79-q"><span>Lyste <b>én LED blått</b>?</span>${yesNo('blue', D.blue)}</div>` : ''}` : ''}
      ${h ? `<div class="sk79-hint ${h.cls}" role="status"><b>${esc(h.title)}</b><ul>${h.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${D.hint ? `<p class="sk76-mut sk78-p"><b>${h ? 'Fra serveren:' : 'Hint:'}</b> ${esc(D.hint)}</p>` : ''}
      <div class="sk79-yn"><button type="button" class="sk76-btn" data-sk79="diag-run">Kjør igjen</button>${D.steps.length || D.err ? '<button type="button" class="sk76-link" data-sk79="diag-copy">Kopier rapport</button>' : ''}</div>`;
  }
  return `<div class="sk79-diag" data-sk79-diag role="region" aria-label="Feilsøk LED">
    <div class="sk78-hd"><span class="sk76-kick">FEILSØK LED</span><button type="button" class="sk77-x sk78-x" data-sk79="diag-close" aria-label="Lukk feilsøkingen">×</button></div>
    ${body}
  </div>`;
}
const diagErr = (e) => (e?.status === 404 ? 'Serveren har ikke feilsøking ennå – oppdater Torskenes verden.' : e?.status === 429 ? 'Vent litt – for mange lys-kommandoer på kort tid.' : isNet(e) ? 'Feilsøkingen krever nett.' : e?.message || 'Feilsøkingen feilet.');
/** Legger nye steg inn i lista (samme key/navn erstattes). */
function mergeSteps(D, r) {
  for (const s of steps79(r)) { const i = D.steps.findIndex((x) => x.name === s.name); if (i >= 0) D.steps[i] = s; else D.steps.push(s); }
  if (r?.hint) D.hint = String(r.hint);
}
const focusDiag = () => requestAnimationFrame(() => document.querySelector('#sk76 [data-sk79-diag] [data-sk79-ans], #sk76 [data-sk79-diag] [data-sk79="diag-run"]')?.focus());
let runT = 0;
async function diagCall(D, body) {
  const r = await sk(`/cabinets/${enc(D.cabId)}/leds/diagnose`, { method: 'POST', json: body });
  if (P.diag !== D) throw Object.assign(new Error('avbrutt'), { gone: true });
  mergeSteps(D, r);
  return r;
}
async function runDiag() {
  const D = P.diag, c = cabById(D?.cabId); if (!D || !c) return;
  if (M78.ed?.dirty) { toast('Lagre lysoppsettet først.'); return; }
  if (!cfgOf78(c.id)?.host) { toast('Skriv inn adressen til WLED-kontrolleren og lagre først.'); return; }
  if (typeof navigator !== 'undefined' && !navigator.onLine) { toast('Feilsøkingen krever nett.'); return; }
  Object.assign(D, { phase: 'check', mode: 'step', t0: Date.now(), steps: [], hint: '', red: null, blue: null, err: '', busy: false });
  repaintSetup();
  try {
    await diagCall(D, { step: 'check' });
    if (D.steps.some((s) => s.ok === false)) { D.phase = 'done'; repaintSetup(); focusDiag(); return; }
    await diagCall(D, { step: 'red' });
    D.phase = 'red'; repaintSetup(); focusDiag();
  } catch (e) {
    if (e?.gone) return;
    if (e?.status === 400) return runAll(D); // serveren kjenner ikke «step»: alt i ett kall
    D.err = diagErr(e); D.phase = 'done'; repaintSetup(); focusDiag();
  }
}
async function runAll(D) {
  Object.assign(D, { phase: 'all', mode: 'all', t0: Date.now(), steps: [], hint: '', err: '' });
  repaintSetup();
  clearInterval(runT); runT = setInterval(() => { if (P.diag === D && D.phase === 'all') repaintSetup(); else clearInterval(runT); }, 500);
  try { const r = await diagCall(D, {}); if (r?.ok === false && !D.steps.length) D.err = r?.error || 'Feilsøkingen feilet.'; } catch (e) { if (e?.gone) return; D.err = diagErr(e); }
  clearInterval(runT); D.phase = 'done'; repaintSetup(); focusDiag();
}
/** Svar på «Lyste …?». I trinnvis modus går veiviseren videre til neste steg. */
async function answer(k, yes) {
  const D = P.diag; if (!D) return;
  D[k] = yes;
  if (D.mode !== 'step' || D.phase !== k || D.busy) { repaintSetup(); focusDiag(); return; }
  D.busy = true; repaintSetup();
  try {
    if (k === 'red') { await diagCall(D, { step: 'blue' }); D.phase = 'blue'; } else {
      D.phase = 'restore'; repaintSetup();
      await diagCall(D, { step: 'restore', red: D.red, blue: D.blue }); D.phase = 'done';
    }
  } catch (e) { if (e?.gone) return; D.err = diagErr(e); D.phase = 'done'; }
  D.busy = false; repaintSetup(); focusDiag();
}
async function again() {
  const D = P.diag; if (!D || D.busy || (D.phase !== 'red' && D.phase !== 'blue')) return;
  D.busy = true; repaintSetup();
  try { await diagCall(D, { step: D.phase }); } catch (e) { if (e?.gone) return; toast(diagErr(e)); }
  D.busy = false; repaintSetup();
}
async function closeDiag() {
  const D = P.diag; P.diag = null; clearInterval(runT); repaintSetup();
  if (D && D.mode === 'step' && (D.phase === 'red' || D.phase === 'blue')) { try { await sk(`/cabinets/${enc(D.cabId)}/leds/diagnose`, { method: 'POST', json: { step: 'restore' } }); } catch { /* lyset gjenopprettes av seg selv */ } }
}

/* ================= Hendelser ================= */

/** Klikk i Skjold Lab (fra bind i skjold76.js). true = håndtert. */
export function click79(t) {
  const add = t.closest('[data-sk79-add]'); if (add) { toggle(add.dataset.sk79Add); return true; }
  if (t.closest('[data-sk79-scrim]')) { closeSheet(); return true; }
  const q = t.closest('[data-sk79-q]');
  if (q) { const [id, d] = q.dataset.sk79Q.split(':'), x = P.items.find((y) => y.id === id); if (x) { haptic(6); changed(setQty79(P.items, id, x.qty + +d)); } return true; }
  const rm = t.closest('[data-sk79-rm]'); if (rm) { const prev = P.items.slice(), x = prev.find((y) => y.id === rm.dataset.sk79Rm); changed(P.items.filter((y) => y.id !== rm.dataset.sk79Rm)); toast(`«${S.parts[x?.id]?.name ?? x?.name ?? 'Delen'}» er fjernet`, { action: 'Angre', ms: 6000, onAction: () => changed(prev) }); return true; }
  const ans = t.closest('[data-sk79-ans]');
  if (ans && P.diag) { const [k, v] = ans.dataset.sk79Ans.split(':'); answer(k, v === '1'); return true; }
  const b = t.closest('[data-sk79]'); if (!b) return false;
  switch (b.dataset.sk79) {
    case 'open': openSheet(); return true;
    case 'close': closeSheet(); return true;
    case 'close-nav': closeSheet(false); return false; // lenken navigerer videre
    case 'show': showAll(); return true;
    case 'off': off(); return true;
    case 'take': takeOut(); return true;
    case 'clear': clearAll(); return true;
    case 'diag': { const id = cabById(b.dataset.cab)?.id; P.diag = P.diag?.cabId === id ? null : { cabId: id, phase: 'intro', steps: [], red: null, blue: null }; repaintSetup(); if (P.diag) requestAnimationFrame(() => document.querySelector('#sk76 [data-sk79-diag]')?.scrollIntoView?.({ block: 'nearest' })); return true; }
    case 'diag-run': runDiag(); return true;
    case 'diag-close': closeDiag(); return true;
    case 'diag-again': again(); return true;
    case 'diag-copy': {
      const D = P.diag, c = cabById(D?.cabId), h = hint79(D?.red, D?.blue);
      const txt = report79(c, D?.steps ?? [], D?.red, D?.blue, h?.title ?? D?.hint ?? D?.err);
      navigator.clipboard?.writeText(txt).then(() => toast('Rapporten er kopiert'), () => toast('Fikk ikke kopiert'));
      return true;
    }
    default: return false;
  }
}
/** Taster: Esc lukker arket, Tab holdes inne i arket. true = håndtert. */
export function key79(e) {
  if (!P.open) return false;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return true; }
  if (e.key === 'Tab') {
    const f = [...document.querySelectorAll('#sk79-port [data-sk79-sheet] a[href],#sk79-port [data-sk79-sheet] button:not([disabled])')];
    if (!f.length) return false;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); return true; }
    if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); return true; }
  }
  return false;
}
/** Ruten endres: lukk arket (unntatt når man åpner en del fra det), glem feilsøkingen utenfor skap-oppsettet. */
export function route79(r) {
  if (r.v !== 'setup' && P.diag) closeDiag();
  if (P.open && r.v !== 'part') closeSheet(false);
  if (P.lit && !litNow()) P.lit = null;
  refreshSnaps(); paintBar();
}
