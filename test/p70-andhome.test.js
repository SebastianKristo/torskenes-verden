// Prompt 70 (ANDHOME70): Android Hjem – flishøyde, wiggle-flytting, størrelse ↔, scroll mens Glimt svarer, nytt mikrofon-UI.
// Kotlin typesjekkes utenfor npm test (stubber); her er kildesjekker av det som er lett å ødelegge igjen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('flishøyde: Hjem på telefon er et eget rutenett uten fast høyde', () => {
  const p = code('ui/Paper.kt');
  assert.match(p, /if \(g52\) \{ HomeColumn70\(/, 'telefonens 2-kolonners Hjem bruker Home70');
  const h = code('ui/Home70.kt');
  assert.doesNotMatch(h, /LazyVerticalGrid|aspectRatio/);
  assert.match(h, /verticalScroll\(scroll, enabled = st\.dragKey == null\)/, 'scroll av mens et kort er løftet');
  assert.match(h, /Arrangement\.spacedBy\(GAP70\)/);
  assert.match(h, /private val GAP70 = 12\.dp/);
  assert.match(h, /minIntrinsicHeight\(cw\)/, 'raden får høyden til det høyeste kortet');
  assert.match(h, /Constraints\.fixed\(cw, h\)/);
  assert.match(h, /PairRow70\([^\n]*212\.dp/, 'Avgang minst 212 dp');
  assert.match(h, /Tile52\(vm, k, Dp\.Unspecified, body\)/);
  const t = code('ui/Ui52B.kt');
  assert.match(t, /if \(h == Dp\.Unspecified\) Modifier\.fillMaxWidth\(\)\.fillMaxHeight\(\)/);
  assert.match(code('ui/Tiles50.kt'), /\.padding\(16\.dp, if \(pad\) 16\.dp else 14\.dp\)/, '16 dp sider, 14 dp topp/bunn');
});

test('wiggle: gesten ligger på beholderen, løft etter 0,3 s, live flytting og lagring ved slipp', () => {
  const h = code('ui/Home70.kt');
  assert.match(h, /\.homeGesture70\(vm, st, holdOk\)/);
  assert.match(h, /withTimeoutOrNull\(if \(edit\) 300L else 500L\)/);
  assert.match(h, /positionChangeIgnoreConsumed\(\)/, 'bevegelsen leses før consume');
  assert.match(h, /vm\.movePageTo70\(PAGE70, st\.keys, k, t, live = true\)/);
  assert.match(h, /finally \{\s*st\.dragKey = null[\s\S]*?vm\.wiggleEnd37\(PAGE70\)/, 'slipp og avbrudd lagrer og rydder');
  assert.match(h, /val zone = 80f \* dens/, 'autoscroll 80 dp fra kanten');
  assert.match(h, /scaleX = 1\.03f/);
  const vm = code('AppViewModel.kt');
  assert.match(vm, /fun movePageTo70\(/);
  assert.match(vm, /order\.removeAt\(a\); order\.add\(b, key\)/);
});

test('størrelse ↔: sz lagres i pages.hjem og beholdes ved flytting/skjuling', () => {
  const m = code('Models15.kt');
  assert.match(m, /val sz: Map<String, String> = emptyMap\(\)/);
  assert.match(m, /o\.put\("sz", JSONObject\(sz\)\)/);
  assert.match(m, /parseSz70\(v\.optJSONObject\("sz"\)\)/);
  const vm = code('AppViewModel.kt');
  assert.match(vm, /fun setPageSz70\(/);
  assert.equal((vm.match(/pageLayouts\[page\]\?\.sz \?: emptyMap\(\)/g) || []).length >= 5, true, 'flytt/skjul/vis beholder sz');
  const h = code('ui/Home70.kt');
  assert.match(h, /private fun fixedFull70\(k: String\) = k == "h1" \|\| k == "h4"/, 'Søk og Snarveier alltid fulle');
  assert.match(h, /if \(!full0\) acc\.getDistance\(\) > lim/, 'halv → full > 40 dp uansett retning');
  assert.match(h, /acc\.x < -lim/, 'full → halv mot venstre');
  assert.match(h, /if \(!moved\) \{ cur = !full0/, 'trykk bytter');
});

test('scroll mens Glimt svarer: ikke noe lag over Hjem, sveip bare fra grepet', () => {
  const p = code('ui/Paper.kt');
  assert.doesNotMatch(p, /AnsScrim38\(vm\)/);
  assert.match(p, /\.ansTapOutside70\(vm\)/);
  const u = code('ui/Ui38.kt');
  const box = u.slice(u.indexOf('fun AnsBox38'));
  assert.doesNotMatch(box.slice(0, box.indexOf('Column {')), /detectVerticalDragGestures/);
  assert.match(box, /gripHit70\(down\.type, down\.position\.y, size\.height, gripPx\)/);
  const h = code('ui/Home70.kt');
  assert.match(h, /if \(a\.busy \|\| overlays52\(vm\) > 0\) return@awaitEachGesture/, 'mens Glimt tenker lukkes kortet bare med ✕');
  assert.match(h, /"Glimt svarte ↑"/);
});

test('mikrofon: nytt ikon og opptakskort, motoren er fortsatt Voice56 (serveren)', () => {
  const s = code('ui/Home29Ui.kt');
  assert.match(s, /SearchMic70\(vm\)/);
  assert.doesNotMatch(s, /SearchMic56\(vm\)/);
  assert.match(s, /if \(mic70\) Box\(Modifier\.searchRect70\(\)\) \{ MicCard70\(vm\) \}/);
  const m = code('ui/Mic70.kt');
  assert.match(m, /"Snakk nå …"/);
  assert.match(m, /"Skriver ned …"/);
  assert.match(m, /v\.partial\.takeIf \{ v\.onDevice && it\.isNotBlank\(\) \}/, 'live tekst bare med motoren på telefonen');
  assert.match(m, /Color\(0xFFC8633F\)/);
  assert.match(m, /delay\(90\)/, 'bølgeformen har egen timer');
  assert.doesNotMatch(m, /MIC56_ON/, 'ingen rød knapp');
  const v = code('Voice56.kt');
  assert.match(v, /if \(Voice56\.autoSend\) \{ Voice56\.autoSend = false; Voice56\.sendTick\+\+ \}/);
  assert.match(v, /upload\("\/voice53\/transcribe"/, 'serveren skriver ned som før');
});
