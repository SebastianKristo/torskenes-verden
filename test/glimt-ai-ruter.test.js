// Låser svarene til Glimt-, AI-, Chat- og Brief-rutene (status per rolle og feltene i svaret) før serverfilene samles i
// server/glimt/ og server/ai/ (Fase 2b). Omstruktureringen skal ikke endre stier, statuskoder eller felt.
// Rollene: A = admin (eier), I = vanlig bruker (økt), TI = samme bruker med app-token (mobil), N = ikke innlogget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-glimt-ruter-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-ga';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'ingrid', password: 'ingridPassord123', device: 'iPhone' } })).json?.token;
assert.ok(tok);
const TI = as({ authorization: `Bearer ${tok}` });
const N = as({});

const keysOf = (j) => j == null ? '' : Array.isArray(j) ? '[]' : typeof j === 'object' ? Object.keys(j).sort().join(' ') : '';

// [sti, status for A I TI N, feltene i adminens 200-svar ("[]" = liste, "" = ikke sjekket), ev. feltene for vanlig bruker]
const GETS = [
  ['/api/admin/fermion53/config', '200 403 403 401', 'neutrinoKeySet neutrinoUrl phononKeySet phononModel phononUrl'],
  ['/api/admin/fermion53/health', '200 403 403 401', 'neutrino phonon'],
  ['/api/admin/omlx58/config', '200 403 403 401', 'defaults enabled engines fallbackOllama keySet models standard tasks url urlError'],
  ['/api/admin/omlx58/health', '200 403 403 401', 'checkedAt configured enabled engines error fallbackOllama keySet loaded loadedKnown missing modelInfo models ms ok status url wanted'],
  ['/api/admin/voxcpm57/config', '200 403 403 401', 'keySet url'],
  ['/api/admin/voxcpm57/health', '200 403 403 401', 'voices voxcpm'],
  ['/api/admin/whisper54/config', '200 403 403 401', 'keySet url'],
  ['/api/admin/whisper54/health', '200 403 403 401', 'engines nbwhisper'],
  ['/api/ai/backend', '200 200 200 401', 'effective mode note ollama openwebui thinkLeaks web webProviders', 'admin effective mode note ollama openwebui'],
  ['/api/ai/gate', '200 200 200 401', 'concurrency current hold loaded paused running waiting'],
  ['/api/ai/import/sources', '200 200 200 401', 'chunkBytes maxBytes sources'],
  ['/api/ai/import/x', '404 404 404 401', ''],
  ['/api/ai/jobs', '200 200 200 401', 'gate groups paused queue queued recent running timeouts unseenFailed'],
  ['/api/ai/keys', '200 200 200 401', 'providers'],
  ['/api/ai/library', '200 200 200 401', 'gpu hw items'],
  ['/api/ai/memory', '200 200 200 401', 'count items'],
  ['/api/ai/memory/areas', '200 200 200 401', 'areas count'],
  ['/api/ai/models', '200 200 200 401', 'cloud defaults external gpu hw installed ok pulls url'],
  ['/api/ai/models/pulls', '200 200 200 401', '[]'],
  ['/api/ai/recommend', '200 200 200 401', '[]'],
  ['/api/ai/recommend/plan', '200 200 200 401', 'changes done fill follows missing skipped text'],
  ['/api/ai/routing', '200 200 200 401', 'admin budget cloudOn models ollama options params rules tasks warnings'],
  ['/api/ai/status', '200 200 200 401', 'budget cached checkedAt providers recommend routes server suggested timeouts warnings'],
  ['/api/ai/tokens', '200 200 200 401', '[]'],
  ['/api/ai/usage', '200 200 200 401', 'budget byDay byProvider byTask days from totals'],
  ['/api/assist/settings', '200 200 200 401', 'ai_bg_notify cloud n_ai_in'],
  ['/api/assist/x', '400 400 400 401', ''],
  ['/api/brief/settings', '200 200 200 401', 'guide home notify'],
  ['/api/brief/widget', '200 200 200 401', 'chips cond deepLink figure generatedAt hi ic icon kicker kind lo news next refreshAt size summary temp title'],
  ['/api/chat/auto', '200 200 200 401', 'picks stats using'],
  ['/api/chat/chats', '200 200 200 401', 'chats folders pinned'],
  ['/api/chat/chats/x', '404 404 404 401', ''],
  ['/api/chat/chats/x/export', '404 404 404 401', ''],
  ['/api/chat/files/x', '404 404 404 401', ''],
  ['/api/chat/files/x/thumb', '404 404 404 401', ''],
  ['/api/chat/import/claude/x', '404 404 404 401', ''],
  ['/api/chat/knowledge', '200 200 200 401', '[]'],
  ['/api/chat/models', '200 200 200 401', 'auto default mock models openwebui preferred'],
  ['/api/chat/mydata', '200 200 200 401', 'finans huske kalender'],
  ['/api/chat/settings', '200 200 200 401', 'chat_ask_cloud chat_default_model chat_my_data chat_theme language openwebui'],
  ['/api/chat/shared/x', '404 404 404 404', ''],
  ['/api/glimt/agent/calendar70/x', '404 404 404 401', ''],
  ['/api/glimt/agent/calendars', '200 200 200 401', 'calendars defaultCalendar google readOnly'],
  ['/api/glimt/agent/convo/x', '404 404 404 401', ''],
  ['/api/glimt/agent/fast', '200 200 200 401', 'admin cacheEntries help labels server settings ttl user warmState'],
  ['/api/glimt/agent/log', '200 200 200 401', 'items'],
  ['/api/glimt/agent/settings', '200 200 200 401', 'labels options personality'],
  ['/api/glimt/agent/tools', '200 200 200 401', 'model toolMode tools'],
  ['/api/glimt/agent/trace', '200 200 200 401', 'items'],
  ['/api/glimt/agent/trace/view', '404 404 404 401', ''],
  ['/api/glimt/agent/understand', '200 200 200 401', 'admin help labels server settings ttl user'],
  ['/api/glimt/entities', '200 200 200 401', 'builtinWords enabled items labels types'],
  ['/api/glimt/entities/resolve', '200 200 200 401', 'item q via'],
  ['/api/glimt/memory', '200 200 200 401', 'items types'],
  ['/api/glimt/memory/conflicts', '200 200 200 401', 'counts enabled items'],
  ['/api/glimt/memory/hygiene', '200 200 200 401', 'admin counts help labels lastRun schedule server settings staleDays user'],
  ['/api/glimt/memory/pending', '200 200 200 401', 'counts enabled items'],
  ['/api/glimt/memory/stale', '200 200 200 401', 'enabled items staleDays'],
  ['/api/glimt/settings', '200 200 200 401', 'auroraNotify brief briefGlimt briefs cards char chars engines friends guide host jul julActive julPhase julSound mai17 mai17Active notify rates readAloud snow tts voices'],
  ['/api/img', '400 400 400 400', ''],
  ['/api/voices57', '200 200 200 401', 'configured consentText engineReady limits sampleText selected voices'],
  ['/api/glimt/finnes-ikke', '404 404 404 401', ''],
  ['/api/ai/finnes-ikke', '404 404 404 401', ''],
  ['/api/chat/finnes-ikke', '404 404 404 401', ''],
];

