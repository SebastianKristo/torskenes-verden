// Fase 2 (kontrakt): versjonssjekk, app-tokens med glidende utløp, alias-tabellen og planleggeren for bakgrunnsjobber,
// testet mot hele appen med eksempeldata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-kontrakt-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-kontrakt';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json ?? text, headers: r.headers };
}

test('/api/version gir version og minClient (Q19) uten innlogging', async () => {
  const r = await req('/api/version');
  assert.equal(r.status, 200);
  assert.match(r.body.version, /^\d+\.\d+\.\d+$/);
  assert.match(r.body.minClient, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof r.body.contract, 'number');
  assert.ok(Array.isArray(r.body.features)); // eldre felt er der fortsatt
});

const { db: fhDb, migrateTokenExpiry, TOKEN_SLIDE_MS } = await import('../server/finans/db.js');
const { _tokenKeyForTest: tokenKeyOf } = await import('../server/finans/routes.js');
const login = async (deviceName = 'Testtelefon') => (await req('/finans/api/login', { method: 'POST', body: { username: 'sebastian', password: 'testpassord1', deviceName } })).body;
const bearer = (t) => ({ authorization: `Bearer ${t}` });

test('Q23: app-token fra mobil-innlogging har 180 dager glidende utløp', async () => {
  const before = Date.now();
  const l = await login();
  assert.ok(l.token?.startsWith('fh_pat_'));
  assert.equal(l.sliding, true);
  assert.ok(l.expires >= before + TOKEN_SLIDE_MS - 1000 && l.expires <= Date.now() + TOKEN_SLIDE_MS + 1000);
  assert.equal(new Date(l.expiresAt).getTime(), l.expires);
  // Bruk flytter utløpet fram.
  fhDb.prepare('UPDATE fh_tokens SET expires=? WHERE id=?').run(Date.now() + 1000, tokenKeyOf(l.token));
  assert.equal((await req('/api/me', { headers: bearer(l.token) })).status, 200);
  const row = fhDb.prepare('SELECT expires, sliding FROM fh_tokens WHERE id=?').get(tokenKeyOf(l.token));
  assert.equal(row.sliding, 1);
  assert.ok(row.expires > Date.now() + TOKEN_SLIDE_MS - 5000);
});

test('Q23: utløpt app-token gir 401 TOKEN_EXPIRED på /api og /finans/api', async () => {
  const l = await login('Gammel telefon');
  fhDb.prepare('UPDATE fh_tokens SET expires=? WHERE id=?').run(Date.now() - 1000, tokenKeyOf(l.token));
  for (const p of ['/api/me', '/finans/api/summary', '/api/kalender/calendars', '/api/finnesikke']) {
    const r = await req(p, { headers: bearer(l.token) });
    assert.equal(r.status, 401, p);
    assert.equal(r.body.code, 'TOKEN_EXPIRED', p);
    assert.equal(typeof r.body.error, 'string');
  }
  // Ukjent token er fortsatt HOMELAB_AUTH.
  const u = await req('/api/me', { headers: bearer('fh_pat_' + 'x'.repeat(32)) });
  assert.deepEqual(u.body, { error: 'Ikke innlogget', code: 'HOMELAB_AUTH', reason: 'invalid' });
});

test('Q23: fast utløp forlenges ikke, og migreringen gir eldre tokens uten utløp nå + 180 d', async () => {
  const l = await login('Fast');
  const fixed = Date.now() + 3600_000;
  fhDb.prepare('UPDATE fh_tokens SET expires=?, sliding=0 WHERE id=?').run(fixed, tokenKeyOf(l.token));
  await req('/api/me', { headers: bearer(l.token) });
  assert.equal(fhDb.prepare('SELECT expires FROM fh_tokens WHERE id=?').pluck().get(tokenKeyOf(l.token)), fixed);
  // Et token fra før Fase 2 (expires NULL) og en Glimt-API-nøkkel.
  fhDb.prepare('INSERT INTO fh_tokens(id,name,scopes,created,user_id) VALUES(?,?,?,?,?)').run('gammel-app', 'iPhone', 'finance:read', 1, 'owner');
  fhDb.prepare('INSERT INTO fh_tokens(id,name,scopes,created,user_id) VALUES(?,?,?,?,?)').run('glimt-api', 'Glimt-API: HA', 'finance:read', 1, 'owner');
  const now = Date.now();
  assert.ok(migrateTokenExpiry(now) >= 1);
  assert.deepEqual({ ...fhDb.prepare('SELECT expires, sliding FROM fh_tokens WHERE id=?').get('gammel-app') }, { expires: now + TOKEN_SLIDE_MS, sliding: 1 });
  assert.deepEqual({ ...fhDb.prepare('SELECT expires, sliding FROM fh_tokens WHERE id=?').get('glimt-api') }, { expires: null, sliding: 0 });
});

