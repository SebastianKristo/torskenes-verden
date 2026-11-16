// mobile.css (Økonomi på mobil-web): død kode og !important. Tallet for !important skal bare gå ned (CLAUDE.md: ingen
// !important uten begrunnelse; STATUS «!important i CSS»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/finans/css/mobile.css', import.meta.url), 'utf8');
const js = (f) => readFileSync(new URL(`../public/finans/js/${f}`, import.meta.url), 'utf8');
const utenKommentarer = css.replace(/\/\*[\s\S]*?\*\//g, '');

test('Papir er alltid på, så temaet er alltid «and» og .ios settes aldri', () => {
  assert.match(js('mobile-paper.js'), /export const paper = \(\) => true;/);
  assert.match(js('mobile.js'), /export const theme = \(\) => \{ if \(paper\(\)\) return 'and';/);
});

test('mobile.css har ingen regler for det slettede iOS-temaet (.ios)', () => {
  assert.doesNotMatch(utenKommentarer, /\.ios(?![\w-])/);
});

test('stegprikkene i Mat og fargene i Kvitteringer/Finn er klasser, ikke inline stil som CSS må overstyre', () => {
  assert.match(js('mobile-mat.js'), /<i\$\{i <= k \? ' class="on"' : ''\}><\/i>/);
  assert.doesNotMatch(utenKommentarer, /mp2-dots i\[style/);
  for (const f of ['mobile.js', 'mobile-finn.js']) assert.doesNotMatch(js(f), /style="[^"]*color:#(9FE3C6|FFB08A)/i, f);
});

test('antall !important i mobile.css går bare ned', () => {
  const n = (utenKommentarer.match(/!important/g) || []).length;
  assert.ok(n <= 806, `${n} !important (maks 806; 861 før oppryddingen)`);
});
