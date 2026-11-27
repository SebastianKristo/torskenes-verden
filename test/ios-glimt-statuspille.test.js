// Prompt 57 (claude-code-glimt-statuspille.md): Glimt-statuspillen øverst med Glimt-logoen, ikke nederst over Skann-knappen.
// Ingen Swift-kompilator i sandkassen: kildesjekker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const pille = code('GlimtStatuspille.swift');

test('overlay øverst i skallet, ingen pille nederst', () => {
  assert.match(code('KvitteringSkjema.swift'), /\.overlay\(alignment: \.top\) \{ GlimtStatuspille\(\) \}/);
  assert.match(code('Paper.swift'), /\.receipt48Host\(p\)/);
  for (const f of ['KvitteringSkjema.swift', 'KvitteringBekreft.swift']) {
    assert.doesNotMatch(code(f), /padding\(\.bottom, 104\)/, f);
    assert.doesNotMatch(code(f), /overlay\(alignment: \.bottom\)/, f);
  }
  assert.match(pille, /\.padding\(\.top, 8\)/);
  assert.match(pille, /g\.size\.width - 32/);
  assert.match(pille, /\.lineLimit\(1\)/);
  assert.match(pille, /\.frame\(height: 40\)/);
});

test('Glimt-logoen roterer mens Glimt jobber, puls med Reduser bevegelse', () => {
  assert.match(pille, /Orb43\(size: 22, busy: true, still: !jobber\)/);
  assert.doesNotMatch(pille, /ProgressView/);
  assert.match(pille, /reduceMotion && jobber \? \(puls \? 1 : 0\.6\) : 1/);
  const orb = code('OkonomiListe.swift');
  assert.match(orb, /paused: reduceMotion \|\| still/);
  assert.match(orb, /private static func period\(_ busy: Bool\) -> Double \{ busy \? 1\.6 : 6 \}/);
});

test('ferdig 1,5 s, feil står til trykk eller sveip, sveip skjuler mens jobben fortsetter', () => {
  assert.match(pille, /Kvittering lagret ✓/);
  assert.match(pille, /Glimt fikk ikke lest kvitteringen/);
  assert.match(pille, /1_500_000_000/);
  assert.match(pille, /v\.translation\.height < -12/);
  assert.match(pille, /\.move\(edge: \.top\)\.combined\(with: \.opacity\)/);
  assert.match(pille, /\.spring\(duration: 0\.25\)/);
  const flyt = code('KvitteringFlyt.swift');
  assert.match(flyt, /GlimtStatus\.shared\.jobber\(s\)/);
  assert.match(flyt, /GlimtStatus\.shared\.ferdig\(\)/);
  assert.match(flyt, /GlimtStatus\.shared\.feilet\(\)/);
  assert.match(code('KvitteringBekreft.swift'), /GlimtStatus\.shared\.jobber\(Receipt47Flow\.readingText\)/);
});
