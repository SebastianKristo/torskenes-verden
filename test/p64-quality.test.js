// Prompt 64 (prompt 49 del 7, D7SRV): kvalitet over tid. Mock-backend for evalen (falsk runner som skriver eval-resultatet), fryst
// klokke: systemoppgavene «Nattlig eval» (kl. 02) og «Ukerapport» (søndag kl. 20) i scheduleren fra del 2, sammenligning mot grunnlaget,
// regresjon → push til admin (case, grunn, lenke), miljøfeil → ikke varsel, Ollama svarer ikke → hoppet over, interaktiv forespørsel
// venter → avbrutt, AI-køen holder bakgrunnsjobber, rapporter i DATA_DIR med rotasjon, API-et (admin-only), ukerapportens tall fra
// kjente data, og én ekte kjøring av eval/run.mjs med --backend mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p64-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p64';
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
const { gateState } = await import('../server/ai-gate.js');
const ST = await import('../server/quality64/store.js');
const SET = await import('../server/quality64/settings.js');
const EV = await import('../server/quality64/evalrun.js');
const CMP = await import('../server/quality64/compare.js');
const WK = await import('../server/quality64/weekly.js');
const NT = await import('../server/quality64/notify64.js');
const SYS = await import('../server/quality64/system.js');
const API = await import('../server/quality64/api.js');
const SC = await import('../server/sched62/scheduler.js');

const NIGHT = Date.parse('2026-10-27T02:00:00+01:00'); // tirsdag kl. 02:00 Europe/Oslo (vintertid)
const SUNDAY = Date.parse('2026-11-01T20:00:00+01:00'); // søndag kl. 20:00, uke 44 (26.10–1.11)
const H = 3600_000, DAY = 24 * H;
let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, type: r.headers.get('content-type') };
}
const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
const A = (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });
const ME = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();

const pushed = [];
NT._setNotify64(async (user, msg) => { pushed.push({ user, ...msg }); return { id: pushed.length, pushed: 1 }; });
EV.T64.watchMs = 15;
EV.T64.killGraceMs = 50;

/* ---------- Falsk eval (mock-backend): skriver et resultat som run.mjs ---------- */
const mkCase = (id, passes, runs = 3, envRuns = 0, reason = 'Svaret manglet 3. november') => ({
  id, title: `Case ${id}`, area: 'test', passes, runs, envRuns, envReasons: envRuns ? ['ingen OCR (Mac-OCR og Tesseract mangler)'] : [], medianMs: 1000, p50Ms: 1000, p90Ms: 2000, replyMedianMs: 800, replyP90Ms: 1500, models: ['qwen3:8b'],
  results: Array.from({ length: runs }, (_, i) => (i < passes ? { ok: true, status: 'ok', run: i + 1 } : i < passes + envRuns ? { ok: false, status: 'env', envReason: 'ingen OCR', reason: 'OCR feilet', run: i + 1 } : { ok: false, status: 'feil', reason, run: i + 1 })),
});
function writeResult(outDir, cases) {
  const passed = cases.reduce((a, c) => a + c.passes, 0), total = cases.reduce((a, c) => a + c.runs, 0), env = cases.reduce((a, c) => a + c.envRuns, 0);
  const json = { meta: { backend: 'ollama', commit: 'abc1234', routing: { effective: { glimt: 'qwen3:8b' } } },
    summary: { passed, total, greenCases: cases.filter((c) => c.passes === c.runs).length, cases: cases.length, modelFailures: total - passed - env, envFailures: env, p50Ms: 1000, p90Ms: 2000, replyP50Ms: 800, replyP90Ms: 1500 }, cases };
  writeFileSync(join(outDir, '2026-10-27-ollama-qwen3_8b.json'), JSON.stringify(json));
  writeFileSync(join(outDir, '2026-10-27-ollama-qwen3_8b.md'), `# Glimt eval\n\n**${passed}/${total} kjøringer bestått**\n`);
}
let CASES = [];
const runnerCalls = [];
const mockRunner = async ({ args, outDir, env, onLine }) => {
  runnerCalls.push({ args, env, hold: gateState().hold });
  onLine(`Glimt eval · motor Ollama · 3 kjøring(er) × ${CASES.length} caser · klokke …`);
  for (const c of CASES) onLine(`  OK   ${c.id} #1 1.0 s (svar 0.8 s)`);
  writeResult(outDir, CASES);
  return { code: 0, log: [] };
};
let pingOk = true;
EV._setEval64({ clock: NIGHT, ping: async () => pingOk, url: 'http://ollama.test:11434', runner: mockRunner });
API._setClock64(NIGHT - H); // systemoppgavene opprettes (og pauses/fortsettes) kl. 01, kjøres kl. 02
SC._setClock62(NIGHT - H);

