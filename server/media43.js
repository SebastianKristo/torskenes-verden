// Prompt 43 (SERVER43): Media – Sonarr, Radarr, qBittorrent og Prowlarr (claude-code-media-arr.md, Media.dc.html 2a).
// Serveren er proxy: tjenestenøklene (API-nøkler, qBittorrent-passord, Jellyfin/Plex-token) er serverhemmeligheter, settes bare
// av admin (Innstillinger → Integrasjoner → MEDIA) og sendes aldri til klienten. Med MOCK_DATA=1 og en tjeneste uten oppsett
// brukes den innebygde demoen (media43-mock.js) bak samme kode.
//
// Tilgang: sesjon eller app-token (skriving krever finance:write) + modulen «media» (admin alltid, andre når admin gir tilgang,
// PUT /api/media/access). Bare admin kan slette, endre profiler/overvåking, legge til indeksere og velge bort filer.
// Ruter under /api/media (svarformene står i rapporten for prompt 43 og i kommentarene ved hver rute).
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { kv, OWNER } from './db.js';
import { userCfg, userCfgSet } from './settings.js';
import { authOrToken } from './mobile.js';
import { isAdmin, listUsers, userInfo, isLan } from './auth.js';
import { notifyUser } from './notify.js';
import { addEventSource } from './calendar.js';
import { mockFetch43, mockArt43 } from './media43-mock.js';

const MOCK = () => process.env.MOCK_DATA === '1';
const TZ = 'Europe/Oslo';
const GB = 1024 ** 3, MB = 1024 ** 2, TB = 1024 ** 4;

/* ---------------- Oppsett ---------------- */

export const SERVICES43 = {
  sonarr: { name: 'Sonarr', url: 'sonarr_url', key: 'sonarr_key', missing: 'API-nøkkel', port: 8989 },
  radarr: { name: 'Radarr', url: 'radarr_url', key: 'radarr_key', missing: 'API-nøkkel', port: 7878 },
  qbit: { name: 'qBittorrent', url: 'qbit_url', key: 'qbit_pass', user: 'qbit_user', missing: 'passord', port: 8080 },
  prowlarr: { name: 'Prowlarr', url: 'prowlarr_url', key: 'prowlarr_key', missing: 'API-nøkkel', port: 9696 },
  jellyfin: { name: 'Jellyfin', url: 'jf_url', key: 'jf_key', user: 'jf_user', missing: 'API-nøkkel', port: 8096 },
  plex: { name: 'Plex', url: 'plex_url', key: 'plex_token', missing: 'Plex-token', port: 32400 },
};
const val = (k, vals, who = OWNER) => String((vals && k in vals ? vals[k] : userCfg(who, k)) ?? '').trim();
/* Prompt 44 (SERVER44) – den ekte årsaken til «ikke logget inn» i Media på mobil: Sonarr, Radarr, Plex og Jellyfin er «personlige»
   integrasjoner (ISO2). Innstillinger → Integrasjoner viser verdiene til den som er innlogget (lagret per bruker), mens Media leste
   bare eierens (OWNER). Har en annen administrator lagt inn nøklene, eller er man innlogget med en annen konto på mobilen enn på
   web, sa Innstillinger «Koblet til» mens Media sa «Ikke satt opp». Nå er det én kilde for alle med tilgang: serverens oppsett =
   eierens verdier, ellers første administrator som har lagt inn adresse + nøkkel for tjenesten (source:'admin'). */
const ADMIN_SRC_TTL = 30_000;
let adminSrc = { at: 0, map: new Map() };
/** Hvem sitt oppsett Media bruker for tjenesten: OWNER, ellers første admin med adresse + nøkkel. → {user, source:'owner'|'admin'} */
export function mediaSource43(id) {
  const d = SERVICES43[id];
  if (val(d.url) && val(d.key)) return { user: OWNER, source: 'owner' };
  if (!d || !['sonarr', 'radarr', 'jellyfin', 'plex'].includes(id)) return { user: OWNER, source: 'owner' };
  if (Date.now() - adminSrc.at > ADMIN_SRC_TTL) adminSrc = { at: Date.now(), map: new Map() };
  if (!adminSrc.map.has(id)) {
    const u = listUsers().find((x) => x.role === 'admin' && x.id !== OWNER && val(d.url, null, x.id) && val(d.key, null, x.id) && userCfgSet(x.id, d.key));
    adminSrc.map.set(id, u?.id ?? null);
  }
  const u = adminSrc.map.get(id);
  return u ? { user: u, source: 'admin' } : { user: OWNER, source: 'owner' };
}
export const _resetMediaSource43 = () => { adminSrc = { at: 0, map: new Map() }; };
/* Prompt 44: steder («Hjemme», «Hytta») med hver sin Sonarr/Radarr/qBittorrent/Prowlarr. Valget gjelder hele forespørselen
   (?server= eller brukerens lagrede valg), satt av media44.js med runMediaSite43(). Standardstedet er oppsettet over. */
const siteCtx = new AsyncLocalStorage();
export const runMediaSite43 = (site, fn) => siteCtx.run({ site: site || null }, fn);
export const mediaSite43 = () => siteCtx.getStore()?.site ?? null;
let siteConf = null;
/** media44.js: (siteId, serviceId) → {url, key, user} | null for et annet sted enn standard. */
export const _setSiteConf43 = (fn) => { siteConf = fn; };
/** Oppsettet for en tjeneste. vals = egne verdier (Test tilkobling før lagring); ellers stedet som er valgt, eller serverens oppsett. */
export function svcConf43(id, vals = null) {
  const d = SERVICES43[id];
  const site = vals ? null : mediaSite43();
  if (site && siteConf) {
    const sc = siteConf(site, id);
    if (sc && sc.url && sc.key) return { id, name: d.name, url: String(sc.url).replace(/\/+$/, ''), key: sc.key, user: sc.user ?? '', configured: true, mock: false, on: true, site };
  }
  const src = vals ? { user: OWNER, source: 'owner' } : mediaSource43(id);
  const url = val(d.url, vals, src.user).replace(/\/+$/, ''), key = val(d.key, vals, src.user), user = d.user ? val(d.user, vals, src.user) : '';
  const configured = !!(url && key);
  const fb = site && siteConf ? { fallback: true, requestedSite: site } : {};
  if (!configured && MOCK() && !vals && ['sonarr', 'radarr', 'qbit', 'prowlarr'].includes(id)) return { id, name: d.name, url: `http://mock-${id}`, key: 'mock', user: 'admin', configured: false, mock: true, on: true, ...fb };
  return { id, name: d.name, url, key, user, configured, mock: false, on: configured, source: src.source, ...fb };
}
const extra = (k, d = '') => val(k) || d;

/* ---------------- Nett ---------------- */

let fx = null;
/** Bare for tester: bytt ut fetch for ekte tjenester (mock-vertene går alltid til demoen). */
export const _setMediaFetch43 = (fn) => { fx = fn; clearMedia43(); qbSid.clear(); };
export class MediaError extends Error { constructor(msg, status = 502, extra = {}) { super(msg); this.status = status; Object.assign(this, extra); } }
async function rawFetch(url, init = {}) {
  const host = new URL(url).hostname;
  if (/^mock-(sonarr|radarr|qbit|prowlarr)$/.test(host)) return mockFetch43(url, init);
  return (fx ?? fetch)(url, { ...init, signal: init.signal ?? AbortSignal.timeout(init.timeout ?? 15_000) });
}
function netError(c, e) {
  const code = e?.cause?.code ?? e?.code ?? '';
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return new MediaError(`${c.name} svarte ikke i tide`, 504, { service: c.id });
  if (code === 'ECONNREFUSED') return new MediaError(`${c.name} avviste tilkoblingen (ECONNREFUSED) – sjekk adressen og porten`, 502, { service: c.id, code });
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new MediaError(`Fant ikke ${c.name} på adressen (${code})`, 502, { service: c.id, code });
  return new MediaError(`Fikk ikke kontakt med ${c.name}: ${e?.cause?.message ?? e?.message ?? e}`, 502, { service: c.id });
}
async function errorOf(c, r) {
  const t = await r.text().catch(() => '');
  let msg = t.slice(0, 300);
  try { const j = JSON.parse(t); msg = Array.isArray(j) ? j.map((x) => x.errorMessage ?? x.message).filter(Boolean).join(' · ') : j.message ?? j.error ?? msg; } catch { /* tekst */ }
  if (r.status === 401 || (r.status === 403 && c.id !== 'qbit')) return new MediaError(`${c.name}: feil API-nøkkel (${r.status})`, 502, { service: c.id, upstream: r.status });
  return new MediaError(`${c.name} svarte ${r.status}${msg ? `: ${msg}` : ''}`, r.status === 404 ? 404 : r.status === 400 ? 400 : 502, { service: c.id, upstream: r.status, detail: msg });
}
const notSetUp = (id) => new MediaError(`${SERVICES43[id].name} er ikke satt opp. Innstillinger → Integrasjoner → Media.`, 409, { service: id, configured: false });

/** Sonarr/Radarr (v3) og Prowlarr (v1): JSON med X-Api-Key. */
async function arr(id, method, path, { query, body, conf, timeout } = {}) {
  const c = conf ?? svcConf43(id);
  if (!c.on) throw notSetUp(id);
  const ver = id === 'prowlarr' ? 'v1' : 'v3';
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))}` : '';
  let r;
  try { r = await rawFetch(`${c.url}/api/${ver}${path}${qs}`, { method, timeout, headers: { 'X-Api-Key': c.key, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (e) { throw netError(c, e); }
  if (!r.ok) throw await errorOf(c, r);
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}
/** qBittorrent Web API v2: innlogging med SID-cookie (fornyes ved 403). */
const qbSid = new Map();
async function qb(method, path, { form, query, conf, raw = false } = {}) {
  const c = conf ?? svcConf43('qbit');
  if (!c.on) throw notSetUp('qbit');
  const login = async () => {
    let r;
    try { r = await rawFetch(`${c.url}/api/v2/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: c.url }, body: new URLSearchParams({ username: c.user || 'admin', password: c.key }).toString() }); }
    catch (e) { throw netError(c, e); }
    const t = await r.text().catch(() => '');
    if (r.status === 403) throw new MediaError('qBittorrent: for mange feil innlogginger, IP-en er sperret en stund', 502, { service: 'qbit' });
    if (!r.ok || /fails/i.test(t)) throw new MediaError('qBittorrent: feil brukernavn eller passord', 502, { service: 'qbit', upstream: 401 });
    // «SID=…» (4.x/5.x) eller et eget navn (QBT_SID_<port>); uten cookie = innlogging slått av for denne IP-en.
    const sid = (r.headers.get('set-cookie') ?? '').match(/(?:^|[\s,])((?:QBT_)?SID[\w-]*=[^;]+)/)?.[1] ?? '';
    qbSid.set(c.url, sid);
    return sid;
  };
  const go = async (sid) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    let body;
    if (form instanceof FormData) body = form;
    else if (form) body = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString();
    try { return await rawFetch(`${c.url}/api/v2${path}${qs}`, { method, headers: { Referer: c.url, ...(sid ? { Cookie: sid } : {}), ...(form && !(form instanceof FormData) ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body }); }
    catch (e) { throw netError(c, e); }
  };
  let sid = qbSid.get(c.url) ?? await login();
  let r = await go(sid);
  if (r.status === 403) { sid = await login(); r = await go(sid); }
  if (!r.ok) throw await errorOf(c, r);
  if (raw) return r;
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}
/** qBittorrent 5 heter stop/start, 4.x pause/resume. */
async function qbVerb(v5, v4, hashes) {
  try { return await qb('POST', `/torrents/${v5}`, { form: { hashes } }); }
  catch (e) { if (e.status === 404) return qb('POST', `/torrents/${v4}`, { form: { hashes } }); throw e; }
}

/* ---------------- Cache ---------------- */

const store = new Map();
const siteKey = () => { const s = mediaSite43(); return s && siteConf?.(s, '*') ? s : ''; };
async function cached(key0, ttl, fn) {
  const key = `${siteKey()}|${key0}`;
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  if (hit?.p) return hit.p;
  const p = fn().then((v) => { store.set(key, { v, exp: Date.now() + ttl }); return v; }, (e) => { store.delete(key); throw e; });
  store.set(key, { ...hit, p });
  return p;
}
export const clearMedia43 = (prefix = '') => { for (const k of [...store.keys()]) if (k.slice(k.indexOf('|') + 1).startsWith(prefix)) store.delete(k); };

/* ---------------- Formater (norsk) ---------------- */

const nb1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
export const sizeText43 = (b) => (!b ? 'størrelse ukjent' : b < GB ? `${Math.max(1, Math.round(b / MB))} MB` : b >= TB ? `${nb1(b / TB)} TB` : `${nb1(b / GB)} GB`);
export const speedText43 = (bps) => (bps >= MB ? `${nb1(bps / MB)} MB/s` : bps > 0 ? `${Math.max(1, Math.round(bps / 1024))} KB/s` : '0 MB/s');
export const etaText43 = (s) => (!Number.isFinite(s) || s <= 0 || s >= 8640000 ? '∞' : s < 60 ? 'under 1 min' : s < 3600 ? `${Math.ceil(s / 60)} min` : `${Math.floor(s / 3600)} t ${Math.round((s % 3600) / 60)} min`);
const pad = (n) => String(n).padStart(2, '0');
const epCode = (s, e) => `S${pad(s)}E${pad(e)}`;
const osloParts = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
const osloDate = (t = Date.now()) => { const p = osloParts(t); return `${p.year}-${p.month}-${p.day}`; };
const osloHm = (t) => { const p = osloParts(t); return `${p.hour}:${p.minute}`; };
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const DOW = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const longDay = (d) => `${cap(DOW[dow(d)])} ${+d.slice(8)}. ${MON[+d.slice(5, 7) - 1]}`;
const shortDay = (d) => `${cap(DOW[dow(d)].slice(0, 3))} ${+d.slice(8)}`;
const dateText = (d) => (d ? `${+d.slice(8, 10)}. ${MON[+d.slice(5, 7) - 1].slice(0, 3)}` : '');
const dayLabel = (d, today) => (d === today ? 'I DAG' : d === addDays(today, 1) ? 'I MORGEN' : DOW[dow(d)].toUpperCase());
const whenShort = (d, hm, today) => `${d === today ? 'i dag' : d === addDays(today, 1) ? 'i morgen' : DOW[dow(d)].slice(0, 3)}${hm ? ` ${hm}` : ''}`;

export const STATUS43 = { ok: ['Lastet ned', '#2f6b4a'], dl: ['Lastes ned', '#b23a2a'], miss: ['Mangler', '#a0671a'], stall: ['Står fast', '#a0671a'], pause: ['Pauset', '#8a8478'], wait: ['Venter', '#8a8478'], ann: ['Annonsert', '#8a8478'], off: ['Ikke overvåket', '#8a8478'] };
const stOut = (status, progress = null) => ({ status, statusText: (status === 'dl' || status === 'pause') && progress != null ? `${STATUS43[status][0]} ${Math.floor(progress)} %` : STATUS43[status][0], statusColor: STATUS43[status][1], progress: progress == null ? null : Math.floor(progress) });

/* ---------------- Bilder ---------------- */

