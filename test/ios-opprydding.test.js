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
