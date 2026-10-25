// Prompt 58 (OMLX58): oMLX som backend «omlx» i AI-gaten, motor per oppgave med reserve til Ollama, admin-API, vakten og eval --backend omlx.
// Mocket: oMLX er eval/lib/fake-omlx.mjs (en ekte HTTP-server på 127.0.0.1 med OpenAI-form og SSE), Ollama er eval/lib/fake-model.mjs.
// Vakten (tools/omlx/guard.py) kjøres EKTE med python3 foran den falske oMLX-en: IP-filter, nøkkel, ruter, strømming.
// Ikke kjørt ekte her: oMLX selv (macOS/Apple silicon), Homebrew, modellvektene, install.sh/launchd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as netServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p58-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-58om';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4681';
process.env.OLLAMA_URL = 'http://ollama.test58:11434';
delete process.env.MOCK_DATA;
delete process.env.GEMINI_API_KEY;
for (const k of ['OMLX_URL', 'OMLX_API_KEY', 'OMLX_TASKS', 'OMLX_FALLBACK', 'OMLX_MODEL_TEXT', 'OMLX_MODEL_VISION', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'AI_BACKEND']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); }; // ingenting annet skal ut
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const ai = await import('../server/ai-run.js');
const gate = await import('../server/ai-gate.js');
const be = await import('../server/omlx58/backend.js');
const cfg58 = await import('../server/omlx58/config.js');
const h58 = await import('../server/omlx58/health.js');
const { startFakeOmlx58 } = await import('../eval/lib/fake-omlx.mjs');
const { makeFakeModel } = await import('../eval/lib/fake-model.mjs');
const { pct58, resolveMlx58 } = await import('../eval/lib/omlx58.mjs');

const KEY = 'omlx58-' + 'a1b2c3d4'.repeat(6); // 55 tegn
const fake = await startFakeOmlx58({ key: KEY });
test.after(() => fake.close());
const fakeOllama = makeFakeModel();
const ollamaCalls = [];
// ai-run/gaten: 127.0.0.1 (falsk oMLX / vakten) får ekte nett, Ollama-verten er den falske modellen.
const router = (u, i) => { const url = String(u); if (/^http:\/\/127\.0\.0\.1:/.test(url)) return realFetch(u, i); if (url.startsWith(process.env.OLLAMA_URL)) { ollamaCalls.push({ url, body: i?.body ? JSON.parse(i.body) : null }); return fakeOllama(url, i); } return Promise.reject(new TypeError('fetch failed')); };
ai._setAiFetch(router);
h58._setOmlxFetch58(realFetch);

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const lastChat = () => fake.calls.filter((c) => c.path === '/v1/chat/completions').at(-1);
const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/* ---------------- Ren oversettelse ---------------- */

test('parameter-mapping: num_predict → max_tokens, ingen num_ctx/keep_alive, temperatur, JSON-skjema strict, json_object, think av', () => {
  const schema = { type: 'object', properties: { intent: { type: 'string' } }, required: ['intent'] };
  const { payload } = be.omlxBody58('chat', { model: 'mlx-community/Qwen3-8B-4bit', keep_alive: '15m', think: false, format: schema,
    messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Hei /no_think' }], options: { num_ctx: 8192, num_predict: 320, temperature: 0, top_p: 0.9, top_k: 20 } }, { thinking: true });
  assert.equal(payload.max_tokens, 320);
  assert.equal(payload.temperature, 0);
  assert.equal(payload.top_p, 0.9);
  assert.equal(payload.stream, true);
  assert.deepEqual(payload.stream_options, { include_usage: true });
  for (const k of ['num_ctx', 'keep_alive', 'options', 'think', 'format', 'top_k']) assert.equal(k in payload, false, k);
  assert.deepEqual(payload.response_format, { type: 'json_schema', json_schema: { name: 'plan', schema, strict: true } });
  assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: false });
  assert.equal(be.omlxBody58('chat', { messages: [], format: 'json' }).payload.response_format.type, 'json_object');
  assert.equal(be.omlxBody58('chat', { messages: [], think: false }, { thinking: false }).payload.chat_template_kwargs, undefined, 'ikke-tenkemodeller får ikke enable_thinking');
  const g = be.omlxBody58('generate', { system: 'Sys', prompt: 'P', options: {} }).payload;
  assert.deepEqual(g.messages, [{ role: 'system', content: 'Sys' }, { role: 'user', content: 'P' }]);
});

