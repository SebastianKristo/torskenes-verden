// Prompt 57 (VOX57): VoxCPM2 på Mac mini-en – motor «voxcpm» i POST /api/tts, stemmer per bruker (/api/voices57), kloning med
// samtykke, sletting (også Mac-cachen), reserve når Mac-en ikke svarer, admin-oppsett (nøkkel kryptert, bare interne adresser).
// Mocket: VoxCPM-tjenesten er en liten falsk HTTP-tjeneste i Node (samme ruter og svarformer som tools/voxcpm/voxcpm_service.py).
// Når python3 finnes, kjøres i tillegg den EKTE tjenesten (voxcpm_service.py med testmotoren, VOXCPM_ALLOW_FAKE=1) ende til ende.
// Ikke kjørt ekte her: VoxCPM2-vektene (huggingface.co er blokkert), llama.cpp-omni/Metal, PyTorch/MPS, install.sh/launchd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p57vx-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-57vx';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4671';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
for (const k of ['VOXCPM_URL', 'VOXCPM_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'AZURE_SPEECH_KEY']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); }; // ingenting annet skal ut
test.after(() => { globalThis.fetch = realFetch; });

const logged = [];
for (const k of ['log', 'info', 'warn', 'error']) { const o = console[k]; console[k] = (...a) => { logged.push(a.map(String).join(' ')); o(...a); }; }

const { default: app } = await import('../server/index.js');
const H = await import('../server/voxcpm57/health.js');
const V = await import('../server/voxcpm57/voices.js');
H._setVxFetch57(realFetch); // bare kallene til «Mac mini-en» (127.0.0.1) får ekte nett

let ipN = 70;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* lyd */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const responses = [];
const as = (ck) => async (path, method = 'GET', body, headers = {}) => { const r = await req(path, { method, headers: { cookie: ck, ...headers }, body }); if (r.body) responses.push(r.text); return r; };
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
// Prompt 59: /api/tts venter aldri på VoxCPM (for treg på Mac mini-en). Første gang: rask reserve, og lyden lages i bakgrunnen
// (nyheter lages ikke i bakgrunnen – de forhåndslages ikke, så her lages lyden direkte med speak() uten «live»).
const G57 = await import('../server/glimt35.js');
const vxIdle = async () => { for (let i = 0; i < 800 && (V.vxQueueState57().running || V.vxQueueState57().waiting); i++) await new Promise((r) => setTimeout(r, 25)); };
const ingridId = async () => { const l = (await A('/api/users')).body; return (Array.isArray(l) ? l : l?.users ?? []).find((x) => x.username === 'ingrid')?.id; };
async function ttsVx(body) {
  let r = await I('/api/tts', 'POST', body);
  if (r.status !== 200 || r.headers.get('x-tts-engine') !== 'voxcpm') {
    if (body.purpose === 'news') await G57.speak(await ingridId(), { ...body }); else await vxIdle();
    r = await I('/api/tts', 'POST', body);
  }
  return r;
}

/* ---------------- lyd ---------------- */

function toneWav(seconds, rate = 16000) {
  const n = Math.round(seconds * rate), pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 220 * i) / rate)), i * 2);
  return V.wavOf57(pcm, rate);
}
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
if (!HAS_FFMPEG) V._setRefConverter57((buf) => buf.subarray(44)); // uten ffmpeg: testopptakene er allerede 16 kHz mono WAV
const cloneForm = (fields, wav = toneWav(8)) => {
  const fd = new FormData();
  if (wav) fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'opptak.wav');
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};

/* ---------------- Falsk VoxCPM-tjeneste (Mac mini-en) ---------------- */

