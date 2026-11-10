// Prompt 82 (CHKWEB): Produkter i Skjold Lab på web – sjekk ut deler til noe man bygger, og sjekk dem inn igjen.
// - Delsiden: «Sjekk ut» åpner et ark (antall ±, maks lager · velg produkt eller «Nytt produkt …» · notat) → POST /checkout.
//   Toast med «Angre» (POST /checkout/undo {undoToken}, 10 min). Seksjonen «Brukt i» (usedIn fra GET /parts/:id) lenker til produktet.
// - Produkter: #/skjold/produkter (liste: navn, status, antall deler, kostnad, + Nytt produkt) og #/skjold/produkt/<id>
//   (stykkliste med bilde, navn, antall og plassering den kom fra · «Sjekk inn» per linje · Marker som ferdig · Gi nytt navn · Slett · CSV).
// - Plukklista: «Til produkt: [ingen / produkt / Nytt produkt …]» ved «Ta ut av lager» (pickTarget82 → POST /picklist/take {projectId|projectName}).
import { esc, haptic } from './util.js';
import { toast } from './toast.js';
import { S, sk, write, thumbHtml, paintMain, loadPart, go } from './skjold76.js';
import { qtyFmt82, money82, clampQty82, target82, checkoutBody82, normProjects82, activeProjects82, summary82, lines82, hasActive82, usedIn82, csv82, csvName82, shortText82, MAX_NAME82 } from './skjold82-logic.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-sk82-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/skjold82.css'; l.dataset.sk82Css = ''; document.head.appendChild(l);
}

/** list: produktene · cur: produktet som vises · sheet: utsjekkingsarket · pick: valget i plukklista. */
export const Q = { list: null, loading: false, cur: null, err: null, sheet: null, pick: { choice: '', name: '' }, newOpen: false };
const enc = encodeURIComponent;
const isNet = (e) => e instanceof TypeError || !navigator.onLine;

/* ================= Data ================= */

let listP = null;
export function loadProjects82(force = false) {
  if (Q.list && !force) return Promise.resolve(Q.list);
  if (listP && !force) return listP;
  Q.loading = true;
  listP = sk('/projects').then((r) => { Q.list = normProjects82(r); Q.err = null; return Q.list; })
    .catch((e) => { Q.err = isNet(e) ? 'Uten nett – produktene er ikke lagret på enheten.' : e.message; Q.list ??= null; return Q.list ?? []; })
    .finally(() => { Q.loading = false; listP = null; });
  return listP;
}
async function loadProject(id) {
  try { Q.cur = await sk(`/projects/${enc(id)}`); Q.err = null; } catch (e) { Q.cur = null; Q.err = e.status === 404 ? 'Fant ikke produktet.' : isNet(e) ? 'Uten nett – produktet er ikke lagret på enheten.' : e.message; }
  return Q.cur;
}

/* ================= Ruting ================= */

/** #/skjold/produkter · #/skjold/produkt/<id>. */
export function route82(seg) {
  if (seg[1] === 'produkter') return { v: 'projects' };
  if (seg[1] === 'produkt' && seg[2]) return { v: 'project', id: seg[2] };
  return null;
}
export const isView82 = (v) => v === 'projects' || v === 'project';
export async function start82(r) {
  if (r.v === 'projects') { await loadProjects82(true); if (S.route === r) paintMain(); return; }
  if (r.v === 'project') { if (String(Q.cur?.id) !== String(r.id)) Q.cur = null; paintMain(); await loadProject(r.id); if (S.route === r) paintMain(); }
}

/* ================= Knapper på andre sider ================= */