test('verktøynavn tur-retur: punktum → understrek ut, tilbake i tool_calls; meldinger med tool_calls/role tool får id-er', () => {
  const tools = [{ type: 'function', function: { name: 'calendar.create', description: 'Ny hendelse', parameters: { type: 'object', properties: { title: { type: 'string' } } } } }, { type: 'function', function: { name: 'weather.get', parameters: { type: 'object', properties: {} } } }];
  const { payload, names } = be.omlxBody58('chat', { messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'calendar.create', arguments: { title: 'Dune' } } }] }, { role: 'tool', content: '{"ok":true}' }], tools });
  assert.deepEqual(payload.tools.map((t) => t.function.name), ['calendar_create', 'weather_get']);
  for (const t of payload.tools) assert.match(t.function.name, /^[a-zA-Z0-9_-]+$/);
  assert.equal(payload.messages[1].tool_calls[0].function.name, 'calendar_create');
  assert.equal(payload.messages[1].tool_calls[0].function.arguments, '{"title":"Dune"}');
  assert.equal(payload.messages[2].tool_call_id, payload.messages[1].tool_calls[0].id);
  const back = be.toolCallsBack58([{ function: { name: 'calendar_create', arguments: '{"title":"Dune","date":"17.12"}' } }, { function: { name: 'weather_get', arguments: '' } }], names);
  assert.deepEqual(back, [{ function: { name: 'calendar.create', arguments: { title: 'Dune', date: '17.12' } } }, { function: { name: 'weather.get', arguments: {} } }]);
});

test('bilder: Ollama-images → OpenAI image_url med data-URL', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const { payload } = be.omlxBody58('chat', { messages: [{ role: 'user', content: 'Les', images: [png] }] });
  assert.equal(payload.messages[0].content[0].type, 'text');
  assert.equal(payload.messages[0].content[1].type, 'image_url');
  assert.match(payload.messages[0].content[1].image_url.url, /^data:image\/png;base64,iVBOR/);
});

test('eval-hjelpere: p50/p90 og MLX-ID med/uten organisasjonsmappe', () => {
  assert.equal(pct58([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(pct58([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.equal(pct58([], 0.5), 0);
  assert.equal(resolveMlx58('mlx-community/Qwen3-8B-4bit', ['Qwen3-8B-4bit']), 'Qwen3-8B-4bit');
  assert.equal(h58.resolveModel58('Qwen3-8B-4bit', [{ id: 'mlx-community/Qwen3-8B-4bit' }]), 'mlx-community/Qwen3-8B-4bit');
  assert.equal(h58.resolveModel58('ukjent', [{ id: 'mlx-community/Qwen3-8B-4bit' }]), null);
});

/* ---------------- Admin-API: bare admin, bare interne adresser, nøkkelen aldri ut ---------------- */

test('admin-API: bare admin, bare adresser i huset, nøkkelen kryptert og aldri ut, Ollama er standard', async () => {
  assert.equal((await I('/api/admin/omlx58/config')).status, 403);
  assert.equal((await I('/api/admin/omlx58/config', 'PUT', { url: fake.url })).status, 403);
  assert.equal((await req('/api/admin/omlx58/health')).status, 401);
  const c0 = await A('/api/admin/omlx58/config');
  assert.equal(c0.status, 200);
  assert.equal(c0.body.standard, 'ollama');
  assert.ok(Object.values(c0.body.engines).every((e) => e === 'ollama'), 'Ollama er standard for alle oppgaver');
  assert.equal(c0.body.fallbackOllama, true, 'reserven er på som standard');
  for (const bad of ['https://omlx.example.com', 'http://8.8.8.8:8040', 'http://user:pw@10.69.1.173:8040', 'ftp://10.69.1.173', 'http://10.69.1.173:8040/v1']) {
    const r = await A('/api/admin/omlx58/config', 'PUT', { url: bad });
    assert.equal(r.status, 400, bad);
  }
  assert.match((await A('/api/admin/omlx58/config', 'PUT', { url: 'https://omlx.example.com' })).body.error, /i huset/);
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { key: 'kort' })).status, 400);
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { engines: { kb: 'omlx' } })).status, 400, 'embeddings kan ikke bytte motor');
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { engines: { glimt: 'sky' } })).status, 400);
  const ok = await A('/api/admin/omlx58/config', 'PUT', { url: 'http://10.69.1.173:8040', key: KEY });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.url, 'http://10.69.1.173:8040');
  assert.equal(ok.body.keySet, true);
  // Nøkkelen er kryptert i basen og finnes ikke i noe svar.
  const { kv, OWNER } = await import('../server/db.js');
  assert.ok(!JSON.stringify(kv.get(OWNER, 'omlx58', {})).includes(KEY), 'nøkkelen lagres kryptert');
  const r = await A('/api/admin/omlx58/config', 'PUT', { url: fake.url });
  assert.equal(r.status, 200);
  for (const t of [JSON.stringify(r.body), (await A('/api/admin/omlx58/config')).text, (await A('/api/admin/omlx58/health?fresh=1')).text]) assert.ok(!t.includes(KEY), 'nøkkelen sendes aldri ut');
  assert.equal(cfg58.omlxConf58().key, KEY);
  assert.ok(!gate.maskSecrets(`feil med ${KEY} i teksten`).includes(KEY), 'maskSecrets fjerner oMLX-nøkkelen');
});

