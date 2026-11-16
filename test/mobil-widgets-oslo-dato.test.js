// Q20: «i morgen» i /mobile/widgets regnes fra Oslo-datoen, ikke fra serverens tidssone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('server/mobile.js bruker ikke toLocaleDateString uten Oslo-sone', () => {
  const s = readFileSync(new URL('../server/mobile.js', import.meta.url), 'utf8');
  for (const m of s.matchAll(/toLocaleDateString\(([^)]*)\)/g)) assert.match(m[1], /Europe\/Oslo/, `uten Oslo-sone: ${m[0]}`);
  assert.match(s, /const tomorrow = new Date\(Date\.parse\(`\$\{osloDate\(\)\}T12:00:00Z`\) \+ 864e5\)\.toISOString\(\)\.slice\(0, 10\)/);
});
