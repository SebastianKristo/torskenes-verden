// Komprimering av JSON-svar fra /api og /finans/api (brotli eller gzip etter Accept-Encoding).
//
// Mange API-svar er store (transaksjoner 350 KB per side, kalenderen 60–220 KB, Skjold-etiketter 365 KB), og på lokalt
// nett er det ingen Cloudflare foran som komprimerer. Bare JSON komprimeres: hendelsesstrømmer (text/event-stream),
// WebSocket (håndteres utenfor Hono), bilder, PDF og andre binære svar går urørt gjennom, det samme gjør svar som
// allerede er komprimert, HEAD, 204/206/304 og svar med «Cache-Control: no-transform». Komprimeringen kjører i
// libuv-trådene (asynkron zlib), så hendelsesløkka ikke blokkeres av store svar.
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';

const br = promisify(brotliCompress);
const gz = promisify(gzip);
export const MIN_BYTES = 1024;
// Kvalitet 5 gir nesten like små svar som standard (11) for en brøkdel av tiden; viktigst er at svaret går fort.
const BR_OPTS = { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT } };
const GZ_OPTS = { level: 6 };
const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json\b/i;
const NO_TRANSFORM = /(?:^|,)\s*no-transform\s*(?:,|$)/i;
const VARY_AE = /(?:^|,)\s*accept-encoding\s*(?:,|$)/i;

/** Accept-Encoding → 'br' | 'gzip' | null (q-verdier respekteres; br foretrekkes ved lik q). */
export function pickEncoding(header) {
  if (!header) return null;
  const q = new Map();
  for (const part of String(header).split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const qp = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const v = qp ? Number(qp.slice(2)) : 1;
    q.set(name, Number.isFinite(v) ? v : 0);
  }
  const of = (e) => (q.has(e) ? q.get(e) : q.get('*') ?? 0);
  const b = of('br'), g = of('gzip');
  if (b <= 0 && g <= 0) return null;
  return b >= g ? 'br' : 'gzip';
}

/** Hono-mellomvare. */
export async function compressJson(c, next) {
  await next();
  const res = c.res;
  if (c.req.method === 'HEAD' || !res?.body || res.status < 200 || res.status === 204 || res.status === 206 || res.status === 304) return;
  if (res.headers.has('content-encoding') || !JSON_TYPE.test(res.headers.get('content-type') ?? '')) return;
  if (NO_TRANSFORM.test(res.headers.get('cache-control') ?? '')) return;
  const vary = res.headers.get('vary');
  if (vary !== '*' && !(vary && VARY_AE.test(vary))) c.header('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
  const enc = pickEncoding(c.req.header('accept-encoding'));
  if (!enc) return;
  const len = Number(res.headers.get('content-length'));
  if (len && len < MIN_BYTES) return;
  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.length < MIN_BYTES) { c.res = new Response(raw, res); return; }
  const out = enc === 'br' ? await br(raw, BR_OPTS) : await gz(raw, GZ_OPTS);
  c.res = new Response(out, res);
  c.res.headers.delete('content-length');
  c.res.headers.set('content-encoding', enc);
  const etag = c.res.headers.get('etag');
  if (etag && !etag.startsWith('W/')) c.res.headers.set('etag', `W/${etag}`);
}
