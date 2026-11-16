// Midlertidige mapper i testene. Uten dette ble hver `npm test` liggende igjen med flere hundre MB i /tmp
// (hl-updsh-*, hl-upd46-*, fh-bk-* …), og etter en dag var disken full og updater-testene feilet på low_disk.
//
// Lastes av `npm test` og `npm run test:e2e` (node --import ./test/lib/midlertidig.mjs). Hver prosess som laster fila,
// får sin egen mappe under TMPDIR, og TMPDIR (og TMP/TEMP) peker dit resten av prosessen. Alt testene og serverne de
// starter legger i tmpdir() – mkdtemp, DATA_DIR, bilder, oppdateringsfiler – havner der, og mappa slettes når prosessen
// avslutter. Det skjer først når hele testfila er ferdig, så ingen server mister mappa si midt i en test.
// Underprosesser arver TMPDIR og skriver inni forelderens mappe. Blir de drept før de rekker å rydde selv, rydder
// forelderen. Testløperen laster fila også, så det som en drept testprosess etterlater, slettes når kjøringen er ferdig.
//
// lagMidlertidig(prefiks) lager en mappe som slettes når prosessen avslutter. Bruk den i nye tester i stedet for
// mkdtempSync(join(tmpdir(), …)) uten opprydding.
// HL_TEST_BEHOLD_TMP=1 lar mappene bli liggende (for feilsøking).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const slettes = [];
let lytter = false;

function ryddVedAvslutning(dir) {
  slettes.push(dir);
  if (lytter) return;
  lytter = true;
  process.on('exit', () => {
    if (process.env.HL_TEST_BEHOLD_TMP === '1') return;
    // Innerste først, så den ytterste mappa (prosessens egen) tas til slutt.
    for (const d of slettes.slice().reverse()) {
      try { rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort ved avslutning */ }
    }
  });
}

/** Lager en midlertidig mappe under tmpdir() som slettes når prosessen avslutter. → absolutt sti */
export function lagMidlertidig(prefiks = 'hl-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefiks));
  ryddVedAvslutning(dir);
  return dir;
}

if (!globalThis.__hlMidlertidig) {
  globalThis.__hlMidlertidig = true;
  const rot = lagMidlertidig(`hl-test-${process.pid}-`);
  process.env.TMPDIR = rot;
  process.env.TMP = rot;
  process.env.TEMP = rot;
}