function posterOf(svc, images, id) {
  const p = (images ?? []).find((i) => i.coverType === 'poster');
  if (p?.remoteUrl && /^https:\/\//.test(p.remoteUrl)) return p.remoteUrl;
  if (p?.url && /^\/MediaCover\//.test(p.url.replace(/^\/[^/]*(?=\/MediaCover)/, ''))) return `/api/media/cover?svc=${svc}&path=${encodeURIComponent(p.url.replace(/^.*(\/MediaCover\/)/, '$1').split('?')[0])}`;
  return null;
}
/** Prompt 44: bredt bilde (16:9) for banner og hero. Sonarr/Radarr coverType fanart; ellers null (klienten bruker plakaten uskarpt). */
function fanartOf(svc, images) {
  const p = (images ?? []).find((i) => i.coverType === 'fanart');
  if (p?.remoteUrl && /^https:\/\//.test(p.remoteUrl)) return p.remoteUrl;
  if (p?.url && /\/MediaCover\//.test(p.url)) return `/api/media/cover?svc=${svc}&path=${encodeURIComponent(p.url.replace(/^.*(\/MediaCover\/)/, '$1').split('?')[0])}`;
  return null;
}
const artOf = (svc, id) => { const a = MOCK() && svcConf43(svc).mock ? mockArt43(svc, id) : null; return a?.color ?? colorFor(`${svc}${id}`); };
const COLORS = ['#2e3b4a', '#3f5a4a', '#6b3b2e', '#7a5a2a', '#4a6b3a', '#5a4a6b', '#3c4a5c', '#2f2f36', '#6b4a3a', '#3a5a6b', '#5c3c4a', '#4a4a2e'];
const colorFor = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

/* ---------------- Profiler og mapper ---------------- */

const resOfProfile = (name) => (/ultra|2160|4k|uhd/i.test(name ?? '') ? 2160 : /720p\/1080p/i.test(name ?? '') ? 1080 : /720/.test(name ?? '') ? 720 : /sd/i.test(name ?? '') && !/hd/i.test(name ?? '') ? 480 : 1080);
async function profiles(id) { return cached(`${id}:profiles`, 5 * 60_000, async () => (await arr(id, 'GET', '/qualityprofile')).map((p) => ({ id: p.id, name: p.name, resolution: resOfProfile(p.name) }))); }
/** «4K» → Ultra-HD, «1080p/HD» → HD-1080p, «720p» → HD-720p, eller et profilnavn/-id. */
export async function profileFor43(id, want) {
  const list = await profiles(id).catch(() => []);
  if (want == null || want === '') { const def = extra(id === 'sonarr' ? 'sonarr_profile' : 'radarr_profile', id === 'sonarr' ? 'HD-1080p' : 'Ultra-HD'); return list.find((p) => p.name.toLowerCase() === def.toLowerCase()) ?? list.find((p) => p.resolution === 1080) ?? list[0] ?? null; }
  if (Number.isInteger(+want) && list.some((p) => p.id === +want)) return list.find((p) => p.id === +want);
  const w = String(want).toLowerCase();
  const exact = list.find((p) => p.name.toLowerCase() === w);
  if (exact) return exact;
  const res = /4k|uhd|2160/.test(w) ? 2160 : /720/.test(w) ? 720 : /1080|hd/.test(w) ? 1080 : null;
  if (res) return list.find((p) => p.name.toLowerCase() === { 2160: 'ultra-hd', 1080: 'hd-1080p', 720: 'hd-720p' }[res]) ?? list.find((p) => p.resolution === res) ?? null;
  return null;
}
const profName = async (id, pid) => (await profiles(id).catch(() => [])).find((p) => p.id === pid)?.name ?? null;

/* ---------------- Køen: Sonarr/Radarr ↔ qBittorrent ---------------- */

const TSTATE = {
  downloading: 'dl', forcedDL: 'dl', stalledDL: 'stall', pausedDL: 'pause', stoppedDL: 'pause', queuedDL: 'queued', metaDL: 'meta', forcedMetaDL: 'meta', checkingDL: 'check', checkingUP: 'check', checkingResumeData: 'check', moving: 'check', allocating: 'check',
  uploading: 'seed', stalledUP: 'seed', forcedUP: 'seed', queuedUP: 'seed', pausedUP: 'seed', stoppedUP: 'seed', error: 'error', missingFiles: 'error', unknown: 'error',
};
/** Alle torrenter (rå qBittorrent), cache 2 s. null når qBittorrent ikke er satt opp. */
async function torrentsRaw() {
  if (!svcConf43('qbit').on) return null;
  return cached('qbit:info', 2000, () => qb('GET', '/torrents/info'));
}
async function queues() {
  return cached('queue', 5000, async () => {
    const get = async (id) => (svcConf43(id).on ? (await arr(id, 'GET', '/queue', { query: { pageSize: 500, includeUnknownSeriesItems: false, includeEpisode: false } }).catch(() => ({ records: [] })))?.records ?? [] : []);
    const [s, r, t] = await Promise.all([get('sonarr'), get('radarr'), torrentsRaw().catch(() => null)]);
    const byHash = new Map((t ?? []).map((x) => [String(x.hash).toLowerCase(), x]));
    const ep = new Map(), mv = new Map(), link = new Map();
    const info = (rec) => {
      const tor = byHash.get(String(rec.downloadId ?? '').toLowerCase());
      const progress = tor ? tor.progress * 100 : rec.size ? (1 - rec.sizeleft / rec.size) * 100 : 0;
      let status = 'dl';
      if (tor) { const s0 = TSTATE[tor.state] ?? 'dl'; status = s0 === 'seed' ? 'ok' : s0 === 'pause' ? 'pause' : s0 === 'stall' || s0 === 'error' ? 'stall' : 'dl'; }
      else if (rec.status === 'paused') status = 'pause';
      else if (rec.trackedDownloadStatus === 'warning' || rec.status === 'warning') status = 'stall';
      return { status, progress, hash: tor?.hash ?? rec.downloadId?.toLowerCase() ?? null };
    };
    for (const rec of s) { const i = info(rec); if (rec.episodeId) ep.set(rec.episodeId, i); if (i.hash) link.set(i.hash, { svc: 'sonarr', seriesId: rec.seriesId, episodeIds: [...(link.get(i.hash)?.episodeIds ?? []), rec.episodeId].filter(Boolean) }); }
    for (const rec of r) { const i = info(rec); if (rec.movieId) mv.set(rec.movieId, i); if (i.hash) link.set(i.hash, { svc: 'radarr', movieId: rec.movieId }); }
    return { ep, mv, link };
  });
}
function epState(e, q, now = Date.now()) {
  if (e.hasFile) return stOut('ok');
  const x = q?.ep.get(e.id);
  if (x) return stOut(x.status, x.status === 'ok' ? null : x.progress);
  if (!e.monitored) return stOut('off');
  if (e.airDateUtc && Date.parse(e.airDateUtc) <= now) return stOut('miss');
  return stOut('wait');
}
function movieState(m, q) {
  if (m.hasFile) return stOut('ok');
  const x = q?.mv.get(m.id);
  if (x) return stOut(x.status, x.status === 'ok' ? null : x.progress);
  if (!m.monitored) return stOut('off');
  if (m.isAvailable === false || m.status === 'announced') return stOut('ann');
  return stOut('miss');
}

/* ---------------- Sonarr ---------------- */

export const MONITOR43 = [['all', 'Alle episoder'], ['future', 'Fremtidige episoder'], ['missing', 'Manglende episoder'], ['existing', 'Eksisterende episoder'], ['firstSeason', 'Første sesong'], ['latestSeason', 'Siste sesong'], ['pilot', 'Bare pilot'], ['none', 'Ingen']];
const MON_ALIAS = { first: 'firstSeason', latest: 'latestSeason', fremtidige: 'future', alle: 'all', manglende: 'missing', eksisterende: 'existing', ingen: 'none' };
export const SERIES_TYPES43 = [['standard', 'Standard'], ['daily', 'Daglig'], ['anime', 'Anime']];
export const AVAILABILITY43 = [['announced', 'Annonsert'], ['inCinemas', 'På kino'], ['released', 'Utgitt digitalt']];
const monLabel = (k) => MONITOR43.find((x) => x[0] === k)?.[1] ?? 'Alle episoder';
const playOf = (title, u) => {
  const pl = prefsOf(u).player;
  const j = svcConf43('jellyfin'), p = svcConf43('plex');
  const jUrl = j.url || (MOCK() ? 'http://192.168.1.20:8096' : ''), pUrl = p.url || (MOCK() ? 'http://192.168.1.20:32400' : '');
  if (pl === 'plex' && pUrl) return { player: 'plex', label: '▶ Spill av i Plex', url: `${pUrl}/web/index.html#!/search?query=${encodeURIComponent(title)}` };
  if (jUrl) return { player: 'jellyfin', label: '▶ Spill av i Jellyfin', url: `${jUrl}/web/#/search.html?query=${encodeURIComponent(title)}` };
  if (pUrl) return { player: 'plex', label: '▶ Spill av i Plex', url: `${pUrl}/web/index.html#!/search?query=${encodeURIComponent(title)}` };
  return null;
};
async function seriesOut(s) {
  const st = s.statistics ?? {};
  const have = st.episodeFileCount ?? 0, total = st.episodeCount ?? st.totalEpisodeCount ?? 0;
  return { id: s.id, kind: 'series', title: s.title, year: s.year ?? null, network: s.network ?? '', status: s.status === 'ended' ? 'ended' : 'continuing', statusLabel: s.status === 'ended' ? 'Avsluttet' : 'Fortsetter', overview: s.overview ?? '',
    poster: posterOf('sonarr', s.images, s.id), fanart: fanartOf('sonarr', s.images), color: artOf('sonarr', s.id), tvdbId: s.tvdbId ?? null, profileId: s.qualityProfileId ?? null, profile: await profName('sonarr', s.qualityProfileId),
    monitored: s.monitored !== false, monitor: s._monitor ?? null, seriesType: s.seriesType ?? 'standard', seriesTypeLabel: SERIES_TYPES43.find((x) => x[0] === s.seriesType)?.[1] ?? 'Standard', path: s.path ?? null, rootFolder: s.rootFolderPath ?? null,
    episodes: { have, total, missing: Math.max(0, total - have) }, episodesText: `${have} av ${total} episoder${total - have > 0 ? ` · ${total - have} mangler` : ''}`, sizeOnDisk: st.sizeOnDisk ?? 0, sizeText: st.sizeOnDisk ? sizeText43(st.sizeOnDisk) : '0 GB', seasonCount: st.seasonCount ?? s.seasons?.length ?? 0 };
}
async function seriesList() { return cached('sonarr:series', 60_000, () => arr('sonarr', 'GET', '/series')); }
async function libSeries() {
  const list = await Promise.all((await seriesList()).map(seriesOut));
  list.sort((a, b) => a.title.replace(/^The /, '').localeCompare(b.title.replace(/^The /, ''), 'nb'));
  const counts = { all: list.length, missing: list.filter((x) => x.episodes.missing > 0).length, continuing: list.filter((x) => x.status === 'continuing').length, ended: list.filter((x) => x.status === 'ended').length };
  return { items: list, counts, filters: [['all', 'Alle'], ['missing', 'Mangler'], ['continuing', 'Fortsetter'], ['ended', 'Avsluttet']].map(([id, label]) => ({ id, label, count: counts[id] })) };
}
async function seriesDetail(id, u) {
  const [s, eps, q] = await Promise.all([arr('sonarr', 'GET', `/series/${id}`), arr('sonarr', 'GET', '/episode', { query: { seriesId: id } }), queues().catch(() => null)]);
  const base = await seriesOut(s);
  const now = Date.now();
  const nums = [...new Set(eps.map((e) => e.seasonNumber))].filter((n) => n > 0 || eps.every((e) => e.seasonNumber === 0)).sort((a, b) => b - a);
  const seasons = nums.map((n, i) => {
    const list = eps.filter((e) => e.seasonNumber === n).sort((a, b) => a.episodeNumber - b.episodeNumber).map((e) => {
      const stt = epState(e, q, now);
      const aired = !!e.airDateUtc && Date.parse(e.airDateUtc) <= now;
      return { id: e.id, season: n, number: e.episodeNumber, code: epCode(n, e.episodeNumber), e: `E${pad(e.episodeNumber)}`, title: e.title ?? `Episode ${e.episodeNumber}`, airDate: e.airDate ?? null, airDateUtc: e.airDateUtc ?? null,
        airDateText: e.airDate ? dateText(e.airDate) : '', aired, hasFile: !!e.hasFile, monitored: !!e.monitored, ...stt, canSearch: ['miss', 'stall'].includes(stt.status),
        episodeFileId: e.hasFile ? e.episodeFileId || null : null, canRedownload: !!e.hasFile, canDeleteFile: !!e.hasFile, // prompt 44: ⟳ Last ned på nytt / Slett
        ...(e.episodeFile ? { quality: e.episodeFile.quality?.quality?.name ?? null, size: e.episodeFile.size ?? null, sizeText: sizeText43(e.episodeFile.size) } : {}) };
    });
    const missing = list.filter((e) => e.status === 'miss' || e.status === 'stall').length;
    return { number: n, label: n === 0 ? 'Spesialer' : `Sesong ${n}`, monitored: list.some((e) => e.monitored), have: list.filter((e) => e.hasFile).length, total: list.length, missing, open: i === 0, canSearch: missing > 0, episodes: list };
  });
  const missing = seasons.reduce((a, x) => a + x.missing, 0);
  return { ...base, subtitle: [base.year, base.network, base.statusLabel].filter(Boolean).join(' · '), missingCount: missing, searchLabel: missing ? `Søk alle manglende (${missing})` : null, play: playOf(base.title, u), seasons };
}
async function lookupSeries(term) {
  if (!term) return [];
  const [res, lib] = await Promise.all([arr('sonarr', 'GET', '/series/lookup', { query: { term } }), seriesList().catch(() => [])]);
  return (res ?? []).slice(0, 25).map((x) => {
    const have = lib.find((s) => (x.tvdbId && s.tvdbId === x.tvdbId) || (x.id && s.id === x.id));
    return { kind: 'series', tvdbId: x.tvdbId ?? null, title: x.title, year: x.year ?? null, network: x.network ?? '', overview: x.overview ?? '', poster: posterOf('sonarr', x.images, have?.id), fanart: fanartOf('sonarr', x.images), color: have ? artOf('sonarr', have.id) : x._color ?? colorFor(x.title),
      seasons: (x.seasons ?? []).filter((s) => s.seasonNumber > 0).length, exists: !!have, id: have?.id ?? null, existsLabel: have ? 'Finnes' : null };
  });
}
async function addSeries(b) {
  const term = b.tvdbId ? `tvdb:${b.tvdbId}` : String(b.title ?? b.term ?? '').trim();
  if (!term) throw new MediaError('Mangler tvdbId eller title', 400);
  const found = (await arr('sonarr', 'GET', '/series/lookup', { query: { term } })) ?? [];
  const x = found.find((s) => (b.tvdbId && s.tvdbId === +b.tvdbId) || s.title?.toLowerCase() === String(b.title ?? '').toLowerCase()) ?? found[0];
  if (!x) throw new MediaError(`Fant ikke «${b.title ?? b.tvdbId}» i Sonarr`, 404);
  if (x.id && (await seriesList().catch(() => [])).some((s) => s.id === x.id)) throw new MediaError(`${x.title} finnes allerede`, 409, { id: x.id, exists: true });
  const prof = await profileFor43('sonarr', b.profileId ?? b.profile);
  if (!prof) throw new MediaError('Ukjent kvalitetsprofil', 400);
  const monitor = MON_ALIAS[b.monitor] ?? b.monitor ?? 'all';
  if (!MONITOR43.some((m) => m[0] === monitor)) throw new MediaError('Ukjent overvåking', 400);
  const type = ({ std: 'standard', standard: 'standard', daily: 'daily', anime: 'anime' })[b.seriesType ?? b.type ?? 'standard'];
  if (!type) throw new MediaError('Serietype må være standard, daily eller anime', 400);
  const root = b.rootFolder || extra('sonarr_root', '/data/media/tv');
  const created = await arr('sonarr', 'POST', '/series', { body: { ...x, id: undefined, qualityProfileId: prof.id, languageProfileId: x.languageProfileId ?? 1, rootFolderPath: root, monitored: monitor !== 'none', seasonFolder: true, seriesType: type,
    addOptions: { monitor, searchForMissingEpisodes: b.searchNow !== false && b.search !== false, searchForCutoffUnmetEpisodes: false } } });
  clearMedia43('sonarr:'); clearMedia43('cal');
  const out = await seriesOut(created);
  const miss = out.episodes.missing;
  return { series: out, message: `Lagt til ${out.title} · ${prof.name}${b.searchNow !== false && miss ? ` · søker etter ${miss} manglende episoder` : ''}` };
}
async function updateSeries(id, b) {
  const s = await arr('sonarr', 'GET', `/series/${id}`);
  const n = { ...s };
  if (b.profileId !== undefined || b.profile !== undefined) { const p = await profileFor43('sonarr', b.profileId ?? b.profile); if (!p) throw new MediaError('Ukjent kvalitetsprofil', 400); n.qualityProfileId = p.id; }
  if (b.seriesType !== undefined) { const t = ({ std: 'standard', standard: 'standard', daily: 'daily', anime: 'anime' })[b.seriesType]; if (!t) throw new MediaError('Ukjent serietype', 400); n.seriesType = t; }
  if (b.monitored !== undefined) n.monitored = !!b.monitored;
  if (Array.isArray(b.seasons)) n.seasons = (s.seasons ?? []).map((x) => { const w = b.seasons.find((y) => +y.number === x.seasonNumber || +y.seasonNumber === x.seasonNumber); return w && w.monitored !== undefined ? { ...x, monitored: !!w.monitored } : x; });
  let mon = null;
  if (b.monitor !== undefined) { mon = MON_ALIAS[b.monitor] ?? b.monitor; if (!MONITOR43.some((x) => x[0] === mon)) throw new MediaError('Ukjent overvåking', 400); n.monitored = mon !== 'none'; }
  if (b.rootFolder) n.rootFolderPath = b.rootFolder;
  const r = await arr('sonarr', 'PUT', `/series/${id}`, { body: n, query: b.moveFiles ? { moveFiles: true } : undefined });
  // Overvåking per episode: PUT /episode/monitor.
  if (Array.isArray(b.episodes) && b.episodes.length) {
    for (const mon of [true, false]) { const ids = b.episodes.filter((e) => !!e.monitored === mon).map((e) => +e.id).filter(Boolean); if (ids.length) await arr('sonarr', 'PUT', '/episode/monitor', { body: { episodeIds: ids, monitored: mon } }); }
  }
  // «Overvåking»-valget (Alle/Fremtidige/…) for en serie som finnes: POST /seasonpass med monitoringOptions (Sonarr v3/v4).
  if (mon) await arr('sonarr', 'POST', '/seasonpass', { body: { series: [{ id: +id, monitored: mon !== 'none' }], monitoringOptions: { monitor: mon } } });
  clearMedia43('sonarr:'); clearMedia43('cal');
  return seriesOut(mon ? await arr('sonarr', 'GET', `/series/${id}`) : r ?? n);
}

/* ---------------- Radarr ---------------- */

async function movieOut(m, q = null) {
  const f = m.movieFile;
  const d = m.digitalRelease?.slice(0, 10) ?? null;
  return { id: m.id, kind: 'movie', title: m.title, year: m.year ?? null, overview: m.overview ?? '', poster: posterOf('radarr', m.images, m.id), fanart: fanartOf('radarr', m.images), color: artOf('radarr', m.id), tmdbId: m.tmdbId ?? null,
    movieFileId: f?.id ?? null, canRedownload: !!m.hasFile, canDeleteFile: !!m.hasFile, // prompt 44
    profileId: m.qualityProfileId ?? null, profile: await profName('radarr', m.qualityProfileId), monitored: m.monitored !== false, minimumAvailability: m.minimumAvailability ?? 'released',
    availabilityLabel: AVAILABILITY43.find((x) => x[0] === m.minimumAvailability)?.[1] ?? 'Utgitt digitalt', hasFile: !!m.hasFile, path: m.path ?? null, rootFolder: m.rootFolderPath ?? null,
    digitalRelease: d, inCinemas: m.inCinemas?.slice(0, 10) ?? null, physicalRelease: m.physicalRelease?.slice(0, 10) ?? null, note: (MOCK() && svcConf43('radarr').mock ? mockArt43('radarr', m.id)?.note : null) ?? (m.status === 'announced' && m.inCinemas ? `På kino ${dateText(m.inCinemas.slice(0, 10))}` : null),
    file: f ? { quality: f.quality?.quality?.name ?? null, resolution: f.quality?.quality?.resolution ?? null, size: f.size ?? 0, sizeText: sizeText43(f.size), path: f.relativePath ? `${m.path ?? ''}/${f.relativePath}` : m.path ?? null } : null, ...movieState(m, q) };
}
async function movieList() { return cached('radarr:movies', 60_000, () => arr('radarr', 'GET', '/movie')); }
async function libMovies() {
  const q = await queues().catch(() => null);
  const list = await Promise.all((await movieList()).map((m) => movieOut(m, q)));
  list.sort((a, b) => a.title.replace(/^The /, '').localeCompare(b.title.replace(/^The /, ''), 'nb'));
  const counts = { all: list.length, has: list.filter((x) => x.hasFile).length, missing: list.filter((x) => !x.hasFile && x.status !== 'ann').length, announced: list.filter((x) => x.status === 'ann').length };
  return { items: list, counts, filters: [['all', 'Alle'], ['has', 'Lastet ned'], ['missing', 'Mangler'], ['announced', 'Kommer']].map(([id, label]) => ({ id, label, count: counts[id] })) };
}
async function lookupMovies(term) {
  if (!term) return [];
  const [res, lib] = await Promise.all([arr('radarr', 'GET', '/movie/lookup', { query: { term } }), movieList().catch(() => [])]);
  return (res ?? []).slice(0, 25).map((x) => {
    const have = lib.find((m) => (x.tmdbId && m.tmdbId === x.tmdbId) || (x.id && m.id === x.id));
    return { kind: 'movie', tmdbId: x.tmdbId ?? null, title: x.title, year: x.year ?? null, overview: x.overview ?? '', poster: posterOf('radarr', x.images, have?.id), fanart: fanartOf('radarr', x.images), color: have ? artOf('radarr', have.id) : x._color ?? colorFor(x.title), exists: !!have, id: have?.id ?? null, existsLabel: have ? 'Finnes' : null };
  });
}
async function addMovie(b) {
  const term = b.tmdbId ? `tmdb:${b.tmdbId}` : String(b.title ?? b.term ?? '').trim();
  if (!term) throw new MediaError('Mangler tmdbId eller title', 400);
  const found = (await arr('radarr', 'GET', '/movie/lookup', { query: { term } })) ?? [];
  const x = found.find((m) => (b.tmdbId && m.tmdbId === +b.tmdbId) || m.title?.toLowerCase() === String(b.title ?? '').toLowerCase()) ?? found[0];
  if (!x) throw new MediaError(`Fant ikke «${b.title ?? b.tmdbId}» i Radarr`, 404);
  if (x.id && (await movieList().catch(() => [])).some((m) => m.id === x.id)) throw new MediaError(`${x.title} finnes allerede`, 409, { id: x.id, exists: true });
  const prof = await profileFor43('radarr', b.profileId ?? b.profile);
  if (!prof) throw new MediaError('Ukjent kvalitetsprofil', 400);
  const av = ({ ann: 'announced', announced: 'announced', cin: 'inCinemas', inCinemas: 'inCinemas', rel: 'released', released: 'released' })[b.minimumAvailability ?? 'released'];
  if (!av) throw new MediaError('minimumAvailability må være announced, inCinemas eller released', 400);
  const root = b.rootFolder || extra('radarr_root', '/data/media/film');
  const created = await arr('radarr', 'POST', '/movie', { body: { ...x, id: undefined, qualityProfileId: prof.id, rootFolderPath: root, monitored: b.monitored !== false, minimumAvailability: av, addOptions: { searchForMovie: b.searchNow !== false && b.search !== false, monitor: 'movieOnly' } } });
  clearMedia43('radarr:'); clearMedia43('cal');
  const out = await movieOut(created);
  return { movie: out, message: `Lagt til ${out.title} · ${prof.name}${b.searchNow !== false ? ' · søker nå' : ''}` };
}
async function updateMovie(id, b) {
  const m = await arr('radarr', 'GET', `/movie/${id}`);
  const n = { ...m };
  if (b.profileId !== undefined || b.profile !== undefined) { const p = await profileFor43('radarr', b.profileId ?? b.profile); if (!p) throw new MediaError('Ukjent kvalitetsprofil', 400); n.qualityProfileId = p.id; }
  if (b.minimumAvailability !== undefined) { const av = ({ ann: 'announced', announced: 'announced', cin: 'inCinemas', inCinemas: 'inCinemas', rel: 'released', released: 'released' })[b.minimumAvailability]; if (!av) throw new MediaError('Ukjent minimumAvailability', 400); n.minimumAvailability = av; }
  if (b.monitored !== undefined) n.monitored = !!b.monitored;
  if (b.rootFolder) n.rootFolderPath = b.rootFolder;
  const r = await arr('radarr', 'PUT', `/movie/${id}`, { body: n });
  clearMedia43('radarr:'); clearMedia43('cal');
  return movieOut(r ?? n, await queues().catch(() => null));
}

/* ---------------- Interaktivt søk ---------------- */

const LANG = { English: 'EN', Norwegian: 'NO', Swedish: 'SV', Danish: 'DA', Finnish: 'FI', German: 'DE', French: 'FR', Spanish: 'ES', Japanese: 'JA', Russian: 'RU', Italian: 'IT', Dutch: 'NL', Polish: 'PL', Korean: 'KO', Unknown: '?' };
const subsFromTitle = (t) => { const s = []; if (/\bNORDiC\b/i.test(t)) s.push('NO', 'SV', 'DA', 'FI'); if (/\b(NORWEGIAN|NORSK|NOR\.?SUBS?)\b/i.test(t) && !s.includes('NO')) s.push('NO'); if (/\b(SWEDiSH)\b/i.test(t) && !s.includes('SV')) s.push('SV'); if (/\b(DANiSH)\b/i.test(t) && !s.includes('DA')) s.push('DA'); return s; };
const qualityLabel = (name, res, title) => {
  const src = /web-?dl/i.test(name) || /WEB-DL/i.test(title) ? 'WEB-DL' : /webrip/i.test(name) || /\bWEB\b/i.test(title) ? 'WEB' : /bluray|blu-ray/i.test(name) ? 'Bluray' : /hdtv/i.test(name) ? (/HEVC|x265/i.test(title) ? 'HEVC' : 'HDTV') : /remux/i.test(name) ? 'Remux' : /sdtv|dvd/i.test(name) ? 'WEB' : '';
  return `${res ? `${res}p` : name}${src ? ` ${src}` : ''}`.trim();
};
const ageText = (h) => (h == null ? '' : h < 1 ? 'nå' : h < 24 ? `${Math.round(h)} t` : `${Math.round(h / 24)} d`);
const grabCache = new Map();
function releaseOut(r, svc, ctx) {
  const res = r.quality?.quality?.resolution ?? (+(String(r.title).match(/(2160|1080|720|480)p/)?.[1]) || null);
  const langs = (r.languages ?? []).map((l) => LANG[l?.name] ?? String(l?.name ?? '').slice(0, 2).toUpperCase()).filter(Boolean);
  const subs = Array.isArray(r.subtitles) ? r.subtitles : subsFromTitle(r.title ?? '');
  const ageH = r.ageHours ?? (r.age != null ? r.age * 24 : r.publishDate ? (Date.now() - Date.parse(r.publishDate)) / 3600_000 : null);
  const strip = ctx?.titlePrefix && String(r.title).toLowerCase().startsWith(ctx.titlePrefix.toLowerCase()) ? String(r.title).slice(ctx.titlePrefix.length).replace(/^[.\s-]+/, '') : null;
  const out = { guid: r.guid, indexerId: r.indexerId, indexer: r.indexer ?? '', title: r.title, shortTitle: strip || r.title, quality: qualityLabel(r.quality?.quality?.name ?? '', res, r.title ?? ''), qualityName: r.quality?.quality?.name ?? null, resolution: res,
    size: r.size ?? 0, sizeText: sizeText43(r.size), seeders: r.seeders ?? null, leechers: r.leechers ?? null, peersText: r.protocol === 'usenet' ? 'Usenet' : `${r.seeders ?? 0} / ${r.leechers ?? 0}`, ageHours: ageH == null ? null : Math.round(ageH), ageText: ageText(ageH),
    languages: langs, subtitles: subs, norwegian: subs.includes('NO') || langs.includes('NO'), langText: [langs.length ? `Tale ${langs.join(' ')}` : '', subs.length ? `Tekst ${subs.join(' ')}` : ''].filter(Boolean).join(' · '),
    rejected: !!r.rejected, rejections: (r.rejections ?? []).map((x) => (typeof x === 'string' ? x : x?.reason ?? '')).filter(Boolean), protocol: r.protocol ?? 'torrent', service: svc, downloadAllowed: r.downloadAllowed !== false };
  grabCache.set(r.guid, { at: Date.now(), r: out, ctx });
  if (grabCache.size > 2000) for (const [k, v] of grabCache) if (Date.now() - v.at > 30 * 60_000) grabCache.delete(k);
  return out;
}
/** Sortering: beste treff for profilen øverst, så seedere. Seedere fargekodes relativt til søket (grønn ≥ 50 % av høyeste, rød < 10 % / 0). */
export function rankReleases43(rows, profileRes = 1080) {
  const max = Math.max(0, ...rows.map((r) => r.seeders ?? 0));
  const ok = rows.filter((r) => !r.rejected && (r.seeders ?? 0) > 0);
  const best = ok.filter((r) => r.resolution === profileRes).sort((a, b) => b.seeders - a.seeders)[0] ?? ok.sort((a, b) => b.seeders - a.seeders)[0] ?? null;
  const out = rows.map((r) => ({ ...r, best: !!best && r.guid === best.guid, bestLabel: best && r.guid === best.guid ? 'Best treff for profilen' : null,
    seedTone: (r.seeders ?? 0) === 0 ? 'bad' : max && r.seeders >= max * 0.5 ? 'good' : max && r.seeders < max * 0.1 ? 'bad' : null }));
  return out.sort((a, b) => (b.best - a.best) || ((b.seeders ?? 0) - (a.seeders ?? 0)));
}
/** Prompt 44: Sonarr/Radarr spør ALLE indeksere i /release og svarer ofte først etter 30–120 s. Den faste grensen på 15 s i
 *  rawFetch ga «svarte ikke i tide» → 504 (den ekte årsaken til «Feil 504» i interaktivt søk). /release får 180 s, og ett nytt
 *  forsøk etter 2 s ved 502/503/504 fra tjenesten. Andre kall beholder den korte grensen. */
export const RELEASE_TIMEOUT43 = 180_000;
let releaseTimeout = RELEASE_TIMEOUT43;
export const _setReleaseTimeout43 = (ms) => { releaseTimeout = ms ?? RELEASE_TIMEOUT43; };
async function releaseRows(svc, query, signal) {
  const go = () => arr(svc, 'GET', '/release', { query, timeout: releaseTimeout });
  try { return await go(); } catch (e) {
    if (signal?.aborted || ![502, 503, 504].includes(e.upstream) || e.status === 504) throw e;
    await new Promise((r) => setTimeout(r, 2000));
    return go();
  }
}
export async function interactive(svc, query, { signal } = {}) {
  const t0 = Date.now();
  let ctx = {}, rows;
  if (svc === 'radarr') {
    const m = await arr('radarr', 'GET', `/movie/${query.movieId}`);
    const pn = await profName('radarr', m.qualityProfileId);
    ctx = { kind: 'movie', movieId: m.id, title: m.title, code: String(m.year ?? ''), titlePrefix: '', profile: pn, profileRes: resOfProfile(pn), poster: posterOf('radarr', m.images, m.id), color: artOf('radarr', m.id),
      header: `${m.title}${m.year ? ` · ${m.year}` : ''}`, sub: `Profil ${pn ?? '–'}`, fanart: fanartOf('radarr', m.images), hasFile: !!m.hasFile };
    rows = await releaseRows('radarr', { movieId: m.id }, signal);
  } else {
    const e = query.episodeId ? await arr('sonarr', 'GET', `/episode/${+query.episodeId}`) : null;
    const sid = e?.seriesId ?? query.seriesId;
    const s = sid ? await arr('sonarr', 'GET', `/series/${sid}`).catch(() => null) : null;
    const pn = s ? await profName('sonarr', s.qualityProfileId) : null;
    const code = e ? epCode(e.seasonNumber, e.episodeNumber) : `S${pad(query.seasonNumber ?? 1)}`;
    ctx = { kind: e ? 'episode' : 'season', seriesId: s?.id ?? null, episodeId: e?.id ?? null, seasonNumber: e?.seasonNumber ?? (query.seasonNumber != null ? +query.seasonNumber : null), title: s?.title ?? '', code,
      titlePrefix: s ? s.title.replace(/[':]/g, '').replace(/[^A-Za-z0-9]+/g, '.').replace(/\.$/, '') : '', profile: pn, profileRes: resOfProfile(pn), poster: s ? posterOf('sonarr', s.images, s.id) : null, color: s ? artOf('sonarr', s.id) : null,
      header: `${code}${e?.title ? ` · ${e.title}` : ''}`, sub: `Profil ${pn ?? '–'} · Overvåker ${monLabel(s?._monitor ?? 'all').toLowerCase()}` };
    rows = await releaseRows('sonarr', query.episodeId ? { episodeId: query.episodeId } : { seriesId: sid, seasonNumber: query.seasonNumber }, signal);
  }
  const items = rankReleases43((rows ?? []).map((r) => releaseOut(r, svc, ctx)), ctx.profileRes);
  const ms = Date.now() - t0;
  const nIdx = new Set(items.map((r) => r.indexer)).size;
  let total = nIdx;
  try { if (svcConf43('prowlarr').on) total = (await indexersRaw()).filter((x) => x.enable !== false).length || nIdx; } catch { /* */ }
  const filters = [['all', 'Alle', () => true], ['1080p', '1080p', (r) => r.resolution === 1080], ['2160p', '2160p', (r) => r.resolution === 2160], ['no', 'Norsk tekst', (r) => r.norwegian], ['seeders', 'Flest seedere', () => true]]
    .map(([id, label, f]) => ({ id, label, count: items.filter(f).length, ...(id === 'seeders' ? { sort: true } : {}) }));
  return { context: ctx, items, best: items.find((r) => r.best)?.guid ?? null, tookMs: ms, indexers: nIdx, indexersTotal: total, filters,
    text: `${items.length} treff fra ${total} indeksere · ${ms < 1000 ? `${ms} ms` : `${nb1(ms / 1000)} s`}` };
}
async function grabRelease(b) {
  const hit = grabCache.get(String(b.guid ?? ''));
  const svc = b.service ?? hit?.r.service ?? 'sonarr';
  if (!['sonarr', 'radarr'].includes(svc)) throw new MediaError('service må være sonarr eller radarr', 400);
  if (!b.guid || !Number.isInteger(+(b.indexerId ?? hit?.r.indexerId))) throw new MediaError('Mangler guid og indexerId', 400);
  await arr(svc, 'POST', '/release', { body: { guid: String(b.guid), indexerId: +(b.indexerId ?? hit.r.indexerId) } });
  clearMedia43('queue'); clearMedia43('qbit:');
  const r = hit?.r;
  return { ok: true, guid: b.guid, message: r ? `Sendt til qBittorrent: ${r.quality} · ${r.sizeText}` : 'Sendt til qBittorrent', release: r ?? null };
}

/* ---------------- Kommer snart ---------------- */

async function calendarRaw(days) {
  const today = osloDate();
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 3600_000).toISOString(), end = new Date(Date.parse(`${addDays(today, days)}T00:00:00Z`) + 3 * 3600_000).toISOString();
  const [tv, mv] = await Promise.all([
    svcConf43('sonarr').on ? cached(`cal:s:${today}:${days}`, 60_000, () => arr('sonarr', 'GET', '/calendar', { query: { start, end, includeSeries: true, includeEpisodeFile: false, unmonitored: true } })).catch((e) => ({ error: e.message })) : null,
    svcConf43('radarr').on ? cached(`cal:r:${today}:${days}`, 60_000, () => arr('radarr', 'GET', '/calendar', { query: { start, end, unmonitored: true } })).catch((e) => ({ error: e.message })) : null,
  ]);
  return { today, tv, mv };
}
export async function upcoming43(days = 7) {
  days = Math.max(1, Math.min(31, Math.round(+days) || 7));
  const { today, tv, mv } = await calendarRaw(days);
  const q = await queues().catch(() => null);
  const items = [];
  const last = addDays(today, days - 1);
  for (const e of Array.isArray(tv) ? tv : []) {
    const d = e.airDateUtc ? osloDate(Date.parse(e.airDateUtc)) : e.airDate;
    if (!d || d < today || d > last) continue;
    const s = e.series ?? {};
    items.push({ kind: 'episode', id: `ep-${e.id}`, episodeId: e.id, seriesId: e.seriesId, title: s.title ?? '', code: epCode(e.seasonNumber, e.episodeNumber), episodeTitle: e.title ?? '', date: d, time: e.airDateUtc ? osloHm(Date.parse(e.airDateUtc)) : '',
      airUtc: e.airDateUtc ?? null, network: s.network ?? '', poster: posterOf('sonarr', s.images, e.seriesId), fanart: fanartOf('sonarr', s.images), color: artOf('sonarr', e.seriesId), monitored: !!e.monitored, ...epState(e, q), open: { tab: 'sonarr', id: e.seriesId } });
  }
  for (const m of Array.isArray(mv) ? mv : []) {
    const cand = [['digitalRelease', 'Digital utgivelse'], ['inCinemas', 'På kino'], ['physicalRelease', 'Fysisk utgivelse']].map(([k, l]) => [m[k]?.slice(0, 10), l]).filter(([d]) => d && d >= today && d <= last);
    if (!cand.length) continue;
    const [d, label] = cand[0];
    items.push({ kind: 'movie', id: `mv-${m.id}`, movieId: m.id, title: m.title, code: 'Film', episodeTitle: label, date: d, time: '', airUtc: null, network: '', poster: posterOf('radarr', m.images, m.id), fanart: fanartOf('radarr', m.images), color: artOf('radarr', m.id), monitored: m.monitored !== false,
      ...movieState(m, q), open: { tab: 'radarr', id: m.id } });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title, 'nb'));
  const daysOut = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i), it = items.filter((x) => x.date === d);
    daysOut.push({ date: d, label: dayLabel(d, today), title: longDay(d), short: shortDay(d), today: i === 0, count: it.length, countText: it.length ? `${it.length} stk` : '', items: it });
  }
  const tq = await torrentsOut().catch(() => null);
  const active = tq ? tq.items.filter((t) => ['dl', 'stall', 'meta'].includes(t.status)) : [];
  return { from: today, to: last, days: daysOut, items, downloading: active.slice(0, 3), downloadingCount: active.length, allPaused: tq?.allPaused ?? false, speedText: tq?.transfer.dlText ?? null,
    sources: { sonarr: tv?.error ? { ok: false, error: tv.error } : { ok: !!tv }, radarr: mv?.error ? { ok: false, error: mv.error } : { ok: !!mv } }, ...(tv === null && mv === null ? { configured: false } : {}) };
}

/* ---------------- qBittorrent ---------------- */

const tStatusText = (s, t) => (s === 'meta' ? 'Henter metadata …' : s === 'seed' ? `Ferdig · deler ↑ ${speedText43(t.upspeed ?? 0)}` : s === 'stall' ? `Står fast · ${t.num_seeds ?? 0} seedere` : s === 'pause' ? 'Pauset'
  : s === 'queued' ? 'I køen' : s === 'check' ? 'Sjekker filene …' : s === 'error' ? 'Feil · filene mangler' : `${speedText43(t.dlspeed ?? 0)} · ${etaText43(t.eta)}`);
const parseName = (n) => { const m = String(n).match(/^(.+?)[. _-]S(\d{1,2})(?:E(\d{1,3}))?/i); if (m) return { title: m[1].replace(/[._]/g, ' ').trim(), code: m[3] ? epCode(+m[2], +m[3]) : `S${pad(+m[2])}` }; const y = String(n).match(/^(.+?)[. _(]((?:19|20)\d{2})[. _)]/); return y ? { title: y[1].replace(/[._]/g, ' ').trim(), code: 'Film' } : { title: String(n), code: '' }; };
async function torrentsOut(filter = 'all') {
  const raw = await torrentsRaw();
  if (!raw) return null;
  const [q, series, movies, alt, prefs] = await Promise.all([queues().catch(() => null), svcConf43('sonarr').on ? seriesList().catch(() => []) : [], svcConf43('radarr').on ? movieList().catch(() => []) : [],
    cached('qbit:alt', 2000, () => qb('GET', '/transfer/speedLimitsMode')).catch(() => '0'), cached('qbit:prefs', 60_000, () => qb('GET', '/app/preferences')).catch(() => ({}))]);
  const queueOrder = raw.filter((t) => t.priority > 0).sort((a, b) => a.priority - b.priority).map((t) => t.hash);
  const items = raw.map((t) => {
    const status = TSTATE[t.state] ?? 'dl', progress = Math.round((t.progress ?? 0) * 1000) / 10;
    const ln = q?.link.get(String(t.hash).toLowerCase());
    const p = parseName(t.name);
    let title = p.title, code = p.code, poster = null, color = colorFor(t.name), kind = ln?.svc === 'radarr' || code === 'Film' ? 'movie' : 'episode', open = null;
    if (ln?.svc === 'sonarr') { const s = series.find((x) => x.id === ln.seriesId); if (s) { title = s.title; poster = posterOf('sonarr', s.images, s.id); color = artOf('sonarr', s.id); open = { tab: 'sonarr', id: s.id }; } }
    if (ln?.svc === 'radarr') { const m = movies.find((x) => x.id === ln.movieId); if (m) { title = m.title; code = 'Film'; poster = posterOf('radarr', m.images, m.id); color = artOf('radarr', m.id); open = { tab: 'radarr', id: m.id }; } }
    const size = t.size || t.total_size || 0;
    const res = String(t.name).match(/(2160|1080|720|480)p/)?.[1];
    return { hash: t.hash, name: t.name, title, code, quality: res ? `${res}p` : '', kind, poster, color, open, size, sizeText: status === 'meta' || !size ? 'størrelse ukjent' : sizeText43(size), progress, progressText: `${Math.floor(progress)} %`,
      state: t.state, status, statusText: tStatusText(status, t), dlSpeed: t.dlspeed ?? 0, upSpeed: t.upspeed ?? 0, speedText: speedText43(t.dlspeed ?? 0), eta: t.eta ?? null, etaText: etaText43(t.eta), category: t.category ?? '', savePath: t.save_path ?? '',
      queue: queueOrder.indexOf(t.hash) + 1 || null, seeds: t.num_seeds ?? 0, peers: t.num_leechs ?? 0, addedAt: t.added_on ? new Date(t.added_on * 1000).toISOString() : null, completedAt: t.completion_on > 0 ? new Date(t.completion_on * 1000).toISOString() : null,
      forceStart: !!t.force_start, sequential: !!t.seq_dl, firstLast: !!t.f_l_piece_prio, paused: status === 'pause', done: status === 'seed', canToggle: status !== 'seed' };
  }).sort((a, b) => (a.done - b.done) || ((a.queue ?? 999) - (b.queue ?? 999)) || String(b.addedAt).localeCompare(String(a.addedAt)));
  const F = { all: () => true, active: (t) => ['dl', 'meta', 'check', 'queued'].includes(t.status), paused: (t) => t.status === 'pause', done: (t) => t.status === 'seed', stalled: (t) => t.status === 'stall' || t.status === 'error' };
  const counts = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, items.filter(f).length]));
  const dl = raw.reduce((a, t) => a + (t.dlspeed ?? 0), 0), up = raw.reduce((a, t) => a + (t.upspeed ?? 0), 0);
  const altOn = String(alt).trim() === '1', altLimit = prefs?.alt_dl_limit ?? null;
  const cand = items.filter((t) => !t.done);
  const transfer = { dlSpeed: dl, upSpeed: up, dlText: speedText43(dl), upText: speedText43(up), altSpeed: altOn, altLimit, altLimitText: altLimit ? `grense ${speedText43(altLimit)}` : null, active: counts.active, queued: items.filter((t) => t.status === 'queued').length,
    summary: `${counts.active} aktive · ↑ ${speedText43(up)} · ${items.filter((t) => t.status === 'queued' || t.status === 'pause').length} i køen` };
  return { items: items.filter(F[filter] ?? F.all), total: items.length, counts, filters: [['all', 'Alle'], ['active', 'Aktive'], ['paused', 'Pauset'], ['done', 'Ferdige'], ['stalled', 'Står fast']].map(([id, label]) => ({ id, label, count: counts[id] })),
    transfer, allPaused: cand.length > 0 && cand.every((t) => t.status === 'pause'), allPausedLabel: cand.length > 0 && cand.every((t) => t.status === 'pause') ? 'Fortsett alt' : 'Pause alt' };
}
const HASH_RE = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i;
const okHash = (h) => { if (!HASH_RE.test(String(h ?? ''))) throw new MediaError('Ugyldig hash', 400); return String(h).toLowerCase(); };
async function torrentAction(hash, op, b = {}) {
  hash = okHash(hash);
  if (op === 'pause') await qbVerb('stop', 'pause', hash);
  else if (op === 'resume') await qbVerb('start', 'resume', hash);
  else if (op === 'recheck') await qb('POST', '/torrents/recheck', { form: { hashes: hash } });
  else if (op === 'forceStart') await qb('POST', '/torrents/setForceStart', { form: { hashes: hash, value: b.value === false ? 'false' : 'true' } });
  else if (op === 'priority') {
    const dir = { up: 'increasePrio', down: 'decreasePrio', top: 'topPrio', bottom: 'bottomPrio' }[b.dir ?? b.direction];
    if (!dir) throw new MediaError('dir må være up, down, top eller bottom', 400);
    await qb('POST', `/torrents/${dir}`, { form: { hashes: hash } });
  } else if (op === 'sequential') await qb('POST', '/torrents/toggleSequentialDownload', { form: { hashes: hash } });
  else throw new MediaError('Ukjent handling', 404);
  clearMedia43('qbit:'); clearMedia43('queue');
  const t = (await torrentsOut())?.items.find((x) => x.hash === hash) ?? null;
  const msg = { pause: 'Pauset', resume: 'Fortsetter', recheck: 'Sjekker filene på nytt …', forceStart: t?.status === 'stall' ? 'Tvunget start · venter fortsatt på seedere' : `Tvunget start: ${t?.title ?? ''}`.trim(), priority: t?.queue ? `${t.title} er nå nr. ${t.queue} i køen` : 'Køen er endret', sequential: 'Sekvensiell nedlasting endret' }[op];
  return { ok: true, torrent: t, message: msg };
}
/** Sjekker en magnet-lenke eller .torrent-adresse uten å legge den til. */
export function parseMagnet43(url) {
  const q = String(url ?? '').trim();
  if (!q) return { ok: false, error: 'Lim inn en magnet-lenke eller adressen til en .torrent-fil.' };
  if (/^magnet:\?/i.test(q)) {
    const h = q.match(/xt=urn:btih:([a-z0-9]{32,40})/i);
    if (!h) return { ok: false, error: 'Magnet-lenken mangler xt=urn:btih:… (info-hash).' };
    let hash = h[1].toLowerCase();
    if (hash.length === 32) hash = base32hex(hash);
    if (!hash) return { ok: false, error: 'Info-hashen i magnet-lenken er ugyldig.' };
    let dn = q.match(/[?&]dn=([^&]+)/i)?.[1] ?? '';
    try { dn = dn ? decodeURIComponent(dn.replace(/\+/g, ' ')) : ''; } catch { /* rå */ }
    const trackers = (q.match(/[?&]tr=/gi) ?? []).length;
    return { ok: true, kind: 'magnet', hash, shortHash: hash.slice(0, 12), name: dn || `Magnet ${hash.slice(0, 8)}`, named: !!dn, trackers, info: `btih ${hash.slice(0, 12)}… · ${trackers} trackere${dn ? '' : ' · navnet hentes fra metadata'}` };
  }
  if (/^https?:\/\/\S+\.torrent(\?\S*)?$/i.test(q)) {
    let f = q.split('?')[0].split('/').pop(); try { f = decodeURIComponent(f); } catch { /* */ }
    return { ok: true, kind: 'url', hash: null, name: f.replace(/\.torrent$/i, ''), trackers: null, info: '.torrent-fil · lastes ned av qBittorrent' };
  }
  return { ok: false, error: 'Det ser ikke ut som en magnet-lenke (magnet:?xt=urn:btih:…) eller en adresse som slutter på .torrent.' };
}
function base32hex(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.toUpperCase()) { const v = A.indexOf(ch); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
  return bits.match(/.{8}/g).slice(0, 20).map((b) => parseInt(b, 2).toString(16).padStart(2, '0')).join('');
}
const CATEGORIES43 = [{ id: '', label: 'Ingen', savePath: null }, { id: 'tv-sonarr', label: 'tv-sonarr', savePath: '/data/downloads/tv' }, { id: 'radarr', label: 'radarr', savePath: '/data/downloads/film' }];
async function addMagnet(b) {
  const p = parseMagnet43(b.url ?? b.urls);
  if (!p.ok) throw new MediaError(p.error, 400, { field: 'url' });
  const cat = String(b.category ?? '');
  if (!CATEGORIES43.some((c) => c.id === cat)) throw new MediaError('Kategori må være tom, tv-sonarr eller radarr', 400);
  const raw = await torrentsRaw();
  if (p.hash && (raw ?? []).some((t) => String(t.hash).toLowerCase() === p.hash)) throw new MediaError('Ligger allerede i qBittorrent', 409, { hash: p.hash, exists: true });
  const save = CATEGORIES43.find((c) => c.id === cat)?.savePath ?? extra('qbit_save', '/data/downloads');
  const form = new FormData();
  form.set('urls', String(b.url ?? b.urls).trim());
  if (cat) form.set('category', cat);
  form.set('savepath', save);
  const paused = b.paused === true || b.stopped === true;
  form.set('stopped', String(paused)); form.set('paused', String(paused));
  form.set('sequentialDownload', String(b.sequential === true));
  form.set('firstLastPiecePrio', String(b.firstLast === true));
  const r = await qb('POST', '/torrents/add', { form });
  if (/fails/i.test(String(r))) throw new MediaError('qBittorrent godtok ikke lenken (ligger den der fra før?)', 409);
  clearMedia43('qbit:');
  return { ok: true, parsed: p, torrent: { hash: p.hash, name: p.name, status: paused ? 'pause' : 'meta', statusText: paused ? 'Pauset' : 'Henter metadata …', sizeText: 'størrelse ukjent', category: cat, savePath: save }, message: `Lagt til ${p.name}` };
}
async function filesOf(hash) {
  hash = okHash(hash);
  const list = await qb('GET', '/torrents/files', { query: { hash } });
  return { hash, items: (list ?? []).map((f, i) => ({ index: f.index ?? i, name: f.name, size: f.size ?? 0, sizeText: sizeText43(f.size), progress: Math.round((f.progress ?? 0) * 1000) / 10, priority: f.priority ?? 1, wanted: (f.priority ?? 1) > 0 })) };
}
async function setFiles(hash, b) {
  hash = okHash(hash);
  let list = [];
  if (Array.isArray(b.files)) list = b.files.map((f) => ({ index: +f.index, priority: f.priority !== undefined ? +f.priority : f.wanted === false ? 0 : 1 }));
  else if (b.priority && typeof b.priority === 'object') list = Object.entries(b.priority).map(([i, p]) => ({ index: +i, priority: +p }));
  if (!list.length || list.some((f) => !Number.isInteger(f.index) || f.index < 0 || ![0, 1, 6, 7].includes(f.priority))) throw new MediaError('files: [{index, priority 0|1|6|7}] eller {priority:{index: prioritet}}', 400);
  const by = new Map();
  for (const f of list) by.set(f.priority, [...(by.get(f.priority) ?? []), f.index]);
  for (const [priority, ids] of by) await qb('POST', '/torrents/filePrio', { form: { hash, id: ids.join('|'), priority } });
  clearMedia43('qbit:');
  return filesOf(hash);
}

