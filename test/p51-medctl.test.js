// Prompt 51 (MEDCTL51): mediekontroll – play/pause/stopp/neste/forrige/søk i tid og volum for aktive avspillinger i Plex og
// Jellyfin via deres egne API-er (nøklene blir på serveren), Audiobookshelf-fremdrift, hvem som kan styre hva, og rate limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51mc-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51mc';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4631';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DOCKER_HOST;
delete process.env.ABS_URL;
delete process.env.ABS_TOKEN;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { kv, OWNER } = await import('../server/db.js');
const { setUserCfg } = await import('../server/settings.js');
const PB = await import('../server/playback44.js');
const MC = await import('../server/medctl51.js');
const MF = await import('../server/medfam51/common.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: ck ? { cookie: ck } : {}, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord1234', role: 'bruker', name: 'Kari' })).status, 200);
const users = (await A('/api/users')).body;
const idOf = (n) => (users.users ?? users).find((u) => u.username === n).id;
kv.set(OWNER, 'media43_access', { users: [idOf('ingrid')] });
const I = as(await cookie('ingrid', 'ingridPassord123'));
const K = as(await cookie('kari', 'kariPassord1234'));
const NONE = as(null);

test('kobling til Plex/Jellyfin-navn: bare admin, unik, og profilnavnet i «I kveld» gir aldri tilgang', async () => {
  MC._resetMedctl51();
  const n0 = await I('/api/medctl51/now');
  const own0 = n0.body.items.find((x) => x.user === 'Ingrid'), petter = n0.body.items.find((x) => x.user === 'Petter');
  assert.ok(!own0.mine && !own0.canControl && /administrator koble/.test(own0.controlText), 'uten kobling: bare se');
  assert.equal((await I(`/api/medctl51/sessions/${own0.id}/pause`, 'POST')).status, 403);
  // Forsøk på å ta over Petters økt via profilnavnet i «I kveld» → fortsatt 403.
  assert.equal((await I('/api/media51/tonight/profile', 'PUT', { plexUser: 'Petter' })).status, 200);
  const f = await I(`/api/medctl51/sessions/${petter.id}/pause`, 'POST');
  assert.equal(f.status, 403); assert.equal(f.body.code, 'NOT_YOURS');
  assert.ok(!(await I('/api/medctl51/now')).body.items.find((x) => x.id === petter.id).canControl);
  // Bare admin kan koble, og samme mediebrukernavn kan ikke kobles til to brukere.
  assert.equal((await I(`/api/medctl51/links/${idOf('ingrid')}`, 'PUT', { plex: 'Petter' })).status, 403);
  assert.equal((await I('/api/medctl51/links')).status, 403);
  const ok = await A(`/api/medctl51/links/${idOf('ingrid')}`, 'PUT', { jellyfin: 'Ingrid', plex: 'Ingrid' });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.body.link.jellyfin, 'Ingrid');
  const dup = await A(`/api/medctl51/links/${idOf('kari')}`, 'PUT', { jellyfin: 'ingrid' });
  assert.equal(dup.status, 409); assert.equal(dup.body.code, 'LINK_TAKEN');
  assert.equal((await A('/api/medctl51/links/finnes-ikke', 'PUT', { plex: 'X' })).status, 404);
  const L = (await A('/api/medctl51/links')).body.links;
  assert.equal(L.find((x) => x.userId === idOf('ingrid')).plex, 'Ingrid');
  assert.equal(L.find((x) => x.userId === idOf('kari')).jellyfin, null);
  await I('/api/media51/tonight/profile', 'PUT', { plexUser: '' });
});

test('demo: spilles nå med kontroller – eier og admin kan styre, andre ikke', async () => {
  MC._resetMedctl51();
  assert.equal((await NONE('/api/medctl51/now')).status, 401);
  assert.equal((await K('/api/medctl51/now')).status, 403, 'uten Media-tilgang');
  const n = await I('/api/medctl51/now');
  assert.equal(n.status, 200, n.text);
  const mine = n.body.items.find((x) => x.user === 'Ingrid'), other = n.body.items.find((x) => x.user === 'Petter');
  assert.ok(mine.mine && mine.canControl && mine.controls.includes('playpause') && mine.controls.includes('volume'));
  assert.ok(!other.mine && !other.canControl && other.controls.length === 0 && /administrator/.test(other.controlText));
  assert.equal(n.body.admin, false);
  assert.ok(n.body.audio.some((x) => x.server === 'audiobookshelf' && x.user === 'Ingrid' && x.canControl === false && x.progressText), 'Audiobookshelf-fremdrift');

  const f = await I(`/api/medctl51/sessions/${other.id}/pause`, 'POST');
  assert.equal(f.status, 403); assert.equal(f.body.code, 'NOT_YOURS');
  assert.equal(mine.state, 'paused');
  const p = await I(`/api/medctl51/sessions/${mine.id}/toggle`, 'POST');
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.action, 'play'); assert.equal(p.body.item.state, 'playing');
  const sk = await I(`/api/medctl51/sessions/${mine.id}/seek`, 'POST', { position: 60_000 });
  assert.equal(sk.body.item.position, 60_000); assert.match(sk.body.message, /1:00/);
  const rel = await I(`/api/medctl51/sessions/${mine.id}/seek`, 'POST', { offset: -120_000 });
  assert.equal(rel.body.item.position, 0, 'klemmes til 0');
  const v = await I(`/api/medctl51/sessions/${mine.id}/volume`, 'POST', { volume: 140 });
  assert.equal(v.body.item.volume, 100);
  assert.equal((await I(`/api/medctl51/sessions/${mine.id}/seek`, 'POST', {})).status, 400);
  assert.equal((await I(`/api/medctl51/sessions/${mine.id}/hopp`, 'POST')).status, 400);
  assert.equal((await I('/api/medctl51/sessions/finnes-ikke/pause', 'POST')).status, 404);

  // Admin kan styre andres.
  const a = await A('/api/medctl51/now');
  assert.equal(a.body.admin, true);
  assert.ok(a.body.items.every((x) => x.canControl));
  const st = await A(`/api/medctl51/sessions/${other.id}/stop`, 'POST');
  assert.equal(st.status, 200); assert.equal(st.body.item, null);
  assert.ok(!(await A('/api/medctl51/now')).body.items.some((x) => x.id === other.id), 'stoppet forsvinner');
});

