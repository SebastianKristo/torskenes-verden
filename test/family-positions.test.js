// Prompt 20: posisjonskortet – GET /api/family/positions, egen farge per person, DELETE /health/me og fmOrder i layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-pos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const auth = await import('../server/auth.js');
const { default: fin } = await import('../server/finans/routes.js');
const { default: fam, initials, PALETTE } = await import('../server/family.js');
const { default: mobile } = await import('../server/mobile.js');

// Nominatim mockes: strøk etter breddegrad, og alle kall telles (de skal caches).
const geo = [];
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  assert.equal(u.hostname, 'nominatim.openstreetmap.org');
  geo.push({ url: String(url), ua: opts?.headers?.['User-Agent'] });
  const lat = +u.searchParams.get('lat');
  const address = lat > 59.93 ? { suburb: 'Sagene', city: 'Oslo' } : { suburb: 'Grünerløkka', city: 'Oslo' };
  return new Response(JSON.stringify({ address }), { headers: { 'content-type': 'application/json' } });
};

auth.createUser({ username: 'cybele', password: 'testpassord2', name: 'Cybele' });
auth.createUser({ username: 'rune', password: 'testpassord3', name: 'Rune' });
const tok = async (username, password) => (await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })).json()).token;
const S = await tok('sebastian', 'testpassord1'), C = await tok('cybele', 'testpassord2'), R = await tok('rune', 'testpassord3');
const call = (t, app = fam) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const s = call(S), c = call(C), r = call(R);
const id = (u) => auth.listUsers().find((x) => x.username === u).id;

