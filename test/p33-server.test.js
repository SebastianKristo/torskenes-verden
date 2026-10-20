// Prompt 33 (SERVER33): Kalender-appen – companion-token, kalendere (visning/egne/appCalendar), vær 16 dager, widgets og
// Glimt i Kalender (/api/assist source:'calendar').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-p33-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-33s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const k33 = await import('../server/kalender33.js');
const assist = await import('../server/assist.js');
const { osloTodayISO } = await import('../public/js/quick-time.js');
const { addDaysISO } = await import('../public/js/trial-parse.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const SEB = (await A('/api/me')).body.id;
const TODAY = osloTodayISO();
const bearer = (t) => client({ authorization: `Bearer ${t}` });
// Homelab-appens token (innlogging fra appen) og et smalt token.
const appTok = (await app.request('/finans/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1', deviceName: 'Homelab iPhone' }) }).then((r) => r.json())).token;
const T = bearer(appTok);
k33._setKalWeather(async () => ({ source: 'mock', days: Array.from({ length: 16 }, (_, i) => ({ date: addDaysISO(TODAY, i), hi: 9 + (i % 3), lo: 3, code: i === 1 ? 63 : 2, precipProb: i === 1 ? 80 : 10, precipMm: i === 1 ? 4.2 : 0 })) }));
assist._setDirectMs(5000);

/* ---------------- 4. Companion-token ---------------- */

test('companion: Homelab-appens token lager «Kalender (iPhone)» for samme bruker med samme scope, vises i Enheter og kan trekkes tilbake', async () => {
  const r = await T('/api/tokens/companion', 'POST', { app: 'kalender', device: 'iphone' });
  assert.equal(r.status, 201);
  assert.match(r.body.token, /^fh_pat_/);
  assert.equal(r.body.name, 'Kalender (iPhone)');
  assert.equal(r.body.user.id, SEB);
  const parentScopes = (await A('/finans/api/tokens')).body.find((t) => t.name === 'Homelab iPhone').scopes;
  assert.deepEqual([...r.body.scopes].sort(), [...parentScopes].sort());
  // Det nye tokenet virker mot kalenderen og er bundet til Sebastian.
  const C = bearer(r.body.token);
  assert.equal((await C('/api/me')).body.id, SEB);
  assert.equal((await C('/api/kalender/calendars')).status, 200);
  // Vises i Innstillinger → Enheter og API-tokens.
  const dev = await A('/api/devices');
  assert.ok(dev.body.apps.some((x) => x.id === r.body.id && x.app === 'kalender' && x.device === 'iPhone'));
  assert.ok((await A('/finans/api/tokens')).body.some((t) => t.id === r.body.id && t.name === 'Kalender (iPhone)'));
  // Ny innlogging for samme enhet erstatter den gamle.
  const r2 = await T('/api/tokens/companion', 'POST', { app: 'kalender', device: 'iPhone' });
  assert.equal(r2.status, 201);
  assert.equal((await C('/api/me')).status, 401, 'det gamle tokenet er trukket tilbake');
  assert.equal((await T('/api/tokens/companion')).body.tokens.filter((x) => x.device === 'iPhone').length, 1);
  // Andre brukere kan ikke trekke det tilbake; eieren kan.
  assert.equal((await K(`/api/tokens/companion/${r2.body.id}`, 'DELETE')).status, 404);
  assert.equal((await bearer(r2.body.token)('/api/me')).status, 200);
  assert.equal((await A(`/api/tokens/companion/${r2.body.id}`, 'DELETE')).status, 200);
  assert.equal((await bearer(r2.body.token)('/api/me')).status, 401);
  assert.ok(!(await A('/api/devices')).body.apps.some((x) => x.id === r2.body.id));
});

test('companion: aldri bredere scope eller lengre levetid enn tokenet som ber om det; krever finance:write; ukjent app avvises', async () => {
  const narrow = (await A('/finans/api/tokens', 'POST', { name: 'Smalt', scopes: ['finance:read', 'receipts:write'] })).body.token;
  assert.equal((await bearer(narrow)('/api/tokens/companion', 'POST', { app: 'kalender', device: 'Android' })).status, 403);
  const mid = (await A('/finans/api/tokens', 'POST', { name: 'Midt', scopes: ['finance:read', 'finance:write'], expiresDays: 30 })).body;
  const r = await bearer(mid.token)('/api/tokens/companion', 'POST', { app: 'kalender', device: 'Android' });
  assert.equal(r.status, 201);
  assert.deepEqual([...r.body.scopes].sort(), ['finance:read', 'finance:write']);
  assert.equal(r.body.name, 'Kalender (Android)');
  assert.ok(r.body.expires && r.body.expires <= mid.expires, 'utløper ikke senere enn forelderen');
  assert.equal((await T('/api/tokens/companion', 'POST', { app: 'finans', device: 'x' })).status, 400);
  assert.equal((await client({})('/api/tokens/companion', 'POST', { app: 'kalender' })).status, 401);
  // Økt (nettleser) gir samme scope som innlogging fra appen.
  const s = await A('/api/tokens/companion', 'POST', { app: 'kalender', device: 'iPad' });
  assert.equal(s.status, 201);
  assert.ok(s.body.scopes.includes('finance:write') && s.body.scopes.includes('finance:read'));
  // Kari ser bare sine egne.
  assert.equal((await K('/api/tokens/companion')).body.tokens.length, 0);
});

