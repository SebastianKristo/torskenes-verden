// Homelab-søket: forslag via serveren (med årsak når Google ikke svarer), «✦ AI» med vanlig søk først for korte søk, og widget-data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-ask-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile, plainFirst } = await import('../server/mobile.js');
const integ = await import('../server/integrations.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await mobile.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, body: await r.json() };
};
const withFetch = async (fake, fn) => { const real = globalThis.fetch; globalThis.fetch = fake; try { return await fn(); } finally { globalThis.fetch = real; } };

test('korte søk uten spørsmål går til vanlig søk', () => {
  for (const q of ['ica', 'proton', 'rema 1000', 'oslo vær']) assert.equal(plainFirst(q), true, q);
  for (const q of ['hva er klokka i Tokyo', 'hvordan lager jeg pizza', 'pizza?', 'beste pizza i oslo']) assert.equal(plainFirst(q), false, q);
});

test('/search/ask svarer «plain» for korte søk uten å kalle AI', async () => {
  let called = 0;
  const r = await withFetch(async () => { called++; throw new Error('skal ikke kalles'); }, () => call('/search/ask', 'POST', { q: 'proton' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'plain');
  assert.equal(called, 0);
});

test('/search/ask gir feilmelding med årsak når AI-motoren ikke svarer', async () => {
  const r = await withFetch(async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }, () => call('/search/ask', 'POST', { q: 'hvordan virker en varmepumpe?' }));
  assert.equal(r.status, 502);
  assert.match(r.body.error, /✦ AI svarte ikke: .+\. Sjekk AI-motor/);
  assert.ok(r.body.reason);
});

test('forslag: årsak når Google ikke svarer, og feil caches ikke', async () => {
  const bad = await withFetch(async () => new Response('nope', { status: 503 }), () => integ.getSuggestions('zzq', { withError: true }));
  assert.deepEqual(bad, { items: [], error: 'Google svarte 503' });
  const latin = new Uint8Array([...Buffer.from('["bl', 'latin1'), 0xe5, ...Buffer.from('",["bl', 'latin1'), 0xe5, ...Buffer.from('bær"]]', 'latin1')]);
  const ok = await withFetch(async () => new Response(latin, { headers: { 'content-type': 'text/javascript; charset=ISO-8859-1' } }), () => integ.getSuggestions('zzq', { withError: true }));
  assert.deepEqual(ok, { items: ['blåbær'] }, 'samme søk prøves igjen etter feil, og ISO-8859-1 dekodes');
  const r = await withFetch(async () => new Response('x', { status: 500 }), () => call('/search/suggest?full=1&q=noe-annet'));
  assert.equal(r.body.error, 'Google svarte 500');
  const plain = await withFetch(async () => new Response('x', { status: 500 }), () => call('/search/suggest?q=enda-annet'));
  assert.deepEqual(plain.body, [], 'standardformatet er fortsatt en liste');
  assert.equal(decodeURIComponent(plain.headers.get('x-suggest-error')), 'Google svarte 500');
});

test('/mobile/widgets svarer med alle deler, og deler som mangler blir null', async () => {
  const r = await withFetch(async () => { throw new Error('ingen nett'); }, () => call('/mobile/widgets'));
  assert.equal(r.status, 200);
  for (const k of ['updatedAt', 'weather', 'packages', 'budget', 'finance', 'nextCharge', 'stocks', 'domains', 'matplan', 'finn', 'boliger']) assert.ok(k in r.body, k);
  assert.equal(r.body.weather, null, 'været feiler uten nett, men resten svarer');
  assert.equal(typeof r.body.budget.limit, 'number');
  assert.equal(typeof r.body.finance.toReview, 'number');
  assert.equal(r.body.domains.total, 0);
  const anon = await mobile.request('/mobile/widgets');
  assert.equal(anon.status, 401);
});