test('rate limit per bruker: 429 med Retry-After', async () => {
  MC._resetMedctl51();
  const id = (await I('/api/medctl51/now')).body.items.find((x) => x.mine).id;
  let last;
  for (let i = 0; i < 13; i++) last = await I(`/api/medctl51/sessions/${id}/toggle`, 'POST');
  assert.equal(last.status, 429); assert.equal(last.body.code, 'RATE_LIMIT');
  assert.ok(+last.headers.get('retry-after') >= 1);
  assert.equal((await A(`/api/medctl51/sessions/${id}/pause`, 'POST')).status, 200, 'andre brukere påvirkes ikke');
  assert.ok(MC.rateCheck51('x', 0) === 0);
});

test('Plex og Jellyfin: riktige kall til egne API-er, nøkler aldri ut, reserve for Stopp og 409 uten fjernkontroll', async () => {
  MC._resetMedctl51();
  setUserCfg(OWNER, { plex_url: 'http://plex.test:32400', plex_token: 'PLEX-HEMMELIG-51', jf_url: 'http://jf.test:8096', jf_key: 'JF-HEMMELIG-51' });
  const calls = [];
  let plexPlayerOk = true;
  PB._setPlaybackFetch44(async (url, o = {}) => {
    const u = new URL(url);
    calls.push({ url: String(url), method: o.method ?? 'GET', headers: o.headers ?? {}, body: o.body });
    const json = (j, s = 200) => new Response(JSON.stringify(j), { status: s, headers: { 'content-type': 'application/json' } });
    if (u.host === 'plex.test:32400' && u.pathname === '/status/sessions') {
      return json({ MediaContainer: { Metadata: [{ type: 'movie', title: 'Flow', year: 2024, duration: 5_000_000, viewOffset: 1_000_000, sessionKey: '7', ratingKey: '55', User: { title: 'Ingrid' }, Player: { title: 'Stue-TV', platform: 'tvOS', state: 'playing', machineIdentifier: 'mach-1' }, Session: { id: 'sess-abc', bandwidth: 1000 }, Media: [{}] }] } });
    }
    if (u.host === 'plex.test:32400' && u.pathname.startsWith('/player/playback/')) return plexPlayerOk ? new Response('', { status: 200 }) : new Response('', { status: 404 });
    if (u.host === 'plex.test:32400' && u.pathname === '/status/sessions/terminate') return new Response('', { status: 200 });
    if (u.host === 'jf.test:8096' && u.pathname === '/Sessions') {
      return json([
        { Id: 'jf1', UserName: 'Sebastian', DeviceName: 'iPad', Client: 'Jellyfin iOS', SupportsRemoteControl: true, Capabilities: { SupportedCommands: ['SetVolume'] }, PlayState: { PositionTicks: 600_000_000, IsPaused: false, VolumeLevel: 40 }, NowPlayingItem: { Id: 'i1', Name: 'Pilot', SeriesName: 'Severance', ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: 30_000_000_000 } },
        { Id: 'jf2', UserName: 'Ingrid', DeviceName: 'Nettleser', Client: 'Web', SupportsRemoteControl: false, PlayState: { PositionTicks: 0 }, NowPlayingItem: { Id: 'i2', Name: 'Wicked', ProductionYear: 2024, RunTimeTicks: 9_000_000_000 } },
      ]);
    }
    if (u.host === 'jf.test:8096' && u.pathname.startsWith('/Sessions/')) return new Response(null, { status: 204 });
    return new Response('nei', { status: 500 });
  });
  try {
    const n = await I('/api/medctl51/now');
    assert.equal(n.status, 200, n.text);
    assert.ok(!/HEMMELIG|mach-1|sess-abc/.test(n.text), 'nøkler og interne id-er sendes ikke ut');
    const flow = n.body.items.find((x) => x.title === 'Flow'), web = n.body.items.find((x) => x.id === 'jf-jf2'), sev = n.body.items.find((x) => x.id === 'jf-jf1');
    assert.ok(flow.mine && flow.canControl);
    assert.ok(web.mine && !web.canControl && /kan ikke fjernstyres/.test(web.controlText));
    assert.ok(!sev.mine && !sev.canControl);

    calls.length = 0;
    assert.equal((await I(`/api/medctl51/sessions/${flow.id}/pause`, 'POST')).status, 200);
    const pc = calls.find((x) => x.url.includes('/player/playback/pause'));
    assert.ok(pc && pc.headers['X-Plex-Target-Client-Identifier'] === 'mach-1' && /type=video/.test(pc.url));
    await I(`/api/medctl51/sessions/${flow.id}/seek`, 'POST', { position: 120_000 });
    assert.ok(calls.some((x) => /\/player\/playback\/seekTo\?.*offset=120000/.test(x.url)));
    await I(`/api/medctl51/sessions/${flow.id}/volume`, 'POST', { volume: 30 });
    assert.ok(calls.some((x) => /setParameters\?.*volume=30/.test(x.url)));
    plexPlayerOk = false;
    const nx = await I(`/api/medctl51/sessions/${flow.id}/next`, 'POST');
    assert.equal(nx.status, 409); assert.equal(nx.body.code, 'UNSUPPORTED');
    assert.ok(!nx.text.includes('HEMMELIG'));
    calls.length = 0;
    assert.equal((await I(`/api/medctl51/sessions/${flow.id}/stop`, 'POST')).status, 200, 'Stopp faller tilbake til terminate');
    assert.ok(calls.some((x) => /\/status\/sessions\/terminate\?sessionId=sess-abc/.test(x.url)));

    assert.equal((await I('/api/medctl51/sessions/jf-jf2/pause', 'POST')).status, 409, 'Jellyfin uten fjernkontroll');
    assert.equal((await I('/api/medctl51/sessions/jf-jf1/pause', 'POST')).status, 403);
    calls.length = 0;
    assert.equal((await A('/api/medctl51/sessions/jf-jf1/pause', 'POST')).status, 200);
    const jc = calls.find((x) => x.url.endsWith('/Sessions/jf1/Playing/Pause'));
    assert.ok(jc && jc.method === 'POST' && jc.headers['X-Emby-Token'] === 'JF-HEMMELIG-51');
    await A('/api/medctl51/sessions/jf-jf1/seek', 'POST', { offset: 30_000 });
    assert.ok(calls.some((x) => /Playing\/Seek\?SeekPositionTicks=900000000$/.test(x.url)), 'posisjon 60 s + 30 s i ticks');
    const vol = await A('/api/medctl51/sessions/jf-jf1/volume', 'POST', { delta: 10 });
    assert.equal(vol.body.item.volume, 50);
    const vc = calls.find((x) => x.url.endsWith('/Sessions/jf1/Command'));
    assert.deepEqual(JSON.parse(vc.body), { Name: 'SetVolume', Arguments: { Volume: '50' } });
  } finally { PB._setPlaybackFetch44(null); setUserCfg(OWNER, { plex_url: null, plex_token: null, jf_url: null, jf_key: null }); }
});

