// Tailscale (prompt 57): normalisering fra begge kildene (LocalAPI-status og Tailscale-API-et) til samme modell, klassifisering av
// type, valg av kilde og LocalAPI over en ekte unix-socket (en liten falsk tailscaled i testen). Uten nett og uten hemmeligheter:
// fixturene i test/fixtures/tailscale/ er anonymiserte svar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-ts-kilde-'));
process.env.DATA_DIR = DATA;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-ts57';
delete process.env.MOCK_DATA;
const SOCK = join(DATA, 'tailscaled.sock');
process.env.TAILSCALE_SOCKET = join(DATA, 'finnes-ikke.sock');
test.after(() => { try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

const K = await import('../server/tailscale/kilde.js');
const { updateConfig } = await import('../server/settings.js');
const { clearCache } = await import('../server/cache.js');
const FX = (f) => JSON.parse(readFileSync(new URL(`./fixtures/tailscale/${f}`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-27T10:00:00Z');

test('classify: type ut fra OS og vertsnavn', () => {
  const cases = [
    ['linux', 'unraid', 'server'], ['linux', 'proxmox', 'server'], ['linux', 'truenas-scale', 'server'], ['windows', 'stue-pc', 'desktop'],
    ['macOS', 'Sebastians-MacBook-Pro', 'laptop'], ['macOS', 'mac-mini', 'desktop'], ['iOS', 'localhost', 'mobile'], ['iOS', 'Ingrids-iPad', 'tablet'],
    ['iPadOS', 'ipad', 'tablet'], ['android', 'pixel-8', 'mobile'], ['android', 'galaxy-tab-s9', 'tablet'], ['linux', 'homeassistant', 'iot'],
    ['linux', 'esp32-kjokken', 'iot'], ['linux', 'shelly-plug', 'iot'], ['linux', 'pikvm', 'iot'], ['linux', 'despina', 'server'], ['', 'ukjent', 'desktop'],
  ];
  for (const [os, host, kind] of cases) assert.equal(K.classify(os, host), kind, `${os} / ${host}`);
  for (const k of Object.keys(K.KIND_ICON)) assert.ok(K.KIND_LABEL[k], k);
});

test('LocalAPI-status → normalisert modell (self først, tunnel, IP-er, utløp, bruker)', () => {
  const n = K.normaliserLocalApi(FX('localapi-status.json'), NOW);
  assert.equal(n.tailnet, 'eksempel@github');
  assert.equal(n.selfVersion, '1.76.6');
  assert.equal(n.devices.length, 7);
  const self = n.devices[0];
  assert.equal(self.self, true);
  assert.equal(self.name, 'homelab');
  assert.equal(self.clientVersion, '1.76.6');
  assert.equal(self.online, true);
  const by = Object.fromEntries(n.devices.map((d) => [d.name, d]));
  const u = by.unraid;
  assert.deepEqual([u.id, u.ip, u.ipv6, u.dns, u.kind, u.tunnel, u.rx, u.tx, u.user], ['nUNRAID1CNTRL', '100.64.0.2', 'fd7a:115c:a1e0::2', 'unraid.tail1234.ts.net', 'server', 'direkte', 1200000, 340000, 'sebastian@example.com']);
  assert.equal(u.keyExpiry, '2026-12-01T10:00:00.000Z');
  assert.equal(u.expiresInDays, 4);
  assert.equal(u.latencyMs, null, 'latens er ukjent til den er pinget');
  assert.equal(u.lastSeen, null, 'online har ikke «sist sett»');
  assert.equal(by.hytta.online, false);
  assert.equal(by.hytta.tunnel, null);
  assert.equal(by.hytta.lastSeen, '2026-11-24T18:30:00.000Z');
  assert.equal(by['iphone-15'].kind, 'mobile');
  assert.equal(by['iphone-15'].tunnel, 'derp:ams', 'uten CurAddr går den via DERP');
  assert.equal(by['ingrids-ipad'].kind, 'tablet');
  assert.equal(by['sebastians-macbook-pro'].exitNode, true);
  assert.equal(by.homeassistant.kind, 'iot');
  assert.equal(by.homeassistant.keyExpiry, null);
  assert.equal(by.homeassistant.expiresInDays, null);
  // Samme felt i alle enheter (kontrakten).
  const KEYS = ['id', 'name', 'host', 'dns', 'ip', 'ipv6', 'os', 'kind', 'user', 'tags', 'online', 'lastSeen', 'self', 'exitNode', 'tunnel', 'latencyMs', 'rx', 'tx', 'clientVersion', 'updateAvailable', 'keyExpiry', 'expiresInDays'];
  for (const d of n.devices) assert.deepEqual(Object.keys(d).sort(), KEYS.slice().sort(), d.name);
});

test('Tailscale-API → samme modell (online fra connectedToControl eller sist sett, utløp av, versjon uten bygg)', () => {
  const n = K.normaliserApi(FX('api-devices.json'), NOW);
  assert.equal(n.devices.length, 3);
  const [u, h, p] = n.devices;
  assert.deepEqual([u.id, u.name, u.ip, u.kind, u.online, u.clientVersion, u.updateAvailable, u.expiresInDays, u.tunnel], ['nUNRAID1CNTRL', 'unraid', '100.64.0.2', 'server', true, '1.74.1', true, 4, null]);
  assert.equal(h.online, false);
  assert.equal(h.keyExpiry, null, 'keyExpiryDisabled gir ingen utløpsdato');
  assert.equal(h.lastSeen, '2026-11-24T18:30:00.000Z');
  assert.equal(h.ipv6, null);
  assert.equal(p.online, true, 'uten connectedToControl: sett for 2 min siden = online');
  assert.equal(p.kind, 'mobile');
  assert.equal(p.user, 'ingrid@example.com');
  // LocalAPI og API gir samme id for samme maskin.
  const l = K.normaliserLocalApi(FX('localapi-status.json'), NOW).devices.find((d) => d.name === 'unraid');
  assert.equal(l.id, u.id);
  assert.deepEqual(Object.keys(l).sort(), Object.keys(u).sort());
});

test('sortDevices: online først, så navn', () => {
  const s = K.sortDevices(K.normaliserLocalApi(FX('localapi-status.json'), NOW).devices).map((d) => [d.online, d.name]);
  assert.deepEqual(s.map((x) => x[0]), [true, true, true, true, true, false, false]);
  assert.deepEqual(s.slice(0, 5).map((x) => x[1]), ['homeassistant', 'homelab', 'iphone-15', 'sebastians-macbook-pro', 'unraid']);
});

test('valg av kilde: ingen socket og ingen nøkkel gir tydelig norsk melding', async () => {
  clearCache();
  assert.equal(K.chooseSource(), null);
  await assert.rejects(K.readSource(NOW), (e) => e.message === K.INGEN_KILDE && e.code === 'TAILSCALE_NOT_CONFIGURED');
  const t = await K.testTailscale();
  assert.equal(t.ok, false);
  assert.match(t.message, /Fant ikke tailscaled\.sock – mount \/var\/run\/tailscale eller bruk API-nøkkel/);
});

test('Tailscale-API: OAuth-klient (devices:core:read), nøkkelen aldri i feilmeldingen', async () => {
  const calls = [];
  K._setTailscaleFetch(async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method ?? 'GET', auth: opts.headers?.authorization ?? null, body: String(opts.body ?? '') });
    if (String(url).endsWith('/api/v2/oauth/token')) return new Response(JSON.stringify({ access_token: 'tok-eksempel', expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify(FX('api-devices.json')), { status: 200 });
  });
  updateConfig({ ts_oauth_id: 'kEKSEMPEL', ts_oauth_secret: 'tskey-client-hemmelig-eksempel' });
  assert.equal(K.chooseSource(), 'api');
  const r = await K.readSource(NOW);
  assert.equal(r.source, 'api');
  assert.equal(r.devices.length, 3);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].body, /grant_type=client_credentials/);
  assert.match(calls[0].body, /scope=devices%3Acore%3Aread/);
  assert.equal(calls[1].auth, 'Bearer tok-eksempel');
  assert.match(calls[1].url, /^https:\/\/api\.tailscale\.com\/api\/v2\/tailnet\/-\/devices\?fields=all$/);
  assert.ok(calls.every((c) => c.method === 'GET' || c.url.endsWith('/oauth/token')), 'ingen skrivende kall mot Tailscale');
  // Avvist nøkkel: norsk melding uten nøkkelen.
  K._setTailscaleFetch(async () => new Response('{}', { status: 401 }));
  const t = await K.testTailscale();
  assert.equal(t.ok, false);
  assert.doesNotMatch(t.message, /hemmelig|tskey/);
  // Ping krever LocalAPI.
  const p = await K.pingIp('100.64.0.2');
  assert.equal(p.ok, false);
  assert.equal(p.code, 'PING_NEEDS_LOCALAPI');
  updateConfig({ ts_oauth_id: null, ts_oauth_secret: null });
  K._setTailscaleFetch(null);
});

test('LocalAPI over unix-socket: status og disco-ping, Host-header, og bare de tillatte kallene', async () => {
  const seen = [];
  const srv = createServer((req, res) => {
    seen.push([req.method, req.url, req.headers.host]);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/localapi/v0/status') return res.end(JSON.stringify(FX('localapi-status.json')));
    if (req.method === 'POST' && req.url.startsWith('/localapi/v0/ping')) {
      const ip = new URL(req.url, 'http://x').searchParams.get('ip');
      return res.end(JSON.stringify(ip === '100.64.0.3' ? { Err: 'timeout' } : { IP: ip, LatencySeconds: 0.0021, Endpoint: '192.168.1.40:41641' }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => srv.listen(SOCK, r));
  process.env.TAILSCALE_SOCKET = SOCK;
  try {
    assert.equal(K.socketFinnes(), true);
    assert.equal(K.chooseSource(), 'localapi', 'socketen vinner i auto');
    const r = await K.readSource(NOW);
    assert.equal(r.source, 'localapi');
    assert.equal(r.devices.length, 7);
    assert.equal(seen[0][2], 'local-tailscaled.sock');
    const p = await K.pingIp('100.64.0.2');
    assert.deepEqual(p, { ok: true, latencyMs: 2.1, tunnel: 'direkte' });
    const q = await K.pingIp('100.64.0.3');
    assert.equal(q.ok, false);
    assert.equal(q.error, 'Ingen svar');
    await assert.rejects(K.localApi('/localapi/v0/logout', { method: 'POST' }), /ikke tillatt/);
    await assert.rejects(K.localApi('/localapi/v0/prefs', { method: 'PATCH' }), /ikke tillatt/);
    assert.ok(!seen.some(([m, u]) => /logout|prefs/.test(u) || !['GET', 'POST'].includes(m)), 'de avviste kallene nådde aldri tailscaled');
    // Modus «api» uten nøkkel bruker ikke socketen.
    updateConfig({ ts_mode: 'api' });
    assert.equal(K.chooseSource(), null);
    updateConfig({ ts_mode: null });
  } finally {
    await new Promise((r) => srv.close(r));
    process.env.TAILSCALE_SOCKET = join(DATA, 'finnes-ikke.sock');
  }
});
