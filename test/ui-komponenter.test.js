// Felles UI-komponenter på web (public/js/ui/ + public/css/components/ui.css): riktige klasser, escaping, og bare tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buttonHtml } from '../public/js/ui/button.js';
import { cardHtml } from '../public/js/ui/card.js';
import { emptyHtml } from '../public/js/ui/empty.js';
import { loaderHtml } from '../public/js/ui/loader.js';
import { sheetHtml } from '../public/js/ui/sheet.js';
import { esc } from '../public/js/ui/html.js';

const ROOT = join(import.meta.dirname, '..');

test('knapp: varianter, type og attributter, og teksten escapes', () => {
  assert.equal(buttonHtml('Lagre'), '<button type="button" class="ui-btn">Lagre</button>');
  assert.match(buttonHtml('OK', { variant: 'primary', type: 'submit' }), /^<button type="submit" class="ui-btn ui-btn--primary">OK<\/button>$/);
  assert.match(buttonHtml('Slett', { variant: 'danger' }), /class="ui-btn ui-btn--danger"/);
  assert.match(buttonHtml('x', { variant: 'ukjent' }), /class="ui-btn"/);
  assert.match(buttonHtml('x', { attrs: { 'data-go': 'a"b', disabled: true, hidden: false } }), / data-go="a&quot;b" disabled>/);
  assert.match(buttonHtml('<b>'), />&lt;b&gt;</);
});

test('kort, tomtilstand, laster og ark escaper tekst og har roller', () => {
  assert.match(cardHtml({ title: 'Vær & vind', sub: 'i dag', body: '<p>x</p>' }), /^<section class="ui-card" aria-label="Vær &amp; vind"><h3 class="ui-card-h">Vær &amp; vind <span class="ui-card-sub">i dag<\/span><\/h3><p>x<\/p><\/section>$/);
  assert.equal(cardHtml({ body: 'b' }), '<section class="ui-card">b</section>');
  assert.match(emptyHtml({ title: 'Ingen <varer>', text: 'Legg til' }), /role="status".*Ingen &lt;varer&gt;.*Legg til/);
  assert.match(loaderHtml(), /class="ui-loader" role="status"/);
  const s = sheetHtml({ title: 'Logg ut', text: 'Sikker?', foot: buttonHtml('Avbryt'), tag: 'form' });
  assert.match(s, /^<form class="ui-sheet" role="dialog" aria-modal="true" aria-label="Logg ut">/);
  assert.match(s, /<div class="ui-sheet-f"><button/);
  assert.match(sheetHtml({ title: 't', tag: 'script' }), /^<div /);
  assert.equal(esc(`<&"'>`), '&lt;&amp;&quot;&#39;&gt;');
});

test('ui.css bruker bare tokens: ingen hex, ingen !important, og alle var() er --ds-*', () => {
  const css = readFileSync(join(ROOT, 'public/css/components/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /!important/);
  const vars = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
  assert.ok(vars.length > 30);
  const tokens = readFileSync(join(ROOT, 'public/css/tokens.css'), 'utf8');
  for (const v of vars) assert.ok(v.startsWith('--ds-') && tokens.includes(`${v}:`), `${v} finnes ikke i tokens.css`);
});

test('ui-mappen: én fil per komponent, uten nummer i navnet, og ui.css lastes i app.html', () => {
  const files = readdirSync(join(ROOT, 'public/js/ui'));
  for (const f of ['button.js', 'card.js', 'empty.js', 'loader.js', 'sheet.js', 'toast.js']) assert.ok(files.includes(f), f);
  for (const f of files) assert.doesNotMatch(f, /\d/, f);
  assert.match(readFileSync(join(ROOT, 'public/app.html'), 'utf8'), /\/assets\/css\/components\/ui\.css/);
});

test('CSS (runde 4): skallkomponentene er én fil, og app.html lenker bare til filer som finnes, i samme rekkefølge', () => {
  const html = readFileSync(join(ROOT, 'public/app.html'), 'utf8');
  const links = [...html.matchAll(/href="\/assets\/(css\/[^"?]+\.css)/g)].map((m) => m[1]);
  for (const l of links) assert.ok(existsSync(join(ROOT, 'public', l)), `${l} finnes ikke`);
  for (const gammel of ['card', 'controls', 'overlay', 'feedback', 'module']) assert.ok(!existsSync(join(ROOT, `public/css/components/${gammel}.css`)), `${gammel}.css er slått sammen`);
  const i = (f) => links.indexOf(`css/components/${f}.css`);
  assert.ok(i('shell') > links.indexOf('css/layout.css') && i('shell') < i('glimt') && i('glimt') < i('ui'), 'rekkefølgen er som før sammenslåingen');
  const shell = readFileSync(join(ROOT, 'public/css/components/shell.css'), 'utf8');
  const pos = ['card', 'controls', 'overlay', 'feedback', 'module'].map((s) => shell.indexOf(`/* ======================= ${s} ======================= */`));
  assert.ok(pos.every((p, k) => p >= 0 && (k === 0 || p > pos[k - 1])), 'card → controls → overlay → feedback → module');
});
