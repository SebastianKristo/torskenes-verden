// Prompt 45 (GLIMT45): Glimt-motoren hele veien gjennom ai-run → ai-gate → (falsk) Ollama, uten MOCK_DATA.
// Sjekker at tool calling faktisk sendes (/api/chat med tools, stream, think:false), at tool_calls i strømmen kommer fram
// gjennom gaten, at gemma3 (uten verktøystøtte) får format:<JSON-skjema>, og at hendelsen faktisk lagres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p45o-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-45o';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.fake45:11434';
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'OPENWEBUI_URL', 'AI_GPU_VRAM_GB']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const fake = { models: ['qwen3:8b'], bodies: [] };
const enc = new TextEncoder();
const nd = (chunks) => new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(`${JSON.stringify(x)}\n`)); c.close(); } }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
async function ollama(url, init = {}) {
  const u = new URL(url);
  if (u.pathname === '/api/tags') return J({ models: fake.models.map((name) => ({ name, model: name, size: 5e9, details: { family: name.split(':')[0], parameter_size: '8B' } })) });
  if (u.pathname === '/api/ps') return J({ models: [] });
  if (u.pathname === '/api/version') return J({ version: '0.12.3' });
  if (u.pathname === '/api/chat') {
    const b = JSON.parse(init.body);
    fake.bodies.push(b);
    if (b.tools && /gemma3/.test(b.model)) return J({ error: `registry.ollama.ai/library/${b.model} does not support tools` }, 400);
    const msg = b.messages.at(-1).content;
    const done = { model: b.model, done: true, done_reason: 'stop', prompt_eval_count: 40, eval_count: 20, message: { role: 'assistant', content: '' } };
    if (b.tools) {
      // Som Ollama: tool_calls kommer i én bit før den siste.
      return nd([{ model: b.model, message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'calendar.create', arguments: { title: 'Kino – Dune', date: '12.10', time: '12:15' } } }] }, done: false }, done]);
    }
    const plan = /melk/.test(msg) ? { intent: 'create', module: 'tasks', calls: [{ tool: 'tasks.create', args: { title: 'Kjøpe melk', due: 'i morgen' } }], ask: null }
      : /dune/i.test(msg) ? { intent: 'calendar_create', calls: [{ tool: 'calendar.create', args: { title: 'Kino – Dune', date: '12.10', time: '12:15' } }], needs_clarification: false, clarification_question: null } : { intent: 'chat', module: 'chat', calls: [{ tool: 'chat.answer', args: {} }], ask: null };
    const s = JSON.stringify(plan);
    return nd([{ model: b.model, message: { role: 'assistant', content: s.slice(0, 20) }, done: false }, { model: b.model, message: { role: 'assistant', content: s.slice(20) }, done: false }, done]);
  }
  return J({});
}
const realFetch = globalThis.fetch;
globalThis.fetch = (u, i) => (String(u).startsWith('http://ollama.fake45') ? ollama(u, i) : Promise.reject(new TypeError('fetch failed')));
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const ai = await import('../server/ai-run.js');
const E = await import('../server/glimt45/engine.js');
const { db, kv, OWNER } = await import('../server/db.js');
ai._setAiFetch((u, i) => globalThis.fetch(u, i));
E._setClock45({ today: '2026-10-23', nowMin: 600 });

const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
const A = async (path, method = 'GET', body) => { const r = await app.request(path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };

// Prompt 47: planleggeren bruker JSON-skjema (Ollama format) for alle modeller, med num_ctx 8192 / num_predict 512 / temperatur 0 /
// think av eksplisitt, og en engelsk systemprompt med dato og klokkeslett.
test('qwen3:8b: planleggeren via gaten → format:<JSON-skjema> → validert avtale lagres', async () => {
  fake.models = ['qwen3:8b']; fake.bodies.length = 0; ai.invalidateInventory();
  const r = await A('/api/glimt/agent', 'POST', { text: 'Legg til time 12.10 12:15 Kino se på dune', module: 'home', requestId: 'ollama45-0001' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.engine, 'ollama-json', JSON.stringify(r.body));
  assert.equal(r.body.model, 'qwen3:8b');
  assert.equal(r.body.actions[0].status, 'done');
  assert.deepEqual([r.body.actions[0].args.title, r.body.actions[0].args.date, r.body.actions[0].args.start], ['Kino: Dune', '2027-10-12', '12:15']);
  const b = fake.bodies.find((x) => x.format);
  assert.ok(b, 'format (JSON-skjema) sendt til Ollama');
  assert.equal(b.stream, true);
  assert.equal(b.think, false, 'qwen3 tenker ikke på første forsøk');
  assert.equal(b.tools, undefined, 'ingen tools sammen med format');
  assert.ok(b.format.properties.calls && b.format.properties.needs_clarification, 'planskjemaet');
  assert.deepEqual([b.options.num_ctx, b.options.num_predict, b.options.temperature], [8192, 512, 0], 'planleggerens parametre sendes eksplisitt');
  assert.match(b.messages[0].content, /^You are the planner for Glimt/);
  assert.match(b.messages[0].content, /Nå: fredag 23\. oktober 2026 kl\. 10:00 \(Europe\/Oslo\)/);
  assert.equal(fake.bodies.filter((x) => x.messages).length, 1, 'ett modellkall');
  const n = db.prepare("SELECT count(*) FROM ai_runs WHERE title='Glimt · forstår' AND status='ok'").pluck().get();
  assert.ok(n >= 1, 'kallet står i AI-jobbloggen (via ai-run)');
});

test('gemma3:12b: verktøy ikke støttet → format:<JSON-skjema> og husket for neste gang', async () => {
  fake.models = ['gemma3:12b']; fake.bodies.length = 0; ai.invalidateInventory();
  kv.set(OWNER, 'glimt45_notools', {});
  const r = await A('/api/glimt/agent', 'POST', { text: 'Minn meg på å kjøpe melk i morgen', module: 'home', requestId: 'ollama45-0002' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.engine, 'ollama-json');
  assert.equal(r.body.actions[0].tool, 'tasks.create');
  assert.equal(r.body.actions[0].status, 'done');
  const chats = fake.bodies.filter((x) => x.messages);
  assert.equal(chats.length, 1, 'gemma3 får JSON-modus direkte (ingen verktøy-forsøk først)');
  assert.equal(chats[0].format.type, 'object');
  assert.ok(chats[0].format.properties.calls);
  assert.equal(db.prepare("SELECT title, due FROM hl_tasks WHERE title='Kjøpe melk'").get().due, '2026-10-24');
});
