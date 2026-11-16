// M9: forbokstavene bak kildelogoen i Innstillinger → Nyheter står på fargen brukeren har valgt per kilde. Hvit tekst ga 3,71:1
// på en middels lys farge. Nå velges teksten (token onCategory eller onCategoryLight) etter bakgrunnens lyshet, så kontrasten er
// minst 4,5:1 uansett farge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lysBakgrunn, kontrast } from '../public/js/lib/kontrast.js';

const tokens = JSON.parse(readFileSync(new URL('../shared/design/tokens.json', import.meta.url), 'utf8'));
const ON = tokens.category.onCategory, ON_LIGHT = tokens.category.onCategoryLight;

test('teksten på en brukerfarge har minst 4,5:1 for alle farger', () => {
  let worst = 99;
  for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) {
    const hex = `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    const ink = lysBakgrunn(hex) ? ON_LIGHT : ON;
    worst = Math.min(worst, kontrast(hex, ink));
  }
  assert.ok(worst >= 4.5, `dårligste kontrast ${worst.toFixed(2)}:1`);
});

test('lysBakgrunn: kjente farger og ugyldige verdier', () => {
  assert.equal(lysBakgrunn('#ffffff'), true);
  assert.equal(lysBakgrunn('#000000'), false);
  assert.equal(lysBakgrunn('#b23a2a'), false); // kategorifargen rød: hvit tekst
  assert.equal(lysBakgrunn('#f4c430'), true); // gul: svart tekst
  assert.equal(lysBakgrunn('#fc0'), true); // kort form
  assert.equal(lysBakgrunn(''), false); // ukjent: standard (hvit på kategorifarge)
  assert.equal(lysBakgrunn('var(--x)'), false);
  assert.equal(lysBakgrunn('rgb(250, 250, 250)'), true);
});

test('Nyheter-innstillingene bruker tokenene, ikke fast hvit', () => {
  const css = readFileSync(new URL('../public/css/pages/nyheter.css', import.meta.url), 'utf8');
  const rule = css.match(/\.nw-ini\s*\{[^}]*\}/)[0];
  assert.match(rule, /color:\s*var\(--ds-on-category\)/);
  assert.match(css, /\.nw-ini\.on-lys\s*\{[^}]*color:\s*var\(--ds-on-category-light\)/);
  assert.match(readFileSync(new URL('../public/js/news.js', import.meta.url), 'utf8'), /lysBakgrunn\(f\.color\)/);
});
