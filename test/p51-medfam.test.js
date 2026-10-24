// Prompt 51 (MEDFAM51): Familie og Media – familiekalender med «hvem kjører?» (tildeling, varsel, påminnelse, Ruter-forslag, Kalender),
// «Hva skal vi se i kveld?» (bibliotek + historikk + hvem er hjemme), norske undertekster (Bazarr), lagring med anbefaling og sletting
// med angre (bare admin, aldri uten bekreftelse) og lydbøker/podkaster (Audiobookshelf) med «fortsett der du slapp».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51mf-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51mf';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4612';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DOCKER_HOST;
const MEDIA = mkdtempSync(join(tmpdir(), 'hl-p51mf-media-'));
process.env.BAZARR_URL = 'http://bazarr.test:6767';
process.env.BAZARR_API_KEY = 'bazarr-hemmelig-nokkel-51';
process.env.ABS_URL = 'http://abs.test:13378';
process.env.ABS_TOKEN = 'abs-hemmelig-token-51';
process.env.MEDFAM51_TRASH_DIR = join(MEDIA, 'papirkurv');
process.env.MEDFAM51_PATH_MAP = `/data/media=${MEDIA}`;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const fam = await import('../server/family.js');
const m43 = await import('../server/media43.js');
const C = await import('../server/medfam51/common.js');
const FC = await import('../server/medfam51/famcal.js');
const ST = await import('../server/medfam51/storage.js');
const { pendingFor } = await import('../server/notify.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: ck ? { cookie: ck } : {}, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
assert.equal((await A('/api/users', 'POST', { username: 'pal', password: 'palPassord12345', role: 'bruker', name: 'Pål' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const P = as(await cookie('pal', 'palPassord12345'));
const NONE = as(null);
const sebId = (await A('/api/family')).body.me.userId;
const ingridId = (await I('/api/family')).body.me.userId;
const palId = (await P('/api/family')).body.me.userId;
for (const z of db.prepare('SELECT id FROM family_zone').all()) fam.deletePlace50(z.id);
const HJEM = { lat: 59.9447, lon: 10.6905 };
assert.equal((await A('/api/family/places', 'POST', { name: 'Hjem', type: 'hjem', shared: true, areas: [{ name: 'Huset', ...HJEM, radius_m: 100 }] })).status, 201);

/* ---------------- Falske Sonarr, Radarr, qBittorrent, Bazarr og Audiobookshelf ---------------- */
const S = { calls: [], movieMon: new Map(), seriesMon: new Map(), deleted: [] };
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const GB = 1024 ** 3;
const ago = (d) => new Date(Date.now() - d * 86400_000).toISOString();
const movies = () => [
  { id: 1, title: 'Flow', year: 2024, hasFile: true, runtime: 85, genres: ['Animation', 'Family'], ratings: { imdb: { value: 7.9 } }, added: ago(3), sizeOnDisk: 6 * GB, path: '/data/media/movies/Flow (2024)', monitored: S.movieMon.get(1) ?? true, images: [] },
  { id: 2, title: 'Wicked', year: 2024, hasFile: true, runtime: 160, genres: ['Fantasy', 'Music'], ratings: { imdb: { value: 7.5 } }, added: ago(200), sizeOnDisk: 30 * GB, path: '/data/media/movies/Wicked (2024)', monitored: S.movieMon.get(2) ?? true, images: [] },
  { id: 3, title: 'Dune', year: 2021, hasFile: true, runtime: 155, genres: ['Science Fiction'], ratings: { imdb: { value: 8.0 } }, added: ago(400), sizeOnDisk: 12 * GB, path: '/data/media/movies/Dune (2021)', monitored: true, images: [] },
  { id: 4, title: 'Ikke lastet ned', year: 2026, hasFile: false, runtime: 100, genres: ['Comedy'], images: [] },
];
const series = () => [
  { id: 7, title: 'The Bear', year: 2022, runtime: 30, genres: ['Comedy', 'Drama'], status: 'continuing', path: '/data/media/tv/The Bear', monitored: S.seriesMon.get(7) ?? true, statistics: { episodeFileCount: 20, sizeOnDisk: 40 * GB }, images: [] },
  { id: 8, title: 'Severance', year: 2022, runtime: 50, genres: ['Drama', 'Mystery'], status: 'ended', path: '/data/media/tv/Severance', monitored: S.seriesMon.get(8) ?? true, statistics: { episodeFileCount: 19, sizeOnDisk: 60 * GB }, images: [] },
];
m43._setMediaFetch43(async (url, init = {}) => {
  const u = new URL(url), Pth = u.pathname, method = init.method ?? 'GET';
  S.calls.push(`${method} ${u.host}${Pth}${u.search}`);
  if (u.hostname === 'radarr.test') {
    if (Pth === '/api/v3/movie') return j(movies());
    const m = Pth.match(/^\/api\/v3\/movie\/(\d+)$/);
    if (m && method === 'GET') return j(movies().find((x) => x.id === +m[1]) ?? { message: 'NotFound' }, movies().some((x) => x.id === +m[1]) ? 200 : 404);
    if (m && method === 'PUT') { S.movieMon.set(+m[1], JSON.parse(init.body).monitored); return j(JSON.parse(init.body), 202); }
    if (Pth === '/api/v3/diskspace') return j([{ path: '/data', label: 'Media', freeSpace: 80 * GB, totalSpace: 1000 * GB }]);
    if (Pth === '/api/v3/moviefile') return j([{ id: 900 + +u.searchParams.get('movieId') }]);
    const f = Pth.match(/^\/api\/v3\/moviefile\/(\d+)$/);
    if (f && method === 'DELETE') { S.deleted.push(`moviefile ${f[1]}`); return j({}); }
    return j({ message: `NotFound ${Pth}` }, 404);
  }
  if (u.hostname === 'sonarr.test') {
    if (Pth === '/api/v3/series') return j(series());
    const m = Pth.match(/^\/api\/v3\/series\/(\d+)$/);
    if (m && method === 'GET') return j(series().find((x) => x.id === +m[1]));
    if (m && method === 'PUT') { S.seriesMon.set(+m[1], JSON.parse(init.body).monitored); return j(JSON.parse(init.body), 202); }
    if (Pth === '/api/v3/diskspace') return j([{ path: '/data', label: 'Media', freeSpace: 80 * GB, totalSpace: 1000 * GB }]);
    if (Pth === '/api/v3/episodefile') return j([{ id: 801 }, { id: 802 }]);
    const f = Pth.match(/^\/api\/v3\/episodefile\/(\d+)$/);
    if (f && method === 'DELETE') { S.deleted.push(`episodefile ${f[1]}`); return j({}); }
    return j({ message: `NotFound ${Pth}` }, 404);
  }
  if (u.hostname === 'qbit.test') {
    if (Pth === '/api/v2/auth/login') return new Response('Ok.', { status: 200, headers: { 'set-cookie': 'SID=abc; path=/' } });
    if (Pth === '/api/v2/sync/maindata') return j({ server_state: { free_space_on_disk: 80 * GB } });
    if (Pth === '/api/v2/torrents/info') return j([{ hash: 'a'.repeat(40), size: 5 * GB, state: 'uploading' }]);
    return new Response('Not Found', { status: 404 });
  }
  throw new TypeError('fetch failed');
});
const BZ = { calls: [] };
const ABS = { calls: [] };
C._setMedfam51Fetch(async (url, init = {}) => {
  const u = new URL(url), Pth = u.pathname, method = init.method ?? 'GET';
  if (u.hostname === 'bazarr.test') {
    BZ.calls.push(`${method} ${Pth}${u.search}`);
    if (init.headers?.['X-API-KEY'] !== process.env.BAZARR_API_KEY) return j({}, 401);
    if (Pth === '/api/system/status') return j({ data: { bazarr_version: '1.5.1' } });
    if (Pth === '/api/system/languages') return j([{ code2: 'no', name: 'Norwegian', enabled: true }, { code2: 'en', name: 'English', enabled: true }]);
    if (Pth === '/api/movies' && method === 'GET') return j({ data: u.searchParams.get('radarrid[]') === '1' ? [{ radarrId: 1, title: 'Flow', subtitles: [{ code2: 'en', name: 'English', path: '/movies/Flow/Flow.en.srt' }], missing_subtitles: [{ code2: 'no', name: 'Norwegian' }] }] : [] });
    if (Pth === '/api/episodes' && method === 'GET') return j({ data: [{ sonarrEpisodeId: +u.searchParams.get('episodeid[]'), sonarrSeriesId: 7, title: 'Pilot', subtitles: [{ code2: 'no', name: 'Norwegian', path: '/tv/x.no.srt' }], missing_subtitles: [] }] });
    if (Pth === '/api/movies' && method === 'PATCH') return new Response(null, { status: 204 });
    if (Pth === '/api/series' && method === 'PATCH') return new Response(null, { status: 204 });
    if (Pth === '/api/movies/wanted') return j({ data: [{ radarrId: 1, title: 'Flow', missing_subtitles: [{ code2: 'no', name: 'Norwegian' }] }, { radarrId: 2, title: 'Wicked', missing_subtitles: [{ code2: 'de', name: 'German' }] }], total: 2 });
    if (Pth === '/api/episodes/wanted') return j({ data: [], total: 0 });
    return j({}, 404);
  }
  if (u.hostname === 'abs.test') {
    ABS.calls.push(`${method} ${Pth}`);
    if (init.headers?.Authorization !== `Bearer ${process.env.ABS_TOKEN}`) return j({}, 401);
    if (Pth === '/api/libraries') return j({ libraries: [{ id: 'lib1', name: 'Lydbøker', mediaType: 'book' }, { id: 'lib2', name: 'Podkaster', mediaType: 'podcast' }] });
    if (Pth === '/api/users') return j({ users: [{ id: 'u-ingrid', username: 'ingrid' }, { id: 'u-seb', username: 'sebastian' }] });
    if (Pth === '/api/users/u-ingrid') return j({ id: 'u-ingrid', mediaProgress: [
      { libraryItemId: 'li-book1', currentTime: 3600, duration: 36000, isFinished: false, lastUpdate: Date.now() - 3600_000 },
      { libraryItemId: 'li-pod1', episodeId: 'ep-2', currentTime: 600, duration: 2400, isFinished: false, lastUpdate: Date.now() - 60_000 },
      { libraryItemId: 'li-done', currentTime: 100, duration: 100, isFinished: true, lastUpdate: Date.now() }] });
    if (Pth === '/api/users/u-seb') return j({ id: 'u-seb', mediaProgress: [] });
    if (Pth === '/api/items/li-book1') return j({ id: 'li-book1', mediaType: 'book', media: { duration: 36000, metadata: { title: 'Sofies verden', authorName: 'Jostein Gaarder' } } });
    if (Pth === '/api/items/li-pod1') return j({ id: 'li-pod1', mediaType: 'podcast', media: { metadata: { title: 'Hva skjedde nå?', author: 'NRK' }, episodes: [{ id: 'ep-2', title: 'Uke 43', duration: 2400 }] } });
    if (Pth === '/api/items/li-book1/cover') return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    return j({}, 404);
  }
  throw new TypeError('fetch failed');
});
await A('/api/integrations/sonarr', 'PUT', { sonarr_url: 'http://sonarr.test:8989', sonarr_key: 'sonarr-hemmelig-nokkel' });
await A('/api/integrations/radarr', 'PUT', { radarr_url: 'http://radarr.test:7878', radarr_key: 'radarr-hemmelig-nokkel' });
await A('/api/integrations/qbittorrent', 'PUT', { qbit_url: 'http://qbit.test:8080', qbit_user: 'admin', qbit_pass: 'qbit-hemmelig-passord' });
m43._resetMediaSource43(); m43.clearMedia43();
assert.equal((await A('/api/media/access', 'PUT', { userId: ingridId, allowed: true })).status, 200);
const SECRETS = ['bazarr-hemmelig-nokkel-51', 'abs-hemmelig-token-51', 'sonarr-hemmelig-nokkel', 'radarr-hemmelig-nokkel', 'qbit-hemmelig-passord'];
const noSecrets = (r) => { for (const s of SECRETS) assert.ok(!r.text.includes(s), `hemmeligheten ${s.slice(0, 6)}… lekket`); };

/* ---------------- Familiekalender ---------------- */

const day = (n) => C.ymd(Date.now() + n * 86400_000);
let EV, TASK;
test('familiekalender: krever innlogging, hendelse med kjøreoppgave, alle i familien ser den', async () => {
  assert.equal((await NONE('/api/famcal51/events')).status, 401);
  assert.equal((await A('/api/famcal51/events', 'POST', { title: '' })).status, 400);
  assert.equal((await A('/api/famcal51/events', 'POST', { title: 'Fotball', start: 'i morgen' })).status, 400);
  const r = await A('/api/famcal51/events', 'POST', { title: 'Fotballtrening', start: `${day(2)}T17:00`, end: `${day(2)}T18:30`, place: { name: 'Hallen', lat: 59.95, lon: 10.70 },
    tasks: [{ kind: 'bringing', for: palId }, { kind: 'henting', for: palId }] });
  assert.equal(r.status, 201, r.text);
  EV = r.body.event;
  assert.equal(EV.tasks.length, 2);
  assert.equal(EV.needsDriver, 2);
  const bring = EV.tasks.find((t) => t.kind === 'bringing'), hent = EV.tasks.find((t) => t.kind === 'henting');
  assert.equal(bring.at, new Date(C.osloAt(day(2), '17:00')).toISOString(), 'bringing: framme til start');
  assert.equal(hent.at, new Date(C.osloAt(day(2), '18:30')).toISOString(), 'henting: når hendelsen er ferdig');
  assert.equal(bring.status, 'open');
  assert.match(bring.title, /Bringing av Pål · Fotballtrening/);
  TASK = hent;
  const seen = await I(`/api/famcal51/events?from=${day(0)}&to=${day(7)}`);
  assert.equal(seen.status, 200);
  assert.ok(seen.body.events.some((e) => e.id === EV.id && e.canEdit === false));
  assert.ok(seen.body.members.some((m) => m.userId === palId));
  assert.equal(seen.body.home.name, 'Hjem');
  assert.equal((await I(`/api/famcal51/events/${EV.id}`, 'PATCH', { title: 'Endret' })).status, 403, 'bare den som la inn (eller admin) kan endre');
  assert.equal((await A('/api/famcal51/events/1', 'POST', { kind: 'kjøring' })).status, 404);
  assert.equal((await A(`/api/famcal51/events/${EV.id}/tasks`, 'POST', { kind: 'kjøring' })).status, 400);
  assert.equal((await A(`/api/famcal51/events/${EV.id}/tasks`, 'POST', { kind: 'henting', assignee: 'finnes-ikke' })).status, 400);
});

test('hvem kjører: tildeling varsler sjåføren, «Jeg kjører», si fra seg, gjort', async () => {
  const before = pendingFor(ingridId).length;
  const r = await A(`/api/famcal51/tasks/${TASK.id}`, 'PATCH', { assignee: ingridId });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.task.assignee.userId, ingridId);
  assert.equal(r.body.task.statusText, 'Ingrid kjører');
  const n = pendingFor(ingridId).slice(before);
  assert.equal(n.length, 1);
  assert.match(n[0].title, /^Du kjører: henting/);
  assert.equal(n[0].category, 'familie');
  // Ingrid ser «mine»
  const d = await I('/api/famcal51/drives?mine=1');
  assert.equal(d.body.tasks.length, 1);
  assert.equal(d.body.tasks[0].mine, true);
  // Pål kan ikke si fra seg Ingrids oppgave; Ingrid kan
  assert.equal((await P(`/api/famcal51/tasks/${TASK.id}/release`, 'POST')).status, 403);
  assert.equal((await I(`/api/famcal51/tasks/${TASK.id}/release`, 'POST')).body.task.status, 'open');
  // Pål tar den selv: ingen varsel til seg selv
  const pb = pendingFor(palId).length;
  const cl = await P(`/api/famcal51/tasks/${TASK.id}/claim`, 'POST');
  assert.equal(cl.body.task.assignee.userId, palId);
  assert.equal(cl.body.task.mine, true);
  assert.equal(pendingFor(palId).length, pb);
  const all = await A('/api/famcal51/drives');
  assert.equal(all.body.open, 1);
  assert.equal(all.body.text, '1 uten sjåfør');
});

test('hvem kjører: påminnelse før avreise (med Ruter-forslag) og «ingen sjåfør» til alle én gang', async () => {
  const now = Date.now();
  const ev = (await A('/api/famcal51/events', 'POST', { title: 'Korps', start: new Date(now + 30 * 60_000).toISOString(), end: new Date(now + 90 * 60_000).toISOString(), place: { name: 'Skolen', lat: 59.93, lon: 10.73 },
    tasks: [{ kind: 'bringing', assignee: ingridId }, { kind: 'henting' }] })).body.event;
  const bi = pendingFor(ingridId).length, bp = pendingFor(palId).length;
  const sent = await FC.sweepFamcal51(now);
  assert.ok(sent >= 2);
  const ni = pendingFor(ingridId).slice(bi);
  assert.ok(ni.some((x) => /^Snart bringing/.test(x.title) && /Kollektivt:/.test(x.body)), JSON.stringify(ni));
  assert.ok(pendingFor(palId).slice(bp).some((x) => x.title === 'Hvem kjører?'));
  // Én gang
  const again = pendingFor(palId).length;
  await FC.sweepFamcal51(now + 60_000);
  assert.equal(pendingFor(palId).length, again);
  // Ruter-forslag: hjem → stedet, framme til tiden
  const t = ev.tasks.find((x) => x.kind === 'bringing');
  const ru = await I(`/api/famcal51/tasks/${t.id}/ruter`);
  assert.equal(ru.status, 200);
  assert.equal(ru.body.from.name, 'Hjem');
  assert.equal(ru.body.to.name, 'Skolen');
  assert.equal(ru.body.source, 'Mock');
  assert.ok(ru.body.options.length >= 1);
  assert.ok(Date.parse(ru.body.options[0].arr) <= Date.parse(t.at));
  assert.match(ru.body.text, /^Gå hjemmefra/);
});

test('familiekalender: vises i Kalender for alle i familien, kan slås av per bruker; sletting', async () => {
  const k = await P(`/api/kalender?from=${day(0)}&to=${day(7)}`);
  const evs = k.body?.events ?? k.body?.items ?? [];
  assert.ok(evs.some((e) => e.source === 'familie51' && /Fotballtrening/.test(e.title)), `Kalender: ${k.status} ${k.text.slice(0, 200)}`);
  assert.equal((await P('/api/famcal51/settings', 'PUT', { inCalendar: false })).body.inCalendar, false);
  const k2 = await P(`/api/kalender?from=${day(0)}&to=${day(7)}`);
  assert.ok(!(k2.body?.events ?? []).some((e) => e.source === 'familie51'));
  assert.equal((await I(`/api/famcal51/events/${EV.id}`, 'DELETE')).status, 403);
  assert.equal((await A(`/api/famcal51/events/${EV.id}`, 'DELETE')).status, 200);
  assert.equal(db.prepare('SELECT count(*) FROM famcal51_task WHERE event_id=?').pluck().get(EV.id), 0);
});

/* ---------------- Hva skal vi se i kveld? ---------------- */

const play = (user, title, kind, pct, daysAgo, subtitle = kind === 'movie' ? 'Film' : null) => db.prepare('INSERT INTO plays44(server, skey, user, item, title, subtitle, kind, started, seen, duration, position, percent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('plex', `t-${Math.random()}`, user, title, title, subtitle, kind, Date.now() - daysAgo * 86400_000, Date.now(), 3600_000, 0, pct);

test('i kveld: hvem er hjemme fra Familie, historikk, sjanger/lengde og forklaring per forslag', async () => {
  play('Ingrid', 'Wicked', 'movie', 100, 40);
  play('Sebastian', 'Dune', 'movie', 40, 2);
  play('Ingrid', 'The Bear', 'episode', 100, 3, 'S02E03 · Sundae');
  play('Ingrid', 'Severance', 'episode', 100, 90, 'S02E10 · Cold Harbor');
  play('Sebastian', 'Severance', 'episode', 100, 90, 'S02E10 · Cold Harbor');
  await I('/api/family/me', 'PUT', { sharing: 'on' });
  await I('/api/family/location', 'POST', { ...HJEM });
  await A('/api/family/me', 'PUT', { sharing: 'on' });
  await A('/api/family/location', 'POST', { ...HJEM });
  assert.equal((await P('/api/media51/tonight')).status, 403, 'krever Media-tilgang');
  const h = await A('/api/media51/tonight/home');
  assert.ok(h.body.ids.includes(ingridId) && h.body.ids.includes(sebId), JSON.stringify(h.body));
  const r = await A('/api/media51/tonight');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.who.source, 'familie');
  assert.deepEqual(r.body.who.people.map((p) => p.userId).sort(), [sebId, ingridId].sort());
  const t = r.body.items.map((x) => x.title);
  assert.ok(!t.includes('Ikke lastet ned'), 'bare det som finnes i biblioteket');
  const dune = r.body.items.find((x) => x.title === 'Dune');
  assert.match(dune.reason, /Du har begynt på den \(40 %\)/);
  const bear = r.body.items.find((x) => x.title === 'The Bear');
  assert.equal(bear.next.code, 'S02E04');
  assert.match(bear.reason, /Ingrid så sist S02E03 – neste: S02E04/);
  assert.match(bear.reason, /du har ikke sett den/i);
  const flow = r.body.items.find((x) => x.title === 'Flow');
  assert.match(flow.reason, /Ingen av dere har sett den/);
  assert.match(flow.reason, /nylig lagt til/);
  assert.equal(r.body.phrased, false, 'uten modell: regeltekst');
  // Lengde: maks 90 min → ingen 155/160-minuttersfilmer
  const s = await A('/api/media51/tonight?minutes=90&kind=movie');
  assert.deepEqual(s.body.items.map((x) => x.title), ['Flow']);
  assert.match(s.body.items[0].reason, /1 t 25 min – passer innen 1 t 30 min/);
  // Sjanger på norsk
  const g = await A('/api/media51/tonight?genre=Krim');
  assert.equal(g.body.items.length, 0);
  assert.ok(g.body.empty);
  const d = await A('/api/media51/tonight?genre=Sci-fi');
  assert.deepEqual(d.body.items.map((x) => x.title), ['Dune']);
  assert.ok(r.body.genres.some((x) => x.label === 'Komedie'));
  // Bare Ingrid valgt: Wicked er sett av henne → ute
  const w = await A(`/api/media51/tonight?who=${ingridId}`);
  assert.equal(w.body.who.source, 'valgt');
  assert.ok(!w.body.items.some((x) => x.title === 'Wicked'));
  // Plex-navn
  assert.equal((await I('/api/media51/tonight/profile', 'PUT', { plexUser: 'ingridp' })).body.plexUser, 'ingridp');
  noSecrets(r);
});

/* ---------------- Undertekster ---------------- */

test('undertekster: status, per film/episode, «hent undertekster», mangler norsk – nøkkelen lekker aldri', async () => {
  const st = await I('/api/media51/subs/status');
  assert.equal(st.body.configured, true);
  assert.equal(st.body.norwegian, true);
  assert.equal(st.body.version, '1.5.1');
  assert.equal(st.body.whisper.available, false);
  const m = await I('/api/media51/subs/movie/1');
  assert.equal(m.status, 200);
  assert.equal(m.body.hasNorwegian, false);
  assert.equal(m.body.status, 'mangler');
  assert.equal(m.body.subtitles[0].file, 'Flow.en.srt');
  const e = await I('/api/media51/subs/episode/701');
  assert.equal(e.body.hasNorwegian, true);
  assert.equal((await I('/api/media51/subs/movie/99')).status, 404);
  assert.equal((await I('/api/media51/subs/bok/1')).status, 400);
  const s1 = await I('/api/media51/subs/movie/1/search', 'POST');
  assert.equal(s1.status, 202);
  assert.ok(BZ.calls.includes('PATCH /api/movies?radarrid=1&action=search-missing'));
  const s2 = await I('/api/media51/subs/episode/701/search', 'POST');
  assert.equal(s2.status, 202);
  assert.ok(BZ.calls.includes('PATCH /api/series?seriesid=7&action=search-missing'));
  const w = await I('/api/media51/subs/wanted');
  assert.deepEqual(w.body.items.map((x) => x.title), ['Flow'], 'bare de som mangler norsk');
  for (const r of [st, m, e, s1, s2, w]) noSecrets(r);
});

/* ---------------- Lagring ---------------- */

test('lagring: bare admin, diskbruk og «sett og stort»-liste', async () => {
  assert.equal((await I('/api/media51/storage')).status, 403);
  const r = await A('/api/media51/storage');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.disks.length, 1);
  assert.equal(r.body.disks[0].usedPct, 92);
  assert.equal(r.body.disks[0].warn, true);
  assert.equal(r.body.services.radarr.count, 4);
  assert.equal(r.body.services.qbit.seeding, 1);
  const titles = r.body.recommendations.map((x) => x.title);
  assert.ok(titles.includes('Wicked'), 'sett for 40 dager siden og 30 GB');
  assert.ok(titles.includes('Severance'), 'avsluttet, sett, 60 GB');
  assert.ok(!titles.includes('Dune'), 'påbegynt nylig');
  assert.ok(!titles.includes('Flow'), 'ikke sett og lite');
  assert.ok(!titles.includes('The Bear'), 'pågående serie');
  assert.equal(r.body.trash.configured, true);
  noSecrets(r);
});

test('lagring: sletting krever bekreftelse, flytter til papirkurv, angre innen 24 t; uten papirkurv: Sonarr/Radarr etter 24 t', async () => {
  const dir = join(MEDIA, 'movies', 'Wicked (2024)');
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'Wicked.mkv'), 'x');
  assert.equal((await I('/api/media51/storage/delete', 'POST', { kind: 'movie', id: 2, confirm: true })).status, 403);
  const nc = await A('/api/media51/storage/delete', 'POST', { kind: 'movie', id: 2 });
  assert.equal(nc.status, 400);
  assert.equal(nc.body.code, 'CONFIRM_REQUIRED');
  assert.ok(existsSync(dir));
  const r = await A('/api/media51/storage/delete', 'POST', { kind: 'movie', id: 2, confirm: true });
  assert.equal(r.status, 202, r.text);
  assert.equal(r.body.deletion.mode, 'trash');
  assert.equal(r.body.deletion.canUndo, true);
  assert.ok(!existsSync(dir), 'flyttet til papirkurven');
  assert.equal(S.movieMon.get(2), false, 'overvåking av');
  assert.equal((await A('/api/media51/storage/delete', 'POST', { kind: 'movie', id: 2, confirm: true })).status, 409);
  assert.ok(!(await A('/api/media51/storage')).body.recommendations.some((x) => x.title === 'Wicked'));
  const u = await A(`/api/media51/storage/deletions/${r.body.deletion.id}/undo`, 'POST');
  assert.equal(u.status, 200, u.text);
  assert.equal(u.body.deletion.status, 'undone');
  assert.ok(existsSync(join(dir, 'Wicked.mkv')), 'tilbake på plass');
  assert.equal(S.movieMon.get(2), true);
  assert.equal((await A(`/api/media51/storage/deletions/${r.body.deletion.id}/undo`, 'POST')).status, 409);
  // Serie uten lokal sti (ikke montert): via Sonarr etter 24 t, aldri før
  const s = await A('/api/media51/storage/delete', 'POST', { kind: 'series', id: 8, confirm: true });
  assert.equal(s.body.deletion.mode, 'arr');
  assert.equal(await ST.sweepDeletions51(Date.now()), 0);
  assert.deepEqual(S.deleted, []);
  assert.equal(await ST.sweepDeletions51(Date.now() + 24 * 3600_000 + 1000), 1);
  assert.deepEqual(S.deleted, ['episodefile 801', 'episodefile 802']);
  assert.equal((await A(`/api/media51/storage/deletions/${s.body.deletion.id}/undo`, 'POST')).status, 409);
  // Papirkurven tømmes bare med SLETT, og bare det som er eldre enn 24 t
  const r2 = await A('/api/media51/storage/delete', 'POST', { kind: 'movie', id: 2, confirm: true });
  assert.equal(r2.body.deletion.mode, 'trash');
  assert.equal((await A('/api/media51/storage/trash/empty', 'POST', { confirm: true })).status, 400);
  const e1 = await A('/api/media51/storage/trash/empty', 'POST', { confirm: 'SLETT' });
  assert.equal(e1.body.removed, 0, 'for nytt');
  assert.equal((await A('/api/media51/storage/trash')).body.count, 1);
});

test('lagring: stier utenfor kartet og rot-mappa godtas aldri', () => {
  assert.equal(ST.localPath51('/data/media/../etc/passwd'), null);
  assert.equal(ST.localPath51('/data/media'), null);
  assert.equal(ST.localPath51('/annet/sted'), null);
  assert.equal(ST.localPath51('/data/media/movies/X'), join(MEDIA, 'movies', 'X'));
});

/* ---------------- Lydbøker og podkaster ---------------- */

test('lydbøker: fortsett der du slapp per familiemedlem, omslag via serveren, token aldri ut', async () => {
  const st = await I('/api/media51/audio/status');
  assert.equal(st.body.configured, true);
  assert.equal(st.body.libraries.length, 2);
  const c = await I('/api/media51/audio/continue');
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.absUser, 'ingrid');
  assert.deepEqual(c.body.items.map((x) => x.title), ['Hva skjedde nå?', 'Sofies verden'], 'sist lyttet først, ferdige ute');
  assert.equal(c.body.items[0].episodeTitle, 'Uke 43');
  assert.equal(c.body.items[0].kind, 'podcast');
  assert.equal(c.body.items[1].progress, 10);
  assert.equal(c.body.items[1].remainingText, '9 t igjen');
  assert.equal(c.body.items[1].coverUrl, '/api/media51/audio/cover/li-book1');
  const cov = await I('/api/media51/audio/cover/li-book1');
  assert.equal(cov.status, 200);
  assert.equal(cov.headers.get('content-type'), 'image/jpeg');
  assert.equal((await I('/api/media51/audio/cover/..%2Fusers')).status, 404);
  const seb = await A('/api/media51/audio/continue');
  assert.equal(seb.body.items.length, 0);
  assert.equal((await A('/api/media51/audio/me', 'PUT', { absUser: 'ukjent' })).status, 404);
  assert.equal((await A('/api/media51/audio/me', 'PUT', { absUser: 'ingrid' })).body.absUser, 'ingrid');
  assert.equal((await A('/api/media51/audio/continue')).body.items.length, 2);
  for (const r of [st, c, seb]) noSecrets(r);
  const all = await A('/api/media51/status');
  assert.equal(all.body.subs.configured, true);
  assert.equal(all.body.audio.configured, true);
  noSecrets(all);
});
