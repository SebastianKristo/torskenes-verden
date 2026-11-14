// Prompt 89 (AND89): Android – riktig standarddomene + migrering (app, Kalender, Wear), tannhjul-ark på innloggingen,
// og Live Updates for Live Activities-API-et (GET /api/live/aktiviteter, POST /api/live/handling, /api/live/innstillinger).
// Kildesjekker + de rene reglene i Regel89.kt speilet i JS. Regel89.kt er også kompilert og kjørt med kotlinc 2.0.21 mot samme fasit,
// og Live89.kt / ui/Srv89Ui.kt / ui/Live89Ui.kt er typesjekket med stubber (ingen Android SDK her – CI er fasit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const APP = join(AND, 'app/src/main/java/no/kristo/finanshub');
const KAL = join(AND, 'kalender/src/main/java/no/kristo/kalender');
const WEAR = join(AND, 'wear/src/main/java/no/kristo/finanshub/wear');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const rd = (p) => readFileSync(p, 'utf8');
const code = (dir, f) => strip(rd(join(dir, f)));
const OLD = 'smarthjem' + 'experten'; // gammel stavemåte (bygget opp så denne fila ikke selv inneholder den)
const NEW = 'https://os.smarthjemeksperten.no';

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    if (n === 'build' || n.startsWith('.')) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function block(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `fant ikke «${start}»`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  assert.fail('ubalanserte klammer');
}

/* ---------------- 1. Domenet ---------------- */

test('domenet: ingen gammel stavemåte noe sted i apps/android (bare den oppdelte migreringskonstanten)', () => {
  const hits = walk(AND).filter((p) => /\.(kt|kts|xml|json|pro|properties)$/.test(p)).filter((p) => rd(p).includes(OLD));
  assert.deepEqual(hits.map((p) => p.slice(ROOT.length + 1)), []);
  // Migreringen bygger den gamle verdien av to deler.
  for (const [dir, f] of [[APP, 'Regel89.kt'], [KAL, 'Kal89.kt'], [WEAR, 'WearApi51.kt']]) assert.match(rd(join(dir, f)), /"https:\/\/os\.smarthjem" \+ "experten\.no"/, f);
});

test('domenet: standardverdiene er os.smarthjemeksperten.no, lokal uendret http://10.69.1.39:3000', () => {
  assert.match(code(APP, 'P47.kt'), /const val DEFAULT_EXTERNAL47 = "https:\/\/os\.smarthjemeksperten\.no"/);
  assert.match(code(APP, 'P47.kt'), /const val DEFAULT_LOCAL47 = "http:\/\/10\.69\.1\.39:3000"/);
  assert.match(code(APP, 'P41.kt'), /const val DEFAULT_SERVER41 = DEFAULT_EXTERNAL47/);
  assert.match(code(APP, 'Regel89.kt'), /const val EXTERNAL = "https:\/\/os\.smarthjemeksperten\.no"/);
  assert.match(code(KAL, 'Kal41.kt'), /const val DEFAULT_BASE = "https:\/\/os\.smarthjemeksperten\.no"/);
  assert.match(code(KAL, 'Kal41.kt'), /const val DEFAULT_LOCAL = "http:\/\/10\.69\.1\.39:3000"/);
  assert.match(code(WEAR, 'WearApi51.kt'), /const val DEFAULT_SERVER51 = "https:\/\/os\.smarthjemeksperten\.no"/);
  // Klartekst er fortsatt bare for lokalt nett (prompt 86) – ingen ny vert i nettverkskonfigen.
  const nsc = rd(join(AND, 'app/src/main/res/xml/network_security_config.xml'));
  assert.ok(!/smarthjem/.test(nsc));
});

