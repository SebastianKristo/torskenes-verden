// Prompt 54 (WHISPER54): NB-Whisper (Nasjonalbiblioteket) på Mac mini-en – tale til tekst på norsk og engelsk via /api/voice53/transcribe.
// Mocket: NB-Whisper-tjenesten er en liten falsk HTTP-tjeneste i Node (samme ruter og svarformer som tools/nb-whisper/nbwhisper.py),
// Voz/Clear er mocket med _setLoader53 og Phonon med _setPhonon53. Når python3 finnes, kjøres i tillegg den EKTE tjenesten
// (nbwhisper.py med testmotoren, NBWHISPER_ALLOW_FAKE=1): IP-filter, nøkkel og svarformer ende til ende.
// Ikke kjørt ekte her: NB-Whisper-vektene (huggingface.co er blokkert), MLX/Metal på Apple silicon, whisper.cpp, install.sh/launchd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p54w-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-54wh';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4661';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DAL53_AUTOLOAD;
for (const k of ['NBWHISPER_URL', 'NBWHISPER_KEY', 'FERMION_PHONON_URL', 'FERMION_PHONON_KEY']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); }; // ingenting annet skal ut
test.after(() => { globalThis.fetch = realFetch; });

// Alt som logges i testen – nøkkelen skal aldri dukke opp.
const logged = [];
for (const k of ['log', 'info', 'warn', 'error']) { const o = console[k]; console[k] = (...a) => { logged.push(a.map(String).join(' ')); o(...a); }; }

const { default: app } = await import('../server/index.js');
const M = await import('../server/dal53/models.js');
const ASR = await import('../server/dal53/asr.js');
const H = await import('../server/whisper54/health.js');
const W = await import('../server/whisper54/asr.js');
const R = await import('../server/whisper54/route.js');
H._setNbFetch54(realFetch); // bare kallene til «Mac mini-en» (127.0.0.1) får ekte nett

