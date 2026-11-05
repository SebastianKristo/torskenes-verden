// Prompt 73 (ANDFIX73): Android – ingen «StandaloneCoroutine was cancelled»-melding, og Hjem-kortene like store som på iPhone.
// Kotlin typesjekkes utenfor npm test (stubber); her er kildesjekker av det som er lett å ødelegge igjen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
const IOS = join(ROOT, 'apps/ios/FinansHub/Sources');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Regexene fra AndFix73.kt, oversatt til JS ((?i) → flagg i). */
function ktRegex(name) {
  const s = read('AndFix73.kt');
  const m = s.match(new RegExp(`private val ${name} = Regex\\(([\\s\\S]*?)\\)\\n`));
  assert.ok(m, `${name} finnes`);
  const parts = [...m[1].matchAll(/"""([\s\S]*?)"""/g)].map((x) => x[1]);
  let src = parts.join('');
  let flags = '';
  if (src.startsWith('(?i)')) { src = src.slice(4); flags = 'i'; }
  return new RegExp(src, flags);
}

test('avbrudd: AppViewModel.launch kaster CancellationException videre og viser ingen melding', () => {
  const vm = code('AppViewModel.kt');
  assert.match(vm, /private fun launch\(block: suspend \(\) -> Unit\) = viewModelScope\.launch \{\s*try \{ block\(\) \} catch \(e: kotlinx\.coroutines\.CancellationException\) \{ throw e \} catch \(e: ApiException\)/);
  assert.doesNotMatch(vm, /message = e\.message \?: "Noe gikk galt"/, 'ingen rå exception-tekst i launch');
  assert.match(vm, /set\(v\) \{ message73 = cleanErr73\(v\) \}/, 'vm.message filtrerer avbrudd og rå tekst');
  // Alle launchNN/launchJobNN går gjennom launch (samme regel overalt).
  const helpers = [...vm.matchAll(/internal fun (launch\w*)\(block: suspend \(\) -> Unit\)[^=\n]*= (\w+)\(block\)/g)];
  assert.ok(helpers.length > 20);
  for (const h of helpers) assert.equal(h[2], 'launch', h[1]);
});

test('avbrudd: filteret kjenner igjen «StandaloneCoroutine was cancelled» og rå tekst', () => {
  const cancel = ktRegex('CANCEL_TEXT73');
  for (const t of ['StandaloneCoroutine was cancelled', 'Job was cancelled', 'The coroutine scope left the composition', 'kotlinx.coroutines.JobCancellationException: x']) {
    assert.match(t, cancel, t);
  }
  assert.doesNotMatch('Klarte ikke hente været. Prøv igjen.', cancel);
  const raw = ktRegex('RAW73');
  for (const t of ['java.net.SocketTimeoutException: timeout', 'Unable to resolve host "x.no"', 'No value for name', 'IllegalStateException', 'failed to connect to /10.0.0.2']) {
    assert.match(t, raw, t);
  }
  for (const t of ['Fikk ikke kontakt med serveren.', 'Serveren svarte ikke i tide.', 'Bare administrator kan endre dette for alle', 'Feil 500']) {
    assert.doesNotMatch(t, raw, t);
  }
  const a = code('AndFix73.kt');
  assert.match(a, /internal fun uiErr73\(e: Throwable, fallback: String = ERR_GENERIC73\): String/);
  assert.match(a, /Log\.w\(TAG73, fallback, e\)/, 'detaljene logges');
  assert.match(a, /if \(isCancelText73\(s\)\) \{[^}]*return null \}/);
});

