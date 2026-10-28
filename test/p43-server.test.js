// Prompt 43 (SERVER43): Felles API – Media (Sonarr, Radarr, qBittorrent, Prowlarr, Glimt, varsler, webhooks, kalender), Integrasjoner MEDIA,
// widgets (media + katalog), Claude-import + AI-minne, Google Search Console (årsak, Hent nå, Test), Kalender-oppdatering, Finans saldokort/måneder,
// Gjøremål-rekkefølge.
import './lib/day-clock.mjs'; // døgngrenser og nattstillhet: klokka holdes på dagtid (se lib/day-clock.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p43-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-43s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4221';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GITHUB_TOKEN;
for (const k of Object.keys(process.env)) if (k.startsWith('AI_HOST_') || k.startsWith('AI_GPU_')) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const m43 = await import('../server/media43.js');
const mock43 = await import('../server/media43-mock.js');
const mem43 = await import('../server/ai-memory43.js');
const imp43 = await import('../server/claude-import43.js');
const gsc43 = await import('../server/gsc43.js');
const domG = await import('../server/domains-glimt.js');
const appUpd = await import('../server/app-update.js');
const kal43 = await import('../server/kal-update43.js');
const fin43 = await import('../server/finans/finans43.js');

let ipN = 30;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${ipN++}` }, body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const cookieA = await login('sebastian', 'testpassord1');
const A = as({ cookie: cookieA });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const cookieI = await login('ingrid', 'ingridPassord123');
const I = as({ cookie: cookieI });
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const anon = as({});

/* ---------------- Media ---------------- */

test('media: status, tilgang og innstillinger', async () => {
  const s = await A('/api/media/status');
  assert.equal(s.status, 200, s.text);
  assert.deepEqual(s.body.services.map((x) => x.id), ['sonarr', 'radarr', 'qbittorrent', 'prowlarr', 'jellyfin', 'plex']);
  const son = s.body.services[0];
  assert.equal(son.mock, true);
  assert.equal(son.ok, true);
  assert.match(son.version, /^4\./);
  assert.equal(typeof son.ms, 'number');
  assert.ok(!JSON.stringify(s.body).includes('X-Api-Key') && !('key' in son));
  assert.match(s.body.hooks.sonarr, /^\/api\/media\/hook\/sonarr\?token=/);
  // Ingrid har ikke modulen før admin gir tilgang.
  assert.equal((await I('/api/media/status')).status, 403);
  assert.equal((await I('/api/media/access', 'PUT', { userId: ingridId, allowed: true })).status, 403);
  assert.equal((await A('/api/media/access', 'PUT', { userId: ingridId, allowed: true })).body.allowed, true);
  const st = await I('/api/media/status');
  assert.equal(st.status, 200);
  assert.ok(!st.body.hooks && st.body.admin === false);
  assert.ok((await A('/api/media/access')).body.users.find((u) => u.id === ingridId).allowed);
  assert.equal((await anon('/api/media/status')).status, 401);
  assert.deepEqual((await A('/api/media/settings')).body, { notifyDone: true, notifyFail: true, calendar: true, player: 'jellyfin' });
  assert.equal((await A('/api/media/settings', 'PUT', { player: 'vlc' })).status, 400);
  assert.equal((await A('/api/media/settings', 'PUT', { player: 'jellyfin', calendar: true })).body.player, 'jellyfin');
});

test('media: Kommer snart (Sonarr + Radarr + kø-status) og bibliotekene', async () => {
  const u = await A('/api/media/upcoming?days=7');
  assert.equal(u.status, 200, u.text);
  assert.equal(u.body.days.length, 7);
  assert.equal(u.body.days[0].label, 'I DAG');
  assert.equal(u.body.days[1].label, 'I MORGEN');
  assert.match(u.body.days[0].title, /^[A-ZÆØÅ][a-zæøå]+dag \d{1,2}\. [a-z]+$/);
  const it = u.body.items;
  const omitb = it.find((x) => x.title === 'Only Murders in the Building' && x.code === 'S05E09');
  assert.equal(omitb.status, 'stall');
  assert.equal(omitb.statusText, 'Står fast');
  assert.equal(omitb.time, '09:00');
  const shrink = it.find((x) => x.title === 'Shrinking' && x.code === 'S03E08');
  assert.equal(shrink.status, 'dl');
  assert.match(shrink.statusText, /^Lastes ned \d+ %$/);
  assert.ok(it.some((x) => x.kind === 'movie'));
  assert.ok(u.body.downloading.length <= 3 && u.body.downloadingCount >= 3);
  for (const d of u.body.days) assert.ok(d.items.every((x) => x.date === d.date));
  const s = await A('/api/media/series');
  assert.equal(s.body.counts.all, 11);
  assert.deepEqual(s.body.filters.map((f) => f.id), ['all', 'missing', 'continuing', 'ended']);
  assert.equal(s.body.counts.ended, 2);
  const m = await A('/api/media/movies');
  assert.equal(m.body.counts.all, 9);
  assert.equal(m.body.items.find((x) => x.title === 'Dune: Part Three').status, 'ann');
  assert.equal(m.body.items.find((x) => x.title === 'Oppenheimer').file.sizeText, '61,2 GB');
});

test('media: serieside, interaktivt søk med fargekodede seedere, last ned → qBittorrent', async () => {
  const lib = (await A('/api/media/series')).body.items;
  const id = lib.find((x) => x.title === 'Only Murders in the Building').id;
  const d = await A(`/api/media/series/${id}`);
  assert.equal(d.status, 200, d.text);
  assert.equal(d.body.seasons[0].number, 5);
  assert.equal(d.body.seasons[0].open, true);
  const ep = d.body.seasons[0].episodes.find((e) => e.number === 9);
  assert.deepEqual([ep.code, ep.title, ep.status, ep.canSearch], ['S05E09', 'The Last Floor', 'stall', true]);
  assert.match(d.body.searchLabel, /^Søk alle manglende \(\d+\)$/);
  assert.match(d.body.play.url, /search\.html\?query=Only%20Murders/);
  const r = await A(`/api/media/release?episodeId=${ep.id}`);
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.text, /^7 treff fra 12 indeksere · /);
  assert.equal(r.body.context.header, 'S05E09 · The Last Floor');
  const [best] = r.body.items;
  assert.equal(best.best, true);
  assert.equal(best.bestLabel, 'Best treff for profilen');
  assert.equal(best.resolution, 1080);
  assert.equal(best.seedTone, 'good');
  assert.equal(best.shortTitle, 'S05E09.1080p.WEB-DL.DDP5.1.H.264-NTb');
  assert.equal(best.langText, 'Tale EN · Tekst NO SV DA EN');
  const zero = r.body.items.find((x) => x.seeders === 0);
  assert.equal(zero.seedTone, 'bad');
  assert.equal(zero.rejected, true);
  // < 10 % av høyeste (1204) er rødt, ≥ 50 % grønt, ellers ingen farge.
  assert.equal(r.body.items.find((x) => x.seeders === 95).seedTone, 'bad');
  assert.equal(r.body.items.find((x) => x.seeders === 412).seedTone, null);
  assert.equal(r.body.items.find((x) => x.seeders === 860).seedTone, 'good');
  assert.deepEqual(r.body.filters.map((f) => f.id), ['all', '1080p', '2160p', 'no', 'seeders']);
  assert.equal(r.body.filters.find((f) => f.id === 'no').count, 3);
  const before = (await A('/api/media/torrents')).body.total;
  const g = await A('/api/media/release', 'POST', { guid: best.guid, indexerId: best.indexerId });
  assert.equal(g.status, 200, g.text);
  assert.equal(g.body.message, 'Sendt til qBittorrent: 1080p WEB-DL · 2,4 GB');
  const t = await A('/api/media/torrents');
  assert.equal(t.body.total, before + 1);
  assert.ok(t.body.items.some((x) => x.name === best.title && x.title === 'Only Murders in the Building' && x.code === 'S05E09'));
  assert.equal((await A('/api/media/release')).status, 400);
  assert.equal((await A('/api/media/release', 'POST', { guid: 'finnes-ikke', indexerId: 1 })).status, 404);
  // Radarr-søk
  const mv = (await A('/api/media/movies')).body.items.find((x) => x.title === 'Wicked: For Good');
  const rr = await A(`/api/media/release?movieId=${mv.id}`);
  assert.equal(rr.body.items[0].resolution, 2160, 'Ultra-HD-profil → 2160p først');
  assert.equal(rr.body.context.kind, 'movie');
});

test('media: legg til serie og film, endre, kommando og slett (bare admin)', async () => {
  const look = await A('/api/media/series/lookup?term=Severance');
  assert.equal(look.body.items[0].exists, false);
  const shr = await A('/api/media/series/lookup?term=Shrinking');
  assert.equal(shr.body.items[0].existsLabel, 'Finnes');
  const add = await A('/api/media/series', 'POST', { tvdbId: look.body.items[0].tvdbId, title: 'Severance', profile: '4K', monitor: 'future', seriesType: 'standard', searchNow: false });
  assert.equal(add.status, 200, add.text);
  assert.equal(add.body.series.profile, 'Ultra-HD');
  assert.match(add.body.message, /^Lagt til Severance · Ultra-HD/);
  assert.equal((await A('/api/media/series', 'POST', { tvdbId: look.body.items[0].tvdbId, title: 'Severance' })).status, 409);
  assert.equal((await A('/api/media/series', 'POST', { title: 'Zzz finnes ikke' })).status, 404);
  assert.equal((await A('/api/media/series', 'POST', { title: 'Pluribus', monitor: 'tull' })).status, 400);
  const sid = add.body.series.id;
  const up = await A('/api/media/upcoming?days=7');
  assert.ok(up.body.items.some((x) => x.title === 'Severance' && x.code === 'S03E01'), 'Severance i Kommer snart');
  // Ingrid (med modulen) kan be om innhold, men ikke endre profiler eller slette.
  assert.equal((await I(`/api/media/series/${sid}`, 'PUT', { profile: 'HD-1080p' })).status, 403);
  assert.equal((await I(`/api/media/series/${sid}`, 'DELETE')).status, 403);
  const ed = await A(`/api/media/series/${sid}`, 'PUT', { profile: 'HD-1080p', seriesType: 'anime', seasons: [{ number: 1, monitored: false }] });
  assert.equal(ed.status, 200, ed.text);
  assert.deepEqual([ed.body.series.profile, ed.body.series.seriesType], ['HD-1080p', 'anime']);
  const det = (await A(`/api/media/series/${sid}`)).body;
  assert.equal(det.seasons.find((s) => s.number === 1).monitored, false);
  assert.equal(det.seasons.find((s) => s.number === 2).monitored, false, 'monitor:future → gamle sesonger overvåkes ikke');
  const ep = det.seasons.find((s) => s.number === 2).episodes[0];
  assert.equal((await A('/api/media/episode/monitor', 'PUT', { episodeIds: [ep.id], monitored: true })).body.monitored, true);
  assert.equal((await A(`/api/media/series/${sid}`)).body.seasons.find((s) => s.number === 2).episodes[0].monitored, true);
  const mon = await A(`/api/media/series/${sid}`, 'PUT', { monitor: 'latestSeason' });
  assert.equal(mon.status, 200, mon.text);
  const dm = (await A(`/api/media/series/${sid}`)).body;
  assert.deepEqual(dm.seasons.map((x) => [x.number, x.monitored]), [[3, true], [2, false], [1, false]]);
  assert.equal((await A(`/api/media/series/${sid}`, 'PUT', { monitor: 'av og til' })).status, 400);
  await A('/api/media/episode/monitor', 'PUT', { episodeIds: [ep.id], monitored: true });
  const cmd = await A('/api/media/command', 'POST', { name: 'EpisodeSearch', episodeIds: [ep.id] });
  assert.equal(cmd.body.ok, true);
  assert.equal(cmd.body.service, 'sonarr');
  assert.equal((await A('/api/media/command', 'POST', { name: 'Slett alt' })).status, 400);
  assert.equal((await A('/api/media/command', 'POST', { name: 'SeasonSearch', seriesId: sid })).status, 400);
  assert.ok((await A('/api/media/torrents')).body.items.some((t) => t.title === 'Severance' && t.code === 'S02E01'), 'automatisk søk sendte til qBittorrent');
  const del = await A(`/api/media/series/${sid}?files=1`, 'DELETE');
  assert.deepEqual([del.body.ok, del.body.deleteFiles, del.body.message], [true, true, 'Slettet med filene']);
  assert.ok(mock43.mockState43().log.some((l) => l.op === 'deleteSeries' && l.deleteFiles));
  // Film med minimumAvailability
  const ml = await A('/api/media/movies/lookup?term=Bugonia');
  const am = await A('/api/media/movies', 'POST', { tmdbId: ml.body.items[0].tmdbId, title: 'Bugonia', minimumAvailability: 'inCinemas', profile: '1080p', searchNow: true });
  assert.equal(am.status, 200, am.text);
  assert.deepEqual([am.body.movie.minimumAvailability, am.body.movie.availabilityLabel, am.body.movie.profile], ['inCinemas', 'På kino', 'HD-1080p']);
  assert.equal((await A('/api/media/movies', 'POST', { title: 'Bugonia', minimumAvailability: 'snart' })).status, 409);
  const pm = await A(`/api/media/movies/${am.body.movie.id}`, 'PUT', { minimumAvailability: 'released', monitored: false });
  assert.deepEqual([pm.body.movie.minimumAvailability, pm.body.movie.monitored], ['released', false]);
  assert.equal((await A(`/api/media/movies/${am.body.movie.id}`, 'DELETE')).body.message, 'Slettet, filene er beholdt');
  const q = await A('/api/media/qualityprofiles');
  assert.deepEqual(q.body.sonarr.map((p) => p.name), ['Any', 'HD-720p', 'HD-1080p', 'HD - 720p/1080p', 'Ultra-HD']);
  assert.equal(q.body.monitor.length, 8);
  assert.deepEqual(q.body.availability.map((a) => a.id), ['announced', 'inCinemas', 'released']);
  const rf = await A('/api/media/rootfolders');
  assert.deepEqual(rf.body.disk.map((d) => d.path), ['/data/media/tv', '/data/media/film', '/data/downloads']);
  assert.equal(rf.body.low, false);
  assert.match(rf.body.disk[0].freeText, /TB ledig$/);
});

test('media: qBittorrent – pause/fortsett, kø, tving start, filer, alt-hastighet, magnet og slett', async () => {
  const t = (await A('/api/media/torrents')).body;
  assert.deepEqual(t.filters.map((f) => f.id), ['all', 'active', 'paused', 'done', 'stalled']);
  assert.ok(t.counts.stalled >= 1 && t.counts.paused >= 1);
  assert.match(t.transfer.dlText, /MB\/s$/);
  assert.match(t.transfer.summary, /aktive · ↑/);
  const bear = t.items.find((x) => x.title === 'The Bear');
  assert.equal(bear.status, 'pause');
  assert.equal(bear.code, 'S04');
  assert.equal((await A(`/api/media/torrents/${bear.hash}/resume`, 'POST')).body.torrent.status, 'dl');
  assert.equal((await A(`/api/media/torrents/${bear.hash}/pause`, 'POST')).body.torrent.status, 'pause');
  const top = await A(`/api/media/torrents/${bear.hash}/priority`, 'POST', { dir: 'top' });
  assert.equal(top.body.torrent.queue, 1);
  assert.equal(top.body.message, 'The Bear er nå nr. 1 i køen');
  assert.equal((await A(`/api/media/torrents/${bear.hash}/priority`, 'POST', { dir: 'sidelengs' })).status, 400);
  const omitb = t.items.find((x) => x.status === 'stall');
  assert.equal(omitb.statusText, 'Står fast · 0 seedere');
  assert.equal((await A(`/api/media/torrents/${omitb.hash}/forceStart`, 'POST')).body.message, 'Tvunget start · venter fortsatt på seedere');
  assert.equal((await A(`/api/media/torrents/${bear.hash}/recheck`, 'POST')).body.ok, true);
  const f = await A(`/api/media/torrents/${bear.hash}/files`);
  assert.equal(f.body.items.length, 4);
  assert.equal(f.body.items[3].wanted, false);
  assert.equal((await I(`/api/media/torrents/${bear.hash}/files`, 'POST', { files: [{ index: 0, priority: 0 }] })).status, 403);
  const nf = await A(`/api/media/torrents/${bear.hash}/files`, 'POST', { files: [{ index: 1, priority: 0 }] });
  assert.equal(nf.body.items[1].wanted, false);
  assert.equal((await A(`/api/media/torrents/${bear.hash}/files`, 'POST', { files: [{ index: 1, priority: 3 }] })).status, 400);
  assert.equal((await A('/api/media/torrents/ikke-en-hash/pause', 'POST')).status, 400);
  // Pause alt / Fortsett alt
  const pa = await A('/api/media/torrents/pauseAll', 'POST');
  assert.deepEqual([pa.body.allPaused, pa.body.allPausedLabel], [true, 'Fortsett alt']);
  assert.equal((await A('/api/media/torrents/resumeAll', 'POST')).body.allPaused, false);
  // Alt-hastighet: grense 5 MB/s
  const alt = await A('/api/media/altSpeed', 'POST', { on: true });
  assert.deepEqual([alt.body.altSpeed, alt.body.altLimitText], [true, 'grense 5 MB/s']);
  assert.ok(alt.body.dlSpeed <= 5 * 1024 * 1024 + 10);
  assert.equal((await A('/api/media/altSpeed', 'POST', { on: false })).body.altSpeed, false);
  assert.equal((await A('/api/media/transferinfo')).body.altSpeed, false);
  // Magnet: sjekk, legg til, duplikat, feil
  const url = 'magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567&dn=Big+Buck+Bunny+1080p&tr=udp%3A%2F%2Fa&tr=udp%3A%2F%2Fb';
  const ck = await A('/api/media/torrents/magnet/check', 'POST', { url });
  assert.deepEqual([ck.body.ok, ck.body.name, ck.body.trackers, ck.body.shortHash, ck.body.exists], [true, 'Big Buck Bunny 1080p', 2, '0123456789ab', false]);
  const add = await A('/api/media/torrents/magnet', 'POST', { url, category: 'radarr', paused: false, sequential: true, firstLast: true });
  assert.equal(add.status, 200, add.text);
  assert.deepEqual([add.body.torrent.status, add.body.torrent.statusText, add.body.torrent.sizeText, add.body.torrent.savePath], ['meta', 'Henter metadata …', 'størrelse ukjent', '/data/downloads/film']);
  const nt = (await A('/api/media/torrents')).body.items.find((x) => x.hash === '0123456789abcdef0123456789abcdef01234567');
  assert.deepEqual([nt.status, nt.statusText, nt.sizeText, nt.sequential, nt.firstLast, nt.category], ['meta', 'Henter metadata …', 'størrelse ukjent', true, true, 'radarr']);
  const dup = await A('/api/media/torrents/magnet', 'POST', { url });
  assert.deepEqual([dup.status, dup.body.error], [409, 'Ligger allerede i qBittorrent']);
  assert.equal((await A('/api/media/torrents/magnet/check', 'POST', { url })).body.exists, true);
  assert.equal((await A('/api/media/torrents/magnet', 'POST', { url: 'magnet:?dn=x' })).body.error, 'Magnet-lenken mangler xt=urn:btih:… (info-hash).');
  assert.equal((await A('/api/media/torrents/magnet', 'POST', { url: 'hei' })).status, 400);
  assert.equal((await A('/api/media/torrents/magnet', 'POST', { url, category: 'musikk' })).status, 400);
  assert.equal(m43.parseMagnet43('https://example.org/fil.torrent').name, 'fil');
  // base32-hash (32 tegn) gjøres om til hex
  assert.equal(m43.parseMagnet43('magnet:?xt=urn:btih:AERUKZ4JVPG66AJDIVTYTK6N54ASHXFT').hash.length, 40);
  // Slett med/uten filer (bare admin)
  assert.equal((await I(`/api/media/torrents/${nt.hash}`, 'DELETE')).status, 403);
  const del = await A(`/api/media/torrents/${nt.hash}?files=1`, 'DELETE');
  assert.deepEqual([del.body.deleteFiles, del.body.message], [true, 'Slettet med filene']);
  assert.ok(mock43.mockState43().log.some((l) => l.op === 'deleteTorrent' && l.deleteFiles && l.hashes.includes(nt.hash)));
  const pause = await A('/api/media/torrents?filter=paused');
  assert.ok(pause.body.items.every((x) => x.status === 'pause'));
});

test('media: Prowlarr – helse, test, test alle, katalog og legg til indekser', async () => {
  const x = await A('/api/media/indexers');
  assert.equal(x.status, 200, x.text);
  assert.equal(x.body.summary.text, '11 av 12 indeksere svarer');
  assert.match(x.body.summary.line, /^\d+ søk · \d+ hentet i dag$/);
  const leet = x.body.items.find((i) => i.name === '1337x');
  assert.equal(leet.ok, false);
  assert.match(leet.error, /^Tidsavbrudd siden \d\d:\d\d$/);
  assert.equal(x.body.items.find((i) => i.name === 'IPTorrents').line, '412 ms · 38 søk · 4 hentet i dag');
  assert.deepEqual(x.body.apps.map((a) => a.name), ['Sonarr', 'Radarr']);
  assert.equal(x.body.health.length, 1);
  const t1 = await A(`/api/media/indexers/${leet.id}/test`, 'POST');
  assert.equal(t1.body.ok, false);
  assert.match(t1.body.message, /FlareSolverr/);
  const t2 = await A('/api/media/indexers/1/test', 'POST');
  assert.equal(t2.body.ok, true);
  assert.match(t2.body.message, /^IPTorrents svarte på \d+ ms$/);
  const all = await A('/api/media/indexers/testall', 'POST');
  assert.equal(all.body.text, '11 av 12 indeksere svarer');
  const sc = await A('/api/media/indexers/schema?type=private&q=nord');
  assert.deepEqual(sc.body.items.map((i) => i.name), ['Nordicbytes']);
  const nb = sc.body.items[0];
  assert.deepEqual([nb.auth, nb.typeLabel, nb.added, nb.fields.map((f) => f.name)], ['user', 'Privat', false, ['username', 'password']]);
  assert.equal((await A('/api/media/indexers/schema?type=usenet')).body.count, 3);
  assert.equal((await A('/api/media/indexers/schema?type=public&q=eztv')).body.items[0].auth, 'none');
  assert.equal((await A('/api/media/indexers/schema?q=norbits')).body.items[0].addedLabel, 'Lagt til');
  assert.deepEqual((await A('/api/media/indexers/schema')).body.priorities, [1, 10, 25, 40, 50]);
  const miss = await A('/api/media/indexers', 'POST', { key: nb.key, fields: { username: 'seb' } });
  assert.deepEqual([miss.status, miss.body.error, miss.body.field], [400, 'Mangler passord', 'password']);
  const wrong = await A('/api/media/indexers/test', 'POST', { key: nb.key, fields: { username: 'seb', password: 'feil' } });
  assert.deepEqual([wrong.status, wrong.body.error, wrong.body.field], [400, 'Feil passord', 'password']);
  assert.equal((await I('/api/media/indexers', 'POST', { key: nb.key, fields: { username: 'seb', password: 'x' } })).status, 403);
  const ok = await A('/api/media/indexers', 'POST', { key: nb.key, fields: { username: 'seb', password: 'hemmelig' }, priority: 25, sonarr: true, radarr: true });
  assert.equal(ok.status, 200, ok.text);
  assert.match(ok.body.message, /^Nordicbytes lagt til · svarte på \d+ ms · synket til Sonarr og Radarr$/);
  assert.equal((await A('/api/media/indexers')).body.summary.total, 13);
  assert.equal((await A('/api/media/indexers/schema?q=nordic')).body.items[0].added, true);
  assert.ok(!JSON.stringify((await A('/api/media/indexers')).body).includes('hemmelig'), 'passordet sendes aldri tilbake');
});

test('media: Glimt – legg til i 4K, størrelsessøk, pause/fortsett alt, hva lastes ned', async () => {
  const a = await A('/api/media/glimt', 'POST', { q: 'legg til Severance i 4K' });
  assert.equal(a.status, 200, a.text);
  assert.equal(a.body.kind, 'add');
  assert.equal(a.body.results[0].profile, 'Ultra-HD');
  assert.equal(a.body.actions[0].type, 'add');
  assert.equal(a.body.actions[0].path, '/api/media/series');
  assert.equal(a.body.actions[0].body.profile, 'Ultra-HD');
  assert.ok(a.body.steps.some((s) => s.t === 'Søker i Sonarr og Radarr' && typeof s.ms === 'number'));
  assert.equal((await A('/api/media/glimt', 'POST', { q: 'legg til Shrinking' })).body.kind, 'exists');
  assert.equal((await A('/api/media/glimt', 'POST', { q: 'legg til Frankenstein i 1080p' })).body.results[0].profile, 'HD-1080p');
  const r = await A('/api/media/glimt', 'POST', { q: 'finn en episode av the rookie som er under 500mb' });
  assert.equal(r.body.kind, 'size');
  assert.ok(r.body.results.length >= 2 && r.body.results.length <= 6);
  assert.ok(r.body.results.every((x) => x.release.size <= 500 * 1024 * 1024 && x.release.seeders > 0));
  assert.equal(r.body.results[0].hasText, 'mangler', 'manglende episoder først');
  assert.ok(r.body.steps.some((s) => s.t === 'Fant The Rookie i Sonarr'));
  assert.ok(r.body.steps.some((s) => /^Søker i \d+ indeksere via Prowlarr$/.test(s.t)));
  assert.ok(r.body.steps.some((s) => /^Filtrerer på under 500 MB · \d+ treff$/.test(s.t)));
  assert.equal(r.body.results[0].action.type, 'grab');
  const gb = await A('/api/media/release', 'POST', r.body.results[0].action.body);
  assert.match(gb.body.message, /^Sendt til qBittorrent: 720p HEVC · 317 MB$/);
  const none = await A('/api/media/glimt', 'POST', { q: 'finn en episode av The Rookie som er under 10 MB' });
  assert.equal(none.body.text, 'Fant ingen utgivelser av The Rookie under 10 MB med seedere.');
  const notLib = await A('/api/media/glimt', 'POST', { q: 'finn en episode av Pluribus under 1 GB' });
  assert.equal(notLib.body.kind, 'add');
  const p = await A('/api/media/glimt', 'POST', { q: 'pause alt' });
  assert.equal(p.body.text, 'Alt er pauset.');
  assert.equal((await A('/api/media/torrents')).body.allPaused, true);
  assert.equal((await A('/api/media/glimt', 'POST', { q: 'fortsett alt' })).body.text, 'Alle nedlastinger går igjen.');
  assert.match((await A('/api/media/glimt', 'POST', { q: 'hva lastes ned' })).body.text, /^Lastes ned nå: /);
  assert.equal((await A('/api/media/glimt', 'POST', { q: 'hei' })).body.kind, 'help');
  assert.equal((await A('/api/media/glimt', 'POST', {})).status, 400);
});

test('media: widget, widget-galleri, kalenderkilde «media» og webhooks', async () => {
  const w = await A('/api/widgets/media');
  assert.equal(w.status, 200, w.text);
  assert.ok(w.body.downloads.length >= 1 && w.body.downloads.length <= 3);
  assert.ok(w.body.upcoming.length <= 3);
  assert.match(w.body.speedText, /MB\/s$/);
  assert.match(w.body.upcoming[0].when, /^(i dag|i morgen|[a-zæøå]{3})( \d\d:\d\d)?$/);
  assert.equal(w.body.hide, false);
  assert.deepEqual(Object.keys((await A('/api/media/widget')).body).sort(), Object.keys(w.body).sort());
  const ni = await as({ cookie: await login('ingrid', 'ingridPassord123') })('/api/widgets/media');
  assert.equal(ni.status, 200);
  const ios = (await A('/api/widgets/catalog?platform=ios')).body;
  assert.deepEqual(ios.groups.map((g) => g.name), ['Media', 'Avganger', 'Kalender', 'Prøveperioder', 'Pakker', 'Glimt-brief']);
  assert.deepEqual(ios.groups[0].widgets.map((x) => x.sizeLabel), ['Liten', 'Medium', 'Stor', 'Låseskjerm', 'Låseskjerm · rund', 'Låseskjerm · linje']);
  assert.equal(ios.addMode, 'steps');
  const and = (await A('/api/widgets/catalog?platform=android&samsung=1')).body;
  assert.deepEqual(and.groups[0].widgets.map((x) => [x.receiver, x.sizeLabel]), [['MediaSmallReceiver', '2 × 2'], ['MediaMediumReceiver', '4 × 2'], ['MediaLargeReceiver', '4 × 3']]);
  assert.deepEqual([and.style, and.addMode], ['samsung', 'pin']);
  assert.deepEqual(and.filters.map((f) => f.label), ['Alle', 'Media', 'Avganger', 'Kalender', 'Prøveperioder', 'Pakker', 'Glimt-brief']);
  assert.equal((await A('/api/widgets/catalog?platform=windows')).status, 400);
  // Kalender: «Media» i lista, hendelser i hendelseslista, kan slås av.
  const cals = (await A('/api/kalender/calendars')).body.calendars;
  const mc = cals.find((c) => c.id === 'media');
  assert.deepEqual([mc.name, mc.badge, mc.visible, mc.writable], ['Media', 'INNEBYGD', true, false]);
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const plus = (n) => new Date(Date.now() + n * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const ev = (await A(`/api/kalender?from=${day}&to=${plus(6)}`)).body.events.filter((e) => e.source === 'media');
  assert.ok(ev.some((e) => e.title === 'Shrinking · S03E08' && e.time === '09:00' && e.calendar === 'media'));
  assert.equal((await A('/api/kalender/calendars/media', 'PATCH', { visible: false })).body.calendar.visible, false);
  assert.ok(!(await A(`/api/kalender?from=${day}&to=${plus(6)}`)).body.events.some((e) => e.source === 'media'));
  assert.equal((await A('/api/kalender/calendars/media', 'DELETE')).status, 403);
  assert.equal((await A('/api/kalender/calendars/media', 'PATCH', { visible: true })).body.calendar.visible, true);
  // Webhooks: uten token fra internett → 401; med token → varsel.
  const hooks = (await A('/api/media/status')).body.hooks;
  assert.equal((await req('/api/media/hook/sonarr', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.7' }, body: { eventType: 'Download' } })).status, 401);
  const n0 = db.prepare("SELECT count(*) FROM notify_queue WHERE category='media'").pluck().get();
  const h = await req(hooks.sonarr, { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.7' }, body: { eventType: 'Download', series: { title: 'Shrinking' }, episodes: [{ id: 1, seasonNumber: 3, episodeNumber: 8 }] } });
  assert.equal(h.status, 200, h.text);
  assert.equal(h.body.notified, 'Ferdig: Shrinking S03E08');
  const rows = db.prepare("SELECT user_id, title FROM notify_queue WHERE category='media' ORDER BY id").all().slice(n0);
  assert.ok(rows.some((r) => r.user_id === sebId && r.title === 'Ferdig: Shrinking S03E08 · klar i Jellyfin'));
  assert.ok(rows.some((r) => r.user_id === ingridId), 'alle med modulen får varselet');
  const q = await req(hooks.qbit, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '198.51.100.7' }, raw: 'hash=abc&name=Slow.Horses.S06E03.2160p' });
  assert.equal(q.body.notified, 'Ferdig: Slow Horses S06E03');
  assert.equal((await req('/api/media/hook/ukjent', { method: 'POST' })).status, 404);
});

test('media: varseljobben – ferdig nedlasting og står fast i 30 min', async () => {
  const first = await m43.mediaWatch43(); // første runde: husker tilstanden (indekser nede varsles med en gang)
  assert.ok(first.some((s) => s.kind === 'indexer' && /1337x/.test(s.text)), JSON.stringify(first));
  assert.ok(!first.some((s) => s.kind === 'done'));
  const n0 = db.prepare("SELECT count(*) FROM notify_queue WHERE category='media'").pluck().get();
  mock43.advanceMock43(4 * 3600_000); // alt som laster ned blir ferdig
  m43.clearMedia43();
  const sent = await m43.mediaWatch43({ now: Date.now() + 31 * 60_000 });
  assert.ok(sent.some((s) => s.kind === 'done' && /^Ferdig: Shrinking S03E08 · klar i Jellyfin$/.test(s.text)), JSON.stringify(sent));
  assert.ok(sent.some((s) => s.kind === 'stall' && /^Står fast: Only Murders in the Building S05E09 · 0 seedere i 30 min$/.test(s.text)), JSON.stringify(sent));
  assert.ok(!sent.some((s) => s.kind === 'indexer'), 'indekser nede varsles én gang per dag');
  const titles = db.prepare("SELECT title FROM notify_queue WHERE category='media' AND user_id=? ORDER BY id").pluck().all(sebId).slice(-10);
  assert.ok(titles.includes('Ferdig: Shrinking S03E08 · klar i Jellyfin'));
  assert.ok(db.prepare("SELECT count(*) FROM notify_queue WHERE category='media'").pluck().get() > n0);
  // Neste runde varsler ikke det samme igjen.
  const again = await m43.mediaWatch43({ now: Date.now() + 40 * 60_000 });
  assert.ok(!again.some((s) => s.kind === 'done' && /Shrinking/.test(s.text)) && !again.some((s) => s.kind === 'stall'));
  // Ferdig i Sonarr: episoden er lastet ned.
  const id = (await A('/api/media/series')).body.items.find((x) => x.title === 'Shrinking').id;
  assert.equal((await A(`/api/media/series/${id}`)).body.seasons[0].episodes.find((e) => e.number === 8).status, 'ok');
  // Av i innstillingene → ingen varsel for brukeren.
  await A('/api/media/settings', 'PUT', { notifyDone: false });
  assert.equal(m43.prefsOf(sebId).notifyDone, false);
  await A('/api/media/settings', 'PUT', { notifyDone: true });
});

test('media: ekte tjenester – normalisering og feilmeldinger (fetch byttet ut)', async () => {
  const calls = [];
  m43._setMediaFetch43(async (url, init = {}) => {
    calls.push([init.method ?? 'GET', String(url), init.headers?.['X-Api-Key'] ?? null]);
    const u = new URL(url);
    const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
    if (u.hostname === 'nede.test') { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNREFUSED' }; throw e; }
    if (u.pathname === '/api/v3/system/status') return init.headers['X-Api-Key'] === 'riktig' ? j({ version: '4.0.10.2544' }) : j({ error: 'Unauthorized' }, 401);
    if (u.pathname === '/api/v3/qualityprofile') return j([{ id: 4, name: 'HD-1080p' }, { id: 5, name: 'Ultra-HD' }]);
    if (u.pathname === '/api/v3/series') return j([{ id: 7, title: 'The Expanse', year: 2015, network: 'Prime Video', status: 'ended', qualityProfileId: 5, monitored: true, seriesType: 'standard', path: '/data/media/tv/The Expanse',
      images: [{ coverType: 'poster', url: '/MediaCover/7/poster.jpg?lastWrite=1', remoteUrl: 'https://artworks.thetvdb.com/x.jpg' }], statistics: { episodeFileCount: 60, episodeCount: 62, totalEpisodeCount: 62, sizeOnDisk: 2.5 * 1024 ** 4, seasonCount: 6 } }]);
    if (u.pathname === '/api/v3/queue') return j({ records: [] });
    return j({}, 404);
  });
  try {
    await A('/api/integrations/sonarr', 'PUT', { sonarr_url: 'http://sonarr.test:8989', sonarr_key: 'feil' });
    const bad = await A('/api/integrations/sonarr/test', 'POST');
    assert.deepEqual([bad.body.ok, bad.body.message], [false, 'Sonarr: feil API-nøkkel (401)']);
    await A('/api/integrations/sonarr', 'PUT', { sonarr_key: 'riktig' });
    const ok = await A('/api/integrations/sonarr/test', 'POST');
    assert.equal(ok.body.ok, true);
    assert.match(ok.body.message, /^✓ Sonarr v4 svarte på \d+ ms$/);
    assert.equal((await A('/api/integrations/sonarr')).body.status, 'ok');
    m43.clearMedia43();
    const s = await A('/api/media/series');
    assert.equal(s.status, 200, s.text);
    const x = s.body.items[0];
    assert.deepEqual([x.title, x.status, x.profile, x.episodesText, x.sizeText], ['The Expanse', 'ended', 'Ultra-HD', '60 av 62 episoder · 2 mangler', '2,5 TB']);
    assert.match(x.poster, /^\/api\/media\/bilde\/serie\/7\/poster\?w=320&v=/, 'prompt 50: plakaten går via serverens bildecache, ikke rett til TVDB');
    assert.ok(calls.every(([, url, key]) => !url.includes('riktig') && (!url.includes('sonarr.test') || ['riktig', 'feil'].includes(key))), 'nøkkelen bare i hodet');
    await A('/api/integrations/sonarr', 'PUT', { sonarr_url: 'http://nede.test:8989' });
    m43.clearMedia43();
    const down = await A('/api/media/series');
    assert.equal(down.status, 502);
    assert.match(down.body.error, /ECONNREFUSED/);
    assert.equal(down.body.service, 'sonarr');
  } finally {
    await A('/api/integrations/sonarr/sonarr_url', 'DELETE');
    await A('/api/integrations/sonarr/sonarr_key', 'DELETE');
    m43._setMediaFetch43(null);
  }
  assert.equal(m43.svcConf43('sonarr').mock, true, 'tilbake til demo');
});

test('integrasjoner: MEDIA-gruppen med felt, «Mangler …», steg og tilgang', async () => {
  const list = (await A('/api/integrations')).body;
  const media = list.filter((x) => x.section === 'MEDIA');
  assert.deepEqual(media.map((x) => x.id).sort(), ['jellyfin', 'plex', 'prowlarr', 'qbittorrent', 'radarr', 'sonarr']);
  const by = Object.fromEntries(media.map((x) => [x.id, x]));
  assert.deepEqual(by.sonarr.fields.map((f) => f.key), ['sonarr_url', 'sonarr_key', 'sonarr_root', 'sonarr_profile']);
  assert.equal(by.sonarr.statusText, 'Mangler api-nøkkel');
  assert.equal(by.qbittorrent.statusText, 'Mangler passord');
  assert.deepEqual(by.qbittorrent.fields.map((f) => [f.key, f.type]), [['qbit_url', 'url'], ['qbit_user', 'text'], ['qbit_pass', 'secret'], ['qbit_save', 'text']]);
  assert.equal(by.prowlarr.fields.find((f) => f.key === 'flaresolverr_url').required, false);
  assert.equal(by.sonarr.guide.length, 7);
  const tok = (await A('/api/media/status')).body.hooks.sonarr.split('token=')[1];
  assert.equal(by.sonarr.guide[6].code, `https://home.kristo.no/api/media/hook/sonarr?token=${tok}`, 'admin ser adressen med token');
  assert.match(by.qbittorrent.guide.find((g) => g.title === 'Varsel når ferdig').code, /hook\/qbit\?token=[\w-]+" -d "hash=%I&name=%N"$/);
  assert.equal((await I('/api/integrations')).body.find((x) => x.id === 'sonarr').guide[6].code, 'https://home.kristo.no/api/media/hook/sonarr', 'andre ser ikke tokenet');
  assert.match(by.prowlarr.guide[3].code, /flaresolverr/);
  assert.equal(by.plex.guide[1].title, 'Finn X-Plex-Token');
  // Serveroppsett: Ingrid ser ikke qBittorrent/Prowlarr.
  const il = (await I('/api/integrations')).body;
  assert.ok(!il.some((x) => x.id === 'qbittorrent' || x.id === 'prowlarr'));
  assert.equal((await I('/api/integrations/qbittorrent', 'PUT', { qbit_pass: 'x' })).status, 403);
  // Lagre → Tilkoblet; passordet sendes aldri ut; test med feil adresse.
  const put = await A('/api/integrations/qbittorrent', 'PUT', { qbit_url: 'http://nede.example:8080', qbit_user: 'seb', qbit_pass: 'superhemmelig' });
  assert.deepEqual([put.body.status, put.body.statusText], ['ok', 'Tilkoblet']);
  assert.equal(put.body.fields.find((f) => f.key === 'qbit_pass').value, null);
  assert.ok(!JSON.stringify((await A('/api/integrations')).body).includes('superhemmelig'));
  assert.ok(!JSON.stringify((await A('/api/media/status')).body).includes('superhemmelig'));
  assert.match(String(kv.get(OWNER, 'cfg').qbit_pass), /^enc1:/, 'kryptert');
  const t = await A('/api/integrations/qbittorrent/test', 'POST');
  assert.equal(t.body.ok, false);
  await A('/api/integrations/qbittorrent/qbit_pass', 'DELETE');
  await A('/api/integrations/qbittorrent/qbit_url', 'DELETE');
  const t2 = await A('/api/integrations/prowlarr/test', 'POST');
  assert.deepEqual([t2.body.ok, t2.body.message], [false, 'Mangler api-nøkkel']);
  assert.equal(m43.svcConf43('qbit').mock, true);
});

