// Prompt 55 (GLIMT55): de gjenstående eval-feilene.
//   1 planleggerens reserve: tidsavbrudd/ugyldig plan → nytt forsøk med thinking → oppfølgingsspørsmål; aldri den gamle veien,
//     aldri lagring ut fra en gjetning; modellen nede → lokal plan som før. Gaten: tidsgrensen gjelder svaret, ikke lastingen.
//   2 vitnemål: «strconv(4)», fagkoder er aldri karakterer, fuzzy fagnavn.
//   3 kvittering uten OCR → visjonsmodellen med samme schema og validering, merket, maks middels sikkerhet.
//   4 llama3.2:3b aldri som standard, reserve, gammel innstilling eller auto – bare når den er valgt eksplisitt.
//   + eval: standardrutingen og miljøstatus «env».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p55-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p55';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.p55:11434';
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MAC_OCR_KEY', 'MAC_OCR_URL', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Falskt nett: Ollama med llama3.2:3b, qwen3:8b og qwen2.5vl:7b installert. Alt annet feiler.
const TAGS = ['llama3.2:3b', 'qwen3:8b', 'qwen2.5vl:7b', 'nomic-embed-text:latest'];
const chatCalls = [];
const realFetch = globalThis.fetch;
const fake = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.host === 'ollama.p55:11434') {
    if (u.pathname === '/api/tags') return Response.json({ models: TAGS.map((name) => ({ name, size: 5e9, details: { parameter_size: /3b/.test(name) ? '3.2B' : '8.2B' } })) });
    if (u.pathname === '/api/ps') return Response.json({ models: [] });
    if (u.pathname === '/api/chat') { let b = {}; try { b = JSON.parse(init.body); } catch { /* */ } chatCalls.push(b.model); return new Response('nei', { status: 500 }); }
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
};
globalThis.fetch = fake;
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const ai = await import('../server/ai-run.js');
const gate = await import('../server/ai-gate.js');
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const P47 = await import('../server/glimt45/plan47.js');
const { STEP47 } = await import('../server/glimt45/params47.js');
const S55 = await import('../server/study55.js');
const S45 = await import('../server/study45.js');
const S46 = await import('../server/study46.js');
const chain = await import('../server/receipts48/chain.js');
const tess = await import('../server/receipts48/engines/tesseract.js');
const fdb = await import('../server/finans/db.js');
const ENV = await import('../eval/lib/env.mjs');
ai._setAiFetch(fake);

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
const RID = () => `p55-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const events = () => kv.get(ME, 'kal_local_events', []) ?? [];

/* ---------------- 1. Planleggerens reserve ---------------- */

const DUNE = 'Skal se Dune på Colosseum kino 17.12 17.30';
const timeoutErr = () => Object.assign(new Error('Glimt fikk ikke svar fra qwen3:8b: svarte ikke innen 45 s'), { code: 'failed', kind: 'idle_timeout', model: 'qwen3:8b' });
// Den gamle veien (assist-svaret med en modell uten verktøy) skal aldri brukes som reserve.
let legacyCalls = 0;
E.registerLegacy45({ answer: async () => { legacyCalls++; return { text: 'gammel vei', intent: 'llm', source: 'llm' }; } });

test('planlegger: feiltypene – tidsavbrudd, nede og ugyldig', () => {
  assert.equal(P47.plannerErrKind55(timeoutErr()), 'timeout');
  assert.equal(P47.plannerErrKind55(Object.assign(new Error('Glimt fikk ikke svar fra noen modell: Ollama kan ikke nås på http://x (TimeoutError)'), { code: 'no_model' })), 'down');
  assert.equal(P47.plannerErrKind55(new Error('Glimt fikk ikke svar fra qwen3:8b: lastet ikke inn på 90 s')), 'timeout');
  assert.equal(P47.plannerErrKind55(new Error('fetch failed')), 'down');
  assert.equal(P47.plannerErrKind55(new Error('tomt svar')), 'invalid');
  // Andre forsøk tenker, med større tokenbudsjett (tankene teller med) og et tak på tiden.
  assert.equal(STEP47.plannerRetry.think, true);
  assert.ok(STEP47.plannerRetry.numPredict >= 2048 && STEP47.plannerRetry.timeoutMs <= 90_000 && STEP47.plannerRetry.timeoutMs > STEP47.planner.timeoutMs);
});

test('planlegger: tidsavbrudd to ganger → nytt forsøk med thinking, så oppfølgingsspørsmål med valg – ingen gammel vei, ingenting lagret, ikke bufret', async () => {
  const steps = [];
  P._setGlimtModel45(async (o) => { steps.push(o.step); throw timeoutErr(); });
  try {
    const before = events().length;
    legacyCalls = 0;
    const r = await A('/api/glimt/agent', 'POST', { text: DUNE, module: 'home' });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(steps, ['planner', 'plannerRetry']);
    assert.equal(r.body.intent, 'ask');
    assert.match(r.body.reply, /brukte for lang tid/);
    assert.equal(r.body.plannerFailed, 'timeout');
    const ids = r.body.ask.options.map((o) => o.id);
    assert.equal(ids[0], 'calendar', 'tekstmønstrene setter rekkefølgen (det ligner en avtale)');
    assert.ok(ids.length >= 2 && ids.length <= 4);
    assert.ok(r.body.ask.options.every((o) => o.label && o.text?.includes(DUNE)));
    assert.equal(r.body.results.filter((x) => x.kind === 'option').length, ids.length);
    assert.equal(legacyCalls, 0, 'aldri den gamle veien');
    assert.equal(events().length, before, 'ingenting lagret ut fra en gjetning');
    assert.deepEqual(r.body.actions, []);
    // Ikke bufret: samme melding igjen spør modellen på nytt.
    await A('/api/glimt/agent', 'POST', { text: DUNE, module: 'home' });
    assert.equal(steps.length, 4);
    // Tracen viser at planleggeren ga opp, og hvorfor.
    const tr = (await A(`/api/glimt/agent/trace?id=${r.body.traceId}`)).body?.trace;
    if (tr) {
      assert.equal(tr.plan.failed, 'timeout');
      assert.deepEqual(tr.models.map((m) => [m.step, m.errKind]), [['planner', 'timeout'], ['plannerRetry', 'timeout']]);
    }
  } finally { P._setGlimtModel45(null); }
});

test('planlegger: tidsavbrudd, så gyldig plan i forsøket med thinking → avtalen lagres', async () => {
  const steps = [];
  P._setGlimtModel45(async (o) => {
    steps.push(o.step);
    if (o.step === 'planner') throw timeoutErr();
    return { data: { intent: 'calendar_create', calls: [{ tool: 'calendar.create', args: { title: 'Dune', location: 'Colosseum kino', date: '17.12', time: '17.30' } }], needs_clarification: false, clarification_question: null }, model: 'qwen3:8b' };
  });
  try {
    const before = events().length;
    let r = await A('/api/glimt/agent', 'POST', { text: DUNE, module: 'home', requestId: RID() });
    if (r.body?.confirm?.token) r = await A('/api/glimt/agent/confirm', 'POST', { token: r.body.confirm.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(steps, ['planner', 'plannerRetry']);
    const evs = events().slice(before);
    assert.equal(evs.length, 1, JSON.stringify(r.body));
    assert.deepEqual([evs[0].title, evs[0].date, evs[0].start, String(evs[0].location).toLowerCase()], ['Dune', '2026-12-17', '17:30', 'colosseum kino']);
    assert.equal(legacyCalls, 0);
  } finally { P._setGlimtModel45(null); }
});

test('planlegger: modellen nede → lokal plan som før (ett kall, ikke noe nytt forsøk)', async () => {
  const steps = [];
  P._setGlimtModel45(async (o) => { steps.push(o.step); throw Object.assign(new Error('Glimt fikk ikke svar fra noen modell: Ollama kan ikke nås'), { code: 'no_model' }); });
  try {
    const r = await A('/api/glimt/agent', 'POST', { text: 'Minn meg på å kjøpe melk i morgen', module: 'home', requestId: RID() });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(steps, ['planner']);
    assert.equal(r.body.engine, 'lokal');
    assert.equal(r.body.actions[0]?.tool, 'tasks.create');
  } finally { P._setGlimtModel45(null); }
});

test('gaten: deadlineAfterLoad – en kald modell får lastetiden i tillegg, tidsgrensen gjelder svaret', async () => {
  const enc = new TextEncoder();
  const slowLoad = async (u, init) => {
    if (/\/api\/ps$/.test(String(u))) return Response.json({ models: [] }); // kald: ingen modell lastet
    // «Lasting» 120 ms før første token, så tre tokens.
    return new Response(new ReadableStream({ async start(c) {
      let gone = false;
      init?.signal?.addEventListener('abort', () => { gone = true; try { c.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); } catch { /* */ } });
      await new Promise((r) => setTimeout(r, 120));
      if (gone) return;
      for (const t of ['{"a"', ':1', '}']) c.enqueue(enc.encode(`${JSON.stringify({ message: { role: 'assistant', content: t } })}\n`));
      c.enqueue(enc.encode(`${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', load_duration: 120e6 })}\n`)); c.close();
    } }), { headers: { 'content-type': 'application/x-ndjson' } });
  };
  const o = { model: 'qwen3:8b', base: 'http://ollama.gate55:11434', fetch: slowLoad, body: { messages: [{ role: 'user', content: 'x' }] }, loadMs: 5000, warmMs: 5000, idleMs: 5000, deadlineMs: 60, retries: 0 };
  await assert.rejects(gate.gateChat({ ...o, keepAlive: '1m' }), (e) => e.deadline === true, 'uten flagget spiser lastingen grensen');
  const out = await gate.gateChat({ ...o, model: 'qwen3:8b-b', deadlineAfterLoad: true });
  assert.equal(out.text, '{"a":1}');
});

