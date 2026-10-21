// Prompt 43: Ollama-gaten (server/ollama-gate.js) mot en falsk Ollama som oppfører seg som brukerens Mac mini M4 16 GB:
// NUM_PARALLEL=1, bare plass til én av qwen3:8b / qwen2.5vl:7b, innlasting 2–40 s (skalert 1/100), strømmende svar, en forespørsel
// mot en modell som lastes ut brytes, og qwen3 tenker når think ikke er false. Se test/ollama-sim43.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p43-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-43';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.sim:11434';
process.env.AI_LOAD_MBPS = '20000';
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'OPENWEBUI_URL', 'AI_GPU_VRAM_GB']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { createOllamaSim } = await import('./ollama-sim43.js');
const sim = createOllamaSim({ base: 'http://ollama.sim:11434', scale: 0.01 });
const realFetch = globalThis.fetch;
globalThis.fetch = (u, i) => (String(u).startsWith('http://ollama.sim') ? sim.fetch(u, i) : realFetch(u, i));
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const ai = await import('../server/ai-run.js');
const gate = await import('../server/ollama-gate.js');
const opts = await import('../server/ollama-opts.js');
const brief = await import('../server/brief34.js');
const { OWNER } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const cookie = await login('sebastian', 'testpassord1');
const A = async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: j, text: t };
};
// Rutingen som hos brukeren: brief/dom = qwen3:8b, bar/rc = qwen2.5vl:7b, resten llama3.2:3b.
const ROUTES = { chat: 'llama3.2:3b', sok: 'llama3.2:3b', glimt: 'llama3.2:3b', kat: 'llama3.2:3b', fsok: 'llama3.2:3b', brief: 'qwen3:8b', dom: 'qwen3:8b', bar: 'qwen2.5vl:7b', rc: 'qwen2.5vl:7b' };
assert.equal((await A('/api/ai/routing', 'PUT', { tasks: Object.fromEntries(Object.entries(ROUTES).map(([k, m]) => [k, { model: m, fallback: '' }])) })).status, 200);

// Tidene skalert 1/100: loadTimeout 90 s → 900 ms, firstToken/idle 30 s → 300 ms. Backoff 2 s / 8 s → 20 / 80 ms.
const BASE = 'http://ollama.sim:11434';
beforeEach(() => {
  sim.reset(); gate._resetGate(); opts._resetThinkMemory(); ai.invalidateInventory();
  ai._aiRunTest.loadMs = 900; ai._aiRunTest.respMs = 300;
  Object.assign(gate._gateTest, { backoffMs: [20, 80], psTtlMs: 0, unloadGraceMs: 0, maxRetries: 2 });
});
const chatBody = (model, extra = {}) => ({ messages: [{ role: 'user', content: 'Svar bare: ok' }], options: { num_predict: 8 }, ...extra });
const ask = (model, o = {}) => gate.gateChat({ model, body: chatBody(model, o.body), base: BASE, loadMs: 900, warmMs: 300, idleMs: 300, priority: 'background', ...o });

/* ---------------- 1. Den ekte feilen ---------------- */