async function runNow(body) { const r = await A('/api/glimt/quality/run-now', 'POST', body ?? {}); await EV._waitEval64(); return r; }

test('innstillinger: standard på, brukeren kan slå av ukerapporten, serverens valg krever admin og har grenser', async () => {
  const s = (await A('/api/glimt/quality/settings')).body;
  assert.deepEqual(s.settings, { nightly: true, weekly: true });
  assert.equal(s.server.runs, 3); assert.equal(s.server.keepDays, 30); assert.equal(s.server.interactiveWaitSec, 20);
  assert.equal(s.admin, true);
  assert.equal(s.labels.nightly, 'Nattlig eval');
  assert.ok(s.schedules.nightly?.id && s.schedules.weekly?.id, 'begge systemoppgavene finnes');
  const off = await A('/api/glimt/quality/settings', 'PUT', { scope: 'user', weekly: false });
  assert.equal(off.status, 200); assert.equal(off.body.settings.weekly, false); assert.equal(off.body.user.weekly, false);
  assert.equal((await A('/api/glimt/quality/settings', 'PUT', { scope: 'user', weekly: null })).body.settings.weekly, true);
  assert.equal((await A('/api/glimt/quality/settings', 'PUT', { scope: 'user', nightly: false })).status, 400, 'nattevalen er bare serverens');
  assert.equal((await A('/api/glimt/quality/settings', 'PUT', { scope: 'server', runs: 9 })).status, 400);
  assert.equal(SET.saveQuality64(ME, { scope: 'server', nightly: false }, { admin: false }).status, 403);
  const srv = await A('/api/glimt/quality/settings', 'PUT', { scope: 'server', runs: 2, interactiveWaitSec: 10 });
  assert.equal(srv.body.server.runs, 2); assert.equal(srv.body.server.interactiveWaitSec, 10);
  await A('/api/glimt/quality/settings', 'PUT', { scope: 'server', runs: null, interactiveWaitSec: null });
});

test('systemoppgavene: «Nattlig eval» kl. 02 (én, admin) og «Ukerapport» søndag kl. 20, synes i Faste oppgaver, kan pauses, ikke slettes', async () => {
  await SYS.ensureAllUsers64(NIGHT - H);
  await SYS.ensureAllUsers64(NIGHT - H);
  const rows = db.prepare("SELECT * FROM glimt_schedules WHERE source='system' AND kind IN ('quality','weekly')").all();
  assert.equal(rows.filter((r) => r.kind === 'quality').length, 1, 'bare én nattlig eval');
  assert.equal(rows.filter((r) => r.kind === 'weekly' && r.user_id === ME).length, 1);
  const q = rows.find((r) => r.kind === 'quality');
  assert.equal(q.user_id, ME);
  assert.match(q.rrule, /FREQ=DAILY/); assert.match(q.dtstart, /T02:00$/);
  assert.match(rows.find((r) => r.kind === 'weekly').rrule, /FREQ=WEEKLY.*BYDAY=SU|BYDAY=SU.*FREQ=WEEKLY/);
  const list = (await A('/api/glimt/schedules')).body.items;
  const it = list.find((x) => x.id === q.id);
  assert.equal(it.system, true); assert.equal(it.title, 'Nattlig eval');
  assert.equal(new Date(it.nextRunAt).getTime(), NIGHT, 'neste kjøring kl. 02:00');
  assert.equal((await A(`/api/glimt/schedules/${q.id}`, 'DELETE')).status, 400);
  assert.equal((await A(`/api/glimt/schedules/${q.id}`, 'PATCH', { status: 'paused' })).status, 200);
  await SYS.ensureAllUsers64(NIGHT);
  assert.equal(db.prepare('SELECT status FROM glimt_schedules WHERE id=?').pluck().get(q.id), 'paused', 'en pauset systemoppgave settes ikke på igjen');
  assert.equal((await A(`/api/glimt/schedules/${q.id}`, 'PATCH', { status: 'active' })).status, 200);
});

