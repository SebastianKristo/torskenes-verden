// Logoer: butikk- og tjenestenavn → domene, også med vanlige skrivefeil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-dom-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { domainFor } = await import('../server/finans/enrich.js');

test('kjente tjenester og butikker får domene', () => {
  const cases = { Tv2: 'tv2.no', Squarespace: 'squarespace.com', Claude: 'claude.ai', 'Rema 1000 Majorstuen': 'rema.no', 'Tibber AS': 'tibber.com',
    'Google One': 'google.com', 'Microsoft 365': 'microsoft.com', Storytel: 'storytel.com', Gjensidige: 'gjensidige.no', 'Max Burger Oslo': 'max.se', 'HBO Max': 'max.com' };
  for (const [n, d] of Object.entries(cases)) assert.equal(domainFor(n), d, n);
});

test('ett tegn feil i et navn på minst fem bokstaver gir fortsatt treff, men vanlige ord gjør ikke det', () => {
  assert.equal(domainFor('Claue'), 'claude.ai');
  assert.equal(domainFor('Netflx'), 'netflix.com');
  assert.equal(domainFor('Husleie'), null);
  assert.equal(domainFor('Kaffe og kake'), null);
  assert.equal(domainFor('Flyttebyrå Hansen'), null);
});
