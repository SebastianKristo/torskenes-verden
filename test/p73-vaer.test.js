// Prompt 73 (VAER73): Vær på web, iOS og Android – kildesjekker.
//  - claude-code-vaer-fjern-posisjonskort-dagtrykk.md: ingen «MIN POSISJON»-boks over heroen; trykk på en dag åpner dagsarket.
//  - claude-code-vaer-lukk-x.md: én felles lukkeknapp (✕) per plattform i alle ark.
//  - claude-code-vaer-pille-strek-android.md: glansen i modus-pillen ligger inni pillen, ingen egen strek og ingen elevation.
// Kotlin typesjekkes utenfor npm test (stubber), Swift har ingen kompilator her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
const IOS = join(ROOT, 'apps/ios/FinansHub/Sources');
const rd = (p) => readFileSync(p, 'utf8');
/** Kode uten kommentarer (Kotlin/Swift/JS). */
const code = (p) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const kt = (f) => code(join(AND, f));
const sw = (f) => code(join(IOS, f));
const web = (f) => code(join(ROOT, 'public', f));

/* ---------------- 1. Posisjonsboksen er borte ---------------- */

test('Android: HereCard45 brukes ikke lenger på værsiden', () => {
  assert.doesNotMatch(kt('ui/Weather15.kt'), /HereCard45\(/);
});

test('Android: heroen sier «MIN POSISJON» bare når Min posisjon er valgt', () => {
  const s = kt('ui/Weather15.kt');
  assert.match(s, /private fun Header\(w: WeatherFull, mine: Boolean, modifier: Modifier\)/);
  assert.match(s, /if \(mine \|\| w\.placeId == "pos" \|\| w\.placeId == "__gps"\) "MIN POSISJON" else "VÆRET I"/);
  assert.equal((s.match(/Header\(w, vm\.wxGps46\(\)/g) ?? []).length, 2, 'både telefon og Fold sender valget inn');
});

test('iOS: Vaer45HereCard vises ikke på værsiden', () => {
  assert.doesNotMatch(sw('PaperWeather.swift'), /Vaer45HereCard\(\)/);
});

test('PWA: hereCard er tatt ut av Vær-hovedsiden, Min posisjon finnes fortsatt i Steder', () => {
  const s = web('finans/js/mobile-wx.js');
  assert.doesNotMatch(s, /hereCard\?\.\(/);
  assert.doesNotMatch(s, /hereLabel\?\.\(/, 'uten kortet lastes ikke HERE, så etiketten kan ikke komme derfra');
  assert.match(s, /p46-me/, 'Min posisjon-raden i stedsvelgeren');
});

/* ---------------- 2. Trykk på en dag ---------------- */

test('Android: dagradene er én trykkflate (min. 44 dp) med terskel, haptikk og skjermleser-klikk', () => {
  const t = kt('ui/Vaer73.kt');
  assert.match(t, /internal fun Modifier\.wxDayTap73\(label: String, onTap: \(\) -> Unit\): Modifier/);
  assert.match(t, /awaitFirstDown\(requireUnconsumed = false, pass = PointerEventPass\.Initial\)/, 'ingen forelder kan spise ned-trykket');
  assert.match(t, /10\.dp\.toPx\(\)/, 'terskel 10 dp før det regnes som scroll');
  assert.match(t, /!moved && !ch\.isConsumed/, 'rulling og slipp åpner ikke en dag');
  assert.match(t, /< 550/, 'hold inne er «Rediger kort», ikke dagstrykk');
  assert.match(t, /Haptics\.select\(\); onTap\(\)/);
  assert.match(t, /onClick\(label = "Åpne \$label"\)/);
  assert.doesNotMatch(t, /\.consume\(\)/, 'trykket konsumerer ikke noe (scroll virker som før)');
  for (const f of ['ui/Weather15.kt', 'ui/Weather32b.kt']) {
    const s = kt(f);
    assert.match(s, /heightIn\(min = 44\.dp\)\.wxDayTap73\(lbl\) \{ open\(k\) \}/, f);
    assert.doesNotMatch(s, /\.clickable \{ open\(k\) \}/, f);
  }
  assert.doesNotMatch(kt('ui/Weather15.kt'), /Platform|Build\.VERSION.*weatherSheetDay/, 'ingen plattformsperre');
  assert.match(kt('ui/Weather15.kt'), /ForholdSheet\(w, d, \{ vm\.weatherSheetDay = it \}\)/);
});

test('Android: lista har luft under de flytende knappene, og bunnlinja fanger bare trykk på knappene', () => {
  assert.match(kt('ui/Weather15.kt'), /bottom \+ WX_BAR28 \+ 16\.dp/);
  const b = kt('ui/Weather28.kt');
  const bar = b.slice(b.indexOf('fun WxBottomBar28'), b.indexOf('private fun WxBarBtn28'));
  assert.doesNotMatch(bar, /clickable|pointerInput/, 'raden rundt knappene tar ikke trykk');
});

test('PWA: dagradene er knapper (data-wx="day") og gir haptikk', () => {
  const s = web('finans/js/mobile-wx.js');
  assert.match(s, /<button class="vx-d" data-wx="day"/);
  assert.match(s, /k === 'day'\) \{ WX\.sh = \+x\.dataset\.i; haptic\('tap'\); \}/);
});

/* ---------------- 3. Felles ✕ ---------------- */

test('Android: én VaerCloseButton (42 dp, 44 dp trykkflate), ingen egne varianter eller «Ferdig» i arkene', () => {
  const u = kt('ui/Ui40.kt');
  assert.match(u, /internal fun VaerCloseButton\(dark: Boolean = false, onClick: \(\) -> Unit\)/);
  assert.match(u, /Modifier\.size\(44\.dp\)/);
  assert.match(u, /size\(42\.dp\)\.clip\(CircleShape\)\.background\(if \(dark\) Color\(0x9E0A1423\) else Color\.White\.copy\(alpha = \.22f\)\)/);
  assert.match(kt('ui/Weather32b.kt'), /internal fun WxClose32b\(onClick: \(\) -> Unit\) = VaerCloseButton\(onClick = onClick\)/);
  const w22 = kt('ui/Weather22.kt');
  assert.doesNotMatch(w22, /SheetButton30\("Ferdig"/);
  assert.match(w22, /VaerCloseButton\(dark = true, onClick = close\)/, 'kartet: mørk glass');
  assert.match(w22, /VaerCloseButton\(onClick = onClose\)/, 'detaljarkene');
  assert.match(kt('ui/Weather39.kt'), /else VaerCloseButton \{ close\(\) \}/, 'Yr mot Storm: ✕, «Ferdig» bare ved redigering');
  assert.match(kt('ui/Weather15.kt'), /VaerCloseButton \{ Haptics\.back\(\); vm\.weatherOpen = false \}/);
});

test('iOS: én felles VaerCloseButton brukes i hovedsiden, arkene, Steder, kartet og Yr mot Storm', () => {
  assert.equal((sw('Vaer40.swift').match(/struct VaerCloseButton: View/g) ?? []).length, 1);
  assert.match(sw('Weather22Cards.swift'), /VaerCloseButton \{ store\.weatherOpen = false \}/);
  assert.match(sw('Weather22Sheets.swift'), /VaerCloseButton \{/);
  assert.match(sw('Weather22Places.swift'), /VaerCloseButton \{ dismiss\(\) \}/);
  assert.match(sw('Weather22Places.swift'), /VaerCloseButton\(dark: true\) \{ dismiss\(\) \}/);
  assert.match(sw('WxCmp39.swift'), /VaerCloseButton \{ close\(\) \}/);
});

test('Web: én vaerCloseButton – hovedsiden, alle ark, Steder, Yr mot Storm og kartet', () => {
  const s = web('js/weather-page.js');
  assert.match(s, /export const vaerCloseButton = \(attrs, dark = false\) =>/);
  assert.match(s, /stroke-width="2\.8" stroke-linecap="round"/);
  assert.match(s, /aria-label="Lukk"/);
  assert.match(s, /const doneBtn = xBtn;/, '«Ferdig» i Steder og Yr mot Storm er byttet til ✕');
  assert.doesNotMatch(s, /class="wxp-x"/, 'ingen liten mørk «×»');
  assert.doesNotMatch(s, /data-wx-close="mp">Ferdig/, 'kartet har ikke «Ferdig»');
  assert.match(s, /\$\{xBtn\('mp', true\)\}/, 'kartet: mørk glass');
  assert.match(s, /\$\{vaerCloseButton\('data-wx="close"'\)\}/, 'hovedsiden bruker samme knapp');
  const c = rd(join(ROOT, 'public/css/weather.css'));
  assert.match(c, /\.wxp-close\{flex:none;width:42px;height:42px;[^}]*background:rgba\(255,255,255,\.22\);[^}]*blur\(12px\)/);
  assert.match(c, /\.wxp-close\.dk\{background:rgba\(10,20,35,\.62\)\}/);
  assert.match(c, /\.wxp-close::after\{content:'';position:absolute;inset:-1px/, 'trykkflate 44 px');
  assert.match(code(join(ROOT, 'public/js/weather-cmp39.js')), /data-c39-done>Ferdig<\/button>' : h\.done/, 'Yr mot Storm: «Ferdig» bare under redigering');
});

test('PWA: alle Vær-ark bruker samme ✕ (w32-x, 42 px), mørk over kartet', () => {
  const a = web('finans/js/mobile-wx.js'), b = web('finans/js/mobile-wx22.js');
  assert.match(a, /class="w32-x" data-wx="back"/);
  assert.match(a, /class="w32-x" data-wx="shx" aria-label="Lukk"/);
  assert.match(b, /class="w32-x p40-dk" data-wx2="mapx"/);
  assert.match(b, /class="w32-x p40-dk" data-wx2="plx"/);
  assert.match(b, /class="w32-x" data-wx2="msx"/);
});

/* ---------------- 4. Pille-streken på Android ---------------- */

test('Android: modus-pillen har glansen inni, hårfin kant og ingen skygge/strek', () => {
  const u = kt('ui/Ui46.kt');
  const seg = u.slice(u.indexOf('fun LiquidSeg46'), u.indexOf('fun TripLocNote46'));
  assert.match(seg, /\.graphicsLayer \{ scaleX = 1f \+ \.18f \* st; scaleY = 1f - \.12f \* st \}\s*\.vaerPillGlass73\(\)/, 'glansen skalerer med pillen');
  assert.doesNotMatch(seg, /\.shadow\(/, 'ingen elevation/skygge');
  assert.doesNotMatch(seg, /drawLine\(/, 'ingen egen strek');
  const v = kt('ui/Vaer73.kt');
  const g = v.slice(v.indexOf('fun Modifier.vaerPillGlass73'));
  assert.match(g, /\.clip\(CircleShape\)/);
  assert.match(g, /Color\.White\.copy\(alpha = \.34f\), Color\.White\.copy\(alpha = \.16f\)/);
  assert.match(g, /6\.dp\.toPx\(\)/);
  assert.match(g, /Color\.White\.copy\(alpha = \.55f\), 1f to Color\.Transparent/);
  assert.match(g, /\.border\(0\.5\.dp, Color\.White\.copy\(alpha = \.25f\), CircleShape\)/);
  assert.doesNotMatch(g, /shadow|drawLine/);
  assert.ok(g.indexOf('.clip(CircleShape)') < g.indexOf('drawWithContent'), 'glansen tegnes innenfor klippet');
});
