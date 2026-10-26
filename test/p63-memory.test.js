// Prompt 63 (prompt 49 del 5, D5SRV): minnet holder seg ryddig. Fryst klokke (natt til mandag 26.10.2026, vintertid):
// nattlig oppsummering som systemoppgave kl. 03 (synes i «Faste oppgaver», kan pauses, ikke slettes), forslag fra dagens samtaler,
// rettelser og nye kalenderhendelser (bare brukerens egne, forankret i teksten), ingenting i minnet uten ja (godkjenn / avvis / rediger),
// motstrid (samme subjekt ulik verdi, aliaskollisjon, mot entitetsregisteret) med valgene behold A / behold B / begge, «sist brukt»
// per faktum, markering av ubrukte fakta (slettes aldri automatisk), brytere, morgenvarsel og API-et.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p63-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p63';
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
const ST = await import('../server/mem63/store.js');
const EX = await import('../server/mem63/extract.js');
const NI = await import('../server/mem63/nightly.js');
const API = await import('../server/mem63/api.js');
const SC = await import('../server/sched62/scheduler.js');
const RUN = await import('../server/sched62/run.js');

const NOW = Date.parse('2026-10-26T03:00:00+01:00'); // mandag kl. 03:00 Europe/Oslo
const H = 3600_000, DAY = 24 * H;
API._setClock63(NOW);
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
const OTHER = 'u-annen-p63';

let tn = 0;
const trace = (user, message, at = NOW - 2 * H) => db.prepare('INSERT INTO glimt47_trace(id, user_id, created, data) VALUES(?,?,?,?)').run(`t63x${++tn}`, user, at, JSON.stringify({ id: `t63x${tn}`, user, message }));
const memory = () => db.prepare('SELECT * FROM glimt_memory WHERE user_id=? ORDER BY id').all(ME);
let EVENTS = {};
const modelCalls = [];
let MODEL = null; // (prompt, snippets) → {facts}
EX._setSources63({ calendar: async (user) => EVENTS[user] ?? [], model: async (prompt, list) => { modelCalls.push({ prompt, n: list.length }); return MODEL ? MODEL(prompt, list) : { facts: [] }; } });
const pushed = [];
NI._setNotify63(async (user, msg) => { pushed.push({ user, ...msg }); return { id: pushed.length, pushed: 1 }; });
RUN._setSchedData62({ notify: async (user, msg) => { pushed.push({ user, sched: true, ...msg }); return { id: pushed.length, pushed: 1 }; } });
const reset = () => {
  for (const t of ['glimt_memory_pending', 'glimt_memory_conflicts', 'glimt47_trace', 'glimt_memory', 'glimt60_convo', 'recipe_runs', 'glimt_schedules', 'glimt_schedule_runs']) db.prepare(`DELETE FROM ${t}`).run();
  for (const u of [ME, OTHER]) for (const k of ['mem63_seen_events', 'mem63_last', 'mem63_push', 'mem63_user', 'entities60_alias', 'wx_places']) kv.set(u, k, null);
  EVENTS = {}; MODEL = null; modelCalls.length = 0; pushed.length = 0;
};
const runNow = () => A('/api/glimt/memory/hygiene/run-now', 'POST');

/* ---------------- 1. Forslag fra en samtale – ingenting lagres uten ja ---------------- */