/* ---------------- Mapper og diskplass ---------------- */

async function rootfolders() {
  const one = async (id) => (svcConf43(id).on ? (await arr(id, 'GET', '/rootfolder').catch(() => [])).map((r) => ({ id: r.id, path: r.path, free: r.freeSpace ?? null, freeText: r.freeSpace != null ? `${sizeText43(r.freeSpace)} ledig` : '', accessible: r.accessible !== false })) : []);
  const [s, r] = await Promise.all([one('sonarr'), one('radarr')]);
  const space = svcConf43('sonarr').on ? await arr('sonarr', 'GET', '/diskspace').catch(() => []) : svcConf43('radarr').on ? await arr('radarr', 'GET', '/diskspace').catch(() => []) : [];
  const freeFor = (p) => { const hit = (space ?? []).filter((d) => p.startsWith(d.path)).sort((a, b) => b.path.length - a.path.length)[0]; return hit ? { free: hit.freeSpace, total: hit.totalSpace } : null; };
  const dirs = [[extra('sonarr_root', '/data/media/tv'), 'Serier'], [extra('radarr_root', '/data/media/film'), 'Filmer'], [extra('qbit_save', '/data/downloads'), 'Nedlastinger']];
  const disk = dirs.map(([path, label]) => { const f = freeFor(path) ?? (s.concat(r).find((x) => x.path === path)?.free != null ? { free: s.concat(r).find((x) => x.path === path).free, total: null } : null); return { path, label, free: f?.free ?? null, total: f?.total ?? null, freeText: f?.free != null ? `${sizeText43(f.free)} ledig` : 'ukjent', low: f?.free != null && f.free < TB }; });
  const minFree = Math.min(...disk.map((d) => d.free ?? Infinity));
  return { sonarr: s, radarr: r, disk, low: Number.isFinite(minFree) && minFree < TB, lowText: Number.isFinite(minFree) && minFree < TB ? `Under 1 TB ledig (${sizeText43(minFree)})` : null };
}