test('reproduksjon av den gamle feilen: utlasting (keep_alive:0) av en modell som svarer, bryter forespørselen – gaten gjør aldri det', async () => {
  // Før (konseptuelt): qwen3 svarer på brief, og ensureLoaded() for bildejobben sendte keep_alive:0 til «de andre» lastede modellene.
  sim.tokenMs = 30;
  const res = await sim.fetch(`${BASE}/api/chat`, { method: 'POST', body: JSON.stringify({ model: 'qwen3:8b', stream: true, messages: [{ role: 'user', content: 'Lag brief' }], options: { num_predict: 60 } }) });
  const reading = (async () => { const rd = res.body.getReader(); for (;;) { const { done } = await rd.read(); if (done) return 'ok'; } })().catch((e) => `brutt: ${e.message}`);
  await new Promise((r) => setTimeout(r, 200)); // lastet og midt i svaret
  await sim.fetch(`${BASE}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'qwen3:8b', prompt: '', keep_alive: 0, stream: false }) });
  assert.match(await reading, /^brutt: terminated/);
  assert.equal(sim.aborted, 1, 'forespørselen som pågikk ble avbrutt (som «Avbrutt etter 1–3 s»)');
  sim.tokenMs = 4;

  // Nå: de samme jobbene samtidig gjennom gaten (brief på qwen3, strekkode på qwen2.5vl, kategorisering på llama3.2).
  sim.reset();
  const jobs = [
    ai.run('brief', { user: OWNER, prompt: 'Lag brief', numPredict: 20, background: true, noRetry: true }),
    ai.run('bar', { user: OWNER, prompt: 'Les strekkoden', images: [ai.PIXEL], numPredict: 20, noRetry: true }),
    ai.run('kat', { user: OWNER, prompt: 'Kategori?', numPredict: 20, background: true, noRetry: true }),
    ai.run('brief', { user: OWNER, prompt: 'Lag kveldsbrief', numPredict: 20, background: true, noRetry: true }),
  ];
  const out = await Promise.allSettled(jobs);
  assert.deepEqual(out.map((x) => x.status), ['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled'], JSON.stringify(out.map((x) => x.reason?.message)));
  assert.equal(sim.maxInflight, 1, 'aldri to forespørsler til Ollama samtidig');
  assert.equal(sim.maxActiveModels, 1, 'aldri to ulike modeller samtidig');
  assert.equal(sim.aborted, 0, 'ingen forespørsel ble avbrutt av utlasting');
  for (const u of sim.unloads) assert.equal(u.activeAt, 0, `utlasting av ${u.model} bare når ingen forespørsel mot den pågikk`);
  // Den interaktive strekkodejobben (qwen2.5vl) gikk foran bakgrunnsjobbene.
  assert.equal(sim.log.find((x) => !x.unload).model, 'qwen2.5vl:7b');
});

/* ---------------- 2. Single-flight ---------------- */

test('brief: tre samtidige starter (runWindow, kickLlm og ?fresh=1) gir ett kall til Ollama', async () => {
  brief._setBriefWeather(async () => null);
  const isBrief = (x) => x.path === '/api/chat' && /Du er Glimt\. Skriv en/.test(JSON.stringify(x.body?.messages ?? ''));
  const p1 = brief.buildBrief(OWNER, { kind: 'morning', llm: true }); // runWindow-veien
  const p2 = brief.kickLlm(OWNER, 'morning'); // kickLlm-veien
  const p3 = A('/api/brief?kind=morning&fresh=1'); // ?fresh=1
  const [b1, , r3] = await Promise.all([p1, p2, p3]);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sim.log.filter(isBrief).length, 1, 'ett kall');
  assert.equal(b1.summarySource, 'glimt');
  assert.equal(r3.status, 200);
  // once(): samme nøkkel mens den kjører gir samme promise.
  let n = 0;
  const f = () => new Promise((r) => setTimeout(() => r(++n), 30));
  const [a, b] = await Promise.all([gate.once('x', f), gate.once('x', f)]);
  assert.deepEqual([a, b, n], [1, 1, 1]);
  assert.equal(await gate.once('x', f), 2, 'ny start etter at den forrige er ferdig');
  brief._setBriefWeather(null);
});

/* ---------------- 3. Gruppering og prioritet ---------------- */

test('gruppering per modell: bakgrunnsjobber for tre modeller kjøres gruppert; interaktive går foran; rettferdighet etter 6 jobber', async () => {
  const order = ['qwen3:8b', 'qwen2.5vl:7b', 'llama3.2:3b', 'qwen3:8b', 'qwen2.5vl:7b', 'llama3.2:3b', 'qwen3:8b', 'llama3.2:3b'];
  await Promise.all(order.map((m) => ask(m)));
  assert.deepEqual(sim.runs(), ['qwen3:8b', 'qwen2.5vl:7b', 'llama3.2:3b'], JSON.stringify(sim.log.map((x) => x.model)));
  assert.equal(sim.maxInflight, 1);

  // Interaktivt kall for en annen modell midt i en lang bakgrunnskø: tas som neste etter jobben som kjører.
  sim.reset(); gate._resetGate();
  const bg = Array.from({ length: 5 }, () => ask('qwen3:8b'));
  await new Promise((r) => setTimeout(r, 5));
  const inter = ask('llama3.2:3b', { priority: 'interactive' });
  await Promise.all([...bg, inter]);
  const ms = sim.log.filter((x) => !x.unload).map((x) => x.model);
  assert.equal(ms.indexOf('llama3.2:3b'), 1, JSON.stringify(ms));

  // Rettferdighet: 10 bakgrunnsjobber for qwen3 og én for llama → llama kjører etter maks 6 qwen3-jobber.
  sim.reset(); gate._resetGate();
  const many = Array.from({ length: 10 }, () => ask('qwen3:8b'));
  await new Promise((r) => setTimeout(r, 5));
  const other = ask('llama3.2:3b');
  await Promise.all([...many, other]);
  const ms2 = sim.log.filter((x) => !x.unload).map((x) => x.model);
  assert.ok(ms2.indexOf('llama3.2:3b') <= 6, JSON.stringify(ms2));

  // Samtidighet 2: bare samme modell parallelt, aldri to ulike.
  sim.reset(); gate._resetGate();
  await A('/api/ai/routing', 'PUT', { params: { ollamaConcurrency: 2 } });
  await Promise.all(['llama3.2:3b', 'qwen3:8b', 'llama3.2:3b', 'qwen3:8b'].map((m) => ask(m)));
  assert.equal(sim.maxActiveModels, 1, 'aldri to ulike modeller samtidig, selv med concurrency 2');
  await A('/api/ai/routing', 'PUT', { params: { ollamaConcurrency: 1 } });
});

/* ---------------- 4. Nye forsøk ---------------- */

test('nye forsøk: maks 2 med backoff (2 s / 8 s, her 20 / 80 ms), bakerst i køen; aldri ved 4xx eller avbrudd', async () => {
  sim.failures.push({ model: 'llama3.2:3b', kind: '500', text: 'llama runner process has terminated: signal: killed' }, { model: 'llama3.2:3b', kind: 'reset' });
  const t0 = Date.now();
  const out = await ask('llama3.2:3b');
  assert.equal(out.text, 'ok');
  assert.equal(out.telemetry.attempts, 3);
  assert.ok(Date.now() - t0 >= 100, 'ventet 20 + 80 ms');
  // Tre feil på rad → feilen etter 3 forsøk (maks 2 nye).
  for (let i = 0; i < 3; i++) sim.failures.push({ model: 'llama3.2:3b', kind: '500', text: 'server busy' });
  await assert.rejects(ask('llama3.2:3b'), (e) => e.kind === 'http' && e.status === 500 && e.telemetry.attempts === 3 && /Ollama HTTP 500: server busy/.test(e.message));
  // 4xx som ikke er forbigående: ingen nye forsøk.
  sim.failures.push({ model: 'llama3.2:3b', kind: '400', text: 'invalid options' });
  await assert.rejects(ask('llama3.2:3b'), (e) => e.kind === 'http' && e.status === 400 && e.telemetry.attempts === 1);
  // Avbrutt av brukeren: ingen nye forsøk.
  const ctrl = new AbortController();
  sim.failures.push({ model: 'llama3.2:3b', kind: '500', text: 'llama runner process has terminated' });
  const p = ask('llama3.2:3b', { signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 10);
  await assert.rejects(p, (e) => e.kind === 'cancelled');
  // Modellen lastet ut midt i svaret → klassifisert «unloaded», nytt forsøk lykkes.
  sim.tokenMs = 20;
  const q = ask('qwen3:8b', { body: { options: { num_predict: 30 }, messages: [{ role: 'user', content: 'Lag en lang tekst' }] } });
  setTimeout(() => sim.fetch(`${BASE}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'qwen3:8b', keep_alive: 0 }) }), 200);
  const r = await q;
  sim.tokenMs = 4;
  assert.equal(r.telemetry.attempts, 2);
  assert.ok(sim.aborted >= 1);
});

