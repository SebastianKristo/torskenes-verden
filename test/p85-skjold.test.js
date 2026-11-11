// Prompt 85 (SKJ85): feil funnet i gjennomgangen av Skjold Lab – delvis CSV-import, gjenoppretting/angring etter at skapet er krympet, grenser for antall og historikk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-p85skj-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p85';
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
test.after(() => { try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
const A = (path, method = 'GET', body) => req(`/api/skjold${path}`, { method, headers: { cookie }, body });

test('CSV-import med bare noen kolonner lar resten av delen stå', async () => {
  const p = (await A('/parts', 'POST', { name: 'Kondensator', category: 'Kondensatorer', description: 'Keramisk', supplier: 'Elfa', qty: 3, tags: ['smd'] })).body;
  const r = await A('/import', 'POST', { csv: `id,name,qty\n${p.id},Kondensator,7` });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.update, 1);
  const b = (await A(`/parts/${p.id}`)).body;
  assert.deepEqual([b.qty, b.category, b.description, b.supplier, b.tags], [7, 'Kondensatorer', 'Keramisk', 'Elfa', ['smd']]);
  // En tom celle i en kolonne som FINNES tømmer fortsatt feltet.
  await A('/import', 'POST', { csv: `id,name,category\n${p.id},Kondensator,` });
  const c = (await A(`/parts/${p.id}`)).body;
  assert.deepEqual([c.category, c.description, c.supplier], [null, 'Keramisk', 'Elfa']);
  // Ny del uten kolonnene.
  const n = await A('/import', 'POST', { csv: 'name,qty\nNy fra CSV,2' });
  assert.equal(n.body.create, 1);
});

test('gjenoppretting og angre flytting etter at skapet er krympet gir «Uten plass», ikke en skuff som ikke finnes', async () => {
  const cab = (await A('/cabinets', 'POST', { name: 'Krymper', rows: 6, cols: 4 })).body;
  const ytterst = (await A('/parts', 'POST', { name: 'Ytterst', qty: 1, cabinetId: cab.id, row: 6, col: 4 })).body;
  const flyttet = (await A('/parts', 'POST', { name: 'Flyttet', qty: 1, cabinetId: cab.id, row: 5, col: 4 })).body;
  const inne = (await A('/parts', 'POST', { name: 'Inne', qty: 1, cabinetId: cab.id, row: 2, col: 2 })).body;
  await A(`/parts/${ytterst.id}`, 'DELETE');
  await A(`/parts/${inne.id}`, 'DELETE');
  await A(`/parts/${flyttet.id}/move`, 'POST', { cabinetId: cab.id, row: 1, col: 1 });
  const hid = (await A(`/parts/${flyttet.id}/history`)).body.items.find((h) => h.action === 'flyttet').id;
  assert.equal((await A(`/cabinets/${cab.id}`, 'PATCH', { rows: 3, cols: 2 })).status, 200);
  const r1 = await A(`/parts/${ytterst.id}/restore`, 'POST');
  assert.equal(r1.status, 200);
  assert.equal(r1.body.location.text, 'Uten plass');
  assert.equal(r1.body.cabinet_id, null);
  const r2 = await A(`/parts/${inne.id}/restore`, 'POST');
  assert.deepEqual([r2.body.cabinet_id, r2.body.row, r2.body.col], [cab.id, 2, 2], 'skuffen finnes fortsatt – plassen beholdes');
  const u = await A(`/history/${hid}/undo`, 'POST');
  assert.equal(u.status, 200);
  assert.equal(u.body.part.location.text, 'Uten plass');
  const map = (await A(`/cabinets/${cab.id}/map`)).body;
  assert.equal(map.counts.parts, map.drawers.reduce((s, d) => s + d.count, 0), 'alle deler i skapet ligger i en skuff som finnes');
});

test('antall har en øvre grense, og historikken kan ikke hentes ubegrenset', async () => {
  const p = (await A('/parts', 'POST', { name: 'Grense', qty: 1 })).body;
  assert.equal((await A(`/parts/${p.id}/qty`, 'POST', { set: 1e300 })).status, 400);
  assert.equal((await A(`/parts/${p.id}/qty`, 'POST', { set: 1e9 })).status, 200);
  assert.equal((await A(`/parts/${p.id}/qty`, 'POST', { delta: 1e300 })).body.qty, 1e9);
  const h = await A('/history?limit=-1');
  assert.equal(h.status, 200);
  assert.equal(h.body.items.length, 1);
});

test('web: plasseringslinja i lista kan forkortes med «…», og skaplista bøyer entall riktig', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../public/css/skjold76.css', import.meta.url), 'utf8');
  const loc = /\.sk76-loc\{([^}]*)\}/.exec(css)[1];
  assert.match(loc, /text-overflow:ellipsis/);
  assert.doesNotMatch(loc, /display:flex/, 'text-overflow virker ikke på teksten i en flex-boks');
  const js = readFileSync(new URL('../public/js/skjold76-edit.js', import.meta.url), 'utf8');
  assert.match(js, /parts === 1 \? '1 del'/);
  assert.match(js, /usedDrawers === 1 \? '1 skuff'/);
});
