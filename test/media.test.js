// Plex og Jellyfin mot små lokale testservere: spilles nå, nylig lagt til, plakater og «Test tilkobling».
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-media-'));
process.env.SESSION_SECRET = 'testsecret-testsecret-testsecret-12';
process.env.NODE_ENV = 'test';
process.env.APP_PASSWORD_HASH = '';
delete process.env.MOCK_DATA;

const seen = [];
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const plex = createServer((req, res) => {
  seen.push(['plex', req.url, req.headers['x-plex-token']]);
  if (req.headers['x-plex-token'] !== 'ptok') { res.writeHead(401); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') return json(res, { MediaContainer: { friendlyName: 'Stue-Plex', version: '1.41.3.9314-a0bfb8370', machineIdentifier: 'abc' } });
  if (u.pathname === '/status/sessions') return json(res, { MediaContainer: { Metadata: [
    { type: 'episode', grandparentTitle: 'Severance', title: 'Trojan’s Horse', parentIndex: 2, index: 5, grandparentThumb: '/library/metadata/10/thumb/111', duration: 3_000_000, viewOffset: 600_000,
      User: { title: 'Ingrid' }, Player: { title: 'Stue-TV', state: 'paused' }, Media: [{ videoResolution: '4k' }], TranscodeSession: { videoDecision: 'transcode' } },
  ] } });
  if (u.pathname === '/library/recentlyAdded') return json(res, { MediaContainer: { Metadata: [
    { type: 'movie', title: 'Flow', year: 2024, thumb: '/library/metadata/20/thumb/222', addedAt: 1_760_000_000 },
  ] } });
  if (u.pathname === '/status/sessions/history/all') return json(res, { MediaContainer: { Metadata: [
    { type: 'episode', ratingKey: '501', grandparentTitle: 'FBI', title: 'Long Shot', parentIndex: 8, index: 21, viewedAt: 1_760_700_000, accountID: 1, grandparentThumb: '/library/metadata/40/thumb/1' },
    { type: 'movie', ratingKey: '502', title: 'Flow', year: 2024, viewedAt: 1_760_600_000, accountID: 7, thumb: '/library/metadata/20/thumb/222' },
  ] } });
  if (u.pathname === '/accounts') return json(res, { MediaContainer: { Account: [{ id: 1, name: 'sebastiankristo' }, { id: 7, name: 'Ingrid' }] } });
  if (u.pathname === '/photo/:/transcode') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(Buffer.from([0xff, 0xd8, 0xff])); }
  res.writeHead(404); res.end();
});
const jf = createServer((req, res) => {
  seen.push(['jf', req.url, req.headers['x-emby-token'], req.headers.authorization]);
  if (req.headers['x-emby-token'] !== 'jkey') { res.writeHead(401); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/System/Info') return json(res, { ServerName: 'Kjeller', Version: '10.10.3' });
  if (u.pathname === '/Sessions') return json(res, [
    { UserName: 'Sebastian', DeviceName: 'iPhone', PlayState: { PositionTicks: 6_000_000_000, IsPaused: false, PlayMethod: 'DirectPlay' },
      NowPlayingItem: { Type: 'Movie', Name: 'Dune: Part Two', ProductionYear: 2024, Id: 'a'.repeat(32), RunTimeTicks: 60_000_000_000, Height: 2160 } },
    { UserName: 'Pål', DeviceName: 'Nettleser' },
  ]);
  if (u.pathname === '/Users') return json(res, [{ Name: 'Pål', Id: 'u1' }, { Name: 'Sebastian', Id: 'u2' }]);
  if (u.pathname === '/Users/u2/Items' && u.searchParams.get('SortBy') === 'DatePlayed') return json(res, { Items: [
    { Type: 'Episode', SeriesName: 'Severance', Name: 'Woe’s Hollow', ParentIndexNumber: 2, IndexNumber: 4, Id: 'd'.repeat(32), SeriesId: 'e'.repeat(32), UserData: { LastPlayedDate: '2025-10-16T20:00:00Z' } },
  ] });
  if (u.pathname === '/Users/u2/Items/Latest') return json(res, [{ Type: 'Episode', SeriesName: 'Andor', ParentIndexNumber: 2, IndexNumber: 3, Id: 'b'.repeat(32), SeriesId: 'c'.repeat(32), DateCreated: '2026-10-17T10:00:00Z' }]);
  res.writeHead(404); res.end();
});
await Promise.all([new Promise((r) => plex.listen(0, '127.0.0.1', r)), new Promise((r) => jf.listen(0, '127.0.0.1', r))]);
after(() => { plex.close(); jf.close(); });

const { updateConfig, publicConfig } = await import('../server/settings.js');
const integ = await import('../server/integrations.js');
updateConfig({
  plex_url: `http://127.0.0.1:${plex.address().port}`, plex_token: 'ptok',
  jf_url: `http://127.0.0.1:${jf.address().port}`, jf_key: 'jkey', jf_user: 'sebastian',
});

test('SCHEMA har id, domene og veiledning for gruppene', () => {
  const groups = publicConfig();
  for (const g of groups) { assert.ok(g.id, g.name); assert.ok(g.domain, g.name); }
  const p = groups.find((g) => g.id === 'plex');
  assert.equal(p.domain, 'plex.tv');
  assert.ok(p.guide.length >= 3);
  assert.equal(p.fields.find((f) => f.key === 'plex_token').value, '', 'tokenet sendes aldri til nettleseren');
  assert.ok(groups.find((g) => g.id === 't212').fields.some((f) => f.key === 't212_secret'));
});

test('spilles nå slår sammen Plex og Jellyfin', async () => {
  const r = await integ.getMediaNow();
  assert.equal(r.configured, true);
  assert.deepEqual(r.servers.map((s) => [s.src, s.name, s.ok]), [['plex', 'Stue-Plex', true], ['jellyfin', 'Kjeller', true]]);
  assert.equal(r.items.length, 2, 'økter uten NowPlayingItem filtreres bort');
  const p = r.items.find((x) => x.src === 'plex');
  assert.equal(p.title, 'Severance · S02E05');
  assert.equal(p.state, 'paused');
  assert.equal(p.mode, 'transcode');
  assert.equal(p.pct, 20);
  assert.equal(p.leftMs, 2_400_000);
  assert.match(p.poster, /^\/api\/media\/poster\?src=plex&id=%2Flibrary%2Fmetadata%2F10%2Fthumb%2F111$/);
  const j = r.items.find((x) => x.src === 'jellyfin');
  assert.equal(j.title, 'Dune: Part Two');
  assert.equal(j.mode, 'direct');
  assert.equal(j.quality, '4K');
  assert.equal(j.pct, 10);
  assert.ok(!JSON.stringify(r).includes('ptok') && !JSON.stringify(r).includes('jkey'), 'ingen nøkler i svaret');
  assert.ok(seen.some(([s, , , auth]) => s === 'jf' && /MediaBrowser .*Token="jkey"/.test(auth)));
});

test('nylig lagt til bruker riktig Jellyfin-bruker og sorterer nyest først', async () => {
  const r = await integ.getMediaRecent();
  assert.deepEqual(r.items.map((x) => [x.src, x.title, x.sub]), [['jellyfin', 'Andor', 'Serie · S02E03'], ['plex', 'Flow', 'Film · 2024']]);
  assert.match(r.items[0].poster, new RegExp(`id=${'c'.repeat(32)}$`), 'episoder viser seriens plakat');
});

test('historikk: siste avspillinger fra begge, nyest først, med bruker, sesong og episode', async () => {
  const r = await integ.getMediaHistory();
  assert.equal(r.configured, true);
  assert.deepEqual(r.items.map((x) => [x.src, x.user, x.show, x.season, x.episode, x.title]), [
    ['plex', 'sebastiankristo', 'FBI', 8, 21, 'Long Shot'],
    ['jellyfin', 'sebastian', 'Severance', 2, 4, 'Woe’s Hollow'],
    ['plex', 'Ingrid', 'Flow', null, null, '2024'],
  ]);
  assert.match(r.items[0].url, /details\?key=%2Flibrary%2Fmetadata%2F501$/);
  assert.match(r.items[1].poster, new RegExp(`id=${'e'.repeat(32)}$`), 'episoder viser seriens plakat');
  assert.ok(!JSON.stringify(r).includes('ptok') && !JSON.stringify(r).includes('jkey'));
});

test('plakat-proxy godtar bare gyldige ID-er', async () => {
  const img = await integ.getMediaPoster('plex', '/library/metadata/10/thumb/111');
  assert.equal(img.type, 'image/jpeg');
  assert.equal(img.body[0], 0xff);
  assert.equal(await integ.getMediaPoster('plex', 'http://evil/x'), null);
  assert.equal(await integ.getMediaPoster('plex', '/library/../../etc'), null);
  assert.equal(await integ.getMediaPoster('jellyfin', '../Users'), null);
  assert.equal(await integ.getMediaPoster('annet', 'x'), null);
});

test('«Test tilkobling» for Plex og Jellyfin (også med id)', async () => {
  const p = await integ.testIntegration('plex');
  assert.equal(p.ok, true, p.message);
  assert.match(p.message, /Stue-Plex 1\.41\.3 svarer · 1 spiller nå/);
  const j = await integ.testIntegration('Jellyfin');
  assert.equal(j.ok, true, j.message);
  assert.match(j.message, /Kjeller 10\.10\.3 svarer · 1 spiller nå\. Fant brukeren sebastian\./);
  updateConfig({ plex_token: 'feil' });
  const bad = await integ.testIntegration('Plex');
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Vis XML/);
});

test('Trading 212 bruker Basic med Key ID og secret', () => {
  updateConfig({ t212_key: ' "KEY123" ', t212_secret: 'SEC\n', t212_env: 'demo' });
  const a = integ.t212Auth();
  assert.equal(a.base, 'https://demo.trading212.com');
  assert.equal(a.headers.Authorization, `Basic ${Buffer.from('KEY123:SEC').toString('base64')}`);
  assert.throws(() => updateConfig({ t212_env: 'cfd' }));
});