/* ---------------- 4. llama3.2:3b ---------------- */

test('llama3.2:3b: aldri fra serverstandard, reserve eller auto – bare eksplisitt valgt (eget valg eller valgt i AI-kontroll etter prompt 55)', async () => {
  assert.equal(ai.retiredModel55('llama3.2:3b'), true);
  assert.equal(ai.retiredModel55('llama3.2:1b'), true);
  assert.equal(ai.retiredModel55('llama3.2-vision:11b'), false);
  assert.equal(ai.retiredModel55('llama3.1:8b'), false);
  ai.invalidateInventory();
  // Gamle/migrerte verdier (som produksjonen hadde: sok og kat = llama3.2:3b) og reserver.
  const r = ai.routing(OWNER);
  ai.saveServerRouting({ ...r, own: undefined, chosen55: {}, tasks: { ...r.tasks, sok: { model: 'llama3.2:3b', fallback: '' }, kat: { model: 'llama3.2:3b', fallback: '' }, glimt: { model: 'qwen3:8b', fallback: 'llama3.2:3b' }, brief: { model: '', fallback: '' } } });
  for (const t of ['sok', 'kat', 'glimt', 'brief', 'dom', 'chat']) {
    const res = await ai.resolveTask(t, { user: ME, localOnly: true });
    assert.ok(res.list.length, `${t}: ${res.reason}`);
    assert.ok(res.list.every((x) => x.id !== 'llama3.2:3b'), `${t}: ${JSON.stringify(res.list)}`);
  }
  const sok = await ai.resolveTask('sok', { user: ME });
  assert.equal(sok.list[0].id, 'qwen3:8b');
  assert.ok(sok.warnings.some((w) => /llama3\.2:3b.*brukes ikke lenger automatisk/.test(w)), JSON.stringify(sok.warnings));
  assert.notEqual(await ai.modelFor('kat', 'ollama', 'llama3.2:3b', { user: ME }), 'llama3.2:3b', 'gammel innstilling (ollamaTextModel) brukes ikke');
  // Selve kallet (ruten «sok» → reserven er aldri llama3.2:3b).
  chatCalls.length = 0;
  await ai.run('sok', { user: ME, prompt: 'hei', localOnly: true, noRetry: true, retries: 0 }).catch(() => null);
  assert.ok(chatCalls.length && !chatCalls.includes('llama3.2:3b'), JSON.stringify(chatCalls));
  // Valgt i AI-kontroll (administratoren, PUT /api/ai/routing): beholdes.
  const put = await A('/api/ai/routing', 'PUT', { tasks: { sok: { model: 'llama3.2:3b', fallback: '' } } });
  assert.equal(put.status, 200, put.text);
  assert.equal((await ai.resolveTask('sok', { user: ME })).list[0].id, 'llama3.2:3b');
  assert.ok((await ai.resolveTask('kat', { user: ME })).list.every((x) => x.id !== 'llama3.2:3b'), 'kat ble ikke valgt på nytt');
  // Eget valg (personlig) for chat: beholdes – men aldri som reserve.
  ai.saveUserRouting(ME, { tasks: { chat: { model: 'llama3.2:3b', fallback: '' }, brief: { model: 'qwen3:8b', fallback: 'llama3.2:3b' } } });
  assert.equal((await ai.resolveTask('chat', { user: ME })).list[0].id, 'llama3.2:3b');
  assert.ok((await ai.resolveTask('brief', { user: ME })).list.every((x) => x.id !== 'llama3.2:3b'));
  ai.saveUserRouting(ME, { tasks: { chat: { model: '', fallback: '' }, brief: { model: '', fallback: '' } } });
  await A('/api/ai/routing', 'PUT', { tasks: { sok: { model: 'qwen3:8b', fallback: '' } } });
  assert.deepEqual(ai.routing(OWNER).chosen55 ?? {}, {}, 'valget fjernes når modellen byttes');
});

