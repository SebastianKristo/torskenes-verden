// Prompt 81 (SPANSRV): Skjold Lab – sammenslåtte skuffer (spanR × spanC) og forhåndsoppsettet «Skjold Lab-hylla (3D-print)».
// Fasiten fra kontrakten (4 og 5 etasjer) ordrett, overlapp (409), flytting til ankeret, plassering i tekst, locate fra en dekket rute
// (LED over ankeret, mocket WLED), preset 409 med deler utenfor, oppretting med preset og at alt er per bruker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-p81-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p81';
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
const LAY = await import('../server/skjold76/layout81.js');
const ST = await import('../server/skjold76/store.js');
const { db } = await import('../server/db.js');

const wled = { state: { on: true, bri: 77, ps: -1, seg: [{ id: 0, start: 0, stop: 300, len: 300, fx: 0, col: [[255, 160, 0]], frz: false }] }, posts: [] };
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/json/state') return res.end(JSON.stringify(wled.state));
    if (req.method === 'GET' && req.url === '/json/info') return res.end(JSON.stringify({ name: 'WLED', ver: '0.15.0', leds: { count: 300 } }));
    if (req.method === 'POST' && req.url === '/json/state') { wled.posts.push(JSON.parse(b)); return res.end('{"success":true}'); }
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `127.0.0.1:${srv.address().port}`;
L._allowLoopback78(true);
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

const key = (s) => `${s.row}-${s.col}`;
const pick = (lay, r, c) => lay.spans.filter((s) => s.spanR === r && s.spanC === c).map(key).sort();
const want = (rows, cols) => rows.flatMap((r) => cols.map((c) => `${r}-${c}`)).sort();

test('fasit: 5 etasjer (13 rader) – samme som OpenSCAD-modellen', () => {
  const lay = LAY.presetLayout81('skjoldlab3d', 5);
  assert.equal(lay.rows, 13); assert.equal(lay.cols, 11);
  assert.deepEqual(pick(lay, 2, 2), want([1, 3, 6, 9, 12], [1, 3]));
  assert.deepEqual(pick(lay, 1, 2), [...want([5, 8, 11], [1, 3]), '1-5', '1-8', '1-10', '2-5'].sort());
  assert.deepEqual(LAY.summary81(lay), { big: 10, wide: 10, single: 83 });
});
test('fasit: 4 etasjer (11 rader)', () => {
  const lay = LAY.presetLayout81('skjoldlab3d', 4);
  assert.equal(lay.rows, 11); assert.equal(lay.cols, 11);
  assert.deepEqual(pick(lay, 2, 2), want([1, 4, 7, 10], [1, 3]));
  assert.deepEqual(pick(lay, 1, 2), [...want([3, 6, 9], [1, 3]), '1-5', '1-8', '1-10', '2-5'].sort());
  assert.deepEqual(LAY.summary81(lay), { big: 8, wide: 10, single: 69 });
  assert.equal(LAY.presetLayout81('skjoldlab3d', 3).error, 'etasjer må være 4 eller 5');
  assert.ok(LAY.presetLayout81('ukjent', 4).error);
});

test('migrering: span_r/span_c finnes med standard 1, eldre rader virker', () => {
  const cols = db.prepare('PRAGMA table_info(skj_drawers)').all();
  for (const n of ['span_r', 'span_c']) { const c = cols.find((x) => x.name === n); assert.ok(c, n); assert.equal(c.notnull, 1); assert.equal(String(c.dflt_value), '1'); }
});