test('sammenligning: regresjon bare når en case som var grønn (eller ≥ forrige) nå er dårligere; miljøfeil teller ikke; nye caser varsler ikke', () => {
  const base = { cases: { a: { passes: 3, runs: 3, envRuns: 0 }, b: { passes: 2, runs: 3, envRuns: 0 }, c: { passes: 3, runs: 3, envRuns: 0 }, d: { passes: 3, runs: 3, envRuns: 0 }, e: { passes: 0, runs: 3, envRuns: 0 } } };
  const r = CMP.compare64([mkCase('a', 1), mkCase('b', 2), mkCase('c', 0, 3, 3), mkCase('d', 2, 3, 1), mkCase('e', 3), mkCase('ny', 0)], base, { runId: 'q00000000000001', at: 'x' });
  assert.deepEqual(r.regressions.map((x) => x.caseId), ['a']);
  assert.equal(r.regressions[0].before, '3/3'); assert.equal(r.regressions[0].now, '1/3');
  assert.match(r.regressions[0].reason, /3\. november/);
  assert.deepEqual(r.improved.map((x) => x.caseId), ['e']);
  assert.equal(r.newCases, 1);
  assert.equal(r.next.cases.c.passes, 3, 'bare miljøfeil: grunnlaget står');
  assert.equal(r.next.cases.a.passes, 1, 'grunnlaget oppdateres (samme røde case varsles ikke hver natt)');
  // 2/3 som holder seg = ingen regresjon; 2/3 → 1/3 = regresjon
  assert.equal(CMP.compare64([mkCase('b', 1)], base).regressions.length, 1);
  assert.equal(CMP.caseStatus64(mkCase('x', 0, 3, 3)), 'env');
});

test('nattjobben kl. 02 via scheduleren: starter evalen i bakgrunnen, AI-køen holder bakgrunnsjobber, første kjøring er grunnlag (ingen push)', async () => {
  pushed.length = 0;
  CASES = [mkCase('01-nina-frisor', 3), mkCase('07-vaer-to-steder', 3), mkCase('10-vitnemal', 3)];
  SC._setClock62(NIGHT);
  const t = await SC.tick62(NIGHT);
  assert.ok(t.ran >= 1, JSON.stringify(t));
  const sr = db.prepare("SELECT r.* FROM glimt_schedule_runs r JOIN glimt_schedules s ON s.id=r.schedule_id WHERE s.kind='quality' ORDER BY r.rowid DESC LIMIT 1").get();
  assert.equal(sr.status, 'ok'); assert.match(sr.result, /Nattlig eval startet/);
  assert.equal(sr.delivery, null, 'scheduleren leverer ingenting selv');
  const run = await EV._waitEval64();
  assert.equal(run.status, 'ok'); assert.equal(run.trigger, 'schedule');
  assert.equal(run.passed, 9); assert.equal(run.newCases, 3); assert.equal(run.regressions.length, 0);
  assert.equal(pushed.length, 0, 'ingen push uten regresjon');
  const call = runnerCalls.at(-1);
  assert.ok(call.hold >= 1, 'AI-køen holdt andre bakgrunnsjobber mens evalen gikk');
  assert.equal(gateState().hold, 0, 'og slipper etterpå');
  assert.deepEqual(call.args.slice(0, 4), ['--backend', 'ollama', '--url', 'http://ollama.test:11434']);
  assert.ok(call.args.includes('--out') && call.args.includes('--learned'));
  assert.notEqual(call.env.DATA_DIR, undefined);
  assert.ok(existsSync(ST.reportPath64(run.id, 'md')) && existsSync(ST.reportPath64(run.id, 'json')), 'rapportene i DATA_DIR');
  assert.ok(ST.reportPath64(run.id, 'md').startsWith(process.env.DATA_DIR), 'aldri i repoet');
  assert.ok(existsSync(join(process.env.DATA_DIR, 'quality64', 'baseline.json')));
});