test('helse og test: modellene fra /v1/models, Test går gjennom gaten med nøkkelen', async () => {
  const h = await A('/api/admin/omlx58/health?fresh=1');
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true);
  assert.ok(h.body.models.includes('mlx-community/Qwen3-8B-4bit'));
  assert.deepEqual(h.body.missing, []);
  assert.equal(h.body.loadedKnown, false, 'oMLX-mocken oppgir ikke lastet-status');
  const t = await A('/api/admin/omlx58/test', 'POST', {});
  assert.equal(t.status, 200);
  assert.equal(t.body.ok, true, JSON.stringify(t.body));
  assert.equal(t.body.text, 'ok');
  assert.equal(lastChat().auth, `Bearer ${KEY}`);
  assert.ok(!JSON.stringify(t.body).includes(KEY));
});

/* ---------------- Motor per oppgave via ai-run.run() ---------------- */

test('run(glimt) på oMLX: JSON-skjema, think av (+ /no_think), max_tokens, nøkkel, ingen Ollama-kall; standard er fortsatt Ollama', async () => {
  // Standard: Ollama.
  const n0 = ollamaCalls.length;
  const a = await ai.run('glimt', { prompt: 'Hva er hovedstaden i Frankrike?', numPredict: 60, localOnly: true });
  assert.equal(a.engine, undefined);
  assert.ok(ollamaCalls.length > n0, 'uten valg går glimt til Ollama');
  assert.equal(cfg58.engineFor58('glimt'), 'ollama');

  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { engines: { glimt: 'omlx', rc: 'omlx' } })).status, 200);
  assert.equal(cfg58.engineFor58('glimt'), 'omlx');
  const n1 = ollamaCalls.filter((c) => /\/api\/chat$/.test(c.url)).length;
  const schema = { type: 'object', properties: { intent: { type: 'string' }, module: { type: 'string' }, calls: { type: 'array' } }, required: ['intent', 'calls'] };
  const out = await ai.run('glimt', { system: 'Planlegger', prompt: 'Melding: Skal se Dune på Colosseum kino 17.12 17.30', schema, temperature: 0, numPredict: 320, localOnly: true, noRetry: true });
  assert.equal(out.engine, 'omlx');
  assert.equal(out.model, 'mlx-community/Qwen3-8B-4bit');
  assert.equal(out.data.calls[0].tool, 'calendar.create');
  assert.equal(out.timing.backend, 'omlx');
  const c = lastChat();
  assert.equal(c.auth, `Bearer ${KEY}`);
  assert.equal(c.body.model, 'mlx-community/Qwen3-8B-4bit');
  assert.equal(c.body.max_tokens, 320);
  assert.equal(c.body.response_format.type, 'json_schema');
  assert.equal(c.body.response_format.json_schema.strict, true);
  assert.deepEqual(c.body.chat_template_kwargs, { enable_thinking: false });
  assert.match(c.body.messages.at(-1).content, /\/no_think$/);
  for (const k of ['num_ctx', 'keep_alive', 'options']) assert.equal(k in c.body, false);
  assert.equal(ollamaCalls.filter((x) => /\/api\/chat$/.test(x.url)).length, n1, 'ingen chat-kall til Ollama når oMLX svarer');
  // Jobbloggen: backend omlx, ingen nøkkel.
  const job = ai.jobGet(out.jobId, 'owner') ?? (await A('/api/ai/jobs?limit=5')).body;
  assert.ok(!JSON.stringify(job).includes(KEY));
});