test('GET /presets og POST /cabinets/:id/preset (409 med deler utenfor, ingenting endres)', async () => {
  const p = await A('/presets');
  assert.equal(p.status, 200);
  assert.deepEqual(p.body.map((x) => [x.id, x.name, x.options.etasjer]), [['skjoldlab3d', 'Skjold Lab-hylla (3D-print)', [4, 5]]]);
  assert.ok(p.body[0].description);

  const cab = (await A('/cabinets', 'POST', { name: 'Hylla', rows: 14, cols: 12, kind: 'kjøpt' })).body;
  const far = (await A('/parts', 'POST', { name: 'Langt unna', cabinetId: cab.id, row: 14, col: 2 })).body;
  await A(`/cabinets/${cab.id}/leds`, 'PUT', { host: HOST, enabled: true, color: '#ff0000' });
  const r409 = await A(`/cabinets/${cab.id}/preset`, 'POST', { id: 'skjoldlab3d', etasjer: 4 });
  assert.equal(r409.status, 409);
  assert.deepEqual(r409.body.parts.map((x) => [x.id, x.short]), [[far.id, '14-2']]);
  assert.equal((await A('/cabinets')).body.find((x) => x.id === cab.id).rows, 14);
  assert.equal((await A(`/cabinets/${cab.id}/preset`, 'POST', { id: 'skjoldlab3d', etasjer: 7 })).status, 400);

  await A(`/parts/${far.id}/move`, 'POST', { cabinetId: cab.id, row: 2, col: 2 }); // i den store skuffen 1-1 (rad 1–2, skuff 1–2)
  const ok = await A(`/cabinets/${cab.id}/preset`, 'POST', { id: 'skjoldlab3d', etasjer: 4 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.rows, 11); assert.equal(ok.body.cols, 11); assert.equal(ok.body.kind, '3d');
  assert.equal(ok.body.counts.drawers, 8 + 10 + 69);
  assert.equal(ok.body.moved, 1);
  const part = (await A(`/parts/${far.id}`)).body;
  assert.equal(part.location.short, '1-1');
  assert.match(part.location.text, /Hylla · Rad 1–2 · Skuff 1–2$/);
  const h = part.history.find((x) => x.action === 'flyttet' && x.to?.note);
  assert.equal(h.to.note, 'flyttet ved sammenslåing');

  // LED-geometrien satt, verten/farge/enabled urørt
  const leds = (await A(`/cabinets/${cab.id}/leds`)).body;
  assert.equal(leds.host, HOST); assert.equal(leds.enabled, true); assert.equal(leds.color.toLowerCase(), '#ff0000');
  assert.equal(leds.layout, 'same'); assert.equal(leds.ledPitchMm, 16.667); assert.equal(leds.drawerPitchMm, 50); assert.equal(leds.firstDrawerXmm, 25);
  assert.deepEqual(leds.overrides, {}); assert.equal(leds.rowsAuto, true);

  // Kartet: alle ruter, dekkede har coveredBy, ankeret har spenn
  const map = (await A(`/cabinets/${cab.id}/map`)).body;
  assert.equal(map.drawers.length, 121);
  const at = (r, c) => map.drawers.find((d) => d.row === r && d.col === c);
  assert.deepEqual([at(1, 1).spanR, at(1, 1).spanC, at(1, 1).coveredBy, at(1, 1).count], [2, 2, null, 1]);
  assert.equal(at(2, 2).coveredBy, '1-1'); assert.equal(at(1, 2).coveredBy, '1-1');
  assert.deepEqual([at(3, 1).spanR, at(3, 1).spanC], [1, 2]); assert.equal(at(3, 2).coveredBy, '3-1');
  assert.deepEqual([at(5, 5).spanR, at(5, 5).spanC, at(5, 5).coveredBy], [1, 1, null]);
  assert.equal(map.drawers.filter((d) => d.coveredBy).length, 121 - 87);

  // 5 etasjer: 13 rader, 103 skuffer
  const five = await A(`/cabinets/${cab.id}/preset`, 'POST', { id: 'skjoldlab3d', etasjer: 5 });
  assert.equal(five.body.rows, 13); assert.equal(five.body.counts.drawers, 103);
  const m5 = (await A(`/cabinets/${cab.id}/map`)).body;
  assert.equal(m5.drawers.find((d) => d.row === 4 && d.col === 1).coveredBy, '3-1'); // stor i rad 3–4
  assert.equal(m5.drawers.find((d) => d.row === 10 && d.col === 4).coveredBy, '9-3');
});

test('oppretting med preset og ledige skuffer hopper over dekkede ruter', async () => {
  const r = await A('/cabinets', 'POST', { name: 'Ny hylle', preset: { id: 'skjoldlab3d', etasjer: 4 } });
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.rows, r.body.cols, r.body.kind, r.body.counts.drawers], [11, 11, '3d', 87]);
  assert.equal((await A('/cabinets', 'POST', { name: 'Feil', preset: { id: 'x' } })).status, 400);
  const free = (await A(`/free?cabinet=${r.body.id}`)).body;
  assert.equal(free.cabinets[0].freeCount, 87);
  assert.equal(free.first.text, 'Ny hylle · Rad 1–2 · Skuff 1–2');
  assert.ok(!free.cabinets[0].free.some((x) => x.short === '1-2'));
});

