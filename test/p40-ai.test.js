// Prompt 40 (SERVER40): «38 selvtester feilet · svarte ikke innen 15 s». Reproduksjon av den ekte feilen og fiksen.
// Den ekte feilen: selftest() kjørte alle rutene samtidig (Promise.all) med run(…, {timeoutMs: statusMs = 15 s}) – grensen inkluderte
// innlasting av modellen fra disk, og 8 modeller samtidig fikk Ollama til å laste ut og inn hele tiden. Her: falsk Ollama der en kald modell
// bruker LOAD_MS på å lastes, og bare én modell er lastet om gangen (OLLAMA_MAX_LOADED_MODELS=1), tidene skalert ned (15 s → 300 ms).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p40ai-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-40ai';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
process.env.AI_GPU_VRAM_GB = '8';
process.env.AI_LOAD_MBPS = '20000';
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'OPENWEBUI_URL']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const LOAD_MS = 400;
const SIZES = { 'qwen3:8b': 5.2e9, 'llama3.2:3b': 2.0e9, 'qwen2.5vl:7b': 6.0e9, 'gemma4:12b': 9.6e9, 'bge-m3:latest': 1.2e9 };
const ol = { down: false, loaded: new Set(), inflight: 0, maxInflight: 0, log: [] };
const tag = (name) => ({ name, model: name, size: SIZES[name], details: { families: name.startsWith('bge') ? ['bert'] : ['x'], quantization_level: 'Q4_K_M', parameter_size: '8B' } });
const wait = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: signal.reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError' })); }); });
// Bare én modell i minnet om gangen: lasting av en ny kaster ut den forrige.
async function load(model, signal) { if (ol.loaded.has(model)) return; await wait(LOAD_MS, signal); ol.loaded.clear(); ol.loaded.add(model); }
async function fakeFetch(url, init = {}) {
  const u = String(url);
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  if (!u.startsWith('http://ollama.test:11434')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  if (ol.down) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const path = new URL(u).pathname;
  if (path === '/api/tags') return Response.json({ models: Object.keys(SIZES).map(tag) });
  if (path === '/api/version') return Response.json({ version: '0.12.3' });
  if (path === '/api/ps') return Response.json({ models: [...ol.loaded].map((n) => ({ name: n, model: n, size: SIZES[n], size_vram: SIZES[n] })) });
  ol.inflight++; ol.maxInflight = Math.max(ol.maxInflight, ol.inflight);
  try {
    ol.log.push({ path, model: body?.model, prompt: body?.prompt, keep: body?.keep_alive, at: Date.now() });
    if (path === '/api/generate') {
      if (body.keep_alive === 0) { ol.loaded.delete(body.model); return Response.json({ done: true, done_reason: 'unload' }); }
      await load(body.model, init.signal);
      return Response.json({ model: body.model, response: '', done: true, done_reason: 'load' });
    }
    if (path === '/api/chat') {
      await load(body.model, init.signal); // Ollama laster selv ved et kaldt kall – det er dette som spiste 15 s-grensen
      await wait(30, init.signal);
      if (body.stream) {
        const lines = [{ message: { role: 'assistant', thinking: 'hmm' } }, { message: { role: 'assistant', content: 'o' } }, { message: { role: 'assistant', content: 'k' }, done: true, prompt_eval_count: 9, eval_count: 2 }];
        return new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
      }
      return Response.json({ model: body.model, message: { role: 'assistant', content: 'ok' }, done: true, prompt_eval_count: 9, eval_count: 2 });
    }
    if (path === '/api/embed') { await load(body.model, init.signal); return Response.json({ embeddings: [[0.1, 0.2]], prompt_eval_count: 1 }); }
    return Response.json({ error: 'ukjent' }, { status: 404 });
  } finally { ol.inflight--; }
}
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const ai = await import('../server/ai-run.js');
const gate = await import('../server/ollama-gate.js');
gate._gateTest.backoffMs = [20, 80]; gate._gateTest.unloadGraceMs = 0; // prompt 43: kort backoff og ingen frist før utlasting i testene
const { db, OWNER } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const cookie = await login('sebastian', 'testpassord1');
const A = async (path, method = 'GET', body, extra = {}) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: j, text: t };
};
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
// Rutene slik brukerens server er satt opp: fire ulike modeller.
const ROUTES = { chat: 'qwen3:8b', sok: 'qwen3:8b', glimt: 'qwen3:8b', brief: 'qwen3:8b', dom: 'qwen3:8b', kat: 'llama3.2:3b', fsok: 'llama3.2:3b', rc: 'qwen2.5vl:7b', kb: 'bge-m3:latest' };
assert.equal((await A('/api/ai/routing', 'PUT', { tasks: Object.fromEntries(Object.entries(ROUTES).map(([k, m]) => [k, { model: m, fallback: '' }])) })).status, 200);
const reset = () => { ol.loaded.clear(); ol.maxInflight = 0; ol.log.length = 0; ol.down = false; ai._warmModels.clear(); ai.invalidateInventory(); };
beforeEach(() => { ai._aiRunTest.loadMs = 3000; ai._aiRunTest.respMs = 1000; ai._aiRunTest.statusMs = 300; });

