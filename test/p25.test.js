// Prompt 25 (server): ingen faste 30 s-grenser i AI-søket. Ollama strømmer (grensen gjelder tid uten nye tokens), AI-søk som
// jobb (202 {jobId}, poll, SSE, Avbryt, per bruker), /ai/limits, feilmelding med motor og grense, navStyle og /api/auth/2fa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p25-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p25-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Falsk Ollama på en ekte port: venter delayMs før første byte, og strømmer deretter tokens med gapMs mellom.
const mock = { delayMs: 0, gapMs: 0, parts: ['{"answer":', '"Fant noe [1]."}'], bodies: [], aborted: 0 };
const ollama = createServer((req, res) => {
  if (req.url === '/api/tags') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"models":[]}'); return; }
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', async () => {
    mock.bodies.push(JSON.parse(raw || '{}'));
    let gone = false;
    res.on('close', () => { if (!res.writableEnded) { gone = true; mock.aborted++; } });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(mock.delayMs);
    if (gone) return;
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    for (const p of mock.parts) {
      if (gone) return;
      res.write(JSON.stringify({ message: { role: 'assistant', content: p }, done: false }) + '\n');
      await wait(mock.gapMs);
    }
    if (!gone) res.end(JSON.stringify({ done: true }) + '\n');
  });
});
await new Promise((r) => ollama.listen(0, '127.0.0.1', r));
const OLLAMA = `http://127.0.0.1:${ollama.address().port}`;
process.env.OLLAMA_URL = OLLAMA;
test.after(() => ollama.close());

// Groq svarer med en gang (reservemotoren etter tidsavbrudd). Alt annet nett utenom lokalt avvises.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('api.groq.com')) return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"Groq fant noe [1]."}' } }] }), { status: 200 });
  if (/^https?:\/\/127\.0\.0\.1/.test(u)) return realFetch(url, init);
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
};
test.after(() => { globalThis.fetch = realFetch; });

const { default: app, HTTP_TIMEOUTS } = await import('../server/index.js');
const AI = await import('../server/finans/ai.js');
const S = await import('../server/finans/search.js');
const jobsMod = await import('../server/finans/ai-jobs.js');
const { setSecret, saveSettings, db } = await import('../server/finans/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body, headers = {}) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ikke JSON */ }
  return { status: r.status, body: json, text, headers: r.headers };
};
const A = client(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'admin', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));

const today = new Date().toLocaleDateString('sv-SE');
db.prepare('INSERT INTO fh_transactions(date, amount, description, merchant, created,user_id) VALUES(?,?,?,?,?,\'owner\')').run(today, -34900, 'Rema 1000 Grünerløkka', 'Rema 1000', Date.now());
const Q = { q: 'hvor mye brukte jeg på rema denne måneden?', force: true };
// 1 s i innstillingene = 10 ms i testen (60 s → 600 ms, 45 s → 450 ms).
AI._aiTest.scale = 0.01;
const setup = (t) => {
  AI._resetAi();
  saveSettings({ provider: 'ollama', ollamaUrl: OLLAMA, fallback: true, aiTasks: { search: 'ollama' }, aiTimeouts: { ollama: t, groq: 15, gemini: 20, retries: 0, onTimeout: 'next' } });
};
setSecret('groqKey', 'gsk_test');

test('/ai/limits: grensene per motor og clientTimeoutS = maks × (forsøk + 1) + 10', async () => {
  saveSettings({ aiTimeouts: { gemini: 20, groq: 15, roboflow: 15, ollama: 60, retries: 1 } });
  const r = await A('/finans/api/ai/limits');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.engines, { gemini: 20, groq: 15, ollama: 60, roboflow: 15 });
  assert.equal(r.body.retries, 1);
  assert.equal(r.body.clientTimeoutS, 60 * 2 + 10);
  saveSettings({ aiTimeouts: { gemini: 20, groq: 15, roboflow: 15, ollama: 60, retries: 0 } });
  assert.equal((await A('/finans/api/ai/limits')).body.clientTimeoutS, 70);
});