test('avbrudd: catch (e: Exception) med e.message i coroutines har CancellationException foran og ingen rå tekst', () => {
  const files = ['Offline51Plat.kt', 'Calendar29.kt', 'P46.kt', 'Car51Plat.kt', 'Calendar27.kt', 'Backup29.kt', 'G67.kt', 'Smb30.kt', 'Feat51.kt',
    'Mod28B.kt', 'Memory33.kt', 'P41.kt', 'Birthdays24.kt', 'P30.kt', 'P31.kt', 'Calendar26.kt', 'Chat27.kt', 'ui/Family16.kt', 'ui/Update28.kt',
    'ui/Search51Ui.kt', 'ui/Ui41.kt', 'ui/Health20.kt', 'upload/PendingUploads.kt', 'Onboard51.kt', 'AppViewModel.kt'];
  for (const f of files) {
    const s = code(f);
    assert.doesNotMatch(s, /catch \((\w+): (?:Exception|Throwable)\) \{[^{}]*\b\1\.message \?: "/, `${f}: rå e.message ?: "…" i catch`);
  }
  assert.match(code('G67.kt'), /else -> uiErr73\(e, what\)/);
  assert.match(code('Onboard51.kt'), /else -> uiErr73\(e, "Noe gikk galt\. Prøv igjen\."\)/);
  assert.equal((code('Feat51.kt').match(/catch \(e: kotlinx\.coroutines\.CancellationException\) \{ throw e \}/g) || []).length >= 4, true);
  const api = code('Api.kt');
  assert.doesNotMatch(api, /HTTPS-feil \(\$\{e\.message\}\)/);
  assert.doesNotMatch(api, /throw ApiException\(e\.message \?: "Nettverksfeil"\)/);
});

test('ingen dobbel oppstart: refresh() er én jobb, og avbrutt nettbytte starter ikke refresh', () => {
  const vm = code('AppViewModel.kt');
  assert.match(vm, /fun refresh\(\): kotlinx\.coroutines\.Job \{ refreshJob73\?\.cancel\(\); return launch \{ refreshNow73\(\) \}\.also \{ refreshJob73 = it \} \}/);
  assert.match(vm, /try \{ resolveBase\(\) \} catch \(e: kotlinx\.coroutines\.CancellationException\) \{ throw e \} catch \(_: Exception\) \{\}\s*if \(base != before && loggedIn\) refresh\(\)/);
  assert.doesNotMatch(vm, /GlobalScope/);
});

test('Hjem: faste høyder fra tabell som på iPhone (150 / 212 / 2 × 150 + mellomrom)', () => {
  // Fasit: iOS-flisene.
  const ios50 = readFileSync(join(IOS, 'Home50Tiles.swift'), 'utf8');
  const ios52 = readFileSync(join(IOS, 'Home52Grid.swift'), 'utf8');
  assert.match(ios50, /minHeight: 212/, 'Avgang 212 på iOS');
  assert.ok((ios52.match(/minHeight: 150/g) || []).length >= 4, 'små fliser 150 på iOS');
  const h = code('ui/Home70.kt');
  const num = (re) => Number(h.match(re)[1]);
  const small = num(/private val SMALL73 = (\d+)\.dp/);
  const tall = num(/private val TALL73 = (\d+)\.dp/);
  const gap = num(/private val GAP70 = (\d+)\.dp/);
  assert.equal(small, 150);
  assert.equal(tall, 212);
  assert.match(h, /internal fun avH73\(nx: Int\): Dp = if \(nx >= 2\) SMALL73 \* 2 \+ GAP70 else TALL73/);
  assert.match(h, /internal fun fixedH73\(keys: List<String>, h: Dp\): Dp = if \(keys\.isNotEmpty\(\) && keys\.all \{ it in HALF52 \}\) h else Dp\.Unspecified/);
  assert.match(h, /is Row70\.Two -> PairRow70\([\s\S]*?fixed = fixedH73\(r\.keys, SMALL73\)\)/);
  assert.match(h, /is Row70\.Av -> PairRow70\([\s\S]*?fixed = fixedH73\(r\.keys, avH73\(r\.nx\.size\)\)\)/);
  assert.match(h, /if \(fixed != Dp\.Unspecified\) \{\s*val fh = fixed\.roundToPx\(\)\s*val fp = ms\.map \{ it\.measure\(Constraints\.fixed\(cw, fh\)\) \}/, 'fast høyde måler ikke innholdet');
  // Avgang og Bursdag på samme rad blir like høye (Avgang + én halv: begge 212), to halve stablet: 2 × 150 + 12 = 312.
  const avH = (nx) => (nx >= 2 ? small * 2 + gap : tall);
  assert.equal(avH(1), 212);
  assert.equal(avH(2), 312);
  // iOS tallRow: høyden = max(212, sum av de stablede + mellomrom) – samme tall når flisene er 150.
  assert.equal(Math.max(212, 150 + 150 + gap), avH(2));
});

test('Hjem: tekst med tak 1,15, uten fontpadding og med eksplisitt linjehøyde; fontene er med', () => {
  const h = code('ui/Home70.kt');
  assert.match(h, /private const val FONT_MAX73 = 1\.15f/);
  assert.match(h, /LocalDensity provides Density\(d\.density, d\.fontScale\.coerceAtMost\(FONT_MAX73\)\)/);
  assert.match(h, /lineHeight = 1\.35\.em/);
  assert.match(h, /platformStyle = TAB_TEXT24\.platformStyle/);
  assert.match(code('ui/Mer24.kt'), /internal val TAB_TEXT24: TextStyle = TextStyle\([\s\S]*?platformStyle = PlatformTextStyle\(includeFontPadding = false\)/);
  assert.match(h, /HomeText73 \{ if \(k in TILE_KEYS52 \|\| k in HALF52 \|\| k == "h5"\) Tile52\(vm, k, Dp\.Unspecified, body\) else body\(k\) \}/);
  const res = join(ROOT, 'apps/android/app/src/main/res/font');
  for (const f of ['newsreader_regular.ttf', 'newsreader_medium.ttf', 'newsreader_italic.ttf', 'manrope_regular.ttf', 'manrope_medium.ttf', 'manrope_semibold.ttf', 'manrope_bold.ttf']) {
    assert.ok(existsSync(join(res, f)), f);
  }
  const th = code('ui/Theme.kt');
  assert.match(th, /Font\(R\.font\.newsreader_regular, FontWeight\.Normal\)/);
  assert.match(th, /Font\(R\.font\.manrope_semibold, FontWeight\.SemiBold\)/);
});