export const headBtn82 = () => '<a class="sk76-btn" href="#/skjold/produkter" data-sk82-head>Produkter</a>';
/** «Sjekk ut» på delsiden. */
export const partBtn82 = (p) => (p && !(p.deletedAt || p.deleted_at) ? `<button type="button" class="sk76-btn sk82-out" data-sk82="out"${+p.qty > 0 ? '' : ' disabled title="Ingen igjen på lager"'}>Sjekk ut</button>` : '');
/** «Brukt i» på delsiden. */
export function usedInHtml82(p) {
  const L = usedIn82(p);
  if (!L.length) return '';
  return `<section class="sk82-used" aria-label="Brukt i"><span class="sk76-kick">BRUKT I</span><ul role="list">${L.map((x) => `<li><a href="#/skjold/produkt/${enc(x.projectId)}"><b>${esc(x.name)}</b>${x.status === 'ferdig' ? '<small class="sk82-st done">Ferdig</small>' : ''}<span>${esc(qtyFmt82(x.qty, p.unit))}</span></a></li>`).join('')}</ul></section>`;
}

/* ================= Produkter (liste og side) ================= */

export function html82() {
  return S.route.v === 'project' ? projectHtml() : listHtml();
}
function statusChip(st) { return `<small class="sk82-st${st === 'ferdig' ? ' done' : ''}">${st === 'ferdig' ? 'Ferdig' : 'Aktiv'}</small>`; }
function listHtml() {
  const L = Q.list;
  const form = `<form class="sk82-new" data-sk82-newform${Q.newOpen ? '' : ' hidden'}><label class="sk82-lbl">Navn på produktet<input name="name" maxlength="${MAX_NAME82}" required placeholder="F.eks. Værstasjon" autocomplete="off"></label><label class="sk82-lbl">Notat (valgfritt)<input name="notes" maxlength="500" autocomplete="off"></label><div class="sk76-row"><button type="submit" class="sk76-btn pri">Opprett</button><button type="button" class="sk76-link" data-sk82="new-cancel">Avbryt</button></div></form>`;
  const head = `<div class="sk82-lh"><a class="sk76-back" href="#/skjold">‹ Alle deler</a><button type="button" class="sk76-btn pri" data-sk82="new"${Q.newOpen ? ' hidden' : ''}>+ Nytt produkt</button></div>
    <div><span class="sk76-kick">PRODUKTER</span><h2 class="sk76-pname">Det du bygger</h2><p class="sk76-mut sk82-lead">Deler du sjekker ut trekkes fra lageret og huskes her. Sjekk dem inn igjen hvis de ikke ble brukt.</p></div>${form}`;
  if (!L) return `<section class="sk76-card sk82-card">${head}<p class="sk76-mut">${Q.err ? esc(Q.err) : 'Henter produkter …'}</p></section>`;
  if (!L.length) return `<section class="sk76-card sk82-card">${head}<div class="sk76-empty"><b>Ingen produkter ennå</b><span>Trykk «Sjekk ut» på en del, eller lag et produkt her.</span></div></section>`;
  const row = (p) => `<li><a class="sk82-pr" href="#/skjold/produkt/${enc(p.id)}"><span class="sk82-pn"><b>${esc(p.name)}</b>${statusChip(p.status)}</span><span class="sk76-mut">${esc(summary82(p))}</span></a></li>`;
  return `<section class="sk76-card sk82-card">${head}<ul class="sk82-plist" role="list">${L.map(row).join('')}</ul></section>`;
}
function lineHtml(x, done = false) {
  const unit = x.unit || 'stk';
  return `<li class="sk82-line${done ? ' done' : ''}${x.deleted ? ' gone' : ''}" data-sk82-line="${esc(x.usageId)}">
    <a class="sk82-li" href="#/skjold/del/${enc(x.partId)}">${thumbHtml(x, 'sm')}<span class="sk82-lt"><b>${esc(x.name)}</b>
      <span class="sk76-mut">${esc(done ? `${qtyFmt82(x.qty, unit)} · sjekket inn` : `${qtyFmt82(x.net, unit)}${x.returnedQty > 0 ? ` (av ${qtyFmt82(x.qty, unit)})` : ''}`)}${x.price != null && !done ? ` · ${esc(money82(x.net * x.price))}` : ''}</span>
      ${x.loc ? `<span class="sk82-loc">${esc(x.loc)}</span>` : ''}${x.note ? `<span class="sk82-note">${esc(x.note)}</span>` : ''}</span></a>
    ${done || x.deleted ? '' : `<form class="sk82-ret" data-sk82-ret="${esc(x.usageId)}"><label class="sk82-vh" for="sk82-r${esc(x.usageId)}">Antall å sjekke inn</label><input id="sk82-r${esc(x.usageId)}" name="qty" type="number" inputmode="decimal" min="0" step="any" max="${esc(x.net)}" value="${esc(x.net)}"><button type="submit" class="sk76-btn">Sjekk inn</button></form>`}
  </li>`;
}
function projectHtml() {
  const p = Q.cur;
  if (!p) return `<section class="sk76-card sk82-card"><a class="sk76-back" href="#/skjold/produkter">‹ Produkter</a><p class="sk76-mut">${Q.err ? esc(Q.err) : 'Henter produktet …'}</p></section>`;
  const { live, done } = lines82(p), active = hasActive82(p), fin = p.status === 'ferdig';
  return `<section class="sk76-card sk82-card" aria-label="${esc(p.name)}">
    <a class="sk76-back" href="#/skjold/produkter">‹ Produkter</a>
    <div><span class="sk76-kick">PRODUKT</span><h2 class="sk76-pname sk82-h">${esc(p.name)} ${statusChip(p.status)}</h2>
      <p class="sk76-mut">${esc(summary82(p))}</p>${p.notes ? `<p class="sk76-desc">${esc(p.notes)}</p>` : ''}</div>
    <div class="sk76-pacts">
      <button type="button" class="sk76-btn" data-sk82="status">${fin ? 'Marker som aktiv' : 'Marker som ferdig'}</button>
      <button type="button" class="sk76-btn" data-sk82="rename">Gi nytt navn</button>
      ${(p.items ?? []).length ? '<button type="button" class="sk76-btn" data-sk82="csv">Eksporter CSV</button>' : ''}
      <button type="button" class="sk76-btn danger" data-sk82="delete"${active ? ' disabled title="Sjekk inn delene først"' : ''}>Slett</button>
    </div>
    ${active ? '<p class="sk76-mut sk82-small">Slett er mulig når alle delene er sjekket inn.</p>' : ''}
    <span class="sk76-kick">STYKKLISTE</span>
    ${live.length ? `<ul class="sk82-lines" role="list">${live.map((x) => lineHtml(x)).join('')}</ul>` : '<p class="sk76-mut">Ingen deler er sjekket ut til produktet nå. Gå til en del og trykk «Sjekk ut».</p>'}
    ${done.length ? `<details class="sk82-done"><summary>Sjekket inn (${done.length})</summary><ul class="sk82-lines" role="list">${done.map((x) => lineHtml(x, true)).join('')}</ul></details>` : ''}
  </section>`;
}

