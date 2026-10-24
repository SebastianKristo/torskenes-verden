// Prompt 50 (SRVFAM50): Steder med flere områder (migrering, «forlot» etter 2 min, Ruter leser skolen fra Steder, regioner),
// Folk/I dag, Helse per person og Sjekk inn (innsjekk, forespørsel, svar, «Hent meg» med høy prioritet, påminnelse, personvern).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p50f-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-50f';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4502';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv } = await import('../server/db.js');
const fam = await import('../server/family.js');
const f50 = await import('../server/family50.js');
const ruter = await import('../server/ruter41.js');
const { pendingFor } = await import('../server/notify.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
assert.equal((await A('/api/users', 'POST', { username: 'pal', password: 'palPassord12345', role: 'bruker', name: 'Pål' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const P = as(await cookie('pal', 'palPassord12345'));
const sebId = (await A('/api/family')).body.me.userId;
const ingridId = (await I('/api/family')).body.me.userId;
const palId = (await P('/api/family')).body.me.userId;
// Eksempelsonene fra MOCK_DATA (Hjem/Jobb/Skole delt av Sebastian) fjernes, så testene styrer stedene selv.
for (const z of db.prepare('SELECT id FROM family_zone').all()) fam.deletePlace50(z.id);
const off = (p, dLat, dLon = 0) => ({ lat: p.lat + dLat, lon: p.lon + dLon });

const SKOLEN = { lat: 59.9318, lon: 10.7348 };
const HALLEN = off(SKOLEN, 0.0040); // ~445 m nord
const BIBL = off(SKOLEN, 0, 0.0060); // ~335 m øst

/* ---------------- Migrering ---------------- */

test('migrering: eksisterende sone får ett område og type; Ruter-skolesoner havner i stedet Skole', () => {
  const z = db.prepare("INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created, shared, icon) VALUES('Jobben', 59.91, 10.76, 200, '#b23a2a', ?, ?, 0, 'work') RETURNING *").get(palId, Date.now());
  fam.migrateAreas50();
  const a = db.prepare('SELECT * FROM family_area50 WHERE zone_id=?').all(z.id);
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].name, a[0].radius], ['Jobben', 200]);
  assert.equal(db.prepare('SELECT place_type FROM family_zone WHERE id=?').get(z.id).place_type, 'jobb');
  // Ingrid hadde to skolesoner i Ruter (gammel tabell).
  db.prepare('INSERT INTO school_zones(user_id,name,lat,lon,radius_m,created) VALUES(?,?,?,?,?,?)').run(ingridId, 'Skolen', SKOLEN.lat, SKOLEN.lon, 150, Date.now());
  db.prepare('INSERT INTO school_zones(user_id,name,lat,lon,radius_m,created) VALUES(?,?,?,?,?,?)').run(ingridId, 'Idrettshallen', HALLEN.lat, HALLEN.lon, 80, Date.now());
  ruter._resetSchool50();
  const p = ruter.schoolPlaceOf50(ingridId);
  assert.equal(p.name, 'Skole');
  assert.equal(p.place_type, 'skole');
  assert.equal(p.created_by, ingridId);
  assert.deepEqual(fam.family50.areasOf(p.id).map((x) => `${x.name} ${x.radius}`), ['Skolen 150', 'Idrettshallen 80']);
  // Idempotent: ny kjøring legger ikke inn dobbelt.
  ruter._resetSchool50();
  ruter.schoolPlaceOf50(ingridId);
  assert.equal(fam.family50.areasOf(p.id).length, 2);
});

/* ---------------- Steder ---------------- */

let skole;
test('Steder: sted med flere områder, brikker, endre radius, siste område kan ikke fjernes, bare eieren endrer', async () => {
  const pl = (await I('/api/family/places')).body;
  skole = pl.places.find((x) => x.type === 'skole' && x.mine);
  assert.ok(skole, 'migrert Skole vises');
  assert.equal(skole.chips, 'Skolen 150 m · Idrettshallen 80 m');
  assert.equal(skole.areaText, '2 områder');
  assert.deepEqual(skole.usedBy, ['ruter']);
  assert.equal(skole.usedByText, 'Brukes av Ruter (Min reise)');
  assert.deepEqual(pl.radius, { min: 25, max: 1000 });
  const add = await I(`/api/family/places/${skole.id}/areas`, 'POST', { name: 'Biblioteket', ...BIBL, radius_m: 60 });
  assert.equal(add.status, 201);
  assert.equal(add.body.place.chips, 'Skolen 150 m · Idrettshallen 80 m · Biblioteket 60 m');
  assert.equal((await I(`/api/family/places/${skole.id}/areas`, 'POST', { name: 'X', ...BIBL, radius_m: 1500 })).status, 400);
  const hall = add.body.place.areas.find((a) => a.name === 'Idrettshallen');
  assert.equal((await I(`/api/family/places/${skole.id}/areas/${hall.id}`, 'PATCH', { radius_m: 120 })).body.area.label, 'Idrettshallen 120 m');
  // Privat sted: andre ser det ikke. Delt: andre ser, men kan ikke endre.
  assert.equal((await A(`/api/family/places/${skole.id}`)).status, 404);
  assert.equal((await I(`/api/family/places/${skole.id}`, 'PATCH', { shared: true })).body.shared, true);
  assert.equal((await A(`/api/family/places/${skole.id}`)).status, 200);
  assert.equal((await A(`/api/family/places/${skole.id}/areas/${hall.id}`, 'DELETE')).status, 403);
  // Nytt sted med ett område: det siste kan ikke fjernes.
  const hjem = await A('/api/family/places', 'POST', { name: 'Hjem', type: 'hjem', shared: true, areas: [{ name: 'Huset', lat: 59.9447, lon: 10.6905, radius_m: 100 }] });
  assert.equal(hjem.status, 201);
  assert.equal(hjem.body.icon, 'home');
  assert.equal(hjem.body.type, 'hjem');
  const last = await A(`/api/family/places/${hjem.body.id}/areas/${hjem.body.areas[0].id}`, 'DELETE');
  assert.equal(last.status, 409);
  assert.equal(last.body.code, 'last_area');
  assert.equal((await A('/api/family/places', 'POST', { name: 'Tom', areas: [] })).status, 400);
  // Eldre klienter: sonen speiler første område og har areas/type.
  const old = (await A('/api/family')).body.zones.find((z) => z.id === hjem.body.id);
  assert.deepEqual([old.lat, old.lon, old.radius, old.type, old.areas.length], [59.9447, 10.6905, 100, 'hjem', 1]);
});

test('regioner: én per område, maks 20, Hjem og Skole først', async () => {
  for (let i = 0; i < 4; i++) {
    await I('/api/family/places', 'POST', { name: `Sted ${i}`, type: 'annet', areas: Array.from({ length: 5 }, (_, k) => ({ name: `O${k}`, lat: 59.8 + i * 0.01, lon: 10.6 + k * 0.01, radius_m: 50 })) });
  }
  const r = (await I('/api/family/places/regions?lat=59.80&lon=10.60')).body;
  assert.equal(r.max, 20);
  assert.equal(r.regions.length, 20);
  assert.ok(r.total > 20);
  assert.deepEqual(r.regions.slice(0, 4).map((x) => x.type), ['hjem', 'skole', 'skole', 'skole']);
  assert.ok(r.version > 0);
});

/* ---------------- Hendelser og Ruter ---------------- */

test('skole med 3 områder: fra Skolen til Idrettshallen gir ingen «forlot»; ut av alle → «forlot» etter 2 min (og Min reise)', async () => {
  await I('/api/family/me', 'PUT', { sharing: 'on' });
  const t0 = Date.now() - 20 * 60_000;
  const post = (p, ts) => I('/api/family/location', 'POST', { ...p, ts });
  await post(off(SKOLEN, 0.02), t0); // langt unna først
  const inn = await post(SKOLEN, t0 + 60_000);
  assert.deepEqual(inn.body.events.filter((e) => e.zoneId === skole.id).map((e) => e.kind), ['enter']);
  // Mellom områdene (ute i 1 min) og inn i Idrettshallen: ingen hendelse.
  assert.equal((await post(off(SKOLEN, 0.0025), t0 + 120_000)).body.events.length, 0);
  assert.equal((await post(HALLEN, t0 + 180_000)).body.events.length, 0);
  // Ut av alle: ingen hendelse straks, «forlot» når et punkt 2 min senere fortsatt er utenfor – med tidspunktet hun gikk.
  const out1 = await post(off(SKOLEN, 0.02), t0 + 240_000);
  assert.equal(out1.body.events.length, 0);
  const out2 = await post(off(SKOLEN, 0.021), t0 + 390_000);
  const lv = out2.body.events.filter((e) => e.zoneId === skole.id);
  assert.deepEqual(lv.map((e) => [e.kind, e.ts]), [['leave', t0 + 240_000]]);
  // Min reise: bare hverdager 07–18 (leftSchool41s regel); ellers ingen reise.
  const j = ruter.journeyOf41(ingridId);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t0 + 240_000)).map((x) => [x.type, x.value]));
  const inHours = !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 7 && +p.hour < 18;
  assert.equal(j.active, inHours);
  if (inHours) assert.equal(Date.parse(j.leftSchoolAt), t0 + 240_000);
  assert.ok(kv.get(ingridId, 'ruter41_arrived', null) >= t0 + 60_000, 'ankomst registrert');
});