/* ---------------- 5. think:false ---------------- */

test('think:false sendes alltid til qwen3 på korte kall – også etter et 400-svar som ligner «does not support thinking»', async () => {
  // Et 400-svar som ligner (f.eks. en qwen3-variant uten tenkemal): bare dette kallet går uten think (og får tenke seg ferdig) …
  sim.failures.push({ model: 'qwen3:8b', kind: '400think' });
  const out = await ai.run('dom', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 80, temperature: 0, noRetry: true });
  assert.equal(out.text, 'ok');
  const sent = sim.log.filter((x) => x.model === 'qwen3:8b' && x.path === '/api/chat');
  assert.equal(sent[0].body.think, false);
  assert.ok(!opts.modelsWithoutThink().includes('qwen3:8b'), '400-minnet gjelder ikke tenkemodeller');
  // … og neste kall har think:false igjen (før: modellen ble husket som «uten think», og qwen3 tenkte på hvert kall).
  sim.log.length = 0;
  await ai.run('brief', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3, temperature: 0, noRetry: true });
  assert.equal(sim.log.find((x) => x.path === '/api/chat').body.think, false, 'neste kall har think:false igjen');
  assert.equal(opts.shortBody({ model: 'qwen3:8b' }, { user: OWNER }).think, false);
  // Den gamle helperen (ollamaPost) husker heller ikke tenkemodeller.
  const f = async (u, i) => (JSON.parse(i.body).think !== undefined ? Response.json({ error: '"qwen3:8b" does not support thinking' }, { status: 400 }) : Response.json({ ok: 1 }));
  await opts.ollamaPost(f, `${BASE}/api/chat`, { model: 'qwen3:8b', think: false });
  assert.equal(opts.shortBody({ model: 'qwen3:8b' }, { user: OWNER }).think, false);
  // Uten think:false tenker qwen3 og bruker opp num_predict (den gamle feilen bak «tomt svar»): simulatoren viser det.
  const raw = await gate.gateChat({ model: 'qwen3:8b', body: { messages: [{ role: 'user', content: 'Svar bare: ok' }], options: { num_predict: 10 } }, base: BASE, short: false, allowThink: true, retries: 0 });
  assert.equal(raw.text, '');
  assert.ok(raw.telemetry.thinkChars > 0);
});

