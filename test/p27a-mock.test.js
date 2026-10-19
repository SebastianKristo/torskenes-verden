// Prompt 27 (SERVER-A) med MOCK_DATA=1: egne hendelser lagres lokalt (kv kal_local_events) uten Google, Nyhetsleser
// (image, readMin, /api/rss/article), Ruter på Hjem (home_departures, /api/widgets/departures) og språk (language).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p27am-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p27am-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.MOCK_DATA = '1';
delete process.env.SCHOOL_ICAL_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Ingen nett (AI-motorene feiler raskt, så sammendraget kommer fra demoteksten eller utdraget).
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const rss = await import('../server/rss.js');
const { kv, OWNER } = await import('../server/db.js');

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

/* ---------------- Kalender i demo ---------------- */

test('Demo-timeplanen: timer kommer, og en time om 1 time er now.next', async () => {
  const r = await S(`/api/kalender?from=2026-10-19&to=2026-10-25&now=${at('2026-10-19T07:15:00+02:00')}`);
  assert.equal(r.status, 200, r.text);
  const lessons = r.body.events.filter((e) => e.type === 'time');
  assert.ok(lessons.length >= 15, `timer i uken (${lessons.length})`);
  const first = day(r.body, '2026-10-19').filter((e) => e.type === 'time')[0];
  assert.equal(first.time.slice(0, 5), '08:15');
  assert.equal(r.body.now.next.id, first.id);
  assert.equal(r.body.now.next.inMin, 60);
  assert.equal(r.body.calendars.find((c) => c.id === 'privat').writable, true, 'lokal lagring i demo');
});

test('Egne hendelser uten Google (MOCK): lagres i kal_local_events, vises, gjentas, endres og slettes', async () => {
  const r = await S('/api/kalender/events', 'POST', { title: 'Fotballtrening', allDay: false, date: '2026-10-20', start: '18:00', end: '19:30', location: 'Kampen', calendar: 'familie', repeat: 'weekly', reminder: '15m', note: 'Ta med drikke' });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual([r.body.event.title, r.body.event.calendar, r.body.event.editable, r.body.event.recurrence, r.body.event.reminder, r.body.event.time], ['Fotballtrening', 'familie', true, 'weekly', '15m', '18:00–19:30']);
  const stored = kv.get(OWNER, 'kal_local_events', []);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].calendar, 'familie');
  let k = await S('/api/kalender?from=2026-10-19&to=2026-11-08');
  const all = k.body.events.filter((e) => e.title === 'Fotballtrening');
  assert.deepEqual(all.map((e) => e.date), ['2026-10-20', '2026-10-27', '2026-11-03'], 'ukentlig');
  assert.equal(all[1].start, '2026-10-27T17:00:00.000Z', 'vintertid');
  // Endre serien fra én forekomst.
  const p = await S(`/api/kalender/events/${encodeURIComponent(all[1].id)}`, 'PATCH', { title: 'Fotball', repeat: 'none', date: '2026-10-21' });
  assert.equal(p.status, 200, p.text);
  k = await S('/api/kalender?from=2026-10-19&to=2026-11-08');
  assert.deepEqual(k.body.events.filter((e) => /Fotball/.test(e.title)).map((e) => [e.title, e.date]), [['Fotball', '2026-10-21']]);
  // Heldag over flere dager.
  const h = await S('/api/kalender/events', 'POST', { title: 'Hytta', allDay: true, date: '2026-10-23', endDate: '2026-10-25', calendar: 'privat' });
  assert.equal(h.status, 201, h.text);
  assert.deepEqual([h.body.event.date, h.body.event.end, h.body.event.inAllDayRow], ['2026-10-23', '2026-10-26', true]);
  // Kopier skolens time til Privat.
  const lesson = day(k.body, '2026-10-19').find((e) => e.type === 'time');
  const cp = await S(`/api/kalender/events/${encodeURIComponent(lesson.id)}/copy`, 'POST');
  assert.equal(cp.status, 201, cp.text);
  assert.equal(cp.body.event.calendar, 'privat');
  assert.equal(cp.body.event.time, lesson.time);
  // Kari har sin egen liste.
  assert.ok(!(await K('/api/kalender?from=2026-10-19&to=2026-11-08')).body.events.some((e) => /Fotball|Hytta/.test(e.title)));
  assert.equal((await K(`/api/kalender/events/${encodeURIComponent(h.body.event.id)}`, 'DELETE')).status, 404);
  // Slette.
  const f = (await S('/api/kalender?from=2026-10-21&to=2026-10-21')).body.events.find((e) => e.title === 'Fotball');
  assert.equal((await S(`/api/kalender/events/${encodeURIComponent(f.id)}`, 'DELETE')).status, 200);
  assert.equal(kv.get(OWNER, 'kal_local_events', []).length, 2);
});

