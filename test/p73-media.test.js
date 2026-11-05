// Prompt 73 (MEDIA73): Media på web – covers via ID-kobling og plakatkjede (claude-code-media-covers.md) og X i stedet for ⚙
// (claude-code-media-lukk.md). Serveren: ferdige torrenter kobles til serie/film via Sonarr/Radarr-historikk (downloadId = hash,
// includeSeries/includeEpisode/includeMovie), tittel og plakat fra metadata, reserveplakat fra TMDB/TVDB via /api/media/ekstern.
// Klienten: Plex + Kalender + nedlasting slås sammen til ett kort (merge73), og plakatkjeden Plex → Sonarr/Radarr → TMDB/TVDB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p73m-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-73m';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4573';
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
const A = (path, method = 'GET', body) => req(path, { method, headers: { cookie: COOKIE }, body });
const COOKIE = await login('sebastian', 'testpassord1');

/* ---------------- Falske Sonarr, Radarr og qBittorrent ---------------- */
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const txt = (t, s = 200, h = {}) => new Response(t, { status: s, headers: { 'content-type': 'text/plain', ...h } });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const H_CIA = 'c'.repeat(40), H_SIN = 'd'.repeat(40), H_EXP = 'e'.repeat(40), H_UKJ = 'f'.repeat(40);
const CIA = { id: 7, title: 'CIA', year: 2026, tvdbId: 4711, network: 'CBS', status: 'continuing', qualityProfileId: 4, monitored: true, seriesType: 'standard',
  images: [{ coverType: 'poster', url: '/MediaCover/7/poster.jpg?lastWrite=1', remoteUrl: 'https://artworks.thetvdb.com/banners/posters/4711-1.jpg' }], statistics: { episodeFileCount: 3, episodeCount: 4 } };
const EXPANSE = { id: 8, title: 'The Expanse', year: 2015, tvdbId: 280619, network: 'Prime Video', status: 'ended', qualityProfileId: 4, monitored: true, seriesType: 'standard',
  images: [{ coverType: 'poster', remoteUrl: 'https://artworks.thetvdb.com/banners/posters/280619-1.jpg' }], statistics: {} };