test('regresjon → push til admin med case, kort grunn og lenke til rapporten', async () => {
  pushed.length = 0;
  CASES = [mkCase('01-nina-frisor', 3), mkCase('07-vaer-to-steder', 1, 3, 0, 'To weather.get forventet, fikk én'), mkCase('10-vitnemal', 3)];
  const r = await runNow();
  assert.equal(r.status, 202); assert.equal(r.body.run.status, 'running');
  const run = ST.publicRun64(ST.runRow64(r.body.run.id));
  assert.equal(run.status, 'regression');
  assert.deepEqual(run.regressions.map((x) => x.caseId), ['07-vaer-to-steder']);
  assert.equal(pushed.length, 1);
  const p = pushed[0];
  assert.equal(p.user, ME);
  assert.match(p.title, /1 case har blitt rød/);
  assert.match(p.body, /07-vaer-to-steder 3\/3 → 1\/3: To weather\.get forventet/);
  assert.equal(p.url, `/#/innstillinger/kvalitet/run/${run.id}`);
  assert.equal(p.data.kind, 'quality.regression');
  assert.equal(run.notified, true);
  // Samme røde case neste natt: ikke nytt varsel.
  pushed.length = 0;
  const r2 = await runNow();
  assert.equal(ST.runRow64(r2.body.run.id).status, 'ok');
  assert.equal(pushed.length, 0);
});

test('miljøfeil (ingen OCR / andre modeller lastet) → ikke rød, ikke varsel', async () => {
  pushed.length = 0;
  CASES = [mkCase('01-nina-frisor', 3), mkCase('07-vaer-to-steder', 1), mkCase('10-vitnemal', 0, 3, 3)];
  const r = await runNow();
  const run = ST.publicRun64(ST.runRow64(r.body.run.id));
  assert.equal(run.status, 'ok'); assert.equal(run.envFailures, 3);
  assert.equal(pushed.length, 0);
  const det = (await A(`/api/glimt/quality/runs/${run.id}`)).body;
  const vit = det.cases.find((c) => c.id === '10-vitnemal');
  assert.equal(vit.status, 'env'); assert.equal(vit.regression, false);
  assert.equal(vit.baseline.passes, 3);
  // og grunnlaget for vitnemålet står: neste fullførte 2/3 er en regresjon
  CASES = [mkCase('10-vitnemal', 2)];
  await runNow();
  assert.equal(pushed.length, 1);
  assert.match(pushed[0].body, /10-vitnemal 3\/3 → 2\/3/);
});

test('Ollama svarer ikke → hoppet over (ingen kjøring), nattlig eval av → hoppet over fra scheduleren', async () => {
  const n = runnerCalls.length;
  pingOk = false;
  const r = await A('/api/glimt/quality/run-now', 'POST', {});
  pingOk = true;
  assert.equal(r.status, 200); assert.equal(r.body.ok, false);
  assert.equal(r.body.run.status, 'skipped'); assert.match(r.body.run.reason, /Ollama svarte ikke/);
  assert.equal(runnerCalls.length, n);
  SET._setQuality64({ nightly: false });
  const out = await SYS.computeSystem64({ kind: 'quality', user_id: ME }, { now: NIGHT });
  SET._setQuality64(null);
  assert.equal(out.status, 'skipped'); assert.match(out.reason, /slått av/);
  assert.equal(runnerCalls.length, n);
});

