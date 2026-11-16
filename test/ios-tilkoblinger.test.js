// iOS, Innstillinger → Tilkoblinger: gruppene kommer fra serveren (`category`), med shared/schemas/tilkoblinger.json som
// rekkefølge og reserve (Fase 6, E-ia O8). Kildetester – ingen Swift-kompilator her; CI-jobben «Mobilapper» bygger appen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tilkoblingsgruppe, TILKOBLINGSGRUPPER } from '../server/moduler/tilkoblinger.js';

const ROOT = join(import.meta.dirname, '..');
const IOS = join(ROOT, 'apps', 'ios');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');

test('tilkoblinger.json er en ressurs i Homelab-appen (samme fil som serveren leser)', () => {
  const yml = raw('project.yml');
  const start = yml.indexOf('\n  FinansHub:\n');
  const block = yml.slice(start, yml.indexOf('\n    dependencies:', start));
  assert.match(block, /- path: \.\.\/\.\.\/shared\/schemas\/tilkoblinger\.json\n\s+buildPhase: resources/);
});

test('appen grupperer etter serverens category, ellers etter den innebygde fila; ingen egen gruppeliste', () => {
  const g = code('FinansHub/Sources/Tilkoblingsgrupper.swift');
  assert.match(g, /forResource: "tilkoblinger", withExtension: "json"/);
  assert.match(g, /return c\.isEmpty \? gruppe\(for: id\) : c/);
  assert.match(g, /static let generelt: String = "Generelt"/);
  const page = code('FinansHub/Sources/IntegrationsPage.swift');
  assert.match(page, /Tilkoblingsgrupper\.vist\(category: category, id: id\)/);
  assert.match(page, /Tilkoblingsgrupper\.ordnet\(used\)/);
  // Den gamle egne lista (Transport og pakker · Informasjon · Annet) er borte som gruppering.
  assert.doesNotMatch(page, /static let categories: \[String\]/);
  assert.doesNotMatch(page, /Int26Meta\.categories/);
});

test('samme svar som serveren: id → gruppe fra fila, ukjent → Generelt, Generelt sist', () => {
  const fil = JSON.parse(readFileSync(join(ROOT, 'shared/schemas/tilkoblinger.json'), 'utf8'));
  // Speiler Tilkoblingsgrupper.gruppe(for:) i Swift.
  const navn = new Map(fil.grupper.map((x) => [x.id, x.navn]));
  const app = (id) => navn.get(fil.integrasjoner[id.toLowerCase()]) ?? 'Generelt';
  for (const id of [...Object.keys(fil.integrasjoner), 'ukjent', 'HA']) assert.equal(app(id), tilkoblingsgruppe(id), id);
  assert.deepEqual(fil.grupper.map((x) => x.navn), [...TILKOBLINGSGRUPPER]);
  assert.equal(TILKOBLINGSGRUPPER.at(-1), 'Generelt');
});
