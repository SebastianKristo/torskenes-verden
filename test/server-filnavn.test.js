// Opprydding (STATUS «Serverfiler med nummer»): ingen JavaScript-fil i server/ har promptnummer i navnet, og 17. mai ligger i
// Glimt-domenet (server/glimt/mai17.js) ved siden av julemodusen (server/glimt/jul.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'server');
function jsFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('filnavn: ingen JavaScript-fil i server/ har nummer i navnet', () => {
  const numbered = jsFiles(SERVER).map((p) => relative(ROOT, p)).filter((p) => /\d/.test(p.replace(/mai17/g, ''))); // «mai17» er datoen, ikke et promptnummer (som public/js/mai17.js)
  assert.deepEqual(numbered, []);
});

test('17. mai ligger i Glimt-domenet og rutene svarer som før', async () => {
  assert.ok(existsSync(join(SERVER, 'glimt/mai17.js')));
  const m = await import('../server/glimt/mai17.js');
  for (const k of ['mai17Api', 'mai17Active', 'cleanMai17', 'MAI17_DEFAULTS', 'mai17Day41']) assert.ok(m[k], k);
});