test('PUT spenn: slå sammen, overlapp 409, utenfor 409, deler flyttes til ankeret, dele igjen', async () => {
  const cab = (await A('/cabinets', 'POST', { name: 'Manuelt', rows: 6, cols: 5 })).body;
  const p = (await A('/parts', 'POST', { name: 'Skrue', cabinetId: cab.id, row: 2, col: 3, compartment: 2 })).body;
  await A(`/cabinets/${cab.id}/drawers/2/3`, 'PUT', { label: 'Gammel etikett' });
  const m = await A(`/cabinets/${cab.id}/drawers/1/2`, 'PUT', { spanR: 2, spanC: 2 });
  assert.equal(m.status, 200);
  assert.deepEqual([m.body.drawer.spanR, m.body.drawer.spanC, m.body.moved], [2, 2, 1]);
  const moved = (await A(`/parts/${p.id}`)).body;
  assert.equal(moved.location.short, '1-2');
  assert.equal(moved.compartment, null); // ankeret har 1 rom
  assert.equal(moved.location.text, 'Manuelt · Rad 1–2 · Skuff 2–3');

  const ov = await A(`/cabinets/${cab.id}/drawers/2/3`, 'PUT', { spanR: 1, spanC: 2 });
  assert.equal(ov.status, 409); assert.match(ov.body.error, /Overlapper/);
  assert.equal((await A(`/cabinets/${cab.id}/drawers/6/5`, 'PUT', { spanR: 1, spanC: 2 })).status, 409);
  assert.equal((await A(`/cabinets/${cab.id}/drawers/3/1`, 'PUT', { spanR: 5, spanC: 1 })).status, 400);
  assert.equal((await A(`/cabinets/${cab.id}/drawers/3/2`, 'PUT', { spanR: 1, spanC: 2 })).status, 200); // rett under: ingen overlapp

  // Bred skuff: «Rad 3 · Skuff 2–3»
  const q2 = (await A('/parts', 'POST', { name: 'Mutter', cabinetId: cab.id, row: 3, col: 3 })).body;
  assert.equal(q2.location.short, '3-2'); // dekket rute → ankeret ved lagring
  assert.equal(q2.location.text, 'Manuelt · Rad 3 · Skuff 2–3');

  // Klient som flytter til en dekket rute → ankeret
  const mv = await A(`/parts/${p.id}/move`, 'POST', { cabinetId: cab.id, row: 3, col: 3 });
  assert.equal(mv.body.part.location.short, '3-2');

  // Etikett på en dekket rute uten spenn → ankeret
  const lab = await A(`/cabinets/${cab.id}/drawers/2/2`, 'PUT', { label: 'Stor' });
  assert.equal(lab.body.drawer.short, '1-2'); assert.equal(lab.body.drawer.label, 'Stor');

  // Dele igjen: 2-3 får tilbake sin gamle etikett
  const sp = await A(`/cabinets/${cab.id}/drawers/1/2`, 'PUT', { spanR: 1, spanC: 1 });
  assert.deepEqual([sp.body.drawer.spanR, sp.body.drawer.spanC], [1, 1]);
  const map = (await A(`/cabinets/${cab.id}/map`)).body;
  assert.equal(map.drawers.find((d) => d.row === 2 && d.col === 3).label, 'Gammel etikett');
  assert.equal(map.drawers.find((d) => d.row === 2 && d.col === 3).coveredBy, null);

  // Krymping kutter spenn som stikker utenfor
  await A(`/cabinets/${cab.id}/drawers/5/4`, 'PUT', { spanR: 2, spanC: 2 });
  await A(`/cabinets/${cab.id}`, 'PATCH', { rows: 5 });
  const d54 = (await A(`/cabinets/${cab.id}/map`)).body.drawers.find((d) => d.row === 5 && d.col === 4);
  assert.deepEqual([d54.spanR, d54.spanC], [1, 2]);
});

