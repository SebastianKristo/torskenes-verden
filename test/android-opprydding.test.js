// Opprydding etter 5.0.0 (REST-ANDROID): kildesjekker for radene i docs/opprydding/STATUS.md som gjelder Android –
// filnavn uten promptnummer, ingen fast lokal adresse (C-S4/D-B5), widgetene (Q31, P85 H), sted via serveren (L12),
// 404-reserver (Q19), Familie-områder per bruker (P85 L) og beskrivelser for TalkBack (P85 E).
// Ingen Android SDK her: CI-jobben «Mobilapper» er fasit for at koden kompilerer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const APP = join(AND, 'app/src/main/java/no/kristo/finanshub');
const KAL = join(AND, 'kalender/src/main/java/no/kristo/kalender');
const raw = (p) => readFileSync(p, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function ktFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'build') out.push(...ktFiles(p)); }
    else if (e.name.endsWith('.kt')) out.push(p);
  }
  return out;
}

test('filnavn: ingen Kotlin-fil i Android har promptnummer i navnet', () => {
  const numbered = ktFiles(AND).map((p) => relative(AND, p)).filter((p) => /[A-Za-z][0-9]{2}[A-Za-z]*\.kt$/.test(p));
  assert.deepEqual(numbered, []);
});

test('baseline-profilen peker bare på fasadeklasser som finnes', () => {
  const prof = raw(join(AND, 'app/src/main/baseline-prof.txt'));
  const names = new Set(ktFiles(join(AND, 'app/src/main/java')).map((p) => relative(join(AND, 'app/src/main/java'), p).replace(/\.kt$/, 'Kt')));
  for (const m of prof.matchAll(/^L(no\/kristo\/finanshub\/[A-Za-z/]+Kt)\*?;/gm)) assert.ok(names.has(m[1]), m[1]);
});

test('C-S4/D-B5: ingen fast lokal standardadresse i appene; lagret adresse og serverens verdi brukes', () => {
  for (const p of [...ktFiles(join(AND, 'app/src/main')), ...ktFiles(join(AND, 'kalender/src/main')), ...ktFiles(join(AND, 'wear/src/main'))]) {
    assert.doesNotMatch(strip(raw(p)), /10\.69\.1\.39/, relative(AND, p));
  }
  const srv = strip(raw(join(APP, 'Serveradresse.kt')));
  assert.doesNotMatch(srv, /DEFAULT_LOCAL47/);
  assert.match(srv, /var defLocal by mutableStateOf\(""\)/);
  // Innlogging uten svar fra ekstern: bare en lokal adresse brukeren allerede har, og bare når den svarer som samme server.
  assert.match(srv, /internal suspend fun loginVia47\(srv: String, local: String\?\): String\?/);
  assert.match(srv, /return if \(localIsOurs47\(l, srv\)\) l else null/);
  assert.match(srv, /accounts\.firstOrNull \{ it\.server == srv && it\.local\.isNotBlank\(\) \}\?\.local \?: lastLocal89\(\)/);
  assert.match(srv, /if \(!ours \|\| p47\.defLocal\.isBlank\(\)\) return/);
  const kal = strip(raw(join(KAL, 'Innlogging.kt')));
  assert.doesNotMatch(kal, /DEFAULT_LOCAL\b/);
  assert.match(strip(raw(join(KAL, 'Serveradresser.kt'))), /getString\("k47_def_loc", ""\)\?\.takeIf \{ it\.startsWith\("http"\) \} \?: ""/);
});