test('forslag fra dagens samtale blir pending – ingenting i minnet før godkjenning; andre brukeres data aldri med', async () => {
  reset();
  trace(ME, 'Jeg skal på middag med Kari, søsteren min, på fredag');
  trace(ME, 'Hvordan blir været i morgen?');
  trace(ME, 'Gammelt: Ola er naboen min', NOW - 3 * DAY); // eldre enn ett døgn: ikke med
  trace(OTHER, 'Per er broren min'); // en annen bruker
  const r = await runNow();
  assert.equal(r.status, 200);
  assert.equal(r.body.run.status, 'ok');
  assert.equal(r.body.run.proposals, 1);
  assert.deepEqual(r.body.run.sources, { messages: 2, corrections: 0, events: 0 });
  const p = await A('/api/glimt/memory/pending');
  assert.equal(p.status, 200);
  assert.equal(p.body.items.length, 1);
  const it = p.body.items[0];
  assert.match(it.id, /^p[0-9a-f]{14}$/);
  assert.deepEqual([it.status, it.subject, it.object, it.kind, it.source, it.sentence], ['pending', 'Kari', 'søsteren min', 'fact', 'conversation', 'Kari er søsteren din']);
  assert.match(it.evidence[0].text, /Kari, søsteren min/);
  assert.equal(memory().length, 0, 'ingenting i minnet uten ja');
  // Den andre brukerens data er aldri med – verken i forslag eller i modellens prompt.
  assert.ok(!JSON.stringify(p.body).includes('Per'));
  assert.ok(modelCalls.every((c) => !c.prompt.includes('Per er broren')));
  assert.ok(!modelCalls.some((c) => c.prompt.includes('Ola')), 'bare siste døgn');
  // Samme kjøring igjen: ingen duplikat.
  await runNow();
  assert.equal((await A('/api/glimt/memory/pending')).body.items.length, 1);

  // Rediger før godkjenning → godkjenn → i minnet.
  const e = await A(`/api/glimt/memory/pending/${it.id}/edit`, 'POST', { object: 'lillesøsteren min', aliases: ['søsteren'] });
  assert.equal(e.status, 200);
  assert.deepEqual([e.body.item.object, e.body.item.edited, e.body.item.status, e.body.item.aliases], ['lillesøsteren min', true, 'pending', ['søsteren']]);
  assert.equal(memory().length, 0, 'redigering lagrer ikke i minnet');
  const ap = await A(`/api/glimt/memory/pending/${it.id}/approve`, 'POST');
  assert.equal(ap.status, 200);
  assert.equal(ap.body.item.status, 'approved');
  const m = memory();
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].match, m[0].kind, m[0].note], ['kari', 'fact', 'lillesøsteren min']);
  assert.ok(JSON.parse(m[0].aliases).includes('søsteren'));
  assert.equal(ap.body.memory.id, m[0].id);
  assert.equal((await A(`/api/glimt/memory/pending/${it.id}/approve`, 'POST')).status, 409, 'allerede avgjort');
  // Neste natt: kjent – foreslås ikke igjen.
  await runNow();
  assert.equal((await A('/api/glimt/memory/pending')).body.items.length, 0);
});

test('avvist forslag foreslås aldri igjen; godkjenning med redigering i samme trykk', async () => {
  reset();
  trace(ME, 'Nina er frisøren min, og min kollega Jonas kommer også');
  await runNow();
  const items = (await A('/api/glimt/memory/pending')).body.items;
  const nina = items.find((x) => x.subject === 'Nina'), jonas = items.find((x) => x.subject === 'Jonas');
  assert.ok(nina && jonas, JSON.stringify(items.map((x) => x.sentence)));
  assert.deepEqual([nina.kind, nina.type, nina.sentence], ['alias', 'frisør', 'Nina er frisøren din']);
  assert.equal(jonas.object, 'min kollega');
  const rj = await A(`/api/glimt/memory/pending/${jonas.id}/reject`, 'POST');
  assert.deepEqual([rj.status, rj.body.item.status], [200, 'rejected']);
  const ap = await A(`/api/glimt/memory/pending/${nina.id}/approve`, 'POST', { subject: 'Nina Hoff' });
  assert.equal(ap.status, 200);
  assert.deepEqual(memory().map((x) => [x.match, x.kind, x.type]), [['nina hoff', 'alias', 'frisør']]);
  await runNow();
  const again = (await A('/api/glimt/memory/pending?status=all')).body.items;
  assert.equal(again.filter((x) => x.subject === 'Jonas').length, 1, 'ikke foreslått på nytt');
  assert.equal(memory().length, 1, 'avvist = aldri i minnet');
  assert.equal((await A('/api/glimt/memory/pending?status=rejected')).body.items.length, 1);
  assert.equal((await A('/api/glimt/memory/pending/pffffffffffffff/approve', 'POST')).status, 404);
  assert.equal((await A('/api/glimt/memory/pending/ugyldig/approve', 'POST')).status, 404);
  assert.equal((await A(`/api/glimt/memory/pending/${nina.id}/edit`, 'POST', { subject: 'x' })).status, 409);
});

