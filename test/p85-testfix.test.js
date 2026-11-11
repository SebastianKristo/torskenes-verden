// Prompt 85 (TESTFIX85): rettinger funnet mens de kjente feilende testene ble gjort grønne.
//  1. Sporing: en returnert sending med passert forventet levering vises som «Returnert», ikke «Forsinket» (server/tracking.js).
//  2. Glimt: planlegger modellen bare prat eller nettsøk for et strømprisspørsmål, svarer strømprisverktøyet (server/glimt45/engine.js);
//     planlagte oppgaver om strømpris røres ikke.
//  3. Min reise (mock-rutetabellen): hvilke minutter i 30-minutterssyklusen 46 står først – begrunner den låste klokka i p41-testen.
// Ingen nett: fetch er byttet ut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p85tf-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-85t';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MOCK_DATA', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'OMLX_URL', 'OMLX_API_KEY', 'SEARXNG_URL', 'BRAVE_API_KEY']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const outside = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  const s = String(u);
  const m = s.match(/^https:\/\/www\.hvakosterstrommen\.no\/api\/v1\/prices\/(\d{4})\/(\d{2})-(\d{2})_NO\d\.json$/);
  if (m) { // 24 timer, 1,00 kr/kWh uten mva
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', timeZoneName: 'longOffset' }).formatToParts(new Date(`${date}T12:00:00Z`)).find((x) => x.type === 'timeZoneName').value.replace('GMT', '');
    return Response.json(Array.from({ length: 24 }, (_, h) => ({ NOK_per_kWh: 1, EUR_per_kWh: 0.09, EXR: 11.7, time_start: `${date}T${String(h).padStart(2, '0')}:00:00${off}`, time_end: '' })));
  }
  outside.push(s);
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
};
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, OWNER } = await import('../server/db.js');
const trk = await import('../server/tracking.js');
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const ruter = await import('../server/ruter41.js');

const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
assert.equal(r0.status, 200);
const cookie = r0.headers.get('set-cookie').split(';')[0];
const A = async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: j, text: t };
};
const day = (n) => new Date(Date.now() + n * 86400_000).toLocaleDateString('sv-SE');

test('sporing: returnert sending med passert forventet levering er «Returnert», ikke «Forsinket»; i transport blir fortsatt «Forsinket»', async () => {
  const mk = (no, status, eta) => {
    trk.upsertShipment({ trackingNo: no, carrier: 'bring', source: 'manual' });
    db.prepare('UPDATE hl_shipments SET status=?, eta=? WHERE user_id=? AND tracking_no=?').run(status, eta, OWNER, no);
  };
  mk('70700000000000851', 'returned', day(-10));
  mk('70700000000000852', 'in_transit', day(-10));
  mk('70700000000000853', 'in_transit', day(3));
  mk('70700000000000854', 'ready_for_pickup', day(-10));
  const items = [...(await A('/api/tracking')).body.items, ...((await A('/api/tracking?archived=1')).body?.items ?? [])];
  const st = (no) => { const x = items.find((i) => i.trackingNo === no) ?? trk.getShipment?.(OWNER, no); assert.ok(x, `fant ${no}`); return x; };
  assert.equal(st('70700000000000851').status, 'returned');
  assert.equal(st('70700000000000851').statusText, 'Returnert');
  assert.equal(st('70700000000000851').delayed, false);
  assert.equal(st('70700000000000852').status, 'delayed', 'passert dato i transport = forsinket (uendret)');
  assert.equal(st('70700000000000853').status, 'in_transit');
  assert.equal(st('70700000000000854').status, 'ready_for_pickup');
});