/* ---------------- Prowlarr ---------------- */

async function indexersRaw() { return cached('prowlarr:idx', 30_000, () => arr('prowlarr', 'GET', '/indexer')); }
const PRIV = { public: ['Offentlig', '#2f6b4a'], private: ['Privat', '#b23a2a'], semiPrivate: ['Semi-privat', '#a0671a'], usenet: ['Usenet', '#2b5d8a'] };
const sinceText = (iso) => (iso ? `siden ${osloHm(Date.parse(iso))}` : '');
async function indexersOut() {
  const today = osloDate();
  const [list, status, stats, apps, health] = await Promise.all([indexersRaw(), arr('prowlarr', 'GET', '/indexerstatus').catch(() => []), cached(`prowlarr:stats:${today}`, 60_000, () => arr('prowlarr', 'GET', '/indexerstats', { query: { startDate: `${today}T00:00:00Z` } })).catch(() => ({ indexers: [] })),
    arr('prowlarr', 'GET', '/applications').catch(() => []), arr('prowlarr', 'GET', '/health').catch(() => [])]);
  const tests = kv.get(OWNER, 'media43_idxtest', {}) ?? {};
  const items = (list ?? []).map((x) => {
    const st = (status ?? []).find((s) => s.indexerId === x.id), sx = (stats?.indexers ?? []).find((s) => s.indexerId === x.id) ?? {};
    const failing = !!st && (!st.disabledTill || Date.parse(st.disabledTill) > Date.now());
    const t = tests[x.id];
    const ok = x.enable !== false && !failing && t?.ok !== false;
    const ms = t?.ms ?? sx.averageResponseTime ?? null;
    const kind = x.protocol === 'usenet' ? 'usenet' : x.privacy ?? 'public';
    return { id: x.id, name: x.name, enabled: x.enable !== false, protocol: x.protocol ?? 'torrent', privacy: x.privacy ?? 'public', type: kind, typeLabel: PRIV[kind]?.[0] ?? 'Offentlig', typeColor: PRIV[kind]?.[1] ?? '#2f6b4a', priority: x.priority ?? 25,
      ok, ms: ok ? ms : null, queries: sx.numberOfQueries ?? 0, grabs: sx.numberOfGrabs ?? 0, error: ok ? null : t?.message ?? (st ? `Tidsavbrudd ${sinceText(st.initialFailure)}`.trim() : x.enable === false ? 'Slått av' : 'Feiler'),
      line: ok ? `${ms ?? '–'} ms · ${sx.numberOfQueries ?? 0} søk · ${sx.numberOfGrabs ?? 0} hentet i dag` : (t?.message ?? (st ? `Tidsavbrudd ${sinceText(st.initialFailure)}`.trim() : 'Slått av')), lastTest: t ?? null };
  });
  const okN = items.filter((x) => x.ok).length;
  return { items, summary: { total: items.length, ok: okN, text: `${okN} av ${items.length} indeksere svarer`, queriesToday: items.reduce((a, x) => a + x.queries, 0), grabsToday: items.reduce((a, x) => a + x.grabs, 0),
    line: `${items.reduce((a, x) => a + x.queries, 0)} søk · ${items.reduce((a, x) => a + x.grabs, 0)} hentet i dag` },
    apps: (apps ?? []).map((a) => ({ id: a.id, name: a.name, implementation: a.implementation ?? a.name, syncLevel: a.syncLevel ?? null, label: a.syncLevel === 'fullSync' ? 'Full synk' : a.syncLevel === 'addOnly' ? 'Bare nye' : a.syncLevel ?? '' })),
    health: (health ?? []).map((h) => ({ source: h.source, type: h.type, message: h.message })), healthy: !(health ?? []).some((h) => h.type === 'error') };
}
async function testIndexer(id) {
  const list = await indexersRaw();
  const x = list.find((i) => i.id === +id);
  if (!x) throw new MediaError('Fant ikke indekseren', 404);
  const t0 = Date.now();
  let out;
  try { const r = await arr('prowlarr', 'POST', '/indexer/test', { body: x }); out = { ok: true, ms: r?.ms ?? Date.now() - t0, message: `${x.name} svarte på ${r?.ms ?? Date.now() - t0} ms` }; }
  catch (e) { out = { ok: false, ms: null, message: e.detail || e.message.replace(/^Prowlarr svarte \d+: /, '') }; }
  const tests = kv.get(OWNER, 'media43_idxtest', {}) ?? {};
  kv.set(OWNER, 'media43_idxtest', { ...tests, [x.id]: { ...out, at: new Date().toISOString() } });
  return { id: x.id, name: x.name, ...out };
}
const AUTH_OF = (fields) => { const n = (fields ?? []).map((f) => f.name); return n.includes('apiKey') ? 'key' : n.includes('cookie') ? 'cookie' : n.includes('username') || n.includes('password') ? 'user' : 'none'; };
const AUTH_HELP = { none: 'Ingen innlogging trengs', user: 'Brukernavn og passord fra indekseren', key: 'API-nøkkelen finner du under Profil → Sikkerhet / API på indekseren', cookie: 'Kopier cookien fra nettleseren når du er logget inn (Utviklerverktøy → Nettverk → Cookie)' };
async function schemaList() { return cached('prowlarr:schema', 30 * 60_000, () => arr('prowlarr', 'GET', '/indexer/schema')); }
async function schemaOut(qs = {}) {
  const [all, have] = await Promise.all([schemaList(), indexersRaw().catch(() => [])]);
  const term = String(qs.q ?? '').toLowerCase().trim(), type = qs.type ?? 'all';
  const T = { all: () => true, public: (x) => x.type === 'public', private: (x) => x.type === 'private', semi: (x) => x.type === 'semiPrivate', usenet: (x) => x.type === 'usenet' };
  const items = (all ?? []).map((x) => {
    const kind = x.protocol === 'usenet' ? 'usenet' : x.privacy ?? 'public';
    const auth = AUTH_OF(x.fields);
    const key = x.definitionName ?? x.implementation ?? x.name;
    const added = (have ?? []).some((h) => h.name === x.name || (h.definitionName && h.definitionName === x.definitionName));
    return { key, name: x.name, type: kind, typeLabel: PRIV[kind]?.[0] ?? 'Offentlig', typeColor: PRIV[kind]?.[1] ?? '#2f6b4a', protocol: x.protocol ?? 'torrent', protocolLabel: x.protocol === 'usenet' ? 'Usenet' : 'Torrent', language: x.language ?? '',
      categories: (x.capabilities?.categories ?? []).map((c) => c.name).filter(Boolean).slice(0, 6), description: x.description ?? '', auth, authHelp: AUTH_HELP[auth],
      fields: (x.fields ?? []).filter((f) => !f.hidden && ['username', 'password', 'apiKey', 'cookie'].includes(f.name)).map((f) => ({ name: f.name, label: f.label ?? f.name, type: f.privacy || /password|apiKey|cookie/.test(f.name) ? 'secret' : 'text', help: f.helpText ?? '' })),
      added, addedLabel: added ? 'Lagt til' : null };
  }).filter((x) => (T[type] ?? T.all)(x) && (!term || x.name.toLowerCase().includes(term) || x.categories.join(' ').toLowerCase().includes(term)));
  return { items: items.slice(0, 600), count: items.length, total: (all ?? []).length, filters: [['all', 'Alle'], ['public', 'Offentlig'], ['private', 'Privat'], ['semi', 'Semi-privat'], ['usenet', 'Usenet']].map(([id, label]) => ({ id, label })), priorities: [1, 10, 25, 40, 50], defaultPriority: 25 };
}
async function indexerBody(b) {
  const all = await schemaList();
  const key = b.key ?? b.definitionName;
  const def = all.find((x) => (x.definitionName ?? x.implementation ?? x.name) === key || x.name === b.name);
  if (!def) throw new MediaError('Ukjent indekser', 404);
  const priority = Number.isInteger(+b.priority) ? Math.max(1, Math.min(50, +b.priority)) : 25;
  const vals = b.fields && typeof b.fields === 'object' ? b.fields : {};
  for (const f of (def.fields ?? []).filter((x) => ['username', 'password', 'apiKey', 'cookie'].includes(x.name))) if (!String(vals[f.name] ?? '').trim()) throw new MediaError(`Mangler ${(f.label ?? f.name).toLowerCase()}`, 400, { field: f.name });
  const apps = (await arr('prowlarr', 'GET', '/applications').catch(() => [])) ?? [];
  const tags = [];
  const body = { ...def, name: def.name, enable: true, priority, appProfileId: def.appProfileId ?? 1, tags, fields: (def.fields ?? []).map((f) => (vals[f.name] !== undefined ? { ...f, value: String(vals[f.name]) } : f)) };
  return { def, body, apps, priority };
}
async function testIndexerBody(body) {
  const t0 = Date.now();
  try { await arr('prowlarr', 'POST', '/indexer/test', { body }); }
  catch (e) { throw new MediaError(e.detail || e.message, 400, { field: /passord|password/i.test(e.detail ?? '') ? 'password' : /nøkkel|api ?key/i.test(e.detail ?? '') ? 'apiKey' : null, test: false }); }
  return Date.now() - t0;
}
async function addIndexer(b) {
  const { def, body, apps, priority } = await indexerBody(b);
  const ms = await testIndexerBody(body);
  const created = await arr('prowlarr', 'POST', '/indexer', { body });
  clearMedia43('prowlarr:');
  const sync = [b.sonarr !== false && apps.some((a) => /sonarr/i.test(a.implementation ?? a.name)) ? 'Sonarr' : null, b.radarr !== false && apps.some((a) => /radarr/i.test(a.implementation ?? a.name)) ? 'Radarr' : null].filter(Boolean);
  if (sync.length) await arr('prowlarr', 'POST', '/command', { body: { name: 'ApplicationIndexerSync' } }).catch(() => null);
  return { ok: true, indexer: { id: created?.id ?? null, name: def.name, priority }, ms, synced: sync, message: `${def.name} lagt til · svarte på ${ms} ms${sync.length ? ` · synket til ${sync.join(' og ')}` : ''}` };
}

