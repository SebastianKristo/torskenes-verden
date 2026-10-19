// Oppdater fra appen: /api/system/update (server/system-update.js). GitHub mockes med injisert fetch, og updateren
// spilles ved å skrive heartbeat/status.json i data/update selv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-update-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.UPDATE_REPO;
delete process.env.UPDATE_BRANCH;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const su = await import('../server/system-update.js');
// Prompt 31: passord kreves bare når «Krev passord for å oppdatere» er på (av som standard). Testene her gjelder bryteren på.
{ const { kv, OWNER } = await import('../server/db.js'); kv.set(OWNER, 'update_settings', { require_password: true }); }

const UPD = join(DIR, 'update'), BACKUPS = join(DIR, 'backups');
const SHA = 'a'.repeat(40);
const REMOTE_CHANGELOG = `# Endringslogg

## [99.1.0] – 20.10.2026 · neste
- **Oppdater fra appen.** Fra [Innstillinger](x).
  - underpunkt tas ikke med
- Ny ting nummer to

## [99.0.0] – 19.10.2026
- Stor versjon

## [1.0.0] – 01.01.2020
- Gammel
`;
const calls = [];
su._setFetch(async (url) => {
  calls.push(String(url));
  if (String(url).startsWith('https://api.github.com/repos/SebastianKristo/torskenes-verden/commits/main')) {
    return new Response(JSON.stringify({ sha: SHA, commit: { message: 'Prompt 28\n\ndetaljer', committer: { date: '2026-10-20T10:00:00Z' } } }), { status: 200 });
  }
  if (String(url) === `https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/${SHA}/CHANGELOG.md`) return new Response(REMOTE_CHANGELOG, { status: 200 });
  return new Response('nei', { status: 404 });
});

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (headers) => async (path, method = 'GET', body, extra = {}) => {
  const h = { ...headers, ...extra };
  if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
  const r = await app.request(path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};

const S = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const tok = await (await app.request('/finans/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1', device: 'test' }) })).json();
assert.ok(tok.token);
const T = client({ authorization: `Bearer ${tok.token}` });
const anon = client({});

const heartbeat = (secondsAgo = 0) => { mkdirSync(UPD, { recursive: true }); writeFileSync(join(UPD, 'heartbeat'), String(Math.floor(Date.now() / 1000) - secondsAgo)); };
const status = (s) => writeFileSync(join(UPD, 'status.json'), JSON.stringify(s));
const ownVersion = readFileSync('CHANGELOG.md', 'utf8').match(/^## \[(\d+\.\d+\.\d+)\]/m)[1];

test('CHANGELOG-parsing og «nyere enn installert»', () => {
  const s = su.parseChangelog(REMOTE_CHANGELOG);
  assert.deepEqual(s.map((x) => x.version), ['99.1.0', '99.0.0', '1.0.0']);
  assert.equal(s[0].date, '20.10.2026');
  assert.equal(s[0].title, 'neste');
  assert.deepEqual(s[0].items, ['Oppdater fra appen. Fra Innstillinger.', 'Ny ting nummer to']);
  assert.deepEqual(su.newerSections(s, '99.0.0').map((x) => x.version), ['99.1.0']);
  assert.deepEqual(su.newerSections(s, '99.1.0'), []);
  assert.equal(su.newerSections(s, null).length, 3);
  assert.equal(su.compareVersions('4.10.0', '4.9.9'), 1);
  assert.equal(su.compareVersions('4.9.0', '4.10.0'), -1);
  assert.equal(su.compareVersions('1.2.3', '1.2.3'), 0);
});

test('bare innloggede administratorer har tilgang', async () => {
  assert.equal((await anon('/api/system/update')).status, 401);
  const k = await K('/api/system/update');
  assert.equal(k.status, 403);
  assert.equal((await K('/api/system/update/start', 'POST', { password: 'kariPassord123' })).status, 403);
  assert.equal((await K('/api/system/update/log')).status, 403);
  assert.equal(existsSync(join(UPD, 'request.json')), false);
});

test('uten hjerteslag er updateren ikke tilgjengelig', async () => {
  rmSync(UPD, { recursive: true, force: true });
  const r = await S('/api/system/update');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.available, false);
  assert.equal(r.body.canStart, false);
  assert.match(r.body.reason, /update\.sh/);
  assert.equal(r.body.installed.version, ownVersion);
  assert.equal(r.body.latest.sha, SHA);
  assert.equal(r.body.latest.version, '99.1.0');
  assert.equal(r.body.latest.message, 'Prompt 28');
  assert.equal(r.body.updateAvailable, true);
  assert.deepEqual(r.body.changes.map((c) => c.version), ['99.1.0', '99.0.0']);
  assert.equal(r.body.status.state, 'idle');
  heartbeat(45);
  assert.equal((await S('/api/system/update')).body.available, false, 'gammelt hjerteslag');
  const s = await S('/api/system/update/start', 'POST', { password: 'testpassord1' });
  assert.equal(s.status, 409);
  assert.equal(existsSync(join(UPD, 'request.json')), false);
});

