// CLAUDE.md: «Ikke omgå 403 eller bot-blokkering med falske nettleser-headere.» Serveren sender bare User-Agent-er som sier at
// det er Homelab, aldri en ekte nettlesers (Safari/Chrome/Firefox) eller Origin/Referer for andres nettsteder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'server');
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('serveren sender ingen falske nettleser-User-Agent-er', () => {
  const bad = files(ROOT).filter((f) => /AppleWebKit\/|Safari\/\d|Chrome\/\d|Firefox\/\d|Gecko\/\d/.test(strip(readFileSync(f, 'utf8'))));
  assert.deepEqual(bad.map((f) => f.slice(ROOT.length + 1)), []);
});
