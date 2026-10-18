// Felles for desktop og mobil: API, formatering, tilstand og små grafhjelpere.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// 401: sjekk at økten faktisk er borte (ikke bare manglende tilgang til ett endepunkt). På mobil vises Papir-innloggingen
// i appen (mobile-gate.js); på desktop sendes brukeren til /login som før. Feilen vises ikke som en toast.
const mobileUi = () => !new URLSearchParams(location.search).has('desktop') && (matchMedia('(max-width: 899px)').matches || (matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1100px)').matches));
let gateShown = false;
async function authLost() {
  const st = await fetch('/api/me', { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
  if (st !== 401) { const e = new Error('Ingen tilgang'); e.status = 401; throw e; }
  if (!gateShown) {
    gateShown = true;
    if (mobileUi()) import('./mobile-gate.js').then((g) => g.showLogin()).catch(() => { location.href = '/login?next=/finans/'; });
    else location.href = '/login?next=/finans/';
  }
  const e = new Error('Ikke innlogget'); e.auth = true; throw e;
}

export async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const res = await fetch('/finans/api' + path, init);
  if (res.status === 401) await authLost();
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
// original:false (mobilvalget «Lagre originalbildet» av) sender bare den nedskalerte JPEG-en.
export async function uploadReceipt(file, accountId, { original = true } = {}) {
  const fd = new FormData();
  let scan = null, thumb = null;
  if (file.type.startsWith('image/')) {
    try { scan = await toJpeg(file, 1600, 0.85); thumb = await toJpeg(file, 240, 0.75); } catch { /* HEIC o.l. – serveren bruker originalen */ }
  }
  if (!original && scan) fd.append('file', scan, (file.name || 'kvittering').replace(/\.\w+$/, '') + '.jpg');
  else { fd.append('file', file); if (scan) fd.append('scan', scan, 'scan.jpg'); }
  if (thumb) fd.append('thumb', thumb, 'thumb.jpg');
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
  if (!res.ok) throw new Error(data?.error || `Mat svarte ${res.status}`);
  return data;
}
// Domene-API-et (Homelab) ligger også utenfor /finans/api.
export async function domApi(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const res = await fetch('/domains/api' + path, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `Domener svarte ${res.status}`);
  return data;
}
Object.assign(ICONS, {
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  sub: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  dir: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  finn: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  key: 'M15.5 7.5l3 3L22 7l-3-3M15.5 7.5L19 4M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM11.4 11.6L15.5 7.5',
  look: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.9-.8-1.3-.8-2.2 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.3-4-7.8-9-7.8zM7.5 11.5h.01M10.5 7.5h.01M15 8h.01',
  cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  srv: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  db: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  traf: 'M4 20V14M9 20V9M14 20V12M19 20V5M3 20h18', yt: 'M12 14l4-4M3.5 18a9 9 0 1 1 17 0',
  req: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4', dl: 'M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3M12 12v9M8 17l4 4 4-4',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6', img: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01', file: 'M14 3H6v18h12V7zM14 3v4h4',
});
ICONS.bes = ICONS.users; ICONS.sik = ICONS.shield;
ICONS.mat = 'M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6M17 21V3c-2 0-4 2-4 7v4h4';
ICONS.close = 'M6 6l12 12M18 6L6 18';

// Logoer som ikke finnes: vis forbokstaven (CSP stopper inline onerror).
document.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && ['m-logo', 'hlic', 'trk-badge'].some((c) => img.parentNode?.classList?.contains(c))) { img.parentNode.classList.add('err'); img.remove(); } }, true);

// Mobil (prompt 06): Homelab-fanen, Mer-siden, redigering og originaler.
Object.assign(ICONS, {
  hlhome: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', fin: 'M4 19V5M4 19h16M8 15l4-4 3 3 5-6',
  ai: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z', mer: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  aks: 'M3 17l6-6 4 4 8-8M15 7h6v6', imp: 'M12 3v12M7 10l5 5 5-5M4 21h16', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6', chev: 'M15 5l-7 7 7 7', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', bank: 'M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18',
  hist: 'M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4', bus: 'M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 11h16M8 21l2-3M16 21l-2-3',
  cat: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', rule: 'M4 6h16M4 12h10M4 18h6', backup: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
  kv2: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', fast2: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', konto2: 'M3 7h18v12H3zM3 11h18M7 15h3',
  sub2: 'M4 7h16v12H4zM8 3v4M16 3v4M4 11h16', dir2: 'M3 7l2-3h5l2 3h9v12H3zM3 7h18', finn2: 'M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
});

// Homelab-API-et (/api) brukes av mobilens Homelab-side. Gir null i stedet for å kaste ved 404 (eldre server).
export async function hlApi(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
  const res = await fetch('/api' + path, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) { const e = new Error(data?.error || `Homelab svarte ${res.status}`); e.status = res.status; throw e; }
  return data;
}

// Egne navn på menypunkter fra FinansHub → Innstillinger → Sidemeny. Navnene lagres med desktop-ID-ene,
// så mobilens skjermnavn oversettes først.
const NAV_IDS = { hjem: 'ov', home: 'ov', liste: 'tx', list: 'tx', budsjett: 'bud', sok: 'ai' };
export const navName = (id, def) => (S.navLabels ?? S.boot?.navLabels ?? {})[NAV_IDS[id] ?? id] || def;