/* ---------------- Status ---------------- */

/** Test tilkobling (Integrasjoner): «✓ Sonarr v4 svarte på 142 ms». vals = verdiene som testes (ellers serverens). */
export async function mediaTest43(id, vals = null) {
  const d = SERVICES43[id === 'qbittorrent' ? 'qbit' : id];
  if (!d) return { ok: false, message: 'Ukjent tjeneste' };
  const sid = id === 'qbittorrent' ? 'qbit' : id;
  const c = svcConf43(sid, vals);
  if (!c.on) {
    const miss = !c.url ? 'adresse' : d.missing.toLowerCase();
    return { ok: false, code: 'missing', message: `Mangler ${miss}`, missing: !c.url ? d.url : d.key };
  }
  const t0 = Date.now();
  try {
    let version = '';
    if (sid === 'sonarr' || sid === 'radarr' || sid === 'prowlarr') version = (await arr(sid, 'GET', '/system/status', { conf: c }))?.version ?? '';
    else if (sid === 'qbit') { qbSid.delete(c.url); version = String(await qb('GET', '/app/version', { conf: c })).trim(); }
    else if (sid === 'jellyfin') { const r = await rawFetch(`${c.url}/System/Info`, { headers: { 'X-Emby-Token': c.key, Accept: 'application/json' } }); if (!r.ok) throw await errorOf(c, r); version = (await r.json()).Version ?? ''; }
    else if (sid === 'plex') { const r = await rawFetch(`${c.url}/identity`, { headers: { 'X-Plex-Token': c.key, Accept: 'application/json' } }); if (!r.ok) throw await errorOf(c, r); version = (await r.json().catch(() => ({})))?.MediaContainer?.version ?? ''; }
    const ms = Date.now() - t0;
    const v = String(version).replace(/^v/, '');
    return { ok: true, ms, version: v || null, mock: c.mock || undefined, message: `✓ ${d.name}${v ? ` v${v.split('.')[0]}` : ''} svarte på ${ms} ms${c.mock ? ' (demodata)' : ''}` };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, message: e.message, code: e.code ?? (e.upstream === 401 ? '401' : null) };
  }
}
const LASTOK = 'media44_lastok';
const lastOk43 = (sid, site) => (kv.get(OWNER, LASTOK, {}) ?? {})[`${site ?? 'hjemme'}:${sid}`] ?? null;
function markOk43(sid, site) { const m = kv.get(OWNER, LASTOK, {}) ?? {}, k = `${site ?? 'hjemme'}:${sid}`, prev = m[k] ? Date.parse(m[k]) : 0; if (Date.now() - prev > 60_000) { m[k] = new Date().toISOString(); kv.set(OWNER, LASTOK, m); } }
async function statusOut(u) {
  const ids = ['sonarr', 'radarr', 'qbit', 'prowlarr', 'jellyfin', 'plex'];
  const admin = isAdmin(u);
  const services = await Promise.all(ids.map(async (id) => {
    const c = svcConf43(id);
    // Prompt 44: samme felt som GET /api/integrations/status – {service, site, connected, lastOk, error, source} – så Media og
    // Innstillinger viser det samme. state: 'ok' | 'missing' («Ikke satt opp») | 'down' («Svarer ikke»).
    const sid = id === 'qbit' ? 'qbittorrent' : id;
    const base = { id: sid, service: sid, name: c.name, configured: c.configured || !!c.mock, mock: c.mock || undefined, site: c.site ?? 'hjemme', source: 'server', configSource: c.mock ? 'mock' : c.site ? 'site' : c.source ?? 'owner', ...(c.fallback ? { fallback: true, requestedSite: c.requestedSite } : {}),
      ...(admin && c.configured ? { url: c.url } : {}) };
    if (!c.on) return { ...base, configured: false, ok: false, connected: false, state: 'missing', version: null, ms: null, lastOk: lastOk43(sid, c.site), text: 'Ikke satt opp', error: null };
    const t = await cached(`status:${id}:${c.url}:${c.key.length}`, 30_000, () => mediaTest43(id));
    if (t.ok) markOk43(sid, c.site);
    return { ...base, ok: t.ok, connected: t.ok, state: t.ok ? 'ok' : 'down', version: t.version ?? null, ms: t.ms ?? null, lastOk: lastOk43(sid, c.site), text: t.ok ? `v${t.version ?? '?'} · ${t.ms} ms` : t.message, error: t.ok ? null : t.message };
  }));
  const p = prefsOf(u);
  return { services, mock: services.some((s) => s.mock), admin, canEdit: admin, settings: p, play: playOf('', u), setupRoute: 'innstillinger/integrasjoner#media',
    ...(admin ? { hooks: hookUrls() } : {}) };
}