test('kilder: rettelser fra del 1, samtaletilstand og nye kalenderhendelser; modellforslag må stå i teksten', async () => {
  reset();
  db.prepare("INSERT INTO recipe_runs(id, user_id, created, text, use, state) VALUES('r63a', ?, ?, 'nei, jeg mente middagen med Liv, svigermora mi', 'none', 'done')").run(ME, NOW - 5 * H);
  db.prepare('INSERT INTO glimt60_convo(user_id, conv_id, kind, state, updated) VALUES(?,?,?,?,?)').run(ME, 'chat-1', 'chat', JSON.stringify({ turns: [{ u: 'Bjørn er treneren min', a: 'Ok' }] }), NOW - H);
  EVENTS[ME] = [{ id: 'loc-e1', title: 'Tannlege hos Per Olsen', date: '2026-10-28', created: new Date(NOW - 3 * H).toISOString() }, { id: 'loc-gml', title: 'Frisør hos Eva', date: '2026-10-29', created: new Date(NOW - 30 * DAY).toISOString() }];
  EVENTS[OTHER] = [{ id: 'loc-x', title: 'Frisør hos Trude', created: new Date(NOW - H).toISOString() }];
  // Modellen foreslår noe som står i teksten (godtas) og noe som ikke gjør det (forkastes).
  MODEL = (prompt, list) => ({ facts: [{ subject: 'Bjørn', object: 'treneren min', source: list.findIndex((s) => /Bjørn/.test(s.text)) + 1 }, { subject: 'Bjørn', object: 'onkelen min', source: 1 }, { subject: 'Ukjent', object: 'sjefen min', source: 1 }] });
  const r = await runNow();
  assert.equal(r.body.run.sources.corrections, 1);
  assert.equal(r.body.run.sources.events, 1, 'første kjøring: bare hendelser laget siste døgn');
  assert.equal(r.body.run.model, 'test');
  const items = (await A('/api/glimt/memory/pending')).body.items;
  const by = Object.fromEntries(items.map((x) => [x.subject, x]));
  assert.deepEqual(Object.keys(by).sort(), ['Bjørn', 'Liv', 'Per Olsen']);
  assert.equal(by.Liv.source, 'correction');
  assert.equal(by['Per Olsen'].source, 'calendar');
  assert.deepEqual([by['Per Olsen'].kind, by['Per Olsen'].type], ['alias', 'tannlege']);
  assert.equal(by.Bjørn.object, 'treneren min');
  assert.ok(!items.some((x) => /onkel|sjef/.test(x.object)), 'gjetninger forkastes');
  assert.ok(!JSON.stringify(items).includes('Trude'), 'andre brukeres kalender aldri med');
  // Hendelsen er sett: neste natt ingen ny kilde.
  EVENTS[ME].push({ id: 'loc-e2', title: 'Fysio hos Siri', date: '2026-11-01' });
  const r2 = await runNow();
  assert.equal(r2.body.run.sources.events, 1, 'bare den nye');
});

/* ---------------- 2. Motstrid ---------------- */