// Prompt 43: før gikk alle rutene samtidig (Promise.all) rett til Ollama, og alle de kalde feilet. Nå går de gjennom Ollama-gaten:
// samme samtidige start, men aldri to kall til Ollama samtidig, og alle svarer (se også test/p43-ollama-gate.test.js).
test('reproduksjon: alle rutene samtidig (slik selvtesten gikk før) – gaten sender én om gangen, og alle svarer', async () => {
  reset();
  const ids = ['chat', 'kat', 'rc', 'fsok'];
  const res = await Promise.allSettled(ids.map((id) => ai.run(id, { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3, noRetry: true, title: `Gammel selvtest · ${id}` })));
  assert.ok(res.every((r) => r.status === 'fulfilled'), JSON.stringify(res.map((r) => r.reason?.message ?? 'ok')));
  assert.equal(ol.maxInflight, 1, 'aldri to kall til Ollama samtidig');
});

test('fiks: helsesjekk, én modell om gangen gruppert per modell, oppvarming med egen grense – alle rutene svarer', async () => {
  reset();
  const r = await A('/api/ai/selftest', 'POST', {}, { accept: 'application/json' });
  assert.equal(r.status, 200, r.text);
  const bad = r.body.results.filter((x) => !x.ok);
  assert.deepEqual(bad, [], JSON.stringify(bad));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.health.ok, true);
  assert.equal(r.body.health.version, '0.12.3');
  assert.equal(ol.maxInflight, 1, 'aldri to kall til Ollama samtidig');
  // Gruppert: alle testene for qwen3:8b etter hverandre (én innlasting), så llama3.2:3b osv.
  const chats = ol.log.filter((x) => x.path !== '/api/generate' || x.prompt === '').map((x) => x.model);
  const runs = chats.filter((m, i) => m !== chats[i - 1]);
  assert.deepEqual(runs, ['qwen3:8b', 'qwen2.5vl:7b', 'llama3.2:3b', 'bge-m3:latest'], JSON.stringify(chats));
  // Prompt 43: ingen egen oppvarming lenger (gaten gir kald modell egen grense til første token), og keep_alive er per modell:
  // qwen3:8b 15m, llama3.2:3b 1h, qwen2.5vl:7b kort (2m) mens køen for den ikke er tom – så lastes den ut (keep_alive 0).
  const keepOf = (m) => ol.log.find((x) => x.model === m && x.path !== '/api/generate')?.keep;
  // Prompt 47: llama3.2:3b har ikke lenger 1 t keep_alive (standarden 30m gjelder).
  assert.deepEqual(['qwen3:8b', 'llama3.2:3b', 'qwen2.5vl:7b', 'bge-m3:latest'].map(keepOf), ['15m', '30m', '2m', '30m']);
  assert.ok(ol.log.some((x) => x.model === 'qwen2.5vl:7b' && x.path === '/api/generate' && x.keep === 0), 'qwen2.5vl:7b lastet ut når køen var tom');
  assert.deepEqual(r.body.groups.map((g) => g.model), ['qwen3:8b', 'qwen2.5vl:7b', 'llama3.2:3b', 'zbar', 'bge-m3:latest']);
  // Kald start med innlasting (400 ms) lengre enn den gamle grensen (300 ms) – likevel OK, fordi svarklokka starter etter innlastingen.
  assert.ok(LOAD_MS > ai._aiRunTest.statusMs);
});