test('HTTP-serveren kutter ikke forespørsler under 180 s', () => {
  assert.ok(HTTP_TIMEOUTS.requestTimeout === 0 || HTTP_TIMEOUTS.requestTimeout >= 180_000);
  assert.ok(HTTP_TIMEOUTS.headersTimeout >= 60_000);
  assert.equal(HTTP_TIMEOUTS.socketTimeout, 0);
});

test('Ollama = 60 s og et svar som tar 45 s: søket fullføres (stream: true, keep_alive 10m)', async () => {
  setup(60);
  Object.assign(mock, { delayMs: 450, gapMs: 0, bodies: [] });
  const r = await A('/finans/api/search/ai', 'POST', Q);
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'ai', JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.engine, 'Ollama');
  assert.equal(r.body.answer, 'Fant noe [1].');
  const chat = mock.bodies.at(-1);
  assert.equal(chat.stream, true);
  assert.equal(chat.keep_alive, '10m');
});

test('grensen gjelder tid uten nye tokens: 20 s-grense, tokens hvert 10. s i 60 s totalt', async () => {
  setup(20);
  Object.assign(mock, { delayMs: 50, gapMs: 100, parts: ['{"ans', 'wer":', '"Fant ', 'noe ', '[1]."', '}'] });
  const r = await A('/finans/api/search/ai', 'POST', Q);
  assert.equal(r.body.engine, 'Ollama', JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.answer, 'Fant noe [1].');
  mock.parts = ['{"answer":', '"Fant noe [1]."}'];
});

test('Ollama = 20 s og svar etter 25 s: «Ollama svarte ikke innen 20 s», så neste motor (Groq)', async () => {
  setup(20);
  Object.assign(mock, { delayMs: 250, gapMs: 0 });
  const t0 = Date.now();
  const r = await A('/finans/api/search/ai', 'POST', Q);
  assert.ok(Date.now() - t0 < 400, 'stoppet ved grensen');
  assert.equal(r.body.engine, 'Groq');
  assert.equal(r.body.timeoutNotice, 'Ollama svarte ikke innen 20 s');
  assert.deepEqual(r.body.timeouts.map((x) => [x.engine, x.limitS]), [['ollama', 20]]);
  const log = (await A('/finans/api/ai/log?limit=5')).body.items;
  const to = log.find((l) => l.engine === 'ollama' && l.status === 'tidsavbrudd');
  assert.ok(to, JSON.stringify(log));
  assert.equal(to.limitS, 20);
  assert.equal(to.layer, 'ollama');
  assert.equal(to.error, 'Ollama svarte ikke innen 20 s');
  assert.equal(typeof to.elapsedS, 'number');
  // Uten reserve: vanlig søk med feilteksten for motoren og grensen.
  setup(20);
  saveSettings({ fallback: false, aiTasks: {} });
  const r2 = await A('/finans/api/search/ai', 'POST', Q);
  assert.equal(r2.body.aiUnavailable, true);
  assert.equal(r2.body.aiErrorKind, 'timeout');
  assert.equal(r2.body.aiErrorText, 'Ollama svarte ikke innen 20 s.');
  assert.equal(S.aiErrorKind('Ollama: svarte ikke innen tidsfristen (60 s)').text, 'Ollama svarte ikke innen 60 s.');
});

