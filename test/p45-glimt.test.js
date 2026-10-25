// Prompt 45 (GLIMT45): Glimt-motoren – forstå, plan, validering, utførelse, kontroll og svar. Mock av Ollama for determinisme
// (både tool calling og JSON-modus), og den lokale planleggeren (MOCK_DATA, modellen nede). Testene sjekker lagrede/hentede data,
// ikke bare svarteksten. Fast «i dag»: fredag 23. oktober 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p45g-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-45g';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv } = await import('../server/db.js');
const D = await import('../server/glimt45/dates.js');
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const TL = await import('../server/glimt45/tools.js');
const { runAsUser } = await import('../server/settings.js');
const { eventsFor } = await import('../server/calendar.js');

const TODAY = '2026-10-23'; // fredag
E._setClock45({ today: TODAY, nowMin: 600 });
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
for (const [u, name] of [['ola', 'Ola'], ['kari', 'Kari']]) assert.equal((await A('/api/users', 'POST', { username: u, password: `${u}Passord123`, role: 'bruker', name })).status, 200);
const O = as(await login('ola', 'olaPassord123'));
const K = as(await login('kari', 'kariPassord123'));
const idOf = (u) => db.prepare('SELECT id FROM users WHERE username=?').pluck().get(u);
const OLA = idOf('ola'), KARI = idOf('kari');
const agent = (who, text, extra = {}) => who('/api/glimt/agent', 'POST', { text, module: 'home', ...extra });
const evsOf = async (u, from, to = from) => (await runAsUser(u, () => eventsFor(u, from, to))).events.filter((e) => e.source === 'local');
const tasksOf = (u) => db.prepare('SELECT * FROM hl_tasks WHERE created_by=? AND archived_at IS NULL ORDER BY id').all(u);
let rid = 0;
const RID = () => `t45-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;

/* ---------------- Mock av Ollama ---------------- */

// Planene en god modell gir (bevisst med sløve felt: hele setningen som tittel, feil år), så valideringen må rette dem.
const MODEL_PLANS = [
  [/^Legg til time 12\.10 12:15 Kino se på dune$/i, { intent: 'create', module: 'calendar', calls: [{ tool: 'calendar.create', args: { title: 'Legg til time 12.10 12:15 Kino se på dune', date: '2026-10-12', time: '12:15' } }] }],
  [/^Legg til kino (?:neste )?fredag klokka sju$/i, { intent: 'create', module: 'calendar', calls: [{ tool: 'calendar.create', args: { title: 'Kino', date: 'fredag', time: 'klokka sju' } }] }],
  [/^Minn meg på å kjøpe melk i morgen$/i, { intent: 'create', module: 'tasks', calls: [{ tool: 'tasks.create', args: { title: 'Kjøpe melk', due: 'i morgen' } }] }],
  [/^Hva har jeg i kalenderen neste uke\?$/i, { intent: 'summarize', module: 'calendar', calls: [{ tool: 'calendar.list', args: { period: 'neste uke' } }] }],
  [/^Finn kvitteringen fra Elkjøp forrige måned$/i, { intent: 'search', module: 'finance', calls: [{ tool: 'finance.search', args: { merchant: 'Elkjøp', period: 'forrige måned', kind: 'receipt' } }] }],
  [/^Hva kjøpte jeg for 849 kroner hos Clas Ohlson\?$/i, { intent: 'search', module: 'finance', calls: [{ tool: 'finance.search', args: { merchant: 'Clas Ohlson', amount: 849 } }] }],
  [/^Finn kvitteringer med batterier$/i, { intent: 'search', module: 'finance', calls: [{ tool: 'finance.search', args: { item: 'batterier', kind: 'receipt' } }] }],
  [/^Flytt avtalen til fredag$/i, { intent: 'update', module: 'calendar', calls: [{ tool: 'calendar.update', args: { target: '', date: 'fredag' } }] }],
  [/^Hva brukte jeg mest penger på forrige måned\?$/i, { intent: 'summarize', module: 'finance', calls: [{ tool: 'finance.summary', args: { period: 'forrige måned', group_by: 'category' } }] }],
  [/^Legg til noe$/i, { intent: 'ask', module: 'home', calls: [], ask: 'Hva vil du legge til – en avtale eller et gjøremål?' }],
];
const calls = [];
function mockModel({ mode, prompt }) {
  const text = /Melding: (.*)/.exec(prompt)[1];
  calls.push({ mode, text });
  const hit = MODEL_PLANS.find(([re]) => re.test(text));
  if (!hit) return { text: '{"intent":"chat","module":"chat","calls":[{"tool":"chat.answer","args":{}}]}', model: 'mock' };
  const plan = hit[1];
  if (mode === 'tools') return plan.calls.length ? { toolCalls: plan.calls.map((c) => ({ function: { name: c.tool, arguments: c.args } })), text: '', model: 'mock' } : { text: plan.ask, model: 'mock' };
  return { data: plan, text: JSON.stringify(plan), model: 'mock' };
}
const withModel = async (mode, fn) => { P._setGlimtModel45(mockModel); P._setToolMode45(mode); calls.length = 0; try { return await fn(); } finally { P._setGlimtModel45(null); P._setToolMode45(null); } };

/* ---------------- Finansdata for Ola ---------------- */

function seedFinance(u) {
  const cat = (name) => db.prepare('SELECT id FROM fh_categories WHERE user_id=? AND name=?').pluck().get(u, name);
  const tx = db.prepare('INSERT INTO fh_transactions(date, amount, description, merchant, category_id, source, created, user_id) VALUES(?,?,?,?,?,?,?,?) RETURNING id');
  const rc = db.prepare("INSERT INTO fh_receipts(id, status, merchant, date, total, extraction, transaction_id, created, user_id) VALUES(?, 'booked', ?, ?, ?, ?, ?, ?, ?)");
  const now = Date.now();
  const t1 = tx.get('2026-09-14', -129900, 'ELKJOP OSLO CITY', 'Elkjøp', cat('Hjem'), 'csv', now, u).id;
  rc.run('rc45-elkjop', 'Elkjøp', '2026-09-14', 129900, JSON.stringify({ lines: [{ description: 'USB-C strømadapter 65W', amount: 499 }, { description: 'Hodetelefoner', amount: 800 }] }), t1, now, u);
  const t2 = tx.get('2026-10-02', -84900, 'CLAS OHLSON', 'Clas Ohlson', cat('Hjem'), 'csv', now, u).id;
  rc.run('rc45-clas', 'Clas Ohlson', '2026-10-02', 84900, JSON.stringify({ lines: [{ description: 'Batterier AA 12-pk', amount: 149 }, { description: 'Skrutrekker', amount: 700 }] }), t2, now, u);
  rc.run('rc45-kiwi', 'Kiwi', '2026-09-20', 23450, JSON.stringify({ lines: [{ description: 'Duracell AAA batteri 4pk', amount: 99.5 }, { description: 'Melk', amount: 22 }, { description: 'Brød', amount: 113 }] }), null, now, u);
  tx.get('2026-09-21', -450000, 'Kiwi Majorstuen', 'Kiwi', cat('Mat og dagligvarer'), 'csv', now, u);
  tx.get('2026-09-25', -120000, 'Ruter billett', 'Ruter', cat('Transport og lading'), 'csv', now, u);
  tx.get('2026-08-25', -999900, 'Kiwi august', 'Kiwi', cat('Mat og dagligvarer'), 'csv', now, u);
}
// Ledger og kategorier lages ved første finanskall.
await O('/api/glimt/agent', 'POST', { text: 'Hva brukte jeg mest penger på forrige måned?', module: 'finance' });
seedFinance(OLA);

/* ---------------- Dato, tid og beløp (deterministisk) ---------------- */

test('dato/tid: norske formater, relative datoer, månedsskifte, årsskifte og ugyldige datoer', () => {
  const W = (t, today = TODAY, o = {}) => { const w = D.whenOf45(t, today, { nowMin: 600, ...o }); return [w.date, w.start, w.end]; };
  assert.deepEqual(W('Legg til time 12.10 12:15 Kino se på dune'), ['2027-10-12', '12:15', null], 'dd.mm passert → neste år (appens regel)');
  assert.deepEqual(W('12/11 kl 9.30'), ['2026-11-12', '09:30', null]);
  // Prompt 47: ukedag-regelen – samme ukedag som i dag = i dag når klokkeslettet ikke er passert (kl. 10 nå), ellers om en uke.
  assert.deepEqual(W('fredag klokka sju kino'), ['2026-10-23', '19:00', null], 'samme ukedag, 19:00 ikke passert = i dag; kino → kveld');
  assert.deepEqual(W('fredag kl 9'), ['2026-10-30', '09:00', null], 'samme ukedag, 09:00 passert = om en uke');
  assert.deepEqual(W('neste fredag klokka sju kino'), ['2026-10-30', '19:00', null], '«neste» samme ukedag = om en uke');
  assert.deepEqual(W('møte kl 16'), ['2026-10-23', '16:00', null]);
  for (const t of ['16h', '1600', 'kl1600', '16:00', 'kl. 16.00']) assert.equal(D.parseTime45(t).start, '16:00', t);
  assert.equal(D.parseTime45('halv åtte i kveld').start, '19:30');
  assert.equal(D.parseTime45('kvart på ni').start, '08:45');
  assert.deepEqual([D.parseTime45('trening 16-18').start, D.parseTime45('trening 16-18').end], ['16:00', '18:00']);
  assert.equal(D.parseTime45('betal 1600 kr'), null, 'beløp er ikke tid');
  assert.equal(D.parseTime45('møte 3 nov 2026'), null, 'årstall er ikke tid');
  // Månedsskifte og årsskifte
  assert.equal(D.parseDate45('i morgen', '2026-10-31').date, '2026-11-01');
  assert.equal(D.parseDate45('i morgen', '2026-12-31').date, '2027-01-01');
  assert.equal(D.parseDate45('1.1', '2026-12-30').date, '2027-01-01');
  assert.equal(D.parseDate45('31.12', '2027-01-02', { prefer: 'past' }).date, '2026-12-31');
  assert.equal(D.parseDate45('mandag', '2026-12-30').date, '2027-01-04');
  assert.deepEqual(D.parsePeriod45('forrige måned', '2027-01-10'), { from: '2026-12-01', to: '2026-12-31', label: 'i desember 2026', raw: 'forrige måned', span: [0, 13] });
  assert.deepEqual([D.parsePeriod45('neste uke', '2026-12-30').from, D.parsePeriod45('neste uke', '2026-12-30').to], ['2027-01-04', '2027-01-10']);
  assert.deepEqual([D.parsePeriod45('forrige måned', TODAY).from, D.parsePeriod45('forrige måned', TODAY).to], ['2026-09-01', '2026-09-30']);
  assert.deepEqual([D.parsePeriod45('i februar', '2028-03-01').to], ['2028-02-29'], 'skuddår');
  // Ugyldige datoer
  assert.equal(D.parseDate45('31.02').error, 'invalid');
  assert.equal(D.parseDate45('29.02.2027').error, 'invalid');
  assert.equal(D.parseDate45('12/13').error, 'invalid');
  assert.equal(D.parseTime45('kl 25').error, 'invalid');
  // Beløp
  assert.deepEqual(D.parseAmount45('for 849 kroner'), { amount: 849, raw: '849 kroner' });
  assert.equal(D.parseAmount45('kr 1 299,50').amount, 1299.5);
  assert.deepEqual([D.parseAmount45('mellom 200 og 500 kr').min, D.parseAmount45('mellom 200 og 500 kr').max], [200, 500]);
  assert.equal(D.parseAmount45('over 500 kr').min, 500);
});

test('tittel: aldri hele setningen', () => {
  assert.equal(TL.cleanEventTitle45('Legg til time Kino se på dune'), 'Kino – Dune');
  assert.equal(TL.cleanEventTitle45('Legg til kino i kalenderen'), 'Kino');
  assert.equal(TL.cleanTaskTitle45('Minn meg på å kjøpe melk'), 'Kjøpe melk');
  assert.equal(TL.cleanTaskTitle45('Husk at jeg må kjøpe melk'), 'Kjøpe melk');
  assert.equal(TL.cleanTaskTitle45('Minn meg på å bestille service på bilen'), 'Bestille service på bilen');
});

/* ---------------- Modellen: JSON-modus og tool calling ---------------- */

test('modell (JSON): «Legg til time 12.10 12:15 Kino se på dune» → avtale med riktig dato, tid og ryddig tittel (validering retter modellen)', async () => {
  await withModel('json', async () => {
    const r = await agent(O, 'Legg til time 12.10 12:15 Kino se på dune', { requestId: RID() });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.engine, 'ollama-json');
    assert.equal(r.body.intent, 'create');
    assert.equal(r.body.actions[0].tool, 'calendar.create');
    assert.equal(r.body.actions[0].status, 'done');
    assert.deepEqual([r.body.actions[0].args.title, r.body.actions[0].args.date, r.body.actions[0].args.start, r.body.actions[0].args.end], ['Kino – Dune', '2027-10-12', '12:15', '15:15']); // prompt 47: kino = 3 t (antatt)
    assert.match(r.body.reply, /^Lagt inn: \*\*Kino – Dune, tirsdag 12\. oktober 2027 kl\. 12:15\*\*.*Slutt kl\. 15:15 er antatt \(3 t for kino\)/);
    assert.equal(calls.length, 1, 'ett modellkall');
  });
  const saved = await evsOf(OLA, '2027-10-12');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, 'Kino – Dune');
  assert.equal(saved[0].time, '12:15–15:15');
});

test('modell (tool calling): «Legg til kino neste fredag klokka sju» → riktig fredag og 19:00, ingen oppdiktet sted', async () => {
  await withModel('tools', async () => {
    const r = await agent(O, 'Legg til kino neste fredag klokka sju', { requestId: RID() }); // prompt 47: «fredag» en fredag = i dag
    assert.equal(r.body.engine, 'ollama-tools');
    assert.equal(r.body.actions[0].status, 'done');
    assert.equal(r.body.actions[0].args.date, '2026-10-30');
    assert.equal(r.body.actions[0].args.start, '19:00');
    assert.equal(r.body.actions[0].args.location, null);
    assert.equal(calls[0].mode, 'tools');
  });
  const e = (await evsOf(OLA, '2026-10-30')).find((x) => x.title === 'Kino');
  assert.ok(e, 'lagret');
  assert.equal(e.time, '19:00–22:00', 'prompt 47: kino = 3 t');
  assert.equal(e.room, '');
});

test('modell: «Minn meg på å kjøpe melk i morgen» → oppgave «Kjøpe melk» med frist i morgen', async () => {
  await withModel('json', async () => {
    const r = await agent(O, 'Minn meg på å kjøpe melk i morgen', { requestId: RID() });
    assert.equal(r.body.actions[0].tool, 'tasks.create');
    assert.match(r.body.reply, /Kjøpe melk/);
  });
  const t = tasksOf(OLA).find((x) => x.title === 'Kjøpe melk');
  assert.ok(t);
  assert.equal(t.due, '2026-10-24');
  assert.equal(t.glimt, 1);
});

test('modell: ugyldig JSON → ett nytt forsøk (med thinking), så et oppfølgingsspørsmål med valg – ingenting lagres (prompt 55)', async () => {
  let n = 0;
  const steps = [];
  P._setGlimtModel45(async (o) => { n++; steps.push(o.step); return { text: 'tull og tøys', model: 'mock' }; });
  try {
    const before = tasksOf(OLA).length;
    const r = await agent(O, 'Minn meg på å vanne blomstene i morgen', { requestId: RID() });
    assert.ok(n <= 2, `modellkall: ${n}`);
    assert.deepEqual(steps, ['planner', 'plannerRetry']);
    assert.equal(r.body.intent, 'ask');
    assert.deepEqual(r.body.actions, []);
    assert.ok(r.body.ask?.options?.some((o) => o.id === 'task'), JSON.stringify(r.body.ask));
    assert.equal(r.body.ask.options[0].id, 'task', 'tekstmønstrene setter rekkefølgen');
    assert.equal(tasksOf(OLA).length, before, 'ingenting lagret ut fra en gjetning');
  } finally { P._setGlimtModel45(null); }
});

test('modell: verktøy ikke støttet (400) → JSON-modus i samme forespørsel', async () => {
  const modes = [];
  P._setToolMode45(null);
  P._setGlimtModel45(async ({ mode, prompt }) => { modes.push(mode); if (mode === 'tools') throw new Error('registry.ollama.ai/library/gemma3 does not support tools'); return mockModel({ mode, prompt }); });
  try {
    const { modelInfo45 } = P;
    void modelInfo45;
    P._setToolMode45('tools');
    const r = await agent(O, 'Minn meg på å kjøpe melk i morgen', { requestId: RID() });
    assert.deepEqual(modes, ['tools', 'json']);
    assert.equal(r.body.engine, 'ollama-json');
    assert.equal(P.toolModeFor45('gemma3:12b'), 'tools', 'tvunget i test');
    P._setToolMode45(null);
    assert.equal(P.toolModeFor45('gemma3:12b'), 'json', 'gemma3 → JSON-skjema');
    assert.equal(P.toolModeFor45('qwen3:8b'), 'json', 'prompt 47: planleggeren bruker JSON-skjema (Ollama format) for alle modeller');
    assert.equal(P.toolModeFor45('qwen3:8b', 'openwebui'), 'json', 'Open WebUI sender ikke tool_calls tilbake');
  } finally { P._setGlimtModel45(null); P._setToolMode45(null); }
});

/* ---------------- Kalender: periode og kontekst ---------------- */

test('«Hva har jeg i kalenderen neste uke?» → faktiske avtaler mandag–søndag neste uke', async () => {
  await O('/api/kalender/events', 'POST', { title: 'Tannlege', date: '2026-10-27', start: '09:00', end: '10:00', calendar: 'privat' });
  await O('/api/kalender/events', 'POST', { title: 'Middag hos mormor', date: '2026-11-02', start: '17:00', end: '19:00', calendar: 'privat' });
  for (const mode of ['json', null]) {
    const run = () => agent(O, 'Hva har jeg i kalenderen neste uke?', { requestId: RID() });
    const r = mode ? await withModel(mode, run) : await run();
    assert.equal(r.body.actions[0].tool, 'calendar.list', JSON.stringify([mode, r.body]).slice(0, 600));
    assert.deepEqual([r.body.actions[0].args.from, r.body.actions[0].args.to], ['2026-10-26', '2026-11-01']);
    const titles = r.body.results.map((x) => x.title);
    assert.ok(titles.includes('Tannlege'));
    assert.ok(titles.includes('Kino'), 'kino fredag 30.');
    assert.ok(!titles.includes('Middag hos mormor'), 'utenfor perioden');
    assert.match(r.body.reply, /^Neste uke \(26\. okt–1\. nov\) har du \*\*\d+ avtaler\*\*/);
  }
});

test('«Flytt avtalen til fredag»: entydig kontekst → flyttes; tvetydig → spør; valgt i kalenderen → den', async () => {
  // Uten kontekst (ny bruker): spør, endrer ingenting.
  const k0 = await agent(K, 'Flytt avtalen til fredag', { requestId: RID() });
  assert.ok(k0.body.ask, 'spør');
  // Kari lager én avtale → «den» er entydig.
  const c = await agent(K, 'Legg til frisør mandag kl 10', { requestId: RID() });
  assert.equal(c.body.actions[0].status, 'done');
  const id = c.body.actions[0].result.eventId;
  const m = await withModel('json', () => agent(K, 'Flytt avtalen til fredag', { requestId: RID() }));
  assert.equal(m.body.actions[0].tool, 'calendar.update');
  assert.equal(m.body.actions[0].status, 'done', JSON.stringify(m.body));
  assert.match(m.body.reply, /^Flyttet \*\*«Frisør»\*\* til \*\*fredag 30\. oktober kl\. 10:00–11:00\*\*/); // prompt 47: frisør = 1 t
  assert.equal((await evsOf(KARI, '2026-10-26')).length, 0, 'ikke lenger mandag');
  assert.equal((await evsOf(KARI, '2026-10-30')).find((e) => e.title === 'Frisør')?.time, '10:00–11:00', 'varigheten beholdes');
  // Etter en liste med flere avtaler er «den» tvetydig → spør med valg.
  await agent(K, 'Legg til lege tirsdag kl 12', { requestId: RID() });
  await agent(K, 'Hva har jeg i kalenderen neste uke?', { requestId: RID() });
  const amb = await agent(K, 'Flytt avtalen til torsdag', { requestId: RID() });
  assert.equal(amb.body.intent, 'ask');
  assert.ok(amb.body.ask.options.length >= 2);
  assert.equal(amb.body.actions[0].status, 'proposed');
  // Valgt i Kalender (context.selectedId) → den, også fra modulen.
  const sel = await agent(K, 'flytt den til torsdag kl 14', { module: 'calendar', context: { selectedId: id }, requestId: RID() });
  assert.equal(sel.body.actions[0].status, 'done');
  assert.equal((await evsOf(KARI, '2026-10-29')).find((e) => e.title === 'Frisør')?.time, '14:00–15:00'); // prompt 47: frisør = 1 t
});

test('regresjon: «flytt den til fredag» på en avtale neste år (12.10 etter at 12.10 i år er passert) → fredag i avtalens uke, bekreftet', async () => {
  const c = await agent(K, 'Legg til time 12.10 12:15 Kino se på dune', { module: 'calendar', requestId: RID() });
  assert.equal(c.body.actions[0].args.date, '2027-10-12');
  const id = c.body.actions[0].result.eventId;
  const m = await agent(K, 'flytt den til fredag', { module: 'calendar', context: { selectedId: id, visibleIds: [id] }, requestId: RID() });
  assert.equal(m.body.actions[0].status, 'done', JSON.stringify(m.body).slice(0, 500));
  assert.ok(!/bekreftet ikke/.test(m.body.reply), m.body.reply);
  assert.equal(m.body.actions[0].args.date, '2027-10-15', 'fredagen i avtalens uke, ikke 30.10.2026');
  assert.match(m.body.reply, /^Flyttet \*\*«Kino – Dune»\*\* til \*\*fredag 15\. oktober 2027 kl\. 12:15–15:15\*\*/);
  assert.equal((await evsOf(KARI, '2027-10-15')).find((e) => e.title === 'Kino – Dune')?.time, '12:15–15:15', 'lagret');
  assert.equal((await evsOf(KARI, '2027-10-12')).filter((e) => e.title === 'Kino – Dune').length, 0);
  // Med klokkeslett, og fra Hjem med kontekst: samme uke, kontrollert.
  const t = await agent(K, 'flytt den til torsdag kl 18', { module: 'calendar', context: { selectedId: id }, requestId: RID() });
  assert.equal(t.body.actions[0].status, 'done', t.body.reply);
  assert.deepEqual([t.body.actions[0].args.date, t.body.actions[0].args.start], ['2027-10-14', '18:00']);
  // «neste fredag» betyr fortsatt kommende fredag.
  const n = await agent(K, 'flytt den til neste fredag', { module: 'calendar', context: { selectedId: id }, requestId: RID() });
  assert.equal(n.body.actions[0].status, 'done', n.body.reply);
  assert.equal(n.body.actions[0].args.date, '2026-10-30');
  assert.ok((await evsOf(KARI, '2026-10-30')).some((e) => e.title === 'Kino – Dune' && e.time === '18:00–21:00')); // varigheten (3 t kino) beholdes
});

test('regresjon: flytt en kopi til samme tid som en lik avtale → spør (ikke «bekreftet ikke»); kontrollen leser lagringen direkte', async () => {
  const mk = async (date) => (await K('/api/kalender/events', 'POST', { title: 'Kinokveld', date, start: '12:15', end: '13:15', calendar: 'privat' })).body.event.id;
  const a = await mk('2027-11-09'), b = await mk('2027-11-10');
  const m1 = await agent(K, 'flytt den til fredag', { module: 'calendar', context: { selectedId: a }, requestId: RID() });
  assert.equal(m1.body.actions[0].status, 'done', m1.body.reply);
  assert.equal(m1.body.actions[0].args.date, '2027-11-12');
  const m2 = await agent(K, 'flytt den til fredag', { module: 'calendar', context: { selectedId: b }, requestId: RID() });
  assert.ok(!/bekreftet ikke/.test(m2.body.reply), m2.body.reply);
  assert.equal(m2.body.intent, 'ask');
  assert.match(m2.body.reply, /ligger allerede i kalenderen/);
  assert.equal((await evsOf(KARI, '2027-11-10')).filter((e) => e.title === 'Kinokveld').length, 1, 'ikke flyttet');
  // Kontrollen: en hendelse som er lagret, men skjult i visningen den dagen, regnes som bekreftet (lagringen leses direkte).
  const tool = TL.TOOL45['calendar.update'];
  const raw = (kv.get(KARI, 'kal_local_events', []) ?? []).find((x) => x.id === a);
  const ok = await tool.verify({ status: 'done', result: { event: null, eventId: a, target: { date: raw.date, start: raw.start, allDay: false } } }, { user: KARI, today: TODAY });
  assert.equal(ok, true);
});

test('sletting krever bekreftelse; token per bruker; gjentatt bekreftelse = 409', async () => {
  const c = await agent(K, 'Legg til quiz lørdag kl 20', { requestId: RID() });
  const date = c.body.actions[0].args.date;
  const d = await agent(K, 'Slett quiz', { requestId: RID() });
  assert.equal(d.body.actions[0].status, 'needs_confirm');
  assert.ok(d.body.confirm.token);
  assert.equal(d.body.joke ?? null, null, 'ingen spøk ved sletting');
  assert.equal((await evsOf(KARI, date)).filter((e) => e.title === 'Quiz').length, 1, 'ikke slettet før bekreftelse');
  assert.equal((await O('/api/glimt/agent/confirm', 'POST', { token: d.body.confirm.token })).status, 404, 'andres token');
  const ok = await K('/api/glimt/agent/confirm', 'POST', { token: d.body.confirm.token });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.actions[0].status, 'done');
  assert.equal((await evsOf(KARI, date)).filter((e) => e.title === 'Quiz').length, 0, 'slettet');
  assert.equal((await K('/api/glimt/agent/confirm', 'POST', { token: d.body.confirm.token })).status, 409);
});

/* ---------------- Gjøremål ---------------- */

test('«Husk at jeg må kjøpe melk etter skolen i morgen» → «Kjøpe melk», i morgen, «etter skolen» bevart (ingen gjettet klokkeslett)', async () => {
  const r = await agent(K, 'Husk at jeg må kjøpe melk etter skolen i morgen', { requestId: RID() });
  assert.equal(r.body.actions[0].tool, 'tasks.create');
  const t = tasksOf(KARI).find((x) => x.title === 'Kjøpe melk');
  assert.ok(t);
  assert.deepEqual([t.due, t.time, t.note], ['2026-10-24', null, 'etter skolen']);
  assert.match(r.body.reply, /etter skolen/);
});

test('«Minn meg på å bestille service på bilen neste uke» fra Hjem → oppgave, mandag neste uke', async () => {
  const r = await agent(K, 'Minn meg på å bestille service på bilen neste uke.', { requestId: RID() });
  const t = tasksOf(KARI).find((x) => x.title === 'Bestille service på bilen');
  assert.equal(t?.due, '2026-10-26');
  assert.match(r.body.reply, /neste uke \(mandag 26\. oktober\)/);
});

/* ---------------- Finans ---------------- */

test('«Finn kvitteringen fra Elkjøp forrige måned» → kvitteringer, butikk + september', async () => {
  for (const mode of ['json', null]) {
    const run = () => agent(O, 'Finn kvitteringen fra Elkjøp forrige måned', { requestId: RID() });
    const r = mode ? await withModel(mode, run) : await run();
    const a = r.body.actions[0];
    assert.equal(a.tool, 'finance.search', JSON.stringify([mode, r.body]).slice(0, 600));
    assert.deepEqual([a.args.merchant, a.args.from, a.args.to, a.args.kind], ['Elkjøp', '2026-09-01', '2026-09-30', 'receipt']);
    assert.equal(a.result.count, 1);
    assert.equal(r.body.results[0].receiptId, 'rc45-elkjop');
    assert.match(r.body.reply, /^Fant kvitteringen: \*\*Elkjøp mandag 14\. september, 1 299 kr\*\*/);
    assert.equal(r.body.joke ?? null, null, 'ingen spøk om økonomi');
  }
});

test('«Hva kjøpte jeg for 849 kroner hos Clas Ohlson?» → beløp ±1 kr + butikk + varelinjene', async () => {
  const r = await withModel('json', () => agent(O, 'Hva kjøpte jeg for 849 kroner hos Clas Ohlson?', { requestId: RID() }));
  const a = r.body.actions[0];
  assert.deepEqual([a.args.amount, a.args.merchant], [849, 'Clas Ohlson']);
  assert.equal(a.result.count, 1);
  assert.match(r.body.reply, /Clas Ohlson fredag 2\. oktober, 849 kr/);
  assert.match(r.body.reply, /Batterier AA 12-pk/);
});

test('«Finn kvitteringer med batterier» → søker i varelinjene; flere treff → liste å velge fra', async () => {
  const r = await withModel('json', () => agent(O, 'Finn kvitteringer med batterier', { requestId: RID() }));
  assert.equal(r.body.actions[0].result.count, 2);
  assert.deepEqual(r.body.results.map((x) => x.receiptId).sort(), ['rc45-clas', 'rc45-kiwi']);
  assert.equal(r.body.choose, true);
  assert.match(r.body.reply, /^Fant \*\*2 kvitteringer\*\* med «batterier»/);
  // Uten modell: samme resultat.
  const l = await agent(O, 'Finn alle kvitteringene der jeg kjøpte batterier', { requestId: RID() });
  assert.equal(l.body.actions[0].result.count, 2);
});

test('«Finn kvitteringen for den nye laderen» → omskriving (lader ≈ USB-C strømadapter)', async () => {
  const r = await agent(O, 'Finn kvitteringen for den nye laderen.', { requestId: RID() });
  assert.equal(r.body.actions[0].tool, 'finance.search');
  assert.equal(r.body.actions[0].result.count, 1);
  assert.equal(r.body.results[0].receiptId, 'rc45-elkjop');
});

test('«Hva brukte jeg mest penger på forrige måned?» → regnet fra faktiske transaksjoner', async () => {
  const r = await withModel('json', () => agent(O, 'Hva brukte jeg mest penger på forrige måned?', { requestId: RID() }));
  const res = r.body.actions[0].result;
  const sql = db.prepare(`SELECT c.name, -sum(t.amount)/100.0 s FROM fh_transactions t JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND t.date BETWEEN '2026-09-01' AND '2026-09-30' AND t.amount<0 GROUP BY c.name ORDER BY s DESC`).all(OLA);
  assert.equal(res.top[0].name, sql[0].name);
  assert.equal(res.top[0].amount, sql[0].s);
  assert.equal(res.top[0].name, 'Mat og dagligvarer');
  assert.match(r.body.reply, /^I september brukte du mest på \*\*Mat og dagligvarer: 4 500 kr\*\*/);
});

test('tomme resultater og ærlighet: ingen treff, ukjent butikk, ingen varelinjer', async () => {
  const r = await agent(O, 'Finn kvitteringen fra Power forrige måned', { requestId: RID() });
  assert.equal(r.body.actions[0].result.count, 0);
  assert.match(r.body.reply, /^Fant \*\*ingen kjøp hos Power\*\* i september\./);
  // Kari har ingen kvitteringer: sier det ærlig, finner ikke på noe.
  const k = await agent(K, 'Finn kvitteringer med batterier', { requestId: RID() });
  assert.equal(k.body.actions[0].result.count, 0);
  assert.match(k.body.reply, /varelinjer|ingen kvitteringer/i);
  assert.deepEqual(k.body.results, [], 'per bruker: ser ikke Olas kvitteringer');
});

/* ---------------- Uklart, ugyldig, feil og gjentatt ---------------- */

test('tvetydig/ufullstendig → ett konkret spørsmål, ingenting lagret', async () => {
  const before = tasksOf(KARI).length;
  const r = await agent(K, 'legg til noe', { requestId: RID() });
  assert.equal(r.body.intent, 'ask');
  assert.match(r.body.ask.question, /avtale.*gjøremål/);
  const m = await withModel('json', () => agent(K, 'Legg til noe', { requestId: RID() }));
  assert.equal(m.body.intent, 'ask');
  const nodate = await agent(K, 'Legg til tannlege kl 9', { requestId: RID() });
  assert.match(nodate.body.ask?.question ?? '', /Hvilken dag/, 'finner ikke på dato');
  assert.equal(tasksOf(KARI).length, before);
});

test('ugyldig dato → spør, lagrer ingenting', async () => {
  const r = await agent(K, 'Legg til møte 31.02 kl 10', { requestId: RID() });
  assert.match(r.body.ask.question, /31\. februar finnes ikke/);
  assert.equal(r.body.actions[0].status, 'proposed');
});

test('verktøyfeil → «fikk ikke», ingen spøk, aldri bekreftet', async () => {
  const tool = TL.TOOL45['calendar.create'];
  const orig = tool.run;
  tool.run = async () => { throw Object.assign(new Error('Google-koblingen mangler skrivetilgang'), { reconnect: true }); };
  try {
    kv.set(KARI, 'glimt45_personality', 'full');
    const r = await agent(K, 'Legg til foreldremøte torsdag kl 18', { requestId: RID() });
    assert.equal(r.body.actions[0].status, 'failed');
    assert.match(r.body.reply, /^Fikk ikke lagt inn avtalen: Google-koblingen mangler skrivetilgang\./);
    assert.ok(!/Lagt inn/.test(r.body.reply));
    assert.equal(r.body.joke, null);
  } finally { tool.run = orig; kv.set(KARI, 'glimt45_personality', 'little'); }
  // Datakilden bekrefter ikke (verify feiler) → ikke «Lagt inn».
  const v = tool.verify;
  tool.verify = async () => false;
  try {
    const r = await agent(K, 'Legg til foreldremøte torsdag kl 19', { requestId: RID() });
    assert.equal(r.body.actions[0].status, 'failed');
    assert.match(r.body.reply, /bekreftet ikke/);
  } finally { tool.verify = v; }
});

test('gjentatte forespørsler: samme requestId → samme svar, én avtale; dobbel tekst → ingen duplikat', async () => {
  const id = RID();
  const a = await agent(K, 'Legg til kino søndag kl 18', { requestId: id });
  const b = await agent(K, 'Legg til kino søndag kl 18', { requestId: id });
  assert.equal(b.body.repeated, true);
  assert.equal(b.body.actions[0].result.eventId, a.body.actions[0].result.eventId);
  assert.equal((await evsOf(KARI, '2026-10-25')).filter((e) => e.title === 'Kino').length, 1);
  // Ny requestId, samme innhold (klienten sendte to ganger): finnes allerede → ikke lagt inn igjen.
  const c = await agent(K, 'Legg til kino søndag kl 18', { requestId: RID() });
  assert.equal(c.body.actions[0].result.existing, true);
  assert.match(c.body.reply, /ligger allerede i kalenderen/);
  assert.equal((await evsOf(KARI, '2026-10-25')).filter((e) => e.title === 'Kino').length, 1);
  // Uten requestId innen 30 s: samme svar.
  const d1 = await agent(K, 'Minn meg på å ringe bestemor i morgen');
  const d2 = await agent(K, 'Minn meg på å ringe bestemor i morgen');
  assert.equal(d2.body.repeated, true);
  assert.equal(tasksOf(KARI).filter((x) => x.title === 'Ringe bestemor').length, 1);
  void d1;
  assert.equal((await K('/api/glimt/agent', 'POST', { text: 'hei', requestId: 'x' })).status, 400, 'ugyldig requestId');
});

/* ---------------- Fra Hjem og fra modulene (/api/assist) ---------------- */

test('/api/assist (Hjem): kvitteringssøk er ikke lenger «Åpner Kvitteringer»; avtale lagres og bekreftes; vær er uendret', async () => {
  const f = await O('/api/assist', 'POST', { q: 'Finn kvitteringen fra Elkjøp forrige måned' });
  assert.equal(f.status, 200, f.text);
  assert.equal(f.body.intent, 'finance.search');
  assert.notEqual(f.body.intent, 'nav');
  assert.equal(f.body.agent.actions[0].result.count, 1);
  const c = await O('/api/assist', 'POST', { q: 'Legg til kino i kalenderen fredag klokka åtte.' });
  assert.equal(c.body.intent, 'appointment.create');
  assert.ok(c.body.created?.event, JSON.stringify(c.body).slice(0, 600));
  assert.ok(!c.body.quickJobId, 'ikke lenger en kø som bekrefter før lagring');
  const w = await O('/api/assist', 'POST', { q: 'Hva er været i morgen?' });
  assert.match(w.body.intent, /^weather/);
  const m = await O('/api/assist', 'POST', { q: 'Hva brukte jeg mest penger på forrige måned?' });
  assert.equal(m.body.intent, 'finance.spent');
  assert.equal(m.body.card.category, 'Mat og dagligvarer');
  const t = await O('/api/assist', 'POST', { q: 'Minn meg på å kjøpe batterier i morgen' });
  assert.equal(t.body.intent, 'tasks.create');
  assert.equal(t.body.kind, 'action');
  // Spørsmål uten handling får ikke «local» (parseQuick) i svaret.
  const q = await O('/api/assist', 'POST', { q: 'Hva har jeg i kalenderen neste uke?' });
  assert.equal(q.body.local, undefined);
  assert.equal(q.body.intent, 'calendar.summary');
});

test('/api/assist source:calendar og module calendar/tasks/finance: samme forståelse', async () => {
  const c = await O('/api/assist', 'POST', { q: 'legg til optiker torsdag kl 9', source: 'calendar' });
  assert.equal(c.body.intent, 'calendar.create', JSON.stringify(c.body).slice(0, 600));
  assert.ok(c.body.created.event.id);
  const fromCal = await agent(O, 'Minn meg på å kjøpe melk i morgen', { module: 'calendar', requestId: RID() });
  const fromTasks = await agent(O, 'kjøpe brød i morgen', { module: 'tasks', requestId: RID() });
  assert.equal(fromCal.body.actions[0].tool, 'tasks.create');
  assert.equal(fromTasks.body.actions[0].tool, 'tasks.create');
  const fin = await agent(O, 'Hva kjøpte jeg hos Kiwi?', { module: 'finance', requestId: RID() });
  assert.equal(fin.body.actions[0].tool, 'finance.search');
  const ruter = await agent(O, 'når går neste trikk?', { module: 'ruter', requestId: RID() });
  assert.equal(ruter.body.actions[0].tool, 'app.answer');
});

test('module tasks: Gjøremål-funksjonene (slå sammen like, spørsmål om lista) går til de eksisterende Glimt-funksjonene', async () => {
  await K('/api/tasks', 'POST', { title: 'Melk' }); await K('/api/tasks', 'POST', { title: 'Melk' });
  const m = await agent(K, 'slå sammen like', { module: 'tasks', requestId: RID() });
  assert.equal(m.body.actions[0].tool, 'tasks.glimt', JSON.stringify(m.body).slice(0, 400));
  assert.equal(m.body.actions[0].status, 'done');
  assert.equal(tasksOf(KARI).filter((x) => x.title === 'Melk' && !x.done).length, 1, 'slått sammen');
  const q = await agent(K, 'Hva er forfalt?', { module: 'tasks', requestId: RID() });
  assert.equal(q.body.actions[0].tool, 'tasks.glimt');
});

test('per bruker: andres hendelse som selectedId gir ingen endring', async () => {
  const c = await agent(K, 'Legg til yoga tirsdag kl 7', { requestId: RID() });
  const id = c.body.actions[0].result.eventId;
  const r = await agent(O, 'flytt den til fredag', { module: 'calendar', context: { selectedId: id }, requestId: RID() });
  assert.notEqual(r.body.actions[0]?.status, 'done');
  assert.ok((await evsOf(KARI, c.body.actions[0].args.date)).some((e) => e.title === 'Yoga'), 'Karis avtale står');
});

/* ---------------- Personlighet, logg og register ---------------- */

test('personlighet: Av · Litt · Full rakker; bekreftelse først, maks én spøk, aldri ved økonomi/feil/spørsmål', async () => {
  assert.equal((await K('/api/glimt/agent/settings')).body.personality, 'little');
  assert.equal((await K('/api/glimt/agent/settings', 'PUT', { personality: 'tull' })).status, 400);
  assert.equal((await K('/api/glimt/agent/settings', 'PUT', { glimt_personality: 'full' })).body.personality, 'full');
  const r = await agent(K, 'Legg til konsert onsdag kl 20', { requestId: RID() });
  assert.ok(r.body.joke, 'full rakker → spøk');
  assert.ok(r.body.reply.startsWith('Lagt inn:'), 'bekreftelsen først');
  assert.ok(r.body.reply.endsWith(r.body.joke));
  assert.equal(r.body.reply.split(r.body.joke).length, 2, 'én spøk');
  const a = await agent(K, 'Legg til', { requestId: RID() });
  assert.equal(a.body.joke ?? null, null);
  await K('/api/glimt/agent/settings', 'PUT', { personality: 'off' });
  const off = await agent(K, 'Legg til konsert onsdag kl 21', { requestId: RID() });
  assert.equal(off.body.joke, null);
  assert.equal(off.body.personality, 'off');
  const { quipFor } = await import('../server/glimt45/personality.js');
  assert.equal(quipFor('full', { kind: 'calendar', ok: true, title: 'Legetime' }), null, 'alvorlig tema');
  assert.match(quipFor('full', { kind: 'calendar', ok: true, title: 'Fest' }, { today: '2027-05-17' }), /17\. mai/);
  assert.match(quipFor('full', { kind: 'tasks', ok: true, title: 'Rydde' }, { today: '2027-02-21' }), /Kongen/);
  await K('/api/glimt/agent/settings', 'PUT', { personality: 'little' });
});

test('logg: verktøyvalg uten personopplysninger; register og modus', async () => {
  const log = (await K('/api/glimt/agent/log')).body.items;
  assert.ok(log.length > 0);
  const s = JSON.stringify(log);
  assert.ok(!/Kino|Frisør|melk|bestemor|quiz/i.test(s), 'ingen titler/tekst i loggen');
  assert.ok(log[0].tools.length >= 0 && typeof log[0].len === 'number');
  const reg = (await K('/api/glimt/agent/tools')).body;
  assert.ok(reg.tools.some((t) => t.name === 'calendar.delete' && t.destructive === true));
  assert.ok(reg.tools.every((t) => t.parameters.type === 'object'));
  assert.equal((await req('/api/glimt/agent', { method: 'POST', body: { text: 'hei' } })).status, 401);
});
