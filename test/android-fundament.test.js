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

test('D §6: appen viser det serveren regner (neste trekk, neste forekomst), lokal regel bare som reserve', () => {
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  assert.match(vm, /suspend fun nextChargeLabel\(day: Int\?, month: Int\?, cycle: String\): String\? \{[\s\S]*?api\.get\("\/subscriptions\/next-charge\?\$q"\)/);
  const skjema = strip(raw(join(APP, 'ui/Abonnement.kt')));
  assert.match(skjema, /produceState\(nextChargeText\(day, billMonth, cycle\), day, billMonth, cycle\) \{[\s\S]*?vm\.nextChargeLabel\(day, billMonth, cycle\)\?\.let \{ value = it \}/);
  assert.match(strip(raw(join(APP, 'ui/Abonnement.kt'))), /val now: LocalDate = OsloDato\.iDag\(\)/, 'reserven bruker Oslo-datoen');
  assert.match(strip(raw(join(APP, 'P37.kt'))), /val next = it0\.nextDue \?: nextDue37\(it0\.due, it0\.rep\)/);
  assert.match(strip(raw(join(APP, 'P46.kt'))), /val next = before\.nextDue \?: nextDue37\(before\.due, before\.rep\)/);
  assert.match(strip(raw(join(APP, 'Models17.kt'))), /nextDue = t\.optStr\("nextDue"\)\?\.take\(10\)/);
  assert.match(strip(raw(join(APP, 'Calendar29.kt'))), /fun parseQuickLocal29\(txt: String, today: LocalDate = no\.kristo\.felles\.tid\.OsloDato\.iDag\(\)\)/);
  // Kalenders lokale hurtigtolking har felles fasit (JUnit i :kalender, kjørt av «Mobilapper»).
  const t = raw(join(AND, 'kalender/src/test/java/no/kristo/kalender/HurtigtolkingTest.kt'));
  assert.match(t, /shared\/testvektorer\/datoer\.json/);
  assert.match(raw(join(ROOT, '.github/workflows/mobile.yml')), /\.\/gradlew --no-daemon :felles:test :kalender:testDebugUnitTest/);
});

test('tema: FinansTheme gir tokenene (LocalDsColors, typografi fra tokens) uten hex, uten fontSize og uten dynamic color', () => {
  const ht = raw(join(APP, 'ui/designsystem/HomelabTheme.kt'));
  const c = strip(ht);
  assert.ok(!/Color\(0x/.test(c), 'ingen hex i temaet');
  assert.ok(!/fontSize\s*=/.test(c), 'størrelsene kommer fra DsText');
  for (const s of ['caption', 'footnote', 'subheadline', 'callout', 'body', 'headline', 'title3', 'title2', 'largeTitle']) assert.match(c, new RegExp(`val ${s}: TextStyle by lazy \\{ DsText\\.`), s);
  assert.match(c, /object HomelabTheme \{[\s\S]*?val colors: DsColors\s*@Composable @ReadOnlyComposable get\(\) = LocalDsColors\.current/);
  const th = strip(raw(join(APP, 'ui/Theme.kt')));
  const ft = th.slice(th.indexOf('fun FinansTheme('));
  assert.match(ft, /LocalDsColors provides DsPalette\.colors\(stil, paperDark\)/);
  assert.match(ft, /typography = HomelabTypography/);
  assert.ok(!/dynamicLightColorScheme|dynamicDarkColorScheme/.test(th), 'Q16: ingen dynamic color');
  // Generert kode redigeres aldri for hånd.
  assert.match(raw(join(APP, 'ui/designsystem/DesignTokens.kt')), /^\/\/ GENERERT av scripts\/design-tokens\.mjs/);
});

test('navigasjon: back() bruker tilbakestabelen med navngitte steg i fast rekkefølge, og skallet har innfelling på ett sted', () => {
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  const back = vm.slice(vm.indexOf('fun back(): Boolean {'), vm.indexOf('fun back(): Boolean {') + 400);
  assert.match(back, /return tilbakestabel\.tilbake\(\)/);
  assert.ok(!/when \{/.test(back), 'ingen when-kjede i back()');
  const tab = vm.slice(vm.indexOf('private val tilbakestabel: Tilbakestabel by lazy {'), vm.indexOf('val tilbakeRute: String'));
  const navn = [...tab.matchAll(/Tilbakesteg\("([a-z-]+)"/g)].map((m) => m[1]);
  // Rekkefølgen er den samme som den gamle when-kjeden: ark og detaljer øverst, sider og faner nederst, «forrige» sist.
  assert.deepEqual(navn.slice(0, 5), ['nyheter', 'original', 'redigering', 'detalj', 'rediger-hjem']);
  assert.deepEqual(navn.slice(-4), ['mer', 'fra-mer', 'til-hjem', 'forrige']);
  assert.equal(navn.length, 31);
  assert.equal(new Set(navn).size, navn.length);
  assert.match(tab, /Tilbakesteg\("forrige", \{ backTo != null \}\) \{ navigate\(backTo \?: Screen\.Homelab, null\) \}/);
  const skall = strip(raw(join(APP, 'ui/HomelabSkall.kt')));
  assert.match(skall, /contentWindowInsets = Innfelling\.trygg/);
  assert.match(skall, /val trygg: WindowInsets\s*@Composable get\(\) = WindowInsets\.safeDrawing/);
  assert.ok(existsSync(join(AND, 'felles/src/test/kotlin/no/kristo/felles/TilbakestabelTest.kt')));
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
