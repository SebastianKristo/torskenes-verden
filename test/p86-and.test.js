// Prompt 86 (AND86): tre sikkerhetsfunn i Android-appene.
//  A. Signeringsnøkkelen leses fra miljøet (ANDROID_KEYSTORE_*), og Homelab ↔ Kalender sammenligner signeringssertifikater.
//  B. Klartekst-http bare på lokalt nett (Fase 5: én kopi i :felles, LokaltNett.kt) – håndhevet i koden for alle HTTP-klienter
//     i :app, :kalender og :wear. JUnit-testene i :felles (ServerAdresseTest) kjører samme fasit på CI.
//  C. Lenker som utfører handlinger må bekreftes når de kommer utenfra (Link86.kt).
// Kildesjekker + fasit for adresse-sjekken. Regelen er speilet i JS her, og den ekte Kotlin-fila kompileres og kjøres mot
// samme fasit når Gradles Kotlin-kompilator finnes på maskinen (ellers hoppes den testen over).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'apps/android');
const SRC = join(AND, 'app/src/main/java/no/kristo/finanshub');
const KAL = join(AND, 'kalender/src/main/java/no/kristo/kalender');
const WEAR = join(AND, 'wear/src/main/java/no/kristo/finanshub/wear');
const FELLES = join(AND, 'felles/src/main/kotlin/no/kristo/felles/nett');
const raw = (p) => readFileSync(p, 'utf8');
/** Kode uten kommentarer. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (f, dir = SRC) => strip(raw(join(dir, f)));
/** Alle .kt-filer under en mappe. */
function ktFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...ktFiles(p));
    else if (e.name.endsWith('.kt')) out.push(p);
  }
  return out;
}

const MSG = 'Usikret tilkobling (http) er bare tillatt på lokalt nett. Bruk https.';

/* ---- Fasit for adresse-sjekken ---- */
const GODTAS = [
  'http://10.0.0.5', 'http://192.168.1.2', 'http://192.168.1.2:3000/finans', 'http://172.16.0.1', 'http://172.31.255.255', 'http://100.64.1.1',
  'http://127.0.0.1', 'http://[::1]', 'http://[::1]:3000/', 'http://[fd00::1]', 'http://[fe80::1]/', 'http://169.254.10.1',
  'http://nas.local', 'http://homelab', 'http://homelab:3000', 'http://localhost', 'http://srv.lan', 'http://x.home.arpa', 'http://x.internal',
  'http://[::ffff:10.0.0.1]/', 'HTTP://NAS.LOCAL/', 'http://bruker:pw@10.0.0.5/', 'ws://192.168.1.2/api/ws',
  // https er alltid i orden
  'https://example.com', 'https://8.8.8.8', 'https://10.0.0.5', 'wss://example.com/api/ws',
];
const AVVISES = [
  'http://172.32.0.1', 'http://172.15.0.1', 'http://example.com', 'http://8.8.8.8', 'http://100.63.0.1', 'http://100.128.0.1',
  'http://[2001:db8::1]/', 'http://[::ffff:8.8.8.8]/', 'ws://example.com/ws',
  // forkledninger
  'http://10.0.0.1.evil.com/', 'http://192.168.1.2@evil.com/', 'http://nas.local.evil.com', 'http://evil.com/?a=10.0.0.1', 'http://evil.com#.local',
  // tallformer som ikke er vanlig a.b.c.d kan peke hvor som helst
  'http://2130706433/', 'http://134744072/', 'http://0x7f.0.0.1/', 'http://010.0.0.1/', 'http://10.1/', 'http://256.1.1.1', 'http://',
];