test('eldre data i en dekket rute: kartet teller på ankeret, plasseringen normaliseres ved lagring', async () => {
  const cab = (await A('/cabinets', 'POST', { name: 'Eldre', rows: 4, cols: 4 })).body;
  await A(`/cabinets/${cab.id}/drawers/1/1`, 'PUT', { spanR: 2, spanC: 2 });
  const p = (await A('/parts', 'POST', { name: 'Gammel del', cabinetId: cab.id, row: 4, col: 4 })).body;
  db.prepare('UPDATE skj_parts SET row=2, col=2 WHERE id=?').run(p.id); // som før migreringen
  const map = (await A(`/cabinets/${cab.id}/map`)).body;
  assert.equal(map.drawers.find((d) => d.row === 1 && d.col === 1).count, 1);
  assert.equal(map.drawers.find((d) => d.row === 2 && d.col === 2).count, 0);
  const up = (await A(`/parts/${p.id}`, 'PATCH', { qty: 3, cabinetId: cab.id, row: 2, col: 2 })).body;
  assert.equal(up.location.short, '1-1');
  assert.deepEqual(ST.anchorOf81(cab.id, 2, 1), { row: 1, col: 1 });
});

test('locate fra en dekket rute tenner LED-en over ankeret (øverste venstre rute)', async () => {
  const cab = (await A('/cabinets', 'POST', { name: 'LED-hylla', preset: { id: 'skjoldlab3d', etasjer: 4 } })).body;
  await A(`/cabinets/${cab.id}/leds`, 'PUT', { host: HOST, enabled: true, durationS: 1 });
  const leds = (await A(`/cabinets/${cab.id}/leds`)).body;
  const idx = (r, c) => leds.map.find((d) => d.row === r && d.col === c).index;
  L._resetRate78(); wled.posts = [];
  const r = await A('/locate', 'POST', { cabinetId: cab.id, row: 5, col: 2 }); // dekket av 4-1 (rad 4–5, skuff 1–2)
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.lit.length, 1);
  assert.deepEqual([r.body.lit[0].row, r.body.lit[0].col, r.body.lit[0].index], [4, 1, idx(4, 1)]);
  // Ankeret og en dekket rute i samme kall → én skuff
  L._resetRate78();
  const r2 = await A('/locate', 'POST', { drawers: [{ cabinetId: cab.id, row: 4, col: 1 }, { cabinetId: cab.id, row: 5, col: 1 }] });
  assert.equal(r2.body.lit.length, 2); assert.ok(r2.body.lit.every((x) => x.row === 4 && x.col === 1));
  await L._resetLeds78();
});

test('per bruker: andre ser ikke skapet og kan ikke bruke preset/spenn', async () => {
  const cab = (await A('/cabinets', 'POST', { name: 'Mitt', rows: 3, cols: 3 })).body;
  assert.equal((await B(`/cabinets/${cab.id}/preset`, 'POST', { id: 'skjoldlab3d', etasjer: 4 })).status, 404);
  assert.equal((await B(`/cabinets/${cab.id}/drawers/1/1`, 'PUT', { spanR: 2, spanC: 2 })).status, 404);
  assert.equal((await B('/presets')).status, 200);
});
