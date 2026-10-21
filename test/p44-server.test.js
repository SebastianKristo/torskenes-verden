// Prompt 44 (SERVER44): Felles API – Media (den ekte årsaken til «ikke logget inn» på mobil og 504 i interaktivt søk, servere per sted,
// søk som jobb, slett fil, bibliotekssøk), Logger (Docker), Avspilling, Studie-dokumenter, Kalender (deltakere, invitasjon, etag,
// brukerliste, adresser), Gjøremål (deloppgaver, frist, synk), Logg inn som, andres oppsett, overfør eier, tidligere versjoner,
// /api/version, /api/health-fase, refresh-token og Glimt-tid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p44-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-44s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4241';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GITHUB_TOKEN;
delete process.env.DOCKER_HOST;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const m43 = await import('../server/media43.js');
const m44 = await import('../server/media44.js');
const logs = await import('../server/logs44.js');
const kal = await import('../server/kal44.js');
const upd = await import('../server/system-update.js');
const { parseQuick } = await import('../public/js/quick-time.js');

let ipN = 40;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
async function appToken(username, password) {
  const r = await req('/finans/api/login', { method: 'POST', body: { username, password, device: 'iPhone' } });
  assert.equal(r.status, 200, r.text);
  return r.body.token;
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
for (const [u, role, name] of [['ingrid', 'bruker', 'Ingrid'], ['petter', 'admin', 'Petter'], ['kari', 'bruker', 'Kari']]) assert.equal((await A('/api/users', 'POST', { username: u, password: `${u}Passord123`, role, name })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const P = as({ cookie: await login('petter', 'petterPassord123') });
const K = as({ cookie: await login('kari', 'kariPassord123') });
const idOf = (u) => db.prepare('SELECT id FROM users WHERE username=?').pluck().get(u);
const ingridId = idOf('ingrid'), petterId = idOf('petter'), kariId = idOf('kari');
const anon = as({});
assert.equal((await A('/api/media/access', 'PUT', { userId: ingridId, allowed: true })).status, 200);
const TI = as({ authorization: `Bearer ${await appToken('ingrid', 'ingridPassord123')}` });
const TA = as({ authorization: `Bearer ${await appToken('sebastian', 'testpassord1')}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

/* ---------------- Media: «ikke logget inn» på mobil ---------------- */

test('media: én kilde – nøkler lagt inn av en annen admin brukes for alle; app-token = økt = Integrasjoner/status', async () => {
  // Før: Media leste bare eierens (OWNER) personlige verdier. Petter (admin, ikke eier) legger inn Sonarr i Integrasjoner.
  m43._setMediaFetch43(async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname !== 'sonarr.test') return json({}, 404);
    if (u.pathname === '/api/v3/system/status') return init.headers['X-Api-Key'] === 'petter-nokkel' ? json({ version: '4.0.10.2544' }) : json({}, 401);
    return json([]);
  });
  try {
    assert.equal((await P('/api/integrations/sonarr', 'PUT', { sonarr_url: 'http://sonarr.test:8989', sonarr_key: 'petter-nokkel' })).status, 200);
    m43._resetMediaSource43(); m43.clearMedia43();
    assert.deepEqual(m43.mediaSource43('sonarr'), { user: petterId, source: 'admin' });
    for (const who of [A, TA, TI, I]) {
      const s = await who('/api/media/status');
      assert.equal(s.status, 200, s.text);
      const son = s.body.services.find((x) => x.id === 'sonarr');
      assert.deepEqual([son.configured, son.connected, son.ok, son.state, son.version, son.source, son.configSource], [true, true, true, 'ok', '4.0.10.2544', 'server', 'admin']);
      assert.ok(!JSON.stringify(s.body).includes('petter-nokkel'), 'nøkkelen sendes aldri ut');
    }
    // Innstillinger og Media leser samme status.
    const st = await TI('/api/integrations/status');
    assert.equal(st.status, 200, st.text);
    const x = st.body.items.find((y) => y.service === 'sonarr');
    assert.deepEqual([x.connected, x.state, x.source, x.site], [true, 'ok', 'server', 'hjemme']);
    assert.match(x.lastOk, /^\d{4}-/);
    assert.equal((await K('/api/integrations/status')).body.restricted, true, 'uten Media-tilgang: ingen tjenester');
    assert.equal((await anon('/api/integrations/status')).status, 401);
  } finally {
    await P('/api/integrations/sonarr/sonarr_key', 'DELETE'); await P('/api/integrations/sonarr/sonarr_url', 'DELETE');
    m43._setMediaFetch43(null); m43._resetMediaSource43(); m43.clearMedia43();
  }
  assert.equal(m43.svcConf43('sonarr').mock, true);
});

test('media: gamle Plex/Jellyfin-ruter bruker serverens oppsett for brukere med tilgang uten egne verdier', async () => {
  const k = await K('/api/media/now'), i = await I('/api/media/now');
  assert.equal(k.status, 200);
  assert.equal(k.body.configured, false, 'Kari har ikke tilgang til Media: som før');
  assert.equal(i.status, 200, i.text);
  assert.notEqual(i.body.configured, false, 'Ingrid (tilgang) får serverens Plex/Jellyfin');
  assert.equal(i.headers.get('x-media-source'), 'server');
});

/* ---------------- Media: 504 i interaktivt søk ---------------- */

test('media: /release har egen lang grense og prøver igjen ved 504 fra tjenesten', async () => {
  assert.equal(m43.RELEASE_TIMEOUT43, 180_000);
  let n = 0;
  m43._setMediaFetch43(async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname !== 'sonarr.test') return json({}, 404);
    if (u.pathname === '/api/v3/episode/5') return json({ id: 5, seriesId: 1, seasonNumber: 1, episodeNumber: 2, title: 'To' });
    if (u.pathname === '/api/v3/series/1') return json({ id: 1, title: 'Test', qualityProfileId: 4, images: [] });
    if (u.pathname === '/api/v3/qualityprofile') return json([{ id: 4, name: 'HD-1080p' }]);
    if (u.pathname === '/api/v3/release') { n++; assert.ok(init.timeout === 180_000, 'egen grense for /release'); return n === 1 ? new Response('Gateway Timeout', { status: 504 }) : json([{ guid: 'g1', indexerId: 1, indexer: 'X', title: 'Test.S01E02.1080p', quality: { quality: { name: 'WEBDL-1080p', resolution: 1080 } }, size: 1e9, seeders: 10, leechers: 1 }]); }
    return json([]);
  });
  try {
    await A('/api/integrations/sonarr', 'PUT', { sonarr_url: 'http://sonarr.test:8989', sonarr_key: 'k' });
    m43._resetMediaSource43(); m43.clearMedia43();
    const r = await A('/api/media/release?episodeId=5');
    assert.equal(r.status, 200, r.text);
    assert.equal(n, 2, 'ett nytt forsøk');
    assert.equal(r.body.items[0].guid, 'g1');
  } finally {
    await A('/api/integrations/sonarr/sonarr_key', 'DELETE'); await A('/api/integrations/sonarr/sonarr_url', 'DELETE');
    m43._setMediaFetch43(null); m43._resetMediaSource43(); m43.clearMedia43();
  }
});

test('media: interaktivt søk som jobb – status per indekser, delvise treff, én feil stopper ikke resten, cache 10 min, SSE', async () => {
  const sr = await A('/api/media/series');
  const ser = sr.body.items.find((x) => x.title === 'The Bear');
  const det = await A(`/api/media/series/${ser.id}`);
  const ep = det.body.seasons.flatMap((s) => s.episodes).find((e) => e.aired);
  const st = await A('/api/media/release/search', 'POST', { episodeId: ep.id });
  assert.equal(st.status, 202, st.text);
  assert.equal(st.body.cached, false);
  let j;
  for (let i = 0; i < 100; i++) { j = (await A(`/api/media/release/search/${st.body.jobId}`)).body; if (j.state !== 'running') break; await sleep(20); }
  assert.equal(j.state, 'done', JSON.stringify(j));
  assert.ok(j.indexers.length >= 5);
  assert.ok(j.indexers.some((x) => x.state === 'failed'), 'mock-indekseren som feiler');
  assert.ok(j.indexers.some((x) => x.state === 'done' && x.count > 0));
  assert.match(j.indexers.find((x) => x.state === 'done').line, /^✓ \d+ treff · /);
  assert.ok(j.result.items.length > 0 && j.result.items.every((r) => r.guid));
  assert.equal(j.result.context.episodeId, ep.id);
  // Samme søk igjen: fra cache.
  const again = await A('/api/media/search', 'POST', { kind: 'episode', id: ep.id });
  assert.deepEqual([again.status, again.body.cached, again.body.jobId], [200, true, st.body.jobId]);
  assert.match(again.body.ageText, /^Hentet/);
  const sse = await A(`/api/media/release/search/${st.body.jobId}/events`);
  assert.match(sse.headers.get('content-type'), /text\/event-stream/);
  assert.match(sse.text, /event: snapshot/);
  assert.match(sse.text, /event: done/);
  assert.equal((await I(`/api/media/release/search/${st.body.jobId}`)).status, 404, 'andres søk');
  assert.equal((await A('/api/media/release/search', 'POST', {})).status, 400);
  // Film
  const mv = (await A('/api/media/movies')).body.items.find((x) => x.hasFile);
  const ms = await A('/api/media/release/search', 'POST', { movieId: mv.id, force: true });
  assert.equal(ms.status, 202);
  for (let i = 0; i < 100; i++) { j = (await A(`/api/media/search/${ms.body.jobId}`)).body; if (j.state !== 'running') break; await sleep(20); }
  assert.equal(j.service, 'radarr');
  assert.equal(j.state, 'done');
});

test('media: slett episodefil og filmfil (admin), overvåking av + angre; fanart og canRedownload i svarene', async () => {
  const ser = (await A('/api/media/series')).body.items.find((x) => x.episodes.have > 0);
  assert.ok('fanart' in ser);
  const det = (await A(`/api/media/series/${ser.id}`)).body;
  const ep = det.seasons.flatMap((s) => s.episodes).find((e) => e.hasFile);
  assert.equal(ep.canRedownload, true);
  assert.equal((await I(`/api/media/episodes/${ep.id}/file`, 'DELETE')).status, 403, 'bare admin');
  const d = await A(`/api/media/episodes/${ep.id}/file`, 'DELETE');
  assert.equal(d.status, 200, d.text);
  assert.deepEqual([d.body.ok, d.body.monitored, d.body.undo.method, d.body.undo.path], [true, false, 'PUT', `/api/media/episodes/${ep.id}`]);
  const after = (await A(`/api/media/series/${ser.id}`)).body.seasons.flatMap((s) => s.episodes).find((e) => e.id === ep.id);
  assert.deepEqual([after.hasFile, after.monitored], [false, false]);
  assert.equal((await A(`/api/media/episodes/${ep.id}/file`, 'DELETE')).status, 409, 'ingen fil');
  const mv = (await A('/api/media/movies')).body.items.find((x) => x.hasFile);
  const md = await A(`/api/media/movies/${mv.id}/file`, 'DELETE');
  assert.equal(md.status, 200, md.text);
  assert.equal((await A(`/api/media/movies/${mv.id}`)).body.hasFile, false);
});

test('media: bibliotekssøk (?q=, uten aksenter, tellere uten søk) og «Søk etter X for å legge til»', async () => {
  const all = await A('/api/media/series');
  const r = await A('/api/media/series?q=bear');
  assert.ok(r.body.items.length >= 1 && r.body.items.every((x) => /bear/i.test(x.title)));
  assert.deepEqual(r.body.counts, all.body.counts);
  const none = await A('/api/media/series?q=finnesikke');
  assert.equal(none.body.items.length, 0);
  assert.match(none.body.empty, /Ingen serier i biblioteket som heter «finnesikke»/);
  assert.match(none.body.addAction.path, /\/api\/media\/series\/lookup\?term=finnesikke/);
});

test('media: servere per sted (Hjemme/Hytta), felles valg per bruker, ?server=, fallback til Hjemme', async () => {
  assert.equal((await I('/api/media/servers', 'POST', { name: 'Hytta' })).status, 403);
  const c = await A('/api/media/servers', 'POST', { name: 'Hytta', sonarr: { url: 'http://hytta.test:8989', key: 'hyttenokkel' } });
  assert.equal(c.status, 201, c.text);
  assert.deepEqual([c.body.server.id, c.body.server.sonarr.configured, c.body.server.qbit.configured], ['hytta', true, false]);
  assert.ok(!JSON.stringify(c.body).includes('hyttenokkel'));
  let list = (await A('/api/media/servers')).body;
  assert.deepEqual(list.map((x) => [x.id, x.selected]), [['hjemme', true], ['hytta', false]]);
  assert.deepEqual(list[1].missing, ['radarr', 'qbittorrent', 'prowlarr']);
  m43._setMediaFetch43(async (url) => (new URL(url).pathname === '/api/v3/system/status' ? json({ version: '4.1.0' }) : json([])));
  try {
    const sel = await I('/api/media/servers/select', 'PUT', { id: 'hytta' });
    assert.equal(sel.body.selected, 'hytta');
    const st = await I('/api/media/status');
    const son = st.body.services.find((x) => x.id === 'sonarr'), qb = st.body.services.find((x) => x.id === 'qbittorrent');
    assert.deepEqual([son.site, son.version, son.configSource], ['hytta', '4.1.0', 'site']);
    assert.deepEqual([qb.fallback, qb.requestedSite], [true, 'hytta'], 'Hytta mangler qBittorrent → Hjemme');
    assert.equal(st.headers.get('x-media-server'), 'hytta');
    assert.match(st.headers.get('x-media-fallback'), /qbittorrent/);
    // Sebastian har fortsatt Hjemme, men kan velge med ?server=.
    assert.equal((await A('/api/media/status')).body.services.find((x) => x.id === 'sonarr').site, 'hjemme');
    assert.equal((await A('/api/media/status?server=hytta')).body.services.find((x) => x.id === 'sonarr').site, 'hytta');
    assert.equal((await I('/api/integrations/status')).body.site, 'hytta');
  } finally { m43._setMediaFetch43(null); m43.clearMedia43(); }
  assert.equal((await A('/api/media/servers/hytta', 'PUT', { name: 'Hytta 2' })).body.server.name, 'Hytta 2');
  assert.equal((await A('/api/media/servers/hjemme', 'DELETE')).status, 400);
  assert.equal((await A('/api/media/servers/hytta', 'DELETE')).status, 200);
  assert.equal((await I('/api/media/status')).body.services.find((x) => x.id === 'sonarr').site, 'hjemme', 'slettet sted → Hjemme');
});

/* ---------------- Logger ---------------- */

test('logger: bare admin; containere, filter, maskering, grupper, forklaring, handlinger med bekreftelse, nedlasting', async () => {
  for (const p of ['/api/system/containers', '/api/system/logs', '/api/system/logs/groups']) assert.equal((await I(p)).status, 403, p);
  assert.equal((await anon('/api/system/containers')).status, 401);
  const c = await A('/api/system/containers');
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.available, true);
  const cf = c.body.containers.find((x) => x.name === 'cloudflared');
  assert.deepEqual([cf.color, cf.restarts > 3], ['yellow', true]);
  assert.equal(c.body.summary.worst.name, 'cloudflared');
  const l = await A('/api/system/logs?ct=cloudflared&since=1h&level=error');
  assert.ok(l.body.lines.length > 0 && l.body.lines.every((x) => x.level === 'error' && x.ct === 'cloudflared'));
  const q = await A('/api/system/logs?ct=homelab-os&since=24h&q=token');
  assert.ok(q.body.lines.length > 0);
  assert.ok(q.body.lines.every((x) => !x.msg.includes('abc123secret') && x.msg.includes('token=••••')), 'hemmeligheten er maskert');
  const g = await A('/api/system/logs/groups?hours=24');
  assert.ok(g.body.groups[0].count > 1 && g.body.groups[0].explain.path === '/api/system/logs/explain');
  const ex = await A('/api/system/logs/explain', 'POST', { line: g.body.groups.find((x) => x.ct === 'cloudflared').message });
  assert.deepEqual([ex.body.source, ex.body.pattern], ['pattern', 'connection-refused']);
  assert.match(ex.body.steps[0], /tjenestenavnet/);
  assert.equal((await A('/api/system/logs/explain', 'POST', { line: 'helt ukjent ting skjedde' })).body.source, 'none');
  assert.equal((await A('/api/system/containers/postgres/start', 'POST', {})).status, 400, 'krever bekreftelse');
  const s = await A('/api/system/containers/postgres/start', 'POST', { confirm: true });
  assert.deepEqual([s.status, s.body.action], [200, 'start']);
  assert.equal((await A('/api/system/containers')).body.containers.find((x) => x.name === 'postgres').state, 'running');
  assert.equal((await I('/api/system/containers/postgres/stop', 'POST', { confirm: true })).status, 403);
  const ins = await A('/api/system/containers/radarr/inspect');
  assert.ok(ins.body.env.includes('API_KEY=••••'));
  const dl = await A('/api/system/logs/download?ct=cloudflared&since=1h&level=error');
  assert.match(dl.headers.get('content-disposition'), /attachment; filename="homelab-cloudflared-/);
  assert.equal(dl.text.trim().split('\n').length, l.body.lines.length);
});

test('logger: Docker-format, nivåer, maskering og tomtilstand uten socket', () => {
  const frame = (st, s) => { const b = Buffer.from(s); const h = Buffer.alloc(8); h[0] = st; h.writeUInt32BE(b.length, 4); return Buffer.concat([h, b]); };
  const out = logs.demux44(Buffer.concat([frame(1, '2026-10-21T10:00:00.000Z hei\n'), frame(2, '2026-10-21T10:00:01.000Z ERROR feil\n')]));
  assert.deepEqual(out.map((x) => x.stream), ['stdout', 'stderr']);
  assert.equal(logs.levelOf44('{"level":"warn","msg":"x"}'), 'warn');
  assert.equal(logs.levelOf44('[Error] DownloadClientCheck'), 'error');
  assert.equal(logs.levelOf44('FATAL:  could not write'), 'error');
  assert.equal(logs.levelOf44('noe uten nivå', 'stderr'), 'warn');
  const m = logs.maskLog44('GET /x?apikey=0123456789abcdef password=hemmelig Authorization: Bearer abc.def sk-abcdefghijkl');
  assert.ok(!/0123456789abcdef|hemmelig|abc\.def|sk-abcdefghijkl/.test(m), m);
  assert.equal(logs.normalize44('conn 10.0.0.1:443 id 3f2a9c1d2e3f4a5b failed 12 times'), logs.normalize44('conn 10.0.0.9:443 id 9f2a9c1d2e3f4a5c failed 3 times'));
  process.env.MOCK_DATA = '0';
  process.env.DOCKER_SOCKET = '/finnes/ikke.sock';
  try { assert.equal(logs.dockerAvailable44(), false); } finally { process.env.MOCK_DATA = '1'; delete process.env.DOCKER_SOCKET; }
  assert.match(logs.SETUP44.compose, /tecnativa\/docker-socket-proxy/);
});

/* ---------------- Avspilling ---------------- */

test('avspilling: Plex PIN-flyt (admin), spilles nå, historikk med søk, statistikk, biblioteker', async () => {
  assert.equal((await I('/api/playback/plex/pin', 'POST')).status, 403);
  const p = await A('/api/playback/plex/pin', 'POST');
  assert.equal(p.status, 200, p.text);
  assert.match(p.body.authUrl, /^https:\/\/app\.plex\.tv\/auth#\?clientID=/);
  assert.equal((await A(`/api/playback/plex/pin/${p.body.id}`)).body.status, 'waiting');
  const ok = await A(`/api/playback/plex/pin/${p.body.id}`);
  assert.equal(ok.body.status, 'ok');
  assert.ok(!JSON.stringify(ok.body).includes('demo-plex-token'), 'tokenet sendes ikke ut');
  const s = await I('/api/playback/sessions');
  assert.equal(s.status, 200);
  assert.ok(s.body.items.some((x) => x.decision === 'transcode' && x.decisionText === 'Omkoder'));
  assert.equal(s.body.kpi.streams, s.body.items.length);
  const h = await I('/api/playback/history?q=Wicked');
  assert.ok(h.body.items.length > 0 && h.body.items.every((x) => x.title === 'Wicked'));
  assert.ok(h.body.users.length >= 2);
  const st = await I('/api/playback/stats?range=7d');
  assert.equal(st.body.perDay.length, 7);
  assert.ok(st.body.topUsers.length > 0);
  assert.ok((await I('/api/playback/libraries')).body.items.length > 0);
  assert.equal((await K('/api/playback/sessions')).status, 403, 'uten Media-tilgang');
});

/* ---------------- Studie ---------------- */

const TRANSCRIPT = `Universitetet i Oslo\nKarakterutskrift\nStudent: Ingrid Kristo\nStudieprogram: Informatikk\nDato: 20.06.2026\nIN1000 Introduksjon til programmering 10 B Høst 2025\nMAT1100 Kalkulus 10 D Høst 2025\nIN1010 Objektorientert programmering 10 A Vår 2026\nIN1030 Systemer, krav og konsekvenser 10 Bestått Vår 2026\n`;
const upload = (who, text, name = 'utskrift.txt') => { const fd = new FormData(); fd.append('file', new Blob([text], { type: 'text/plain' }), name); return app.request('/api/study/documents', { method: 'POST', headers: who, body: fd }).then(async (r) => ({ status: r.status, body: await r.json() })); };

test('studie: last opp karakterutskrift → emner, snitt og sp regnet i backend, spør, legg i Studie, ny utskrift oppdaterer', async () => {
  const ck = { cookie: await login('ingrid', 'ingridPassord123') };
  const r = await upload(ck, TRANSCRIPT);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const d = r.body.doc;
  assert.deepEqual([d.kind, d.institution, d.student, d.emner.length, d.sp], ['karakterutskrift', 'Universitetet i Oslo', 'Ingrid Kristo', 4, 40]);
  assert.deepEqual(d.emner[0], { kode: 'IN1000', navn: 'Introduksjon til programmering', sp: 10, karakter: 'B', semester: 'Høst 2025', tone: 'good' });
  assert.equal(d.snitt.letter, 'B'); // (4+2+5)/3 = 3,67 → B
  assert.equal(d.snitt.value, 3.67);
  assert.ok(d.found.some((f) => /Svakest: Kalkulus \(D\)/.test(f)));
  assert.deepEqual(d.steps.map((s) => s.key), ['upload', 'read', 'meta', 'courses', 'calc']);
  assert.equal((await A(`/api/study/documents/${d.id}`)).status, 404, 'bare eieren ser dokumentet');
  const a1 = await I(`/api/study/documents/${d.id}/ask`, 'POST', { q: 'har jeg strøk?' });
  assert.match(a1.body.answer, /^Nei/);
  const a2 = await I(`/api/study/documents/${d.id}/ask`, 'POST', { q: 'hva er snittet i matte?' });
  assert.match(a2.body.answer, /Kalkulus/);
  const f = await I(`/api/study/documents/${d.id}/file`);
  assert.equal(f.text, TRANSCRIPT, 'originalen dekrypteres');
  const raw = readFileSync(join(process.env.DATA_DIR, 'study44', ingridId.replace(/[^\w-]/g, ''), `${d.id}.bin`));
  assert.ok(!raw.includes(Buffer.from('Kalkulus')), 'kryptert på disk');
  const ap = await I(`/api/study/documents/${d.id}/apply`, 'POST');
  assert.equal(ap.body.added, 4);
  const r2 = await upload(ck, `${TRANSCRIPT}IN2010 Algoritmer og datastrukturer 10 A Høst 2026\n`);
  assert.equal(r2.body.doc.id, d.id, 'samme studium oppdateres');
  assert.equal(r2.body.doc.compare.newCourses, 1);
  const list = await I('/api/study/documents');
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.kpi.sp, 50);
  const ov = await I('/api/study/overview');
  assert.equal(ov.status, 200);
  assert.ok(Array.isArray(ov.body.deadlines) && ov.body.today && ov.body.documents.length === 1);
  assert.equal((await I(`/api/study/documents/${d.id}`, 'DELETE')).body.ok, true);
});

test('studie: vgs-vitnemål gir karakterpoeng', async () => {
  const ck = { cookie: await login('kari', 'kariPassord123') };
  const r = await upload(ck, 'Vitnemål for videregående opplæring\nNavn: Kari\nNorsk hovedmål 4\nREA3024 Matematikk R2 5\nFysikk 2 6\n');
  assert.equal(r.body.doc.kind, 'vitnemal');
  assert.equal(r.body.doc.snittVgs.value, 5);
  assert.equal(r.body.doc.snittVgs.points, 50);
  assert.ok(r.body.doc.found.some((x) => /ingeniørfag/.test(x)));
});

/* ---------------- Kalender ---------------- */

test('kalender: deltakere (brukere + e-post), invitasjon med .ics fra egen adresse, svar, etag-konflikt, avlysning', async () => {
  const mails = [];
  kal._setSmtp44(async (m) => { mails.push(m); });
  try {
    await A('/api/integrations/smtp', 'PUT', { smtp_host: 'smtp.test', smtp_user: 'sebastian@kristo.no', smtp_pass: 'app-passord', smtp_from: 'Sebastian <sebastian@kristo.no>' });
    assert.equal((await A('/api/kalender/events', 'POST', { title: 'X', allDay: true, date: '2026-10-24', attendees: [{ email: 'ikke en e-post' }] })).status, 400);
    const c = await A('/api/kalender/events', 'POST', { title: 'Kino', allDay: false, date: '2026-10-24', start: '18:00', end: '20:00', location: 'Colosseum', attendees: [{ userId: ingridId }, { email: 'Ola@Example.no', name: 'Ola' }], geo: { lat: 59.9298, lon: 10.7132, label: 'Colosseum kino' } });
    assert.equal(c.status, 201, c.text);
    const ev = c.body.event;
    assert.deepEqual(ev.attendees.map((a) => [a.kind, a.status]), [['user', 'pending'], ['email', 'pending']]);
    assert.equal(ev.attendees[1].email, 'ola@example.no');
    assert.equal(ev.geo.lat, 59.9298);
    assert.match(ev.etag, /^"[0-9a-f]{16}"$/);
    const inv = await A(`/api/kalender/events/${encodeURIComponent(ev.id)}/invite`, 'POST', {});
    assert.equal(inv.status, 200, inv.text);
    assert.deepEqual(inv.body.sent.map((x) => x.via).sort(), ['app', 'smtp']);
    assert.equal(inv.body.from, 'sebastian@kristo.no');
    assert.equal(mails.length, 1);
    assert.equal(mails[0].from, 'sebastian@kristo.no');
    assert.match(mails[0].ics, /METHOD:REQUEST/);
    assert.match(mails[0].ics, /ORGANIZER;CN=Sebastian:mailto:sebastian@kristo\.no/);
    assert.match(mails[0].ics.replace(/\r\n /g, ''), /ATTENDEE;CN=Ola;.*RSVP=TRUE:mailto:ola@example\.no/);
    assert.match(mails[0].raw, /filename="invite\.ics"/);
    // Ingrid har hendelsen i sin kalender og kan svare.
    const li = await I('/api/kalender/invites');
    assert.equal(li.body.items[0].title, 'Kino');
    const evs = await I('/api/kalender?from=2026-10-24&to=2026-10-24');
    assert.ok(JSON.stringify(evs.body).includes('Kino'), 'invitasjonen ligger i kalenderen hennes');
    assert.equal((await I(`/api/kalender/invites/${li.body.items[0].id}/respond`, 'POST', { status: 'accepted' })).body.status, 'accepted');
    const mine = (await A('/api/kalender?from=2026-10-24&to=2026-10-24')).body;
    const me = (mine.events ?? mine.items ?? []).find((e) => e.id === ev.id);
    assert.equal(me.attendees.find((a) => a.userId === ingridId).status, 'accepted');
    // etag: gammel etag → 412, force → ok
    const stale = await A(`/api/kalender/events/${encodeURIComponent(ev.id)}`, 'PATCH', { title: 'Kino 2', etag: '"0000000000000000"' });
    assert.equal(stale.status, 412, stale.text);
    assert.equal(stale.body.conflict, true);
    const forced = await A(`/api/kalender/events/${encodeURIComponent(ev.id)}`, 'PATCH', { title: 'Kino 2', etag: '"0000000000000000"', force: true });
    assert.equal(forced.status, 200, forced.text);
    const ok = await A(`/api/kalender/events/${encodeURIComponent(ev.id)}`, 'PATCH', { note: 'popcorn', etag: forced.body.event.etag });
    assert.equal(ok.status, 200, ok.text);
    // Sletting sender avlysning.
    assert.equal((await A(`/api/kalender/events/${encodeURIComponent(ev.id)}`, 'DELETE')).status, 200);
    await sleep(30);
    assert.ok(mails.some((m) => /METHOD:CANCEL/.test(m.ics)));
    assert.equal((await I('/api/kalender/invites')).body.items.length, 0);
  } finally { kal._setSmtp44(null); }
});

test('kalender: brukerliste, adresseforslag (Kartverket, cache), .ics-format', async () => {
  const d = await I('/api/users/directory');
  assert.ok(d.body.users.length >= 4);
  assert.equal(d.body.users.find((u) => u.self).id, ingridId);
  assert.equal(d.body.me, ingridId);
  assert.deepEqual(await I('/api/geo/address?q=st').then((r) => r.body), [], 'under 3 tegn');
  const g = await I('/api/geo/address?q=storgata 1');
  assert.deepEqual(Object.keys(g.body[0]), ['label', 'street', 'postcode', 'city', 'lat', 'lon', 'source']);
  assert.equal(g.body[0].label, 'Storgata 1, 0155 Oslo');
  const ics = kal.buildIcs44({ id: 'loc-1', title: 'Møte, viktig', allDay: true, date: '2026-12-24' }, { organizer: 'a@b.no', attendees: [{ email: 'c@d.no' }] });
  assert.match(ics, /DTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225/);
  assert.match(ics, /SUMMARY:Møte\\, viktig/);
});

test('Glimt-tid: klokkeslett uten «kl.» og tittel etter dato/tid (lokalt, også i /api/assist)', async () => {
  const T = '2026-10-21';
  const P2 = (t) => { const r = parseQuick(t, T); return [r.title, r.date, r.start, r.end]; };
  assert.deepEqual(P2('time 12.5 16:30 kino dune.'), ['Kino dune', '2027-05-12', '16:30', '17:30']);
  assert.deepEqual(P2('time hos frisør Nina 24.10 kl 14'), ['Frisør Nina', '2026-10-24', '14:00', '14:45']);
  assert.deepEqual(P2('tannlege fredag 0930'), ['Tannlege', '2026-10-23', '09:30', '10:30']);
  assert.deepEqual(P2('kino 1630 i morgen'), ['Kino', '2026-10-22', '16:30', '17:30']);
  for (const t of ['møte 16:00', 'møte 16.00', 'møte kl 16', 'møte 1600', 'møte kl1600', 'møte 16h', 'møte 16t', 'møte 16']) assert.equal(parseQuick(t, T).start, '16:00', t);
  assert.deepEqual([parseQuick('møte 16-17', T).start, parseQuick('møte 16-17', T).end], ['16:00', '17:00']);
  assert.equal(parseQuick('møte 3 nov 2026', T).start, null, 'årstall er ikke tid');
  assert.equal(parseQuick('betal 1600 kr fredag', T).start, null, 'beløp er ikke tid');
  const a = await A('/api/assist', 'POST', { q: 'time 12.5 16:30 kino dune' });
  assert.equal(a.status, 200, a.text);
  assert.deepEqual([a.body.local.title, a.body.local.start, a.body.local.engine], ['Kino dune', '16:30', 'local']);
});

/* ---------------- Gjøremål ---------------- */

test('gjøremål: deloppgaver fra lista (id, huk av, «Fullfør også?»), frist og sted med koordinater, fullfør krysser av resten', async () => {
  const t = await I('/api/tasks', 'POST', { n: 'Pakk til hytta', dl: '2026-10-30', geo: { lat: 60.8, lon: 10.7, label: 'Toten' } });
  assert.equal(t.status, 201, t.text);
  assert.deepEqual([t.body.item.dl, t.body.item.geo.label], ['2026-10-30', 'Toten']);
  const id = t.body.item.id;
  const s1 = await I(`/api/tasks/${id}/subs`, 'POST', { n: 'Sovepose' });
  const s2 = await I(`/api/tasks/${id}/subs`, 'POST', { n: 'Hodelykt' });
  assert.equal(s2.status, 201);
  assert.match(s1.body.sub.id, /^s[0-9a-f]{8}$/);
  assert.equal(s2.body.item.subsText, '0/2');
  const h1 = await I(`/api/tasks/${id}/subs/${s1.body.sub.id}`, 'PATCH', { done: true });
  assert.deepEqual([h1.body.allDone, h1.body.askComplete], [false, false]);
  const h2 = await I(`/api/tasks/${id}/subs/${s2.body.sub.id}`, 'PATCH', { done: true });
  assert.deepEqual([h2.body.allDone, h2.body.askComplete, h2.body.ask], [true, true, 'Fullfør «Pakk til hytta» også?']);
  assert.equal((await I(`/api/tasks/${id}/subs/finnes-ikke`, 'PATCH', { done: true })).status, 404);
  assert.equal((await K(`/api/tasks/${id}/subs`, 'POST', { n: 'x' })).status, 404, 'andres oppgave');
  const s3 = await I(`/api/tasks/${id}/subs`, 'POST', { n: 'Mat' });
  const done = await I(`/api/tasks/${id}`, 'PATCH', { done: true });
  assert.ok(done.body.item.subs.every((x) => x.done), 'fullført → alle deloppgaver krysset av');
  assert.equal((await I(`/api/tasks/${id}/subs/${s3.body.sub.id}`, 'DELETE')).body.item.subs.length, 2);
  assert.equal((await I('/api/tasks', 'POST', { n: 'x', dl: 'i morgen' })).status, 400);
});

test('gjøremål: HA-synk under Innstillinger (GET/PUT /api/tasks/sync, POST /sync/now)', async () => {
  const g = await A('/api/tasks/sync');
  assert.equal(g.status, 200, g.text);
  assert.equal(g.body.on, false);
  assert.ok(g.body.lists.length > 0 && g.body.lists.every((l) => 'entityId' in l));
  assert.equal((await I('/api/tasks/sync', 'PUT', { on: true })).status, 403);
  const listId = g.body.lists[0].id;
  const p = await A('/api/tasks/sync', 'PUT', { on: true, map: { [listId]: 'todo.handleliste' } });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual([p.body.on, p.body.map[listId]], [true, 'todo.handleliste']);
  const n = await A('/api/tasks/sync/now', 'POST');
  assert.equal(n.status, 200, n.text);
  assert.equal((await A('/api/tasks/sync', 'PUT', { on: false, map: { [listId]: null } })).body.on, false);
});

/* ---------------- Logg inn som / andres oppsett ---------------- */

test('logg inn som: bare admin, aldri en annen admin; kortlevd token med act, sperrer, logg, Gå ut, melding og angre', async () => {
  assert.equal((await I('/api/admin/impersonate', 'POST', { userId: kariId })).status, 403);
  assert.equal((await A('/api/admin/impersonate', 'POST', { userId: petterId })).status, 403, 'annen admin');
  assert.equal((await P('/api/admin/impersonate', 'POST', { userId: OWNER })).status, 403, 'eieren');
  const r = await A('/api/admin/impersonate', 'POST', { userId: kariId });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual([r.body.user.id, r.body.act.sub, r.body.ttlSec], [kariId, OWNER, 1800]);
  const X = as({ authorization: `Bearer ${r.body.token}` });
  assert.equal((await X('/api/me')).body.id ?? (await X('/api/me')).body.user?.id, kariId);
  const st = await X('/api/admin/impersonate');
  assert.deepEqual([st.body.active, st.body.actor.id], [true, OWNER]);
  // Sperrer
  assert.equal((await X('/api/password', 'PUT', { current: 'x', next: 'nyttpassord123' })).status, 403);
  assert.equal((await X('/api/auth/2fa/disable', 'POST', {})).status, 403);
  assert.equal((await X('/api/server/owner/transfer', 'POST', { toUserId: kariId })).status, 403);
  const fin = await X('/finans/api/transactions', 'POST', { amount: 10 });
  assert.deepEqual([fin.status, fin.body.readOnly], [403, true], 'Finans er skrivebeskyttet');
  assert.equal((await X('/finans/api/summary')).status, 200, 'men kan leses');
  assert.equal((await X('/api/admin/impersonate', 'POST', { userId: ingridId })).status, 403);
  // Oppsettet endres som Kari.
  assert.equal((await X('/api/me/layout', 'PUT', { appName: 'Karis app' })).status, 200);
  assert.equal(kv.get(kariId, 'layout', {}).appName, 'Karis app');
  const out = await X('/api/admin/impersonate/exit', 'POST');
  assert.deepEqual([out.body.ok, out.body.changes], [true, 1]);
  assert.match(out.body.message, /^Logget ut av Kari · 1 endring lagret\. Du er Sebastian igjen\.$/);
  assert.equal((await X('/api/me')).status, 401, 'X-tokenet er forkastet');
  const n = await K('/api/admin/impersonate/notice');
  assert.equal(n.body.notice.text, 'Sebastian har oppdatert oppsettet ditt');
  const undo = await A(out.body.undo.path, 'POST');
  assert.equal(undo.status, 200, undo.text);
  assert.equal(kv.get(kariId, 'layout', {}).appName, undefined, 'Angre ruller tilbake');
});

test('logg inn som (web): hl_imp-informasjonskapsel gjør nettleser-økten til X til Gå ut', async () => {
  const ck = await login('sebastian', 'testpassord1');
  const r = await req('/api/admin/impersonate', { method: 'POST', headers: { cookie: ck }, body: { userId: kariId, web: true } });
  const imp = (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_imp='));
  assert.ok(imp);
  const both = `${ck}; ${imp}`;
  const me = await req('/api/me', { headers: { cookie: both } });
  assert.equal(me.body.id ?? me.body.user?.id, kariId);
  const ex = await req('/api/admin/impersonate/exit', { method: 'POST', headers: { cookie: both } });
  assert.equal(ex.body.ok, true);
  assert.equal((await req('/api/me', { headers: { cookie: both } })).body.id, OWNER, 'tilbake som admin');
});

test('andres oppsett: GET/PUT, kopier mitt, tilbakestill, lås (423 for X), angre', async () => {
  assert.equal((await I(`/api/users/${kariId}/layout`)).status, 403);
  const p = await A(`/api/users/${kariId}/layout`, 'PUT', { appName: 'Kari' });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual([p.body.layout.appName, p.body.updatedBy], ['Kari', 'Sebastian']);
  assert.equal((await A(`/api/users/${kariId}/layout`, 'PUT', { ukjent: 1 })).status, 400, 'samme validering som /api/me/layout');
  await A('/api/me/layout', 'PUT', { compactNav: true });
  const cp = await A(`/api/users/${kariId}/layout/copy-from-me`, 'POST');
  assert.equal(cp.body.layout.compactNav, true);
  assert.equal(cp.body.layout.appName, 'Kari', 'personlige felt beholdes');
  const lk = await A(`/api/users/${kariId}/layout/lock`, 'PUT', { locked: true });
  assert.deepEqual([lk.body.locked, lk.body.lockedBy], [true, 'Sebastian']);
  const own = await K('/api/me/layout', 'PUT', { compactNav: false });
  assert.deepEqual([own.status, own.body.error], [423, 'Oppsettet styres av Sebastian']);
  assert.equal((await K('/api/me/layout')).body.locked, true);
  await A(`/api/users/${kariId}/layout/lock`, 'PUT', { locked: false });
  const rs = await A(`/api/users/${kariId}/layout/reset`, 'POST');
  assert.equal(rs.body.layout.compactNav, undefined);
  const u = await A(`/api/users/${kariId}/layout/undo`, 'POST');
  assert.equal(u.body.layout.compactNav, true);
});

/* ---------------- Eierskap ---------------- */

test('overfør eier: mottaker må ha 2FA, reauth, eier overfører direkte, admin trenger godkjenning', async () => {
  const o = await A('/api/server/owner');
  assert.deepEqual([o.body.owner.id, o.body.me.isOwner], [OWNER, true]);
  assert.equal(o.body.candidates.find((x) => x.id === petterId).eligible, false);
  assert.equal((await A('/api/server/owner/transfer', 'POST', { toUserId: petterId, password: 'testpassord1' })).status, 409, 'uten 2FA');
  db.prepare('UPDATE users SET totp_enabled=1 WHERE id IN (?, ?)').run(petterId, OWNER);
  assert.equal((await A('/api/server/owner/transfer', 'POST', { toUserId: petterId })).status, 403, 'krever passord/reauth');
  assert.equal((await A('/api/server/owner/transfer', 'POST', { toUserId: petterId, password: 'feil' })).status, 403);
  assert.equal((await I('/api/server/owner/transfer', 'POST', { toUserId: petterId, password: 'ingridPassord123' })).status, 403, 'vanlig bruker');
  const t = await A('/api/server/owner/transfer', 'POST', { toUserId: petterId, password: 'testpassord1' });
  assert.equal(t.status, 200, t.text);
  assert.equal(t.body.owner.id, petterId);
  assert.equal((await A('/api/server/owner')).body.owner.id, petterId);
  assert.equal(db.prepare('SELECT role FROM users WHERE id=?').pluck().get(OWNER), 'admin', 'forrige eier er fortsatt admin');
  // Sebastian (admin, ikke eier) vil overføre tilbake: Petter må godkjenne.
  const pend = await A('/api/server/owner/transfer', 'POST', { toUserId: OWNER, password: 'testpassord1' });
  assert.equal(pend.status, 202, pend.text);
  assert.equal((await A(`/api/server/owner/transfer/${pend.body.pending.id}/approve`, 'POST', { password: 'testpassord1' })).status, 403, 'bare eieren godkjenner');
  const ap = await P(`/api/server/owner/transfer/${pend.body.pending.id}/approve`, 'POST', { password: 'petterPassord123' });
  assert.equal(ap.status, 200, ap.text);
  assert.equal((await A('/api/server/owner')).body.owner.id, OWNER);
  db.prepare('UPDATE users SET totp_enabled=0 WHERE id IN (?, ?)').run(petterId, OWNER);
});

/* ---------------- Tidligere versjoner ---------------- */

test('tidligere versjoner: lista kommer fra updaterens versions.json; rollback sender bare target + restoreBackup; pause 7 dager', async () => {
  const UPD = upd._paths.UPD, BK = upd._paths.BACKUPS;
  mkdirSync(UPD, { recursive: true }); mkdirSync(BK, { recursive: true });
  const cur = (await A('/api/version')).body.version;
  writeFileSync(join(UPD, 'versions.json'), JSON.stringify({ current: cur, versions: [{ version: cur, sha: 'a'.repeat(40), installed: true }, { version: '4.37.0', sha: 'b'.repeat(40), installed: true, dbSchema: 43 }, { version: '4.20.0', sha: 'c'.repeat(40), installed: false, dbSchema: 12 }] }));
  writeFileSync(join(UPD, 'history.json'), JSON.stringify({ entries: [{ sha: 'a'.repeat(40), version: cur, at: 2 }, { sha: 'b'.repeat(40), version: '4.37.0', at: 1 }] }));
  writeFileSync(join(BK, 'pre-update-2026-10-21T11-50-00-000Z.db'), 'x');
  writeFileSync(join(BK, 'update-backups.json'), JSON.stringify({ items: [{ name: 'pre-update-2026-10-21T11-50-00-000Z.db', fromVersion: '4.37.0', at: Date.now() - 3600_000 }] }));
  writeFileSync(join(UPD, 'heartbeat'), String(Math.floor(Date.now() / 1000)));
  try { (await import('node:fs')).rmSync(join(UPD, 'request.json'), { force: true }); writeFileSync(join(UPD, 'status.json'), JSON.stringify({ id: 'x', state: 'done' })); } catch { /* */ }
  assert.equal((await I('/api/update/versions')).status, 403);
  const v = await A('/api/update/versions');
  assert.equal(v.status, 200, v.text);
  const old = v.body.find((x) => x.version === '4.37.0');
  assert.deepEqual([old.hasBackup, old.compatible, old.previous, old.current], [true, true, true, false]);
  assert.equal(v.body.find((x) => x.version === cur).current, true);
  assert.equal(v.body.find((x) => x.version === '4.20.0').compatible, false);
  assert.equal((await A('/api/update/rollback', 'POST', { version: '9.9.9' })).status, 404, 'ikke i updaterens liste');
  assert.equal((await A('/api/update/rollback', 'POST', { version: 'main; rm -rf' })).status, 400);
  assert.equal((await A('/api/update/rollback', 'POST', { version: '4.20.0', restoreBackup: false })).status, 409, 'databasen er endret: må gjenopprette');
  const r = await A('/api/update/rollback', 'POST', { version: '4.37.0', restoreBackup: true, pauseAutoDays: 7, sha: 'f'.repeat(40), repo: 'evil/evil' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.target.version, r.body.restoreBackup], ['4.37.0', true]);
  const rq = JSON.parse(readFileSync(join(UPD, 'request.json'), 'utf8'));
  assert.deepEqual(Object.keys(rq).sort(), ['action', 'at', 'id', 'requestedBy', 'restoreBackup', 'target']);
  assert.deepEqual([rq.action, rq.target, rq.restoreBackup], ['rollback', '4.37.0', true]);
  assert.ok(Date.parse(r.body.pausedUntil) > Date.now() + 6 * 86400_000);
  assert.ok(upd.updatePause44());
  const idx = JSON.parse(readFileSync(join(BK, 'update-backups.json'), 'utf8'));
  assert.equal(idx.items[0].fromVersion, cur, 'ny backup tatt fra versjonen som kjører');
  // /api/health: under nedlasting er restarting false (web blir på siden), bare «restarting» viser oppstartsskjermen.
  const h1 = await A('/api/health');
  assert.deepEqual([h1.body.updating, h1.body.restarting, h1.body.phase], [true, false, 'downloading']);
  writeFileSync(join(UPD, 'status.json'), JSON.stringify({ id: rq.id, state: 'building', action: 'rollback' }));
  assert.deepEqual(await A('/api/health').then((x) => [x.body.restarting, x.body.phase]), [false, 'installing']);
  writeFileSync(join(UPD, 'status.json'), JSON.stringify({ id: rq.id, state: 'restarting', action: 'rollback' }));
  assert.deepEqual(await A('/api/health').then((x) => [x.body.restarting, x.body.phase]), [true, 'restarting']);
  const us = await A('/api/update/status');
  assert.deepEqual([us.body.phase, us.body.from], ['restarting', cur]);
  writeFileSync(join(UPD, 'status.json'), JSON.stringify({ id: rq.id, state: 'done', action: 'rollback' }));
  (await import('node:fs')).rmSync(join(UPD, 'request.json'), { force: true });
  kv.set(OWNER, 'update_pause', null);
});

test('/api/version: features uten innlogging', async () => {
  const v = await anon('/api/version');
  assert.equal(v.status, 200);
  for (const f of ['logs', 'media.search.jobs', 'impersonate', 'update.versions', 'calendar.invite']) assert.ok(v.body.features.includes(f), f);
  assert.equal(v.body.api, 44);
});

/* ---------------- Refresh-token og app-logg ---------------- */

test('Kalender: refresh-token roterer, 60 s grace gir samme svar, gammelt etter grace = invalid_grant; app-logg', async () => {
  const dt = await A('/api/auth/device-token', 'POST', { app: 'kalender' });
  const ex = await req('/api/auth/device-exchange', { method: 'POST', body: { device_token: dt.body.device_token, app: 'kalender', device: 'iPad' } });
  assert.equal(ex.status, 200, ex.text);
  assert.match(ex.body.refresh, /^hlr_/);
  const r1 = await req('/api/auth/refresh', { method: 'POST', body: { refresh: ex.body.refresh } });
  assert.equal(r1.status, 200, r1.text);
  assert.notEqual(r1.body.token, ex.body.token);
  const r1b = await req('/api/auth/refresh', { method: 'POST', body: { refresh: ex.body.refresh } });
  assert.equal(r1b.body.token, r1.body.token, 'samtidig fornyelse innen 60 s → samme svar');
  assert.equal((await req('/api/me', { headers: { authorization: `Bearer ${ex.body.token}` } })).status, 401, 'det gamle tilgangstokenet er trukket tilbake');
  assert.equal((await req('/api/me', { headers: { authorization: `Bearer ${r1.body.token}` } })).status, 200);
  const r2 = await req('/api/auth/refresh', { method: 'POST', body: { refresh: r1.body.refresh } });
  assert.equal(r2.status, 200);
  assert.equal((await req('/api/auth/refresh', { method: 'POST', body: { refresh: 'hlr_' + 'x'.repeat(43) } })).body.error, 'invalid_grant');
  const lg = await req('/api/apps/kalender/log', { method: 'POST', body: { events: [{ event: 'cal.firstFrame', ms: 212, platform: 'ios' }, { event: '$(rm)' }] } });
  assert.deepEqual(lg.body, { ok: true, n: 1 });
});