test('jobbmodus: raskt svar kommer direkte, tregt gir 202 {jobId}; poll og SSE; andre brukere får 404', async () => {
  setup(60);
  jobsMod._jobTest.afterMs = 100;
  Object.assign(mock, { delayMs: 0 });
  const fast = await A('/finans/api/search/ai', 'POST', Q, { prefer: 'respond-async' });
  assert.equal(fast.status, 200);
  assert.equal(fast.body.engine, 'Ollama');

  Object.assign(mock, { delayMs: 450 });
  const r = await A('/finans/api/search/ai?async=1', 'POST', Q);
  assert.equal(r.status, 202, r.text);
  const id = r.body.jobId;
  assert.ok(id);
  assert.equal(r.headers.get('location'), `/finans/api/jobs/${id}`);
  assert.equal(r.body.status, 'running');
  assert.equal(r.body.engine, 'ollama');
  assert.equal(r.body.limitS, 60);
  assert.match(r.body.text, /^✦ Ollama tenker … \d+ s av 60 s$/);
  // Per bruker: en annen admin ser ikke jobben.
  assert.equal((await K(`/finans/api/jobs/${id}`)).status, 404);
  assert.equal((await K(`/finans/api/jobs/${id}`, 'DELETE')).status, 404);
  assert.equal((await K(`/finans/api/jobs/${id}/events`)).status, 404);
  // SSE: meldinger til jobben er ferdig, siste har resultatet.
  const ev = await A(`/finans/api/jobs/${id}/events`);
  assert.equal(ev.status, 200);
  assert.match(ev.headers.get('content-type'), /text\/event-stream/);
  const msgs = ev.text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  assert.ok(msgs.length >= 1);
  const last = msgs.at(-1);
  assert.equal(last.status, 'done');
  assert.equal(last.result.answer, 'Fant noe [1].');
  const poll = await A(`/finans/api/jobs/${id}`);
  assert.equal(poll.body.status, 'done');
  assert.equal(poll.body.result.engine, 'Ollama');
});

test('jobbmodus: Avbryt stopper jobben og kallet til Ollama', async () => {
  setup(60);
  S.markAiDown(0);
  jobsMod._jobTest.afterMs = 50;
  Object.assign(mock, { delayMs: 500, aborted: 0 });
  const r = await A('/finans/api/search/ai', 'POST', { ...Q, async: true });
  assert.equal(r.status, 202);
  const d = await A(`/finans/api/jobs/${r.body.jobId}`, 'DELETE');
  assert.equal(d.status, 200);
  assert.equal(d.body.status, 'cancelled');
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(mock.aborted, 1, 'forespørselen til Ollama ble avbrutt');
  assert.equal((await A(`/finans/api/jobs/${r.body.jobId}`)).body.status, 'cancelled');
  const log = (await A('/finans/api/ai/log?limit=3')).body.items;
  assert.equal(log[0].status, 'avbrutt');
  // Avbrudd gjør ikke at AI regnes som nede.
  assert.equal(S.aiDown(), false);
  await new Promise((res) => setTimeout(res, 500));
});

test('eldre klienter uten jobbmodus får det vanlige svaret, også når det tar lang tid', async () => {
  setup(60);
  jobsMod._jobTest.afterMs = 50;
  Object.assign(mock, { delayMs: 300 });
  const r = await A('/finans/api/search/ai', 'POST', Q);
  assert.equal(r.status, 200);
  assert.equal(r.body.answer, 'Fant noe [1].');
});

test('layout: navStyle text | icons | icons_active_label (standard text)', async () => {
  assert.equal((await A('/api/me/layout')).body.navStyle, 'text');
  for (const v of ['icons', 'icons_active_label', 'text']) {
    const r = await A('/api/me/layout', 'PUT', { navStyle: v });
    assert.equal(r.status, 200);
    assert.equal(r.body.navStyle, v);
    assert.equal((await A('/api/me/layout')).body.navStyle, v);
  }
  assert.equal((await A('/api/me/layout', 'PUT', { navStyle: 'flyt' })).status, 400);
  // Per bruker.
  await A('/api/me/layout', 'PUT', { navStyle: 'icons' });
  assert.equal((await K('/api/me/layout')).body.navStyle, 'text');
});

test('innlogging på web: /api/auth/login, /api/auth/totp og /api/auth/2fa finnes', async () => {
  const post = (p, b) => app.request(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await post('/api/auth/2fa', { ticket: 'finnes-ikke', code: '123456' })).status, 401);
  assert.equal((await post('/api/auth/totp', { ticket: 'finnes-ikke', code: '123456' })).status, 401);
  assert.equal((await (await app.request('/api/setup/status')).json()).needsSetup, false);
});
