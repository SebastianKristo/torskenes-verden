// Prompt 57 (claude-code-refresh-fiks.md): pull-to-refresh på iOS gir én spinner som alltid blir ferdig.
// Ingen Swift-kompilator i sandkassen: kildesjekker av lastefunksjonen, tidsavbruddet og alle bruksstedene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const code = (f) => strip(readFileSync(join(SRC, f), 'utf8'));
const files = readdirSync(SRC).filter((f) => f.endsWith('.swift'));

/** Teksten i klammeparentesen som starter ved `from` (første `{` etter). */
function block(src, from) {
  const i = src.indexOf('{', from);
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
}

const opp = code('Oppfrisking.swift');

test('én lastefunksjon: ny lasting avbryter den forrige, defer nullstiller, 15 s tidsavbrudd', () => {
  assert.match(opp, /static let tidsavbrudd: TimeInterval = 15\b/);
  assert.match(opp, /jobber\[nokkel\]\?\.task\.cancel\(\)/);
  assert.match(opp, /defer \{ Oppfrisking\.shared\.avslutt\(nokkel, id\) \}/);
  // Svarer nøyaktig én gang, også når kallet aldri blir ferdig.
  assert.match(opp, /withCheckedContinuation/);
  assert.match(opp, /final class EngangsSvar/);
  assert.match(opp, /Kunne ikke oppdatere/);
  // Fra bakgrunnen: hengende lasting startes på nytt.
  assert.match(opp, /func blittAktiv\(\)/);
  assert.match(code('Store.swift'), /Oppfrisking\.shared\.blittAktiv\(\)/);
});

test('ingen .refreshable direkte i appen – alle går via .oppfrisk, uten Task {} inni', () => {
  for (const f of files) {
    if (f === 'Oppfrisking.swift') continue;
    const s = code(f);
    assert.doesNotMatch(s, /\.refreshable\s*\{/, f);
    let i = s.indexOf('.oppfrisk(');
    while (i >= 0) {
      const b = block(s, i);
      assert.doesNotMatch(b, /\bTask\s*\{/, `${f}: Task {} inni oppfrisk`);
      i = s.indexOf('.oppfrisk(', i + 1);
    }
  }
  assert.match(opp, /refreshable \{ _ = await Oppfrisking\.shared\.kjor\(nokkel, arbeid\) \}/);
});

test('Transaksjoner: én lastevei, 15 s på kallet, egen spinner bare ved første lasting', () => {
  const store = code('Store.swift');
  assert.match(store, /as: TxPage\.self, timeout: Oppfrisking\.tidsavbrudd/);
  assert.match(block(store, store.indexOf('func reloadTx()')), /kjor\("fliste"\)/);
  assert.match(store, /if t == \.list \{ Task \{ await self\.reloadTx\(\) \}; return \}/);
  assert.match(store, /func search\(\) \{ Task \{ await self\.reloadTx\(\) \} \}/);
  const list = code('PaperFinanceList.swift');
  assert.match(list, /store\.txs == nil && !Oppfrisking\.shared\.laster\("Paper"\)/);
  assert.match(list, /Prøv igjen/);
  assert.match(code('Paper.swift'), /case "fliste": await store\.reloadTx\(\)/);
  assert.match(code('API.swift'), /func get<T: Decodable>\(_ path: String, as: T\.Type = T\.self, timeout: TimeInterval = 30\)/);
});