test('glimt-ai-ruter: status per rolle og felt i svaret er uendret', async () => {
  for (const [path, statuses, keys, userKeys] of GETS) {
    const want = statuses.split(' ').map(Number);
    for (const [i, [w, f]] of Object.entries(Object.entries({ A, I, TI, N }))) {
      const r = await f(path);
      assert.equal(r.status, want[i], `${w} GET ${path}: ${r.text.slice(0, 160)}`);
      if (r.status === 200 && keys) assert.equal(keysOf(r.json), w === 'A' || userKeys === undefined ? keys : userKeys, `${w} GET ${path}`);
    }
  }
});

test('glimt-ai-ruter: /api/brief har kortene fra begge lagene (grunnbriefen og de nye kortene)', async () => {
  for (const f of [A, I, TI]) {
    const r = await f('/api/brief');
    assert.equal(r.status, 200, r.text.slice(0, 160));
    const keys = Object.keys(r.json);
    // grunnbriefen (morgen/dag/kveld) …
    for (const k of ['kind', 'title', 'kicker', 'greeting', 'summary', 'weather', 'events', 'next', 'chips', 'figure', 'guide', 'generatedAt']) assert.ok(keys.includes(k), `mangler ${k}`);
    // … og kortene som flettes inn (pakker, familie, skole og jobb, bursdager, nordlys)
    for (const k of ['cards', 'packages', 'family', 'school', 'birthdays', 'aurora']) assert.ok(keys.includes(k), `mangler ${k}`);
    assert.ok(Array.isArray(r.json.cards));
  }
  assert.equal((await N('/api/brief')).status, 401);
  // «+ Gave til … i Gjøremål»
  assert.equal((await N('/api/brief/gift', 'POST', { name: 'Ola', date: '2026-12-01' })).status, 401);
  assert.equal((await A('/api/brief/gift', 'POST', {})).status, 400);
  const g = await I('/api/brief/gift', 'POST', { name: 'Ola', date: '2026-12-01' });
  assert.equal(g.status, 201, g.text);
  assert.deepEqual(Object.keys(g.json.item), ['id', 'title', 'due', 'list', 'tags']);
  assert.equal((await I('/api/brief/gift', 'POST', { name: 'Ola', date: '2026-12-01' })).json.created, false);
  assert.equal((await A('/api/brief?kind=morning')).json.kind, 'morning');
});