/* ---------------- Nyhetsleser ---------------- */

test('Nyheter: image (RSS, og:image fra siden) og readMin på hver sak', async () => {
  // Saker uten bilde i feeden får og:image fra artikkelsiden.
  rss._setArticleFetch(async (url) => `<html><head><meta property="og:image" content="/bilder/${encodeURIComponent(url.split('/').pop())}.jpg"><title>Sak</title></head><body><article>${'<p>Dette er et avsnitt med nok ord til å telle som ekte tekst i saken her.</p>'.repeat(60)}</article></body></html>`);
  const r = await S('/api/rss');
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.items.length > 5);
  assert.ok(r.body.items.every((i) => 'image' in i && Number.isInteger(i.readMin) && i.readMin >= 1));
  const withOg = r.body.items.filter((i) => /\/bilder\//.test(i.image ?? ''));
  assert.ok(withOg.length > 0, 'og:image hentet for saker uten bilde');
  assert.ok(withOg.every((i) => i.readMin === 4), 'lesetid fra teksten (900 ord / 230)');
  assert.ok(r.body.items.some((i) => /picsum/.test(i.image ?? '')), 'bilde fra feeden');
  rss._setArticleFetch(null);
});

test('Artikkelvisning: sammendrag, 3 punkter, AI-merknad, lesetid og relaterte saker; bare egne saker', async () => {
  rss._setArticleFetch(null);
  const items = (await S('/api/rss')).body.items;
  const it = items[0];
  const a = await S(`/api/rss/article?url=${encodeURIComponent(it.url)}`);
  assert.equal(a.status, 200, a.text);
  assert.deepEqual([a.body.url, a.body.title, a.body.source, a.body.category], [it.url, it.title, it.feed, it.category]);
  assert.ok(a.body.summary.length > 40, JSON.stringify(a.body));
  assert.equal(a.body.points.length, 3);
  assert.equal(a.body.aiNote, 'Laget av AI fra saken. Kan inneholde feil.', JSON.stringify(a.body));
  assert.ok(Number.isInteger(a.body.readMin));
  assert.ok(Array.isArray(a.body.related) && a.body.related.every((x) => x.category === it.category && x.id !== it.id));
  assert.ok('image' in a.body && 'published' in a.body);
  // Cache per URL: samme svar uten ny henting.
  assert.equal((await S(`/api/rss/article?url=${encodeURIComponent(it.url)}`)).body.summary, a.body.summary);
  assert.equal((await S('/api/rss/article?url=https%3A%2F%2Fukjent.example%2Fsak')).status, 404, 'bare saker fra egne kilder');
  assert.equal((await S('/api/rss/article?url=javascript:alert(1)')).status, 400);
  // Uten AI og uten demotekst: utdrag fra selve saken (ai:false, ingen AI-merknad).
  rss._setArticleFetch(async () => `<html><body><article><p>Første setning i saken er her og den er lang nok. Andre setning følger etter den første.</p><p>Tredje setning står i neste avsnitt og er også lang. Fjerde setning. Femte setning avslutter.</p></article></body></html>`);
  const b = await S(`/api/rss/article?url=${encodeURIComponent(items[1].url)}`);
  assert.equal(b.status, 200, b.text);
  assert.equal(b.body.ai, false);
  assert.equal(b.body.aiNote, null);
  assert.match(b.body.summary, /^Første setning/);
  assert.equal(b.body.points.length, 3);
  rss._setArticleFetch(null);
});

test('articleOf: enkel readability fra <article>/<p> og og:image', () => {
  const a = rss.articleOf('<html><head><meta property="og:image" content="https://img.no/a.jpg"><meta property="og:title" content="Tittel"></head><body><nav><p>Meny meny meny meny meny meny meny meny meny</p></nav><article><p>' + 'ord '.repeat(460) + '</p><script>x</script></article><footer><p>Bunntekst bunntekst bunntekst bunntekst bunntekst</p></footer></body></html>');
  assert.equal(a.image, 'https://img.no/a.jpg');
  assert.equal(a.title, 'Tittel');
  assert.equal(a.readMin, 2);
  assert.ok(!/Meny|Bunntekst/.test(a.text));
});

/* ---------------- Ruter på Hjem ---------------- */