/* ---------------- 6. Tidsgrenser ---------------- */

test('tidsgrenser: idle_timeout slår ikke til mens tokens strømmer; load_timeout og idle_timeout klassifiseres riktig', async () => {
  // 30 tokens à 25 ms ≈ 750 ms totalt, med idle 150 ms – går fint (den gamle totale grensen ville stoppet midt i svaret).
  sim.tokenMs = 25;
  const long = await ask('llama3.2:3b', { idleMs: 150, warmMs: 150, body: { options: { num_predict: 30 }, messages: [{ role: 'user', content: 'Lang tekst' }] } });
  assert.ok(long.telemetry.totalMs > 300, `${long.telemetry.totalMs}`);
  assert.ok(long.text.length > 10);
  sim.tokenMs = 4;
  // Kald modell som bruker 400 ms på å lastes, med grense 100 ms → load_timeout («lastet ikke inn på … s»).
  sim.reset(); gate._resetGate();
  await assert.rejects(ask('qwen2.5vl:7b', { loadMs: 100, retries: 0 }), (e) => e.kind === 'load_timeout' && /lastet ikke inn på 0 s/.test(e.message));
  // Varm modell som stopper midt i svaret i 500 ms, med idle 150 ms → idle_timeout («ingen nye tokens på … s»), ikke prøvd på nytt.
  sim.reset(); gate._resetGate();
  await ask('llama3.2:3b');
  sim.failures.push({ path: 'stall', model: 'llama3.2:3b', ms: 500 });
  await assert.rejects(ask('llama3.2:3b', { idleMs: 150 }), (e) => e.kind === 'idle_timeout' && /ingen nye tokens på 0 s/.test(e.message) && e.telemetry.attempts === 1);
  // Jobbloggen viser årsaken med tekst.
  assert.equal(ai.failReason('Glimt fikk ikke svar fra x: lastet ikke inn på 90 s').short, 'Tidsavbrudd · lastet ikke inn på 90 s');
  assert.equal(ai.failReason('Glimt fikk ikke svar fra x: ingen nye tokens på 30 s').short, 'Tidsavbrudd · ingen nye tokens på 30 s');
  assert.equal(ai.failReason('Glimt fikk ikke svar fra x: Modellen ble lastet ut underveis').short, 'Modellen ble lastet ut underveis');
  assert.equal(ai.failReason('Glimt fikk ikke svar fra x: Ollama HTTP 500: llama runner crashed').short, 'Ollama HTTP 500: llama runner crashed');
  assert.equal(ai.failReason('Avbrutt av bruker').short, 'Avbrutt av bruker');
  // run() skriver tidene og antall forsøk i jobben.
  sim.reset(); gate._resetGate();
  const r = await ai.run('kat', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3 });
  const j = ai.jobGet(r.jobId, OWNER);
  assert.equal(j.attempts, 1);
  assert.ok(j.timing.loadMs > 0 && j.timing.genMs > 0 && j.timing.queueMs >= 0 && j.timing.totalMs >= 0, JSON.stringify(j.timing));
});