test('migrering: app (kontoer + forrige server), Kalender (oppstart) og Wear skriver bare om nøyaktig den gamle standarden', () => {
  const acc = code(APP, 'Accounts.kt');
  const load = block(acc, 'fun load()');
  assert.match(load, /Regel89\.isOld\(a\.server\) \|\| Regel89\.isOld\(a\.external\)/);
  assert.match(load, /if \(fixed != list\) save\(fixed, active\(\)\)/);
  assert.match(block(acc, 'fun lastServer()'), /Regel89\.isOld\(s\)\) \{ rememberServer\(Regel89\.EXTERNAL\)/);
  const k = code(KAL, 'Kal89.kt');
  for (const key of ['k41_external', 'k41_manual', 'k47_def_ext', 'last_server']) assert.ok(k.includes(`"${key}"`), key);
  assert.match(k, /KalAuth\.save\(ctx, s\.copy\(server = Kal41\.DEFAULT_BASE\)\)/);
  assert.match(code(KAL, 'MainActivity.kt'), /Kal51\.init\(this\)\s*Kal89\.migrate\(this\)/);
  const w = code(WEAR, 'WearApi51.kt');
  assert.match(w, /fun server\(ctx: Context\): String = stored89\(ctx\) \?: DEFAULT_SERVER51/);
  assert.match(block(w, 'fun account(ctx: Context)'), /stored89\(ctx\)/);
});

/* ---------------- 2. Tannhjulet ---------------- */

