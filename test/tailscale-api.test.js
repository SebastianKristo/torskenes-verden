// Tailscale (prompt 57): /api/tailscale/* mot en falsk tailscaled på en unix-socket. Bare administratorer (økt og app-token),
// tekstene regnes på serveren («ukjent», «sist sett 3 d», «Svar på 2,1 ms»), visningen lagres per bruker, Test-knappen i
// Tilkoblinger, sanntid når en enhet går offline, og nøkkelen kommer aldri ut i noe svar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-ts-api-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-ts57';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const SOCK = join(DATA, 'tailscaled.sock');
process.env.TAILSCALE_SOCKET = SOCK;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };

// Falsk tailscaled: statusen kan endres underveis (hytta kommer online, unraid går offline).
const STATUS = JSON.parse(readFileSync(new URL('./fixtures/tailscale/localapi-status.json', import.meta.url), 'utf8'));
const seen = [];
const srv = createServer((req, res) => {
  seen.push(`${req.method} ${req.url}`);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'GET' && req.url === '/localapi/v0/status') return res.end(JSON.stringify(STATUS));
  if (req.method === 'POST' && req.url.startsWith('/localapi/v0/ping')) return res.end(JSON.stringify({ LatencySeconds: 0.0021, Endpoint: '192.168.1.40:41641' }));
  res.statusCode = 404; res.end('{}');
});
await new Promise((r) => srv.listen(SOCK, r));
test.after(async () => { globalThis.fetch = realFetch; await new Promise((r) => srv.close(r)); try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

const { default: app } = await import('../server/index.js');
const auth = await import('../server/auth/session.js');
const { clearCache } = await import('../server/cache.js');
const TS = await import('../server/tailscale/index.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
const A = (p, method = 'GET', body) => req(p, { method, headers: { cookie }, body });
const B = (p, method = 'GET', body) => req(p, { method, headers: { cookie: cookie2 }, body });
const token = (await req('/finans/api/login', { method: 'POST', body: { username: 'sebastian', password: 'testpassord1', deviceName: 'Tailscale-test' } })).body.token;
const T = (p, method = 'GET', body) => req(p, { method, headers: { authorization: `Bearer ${token}` }, body });

test('bare administratorer: vanlig bruker får 403, uten innlogging 401', async () => {
  assert.equal((await B('/api/tailscale/devices')).status, 403);
  assert.equal((await B('/api/tailscale/stats')).status, 403);
  assert.equal((await B('/api/tailscale/devices/nUNRAID1CNTRL/ping', 'POST')).status, 403);
  assert.equal((await req('/api/tailscale/devices')).status, 401);
  assert.equal((await T('/api/tailscale/devices')).status, 200, 'app-token for admin virker (appene)');
});

test('GET /devices: normalisert liste, antall, filtre med antall og ferdige tekster', async () => {
  const r = await A('/api/tailscale/devices');
  assert.equal(r.status, 200, r.text);
  const b = r.body;
  assert.equal(b.source, 'localapi');
  assert.equal(b.counts.total, 7);
  assert.equal(b.counts.online, 5);
  assert.deepEqual(b.counts.kinds.server, { total: 3, online: 2 });
  assert.deepEqual(b.filters.map((f) => [f.id, f.count]), [['alle', 5], ['servere', 4], ['datamaskiner', 1], ['mobil', 2], ['offline', 2]]);
  const by = Object.fromEntries(b.devices.map((d) => [d.name, d]));
  assert.equal(by.unraid.latencyLabel, 'ukjent', 'ukjent latens står som «ukjent», aldri «–»');
  assert.match(by.hytta.latencyLabel, /^sist sett \d+ d$/);
  assert.equal(by.unraid.icon, 'server');
  assert.equal(by.unraid.ssh, 'ssh root@unraid.tail1234.ts.net');
  assert.equal(by.homelab.statusLabel, 'Denne serveren');
  assert.deepEqual(b.groups.tags.map((g) => [g.id, g.ids.length]), [['tag:iot', 1], ['tag:server', 3], ['uten tag', 3]]);
  assert.deepEqual(b.view, { filter: 'alle', q: '', group: 'ingen', open: true, showAll: false });
});

test('Ping nå (LocalAPI disco-ping), latensen huskes, og detaljen har historikk og fakta', async () => {
  const p = await A('/api/tailscale/devices/nUNRAID1CNTRL/ping', 'POST');
  assert.equal(p.status, 200, p.text);
  assert.deepEqual(p.body, { ok: true, latencyMs: 2.1, tunnel: 'direkte', label: 'Svar på 2,1 ms' });
  assert.ok(seen.some((s) => s === 'POST /localapi/v0/ping?ip=100.64.0.2&type=disco'));
  const l = await A('/api/tailscale/devices');
  assert.equal(l.body.devices.find((d) => d.name === 'unraid').latencyLabel, '2,1 ms');
  // Prøve, så detaljen.
  await TS.taProver();
  const d = await A('/api/tailscale/devices/nUNRAID1CNTRL?range=7d');
  assert.equal(d.status, 200, d.text);
  assert.equal(d.body.device.name, 'unraid');
  assert.equal(d.body.history.range, '7d');
  assert.equal(d.body.history.uptime['24h'], 1);
  assert.equal(d.body.history.uptimeLabels['24h'], '100 %');
  assert.equal(d.body.history.latency.median, 2.1);
  assert.equal(d.body.history.stripe.length, 30);
  assert.equal(d.body.history.stripe[29].state, 'oppe');
  assert.equal(d.body.canPing, true);
  const f = Object.fromEntries(d.body.facts.map((x) => [x.label, x.value]));
  assert.equal(f.IPv4, '100.64.0.2');
  assert.equal(f.MagicDNS, 'unraid.tail1234.ts.net');
  assert.match(f['Nøkkel utløper'], /^om \d+ dager$/);
  assert.equal((await A('/api/tailscale/devices/finnes-ikke')).status, 404);
  // Ugyldig range → 24h.
  assert.equal((await A('/api/tailscale/devices/nUNRAID1CNTRL?range=1y')).body.history.range, '24h');
});

test('GET /stats: stat-raden, vedlikehold og trafikk i dag', async () => {
  const r = await A('/api/tailscale/stats');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.tiles.map((t) => t.id), ['online', 'latency', 'direct', 'traffic', 'maintenance']);
  assert.equal(r.body.tiles[0].value, '5/7');
  assert.ok(r.body.maintenance.expiring.some((x) => x.name === 'unraid'), 'unraid-nøkkelen utløper snart');
  assert.ok(r.body.maintenance.exitNode.some((x) => x.name === 'sebastians-macbook-pro'));
  assert.ok(r.body.maintenance.offline30.some((x) => x.name === 'ingrids-ipad'));
  assert.equal(r.body.newDevices7d.length, 7, 'første prøve: alle er nye');
});

test('sanntid: en enhet som går offline blir «siste endring» (og sendes som tailscale.node)', async () => {
  // broadcast() uten klienter sender ingenting; endringen som ble sendt, står også som «siste endring».
  STATUS.Peer['nodekey:0000000000000000000000000000000000000000000000000000000000000002'].Online = false;
  STATUS.Peer['nodekey:0000000000000000000000000000000000000000000000000000000000000002'].LastSeen = new Date().toISOString();
  clearCache();
  const r = await A('/api/tailscale/devices');
  assert.equal(r.body.lastChange.name, 'unraid');
  assert.equal(r.body.lastChange.online, false);
  assert.equal(r.body.devices.find((d) => d.name === 'unraid').latencyLabel, 'sist sett 1 min');
  STATUS.Peer['nodekey:0000000000000000000000000000000000000000000000000000000000000002'].Online = true;
  STATUS.Peer['nodekey:0000000000000000000000000000000000000000000000000000000000000002'].LastSeen = '0001-01-01T00:00:00Z';
  clearCache();
});

test('visningen (filter, søk, gruppering, åpen) lagres per bruker på serveren', async () => {
  const r = await A('/api/tailscale/visning', 'PUT', { filter: 'servere', q: 'unr', group: 'tags', open: false, ukjent: 1 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { filter: 'servere', q: 'unr', group: 'tags', open: false, showAll: false });
  assert.deepEqual((await A('/api/tailscale/visning')).body, r.body);
  assert.equal((await A('/api/tailscale/visning', 'PUT', { filter: 'tull' })).body.filter, 'alle', 'ukjent filter → standard');
  assert.equal((await B('/api/tailscale/visning')).status, 403);
});

test('Tilkoblinger → Tailscale: test-knappen, gruppen Nettverk og hemmelighetene sendes aldri ut', async () => {
  const t = await A('/api/integrations/tailscale/test', 'POST');
  assert.equal(t.status, 200);
  assert.equal(t.body.ok, true);
  assert.match(t.body.message, /LocalAPI \(tailscaled\.sock\) svarte: \d+ av 7 enheter online/);
  assert.equal((await A('/api/tailscale/test')).body.ok, true);
  const put = await A('/api/integrations/tailscale', 'PUT', { ts_api_key: 'tskey-api-hemmelig-eksempel', ts_mode: 'auto' });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.body.group, 'Nettverk');
  assert.ok(put.body.fields.find((f) => f.key === 'ts_api_key').saved);
  for (const p of ['/api/integrations', '/api/config', '/api/tailscale/devices', '/api/tailscale/stats', '/api/integrations/tailscale']) {
    const r = await A(p);
    assert.doesNotMatch(r.text, /hemmelig-eksempel/, `${p} lekker nøkkelen`);
  }
  assert.equal((await A('/api/integrations/tailscale', 'PUT', { ts_mode: 'tull' })).status, 400);
  assert.equal((await B('/api/integrations/tailscale/test', 'POST')).status, 403);
  await A('/api/integrations/tailscale/ts_api_key', 'DELETE');
});

test('uten kilde: 503 med tydelig norsk melding', async () => {
  process.env.TAILSCALE_SOCKET = join(DATA, 'borte.sock');
  clearCache();
  const r = await A('/api/tailscale/devices');
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'TAILSCALE_NOT_CONFIGURED');
  assert.equal(r.body.error, 'Fant ikke tailscaled.sock – mount /var/run/tailscale eller bruk API-nøkkel');
  process.env.TAILSCALE_SOCKET = SOCK;
  clearCache();
});