/* ---------------- 7. keep_alive per modell ---------------- */

test('keep_alive per modell: llama3.2 1h, qwen3 15m, qwen2.5vl kort mens køen ikke er tom – og lastes ut når køen er tom', async () => {
  await Promise.all([ask('llama3.2:3b'), ask('qwen3:8b'), ask('qwen2.5vl:7b'), ask('qwen2.5vl:7b')]);
  await new Promise((r) => setTimeout(r, 30));
  const keep = (m) => sim.log.find((x) => x.model === m && !x.unload).body.keep_alive;
  assert.deepEqual([keep('llama3.2:3b'), keep('qwen3:8b'), keep('qwen2.5vl:7b')], ['1h', '15m', gate.SHORT_KEEP]);
  const un = sim.log.filter((x) => x.unload);
  assert.deepEqual(un.map((x) => x.model), ['qwen2.5vl:7b'], 'lastet ut én gang, etter de to jobbene');
  assert.equal(sim.unloads[0].activeAt, 0);
  assert.ok(!sim.loaded.has('qwen2.5vl:7b'));
  // gateState til AI-kontroll: lastede modeller fra /api/ps (qwen2.5vl tok plassen, så llama3.2 lastes inn igjen her).
  await ask('llama3.2:3b');
  await gate.loadedModels({ base: BASE, force: true });
  const st = gate.gateState();
  assert.ok(st.loaded.some((m) => m.name === 'llama3.2:3b' && m.keepAlive === '1h'), JSON.stringify(st.loaded));
  assert.deepEqual(st.waiting, []);
  // Endres i innstillingene (validert).
  let r = await A('/api/ai/routing', 'PUT', { params: { modelKeepAlive: { 'qwen3:8b': '30m', 'llama3.2:3b': 'alltid' } } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.params.modelKeepAlive['qwen3:8b'], r.body.params.modelKeepAlive['llama3.2:3b'], r.body.params.modelKeepAlive['qwen2.5vl:7b']], ['30m', -1, 0]);
  assert.equal((await A('/api/ai/routing', 'PUT', { params: { modelKeepAlive: { 'qwen3:8b': 'av og til' } } })).status, 400);
  assert.equal((await A('/api/ai/routing', 'PUT', { params: { ollamaConcurrency: 9 } })).status, 400);
  r = await A('/api/ai/routing', 'PUT', { params: { firstTokenTimeout: 45, idleTimeout: 40, idleTimeoutImage: 90, modelKeepAlive: { 'qwen3:8b': '15m', 'llama3.2:3b': '1h' } } });
  assert.deepEqual([r.body.params.firstTokenTimeout, r.body.params.idleTimeout, r.body.params.idleTimeoutImage], [45, 40, 90]);
  assert.deepEqual(r.body.options.modelKeepAlive, [0, '5m', '15m', '30m', '1h', -1]);
  await A('/api/ai/routing', 'PUT', { params: { firstTokenTimeout: 30, idleTimeout: 30, idleTimeoutImage: 60 } });
});

