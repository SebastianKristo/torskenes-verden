// Prompt 78 (LEDSRV): LED over hver skuff via WLED. Mocket WLED-server på localhost (127.0.0.1, tillatt bare med testkroken):
// utregning av indeks (pitch, offset, reverse, serpentine, override), at forrige tilstand gjenopprettes, at offentlige verter avvises og private godtas,
// rate limit, Glimt-tenning (autoLocateGlimt) og at alt er per bruker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-p78-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p78';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.SKJOLD76_DEMO = '0';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const auth = await import('../server/auth.js');
const L = await import('../server/skjold76/leds78.js');
const { TOOL45 } = await import('../server/glimt45/tools.js');
const { SENTENCES46 } = await import('../server/glimt45/tools46.js');
const { db } = await import('../server/db.js');

/* ---------------- Mocket WLED ---------------- */

const wled = { state: { on: true, bri: 77, ps: -1, seg: [{ id: 0, start: 0, stop: 300, len: 300, fx: 9, col: [[255, 160, 0]], frz: false }] }, posts: [], gets: 0, mode: 'ok' };
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    if (wled.mode === 'redirect') { res.writeHead(302, { Location: 'http://8.8.8.8/json/state' }); return res.end(); }
    if (wled.mode === 'big') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(`{"x":"${'a'.repeat(70 * 1024)}"}`); }
    if (wled.mode === 'slow') return; // svarer aldri
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/json/state') { wled.gets++; return res.end(JSON.stringify(wled.state)); }
    if (req.method === 'GET' && req.url === '/json/info') return res.end(JSON.stringify({ name: 'WLED-Skap', ver: '0.15.0', leds: { count: 300 } }));
    if (req.method === 'POST' && req.url === '/json/state') { wled.posts.push(JSON.parse(b)); return res.end('{"success":true}'); }
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `127.0.0.1:${srv.address().port}`;
L._allowLoopback78(true);
L._setTestMs78(150);
test.after(async () => { await L._resetLeds78(); srv.close(); L._allowLoopback78(false); try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function login(username, password) {
  const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify({ username, password }) });
  return r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const cookie = await login('sebastian', 'testpassord1');
auth.createUser({ username: 'ingrid', password: 'ingridpassord', role: 'bruker' });
const cookie2 = await login('ingrid', 'ingridpassord');
const A = (path, method = 'GET', body) => req(`/api/skjold${path}`, { method, headers: { cookie }, body });
const B = (path, method = 'GET', body) => req(`/api/skjold${path}`, { method, headers: { cookie: cookie2 }, body });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = async () => { L._resetRate78(); await L._resetLeds78(); wled.posts = []; wled.gets = 0; wled.mode = 'ok'; };

/* ---------------- 1. Utregning ---------------- */

test('indeks: pitch, offset, reverse, serpentine, samme retning og overstyring', () => {
  const cab = { rows: 12, cols: 5 };
  const cfg = { ...L.ledsOf78(null) }; // standard: 60 mm skuff, første midt 30 mm, 16,667 mm LED, serpentine
  const rows = L.autoRows78(cfg, 12, 5);
  assert.equal(rows[0].count, 18);
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.start, r.reverse]), [[0, false], [18, true], [36, false]]);
  // Rad 1: skuff 1 midt 30 mm → LED k=1 (8,33 + 16,67 = 25 mm); skuff 5 midt 270 mm → k=16.
  assert.equal(L.autoIndex78(cfg, cab, 1, 1), 1);
  assert.equal(L.autoIndex78(cfg, cab, 1, 5), 16);
  // Rad 2 går baklengs: start 18, k=1 → 18 + (17 − 1) = 34.
  assert.equal(L.autoIndex78(cfg, cab, 2, 1), 34);
  assert.equal(L.autoIndex78(cfg, cab, 2, 5), 19);
  // Samme retning.
  const same = { ...cfg, layout: 'same' };
  assert.equal(L.autoIndex78(same, cab, 2, 1), 19);
  // LED-veggen: 3 LED per skuff (50 mm), midt-LED-en over skuffen.
  const wall = { ...cfg, drawerPitchMm: 50, firstDrawerXmm: 25, rows: [{ row: 1, start: 100, count: 15, reverse: false, pitchMm: 16.667, offsetMm: 8.333 }] };
  assert.deepEqual([1, 2, 3, 4, 5].map((c) => L.autoIndex78(wall, cab, 1, c)), [101, 104, 107, 110, 113]);
  // Offset og egen pitch: 60/m, første LED 40 mm inn → skuff 1 (30 mm) klemmes til LED 0.
  const off = { ...cfg, rows: [{ row: 1, start: 0, count: 10, reverse: true, pitchMm: 30, offsetMm: 40 }] };
  assert.equal(L.autoIndex78(off, cab, 1, 1), 9); // k=0 → reverse → 9
  assert.equal(L.autoIndex78(off, cab, 1, 3), 5); // 150 mm → k=round(110/30)=4 → reverse 9−4 = 5
  assert.equal(L.autoIndex78(off, cab, 3, 1), null); // raden finnes ikke
  // Overstyring går foran.
  assert.deepEqual(L.indexFor78({ ...cfg, overrides: { '1-1': 250 } }, cab, 1, 1), { index: 250, source: 'override' });
  assert.deepEqual(L.indexFor78(cfg, cab, 1, 1), { index: 1, source: 'auto' });
});