test('run(glimt) med verktøy (tools-modus): navn uten punktum til oMLX, tilbake som calendar.create med argumenter', async () => {
  const { ollamaTools45 } = await import('../server/glimt45/tools.js');
  const tools = ollamaTools45(['calendar.create', 'calendar.search', 'weather.get']);
  const out = await ai.run('glimt', { system: 'Planlegger', prompt: 'Melding: Skal se Dune på Colosseum kino 17.12 17.30', ollamaTools: tools, temperature: 0, numPredict: 320, localOnly: true, noRetry: true });
  const c = lastChat();
  assert.deepEqual(c.body.tools.map((t) => t.function.name), ['calendar_create', 'calendar_search', 'weather_get']);
  assert.equal(out.toolCalls[0].function.name, 'calendar.create');
  assert.deepEqual(out.toolCalls[0].function.arguments, { title: 'Dune', date: '17.12', time: '17.30', location: 'Colosseum kino' });
});

test('run(rc) med bilde på oMLX: bildemodellen (Qwen2.5-VL) og image_url', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const out = await ai.run('rc', { prompt: 'Les vitnemålet', images: [png], json: true, localOnly: true, noRetry: true });
  assert.equal(out.engine, 'omlx');
  assert.equal(out.model, 'mlx-community/Qwen2.5-VL-7B-Instruct-4bit');
  const c = lastChat();
  assert.equal(c.body.model, 'mlx-community/Qwen2.5-VL-7B-Instruct-4bit');
  assert.ok(c.body.messages.some((m) => Array.isArray(m.content) && m.content.some((x) => x.type === 'image_url' && /^data:image\/png;base64,/.test(x.image_url.url))));
});

test('reserve: oMLX 503 eller ingen kontakt → Ollama, merket «via Ollama»; av → feil; 4xx → ingen reserve', async () => {
  fake.setStatus(503);
  try {
    const n = ollamaCalls.length;
    const out = await ai.run('glimt', { prompt: 'Hva er hovedstaden i Frankrike?', numPredict: 60, localOnly: true, noRetry: true });
    assert.equal(out.viaOllama, true);
    assert.match(out.notice, /^via Ollama: oMLX svarte ikke/);
    assert.equal(out.model, 'qwen3:8b');
    assert.ok(ollamaCalls.length > n);
    assert.match(out.text, /Paris/);
    const jobs = (await A('/api/ai/jobs?limit=10')).body;
    const list = Array.isArray(jobs) ? jobs : [...(jobs.running ?? []), ...(jobs.recent ?? []), ...(jobs.jobs ?? [])];
    const j = list.find((x) => x.id === out.jobId);
    if (j) assert.match(String(j.backendNote ?? ''), /via Ollama/);
  } finally { fake.setStatus(200); }
  // Ingen kontakt (stengt port).
  const port = await freePort();
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { url: `http://127.0.0.1:${port}` })).status, 200);
  const out2 = await ai.run('glimt', { prompt: 'Hva er hovedstaden i Frankrike?', numPredict: 60, localOnly: true, noRetry: true });
  assert.equal(out2.viaOllama, true);
  // Reserven av → feil, ikke Ollama.
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { fallbackOllama: false })).status, 200);
  const n2 = ollamaCalls.filter((x) => /\/api\/chat$/.test(x.url)).length;
  await assert.rejects(() => ai.run('glimt', { prompt: 'Hei', numPredict: 20, localOnly: true, noRetry: true }), /oMLX kan ikke nås/);
  assert.equal(ollamaCalls.filter((x) => /\/api\/chat$/.test(x.url)).length, n2);
  // 4xx (ukjent modell) med reserven på → vises som feil, ingen reserve.
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { url: fake.url, fallbackOllama: true, models: { glimt: 'mlx-community/Qwen3-8B-4bit' } })).status, 200);
  h58.invalidate58();
  await h58.omlxModels58({ force: true });
  const realFetchAi = router;
  // Modellen finnes i /v1/models, men chat svarer 404 (simulert med en modell-ID som ikke finnes i mocken etter oppslag).
  ai._setAiFetch((u, i) => (String(u).endsWith('/v1/chat/completions') ? Promise.resolve(new Response(JSON.stringify({ error: { message: 'Model not found' } }), { status: 404, headers: { 'content-type': 'application/json' } })) : realFetchAi(u, i)));
  try {
    const n3 = ollamaCalls.filter((x) => /\/api\/chat$/.test(x.url)).length;
    await assert.rejects(() => ai.run('glimt', { prompt: 'Hei', numPredict: 20, localOnly: true, noRetry: true }), /oMLX HTTP 404/);
    assert.equal(ollamaCalls.filter((x) => /\/api\/chat$/.test(x.url)).length, n3, '4xx gir ingen reserve');
  } finally { ai._setAiFetch(router); }
  // Modellen finnes ikke på oMLX (ifølge /v1/models) → advarsel og Ollama (reserven på).
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { models: { glimt: 'mlx-community/Finnes-Ikke-4bit' } })).status, 200);
  const r = await ai.resolveTask('glimt', { localOnly: true });
  assert.ok(r.warnings.some((w) => /finnes ikke på oMLX/.test(w)));
  assert.ok(r.list.every((x) => !x.engine));
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { models: { glimt: '' } })).status, 200);
});

