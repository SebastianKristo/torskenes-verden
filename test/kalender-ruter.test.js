// Fase 2: låser svarformen (status og felt) for kalender- og bursdagsrutene som appene og web bruker, før serverfilene
// samles i server/kalender/. Rutene passerer flere lag (mellomvare som legger på felt etter next()), så testen sjekker at
// feltene fra alle lagene fortsatt er med.
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-kalruter-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-kal';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const { osloDate } = await import('../server/dates/oslo.js');

const login = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
async function call(method, path, body, auth = true) {
  const r = await app.request(path, { method, headers: { ...(auth ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json };
}
const keys = (o) => Object.keys(o ?? {}).sort();
const has = (o, list) => { for (const k of list) assert.ok(k in (o ?? {}), `mangler ${k} i ${JSON.stringify(keys(o))}`); };
const TODAY = osloDate();
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

test('uinnlogget: kalender, kalenderlista og widgeten svarer 401 HOMELAB_AUTH', async () => {
  for (const p of ['/api/kalender', '/api/kalender/calendars', '/api/widgets/calendar', '/api/birthdays']) {
    const r = await call('GET', p, undefined, false);
    assert.equal(r.status, 401, p);
    assert.equal(r.body.code, 'HOMELAB_AUTH', p);
  }
});

test('GET /api/kalender: hendelser med felt fra alle lag (kilder, fagfarger, app-kalender, etag)', async () => {
  const r = await call('GET', `/api/kalender?from=${TODAY}&to=${addDays(TODAY, 30)}`);
  assert.equal(r.status, 200);
  assert.deepEqual(keys(r.body), ['calendars', 'events', 'from', 'labColor', 'now', 'sources', 'subjects', 'to', 'today', 'updatedAt']);
  assert.ok(r.body.events.length > 0);
  has(r.body.events[0], ['id', 'title', 'start', 'end', 'allDay', 'date', 'type', 'color', 'source', 'calendar', 'editable', 'appCalendar', 'appColor', 'repeat', 'recurring', 'etag']);
  assert.ok(r.body.events.some((e) => e.subjectKey && e.subjectColor), 'fagfarger (kal37) mangler');
});

test('GET /api/kalender/calendars: de fire kalenderne med kilde, merke og varsel', async () => {
  const r = await call('GET', '/api/kalender/calendars');
  assert.equal(r.status, 200);
  assert.deepEqual(keys(r.body), ['calendars', 'defaultCalendar', 'migration', 'prefs']);
  const ids = r.body.calendars.map((c) => c.id);
  for (const id of ['personlig', 'bursdager', 'skole', 'helligdager']) assert.ok(ids.includes(id), id);
  has(r.body.calendars[0], ['id', 'key', 'name', 'color', 'textColor', 'lightColor', 'visible', 'builtin', 'writable', 'source', 'badge', 'kind', 'sourceLabel', 'notify', 'notifyLabel', 'showInBrief', 'removable', 'count']);
  assert.ok(Array.isArray(r.body.calendars.find((c) => c.id === 'skole').subjectColors));
});

test('PATCH /api/kalender/calendars/:id: nye felt (kal39) og navn/farge (kalender33) gir {calendar}', async () => {
  const a = await call('PATCH', '/api/kalender/calendars/helligdager', { notify: false });
  assert.equal(a.status, 200);
  assert.deepEqual(keys(a.body), ['calendar']);
  assert.equal(a.body.calendar.notify, false);
  const b = await call('PATCH', '/api/kalender/calendars/personlig', { color: '#2b5d8a' });
  assert.equal(b.status, 200);
  assert.equal(b.body.calendar.color, '#2b5d8a');
  assert.equal(b.body.calendar.shape39, true);
});

test('hendelse: opprett med deltakere og sted, flytt til app-kalender, slett', async () => {
  const date = addDays(TODAY, 20);
  const c = await call('POST', '/api/kalender/events', { title: 'Låsetest', date, start: '10:00', end: '11:00', calendar: 'personlig', attendees: [{ email: 'a@example.com', name: 'A' }], geo: { lat: 59.9, lon: 10.7, label: 'Oslo' } });
  assert.equal(c.status, 201);
  assert.deepEqual(keys(c.body), ['event', 'ok']);
  has(c.body.event, ['id', 'appCalendar', 'appColor', 'etag', 'attendees', 'geo']);
  assert.equal(c.body.event.appCalendar, 'personlig');
  assert.equal(c.body.event.attendees[0].email, 'a@example.com');
  const id = encodeURIComponent(c.body.event.id);
  const p = await call('PATCH', `/api/kalender/events/${id}`, { title: 'Låsetest 2' });
  assert.equal(p.status, 200);
  has(p.body.event, ['attendees', 'etag', 'geo', 'map', 'appCalendar']);
  assert.equal(p.body.event.title, 'Låsetest 2');
  const conflict = await call('PATCH', `/api/kalender/events/${id}`, { title: 'x', etag: '"feil"' });
  assert.equal(conflict.status, 412);
  assert.equal(conflict.body.conflict, true);
  const m = await call('PATCH', `/api/kalender/events/${id}`, { appCalendar: 'personlig' });
  assert.equal(m.status, 200);
  assert.deepEqual(keys(m.body), ['event', 'ok']);
  const d = await call('DELETE', `/api/kalender/events/${id}`);
  assert.equal(d.status, 200);
  assert.deepEqual(d.body, { ok: true });
  const bad = await call('POST', '/api/kalender/events', { title: 'x', date: 'nope' });
  assert.equal(bad.status, 400);
  const ro = await call('POST', '/api/kalender/events', { title: 'x', date, calendar: 'helligdager' });
  assert.equal(ro.status, 400);
});

test('widget: /api/widgets/calendar har både grunnsvaret og Kalender-appens tillegg', async () => {
  const r = await call('GET', '/api/widgets/calendar');
  assert.equal(r.status, 200);
  assert.deepEqual(keys(r.body), ['configured', 'deepLink', 'kind', 'links', 'month', 'next', 'next3', 'nextSchoolDay', 'now', 'refreshAt', 'tests', 'today', 'updatedAt', 'url', 'weather']);
  assert.equal(r.body.month.today, TODAY);
});

test('søk, rask time, Glimt og «Beskriv med Glimt»', async () => {
  const s = await call('GET', '/api/kalender/search?q=fys');
  assert.equal(s.status, 200);
  assert.deepEqual(keys(s.body), ['events', 'q', 'total']);
  const ai = await call('GET', '/api/kalender/search?q=hva%20har%20jeg%20i%20morgen&ai=1');
  assert.equal(ai.status, 200);
  assert.deepEqual(keys(ai.body), ['ai', 'answer', 'events', 'q', 'total']);
  const qp = await call('POST', '/api/kalender/quick/parse', { text: 'tannlege 14.30 i morgen' });
  assert.equal(qp.status, 200);
  has(qp.body, ['ok', 'title', 'date', 'start', 'end', 'label']);
  for (const p of ['/api/kalender/quick/jobs', '/api/calendar/quick/jobs']) assert.ok(Array.isArray((await call('GET', p)).body), p);
  const ds = await call('POST', '/api/kalender/describe', { text: 'Middag hos mormor fredag kl 18' });
  assert.equal(ds.status, 200);
  has(ds.body, ['ok', 'engine', 'event', 'filled', 'note']);
  const g = await call('POST', '/api/kalender/glimt/search', { q: 'tannlege' });
  assert.equal(g.status, 200);
  assert.deepEqual(keys(g.body), ['engine', 'events', 'label', 'model', 'ms', 'text']);
});

test('kalenderappens øvrige ruter: google, ha, mapping, vær, fag, geo, invitasjoner, brukere, companion, appoppdatering', async () => {
  const want = {
    '/api/kalender/calendars/google': ['calendars', 'configured', 'connected', 'email', 'main'],
    '/api/kalender/google/mapping': ['calendars', 'configured', 'connected', 'email', 'holidays', 'job', 'note', 'preview', 'school'],
    '/api/kalender/ha/calendars': ['allowed', 'connected', 'entities', 'mock'],
    '/api/kalender/weather': ['credit', 'days', 'place', 'source', 'updatedAt'],
    '/api/kalender/subjects': ['palette', 'subjects'],
    '/api/kalender/geo?q=Hoffsveien%204': ['address', 'found', 'label', 'lat', 'lon', 'map'],
    '/api/kalender/invites': ['items'],
    '/api/users/directory': ['me', 'users'],
    '/api/tokens/companion': ['tokens'],
  };
  for (const [p, k] of Object.entries(want)) {
    const r = await call('GET', p);
    assert.equal(r.status, 200, p);
    assert.deepEqual(keys(r.body), k, p);
  }
  const up = await call('GET', '/api/apps/kalender/latest?platform=ios', undefined, false);
  assert.equal(up.status, 200);
  assert.equal(up.body.selfUpdate, false);
});

test('bursdager: liste, widget og ny bursdag', async () => {
  const l = await call('GET', '/api/birthdays');
  assert.equal(l.status, 200);
  assert.deepEqual(keys(l.body), ['google', 'ha', 'items', 'next', 'relations', 'reminders']);
  const w = await call('GET', '/api/widgets/birthdays');
  assert.equal(w.status, 200);
  assert.deepEqual(keys(w.body), ['addLink', 'count', 'deepLink', 'items', 'next', 'updatedAt']);
  const n = await call('POST', '/api/birthdays', { name: 'Emma Låsetest', month: 3, day: 14, year: 2010 });
  assert.equal(n.status, 201);
  has(n.body.item, ['id', 'name', 'month', 'day', 'nextDate']);
  const ph = await call('GET', `/api/birthdays/${n.body.item.id}/photos`);
  assert.equal(ph.status, 200);
  has(ph.body, ['photos', 'max']);
});