/* ---------------- 2. Vertssjekken ---------------- */

test('vertssjekk: offentlige verter avvises, hjemmenettet godtas', async () => {
  L._allowLoopback78(false);
  try {
    for (const h of ['8.8.8.8', '172.32.0.1', '169.254.1.1', '127.0.0.1', '0.0.0.0', 'example.com', 'wled.example.com', 'http://192.168.1.2/json', 'user@192.168.1.2',
      'https://192.168.1.2', 'ftp://wled', '[fd00::1]', 'fe80::1', '192.168.1', '']) {
      assert.ok(L.parseHost78(h).error, `skulle avvise ${h}`);
    }
    for (const [h, host, port] of [['192.168.1.50', '192.168.1.50', 80], ['10.0.0.7:8080', '10.0.0.7', 8080], ['172.16.4.2', '172.16.4.2', 80], ['172.31.255.1', '172.31.255.1', 80],
      ['http://192.168.0.9/', '192.168.0.9', 80], ['wled-skap.local', 'wled-skap.local', 80], ['wled.lan', 'wled.lan', 80], ['WLED', 'wled', 80]]) {
      const p = L.parseHost78(h);
      assert.ok(!p.error, `skulle godta ${h}: ${p.error}`);
      assert.equal(p.host, host); assert.equal(p.port, port);
    }
    // .local/.lan/navn må løses til private adresser – alle sammen.
    L._setResolver78(async (n) => ({ 'skap.local': ['192.168.1.20'], 'ond.local': ['8.8.8.8'], 'blandet.lan': ['192.168.1.2', '1.1.1.1'], wled: ['10.0.0.5'] })[n] ?? []);
    assert.equal((await L.resolveHost78('skap.local')).ip, '192.168.1.20');
    assert.equal((await L.resolveHost78('wled')).ip, '10.0.0.5');
    assert.equal((await L.resolveHost78('ond.local')).code, 'public');
    assert.equal((await L.resolveHost78('blandet.lan')).code, 'public');
    assert.equal((await L.resolveHost78('ukjent.local')).code, 'dns');
    // Kall til en offentlig vert kommer aldri ut.
    await assert.rejects(L.wled78('ond.local', 'GET', '/json/info'), (e) => e.code === 'host');
    await assert.rejects(L.wled78('8.8.8.8', 'GET', '/json/info'), (e) => e.code === 'host');
  } finally { L._setResolver78(null); L._allowLoopback78(true); }
  // PUT avviser offentlige verter.
  const cab = (await A('/cabinets')).body[0];
  const r = await A(`/cabinets/${cab.id}/leds`, 'PUT', { host: '8.8.8.8' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /hjemmenettet/);
  assert.equal((await A(`/cabinets/${cab.id}/leds`, 'PUT', { host: 'wled.example.com' })).status, 400);
  assert.equal((await A(`/cabinets/${cab.id}/leds`, 'PUT', { host: '192.168.1.44' })).body.host, '192.168.1.44');
});

test('WLED-klienten: ingen redirects, maks 64 kB, tidsavbrudd', async () => {
  await calm();
  wled.mode = 'redirect';
  await assert.rejects(L.wled78(HOST, 'GET', '/json/info'), (e) => e.code === 'redirect');
  wled.mode = 'big';
  await assert.rejects(L.wled78(HOST, 'GET', '/json/info'), (e) => e.code === 'size');
  wled.mode = 'slow';
  const t0 = Date.now();
  await assert.rejects(L.wled78(HOST, 'GET', '/json/info'), (e) => e.code === 'timeout');
  assert.ok(Date.now() - t0 < 3600);
  wled.mode = 'ok';
  assert.equal((await L.wled78(HOST, 'GET', '/json/info')).name, 'WLED-Skap');
});

/* ---------------- 3. Oppsett, tenning og gjenoppretting ---------------- */

let cabId;
test('GET/PUT leds: standard, validering, kart og overstyring', async () => {
  await calm();
  const cab = (await A('/cabinets')).body[0];
  cabId = cab.id;
  const g = await A(`/cabinets/${cabId}/leds`);
  assert.equal(g.status, 200);
  assert.equal(g.body.color, '#2F6BFF'); assert.equal(g.body.durationS, 30); assert.equal(g.body.brightness, 128);
  assert.equal(g.body.rowsAuto, true); assert.equal(g.body.rows.length, 12); assert.equal(g.body.map.length, 60);
  assert.equal((await A(`/cabinets/${cabId}/leds`, 'PUT', { enabled: true, host: null })).status, 400); // vert mangler
  assert.equal((await A(`/cabinets/${cabId}/leds`, 'PUT', { color: 'blå' })).status, 400);
  assert.equal((await A(`/cabinets/${cabId}/leds`, 'PUT', { rows: [{ row: 13, start: 0, count: 5 }] })).status, 400);
  const p = await A(`/cabinets/${cabId}/leds`, 'PUT', { host: HOST, enabled: true, color: '#ff0000', durationS: 1, brightness: 200, layout: 'same' });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.enabled, true); assert.equal(p.body.color, '#FF0000'); assert.equal(p.body.rows[1].reverse, false);
  assert.equal(p.body.map.find((d) => d.short === '2-1').index, 19);
  const o = await A(`/cabinets/${cabId}/leds/override`, 'PUT', { row: 4, col: 2, index: 77 });
  assert.equal(o.status, 200); assert.equal(o.body.index, 77);
  assert.equal(o.body.leds.map.find((d) => d.short === '4-2').override, 77);
  assert.equal((await A(`/cabinets/${cabId}/leds/override`, 'PUT', { row: 4, col: 2, index: null })).body.index, L.autoIndex78(L.ledsOf78({ leds: JSON.stringify({ layout: 'same' }) }), { rows: 12, cols: 5 }, 4, 2));
  await A(`/cabinets/${cabId}/leds/override`, 'PUT', { row: 4, col: 2, index: 77 });
  // Skaplisten viser at LED er på.
  assert.deepEqual((await A('/cabinets')).body.find((x) => x.id === cabId).leds, { enabled: true, configured: true });
  assert.equal((await B(`/cabinets/${cabId}/leds`)).status, 404); // per bruker
});

