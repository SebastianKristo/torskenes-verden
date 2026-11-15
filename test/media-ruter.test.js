// Låser svarene til Media-rutene (status per rolle og feltene i svaret) før serverfilene samles i server/media/ (Fase 2b).
// Omstruktureringen skal ikke endre stier, statuskoder eller felt. Rollene: A = admin (eier), I = bruker med Media-tilgang (økt),
// K = bruker uten Media-tilgang, TI = samme som I med app-token (mobil), N = ikke innlogget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-media-ruter-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-mr';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
for (const [u, name] of [['ingrid', 'Ingrid'], ['kari', 'Kari']]) assert.equal((await A('/api/users', 'POST', { username: u, password: `${u}Passord123`, role: 'bruker', name })).status, 200);
const idOf = (u) => db.prepare('SELECT id FROM users WHERE username=?').pluck().get(u);
assert.equal((await A('/api/media/access', 'PUT', { userId: idOf('ingrid'), allowed: true })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const K = as({ cookie: await login('kari', 'kariPassord123') });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'ingrid', password: 'ingridPassord123', device: 'iPhone' } })).json?.token;
assert.ok(tok);
const TI = as({ authorization: `Bearer ${tok}` });
const N = as({});
const WHO = { A, I, K, TI, N };

const sid = (await A('/api/media/series')).json.items[0].id;
const mid = (await A('/api/media/movies')).json.items[0].id;
const hash = (await A('/api/media/torrents')).json.items[0].hash;

// [sti, status for A I K TI N, feltene i 200-svaret ("[]" = liste, "" = ikke sjekket)]
const GETS = [
  ['/api/medctl51/links', '200 403 403 403 401', 'links'],
  ['/api/medctl51/now', '200 200 403 200 401', 'admin audio configured items mock'],
  ['/api/media/access', '200 403 403 403 401', 'users'],
  ['/api/media/calendar', '200 200 403 200 401', 'allPaused days downloading downloadingCount from items sources speedText to'],
  ['/api/media/cover', '400 400 403 400 401', ''],
  ['/api/media/diag', '200 200 200 200 401', 'anon calls'],
  ['/api/media/diagnostics', '200 403 403 403 401', 'at failed legend ok steps summary'],
  ['/api/media/disk', '200 200 403 200 401', 'disk low lowText radarr sonarr'],
  ['/api/media/ekstern', '400 400 403 400 401', ''],
  ['/api/media/health', '200 200 403 200 401', 'items ok'],
  ['/api/media/history', '200 200 200 200 401', 'configured items mock servers'],
  ['/api/media/indexers', '200 200 403 200 401', 'apps health healthy items summary'],
  ['/api/media/indexers/health', '200 200 403 200 401', 'items ok'],
  ['/api/media/indexers/schema', '200 200 403 200 401', 'count defaultPriority filters items priorities total'],
  ['/api/media/movies', '200 200 403 200 401', 'counts filters items'],
  [`/api/media/movies/${mid}`, '200 200 403 200 401', 'added availabilityLabel canDeleteFile canRedownload color digitalRelease fanart file hasFile id inCinemas kind minimumAvailability monitored movieFileId note overview path physicalRelease play poster posterAlt profile profileId progress rootFolder status statusColor statusText subtitle title tmdbId year'],
  ['/api/media/movies/lookup?term=dune', '200 200 403 200 401', 'items'],
  ['/api/media/now', '200 200 200 200 401', 'configured items mock servers'],
  ['/api/media/nrk/status', '200 200 403 200 401', 'configured message'],
  ['/api/media/nrk/jobber', '200 200 403 200 401', 'configured folger jobber message'],
  ['/api/media/nrk/bibliotek', '200 200 403 200 401', 'configured elementer message tilgjengelig'],
  ['/api/media/poster', '404 404 404 404 401', ''],
  ['/api/media/qualityprofiles', '200 200 403 200 401', 'availability defaults monitor radarr seriesTypes sonarr'],
  ['/api/media/recent', '200 200 200 200 401', 'configured items mock servers'],
  ['/api/media/release?episodeId=1', '404 404 403 404 401', ''],
  ['/api/media/release/search/x', '404 404 403 404 401', ''],
  ['/api/media/search/x', '404 404 403 404 401', ''],
  ['/api/media/rootfolders', '200 200 403 200 401', 'disk low lowText radarr sonarr'],
  ['/api/media/series', '200 200 403 200 401', 'counts filters items'],
  [`/api/media/series/${sid}`, '200 200 403 200 401', 'added color episodes episodesText fanart id kind missingCount monitor monitored network nextAiring overview path play poster posterAlt profile profileId rootFolder searchLabel seasonCount seasons seriesType seriesTypeLabel sizeOnDisk sizeText status statusLabel subtitle title tvdbId year'],
  ['/api/media/series/lookup?term=office', '200 200 403 200 401', 'items'],
  ['/api/media/servers', '200 200 403 200 401', '[]'],
  ['/api/media/servers?status=1', '200 200 403 200 401', '[]'],
  ['/api/media/settings', '200 200 403 200 401', 'calendar notifyDone notifyFail player'],
  ['/api/media/status', '200 200 403 200 401', 'admin canEdit hooks mock play services settings setupRoute'],
  ['/api/media/torrents', '200 200 403 200 401', 'allPaused allPausedLabel counts filters items total transfer'],
  [`/api/media/torrents/${hash}/files`, '200 200 403 200 401', 'hash items'],
  ['/api/media/torrents/categories', '200 200 403 200 401', 'items'],
  ['/api/media/track', '400 400 403 400 401', ''],
  ['/api/media/track/x', '404 404 403 404 401', ''],
  ['/api/media/transferinfo', '200 200 403 200 401', 'active altLimit altLimitText altSpeed dlSpeed dlText queued summary upSpeed upText'],
  ['/api/media/unmonitored?service=sonarr', '200 403 403 403 401', 'count items scope service size sizeText text'],
  ['/api/media/unmonitored/pending/x', '404 403 403 403 401', ''],
  ['/api/media/upcoming', '200 200 403 200 401', 'allPaused days downloading downloadingCount from items sources speedText to'],
  ['/api/media/widget', '200 200 403 200 401', 'active activeText allPaused altSpeed bigText configured downloads hide refreshSec speed speedText tab upText upcoming updatedAt'],
  ['/api/media/yubal/status', '200 200 403 200 401', 'configured message'],
  ['/api/media/yubal/jobs', '200 200 403 200 401', 'configured jobs message'],
  ['/api/media/yubal/subscriptions', '200 200 403 200 401', 'configured items message'],
  ['/api/playback/history', '200 200 403 200 401', 'items page pages total users'],
  ['/api/playback/libraries', '200 200 403 200 401', 'items'],
  ['/api/playback/plex/servers', '200 403 403 403 401', 'items selected'],
  ['/api/playback/sessions', '200 200 403 200 401', 'items kpi servers'],
  ['/api/playback/stats', '200 200 403 200 401', 'perDay platforms range topMovies topShows topUsers total'],
  ['/api/playback/status', '200 200 403 200 401', 'jellyfin plex'],
  ['/api/playback/summary', '200 200 403 200 401', 'empty emptyText history perDay perDevice perUser range ranges topMovies topShows total'],
  ['/api/widgets/media', '200 200 200 200 401', 'active activeText allPaused altSpeed bigText configured downloads hide refreshSec speed speedText tab upText upcoming updatedAt'],
  ['/api/media/finnes-ikke', '404 404 404 404 401', ''],
  ['/api/playback/finnes-ikke', '404 404 404 404 401', ''],
  ['/api/media/series?q=the', '200 200 403 200 401', 'counts filters items matches q'],
  ['/api/media/movies?q=du', '200 200 403 200 401', 'counts filters items matches q'],
  ['/api/media/series?server=finnes-ikke', '200 200 403 200 401', 'counts filters items'],
];

