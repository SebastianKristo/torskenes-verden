// Android-arkitektur (rest etter 5.0.0): kildesjekker for radene i docs/opprydding/STATUS.md som gjelder strukturen i appene –
// ViewModel per skjerm med StateFlow og repository, SavedStateHandle og rememberSaveable (P85 F), tilbakestabelen med
// PredictiveBack, kalender-forslaget (E-B12/Q34) og 404-reservene (Q19).
// Ingen Android SDK her: CI-jobben «Mobilapper» er fasit for at koden kompilerer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const APP = join(AND, 'app/src/main/java/no/kristo/finanshub');
const KAL = join(AND, 'kalender/src/main/java/no/kristo/kalender');
const raw = (p) => readFileSync(p, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function ktFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'build') out.push(...ktFiles(p)); }
    else if (e.name.endsWith('.kt')) out.push(p);
  }
  return out;
}

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

test('P85 F: AppViewModel lagrer valgt side og søkeutkast i SavedStateHandle, og henter dem etter prosessdød', () => {
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  assert.match(vm, /class AppViewModel\(app: Application, private val lagret: SavedStateHandle\) : AndroidViewModel\(app\)/);
  // Lagringen skjer når systemet ber om den (ikke i navigate), så previewBack sitt prøve-snapshot aldri skrives ut.
  assert.match(vm, /lagret\.setSavedStateProvider\(NAV_LAGRET, object : SavedStateRegistry\.SavedStateProvider \{\s*override fun saveState\(\): Bundle = lagreNavigasjon\(\)/);
  const lagre = vm.match(/private fun lagreNavigasjon\(\): Bundle = Bundle\(\)\.apply \{([\s\S]*?)\n    \}/)[1];
  for (const f of ['screen.name', 'backTo?.name', 'paperPage', 'settingsPage', 'domSection', 'query', 'aiQuery']) assert.ok(lagre.includes(f), f);
  assert.doesNotMatch(lagre, /password|token|totp|code/i, 'aldri hemmeligheter i lagret tilstand');
  // Gjenopprettes før refresh(), som laster siden.
  assert.match(vm, /runCatching \{ gjenopprettNavigasjon\(\) \}[\s\S]{0,300}if \(loggedIn\) refresh\(\)\s*\}/);
  assert.match(vm, /private fun gjenopprettNavigasjon\(\) \{\s*val b = lagret\.get<Bundle>\(NAV_LAGRET\) \?: return\s*if \(!loggedIn\) return/);
  // Bare én måte å lage AppViewModel på: standardfabrikken i aktiviteten (gir Application og SavedStateHandle).
  assert.match(strip(raw(join(APP, 'MainActivity.kt'))), /private val vm: AppViewModel by viewModels\(\)/);
});

test('P85 F: tekstutkast i skjemaene bruker rememberSaveable; passord, koder og nøkler gjør det aldri', () => {
  const files = [...ktFiles(join(AND, 'app/src/main')), ...ktFiles(join(AND, 'kalender/src/main'))];
  let saveable = 0;
  for (const p of files) {
    const s = strip(raw(p));
    const n = (s.match(/\b(?:var|val)\s+\w+\s+(?:by|=)\s+rememberSaveable(?:\([^)]*\))?\s*\{\s*mutableStateOf\(""\)/g) ?? []).length;
    saveable += n;
    if (/\brememberSaveable\b/.test(s)) assert.match(s, /import androidx\.compose\.runtime\.saveable\.rememberSaveable/, p);
    // Hemmeligheter skal ikke ligge i lagret tilstand (Bundle) etter prosessdød.
    assert.doesNotMatch(s, /\b(?:var|val)\s+(?:pw|password|passord|code|kode|key|token|secret|pin)\s+(?:by|=)\s+rememberSaveable/i, p);
  }
  assert.ok(saveable >= 55, `rememberSaveable for utkast: ${saveable}`);
});

test('Struktur: Domener har egen ViewModel med StateFlow og repository; AppViewModel sender bare videre', () => {
  const dvm = strip(raw(join(APP, 'skjerm/DomenerViewModel.kt')));
  assert.match(dvm, /class DomenerViewModel\([\s\S]*?\) : ViewModel\(\)/);
  assert.match(dvm, /val tilstand: StateFlow<DomenerTilstand> = _tilstand\.asStateFlow\(\)/);
  assert.match(dvm, /lagret\[FANE\] = fane\.name/, 'fanen overlever prosessdød');
  assert.match(dvm, /lagret\[VALGT\] = navn/);
  assert.doesNotMatch(dvm, /JSONObject\(|JSONArray\(|domGet\(/, 'ingen nett eller JSON i ViewModel-en');
  const repo = strip(raw(join(APP, 'repository/DomenerRepository.kt')));
  assert.match(repo, /withContext\(Dispatchers\.Default\) \{ parseDomains\(raw\) \}/, 'JSON tolkes utenfor Main');
  assert.match(repo, /withContext\(Dispatchers\.Default\) \{ parseAnalytics\(raw\) \}/);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  // Tynne videresendinger: ingen egen tilstand for Domener igjen i AppViewModel.
  for (const f of ['domains', 'domain', 'analytics', 'domTab', 'domRange', 'worldMap', 'domAll', 'domAllStats']) {
    assert.doesNotMatch(vm, new RegExp(`var ${f} by mutableStateOf`), f);
  }
  assert.match(vm, /val domains: List<DomainRef>\? get\(\) = domenerNa\(\)\.domener/);
  assert.match(vm, /fun pickDomain\(name: String\) \{ domener\.velg\(name\) \}/);
  assert.doesNotMatch(vm, /api\.domGet\(|api\.domPost\(|api\.domDelete\(/, 'Domener-kallene går via DomenerRepository');
  // previewBack prøvekjører tilbake i et Compose-snapshot: skrivinger til ViewModel-en (utenfor snapshotet) hoppes over da.
  assert.match(vm, /var domAll: Boolean\s*get\(\) = domenerNa\(\)\.alle\s*set\(v\) \{ if \(!navDry\) domener\.settAlle\(v\) \}/);
  assert.match(vm, /skjermer\.clear\(\)/, 'skjermenes ViewModel-er ryddes med AppViewModel');
  assert.match(vm, /domener\.tilstand\.collect \{ domenerSpeil = it \}/);
  assert.match(vm, /tokens = null; domener\.nullstill\(\)/, 'utlogging tømmer Domener');
  // Siden tegnes fra StateFlow-en.
  assert.match(strip(raw(join(APP, 'ui/Domains.kt'))), /val t by vm\.domener\.tilstand\.collectAsStateWithLifecycle\(\)/);
});

test('Q19: den gamle Familie-siden for servere uten people50 er borte; soneikonene og sonevarslene er beholdt', () => {
  assert.ok(!existsSync(join(APP, 'ui/FamilyLegacy.kt')));
  const zones = strip(raw(join(APP, 'ui/FamilyZones.kt')));
  assert.match(zones, /internal fun fam22IconPath\(key: String\): String/);
  assert.match(zones, /internal fun ZoneAlertsCard45\(vm: AppViewModel\)/);
  assert.match(zones, /internal fun ZoneAlertsToggle45\(vm: AppViewModel\)/);
  assert.doesNotMatch(zones, /Family22Screen|Family45Wide|Fam24Devices/);
  for (const p of ktFiles(join(AND, 'app/src/main'))) assert.doesNotMatch(strip(raw(p)), /\bFamily22Screen\b/, p);
  const page = strip(raw(join(APP, 'ui/FamilyPage.kt')));
  assert.match(page, /if \(vm\.fam50\.missing\) FamilyServerTooOld\(vm\) else Family50Screen\(vm, startSharing\)/);
  assert.match(page, /"Oppdater Homelab-serveren til 5\.0 eller nyere/);
  // Serveren har ruten som avgjør (people50) – ellers ville siden aldri vises.
  assert.match(raw(join(ROOT, 'server/familie/places.js')), /family50Api\.get\('\/people50'/);
});

test('Navigasjon: Kalender-appen bruker tilbakestabelen fra :felles med prediktiv tilbake, som Homelab-appen', () => {
  const root = strip(raw(join(KAL, 'ui/KalRoot.kt')));
  assert.match(root, /import no\.kristo\.felles\.navigasjon\.Tilbakestabel/);
  assert.match(root, /PredictiveBackHandler\(stabel\.aktivt\(\) != null\) \{ progress ->\s*progress\.collect \{ \}\s*stabel\.tilbake\(\)/);
  assert.doesNotMatch(root, /\bBackHandler\(/, 'ingen egen when-kjede ved siden av stabelen');
  // Samme rekkefølge som før: nytt kalenderark øverst, søket nederst.
  const navn = [...root.matchAll(/Tilbakesteg\("([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navn, ['ny-kalender', 'innstillinger', 'sidemeny-legg-til', 'ny-hendelse', 'hendelse', 'glimt', 'sidemeny', 'sok']);
  // Homelab-appen: hele appen har én PredictiveBackHandler over tilbakestabelen (Fase 5).
  assert.match(strip(raw(join(APP, 'ui/Navigasjon.kt'))), /PredictiveBackHandler\(enabled\) \{ events ->/);
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

test('Struktur: Nyheter har egen ViewModel med StateFlow og repository; AppViewModel sender bare videre', () => {
  const nvm = strip(raw(join(APP, 'skjerm/NyheterViewModel.kt')));
  assert.match(nvm, /class NyheterViewModel\([\s\S]*?\) : ViewModel\(\)/);
  assert.match(nvm, /val tilstand: StateFlow<NyheterTilstand> = _tilstand\.asStateFlow\(\)/);
  assert.match(nvm, /lagret\[KATEGORI\] = kategori/, 'valgt kategori overlever prosessdød');
  assert.doesNotMatch(nvm, /JSONObject\(|JSONArray\(|hlGet\(|hlPost\(|parseNews\(/, 'ingen nett eller JSON i ViewModel-en');
  // 404 fra en eldre server gir en forklaring på siden (ingen lokal reserve).
  assert.match(nvm, /if \(e\.status == 404\) "Nyheter finnes ikke på serveren ennå\. Oppdater Homelab\."/);
  const repo = strip(raw(join(APP, 'repository/NyheterRepository.kt')));
  assert.match(repo, /withContext\(Dispatchers\.Default\) \{ parseNews\(raw\) \}/, 'JSON tolkes utenfor Main');
  for (const sti of ['"/rss?cat="', '"/rss/feeds"', '"/rss/feeds/"', '"/rss/settings"', '"/rss/refresh"']) assert.ok(repo.includes(sti), sti);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  for (const f of ['news', 'newsCat', 'newsBusy', 'newsError']) assert.doesNotMatch(vm, new RegExp(`var ${f} by mutableStateOf`), f);
  assert.doesNotMatch(vm, /\/rss\?cat=|\/rss\/feeds|\/rss\/settings|\/rss\/refresh/, 'Nyheter-kallene går via NyheterRepository');
  assert.match(vm, /var news: NewsData\?\s*get\(\) = nyheterNa\(\)\.data\s*set\(v\) \{ nyheter\.settData\(v\) \}/);
  assert.match(vm, /fun loadNews\(cat: String = newsCat\) = launch \{\s*val raw: String = nyheter\.last\(cat\) \?: return@launch\s*applyNewsExtras46\(raw\)/);
  assert.match(vm, /fun refreshNews\(\) = nyheter\.hentKildene\(\)/);
  assert.match(vm, /nyheter\.tilstand\.collect \{ nyheterSpeil = it \}/);
  assert.match(vm, /nyheter\.nullstill\(\); homeNews = emptyList\(\)/, 'utlogging tømmer Nyheter');
  // Om siden er åpen, er navigasjon og blir i AppViewModel (tilbakestabelen prøvekjører den i et snapshot).
  assert.match(vm, /var newsOpen by mutableStateOf\(false\)/);
});

test('Struktur: Sporing har egen ViewModel med StateFlow og repository; AppViewModel sender bare videre', () => {
  const svm = strip(raw(join(APP, 'skjerm/SporingViewModel.kt')));
  assert.match(svm, /class SporingViewModel\([\s\S]*?\) : ViewModel\(\)/);
  assert.match(svm, /val tilstand: StateFlow<SporingTilstand> = _tilstand\.asStateFlow\(\)/);
  assert.doesNotMatch(svm, /JSONObject\(|JSONArray\(|hlGet\(|hlPost\(|parseTracking\(/, 'ingen nett eller JSON i ViewModel-en');
  // Varselvalg og kilder vises med en gang og lagres så på serveren (som før).
  assert.match(svm, /fun settVarsel\(navn: String, verdi: Boolean\): Job \{\s*_tilstand\.update[\s\S]{0,200}return start \{ repo\.settVarsel\(navn, verdi\) \}/);
  const repo = strip(raw(join(APP, 'repository/SporingRepository.kt')));
  assert.match(repo, /withContext\(Dispatchers\.Default\) \{ parseTracking\(raw\) \}/, 'JSON tolkes utenfor Main');
  for (const sti of ['"/tracking"', '"/tracking?archived=1"', '"/tracking/prefs"', '"/tracking/sources"', '"/tracking/bulk"', '"/tracking/refresh"']) assert.ok(repo.includes(sti), sti);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  assert.doesNotMatch(vm, /var tracking by mutableStateOf|var trkArchived by mutableStateOf/);
  assert.doesNotMatch(vm, /"\/tracking/, 'Sporing-kallene går via SporingRepository');
  assert.match(vm, /var tracking: TrackingData\?\s*get\(\) = sporingNa\(\)\.data\s*set\(v\) \{ sporing\.settData\(v\) \}/);
  assert.match(vm, /suspend fun loadTracking\(\) \{\s*val t: TrackingData = sporing\.last\(\)\s*notifyTracking\(t\)/, 'lokale varsler som før');
  assert.match(vm, /val t: TrackingData = sporing\.hentStille\(\) \?: return\s*homePackages = t\.top\(2\)/);
  assert.match(vm, /sporing\.tilstand\.collect \{ sporingSpeil = it \}/);
  assert.match(vm, /famPositions = null; sporing\.nullstill\(\); homePackages = null/, 'utlogging tømmer Sporing (også arkivet)');
  // Valgt sending og filter er navigasjon og blir i AppViewModel.
  assert.match(vm, /var trkSel by mutableStateOf<String\?>\(null\)/);
  assert.match(vm, /var trkFilter by mutableStateOf\("active"\)/);
});

test('Struktur: Mat har egen ViewModel med StateFlow og repository; AppViewModel sender bare videre', () => {
  const mvm = strip(raw(join(APP, 'skjerm/MatViewModel.kt')));
  assert.match(mvm, /class MatViewModel\([\s\S]*?\) : ViewModel\(\)/);
  assert.match(mvm, /val tilstand: StateFlow<MatTilstand> = _tilstand\.asStateFlow\(\)/);
  assert.doesNotMatch(mvm, /JSONObject\(|JSONArray\(|matGet\(|matPost\(|parseWeek\(/, 'ingen nett eller JSON i ViewModel-en');
  assert.match(mvm, /fun nullstill\(\) \{\s*jobbPoll\?\.cancel\(\)/, 'skannekøen følges ikke etter utlogging');
  const repo = strip(raw(join(APP, 'repository/MatRepository.kt')));
  assert.match(repo, /return withContext\(Dispatchers\.Default\) \{[\s\S]{0,200}MatUke\(parseWeek\(raw\), mapper, raw\)/, 'JSON tolkes utenfor Main');
  for (const sti of ['"/week"', '"/recipes/jobs"', '"/folders"', '"/plan"', '"/shopping"', '"/recipes/import"', '"/recipes/import/save"', '"/recipes/scan"']) assert.ok(repo.includes(sti), sti);
  // Q19: mappene kommer alltid med i /week; ingen ekstra kall til /folders som reserve for eldre servere.
  const uke = repo.slice(repo.indexOf('suspend fun uke()'), repo.indexOf('suspend fun jobber()'));
  assert.doesNotMatch(uke, /"\/folders"/);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  for (const f of ['week', 'matFolders', 'recipeJobs', 'recipePreview', 'recipeBusy']) assert.doesNotMatch(vm, new RegExp(`var ${f} by mutableStateOf`), f);
  assert.doesNotMatch(vm, /\bapi\.mat(Get|Post|Patch)\(|prefix = Api\.MAT/, 'Mat-kallene går via MatRepository');
  assert.match(vm, /val week: Week\? get\(\) = matNa\(\)\.uke/);
  assert.match(vm, /suspend fun loadWeek\(\) = mat\.last\(\)/);
  assert.match(vm, /mat\.tilstand\.collect \{ matSpeil = it \}/);
  assert.match(vm, /mat\.nullstill\(\); subs = null/, 'utlogging tømmer Mat');
  // «Opptatt» og meldingen for ny ukeplan vises som før (i AppViewModel).
  assert.match(vm, /try \{ mat\.planleggUka\(\); message = "Ny ukeplan klar ✦" \} finally \{ busy = false \}/);
  // Q20: «Middag i dag» på Hjem bruker serverens Oslo-dato (today i /week), ikke telefonens klokke.
  assert.match(vm, /todayMeal = runCatching \{ matRepo\.uke\(\)\.uke\.days\.firstOrNull \{ it\.today \}\?\.name \}\.getOrNull\(\)/);
  // Valgt dag, mappe og åpen rett er navigasjon og blir i AppViewModel.
  assert.match(vm, /var matDay by mutableStateOf<Int\?>\(null\)/);
  assert.match(vm, /var dishOpen by mutableStateOf<String\?>\(null\)/);
});

test('Struktur: Vær har egen ViewModel med StateFlow og repository; AppViewModel sender bare videre', () => {
  const vvm = strip(raw(join(APP, 'skjerm/VaerViewModel.kt')));
  assert.match(vvm, /class VaerViewModel\([\s\S]*?\) : ViewModel\(\)/);
  assert.match(vvm, /val tilstand: StateFlow<VaerTilstand> = _tilstand\.asStateFlow\(\)/);
  assert.doesNotMatch(vvm, /JSONObject\(|JSONArray\(|hlGet\(|hlPost\(|parseWeatherFull\(/, 'ingen nett eller JSON i ViewModel-en');
  // Meldingene og reservene er de samme som før.
  assert.match(vvm, /if \(e\.status == 404\) "Værappen trenger en nyere Homelab-server\." else e\.message/);
  assert.match(vvm, /runCatching \{ repo\.steder\(\) \}\.getOrNull\(\) \?: standardSteder\(\)/);
  assert.match(vvm, /delay\(250\)/, 'stedssøket venter 250 ms');
  assert.match(vvm, /fun nullstill\(\) \{\s*sokJobb\?\.cancel\(\)/);
  const repo = strip(raw(join(APP, 'repository/VaerRepository.kt')));
  assert.match(repo, /withContext\(Dispatchers\.Default\) \{\s*val full: WeatherFull = parseWeatherFull\(raw\)/, 'JSON tolkes utenfor Main');
  for (const sti of ['"/weather/full?"', '"/weather/compare?"', '"/weather/compare?place="', '"/weather/places"', '"/weather/places?q="', '"/weather/places/"', '"/weather/places/order"']) assert.ok(repo.includes(sti), sti);
  assert.doesNotMatch(repo, /\/weather\/search/, 'Q19: ingen reserve mot det gamle stedssøket');
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  for (const f of ['weatherFull', 'weatherError', 'weatherPlace', 'wxPlaces', 'wxSearch', 'wxCmp22', 'wxCompare']) assert.doesNotMatch(vm, new RegExp(`var ${f} by mutableStateOf`), f);
  assert.doesNotMatch(vm, /"\/weather\/(full|compare|places)/, 'Vær-kallene går via VaerRepository');
  assert.match(vm, /val weatherFull: WeatherFull\? get\(\) = vaerNa\(\)\.full/);
  assert.match(vm, /val weatherPlace: String get\(\) = vaerNa\(\)\.sted/);
  assert.match(vm, /fun loadWeather\(place: String\) \{ vaer\.last\(place\) \}/);
  assert.match(vm, /vaer\.tilstand\.collect \{ vaerSpeil = it \}/);
  assert.match(vm, /ruterOpen = false; vaer\.nullstill\(\)\n/, 'utlogging tømmer Vær (stedene er per bruker)');
  // Om siden og arkene er åpne, er navigasjon og blir i AppViewModel.
  for (const f of ['weatherOpen', 'wxPlacesSheet', 'compareOpen']) assert.match(vm, new RegExp(`var ${f} by mutableStateOf\\(false\\)`), f);
  assert.match(vm, /var weatherSheetDay by mutableStateOf<Int\?>\(null\)/);
  // Glimt, bakgrunnen og «Min posisjon» leser og kaller de samme navnene som før.
  assert.match(strip(raw(join(APP, 'domene/Vaer.kt'))), /weatherFull != null && weatherPlace\.startsWith\("geo:"\)/);
  assert.match(strip(raw(join(APP, 'Bakgrunn.kt'))), /val w = weatherFull/);
});

test('Struktur: Aksjer har egen ViewModel med StateFlow og repository; AppViewModel sender bare videre', () => {
  const avm = strip(raw(join(APP, 'skjerm/AksjerViewModel.kt')));
  assert.match(avm, /class AksjerViewModel\([\s\S]*?\) : ViewModel\(\)/);
  assert.match(avm, /val tilstand: StateFlow<AksjerTilstand> = _tilstand\.asStateFlow\(\)/);
  assert.doesNotMatch(avm, /JSONObject\(|\.get\("|\.post\("|parseStocks/, 'ingen nett eller JSON i ViewModel-en');
  assert.match(avm, /fun nullstill\(\) \{\s*_tilstand\.update \{ AksjerTilstand\(\) \}/, 'både oversikt og detaljer tømmes');
  const repo = strip(raw(join(APP, 'repository/AksjerRepository.kt')));
  assert.match(repo, /withContext\(Dispatchers\.Default\) \{\s*AksjerSvar\(runCatching \{ parseStocks\(raw\) \}\.getOrNull\(\), parseStocksX\(raw\)\)/, 'JSON tolkes utenfor Main');
  for (const sti of ['api().get("/stocks")', 'api().post("/stocks/sync")']) assert.ok(repo.includes(sti), sti);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  assert.doesNotMatch(vm, /var stocks by mutableStateOf|var stocksX by mutableStateOf/);
  assert.doesNotMatch(vm, /"\/stocks/, 'Aksje-kallene går via AksjerRepository');
  assert.match(vm, /val stocks: Stocks\? get\(\) = aksjerNa\(\)\.oversikt/);
  assert.match(vm, /val stocksX: StocksX\? get\(\) = aksjerNa\(\)\.detaljer/);
  assert.match(vm, /Screen\.Stocks -> aksjer\.last\(\)/);
  assert.match(vm, /try \{ aksjer\.synk\(\); flash\("Synket med Trading 212"\) \} finally \{ busy = false \}/);
  assert.match(vm, /recurring = null; aksjer\.nullstill\(\); report = null/, 'utlogging tømmer Aksjer');
  assert.match(vm, /aksjer\.tilstand\.collect \{ aksjerSpeil = it \}/);
  // Periode og delside er navigasjon og blir i AppViewModel.
  assert.match(vm, /var stockPeriod by mutableStateOf\("1M"\)/);
  assert.match(vm, /var stockScreen by mutableStateOf\("ov"\)/);
});
