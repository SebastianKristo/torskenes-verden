// Prompt 71 (ANIAND71, claude-code-animasjoner-jevne.md): jevne animasjoner i Android-appen.
// Kildesjekk: i filene som er rørt går animerte verdier ikke inn i Modifier.rotate( / .alpha( / .scale( / .offset(x.dp) (som leser
// verdien i komposisjonen og bygger på nytt hvert bilde), men leses i graphicsLayer { … }, offset { … } eller i tegnefasen.
// Kotlin typesjekkes utenfor npm test (stubber, $S/kt/b71ani.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/android/app');
const SRC = join(APP, 'src/main/java/no/kristo/finanshub');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Filene prompt 71 har rørt (animasjoner). */
const TOUCHED = [
  'ui/Anim71.kt', 'ui/Home70.kt', 'ui/Paper15.kt', 'ui/Paper14.kt', 'ui/Paper16.kt', 'ui/Vaer41.kt', 'ui/Weather39.kt', 'ui/Weather22.kt',
  'ui/Glimt31.kt', 'ui/Glimt43.kt', 'ui/Glimt36.kt', 'ui/Mic70.kt', 'ui/Convo67Ui.kt', 'ui/Chat27Ui.kt', 'ui/Voice56Ui.kt', 'ui/Ui38.kt',
  'ui/Ui46.kt', 'ui/Ui34.kt', 'ui/Ui52B.kt', 'ui/Brief35.kt', 'ui/Tasks37.kt', 'ui/AiCtl34.kt',
];