test('locate tenner skuffen og gjenoppretter forrige tilstand', async () => {
  await calm();
  const part = (await A('/parts', 'POST', { name: 'M3 × 10 skruer', qty: 50, cabinetId: cabId, row: 4, col: 2 })).body;
  const r = await A('/locate', 'POST', { partId: part.id });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.lit.map((x) => [x.cabinetId, x.row, x.col, x.index]), [[cabId, 4, 2, 77]]);
  assert.ok(r.body.untilMs > Date.now()); assert.equal(r.body.durationMs, 1000);
  assert.equal(wled.gets, 1); // forrige tilstand hentet
  const on = wled.posts.at(-1);
  assert.equal(on.on, true); assert.equal(on.bri, 200);
  assert.deepEqual(on.seg[0].i, [0, 300, '000000', 77, 'FF0000']);
  // En ny locate mens den lyser tar ikke ny «forrige tilstand».
  const r2 = await A('/locate', 'POST', { cabinetId: cabId, row: 1, col: 1 });
  assert.equal(r2.body.lit[0].index, 1);
  assert.equal(wled.gets, 1);
  await sleep(1300);
  const back = wled.posts.at(-1);
  assert.equal(back.on, true); assert.equal(back.bri, 77);
  assert.equal(back.seg[0].fx, 9); assert.deepEqual(back.seg[0].col, [[255, 160, 0]]); assert.equal(back.seg[0].frz, false);
  assert.deepEqual(L._activeHosts78(), []);
});

