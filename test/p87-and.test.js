// Prompt 87 (NRKAND): NRK-fanen i Media i Homelab-appen for Android (pakke 57, claude-code-media-nrk-nedlaster.md).
//  - Fanen «NRK» mellom Prowlarr og Avspilling, fanelinja ruller valgt fane inn i midten.
//  - Kortene Last ned fra NRK (med «Lim inn»), Køen, Serier du følger og Bibliotek – alt via /api/media/nrk/* (Api → open86()).
//  - Del → Homelab med en NRK-lenke fyller bare ut feltet. Ingenting lastes ned før brukeren trykker «Last ned».
// Kildesjekker + fasit for de rene reglene (NrkRegel87.kt). Lenkeregelen er speilet i JS her, og den ekte Kotlin-fila kompileres
// og kjøres mot samme fasit når Gradles Kotlin-kompilator finnes på maskinen (ellers hoppes den testen over).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
const raw = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (f) => strip(raw(f));
/** Kroppen til en funksjon (fra signaturen til neste funksjon/slutt på toppnivå). */
function body(src, sig) {
  const i = src.indexOf(sig);
  assert.ok(i >= 0, `fant ikke ${sig}`);
  const rest = src.slice(i + sig.length);
  const j = rest.search(/\n(?:@Composable\n)?(?:private |internal )?(?:suspend )?fun /);
  return rest.slice(0, j < 0 ? rest.length : j);
}

/* ---- Fasit for lenkeregelen ---- */
const GODTAS = [
  ['https://tv.nrk.no/serie/exit', 'https://tv.nrk.no/serie/exit'],
  ['  https://radio.nrk.no/podkast/abels_taarn  ', 'https://radio.nrk.no/podkast/abels_taarn'],
  ['http://tv.nrk.no/program/KMTE50001219', 'https://tv.nrk.no/program/KMTE50001219'],
  ['tv.nrk.no/serie/skam', 'https://tv.nrk.no/serie/skam'],
  ['https://nrk.no', 'https://nrk.no'],
  ['https://www.nrk.no/video/abc?x=1#t', 'https://www.nrk.no/video/abc?x=1#t'],
  ['https://nrksuper.no/serie/fantorangen', 'https://nrksuper.no/serie/fantorangen'],
  ['HTTPS://TV.NRK.NO/serie/exit', 'HTTPS://TV.NRK.NO/serie/exit'],
];
const AVVISES = [
  '', '   ', 'exit', 'https://example.com/tv.nrk.no', 'https://tv.nrk.no.evil.com/serie', 'https://evilnrk.no/x', 'https://nrk.no@evil.com/x',
  'https://evil.com/?u=https://tv.nrk.no/x y', 'ftp://tv.nrk.no/x', 'javascript://tv.nrk.no/x', 'https://tv.nrk.no/serie/exit\nhttps://evil.com', 'https://nrk.no.', 'magnet:?xt=urn:btih:abc',
  'https://tv.nrk.no:8443/x', 'https://bruker:pw@tv.nrk.no/x',
];
const DELT = [
  ['Exit https://tv.nrk.no/serie/exit', 'https://tv.nrk.no/serie/exit'],
  ['Se «Abels tårn» på NRK Radio: https://radio.nrk.no/podkast/abels_taarn.', 'https://radio.nrk.no/podkast/abels_taarn'],
  ['https://tv.nrk.no/serie/skam/sesong/1/episode/2', 'https://tv.nrk.no/serie/skam/sesong/1/episode/2'],
  ['Kampen om tungtvannet\ntv.nrk.no/program/KMTE50001219', 'https://tv.nrk.no/program/KMTE50001219'],
  ['(https://nrksuper.no/serie/fantorangen)', 'https://nrksuper.no/serie/fantorangen'],
  ['Tannlege tirsdag kl. 10', null],
  ['https://example.com/tv.nrk.no/serie/exit', null],
  ['https://tv.nrk.no.evil.com/serie/exit', null],
  ['skriv til tips@nrk.no i dag', null],
  ['https://evilnrk.no/serie', null],
  ['x'.repeat(700) + ' https://tv.nrk.no/serie/exit', null],
];