/** Navn på animerte verdier i fila (State/Animatable/delegater fra animasjonsmotoren, klokker og vugging). */
function animatedNames(src) {
  const names = new Set();
  const re = /\b(?:val|var)\s+(\w+)\s*(?::[^=\n]*)?(?:by|=)\s*([^\n]*)/g;
  for (const m of src.matchAll(re)) {
    if (/animate\w*\(|animate\w*AsState\(|Animatable\(|rememberInfiniteTransition\(|wobble71\(|wobbleAngle\(|clock36\(/.test(m[2])) names.add(m[1]);
  }
  // Delegater/lambdaer som regnes ut fra en klokke (Glimt36: bob/scan/ham/dip/cyc).
  for (const m of src.matchAll(/\bval\s+(\w+)\s*:\s*\(\)\s*->\s*Float\s*=/g)) names.add(m[1]);
  return names;
}

/** Argumentet til et kall som begynner ved indeks i (parentes-balansert). */
function argAt(src, i) {
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '(') d++;
    else if (src[j] === ')') { d--; if (d === 0) return src.slice(i + 1, j); }
  }
  return '';
}

test('animerte verdier går ikke inn i rotate/alpha/scale/offset(x.dp) i filene som er rørt', () => {
  const bad = [];
  for (const f of TOUCHED) {
    const src = code(f);
    const names = animatedNames(src);
    if (!names.size) continue;
    for (const m of src.matchAll(/\.(rotate|alpha|scale|offset)\s*\(/g)) {
      const open = m.index + m[0].length - 1;
      const arg = argAt(src, open);
      if (m[1] === 'offset' && /^\s*\{/.test(src.slice(open + 1))) continue; // offset-lambdaen er riktig
      for (const n of names) {
        if (new RegExp(`\\b${n}\\b`).test(arg)) bad.push(`${f}: .${m[1]}(${arg.trim().slice(0, 60)})`);
      }
    }
  }
  assert.deepEqual(bad, [], 'animerte verdier skal leses i graphicsLayer { } / offset { } / tegnefasen');
});

test('wiggle: vinkelen er State og leses i graphicsLayer (Hjem, Tilpass siden, Vær, Ruter)', () => {
  const a = code('ui/Anim71.kt');
  assert.match(a, /internal fun wobble71\(on: Boolean, index: Int, amp: Float = 0\.2f\): State<Float>/);
  assert.match(a, /tween\(300, easing = FastOutSlowInEasing\), RepeatMode\.Reverse/, 'samme kurve og varighet som før');
  const h = code('ui/Home70.kt');
  assert.match(h, /val angle = wobble71\(edit && !dragging && !sheet && !reduce, index, 0\.45f\)/);
  assert.match(h, /\} else rotationZ = angle\.value/);
  assert.match(h, /remember\(vis, sz\) \{ rows70\(vis, sz\) \}/, 'radene huskes');
  assert.match(code('ui/Paper15.kt'), /rotationZ = angle\.value; translationY/);
  assert.match(code('ui/Vaer41.kt'), /graphicsLayer \{ rotationZ = angle\.value \}/);
  assert.match(code('ui/Weather39.kt'), /rotationZ = angle\.value/);
  assert.match(code('ui/Paper16.kt'), /rotationZ = angle\.value \* 3f/);
  for (const f of ['ui/Home70.kt', 'ui/Paper15.kt', 'ui/Vaer41.kt', 'ui/Weather39.kt', 'ui/Paper16.kt']) {
    assert.doesNotMatch(code(f).replace(/internal fun wobbleAngle[^\n]*/, ''), /wobbleAngle\(/, `${f} bruker wobble71`);
  }
});

test('Glimt-orben og -merket: ringen er et ferdig lag som roteres (rememberInfiniteTransition + graphicsLayer)', () => {
  const o = code('ui/Glimt43.kt');
  assert.match(o, /rememberInfiniteTransition\(label = "orb43"\)/);
  assert.match(o, /Canvas\(Modifier\.matchParentSize\(\)\.graphicsLayer \{ rotationZ = deg \}\)/);
  assert.doesNotMatch(o, /rotate\(deg/);
  const m = code('ui/Glimt31.kt');
  assert.match(m, /if \(!done\) Canvas\(Modifier\.matchParentSize\(\)\.graphicsLayer \{ rotationZ = if \(reduce\) 0f else rot \}\)/);
  assert.doesNotMatch(m, /rotate\(if \(reduce\) 0f else rot/);
  assert.match(code('ui/Ui46.kt'), /rotate\(110f \+ \(spin\?\.value \?: 0f\)\)/, 'profilringen leser vinkelen i drawBehind');
});

test('Glimt-svaret og mikrofonen: dra, inngang, prikker, markør og bølge uten rekomponering hvert bilde', () => {
  const u = code('ui/Ui38.kt');
  const box = u.slice(u.indexOf('fun AnsBox38'));
  assert.match(box, /derivedStateOf \{ if \(hasPull41 && drag > 0f\)/, 'pull41 er derivedStateOf');
  assert.match(box, /size\(80\.dp, 4\.dp\)\.drawBehind \{/, 'håndtaket tegnes i tegnefasen');
  const g = code('ui/Glimt31.kt');
  assert.match(g, /Modifier\.offset \{ IntOffset\(0, \(-3 \* v\)\.dp\.roundToPx\(\)\) \}/);
  assert.match(g, /val g = grow\.value; scaleX = g; scaleY = g/);
  assert.match(code('ui/Mic70.kt'), /graphicsLayer \{ alpha = if \(\(a\?\.value \?: 1f\) > \.5f\) 1f else 0f \}/);
  const a = code('ui/Anim71.kt');
  assert.match(a, /internal fun WaveBars71\(level: Float, color: Color, label: String\)/);
  assert.match(a, /drawRoundRect\(color/);
  assert.match(code('ui/Chat27Ui.kt'), /private fun Ch27Wave\(rms: Float\) = WaveBars71\(rms, CH27_SKY, "wave"\)/);
  assert.match(code('ui/Voice56Ui.kt'), /internal fun Wave56\(level: Float, color: Color\) = WaveBars71\(level, color, "w56"\)/);
  assert.doesNotMatch(code('ui/Brief35.kt'), /fillMaxHeight\(v\.value\)/);
});

test('stabile typer for Hjem-radene', () => {
  assert.match(read('Models15.kt'), /@androidx\.compose\.runtime\.Immutable[^\n]*\ndata class PageLay\(/);
  assert.match(read('ui/Paper15.kt'), /@androidx\.compose\.runtime\.Immutable[^\n]*\ndata class PSec\(/);
  const h = read('ui/Home70.kt');
  assert.match(h, /@Immutable\ninternal sealed class Row70\(/);
  assert.match(h, /@Stable\ninternal class Home70State \{/);
});

test('Baseline Profile: profileinstaller uten ny Gradle-plugin, baseline-prof.txt for Hjem, Chat og ark', () => {
  const g = readFileSync(join(APP, 'build.gradle.kts'), 'utf8');
  assert.match(g, /implementation\("androidx\.profileinstaller:profileinstaller:1\.4\.1"\)/);
  assert.doesNotMatch(g, /baselineprofile/i, 'ingen baselineprofile-plugin (krever emulator/Macrobenchmark)');
  const f = join(APP, 'src/main/baseline-prof.txt');
  assert.ok(existsSync(f));
  const p = readFileSync(f, 'utf8');
  for (const c of ['MainActivity', 'ui/Home70Kt', 'ui/PaperKt', 'ui/Glimt31Kt', 'ui/Ui38Kt', 'ui/Chat27UiKt', 'androidx/compose/material3/ModalBottomSheet']) {
    assert.match(p, new RegExp(`^HSPL[\\w/]*${c.replace(/\//g, '\\/')}\\*;->\\*\\*\\(\\*\\*\\)\\*\\*$`, 'm'), c);
  }
  // Hver regel er på formen HSPL<klasse>*;->**(**)** eller L<klasse>*; (kommentarer med #).
  for (const l of p.split('\n').filter((x) => x && !x.startsWith('#'))) assert.match(l, /^(HSPL[\w/$]+\*;->\*\*\(\*\*\)\*\*|L[\w/$]+\*;)$/, l);
});
