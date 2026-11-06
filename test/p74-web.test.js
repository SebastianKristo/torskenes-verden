// Prompt 74 (G74WEB): Glimt på Hjem i web/PWA – hold inne i søkefeltet/svarkortet/opptakskortet starter aldri redigering (wiggle),
// og scroll lukker aldri Glimt-svaret (bare et ekte trykk utenfor, eller rask sveip opp > 60 px fra grepet).
// Statiske sjekker; oppførselen er sjekket i Chromium (Playwright, touch, 390 px) mot mock-serveren på port 4796, se rapporten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('hold inne: aldri wiggle fra søkefeltet, Glimt-svaret eller opptakskortet', () => {
  const h = read('public/js/home52.js');
  assert.match(h, /function noWiggle74\(e\)/);
  const z = h.match(/const GLZ74 = '([^']+)'/)?.[1] ?? '';
  for (const s of ['form[data-search]', '#gl-layer', '[data-gl-ans]', '[data-v54-card]']) assert.ok(z.includes(s), `GLZ74 mangler ${s}`);
  assert.match(h, /if \(!H\.edit && noWiggle74\(e\)\) return;/, 'sjekkes ved pointerdown');
  assert.match(h, /noWiggle74\(\{ target: it, clientX: start\.x, clientY: start\.y \}\)/, 'og på nytt når tiden er ute');
  assert.match(h, /isField74\(document\.activeElement\)/, 'ikke når et tekstfelt har fokus (tastaturet)');
  assert.match(h, /getBoundingClientRect\(\)/, 'punktet sjekkes mot kortene (svarkortet ligger over flisene)');
  assert.match(h, /addEventListener\('scroll', \(\) => \{ if \(hold\) stopHold\(\); \}/, 'scroll avbryter hold inne');
  assert.match(h, /addEventListener\('selectionchange'/, 'tekstmarkering avbryter hold inne');
  const css = read('public/css/web38.css');
  assert.match(css, /\.gl-layer \.gl-ans\{[^}]*-webkit-user-select:text;user-select:text;-webkit-touch-callout:default/, 'svaret kan markeres (Safari)');
  assert.match(read('public/js/voice54.js'), /\.v54-card\{[^}]*-webkit-user-select:text;user-select:text;-webkit-touch-callout:default\}/, 'opptakskortet kan markeres');
});

test('trykk utenfor: bare ekte trykk lukker, scroll aldri', () => {
  const x = read('public/js/extras.js');
  assert.match(x, /const TAP_PX74 = 10, TAP_MS74 = 500, FLING_MS74 = 150;/);
  assert.match(x, /d\.max = Math\.max\(d\.max, Math\.hypot\(/, 'total bevegelse i hele berøringen, ikke bare sluttpunktet');
  assert.match(x, /document\.addEventListener\('scroll', moved, \{ capture: true, passive: true \}\)/, 'scroll mellom ned og opp');
  assert.match(x, /scrollPos74\(\) !== d\.pos/, 'endret scrollposisjon');
  assert.match(x, /now\(\) - lastScroll74 < FLING_MS74/, 'trykk som stopper en fart-scroll');
  assert.match(x, /isField74\(document\.activeElement\)/, 'trykk som bare legger bort tastaturet');
  assert.match(x, /visualViewport\?\.addEventListener\('resize'/, 'tastaturet åpnes/lukkes');
  assert.match(x, /addEventListener\('pointercancel', \(e\) => \{ if \(outDown\?\.id === e\.pointerId\) outDown = null; \}/, 'pointercancel er aldri et trykk');
  assert.match(x, /if \(!GL\.q \|\| GL\.busy \|\| GL\.slow \|\| d\.bad\) return;/, 'bare når svaret er ferdig');
  assert.match(x, /inGlimt74\(e\.clientX, e\.clientY\) \|\| inGlimt74\(d\.x, d\.y\)/, 'utenfor kortet og søkefeltet');
  assert.doesNotMatch(x, />= 8 \|\| Math\.abs\(e\.clientY - d\.y\) >= 8/, 'den gamle sjekken per akse er borte');
});

test('sveip opp lukker bare fra grepet: > 60 px og raskt', () => {
  const x = read('public/js/extras.js');
  assert.match(x, /if \(!e\.target\.closest\('\.gl-grab'\)\) return;/, 'bare grepet, også med mus');
  assert.match(x, /if \(dy < -60 && \(-dy \/ dt >= 0\.3 \|\| dt < 300\)\)/);
  assert.doesNotMatch(x, /if \(dy < -40\)/);
  assert.match(x, /el\.addEventListener\('pointercancel', \(\) => \{ if \(!st\) return; st = null;/, 'avbrutt sveip lukker ikke');
});
