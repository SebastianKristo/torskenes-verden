// Felles for desktop og mobil: API, formatering, tilstand og små grafhjelpere.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const res = await fetch('/finans/api' + path, init);
  if (res.status === 401) { location.href = '/login?next=/finans/'; throw new Error('Ikke innlogget'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || `Feil ${res.status}`);
  return data;
}

/* ---------- Tall og datoer (norsk format, minus som −) ---------- */
const nf2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
export const n2 = (v) => nf2.format(Math.abs(v ?? 0));
export const n0 = (v) => nf0.format(Math.round(Math.abs(v ?? 0)));
export const sgn = (v) => (v < 0 ? '−' : '+') + n2(v);
export const neg = (v) => (v < 0 ? '−' : '') + n2(v);
export const neg0 = (v) => (v < 0 ? '−' : '') + n0(v);
export const k = (v) => (Math.abs(v) >= 1000 ? nf0.format(Math.round(v / 1000)) + 'k' : nf0.format(v));
export const parseAmount = (s) => { const v = parseFloat(String(s ?? '').replace(/\s| /g, '').replace('−', '-').replace(',', '.')); return Number.isFinite(v) ? v : null; };
export const dd = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '–');
export const dLong = (d) => new Date(d + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
export const dWeek = (d) => new Date(d + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short' });
export const today = () => new Date().toLocaleDateString('sv-SE');
export const monthName = (m, long = true) => { const s = new Date(m + '-15T12:00').toLocaleDateString('nb-NO', { month: long ? 'long' : 'short' }).replace('.', ''); return s; };
export const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
export const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const ini = (t) => (String(t ?? '').replace(/[^A-Za-zÆØÅæøå0-9]/g, '').slice(0, 1) || '•').toUpperCase();
export const rgba = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
export const greet = () => { const h = new Date().getHours(); return h < 10 ? 'God morgen' : h < 18 ? 'Hei' : 'God kveld'; };
export const pctChange = (a, b) => (b ? ((a - b) / b) * 100 : null);

/* ---------- Tilstand ---------- */
export const S = {
  boot: null, summary: null, tx: null, receipts: null, recurring: null, report: null, ai: null, tokens: null,
  ui: { page: 'ov', q: '', cat: '', acc: '', type: '', sel: null, selRc: null, mode: 'month', rap: 'month', hov: null, setTab: 'gen', add: null, msg: {}, month: null },
};
const subs = new Set();
export const onChange = (fn) => subs.add(fn);
export const render = () => subs.forEach((fn) => fn());

let toastTimer;
export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

export async function loadBoot() { S.boot = await api('/bootstrap'); S.ui.month ??= S.boot.month; }
export async function loadSummary() { S.summary = await api('/summary?month=' + (S.ui.month ?? '')); }
export async function loadTx() {
  const u = S.ui, p = new URLSearchParams();
  if (u.q) p.set('q', u.q); if (u.cat) p.set('category', u.cat); if (u.acc) p.set('account', u.acc); if (u.type) p.set('type', u.type);
  S.tx = await api('/transactions?' + p);
}
export async function loadReceipts() { S.receipts = await api('/receipts'); }
export async function loadRecurring() { S.recurring = await api('/recurring'); }
export async function loadReport() { S.report = await api(`/reports?mode=${S.ui.rap}&month=${S.ui.month ?? ''}`); }
export async function loadAi() { try { S.ai = await api('/health/ai'); } catch { S.ai = null; } }

export const catById = (id) => S.boot?.categories.find((c) => c.id === id);
export const cats = (kind) => (S.boot?.categories ?? []).filter((c) => !kind || c.kind === kind);
export const accs = () => S.boot?.accounts ?? [];

/* ---------- Kvitteringsbilder: nedskalering i nettleseren ---------- */
async function toJpeg(file, max, q) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/jpeg', quality: q });
}
// Originalen sendes urørt; i tillegg en ~1600 px JPEG (85 %) til AI-en og et miniatyrbilde.
export async function uploadReceipt(file, accountId) {
  const fd = new FormData();
  fd.append('file', file);
  if (file.type.startsWith('image/')) {
    try { fd.append('scan', await toJpeg(file, 1600, 0.85), 'scan.jpg'); fd.append('thumb', await toJpeg(file, 240, 0.75), 'thumb.jpg'); } catch { /* HEIC o.l. – serveren bruker originalen */ }
  }
  if (accountId) fd.append('accountId', accountId);
  return api('/receipts', { method: 'POST', body: fd });
}

/* ---------- Grafer ---------- */
export const smooth = (pts) => pts.reduce((s, [x, y], i, a) => { if (!i) return `M${x} ${y}`; const [px, py] = a[i - 1]; const cx = (px + x) / 2; return `${s} C${cx} ${py} ${cx} ${y} ${x} ${y}`; }, '');
export function spark(values, w = 96, h = 46) {
  if (!values.length) return { line: '', area: '' };
  const mx = Math.max(...values), mn = Math.min(...values), r = mx - mn || 1;
  const pts = values.map((v, i) => [(i * w) / Math.max(1, values.length - 1), h - 4 - ((v - mn) / r) * (h - 8)]);
  const line = smooth(pts);
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}
export function conic(parts, total, gapDeg = 0, rest = '#24242A') {
  let a = 0;
  const segs = parts.filter((p) => p.value > 0).map((p) => { const a0 = a; a += (p.value / (total || 1)) * 360; return `${p.color} ${a0}deg ${Math.max(a0, a - gapDeg)}deg${gapDeg ? `,#141418 ${a - gapDeg}deg ${a}deg` : ''}`; });
  if (a < 360) segs.push(`${rest} ${a}deg 360deg`);
  return `conic-gradient(${segs.join(',')})`;
}

export const ICONS = {
  ov: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', tx: 'M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7', kv: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  bud: 'M12 3v9h9A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z', fast: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', konto: 'M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M17 13h.01',
  rap: 'M4 20V10M10 20V4M16 20v-7M22 20H2', inn: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4', scan: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 12h8',
  home: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', me: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plus: 'M12 5v14M5 12h14', down: 'M12 3v12M7 10l5 5 5-5M5 21h14', bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7', wallet: 'M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4',
  up: 'M12 19V5M5 12l7-7 7 7', dn: 'M12 5v14M5 12l7 7 7-7', pie: 'M12 3v9h9A9 9 0 1 1 12 3z',
};
export const icon = (k, size = 18, stroke = 'currentColor', w = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;

/* ---------- Logoer og AI-sammendrag (✦) ---------- */
// Logo fra serverens favicon-cache når transaksjonen har et domene, ellers forbokstav i kategorifargen.
export function logo(t, size = 40, radius = 12) {
  const name = t?.description ?? t?.merchant ?? t?.name ?? '', color = t?.color ?? '#A0A0AA';
  const box = `width:${size}px;height:${size}px;border-radius:${radius}px;flex:none`;
  if (t?.domain) return `<span class="m-logo" style="${box}"><img src="/finans/api/logo/${encodeURIComponent(t.domain)}" alt="" loading="lazy" width="${size - 8}" height="${size - 8}"><i style="color:${color}">${esc(ini(name))}</i></span>`;
  return `<span class="m-ini" style="${box};background:${rgba(color, 0.18)};color:${color};font-size:${Math.round(size * 0.4)}px">${esc(ini(name))}</span>`;
}
export const aiLine = (s, cls = 'ai') => (s ? `<span class="${cls}">✦ ${esc(s)}</span>` : '');

// Mat-API-et ligger utenfor /finans/api.
export async function matApi(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const res = await fetch('/mat/api' + path, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `Matplan svarte ${res.status}`);
  return data;
}
ICONS.mat = 'M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6M17 21V3c-2 0-4 2-4 7v4h4';
ICONS.close = 'M6 6l12 12M18 6L6 18';

// Logoer som ikke finnes: vis forbokstaven (CSP stopper inline onerror).
document.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('m-logo')) { img.parentNode.classList.add('err'); img.remove(); } }, true);
