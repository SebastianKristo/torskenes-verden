// Prompt 50 (SRVMEDIA50): Media – qBittorrent starter ikke (sann status, manuelt valg, start stoppede, diagnostikk ledd 2–6)
// og plakater som vises med en gang (/api/media/bilde med diskcache, WebP, ETag/immutable, signerte adresser, ThumbHash).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p50m-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-50m';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4501';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DOCKER_HOST;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const m43 = await import('../server/media43.js');
const m50 = await import('../server/media50.js');
const { rgbaToThumbHash50 } = await import('../server/thumbhash50.js');
const { thumbHashToRGBA50, thumbHashAverage50, b64ToBytes50 } = await import('../public/js/thumbhash50.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body, extra = {}) => req(path, { method, headers: { ...h, ...extra }, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
const nu = await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' });
assert.equal(nu.status, 200);
const INGRID = nu.body.id ?? nu.body.user?.id ?? (await A('/api/users')).body.users?.find((x) => x.username === 'ingrid')?.id;
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const NONE = as({});

/* ---------------- Falske Sonarr, Radarr og qBittorrent ---------------- */
const HAVE_IM = spawnSync('convert', ['-version']).status === 0;
const jpeg = (c1, c2) => (HAVE_IM ? spawnSync('convert', ['-size', '300x450', `gradient:${c1}-${c2}`, '-quality', '90', 'jpeg:-']).stdout : Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]));
const IMG = { v1: jpeg('#c0392b', '#2c3e50'), v2: jpeg('#27ae60', '#f1c40f') };
const S = {}; // scenario-tilstand
function reset() {
  Object.assign(S, {
    calls: [], lastWrite: 1, cmdStatus: 'completed', cmdMessage: 'Completed', queue: [], history: [], releases: [], movieQueue: [], movieHistory: [], qbDown: false, qbAuthFail: false, qbV4: false,
    torrents: [], started: [], resumed: [], clients: [{ id: 1, name: 'qBittorrent', enable: true, implementation: 'QBittorrent', fields: [{ name: 'host', value: 'qbittorrent' }, { name: 'port', value: 8080 }, { name: 'username', value: 'admin' }, { name: 'password', value: '********' }, { name: 'tvCategory', value: 'tv-sonarr' }, { name: 'initialState', value: 0 }] }],
    testall: [{ id: 1, isValid: true, validationFailures: [] }], prefs: { add_stopped_enabled: false, queueing_enabled: true, max_active_downloads: 3, max_active_torrents: 5 },
  });
}
reset();
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const txt = (t, s = 200, h = {}) => new Response(t, { status: s, headers: { 'content-type': 'text/plain', ...h } });
const series = () => [{ id: 7, title: '9-1-1', year: 2018, network: 'ABC', status: 'continuing', qualityProfileId: 4, monitored: true, seriesType: 'standard', path: '/data/media/tv/9-1-1',
  images: [{ coverType: 'poster', url: `/MediaCover/7/poster.jpg?lastWrite=${S.lastWrite}`, remoteUrl: 'https://artworks.thetvdb.com/banners/posters/7.jpg' }, { coverType: 'fanart', url: `/MediaCover/7/fanart.jpg?lastWrite=${S.lastWrite}`, remoteUrl: 'https://artworks.thetvdb.com/f.jpg' }],
  statistics: { episodeFileCount: 10, episodeCount: 12, totalEpisodeCount: 12, sizeOnDisk: 20 * 1024 ** 3, seasonCount: 1 } }];
