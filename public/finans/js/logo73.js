// Prompt 73 (LOGO73): «Endre logo» for en butikk i FinansHub web (fasit: «Lagre og logo.dc.html» 1a mobil, 1b web).
// Trykk på logoen i transaksjonspanelet, i transaksjonsdetaljen på mobil eller på butikkraden → arket. Papir-design
// (#f3efe6 / #fff / #d8d1c2 / #1b1a17 / #8f897c / #b23a2a, Newsreader + Manrope + IBM Plex Mono), aldri mørkt glass.
//   Søk:   GET /finans/api/logos?q=… (debounce 250 ms) → [{id, name, domain, logoUrl}] fra hele logobiblioteket.
//   Lagre: PUT /finans/api/merchants/:navn/logo {logoId | uploadId | initials:true | null}.
//   Bilde: beskjæres til kvadrat (maks 512) i nettleseren, så POST /finans/api/merchants/logo/upload (serveren beskjærer også).
// Overstyringen gjelder per butikk (normalisert navn) og vises overalt i Finans via core.logoOv73().
import { api, esc, ini, toast, render, loadLogoOv73, setLogoOv73 } from './core.js';

const PEN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const X = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const LUPE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8f897c" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
export const MAX_SIDE73 = 512;

/** Logoen som knapp: trykk åpner «Endre logo». names = alle navn butikken vises med (beskrivelse, butikk). */
export function logoBtn73(t, html, cls = '') {
  const name = String(t?.merchant || t?.description || t?.name || '').trim();
  if (!name) return html;
  const alt = [t?.description, t?.merchant, t?.name].map((x) => String(x ?? '').trim()).filter(Boolean);
  return `<button type="button" class="lg73-btn ${cls.split(/\s+/).filter(Boolean).map((x) => `lg73-${x}`).join(' ')}" data-logo73="${esc(name)}" data-logo73-names="${esc(JSON.stringify([...new Set(alt)]))}" aria-label="Endre logo for ${esc(name)}" title="Endre logo">${html}<span class="lg73-pen" aria-hidden="true">${PEN}</span></button>`;
}

const st = { el: null, name: '', names: [], q: '', items: [], total: 0, sel: null, cur: null, busy: false, timer: 0, seq: 0, last: null, wide: true };
const wideNow = () => window.matchMedia('(min-width: 760px)').matches;

function logoBox(url, letter, size, inner, cls = '') {
  return `<span class="lg73-box ${cls}" style="width:${size}px;height:${size}px">${url ? `<img src="${esc(url)}" alt="" width="${inner}" height="${inner}" loading="lazy">` : `<b style="font-size:${Math.round(size * 0.45)}px">${esc(letter)}</b>`}</span>`;
}
// Forhåndsvisning: valgt logo → manuelt valg → logoen som vises nå (bildet i knappen som ble trykket) → serverens automatiske.
const preview = () => (st.sel ? st.sel.logoUrl : st.cur?.manual ? (st.cur.initials ? null : st.cur.logoUrl) : st.img ?? st.cur?.logoUrl ?? null);

function listHtml() {
  if (!st.items.length) return `<div class="lg73-empty">${st.busy ? 'Søker …' : 'Ingen butikker funnet'}</div>`;
  if (st.wide) {
    return st.items.map((r, i) => `<button type="button" class="lg73-tile${st.sel?.id === r.id ? ' lg73-on' : ''}" data-lg73-pick="${i}" aria-pressed="${st.sel?.id === r.id}">${logoBox(r.logoUrl, ini(r.name), 52, 34)}<span class="lg73-tn">${esc(r.name)}</span><span class="lg73-td">${esc(r.domain ?? '')}</span></button>`).join('');
  }
  return st.items.map((r, i) => `<button type="button" class="lg73-row${st.sel?.id === r.id ? ' lg73-on' : ''}" data-lg73-pick="${i}" aria-pressed="${st.sel?.id === r.id}">${logoBox(r.logoUrl, ini(r.name), 40, 26, 'lg73-r10')}<span class="lg73-rt"><b>${esc(r.name)}</b><span>${esc(r.domain ?? '')}</span></span>${st.sel?.id === r.id ? '<span class="lg73-check" aria-hidden="true">✓</span>' : ''}</button>`).join('');
}

function countLine() {
  const n = st.cur?.count ?? 0;
  return n ? `Gjelder alle ${n} kjøp fra ${st.name}` : `Gjelder alle kjøp fra ${st.name}`;
}

