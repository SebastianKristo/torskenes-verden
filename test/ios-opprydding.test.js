// Opprydding (rest-ios): kildetester for de siste iOS-radene i STATUS.md (C-B3, C-B5, C-S4, Q19, filnavn, Store).
// Ingen Swift-kompilator her; CI-jobben «Mobilapper» bygger appen og kjører HomelabTests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const IOS = join(import.meta.dirname, '..', 'apps', 'ios');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');
const swiftFiles = (dir = IOS) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n.endsWith('.xcassets') ? [] : swiftFiles(p);
  return n.endsWith('.swift') ? [p] : [];
});
// Uten kommentarer (// og /* */), så forklaringer ikke teller.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');

test('C-B3: KalNet sender aldri tom kropp stille – ugyldig JSON gir feil', () => {
  const src = code(raw('SharedKal/Core/KalNet.swift'));
  assert.doesNotMatch(src, /httpBody\s*=\s*try\?/, 'ingen try? på kroppen');
  assert.match(src, /JSONSerialization\.isValidJSONObject\(json\)/, 'sjekker kroppen før den sendes');
  assert.match(src, /throw KalNetError\(status: 0, message: "Ugyldig forespørsel"\)/);
});

test('C-B5: én ruting for innst-sidene (InnstSide), brukt av både telefon og iPad', () => {
  const paper = code(raw('FinansHub/Sources/Paper.swift'));
  const wide = code(raw('FinansHub/Sources/SettingsWide.swift'));
  const alle = swiftFiles().map((f) => code(readFileSync(f, 'utf8')));
  const def = alle.filter((s) => /struct InnstSide: View/.test(s));
  assert.equal(def.length, 1, 'InnstSide finnes ett sted');
  for (const side of ['Tilpass39Page()', 'AppProfile39Page()', 'FamilySettingsView()', 'HealthPosSettings20()', 'HaHealthPage42()', 'PaperSettingsSub(key:']) {
    assert.ok(def[0].includes(side), side);
    // Ingen av rutefilene har sin egen kopi lenger.
    assert.ok(!paper.includes(side) && !wide.includes(side), `${side} rutes bare i InnstSide`);
  }
  assert.match(paper, /hasPrefix\("innst-"\): InnstSide\(id: t\)/);
  assert.match(wide, /hasPrefix\("innst-"\): InnstSide\(id: t\)/);
});