test('media-ruter: status per rolle og felt i svaret er uendret', async () => {
  for (const [path, statuses, keys] of GETS) {
    const want = statuses.split(' ').map(Number);
    let ok200 = null;
    for (const [i, [w, f]] of Object.entries(Object.entries(WHO))) {
      const r = await f(path);
      assert.equal(r.status, want[i], `${w} GET ${path}: ${r.text.slice(0, 120)}`);
      if (r.status >= 400) assert.equal(typeof r.json?.error, 'string', `${w} GET ${path}: feilsvar har {error}`);
      if (r.status === 200 && !ok200) ok200 = r.json;
    }
    if (!keys) continue;
    if (keys === '[]') { assert.ok(Array.isArray(ok200), `GET ${path} er en liste`); continue; }
    assert.deepEqual(Object.keys(ok200).sort(), keys.split(' '), `GET ${path}: feltene`);
  }
});

test('media-ruter: skriving og tilgangskrav (ugyldige kall endrer ingenting)', async () => {
  const CASES = [
    // [metode, sti, body, status for K N I A]
    ['POST', '/api/media/release', {}, '403 401 400 400'],
    ['POST', '/api/media/release/search', {}, '403 401 400 400'],
    ['POST', '/api/media/track', {}, '403 401 400 400'],
    ['POST', '/api/media/servers', {}, '403 401 403 400'],
    ['POST', '/api/media/command', {}, '403 401 400 400'],
    ['POST', '/api/media/glimt', {}, '403 401 400 400'],
    ['POST', '/api/media/unmonitored/delete', {}, '403 401 403 400'],
    ['PUT', '/api/media/servers/select', { id: 'x' }, '403 401 404 404'],
    ['POST', '/api/playback/plex/pin', undefined, '403 401 403 200'],
    ['POST', '/api/media/diagnostics', {}, '403 401 403 200'],
    ['POST', '/api/media/hook/x', {}, '404 404 404 404'],
    ['DELETE', '/api/media/episodes/999999/file', undefined, '403 401 403 404'],
    ['POST', '/api/media/nrk/jobber', {}, '403 401 400 400'],
    ['POST', '/api/media/yubal/jobs', {}, '403 401 400 400'],
  ];
  for (const [m, path, body, statuses] of CASES) {
    const want = statuses.split(' ').map(Number);
    for (const [i, [w, f]] of Object.entries(Object.entries({ K, N, I, A }))) {
      const r = await f(path, m, body);
      assert.equal(r.status, want[i], `${w} ${m} ${path}: ${r.text.slice(0, 120)}`);
    }
  }
  assert.equal(typeof (await A('/api/media/unmonitored/delete', 'POST', {})).json.needsConfirm, 'boolean');
});

test('media-jobber: varsler og avspillingslogg går via den felles planleggeren (ikke aktive i test)', async () => {
  const { listJobs } = await import('../server/jobs/index.js');
  const jobs = listJobs().filter((j) => j.name.startsWith('media.'));
  assert.deepEqual(jobs.map((j) => [j.name, j.everyMs]).sort(), [['media.avspillinger', 60_000], ['media.varsler', 120_000]]);
  assert.ok(jobs.every((j) => !j.active));
});

test('media-ruter: start av stoppet torrent svarer med samme felt', async () => {
  const r = await I(`/api/media/torrents/${'b'.repeat(40)}/start`, 'POST', {});
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['hash', 'message', 'ok', 'torrent']);
});
