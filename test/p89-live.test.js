// Prompt 89 (SRV89): Live Activities / Live Updates – /api/live/* (per bruker), admin-backup, handlinger, rate limit,
// APNs-JWT (ES256) mot en lokal h2c-mock-server, og at .p8-nøkkelen aldri havner i svar eller logg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http2 from 'node:http2';
import { generateKeyPairSync, verify } from 'node:crypto';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p89live-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-89lv';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4892';
for (const k of ['OLLAMA_URL', 'GEMINI_API_KEY', 'DOCKER_HOST', 'ABS_URL', 'ABS_TOKEN', 'APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_P8', 'APNS_BUNDLE_ID', 'APNS_ENV']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const { updateConfig } = await import('../server/settings.js');
const L = await import('../server/live89.js');
const AP = await import('../server/apns.js');
const { createEvent, eventInput } = await import('../server/calendar.js');
const { upsertShipment } = await import('../server/tracking.js');

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

const KEYS = ['id', 'type', 'tittel', 'undertittel', 'verdi', 'progress', 'segmenter', 'meta', 'start', 'slutt', 'status', 'handlinger', 'url'];
function checkShape(a) {
  assert.deepEqual(Object.keys(a).sort(), [...KEYS].sort(), `nøklene i ${a.id}`);
  assert.match(a.id, /^[a-z0-9:_-]{1,80}$/);
  assert.ok(L.TYPES89.includes(a.type));
  assert.ok(['aktiv', 'pause', 'ferdig'].includes(a.status));
  assert.ok(a.progress === null || (a.progress >= 0 && a.progress <= 1), `progress ${a.progress}`);
  if (a.type !== 'pakke') assert.equal(a.segmenter, null);
  for (const k of ['tittel', 'undertittel', 'verdi', 'meta', 'url']) assert.equal(typeof a[k], 'string');
  for (const k of ['start', 'slutt']) assert.ok(a[k] === null || !Number.isNaN(Date.parse(a[k])));
  for (const h of a.handlinger) { assert.ok(L.HANDLINGER89.includes(h.id)); assert.equal(typeof h.tittel, 'string'); }
}
const list = async (who) => { L._resetLive89(); const r = await who('/api/live/aktiviteter'); assert.equal(r.status, 200, r.text); return r.body; };

test('krever innlogging; per bruker: Media bare med tilgang, Spilles nå bare egne (alle for admin)', async () => {
  assert.equal((await NONE('/api/live/aktiviteter')).status, 401);
  assert.equal((await NONE('/api/live/innstillinger')).status, 401);
  const a = await list(A);
  assert.ok(!Number.isNaN(Date.parse(a.oppdatert)));
  a.aktiviteter.forEach(checkShape);
  const dl = a.aktiviteter.filter((x) => x.type === 'nedlasting'), sp = a.aktiviteter.filter((x) => x.type === 'spiller');
  assert.ok(dl.length >= 1, 'admin ser nedlastinger fra qBittorrent-demoen');
  assert.ok(dl.every((x) => x.url === 'homelab://media/ned' && /%|Ferdig/.test(x.verdi)));
  assert.ok(sp.length >= 2, 'admin ser alle avspillinger');
  assert.ok(sp.some((x) => x.status === 'aktiv' && x.handlinger.some((h) => h.id === 'pause') && x.handlinger.some((h) => h.id === 'stopp') && x.slutt));
  // Kari har ikke Media-tilgang.
  const k = await list(K);
  assert.equal(k.aktiviteter.filter((x) => x.type === 'nedlasting' || x.type === 'spiller' || x.type === 'backup').length, 0);
  // Ingrid har Media, men ser bare sin egen avspilling – og først når admin har koblet henne.
  assert.equal((await list(I)).aktiviteter.filter((x) => x.type === 'spiller').length, 0);
  assert.equal((await A(`/api/medctl51/links/${idOf('ingrid')}`, 'PUT', { jellyfin: 'Ingrid' })).status, 200);
  const isp = (await list(I)).aktiviteter.filter((x) => x.type === 'spiller');
  assert.equal(isp.length, 1);
  assert.match(isp[0].undertittel, /Ingrid/);
  assert.equal(isp[0].status, 'pause');
  assert.deepEqual(isp[0].handlinger.map((h) => [h.id, h.tittel]), [['fortsett', 'Spill av'], ['stopp', 'Stopp']]);
  assert.equal(isp[0].slutt, null, 'pauset avspilling tikker ikke');
});

test('innstillinger: standard på, backup alltid av for ikke-admin, bryterne skjuler typene', async () => {
  assert.deepEqual((await A('/api/live/innstillinger')).body, { nedlasting: true, backup: true, spiller: true, avtale: true, pakke: true });
  assert.deepEqual((await I('/api/live/innstillinger')).body, { nedlasting: true, backup: false, spiller: true, avtale: true, pakke: true });
  assert.equal((await I('/api/live/innstillinger', 'PUT', { backup: true })).body.backup, false);
  const r = await A('/api/live/innstillinger', 'PUT', { nedlasting: false, spiller: 'ja' });
  assert.deepEqual(r.body, { nedlasting: false, backup: true, spiller: true, avtale: true, pakke: true });
  assert.equal((await list(A)).aktiviteter.filter((x) => x.type === 'nedlasting').length, 0);
  assert.equal((await A('/api/live/innstillinger', 'PUT', { nedlasting: true })).body.nedlasting, true);
  // Ingrid sine valg påvirker ikke admin.
  await I('/api/live/innstillinger', 'PUT', { spiller: false });
  assert.equal((await A('/api/live/innstillinger')).body.spiller, true);
  await I('/api/live/innstillinger', 'PUT', { spiller: true });
});

test('backup: bare admin ser den (eksisterende backup-status)', async () => {
  const now = Date.now();
  db.prepare("INSERT INTO backup_jobs(id, kind, state, pct, started, scope, modules) VALUES(?,?,?,?,?,?,?)").run('bk-20261114-120000-abc123', 'manual', 'running', 41, now - 60_000, 'all', JSON.stringify(['finans', 'kalender', 'media']));
  try {
    const b = (await list(A)).aktiviteter.find((x) => x.type === 'backup');
    assert.ok(b, 'admin ser backupen');
    checkShape(b);
    assert.equal(b.id, 'backup:sys:bk-20261114-120000-abc123');
    assert.equal(b.verdi, '41 %'); assert.equal(b.progress, 0.41); assert.equal(b.status, 'aktiv');
    assert.match(b.undertittel, /3 moduler/);
    assert.deepEqual(b.handlinger, [], 'backupen kan ikke pauses i dag');
    assert.equal((await list(I)).aktiviteter.filter((x) => x.type === 'backup').length, 0);
    assert.equal((await list(K)).aktiviteter.filter((x) => x.type === 'backup').length, 0);
    const p = await I('/api/live/handling', 'POST', { id: b.id, handling: 'pause' });
    assert.equal(p.status, 404, 'andre brukere får 404 på admin-backupen');
  } finally { db.prepare("UPDATE backup_jobs SET state='done', finished=? WHERE id=?").run(now - 3600_000, 'bk-20261114-120000-abc123'); }
});

test('handlinger: torrent pause/fortsett, spiller pause, ukjent id 404, ugyldig 400, andres id 404', async () => {
  const dl = (await list(A)).aktiviteter.find((x) => x.type === 'nedlasting' && x.status === 'aktiv' && x.id.startsWith('nedlasting:qb:'));
  assert.ok(dl, 'en aktiv torrent i demoen');
  L._resetLive89();
  const p = await A('/api/live/handling', 'POST', { id: dl.id, handling: 'pause' });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.ok, true);
  assert.equal(p.body.aktivitet.status, 'pause');
  assert.deepEqual(p.body.aktivitet.handlinger.map((h) => h.id), ['fortsett']);
  assert.equal((await A('/api/live/handling', 'POST', { id: dl.id, handling: 'pause' })).status, 409, 'pause på noe som er pauset');
  const f = await A('/api/live/handling', 'POST', { id: dl.id, handling: 'fortsett' });
  assert.equal(f.status, 200, f.text); assert.equal(f.body.aktivitet.status, 'aktiv');
  // Kari ser ikke torrenten → 404 (ikke 403, så id-en ikke avslører noe).
  assert.equal((await K('/api/live/handling', 'POST', { id: dl.id, handling: 'pause' })).status, 404);
  assert.equal((await A('/api/live/handling', 'POST', { id: 'nedlasting:qb:finnes-ikke', handling: 'pause' })).status, 404);
  assert.equal((await A('/api/live/handling', 'POST', { id: 'Ugyldig ID!', handling: 'pause' })).status, 400);
  assert.equal((await A('/api/live/handling', 'POST', { id: dl.id, handling: 'slett' })).status, 400);
  assert.match((await A('/api/live/handling', 'POST', { id: dl.id, handling: 'slett' })).body.error, /Ukjent handling/);
  const sp = (await list(A)).aktiviteter.find((x) => x.type === 'spiller' && x.status === 'aktiv');
  L._resetLive89();
  const sr = await A('/api/live/handling', 'POST', { id: sp.id, handling: 'pause' });
  assert.equal(sr.status, 200, sr.text); assert.equal(sr.body.aktivitet.status, 'pause'); assert.equal(sr.body.aktivitet.handlinger[0].tittel, 'Spill av');
  L._resetLive89();
  assert.equal((await A('/api/live/handling', 'POST', { id: sp.id, handling: 'fortsett' })).body.aktivitet.status, 'aktiv');
});

