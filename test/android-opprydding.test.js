// Opprydding etter 5.0.0 (REST-ANDROID): kildesjekker for radene i docs/opprydding/STATUS.md som gjelder Android –
// filnavn uten promptnummer, ingen fast lokal adresse (C-S4/D-B5), widgetene (Q31, P85 H), sted via serveren (L12),
// 404-reserver (Q19), Familie-områder per bruker (P85 L) og beskrivelser for TalkBack (P85 E).
// Ingen Android SDK her: CI-jobben «Mobilapper» er fasit for at koden kompilerer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
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

test('filnavn: ingen Kotlin-fil i Android har promptnummer i navnet', () => {
  const numbered = ktFiles(AND).map((p) => relative(AND, p)).filter((p) => /[A-Za-z][0-9]{2}[A-Za-z]*\.kt$/.test(p));
  assert.deepEqual(numbered, []);
});

test('baseline-profilen peker bare på fasadeklasser som finnes', () => {
  const prof = raw(join(AND, 'app/src/main/baseline-prof.txt'));
  const names = new Set(ktFiles(join(AND, 'app/src/main/java')).map((p) => relative(join(AND, 'app/src/main/java'), p).replace(/\.kt$/, 'Kt')));
  for (const m of prof.matchAll(/^L(no\/kristo\/finanshub\/[A-Za-z/]+Kt)\*?;/gm)) assert.ok(names.has(m[1]), m[1]);
});

test('C-S4/D-B5: ingen fast lokal standardadresse i appene; lagret adresse og serverens verdi brukes', () => {
  for (const p of [...ktFiles(join(AND, 'app/src/main')), ...ktFiles(join(AND, 'kalender/src/main')), ...ktFiles(join(AND, 'wear/src/main'))]) {
    assert.doesNotMatch(strip(raw(p)), /10\.69\.1\.39/, relative(AND, p));
  }
  const srv = strip(raw(join(APP, 'Serveradresse.kt')));
  assert.doesNotMatch(srv, /DEFAULT_LOCAL47/);
  assert.match(srv, /var defLocal by mutableStateOf\(""\)/);
  // Innlogging uten svar fra ekstern: bare en lokal adresse brukeren allerede har, og bare når den svarer som samme server.
  assert.match(srv, /internal suspend fun loginVia47\(srv: String, local: String\?\): String\?/);
  assert.match(srv, /return if \(localIsOurs47\(l, srv\)\) l else null/);
  assert.match(srv, /accounts\.firstOrNull \{ it\.server == srv && it\.local\.isNotBlank\(\) \}\?\.local \?: lastLocal89\(\)/);
  assert.match(srv, /if \(!ours \|\| p47\.defLocal\.isBlank\(\)\) return/);
  const kal = strip(raw(join(KAL, 'Innlogging.kt')));
  assert.doesNotMatch(kal, /DEFAULT_LOCAL\b/);
  assert.match(strip(raw(join(KAL, 'Serveradresser.kt'))), /getString\("k47_def_loc", ""\)\?\.takeIf \{ it\.startsWith\("http"\) \} \?: ""/);
});

