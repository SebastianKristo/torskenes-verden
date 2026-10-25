// Prompt 53 (FERMION53): Neutrino-1 8B og Phonon (Fermion Research) på Mac mini-en.
// Mocket: «fermion serve» er en liten falsk oppstrøm i Node (samme ruter og svarformer som fermion-research 0.2.15). Selve vakten
// (tools/fermion/guard.py) kjøres EKTE med python3 foran den falske oppstrømmen: IP-filter, nøkkel, ruter, strømming.
// Ikke kjørt ekte her: fermion serve, modellvektene (huggingface.co er blokkert), MLX på Apple silicon, install.sh/launchd (macOS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p53f-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-53fe';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4652';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
for (const k of ['FERMION_NEUTRINO_URL', 'FERMION_NEUTRINO_KEY', 'FERMION_PHONON_URL', 'FERMION_PHONON_KEY', 'FERMION_PHONON_MODEL']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); }; // ingenting annet skal ut
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const h53 = await import('../server/fermion53/health.js');
const asr = await import('../server/fermion53/asr.js');
const neu = await import('../server/fermion53/neutrino.js');
const cfg53 = await import('../server/fermion53/config.js');
h53._setFermionFetch53(realFetch); // bare Mac mini-kallene (til vakten på 127.0.0.1) får ekte nett

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
const sse = (t) => t.split('\n\n').map((b) => { const ev = b.match(/^event: (.+)$/m)?.[1]; const d = b.match(/^data: (.*)$/m)?.[1]; let data = null; try { data = JSON.parse(d); } catch { /* */ } return ev ? { event: ev, data } : null; }).filter(Boolean);

/* ---------------- Falsk «fermion serve» (oppstrøm) ---------------- */

const KEY = 'k'.repeat(16) + '0123456789abcdef0123456789abcdef'; // 48 tegn
const upCalls = [];
let chatReply = ['Hei', ' fra', ' Neutrino', '.'];
let asrStatus = 200;
function fakeUpstream(kind) {
  return createServer((rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      const body = Buffer.concat(chunks);
      upCalls.push({ kind, method: rq.method, path: rq.url, auth: rq.headers.authorization ?? null, ctype: rq.headers['content-type'], body });
      if (rq.url === '/health') return rs.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(kind === 'neutrino'
        ? { status: 'ok', model: 'Neutrino-8B', kind: 'trtc', container: '/Users/x/.cache/secret/path', backend: 'native', context: 40960, version: '0.2.15' }
        : { status: 'ok', model: 'Phonon-2.5', kind: 'speech', profile: 'five-value-25', model_dir: '/Users/x/hemmelig', version: '0.2.15' }));
      if (kind === 'neutrino' && rq.url === '/v1/chat/completions') {
        const j = JSON.parse(body.toString());
        rs.writeHead(200, { 'content-type': 'text/event-stream' }); // ingen lengde: strøm
        for (const d of chatReply) rs.write(`data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`);
        if (j.stream_options?.include_usage) rs.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: chatReply.length } })}\n\n`);
        rs.end('data: [DONE]\n\n');
        return;
      }
      if (kind === 'phonon' && rq.url === '/v1/audio/transcriptions') {
        if (asrStatus !== 200) return rs.writeHead(asrStatus, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'could not decode audio' } }));
        return rs.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: 'Hej från Phonon', task: 'transcribe', language: 'english', duration: 1.5,
          segments: [{ id: 0, start: 0, end: 1.5, text: 'Hej från Phonon' }], words: [{ word: 'Hej', start: 0.1, end: 0.4 }, { word: 'från', start: 0.5, end: 0.8 }, { word: 'Phonon', start: 0.9, end: 1.4 }] }));
      }
      rs.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"unknown route"}}');
    });
  });
}
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const freePort = () => new Promise((r) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const upN = fakeUpstream('neutrino'), upP = fakeUpstream('phonon');
const upNPort = await listen(upN), upPPort = await listen(upP);
test.after(() => { upN.close(); upP.close(); });

const hasPython = spawnSync('python3', ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)']).status === 0;
const guards = [];
async function startGuard(service, { allow = ['127.0.0.1/32'], upstream } = {}) {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'hl-p53g-'));
  const conf = join(dir, 'config.json');
  writeFileSync(conf, JSON.stringify({ bind_ip: '127.0.0.1', allow, key: KEY, services: { [service]: { port, upstream_port: upstream } } }));
  const p = spawn('python3', ['-I', 'tools/fermion/guard.py', '--config', conf, '--service', service, '--no-spawn'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = ''; p.stderr.on('data', (d) => { log += d; });
  guards.push(p);
  for (let i = 0; i < 100; i++) { // vent til den lytter
    try { await realFetch(`http://127.0.0.1:${port}/health`); break; } catch { await new Promise((r) => setTimeout(r, 50)); }
  }
  return { url: `http://127.0.0.1:${port}`, log: () => log };
}
test.after(() => { for (const g of guards) g.kill('SIGTERM'); });