test('motstrid: samme subjekt med ulik verdi oppdages, godkjenning stoppes, behold B/A/begge', async () => {
  reset();
  assert.equal((await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Nina', type: 'frisør' })).status, 201);
  trace(ME, 'Nina er tannlegen min');
  const r = await runNow();
  assert.equal(r.body.run.conflicts, 1);
  const p = (await A('/api/glimt/memory/pending')).body.items[0];
  assert.match(p.conflictId, /^c[0-9a-f]{14}$/);
  const ap = await A(`/api/glimt/memory/pending/${p.id}/approve`, 'POST');
  assert.equal(ap.status, 409);
  assert.equal(ap.body.conflictId, p.conflictId);
  const cs = (await A('/api/glimt/memory/conflicts')).body;
  assert.equal(cs.items.length, 1);
  const c = cs.items[0];
  assert.deepEqual([c.kind, c.status, c.a.label, c.b.label, c.a.ref.type, c.b.ref.type], ['value', 'open', 'Nina er frisøren din', 'Nina er tannlegen din', 'memory', 'pending']);
  assert.deepEqual(c.choices.map((x) => x.id), ['keep_a', 'keep_b', 'both']);
  assert.match(c.question, /Nina/);
  assert.equal(memory()[0].type, 'frisør', 'ingenting endret før valget');
  assert.equal((await A(`/api/glimt/memory/conflicts/${c.id}/resolve`, 'POST', { choice: 'tull' })).status, 400);
  const rs = await A(`/api/glimt/memory/conflicts/${c.id}/resolve`, 'POST', { choice: 'keep_b' });
  assert.deepEqual([rs.status, rs.body.item.status, rs.body.item.resolution], [200, 'resolved', 'keep_b']);
  assert.deepEqual(memory().map((x) => [x.match, x.type]), [['nina', 'tannlege']]);
  assert.equal((await A('/api/glimt/memory/pending?status=approved')).body.items.length, 1);
  assert.equal((await A(`/api/glimt/memory/conflicts/${c.id}/resolve`, 'POST', { choice: 'keep_a' })).status, 409);
  // Spørres ikke igjen.
  await runNow();
  assert.equal((await A('/api/glimt/memory/conflicts')).body.items.length, 0);

  // Behold A: forslaget avvises, minnet urørt.
  reset();
  await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Nina', type: 'frisør' });
  trace(ME, 'Nina er legen min');
  await runNow();
  const c2 = (await A('/api/glimt/memory/conflicts')).body.items[0];
  await A(`/api/glimt/memory/conflicts/${c2.id}/resolve`, 'POST', { choice: 'keep_a' });
  assert.deepEqual(memory().map((x) => x.type), ['frisør']);
  assert.equal((await A('/api/glimt/memory/pending?status=rejected')).body.items.length, 1);

  // Begge: to rader.
  reset();
  await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Nina', type: 'frisør' });
  trace(ME, 'Nina er fysioterapeuten min');
  await runNow();
  const c3 = (await A('/api/glimt/memory/conflicts')).body.items[0];
  await A(`/api/glimt/memory/conflicts/${c3.id}/resolve`, 'POST', { choice: 'both' });
  assert.deepEqual(memory().map((x) => x.type).sort(), ['frisør', 'fysio']);
  await runNow();
  assert.equal((await A('/api/glimt/memory/conflicts')).body.items.length, 0, '«begge» spørres ikke igjen');
});

test('motstrid: aliaskollisjon og mot entitetsregisteret', async () => {
  reset();
  await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Nina', type: 'frisør' });
  await A('/api/glimt/memory', 'POST', { kind: 'fact', match: 'Hoff', note: 'butikken på hjørnet' });
  const nina = memory().find((x) => x.match === 'nina');
  db.prepare('UPDATE glimt_memory SET aliases=? WHERE id=?').run(JSON.stringify(['frisør', 'klipp', 'hoff']), nina.id); // «hoff» er også et annet navn
  // Registeret: Vær-stedet Sjusjøen med eget alias «hytta».
  kv.set(ME, 'wx_places', [{ id: 'sj', name: 'Sjusjøen', lat: 61.0, lon: 10.7 }]);
  kv.set(ME, 'entities60_alias', { 'wx:sj': ['hytta'] });
  trace(ME, 'Hytta er på Toten, husk det');
  MODEL = (prompt, list) => ({ facts: [{ subject: 'Hytta', object: 'på Toten', source: list.findIndex((s) => /Hytta/.test(s.text)) + 1 }] });
  const r = await runNow();
  assert.equal(r.body.run.status, 'ok');
  const cs = (await A('/api/glimt/memory/conflicts')).body.items;
  const al = cs.find((x) => x.kind === 'alias'), en = cs.find((x) => x.kind === 'entity');
  assert.ok(al, JSON.stringify(cs.map((x) => x.kind)));
  assert.equal(al.a.alias, 'hoff');
  assert.ok(en, 'mot registeret');
  assert.deepEqual([en.a.ref.type, en.b.ref.type, en.a.subject], ['entity', 'pending', 'Sjusjøen']);
  assert.ok(!cs.some((x) => x.kind === 'alias' && /klipp|frisør/.test(x.a.alias)), 'typesynonymene teller ikke');
  // Behold B for aliaset: fjernes fra Nina.
  await A(`/api/glimt/memory/conflicts/${al.id}/resolve`, 'POST', { choice: 'keep_b' });
  assert.ok(!JSON.parse(memory().find((x) => x.match === 'nina').aliases).includes('hoff'));
  // Behold A (registeret): forslaget avvises, ingenting i minnet.
  await A(`/api/glimt/memory/conflicts/${en.id}/resolve`, 'POST', { choice: 'keep_a' });
  assert.ok(!memory().some((x) => x.match === 'hytta'));
  assert.equal((await A('/api/glimt/memory/conflicts')).body.items.length, 0);
});

/* ---------------- 3. Sist brukt og ubrukte fakta ---------------- */

test('ubrukt faktum markeres (> 90 dager), slettes aldri automatisk; «behold» og «sist brukt»', async () => {
  reset();
  await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Gammel', type: 'lege' });
  await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Fersk', type: 'tannlege' });
  const [g, f] = memory();
  db.prepare('UPDATE glimt_memory SET created=?, used_at=? WHERE id=?').run(NOW - 200 * DAY, NOW - 120 * DAY, g.id);
  db.prepare('UPDATE glimt_memory SET created=?, used_at=? WHERE id=?').run(NOW - 200 * DAY, NOW - 10 * DAY, f.id);
  const s = await A('/api/glimt/memory/stale');
  assert.equal(s.status, 200);
  assert.equal(s.body.staleDays, 90);
  assert.deepEqual(s.body.items.map((x) => [x.id, x.subject, x.daysUnused]), [[g.id, 'Gammel', 120]]);
  assert.equal(s.body.items[0].lastUsedAt, new Date(NOW - 120 * DAY).toISOString());
  const run = await runNow();
  assert.equal(run.body.run.stale, 1);
  // Nattjobben (flere ganger) sletter aldri.
  await SC.tick62(NOW + 1);
  assert.equal(memory().length, 2, 'aldri slettet automatisk');
  const list = (await A('/api/glimt/memory')).body.items;
  assert.equal(list.find((x) => x.id === g.id).stale, true);
  assert.equal(list.find((x) => x.id === f.id).stale, false);
  assert.ok('lastUsedAt' in list[0] && 'keptAt' in list[0]);
  // Behold: merket borte.
  const k = await A(`/api/glimt/memory/stale/${g.id}/keep`, 'POST');
  assert.deepEqual([k.status, k.body.keptAt], [200, new Date(NOW).toISOString()]);
  assert.equal((await A('/api/glimt/memory/stale')).body.items.length, 0);
  assert.equal((await A('/api/glimt/memory/stale/999999/keep', 'POST')).status, 404);
  // Slett bare når brukeren trykker (den eksisterende ruten).
  assert.equal((await A(`/api/glimt/memory/${g.id}`, 'DELETE')).status, 200);
  assert.equal(memory().length, 1);
  // Egen grense.
  await A('/api/glimt/memory/hygiene', 'PUT', { staleDays: 30 });
  assert.equal((await A('/api/glimt/memory/stale')).body.items.length, 0);
  db.prepare('UPDATE glimt_memory SET used_at=? WHERE id=?').run(NOW - 40 * DAY, f.id);
  assert.equal((await A('/api/glimt/memory/stale')).body.items.length, 1);
  assert.equal((await A('/api/glimt/memory/hygiene', 'PUT', { staleDays: 5 })).status, 400);
});

test('«sist brukt» settes når minnet brukes i konteksten/planleggeren', async () => {
  reset();
  await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Nina', type: 'frisør' });
  const id = memory()[0].id;
  assert.equal(memory()[0].used_at, null);
  assert.equal(ST.touchFacts63(ME, [{ id }, { id: `m${id}` }, { id: 'zone:3' }], NOW), 1);
  assert.equal(memory()[0].used_at, NOW);
  assert.equal(ST.touchFacts63(OTHER, [{ id }], NOW + 5), 0, 'aldri en annen brukers rad');
  db.prepare('UPDATE glimt_memory SET used_at=NULL').run();
  const r = await A('/api/glimt/agent', 'POST', { text: 'Når skal jeg til Nina neste gang?', module: 'home', requestId: 'p63-touch-1' });
  assert.equal(r.status, 200);
  assert.ok(memory()[0].used_at > 0, 'satt av motoren');
});

/* ---------------- 4. Systemoppgaven, scheduleren, push og brytere ---------------- */

test('systemoppgaven kl. 03: synes i «Faste oppgaver», kan pauses, ikke slettes; kjøres av scheduleren uten push kl. 03, push om morgenen', async () => {
  reset();
  API._setClock63(NOW - H); // opprettet kl. 02:00 – første kjøring i natt kl. 03:00
  const h = await A('/api/glimt/memory/hygiene');
  API._setClock63(NOW);
  assert.equal(h.status, 200);
  assert.deepEqual(h.body.settings, { nightly: true, conflicts: true, stale: true });
  const sid = h.body.schedule.id;
  assert.match(sid, /^s[0-9a-f]{14}$/);
  const list = (await A('/api/glimt/schedules')).body.items;
  const sys = list.find((x) => x.id === sid);
  assert.ok(sys, 'synes i Faste oppgaver');
  assert.deepEqual([sys.system, sys.kind, sys.when.rrule, sys.when.tz, sys.when.explicitTime, sys.title], [true, 'memory', 'FREQ=DAILY;BYHOUR=3;BYMINUTE=0', 'Europe/Oslo', true, 'Nattlig oppsummering av minnet']);
  assert.ok(list.filter((x) => x.id !== sid).every((x) => x.system === false));
  assert.equal(sys.nextRunAt, new Date(NOW).toISOString(), 'kl. 03:00 (stille timer gjelder ikke)');
  // Ikke slettes, ikke endres – bare pause.
  assert.equal((await A(`/api/glimt/schedules/${sid}`, 'DELETE')).status, 400);
  assert.equal((await A(`/api/glimt/schedules/${sid}`, 'PATCH', { when: 'hver dag kl 5' })).status, 400);
  // Kjøring kl. 03 via scheduleren.
  trace(ME, 'Hilde er naboen min');
  const t = await SC.tick62(NOW);
  assert.equal(t.ran, 1);
  const run = db.prepare('SELECT * FROM glimt_schedule_runs WHERE schedule_id=?').get(sid);
  assert.equal(run.status, 'ok');
  assert.equal(run.delivery, null, 'ingen levering kl. 03');
  assert.match(run.result, /1 nytt forslag/);
  assert.equal(pushed.length, 0);
  assert.equal((await A('/api/glimt/memory/pending')).body.items.length, 1);
  assert.equal(NI.lastRun63(ME).proposals, 1);
  // Morgenvarselet: ikke før kl. 07, så én gang.
  assert.equal(await NI.morningPush63(ME, NOW + 2 * H), null);
  const mp = await NI.morningPush63(ME, NOW + 4 * H + 5 * 60_000);
  assert.ok(mp?.pushed);
  assert.equal(pushed.length, 1);
  assert.deepEqual([pushed[0].body, pushed[0].category, pushed[0].data.kind, pushed[0].data.pending, pushed[0].url], ['Glimt har 1 forslag til minnet', 'ai', 'memory.pending', 1, NI.PUSH_URL63]);
  assert.equal(await NI.morningPush63(ME, NOW + 5 * H), null, 'bare én gang');
  assert.equal(NI.pushText63(3, 0), 'Glimt har 3 forslag til minnet');
  // Neste natt: allerede planlagt.
  const row = db.prepare('SELECT * FROM glimt_schedules WHERE id=?').get(sid);
  assert.equal(row.next_run_at, Date.parse('2026-10-27T03:00:00+01:00'));
  // Pause: kjøres ikke, og settes aldri på igjen automatisk.
  const pa = await A(`/api/glimt/schedules/${sid}`, 'PATCH', { status: 'paused' });
  assert.deepEqual([pa.status, pa.body.item.status, pa.body.item.summary], [200, 'paused', sys.summary]);
  assert.equal((await SC.tick62(Date.parse('2026-10-27T03:00:00+01:00'))).ran, 0);
  await A('/api/glimt/memory/hygiene');
  assert.equal(db.prepare('SELECT status FROM glimt_schedules WHERE id=?').pluck().get(sid), 'paused');
  assert.equal(db.prepare("SELECT COUNT(*) FROM glimt_schedules WHERE user_id=? AND source='system'").pluck().get(ME), 1, 'aldri en duplikat');
  assert.equal((await A(`/api/glimt/schedules/${sid}`, 'PATCH', { status: 'active' })).status, 200);
});

test('brytere: nattlig oppsummering / motstrid / markering av – hver for seg', async () => {
  reset();
  await A('/api/glimt/memory', 'POST', { kind: 'alias', match: 'Nina', type: 'frisør' });
  db.prepare('UPDATE glimt_memory SET created=? WHERE user_id=?').run(NOW - 200 * DAY, ME);
  trace(ME, 'Nina er tannlegen min. Kari er søsteren min');
  const put = await A('/api/glimt/memory/hygiene', 'PUT', { nightly: false });
  assert.deepEqual([put.status, put.body.settings.nightly, put.body.user.nightly], [200, false, false]);
  let r = await runNow();
  assert.equal(r.body.run.proposals, 0, 'nattlig av = ingen forslag');
  assert.equal(r.body.run.stale, 1);
  await A('/api/glimt/memory/hygiene', 'PUT', { nightly: null, conflicts: false, stale: false });
  r = await runNow();
  assert.equal(r.body.run.proposals, 2);
  assert.equal((await A('/api/glimt/memory/conflicts')).body.items.length, 0, 'motstrid av');
  assert.equal((await A('/api/glimt/memory/stale')).body.items.length, 0, 'markering av');
  assert.equal((await A('/api/glimt/memory/stale')).body.enabled, false);
  await A('/api/glimt/memory/hygiene', 'PUT', { nightly: false });
  r = await runNow();
  assert.deepEqual([r.body.run.status, r.body.run.reason], ['skipped', 'Alt for «minnet holder seg ryddig» er slått av']);
  // Serveren (admin) kan slå av for alle.
  await A('/api/glimt/memory/hygiene', 'PUT', { nightly: null, conflicts: null, stale: null });
  const sv = await A('/api/glimt/memory/hygiene', 'PUT', { scope: 'server', nightly: false });
  assert.equal(sv.status, 200);
  assert.equal(sv.body.settings.nightly, false);
  await A('/api/glimt/memory/hygiene', 'PUT', { scope: 'server', nightly: true });
  assert.equal((await A('/api/glimt/memory/hygiene', 'PUT', { nightly: 'ja' })).status, 400);
  assert.equal((await A('/api/glimt/memory/hygiene', 'PUT', { scope: 'tull' })).status, 400);
  assert.deepEqual(Object.keys((await A('/api/glimt/memory/hygiene')).body.counts), ['pending', 'conflicts', 'stale']);
});

test('API: uten innlogging 401, ukjente id-er 404, statusfilter', async () => {
  assert.equal((await req('/api/glimt/memory/pending')).status, 401);
  assert.equal((await req('/api/glimt/memory/hygiene')).status, 401);
  assert.equal((await A('/api/glimt/memory/pending?status=tull')).status, 400);
  assert.equal((await A('/api/glimt/memory/conflicts?status=tull')).status, 400);
  assert.equal((await A('/api/glimt/memory/conflicts/cffffffffffffff/resolve', 'POST', { choice: 'both' })).status, 404);
  // De gamle «Glimt husker»-rutene virker som før.
  const r = await A('/api/glimt/memory');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.types));
});

