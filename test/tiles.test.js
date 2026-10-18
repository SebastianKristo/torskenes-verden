// Prompt 20: kartflis-proxy med cache, grå reserveflis, tilgang (sesjon, Bearer eller ?token=) og /api/config/map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-tiles-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
await import('../server/auth.js');
const { default: fin } = await import('../server/finans/routes.js');
const { default: tiles, UA, grayTile } = await import('../server/tiles.js');
const { updateConfig } = await import('../server/settings.js');

const TOKEN = (await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) })).json()).token;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a48a0000000049454e44ae426082', 'hex');

const calls = [];
let mode = 'ok';
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), ua: opts?.headers?.['User-Agent'] });
  if (mode === 'down') throw new Error('nede');
  if (mode === 'blocked') return new Response('<html>403 Access blocked</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  if (mode === '403') return new Response(PNG, { status: 403, headers: { 'content-type': 'image/png' } });
  return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
};
const auth = { authorization: `Bearer ${TOKEN}` };
const get = (path, headers = auth) => tiles.request(path, { headers });

test('krever innlogging; Bearer-header og ?token= virker', async () => {
  assert.equal((await get('/tiles/voyager/1/0/0.png', {})).status, 401);
  assert.equal((await get('/tiles/voyager/1/0/0.png', { authorization: 'Bearer fh_pat_feil_feil_feil_feil_feil' })).status, 401);
  assert.equal((await get('/api/config/map', {})).status, 401);
  assert.equal((await get('/tiles/voyager/1/0/0.png')).status, 200);
  assert.equal((await get(`/tiles/voyager/1/0/1.png?token=${TOKEN}`, {})).status, 200);
});

test('henter med egen User-Agent, cacher i DATA_DIR/tiles i 30 dager og svarer med lang cache', async () => {
  calls.length = 0;
  const r = await get('/tiles/voyager/5/17/9.png');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=2592000');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\/5\/17\/9\.png$/);
  assert.equal(calls[0].ua, 'KristoHomelab/1.0 (kontakt@kristo.no)');
  assert.equal(UA, calls[0].ua);
  const file = join(process.env.DATA_DIR, 'tiles', 'voyager', '5', '17', '9.png');
  assert.ok(existsSync(file));
  const again = await get('/tiles/voyager/5/17/9.png');
  assert.equal(again.headers.get('x-tile-source'), 'cache');
  assert.equal(calls.length, 1);
  assert.deepEqual(Buffer.from(await again.arrayBuffer()), PNG);
  // Eldre enn 30 dager: hentes på nytt.
  const old = (Date.now() - 31 * 86_400_000) / 1000;
  utimesSync(file, old, old);
  await get('/tiles/voyager/5/17/9.png');
  assert.equal(calls.length, 2);
});

test('@2x, dark, light og topo (Kartverket har y/x)', async () => {
  calls.length = 0;
  await get('/tiles/dark/3/1/2@2x.png');
  await get('/tiles/light/3/1/2.png');
  await get('/tiles/topo/3/1/2.png');
  assert.match(calls[0].url, /dark_all\/3\/1\/2@2x\.png$/);
  assert.match(calls[1].url, /light_all\/3\/1\/2\.png$/);
  assert.equal(calls[2].url, 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/3/2/1.png');
});

test('feil hos leverandøren gir grå flis med kort cache, aldri feilbildet; eldre cache brukes hvis den finnes', async () => {
  for (const m of ['down', 'blocked', '403']) {
    mode = m;
    const r = await get(`/tiles/voyager/6/${m.length}/7.png`);
    assert.equal(r.status, 200, m);
    assert.equal(r.headers.get('x-tile-source'), 'fallback', m);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=300', m);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), grayTile('voyager', false), m);
  }
  mode = 'ok';
  await get('/tiles/voyager/7/1/1.png');
  const file = join(process.env.DATA_DIR, 'tiles', 'voyager', '7', '1', '1.png');
  const old = (Date.now() - 40 * 86_400_000) / 1000;
  utimesSync(file, old, old);
  mode = 'down';
  const r = await get('/tiles/voyager/7/1/1.png');
  assert.equal(r.headers.get('x-tile-source'), 'stale');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  mode = 'ok';
  const g = await tiles.request('/tiles/blank@2x.png');
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('content-type'), 'image/png');
});

test('ugyldige fliser og stiler; maptiler bare med nøkkel', async () => {
  assert.equal((await get('/tiles/osm/1/0/0.png')).status, 404);
  assert.equal((await get('/tiles/voyager/1/0/0.jpg')).status, 404);
  assert.equal((await get('/tiles/voyager/a/0/0.png')).status, 404);
  assert.equal((await get('/tiles/voyager/2/9/0.png')).headers.get('x-tile-source'), 'fallback');
  assert.equal((await get('/tiles/maptiler/1/0/0.png')).status, 404);
  let cfg = await (await get('/api/config/map')).json();
  assert.deepEqual(Object.keys(cfg.tiles).sort(), ['dark', 'light', 'topo', 'voyager']);
  assert.equal(cfg.tiles.voyager, '/tiles/voyager/{z}/{x}/{y}{r}.png');
  assert.equal(cfg.default, 'voyager');
  assert.equal(cfg.maxZoom, 19);
  assert.match(cfg.attribution, /OpenStreetMap.*CARTO/);
  updateConfig({ maptilerKey: 'abc123' });
  cfg = await (await get('/api/config/map')).json();
  assert.ok(cfg.tiles.maptiler);
  calls.length = 0;
  await get('/tiles/maptiler/2/1/1@2x.png');
  assert.equal(calls[0].url, 'https://api.maptiler.com/maps/streets-v2/256/2/1/1@2x.png?key=abc123');
});
