// Prompt 59 (prompt 49 del 4, D4SRV): raskere svar. Fast prompt-prefiks (KV-cache) med måling i sporet, ai_think-rotårsaken,
// varm modell (oppvarming via gaten med bakgrunnsprioritet, keep_alive-gulv, etter bildejobb), strømming (SSE: start · status ·
// token · done, Stopp), svar-cache med utløp per datatype (per bruker, aldri kalender/finans), parallelle verktøy, innstillingene
// (hver for seg, standard på) og eval-hjelperne (median/p90 per intent, --compare, cache-effekt, «hvorfor tregt»).
// Falsk Ollama bak den ekte kjeden (ai-run → ai-gate), ingen nett.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p59-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p59';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.p59:11434';
process.env.FAST59_WARM = '1'; // oppvarmingen er ellers av i test
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MOCK_DATA', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'OMLX_URL', 'OMLX_API_KEY']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

/* ---------------- Falsk Ollama ---------------- */

const enc = (s) => new TextEncoder().encode(s);
const nd = (objs, delayMs = 0) => new Response(new ReadableStream({ async start(c) { for (const o of objs) { if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); c.enqueue(enc(`${JSON.stringify(o)}\n`)); } c.close(); } }), { status: 200 });
const calls = [];
let loaded = [];
let answerDelay = 0;
const PLAN = {
  'Hvem er statsminister i Storbritannia?': { intent: 'web_search', calls: [{ tool: 'web.search', args: { query: 'statsminister Storbritannia' } }] },
  'Hva skjer i morgen?': { intent: 'calendar_query', calls: [{ tool: 'calendar.list', args: { period: 'i morgen' } }] },
  'Hva skjer i morgen og hva har jeg å gjøre?': { intent: 'calendar_query', calls: [{ tool: 'calendar.list', args: { period: 'i morgen' } }, { tool: 'calendar.search', args: { terms: ['Frisør'], direction: 'next' } }] },
  'Fortell en kort historie': { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] },
};
async function fakeFetch(url, init = {}) {
  const u = new URL(String(url));
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  if (u.host !== 'ollama.p59:11434') {
    if (/duckduckgo/.test(u.host)) return new Response('<html><body><div class="result results_links web-result"><h2 class="result__title"><a class="result__a" href="https://nrk.no/x">Eleanor Whitcombe er ny statsminister</a></h2><a class="result__snippet" href="https://nrk.no/x">Eleanor Whitcombe overtok som statsminister i Storbritannia.</a></div></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  }
  if (u.pathname === '/api/tags') return Response.json({ models: [{ name: 'qwen3:8b', size: 5.2e9, details: { families: ['qwen3'], parameter_size: '8.2B' } }, { name: 'qwen2.5vl:7b', size: 6e9, details: { families: ['qwen25vl'] } }] });
  if (u.pathname === '/api/ps') return Response.json({ models: loaded.map((name) => ({ name, size: 5e9 })) });
  if (u.pathname === '/api/show') return Response.json({ capabilities: ['completion', 'thinking'] });
  if (u.pathname === '/api/chat') {
    calls.push({ body, at: Date.now() });
    const sys = body.messages.find((m) => m.role === 'system')?.content ?? '';
    const usr = body.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const done = { done: true, done_reason: 'stop', prompt_eval_count: 40, prompt_eval_duration: 2e7, eval_count: 3, eval_duration: 1e8, load_duration: 1e6 };
    if (body.options?.num_predict === 1) return nd([{ message: { role: 'assistant', content: '{' } }, done]); // oppvarming
    if (/^You are the planner/.test(sys)) {
      const msg = /Melding: (.*)/.exec(usr)?.[1]?.replace(/ \/no_think$/, '') ?? '';
      return nd([{ message: { role: 'assistant', content: JSON.stringify({ needs_clarification: false, clarification_question: null, ...(PLAN[msg] ?? PLAN['Fortell en kort historie']) }) } }, done]);
    }
    if (/^(You are Glimt|The search results below)/.test(sys)) {
      const parts = /statsminister/i.test(usr) ? ['Statsministeren ', 'er **Eleanor ', 'Whitcombe** (NRK).'] : ['<think>hm</think>Det ', 'var ', 'en ', 'gang.'];
      return nd([...parts.map((c) => ({ message: { role: 'assistant', content: c } })), done], answerDelay);
    }
    return nd([{ message: { role: 'assistant', content: body.format ? '{"ok":true}' : 'Hei der.' } }, done]);
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const E = await import('../server/glimt45/engine.js');
const P47 = await import('../server/glimt45/plan47.js');
const T47 = await import('../server/glimt45/trace47.js');
const C47 = await import('../server/glimt45/context.js');
const { TOOL45 } = await import('../server/glimt45/tools.js');
const ai = await import('../server/ai-run.js');
const gate = await import('../server/ai-gate.js');
const web = await import('../server/web-search.js');
const S59 = await import('../server/fast59/settings.js');
const C59 = await import('../server/fast59/cache.js');
const W59 = await import('../server/fast59/warm.js');
const ST59 = await import('../server/fast59/status.js');
const { setUserCfg } = await import('../server/settings.js');
const L59 = await import('../eval/lib/fast59.mjs');
ai._setAiFetch(fakeFetch);
web._setWebFetch(fakeFetch);
E._setClock45({ today: '2026-10-24', nowMin: 600 });
test.after(() => { web._setWebFetch(null); S59._setFast59(null); });

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
const A = (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const ME = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
let rid = 0;
const RID = () => `t59-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const agent = (text, extra = {}) => A('/api/glimt/agent', 'POST', { text, module: 'home', requestId: RID(), ...extra });
/** SSE-teksten → [{event, data}] */
const parseSse = (t) => t.split('\n\n').filter((b) => b.trim() && !b.startsWith(':')).map((b) => {
  let event = 'message', data = '';
  for (const l of b.split('\n')) { if (l.startsWith('event:')) event = l.slice(6).trim(); else if (l.startsWith('data:')) data += l.slice(5).trim(); }
  return { event, data: data ? JSON.parse(data) : null };
});
const stream = async (text, extra = {}) => { const r = await A('/api/glimt/agent/stream', 'POST', { text, module: 'home', requestId: RID(), ...extra }); return { ...r, events: r.status === 200 ? parseSse(r.text) : [] }; };
assert.equal((await A('/api/kalender/events', 'POST', { title: 'Frisør', date: '2026-10-25', start: '14:00', end: '15:00', allDay: false, calendar: 'privat' })).status, 201);

/* ---------------- 1. Fast prompt-prefiks ---------------- */

test('fast prefiks: planleggerens systemprompt starter alltid med den samme statiske delen; dato, minne og historikk kommer etter', async () => {
  calls.length = 0;
  await agent('Hva skjer i morgen?');
  E._setClock45({ today: '2026-10-25', nowMin: 725 });
  try { await agent('Fortell en kort historie'); } finally { E._setClock45({ today: '2026-10-24', nowMin: 600 }); }
  const sys = calls.filter((c) => /^You are the planner/.test(c.body.messages[0].content)).map((c) => c.body.messages[0].content);
  assert.ok(sys.length >= 2);
  const stat = P47.plannerSystem47();
  for (const s of sys) assert.ok(s.startsWith(`${stat}\n\n# Context\n`), 'statisk først (instruksjoner, verktøy, eksempler), så konteksten');
  assert.notEqual(sys[0], sys[1], 'den dynamiske halen er ulik');
  const tail = sys[1].slice(stat.length);
  assert.ok(tail.indexOf('User:') < tail.indexOf('Nå:'), 'profilen (lik lenge) før klokka');
  assert.ok(!/Nå:|2026/.test(stat), 'ingen dato i den statiske delen');
  assert.ok(/Tools:[\s\S]*Examples:/.test(stat), 'verktøybeskrivelser før de faste eksemplene');
  // Kontekstblokken har fast rekkefølge: profil, nå, minne, historikk.
  const block = C47.contextBlock47({ profileText: 'User: X.', nowLine: 'Nå: lørdag', factsText: '- Nina = frisør', historyText: 'User: hei' });
  assert.deepEqual(block.split('\n').map((l) => l.split(':')[0]), ['User', 'Nå', 'Memory facts (from the user)', '- Nina = frisør', 'Recent conversation', 'User']);
});

test('sporet måler prompt_eval_count/prompt_eval_duration og andel gjenbrukt per modellkall', async () => {
  const r = await agent('Hva skjer i morgen?');
  const t = (await A(`/api/glimt/agent/trace?id=${r.body.traceId}`)).body.trace;
  const m = t.models.find((x) => x.step === 'planner');
  assert.equal(m.prompt.evalCount, 40);
  assert.equal(m.prompt.evalMs, 20);
  assert.ok(m.prompt.est > 1000, 'anslått hele prompten');
  assert.ok(m.prompt.reusedPct > 90, 'Ollama telte bare 40 nye tokens → prefiksen kom fra KV-cachen');
  assert.deepEqual(T47.promptStats59({ tokens: { in: 1000 }, params: { promptEst: 1000 }, timing: { promptMs: 900 } }).reusedPct, 0, 'hele prompten regnet ut');
  const om = T47.promptStats59({ tokens: { in: 1200 }, params: { promptEst: 1100 }, timing: { promptMs: 90, cachedTokens: 1000 } });
  assert.equal(om.exact, true); assert.equal(om.reusedPct, 83, 'oMLX: cached_tokens er eksakt');
});

/* ---------------- 2. ai_think (rotårsaken i produksjon) ---------------- */

test('ai_think på: planlegger, svarsteg og JSON-tolkning tenker aldri; fritekst uten eget steg følger fortsatt valget', async () => {
  setUserCfg(ME, { ai_think: '1' });
  try {
    calls.length = 0;
    await agent('Fortell en kort historie');
    const pl = calls.find((c) => /^You are the planner/.test(c.body.messages[0].content));
    const an = calls.find((c) => /^You are Glimt/.test(c.body.messages[0].content));
    assert.equal(pl.body.think, false, 'planleggeren');
    assert.equal(an.body.think, false, 'svarsteget');
    calls.length = 0;
    await ai.run('glimt', { user: ME, prompt: 'tolk dette', json: true, numPredict: 20 });
    assert.equal(calls[0].body.think, false, 'glimt-JSON uten steg');
    calls.length = 0;
    await ai.run('kat', { user: ME, prompt: 'kategori?', numPredict: 20 });
    assert.equal(calls[0].body.think, false, 'kategorisering (tolkningsoppgave) uten steg');
    calls.length = 0;
    await ai.run('sok', { user: ME, prompt: 'Fortell noe', numPredict: 20 });
    assert.equal('think' in calls[0].body, false, 'fritekst (sok) uten steg: brukerens valg gjelder (modellen bestemmer)');
  } finally { setUserCfg(ME, { ai_think: '0' }); }
  const src = readFileSync(new URL('../server/finans/enrich.js', import.meta.url), 'utf8');
  assert.match(src, /priority: 'background'/, 'Finans AI-sammendrag går som bakgrunnsjobb i køen');
});

/* ---------------- 3. Strømming (SSE) ---------------- */

test('SSE: start · status (plan, verktøy, svar) · token (modellen) · done = samme svar som POST /', async () => {
  const s = await stream('Hvem er statsminister i Storbritannia?');
  assert.equal(s.status, 200, s.text);
  assert.match(s.headers.get('content-type') ?? '', /text\/event-stream/);
  const ev = s.events;
  assert.equal(ev[0].event, 'start'); assert.equal(ev[0].data.stream, true);
  assert.equal(ev.at(-1).event, 'done');
  const st = ev.filter((e) => e.event === 'status');
  assert.deepEqual(st.map((e) => e.data.stage), ['plan', 'tool', 'answer']);
  assert.equal(st[1].data.tool, 'web.search'); assert.equal(st[1].data.text, 'Søker på nettet …');
  const toks = ev.filter((e) => e.event === 'token');
  assert.ok(toks.length >= 3 && toks.every((t) => t.data.source === 'model'), 'svarformuleringen token for token');
  assert.equal(toks.map((t) => t.data.t).join(''), 'Statsministeren er **Eleanor Whitcombe** (NRK).');
  const done = ev.at(-1).data;
  assert.match(done.reply, /Eleanor Whitcombe/);
  assert.ok(done.traceId && Array.isArray(done.actions) && done.cached === false);
  const plain = await agent('Hvem er statsminister i Storbritannia?');
  assert.deepEqual(Object.keys(plain.body).filter((k) => !['repeated', 'cached', 'cache'].includes(k)).sort(), Object.keys(done).filter((k) => !['cached', 'cache'].includes(k)).sort(), 'samme form som det ikke-strømmende svaret');
});

test('SSE: kodemalen (kalender) sendes ord for ord, tenking strømmes aldri, Strømming av → bare status og done', async () => {
  const s = await stream('Hva skjer i morgen?');
  const toks = s.events.filter((e) => e.event === 'token');
  assert.ok(toks.length > 2 && toks.every((t) => t.data.source === 'mal'));
  assert.equal(toks.map((t) => t.data.t).join(''), s.events.at(-1).data.reply);
  assert.ok(s.events.some((e) => e.event === 'status' && e.data.text === 'Sjekker kalenderen …'));
  const c = await stream('Fortell en kort historie');
  const t2 = c.events.filter((e) => e.event === 'token').map((e) => e.data.t).join('');
  assert.equal(t2, 'Det var en gang.', 'uten <think>…</think>');
  assert.equal((await A('/api/glimt/agent/fast', 'PUT', { scope: 'user', stream: false })).status, 200);
  try {
    const off = await stream('Hva skjer i morgen?');
    assert.equal(off.events[0].data.stream, false);
    assert.equal(off.events.filter((e) => e.event === 'token').length, 0);
    assert.ok(off.events.some((e) => e.event === 'status') && off.events.at(-1).event === 'done');
  } finally { await A('/api/glimt/agent/fast', 'PUT', { scope: 'user', stream: null }); }
  assert.equal((await A('/api/glimt/agent/stream', 'POST', { text: '' })).status, 400, 'feil før strømmen = JSON som før');
});

test('Stopp: /stream/stop avbryter modellkallet → error 499, ingenting caches', async () => {
  answerDelay = 150;
  try {
    const id = RID();
    const p = A('/api/glimt/agent/stream', 'POST', { text: 'Fortell en kort historie', module: 'home', requestId: id });
    await new Promise((r) => setTimeout(r, 120));
    const st = await A('/api/glimt/agent/stream/stop', 'POST', { requestId: id });
    assert.equal(st.status, 200);
    const r = await p;
    const ev = parseSse(r.text);
    if (st.body.stopped) {
      assert.equal(ev.at(-1).event, 'error', r.text);
      assert.equal(ev.at(-1).data.status, 499);
      assert.equal(db.prepare('SELECT count(*) FROM glimt45_requests WHERE user_id=? AND key=?').pluck().get(ME, `r:${id}`), 0, 'idempotensnøkkelen er slettet');
    } else assert.equal(ev.at(-1).event, 'done', 'var allerede ferdig');
  } finally { answerDelay = 0; }
});

/* ---------------- 4. Svar-cache ---------------- */

test('svar-cache: nettsøk gjenbrukes (30 min) med cached + spor; kalender caches aldri; per bruker; av = ingen treff', async () => {
  S59._setFast59({ cache: true });
  try {
    C59.cacheClear59(ME);
    const a = await agent('Hvem er statsminister i Storbritannia?');
    assert.ok(!a.body.cached);
    const ta = (await A(`/api/glimt/agent/trace?id=${a.body.traceId}`)).body.trace;
    assert.deepEqual(ta.cache, { stored: true, kind: 'web', ttlMs: 30 * 60_000 });
    calls.length = 0;
    const b = await agent('Hvem er statsminister i Storbritannia?');
    assert.equal(b.body.cached, true);
    assert.equal(b.body.cache.kind, 'web');
    assert.equal(b.body.reply, a.body.reply);
    assert.ok(!calls.some((c) => /^(You are Glimt|The search results)/.test(c.body.messages[0].content)), 'svarsteget ble ikke kalt på nytt');
    const tb = (await A(`/api/glimt/agent/trace?id=${b.body.traceId}`)).body.trace;
    assert.equal(tb.cache.hit, true);
    // Kalender (data som endres) caches aldri.
    await agent('Hva skjer i morgen?');
    const c2 = await agent('Hva skjer i morgen?');
    assert.ok(!c2.body.cached, 'kalender caches ikke');
    // Per bruker: nøkkelen har brukeren med.
    assert.notEqual(C59.planKey59('a', { calls: [{ tool: 'web.search', args: { query: 'x' } }] }), C59.planKey59('b', { calls: [{ tool: 'web.search', args: { query: 'x' } }] }));
    // Av for brukeren → nytt svar.
    S59._setFast59({ cache: false });
    const d = await agent('Hvem er statsminister i Storbritannia?');
    assert.ok(!d.body.cached);
    assert.ok(C59.cacheCount59(ME) >= 1);
    S59._setFast59(null);
    const del = await A('/api/glimt/agent/fast/cache', 'DELETE');
    assert.ok(del.body.removed >= 1);
    assert.equal(C59.cacheCount59(ME), 0);
  } finally { S59._setFast59(null); }
});

test('svar-cache: utløp per datatype og hvilke planer som kan caches', () => {
  assert.deepEqual(C59.cacheKindOf59([{ tool: 'weather.get' }, { tool: 'weather.get' }]), { kind: 'weather', ttlMs: 15 * 60_000, needsText: false });
  assert.equal(C59.cacheKindOf59([{ tool: 'web.search' }, { tool: 'chat.answer' }]).ttlMs, 30 * 60_000);
  assert.equal(C59.cacheKindOf59([{ tool: 'weather.get' }, { tool: 'web.search' }]).ttlMs, 15 * 60_000, 'korteste levetid vinner');
  for (const t of ['calendar.list', 'calendar.create', 'finance.summary', 'finance.subscriptions', 'tasks.list', 'memory.save', 'media.episode', 'chat.answer']) assert.equal(C59.cacheKindOf59([{ tool: t }]), null, t);
  assert.equal(C59.cacheKindOf59([{ tool: 'weather.get' }, { tool: 'calendar.list' }]), null, 'blandet med kalender');
  const now = Date.parse('2026-10-24T08:20:00Z');
  assert.equal(C59.untilNextHour59(now), 40 * 60_000, 'strømpris: til neste hele time');
  assert.equal(C59.legacyKindOf59({ tool: 'Strømpris', text: 'x' }, 'llm', now).ttlMs, 40 * 60_000);
  assert.equal(C59.legacyKindOf59({ text: 'x' }, 'weather', now).ttlMs, 15 * 60_000);
  assert.equal(C59.legacyKindOf59({ text: 'x' }, 'departures', now), null, 'avganger caches ikke');
  const k1 = C59.planKey59('u', { calls: [{ tool: 'weather.get', args: { place: 'Oslo', when: { from: '2026-10-25', label: 'i morgen' } } }] });
  const k2 = C59.planKey59('u', { calls: [{ tool: 'weather.get', args: { when: { label: 'i morgen', from: '2026-10-25' }, place: 'Oslo' } }] });
  assert.equal(k1, k2, 'normalisert (rekkefølgen på feltene spiller ingen rolle)');
  C59.cachePut59('u', 'k', 'weather', 1000, { reply: 'x' }, now);
  assert.equal(C59.cacheGet59('u', 'k', now + 500)?.response.reply, 'x');
  assert.equal(C59.cacheGet59('u', 'k', now + 1500), null, 'utløpt');
});

/* ---------------- 5. Parallelle verktøy ---------------- */

test('parallelle verktøy: uavhengige lesekall samtidig (på), ett og ett (av); sporet viser gruppene', async () => {
  const orig = { list: TOOL45['calendar.list'].run, search: TOOL45['calendar.search'].run };
  const spans = [];
  const wrap = (name, fn) => async (a, ctx) => { const t0 = Date.now(); await new Promise((r) => setTimeout(r, 80)); const out = await fn(a, ctx); spans.push({ name, t0, t1: Date.now() }); return out; };
  TOOL45['calendar.list'].run = wrap('list', orig.list); TOOL45['calendar.search'].run = wrap('search', orig.search);
  try {
    const on = await agent('Hva skjer i morgen og hva har jeg å gjøre?');
    assert.deepEqual(on.body.actions.map((x) => x.tool), ['calendar.list', 'calendar.search']);
    assert.ok(spans[0].t0 < spans[1].t1 && spans[1].t0 < spans[0].t1, 'overlappet');
    const t = (await A(`/api/glimt/agent/trace?id=${on.body.traceId}`)).body.trace;
    assert.deepEqual(t.parallel, [['calendar.list', 'calendar.search']]);
    spans.length = 0;
    S59._setFast59({ parallel: false });
    await agent('Hva skjer i morgen og hva har jeg å gjøre?', { requestId: RID() });
    const [x, y] = spans.sort((p, q) => p.t0 - q.t0);
    assert.ok(y.t0 >= x.t1, 'av: ett og ett');
  } finally { TOOL45['calendar.list'].run = orig.list; TOOL45['calendar.search'].run = orig.search; S59._setFast59(null); }
});

/* ---------------- 6. Varm modell ---------------- */

test('varm modell: oppvarming via gaten (bakgrunn, statisk prefiks, num_predict 1), etter bildejobb, keep_alive-gulv 1 t; av = ingenting', async () => {
  W59._warm59.reset();
  loaded = [];
  calls.length = 0;
  const r = await W59.warmNow59('test');
  assert.equal(r.ok, true, JSON.stringify(r));
  const w = calls.find((c) => c.body.options?.num_predict === 1);
  assert.ok(w, 'oppvarmingskallet');
  assert.equal(w.body.model, 'qwen3:8b');
  assert.ok(w.body.messages[0].content.startsWith(P47.plannerSystem47()), 'samme statiske prefiks som planleggeren (KV-cachen fylles)');
  assert.equal(w.body.keep_alive, '1h', 'keep_alive-gulv for hovedmodellen');
  assert.equal(gate.keepAliveFor('qwen3:8b'), '1h');
  assert.equal(gate.keepAliveFor('qwen2.5vl:7b'), 0, 'visjonsmodellen beholder sin');
  const job = ai.jobList(OWNER, { limit: 5 }).recent.find((j) => j.title === 'Glimt · varm modell');
  assert.ok(job, 'synlig i Jobber');
  // Allerede lastet → ingen nytt kall.
  loaded = ['qwen3:8b'];
  calls.length = 0;
  const again = await W59.warmNow59('test2');
  assert.equal(again.already, true);
  assert.equal(calls.length, 0);
  // Etter en bildejobb: oppvarming når køen for bilder er tom (ikke midt i).
  loaded = [];
  calls.length = 0;
  const vision = gate.gateChat({ model: 'qwen2.5vl:7b', body: { messages: [{ role: 'user', content: 'se', images: ['iVBOR'] }] }, base: 'http://ollama.p59:11434', fetch: fakeFetch, image: true, priority: 'background' });
  await vision;
  await new Promise((r) => setTimeout(r, 3200));
  assert.ok(calls.some((c) => c.body.options?.num_predict === 1 && c.body.model === 'qwen3:8b'), 'varmet opp etter bildejobben');
  // Av (admin): ingen oppvarming og intet keep_alive-gulv.
  assert.equal((await A('/api/glimt/agent/fast', 'PUT', { scope: 'server', warm: false })).status, 200);
  try {
    assert.equal((await W59.warmNow59('av')).skipped, 'av');
    assert.equal(gate.keepAliveFor('qwen3:8b'), '15m');
  } finally { await A('/api/glimt/agent/fast', 'PUT', { scope: 'server', warm: true }); }
});

/* ---------------- 7. Innstillingene ---------------- */

test('innstillinger: fire brytere, standard på, server og bruker hver for seg; warm bare for admin', async () => {
  const g = await A('/api/glimt/agent/fast');
  assert.equal(g.status, 200);
  assert.deepEqual(Object.keys(g.body.settings), ['cache', 'warm', 'stream', 'parallel']);
  assert.deepEqual(g.body.labels, { cache: 'Svar-cache', warm: 'Varm modell', stream: 'Strømming', parallel: 'Parallelle verktøy' });
  assert.equal(g.body.server.stream, true); assert.equal(g.body.server.parallel, true); assert.equal(g.body.server.warm, true);
  assert.deepEqual(g.body.user, { cache: null, stream: null, parallel: null });
  assert.equal(g.body.admin, true);
  assert.equal((await A('/api/glimt/agent/fast', 'PUT', { scope: 'user', warm: false })).status, 400, 'warm er en serverinnstilling');
  assert.equal((await A('/api/glimt/agent/fast', 'PUT', { scope: 'user', parallel: 'ja' })).status, 400);
  const p = await A('/api/glimt/agent/fast', 'PUT', { scope: 'user', parallel: false });
  assert.equal(p.body.settings.parallel, false); assert.equal(p.body.server.parallel, true);
  await A('/api/glimt/agent/fast', 'PUT', { scope: 'user', parallel: null });
  const s = await A('/api/glimt/agent/fast', 'PUT', { scope: 'server', stream: false });
  assert.equal(s.body.settings.stream, false, 'admin slår av for alle');
  await A('/api/glimt/agent/fast', 'PUT', { scope: 'server', stream: true });
  assert.equal(S59.saveFast59('noen', { scope: 'server', cache: false }, { admin: false }).status, 403);
  // Produksjonens standard: alt på (i test er svar-cachen av med mindre FAST59_DEFAULTS=prod, som eval setter).
  process.env.FAST59_DEFAULTS = 'prod';
  try { assert.deepEqual(S59.serverFast59(), { cache: true, warm: true, stream: true, parallel: true }); } finally { delete process.env.FAST59_DEFAULTS; }
});

/* ---------------- 8. Status og eval-hjelpere ---------------- */

test('statuslinja og tekstbiter', () => {
  assert.equal(ST59.toolStatus59({ tool: 'weather.get', args: { place: 'Oslo' } }).text, 'Henter været for Oslo …');
  assert.equal(ST59.toolStatus59({ tool: 'calendar.search' }).text, 'Sjekker kalenderen …');
  assert.deepEqual(ST59.wordsOf59('Lagt inn: **Dune**.'), ['Lagt ', 'inn: ', '**Dune**.']);
  const got = []; const sink = ST59.tokenSink59((t) => got.push(t));
  for (const c of ['<thi', 'nk>x</think>Hei', ' der']) sink.onChunk({ message: { content: c } });
  sink.onChunk({ choices: [{ delta: { content: '!' } }] });
  sink.end();
  assert.equal(got.join(''), 'Hei der!');
});

test('eval: svartid vs totalt, median/p90 per intent, --compare, cache-effekt og «hvorfor tregt»', () => {
  const run = (ms, reply, model = []) => ({ ms, replyMs: reply, trace: { model } });
  const enrich = { model: 'qwen3:8b', lastUser: 'Du skriver korte norske beskrivelser av banktransaksjoner …', systemHead: '', ms: 48_000, totalMs: 47_500, genMs: 46_000, outTokens: 1100, promptTokens: 500, estTokens: 520 };
  const planner = (pt, est, pms) => ({ model: 'qwen3:8b', systemHead: 'You are the planner for Glimt', ms: 3000, totalMs: 2900, promptTokens: pt, estTokens: est, promptMs: pms, genMs: 900 });
  const after = [{ id: '08-dyreste-abonnement', area: 'finans', passes: 3, runs: 3, medianMs: 50_000, results: [run(52_000, 3100, [planner(60, 2000, 40), enrich]), run(50_000, 2900, [planner(55, 2000, 40)]), run(49_000, 3000, [planner(2100, 2000, 1500)])] },
    { id: '07-vaer-to-steder', area: 'vær', passes: 3, runs: 3, medianMs: 3000, results: [run(3000, 3000), run(2800, 2800), run(3500, 3500)] }];
  L59.addReplyStats59(after);
  assert.equal(after[0].replyMedianMs, 3000);
  assert.equal(after[0].intent59, 'finance_query');
  const pi = L59.perIntent59(after);
  assert.deepEqual(pi.map((x) => x.intent), ['finance_query', 'weather']);
  assert.equal(pi[0].replyP50, 3000); assert.ok(pi[0].totalP50 >= 49_000);
  // Eldre fil uten replyMs: svartiden regnes ut fra stegene.
  const before = { meta: { engine: 'Ollama', commit: 'abc' }, cases: [{ id: '08-dyreste-abonnement', area: 'finans', passes: 3, runs: 3, medianMs: 50_000, results: [{ ms: 51_000, trace: { steps: [{ msTotal: 4000 }] } }, { ms: 50_000, trace: { steps: [{ msTotal: 4200 }] } }, { ms: 48_000, trace: { steps: [{ msTotal: 3900 }] } }] }] };
  const cmp = L59.compare59(before, after, 'før.json');
  const row = cmp.rows.find((r) => r.id === '08-dyreste-abonnement');
  assert.equal(row.beforeMs, 4000); assert.equal(row.afterMs, 3000); assert.equal(row.deltaPct, -25);
  assert.equal(cmp.rows.find((r) => r.id === '07-vaer-to-steder').beforeMs, null, 'ny case');
  assert.equal(cmp.total.cases, 1);
  const ce = L59.cacheEffect59(after);
  assert.ok(ce.byStep.planner.reusedPct > 50, JSON.stringify(ce.byStep));
  const why = L59.whySlow59(after[0].results[0]);
  assert.match(why[0].why, /bakgrunnsjobb etter svaret 48\.9 s \(Finans AI-sammendrag \(bakgrunn\)\)/);
  assert.ok(why.some((w) => /lang generering/.test(w.why)));
  const wait = L59.whySlow59({ ms: 40_000, replyMs: 40_000, trace: { model: [{ model: 'qwen3:8b', systemHead: 'You are the planner', ms: 39_000, totalMs: 3000 }] } });
  assert.match(wait[0].why, /ventet 36\.0 s før Ollama begynte/);
  const think = L59.whySlow59({ ms: 50_000, replyMs: 50_000, trace: { model: [planner(2000, 2000, 1500), { ...planner(2000, 2000, 1500), think: true, thinkingChars: 4000, genMs: 44_000 }] } });
  assert.ok(think.some((w) => /planleggeren kalt 2 ganger \(nytt forsøk med tenking/.test(w.why)) && think.some((w) => /tenkte/.test(w.why)));
});