function draw() {
  if (!st.el) return;
  st.wide = wideNow();
  const reset = st.cur?.manual ? `<button type="button" class="lg73-link" data-lg73="reset">Tilbakestill til automatisk</button>` : '';
  const head = st.wide
    ? `<div class="lg73-head">${logoBox(preview(), ini(st.name), 60, 40, 'lg73-big')}<div class="lg73-hgrow"><div class="lg73-lab">${esc(st.name.toUpperCase())}${st.cur?.count ? ` · ${st.cur.count} KJØP` : ''}</div><h2 class="lg73-h" id="lg73-title">Endre logo</h2></div><button type="button" class="lg73-x" data-lg73="close" aria-label="Lukk">${X}</button></div>`
    : `<div class="lg73-grip" aria-hidden="true"></div><div class="lg73-head lg73-m"><div class="lg73-hgrow"><div class="lg73-lab">FINANS · BUTIKKLOGO</div><h2 class="lg73-h" id="lg73-title">Endre logo</h2></div>${logoBox(preview(), ini(st.name), 44, 30)}<button type="button" class="lg73-x" data-lg73="close" aria-label="Lukk">${X}</button></div>`;
  const search = `<label class="lg73-search">${LUPE}<input type="search" data-lg73-q value="${esc(st.q)}" placeholder="Søk etter butikk" aria-label="Søk etter butikk" autocomplete="off" enterkeyhint="search">${st.q ? `<button type="button" class="lg73-clr" data-lg73="clear" aria-label="Tøm">✕</button>` : ''}${st.wide ? `<span class="lg73-cnt">${st.total} TREFF</span>` : ''}</label>`;
  const label = st.wide ? '' : `<div class="lg73-sec">LOGODATABASEN · ${st.total} TREFF</div>`;
  const list = `<div class="lg73-list${st.wide ? ' lg73-grid' : ''}" role="list">${listHtml()}</div>`;
  const file = '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif" data-lg73-file hidden>';
  const apply = `<button type="button" class="lg73-pri" data-lg73="apply"${st.sel && !st.busy ? '' : ' disabled'}>${st.wide ? 'Bruk logoen' : 'Bruk denne logoen'}</button>`;
  const foot = st.wide
    ? `<div class="lg73-foot"><label class="lg73-sb">Last opp bilde${file}</label><button type="button" class="lg73-sb" data-lg73="ini">Bruk initialer</button>${reset}<span class="lg73-hgrow"></span>${apply}</div><div class="lg73-note">${esc(countLine())}</div>`
    : `<div class="lg73-two"><label class="lg73-sb">Last opp bilde${file}</label><button type="button" class="lg73-sb" data-lg73="ini">Bruk initialer</button></div>${apply}<div class="lg73-note">${esc(countLine())}</div>${reset ? `<div class="lg73-resetrow">${reset}</div>` : ''}`;
  const focusQ = document.activeElement?.matches?.('[data-lg73-q]');
  const caret = focusQ ? document.activeElement.selectionStart : null;
  st.el.querySelector('.lg73-card').className = `lg73-card ${st.wide ? 'lg73-wide' : 'lg73-sheet'}`;
  st.el.querySelector('.lg73-card').innerHTML = head + search + label + list + foot;
  if (focusQ) { const i = st.el.querySelector('[data-lg73-q]'); i.focus(); try { i.setSelectionRange(caret, caret); } catch { /* */ } }
}

function drawList() {
  if (!st.el) return;
  const l = st.el.querySelector('.lg73-list');
  if (l) l.innerHTML = listHtml();
  const c = st.el.querySelector('.lg73-cnt'); if (c) c.textContent = `${st.total} TREFF`;
  const s = st.el.querySelector('.lg73-sec'); if (s) s.textContent = `LOGODATABASEN · ${st.total} TREFF`;
  const big = st.el.querySelector('.lg73-head .lg73-box');
  if (big) big.outerHTML = logoBox(preview(), ini(st.name), st.wide ? 60 : 44, st.wide ? 40 : 30, st.wide ? 'lg73-big' : '');
  const a = st.el.querySelector('[data-lg73="apply"]'); if (a) a.disabled = !st.sel || st.busy;
}

async function search(q) {
  const my = ++st.seq;
  st.busy = true;
  try {
    const r = await fetch(`/finans/api/logos?q=${encodeURIComponent(q)}&limit=60`);
    if (!r.ok) throw new Error(`Feil ${r.status}`);
    const items = await r.json();
    if (my !== st.seq) return;
    st.items = Array.isArray(items) ? items : [];
    st.total = Number(r.headers.get('x-total-count')) || st.items.length;
  } catch { if (my === st.seq) { st.items = []; st.total = 0; } }
  if (my === st.seq) { st.busy = false; drawList(); }
}
const onQ = (v) => { st.q = v; clearTimeout(st.timer); st.timer = setTimeout(() => search(st.q), 250); };