test('locate: flere treff (maks 20), off, feil og test/kalibrering', async () => {
  await calm();
  await A(`/cabinets/${cabId}/leds`, 'PUT', { durationS: 30 });
  // Prompt 79: maks økt fra 10 til 20 skuffer.
  const drawers = Array.from({ length: 22 }, (_, i) => ({ cabinetId: cabId, row: (i % 12) + 1, col: i < 12 ? 1 : 3 }));
  const r = await A('/locate', 'POST', { drawers });
  assert.equal(r.status, 200);
  assert.equal(r.body.lit.length, 20);
  assert.equal(r.body.skipped.length, 2);
  const off = await A('/locate/off', 'POST', {});
  assert.deepEqual(off.body, { ok: true, off: 1 });
  assert.equal(wled.posts.at(-1).bri, 77); // gjenopprettet med en gang
  // Del uten plass, ukjent del, ikke satt opp.
  const loose = (await A('/parts', 'POST', { name: 'Løs del' })).body;
  assert.equal((await A('/locate', 'POST', { partId: loose.id })).body.code, 'no_location');
  assert.equal((await A('/locate', 'POST', { partId: 999999 })).status, 404);
  const cab2 = (await A('/cabinets', 'POST', { name: 'Uten LED', rows: 2, cols: 2 })).body;
  const nc = await A('/locate', 'POST', { cabinetId: cab2.id, row: 1, col: 1 });
  assert.equal(nc.status, 409); assert.equal(nc.body.code, 'not_configured');
  // WLED svarer ikke → 502, og ingenting henger igjen.
  await A(`/cabinets/${cab2.id}/leds`, 'PUT', { host: '127.0.0.1:1', enabled: true });
  const un = await A('/locate', 'POST', { cabinetId: cab2.id, row: 1, col: 1 });
  assert.equal(un.status, 502); assert.equal(un.body.code, 'unreachable');
  // Test: hele raden i 5 s (her 150 ms) og så tilbake.
  L._resetRate78(); wled.posts = [];
  const t = await A(`/cabinets/${cabId}/leds/test`, 'POST', { mode: 'row', row: 2 });
  assert.equal(t.status, 200, t.text); assert.equal(t.body.count, 18); assert.equal(t.body.from, 18);
  assert.equal((await A(`/cabinets/${cabId}/leds/test`, 'POST', { mode: 'x' })).status, 400);
  await sleep(300);
  assert.equal(wled.posts.at(-1).bri, 77);
  const all = await A(`/cabinets/${cabId}/leds/test`, 'POST', { mode: 'all' });
  assert.equal(all.body.count, 216);
  await sleep(300);
  L._resetRate78();
  const cal = await A(`/cabinets/${cabId}/leds/calibrate`, 'POST', { index: 77 });
  assert.equal(cal.status, 200); assert.deepEqual(cal.body.drawers.map((d) => d.short), ['4-2', '5-2']); // 5-2 regnes også til 77 (layout same) – veiviseren viser konflikten
  assert.deepEqual(wled.posts.at(-1).seg[0].i.slice(3), [77, 'FF0000']);
  await A('/locate/off', 'POST', {});
  // Status.
  L._resetRate78();
  const st = await A('/leds/status');
  assert.equal(st.body.ok, true); assert.equal(st.body.name, 'WLED-Skap'); assert.equal(st.body.ledCount, 300); assert.equal(st.body.version, '0.15.0');
  assert.equal(st.body.items.length, 2);
  assert.equal(st.body.items.find((x) => x.host === '127.0.0.1:1').ok, false);
  assert.equal((await A(`/leds/status?cabinet=${cab2.id}`)).body.ok, false);
});

