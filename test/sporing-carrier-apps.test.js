// Q22: app-verdiene for Posten, Bring og PostNord ligger i server/sporing/carrier-apps.js, med dagens verdier som standard og
// overstyring fra miljøet (SPORING_<TRANSPORTØR>_<FELT>).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-carrier-apps-'));
process.env.NODE_ENV = 'test';
const { carrierApp, CARRIER_APPS } = await import('../server/sporing/carrier-apps.js');

test('uten variabler gjelder dagens verdier', () => {
  for (const c of ['postnord', 'posten', 'bring']) assert.deepEqual(carrierApp(c, {}), { ...CARRIER_APPS[c] });
  assert.deepEqual(Object.keys(carrierApp('postnord', {})).sort(), ['apiKey', 'clientId']);
  assert.deepEqual(Object.keys(carrierApp('posten', {})).sort(), ['clientId', 'secret']);
  assert.ok(carrierApp('bring', {}).clientId.length > 10);
});

test('variablene overstyrer én verdi om gangen; tom verdi = standard', () => {
  const env = { SPORING_POSTEN_SECRET: ' ny-hemmelighet ', SPORING_POSTNORD_API_KEY: 'ny-nokkel', SPORING_BRING_CLIENT_ID: '' };
  assert.equal(carrierApp('posten', env).secret, 'ny-hemmelighet');
  assert.equal(carrierApp('posten', env).clientId, carrierApp('posten', {}).clientId);
  assert.equal(carrierApp('postnord', env).apiKey, 'ny-nokkel');
  assert.equal(carrierApp('bring', env).clientId, carrierApp('bring', {}).clientId);
});

test('ukjent transportør gir feil', () => {
  assert.throws(() => carrierApp('dhl', {}), /Ukjent transportør/);
});

test('kontoinnloggingen bruker verdiene fra carrier-apps.js', async () => {
  const { PN46 } = await import('../server/sporing/accounts.js');
  assert.equal(PN46.clientId, CARRIER_APPS.postnord.clientId);
  assert.equal(PN46.apiKey, CARRIER_APPS.postnord.apiKey);
  assert.equal(PN46.redirect, 'com.postnord.app://redirect');
});
