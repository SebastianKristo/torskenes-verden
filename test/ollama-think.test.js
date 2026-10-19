// Tenkemodeller (qwen3, gemma4): korte oppgaver sender think:false + num_ctx 4096, 400 «does not support thinking» gir ett
// nytt forsøk uten think (og modellen huskes), tenketekst fjernes, og Chat sender think bare etter samtaleinnstillingen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-ollama-think-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.MOCK_DATA;
delete process.env.OPENWEBUI_URL;
delete process.env.OPENWEBUI_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Falsk Ollama. «llama3.2:3b» støtter ikke tenking og svarer 400 når think er med.
const OLD = 'llama3.2:3b';
const calls = [];
const enc = (s) => new TextEncoder().encode(s);
const streamOf = (chunks) => new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc(x)); c.close(); } });
const noThinkErr = (model) => Response.json({ error: `"registry.ollama.ai/library/${model}" does not support thinking` }, { status: 400 });
const generateReply = '{"t":"Tannlege","k":"2026-10-21","s":"10:00","e":"","all":false,"r":""}';
async function fakeFetch(url, init = {}) {
  const u = String(url);
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ url: u, body });
  if (u.endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3:8b', size: 5.2e9, details: { families: ['qwen3'] } }, { name: OLD, size: 2e9, details: { families: ['llama'] } }] });
  if (u.endsWith('/api/chat')) {
    if (body.model === OLD && 'think' in body) return noThinkErr(OLD);
    if (body.stream) {
      const lines = [{ message: { content: '<think>la meg ' } }, { message: { content: 'tenke</think>Hei' } }, { message: { content: ' der.' } }, { done: true, eval_count: 4, eval_duration: 1e9 }];
      return new Response(streamOf(lines.map((l) => JSON.stringify(l) + '\n')), { status: 200 });
    }
    return Response.json({ message: { role: 'assistant', content: '<think>hmm</think>{"ok":true}', thinking: 'lang tenking' }, done: true });
  }
  if (u.endsWith('/api/generate')) {
    if (body.model === OLD && 'think' in body) return noThinkErr(OLD);
    return Response.json({ response: `<think>først tenker jeg</think>${generateReply}`, thinking: 'tenking', done: true });
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;
test.after(() => { globalThis.fetch = realFetch; });

const opts = await import('../server/ollama-opts.js');
const { default: app } = await import('../server/index.js');
const chat = await import('../server/chat.js');
chat._setChatFetch(fakeFetch);
const { describe } = await import('../server/calendar-glimt.js');
const { setUserCfg } = await import('../server/settings.js');
const { OWNER } = await import('../server/db.js');
const { saveSettings } = await import('../server/finans/db.js');

/* ---------------- Hjelperen ---------------- */

test('shortBody: think:false og num_ctx 4096, uten å overstyre num_ctx som er satt', () => {
  opts._resetThinkMemory();
  const b = opts.shortBody({ model: 'qwen3:8b', options: { temperature: 0 } }, { user: OWNER });
  assert.equal(b.think, false);
  assert.deepEqual(b.options, { num_ctx: 4096, temperature: 0 });
  assert.equal(opts.shortBody({ model: 'qwen2.5vl:7b', options: { num_ctx: 8192 } }, { user: OWNER }).options.num_ctx, 8192, 'bildemodellen beholder 8192');
  assert.equal('think' in opts.shortBody({ model: 'qwen3:8b' }, { think: true }), false, 'ai_think på: think sendes ikke');
});

test('stripThink og thinkFilter fjerner tenketekst', () => {
  assert.equal(opts.stripThink('<think>abc\ndef</think>\n{"a":1}'), '{"a":1}');
  assert.equal(opts.stripThink('tenker uten åpningstagg</think>Svar'), 'Svar');
  assert.equal(opts.stripThink('Svar<think>avkuttet'), 'Svar');
  assert.equal(opts.ollamaContent({ message: { content: 'Hei', thinking: 'lang tenking' } }), 'Hei');
  const f = opts.thinkFilter();
  const out = ['A <th', 'ink>skjult</thi', 'nk> B', ' 1 < 2'].map((x) => f.push(x)).join('') + f.end();
  assert.equal(out, 'A  B 1 < 2');
});

test('ollamaPost: 400 «does not support thinking» → ett nytt forsøk uten think, modellen huskes', async () => {
  opts._resetThinkMemory();
  calls.length = 0;
  const res = await opts.ollamaPost(fakeFetch, 'http://ollama.test:11434/api/chat', opts.shortBody({ model: OLD, stream: false, messages: [] }, { user: OWNER }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.think, false);
  assert.equal('think' in calls[1].body, false);
  assert.deepEqual(opts.modelsWithoutThink(), [OLD]);
  // Neste kall: modellen er husket, så think sendes ikke i det hele tatt (ett kall).
  calls.length = 0;
  const b = opts.shortBody({ model: OLD, stream: false, messages: [] }, { user: OWNER });
  assert.equal('think' in b, false);
  await opts.ollamaPost(fakeFetch, 'http://ollama.test:11434/api/chat', b);
  assert.equal(calls.length, 1);
});

test('ollamaPost: annen 400 prøves ikke på nytt, og teksten kan fortsatt leses', async () => {
  opts._resetThinkMemory();
  let n = 0;
  const f = async () => { n++; return Response.json({ error: 'model "x" not found' }, { status: 400 }); };
  const res = await opts.ollamaPost(f, 'http://o/api/chat', { model: 'x', think: false });
  assert.equal(n, 1);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /not found/);
  assert.deepEqual(opts.modelsWithoutThink(), []);
});

/* ---------------- Korte oppgaver (Kalender · Beskriv med Glimt via /api/generate) ---------------- */

test('kort oppgave sender think:false og num_ctx, og fjerner <think> fra svaret', async () => {
  opts._resetThinkMemory();
  saveSettings({ ollamaModel: 'qwen3:8b', ollamaTextModel: 'qwen3:8b' });
  calls.length = 0;
  const r = await describe(OWNER, 'Tannlege med Ola');
  const gen = calls.filter((c) => c.url.endsWith('/api/generate'));
  assert.equal(gen.length, 1);
  assert.equal(gen[0].body.think, false);
  assert.equal(gen[0].body.options.num_ctx, 4096);
  assert.equal(gen[0].body.options.temperature, 0);
  assert.equal(r.engine, 'ollama', 'svaret ble tolket etter at <think> ble fjernet');
  assert.equal(r.event.date, '2026-10-21');
  assert.equal(r.event.title, 'Tannlege');
});

test('kort oppgave: ai_think på → think sendes ikke', async () => {
  setUserCfg(OWNER, { ai_think: '1' });
  calls.length = 0;
  await describe(OWNER, 'Tannlege med Ola');
  const gen = calls.find((c) => c.url.endsWith('/api/generate'));
  assert.equal('think' in gen.body, false);
  assert.equal(gen.body.options.num_ctx, 4096);
  setUserCfg(OWNER, { ai_think: '0' });
});

test('kort oppgave med modell uten tenking: nytt forsøk uten think', async () => {
  opts._resetThinkMemory();
  saveSettings({ ollamaTextModel: OLD });
  calls.length = 0;
  await describe(OWNER, 'Tannlege med Ola');
  const gen = calls.filter((c) => c.url.endsWith('/api/generate'));
  assert.equal(gen.length, 2);
  assert.equal(gen[0].body.think, false);
  assert.equal('think' in gen[1].body, false);
  assert.ok(opts.modelsWithoutThink().includes(OLD));
  saveSettings({ ollamaTextModel: 'qwen3:8b' });
});

/* ---------------- Chat ---------------- */

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const cookie = await login('sebastian', 'testpassord1');
const S = async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* SSE */ }
  return { status: r.status, body: json, text };
};
const deltas = (text) => text.split(/\n\n+/).filter((b) => /^event: delta$/m.test(b)).map((b) => JSON.parse(b.match(/^data: (.*)$/m)[1]).text).join('');
const lastChatBody = () => calls.filter((c) => c.url.endsWith('/api/chat')).at(-1).body;

