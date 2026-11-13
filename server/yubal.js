// Musikk i Media (#/media/musikk). Snakker med yubal (github.com/guillevc/yubal) i arr-containeren, som laster ned album,
// spillelister og sanger fra YouTube Music med metadata, omslag og tekster til musikkbiblioteket (Navidrome).
//
// yubal har ingen innlogging, så denne proxyen er eneste vei inn fra nettleseren og appene. Adressen (yubal_url, env
// YUBAL_URL) settes av admin under Innstillinger → Integrasjoner → Musikk (yubal), og sendes aldri til klientene.
// Tilgang som resten av Media (mediaAllowed43). Alt valideres her før det sendes videre.
//
//   GET    /api/media/yubal/status                    → {configured, format, scheduler:{enabled,running,next_run_at,timezone,cron_expression,subscription_counts}|null}
//   GET    /api/media/yubal/info?url=                 → {configured, info:{title,artist,year,track_count,kind,thumbnail,audio_codec,audio_bitrate,url}}
//   GET    /api/media/yubal/jobs                      → {configured, jobs:[Job] nyeste først}
//   POST   /api/media/yubal/jobs                      {url, max_items?} → {id}
//   POST   /api/media/yubal/jobs/:id/cancel
//   DELETE /api/media/yubal/jobs/:id                  (bare ferdige)
//   DELETE /api/media/yubal/jobs                      → {cleared}
//   GET    /api/media/yubal/subscriptions             → {configured, items:[…]}
//   POST   /api/media/yubal/subscriptions             {url, max_items?}
//   PATCH  /api/media/yubal/subscriptions/:id         {enabled}
//   DELETE /api/media/yubal/subscriptions/:id
//   POST   /api/media/yubal/subscriptions/:id/sync    → {job_ids}
//   POST   /api/media/yubal/subscriptions/sync        → {job_ids}
//   GET    /api/media/yubal/subscriptions/:id/tracks  → {configured, tracks:[{title,artist,duration,status}], total, available, summary, message?}
//   GET    /api/media/yubal/bilde?u=…                 → omslag fra YouTube sine bildeverter (SSRF-vern, cache)
//
// Format og kvalitet er felles for hele yubal-containeren (YUBAL_AUDIO_FORMAT / YUBAL_AUDIO_QUALITY), ikke per jobb.
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { mediaAllowed43 } from './media43.js';
import { cfg } from './settings.js';
import { guardedGet46 } from './gphoto46.js';

const IKKE_SATT = 'Musikk er ikke satt opp. Innstillinger → Integrasjoner → Musikk (yubal).';
const BARE_YT = 'Bare lenker fra music.youtube.com, youtube.com eller youtu.be.';
const KO_FULL = 'Køen i yubal er full. Vent til noe er ferdig, og prøv igjen.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YT_HOST = new Set(['music.youtube.com', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const BILDE_HOST = /^(i\d?\.ytimg\.com|lh\d\.googleusercontent\.com|yt\d\.ggpht\.com|yt\d\.googleusercontent\.com)$/i;
const STATUS = new Set(['pending', 'fetching_info', 'downloading', 'importing', 'completed', 'failed', 'cancelled']);
const KIND = new Set(['album', 'playlist', 'track']);
const FORMAT = new Set(['opus', 'mp3', 'm4a']);

let fetchImpl = (u, i) => fetch(u, i);
/** Bare for tester. */
export function _setFetchYubal(f) { fetchImpl = f ?? ((u, i) => fetch(u, i)); }

export function yubalConf() {
  const url = String(cfg('yubal_url') ?? '').trim().replace(/\/+$/, '');
  return { url, on: /^https?:\/\/\S+$/.test(url) };
}

