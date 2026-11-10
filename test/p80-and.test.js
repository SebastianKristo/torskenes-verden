// Prompt 80 (AND80, pakke 56): Android Hjem – ingen firkantet skygge bak søkepillen (A), og faste flishøyder 101 / 212 dp (B).
// Ingen Kotlin-kompilator i oppsettet: kildesjekker av det som er lett å ødelegge igjen, og høydereglene oversatt til JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Teksten i funksjonen [name] (fra signaturen til neste toppnivå-deklarasjon). */
function fn(src, name) {
  const i = src.indexOf(`fun ${name}(`);
  assert.ok(i >= 0, `${name} finnes`);
  const rest = src.slice(i);
  const end = rest.slice(1).search(/\n(?:@Composable\n)?(?:internal |private )?(?:fun|val|class|object) /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test('A: søkepillen har skygge i pilleform (6 dp, CircleShape, clip = false) før clip og bakgrunn', () => {
  const s = code('ui/Home29Ui.kt');
  assert.match(s, /internal fun Modifier\.pillShadow80\(\): Modifier =\s*this\.shadow\(elevation = 6\.dp, shape = CircleShape, clip = false, ambientColor = Color\.Black\.copy\(alpha = \.18f\), spotColor = Color\.Black\.copy\(alpha = \.30f\)\)/);
  assert.match(s, /\.height\(46\.dp\)\.pillShadow80\(\)\.clip\(CircleShape\)\.background\(p\.card\)/, 'rekkefølge: shadow(shape) → clip(shape) → background');
  assert.doesNotMatch(s, /\.shadow\(12\.dp, CircleShape\)/, 'den gamle 12 dp-skyggen er borte');
});

test('A: ingen klipping eller bakgrunn rundt pillen (animateContentSize bare på svar/forslag)', () => {
  const s = code('ui/Home29Ui.kt');
  const f = fn(s, 'PaperSearch29');
  // animateContentSize klipper til rammen og skar skyggen av med rette kanter.
  assert.match(f, /Column\(verticalArrangement = Arrangement\.spacedBy\(6\.dp\)\) \{/);
  assert.doesNotMatch(f, /Column\(Modifier\.animateContentSize/);
  assert.match(f, /if \(above45\) Box\(Modifier\.animateContentSize\(tween\(250\)\)\) \{ extras45\(\) \}/);
  assert.match(f, /if \(!above45\) Box\(Modifier\.animateContentSize\(tween\(250\)\)\) \{ extras45\(\) \}/);
  assert.doesNotMatch(f, /clipToBounds|Surface\(|Card\(/);
  // Søk (h1) tegnes direkte, ikke inni PCard/Surface.
  assert.match(code('ui/Paper.kt'), /"h1" -> PaperSearch29\(vm\)/);
});

test('A: wiggle-boksen (graphicsLayer) har ingen skygge utenfor løft, og Søk løftes i pilleform', () => {
  const h = code('ui/Home70.kt');
  const t = fn(h, 'Tile70');
  assert.match(t, /\.graphicsLayer \{\s*shadowElevation = 0f; shape = CircleShape; clip = false\s*if \(st\.dragKey == k\) \{/);
  assert.match(t, /shape = if \(k == "h1"\) CircleShape else RoundedCornerShape\(24\.dp\); clip = false/);
  assert.doesNotMatch(t, /\.background\(|\.border\(|\.shadow\(/, 'ingen bakgrunn/ramme/skygge på wrapperen');
});

test('B: tabellen – liten 101, høy 212 = 2 × 101 + 10, gap 10', () => {
  const h = code('ui/Home70.kt');
  const num = (re) => Number(h.match(re)[1]);
  const small = num(/private val SMALL73 = (\d+)\.dp/);
  const tall = num(/private val TALL73 = (\d+)\.dp/);
  const gap = num(/private val GAP70 = (\d+)\.dp/);
  assert.equal(small, 101);
  assert.equal(gap, 10);
  assert.equal(tall, 212);
  assert.equal(2 * small + gap, tall, 'Avgang slutter på linje med bunnen av flisen under');
  assert.match(code('ui/Ui52B.kt'), /private val TILE_H52 = 101\.dp/);
  // Speiler avH73 / fixedH73 / tileH80.
  const HALF = new Set(['h7', 'h9', 'h10', 'h11', 'h52av', 'h52fi', 'h52ma', 'h52fa', 'h52do']);
  const avH = (nx) => (nx >= 2 ? small * 2 + gap : tall);
  const tileH = (k) => (HALF.has(k) ? small : null);
  assert.equal(avH(0), 212);
  assert.equal(avH(1), 212);
  assert.equal(avH(2), 212);
  assert.equal(tileH('h52ma'), 101);
  assert.equal(tileH('h52fi'), 101);
  assert.equal(tileH('h5'), null, 'Siste nytt/brede kort: innholdets høyde');
  assert.match(h, /internal fun tileH80\(k: String, h: Dp\): Dp = if \(k in HALF52\) h else Dp\.Unspecified/);
});

test('B: høyden kommer aldri fra nabokortet eller weight', () => {
  const h = code('ui/Home70.kt');
  assert.doesNotMatch(h, /aspectRatio|LazyVerticalGrid|FlowRow|StaggeredGrid/);
  // To halve: fast rad; blandet rad: flisen har likevel sin faste høyde.
  assert.match(h, /fixed = fixedH73\(r\.keys, SMALL73\), fl = tileH80\(r\.a, SMALL73\), fr = r\.b\?\.let \{ tileH80\(it, SMALL73\) \} \?: Dp\.Unspecified\)/);
  assert.match(h, /fixed = fixedH73\(r\.keys, avH73\(r\.nx\.size\)\), fl = TALL73\)/, 'Avgang er 212 også ved siden av et kort som ikke er en flis');
  assert.match(h, /ms\.mapIndexed \{ i, m -> m\.measure\(if \(fx\[i\] >= 0\) Constraints\.fixed\(cw, fx\[i\]\) else Constraints\.fixed\(cw, h\)\) \}/);
  // Kolonnen ved siden av Avgang: flisene 101 hver, ikke weight(1f).
  assert.match(h, /Box\(\(if \(x in HALF52\) Modifier\.fillMaxWidth\(\)\.height\(SMALL73\) else Modifier\.fillMaxWidth\(\)\.weight\(1f\)\)\.zIndex/);
  assert.match(h, /private const val FONT_MAX73 = 1\.15f/, 'skriftskalering er begrenset');
});

test('B: innholdet får plass i 101 / 212 dp og festes riktig', () => {
  const t = code('ui/Tiles50.kt');
  const av = fn(t, 'AvgangTile50');
  assert.match(av, /Spacer\(Modifier\.weight\(1f\)\)\s*Row\(/, '«5 min» og «Så …» festet nederst');
  assert.match(av, /PSerif\(r\?\.num \?: "", with\(LocalDensity\.current\) \{ 64\.dp\.toSp\(\) \}/, 'tallet følger ikke skriftstørrelsen');
  assert.match(t, /verticalArrangement = Arrangement\.spacedBy\(if \(pad\) 4\.dp else 2\.dp\)/);
  const fam = fn(t, 'FamTile50');
  assert.doesNotMatch(fam, /Spacer\(Modifier\.height\(6\.dp\)\)/);
  assert.match(fam, /Spacer\(Modifier\.weight\(1f\)\)\s*Text\(famLine50\(list\)/);
  const mat = fn(t, 'MatTile50');
  assert.match(mat, /TileLabel50\("Middag", t\.matLab\)\s*PSerif\(vm\.todayMeal/, 'MIDDAG + rett øverst');
  const fin = fn(t, 'FinTile50');
  assert.match(fin, /kvitteringer/);
  const u = code('ui/Ui52B.kt');
  assert.match(fn(u, 'KalTile52'), /PSerif\(w\.title, 20\.sp, p\.ink, maxLines = 1\)/);
  assert.match(fn(u, 'BdTile52'), /Modifier\.padding\(start = \(i \* 16\)\.dp\)\.size\(24\.dp\)/);
  assert.match(fn(u, 'TrialTile52'), /PSerif\(if \(d == 0\) "I dag" else "\$d", 30\.sp/);
  assert.doesNotMatch(fn(u, 'BoligTile52'), /padding\(top = 6\.dp\)/);
});
