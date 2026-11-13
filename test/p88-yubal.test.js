// Musikk i Media: server/yubal.js er eneste vei inn til yubal (som ikke har innlogging). Adressen blir på serveren, alt
// valideres her, og 409 «køen er full» kommer frem som norsk tekst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p88y-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-88y';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.YUBAL_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { updateConfig } = await import('../server/settings.js');
const { OWNER } = await import('../server/db.js');
const y = await import('../server/yubal.js');
const { INTEGRATIONS } = await import('../server/integrations-api.js');

async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
const lr = await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.88' }, body: { username: 'sebastian', password: 'testpassord1' } });
assert.equal(lr.status, 200, lr.text);
const cookie = (lr.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
const A = (path, method = 'GET', body) => req(path, { method, headers: { cookie }, body });

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const SUB = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const JOB1 = '11111111-2222-4333-8444-555555555555';
const JOB2 = '99999999-8888-4777-8666-555555555555';
const YURL = 'http://yubal.p88.lan:8010';

test('ikke satt opp: GET svarer configured:false, ingen kall', async () => {
  let n = 0;
  y._setFetchYubal(async () => { n++; return json({}); });
  for (const p of ['/status', '/jobs', '/subscriptions', `/subscriptions/${SUB}/tracks`]) {
    const r = await A(`/api/media/yubal${p}`);
    assert.equal(r.status, 200, p);
    assert.equal(r.body.configured, false, p);
    assert.match(r.body.message, /ikke satt opp/);
  }
  const i = await A(`/api/media/yubal/info?url=${encodeURIComponent('https://music.youtube.com/playlist?list=PL1')}`);
  assert.equal(i.body.configured, false);
  const p = await A('/api/media/yubal/jobs', 'POST', { url: 'https://music.youtube.com/playlist?list=PL1' });
  assert.equal(p.status, 503);
  assert.equal((await y.testYubal()).ok, false);
  assert.equal(n, 0);
});

test('bare YouTube-lenker godtas, også i proxyen', async () => {
  for (const ok of ['https://music.youtube.com/playlist?list=PLx', 'https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'http://m.youtube.com/watch?v=x', 'https://youtube.com/playlist?list=1']) assert.ok(y.ytLenke(ok), ok);
  for (const bad of ['https://evil.com/?u=music.youtube.com', 'https://music.youtube.com.evil.com/x', 'javascript:alert(1)', 'https://user:pw@youtube.com/x', 'https://youtube.com:444/x', 'ftp://youtube.com/x', '', null, `https://youtube.com/${'a'.repeat(2100)}`]) assert.equal(y.ytLenke(bad), null, String(bad));
  updateConfig({ yubal_url: `${YURL}/` }, OWNER);
  let n = 0;
  y._setFetchYubal(async () => { n++; return json({ id: JOB1 }, 201); });
  const r = await A('/api/media/yubal/jobs', 'POST', { url: 'https://evil.example/playlist?list=1' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Bare lenker fra music\.youtube\.com/);
  const i = await A(`/api/media/yubal/info?url=${encodeURIComponent('http://10.0.0.1/api')}`);
  assert.equal(i.status, 400);
  assert.equal(n, 0);
});

test('max_items valideres (1–10000 eller utelatt)', async () => {
  assert.equal(y.maxItems(undefined), undefined);
  assert.equal(y.maxItems(''), undefined);
  assert.equal(y.maxItems(50), 50);
  assert.equal(y.maxItems('25'), 25);
  for (const bad of [0, -1, 10001, 1.5, 'x', '5e2', true, [3]]) assert.throws(() => y.maxItems(bad), /helt tall/, String(bad));
  const kall = [];
  y._setFetchYubal(async (url, init = {}) => { kall.push({ url, init }); return json({ id: JOB1, message: 'Job created' }, 201); });
  assert.equal((await A('/api/media/yubal/jobs', 'POST', { url: 'https://music.youtube.com/playlist?list=PL1', max_items: 0 })).status, 400);
  assert.equal(kall.length, 0);
  const r = await A('/api/media/yubal/jobs', 'POST', { url: 'https://music.youtube.com/playlist?list=PL1', max_items: 40 });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { id: JOB1 });
  assert.equal(kall[0].url, `${YURL}/api/jobs`);
  assert.deepEqual(JSON.parse(kall[0].init.body), { url: 'https://music.youtube.com/playlist?list=PL1', max_items: 40 });
});

test('409 «køen er full» sendes videre som norsk tekst', async () => {
  y._setFetchYubal(async () => json({ error: 'queue_full', message: 'Job queue is full. Wait for existing jobs to complete.' }, 409));
  const r = await A('/api/media/yubal/jobs', 'POST', { url: 'https://youtu.be/abc' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Køen i yubal er full/);
  y._setFetchYubal(async () => json({ detail: 'Job already finished' }, 409));
  const c = await A(`/api/media/yubal/jobs/${JOB1}/cancel`, 'POST');
  assert.equal(c.status, 409);
  assert.match(c.body.error, /allerede ferdig/);
  assert.equal((await A('/api/media/yubal/jobs/ikke-en-uuid/cancel', 'POST')).status, 400);
});

test('forhåndsvisning, kø og abonnement går via serveren; adressen lekker aldri', async () => {
  const kall = [];
  const JOBS = { jobs: [
    { id: JOB1, url: 'https://music.youtube.com/playlist?list=PLa', audio_format: 'm4a', subscription_id: SUB, source: 'scheduler', status: 'completed', progress: 100, content_info: { title: 'Fredagsfest', artist: 'Spilleliste', kind: 'playlist', track_count: 3, thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg' }, download_stats: { success: 3, failed: 0, skipped_by_reason: {} }, created_at: '2026-11-13T10:00:00Z', completed_at: '2026-11-13T10:05:00Z' },
    { id: JOB2, url: 'https://youtu.be/abc', audio_format: 'm4a', status: 'downloading', progress: 40, content_info: { title: 'Ung og lovende', artist: 'Kaizers Orchestra', kind: 'track', thumbnail_url: `${YURL}/cover.jpg` }, download_stats: { success: 0, failed: 0, skipped_by_reason: { file_exists: 1 } }, created_at: '2026-11-13T11:00:00Z' },
  ] };
  y._setFetchYubal(async (url, init = {}) => {
    kall.push({ url, method: init.method ?? 'GET', body: init.body });
    const u = new URL(url), P = u.pathname;
    if (P === '/api/info') return json({ title: 'Fredagsfest', artist: 'YouTube Music', year: null, track_count: 3, kind: 'playlist', thumbnail_url: 'https://lh3.googleusercontent.com/abc', audio_codec: 'opus', audio_bitrate: 128, url: u.searchParams.get('url'), tracks: [{ title: 'A', artist: 'X', duration: 200 }, { title: 'B', artists: [{ name: 'Y' }], duration: '3:05' }, { title: 'C', artist: 'Z', duration: 61 }] });
    if (P === '/api/jobs') return json(JOBS);
    if (P === '/api/subscriptions' && init.method === 'POST') return json({ id: SUB, type: 'playlist', url: JSON.parse(init.body).url, name: 'Fredagsfest', enabled: true, max_items: null, created_at: '2026-11-13T10:00:00Z', last_synced_at: null }, 201);
    if (P === '/api/subscriptions') return json({ items: [{ id: SUB, type: 'playlist', url: 'https://music.youtube.com/playlist?list=PLa', name: 'Fredagsfest', enabled: true, max_items: null, thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg', created_at: '2026-11-01T10:00:00Z', last_synced_at: '2026-11-13T10:05:00Z' }] });
    if (P === `/api/subscriptions/${SUB}` && init.method === 'PATCH') return json({ id: SUB, type: 'playlist', url: 'https://music.youtube.com/playlist?list=PLa', name: 'Fredagsfest', enabled: JSON.parse(init.body).enabled, max_items: null, created_at: '2026-11-01T10:00:00Z', last_synced_at: null });
    if (P === `/api/subscriptions/${SUB}/sync` || P === '/api/subscriptions/sync') return json({ job_ids: [JOB1, 'tull'] });
    if (P === `/api/subscriptions/${SUB}` && init.method === 'DELETE') return new Response(null, { status: 204 });
    if (P === '/api/scheduler') return json({ enabled: true, running: true, cron_expression: '0 0 * * *', timezone: 'Europe/Oslo', next_run_at: '2026-11-14T00:00:00Z', subscription_counts: { total: 1, enabled: 1 } });
    if (P === '/api/health') return json({ status: 'healthy' });
    return json({ detail: 'Not Found' }, 404);
  });
  y._resetYubal();
  const i = await A(`/api/media/yubal/info?url=${encodeURIComponent('https://music.youtube.com/playlist?list=PLa')}`);
  assert.equal(i.status, 200);
  assert.equal(i.body.info.kind, 'playlist');
  assert.equal(i.body.info.audio_codec, 'opus');
  assert.equal(i.body.info.audio_bitrate, 128);
  assert.match(i.body.info.thumbnail, /^\/api\/media\/yubal\/bilde\?u=/);
  assert.equal(kall.at(-1).url, `${YURL}/api/info?url=${encodeURIComponent('https://music.youtube.com/playlist?list=PLa')}`);

  const j = await A('/api/media/yubal/jobs');
  assert.deepEqual(j.body.jobs.map((x) => x.id), [JOB2, JOB1], 'nyeste først');
  assert.equal(j.body.jobs[0].content_info.thumbnail, null, 'omslag fra yubal-verten sendes ikke videre');
  assert.equal(j.body.jobs[0].download_stats.skipped, 1);
  const st = await A('/api/media/yubal/status');
  assert.equal(st.body.format, 'm4a');
  assert.equal(st.body.scheduler.next_run_at, '2026-11-14T00:00:00.000Z');

  const s = await A('/api/media/yubal/subscriptions', 'POST', { url: 'https://music.youtube.com/playlist?list=PLa' });
  assert.equal(s.status, 201);
  assert.equal(s.body.item.id, SUB);
  assert.equal((await A('/api/media/yubal/subscriptions', 'POST', { url: 'https://youtu.be/abc' })).status, 400, 'bare spillelister kan følges');
  const pa = await A(`/api/media/yubal/subscriptions/${SUB}`, 'PATCH', { enabled: false });
  assert.equal(pa.body.item.enabled, false);
  assert.equal((await A(`/api/media/yubal/subscriptions/${SUB}`, 'PATCH', { enabled: 'nei' })).status, 400);
  assert.deepEqual((await A(`/api/media/yubal/subscriptions/${SUB}/sync`, 'POST')).body.job_ids, [JOB1]);
  assert.deepEqual((await A('/api/media/yubal/subscriptions/sync', 'POST')).body.job_ids, [JOB1]);
  assert.equal((await A(`/api/media/yubal/subscriptions/${SUB}`, 'DELETE')).status, 200);

  // Sangene: bygges av /api/info + siste jobb, caches i 60 s, id valideres.
  assert.equal((await A('/api/media/yubal/subscriptions/x/tracks')).status, 400);
  const n0 = kall.length;
  const t = await A(`/api/media/yubal/subscriptions/${SUB}/tracks`);
  assert.equal(t.status, 200);
  assert.equal(t.body.available, true);
  assert.deepEqual(t.body.tracks.map((x) => [x.title, x.artist, x.duration, x.status]), [['A', 'X', 200, 'downloaded'], ['B', 'Y', 185, 'downloaded'], ['C', 'Z', 61, 'downloaded']]);
  const n1 = kall.length;
  assert.ok(n1 > n0);
  await A(`/api/media/yubal/subscriptions/${SUB}/tracks`);
  assert.equal(kall.length, n1, 'cache');

  const alle = [i, j, st, s, pa, t].map((r) => r.text).join('\n');
  assert.doesNotMatch(alle, /yubal\.p88\.lan|8010/);
  const integ = await y.testYubal();
  assert.equal(integ.ok, true);
  assert.match(integ.message, /yubal svarte på \d+ ms · neste automatiske synk/);
});

test('sanglista mangler i yubal: bare oppsummering og forklaring', async () => {
  y._resetYubal();
  y._setFetchYubal(async (url) => {
    const P = new URL(url).pathname;
    if (P === '/api/subscriptions') return json({ items: [{ id: SUB, type: 'playlist', url: 'https://music.youtube.com/playlist?list=PLa', name: 'Ukens nye', enabled: false, max_items: 50, created_at: '2026-11-01T10:00:00Z', last_synced_at: null }] });
    if (P === '/api/jobs') return json({ jobs: [{ id: JOB1, url: 'https://music.youtube.com/playlist?list=PLa', subscription_id: SUB, status: 'completed', progress: 100, download_stats: { success: 6, failed: 1, skipped_by_reason: { file_exists: 24 } } }] });
    if (P === '/api/info') return json({ title: 'Ukens nye', artist: 'YouTube Music', track_count: 31, kind: 'playlist' });
    return json({}, 404);
  });
  const t = await A(`/api/media/yubal/subscriptions/${SUB}/tracks`);
  assert.equal(t.body.available, false);
  assert.deepEqual(t.body.tracks, []);
  assert.equal(t.body.total, 31);
  assert.equal(t.body.message, 'Sanglista er ikke tilgjengelig fra yubal');
  assert.deepEqual([t.body.summary.success, t.body.summary.failed, t.body.summary.existing], [6, 1, 24]);
});

test('bildeproxy: bare YouTube sine bildeverter', async () => {
  y._setBildeYubal(async () => ({ buf: Buffer.from('jpg'), type: 'image/jpeg' }));
  const ok = await A(`/api/media/yubal/bilde?u=${encodeURIComponent('https://i.ytimg.com/vi/x/hq.jpg')}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  for (const bad of ['http://i.ytimg.com/x.jpg', `${YURL}/cover.jpg`, 'https://evil.com/x.jpg', 'https://i.ytimg.com.evil.com/x.jpg']) assert.equal((await A(`/api/media/yubal/bilde?u=${encodeURIComponent(bad)}`)).status, 400, bad);
  y._setBildeYubal(null);
});

test('integrasjonen: Media-gruppen, bare adresse, guide om format; ruten er montert før media50/43', () => {
  const x = INTEGRATIONS.find((i) => i.id === 'yubal');
  assert.equal(x.group, 'Media');
  assert.deepEqual(x.fields.map((f) => f.key), ['yubal_url']);
  const src = readFileSync(new URL('../server/integrations-api.js', import.meta.url), 'utf8');
  assert.match(src, /YUBAL_AUDIO_FORMAT/);
  assert.match(src, /docker compose up -d --force-recreate/);
  const idx = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.ok(idx.indexOf("app.route('/api/media/yubal', yubalApi)") < idx.indexOf('mountMedia50(app)'));
  const web = readFileSync(new URL('../public/js/media-musikk.js', import.meta.url), 'utf8');
  assert.doesNotMatch(web, /10\.69\.|:8010/);
  assert.match(web, /\/api\/media\/yubal/);
});
