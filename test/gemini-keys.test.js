// Flere Gemini-nøkler: når én har brukt opp kvoten (429), brukes neste med en gang, og den første hviler til kvoten nullstilles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-gkeys-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { setSecret } = await import('../server/finans/db.js');
const K = await import('../server/finans/gemini-keys.js');

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const KEY_A = 'AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', KEY_B = 'AIzaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

test('kvote brukt opp på hovednøkkelen: reservenøkkelen brukes, og hovednøkkelen hviler til neste døgn', async () => {
  setSecret('geminiKey', KEY_A);
  const id = K.addKey('Konto 2', KEY_B);
  assert.equal(K.geminiKeys().length, 2);
  const used = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const k = init.headers['x-goog-api-key']; used.push(k);
    if (k === KEY_A) return json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 250, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier' } }, 429);
    return json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  try {
    const res = await K.geminiFetch('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', { method: 'POST', headers: {} });
    assert.equal(res.ok, true);
    assert.equal(res.geminiKeyId, id);
    assert.deepEqual(used, [KEY_A, KEY_B]);
    const list = K.listKeysOut();
    assert.equal(list[0].status, 'exhausted');
    assert.match(list[0].reason, /Dagskvoten/);
    assert.ok(list[0].until > Date.now());
    assert.equal(list[1].status, 'ok');
    // Neste kall hopper rett til reserven.
    used.length = 0;
    await K.geminiFetch('https://x', { headers: {} });
    assert.deepEqual(used, [KEY_B]);
    assert.equal(list[0].last4, KEY_A.slice(-4));
  } finally { globalThis.fetch = orig; }
});

test('hvileperioder ut fra Googles melding, og administrasjon av nøklene', () => {
  const now = Date.UTC(2026, 9, 18, 12);
  assert.ok(K.restFor(429, 'limit per minute').until - now <= 70_000 + (Date.now() - now));
  assert.equal(new Date(K.restFor(429, 'billing account credits exhausted', now).until).getUTCDate(), 1);
  assert.equal(new Date(K.restFor(429, 'requests per day', now).until).getUTCHours(), 8);
  assert.match(K.restFor(403, 'API key not valid', now).reason, /Ugyldig/);
  assert.throws(() => K.addKey('x', 'kort'), /Gemini API-nøkkel/);
  assert.throws(() => K.addKey('x', KEY_B), /allerede/);
  const id = K.geminiKeys()[1].id;
  K.renameKey(id, 'Jobbkonto');
  assert.equal(K.listKeysOut()[1].label, 'Jobbkonto');
  K.resetKey('main');
  assert.equal(K.listKeysOut()[0].status, 'ok');
  K.removeKey(id);
  assert.equal(K.geminiKeys().length, 1);
});
