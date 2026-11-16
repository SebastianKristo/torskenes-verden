// Fase 6 bølge 2: Android-appene følger modullisten (shared/schemas/moduler.json) i stedet for egne lister.
// Kildetester (ingen Gradle her); JUnit-testene i apps/android/felles (ModullisteTest) kjører i CI («Mobilapper»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const APP = join(AND, 'app/src/main/java/no/kristo/finanshub');
const read = (p) => readFileSync(p, 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const LISTE = JSON.parse(read(join(ROOT, 'shared/schemas/moduler.json')));
const ANDROID = LISTE.moduler.filter((m) => m.plattformer.includes('android'));

test('modullisten bygges inn i :felles ved bygging, og tolkes der', () => {
  const g = code(join(AND, 'felles/build.gradle.kts'));
  assert.match(g, /tasks\.processResources \{[\s\S]*shared\/schemas\/moduler\.json[\s\S]*into\("no\/kristo\/felles\/moduler"\)/);
  assert.match(g, /shared\/schemas\/tilkoblinger\.json/);
  const m = code(join(AND, 'felles/src/main/kotlin/no/kristo/felles/moduler/Modulliste.kt'));
  assert.match(m, /RESSURS: String = "\/no\/kristo\/felles\/moduler\/moduler\.json"/);
  // JUnit sjekker at den innebygde kopien er lik kilden.
  assert.match(code(join(AND, 'felles/src/test/kotlin/no/kristo/felles/ModullisteTest.kt')), /fun innebygdKopiErLikKilden\(\)/);
});

test('appen henter GET /api/moduler?plattform=android, bufrer den og bruker den innebygde som reserve', () => {
  const vm = code(join(APP, 'AppViewModel.kt'));
  assert.match(vm, /api\.hlGet\("\/moduler\?plattform=android"\)/);
  assert.match(vm, /loadModuler\(\)/);
  assert.match(vm, /loadLocalModuler\(\)/);
  const mod = code(join(APP, 'Moduler.kt'));
  assert.match(mod, /Modulliste\.innebygd\(\)/);
  assert.match(mod, /prefs\.set\(PREF \+/);
});

test('fanelinja, Mer og modulvelgeren har ingen egen håndskrevet liste over moduler', () => {
  const fl = code(join(APP, 'Fanelinje.kt'));
  assert.match(fl, /val MAIN_TABS: List<TabItem> get\(\) = Moduler\.faner\(\)/);
  assert.doesNotMatch(fl, /TabItem\("finans", "Finans"/, 'ingen egen MAIN_TABS-liste');
  assert.doesNotMatch(code(join(APP, 'ui/Fanelinje.kt')), /Triple\("finans", "Finans", "kr"\)/, 'ingen egen MODS42-liste');
  const mer = code(join(APP, 'ui/Mer.kt'));
  assert.match(mer, /for \(m in liste\.moduler\) when \(m\.id\)/);
  // Hver Android-modul som kan åpnes fra Mer, har en rad der (navnet kommer fra lista).
  for (const m of ANDROID) if (!['oversikt'].includes(m.id)) assert.match(mer, new RegExp(`"${m.id}" -> `), `Mer mangler ${m.id}`);
});

test('ikonene i modullisten kan tegnes av appen (vektorikon, aldri tekst)', () => {
  const p17 = code(join(APP, 'ui/Paper17.kt'));
  const glyphs = new Set([...p17.matchAll(/^\s*"([^"]+)" -> (?:Icons|FamIcons46)/gm)].map((x) => x[1]));
  for (const m of ANDROID) assert.ok(glyphs.has(m.ikon.tegn), `${m.id}: tegnet ${m.ikon.tegn} mangler i glyphVector`);
  // Og SF Symbol-navnet som lagres på serveren for de nye tegnene (serveren godtar bare navn).
  const fl = code(join(APP, 'Fanelinje.kt'));
  for (const t of ['▶', '☼', '¶', '✎', '⚒', '⌁', '✶']) assert.match(fl, new RegExp(`"${t}" -> "[a-z.]+"`), `tabIconName25 mangler ${t}`);
});

test('kalendervisningene følger modullisten i begge Kalender-appene', () => {
  assert.match(code(join(AND, 'kalender/src/main/java/no/kristo/kalender/KalVm.kt')), /modul\("kalender"\)\?\.undersider\("visning"\)/);
  assert.match(code(join(APP, 'Kalender.kt')), /Moduler\.modul\("kalender"\)\?\.undersider\("visning"\)/);
});

test('Faste betalinger og Økonomi-fanene som på web', () => {
  const m15 = code(join(APP, 'Models15.kt'));
  assert.match(m15, /val FIN_TABS_DEFAULT = listOf\("oversikt", "liste", "budsjett", "abo"\)/);
  assert.match(m15, /"liste" to "Transaksjoner"/);
  assert.match(m15, /"sok" to "Glimt"/);
  assert.match(m15, /"abo" to "Faste betalinger"/);
  const fb = code(join(APP, 'ui/FasteBetalinger.kt'));
  assert.match(fb, /get\("\/faste-betalinger"\)/);
  assert.match(fb, /FasteBetalinger\.fra\(raw\)/);
  assert.doesNotMatch(fb, /LocalDate|ChronoUnit/, 'appen regner ikke ut datoene selv');
});

test('Innstillinger har sidene og rekkefølgen fra innstillinger[]', () => {
  const s = code(join(APP, 'ui/Set67Ui.kt'));
  const keys = { konto: 'konto', utseende: 'tilpass', varsler: 'notify', husstand: 'USERS68', glimt: '"glimt67"', tilkoblinger: '"integ"', moduler: '"modules"', enheter: '"enheter"', server: '"prog50"' };
  let last = -1;
  for (const i of LISTE.innstillinger) {
    const k = keys[i.id];
    assert.ok(k, `ukjent innstilling ${i.id}`);
    const at = s.indexOf(k.startsWith('"') || k === 'USERS68' ? `Menu67Row(${k}` : `Menu67Row("${k}"`);
    assert.ok(at > last, `${i.navn} står ikke i rekkefølgen fra modullisten`);
    last = at;
  }
  assert.match(code(join(APP, 'Integrasjoner.kt')), /TILKOBLINGER\.gruppe\(/);
});

test('gamle lenker går via aliasene, og dype lenker går forbi onboardingen (Q35)', () => {
  const vm = code(join(APP, 'AppViewModel.kt'));
  assert.match(vm, /Dyplenker\.mal\(Moduler\.liste,/);
  assert.match(vm, /Dyplenker\.fraHomelab\(/);
  assert.match(vm, /onboardDeferred = true/);
  assert.match(code(join(APP, 'ui/App.kt')), /vm\.onboardNeeded && !vm\.onboardDeferred/);
  assert.match(read(join(AND, 'app/src/main/AndroidManifest.xml')), /<data android:scheme="finanshub" \/>\s*<!--[\s\S]*?-->\s*<data android:scheme="homelab" \/>/);
});

test('ingen gamle navn i tekstene brukeren ser (Q1–Q12)', () => {
  for (const f of ['ui/Mer.kt', 'ui/Paper15.kt', 'ui/Paper.kt', 'ui/Set67Ui.kt', 'ui/Paper17.kt', 'ui/App.kt', 'widget/Widgets.kt']) {
    const c = code(join(APP, f));
    for (const gammel of ['Now Brief', 'Subscription OS', 'Huskeliste', 'Nyhetsleser', '"FinansHub"', 'Familie og kart']) {
      assert.ok(!c.includes(gammel), `${f}: «${gammel}»`);
    }
  }
});
