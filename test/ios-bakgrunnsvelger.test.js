// Prompt 57 (claude-code-bakgrunnsvelger.md): bakgrunnsvelgeren på Oversikt (iOS) vokser ut fra «Vær nå ▾».
// Ingen Swift-kompilator i sandkassen: kildesjekker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');
const paper = code('Paper.swift');
const meny = paper.slice(paper.indexOf('struct PaperBgMenu: View'), paper.indexOf('struct PaperBgPil: Shape'));

test('henger under knappen og vokser ut fra den (skala .6 → 1, 260 ms)', () => {
  // Knappens ramme måles i toppbildet og brukes av menyen.
  assert.match(paper, /Color\.clear\.preference\(key: BakgrunnKnappKey\.self, value: g\.frame\(in: \.global\)\)/);
  assert.match(meny, /let top: CGFloat = k == \.zero \? 120 : k\.maxY - o\.y \+ 10/);
  assert.match(meny, /let w: CGFloat = Swift\.min\(320, geo\.size\.width - 32\)/);
  assert.match(meny, /AnyTransition\.scale\(scale: 0\.6, anchor: UnitPoint\(x: pil \/ w, y: 0\)\)\.combined\(with: \.opacity\)/);
  assert.match(meny, /\.timingCurve\(0\.2, 0\.9, 0\.25, 1\.12, duration: 0\.26\)/);
  assert.match(paper, /\.animation\(PaperBgMenu\.anim, value: store\.paperBgOpen\)/);
  // Åpen/lukket inne i menyen, så overgangen virker begge veier.
  assert.match(meny, /if store\.paperBgOpen \{/);
  assert.match(meny, /PaperBgPil\(\)/);
  assert.match(meny, /cornerRadius: 24/);
  assert.match(meny, /\.padding\(12\)/);
  // Lukkes ved trykk utenfor.
  assert.match(meny, /\.onTapGesture \{ lukk\(\) \}/);
});

test('2×2: Vær nå, Planeter, Oslo, Gradient – «Nåværende» heter Gradient', () => {
  assert.match(meny, /\[\("weather", "Vær nå"\), \("planets", "Planeter"\), \("oslo", "Oslo"\), \("cur", "Gradient"\)\]/);
  assert.match(meny, /GridItem\(\.flexible\(\), spacing: 10\), GridItem\(\.flexible\(\), spacing: 10\)/);
  assert.match(meny, /\.frame\(height: 78\)/);
  assert.match(meny, /cornerRadius: 14/);
  assert.match(meny, /Text\("BAKGRUNN"\)/);
  assert.match(meny, /Text\("Oppdateres automatisk"\)/);
  assert.match(meny, /feil \? "exclamationmark" : "checkmark"/);
  assert.match(meny, /Text\("Eget bilde"\)/);
  assert.match(meny, /GPhoto46Row\(\)/);
  for (const f of ['Paper.swift', 'PaperGate.swift']) assert.doesNotMatch(code(f), /"Nåværende"/, f);
  const ord = readFileSync(join(ROOT, 'docs/ordliste.md'), 'utf8');
  assert.match(ord, /\*\*Gradient\*\*[^\n]*\| Nåværende \(om gradienten\)/);
});