/* ---------------- Glimt i Media ---------------- */

const SIZE_RE = /episode[rn]?\s+(?:av|fra|i)\s+(.+?)\s+(?:som\s+er\s+|på\s+)?(under|over|mindre enn|større enn|maks|minst)\s*([\d.,]+)\s*(mb|gb)/i;
async function glimt(u, qRaw) {
  const q = String(qRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) throw new MediaError('Skriv hva Glimt skal gjøre', 400);
  const low = q.toLowerCase();
  const steps = [];
  const step = async (t, fn) => { const t0 = Date.now(); try { const r = await fn(); steps.push({ t: typeof t === 'function' ? t(r) : t, ms: Date.now() - t0, ok: true }); return r; } catch (e) { steps.push({ t: typeof t === 'function' ? t(null) : t, ms: Date.now() - t0, ok: false, error: e.message }); throw e; } };
  const out = (o) => ({ q, steps, actions: [], results: [], ...o });
  steps.push({ t: 'Forstår forespørselen', ms: 0, ok: true });
  if (/^(pause|stopp)\s+alt/.test(low)) { await step('Pauser nedlastinger i qBittorrent', () => qbVerb('stop', 'pause', 'all')); clearMedia43('qbit:'); return out({ kind: 'pause', text: 'Alt er pauset.', actions: [{ type: 'resumeAll', label: 'Fortsett alt' }] }); }
  if (/^(fortsett|start)\s+alt/.test(low)) { await step('Starter nedlastinger i qBittorrent', () => qbVerb('start', 'resume', 'all')); clearMedia43('qbit:'); return out({ kind: 'resume', text: 'Alle nedlastinger går igjen.', actions: [{ type: 'pauseAll', label: 'Pause alt' }] }); }
  if (/lastes|laster ned|nedlasting/.test(low) && !/legg til/.test(low)) {
    const t = await step('Leser køen i qBittorrent', () => torrentsOut());
    const a = (t?.items ?? []).filter((x) => x.status === 'dl');
    return out({ kind: 'status', text: a.length ? `Lastes ned nå: ${a.map((x) => `${x.title}${x.code && x.code !== 'Film' ? ` ${x.code}` : ''} (${Math.floor(x.progress)} %)`).join(', ')}` : 'Ingenting lastes ned nå.', results: a.map((x) => ({ type: 'torrent', ...x })) });
  }
  if (/episode/.test(low) && /(under|over|mindre enn|større enn|maks|minst)\s*[\d.,]+\s*(mb|gb)/.test(low)) {
    const m = q.match(SIZE_RE);
    if (!m) return out({ kind: 'help', text: 'Prøv «finn en episode av The Rookie som er under 500 MB».' });
    const ttl = m[1].replace(/^(en|ei|et)\s+/i, '').trim(), lt = /under|mindre|maks/i.test(m[2]), lim = parseFloat(m[3].replace(',', '.')) * (m[4].toLowerCase() === 'gb' ? 1024 : 1) * MB, limT = `${m[3]} ${m[4].toUpperCase()}`;
    const lib = await step('Søker i Sonarr', () => seriesList());
    const hit = lib.find((s) => s.title.toLowerCase() === ttl.toLowerCase()) ?? lib.find((s) => s.title.toLowerCase().includes(ttl.toLowerCase()));
    if (!hit) {
      const look = await lookupSeries(ttl).catch(() => []);
      if (!look.length) return out({ kind: 'none', text: `Fant ingen serie som heter «${ttl}».` });
      steps.push({ t: `${look[0].title} er ikke i biblioteket`, ms: 0, ok: true });
      const prof = await profileFor43('sonarr', null);
      return out({ kind: 'add', text: `${look[0].title} er ikke i biblioteket. Vil du legge den til?`, results: [addResult(look[0], prof, 'all')], actions: [addAction(look[0], prof, 'all')] });
    }
    steps[steps.length - 1].t = `Fant ${hit.title} i Sonarr`;
    const eps = await arr('sonarr', 'GET', '/episode', { query: { seriesId: hit.id } });
    const aired = eps.filter((e) => e.seasonNumber > 0 && e.airDateUtc && Date.parse(e.airDateUtc) <= Date.now());
    const byNew = (a, b) => b.seasonNumber - a.seasonNumber || b.episodeNumber - a.episodeNumber;
    const pick = [...aired.filter((e) => !e.hasFile).sort(byNew), ...aired.filter((e) => e.hasFile).sort(byNew)].slice(0, 3);
    const t0 = Date.now();
    const res = await Promise.all(pick.map((e) => arr('sonarr', 'GET', '/release', { query: { episodeId: e.id } }).then((rows) => ({ e, rows })).catch(() => ({ e, rows: [] }))));
    let nIdx = 0; try { nIdx = (await indexersRaw()).filter((x) => x.enable !== false).length; } catch { nIdx = new Set(res.flatMap((x) => x.rows.map((r) => r.indexer))).size; }
    steps.push({ t: `Søker i ${nIdx} indeksere via Prowlarr`, ms: Date.now() - t0, ok: true });
    const list = [];
    for (const { e, rows } of res) {
      const prefix = hit.title.replace(/[':]/g, '').replace(/[^A-Za-z0-9]+/g, '.').replace(/\.$/, '');
      const ok = rows.map((r) => releaseOut(r, 'sonarr', { titlePrefix: prefix, seriesId: hit.id, episodeId: e.id })).filter((r) => (r.seeders ?? 0) > 0 && (lt ? r.size <= lim : r.size >= lim)).sort((a, b) => b.seeders - a.seeders).slice(0, 2);
      for (const r of ok) list.push({ kind: 'release', episodeId: e.id, seriesId: hit.id, code: epCode(e.seasonNumber, e.episodeNumber), episodeTitle: e.title, has: !!e.hasFile, hasText: e.hasFile ? 'har den' : 'mangler', release: r, sizeTone: 'good',
        action: { type: 'grab', label: 'Last ned', method: 'POST', path: '/api/media/release', body: { guid: r.guid, indexerId: r.indexerId, service: 'sonarr' } } });
    }
    steps.push({ t: `Filtrerer på ${lt ? 'under' : 'over'} ${limT} · ${list.length} treff`, ms: 0, ok: true });
    if (!list.length) return out({ kind: 'size', text: `Fant ingen utgivelser av ${hit.title} ${lt ? 'under' : 'over'} ${limT} med seedere.`, series: { id: hit.id, title: hit.title } });
    const miss = aired.filter((e) => !e.hasFile).length;
    return out({ kind: 'size', text: `${list.length} ${list.length === 1 ? 'utgivelse' : 'utgivelser'} av ${hit.title} ${lt ? 'under' : 'over'} ${limT}${miss ? ` · ${miss} ${miss === 1 ? 'episode mangler' : 'episoder mangler'}` : ''}.`, series: { id: hit.id, title: hit.title }, limit: limT, under: lt, results: list, actions: list.map((x) => x.action) });
  }
  const m = q.match(/(?:legg til|last ned|hent|finn)\s+(.+?)(?:\s+(?:i|på)\s+(4k|uhd|2160p?|1080p?|720p?|hd))?\s*$/i);
  if (m) {
    const ttl = m[1].trim(), qq = (m[2] ?? '').toLowerCase();
    const want = /4k|uhd|2160/.test(qq) ? 'Ultra-HD' : /720/.test(qq) ? 'HD-720p' : qq ? 'HD-1080p' : null;
    const [ser, mov] = await step('Søker i Sonarr og Radarr', () => Promise.all([svcConf43('sonarr').on ? lookupSeries(ttl).catch(() => []) : [], svcConf43('radarr').on ? lookupMovies(ttl).catch(() => []) : []]));
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9æøå]+/g, ' ').trim();
    const all = [...ser, ...mov];
    const hit = all.find((x) => norm(x.title) === norm(ttl)) ?? all.find((x) => norm(x.title).includes(norm(ttl))) ?? null;
    if (!hit) return out({ kind: 'none', text: `Fant ingenting som heter «${ttl}».` });
    const svc = hit.kind === 'series' ? 'sonarr' : 'radarr';
    const prof = await profileFor43(svc, want);
    if (hit.exists) { steps.push({ t: 'Fant den i biblioteket', ms: 0, ok: true }); return out({ kind: 'exists', text: `${hit.title} finnes allerede.`, results: [{ ...addResult(hit, prof, 'all'), exists: true, existsLabel: 'Finnes allerede' }], actions: [{ type: 'open', label: 'Åpne', tab: svc, id: hit.id }] }); }
    steps.push({ t: `Valgte profil ${prof?.name ?? want ?? '–'}`, ms: 0, ok: true });
    return out({ kind: 'add', text: `${hit.title}${hit.year ? ` (${hit.year})` : ''} · ${prof?.name ?? ''}${hit.kind === 'series' ? ' · Alle episoder' : ''}`, results: [addResult(hit, prof, 'all')], actions: [addAction(hit, prof, 'all'), { type: 'edit', label: 'Endre', kind: hit.kind, prefill: addAction(hit, prof, 'all').body }] });
  }
  return out({ kind: 'help', text: 'Prøv «legg til Severance i 4K», «finn en episode av The Rookie som er under 500 MB», «pause alt» eller «hva lastes ned».' });
}
const addBody = (x, prof, mon) => (x.kind === 'series' ? { tvdbId: x.tvdbId, title: x.title, profileId: prof?.id ?? null, profile: prof?.name ?? null, monitor: mon, seriesType: 'standard', searchNow: true }
  : { tmdbId: x.tmdbId, title: x.title, profileId: prof?.id ?? null, profile: prof?.name ?? null, minimumAvailability: 'released', searchNow: true });
const addAction = (x, prof, mon) => ({ type: 'add', label: 'Legg til', kind: x.kind, method: 'POST', path: x.kind === 'series' ? '/api/media/series' : '/api/media/movies', body: addBody(x, prof, mon) });
const addResult = (x, prof, mon) => ({ kind: x.kind, title: x.title, year: x.year, network: x.network ?? '', poster: x.poster, color: x.color, exists: !!x.exists, id: x.id ?? null, tvdbId: x.tvdbId ?? null, tmdbId: x.tmdbId ?? null,
  profile: prof?.name ?? null, profileId: prof?.id ?? null, ...(x.kind === 'series' ? { monitor: mon, monitorLabel: monLabel(mon) } : { minimumAvailability: 'released', availabilityLabel: 'Utgitt digitalt' }) });

/* ---------------- Tilgang og innstillinger ---------------- */

const ACCESS_KEY = 'media43_access';
export const mediaAllowed43 = (u) => !!u && (isAdmin(u) || ((kv.get(OWNER, ACCESS_KEY, {}) ?? {}).users ?? []).includes(u));
const DEF_PREFS = { notifyDone: true, notifyFail: true, calendar: true, player: 'jellyfin' };
export const prefsOf = (u) => ({ ...DEF_PREFS, ...(kv.get(u, 'media43_prefs', {}) ?? {}) });
const hookToken = () => { let t = kv.get(OWNER, 'media43_hook', null); if (!t) { t = randomBytes(18).toString('base64url'); kv.set(OWNER, 'media43_hook', t); } return t; };
/** Webhook-sti med token (vises bare for admin, bl.a. i oppsettstegene under Integrasjoner). */
export const mediaHookPath43 = (svc) => `/api/media/hook/${svc}?token=${hookToken()}`;
const hookUrls = () => { const t = hookToken(); return Object.fromEntries(['sonarr', 'radarr', 'prowlarr', 'qbit'].map((s) => [s, `/api/media/hook/${s}?token=${t}`])); };

/* ---------------- Varsler (jobb hvert 2. min) ---------------- */