/* ---------------- Claude-import og AI-minne ---------------- */

function zipOf(files) {
  const local = [], cd = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), comp = deflateRawSync(data), nb = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    local.push(h, nb, comp); cd.push(c, nb); off += 30 + nb.length + comp.length;
  }
  const cdb = Buffer.concat(cd), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cd.length / 2, 8); e.writeUInt16LE(cd.length / 2, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cdb, e]);
}
const CONV = [
  { uuid: 'c-0001', name: 'Hardlinks i Docker', created_at: '2026-01-20T10:00:00Z', updated_at: '2026-01-21T10:00:00Z', project_uuid: 'p-1', chat_messages: [
    { sender: 'human', text: '', content: [{ type: 'text', text: 'Hvordan får jeg hardlinks?' }], created_at: '2026-01-20T10:00:00Z' },
    { sender: 'assistant', text: 'Bruk samme /data-mappe.', attachments: [{ file_name: 'compose.yml', extracted_content: 'volumes: - /srv/data:/data' }], created_at: '2026-01-20T10:01:00Z' }] },
  { uuid: 'c-0002', name: 'Leseplan', created_at: '2026-10-12T08:00:00Z', updated_at: '2026-10-12T09:00:00Z', chat_messages: [{ sender: 'human', text: 'Lag en leseplan', created_at: '2026-10-12T08:00:00Z' }, { sender: 'assistant', content: [{ type: 'text', text: 'Uke 1 …' }] }] },
];
async function upload(cookie, buf, name, memory) {
  const fd = new FormData();
  fd.set('file', new Blob([buf]), name);
  if (memory) fd.set('memory', memory);
  return req('/api/chat/import/claude', { method: 'POST', headers: { cookie }, raw: fd });
}

