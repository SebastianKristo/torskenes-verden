// NRK-nedlaster i Media: server/nrkdl.js snakker med nrk-dl (bak egen norsk VPN) og holder tokenet på serveren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p88-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-88n';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;

const { updateConfig, cfg } = await import('../server/settings.js');
const { OWNER } = await import('../server/db.js');
const nrk = await import('../server/nrkdl.js');
const { INTEGRATIONS } = await import('../server/integrations-api.js');

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

test('ikke satt opp: tydelig melding, ingen kall', async () => {
  let n = 0;
  nrk._setFetchNrk(async () => { n++; return json({}); });
  assert.equal(nrk.nrkConf().on, false);
  await assert.rejects(nrk.nrkKall('/api/status'), /ikke satt opp/);
  assert.equal((await nrk.testNrk()).ok, false);
  assert.equal(n, 0);
});

test('token sendes som Bearer, aldri i svaret; feil fra nrk-dl sendes videre på norsk', async () => {
  updateConfig({ nrk_url: 'http://nrk.p88:8020/', nrk_token: 'hemmelig-token' }, OWNER);
  assert.equal(cfg('nrk_token'), 'hemmelig-token');
  const kall = [];
  nrk._setFetchNrk(async (url, init = {}) => {
    kall.push({ url, auth: init.headers?.Authorization });
    const P = new URL(url).pathname;
    if (P === '/api/status') return json({ vpn: { ok: true, land: 'NO', ip: '185.1.2.3' }, ytdlp: '2026.10.26' });
    if (P === '/api/jobber' && init.method === 'POST') return json({ feil: 'Lenken er allerede i køen' }, 409);
    return json({});
  });
  const t = await nrk.testNrk();
  assert.equal(t.ok, true);
  assert.match(t.message, /VPN i NO/);
  assert.doesNotMatch(JSON.stringify(t), /hemmelig/);
  assert.equal(kall[0].url, 'http://nrk.p88:8020/api/status');
  assert.equal(kall[0].auth, 'Bearer hemmelig-token');
  await assert.rejects(nrk.nrkKall('/api/jobber', { method: 'POST', json: { url: 'https://tv.nrk.no/serie/x' } }), (e) => e.status === 409 && /allerede i køen/.test(e.message));
});

test('test feiler når VPN-en ikke er norsk', async () => {
  nrk._setFetchNrk(async () => json({ vpn: { ok: false, land: 'SE', feil: 'VPN-en går ut i SE, ikke NO.' } }));
  const t = await nrk.testNrk();
  assert.equal(t.ok, false);
  assert.match(t.message, /ikke norsk/);
});

test('401 fra nrk-dl blir en forklaring om tokenet, ikke «utlogget»', async () => {
  nrk._setFetchNrk(async () => json({ feil: 'Mangler eller feil token' }, 401));
  await assert.rejects(nrk.nrkKall('/api/status'), (e) => e.status === 502 && /avviste tokenet/.test(e.message));
});

test('integrasjonen finnes i Media med adresse og token (hemmelig)', () => {
  const x = INTEGRATIONS.find((i) => i.id === 'nrk');
  assert.ok(x);
  assert.equal(x.group, 'Media');
  assert.deepEqual(x.fields.map((f) => [f.key, f.type]), [['nrk_url', 'url'], ['nrk_token', 'secret']]);
});

test('web: NRK-fanen i Media med egen adresse, uten token i nettleseren', () => {
  const m43 = readFileSync(new URL('../public/js/media43.js', import.meta.url), 'utf8');
  const m70 = readFileSync(new URL('../public/js/media70.js', import.meta.url), 'utf8');
  const nw = readFileSync(new URL('../public/js/media-nrk.js', import.meta.url), 'utf8');
  assert.match(m70, /\['nrk', 'NRK'\]/);
  assert.match(m43, /nrk: 'nrk'/);
  assert.match(m43, /mountNrk\(nrkHost\)/);
  assert.match(nw, /\/api\/media\/nrk/);
  assert.doesNotMatch(nw, /nrk_token|Authorization/);
});