test('neste avtale (innen 60 min): rute gir kart-lenke, utsett skjuler i 5 min per bruker', async () => {
  const kari = idOf('kari'), t = Date.now() + 25 * 60_000;
  const day = new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }), hm = new Date(t).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }).replace('.', ':');
  const v = eventInput({ title: 'Tannlege', allDay: false, date: day, start: hm, location: 'Bogstadveien 27' });
  assert.ok(v.value, v.error);
  await createEvent(kari, v.value);
  const a = (await list(K)).aktiviteter.find((x) => x.type === 'avtale');
  assert.ok(a, 'avtalen vises');
  checkShape(a);
  assert.equal(a.tittel, 'Tannlege');
  assert.match(a.verdi, /^\d+ min$/);
  assert.ok(+a.verdi.split(' ')[0] <= 26 && +a.verdi.split(' ')[0] >= 23);
  assert.equal(Date.parse(a.slutt) - Date.parse(a.start), 3600_000, 'tikker fram mot starttid');
  assert.deepEqual(a.handlinger.map((h) => h.id), ['rute', 'utsett']);
  assert.equal((await list(I)).aktiviteter.filter((x) => x.type === 'avtale' && x.tittel === 'Tannlege').length, 0, 'Ingrid ser ikke Karis avtale');
  const r = await K('/api/live/handling', 'POST', { id: a.id, handling: 'rute' });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.match(r.body.url, /^https:\/\/maps\.apple\.com\//);
  L._resetLive89();
  assert.match((await K('/api/live/handling', 'POST', { id: a.id, handling: 'rute', platform: 'android' })).body.url, /^https:\/\/www\.google\.com\/maps\//);
  L._resetLive89();
  const u = await K('/api/live/handling', 'POST', { id: a.id, handling: 'utsett' });
  assert.equal(u.status, 200); assert.equal(u.body.ok, true);
  assert.ok(Math.abs(Date.parse(u.body.skjultTil) - Date.now() - 5 * 60_000) < 5000);
  assert.equal((await list(K)).aktiviteter.filter((x) => x.type === 'avtale').length, 0, 'skjult etter utsett');
  // Etter 5 min er den tilbake.
  assert.ok((await L.activities89(kari, { now: Date.now() + 5 * 60_000 + 1000, fresh: true })).some((x) => x.id === a.id));
});