test('home_departures: valgte stopp (≤ 3) og n avganger i /api/mobile/home; uten valg alle stopp som før', async () => {
  assert.equal((await S('/api/me/stops', 'PUT', { stops: [{ id: 'NSR:StopPlace:58366', name: 'Jernbanetorget' }, { id: 'NSR:StopPlace:6350', name: 'Bislett' }, { id: 'NSR:StopPlace:58404', name: 'Majorstuen' }, { id: 'NSR:StopPlace:4000', name: 'Aker brygge' }] })).status, 200);
  let h = await S('/api/mobile/home');
  // Uten eget valg: alle Mine stopp med 4 avganger som før (widgetene bruker første stopp og 3).
  assert.deepEqual(h.body.stops.map((s) => s.name), ['Jernbanetorget', 'Bislett', 'Majorstuen', 'Aker brygge']);
  assert.equal(h.body.stops[0].departures.length, 4);
  assert.deepEqual(h.body.homeDepartures, { stops: ['NSR:StopPlace:58366'], n: 3, chosen: false });
  const put = await S('/api/me/home-departures', 'PUT', { stops: ['NSR:StopPlace:6350', '58404'], n: 2 });
  assert.equal(put.status, 200, put.text);
  assert.deepEqual(put.body, { stops: ['NSR:StopPlace:6350', 'NSR:StopPlace:58404'], n: 2, chosen: true });
  h = await S('/api/mobile/home');
  assert.deepEqual(h.body.stops.map((s) => [s.name, s.departures.length]), [['Bislett', 2], ['Majorstuen', 2]]);
  // Samme felt i /api/me/layout.
  assert.deepEqual((await S('/api/me/layout')).body.home_departures, { stops: ['NSR:StopPlace:6350', 'NSR:StopPlace:58404'], n: 2 });
  assert.equal((await S('/api/me/layout', 'PUT', { home_departures: { n: 4 } })).status, 200);
  assert.deepEqual((await S('/api/me/home-departures')).body.n, 4);
  for (const bad of [{ stops: ['1', '2', '3', '4'] }, { n: 0 }, { n: 5 }, { stops: ['tull'] }, { stops: ['1', '1'] }]) assert.equal((await S('/api/me/home-departures', 'PUT', bad)).status, 400, JSON.stringify(bad));
  assert.equal((await S('/api/me/layout', 'PUT', { home_departures: { n: 9 } })).status, 400);
  // Kari har sitt eget.
  assert.equal((await K('/api/me/home-departures')).body.chosen, false);
});

test('/api/widgets/departures: standard = Hjem-stoppene, stop/lines/dir-filter, avvik og refreshAt', async () => {
  let w = await S('/api/widgets/departures');
  assert.equal(w.status, 200, w.text);
  assert.deepEqual(w.body.stops.map((s) => s.id), ['NSR:StopPlace:6350', 'NSR:StopPlace:58404']);
  const d = w.body.stops[0].departures[0];
  for (const k of ['line', 'dest', 'time', 'minutes', 'realtime', 'color']) assert.ok(k in d, k);
  assert.ok(Date.parse(w.body.refreshAt) > Date.now() + 4 * 60_000);
  assert.ok(Array.isArray(w.body.deviations));
  w = await S('/api/widgets/departures?stop=NSR:StopPlace:58366&lines=5,3');
  assert.deepEqual(w.body.stops.map((s) => s.name), ['Jernbanetorget']);
  assert.ok(w.body.stops[0].departures.length > 0 && w.body.stops[0].departures.every((x) => ['5', '3'].includes(x.line)));
  w = await S('/api/widgets/departures?stop=58366&dir=vestli');
  assert.ok(w.body.stops[0].departures.every((x) => /vestli/i.test(x.dest)));
  assert.ok(w.body.deviations.length <= 5);
  assert.equal((await S('/api/widgets/departures?stop=tull')).status, 400);
  assert.equal((await app.request('/api/widgets/departures')).status, 401);
});

/* ---------------- Språk ---------------- */

test('language: nb standard, PATCH /api/me og layout, i /api/me og /api/state, per bruker', async () => {
  assert.equal((await S('/api/me')).body.language, 'nb');
  let r = await S('/api/me', 'PATCH', { language: 'en' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.language, 'en');
  assert.equal((await S('/api/me')).body.language, 'en');
  assert.equal((await S('/api/me/layout')).body.language, 'en');
  assert.equal((await S('/api/state')).body.me.language, 'en');
  assert.equal((await S('/api/me', 'PATCH', { language: 'de' })).status, 400);
  assert.equal((await S('/api/me/layout', 'PUT', { language: 'nb' })).body.language, 'nb');
  assert.equal((await S('/api/me/layout', 'PUT', { language: 'sv' })).status, 400);
  assert.equal((await K('/api/me')).body.language, 'nb');
  // Artikkelsammendraget lages på brukerens språk (egen cache per språk).
  await S('/api/me', 'PATCH', { language: 'en' });
  const it = (await S('/api/rss')).body.items[2];
  const a = await S(`/api/rss/article?url=${encodeURIComponent(it.url)}`);
  assert.equal(a.body.aiNote, 'Made by AI from the article. May contain errors.');
  await S('/api/me', 'PATCH', { language: 'nb' });
});
