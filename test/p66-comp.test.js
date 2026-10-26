// Prompt 66 (prompt 50b «Fullfør utseende», UTCOMP): rad-/kortstilen gjelder alle temaer og mørk modus, modulene inni
// kortene bruker samme rad, og hver rad har ikonflis. Nettleseren er sjekket med Playwright mot mock-serveren
// (Vindu og papir, papir mørk og Nåværende; 1440 og 390 px; ingen JS-feil, ingen sidelengs scroll, knappene i modulene virker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const W65 = rd('public/css/web65.css');
const ACSS = rd('public/css/ai-control.css');
const A = rd('public/js/ai-control.js');
const SA = rd('public/js/settings-ai.js');
const IC = rd('public/js/settings-icons36.js');

test('punkt 1: kort og rad er ikke lenger bare for Papir – tokens per tema og felles regler uten html[data-hl="2c"]', () => {
  // Fargene som variabler: Nåværende (standard), Vindu og papir, papir i mørk modus, og AI-variablene inni .ac
  assert.match(W65, /#settings\{--s65-card:#111723;--s65-line:#1f2736;--s65-fld:#1a2231/);
  assert.match(W65, /html\[data-hl="2c"\] #settings\{--s65-card:#fffdf8;--s65-line:#ddd5c5;--s65-fld:#ece6da/);
  assert.match(W65, /html\[data-mode="dark"\]\[data-hl="2c"\] #settings\{--s65-card:#1f1c17;--s65-line:#3a352c/);
  assert.match(W65, /#settings \.ac\{--s65-card:var\(--card\);--s65-line:var\(--line\)/);
  // Ingen kort-/radregler som bare gjelder Papir-temaet
  assert.ok(!/html\[data-hl="2c"\] #settings \.set-body \.sg-(box|row|t)\{/.test(W65));
  // Samme mål: etikett, kort radius 14 / 0 14 px, rad 46 px, tittel 13,5/600, undertekst 12, knapp 30, bryter 36×22, felt 34
  assert.match(W65, /\.sg-t,[^{]*\{margin:0;font:500 10\.5px[^}]*letter-spacing:\.12em;color:var\(--s65-lab\)/);
  assert.match(W65, /\.sg-box,#settings \.set-body \.gs-list\{background:var\(--s65-card\);border:0;border-radius:14px;padding:0 14px/);
  assert.match(W65, /\.sg-row,#settings \.set-body \.gs-row\{min-height:46px;padding:8px 0;gap:12px/);
  assert.match(W65, /\.sg-txt b,[^{]*\{font:600 13\.5px/);
  assert.match(W65, /\.sg-btn2,[^{]*\{\s*flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;[^}]*border-radius:15px/);
  assert.match(W65, /\.sg-sw,#settings \.set-body \.gs-sw\{width:36px;height:22px/);
  assert.match(W65, /\.sg-field input:not\(\[type=range\]\)[^{]*\{\s*height:34px;padding:0 12px;border-radius:10px/);
  // Én linje med ellipsis på web (hele teksten som verktøytips)
  assert.match(W65, /@media \(min-width:768px\)\{[^}]*\.sg-row>\.sg-txt>span:first-of-type:not\(\[role\]\)[^{]*\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
  assert.match(IC, /s\.title = x/);
});

test('punkt 1: AI-siden følger temaet og lys/mørk (papir · mork · cur) og bytter farger uten ny montering', () => {
  assert.match(A, /cur: \{ bg: '#0c1119', card: '#111723', fld: '#1a2231', line: '#1f2736'/);
  assert.match(A, /export function themeKey66\(t\)/);
  assert.match(A, /h\.dataset\.hl === '2c' \? \(h\.getAttribute\('data-mode'\) === 'dark' \? 'mork' : 'papir'\) : 'cur'/);
  assert.match(A, /addEventListener\('papir-web-mode', \(\) => setTimeout\(retheme66\)\)/);
  assert.match(A, /r\.className = cls; r\.setAttribute\('style', style\)/);
  assert.match(SA, /const theme = \(\) => 'auto';/);
  assert.match(ACSS, /\.ac\.th-mork \.ac-ic,\.ac\.th-finans \.ac-ic,\.ac\.th-cur \.ac-ic\{color:var\(--mut\)\}/);
  // Overlegget og klassene UTSYS bruker er uendret
  assert.match(A, /theme: 'papir', \.\.\.o, embedded: false, onClose: close/);
  for (const c of ['.ac-r,', '.ac-card{', '.ac-lab{', '.ac-ban{', '.ac-kpis{', '.ac-seg{', '.ac-swb{', '.ac-b{']) assert.ok(ACSS.includes(c), c);
});

test('punkt 3: modulene inni kortene bruker samme rad og kontroller – ingen «→»-tekstlenker, ingen lilla fliser', () => {
  assert.match(W65, /\.sg-btn2::after\{content:none\}/);
  assert.match(W65, /button\.sg-row\[data-go\]>\.sg-btn2\{width:28px;[^}]*font-size:0/); // chevron i stedet for «Åpne →»
  // e60 (entiteter), r61 (Glimt lærer), m63 (minne), s62 (faste oppgaver), q64 (kvalitet), glimt35 (gs-*), voices57, nyheter
  for (const c of ['.e60-bar', '.r61-stats', '.r61-det', '.m63-item', '.s62-ic', '.s62-seg', '.s62-b', '.q64-b', '.q64-tile', '.gs40-jul', '.gs-opts', '.gs-seg-w', '.v57-sel', '.nw46-set']) assert.ok(W65.includes(c), c);
  assert.match(W65, /\.s62-ic,#settings \.set-body \.gs65-ic\{flex:none;width:28px;height:28px;border-radius:8px;background:var\(--s65-fld\)/);
  assert.match(W65, /\.gs-tag\{padding:0!important;border-radius:0;background:transparent!important/); // mono-tag, ingen farget pille
  assert.match(W65, /\.gs40-jul\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/); // segmentet høyrestilt i raden
  // Valgt-tilstander overlever den felles knappestilen
  assert.match(W65, /:is\(\.nf-sound\.on,\.sg-pill\.on,\.f42-chip\.on/);
  assert.match(W65, /:is\(\.e60-bar,\.s62-bar\) button\.on\{background:var\(--s65-pri\)/);
});

test('punkt 5: ikonflis på hver rad – også Glimt-radene og kalenderradene (prikken blir merke på flisen)', async () => {
  assert.match(IC, /:is\(\.gs-row,\.gs40-snd,\.gs-seg-w,\.gs-opt\):not\(\[data-si36\]\)/);
  assert.match(IC, /\.sg-row\.kal-sc:not\(\[data-si66\]\)/);
  assert.match(W65, /\.si36>\.kal-sc-dot\{position:absolute;right:-3px;bottom:-3px;width:9px;height:9px/);
  const { iconFor } = await import('../public/js/settings-icons36.js');
  assert.equal(iconFor('Les opp'), 'audio-lines');
  assert.equal(iconFor('Tempo'), 'timer');
  assert.equal(iconFor('Morgenbrief'), 'sunrise');
  assert.equal(iconFor('Julemodus'), 'sparkles');
  assert.equal(iconFor('Sted · Familie'), 'map-pin');
  assert.equal(iconFor('Abonnement · Plus'), 'repeat');
  assert.equal(iconFor('Ukerapport'), 'flask');
  // System-ikonene fra prompt 65 er uendret
  assert.equal(iconFor('Containere'), 'box');
  assert.equal(iconFor('Feature flags'), 'flag');
});