test('pakke: ute for levering med segmenter, ikke for andre brukere', async () => {
  upsertShipment({ user: idOf('kari'), trackingNo: 'TESTPKG12345NO', carrier: 'posten', shop: 'Komplett', status: 'out_for_delivery' });
  const p = (await list(K)).aktiviteter.find((x) => x.type === 'pakke');
  assert.ok(p, 'pakken vises');
  checkShape(p);
  assert.equal(p.tittel, 'Komplett');
  assert.deepEqual(p.segmenter, { antall: 4, ferdig: 3 });
  assert.equal(p.status, 'aktiv'); assert.deepEqual(p.handlinger, []);
  assert.equal((await list(I)).aktiviteter.filter((x) => x.type === 'pakke' && x.tittel === 'Komplett').length, 0);
  upsertShipment({ user: idOf('kari'), trackingNo: 'TESTPKG12345NO', carrier: 'posten', shop: 'Komplett', status: 'delivered' });
  const d = (await list(K)).aktiviteter.find((x) => x.id === p.id);
  assert.ok(d, 'levert siste 30 min vises fortsatt');
  assert.equal(d.verdi, 'Levert'); assert.equal(d.status, 'ferdig'); assert.deepEqual(d.segmenter, { antall: 4, ferdig: 4 });
});

