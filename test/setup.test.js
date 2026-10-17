// Ny server uten brukere og uten APP_PASSWORD_HASH: førstegangsoppsettet lager hovedadmin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-setup-'));
process.env.SESSION_SECRET = 'testsecret-testsecret-testsecret-12';
process.env.NODE_ENV = 'test';
process.env.APP_PASSWORD_HASH = ''; // tom (ikke slettet), så .env ikke leses inn
delete process.env.MOCK_DATA;
const auth = await import('../server/auth.js');
const { default: app } = await import('../server/index.js');
const { parseTakeout } = await import('../server/mobile.js');

const post = (path, body, cookie) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

test('tom server ber om oppsett, og oppsettet logger inn hovedadmin', async () => {
  assert.equal(auth.needsSetup(), true);
  assert.deepEqual(await (await app.request('/api/setup/status')).json(), { needsSetup: true });
  assert.equal((await post('/api/setup', { adminName: '', username: 'kari', password: 'passord123' })).status, 400);
  assert.equal((await post('/api/setup', { adminName: 'Kari', username: 'K', password: 'passord123' })).status, 400);
  assert.equal((await post('/api/setup', { adminName: 'Kari', username: 'kari', password: 'kort' })).status, 400);
  const r = await post('/api/setup', { adminName: 'Kari Ødegård', serverName: 'Torskenes', username: 'kariodegard', password: 'passord123' });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const me = await (await app.request('/api/me', { headers: { cookie } })).json();
  assert.equal(me.name, 'Kari Ødegård');
  assert.equal(me.isMainAdmin, true);
  assert.equal(me.role, 'admin');
  assert.equal(me.serverName, 'Torskenes');
  assert.equal((await post('/api/setup', { adminName: 'X', username: 'xx', password: 'passord123' })).status, 409);
  assert.equal(auth.verifyLogin('kariodegard', 'passord123').ok, true);

  // Oppsett av forside og meny lagres per bruker og flettes.
  const put = (body) => app.request('/api/me/layout', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put({ mobile: { sec: ['top', 'links'], hide: { links: true } } })).status, 200);
  const lay = await (await put({ homelab: { hiddenWidgets: ['d_links'] } })).json();
  assert.deepEqual(lay.mobile.hide, { links: true });
  assert.deepEqual(lay.homelab.hiddenWidgets, ['d_links']);
  assert.equal((await put({ ukjent: 1 })).status, 400);

  // Søkehistorikk: nyeste først, uten duplikater.
  await post('/api/search/history', { q: 'vær oslo' }, cookie);
  await post('/api/search/history', { q: 'nrk' }, cookie);
  await post('/api/search/history', { q: 'Vær Oslo' }, cookie);
  assert.deepEqual((await (await app.request('/api/search/history', { headers: { cookie } })).json()).items, ['Vær Oslo', 'nrk']);
  assert.equal((await app.request('/api/search/history')).status, 401);
});

test('Google Takeout: bare søk tas med', () => {
  assert.deepEqual(parseTakeout([{ title: 'Searched for proxmox lxc' }, { title: 'Søkte etter taco' }, { title: 'Visited vg.no' }, {}]), ['proxmox lxc', 'taco']);
  assert.deepEqual(parseTakeout({ queries: ['a b', 'c'] }), ['a b', 'c']);
});