class YubalFeil extends Error {
  constructor(msg, status = 502) { super(msg); this.status = status; }
}
const tekst = (v, n = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '');
/** Feilteksten fra yubal: {error, message}, {detail:"…"} eller FastAPI-validering {detail:[{msg}]}. */
function feilFra(d) {
  if (!d || typeof d !== 'object') return '';
  if (typeof d.detail === 'string') return tekst(d.detail, 300);
  if (Array.isArray(d.detail)) return tekst(d.detail.map((x) => x?.msg).filter(Boolean).join('; '), 300);
  return tekst(d.message, 300);
}

/** Kall mot yubal. Nettverksfeil blir 502 med norsk tekst; 409 «køen er full» blir norsk. Adressen havner aldri i feilen. */
export async function yubalKall(sti, { method = 'GET', json, timeout = 10_000 } = {}) {
  const c = yubalConf();
  if (!c.on) throw new YubalFeil(IKKE_SATT, 503);
  let r;
  try {
    r = await fetchImpl(`${c.url}/api${sti}`, {
      method,
      headers: { Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}) },
      ...(json ? { body: JSON.stringify(json) } : {}),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new YubalFeil(e?.name === 'TimeoutError' ? 'yubal svarte ikke i tide' : `Får ikke kontakt med yubal (${e?.cause?.code ?? e?.name ?? 'feil'})`);
  }
  if (r.status === 204) return {};
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const f = feilFra(d), kode = tekst(d?.error, 60);
    let msg;
    if (r.status === 409 && (kode === 'queue_full' || /queue is full/i.test(f))) msg = KO_FULL;
    else if (r.status === 409) msg = /already finished/i.test(f) ? 'Jobben er allerede ferdig.' : /running or queued/i.test(f) ? 'Jobben kjører eller venter, og kan ikke fjernes ennå.' : `yubal avviste forespørselen${f ? `: ${f}` : ''}`;
    else if (r.status === 404) msg = /subscription/i.test(f) ? 'Fant ikke spillelisten i yubal.' : /job/i.test(f) ? 'Fant ikke jobben i yubal.' : 'Fant ikke innholdet hos YouTube Music.';
    else if (r.status === 422 || r.status === 400) msg = `yubal godtok ikke lenken${f ? `: ${f}` : ''}`;
    else if (r.status === 401) msg = 'YouTube Music krever innlogging for dette innholdet (cookies i yubal).';
    else msg = `yubal svarte ${r.status}${f ? `: ${f}` : ''}`;
    throw Object.assign(new YubalFeil(msg, r.status >= 400 && r.status < 500 ? r.status : 502), { yubalStatus: r.status });
  }
  return d ?? {};
}

/** YouTube-lenke (music.youtube.com, youtube.com, www/m.youtube.com, youtu.be) → normalisert https-adresse, ellers null. */
export function ytLenke(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 2000) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port || !YT_HOST.has(u.hostname.toLowerCase())) return null;
  u.protocol = 'https:'; u.hash = '';
  return u.href;
}
function lenke(v) { const u = ytLenke(v); if (!u) throw new YubalFeil(BARE_YT, 400); return u; }
/** max_items: heltall 1–10000, eller utelatt (null/''/undefined). */
export function maxItems(v) {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? +v.trim() : v;
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new YubalFeil('«Antall spor» må være et helt tall fra 1 til 10000.', 400);
  return n;
}
const idOf = (c) => { const id = c.req.param('id'); if (!UUID.test(id)) throw new YubalFeil('Ugyldig id', 400); return id.toLowerCase(); };

/* ---------------- Svarene til klientene ---------------- */

