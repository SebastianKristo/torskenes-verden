// Fase 5 bølge 1 (FUNDAMENT-Android): kildesjekker for grunnmuren i apps/android – delte moduler, sikkerhet (D-android §8),
// logikk på serveren (§6), tema/typografi og navigasjonsskallet. Selve reglene testes av JUnit i :felles (./gradlew :felles:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const APP = join(AND, 'app/src/main/java/no/kristo/finanshub');
const KAL = join(AND, 'kalender/src/main/java/no/kristo/kalender');
const WEAR = join(AND, 'wear/src/main/java/no/kristo/finanshub/wear');
const FA = join(AND, 'felles-android/src/main/java/no/kristo/felles/android');
const raw = (p) => readFileSync(p, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function ktFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...ktFiles(p));
    else if (e.name.endsWith('.kt')) out.push(p);
  }
  return out;
}

test('versjonskatalog: alle modulene henter versjoner og plugins fra gradle/libs.versions.toml', () => {
  const cat = raw(join(AND, 'gradle/libs.versions.toml'));
  for (const k of ['agp', 'kotlin', 'composeBom', 'securityCrypto', 'junit']) assert.match(cat, new RegExp(`^${k} = "`, 'm'), k);
  assert.match(raw(join(AND, 'build.gradle.kts')), /alias\(libs\.plugins\.android\.application\) apply false/);
  for (const m of ['app', 'kalender', 'wear', 'felles', 'felles-android']) {
    const g = raw(join(AND, m, 'build.gradle.kts'));
    assert.ok(!/implementation\("[^"]+:[^"]+:[^"]+"\)/.test(g), `${m}: versjoner står i katalogen`);
    assert.match(g, /alias\(libs\.plugins\./, m);
  }
});

test('B4: kryptert lagring åpnes bare via SikkerLagring, som gjenoppretter i stedet for å krasje, og aldri ukryptert', () => {
  const s = strip(raw(join(FA, 'SikkerLagring.kt')));
  const apne = s.slice(s.indexOf('private fun apne('), s.indexOf('private fun flyttKlartekst('));
  assert.equal((apne.match(/try \{ return lag\(app, navn\) \} catch \(e: Exception\)/g) ?? []).length, 3, 'tre forsøk');
  assert.match(apne, /app\.deleteSharedPreferences\(navn\)/);
  assert.match(apne, /deleteEntry\(MasterKeys\.AES256_GCM_SPEC\.keystoreAlias\)/, 'ødelagt nøkkel byttes');
  assert.match(apne, /return MinneLagring\(\)/, 'siste reserve er minnet');
  assert.ok(!/getSharedPreferences\(navn/.test(apne), 'aldri en ukryptert fil med samme navn');
  for (const dir of [APP, KAL, WEAR]) {
    for (const f of ktFiles(dir)) {
      const c = strip(raw(f));
      assert.ok(!/EncryptedSharedPreferences\.create/.test(c), `${f}: bruk SikkerLagring.prefs`);
      assert.ok(!/getSharedPreferences\([^)]*_plain/.test(c), `${f}: ingen ukryptert reserve for tokens`);
    }
  }
  assert.match(raw(join(APP, 'Accounts.kt')), /SikkerLagring\.prefs\(ctx, "finanshub"\)/);
  assert.match(raw(join(KAL, 'KalApi.kt')), /SikkerLagring\.prefs\(ctx, FILE, gammelKlartekst = FILE \+ "_plain"\)/);
  assert.match(raw(join(WEAR, 'WearApi51.kt')), /SikkerLagring\.prefs\(ctx, "wear51", gammelKlartekst = "wear51_plain"\)/);
  assert.ok(existsSync(join(AND, 'felles-android/src/main/AndroidManifest.xml')));
});

test('S2: brukerinstallerte CA-er bare for lokale navn; B1: App Links også for os.smarthjemeksperten.no', () => {
  for (const m of ['app', 'kalender', 'wear']) {
    const xml = raw(join(AND, m, 'src/main/res/xml/network_security_config.xml')).replace(/<!--[\s\S]*?-->/g, '');
    const start = xml.indexOf('<base-config');
    const slutt = xml.indexOf('</base-config>') > 0 ? xml.indexOf('</base-config>') : xml.indexOf('/>', start);
    assert.ok(!/src="user"/.test(xml.slice(start, slutt)), `${m}: ikke for all trafikk`);
    for (const d of [...xml.matchAll(/<domain[^>]*>([^<]*)<\/domain>/g)].map((x) => x[1].trim())) assert.ok(['local', 'lan', 'home.arpa', 'internal'].includes(d), `${m}: ${d}`);
  }
  const man = raw(join(AND, 'app/src/main/AndroidManifest.xml'));
  for (const p of ['/l/', '/join/', '/app-auth']) {
    for (const h of ['home.kristo.no', 'os.smarthjemeksperten.no']) assert.ok(man.includes(`android:host="${h}" android:pathPrefix="${p}"`), `${h}${p}`);
  }
});

test('B3: CSV-eksporten hentes fra serveren og bygges aldri på Main', () => {
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  const f = vm.slice(vm.indexOf('fun exportCsv()'), vm.indexOf('private fun localCsv('));
  assert.match(f, /api\.bytes\(Api\.FINANS \+ "\/transactions\.csv"\)/);
  assert.match(f, /if \(e\.status != 404\) throw e/, 'bare eldre servere bruker reserven');
  assert.match(f, /withContext\(Dispatchers\.Default\) \{ localCsv\(parseTxList\(body\)\) \}/);
  assert.match(f, /shareFileIo\(/);
  assert.match(vm, /private suspend fun shareFileIo\([^)]*\) \{[\s\S]*?withContext\(Dispatchers\.IO\) \{ File\(/);
});