test('sweep: «forlot» uten nye punkter etter 2 min', async () => {
  const z = (await I('/api/family/places', 'POST', { name: 'Hytta', type: 'annet', areas: [{ name: 'Hytta', lat: 61.0, lon: 9.0, radius_m: 100 }] })).body;
  const now = Date.now();
  await I('/api/family/location', 'POST', { lat: 61.0, lon: 9.0, ts: now - 5 * 60_000 });
  await I('/api/family/location', 'POST', { lat: 61.05, lon: 9.0, ts: now - 3 * 60_000 });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM family_event WHERE zone_id=? AND kind='leave'").get(z.id).n, 0);
  assert.ok(fam.sweepLeaves50(now) >= 1);
  assert.equal(db.prepare("SELECT ts FROM family_event WHERE zone_id=? AND kind='leave'").get(z.id).ts, now - 3 * 60_000);
});

test('Ruter leser skolen fra Steder: nytt område vises uten omstart; tom tilstand uten skole', async () => {
  await I(`/api/family/places/${skole.id}/areas`, 'POST', { name: 'Kantina', lat: SKOLEN.lat - 0.002, lon: SKOLEN.lon, radius_m: 40 });
  const z = (await I('/api/ruter/school-zones')).body;
  assert.equal(z.source, 'steder');
  assert.ok(z.zones.some((a) => a.label === 'Kantina 40 m'));
  const s = (await I('/api/ruter/school50')).body;
  assert.equal(s.title, 'SKOLE · FRA FAMILIE › STEDER');
  assert.equal(s.readOnly, true);
  assert.match(s.chips, /^Skolen 150 m · Idrettshallen 120 m · Biblioteket 60 m · Kantina 40 m$/);
  assert.equal(s.edit.label, 'Endre i Steder ›');
  assert.equal(s.edit.placeId, skole.id);
  // Pål ser Ingrids delte Skole – men en ny bruker uten skole får tom tilstand.
  assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord1234', role: 'bruker', name: 'Kari' })).status, 200);
  await I(`/api/family/places/${skole.id}`, 'PATCH', { shared: false });
  const K = as(await cookie('kari', 'kariPassord1234'));
  const e = (await K('/api/ruter/school50')).body;
  assert.equal(e.place, null);
  assert.deepEqual([e.empty.text, e.empty.action], ['Ingen skole valgt', 'Legg til i Steder ›']);
  // Eldre klient: legg til område via Ruter havner i Steder.
  const add = await I('/api/ruter/school-zones', 'POST', { name: 'Gymsalen', lat: SKOLEN.lat, lon: SKOLEN.lon + 0.001, radius_m: 60 });
  assert.equal(add.status, 201);
  assert.ok((await I(`/api/family/places/${skole.id}`)).body.areas.some((a) => a.name === 'Gymsalen'));
});

