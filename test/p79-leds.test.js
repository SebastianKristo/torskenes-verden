// Prompt 79 (PICKSRV): WLED lyser ikke – rettet frame-payload, diagnose («Feilsøk LED»), farger per del i /locate, maks 20 og plukkliste-API.
// Mocket WLED på localhost (tillatt bare med testkroken _allowLoopback78).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-p79-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p79';
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

/* ---------------- Mocket WLED ---------------- */

const STATE0 = () => ({ on: true, bri: 90, ps: -1, pl: -1, lor: 0, transition: 7,
  seg: [{ id: 0, start: 0, stop: 300, len: 300, on: false, bri: 20, fx: 9, col: [[255, 160, 0]], frz: false }] });
const wled = { state: STATE0(), info: { name: 'WLED-Skap', ver: '0.15.0', live: false, leds: { count: 300, maxpwr: 850, seglc: [1] } }, posts: [], gets: 0 };
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/json/state') { wled.gets++; return res.end(JSON.stringify(wled.state)); }
    if (req.method === 'GET' && req.url === '/json/info') return res.end(JSON.stringify(wled.info));
    if (req.method === 'POST' && req.url === '/json/state') { wled.posts.push(JSON.parse(b)); return res.end('{"success":true}'); }
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `127.0.0.1:${srv.address().port}`;
L._allowLoopback78(true);
L._setDiagMs79(60);
test.after(async () => { await L._resetLeds78(); srv.close(); L._allowLoopback78(false); L._setDiagMs79(null); try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

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
const calm = async () => { L._resetRate78(); await L._resetLeds78(); wled.posts = []; wled.gets = 0; wled.state = STATE0(); wled.info.live = false; wled.info.leds.count = 300; };

const cab = (await A('/cabinets')).body[0];
const cabId = cab.id;
assert.equal((await A(`/cabinets/${cabId}/leds`, 'PUT', { host: HOST, enabled: true, durationS: 30, brightness: 1, layout: 'same' })).status, 200);
const mk = async (name, row, col) => (await A('/parts', 'POST', { name, qty: 10, cabinetId: cabId, row, col })).body;

/* ---------------- 1. Rotårsaken: frame-payloaden ---------------- */

test('frame: tenner uten frz:false, med on/bri/fx på segmentet, og bri aldri 0/1', async () => {
  await calm();
  const r = await A('/locate', 'POST', { cabinetId: cabId, row: 1, col: 1 });
  assert.equal(r.status, 200, r.text);
  const on = wled.posts.at(-1);
  assert.equal(on.on, true);
  assert.ok(on.bri >= 16, `bri ${on.bri}`); // brightness 1 i oppsettet → løftes
  const seg = on.seg[0];
  assert.equal(seg.id, 0);
  assert.equal('frz' in seg, false, 'frz:false tiner segmentet – skal ikke sendes når vi tenner');
  assert.equal(seg.on, true); assert.equal(seg.bri, 255); assert.equal(seg.fx, 0);
  assert.deepEqual(seg.i, [0, 300, '000000', 1, '2F6BFF']);
  assert.equal('lor' in on, false); // ikke live
  // Restore tiner og skriver tilbake effekt, farger, on og lysstyrke fra snapshot.
  await A('/locate/off', 'POST', {});
  const back = wled.posts.at(-1);
  assert.equal(back.on, true); assert.equal(back.bri, 90); assert.equal(back.transition, 7);
  assert.equal(back.seg[0].frz, false); assert.equal(back.seg[0].fx, 9); assert.equal(back.seg[0].on, false); assert.equal(back.seg[0].bri, 20);
  assert.deepEqual(back.seg[0].col, [[255, 160, 0]]);
  assert.equal(back.ps, undefined);
});

test('frame: live → lor:1 og tilbake til forrige lor; spilleliste startes igjen', async () => {
  await calm();
  wled.info.live = true; wled.state.pl = 3; wled.state.ps = 12;
  assert.equal((await A('/locate', 'POST', { cabinetId: cabId, row: 2, col: 2 })).status, 200);
  assert.equal(wled.posts.at(-1).lor, 1);
  await A('/locate/off', 'POST', {});
  const back = wled.posts.at(-1);
  assert.equal(back.lor, 0);
  assert.equal(back.ps, 3); // spillelisten, ikke presetet inni den
});

test('segment som ikke starter på 0: i er relativ, lengden fra segmentet', async () => {
  await calm();
  wled.state.seg = [{ id: 0, start: 0, stop: 50, len: 50, on: true, bri: 255, fx: 0 }, { id: 1, start: 50, stop: 350, len: 300, on: true, bri: 255, fx: 0 }];
  await A(`/cabinets/${cabId}/leds`, 'PUT', { segment: 1 });
  try {
    assert.equal((await A('/locate', 'POST', { cabinetId: cabId, row: 2, col: 1 })).status, 200);
    const seg = wled.posts.at(-1).seg[0];
    assert.equal(seg.id, 1);
    assert.deepEqual(seg.i, [0, 300, '000000', 19, '2F6BFF']); // rad 2 (samme retning) starter på 18 i segmentet, ikke 68
    await A('/locate/off', 'POST', {});
  } finally { await A(`/cabinets/${cabId}/leds`, 'PUT', { segment: 0 }); }
});

test('indeks utenfor WLED-segmentet (WLED-standard 30 LED-er) gir out_of_range i stedet for falsk «lit»', async () => {
  await calm();
  wled.state.seg[0] = { ...wled.state.seg[0], stop: 30, len: 30 };
  const r = await A('/locate', 'POST', { cabinetId: cabId, row: 5, col: 3 }); // indeks 74+
  assert.equal(r.status, 409, r.text);
  assert.equal(r.body.code, 'out_of_range');
  assert.match(r.body.error, /bare 30 LED-er/);
  assert.deepEqual(L._activeHosts78(), []); // ikke stående svart
  const mix = await A('/locate', 'POST', { drawers: [{ cabinetId: cabId, row: 1, col: 1 }, { cabinetId: cabId, row: 5, col: 3 }] });
  assert.equal(mix.status, 200);
  assert.equal(mix.body.lit.length, 1);
  assert.equal(mix.body.skipped[0].code, 'out_of_range');
  await A('/locate/off', 'POST', {});
});

/* ---------------- 2. Farger per del og maks 20 ---------------- */

test('locate {partIds, colors:true}: egen farge per del, delt skuff deler LED (første vinner)', async () => {
  await calm();
  const a = await mk('Gul diode', 3, 1), b = await mk('ESP32', 3, 2), b2 = await mk('ESP32 reserve', 3, 2), t = await mk('Transistor', 3, 4);
  const loose = (await A('/parts', 'POST', { name: 'Løs del' })).body;
  const r = await A('/locate', 'POST', { partIds: [a.id, b.id, b2.id, loose.id, t.id], colors: true });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.lit.map((x) => x.partId), [a.id, b.id, b2.id, t.id]);
  const col = Object.fromEntries(r.body.lit.map((x) => [x.partId, x.color]));
  assert.equal(col[a.id], '#2F6BFF'); // skapets egen farge først
  assert.equal(col[b.id], L.PALETTE79[1]);
  assert.equal(col[b2.id], col[b.id]); // samme skuff → første farge vinner
  assert.equal(r.body.lit.find((x) => x.partId === b2.id).sharedWith, b.id);
  assert.equal(col[t.id], L.PALETTE79[4]); // rekkefølgen teller (også del uten plass)
  assert.equal(new Set([col[a.id], col[b.id], col[t.id]]).size, 3);
  assert.deepEqual(r.body.skipped.map((x) => [x.partId, x.code]), [[loose.id, 'no_location']]);
  assert.equal(r.body.palette[0], '#2F6BFF');
  const i = wled.posts.at(-1).seg[0].i.slice(3);
  assert.equal(i.length, 6); // tre LED-er (to deler deler én)
  assert.deepEqual(i.filter((x) => typeof x === 'string'), [col[a.id], col[b.id], col[t.id]].map((c) => c.slice(1)));
  // Uten colors: skapets farge på alle, men partId og color er med.
  L._resetRate78();
  const plain = await A('/locate', 'POST', { partIds: [a.id, t.id] });
  assert.deepEqual(plain.body.lit.map((x) => x.color), ['#2F6BFF', '#2F6BFF']);
  assert.equal(plain.body.palette, undefined);
  await A('/locate/off', 'POST', {});
});

test('locate: maks 20 skuffer, resten i skipped med code max', async () => {
  await calm();
  const ids = [];
  for (let k = 0; k < 22; k++) ids.push((await mk(`Del ${k}`, (k % 12) + 1, k < 12 ? 5 : 4)).id);
  L._resetRate78();
  const r = await A('/locate', 'POST', { partIds: ids, colors: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.lit.length, 20);
  assert.deepEqual(r.body.skipped.map((x) => x.code), ['max', 'max']);
  assert.deepEqual(r.body.skipped.map((x) => x.partId), ids.slice(20));
  assert.equal(L.MAX_LIT78, 20);
  await A('/locate/off', 'POST', {});
});

/* ---------------- 3. Diagnose ---------------- */

test('diagnose: fem steg, rød stripe uten i, blå LED via i, gjenoppretting og hint', async () => {
  await calm();
  wled.info.leds.count = 30;
  const r = await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', {});
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.steps.map((s) => s.key), ['info', 'state', 'red', 'blue', 'restore']);
  assert.ok(r.body.steps.every((s) => s.ok && s.name && typeof s.detail === 'string'));
  assert.equal(r.body.steps[2].ask, 'Lyste hele stripa rødt?');
  assert.equal(r.body.steps[3].ask, 'Lyste én LED blått?');
  assert.match(r.body.steps[0].detail, /WLED-Skap · versjon 0\.15\.0 · 30 LED-er/);
  // Advarsler fra info/state.
  const w = r.body.warnings.join(' ');
  assert.match(w, /30 LED-er satt opp/); assert.match(w, /slått av/); assert.match(w, /effekt kjører/);
  assert.equal(wled.posts.length, 3);
  const [red, blue, back] = wled.posts;
  assert.deepEqual(red.seg[0].col, [[255, 0, 0]]); assert.equal(red.seg[0].i, undefined); assert.equal(red.seg[0].fx, 0); assert.equal(red.seg[0].on, true);
  assert.deepEqual(blue.seg[0].i, [0, 300, '000000', 1, '0000FF']); assert.equal('frz' in blue.seg[0], false);
  assert.equal(back.seg[0].fx, 9); assert.equal(back.seg[0].frz, false); assert.equal(back.bri, 90);
  assert.equal(wled.gets, 2); // state i steg 2 + snapshot én gang
  // Hint uten svar: generelt + hints for hvert utfall.
  assert.match(r.body.hint, /Svar på/);
  assert.ok(r.body.hints.none && r.body.hints.red && r.body.hints.both);
  // Hint ut fra svarene.
  L._resetRate78();
  const none = await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'restore', red: false, blue: false });
  assert.match(none.body.hint, /GPIO/); assert.match(none.body.hint, /WS2812B/); assert.match(none.body.hint, /felles jord/); assert.match(none.body.hint, /LED Preferences/);
  assert.match((await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'restore', red: true, blue: false })).body.hint, /feil hos oss/);
  assert.match((await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'restore', red: true, blue: true })).body.hint, /kalibrering/);
});