test('claude-import: ZIP → forhåndsvisning → import til «Claude» → hopp over importerte → angre', async () => {
  const zip = zipOf({ 'conversations.json': JSON.stringify(CONV), 'projects.json': JSON.stringify([{ uuid: 'p-1', name: 'Homelab' }]), 'users.json': '[]', 'memories.json': JSON.stringify([{ conversations_memory: '- Studerer statistikk\n- Kjører Unraid' }]) });
  const p = await upload(cookieA, zip, 'data-2026-10-21.zip', 'Liker kaffe\n- studerer statistikk');
  assert.equal(p.status, 200, p.text);
  assert.deepEqual([p.body.conversations, p.body.messages, p.body.projects], [2, 4, 1]);
  assert.deepEqual(p.body.memory.map((m) => m.text), ['Studerer statistikk', 'Kjører Unraid', 'Liker kaffe'], 'uten duplikater');
  assert.equal(p.body.range.text, 'Fra 20. jan. 2026 til 12. okt. 2026 · prosjekter: Homelab');
  assert.deepEqual(p.body.items.map((x) => x.title), ['Leseplan', 'Hardlinks i Docker']);
  assert.equal(p.body.items[1].project, 'Homelab');
  assert.match(p.body.steps[0].t, /^Pakket ut 4 filer$/);
  assert.equal(p.body.steps[1].t, 'Fant 2 samtaler');
  assert.equal(p.body.button, 'Importer 2 samtaler og 3 minnepunkter');
  const page = await A(`/api/chat/import/claude/${p.body.importId}?q=lese`);
  assert.deepEqual(page.body.items.map((x) => x.id), ['c-0002']);
  assert.equal((await I(`/api/chat/import/claude/${p.body.importId}`)).status, 404, 'andres import er usynlig');
  const c = await A(`/api/chat/import/claude/${p.body.importId}/commit`, 'POST', {});
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.text, '✓ 2 samtaler og 3 minnepunkter importert');
  assert.equal(c.body.detail, 'Samtalene ligger i mappen «Claude» i Chat. Minnet ligger under Chat → ⚙ → Minne.');
  const chats = (await A('/api/chat/chats')).body;
  const f = chats.folders.find((x) => x.name === 'Claude');
  assert.deepEqual(f.chats.map((x) => x.id).sort(), ['cl_c-0001', 'cl_c-0002']);
  const one = (await A('/api/chat/chats/cl_c-0001')).body;
  assert.deepEqual(one.messages.map((m) => m.role), ['user', 'assistant']);
  assert.equal(one.messages[0].content, 'Hvordan får jeg hardlinks?');
  assert.match(one.messages[1].content, /\[Vedlegg: compose\.yml\]\nvolumes/);
  assert.equal(one.model, 'auto');
  const mem = (await A('/api/ai/memory')).body;
  assert.deepEqual(mem.items.map((m) => [m.text, m.src]), [['Studerer statistikk', 'Claude'], ['Kjører Unraid', 'Claude'], ['Liker kaffe', 'Claude']]);
  assert.match(mem43.memoryPrompt43(sebId), /- Liker kaffe/);
  assert.equal((await I('/api/ai/memory')).body.count, 0, 'minnet er per bruker');
  assert.equal((await A(`/api/chat/import/claude/${p.body.importId}/commit`, 'POST', {})).status, 409);
  // Samme eksport igjen: «Importert før», ikke valgt, hoppes over.
  const p2 = await upload(cookieA, zip, 'data.zip');
  assert.equal(p2.body.importedBefore, 2);
  assert.ok(p2.body.items.every((x) => x.imported && x.importedLabel === 'Importert før' && !x.selected));
  assert.ok(p2.body.memory.every((m) => m.exists && !m.selected));
  const c2 = await A(`/api/chat/import/claude/${p2.body.importId}/commit`, 'POST', { conversationIds: ['c-0001'] });
  assert.deepEqual([c2.body.conversations, c2.body.skipped, c2.body.memory], [0, 1, 0]);
  assert.match(c2.body.detail, /1 var importert før og ble hoppet over\.$/);
  // Angre den første importen.
  const u = await A(`/api/chat/import/claude/${p.body.importId}/undo`, 'POST');
  assert.deepEqual([u.body.removedConversations, u.body.removedMemory], [2, 3]);
  assert.equal((await A('/api/chat/chats/cl_c-0001')).status, 404);
  assert.equal((await A('/api/ai/memory')).body.count, 0);
});