test('Q31: widgetene og variantene (One UI, Samsung, låseskjerm) står i én definisjon, og manifestet og katalogen er generert fra den', async () => {
  const { DEF, MANIFEST, KATALOG, validate, render, katalog } = await import('../scripts/android-widgets.mjs');
  const def = validate(JSON.parse(raw(DEF)));
  const man = raw(MANIFEST);
  assert.equal(render(def, man), man, 'AndroidManifest.xml: kjør «npm run widgets»');
  assert.equal(raw(KATALOG), katalog(def), 'WidgetKatalog.kt: kjør «npm run widgets»');
  const vars = def.widgets.flatMap((w) => w.varianter);
  assert.equal(vars.length, 74);
  // Alle widget-mottakerne i manifestet ligger i den genererte blokken, og ingen andre steder.
  const block = man.slice(man.indexOf('widgets:start'), man.indexOf('widgets:end'));
  const outside = man.replace(block, '');
  assert.doesNotMatch(outside, /android\.appwidget\.provider/);
  assert.equal((block.match(/<receiver /g) ?? []).length, vars.length);
  // Hver mottaker finnes som klasse i widget-pakken (samme navn som før, så plasserte widgets virker), og hver xml finnes.
  const kt = ktFiles(join(APP, 'widget')).map((p) => strip(raw(p))).join('\n');
  const xmlDir = join(AND, 'app/src/main/res/xml');
  const xmls = new Set(readdirSync(xmlDir).map((f) => f.replace(/\.xml$/, '')));
  for (const v of vars) {
    assert.match(kt, new RegExp(`class ${v.mottaker}\\b`), v.mottaker);
    assert.ok(xmls.has(v.xml), v.xml);
  }
  // Samsung og låseskjerm hører til samme widget som standardvarianten.
  for (const id of ['kalender', 'ruter', 'proveperioder', 'gjoremal', 'pakker', 'brief']) {
    const w = def.widgets.find((x) => x.id === id);
    assert.ok(w.varianter.some((v) => v.type === 'standard') && w.varianter.some((v) => v.type === 'samsung'), id);
  }
  // Galleriet og Samsung-påslåingen leser katalogen i stedet for egne lister.
  const gal = strip(raw(join(APP, 'ui/WidgetGalleri.kt')));
  assert.match(gal, /WidgetKatalog\.galleri\.map/);
  assert.doesNotMatch(gal, /WDef43\("Media"/);
  assert.match(strip(raw(join(APP, 'widget/BirthdaysWidgets.kt'))), /WidgetKatalog\.slaasPaaSamsung\.map \{ it\.klasse \}/);
  assert.equal(vars.filter((v) => v.samsungPaa).length, 16);
});

test('P85 E: trykkflatene i skallet (fanelinja, Papir, navigasjon, globale lag) har rolle for TalkBack', () => {
  for (const f of ['Fanelinje.kt', 'Paper.kt', 'PapirTilpassOgNavigasjon.kt', 'GlobaleLag.kt', 'HomelabSkall.kt', 'Navigasjon.kt', 'Topplinje.kt', 'Homelab.kt']) {
    const s = strip(raw(join(APP, 'ui', f)));
    assert.doesNotMatch(s, /\.clickable\s*(\(\s*\))?\s*\{/, `${f}: clickable uten rolle`);
  }
  const paper = strip(raw(join(APP, 'ui/Paper.kt')));
  assert.match(paper, /clickable\(role = Role\.Tab\) \{ vm\.scanTarget = k \}\.semantics \{ selected = on \}/);
  assert.match(paper, /onClickLabel = "Åpne transaksjonen"/);
});

test('P85 G: kvitteringer lastes opp med Idempotency-Key fra bildet, også fra køen; logo 204 betyr «ingen logo»', () => {
  const api = strip(raw(join(APP, 'Api.kt')));
  assert.match(api, /idempotencyKey: String\? = null\): String/);
  assert.match(api, /idempotencyKey\?\.let \{ conn\.setRequestProperty\("Idempotency-Key", it\) \}/);
  const ks = strip(raw(join(APP, 'KvitteringSkanning.kt')));
  assert.match(ks, /fun receiptIdemKey\(parts: List<Api\.Part>\): String\?/);
  assert.match(ks, /MessageDigest\.getInstance\("SHA-256"\)\.digest\(img\.data\)/);
  assert.match(ks, /upload\(SCAN_PATH48, parts, read = SCAN_READ48, idempotencyKey = receiptIdemKey\(parts\)\)/);
  assert.match(strip(raw(join(APP, 'upload/PendingUploads.kt'))), /idempotencyKey = if \(scan48\) receiptIdemKey\(ps\) else null/);
  // Nøkkelen: «kv-» + 32 hex-tegn = 35 tegn, innenfor 8–128.
  assert.equal(('kv-' + 'a'.repeat(32)).length, 35);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  assert.match(vm, /if \(raw != null && raw\.isEmpty\(\)\) \{ logoNone\[domain\] = System\.currentTimeMillis\(\); return null \}/);
  assert.match(strip(raw(join(APP, 'widget/ProveperiodeWidgets.kt'))), /if \(b\.isEmpty\(\)\)/);
});

test('P85 H: widgetene tegnes og hentes med korutine (og goAsync i mottakere), aldri Thread { runBlocking }', () => {
  for (const p of ktFiles(join(AND, 'app/src/main'))) {
    const s = strip(raw(p));
    assert.doesNotMatch(s, /Thread\s*\{[^}]*runBlocking/, relative(AND, p));
  }
  const sync = strip(raw(join(APP, 'widget/WidgetSync.kt')));
  assert.match(sync, /object WidgetJobs \{/);
  assert.match(sync, /CoroutineScope\(SupervisorJob\(\) \+ Dispatchers\.IO\)/);
  assert.match(sync, /val pending: BroadcastReceiver\.PendingResult\? = receiver\.goAsync\(\)/);
  assert.match(sync, /finally \{ pending\?\.finish\(\) \}/);
  for (const f of ['BriefWidgets.kt', 'BirthdaysWidgets.kt', 'ProveperiodeWidgets.kt', 'BibleWidgets.kt', 'KalenderWidgets.kt', 'TasksWidget.kt']) {
    assert.match(strip(raw(join(APP, 'widget', f))), /WidgetJobs\.launch \{/, f);
  }
  // Mottakeren for Huskeliste-widgeten henter via WorkManager, varselknappene for prøveperioder med goAsync().
  const tasks = strip(raw(join(APP, 'widget/TasksWidget.kt')));
  assert.match(tasks.slice(tasks.indexOf('class TasksReceiver')), /WidgetSync\.refresh\(context\)/);
  assert.match(strip(raw(join(APP, 'Bakgrunnsvarsler.kt'))), /WidgetJobs\.launchAsync\(this\)/);
});

test('L12: stedsoppslag, vær for et sted og skiføret går via serveren, aldri direkte til Open-Meteo', () => {
  for (const p of [...ktFiles(join(AND, 'app/src/main')), ...ktFiles(join(AND, 'kalender/src/main'))]) {
    assert.doesNotMatch(strip(raw(p)), /geocoding-api\.open-meteo\.com/, relative(AND, p));
    assert.doesNotMatch(strip(raw(p)), /api\.open-meteo\.com/, relative(AND, p));
  }
  assert.match(strip(raw(join(APP, 'domene/Vaer.kt'))), /api41 \{ hlGet\("\/weather\/ski", timeout = 10_000\) \}/, 'skiføret i Nordmarka (GET /api/weather/ski)');
  const g = strip(raw(join(APP, 'Glimt.kt')));
  assert.doesNotMatch(g, /openMeteo35/);
  assert.match(g, /hlGet\("\/weather\/place\?q="/);
  assert.match(g, /private suspend fun AppViewModel\.geocode36\(place: String\)[^\n]*\n[^\n]*hlGet\("\/weather\/places\?q="/);
});

test('Q19: 404-reservene for Kalender-vær, stedssøket, Gjøremål-kortene og LED-innstillingene er borte', () => {
  const kal = strip(raw(join(KAL, 'KalRepo.kt')));
  assert.doesNotMatch(kal, /api\.open-meteo\.com/);
  assert.match(kal, /if \(e\.status != 404 && e\.status != 405\) throw e\s*\n\s*emptyMap\(\)/);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  assert.doesNotMatch(vm, /\/weather\/search/);
  assert.match(vm, /wxSearch = parseWxSearch28\(api\.hlGet\("\/weather\/places\?q=\$enc", timeout = 15_000\)\) \?: emptyList\(\)/);
  assert.match(strip(raw(join(APP, 'Glimt.kt'))), /if \(e\.status == 404 \|\| e\.status == 405\) s\.cards = emptyList\(\)/);
  const led = strip(raw(join(APP, 'SkjoldLED.kt')));
  assert.doesNotMatch(led, /settingsLocal|prefs78/);
});

test('P85 L: forrige brukers Familie-områder fjernes ved bytte av bruker eller utlogging', () => {
  const fam = strip(raw(join(APP, 'FamilyModel.kt')));
  const use = fam.slice(fam.indexOf('fun useAccount(ctx: Context, id: String?)'), fam.indexOf('internal fun region('));
  assert.match(use, /if \(id != null && \(owner == null \|\| owner == id\)\)/);
  assert.match(use, /lm\.removeProximityAlert\(pi\(ctx, it\)\)/);
  assert.match(use, /SchoolZones41\.saveOnly50\(ctx, emptyList\(\)\)/);
  assert.match(fam, /putString\("acct", owner\)/);
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  const scope = vm.slice(vm.indexOf('private fun scopeToAccount()'));
  assert.match(scope, /FamilyPrefs\.useAccount\(ctx, id\) \}\s*\n\s*runCatching \{ Geofence50\.useAccount\(ctx, id\) \}/);
});
