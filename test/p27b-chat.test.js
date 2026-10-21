// Prompt 27 (SERVER-B): Chat (/api/chat) med og uten Open WebUI. Alt eksternt er mocket (injiserbar fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p27b-chat-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.GEMINI_API_KEY = 'gemini-test-key';
delete process.env.GROQ_API_KEY;
delete process.env.MOCK_DATA;
delete process.env.OPENWEBUI_URL;
delete process.env.OPENWEBUI_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Falsk nett: Ollama, Gemini og Open WebUI. Alle kall lagres.
const calls = [];
const owuiUp = { on: true };
const enc = (s) => new TextEncoder().encode(s);
const streamOf = (chunks) => new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc(x)); c.close(); } });
async function mockFetch(url, init = {}) {
  const u = String(url);
  let body = null;
  if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } } else if (init.body) body = init.body;
  calls.push({ url: u, method: init.method ?? 'GET', headers: init.headers ?? {}, body });
  if (u === 'http://ollama.test:11434/api/tags') return Response.json({ models: [{ name: 'qwen3:8b', size: 5.2e9, details: { families: ['qwen3'] } }, { name: 'qwen2.5vl:7b', size: 6e9, details: { families: ['qwen25vl', 'clip'] } }, { name: 'nomic-embed-text:latest', size: 3e8 }] });
  if (u === 'http://ollama.test:11434/api/chat') {
    const lines = [{ message: { content: 'Hei! ' } }, { message: { content: 'Dette er ' } }, { message: { content: 'Ollama.' } }, { done: true, eval_count: 30, eval_duration: 1.5e9 }];
    return new Response(streamOf(lines.map((l) => JSON.stringify(l) + '\n')), { status: 200 });
  }
  if (u === 'http://ollama.test:11434/api/pull') return new Response(streamOf([{ status: 'pulling manifest' }, { status: 'pulling', total: 100, completed: 50 }, { status: 'success' }].map((l) => JSON.stringify(l) + '\n')));
  if (u.startsWith('https://generativelanguage.googleapis.com/') && u.includes(':streamGenerateContent')) {
    const ev = (t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\r\n\r\n`;
    return new Response(streamOf([ev('Du brukte '), ev('mest på mat.'), `data: ${JSON.stringify({ candidates: [{ content: { parts: [] } }], usageMetadata: { candidatesTokenCount: 8 } })}\r\n\r\n`]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }
  if (u.startsWith('http://owui.test')) {
    if (!owuiUp.on) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (u === 'http://owui.test/api/models') return Response.json({ data: [{ id: 'qwen3:8b', name: 'qwen3:8b', owned_by: 'ollama', ollama: { size: 5.2e9 } }, { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', owned_by: 'openai' }] });
    if (u === 'http://owui.test/api/chat/completions') {
      const ev = (d) => `data: ${JSON.stringify(d)}\n\n`;
      return new Response(streamOf([ev({ choices: [{ delta: { content: 'Svar fra ' } }] }), ev({ choices: [{ delta: { content: 'Open WebUI.' } }] }), ev({ choices: [{ delta: {} }], usage: { completion_tokens: 6, 'response_token/s': 42.5 } }), 'data: [DONE]\n\n']));
    }
    if (u === 'http://owui.test/api/v1/audio/transcriptions') return Response.json({ text: ' Hvor mye brukte jeg i går? ' });
    if (u === 'http://owui.test/api/v1/files/') return Response.json({ id: 'owui-file-1' });
    if (u === 'http://owui.test/api/v1/knowledge/') return Response.json([{ id: 'kb1', name: 'Husleiekontrakter', description: 'PDF-er' }]);
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = mockFetch; // Gemini går via geminiFetch (global fetch)
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const chat = await import('../server/chat.js');
chat._setChatFetch(mockFetch);
const { auditList } = await import('../server/finans/ai-audit.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body, headers = {}) => {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { cookie, ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...headers }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* SSE eller tekst */ }
  return { status: r.status, body: json, text, headers: r.headers };
};
const sse = (text) => text.split(/\n\n+/).filter(Boolean).map((blk) => {
  const ev = blk.match(/^event: (.+)$/m)?.[1] ?? 'message', data = blk.match(/^data: (.*)$/m)?.[1];
  return { event: ev, data: data ? JSON.parse(data) : null };
});
const S = client(await login('sebastian', 'testpassord1'));
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));

test('Chat krever innlogging', async () => {
  assert.equal((await app.request('/api/chat/models')).status, 401);
  assert.equal((await app.request('/api/chat/chats')).status, 401);
});

test('uten Open WebUI: modeller fra Ollama (installert + katalog) og Gemini som sky', async () => {
  const r = await S('/api/chat/models');
  assert.equal(r.status, 200);
  const { models } = r.body;
  const q3 = models.find((m) => m.id === 'qwen3:8b');
  assert.deepEqual({ kind: q3.kind, provider: q3.provider, installed: q3.installed, vision: q3.vision }, { kind: 'lokal', provider: 'ollama', installed: true, vision: false });
  assert.equal(models.find((m) => m.id === 'qwen2.5vl:7b').vision, true);
  assert.ok(!models.some((m) => /embed/.test(m.id)), 'embedding-modeller vises ikke');
  assert.ok(models.some((m) => m.installed === false && m.provider === 'ollama'), 'katalogen gir modeller som kan hentes');
  const g = models.find((m) => m.id === 'gemini:gemini-2.5-flash');
  assert.deepEqual({ kind: g.kind, provider: g.provider, name: g.name }, { kind: 'sky', provider: 'gemini', name: 'Gemini 2.5 Flash' });
  assert.equal(r.body.default, 'qwen3:8b');
  assert.equal(r.body.openwebui, false);
});

let chatId;
test('send med lokal modell: SSE meta → delta → done, lagres per bruker', async () => {
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: 'qwen3:8b', messages: [{ role: 'user', content: 'Hei, hva kan du?' }], settings: { persona: 'homelab', temperature: 0.3 } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const evs = sse(r.text);
  assert.equal(evs[0].event, 'meta');
  chatId = evs[0].data.chatId;
  assert.ok(chatId);
  assert.equal(evs.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), 'Hei! Dette er Ollama.');
  const done = evs.find((e) => e.event === 'done').data;
  assert.equal(done.tokensPerSec, 20); // 30 tokens / 1,5 s
  assert.ok(Number.isFinite(done.ms));
  assert.deepEqual(done.used, []);
  const body = calls.find((x) => x.url.endsWith('/api/chat')).body;
  assert.equal(body.model, 'qwen3:8b');
  assert.equal(body.stream, true);
  assert.equal(body.options.temperature, 0.3);
  assert.match(body.messages[0].content, /homelab/i);
  assert.match(body.messages[0].content, /norsk bokmål/);
  const got = await S(`/api/chat/chats/${chatId}`);
  assert.equal(got.body.messages.length, 2);
  assert.equal(got.body.messages[1].content, 'Hei! Dette er Ollama.');
  assert.equal(got.body.messages[1].meta.tokensPerSec, 20);
  assert.equal(got.body.settings.persona, 'homelab');
  assert.equal(got.body.title, 'Hei, hva kan du?');
  // Kari ser ingenting av dette.
  assert.equal((await K(`/api/chat/chats/${chatId}`)).status, 404);
  // Prompt 34: systemmappen «Kvitteringer og skanninger» finnes alltid (tom her).
  { const b = (await K('/api/chat/chats')).body; assert.deepEqual({ ...b, folders: b.folders.filter((f) => !f.sys) }, { pinned: [], folders: [], chats: [] }); assert.equal(b.folders[0].name, 'Kvitteringer og skanninger'); }
  assert.equal((await K('/api/chat/send', 'POST', { chatId, model: 'qwen3:8b', messages: [{ role: 'user', content: 'x' }] })).status, 404);
});

test('fortsettelse og Rediger (editFrom) bygger på lagret historikk', async () => {
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { chatId, model: 'qwen3:8b', messages: [{ role: 'user', content: 'Og Docker?' }] });
  assert.equal(r.status, 200);
  const msgs = calls.find((x) => x.url.endsWith('/api/chat')).body.messages;
  assert.deepEqual(msgs.slice(1).map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal((await S(`/api/chat/chats/${chatId}`)).body.messages.length, 4);
  // Rediger første melding: alt fra indeks 0 byttes ut.
  calls.length = 0;
  await S('/api/chat/send', 'POST', { chatId, model: 'qwen3:8b', editFrom: 0, messages: [{ role: 'user', content: 'Hei på nytt' }] });
  const m2 = calls.find((x) => x.url.endsWith('/api/chat')).body.messages;
  assert.deepEqual(m2.slice(1).map((m) => m.content.replace(/ \/no_think$/, '')), ['Hei på nytt']); // qwen3 får «/no_think» (tenking av)
  const after = (await S(`/api/chat/chats/${chatId}`)).body.messages;
  assert.deepEqual(after.map((m) => m.role), ['user', 'assistant']);
});

test('sky-modell: 409 needsConfirm bare når mine data/vedlegg er med, og «Ikke spør igjen» lagres på samtalen', async () => {
  const today = new Date().toLocaleDateString('sv-SE');
  assert.equal((await S('/finans/api/transactions', 'POST', { date: today, amount: -245.5, description: 'Kiwi Majorstuen' })).status, 200);
  // Mine data av i innstillingene → ingenting forlater serveren, ingen spørsmål. (Prompt 41: på som standard, så slås av først.)
  assert.equal((await S('/api/chat/settings')).body.chat_my_data, true, 'prompt 41: på som standard');
  assert.equal((await S('/api/chat/settings', 'PATCH', { chat_my_data: false })).body.chat_my_data, false);
  calls.length = 0;
  let r = await S('/api/chat/send', 'POST', { model: 'gemini:gemini-2.5-flash', myData: true, messages: [{ role: 'user', content: 'Hva brukte jeg mest på?' }] });
  assert.equal(r.status, 200, r.text);
  assert.doesNotMatch(JSON.stringify(calls.find((x) => x.url.includes('generativelanguage')).body), /Finans siste/);
  // Slå på «Chat kan lese mine data» (personlig) → nå spørres det før sky.
  assert.equal((await S('/api/chat/settings', 'PATCH', { chat_my_data: true })).body.chat_my_data, true);
  assert.equal((await K('/api/chat/settings', 'PATCH', { chat_my_data: false })).body.chat_my_data, false);
  assert.equal((await S('/api/chat/settings')).body.chat_my_data, true, 'per bruker');
  r = await S('/api/chat/send', 'POST', { model: 'gemini:gemini-2.5-flash', myData: true, messages: [{ role: 'user', content: 'Hva brukte jeg mest på?' }] });
  assert.equal(r.status, 409);
  assert.equal(r.body.needsConfirm, true);
  assert.equal(r.body.model, 'Gemini 2.5 Flash');
  assert.ok(r.body.leaves.includes('Sammendrag av Finans (siste 30 dager)'));
  // Lokal modell spør aldri.
  assert.equal((await S('/api/chat/send', 'POST', { model: 'qwen3:8b', myData: true, messages: [{ role: 'user', content: 'Hva brukte jeg?' }] })).status, 200);
  // Send uten mine data → ingen spørsmål.
  assert.equal((await S('/api/chat/send', 'POST', { model: 'gemini:gemini-2.5-flash', myData: true, withoutMyData: true, messages: [{ role: 'user', content: 'Hei' }] })).status, 200);
  // Bekreftet + «Ikke spør igjen i denne samtalen».
  calls.length = 0;
  r = await S('/api/chat/send', 'POST', { model: 'gemini:gemini-2.5-flash', myData: true, confirmCloud: true, settings: { skipCloudAsk: true }, messages: [{ role: 'user', content: 'Hva brukte jeg mest på?' }] });
  assert.equal(r.status, 200);
  const evs = sse(r.text);
  const id = evs[0].data.chatId;
  assert.equal(evs.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), 'Du brukte mest på mat.');
  assert.deepEqual(evs.find((e) => e.event === 'done').data.used.slice(0, 1), ['Finans']);
  const g = calls.find((x) => x.url.includes(':streamGenerateContent'));
  assert.equal(g.headers['x-goog-api-key'], 'gemini-test-key');
  assert.match(g.body.systemInstruction.parts[0].text, /Finans siste 30 dager/);
  assert.equal((await S(`/api/chat/chats/${id}`)).body.settings.skipCloudAsk, true);
  r = await S('/api/chat/send', 'POST', { chatId: id, model: 'gemini:gemini-2.5-flash', myData: true, messages: [{ role: 'user', content: 'Og i fjor?' }] });
  assert.equal(r.status, 200, 'samtalen spør ikke igjen');
  // AI-loggen viser hva som ble sendt til sky.
  const log = auditList('owner');
  assert.ok(log.some((x) => x.purpose === 'chat' && x.engine === 'gemini' && x.fieldsSent.mineData.includes('finans')));
});

test('vedlegg til sky utløser også spørsmålet; mine data-sammendraget er per bruker', async () => {
  const fd = new FormData();
  fd.append('file', new File(['Husleie: 9500 kr per måned'], 'kontrakt.txt', { type: 'text/plain' }));
  const up = await S('/api/chat/files', 'POST', fd);
  assert.equal(up.status, 200, up.text);
  assert.equal(up.body.name, 'kontrakt.txt');
  const r = await S('/api/chat/send', 'POST', { model: 'gemini:gemini-2.5-flash', files: [up.body.id], messages: [{ role: 'user', content: 'Hva er husleien?' }] });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.leaves, ['Vedlegg: kontrakt.txt']);
  // Kari kan ikke bruke Sebastians fil.
  calls.length = 0;
  await K('/api/chat/send', 'POST', { model: 'qwen3:8b', files: [up.body.id], messages: [{ role: 'user', content: 'Hva står det?' }] });
  assert.doesNotMatch(JSON.stringify(calls.find((x) => x.url.endsWith('/api/chat')).body), /9500/);
  const md = await S('/api/chat/mydata');
  assert.deepEqual(Object.keys(md.body), ['finans', 'kalender', 'huske']);
  assert.ok((await S('/api/chat/knowledge')).body.some((k) => k.name === 'kontrakt.txt'));
  assert.ok(!(await K('/api/chat/knowledge')).body.some((k) => k.name === 'kontrakt.txt'));
});

test('mapper, festing, nytt navn, eksport og deling', async () => {
  const f = await S('/api/chat/folders', 'POST', { name: 'Økonomi' });
  assert.equal(f.status, 200);
  assert.equal((await K(`/api/chat/chats/${chatId}`, 'PATCH', { folderId: f.body.id })).status, 404);
  assert.equal((await S(`/api/chat/chats/${chatId}`, 'PATCH', { title: 'Docker-hjelp', folderId: f.body.id })).body.folderId, f.body.id);
  let list = (await S('/api/chat/chats')).body;
  list.folders = list.folders.filter((x) => !x.sys); // prompt 34: systemmappen står først
  assert.equal(list.folders[0].name, 'Økonomi');
  assert.equal(list.folders[0].chats[0].title, 'Docker-hjelp');
  assert.ok(!list.chats.some((c) => c.id === chatId));
  await S(`/api/chat/chats/${chatId}`, 'PATCH', { pinned: true });
  list = (await S('/api/chat/chats')).body;
  assert.equal(list.pinned[0].id, chatId);
  assert.equal(list.folders[0].chats.length, 0);
  assert.equal((await S('/api/chat/chats?q=docker-hjelp')).body.pinned.length, 1);
  assert.equal((await S('/api/chat/chats?q=finnesikke')).body.pinned.length, 0);
  assert.equal((await S(`/api/chat/folders/${f.body.id}`, 'PATCH', { open: false })).body.open, false);
  const ex = await S(`/api/chat/chats/${chatId}/export`);
  assert.match(ex.headers.get('content-type'), /text\/markdown/);
  assert.match(ex.text, /^# Docker-hjelp/);
  const sh = await S(`/api/chat/chats/${chatId}/share`, 'POST');
  assert.match(sh.body.url, /\/api\/chat\/shared\/[A-Za-z0-9_-]{16,}$/);
  const pub = await app.request(new URL(sh.body.url).pathname);
  assert.equal(pub.status, 200);
  assert.match(await pub.text(), /Docker-hjelp/);
  await S(`/api/chat/folders/${f.body.id}`, 'DELETE');
  assert.equal((await S(`/api/chat/chats/${chatId}`)).body.folderId, null);
});

test('modeller: hent (SSE-fremdrift) og slett er bare for admin', async () => {
  assert.equal((await K('/api/chat/models/pull', 'POST', { name: 'qwen3:8b' })).status, 403);
  assert.equal((await K('/api/chat/models/qwen3:8b', 'DELETE')).status, 403);
  assert.equal((await S('/api/chat/models/pull', 'POST', { name: 'rm -rf /' })).status, 400);
  const r = await S('/api/chat/models/pull', 'POST', { name: 'gemma3:4b' });
  const evs = sse(r.text);
  assert.deepEqual(evs.find((e) => e.event === 'progress' && e.data.total).data, { status: 'pulling', completed: 50, total: 100 });
  assert.equal(evs.at(-1).event, 'done');
});

test('tale til tekst: 501 uten Open WebUI', async () => {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(100)], 'tale.webm', { type: 'audio/webm' }));
  assert.equal((await S('/api/chat/transcribe', 'POST', fd)).status, 501);
});

test('med Open WebUI: modeller, strøm og tale går via proxyen; nede → Ollama direkte', async () => {
  // Bare admin kan sette serveroppsettet.
  assert.equal((await K('/api/config', 'PUT', { openwebui_url: 'http://owui.test' })).status, 403);
  assert.equal((await S('/api/config', 'PUT', { openwebui_url: 'http://owui.test', openwebui_key: 'sk-owui', ai_think_direct: '0' })).status, 200);
  const integ = (await S('/api/integrations')).body;
  const ow = (Array.isArray(integ) ? integ : integ.items ?? []).find((x) => x.id === 'openwebui');
  assert.equal(ow?.scope, 'server');
  assert.equal(ow.category, 'AI');
  chat._setChatFetch(mockFetch); // tøm modell-cachen
  const m = (await S('/api/chat/models')).body;
  assert.equal(m.openwebui, true);
  assert.deepEqual(m.models.filter((x) => x.installed).map((x) => [x.id, x.kind, x.provider]), [['qwen3:8b', 'lokal', 'ollama'], ['gemini-2.5-flash', 'sky', 'gemini']]);
  calls.length = 0;
  const r = await S('/api/chat/send', 'POST', { model: 'qwen3:8b', webSearch: true, messages: [{ role: 'user', content: 'Hva er nytt?' }] });
  const evs = sse(r.text);
  assert.equal(evs.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), 'Svar fra Open WebUI.');
  const done = evs.find((e) => e.event === 'done').data;
  assert.equal(done.tokensPerSec, 42.5);
  // Prompt 44: «Nettsøk» i used bare når søket faktisk ga treff (her: ingen treff, ingen kilder fra Open WebUI).
  assert.ok(!done.used.includes('Nettsøk'));
  const c = calls.find((x) => x.url === 'http://owui.test/api/chat/completions');
  assert.equal(c.headers.Authorization, 'Bearer sk-owui');
  assert.equal(c.body.stream, true);
  assert.deepEqual(c.body.features, { web_search: true });
  assert.equal(c.body.messages[0].role, 'system');
  // Sky-modell fra Open WebUI spør også før mine data sendes.
  assert.equal((await S('/api/chat/send', 'POST', { model: 'gemini-2.5-flash', myData: true, messages: [{ role: 'user', content: 'x' }] })).status, 409);
  // Tale.
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(100)], 'tale.webm', { type: 'audio/webm' }));
  assert.deepEqual((await S('/api/chat/transcribe', 'POST', fd)).body, { text: 'Hvor mye brukte jeg i går?' });
  assert.ok((await S('/api/chat/knowledge')).body.some((k) => k.id === 'kb:kb1' && k.type === 'collection'));
  // Open WebUI nede: samme chat svarer via Ollama direkte.
  owuiUp.on = false;
  chat._setChatFetch(mockFetch);
  const r2 = await S('/api/chat/send', 'POST', { model: 'qwen3:8b', messages: [{ role: 'user', content: 'Er du der?' }] });
  assert.equal(sse(r2.text).filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), 'Hei! Dette er Ollama.');
  owuiUp.on = true;
  assert.equal((await S('/api/config', 'PUT', { openwebui_url: null, openwebui_key: null })).status, 200);
});

test('feil fra motoren gir event: error (og 400 på ugyldig forespørsel)', async () => {
  assert.equal((await S('/api/chat/send', 'POST', { model: 'qwen3:8b', messages: [] })).status, 400);
  assert.equal((await S('/api/chat/send', 'POST', { model: 'qwen3:8b', messages: [{ role: 'assistant', content: 'x' }] })).status, 400);
  const r = await S('/api/chat/send', 'POST', { model: 'groq:llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Hei' }] });
  const ev = sse(r.text).find((e) => e.event === 'error');
  assert.match(ev.data.error, /Groq-nøkkel mangler/);
});
