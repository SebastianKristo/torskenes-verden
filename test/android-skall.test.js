// Fase 5 bølge 2 (SKALL-Android): kildesjekker for oppdelingen av blandingsfilene og for periodisk henting fra
// composables (D-android B2). Selve oppførselen kan bare prøves på enhet; dette sjekker at koden har riktig form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
const raw = (f) => readFileSync(join(APP, f), 'utf8');
const code = (f) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function ktFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...ktFiles(p));
    else if (e.name.endsWith('.kt')) out.push(relative(APP, p));
  }
  return out;
}

test('blandingsfilene er delt opp: ingen P25–P52B, P73Brief, ui/Ui20–Ui52B, ui/P25Ui eller Mod23–28B igjen', () => {
  const files = ktFiles(APP);
  const gamle = files.filter((f) => /^(P(2[5-9]|3\d|4\d|52B?)b?\.kt|P73Brief\.kt|ui\/Ui\d+[bB]?\.kt|ui\/P25Ui\.kt|Mod2\dB?\.kt|Models(13|19|22)\.kt)$/.test(f));
  assert.deepEqual(gamle, []);
  // Familiene i skallet er slått sammen til én fil hver.
  const familier = files.filter((f) => /^(ui\/(Fold4\d|Mer(24|44|45)|Nav(23|26B)|Settings(\d+B?|Ui)|Chat\d+(Ui|Sheets)?|Glimt\d+(Ui)?|GlimtFigs35|Brief\d+(Ui)?)|Chat\d+)\.kt$/.test(f));
  assert.deepEqual(familier, []);
  for (const f of ['ui/Fold.kt', 'ui/Mer.kt', 'ui/Navigasjon.kt', 'ui/Innstillinger.kt', 'Chat.kt', 'ui/Chat.kt', 'ui/ChatArk.kt', 'ui/Glimt.kt',
    'ui/GlimtSvar.kt', 'ui/GlimtFigurer.kt', 'ui/Brief.kt']) assert.ok(existsSync(join(APP, f)), f);
  // P50Fam og P50Med eies av MODULER og er ikke rørt her.
  assert.ok(existsSync(join(APP, 'P50Fam.kt')) && existsSync(join(APP, 'P50Med.kt')));
});

test('kode for andre områder ligger i domene/<Område>.kt med egen JvmName, så fasadene ikke kolliderer', () => {
  const dom = ktFiles(APP).filter((f) => /^(ui\/)?domene\//.test(f));
  assert.ok(dom.length >= 20, `fant ${dom.length}`);
  for (const f of dom) {
    const s = raw(f);
    const navn = f.split('/').pop().replace('.kt', '');
    assert.match(s, new RegExp(`^@file:JvmName\\("Domene${navn}"\\)`), `${f}: JvmName`);
    assert.match(s, f.startsWith('ui/') ? /^package no\.kristo\.finanshub\.ui$/m : /^package no\.kristo\.finanshub$/m, `${f}: samme package som før`);
    assert.match(s, /Fila eies av (ØKONOMI|MODULER|KALENDER)-Android\./, `${f}: eier`);
  }
});

test('ingen nye filnavn med nummer blant filene skallet har laget', () => {
  const nye = ['Glimt', 'Brief', 'Fanelinje', 'Konto', 'Innlogging', 'Serveradresse', 'Hjem', 'AiKontroll', 'GlimtInnstillinger', 'Opplesning',
    'JsonHjelp', 'Chat', 'Bakgrunn', 'Hoytider', 'Integrasjoner', 'Studie', 'Ikonsok', 'Profiler', 'MerListe', 'Nordlys', 'Oppstart', 'Varsler', 'Innstillinger'];
  for (const n of nye) assert.ok(existsSync(join(APP, `${n}.kt`)), n);
  const ui = ['GlobaleLag', 'HjemFliser', 'Effekter', 'Wiggle', 'Ikoner', 'Modifikatorer', 'Komponenter', 'Sveip', 'Ark', 'Tilpass', 'HjemDeler'];
  for (const n of ui) assert.ok(existsSync(join(APP, `ui/${n}.kt`)), `ui/${n}`);
});

test('B2: periodisk henting fra composables stopper ved ON_STOP (GjentaMensSynlig med repeatOnLifecycle)', () => {
  const e = code('ui/Effekter.kt');
  assert.match(e, /internal fun GjentaMensSynlig\(vararg nokler: Any\?, blokk: suspend CoroutineScope\.\(\) -> Unit\)/);
  assert.match(e, /eier\.lifecycle\.repeatOnLifecycle\(Lifecycle\.State\.STARTED\) \{ siste\.value\(this\) \}/);
  assert.match(e, /val siste = rememberUpdatedState\(blokk\)/, 'nyeste lambda brukes');
  const hent = /LaunchedEffect\([^)]*\)\s*\{\s*while\s*\((?:true|[^)]*!= null)\)\s*\{[^{}]*(load|refresh|osloTick|vaerCheck)\w*\(/;
  for (const f of ['ui/Effekter.kt', 'ui/HjemFliser.kt', 'ui/Tiles50.kt', 'ui/Paper17.kt', 'ui/GlobaleLag.kt', 'ui/domene/Avganger.kt', 'ui/domene/Familie.kt']) {
    assert.doesNotMatch(code(f), hent, `${f}: henting i LaunchedEffect-løkke uten livssyklus`);
  }
  assert.match(code('ui/HjemFliser.kt'), /"h52fa" -> \{ GjentaMensSynlig \{ while \(true\) \{ vm\.loadPositions\(\); delay\(60_000\) \} \}/);
  assert.match(code('ui/GlobaleLag.kt'), /GjentaMensSynlig\(s\.journey\?\.leftAt\) \{ while \(s\.journey != null\) \{ vm\.loadTrip41\(\); delay\(30_000\) \} \}/);
  assert.match(code('ui/domene/Familie.kt'), /GjentaMensSynlig \{ while \(true\) \{ kotlinx\.coroutines\.delay\(30_000\); vm\.loadHjemlys40\(force = true\) \} \}/);
});