/* ---------------- Folk, I dag, Helse ---------------- */

test('Folk og I dag: kort per person med sted/batteri, hendelser med profilbilde-felt', async () => {
  await A('/api/family/me', 'PUT', { sharing: 'on' });
  await I(`/api/family/places/${skole.id}`, 'PATCH', { shared: true });
  await I('/api/family/location', 'POST', { ...SKOLEN, battery: 0.18, charging: false, activity: 'still' });
  const p = (await A('/api/family/people50')).body;
  assert.match(p.subtitle, /^\d+ personer · /);
  const ing = p.people.find((x) => x.userId === ingridId);
  assert.equal(ing.place, 'Skole');
  assert.equal(ing.battery, 18);
  assert.equal(ing.lowBattery, true);
  assert.ok(p.people.some((x) => x.mock && x.activity === 'i bil' || x.mock && x.activity === 'sykler'));
  assert.equal(p.people[0].self, true);
  const t = (await I('/api/family/today50')).body;
  assert.equal(t.title, 'I DAG');
  const it = t.items.find((x) => x.kind === 'enter' && x.place === 'Skole');
  assert.ok(it, JSON.stringify(t.items.slice(0, 3)));
  assert.equal(it.title, 'Du kom til Skole');
  assert.ok('photoUrl' in it.avatar && it.avatar.initials);
  assert.equal((await P('/api/family/people50')).body.people.some((x) => x.userId === ingridId), true, 'Ingrid deler med familien');
});