let ipN = 60;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData, raw = body instanceof Uint8Array;
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm && !raw ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm || raw ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body, headers = {}) => req(path, { method, headers: { cookie: ck, ...headers }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const responses = []; // alle svartekster – nøkkelen skal aldri dukke opp
const T = async (...a) => { const r = await I(...a); responses.push(r.text); return r; };
const AA = async (...a) => { const r = await A(...a); responses.push(r.text); return r; };
async function readyMock(id, inst) { M._setLoader53(id, async () => inst); await M.load53(id); assert.ok(M.ready53(id), `${id} skal være klar`); }
const wav = new Uint8Array(ASR.wav16k53(new Float32Array(1600)));
const say = (q = '', extra = {}) => { const fd = new FormData(); fd.append('file', new Blob([wav], { type: 'audio/webm' }), 'tale.webm'); for (const [k, v] of Object.entries(extra)) fd.append(k, v); return T(`/api/voice53/transcribe${q}`, 'POST', fd); };

/* ---------------- Falsk NB-Whisper-tjeneste (Mac mini-en) ---------------- */

const KEY = 'n'.repeat(16) + 'b54b54b54b54b54b54b54b54b54b54b5'; // 48 tegn
const calls = [];
let detectReply = { language: 'no', probability: 0.82, languages: [{ language: 'no', probability: 0.82 }, { language: 'nn', probability: 0.06 }, { language: 'da', probability: 0.05 }, { language: 'en', probability: 0.04 }] };
let healthStatus = 200;
const fieldsOf = (body, ctype) => {
  const b = ctype.match(/boundary=(.+)$/)[1], out = {};
  for (const part of body.toString('latin1').split(`--${b}`)) {
    const m = part.match(/name="([^"]+)"(?:; filename="[^"]*")?/);
    if (m && !/filename=/.test(part)) { const v = part.split('\r\n\r\n')[1]?.replace(/\r\n$/, ''); (out[m[1]] ??= []).push(v); }
    if (m && /filename=/.test(part)) out.file = [part.split('\r\n\r\n')[1].slice(0, 4)];
  }
  return out;
};
let noText = 'Hei fra Nasjonalbiblioteket'; // det NB-Whisper svarer med language=no
const fake = createServer((rq, rs) => {
  const chunks = [];
  rq.on('data', (c) => chunks.push(c));
  rq.on('end', () => {
    const body = Buffer.concat(chunks);
    const send = (st, j) => rs.writeHead(st, { 'content-type': 'application/json' }).end(JSON.stringify(j));
    if (rq.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: 'mangler eller feil nøkkel', code: 'invalid_api_key' } });
    const f = rq.method === 'POST' ? fieldsOf(body, rq.headers['content-type'] ?? '') : {};
    calls.push({ path: rq.url, f });
    if (rq.url === '/health') return send(healthStatus, healthStatus === 200 ? { status: 'ok', service: 'nb-whisper', model: 'nb-whisper-medium', engine: 'mlx', languages: ['no', 'nn', 'en'], device: 'gpu', version: '54.1' } : { status: 'starting' });
    if (rq.url === '/v1/audio/detect') return send(200, { ...detectReply, duration: 0.1, model: 'nb-whisper-medium' });
    if (rq.url === '/v1/audio/transcriptions') {
      assert.equal(f.file[0], 'RIFF', 'serveren sender WAV (16 kHz) til Mac-en');
      const l = f.language?.[0] ?? null;
      const text = { no: noText, nn: 'Hei frå Nasjonalbiblioteket', en: 'Hello from the library' }[l] ?? `tekst (${l})`;
      return send(200, { task: 'transcribe', language: l ?? 'no', duration: 0.1, text: ` ${text} `, model: 'nb-whisper-medium', engine: 'mlx',
        segments: [{ id: 0, start: 0, end: 1.2, text }], words: text.split(' ').map((w, i) => ({ word: ` ${w}`, start: i * 0.4, end: i * 0.4 + 0.3, probability: 0.9 })) });
    }
    send(404, { error: { message: 'ukjent rute' } });
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const NB_URL = `http://127.0.0.1:${fake.address().port}`;
test.after(() => fake.close());
const lastCall = (path) => [...calls].reverse().find((c) => c.path === path);
const useNb = async () => { assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { url: NB_URL, key: KEY })).status, 200); await H.probeNb54(); assert.ok(W.nbWhisperAsr54.ready(), 'NB-Whisper svarer'); };

ASR._setAudioDecoder53(() => new Float32Array(16000 * 2)); // ffmpeg trengs ikke i testen
ASR._setPhonon53(null);

/* ---------------- Tester ---------------- */

test('flagget whisper_nb54 er PÅ som standard; admin-endepunktene er bare for admin', async () => {
  const f = await T('/api/flags');
  assert.equal(f.body.flags.whisper_nb54, true);
  assert.equal((await T('/api/admin/whisper54/health')).status, 403);
  assert.equal((await T('/api/admin/whisper54/config', 'PUT', { url: NB_URL, key: KEY })).status, 403);
  assert.equal((await req('/api/admin/whisper54/config')).status, 401);
  const h = await AA('/api/admin/whisper54/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.nbwhisper.configured, false);
  assert.ok(h.body.engines.some((e) => e.id === 'nbwhisper' && e.engine_label === 'NB-Whisper (Mac mini)'));
});

test('bare interne adresser; nøkkelen lagres kryptert og sendes aldri ut', async () => {
  // Miljøvariabler (reserve før admin har lagret noe): ekstern adresse brukes ikke.
  process.env.NBWHISPER_URL = 'http://203.0.113.9:8020'; process.env.NBWHISPER_KEY = KEY;
  const g = await AA('/api/admin/whisper54/config');
  assert.equal(g.body.url, null);
  assert.equal(g.body.keySet, true);
  assert.match(g.body.urlError, /ikke i huset/);
  assert.equal(W.nbWhisperAsr54.configured(), false);
  process.env.NBWHISPER_URL = 'http://10.69.1.173:8020';
  assert.equal(W.nbWhisperAsr54.configured(), true, 'intern adresse fra miljøet godtas');
  delete process.env.NBWHISPER_URL; delete process.env.NBWHISPER_KEY;
  for (const url of ['http://8.8.8.8:8020', 'https://nb-whisper.example.com', 'http://10.69.1.173:8020/v1', 'http://user:pw@10.69.1.173:8020', 'ftp://10.69.1.173']) {
    assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { url })).status, 400, url);
  }
  assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { key: 'kort' })).status, 400);
  const ok = await AA('/api/admin/whisper54/config', 'PUT', { url: 'http://10.69.1.173:8020', key: KEY });
  assert.deepEqual(ok.body, { url: 'http://10.69.1.173:8020', keySet: true });
  const raw = ['homelab.db', 'homelab.db-wal'].map((f) => join(process.env.DATA_DIR, f)).filter(existsSync).map((f) => readFileSync(f).toString('latin1')).join('');
  assert.ok(!raw.includes(KEY), 'nøkkelen står ikke i klartekst i databasen');
  assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { url: '', key: '' })).status, 200);
});

