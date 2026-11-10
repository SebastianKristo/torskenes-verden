// Prompt 83: å trykke på en skuff i skapet (eller gå tilbake til lista i samme skap) er ikke en ny side –
// rulleposisjonen beholdes. Bytte til en del, oppsett eller et annet skap ruller fortsatt til toppen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/skjold76.js', import.meta.url), 'utf8');

test('onHash ruller bare til toppen når det ikke er skuff/liste i samme skap', () => {
  const i = src.indexOf('async function onHash()');
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf('\n}\n', i));
  assert.match(body, /const sameCab = \(r\.v === 'drawer' \|\| r\.v === 'list'\) && \(prev\.v === 'drawer' \|\| prev\.v === 'list'\)/);
  assert.match(body, /if \(!sameCab\) window\.scrollTo\?\.\(\{ top: 0 \}\)/);
  assert.doesNotMatch(body, /\n\s*window\.scrollTo\?\.\(\{ top: 0 \}\);/, 'ingen ubetinget scroll til toppen');
});