test('Helse per person: 7 dager, søvn med leggetid, deling, «Ikke delt», oppsummering', async () => {
  await I('/api/family/me', 'PUT', { shareHealth: { steps: true, sleep: true, restingHr: true, activeKcal: false, week: true } });
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
  const r = await I('/api/family/health', 'POST', { date: today, steps: 11230, sleepMin: 468, sleepStart: '23:10', sleepEnd: '06:58', restingHr: 54, activeKcal: 400, source: 'Pixel 8',
    week: [{ date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date(Date.now() - 86_400_000)), steps: 6000 }] });
  assert.equal(r.status, 200);
  await A('/api/family/health50/goal', 'PUT', { steps: 10000 });
  await A('/api/family/me', 'PUT', { shareHealth: { steps: true } });
  await A('/api/family/health', 'POST', { date: today, steps: 8420 });
  const h = (await A('/api/family/health50')).body;
  const ing = h.people.find((x) => x.userId === ingridId);
  assert.equal(ing.shared, true);
  assert.equal(ing.today.stepsText, '11 230');
  assert.equal(ing.today.badge, 'Målet nådd');
  assert.equal(ing.today.sleepText, '7 t 48 m');
  assert.equal(ing.today.sleepRange, '23:10–06:58');
  assert.equal(ing.today.restingHr, 54);
  assert.equal(ing.today.activeKcal, null, 'aktive kalorier deles ikke');
  assert.equal(ing.week.length, 7);
  assert.equal(ing.week[6].today, true);
  assert.equal(ing.week[5].steps, 6000);
  assert.equal(ing.shareText, 'Ingrid deler skritt, søvn og hvilepuls med deg');
  assert.match(ing.sourceText, /Pixel 8/);
  const pal = h.people.find((x) => x.userId === palId);
  assert.deepEqual([pal.shared, pal.text, pal.action.label], [false, 'Pål deler ikke helse med deg', 'Be om deling ›']);
  assert.equal(pal.today, undefined);
  assert.match(h.summary, /^(Ingrid|.*Ingrid.*) har nådd målet\. Du mangler 1 580 skritt\.$/);
  assert.equal(f50.healthSummary50([{ self: true, shared: true, today: { goalReached: false, steps: 8420, remaining: 1580 } }, { name: 'Ingrid', shared: true, today: { goalReached: true } }]), 'Ingrid har nådd målet. Du mangler 1 580 skritt.');
  const one = (await A(`/api/family/health50/${ingridId}`)).body;
  assert.match(one.weekText, /^Snitt denne uken: .* · nådd målet 1 av 7 dager$/);
  const rq = await A(`/api/family/health50/${palId}/request`, 'POST', {});
  assert.equal(rq.body.ok, true);
  assert.ok(pendingFor(palId, 0, 100).some((x) => x.data?.kind === 'health.request'));
  assert.equal((await A('/api/family/health50/ukjent-person')).status, 404);
});

/* ---------------- Sjekk inn ---------------- */

test('Sjekk inn: forslag fra kalender + posisjon, hurtigvalg tilpasset hendelsen', async () => {
  const now = Date.now();
  f50._setCalendar50(async () => ({ events: [
    { id: 'e1', title: 'Bursdag hos Mari', type: 'annet', allDay: false, start: new Date(now - 30 * 60_000).toISOString(), end: new Date(now + 2 * 3_600_000).toISOString(), geo: { lat: 59.8650, lon: 10.7900 } },
    { id: 'e2', title: 'Matte', type: 'time', allDay: false, start: new Date(now - 10 * 60_000).toISOString(), end: new Date(now + 30 * 60_000).toISOString() },
  ] }));
  const s = (await A('/api/family/checkin/suggest?lat=59.8651&lon=10.7901&acc=12')).body;
  assert.equal(s.suggestion.source, 'calendar');
  assert.match(s.suggestion.label, /^Bursdag hos Mari · .+ · ± 12 m$/);
  assert.deepEqual(s.quick.map((x) => x.text), ['Er på bursdag, alt bra', 'Er framme', 'Blir sent', 'Hent meg']);
  assert.equal(s.quick[3].priority, 'high');
  // Hendelse langt unna posisjonen: ingen kalenderforslag.
  const far = (await A('/api/family/checkin/suggest?lat=60.5&lon=10.7&acc=12')).body;
  assert.notEqual(far.suggestion?.source, 'calendar');
  f50._setCalendar50(null);
  assert.equal(f50.partyText50('Russefest'), 'Er på fest, alt bra');
});