test('norsk uten NB-Whisper → 422 med tydelig melding; satt opp men nede → 503 (ikke 422)', async () => {
  let r = await say('?language=nb');
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'language_unsupported');
  assert.match(r.body.error, /NB-Whisper/);
  assert.ok(!r.body.supported.includes('no'));
  // Satt opp, men tjenesten svarer ikke (lukket port).
  const dead = netServer(); await new Promise((ok) => dead.listen(0, '127.0.0.1', ok)); const port = dead.address().port; await new Promise((ok) => dead.close(ok));
  assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { url: `http://127.0.0.1:${port}`, key: KEY })).status, 200);
  await H.probeNb54();
  assert.equal(H.nbState54().status, 'down');
  r = await say('?language=nb');
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'asr_unavailable');
  const bk = await T('/api/voice53/backends');
  assert.equal(bk.body.norwegian, false);
  assert.equal(bk.body.backends.find((b) => b.id === 'nbwhisper').available, false);
});

test('norsk → NB-Whisper (bokmål som standard, nn gir nynorsk), Clear først, samme svarform', async () => {
  await useNb();
  let cleared = 0;
  await readyMock('clear', { enhance: async (s) => { cleared++; return { samples: s }; } });
  let r = await say('', { language: 'nb' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.text, 'Hei fra Nasjonalbiblioteket');
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(r.body.engine_label, 'NB-Whisper (Mac mini)');
  assert.equal(r.body.language, 'no');
  assert.equal(r.body.variant, 'nb');
  assert.equal(r.body.language_label, 'norsk (bokmål)');
  assert.equal(r.body.enhanced, true);
  assert.equal(typeof r.body.ms, 'number');
  assert.deepEqual(r.body.words[0], { text: 'Hei', start: 0, end: 0.3 });
  assert.deepEqual(Object.keys(r.body.words[0]), ['text', 'start', 'end']);
  assert.equal(lastCall('/v1/audio/transcriptions').f.language[0], 'no', 'bokmål = no til NB-Whisper');
  assert.deepEqual(lastCall('/v1/audio/transcriptions').f['timestamp_granularities[]'], ['word', 'segment']);
  assert.equal(lastCall('/v1/audio/transcriptions').f.response_format[0], 'verbose_json');
  r = await say('?language=nn');
  assert.equal(r.body.text, 'Hei frå Nasjonalbiblioteket');
  assert.equal(r.body.variant, 'nn');
  assert.equal(lastCall('/v1/audio/transcriptions').f.language[0], 'nn');
  r = await say('?language=no-NO&enhance=0');
  assert.equal(r.body.variant, 'nb');
  assert.equal(r.body.enhanced, false);
  assert.equal(cleared, 2, 'Clear kjøres før motoren når den er klar (ikke med enhance=0)');
  const bk = await T('/api/voice53/backends');
  assert.equal(bk.body.norwegian, true);
  assert.equal(bk.body.detect, true);
  assert.equal(bk.body.norwegian_engine, 'NB-Whisper (Mac mini)');
  M._setLoader53('clear', null);
});

test('engelsk → Voz (server) → Phonon (Mac mini) → NB-Whisper (language=en) som reserve', async () => {
  await useNb();
  await readyMock('voz', { transcribe: async () => ({ text: 'hello voz', words: [{ text: 'hello', start: 0, end: 0.4 }], duration: 2 }) });
  ASR._setPhonon53({ label: 'Phonon-2.5 (Mac mini)', ready: () => true, languages: () => ['en', 'sv'], supports: (l) => !['no', 'nb', 'nn'].includes(l),
    transcribe: async (b, o) => ({ text: 'hello phonon', words: [{ word: 'hello', start: 0, end: 0.3 }], language: o.language }) });
  let r = await say('?language=en');
  assert.equal(r.body.engine, 'voz');
  assert.equal(r.body.engine_label, 'Voz (server)');
  assert.equal(r.body.language_label, 'engelsk');
  // Voz feiler → Phonon (stille reserve).
  M._setLoader53('voz', async () => ({ transcribe: async () => { throw new Error('krasj'); } })); await M.load53('voz');
  r = await say('?language=en-GB');
  assert.equal(r.body.engine, 'phonon');
  assert.equal(r.body.engine_label, 'Phonon (Mac mini)');
  assert.equal(r.body.fallback, true);
  assert.deepEqual(r.body.words[0], { text: 'hello', start: 0, end: 0.3 });
  // Verken Voz eller Phonon → NB-Whisper med language=en.
  M._setLoader53('voz', null); ASR._setPhonon53(null);
  r = await say('?language=en');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(r.body.text, 'Hello from the library');
  assert.equal(lastCall('/v1/audio/transcriptions').f.language[0], 'en');
  // Svensk valgt: Phonon (som før), NB-Whisper bare som reserve.
  ASR._setPhonon53({ label: 'Phonon', ready: () => true, languages: () => ['sv'], supports: (l) => l === 'sv', transcribe: async () => ({ text: 'hej', words: [] }) });
  r = await say('?language=sv');
  assert.equal(r.body.engine, 'phonon');
  ASR._setPhonon53(null);
});

test('auto: språket oppdages med NB-Whisper (/detect, første 30 s); profilen er bare et hint', async () => {
  await useNb();
  await readyMock('voz', { transcribe: async () => ({ text: 'hello voz', words: [] }) });
  ASR._setPhonon53({ label: 'Phonon', ready: () => true, languages: () => ['en', 'sv'], supports: (l) => ['en', 'sv'].includes(l), transcribe: async () => ({ text: 'hej phonon', words: [] }) });
  // Norsk oppdaget → NB-Whisper.
  detectReply = { language: 'no', probability: 0.82, languages: [{ language: 'no', probability: 0.82 }, { language: 'nn', probability: 0.06 }, { language: 'en', probability: 0.04 }] };
  let r = await say('');
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(r.body.language, 'no');
  assert.equal(r.body.variant, 'nb');
  assert.deepEqual(r.body.detected, { language: 'no', probability: 0.88, source: 'detected', engine: 'nbwhisper' }, 'no + nn slås sammen');
  assert.ok(lastCall('/v1/audio/detect'), 'deteksjonen gikk til /v1/audio/detect');
  // Engelsk oppdaget (selv om profilen er norsk) → Voz først.
  detectReply = { language: 'en', probability: 0.93, languages: [{ language: 'en', probability: 0.93 }, { language: 'no', probability: 0.04 }] };
  r = await say('?language=auto');
  assert.equal(r.body.engine, 'voz');
  assert.equal(r.body.language, 'en');
  assert.equal(r.body.detected.source, 'detected');
  // Usikker deteksjon: hintet vinner bare når det har reell sannsynlighet.
  detectReply = { language: 'da', probability: 0.38, languages: [{ language: 'da', probability: 0.38 }, { language: 'no', probability: 0.3 }, { language: 'sv', probability: 0.2 }] };
  r = await say('', { hint: 'nb' });
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(r.body.detected.source, 'hint');
  r = await say('', { hint: 'en' }); // engelsk har ~0 → deteksjonen (dansk) står
  assert.equal(r.body.language, 'da');
  assert.equal(r.body.engine, 'nbwhisper', 'annet oppdaget språk → NB-Whisper først (kontrakt 54)');
  assert.equal(lastCall('/v1/audio/transcriptions').f.language[0], 'da');
  // Svensk oppdaget sikkert → NB-Whisper (sv), Phonon som reserve.
  detectReply = { language: 'sv', probability: 0.91, languages: [{ language: 'sv', probability: 0.91 }] };
  r = await say('');
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(r.body.language, 'sv');
  // Et språk ingen motor kan → tydelig 422.
  detectReply = { language: 'tlh', probability: 0.99, languages: [{ language: 'tlh', probability: 0.99 }] };
  r = await say('');
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'language_unsupported');
  assert.equal(r.body.detected, 'tlh');
  assert.match(r.body.error, /Oppdaget språk/);
  detectReply = { language: 'no', probability: 0.82, languages: [{ language: 'no', probability: 0.82 }, { language: 'nn', probability: 0.06 }] };
  M._setLoader53('voz', null); ASR._setPhonon53(null);
});

