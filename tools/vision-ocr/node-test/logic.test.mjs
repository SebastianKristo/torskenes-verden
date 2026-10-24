// Kjør: node --test tools/vision-ocr/node-test/
// Sjekker den porterte algoritmen mot de samme fixturene som Swift-testene (Tests/Fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as L from './logic.mjs';

const fx = (name) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'Tests', 'Fixtures', name), 'utf8'));
const toLine = (l) => ({ text: l.text, confidence: l.confidence ?? 1, bbox: L.bboxFromArray(l.bbox) });
const near = (a, b, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${msg}: ${a} != ${b}`)); };

test('rows: gruppering på overlappende y-intervall', () => {
  for (const c of fx('rows-cases.json')) assert.deepEqual(L.groupRows(c.lines.map(toLine)), c.rows, c.name);
});

test('bbox: Vision (origo nede) → origo øverst, klemt til 0–1', () => {
  const f = fx('bbox-cases.json');
  for (const c of f.vision_to_top_left) near(L.bboxToArray(L.visionToTopLeft(...c.vision)), c.top_left, `vision ${c.vision}`);
  for (const c of f.band_to_global) {
    const g = L.bandToGlobal(L.bboxFromArray(c.bbox), { top: c.band[0], height: c.band[1] }, c.image_height);
    near(L.bboxToArray(g), c.global, `band ${c.band}`);
  }
});

test('bånd: bare høye bilder deles, 10 % overlapp, siste bånd mot bunnen', () => {
  for (const c of fx('bbox-cases.json').band_ranges) {
    assert.deepEqual(L.bandRanges(c.width, c.height).map((b) => [b.top, b.height]), c.bands, `${c.width}x${c.height}`);
  }
});

test('bånd-sammenslåing og deduplisering i overlappen', () => {
  for (const c of fx('merge-cases.json')) {
    const bands = c.bands.map(([top, height]) => ({ top, height }));
    const perBand = c.per_band.map((lines, i) => lines.map(toLine).map((l) => ({ ...l, bbox: L.bandToGlobal(l.bbox, bands[i], c.image_height) })));
    const merged = L.sortReadingOrder(L.mergeBands(perBand, bands, c.image_height));
    assert.deepEqual(merged.map((l) => ({ text: l.text, confidence: l.confidence })), c.expected, c.name);
    assert.deepEqual(L.groupRows(merged), c.rows, `${c.name} (rows)`);
  }
});

test('tekstlikhet og levenshtein', () => {
  assert.equal(L.levenshtein([...'kitten'], [...'sitting']), 3);
  assert.ok(L.textsSimilar('KAFFE 89,90', 'kaffe 89.90'));
  assert.ok(!L.textsSimilar('MELK', 'BRØD'));
  assert.ok(L.textsSimilar('', ''));
  assert.ok(!L.textsSimilar('A', ''));
});

test('tomt bilde og ett bånd', () => {
  assert.deepEqual(L.bandRanges(0, 0), []);
  assert.deepEqual(L.mergeBands([[{ text: 'A', confidence: 1, bbox: { x: 0, y: 0, w: 1, h: 0.1 } }]], [{ top: 0, height: 10 }], 10).map((l) => l.text), ['A']);
  assert.deepEqual(L.groupRows([]), []);
});

test('resultatet følger shared/schemas/receipt-ocr.schema.json', async (t) => {
  let schema;
  try { schema = await import('../../../server/receipts48/schema.js'); } catch { t.skip('server/receipts48/schema.js finnes ikke'); return; }
  for (const c of fx('merge-cases.json')) {
    const bands = c.bands.map(([top, height]) => ({ top, height }));
    const perBand = c.per_band.map((lines, i) => lines.map(toLine).map((l) => ({ ...l, bbox: L.bandToGlobal(l.bbox, bands[i], c.image_height) })));
    const r = L.buildResult(L.mergeBands(perBand, bands, c.image_height), 1000, c.image_height, 812);
    assert.deepEqual(schema.checkOcr48(r), [], c.name);
    assert.deepEqual(r.rows, c.rows);
    assert.equal(r.full_text, c.rows.join('\n'));
  }
});
