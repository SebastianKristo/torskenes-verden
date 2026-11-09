// Prompt 76 (SKJAND): Skjold Lab i Android-appen – kildesjekker og de rene reglene oversatt til JS.
// Kotlin typesjekkes utenfor npm test (stubber, $S/kt/b76.sh): 0 nye feil mot grunnlinjen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Speiler fold76 / words76 / offlineMatch76 / rank76 / cellAt76 / suggestCols76 / locText76 / lowStock76 / stem76 / whereQuery76.
const fold = (s) => s.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[Ωω]/g, '')
  .normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^a-z0-9]+/g, '');
const words = (q) => q.split(/[\s,;-]+/).map(fold).filter(Boolean);
const match = (hay, q) => {
  const ws = words(q);
  if (!ws.length) return true;
  const toks = hay.flatMap((h) => [...h.split(/[\s,;/·×()-]+/).map(fold), fold(h)]).filter(Boolean);
  return ws.every((w) => toks.some((t) => t.startsWith(w)));
};
const rank = (name, q) => { const n = fold(name), f = fold(q); return !f ? 2 : n === f ? 0 : n.startsWith(f) ? 1 : 2; };
const cellAt = (gx, gy, rows, cols) => (gx < 0 || gy < 0 || gx >= cols || gy >= rows) ? null : [Math.floor(gy) + 1, Math.floor(gx) + 1];
const suggestCols = (w, d = 60) => Math.min(12, Math.max(1, Math.floor(w / d)));
const drawerText = (r, c, comp) => `Rad ${r} · Skuff ${c}` + (comp ? ` · Rom ${comp}` : '');
const locText = (cab, r, c, comp) => (cab == null || r == null || c == null) ? 'Uten plass' : `${cab} · ${drawerText(r, c, comp)}`;
const low = (qty, min) => min != null && qty <= min;
const stem = (w) => { for (const s of ['ene', 'ane', 'er', 'en', 'et', 'ne', 'a', 'e']) if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length); return w; };
const whereQ = (q) => q.trim().toLowerCase().replace(/^(hvor (er|finner jeg|ligger|har jeg( lagt)?)|finn|vis meg)\s+(de |den |det |mine |min |mitt )?/, '')
  .replace(/[?.! ]+$/, '').split(/[\s-]+/).filter(Boolean).map(stem).join(' ');

/** 4-punkts projektiv avbildning (som android.graphics.Matrix.setPolyToPoly med 4 punkter). */
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) { // Gauss
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return ([x, y]) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
}

test('filene finnes, og Skjold Lab er koblet inn i Mer, sidene, tilbake, dyplenker, snarveier, felles søk og Glimt', () => {
  assert.ok(existsSync(join(SRC, 'Skjold76.kt')));
  assert.ok(existsSync(join(SRC, 'ui/Skjold76Ui.kt')));
  assert.match(code('ui/Paper.kt'), /if \(Skjold76\.open\) PgIn52 \{ SkjoldPage76\(vm\) \}/);
  assert.match(code('ui/Ui52B.kt'), /no\.kristo\.finanshub\.Skjold76\.open,\s*\)\.count \{ it \}/);
  assert.match(code('ui/Mer24.kt'), /row\("skjold", "Skjold Lab", "Deler, skuffer og skap"\) \{ vm\.openSkjold76\(\) \}/);
  assert.match(code('ui/P25Ui.kt'), /"skjold" to "M4 3h16v18H4z/, 'ikon: skuffeskap');
  assert.match(code('AppViewModel.kt'), /"skjold", "deler" -> skjoldLink76\(uri\)/);
  const nav = code('P32b.kt');
  assert.match(nav, /"skjold" -> openSkjold76\(\)/);
  assert.ok(nav.indexOf('"skjold", "Skjold Lab"') < nav.indexOf('"kart", "Familie"'), 'Skjold-snarveien før Familie');
  assert.match(nav, /navShortcut32b\(t\)\?\.takeIf \{ it\.second != "kart" \|\| !skjoldKnows76\(t\) \}/, '«hvor er M3-skruene?» går til Glimt');
  assert.match(nav, /glimtAnswered76\(t, r\.open, r\.card, r\.tool, r\.intent, r\.results\)/);
  assert.match(code('ui/Glimt31.kt'), /glimtSkj76\?\.takeIf \{ it\.first == a\.q \}\?\.let \{ \(_, u\) -> GlimtSkjold76\(vm, u\) \}/);
  const s51 = code('ui/Search51Ui.kt');
  assert.match(s51, /"part", "skjold", "deler" -> dl\("finanshub:\/\/skjold\/del\/\$ref"\)/);
  assert.match(s51, /"skjold" -> vm\.openSkjold76\(\)/);
});

