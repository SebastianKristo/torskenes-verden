// Android-arkitektur (rest etter 5.0.0): kildesjekker for radene i docs/opprydding/STATUS.md som gjelder strukturen i appene –
// ViewModel per skjerm med StateFlow og repository, SavedStateHandle og rememberSaveable (P85 F), tilbakestabelen med
// PredictiveBack, kalender-forslaget (E-B12/Q34) og 404-reservene (Q19).
// Ingen Android SDK her: CI-jobben «Mobilapper» er fasit for at koden kompilerer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const APP = join(AND, 'app/src/main/java/no/kristo/finanshub');
const KAL = join(AND, 'kalender/src/main/java/no/kristo/kalender');
const raw = (p) => readFileSync(p, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('E-B12/Q34 Kalender-appen: forslaget «Slå sammen kalenderne: N → 4?» vises med ja/nei, og bare ja kjører oppryddingen', () => {
  const kal = strip(raw(join(KAL, 'Kalendere.kt')));
  // migration.proposed og moved leses fra GET /api/kalender/calendars.
  assert.match(kal, /proposed = !m\.optBoolean\("done", false\) && m\.optBoolean\("proposed", false\)/);
  assert.match(kal, /moved = m\.optInt\("moved", 0\)/);
  // Ja = POST /api/kalender/calendars/migration (ingen automatikk: kalles bare fra mergeMig).
  assert.match(kal, /suspend fun applyMigration\(s: KalSession\)[\s\S]{0,80}s\.api\.post\("\/api\/kalender\/calendars\/migration"\)/);
  const inn = strip(raw(join(KAL, 'ui/KalenderInnstillinger.kt')));
  assert.match(inn, /"Slå sammen kalenderne: \$\{m\.from\} → \$\{m\.to\}\?"/);
  assert.match(inn, /fun mergeMig\(\)[\s\S]{0,300}Kal39Repo\.applyMigration\(s\)/);
  assert.equal((inn.match(/applyMigration\(/g) ?? []).length, 1, 'oppryddingen kjøres bare fra «Slå sammen»');
  // «Ikke nå» huskes per forslag (som kal39_mig på web), og begge knappene har TalkBack-navn.
  assert.match(inn, /m\.proposed -> m\.proposalKey/);
  assert.match(inn, /tap\("Slå sammen kalenderne"\) \{ st\.mergeMig\(\) \}/);
  assert.match(inn, /tap\("Ikke nå"\) \{ st\.dismissMig\(\) \}/);
  // Forslaget står øverst i kalenderen, ikke bare inne i Kalendere-siden.
  assert.match(strip(raw(join(KAL, 'ui/KalRoot.kt'))), /TopBar\(vm, onBackToHomelab\)\s*MigForslag\(vm\)/);
});

test('E-B12/Q34 Homelab-appen: kalenderen viser forslaget med «Slå sammen» og «Ikke nå», og «Angre» etterpå', () => {
  const k = strip(raw(join(APP, 'Kalender.kt')));
  assert.match(k, /hlGet\("\/kalender\/calendars", timeout = 12_000\)/, 'forslaget hentes når kalenderen åpnes');
  assert.match(k, /fun AppViewModel\.openKal26[\s\S]{0,500}loadKalMig\(\)/);
  assert.match(k, /KalMigrering\(!done && m\.optBoolean\("proposed", false\)/);
  assert.match(k, /"Slå sammen kalenderne: \$\{m\.from\} → \$\{m\.to\}\?"/);
  assert.equal((k.match(/hlPost\("\/kalender\/calendars\/migration"\)/g) ?? []).length, 1, 'oppryddingen kjøres bare fra «Slå sammen»');
  assert.match(k, /fun AppViewModel\.mergeKalMig\(\)[\s\S]{0,120}hlPost\("\/kalender\/calendars\/migration"\)/);
  assert.match(k, /hlPost\("\/kalender\/calendars\/migration\/undo"\)/);
  assert.match(k, /prefs\.set\(kalMigPref\(\), m\.key\)/, '«Ikke nå» huskes per forslag og bruker');
  const ui = strip(raw(join(APP, 'ui/KalenderSkjerm.kt')));
  assert.match(ui, /K29NowCard\(vm, kalNow29\(s, evs, now\)\)\s*KalMigBanner\(vm\)/);
  assert.match(ui, /contentDescription = if \(m\.proposed\) "Ikke nå" else "Lukk"/);
});
