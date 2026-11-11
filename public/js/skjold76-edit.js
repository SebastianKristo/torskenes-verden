// Prompt 76 (SKJWEB): Skjold Lab – ny/endre del og skap-oppsett.
// - Ny/endre del: navn, kategori (velg eller ny), specs-felt, antall/enhet/min, tags, bilder (fil, kamera på mobil, dra-og-slipp),
//   URL, pris og leverandør. Plassering velges ved å trykke på skuffen i tegningen; «Foreslå ledig» bruker /api/skjold/free.
// - Skap-oppsett: liste over skap, legg til (også «Tilleggsskap (3D-print)» med kolonner foreslått fra 27 cm), navn/rader/kolonner/type,
//   last opp eller ta bilde av skapet og dra de 4 hjørnehåndtakene til hjørnene på skuffene, med rutenettet forhåndsvist i perspektiv.
//   CSV-eksport og -import (forhåndsvisning med ?dry=1).
import { esc, isMobile, haptic } from './util.js';
import { toast } from './toast.js';
import { S, sk, write, upload, go, paintMain, paintSide, locOf, locText, photoUrls, cabById, loadCabs, loadMap, refreshAll, loadPart } from './skjold76.js';
import { overlayGrid76, layoutPhoto76, cornersOk76, long76 } from './skjold76-draw.js';
import { suggestBtn77, suggestCard77, findBtn77, finderHtml77, webPending77, onNewPhotos77, aiClick77, mountEdit77, saveWeb77 } from './skjold77-ai.js'; // prompt 77
import { ledSetupHtml78 } from './skjold78-leds.js'; // prompt 78: lys over skuffene
import { longAt81, presetBoxHtml81, presetConfirm81, PRESET81, PRESET_SIZES81 } from './skjold81-span.js'; // prompt 81: Skjold Lab-hylla (3D-print)

const UNITS = ['stk', 'm', 'cm', 'g', 'kg', 'ml', 'pk', 'par', 'rull', 'sett'];
const SPEC_KEYS = ['verdi', 'toleranse', 'pakke', 'spenning', 'strøm', 'effekt', 'lengde', 'diameter', 'gjenge', 'materiale', 'farge', 'type'];
const MAX_MB = 10;
const DEF_CORNERS = () => ({ tl: { x: 0.12, y: 0.08 }, tr: { x: 0.88, y: 0.08 }, br: { x: 0.88, y: 0.92 }, bl: { x: 0.12, y: 0.92 } });
/** Forslag til kolonner for et 3D-printet skap: skuffer à ~60 mm + 2 mm vegg, minus sidevegger (2 × 6 mm). */
export const colsFromWidth76 = (mm) => Math.max(1, Math.floor((Math.max(0, +mm || 0) - 12) / 62));

/* ================= Ny / endre del ================= */

