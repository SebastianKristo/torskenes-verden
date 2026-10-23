// Prompt 45 (WEB45) · Media på web:
// - Slett uovervåkede episoder/filmer (claude-code-media-slett-uovervakede-episoder.md): bekreftelsesark med liste, avkryssing per fil
//   og «Slett filer», så en toast med Angre (serveren venter 8 s før den sletter).
//     GET  /api/media/unmonitored?service=sonarr|radarr&seriesId=&season=&server=  → {items:[{fileId,title,code,series,sizeText}], count, sizeText, text}
//     POST /api/media/unmonitored/delete {service, fileIds, confirm:true} → 202 {pendingId, undo:{path}, message}
//     DELETE /api/media/unmonitored/pending/:id → Angre
// - Innstillinger for Media ligger nå i Innstillinger → Media (settings45.js); tannhjulet åpner den siden.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const U = { open: false, busy: false, err: '', d: null, sel: {}, q: null, done: null };
let host = null, onDone = null;

async function j(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: opt.body ? { 'Content-Type': 'application/json' } : {} });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Serveren kan ikke slette uovervåkede filer ennå. Oppdater Homelab.' : r.status === 403 ? 'Bare administrator kan slette filer.' : `Feil ${r.status}`)), { status: r.status });
  return d;
}
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

/** Åpner arket. q = {service:'sonarr'|'radarr', seriesId?, season?, server?, label?}. done() kalles etter sletting/angre. */
export async function openUnmonitored(q, done) {
  onDone = done ?? null;
  Object.assign(U, { open: true, busy: true, err: '', d: null, sel: {}, q, done: null });
  paint();
  try {
    U.d = await j(`/api/media/unmonitored?${qs({ service: q.service, seriesId: q.seriesId, season: q.season, movieId: q.movieId, server: q.server })}`);
    if (q.movieId != null && Array.isArray(U.d.items)) U.d.items = U.d.items.filter((x) => x.movieId == null || String(x.movieId) === String(q.movieId));
    (U.d.items ?? []).forEach((x) => { U.sel[x.fileId] = true; });
  } catch (e) { U.err = e.message; }
  U.busy = false; paint();
}
function close() { U.open = false; paint(); }
const fmtGB = (b) => (b >= 1e9 ? `${(b / 1e9).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} GB` : `${Math.round(b / 1e6).toLocaleString('nb-NO')} MB`);

