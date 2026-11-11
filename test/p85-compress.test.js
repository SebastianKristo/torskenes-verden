// Prompt 85: tekstfiler under /assets komprimeres med gzip når klienten ber om det, API-svar røres ikke, og 304 virker
// også med den svake ETag-en et komprimert svar får.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { Hono } from 'hono';
import { installCacheBust } from '../server/cache-bust.js';

const app = new Hono();
installCacheBust(app);
app.get('/api/x', (c) => c.json({ a: 'x'.repeat(5000) }));

test('JS under /assets: gzip med Accept-Encoding, ellers ukomprimert', async () => {
  const plain = await app.request('/assets/js/app.js');
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get('content-encoding'), null);
  const raw = Buffer.from(await plain.arrayBuffer());
  const gz = await app.request('/assets/js/app.js', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(gz.headers.get('content-encoding'), 'gzip');
  assert.match(gz.headers.get('vary') || '', /accept-encoding/i);
  const body = Buffer.from(await gz.arrayBuffer());
  assert.ok(body.length < raw.length / 2, `komprimert ${body.length} mot ${raw.length}`);
  assert.deepEqual(gunzipSync(body), raw);
});

test('304 også når nettleseren sender den svake ETag-en tilbake', async () => {
  const gz = await app.request('/assets/js/app.js', { headers: { 'Accept-Encoding': 'gzip' } });
  const etag = gz.headers.get('etag');
  assert.match(etag, /^W\//);
  const again = await app.request('/assets/js/app.js', { headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('API-svar komprimeres ikke av denne mellomvaren', async () => {
  const r = await app.request('/api/x', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.headers.get('content-encoding'), null);
});