test('diagnose steg for steg, locate underveis, uten vert og uten kontakt', async () => {
  await calm();
  const red = await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'red' });
  assert.deepEqual(red.body.steps.map((s) => s.key), ['red']);
  assert.ok(red.body.untilMs > Date.now() - 1000);
  const blue = await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'blue', index: 7 });
  assert.equal(blue.body.steps[0].index, 7);
  assert.equal(wled.gets, 3); // check+check+snapshot (snapshot bare én gang)
  const rs = await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'restore' });
  assert.equal(rs.body.steps[0].ok, true);
  assert.equal(wled.posts.at(-1).seg[0].fx, 9);
  L._resetRate78();
  // Gjenopprettes av seg selv etter diagMs.
  await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'red' });
  await sleep(150);
  assert.equal(wled.posts.at(-1).seg[0].fx, 9);
  assert.equal((await A(`/cabinets/${cabId}/leds/diagnose`, 'POST', { step: 'x' })).status, 400);
  // Uten vert / uten kontakt / andres skap.
  const c2 = (await A('/cabinets', 'POST', { name: 'Uten LED 79', rows: 2, cols: 2 })).body;
  assert.equal((await A(`/cabinets/${c2.id}/leds/diagnose`, 'POST', {})).status, 409);
  L._resetRate78();
  await A(`/cabinets/${c2.id}/leds`, 'PUT', { host: '127.0.0.1:1' });
  const un = await A(`/cabinets/${c2.id}/leds/diagnose`, 'POST', {});
  assert.equal(un.status, 200); assert.equal(un.body.ok, false);
  assert.deepEqual(un.body.steps.map((s) => [s.key, s.ok]), [['info', false]]);
  assert.match(un.body.hint, /kontakt/);
  assert.equal((await B(`/cabinets/${cabId}/leds/diagnose`, 'POST', {})).status, 404);
});