test('eval: standardrutingen har ikke llama3.2:3b, og miljøfeil får status env (ikke modellfeil)', () => {
  assert.ok(Object.values(ENV.STANDARD_ROUTING).every((m) => !/llama3\.2/.test(m)), JSON.stringify(ENV.STANDARD_ROUTING));
  assert.equal(ENV.STANDARD_ROUTING.sok, 'qwen3:8b');
  assert.equal(ENV.STANDARD_ROUTING.kat, 'qwen3:8b');
  const noOcr = { macOcr: false, tesseract: false, notes: ['Mac-OCR-nøkkel mangler', 'Tesseract ikke installert'] };
  const r17 = { ok: false, env: noOcr, reason: 'veien er kvitteringskjeden: {"route":"document"}', trace: { steps: [{ readWith: { label: 'Kunne ikke lese bildet (Mac-OCR-nøkkelen er ikke satt · Tesseract er ikke installert)' } }] } };
  assert.match(ENV.envFailure55(r17, ''), /^ingen OCR \(Mac-OCR-nøkkel mangler · Tesseract ikke installert\)$/);
  assert.equal(ENV.envFailure55({ ...r17, ok: true }, ''), null, 'bestått er aldri env');
  assert.equal(ENV.envFailure55({ ...r17, env: { macOcr: false, tesseract: true, notes: [] } }, ''), null, 'Tesseract finnes → ikke miljøfeil');
  assert.equal(ENV.envFailure55({ ok: false, env: noOcr, reason: 'tittel: lagret «Skal se Dune»', trace: { steps: [] } }, ''), null, 'en kalendercase uten OCR-spor er en modellfeil');
  assert.equal(ENV.envFailure55({ ok: false, env: { macOcr: true, tesseract: true }, reason: 'x', trace: { steps: [] } }, 'Modellen «qwen2.5vl:7b» finnes ikke på Ollama-serveren', ['qwen2.5vl:7b']), 'modell ikke installert: qwen2.5vl:7b');
});

