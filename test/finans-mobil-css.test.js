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

test('mobile.css har ingen regler for rotklasser .m aldri får (Papir er alltid på: .two, .nobar, .backtop, :not(.papir))', () => {
  // Roten får alltid «m and papir» (mobile.js draw). To paneler (.two), «uten fanelinje» (.nobar) og «tilbake øverst» (.backtop)
  // fantes bare i det slettede Klassisk-designet.
  assert.doesNotMatch(utenKommentarer, /\.(?:m|and)(?:\.[\w-]+)*(?:\.two|\.nobar|\.backtop|\.nobg)(?![\w-])/);
  assert.doesNotMatch(utenKommentarer, /\.m(?:\.[\w-]+)*:not\(\.papir\)/);
});

test('stegprikkene i Mat og fargene i Kvitteringer/Finn er klasser, ikke inline stil som CSS må overstyre', () => {
  assert.match(js('mobile-mat.js'), /<i\$\{i <= k \? ' class="on"' : ''\}><\/i>/);
  assert.doesNotMatch(utenKommentarer, /mp2-dots i\[style/);
  for (const f of ['mobile.js', 'mobile-finn.js']) assert.doesNotMatch(js(f), /style="[^"]*color:#(9FE3C6|FFB08A)/i, f);
});

test('kategorifargene fra serveren blir papirfarger i JS, ikke med !important mot inline stil', async () => {
  assert.doesNotMatch(utenKommentarer, /\[style\*="color:/, 'mobile.css skal ikke overstyre inline stil');
  const { papirTekst } = await import('../public/finans/js/mobile-theme.js');
  assert.equal(papirTekst('#9FE3C6'), 'var(--pp-pos)'); // Inntekt
  assert.equal(papirTekst('#FFB08A'), 'var(--pp-lab)'); // Vedlikehold, Maling
  assert.equal(papirTekst('#B79CFF'), '#B79CFF');
  assert.match(js('mobile.js'), /export const amtC = \(v, th\) => \(v > 0 \? 'var\(--pp-pos\)'/);
  assert.match(js('mobile-mods.js'), /color:\$\{esc\(papirTekst\(e\.color/);
  for (const f of ['mobile.js', 'mobile-pages.js', 'mobile-tx.js', 'mobile-mods.js']) assert.doesNotMatch(js(f), /vc: '#9FE3C6'|> 0 \? '#9FE3C6'/, f);
});

test('antall !important i mobile.css går bare ned', () => {
  const n = (utenKommentarer.match(/!important/g) || []).length;
  assert.ok(n <= 577, `${n} !important (maks 577; 861 før oppryddingen)`);
});