test('minnesjekk: modell større enn minnet → «Hoppet over · for lite minne (trenger 9,6 GB, ledig … GB)», ikke tidsavbrudd', async () => {
  reset();
  await A('/api/ai/routing', 'PUT', { tasks: { dom: { model: 'gemma4:12b', fallback: '' } } });
  const r = await A('/api/ai/selftest', 'POST', {}, { accept: 'application/json' });
  const dom = r.body.results.find((x) => x.task === 'dom');
  assert.equal(dom.ok, false);
  assert.equal(dom.skipped, true);
  assert.match(dom.error, /^Hoppet over · for lite minne \(trenger 9,6 GB, ledig \d+(,\d)? GB\)$/);
  assert.equal(r.body.skipped, 1);
  assert.ok(!ol.log.some((x) => x.model === 'gemma4:12b'), 'aldri prøvd lastet');
  const j = ai.jobGet(dom.jobId, OWNER) ?? ai.jobGet(dom.jobId, sebId);
  assert.equal(j.status, 'skip');
  await A('/api/ai/routing', 'PUT', { tasks: { dom: { model: 'qwen3:8b', fallback: '' } } });
});

test('Ollama stoppet: én samlet melding «Får ikke kontakt med Ollama på …», ikke én feil per test', async () => {
  reset();
  ol.down = true;
  const before = db.prepare("SELECT count(*) FROM ai_runs WHERE status='fail'").pluck().get();
  const r = await A('/api/ai/selftest', 'POST', {}, { accept: 'application/json' });
  assert.equal(r.body.health.ok, false);
  assert.equal(r.body.health.error, 'Får ikke kontakt med Ollama på http://ollama.test:11434');
  assert.deepEqual(r.body.health.action, { k: 'test', label: 'Test tilkobling' });
  const ollamaRows = r.body.results.filter((x) => x.task !== 'bar');
  assert.ok(ollamaRows.every((x) => x.skipped && x.reason === 'nocontact'), JSON.stringify(ollamaRows));
  assert.equal(db.prepare("SELECT count(*) FROM ai_runs WHERE status='fail'").pluck().get() - before, 1, 'bare én feilet jobb');
  ol.down = false;
});

test('Jobber: feil gruppert på årsak, kort tekst, unseenFailed teller bare nye, seen nullstiller, Prøv alle igjen (nye grenser)', async () => {
  reset();
  // Tre gamle feil med samme årsak (slik skjermbildet viste) + én annen.
  for (const t of ['Kategorisering', 'Kvitteringer (bilde)', 'Glimt · brief']) { const id = ai.jobStart({ user: sebId, task: 'sok', title: `Selvtest · ${t}` }); ai.jobUpdate(id, { status: 'fail', error: `Glimt fikk ikke svar fra qwen3:8b: svarte ikke innen 15 s` }); }
  const o = ai.jobStart({ user: sebId, task: 'sok', title: 'Glimt · noe' }); ai.jobUpdate(o, { status: 'fail', error: 'Glimt fikk ikke svar fra x: Ollama kan ikke nås på http://ollama.test:11434 (ECONNREFUSED)' });
  const j = await A('/api/ai/jobs');
  assert.equal(j.status, 200);
  const g = j.body.groups.find((x) => x.reason === 'response_timeout:15');
  assert.equal(g.count, 3);
  assert.equal(g.short, 'Tidsavbrudd · svarte ikke på 15 s');
  assert.equal(g.label, '3 selvtester feilet · tidsavbrudd · svarte ikke på 15 s');
  assert.equal(g.selftest, true);
  assert.ok(j.body.groups.some((x) => x.reason === 'nocontact' && x.short === 'Ingen kontakt med Ollama'));
  assert.equal(j.body.recent.find((x) => x.id === o).short, 'Ingen kontakt med Ollama');
  assert.ok(j.body.unseenFailed >= 4);
  assert.deepEqual(j.body.timeouts, { loadTimeout: 90, responseTimeout: 60, responseTimeoutImage: 120, firstTokenTimeout: 30, idleTimeout: 30, idleTimeoutImage: 60 }); // prompt 43
  const s = await A('/api/ai/jobs/seen', 'POST', {});
  assert.equal(s.body.unseenFailed, 0);
  assert.equal((await A('/api/ai/jobs')).body.unseenFailed, 0);
  const t0 = Date.now();
  const rt = await A('/api/ai/jobs/retry', 'POST', { group: 'response_timeout:15', wait: true });
  assert.equal(rt.status, 200, rt.text);
  assert.deepEqual(rt.body.started.map((x) => x.task).sort(), ['brief', 'kat', 'rc']);
  const after = (await A('/api/ai/jobs')).body.recent.filter((x) => /^Selvtest · (Kategorisering|Kvitteringer|Glimt · brief)/.test(x.title) && x.status === 'ok' && Date.parse(x.startedAt) >= t0);
  assert.equal(after.length, 3, 'prøvd igjen med de nye tidsgrensene');
  assert.equal((await A('/api/ai/jobs/retry', 'POST', {})).status, 400);
});

