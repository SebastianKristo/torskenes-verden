// Prompt 44: én sentral AI-klient med to backends (Open WebUI 0.12 og Ollama direkte) som deler køen, eget nettsøk i Glimt,
// rutingssteg før hovedmodellen, strømpris-verktøy og «Mine data» bare med de relevante delene.
// Simulatorer: test/ollama-sim43.js (Ollama 0.34 på Mac mini M4) og test/owui-sim44.js (Open WebUI 0.12.3 som sender alt videre
// til samme falske Ollama). Ingen ekte nettverk.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEY = 'sk-p44-hemmelig-owui-nokkel-0123456789';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p44-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-44';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.sim:11434';
process.env.OPENWEBUI_URL = 'http://owui.sim:8080';
process.env.OPENWEBUI_KEY = KEY;
process.env.AI_LOAD_MBPS = '20000';
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'AI_GPU_VRAM_GB', 'AI_BACKEND', 'SEARXNG_URL', 'BRAVE_API_KEY']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Alt som logges, samles (nøkkelen skal aldri stå der).
const logged = [];
for (const k of ['log', 'info', 'warn', 'error']) { const orig = console[k].bind(console); console[k] = (...a) => { logged.push(a.map((x) => (typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ')); orig(...a); }; }

const { createOllamaSim } = await import('./ollama-sim43.js');
const { createOwuiSim } = await import('./owui-sim44.js');
const sim = createOllamaSim({ base: 'http://ollama.sim:11434', scale: 0.01 });
const owui = createOwuiSim({ base: 'http://owui.sim:8080', key: KEY, ollama: sim });
// Falsk hvakosterstrommen.no: 96 kvarterspriser, NOK/kWh = 0,50 + 0,01 × time (uten mva).
const powerCalls = [];
const { offsetMin } = await import('../server/chat-tools41.js');
function fakePower(url) {
  powerCalls.push(url);
  const m = url.match(/prices\/(\d{4})\/(\d{2})-(\d{2})_(NO[1-5])\.json$/);
  const date = `${m[1]}-${m[2]}-${m[3]}`, off = offsetMin('Europe/Oslo', Date.parse(`${date}T12:00:00Z`));
  const sign = off >= 0 ? '+' : '-', oh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const rows = [];
  for (let q = 0; q < 96; q++) {
    const h = Math.floor(q / 4), mm = (q % 4) * 15;
    rows.push({ NOK_per_kWh: Math.round((0.5 + 0.01 * h) * 100000) / 100000, EUR_per_kWh: 0.04, EXR: 11.7, time_start: `${date}T${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${sign}${oh}:00`, time_end: '' });
  }
  return Response.json(rows);
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => {
  const s = String(u);
  if (s.startsWith('http://ollama.sim')) return sim.fetch(u, i);
  if (s.startsWith('http://owui.sim')) return owui.fetch(u, i);
  if (s.startsWith('https://www.hvakosterstrommen.no/')) return fakePower(s);
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
};
test.after(() => { globalThis.fetch = realFetch; });

// Svaret fra den falske modellen bygger på det som står i systemprompten (søketreff og strømpris).
sim.answer = (body) => {
  const sys = String(body.messages?.[0]?.role === 'system' ? body.messages[0].content : '');
  if (/Søkeresultater \(hentet nå\)/.test(sys)) { const h = sys.match(/\[1\] ([^–\n]+)–\s*([^–\n]+)–/); return /Andy Burnham/.test(sys) ? `Statsministeren i Storbritannia er Andy Burnham (${h?.[2]?.trim() ?? 'kilde'}).` : 'Søket var uklart.'; }
  const p = sys.match(/Strømpris \(hentet nå[^)]*\) for (NO\d)[^:]*: snitt (\d+(?:,\d+)?), min (\d+(?:,\d+)?), maks (\d+(?:,\d+)?)/);
  if (p) return `I ${p[1]} er snittet ${p[2]} øre/kWh (min ${p[3]}, maks ${p[4]}).`;
  return null;
};

const { default: app } = await import('../server/index.js');
const ai = await import('../server/ai-run.js');
const gate = await import('../server/ai-gate.js');
const opts = await import('../server/ollama-opts.js');
const web = await import('../server/web-search.js');
const router = await import('../server/tool-router44.js');
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
const sse = (t) => t.split('\n\n').map((b) => { const ev = b.match(/^event: (.+)$/m)?.[1]; const d = b.match(/^data: (.+)$/m)?.[1]; return ev ? { event: ev, data: d ? JSON.parse(d) : null } : null; }).filter(Boolean);
const ROUTES = { chat: 'llama3.2:3b', sok: 'llama3.2:3b', glimt: 'llama3.2:3b', kat: 'llama3.2:3b', fsok: 'llama3.2:3b', brief: 'qwen3:8b', dom: 'qwen3:8b', bar: 'qwen2.5vl:7b', rc: 'qwen2.5vl:7b' };
assert.equal((await A('/api/ai/routing', 'PUT', { tasks: Object.fromEntries(Object.entries(ROUTES).map(([k, m]) => [k, { model: m, fallback: '' }])) })).status, 200);
const BASE = 'http://ollama.sim:11434';
const setBackend = async (mode) => { const r = await A('/api/ai/backend', 'PUT', { mode }); assert.equal(r.status, 200, r.text); assert.equal(r.body.effective, mode); return r.body; };
beforeEach(() => {
  sim.reset(); owui.reset(); gate._resetGate(); opts._resetThinkMemory(); ai.invalidateInventory(); web.clearWebCache(); gate.clearThinkLeak();
  owui.forwardThink = true; owui.thinkTags = false; owui.key = KEY; owui.webHits = createOwuiSim().webHits;
  ai._aiRunTest.loadMs = 900; ai._aiRunTest.respMs = 300;
  Object.assign(gate._gateTest, { backoffMs: [20, 80], psTtlMs: 0, unloadGraceMs: 0, maxRetries: 2 });
});
const chatBody = (extra = {}) => ({ messages: [{ role: 'user', content: 'Svar bare: ok' }], options: { num_predict: 8 }, ...extra });
const bg = { base: BASE, loadMs: 900, warmMs: 300, idleMs: 300, priority: 'background' };
const lastSystem = () => { const x = sim.log.filter((e) => e.path === '/api/chat' && e.body?.messages?.[0]?.role === 'system').at(-1); return String(x?.body.messages[0].content ?? ''); };
const NOW_RE = /Nå: (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag) \d{1,2}\. (januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember) \d{4} kl\. \d{2}\.\d{2} \(Europe\/Oslo\)/;

/* ---------------- 1. Begge backends i samme kø ---------------- */

test('begge backends: kø per modell på tvers av backends (samme modellnavn = samme modell), aldri to modeller samtidig, ingen avbrudd', async () => {
  const cfg = await setBackend('openwebui');
  assert.equal(cfg.openwebui.configured, true);
  assert.ok(!JSON.stringify(cfg).includes(KEY), 'nøkkelen sendes aldri til frontenden');
  // Mens llama3.2 kjører direkte: qwen3 via Open WebUI, qwen2.5vl direkte og qwen3 direkte → qwen3-jobbene grupperes på tvers.
  const first = gate.gateChat({ model: 'llama3.2:3b', backend: 'ollama', body: chatBody(), ...bg });
  await new Promise((r) => setTimeout(r, 5));
  const a = gate.gateChat({ model: 'qwen3:8b', backend: 'openwebui', body: chatBody(), ...bg });
  const b = gate.gateChat({ model: 'qwen2.5vl:7b', backend: 'ollama', body: chatBody(), ...bg });
  const c = gate.gateChat({ model: 'qwen3:8b', backend: 'ollama', body: chatBody(), ...bg });
  const out = await Promise.all([first, a, b, c]);
  assert.deepEqual(out.map((x) => x.text), ['ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(out.map((x) => x.telemetry.backend), ['ollama', 'openwebui', 'ollama', 'ollama']);
  assert.deepEqual(sim.log.filter((x) => !x.unload).map((x) => x.model), ['llama3.2:3b', 'qwen3:8b', 'qwen3:8b', 'qwen2.5vl:7b'], 'qwen3 gruppert på tvers av backends');
  assert.equal(owui.log.length, 1);
  // Open WebUI fikk think:false både som toppfelt og i params, og keep_alive begge steder; Ollama fikk think:false videre.
  const ob = owui.log[0].body;
  assert.equal(ob.think, false); assert.equal(ob.params.think, false);
  assert.equal(ob.keep_alive, '15m'); assert.equal(ob.params.keep_alive, '15m');
  assert.equal(ob.stream, true);
  assert.equal(sim.log.find((x) => x.model === 'qwen3:8b').body.think, false);

  // Ekte oppgaver samtidig (ruteren velger backend): alle via Open WebUI, én forespørsel om gangen, ingen brudd.
  sim.reset(); owui.reset(); gate._resetGate();
  const jobs = await Promise.allSettled([
    ai.run('brief', { user: OWNER, prompt: 'Lag brief', numPredict: 20, background: true, noRetry: true }),
    ai.run('bar', { user: OWNER, prompt: 'Les strekkoden', images: [ai.PIXEL], numPredict: 20, noRetry: true }),
    ai.run('kat', { user: OWNER, prompt: 'Kategori?', json: true, numPredict: 20, background: true, noRetry: true }),
    gate.gateChat({ model: 'qwen3:8b', backend: 'ollama', body: chatBody(), ...bg }),
    ai.run('brief', { user: OWNER, prompt: 'Lag kveldsbrief', numPredict: 20, background: true, noRetry: true }),
  ]);
  assert.deepEqual(jobs.map((x) => x.status), Array(5).fill('fulfilled'), JSON.stringify(jobs.map((x) => x.reason?.message)));
  assert.equal(sim.maxInflight, 1, 'aldri to forespørsler til Ollama samtidig');
  assert.equal(sim.maxActiveModels, 1, 'aldri to ulike modeller samtidig');
  assert.equal(sim.aborted, 0, 'ingen forespørsel ble avbrutt');
  for (const u of sim.unloads) assert.equal(u.activeAt, 0);
  assert.equal(owui.log.length, 4, 'fire via Open WebUI, én direkte');
  // Bildet gikk som OpenAI image_url (data-URL), JSON som response_format + format.
  const bar = owui.log.find((x) => x.body.model === 'qwen2.5vl:7b').body;
  assert.match(bar.messages.at(-1).content.find((p) => p.type === 'image_url').image_url.url, /^data:image\/png;base64,iVBOR/);
  const kat = owui.log.find((x) => x.body.model === 'llama3.2:3b').body;
  assert.deepEqual(kat.response_format, { type: 'json_object' });
  assert.equal(kat.format, 'json');
  assert.equal(kat.think, undefined, 'think sendes bare til tenkemodeller');
  // Jobbloggen har backend ved siden av modellen.
  const j = ai.jobGet(jobs[0].value.jobId, OWNER);
  assert.equal(j.backend, 'openwebui');
  assert.equal(j.model, 'qwen3:8b');
  assert.ok(j.timing.genMs >= 0);

  // ai_backend = ollama: de samme oppgavene går direkte.
  await setBackend('ollama');
  sim.reset(); owui.reset(); gate._resetGate();
  const r = await ai.run('kat', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3 });
  assert.equal(r.text, 'ok');
  assert.equal(owui.log.length, 0);
  assert.equal(ai.jobGet(r.jobId, OWNER).backend, 'ollama');
  // Embeddings og innlasting går alltid direkte til Ollama.
  assert.equal(gate.chooseBackend({ kind: 'embed', model: 'x' }).backend, 'ollama');
  assert.equal(gate.chooseBackend({ kind: 'load', model: 'x' }).backend, 'ollama');
  await setBackend('openwebui');
});

/* ---------------- 2. Open WebUI slår ikke av tenking ---------------- */

test('Open WebUI som IKKE videresender think: tenkingen måles, modellen merkes, og jobben går direkte til Ollama («via Ollama direkte …»)', async () => {
  await setBackend('openwebui');
  owui.forwardThink = false; // qwen3 tenker, og tenkingen bruker opp num_predict
  const r = await ai.run('brief', { user: OWNER, prompt: 'Lag brief', numPredict: 20, noRetry: true });
  assert.ok(r.text.length > 0, 'svaret kom (direkte fra Ollama)');
  assert.equal(owui.log.length, 1, 'første kall via Open WebUI');
  assert.equal(owui.log[0].forwarded.think, undefined, 'Open WebUI sendte ikke think videre');
  const direct = sim.log.filter((x) => x.model === 'qwen3:8b');
  assert.equal(direct.length, 2);
  assert.equal(direct[1].body.think, false, 'direkte kall har think:false');
  const j = ai.jobGet(r.jobId, OWNER);
  assert.equal(j.backend, 'ollama');
  assert.equal(j.backendNote, 'via Ollama direkte: Open WebUI slo ikke av tenking');
  assert.ok(Object.keys(gate.thinkLeaks()).includes('qwen3:8b'));
  // Neste kall med modellen går rett til Ollama (ingen omvei).
  owui.reset();
  const r2 = await ai.run('dom', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3, noRetry: true });
  assert.equal(r2.text, 'ok');
  assert.equal(owui.log.length, 0);
  assert.equal(ai.jobGet(r2.jobId, OWNER).backendNote, 'via Ollama direkte: Open WebUI slo ikke av tenking');
  const jobsApi = await A('/api/ai/jobs');
  assert.ok(jobsApi.body.recent.some((x) => x.backend === 'ollama' && /Open WebUI slo ikke av tenking/.test(x.backendNote ?? '')));
  // llama3.2 (ikke tenkemodell) går fortsatt via Open WebUI.
  const r3 = await ai.run('kat', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3 });
  assert.equal(ai.jobGet(r3.jobId, OWNER).backend, 'openwebui');
  assert.deepEqual((await A('/api/ai/backend')).body.thinkLeaks.map((x) => x.model), ['qwen3:8b']);
  // Selvtesten med alle oppgaver: alle OK, qwen3-oppgavene direkte til Ollama.
  const st = await ai.selftest({ user: OWNER, tasks: ai.SELFTEST_TASKS.filter((t) => t !== 'kb') });
  assert.deepEqual(st.results.filter((x) => !x.ok), []);
  assert.deepEqual(st.results.filter((x) => x.model === 'qwen3:8b').map((x) => x.timing.backend), ['ollama', 'ollama']);
  assert.ok(st.results.filter((x) => x.model !== 'qwen3:8b').every((x) => x.timing.backend === 'openwebui'));
  // <think>-tagger i innholdet telles også (og vises aldri).
  gate.clearThinkLeak(); owui.thinkTags = true; owui.reset();
  const r4 = await ai.run('dom', { user: OWNER, prompt: 'Lag sammendrag', numPredict: 60, noRetry: true });
  assert.ok(!/think|hmm/.test(r4.text), r4.text);
  assert.ok(Object.keys(gate.thinkLeaks()).includes('qwen3:8b'));
  // Med think videresendt: ingen merking.
  gate.clearThinkLeak(); owui.forwardThink = true; owui.thinkTags = false;
  await ai.run('dom', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3 });
  assert.deepEqual(gate.thinkLeaks(), {});
  assert.equal(owui.log.at(-1).forwarded.think, false);
});

/* ---------------- 3. Nøkkelen ---------------- */

test('API-nøkkelen står aldri i logg, jobblogg, feilmeldinger eller svar til frontenden', async () => {
  await setBackend('openwebui');
  owui.key = 'sk-en-annen-nokkel'; // Open WebUI godtar ikke nøkkelen vår (og gjentar den i feilteksten)
  await assert.rejects(ai.run('kat', { user: OWNER, prompt: 'Svar bare: ok', numPredict: 3, noRetry: true }), (e) => {
    assert.match(e.message, /Open WebUI HTTP 401/);
    assert.ok(!e.message.includes(KEY), e.message);
    return true;
  });
  const chat = await A('/api/chat/send', 'POST', { model: 'llama3.2:3b', messages: [{ role: 'user', content: 'Hei' }] });
  assert.ok(!chat.text.includes(KEY));
  assert.ok(sse(chat.text).some((e) => e.event === 'error' && /401/.test(e.data.error)), chat.text);
  const t = await A('/api/ai/backend/test', 'POST', { which: 'openwebui' });
  assert.equal(t.body.ok, false);
  for (const p of ['/api/ai/jobs', '/api/ai/backend', '/api/ai/keys', '/api/ai/status', '/api/integrations', '/api/config']) {
    const r = await A(p);
    assert.ok(!r.text.includes(KEY), `${p} inneholder nøkkelen`);
  }
  assert.ok(!t.text.includes(KEY));
  assert.ok((await A('/api/ai/backend')).body.openwebui.configured === true);
  owui.key = KEY;
  assert.equal((await A('/api/ai/backend/test', 'POST', { which: 'openwebui' })).body.ok, true);
  const ol = await A('/api/ai/backend/test', 'POST', { which: 'ollama' });
  assert.equal(ol.body.ok, true); assert.equal(ol.body.version, '0.34.0'); assert.ok(Number.isFinite(ol.body.ms));
  const leaked = logged.filter((l) => l.includes(KEY));
  assert.deepEqual(leaked, [], 'nøkkelen ble logget');
  assert.equal(gate.maskSecrets(`Bearer ${KEY} og ${KEY}`).includes(KEY), false);
});

/* ---------------- 4. Nettsøk ---------------- */

for (const mode of ['openwebui', 'ollama']) {
  test(`nettsøk (${mode}): «hvem er statsminister i England» → rutingen velger web; systemprompten har dato, tid og treff; svaret bygger på treffet; used = Nettsøk`, async () => {
    await setBackend(mode);
    assert.deepEqual(router.routeLocal('hvem er statsminister i England').tools, ['web']);
    const r = await A('/api/chat/send', 'POST', { model: 'llama3.2:3b', myData: true, messages: [{ role: 'user', content: 'hvem er statsminister i England' }] });
    assert.equal(r.status, 200, r.text);
    const evs = sse(r.text);
    const done = evs.find((e) => e.event === 'done')?.data;
    assert.ok(done, r.text);
    assert.deepEqual(done.used, ['Nettsøk'], 'ikke Finans, Kalender eller Huskeliste');
    assert.deepEqual(done.tools, ['web']);
    assert.equal(done.backend, mode);
    assert.equal(done.web.provider, 'openwebui');
    assert.equal(done.web.query, 'hvem er statsminister i England');
    assert.ok(done.web.hits.length >= 3 && done.web.hits.length <= 5);
    assert.ok(done.web.hits.every((h) => h.title && h.url && h.source));
    assert.equal(done.facts.find((f) => f.tool === 'web').provider, 'openwebui');
    const text = evs.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    assert.match(text, /Andy Burnham/);
    const sys = lastSystem();
    assert.match(sys, NOW_RE);
    assert.match(sys, /Søkeresultater \(hentet nå\)/);
    assert.match(sys, /\[1\] Andy Burnham becomes Prime Minister – BBC –/);
    assert.match(sys, /Svar ut fra søkeresultatene, ikke fra det du lærte i treningen\. Kunnskapen din kan være utdatert\. Oppgi kilden kort, f\.eks\. \(NRK\)\./);
    assert.ok(!/Brukerens egne data/.test(sys), 'Mine data ble ikke lagt ved');
    // Søkejobber: num_ctx minst 8192.
    const sent = sim.log.filter((e) => e.path === '/api/chat').at(-1).body;
    assert.ok(sent.options.num_ctx >= 8192, JSON.stringify(sent.options));
    assert.deepEqual(owui.searches.map((x) => x.body), [{ queries: ['hvem er statsminister i England'] }]);
    // Jobbloggen: backend, verktøy og nettsøk.
    const j = (await A('/api/ai/jobs')).body.recent.find((x) => x.task === 'chat');
    assert.equal(j.backend, mode);
    assert.deepEqual(j.tools, ['web']);
    assert.deepEqual(j.web, { query: 'hvem er statsminister i England', hits: 3, provider: 'openwebui' });
    // Lagret med kildene (klientene kan vise dem).
    const saved = (await A(`/api/chat/chats/${done.chatId}`)).body.messages.at(-1).meta;
    assert.equal(saved.web.hits[0].source, 'BBC');
    // Glimt-søket på Hjem bruker samme ruting og nettsøk.
    const g = await A('/api/assist', 'POST', { q: 'hvem er statsminister i England' });
    assert.equal(g.status, 200, g.text);
    assert.match(g.body.text, /Andy Burnham/);
    assert.equal(g.body.web.provider, 'openwebui');
    assert.deepEqual(g.body.used, ['Nettsøk']);
    assert.match(g.body.source, /^Nettsøk · BBC/);
  });
}

test('ingen nettsøk når søket ikke ga treff: ingen «Nettsøk», ingen meta.web, ingen søkeblokk', async () => {
  await setBackend('openwebui');
  owui.webHits = [];
  const r = await web.webSearch('hvem er statsminister i England');
  assert.deepEqual(r.hits, []);
  assert.equal(r.provider, null);
  assert.deepEqual(r.tried.map((x) => [x.provider, x.ok]), [['openwebui', false], ['searxng', false], ['brave', false], ['ddg', false]]);
  web.clearWebCache();
  const s = await A('/api/chat/send', 'POST', { model: 'llama3.2:3b', myData: true, messages: [{ role: 'user', content: 'hvem er statsminister i England' }] });
  const done = sse(s.text).find((e) => e.event === 'done').data;
  assert.ok(!done.used.includes('Nettsøk'));
  assert.equal(done.web, undefined);
  assert.ok(!/Søkeresultater/.test(lastSystem()));
  assert.match(lastSystem(), NOW_RE, 'dato og tid står der uansett');
  const j = (await A('/api/ai/jobs')).body.recent.find((x) => x.task === 'chat');
  assert.deepEqual(j.web, { query: 'hvem er statsminister i England', hits: 0, provider: null });
  // «Test nettsøk» i AI-kontroll viser treffene og kilden som svarte.
  owui.webHits = createOwuiSim().webHits;
  const t = await A('/api/ai/websearch/test', 'POST', { q: 'statsminister Storbritannia' });
  assert.equal(t.body.provider, 'openwebui');
  assert.equal(t.body.hits.length, 3);
  assert.ok(t.body.hits[0].snippet.length <= 610);
  // Eldre Open WebUI som bare godtar {query}: andre forsøk.
  owui.webShape = 'old'; web.clearWebCache();
  assert.equal((await web.webSearch('statsminister')).hits.length, 3);
  owui.webShape = '0.12';
  // Tolkerne: DuckDuckGo-HTML og Open WebUI-svar uten lenker.
  const ddg = web.parseDdg('<div class="result results_links"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.nrk.no%2Fx&amp;rut=1">Tittel &amp; mer</a><a class="result__snippet" href="#">Et <b>utdrag</b></a></div>');
  assert.deepEqual(ddg, [{ title: 'Tittel & mer', url: 'https://www.nrk.no/x', snippet: 'Et utdrag', source: 'NRK' }]);
  assert.equal(web.parseOpenWebui({ docs: [{ content: 'Bare innhold' }] })[0].snippet, 'Bare innhold');
});

/* ---------------- 5. Strømpris ---------------- */

test('strømpris: «hva er strømprisen i Oslo i dag» → power med NO1-tall (øre/kWh med og uten mva)', async () => {
  await setBackend('openwebui');
  assert.deepEqual(router.routeLocal('hva er strømprisen i Oslo i dag').tools, ['power']);
  powerCalls.length = 0;
  const r = await A('/api/chat/send', 'POST', { model: 'llama3.2:3b', myData: true, messages: [{ role: 'user', content: 'hva er strømprisen i Oslo i dag' }] });
  const evs = sse(r.text);
  const done = evs.find((e) => e.event === 'done').data;
  assert.deepEqual(done.tools, ['power']);
  assert.deepEqual(done.used, ['Strømpris · NO1']);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  assert.match(powerCalls[0], new RegExp(`/api/v1/prices/${today.slice(0, 4)}/${today.slice(5, 7)}-${today.slice(8, 10)}_NO1\\.json$`));
  const f = done.facts.find((x) => x.tool === 'power');
  assert.equal(f.zone, 'NO1');
  // 0,50 + 0,01 × time kr/kWh → snitt 61,5 øre uten mva, 76,9 med; min 50 / 62,5; maks 73 / 91,3; billigst 00–01, dyrest 23–00.
  assert.deepEqual([f.values.exVat.avg, f.values.exVat.min, f.values.exVat.max], [61.5, 50, 73]);
  assert.deepEqual([f.values.withVat.avg, f.values.withVat.min, f.values.withVat.max], [76.9, 62.5, 91.3]);
  assert.deepEqual([f.values.withVat.cheapest.hour, f.values.withVat.priciest.hour], ['00–01', '23–00']);
  assert.equal(f.values.resolution, '15 min');
  assert.equal(f.values.source, 'hvakosterstrommen.no');
  assert.ok(f.values.withVat.now >= 62.5 && f.values.withVat.now <= 91.3);
  const text = evs.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.match(text, /NO1 er snittet 76,9 øre\/kWh \(min 62,5, maks 91,3\)/);
  assert.match(lastSystem(), /Strømpris \(hentet nå, hvakosterstrommen\.no\) for NO1 Oslo/);
  assert.ok(!/Brukerens egne data/.test(lastSystem()));
  // NO4 har ikke mva; Bergen er NO5.
  const { powerFact, zoneOf } = await import('../server/power-price.js');
  const n4 = await powerFact('strømprisen i Tromsø i dag');
  assert.equal(n4.zone, 'NO4'); assert.equal(n4.values.vat, false); assert.equal(n4.values.withVat.avg, 61.5);
  assert.equal(zoneOf('hva koster strømmen i Bergen'), 'NO5');
  assert.equal(zoneOf('strømpris Stavanger'), 'NO2');
  // Glimt-søket på Hjem svarer med verktøyet (ingen modell).
  const g = await A('/api/assist', 'POST', { q: 'hva er strømprisen i Oslo i dag' });
  assert.equal(g.body.tool, 'Strømpris');
  assert.match(g.body.text, /NO1.*76,9 øre\/kWh/);
});

/* ---------------- 6. Mine data ---------------- */

test('Mine data: bare de delene rutingen valgte (Finans for forbruk, Kalender for avtaler, ingen for vær)', async () => {
  await setBackend('openwebui');
  const ask = async (q) => { const r = await A('/api/chat/send', 'POST', { model: 'llama3.2:3b', myData: true, messages: [{ role: 'user', content: q }] }); return { done: sse(r.text).find((e) => e.event === 'done')?.data, sys: lastSystem() }; };
  let x = await ask('Hvor mye brukte jeg på mat i forrige måned?');
  assert.deepEqual(x.done.tools, ['finans']);
  assert.match(x.sys, /Brukerens egne data/);
  assert.match(x.sys, /Finans/);
  assert.ok(!/Kalender neste 7 dager|Huskeliste/.test(x.sys), x.sys);
  x = await ask('Hva har jeg i kalenderen i morgen?');
  assert.deepEqual(x.done.tools, ['kalender']);
  assert.match(x.sys, /Kalender neste 7 dager/);
  assert.ok(!/Finans|Huskeliste/.test(x.sys.split('Brukerens egne data')[1] ?? ''));
  x = await ask('Hva står på huskelista?');
  assert.deepEqual(x.done.tools, ['huske']);
  assert.match(x.sys, /Huskeliste/);
  x = await ask('Hei, hva kan du?');
  assert.deepEqual(x.done.tools, ['none']);
  assert.ok(!/Brukerens egne data/.test(x.sys));
  // Usikker regel → modellen avgjør (via gaten, maks 5 s); feil → regelen.
  router._setRouterLlm(async () => ({ tools: ['web'], query: 'hovedstad Australia' }));
  let rt = await router.routeTools('Hva er greia med Canberra?', { useLlm: true });
  assert.deepEqual([rt.tools, rt.query, rt.via], [['web'], 'hovedstad Australia', 'llm']);
  router._setRouterLlm(async () => { throw new Error('nede'); });
  rt = await router.routeTools('Hva er greia med Canberra?', { useLlm: true });
  assert.equal(rt.via, 'regel');
  router._setRouterLlm(null);
  // «Nettsøk»-knappen tvinger søk.
  rt = await router.routeTools('Hei', { forceWeb: true });
  assert.deepEqual(rt.tools, ['web']);
  assert.equal(rt.via, 'tvunget');
});