/* ---------------- Open WebUI nede → Ollama direkte (koordinatorens tillegg) ---------------- */

test('Open WebUI nede (ingen kontakt) → samme kall direkte til Ollama, merket; av bare ved eksplisitt openwebui + reserve av', async () => {
  const port = await freePort();
  assert.equal((await A('/api/config', 'PUT', { openwebui_url: `http://127.0.0.1:${port}`, openwebui_key: 'sk-owui-test58', ai_think_direct: '0' })).status, 200);
  try {
    assert.equal(gate.backendConfig().effective, 'openwebui');
    const call = () => gate.gateChat({ model: 'qwen3:8b', base: process.env.OLLAMA_URL, fetch: router, priority: 'interactive', retries: 0, body: { messages: [{ role: 'user', content: 'Hva er hovedstaden i Frankrike?' }], options: { num_predict: 40 } } });
    const out = await call();
    assert.equal(out.telemetry.backend, 'ollama');
    assert.equal(out.telemetry.backendNote, gate.OWUI_DOWN_NOTE);
    assert.match(out.text, /Paris/);
    // Eksplisitt Open WebUI + reserven av → feilen kommer fram.
    assert.equal((await A('/api/config', 'PUT', { ai_backend: 'openwebui' })).status, 200);
    assert.equal((await A('/api/admin/omlx58/config', 'PUT', { fallbackOllama: false })).status, 200);
    await assert.rejects(call, /Open WebUI kan ikke nås/);
    // Eksplisitt Open WebUI, reserven på → Ollama direkte.
    assert.equal((await A('/api/admin/omlx58/config', 'PUT', { fallbackOllama: true })).status, 200);
    assert.equal((await call()).telemetry.backendNote, gate.OWUI_DOWN_NOTE);
    // Via run(): Glimt-jobben feiler ikke lenger når Open WebUI er nede.
    assert.equal((await A('/api/admin/omlx58/config', 'PUT', { engines: { glimt: 'ollama' } })).status, 200);
    const r = await ai.run('glimt', { prompt: 'Hva er hovedstaden i Frankrike?', numPredict: 60, localOnly: true, noRetry: true });
    assert.match(r.text, /Paris/);
    assert.equal(r.timing.backend, 'ollama');
  } finally {
    await A('/api/config', 'PUT', { openwebui_url: null, openwebui_key: null, ai_backend: null, ai_think_direct: null });
    await A('/api/admin/omlx58/config', 'PUT', { engines: { glimt: 'omlx' } });
  }
});

