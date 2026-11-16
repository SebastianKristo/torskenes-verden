// Opprydding (rest-ios): kildetester for de siste iOS-radene i STATUS.md (C-B3, C-B5, C-S4, Q19, filnavn, Store).
// Ingen Swift-kompilator her; CI-jobben «Mobilapper» bygger appen og kjører HomelabTests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const IOS = join(import.meta.dirname, '..', 'apps', 'ios');
const raw = (p) => readFileSync(join(IOS, p), 'utf8');
const swiftFiles = (dir = IOS) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n.endsWith('.xcassets') ? [] : swiftFiles(p);
  return n.endsWith('.swift') ? [p] : [];
});
// Uten kommentarer (// og /* */), så forklaringer ikke teller.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');

test('C-B3: KalNet sender aldri tom kropp stille – ugyldig JSON gir feil', () => {
  const src = code(raw('SharedKal/Core/KalNet.swift'));
  assert.doesNotMatch(src, /httpBody\s*=\s*try\?/, 'ingen try? på kroppen');
  assert.match(src, /JSONSerialization\.isValidJSONObject\(json\)/, 'sjekker kroppen før den sendes');
  assert.match(src, /throw KalNetError\(status: 0, message: "Ugyldig forespørsel"\)/);
});

test('filnavn: ingen Swift-filer med prompt- eller versjonsnummer i navnet', () => {
  const nummer = swiftFiles().map((f) => relative(IOS, f)).filter((f) => /[A-Za-z]\d+[A-Za-z]*\.swift$/.test(f.split('/').pop()));
  assert.deepEqual(nummer, []);
  for (const f of ['FinansHub/Sources/GlimtCalendarCard.swift', 'FinansHub/Sources/FamilyCalendar.swift', 'FinansHub/Sources/MediaPlayback.swift',
    'Shared/CalendarShared.swift', 'Shared/CalendarWidgetViews.swift']) assert.ok(existsSync(join(IOS, f)), f);
});

test('C-S4: ingen fast lokal standardadresse i appene – den kommer fra serveren eller QR, og det lagrede beholdes', () => {
  const alle = swiftFiles().map((f) => [relative(IOS, f), readFileSync(f, 'utf8')]);
  // Heller ikke i kommentarer: adressen gjelder bare én husstand.
  assert.deepEqual(alle.filter(([, s]) => /10\.69\.1\.39/.test(s)).map(([f]) => f), []);
  const yml = raw('project.yml');
  assert.doesNotMatch(yml, /10\.69\.1\.39/);
  assert.doesNotMatch(yml, /HomelabLocal47|KalDefaultLocal47/);
  // Homelab: ingen standard, eksempel i tomme felt, og «Tilbakestill» beholder lagret lokal adresse når serveren ikke har oppgitt noen.
  const d = code(raw('FinansHub/Sources/ServerDefaults.swift'));
  assert.match(d, /static let localExample: String = "http:\/\/192\.168\.1\.10:3000"/);
  assert.match(d, /static func resetLocal\(_ current: String\) -> String \{ defaultLocal\.isEmpty \? current : defaultLocal \}/);
  assert.match(d, /store\.updateAddresses\(local: Server47\.resetLocal\(store\.account\?\.local \?\? ""\), external: Server47\.defaultExternal\)/);
  for (const f of ['FinansHub/Sources/LoginServerGear.swift', 'FinansHub/Sources/SettingsView.swift']) {
    const s = code(raw(f));
    assert.match(s, /local = Server47\.resetLocal\(local\)/, f);
    assert.doesNotMatch(s, /local = Server47\.defaultLocal/, f);
  }
  // Kalender (iOS og Mac): samme regel.
  const a = code(raw('SharedKal/Core/KalAuthCore.swift'));
  assert.doesNotMatch(a, /standardLocal47/);
  assert.match(a, /return v\.isEmpty \? \[KalAuth41\.defaultLocal47\]\.filter \{ \(s: String\) -> Bool in !s\.isEmpty \} : v/);
  const k = code(raw('SharedKal/Core/KalServerCore.swift'));
  assert.match(k, /static func resetLocal\(_ current: String\) -> String \{ standardLocal\.isEmpty \? current : standardLocal \}/);
  assert.match(k, /storeLocally\(external: standardExternal, local: keep\)/);
  for (const f of ['Kalender/Sources/KalLogin.swift', 'KalenderMac/Sources/MacLogin.swift']) {
    const s = code(raw(f));
    assert.match(s, /local = KalSrv47\.resetLocal\(local\)/, f);
    assert.match(s, /field\("Lokal adresse", KalSrv47\.localPlaceholder, \$local, locText, locOk\)/, f);
  }
  assert.match(code(raw('FinansHub/Sources/LoginServerGear.swift')), /field\("Lokal adresse", Server47\.localPlaceholder, \$local, locResult\)/);
});

test('Q19 Media: én sti per kall – ingen gamle /media/sonarr|radarr|qbit|prowlarr-stier som reserve ved 404', () => {
  const src = join('FinansHub', 'Sources');
  const filer = ['MediaModel.swift', 'MediaSheets.swift', 'MediaBanner.swift', 'MediaTracking.swift', 'MediaSearchJobs.swift'];
  for (const f of filer) {
    const s = code(raw(join(src, f)));
    assert.doesNotMatch(s, /"\/media\/(sonarr|radarr|qbit|qbittorrent|prowlarr)\//, `${f}: gamle stier`);
    assert.doesNotMatch(s, /"\/media\/calendar\?/, `${f}: /media/calendar som reserve for /media/upcoming`);
    assert.doesNotMatch(s, /\/resume"\]/, `${f}: /resume som reserve for /start`);
    // Ingen stilister med flere stier («404 = neste»).
    assert.doesNotMatch(s, /fetch\(store, \["[^"\]]*", "/, `${f}: flere stier`);
  }
  // Serverens svar for kvalitetsprofiler og rotmapper er {sonarr:[…], radarr:[…]}.
  const m = code(raw(join(src, 'MediaModel.swift')));
  assert.match(m, /Media43\.rows\(d, \["profiles", "sonarr"\]\)/);
  assert.match(m, /Media43\.rows\(d, \["profiles", "radarr"\]\)/);
});

test('C-B5: én ruting for innst-sidene (InnstSide), brukt av både telefon og iPad', () => {
  const paper = code(raw('FinansHub/Sources/Paper.swift'));
  const wide = code(raw('FinansHub/Sources/SettingsWide.swift'));
  const alle = swiftFiles().map((f) => code(readFileSync(f, 'utf8')));
  const def = alle.filter((s) => /struct InnstSide: View/.test(s));
  assert.equal(def.length, 1, 'InnstSide finnes ett sted');
  for (const side of ['Tilpass39Page()', 'AppProfile39Page()', 'FamilySettingsView()', 'HealthPosSettings20()', 'HaHealthPage42()', 'PaperSettingsSub(key:']) {
    assert.ok(def[0].includes(side), side);
    // Ingen av rutefilene har sin egen kopi lenger.
    assert.ok(!paper.includes(side) && !wide.includes(side), `${side} rutes bare i InnstSide`);
  }
  assert.match(paper, /hasPrefix\("innst-"\): InnstSide\(id: t\)/);
  assert.match(wide, /hasPrefix\("innst-"\): InnstSide\(id: t\)/);
});
