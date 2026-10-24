// Prompt 47 (GLIMT47): Glimt-ombyggingen – hurtigvei (bare entydige kommandoer), planlegger med JSON-skjema og verktøy per intent,
// minne med aliaser begge veier, kalendersøk på hele ord, kalenderopprettelse med antatt varighet, svarsteg med grounding,
// abonnementer på månedspris, fullstendighetssjekk for vitnemål, media-tolkning, AI-kontroll-advarsel og trace.
// Falsk planlegger/svarsteg (testkrokene), MOCK_DATA. Fast «nå»: lørdag 24. oktober 2026 kl. 10:00.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p47g-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-47g';
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
const { db } = await import('../server/db.js');
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const P47 = await import('../server/glimt45/plan47.js');
const M47 = await import('../server/glimt45/memory47.js');
const W47 = await import('../server/glimt45/words47.js');
const D47 = await import('../server/glimt45/document47.js');
const A47 = await import('../server/glimt45/answer47.js');
const MED = await import('../server/glimt45/media47.js');
const S46 = await import('../server/glimt45/subs46.js');
const ai = await import('../server/ai-run.js');
const web = await import('../server/web-search.js');

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
const RID = () => `t47-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const agent = (text, extra = {}) => A('/api/glimt/agent', 'POST', { text, module: 'home', requestId: RID(), ...extra });

// Falsk planlegger: en «flink» modell for meldingene under. Logger hver forespørsel (system + prompt) for sjekk.
const seen = [];
const PLANS = [
  [/^Når er neste gang jeg skal til Nina\?$/, { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['Nina', 'frisør'], direction: 'next', limit: 1 } }] }],
  [/^Når er neste forelesning i Oslo\?$/, { intent: 'calendar_query', calls: [{ tool: 'calendar.search', args: { terms: ['Oslo'], direction: 'next' } }] }],
  [/^Skal se Dune på Colosseum kino 17\.12 17\.30$/, { intent: 'calendar_create', calls: [{ tool: 'calendar.create', args: { title: 'Skal se Dune på Colosseum kino 17.12 17.30', location: 'Colosseum kino', date: '17.12', time: '17.30' } }] }],
  [/^Hvem er statsminister i Storbritannia\?$/, { intent: 'web_search', calls: [{ tool: 'finance.summary', args: {} }, { tool: 'web.search', args: { query: 'statsminister Storbritannia' } }] }],
  [/^Hva er hovedstaden i Frankrike\?$/, { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }],
  [/^Flytt den$/, { intent: 'calendar_change', calls: [], needs_clarification: true, clarification_question: 'Hvilken avtale vil du flytte?' }],
];
P._setGlimtModel45(async ({ system, prompt, step }) => {
  const text = /Melding: (.*)/.exec(prompt)[1];
  seen.push({ text, system, prompt, step });
  const hit = PLANS.find(([re]) => re.test(text));
  return { data: hit ? hit[1] : { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }, model: 'test-planner' };
});
const answers = [];
E._setAnswerModel47(async ({ system, prompt }) => { answers.push({ system, prompt }); if (/Frankrike/.test(prompt)) return { text: 'Hovedstaden i Frankrike er **Paris**.', model: 'test-answer' }; if (/Whitcombe/.test(system)) return { text: 'Statsministeren er **Eleanor Whitcombe** (NRK).', model: 'test-answer' }; if (/Frankrike/.test(prompt)) return { text: 'Hovedstaden i Frankrike er **Paris**.', model: 'test-answer' }; return { text: 'Statsministeren er **Boris Johnson**.', model: 'test-answer' }; });

// Testdata: Nina = frisør (alias), hendelser.
assert.equal((await A('/api/glimt/memory', 'POST', { match: 'Nina', type: 'frisør' })).status, 201);
for (const e of [{ title: 'Frisør', date: '2026-11-03', start: '14:00', end: '15:00' }, { title: 'TRE1400 Forelesning', date: '2026-10-27', start: '14:30', end: '16:00', location: 'OsloMet P35, Pilestredet 35, Oslo' }]) assert.equal((await A('/api/kalender/events', 'POST', { ...e, allDay: false, calendar: 'privat' })).status, 201);

test('hurtigvei bare for entydige kommandoer; alt annet går til planleggeren', () => {
  const fp = (t, o = {}) => E.fastPath47(t, o);
  assert.equal(fp('Nina er frisøren min', { legacyIntent: 'memory.add' })?.fast, 'minne');
  assert.equal(fp('åpne kalender')?.fast, 'navigasjon');
  assert.equal(fp('Gå til budsjett.')?.fast, 'navigasjon');
  assert.equal(fp('Last ned siste episode fra 9-1-1')?.calls[0].tool, 'media.episode');
  assert.equal(fp('slå sammen like', { module: 'tasks' })?.fast, 'gjøremål');
  for (const t of ['Når er neste gang jeg skal til Nina?', 'åpne kalender og legg inn tannlege fredag', 'Hvordan er været i Oslo neste time?', 'Er Nina frisøren min?', 'når kommer siste episode av 9-1-1', 'slå sammen like']) assert.equal(fp(t, { legacyIntent: /^Er Nina/.test(t) ? null : null }), null, t);
});

test('planlegger: engelsk systemprompt med few-shots, dato/klokke, minnefakta og hint; verktøy filtreres per intent', async () => {
  seen.length = 0;
  const r = await agent('Når er neste gang jeg skal til Nina?');
  assert.equal(r.status, 200, r.text);
  const s = seen[0];
  assert.match(s.system, /^You are the planner for Glimt/);
  assert.match(s.system, /Skal se Dune på Colosseum kino 17\.12 17\.30/, 'few-shot fra oppdraget');
  assert.match(s.system, /Nå: lørdag 24\. oktober 2026 kl\. 10:00 \(Europe\/Oslo\)/);
  assert.match(s.system, /Nina = frisør \(also: frisør, frisørtime/, 'minnefaktaet med aliaser');
  assert.equal(s.step, 'planner');
  // Intent-filter: finance.summary hører ikke til web_search og utføres ikke.
  const p = P47.cleanPlan47({ data: { intent: 'web_search', calls: [{ tool: 'finance.summary', args: {} }, { tool: 'web.search', args: { query: 'x' } }] } });
  assert.deepEqual([p.calls.map((c) => c.tool), p.dropped], [['web.search'], ['finance.summary']]);
  assert.match(P47.cleanPlan47({ data: { intent: 'web_search', calls: [{ tool: 'calendar.create', args: {} }] } }).error, /do not belong/);
  assert.match(P47.cleanPlan47({ text: 'ikke json' }).error, /JSON/);
  assert.equal(P47.cleanPlan47({ data: { intent: 'calendar_change', calls: [], needs_clarification: true, clarification_question: 'Hvilken?' } }).ask, 'Hvilken?');
  const ask = await agent('Flytt den');
  assert.equal(ask.body.ask.question, 'Hvilken avtale vil du flytte?');
});

test('Nina: minnet utvider søket begge veier, hele ord, tydelig «fant ingen»', async () => {
  const r = await agent('Når er neste gang jeg skal til Nina?');
  assert.equal(r.body.actions[0].tool, 'calendar.search');
  assert.equal(r.body.actions[0].status, 'done');
  assert.match(r.body.reply, /^Neste avtale hos Nina \(frisør\) er \*\*Frisør tirsdag 3\. november kl\. 14:00\*\*/);
  assert.ok(r.body.actions[0].args.expanded.includes('Nina') && r.body.actions[0].args.expanded.includes('frisør'));
  assert.ok(r.body.traceId, 'traceId i svaret');
  // Andre veien: typeordet finner navnet.
  const st = await (await import('../server/glimt45/tools47.js')).searchTerms47(ME, 'neste frisørtime', ['frisør']);
  assert.ok(st.expanded.includes('Nina'));
  // «Oslo» treffer ikke «OsloMet» (ordgrenser), og tom retur sier hva det ble søkt etter.
  const o = await agent('Når er neste forelesning i Oslo?');
  assert.equal(o.body.actions[0].result.count, 1, 'treff på «Oslo» i adressen «…, Oslo», ikke på OsloMet alene');
  assert.equal(W47.hasWord47('OsloMet P35', 'Oslo'), false);
  assert.equal(W47.hasWord47('Frisørtime hos Nina', 'frisør'), true);
  assert.equal(W47.hasWord47('Ålesund', 'ålesund'), true);
  assert.equal(W47.hasWord47('Ninaveien 3', 'Nina'), false);
});

test('minne: henting med hvorfor, alias begge veier, læring lagrer ikke gjetninger', async () => {
  const f1 = await M47.recallFacts47(ME, 'Når skal jeg til Nina?');
  assert.equal(f1[0].subject, 'Nina'); assert.match(f1[0].why, /navnet/);
  const f2 = await M47.recallFacts47(ME, 'neste frisørtime');
  assert.equal(f2[0].subject, 'Nina'); assert.match(f2[0].why, /alias/);
  const f3 = await M47.recallFacts47(ME, 'Neste time hos Ninna?');
  assert.match(f3[0]?.why ?? '', /ligner/, 'fuzzy navn');
  assert.deepEqual(await M47.recallFacts47(ME, 'Hva er hovedstaden i Frankrike?'), []);
  assert.ok(M47.expandTerms47(f1).includes('frisør'));
  assert.ok(M47.saveFact47(ME, { subject: 'Ola', object: 'tannlegen', text: 'Kari er tannlegen min' }).error, 'ordene må stå i meldingen');
  const ok = M47.saveFact47(ME, { subject: 'Ola', object: 'tannlege', text: 'Ola er tannlegen min' });
  assert.equal(ok.kind, 'alias');
  M47._setEmbed47(async (texts) => texts.map(() => Array.from({ length: 64 }, (_, i) => (i === 0 ? 1 : 0))));
  const fe = await M47.recallFacts47(ME, 'helt ukjent tekst uten navn');
  assert.ok(fe.length && fe.every((f) => /embedding/.test(f.why)), 'embedding-steget når ingen eksakte treff');
  M47._setEmbed47(null);
});

test('kalender: Dune – tittel ikke hele setningen, sted, 17.12 17:30, kino 3 t antatt i bekreftelsen', async () => {
  const r = await agent('Skal se Dune på Colosseum kino 17.12 17.30');
  const a = r.body.actions[0];
  assert.equal(a.status, 'done', r.text);
  assert.ok(a.args.title.length <= 60 && !/17\.12|skal se/i.test(a.args.title), a.args.title);
  assert.match(a.args.title, /Dune/);
  assert.deepEqual([a.args.date, a.args.start, a.args.end, a.args.durationAssumed], ['2026-12-17', '17:30', '20:30', true]);
  assert.match(a.args.location, /^Colosseum kino/i);
  assert.match(r.body.reply, /Lagt inn: \*\*.*Dune.*, Colosseum kino, torsdag 17\. desember kl\. 17:30\*\*/i);
  assert.match(r.body.reply, /Slutt kl\. 20:30 er antatt \(3 t for kino\)/);
});

test('svarsteg: nettsøk først i prompten, egennavn må stå i treffene; prat uten verktøy', async () => {
  web._setWebFetch(async () => new Response('<html><body><div class="result results_links web-result"><h2 class="result__title"><a class="result__a" href="https://nrk.no/x">Eleanor Whitcombe er ny statsminister</a></h2><a class="result__snippet" href="https://nrk.no/x">Eleanor Whitcombe overtok som statsminister i Storbritannia.</a></div></body></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  try {
    answers.length = 0;
    const r = await agent('Hvem er statsminister i Storbritannia?');
    assert.deepEqual(r.body.actions.map((x) => x.tool), ['web.search'], 'finance.summary filtrert bort (intent web_search)');
    assert.match(r.body.reply, /Eleanor Whitcombe/);
    assert.match(answers[0].system, /^The search results below are newer than your training data/);
    assert.match(answers[0].system, /Answer in Norwegian/);
    assert.equal(A47.groundedIn47('Statsministeren er Boris Johnson.', [{ title: 'Eleanor Whitcombe', snippet: '', source: 'NRK' }]).ok, false);
  } finally { web._setWebFetch(null); }
  const p = await agent('Hva er hovedstaden i Frankrike?');
  assert.match(p.body.reply, /Paris/);
  assert.deepEqual(p.body.actions.map((x) => x.tool), ['chat.answer'], 'ingen datakall eller nettsøk');
  assert.equal(p.body.joke ?? null, null);
});

test('trace: GET /api/glimt/agent/trace?id= gir fakta (med hvorfor), plan, normaliserte verdier, verktøy, modellkall og tid per steg', async () => {
  const r = await agent('Når er neste gang jeg skal til Nina?');
  const t = (await A(`/api/glimt/agent/trace?id=${r.body.traceId}`)).body.trace;
  assert.equal(t.message, 'Når er neste gang jeg skal til Nina?');
  assert.match(t.facts[0].why, /navnet «Nina»/);
  assert.equal(t.plan.calls[0].tool, 'calendar.search');
  assert.ok(t.normalized.some((x) => x.tool === 'calendar.search' && x.args.expanded.includes('frisør')));
  assert.equal(t.tools[0].tool, 'calendar.search');
  assert.ok(t.models.some((m) => m.step === 'planner'));
  assert.ok(t.steps.length >= 2 && t.totalMs >= 0);
  assert.equal((await A('/api/glimt/agent/trace?id=t000000000000000000')).status, 404);
  assert.ok((await A('/api/glimt/agent/trace')).body.items.length >= 1);
  assert.match((await A(`/api/glimt/agent/trace/view?id=${r.body.traceId}`)).text, /<h1>Glimt trace/);
});

test('abonnementer: alt normaliseres til månedspris (årspris / 12, ukepris × 52 / 12)', () => {
  assert.deepEqual(S46.normalizeCost46(89, 'weekly'), { monthly: 385.67, yearly: 4628, uncertain: null });
  assert.deepEqual(S46.normalizeCost46(3588, 'yearly'), { monthly: 299, yearly: 3588, uncertain: null });
  assert.equal(S46.normalizeCost46(149, 'monthly').monthly, 149);
});

test('vitnemål: fullstendighetssjekk i kode og nytt forsøk på manglende rader (ingen oppdiktede fag)', async () => {
  const ocr = 'VITNEMÅL\nFag Standpunkt Eksamen\nNorsk hovedmål, skriftlig 4 5\nEngelsk 5\nMatematikk R1 6\nNaturfag 4\nKjemi 1    3\nSide 1 av 1';
  const rows = D47.subjectRows47(ocr);
  assert.deepEqual(rows.map((r) => r.name), ['Norsk hovedmål, skriftlig', 'Engelsk', 'Matematikk R1', 'Naturfag', 'Kjemi 1']);
  const c = D47.completeness47(ocr, [{ navn: 'Norsk hovedmål, skriftlig' }, { navn: 'Engelsk' }, { navn: 'Matematikk R1' }, { navn: 'Naturfag' }]);
  assert.deepEqual([c.ocrRows, c.found, c.missing.map((r) => r.name)], [5, 4, ['Kjemi 1']]);
  assert.match(D47.completenessText47(c), /^Fant 4 fag, 1 rad i dokumentet ble ikke lest: Kjemi 1\./);
  const add = await D47.retryMissing47(c.missing, async () => ({ fag: [{ navn: 'Kjemi 1', karakter: '3' }, { navn: 'Fysikk 2', karakter: '6' }] }));
  assert.deepEqual(add.map((e) => e.navn), ['Kjemi 1'], 'fag som ikke står i OCR-teksten forkastes');
});

test('media: «siste episode fra 9-1-1» tolkes, titler normaliseres', () => {
  assert.deepEqual(MED.parseEpisodeAsk43('Last ned siste episode fra 9-1-1'), { title: '9-1-1', pick: 'latest', download: true });
  assert.equal(MED.parseEpisodeAsk43('Når kommer neste episode av The Rookie?').pick, 'next');
  assert.equal(MED.normTitle43('9-1-1'), MED.normTitle43('9 1 1'));
  assert.equal(MED.normTitle43('911'), MED.normTitle43('9-1-1'));
  assert.notEqual(MED.normTitle43('9-1-1: Lone Star'), MED.normTitle43('9-1-1'));
});

test('modellstyring: tolkningsruter under 7B gir advarsel; standardforslag er qwen3:8b; ingen 1 t keep_alive for llama3.2:3b', async () => {
  assert.equal(ai.smallModel47('llama3.2:3b'), '3B');
  assert.equal(ai.smallModel47('qwen3:8b'), null);
  assert.equal(ai.smallModel47('x', { models: [{ name: 'x', params: '3.2B' }] }), '3,2B');
  assert.deepEqual(ai.INTERPRET_TASKS47, ['glimt', 'sok', 'kat', 'fsok']);
  const { SUGGESTED_MODELS } = await import('../server/aihw38.js');
  assert.equal(SUGGESTED_MODELS.kat, 'qwen3:8b');
  const { DEFAULT_MODEL_KEEP_ALIVE } = await import('../server/ai-gate.js');
  assert.equal(DEFAULT_MODEL_KEEP_ALIVE['llama3.2:3b'], undefined);
  const { STEP47 } = await import('../server/glimt45/params47.js');
  assert.deepEqual([STEP47.planner.numCtx, STEP47.planner.numPredict, STEP47.planner.temperature, STEP47.planner.think], [8192, 512, 0, false]);
  assert.deepEqual([STEP47.plannerRetry.think, STEP47.document.numCtx, STEP47.document.numPredict, STEP47.answer.numPredict, STEP47.brief.numCtx], [true, 16384, 4096, 600, 16384]);
});

test('promptbudsjett: historikk og fakta trimmes, aldri systemprompten', async () => {
  const { fitParts47 } = await import('../server/glimt45/params47.js');
  const f = fitParts47({ fixed: 'S'.repeat(20000), parts: [{ key: 'history', text: 'H'.repeat(20000), fromStart: true }, { key: 'facts', text: 'F'.repeat(1000), minChars: 200 }], numCtx: 8192, numPredict: 512 });
  assert.ok(f.trimmed.includes('history'));
  assert.ok(f.parts.history.length < 20000 && f.parts.history.startsWith('…'));
  assert.ok(f.fits);
});