test('rate limit på handlinger (per bruker)', async () => {
  L._resetLive89();
  for (let i = 0; i < L.LIMIT89.max; i++) assert.equal((await I('/api/live/handling', 'POST', { id: 'pakke:finnes-ikke', handling: 'pause' })).status, 404);
  const r = await I('/api/live/handling', 'POST', { id: 'pakke:finnes-ikke', handling: 'pause' });
  assert.equal(r.status, 429); assert.ok(+r.headers.get('retry-after') >= 1); assert.match(r.body.error, /For mange/);
  assert.equal((await K('/api/live/handling', 'POST', { id: 'pakke:finnes-ikke', handling: 'pause' })).status, 404, 'andre brukere er ikke sperret');
  L._resetLive89();
});

test('tokens: validering, per bruker, DELETE', async () => {
  assert.equal((await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'pushtostart', token: 'c'.repeat(64) })).body.ok, true);
  assert.equal((await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'liveactivity', token: 'd'.repeat(64), aktivitetId: 'nedlasting:qb:x', type: 'nedlasting' })).body.ok, true);
  assert.equal((await A('/api/live/tokens', 'POST', { platform: 'web', kind: 'pushtostart', token: 'c'.repeat(64) })).status, 400);
  assert.equal((await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'pushtostart', token: 'x' })).status, 400);
  assert.equal((await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'liveactivity', token: 'e'.repeat(64), aktivitetId: 'STOR BOKSTAV' })).status, 400);
  assert.equal((await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'liveactivity', token: 'e'.repeat(64), type: 'tv' })).status, 400);
  assert.equal((await K('/api/live/tokens', 'POST', { platform: 'android', kind: 'fcm', token: 'f'.repeat(40) })).body.ok, true);
  // Ingrid kan ikke slette admins token (DELETE gjelder bare egne).
  assert.equal((await I('/api/live/tokens', 'DELETE', { token: 'c'.repeat(64) })).body.ok, true);
  assert.equal(db.prepare('SELECT COUNT(*) FROM live89_tokens WHERE token=?').pluck().get('c'.repeat(64)), 1);
  assert.equal((await A('/api/live/tokens', 'DELETE', { token: 'c'.repeat(64) })).body.ok, true);
  assert.equal(db.prepare('SELECT COUNT(*) FROM live89_tokens WHERE token=?').pluck().get('c'.repeat(64)), 0);
  assert.equal((await A('/api/live/tokens', 'DELETE', {})).status, 400);
  db.prepare('DELETE FROM live89_tokens').run();
});

