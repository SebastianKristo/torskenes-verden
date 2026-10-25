// Prompt 60 (prompt 49 del 3, D3SRV): bedre forståelse i samtaler. Samtaletilstand per samtale (conversationId, Chat/Hjem-søket),
// refers_to_previous fra planleggeren → koden fyller inn manglende argumenter («og i Bergen?», «flytt den til 11», «si opp det» med
// bekreftelse), entitetsregisteret (egne + avledede, aliaser, «hjemme»/«hytta»), oppfølgingsspørsmål med konkrete valg (choices) som
// forstår «den andre» og knappetrykk, innstillingene (hver for seg) og API-ene. Falsk planlegger (testkroken), falskt vær.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p60-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p60';
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
const E = await import('../server/glimt45/engine.js');
const P = await import('../server/glimt45/plan.js');
const P47 = await import('../server/glimt45/plan47.js');
const W = await import('../server/glimt45/weather46.js');
const ST = await import('../server/convo60/state.js');
const S60 = await import('../server/convo60/settings.js');
const EN = await import('../server/convo60/entities.js');

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
const RID = () => `t60-${String(++rid).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
const agent = (text, conversationId, extra = {}) => A('/api/glimt/agent', 'POST', { text, module: 'home', requestId: RID(), ...(conversationId ? { conversationId } : {}), ...extra });
const localEvents = () => kv.get(ME, 'kal_local_events', []) ?? [];

/* ---------------- Falsk planlegger ---------------- */

const seen = [];
let PLANS = [];
const BASE_PLANS = [
  [/^Hvordan er været i Oslo i morgen\?$/, { intent: 'weather', calls: [{ tool: 'weather.get', args: { place: 'Oslo', when: 'i morgen' } }] }],
  [/^Hvordan er været på hytta\?$/, { intent: 'weather', calls: [{ tool: 'weather.get', args: { place: 'hytta' } }] }],
  [/^og i Bergen\?$/, { intent: 'weather', calls: [{ tool: 'weather.get', args: { place: 'Bergen' } }], refers_to_previous: true }],
  [/^Legg inn tannlege fredag kl 10$/, { intent: 'calendar_create', calls: [{ tool: 'calendar.create', args: { title: 'Tannlege', date: 'fredag', time: 'kl 10' } }] }],
  [/^flytt den til 11$/, { intent: 'calendar_change', calls: [{ tool: 'calendar.update', args: { target: 'den', time: '11' } }], refers_to_previous: true }],
  [/^Hva er det dyreste abonnementet mitt\?$/, { intent: 'finance_query', calls: [{ tool: 'finance.subscriptions', args: { mode: 'top' } }] }],
  [/^si opp det$/, { intent: 'finance_query', calls: [{ tool: 'subscriptions.cancel', args: { service: 'det', subscription_id: '999' } }], refers_to_previous: true }],
  [/^Flytt Nina til lørdag$/, { intent: 'calendar_change', calls: [{ tool: 'calendar.update', args: { target: 'Nina', date: 'lørdag' } }] }],
];
P._setGlimtModel45(async ({ system, prompt, step }) => {
  const text = /Melding: (.*)/.exec(prompt)[1];
  seen.push({ text, system, prompt, step });
  const hit = [...PLANS, ...BASE_PLANS].find(([re]) => re.test(text));
  return { data: hit ? { needs_clarification: false, clarification_question: null, ...hit[1] } : { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }, model: 'test-planner' };
});
E._setAnswerModel47(async () => ({ text: 'Greit.', model: 'test-answer' }));

/* ---------------- Falskt vær ---------------- */

const wx = [];
const addD = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const WX = { Oslo: [7, 9, 8, 6, 5, 6, 7], Bergen: [10, 11, 12, 9, 8, 7, 6], Lena: [4, 5, 6, 3, 2, 3, 4] };
W._setWeather46(async (name, o = {}) => {
  wx.push({ name, at: o.at ?? null });
  const hi = WX[name] ?? (o.at ? WX.Lena : null);
  if (!hi) throw Object.assign(new Error(`Fant ikke stedet «${name}»`), { status: 404 });
  return { place: { name, label: name, tz: 'Europe/Oslo' }, now: { temp: hi[0], cond: 'Skyet', wind: 3 }, source: 'test', days: hi.map((h, i) => ({ date: addD('2026-10-24', i), hi: h, lo: h - 4, cond: 'Skyet', precipProb: 10 })) };
});

/* ---------------- 1. Samtaletilstand + refers_to_previous ---------------- */

test('vær: «og i Bergen?» etter «Hvordan er været i Oslo i morgen?» → Bergen, samme tidsrom (i morgen), followUp i svaret', async () => {
  const a = await agent('Hvordan er været i Oslo i morgen?', 'home-vaer0001');
  assert.equal(a.status, 200, a.text);
  assert.equal(a.body.conversationId, 'home-vaer0001');
  assert.deepEqual(a.body.actions.map((x) => [x.tool, x.args.place, x.args.when.from]), [['weather.get', 'Oslo', '2026-10-25']]);
  assert.equal(a.body.followUp, undefined, 'første spørsmål bygger ikke på noe');
  const b = await agent('og i Bergen?', 'home-vaer0001');
  assert.equal(b.status, 200, b.text);
  assert.deepEqual(b.body.actions.map((x) => [x.tool, x.status, x.args.place, x.args.when.from]), [['weather.get', 'done', 'Bergen', '2026-10-25']]);
  assert.equal(b.body.followUp.refersToPrevious, true);
  assert.equal(b.body.followUp.filled.when, 'i morgen');
  assert.equal(b.body.followUp.filled.place, null, 'stedet sto i meldingen');
  assert.match(b.body.reply, /Bergen/);
  // Planleggeren fikk tilstanden i den dynamiske delen (etter det faste prefikset), og regelen om refers_to_previous.
  const pl = seen.filter((x) => x.text === 'og i Bergen?').at(-1);
  assert.ok(pl.system.startsWith(P47.plannerSystem47()), 'samme faste prefiks');
  assert.match(pl.system.slice(P47.plannerSystem47().length), /Conversation state:\n.*Last weather: place Oslo, time i morgen/);
  assert.match(P47.plannerSystem47(), /refers_to_previous/);
  assert.ok(P47.planSchema47().properties.refers_to_previous, 'feltet finnes i JSON-skjemaet');
  // Sporet viser oppfølgingen.
  const t = (await A(`/api/glimt/agent/trace?id=${b.body.traceId}`)).body.trace;
  assert.equal(t.convo.conversationId, 'home-vaer0001');
  assert.equal(t.convo.refersToPrevious, true);
  assert.equal(t.convo.stateIn, true);
});

test('vær: tydelig oppfølging uten flagg fra modellen (prat) → koden ser «og i …» og tar værspørsmålet fra tilstanden', async () => {
  await agent('Hvordan er været i Oslo i morgen?', 'home-vaer0002');
  PLANS = [[/^og i Bergen\?$/, { intent: 'chat', calls: [{ tool: 'chat.answer', args: {} }] }]];
  try {
    const b = await agent('og i Bergen?', 'home-vaer0002');
    assert.deepEqual(b.body.actions.map((x) => [x.tool, x.args.place, x.args.when.from]), [['weather.get', 'Bergen', '2026-10-25']]);
  } finally { PLANS = []; }
});

test('samtalene er adskilt: «og i Bergen?» i en ny samtale har ingen tilstand → i dag, ingen followUp', async () => {
  const b = await agent('og i Bergen?', 'home-annen0001');
  assert.equal(b.status, 200, b.text);
  assert.deepEqual(b.body.actions.map((x) => [x.tool, x.args.place, x.args.when.from]), [['weather.get', 'Bergen', '2026-10-24']]);
  assert.equal(b.body.followUp, undefined);
});

test('kalender: «Legg inn tannlege fredag kl 10» → «flytt den til 11» flytter riktig avtale (samme dag, 11:00)', async () => {
  const a = await agent('Legg inn tannlege fredag kl 10', 'c-kal0001', { module: 'chat', conversationKind: 'chat' });
  assert.equal(a.status, 200, a.text);
  const ev = localEvents().find((e) => e.title === 'Tannlege' && e.date === '2026-10-30');
  assert.ok(ev && ev.start === '10:00', JSON.stringify(localEvents()));
  const b = await agent('flytt den til 11', 'c-kal0001', { module: 'chat', conversationKind: 'chat' });
  assert.equal(b.status, 200, b.text);
  assert.deepEqual(b.body.actions.map((x) => [x.tool, x.status]), [['calendar.update', 'done']], b.body.reply);
  const after = localEvents().find((e) => e.id === ev.id);
  assert.equal(after.date, '2026-10-30');
  assert.equal(after.start, '11:00');
  assert.equal(b.body.followUp.filled.event, 'Tannlege');
  const cv = await A('/api/glimt/agent/convo/c-kal0001');
  assert.equal(cv.status, 200);
  assert.equal(cv.body.kind, 'chat');
  assert.equal(cv.body.state.entities.event.title, 'Tannlege');
  assert.ok(cv.body.expiresAt - cv.body.updatedAt === ST.TTL60.chat, 'Chat-samtalen lever 12 t');
});

const subIns = db.prepare('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,created,user_id,active) VALUES(?,?,?,?,?,?,?,1) RETURNING id');
db.prepare('DELETE FROM fh_subscriptions WHERE user_id=?').run(ME); // eksempeldataene (MOCK_DATA) ut – faste testdata
const SUBS = {};
for (const [n, p, pr, cy] of [['Netflix', 'Standard', 14900, 'monthly'], ['Aftenposten Digital', 'Ukepris', 8900, 'weekly'], ['Spotify', 'Family', 23900, 'monthly']]) SUBS[n] = subIns.get(n, p, pr, cy, '2026-11-05', Date.now(), ME).id;
const activeOf = (id) => db.prepare('SELECT active FROM fh_subscriptions WHERE id=?').pluck().get(id);

test('abonnement: «si opp det» etter «dyreste abonnement» → bekreftelse med riktig abonnement, aldri utført før «ja»', async () => {
  const a = await agent('Hva er det dyreste abonnementet mitt?', 'home-sub00001');
  assert.equal(a.body.actions[0].result.ranked[0].name, 'Aftenposten Digital');
  const b = await agent('si opp det', 'home-sub00001');
  assert.equal(b.status, 200, b.text);
  assert.ok(b.body.confirm?.token, 'krever bekreftelse');
  assert.deepEqual(b.body.actions.map((x) => [x.tool, x.status, x.args.name]), [['subscriptions.cancel', 'needs_confirm', 'Aftenposten Digital']]);
  assert.match(b.body.reply, /Si opp \*\*Aftenposten Digital\*\*/);
  assert.equal(b.body.followUp.filled.subscription, 'Aftenposten Digital');
  assert.equal(activeOf(SUBS['Aftenposten Digital']), 1, 'ingenting er gjort ennå (modellens egen id 999 er ignorert)');
  const c = await A('/api/glimt/agent/confirm', 'POST', { token: b.body.confirm.token });
  assert.equal(c.status, 200, c.text);
  assert.match(c.body.reply, /Markerte \*\*Aftenposten Digital\*\* som sagt opp i Subscription OS/);
  assert.equal(activeOf(SUBS['Aftenposten Digital']), 0);
  assert.equal(activeOf(SUBS.Netflix), 1);
  db.prepare('UPDATE fh_subscriptions SET active=1 WHERE id=?').run(SUBS['Aftenposten Digital']);
});

test('abonnement: modellen velger avslutningsfrist (subscriptions.trial «det») → koden gjør det til oppsigelse med bekreftelse', async () => {
  await agent('Hva er det dyreste abonnementet mitt?', 'home-sub00002');
  PLANS = [[/^si opp det$/, { intent: 'todo', calls: [{ tool: 'subscriptions.trial', args: { service: 'det' } }] }]];
  try {
    const b = await agent('si opp det', 'home-sub00002');
    assert.deepEqual(b.body.actions.map((x) => [x.tool, x.status]), [['subscriptions.cancel', 'needs_confirm']]);
    assert.ok(b.body.confirm.token);
  } finally { PLANS = []; }
});

test('abonnement: «si opp det» uten tilstand → spør hvilket (valg), «den første» → fortsatt bekreftelse (aldri gjetning)', async () => {
  const b = await agent('si opp det', 'home-sub00003');
  assert.equal(b.status, 200, b.text);
  assert.equal(b.body.confirm, undefined);
  assert.equal(b.body.reply, 'Hvilket abonnement vil du si opp?');
  assert.equal(b.body.choices.items.length, 3);
  assert.deepEqual(b.body.choices.items.map((x) => x.label), ['Aftenposten Digital (Ukepris)', 'Netflix (Standard)', 'Spotify (Family)']);
  const c = await agent('den første', 'home-sub00003');
  assert.equal(c.status, 200, c.text);
  assert.ok(c.body.confirm?.token, 'valget gir bekreftelse, ikke oppsigelse');
  assert.equal(c.body.actions[0].args.name, 'Aftenposten Digital');
  assert.equal(activeOf(SUBS['Aftenposten Digital']), 1);
});

/* ---------------- 3. Valg (choices) ---------------- */

test('valg: to Nina-avtaler → «Mener du A eller B?» med knapper; «den andre» flytter middagen', async () => {
  for (const ev of [{ title: 'Frisør Nina', date: '2026-10-30', start: '14:00', end: '15:00' }, { title: 'Middag med Nina', date: '2026-10-30', start: '18:00', end: '20:00' }]) {
    const r = await A('/api/kalender/events', 'POST', { ...ev, allDay: false, calendar: 'privat' });
    assert.equal(r.status, 201, r.text);
  }
  const a = await agent('Flytt Nina til lørdag', 'home-valg0001');
  assert.equal(a.status, 200, a.text);
  const ch = a.body.choices;
  assert.ok(ch?.setId, JSON.stringify(a.body));
  assert.equal(ch.items.length, 2);
  assert.match(ch.question, /^Mener du «Frisør Nina · .*14:00» eller «Middag med Nina · .*18:00»\?$/);
  assert.equal(a.body.reply, ch.question);
  assert.ok(ch.items.every((x) => x.id && x.label && x.text), 'id, label og text');
  assert.ok(Date.parse(ch.expiresAt) > Date.now());
  assert.equal(a.body.ask.options.length, 2, 'det gamle feltet finnes fortsatt');
  const b = await agent('den andre', 'home-valg0001');
  assert.equal(b.status, 200, b.text);
  assert.deepEqual(b.body.actions.map((x) => [x.tool, x.status]), [['calendar.update', 'done']]);
  const mid = localEvents().find((e) => e.title === 'Middag med Nina');
  const fri = localEvents().find((e) => e.title === 'Frisør Nina');
  assert.equal(mid.date, '2026-10-31');
  assert.equal(mid.start, '18:00');
  assert.equal(fri.date, '2026-10-30', 'den andre avtalen er urørt');
  const t = (await A(`/api/glimt/agent/trace?id=${b.body.traceId}`)).body.trace;
  assert.equal(t.convo.choice.via, 'ordinal');
  assert.equal(b.body.choices, undefined, 'valget er brukt');
});

test('valg: knappetrykk {choice:{setId,id}} sender etiketten som tekst og flytter riktig avtale', async () => {
  const a = await agent('Flytt Nina til lørdag', 'home-valg0002');
  const ch = a.body.choices;
  const first = ch.items[0];
  const b = await agent(first.text, 'home-valg0002', { choice: { setId: ch.setId, id: first.id } });
  assert.equal(b.status, 200, b.text);
  assert.deepEqual(b.body.actions.map((x) => [x.tool, x.status]), [['calendar.update', 'done']]);
  assert.equal(localEvents().find((e) => e.title === 'Frisør Nina').date, '2026-10-31');
  const t = (await A(`/api/glimt/agent/trace?id=${b.body.traceId}`)).body.trace;
  assert.equal(t.convo.choice.via, 'button');
  // Ugyldig choice → 400
  const bad = await agent('x', 'home-valg0002', { choice: { setId: '!!', id: 1 } });
  assert.equal(bad.status, 400);
});

test('valg: matchChoice60 forstår ordenstall, «siste», et ord fra etiketten og ikke tilfeldig tekst', () => {
  const ch = { setId: 'chx', items: [{ id: '1', label: 'Frisør Nina · fre 30. okt 14:00', text: 'a' }, { id: '2', label: 'Middag med Nina · fre 30. okt 18:00', text: 'b' }] };
  const m = (t, c) => ST.matchChoice60(ch, t, c)?.item.id ?? null;
  assert.equal(m('den første'), '1');
  assert.equal(m('nr 2'), '2');
  assert.equal(m('den siste'), '2');
  assert.equal(m('middagen'), '2');
  assert.equal(m('frisøren'), '1');
  assert.equal(m('hva er været i morgen?'), null);
  assert.equal(m('x', { setId: 'chx', id: '2' }), '2');
  assert.equal(m('x', { setId: 'annet', id: '2' }), null, 'utløpt/annen valgliste');
});

/* ---------------- Innstillinger ---------------- */

test('innstillinger: GET/PUT /understand, hver for seg; state:false → ingen oppfølging; choices:false → ingen choices', async () => {
  const g = await A('/api/glimt/agent/understand');
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.settings, { state: true, entities: true, choices: true });
  assert.deepEqual(Object.keys(g.body.labels), ['state', 'entities', 'choices']);
  assert.equal(g.body.ttl.search, 30 * 60_000);
  assert.equal((await A('/api/glimt/agent/understand', 'PUT', { scope: 'user', state: 'ja' })).status, 400);
  let p = await A('/api/glimt/agent/understand', 'PUT', { scope: 'user', state: false, choices: false });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual(p.body.settings, { state: false, entities: true, choices: false });
  try {
    await agent('Hvordan er været i Oslo i morgen?', 'home-av000001');
    const b = await agent('og i Bergen?', 'home-av000001');
    assert.equal(b.body.actions[0].args.when.from, '2026-10-24', 'uten tilstand: i dag');
    assert.equal(b.body.followUp, undefined);
    const c = await agent('Flytt Nina til lørdag', 'home-av000002');
    assert.equal(c.body.choices, undefined);
    assert.ok(c.body.ask?.options?.length >= 2, 'som før');
  } finally {
    p = await A('/api/glimt/agent/understand', 'PUT', { scope: 'user', state: null, choices: null });
    assert.deepEqual(p.body.settings, { state: true, entities: true, choices: true });
  }
});

/* ---------------- 2. Entitetsregister ---------------- */

test('entiteter: egne steder med aliaser, personer fra «Glimt husker», Familie-steder med faste ord, abonnementer; redigering', async () => {
  const m = await A('/api/glimt/memory', 'POST', { match: 'Nina', type: 'frisør' });
  assert.ok(m.status === 201 || m.status === 200, m.text);
  const c = await A('/api/glimt/entities', 'POST', { type: 'place', name: 'Hytta', value: 'Lena, Østre Toten', aliases: ['Toten', 'hytte'] });
  assert.equal(c.status, 201, c.text);
  assert.match(c.body.item.id, /^m\d+$/);
  assert.equal(c.body.item.source, 'memory');
  db.prepare('INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created, place_type) VALUES(?,?,?,?,?,?,?,?)').run('Hjem', 59.92, 10.75, 120, '#3a7', ME, Date.now(), 'hjem');
  const l = await A('/api/glimt/entities');
  assert.equal(l.status, 200);
  assert.deepEqual(l.body.types, ['person', 'place', 'store', 'subscription', 'event']);
  const byName = (n) => l.body.items.find((x) => x.name === n);
  assert.equal(byName('Nina').type, 'person');
  assert.equal(byName('Nina').value, 'frisør');
  assert.equal(byName('Nina').id, `m${m.body.item.id}`, 'samme rad som /api/glimt/memory');
  assert.equal(byName('Hjem').source, 'family');
  assert.deepEqual(byName('Hjem').builtin.slice(0, 2), ['hjemme', 'hjem']);
  assert.ok(byName('Netflix') && byName('Netflix').type === 'subscription');
  assert.ok(!l.body.items.some((x) => x.id === 'home'), 'Familie-hjemmet erstatter profilens hjemsted');
  const r1 = await A('/api/glimt/entities/resolve?q=toten&type=place');
  assert.equal(r1.body.item.name, 'Hytta');
  assert.equal(r1.body.via, 'alias');
  const r2 = await A('/api/glimt/entities/resolve?q=hjemme');
  assert.equal(r2.body.item.id, byName('Hjem').id);
  assert.equal(r2.body.via, 'builtin');
  // Avledede: bare aliaser kan endres her.
  const zid = byName('Hjem').id;
  assert.equal((await A(`/api/glimt/entities/${encodeURIComponent(zid)}`, 'PATCH', { name: 'Huset' })).status, 400);
  const pa = await A(`/api/glimt/entities/${encodeURIComponent(zid)}`, 'PATCH', { aliases: ['leiligheten'] });
  assert.equal(pa.status, 200, pa.text);
  assert.deepEqual(pa.body.item.aliases, ['leiligheten']);
  assert.equal((await A('/api/glimt/entities/resolve?q=leiligheten')).body.item.id, zid);
  const del = await A(`/api/glimt/entities/${encodeURIComponent(zid)}`, 'DELETE');
  assert.deepEqual(del.body, { ok: true, removed: 'aliases' });
  // Egne: navn, verdi og aliaser.
  const pe = await A(`/api/glimt/entities/${c.body.item.id}`, 'PATCH', { aliases: ['Toten', 'hytte', 'landstedet'] });
  assert.deepEqual(pe.body.item.aliases, ['Toten', 'hytte', 'landstedet']);
  // Feil.
  assert.equal((await A('/api/glimt/entities', 'POST', { type: 'planet', name: 'Mars' })).status, 400);
  assert.equal((await A('/api/glimt/entities', 'POST', { type: 'place', name: 'x' })).status, 400);
  assert.equal((await A('/api/glimt/entities', 'POST', { type: 'place', name: 'Ok', aliases: Array.from({ length: 21 }, (_, i) => `alias${i}`) })).status, 400);
  assert.equal((await A('/api/glimt/entities/m999999', 'DELETE')).status, 404);
  // Butikk-alias brukes av finanssøket; samme navn på nytt oppdateres (200).
  const s1 = await A('/api/glimt/entities', 'POST', { type: 'store', name: 'REMA 1000', aliases: ['butikken'] });
  assert.equal(s1.status, 201);
  const s2 = await A('/api/glimt/entities', 'POST', { type: 'store', name: 'REMA 1000', aliases: ['butikken', 'rema'] });
  assert.equal(s2.status, 200);
  assert.deepEqual(s2.body.item.aliases, ['butikken', 'rema']);
  // Ikke i «Glimt husker»-lista som noe annet enn før (samme rader, ingen dubletter).
  const mem = await A('/api/glimt/memory');
  assert.equal(mem.body.items.filter((x) => x.match === 'rema 1000').length, 1);
});

test('entiteter i svarene: «på hytta» → stedet fra registeret (verdien), planleggeren får faktaet; «entities:false» → som før', async () => {
  wx.length = 0;
  const a = await agent('Hvordan er været på hytta?', 'home-ent00001');
  assert.equal(a.status, 200, a.text);
  assert.deepEqual(wx.at(-1), { name: 'Lena', at: null });
  assert.match(seen.at(-1).system, /Hytta = Lena, Østre Toten/);
  const t = (await A(`/api/glimt/agent/trace?id=${a.body.traceId}`)).body.trace;
  assert.ok(t.entities.some((x) => x.via === 'name' && x.tool === 'weather.get'), JSON.stringify(t.entities));
  // Familie-sted med koordinater: hentes på koordinatene.
  db.prepare('INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created, place_type) VALUES(?,?,?,?,?,?,?,?)').run('Fjellhytta', 61.1, 9.1, 200, '#357', ME, Date.now(), 'annet');
  PLANS = [[/^Været på fjellhytta\?$/, { intent: 'weather', calls: [{ tool: 'weather.get', args: { place: 'fjellhytta' } }] }]];
  try {
    wx.length = 0;
    const b = await agent('Været på fjellhytta?', 'home-ent00002');
    assert.equal(b.status, 200, b.text);
    assert.deepEqual(wx.at(-1), { name: 'Fjellhytta', at: { name: 'Fjellhytta', lat: 61.1, lon: 9.1 } });
  } finally { PLANS = []; }
  await A('/api/glimt/agent/understand', 'PUT', { scope: 'user', entities: false });
  try {
    wx.length = 0;
    await agent('Hvordan er været på hytta?', 'home-ent00003');
    assert.equal(wx.at(-1)?.name, 'Hytta', 'registeret er av: stedet geokodes som skrevet');
    assert.equal((await A('/api/glimt/entities')).body.enabled, false);
  } finally { await A('/api/glimt/agent/understand', 'PUT', { scope: 'user', entities: null }); }
});

/* ---------------- API ---------------- */

test('API: ugyldig conversationId/kind → 400; GET/DELETE /convo; strømmen tar conversationId og gir det tilbake i done', async () => {
  assert.equal((await agent('Hei', 'ugyldig id med mellomrom')).status, 400);
  assert.equal((await agent('Hei', 'home-ok000001', { conversationKind: 'telefon' })).status, 400);
  await agent('Hvordan er været i Oslo i morgen?', 'home-api00001');
  const g = await A('/api/glimt/agent/convo/home-api00001');
  assert.equal(g.status, 200);
  assert.equal(g.body.kind, 'search');
  assert.equal(g.body.state.entities.place, 'Oslo');
  assert.equal(g.body.state.turns, 1);
  assert.equal(g.body.expiresAt - g.body.updatedAt, 30 * 60_000);
  const d = await A('/api/glimt/agent/convo/home-api00001', 'DELETE');
  assert.deepEqual(d.body, { ok: true, removed: true });
  assert.equal((await A('/api/glimt/agent/convo/home-api00001')).status, 404);
  const r = await app.request('/api/glimt/agent/stream', { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' }, body: JSON.stringify({ text: 'Hvordan er været i Oslo i morgen?', requestId: RID(), conversationId: 'home-str00001' }) });
  const body = await r.text();
  const done = JSON.parse(/event: done\ndata: (.*)/.exec(body)[1]);
  assert.equal(done.conversationId, 'home-str00001');
  const b = await app.request('/api/glimt/agent/stream', { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.8' }, body: JSON.stringify({ text: 'og i Bergen?', requestId: RID(), conversationId: 'home-str00001' }) });
  const done2 = JSON.parse(/event: done\ndata: (.*)/.exec(await b.text())[1]);
  assert.equal(done2.followUp.refersToPrevious, true);
  assert.equal(done2.actions[0].args.when.from, '2026-10-25');
});

test('uten conversationId: innebygd samtale per bruker og modul (appene får det samme innen 30 min), conversationId null', async () => {
  await agent('Hvordan er været i Oslo i morgen?');
  const b = await agent('og i Bergen?');
  assert.equal(b.body.conversationId, null);
  assert.equal(b.body.actions[0].args.when.from, '2026-10-25');
});

test('looksFollowUp60 og stateText60', () => {
  assert.equal(ST.looksFollowUp60('og i Bergen?'), true);
  assert.equal(ST.looksFollowUp60('flytt den til 11'), true);
  assert.equal(ST.looksFollowUp60('si opp det'), true);
  assert.equal(ST.looksFollowUp60('Hvordan er været i Oslo?'), false);
  assert.equal(ST.looksFollowUp60('Legg inn tannlege fredag kl 10'), false);
  assert.equal(ST.stateText60(null), '');
  assert.match(ST.stateText60({ tools: [{ tool: 'finance.subscriptions', args: { mode: 'top' } }], intent: 'finance_query', entities: { subscription: { id: 1, name: 'Netflix' } } }), /Last subscription: Netflix\./);
  assert.equal(S60.KEYS60.length, 3);
  assert.equal(EN.ETYPES60.length, 5);
});