test('Chat: think av som standard → think:false, og <think> vises aldri', async () => {
  opts._resetThinkMemory();
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: 'qwen3:8b', messages: [{ role: 'user', content: 'Hei' }] });
  assert.equal(r.status, 200, r.text);
  assert.equal(lastChatBody().think, false);
  assert.equal(deltas(r.text), 'Hei der.');
  const chatId = JSON.parse(r.text.match(/^data: (.*)$/m)[1]).chatId;
  const got = await S(`/api/chat/chats/${chatId}`);
  assert.equal(got.body.settings.think, false);
  assert.equal(got.body.messages.at(-1).content, 'Hei der.');
});

test('Chat: samtaleinnstillingen think på → think:true, og den lagres', async () => {
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: 'qwen3:8b', settings: { think: true }, messages: [{ role: 'user', content: 'Tenk deg om' }] });
  assert.equal(r.status, 200, r.text);
  assert.equal(lastChatBody().think, true);
  const chatId = JSON.parse(r.text.match(/^data: (.*)$/m)[1]).chatId;
  assert.equal((await S(`/api/chat/chats/${chatId}`)).body.settings.think, true);
  // Neste melding i samme samtale bruker den lagrede innstillingen.
  calls.length = 0;
  await S('/api/chat/send', 'POST', { chatId, model: 'qwen3:8b', messages: [{ role: 'user', content: 'Tenk deg om' }, { role: 'assistant', content: 'Hei der.' }, { role: 'user', content: 'Igjen' }] });
  assert.equal(lastChatBody().think, true);
  // Slås av med PATCH som de andre samtaleinnstillingene.
  assert.equal((await S(`/api/chat/chats/${chatId}`, 'PATCH', { settings: { think: false } })).status, 200);
  assert.equal((await S(`/api/chat/chats/${chatId}`)).body.settings.think, false);
});

test('Chat: modell uten tenking → nytt forsøk uten think', async () => {
  opts._resetThinkMemory();
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: OLD, messages: [{ role: 'user', content: 'Hei' }] });
  assert.equal(r.status, 200, r.text);
  const sent = calls.filter((c) => c.url.endsWith('/api/chat'));
  assert.equal(sent.length, 2);
  assert.equal(sent[0].body.think, false);
  assert.equal('think' in sent[1].body, false);
  assert.equal(deltas(r.text), 'Hei der.');
});

test('ai_think finnes som personlig innstilling, av som standard', async () => {
  const { userBool, publicConfig } = await import('../server/settings.js');
  assert.equal(userBool('ukjent-bruker', 'ai_think'), false);
  const f = publicConfig().flatMap((g) => g.fields).find((x) => x.key === 'ai_think');
  assert.ok(f, 'ai_think i SCHEMA');
  assert.match(f.label, /La modellen tenke før den svarer/);
});
