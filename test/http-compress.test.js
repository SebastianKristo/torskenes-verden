// Komprimering av JSON-svar (server/http/compress.js): br/gzip etter Accept-Encoding, aldri SSE eller binært.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { compressJson, pickEncoding } from '../server/http/compress.js';

const big = { items: Array.from({ length: 400 }, (_, i) => ({ id: i, text: `Rema 1000 Bislett ${i}` })) };
const app = new Hono();
app.use('*', compressJson);
app.get('/big', (c) => c.json(big));
app.get('/small', (c) => c.json({ ok: true }));
app.get('/etag', (c) => c.json(big, 200, { ETag: '"abc"' }));
app.get('/notransform', (c) => c.json(big, 200, { 'Cache-Control': 'no-transform' }));
app.get('/png', (c) => c.body(new Uint8Array(4096), 200, { 'Content-Type': 'image/png' }));
app.get('/sse', (c) => streamSSE(c, async (s) => { await s.writeSSE({ data: 'x'.repeat(4000) }); }));
app.get('/err', (c) => c.json({ error: 'x'.repeat(2000) }, 404));
app.get('/cookie', (c) => { c.header('Set-Cookie', 'a=1'); c.header('Set-Cookie', 'b=2', { append: true }); return c.json(big); });

const get = (p, ae) => app.request(p, { headers: ae ? { 'accept-encoding': ae } : {} });

test('pickEncoding: br foretrekkes, q-verdier respekteres', () => {
  assert.equal(pickEncoding('gzip, deflate, br'), 'br');
  assert.equal(pickEncoding('gzip'), 'gzip');
  assert.equal(pickEncoding('br;q=0, gzip'), 'gzip');
  assert.equal(pickEncoding('gzip;q=0.5, br;q=0.4'), 'gzip');
  assert.equal(pickEncoding('identity'), null);
  assert.equal(pickEncoding('*'), 'br');
  assert.equal(pickEncoding(''), null);
  assert.equal(pickEncoding(undefined), null);
});

test('stor JSON komprimeres med br og gzip, og pakkes ut til det samme', async () => {
  const b = await get('/big', 'gzip, deflate, br');
  assert.equal(b.headers.get('content-encoding'), 'br');
  assert.match(b.headers.get('vary') ?? '', /accept-encoding/i);
  assert.equal(b.headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(brotliDecompressSync(Buffer.from(await b.arrayBuffer()))), big);
  const g = await get('/big', 'gzip');
  assert.equal(g.headers.get('content-encoding'), 'gzip');
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await g.arrayBuffer()))), big);
  const e = await get('/err', 'gzip');
  assert.equal(e.status, 404); assert.equal(e.headers.get('content-encoding'), 'gzip');
});

test('uten Accept-Encoding, små svar, no-transform, binært og SSE: urørt', async () => {
  const n = await get('/big');
  assert.equal(n.headers.get('content-encoding'), null);
  assert.deepEqual(await n.json(), big);
  const s = await get('/small', 'br');
  assert.equal(s.headers.get('content-encoding'), null);
  assert.deepEqual(await s.json(), { ok: true });
  assert.equal((await get('/notransform', 'br')).headers.get('content-encoding'), null);
  const p = await get('/png', 'br');
  assert.equal(p.headers.get('content-encoding'), null);
  assert.equal((await p.arrayBuffer()).byteLength, 4096);
  const sse = await get('/sse', 'br');
  assert.equal(sse.headers.get('content-encoding'), null);
  assert.match(sse.headers.get('content-type'), /text\/event-stream/);
  assert.match(await sse.text(), /data: x{10}/);
});

test('ETag blir svak og Set-Cookie beholdes', async () => {
  const r = await get('/etag', 'br');
  assert.equal(r.headers.get('etag'), 'W/"abc"');
  const c = await get('/cookie', 'br');
  assert.deepEqual(c.headers.getSetCookie(), ['a=1', 'b=2']);
  assert.equal(c.headers.get('content-encoding'), 'br');
});