test('API-kontrakten: alle rutene under /api/skjold brukes', () => {
  const k = code('Skjold76.kt');
  assert.match(k, /const val API76 = "\/skjold"/);
  for (const r of [
    /get76\("\/cabinets"\)/, /post76\("\/cabinets", body\)/, /patch76\("\/cabinets\/\$id", body\)/, /del76\("\/cabinets\/\$\{c\.id\}" \+ \(move\?\.let \{ "\?move="/,
    /API76 \+ "\/cabinets\/\$id\/photo"/, /put76\("\/cabinets\/\$id\/corners", cornersJson76\(c\)\)/, /del76\("\/cabinets\/\$id\/photo"\)/,
    /get76\("\/cabinets\/\$cabId\/map"\)/, /put76\("\/cabinets\/\$cabId\/drawers\/\$row\/\$col"/,
    /"\/parts\?limit=500"/, /"&q="/, /"&category="/, /"&cabinet="/, /"&low=1"/, /get76\("\/parts\/\$id"\)/, /post76\("\/parts", body\)/, /patch76\("\/parts\/\$\{d\.id\}", body\)/,
    /del76\("\/parts\/\$\{p\.id\}"\)/, /post76\("\/parts\/\$\{p\.id\}\/restore"\)/, /post76\("\/parts\/\$\{p\.id\}\/move"/, /post76\("\/parts\/\$\{p\.id\}\/qty", body\)/,
    /API76 \+ "\/parts\/\$id\/photos"/, /del76\("\/parts\/\$id\/photos\/\$n"\)/, /get76\("\/categories"\)/, /get76\("\/suggest\?q="/, /get76\("\/free"\)/,
    /API76 \+ "\/labels" \+ \(cabId\?\.let \{ "\?cabinet="/,
  ]) assert.match(k, r);
  assert.match(k, /request\("PATCH", API76 \+ path, body, prefix = Api\.HOMELAB\)/);
  assert.match(k, /internal const val FILES76 = "\/api\/skjold\/files\/"/);
  // 409 ved sletting av skap med deler → spør om flytting (?move=<id>|none).
  assert.match(k, /if \(e\.status == 409\) \{ s\.cabDeleteAsk = c; return@act76 \}/);
  assert.match(code('ui/Skjold76Ui.kt'), /vm\.deleteCab76\(c, "none"\)/);
  // Flytt: occupied gir advarsel, og angre i 10 s.
  assert.match(k, /s\.occupied = objs34\(o\?\.optJSONArray\("occupied"\)\)/);
  assert.match(k, /delay\(10_000\); if \(s\.undo\?\.seq == seq\) s\.undo = null/);
});

test('kamera/bilder, perspektiv med setPolyToPoly, puls bare med opacity, offline-buffer', () => {
  const u = code('ui/Skjold76Ui.kt');
  const k = code('Skjold76.kt');
  assert.match(u, /ActivityResultContracts\.TakePicture\(\)/);
  assert.match(u, /ActivityResultContracts\.PickVisualMedia\(\)/);
  assert.match(u, /m\.setPolyToPoly\(src, 0, dst, 0, 4\)/);
  assert.match(u, /if \(m\.invert\(inv\)\)/, 'trykk i bildet regnes tilbake til rad/skuff');
  assert.match(u, /graphicsLayer \{ alpha = pa \}/);
  const pulse = u.slice(u.indexOf('private fun pulse76'), u.indexOf('internal fun CabView76'));
  assert.match(pulse, /repeat\(3\) \{ a\.animateTo\(\.25f, tween\(330\)\); a\.animateTo\(1f, tween\(330\)\) \}/, '≈ 2 s');
  assert.doesNotMatch(pulse, /animateDpAsState|animateSizeAsState|animateOffsetAsState/);
  // Bilder skaleres til 1600 px og kodes som JPEG på telefonen (EXIF/GPS blir ikke med), roteres etter EXIF.
  assert.match(k, /internal fun jpeg76\(data: ByteArray, max: Int = 1600\)/);
  assert.match(k, /Bitmap\.CompressFormat\.JPEG, 88/);
  assert.match(k, /ExifInterface\.TAG_ORIENTATION/);
  // Offline: liste og skap i filesDir per konto; endringer uten nett gir tydelig melding.
  assert.match(k, /File\(File\(ctx\.filesDir, "skjold76"\)/);
  assert.match(k, /internal const val NEED_NET76 = "Endringer krever nett\./);
  assert.match(k, /if \(e\.status == 0 && e\.code == null\) \{ Skjold76\.offline = true; flash\("Kunne ikke lagre\. \$NEED_NET76"\) \}/);
  // Etiketter: HTML hentes med tokenet og skrives ut via PrintManager.
  assert.match(k, /android\.print\.PrintManager/);
  assert.match(k, /createPrintDocumentAdapter/);
});

test('søk offline: ufølsomt for store/små bokstaver og æøå, prefiks, «10k» treffer 10kΩ og 10 k', () => {
  assert.equal(fold('10 kΩ'), '10k');
  assert.equal(fold('Skjøteledning Å'), 'skjoteledninga');
  assert.equal(match(['Motstand', '10kΩ'], '10k'), true);
  assert.equal(match(['Motstand', '10 k'], '10k'), true);
  assert.equal(match(['Motstand', '1k'], '10k'), false);
  assert.equal(match(['M3 × 10 skruer'], 'm3 skru'), true, 'prefikssøk på flere ord');
  assert.equal(match(['Kabelsko'], 'KABEL'), true);
  assert.equal(match(['Sjøkabel'], 'sjo'), true, 'æøå');
  assert.equal(match(['ESP32-WROOM'], 'wroom'), true);
  assert.equal(match(['LED rød 5 mm'], 'blå'), false);
  // Rangering: eksakt navn, navn-prefiks, resten.
  const l = ['M3 mutter', 'Skrue M3', 'M3'].sort((a, b) => rank(a, 'M3') - rank(b, 'M3'));
  assert.deepEqual(l, ['M3', 'M3 mutter', 'Skrue M3']);
});

test('plassering, tegning og tilleggsskap', () => {
  assert.equal(locText('Hovedskap', 4, 2, 1), 'Hovedskap · Rad 4 · Skuff 2 · Rom 1');
  assert.equal(locText('Hovedskap', 4, 2, null), 'Hovedskap · Rad 4 · Skuff 2');
  assert.equal(locText(null, null, null, null), 'Uten plass');
  assert.equal(low(2, 5), true); assert.equal(low(5, 5), true); assert.equal(low(6, 5), false); assert.equal(low(0, null), false);
  assert.deepEqual(cellAt(1.5, 3.2, 12, 5), [4, 2], 'rad 1 øverst, skuff 1 til venstre');
  assert.equal(cellAt(5, 0, 12, 5), null);
  assert.equal(suggestCols(270), 4, '27 cm → 4 skuffer à ~60 mm');
  const k = code('Skjold76.kt');
  assert.match(k, /internal fun short76\(row: Int, col: Int\): String = "\$row-\$col"/);
  assert.match(k, /internal fun defLabel76\(row: Int, col: Int\): String = "R\$row·S\$col"/);
  assert.match(code('ui/Skjold76Ui.kt'), /"Tilleggsskap \(3D-print\)" else "Nytt skap", 12, if \(threeD\) suggestCols76\(270\) else 5/);
});

test('perspektiv: 4 hjørner gir projektiv (ikke affin) avbildning av rutenettet', () => {
  const rows = 12, cols = 5;
  const corners = [[100, 80], [520, 120], [500, 900], [130, 860]]; // tl, tr, br, bl
  const H = homography([[0, 0], [cols, 0], [cols, rows], [0, rows]], corners);
  const near = (a, b) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${a} ≈ ${b}`);
  near(H([0, 0]), corners[0]); near(H([cols, 0]), corners[1]); near(H([cols, rows]), corners[2]); near(H([0, rows]), corners[3]);
  // Midten er ikke gjennomsnittet av hjørnene (perspektiv), og rette linjer forblir rette.
  const mid = H([cols / 2, rows / 2]);
  const avg = [corners.reduce((s, c) => s + c[0], 0) / 4, corners.reduce((s, c) => s + c[1], 0) / 4];
  assert.ok(Math.hypot(mid[0] - avg[0], mid[1] - avg[1]) > .5);
  const [a, b, c] = [H([0, 4]), H([2.5, 4]), H([5, 4])];
  assert.ok(Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-6);
});

test('Glimt: «hvor er M3-skruene?» blir et delsøk, ikke Familie', () => {
  assert.equal(whereQ('Hvor er M3-skruene?'), 'm3 skru');
  assert.equal(match(['M3 × 10 skruer'], whereQ('hvor er M3-skruene?')), true);
  assert.equal(whereQ('hvor finner jeg motstandene'), 'motstand');
  assert.equal(match(['Motstand 10kΩ'], whereQ('hvor er Ingrid')), false);
  const k = code('Skjold76.kt');
  assert.match(k, /if \(pid != null\) return "finanshub:\/\/skjold\/del\/"/);
  assert.match(k, /return "finanshub:\/\/skjold\/skap\/\$cab\/\$\{short76\(r, c\)\}"/);
});