/* ---------------- 2. Vitnemål ---------------- */

test('vitnemål: «strconv(4)» pakkes ut, fagkoder er aldri karakterer, karakterskalaen valideres', () => {
  for (const [raw, want] of [['strconv(4)', '4'], ['int("5")', '5'], ['4.0', '4'], ['Karakter: 6', '6'], ['4/6', '4'], ['IV', 'IV'], ['bestått', 'Bestått'], ['Ikke bestått', 'Ikke bestått'], ['B', 'B'],
    ['NOR1211', null], ['REA3056', null], ['IN1000', null], ['7', null], ['0', null], ['tull', null], ['', null], [null, null]]) assert.equal(S55.gradeOf55(raw), want, String(raw));
  assert.equal(S55.gradeOf55('A', { scale: 'vgs' }), null);
  assert.equal(S55.gradeOf55('5', { scale: 'ho' }), null);
  assert.ok(S55.isSubjectCode55('NOR1211') && S55.isSubjectCode55('REA3056') && S55.isSubjectCode55('MAT-INF1100') && !S55.isSubjectCode55('4') && !S55.isSubjectCode55('Bestått'));
});

test('vitnemål: fagnavn matches fuzzy mot kjente fag (Damerau-Levenshtein), nivået må være likt', () => {
  assert.equal(S55.damerau55('samfunnuskunnskap', 'samfunnskunnskap'), 1);
  assert.equal(S55.damerau55('kroppsøvnig', 'kroppsøving'), 1, 'ombytting teller som én');
  assert.equal(S55.canonicalSubject55('Samfunnuskunnskap')?.name, 'Samfunnskunnskap');
  assert.equal(S55.canonicalSubject55('Kroppsøvnig')?.name, 'Kroppsøving');
  assert.equal(S55.canonicalSubject55('Norsk hovedmål skriftlig')?.name, 'Norsk hovedmål, skriftlig');
  assert.equal(S55.canonicalSubject55('Informasjonsteknolgi 1')?.name, 'Informasjonsteknologi 1');
  assert.equal(S55.canonicalSubject55('Fysikk 1')?.name, 'Fysikk 1');
  assert.equal(S55.canonicalSubject55('Fysikk 3'), null, 'aldri et annet nivå');
  assert.equal(S55.canonicalSubject55('Spansk ll')?.name ?? null, null, 'ukjent nivå gjettes ikke');
  assert.equal(S55.canonicalSubject55('Norsk sidemål, skriftlig')?.name, 'Norsk sidemål, skriftlig', 'sidemål blir aldri hovedmål');
  assert.equal(S55.canonicalSubject55('Astrofysikk for katter'), null);
});

