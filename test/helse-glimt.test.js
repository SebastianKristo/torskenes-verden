// Prompt 57: Glimt og helse. «Hvor mye sov jeg?», «hvor mange skritt i dag?», «når trente jeg sist?» og «hva veier jeg?» svares av
// verktøyet health.get med brukerens egne tall – uten modell, og helsetallene går aldri inn i et modellkall, en trace eller en cache.
import './lib/day-clock.mjs'; // klokka mellom 09 og 21 (Oslo), så natten som sluttet i morges er «i natt»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-helseglimt-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-57g';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
const outbound = [];
globalThis.fetch = async (u, o) => { outbound.push(`${u} ${o?.body ?? ''}`); throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const P = await import('../server/glimt/plan.js');
const TH = await import('../server/glimt/tools-helse.js');
const { osloDate, osloToUtc, addDays } = await import('../server/dates/oslo.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (cookie) => (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const A = as(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ola', password: 'olaPassord123', role: 'bruker', name: 'Ola' })).status, 200);
const O = as(await login('ola', 'olaPassord123'));

const now = Date.now(), today = osloDate(now), y = addDays(today, -1);
const u = (d, hm) => +osloToUtc(d, hm);
assert.equal((await A('/api/helse', 'POST', {
  days: [{ date: today, steps: 6789, distanceM: 4821 }, { date: y, steps: 11002 }],
  sleep: [{ start: u(y, '23:41'), end: u(today, '06:53'), stage: 'core' }],
  workouts: [{ id: 'w-1', type: 'cycling', start: u(y, '17:30'), end: u(y, '18:15'), kcal: 380, distanceM: 15300 }],
  weight: [{ at: u(today, '07:00'), kg: 79.4 }],
})).status, 200);

test('gjenkjenner egne helsespørsmål, ikke planer eller andres', () => {
  const cases = [
    ['Hvor mye sov jeg?', 'sleep'], ['hvor mye sov jeg i natt', 'sleep'], ['Hvor mange skritt har jeg gått i dag?', 'steps'],
    ['Når trente jeg sist?', 'workout'], ['Hva veier jeg?', 'weight'], ['Hvor mye veide jeg?', 'weight'],
    ['Når er treningen min i morgen?', null], ['Legg inn trening i morgen kl 18', null], ['Hvor mye sov du?', null],
    ['Hva har jeg gått glipp av?', null], ['Hvor er Ingrid?', null],
  ];
  for (const [t, want] of cases) assert.equal(TH.helseSporsmal57(t)?.what ?? null, want, t);
  assert.equal(TH.helseSporsmal57('Hvor mange skritt gikk jeg i går?').when, 'i går');
});

test('svarene lages av tallene, uten modell, og bare av egne data', async () => {
  const calls = [];
  P._setGlimtModel45(async (o) => { calls.push(o); throw new Error('modellen skal ikke brukes'); });
  try {
    const ask = async (who, text) => { const r = await who('/api/glimt/agent', 'POST', { text, module: 'home' }); assert.equal(r.status, 200, r.text); return r.body; };
    let r = await ask(A, 'Hvor mye sov jeg?');
    assert.equal(r.reply.split(' ').slice(0, 2).join(' '), 'Du sov');
    assert.match(r.reply, /7 t 12 m i natt \(23:41–06:53\)/);
    assert.deepEqual(r.actions.map((x) => x.tool), ['health.get']);
    assert.equal(r.engine, 'lokal');
    r = await ask(A, 'Hvor mange skritt har jeg gått i dag?');
    assert.match(r.reply, /6\s789 skritt i dag \(4,8 km\)/);
    r = await ask(A, 'Hvor mange skritt gikk jeg i går?');
    assert.match(r.reply, /I går gikk du 11\s002 skritt/);
    r = await ask(A, 'Når trente jeg sist?');
    assert.match(r.reply, /Sist du trente var i går kl\. 17:30: Sykling, 45 min, 15,3 km, 380 kcal\./);
    r = await ask(A, 'Hva veier jeg?');
    assert.match(r.reply, /Du veier 79,4 kg \(målt i dag\)/);
    // Ola har ingen helsedata, og ser aldri Sebastians.
    r = await ask(O, 'Hvor mye sov jeg?');
    assert.match(r.reply, /ingen helsedata/);
    assert.doesNotMatch(JSON.stringify(r), /7 t 12|6\s?789|79,4/);
  } finally { P._setGlimtModel45(null); }
  assert.equal(calls.length, 0, 'ingen modellkall for helsespørsmålene');
  assert.ok(!outbound.some((x) => /6789|79\.4|79,4|11002/.test(x)), 'ingen helsetall ut av huset');
});

test('helsetallene lagres ikke i Glimt-tracen', () => {
  const rows = db.prepare('SELECT data FROM glimt47_trace').all().map((r) => r.data);
  assert.ok(rows.some((d) => d.includes('health.get')), 'tracen finnes');
  for (const d of rows.filter((x) => x.includes('health.get'))) {
    assert.doesNotMatch(d, /6\s?789|7 t 12|79,4|11\s?002|Sykling/);
    assert.match(d, /\[helse – ikke lagret\]/);
  }
});

test('planleggeren (lokal modell) ser bare spørsmålet, aldri tallene', async () => {
  const prompts = [];
  P._setGlimtModel45(async (o) => {
    prompts.push(JSON.stringify(o));
    return { data: { intent: 'app', calls: [{ tool: 'health.get', args: { what: 'sleep' } }], needs_clarification: false, clarification_question: null }, model: 'lokal' };
  });
  try {
    const r = await A('/api/glimt/agent', 'POST', { text: 'Fortell meg litt om søvnen min', module: 'home' });
    assert.equal(r.status, 200, r.text);
    assert.match(r.body.reply, /7 t 12 m/);
  } finally { P._setGlimtModel45(null); }
  assert.ok(prompts.length >= 1);
  for (const p of prompts) assert.doesNotMatch(p, /6\s?789|7 t 12|79,4|432/);
});

test('Brief: kortet Helse med søvn og skritt, bare egne tall og ikke i AI-oppsummeringen', async () => {
  const prompts = [];
  P._setGlimtModel45(async (o) => { prompts.push(JSON.stringify(o)); throw new Error('ingen modell'); });
  try {
    const b = (await A('/api/brief')).body;
    assert.equal(b.cards.find((c) => c.id === 'health').label, 'Helse');
    assert.equal(b.health.text, 'Du sov 7 t 12 m i natt og har gått 6 789 skritt i dag.');
    assert.equal(b.health.sleepRange, '23:41–06:53');
    assert.equal((await O('/api/brief')).body.health, null);
    // Av i Innstillinger → Glimt → Brief: ingen helse i briefen.
    const ids = b.cards.map((c) => ({ id: c.id, on: c.id !== 'health' }));
    assert.equal((await A('/api/glimt/settings', 'PUT', { cards: ids })).status, 200);
    assert.equal((await A('/api/brief')).body.health, null);
  } finally { P._setGlimtModel45(null); }
  for (const p of prompts) assert.doesNotMatch(p, /6\s?789|7 t 12/);
  assert.ok(!outbound.some((x) => /6789|7 t 12/.test(x)));
});
