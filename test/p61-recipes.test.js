// Prompt 61 (prompt 49 del 1, D1SRV): oppskrifter som lærer av bruk. Malisering (person/sted/tidsrom), registrering av vellykkede
// kjøringer (vinduet 2 meldinger / 5 min), candidate → active → disabled, few-shot til planleggeren (etter det faste prefikset),
// hurtigvei (planleggeren hoppes over) med strenge krav og aldri for endrende handlinger, rettelser («nei, jeg mente …») →
// negativt eksempel + ny kandidat + testtilfelle i eval/learned/, tommel opp/ned, API-et for «Glimt lærer» og innstillingene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p61-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p61';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GLIMT_LEARNED_DIR;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const P47 = await import('../server/glimt45/plan47.js');
const W = await import('../server/glimt45/weather46.js');
const M47 = await import('../server/glimt45/memory47.js');
const T = await import('../server/recipes61/template.js');
const S61 = await import('../server/recipes61/settings.js');
const L61 = await import('../server/recipes61/learn.js');
const ST = await import('../server/recipes61/store.js');

E._setClock45({ today: '2026-10-24', nowMin: 600 });
let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
const A = (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const ME = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
let rid = 0;
const RID = () => `t61-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const agent = (text, extra = {}) => A('/api/glimt/agent', 'POST', { text, module: 'home', requestId: RID(), ...extra });
const ON = { save: true, fewshot: true, fast: true, learn: true };
M47._setEmbed47(async () => { throw new Error('ingen embedding i test'); }); // ordlikhet på malen (som i eval mock)

/* ---------------- Falsk planlegger ---------------- */

const seen = [];
let PLANS = [];
const BASE = [
  [/^Når er neste gang jeg skal til Nina\?$/, { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['Nina', 'frisør'], direction: 'next', limit: 1 } }] }],
  [/^Hvordan er været i (Oslo|Bergen) i morgen\?$/, (m) => ({ intent: 'weather', calls: [{ tool: 'weather.get', args: { place: m[1], when: 'i morgen' } }] })],
  [/^Når skal jeg møte Ola\?$/, { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['Ola'], direction: 'next', limit: 1 } }] }],
  [/^Legg inn trening på (\w+) kl 18$/, (m) => ({ intent: 'calendar_create', calls: [{ tool: 'calendar.create', args: { title: 'Trening', date: m[1], time: 'kl 18' } }] })],
];
P._setGlimtModel45(async ({ system, prompt, step }) => {
  const text = /Melding: (.*)/.exec(prompt)[1];
  seen.push({ text, system, prompt, step });
  for (const [re, v] of [...PLANS, ...BASE]) {
    const m = re.exec(text);
    if (m) { const d = typeof v === 'function' ? v(m, { system, prompt }) : v; return { data: { needs_clarification: false, clarification_question: null, ...d }, model: 'test-planner' }; }
  }
  return { data: { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }, model: 'test-planner' };
});
E._setAnswerModel47(async () => ({ text: 'Greit.', model: 'test-answer' }));
const WX = { Oslo: [7, 9, 8, 6, 5, 6, 7], Bergen: [10, 11, 12, 9, 8, 7, 6] };
const addD = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
W._setWeather46(async (name) => {
  const hi = WX[name];
  if (!hi) throw Object.assign(new Error(`Fant ikke stedet «${name}»`), { status: 404 });
  return { place: { name, label: name, tz: 'Europe/Oslo' }, now: { temp: hi[0], cond: 'Skyet', wind: 3 }, source: 'test', days: hi.map((h, i) => ({ date: addD('2026-10-24', i), hi: h, lo: h - 4, cond: 'Skyet', precipProb: 10 })) };
});
const plannerCalls = (text) => seen.filter((x) => x.text === text).length;
const recipeRows = () => db.prepare('SELECT * FROM recipes WHERE user_id=? ORDER BY created_at').all(ME);
const resetRecipes = () => { db.prepare('DELETE FROM recipes').run(); db.prepare('DELETE FROM recipe_runs').run(); db.prepare('DELETE FROM recipe_negatives').run(); };

// Seed: Nina = frisør, en frisørtime og en middag med Nina, Ola-avtale.
{
  const m = await A('/api/glimt/memory', 'POST', { match: 'Nina', type: 'frisør' });
  assert.ok(m.status === 201 || m.status === 200, m.text);
  for (const ev of [{ title: 'Frisør', date: '2026-11-03', start: '14:00', end: '15:00' }, { title: 'Middag med Nina', date: '2026-11-06', start: '18:00', end: '20:00' }, { title: 'Kaffe med Ola', date: '2026-10-28', start: '09:00', end: '10:00' }]) {
    const r = await A('/api/kalender/events', 'POST', { ...ev, allDay: false, calendar: 'privat' });
    assert.equal(r.status, 201, r.text);
  }
}

/* ---------------- 1. Malisering ---------------- */

test('malisering: person (minnet, med aliaser), sted og tidsrom (datoparseren) → mal og plan med variabler, fylles deterministisk', () => {
  const facts = [{ kind: 'alias', subject: 'Nina', object: 'frisør', aliases: ['frisør', 'frisørtime', 'klipp'] }];
  const s = T.slotsOf61('Når er neste gang jeg skal til Nina?', { facts, today: '2026-10-24' });
  assert.equal(s.person.value, 'Nina');
  const tp = T.templatePlan61([{ tool: 'calendar.search', args: { terms: ['Nina', 'frisør'], direction: 'next', limit: 1 } }], s);
  assert.deepEqual(tp.calls[0].args, { terms: '{person.aliases}', direction: 'next', limit: 1 }, 'som i oppdraget: {"terms":"{person.aliases}"}');
  assert.equal(T.templateOf61('Når er neste gang jeg skal til Nina?', s, tp.vars), 'når er neste gang jeg skal til {person}');
  const w = T.slotsOf61('Hvordan er været i Oslo i morgen?', { today: '2026-10-24' });
  assert.deepEqual([w.place.value, w.when.value, w.when.source], ['Oslo', 'i morgen', 'datoparser']);
  const wp = T.templatePlan61([{ tool: 'weather.get', args: { place: 'Oslo', when: 'i morgen' } }], w);
  assert.deepEqual(wp.calls[0].args, { place: '{place}', when: '{when}' });
  const fill = T.fillPlan61(wp, T.slotsOf61('Hvordan er været i Bergen i dag?', { today: '2026-10-24' }));
  assert.deepEqual([fill.calls[0].args, fill.missing], [{ place: 'Bergen', when: 'i dag' }, []]);
  assert.deepEqual(T.fillPlan61(tp, {}).missing, ['person.aliases'], 'mangler personen → ikke deterministisk');
  assert.equal(T.sim61('hvordan er været i {place} {when}', 'hvordan er været i {place} {when}'), 1);
  assert.ok(T.sim61('hvordan er været i {place} {when}', 'hva skjer {when}') < 0.5);
  assert.match(T.readable61(tp.calls), /Søk i kalenderen etter \{person\} \(med aliaser\), neste avtale/);
  assert.equal(T.writes61([{ tool: 'calendar.create', args: {} }]), true);
  assert.equal(T.writes61([{ tool: 'weather.get', args: {} }]), false);
});

test('rettelser, angring og omformulering gjenkjennes (ikke vanlige oppfølginger)', () => {
  for (const t of ['nei, jeg mente middagen', 'Nei jeg mente den andre', 'jeg mente Bergen', 'nei, det var feil', 'Feil avtale']) assert.equal(L61.correctionKind61(t), 'retting', t);
  for (const t of ['angre', 'angre det', 'gjør om det']) assert.equal(L61.correctionKind61(t), 'angring', t);
  for (const t of ['og i Bergen?', 'flytt den til 11', 'Nei takk', 'neste uke da?', 'Når er neste gang jeg skal til Nina?']) assert.equal(L61.correctionKind61(t), null, t);
  assert.equal(L61.rephrased61('Når skal jeg til Nina på fredag', 'Når skal jeg til Nina fredag da', { person: { value: 'Nina' }, when: { value: 'fredag' } }, { person: { value: 'Nina' }, when: { value: 'fredag' } }, 20_000), true);
  assert.equal(L61.rephrased61('Hvordan er været i Oslo i morgen', 'Hvordan er været i Bergen i morgen', { place: { value: 'Oslo' } }, { place: { value: 'Bergen' } }, 20_000), false, 'nytt sted = nytt spørsmål');
  assert.equal(L61.rephrased61('Hva skjer i morgen', 'Hva skjer i morgen', {}, {}, 1000), false, 'samme spørsmål igjen er ikke en omformulering');
});

/* ---------------- 2. Innstillinger ---------------- */

test('innstillinger: av i testene som standard, GET/PUT med scope, server krever admin, ugyldig → 400', async () => {
  const g = await A('/api/glimt/recipes/settings');
  assert.equal(g.status, 200);
  assert.deepEqual(Object.keys(g.body.settings), ['save', 'fewshot', 'fast', 'learn']);
  assert.equal(g.body.labels.fast, 'Hurtigvei');
  assert.equal(g.body.thresholds.fastSimilarity, 0.92);
  assert.equal(g.body.thresholds.fastMinSuccess, 5);
  const p = await A('/api/glimt/recipes/settings', 'PUT', { scope: 'user', fast: false });
  assert.equal(p.status, 200);
  assert.equal(p.body.user.fast, false);
  assert.equal((await A('/api/glimt/recipes/settings', 'PUT', { scope: 'user', fast: 'ja' })).status, 400);
  assert.equal((await A('/api/glimt/recipes/settings', 'PUT', { scope: 'user', fast: null })).body.user.fast, null);
  const sv = await A('/api/glimt/recipes/settings', 'PUT', { scope: 'server', save: true, fewshot: true, fast: true, learn: true });
  assert.ok(sv.status === 200 || sv.status === 403);
  if (sv.status === 200) assert.deepEqual(sv.body.server, ON);
  kv.set(OWNER, 'recipes61', {}); // tilbake til standarden (av i testene)
  assert.deepEqual((await A('/api/glimt/recipes/settings')).body.settings, { save: false, fewshot: false, fast: false, learn: false });
});

/* ---------------- 3. Læring av vellykkede kjøringer, few-shot og hurtigvei ---------------- */

test('samme Nina-spørsmål gjentatt: ny kandidat → eksempel 3. gang → aktiv → hurtigvei når ≥ 5 vellykkede (planleggeren hoppes over, sporet viser det)', async () => {
  resetRecipes();
  S61._setRecipes61(ON);
  try {
    const Q = 'Når er neste gang jeg skal til Nina?';
    const a1 = await agent(Q);
    assert.equal(a1.status, 200, a1.text);
    assert.match(a1.body.reply, /3\. nov/);
    assert.equal(a1.body.recipe.use, 'new');
    assert.equal(a1.body.recipe.status, 'candidate');
    assert.equal(a1.body.recipe.feedback, true);
    const r = recipeRows();
    assert.equal(r.length, 1);
    assert.equal(r[0].query_template, 'når er neste gang jeg skal til {person}');
    assert.deepEqual(JSON.parse(r[0].plan).calls[0].args.terms, '{person.aliases}');
    assert.equal(r[0].intent, 'calendar_query');
    // 2. gang: kjøring 1 er fortsatt i vinduet (1 melding etter) – ingen vellykkede ennå, ikke eksempel.
    const a2 = await agent(Q);
    assert.equal(a2.body.recipe.use, 'match');
    assert.doesNotMatch(seen.at(-1).system, /# Learned examples/);
    // 3. gang: kjøring 1 har 2 meldinger etter → vellykket → brukt som eksempel (etter det faste prefikset).
    const a3 = await agent(Q);
    assert.equal(a3.body.recipe.use, 'fewshot');
    const sys = seen.at(-1).system;
    assert.ok(sys.startsWith(P47.plannerSystem47()), 'samme faste prefiks (KV-cache)');
    const dyn = sys.slice(P47.plannerSystem47().length);
    assert.match(dyn, /^\n\n# Learned examples\nLearned examples from this user/);
    assert.match(dyn, /User: Når er neste gang jeg skal til Nina\?\n\{"intent":"calendar_query","calls":\[\{"tool":"calendar.search","args":\{"terms":\["Nina","frisør"/);
    assert.ok(dyn.indexOf('# Learned examples') < dyn.indexOf('# Context'), 'oppskriftene før konteksten');
    const tr3 = (await A(`/api/glimt/agent/trace?id=${a3.body.traceId}`)).body.trace;
    assert.equal(tr3.recipe.use, 'fewshot');
    assert.equal(tr3.recipe.fewshot[0].id, a1.body.recipe.id);
    // 4. gang: kjøring 2 vellykket → 2 vellykkede → aktiv.
    const a4 = await agent(Q);
    assert.equal(recipeRows()[0].status, 'active', JSON.stringify(recipeRows()[0]));
    assert.equal(a4.body.recipe.status, 'active');
    const before = plannerCalls(Q);
    await agent(Q); await agent(Q); // kjøring 3 og 4 vellykket → 4 vellykkede
    assert.equal(recipeRows()[0].success_count, 4);
    const a7 = await agent(Q); // nå 5 vellykkede → hurtigvei
    assert.equal(recipeRows()[0].success_count, 5);
    assert.equal(a7.body.recipe.use, 'fast', JSON.stringify(a7.body.recipe));
    assert.equal(plannerCalls(Q), before + 2, 'planleggeren ble ikke kalt 7. gang');
    assert.match(a7.body.reply, /3\. nov/, 'svaret formuleres fortsatt');
    assert.equal(a7.body.engine, 'oppskrift');
    const tr7 = (await A(`/api/glimt/agent/trace?id=${a7.body.traceId}`)).body.trace;
    assert.equal(tr7.plan.engine, 'oppskrift');
    assert.equal(tr7.plan.fast, true);
    assert.equal(tr7.recipe.fast.used, true);
    assert.equal(tr7.models.filter((m) => m.step === 'planner').length, 0);
    // Statistikk og API.
    const st = (await A('/api/glimt/recipes/stats')).body;
    assert.equal(st.recipes.active, 1);
    assert.ok(st.runs.fast >= 1 && st.runs.success >= 5, JSON.stringify(st));
    const list = (await A('/api/glimt/recipes')).body;
    assert.equal(list.items.length, 1);
    const it = list.items[0];
    assert.equal(it.status, 'active');
    assert.equal(it.useCount, 7);
    assert.equal(it.fast.eligible, true);
    assert.deepEqual(it.variables, ['person', 'person.aliases']);
    assert.equal(it.writes, false);
    assert.equal(it.slots.person.value, 'Nina');
    const d = (await A(`/api/glimt/recipes/${it.id}`)).body;
    assert.equal(d.runs.length, 7);
    assert.ok(d.runs.some((x) => x.use === 'fast'));
    // Hurtigvei av → planleggeren igjen.
    S61._setRecipes61({ ...ON, fast: false });
    const a8 = await agent(Q);
    assert.equal(plannerCalls(Q), before + 3);
    assert.equal(a8.body.recipe.use, 'fewshot');
  } finally { S61._setRecipes61(null); }
});

test('hurtigveien gjelder samme mal med nye verdier (vær: {place} {when}), men ikke når en variabel ikke kan fylles', async () => {
  resetRecipes();
  S61._setRecipes61(ON);
  try {
    for (let i = 0; i < 7; i++) await agent('Hvordan er været i Oslo i morgen?');
    const row = recipeRows()[0];
    assert.equal(row.query_template, 'hvordan er været i {place} {when}');
    assert.equal(row.status, 'active');
    const n0 = seen.length;
    const b = await agent('Hvordan er været i Bergen i morgen?');
    assert.equal(b.body.recipe.use, 'fast', JSON.stringify(b.body.recipe));
    assert.equal(seen.length, n0, 'ingen planlegger');
    assert.deepEqual(b.body.actions.map((x) => [x.tool, x.args.place, x.args.when.from]), [['weather.get', 'Bergen', '2026-10-25']]);
  } finally { S61._setRecipes61(null); }
});

test('endrende handlinger går aldri hurtigveien uten at det er slått på for oppskriften', async () => {
  resetRecipes();
  S61._setRecipes61(ON);
  try {
    for (const d of ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']) await agent(`Legg inn trening på ${d} kl 18`);
    const row = recipeRows()[0];
    assert.equal(row.query_template, 'legg inn trening på {when} kl 18');
    assert.ok(row.success_count >= 5 && row.status === 'active', JSON.stringify(row));
    const it = (await A(`/api/glimt/recipes/${row.id}`)).body.item;
    assert.equal(it.writes, true);
    assert.equal(it.fast.eligible, false);
    assert.ok(it.fast.reasons.some((x) => /Endrer data/.test(x)), it.fast.reasons.join(' | '));
    const n0 = seen.length;
    const b = await agent('Legg inn trening på mandag kl 18');
    assert.notEqual(b.body.recipe.use, 'fast');
    assert.equal(seen.length, n0 + 1, 'planleggeren ble kalt');
    // Slått på per oppskrift → hurtigvei (og validering/idempotens som før).
    const p = await A(`/api/glimt/recipes/${row.id}`, 'PATCH', { allowFastWrite: true });
    assert.equal(p.status, 200, p.text);
    assert.equal(p.body.item.fast.eligible, true, p.body.item.fast.reasons.join(' | '));
    const c = await agent('Legg inn trening på fredag kl 18');
    assert.equal(c.body.recipe.use, 'fast');
    assert.equal(seen.length, n0 + 1);
  } finally { S61._setRecipes61(null); }
});

/* ---------------- 4. Rettelser ---------------- */

test('«nei, jeg mente middagen» → forrige kjøring feiler, negativt eksempel + ny kandidat + testtilfelle i eval/learned/, og neste gang brukes de', async () => {
  resetRecipes();
  S61._setRecipes61(ON);
  PLANS = [
    [/^Når skal jeg møte Nina\?$/, { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['Nina', 'frisør'], direction: 'next', limit: 1 } }] }],
    [/^nei, jeg mente middagen$/, (m, { prompt }) => {
      assert.match(prompt, /correcting Glimt's previous answer.*«Når skal jeg møte Nina\?»/s, 'rettelsen er et hint til planleggeren');
      return { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['middag'], direction: 'next', limit: 1 } }] };
    }],
  ];
  try {
    const a = await agent('Når skal jeg møte Nina?');
    assert.match(a.body.reply, /Frisør/);
    const first = a.body.recipe.id;
    const b = await agent('nei, jeg mente middagen');
    assert.equal(b.status, 200, b.text);
    assert.match(b.body.reply, /Middag med Nina/);
    assert.equal(b.body.recipe.correction, true);
    assert.equal(b.body.recipe.use, 'new');
    assert.notEqual(b.body.recipe.id, first);
    const run1 = db.prepare('SELECT * FROM recipe_runs WHERE trace_id=?').get(a.body.traceId);
    assert.equal(run1.state, 'fail');
    assert.equal(run1.reason, 'Rettet av deg');
    const nr = ST.rowOf61(ME, b.body.recipe.id);
    assert.equal(nr.source, 'correction');
    assert.equal(nr.example_query, 'Når skal jeg møte Nina?');
    assert.equal(nr.query_template, 'når skal jeg møte nina', 'den riktige planen bruker ikke personen → ingen variabel');
    const negs = db.prepare('SELECT * FROM recipe_negatives WHERE user_id=?').all(ME);
    assert.equal(negs.length, 1);
    assert.deepEqual(JSON.parse(negs[0].wrong_plan).calls[0].args.terms, ['Nina', 'frisør']);
    // Testtilfellet (JSON, ikke kode) i eval/learned/ – i testene under DATA_DIR, aldri i repoet.
    const dir = L61.learnedDir61();
    assert.ok(dir.startsWith(process.env.DATA_DIR), dir);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 1);
    const doc = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
    assert.equal(doc.kind, 'glimt-learned/1');
    assert.equal(doc.query, 'Når skal jeg møte Nina?');
    assert.equal(doc.correction, 'nei, jeg mente middagen');
    assert.deepEqual(doc.expect.tools, ['calendar.search']);
    assert.deepEqual(doc.expect.notCalls[0].args.terms, ['Nina', 'frisør']);
    assert.deepEqual(doc.memory, [{ match: 'Nina', type: 'frisør' }]);
    assert.equal(doc.recipe.source, 'correction');
    const tr = (await A(`/api/glimt/agent/trace?id=${b.body.traceId}`)).body.trace;
    assert.equal(tr.recipe.correction.kind, 'retting');
    assert.equal(tr.recipe.learned.recipeId, b.body.recipe.id);
    // Samme spørsmål igjen: den rettede oppskriften som eksempel + det negative eksemplet (ligner sterkt).
    PLANS = [[/^Når skal jeg møte Nina\?$/, { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['middag'], direction: 'next', limit: 1 } }] }]];
    const c = await agent('Når skal jeg møte Nina?');
    const dyn = seen.at(-1).system.slice(P47.plannerSystem47().length);
    assert.match(dyn, /User: Når skal jeg møte Nina\?\n\{"intent":"calendar_query","calls":\[\{"tool":"calendar.search","args":\{"terms":\["middag"\]/);
    assert.match(dyn, /WRONG \(the user corrected this, never plan it like this\): \[\{"tool":"calendar.search","args":\{"terms":\["Nina","frisør"\]/);
    // Planleggeren fulgte eksemplet (verktøyet selv godtar bare søkeord som står i meldingen – prompt 47-vernet, uendret).
    assert.deepEqual((await A(`/api/glimt/agent/trace?id=${c.body.traceId}`)).body.trace.plan.calls[0].args.terms, ['middag']);
    const st = (await A('/api/glimt/recipes/stats')).body;
    assert.equal(st.corrections, 1);
    assert.equal(st.negatives, 1);
    assert.equal(st.learnedCases, 1);
    const det = (await A(`/api/glimt/recipes/${b.body.recipe.id}`)).body;
    assert.equal(det.item.source, 'correction');
    // Det negative eksemplet er knyttet til den rettede oppskriften (hvis den første var en oppskrift) – her den første.
    const det1 = (await A(`/api/glimt/recipes/${first}`)).body;
    assert.equal(det1.negatives.length, 1);
    assert.match(det1.negatives[0].readableWrong, /Nina, frisør/);
    assert.equal(det1.item.failCount, 1);
  } finally { PLANS = []; S61._setRecipes61(null); }
});

test('«lær av rettelser» av: rettelsen gjør bare forrige kjøring til feil, ingenting læres', async () => {
  resetRecipes();
  S61._setRecipes61({ ...ON, learn: false });
  PLANS = [[/^nei, jeg mente Ola$/, { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['Ola'], direction: 'next', limit: 1 } }] }]];
  try {
    const a = await agent('Når er neste gang jeg skal til Nina?');
    const b = await agent('nei, jeg mente Ola');
    assert.equal(db.prepare('SELECT state FROM recipe_runs WHERE trace_id=?').pluck().get(a.body.traceId), 'fail');
    assert.equal(db.prepare('SELECT COUNT(*) FROM recipe_negatives').pluck().get(), 0);
    assert.notEqual(b.body.recipe?.correction, true);
  } finally { PLANS = []; S61._setRecipes61(null); }
});

/* ---------------- 5. Tommel opp/ned, aktiv → avslått ---------------- */

test('tommel opp gjør kandidaten aktiv med en gang; aktiv oppskrift som feiler 2 ganger på rad blir avslått og logget', async () => {
  resetRecipes();
  S61._setRecipes61(ON);
  try {
    const a = await agent('Når skal jeg møte Ola?');
    assert.equal(a.body.recipe.status, 'candidate');
    const up = await A('/api/glimt/recipes/feedback', 'POST', { traceId: a.body.traceId, vote: 'up' });
    assert.equal(up.status, 200, up.text);
    assert.equal(up.body.recipe.status, 'active');
    assert.equal(up.body.run.state, 'success');
    const b = await agent('Når skal jeg møte Ola?');
    const c = await agent('Når skal jeg møte Ola?');
    for (const x of [b, c]) assert.equal((await A('/api/glimt/recipes/feedback', 'POST', { traceId: x.body.traceId, vote: 'down' })).body.run.state, 'fail');
    const row = ST.rowOf61(ME, a.body.recipe.id);
    assert.equal(row.status, 'disabled');
    assert.match(row.disabled_reason, /Feilet 2 ganger på rad/);
    assert.ok(ST.logOf61(ME).some((l) => l.kind === 'slått av' && l.recipeId === row.id));
    // Svar uten oppskrift: stemmen lagres, recipe:null. Ukjent trace → 404. Ugyldig → 400.
    const chat = await agent('Hva er meningen med livet?');
    const v = await A('/api/glimt/recipes/feedback', 'POST', { traceId: chat.body.traceId, vote: 'up' });
    assert.equal(v.status, 200, v.text);
    assert.equal(v.body.recipe, null);
    assert.equal(v.body.run.state, 'none');
    assert.equal((await A('/api/glimt/recipes/feedback', 'POST', { traceId: 't000000000000000000', vote: 'up' })).status, 404);
    assert.equal((await A('/api/glimt/recipes/feedback', 'POST', { traceId: a.body.traceId, vote: 'kanskje' })).status, 400);
  } finally { S61._setRecipes61(null); }
});

/* ---------------- 6. Innsyn: rediger, test, slå av, slett ---------------- */

test('API: liste med filter, rediger mal/plan (validert), test (endrer aldri data), slå av/på, slett', async () => {
  resetRecipes();
  S61._setRecipes61(ON);
  try {
    await agent('Når er neste gang jeg skal til Nina?');
    await agent('Legg inn trening på mandag kl 18');
    const l = (await A('/api/glimt/recipes')).body;
    assert.equal(l.counts.total, 2);
    assert.equal(l.counts.candidate, 2);
    assert.equal((await A('/api/glimt/recipes?status=active')).body.items.length, 0);
    assert.equal((await A('/api/glimt/recipes?status=tull')).status, 400);
    assert.equal((await A('/api/glimt/recipes?q=trening')).body.items.length, 1);
    const nina = l.items.find((x) => x.intent === 'calendar_query');
    const tren = l.items.find((x) => x.intent === 'calendar_create');
    // Test: lesende verktøy kjøres, med nye verdier.
    const t1 = await A(`/api/glimt/recipes/${nina.id}/test`, 'POST', {});
    assert.equal(t1.status, 200, t1.text);
    assert.equal(t1.body.ok, true);
    assert.deepEqual(t1.body.slots, { person: 'Nina' });
    assert.equal(t1.body.steps[0].ran, true);
    assert.match(t1.body.steps[0].summary, /\d treff: Frisør tir 3\. nov/);
    const t2 = await A(`/api/glimt/recipes/${nina.id}/test`, 'POST', { text: 'Når er neste gang jeg skal til Ukjentperson?' });
    assert.equal(t2.body.ok, false);
    assert.deepEqual(t2.body.missing, ['person.aliases']);
    // Test av en endrende oppskrift kjører ikke verktøyet.
    const n0 = (await A('/api/kalender/events?from=2026-10-01&to=2026-12-31')).text.length;
    const t3 = await A(`/api/glimt/recipes/${tren.id}/test`, 'POST', { text: 'Legg inn trening på fredag kl 18' });
    assert.equal(t3.body.steps[0].ran, false);
    assert.equal(t3.body.ok, true, JSON.stringify(t3.body));
    assert.equal((await A('/api/kalender/events?from=2026-10-01&to=2026-12-31')).text.length, n0, 'ingenting lagt inn');
    // Rediger.
    assert.equal((await A(`/api/glimt/recipes/${nina.id}`, 'PATCH', { queryTemplate: 'når skal jeg til {navn}' })).status, 400);
    assert.equal((await A(`/api/glimt/recipes/${nina.id}`, 'PATCH', { plan: { calls: [{ tool: 'finnes.ikke', args: {} }] } })).status, 400);
    assert.equal((await A(`/api/glimt/recipes/${nina.id}`, 'PATCH', { plan: { calls: [{ tool: 'weather.get', args: {} }] } })).status, 400, 'hører ikke til intenten');
    const e = await A(`/api/glimt/recipes/${nina.id}`, 'PATCH', { queryTemplate: 'Når skal jeg til {person}?', plan: { calls: [{ tool: 'calendar.search', args: { terms: '{person.aliases}', direction: 'next', limit: 3 } }] } });
    assert.equal(e.status, 200, e.text);
    assert.equal(e.body.item.queryTemplate, 'når skal jeg til {person}');
    assert.equal(e.body.item.source, 'edited');
    assert.equal(e.body.item.plan.calls[0].args.limit, 3);
    const off = await A(`/api/glimt/recipes/${nina.id}`, 'PATCH', { status: 'disabled' });
    assert.equal(off.body.item.status, 'disabled');
    assert.equal(off.body.item.disabledReason, 'Slått av av deg');
    assert.equal((await A(`/api/glimt/recipes/${nina.id}`, 'PATCH', { status: 'active' })).body.item.status, 'active');
    assert.equal((await A(`/api/glimt/recipes/${nina.id}`, 'PATCH', { status: 'tull' })).status, 400);
    // Slett.
    assert.equal((await A(`/api/glimt/recipes/${nina.id}`, 'DELETE')).body.removed, true);
    assert.equal((await A(`/api/glimt/recipes/${nina.id}`)).status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) FROM recipe_runs WHERE recipe_id=?').pluck().get(nina.id), 0);
    assert.equal((await A('/api/glimt/recipes/rffffffffffffff', 'DELETE')).status, 404);
  } finally { S61._setRecipes61(null); }
});

test('endrende plan med bekreftelse: kjøringen venter på «Ja» (confirm) og starter vinduet etter POST /confirm', async () => {
  resetRecipes();
  S61._setRecipes61(ON);
  PLANS = [[/^Slett kaffe med Ola$/, { intent: 'calendar_change', calls: [{ tool: 'calendar.delete', args: { target: 'Kaffe med Ola' } }] }]];
  try {
    const a = await agent('Slett kaffe med Ola');
    assert.ok(a.body.confirm?.token, a.text);
    assert.equal(a.body.recipe.use, 'new');
    const run = db.prepare('SELECT * FROM recipe_runs WHERE trace_id=?').get(a.body.traceId);
    assert.equal(run.state, 'confirm');
    const c = await A('/api/glimt/agent/confirm', 'POST', { token: a.body.confirm.token });
    assert.equal(c.status, 200, c.text);
    assert.equal(c.body.recipe.id, a.body.recipe.id);
    assert.equal(db.prepare('SELECT state FROM recipe_runs WHERE id=?').pluck().get(run.id), 'pending');
    assert.equal((await A(`/api/glimt/recipes/${a.body.recipe.id}`)).body.item.writes, true);
  } finally { PLANS = []; S61._setRecipes61(null); }
});

test('alt av (standard i testene): ingen oppskrifter, ingen recipe-felt, planleggerens prompt uendret', async () => {
  resetRecipes();
  const a = await agent('Når er neste gang jeg skal til Nina?');
  assert.equal(a.status, 200);
  assert.equal(a.body.recipe, undefined);
  assert.equal(recipeRows().length, 0);
  assert.doesNotMatch(seen.at(-1).system, /Learned examples/);
  assert.equal((await A('/api/glimt/recipes')).body.enabled, false);
});

test('migreringen er additiv: tabellene har feltene fra oppdraget', () => {
  const cols = db.prepare('PRAGMA table_info(recipes)').all().map((c) => c.name);
  for (const c of ['id', 'created_at', 'last_used_at', 'use_count', 'success_count', 'fail_count', 'example_query', 'query_template', 'intent', 'plan', 'slots', 'embedding', 'status']) assert.ok(cols.includes(c), c);
  assert.ok(existsSync(process.env.DATA_DIR));
});
