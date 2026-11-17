// Opprydding etter 5.0.0 (REST-ANDROID): kildesjekker for radene i docs/opprydding/STATUS.md som gjelder Android –
// filnavn uten promptnummer, ingen fast lokal adresse (C-S4/D-B5), widgetene (Q31, P85 H), sted via serveren (L12),
// 404-reserver (Q19), Familie-områder per bruker (P85 L) og beskrivelser for TalkBack (P85 E).
// Ingen Android SDK her: CI-jobben «Mobilapper» er fasit for at koden kompilerer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

test('P85 E: trykkflatene i modulsidene (ui/domene) har rolle for TalkBack, og valg sier om de er valgt', () => {
  const dir = join(APP, 'ui/domene');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.kt'))) {
    const s = strip(raw(join(dir, f)));
    assert.doesNotMatch(s, /\.clickable\s*(\(\s*\))?\s*\{/, `${f}: clickable uten rolle`);
    if (/\.selectable\(/.test(s)) assert.match(s, /import androidx\.compose\.foundation\.selection\.selectable/, f);
  }
  const ok = strip(raw(join(dir, 'Okonomi.kt')));
  assert.match(ok, /\.selectable\(selected = on, role = Role\.Tab\) \{ pick\(k\) \}/, 'segmentvalget er faner');
  assert.match(ok, /\.selectable\(selected = s\.filter == k, role = Role\.RadioButton\)/, 'filteret i loggen');
  assert.match(strip(raw(join(dir, 'Helse.kt'))), /\.selectable\(selected = on, role = Role\.RadioButton\) \{ pid = /);
  assert.match(strip(raw(join(dir, 'Avganger.kt'))), /onClickLabel = if \(open\) "Skjul stoppene" else "Vis stoppene"/);
});

test('P85 E: Nyheter, Mat, Domener, Vær, Avganger og kalendervisningen har rolle på trykkflatene', () => {
  const files = ['News.kt', 'NewsArticle.kt', 'NewsSaved.kt', 'Mat.kt', 'Domains.kt', 'WeatherPage.kt', 'WeatherSheets.kt', 'DeparturesPage.kt', 'KalenderSkjerm.kt'];
  for (const f of files) {
    const s = strip(raw(join(APP, 'ui', f)));
    assert.doesNotMatch(s, /\.clickable\s*(\(\s*\))?\s*\{/, `${f}: clickable uten rolle`);
    assert.match(s, /import androidx\.compose\.ui\.semantics\.Role\n/, f);
    if (/\.selectable\(/.test(s)) assert.match(s, /import androidx\.compose\.foundation\.selection\.selectable/, f);
  }
  // Brytere i Nyheter-innstillingene er brytere for TalkBack (på/av), ikke bare en trykkbar rad.
  assert.match(strip(raw(join(APP, 'ui/News.kt'))), /\.toggleable\(value = on, role = Role\.Switch\) \{ onChange\(it\) \}/);
  // Fanene i Domener og periodevalget sier hvilken som er valgt; «⟳» har et navn.
  const dom = strip(raw(join(APP, 'ui/Domains.kt')));
  assert.match(dom, /\.selectable\(selected = on, role = Role\.Tab\) \{ vm\.domener\.settFane\(fane\) \}/);
  assert.match(dom, /Modifier\.semantics \{ contentDescription = "Oppdater" \}\.clip\(CircleShape\)\.clickable\(role = Role\.Button\) \{ vm\.reloadDomain\(\) \}/);
});

// Runde 4: sidene som sto igjen. Hver fil i lista har ingen clickable uten rolle; valg og brytere sier om de er valgt/på.
const P85E_RUNDE4 = {
  okonomi: ['Abonnement.kt', 'Aksjer.kt'],
  papir: ['PapirSider.kt', 'PapirInnstillinger.kt', 'PapirByggeklosser.kt'],
  familie: ['FamilyPage.kt', 'KartPage.kt'],
  boliger: ['Boliger.kt'],
  innstillinger: ['Innstillinger.kt'],
};

test('P85 E (runde 4): Abonnement, Aksjer og de andre sidene som sto igjen har rolle på trykkflatene', () => {
  for (const f of Object.values(P85E_RUNDE4).flat()) {
    const s = strip(raw(join(APP, 'ui', f)));
    assert.doesNotMatch(s, /\.clickable\s*(\(\s*\))?\s*\{/, `${f}: clickable uten rolle`);
    assert.match(s, /import androidx\.compose\.ui\.semantics\.Role\n/, f);
    if (/\.selectable\(/.test(s)) assert.match(s, /import androidx\.compose\.foundation\.selection\.selectable\n/, f);
    if (/\.toggleable\(/.test(s)) assert.match(s, /import androidx\.compose\.foundation\.selection\.toggleable\n/, f);
  }
  const abo = strip(raw(join(APP, 'ui/Abonnement.kt')));
  assert.match(abo, /\.toggleable\(value = on, role = Role\.Checkbox\) \{\s*Haptics\.select\(\)\s*done = /, 'oppgavene i abonnementssjekken er avkrysningsbokser');
  assert.match(abo, /\.clickable\(role = Role\.Button, onClickLabel = "Rediger"\)/);
  const aks = strip(raw(join(APP, 'ui/Aksjer.kt')));
  assert.match(aks, /\.selectable\(selected = on, role = Role\.Tab\) \{ Haptics\.select\(\); onPick\(k\) \}/, 'periodevalget sier hvilken som er valgt');
  assert.match(aks, /\.clickable\(role = Role\.Button, onClickLabel = "Åpne aksjen"\) \{ openStock23\(vm, ps\) \}/);
  const ps = strip(raw(join(APP, 'ui/PapirSider.kt')));
  assert.match(ps, /\.toggleable\(value = on, role = Role\.Switch\) \{ Haptics\.select\(\); onChange\(!on\) \}/, 'bryterradene i Papir er brytere');
  assert.match(ps, /\.selectable\(selected = on, role = Role\.Tab\) \{ Haptics\.select\(\); vm\.trkTab = tk/);
  assert.match(strip(raw(join(APP, 'ui/Boliger.kt'))), /\.toggleable\(value = on, role = Role\.Switch\) \{ vm\.b24PatchHome\(h\.id, JSONObject\(\)\.put\(t\.first, !on\)\) \}/);
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
  // Stedssøket ligger i VaerRepository (Struktur: Android), uten reserve.
  const vaer = strip(raw(join(APP, 'repository/VaerRepository.kt')));
  assert.doesNotMatch(vaer, /\/weather\/search/);
  assert.match(vaer, /api\(\)\.hlGet\("\/weather\/places\?q=" \+ enc\(q\), timeout = 15_000\)[\s\S]{0,120}parseWxSearch28\(raw\)/);
  assert.match(strip(raw(join(APP, 'Glimt.kt'))), /if \(e\.status == 404 \|\| e\.status == 405\) s\.cards = emptyList\(\)/);
  const led = strip(raw(join(APP, 'SkjoldLED.kt')));
  assert.doesNotMatch(led, /settingsLocal|prefs78/);
});

test('Q19: kvitteringsskanningen, kopi av kalenderhendelser og «Kjøp gave» har ingen lokal reserve for eldre servere', () => {
  // Kvitteringer: /receipts/scan finnes (server/finans/receipts/routes.js); ingen omvei til /receipts med andre felt.
  const scan = strip(raw(join(APP, 'KvitteringSkanning.kt')));
  assert.doesNotMatch(scan, /legacyParts48|e\.status == 404 \|\| e\.status == 405 -> \{/);
  assert.match(scan, /fun uploadPlain\(\)[\s\S]{0,120}vm\.uploadPlain48\(u\)/, '«Last opp bildet i stedet» etter en feil er beholdt');
  const ko = strip(raw(join(APP, 'upload/PendingUploads.kt')));
  assert.doesNotMatch(ko, /legacyParts48|api\.upload\("\/receipts",/);
  assert.match(ko, /scan48 && e\.code == Api\.SENT48 -> Unit/);
  assert.match(raw(join(ROOT, 'server/finans/receipts/routes.js')), /api\.post\('\/receipts\/scan'/);
  // Kalender: POST /kalender/events/:id/copy finnes; ingen lokal kopi når serveren svarer 404.
  const kal = strip(raw(join(APP, 'Kalender.kt')));
  const copy = kal.slice(kal.indexOf('fun AppViewModel.copyKal27('), kal.indexOf('fun AppViewModel.setKalRemind27('));
  assert.match(copy, /if \(e\.editable\) \{ dupKal27\(e\); return \}/, 'egne hendelser dupliseres som før');
  assert.doesNotMatch(copy, /404/);
  assert.match(raw(join(ROOT, 'server/kalender/events.js')), /api\.post\('\/events\/:id\/copy'/);
  // Brief: «Kjøp gave» lager gjøremålet på serveren (POST /api/brief/gift), ikke med en frist regnet på telefonen.
  const brief = strip(raw(join(APP, 'Brief.kt')));
  assert.doesNotMatch(brief, /addTask\("Kjøp gave til/);
  assert.match(brief, /hlPost\("\/brief\/gift"/);
  assert.match(raw(join(ROOT, 'server/glimt/brief.js')), /api\.post\('\/gift'/);
});

test('Q19: oppstartssiden og funksjonsflaggene tolker ikke 404 som «alt i orden»', () => {
  // /api/health finnes alltid; 404 betyr ikke lenger at serveren kjører (pollingen fortsetter).
  const opp = strip(raw(join(APP, 'Oppstart.kt')));
  const poll = opp.slice(opp.indexOf('fun AppViewModel.pollHealth36()'));
  assert.doesNotMatch(poll.slice(0, 900), /404/);
  assert.match(raw(join(ROOT, 'server/index.js')), /app\.get\('\/api\/health'/);
  // /api/flags: en feil (også 404) beholder flaggene som er lagret, i stedet for å tømme dem.
  const kr = strip(raw(join(APP, 'Krasjrapporter.kt')));
  assert.match(kr, /val o = try \{ JSONObject\(api\.hlGet\("\/flags", timeout = 8_000\)\) \} catch \(e: CancellationException\) \{ throw e \} catch \(_: Exception\) \{ return \}/);
  assert.match(raw(join(ROOT, 'server/system/flags-crashes.js')), /qa51Api\.get\('\/flags'/);
});

test('Q19: «Logg inn med Homelab-appen» lager aldri et vanlig app-token med alle tilganger for Kalender', () => {
  const k = strip(raw(join(APP, 'KalenderApp.kt')));
  // Før: 404/405/403 på /tokens/companion ga POST /finans/api/tokens med Homelab-appens tilganger (finance:write m.fl.).
  assert.doesNotMatch(k, /api\.post\("\/tokens"|finance:write|expiresDays/);
  assert.match(k, /request\("POST", "\/tokens\/companion"/);
  // Enhets-tokenet byttes mot et Kalender-token; ingen omvei når serveren svarer 404.
  const ex = k.slice(k.indexOf('private suspend fun deviceExchange41('), k.indexOf('private suspend fun companionToken('));
  assert.match(ex, /"\/auth\/device-exchange"/);
  assert.doesNotMatch(ex, /companionToken\(|404/);
  assert.match(raw(join(ROOT, 'server/auth/app-login.js')), /app\.post\('\/api\/auth\/device-exchange'/);
  assert.match(raw(join(ROOT, 'server/kalender/index.js')), /app\.route\('\/api\/tokens\/companion', companionApi\)/);
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

test('Logikk på serveren: nedtellingen til prøver og frister er serverens daysLeft (Homelab-appen og Kalender-appen)', () => {
  const kal = strip(raw(join(APP, 'Kalender.kt')));
  assert.match(kal, /val daysLeft: Int\? = null,\s*\) \{/);
  assert.match(kal, /daysLeft = o\.optIntOrNull\("daysLeft"\)/);
  assert.match(kal, /val dd = x\.daysLeft \?: kalDaysTo\(x\.date, today\)/, 'widgetene og Hjem-kortet');
  // Ikke i cachen: en lagret nedtelling ville vært feil neste dag.
  const toJson = kal.slice(kal.indexOf('fun toJson(): JSONObject'), kal.indexOf('fun parseKal26('));
  assert.doesNotMatch(toJson, /daysLeft/);
  assert.match(strip(raw(join(APP, 'domene/Kalender.kt'))), /val days: Long = \(e\.daysLeft \?: kalDaysTo\(e\.date, today\)\)\.toLong\(\)/, 'Glimt-svaret om neste prøve');
  const km = strip(raw(join(KAL, 'KalModel.kt')));
  assert.match(km, /ab = ab, x44 = x44, daysLeft = o\.optIntOrNull\("daysLeft"\),/);
  assert.doesNotMatch(km.slice(km.indexOf('fun toJson(): JSONObject'), km.indexOf('companion object')), /daysLeft/);
  assert.match(strip(raw(join(KAL, 'FagOgSted.kt'))), /val days = m\.daysLeft \?: daysBetween\(T, m\.d\)/);
  assert.match(strip(raw(join(KAL, 'KalAsk.kt'))), /val days = m\.daysLeft \?: daysBetween\(T, m\.d\)/);
});

test('F 12: «Skjul beløp» i appen gjelder widgetdataene (hideAmounts fra serveren og ?hideAmounts=1)', () => {
  const wd = strip(raw(join(APP, 'widget/WidgetData.kt')));
  assert.match(wd, /fun skjul\(ctx: Context\): Boolean = AppPrefs\(ctx\)\.bool\(AppPrefs\.HIDE_AMOUNTS\)/);
  assert.match(wd, /fun sti\(ctx: Context, path: String\): String = if \(!skjul\(ctx\)\) path else path \+ \(if \('\?' in path\) "&" else "\?"\) \+ "hideAmounts=1"/);
  assert.match(wd, /hideAmounts = o\.optBoolean\("hideAmounts", false\)/);
  // /api/mobile/widgets og /api/widgets/trials hentes med valget.
  assert.match(strip(raw(join(APP, 'widget/WidgetSync.kt'))), /hlGet\(WidgetPersonvern\.sti\(ctx, "\/mobile\/widgets"\), timeout = 8_000\)/);
  const tr = strip(raw(join(APP, 'widget/ProveperiodeWidgets.kt')));
  assert.match(tr, /hlGet\(WidgetPersonvern\.sti\(ctx, "\/widgets\/trials"\), timeout = 8_000\)/);
  assert.match(tr, /if \(skjul && t\.price\.isNotBlank\(\)\) t\.copy\(price = "•••"\) else t/, 'prisen skjules også for lister fra appen');
  // Tallfeltene: valget i appen eller serverens hideAmounts.
  assert.match(strip(raw(join(APP, 'widget/Widgets.kt'))), /val f = Fmt\(AppPrefs\(ctx\)\.bool\(AppPrefs\.HIDE_AMOUNTS\) \|\| d\.hideAmounts\)/);
  // Endres valget, hentes widgetdataene på nytt.
  const vm = strip(raw(join(APP, 'AppViewModel.kt')));
  assert.match(vm, /if \(k == AppPrefs\.HIDE_AMOUNTS\) \{\s*Privacy\.hidden = v == true\s*runCatching \{ no\.kristo\.finanshub\.widget\.WidgetSync\.refresh\(appCtx\) \}/);
  // Serveren: rutene godtar ?hideAmounts=1 (server/skjul-belop.js på runde3-web).
  const sb = join(ROOT, 'server/skjul-belop.js');
  if (existsSync(sb)) assert.match(raw(sb), /c\.req\.query\('hideAmounts'\) === '1'/);
});

test('F 12: brief-widgeten ber om skjulte beløp når «Skjul beløp» er på', () => {
  const s = readFileSync(new URL('../apps/android/app/src/main/java/no/kristo/finanshub/widget/BriefWidgets.kt', import.meta.url), 'utf8');
  assert.match(s, /WidgetPersonvern\.sti\(ctx, "\/brief\?kind=\$kind"\)/);
  assert.match(s, /WidgetPersonvern\.sti\(ctx, "\/widgets\/brief\?kind=\$kind"\)/);
});