test('Glimt: strømprisspørsmål svares av strømprisverktøyet også når planleggeren velger nettsøk eller prat; planlagte oppgaver røres ikke', async () => {
  const answers = [];
  let plan = null;
  P._setGlimtModel45(async () => ({ data: { needs_clarification: false, clarification_question: null, ...plan }, model: 'test-planner' }));
  E._setAnswerModel47(async (o) => { answers.push(o); return { text: 'Svar fra modellen.', model: 'test-answer' }; });
  try {
    for (const p of [{ intent: 'web_search', calls: [{ tool: 'web.search', args: { query: 'strømpris Oslo' } }] }, { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }]) {
      plan = p; answers.length = 0;
      const q = `hva er strømprisen i Oslo i dag${p.intent === 'chat' ? '?' : ''}`; // ulik tekst → ikke svar-cachen
      const g = await A('/api/assist', 'POST', { q });
      assert.equal(g.status, 200, g.text);
      assert.equal(g.body.tool, 'Strømpris', `${p.intent}: ${g.text.slice(0, 300)}`);
      assert.match(g.body.text, /NO1.*125 øre\/kWh/);
      assert.equal(answers.length, 0, 'ingen modell formulerte svaret');
    }
    // Vanlig prat går fortsatt til svarsteget.
    plan = { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }; answers.length = 0;
    const c = await A('/api/assist', 'POST', { q: 'hva er hovedstaden i Frankrike' });
    assert.equal(c.body.text, 'Svar fra modellen.');
    assert.equal(answers.length, 1);
    // En planlagt oppgave om strømpris er fortsatt motorens (bekreftelse), ikke et prissvar.
    plan = { intent: 'schedule_create', calls: [{ tool: 'schedule.create', args: { what: 'strømprisene for i dag', when: 'hver morgen kl. 7' } }] };
    const s = await E.agent45(OWNER, 'Send meg strømprisene hver morgen kl. 7', { module: 'home', legacyOk: false });
    assert.notEqual(s.legacy, true, 'ikke sendt til de gamle svarene');
  } finally { P._setGlimtModel45(null); E._setAnswerModel47(null); }
  assert.deepEqual(outside.filter((u) => !/127\.0\.0\.1:9/.test(u)), [], 'ingen kall ut på nettet');
});

test('Min reise (mock): 45 står først i 23 av 30 minutter, 46 når den er over 3 min raskere – p41-testen låser derfor klokka til minutt 10', async () => {
  process.env.MOCK_DATA = '1';
  try {
    const base = Date.parse('2026-11-11T12:00:00Z');
    const first = [];
    for (let m = 0; m < 30; m++) {
      const r = await ruter.myTrip41(OWNER, { dir: 'toHome', now: base + m * 60_000 });
      const o = r.options[0], line = o.legs.find((l) => l.mode === 'bus').line;
      first.push(line);
      const b45 = r.options.find((x) => x.legs.some((l) => l.line === '45'));
      if (line === '46') assert.ok(Date.parse(b45.arr) - Date.parse(o.arr) > 3 * 60_000, `minutt ${m}: 46 først bare når den er over 3 min raskere`);
      else assert.equal(o.preferred, true);
    }
    assert.equal(first[10], '45');
    assert.equal(first.filter((x) => x === '46').length, 7);
  } finally { delete process.env.MOCK_DATA; }
});

test('dal53: en treg lasting som ble startet før lasteren ble byttet, skriver ikke over den nye instansen (p54 «Voz parallelt» under last)', async () => {
  const M = await import('../server/dal53/models.js');
  const slow = { navn: 'gammel' }, mock = { navn: 'ny' };
  M._setLoader53('tongue', () => new Promise((r) => setTimeout(() => r(slow), 60)));
  const old = M.load53('tongue'); // lastes i bakgrunnen, som den ekte Tongue gjør ved første bruk
  M._setLoader53('tongue', async () => mock);
  assert.equal(await M.load53('tongue'), mock);
  await old;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(M.ready53('tongue'), mock, 'den gamle lastingen tok ikke over');
  // En gammel lasting som feiler, velter heller ikke den nye.
  M._setLoader53('tongue', () => new Promise((_, no) => setTimeout(() => no(new Error('gammel feil')), 30)));
  const bad = M.load53('tongue');
  M._setLoader53('tongue', async () => mock);
  await M.load53('tongue');
  await bad;
  assert.equal(M.ready53('tongue'), mock);
  assert.equal(M.health53().models.find((m) => m.id === 'tongue').status, 'ready');
  M._setLoader53('tongue', null);
});
