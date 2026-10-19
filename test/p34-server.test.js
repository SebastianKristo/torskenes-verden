// Prompt 34 (SERVER34): «Glimt står som tilkoblet, men svarer ikke» – reproduksjon av den ekte feilen (modellen i innstillingene finnes
// ikke på Ollama-serveren → 404 som ble svelget), ai.run-ruteren, AI-kontroll-API-et (/api/ai/*), selvtest, budsjett, nøkler.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p34-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-34s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
delete process.env.MOCK_DATA;
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OLLAMA_MODEL;
delete process.env.OLLAMA_TEXT_MODEL;
delete process.env.OPENWEBUI_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Falsk Ollama slik brukerens PC ser ut: gemma4:12b og qwen3:8b er installert, ikke qwen2.5vl:7b (standarden i innstillingene).
const ollama = { models: ['gemma4:12b', 'qwen3:8b', 'nomic-embed-text:latest'], down: false, slow: new Map(), fail: new Map(), calls: [] };
const tag = (name) => ({ name, model: name, size: name.startsWith('gemma4') ? 9.6e9 : name.startsWith('nomic') ? 2.7e8 : 5.2e9, details: { families: name.startsWith('nomic') ? ['nomic-bert'] : ['x'], quantization_level: 'Q4_K_M', parameter_size: '8B' } });
const groq = { key: null, calls: [] };
async function fakeFetch(url, init = {}) {
  const u = String(url);
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  if (u.startsWith('http://ollama.test:11434')) {
    ollama.calls.push({ url: u, body });
    if (ollama.down) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (u.endsWith('/api/tags')) return Response.json({ models: ollama.models.map(tag) });
    if (u.endsWith('/api/ps')) return Response.json({ models: [] });
    if (u.endsWith('/api/version')) return Response.json({ version: '0.12.0' });
    if (u.endsWith('/api/chat') || u.endsWith('/api/generate')) {
      if (!ollama.models.includes(body.model)) return Response.json({ error: `model "${body.model}" not found, try pulling it first` }, { status: 404 });
      if (ollama.fail.has(body.model)) return Response.json({ error: ollama.fail.get(body.model) }, { status: 500 });
      const wait = ollama.slow.get(body.model) ?? 0;
      if (wait) await new Promise((res, rej) => { const t = setTimeout(res, wait); init.signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: init.signal.reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError' })); }); });
      const prompt = JSON.stringify(body.messages ?? body.prompt ?? '');
      const content = /kalenderhendelse/.test(prompt) ? '{"t":"Tannlege","k":"2026-10-21","s":"10:00","e":"","all":false,"r":""}' : body.format ? '{"ok":true,"answer":"ok"}' : /Svar bare: ok/.test(prompt) ? 'ok' : `Svar fra **${body.model}**.`;
      return Response.json({ model: body.model, message: { role: 'assistant', content }, done: true, prompt_eval_count: 12, eval_count: 5 });
    }
    if (u.endsWith('/api/embed')) return Response.json({ embeddings: [[0.1, 0.2]], prompt_eval_count: 1 });
    return Response.json({ error: 'ukjent' }, { status: 404 });
  }
  if (u.startsWith('https://api.groq.com')) {
    groq.calls.push({ url: u, body, auth: init.headers?.Authorization });
    if (init.headers?.Authorization !== `Bearer ${groq.key}` || groq.key !== 'gsk_gyldig_nokkel_123') return Response.json({ error: { message: 'Invalid API Key', type: 'invalid_request_error' } }, { status: 401 });
    return Response.json({ choices: [{ message: { content: 'ok fra groq' } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const ai = await import('../server/ai-run.js');
const assist = await import('../server/assist.js');
const { saveSettings, setSecret } = await import('../server/finans/db.js');
const { OWNER, kv } = await import('../server/db.js');
const cg = await import('../server/calendar-glimt.js');
ai._aiRunTest.attemptMs = 400; ai._aiRunTest.lastMs = 800; ai._aiRunTest.statusMs = 600;
assist._setDirectMs(5000);

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body, extra = {}) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const sse = (text) => text.split('\n\n').filter(Boolean).map((b) => ({ event: b.match(/^event: (.*)$/m)?.[1], data: JSON.parse(b.match(/^data: (.*)$/m)?.[1] ?? 'null') }));

// Brukerens gamle oppsett: Ollama-modellen er standarden qwen2.5vl:7b (finnes ikke på serveren) – slik feilen oppsto.
saveSettings({ ollamaModel: 'qwen2.5vl:7b', ollamaTextModel: '' }, OWNER);

beforeEach(() => { ollama.down = false; ollama.fail.clear(); ollama.slow.clear(); ai.invalidateInventory(); ai.invalidateStatus(); });

/* ---------------- 1. Den ekte feilen ---------------- */

test('Glimt (AI-søk): modellen i innstillingene finnes ikke (404) → før: stille «fikk ikke svar»; nå: første installerte tekstmodell med advarsel', async () => {
  ollama.calls.length = 0;
  const r = await A('/api/assist', 'POST', { q: 'hvem skrev peer gynt' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.engine, 'ollama');
  assert.equal(r.body.modelId, 'qwen3:8b', 'første installerte rene tekstmodell');
  assert.match(r.body.text, /Svar fra/);
  assert.match(r.body.warning, /Modellen «qwen2\.5vl:7b» finnes ikke på Ollama-serveren · bruker «qwen3:8b»/);
  const chat = ollama.calls.filter((c) => c.url.endsWith('/api/chat'));
  assert.equal(chat.length, 1, 'ingen kall til en modell som ikke finnes');
  // Riktige felt til Ollama: /api/chat, stream:false, think:false, num_ctx som tall, keep_alive fra innstillingen.
  const b = chat[0].body;
  assert.equal(b.stream, false);
  assert.equal(b.think, false);
  assert.equal(typeof b.options.num_ctx, 'number');
  assert.equal(typeof b.options.temperature, 'number');
  assert.equal(b.keep_alive, '30m');
  // Jobben står i jobbloggen med modell, tid og tokens.
  const jobs = (await A('/api/ai/jobs')).body;
  const j = jobs.recent.find((x) => x.id === r.body.aiJobId);
  assert.equal(j.status, 'ok');
  assert.equal(j.model, 'qwen3:8b');
  assert.deepEqual(j.tokens, { in: 12, out: 5 });
});

test('migrering: gamle innstillinger blir ruting én gang, og rutene følger de gamle feltene til de endres i AI-kontroll', async () => {
  const r = (await A('/api/ai/routing')).body;
  const sok = r.tasks.find((t) => t.id === 'sok');
  assert.equal(sok.model, 'qwen2.5vl:7b', 'brukerens gamle modell er migrert (ikke ignorert)');
  assert.equal(sok.resolved, 'qwen3:8b');
  assert.match(sok.warning, /finnes ikke.*· bytt/);
  assert.ok(kv.get(OWNER, 'ai_routing').migratedAt);
  // Endres den gamle tekstmodellen (Integrasjoner/FinansHub), følger rutene etter.
  saveSettings({ ollamaTextModel: 'gemma4:12b' }, OWNER);
  assert.equal(ai.routing(OWNER).tasks.sok.model, 'gemma4:12b');
  assert.equal(ai.routing(OWNER).tasks.rc.model, 'qwen2.5vl:7b', 'bildemodellen er uendret');
  saveSettings({ ollamaTextModel: '' }, OWNER);
});

test('PUT /api/ai/routing: modell + reserve, keep_alive «alltid» → -1, kontekst «32k» → 32768; ugyldige verdier gir 400', async () => {
  let r = await A('/api/ai/routing', 'PUT', { tasks: { sok: { model: 'gemma4:12b', fallback: 'qwen3:8b' } }, params: { keepAlive: 'alltid', numCtx: '32k', temperature: '0,4' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.params.keepAlive, -1);
  assert.equal(r.body.params.numCtx, 32768);
  assert.equal(r.body.params.temperature, 0.4);
  assert.equal(r.body.tasks.find((t) => t.id === 'sok').resolved, 'gemma4:12b');
  assert.equal((await A('/api/ai/routing', 'PUT', { params: { numCtx: 'mye' } })).status, 400);
  assert.equal((await A('/api/ai/routing', 'PUT', { params: { keepAlive: 'av og til' } })).status, 400);
  ollama.calls.length = 0;
  const out = await ai.run('sok', { user: OWNER, prompt: 'hei' });
  assert.equal(out.model, 'gemma4:12b');
  const body = ollama.calls.find((c) => c.url.endsWith('/api/chat')).body;
  assert.equal(body.keep_alive, -1);
  assert.equal(body.options.num_ctx, 4096, 'korte oppgaver bruker 4096 (8 GB-kort)');
  assert.equal(body.options.temperature, 0.4);
  // Kari kan bare endre egne valg for chat/søk/Glimt/brief.
  assert.equal((await K('/api/ai/routing', 'PUT', { budget: { monthlyKr: 10 } })).status, 403);
  assert.equal((await K('/api/ai/routing', 'PUT', { tasks: { rc: { model: 'qwen3:8b' } } })).status, 403);
  r = await K('/api/ai/routing', 'PUT', { tasks: { chat: { model: 'qwen3:8b' } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.tasks.find((t) => t.id === 'chat').own, true);
  assert.equal(ai.routing(OWNER).tasks.chat.own, undefined);
});

test('treg modell: 20 s-grensen (her 400 ms) → reserven svarer, og jobben sier hvilken som feilet', async () => {
  ollama.slow.set('gemma4:12b', 1500);
  const t0 = Date.now();
  const out = await ai.run('sok', { user: OWNER, prompt: 'hei' });
  assert.equal(out.model, 'qwen3:8b');
  assert.equal(out.fallbackFrom, 'gemma4:12b');
  assert.match(out.warnings.join(' '), /gemma4:12b svarte ikke \(svarte ikke innen 0 s\)|gemma4:12b svarte ikke/);
  assert.ok(Date.now() - t0 < 1400);
  ollama.slow.delete('gemma4:12b');
});

test('alt feiler: tydelig feil i svaret («Glimt fikk ikke svar fra {modell}: {feil}») med Prøv igjen / Åpne AI-kontroll, jobben står som Feilet', async () => {
  ollama.down = true;
  ai.invalidateInventory();
  const r = await A('/api/assist', 'POST', { q: 'hvem skrev peer gynt' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.text, /^Glimt fikk ikke svar fra gemma4:12b: .*kan ikke nås/);
  assert.equal(r.body.engine, 'none');
  assert.equal(r.body.fix, 'nett');
  assert.deepEqual(r.body.actions.map((a) => a.k), ['retry', 'ai']);
  const j = (await A('/api/ai/jobs')).body.recent.find((x) => x.id === r.body.aiJobId);
  assert.equal(j.status, 'fail');
  assert.match(j.error, /Glimt fikk ikke svar/);
  ollama.down = false;
  ai.invalidateInventory();
});

test('Kalender-Glimt: «Når er neste frisørtime?» treffer «Nina frisør» lokalt, og modellfeil vises i stedet for «fant ikke noe svar»', async () => {
  assert.equal(cg.stemWord('frisørtime'), 'frisør');
  assert.ok(cg.kwHit('frisørtime', 'Nina frisør'));
  assert.ok(!cg.kwHit('tannlegetime', 'Nina frisør'));
  ollama.fail.set('gemma4:12b', 'CUDA error: out of memory'); ollama.fail.set('qwen3:8b', 'CUDA error: out of memory');
  const r = await A('/api/kalender/search?q=' + encodeURIComponent('hvem skrev peer gynt') + '&ai=1');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.answer.kind, 'error');
  assert.match(r.body.answer.text, /^Glimt fikk ikke svar fra \S+: 500 CUDA error/);
  ollama.fail.clear();
  const g = await A('/api/glimt', 'POST', { prompt: 'hva skjer i morgen', tool: 'calendar' });
  assert.equal(g.status, 200);
  assert.ok(g.body.text);
});

/* ---------------- 2. Status, selvtest, nøkler ---------------- */

test('GET /api/ai/status: ekte mini-generering, 3 tilstander, cache 5 min', async () => {
  let s = (await A('/api/ai/status?fresh=1')).body;
  const o = s.providers.find((p) => p.id === 'ollama');
  assert.equal(o.state, 'ok'); assert.equal(o.label, 'Svarer'); assert.equal(typeof o.ms, 'number');
  assert.equal(s.providers.find((p) => p.id === 'groq').state, 'off');
  assert.ok(ollama.calls.some((c) => c.url.endsWith('/api/chat') && c.body.options?.num_predict === 3), 'num_predict 3');
  assert.equal((await A('/api/ai/status')).body.cached, true);
  // Nås, men genererer ikke (oransje).
  for (const m of ['gemma4:12b', 'qwen3:8b']) ollama.fail.set(m, 'model requires more system memory (9.6 GiB) than is available');
  s = (await A('/api/ai/status?fresh=1')).body;
  assert.equal(s.providers.find((p) => p.id === 'ollama').state, 'degraded');
  assert.match(s.providers.find((p) => p.id === 'ollama').error, /more system memory/);
  ollama.fail.clear();
  // Ikke tilkoblet (grå).
  ollama.down = true;
  s = (await A('/api/ai/status?fresh=1')).body;
  assert.equal(s.providers.find((p) => p.id === 'ollama').state, 'off');
  assert.equal(s.providers.find((p) => p.id === 'ollama').label, 'Ikke tilkoblet');
  ollama.down = false; ai.invalidateInventory();
  assert.equal((await K('/api/ai/status')).status, 200, 'alle kan se status');
});

test('nøkler: bare admin endrer, klienten får aldri nøkkelen (bare sist 4); ugyldig Groq-nøkkel gir tydelig feil, ikke tomt svar', async () => {
  assert.equal((await K('/api/ai/keys/groq', 'PUT', { key: 'gsk_feil_nokkel_000' })).status, 403);
  let r = await A('/api/ai/keys/groq', 'PUT', { key: 'gsk_feil_nokkel_000' });
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('gsk_feil_nokkel_000'));
  assert.equal(r.body.providers.find((p) => p.id === 'groq').tail, '_000');
  assert.ok(!(await K('/api/ai/keys')).text.includes('gsk_'), 'heller ikke til andre brukere');
  await A('/api/ai/routing', 'PUT', { tasks: { dom: { model: 'llama-3.3-70b-versatile', fallback: '' } } });
  groq.key = 'gsk_feil_nokkel_000';
  const st = await A('/api/ai/selftest', 'POST', {}, { accept: 'application/json' });
  assert.equal(st.status, 200, st.text);
  const dom = st.body.results.find((x) => x.task === 'dom');
  assert.equal(dom.ok, true, 'reserven (lokal) svarte');
  assert.match(dom.warning, /llama-3\.3-70b-versatile svarte ikke \(401 Invalid API Key\)/);
  assert.equal(dom.fix, 'model');
  // Uten lokal reserve (finans · «forlater aldri huset» av, Groq som eneste): feilen står i svaret.
  ollama.down = true; ai.invalidateInventory();
  await assert.rejects(ai.run('dom', { user: OWNER, prompt: 'x' }), (e) => /^Glimt fikk ikke svar fra llama-3\.3-70b-versatile: 401 Invalid API Key/.test(e.message) && e.fix === 'api');
  ollama.down = false; ai.invalidateInventory();
  setSecret('groqKey', 'gsk_gyldig_nokkel_123', OWNER); groq.key = 'gsk_gyldig_nokkel_123';
  const ok = await ai.run('dom', { user: OWNER, prompt: 'x' });
  assert.equal(ok.provider, 'groq');
  assert.equal(groq.calls.at(-1).body.model, 'llama-3.3-70b-versatile', 'sky-id uten prefiks');
  assert.ok(ok.costKr > 0);
  await A('/api/ai/routing', 'PUT', { tasks: { dom: { model: '', fallback: '' } } });
});

test('selvtest (SSE): én rad per rute uten brukerdata; sletter jeg standardmodellen, bytter ruteren til reserven og sier fra', async () => {
  const r = await app.request('/api/ai/selftest', { method: 'POST', headers: { cookie: (await login('sebastian', 'testpassord1')) } });
  const ev = sse(await r.text());
  const rows = ev.filter((e) => e.event === 'result').map((e) => e.data);
  assert.deepEqual(rows.map((x) => x.task).sort(), ['bar', 'brief', 'chat', 'dom', 'fsok', 'glimt', 'kat', 'kb', 'rc', 'sok'].sort());
  const done = ev.find((e) => e.event === 'done').data;
  assert.equal(done.total, 10);
  for (const x of rows) for (const k of ['task', 'name', 'model', 'ok', 'ms', 'error', 'fix']) assert.ok(k in x, `${x.task} mangler ${k}`);
  // Bildeoppgaven: kvitteringsmodellen qwen2.5vl:7b finnes ikke → første installerte bildemodell (gemma4), med advarsel og «Bytt modell».
  const rc = rows.find((x) => x.task === 'rc');
  assert.equal(rc.ok, true);
  assert.equal(rc.model, 'gemma4:12b');
  assert.match(rc.warning, /qwen2\.5vl:7b/);
  assert.equal(rc.fix, 'model');
  // Ingen brukerdata: bare mini-prompten sendes.
  assert.ok(ollama.calls.filter((c) => c.url.endsWith('/api/chat')).slice(-8).every((c) => /Svar bare: ok/.test(JSON.stringify(c.body.messages))));
  // Slett standardmodellen (gemma4:12b for sok) → reserven qwen3:8b brukes, med advarsel.
  ollama.models = ollama.models.filter((m) => m !== 'gemma4:12b');
  const del = await A('/api/ai/models/' + encodeURIComponent('gemma4:12b'), 'DELETE');
  assert.equal(del.status, 404, 'falsk Ollama har ikke /api/delete for en slettet modell');
  ai.invalidateInventory();
  const out = await ai.run('sok', { user: OWNER, prompt: 'hei' });
  assert.equal(out.model, 'qwen3:8b');
  assert.match(out.warnings[0], /Modellen «gemma4:12b» finnes ikke på Ollama-serveren/);
  ollama.models.push('gemma4:12b'); ai.invalidateInventory();
});

test('«Finansdata forlater aldri huset» og budsjett: tvinger lokal modell; uten lokal modell vises feilen med fix «valg»; budsjett 0 = ingen grense', async () => {
  await A('/api/ai/routing', 'PUT', { rules: { finLocal: true }, tasks: { fsok: { model: 'llama-3.3-70b-versatile', fallback: '' } } });
  let res = await ai.resolveTask('fsok', { user: OWNER });
  assert.equal(res.list[0].provider, 'ollama');
  assert.match(res.notices[0], /Finansdata forlater aldri huset/);
  const rt = (await A('/api/ai/routing')).body.tasks.find((t) => t.id === 'fsok');
  assert.equal(rt.finCloud, false);
  ollama.down = true; ai.invalidateInventory();
  await assert.rejects(ai.run('fsok', { user: OWNER, prompt: 'x' }), (e) => /Finansdata forlater aldri huset/.test(e.message) && e.fix === 'valg');
  ollama.down = false; ai.invalidateInventory();
  await A('/api/ai/routing', 'PUT', { rules: { finLocal: false } });
  // Budsjett 0 = ingen grense (ingen blokkering selv med forbruk).
  assert.equal(ai.budgetState().blocked, false);
  { const id = ai.jobStart({ user: OWNER, task: 'dom', provider: 'groq', model: 'llama-3.3-70b-versatile' }); ai.jobEnd(id, { costKr: 2, tokIn: 1000, tokOut: 100 }); }
  assert.equal(ai.budgetState().blocked, false, 'fortsatt 0 = ingen grense');
  await A('/api/ai/routing', 'PUT', { budget: { monthlyKr: 1, hardStop: true } });
  assert.equal(ai.budgetState().blocked, true, '2 kr av 1 kr');
  res = await ai.resolveTask('fsok', { user: OWNER });
  assert.equal(res.list[0].provider, 'ollama');
  assert.match(res.notices.join(' '), /Sky-budsjettet er brukt opp/);
  await A('/api/ai/routing', 'PUT', { budget: { monthlyKr: 0 }, tasks: { fsok: { model: '', fallback: '' } } });
  const u = (await A('/api/ai/usage?days=30')).body;
  assert.ok(u.totals.count > 0);
  assert.ok(u.byProvider.some((p) => p.provider === 'groq' && p.costKr > 0));
  assert.ok(u.byTask.some((t) => t.task === 'dom'));
  assert.equal(u.budget.monthlyKr, 0);
});

test('modeller, bibliotek, Glimt-API-nøkler og jobb-SSE', async () => {
  const m = (await A('/api/ai/models')).body;
  assert.equal(m.ok, true);
  const g = m.installed.find((x) => x.id === 'gemma4:12b');
  assert.equal(g.fit, 'DELVIS CPU', '9,6 GB på et 8 GB-kort');
  assert.equal(m.installed.find((x) => x.id === 'qwen3:8b').fit, 'PASSER');
  assert.equal((await K('/api/ai/models/pull', 'POST', { model: 'qwen3:14b' })).status, 403);
  const lib = (await A('/api/ai/library?q=qwen3')).body;
  assert.ok(lib.items.some((x) => x.id === 'qwen3:14b' && x.fit === 'FOR STOR' || x.fit === 'DELVIS CPU'));
  const t = await K('/api/ai/tokens', 'POST', { name: 'Snarvei' });
  assert.equal(t.status, 201);
  assert.match(t.body.token, /^fh_pat_/);
  const list = (await K('/api/ai/tokens')).body;
  assert.equal(list.length, 1); assert.ok(!JSON.stringify(list).includes(t.body.token));
  const asTok = await client({ authorization: `Bearer ${t.body.token}` })('/api/glimt', 'POST', { prompt: 'hei' });
  assert.equal(asTok.status, 200);
  assert.equal((await K(`/api/ai/tokens/${t.body.id}`, 'DELETE')).status, 200);
  assert.equal((await client({ authorization: `Bearer ${t.body.token}` })('/api/glimt', 'POST', { prompt: 'hei' })).status, 401);
  const cleared = await A('/api/ai/jobs', 'DELETE');
  assert.equal(cleared.status, 200);
  assert.equal((await A('/api/ai/jobs')).body.recent.length, 0);
});
