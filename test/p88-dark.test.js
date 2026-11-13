// Prompt 88 (DARK): mørk modus på Dashboard (claude-code-dark-knapper-dashboard.md) og X i Media-headeren på samme linje
// (claude-code-media-header-lukk.md). Statiske sjekker av CSS-en; kontrast og geometri er målt i Playwright (se rapporten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const D = 'html[data-mode="dark"][data-hl="2c"]';
const rule = (css, sel) => {
  const i = css.indexOf(`${sel}{`);
  assert.ok(i >= 0, `fant ikke regelen ${sel}`);
  return css.slice(i + sel.length + 1, css.indexOf('}', i));
};

test('web88-dark.css lastes sist i app.html', () => {
  const html = rd('public/app.html');
  const i = html.indexOf('/assets/css/web88-dark.css');
  assert.ok(i > html.indexOf('/assets/css/web44-dark.css') && i > html.indexOf('/assets/css/web66-sys.css'));
});

test('temavariabler for mørk modus', () => {
  const r = rule(rd('public/css/web88-dark.css'), D);
  for (const v of ['--p-ink:#f3efe6', '--p-card:#1b1a17', '--p-line:#34312c']) assert.ok(r.includes(v), v);
});

test('«Vær ▾»: mørkt glass, lys tekst, 40 px, rund', () => {
  const css = rd('public/css/web88-dark.css');
  const r = rule(css, `${D} .hl-bgdd-btn`);
  for (const s of ['height:40px', 'border-radius:999px', 'border:1px solid var(--p88-edge)', 'background:var(--p88-glass)', 'backdrop-filter:blur(12px)', 'color:var(--p-ink)']) assert.ok(r.includes(s), s);
  assert.match(css, /--p88-glass:rgba\(20,19,17,\.55\);--p88-glass2:rgba\(20,19,17,\.7\);--p88-edge:rgba\(243,239,230,\.18\)/);
  assert.match(css, /\.hl-bgdd-btn:hover,html\[data-mode="dark"\]\[data-hl="2c"\] \.hl-bgdd-btn\[aria-expanded="true"\]\{background:var\(--p88-glass2\)\}/);
});

test('✦ AI og mikrofon: av = gjennomsiktig med lys kant, på = lys flate', () => {
  const css = rd('public/css/web88-dark.css');
  assert.match(css, /\.p-search \.sbar \.sq-ai-tog\{background:transparent;color:#e8e3d8;border:1px solid var\(--p88-edge2\)\}/);
  assert.match(css, /\.sq-ai-tog\[aria-pressed="true"\]\{background:var\(--p-ink\);color:var\(--p-card\);border-color:transparent\}/);
  assert.match(css, /\.sq-ai-tog:hover\{background:var\(--p88-hov\)\}/);
  assert.match(css, /button\.v54-mic\{border:1px solid var\(--p88-edge2\)/);
  assert.match(css, /button\.v54-mic:is\(:hover,:active\)\{background:var\(--p88-hov\)\}/);
  assert.match(css, /--p88-edge2:rgba\(243,239,230,\.22\);--p88-hov:rgba\(243,239,230,\.08\)/);
});

test('Kveldsbrief-arket: mørk flate også i toppen, demping bak', () => {
  const css = rd('public/css/web88-dark.css');
  assert.equal(rule(css, `${D} .gb-back`), 'background:rgba(0,0,0,.45)');
  assert.ok(rule(css, `${D} .gb-in`).startsWith('background:var(--p-card)'));
  const h = rule(css, `${D} .gb-head`);
  assert.ok(h.includes('background:var(--p-card)') && h.includes('border-bottom:1px solid var(--p-line)') && h.includes('backdrop-filter:none'));
  assert.match(css, /\.gb38-ht,html\[data-mode="dark"\]\[data-hl="2c"\] \.gb-title b\{color:var\(--p-ink\)\}/);
  assert.match(css, /--p-ink2:#cfc8ba/);
  assert.equal(rule(css, `${D} .gb-done`), 'background:var(--p-ink);color:var(--p-card)');
});

test('Media-headeren: én linje på PC, X helt til høyre', () => {
  const css = rd('public/css/media70.css');
  const tl = rule(css, '.m70-tl');
  assert.ok(tl.includes('flex-wrap:nowrap') && tl.includes('gap:16px'));
  assert.match(css, /\.m70-tl>\.m70-back,\.m70-tl>\.m70-h,\.m70-tl>\.m70-alw,\.m70-tl>\.m44-srv\{flex:none;white-space:nowrap\}/);
  assert.match(css, /\.m70-tl>\.m70-x\{margin-left:auto\}/);
  assert.match(rule(css, '\n.m70-x'), /width:48px;height:48px;flex:none/);
  const tabs = rule(css, '.m70-tabs');
  for (const s of ['flex:0 1 auto', 'min-width:0', 'flex-wrap:nowrap', 'overflow-x:auto']) assert.ok(tabs.includes(s), s);
  assert.match(rule(css, '.m70-gl'), /^flex:1 1 200px;min-width:140px;/);
});

test('Media-headeren på smal skjerm: Tilbake · Media · varsler · X på første rad, tittelen kappes ikke', () => {
  const css = rd('public/css/media70.css');
  const m = css.slice(css.indexOf('@media (max-width:900px)'));
  assert.match(m, /\.m70-tl\{display:grid;grid-template-columns:auto auto minmax\(0,1fr\) minmax\(0,max-content\) auto;/);
  assert.match(m, /\.m70-h\{grid-area:1\/2;font-size:30px;white-space:nowrap\}/);
  assert.match(m, /\.m70-tl>\.m70-x\{grid-area:1\/5;/);
  assert.doesNotMatch(m.slice(0, m.indexOf('.m70-tabs{order:7')), /text-overflow:ellipsis/);
  assert.match(rd('public/css/media-nrk.css'), /@media \(max-width:420px\)\{\.m43\.m70 \.m70-tab\{padding:9px 11px\}\}/);
});
