// Prompt 74 (G74AND): Android – hold inne i Glimt-søkefeltet/svaret gir tekstmarkering (ikke wiggle), og scroll lukker aldri Glimt-svaret.
// Kotlin typesjekkes utenfor npm test (stubber); her er kildesjekker og de rene reglene oversatt til JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Speiler tapOk74 / wiggleHold74 / swipeClose74 i Kotlin.
const tapOk = (path, slop, ms, many, fling, scrolled) => path < slop && ms >= 0 && ms < 500 && !many && !fling && !scrolled;
const wiggleHold = (edit, hold, inSearch) => edit || (hold && !inSearch);
const swipeClose = (up, speed, minPx, minV) => up > minPx && speed > minV;

test('wiggle: Søk-widgeten (h1) har hold = false, og søkefelt/svar sjekkes i tillegg', () => {
  assert.match(code('ui/Paper.kt'), /PSec\("h1", "Søk", full = true, hold = false\)/);
  const h = code('ui/Home70.kt');
  assert.match(h, /if \(!wiggleHold74\(edit, key in hold, Ans70\.searchRect\?\.contains\(pt\) == true \|\| vm\.p38\.ansRect\?\.contains\(pt\) == true\)\) return@awaitEachGesture/);
  assert.match(h, /internal fun wiggleHold74\(edit: Boolean, hold: Boolean, inSearch: Boolean\): Boolean = edit \|\| \(hold && !inSearch\)/);
  // Gesten konsumerer ikke berøringen før wiggle faktisk starter (TextField får det lange trykket).
  const g = h.slice(h.indexOf('fun Modifier.homeGesture70'), h.indexOf('Haptics.tap(); vm.editPage = PAGE70'));
  assert.doesNotMatch(g, /consume\(\)/);
  assert.equal(wiggleHold(false, false, false), false, 'h1 (hold = false) starter aldri wiggle');
  assert.equal(wiggleHold(false, true, true), false, 'i søkefeltet/svaret: aldri wiggle');
  assert.equal(wiggleHold(false, true, false), true, 'annen flis: wiggle');
  assert.equal(wiggleHold(true, false, true), true, 'i wiggle kan Søk flyttes');
  // EditWrap (rutenettet uten fliser og Fold) bruker sec.hold – ingen holdDrag37 for h1.
  assert.match(code('ui/Paper15.kt'), /\.holdDrag37\(sec\.hold \|\| edit,/);
});

test('tekstmarkering: svaret og opptakskortet ligger i SelectionContainer, søkefeltets ramme ryddes', () => {
  assert.match(code('ui/Glimt31.kt'), /else androidx\.compose\.foundation\.text\.selection\.SelectionContainer \{ Text\(\s*buildAnnotatedString \{\s*boldParts31\(a\.text\)/);
  assert.match(code('ui/Mic70.kt'), /SelectionContainer\(Modifier\.weight\(1f, fill = false\)\) \{ Text\(/);
  assert.match(code('ui/Home29Ui.kt'), /DisposableEffect\(Unit\) \{ onDispose \{ Ans70\.searchRect = null \} \}/);
});

test('trykk utenfor: bare et ekte trykk lukker (bevegelse, tid, scroll, fling)', () => {
  const h = code('ui/Home70.kt');
  const t = h.slice(h.indexOf('fun Modifier.ansTapOutside70'), h.indexOf('internal fun tapOk74'));
  assert.match(t, /awaitPointerEvent\(PointerEventPass\.Final\)/, 'Final-passet ser om scroll konsumerte');
  assert.match(t, /path \+= ch\.positionChangeIgnoreConsumed\(\)\.getDistance\(\)/, 'total bevegelse, ikke bare avstand fra ned');
  assert.match(t, /val fling = Ans70\.scrolling\(\)/, 'trykk som stopper en fling lukker ikke');
  assert.match(t, /Ans70\.scrollY\(\) != y0/, 'scrollposisjonen sammenlignes mellom ned og opp');
  assert.match(t, /tapOk74\(path, viewConfiguration\.touchSlop, upAt - down\.uptimeMillis, many, fling, moved\)/);
  assert.match(t, /if \(a\.busy \|\| overlays52\(vm\) > 0\) return@awaitEachGesture/, 'svaret må være ferdig');
  assert.match(t, /vm\.p38\.ansRect\?\.contains\(pt\) == true \|\| Ans70\.searchRect\?\.contains\(pt\) == true/);
  assert.doesNotMatch(t, /consume\(\)/, 'trykket går videre');
  assert.match(h, /DisposableEffect\(scroll\) \{ Ans70\.scroll = scroll; onDispose/);
  const slop = 21; // 8 dp på 2,625×
  assert.equal(tapOk(3, slop, 120, false, false, false), true, 'rent trykk lukker');
  for (const px of [15, 40, 200]) assert.equal(tapOk(px, slop, 200, false, false, true), false, `scroll ${px} px lukker ikke`);
  assert.equal(tapOk(25, slop, 150, false, false, false), false, 'over slop totalt (frem og tilbake) lukker ikke');
  assert.equal(tapOk(2, slop, 90, false, true, false), false, 'trykk som stopper fling lukker ikke');
  assert.equal(tapOk(2, slop, 90, false, false, true), false, 'siden scrollet mellom ned og opp');
  assert.equal(tapOk(2, slop, 800, false, false, false), false, 'langt trykk er ikke trykk');
  assert.equal(tapOk(2, slop, 90, true, false, false), false, 'to fingre');
});

test('sveip opp lukker bare fra grepet, over 60 dp og raskt', () => {
  const u = code('ui/Ui38.kt');
  const box = u.slice(u.indexOf('fun AnsBox38'));
  assert.match(box, /gripHit70\(down\.type, down\.position\.y, size\.height, gripPx\)/);
  assert.match(box, /swipeClose74\(-drag, -vy, 60\.dp\.toPx\(\), 600\.dp\.toPx\(\)\)/);
  assert.doesNotMatch(box, /else if \(-drag > limit\)/);
  assert.match(u, /internal fun swipeClose74\(up: Float, speed: Float, minPx: Float, minV: Float\): Boolean = up > minPx && speed > minV/);
  const d = 2.625;
  assert.equal(swipeClose(70 * d, 1200 * d, 60 * d, 600 * d), true);
  assert.equal(swipeClose(50 * d, 2000 * d, 60 * d, 600 * d), false, 'for kort');
  assert.equal(swipeClose(120 * d, 200 * d, 60 * d, 600 * d), false, 'for sakte');
});
