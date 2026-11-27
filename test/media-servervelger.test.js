// Prompt 57 (14.11, «går ut av siden»): servervelgeren i Media står ytterst til høyre i topplinja på desktop. Menyen var forankret
// til venstre kant av knappen og gikk ut over høyre kant av vinduet. Nå: høyre kant av knappen, aldri bredere enn vinduet − 32 px.
// På smal skjerm står knappen til venstre på egen linje, så der forankres menyen til venstre. Geometrien er målt i Playwright
// (1440 og 390 px, se rapporten); her sjekkes reglene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/pages/media.css', import.meta.url), 'utf8');
const decl = (body) => Object.fromEntries(body.split(';').map((d) => d.split(':')).filter((x) => x.length >= 2).map(([k, ...v]) => [k.trim(), v.join(':').trim()]));

test('servervelgeren: menyen forankres til høyre kant av knappen og går ikke ut av siden', () => {
  const m = css.match(/(?:^|\n)\.m44-sm\{([^}]*)\}/);
  assert.ok(m, 'fant .m44-sm');
  const d = decl(m[1]);
  assert.equal(d.right, '0');
  assert.equal(d.left, undefined, 'ikke forankret til venstre på desktop');
  assert.equal(d['max-width'], 'calc(100vw - 32px)');
});

test('servervelgeren på smal skjerm: forankret til venstre (knappen står til venstre)', () => {
  const m = css.match(/@media \(max-width:900px\)\{[^\n]*?\.m44-sm\{([^}]*)\}/);
  assert.ok(m, 'fant regelen for smal skjerm');
  const d = decl(m[1]);
  assert.equal(d.left, '0');
  assert.equal(d.right, 'auto');
});