test('auto: NB-Whisper tror engelsk tale er norsk → Tongue leser teksten som engelsk → Voz på nytt', async () => {
  await useNb();
  let vozCalls = 0;
  await readyMock('voz', { transcribe: async () => { vozCalls++; return { text: 'Hello from Voz', words: [] }; } });
  let tongue = 'en';
  await readyMock('tongue', { detect: () => ({ language: tongue, reliability: 'confident', isTooCloseToCall: false, candidates: [{ language: tongue }] }) });
  detectReply = { language: 'no', probability: 0.71, languages: [{ language: 'no', probability: 0.71 }, { language: 'en', probability: 0.2 }] };
  noText = 'Hello, can you add milk to the shopping list';
  let r = await say('');
  assert.equal(r.status, 200);
  assert.equal(r.body.engine, 'voz');
  assert.equal(r.body.language, 'en');
  assert.equal(r.body.text, 'Hello from Voz');
  assert.equal(r.body.detected.source, 'text');
  assert.equal(r.body.detected.first.language, 'no', 'første gjetning vises');
  assert.equal(vozCalls, 1);
  // Valgt norsk (ikke auto) → ingen ny runde.
  r = await say('?language=no');
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(vozCalls, 1);
  // Tongue sier norsk → NB-Whisper står.
  tongue = 'no'; noText = 'Hei fra Nasjonalbiblioteket';
  r = await say('');
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(vozCalls, 1);
  // Voz feiler på andre runde → NB-Whisper-svaret beholdes.
  tongue = 'en'; noText = 'Hello again from the library';
  M._setLoader53('voz', async () => ({ transcribe: async () => { throw new Error('krasj'); } })); await M.load53('voz');
  r = await say('');
  assert.equal(r.status, 200);
  assert.equal(r.body.engine, 'nbwhisper');
  assert.equal(r.body.text.trim(), 'Hello again from the library');
  noText = 'Hei fra Nasjonalbiblioteket';
  M._setLoader53('voz', null); M._setLoader53('tongue', null);
});

