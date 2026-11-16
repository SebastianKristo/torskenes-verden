// Designtokens (shared/design/tokens.json): de genererte filene er oppdatert, nøklene er semantiske,
// og fargene holder WCAG-kontrast. Se docs/designsystem.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, PATHS, STILER, MODUSER, FARGER, CSS_SELECTORS,
  generate, diff, loadTokens, validate, nonSemanticKeys, resolveColors, categories,
  parseColor, composite, contrast, opaque,
} from '../scripts/design-tokens.mjs';

const tokens = loadTokens();
const colors = resolveColors(tokens);

test('tokens.json er gyldig', () => {
  assert.deepEqual(validate(tokens), []);
});

test('genererte filer er oppdatert (kjør «npm run tokens» hvis denne feiler)', () => {
  const problems = diff(generate(tokens));
  assert.deepEqual(problems, [], problems.map((p) => `${p.problem}: ${p.path}`).join('\n'));
});

test('generatoren er deterministisk', () => {
  assert.deepEqual(generate(tokens), generate(loadTokens()));
});

test('bare semantiske nøkler (ingen hex- eller nyansenummer-navn)', () => {
  assert.deepEqual(nonSemanticKeys(tokens), []);
  // Sjekken fanger faktisk slike navn.
  const bad = nonSemanticKeys({ color: { papir: { lys: { '#fff': 1, red500: 2, c3: 3, white: 4, b23a2a: 5, surface: 6 } } } });
  assert.deepEqual(bad.sort(), ['color.papir.lys.#fff', 'color.papir.lys.b23a2a', 'color.papir.lys.c3', 'color.papir.lys.red500', 'color.papir.lys.white'].sort());
});

test('fargeparsing og komposisjon', () => {
  assert.deepEqual(parseColor('#f3efe6'), { r: 243, g: 239, b: 230, a: 1 });
  assert.deepEqual(parseColor('rgba(40,44,52,0.55)'), { r: 40, g: 44, b: 52, a: 0.55 });
  assert.throws(() => parseColor('#fff'));
  assert.throws(() => parseColor('red'));
  assert.deepEqual(composite({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 }), { r: 128, g: 128, b: 128, a: 1 });
  assert.equal(+contrast(parseColor('#000000'), parseColor('#ffffff')).toFixed(2), 21);
});

/** Kontrast mellom to tokens i samme stil/modus (alfa lagt over surface). */
const ratio = (farger, fg, bg) => contrast(opaque(farger, fg), opaque(farger, bg));

for (const stil of STILER) {
  for (const modus of MODUSER) {
    const { farger, hoyKontrast } = colors[stil][modus];
    const hoy = { ...farger, ...hoyKontrast };
    test(`kontrast ${stil}.${modus} (WCAG AA)`, () => {
      const krav = [
        ['textPrimary', 'surface', 4.5], ['textPrimary', 'surfaceRaised', 4.5], ['textPrimary', 'surfaceSunken', 4.5],
        ['textSecondary', 'surface', 4.5], ['textSecondary', 'surfaceRaised', 4.5],
        // textTertiary bare for stor tekst (≥ 18 px / 14 px fet).
        ['textTertiary', 'surface', 3], ['textTertiary', 'surfaceRaised', 3],
        ['onAccent', 'accent', 4.5], ['onSuccess', 'success', 4.5], ['onWarning', 'warning', 4.5], ['onDanger', 'danger', 4.5],
        // Fokusring og statusfarger som grafikk (WCAG 1.4.11): ≥ 3:1 mot bunnen.
        ['focus', 'surface', 3], ['focus', 'surfaceRaised', 3],
        ['success', 'surface', 3], ['warning', 'surface', 3], ['danger', 'surface', 3], ['accent', 'surface', 3],
        // Fase 3: felt, brikker, ark, info og svake statusfyll.
        ['textPrimary', 'surfaceField', 4.5], ['textPrimary', 'surfaceChip', 4.5], ['textSecondary', 'surfaceChip', 4.5],
        ['textPrimary', 'surfaceOverlay', 4.5], ['textSecondary', 'surfaceOverlay', 4.5],
        ['info', 'surface', 3], ['onInfo', 'info', 4.5],
        ['textPrimary', 'successSoft', 4.5], ['textPrimary', 'warningSoft', 4.5], ['textPrimary', 'dangerSoft', 4.5],
        ['success', 'successSoft', 3], ['warning', 'warningSoft', 3], ['danger', 'dangerSoft', 3],
      ];
      for (const [fg, bg, min] of krav) {
        const r = ratio(farger, fg, bg);
        assert.ok(r >= min, `${stil}.${modus}: ${fg} på ${bg} = ${r.toFixed(2)}:1 (krav ${min}:1)`);
      }
      // Økt kontrast skal ikke gi dårligere kontrast enn vanlig.
      for (const f of Object.keys(hoyKontrast).filter((k) => k.startsWith('text'))) {
        assert.ok(ratio(hoy, f, 'surface') >= ratio(farger, f, 'surface'), `${stil}.${modus}: highContrast.${f} er svakere`);
        assert.ok(ratio(hoy, f, 'surface') >= 4.5, `${stil}.${modus}: highContrast.${f} under 4.5:1`);
      }
    });
  }
}

