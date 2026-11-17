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

test('Økonomi mobil-web: ingen JS-filer med promptnummer i navnet', () => {
  const nummer = filer.filter((f) => /^mobile-(p\d+[a-z]?|paper\d+)\.js$/.test(f) || /\d{2}[a-z]?\.js$/.test(f));
  assert.deepEqual(nummer, []);
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

// Runde 4: mobile-jul-og-totrinn.js er delt etter funksjon. Julemodus (mobile-jul.js) og totrinnsbekreftelse (mobile-totrinn.js)
// har egne filer; mobile-glimt-tillegg.js tar hendelsene og sender dem videre. De nye filene importerer ikke tilbake til
// mobile-glimt-tillegg.js, så delingen lager ingen ny syklisk import.
test('Økonomi mobil-web: julemodus og totrinnsbekreftelse har egne filer uten import tilbake', () => {
  const les = (f) => readFileSync(join(JS, f), 'utf8');
  assert.ok(!existsSync(join(JS, 'mobile-jul-og-totrinn.js')));
  const tillegg = les('mobile-glimt-tillegg.js');
  assert.match(tillegg, /from '\.\/mobile-totrinn\.js'/);
  assert.match(tillegg, /from '\.\/mobile-jul\.js'/);
  assert.doesNotMatch(tillegg, /\bconst TF = |\bfunction julSet\b/);
  for (const f of ['mobile-jul.js', 'mobile-totrinn.js', 'mobile-lagring.js']) assert.doesNotMatch(les(f), /mobile-glimt-tillegg\.js'/, f);
  assert.match(les('mobile-totrinn.js'), /export function tfaGroup\(G\)/);
  assert.match(les('mobile-jul.js'), /export function julOn\(d = new Date\(\)\)/);
  assert.match(les('mobile.js'), /import\('\.\/mobile-glimt-tillegg\.js'\)/);
});