const KEY = 'v'.repeat(16) + 'c57c57c57c57c57c57c57c57c57c57c5'; // 48 tegn
const calls = [];
const refs = new Map();
let speechStatus = 200;
const MP3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
const fake = createServer((rq, rs) => {
  const chunks = [];
  rq.on('data', (c) => chunks.push(c));
  rq.on('end', () => {
    const body = Buffer.concat(chunks);
    const send = (st, j) => rs.writeHead(st, { 'content-type': 'application/json' }).end(JSON.stringify(j));
    if (rq.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: 'mangler eller feil nøkkel', code: 'invalid_api_key' } });
    const call = { method: rq.method, path: rq.url };
    calls.push(call);
    if (rq.method === 'GET' && rq.url === '/health') return send(200, { status: 'ok', service: 'voxcpm', model: 'VoxCPM2', engine: 'gguf', quant: 'Q8_0', device: 'metal', loaded: false, idle_unload_min: 10, memory: { peak_rss_mb: 40, model_estimate_mb: 0 }, refs: refs.size, version: '57.1' });
    const m = rq.url.match(/^\/v1\/refs\/([0-9a-f]{64})$/);
    if (m) {
      if (rq.method === 'PUT') { assert.equal(createHash('sha256').update(body).digest('hex'), m[1], 'hashen er av innholdet'); assert.equal(body.subarray(0, 4).toString(), 'RIFF'); const had = refs.has(m[1]); refs.set(m[1], body); return send(had ? 200 : 201, { ok: true }); }
      if (rq.method === 'HEAD') return rs.writeHead(refs.has(m[1]) ? 200 : 404).end();
      if (rq.method === 'DELETE') { const had = refs.delete(m[1]); return had ? rs.writeHead(204).end() : send(404, { error: { code: 'not_found' } }); }
    }
    if (rq.method === 'POST' && rq.url === '/v1/audio/speech') {
      const j = JSON.parse(body.toString('utf8'));
      call.json = j;
      if (speechStatus !== 200) return send(speechStatus, { error: { message: 'feil', code: 'error' } });
      if (j.voice?.kind === 'clone' && !refs.has(j.voice.ref_sha)) return send(404, { error: { message: 'mangler', code: 'ref_missing' } });
      return rs.writeHead(200, { 'content-type': 'audio/mpeg', 'x-ai-generated': 'VoxCPM2' }).end(MP3);
    }
    send(404, { error: { message: 'ukjent rute' } });
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const VX_URL = `http://127.0.0.1:${fake.address().port}`;
test.after(() => fake.close());
const lastSpeech = () => [...calls].reverse().find((c) => c.path === '/v1/audio/speech');
const useVx = async (url = VX_URL) => { assert.equal((await A('/api/admin/voxcpm57/config', 'PUT', { url, key: KEY })).status, 200); await H.probeVx57(); assert.ok(H.vxReady57(), 'VoxCPM svarer'); };

/* ---------------- Tester ---------------- */

test('uten oppsett: motoren finnes, men er ikke klar; ferdige stemmer listes; /api/tts gir 503 med nettleser-reserve', async () => {
  const s = await I('/api/glimt/settings');
  const e = s.body.engines.find((x) => x.id === 'voxcpm');
  assert.ok(e, 'motoren voxcpm i engines');
  assert.equal(e.name, 'VoxCPM2 (Mac mini, lokal)');
  assert.equal(e.ready, false);
  assert.equal(e.keySet, false);
  assert.equal(s.body.tts.newsVoice, null, 'nyhetsleseren bruker Glimt-stemmen som standard');
  const v = await I('/api/voices57');
  assert.equal(v.status, 200);
  assert.equal(v.body.engineReady, false);
  assert.deepEqual(v.body.voices.filter((x) => x.kind === 'builtin').map((x) => x.id), ['vx-nora', 'vx-henrik', 'vx-lys', 'vx-nyhet']);
  assert.match(v.body.consentText, /egen stemme.*samtykke/);
  assert.ok(v.body.sampleText.length > 100);
  assert.equal(v.body.limits.minSeconds, 5);
  const t = await I('/api/tts', 'POST', { text: 'Hei', voice: 'vx-nora' });
  assert.equal(t.status, 503);
  assert.equal(t.body.fallback, 'browser');
  assert.equal((await I('/api/voices57/vx-nora/preview', 'POST', {})).status, 503);
  assert.equal((await req('/api/voices57')).status, 401);
});

test('admin: bare admin, bare interne adresser, nøkkelen kryptert og aldri ut', async () => {
  assert.equal((await I('/api/admin/voxcpm57/config', 'PUT', { url: VX_URL, key: KEY })).status, 403);
  assert.equal((await I('/api/admin/voxcpm57/health')).status, 403);
  for (const url of ['http://8.8.8.8:8030', 'https://voxcpm.example.com', 'http://10.69.1.173:8030/v1', 'http://u:p@10.69.1.173:8030']) {
    const r = await A('/api/admin/voxcpm57/config', 'PUT', { url, key: KEY });
    assert.equal(r.status, 400, url);
  }
  assert.equal((await A('/api/admin/voxcpm57/config', 'PUT', { key: 'kort' })).status, 400);
  process.env.VOXCPM_URL = 'http://203.0.113.9:8030'; process.env.VOXCPM_KEY = KEY;
  const g = await A('/api/admin/voxcpm57/config');
  assert.equal(g.body.url, null);
  assert.match(g.body.urlError, /ikke i huset/);
  delete process.env.VOXCPM_URL; delete process.env.VOXCPM_KEY;
  await useVx();
  const c = await A('/api/admin/voxcpm57/config');
  assert.deepEqual(c.body, { url: VX_URL, keySet: true });
  const { kv, OWNER } = await import('../server/db.js');
  assert.ok(!JSON.stringify(kv.get(OWNER, 'voxcpm57', {})).includes(KEY), 'nøkkelen er kryptert i databasen');
  const h = await A('/api/admin/voxcpm57/health?fresh=1');
  assert.equal(h.body.voxcpm.ok, true);
  assert.equal(h.body.voxcpm.engine, 'gguf');
  assert.equal(h.body.voxcpm.idleUnloadMin, 10);
  const t = await A('/api/admin/voxcpm57/test', 'POST', {});
  assert.equal(t.body.ok, true, JSON.stringify(t.body));
  assert.ok(t.body.bytes > 0);
});

test('POST /api/tts med VoxCPM: ferdig stemme, cache, motor voxcpm + gammel stemme, nyhetsstemme', async () => {
  await useVx();
  const s = await I('/api/glimt/settings');
  assert.equal(s.body.engines.find((x) => x.id === 'voxcpm').ready, true);
  // Første gang med en gang: ingen sky-motor → nettleser-reserve (503), og VoxCPM lager lyden i bakgrunnen.
  const r0 = await I('/api/tts', 'POST', { text: 'Neste er tannlege kl. 15:15.', voice: 'vx-henrik' });
  assert.equal(r0.status, 503);
  assert.equal(r0.body.fallback, 'browser');
  await vxIdle();
  const r1 = await I('/api/tts', 'POST', { text: 'Neste er tannlege kl. 15:15.', voice: 'vx-henrik' });
  assert.equal(r1.status, 200, r1.text);
  assert.equal(r1.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r1.headers.get('x-tts-engine'), 'voxcpm');
  assert.equal(r1.headers.get('x-tts-voice'), 'vx-henrik');
  assert.equal(r1.headers.get('x-tts-cache'), 'hit', 'lyden fra bakgrunnen ligger i cachen');
  assert.equal(r1.headers.get('x-tts-ai'), '1');
  const j = lastSpeech().json;
  assert.equal(j.input, 'Neste er tannlege klokka kvart over tre.', 'teksten er normalisert for uttale');
  assert.deepEqual(j.voice, { kind: 'design', prompt: V.BUILTIN57.find((b) => b.id === 'vx-henrik').prompt });
  assert.equal(j.response_format, 'mp3');
  const n = calls.length;
  const r2 = await I('/api/tts', 'POST', { text: 'Neste er tannlege kl. 15:15.', voice: 'vx-henrik' });
  assert.equal(r2.headers.get('x-tts-cache'), 'hit');
  assert.equal(calls.length, n, 'cache-treff spør ikke Mac-en');
  // Motoren voxcpm med en gammel stemme → vx-<samme>
  assert.equal((await I('/api/glimt/settings', 'PUT', { tts: { engine: 'voxcpm', voice: 'lys' } })).status, 200);
  const r3 = await ttsVx({ text: 'Hei Lys' });
  assert.equal(r3.headers.get('x-tts-engine'), 'voxcpm');
  assert.equal(r3.headers.get('x-tts-voice'), 'vx-lys');
  // Egen stemme for nyhetsleseren
  assert.equal((await I('/api/glimt/settings', 'PUT', { tts: { newsVoice: 'vx-nyhet' } })).body.tts.newsVoice, 'vx-nyhet');
  const q0 = V.vxQueueState57().waiting;
  assert.equal((await I('/api/tts', 'POST', { text: 'Dagens nyheter', purpose: 'news' })).status, 503, 'nyheter venter ikke på VoxCPM');
  assert.equal(V.vxQueueState57().waiting, q0, 'nyheter legges ikke i bakgrunnskøen');
  assert.equal((await ttsVx({ text: 'Dagens nyheter', purpose: 'news' })).headers.get('x-tts-voice'), 'vx-nyhet');
  assert.equal((await ttsVx({ text: 'Dagens Glimt' })).headers.get('x-tts-voice'), 'vx-lys');
  assert.equal((await I('/api/glimt/settings', 'PUT', { tts: { newsVoice: 'feil' } })).status, 400);
  assert.equal((await I('/api/glimt/settings', 'PUT', { tts: { engine: 'openai', voice: 'nora', newsVoice: null } })).status, 200);
});

test('reserve: Mac-en svarer ikke → brukerens sky-motor med tilsvarende stemme, ellers nettleseren', async () => {
  await useVx();
  speechStatus = 500;
  try {
    const none = await I('/api/tts', 'POST', { text: 'Reserve uten nøkkel', voice: 'vx-henrik' });
    assert.equal(none.status, 503);
    assert.equal(none.body.fallback, 'browser');
    assert.equal((await A('/api/ai/keys/openai', 'PUT', { key: 'sk-test-vox57abcd1234' })).status, 200);
    const r = await I('/api/tts', 'POST', { text: 'Reserve med nøkkel', voice: 'vx-henrik' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-tts-fallback'), 'voxcpm');
    assert.equal(r.headers.get('x-tts-voice'), 'henrik');
    assert.notEqual(r.headers.get('x-tts-engine'), 'voxcpm');
    // Nettleserstemmen valgt + VoxCPM-stemme nede → nettleseren (ingen sky)
    await I('/api/glimt/settings', 'PUT', { tts: { engine: 'browser' } });
    assert.equal((await I('/api/tts', 'POST', { text: 'Reserve nettleser', voice: 'vx-nora' })).status, 503);
  } finally {
    speechStatus = 200;
    await I('/api/glimt/settings', 'PUT', { tts: { engine: 'openai', voice: 'nora' } });
    await A('/api/ai/keys/openai', 'PUT', { key: '' }).catch(() => null);
  }
});

let designId = null;
test('egen stemme fra beskrivelse: per bruker, kan velges, andre ser den ikke', async () => {
  await useVx();
  assert.equal((await I('/api/voices57', 'POST', { kind: 'design', name: '', prompt: 'x y z' })).body.code, 'name_required');
  assert.equal((await I('/api/voices57', 'POST', { kind: 'design', name: 'Rolig', prompt: '' })).body.code, 'prompt_required');
  assert.equal((await I('/api/voices57', 'POST', { kind: 'zzz', name: 'Rolig' })).body.code, 'bad_kind');
  const r = await I('/api/voices57', 'POST', { kind: 'design', name: 'Rolig Ola', prompt: '(En rolig mannsstemme, middels tempo)' });
  assert.equal(r.status, 201, r.text);
  designId = r.body.voice.id;
  assert.match(designId, /^vxu-[0-9a-f]{12}$/);
  assert.equal(r.body.voice.prompt, 'En rolig mannsstemme, middels tempo', 'parentesene legges på av Mac-en');
  assert.ok((await I('/api/voices57')).body.voices.some((x) => x.id === designId));
  assert.ok(!(await A('/api/voices57')).body.voices.some((x) => x.id === designId), 'admin ser ikke Ingrids stemmer');
  assert.equal((await A('/api/glimt/settings', 'PUT', { tts: { voice: designId } })).status, 400, 'andre kan ikke velge den');
  assert.equal((await A(`/api/voices57/${designId}/preview`, 'POST', {})).status, 404);
  assert.equal((await A(`/api/voices57/${designId}`, 'DELETE')).status, 404);
  assert.equal((await I('/api/glimt/settings', 'PUT', { tts: { voice: designId } })).status, 200);
  const t = await ttsVx({ text: 'Med min egen stemme' });
  assert.equal(t.headers.get('x-tts-voice'), designId);
  assert.deepEqual(lastSpeech().json.voice, { kind: 'design', prompt: 'En rolig mannsstemme, middels tempo' });
  const p = await I(`/api/voices57/${designId}/preview`, 'POST', { text: 'Prøv meg' });
  assert.equal(p.status, 200);
  assert.equal(p.headers.get('x-tts-engine'), 'voxcpm');
  assert.equal((await I('/api/voices57/vx-nora', 'DELETE')).status, 400, 'ferdige stemmer kan ikke slettes');
});

let cloneId = null, cloneSha = null;
const dirOf = (id) => { const root = join(process.env.DATA_DIR, 'voices57'); const d = readdirSync(root).find((x) => existsSync(join(root, x, `${id}.json`))); assert.ok(d, 'stemmemappa finnes'); return join(root, d); };
test('kloning: krever samtykke, 5–60 s, 16 kHz WAV lagres privat, Mac-en får bare hash + lyd', async () => {
  await useVx();
  const no = await I('/api/voices57', 'POST', cloneForm({ name: 'Meg', kind: 'clone' }));
  assert.equal(no.status, 400);
  assert.equal(no.body.code, 'consent_required');
  assert.equal((await I('/api/voices57', 'POST', cloneForm({ name: 'Meg', kind: 'clone', consent: 'false' }))).body.code, 'consent_required');
  assert.equal((await I('/api/voices57', 'POST', cloneForm({ name: 'Meg', kind: 'clone', consent: 'true' }, null))).body.code, 'file_required');
  assert.equal((await I('/api/voices57', 'POST', cloneForm({ name: 'Meg', kind: 'clone', consent: 'true' }, toneWav(2)))).body.code, 'too_short');
  assert.equal((await I('/api/voices57', 'POST', cloneForm({ name: 'Meg', kind: 'clone', consent: 'true' }, toneWav(61)))).body.code, 'too_long');
  assert.equal((await I('/api/voices57', 'POST', { kind: 'clone', name: 'Meg' })).body.code, 'file_required');
  const before = Date.now();
  const r = await I('/api/voices57', 'POST', cloneForm({ name: 'Ingrid selv', kind: 'clone', consent: 'true', transcript: 'Hei! Nå leser jeg en kort tekst.' }, toneWav(8, 44100)));
  assert.equal(r.status, 201, r.text);
  const v = r.body.voice;
  cloneId = v.id;
  assert.equal(v.kind, 'clone');
  assert.equal(v.hasTranscript, true);
  assert.ok(Math.abs(v.seconds - 8) < 0.3, String(v.seconds));
  assert.ok(Date.parse(v.consentAt) >= before - 1000, 'samtykket er lagret med tidspunkt');
  assert.ok(!('sha' in v) && !JSON.stringify(v).includes('voices57'), 'ingen hash eller sti til klienten');
  const dir = dirOf(cloneId);
  assert.ok(dir.startsWith(join(process.env.DATA_DIR, 'voices57')));
  const wav = readFileSync(join(dir, `${cloneId}.wav`));
  assert.equal(wav.readUInt32LE(24), 16000, '16 kHz');
  assert.equal(wav.readUInt16LE(22), 1, 'mono');
  const meta = JSON.parse(readFileSync(join(dir, `${cloneId}.json`), 'utf8'));
  assert.equal(meta.consentText, V.CONSENT_TEXT57);
  cloneSha = meta.sha;
  assert.equal(createHash('sha256').update(wav).digest('hex'), cloneSha);
  // Preview: Mac-en mangler referansen → serveren laster den opp (PUT på hash) og prøver igjen
  refs.clear();
  const p = await I(`/api/voices57/${cloneId}/preview`, 'POST', {});
  assert.equal(p.status, 200, p.text);
  assert.ok(refs.has(cloneSha), 'referansen ble lastet opp på hash');
  const j = lastSpeech().json;
  assert.deepEqual(j.voice, { kind: 'clone', ref_sha: cloneSha, ref_text: 'Hei! Nå leser jeg en kort tekst.' });
  for (const c of calls) { assert.ok(!c.path.includes('ingrid') && !JSON.stringify(c.json ?? {}).includes('Ingrid selv'), 'Mac-en får aldri navn eller bruker'); }
  // Admin ser bare antall
  const h = await A('/api/admin/voxcpm57/health');
  assert.deepEqual(h.body.voices, { users: 1, clones: 1, designs: 1 });
  assert.ok(!(await A('/api/voices57')).body.voices.some((x) => x.id === cloneId));
  // Nyhetsleseren med klonet stemme
  assert.equal((await I('/api/glimt/settings', 'PUT', { tts: { newsVoice: cloneId } })).status, 200);
  const t = await ttsVx({ text: 'Nyheter i min stemme', purpose: 'news' });
  assert.equal(t.headers.get('x-tts-voice'), cloneId);
  assert.ok(readdirSync(join(dir, 'cache')).some((f) => f.startsWith(`${cloneId}.`)), 'lyden caches per bruker og stemme');
});

test('sletting: opptak, cache og Mac-cachen fjernes; valgte innstillinger går tilbake til standard', async () => {
  assert.ok(cloneId && designId);
  const dir = dirOf(cloneId);
  const d = await I(`/api/voices57/${cloneId}`, 'DELETE');
  assert.equal(d.status, 200);
  assert.deepEqual(d.body, { ok: true, macDeleted: true });
  assert.ok(!refs.has(cloneSha), 'Mac-cachen er slettet');
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === `/v1/refs/${cloneSha}`));
  assert.ok(!existsSync(join(dir, `${cloneId}.wav`)) && !existsSync(join(dir, `${cloneId}.json`)));
  assert.ok(!readdirSync(join(dir, 'cache')).some((f) => f.startsWith(`${cloneId}.`)));
  let s = await I('/api/glimt/settings');
  assert.equal(s.body.tts.newsVoice, null);
  assert.equal((await I(`/api/voices57/${designId}`, 'DELETE')).status, 200);
  s = await I('/api/glimt/settings');
  assert.equal(s.body.tts.voice, 'nora');
  assert.equal((await I(`/api/voices57/${designId}`, 'DELETE')).status, 404);
  assert.equal((await I('/api/voices57/..%2F..%2Fetc', 'DELETE')).status, 404);
});

test('ekte voxcpm_service.py (testmotor) ende til ende: design og klon via /api/tts', async (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) return t.skip('python3 mangler');
  const port = await new Promise((r) => { const s = netServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const dir = mkdtempSync(join(tmpdir(), 'hl-p57py-'));
  const cfg = join(dir, 'config.json');
  writeFileSync(cfg, JSON.stringify({ bind_ip: '127.0.0.1', port, allow: ['127.0.0.1/32'], key: KEY, engine: 'fake', idle_unload_min: 10, refs_dir: join(dir, 'refs') }));
  const out = [];
  const proc = spawn('python3', ['-I', join(process.cwd(), 'tools/voxcpm/voxcpm_service.py'), '--config', cfg], { env: { ...process.env, VOXCPM_ALLOW_FAKE: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', (b) => out.push(String(b)));
  t.after(() => proc.kill());
  for (let i = 0; i < 100; i++) { try { const r = await realFetch(`http://127.0.0.1:${port}/health`); if (r.status) break; } catch { await new Promise((r) => setTimeout(r, 50)); } }
  await useVx(`http://127.0.0.1:${port}`);
  const r = await ttsVx({ text: 'Hei fra den ekte tjenesten. Dette er setning to.', voice: 'vx-nyhet' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.headers.get('content-type'), /^audio\/(mpeg|wav)$/);
  assert.ok(r.buf.length > 1000);
  const c = await I('/api/voices57', 'POST', cloneForm({ name: 'Ekte', kind: 'clone', consent: 'on' }));
  assert.equal(c.status, 201);
  const p = await I(`/api/voices57/${c.body.voice.id}/preview`, 'POST', { text: 'Klonet hei' });
  assert.equal(p.status, 200, p.text);
  assert.equal(readdirSync(join(dir, 'refs')).filter((f) => f.endsWith('.wav')).length, 1, 'referansen ligger på Mac-en (bare hash)');
  assert.deepEqual((await I(`/api/voices57/${c.body.voice.id}`, 'DELETE')).body, { ok: true, macDeleted: true });
  assert.equal(readdirSync(join(dir, 'refs')).filter((f) => f.endsWith('.wav')).length, 0);
  const log = out.join('');
  assert.ok(!log.includes(KEY) && !log.includes('Klonet hei') && !log.includes('Ingrid'), 'loggen på Mac-en har aldri nøkkel, tekst eller navn');
  await useVx(); // tilbake til den falske
});

test('nøkkelen dukker aldri opp i svar eller logger', () => {
  for (const t of responses) assert.ok(!t.includes(KEY), 'nøkkelen i et svar');
  for (const l of logged) assert.ok(!l.includes(KEY), 'nøkkelen i loggen');
});

test('slettet bruker: stemmemappa fjernes', () => {
  const v = V.createDesign57('u_slettes57', { name: 'Borte', prompt: 'En lys stemme' });
  assert.ok(existsSync(join(V.userDir57('u_slettes57'), `${v.id}.json`)));
  V.purgeUser57('u_slettes57');
  assert.ok(!existsSync(V.userDir57('u_slettes57')));
  assert.equal(V.userDir57('..'), join(process.env.DATA_DIR, 'voices57', `u-${createHash('sha256').update('..').digest('hex').slice(0, 16)}`), 'aldri sti ut av mappa');
});