let gN = null, gP = null;
if (hasPython) { gN = await startGuard('neutrino', { upstream: upNPort }); gP = await startGuard('phonon', { upstream: upPPort }); }
const NURL = () => gN?.url ?? `http://127.0.0.1:${upNPort}`;
const PURL = () => gP?.url ?? `http://127.0.0.1:${upPPort}`;

/* ---------------- Vakten (guard.py, ekte) ---------------- */

test('vakt: IP-liste + nøkkel + faste ruter; /health uten filstier; SSE strømmes gjennom', { skip: !hasPython && 'python3 ≥ 3.10 mangler' }, async () => {
  assert.equal((await realFetch(`${gN.url}/health`)).status, 401, 'uten nøkkel');
  assert.equal((await realFetch(`${gN.url}/health`, { headers: { authorization: 'Bearer feil-nøkkel-feil-nøkkel' } })).status, 401);
  const ok = await realFetch(`${gN.url}/health`, { headers: { authorization: `Bearer ${KEY}` } });
  assert.equal(ok.status, 200);
  const hj = await ok.json();
  assert.equal(hj.status, 'ok');
  assert.equal(hj.context, 40960);
  assert.ok(!JSON.stringify(hj).includes('/Users/'), 'ingen filstier fra Mac-en');
  assert.equal((await realFetch(`${gN.url}/v1/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body: 'x' })).status, 404, 'Neutrino-vakten slipper ikke inn lyd');
  assert.equal((await realFetch(`${gP.url}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body: '{}' })).status, 404, 'Phonon-vakten slipper ikke inn chat');
  assert.equal((await realFetch(`${gN.url}/admin`, { headers: { authorization: `Bearer ${KEY}` } })).status, 404);
  const r = await realFetch(`${gN.url}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hei' }], stream: true }) });
  assert.equal(r.status, 200);
  const t = await r.text();
  assert.match(t, /Neutrino/);
  assert.match(t, /\[DONE\]/);
  const last = upCalls.filter((c) => c.path === '/v1/chat/completions').at(-1);
  assert.equal(last.auth, null, 'nøkkelen sendes ikke videre til fermion serve');
  // Avsender som ikke står på lista: 403 selv med riktig nøkkel.
  const gX = await startGuard('neutrino', { allow: ['10.69.1.39/32'], upstream: upNPort });
  assert.equal((await realFetch(`${gX.url}/health`, { headers: { authorization: `Bearer ${KEY}` } })).status, 403);
  assert.ok(!gN.log().includes(KEY) && !gX.log().includes(KEY), 'nøkkelen står aldri i loggen');
  assert.ok(!gN.log().includes('Hei'), 'innholdet står aldri i loggen');
});

test('vakt: --check-config avviser 0.0.0.0, tom liste, for store nett og korte nøkler', { skip: !hasPython && 'python3 mangler' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p53c-'));
  const run = (c) => { const f = join(dir, `c${Math.random()}.json`); writeFileSync(f, JSON.stringify(c)); return spawnSync('python3', ['-I', 'tools/fermion/guard.py', '--config', f, '--service', 'neutrino', '--check-config']).status; };
  assert.equal(run({ bind_ip: '10.69.1.173', allow: ['10.69.1.39'], key: KEY }), 0);
  assert.notEqual(run({ bind_ip: '0.0.0.0', allow: ['10.69.1.39'], key: KEY }), 0);
  assert.notEqual(run({ bind_ip: '10.69.1.173', allow: [], key: KEY }), 0);
  assert.notEqual(run({ bind_ip: '10.69.1.173', allow: ['10.0.0.0/8'], key: KEY }), 0);
  assert.notEqual(run({ bind_ip: '10.69.1.173', allow: ['10.69.1.39'], key: 'kort' }), 0);
});

/* ---------------- Admin-oppsett ---------------- */

test('admin: bare admin; adresser må være i huset; nøklene sendes aldri ut', async () => {
  assert.equal((await req('/api/admin/fermion53/health')).status, 401);
  assert.equal((await I('/api/admin/fermion53/health')).status, 403);
  assert.equal((await I('/api/admin/fermion53/config', 'PUT', { neutrinoUrl: NURL(), neutrinoKey: KEY })).status, 403);
  const h0 = await A('/api/admin/fermion53/health');
  assert.equal(h0.status, 200);
  assert.equal(h0.body.neutrino.configured, false);
  assert.equal(h0.body.phonon.norwegian, false);
  for (const bad of ['https://api.example.com', 'http://8.8.8.8:8000', 'http://neutrino.trycloudflare.com', 'ftp://10.69.1.173', 'http://u:p@10.69.1.173:8000', 'http://10.69.1.173:8000/v1']) {
    const r = await A('/api/admin/fermion53/config', 'PUT', { neutrinoUrl: bad });
    assert.equal(r.status, 400, bad);
  }
  assert.equal((await A('/api/admin/fermion53/config', 'PUT', { neutrinoKey: 'kort' })).status, 400);
  assert.equal((await A('/api/admin/fermion53/config', 'PUT', { phononModel: 'whisper' })).status, 400);
  assert.equal(cfg53.inHouseUrl53('http://10.69.1.173:8000/').url, 'http://10.69.1.173:8000');
  assert.ok(cfg53.inHouseUrl53('http://macmini.local:8000').ok);
  const r = await A('/api/admin/fermion53/config', 'PUT', { neutrinoUrl: NURL(), neutrinoKey: KEY, phononUrl: PURL(), phononKey: KEY, phononModel: 'phonon-2.5' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.neutrinoKeySet, true);
  assert.ok(!r.text.includes(KEY));
  const g = await A('/api/admin/fermion53/config');
  assert.ok(!g.text.includes(KEY), 'nøkkelen sendes aldri til klienten');
  assert.equal(g.body.neutrinoUrl, NURL());
  const { kv, OWNER } = await import('../server/db.js');
  assert.ok(!JSON.stringify(kv.get(OWNER, 'fermion53', {})).includes(KEY), 'nøkkelen lagres kryptert');
});

test('flagg: fermion_neutrino53 og fermion_phonon53 er PÅ som standard (kontrakt 53)', async () => {
  const f = await I('/api/flags');
  assert.equal(f.body.flags.fermion_neutrino53, true);
  assert.equal(f.body.flags.fermion_phonon53, true);
});

/* ---------------- Neutrino i modellvalget og Chat ---------------- */

test('modellvalg: neutrino:8b vises bare når den svarer (bufret – listen venter aldri på Mac-en), aldri som standard', async () => {
  h53.reset53();
  let m = await I('/api/chat/models');
  assert.ok(!m.body.models.some((x) => x.id === 'neutrino:8b'), 'ikke før helsesjekken har svart');
  const h = await A('/api/admin/fermion53/health?fresh=1');
  assert.equal(h.body.neutrino.ok, true, JSON.stringify(h.body.neutrino));
  assert.equal(h.body.neutrino.status, 'ok');
  assert.equal(h.body.phonon.ok, true);
  assert.equal(h.body.phonon.model, 'phonon-2.5');
  m = await I('/api/chat/models');
  const n = m.body.models.find((x) => x.id === 'neutrino:8b');
  assert.ok(n, JSON.stringify(m.body.models.map((x) => x.id)));
  assert.equal(n.kind, 'lokal');
  assert.equal(n.provider, 'fermion');
  assert.equal(n.vision, false);
  assert.notEqual(m.body.default, 'neutrino:8b');
  const ai = await A('/api/ai/models');
  assert.ok(ai.body.external.some((x) => x.id === 'neutrino:8b' && x.ok && x.provider === 'fermion'), JSON.stringify(ai.body.external));
  assert.ok(ai.body.external.some((x) => x.kind === 'tale'));
  assert.ok(!ai.body.cloud.some((x) => x.id === 'neutrino:8b'), 'ikke i sky-/rutingslisten');
  // Flagget av (admin) → borte fra modellvalget.
  assert.equal((await A('/api/admin/flags51/fermion_neutrino53', 'PATCH', { default: false })).status, 200);
  m = await I('/api/chat/models');
  assert.ok(!m.body.models.some((x) => x.id === 'neutrino:8b'));
  assert.equal((await A('/api/admin/flags51/fermion_neutrino53', 'PATCH', { default: true })).status, 200);
});

test('chat: neutrino:8b strømmer via AI-gaten → vakten → fermion serve (OpenAI SSE), aldri Open WebUI/sky', async () => {
  await h53.probe53('neutrino');
  upCalls.length = 0;
  chatReply = ['Hei', ' fra', ' Neutrino', '.'];
  const r = await I('/api/chat/send', 'POST', { model: 'neutrino:8b', messages: [{ role: 'user', content: 'Si hei' }] });
  assert.equal(r.status, 200, r.text);
  const ev = sse(r.text);
  const done = ev.find((e) => e.event === 'done')?.data;
  assert.ok(done, r.text.slice(0, 600));
  const text = ev.filter((e) => e.event === 'delta' || e.event === 'token').map((e) => e.data?.text ?? e.data?.delta ?? e.data?.t ?? '').join('');
  const call = upCalls.find((c) => c.path === '/v1/chat/completions');
  assert.ok(call, 'kallet kom fram til fermion serve');
  const body = JSON.parse(call.body.toString());
  assert.equal(body.stream, true);
  assert.equal(body.messages.at(-1).content, 'Si hei');
  assert.equal(body.messages[0].role, 'system');
  assert.ok(body.max_tokens <= 4096);
  const c = await I(`/api/chat/chats/${done.chatId}`);
  const ans = c.body.messages.at(-1);
  assert.equal(ans.role, 'assistant');
  assert.equal(ans.content, 'Hei fra Neutrino.', text);
});

test('backend: bilder til Neutrino avvises med norsk tekst; <think> går aldri i svaret', async () => {
  await assert.rejects(() => neu.neutrinoChatStream53('neutrino:8b', 'sys', [{ role: 'user', content: 'se', images: ['iVBOR'] }], {}, { onDelta: async () => {} }), /leser ikke bilder/);
  chatReply = ['<think>', 'hemmelig resonnering', '</think>', 'Svaret', '.'];
  let out = '', th = '';
  await neu.neutrinoChatStream53('neutrino:8b', 'sys', [{ role: 'user', content: 'Hei' }], {}, { onDelta: async (d) => { out += d; }, onThink: async (t) => { th += t; } });
  assert.equal(out, 'Svaret.');
  assert.match(th, /hemmelig/);
  chatReply = ['Hei', ' fra', ' Neutrino', '.'];
  assert.equal(neu.isNeutrino53('neutrino:8b'), true);
  assert.equal(neu.isNeutrino53('qwen3:8b'), false);
});

test('admin-test: kort ekte generering via gaten (mocket oppstrøm)', async () => {
  const t = await A('/api/admin/fermion53/test', 'POST', { service: 'neutrino' });
  assert.equal(t.status, 200);
  assert.equal(t.body.ok, true, JSON.stringify(t.body));
  assert.match(t.body.text, /Neutrino/);
  const p = await A('/api/admin/fermion53/test', 'POST', { service: 'phonon' });
  assert.equal(p.body.ok, true, JSON.stringify(p.body));
  assert.equal((await A('/api/admin/fermion53/test', 'POST', { service: 'x' })).status, 400);
});

/* ---------------- Phonon (ASR-backend for DAL53) ---------------- */

test('phonon: grensesnittet til DAL53, ordtider i sekunder, norsk støttes ikke', async () => {
  await h53.probe53('phonon');
  const P = asr.phononAsr53;
  assert.equal(P.name, 'phonon');
  assert.equal(P.configured(), true);
  assert.equal(P.ready(), true);
  assert.equal(P.model(), 'phonon-2.5');
  assert.equal(P.languages().length, 25);
  for (const l of ['nb', 'nn', 'no', 'nb-NO']) assert.equal(P.supports(l), false, l);
  for (const l of ['sv', 'da', 'en', 'en-US', null, '']) assert.equal(P.supports(l), true, String(l));
  upCalls.length = 0;
  const r = await P.transcribe(asr.silenceWav53(0.5), { language: 'sv', hotwords: ['Glimt', 'Torskenes'] });
  assert.equal(r.text, 'Hej från Phonon');
  assert.equal(r.engine, 'phonon');
  assert.deepEqual(r.words[0], { word: 'Hej', start: 0.1, end: 0.4 });
  assert.equal(r.segments.length, 1);
  assert.equal(r.duration, 1.5);
  assert.equal(r.language, 'sv');
  const call = upCalls.find((c) => c.path === '/v1/audio/transcriptions');
  assert.match(call.ctype, /^multipart\/form-data/);
  const raw = call.body.toString('latin1');
  assert.match(raw, /name="response_format"\r\n\r\nverbose_json/);
  assert.match(raw, /name="timestamp_granularities\[\]"\r\n\r\nword/);
  assert.match(raw, /Torskenes/);
  await assert.rejects(() => P.transcribe(asr.silenceWav53(0.2), { language: 'nb' }), (e) => e.code === 'unsupported_language' && e.status === 422 && /norsk/.test(e.message));
  asrStatus = 400;
  await assert.rejects(() => P.transcribe(asr.silenceWav53(0.2)), (e) => e.code === 'bad_audio');
  asrStatus = 200;
  await assert.rejects(() => P.transcribe(Buffer.alloc(0)), (e) => e.code === 'bad_audio');
});

test('stille reserve: nede/ikke satt opp → ikke i listen, tydelige feilkoder, ingen krasj', async () => {
  // Feil nøkkel: vakten svarer 401 → status «auth», ikke klar.
  assert.equal((await A('/api/admin/fermion53/config', 'PUT', { phononKey: 'x'.repeat(40) })).status, 200);
  const h = await A('/api/admin/fermion53/health?fresh=1');
  if (hasPython) assert.equal(h.body.phonon.status, 'auth');
  assert.equal(asr.phononAsr53.ready(), false);
  if (hasPython) await assert.rejects(() => asr.phononAsr53.transcribe(asr.silenceWav53(0.2)), (e) => e.code === 'auth');
  // Ikke satt opp.
  assert.equal((await A('/api/admin/fermion53/config', 'PUT', { phononUrl: '' })).status, 200);
  await assert.rejects(() => asr.phononAsr53.transcribe(asr.silenceWav53(0.2)), (e) => e.code === 'not_configured' && e.status === 503);
  // Neutrino nede (oppstrøm uten lytter) → borte fra modellvalget etter sjekken, og chat gir norsk feil i stedet for å krasje.
  const dead = await freePort();
  assert.equal((await A('/api/admin/fermion53/config', 'PUT', { neutrinoUrl: `http://127.0.0.1:${dead}` })).status, 200);
  await h53.probe53('neutrino');
  const m = await I('/api/chat/models');
  assert.ok(!m.body.models.some((x) => x.id === 'neutrino:8b'));
  const r = await I('/api/chat/send', 'POST', { model: 'neutrino:8b', messages: [{ role: 'user', content: 'Hei' }] });
  assert.ok(r.status === 200 || r.status >= 400);
  assert.ok(!/ECONNREFUSED.*Ollama|Ollama svarte 404/.test(r.text), r.text.slice(0, 400));
  assert.match(r.text, /Neutrino/);
  // Gjenopprett.
  assert.equal((await A('/api/admin/fermion53/config', 'PUT', { neutrinoUrl: NURL(), phononUrl: PURL(), phononKey: KEY })).status, 200);
});