/** Kvadrat i midten, maks 512 px, som PNG. Klarer ikke nettleseren bildet (f.eks. HEIC), sendes originalen og serveren beskjærer. */
async function squareBlob(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(bmp.width, bmp.height), t = Math.min(s, MAX_SIDE73);
    const cv = document.createElement('canvas'); cv.width = t; cv.height = t;
    cv.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, t, t);
    bmp.close?.();
    const b = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (b) return b;
  } catch { /* faller tilbake til originalen */ }
  return file;
}
async function upload(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) { toast('Bildet kan være maks 12 MB'); return; }
  st.busy = true; drawList();
  try {
    const fd = new FormData();
    fd.append('file', await squareBlob(file), 'logo.png');
    const j = await api('/merchants/logo/upload', { method: 'POST', body: fd });
    st.sel = { id: `upload:${j.uploadId}`, uploadId: j.uploadId, logoUrl: j.url, name: 'Eget bilde' };
  } catch (e) { toast(e.message || 'Kunne ikke laste opp bildet'); }
  st.busy = false; drawList();
}

async function save(body, msg) {
  if (st.busy) return;
  st.busy = true; drawList();
  try {
    const r = await api(`/merchants/${encodeURIComponent(st.name)}/logo`, { method: 'PUT', json: body });
    setLogoOv73(st.names, r.manual ? (r.logoUrl ?? '') : null);
    closeLogoSheet73();
    render();
    loadLogoOv73(true);
    toast(msg);
  } catch (e) { st.busy = false; drawList(); toast(e.message || 'Kunne ikke lagre logoen'); }
}

function onClick(e) {
  const t = e.target.closest('[data-lg73],[data-lg73-pick]');
  if (!t) { if (e.target === st.el || e.target.classList?.contains('lg73-scrim')) closeLogoSheet73(); return; }
  if (t.dataset.lg73Pick != null) { st.sel = st.items[+t.dataset.lg73Pick] ?? null; drawList(); return; }
  const a = t.dataset.lg73;
  if (a === 'close') closeLogoSheet73();
  else if (a === 'clear') { st.q = ''; search(''); draw(); st.el.querySelector('[data-lg73-q]')?.focus(); }
  else if (a === 'apply' && st.sel) save(st.sel.uploadId ? { uploadId: st.sel.uploadId } : { logoId: st.sel.id }, 'Logo oppdatert');
  else if (a === 'ini') save({ initials: true }, 'Viser initialer');
  else if (a === 'reset') save(null, 'Tilbake til automatisk logo');
}
function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLogoSheet73(); return; }
  if (e.key === 'Tab' && st.el) { // fokus blir i arket
    const f = [...st.el.querySelectorAll('button:not([disabled]),input:not([hidden]),label.lg73-sb')].filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
}
const onResize = () => { if (st.el && wideNow() !== st.wide) draw(); };

export async function openLogoSheet73(name, names = [], img = null) {
  name = String(name ?? '').trim();
  if (!name) return;
  if (st.el) closeLogoSheet73();
  Object.assign(st, { name, names: [...new Set([name, ...names])], img: img && /^\/finans\/api\//.test(img) ? img : null, q: name, items: [], total: 0, sel: null, cur: null, busy: true, seq: st.seq + 1, last: document.activeElement });
  const el = document.createElement('div');
  el.className = 'lg73';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'lg73-title');
  el.innerHTML = '<div class="lg73-scrim"></div><div class="lg73-card"></div>';
  document.body.appendChild(el);
  document.documentElement.classList.add('lg73-lock');
  st.el = el;
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => { if (e.target.matches('[data-lg73-q]')) onQ(e.target.value); });
  el.addEventListener('change', (e) => { if (e.target.matches('[data-lg73-file]')) { upload(e.target.files?.[0]); e.target.value = ''; } });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('label.lg73-sb')) { e.preventDefault(); e.target.querySelector('input')?.click(); } });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  draw();
  requestAnimationFrame(() => el.classList.add('lg73-in'));
  el.querySelector('[data-lg73-q]')?.focus({ preventScroll: true });
  api(`/merchants/${encodeURIComponent(name)}/logo`).then((c) => { if (st.el === el) { st.cur = c; draw(); } }).catch(() => {});
  search(name);
}

export function closeLogoSheet73() {
  const el = st.el;
  if (!el) return;
  st.el = null;
  clearTimeout(st.timer);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', onResize);
  document.documentElement.classList.remove('lg73-lock');
  el.classList.remove('lg73-in');
  setTimeout(() => el.remove(), 220);
  try { st.last?.focus?.({ preventScroll: true }); } catch { /* */ }
}

// Trykk på en logo-knapp hvor som helst i Finans. Fanges før panelets egne klikk (stopPropagation).
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-logo73]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  let names = [];
  try { names = JSON.parse(b.dataset.logo73Names || '[]'); } catch { /* */ }
  openLogoSheet73(b.dataset.logo73, names, b.querySelector('img')?.getAttribute('src') ?? null);
}, true);

// Overstyringene hentes ved oppstart og når fanen kommer tilbake (endret på mobilen → synlig på web).
loadLogoOv73();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadLogoOv73(); });