test('auto uten NB-Whisper: profilens språk brukes (engelsk → Voz), norsk uten norsk motor → 422', async () => {
  assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { url: '' })).status, 200);
  await readyMock('voz', { transcribe: async () => ({ text: 'hello', words: [] }) });
  let r = await say('', { hint: 'en' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.engine, 'voz');
  assert.equal(r.body.detected.source, 'hint');
  r = await say('', { hint: 'no' });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /NB-Whisper/);
  M._setLoader53('voz', null);
});

test('flagget av → NB-Whisper brukes ikke (norsk gir 422 igjen); stille reserve', async () => {
  await useNb();
  assert.equal((await AA('/api/admin/flags51/whisper_nb54', 'PATCH', { default: false })).status, 200);
  assert.equal(W.nbWhisperAsr54.ready(), false);
  const r = await say('?language=nb');
  assert.equal(r.status, 422);
  assert.equal((await AA('/api/admin/flags51/whisper_nb54', 'PATCH', { default: true })).status, 200);
  assert.equal((await say('?language=nb')).body.engine, 'nbwhisper');
});

test('helse i bakgrunnen med kort tidsavbrudd; admin-test; feil nøkkel → auth', async () => {
  await useNb();
  const h = await AA('/api/admin/whisper54/health?fresh=1');
  assert.equal(h.body.nbwhisper.status, 'ok');
  assert.equal(h.body.nbwhisper.model, 'nb-whisper-medium');
  assert.equal(h.body.nbwhisper.engine, 'mlx');
  assert.equal(H.PROBE_MS54, 1500);
  const t = await AA('/api/admin/whisper54/test', 'POST', {});
  assert.equal(t.body.ok, true, t.text);
  assert.equal(t.body.detected, 'no');
  healthStatus = 503;
  await H.probeNb54();
  assert.equal(H.nbState54().status, 'starting');
  assert.equal((await say('?language=nb')).status, 503);
  healthStatus = 200;
  assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { key: 'x'.repeat(40) })).status, 200);
  await H.probeNb54();
  assert.equal(H.nbState54().status, 'auth');
  assert.equal(W.nbWhisperAsr54.ready(), false);
  await useNb();
});

