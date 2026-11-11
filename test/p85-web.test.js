// Prompt 85 (WEB85): rettinger etter full gjennomgang av web/PWA i Playwright (1440 × 900 og 390 × 844, lyst og mørkt).
// Hver test peker på én feil som ble sett i nettleseren; se funnlisten for hvordan den ble gjenskapt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, 'public', p), 'utf8');
const DARK = 'html[data-mode="dark"][data-hl="2c"]';

test('Mat: mørk papirmodus har egne tokens som vinner over de lyse standardverdiene', () => {
  const css = read('css/mat.css');
  const i = css.indexOf(`${DARK} .mat{`);
  assert.ok(i > 0, 'mørk regel for .mat mangler i mat.css');
  const rule = css.slice(i, css.indexOf('}', i));
  assert.match(rule, /--mp-bg:var\(--mat-bg,#16/);
  assert.match(rule, /color-scheme:dark/);
  // Regelen må ha høyere spesifisitet enn «.mat», ikke :where(), siden mat.css lastes sist.
  assert.ok(!/:where\([^)]*\)\s*\.mat\{[^}]*--mp-bg/.test(css));
});

test('Chat: sidepanelet (--cs) er mørkt i mørk papirmodus, og Nøytral-temaet beholder sitt', () => {
  const css = read('css/chat.css');
  const m = css.match(/:where\(html\[data-mode="dark"\]\[data-hl="2c"\]\) \.ch\{--cs:(#[0-9a-f]{6})\}/);
  assert.ok(m, 'mørk --cs mangler');
  assert.ok(parseInt(m[1].slice(1, 3), 16) < 0x40, 'sidepanelet skal være mørkt');
  assert.ok(css.indexOf(m[0]) > css.indexOf('.ch{--cb:#f3efe6'), 'må stå etter grunnregelen');
  assert.match(css, /\.ch\.noytral\{[^}]*--cs:#171717/);
});

test('Familie/Media: snarveien settes etter fotovinduet, ikke oppå toppmenyen', () => {
  const js = read('js/medfam51.js');
  const body = js.slice(js.indexOf('function jump('), js.indexOf('export function afterMedfam51'));
  assert.match(body, /querySelector\(':scope > section\.pw'\)/);
  assert.match(body, /if \(pw\) pw\.after\(a\); else view\.prepend\(a\)/);
});

test('Sporing: fremdriften vises i mørk modus, og klokkeslettet kuttes ikke', () => {
  const paper = read('css/paper.css');
  assert.ok(paper.includes(`${DARK} .trk-step.dn i,${DARK} .trk-step.ln em{background:var(--ink)}`));
  assert.ok(paper.includes(`${DARK} .trk-step.cur i{background:var(--acc)}`));
  assert.ok(paper.includes(`${DARK} .trk-step.fin i,${DARK} .trk-step.fin.ln em{background:var(--pos)}`));
  assert.match(read('css/tracking.css'), /\.trk-step time\{white-space:normal\}/);
});

test('Familie: zoomknappene på kartet er lesbare i mørk modus', () => {
  const css = read('css/family50.css');
  assert.match(css, /html\[data-mode="dark"\] \.f50 \.leaflet-bar a \{[^}]*background-color: #211e18;[^}]*color: #f3efe6/);
});

test('Gjøremål: #/gjoremal har fotovindu som #/huskeliste', () => {
  const js = read('js/hltheme.js');
  const head = js.slice(js.indexOf('const HEAD = {'), js.indexOf('export function pwHeader'));
  assert.match(head, /\n\s*gjoremal: \(\) => \[/);
  assert.match(head, /\n\s*huskeliste: \(\) => \[/);
});

test('Søkefelt: clearBtn() alene gir både stilark og lyttere', async () => {
  const added = [], listeners = [];
  const prev = globalThis.document;
  globalThis.document = {
    getElementById: (id) => added.find((e) => e.id === id) ?? null,
    createElement: () => ({}),
    head: { appendChild: (e) => added.push(e) },
    addEventListener: (type) => listeners.push(type),
  };
  try {
    const m = await import(`${join(ROOT, 'public/js/searchfield.js')}?p85`);
    const html = m.clearBtn();
    assert.match(html, /^<button type="button" class="sf-x" data-sf-clear/);
    assert.equal(added.length, 1);
    assert.equal(added[0].id, 'sf-css');
    assert.match(added[0].textContent, /\[data-sf\]:not\(\.has\) button\.sf-x\.sf-x/);
    assert.ok(listeners.includes('click') && listeners.includes('keydown'));
    m.clearBtn();
    assert.equal(added.length, 1, 'bare én gang');
  } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
});

test('Service worker: oppstart uten nett har /api/state og /api/ui, skrivinger og andre API-er går aldri via cachen', () => {
  const sw = read('sw.js');
  const src = sw.match(/const API51_RE = (\/.+\/);/)[1];
  const re = new RegExp(src.slice(1, -1));
  for (const p of ['/api/state', '/api/ui', '/api/me', '/api/me/layout', '/api/tasks', '/api/tasks/lists']) assert.ok(re.test(p), p);
  for (const p of ['/api/state/x', '/api/users', '/api/secrets', '/api/ai/keys', '/api/backup', '/finans/api/state', '/api/login']) assert.ok(!re.test(p), p);
  assert.match(sw, /if \(req\.method !== 'GET' \|\| url\.origin !== location\.origin\) return;/);
  assert.match(sw, /res\.status === 401 \|\| res\.status === 403\) \{ caches\.delete\(API51\)/);
  assert.match(sw, /const CACHE = 'os-v(\d+)';/);
  assert.ok(Number(sw.match(/const CACHE = 'os-v(\d+)';/)[1]) >= 40);
  // starting36.js sender {type:'SKIP_WAITING'}; service workeren forsto bare strengen 'skipWaiting'.
  assert.match(sw, /e\.data === 'skipWaiting' \|\| e\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(read('js/starting36.js'), /postMessage\?\.\(\{ type: 'SKIP_WAITING' \}\)/);
});

test('Ikoner: /api/icons/sets hentes én gang, ikke én gang per ikon', () => {
  const js = read('js/icons.js');
  assert.match(js, /directP \?\?= api\('\/icons\/sets'\)/);
  assert.equal(js.split("api('/icons/sets')").length - 1, 1);
});

test('Domener og Varsler på mobil: pilleboksen og «Fra og til» brytes pent', () => {
  const css = read('css/app.css');
  assert.match(css, /\n\.dm-pills\{[^}]*flex-wrap:wrap;[^}]*border-radius:25px;/);
  assert.match(css, /@media \(max-width:520px\)\{#settings \.set-body \.sg-row:has\(>\.nf-times\)\{flex-wrap:wrap\}/);
  assert.ok(css.includes(`${DARK} .nf-times input{color-scheme:dark}`));
});

test('«Nytt i versjon»: kortet følger mørk modus', () => {
  const js = read('js/qa51.js');
  assert.ok(js.includes(`${DARK} .wn52{background:#211e18;color:#f3efe6;border-color:#3a352c}`));
  assert.ok(js.includes(`${DARK} .wn52-ok{background:#f3efe6;color:#16140f}`));
});