test('claude-import: conversations.json, JSON, eksempel, bare minne og feil', async () => {
  const j = await upload(cookieA, Buffer.from(JSON.stringify(CONV)), 'conversations.json');
  assert.equal(j.body.conversations, 2);
  assert.equal((await upload(cookieA, Buffer.from('PK\u0003\u0004søppel'), 'eksport.zip')).body.error, 'Fila er ikke en gyldig ZIP');
  assert.equal((await upload(cookieA, zipOf({ 'users.json': '[]' }), 'eksport.zip')).body.error, 'Fant ikke conversations.json i eksporten');
  assert.equal((await upload(cookieA, Buffer.from('{"x":1}'), 'conversations.json')).body.error, 'Fant ikke conversations.json i eksporten');
  const s = await A('/api/chat/import/claude?sample=1', 'POST');
  assert.equal(s.body.conversations, 3);
  assert.equal(s.body.memory.length, 3);
  const onlyMem = await A('/api/chat/import/claude', 'POST', { memory: 'Har to katter\nHar to katter' });
  assert.deepEqual([onlyMem.body.conversations, onlyMem.body.memory.length], [0, 1]);
  const cm = await A(`/api/chat/import/claude/${onlyMem.body.importId}/commit`, 'POST', { importConversations: false });
  assert.deepEqual([cm.body.conversations, cm.body.memory], [0, 1]);
  assert.equal((await A('/api/chat/import/claude', 'POST', {})).status, 400);
  assert.equal((await anon('/api/chat/import/claude', 'POST', {})).status, 401);
  // AI-minne: CRUD.
  const add = await A('/api/ai/memory', 'POST', { items: ['Bor i Oslo', 'har to katter'] });
  assert.deepEqual([add.body.added.length, add.body.skipped], [1, 1]);
  const id = add.body.added[0].id;
  assert.equal((await A(`/api/ai/memory/${id}`, 'PATCH', { text: 'Bor på Majorstuen' })).body.item.text, 'Bor på Majorstuen');
  assert.equal((await I(`/api/ai/memory/${id}`, 'DELETE')).status, 404);
  assert.equal((await A(`/api/ai/memory/${id}`, 'DELETE')).body.ok, true);
  assert.equal((await A('/api/ai/memory', 'POST', { text: '' })).status, 400);
  assert.deepEqual(imp43.memoryFrom43({ project_memories: { a: '1. Første\n2. Andre' } }), ['Første', 'Andre']);
});