test('Audiobookshelf: åpne lytteøkter – egne for brukeren, alle for admin, tokenet blir på serveren', async () => {
  MC._resetMedctl51();
  process.env.ABS_URL = 'http://abs.test:13378';
  process.env.ABS_TOKEN = 'ABS-HEMMELIG-51';
  MF._setMedfam51Fetch(async (url) => {
    const u = new URL(url);
    const json = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/api/users/online') return json({ usersOnline: [], openSessions: [
      { id: 's1', userId: 'u1', libraryItemId: 'li1', displayTitle: 'Sofies verden', displayAuthor: 'Jostein Gaarder', mediaType: 'book', currentTime: 3600, duration: 36000, deviceInfo: { deviceName: 'iPhone' } },
      { id: 's2', userId: 'u2', libraryItemId: 'li2', displayTitle: 'Dune', mediaType: 'book', currentTime: 10, duration: 100 },
    ] });
    if (u.pathname === '/api/users') return json({ users: [{ id: 'u1', username: 'ingrid' }, { id: 'u2', username: 'sebastian' }] });
    return new Response('', { status: 404 });
  });
  try {
    const n = await I('/api/medctl51/now');
    assert.deepEqual(n.body.audio.map((x) => x.title), ['Sofies verden']);
    assert.equal(n.body.audio[0].progress, 10);
    assert.equal(n.body.audio[0].coverUrl, '/api/media51/audio/cover/li1');
    assert.ok(!n.text.includes('ABS-HEMMELIG'));
    MC._resetMedctl51();
    assert.equal((await A('/api/medctl51/now')).body.audio.length, 2);
  } finally { MF._setMedfam51Fetch(null); delete process.env.ABS_URL; delete process.env.ABS_TOKEN; }
});
