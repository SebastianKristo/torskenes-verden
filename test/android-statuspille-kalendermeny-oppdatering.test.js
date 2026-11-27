// Android: Glimt-statuspillen øverst, «Homelab» i Kalender-menyen og dra-for-å-oppdatere som alltid blir ferdig.
// Instruksene: design_handoff_homelab/prompts/prompt-57-pakke/claude-code-glimt-statuspille.md,
// claude-code-kalender-homelab-i-meny.md og claude-code-refresh-fiks.md (iOS-feilen, sjekket og rettet på Android).
// Kildesjekker (ingen Android SDK her – CI «Mobilapper» er fasit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const APP = join(AND, 'app/src/main/java/no/kristo/finanshub');
const KAL = join(AND, 'kalender/src/main/java/no/kristo/kalender');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (...p) => strip(readFileSync(join(...p), 'utf8'));

function block(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `fant ikke «${start}»`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  assert.fail('ubalanserte klammer');
}

/* ---------------- Kalender: «Homelab» i hamburgermenyen ---------------- */

test('Kalender: ingen «‹ Homelab»-linje i headeren, i noen visning', () => {
  const root = code(KAL, 'ui/KalRoot.kt');
  const top = block(root, 'private fun TopBar(');
  assert.match(top, /^private fun TopBar\(vm: KalVm\)/, 'TopBar tar ikke lenger imot tilbake-handlingen');
  assert.doesNotMatch(top, /vm\.back/);
  assert.doesNotMatch(top, /Tilbake til Homelab/);
  assert.doesNotMatch(top, /"Homelab"/);
  assert.match(root, /TopBar\(vm\)\s*MigForslag\(vm\)/);
});

test('Kalender: raden «Homelab» øverst i menyen, bare når Kalender er åpnet fra Homelab', () => {
  const root = code(KAL, 'ui/KalRoot.kt');
  assert.match(root, /Drawer\(vm, onBackToHomelab\)/);
  const menu = code(KAL, 'ui/Sidemeny.kt');
  const d = block(menu, 'fun Drawer(');
  assert.match(d, /^fun Drawer\(vm: KalVm, onBackToHomelab: \(\) -> Unit\)/);
  // Øverst: rett under statuslinjen, før tittelen «Kalendere» og lista.
  const iRow = d.indexOf('if (vm.back) HomelabRow(');
  assert.ok(iRow > 0, 'raden vises bare med vm.back (åpnet fra Homelab)');
  assert.ok(iRow > d.indexOf('WindowInsets.statusBars') && iRow < d.indexOf('Tx("Kalendere"'), 'raden står øverst');
  // Trykk lukker menyen og går tilbake til Homelab.
  assert.match(d, /HomelabRow\(\) \{ vm\.cs = false; onBackToHomelab\(\) \}/);
  const row = block(menu, 'private fun HomelabRow(');
  // Samme radstil som Innstillinger nederst: 34 dp ikonbrikke, callout fet tittel, footnote undertekst, tynn linje under.
  assert.match(row, /Svg\(Ic\.HOME, 17\.dp, k\.ink, 2\.1f\)/);
  assert.match(row, /Modifier\.size\(34\.dp\)\.clip\(RoundedCornerShape\(10\.dp\)\)\.background\(k\.chip\)/);
  assert.match(row, /Tx\("Homelab", man\(KType\.callout, FontWeight\.Bold, k\.ink\)\)/);
  assert.match(row, /Tx\("Tilbake til appen", man\(KType\.footnote, FontWeight\.Medium, k\.mut\)\)/);
  assert.match(row, /tap\("Tilbake til Homelab", onClick = onClick\)/);
  assert.match(row, /drawLine\(k\.line2, Offset\(0f, size\.height\), Offset\(size\.width, size\.height\)/);
  assert.match(code(KAL, 'ui/KalCommon.kt'), /const val HOME = "/);
});

test('Kalender: tilbake-gesten lukker menyen først, ellers tar systemet tilbake til Homelab som før', () => {
  const root = code(KAL, 'ui/KalRoot.kt');
  assert.match(root, /Tilbakesteg\("sidemeny", \{ vm\.cs \}\) \{ vm\.cs = false \}/);
  assert.match(root, /PredictiveBackHandler\(stabel\.aktivt\(\) != null\)/);
  // «Tilbake til Homelab» henter fram Homelab-oppgaven og legger Kalender bak (uendret).
  const act = code(KAL, 'MainActivity.kt');
  assert.match(act, /setContent \{ KalRoot\(vm, onBackToHomelab = ::backToHomelab\) \}/);
  assert.match(block(act, 'private fun backToHomelab('), /moveTaskToBack\(true\)/);
});