const WATCH = 'media43_watch';
const playerName = (u) => (prefsOf(u).player === 'plex' ? 'Plex' : 'Jellyfin');
async function notifyMedia(kind, title, body, tag) {
  const users = listUsers().map((x) => x.id).filter((id) => mediaAllowed43(id));
  let n = 0;
  for (const u of users) {
    const p = prefsOf(u);
    if (kind === 'done' ? !p.notifyDone : !p.notifyFail) continue;
    const t = typeof title === 'function' ? title(u) : title;
    try { await notifyUser(u, { title: t, body, url: '/#/media', tag, category: 'media', data: { kind: `media.${kind}` } }); n++; } catch { /* */ }
  }
  return n;
}
/** Én runde: ferdige nedlastinger, står fast (0 seedere i 30 min), indeksere nede og lite diskplass. Returnerer det som ble varslet. */
export async function mediaWatch43({ now = Date.now() } = {}) {
  const sent = [];
  const w = kv.get(OWNER, WATCH, { t: {}, idx: {}, disk: null }) ?? { t: {}, idx: {}, disk: null };
  w.t ??= {}; w.idx ??= {};
  const t = await torrentsOut().catch(() => null);
  if (t) {
    const seen = new Set();
    for (const x of t.items) {
      seen.add(x.hash);
      const prev = w.t[x.hash] ?? { p: x.progress, first: true };
      const cur = { p: x.progress, stallSince: x.status === 'stall' && x.seeds === 0 ? prev.stallSince ?? now : null, done: prev.done, stallSent: x.status === 'stall' ? prev.stallSent : false };
      if (x.done && !prev.done && !prev.first) {
        const label = `${x.title}${x.code && x.code !== 'Film' ? ` ${x.code}` : ''}`;
        await notifyMedia('done', (u) => `Ferdig: ${label} · klar i ${playerName(u)}`, '', `media-done-${x.hash}`);
        sent.push({ kind: 'done', hash: x.hash, text: `Ferdig: ${label} · klar i Jellyfin` });
      }
      if (x.done) cur.done = true;
      if (cur.stallSince && !cur.stallSent && now - cur.stallSince >= 30 * 60_000) {
        const label = `${x.title}${x.code && x.code !== 'Film' ? ` ${x.code}` : ''}`;
        await notifyMedia('fail', `Står fast: ${label}`, '0 seedere i 30 min', `media-stall-${x.hash}`);
        cur.stallSent = true; sent.push({ kind: 'stall', hash: x.hash, text: `Står fast: ${label} · 0 seedere i 30 min` });
      }
      w.t[x.hash] = cur;
    }
    for (const h of Object.keys(w.t)) if (!seen.has(h)) delete w.t[h];
  }
  if (svcConf43('prowlarr').on) {
    const day = osloDate(now);
    const st = await arr('prowlarr', 'GET', '/indexerstatus').catch(() => []);
    const idx = await indexersRaw().catch(() => []);
    for (const s of st ?? []) {
      if (w.idx[s.indexerId] === day) continue;
      const name = idx.find((x) => x.id === s.indexerId)?.name ?? `Indekser ${s.indexerId}`;
      await notifyMedia('fail', `Indekser nede: ${name}`, `Feiler ${sinceText(s.initialFailure)}`.trim(), `media-idx-${s.indexerId}`);
      w.idx[s.indexerId] = day; sent.push({ kind: 'indexer', id: s.indexerId, text: `Indekser nede: ${name}` });
    }
  }
  if (svcConf43('sonarr').on || svcConf43('radarr').on) {
    const d = await rootfolders().catch(() => null);
    const day = osloDate(now);
    if (d?.low && w.disk !== day) { await notifyMedia('fail', 'Lite diskplass', d.lowText, 'media-disk'); w.disk = day; sent.push({ kind: 'disk', text: d.lowText }); }
  }
  kv.set(OWNER, WATCH, w);
  return sent;
}
let watchTimer = null;
export function startMediaWatch43() {
  if (watchTimer) return;
  watchTimer = setInterval(() => { mediaWatch43().catch((e) => console.warn('[media] varsler:', e.message)); }, 2 * 60_000);
  watchTimer.unref?.();
  setTimeout(() => mediaWatch43().catch(() => {}), 15_000).unref?.();
}

/* ---------------- Widget ---------------- */

/** /api/widgets/media og /api/media/widget: aktiv kø + 3 neste fra kalenderen (cache 60 s). */
export async function mediaWidget43(u) {
  return cached(`widget:${u}`, 60_000, async () => {
    const [t, up] = await Promise.all([torrentsOut().catch(() => null), upcoming43(7).catch(() => null)]);
    const today = osloDate();
    const active = (t?.items ?? []).filter((x) => ['dl', 'stall', 'meta', 'pause'].includes(x.status)).sort((a, b) => (a.status === 'pause') - (b.status === 'pause'));
    const next = (up?.items ?? []).filter((x) => x.status !== 'ok').slice(0, 3);
    const dlN = (t?.items ?? []).filter((x) => x.status === 'dl').length;
    return { configured: !!t || !!up?.items, speed: t?.transfer.dlSpeed ?? 0, speedText: t?.transfer.dlText ?? '0 MB/s', upText: t?.transfer.upText ?? '0 MB/s', active: dlN, activeText: `${dlN} aktive · ↑ ${t?.transfer.upText ?? '0 MB/s'}`,
      bigText: `${dlN} lastes ned`, allPaused: t?.allPaused ?? false, altSpeed: t?.transfer.altSpeed ?? false,
      downloads: active.slice(0, 3).map((x) => ({ hash: x.hash, title: x.title, code: x.code, progress: x.progress, progressText: x.progressText, status: x.status, statusText: x.statusText, stalled: x.status === 'stall', speedText: x.speedText, etaText: x.etaText, poster: x.poster, color: x.color, deepLink: `papir://media/qbittorrent/${x.hash}`, open: { tab: 'qbittorrent', hash: x.hash } })),
      upcoming: next.map((x) => ({ id: x.id, kind: x.kind, title: x.title, code: x.code, episodeTitle: x.episodeTitle, date: x.date, time: x.time, when: whenShort(x.date, x.time, today), poster: x.poster, color: x.color, status: x.status, statusText: x.statusText,
        deepLink: x.kind === 'movie' ? `papir://media/radarr/${x.movieId}` : `papir://media/sonarr/${x.seriesId}`, open: x.open })),
      hide: !active.length && !(up?.items ?? []).length, tab: active.length ? 'qbittorrent' : 'kom', updatedAt: new Date().toISOString(), refreshSec: active.some((x) => x.status === 'dl') ? 300 : 3600 };
  });
}

/* ---------------- Kalender (kilde «media») ---------------- */

export const MEDIA_CAL43 = { id: 'media', key: 'media', name: 'Media', color: '#5a4a6b', textColor: '#45385a', lightColor: '#b9a8d6' };
export function mediaCalendar43(u, count = 0) {
  const p = prefsOf(u);
  return { ...MEDIA_CAL43, source: 'builtin', origin: 'media', sourceLabel: 'Media', src: 'Media', badge: 'INNEBYGD', visible: p.calendar !== false, hidMenu: false, builtin: true, writable: false, removable: false, virtual: true, kind: 'media', backend: 'media', count, note: 'Fra Sonarr og Radarr · slås av i Media → ⚙' };
}
async function mediaEvents43(u, from, to) {
  const days = Math.max(1, Math.min(31, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${osloDate()}T00:00:00Z`)) / 86400_000) + 1));
  if (to < osloDate()) return [];
  const up = await upcoming43(days).catch(() => null);
  return (up?.items ?? []).filter((x) => x.date >= from && x.date <= to).map((x) => {
    const allDay = x.kind === 'movie' || !x.time;
    const start = allDay ? x.date : x.airUtc;
    const title = x.kind === 'movie' ? `${x.title} · ${x.episodeTitle.toLowerCase()}` : `${x.title} · ${x.code}`;
    return { id: `media-${x.id}`, title, short: title.length > 18 ? `${title.slice(0, 17)}…` : title, subject: null, room: '', teacher: '', note: x.episodeTitle || '', start, end: allDay ? addDays(x.date, 1) : new Date(Date.parse(x.airUtc) + 45 * 60_000).toISOString(),
      allDay, date: x.date, time: allDay ? null : x.time, inAllDayRow: allDay, type: 'media', color: MEDIA_CAL43.color, source: 'media', calendar: 'media', editable: false, kind: x.kind, code: x.code, episodeTitle: x.episodeTitle, status: x.status, statusText: x.statusText,
      deepLink: x.kind === 'movie' ? `papir://media/radarr/${x.movieId}` : `papir://media/sonarr/${x.seriesId}`, url: '/#/media', openLabel: 'Åpne i Media ›', origin: 'Media', appCalendar: 'media', appColor: MEDIA_CAL43.color };
  });
}
addEventSource(async (u, from, to) => (mediaAllowed43(u) && prefsOf(u).calendar !== false && (svcConf43('sonarr').on || svcConf43('radarr').on) && !(MOCK() && process.env.NODE_ENV === 'test' && !kv.get(u, 'media43_prefs', null)?.calendar)
  ? { id: 'media', name: 'Media', events: await mediaEvents43(u, from, to) } : null));
/** Mellomvare foran /api/kalender/calendars: «Media» i lista og PATCH /calendars/media {visible}. */
export async function mediaCalendarsMw43(c, next) {
  const path = c.req.path.replace(/\/+$/, '');
  if (c.req.method === 'PATCH' && /\/calendars\/media$/.test(path)) {
    return authOrToken(c, async () => {
      const u = c.get('user'), b = await c.req.json().catch(() => null);
      if (!mediaAllowed43(u)) { c.res = c.json({ error: 'Du har ikke tilgang til Media' }, 403); return; }
      if (!b || typeof b.visible !== 'boolean') { c.res = c.json({ error: 'visible må være true eller false' }, 400); return; }
      kv.set(u, 'media43_prefs', { ...(kv.get(u, 'media43_prefs', {}) ?? {}), calendar: b.visible });
      c.res = c.json({ calendar: mediaCalendar43(u) });
    });
  }
  if (c.req.method === 'DELETE' && /\/calendars\/media$/.test(path)) return c.json({ error: 'De innebygde kalenderne kan ikke slettes. Skjul den i stedet.' }, 403);
  await next();
  if (c.req.method !== 'GET' || !/\/calendars$/.test(path) || c.res?.status !== 200) return;
  try {
    const u = c.get('user');
    if (!u || !mediaAllowed43(u) || !(svcConf43('sonarr').on || svcConf43('radarr').on)) return;
    const j = await c.res.clone().json();
    if (!Array.isArray(j.calendars) || j.calendars.some((x) => x.id === 'media')) return;
    c.res = c.json({ ...j, calendars: [...j.calendars, mediaCalendar43(u)] }, 200, { 'Cache-Control': 'no-store' });
  } catch { /* lista står */ }
}

/* ---------------- Ruter ---------------- */

export const media43Api = new Hono();
const fail = (c, e) => {
  if (!(e instanceof MediaError)) console.warn('[media]', c.req.path, e.message);
  const st = e instanceof MediaError ? e.status : 502;
  return c.json({ error: e.message, ...(e.service ? { service: e.service } : {}), ...(e.configured === false ? { configured: false } : {}), ...(e.field ? { field: e.field } : {}), ...(e.exists ? { exists: true, id: e.id ?? undefined, hash: e.hash ?? undefined } : {}) }, st >= 400 && st < 600 ? st : 502);
};
const H = (fn) => async (c) => { try { return c.json(await fn(c)); } catch (e) { return fail(c, e); } };
/** GET-lister: ikke satt opp → 200 {configured:false, items:[]}, så klientene viser en tomtilstand. */
const L = (svc, fn) => async (c) => { if (!svcConf43(svc).on) return c.json({ configured: false, service: svc === 'qbit' ? 'qbittorrent' : svc, items: [], message: `${SERVICES43[svc].name} er ikke satt opp. Innstillinger → Integrasjoner → Media.` }); return H(fn)(c); };
const guard = async (c, next) => { if (!mediaAllowed43(c.get('user'))) return c.json({ error: 'Du har ikke tilgang til Media. Be en administrator om tilgang.', restricted: true }, 403); await next(); };
const admin = async (c, next) => { if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan gjøre dette i Media', restricted: true }, 403); await next(); };
const G = [authOrToken, guard], A = [authOrToken, guard, admin];
const jb = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };

// Webhooks fra Sonarr/Radarr/Prowlarr og qBittorrent («Kjør eksternt program»). Fra LAN eller med ?token= (GET /api/media/status → hooks).
media43Api.post('/hook/:svc', async (c) => {
  const svc = c.req.param('svc');
  if (!['sonarr', 'radarr', 'prowlarr', 'qbit'].includes(svc)) return c.json({ error: 'Ukjent tjeneste' }, 404);
  // Uten token bare direkte fra LAN (ingen proxy-hoder, ellers kunne hvem som helst bak proxyen sendt varsler).
  const direct = !c.req.header('x-forwarded-for') && !c.req.header('cf-connecting-ip') && isLan(String(c.env?.incoming?.socket?.remoteAddress ?? '').replace(/^::ffff:/, ''));
  if (c.req.query('token') !== hookToken() && !direct) return c.json({ error: 'Mangler token' }, 401);
  let b = {};
  const ct = c.req.header('content-type') ?? '';
  try { b = ct.includes('json') ? await c.req.json() : Object.fromEntries(new URLSearchParams(await c.req.text())); } catch { b = {}; }
  clearMedia43();
  let note = null;
  if (svc === 'qbit') { const name = String(b.name ?? b.n ?? '').slice(0, 200); if (name) { const p = parseName(name); note = `Ferdig: ${p.title}${p.code && p.code !== 'Film' ? ` ${p.code}` : ''}`; await notifyMedia('done', (u) => `${note} · klar i ${playerName(u)}`, '', `media-done-${String(b.hash ?? '').toLowerCase()}`); } }
  else if (b.eventType === 'Download') {
    const e = b.episodes?.[0];
    note = svc === 'sonarr' && b.series ? `Ferdig: ${b.series.title}${e ? ` ${epCode(e.seasonNumber, e.episodeNumber)}` : ''}` : b.movie ? `Ferdig: ${b.movie.title}` : null;
    if (note) await notifyMedia('done', (u) => `${note} · klar i ${playerName(u)}`, '', `media-done-${svc}-${e?.id ?? b.movie?.id ?? ''}`);
  } else if (b.eventType === 'Health' || b.eventType === 'HealthIssue') { note = `${SERVICES43[svc].name}: ${String(b.message ?? 'helsevarsel').slice(0, 200)}`; await notifyMedia('fail', note, '', `media-health-${svc}`); }
  return c.json({ ok: true, event: b.eventType ?? (svc === 'qbit' ? 'finished' : null), notified: note });
});