test('Du først og bare én gang, så familien; to-bokstavs initialer og egen farge', async () => {
  const res = await s('/positions');
  assert.equal(res.status, 200);
  const rows = res.body;
  assert.deepEqual(rows.map((x) => x.navn), ['Du', 'Cybele', 'Rune']);
  assert.equal(rows.filter((x) => x.self).length, 1);
  assert.equal(rows[0].id, id('sebastian'));
  assert.deepEqual(rows.map((x) => x.initialer), ['Du', 'Cy', 'Ru']);
  for (const x of rows) {
    assert.match(x.farge, /^#[0-9a-f]{6}$/i);
    for (const k of ['id', 'navn', 'farge', 'bilde', 'sone', 'aktivitet', 'sted', 'oppdatert', 'status', 'self', 'linje2', 'initialer']) assert.ok(k in x, k);
    assert.equal(x.status, 'off');
    assert.equal(x.linje2, 'Deler ikke posisjon');
  }
  assert.equal(initials('Påul Hansen'), 'På');
  assert.equal((await fam.request('/positions')).status, 401);
});

test('sone, aktivitet og strøk via Nominatim (cache), aldri «Ukjent sted»', async () => {
  await s('/zones', 'POST', { name: 'Hjem', lat: 59.9275, lon: 10.7160, radius: 150 });
  await s('/location', 'POST', { lat: 59.9275, lon: 10.7161, acc: 8 });
  await c('/location', 'POST', { lat: 59.9230, lon: 10.7590, speed: 1.4, activity: 'walking' });
  await r('/location', 'POST', { lat: 59.9380, lon: 10.7560, activity: 'still' });
  const rows = (await s('/positions')).body;
  const [du, cy, ru] = rows;
  assert.equal(du.sone, 'Hjem');
  assert.equal(du.linje2, 'Hjem');
  assert.equal(du.status, 'fresh');
  assert.equal(cy.aktivitet, 'går');
  assert.equal(cy.sted, 'Grünerløkka');
  assert.equal(cy.linje2, 'Går · Grünerløkka');
  assert.equal(ru.aktivitet, 'stille');
  assert.equal(ru.linje2, 'Sagene');
  assert.ok(rows.every((x) => !/Ukjent/.test(x.linje2)));
  assert.ok(geo.every((g) => g.ua === 'KristoHomelab/1.0 (kontakt@kristo.no)'));
  const n = geo.length;
  await s('/positions');
  assert.equal(geo.length, n, 'geokodingen er cachet');
});

test('gammel posisjon er stale, «Sist sett» etter to timer; pause gir off', async () => {
  await c('/location', 'POST', { lat: 59.9230, lon: 10.7590, ts: Date.now() - 20 * 60_000 }); // eldre punkt endrer ikke siste
  await r('/location', 'POST', { points: [{ lat: 59.9380, lon: 10.7560, ts: Date.now() + 60_000 }] });
  const stale = (await import('../server/db.js')).db;
  stale.prepare('UPDATE family_pos SET ts=? WHERE user=?').run(Date.now() - 3 * 3_600_000, id('rune'));
  let ru = (await s('/positions')).body.find((x) => x.navn === 'Rune');
  assert.equal(ru.status, 'stale');
  assert.match(ru.linje2, /^Sist sett (\d{1,2}\.\d{1,2}\. )?\d{2}:\d{2}$/);
  stale.prepare('UPDATE family_pos SET ts=? WHERE user=?').run(Date.now() - 20 * 60_000, id('rune'));
  ru = (await s('/positions')).body.find((x) => x.navn === 'Rune');
  assert.equal(ru.status, 'stale');
  assert.equal(ru.linje2, 'Sagene');
  await c('/me', 'PUT', { sharing: 'paused' });
  const cy = (await s('/positions')).body.find((x) => x.navn === 'Cybele');
  assert.equal(cy.status, 'off');
  assert.equal(cy.linje2, 'Deler ikke posisjon');
  assert.equal(cy.sted, null);
  await c('/me', 'PUT', { sharing: 'on' });
});

test('farge: stabil fra paletten, kan endres med PUT /me og vises i GET /api/family', async () => {
  const before = (await s('/')).body.members.find((m) => m.userId === id('cybele')).color;
  assert.ok(PALETTE.includes(before));
  assert.equal((await s('/')).body.members.find((m) => m.userId === id('cybele')).color, before);
  assert.equal((await c('/me', 'PUT', { color: 'rød' })).status, 400);
  const put = await c('/me', 'PUT', { color: '#123ABC' });
  assert.equal(put.body.me.color, '#123abc');
  assert.equal((await s('/')).body.members.find((m) => m.userId === id('cybele')).color, '#123abc');
  assert.equal((await s('/positions')).body.find((x) => x.navn === 'Cybele').farge, '#123abc');
  await c('/me', 'PUT', { color: null });
  assert.equal((await s('/')).body.members.find((m) => m.userId === id('cybele')).color, before);
});

test('DELETE /health/me sletter bare egne helsedata', async () => {
  const d = new Date().toISOString().slice(0, 10);
  await c('/health', 'POST', { date: d, steps: 1234 });
  await r('/health', 'POST', { date: d, steps: 999 });
  const del = await c('/health/me', 'DELETE');
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, 1);
  const members = (await s('/')).body.members;
  assert.equal(members.find((m) => m.userId === id('cybele')).health, null);
  assert.equal(members.find((m) => m.userId === id('rune')).health.today.steps, 999);
});

test('/api/me/layout godtar fmOrder (maks 30 id-er, [a-z0-9-], maks 40 tegn)', async () => {
  const m = call(S, mobile);
  const ok = await m('/me/layout', 'PUT', { fmOrder: ['budsjett', 'kvitteringer', 'faste-utgifter'] });
  assert.equal(ok.status, 200);
  assert.deepEqual((await m('/me/layout')).body.fmOrder, ['budsjett', 'kvitteringer', 'faste-utgifter']);
  for (const bad of [['Budsjett'], ['a b'], ['x'.repeat(41)], Array.from({ length: 31 }, (_, i) => `f${i}`), 'budsjett', ['a', 'a'], [1]]) {
    assert.equal((await m('/me/layout', 'PUT', { fmOrder: bad })).status, 400, JSON.stringify(bad).slice(0, 40));
  }
  assert.equal((await m('/me/layout', 'PUT', { fmOrder: null })).status, 200);
  assert.equal((await m('/me/layout')).body.fmOrder, undefined);
});