/* ---- Speiler nrkLenke87 (samme regel i JS) ---- */
function nrkLenke(rawUrl) {
  let u = rawUrl.trim();
  if (!u || u.length > 2000 || /\s/.test(u)) return null;
  if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7);
  else if (!/^https:\/\//i.test(u)) { if (u.includes('://')) return null; u = 'https://' + u; }
  return /^https:\/\/([a-z0-9-]+\.)*(nrk\.no|nrksuper\.no)(:443)?([/?#].*)?$/i.test(u) ? u : null;
}

test('NRK-lenker: fasiten holder for regelen (speil i JS), og alt som godtas er en lenke serveren også godtar', () => {
  // Serverens regel (server/nrkdl.js): https + vert som slutter på nrk.no / nrksuper.no.
  const serverOk = (v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && /(^|\.)(nrk\.no|nrksuper\.no)$/i.test(u.hostname); } catch { return false; } };
  for (const [inn, ut] of GODTAS) {
    assert.equal(nrkLenke(inn), ut, inn);
    assert.ok(serverOk(ut), `serveren godtar ${ut}`);
    assert.match(ut, /^https:\/\//i, 'alltid https til serveren');
  }
  for (const u of AVVISES) assert.equal(nrkLenke(u), null, JSON.stringify(u));
});

test('regelfila er ren Kotlin (ingen Android-typer) og har samme lenkeregel som speilet', () => {
  const r = raw('NrkRegel87.kt');
  assert.ok(!/^import\s+(android|androidx|org\.json)/m.test(r), 'ingen Android-/JSON-import i regelfila');
  assert.ok(r.includes('Regex("^https://([a-z0-9-]+\\\\.)*(nrk\\\\.no|nrksuper\\\\.no)(:443)?([/?#].*)?$", RegexOption.IGNORE_CASE)'), 'lenkeregelen');
  for (const f of ['nrkLenke87', 'nrkDelt87', 'nrkFart87', 'nrkEta87', 'nrkSpart87', 'nrkSiden87', 'nrkFolgSub87', 'nrkChip87', 'nrkKnapper87', 'nrkEpChip87', 'nrkEpNr87', 'nrkSum87', 'nrkPause87', 'nrkKompSub87', 'tabScroll87'])
    assert.match(r, new RegExp(`\\nfun ${f}\\(`), f);
});

test('den ekte NrkRegel87.kt kjørt mot fasiten (kotlinc fra Gradle)', (t) => {
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
  const dir = mkdtempSync(join(tmpdir(), 'p87-and-'));
  try {
    const q = (s) => (s === null ? 'null' : JSON.stringify(s).replace(/\$/g, '\\$'));
    const par = (a) => 'listOf(' + a.map(([x, y]) => `${q(x)} to ${q(y)}`).join(', ') + ')';
    writeFileSync(join(dir, 'Fasit.kt'), `import no.kristo.finanshub.*
var feil = 0
fun <T> lik(hva: String, fikk: T, ventet: T) { if (fikk != ventet) { println("FEIL " + hva + ": fikk «" + fikk + "», ventet «" + ventet + "»"); feil++ } }
fun main() {
    for ((inn, ut) in ${par(GODTAS)}) lik("lenke " + inn, nrkLenke87(inn), ut)
    for (u in listOf(${AVVISES.map(q).join(', ')})) lik("avvis " + u, nrkLenke87(u), null)
    for ((inn, ut) in ${par(DELT)}) lik("delt " + inn.take(60), nrkDelt87(inn), ut)

    // Tall og tekster som i designet (nb-NO, 1 MB = 1 000 000 byte).
    lik("fart", nrkFart87(6.8e6), "6,8 MB/s"); lik("fart hel", nrkFart87(5e6), "5 MB/s"); lik("fart 0", nrkFart87(0.0), ""); lik("fart null", nrkFart87(null), "")
    lik("eta", nrkEta87(118), "1 min 58 s igjen"); lik("eta s", nrkEta87(42), "42 s igjen"); lik("eta t", nrkEta87(3725), "1 t 2 min igjen"); lik("eta null", nrkEta87(null), ""); lik("eta 0", nrkEta87(0), "")
    lik("spart", nrkSpart87(2_400_000_000L), "Spart 2,4 GB med komprimering"); lik("spart MB", nrkSpart87(350_000_000L), "Spart 350 MB med komprimering")
    lik("spart 0", nrkSpart87(0L), null); lik("spart null", nrkSpart87(null), null)
    lik("siden", nrkSiden87(1000L - 1800L + 100000L, 101000L), "30 min siden"); lik("siden nå", nrkSiden87(100000L, 100010L), "nå nettopp")
    lik("siden t", nrkSiden87(100000L, 100000L + 7200L), "2 t siden"); lik("siden null", nrkSiden87(null, 5L), null)
    lik("folg", nrkFolgSub87(100000L, "2 nye episoder", "1080", 101800L), "Sjekket 30 min siden · 2 nye episoder · 1080p")
    lik("folg best", nrkFolgSub87(null, null, "best", 101800L), "Ikke sjekket ennå · beste")
    lik("kval", nrkKval87("720"), "720p"); lik("kval best", nrkKval87("best"), "beste")

    // Køen: chip, VENTER uten norsk VPN, og knappene etter status.
    lik("chip", nrkChip87("kjorer", true), "LASTER NED" to "dl"); lik("chip ko", nrkChip87("ko", true), "I KØ" to "mut")
    lik("chip ferdig", nrkChip87("ferdig", false), "FERDIG" to "ok"); lik("chip feil", nrkChip87("feil", true), "FEIL" to "err"); lik("chip avbrutt", nrkChip87("avbrutt", true), "AVBRUTT" to "mut")
    lik("venter", nrkChip87("kjorer", false), "VENTER" to "dl"); lik("venter ko", nrkChip87("ko", false), "VENTER" to "mut")
    lik("knapper kjorer", nrkKnapper87("kjorer", "tv"), listOf("avbryt")); lik("knapper ko", nrkKnapper87("ko", "tv"), listOf("avbryt", "fjern"))
    lik("knapper feil", nrkKnapper87("feil", "tv"), listOf("igjen", "fjern")); lik("knapper avbrutt", nrkKnapper87("avbrutt", "film"), listOf("igjen", "fjern"))
    lik("knapper ferdig serie", nrkKnapper87("ferdig", "tv"), listOf("nye", "fjern")); lik("knapper ferdig radio", nrkKnapper87("ferdig", "radio"), listOf("nye", "fjern"))
    lik("knapper ferdig film", nrkKnapper87("ferdig", "film"), listOf("fjern"))
    lik("komprimerer", nrkKomprimerer87("kjorer", "Komprimerer S01E06 …"), true); lik("komprimerer ikke", nrkKomprimerer87("kjorer", "Laster ned S03E04"), false)
    lik("komprimerer ferdig", nrkKomprimerer87("ferdig", "Komprimerer …"), false)
    lik("komp sub", nrkKompSub87(true, "26", "medium"), "Standard på serveren · crf 26 · preset medium"); lik("komp sub av", nrkKompSub87(false, null, null), "Av som standard på serveren")

    // Bibliotek
    lik("ep", nrkEpNr87("tv", 3, 4), "S03E04"); lik("ep radio", nrkEpNr87("radio", 2026, 7), "#07"); lik("ep film", nrkEpNr87("film", 1, 1), "FILM"); lik("ep s47", nrkEpNr87("tv", 47, 10), "S47E10")
    lik("epchip", nrkEpChip87("lastet"), "LASTET NED" to "ok"); lik("epchip laster", nrkEpChip87("laster"), "LASTER NED" to "dl")
    lik("epchip ko", nrkEpChip87("ko"), "I KØ" to "mut"); lik("epchip mangler", nrkEpChip87("mangler"), "MANGLER" to "mut"); lik("epchip ukjent", nrkEpChip87("x"), "MANGLER" to "mut")
    lik("sum", nrkSum87(4, 2, 2), "4 serier · 2 filmer · 2 podkaster"); lik("sum 1", nrkSum87(1, 1, 1), "1 serie · 1 film · 1 podkast")

    // Oppdatering: 2 s mens noe er i kø eller lastes ned, ellers 10 s.
    lik("pause aktiv", nrkPause87(listOf("ferdig", "kjorer")), 2000L); lik("pause ko", nrkPause87(listOf("ko")), 2000L)
    lik("pause rolig", nrkPause87(listOf("ferdig", "feil", "avbrutt")), 10000L); lik("pause tom", nrkPause87(emptyList()), 10000L)

    // Fanelinja: valgt fane midt i synsfeltet, klemt mellom 0 og største rulleverdi.
    val w = listOf(120, 80, 80, 110, 90, 60, 100)
    lik("tab første", tabScroll87(w, 0, 16, 6, 360, 334), 0)
    lik("tab nrk", tabScroll87(w, 5, 16, 6, 360, 1000), 16 + 120 + 80 + 80 + 110 + 90 + 5 * 6 + 30 - 180); lik("tab nrk klemt", tabScroll87(w, 5, 16, 6, 360, 334), 334)
    lik("tab siste", tabScroll87(w, 6, 16, 6, 360, 334), 334)
    lik("tab utenfor", tabScroll87(w, 9, 16, 6, 360, 334), 0); lik("tab umålt", tabScroll87(w, 3, 16, 6, 0, 334), 0)
    println(if (feil == 0) "FASIT OK" else "FASIT FEIL: " + feil)
}
`);
    const env = { ...process.env };
    delete env.JAVA_TOOL_OPTIONS;
    const opt = { encoding: 'utf8', env, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] };
    const kc = spawnSync('java', ['-cp', cp, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-nowarn', '-cp', stdlib, '-d', join(dir, 'out'), join(SRC, 'NrkRegel87.kt'), join(dir, 'Fasit.kt')], opt);
    if (kc.status !== 0) {
      const log = String(kc.stdout ?? '') + String(kc.stderr ?? '');
      // Feil i kilden skal felle testen; en kompilator som ikke lar seg starte på denne maskinen, skal ikke.
      if (/(NrkRegel87|Fasit)\.kt:\d+:\d+: error:/.test(log)) assert.fail(log.slice(0, 3000));
      return t.skip('Kotlin-kompilatoren fra Gradle lot seg ikke kjøre her');
    }
    const out = execFileSync('java', ['-cp', [join(dir, 'out'), stdlib].join(':'), 'FasitKt'], opt);
    assert.match(out, /FASIT OK/, out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ======================= Fanen ======================= */

test('fanen «NRK» ligger mellom Prowlarr og Avspilling, og viser NRK-skjermen', () => {
  const m = code('ui/Media43.kt');
  assert.match(m, /"prowlarr" to "Prowlarr", "nrk" to "NRK", "spill" to "Avspilling"\)/);
  assert.match(m, /"nrk" -> Nrk87\(vm, pad\)/);
  assert.match(code('P43.kt'), /"nrk" -> loadNrk87\(\)/, 'fanen laster status, kø og bibliotek');
  assert.match(code('ui/Media45.kt'), /"nrk" to 0xFF2B5D8A/, 'egen fanefarge');
  assert.match(code('AppViewModel.kt'), /setOf\("snart", "sonarr", "radarr", "qbit", "prowlarr", "nrk"\)/, 'finanshub://media/nrk åpner fanen');
});

test('fanelinja ruller den valgte fanen inn i midten', () => {
  const m = code('ui/Media43.kt');
  assert.match(m, /val tabScroll = rememberScrollState\(\)/);
  assert.match(m, /\.onSizeChanged \{ tabView = it\.width \}\.horizontalScroll\(tabScroll\)/, 'synsfeltet måles');
  assert.match(m, /onSizeChanged \{ if \(tabW\[i\] != it\.width\) \{ tabW\[i\] = it\.width; tabMalt\+\+ \} \}/, 'hver fane måles');
  assert.match(m, /LaunchedEffect\(s\.tab, tabView, tabMalt\) \{[\s\S]*?tabScroll\.animateScrollTo\(tabScroll87\(tabW\.toList\(\), i, tabPad, tabGap, tabView, tabScroll\.maxValue\)\)/);
});

test('én kolonne i rekkefølgen Last ned → Køen → Serier → Bibliotek, med tomtilstand', () => {
  const u = code('ui/Nrk87Ui.kt');
  const liste = body(u, 'internal fun Nrk87(');
  const rekke = ['item("ny") { LastNed87(vm) }', 'item("ko") { Ko87(vm) }', 'item("folg") { Folger87(vm) }', 'bibliotek87(vm, cols)'].map((x) => liste.indexOf(x));
  assert.ok(rekke.every((i) => i >= 0), 'alle fire kortene');
  assert.deepEqual([...rekke].sort((a, b) => a - b), rekke, 'riktig rekkefølge');
  assert.match(liste, /n\.configured == false -> item\("tom"\) \{ Tom87\(vm\) \}/);
  for (const t of ['Last ned fra NRK', 'Køen', 'Serier du følger', 'Bibliotek', 'NRK-nedlasteren er ikke satt opp', 'Åpne Integrasjoner',
    'Legg inn adressen og tokenet til nrk-dl under Integrasjoner. Tjenesten kjører bak en egen VPN-tunnel til Norge.',
    'VPN stoppet · køen venter', 'Venter på VPN: tunnelen er ikke i Norge. Køen står stille.', 'Ingenting i køen. Lim inn en lenke fra tv.nrk.no eller radio.nrk.no.',
    'Du følger ingen serier. Slå på «Følg serien» når du legger inn en lenke.', 'Følg serien', 'Laster ned nye episoder automatisk', 'Komprimer (H.265, ca. halv størrelse)',
    'Fjern ferdige', 'Avbryt', 'Prøv igjen', 'Se etter nye', 'Fjern', 'Sjekk nå', 'Sjekker …', 'Slutt å følge', '‹ Bibliotek', 'Åpne på NRK', 'som mangler',
    'Biblioteket krever en nyere versjon av nrk-dl.', 'Finn ut selv', 'Beste', '1080p', '720p', '540p', 'Serier', 'Filmer', 'Radio',
    'tv/Serie/Season 01/Serie - S01E02 - Tittel.mkv', 'movies/Tittel/Tittel.mkv', 'podcast/Serie/2026-11-13 - Tittel.m4a']) assert.ok(u.includes(`"${t}`) || u.includes(`${t}"`) || u.includes(t), t);
  assert.ok(raw('Nrk87.kt').includes('"Bare lenker fra nrk.no og nrksuper.no."') && raw('Nrk87.kt').includes('"Lenken ligger allerede i køen."'), 'feiltekstene fra designet');
});

test('farger fra designet: blå = laster ned, grønn = ferdig/VPN, rød = feil, dempet = i kø', () => {
  const u = code('ui/Nrk87Ui.kt');
  const t = body(u, 'private fun tone87(');
  assert.match(t, /"ok" -> if \(dark\) Color\(0xFF[0-9A-F]{6}\) else Color\(0xFF2F7A4F\)/);
  assert.match(t, /"dl" -> if \(dark\) Color\(0xFF[0-9A-F]{6}\) else Color\(0xFF2B5D8A\)/);
  assert.match(t, /"err" -> p\.lab/);
  assert.match(t, /else -> p\.mut/);
});

/* ======================= Lenkefeltet, Lim inn og deling ======================= */

test('«Lim inn» fyller bare feltet, og teksten ligger i modellen (overlever at Media tegnes på nytt)', () => {
  const u = code('ui/Nrk87Ui.kt');
  const k = body(u, 'private fun LastNed87(');
  assert.match(k, /onClickLabel = "Lim inn lenke"/);
  assert.match(k, /CLIPBOARD_SERVICE\) as\? ClipboardManager\)\?\.primaryClip\?\.getItemAt\(0\)\?\.coerceToText\(ctx\)/);
  const lim = k.slice(k.indexOf('onClickLabel = "Lim inn lenke"'), k.indexOf('Text("Lim inn"'));
  assert.match(lim, /n\.url = nrkDelt87\(tekst\) \?: tekst\.take\(2000\)/, 'lenken plukkes ut av teksten');
  assert.ok(!/addNrk87|hlPost|nrkHent87/.test(lim), 'innliming starter ingen nedlasting');
  assert.match(k, /BasicTextField\(n\.url, \{ n\.url = it\.take\(2000\); n\.err = null \}/, 'feltet er bundet til vm.nrk87.url');
  assert.match(k, /val ramme = if \(n\.err != null\) p\.lab else p\.line/, 'rød ramme ved feil');
  assert.match(code('Nrk87.kt'), /class Nrk87State \{[\s\S]*?var url by mutableStateOf\(""\)/);
  assert.match(code('AppViewModel.kt'), /val nrk87 = Nrk87State\(\)/);
});

test('Del → Homelab med en NRK-lenke åpner NRK-fanen med lenken utfylt – uten å laste ned noe', () => {
  const a = code('MainActivity.kt');
  assert.match(a, /val nrk = nrkDelt87\(txt\)\s*\n\s*if \(nrk != null\) vm\.shareNrk87\(nrk\)\s*\n\s*else vm\.shareText29\(/, 'eksisterende delingsmottak (ACTION_SEND text/*)');
  assert.match(a, /if \(fresh85\) handleShare\(intent\)/, 'delingen behandles bare én gang (prompt 85)');
  const s = body(code('Nrk87.kt'), 'fun AppViewModel.shareNrk87(');
  assert.match(s, /n\.url = url/);
  assert.match(s, /p43\.tab = "nrk"/);
  assert.match(s, /openMedia43\(\)/);
  assert.ok(!/hlPost|hlDelete|addNrk87|nrkHent87|nrkJobb87/.test(s), 'ingen handling – bare utfylling');
  // Ingen ny inngang i manifestet: nrk.no-lenker fanges ikke som ACTION_VIEW.
  const man = readFileSync(join(ROOT, 'apps/android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.ok(!/nrk\.no|nrksuper/.test(man), 'manifestet er uendret for NRK');
});

test('en lenke blir bare til en jobb når brukeren trykker (Last ned / knappene i biblioteket)', () => {
  const n = code('Nrk87.kt');
  // Alle POST til /jobber ligger i addNrk87 og nrkHent87.
  const poster = [...n.matchAll(/hlPost\("\/media\/nrk\/jobber"/g)].length;
  assert.equal(poster, 2);
  assert.match(body(n, 'fun AppViewModel.addNrk87('), /hlPost\("\/media\/nrk\/jobber"/);
  assert.match(body(n, 'fun AppViewModel.nrkHent87('), /hlPost\("\/media\/nrk\/jobber"/);
  // Lasting (åpne fanen, oppdatering, deling) bruker bare GET.
  for (const f of ['fun AppViewModel.loadNrk87(', 'fun AppViewModel.loadNrkStatus87(', 'fun AppViewModel.loadNrkKo87(', 'fun AppViewModel.tickNrk87(', 'fun AppViewModel.loadNrkLib87(', 'fun AppViewModel.openNrkElem87('])
    assert.ok(!/hlPost|hlDelete|hlPut/.test(body(n, f)), f);
  const u = code('ui/Nrk87Ui.kt');
  // addNrk87 kalles bare fra «Last ned»-knappen og tastaturets «Gå» i lenkefeltet.
  assert.equal([...u.matchAll(/vm\.addNrk87\(\)/g)].length, 2);
  assert.ok(!/LaunchedEffect[^\n]*\{[^\n]*(addNrk87|nrkHent87|nrkJobb87)/.test(u), 'ingen handling fra en effekt');
});

/* ======================= API og sikkerhet ======================= */

test('alle kall går via Api til /api/media/nrk (http-regelen open86 gjelder), og ingen adresse eller nøkkel til nrk-dl i appen', () => {
  const n = code('Nrk87.kt');
  const u = code('ui/Nrk87Ui.kt');
  for (const src of [n, u, code('NrkRegel87.kt')]) {
    assert.ok(!/openConnection|HttpURLConnection|OkHttpClient|Request\.Builder|java\.net\.URL\b/.test(src), 'ingen egen HTTP-klient');
    assert.ok(!/10\.69\.|:8020|NRK_DL_|nrk_token|Bearer/.test(src), 'ingen adresse/token til nrk-dl');
  }
  const stier = [...n.matchAll(/hl(Get|Post|Delete)\("([^"]+)/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual([...new Set(stier)].sort(), [
    'Delete /media/nrk/folger/$id', 'Delete /media/nrk/jobber/$id', 'Get /media/nrk$path',
    'Post /media/nrk/folger/$id/sjekk', 'Post /media/nrk/jobber', 'Post /media/nrk/jobber/$id/avbryt', 'Post /media/nrk/jobber/$id/igjen', 'Post /media/nrk/rydd',
  ].sort());
  for (const p of ['get87("/status")', 'get87("/jobber")', 'get87("/bibliotek"', 'get87("/serie?url=" + URLEncoder.encode(e.url, "UTF-8")']) assert.ok(n.includes(p), p);
  assert.match(code('Api.kt'), /private fun url\(|\.open86\(\)/, 'Api bruker open86()');
  // Plakater: bare vår egen bildeproxy (relativ sti).
  assert.match(raw('Nrk87.kt'), /o\.txt87\("bilde"\)\?\.takeIf \{ it\.startsWith\("\/"\) && !it\.startsWith\("\/\/"\) \}/);
  // Lenker som åpnes i nettleseren, er alltid validerte NRK-lenker.
  for (const m of u.matchAll(/uri\.openUri\((\w+)\)/g)) assert.ok(['lenke', 'l'].includes(m[1]), m[1]);
  assert.match(u, /val lenke = nrkLenke87\(j\.url\)/);
  assert.match(u, /nrkLenke87\(e\.url\)\?\.let \{ l ->/);
});

test('komprimer sendes bare når brukeren har endret den fra serverens standard, og boksen vises bare når serveren støtter det', () => {
  const n = code('Nrk87.kt');
  const k = body(n, 'private fun JSONObject.komp87(');
  assert.match(k, /val std = n\.status\?\.komp\?\.standard \?: return this/);
  assert.match(k, /val k = n\.komp \?: return this/);
  assert.match(k, /if \(k != std\) put\("komprimer", k\) else this/);
  assert.match(code('ui/Nrk87Ui.kt'), /st\?\.komp\?\.let \{ k ->\s*\n\s*val on = n\.komp \?: k\.standard/);
  assert.match(body(n, 'fun AppViewModel.addNrk87('), /\.put\("folg", n\.folg\)\.komp87\(n\)/);
});

test('tåler at felt mangler: eldre server (404), ikke satt opp, og nrk-dl uten bibliotek', () => {
  const n = code('Nrk87.kt');
  assert.match(body(n, 'private suspend fun AppViewModel.get87('), /if \(e\.status == 404\) \{ nrk87\.gammel = true; null \} else throw e/);
  assert.match(body(n, 'fun AppViewModel.loadNrkStatus87('), /if \(o\.optBoolean\("configured", true\)\)/);
  assert.match(body(n, 'fun AppViewModel.loadNrkLib87('), /if \(o\.has\("tilgjengelig"\) && !o\.optBoolean\("tilgjengelig", true\)\) \{ n\.libOk = false/);
  assert.match(body(n, 'fun AppViewModel.loadNrkLib87('), /\.distinctBy \{ it\.id \}/, 'like id-er gir ikke like nøkler i lista');
  assert.match(body(n, 'internal fun parseNrkStatus87('), /val k = o\.optJSONObject\("komprimer"\)/);
  assert.match(code('ui/Nrk87Ui.kt'), /n\.libOk == false -> "Biblioteket krever en nyere versjon av nrk-dl\."/);
  // Feiltekster fra serveren (502 med norsk tekst) vises som de er; 409 = allerede i køen.
  assert.match(body(n, 'fun AppViewModel.addNrk87('), /if \(e\.status == 409\) "Lenken ligger allerede i køen\."/);
});

test('oppdatering 2 s / 10 s som stopper når fanen ikke vises eller appen ligger i bakgrunnen, og ett kall om gangen', () => {
  const u = code('ui/Nrk87Ui.kt');
  const f = body(u, 'internal fun Nrk87(');
  assert.match(f, /val pause = nrkPause87\(n\.jobber\.orEmpty\(\)\.map \{ it\.status \}\)/);
  assert.match(f, /LaunchedEffect\(synlig, pause, s\.mediaOpen\) \{\s*\n\s*if \(synlig && s\.mediaOpen\) while \(true\) \{ delay\(pause\); vm\.tickNrk87\(\) \}/);
  assert.match(f, /Lifecycle\.Event\.ON_STOP\) synlig = false/);
  assert.match(code('NrkRegel87.kt'), /fun nrkPause87\(statuser: List<String>\): Long = if \(statuser\.any \{ it == "ko" \|\| it == "kjorer" \}\) 2000L else 10_000L/);
  const k = body(code('Nrk87.kt'), 'fun AppViewModel.loadNrkKo87(');
  assert.match(k, /if \(n\.henter\) return/);
  assert.match(k, /finally \{ n\.henter = false \}/);
  // Skjermen (og dermed løkka) finnes bare mens NRK-fanen er valgt.
  assert.match(code('ui/Media43.kt'), /when \(s\.tab\) \{[\s\S]*?"nrk" -> Nrk87\(vm, pad\)/);
});

test('bibliotek: rutenett, detalj med sesonger og episoder, og tilbake lukker detaljen først', () => {
  const u = code('ui/Nrk87Ui.kt');
  assert.match(u, /modifier\.aspectRatio\(2f \/ 3f\)/, 'plakat 2:3');
  assert.match(u, /\(\(inne \+ 12\.dp\) \/ \(150\.dp \+ 12\.dp\)\)\.toInt\(\)\.coerceIn\(2, 8\)/, 'minst 150 bred, minst to i bredden');
  assert.match(u, /"film" -> "FILM"; "radio" -> "RADIO"; else -> "\$\{e\.sesonger\.size\} S"/, 'merket på plakaten');
  assert.match(u, /"\$har av \$total episoder"/);
  const d = body(u, 'private fun LazyListScope.detalj87(');
  assert.match(d, /Knapp87\("Last ned \$\{mangler\.size\} som mangler", fylt = true\)/);
  assert.match(d, /else -> Knapp87\("Se etter nye", fylt = true\)/);
  assert.match(d, /if \(e\.type == "radio"\) "\$\{s\.nr\}" else "Sesong \$\{s\.nr\}"/, 'sesong-piller (år for podkast)');
  assert.match(body(u, 'private fun Episode87('), /if \(status == "mangler" && ep\?\.url != null && nrkLenke87\(ep\.url\) != null\) Knapp87\("Last ned"\)/);
  const h = body(code('Nrk87.kt'), 'fun AppViewModel.nrkHent87(');
  assert.match(h, /\.distinct\(\)\.take\(200\)/, 'maks 200 episoder per kall');
  assert.match(h, /if \(urls\.isNotEmpty\(\)\) body\.put\("episoder", JSONArray\(urls\)\)/);
  assert.match(code('P43.kt'), /s\.tab == "nrk" && nrk87\.valgt != null -> nrk87\.valgt = null/);
});

test('brukerskille: NRK-tilstanden (også lenken i feltet) tømmes ved kontobytte og utlogging', () => {
  assert.match(body(code('AppViewModel.kt'), 'private fun clearData('), /nrk87\.reset\(\)/);
  const r = body(code('Nrk87.kt'), 'fun reset(');
  for (const f of ['configured = null', 'jobber = null', 'folger = emptyList()', 'url = ""', 'lib = null', 'valgt = null', 'status = null']) assert.ok(r.includes(f), f);
});