/* ---------------- 2. Kalendere ---------------- */

test('kalendere: (prompt 39) fire innebygde med farge, synlighet og antall; egne kan lages, endres og slettes', async () => {
  const r = await T('/api/kalender/calendars');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.calendars.slice(0, 4).map((c) => c.id), ['personlig', 'bursdager', 'skole', 'helligdager']); // prompt 39: fire kalendere
  const p = r.body.calendars[0];
  assert.equal(p.color, '#b23a2a');
  assert.equal(p.visible, true);
  assert.equal(typeof p.count, 'number');
  assert.ok(r.body.calendars.find((c) => c.id === 'skole').count > 0, 'skolens timeplan (mock) mappes til Skole');
  // Egen kalender.
  const n = await T('/api/kalender/calendars', 'POST', { name: 'Korps', color: '#123abc' });
  assert.equal(n.status, 201);
  assert.match(n.body.calendar.id, /^c-[0-9a-f]{10}$/);
  assert.equal((await T('/api/kalender/calendars', 'POST', { name: 'korps', color: '#123abc' })).status, 409);
  assert.equal((await T('/api/kalender/calendars', 'POST', { name: 'X', color: 'rød' })).status, 400);
  const id = n.body.calendar.id;
  assert.equal((await T(`/api/kalender/calendars/${id}`, 'PATCH', { color: '#00ff00', visible: false })).body.calendar.visible, false);
  assert.equal((await T('/api/kalender/calendars/skole', 'PATCH', { visible: false })).body.calendar.visible, false);
  await T('/api/kalender/calendars/skole', 'PATCH', { visible: true });
  assert.equal((await T('/api/kalender/calendars/skole', 'DELETE')).status, 403);
  // Hendelse i den egne kalenderen, flytting og sletting av kalenderen.
  const date = addDaysISO(TODAY, 3);
  const ev = await T('/api/kalender/events', 'POST', { title: 'Korpsøving', allDay: false, date, start: '18:00', end: '20:00', appCalendar: id });
  assert.equal(ev.status, 201);
  assert.equal(ev.body.event.appCalendar, id);
  assert.equal(ev.body.event.appColor, '#00ff00');
  assert.equal(ev.body.event.calendar, 'privat');
  const list = await T(`/api/kalender?from=${date}&to=${date}`);
  assert.equal(list.body.events.find((e) => e.id === ev.body.event.id).appCalendar, id);
  // Bare flytting (også mulig for skolens hendelser).
  const mv = await T(`/api/kalender/events/${encodeURIComponent(ev.body.event.id)}`, 'PATCH', { appCalendar: 'jobb' });
  assert.equal(mv.status, 200);
  assert.equal(mv.body.event.appCalendar, 'personlig', 'prompt 39: Jobb er slått inn i Personlig');
  assert.equal(mv.body.event.appColor, '#b23a2a');
  const school = list.body.events.find((e) => e.calendar === 'timeplan');
  if (school) {
    assert.equal(school.appCalendar, 'skole');
    assert.equal((await T(`/api/kalender/events/${encodeURIComponent(school.id)}`, 'PATCH', { appCalendar: 'personlig' })).body.event.appCalendar, 'personlig');
  }
  assert.equal((await T(`/api/kalender/events/${encodeURIComponent(ev.body.event.id)}`, 'PATCH', { appCalendar: 'finnes-ikke' })).status, 400);
  assert.equal((await T(`/api/kalender/calendars/${id}`, 'DELETE')).status, 200);
  assert.ok(!(await T('/api/kalender/calendars')).body.calendars.some((c) => c.id === id));
  // Kari ser ikke Sebastians egne kalendere.
  assert.equal((await K('/api/kalender/calendars')).body.calendars.length, 4);
  // Standardvalg.
  assert.equal((await T('/api/kalender/calendars/prefs', 'PUT', { defaultCalendar: 'jobb', theme: 'dark' })).body.prefs.theme, 'dark');
  assert.equal((await T('/api/kalender/calendars/prefs', 'PUT', { theme: 'blå' })).status, 400);
  await T('/api/kalender/calendars/prefs', 'PUT', { defaultCalendar: 'personlig' });
});