test('GitHub caches i 10 min, /check henter på nytt', async () => {
  const n = calls.length;
  await S('/api/system/update');
  assert.equal(calls.length, n);
  const r = await S('/api/system/update/check', 'POST');
  assert.equal(r.status, 200);
  assert.equal(calls.length, n + 2);
});

test('app-token: lesetoken kan ikke starte; admin-token med finance:write trenger passordet (prompt 30)', async () => {
  heartbeat();
  const g = await T('/api/system/update');
  assert.equal(g.status, 200, g.text);
  assert.equal(g.body.available, true);
  assert.equal(g.body.canStart, true);
  assert.equal(g.body.needsPassword, true);
  // Uten passord fortsatt 403.
  assert.equal((await T('/api/system/update/start', 'POST', {})).status, 403);
  assert.equal(existsSync(join(UPD, 'request.json')), false);
  // Et token med bare finance:read kan ikke starte, selv med riktig passord.
  const ro = await S('/finans/api/tokens', 'POST', { name: 'les', scopes: ['finance:read'] });
  assert.equal(ro.status, 200, ro.text);
  const R = client({ authorization: `Bearer ${ro.body.token}` });
  const rg = await R('/api/system/update');
  assert.equal(rg.body.canStart, false);
  assert.match(rg.body.reason, /finance:write/);
  const rs = await R('/api/system/update/start', 'POST', { password: 'testpassord1' });
  assert.equal(rs.status, 403);
  assert.match(rs.body.error, /finance:write/);
  assert.equal(existsSync(join(UPD, 'request.json')), false);
});