test('vitnemål uten OCR: visjonsmodellen i striper – kode/karakter i byttet felt, «strconv», fagkode som karakter, skrivefeil og dubletter', async () => {
  S45._setTools45({ tesseract: false, pdftotext: false, magick: false, convert: false, 'heif-convert': false });
  S46._setStudyStripe46(async () => ({ rows: [
    { code: 'NOR1211', name: 'Norsk hovedmål, skriftlig', grade: 'strconv(4)' },
    { code: '5', name: 'Engelsk', grade: 'ENG1007' },
    { code: 'SAM3072', name: 'Samfunnuskunnskap', grade: '5' },
    { code: '', name: 'Matematikk R1', grade: 'REA3056' },
    { code: 'SAM3072', name: 'Samfunnskunnskap', grade: '5' },
    { code: 'KRO1019', name: 'Kroppsøving', grade: '6' },
  ] }));
  try {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const r = await S46.readStudy46(png, 'image/png', { user: ME, name: 'vitnemal.png' });
    assert.equal(r.method, 'visjon');
    const by = Object.fromEntries(r.emner.map((e) => [e.navn, e]));
    assert.equal(r.emner.length, 5, JSON.stringify(r.emner));
    assert.deepEqual([by['Norsk hovedmål, skriftlig'].kode, by['Norsk hovedmål, skriftlig'].karakter], ['NOR1211', '4']);
    assert.deepEqual([by.Engelsk.kode, by.Engelsk.karakter], ['ENG1007', '5']);
    assert.deepEqual([by.Samfunnskunnskap.kode, by.Samfunnskunnskap.karakter, by.Samfunnskunnskap.navnLest], ['SAM3072', '5', 'Samfunnuskunnskap']);
    assert.equal(by['Matematikk R1'].kode, 'REA3056');
    assert.equal(by['Matematikk R1'].karakter, null, 'fagkoden er aldri karakteren');
    assert.equal(by['Matematikk R1'].check, true);
    assert.ok(r.emner.every((e) => e.karakter === null || S55.gradeOf55(e.karakter) === e.karakter), 'ingen rare karakterer');
    // Skjemaet og instruksen til visjonsmodellen: karakteren er et enum, og fagkoden har eget felt.
    assert.ok(S46.ROWS_SCHEMA46.properties.rows.items.properties.grade.enum.includes('6'));
    assert.ok(!S46.ROWS_SCHEMA46.properties.rows.items.properties.grade.enum.some((g) => /\d{4}/.test(g)));
    assert.match(S46.STRIPE_PROMPT55, /fagkoden er aldri karakteren/);
  } finally { S46._setStudyStripe46(null); S45._setTools45({}); }
});