test('APNs: uten oppsett ingen push; ES256-JWT, headere og payload mot mock-http2; struping; nøkkelen aldri i svar/logg', async (t) => {
  assert.equal(AP.apnsConf89().on, false);
  assert.deepEqual(await L.pushTick89(), { sent: 0, failed: 0, removed: 0 });
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const keyBody = pem.replace(/-----[^-]+-----|\s/g, '');
  // Ugyldige verdier avvises.
  assert.throws(() => updateConfig({ apns_team: 'for kort' }, OWNER), /ugyldig/);
  updateConfig({ apns_team: 'ABCDE12345', apns_key_id: 'KEY1234567', apns_p8: pem, apns_env: 'sandbox' }, OWNER);
  const conf = AP.apnsConf89();
  assert.equal(conf.on, true); assert.equal(conf.env, 'sandbox'); assert.equal(conf.topic, 'no.kristo.finanshub.push-type.liveactivity');
  assert.ok(!JSON.stringify(conf).includes(keyBody.slice(10, 40)));

  const got = [];
  let reply = () => [200, ''];
  const srv = http2.createServer();
  srv.on('stream', (stream, headers) => {
    let data = '';
    stream.setEncoding('utf8');
    stream.on('data', (d) => { data += d; });
    stream.on('end', () => {
      got.push({ headers, body: JSON.parse(data || '{}') });
      const [st, reason] = reply(headers);
      stream.respond({ ':status': st, 'apns-id': `id-${got.length}`, 'content-type': 'application/json' });
      stream.end(reason ? JSON.stringify({ reason }) : '');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => { AP._setApnsHost89(null); srv.close(); });
  AP._setApnsHost89(`http://127.0.0.1:${srv.address().port}`);
  AP._resetApnsJwt89();

  const logs = [];
  const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
  try {
    // Test tilkobling: BadDeviceToken = nøkkelen er godtatt.
    reply = () => [400, 'BadDeviceToken'];
    assert.equal((await AP.testApns89()).ok, true);
    reply = () => [403, 'InvalidProviderToken'];
    assert.match((await AP.testApns89()).message, /avviste nøkkelen/);
    reply = () => [200, ''];
    got.length = 0;

    const P2S = 'a'.repeat(64);
    assert.equal((await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'pushtostart', token: P2S })).body.ok, true);
    L._resetLive89();
    const now = Date.now();
    const r1 = await L.pushTick89({ now });
    const acts = await L.activities89(OWNER, { now, fresh: true });
    const startable = acts.filter((a) => a.status !== 'ferdig');
    assert.ok(startable.length >= 2);
    assert.equal(r1.sent, startable.length, 'én push-to-start per aktivitet');
    for (const g of got) {
      assert.equal(g.headers[':method'], 'POST');
      assert.equal(g.headers[':path'], `/3/device/${P2S}`);
      assert.equal(g.headers['apns-push-type'], 'liveactivity');
      assert.equal(g.headers['apns-topic'], 'no.kristo.finanshub.push-type.liveactivity');
      assert.equal(g.headers['apns-priority'], '10');
      const m = String(g.headers.authorization).match(/^bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/);
      assert.ok(m, 'bearer <jwt>');
      assert.deepEqual(JSON.parse(Buffer.from(m[1], 'base64url')), { alg: 'ES256', kid: 'KEY1234567' });
      const cl = JSON.parse(Buffer.from(m[2], 'base64url'));
      assert.equal(cl.iss, 'ABCDE12345'); assert.ok(Math.abs(cl.iat - Math.floor(now / 1000)) <= 1);
      assert.equal(Buffer.from(m[3], 'base64url').length, 64, 'ES256-signaturen er r||s (64 byte)');
      assert.ok(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')), 'signaturen stemmer med nøkkelen');
      const aps = g.body.aps;
      assert.equal(aps.event, 'start'); assert.equal(aps['attributes-type'], 'Plat51Attributes');
      assert.ok(acts.some((a) => a.id === aps.attributes.key && a.type === aps.attributes.kind));
      assert.equal(typeof aps['content-state'].title, 'string'); assert.equal(typeof aps['content-state'].progress, 'number');
      assert.ok(aps.alert?.title);
    }
    // Uendret → ingen nye push.
    got.length = 0;
    assert.equal((await L.pushTick89({ now: now + 1000 })).sent, 0);
    // Oppdatering til aktivitets-tokenet, maks hvert 5. s for nedlasting.
    const dl = startable.find((a) => a.type === 'nedlasting' && a.status === 'aktiv' && a.id.startsWith('nedlasting:qb:'));
    const LA = 'b'.repeat(64);
    assert.equal((await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'liveactivity', token: LA, aktivitetId: dl.id, type: 'nedlasting' })).body.ok, true);
    L._resetLive89();
    assert.equal((await A('/api/live/handling', 'POST', { id: dl.id, handling: 'pause' })).status, 200);
    got.length = 0;
    await L.pushTick89({ now: now + 2000 });
    assert.equal(got.filter((g) => g.headers[':path'] === `/3/device/${LA}`).length, 0, 'strupet (under 5 s siden forrige)');
    await L.pushTick89({ now: now + 6000 });
    const up = got.filter((g) => g.headers[':path'] === `/3/device/${LA}`);
    assert.equal(up.length, 1, 'oppdatering etter 5 s');
    assert.equal(up[0].body.aps.event, 'update'); assert.equal(up[0].body.aps['content-state'].status, 'pause'); assert.equal(up[0].headers['apns-priority'], '5');
    // Utløpt token (410) slettes.
    reply = (h) => (h[':path'] === `/3/device/${LA}` ? [410, 'Unregistered'] : [200, '']);
    L._resetHits89();
    assert.equal((await A('/api/live/handling', 'POST', { id: dl.id, handling: 'fortsett' })).status, 200);
    const r3 = await L.pushTick89({ now: now + 12_000 });
    assert.equal(r3.removed, 1);
    assert.equal(db.prepare('SELECT COUNT(*) FROM live89_tokens WHERE token=?').pluck().get(LA), 0);
    // Borte fra lista → end (her: Spilles nå slått av).
    reply = () => [200, ''];
    const SPT = 'e'.repeat(64), sp = startable.find((a) => a.type === 'spiller');
    await A('/api/live/tokens', 'POST', { platform: 'ios', kind: 'liveactivity', token: SPT, aktivitetId: sp.id, type: 'spiller' });
    await A('/api/live/innstillinger', 'PUT', { spiller: false });
    got.length = 0;
    await L.pushTick89({ now: now + 20_000 });
    const end = got.find((g) => g.headers[':path'] === `/3/device/${SPT}`);
    assert.ok(end, 'end sendes'); assert.equal(end.body.aps.event, 'end');
    assert.equal(end.body.aps['dismissal-date'], Math.floor((now + 20_000) / 1000) + 15 * 60);
    await A('/api/live/innstillinger', 'PUT', { spiller: true });
  } finally { for (const k of Object.keys(orig)) console[k] = orig[k]; }

  // Nøkkelen (og JWT-en) finnes aldri i svar eller logg.
  const integ = await A('/api/integrations');
  const ap = (Array.isArray(integ.body) ? integ.body : integ.body.items ?? []).find((x) => x.id === 'apns');
  assert.ok(ap, 'APNs står i Integrasjoner for admin');
  assert.equal(ap.fields.find((f) => f.key === 'apns_p8').value, null);
  assert.equal(ap.fields.find((f) => f.key === 'apns_p8').saved, true);
  assert.ok(!(await I('/api/integrations')).text.includes('"apns"'), 'bare admin ser APNs-oppsettet');
  const jwt = AP.apnsJwt89();
  for (const text of [integ.text, (await A('/api/live/aktiviteter')).text, (await A('/api/config')).text, logs.join('\n')]) {
    assert.ok(!text.includes(keyBody.slice(20, 60)), 'ingen nøkkel');
    assert.ok(!text.includes(jwt.split('.')[2]), 'ingen JWT');
  }
});