const py = spawnSync('python3', ['-c', 'import sys; print(sys.version_info >= (3, 9))'], { encoding: 'utf8' });
test('ekte tjeneste (tools/nb-whisper/nbwhisper.py, testmotor): IP-filter, nøkkel og svarform ende til ende', { skip: py.stdout?.trim() !== 'True' && 'python3 mangler' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nbw54-'));
  const free = () => new Promise((ok) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const port = await free(), port2 = await free();
  const start = (p, allow) => {
    const cfg = join(dir, `c${p}.json`);
    writeFileSync(cfg, JSON.stringify({ bind_ip: '127.0.0.1', port: p, allow, key: KEY, engine: 'fake', size: 'medium' }));
    const ch = spawn('python3', ['-I', 'tools/nb-whisper/nbwhisper.py', '--config', cfg], { env: { ...process.env, NBWHISPER_ALLOW_FAKE: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
    let log = ''; ch.stderr.on('data', (d) => { log += d; });
    return { ch, log: () => log };
  };
  const ok = start(port, ['127.0.0.1/32']), no = start(port2, ['10.69.1.39']);
  test.after(() => { ok.ch.kill(); no.ch.kill(); });
  for (let i = 0; i < 100; i++) { try { const r = await realFetch(`http://127.0.0.1:${port}/health`); if (r.status === 401) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 50)); }
  assert.equal((await realFetch(`http://127.0.0.1:${port}/health`)).status, 401, 'uten nøkkel');
  for (let i = 0; i < 100; i++) { try { await realFetch(`http://127.0.0.1:${port2}/health`); break; } catch { await new Promise((r) => setTimeout(r, 50)); } }
  assert.equal((await realFetch(`http://127.0.0.1:${port2}/health`, { headers: { authorization: `Bearer ${KEY}` } })).status, 403, 'avsender ikke på lista');
  assert.equal((await AA('/api/admin/whisper54/config', 'PUT', { url: `http://127.0.0.1:${port}`, key: KEY })).status, 200);
  for (let i = 0; i < 40 && !(await H.probeNb54()).ok; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(H.nbState54().status, 'ok');
  let r = await say('?language=nb');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.text, 'hei fra testen');
  assert.equal(r.body.engine, 'nbwhisper');
  assert.deepEqual(r.body.words[1], { text: 'fra', start: 0.3, end: 0.55 });
  r = await say('');
  assert.equal(r.body.detected.language, 'no');
  assert.equal(r.body.detected.probability, 0.88);
  r = await say('?language=nn');
  assert.equal(r.body.text, 'hei frå testen');
  assert.ok(!ok.log().includes(KEY), 'Mac-loggen har ikke nøkkelen');
  assert.ok(!ok.log().includes('hei fra testen'), 'Mac-loggen har ikke teksten');
  assert.match(ok.log(), /\/v1\/audio\/transcriptions 200/);
  await useNb();
});

test('route.js: språk, avgjørelse og rekkefølge', () => {
  assert.deepEqual(R.splitLang54('nb-NO'), { lang: 'no', variant: 'nb' });
  assert.deepEqual(R.splitLang54('nn'), { lang: 'no', variant: 'nn' });
  assert.deepEqual(R.splitLang54('auto'), { lang: null, variant: null });
  assert.equal(R.nbWire54('no', 'nn'), 'nn');
  assert.equal(R.nbWire54('no', 'nb'), 'no');
  assert.equal(R.decide54({ languages: [{ language: 'nn', probability: 0.9 }, { language: 'no', probability: 0.05 }] }).variant, 'nn');
  assert.equal(R.decide54({ language: 'en', probability: 0.7 }).lang, 'en');
  assert.equal(R.decide54(null), null);
  const L = [{ id: 'voz', priority: 5 }, { id: 'phonon', priority: 10 }, { id: 'nbwhisper', priority: 8 }, { id: 'x', priority: 1 }];
  assert.deepEqual(R.order54(L, 'en').map((x) => x.id), ['voz', 'phonon', 'x', 'nbwhisper']);
  assert.deepEqual(R.order54(L, 'no').map((x) => x.id)[0], 'nbwhisper');
  assert.deepEqual(R.order54(L, 'sv').map((x) => x.id), ['phonon', 'voz', 'x', 'nbwhisper']);
  assert.deepEqual(R.order54(L, 'sv', { auto: true }).map((x) => x.id)[0], 'nbwhisper');
});

test('web, lisenser og dokumentasjon', () => {
  const js = readFileSync('public/js/voice54.js', 'utf8');
  assert.match(js, /MediaRecorder/);
  assert.match(js, /\/api\/voice53\/transcribe/);
  assert.match(js, /isSecureContext/);
  assert.match(js, /data-ch-mic/, 'Glimt-chatten');
  assert.match(js, /data-search/, 'Glimt-søket');
  assert.match(js, /Tale til tekst/);
  assert.match(readFileSync('public/app.html', 'utf8'), /\/assets\/js\/voice54\.js/);
  assert.match(readFileSync('public/js/ai-control.js', 'utf8'), /data-v54-ai/);
  assert.match(readFileSync('public/js/dal53.js', 'utf8'), /NB-Whisper[\s\S]*Nasjonalbiblioteket[\s\S]*Apache-2\.0/);
  const md = readFileSync('docs/lisenser-tredjepart.md', 'utf8');
  assert.match(md, /NB-Whisper/); assert.match(md, /Nasjonalbiblioteket/);
  assert.ok(existsSync('docs/nb-whisper-54.md'));
  for (const f of ['install.sh', 'uninstall.sh', 'nbwhisper.py', 'prepare.py', 'README.md']) assert.ok(existsSync(`tools/nb-whisper/${f}`), f);
  const inst = readFileSync('tools/nb-whisper/install.sh', 'utf8');
  assert.match(inst, /com\.local\.nb-whisper/);
  assert.match(inst, /10\.69\.1\.39/);
  assert.match(inst, /HF_HUB_OFFLINE/);
  assert.match(readFileSync('tools/nb-whisper/nbwhisper.py', 'utf8'), /hmac\.compare_digest/);
});

test('nøkkelen står aldri i svar eller logg', () => {
  assert.ok(responses.length > 20);
  for (const t of responses) assert.ok(!t.includes(KEY), 'nøkkelen i et svar');
  for (const l of logged) assert.ok(!l.includes(KEY), `nøkkelen i loggen: ${l.slice(0, 80)}`);
});