test('interaktiv forespørsel venter for lenge → evalen avbrytes (Glimt skal ikke bli treg); Avbryt og 409 mens den går', async () => {
  let gate = { running: [], waiting: [] };
  let started;
  const startedP = new Promise((r) => { started = r; });
  EV._setEval64({ gate: () => gate, runner: ({ signal }) => new Promise((res) => { started(); signal.addEventListener('abort', () => res({ code: null, signal: 'SIGTERM', log: [] })); }) });
  const r = await A('/api/glimt/quality/run-now', 'POST', {});
  assert.equal(r.status, 202);
  await startedP;
  assert.equal((await A('/api/glimt/quality/run-now', 'POST', {})).status, 409, 'kjører allerede');
  assert.equal((await A('/api/glimt/quality/runs')).body.running.id, r.body.run.id);
  gate = { running: [{ model: 'qwen3:8b', priority: 'interactive', ms: 25_000, kind: 'chat' }], waiting: [] };
  const run = await EV._waitEval64();
  assert.equal(run.status, 'aborted'); assert.match(run.reason, /interaktiv forespørsel ventet i 25 s/);
  assert.equal(gateState().hold, 0);
  // Interaktiv i kø: vakten måler selv hvor lenge den har ventet (ikke køens eldste jobb, som kan være en holdt bakgrunnsjobb).
  gate = { running: [], waiting: [{ model: 'qwen3:8b', n: 3, oldestMs: 600_000, interactive: 1 }] };
  const rq = await A('/api/glimt/quality/run-now', 'POST', {});
  await new Promise((res) => setTimeout(res, 40));
  assert.equal(EV.isRunning64(), true, 'ikke avbrutt med en gang selv om køens eldste jobb er gammel');
  EV._setEval64({ clock: NIGHT + 25_000 });
  const rqRun = await EV._waitEval64();
  EV._setEval64({ clock: NIGHT });
  assert.equal(rqRun.id, rq.body.run.id); assert.equal(rqRun.status, 'aborted'); assert.match(rqRun.reason, /ventet i 25 s/);
  gate = { running: [], waiting: [] };
  const r2 = await A('/api/glimt/quality/run-now', 'POST', {});
  await new Promise((res) => setTimeout(res, 40));
  const ab = await A('/api/glimt/quality/abort', 'POST');
  assert.equal(ab.status, 200);
  const run2 = await EV._waitEval64();
  assert.equal(run2.id, r2.body.run.id); assert.equal(run2.status, 'aborted'); assert.match(run2.reason, /administrator/);
  assert.equal((await A('/api/glimt/quality/abort', 'POST')).status, 409);
  EV._setEval64({ gate: null, runner: mockRunner });
});