test('Sjekk inn: send, mottaker ser sted og posisjon, andre ikke; svar 👍; logg og «Sett av»', async () => {
  const r = await A('/api/family/checkin', 'POST', { to: [ingridId], quick: 'party', text: 'Er på bursdag, alt bra', place: { name: 'Bursdag hos Mari', detail: 'Nordstrand' }, lat: 59.8651, lon: 10.7901, acc: 12, remindInMin: 120 });
  assert.equal(r.status, 201, r.text);
  const c = r.body.checkin;
  assert.equal(c.place.label, 'Bursdag hos Mari · Nordstrand');
  assert.equal(c.seenText, 'Sendt til Ingrid');
  assert.match(c.reminder.text, /^Påminnelse \d\d:\d\d$/);
  assert.match(c.title, /^Sjekket inn \d\d:\d\d$/);
  const push = pendingFor(ingridId, 0, 200).filter((x) => x.data?.checkinId === c.id);
  assert.equal(push.length, 1);
  assert.equal(push[0].title, 'Sebastian sjekket inn');
  assert.equal(push[0].body, 'Er på bursdag, alt bra · Bursdag hos Mari · Nordstrand');
  assert.deepEqual(push[0].data.actions.map((a) => a.title), ['👍', 'Ring', 'Hent']);
  assert.equal(push[0].data.lat, undefined, 'posisjonen ligger ikke i vanlig innsjekk-varsel');
  // Mottakeren ser innsjekken med posisjon; Pål (ikke mottaker) får 404 og ser den ikke i loggen.
  const got = (await I(`/api/family/checkin/${c.id}`)).body.checkin;
  assert.equal(got.position.lat, 59.8651);
  assert.equal(got.reminder, null, 'påminnelsen er bare for avsenderen');
  assert.equal((await P(`/api/family/checkin/${c.id}`)).status, 404);
  assert.equal((await P('/api/family/checkin/log')).body.items.length, 0);
  assert.equal((await A('/api/family/checkin', 'POST', { to: [sebId], text: 'hei' })).status, 400);
  assert.equal((await A('/api/family/checkin', 'POST', { to: ['finnes-ikke'], text: 'hei' })).status, 404);
  assert.equal((await A('/api/family/checkin', 'POST', { to: [ingridId] })).status, 400);
  // Sett og svar.
  await I(`/api/family/checkin/${c.id}/seen`, 'POST', {});
  assert.equal((await A(`/api/family/checkin/${c.id}`)).body.checkin.seenText, 'Sett av Ingrid');
  const rep = await I(`/api/family/checkin/${c.id}/reply`, 'POST', { reply: 'ok' });
  assert.equal(rep.body.checkin.to[0].replyText, '👍');
  assert.ok(pendingFor(sebId, 0, 300).some((x) => x.data?.kind === 'checkin.reply' && x.body === 'Ingrid: 👍'));
  assert.equal((await I(`/api/family/checkin/${c.id}/reply`, 'POST', { reply: 'x' })).status, 400);
  const log = (await A('/api/family/checkin')).body;
  assert.equal(log.latest.id, c.id);
  assert.equal(log.log.title, 'I DAG I FAMILIEN');
  assert.equal(log.log.items[0].title, 'Du sjekket inn');
  assert.equal(log.log.items[0].sub, 'Er på bursdag, alt bra · Bursdag hos Mari');
  assert.ok(log.people.some((p) => p.userId === palId));
});