/* ---------------- 4. Plukkliste ---------------- */

test('plukkliste: GET/PUT per bruker, take og undo', async () => {
  await calm();
  const p1 = await mk('Gul LED 5 mm', 6, 1), p2 = await mk('BC547', 6, 2);
  assert.deepEqual((await A('/picklist')).body, { items: [], updatedAt: null });
  assert.equal((await A('/picklist', 'PUT', { items: [{ partId: p1.id, qty: 0 }] })).status, 400);
  const put = await A('/picklist', 'PUT', { items: [{ partId: p2.id, qty: 3 }, { partId: p1.id }, { partId: p1.id, qty: 9 }, { partId: 999999 }] });
  assert.equal(put.status, 200, put.text);
  assert.deepEqual(put.body.items.map((x) => [x.partId, x.qty, x.take]), [[p2.id, 3, 3], [p1.id, 1, 1]]);
  assert.ok(put.body.updatedAt);
  assert.equal((await A('/picklist', 'PUT', { items: [{ id: p2.id, take: 2 }, { partId: p1.id }] })).body.items[0].qty, 2); // Android-alias
  assert.deepEqual((await B('/picklist')).body.items, []); // per bruker
  assert.deepEqual((await B('/picklist', 'PUT', { items: [{ partId: p1.id }] })).body.items, []); // andres deler lagres ikke
  const take = await A('/picklist/take', 'POST', {});
  assert.equal(take.status, 200);
  assert.deepEqual(take.body.parts.map((x) => [x.partId, x.before, x.after]), [[p2.id, 10, 8], [p1.id, 10, 9]]);
  assert.equal((await A(`/parts/${p2.id}`)).body.qty ?? (await A(`/parts/${p2.id}`)).body.part?.qty, 8);
  const undo = await A('/picklist/undo', 'POST', { undo: take.body.undo });
  assert.deepEqual(undo.body.parts.map((x) => x.after), [10, 10]);
  assert.equal((await A('/picklist/take', 'POST', { items: [{ partId: p1.id, qty: 50 }] })).body.parts[0].after, 0); // aldri under 0
  assert.equal((await A('/picklist')).body.items.length, 2); // take tømmer ikke lista
  await A(`/parts/${p1.id}`, 'DELETE');
  assert.deepEqual((await A('/picklist')).body.items.map((x) => x.partId), [p2.id]); // slettet del filtreres bort
});