/* ---------------- Google Search Console ---------------- */

test('gsc: årsak ved tomt (scope, ikke bekreftet, ingen eiendom, venter, ingen visninger), Hent nå og Test', async () => {
  const G = domG._gsc43;
  // Koble til (innebygd Google i MOCK_DATA uten klient).
  const a = await A('/api/gsc/auth?return=/%23/domener');
  const cb = await A(new URL(a.headers.get('location'), 'http://x').pathname + new URL(a.headers.get('location'), 'http://x').search);
  assert.match(cb.headers.get('location'), /gsc=ok/);
  await new Promise((r) => setTimeout(r, 300));
  const okv = (await A('/api/domains/kristo.no/gsc?period=28')).body;
  assert.ok(okv.kpi.impressions.value > 0 && !okv.empty);
  const t = await A('/api/domains/kristo.no/gsc/test');
  assert.equal(t.status, 200, t.text);
  assert.deepEqual([t.body.ok, t.body.siteUrl, t.body.permissionLevel, t.body.scopeOk, t.body.rows28], [true, 'sc-domain:kristo.no', 'siteOwner', true, 28]);
  assert.match(t.body.message, /^✓ sc-domain:kristo\.no · eier · 28 dager med data/);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  assert.equal(t.body.period.endDate, G.addDays(today, -3), 'endDate = i dag − 3');
  assert.equal((await A('/api/gsc/test?siteUrl=sc-domain:kristo.no')).body.ok, true);
  const rf = await A('/api/domains/kristo.no/gsc/refresh', 'POST', { period: 28 });
  assert.equal(rf.status, 200, rf.text);
  assert.deepEqual([rf.body.ok, rf.body.rows, rf.body.site], [true, 28, 'sc-domain:kristo.no']);
  // Egen «Google» for årsakene.
  let sites = [{ siteUrl: 'sc-domain:kristo.no', permissionLevel: 'siteOwner' }, { siteUrl: 'https://arildkrist.com/', permissionLevel: 'siteUnverifiedUser' }];
  let rows = 'none';
  gsc43._resetGsc43();
  domG._setGscFetch(async (url, init = {}) => {
    const u = String(url), json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
    if (u.includes('/token')) return json({ access_token: 'x', expires_in: 3600 });
    if (u.includes('tokeninfo')) return json({ scope: G.conf(sebId).scope ?? `openid email ${G.GSC_SCOPE}`, expires_in: 3000 });
    if (u.endsWith('/sites')) return json({ siteEntry: sites });
    if (u.includes('searchAnalytics')) return rows === 'forbid' ? json({ error: { message: 'Request had insufficient authentication scopes.' } }, 403) : json({ rows: [] });
    return json({}, 404);
  });
  try {
    // Ikke bekreftet: eiendommen finnes bare som siteUnverifiedUser.
    G.setConf(sebId, { sites: { 'kristo.no': 'sc-domain:kristo.no' }, siteList: [] });
    const un = (await A('/api/domains/arildkrist.com/gsc')).body;
    assert.deepEqual([un.empty, un.reason, un.message], [true, 'unverified', 'Eiendommen er ikke bekreftet i Search Console']);
    // Ingen eiendom for domenet.
    sites = [{ siteUrl: 'sc-domain:kristo.no', permissionLevel: 'siteOwner' }];
    gsc43._resetGsc43();
    const g = gsc43;
    const na = await g.gscDiagnose43(sebId, 'arildkrist.com');
    assert.equal(na.reason, 'noaccess');
    // En eiendom som passer, men ikke valgt → velges automatisk og hentes («Bruk»).
    sites = [{ siteUrl: 'sc-domain:kristo.no', permissionLevel: 'siteOwner' }, { siteUrl: 'sc-domain:arildkrist.com', permissionLevel: 'siteFullUser' }];
    gsc43._resetGsc43();
    const auto = await A('/api/domains/arildkrist.com/gsc/test');
    assert.equal(auto.body.permissionLevel, 'siteFullUser');
    G.setConf(sebId, { sites: { 'kristo.no': 'sc-domain:kristo.no' } });
    db.prepare("DELETE FROM gsc_daily WHERE user_id=? AND domain='arildkrist.com'").run(sebId);
    const pend = await g.gscDiagnose43(sebId, 'arildkrist.com');
    assert.equal(pend.reason, 'pending');
    assert.equal(G.conf(sebId).sites['arildkrist.com'], 'sc-domain:arildkrist.com', 'valgt automatisk');
    await new Promise((r) => setTimeout(r, 100));
    // Hentet, men 0 rader → ingen visninger.
    const ni = (await A('/api/domains/arildkrist.com/gsc?period=28')).body;
    assert.deepEqual([ni.empty, ni.reason], [true, 'noimpressions']);
    assert.equal(ni.site, 'sc-domain:arildkrist.com');
    // Mangler scope.
    G.setConf(sebId, { scope: 'openid email' });
    assert.equal((await A('/api/domains/arildkrist.com/gsc')).body.reason, 'scope');
    const ts = await A('/api/domains/arildkrist.com/gsc/test');
    assert.deepEqual([ts.body.ok, ts.body.scopeOk, ts.body.reason], [false, false, 'scope']);
    G.setConf(sebId, { scope: `openid email ${G.GSC_SCOPE}` });
    // 403 fra Google ved henting.
    rows = 'forbid';
    const rf2 = await A('/api/domains/arildkrist.com/gsc/refresh', 'POST', {});
    assert.deepEqual([rf2.status, rf2.body.reason], [409, 'scope']);
    // Overview: Google Søk uten tall får årsaken.
    const ov = (await A('/api/domains/overview?per=7d&domain=arildkrist.com')).body;
    assert.equal(ov.gsc.empty, true);
    assert.ok(['scope', 'noimpressions'].includes(ov.gsc.reason));
    assert.equal((await I('/api/domains/kristo.no/gsc/test')).status, 403);
  } finally { domG._setGscFetch(null); G.setConf(sebId, { error: null }); }
});

