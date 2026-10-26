// Prompt 62 (prompt 49 del 2, D2SRV): planlagte oppgaver i naturlig språk. Gjentakelsesparseren (norsk → RRULE, Europe/Oslo med
// sommertid 25.10 og 29.03), betingelser i et lite, trygt uttrykksspråk (evaluert i kode med falske data), Glimt-flyten (intentene,
// bekreftelse før lagring, liste/stopp/flytt, morgenbriefen), scheduleren (fryst klokke: forhåndsberegning, tapte kjøringer < 2 t,
// stille timer, overlever «omstart»), levering via push, innstillingene og API-et /api/glimt/schedules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p62-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p62';
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
const { db, kv, OWNER } = await import('../server/db.js');
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const D = await import('../server/glimt45/dates.js');
const C = await import('../server/sched62/cond.js');
const ST = await import('../server/sched62/store.js');
const RUN = await import('../server/sched62/run.js');
const SC = await import('../server/sched62/scheduler.js');
const SET = await import('../server/sched62/settings.js');
const TK = await import('../server/sched62/task.js');
const G35 = await import('../server/glimt35.js');

E._setClock45({ today: '2026-10-24', nowMin: 600 }); // lørdag 24.10.2026 kl. 10:00 (sommertid til natt til søndag)
const NOW = Date.parse('2026-10-24T10:00:00+02:00');
SC._setClock62(NOW);
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
const RID = () => `t62-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const agent = (text, extra = {}) => A('/api/glimt/agent', 'POST', { text, module: 'home', requestId: RID(), ...extra });
const confirm = (token) => A('/api/glimt/agent/confirm', 'POST', { token });
const rows = () => db.prepare('SELECT * FROM glimt_schedules WHERE user_id=? ORDER BY created_at, rowid').all(ME);
const runsOf = (id) => db.prepare('SELECT * FROM glimt_schedule_runs WHERE schedule_id=? ORDER BY planned_at, rowid').all(id);
const reset = () => { db.prepare('DELETE FROM glimt_schedules').run(); db.prepare('DELETE FROM glimt_schedule_runs').run(); SC._prepared62().clear(); };
const oslo = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(0, 16);

/* ---------------- Falsk planlegger, falske data, falsk levering ---------------- */

const seen = [];
const PLANS = [
  [/^Send meg strømprisene hver morgen kl\. 7$/, { intent: 'schedule_create', calls: [{ tool: 'schedule.create', args: { what: 'strømprisene for i dag', when: 'hver morgen kl. 7' } }] }],
  [/^Minn meg på å betale husleia den 1\. hver måned$/, { intent: 'schedule_create', calls: [{ tool: 'schedule.create', args: { what: 'betale husleia', when: 'den 1. hver måned' } }] }],
  [/^Si fra hvis strømprisen går over 3 kr i morgen$/, { intent: 'schedule_create', calls: [{ tool: 'schedule.create', args: { what: 'strømprisen', when: 'i morgen', condition: 'strømprisen går over 3 kr' } }] }],
  [/^Si fra hvis strømprisen går over 2 kr i morgen$/, { intent: 'schedule_create', calls: [{ tool: 'schedule.create', args: { what: 'strømprisen i morgen', when: 'i morgen', condition: 'strømprisen går over 2 kr' } }] }],
  [/^Hver fredag kl\. 16: oppsummer hva jeg har brukt penger på denne uka$/, { intent: 'schedule_create', calls: [{ tool: 'schedule.create', args: { what: 'oppsummer hva jeg har brukt penger på denne uka', when: 'hver fredag kl. 16' } }] }],
  [/^Gi meg værmeldingen for Toten hver fredag kl\. 15 i vinter$/, { intent: 'schedule_create', calls: [{ tool: 'schedule.create', args: { what: 'værmeldingen for Toten', when: 'hver fredag kl. 15 i vinter' } }] }],
  [/^Hvilke faste oppgaver har jeg\?$/, { intent: 'schedule_list', calls: [{ tool: 'schedule.list', args: {} }] }],
  [/^Stopp strømprisvarselet$/, { intent: 'schedule_delete', calls: [{ tool: 'schedule.delete', args: { target: 'strømprisvarselet' } }] }],
  [/^Flytt morgenbriefen til 06:30$/, { intent: 'schedule_update', calls: [{ tool: 'schedule.update', args: { target: 'morgenbriefen', when: '06:30', action: 'move' } }] }],
  [/^Hvordan er været i Oslo i dag\?$/, { intent: 'weather', calls: [{ tool: 'weather.get', args: { place: 'Oslo', when: 'i dag' } }] }],
  [/^Hvor mye har jeg brukt denne uka\?$/, { intent: 'finance_query', calls: [{ tool: 'finance.summary', args: { period: 'denne uka', group_by: 'total' } }] }],
];
P._setGlimtModel45(async (o) => {
  const text = /Melding: (.*)/.exec(o.prompt)[1];
  seen.push({ text, background: !!o.background, step: o.step, system: o.system });
  for (const [re, v] of PLANS) if (re.test(text)) return { data: { needs_clarification: false, clarification_question: null, ...v }, model: 'test-planner' };
  return { data: { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }, model: 'test-planner' };
});
E._setAnswerModel47(async () => ({ text: 'Greit.', model: 'test-answer' }));
const W = await import('../server/glimt45/weather46.js');
W._setWeather46(async (name) => ({ place: { name, label: name, tz: 'Europe/Oslo' }, now: { temp: 7, cond: 'Skyet', wind: 3 }, source: 'test', days: [0, 1, 2].map((i) => ({ date: D.addDays45('2026-10-24', i), hi: 9 - i * 6, lo: 3 - i * 6, cond: 'Skyet', precipProb: 10 })) }));
const pushed = [];
let PRICES = null; // [24 kr/kWh]
const powerCalls = [];
RUN._setSchedData62({
  notify: async (user, msg) => { pushed.push({ user, ...msg }); return { id: pushed.length, realtime: 1, pushed: 1 }; },
  power: async ({ zone, when, now }) => {
    powerCalls.push({ zone, when });
    if (!PRICES) throw Object.assign(new Error('Prisene for i morgen er ikke publisert ennå'), { notYet: true });
    return { zone, date: when === 'tomorrow' ? '2026-10-25' : '2026-10-24', hours: PRICES.map((kr, hour) => ({ hour, ore: kr * 100 })), source: 'test', vat: true };
  },
});
const curve = (max) => Array.from({ length: 24 }, (_, h) => (h === 8 ? max : h === 3 ? 0.42 : 1.1));

/* ---------------- 1. Gjentakelse → RRULE ---------------- */

test('gjentakelse: norsk tekst → RRULE (RFC 5545) med Europe/Oslo, etikett og første kjøring', () => {
  const P0 = (s) => D.parseRecurrence62(s, { now: NOW, today: '2026-10-24' });
  const cases = [
    ['hver morgen kl. 7', 'FREQ=DAILY;BYHOUR=7;BYMINUTE=0', 'Hver dag kl. 07:00', '2026-10-25T07:00', true],
    ['hver morgen kl 6', 'FREQ=DAILY;BYHOUR=6;BYMINUTE=0', 'Hver dag kl. 06:00', '2026-10-25T06:00', true],
    ['hver hverdag', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=0', 'Hver hverdag (man–fre) kl. 08:00', '2026-10-26T08:00', false],
    ['den 1. hver måned', 'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=8;BYMINUTE=0', 'Den 1. hver måned kl. 08:00', '2026-11-01T08:00', false],
    ['annenhver tirsdag kl 18', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;BYHOUR=18;BYMINUTE=0', 'Annenhver tirsdag kl. 18:00', '2026-10-27T18:00', true],
    ['hver fredag kl. 15 i vinter', 'FREQ=WEEKLY;BYDAY=FR;BYHOUR=15;BYMINUTE=0;UNTIL=20270228T225959Z', 'Hver fredag kl. 15:00 fram til 28. februar 2027', '2026-10-30T15:00', true],
    ['hver kveld i 2 uker', 'FREQ=DAILY;BYHOUR=20;BYMINUTE=0;UNTIL=20261107T225959Z', 'Hver dag kl. 20:00 fram til 7. november', '2026-10-24T20:00', false],
    ['første mandag i hver måned', 'FREQ=MONTHLY;BYDAY=1MO;BYHOUR=8;BYMINUTE=0', 'Første mandag i hver måned kl. 08:00', '2026-11-02T08:00', false],
    ['siste dag i måneden kl 9', 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=9;BYMINUTE=0', 'Siste dag i hver måned kl. 09:00', '2026-10-31T09:00', true],
    ['hvert år 17. mai', 'FREQ=YEARLY;BYMONTHDAY=17;BYMONTH=5;BYHOUR=8;BYMINUTE=0', 'Hvert år 17. mai kl. 08:00', '2027-05-17T08:00', false],
    ['hver mandag og torsdag kl 12', 'FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=12;BYMINUTE=0', 'Hver mandag og torsdag kl. 12:00', '2026-10-26T12:00', true],
    ['på hverdager kl 7:15 fra 2. november', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=15', 'Hver hverdag (man–fre) kl. 07:15', '2026-11-02T07:15', true],
    ['hver dag fram til 1. desember', 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;UNTIL=20261201T225959Z', 'Hver dag kl. 08:00 fram til 1. desember', '2026-10-25T08:00', false],
    ['i morgen kl 9', null, 'Søndag 25. oktober kl. 09:00', '2026-10-25T09:00', true],
    ['kl 06:30', null, 'Søndag 25. oktober kl. 06:30', '2026-10-25T06:30', true],
  ];
  for (const [s, rrule, label, dtstart, explicit] of cases) {
    const r = P0(s);
    assert.ok(r.ok, `${s}: ${r.error}`);
    assert.deepEqual([r.when.rrule, r.when.label, r.when.dtstart, r.when.explicitTime, r.when.tz], [rrule, label, dtstart, explicit, 'Europe/Oslo'], s);
  }
  // «annenhver tirsdag»: fasen fra første tirsdag (27.10), så hver andre.
  const ah = P0('annenhver tirsdag kl 18');
  assert.deepEqual(D.nextRuns62(ah.rule, NOW, 3).map(oslo), ['2026-10-27 18:00', '2026-11-10 18:00', '2026-11-24 18:00']);
  // Sluttdato: ingen kjøring etter 28.02.2027.
  const v = P0('hver fredag kl. 15 i vinter');
  const all = D.nextRuns62(v.rule, NOW, 30);
  assert.equal(oslo(all.at(-1)), '2027-02-26 15:00');
  assert.equal(all.length, 18);
  assert.match(v.when.ical, /^DTSTART;TZID=Europe\/Oslo:20261030T150000\nRRULE:FREQ=WEEKLY;BYDAY=FR;BYHOUR=15;BYMINUTE=0;UNTIL=20270228T225959Z$/);
  // Feil gir et spørsmål, aldri en gjetning.
  for (const s of ['hver time', 'en gang', '']) { const r = P0(s); assert.equal(r.ok, false, s); assert.ok(r.question || r.error, s); }
  assert.equal(P0('i går kl 9').ok, false);
  // RRULE fram og tilbake (lagret form → regel → samme RRULE).
  for (const [s] of cases.filter((c) => c[1])) { const r = P0(s); const back = D.parseRRule62(r.when.rrule, r.when.dtstart); assert.equal(D.ruleToRRule62(back), r.when.rrule, s); }
  assert.equal(D.parseRRule62('FREQ=SECONDLY;BYHOUR=1', '2026-10-24'), null, 'ukjent FREQ avvises');
  assert.equal(D.parseRRule62('FREQ=DAILY;BYSETPOS=1;BYHOUR=1', '2026-10-24'), null, 'ukjente deler avvises');
});

test('sommertid: neste kjøring regnes i Europe/Oslo over skiftet 25.10.2026 og 29.03.2026', () => {
  const at = (s, now) => D.parseRecurrence62(s, { now, today: D.osloParts62(now).date });
  // Høst: 07:00 lokal er 05:00Z før og 06:00Z etter.
  const r7 = at('hver dag kl 07:00', NOW);
  assert.deepEqual(D.nextRuns62(r7.rule, NOW, 3).map((t) => new Date(t).toISOString()), ['2026-10-25T06:00:00.000Z', '2026-10-26T06:00:00.000Z', '2026-10-27T06:00:00.000Z']);
  const sat5 = Date.parse('2026-10-24T05:00:00+02:00');
  assert.equal(new Date(D.nextRun62(at('hver dag kl 07:00', sat5).rule, sat5)).toISOString(), '2026-10-24T05:00:00.000Z', 'lørdag 24.10 er fortsatt sommertid');
  // 02:30 finnes to ganger natt til 25.10 → første forekomst (sommertid, 00:30Z), deretter vintertid.
  const r230 = at('hver dag kl 02:30', NOW);
  assert.deepEqual(D.nextRuns62(r230.rule, NOW, 2).map((t) => new Date(t).toISOString()), ['2026-10-25T00:30:00.000Z', '2026-10-26T01:30:00.000Z']);
  assert.equal(new Date(D.osloToUtc62('2026-10-25', '02:30')).toISOString(), '2026-10-25T00:30:00.000Z');
  // Vår: 02:30 finnes ikke natt til 29.03.2026 → 03:30 sommertid (01:30Z), dagen etter 02:30 = 00:30Z.
  const mar = Date.parse('2026-03-27T12:00:00+01:00');
  const m230 = at('hver dag kl 02:30', mar);
  assert.deepEqual(D.nextRuns62(m230.rule, mar, 3).map((t) => new Date(t).toISOString()), ['2026-03-28T01:30:00.000Z', '2026-03-29T01:30:00.000Z', '2026-03-30T00:30:00.000Z']);
  assert.equal(oslo(D.nextRuns62(m230.rule, mar, 2)[1]), '2026-03-29 03:30');
  const m7 = at('hver morgen kl. 7', mar);
  assert.deepEqual(D.nextRuns62(m7.rule, mar, 3).map((t) => new Date(t).toISOString()), ['2026-03-28T06:00:00.000Z', '2026-03-29T05:00:00.000Z', '2026-03-30T05:00:00.000Z']);
  // Ukentlig over skiftet: fredag 15:00 hver uke er alltid 15:00 lokal.
  const f = at('hver søndag kl 15', NOW);
  assert.deepEqual(D.nextRuns62(f.rule, NOW, 2).map(oslo), ['2026-10-25 15:00', '2026-11-01 15:00']);
  // Stille timer: 23–07 → 07:00 (samme eller neste dag).
  assert.equal(oslo(D.afterQuiet62(Date.parse('2026-10-24T23:30:00+02:00'))), '2026-10-25 07:00');
  assert.equal(oslo(D.afterQuiet62(Date.parse('2026-10-25T05:10:00+01:00'))), '2026-10-25 07:00');
  assert.equal(D.quiet62(Date.parse('2026-10-25T07:00:00+01:00')), false);
});

/* ---------------- 2. Betingelser i kode ---------------- */

test('uttrykksspråket: parser og evaluerer trygt (ingen eval av fri tekst), norsk tekst → uttrykk', () => {
  assert.deepEqual(C.evalCondition62('max(price_nok_kwh) > 2.0', { price_nok_kwh: [1, 2.31, 0.5] }).met, true);
  assert.deepEqual(C.evalCondition62('max(price_nok_kwh) > 2.0', { price_nok_kwh: [1, 1.9] }).met, false);
  assert.equal(C.evalCondition62('min(temp_c) < -5 and max(precip_mm) > 1', { temp_c: [-7, 1], precip_mm: [3] }).met, true);
  assert.equal(C.evalCondition62('(min(temp_c) < -5) or avg(price_nok_kwh) >= 1,5', { temp_c: [0], price_nok_kwh: [1.5, 1.5] }).met, true);
  assert.deepEqual(C.evalCondition62('max(price_nok_kwh) > 2', {}).missing, ['price_nok_kwh'], 'mangler data → ikke oppfylt');
  for (const bad of ['process.exit(1)', 'max(price_nok_kwh) > 2; rm', 'max(secret) > 1', 'eval(price_nok_kwh) > 1', 'max(price_nok_kwh) >', '1 > 0', 'max(price_nok_kwh) > 2 and', 'constructor > 1', `max(price_nok_kwh) > 2 ${'or max(price_nok_kwh) > 2 '.repeat(20)}`]) {
    assert.throws(() => C.parseExpr62(bad), Error, bad);
  }
  const p = (s) => C.parseCondition62(s, { zoneOf: () => null });
  assert.deepEqual([p('Si fra hvis strømprisen går over 2 kr i morgen').expr, p('Si fra hvis strømprisen går over 2 kr i morgen').day], ['max(price_nok_kwh) > 2', 'tomorrow']);
  assert.equal(p('si fra hvis strømmen blir billigere enn 50 øre').expr, 'min(price_nok_kwh) < 0.5');
  assert.equal(p('varsle meg hvis temperaturen går under minus 10 grader i morgen').expr, 'min(temp_c) < -10');
  assert.equal(p('si fra om det blir minusgrader i natt').expr, 'min(temp_c) < 0');
  assert.equal(p('gi beskjed hvis det blir regn i morgen').expr, 'max(precip_mm) > 0.5');
  assert.equal(p('Send meg strømprisene hver morgen'), null);
});

/* ---------------- 3. Glimt: bekreftelse før lagring, liste, stopp, flytt ---------------- */

test('«Send meg strømprisene hver morgen kl. 7» → bekreftelse med tolkningen, ingenting lagret før «ja», så RRULE daglig 07:00 Europe/Oslo', async () => {
  reset();
  const r = await agent('Send meg strømprisene hver morgen kl. 7');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.reply, 'Hver dag kl. 07:00 sender jeg deg strømprisene for i dag (NO1) med billigste og dyreste time. Stemmer det?');
  assert.ok(r.body.confirm?.token);
  const act = r.body.actions[0];
  assert.deepEqual([act.tool, act.status, act.args.kind, act.args.when.rrule, act.args.when.tz, act.args.params.zone], ['schedule.create', 'needs_confirm', 'power', 'FREQ=DAILY;BYHOUR=7;BYMINUTE=0', 'Europe/Oslo', 'NO1']);
  assert.deepEqual(act.args.nextRuns.map((x) => oslo(Date.parse(x))), ['2026-10-25 07:00', '2026-10-26 07:00', '2026-10-27 07:00']);
  assert.equal(rows().length, 0, 'ingenting lagret før bekreftelsen');
  const c = await confirm(r.body.confirm.token);
  assert.equal(c.status, 200, c.text);
  assert.match(c.body.reply, /^Lagret\. Hver dag kl\. 07:00 sender jeg deg strømprisene/);
  assert.match(c.body.reply, /Første gang i morgen 07:00/);
  const [row] = rows();
  assert.deepEqual([row.rrule, row.dtstart, row.tz, row.kind, row.status, row.explicit_time], ['FREQ=DAILY;BYHOUR=7;BYMINUTE=0', '2026-10-25T07:00', 'Europe/Oslo', 'power', 'active', 1]);
  assert.equal(new Date(row.next_run_at).toISOString(), '2026-10-25T06:00:00.000Z', '07:00 vintertid søndag');
  assert.equal(c.body.actions[0].result.schedule.id, row.id);
  // Planleggeren fikk intentene og verktøyet i systemprompten (fast prefiks).
  assert.match(seen.at(-1).system, /schedule_create\|schedule_list\|schedule_update\|schedule_delete/);
  assert.match(seen.at(-1).system, /schedule\.create \{what, when, condition\}/);
});

test('husleie → månedlig dag 1 (påminnelse); fredag-oppsummering (privat) og Toten-vær i vinter → query med sluttdato', async () => {
  reset();
  const h = await agent('Minn meg på å betale husleia den 1. hver måned');
  assert.equal(h.body.reply, 'Den 1. hver måned kl. 08:00 minner jeg deg på å betale husleia. Stemmer det?');
  await confirm(h.body.confirm.token);
  const f = await agent('Hver fredag kl. 16: oppsummer hva jeg har brukt penger på denne uka');
  assert.match(f.body.reply, /^Hver fredag kl\. 16:00 gjør jeg dette og sender deg svaret: «Oppsummer hva jeg har brukt penger på denne uka»\. Svaret lages lokalt og vises bare i appen\. Stemmer det\?$/);
  await confirm(f.body.confirm.token);
  const v = await agent('Gi meg værmeldingen for Toten hver fredag kl. 15 i vinter');
  assert.match(v.body.reply, /Hver fredag kl\. 15:00 fram til 28\. februar 2027/);
  await confirm(v.body.confirm.token);
  const [hu, fr, to] = rows();
  assert.deepEqual([hu.kind, hu.what, hu.rrule, hu.title], ['reminder', 'betale husleia', 'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=8;BYMINUTE=0', 'Betale husleia']);
  assert.deepEqual([fr.kind, fr.private, fr.rrule], ['query', 1, 'FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=0']);
  assert.deepEqual([to.kind, to.what, to.until], ['query', 'værmeldingen for Toten', '2027-02-28']);
  // Samme oppgave igjen → ikke en kopi.
  const again = await agent('Minn meg på å betale husleia den 1. hver måned');
  assert.match(again.body.reply, /allerede denne faste oppgaven/);
  assert.equal(rows().length, 3);
});

test('«Si fra hvis strømprisen går over 2 kr i morgen» → betinget jobb med uttrykket i kode; kjøringen sjekker i kode med falske data, modellen vurderer aldri', async () => {
  reset();
  const r = await agent('Si fra hvis strømprisen går over 2 kr i morgen');
  assert.equal(r.body.reply, 'Lørdag 24. oktober kl. 13:30 sjekker jeg strømprisene for i morgen (NO1) og sier fra hvis høyeste strømpris er over 2,00 kr/kWh. Stemmer det?');
  await confirm(r.body.confirm.token);
  const [row] = rows();
  const cond = JSON.parse(row.condition);
  assert.deepEqual([cond.expr, cond.source, cond.day, row.rrule, row.title], ['max(price_nok_kwh) > 2', 'power', 'tomorrow', null, 'Strømprisvarsel']);
  assert.equal(oslo(row.next_run_at), '2026-10-24 13:30');
  const plannerBefore = seen.length;
  // Prisene ikke publisert ennå (13:30) → nytt forsøk om 30 min.
  PRICES = null; pushed.length = 0;
  let t = await SC.tick62(row.next_run_at);
  assert.equal(t.ran, 1);
  assert.equal(runsOf(row.id)[0].status, 'failed');
  let r2 = ST.rowOf62(ME, row.id);
  assert.deepEqual([r2.status, oslo(r2.next_run_at)], ['active', '2026-10-24 14:00']);
  // 14:00: makspris 2,31 kr → varsel med tall fra dataene (ingen modell).
  PRICES = curve(2.31);
  t = await SC.tick62(r2.next_run_at);
  const last = runsOf(row.id).at(-1);
  assert.equal(last.status, 'ok');
  assert.deepEqual(JSON.parse(last.condition).met, true);
  assert.equal(JSON.parse(last.condition).value, 2.31);
  assert.match(last.result, /^Strømprisen i morgen \(NO1\) går opp i 2,31 kr\/kWh kl\. 08–09 – over grensen på 2,00 kr\./);
  assert.equal(pushed.length, 1);
  assert.deepEqual([pushed[0].title, pushed[0].category, pushed[0].tag], ['Strømprisvarsel', 'planlagt', `sched-${row.id}`]);
  assert.equal(seen.length, plannerBefore, 'ingen modellkall under kjøringen');
  r2 = ST.rowOf62(ME, row.id);
  assert.equal(r2.status, 'ended', 'enkeltkjøring ferdig');
  // Ikke oppfylt → condition_false og ingen push.
  pushed.length = 0;
  const id2 = ST.insertSchedule62(ME, { title: 'Strømprisvarsel', what: 'strømprisene', kind: 'power', when: { text: 'hver dag', rule: { ...D.parseRecurrence62('hver dag kl 13:30', { now: NOW }).rule }, explicitTime: true }, condition: cond, params: { zone: 'NO1', day: 'tomorrow' } }, { now: NOW }).id;
  PRICES = curve(1.95);
  const rn = await A(`/api/glimt/schedules/${id2}/run-now`, 'POST');
  assert.equal(rn.status, 200, rn.text);
  assert.deepEqual([rn.body.run.status, rn.body.run.condition.met, rn.body.run.condition.value, rn.body.run.delivery], ['condition_false', false, 1.95, null]);
  assert.equal(pushed.length, 0);
  // Betingede varsler av → hoppes over (logget).
  SET._setSched62({ conditions: false });
  const rs = await A(`/api/glimt/schedules/${id2}/run-now`, 'POST');
  assert.deepEqual([rs.body.run.status, rs.body.run.reason], ['skipped', 'Betingede varsler er slått av']);
  const off = await agent('Si fra hvis strømprisen går over 3 kr i morgen');
  assert.equal(off.body.confirm, undefined);
  assert.match(off.body.reply, /Betingede varsler er slått av/);
  SET._setSched62(null);
});

test('«Hvilke faste oppgaver har jeg?» → liste fra databasen (med briefene); «Stopp strømprisvarselet» → riktig jobb stoppes etter bekreftelse', async () => {
  reset();
  for (const s of ['Send meg strømprisene hver morgen kl. 7', 'Si fra hvis strømprisen går over 2 kr i morgen', 'Minn meg på å betale husleia den 1. hver måned']) { const r = await agent(s); await confirm(r.body.confirm.token); }
  const l = await agent('Hvilke faste oppgaver har jeg?');
  assert.equal(l.status, 200);
  assert.equal(l.body.confirm, undefined, 'lesekall uten bekreftelse');
  assert.match(l.body.reply, /^Du har 3 faste oppgaver: /);
  for (const w of ['Strømprisvarsel', 'Strømpriser (hver dag kl. 07:00)', 'Betale husleia (den 1. hver måned kl. 08:00)', 'morgenbrief kl. 06:45']) assert.ok(l.body.reply.includes(w), w);
  assert.equal(l.body.results.filter((x) => x.kind === 'schedule').length, 3 + 2);
  const varsel = rows().find((r) => r.condition);
  const s = await agent('Stopp strømprisvarselet');
  assert.ok(s.body.confirm?.token);
  assert.match(s.body.reply, /^Stoppe «Strømprisvarsel»/);
  assert.equal(s.body.actions[0].args.id, varsel.id);
  assert.ok(rows().every((r) => r.status === 'active'), 'ingenting endret før «ja»');
  const c = await confirm(s.body.confirm.token);
  assert.match(c.body.reply, /Stoppet «Strømprisvarsel»/);
  const after = rows();
  assert.equal(after.find((r) => r.id === varsel.id).status, 'paused');
  assert.equal(after.find((r) => r.id === varsel.id).next_run_at, null);
  assert.ok(after.filter((r) => r.id !== varsel.id).every((r) => r.status === 'active'), 'de andre er urørt');
});

test('«Flytt morgenbriefen til 06:30» endrer den eksisterende brief-innstillingen (ingen duplikat), etter bekreftelse', async () => {
  reset();
  assert.equal(G35.glimtSettingsOf(ME).briefs.morning.at, '06:45');
  const r = await agent('Flytt morgenbriefen til 06:30');
  assert.equal(r.body.reply, 'Flytte morgenbriefen fra kl. 06:45 til kl. 06:30? Stemmer det?');
  assert.equal(G35.glimtSettingsOf(ME).briefs.morning.at, '06:45', 'ingenting før «ja»');
  const c = await confirm(r.body.confirm.token);
  assert.equal(c.body.reply, 'Morgenbriefen kommer nå kl. 06:30.');
  assert.equal(G35.glimtSettingsOf(ME).briefs.morning.at, '06:30');
  assert.equal(rows().length, 0, 'ingen ny planlagt oppgave');
  const { windowsOf } = await import('../server/brief34.js');
  assert.ok(windowsOf(ME).some(([k, h, m]) => k === 'morning' && h === 6 && m === 30), 'brief-planleggeren bruker det nye tidspunktet');
  const l = await A('/api/glimt/schedules');
  assert.equal(l.body.builtin.find((b) => b.id === 'brief:morning').at, '06:30');
});

test('modellen nede: den lokale planen kjenner igjen planlagte oppgaver (og bekrefter fortsatt)', async () => {
  reset();
  P._setGlimtModel45(null); // MOCK_DATA → lokal plan
  try {
    const r = await agent('Minn meg på å vanne blomstene hver søndag kl 18');
    assert.equal(r.body.engine, 'lokal');
    assert.equal(r.body.reply, 'Hver søndag kl. 18:00 minner jeg deg på å vanne blomstene. Stemmer det?');
    await confirm(r.body.confirm.token);
    const l = await agent('Hvilke faste oppgaver har jeg?');
    assert.match(l.body.reply, /Du har 1 fast oppgave: Vanne blomstene/);
    const n = await agent('Minn meg på å kjøpe melk i morgen');
    assert.equal(n.body.actions?.[0]?.tool, 'tasks.create', 'uten gjentakelse er det et vanlig gjøremål');
  } finally {
    P._setGlimtModel45(async (o) => {
      const text = /Melding: (.*)/.exec(o.prompt)[1];
      seen.push({ text, background: !!o.background, step: o.step, system: o.system });
      for (const [re, v] of PLANS) if (re.test(text)) return { data: { needs_clarification: false, clarification_question: null, ...v }, model: 'test-planner' };
      return { data: { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }, model: 'test-planner' };
    });
  }
});

/* ---------------- 4. Scheduler ---------------- */

test('scheduler: forhåndsberegning 15 min før, levering på minuttet, neste kjøring, tapt < 2 t kjøres én gang, eldre logges, overlever «omstart»', async () => {
  reset(); pushed.length = 0; powerCalls.length = 0;
  PRICES = curve(1.4);
  const r = await agent('Send meg strømprisene hver morgen kl. 7');
  await confirm(r.body.confirm.token);
  const [row] = rows();
  const due = row.next_run_at; // søndag 25.10 07:00 (06:00Z)
  // 06:40: ingenting. 06:46: forhåndsberegnet (henter prisene), ingen push.
  assert.deepEqual(await SC.tick62(due - 20 * 60_000).then((x) => [x.due, x.prepared]), [0, 0]);
  assert.deepEqual(await SC.tick62(due - 14 * 60_000).then((x) => [x.due, x.prepared]), [0, 1]);
  assert.equal(powerCalls.length, 1);
  assert.equal(pushed.length, 0);
  // 07:00: levert fra forhåndsberegningen, neste = mandag 07:00.
  const t = await SC.tick62(due);
  assert.equal(t.ran, 1);
  assert.equal(powerCalls.length, 1, 'brukte forhåndsberegningen');
  assert.equal(pushed.length, 1);
  assert.match(pushed[0].body, /^Strømprisen i NO1 i dag: snitt .* Billigste time kl\. 03–04 \(0,42 kr\), dyreste kl\. 08–09 \(1,40 kr\)\./);
  const run1 = runsOf(row.id)[0];
  assert.deepEqual([run1.status, run1.trigger, run1.reason, JSON.parse(run1.delivery).delivered], ['ok', 'schedule', 'Forhåndsberegnet', true]);
  let r2 = ST.rowOf62(ME, row.id);
  assert.equal(oslo(r2.next_run_at), '2026-10-26 07:00');
  // Samme tikk igjen kjører ikke på nytt.
  assert.equal((await SC.tick62(due + 30_000)).ran, 0);
  // «Omstart»: serveren var nede 06:30–08:30 mandag → kjøres én gang kl. 08:30 (1,5 t sent).
  SC._prepared62().clear();
  const mon = r2.next_run_at;
  const t2 = await SC.tick62(mon + 90 * 60_000);
  assert.equal(t2.ran, 1);
  assert.equal(runsOf(row.id).at(-1).trigger, 'catchup');
  r2 = ST.rowOf62(ME, row.id);
  assert.equal(oslo(r2.next_run_at), '2026-10-27 07:00');
  // Nede i tre døgn: tirsdag–torsdag 07:00 er over 2 t sent → logges som tapt; fredag 08:00 kjøres (1 t sent).
  const n0 = runsOf(row.id).length;
  const fri8 = Date.parse('2026-10-30T08:00:00+01:00');
  const t3 = await SC.tick62(fri8);
  assert.deepEqual([t3.ran, t3.missed], [1, 3]);
  const newer = runsOf(row.id).slice(n0);
  assert.deepEqual(newer.map((x) => [oslo(x.planned_at), x.status]), [['2026-10-27 07:00', 'missed'], ['2026-10-28 07:00', 'missed'], ['2026-10-29 07:00', 'missed'], ['2026-10-30 07:00', 'ok']]);
  assert.match(newer[0].reason, /Over 2 timer for sent/);
  assert.equal(oslo(ST.rowOf62(ME, row.id).next_run_at), '2026-10-31 07:00');
  // Nede over 2 t etter siste forekomst og ingen innenfor: bare logget, ingen kjøring.
  const t4 = await SC.tick62(Date.parse('2026-10-31T09:30:00+01:00'));
  assert.deepEqual([t4.ran, t4.missed], [0, 1]);
  // «Kjører»-rader fra før en omstart merkes som avbrutt.
  db.prepare("INSERT INTO glimt_schedule_runs(id, schedule_id, user_id, planned_at, started_at, status) VALUES('kstale0000000001', ?, ?, ?, ?, 'running')").run(row.id, ME, NOW, NOW);
  await SC.tick62(NOW + 3600_000);
  assert.equal(db.prepare("SELECT status FROM glimt_schedule_runs WHERE id='kstale0000000001'").pluck().get(), 'failed');
});

test('scheduler: stille timer 23–07 uten eget klokkeslett, enkeltkjøring blir ferdig, planlagte oppgaver av = ingen kjøring', async () => {
  reset(); pushed.length = 0;
  const rule = { freq: 'DAILY', interval: 1, byday: [], bymonthday: [], bymonth: [], dtstart: '2026-10-24', time: '23:30', until: null };
  const q1 = ST.insertSchedule62(ME, { title: 'Sen', what: 'sjekk noe', kind: 'reminder', when: { text: 'hver natt', rule, explicitTime: false } }, { now: NOW });
  assert.equal(oslo(q1.next_run_at), '2026-10-25 07:00', 'uten klokkeslett → flyttet til 07:00');
  const q2 = ST.insertSchedule62(ME, { title: 'Sen eksplisitt', what: 'sjekk noe', kind: 'reminder', when: { text: 'hver dag kl 23:30', rule, explicitTime: true } }, { now: NOW });
  assert.equal(oslo(q2.next_run_at), '2026-10-24 23:30', 'bedt om klokkeslettet → gjelder');
  SET._setSched62({ quiet: false });
  const q3 = ST.insertSchedule62(ME, { title: 'Sen uten stille', what: 'x', kind: 'reminder', when: { text: 'x', rule, explicitTime: false } }, { now: NOW, quiet: SET.sched62(ME).quiet });
  assert.equal(oslo(q3.next_run_at), '2026-10-24 23:30');
  SET._setSched62(null);
  // Påminnelse leveres som den er.
  const once = ST.insertSchedule62(ME, { title: 'Ring mamma', what: 'ringe mamma', kind: 'reminder', when: { text: 'i dag kl 12', rule: { ...rule, freq: null, time: '12:00' }, explicitTime: true } }, { now: NOW });
  await SC.tick62(once.next_run_at);
  assert.equal(pushed.at(-1).body, 'Påminnelse: Ringe mamma.');
  assert.equal(ST.rowOf62(ME, once.id).status, 'ended');
  // Av (serveren): tikket kjører ingenting.
  kv.set(OWNER, 'sched62', { enabled: false });
  const before = db.prepare('SELECT COUNT(*) FROM glimt_schedule_runs').pluck().get();
  await SC.tick62(q2.next_run_at + 60_000);
  assert.equal(db.prepare('SELECT COUNT(*) FROM glimt_schedule_runs').pluck().get(), before);
  const g = await agent('Send meg strømprisene hver morgen kl. 7');
  assert.match(g.body.reply, /Planlagte oppgaver er slått av/);
  assert.equal(g.body.confirm, undefined);
  kv.set(OWNER, 'sched62', {});
});

test('kjøring av en vanlig Glimt-forespørsel: bakgrunnsprioritet i planleggeren, svaret som push; finans → generell push-tekst', async () => {
  reset(); pushed.length = 0;
  const r = await agent('Gi meg værmeldingen for Toten hver fredag kl. 15 i vinter');
  await confirm(r.body.confirm.token);
  const [row] = rows();
  const n0 = seen.length;
  const rn = await A(`/api/glimt/schedules/${row.id}/run-now`, 'POST');
  assert.equal(rn.status, 200, rn.text);
  assert.equal(rn.body.run.status, 'ok', JSON.stringify(rn.body.run));
  assert.equal(rn.body.run.trigger, 'run-now');
  const planned = seen.slice(n0);
  assert.ok(planned.length >= 1 && planned.every((x) => x.background), `planleggeren fikk bakgrunnsprioritet: ${JSON.stringify(planned.map((x) => [x.text, x.background]))}`);
  assert.equal(planned[0].text, 'værmeldingen for Toten');
  assert.ok(pushed.at(-1).body.length > 5);
  assert.ok(rn.body.run.traceId);
  // Finans: svaret lages lokalt; push-teksten sier bare at det er klart.
  RUN._setSchedData62({ agent: async (user, text, o) => ({ reply: 'Du har brukt 2 191,10 kr denne uka.', actions: [{ tool: 'finance.summary', status: 'done' }], module: 'finance', traceId: 't123', _o: o }) });
  const f = ST.insertSchedule62(ME, { title: 'Ukesoppsummering', what: 'oppsummer hva jeg har brukt penger på denne uka', kind: 'query', when: { text: 'hver fredag kl 16', rule: D.parseRecurrence62('hver fredag kl 16', { now: NOW }).rule, explicitTime: true } }, { now: NOW });
  const fr = await A(`/api/glimt/schedules/${f.id}/run-now`, 'POST');
  assert.equal(fr.body.run.result, 'Du har brukt 2 191,10 kr denne uka.', 'detaljene i appen (kjøringsloggen)');
  assert.equal(pushed.at(-1).body, 'Ukesoppsummering: oppsummeringen er klar – åpne appen for å se den.');
  assert.equal(fr.body.run.delivery.private, true);
  // En planlagt oppgave kan aldri lage/endre planlagte oppgaver eller gjøre endringer uten bekreftelse.
  RUN._setSchedData62({ agent: async () => ({ reply: 'Stemmer det?', confirm: { token: 'cx' }, actions: [{ tool: 'calendar.delete', status: 'needs_confirm' }] }) });
  const bad = await A(`/api/glimt/schedules/${f.id}/run-now`, 'POST');
  assert.deepEqual([bad.body.run.status, /bekrefter/.test(bad.body.run.error)], ['failed', true]);
  RUN._setSchedData62({ agent: null });
});

/* ---------------- 5. API ---------------- */

test('API /api/glimt/schedules: liste, tolk, opprett, endre, pause, kjøringer, kjør nå, slett, briefer, innstillinger, feil', async () => {
  reset(); pushed.length = 0;
  assert.equal((await req('/api/glimt/schedules')).status, 401);
  const pr = await A('/api/glimt/schedules/parse', 'POST', { when: 'annenhver tirsdag kl 18', what: 'ta ut søpla' });
  assert.equal(pr.status, 200, pr.text);
  assert.deepEqual([pr.body.when.rrule, pr.body.when.label, pr.body.kind, pr.body.nextRuns.length], ['FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;BYHOUR=18;BYMINUTE=0', 'Annenhver tirsdag kl. 18:00', 'reminder', 3]);
  assert.equal(rows().length, 0, 'parse lagrer ingenting');
  assert.equal((await A('/api/glimt/schedules/parse', 'POST', { when: 'hver time' })).status, 400);
  const c = await A('/api/glimt/schedules', 'POST', { what: 'betale husleia', when: 'den 1. hver måned', kind: 'reminder', title: 'Husleie' });
  assert.equal(c.status, 201, c.text);
  const it = c.body.item;
  assert.deepEqual([it.title, it.kind, it.when.rrule, it.status, it.source, it.nextRuns.length, it.lastRun], ['Husleie', 'reminder', 'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=8;BYMINUTE=0', 'active', 'api', 3, null]);
  assert.match(it.id, /^s[0-9a-f]{14}$/);
  for (const bad of [{ when: 'hver dag' }, { what: 'x y', when: '' }, { what: 'test', when: 'hver dag', kind: 'magi' }, { what: 'test', when: 'hver dag', zone: 'NO9' }, { what: 'test', when: 'hver dag', channel: 'sms' }]) assert.equal((await A('/api/glimt/schedules', 'POST', bad)).status, 400, JSON.stringify(bad));
  const p1 = await A(`/api/glimt/schedules/${it.id}`, 'PATCH', { when: 'den 15. hver måned kl 9' });
  assert.equal(p1.status, 200, p1.text);
  assert.deepEqual([p1.body.item.when.rrule, oslo(Date.parse(p1.body.item.nextRunAt))], ['FREQ=MONTHLY;BYMONTHDAY=15;BYHOUR=9;BYMINUTE=0', '2026-11-15 09:00']);
  const p2 = await A(`/api/glimt/schedules/${it.id}`, 'PATCH', { status: 'paused' });
  assert.deepEqual([p2.body.item.status, p2.body.item.nextRunAt, p2.body.item.nextRuns], ['paused', null, []]);
  const p3 = await A(`/api/glimt/schedules/${it.id}`, 'PATCH', { status: 'active', title: 'Husleia' });
  assert.deepEqual([p3.body.item.status, p3.body.item.title], ['active', 'Husleia']);
  assert.equal((await A(`/api/glimt/schedules/${it.id}`, 'PATCH', { status: 'ended' })).status, 400);
  const rn = await A(`/api/glimt/schedules/${it.id}/run-now`, 'POST');
  assert.deepEqual([rn.status, rn.body.run.status, rn.body.run.result, rn.body.item.lastRun.id], [200, 'ok', 'Påminnelse: Betale husleia.', rn.body.run.id]);
  const runs = await A(`/api/glimt/schedules/${it.id}/runs?limit=5`);
  assert.equal(runs.body.items.length, 1);
  assert.equal((await A(`/api/glimt/schedules/${it.id}/runs?limit=500`)).status, 400);
  const one = await A(`/api/glimt/schedules/${it.id}`);
  assert.deepEqual([one.body.item.id, one.body.runs.length], [it.id, 1]);
  const list = await A('/api/glimt/schedules');
  assert.deepEqual([list.body.items.length, list.body.counts.active, list.body.enabled, list.body.builtin.length], [1, 1, true, 4]);
  // Briefen: PATCH brief:evening.
  const b = await A('/api/glimt/schedules/brief:evening', 'PATCH', { at: '19:15' });
  assert.deepEqual([b.status, b.body.item.at], [200, '19:15']);
  assert.equal(G35.glimtSettingsOf(ME).briefs.evening.at, '19:15');
  assert.equal((await A('/api/glimt/schedules/brief:evening', 'PATCH', { at: '25:00' })).status, 400);
  // Innstillinger.
  const s0 = await A('/api/glimt/schedules/settings');
  assert.deepEqual([s0.body.settings, s0.body.zone, Object.keys(s0.body.labels)], [{ enabled: true, conditions: true, quiet: true }, 'NO1', ['enabled', 'conditions', 'quiet']]);
  const s1 = await A('/api/glimt/schedules/settings', 'PUT', { scope: 'user', conditions: false, zone: 'NO5' });
  assert.deepEqual([s1.status, s1.body.settings.conditions, s1.body.zone], [200, false, 'NO5']);
  assert.equal((await A('/api/glimt/schedules/settings', 'PUT', { scope: 'user', zone: 'NO7' })).status, 400);
  assert.equal((await A('/api/glimt/schedules/settings', 'PUT', { scope: 'user', enabled: 'ja' })).status, 400);
  await A('/api/glimt/schedules/settings', 'PUT', { scope: 'user', conditions: null, zone: null });
  await A('/api/glimt/schedules/settings', 'PUT', { scope: 'user', enabled: false });
  assert.equal((await A('/api/glimt/schedules', 'POST', { what: 'test', when: 'hver dag' })).status, 409);
  assert.equal((await A(`/api/glimt/schedules/${it.id}/run-now`, 'POST')).status, 409);
  await A('/api/glimt/schedules/settings', 'PUT', { scope: 'user', enabled: null });
  // Slett og 404.
  assert.deepEqual((await A(`/api/glimt/schedules/${it.id}`, 'DELETE')).body, { ok: true, removed: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) FROM glimt_schedule_runs WHERE schedule_id=?').pluck().get(it.id), 0);
  for (const [m, p] of [['GET', `/api/glimt/schedules/${it.id}`], ['DELETE', `/api/glimt/schedules/${it.id}`], ['POST', `/api/glimt/schedules/${it.id}/run-now`], ['GET', '/api/glimt/schedules/nope/runs'], ['PATCH', '/api/glimt/schedules/s00000000000000']]) assert.equal((await A(p, m, m === 'PATCH' ? { title: 'xx' } : undefined)).status, 404, `${m} ${p}`);
});

test('mål: tvetydig «stopp varselet» med to varsler → valg (aldri en gjetning); valget stopper riktig', async () => {
  reset();
  const cond = (txt) => C.parseCondition62(txt, { zoneOf: () => null });
  const rule = D.parseRecurrence62('hver dag kl 13:30', { now: NOW }).rule;
  const a = ST.insertSchedule62(ME, { title: 'Strømprisvarsel', what: 'strømprisene', kind: 'power', when: { text: 'x', rule, explicitTime: true }, condition: { ...cond('strømprisen går over 2 kr'), day: 'tomorrow' }, params: { zone: 'NO1' } }, { now: NOW });
  const b = ST.insertSchedule62(ME, { title: 'Værvarsel', what: 'værmeldingen', kind: 'query', when: { text: 'x', rule, explicitTime: true }, condition: { ...cond('temperaturen går under -5'), day: 'tomorrow' } }, { now: NOW });
  const TT = await import('../server/sched62/tools.js');
  const amb = TT.resolveTarget62(ME, 'varselet', 'Stopp varselet', {}, 'stoppe');
  assert.ok(amb.ask);
  assert.equal(amb.ask.options.length, 2);
  assert.match(amb.ask.options[1].text, /«Værvarsel»/);
  assert.equal(TT.resolveTarget62(ME, '', amb.ask.options[1].text, {}, 'stoppe').row.id, b.id);
  assert.equal(TT.resolveTarget62(ME, 'strømprisvarselet', 'Stopp strømprisvarselet').row.id, a.id);
  assert.equal(TT.resolveTarget62(ME, '', 'stopp den', { context: { selectedId: `sch-${b.id}` } }).row.id, b.id);
  // whatOf62: tid og gjentakelse fjernes, resten beholdes (store bokstaver også).
  assert.equal(TK.whatOf62('Minn meg på å betale husleia den 1. hver måned', { reminder: true }), 'betale husleia');
  assert.equal(TK.whatOf62('Gi meg værmeldingen for Toten hver fredag kl. 15 i vinter'), 'værmeldingen for Toten');
});