/* ================= Arket «Sjekk ut» ================= */

let portBound = false, lastFocus = null;
function port() {
  let el = document.getElementById('sk82-port');
  if (!el) {
    el = document.createElement('div'); el.id = 'sk82-port'; el.className = 'sk76 sk79-port';
    el.innerHTML = '<div class="sk79-scrim" data-sk82-scrim hidden></div><div class="sk79-sheet sk82-sheet" data-sk82-sheet role="dialog" aria-modal="true" aria-labelledby="sk82-h" hidden></div>';
    document.body.appendChild(el);
  }
  if (!portBound) {
    portBound = true;
    document.addEventListener('click', (e) => { if (e.target.closest?.('#sk82-port')) click82(e.target); });
    document.addEventListener('keydown', (e) => { if (Q.sheet) key82(e); });
    document.addEventListener('input', (e) => { if (e.target.closest?.('#sk82-port')) input82(e.target); });
    document.addEventListener('change', (e) => { if (e.target.closest?.('#sk82-port')) input82(e.target, true); });
    document.addEventListener('submit', (e) => { if (e.target.closest?.('#sk82-port')) submit82(e); });
    window.addEventListener('hashchange', () => closeSheet(false));
  }
  return el;
}
function sheetHtml() {
  const s = Q.sheet, p = S.parts[s.partId] ?? {}, unit = p.unit || 'stk', max = +p.qty || 0;
  const act = activeProjects82(Q.list ?? []);
  const opts = `<option value=""${s.choice === '' ? ' selected' : ''} disabled>Velg produkt …</option>${act.map((x) => `<option value="${esc(x.id)}"${s.choice === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="new"${s.choice === 'new' ? ' selected' : ''}>Nytt produkt …</option>`;
  return `<div class="sk79-sh"><span class="sk79-grab" aria-hidden="true"></span>
      <div class="sk79-shh"><div><span class="sk76-kick">SJEKK UT</span><h2 id="sk82-h" class="sk79-h2">${esc(p.name ?? 'Delen')}</h2><span class="sk76-mut">${esc(qtyFmt82(max, unit))} på lager</span></div>
      <button type="button" class="sk77-x sk79-x" data-sk82="close" aria-label="Lukk">×</button></div></div>
    <form class="sk82-form" data-sk82-form>
      <div class="sk82-lbl"><span id="sk82-ql">Antall</span><span class="sk79-qty sk82-qty" role="group" aria-labelledby="sk82-ql">
        <button type="button" data-sk82-q="-1" aria-label="Én mindre"${s.qty <= Math.min(1, max) ? ' disabled' : ''}>−</button>
        <input name="qty" type="number" inputmode="decimal" min="${esc(Math.min(1, max))}" max="${esc(max)}" step="any" value="${esc(s.qty)}" aria-label="Antall">
        <button type="button" data-sk82-q="1" aria-label="Én til"${s.qty >= max ? ' disabled' : ''}>+</button></span>
        <span class="sk76-mut sk82-small">${esc(unit)} · maks ${esc(qtyFmt82(max, unit))}</span></div>
      <label class="sk82-lbl">Til produkt<select name="project" required>${opts}</select></label>
      <label class="sk82-lbl"${s.choice === 'new' ? '' : ' hidden'} data-sk82-newname>Navn på nytt produkt<input name="newName" maxlength="${MAX_NAME82}" value="${esc(s.newName)}" placeholder="F.eks. Værstasjon" autocomplete="off"></label>
      <label class="sk82-lbl">Notat (valgfritt)<input name="note" maxlength="500" value="${esc(s.note)}" autocomplete="off"></label>
      ${s.err ? `<p class="sk79-err" role="alert">${esc(s.err)}</p>` : ''}
      <button type="submit" class="sk76-btn pri"${s.busy || max <= 0 ? ' disabled' : ''}>${s.busy ? 'Sjekker ut …' : 'Sjekk ut'}</button>
    </form>`;
}
function paintSheet(focusSel = null) {
  const pt = port(), el = pt.querySelector('[data-sk82-sheet]'), sc = pt.querySelector('[data-sk82-scrim]');
  el.hidden = !Q.sheet; sc.hidden = !Q.sheet;
  document.documentElement.classList.toggle('sk82-lock', !!Q.sheet);
  if (!Q.sheet) { el.innerHTML = ''; return; }
  const a = document.activeElement, key = a?.closest?.('[data-sk82-sheet]') ? (a.name || a.dataset.sk82Q || a.dataset.sk82) : null;
  el.innerHTML = sheetHtml();
  const f = focusSel ? el.querySelector(focusSel) : key ? el.querySelector(`[name="${key}"],[data-sk82-q="${key}"],[data-sk82="${key}"]`) : null;
  (f && !f.disabled ? f : el.querySelector('[data-sk82="close"]'))?.focus();
}
async function openSheet() {
  const p = S.parts[S.route.id]; if (!p) return;
  lastFocus = document.activeElement;
  haptic(8);
  const act = activeProjects82(Q.list ?? []);
  Q.sheet = { partId: String(p.id), qty: clampQty82(1, p.qty), choice: act.length ? act[0].id : 'new', newName: '', note: '', err: null, busy: false };
  paintSheet(Q.sheet.choice === 'new' ? '[name="newName"]' : '[name="qty"]');
  await loadProjects82(true);
  if (!Q.sheet) return;
  const L = activeProjects82(Q.list ?? []);
  if (Q.sheet.choice === 'new' && L.length && !Q.sheet.newName) Q.sheet.choice = L[0].id;
  if (Q.sheet.choice !== 'new' && !L.some((x) => x.id === Q.sheet.choice)) Q.sheet.choice = L[0]?.id ?? 'new';
  paintSheet();
}
function closeSheet(restore = true) {
  if (!Q.sheet) return;
  Q.sheet = null; paintSheet();
  if (restore && lastFocus?.isConnected) lastFocus.focus?.();
}
async function doCheckout() {
  const s = Q.sheet; if (!s || s.busy) return;
  const p = S.parts[s.partId] ?? {};
  const r0 = checkoutBody82({ partId: s.partId, qty: s.qty, max: p.qty, choice: s.choice, newName: s.newName, note: s.note });
  if (r0.error) { s.err = r0.error; paintSheet(); return; }
  if (!navigator.onLine) { s.err = 'Endringer krever nett. Prøv igjen når du er tilkoblet.'; paintSheet(); return; }
  s.busy = true; s.err = null; paintSheet();
  let r;
  try { r = await sk('/checkout', { method: 'POST', json: r0.body }); } catch (e) {
    if (!Q.sheet) return;
    s.busy = false; s.err = isNet(e) ? 'Endringer krever nett. Prøv igjen når du er tilkoblet.' : e.message || 'Fikk ikke sjekket ut'; paintSheet();
    return;
  }
  haptic(14);
  closeSheet();
  const name = r?.project?.name ?? 'produktet', q = r0.body.items[0].qty, unit = p.unit || 'stk', token = r?.undoToken;
  Q.list = null; Q.cur = null;
  await loadPart(s.partId); paintMain();
  toast(`Sjekket ut ${qtyFmt82(q, unit)} til «${name}»`, token ? { action: 'Angre', ms: 10_000, onAction: () => undoCheckout(token, s.partId) } : {});
}
async function undoCheckout(token, partId = null) {
  const ok = await write(() => sk('/checkout/undo', { method: 'POST', json: { undoToken: token } }), 'Utsjekkingen er angret');
  if (!ok) return;
  Q.list = null; Q.cur = null;
  if (partId) { await loadPart(partId); }
  if (S.route.v === 'project') await loadProject(S.route.id);
  paintMain();
}

/* ================= Handlinger på produktsiden ================= */

async function setStatus() {
  const p = Q.cur; if (!p) return;
  const next = p.status === 'ferdig' ? 'aktiv' : 'ferdig';
  const r = await write(() => sk(`/projects/${enc(p.id)}`, { method: 'PATCH', json: { status: next } }), next === 'ferdig' ? 'Markert som ferdig' : 'Markert som aktiv');
  if (!r) return;
  haptic(10); Q.cur = { ...p, ...r }; Q.list = null; paintMain();
}
async function rename() {
  const p = Q.cur; if (!p) return;
  const n = prompt('Nytt navn på produktet', p.name);
  if (n == null) return;
  const t = String(n).replace(/\s+/g, ' ').trim();
  if (!t || t === p.name) return;
  if (t.length > MAX_NAME82) { toast(`Navnet kan være maks ${MAX_NAME82} tegn`); return; }
  const r = await write(() => sk(`/projects/${enc(p.id)}`, { method: 'PATCH', json: { name: t } }), 'Navnet er endret');
  if (r) { Q.cur = { ...p, ...r }; Q.list = null; paintMain(); }
}
async function del() {
  const p = Q.cur; if (!p) return;
  if (hasActive82(p)) { toast('Sjekk inn delene først'); return; }
  if (!confirm(`Slette produktet «${p.name}»?`)) return;
  const r = await write(() => sk(`/projects/${enc(p.id)}`, { method: 'DELETE' }), `«${p.name}» er slettet`);
  if (!r) return;
  haptic(12); Q.cur = null; Q.list = null; go('#/skjold/produkter');
}
function exportCsv() {
  const p = Q.cur; if (!p) return;
  const url = URL.createObjectURL(new Blob([csv82(p)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = csvName82(p.name); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function doReturn(form) {
  const p = Q.cur, id = form.dataset.sk82Ret, line = (p?.items ?? []).find((x) => String(x.usageId) === String(id));
  if (!line) return;
  const net = line.net != null ? +line.net : +line.qty - +line.returnedQty;
  const raw = String(new FormData(form).get('qty') ?? '').replace(',', '.');
  const n = Math.min(net, Number(raw));
  if (!(n > 0)) { toast('Skriv hvor mange som skal sjekkes inn'); return; }
  const r = await write(() => sk(`/usage/${enc(id)}/return`, { method: 'POST', json: { qty: n } }));
  if (!r) return;
  haptic(12);
  const pid = p.id, partId = line.partId;
  await loadProject(pid); Q.list = null; delete S.parts[partId]; paintMain();
  toast(`Sjekket inn ${qtyFmt82(n, line.unit)} «${line.name}»`, { action: 'Angre', ms: 10_000, onAction: async () => {
    const u = await write(() => sk('/checkout', { method: 'POST', json: { projectId: Number(pid), items: [{ partId, qty: n }], ...(line.note ? { note: line.note } : {}) } }), 'Innsjekkingen er angret');
    if (u) { if (S.route.v === 'project') await loadProject(S.route.id); Q.list = null; paintMain(); }
  } });
}
async function createProject(form) {
  const fd = new FormData(form), name = String(fd.get('name') ?? '').replace(/\s+/g, ' ').trim(), notes = String(fd.get('notes') ?? '').trim();
  const t = target82('new', name);
  if (t.error) { toast(t.error); return; }
  const r = await write(() => sk('/projects', { method: 'POST', json: { name: t.projectName, ...(notes ? { notes } : {}) } }), `«${t.projectName}» er opprettet`);
  if (!r) return;
  haptic(10); Q.newOpen = false; Q.list = null;
  go(`#/skjold/produkt/${enc(r.id)}`);
}

/* ================= Plukklista: «Til produkt» ================= */

/** Velgeren over «Ta ut av lager» i plukklista. */
export function pickTargetHtml82() {
  if (!Q.list && !Q.loading) loadProjects82().then(() => { const el = document.querySelector('[data-sk82-pickto]'); if (el) el.outerHTML = pickTargetHtml82(); });
  const act = activeProjects82(Q.list ?? []), c = Q.pick.choice;
  if (c && c !== 'new' && Q.list && !act.some((x) => x.id === c)) Q.pick.choice = '';
  return `<div class="sk82-pickto" data-sk82-pickto><label class="sk82-lbl">Til produkt<select data-sk82-pick="choice"><option value="">Ingen</option>${act.map((x) => `<option value="${esc(x.id)}"${Q.pick.choice === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="new"${Q.pick.choice === 'new' ? ' selected' : ''}>Nytt produkt …</option></select></label>
    ${Q.pick.choice === 'new' ? `<label class="sk82-lbl">Navn på nytt produkt<input data-sk82-pick="name" maxlength="${MAX_NAME82}" value="${esc(Q.pick.name)}" placeholder="F.eks. Værstasjon" autocomplete="off"></label>` : ''}</div>`;
}
/** → {} (ingen) | {projectId} | {projectName} | {error}. */
export const pickTarget82 = () => target82(Q.pick.choice, Q.pick.name);
/** Etter uttak til et produkt: lista over produkter må hentes på nytt; et nytt produkt velges for neste gang. */
export function afterPickTake82(r) {
  Q.list = null; Q.cur = null;
  if (Q.pick.choice === 'new' && r?.project?.id != null) Q.pick = { choice: String(r.project.id), name: '' };
}
if (typeof document !== 'undefined') document.addEventListener('change', (e) => { const t = e.target; if (t?.dataset?.sk82Pick === 'choice') { Q.pick.choice = t.value; const el = t.closest('[data-sk82-pickto]'); if (el) { el.outerHTML = pickTargetHtml82(); if (t.value === 'new') document.querySelector('[data-sk82-pick="name"]')?.focus(); else document.querySelector('[data-sk82-pick="choice"]')?.focus(); } } });
if (typeof document !== 'undefined') document.addEventListener('input', (e) => { const t = e.target; if (t?.dataset?.sk82Pick === 'name') Q.pick.name = t.value; });

/* ================= Hendelser ================= */

/** Klikk i Skjold Lab og i arket. true = håndtert. */
export function click82(t) {
  if (t.closest('[data-sk82-scrim]')) { closeSheet(); return true; }
  const q = t.closest('[data-sk82-q]');
  if (q && Q.sheet) { const p = S.parts[Q.sheet.partId]; haptic(6); Q.sheet.qty = clampQty82(Q.sheet.qty + +q.dataset.sk82Q, p?.qty); paintSheet(); return true; }
  const b = t.closest('[data-sk82]'); if (!b) return false;
  switch (b.dataset.sk82) {
    case 'out': openSheet(); return true;
    case 'close': closeSheet(); return true;
    case 'status': setStatus(); return true;
    case 'rename': rename(); return true;
    case 'delete': del(); return true;
    case 'csv': exportCsv(); return true;
    case 'new': Q.newOpen = true; paintMain(); document.querySelector('[data-sk82-newform] input')?.focus(); return true;
    case 'new-cancel': Q.newOpen = false; paintMain(); return true;
    default: return false;
  }
}
/** Feltene i arket (input/change). */
export function input82(t, change = false) {
  const s = Q.sheet; if (!s || !t.closest?.('[data-sk82-form]')) return false;
  if (t.name === 'qty') { const n = Number(String(t.value).replace(',', '.')); if (Number.isFinite(n) && t.value !== '') s.qty = change ? clampQty82(n, S.parts[s.partId]?.qty) : n; if (change) paintSheet('[name="qty"]'); return true; }
  if (t.name === 'project') { s.choice = t.value; s.err = null; paintSheet(t.value === 'new' ? '[name="newName"]' : '[name="project"]'); return true; }
  if (t.name === 'newName') { s.newName = t.value; return true; }
  if (t.name === 'note') { s.note = t.value; return true; }
  return false;
}
/** Skjema: utsjekking, sjekk inn per linje, nytt produkt. true = håndtert. */
export function submit82(e) {
  const f = e.target;
  if (f.matches?.('[data-sk82-form]')) { e.preventDefault(); if (Q.sheet) Q.sheet.qty = clampQty82(Q.sheet.qty, S.parts[Q.sheet.partId]?.qty); doCheckout(); return true; }
  if (f.matches?.('[data-sk82-ret]')) { e.preventDefault(); doReturn(f); return true; }
  if (f.matches?.('[data-sk82-newform]')) { e.preventDefault(); createProject(f); return true; }
  return false;
}
/** Esc lukker arket, Tab holdes inne. */
export function key82(e) {
  if (!Q.sheet) return false;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return true; }
  if (e.key === 'Tab') {
    const f = [...document.querySelectorAll('#sk82-port [data-sk82-sheet] :is(a[href],button,input,select):not([disabled]):not([hidden] *)')];
    if (!f.length) return false;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); return true; }
    if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); return true; }
  }
  return false;
}