/* ---------------- Kalender-oppdatering ---------------- */

test('kalender: /api/apps/kalender/latest fra GitHub-releasene (stabil/beta, SHA-256, uinnlogget) og nedlasting', async () => {
  const sha = 'a'.repeat(64), shaB = 'b'.repeat(64), shaA = 'c'.repeat(64);
  const RELS = [
    { id: 2, tag_name: 'v1.2.0', prerelease: true, published_at: '2026-10-20T10:00:00Z', html_url: 'https://github.com/SebastianKristo/torskenes-verden/releases/tag/v1.2.0', body: '## Endringer\n- Beta-ting', assets: [{ name: 'Kalender-1.2.0.dmg', size: 13002342, browser_download_url: 'https://github.com/d/Kalender-1.2.0.dmg' }, { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/d/sums2' }] },
    { id: 1, tag_name: 'v1.1.0', prerelease: false, published_at: '2026-10-18T10:00:00Z', html_url: 'https://github.com/SebastianKristo/torskenes-verden/releases/tag/v1.1.0', body: '## Endringer\n- Menylinja virker\n- Rød «+ Ny hendelse»\nKalender build: 17',
      assets: [{ name: 'Kalender-1.1.0.dmg', size: 13002342, browser_download_url: 'https://github.com/d/Kalender-1.1.0.dmg' }, { name: 'Kalender-1.1.0.apk', size: 9000000, browser_download_url: 'https://github.com/d/Kalender-1.1.0.apk' }, { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/d/sums1' }] },
  ];
  appUpd._setFetch(async (url) => {
    const u = String(url);
    if (u.includes('/releases?per_page')) return new Response(JSON.stringify(RELS), { status: 200 });
    if (u.endsWith('/sums1')) return new Response(`${sha}  Kalender-1.1.0.dmg\n${shaA}  Kalender-1.1.0.apk\n`, { status: 200 });
    if (u.endsWith('/sums2')) return new Response(`${shaB}  Kalender-1.2.0.dmg\n`, { status: 200 });
    if (u.includes('CHANGELOG.md')) return new Response('nope', { status: 404 });
    if (u.endsWith('Kalender-1.1.0.dmg')) return new Response(Buffer.from('DMG-INNHOLD'), { status: 200, headers: { 'content-length': '11' } });
    return new Response('x', { status: 404 });
  });
  kal43._clearKalUpdate43();
  try {
    const m = await anon('/api/apps/kalender/latest?platform=mac&channel=stabil&current=1.0.0');
    assert.equal(m.status, 200, m.text);
    assert.deepEqual([m.body.version, m.body.build, m.body.size, m.body.sha256, m.body.url, m.body.updateAvailable], ['1.1.0', 17, 13002342, sha, '/api/apps/kalender/1.1.0/Kalender-1.1.0.dmg', true]);
    assert.deepEqual(m.body.notes, ['Menylinja virker', 'Rød «+ Ny hendelse»', 'Kalender build: 17'].slice(0, 2).concat(m.body.notes.slice(2)));
    assert.equal(m.body.publishedAt, '2026-10-18T10:00:00Z');
    assert.equal(m.body.sizeText, '12,4 MB');
    assert.ok(!JSON.stringify(m.body).includes('github.com/d/'), 'ingen direkte asset-adresser');
    const b = await anon('/api/apps/kalender/latest?platform=mac&channel=beta');
    assert.deepEqual([b.body.version, b.body.sha256, b.body.prerelease], ['1.2.0', shaB, true]);
    const an = await anon('/api/apps/kalender/latest?platform=android');
    assert.deepEqual([an.body.version, an.body.sha256, an.body.file], ['1.1.0', shaA, 'Kalender-1.1.0.apk']);
    assert.equal((await anon('/api/apps/kalender/latest?platform=android&channel=beta')).body.version, '1.1.0', 'beta uten APK → nyeste med APK');
    assert.equal((await anon('/api/apps/kalender/latest?platform=ios')).body.text, 'Oppdateres via TestFlight/IPA');
    assert.equal((await anon('/api/apps/kalender/latest?platform=windows')).status, 400);
    const dl = await anon('/api/apps/kalender/1.1.0/Kalender-1.1.0.dmg');
    assert.equal(dl.status, 200);
    assert.equal(dl.text, 'DMG-INNHOLD');
    assert.equal(dl.headers.get('x-checksum-sha256'), sha);
    assert.equal((await anon('/api/apps/kalender/1.1.0/annet.exe')).status, 404);
  } finally { appUpd._setFetch((...a) => fetch(...a)); kal43._clearKalUpdate43(); }
});

/* ---------------- Finans og Gjøremål ---------------- */

test('finans: saldokortet (spentMonth, day, daysInMonth) og netto per måned i Liste', async () => {
  await A('/finans/api/bootstrap');
  const o = await A('/finans/api/overview');
  assert.equal(o.status, 200, o.text);
  const now = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const [y, mm, dd] = now.split('-').map(Number);
  assert.equal(o.body.day, dd);
  assert.equal(o.body.daysInMonth, new Date(Date.UTC(y, mm, 0)).getUTCDate());
  assert.equal(o.body.spentMonth, o.body.ut);
  assert.ok(typeof o.body.balance === 'number');
  assert.match(o.body.spentLabel, /^Brukt i [a-zæøå]+ · dag \d+ av \d+$/);
  assert.equal(o.body.dayText, `${dd}.`);
  const s = await A('/finans/api/summary');
  assert.deepEqual([s.body.day, s.body.daysInMonth, s.body.spentMonth], [o.body.day, o.body.daysInMonth, o.body.spentMonth]);
  assert.equal(fin43.saldoFields43({ month: '2026-02', ut: 10 }).daysInMonth, 28);
  const m = await A('/finans/api/transactions/months');
  assert.ok(m.body.months.length >= 1);
  const cur = m.body.months[0];
  assert.match(cur.label, /^[A-ZÆØÅ]+ · \d+$/);
  assert.match(cur.netText, /^Netto [+−]?[\d  ]+,\d\d kr$/);
  const t = await A('/finans/api/transactions?limit=3');
  assert.ok(Array.isArray(t.body.months) && t.body.months.every((x) => t.body.items.some((i) => i.date.startsWith(x.month))));
  assert.equal((await I('/finans/api/overview')).status, 200);
});

test('gjøremål: rekkefølge på lister per bruker (PUT /api/tasks/lists/order)', async () => {
  await A('/api/tasks/lists'); // lister som lages ved første besøk («Mine»)
  await I('/api/tasks/lists');
  const g = await A('/api/tasks/lists/order');
  assert.equal(g.status, 200, g.text);
  assert.equal(g.body.ids[0], 'alle');
  assert.deepEqual(g.body.ids.slice(-2), ['arkivert', 'glimt']);
  const lists = g.body.ids.filter((k) => !['alle', 'arkivert', 'glimt'].includes(k));
  const want = ['glimt', ...lists.slice().reverse(), 'alle', 'ukjent-liste'];
  const p = await A('/api/tasks/lists/order', 'PUT', { ids: want });
  assert.deepEqual(p.body.ids, ['glimt', ...lists.slice().reverse(), 'alle', 'arkivert'], 'ukjente fjernes, manglende legges til');
  assert.equal(p.body.custom, true);
  assert.deepEqual((await A('/api/tasks/lists')).body.listOrder, p.body.ids);
  // Ny liste havner sist blant listene (før Arkivert).
  const nl = await A('/api/tasks/lists', 'POST', { name: 'Hage' });
  const after = (await A('/api/tasks/lists/order')).body.ids;
  assert.equal(after[after.length - 2], nl.body.list.id);
  assert.equal(after[after.length - 1], 'arkivert');
  assert.notDeepEqual((await I('/api/tasks/lists/order')).body.ids, after, 'per bruker');
  assert.deepEqual((await A('/api/tasks/lists/order', 'PUT', { reset: true })).body.custom, false);
  assert.equal((await A('/api/tasks/lists/order', 'PUT', { ids: 'alle' })).status, 400);
});
