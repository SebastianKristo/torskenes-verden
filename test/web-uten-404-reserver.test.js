// Q19 på web: web-klienten serveres av samme server, så «eldre server (404)»-reserver mot endepunkter som alltid finnes, er død
// kode. Fjernet: Posisjonskortet (/api/family), Kartet (/api/family og /me/layout kart_v1 ved lagring), Sporing (/check og én og
// én i stedet for /bulk) og Vær (lokale steder i nettleseren og /api/weather/search). Testen sjekker at serveren svarer på
// endepunktene klienten nå bare bruker, og at reservene ikke kommer tilbake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-q19-web-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-q19w';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };

const { default: app } = await import('../server/index.js');
const login = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const A = (path, method = 'GET', body) => app.request(path, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');

test('serveren svarer på endepunktene web-klienten nå bruker uten reserve', async () => {
  for (const [path, method, body] of [
    ['/api/family/positions', 'GET'],
    ['/api/kart', 'GET'],
    ['/api/kart/prefs', 'PUT', { z: 14 }],
    ['/api/tracking/refresh', 'POST', {}],
    ['/api/tracking/bulk', 'POST', { ids: [], action: 'archive' }],
    ['/api/weather/places', 'GET'],
    ['/api/weather/places?q=Oslo', 'GET'],
    ['/api/weather/places/order', 'PUT', { ids: ['oslo', 'bergen', 'trondheim', 'tromso'] }],
  ]) {
    const r = await A(path, method, body);
    assert.notEqual(r.status, 404, `${method} ${path}`);
    assert.notEqual(r.status, 405, `${method} ${path}`);
  }
});

test('reservene for eldre servere er borte fra web-klienten', () => {
  assert.doesNotMatch(src('poscard.js'), /api\('\/family'\)/);
  assert.doesNotMatch(src('kart.js'), /api\('\/family'\)|layoutOk/);
  assert.doesNotMatch(src('tracking.js'), /'\/check'|status !== 404/);
  const wx = src('weather-page.js');
  assert.doesNotMatch(wx, /\/weather\/search|wx_places_local|placesOk/);
});
