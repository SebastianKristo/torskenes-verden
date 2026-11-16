// Økonomi på mobil-web (public/finans/js): filene har beskrivende navn, ikke promptnummer (CLAUDE.md, STATUS «Struktur: filnavn»),
// og alle lenker mellom dem (importer, service workerens SHELL) peker på filer som finnes. En omdøping som glemmer én
// import, gir en tom side på telefonen, så denne testen fanger det før nettleseren gjør det.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'public/finans/js');
const filer = readdirSync(JS).filter((f) => f.endsWith('.js'));

// Filene som ennå ikke har fått nytt navn. Lista skal bare krympe; tom når alle familiene er gjennomgått.
const GJENSTÅR = ['mobile-p17.js', 'mobile-p20.js', 'mobile-p21.js', 'mobile-p22.js', 'mobile-p23.js', 'mobile-p24.js', 'mobile-p26.js', 'mobile-p27.js',
  'mobile-p29.js', 'mobile-p30.js', 'mobile-p37.js', 'mobile-p37b.js', 'mobile-p39.js', 'mobile-p41.js', 'mobile-p41b.js', 'mobile-p43.js', 'mobile-p46.js'];

test('Økonomi mobil-web: ingen JS-filer med promptnummer i navnet', () => {
  const nummer = filer.filter((f) => /^mobile-(p\d+[a-z]?|paper\d+)\.js$/.test(f) || /\d{2}[a-z]?\.js$/.test(f));
  assert.deepEqual(nummer.sort(), [...GJENSTÅR].sort());
});

test('Økonomi mobil-web: alle relative importer peker på filer som finnes', () => {
  const mangler = [];
  for (const f of filer) {
    const src = readFileSync(join(JS, f), 'utf8');
    for (const [, rel] of src.matchAll(/(?:from\s+|import\(\s*)'(\.\/[^']+\.js)'/g)) {
      if (!existsSync(join(JS, rel))) mangler.push(`${f} → ${rel}`);
    }
  }
  assert.deepEqual(mangler, []);
});

test('Økonomi mobil-web: alle filene i service workerens SHELL finnes', () => {
  const sw = readFileSync(join(ROOT, 'public/finans/sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const sti = (u) => u.startsWith('/assets/finans/') ? join(ROOT, 'public/finans', u.slice('/assets/finans/'.length)) : join(ROOT, 'public', u.slice('/assets/'.length));
  assert.deepEqual(shell.filter((u) => !existsSync(sti(u))), []);
});

test('Økonomi mobil-web: alle mobilmodulene som lastes, står i SHELL (virker uten nett)', () => {
  const sw = readFileSync(join(ROOT, 'public/finans/sw.js'), 'utf8');
  const mob = filer.filter((f) => f.startsWith('mobile-'));
  assert.deepEqual(mob.filter((f) => !sw.includes(`'/assets/finans/js/${f}'`)), []);
});
