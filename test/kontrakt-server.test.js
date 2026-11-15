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
