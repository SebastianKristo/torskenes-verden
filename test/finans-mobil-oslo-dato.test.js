// Q20: datoer i Økonomi på mobil-web vises i Oslo-tid. toLocaleDateString uten timeZone bruker sonen til nettleseren, og
// rundt midnatt (eller på reise) blir «lagt til» og datoen på Glimt-briefen feil dag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILER = ['mobile-totrinn.js', 'mobile-glimt-tillegg.js', 'mobile-jul.js', 'mobile-lagring.js'];

test('Økonomi mobil: toLocaleDateString har alltid timeZone: Europe/Oslo', () => {
  for (const f of FILER) {
    const src = readFileSync(new URL(`../public/finans/js/${f}`, import.meta.url), 'utf8');
    const kall = src.match(/toLocaleDateString\([^)]*\)/g) ?? [];
    for (const k of kall) assert.match(k, /timeZone:\s*'Europe\/Oslo'/, `${f}: ${k}`);
  }
});