const { aliasFor, aliasCounter, ALIASES, KV_KEY } = await import('../server/http/aliases.js');
const { kv, OWNER } = await import('../server/db.js');

test('Q29: alias-tabellen – lengste treff vinner, metode teller, kanoniske stier er ikke aliaser', () => {
  assert.equal(aliasFor('POST', '/api/finans/kvitteringer/ocr').alias, '/api/finans/kvitteringer/ocr');
  assert.equal(aliasFor('POST', '/api/finans/kvitteringer').alias, '/api/finans/kvitteringer');
  assert.equal(aliasFor('GET', '/api/integrasjoner/status').alias, '/api/integrasjoner');
  assert.equal(aliasFor('GET', '/api/integrations/status'), null);
  assert.equal(aliasFor('GET', '/finans/api/login'), null); // bare POST er alias
  assert.equal(aliasFor('GET', '/api/updates'), null); // prefiks må være hele segment
  assert.equal(new Set(ALIASES.map((a) => a.alias + (a.method ?? ''))).size, ALIASES.length, 'ingen dubletter');
});

test('Q29: bruken telles i kv og vises for admin på /api/admin/aliases', async () => {
  const store = new Map();
  const fake = { get: (u, k, f) => (store.has(`${u}/${k}`) ? structuredClone(store.get(`${u}/${k}`)) : f), set: (u, k, v) => store.set(`${u}/${k}`, structuredClone(v)) };
  let t = Date.UTC(2026, 10, 15, 12);
  const ctr = aliasCounter({ kv: fake, owner: 'o', now: () => t, flushMs: 60_000 });
  const ctx = (method, path) => ({ req: { method, path } });
  for (let i = 0; i < 3; i++) await ctr.middleware(ctx('GET', '/api/studie/docs'), async () => {});
  await ctr.middleware(ctx('GET', '/api/study/docs'), async () => {});
  t += 86400_000 * 2;
  const u = ctr.usage().find((x) => x.alias === '/api/studie');
  assert.equal(u.count, 3);
  assert.equal(u.daysSinceUse, 2);
  assert.equal(ctr.usage().find((x) => x.alias === '/api/rom').count, 0);
  assert.equal(store.get(`o/${KV_KEY}`)['/api/studie'].n, 3);

  // Hele appen: et kall mot /api/integrasjoner telles, og bare admin ser listen.
  const cookie = (await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.200' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) })).headers.get('set-cookie').split(';')[0];
  await req('/api/integrasjoner', { headers: { cookie } });
  const r = await req('/api/admin/aliases', { headers: { cookie } });
  assert.equal(r.status, 200);
  const row = r.body.aliases.find((a) => a.alias === '/api/integrasjoner');
  assert.ok(row.count >= 1);
  assert.match(row.lastUsedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok((kv.get(OWNER, KV_KEY, {}) ?? {})['/api/integrasjoner'].n >= 1);
  assert.equal((await req('/api/admin/aliases')).status, 401);
});

const jobs = await import('../server/jobs/index.js');

test('Bakgrunnsjobber: de seks med sideeffekter er registrert i planleggeren og starter ikke i test eller sandkasse', async () => {
  const names = jobs.listJobs().map((j) => j.name).sort();
  for (const n of ['brief.generate', 'familie.forlot', 'familie.sjekk-inn', 'finans.smb-backup', 'kalender.ical', 'kalender.skole']) assert.ok(names.includes(n), n);
  assert.equal(jobs.jobsStarted(), false);
  assert.ok(jobs.listJobs().every((j) => !j.active));
  assert.equal(jobs.jobsAllowed({ NODE_ENV: 'test' }), false);
  assert.equal(jobs.jobsAllowed({ NODE_ENV: 'production', OPS51_SANDBOX: '1' }), false);
  assert.equal(jobs.jobsAllowed({ NODE_ENV: 'production' }), true);
  assert.equal(jobs.startJobs({ NODE_ENV: 'production', OPS51_SANDBOX: '1' }), 0);
  assert.equal(jobs.jobsStarted(), false);
  // En jobb som feiler, stopper ikke planleggeren, og feilen vises.
  let n = 0;
  jobs.registerJob('test.feiler', 60_000, () => { n++; throw new Error('bom'); });
  assert.equal(await jobs.runJobNow('test.feiler'), false);
  assert.equal(n, 1);
  assert.equal(jobs.listJobs().find((j) => j.name === 'test.feiler').lastError, 'bom');
});
