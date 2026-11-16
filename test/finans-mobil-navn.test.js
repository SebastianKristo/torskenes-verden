// O1 og O6 (STATUS.md, Q1): Økonomi på mobil-web kalte startsiden «Hjem» og Gjøremål «Huskeliste». Startsiden heter
// Oversikt (modullisten, shared/schemas/moduler.json), og gjøremålslistene heter Gjøremål. «Hjem» brukes fortsatt om et sted
// (sonen Hjem, «Vel fremme» hjem, lista Hjem i Gjøremål) og om telefonens Hjem-skjerm, men aldri som navnet på en side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'public/finans/js');
const moduler = JSON.parse(readFileSync(join(ROOT, 'shared/schemas/moduler.json'), 'utf8'));
const liste = Array.isArray(moduler) ? moduler : moduler.moduler ?? moduler.modules;
const navn = (id) => liste.find((m) => m.id === id)?.navn;

// Linjer med kode (uten rene kommentarlinjer og uten // … på slutten).
const kode = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n').map((l, i) => [i + 1, l.replace(/\s\/\/ .*$/, '').replace(/\/\*.*?\*\//g, '')]).filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l));

// «Hjem» som sted eller som telefonens Hjem-skjerm (ikke en side i appen).
const STED = /Hjem-skjerm|Hjemme|Hjemlys|name: 'Hjem', color|home: \['Hjem'|\['home', 'Hjem'\]|: 'Hjem', kind|title: 'Hjem', body: 'Ingrid forlot Hjem'|B\.title \?\? 'Hjem'|R\?\.home\?\.name \?\? 'Hjem'|<small>Hjem<\/small>|'Annet sted' : 'Hjem'\)|`Hjem om \$\{/;

test('modullisten: startsiden heter Oversikt og gjøremålene Gjøremål', () => {
  assert.equal(navn('oversikt'), 'Oversikt');
  assert.equal(navn('gjoremal'), 'Gjøremål');
});

test('Økonomi mobil-web: «Hjem» er aldri navnet på en side (O1)', () => {
  const funn = [];
  for (const f of readdirSync(JS).filter((x) => /^mobile.*\.js$/.test(x))) {
    for (const [n, l] of kode(readFileSync(join(JS, f), 'utf8'))) {
      if (!/\bHjem(?![a-zæøå])/.test(l)) continue;
      const rest = l.replace(new RegExp(STED.source, 'g'), '');
      if (/\bHjem(?![a-zæøå])/.test(rest)) funn.push(`${f}:${n}: ${l.trim().slice(0, 140)}`);
    }
  }
  assert.deepEqual(funn, []);
});

test('Økonomi mobil-web: «Huskeliste» står ikke i brukertekst (O6)', () => {
  const funn = [];
  for (const f of readdirSync(JS).filter((x) => /^mobile.*\.js$/.test(x))) {
    for (const [n, l] of kode(readFileSync(join(JS, f), 'utf8'))) {
      // Søkeord som gjenkjenner det gamle ordet i det brukeren skriver, er lov: de står med liten forbokstav (/huskeliste|…/i).
      if (/Huskeliste/.test(l)) funn.push(`${f}:${n}: ${l.trim().slice(0, 140)}`);
    }
  }
  assert.deepEqual(funn, []);
});

test('Økonomi mobil-web: fanelinja, Mer og Oversikt-knappen bruker modulnavnet', () => {
  const src = (f) => readFileSync(join(JS, f), 'utf8');
  assert.match(src('mobile-fanelinje.js'), /hjem: \['hl', 'Oversikt', '⌂'\]/);
  assert.match(src('mobile-oversikt-knapp.js'), /\['hl', 'Oversikt', '⌂'\]/);
  assert.match(src('mobile-paper.js'), /\['hl', 'Oversikt', 'Pakker, avganger og widgets'\]/);
});