/* ---------------- 4. Rate limit og per bruker ---------------- */

test('rate limit: 5 kall i sekundet per bruker', async () => {
  await calm();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await A('/locate', 'POST', { cabinetId: cabId, row: 1, col: 1 })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  // En annen bruker har sin egen kvote (og når ikke Sebastians skap).
  const other = await B('/locate', 'POST', { cabinetId: cabId, row: 1, col: 1 });
  assert.equal(other.status, 404);
  assert.equal(other.body.code, 'not_found');
  await sleep(1050);
  assert.equal((await A('/locate/off', 'POST', {})).status, 200);
});

test('per bruker: to brukere på samme WLED, off slukker bare egne', async () => {
  await calm();
  const bc = (await B('/cabinets')).body[0];
  assert.equal((await B(`/cabinets/${cabId}/leds`, 'PUT', { host: HOST })).status, 404);
  assert.equal((await B(`/cabinets/${bc.id}/leds`, 'PUT', { host: HOST, enabled: true, color: '#00FF00', durationS: 30, overrides: { '1-1': 5 } })).status, 200);
  assert.equal((await A('/locate', 'POST', { cabinetId: cabId, row: 4, col: 2 })).status, 200);
  assert.equal((await B('/locate', 'POST', { cabinetId: bc.id, row: 1, col: 1 })).status, 200);
  assert.equal(wled.gets, 1);
  const both = wled.posts.at(-1).seg[0].i;
  assert.ok(both.includes(77) && both.includes(5));
  await B('/locate/off', 'POST', {});
  const left = wled.posts.at(-1);
  assert.deepEqual(left.seg[0].i, [0, 300, '000000', 77, 'FF0000']);
  assert.equal((await B('/locate/off', 'POST', {})).body.off, 0);
  await A('/locate/off', 'POST', {});
  assert.equal(wled.posts.at(-1).bri, 77);
  // Innstillingene er per bruker.
  assert.deepEqual((await A('/leds/settings')).body, { autoLocateGlimt: false, autoLocateOpen: false });
  assert.equal((await A('/leds/settings', 'PUT', { autoLocateGlimt: 'ja' })).status, 400);
  assert.equal((await B('/leds/settings', 'PUT', { autoLocateGlimt: true })).body.autoLocateGlimt, true);
  assert.equal((await A('/leds/settings')).body.autoLocateGlimt, false);
});

/* ---------------- 5. Glimt ---------------- */

test('Glimt: «hvor er M3-skruene?» tenner skuffen bare når autoLocateGlimt er på', async () => {
  await calm();
  const user = db.prepare('SELECT user_id FROM skj_cabinets WHERE id=?').pluck().get(cabId);
  const tool = TOOL45['skjold.find'];
  const run = async () => { const a = await tool.validate({ query: 'M3-skruene' }, { text: 'hvor er M3-skruene?', user }); return tool.run(a.args, { user, text: 'hvor er M3-skruene?' }); };
  const off = await run();
  assert.equal(off.result.leds, undefined);
  assert.equal(wled.posts.length, 0);
  assert.doesNotMatch(SENTENCES46['skjold.find']({}, off), /lyser/);
  await A('/leds/settings', 'PUT', { autoLocateGlimt: true });
  const on = await run();
  assert.equal(on.result.leds.lit[0].index, 77);
  assert.match(SENTENCES46['skjold.find']({}, on), /Rad 4 · Skuff 2.*Skuffen lyser nå\./);
  assert.deepEqual(wled.posts.at(-1).seg[0].i.slice(3), [77, 'FF0000']);
  await A('/locate/off', 'POST', {});
});