export function startEdit(r) {
  const key = r.id ?? `ny:${r.cab ?? ''}:${r.at ?? ''}`;
  if (S.form?.key === key) { S.pick = { kind: 'edit' }; return; }
  const p = r.id ? S.parts[r.id] : null;
  let loc = p ? locOf(p) : null;
  if (!p && r.cab && /^\d+-\d+$/.test(r.at ?? '')) { const [row, col] = r.at.split('-').map(Number); const c = cabById(r.cab); if (c) loc = { cabinetId: c.id, row, col, compartment: null }; }
  S.form = {
    key, id: p?.id ?? null, name: p?.name ?? '', category: p?.category ?? '', description: p?.description ?? '',
    specs: p?.specs && typeof p.specs === 'object' ? Object.entries(p.specs).map(([k, v]) => [k, String(v ?? '')]) : [['verdi', '']],
    qty: p?.qty ?? 1, unit: p?.unit || 'stk', min_qty: p?.min_qty ?? p?.minQty ?? '', tags: Array.isArray(p?.tags) ? p.tags.join(', ') : '',
    url: p?.url ?? '', price: p?.price ?? '', supplier: p?.supplier ?? '',
    loc: loc ? { cabinetId: loc.cabinetId, row: loc.row, col: loc.col, compartment: loc.compartment ?? null } : null, loc0: loc ? JSON.stringify([loc.cabinetId, loc.row, loc.col, loc.compartment ?? null]) : 'null',
    photos: p ? photoUrls(p) : [], rm: new Set(), files: [], busy: false, err: '',
  };
  if (S.form.loc && cabById(S.form.loc.cabinetId)) S.cabId = cabById(S.form.loc.cabinetId).id;
  S.pick = { kind: 'edit' };
}
const form = () => document.querySelector('#sk76 [data-sk76-pform]');
function readForm() {
  const f = form(), F = S.form;
  if (!f || !F) return;
  const v = (n) => f.elements[n]?.value ?? '';
  Object.assign(F, { name: v('name'), category: v('category'), description: v('description'), qty: v('qty'), unit: v('unit'), min_qty: v('min_qty'), tags: v('tags'), url: v('url'), price: v('price'), supplier: v('supplier') });
  F.specs = [...f.querySelectorAll('[data-sk76-spec]')].map((row) => [row.querySelector('[data-k]').value, row.querySelector('[data-v]').value]);
  const comp = f.elements.compartment?.value; if (F.loc && comp !== undefined) F.loc.compartment = comp ? +comp : null;
}
function compsAt(loc) {
  if (!loc) return 1;
  return Math.max(1, +(S.maps[loc.cabinetId]?.drawers?.find((d) => d.row === loc.row && d.col === loc.col)?.compartments) || 1);
}
function photosHtml(F) {
  const old = F.photos.map((ph, i) => `<span class="sk76-pph${F.rm.has(i) ? ' rm' : ''}"><img src="${esc(ph.thumb)}" alt="" loading="lazy"><button type="button" data-sk76e="rm-photo" data-i="${i}" aria-label="${F.rm.has(i) ? 'Behold bildet' : 'Fjern bildet'}">${F.rm.has(i) ? '↺' : '×'}</button></span>`).join('');
  const neu = F.files.map((f, i) => `<span class="sk76-pph new"><img src="${esc(f.url)}" alt=""><button type="button" data-sk76e="rm-new" data-i="${i}" aria-label="Fjern bildet">×</button></span>`).join('');
  return old + neu + webPending77(F);
}
export function editHtml() {
  const F = S.form;
  if (!F) return '<div class="sk76-card sk76-empty">Henter …</div>';
  const comps = compsAt(F.loc);
  const cats = S.cats.map((c) => `<option value="${esc(c.name)}">`).join('');
  return `<form class="sk76-card sk76-pform" data-sk76-pform novalidate>
    <a class="sk76-back" href="${F.id ? `#/skjold/del/${encodeURIComponent(F.id)}` : '#/skjold'}">‹ ${F.id ? 'Tilbake til delen' : 'Alle deler'}</a>
    <h2 class="sk76-pname">${F.id ? 'Endre del' : 'Ny del'}</h2>
    ${F.err ? `<p class="sk76-warn" role="alert">${esc(F.err)}</p>` : ''}
    <div class="sk76-f wide"><label for="sk76-name">Navn</label><span class="sk77-nin"><input id="sk76-name" name="name" required maxlength="120" value="${esc(F.name)}" placeholder="F.eks. M3 × 10 skruer">${suggestBtn77(F)}</span></div>
    ${suggestCard77(F)}
    <label class="sk76-f">Kategori<input name="category" list="sk76-cats" maxlength="60" value="${esc(F.category)}" placeholder="Velg eller skriv ny"><datalist id="sk76-cats">${cats}</datalist></label>
    <div class="sk76-f sk76-qrow">
      <label>Antall<input name="qty" type="number" inputmode="decimal" min="0" step="any" value="${esc(F.qty)}"></label>
      <label>Enhet<select name="unit">${[...new Set([...UNITS, F.unit])].map((u) => `<option${u === F.unit ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
      <label>Min<input name="min_qty" type="number" inputmode="decimal" min="0" step="any" value="${esc(F.min_qty ?? '')}" placeholder="–"></label>
    </div>
    <fieldset class="sk76-f wide sk76-locf"><legend>Plassering</legend>
      <div class="sk76-locpick"><b>${esc(F.loc ? locText(F.loc) : 'Uten plass')}</b>
      ${F.loc && comps > 1 ? `<label class="sk76-inl">Rom<select name="compartment"><option value="">Hele skuffen</option>${Array.from({ length: comps }, (_, i) => `<option value="${i + 1}"${F.loc.compartment === i + 1 ? ' selected' : ''}>Rom ${i + 1}</option>`).join('')}</select></label>` : ''}</div>
      <p class="sk76-mut">Trykk på en skuff i tegningen${isMobile() ? ' under' : ' til høyre'} for å velge.</p>
      <div class="sk76-row"><button type="button" class="sk76-btn" data-sk76e="free">Foreslå ledig</button>${F.loc ? '<button type="button" class="sk76-btn" data-sk76e="noloc">Uten plass</button>' : ''}</div>
    </fieldset>
    <fieldset class="sk76-f wide"><legend>Specs</legend>
      <datalist id="sk76-skeys">${SPEC_KEYS.map((k) => `<option value="${esc(k)}">`).join('')}</datalist>
      ${F.specs.map(([k, v], i) => `<div class="sk76-spec" data-sk76-spec><input data-k list="sk76-skeys" aria-label="Egenskap" value="${esc(k)}" placeholder="verdi"><input data-v aria-label="Verdi" value="${esc(v)}" placeholder="10k"><button type="button" class="sk76-x" data-sk76e="rm-spec" data-i="${i}" aria-label="Fjern">×</button></div>`).join('')}
      <button type="button" class="sk76-link" data-sk76e="add-spec">+ Legg til felt</button>
    </fieldset>
    <label class="sk76-f wide">Beskrivelse<textarea name="description" rows="2" maxlength="2000">${esc(F.description)}</textarea></label>
    <label class="sk76-f wide">Tags<input name="tags" value="${esc(F.tags)}" placeholder="skrue, m3, rustfri (komma mellom)"></label>
    <fieldset class="sk76-f wide"><legend>Bilder</legend>
      <div class="sk76-drop" data-sk76-drop><div class="sk76-pphs">${photosHtml(F)}</div>
        <span class="sk76-mut">Dra bilder hit, eller</span>
        <span class="sk76-row"><label class="sk76-btn sk76-file">Velg bilder<input type="file" accept="image/*,.heic,.heif" multiple data-sk76-files></label>${isMobile() ? '<label class="sk76-btn sk76-file">Ta bilde<input type="file" accept="image/*" capture="environment" data-sk76-files></label>' : ''}${F.img?.open ? '' : findBtn77()}</span>
      </div>
      ${finderHtml77(F)}
    </fieldset>
    <label class="sk76-f">Leverandør<input name="supplier" maxlength="80" value="${esc(F.supplier)}"></label>
    <label class="sk76-f">Pris (kr)<input name="price" type="number" inputmode="decimal" min="0" step="any" value="${esc(F.price ?? '')}"></label>
    <label class="sk76-f wide">URL (datablad/kjøp)<input name="url" type="url" inputmode="url" maxlength="500" value="${esc(F.url)}" placeholder="https://"></label>
    <div class="sk76-pacts wide"><button type="submit" class="sk76-btn pri" ${F.busy ? 'disabled' : ''}>${F.busy ? 'Lagrer …' : F.id ? 'Lagre' : 'Legg til del'}</button><a class="sk76-btn" href="${F.id ? `#/skjold/del/${encodeURIComponent(F.id)}` : '#/skjold'}">Avbryt</a></div>
  </form>`;
}
function addFiles(list) {
  const F = S.form; if (!F) return;
  readForm();
  const added = [];
  for (const f of list) {
    if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) { toast(`${f.name}: ikke et bilde`); continue; }
    if (f.size > MAX_MB * 1024 * 1024) { toast(`${f.name} er større enn ${MAX_MB} MB`); continue; }
    F.files.push({ file: f, url: URL.createObjectURL(f) }); added.push(f);
  }
  paintMain();
  onNewPhotos77(F, added); // prompt 77: «Foreslå automatisk når jeg tar bilde»
}
function bindDrop(el, onFiles) {
  if (!el) return;
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer?.files?.length) onFiles([...e.dataTransfer.files]); });
}
export function editMount(el) {
  const f = el.querySelector('[data-sk76-pform]');
  if (!f) return;
  f.querySelectorAll('[data-sk76-files]').forEach((i) => i.addEventListener('change', () => { addFiles([...i.files]); i.value = ''; }));
  bindDrop(f.querySelector('[data-sk76-drop]'), addFiles);
  f.addEventListener('submit', (e) => { e.preventDefault(); savePart(); });
  if (!S.form.id && !S.form.name && !S.form.ai && !S.form.img) setTimeout(() => f.elements.name?.focus({ preventScroll: true }), 0);
  mountEdit77(f, S.form);
}
/** Fra skjold76.js: felt endret ({target}) eller skuff valgt i tegningen ({pick}). */
export function editInput({ target, pick }) {
  if (!S.form) return;
  if (pick) {
    readForm();
    S.form.loc = pick; haptic(8);
    loadMap(pick.cabinetId).then(() => { paintMain(); paintSide(); });
    return;
  }
  void target; // feltene leses ved lagring/omtegning
}
async function suggestFree() {
  readForm();
  let r;
  try { r = await sk('/free'); } catch { toast('Fant ikke ledige skuffer (krever nett)'); return; }
  // Serveren foreslår selv første ledige (first), helst i skapet som vises nå.
  const cur = (r?.cabinets ?? []).find((c) => String(c.id) === String(S.cabId) && c.free?.length);
  const f0 = cur ? { cabinetId: cur.id, row: cur.free[0].row, col: cur.free[0].col } : r?.first;
  if (f0?.row) { const c = cabById(f0.cabinetId); editInput({ pick: { cabinetId: c?.id ?? f0.cabinetId, row: +f0.row, col: +f0.col, compartment: null } }); if (c) S.cabId = c.id; toast(`Ledig: ${c?.name ? `${c.name} · ` : ''}${longAt81(S.maps[c?.id ?? f0.cabinetId], +f0.row, +f0.col)}`); return; }
  const cabs = Array.isArray(r) ? r : r?.cabinets ?? r?.items ?? [];
  const norm = (d) => (Array.isArray(d) ? { row: +d[0], col: +d[1] } : typeof d === 'string' ? (([a, b]) => ({ row: +a, col: +b }))(d.split(/[-·:]/)) : { row: +d.row, col: +d.col });
  const order = [...cabs].sort((a, b) => (String(a.cabinetId ?? a.id) === String(S.cabId) ? -1 : String(b.cabinetId ?? b.id) === String(S.cabId) ? 1 : 0));
  for (const c of order) {
    const L = (c.drawers ?? c.free ?? []).map(norm).filter((d) => d.row && d.col);
    if (L.length) { const cid = c.cabinetId ?? c.id; editInput({ pick: { cabinetId: cabById(cid)?.id ?? cid, row: L[0].row, col: L[0].col, compartment: null } }); S.cabId = cabById(cid)?.id ?? S.cabId; toast(`Ledig: ${longAt81(S.maps[cid], L[0].row, L[0].col)}`); return; }
  }
  toast('Ingen ledige skuffer');
}
export function editClick(t) {
  const a = t.closest('[data-sk76e]'); if (!a) return false;
  const F = S.form, i = +a.dataset.i;
  readForm();
  switch (a.dataset.sk76e) {
    case 'add-spec': F.specs.push(['', '']); paintMain(); form()?.querySelectorAll('[data-sk76-spec] [data-k]')[F.specs.length - 1]?.focus(); return true;
    case 'rm-spec': F.specs.splice(i, 1); paintMain(); return true;
    case 'rm-photo': if (F.rm.has(i)) F.rm.delete(i); else F.rm.add(i); paintMain(); return true;
    case 'rm-new': URL.revokeObjectURL(F.files[i]?.url); F.files.splice(i, 1); paintMain(); return true;
    case 'free': suggestFree(); return true;
    case 'noloc': F.loc = null; paintMain(); paintSide(); return true;
    default: return aiClick77(a, F); // prompt 77: ✦ Foreslå, Finn bilde
  }
}
const num = (v) => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);
async function savePart() {
  readForm();
  const F = S.form;
  if (!F.name.trim()) { F.err = 'Delen må ha et navn.'; paintMain(); form()?.elements.name?.focus(); return; }
  if (!navigator.onLine) { toast('Endringer krever nett. Prøv igjen når du er tilkoblet.'); return; }
  F.err = ''; F.busy = true; paintMain();
  const specs = Object.fromEntries(F.specs.map(([k, v]) => [String(k).trim(), String(v).trim()]).filter(([k, v]) => k && v));
  const body = {
    name: F.name.trim(), category: F.category.trim() || null, description: F.description.trim(), specs,
    qty: num(F.qty) ?? 0, unit: F.unit || 'stk', min_qty: num(F.min_qty), tags: F.tags.split(',').map((x) => x.trim()).filter(Boolean),
    url: F.url.trim() || null, price: num(F.price), supplier: F.supplier.trim() || null,
  };
  const L = F.loc, locBody = L ? { cabinetId: L.cabinetId, row: L.row, col: L.col, compartment: L.compartment ?? null } : { cabinetId: null, row: null, col: null, compartment: null };
  const locKey = JSON.stringify([locBody.cabinetId, locBody.row, locBody.col, locBody.compartment]);
  let id = F.id, occupied = [];
  try {
    if (!id) {
      const r = await sk('/parts', { method: 'POST', json: { ...body, ...locBody, cabinet_id: locBody.cabinetId } });
      const p = r?.part ?? r; id = p.id; S.parts[id] = p; occupied = r?.occupied ?? [];
    } else {
      const r = await sk(`/parts/${encodeURIComponent(id)}`, { method: 'PATCH', json: body });
      S.parts[id] = r?.part ?? r ?? S.parts[id];
      if (locKey !== F.loc0) { const m = await sk(`/parts/${encodeURIComponent(id)}/move`, { method: 'POST', json: locBody }); occupied = m?.occupied ?? []; }
      // Bilder som skal bort: høyeste indeks først, så de andre beholder nummeret sitt.
      for (const n of [...F.rm].map((i) => F.photos[i]?.n ?? i).sort((a, b) => b - a)) await sk(`/parts/${encodeURIComponent(id)}/photos/${n}`, { method: 'DELETE' });
    }
    for (const f of F.files) await upload(`/parts/${encodeURIComponent(id)}/photos`, f.file);
    if (F.web?.length) await saveWeb77(F, id); // prompt 77: bilder valgt fra nettet før delen fantes
  } catch (e) {
    F.busy = false; F.err = e instanceof TypeError ? 'Endringer krever nett. Prøv igjen når du er tilkoblet.' : (e.message || 'Kunne ikke lagre');
    if (id && !F.id) { F.id = id; F.key = id; F.loc0 = locKey; F.files = []; } // delen ble laget, men noe etterpå feilet
    paintMain(); return;
  }
  F.files.forEach((f) => URL.revokeObjectURL(f.url));
  const occ = occupied.filter((x) => String(x.id) !== String(id));
  toast(`${F.id ? 'Lagret' : 'Lagt til'}${occ.length ? ` · ${occ.slice(0, 2).map((x) => x.name).join(', ')} ligger også i skuffen` : ''}`, { ms: occ.length ? 4000 : 2200 });
  S.form = null; S.pick = null;
  await loadPart(id);
  refreshAll([L?.cabinetId]);
  go(`#/skjold/del/${encodeURIComponent(id)}`);
}

/* ================= Skap-oppsett ================= */

export function startSetup(r) {
  const id = r.id === 'ny' || r.id === 'ny3d' ? r.id : r.id && cabById(r.id) ? cabById(r.id).id : null;
  if (S.setup?.id === id && S.setup) return;
  const c = id != null && !String(id).startsWith('ny') ? cabById(id) : null;
  S.setup = {
    id, kind: c?.kind ?? (id === 'ny3d' ? '3d' : 'kjøpt'), name: c?.name ?? (id === 'ny3d' ? 'Tilleggsskap (3D-print)' : id === 'ny' ? 'Nytt skap' : ''),
    rows: c?.rows ?? 12, cols: c?.cols ?? (id === 'ny3d' ? colsFromWidth76(270) : 5), width: 270,
    corners: c && cornersOk76(c.corners) ? JSON.parse(JSON.stringify(c.corners)) : null, busy: false, imp: null,
    etasjer: c?.rows === 13 ? 5 : 4, // prompt 81: valget for Skjold Lab-hylla
  };
  if (c) { S.cabId = c.id; loadMap(c.id); }
}
const sform = () => document.querySelector('#sk76 [data-sk76-cform]');
function readSetup() {
  const f = sform(), U = S.setup; if (!f || !U) return;
  U.name = f.elements.name.value; U.rows = Math.max(1, Math.min(40, +f.elements.rows.value || 1)); U.cols = Math.max(1, Math.min(20, +f.elements.cols.value || 1)); U.kind = f.elements.kind.value;
  if (f.elements.width) U.width = +f.elements.width.value || 0;
}
function cabListHtml() {
  return `<ul class="sk76-cabs" role="list">${(S.cabs ?? []).map((c) => `<li><a class="sk76-cabit${String(S.setup?.id) === String(c.id) ? ' on' : ''}" href="#/skjold/oppsett/${encodeURIComponent(c.id)}">
      <span class="sk76-th">${c.thumbUrl ? `<img src="${esc(c.thumbUrl)}" alt="" loading="lazy" data-sk76-img>` : `<b>${esc(c.rows)}×${esc(c.cols)}</b>`}</span>
      <span class="sk76-it"><b>${esc(c.name)}</b><span class="sk76-sp">${esc(`${c.rows} rader × ${c.cols} skuffer · ${c.kind === '3d' ? '3D-print' : 'kjøpt'}`)}</span><span class="sk76-loc">${esc(`${c.counts?.parts === 1 ? '1 del' : `${c.counts?.parts ?? 0} deler`} · ${c.counts?.usedDrawers === 1 ? '1 skuff' : `${c.counts?.usedDrawers ?? 0} skuffer`} i bruk${c.photoUrl ? (cornersOk76(c.corners) ? ' · bilde med hjørner' : ' · bilde uten hjørner') : ''}`)}</span></span></a></li>`).join('')}</ul>
    <div class="sk76-row"><a class="sk76-btn" href="#/skjold/oppsett/ny">+ Nytt skap</a><a class="sk76-btn" href="#/skjold/oppsett/ny3d">+ Tilleggsskap (3D-print)</a><a class="sk76-btn" href="#/skjold/oppsett/ny3d">+ ${esc(PRESET81.short)}</a></div>`;
}
function cornerEditorHtml(c) {
  const U = S.setup;
  if (!c?.photoUrl) {
    return `<div class="sk76-drop big" data-sk76-cdrop><b>Bilde av skapet</b><span class="sk76-mut">Ta et bilde rett forfra med alle skuffene synlige. Dra bildet hit, eller</span>
      <span class="sk76-row"><label class="sk76-btn sk76-file">Velg bilde<input type="file" accept="image/*,.heic,.heif" data-sk76-cfile></label>${isMobile() ? '<label class="sk76-btn sk76-file">Ta bilde<input type="file" accept="image/*" capture="environment" data-sk76-cfile></label>' : ''}</span></div>`;
  }
  const cs = U.corners ?? DEF_CORNERS(), draft = { rows: U.rows, cols: U.cols };
  return `<div class="sk76-cedit-wrap"><p class="sk76-mut">Dra de fire håndtakene til hjørnene på skuffene (ytterkanten av rutenettet). Rutenettet viser hvordan skuffene blir lagt over bildet.</p>
    <div class="sk76-photo sk76-cedit" data-sk76-cedit><img src="${esc(c.photoUrl)}" alt="${esc(`Bilde av ${c.name}`)}" decoding="async">${overlayGrid76(draft, null, { preview: true })}
      ${['tl', 'tr', 'br', 'bl'].map((k) => `<button type="button" class="sk76-hd" data-sk76-hd="${k}" aria-label="${esc({ tl: 'Øvre venstre hjørne', tr: 'Øvre høyre hjørne', br: 'Nedre høyre hjørne', bl: 'Nedre venstre hjørne' }[k])} (piltaster flytter)" style="left:${cs[k].x * 100}%;top:${cs[k].y * 100}%"></button>`).join('')}
    </div>
    <div class="sk76-row"><button type="button" class="sk76-btn pri" data-sk76c="save-corners">Lagre hjørner</button><button type="button" class="sk76-btn" data-sk76c="reset-corners">Tilbakestill</button>
      <label class="sk76-btn sk76-file">Nytt bilde<input type="file" accept="image/*,.heic,.heif" data-sk76-cfile></label><button type="button" class="sk76-btn danger" data-sk76c="rm-photo">Fjern bildet</button></div></div>`;
}
export function setupHtml() {
  const U = S.setup ?? {};
  const c = U.id != null && !String(U.id).startsWith('ny') ? cabById(U.id) : null;
  const isNew = String(U.id ?? '').startsWith('ny');
  let edit = '';
  if (c || isNew) {
    edit = `<form class="sk76-card sk76-cform" data-sk76-cform novalidate>
      <h2 class="sk76-pname">${isNew ? 'Legg til skap' : esc(c.name)}</h2>
      <label class="sk76-f wide">Navn<input name="name" required maxlength="60" value="${esc(U.name)}"></label>
      <label class="sk76-f">Type<select name="kind"><option value="kjøpt"${U.kind !== '3d' ? ' selected' : ''}>Kjøpt</option><option value="3d"${U.kind === '3d' ? ' selected' : ''}>3D-printet</option></select></label>
      ${U.kind === '3d' ? `<label class="sk76-f">Bredde i hylla (mm)<input name="width" type="number" inputmode="numeric" min="60" max="2000" value="${esc(U.width)}"><small class="sk76-mut">Forslag: ${colsFromWidth76(U.width)} skuffer à ~60 mm (<button type="button" class="sk76-link" data-sk76c="use-width">bruk</button>)</small></label>` : ''}
      <div class="sk76-f sk76-qrow"><label>Rader<input name="rows" type="number" inputmode="numeric" min="1" max="40" value="${esc(U.rows)}"></label><label>Kolonner<input name="cols" type="number" inputmode="numeric" min="1" max="20" value="${esc(U.cols)}"></label></div>
      ${presetBoxHtml81(U.etasjer, { isNew })}
      <div class="sk76-pacts wide"><button type="submit" class="sk76-btn pri"${U.busy ? ' disabled' : ''}>${isNew ? 'Legg til skap' : 'Lagre'}</button>${c ? `<button type="button" class="sk76-btn" data-sk76c="labels">Etiketter</button><button type="button" class="sk76-btn danger" data-sk76c="delete">Slett skap</button>` : ''}</div>
      ${c ? cornerEditorHtml(c) : ''}
    </form>`;
  }
  const imp = U.imp;
  return `<section class="sk76-setup">
    <a class="sk76-back" href="#/skjold">‹ Deler</a>
    <div class="sk76-card"><span class="sk76-kick">SKAP</span>${cabListHtml()}</div>
    ${edit}
    ${c ? ledSetupHtml78(c) : ''}
    <div class="sk76-card sk76-csv"><span class="sk76-kick">IMPORT OG EKSPORT</span>
      <div class="sk76-row"><a class="sk76-btn" href="/api/skjold/export.csv" download>Last ned CSV</a><label class="sk76-btn sk76-file">Importer CSV<input type="file" accept=".csv,text/csv" data-sk76-csv></label></div>
      ${imp ? `<div class="sk76-imp" role="status">${esc(imp.text)}${imp.ready ? ' <button type="button" class="sk76-btn pri" data-sk76c="import">Importer</button> <button type="button" class="sk76-link" data-sk76c="import-cancel">Avbryt</button>' : ''}</div>` : ''}
    </div>
  </section>`;
}
function layoutEditor() {
  const box = document.querySelector('#sk76 [data-sk76-cedit]'), U = S.setup;
  if (!box || !U) return null;
  const cs = U.corners ?? DEF_CORNERS();
  const r = layoutPhoto76(box, { rows: U.rows, cols: U.cols }, cs);
  const img = box.querySelector('img');
  if (!img.naturalWidth) return null;
  // Håndtakene plasseres i det faktiske bildet (object-fit: contain).
  const bw = img.clientWidth, bh = img.clientHeight, nr = img.naturalWidth / img.naturalHeight;
  let w = bw, h = bw / nr; if (h > bh) { h = bh; w = bh * nr; }
  const ox = img.offsetLeft + (bw - w) / 2, oy = img.offsetTop + (bh - h) / 2;
  box.querySelectorAll('[data-sk76-hd]').forEach((b) => { const p = cs[b.dataset.sk76Hd]; b.style.left = `${ox + p.x * w}px`; b.style.top = `${oy + p.y * h}px`; });
  return r || { ox, oy, w, h };
}
let cro = null;
export function setupMount(el) {
  const f = el.querySelector('[data-sk76-cform]');
  el.querySelectorAll('[data-sk76-cfile]').forEach((i) => i.addEventListener('change', () => { if (i.files[0]) uploadCabPhoto(i.files[0]); i.value = ''; }));
  bindDrop(el.querySelector('[data-sk76-cdrop]'), (L) => L[0] && uploadCabPhoto(L[0]));
  el.querySelector('[data-sk76-csv]')?.addEventListener('change', (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) importCsv(file, true); });
  f?.addEventListener('submit', (e) => { e.preventDefault(); saveCab(); });
  f?.addEventListener('change', (e) => { if (e.target.name === 'kind') { readSetup(); if (S.setup.kind === '3d' && S.setup.id === 'ny') S.setup.cols = colsFromWidth76(S.setup.width); paintMain(); } });
  f?.addEventListener('input', (e) => {
    if (e.target.name === 'rows' || e.target.name === 'cols') { readSetup(); const box = el.querySelector('[data-sk76-cedit]'); const ov = box?.querySelector('[data-sk76-ov]'); if (ov) { ov.outerHTML = overlayGrid76({ rows: S.setup.rows, cols: S.setup.cols }, null, { preview: true }); layoutEditor(); } }
    if (e.target.name === 'width') { readSetup(); const s = f.querySelector('small.sk76-mut'); if (s) s.firstChild.textContent = `Forslag: ${colsFromWidth76(S.setup.width)} skuffer à ~60 mm (`; }
  });
  const box = el.querySelector('[data-sk76-cedit]');
  cro?.disconnect(); cro = null;
  if (!box) return;
  const img = box.querySelector('img');
  if (img.complete && img.naturalWidth) layoutEditor(); else img.addEventListener('load', layoutEditor, { once: true });
  if ('ResizeObserver' in window) { cro = new ResizeObserver(() => layoutEditor()); cro.observe(box); }
  // Dra hjørnene (mus, berøring og penn). Piltaster flytter 0,5 % (Shift: 2 %).
  box.querySelectorAll('[data-sk76-hd]').forEach((hd) => {
    hd.addEventListener('pointerdown', (e) => {
      e.preventDefault(); hd.setPointerCapture(e.pointerId); hd.classList.add('drag'); haptic(6);
      S.setup.corners ??= DEF_CORNERS();
      const move = (ev) => {
        const r = layoutEditor(); if (!r) return;
        const b = box.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (ev.clientX - b.left - r.ox) / r.w)), y = Math.min(1, Math.max(0, (ev.clientY - b.top - r.oy) / r.h));
        S.setup.corners[hd.dataset.sk76Hd] = { x: +x.toFixed(4), y: +y.toFixed(4) }; layoutEditor();
      };
      const up = () => { hd.classList.remove('drag'); hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); };
      hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    });
    hd.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
      e.preventDefault(); S.setup.corners ??= DEF_CORNERS();
      const st = e.shiftKey ? 0.02 : 0.005, p = S.setup.corners[hd.dataset.sk76Hd];
      S.setup.corners[hd.dataset.sk76Hd] = { x: Math.min(1, Math.max(0, +(p.x + d[0] * st).toFixed(4))), y: Math.min(1, Math.max(0, +(p.y + d[1] * st).toFixed(4))) }; layoutEditor();
    });
  });
}
async function uploadCabPhoto(file) {
  const U = S.setup, c = cabById(U?.id); if (!c) return;
  if (file.size > MAX_MB * 1024 * 1024) { toast(`Bildet er større enn ${MAX_MB} MB`); return; }
  readSetup();
  const r = await write(() => upload(`/cabinets/${encodeURIComponent(c.id)}/photo`, file), 'Bildet er lastet opp – dra hjørnene på plass');
  if (!r) return;
  await loadCabs(true);
  const nc = cabById(c.id); U.corners = nc && cornersOk76(nc.corners) ? JSON.parse(JSON.stringify(nc.corners)) : DEF_CORNERS();
  paintMain();
}
async function saveCab() {
  readSetup();
  const U = S.setup;
  if (!U.name.trim()) { toast('Skapet må ha et navn'); return; }
  const body = { name: U.name.trim(), rows: U.rows, cols: U.cols, kind: U.kind };
  if (String(U.id).startsWith('ny')) {
    const r = await write(() => sk('/cabinets', { method: 'POST', json: body }), 'Skapet er lagt til');
    if (!r) return;
    const nc = r.cabinet ?? r; await loadCabs(true);
    S.setup = null; S.cabId = nc.id ?? S.cabId;
    go(`#/skjold/oppsett/${encodeURIComponent(nc.id)}`);
    return;
  }
  const c = cabById(U.id);
  const r = await write(() => sk(`/cabinets/${encodeURIComponent(c.id)}`, { method: 'PATCH', json: body }), 'Skapet er lagret');
  if (!r) return;
  await loadCabs(true); delete S.maps[c.id]; loadMap(c.id); paintMain();
}
/** Prompt 81: «Bruk Skjold Lab-hylla (3D-print)» (eksisterende skap) eller nytt skap med forhåndsvalget. */
async function applyPreset() {
  readSetup();
  const U = S.setup, e = PRESET_SIZES81[U.etasjer] ? U.etasjer : 4;
  const isNew = String(U.id).startsWith('ny');
  if (!confirm(`${presetConfirm81(e)}.${isNew ? '' : ' Egne spenn erstattes, deler i sammenslåtte ruter flyttes til skuffen, og LED-avstanden settes til 50 mm.'} Fortsette?`)) return;
  if (!navigator.onLine) { toast('Endringer krever nett. Prøv igjen når du er tilkoblet.'); return; }
  try {
    if (isNew) {
      const name = U.name.trim() && U.name !== 'Nytt skap' && U.name !== 'Tilleggsskap (3D-print)' ? U.name.trim() : 'Skjold Lab-hylla';
      const r = await sk('/cabinets', { method: 'POST', json: { name, preset: { id: PRESET81.id, etasjer: e } } });
      toast('Skjold Lab-hylla er lagt til');
      await loadCabs(true); S.setup = null; S.cabId = r.id ?? S.cabId;
      go(`#/skjold/oppsett/${encodeURIComponent(r.id)}`);
      return;
    }
    const c = cabById(U.id);
    const r = await sk(`/cabinets/${encodeURIComponent(c.id)}/preset`, { method: 'POST', json: { id: PRESET81.id, etasjer: e } });
    toast(`Skapet er ${r.rows} × ${r.cols}${r.moved ? ` · ${r.moved} ${r.moved === 1 ? 'del' : 'deler'} flyttet inn i store skuffer` : ''}`);
    U.rows = r.rows; U.cols = r.cols; U.kind = '3d';
    await loadCabs(true); delete S.maps[c.id]; await loadMap(c.id, true); paintMain(); paintSide();
  } catch (err) {
    toast(err instanceof TypeError ? 'Endringer krever nett. Prøv igjen når du er tilkoblet.' : err.message || 'Noe gikk galt', { ms: 6000 });
  }
}
async function deleteCab() {
  const c = cabById(S.setup?.id); if (!c) return;
  if (!confirm(`Slette «${c.name}»?`)) return;
  if (!navigator.onLine) { toast('Endringer krever nett. Prøv igjen når du er tilkoblet.'); return; }
  try { await sk(`/cabinets/${encodeURIComponent(c.id)}`, { method: 'DELETE' }); } catch (e) {
    if (e.status !== 409) { toast(e.message || 'Kunne ikke slette'); return; }
    const others = (S.cabs ?? []).filter((x) => String(x.id) !== String(c.id));
    const n = c.counts?.parts;
    const names = others.map((x, i) => `${i + 1}: ${x.name}`).join('\n');
    const ans = prompt(`«${c.name}» har ${n ?? 'noen'} deler. Hvor skal de?\n${names}${names ? '\n' : ''}0: Uten plass\n\nSkriv nummeret (tomt = avbryt).`, others.length ? '1' : '0');
    if (ans == null || ans.trim() === '') return;
    const k = +ans, move = k === 0 ? 'none' : others[k - 1]?.id;
    if (move == null) { toast('Ugyldig valg'); return; }
    const r = await write(() => sk(`/cabinets/${encodeURIComponent(c.id)}?move=${encodeURIComponent(move)}`, { method: 'DELETE' }));
    if (!r) return;
  }
  toast(`«${c.name}» er slettet`);
  S.maps = {}; S.setup = null; await loadCabs(true); refreshAll(); go('#/skjold/oppsett');
}
async function importCsv(file, dry) {
  const U = S.setup ?? (S.setup = { id: null });
  if (!navigator.onLine) { toast('Import krever nett.'); return; }
  try {
    const text = await file.text();
    const r = await fetch(`/api/skjold/import${dry ? '?dry=1' : ''}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text, credentials: 'same-origin' });
    const d = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
    if (!r.ok) throw new Error(d?.error || `Import feilet (${r.status})`);
    const n = (k) => d?.[k] ?? d?.summary?.[k];
    const created = n('create') ?? n('created') ?? 0, updated = n('update') ?? n('updated') ?? 0, errs = d?.errors?.length ?? 0;
    if (dry) U.imp = { file, ready: true, text: `${file.name}: ${created ?? '?'} nye, ${updated} oppdatert${errs ? `, ${errs} rader med feil` : ''}.` };
    else { U.imp = { text: `Importert: ${created ?? 0} nye, ${updated} oppdatert${errs ? `, ${errs} feil` : ''}.` }; refreshAll(); }
  } catch (e) { U.imp = { text: e instanceof TypeError ? 'Import krever nett.' : e.message }; }
  paintMain();
}
export function setupClick(t) {
  const et = t.closest('[data-sk81-et]'); if (et && S.setup) { readSetup(); S.setup.etasjer = +et.dataset.sk81Et; paintMain(); return true; }
  if (t.closest('[data-sk81="preset"]') && S.setup) { applyPreset(); return true; }
  const a = t.closest('[data-sk76c]'); if (!a) return false;
  const U = S.setup, c = cabById(U?.id);
  switch (a.dataset.sk76c) {
    case 'save-corners': {
      const cs = U.corners ?? DEF_CORNERS();
      if (!cornersOk76(cs)) { toast('Hjørnene må danne en firkant (ikke kryss).'); return true; }
      write(() => sk(`/cabinets/${encodeURIComponent(c.id)}/corners`, { method: 'PUT', json: cs }), 'Hjørnene er lagret').then(async (r) => { if (r) { await loadCabs(true); S.mode = 'bilde'; try { localStorage.setItem('sk76_mode', 'bilde'); } catch { /* */ } } });
      return true;
    }
    case 'reset-corners': U.corners = c && cornersOk76(c.corners) ? JSON.parse(JSON.stringify(c.corners)) : DEF_CORNERS(); layoutEditor(); return true;
    case 'rm-photo':
      if (!confirm('Fjerne bildet av skapet?')) return true;
      write(() => sk(`/cabinets/${encodeURIComponent(c.id)}/photo`, { method: 'DELETE' }), 'Bildet er fjernet').then(async (r) => { if (r) { U.corners = null; await loadCabs(true); paintMain(); } });
      return true;
    case 'labels': window.open(`/api/skjold/labels?cabinet=${encodeURIComponent(c.id)}`, '_blank', 'noopener'); return true;
    case 'delete': deleteCab(); return true;
    case 'use-width': readSetup(); U.cols = colsFromWidth76(U.width); paintMain(); return true;
    case 'import': if (U.imp?.file) importCsv(U.imp.file, false); return true;
    case 'import-cancel': U.imp = null; paintMain(); return true;
    default: return false;
  }
}
/** Felt i skap-skjemaet endret (håndteres av lytterne i setupMount). */
export function setupInput() {}