test('mønstrene og forankringen', () => {
  const pf = (t) => EX.patternFacts63(t).map((x) => `${x.subject}=${x.object}`);
  assert.deepEqual(pf('Kari er søsteren min'), ['Kari=søsteren min']);
  assert.deepEqual(pf('middag med min bror Ola i kveld'), ['Ola=min bror']);
  assert.deepEqual(pf('Frisør hos Nina på torsdag'), ['Nina=frisøren min']);
  assert.deepEqual(pf('Jeg er glad min venn'), []);
  assert.deepEqual(pf('Det er sjefen min'), []);
  assert.equal(EX.grounded63('Kari er søsteren min', 'Kari', 'søsteren min'), true);
  assert.equal(EX.grounded63('Kari er søsteren min', 'Kari', 'kona mi'), false);
  assert.equal(EX.grounded63('Kari er søsteren min', 'Ola', 'søsteren min'), false);
});

test('uten testmodell: gaten (ai-run, mock) – mønstrene virker uansett, kjøringen feiler ikke', async () => {
  reset();
  EX._setSources63({ model: null });
  try {
    trace(ME, 'Torunn er kollegaen min');
    const r = await runNow();
    assert.equal(r.body.run.status, 'ok');
    assert.equal(r.body.run.proposals, 1);
    assert.equal(memory().length, 0);
  } finally { EX._setSources63({ model: async (prompt, list) => { modelCalls.push({ prompt, n: list.length }); return MODEL ? MODEL(prompt, list) : { facts: [] }; } }); }
});