function bildeOk(v) {
  let u;
  try { u = new URL(String(v ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !BILDE_HOST.test(u.hostname) || u.href.length > 1000) return null;
  return u.href;
}
/** Adressen klientene henter omslaget fra (vår bildeproxy), eller null. */
export function bildeUrl(v) { const u = bildeOk(v); return u ? `/api/media/yubal/bilde?u=${encodeURIComponent(u)}` : null; }
const tall = (v, max = 1e9) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(0, Math.min(max, Math.round(+v))) : null);
const tid = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

export function infoUt(x) {
  if (!x || typeof x !== 'object') return null;
  return {
    title: tekst(x.title) || 'Uten tittel', artist: tekst(x.artist), year: tall(x.year, 3000), track_count: tall(x.track_count, 100000),
    kind: KIND.has(x.kind) ? x.kind : 'playlist', thumbnail: bildeUrl(x.thumbnail_url), audio_codec: tekst(x.audio_codec, 20) || null,
    audio_bitrate: tall(x.audio_bitrate, 10000), url: ytLenke(x.url),
  };
}
function statsUt(s) {
  if (!s || typeof s !== 'object') return { success: 0, failed: 0, skipped: 0, existing: 0 };
  const r = s.skipped_by_reason && typeof s.skipped_by_reason === 'object' ? s.skipped_by_reason : {};
  const skipped = Object.values(r).reduce((a, n) => a + (tall(n) ?? 0), 0) || (tall(s.skipped) ?? 0);
  return { success: tall(s.success) ?? 0, failed: tall(s.failed) ?? 0, skipped, existing: tall(r.file_exists) ?? 0 };
}
export function jobUt(j) {
  if (!j || typeof j !== 'object' || !UUID.test(String(j.id ?? ''))) return null;
  return {
    id: String(j.id).toLowerCase(), url: ytLenke(j.url), audio_format: FORMAT.has(j.audio_format) ? j.audio_format : null,
    max_items: tall(j.max_items, 10000), subscription_id: UUID.test(String(j.subscription_id ?? '')) ? String(j.subscription_id).toLowerCase() : null,
    source: j.source === 'scheduler' ? 'scheduler' : 'manual', status: STATUS.has(j.status) ? j.status : 'pending',
    progress: Math.max(0, Math.min(100, +j.progress || 0)), content_info: infoUt(j.content_info), download_stats: statsUt(j.download_stats),
    created_at: tid(j.created_at), started_at: tid(j.started_at), completed_at: tid(j.completed_at),
  };
}
export function subUt(s) {
  if (!s || typeof s !== 'object' || !UUID.test(String(s.id ?? ''))) return null;
  return {
    id: String(s.id).toLowerCase(), type: tekst(s.type, 30) || 'playlist', url: ytLenke(s.url), name: tekst(s.name) || 'Spilleliste',
    enabled: s.enabled !== false, max_items: tall(s.max_items, 10000), thumbnail: bildeUrl(s.thumbnail_url),
    created_at: tid(s.created_at), last_synced_at: tid(s.last_synced_at),
  };
}
const jobberUt = (d) => (Array.isArray(d?.jobs) ? d.jobs : []).map(jobUt).filter(Boolean).reverse(); // yubal: eldst først
const subsUt = (d) => (Array.isArray(d?.items) ? d.items : []).map(subUt).filter(Boolean);

/* ---------------- Test tilkobling ---------------- */

const klokke = (iso) => { try { return new Date(iso).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
export async function testYubal() {
  const c = yubalConf();
  if (!c.on) return { ok: false, code: 'missing', message: 'Mangler adresse' };
  const t0 = Date.now();
  try {
    const h = await yubalKall('/health', { timeout: 6000 });
    if (h?.status !== 'healthy') return { ok: false, message: `yubal svarer, men er ikke frisk (${tekst(h?.status, 40) || 'ukjent'})` };
    const ms = Date.now() - t0;
    const s = await yubalKall('/scheduler', { timeout: 6000 }).catch(() => null);
    const plan = s ? (s.enabled && s.next_run_at ? ` · neste automatiske synk ${klokke(s.next_run_at)}` : ' · automatisk synk er av') : '';
    return { ok: true, message: `✓ yubal svarte på ${ms} ms${plan}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/* ---------------- Sanger i en spilleliste du følger ---------------- */

const SPOR_TTL = 60_000, SPOR_ANTALL = 100;
const sporCache = new Map(); // yubal-url|id → {at, p}
/** Bare for tester. */
export function _resetYubal() { sporCache.clear(); bilder.clear(); }

const SPOR_STATUS = { downloaded: 'downloaded', success: 'downloaded', ok: 'downloaded', completed: 'downloaded', skipped: 'skipped', file_exists: 'skipped', exists: 'skipped', failed: 'failed', error: 'failed', pending: 'pending' };
function varighet(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  const m = tekst(v, 20).match(/^(?:(\d+):)?(\d+):(\d{2})$/);
  return m ? (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] : null;
}
/** Sporlista til abonnementet: yubal har ikke et eget endepunkt, så den bygges fra /api/info og de siste jobbene. */
async function byggSpor(id) {
  const [subs, jobber] = await Promise.all([yubalKall('/subscriptions'), yubalKall('/jobs')]);
  const sub = subsUt(subs).find((s) => s.id === id);
  if (!sub) throw new YubalFeil('Fant ikke spillelisten i yubal.', 404);
  const J = jobberUt(jobber).filter((j) => j.subscription_id === id);
  const siste = J.find((j) => ['completed', 'failed', 'cancelled'].includes(j.status)) ?? null;
  const st = siste?.download_stats ?? { success: 0, failed: 0, skipped: 0, existing: 0 };
  const summary = { success: st.success, failed: st.failed, skipped: st.skipped, existing: st.existing, total: st.success + st.failed + st.skipped, last_status: siste?.status ?? null, last_at: siste?.completed_at ?? sub.last_synced_at, running: J.some((j) => !['completed', 'failed', 'cancelled'].includes(j.status)) };
  // /api/info gir i dag bare ContentInfo (tittel, antall spor …). Gir en nyere yubal en sporliste (tracks/entries), brukes den.
  let rå = null, info = null;
  if (sub.url) {
    try { rå = await yubalKall(`/info?url=${encodeURIComponent(sub.url)}`, { timeout: 15_000 }); info = infoUt(rå); } catch { /* oppsummeringen holder */ }
  }
  const liste = Array.isArray(rå?.tracks) ? rå.tracks : Array.isArray(rå?.entries) ? rå.entries : null;
  const total = info?.track_count ?? (liste ? liste.length : summary.total || null);
  if (!liste) return { tracks: [], total, available: false, summary, message: 'Sanglista er ikke tilgjengelig fra yubal' };
  const grense = sub.max_items ?? Infinity;
  // Uten status per sang: bare når siste synk ga ett entydig utfall kan det settes på sangene den dekket.
  const entydig = siste ? (st.failed === 0 && st.skipped === 0 && st.success > 0 ? 'downloaded' : st.success === 0 && st.failed === 0 && st.skipped > 0 ? 'skipped' : st.success === 0 && st.skipped === 0 && st.failed > 0 ? 'failed' : null) : null;
  const tracks = liste.slice(0, 2000).filter((t) => t && typeof t === 'object').map((t, i) => {
    const egen = SPOR_STATUS[String(t.status ?? t.state ?? '').toLowerCase()];
    const dekket = siste && i < Math.min(grense, summary.total || grense);
    const status = egen ?? (i >= grense || !siste ? 'pending' : dekket ? entydig : 'pending');
    const artist = Array.isArray(t.artists) ? t.artists.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ') : t.artist;
    return { title: tekst(t.title) || 'Uten tittel', artist: tekst(artist), duration: varighet(t.duration ?? t.duration_seconds), status: status ?? null };
  });
  return { tracks, total: total ?? tracks.length, available: true, summary };
}
function spor(id) {
  const k = `${yubalConf().url}|${id}`, c = sporCache.get(k);
  if (c && Date.now() - c.at < SPOR_TTL) return c.p;
  const p = byggSpor(id);
  sporCache.set(k, { at: Date.now(), p });
  p.catch(() => { if (sporCache.get(k)?.p === p) sporCache.delete(k); });
  while (sporCache.size > SPOR_ANTALL) sporCache.delete(sporCache.keys().next().value);
  return p;
}
const glemSpor = () => sporCache.clear();

/* ---------------- Omslag ---------------- */

const BILDE_MAX = 5 * 1024 * 1024, BILDE_TTL = 24 * 3600_000, BILDE_ANTALL = 300;
const BILDE_TYPE = /^image\/(jpeg|png|webp|avif|gif)\b/i;
const bilder = new Map(); // url → {buf, type, at}
const standardHent = (url) => guardedGet46(url, { hostOk: (u) => bildeOk(u.href) != null, maxBytes: BILDE_MAX, accept: 'image/avif,image/webp,image/jpeg,image/png,image/*' });
let bildeHent = standardHent;
/** Bare for tester: (url) → {buf, type}. */
export function _setBildeYubal(f) { bildeHent = f ?? standardHent; }
async function bilde(v) {
  const url = bildeOk(v);
  if (!url) throw new YubalFeil('Bare omslag fra YouTube kan hentes', 400);
  const c = bilder.get(url);
  if (c && Date.now() - c.at < BILDE_TTL) { bilder.delete(url); bilder.set(url, c); return c; }
  let r;
  try { r = await bildeHent(url); } catch { throw new YubalFeil('Fikk ikke hentet omslaget', 502); }
  const type = String(r?.type ?? '').split(';')[0].trim().toLowerCase();
  if (!BILDE_TYPE.test(type) || !r.buf?.length) throw new YubalFeil('Svaret var ikke et bilde', 502);
  const ny = { buf: r.buf, type, at: Date.now() };
  bilder.set(url, ny);
  while (bilder.size > BILDE_ANTALL) bilder.delete(bilder.keys().next().value);
  return ny;
}

/* ---------------- Ruter ---------------- */

const H = (fn, ok = 200) => async (c) => {
  try { return c.json(await fn(c), ok); } catch (e) { return c.json({ error: e.message, ...(e.status === 503 ? { configured: false } : {}) }, e.status ?? 502); }
};
const guard = async (c, next) => {
  if (!mediaAllowed43(c.get('user'))) return c.json({ error: 'Du har ikke tilgang til Media. Be en administrator om tilgang.', restricted: true }, 403);
  await next();
};
const G = [authOrToken, guard];
const jb = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const ikkeSatt = (ekstra = {}) => ({ configured: false, message: IKKE_SATT, ...ekstra });

export const yubalApi = new Hono();
yubalApi.get('/status', ...G, H(async () => {
  if (!yubalConf().on) return ikkeSatt();
  const [s, j] = await Promise.all([yubalKall('/scheduler').catch(() => null), yubalKall('/jobs')]);
  const J = jobberUt(j);
  const scheduler = s && typeof s === 'object' ? {
    enabled: s.enabled === true, running: s.running === true, next_run_at: tid(s.next_run_at), timezone: tekst(s.timezone, 60) || null,
    cron_expression: tekst(s.cron_expression, 60) || null,
    subscription_counts: { total: tall(s.subscription_counts?.total) ?? 0, enabled: tall(s.subscription_counts?.enabled) ?? 0 },
  } : null;
  return { configured: true, format: J.find((x) => x.audio_format)?.audio_format ?? 'm4a', scheduler };
}));
yubalApi.get('/info', ...G, H(async (c) => {
  const url = lenke(c.req.query('url'));
  if (!yubalConf().on) return ikkeSatt();
  const info = infoUt(await yubalKall(`/info?url=${encodeURIComponent(url)}`, { timeout: 20_000 }));
  if (!info) throw new YubalFeil('yubal fant ikke noe på lenken', 502);
  return { configured: true, info: { ...info, url: info.url ?? url } };
}));
yubalApi.get('/jobs', ...G, H(async () => {
  if (!yubalConf().on) return ikkeSatt({ jobs: [] });
  return { configured: true, jobs: jobberUt(await yubalKall('/jobs')) };
}));
yubalApi.post('/jobs', ...G, H(async (c) => {
  const b = await jb(c), url = lenke(b.url), max = maxItems(b.max_items);
  const d = await yubalKall('/jobs', { method: 'POST', json: { url, ...(max ? { max_items: max } : {}) } });
  return { id: UUID.test(String(d?.id ?? '')) ? String(d.id).toLowerCase() : null };
}, 201));
yubalApi.post('/jobs/:id/cancel', ...G, H(async (c) => { await yubalKall(`/jobs/${idOf(c)}/cancel`, { method: 'POST' }); return { ok: true }; }));
yubalApi.delete('/jobs/:id', ...G, H(async (c) => { await yubalKall(`/jobs/${idOf(c)}`, { method: 'DELETE' }); return { ok: true }; }));
yubalApi.delete('/jobs', ...G, H(async () => { const d = await yubalKall('/jobs', { method: 'DELETE' }); return { cleared: tall(d?.cleared) ?? 0 }; }));

yubalApi.get('/subscriptions', ...G, H(async () => {
  if (!yubalConf().on) return ikkeSatt({ items: [] });
  return { configured: true, items: subsUt(await yubalKall('/subscriptions')) };
}));
yubalApi.post('/subscriptions', ...G, H(async (c) => {
  const b = await jb(c), url = lenke(b.url), max = maxItems(b.max_items);
  if (!/[?&]list=/.test(url)) throw new YubalFeil('Bare spillelister kan følges.', 400);
  const s = subUt(await yubalKall('/subscriptions', { method: 'POST', json: { url, ...(max ? { max_items: max } : {}) } }));
  glemSpor();
  return { item: s };
}, 201));
// «sync» må stå før /:id-rutene.
yubalApi.post('/subscriptions/sync', ...G, H(async () => {
  const d = await yubalKall('/subscriptions/sync', { method: 'POST' });
  glemSpor();
  return { job_ids: (Array.isArray(d?.job_ids) ? d.job_ids : []).filter((x) => UUID.test(String(x))) };
}));
yubalApi.patch('/subscriptions/:id', ...G, H(async (c) => {
  const id = idOf(c), b = await jb(c);
  if (typeof b.enabled !== 'boolean') throw new YubalFeil('«enabled» må være sann eller usann', 400);
  const s = subUt(await yubalKall(`/subscriptions/${id}`, { method: 'PATCH', json: { enabled: b.enabled } }));
  glemSpor();
  return { item: s };
}));
yubalApi.delete('/subscriptions/:id', ...G, H(async (c) => { await yubalKall(`/subscriptions/${idOf(c)}`, { method: 'DELETE' }); glemSpor(); return { ok: true }; }));
yubalApi.post('/subscriptions/:id/sync', ...G, H(async (c) => {
  const d = await yubalKall(`/subscriptions/${idOf(c)}/sync`, { method: 'POST' });
  glemSpor();
  return { job_ids: (Array.isArray(d?.job_ids) ? d.job_ids : []).filter((x) => UUID.test(String(x))) };
}));
yubalApi.get('/subscriptions/:id/tracks', ...G, H(async (c) => {
  const id = idOf(c);
  if (!yubalConf().on) return ikkeSatt({ tracks: [], total: 0, available: false });
  return { configured: true, ...(await spor(id)) };
}));
yubalApi.get('/bilde', ...G, async (c) => {
  try {
    const b = await bilde(c.req.query('u'));
    return new Response(b.buf, { headers: { 'Content-Type': b.type, 'Content-Length': String(b.buf.length), 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch (e) { return c.json({ error: e.message }, e.status ?? 502); }
});
