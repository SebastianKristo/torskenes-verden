// Prompt 51 (MEDFAM51): felles hjelpere for Familie og Media (fase 4). Se server/medfam51/index.js for oversikten.
export const MOCK = () => process.env.MOCK_DATA === '1';
export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const GB = 1024 ** 3, MB = 1024 ** 2, TB = 1024 ** 4;
export const TZ = 'Europe/Oslo';

export const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const num = (v, lo, hi) => { const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
export const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
export const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status);
export const iso = (t) => (t ? new Date(t).toISOString() : null);
export const hm = (t) => new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
export const ymd = (t = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(t));
const nb1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
export const sizeText = (b) => (!b ? '0 GB' : b < GB ? `${Math.max(1, Math.round(b / MB))} MB` : b >= TB ? `${nb1(b / TB)} TB` : `${nb1(b / GB)} GB`);
export const minText = (m) => { m = Math.max(0, Math.round(m)); return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m / 60} t`; };
export const dayText = (t, now = Date.now()) => {
  const d = ymd(t), today = ymd(now), tomorrow = ymd(now + DAY);
  const wd = new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(t));
  return d === today ? 'i dag' : d === tomorrow ? 'i morgen' : wd;
};
/** Oslo-tid «YYYY-MM-DDTHH:MM» eller ISO → ms. */
export function parseTime(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return osloAt(s, '00:00');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/);
  if (m) return osloAt(m[1], m[2]);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
/** Klokkeslett i Oslo på en dato → ms (riktig sommer-/vintertid). */
export function osloAt(date, hhmm = '00:00') {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const local = (t) => Date.parse(new Date(t).toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T') + 'Z');
  let t = guess - (local(guess) - guess);
  t -= local(t) - guess; // andre runde rundt tidsskiftet
  return t;
}

/* ---- Nett: Bazarr og Audiobookshelf (egen fetch så tester kan bytte den ut) ---- */
let fx = null;
/** Bare for tester: bytt ut fetch for Bazarr og Audiobookshelf. */
export const _setMedfam51Fetch = (fn) => { fx = fn; };
export async function getJson(url, { method = 'GET', headers = {}, body: b, timeout = 10_000, raw = false } = {}) {
  const r = await (fx ?? fetch)(url, { method, headers: { Accept: 'application/json', ...headers }, body: b, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (raw) return r;
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`nøkkelen ble avvist (${r.status})`), { status: 502, upstream: r.status });
  if (!r.ok) throw Object.assign(new Error(`svarte ${r.status}`), { status: r.status === 404 ? 404 : 502, upstream: r.status });
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}
/** Feiltekst uten nøkler/adresser med token. */
export const errText = (e) => String(e?.cause?.code === 'ECONNREFUSED' ? 'avviste tilkoblingen' : e?.name === 'TimeoutError' ? 'svarte ikke i tide' : e?.message ?? e).replace(/(token|apikey|api_key|key)=[^&\s]+/gi, '$1=***').slice(0, 200);

/** Adresse til en LAN-tjeneste fra miljøet (http/https, ingen bruker:passord i adressen). */
export function serviceUrl(envName) {
  const v = String(process.env[envName] ?? '').trim().replace(/\/+$/, '');
  if (!v) return '';
  try { const u = new URL(v); if (!/^https?:$/.test(u.protocol) || u.username || u.password) return ''; return v; } catch { return ''; }
}