test('tannhjul på innloggingen (Homelab): ikon «settings» 48 dp øverst til høyre, arket «Server» med alle feltene', () => {
  const ui = code(join(APP, 'ui'), 'Srv89Ui.kt');
  assert.match(ui, /Icons\.Filled\.Settings/);
  assert.match(ui, /size\(48\.dp\)/);
  for (const t of ['"Server"', '"Ekstern adresse"', '"Lokal adresse"', '"Test tilkobling"', '"Tilbakestill til standard"', '"Lagre"', '"Avbryt"', 'KeyboardType.Uri']) assert.ok(ui.includes(t), t);
  assert.match(ui, /request\("GET", "\/health", prefix = Api\.HOMELAB/);
  assert.match(ui, /"Tilkoblet · \$host"/);
  assert.match(ui, /if \(ok\) p\.pos else p\.lab/); // grønn / rød
  assert.match(ui, /Regel89\.clean\(ext\)/);
  assert.match(ui, /ext = DEFAULT_EXTERNAL47; loc = DEFAULT_LOCAL47/);
  assert.match(ui, /store\?\.rememberServer\(e\); store\?\.rememberLocal\(l\)/);
  const login = block(code(join(APP, 'ui'), 'Paper14.kt'), 'internal fun PaperLogin(');
  assert.match(login, /LoginGear89\(Modifier\.align\(Alignment\.TopEnd\)\.statusBarsPadding\(\)/);
  assert.match(login, /PButton\(if \(vm\.busy\) "Logger inn …" else "Logg inn"[^\n]*\n\s*LoginServerLine89\(server\)/);
  assert.match(ui, /"Server: " \+ Regel89\.hostLabel\(server\)/);
});

test('én felles lagring: tannhjulet før innlogging = Innstillinger → Server etter innlogging', () => {
  const vm = code(APP, 'AppViewModel.kt');
  assert.match(block(vm, 'fun login(url: String'), /store\.lastLocal\(\)/);
  assert.match(block(vm, 'fun updateAddresses('), /store\.rememberServer\(n\.external\.ifBlank \{ n\.server \}\); store\.rememberLocal\(n\.local\)/);
  const acc = code(APP, 'Accounts.kt');
  assert.match(acc, /fun lastLocal\(\): String = prefs\.getString\("local89", null\)/);
});

test('tannhjul på innloggingen (Kalender): samme Server-ark som Innstillinger → Server, Test tilkobling mot /api/health', () => {
  const ui = code(join(KAL, 'ui'), 'Kal41Ui.kt');
  const scr = block(ui, 'fun LoginScreen41(');
  assert.match(scr, /Modifier\.align\(Alignment\.TopEnd\)[^\n]*size\(48\.dp\)/);
  assert.match(scr, /tap\("Server"\)/);
  assert.match(scr, /ServerDialog47\(onClose = \{ srv89 = false; tick89\+\+ \}, login = true\)/);
  assert.match(scr, /"Server: \$host"/);
  const dlg = code(join(KAL, 'ui'), 'Kal47Ui.kt');
  assert.match(dlg, /fun ServerDialog47\(onClose: \(\) -> Unit, login: Boolean = false\)/);
  assert.match(dlg, /LinePill\("Test tilkobling"/);
  assert.match(dlg, /LinePill\(if \(login\) "Avbryt" else "Ferdig", onClose\)/);
  assert.match(code(KAL, 'Kal89.kt'), /"\/api\/health"\)\.open86\(\)/);
});

/* ---------------- 3. Live Updates ---------------- */

test('Live Updates: følger API-et i kontrakten (stier, felt, handlinger, innstillinger)', () => {
  const k = code(APP, 'Live89.kt');
  assert.match(k, /request\("GET", "\/live\/aktiviteter", prefix = Api\.HOMELAB/);
  assert.equal((k.match(/request\("POST", "\/live\/handling", JSONObject\(\)\.put\("id", id\)\.put\("handling", /g) || []).length, 2);
  for (const f of ['id', 'type', 'tittel', 'undertittel', 'verdi', 'meta', 'start', 'slutt', 'status', 'url']) assert.ok(k.includes(`s89("${f}")`), f);
  assert.match(k, /optJSONObject\("segmenter"\)/);
  assert.match(k, /optInt\("antall", 0\)/);
  assert.match(k, /optInt\("ferdig", 0\)/);
  assert.match(k, /optJSONArray\("handlinger"\)/);
  assert.match(k, /optJSONObject\("aktivitet"\)/);
  const r = code(APP, 'Regel89.kt');
  assert.match(r, /val TYPES = listOf\("nedlasting", "backup", "spiller", "avtale", "pakke"\)/);
  assert.match(r, /val ACTIONS = setOf\("pause", "fortsett", "stopp", "rute", "utsett"\)/);
  assert.match(r, /Regex\("\^\[a-z0-9:_-\]\{1,80\}\$"\)/);
  const ui = code(join(APP, 'ui'), 'Live89Ui.kt');
  assert.match(ui, /hlGet\("\/live\/innstillinger"/);
  assert.match(ui, /hlPut\("\/live\/innstillinger", body\)/);
  assert.match(ui, /it != "backup" \|\| vm\.userIsAdmin/);
  // Innstillinger → Varsler.
  assert.match(code(join(APP, 'ui'), 'Paper17.kt'), /"notify" -> \{ item \{ NotifySub\(vm\) \}; item \{ Live89Section\(vm\) \}/);
  // Ingen Firebase.
  const gradle = walk(AND).filter((p) => /\.gradle(\.kts)?$|\.toml$/.test(p)).map(rd).join('\n');
  assert.ok(!/firebase|google-services/i.test(gradle));
});

test('Live Updates: Android 16 ProgressStyle + promoted ongoing via refleksjon (compileSdk 35), ellers vanlig progress', () => {
  const k = code(APP, 'Live89.kt');
  const ps = block(k, 'private fun progressStyle36(');
  assert.match(ps, /if \(Build\.VERSION\.SDK_INT < 36\) return false/);
  assert.match(ps, /Class\.forName\("android\.app\.Notification\\\$ProgressStyle"\)/);
  assert.match(ps, /Notification\\\$ProgressStyle\\\$Segment/);
  for (const m of ['setProgressSegments', 'setProgress', 'setStyledByProgress', 'setProgressTrackerIcon']) assert.ok(ps.includes(`"${m}"`), m);
  assert.match(ps, /Regel89\.segLengths\(a\.segAntall\)/);
  assert.match(ps, /b\.setStyle\(style as Notification\.Style\)/);
  const b = block(k, 'fun build(ctx: Context, a: Akt89');
  assert.match(b, /Build\.VERSION\.SDK_INT >= 36 && !done/);
  assert.match(b, /getMethod\("setRequestPromotedOngoing", Boolean::class\.javaPrimitiveType\)\.invoke\(b, true\)/);
  assert.match(b, /getMethod\("setShortCriticalText", String::class\.java\)\.invoke\(b, chip\)/);
  assert.match(b, /if \(!done && !progressStyle36\(b, a, color, pct\)\)/);
  assert.match(b, /b\.setProgress\(100, /);
  assert.match(b, /setOngoing\(!done\)/);
  assert.match(b, /setUsesChronometer\(true\)\.setChronometerCountDown\(true\)/);
  assert.match(b, /ForegroundColorSpan|colored\(t, color\)/);
  // Byggefila: compileSdk/targetSdk er 35 – derfor refleksjon (si fra i rapporten).
  assert.match(rd(join(AND, 'app/build.gradle.kts')), /compileSdk = 35/);
});

test('Live Updates: knappene går til en ikke-eksportert BroadcastReceiver (uten å åpne appen), «Vis rute» via usynlig aktivitet', () => {
  const k = code(APP, 'Live89.kt');
  const act = block(k, 'private fun action(ctx: Context');
  assert.match(act, /PendingIntent\.getBroadcast\(ctx, code,\s*Intent\(ctx, Live89Receiver::class\.java\)/);
  assert.match(act, /if \(hid == "rute"\) return PendingIntent\.getActivity\(ctx, code,\s*Intent\(ctx, Live89Route::class\.java\)/);
  assert.match(act, /FLAG_IMMUTABLE/);
  const rx = block(k, 'class Live89Receiver');
  assert.match(rx, /goAsync\(\)/);
  assert.match(rx, /Regel89\.validId\(it\)/);
  assert.match(rx, /it in Regel89\.ACTIONS && it != "rute"/);
  assert.match(block(k, 'class Live89Route'), /if \(Regel89\.routeOk\(url\)\)/);
  const man = rd(join(AND, 'app/src/main/AndroidManifest.xml'));
  assert.match(man, /<receiver android:name="\.Live89Receiver" android:exported="false" \/>/);
  assert.match(man, /android:name="\.Live89Route"\s+android:exported="false"/);
  assert.match(man, /android:name="\.Live89Service"\s+android:exported="false"\s+android:foregroundServiceType="dataSync"/);
  assert.match(man, /android\.permission\.FOREGROUND_SERVICE_DATA_SYNC/);
  assert.match(man, /android\.permission\.POST_PROMOTED_NOTIFICATIONS/);
});

test('Live Updates: polling i forgrunnstjeneste mens noe er aktivt, WorkManager hvert 15. min, stopp ved utlogging', () => {
  const k = code(APP, 'Live89.kt');
  const loop = block(k, 'private suspend fun loop()');
  assert.match(loop, /val iv = Live89\.show\(this, list, this\)/);
  assert.match(loop, /if \(iv == null\) break/);
  assert.match(loop, /delay\(iv\)/);
  assert.match(loop, /e\.status == 404 \|\| e\.status == 401 \|\| e\.status == 403/);
  assert.match(k, /ServiceInfo\.FOREGROUND_SERVICE_TYPE_DATA_SYNC/);
  assert.match(k, /override fun onTimeout\(startId: Int, fgsType: Int\)/);
  assert.match(k, /PeriodicWorkRequestBuilder<Live89Worker>\(15, TimeUnit\.MINUTES\)/);
  const vm = code(APP, 'AppViewModel.kt');
  assert.match(block(vm, 'private fun clearData()'), /Live89\.stopAll\(getApplication\(\)\)/);
  assert.match(block(vm, 'fun onForeground()'), /Live89\.kick\(getApplication\(\)\)/);
  assert.match(block(vm, 'fun switchTo(id: String)'), /Live89\.kick\(getApplication\(\)\)/);
});

/* ---------------- 4. Rene regler (speiler Regel89.kt) ---------------- */

const isOld = (s) => s != null && s.trim().replace(/\/+$/, '').toLowerCase() === `https://os.${OLD}.no`;
const migrate = (s) => (isOld(s) ? NEW : s);
function clean(raw) {
  const s = raw.replace(/\s+/g, '').replace(/\/+$/, '');
  const m = /^(https?:\/\/)(.*)$/i.exec(s);
  if (!m) return null;
  const host = m[2].split(/[/?#]/)[0];
  if (!host || host.startsWith(':') || host.includes('@')) return null;
  return m[1].toLowerCase() + m[2];
}
const segLengths = (n) => { n = Math.max(0, Math.min(10, n)); if (!n) return []; const b = Math.floor(100 / n); return Array.from({ length: n }, (_, i) => (i === n - 1 ? 100 - b * (n - 1) : b)); };
const segProgress = (n, f) => { const l = segLengths(n); return l.slice(0, Math.max(0, Math.min(f, l.length))).reduce((a, b) => a + b, 0); };
const chip = (v, st) => (st === 'pause' ? 'Pauset' : v.trim()).slice(0, 12);
const active = (st) => st === 'aktiv' || st === 'pause';
function intervalMs(items) {
  const a = items.filter(([, st]) => active(st));
  if (!a.length) return null;
  return a.some(([t, st]) => (t === 'nedlasting' || t === 'backup') && st === 'aktiv') ? 5000 : 30000;
}
function link(url, type) {
  const u = (url ?? '').trim();
  if (u.startsWith('finanshub://')) return u;
  if (u.startsWith('homelab://')) { const rest = u.slice(10); const host = rest.split(/[/?]/)[0]; if (host && host !== 'login' && host !== 'app-auth') return 'finanshub://' + rest; }
  return { nedlasting: 'finanshub://media/qbit', spiller: 'finanshub://media', avtale: 'finanshub://kalender', pakke: 'finanshub://tracking' }[type] ?? 'finanshub://system';
}

test('rene regler: migrering, validering, segmenter, brikke, intervall og dyplenker (samme fasit som kotlinc-kjøringen)', () => {
  const old = `https://os.${OLD}.no`;
  assert.equal(migrate(old), NEW);
  assert.equal(migrate(`${old}/ `), NEW);
  assert.equal(migrate(`${old}.example.com`), `${old}.example.com`); // egendefinert røres ikke
  assert.equal(migrate('https://home.kristo.no'), 'https://home.kristo.no');
  assert.equal(clean(' https://os.smarthjemeksperten.no/ '), NEW);
  assert.equal(clean('os.smarthjemeksperten.no'), null);
  assert.equal(clean('http://10.69.1.39:3000/'), 'http://10.69.1.39:3000');
  assert.equal(clean('https://'), null);
  assert.deepEqual(segLengths(4), [25, 25, 25, 25]);
  assert.deepEqual(segLengths(3), [33, 33, 34]);
  assert.equal(segProgress(4, 3), 75);
  assert.equal(segProgress(4, 9), 100);
  assert.equal(chip('62 %', 'aktiv'), '62 %');
  assert.equal(chip('62 %', 'pause'), 'Pauset');
  assert.equal(intervalMs([['nedlasting', 'aktiv'], ['avtale', 'aktiv']]), 5000);
  assert.equal(intervalMs([['nedlasting', 'pause'], ['pakke', 'aktiv']]), 30000);
  assert.equal(intervalMs([['pakke', 'ferdig']]), null);
  assert.equal(link('homelab://media/ned', 'nedlasting'), 'finanshub://media/ned');
  assert.equal(link('homelab://login?c=x', 'pakke'), 'finanshub://tracking');
  assert.equal(link('https://evil.example', 'spiller'), 'finanshub://media');
  // Kotlin-kilden har de samme reglene.
  const r = code(APP, 'Regel89.kt');
  assert.match(r, /if \(act\.any \{ \(it\.first == "nedlasting" \|\| it\.first == "backup"\) && it\.second == "aktiv" \}\) 5_000L else 30_000L/);
  assert.match(r, /if \(status == "pause"\) "Pauset" else verdi\.trim\(\)\)\.take\(12\)/);
  assert.match(r, /if \(type == "pakke"\) 30 \* 60_000L else 15 \* 60_000L/);
  assert.match(r, /url\.startsWith\("https:\/\/"\) \|\| url\.startsWith\("geo:"\)/);
});

test('farger og symboler fra fasiten (Live Activities.dc.html)', () => {
  const r = code(APP, 'Regel89.kt');
  for (const [t, c] of [['nedlasting', '5AC8FA'], ['backup', '30D158'], ['spiller', 'FFB340'], ['avtale', 'FF6A4D'], ['pakke', 'BF8CFF']]) {
    assert.match(r, new RegExp(`"${t}" -> 0xFF${c}\\.toInt\\(\\)`), t);
  }
  assert.ok(r.includes('"M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"'));
  assert.ok(r.includes('"M4 8l8-4 8 4v8.5l-8 4-8-4zM4 8l8 4 8-4M12 12v8.5"'));
});
