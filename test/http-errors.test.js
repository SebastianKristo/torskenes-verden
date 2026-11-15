// Felles feilform for /api og /finans/api (Fase 2, kontrakt): server/http/errors.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { errorShape, serverError, SNAKE_CASE, LEGACY_CODES } from '../server/http/errors.js';

function mini(tokenState = () => 'none') {
  const app = new Hono();
  app.use('/api/*', errorShape({ tokenState }));
  app.get('/api/tekst', (c) => c.text('Noe gikk galt', 400));
  app.get('/api/tom', (c) => c.body(null, 404));
  app.get('/api/borte', (c) => c.notFound());
  app.get('/api/json', (c) => c.json({ error: 'Fant ikke hendelsen' }, 404));
  app.get('/api/kode', (c) => c.json({ error: 'Opptatt', code: 'not_configured' }, 409));
  app.get('/api/auth', (c) => c.json({ error: 'Ikke innlogget' }, 401));
  app.get('/api/session', (c) => c.json({ error: 'Krever nettleser', code: 'SESSION_REQUIRED' }, 401));
  app.get('/api/kast', () => { throw new Error('hemmelig SQL: SELECT * FROM users at /srv/server/x.js:12'); });
  app.get('/api/ok', (c) => c.json({ ok: true }));
  app.get('/api/bilde', (c) => c.body('x', 404, { 'content-type': 'image/png' }));
  app.post('/api/login', (c) => c.json({ error: 'Feil passord' }, 401));
  app.get('/annet', (c) => c.text('ikke api', 404));
  app.onError((err, c) => serverError(c));
  return app;
}
const get = async (app, path, init) => { const r = await app.request(path, init); return { status: r.status, ct: r.headers.get('content-type') ?? '', body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }; };

test('ukjent sti under /api gir JSON 404 med code NOT_FOUND', async () => {
  const r = await get(mini(), '/api/finnesikke');
  assert.equal(r.status, 404);
  assert.match(r.ct, /application\/json/);
  assert.deepEqual(r.body, { error: 'Finnes ikke', code: 'NOT_FOUND' });
  assert.deepEqual((await get(mini(), '/api/borte')).body, { error: 'Finnes ikke', code: 'NOT_FOUND' });
  assert.deepEqual((await get(mini(), '/api/tom')).body, { error: 'Finnes ikke', code: 'NOT_FOUND' });
});

test('ren tekst med feilstatus blir {error} med teksten, og koden kommer fra statusen', async () => {
  assert.deepEqual((await get(mini(), '/api/tekst')).body, { error: 'Noe gikk galt', code: 'BAD_REQUEST' });
});

test('JSON-feil uten code får kode; eksisterende code og felt beholdes', async () => {
  assert.deepEqual((await get(mini(), '/api/json')).body, { error: 'Fant ikke hendelsen', code: 'NOT_FOUND' });
  assert.deepEqual((await get(mini(), '/api/kode')).body, { error: 'Opptatt', code: 'not_configured' });
});

test('500 sendes uten stack eller detaljer', async () => {
  const r = await get(mini(), '/api/kast');
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: 'Intern feil', code: 'INTERNAL_ERROR' });
});

test('401 har én form: HOMELAB_AUTH (none/invalid), TOKEN_EXPIRED, LOGIN_FAILED', async () => {
  assert.deepEqual((await get(mini(), '/api/auth')).body, { error: 'Ikke innlogget', code: 'HOMELAB_AUTH', reason: 'none' });
  assert.deepEqual((await get(mini(() => 'invalid'), '/api/auth', { headers: { authorization: 'Bearer x' } })).body, { error: 'Ikke innlogget', code: 'HOMELAB_AUTH', reason: 'invalid' });
  assert.deepEqual((await get(mini(() => 'expired'), '/api/auth')).body, { error: 'Innloggingen er utløpt. Logg inn på nytt.', code: 'TOKEN_EXPIRED', reason: 'expired' });
  assert.deepEqual((await get(mini(), '/api/login', { method: 'POST' })).body, { error: 'Feil passord', code: 'LOGIN_FAILED' });
  assert.deepEqual((await get(mini(), '/api/session')).body, { error: 'Krever nettleser', code: 'SESSION_REQUIRED' });
});

test('vellykkede svar, binære feilsvar og stier utenfor /api røres ikke', async () => {
  assert.deepEqual((await get(mini(), '/api/ok')).body, { ok: true });
  const b = await get(mini(), '/api/bilde');
  assert.equal(b.ct, 'image/png');
  const t = await get(mini(), '/annet');
  assert.equal(t.body, 'ikke api');
});

test('alle code-verdier i server/ er SNAKE_CASE eller står i LEGACY_CODES (ingen nye skrivemåter)', () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk('server');
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const line of src.split('\n')) for (const m of line.matchAll(/\bcode:\s*'([A-Za-z0-9_]+)'/g)) {
      if (!/error|bad\(|fail\(|throw|Error/.test(line)) continue; // code-felt som ikke er feilkoder (f.eks. KIND_LABEL.code)
      if (!SNAKE_CASE.test(m[1]) && !Object.hasOwn(LEGACY_CODES, m[1])) bad.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], 'Nye feilkoder skal skrives SNAKE_CASE (f.eks. NOT_FOUND). Se server/http/errors.js.');
  for (const v of Object.values(LEGACY_CODES)) assert.match(v, SNAKE_CASE);
});