test('glimt-ai-ruter: «Glimt husker» og AI-minnet er per bruker', async () => {
  const add = await A('/api/glimt/memory', 'POST', { kind: 'fact', match: 'hytta', note: 'Hytta ligger på Hvaler' });
  assert.ok([200, 201].includes(add.status), add.text);
  const id = add.json.item.id;
  assert.ok((await A('/api/glimt/memory')).json.items.some((m) => m.id === id));
  assert.ok(!(await I('/api/glimt/memory')).json.items.some((m) => m.id === id));
  assert.equal((await I(`/api/glimt/memory/${id}`, 'DELETE')).status, 404);
  assert.equal((await A(`/api/glimt/memory/${id}`, 'DELETE')).status, 200);
  assert.equal((await N('/api/glimt/memory', 'POST', { kind: 'fact', match: 'xx' })).status, 401);

  const ai = await A('/api/ai/memory', 'POST', { text: 'Liker kaffe svart' });
  assert.equal(ai.status, 201, ai.text);
  assert.equal(ai.json.added.length, 1);
  assert.equal((await A('/api/ai/memory')).json.count, 1);
  assert.equal((await I('/api/ai/memory')).json.count, 0);
});

test('glimt-ai-ruter: bare admin endrer AI-oppsettet og motorene på Mac mini-en', async () => {
  for (const [m, path, body] of [
    ['PUT', '/api/admin/fermion53/config', {}],
    ['PUT', '/api/admin/whisper54/config', {}],
    ['PUT', '/api/admin/voxcpm57/config', {}],
    ['PUT', '/api/admin/omlx58/config', {}],
  ]) {
    assert.equal((await I(path, m, body)).status, 403, `I ${m} ${path}`);
    assert.equal((await TI(path, m, body)).status, 403, `TI ${m} ${path}`);
    assert.equal((await N(path, m, body)).status, 401, `N ${m} ${path}`);
  }
  assert.equal((await N('/api/glimt/agent', 'POST', { q: 'hei' })).status, 401);
  assert.equal((await N('/api/assist', 'POST', { q: 'hei' })).status, 401);
  assert.equal((await N('/api/chat/send', 'POST', { text: 'hei' })).status, 401);
});

test('glimt-jobber: nordlysvarselet, minnevarselet og planlagte oppgaver går via den felles planleggeren (ikke aktive i test)', async () => {
  const { listJobs } = await import('../server/jobs/index.js');
  const jobs = listJobs().filter((j) => ['brief.', 'glimt.'].some((p) => j.name.startsWith(p)));
  assert.deepEqual(jobs.map((j) => [j.name, j.everyMs]).sort(), [['brief.generate', 30_000], ['brief.nordlys', 60_000], ['glimt.minne-varsel', 300_000], ['glimt.planlagte-oppgaver', 60_000]]);
  assert.ok(jobs.every((j) => !j.active));
});
