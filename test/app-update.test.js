// Prompt 32 (APKUPD): Android-appen oppdaterer seg selv. /api/app/android (server/app-update.js), GitHub mockes med
// injisert fetch (releases/latest, SHA256SUMS.txt, CHANGELOG ved taggen og selve APK-en via en videresending).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DIR = mkdtempSync(join(tmpdir(), 'hl-appupd-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.UPDATE_REPO;
process.env.GITHUB_TOKEN = 'ghp_test';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const au = await import('../server/app-update.js');

const APK = Buffer.from('PK\x03\x04 later som dette er en apk '.repeat(50));
const SHA = createHash('sha256').update(APK).digest('hex');
const API = 'https://api.github.com/repos/SebastianKristo/torskenes-verden';
let calls = [];
let releaseBody = '## Installer\n\nbla\n\n## Endringer\n- Første endring\n- **Andre** endring\n';
let changelog = '# Endringslogg\n\n## [4.24.0] – 19.10.2026 · Selvoppdatering\n- Appen oppdaterer seg selv.\n- Hva er nytt-ark.\n\n## [4.23.0] – 18.10.2026\n- Eldre\n';
const release = (v, id) => ({
  tag_name: `v${v}`, html_url: `https://github.com/SebastianKristo/torskenes-verden/releases/tag/v${v}`, published_at: '2026-10-19T10:00:00Z', body: releaseBody,
  assets: [
    { name: `FinansHub-${v}.apk`, size: APK.length, url: `${API}/releases/assets/${id}`, browser_download_url: `https://github.com/x/FinansHub-${v}.apk` },
    { name: 'SHA256SUMS.txt', size: 200, url: `${API}/releases/assets/${id + 1}` },
    { name: `FinansHub-${v}-unsigned.ipa`, size: 10, url: `${API}/releases/assets/${id + 2}`, browser_download_url: `https://github.com/x/FinansHub-${v}-unsigned.ipa` },
  ],
});
async function fetchMock(url, opts = {}) {
  url = String(url);
  calls.push({ url, auth: opts.headers?.Authorization ?? null, redirect: opts.redirect });
  if (url === `${API}/releases/latest`) return Response.json(release('4.24.0', 10));
  if (url === `${API}/releases/tags/v4.22.0`) return Response.json(release('4.22.0', 20));
  if (url === `${API}/releases/assets/11` || url === `${API}/releases/assets/21`)
    return new Response(`${SHA}  FinansHub-4.24.0.apk\n${SHA}  FinansHub-4.22.0.apk\n${'b'.repeat(64)}  FinansHub-4.24.0-unsigned.ipa\n`);
  if (url.startsWith('https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/v4.24.0/CHANGELOG.md')) return new Response(changelog);
  if (url === `${API}/releases/assets/10` || url === `${API}/releases/assets/20`) return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/apk?sig=1' } });
  if (url === 'https://objects.githubusercontent.com/apk?sig=1') return new Response(APK, { headers: { 'content-length': String(APK.length) } });
  return new Response('nei', { status: 404 });
}
au._setFetch(fetchMock);

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const S = { cookie: await login('sebastian', 'testpassord1') };
assert.equal((await app.request('/api/users', { method: 'POST', headers: { ...S, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' }) })).status, 200);
const tok = await (await app.request('/finans/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'kari', password: 'kariPassord123', device: 'test' }) })).json();
const K = { authorization: `Bearer ${tok.token}` };

test('krever innlogging', async () => {
  assert.equal((await app.request('/api/app/android/latest')).status, 401);
  assert.equal((await app.request('/api/app/android/apk/4.24.0')).status, 401);
});

test('latest: versjon, sha256 fra SHA256SUMS.txt, notater fra CHANGELOG, cache', async () => {
  calls = [];
  const r = await app.request('/api/app/android/latest?current=4.23.0', { headers: K }); // vanlig bruker med app-token
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.version, '4.24.0');
  assert.equal(b.apkUrl, '/api/app/android/apk/4.24.0');
  assert.equal(b.sha256, SHA);
  assert.equal(b.size, APK.length);
  assert.equal(b.publishedAt, '2026-10-19T10:00:00Z');
  assert.deepEqual(b.notes, ['Appen oppdaterer seg selv.', 'Hva er nytt-ark.']);
  assert.equal(b.updateAvailable, true);
  assert.match(b.releaseUrl, /^https:\/\/github\.com\/.+v4\.24\.0$/);
  assert.match(b.ipaUrl, /unsigned\.ipa$/);
  assert.equal(b._asset, undefined);
  assert.ok(calls.every((c) => c.auth === 'Bearer ghp_test'), 'GITHUB_TOKEN sendes til GitHub-API-et');
  const n = calls.length;
  const r2 = await app.request('/api/app/android/latest?current=4.24.0', { headers: S });
  assert.equal((await r2.json()).updateAvailable, false);
  assert.equal(calls.length, n, 'cachet i 30 min');
});

test('notater fra release-teksten når CHANGELOG mangler versjonen', async () => {
  changelog = '# Endringslogg\n';
  au._setFetch(fetchMock); // tømmer cachen
  const b = await (await app.request('/api/app/android/latest', { headers: K })).json();
  assert.deepEqual(b.notes, ['Første endring', 'Andre endring']);
});

test('apk: strømmes gjennom serveren, redirect uten token, streng versjon', async () => {
  calls = [];
  const r = await app.request('/api/app/android/apk/4.24.0', { headers: K });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.equal(r.headers.get('x-checksum-sha256'), SHA);
  assert.match(r.headers.get('content-disposition'), /FinansHub-4\.24\.0\.apk/);
  const body = Buffer.from(await r.arrayBuffer());
  assert.equal(createHash('sha256').update(body).digest('hex'), SHA);
  const s3 = calls.find((c) => c.url.startsWith('https://objects.githubusercontent.com/'));
  assert.ok(s3 && s3.auth === null, 'tokenet sendes ikke videre til lagringsverten');
  assert.ok(calls.every((c) => c.redirect === 'manual'));
  // Eldre versjon via taggen
  assert.equal((await app.request('/api/app/android/apk/4.22.0', { headers: K })).status, 200);
  for (const bad of ['4.24', '4.24.0.1', '..%2F..%2Fetc', 'v4.24.0', '4.24.0;x']) {
    const x = await app.request(`/api/app/android/apk/${bad}`, { headers: K });
    assert.ok([400, 404].includes(x.status), `${bad} → ${x.status}`);
  }
  assert.equal((await app.request('/api/app/android/apk/9.9.9', { headers: K })).status, 404);
});

test('hjelpere', () => {
  assert.deepEqual(au.parseSums(`${SHA}  a.apk\n${SHA} *b.txt\nsøppel`), { 'a.apk': SHA, 'b.txt': SHA });
  assert.deepEqual(au.notesFromBody('- en\n- `to`'), ['en', 'to']);
  assert.ok(au.VERSION_RE.test('4.24.0') && !au.VERSION_RE.test('4.24'));
});
