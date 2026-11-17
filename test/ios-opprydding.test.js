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

test('Q19 Kart: ingen lokale demodata når serveren ikke svarer – «Ingen kontakt» i stedet', () => {
  const m = code(raw('FinansHub/Sources/KartModel.swift'));
  assert.doesNotMatch(m, /demoZones|demoStops/);
  assert.match(m, /var offline: Bool = false/);
  assert.match(m, /var sourceText: String \{ demo \? "DEMO-DATA" : \(offline \? "INGEN KONTAKT MED SERVEREN" : "SANNTID · ENTUR"\) \}/);
  const p = code(raw('FinansHub/Sources/KartPage.swift'));
  assert.match(p, /foregroundStyle\(m\.demo \|\| m\.offline \? DS\.color\(\.warning, stil: \.papir\)/);
});

test('Q19 2FA, Finn og Avspilling: ingen reserve til eldre stier ved 404', () => {
  const t = code(raw('FinansHub/Sources/TwoFactorSetup.swift'));
  assert.doesNotMatch(t, /\/auth\/totp\//, '2FA bruker bare /auth/2fa/…');
  assert.match(t, /private func post\(_ store: Store, _ path: String, _ body: \[String: Any\]\) async throws -> Data/);
  const f = code(raw('FinansHub/Sources/FinnAnnonse.swift'));
  const refresh = f.slice(f.indexOf('func refresh('), f.indexOf('func image('));
  assert.doesNotMatch(refresh, /status == 404/, '«Hent på nytt» prøver ikke POST /finn/:id/ad etter 404');
  const mf = code(raw('FinansHub/Sources/MediaFiles.swift'));
  assert.doesNotMatch(mf, /Playback44Stats/);
  assert.match(mf, /Playback44Note\(text: "Serveren har ikke statistikk for avspilling ennå\. Oppdater serveren\.", red: false\)/);
  assert.equal(swiftFiles().filter((p) => /struct Playback44Stats\b/.test(readFileSync(p, 'utf8'))).length, 0, 'den gamle visningen er død og slettet');
});

test('Struktur: Domener er ute av Store (@Observable-modell med @Environment, Store videresender)', () => {
  const m = code(raw('FinansHub/Sources/DomenerModell.swift'));
  assert.match(m, /@MainActor\s+@Observable\s+final class DomenerModell \{/);
  for (const v of ['var domains: \\[DomainRef\\]\\?', 'var domain: String\\?', 'var analytics: Analytics\\?', 'var tab: DomTab', 'var range: String', 'var allMode: Bool', 'var all: \\[String: Analytics\\]', 'var manager: Bool']) {
    assert.match(m, new RegExp(v), v);
  }
  assert.match(m, /func load\(_ store: Store\) async throws/);
  const s = code(raw('FinansHub/Sources/Store.swift'));
  assert.match(s, /let domener: DomenerModell = DomenerModell\(\)/);
  // Skjermene bruker fortsatt store.domains osv.: videresendende egenskaper, ingen egen lagring i Store.
  for (const [navn, til] of [['domains', 'domains'], ['domain', 'domain'], ['analytics', 'analytics'], ['domTab', 'tab'], ['domRange', 'range'], ['domAllMode', 'allMode'], ['domAll', 'all'], ['domainManager', 'manager']]) {
    assert.match(s, new RegExp(`var ${navn}: [^{\\n]+\\{ get \\{ domener\\.${til} \\} set \\{ domener\\.${til} = newValue \\} \\}`), navn);
  }
  assert.match(s, /func loadDomains\(\) async throws \{ try await domener\.load\(self\) \}/);
  // Injisert sammen med Store overalt (ark og egne vinduer setter miljøet på nytt).
  const fh = swiftFiles(join(IOS, 'FinansHub')).map((f) => [relative(IOS, f), code(readFileSync(f, 'utf8'))]);
  assert.deepEqual(fh.filter(([f, c]) => !f.endsWith('HomelabMiljo.swift') && /\.environment\(store\)/.test(c)).map(([f]) => f), [], 'bruk .homelabMiljo(store)');
  assert.match(code(raw('FinansHub/Sources/HomelabMiljo.swift')), /\.environment\(store\)\s*\.environment\(store\.domener\)/);
  assert.match(code(raw('FinansHub/Sources/PaperDomains.swift')), /@Environment\(DomenerModell\.self\) private var dom/);
});

test('Struktur: Finn, Matplan, Boliger og Aksjer er ute av Store etter samme mønster (modell, videresending, homelabMiljo)', () => {
  const s = code(raw('FinansHub/Sources/Store.swift'));
  const miljo = code(raw('FinansHub/Sources/HomelabMiljo.swift'));
  const domener = [
    ['FinnModell', 'finnModell', [['finn', 'finn'], ['finnSel', 'sel'], ['finnDetail', 'detail'], ['finnBusy', 'busy']],
      ['func loadFinn\\(\\) async throws \\{ try await finnModell\\.load\\(self\\) \\}', 'func openFinn\\(_ id: Int\\) \\{ finnModell\\.open\\(id, self\\) \\}']],
    ['MatplanModell', 'matplan', [['week', 'week'], ['matDay', 'day'], ['matFull', 'full']],
      ['func loadWeek\\(\\) async throws \\{ try await matplan\\.load\\(self\\) \\}', 'func addToShop\\(_ items: \\[String\\]\\) \\{ matplan\\.addToShop\\(items, self\\) \\}']],
    ['BoligerModell', 'boliger', [['folders', 'folders'], ['folder', 'folder'], ['boligCats', 'cats'], ['uploadFolder', 'uploadFolder']],
      ['func openFolder\\(_ id: Int\\?\\) \\{ boliger\\.open\\(id, self\\) \\}', 'func loadBoligCategories\\(\\) async \\{ await boliger\\.loadCategories\\(self\\) \\}',
        'func addFolderEntry\\(_ desc: String, _ amount: String, paidBy: String\\?, targetId: Int\\? = nil, categoryId: Int\\? = nil\\) \\{ boliger\\.addEntry\\(desc, amount, paidBy: paidBy, targetId: targetId, categoryId: categoryId, self\\) \\}']],
    ['AksjerModell', 'aksjer', [['stocks', 'stocks'], ['stockPeriod', 'period'], ['stocksX', 'x'], ['stockScreen', 'screen'], ['stockSel', 'sel'], ['stockFrom', 'from']],
      ['case \\.stocks: try await aksjer\\.load\\(self\\)', 'func syncStocks\\(\\) \\{ aksjer\\.sync\\(self\\) \\}']],
  ];
  for (const [type, prop, vars, funcs] of domener) {
    const m = code(raw(`FinansHub/Sources/${type}.swift`));
    assert.match(m, new RegExp(`@MainActor\\s+@Observable\\s+final class ${type} \\{`), type);
    assert.match(s, new RegExp(`let ${prop}: ${type} = ${type}\\(\\)`), type);
    for (const [navn, til] of vars) {
      assert.match(s, new RegExp(`var ${navn}: [^{\\n]+\\{ get \\{ ${prop}\\.${til} \\} set \\{ ${prop}\\.${til} = newValue \\} \\}`), navn);
    }
    for (const f of funcs) assert.match(s, new RegExp(f), f);
    assert.match(miljo, new RegExp(`\\.environment\\(store\\.${prop}\\)`), prop);
  }
  // Ingen egen lagring igjen i Store for disse feltene.
  assert.doesNotMatch(s, /^\s+var (finn|finnSel|finnDetail|finnBusy|week|matDay|matFull|folders|folder|boligCats|uploadFolder|stocks|stockPeriod|stocksX|stockScreen|stockSel|stockFrom)(: [^{\n]+)?( = [^{\n]+)?$/m);
});

test('Struktur: Sporing er ute av Store (SporingModell eier tilstanden og kallene, Store videresender)', () => {
  const s = code(raw('FinansHub/Sources/Store.swift'));
  const m = code(raw('FinansHub/Sources/SporingModell.swift'));
  assert.match(m, /@MainActor\s+@Observable\s+final class SporingModell \{/);
  assert.match(s, /let sporing: SporingModell = SporingModell\(\)/);
  for (const [navn, til] of [['tracking', 'tracking'], ['homePackages', 'homePackages'], ['trkSel', 'sel'], ['trkFilter', 'filter'], ['trkChecking', 'checking'],
    ['trkTab', 'tab'], ['trkSettings', 'settings'], ['trkOrder', 'order'], ['paperTrackFull', 'full'], ['trackAddOpen', 'addOpen']]) {
    assert.match(s, new RegExp(`var ${navn}: [^{\\n]+\\{ get \\{ sporing\\.${til} \\} set \\{ sporing\\.${til} = newValue \\} \\}`), navn);
  }
  assert.doesNotMatch(s, /^\s+var (tracking|homePackages|trkSel|trkFilter|trkChecking|trkTab|trkSettings|trkOrder|paperTrackFull|trackAddOpen)(: [^{\n]+)?( = [^{\n]+)?( \{)?$/m);
  // Rekkefølgen lagres som før.
  assert.match(m, /UserDefaults\.standard\.stringArray\(forKey: "fh_trk_order"\) \?\? \["add", "shipments", "notify", "carriers"\]/);
  // Kallene bor i modellen; Store-utvidelsene videresender (skjermene kaller store.loadTracking() osv. som før).
  for (const f of ['func load\\(_ store: Store\\) async throws', 'func poll\\(_ store: Store\\) async', 'func add\\(', 'func archive\\(', 'func delete\\(', 'func check\\(_ store: Store\\)',
    'func setPref\\(', 'func setSource\\(', 'func notify\\(_ t: TrackingData, _ store: Store\\)', 'func refresh\\(_ store: Store\\) async']) {
    assert.match(m, new RegExp(f), f);
  }
  const tr = code(raw('FinansHub/Sources/Tracking.swift'));
  assert.match(tr, /func loadTracking\(\) async throws \{ try await sporing\.load\(self\) \}/);
  assert.match(tr, /func notifyTracking\(_ t: TrackingData\) \{ sporing\.notify\(t, self\) \}/);
  assert.doesNotMatch(tr, /callAt\("\/api", "(GET|POST|PATCH|PUT|DELETE)", "\/tracking/);
  assert.match(code(raw('FinansHub/Sources/TrackCarriers.swift')), /func refreshTracking22\(\) async \{ await sporing\.refresh\(self\) \}/);
  assert.match(code(raw('FinansHub/Sources/HomelabMiljo.swift')), /\.environment\(store\.sporing\)/);
});

test('Q19: Finn har ikke lenger «404 → Oppdater homelab»-reserver (serveren har endepunktene)', () => {
  const m = code(raw('FinansHub/Sources/FinnModell.swift'));
  assert.doesNotMatch(m, /status == 404/);
  assert.doesNotMatch(m, /Oppdater homelab/);
  assert.doesNotMatch(code(raw('FinansHub/Sources/Store.swift')), /Serveren (støtter ikke opplasting til Finn|kan ikke hente annonser)/);
  const srv = readFileSync(join(IOS, '..', '..', 'server', 'finans', 'finn-routes.js'), 'utf8');
  for (const r of ["api.get('/finn/:id'", "api.post('/finn/:id/ad'", "api.post('/finn/:id/files'", "api.post('/finn/:id/emails'", "api.delete('/finn/:id/files/:fid'", "api.delete('/finn/:id/emails/:eid'"]) {
    assert.ok(srv.includes(r), r);
  }
});

test('Q19: flere «404 → gammel vei / lokalt»-reserver er borte der serveren har endepunktet', () => {
  const src = (f) => code(raw(`FinansHub/Sources/${f}`));
  const root = join(IOS, '..', '..');
  const srv = (f) => readFileSync(join(root, f), 'utf8');
  // Gjøremål: Glimt deler opp beskjeden på serveren; telefonen gjør det bare uten nett.
  const tg = src('TasksGlimt.swift');
  assert.doesNotMatch(tg, /e\.status == 404 \|\| e\.status == 405 \|\| e\.status == 0/);
  assert.match(tg, /if e\.status == 0 \{\s*await self\.localSplit/);
  assert.match(srv('server/gjoremal/glimt-jobs.js'), /api\.post\('\/glimt'/);
  // AI-søk: jobbmodus uten omvei om det synkrone kallet ved 404.
  const ai = src('AiSearchJob.swift');
  assert.match(ai, /let first: Data = try await api\.callAt\("\/finans\/api", "POST", "\/search\/ai\?async=1"/);
  assert.match(srv('server/finans/routes.js'), /api\.post\('\/search\/ai'/);
  // Kvittering: /receipts/scan finnes, ingen omvei om den gamle opplastingen ved 404.
  const kf = src('KvitteringFlyt.swift');
  assert.doesNotMatch(kf, /Eldre server uten \/receipts\/scan/);
  assert.doesNotMatch(kf, /e\.status == 404 \|\| e\.status == 405/);
  assert.match(srv('server/finans/receipts/routes.js'), /api\.post\('\/receipts\/scan'/);
  // Sporing: /api/tracking/refresh finnes, ingen omvei om /tracking/check.
  const tc = src('TrackCarriers.swift');
  assert.doesNotMatch(tc, /"\/tracking\/check"/);
  assert.match(srv('server/sporing/shipments.js'), /api\.post\('\/refresh'/);
});

test('Serveren: logo 204 = «ingen logo» (spørres ikke igjen), og discovery med local: [] sletter ikke lagret lokal adresse', () => {
  const s = code(raw('FinansHub/Sources/Store.swift'));
  const logo = s.slice(s.indexOf('func logo(_ domain: String?)'), s.indexOf('private func sendImage('));
  assert.match(logo, /if noLogo\.contains\(domain\) \{ return nil \}/);
  assert.match(logo, /if d\.isEmpty \{ noLogo\.insert\(domain\); return nil \}/);
  assert.match(s, /func clearCache\(\) \{ logos = \[:\]; noLogo = \[\];/);
  const k = code(raw('SharedKal/Core/KalAuthCore.swift'));
  assert.match(k, /if !cleanLoc\.isEmpty \{ d\.set\(cleanLoc, forKey: "kal41\.local"\) \}/);
  assert.doesNotMatch(k, /^\s+d\.set\(cleanLoc, forKey: "kal41\.local"\)$/m);
});

test('Struktur: Swift 6 – full samtidighetssjekk på klokka først (advarsler i Swift 5-modus), resten på 5.10', () => {
  const yml = raw('project.yml');
  const watch = yml.slice(yml.indexOf('  HomelabWatch:'));
  assert.match(watch, /SWIFT_STRICT_CONCURRENCY: complete/);
  assert.equal((yml.match(/SWIFT_STRICT_CONCURRENCY/g) || []).length, 1, 'bare klokka foreløpig');
  assert.match(yml, /SWIFT_VERSION: "5\.10"/);
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