test('kalendere: gjetting for egne hendelser (tannlege → Helse, møte → Jobb, bursdag → Bursdager)', () => {
  assert.equal(k33.guessCalendar('Tannlege hos Smil'), 'helse');
  assert.equal(k33.guessCalendar('Møte med Ola'), 'jobb');
  assert.equal(k33.guessCalendar('Middag hos mormor'), 'familie');
  assert.equal(k33.guessCalendar('Frist IN2010'), 'studie');
  assert.equal(k33.guessCalendar('Kino'), null);
  assert.equal(k33.eventKey('loc-0123456789~20261020T1000'), 'loc-0123456789');
  assert.equal(k33.eventKey('g-abcdef1234-20261020T1000'), 'g-abcdef1234');
});

/* ---------------- 3. Vær ---------------- */

test('vær: /api/kalender/weather gir ikon og maks/min per dag, maks 16 dager', async () => {
  const r = await T(`/api/kalender/weather?from=${TODAY}&to=${addDaysISO(TODAY, 30)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.days.length, 16);
  const d1 = r.body.days[1];
  assert.equal(d1.date, addDaysISO(TODAY, 1));
  assert.equal(d1.icon, 'rain');
  assert.ok(d1.ic && d1.text);
  assert.equal(typeof d1.hi, 'number');
  assert.equal(r.body.place.name, 'Oslo');
  assert.equal((await T('/api/kalender/weather?from=igår')).status, 400);
  assert.equal((await client({})('/api/kalender/weather')).status, 401);
});

/* ---------------- 5. Widgets ---------------- */

test('widgets: /api/widgets/calendar har next3, month (prikker), weather og deepLink i tillegg til de gamle feltene', async () => {
  const date = addDaysISO(TODAY, 1);
  await T('/api/kalender/events', 'POST', { title: 'Frisør Nina', allDay: false, date, start: '14:30', end: '15:30', location: 'Grünerløkka', appCalendar: 'personlig' });
  const r = await T('/api/widgets/calendar');
  assert.equal(r.status, 200);
  assert.ok('kind' in r.body && 'today' in r.body, 'gamle felt finnes');
  assert.ok(Array.isArray(r.body.next3) && r.body.next3.length <= 3 && r.body.next3.length > 0);
  for (const e of r.body.next3) assert.match(e.deepLink, /^kalender:\/\/hendelse\?id=.+&date=\d{4}-\d{2}-\d{2}&t=/);
  assert.equal(r.body.month.today, TODAY);
  assert.ok(r.body.month.weeks.length >= 4);
  const day = r.body.month.weeks.flatMap((w) => w.days).find((d) => d.date === date);
  if (day) { assert.ok(day.dots.includes('#b23a2a')); assert.equal(day.deepLink, `kalender://dag/${date}`); }
  assert.equal(r.body.weather.days.length, 7);
  assert.equal(r.body.deepLink, 'kalender://');
  assert.equal(r.body.links.list, 'kalender://liste');
});

/* ---------------- 1. Glimt i Kalender ---------------- */

test('freeSlots: hull ≥ 45 min mellom 08 og 21', () => {
  const d = '2030-05-10';
  const ev = (s, e) => ({ allDay: false, date: d, start: new Date(`${d}T${s}:00+02:00`).toISOString(), end: new Date(`${d}T${e}:00+02:00`).toISOString() });
  const s = k33.freeSlots([ev('09:00', '10:00'), ev('10:20', '12:00'), ev('13:00', '20:30')], d, { today: '2030-05-01' });
  assert.deepEqual(s.map((x) => `${x.gapStart}–${x.gapEnd}`), ['08:00–09:00', '12:00–13:00']);
  assert.equal(s[0].end, '09:00');
  assert.equal(s[1].label, '12:00–13:00');
});

test('assist source:calendar: ledig tid, neste, oppsummering, vær, bursdag og opprett med angre', async () => {
  // Lørdag uten skole: én hendelse 10–12.
  let sat = addDaysISO(TODAY, 1);
  while (new Date(sat + 'T12:00:00Z').getUTCDay() !== 6) sat = addDaysISO(sat, 1);
  await T('/api/kalender/events', 'POST', { title: 'Brunsj', allDay: false, date: sat, start: '10:00', end: '12:00' });
  const ask = async (q) => { const r = await T('/api/assist', 'POST', { q, source: 'calendar' }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

  const f = await ask(`Finn ledig tid ${sat.slice(8, 10)}.${sat.slice(5, 7)}`);
  assert.equal(f.intent, 'calendar.free_slots');
  assert.deepEqual(f.tools, ['calendar.free_slots']);
  assert.equal(f.steps.length, 3);
  assert.equal(f.steps[1], 'Finner hull på minst 45 min');
  assert.ok(f.slots.some((s) => s.gapStart === '08:00' && s.gapEnd === '10:00'), JSON.stringify([f.text, f.slots, f.events.map((e) => [e.title, e.date, e.time])]));
  assert.ok(f.slots.some((s) => s.gapStart === '12:00' && s.gapEnd === '21:00'));
  assert.ok(Array.isArray(f.events));
  assert.ok(f.jobId);
  const job = await T(`/api/assist/${f.jobId}`);
  assert.equal(job.body.steps[1].label, 'Finner hull på minst 45 min');
  assert.ok(job.body.steps.every((s) => s.state === 'done'));

  const n = await ask('Når er neste frisørtime?');
  assert.equal(n.intent, 'calendar.search');
  assert.equal(n.events[0].title, 'Frisør Nina');
  assert.match(n.text, /Neste frisør er \*\*i morgen kl\. 14:30\*\*, Grünerløkka/);
  assert.equal(n.events[0].appCalendar, 'personlig');

  const s = await ask('Hva skjer i morgen?');
  assert.equal(s.intent, 'calendar.summary');
  assert.ok(s.summary.count >= 1);
  assert.ok(s.weather.length === 1 && s.weather[0].icon === 'rain');
  assert.match(s.text, /paraply/);

  const u = await ask('Oppsummer uka');
  assert.equal(u.intent, 'calendar.summary');
  assert.equal(u.summary.to, addDaysISO(TODAY, 6));
  assert.equal(u.steps[0], 'Leser 7 dager');

  const w = await ask('Blir det regn i morgen?');
  assert.equal(w.intent, 'weather.daily');
  assert.match(w.text, /Ta med paraply/);

  const c = await ask('legg til tannlege fredag kl 9');
  assert.equal(c.intent, 'calendar.create');
  assert.ok(c.created?.event?.id);
  assert.equal(c.created.event.appCalendar, 'personlig'); // prompt 39: Helse er slått inn i Personlig
  assert.equal(c.created.event.appKind, 'helse');
  assert.equal(c.created.event.title, 'Tannlege');
  assert.match(c.created.event.start, /T0[78]:00:00/);
  assert.equal(c.created.undo.method, 'DELETE');
  assert.match(c.text, /Personlig/); // prompt 39
  const und = await T(c.created.undo.url, 'DELETE');
  assert.equal(und.status, 200);

  const b = await ask('Neste bursdag?');
  assert.equal(b.intent, 'calendar.search');
  assert.ok(Array.isArray(b.events));

  // Kari ser ikke Sebastians hendelser.
  const kr = await K('/api/assist', 'POST', { q: 'Når er neste frisørtime?', source: 'calendar' });
  assert.equal(kr.status, 200);
  assert.ok(!kr.body.events.some((e) => e.title === 'Frisør Nina'));
});

test('calendarAnswer: onStep får tenker-stegene (etiketter) før og etter verktøyet', async () => {
  const calls = [];
  const a = await k33.calendarAnswer(SEB, 'Finn ledig tid i morgen', { onStep: (at, intent, labels) => calls.push([at, intent, labels.length]) });
  assert.deepEqual(calls.map((c) => c[0]), [1, 2]);
  assert.equal(calls[0][1], 'calendar.free_slots');
  assert.equal(calls[0][2], 3);
  assert.equal(a.steps[0], 'Leser i morgen i kalenderen');
  assert.equal(a.deepLink, 'kalender://liste');
  assert.equal(k33.dayOfQuestion('Finn ledig tid 24.10?', '2026-10-19'), '2026-10-24');
  assert.equal(k33.dayOfQuestion('hva skjer neste fredag', '2026-10-19'), '2026-10-30');
  assert.deepEqual(k33.extrasOf('møte med Ola i morgen 10-11 varsle 30 min før'), { start: '10:00', end: '11:00', reminder: '1h' });
});

test('assist source:calendar: 202 → jobben fullføres med kalender-stegene (strømming ord for ord over realtime)', async () => {
  k33._setKalWeather(async () => { await new Promise((r) => setTimeout(r, 30)); return { source: 'mock', days: [{ date: TODAY, hi: 8, lo: 2, code: 3, precipProb: 5 }] }; });
  const keep = setInterval(() => {}, 5); // jobbens tidtakere er unref()
  assist._setDirectMs(1);
  assist._setStreamMs(1);
  const r = await T('/api/assist', 'POST', { q: 'Oppsummer uka', source: 'calendar' });
  assert.equal(r.status, 202);
  await assist._drainAssist();
  const j = await T(`/api/assist/${r.body.jobId}`);
  assert.equal(j.body.state, 'done');
  assert.equal(j.body.source, 'calendar');
  assert.equal(j.body.answer.intent, 'calendar.summary');
  assert.deepEqual(j.body.steps.map((s) => s.label), ['Leser 7 dager', 'Finner travleste dag', 'Skriver oppsummering']);
  clearInterval(keep);
  assist._setDirectMs(5000);
});
