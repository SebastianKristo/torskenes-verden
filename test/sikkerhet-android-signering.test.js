// Opprydding fase 0b (K2): Android-signeringsnøkkelen og passordet lå i repoet, og alle bygg uten ANDROID_KEYSTORE_*
// ble signert med den. Nøkkelen er fjernet: release krever egen nøkkel fra miljøet, debug bruker Androids standard
// debug-nøkkel. Se docs/android-signering.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const raw = (p) => readFileSync(join(ROOT, p), 'utf8');
const GRADLE = ['apps/android/build.gradle.kts', 'apps/android/app/build.gradle.kts', 'apps/android/kalender/build.gradle.kts', 'apps/android/wear/build.gradle.kts'];
const MELDING = 'Release-bygg krever egen signeringsnøkkel, og ANDROID_KEYSTORE_* er ikke satt. ' +
  'Lag nøkkelen med scripts/android-nokkel.sh og legg inn de fire hemmelighetene, se docs/android-signering.md.';

/** Alle filer i repoet utenom node_modules, .git og byggmapper. */
function files(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'build', '.gradle', 'dist'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}

test('ingen nøkkellager (.jks, .keystore, .p12) i repoet', () => {
  const hits = files(ROOT).filter((f) => /\.(jks|keystore|p12|pfx)$/i.test(f)).map((f) => relative(ROOT, f));
  assert.deepEqual(hits, []);
  assert.ok(!existsSync(join(AND, 'signing/sideload.jks')));
  assert.ok(!existsSync(join(AND, 'signing')) || readdirSync(join(AND, 'signing')).length > 0, 'tom signing-mappe er fjernet');
});

test('gradle-filene har ingen faste passord og ingen sideload-nøkkel', () => {
  for (const f of GRADLE) {
    const g = raw(f);
    assert.doesNotMatch(g, /(storePassword|keyPassword)\s*=\s*"/, `${f}: passord med fast verdi`);
    assert.doesNotMatch(g, /finanshub-sideload|sideload\.jks|create\("sideload"\)/, f);
    assert.doesNotMatch(g, /file\("[^"]*\.jks"\)/, `${f}: peker ikke på en nøkkelfil i repoet`);
  }
});

test('uten nøkkel: debug signeres med standard debug-nøkkel og advarer, release stopper med tydelig melding', () => {
  const root = raw('apps/android/build.gradle.kts');
  assert.ok(root.replace(/"\s*\+\s*\n\s*"/g, '').includes(MELDING), 'samme melding som i release-workflowen');
  assert.match(root, /if \(sign86\.isEmpty\(\)\) \{\s*logger\.warn\("ADVARSEL \(signering\)[^\n]*standard debug-nøkkel/);
  assert.match(root, /kan ikke installeres over en tidligere installert versjon/);
  assert.match(root, /gradle\.taskGraph\.whenReady \{[\s\S]*?t\.name\.endsWith\("Release"\)[\s\S]*?"assemble", "bundle", "package", "install"[\s\S]*?throw GradleException\(utenNokkel\)/);
  for (const m of ['app', 'kalender', 'wear']) {
    const g = raw(`apps/android/${m}/build.gradle.kts`);
    const bt = g.slice(g.indexOf('buildTypes {'), g.indexOf('compileOptions {'));
    // Ingen signingConfig uten egen nøkkel – da bruker AGP sin debug-nøkkel for debug, og release stoppes i rotfila.
    for (const l of bt.split('\n').filter((x) => /signingConfig =/.test(x))) assert.match(l, /^\s*if \(sign86\.isNotEmpty\(\)\) signingConfig = signingConfigs\.getByName\("release"\)$/, `${m}: ${l.trim()}`);
  }
});

test('release-workflowen stopper i første jobb uten nøkkel, før Android og iOS', () => {
  const y = raw('.github/workflows/release.yml');
  const jobs = y.slice(y.indexOf('\njobs:'));
  const first = jobs.match(/\njobs:\n(?:\s*#.*\n)*  ([a-z0-9_-]+):/)[1];
  assert.equal(first, 'signeringsnokkel');
  const job = jobs.slice(jobs.indexOf('  signeringsnokkel:'), jobs.indexOf('\n  android:'));
  assert.match(job, /HAR_ANDROID_NOKKEL: \$\{\{ secrets\.ANDROID_KEYSTORE_BASE64 != '' \}\}/);
  assert.match(job, /if \[ "\$HAR_ANDROID_NOKKEL" != "true" \]; then\s*echo "::error title=Android-signering::([^"]+)"\s*exit 1\s*fi/);
  assert.equal(job.match(/::error title=Android-signering::([^"]+)"/)[1], MELDING);
  for (const j of ['android', 'ios']) assert.match(jobs, new RegExp(`\\n  ${j}:\\n    needs: signeringsnokkel\\n`), `${j} venter på sjekken`);
  assert.doesNotMatch(y, /fast nøkkel|nøkkelen i repoet som før/);
});

test('Mobilapper bygger fortsatt debug uten hemmeligheter, med advarsel', () => {
  const y = raw('.github/workflows/mobile.yml');
  const job = y.slice(y.indexOf('\n  android:'), y.indexOf('\n  ios:'));
  assert.match(job, /\.\/gradlew --no-daemon assembleDebug/);
  assert.doesNotMatch(job, /assembleRelease/);
  assert.match(job, /if: env\.HAR_ANDROID_NOKKEL != 'true'\s*run: echo "::warning title=Android-signering::[^"]*kan ikke installeres over en tidligere installert versjon/);
});

test('scripts/android-nokkel.sh lager PKCS12/RSA 4096 og skriver ikke passordet ut', () => {
  const f = join(ROOT, 'scripts/android-nokkel.sh');
  assert.ok(statSync(f).mode & 0o100, 'kjørbar');
  const s = readFileSync(f, 'utf8');
  execFileSync('bash', ['-n', f]);
  assert.match(s, /keytool -genkeypair[^\n]*-storetype PKCS12[^\n]*-keyalg RSA -keysize 4096/);
  assert.match(s, /-storepass:env ANDROID_NOKKEL_PW -keypass:env ANDROID_NOKKEL_PW/, 'passordet via miljøet, ikke som argument');
  assert.match(s, /read -rsp/, 'passordet leses uten ekko');
  assert.match(s, /umask 077/);
  for (const n of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) assert.ok(s.includes(n), n);
  // Passordet står aldri i echo/printf eller sendes til en fil.
  for (const l of s.split('\n')) {
    assert.doesNotMatch(l, /(echo|printf)[^;|&]*\$\{?(PW|ANDROID_NOKKEL_PW)\b/, `skriver ikke passordet: ${l.trim()}`);
    assert.doesNotMatch(l, /\$\{?(PW|ANDROID_NOKKEL_PW)\}?"?\s*>/, `skriver ikke passordet til fil: ${l.trim()}`);
  }
  assert.doesNotMatch(s, /set -x/);
});

test('docs/android-signering.md: nøkkelen er fjernet, hva du må gjøre, avinstallering og ingen release uten hemmeligheter', () => {
  const d = raw('docs/android-signering.md');
  assert.match(d, /\*\*Den nøkkelen er fjernet\.\*\*/);
  assert.match(d, /scripts\/android-nokkel\.sh/);
  assert.match(d, /Settings → Secrets and variables → Actions/);
  assert.match(d, /Avinstaller \*\*Homelab\*\*, \*\*Kalender\*\* og \*\*Wear-appen\*\*/);
  assert.match(d, /\*\*Ingen release\.\*\*/);
  assert.doesNotMatch(d, /-storepass|-keypass|finanshub-sideload/);
});