test('faser i Kjører-raden: «Laster modellen fra disk · x av 5,2 GB» → «Tenker …» → «Svarer · 2 tegn»; klokka starter når jobben kjører', async () => {
  reset();
  const seen = [];
  const off = ai.subscribeJobs(OWNER, (jj) => { if (jj.phase) seen.push(jj.phase); });
  const out = await ai.run('sok', { user: OWNER, prompt: 'hei', phased: true, title: 'Fase-test' });
  off();
  assert.equal(out.text, 'ok');
  const kinds = [...new Set(seen.map((p) => p.kind))];
  assert.deepEqual(kinds, ['load', 'think', 'answer']);
  assert.equal(seen.find((p) => p.kind === 'load' && p.totalGb).totalGb, 5.2);
  assert.equal(seen.filter((p) => p.kind === 'answer').at(-1).chars, 2);
  const job = ai.jobGet(out.jobId, OWNER);
  assert.ok(job.runAt);
  assert.equal(job.phase, null, 'ferdig jobb har ingen fase');
  // Svargrensen gjelder bare svaret: innlasting 400 ms + svar 30 ms med svargrense 200 ms går fint.
  reset();
  ai._aiRunTest.respMs = 200;
  assert.equal((await ai.run('kat', { user: OWNER, prompt: 'hei', phased: true })).text, 'ok');
  // Innlasting over loadTimeout → «lastet ikke inn på … s».
  reset();
  ai._aiRunTest.loadMs = 100;
  await assert.rejects(ai.run('kat', { user: OWNER, prompt: 'hei', phased: true, noRetry: true }), (e) => /lastet ikke inn på 0 s/.test(e.message));
});

test('vakthund: en jobb som står på «Laster modellen fra disk» lenger enn loadTimeout avbrytes («Modellen ble ikke lastet (90 s)»)', () => {
  ai._aiRunTest.loadMs = null;
  const id = ai.jobStart({ user: OWNER, task: 'glimt', title: 'Glimt · anbefaler modeller' });
  ai.jobUpdate(id, { status: 'run', step: 'Laster modellen fra disk …', phase: { kind: 'load', loadedGb: 0, totalGb: 8.1 }, runAt: Date.now() - 200_000 });
  assert.deepEqual(ai.sweepHung(), [id]);
  const j = ai.jobGet(id, OWNER);
  assert.equal(j.status, 'fail');
  assert.equal(j.error, 'Modellen ble ikke lastet (90 s)'); // prompt 43: standard loadTimeout 90 s
  assert.equal(j.short, 'Tidsavbrudd · lastet ikke inn på 90 s');
  // Tidsgrensene kan endres (sekunder).
  assert.deepEqual(ai.cleanRouting({ params: { loadTimeout: 240, responseTimeout: 90, responseTimeoutImage: 150 } }).params.loadTimeout, 240);
  const errs = []; ai.cleanRouting({ params: { loadTimeout: 2 } }, undefined, errs);
  assert.match(errs[0], /loadTimeout må være 10–900/);
});
