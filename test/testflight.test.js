// Prompt 57: TestFlight-opplasting fra GitHub Actions (.github/workflows/testflight.yml, docs/testflight.md).
// Kildetest: workflowen bruker App Store Connect-nøkkelen uten å skrive den ut, sletter nøkkelfila uansett utfall,
// hopper pent over uten hemmeligheter, og begge appene har ITSAppUsesNonExemptEncryption i Info.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => readFileSync(join(ROOT, p), 'utf8');
const WF = raw('.github/workflows/testflight.yml');
const HEMMELIGHETER = ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'IOS_TEAM_ID'];

/** Stegene i workflowen som tekstblokker (fra «- name:» til neste). */
function steg(wf) {
  return wf.split(/\n(?=\s+- name: )/).filter((b) => /^\s+- name: /.test(b));
}

test('workflowen kan startes manuelt med valg av app, og ved tag v*', () => {
  assert.match(WF, /workflow_dispatch:/);
  assert.match(WF, /options:\s*\[\s*alle,\s*homelab,\s*kalender,\s*kalender-mac\s*\]/);
  assert.match(WF, /tags:\s*\['v\*'\]/);
  // Begge appene med riktige skjema og bundle-id.
  assert.match(WF, /"scheme":\s*"FinansHub"/);
  assert.match(WF, /"scheme":\s*"Kalender"/);
});

