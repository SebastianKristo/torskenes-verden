// Prompt 26 (server): Kalender (/api/kalender og /api/widgets/calendar) med RRULE, planleggingsdag, prøve som erstatter timen
// og hendelser utenfor 08–16, per bruker. Kalenderfeltene i /api/me/layout, metadata i /api/integrations (+ «calendars»),
// overstyrt transportør i Sporing og finNav med {key, label, icon}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p26-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p26-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
delete process.env.MOCK_DATA;
delete process.env.SCHOOL_ICAL_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Alt nett utenfor testen avvises; ParcelsApp-kallene lagres så carrier-hintet kan sjekkes.
const parcelsCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('https://parcelsapp.com/')) {
    parcelsCalls.push(JSON.parse(init.body ?? '{}'));
    return new Response(JSON.stringify({ done: true, shipments: [{ status: 'in transit', states: [{ date: '2026-10-17T08:00:00Z', status: 'In transit', location: 'Oslo' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
};
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const cal = await import('../server/calendar.js');
const { upsertShipment } = await import('../server/tracking.js');

/* ---------------- iCal-testdata ---------------- */
const VTZ = 'BEGIN:VTIMEZONE\r\nTZID:Europe/Oslo\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\n'
  + 'BEGIN:STANDARD\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n';
const ev = (lines) => `BEGIN:VEVENT\r\nDTSTAMP:20260801T000000Z\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;
const ics = (...evs) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//NO\r\n${VTZ}${evs.join('')}END:VCALENDAR\r\n`;
const SCHOOL = ics(
  // Mandag og fredag 08:15–09:45 R2, ukentlig, lærer i DESCRIPTION. Ikke 26.10 (EXDATE), og 02.11 flyttet til 09:15 (RECURRENCE-ID).
  ev(['UID:r2@test', 'DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T094500', 'RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20270618T220000Z',
    'EXDATE;TZID=Europe/Oslo:20261026T081500', 'SUMMARY:Matematikk R2', 'LOCATION:A-112', 'DESCRIPTION:Lærer: Kari Hansen\\nTa med kalkulator']),
  ev(['UID:r2@test', 'RECURRENCE-ID;TZID=Europe/Oslo:20261102T081500', 'DTSTART;TZID=Europe/Oslo:20261102T091500', 'DTEND;TZID=Europe/Oslo:20261102T104500', 'SUMMARY:Matematikk R2', 'LOCATION:A-114']),
  // Torsdag 10:00 engelsk (lærer fra ORGANIZER), og prøven 22.10 som erstatter timen.
  ev(['UID:eng@test', 'DTSTART;TZID=Europe/Oslo:20260820T100000', 'DTEND;TZID=Europe/Oslo:20260820T113000', 'RRULE:FREQ=WEEKLY;BYDAY=TH', 'SUMMARY:Engelsk', 'LOCATION:C-301', 'ORGANIZER;CN=John Smith:mailto:js@skole.no']),
  ev(['UID:eng-prove@test', 'DTSTART;TZID=Europe/Oslo:20261022T100000', 'DTEND;TZID=Europe/Oslo:20261022T113000', 'SUMMARY:Prøve i engelsk', 'LOCATION:C-301', 'DESCRIPTION:Kap. 3–5']),
  // Utenfor 08–16, planleggingsdag og heldagsprøve.
  ev(['UID:fm@test', 'DTSTART;TZID=Europe/Oslo:20261022T180000', 'DTEND;TZID=Europe/Oslo:20261022T193000', 'SUMMARY:Foreldremøte', 'LOCATION:Aula']),
  ev(['UID:pd@test', 'DTSTART;VALUE=DATE:20261030', 'DTEND;VALUE=DATE:20261031', 'SUMMARY:Planleggingsdag']),
  ev(['UID:hd@test', 'DTSTART;TZID=Europe/Oslo:20261106T081500', 'DTEND;TZID=Europe/Oslo:20261106T140000', 'SUMMARY:Heldagsprøve R2', 'LOCATION:Gymsalen']),
);
const CANVAS = ics(ev(['UID:a1@canvas', 'DTSTART;TZID=Europe/Oslo:20261028T235900', 'DTEND;TZID=Europe/Oslo:20261028T235900', 'SUMMARY:Labrapport fysikk [Fysikk 2]', 'URL:https://canvas.example/a/1']));
const KARI = ics(ev(['UID:k@test', 'DTSTART;TZID=Europe/Oslo:20260817T120000', 'DTEND;TZID=Europe/Oslo:20260817T130000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:Spansk', 'LOCATION:C-210']));
const FEEDS = { 'https://skole.example/seb.ics': SCHOOL, 'https://canvas.example/seb.ics': CANVAS, 'https://skole.example/kari.ics': KARI };
const fetched = [];
cal._setCalendarFetch(async (url) => { fetched.push(url); if (!FEEDS[url]) return new Response('nei', { status: 404 }); return new Response(FEEDS[url], { status: 200 }); });

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ikke JSON */ }
  return { status: r.status, body: json, text };
};
const S = client(await login('sebastian', 'testpassord1'));
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));
const at = (iso) => encodeURIComponent(new Date(iso).toISOString());
const day = (body, d) => body.events.filter((e) => e.date === d);

test('Kalender krever innlogging, og uten iCal er kildene ikke satt opp', async () => {
  assert.equal((await app.request('/api/kalender')).status, 401);
  const r = await S('/api/kalender?from=2026-10-19&to=2026-10-25');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.events, []);
  assert.equal(r.body.sources.find((s) => s.id === 'ical').configured, false);
  assert.equal((await S('/api/kalender?from=igår')).status, 400);
});

test('RRULE, EXDATE, RECURRENCE-ID, planleggingsdag, prøve som erstatter timen og hendelser utenfor 08–16', async () => {
  assert.equal((await S('/api/integrations/calendars', 'PUT', { cal_ics: 'webcal://skole.example/seb.ics', canvas_ics: 'https://canvas.example/seb.ics', cal_mazemap: '123' })).status, 200);
  const r = await S(`/api/kalender?from=2026-10-19&to=2026-11-08&now=${at('2026-10-19T08:30:00+02:00')}`);
  assert.equal(r.status, 200, r.text);
  assert.ok(fetched.includes('https://skole.example/seb.ics'), 'webcal:// hentes som https://');
  // Mandag 19.10: R2 08:15 i norsk tid (sommertid), med rom, lærer og merknad fra DESCRIPTION.
  const mon = day(r.body, '2026-10-19');
  assert.equal(mon.length, 1);
  assert.deepEqual([mon[0].title, mon[0].subject, mon[0].short, mon[0].room, mon[0].teacher, mon[0].note, mon[0].type, mon[0].time, mon[0].source],
    ['Matematikk R2', 'Matematikk R2', 'Matte R2', 'A-112', 'Kari Hansen', 'Ta med kalkulator', 'time', '08:15–09:45', 'ical']);
  assert.equal(mon[0].start, '2026-10-19T06:15:00.000Z');
  assert.equal(mon[0].color, r.body.subjects['Matematikk R2']);
  assert.match(mon[0].mazemap, /campusid=123&search=A-112/);
  assert.equal(mon[0].reminder, 'none');
  // Etter vintertid (25.10): fortsatt 08:15 norsk tid. 26.10 er unntatt (EXDATE). 02.11 er flyttet til 09:15 i A-114.
  assert.equal(day(r.body, '2026-10-23')[0].start, '2026-10-23T06:15:00.000Z');
  assert.equal(day(r.body, '2026-10-26').length, 0);
  assert.equal(day(r.body, '2026-10-30')[0].start, '2026-10-30', 'bare planleggingsdagen');
  assert.deepEqual(day(r.body, '2026-10-30').map((e) => [e.type, e.allDay]), [['fri', true]]);
  const nov2 = day(r.body, '2026-11-02');
  assert.deepEqual([nov2[0].time, nov2[0].room], ['09:15–10:45', 'A-114']);
  // Torsdag 22.10: prøven erstatter engelsktimen 10:00, og foreldremøtet 18:00 går i hele dagen-raden.
  const thu = day(r.body, '2026-10-22');
  assert.deepEqual(thu.map((e) => [e.title, e.type]), [['Prøve i engelsk', 'prove'], ['Foreldremøte', 'skole']]);
  assert.equal(thu[0].color, cal.LAB);
  assert.equal(thu[0].subject, 'Engelsk');
  assert.equal(thu[0].reminder, 'day', 'standard påminnelse for prøver er dagen før');
  assert.equal(thu[0].inAllDayRow, false);
  assert.equal(thu[1].inAllDayRow, false, 'prompt 27: rutenettet går 00–24, bare heldag og frister står i HELE-raden');
  assert.equal(day(r.body, '2026-10-29')[0].teacher, 'John Smith', 'lærer fra ORGANIZER');
  // Heldagsprøven fredag 06.11 erstatter R2-timen; Canvas-innleveringen er innl med fag og lenke.
  assert.deepEqual(day(r.body, '2026-11-06').map((e) => e.title), ['Heldagsprøve R2']);
  const cv = day(r.body, '2026-10-28')[0];
  assert.deepEqual([cv.title, cv.subject, cv.type, cv.source, cv.url, cv.inAllDayRow], ['Labrapport fysikk', 'Fysikk 2', 'innl', 'canvas', 'https://canvas.example/a/1', true]);
  // NÅ mandag 08:30: R2 med fremdrift, neste prøve om 3 dager.
  assert.equal(r.body.now.current.title, 'Matematikk R2');
  assert.equal(r.body.now.current.minutesLeft, 75);
  assert.ok(Math.abs(r.body.now.current.progress - 15 / 90) < 0.001);
  assert.equal(r.body.now.nextTest.title, 'Prøve i engelsk');
  assert.equal(r.body.now.nextTest.daysLeft, 3);
  assert.equal(r.body.now.nextTest.urgent, true);
  // Prøver og frister sortert etter dato.
  const tests = r.body.events.filter((e) => e.type === 'prove' || e.type === 'innl').map((e) => e.date);
  assert.deepEqual(tests, [...tests].sort());
});

test('Søndag: neste skoledag mandag og uke-visningen starter neste uke; widget', async () => {
  const r = await S(`/api/kalender?now=${at('2026-10-18T12:00:00+02:00')}`);
  assert.equal(r.body.from, '2026-10-19');
  assert.equal(r.body.now.current, undefined);
  assert.equal(r.body.now.nextSchoolDay.date, '2026-10-19');
  assert.equal(r.body.now.nextSchoolDay.label, 'mandag 19. oktober');
  const w = await S(`/api/widgets/calendar?now=${at('2026-10-18T12:00:00+02:00')}`);
  assert.equal(w.status, 200);
  assert.equal(w.body.kind, 'nextDay');
  assert.equal(w.body.nextSchoolDay.first.short, 'Matte R2');
  assert.deepEqual(w.body.tests.map((t) => t.title), ['Prøve i engelsk', 'Labrapport fysikk']);
  // Torsdag 10:30: NÅ = prøven, dagens timer, og oppdatering ved slutten av timen og midnatt.
  const t = await S(`/api/widgets/calendar?now=${at('2026-10-22T10:30:00+02:00')}`);
  assert.equal(t.body.kind, 'now');
  assert.equal(t.body.now.title, 'Prøve i engelsk');
  assert.equal(t.body.now.minutesLeft, 60);
  assert.deepEqual(t.body.today.events.map((e) => e.title), ['Prøve i engelsk']);
  assert.equal(t.body.today.label, 'torsdag 22. oktober');
  assert.deepEqual(t.body.refreshAt, ['2026-10-22T09:30:00.000Z', '2026-10-22T22:00:00.000Z']);
  assert.equal(t.body.nextSchoolDay, null);
});

test('Per bruker: Kari ser bare sin egen kalender', async () => {
  let r = await K(`/api/kalender?from=2026-10-19&to=2026-10-25`);
  assert.deepEqual(r.body.events, []);
  assert.equal(r.body.sources.find((s) => s.id === 'ical').configured, false);
  assert.equal((await K('/api/integrations/calendars', 'PUT', { cal_ics: 'https://skole.example/kari.ics' })).status, 200);
  r = await K(`/api/kalender?from=2026-10-19&to=2026-10-25`);
  assert.deepEqual(r.body.events.map((e) => e.title), ['Spansk']);
  assert.ok(!r.body.events.some((e) => /R2/.test(e.title)));
  // Sebastians kalender er uendret.
  assert.ok((await S(`/api/kalender?from=2026-10-19&to=2026-10-25`)).body.events.some((e) => e.title === 'Matematikk R2'));
  // Kari kan ikke se Sebastians adresse.
  const ci = (await K('/api/integrations')).body.find((x) => x.id === 'calendars');
  assert.equal(ci.fields.find((f) => f.key === 'cal_ics').value, null);
});

test('Kalenderinnstillinger i /api/me/layout: rekkefølge, skjulte kort, filter, visning, påminnelser og fagfarger', async () => {
  let r = await S('/api/me/layout', 'PUT', { kalOrder: ['B', 'A', 'C', 'D', 'E'], kalHidden: ['E'], kalFilters: { timeplan: true, prover: true, bursdager: false, skole: true }, kalView: 'mnd', kalReminders: { x: '1h' }, subjectColors: { 'Matematikk R2': '#123456' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.kalOrder, r.body.kalHidden, r.body.kalView, r.body.kalFilters], [['B', 'A', 'C', 'D', 'E'], ['E'], 'maaned', { timeplan: true, prover: true, bursdager: false, skole: true }]);
  const k = await S(`/api/kalender?from=2026-10-19&to=2026-10-19`);
  const id = k.body.events[0].id;
  assert.match(id, /^ical-[0-9a-f]{10}-20261019T0815$/);
  assert.equal((await S('/api/kalender/refresh', 'POST')).status, 200);
  assert.equal((await S(`/api/kalender?from=2026-10-19&to=2026-10-19`)).body.events[0].id, id, 'stabil id etter ny henting');
  // Påminnelser flettes per hendelse; null fjerner.
  r = await S('/api/me/layout', 'PUT', { kalReminders: { [id]: '15m', x: null } });
  assert.deepEqual(r.body.kalReminders, { [id]: '15m' });
  const k2 = await S(`/api/kalender?from=2026-10-19&to=2026-10-19`);
  assert.equal(k2.body.events[0].reminder, '15m');
  assert.equal(k2.body.events[0].color, '#123456');
  assert.equal(k2.body.subjects['Matematikk R2'], '#123456');
  for (const bad of [{ kalView: 'år' }, { kalReminders: { a: 'snart' } }, { subjectColors: { R2: 'rød' } }, { kalOrder: ['A', 'A'] }, { kalOrder: ['now'] }, { kalFilters: { Bursdager: true } }]) assert.equal((await S('/api/me/layout', 'PUT', bad)).status, 400, JSON.stringify(bad));
  assert.deepEqual((await S('/api/me/layout', 'PUT', { kalFilters: ['bursdager'] })).body.kalFilters, ['bursdager']);
  // Kari har sine egne.
  assert.equal((await K('/api/me/layout')).body.kalView, undefined);
});

test('Integrasjoner: metadata som på web, guide og «calendars»', async () => {
  const CATS = ['Smarthjem', 'Transport og pakker', 'Økonomi', 'AI', 'Informasjon', 'Annet'];
  const list = (await S('/api/integrations')).body;
  for (const x of list) {
    assert.ok(CATS.includes(x.category), `${x.id}: ${x.category}`);
    assert.ok(x.badge && x.color && typeof x.description === 'string' && x.statusText, x.id);
    assert.ok(Array.isArray(x.guide));
  }
  const by = Object.fromEntries(list.map((x) => [x.id, x]));
  assert.deepEqual([by.ha.badge, by.ha.category], ['HA', 'Smarthjem']);
  assert.deepEqual([by.mybring.badge, by.postnord.badge, by.parcelsapp.badge, by.entur.badge], ['B', 'PN', 'PA', 'R']);
  assert.deepEqual([by.t212.badge, by.bank.badge, by.imap.badge, by.finn.badge, by.ai.badge, by.cloudflare.badge, by.met.badge], ['T', 'BK', '@', 'F', 'G', 'CF', 'Yr']);
  assert.equal(by.plex.guide[1].title, 'Finn X-Plex-Token');
  assert.equal(by.plex.guide[1].n, 2);
  assert.ok(by.mybring.guide.every((g) => g.title === 'Posten og Bring'));
  assert.equal(by.parcelsapp.statusText, 'Mangler API-nøkkel');
  const c = by.calendars;
  assert.deepEqual([c.category, c.badge, c.status, c.statusText], ['Informasjon', '31', 'ok', 'Tilkoblet']);
  assert.deepEqual(c.fields.map((f) => f.key), ['cal_ics', 'canvas_ics', 'cal_mazemap']);
  assert.deepEqual(c.links.map((l) => l.id), ['google', 'ha']);
  assert.ok(c.guide.some((g) => g.title === 'Canvas (valgfritt)'));
  assert.equal(by.calendar.hidden, true);
  assert.equal(by.calendar.replacedBy, 'calendars');
  // Test: henter begge kalenderne.
  const t = await S('/api/integrations/calendars/test', 'POST');
  assert.equal(t.body.ok, true);
  assert.match(t.body.message, /Skole-iCal: 6 hendelser · Canvas-iCal: 1 hendelse$/);
  // Samme liste under /api/integrasjoner.
  assert.equal((await S('/api/integrasjoner')).body.length, list.length);
  // Kari (vanlig bruker) ser bare personlige, og «calendars» mangler adresse før hun legger inn en.
  const kl = (await K('/api/integrations')).body;
  assert.ok(kl.every((x) => x.scope === 'personal'));
});

test('Sporing: overstyr transportør (carrierOverride), ParcelsApp med carrier-hint, e-post endrer ikke valget', async () => {
  let r = await S('/api/tracking', 'POST', { trackingNo: '70712345678901234', carrierOverride: 'postnord' });
  assert.equal(r.status, 200, r.text);
  const it = r.body.item;
  assert.deepEqual([it.carrier, it.carrierDetected, it.carrierOverride, it.carrierLabel], ['postnord', 'bring', 'postnord', 'PostNord · valgt']);
  assert.equal((await S('/api/tracking', 'POST', { trackingNo: 'CV704411234NO', carrierOverride: 'fedexx' })).status, 400);
  // Tilbake til Auto.
  r = await S(`/api/tracking/${it.id}`, 'PATCH', { carrierOverride: null });
  assert.deepEqual([r.body.item.carrier, r.body.item.carrierOverride, r.body.item.carrierLabel], ['bring', null, 'Auto · Bring']);
  assert.ok(r.body.message);
  // ParcelsApp valgt: oppslaget skjer med en gang, med gjenkjent transportør som hint.
  assert.equal((await S('/api/integrations/parcelsapp', 'PUT', { trk_parcelsapp_key: 'pa-test' })).status, 200);
  const p = await S('/api/tracking', 'POST', { trackingNo: 'CV704411234NO' });
  parcelsCalls.length = 0;
  r = await S(`/api/tracking/${p.body.item.id}`, 'PATCH', { carrierOverride: 'parcelsapp' });
  assert.equal(r.status, 200, r.text);
  assert.equal(parcelsCalls.length, 1);
  assert.equal(parcelsCalls[0].shipments[0].carrier, 'Posten Norge');
  assert.deepEqual([r.body.item.carrierOverride, r.body.item.carrierLabel, r.body.item.carrier, r.body.item.status], ['parcelsapp', 'ParcelsApp · valgt', 'posten', 'in_transit']);
  // E-post med samme nummer endrer ikke transportøren.
  upsertShipment({ user: 'owner', trackingNo: '70712345678901234', carrier: 'dhl', source: 'email', name: 'Fra e-post' });
  await S(`/api/tracking/${it.id}`, 'PATCH', { carrierOverride: 'helthjem' });
  upsertShipment({ user: 'owner', trackingNo: '70712345678901234', carrier: 'dhl', source: 'email' });
  const l = (await S('/api/tracking')).body;
  const x = l.items.find((y) => y.id === it.id);
  assert.deepEqual([x.carrier, x.carrierOverride, x.carrierLabel], ['helthjem', 'helthjem', 'Helthjem · valgt']);
  assert.ok(l.overrides.some((o) => o.id === 'parcelsapp') && l.overrides.length === 9);
  // Kari ser ikke Sebastians sendinger og kan ikke endre dem.
  assert.equal((await K(`/api/tracking/${it.id}`, 'PATCH', { carrierOverride: 'dhl' })).status, 404);
});

test('Finans-fanelinjen: finNav med {key, label, icon}, maks 5, Mer lagres ikke, egne endringer = custom', async () => {
  let r = await S('/api/me/layout', 'PUT', { finNav: [{ key: 'boliger', label: 'Hus', icon: 'house' }, 'sok', { key: 'liste' }, 'mer'] });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.finNav, ['boliger', 'sok', 'liste']);
  assert.deepEqual(r.body.finNavItems, [{ key: 'boliger', label: 'Hus', icon: 'house' }, { key: 'sok' }, { key: 'liste' }]);
  assert.equal(r.body.profile, 'custom');
  assert.deepEqual((await S('/api/me/layout')).body.finNavItems[0], { key: 'boliger', label: 'Hus', icon: 'house' });
  assert.equal((await S('/api/me/layout', 'PUT', { finNav: ['oversikt', 'liste', 'finn', 'sok', 'budsjett', 'aksjer'] })).status, 400);
  assert.equal((await S('/api/me/layout', 'PUT', { finNav: ['oversikt', 'liste', 'finn', 'sok', 'budsjett', 'mer'] })).status, 200);
  assert.equal((await S('/api/me/layout', 'PUT', { finNav: [{ key: 'oversikt', label: '<b>' }] })).status, 400);
  // Profilen setter startverdien og fjerner egne navn.
  r = await S('/api/me/layout', 'PUT', { profile: 'standard' });
  assert.deepEqual(r.body.finNavItems, [{ key: 'oversikt' }, { key: 'liste' }, { key: 'finn' }, { key: 'sok' }]);
  assert.equal(r.body.profile, 'standard');
  // Samme nøkler som profilen, men med eget navn: Egendefinert.
  r = await S('/api/me/layout', 'PUT', { finNav: [{ key: 'oversikt', label: 'Hjem' }, 'liste', 'finn', 'sok'] });
  assert.equal(r.body.profile, 'custom');
});