/* ---------------- Vakten (guard.py, ekte) ---------------- */

async function startGuard({ allow = ['127.0.0.1/32'], upstream }) {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p58g-'));
  const port = await freePort();
  const conf = join(dir, 'config.json');
  writeFileSync(conf, JSON.stringify({ bind_ip: '127.0.0.1', allow, key: KEY, port, upstream_port: upstream }));
  const p = spawn('python3', ['-I', 'tools/omlx/guard.py', '--config', conf, '--no-spawn'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  p.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 300 && !/lytter på/.test(log); i++) await new Promise((r) => setTimeout(r, 50));
  return { url: `http://127.0.0.1:${port}`, stop: () => p.kill('SIGTERM'), log: () => log };
}
const hasPy = spawnSync('python3', ['--version']).status === 0;

test('vakten: IP-liste, nøkkel (konstant tid), faste ruter, /health uten filstier, strømming, aldri nøkler i loggen', { skip: !hasPy && 'python3 mangler' }, async () => {
  const g = await startGuard({ upstream: fake.port });
  try {
    assert.equal((await realFetch(`${g.url}/health`)).status, 401);
    assert.equal((await realFetch(`${g.url}/health`, { headers: { authorization: 'Bearer feil' } })).status, 401);
    const h = await realFetch(`${g.url}/health`, { headers: { authorization: `Bearer ${KEY}` } }).then((r) => r.json());
    assert.equal(h.status, 'ok');
    assert.ok(h.models.some((m) => m.id === 'mlx-community/Qwen3-8B-4bit'));
    assert.equal((await realFetch(`${g.url}/admin`, { headers: { authorization: `Bearer ${KEY}` } })).status, 404, 'admin-panelet er ikke ute på LAN');
    assert.equal((await realFetch(`${g.url}/v1/completions`, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: '{}' })).status, 404);
    const r = await realFetch(`${g.url}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'mlx-community/Qwen3-8B-4bit', stream: true, messages: [{ role: 'user', content: 'Hva er hovedstaden i Frankrike?' }] }) });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Paris[\s\S]*\[DONE\]/);
    // Hele kjeden: Homelab → vakten → (falsk) oMLX.
    assert.equal((await A('/api/admin/omlx58/config', 'PUT', { url: g.url })).status, 200);
    const t = await A('/api/admin/omlx58/test', 'POST', {});
    assert.equal(t.body.ok, true, JSON.stringify(t.body));
    assert.ok(!g.log().includes(KEY), 'nøkkelen står aldri i vaktens logg');
    assert.ok(!/Frankrike|Paris/.test(g.log()), 'innhold logges ikke');
  } finally { g.stop(); await A('/api/admin/omlx58/config', 'PUT', { url: fake.url }); }
  const g2 = await startGuard({ allow: ['10.69.1.39/32'], upstream: fake.port });
  try { assert.equal((await realFetch(`${g2.url}/health`, { headers: { authorization: `Bearer ${KEY}` } })).status, 403, 'avsender utenfor lista'); } finally { g2.stop(); }
  const dir = mkdtempSync(join(tmpdir(), 'hl-p58c-'));
  const check = (c) => { const f = join(dir, `c${Math.random()}.json`); writeFileSync(f, JSON.stringify(c)); return spawnSync('python3', ['-I', 'tools/omlx/guard.py', '--config', f, '--check-config']).status; };
  assert.equal(check({ bind_ip: '10.69.1.173', allow: ['10.69.1.39'], key: KEY }), 0);
  assert.notEqual(check({ bind_ip: '0.0.0.0', allow: ['10.69.1.39'], key: KEY }), 0);
  assert.notEqual(check({ bind_ip: '10.69.1.173', allow: ['10.0.0.0/8'], key: KEY }), 0);
  assert.notEqual(check({ bind_ip: '10.69.1.173', allow: ['10.69.1.39'], key: 'kort' }), 0);
  assert.notEqual(check({ bind_ip: '10.69.1.173', allow: ['10.69.1.39'], key: KEY, port: 8000 }), 0, 'port 8000 er Neutrino sin');
  const f = join(dir, 'cmd.json'); writeFileSync(f, JSON.stringify({ bind_ip: '10.69.1.173', allow: ['10.69.1.39'], key: KEY, omlx_bin: 'omlx', model_dir: '/m', ssd_cache_dir: '/c' }));
  const cmd = spawnSync('python3', ['-I', 'tools/omlx/guard.py', '--config', f, '--print-command']).stdout.toString();
  assert.match(cmd, /omlx serve --host 127\.0\.0\.1 --port 18040 --model-dir \/m --memory-guard-gb 9 --max-concurrent-requests 2 --paged-ssd-cache-dir \/c --paged-ssd-cache-max-size 20GB/);
  assert.ok(!cmd.includes(KEY), 'nøkkelen går i miljøet, ikke i argumentlista');
});

/* ---------------- Eval --backend omlx mot mocken ---------------- */

test('eval: npm run eval -- --backend omlx --url … --key … mot den falske oMLX-en (motor i tittelen, p50/p90)', async () => {
  const out = mkdtempSync(join(tmpdir(), 'hl-p58e-'));
  // Asynkront: den falske oMLX-en kjører i denne prosessen og må kunne svare mens eval kjører.
  const r = await new Promise((res) => {
    const p = spawn(process.execPath, ['eval/run.mjs', '--backend', 'omlx', '--url', fake.url, '--key', KEY, '--runs', '1', '--case', '01,04,14', '--out', out, '--quiet'], { env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => p.kill('SIGKILL'), 240_000);
    p.on('exit', (status) => { clearTimeout(t); res({ status, stdout, stderr }); });
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /motor oMLX/);
  assert.match(r.stdout, /Totalt 3\/3 kjøringer bestått/);
  assert.match(r.stdout, /p50 .* p90/);
  assert.ok(!r.stdout.includes(KEY), 'nøkkelen skrives ikke ut');
  const files = readdirSync(out);
  const js = JSON.parse(readFileSync(join(out, files.find((x) => x.endsWith('.json'))), 'utf8'));
  assert.equal(js.meta.engine, 'oMLX');
  assert.equal(js.meta.omlx.fallbackOllama, false);
  assert.equal(js.summary.engine, 'oMLX');
  assert.ok(Number.isFinite(js.summary.p50Ms) && Number.isFinite(js.summary.p90Ms));
  for (const c of js.cases) { assert.ok(Number.isFinite(c.p50Ms) && Number.isFinite(c.p90Ms)); assert.deepEqual(c.models, ['mlx-community/Qwen3-8B-4bit']); }
  assert.ok(!JSON.stringify(js).includes(KEY), 'nøkkelen står ikke i resultatfila');
  const md = readFileSync(join(out, files.find((x) => x.endsWith('.md'))), 'utf8');
  assert.match(md, /^# Glimt eval .* · motor oMLX · omlx · Qwen3-8B-4bit/);
  assert.match(md, /\| Case \| OK \| Median \| p50 \| p90 \|/);
});

test('oMLX kan slås av uten å miste oppsettet: alt går til Ollama, ingen sjekk, Test sier «slått av»; på igjen gir samme valg', async () => {
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { engines: { glimt: 'omlx' } })).status, 200);
  assert.equal(cfg58.engineFor58('glimt'), 'omlx');
  const off = await A('/api/admin/omlx58/config', 'PUT', { enabled: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.enabled, false);
  assert.ok(off.body.url, 'adressen er lagret');
  assert.equal(off.body.engines.glimt, 'omlx', 'valget per oppgave er lagret');
  assert.equal(cfg58.engineFor58('glimt'), 'ollama', 'slått av → Ollama');
  const h = await A('/api/admin/omlx58/health');
  assert.equal(h.body.status, 'disabled');
  assert.equal(h.body.enabled, false);
  const t = await A('/api/admin/omlx58/test', 'POST', {});
  assert.match(t.body.error ?? '', /slått av/);
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { enabled: 'ja' })).status, 400);
  assert.equal((await I('/api/admin/omlx58/config', 'PUT', { enabled: true })).status, 403);
  assert.equal((await A('/api/admin/omlx58/config', 'PUT', { enabled: true })).status, 200);
  assert.equal(cfg58.engineFor58('glimt'), 'omlx', 'på igjen → samme valg');
  await A('/api/admin/omlx58/config', 'PUT', { engines: { glimt: 'ollama' } });
});