/* ---- Speiler Lokal86 (samme regel i JS) ---- */
const lokalV4 = (a, b) => a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
function v4(s) {
  const p = s.split('.');
  if (p.length !== 4) return null;
  const out = [];
  for (const d of p) {
    if (!/^\d{1,3}$/.test(d) || (d.length > 1 && d[0] === '0') || Number(d) > 255) return null;
    out.push(Number(d));
  }
  return out;
}
function grupper(s) {
  if (s === '') return [];
  const out = [];
  for (const g of s.split(':')) { if (!/^[0-9a-f]{1,4}$/.test(g)) return null; out.push(parseInt(g, 16)); }
  return out;
}
function v6(h) {
  let s = h;
  if (s.includes('.')) {
    const i = s.lastIndexOf(':');
    const a = v4(s.slice(i + 1));
    if (!a) return null;
    s = s.slice(0, i + 1) + (a[0] * 256 + a[1]).toString(16) + ':' + (a[2] * 256 + a[3]).toString(16);
  }
  const dbl = s.indexOf('::');
  if (dbl !== s.lastIndexOf('::')) return null;
  if (dbl < 0) { const g = grupper(s); return g && g.length === 8 ? g : null; }
  const a = grupper(s.slice(0, dbl)), b = grupper(s.slice(dbl + 2));
  if (!a || !b || a.length + b.length > 7) return null;
  return [...a, ...Array(8 - a.length - b.length).fill(0), ...b];
}
function lokalVert(vert) {
  let h = String(vert ?? '').trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  h = h.split('%')[0].replace(/\.+$/, '');
  if (!h) return false;
  if (h.includes(':')) {
    const g = v6(h);
    if (!g) return false;
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return lokalV4(g[6] >> 8, g[6] & 0xff);
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80;
  }
  const deler = h.split('.');
  if (deler.some((d) => d === '')) return false;
  if (deler.every((d) => /^\d*$/.test(d) || d.startsWith('0x'))) { const a = v4(h); return !!a && lokalV4(a[0], a[1]); }
  if (!/^[\p{L}\p{N}._-]+$/u.test(h)) return false;
  return deler.length === 1 || ['.local', '.lan', '.home.arpa', '.internal'].some((e) => h.endsWith(e));
}
function ok(url) {
  const s = String(url ?? '').trim();
  const i = s.indexOf('://');
  if (i <= 0) return true;
  const skjema = s.slice(0, i).toLowerCase();
  if (skjema !== 'http' && skjema !== 'ws') return true;
  // Verten leses ordrett (som java.net.URL): WHATWG-URL i JS ville gjort «2130706433» om til 127.0.0.1.
  let a = s.slice(i + 3).split(/[/?#]/)[0];
  a = a.slice(a.lastIndexOf('@') + 1);
  const vert = a.startsWith('[') ? a.slice(0, a.indexOf(']') + 1) : a.split(':')[0];
  return lokalVert(vert);
}

/* ======================= B. http bare på lokalt nett ======================= */

test('B: fasit for adresse-sjekken (regelen speilet i JS)', () => {
  for (const u of GODTAS) assert.equal(ok(u), true, `skal godtas: ${u}`);
  for (const u of AVVISES) assert.equal(ok(u), false, `skal avvises: ${u}`);
  // Oppgavens fasit, ordrett
  for (const h of ['10.0.0.5', '192.168.1.2', '172.16.0.1', '100.64.1.1', '127.0.0.1', '[::1]', '[fd00::1]', 'nas.local', 'homelab']) assert.equal(lokalVert(h), true, h);
  for (const h of ['172.32.0.1', 'example.com', '8.8.8.8']) assert.equal(lokalVert(h), false, h);
});

test('B: regelen ligger én gang i :felles (LokaltNett.kt), ingen kopier i modulene, og kaster riktig tekst', () => {
  for (const dir of [SRC, KAL, WEAR]) assert.ok(!existsSync(join(dir, 'Lokal86.kt')), `${dir}: kopien er slettet`);
  for (const dir of [SRC, KAL, WEAR]) for (const f of ktFiles(dir)) assert.ok(!/object Lokal(86|tNett)\b|fun lokalVert\(/.test(strip(raw(f))), `${f}: egen kopi av regelen`);
  for (const m of ['app', 'kalender', 'wear']) assert.match(raw(join(AND, m, 'build.gradle.kts')), /implementation\(project\(":felles"\)\)/, m);
  assert.match(raw(join(AND, 'settings.gradle.kts')), /include\(":felles"\)/);
  const c = strip(raw(join(FELLES, 'LokaltNett.kt')));
  assert.match(c, /^package no\.kristo\.felles\.nett$/m);
  assert.ok(c.includes(`const val MSG = "${MSG}"`), 'teksten brukeren ser');
  assert.match(c, /"http", "ws" -> lokalVert\(vert\)/, 'bare klartekst sjekkes; https er alltid i orden');
  assert.match(c, /a == 10 \|\| a == 127 \|\| \(a == 172 && b in 16\.\.31\) \|\| \(a == 192 && b == 168\) \|\| \(a == 169 && b == 254\) \|\| \(a == 100 && b in 64\.\.127\)/);
  assert.match(c, /\(g\[0\] and 0xfe00\) == 0xfc00 \|\| \(g\[0\] and 0xffc0\) == 0xfe80/, 'IPv6 ULA og link-local');
  for (const e of ['.local', '.lan', '.home.arpa', '.internal']) assert.ok(c.includes(`"${e}"`), e);
  assert.ok(!/InetAddress/.test(c), 'selve regelen slår aldri opp i DNS');
  // Sperret forbindelse: kobler aldri til, kaster der en vanlig forbindelse ville feilet. Et lokalt navn må i tillegg peke lokalt (S3).
  assert.match(c, /fun URL\.openSikker\(\): HttpURLConnection = when \{\s*!LokaltNett\.ok\(this\) -> Sperret\(this\)\s*!Klartekstvakt\.tillatt\(protocol, host\) -> Sperret\(this\)\s*else -> openConnection\(\) as HttpURLConnection/);
  assert.match(c, /class UsikretHttp : IOException\(LokaltNett\.MSG\)/);
  for (const m of ['connect', 'getInputStream', 'getOutputStream', 'getResponseCode']) assert.match(c, new RegExp(`override fun ${m}\\(\\)[^\\n]*throw UsikretHttp\\(\\)`), m);
  // S3: et lokalt navn over klartekst må peke til lokale adresser (alle), ukjent feil ved oppslaget gir ingen klartekst.
  const v = strip(raw(join(FELLES, 'Klartekstvakt.kt')));
  assert.match(v, /if \(!LokaltNett\.lokalVert\(vert\)\) return false/);
  assert.match(v, /if \(LokaltNett\.erIpAdresse\(vert\)\) return true/);
  assert.match(v, /catch \(e: Exception\) \{\s*return false/);
  assert.match(v, /adresser\.isNotEmpty\(\) && adresser\.all \{ LokaltNett\.lokalIp\(it\) \}/);
});

test('B: ingen HTTP-klient går utenom regelen (alle modulene)', () => {
  for (const dir of [SRC, KAL, WEAR]) {
    for (const f of ktFiles(dir)) {
      const c = strip(raw(f));
      assert.ok(!/\.openConnection\(/.test(c), `${f}: bruk openSikker() i stedet for openConnection()`);
      // openStream() er bare lov på faste https-adresser.
      for (const m of c.matchAll(/URL\(([^)]*)\)\.openStream\(\)/g)) assert.equal(m[1], 'WORLD_ATLAS', `${f}: openStream på ${m[1]}`);
      // Hver OkHttp-klient har interceptoren (før tilkobling og ved omdirigering).
      for (const m of c.matchAll(/OkHttpClient\.Builder\(\)[\s\S]*?\.build\(\)/g)) {
        assert.match(m[0], /\.addInterceptor\(LokalOkHttp\)\.addNetworkInterceptor\(LokalOkHttp\)/, `${f}: OkHttp uten LokalOkHttp`);
      }
      // WebView: bare klienten som stopper http utenfor lokalt nett.
      assert.ok(!/WebViewClient\(\)/.test(c.replace(/open class LokalWebKlient : android\.webkit\.WebViewClient\(\)/, '')), `${f}: bruk LokalWebKlient`);
    }
  }
  assert.match(code('Geo.kt'), /const val WORLD_ATLAS = "https:\/\//);
  assert.ok(ktFiles(SRC).filter((f) => /openSikker\(\)/.test(raw(f))).length >= 15, 'kallene i :app går via openSikker()');
  assert.match(code('KalApi.kt', KAL), /URL\(base\.trimEnd\('\/'\) \+ path\)\.openSikker\(\)/);
  assert.match(code('WearApi.kt', WEAR), /\.openSikker\(\)/);

  const okh = code('LokalOkHttp.kt');
  assert.match(okh, /if \(!u\.isHttps && !LokaltNett\.lokalVert\(u\.host\)\) throw UsikretHttp\(\)/);
  // S3: som nettverksinterceptor sjekkes adressen forbindelsen faktisk gikk til.
  assert.match(okh, /!Klartekstvakt\.tillattAdresse\(u\.isHttps, c\.route\(\)\.socketAddress\.address\)\) throw UsikretHttp\(\)/);
  assert.match(okh, /override fun shouldInterceptRequest[\s\S]*?!LokaltNett\.ok\(u\.scheme, u\.host\)[\s\S]*?WebResourceResponse\(/, 'WebView omgår ikke regelen');
  assert.match(okh, /fun httpsUtenforHjemmet\(url: String\): String = if \(LokaltNett\.ok\(url\)\) url else "https"/);
  assert.match(code('ui/FamilyMap.kt'), /\.let\(::httpsUtenforHjemmet\)/, 'kartfliser (Familie)');
  assert.match(code('ui/KartPage.kt'), /\.let\(::httpsUtenforHjemmet\)/, 'kartfliser (Kart)');
  assert.equal((code('ui/WeatherSheets.kt').match(/webViewClient = LokalWebKlient\(\)/g) ?? []).length, 2);
  assert.match(code('SkjoldModel.kt'), /object : LokalWebKlient\(\)/);
});

test('B: brukeren får teksten, og konfigurasjonen har ingen hardkodet adresse', () => {
  assert.match(code('Api.kt'), /catch \(e: UsikretHttp\) \{\s*throw ApiException\(LokaltNett\.MSG\)[\s\S]*?catch \(e: IOException\)/, 'Api: før den generelle nettverksfeilen');
  assert.match(code('WearApi.kt', WEAR), /catch \(e: UsikretHttp\) \{\s*throw WearApiFeil\(LokaltNett\.MSG\)[\s\S]*?catch \(e: IOException\)/);
  assert.match(code('KalApi.kt', KAL), /catch \(e: IOException\) \{\s*throw KalApiException\(e\.message \?: "Nettverksfeil"\)/, 'Kalender viser meldingen fra unntaket');
  assert.match(code('Serveradresse.kt'), /fun cleartextBlocked47\(u: String\): Boolean = !LokaltNett\.ok\(u\)/, 'innstillingene bruker samme regel');
  for (const f of ['Serveradresse.kt', 'ui/Serveradresse.kt', 'Ntfy51.kt']) assert.ok(!/tillater bare http/.test(code(f)), `${f}: gammel tekst om én fast adresse`);

  for (const m of ['app', 'kalender', 'wear']) {
    const xml = raw(join(AND, m, 'src/main/res/xml/network_security_config.xml')).replace(/<!--[\s\S]*?-->/g, '');
    assert.match(xml, /<base-config cleartextTrafficPermitted="true"/, `${m}: klartekst tillates (håndheves i koden)`);
    assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(xml), `${m}: ingen hardkodet adresse`);
    // S2 (Fase 5): domain-config finnes bare for de lokale navnene (der brukerinstallerte CA-er godtas), aldri for en vert.
    const domener = [...xml.matchAll(/<domain[^>]*>([^<]*)<\/domain>/g)].map((x) => x[1].trim());
    for (const d of domener) assert.ok(['local', 'lan', 'home.arpa', 'internal'].includes(d), `${m}: domain-config for ${d}`);
    const base = xml.slice(xml.indexOf('<base-config'), xml.indexOf('</base-config>') + 1);
    assert.ok(!/src="user"/.test(base), `${m}: brukerinstallerte CA-er gjelder ikke all trafikk`);
    assert.match(raw(join(AND, m, 'src/main/AndroidManifest.xml')), /android:networkSecurityConfig="@xml\/network_security_config"/, `${m}: manifestet peker på fila`);
    assert.ok(!/usesCleartextTraffic/.test(raw(join(AND, m, 'src/main/AndroidManifest.xml'))), m);
  }
});

test('B: den ekte LokaltNett.kt (:felles) kjørt mot fasiten (kotlinc fra Gradle)', (t) => {
  // Finn Gradles lib-mappe (kotlin-compiler-embeddable følger med Gradle). Finnes den ikke: hopp over.
  let lib = null;
  try {
    const which = spawnSync('sh', ['-c', 'command -v gradle'], { encoding: 'utf8' }).stdout.trim();
    const cand = [process.env.GRADLE_HOME && join(process.env.GRADLE_HOME, 'lib'), which && join(dirname(dirname(realpathSync(which))), 'lib')].filter(Boolean);
    lib = cand.find((d) => existsSync(d) && readdirSync(d).some((f) => /^kotlin-compiler-embeddable-.*\.jar$/.test(f))) ?? null;
  } catch { /* ingen Gradle */ }
  const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (!lib || java.status !== 0) return t.skip('fant ikke Gradles Kotlin-kompilator (eller java)');
  const jars = readdirSync(lib);
  const pick = (re) => jars.filter((f) => re.test(f)).map((f) => join(lib, f));
  const stdlib = pick(/^kotlin-stdlib-\d.*\.jar$/)[0];
  const cp = [...pick(/^kotlin-compiler-embeddable-/), stdlib, ...pick(/^kotlin-daemon-embeddable-/), ...pick(/^kotlin-reflect-/), ...pick(/^kotlinx-coroutines-core-jvm-/), ...pick(/^annotations-\d/), ...pick(/^trove4j-/)].join(':');
  const dir = mkdtempSync(join(tmpdir(), 'p86-and-'));
  try {
    const kt = (a) => 'listOf(' + a.map((u) => JSON.stringify(u).replace(/\$/g, '\\$')).join(', ') + ')';
    writeFileSync(join(dir, 'Fasit.kt'), `import no.kristo.felles.nett.*
import java.net.URL
fun main() {
    var feil = 0
    for (u in ${kt(GODTAS)}) if (!LokaltNett.ok(u)) { println("SKULLE GODTAS: " + u); feil++ }
    for (u in ${kt(AVVISES)}) if (LokaltNett.ok(u)) { println("SKULLE AVVISES: " + u); feil++ }
    // Sperret forbindelse: ingen tilkobling, riktig tekst – og oppsettet rundt (metode, tidsgrenser, hoder) tåles.
    val c = URL("http://example.com/x").openSikker()
    c.requestMethod = "PATCH"; c.connectTimeout = 5; c.doOutput = true; c.setRequestProperty("A", "b")
    for (f in listOf<() -> Any?>({ c.responseCode }, { c.inputStream }, { c.outputStream }, { c.connect() })) {
        try { f(); println("KASTET IKKE"); feil++ } catch (e: UsikretHttp) { if (e.message != LokaltNett.MSG) { println("FEIL TEKST"); feil++ } }
    }
    c.disconnect()
    if (URL("http://127.0.0.1:1/").openSikker().javaClass.name.contains("Sperret")) { println("lokal adresse ble sperret"); feil++ }
    if (URL("https://example.com/").openSikker().javaClass.name.contains("Sperret")) { println("https ble sperret"); feil++ }
    println(if (feil == 0) "FASIT OK" else "FASIT FEIL: " + feil)
}
`);
    const env = { ...process.env };
    delete env.JAVA_TOOL_OPTIONS;
    const opt = { encoding: 'utf8', env, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] };
    const kc = spawnSync('java', ['-cp', cp, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-nowarn', '-cp', stdlib, '-d', join(dir, 'out'), join(FELLES, 'LokaltNett.kt'), join(FELLES, 'Klartekstvakt.kt'), join(dir, 'Fasit.kt')], opt);
    if (kc.status !== 0) {
      const log = String(kc.stdout ?? '') + String(kc.stderr ?? '');
      // Feil i kilden skal felle testen; en kompilator som ikke lar seg starte på denne maskinen, skal ikke.
      if (/(LokaltNett|Klartekstvakt|Fasit)\.kt:\d+:\d+: error:/.test(log)) assert.fail(log.slice(0, 3000));
      return t.skip('Kotlin-kompilatoren fra Gradle lot seg ikke kjøre her');
    }
    const out = execFileSync('java', ['-cp', [join(dir, 'out'), stdlib].join(':'), 'FasitKt'], opt);
    assert.match(out, /FASIT OK/, out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ======================= A. Signering ======================= */

test('A: Gradle leser signeringen fra miljøet – uten nøkkel: debug-nøkkel med advarsel, og release stopper', () => {
  const root = raw(join(AND, 'build.gradle.kts'));
  for (const n of ['ANDROID_KEYSTORE_FILE', 'ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) assert.ok(strip(root).includes(`"${n}"`), n);
  assert.match(root, /System\.getenv\(n\)\?\.takeIf \{ it\.isNotBlank\(\) \}/, 'tomme verdier (hemmelighet mangler i CI) regnes som ikke satt');
  assert.match(root, /createTempFile\("android-keystore", "\.jks"\)[\s\S]*?getMimeDecoder\(\)\.decode/, 'base64 dekodes til en fil utenfor repoet');
  assert.match(root, /if \(sign86\.isEmpty\(\)\) \{\s*logger\.warn\("ADVARSEL \(signering\)/, 'tydelig advarsel uten egen nøkkel');
  assert.match(root, /throw GradleException\("Signering: nøkkelfil er satt i miljøet, men "/, 'halvt oppsett stopper bygget i stedet for å signere med feil nøkkel');
  assert.match(root, /extra\["sign86"\] = sign86/);
  // Passord og alias skrives aldri ut.
  for (const l of root.split('\n').filter((x) => /logger\.|println/.test(x))) assert.ok(!/env\(|storePassword|keyPassword|\$\{?sign86/.test(l), `logger ikke hemmeligheter: ${l}`);

  for (const m of ['app', 'kalender', 'wear']) {
    const g = raw(join(AND, m, 'build.gradle.kts'));
    assert.match(g, /val sign86 = rootProject\.extra\["sign86"\] as Map<String, String>/, m);
    assert.match(g, /if \(sign86\.isNotEmpty\(\)\) \{\s*create\("release"\) \{\s*storeFile = file\(sign86\.getValue\("file"\)\)\s*storePassword = sign86\["storePassword"\]\s*keyAlias = sign86\["keyAlias"\]\s*keyPassword = sign86\["keyPassword"\]/, m);
    assert.equal((g.match(/if \(sign86\.isNotEmpty\(\)\) signingConfig = signingConfigs\.getByName\("release"\)/g) ?? []).length, 2, `${m}: debug og release bruker egen nøkkel når den finnes`);
    assert.doesNotMatch(g, /sideload\.jks|create\("sideload"\)|getByName\("sideload"\)/, `${m}: ingen nøkkel i repoet å falle tilbake på`);
  }
  assert.ok(!existsSync(join(AND, 'signing/sideload.jks')), 'nøkkelfila er slettet (docs/android-signering.md)');
});

test('A: arbeidsflytene dekoder nøkkelen utenfor repoet, bare når hemmeligheten finnes, og logger den ikke', () => {
  for (const f of ['release.yml', 'mobile.yml']) {
    const y = raw(join(ROOT, '.github/workflows', f));
    const a = y.indexOf('\n  android:'), b = y.indexOf('\n  ios:');
    assert.ok(a > 0 && b > a, f);
    const job = y.slice(a, b);
    assert.match(job, /env:\s*\n(\s*#.*\n)*\s*HAR_ANDROID_NOKKEL: \$\{\{ secrets\.ANDROID_KEYSTORE_BASE64 != '' \}\}/, `${f}: env-verdi på jobben`);
    assert.match(job, /if: env\.HAR_ANDROID_NOKKEL == 'true'/, `${f}: if på env-verdien`);
    for (const l of job.split('\n').filter((x) => /^\s*if:/.test(x))) assert.ok(!/secrets\./.test(l), `${f}: ikke secrets direkte i if (${l.trim()})`);
    assert.match(job, /printf '%s' "\$KEYSTORE_B64" \| base64 -d > "\$RUNNER_TEMP\/android-signering\.jks"/, `${f}: dekodes til RUNNER_TEMP`);
    assert.match(job, /echo "ANDROID_KEYSTORE_FILE=\$RUNNER_TEMP\/android-signering\.jks" >> "\$GITHUB_ENV"/, f);
    for (const n of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) assert.ok(job.includes(`${n}: \${{ secrets.${n} }}`), `${f}: ${n}`);
    // Hemmeligheter står bare i env:-linjer, aldri i kommandoer (da kunne de havnet i loggen), og skrives ikke ut.
    for (const l of job.split('\n')) {
      if (/secrets\./.test(l)) assert.match(l, /^\s+[A-Z0-9_]+: \$\{\{ secrets\.[A-Z0-9_]+( != '')? \}\}\s*$/, `${f}: ${l.trim()}`);
      if (/echo|printf/.test(l) && /KEYSTORE_B64|PASSWORD|KEY_ALIAS/.test(l)) assert.match(l, /\| base64 -d >/, `${f}: skriver ikke hemmeligheter til logg (${l.trim()})`);
    }
    assert.ok(!/set -x/.test(job), f);
    assert.ok(!/android\.injected\.signing/.test(job), `${f}: passord sendes ikke som kommandolinje-argument`);
    assert.match(job, /\.\/gradlew --no-daemon assemble(Release|Debug)/, f);
  }
});

test('A: Homelab gir bare token til en Kalender-app med samme signeringssertifikat', () => {
  const p = code('KalenderApp.kt');
  assert.match(p, /private fun sameSigner86\(ctx: Context, uid: Int\): Boolean =\s*runCatching \{ ctx\.packageManager\.checkSignatures\(uid, android\.os\.Process\.myUid\(\)\) == PackageManager\.SIGNATURE_MATCH \}\.getOrDefault\(false\)/);
  const call = p.slice(p.indexOf('override fun call('));
  const perm = call.indexOf('checkCallingPermission(PERM)'), pkg = call.indexOf('KalenderApp33.PKG !in caller'), sig = call.indexOf('!sameSigner86(ctx, Binder.getCallingUid())'), konto = call.indexOf('AccountStore(ctx)');
  assert.ok(perm > 0 && pkg > perm && sig > pkg && konto > sig, 'tillatelse → pakkenavn → sertifikat, alt før kontoen leses');
  // Og motsatt vei: Kalender tar bare imot server/token fra en Homelab-app med samme sertifikat.
  const ka = code('KalApi.kt', KAL);
  assert.match(ka, /fun homelabSameKey86\(ctx: Context\): Boolean =\s*runCatching \{ ctx\.packageManager\.checkSignatures\(ctx\.packageName, HOMELAB_PKG\) == android\.content\.pm\.PackageManager\.SIGNATURE_MATCH \}\.getOrDefault\(false\)/);
  assert.match(ka, /if \(!homelabSameKey86\(ctx\)\) return@withContext null to "Homelab-appen er signert med en annen nøkkel/);
  const k41 = code('Innlogging.kt', KAL);
  assert.match(k41, /!KalAuth\.homelabInstalled\(ctx\) \|\| !KalAuth\.homelabSameKey86\(ctx\)\) return@withContext null/);
  assert.match(k41, /if \(KalAuth\.homelabInstalled\(ctx\) && !KalAuth\.homelabSameKey86\(ctx\)\) return@withContext null to/);
});

test('A: docs/android-signering.md har stegene – uten passord i klartekst', () => {
  const d = raw(join(ROOT, 'docs/android-signering.md'));
  assert.match(d, /keytool -genkeypair -keystore homelab-release\.jks -storetype PKCS12 \\\n\s+-alias homelab -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Homelab"/);
  assert.ok(!/-storepass|-keypass/.test(d), 'ingen passord på kommandolinjen i eksemplene');
  assert.match(d, /base64 -w0 homelab-release\.jks/);
  assert.match(d, /Settings → Secrets and variables → Actions/);
  for (const n of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) assert.ok(d.includes('`' + n + '`'), n);
  assert.match(d, /Avinstaller/);
  assert.match(d, /Bytt alle tre appene samtidig/);
  assert.match(d, /git-historikken/);
  assert.match(d, /\*\*byttet\*\* til en ny nøkkel som gir sikkerheten/);
});

/* ======================= C. Lenker som utfører handlinger ======================= */

test('C: lenker utenfra som endrer noe, spør først – appens egne varsler og widgeter går som før', () => {
  const l = code('Link86.kt');
  assert.match(l, /SecureRandom\(\)\.nextBytes/, 'markøren er en tilfeldig nøkkel');
  assert.match(l, /getSharedPreferences\(SP, Context\.MODE_PRIVATE\)/, 'lagret privat i appen');
  assert.match(l, /fun internal\(ctx: Context, intent: Intent\?\): Boolean =\s*runCatching \{ intent\?\.getStringExtra\(EXTRA\)\?\.let \{ it == key\(ctx\) \} == true \}\.getOrDefault\(false\)/);
  assert.match(l, /fun Intent\.intern86\(ctx: Context\): Intent = putExtra\(Link86\.EXTRA, Link86\.key\(ctx\)\)/);

  const r = code('LinkRegel86.kt');
  for (const s of ['"start" -> Ask86("Vil du starte Hjemlys?"', '"home" -> Ask86("Vil du melde «Jeg er hjemme»?"', '"ok" -> Ask86("Vil du melde «Alt bra»?"',
    '"ok" -> Ask86("Vil du svare 👍 på innsjekken?"', '"pickup" -> Ask86("Vil du svare at du kommer og henter?"', '"call" -> Ask86("Vil du svare «Ringer» på innsjekken?"',
    'i handlelisten?"', 'Ask86("Vil du slå på sanntid i Kart?"']) assert.ok(r.includes(s), s);
  assert.match(r, /"familie", "family" -> if \(q\["id"\]\.isNullOrBlank\(\)\) null else when \(q\["act"\]\)/, 'bare med id og act');
  assert.match(r, /else -> null\n\}/, 'alt annet åpner bare en side');

  // Inngangen: ACTION_VIEW uten markøren = utenfra. Sjekken står før noe utføres.
  const main = code('MainActivity.kt');
  assert.match(main, /vm\.deepLink\(u, outside86 = !Link86\.internal\(this, from86\)\)/);
  assert.match(main, /from86 = intent\s*if \(fresh85\) intent\?\.data\?\.let\(::openData43\)/, 'onCreate');
  assert.match(main, /from86 = intent\s*intent\.data\?\.let\(::openData43\)/, 'onNewIntent');
  const vm = code('AppViewModel.kt');
  assert.match(vm, /fun deepLink\(uri: Uri, outside86: Boolean = false\) \{/, 'kall inne i appen (knapper, Glimt) er ikke utenfra');
  const dl = vm.slice(vm.indexOf('fun deepLink(uri: Uri, outside86: Boolean = false)'));
  const ask = dl.indexOf('if (outside86) Link86.ask(uri)?.let { link86 = uri to it; return }');
  assert.ok(ask > 0 && ask < dl.indexOf('"hjemlys" -> hjemlysLink40(uri)') && ask < dl.indexOf('familyLink50(uri)') && ask < dl.indexOf('act51Link(uri)') && ask < dl.indexOf('kartLink46(uri)'), 'spør før handlingene');
  // Lenkene som faktisk utfører noe (om en ny kommer til her, må den inn i linkAsk86).
  assert.match(code('HjemlysModel.kt'), /"start" -> \{[\s\S]*?startHjemlys40\(/);
  assert.match(code('FamilyModel.kt'), /"call", "ok", "pickup" -> if \(id != null\) replyCheckin50\(id, act\)/);
  assert.match(code('Shortcuts51Plat.kt'), /"add" -> addFromLink51\(/);
  assert.match(code('KartModel.kt'), /if \(live && !z\.live\) kartLive46\(z\)/);

  // Dialogen: hva som skjer, Avbryt / Utfør.
  const ui = code('ui/Link86Ui.kt');
  assert.match(ui, /val l = vm\.link86 \?: return/);
  assert.match(ui, /TextButton\(\{ vm\.link86 = null; vm\.deepLink\(l\.first\) \}\) \{ Text\("Utfør"/);
  assert.match(ui, /TextButton\(\{ vm\.link86 = null \}\) \{ Text\("Avbryt"/);
  assert.match(code('ui/GlobaleLag.kt'), /Link86Dialog\(vm\)/, 'tegnes globalt');

  // Egne varsler, widgeter og den dynamiske snarveien bærer markøren (og PendingIntent oppdateres, så den følger med).
  assert.match(code('HjemlysModel.kt'), /finanshub:\/\/hjemlys\/start"[\s\S]{0,200}?\.intern86\(ctx\), PendingIntent\.FLAG_IMMUTABLE or PendingIntent\.FLAG_UPDATE_CURRENT\)/, '«Ja, start»');
  assert.match(code('widget/HjemlysWidget.kt'), /finanshub:\/\/hjemlys\$path"[\s\S]{0,200}?\.intern86\(ctx\), PendingIntent\.FLAG_IMMUTABLE or PendingIntent\.FLAG_UPDATE_CURRENT\)/, 'Hjemlys-widgeten');
  assert.match(code('FamilyModel.kt'), /finanshub:\/\/familie\/sjekk\$q"[\s\S]{0,200}?\.intern86\(ctx\)\s*return PendingIntent\.getActivity\(ctx, code, i, PendingIntent\.FLAG_IMMUTABLE or PendingIntent\.FLAG_UPDATE_CURRENT\)/, 'Sjekk inn-varslene');
  assert.match(code('Shortcuts51Plat.kt'), /finanshub:\/\/act51\/\$path"[\s\S]{0,200}?\.intern86\(ctx\)/, 'dynamisk snarvei');
  assert.match(code('Live41.kt'), /Uri\.parse\(link\), ctx, MainActivity::class\.java\)[^\n]*\.intern86\(ctx\)/);
  // ntfy-meldinger kan komme fra andre: de får aldri markøren.
  assert.ok(!/intern86/.test(code('Ntfy51.kt')));
});

test('C: Kalender – kalender://ny?text=… som ville laget en hendelse, spør først', () => {
  const vm = code('KalVm.kt', KAL);
  assert.match(vm, /host == "ny" -> \{ val t = uri\.getQueryParameter\("text"\)\.orEmpty\(\); if \(session != null && autoQuick86\(t\)\) ask86 = t else incomingText\(t\) \}/);
  assert.match(vm, /private fun autoQuick86\(t: String\) = t\.isNotBlank\(\) && looksPasted\(t\) && parseQuick\(t, drem, defDur = dd\)\.s == null/);
  assert.match(vm, /fun confirmLink86\(\) \{ val t = ask86 \?: return; ask86 = null; quick\(t\) \}/);
  assert.match(vm, /if \(autoQuick86\(t\)\) quick\(t\) else \{ ct = t; focusComposer\+\+ \}/, 'Del → Kalender går som før');
  const ui = code('ui/Lenkebekreftelse.kt', KAL);
  assert.match(ui, /TextButton\(\{ vm\.confirmLink86\(\) \}\) \{ Text\("Utfør"/);
  assert.match(ui, /TextButton\(\{ vm\.ask86 = null \}\) \{ Text\("Avbryt"/);
  assert.match(code('ui/KalRoot.kt', KAL), /if \(vm\.session != null\) Link86Host\(vm\)/);
});