// GET /api/media/status → {services:[{id, name, configured, ok, version, ms, text, url?(admin), mock?}], mock, admin, canEdit, settings, play, setupRoute, hooks?(admin)}
media43Api.get('/status', ...G, H((c) => statusOut(c.get('user'))));
// GET/PUT /api/media/settings {notifyDone, notifyFail, calendar, player:'jellyfin'|'plex'}
media43Api.get('/settings', ...G, (c) => c.json(prefsOf(c.get('user'))));
media43Api.put('/settings', ...G, async (c) => {
  const u = c.get('user'), b = await jb(c), cur = kv.get(u, 'media43_prefs', {}) ?? {};
  for (const k of ['notifyDone', 'notifyFail', 'calendar']) if (k in b) { if (typeof b[k] !== 'boolean') return c.json({ error: `${k} må være true eller false` }, 400); cur[k] = b[k]; }
  if ('player' in b) { if (!['jellyfin', 'plex'].includes(b.player)) return c.json({ error: 'player må være jellyfin eller plex' }, 400); cur.player = b.player; }
  kv.set(u, 'media43_prefs', cur);
  clearMedia43(`widget:${u}`);
  return c.json(prefsOf(u));
});
// GET /api/media/access (admin) → {users:[{id, name, admin, allowed}]} · PUT {userId, allowed}
media43Api.get('/access', ...A, (c) => c.json({ users: listUsers().map((x) => ({ id: x.id, name: x.name ?? x.username, admin: isAdmin(x.id), allowed: mediaAllowed43(x.id) })) }));
media43Api.put('/access', ...A, async (c) => {
  const b = await jb(c);
  if (!b.userId || !userInfo(b.userId)) return c.json({ error: 'Ukjent bruker' }, 400);
  const cur = kv.get(OWNER, ACCESS_KEY, {}) ?? {}, set = new Set(cur.users ?? []);
  if (b.allowed) set.add(b.userId); else set.delete(b.userId);
  kv.set(OWNER, ACCESS_KEY, { users: [...set] });
  return c.json({ userId: b.userId, allowed: mediaAllowed43(b.userId) });
});
// GET /api/media/upcoming?days=7 → {from, to, days:[{date, label, title, short, today, count, countText, items}], items:[Item], downloading:[Torrent ×3], downloadingCount, allPaused, speedText, sources}
media43Api.get('/upcoming', ...G, H((c) => upcoming43(c.req.query('days') ?? 7)));
media43Api.get('/calendar', ...G, H((c) => upcoming43(c.req.query('days') ?? 7)));
media43Api.get('/widget', ...G, H((c) => mediaWidget43(c.get('user'))));
// Sonarr
media43Api.get('/series', ...G, L('sonarr', () => libSeries()));
media43Api.get('/series/lookup', ...G, L('sonarr', async (c) => ({ items: await lookupSeries(String(c.req.query('term') ?? c.req.query('q') ?? '').trim().slice(0, 100)) })));
media43Api.get('/series/:id{[0-9]+}', ...G, H((c) => seriesDetail(+c.req.param('id'), c.get('user'))));
media43Api.post('/series', ...G, H(async (c) => addSeries(await jb(c))));
media43Api.put('/series/:id{[0-9]+}', ...A, H(async (c) => ({ series: await updateSeries(+c.req.param('id'), await jb(c)) })));
// PUT /api/media/episode/monitor {episodeIds:[id], monitored} · PUT /api/media/episodes/:id {monitored} → {ok, episodeIds, monitored}
const monitorEps = async (ids, mon) => { ids = ids.map(Number).filter(Number.isInteger).slice(0, 1000); if (!ids.length) throw new MediaError('Mangler episodeIds', 400); await arr('sonarr', 'PUT', '/episode/monitor', { body: { episodeIds: ids, monitored: !!mon } }); clearMedia43('sonarr:'); clearMedia43('cal'); return { ok: true, episodeIds: ids, monitored: !!mon }; };
media43Api.put('/episode/monitor', ...A, H(async (c) => { const b = await jb(c); return monitorEps(Array.isArray(b.episodeIds) ? b.episodeIds : [b.episodeId], b.monitored); }));
media43Api.put('/episodes/:id{[0-9]+}', ...A, H(async (c) => monitorEps([c.req.param('id')], (await jb(c)).monitored)));
media43Api.delete('/series/:id{[0-9]+}', ...A, H(async (c) => { const files = /^(1|true)$/.test(c.req.query('files') ?? c.req.query('deleteFiles') ?? ''); await arr('sonarr', 'DELETE', `/series/${c.req.param('id')}`, { query: { deleteFiles: files, addImportListExclusion: false } }); clearMedia43('sonarr:'); clearMedia43('cal'); return { ok: true, deleteFiles: files, message: files ? 'Slettet med filene' : 'Slettet, filene er beholdt' }; }));
// Radarr
media43Api.get('/movies', ...G, L('radarr', () => libMovies()));
media43Api.get('/movies/lookup', ...G, L('radarr', async (c) => ({ items: await lookupMovies(String(c.req.query('term') ?? c.req.query('q') ?? '').trim().slice(0, 100)) })));
media43Api.get('/movies/:id{[0-9]+}', ...G, H(async (c) => { const m = await movieOut(await arr('radarr', 'GET', `/movie/${c.req.param('id')}`), await queues().catch(() => null)); return { ...m, subtitle: [m.year, m.profile, m.availabilityLabel].filter(Boolean).join(' · '), play: m.hasFile ? playOf(m.title, c.get('user')) : null }; }));
media43Api.post('/movies', ...G, H(async (c) => addMovie(await jb(c))));
media43Api.put('/movies/:id{[0-9]+}', ...A, H(async (c) => ({ movie: await updateMovie(+c.req.param('id'), await jb(c)) })));
media43Api.delete('/movies/:id{[0-9]+}', ...A, H(async (c) => { const files = /^(1|true)$/.test(c.req.query('files') ?? c.req.query('deleteFiles') ?? ''); await arr('radarr', 'DELETE', `/movie/${c.req.param('id')}`, { query: { deleteFiles: files, addImportExclusion: false } }); clearMedia43('radarr:'); clearMedia43('cal'); return { ok: true, deleteFiles: files, message: files ? 'Slettet med filene' : 'Slettet, filene er beholdt' }; }));
// POST /api/media/command {name:'EpisodeSearch'|'SeasonSearch'|'SeriesSearch'|'MissingEpisodeSearch'|'MoviesSearch', episodeIds?, seriesId?, seasonNumber?, movieIds?} → {ok, id, name, service, message}
const CMDS = { EpisodeSearch: 'sonarr', SeasonSearch: 'sonarr', SeriesSearch: 'sonarr', MissingEpisodeSearch: 'sonarr', RefreshSeries: 'sonarr', MoviesSearch: 'radarr', MissingMoviesSearch: 'radarr', RefreshMovie: 'radarr' };
media43Api.post('/command', ...G, H(async (c) => {
  const b = await jb(c), svc = CMDS[b.name];
  if (!svc) throw new MediaError(`Ukjent kommando. Bruk ${Object.keys(CMDS).join(', ')}`, 400);
  const body = { name: b.name };
  if (b.episodeIds) body.episodeIds = (Array.isArray(b.episodeIds) ? b.episodeIds : [b.episodeIds]).map(Number).filter(Number.isInteger).slice(0, 500);
  if (b.seriesId != null) body.seriesId = +b.seriesId;
  if (b.seasonNumber != null) body.seasonNumber = +b.seasonNumber;
  if (b.movieIds || b.movieId) body.movieIds = (Array.isArray(b.movieIds) ? b.movieIds : [b.movieIds ?? b.movieId]).map(Number).filter(Number.isInteger);
  if (b.name === 'EpisodeSearch' && !body.episodeIds?.length) throw new MediaError('EpisodeSearch krever episodeIds', 400);
  if (b.name === 'SeasonSearch' && (body.seriesId == null || body.seasonNumber == null)) throw new MediaError('SeasonSearch krever seriesId og seasonNumber', 400);
  if (b.name === 'MoviesSearch' && !body.movieIds?.length) throw new MediaError('MoviesSearch krever movieIds', 400);
  const r = await arr(svc, 'POST', '/command', { body });
  clearMedia43('queue'); clearMedia43('qbit:'); clearMedia43(`${svc}:`);
  const n = body.episodeIds?.length ?? body.movieIds?.length ?? 0;
  return { ok: true, id: r?.id ?? null, name: b.name, service: svc, status: r?.status ?? 'queued', message: `Automatisk søk startet${n > 1 ? ` for ${n} ${svc === 'radarr' ? 'filmer' : 'episoder'}` : ''}` };
}));
// GET /api/media/release?episodeId= | ?seriesId=&seasonNumber= | ?movieId= → {context, items:[Release], best, tookMs, indexers, indexersTotal, filters, text}
media43Api.get('/release', ...G, H(async (c) => {
  const q = c.req.query();
  if (q.movieId) return interactive('radarr', { movieId: +q.movieId });
  if (q.episodeId || (q.seriesId && q.seasonNumber != null)) return interactive('sonarr', { episodeId: q.episodeId ? +q.episodeId : null, seriesId: q.seriesId ? +q.seriesId : null, seasonNumber: q.seasonNumber != null ? +q.seasonNumber : null });
  throw new MediaError('Bruk episodeId, seriesId+seasonNumber eller movieId', 400);
}));
// POST /api/media/release {guid, indexerId, service?} → {ok, guid, message:'Sendt til qBittorrent: 1080p WEB-DL · 2,4 GB', release}
media43Api.post('/release', ...G, H(async (c) => grabRelease(await jb(c))));
// GET /api/media/qualityprofiles → {sonarr:[{id, name, resolution}], radarr:[…], monitor:[{id, label}], seriesTypes, availability, defaults}
media43Api.get('/qualityprofiles', ...G, H(async () => {
  const [s, r] = await Promise.all([svcConf43('sonarr').on ? profiles('sonarr').catch(() => []) : [], svcConf43('radarr').on ? profiles('radarr').catch(() => []) : []]);
  return { sonarr: s, radarr: r, monitor: MONITOR43.map(([id, label]) => ({ id, label })), seriesTypes: SERIES_TYPES43.map(([id, label]) => ({ id, label })), availability: AVAILABILITY43.map(([id, label]) => ({ id, label })),
    defaults: { sonarr: (await profileFor43('sonarr', null).catch(() => null))?.name ?? null, radarr: (await profileFor43('radarr', null).catch(() => null))?.name ?? null, sonarrRoot: extra('sonarr_root', '/data/media/tv'), radarrRoot: extra('radarr_root', '/data/media/film') } };
}));
// GET /api/media/rootfolders → {sonarr:[{id, path, free, freeText}], radarr:[…], disk:[{path, label, free, total, freeText, low}], low, lowText}
media43Api.get('/rootfolders', ...G, H(() => rootfolders()));
media43Api.get('/disk', ...G, H(() => rootfolders()));
// qBittorrent
// GET /api/media/torrents?filter=all|active|paused|done|stalled → {items:[Torrent], total, counts, filters, transfer, allPaused, allPausedLabel}
media43Api.get('/torrents', ...G, L('qbit', (c) => torrentsOut(c.req.query('filter') ?? 'all')));
media43Api.get('/transferinfo', ...G, L('qbit', async () => (await torrentsOut()).transfer));
media43Api.post('/torrents/pauseAll', ...G, H(async () => { await qbVerb('stop', 'pause', 'all'); clearMedia43('qbit:'); return { ok: true, message: 'Alt er pauset', ...(await torrentsOut()) }; }));
media43Api.post('/torrents/resumeAll', ...G, H(async () => { await qbVerb('start', 'resume', 'all'); clearMedia43('qbit:'); return { ok: true, message: 'Alle nedlastinger går igjen', ...(await torrentsOut()) }; }));
// POST /api/media/torrents/magnet/check {url} → {ok, kind, hash, name, trackers, info, exists} | {ok:false, error}
media43Api.post('/torrents/magnet/check', ...G, H(async (c) => { const b = await jb(c), p = parseMagnet43(b.url); if (!p.ok) return p; const raw = await torrentsRaw().catch(() => null); const exists = !!p.hash && (raw ?? []).some((t) => String(t.hash).toLowerCase() === p.hash); return { ...p, exists, ...(exists ? { error: 'Ligger allerede i qBittorrent' } : {}) }; }));
// POST /api/media/torrents/magnet {url, category:''|'tv-sonarr'|'radarr', paused, sequential, firstLast} → {ok, parsed, torrent:{hash, name, status:'meta', statusText:'Henter metadata …', sizeText:'størrelse ukjent'}, message}
media43Api.post('/torrents/magnet', ...G, H(async (c) => addMagnet(await jb(c))));
media43Api.get('/torrents/categories', ...G, (c) => c.json({ items: CATEGORIES43 }));
media43Api.post('/torrents/:hash/:op{pause|resume|recheck|forceStart|priority|sequential}', ...G, H(async (c) => torrentAction(c.req.param('hash'), c.req.param('op'), await jb(c))));
media43Api.get('/torrents/:hash/files', ...G, H((c) => filesOf(c.req.param('hash'))));
media43Api.post('/torrents/:hash/files', ...A, H(async (c) => setFiles(c.req.param('hash'), await jb(c))));
media43Api.delete('/torrents/:hash', ...A, H(async (c) => { const h = okHash(c.req.param('hash')), files = /^(1|true)$/.test(c.req.query('files') ?? c.req.query('deleteFiles') ?? ''); await qb('POST', '/torrents/delete', { form: { hashes: h, deleteFiles: files } }); clearMedia43('qbit:'); clearMedia43('queue'); return { ok: true, hash: h, deleteFiles: files, message: files ? 'Slettet med filene' : 'Slettet, filene er beholdt' }; }));
// POST /api/media/altSpeed {on?} → transfer
media43Api.post('/altSpeed', ...G, H(async (c) => { const b = await jb(c); const cur = String(await qb('GET', '/transfer/speedLimitsMode')).trim() === '1'; if (b.on === undefined || !!b.on !== cur) await qb('POST', '/transfer/toggleSpeedLimitsMode'); clearMedia43('qbit:'); return (await torrentsOut()).transfer; }));
// Prowlarr
// GET /api/media/indexers → {items:[{id, name, ok, ms, queries, grabs, error, line, type, typeLabel, typeColor, priority}], summary:{total, ok, text, queriesToday, grabsToday, line}, apps, health, healthy}
media43Api.get('/indexers', ...G, L('prowlarr', () => indexersOut()));
media43Api.get('/indexers/health', ...G, L('prowlarr', async () => { const h = await arr('prowlarr', 'GET', '/health'); return { items: (h ?? []).map((x) => ({ source: x.source, type: x.type, message: x.message })), ok: !(h ?? []).length }; }));
media43Api.get('/health', ...G, L('prowlarr', async () => { const h = await arr('prowlarr', 'GET', '/health'); return { items: (h ?? []).map((x) => ({ source: x.source, type: x.type, message: x.message })), ok: !(h ?? []).length }; }));
// GET /api/media/indexers/schema?q=&type=all|public|private|semi|usenet → {items:[{key, name, type, typeLabel, typeColor, protocol, language, categories, auth:'none'|'user'|'key'|'cookie', authHelp, fields:[{name, label, type, help}], added}], count, total, filters, priorities}
media43Api.get('/indexers/schema', ...G, L('prowlarr', (c) => schemaOut(c.req.query())));
media43Api.post('/indexers/testall', ...G, H(async () => { const list = await indexersRaw(); const items = []; for (const x of list) items.push(await testIndexer(x.id)); clearMedia43('prowlarr:'); return { items, ok: items.filter((x) => x.ok).length, text: `${items.filter((x) => x.ok).length} av ${items.length} indeksere svarer` }; }));
// POST /api/media/indexers/:id/test → {id, name, ok, ms, message}
media43Api.post('/indexers/:id{[0-9]+}/test', ...G, H((c) => testIndexer(c.req.param('id'))));
// POST /api/media/indexers {key, fields:{username?, password?, apiKey?, cookie?}, priority, sonarr, radarr} → {ok, indexer, ms, message} | 400 {error, field}
media43Api.post('/indexers', ...A, H(async (c) => addIndexer(await jb(c))));
// POST /api/media/indexers/test {key, fields} → {ok, ms, message} (tester uten å lagre) | 400 {error, field}
media43Api.post('/indexers/test', ...A, H(async (c) => { const { def, body } = await indexerBody(await jb(c)); const ms = await testIndexerBody(body); return { ok: true, ms, name: def.name, message: `${def.name} svarte på ${ms} ms` }; }));
media43Api.post('/apps/:id{[0-9]+}/sync', ...G, H(async () => { await arr('prowlarr', 'POST', '/command', { body: { name: 'ApplicationIndexerSync' } }); return { ok: true, message: 'Synker indekserne …' }; }));
// POST /api/media/glimt {q} → {q, kind, text, steps:[{t, ms, ok}], actions:[…], results:[…]}
media43Api.post('/glimt', ...G, H(async (c) => glimt(c.get('user'), (await jb(c)).q)));
// Plakater fra Sonarr/Radarr (/MediaCover/…), nøkkelen legges på her.
media43Api.get('/cover', ...G, async (c) => {
  const svc = c.req.query('svc'), path = String(c.req.query('path') ?? '');
  if (!['sonarr', 'radarr'].includes(svc) || !/^\/MediaCover\/\d+\/[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(path)) return c.json({ error: 'Ugyldig plakat' }, 400);
  const conf = svcConf43(svc);
  if (!conf.on || conf.mock) return c.body(null, 404);
  try { const r = await rawFetch(`${conf.url}${path}`, { headers: { 'X-Api-Key': conf.key } }); if (!r.ok) return c.body(null, 404); return new Response(r.body, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } }); }
  catch { return c.body(null, 502); }
});

// Prompt 44 (SERVER44): byggeklosser for media44.js (servere per sted, søk som jobb, slett fil, felles status).
export { arr as arr43, qb as qb43, cached as cached43, indexersRaw as indexersRaw43, posterOf as posterOf43, fanartOf as fanartOf43, epCode as epCode43,
  releaseOut as releaseOut43, statusOut as mediaStatusOut43, fail as mediaFail43, guard as mediaGuard43, admin as mediaAdmin43, jb as mediaBody43, nb1 as nb143 };