const SINNERS = { id: 3, title: 'Sinners', year: 2025, tmdbId: 1233413, qualityProfileId: 4, monitored: true, hasFile: true, images: [{ coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/sinners.jpg' }] };
const calls = [];
const torrent = (hash, name) => ({ hash, name, size: 945 * 1024 ** 2, total_size: 945 * 1024 ** 2, progress: 1, state: 'stalledUP', dlspeed: 0, upspeed: 0, eta: 8640000, priority: 0, ratio: 1.2, added_on: Math.floor(Date.now() / 1000) - 7200, completion_on: Math.floor(Date.now() / 1000) - 600 });
m43._setMediaFetch43(async (url, init = {}) => {
  const u = new URL(url), P = u.pathname;
  calls.push(`${u.host}${P}${u.search}`);
  if (u.hostname === 'sonarr.test') {
    if (P === '/api/v3/series') return j([CIA, EXPANSE]);
    if (P === '/api/v3/qualityprofile') return j([{ id: 4, name: 'HD-1080p' }]);
    if (P === '/api/v3/queue') return j({ records: [] });
    if (P === '/api/v3/history') return j({ records: [{ id: 1, eventType: 'grabbed', downloadId: H_CIA.toUpperCase(), seriesId: 7, episodeId: 701, series: CIA, episode: { id: 701, seasonNumber: 2, episodeNumber: 4, title: 'Black Tie Optional' } }] });
    return j({ message: 'NotFound' }, 404);
  }
  if (u.hostname === 'radarr.test') {
    if (P === '/api/v3/movie') return j([SINNERS]);
    if (P === '/api/v3/qualityprofile') return j([{ id: 4, name: 'HD-1080p' }]);
    if (P === '/api/v3/queue') return j({ records: [] });
    if (P === '/api/v3/history') return j({ records: [{ id: 9, eventType: 'grabbed', downloadId: H_SIN.toUpperCase(), movieId: 3, movie: SINNERS }] });
    return j({ message: 'NotFound' }, 404);
  }
  if (u.hostname === 'qbit.test') {
    if (P === '/api/v2/auth/login') return txt('Ok.', 200, { 'set-cookie': 'SID=abc; HttpOnly; path=/' });
    if (P === '/api/v2/torrents/info') return j([torrent(H_CIA, 'Cia.2026.S02E04.720p.WEB.h264-GRP'), torrent(H_SIN, 'Sinners.2025.1080p.WEB-DL.DDP5.1-FLUX'), torrent(H_EXP, 'The.Expanse.S01E01.1080p.BluRay-X'), torrent(H_UKJ, 'Helt.Ukjent.S01E01.720p-X')]);
    if (P === '/api/v2/transfer/speedLimitsMode') return txt('0');
    if (P === '/api/v2/app/preferences') return j({});
    return txt('Not Found', 404);
  }
  if (u.hostname === 'image.tmdb.org') return P.includes('html') ? new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }) : new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (u.hostname === 'artworks.thetvdb.com') return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  throw new TypeError('fetch failed');
});
await A('/api/integrations/sonarr', 'PUT', { sonarr_url: 'http://sonarr.test:8989', sonarr_key: 'sonarr-hemmelig-nokkel' });
await A('/api/integrations/radarr', 'PUT', { radarr_url: 'http://radarr.test:7878', radarr_key: 'radarr-hemmelig-nokkel' });
await A('/api/integrations/qbittorrent', 'PUT', { qbit_url: 'http://qbit.test:8080', qbit_user: 'admin', qbit_pass: 'qbit-hemmelig-passord' });
m43._resetMediaSource43?.(); m43.clearMedia43();

test('torrenter: ferdige nedlastinger kobles via historikk-ID, tittel og plakat fra metadata', async () => {
  const r = await A('/api/media/torrents?filter=all');
  assert.equal(r.status, 200, r.text);
  const by = Object.fromEntries(r.body.items.map((x) => [x.hash, x]));
  const c = by[H_CIA];
  assert.deepEqual([c.title, c.code, c.episodeTitle, c.seriesId, c.tvdbId, c.linkedBy, c.year], ['CIA', 'S02E04', 'Black Tie Optional', 7, 4711, 'history', 2026]);
  assert.match(c.poster, /^\/api\/media\/bilde\/serie\/7\/poster\?/, 'plakaten fra Sonarr via bildecachen');
  assert.equal(c.posterAlt, `/api/media/ekstern?u=${encodeURIComponent('https://artworks.thetvdb.com/banners/posters/4711-1.jpg')}`, 'reserve: TVDB via proxy');
  assert.deepEqual(c.open, { tab: 'sonarr', id: 7 });
  assert.deepEqual([c.quality, c.sizeText], ['720p', '945 MB']);
  const s = by[H_SIN];
  assert.deepEqual([s.title, s.code, s.kind, s.movieId, s.tmdbId, s.linkedBy], ['Sinners', 'Film', 'movie', 3, 1233413, 'history']);
  assert.ok(s.posterAlt?.startsWith('/api/media/ekstern?u=https%3A%2F%2Fimage.tmdb.org'));
  // Ikke i kø eller historikk, men entydig tittel i biblioteket.
  const e = by[H_EXP];
  assert.deepEqual([e.title, e.seriesId, e.linkedBy], ['The Expanse', 8, 'title']);
  // Ukjent: ingen kobling, ingen plakat (klienten viser plassholder).
  const x = by[H_UKJ];
  assert.deepEqual([x.seriesId, x.linkedBy, x.poster, x.posterAlt], [null, null, null, null]);
  // Historikken hentes med serie/episode/film tatt med, og nøkkelen står aldri i adressen.
  assert.ok(calls.some((q) => q.startsWith('sonarr.test:8989/api/v3/history?') && q.includes('includeSeries=true') && q.includes('includeEpisode=true')), calls.join('\n'));
  assert.ok(calls.some((q) => q.startsWith('radarr.test:7878/api/v3/history?') && q.includes('includeMovie=true')));
  assert.ok(!calls.some((q) => q.includes('hemmelig')));
  assert.ok(!r.text.includes('hemmelig'));
});

test('plakat-ID-cache: metadata huskes når Sonarr ikke svarer', async () => {
  await A('/api/media/torrents?filter=all');
  const keep = CIA.images;
  m43.clearMedia43('sonarr:series');
  CIA.images = null; // historikken gir serien uten bilder; listen svarer fortsatt
  try {
    const r = await A('/api/media/torrents?filter=all');
    const c = r.body.items.find((x) => x.hash === H_CIA);
    assert.equal(c.title, 'CIA');
  } finally { CIA.images = keep; m43.clearMedia43(); }
});

test('serier, filmer og kalender har reserveplakat (posterAlt) via proxy', async () => {
  const s = await A('/api/media/series');
  assert.equal(s.status, 200, s.text);
  const ex = s.body.items.find((x) => x.id === 8);
  assert.match(ex.posterAlt ?? ex.poster, /^\/api\/media\/ekstern\?u=|^https:\/\/artworks/);
  const m = await A('/api/media/movies');
  assert.ok(m.body.items[0].posterAlt?.startsWith('/api/media/ekstern?u='));
});

test('/api/media/ekstern: bare TMDB/TVDB-bilder, bare bilder, krever innlogging', async () => {
  const ok = await A(`/api/media/ekstern?u=${encodeURIComponent('https://image.tmdb.org/t/p/original/sinners.jpg')}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.match(ok.headers.get('cache-control'), /max-age=86400/);
  const tv = await A(`/api/media/ekstern?u=${encodeURIComponent('https://artworks.thetvdb.com/banners/posters/4711-1.jpg')}`);
  assert.equal(tv.status, 200);
  for (const bad of ['http://image.tmdb.org/t/p/original/a.jpg', 'https://evil.test/t/p/original/a.jpg', 'https://image.tmdb.org.evil.test/t/p/w500/a.jpg', 'https://artworks.thetvdb.com/banners/../../etc/passwd.jpg',
    'https://image.tmdb.org/t/p/original/a.svg', 'http://127.0.0.1/x.jpg', 'file:///etc/passwd', '']) {
    const r = await A(`/api/media/ekstern?u=${encodeURIComponent(bad)}`);
    assert.equal(r.status, 400, bad);
  }
  const html = await A(`/api/media/ekstern?u=${encodeURIComponent('https://image.tmdb.org/t/p/original/html.jpg')}`);
  assert.equal(html.status, 404, 'ikke et bilde → 404');
  const anon = await req(`/api/media/ekstern?u=${encodeURIComponent('https://image.tmdb.org/t/p/original/sinners.jpg')}`);
  assert.equal(anon.status, 401);
});

/* ---------------- Klienten ---------------- */
const el = () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {}, addEventListener() {} });
globalThis.document ??= { addEventListener() {}, querySelector() { return null; }, createElement: el, head: el(), body: el(), documentElement: { dataset: {} } };
globalThis.addEventListener ??= () => {};
globalThis.window ??= globalThis;
const W = await import('../public/js/media70.js');

test('Klar til å se: Plex + Kalender + nedlasting = ett kort med Plex-tittel, episodenavn og kvalitet/størrelse', () => {
  const plex = { src: 'plex', kind: 'episode', title: 'CIA (2026)', code: 'S02E04', episodeTitle: 'Black Tie Optional', plexPoster: '/api/media/poster?src=plex&id=%2Flibrary%2Fmetadata%2F1%2Fthumb', at: '2026-11-05T10:00:00Z' };
  const cal = { kind: 'episode', seriesId: 7, tvdbId: 4711, title: 'CIA', code: 'S02E04', episodeTitle: 'Black Tie Optional', date: '2026-11-05', time: '02:00', poster: '/api/media/bilde/serie/7/poster?w=320&v=1', open: { tab: 'sonarr', id: 7 }, status: 'ok' };
  const tor = { hash: 'c', kind: 'episode', title: 'CIA', code: 'S02E04', seriesId: 7, tvdbId: 4711, linkedBy: 'history', quality: '720p', sizeText: '945 MB', completedAt: '2026-11-05T09:00:00Z', poster: '/api/media/bilde/serie/7/poster?w=320&v=1', posterAlt: '/api/media/ekstern?u=x' };
  // Uten ID (ukjent torrent) slås sammen på metadata-tittel uten årstall + kode.
  const tor2 = { hash: 'd', kind: 'episode', title: 'Line of Fire', code: 'S01E02', quality: '1080p', sizeText: '1,2 GB', completedAt: '2026-11-05T08:00:00Z', poster: null };
  const plex2 = { src: 'plex', kind: 'episode', title: 'Line of Fire (2026)', code: 'S01E02', episodeTitle: 'Pilot', plexPoster: '/api/media/poster?src=plex&id=2', at: '2026-11-05T08:30:00Z' };
  const film = { hash: 'e', kind: 'movie', title: 'Sinners', code: 'Film', movieId: 3, tmdbId: 1233413, linkedBy: 'history', quality: '1080p', sizeText: '6,1 GB', completedAt: '2026-11-05T07:00:00Z' };
  const filmPlex = { src: 'plex', kind: 'movie', title: 'Sinners (2025)', code: 'Film', tmdbId: 1233413, plexPoster: '/api/media/poster?src=plex&id=3', at: '2026-11-05T07:10:00Z' };
  const L = W.merge73([['plex', [plex, plex2, filmPlex]], ['cal', [cal]], ['tor', [tor, tor2, film]]]);
  assert.equal(L.length, 3, JSON.stringify(L.map((x) => x.title)));
  const a = L.find((x) => x.code === 'S02E04');
  assert.deepEqual([a.title, a.episodeTitle, a.quality, a.sizeText], ['CIA (2026)', 'Black Tie Optional', '720p', '945 MB']);
  assert.deepEqual(W.posters73(a), [plex.plexPoster, cal.poster, tor.posterAlt], 'Plex → Sonarr → TMDB/TVDB');
  assert.deepEqual(a.open, { tab: 'sonarr', id: 7 });
  const b = L.find((x) => x.code === 'S01E02');
  assert.deepEqual([b.title, b.quality], ['Line of Fire (2026)', '1080p']);
  const f = L.find((x) => x.code === 'Film');
  assert.deepEqual([f.title, f.sizeText, f.plexPoster], ['Sinners (2025)', '6,1 GB', filmPlex.plexPoster]);
  // Ulike episoder av samme serie er ulike kort.
  assert.equal(W.merge73([['tor', [tor, { ...tor, hash: 'x', code: 'S02E05' }]]]).length, 2);
});

test('Media-web: X-knapp i stedet for ⚙, plakatkjede overalt, lazy-lasting', () => {
  const src = readFileSync(new URL('../public/js/media70.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/css/media70.css', import.meta.url), 'utf8');
  assert.ok(src.includes('class="m70-x" data-m43="close" aria-label="Lukk Media"'));
  assert.ok(!src.includes('data-m43="set"'), 'innstillinger-ikonet er borte fra headeren');
  assert.ok(!src.includes('img50('), 'alle plakater går via img73 (kjeden)');
  assert.match(src, /loading="\$\{high \? 'eager' : 'lazy'\}"/);
  assert.match(css, /\.m70-x\{width:48px;height:48px;[^}]*border-radius:50%;border:1px solid var\(--p-ln\);background:var\(--p-card\)/);
  assert.match(css, /--p-ln:#E3DED3/);
  assert.match(css, /--p-card:#FCFBF7/);
  // Media-innstillingene finnes i appens Innstillinger.
  const s45 = readFileSync(new URL('../public/js/settings45.js', import.meta.url), 'utf8');
  assert.ok(s45.includes('data-s45-mpref="notifyDone"'));
});