test('NRK-jobb: kjører → pause (avbryt i nrk-dl) → fortsett (igjen); tokenet til nrk-dl aldri i svaret', async () => {
  const nrk = await import('../server/nrkdl.js');
  updateConfig({ nrk_url: 'http://nrk.p89:8020', nrk_token: 'nrk-hemmelig-89' }, OWNER);
  let state = 'kjorer';
  const kall = [];
  nrk._setFetchNrk(async (url, init = {}) => {
    const P = new URL(url).pathname;
    kall.push(`${init.method ?? 'GET'} ${P}`);
    if (P === '/api/jobber') return new Response(JSON.stringify({ jobber: [{ id: 'a1b2c3d4e5f6', url: 'https://tv.nrk.no/serie/exit', type: 'tv', status: state, tittel: 'Exit', melding: 'Laster ned S01E03', prosent: 62.4, eta: 300, nr: 3, av: 8, opprettet: 100 },
      { id: 'b1b2c3d4e5f6', status: 'ko', tittel: 'Neste' }], folger: [] }), { headers: { 'content-type': 'application/json' } });
    if (/\/avbryt$/.test(P)) { state = 'avbrutt'; return new Response('{"ok":true}'); }
    if (/\/igjen$/.test(P)) { state = 'kjorer'; return new Response('{"ok":true}'); }
    return new Response('{}');
  });
  try {
    const r = await list(A);
    const j = r.aktiviteter.find((x) => x.id === 'nedlasting:nrk:a1b2c3d4e5f6');
    assert.ok(j); checkShape(j);
    assert.equal(j.verdi, '62 %'); assert.equal(j.progress, 0.624); assert.equal(j.undertittel, '3 av 8 · NRK · 1 i kø'); assert.equal(j.meta, 'Laster ned S01E03');
    assert.ok(Math.abs(Date.parse(j.slutt) - Date.now() - 300_000) < 5000);
    assert.ok(!JSON.stringify(r).includes('nrk-hemmelig'));
    L._resetHits89();
    const p = await A('/api/live/handling', 'POST', { id: j.id, handling: 'pause' });
    assert.equal(p.status, 200, p.text); assert.equal(p.body.aktivitet.status, 'pause'); assert.deepEqual(p.body.aktivitet.handlinger.map((h) => h.id), ['fortsett']);
    assert.ok(kall.includes('POST /api/jobber/a1b2c3d4e5f6/avbryt'));
    const f = await A('/api/live/handling', 'POST', { id: j.id, handling: 'fortsett' });
    assert.equal(f.status, 200); assert.equal(f.body.aktivitet.status, 'aktiv');
    assert.ok(kall.includes('POST /api/jobber/a1b2c3d4e5f6/igjen'));
    assert.equal((await K('/api/live/handling', 'POST', { id: j.id, handling: 'pause' })).status, 404, 'uten Media-tilgang');
  } finally { nrk._setFetchNrk(null); updateConfig({ nrk_url: null, nrk_token: null }, OWNER); L._resetLive89(); }
});
