import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-test-'));
const { readText, rowsToTx, cleanDescription, parseDateFlex } = await import('../server/finans/importer.js');
const { domainFor, heuristic, validDomain } = await import('../server/finans/enrich.js');
const { regexFinn } = await import('../server/finans/finn.js');

test('DNB-tekst: MM/DD/YY, tusenskille komma og rensing', () => {
  const raw = '10/14/26\tVisa  100021  Ruterappen\t10/15/26\t238.00\t\n10/14/26\tLønn  363129861 Statens Lånekasse\t10/14/26\t\t11,616.00\n10/12/26\tVisa 100021 Vipps:pal wengard\t10/13/26\t9,090.00\t';
  const { rows } = rowsToTx(readText(raw));
  assert.deepEqual(rows.map((r) => [r.date, r.description, r.amount]), [
    ['2026-10-14', 'Ruterappen', -23800], ['2026-10-14', 'Statens Lånekasse', 1161600], ['2026-10-12', 'Vipps · Pal Wengard', -909000]]);
});

test('Rensing av bankbeskrivelser', () => {
  assert.equal(cleanDescription('Varekjøp Akademika AS Kanalveien 5 Bergen Dato 12.10 kl. 12.08'), 'Akademika AS');
  assert.equal(parseDateFlex('14.10.26'), '2026-10-14');
  assert.equal(parseDateFlex('2026-01-02'), '2026-01-02');
});

test('Logo-domener og heuristisk sammendrag', () => {
  assert.equal(domainFor('Bilema Lørenskog'), 'biltema.no');
  assert.equal(domainFor('Merkur Bar'), null);
  assert.equal(validDomain('../etc'), null);
  assert.equal(heuristic({ merchant: 'X', lines: [{ description: 'Melk' }, { description: 'Brød' }] }).short, 'Melk, Brød');
});

test('Finn-e-post med regex-reserve', () => {
  const d = regexFinn('Du har solgt iPhone 13 til kjøper Ola H. Totalt 3 200,00 kr. Trygg betaling. Fiks ferdig: levert. Utbetalt.');
  assert.equal(d.role, 'sold');
  assert.equal(d.item, 'iPhone 13');
  assert.equal(d.amount, 3200);
});
