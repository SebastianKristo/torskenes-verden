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