test('bruker alle fire hemmelighetene, men skriver dem aldri ut', () => {
  for (const h of HEMMELIGHETER) assert.match(WF, new RegExp(`secrets\\.${h}\\b`), h);
  // Ingen echo/printf/cat av hemmelighetene eller nøkkelfila til loggen. Dekodingen går rett til fil.
  for (const linje of WF.split('\n')) {
    if (/^\s*#/.test(linje)) continue;
    assert.doesNotMatch(linje, /echo[^|>]*\$\{?\{?\s*(secrets\.|ASC_KEY_P8|ASC_KEY_ID|ASC_ISSUER_ID|TEAM_ID)/, linje);
    assert.doesNotMatch(linje, /\bcat\b[^|]*AuthKey/, linje);
    assert.doesNotMatch(linje, /set -x|ACTIONS_STEP_DEBUG/, linje);
  }
  // secrets.* brukes bare i env-blokker (ikke rett i run-skript eller if-uttrykk).
  for (const b of steg(WF)) {
    const run = b.split(/\n\s+run: \|/)[1] || '';
    assert.doesNotMatch(run, /secrets\./, `secrets direkte i run: ${b.split('\n')[0].trim()}`);
  }
  assert.doesNotMatch(WF, /if:[^\n]*secrets\./);
  // Nøkkelfila dekodes med streng umask til RUNNER_TEMP.
  assert.match(WF, /umask 077/);
  assert.match(WF, /base64 --decode > "\$RUNNER_TEMP\/AuthKey_/);
});

test('hopper pent over når hemmelighetene mangler', () => {
  assert.match(WF, /Mangler TestFlight-hemmeligheter/);
  assert.match(WF, /needs\.hemmeligheter\.outputs\.klar == 'true'/);
});

test('nøkkelfila og nøkkelringen slettes i et if: always()-steg', () => {
  const rydd = steg(WF).find((b) => /if:\s*always\(\)/.test(b) && /rm -f[^\n]*AuthKey_/.test(b));
  assert.ok(rydd, 'mangler ryddesteg med if: always() som sletter AuthKey_*.p8');
  assert.match(rydd, /security delete-keychain/);
});

test('signerer automatisk med API-nøkkelen (ingen .p12, ingen profiler i hemmeligheter)', () => {
  for (const flagg of ['-allowProvisioningUpdates', '-authenticationKeyPath', '-authenticationKeyID', '-authenticationKeyIssuerID']) {
    assert.ok(WF.split(flagg).length - 1 >= 2, `${flagg} både i archive og -exportArchive`);
  }
  assert.match(WF, /-exportArchive/);
  assert.match(WF, /CODE_SIGN_STYLE=Automatic/);
  const kode = WF.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(kode, /IOS_CERT_P12|\.p12|mobileprovision/);
});

test('build-nummer fra run_number og marketing-versjon fra øverste ## [x.y.z] i CHANGELOG.md', () => {
  assert.match(WF, /CURRENT_PROJECT_VERSION="\$BUILD"/);
  assert.match(WF, /github\.run_number/);
  assert.match(WF, /MARKETING_VERSION="\$V"/);
  assert.match(WF, /CHANGELOG\.md/);
});

test('ExportOptions for TestFlight: app-store-connect, upload, automatisk, team-plassholder', () => {
  const p = raw('.github/ios-ExportOptions-testflight.plist');
  const verdi = (k) => p.match(new RegExp(`<key>${k}</key>\\s*<string>([^<]*)</string>`))?.[1];
  assert.equal(verdi('method'), 'app-store-connect');
  assert.equal(verdi('destination'), 'upload');
  assert.equal(verdi('signingStyle'), 'automatic');
  assert.equal(verdi('teamID'), '__TEAM_ID__');
  assert.match(WF, /ios-ExportOptions-testflight\.plist/);
  // Den gamle (manuelle) ExportOptions for release.yml er uendret.
  assert.match(raw('.github/ios-ExportOptions.plist'), /<string>manual<\/string>/);
});

test('ITSAppUsesNonExemptEncryption = NO for Homelab og Kalender i project.yml', () => {
  const y = raw('apps/ios/project.yml');
  for (const [target, plist] of [['FinansHub', 'FinansHub/Info.plist'], ['Kalender', 'Kalender/Info.plist']]) {
    const start = y.indexOf(`\n  ${target}:\n`);
    assert.ok(start >= 0, target);
    const slutt = y.slice(start + 1).search(/\n {2}[A-Za-z]+:\n/);
    const blokk = y.slice(start, start + 1 + slutt);
    const info = blokk.slice(blokk.indexOf(`path: ${plist}`));
    assert.match(info, /\n\s+ITSAppUsesNonExemptEncryption: false\n/, target);
  }
});

test('App Group og HealthKit står i entitlements for de riktige targetene', () => {
  const y = raw('apps/ios/project.yml');
  const blokk = (t) => { const s = y.indexOf(`\n  ${t}:\n`); return y.slice(s, s + 1 + y.slice(s + 1).search(/\n {2}[A-Za-z]+:\n/)); };
  for (const t of ['FinansHub', 'FinansHubWidgets', 'Kalender', 'KalenderWidgets']) {
    assert.match(blokk(t), /com\.apple\.security\.application-groups:\s*\n\s+- group\.no\.kristo\.finanshub/, t);
  }
  assert.match(blokk('FinansHub'), /com\.apple\.developer\.healthkit: true/);
  for (const t of ['FinansHubWidgets', 'Kalender', 'KalenderWidgets']) assert.doesNotMatch(blokk(t), /healthkit/, t);
});

test('ingen App Store Connect-nøkkel (.p8) i repoet', () => {
  const hits = [];
  const gå = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.git', 'build', '.gradle', 'dist', 'data'].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) gå(p); else if (/\.p8$/i.test(e.name) || /^AuthKey_/.test(e.name)) hits.push(relative(ROOT, p));
    }
  };
  gå(ROOT);
  assert.deepEqual(hits, []);
});

test('dokumentasjonen finnes og er lenket fra README og CLAUDE.md', () => {
  assert.ok(existsSync(join(ROOT, 'docs/testflight.md')));
  const d = raw('docs/testflight.md');
  for (const h of HEMMELIGHETER) assert.match(d, new RegExp(h), h);
  assert.match(d, /group\.no\.kristo\.finanshub/);
  assert.match(d, /Admin/);
  assert.match(raw('README.md'), /docs\/testflight\.md/);
  assert.match(raw('CLAUDE.md'), /docs\/testflight\.md/);
});

test('Push i TestFlight-bygget: aps-environment bare for Homelab, bare i TestFlight-jobben, og sjekket i signaturen', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/testflight.yml'), 'utf8');
  // Legges inn etter xcodegen, bare for hovedappen (Live Activities og varsler), og sjekkes etter arkiveringen.
  assert.match(wf, /PlistBuddy -c "Add :aps-environment string development" FinansHub\/FinansHub\.entitlements/);
  assert.match(wf, /if \[ "\$SCHEME" = FinansHub \]/);
  assert.match(wf, /grep -q aps-environment/);
  // De usignerte byggene (release.yml, mobile.yml) og project.yml får ikke push, så sideloading virker som før.
  for (const f of ['.github/workflows/release.yml', '.github/workflows/mobile.yml', 'apps/ios/project.yml']) {
    assert.doesNotMatch(readFileSync(join(ROOT, f), 'utf8'), /aps-environment:|Add :aps-environment/, f);
  }
  const doc = readFileSync(join(ROOT, 'docs/testflight.md'), 'utf8');
  assert.match(doc, /Push Notifications/);
  assert.match(doc, /apns_env|Miljø.*produksjon/);
});

test('Kalender for Mac i TestFlight: egen app i matrisen, sandkassen uten unntak, oppdatereren av og App Group med team', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/testflight.yml'), 'utf8');
  assert.match(wf, /options: \[alle, homelab, kalender, kalender-mac\]/);
  assert.match(wf, /"scheme": "KalenderMac", "bundle": "no\.kristo\.kalender\.mac", "widget": "KalenderMacWidgets", "mal": "generic\/platform=macOS"/);
  assert.match(wf, /"plugins": "Contents\/PlugIns", "mac": true/);
  assert.match(wf, /Delete :com\.apple\.security\.temporary-exception\.files\.absolute-path\.read-write/);
  assert.match(wf, /Delete :com\.apple\.security\.temporary-exception\.files\.absolute-path\.read-only/);
  assert.match(wf, /group\.no\.kristo\.kalender/);
  assert.match(wf, /EKSTRA=\(KAL_APP_STORE=YES "CODE_SIGN_IDENTITY=Apple Development"\)/);
  assert.match(wf, /"\$\{EKSTRA\[@\]\}"/);
  // project.yml: flagget er NO som standard (DMG-en fra release.yml har oppdatereren), Info-nøkkelen leses av appen.
  const y = readFileSync(join(ROOT, 'apps/ios/project.yml'), 'utf8');
  const mac = y.slice(y.indexOf('\n  KalenderMac:\n'), y.indexOf('\n  KalenderMacWidgets:\n'));
  assert.match(mac, /KAL_APP_STORE: "NO"/);
  assert.match(mac, /KalAppStore: "\$\(KAL_APP_STORE\)"/);
  assert.match(mac, /ITSAppUsesNonExemptEncryption: false/);
  assert.match(mac, /temporary-exception/, 'DMG-bygget beholder unntakene for sin egen oppdaterer');
  const upd = readFileSync(join(ROOT, 'apps/ios/KalenderMac/Sources/MacUpdater.swift'), 'utf8');
  assert.match(upd, /static let appStore: Bool = \(Bundle\.main\.object\(forInfoDictionaryKey: "KalAppStore"\) as\? String\) == "YES"/);
  assert.match(upd, /if MacUpdater43\.appStore \{ return \}/);
  assert.match(upd, /guard !MacUpdater43\.appStore, autoDl/);
});