test('Be noen sjekke inn: «Venter» til de svarer; svar med ett trykk lager innsjekk til den som spurte', async () => {
  const r = await A('/api/family/checkin/request', 'POST', { to: [palId] });
  assert.equal(r.status, 201);
  const id = r.body.request.id;
  assert.equal(r.body.request.title, 'Ber Pål om innsjekk');
  const item = (await A('/api/family/checkin/log')).body.items.find((x) => x.checkinId === id);
  assert.deepEqual([item.right, item.pending, item.avatar.name], ['Venter', true, 'Pål']);
  assert.match(item.sub, /^Sendt \d\d:\d\d · ikke svart$/);
  const p = pendingFor(palId, 0, 200).find((x) => x.data?.checkinId === id);
  assert.equal(p.title, 'Sebastian ber deg sjekke inn');
  assert.ok((await P('/api/family/checkin')).body.requests.some((x) => x.id === id));
  const ans = await P(`/api/family/checkin/${id}/reply`, 'POST', { reply: 'ok', lat: 59.92, lon: 10.75 });
  assert.equal(ans.body.answer.requestId, id);
  assert.equal(ans.body.answer.to[0].userId, sebId);
  const after = (await A('/api/family/checkin/log')).body.items.find((x) => x.checkinId === id);
  assert.deepEqual([after.pending, after.right === 'Venter'], [false, false]);
  assert.ok((await A('/api/family/checkin/log')).body.items.some((x) => x.title === 'Pål sjekket inn'));
  // Svar ved å sjekke inn med requestId.
  const r2 = (await A('/api/family/checkin/request', 'POST', { to: [ingridId], text: 'Alt ok?' })).body.request;
  const ci = await I('/api/family/checkin', 'POST', { requestId: r2.id, quick: 'arrived' });
  assert.equal(ci.status, 201);
  assert.deepEqual(ci.body.checkin.to.map((t) => t.userId), [sebId]);
  assert.equal((await A(`/api/family/checkin/${r2.id}`)).body.checkin.status, 'answered');
});

test('«Hent meg»: høy prioritet med posisjon til valgte personer, også i stille timer', async () => {
  const r = await I('/api/family/checkin', 'POST', { to: [sebId, palId], quick: 'pickup', lat: 59.91, lon: 10.75, acc: 8, place: 'Majorstuen' });
  assert.equal(r.status, 201);
  assert.equal(r.body.checkin.kind, 'pickup');
  assert.equal(r.body.checkin.priority, 'high');
  const p = pendingFor(palId, 0, 300).filter((x) => x.data?.checkinId === r.body.checkin.id)[0];
  assert.equal(p.title, 'Ingrid: Hent meg');
  assert.equal(p.data.priority, 'high');
  assert.deepEqual([p.data.lat, p.data.lon], [59.91, 10.75]);
  // «Hent meg» fra kortet etter innsjekk.
  const base = (await I('/api/family/checkin', 'POST', { to: [sebId], quick: 'arrived', place: 'Fest' })).body.checkin;
  const hm = await I(`/api/family/checkin/${base.id}/pickup`, 'POST', { lat: 59.95, lon: 10.70 });
  assert.equal(hm.status, 201);
  assert.equal(hm.body.checkin.parentId, base.id);
  assert.equal(hm.body.checkin.place.name, 'Fest');
  assert.equal((await A(`/api/family/checkin/${base.id}/pickup`, 'POST', {})).status, 404, 'bare avsenderen');
});

test('påminnelse: «Sjekk inn igjen?» til avsenderen når tiden er inne', async () => {
  const c = (await P('/api/family/checkin', 'POST', { to: [sebId], text: 'På kino', remindInMin: 30 })).body.checkin;
  assert.ok(c.reminder);
  const n = await f50.sweepCheckins50(Date.now() + 31 * 60_000);
  assert.ok(n >= 1);
  assert.ok(pendingFor(palId, 0, 300).some((x) => x.data?.kind === 'checkin.reminder' && x.data.checkinId === c.id));
  assert.equal((await P(`/api/family/checkin/${c.id}`)).body.checkin.reminder.done, true);
  assert.equal((await P(`/api/family/checkin/${c.id}/reminder`, 'PUT', { remindInMin: 5000 })).status, 400);
});

test('helpers: navn, avstand, midnatt', () => {
  assert.equal(f50.joinNames50(['A', 'B', 'C']), 'A, B og C');
  assert.equal(f50.distText50(7400), '7,4 km');
  assert.equal(f50.distText50(234), '230 m');
  const m = f50.osloMidnight50(Date.parse('2026-10-24T12:00:00Z'));
  assert.equal(new Date(m).toISOString(), '2026-10-23T22:00:00.000Z');
});