test('kategorifarger har onCategory ≥ 4.5:1', () => {
  const { onCategory, farger } = categories(tokens);
  assert.ok(Object.keys(farger).length >= 8);
  for (const [k, v] of Object.entries(farger)) {
    const r = contrast(parseColor(onCategory), parseColor(v));
    assert.ok(r >= 4.5, `category.${k} ${v}: ${r.toFixed(2)}:1`);
  }
});

test('glass.lys peker til papir.lys (Q13)', () => {
  assert.equal(colors.glass.lys.alias, 'papir.lys');
  assert.deepEqual(colors.glass.lys.farger, colors.papir.lys.farger);
});

test('CSS: --ds-prefiks, alle tokens og selektorer for dagens temaattributter', () => {
  const css = readFileSync(join(ROOT, PATHS.css), 'utf8');
  assert.match(css, /^\/\* GENERERT av scripts\/design-tokens\.mjs/);
  const names = [...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]);
  assert.ok(names.length > 50);
  assert.ok(names.every((n) => n.startsWith('--ds-')), 'alle egenskaper har --ds-');
  for (const f of FARGER) assert.ok(names.includes('--ds-' + f.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())), f);
  for (const sel of Object.values(CSS_SELECTORS).flat()) assert.ok(css.includes(sel), sel);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*--ds-motion-fast: 0ms/);
  // Balanserte klammer og ingen tomme verdier (enkel syntakssjekk).
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
  assert.doesNotMatch(css, /:\s*;/);
  assert.doesNotMatch(css, /undefined|NaN/);
});

test('Swift, Kotlin og asset-katalog har GENERERT-merke og ingen tomme verdier', () => {
  const files = generate(tokens);
  for (const p of [PATHS.swift, PATHS.kotlinApp, PATHS.kotlinKalender, PATHS.kotlinWear]) {
    assert.match(files[p], /^\/\/ GENERERT av scripts\/design-tokens\.mjs fra shared\/design\/tokens\.json – ikke rediger/, p);
    assert.doesNotMatch(files[p], /undefined|NaN/, p);
  }
  assert.match(files[PATHS.kotlinApp], /^package no\.kristo\.finanshub\.ui\.designsystem$/m);
  assert.match(files[PATHS.kotlinKalender], /^package no\.kristo\.kalender\.ui\.designsystem$/m);
  assert.match(files[PATHS.kotlinWear], /^package no\.kristo\.finanshub\.wear\.ui\.designsystem$/m);
  assert.doesNotMatch(files[PATHS.kotlinWear], /material3/, 'wear har ikke Material 3');
  const sets = Object.keys(files).filter((p) => p.endsWith('.colorset/Contents.json'));
  assert.equal(sets.length, STILER.length * FARGER.length + 2 + Object.keys(categories(tokens).farger).length); // + onCategory og onCategoryLight
  for (const p of sets) JSON.parse(files[p]);
  // Swift-koden peker bare på fargesett som finnes.
  const names = new Set(sets.map((p) => p.split('/').at(-2).replace('.colorset', '')));
  for (const stil of STILER) for (const f of FARGER) assert.ok(names.has(`DS${stil[0].toUpperCase()}${stil.slice(1)}${f[0].toUpperCase()}${f.slice(1)}`));
  for (const m of files[PATHS.swift].matchAll(/return "(DSCategory\w+)"|Color\("(DS\w+)"/g)) assert.ok(names.has(m[1] || m[2]), m[0]);
});

test('ingen genererte filer har versjons- eller promptnummer i navnet', () => {
  for (const p of Object.keys(generate(tokens))) {
    const base = p.split('/').filter((s) => !s.endsWith('.colorset') && s !== 'Contents.json').at(-1);
    assert.doesNotMatch(base, /\d{2,}/, p);
  }
});

test('docs/designsystem.md har samme fargeverdier som tokens.json', () => {
  const doc = readFileSync(join(ROOT, 'docs/designsystem.md'), 'utf8');
  for (const f of FARGER) {
    const row = doc.split('\n').find((l) => l.startsWith(`| \`${f}\` |`));
    assert.ok(row, `rad for ${f} mangler`);
    const vals = [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1]).slice(1, 4);
    assert.deepEqual(vals, [colors.papir.lys.farger[f], colors.papir.mork.farger[f], colors.glass.mork.farger[f]], f);
  }
  for (const [k, v] of Object.entries(categories(tokens).farger)) assert.ok(doc.includes(`| \`category.${k}\` | \`${v}\` |`), k);
});