test('API: liste, detalj, rapporten som md/json, 404 og rotasjon etter keepDays', async () => {
  const list = (await A('/api/glimt/quality/runs')).body;
  assert.ok(list.items.length >= 5); assert.equal(list.running, null); assert.equal(list.keepDays, 30);
  const done = list.items.find((x) => x.status === 'regression');
  assert.ok(done.report.md && done.report.json);
  assert.equal(done.model, 'qwen3:8b'); assert.equal(done.commit, 'abc1234');
  const md = await A(`/api/glimt/quality/runs/${done.id}?format=md`);
  assert.equal(md.status, 200); assert.match(md.type, /text\/markdown/); assert.match(md.text, /# Glimt eval/);
  const js = await A(`/api/glimt/quality/runs/${done.id}?format=json`);
  assert.equal(js.status, 200); assert.ok(Array.isArray(js.body.cases));
  assert.equal((await A('/api/glimt/quality/runs/q0000000000000f')).status, 404);
  assert.equal((await A('/api/glimt/quality/runs/xyz')).status, 404);
  const ab = list.items.find((x) => x.status === 'aborted');
  assert.equal((await A(`/api/glimt/quality/runs/${ab.id}?format=md`)).status, 404);
  // Rotasjon: en kjøring fra 40 dager siden forsvinner med rapportene.
  const old = ST.insertRun64({ startedAt: NIGHT - 40 * DAY, status: 'ok' });
  mkdirSync(ST.reportsDir64(), { recursive: true });
  writeFileSync(ST.reportPath64(old, 'md'), '# gammel');
  const orphan = join(ST.reportsDir64(), 'q0123456789abcd.json');
  writeFileSync(orphan, '{}');
  utimesSync(orphan, new Date(NIGHT - 40 * DAY), new Date(NIGHT - 40 * DAY));
  assert.equal(ST.rotate64(30, NIGHT), 1);
  assert.equal(ST.runRow64(old), null);
  assert.equal(existsSync(ST.reportPath64(old, 'md')), false);
  assert.equal(existsSync(orphan), false);
  assert.ok(existsSync(ST.reportPath64(done.id, 'md')), 'nye rapporter står');
});

test('ukerapporten: tallene fra kjente data (forespørsler, første forsøk, rettelser, nye oppskrifter, hurtigvei, median) og én kort push søndag kl. 20', async () => {
  pushed.length = 0;
  const mon = Date.parse('2026-10-26T09:00:00+01:00');
  let n = 0;
  const tr = (at, d, user = ME) => { const id = `t64x${++n}`; db.prepare('INSERT INTO glimt47_trace(id, user_id, created, data) VALUES(?,?,?,?)').run(id, user, at, JSON.stringify({ id, module: 'home', ...d })); return id; };
  tr(mon, { totalMs: 1000, plan: { intent: 'weather' }, tools: [{ tool: 'weather.get', status: 'done' }] });
  tr(mon + H, { totalMs: 2000, plan: { intent: 'calendar_query' }, tools: [{ tool: 'calendar.search', status: 'failed' }] });
  tr(mon + 2 * H, { totalMs: 3000, plan: { intent: 'calendar_create', ask: { question: 'Hvilken dag?' } }, tools: [] });
  const wrong = tr(mon + 3 * H, { totalMs: 4000, plan: { intent: 'calendar_query' }, tools: [{ tool: 'calendar.search', status: 'done' }] });
  tr(mon + 3 * H + 60_000, { totalMs: 5000, plan: { intent: 'calendar_query' }, tools: [{ tool: 'calendar.search', status: 'done' }], recipe: { use: 'new', correction: { of: wrong, kind: 'retting' } } });
  tr(mon + DAY, { totalMs: 500, plan: { intent: 'weather' }, tools: [{ tool: 'weather.get', status: 'done' }], recipe: { use: 'fast', fast: { used: true } } });
  tr(mon + 2 * DAY, { totalMs: 100, plan: { intent: 'weather' }, tools: [{ tool: 'weather.get', status: 'done' }], cache: { hit: true } });
  const down = tr(mon + 3 * DAY, { totalMs: 6000, plan: { intent: 'web_search' }, tools: [{ tool: 'web.search', status: 'done' }] });
  tr(mon - 2 * DAY, { totalMs: 9000, plan: { intent: 'chat' }, tools: [] }); // forrige uke
  tr(mon, { totalMs: 700, plan: { intent: 'chat' }, tools: [] }, 'u-annen-p64'); // en annen bruker
  db.prepare("INSERT INTO recipe_runs(id, user_id, recipe_id, trace_id, created, text, use, state, vote) VALUES('k64down', ?, NULL, ?, ?, 'x', 'none', 'fail', 'down')").run(ME, down, mon + 3 * DAY);
  for (const [i, at] of [[1, mon + H], [2, mon + 2 * DAY], [3, mon - 3 * DAY]]) db.prepare("INSERT INTO recipes(id, user_id, created_at, example_query, query_template, plan) VALUES(?,?,?,?,?,'{}')").run(`r64x${i}`, ME, at, 'q', 'q');
  API._setClock64(SUNDAY);
  const w = (await A('/api/glimt/quality/weekly')).body;
  assert.equal(w.week, '2026-W44'); assert.equal(w.label, 'Uke 44 (26. okt – 1. nov)'); assert.equal(w.partial, true);
  const u = w.user;
  assert.equal(u.requests, 8);
  // første forsøk: 1 (ok), 5 (rettelsen selv var ok), 6 (hurtigvei), 7 (cache) = 4 (ikke: feilet verktøy, spørsmål, rettet, tommel ned)
  assert.equal(u.firstTry, 4); assert.equal(u.firstTryShare, 0.5);
  assert.equal(u.corrections, 1); assert.equal(u.newRecipes, 2);
  assert.equal(u.fast, 1); assert.equal(u.fastShare, 0.13); assert.equal(u.cache, 1);
  assert.equal(u.medianMs, 2000);
  assert.equal(w.text, 'Uke 44: 8 forespørsler · 50 % løst på første forsøk · 1 rettelse · 2 nye oppskrifter · hurtigvei 13 % · median 2,0 s');
  assert.equal(w.system.requests, 9, 'admin: alle brukere'); assert.equal(w.system.users, 2);
  assert.ok(w.system.eval.runs >= 5);
  assert.equal(w.weeks[0].week, '2026-W44'); assert.equal(w.weeks[1].week, '2026-W43'); assert.equal(w.weeks[1].requests, 1); assert.equal(w.weeks.length, 12);
  assert.equal((await A('/api/glimt/quality/weekly?week=2026-W99')).status, 400);
  assert.equal((await A('/api/glimt/quality/weekly?week=uke44')).status, 400);
  assert.equal((await A('/api/glimt/quality/weekly?week=2026-W43')).body.user.requests, 1);
  // Søndag kl. 20: scheduleren sender én kort melding.
  SC._setClock62(SUNDAY);
  await SC.tick62(SUNDAY);
  const wp = pushed.filter((p) => p.data?.kind === 'quality.weekly');
  assert.equal(wp.length, 1);
  assert.equal(wp[0].user, ME); assert.equal(wp[0].title, 'Glimt – uke 44'); assert.equal(wp[0].body, w.text);
  assert.equal(wp[0].url, '/#/innstillinger/kvalitet/uke/2026-W44');
  assert.ok((await A('/api/glimt/quality/weekly?week=2026-W44')).body.sentAt);
  assert.equal((await WK.weeklyPush64(ME, SUNDAY + 60_000)).skipped, 'Allerede sendt for uka');
  // Av for brukeren → ingen push neste uke.
  await A('/api/glimt/quality/settings', 'PUT', { scope: 'user', weekly: false });
  assert.match((await WK.weeklyPush64(ME, SUNDAY + 7 * DAY)).skipped, /slått av/);
  await A('/api/glimt/quality/settings', 'PUT', { scope: 'user', weekly: null });
  assert.equal((await WK.weeklyPush64(ME, SUNDAY + 7 * DAY)).skipped, 'Ingen forespørsler denne uka');
});

test('ISO-uker i Europe/Oslo (årsskifte, uke 53)', () => {
  assert.equal(WK.weekOfDate64('2026-10-26'), '2026-W44');
  assert.equal(WK.weekOfDate64('2026-11-01'), '2026-W44');
  assert.equal(WK.weekOfDate64('2027-01-01'), '2026-W53');
  assert.equal(WK.weekOfDate64('2025-12-29'), '2026-W01');
  assert.equal(WK.weekRange64('2026-W44').monday, '2026-10-26');
  assert.equal(WK.weekRange64('2025-W53'), null);
  assert.equal(new Date(WK.weekRange64('2026-W44').from).toISOString(), '2026-10-25T23:00:00.000Z');
});

test('ekte barneprosess: eval/run.mjs --backend mock (én case) gir rapport og sammendrag', async () => {
  EV._setEval64({ runner: null, args: { backend: 'mock', cases: '14' } });
  const r = await A('/api/glimt/quality/run-now', 'POST', { runs: 1 });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  const run = await EV._waitEval64();
  EV._setEval64({ runner: mockRunner, args: null });
  assert.equal(run.status, 'ok', run.reason);
  assert.equal(run.passed, 1); assert.equal(run.total, 1); assert.equal(run.runsPerCase, 1);
  assert.match(readFileSync(ST.reportPath64(run.id, 'md'), 'utf8'), /14-hovedstad/);
  assert.equal(existsSync(join(process.env.DATA_DIR, 'quality64', 'tmp', run.id)), false, 'midlertidige filer er ryddet');
});
