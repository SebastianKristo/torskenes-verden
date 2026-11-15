// Eksemplene i shared/schemas/eksempler (laget av scripts/kontrakt-eksempler.mjs fra serveren med eksempeldata) følger skjemaene.
// Appene dekoder de samme eksemplene med sine DTO-er (iOS: apps/ios/HomelabTests/ContractDecodingTests.swift), så et skjema som
// endres uten nye eksempler, eller et eksempel som ikke lenger stemmer, oppdages her og ikke først i appen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validate, SCHEMA_DIR } from './lib/json-schema.mjs';

const DIR = join(SCHEMA_DIR, 'eksempler');
const INDEX = JSON.parse(readFileSync(join(SCHEMA_DIR, 'endpoints.json'), 'utf8'));
const nameOf = (schema) => schema.split('/').pop().replace('.schema.json', '.json');

test('hvert endepunkt i endpoints.json og /api/dates/parse har et eksempel', () => {
  const want = [...INDEX.endpoints.map((e) => nameOf(e.schema)), 'dates-parse.json', 'error.json'];
  for (const f of want) assert.ok(existsSync(join(DIR, f)), `mangler shared/schemas/eksempler/${f} (kjør node scripts/kontrakt-eksempler.mjs)`);
});

for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json'))) {
  test(`eksempelet ${f} følger skjemaet`, () => {
    const schema = f === 'error.json' ? 'common/error.schema.json' : `api/${f.replace('.json', '.schema.json')}`;
    const body = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    assert.deepEqual(validate(schema, body), [], `${f} avviker fra ${schema}`);
  });
}

test('eksemplene har ingen ekte tokens', () => {
  for (const f of readdirSync(DIR)) {
    const raw = readFileSync(join(DIR, f), 'utf8');
    assert.doesNotMatch(raw, /fh_pat_[A-Za-z0-9_-]{20,}/, f);
    assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{10,}\./, f);
  }
});
