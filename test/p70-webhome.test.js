// Prompt 70 (WEBHOME70): Hjem på web/PWA – mikrofonkortet i søkefeltet, scroll mens Glimt svarer, størrelse ↔ i smal visning.
// Statiske sjekker; oppførselen er sjekket i Chromium (Playwright) mot mock-serveren, se rapporten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('mikrofon-sokefelt: nytt ikon, kort i søkefeltets farge, motoren er fortsatt serveren', () => {
  const v = read('public/js/voice54.js');
  assert.match(v, /<rect x="9" y="3" width="6" height="11\.5" rx="3"\/>/, 'kapsel 6×11,5 radius 3');
  assert.match(v, /stroke-width="1\.9"/);
  assert.match(v, /f\.querySelector\('\[data-sq-ai\]'\)/, 'mellom tekstfeltet og ✦ AI');
  assert.doesNotMatch(v, /@media \(max-width:767px\)\{form\[data-search\]\.sbar button\.v54-mic\{display:none\}\}/, 'synlig på smal skjerm');
  const card = v.match(/\.v54-card\{([^}]*)\}/)?.[1] ?? '';
  for (const s of ['border-radius:26px', 'background:var(--v54-card', 'padding:16px 10px 10px 18px']) assert.ok(card.includes(s), `.v54-card mangler ${s}`);
  assert.match(v, /backgroundColor/, 'kortet tar søkefeltets farge');
  for (const s of ['data-v54-x', 'data-v54-stop', 'data-v54-send', 'data-v54-bars', 'data-v54-time', 'Snakk nå …', 'Skriver ned …']) assert.ok(v.includes(s), `mangler ${s}`);
  assert.match(v, /\.v54-card button\.v54-send\{background:#c8633f;color:#fff\}/);
  assert.match(v, /createAnalyser\(\)/, 'bølgeformen følger lydnivået');
  assert.match(v, /W\.raf = requestAnimationFrame\(\(\) => \{ W\.raf = 0;[^\n]*tick\(\)/, 'egen klokke for bølgeformen (prompt 71: skrives i et animasjonsbilde, ikke setInterval)');
  assert.match(v, /const tf = `scaleY\(/, 'bare transform per strek'); // prompt 71: skrives bare når verdien endres (el.style.transform = tf)
  assert.match(v, /el\.style\.transform = tf/, 'bare transform per strek');
  assert.match(v, /requestSubmit\(\)/, '↑ sender som Enter');
  assert.match(v, /fetch\('\/api\/voice53\/transcribe'/);
  assert.doesNotMatch(v, /SpeechRecognition/, 'ikke Web Speech (brukerens beslutning)');
  assert.match(v, /@keyframes v54in\{from\{opacity:0;transform:scaleY\(\.5\)\}/, 'overgangen animerer bare transform/opacity');
});

test('hjem-scroll-mens-ai: ingen fullskjerm-lag, trykk utenfor < 8 px, sveip fra grepet, pille', () => {
  const x = read('public/js/extras.js');
  assert.doesNotMatch(x, /function scrim\(/, 'gl-scrim er fjernet');
  assert.doesNotMatch(x, /scrim\(!!h\)/);
  assert.match(x, /function bindOutside70\(\)/);
  assert.match(x, />= 8 \|\| Math\.abs\(e\.clientY - d\.y\) >= 8/);
  assert.match(x, /if \(!d \|\| !GL\.q \|\| GL\.busy \|\| GL\.slow\) return;/, 'mens Glimt tenker lukkes kortet bare med ✕');
  assert.match(x, /closest\?\.\('\[data-gl-ans\], \[data-search\]/, 'utenfor kortet og søkefeltet');
  assert.match(x, /e\.pointerType !== 'mouse' && !grab/, 'finger: bare fra grepet');
  assert.match(x, /dy > 60 && GL\.q/, 'dra ned åpner i Chat');
  assert.match(x, /Glimt svarte/);
  const css = read('public/css/web38.css');
  assert.doesNotMatch(css, /\.gl-scrim\{/);
  assert.match(css, /\.gl-layer \.gl-ans\{[^}]*touch-action:pan-y/);
  assert.match(css, /\.gl-grab\{[^}]*height:30px;[^}]*touch-action:none/);
});

test('widget-storrelse-mobil: håndtak ↔, terskel 40 px, trykk bytter, sz lagres ved siden av order/hidden', () => {
  const h = read('public/js/home52.js');
  assert.match(h, /data-h52-rz=/);
  assert.match(h, /class="h52-rz" data-edc/);
  assert.match(h, /const FIXED = new Set\(\['p_links'\]\)/, 'Snarveier alltid full');
  assert.match(h, /h0 \? !\(Math\.abs\(dx\) > 40\) : dx < -40/);
  assert.match(h, /Math\.abs\(dx\) < 6\) \{ cur = !h0;/, 'trykk bytter');
  assert.match(h, /sz: \{ \.\.\.H\.sz \}/, 'pwa52hjem.sz lagres sammen med order og hidden');
  assert.match(h, /window\.addEventListener\('pointermove', mv\)/);
  const css = read('public/css/web52.css');
  assert.match(css, /\.h52-rz button\{width:34px;height:34px;[^}]*touch-action:none/);
});