m43._setMediaFetch43(async (url, init = {}) => {
  const u = new URL(url), P = u.pathname, method = init.method ?? 'GET';
  S.calls.push(`${method} ${u.host}${P}`);
  if (u.hostname === 'sonarr.test') {
    if (P === '/MediaCover/7/poster.jpg') return new Response(S.lastWrite === 1 ? IMG.v1 : IMG.v2, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    if (P === '/MediaCover/7/fanart.jpg') return new Response(IMG.v1, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    if (P === '/api/v3/system/status') return j({ version: '4.0.10.2544' });
    if (P === '/api/v3/qualityprofile') return j([{ id: 4, name: 'HD-1080p' }]);
    if (P === '/api/v3/series') return j(series());
    if (P === '/api/v3/series/7') return j(series()[0]);
    if (P === '/api/v3/episode/701') return j({ id: 701, seriesId: 7, seasonNumber: 8, episodeNumber: 3, title: 'Ny episode', hasFile: false, monitored: true, airDateUtc: '2026-10-20T01:00:00Z' });
    if (P === '/api/v3/episode') return j([]);
    if (P === '/api/v3/command' && method === 'POST') return j({ id: 55, name: JSON.parse(init.body).name, status: 'queued' }, 201);
    if (P === '/api/v3/command' && method === 'GET') return j([{ id: 55, name: 'EpisodeSearch', commandName: 'EpisodeSearch', status: S.cmdStatus, message: S.cmdMessage, queued: new Date().toISOString() }]);
    if (P === '/api/v3/command/55') return j({ id: 55, name: 'EpisodeSearch', status: S.cmdStatus, message: S.cmdMessage });
    if (P === '/api/v3/queue') return j({ records: S.queue });
    if (P === '/api/v3/history') return j({ records: S.history });
    if (P === '/api/v3/release') return j(S.releases);
    if (P === '/api/v3/indexer') return j([{ id: 1, name: 'EZTV (Prowlarr)', enable: true, enableAutomaticSearch: true }]);
    if (P === '/api/v3/downloadclient') return j(S.clients);
    if (P === '/api/v3/downloadclient/testall') return j(S.testall);
    if (P === '/api/v3/health') return j([]);
    return j({ message: `NotFound ${P}` }, 404);
  }
  if (u.hostname === 'radarr.test') {
    if (P === '/api/v3/system/status') return j({ version: '5.14.0' });
    if (P === '/api/v3/qualityprofile') return j([{ id: 5, name: 'Ultra-HD' }]);
    if (P === '/api/v3/movie') return j([{ id: 3, title: 'Sinners', year: 2025, qualityProfileId: 5, monitored: true, hasFile: false, images: [{ coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/sinners.jpg' }] }]);
    if (P === '/api/v3/movie/3') return j({ id: 3, title: 'Sinners', hasFile: false });
    if (P === '/api/v3/command' && method === 'POST') return j({ id: 77, name: 'MoviesSearch', status: 'queued' }, 201);
    if (P === '/api/v3/command/77') return j({ id: 77, status: S.cmdStatus, message: S.cmdMessage });
    if (P === '/api/v3/queue') return j({ records: S.movieQueue });
    if (P === '/api/v3/history/movie') return j(S.movieHistory);
    return j({ message: `NotFound ${P}` }, 404);
  }
  if (u.hostname === 'image.tmdb.org') return new Response(IMG.v2, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (u.hostname === 'qbit.test') {
    if (S.qbDown) { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNREFUSED' }; throw e; }
    if (P === '/api/v2/auth/login') return S.qbAuthFail ? txt('Fails.') : txt('Ok.', 200, { 'set-cookie': 'SID=abc; HttpOnly; path=/' });
    if (S.qbAuthFail) return txt('Forbidden', 403); // gammel SID avvist → ny innlogging feiler
    if (P === '/api/v2/app/version') return txt(S.qbV4 ? 'v4.6.7' : 'v5.0.1');
    if (P === '/api/v2/app/preferences') return j(S.prefs);
    if (P === '/api/v2/transfer/info') return j({ connection_status: 'connected' });
    if (P === '/api/v2/torrents/categories') return j({ 'tv-sonarr': { savePath: '/data/downloads/tv' }, radarr: {} });
    if (P === '/api/v2/sync/maindata') return j({ server_state: { free_space_on_disk: 500 * 1024 ** 3 }, torrents: Object.fromEntries(S.torrents.map((t) => [t.hash, t])) });
    if (P === '/api/v2/torrents/info') return j(S.torrents);
    if (P === '/api/v2/transfer/speedLimitsMode') return txt('0');
    const hashes = new URLSearchParams(init.body ?? '').get('hashes');
    if (P === '/api/v2/torrents/start') { if (S.qbV4) return txt('Not Found', 404); S.started.push(hashes); for (const t of S.torrents) if (t.hash === hashes) t.state = 'downloading'; return txt(''); }
    if (P === '/api/v2/torrents/resume') { S.resumed.push(hashes); for (const t of S.torrents) if (t.hash === hashes) t.state = 'downloading'; return txt(''); }
    return txt('Not Found', 404);
  }
  if (u.hostname === 'artworks.thetvdb.com') throw new Error('SSRF: TVDB skal ikke hentes');
  throw new TypeError('fetch failed');
});
const HASH = 'a'.repeat(40);
const fresh = () => { m43.clearMedia43(); for (const t of m50._tracks50.values()) { t.lastAt = 0; t.histAt = 0; } };
await A('/api/integrations/sonarr', 'PUT', { sonarr_url: 'http://sonarr.test:8989', sonarr_key: 'sonarr-hemmelig-nokkel' });
await A('/api/integrations/radarr', 'PUT', { radarr_url: 'http://radarr.test:7878', radarr_key: 'radarr-hemmelig-nokkel' });
await A('/api/integrations/qbittorrent', 'PUT', { qbit_url: 'http://qbit.test:8080', qbit_user: 'admin', qbit_pass: 'qbit-hemmelig-passord' });
m43._resetMediaSource43(); m43.clearMedia43();
assert.equal((await A('/api/media/access', 'PUT', { userId: INGRID, allowed: true })).status, 200);

/* ---------------- Bilder ---------------- */

test('ThumbHash: koder i ren JS og dekoder på klienten (rød topp, blå bunn)', () => {
  const w = 20, h = 30, a = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; a.set(y < 15 ? [200, 40, 40, 255] : [30, 40, 180, 255], i); }
  const hash = rgbaToThumbHash50(w, h, a);
  assert.ok(hash.length >= 20 && hash.length <= 30);
  const b64 = Buffer.from(hash).toString('base64');
  const d = thumbHashToRGBA50(b64ToBytes50(b64));
  assert.ok(d.h === 32 && d.w < d.h, 'stående (2:3)');
  assert.ok(d.rgba[0] > 150 && d.rgba[2] < 80, 'rød øverst');
  const end = (d.w * (d.h - 1)) * 4;
  assert.ok(d.rgba[end + 2] > 150 && d.rgba[end] < 80, 'blå nederst');
  assert.ok(Math.abs(thumbHashAverage50(hash).r - 0.45) < 0.1);
});

test('Media-bilder: biblioteket peker på /api/media/bilde, aldri på TVDB direkte', async () => {
  fresh();
  const s = await A('/api/media/series');
  assert.equal(s.status, 200, s.text);
  const x = s.body.items[0];
  assert.match(x.poster, /^\/api\/media\/bilde\/serie\/7\/poster\?w=320&v=[0-9a-f]{10}&uid=owner&sig=[\w-]{22}$/);
  assert.equal(x.posterImg.url, x.poster);
  assert.equal(x.posterImg.w, 320);
  assert.equal(x.posterImg.h, 480);
  assert.match(x.posterImg.srcset, /w=160.* 160w, .*w=320.* 320w, .*w=640.* 640w$/);
  assert.match(x.fanart, /^\/api\/media\/bilde\/serie\/7\/fanart\?w=1280&/);
  assert.ok(x.fanartImg.srcset.includes(' 640w'));
  // Detaljsiden og Kommer snart bruker samme adresse.
  const d = await A('/api/media/series/7');
  assert.equal(d.body.posterImg?.version, x.posterImg.version);
});

test('Media-bilder: skaleres ned, WebP, ETag + immutable med ?v=, 304, signert uten header, SSRF-vern', async (t) => {
  fresh();
  const x = (await A('/api/media/series')).body.items[0];
  const before = S.calls.filter((c) => c.endsWith('/MediaCover/7/poster.jpg')).length;
  const r = await A(x.poster.replace(/&uid=.*$/, ''));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  const etag = r.headers.get('etag');
  assert.match(etag, /^"b50-[0-9a-f]{10}-320-(webp|jpg)"$/);
  if (HAVE_IM) { assert.equal(r.headers.get('content-type'), 'image/webp'); assert.equal(r.buf.toString('ascii', 8, 12), 'WEBP'); assert.ok(r.buf.length < IMG.v1.length, 'mindre enn originalen'); }
  // Fra diskcachen: ingen ny henting fra Sonarr.
  const r2 = await A(x.poster.replace(/w=320/, 'w=640').replace(/&uid=.*$/, ''));
  assert.equal(r2.status, 200);
  assert.equal(S.calls.filter((c) => c.endsWith('/MediaCover/7/poster.jpg')).length, before + 1, 'originalen hentes én gang');
  assert.equal((await A(x.poster.replace(/&uid=.*$/, ''), 'GET', undefined, { 'if-none-match': etag })).status, 304);
  // Signert adresse fungerer uten innlogging (AsyncImage/Coil/<img>), feil signatur gjør ikke.
  assert.equal((await NONE(x.poster)).status, 200);
  assert.equal((await NONE(x.poster.replace(/sig=[\w-]+/, 'sig=AAAAAAAAAAAAAAAAAAAAAA'))).status, 401);
  assert.equal((await NONE(x.poster.replace(/&uid=.*$/, ''))).status, 401);
  // Bare id-er fra eget bibliotek.
  assert.equal((await A('/api/media/bilde/serie/999/poster?w=320')).status, 404);
  assert.equal((await A('/api/media/bilde/serie/7/annet?w=320')).status, 404);
  assert.ok(!S.calls.some((c) => c.includes('thetvdb')), 'TVDB hentes aldri');
  // Uten ?v= (eller gammel v): kort cache, så en endret plakat ikke blir hengende.
  assert.equal((await A('/api/media/bilde/serie/7/poster?w=320')).headers.get('cache-control'), 'private, max-age=300');
  if (!HAVE_IM) t.diagnostic('ImageMagick mangler – originalen sendes (JS-reserve)');
});

test('Media-bilder: forhåndsgenerering gir ThumbHash i listene; endret plakat får ny versjon', async () => {
  fresh();
  const n = await m50.precomputeAll50();
  assert.ok(n >= 2, 'serie + film i kø');
  await m50._drain50();
  fresh();
  const x = (await A('/api/media/series')).body.items[0];
  if (HAVE_IM) { assert.match(x.posterImg.hash, /^[A-Za-z0-9+/=]{20,}$/); assert.equal(x.posterImg.h, 480); }
  const m = (await A('/api/media/movies')).body.items[0];
  assert.match(m.poster, /^\/api\/media\/bilde\/film\/3\/poster\?/, 'TMDB-plakat via serveren');
  assert.ok(S.calls.some((c) => c === 'GET image.tmdb.org/t/p/w780/sinners.jpg'), 'TMDB i mindre størrelse, ikke original');
  // Plakaten endres i Sonarr (ny lastWrite): ny v, nytt bilde hentes, den gamle brukes ikke.
  const oldV = x.posterImg.version;
  S.lastWrite = 2; fresh();
  const y = (await A('/api/media/series')).body.items[0];
  assert.notEqual(y.posterImg.version, oldV);
  const before = S.calls.filter((c) => c.endsWith('/MediaCover/7/poster.jpg')).length;
  const r = await A(y.poster);
  assert.equal(r.status, 200);
  assert.equal(S.calls.filter((c) => c.endsWith('/MediaCover/7/poster.jpg')).length, before + 1);
  assert.equal(r.headers.get('x-bilde-versjon'), y.posterImg.version);
  const old = await A(x.poster.replace(/&uid=.*$/, ''));
  assert.equal(old.headers.get('x-bilde-versjon'), y.posterImg.version, 'gammel v gir det nye bildet');
  assert.equal(old.headers.get('cache-control'), 'private, max-age=300');
  S.lastWrite = 1;
});

test('Media-bilder: uten ImageMagick sendes originalen (JS-reserve)', async () => {
  m50._setImageTool50(null);
  try {
    S.lastWrite = 3; fresh();
    const y = (await A('/api/media/series')).body.items[0];
    const r = await A(y.poster);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.equal(r.buf.length, IMG.v2.length);
  } finally { m50._setImageTool50('auto'); S.lastWrite = 1; }
});

/* ---------------- Sann status etter søk ---------------- */

const track = async (id, who = A) => { fresh(); return (await who(`/api/media/track/${id}`)).body; };

test('Sporing: grab → torrent stoppet i qBittorrent 5.x → appen starter den selv → «Laster ned …»', async () => {
  reset();
  const c = await A('/api/media/command', 'POST', { name: 'EpisodeSearch', episodeIds: [701] });
  assert.equal(c.status, 200, c.text);
  assert.ok(c.body.track?.id, 'track i svaret');
  assert.equal(c.body.track.state, 'searching');
  S.cmdStatus = 'started';
  let t = await track(c.body.track.id);
  assert.equal(t.state, 'searching');
  assert.match(t.text, /^Søker i indekserne via Sonarr/);
  // Sonarr hentet en utgivelse; qBittorrent la den til stoppet (5.x, «Start torrent automatically» av).
  S.cmdStatus = 'completed';
  S.queue = [{ id: 1, seriesId: 7, episodeId: 701, downloadId: HASH.toUpperCase(), title: '9-1-1.S08E03.1080p.WEB.h264', status: 'paused', trackedDownloadStatus: 'ok', trackedDownloadState: 'downloading', size: 2e9, sizeleft: 2e9, downloadClient: 'qBittorrent' }];
  S.torrents = [{ hash: HASH, name: '9-1-1.S08E03.1080p.WEB.h264', state: 'stoppedDL', progress: 0, dlspeed: 0, eta: 8640000, num_seeds: 50, added_on: Math.floor(Date.now() / 1000), category: 'tv-sonarr', size: 2e9 }];
  t = await track(c.body.track.id);
  assert.equal(t.state, 'starting');
  assert.deepEqual(S.started, [HASH], 'torrents/start (5.x)');
  S.torrents[0] = { ...S.torrents[0], state: 'downloading', progress: 0.12, dlspeed: 4.2 * 1024 ** 2, eta: 480 };
  t = await track(c.body.track.id);
  assert.equal(t.state, 'downloading');
  assert.equal(t.text, 'Laster ned 12 % · 4,2 MB/s · 8 min');
  assert.equal(t.torrent.hash, HASH);
  // Ingen API-nøkler eller passord i svaret.
  assert.ok(!JSON.stringify(t).includes('hemmelig'));
  // Andre brukere ser ikke sporingen.
  assert.equal((await I(`/api/media/track/${c.body.track.id}`)).status, 404);
});

test('Sporing: qBittorrent nede → «qBittorrent svarer ikke», ikke evig «Søker»', async () => {
  reset();
  const c = await A('/api/media/command', 'POST', { name: 'EpisodeSearch', episodeIds: [701] });
  S.queue = [{ id: 1, seriesId: 7, episodeId: 701, downloadId: HASH, title: 'x', status: 'queued', trackedDownloadStatus: 'ok', trackedDownloadState: 'downloading' }];
  S.qbDown = true;
  const t = await track(c.body.track.id);
  assert.equal(t.state, 'qbit_down');
  assert.equal(t.text, 'qBittorrent svarer ikke');
  assert.ok(t.actions.some((a) => a.id === 'settings' && a.route === 'innstillinger/media'));
});

test('Sporing: alle utgivelser avvist → «Fant ingen utgivelser» med grunn og «Velg manuelt»', async () => {
  reset();
  m50._setNoGrabMs50(0);
  try {
    S.releases = [{ guid: 'a', title: '9-1-1.S08E03.720p.HDTV', size: 7e8, seeders: 40, rejected: true, rejections: ['HDTV-720p is not wanted in profile'], quality: { quality: { name: 'HDTV-720p' } }, indexer: 'EZTV' },
      { guid: 'b', title: '9-1-1.S08E03.480p', size: 2e8, seeders: 10, rejected: true, rejections: [{ reason: 'SDTV is not wanted in profile' }], quality: { quality: { name: 'SDTV' } }, indexer: 'EZTV' }];
    S.cmdMessage = 'Search for 1 episodes completed. 0 reports downloaded.';
    const c = await A('/api/media/command', 'POST', { name: 'EpisodeSearch', episodeIds: [701] });
    let t = await track(c.body.track.id);
    for (let i = 0; i < 20 && !['rejected', 'none'].includes(t.state); i++) { await new Promise((r) => setTimeout(r, 20)); t = await track(c.body.track.id); }
    assert.equal(t.state, 'rejected');
    assert.equal(t.text, 'Fant ingen utgivelser');
    assert.equal(t.detail, 'alle 2 under kvalitetskrav');
    assert.deepEqual(t.actions.find((a) => a.id === 'manual'), { id: 'manual', label: 'Velg manuelt', episodeId: 701 });
    assert.equal(t.final, true);
    // Diagnostikken ble kjørt automatisk (ingen grab innen grensen): grønn kjede, ledd 4 sier «ingen grab».
    for (let i = 0; i < 20 && !t.diagnostics; i++) { await new Promise((r) => setTimeout(r, 20)); t = await track(c.body.track.id); }
    assert.ok(t.diagnostics?.steps?.some((s) => s.id === 'sonarr:grab' && s.state === 'warn'));
  } finally { m50._setNoGrabMs50(null); }
});

test('Sporing: qBittorrent 4.x – start gir 404, reserve /torrents/resume', async () => {
  reset();
  S.qbV4 = true;
  S.torrents = [{ hash: HASH, name: 'x', state: 'pausedDL', progress: 0.3, added_on: 1 }];
  const r = await A(`/api/media/torrents/${HASH}/start`, 'POST');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(S.resumed, [HASH]);
  assert.equal((await A('/api/media/torrents/xyz/start', 'POST')).status, 404);
});

test('Sporing: film fra Radarr – samme flyt (grab → laster ned)', async () => {
  reset();
  const c = await A('/api/media/command', 'POST', { name: 'MoviesSearch', movieIds: [3] });
  assert.equal(c.body.track.state, 'searching');
  S.movieQueue = [{ id: 9, movieId: 3, downloadId: HASH.toUpperCase(), title: 'Sinners.2025.2160p', status: 'downloading', trackedDownloadState: 'downloading' }];
  S.torrents = [{ hash: HASH, name: 'Sinners.2025.2160p', state: 'downloading', progress: 0.5, dlspeed: 10 * 1024 ** 2, eta: 7200, added_on: 1 }];
  const t = await track(c.body.track.id);
  assert.equal(t.service, 'radarr');
  assert.equal(t.state, 'downloading');
  assert.equal(t.text, 'Laster ned 50 % · 10 MB/s · 2 t 0 min');
});

test('Sporing: GET /track?episodeId= gir status uten egen kommando (grab i historikken, qBittorrent avviser innlogging)', async () => {
  reset();
  S.history = [{ eventType: 'grabbed', date: new Date().toISOString(), sourceTitle: '9-1-1.S08E03', downloadId: HASH, episodeId: 701 }];
  S.qbAuthFail = true;
  m50._tracks50.clear(); fresh();
  const r = await A('/api/media/track?episodeId=701');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.state, 'qbit_auth');
  assert.equal(r.body.text, 'Innlogging avvist');
  // Samme sporing gjenbrukes for elementet.
  assert.equal((await A('/api/media/track?episodeId=701')).body.id, r.body.id);
  assert.equal((await A('/api/media/track')).status, 400);
});

/* ---------------- Diagnostikk ---------------- */

test('Diagnostikk: ledd 2–6 grønt, bare for admin, ingen nøkler', async () => {
  reset();
  S.history = [{ eventType: 'grabbed', date: new Date().toISOString(), sourceTitle: '9-1-1.S08E02', downloadId: HASH }];
  fresh();
  const d = await A('/api/media/diagnostics?service=sonarr');
  assert.equal(d.status, 200, d.text);
  assert.deepEqual(d.body.steps.map((s) => s.n), [2, 3, 4, 5, 6]);
  assert.equal(d.body.ok, true, JSON.stringify(d.body.steps));
  assert.equal(d.body.steps.find((s) => s.id === 'sonarr:client').clients[0].password, 'satt');
  assert.ok(!d.text.includes('hemmelig') && !d.text.includes('********'), 'ingen nøkler/passord');
  assert.match(d.body.steps.find((s) => s.id === 'qbit').text, /^qBittorrent v?5\.0\.1 svarer .* 5\.x \(stop\/start\) · tilkoblet$/);
  assert.equal((await I('/api/media/diagnostics')).status, 403);
});

test('Diagnostikk: Sonarr peker på localhost i Docker, «start automatisk» av, qBittorrent avviser innlogging', async () => {
  reset();
  S.clients[0].fields[0].value = 'localhost';
  S.testall = [{ id: 1, isValid: false, validationFailures: [{ propertyName: 'Host', errorMessage: 'Unable to connect to qBittorrent', isWarning: false }] }];
  S.prefs.add_stopped_enabled = true;
  S.torrents = [{ hash: HASH, name: 'Stoppet.S01E01', state: 'stoppedDL', progress: 0, category: 'tv-sonarr' }];
  fresh();
  let d = (await A('/api/media/diagnostics?service=sonarr')).body;
  const cl = d.steps.find((s) => s.id === 'sonarr:client');
  assert.equal(cl.state, 'fail');
  assert.match(cl.text, /\(localhost:8080\): Unable to connect to qBittorrent/);
  assert.match(cl.hint, /containernavnet \(f\.eks\. qbittorrent:8080, eller gluetun:8080/);
  const q = d.steps.find((s) => s.id === 'qbit');
  assert.equal(q.state, 'warn');
  assert.match(q.text, /nye torrenter legges til stoppet/);
  assert.deepEqual(q.torrents[0].action, { id: 'start', label: 'Start', hash: HASH, method: 'POST', path: `/api/media/torrents/${HASH}/start` });
  assert.equal(d.failed.id, 'sonarr:client');
  S.qbAuthFail = true; fresh();
  d = (await A('/api/media/diagnostics?service=sonarr')).body;
  assert.match(d.steps.find((s) => s.id === 'qbit').text, /^Innlogging avvist/);
});

test('Diagnostikk i demo (MOCK_DATA uten oppsett): hele kjeden svarer', async () => {
  for (const [svc, keys] of [['sonarr', ['sonarr_url', 'sonarr_key']], ['radarr', ['radarr_url', 'radarr_key']], ['qbittorrent', ['qbit_url', 'qbit_user', 'qbit_pass']]]) for (const k of keys) await A(`/api/integrations/${svc}/${k}`, 'DELETE');
  m43._resetMediaSource43(); m43.clearMedia43();
  const d = await A('/api/media/diagnostics');
  assert.equal(d.status, 200, d.text);
  assert.ok(d.body.steps.length >= 9, JSON.stringify(d.body.steps.map((s) => [s.id, s.state, s.text])));
  assert.equal(d.body.steps.filter((s) => s.state === 'fail').length, 0, JSON.stringify(d.body.steps.filter((s) => s.state === 'fail')));
  // Demo: søk → grab → laster ned.
  const c = await A('/api/media/command', 'POST', { name: 'EpisodeSearch', episodeIds: [(await A('/api/media/series/1')).body.seasons[0].episodes.find((e) => e.canSearch)?.id].filter(Boolean) });
  if (c.body.track) { const t = await track(c.body.track.id); assert.ok(['downloading', 'sent', 'stalled', 'starting'].includes(t.state), t.state); }
});