test('feil passord gir 403 og teller som mislykket innlogging', async () => {
  heartbeat();
  const r = await S('/api/system/update/start', 'POST', { password: 'feil-passord' });
  assert.equal(r.status, 403);
  assert.equal(existsSync(join(UPD, 'request.json')), false);
  assert.equal(existsSync(BACKUPS) && readdirSync(BACKUPS).some((f) => f.startsWith('pre-update-')), false, 'ingen backup ved feil passord');
  assert.equal((await S('/api/system/update/start', 'POST', {})).status, 403);
  // Uten JSON (skjema-POST fra et annet nettsted) avvises.
  assert.equal((await S('/api/system/update/start', 'POST', 'password=testpassord1', { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
});

test('start tar backup, skriver request.json uten repo/kommando og avviser ny start mens den kjører', async () => {
  heartbeat();
  status({ id: 'gammel', state: 'done' });
  const r = await S('/api/system/update/start', 'POST', { password: 'testpassord1', repo: 'evil/evil', branch: 'x; rm -rf /', command: 'rm -rf /', id: 'mitt-id' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.ok, true);
  assert.match(r.body.id, /^[0-9a-f-]{36}$/);
  assert.notEqual(r.body.id, 'mitt-id');
  assert.match(r.body.backup, /^pre-update-.+\.db$/);
  assert.ok(existsSync(join(BACKUPS, r.body.backup)));
  const req = JSON.parse(readFileSync(join(UPD, 'request.json'), 'utf8'));
  assert.deepEqual(Object.keys(req).sort(), ['at', 'id', 'requestedBy']);
  assert.equal(req.id, r.body.id);
  assert.equal(req.requestedBy, 'owner');
  assert.ok(!readFileSync(join(UPD, 'request.json'), 'utf8').includes('evil'));
  // Updateren har ikke plukket den opp ennå → pågår.
  assert.equal((await S('/api/system/update/start', 'POST', { password: 'testpassord1' })).status, 409);
  assert.equal((await S('/api/system/update')).body.running, true);
  // Updateren jobber.
  status({ id: req.id, state: 'building', step: 'Bygger ny versjon', startedAt: Date.now() });
  writeFileSync(join(UPD, 'log.txt'), Array.from({ length: 100 }, (_, i) => `linje ${i}`).join('\n') + '\n');
  const g = await S('/api/system/update');
  assert.equal(g.body.status.state, 'building');
  assert.equal(g.body.canStart, false);
  assert.ok(g.body.log.includes('linje 99') && !g.body.log.includes('linje 10\n'));
  assert.equal((await S('/api/system/update/start', 'POST', { password: 'testpassord1' })).status, 409);
  const log = await S('/api/system/update/log');
  assert.equal(log.status, 200);
  assert.ok(log.text.includes('linje 0\n'));
  // Ferdig.
  status({ id: req.id, state: 'done', step: 'Ferdig', sha: SHA, version: ownVersion, finishedAt: Date.now() });
  writeFileSync(join(UPD, 'installed.json'), JSON.stringify({ sha: SHA, version: ownVersion, at: Date.now() }));
  const d = await S('/api/system/update');
  assert.equal(d.body.running, false);
  assert.equal(d.body.canStart, true);
  assert.equal(d.body.installed.sha, SHA);
  assert.equal(d.body.updateAvailable, false, 'samme sha som nyeste');
});

test('bare de 5 siste pre-update-backupene beholdes, andre filer røres ikke', async () => {
  mkdirSync(BACKUPS, { recursive: true });
  for (let i = 0; i < 7; i++) writeFileSync(join(BACKUPS, `pre-update-2020-01-0${i + 1}T00-00-00-000Z.db`), 'x');
  writeFileSync(join(BACKUPS, 'homelab-backup-20200101-0000.tar.gz'), 'smb');
  writeFileSync(join(BACKUPS, 'annet.db'), 'x');
  heartbeat();
  status({ id: 'forrige', state: 'failed' });
  rmSync(join(UPD, 'request.json'), { force: true });
  const r = await S('/api/system/update/start', 'POST', { password: 'testpassord1' });
  assert.equal(r.status, 200, r.text);
  const files = readdirSync(BACKUPS);
  const pre = files.filter((f) => f.startsWith('pre-update-')).sort();
  assert.equal(pre.length, 5);
  assert.ok(pre.includes(r.body.backup));
  assert.ok(!pre.includes('pre-update-2020-01-01T00-00-00-000Z.db'));
  assert.ok(files.includes('homelab-backup-20200101-0000.tar.gz'));
  assert.ok(files.includes('annet.db'));
  // Backupen er en gyldig SQLite-database med brukerne.
  const Database = (await import('better-sqlite3')).default;
  const b = new Database(join(BACKUPS, r.body.backup), { readonly: true });
  assert.ok(b.prepare('SELECT count(*) n FROM users').get().n >= 2);
  b.close();
});

test('installed.json for en annen versjon enn den som kjører ignoreres', async () => {
  writeFileSync(join(UPD, 'installed.json'), JSON.stringify({ sha: 'b'.repeat(40), version: '0.0.1', at: 1 }));
  const r = await S('/api/system/update');
  assert.equal(r.body.installed.version, ownVersion);
  assert.equal(r.body.installed.sha, null);
});