/* ---------------- 3. Kvittering uten OCR ---------------- */

const GOOD = { merchant: 'REMA 1000', org_number: null, date: '2026-10-20', time: '17:42', currency: 'NOK',
  items: [{ description: 'MELK 1L', quantity: null, unit_price: null, amount: 21.9 }, { description: 'BRØD', quantity: null, unit_price: null, amount: 34.5 }],
  discounts: [], subtotal: null, vat: [], total: 56.4, payment_method: 'BankAxept', category_suggestion: 'Mat og dagligvarer' };
const IMG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

test('kvittering: ingen OCR (Mac-OCR uten nøkkel, Tesseract mangler) → visjonsmodellen med samme schema og validering, merket, maks middels sikkerhet', async () => {
  chain._resetChain48();
  fdb.saveSettings({ macOcrUrl: 'http://mac.p55:8765', receipts48: { macOcr: true, tesseract: true, deviceOcr: true, deviceParse: true, compareMac: true } }, 'owner');
  tess._setTesseract48({ tools: async () => ({ tesseract: null }) });
  const seen = [];
  chain._setReceiptVision55(async (o) => { seen.push(o); return { data: GOOD, model: 'qwen2.5vl:7b' }; });
  try {
    const res = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: ['Mat og dagligvarer', 'Annet'] });
    assert.equal(seen.length, 1);
    assert.ok(seen[0].schema?.properties?.items && seen[0].schema.required.includes('total'), 'samme schema som tekstmodellen (modelFormat48)');
    assert.equal(res.used, 'V');
    assert.equal(res.label, 'visjonsmodell (ingen OCR)');
    assert.equal(res.model, 'qwen2.5vl:7b');
    assert.equal(res.noOcr, true);
    assert.equal(res.confidence, 'medium', 'aldri høy uten OCR');
    assert.ok(res.uncertain_fields.includes('total'));
    assert.equal(res.receipt.total, 56.4);
    const v = res.pipeline.find((p) => p.step === 'V');
    assert.match(v.reason, /ingen OCR: .*Mac-OCR-nøkkelen er ikke satt.*Tesseract er ikke installert/);
    // Samme validering: et svar som ikke summerer, består ikke (og får ett nytt forsøk med tilbakemeldingen).
    seen.length = 0;
    chain._setReceiptVision55(async (o) => { seen.push(o); return { data: { ...GOOD, total: 99 }, model: 'qwen2.5vl:7b' }; });
    const bad = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: ['Mat og dagligvarer'] });
    assert.equal(seen.length, 2);
    assert.match(seen[1].feedback ?? '', /summerer/);
    assert.equal(bad.passed, false);
    assert.notEqual(bad.confidence, 'high');
  } finally { chain._setReceiptVision55(null); tess._setTesseract48(null); }
});

test('kvittering: finnes OCR (Tesseract), er visjonsmodellen aldri kilden – heller ikke når tekstmodellen feiler', async () => {
  chain._resetChain48();
  fdb.saveSettings({ macOcrUrl: 'http://mac.p55:8765', receipts48: { macOcr: true, tesseract: true } }, 'owner');
  const tsv = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext', '1\t1\t0\t0\t0\t0\t0\t0\t2000\t3000\t-1\t',
    ...['REMA 1000', 'MELK 21,90', 'TOTAL 21,90'].flatMap((row, li) => row.split(' ').map((w, wi) => `5\t1\t1\t1\t${li + 1}\t${wi + 1}\t${100 + wi * 150}\t${100 + li * 90}\t120\t50\t91\t${w}`))].join('\n');
  tess._setTesseract48({ tools: async () => ({ tesseract: 'tesseract 5.3.0', magick: null }), run: async () => tsv });
  let n = 0;
  chain._setReceiptVision55(async () => { n++; return { data: GOOD, model: 'qwen2.5vl:7b' }; });
  try {
    const res = await chain.runChain48({ image: IMG, mime: 'image/jpeg', categories: [] });
    assert.equal(n, 0, 'visjonsmodellen ble ikke brukt');
    assert.notEqual(res.used, 'V');
    assert.ok(!res.pipeline.some((p) => p.step === 'V'));
  } finally { chain._setReceiptVision55(null); tess._setTesseract48(null); }
});
