// Opprydding fase 0b (K1): Kalender-appene logget ut mot POST /finans/api/logout, som ga 404 – tokenet levde videre.
// Serveren godtar nå både /finans/api/auth/logout og /finans/api/logout, og appene bruker /auth/logout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-utlogging-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');

const json = { 'content-type': 'application/json' };
async function appToken() {
  const r = await app.request('/finans/api/login', { method: 'POST', headers: json, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1', device: 'test' }) });
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()).token;
}
const me = (tok) => app.request('/api/me', { headers: { authorization: `Bearer ${tok}` } });

for (const path of ['/finans/api/auth/logout', '/finans/api/logout']) {
  test(`${path} tilbakekaller tokenet`, async () => {
    const tok = await appToken();
    assert.equal((await me(tok)).status, 200);
    const r = await app.request(path, { method: 'POST', headers: { ...json, authorization: `Bearer ${tok}` }, body: '{}' });
    assert.equal(r.status, 200);
    assert.equal((await me(tok)).status, 401);
  });
}

test('Kalender-appene logger ut mot ruten som finnes', () => {
  for (const f of ['apps/ios/Kalender/Sources/KalStore.swift', 'apps/ios/KalenderMac/Sources/MacStore.swift', 'apps/android/kalender/src/main/java/no/kristo/kalender/KalVm.kt']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('"/finans/api/logout"'), f);
    assert.ok(src.includes('"/finans/api/auth/logout"'), f);
  }
});