/* ---------------- 8. Selvtest ---------------- */

test('selvtest mot simulatoren: llama3.2:3b, qwen3:8b og qwen2.5vl:7b – alle OK, med køtid, lastetid og genereringstid', async () => {
  const tasks = ai.SELFTEST_TASKS.filter((t) => t !== 'kb'); // brukeren har ingen embedding-modell (Kunnskapsbase)
  const r = await ai.selftest({ user: OWNER, tasks });
  const bad = r.results.filter((x) => !x.ok);
  assert.deepEqual(bad, [], JSON.stringify(bad));
  assert.equal(sim.maxInflight, 1);
  assert.equal(sim.maxActiveModels, 1);
  assert.equal(sim.aborted, 0);
  const rows = r.results.map((x) => ({ task: x.task, model: x.model, ok: x.ok, ...(x.timing ? { queueMs: x.timing.queueMs, loadMs: x.timing.loadMs, genMs: x.timing.genMs, totalMs: x.timing.totalMs } : {}), attempts: x.attempts ?? null }));
  console.table(rows);
  const row = (t) => r.results.find((x) => x.task === t);
  assert.equal(row('brief').model, 'qwen3:8b');
  assert.equal(row('bar').model, 'qwen2.5vl:7b');
  assert.equal(row('rc').model, 'qwen2.5vl:7b');
  assert.ok(row('bar').timing.attempts === 1);
  // Gruppert: én innlasting per modell (rc og bar etter hverandre).
  assert.deepEqual(new Set(sim.runs((x) => x.path === '/api/chat')), new Set(['llama3.2:3b', 'qwen2.5vl:7b', 'qwen3:8b']));
  assert.equal(new Set(sim.runs((x) => x.path === '/api/chat')).size, sim.runs((x) => x.path === '/api/chat').length, 'hver modell lastet én gang');
});

/* ---------------- 9. Byttbar backend ---------------- */

test('backend-grensesnittet: chatStream(req, {onToken, signal}) → {text, usage, timing}; samme kø og «aldri to modeller samtidig» på tvers av backends', async () => {
  let active = 0, maxActive = 0;
  const models = new Set();
  gate.registerBackend('test43', {
    async chatStream(req, { onToken, signal }) {
      active++; maxActive = Math.max(maxActive, active); models.add(req.model);
      try {
        let text = '';
        for (const t of ['o', 'k']) { await new Promise((r, j) => { const x = setTimeout(r, 15); signal.addEventListener('abort', () => { clearTimeout(x); j(new Error('abort')); }); }); text += t; await onToken({ text: t }); }
        return { text, content: text, usage: { tokIn: 3, tokOut: 2 }, timing: { loadMs: 0, promptMs: 1, genMs: 30 } };
      } finally { active--; }
    },
  });
  const tokens = [];
  const [a, b, c] = await Promise.all([
    gate.gateChat({ model: 'qwen3:8b', backend: 'test43', body: {}, base: BASE, onChunk: (j) => tokens.push(j.text) }),
    ask('qwen2.5vl:7b'),
    gate.gateChat({ model: 'llama3.2:3b', backend: 'test43', body: {}, base: BASE }),
  ]);
  assert.equal(a.text, 'ok');
  assert.deepEqual(tokens, ['o', 'k']);
  assert.deepEqual([a.telemetry.tokOut, a.telemetry.genMs], [2, 30]);
  assert.equal(b.text, 'ok');
  assert.equal(c.text, 'ok');
  assert.equal(maxActive, 1);
  assert.equal(sim.maxInflight, 1);
  // Open WebUI-backenden er bare grensesnittet foreløpig.
  await assert.rejects(gate.gateChat({ model: 'llama3.2:3b', backend: 'openwebui', body: {}, base: BASE, retries: 0 }), (e) => e.kind === 'http' && e.status === 501);
  assert.deepEqual(gate.backendNames().slice(0, 2), ['ollama', 'openwebui']);
});