function html() {
  if (!U.open) return '';
  const L = U.d?.items ?? [], on = L.filter((x) => U.sel[x.fileId]), size = on.reduce((a, x) => a + (+x.size || 0), 0);
  const film = U.q?.service === 'radarr';
  const what = film ? (on.length === 1 ? 'filmfil' : 'filmfiler') : on.length === 1 ? 'episodefil' : 'episodefiler';
  let body;
  if (U.busy && !U.d) body = '<span class="m45u-mut">Finner filer som ikke er overvåket …</span>';
  else if (U.err) body = `<span class="m45u-err">${esc(U.err)}</span>`;
  else if (!L.length) body = `<span class="m45u-mut">Ingen ${film ? 'filmer' : 'episoder'} uten overvåking har filer${U.q?.label ? ` i ${esc(U.q.label)}` : ''}. Ingenting å rydde.</span>`;
  else body = `<div class="m45u-list">${L.map((x) => `<label class="m45u-r"><input type="checkbox" data-m45u-ck="${esc(x.fileId)}"${U.sel[x.fileId] ? ' checked' : ''}><span class="m45u-t"><b>${esc([x.series && x.series !== x.title ? x.series : '', x.code].filter(Boolean).join(' · ') || x.title)}</b><span>${esc([x.code ? x.title : '', x.quality].filter(Boolean).join(' · '))}</span></span><span class="m45u-sz">${esc(x.sizeText ?? '')}</span></label>`).join('')}</div>`;
  const head = L.length ? `Slette ${on.length} ${what} (${fmtGB(size)}) som ikke er overvåket?` : 'Rydd uovervåkede';
  return `<div class="m45u-bg" data-m45u-bg><div class="m45u" role="dialog" aria-modal="true" aria-labelledby="m45u-h">
    <div class="m45u-top"><span class="m45u-k">${film ? 'RADARR' : 'SONARR'}${U.q?.label ? ` · ${esc(U.q.label)}` : ''}</span><button type="button" class="m45u-x" data-m45u="x" aria-label="Lukk">✕</button></div>
    <b class="m45u-h" id="m45u-h">${esc(head)}</b>
    <span class="m45u-mut">Filene slettes fra disken. ${film ? 'Filmene' : 'Episodene'} blir stående i ${film ? 'Radarr' : 'Sonarr'} som uovervåket. Du har noen sekunder til å angre.</span>
    ${L.length > 1 ? `<div class="m45u-all"><button type="button" class="m45u-l" data-m45u="all">Velg alle</button><button type="button" class="m45u-l" data-m45u="none">Velg ingen</button></div>` : ''}
    ${body}
    <div class="m45u-act"><button type="button" class="m45u-b line" data-m45u="x">Avbryt</button>${L.length ? `<button type="button" class="m45u-b red" data-m45u="del"${on.length && !U.busy ? '' : ' disabled'}>${U.busy ? 'Sletter …' : `Slett ${on.length} ${on.length === 1 ? 'fil' : 'filer'}`}</button>` : ''}</div>
  </div></div>`;
}
function paint() {
  if (!host) { host = document.createElement('div'); host.className = 'm45u-host'; document.body.appendChild(host); bind(); }
  host.innerHTML = html();
}
function toastUndo(msg, undoPath) {
  let t = document.getElementById('m45u-toast');
  if (!t) { t = document.createElement('div'); t.id = 'm45u-toast'; t.className = 'm45u-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = `<span>${esc(msg)}</span>${undoPath ? '<button type="button" data-m45u-undo>Angre</button>' : ''}`;
  t.hidden = false;
  clearTimeout(toastUndo.t); toastUndo.t = setTimeout(() => { t.hidden = true; }, undoPath ? 9000 : 4000);
  const b = t.querySelector('[data-m45u-undo]');
  if (b) b.onclick = async () => { b.disabled = true; try { await j(undoPath, { method: 'DELETE' }); t.innerHTML = '<span>Angret. Ingen filer ble slettet.</span>'; onDone?.(); } catch (e) { t.innerHTML = `<span>${esc(e.message)}</span>`; } clearTimeout(toastUndo.t); toastUndo.t = setTimeout(() => { t.hidden = true; }, 3000); };
}
async function del() {
  const ids = (U.d?.items ?? []).filter((x) => U.sel[x.fileId]).map((x) => x.fileId);
  if (!ids.length) return;
  U.busy = true; paint();
  try {
    const r = await j(`/api/media/unmonitored/delete${U.q?.server ? `?server=${encodeURIComponent(U.q.server)}` : ''}`, { method: 'POST', body: JSON.stringify({ service: U.q.service, fileIds: ids, confirm: true }) });
    close();
    toastUndo(r.message || `Sletter ${ids.length} ${ids.length === 1 ? 'fil' : 'filer'} (${r.sizeText ?? ''}) …`, r.undo?.path ?? (r.pendingId ? `/api/media/unmonitored/pending/${encodeURIComponent(r.pendingId)}` : null));
    setTimeout(() => onDone?.(), (r.executesAt ? Math.max(0, Date.parse(r.executesAt) - Date.now()) : 8000) + 1500);
  } catch (e) { U.busy = false; U.err = e.message; paint(); }
}
function bind() {
  host.addEventListener('click', (e) => {
    if (e.target.matches('[data-m45u-bg]')) return close();
    const a = e.target.closest('[data-m45u]')?.dataset.m45u;
    if (a === 'x') return close();
    if (a === 'all' || a === 'none') { (U.d?.items ?? []).forEach((x) => { U.sel[x.fileId] = a === 'all'; }); return paint(); }
    if (a === 'del') return del();
  });
  host.addEventListener('change', (e) => { const k = e.target.dataset.m45uCk; if (k != null) { U.sel[k] = e.target.checked; paint(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && U.open) { e.stopPropagation(); close(); } }, true);
}

export function after45() { /* Media kobles fra media43.js */ }
