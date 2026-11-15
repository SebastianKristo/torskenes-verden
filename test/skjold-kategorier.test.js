// Skjold Lab: én standardliste over kategorier (Fase 6). AI-standarden, synonymene og demodataene bruker den samme listen,
// og brukerens egne kategorier vinner fortsatt over standarden (ingen data endres).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KATEGORIER, SYNONYMER } from '../server/skjold/kategorier.js';
import { DEFAULT_CATEGORIES77, chooseCategory77, matchCategory77 } from '../server/skjold/decode.js';
import { DEMO76 } from '../server/skjold/store.js';

test('AI-standarden er den kanoniske listen', () => {
  assert.equal(DEFAULT_CATEGORIES77, KATEGORIER);
  assert.equal(new Set(KATEGORIER).size, KATEGORIER.length);
  assert.equal(SYNONYMER.length, KATEGORIER.length, 'én synonymgruppe per kategori');
});

test('hver standardkategori finnes i sin egen synonymgruppe', () => {
  KATEGORIER.forEach((k, i) => assert.equal(matchCategory77(k, [KATEGORIER[i]]), k));
});

test('demodataene bruker bare kategorier fra standardlisten', () => {
  for (const [name, category] of DEMO76) assert.ok(KATEGORIER.includes(category), `${name}: ${category}`);
});

test('brukerens egne kategorier vinner fortsatt (ingen omdøping av eksisterende data)', () => {
  assert.deepEqual(chooseCategory77('Dioder og LED', 'Dioder og LED', ['LED']), { category: 'LED', categoryNew: false });
  assert.deepEqual(chooseCategory77('Kabler', null, ['Kabel']), { category: 'Kabel', categoryNew: false });
  assert.deepEqual(chooseCategory77('Kabler', null, []), { category: 'Kabler', categoryNew: true });
});
