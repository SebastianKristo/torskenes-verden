// Prompt 88 (AND88): NRK-søk, serieside og plakater på «Serier du følger», og ny Musikk-fane (yubal) i Media i Homelab-appen for Android.
//  - NRK: kortet «NRK» øverst med søk (GET /api/media/nrk/sok), Kvalitet/Komprimer og VPN-merke; treff med 16:9-bilde og merke;
//    film/episode/radio → «Last ned» (trykk) → køen; serie → serieside (GET /serie/:sid, /serie/:sid/sesong/:navn) med avkrysning,
//    «Velg alle tilgjengelige (N)», «Følg serien», «Last ned N episoder». Lenkefeltet er sekundært («Har du en lenke?»).
//  - Musikk: Last ned musikk (forhåndsvisning) → Køen → Spillelister du følger (sangene), alt via /api/media/yubal/*.
// Kildesjekker + fasit for de rene reglene (NrkRegel88.kt). Den ekte Kotlin-fila kompileres og kjøres mot fasiten når Gradles
// Kotlin-kompilator finnes på maskinen (ellers hoppes den testen over), som i test/p87-and.test.js.
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
/** Kroppen til en funksjon (fra signaturen til neste funksjon på toppnivå). */
function body(src, sig) {
  const i = src.indexOf(sig);
  assert.ok(i >= 0, `fant ikke ${sig}`);
  const rest = src.slice(i + sig.length);
  const j = rest.search(/\n(?:@Composable\n)?(?:private |internal )?(?:suspend )?fun /);
  return rest.slice(0, j < 0 ? rest.length : j);
}

/* ======================= Fasit for de rene reglene ======================= */

const YT_GODTAS = [
  ['https://music.youtube.com/playlist?list=PL123', 'https://music.youtube.com/playlist?list=PL123'],
  ['http://www.youtube.com/watch?v=abc', 'https://www.youtube.com/watch?v=abc'],
  ['music.youtube.com/browse/MPREb_x', 'https://music.youtube.com/browse/MPREb_x'],
  ['  https://youtu.be/abc  ', 'https://youtu.be/abc'],
  ['https://m.youtube.com/watch?v=x', 'https://m.youtube.com/watch?v=x'],
];
const YT_AVVISES = ['', 'https://youtube.com', 'https://evil.com/music.youtube.com/x', 'https://music.youtube.com.evil.com/x', 'https://bruker@music.youtube.com/x',
  'https://music.youtube.com:8443/x', 'ftp://youtube.com/x', 'https://music.youtube.com/a b', 'https://gaming.youtube.com/x', 'javascript://youtube.com/x'];

test('den ekte NrkRegel88.kt kjørt mot fasiten (kotlinc fra Gradle)', (t) => {
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
  const dir = mkdtempSync(join(tmpdir(), 'p88-and-'));
  try {
    const q = (s) => (s === null ? 'null' : JSON.stringify(s).replace(/\$/g, '\\$'));
    const par = (a) => 'listOf(' + a.map(([x, y]) => `${q(x)} to ${q(y)}`).join(', ') + ')';
    // 2026-11-13 12:00 i Oslo (UTC+1) = 11:00 UTC.
    const now = Date.UTC(2026, 10, 13, 11, 0, 0);
    writeFileSync(join(dir, 'Fasit.kt'), `import no.kristo.finanshub.*
var feil = 0
fun <T> lik(hva: String, fikk: T, ventet: T) { if (fikk != ventet) { println("FEIL " + hva + ": fikk «" + fikk + "», ventet «" + ventet + "»"); feil++ } }
fun main() {
    // NRK: serie-id, dato, sesonger og episoder
    lik("sid", nrkSerieId88("https://tv.nrk.no/serie/exit"), "exit"); lik("sid ep", nrkSerieId88("https://tv.nrk.no/serie/Skam/sesong/1/episode/2"), "skam")
    lik("sid radio", nrkSerieId88("https://radio.nrk.no/podkast/abels_taarn"), null); lik("sid program", nrkSerieId88("https://tv.nrk.no/program/KMTE50001219"), null)
    lik("sid ond", nrkSerieId88("https://tv.nrk.no.evil.com/serie/exit"), null); lik("sid null", nrkSerieId88(null), null); lik("sid http", nrkSerieId88("http://tv.nrk.no/serie/exit"), null)
    lik("ses ok", nrkSesongOk88("2026"), true); lik("ses ond", nrkSesongOk88("../x"), false); lik("ses tom", nrkSesongOk88(""), false)
    lik("dato", nrkDato88("2026-01-05"), "5. jan. 2026"); lik("dato iso", nrkDato88("2025-12-24T20:00:00Z"), "24. des. 2025"); lik("dato tekst", nrkDato88("I går"), "I går"); lik("dato null", nrkDato88(null), "")
    lik("sesnavn år", nrkSesNavn88("2026", "Sesong 2026"), "2026"); lik("sesnavn tittel", nrkSesNavn88("3", "Sesong 3"), "Sesong 3"); lik("sesnavn uten", nrkSesNavn88("3", null), "Sesong 3")
    val ss = listOf("1" to true, "2" to false, "3" to true, "4" to false)
    lik("sesong nyeste", nrkSesong88(ss, null), "3"); lik("sesong valgt", nrkSesong88(ss, "1"), "1"); lik("sesong tom valgt", nrkSesong88(ss, "2"), "3")
    lik("sesong ingen", nrkSesong88(listOf("1" to false), null), null); lik("sesong tom liste", nrkSesong88(emptyList(), "1"), null)
    lik("kan", nrkKanVelges88(true, false, false), true); lik("kan ikke", nrkKanVelges88(false, false, false), false)
    lik("kan lastet", nrkKanVelges88(true, true, false), false); lik("kan iko", nrkKanVelges88(true, false, true), false)
    lik("merke label", nrkEpMerke88(false, "Tilgjengelig fra 1. des.", false, false), "Tilgjengelig fra 1. des." to "mut")
    lik("merke ikke", nrkEpMerke88(false, null, false, false), "Ikke tilgjengelig" to "mut"); lik("merke lastet", nrkEpMerke88(true, null, true, true), "Lastet ned" to "ok")
    lik("merke ko", nrkEpMerke88(true, null, false, true), "I kø" to "dl"); lik("merke ingen", nrkEpMerke88(true, "x", false, false), null)
    lik("hent 1", nrkHentTekst88(1), "Last ned 1 episode"); lik("hent 0", nrkHentTekst88(0), "Last ned 0 episoder"); lik("hent 3", nrkHentTekst88(3), "Last ned 3 episoder")
    lik("velg alle", nrkVelgAlle88(1, 4), "Velg alle tilgjengelige (4)"); lik("velg fjern", nrkVelgAlle88(4, 4), "Fjern valg"); lik("velg 0", nrkVelgAlle88(0, 0), "Velg alle tilgjengelige (0)")
    lik("kat", nrkKat88("Drama", 3), "DRAMA · 3 SESONGER"); lik("kat 1", nrkKat88(null, 1), "1 SESONG"); lik("kat tom", nrkKat88(" ", 0), "")
    lik("art", nrkArtMerke88("serie"), "SERIE"); lik("art ep", nrkArtMerke88("episode"), "EPISODE"); lik("art x", nrkArtMerke88("x"), "NRK")
    lik("type film", nrkTreffType88("film"), "film"); lik("type radio", nrkTreffType88("radio"), "radio"); lik("type ep", nrkTreffType88("episode"), "auto")
    lik("sum gammel", nrkSokSum88(false, false, "", 0), "Søket krever en nyere versjon av nrk-dl. Bruk lenkefeltet under.")
    lik("sum søker", nrkSokSum88(true, true, "exit", 0), "Søker …"); lik("sum treff", nrkSokSum88(true, false, "exit", 2), "2 treff")
    lik("sum start", nrkSokSum88(true, false, "", 0), "Søk etter serier, filmer og podkaster.")
    lik("jobbtittel", nrkJobbTittel88("Exit", "3", "Sesong 3"), "Exit · sesong 3"); lik("jobbtittel år", nrkJobbTittel88("Abels tårn", "2026", null), "Abels tårn · 2026")

    // Musikk: lenker
    for ((inn, ut) in ${par(YT_GODTAS)}) lik("yt " + inn, ytLenke88(inn), ut)
    for (u in listOf(${YT_AVVISES.map(q).join(', ')})) lik("yt avvis " + u, ytLenke88(u), null)
    lik("ytdelt", ytDelt88("Hør på dette: https://music.youtube.com/playlist?list=PL1."), "https://music.youtube.com/playlist?list=PL1")
    lik("ytdelt ond", ytDelt88("https://evilyoutube.com/x"), null); lik("ytdelt ingen", ytDelt88("Tannlege kl. 10"), null)

    // Musikk: køen
    lik("ferdig", muFerdig88("completed"), true); lik("ferdig feil", muFerdig88("failed"), true); lik("ferdig ikke", muFerdig88("importing"), false)
    lik("chip venter", muChip88("pending"), "VENTER" to "mut"); lik("chip info", muChip88("fetching_info"), "HENTER INFO" to "dl"); lik("chip dl", muChip88("downloading"), "LASTER NED" to "dl")
    lik("chip imp", muChip88("importing"), "IMPORTERER" to "pu"); lik("chip ok", muChip88("completed"), "FERDIG" to "ok"); lik("chip feil", muChip88("failed"), "FEILET" to "err")
    lik("chip avbrutt", muChip88("cancelled"), "AVBRUTT" to "mut"); lik("chip ukjent", muChip88("x"), "VENTER" to "mut")
    lik("tall", muTall88("completed", 14, 12, 1, 3), "12 lastet ned · 1 feilet · 3 hoppet over"); lik("tall 0", muTall88("downloading", null, 0, 0, 0), "0 lastet ned")
    lik("tall venter", muTall88("pending", 14, 0, 0, 0), "14 spor"); lik("tall venter 1", muTall88("pending", 1, 0, 0, 0), "1 spor"); lik("tall venter uten", muTall88("pending", null, 0, 0, 0), "Venter på tur")
    lik("linje", muLinje88("downloading"), true); lik("linje venter", muLinje88("pending"), false); lik("linje ferdig", muLinje88("completed"), false)
    lik("pause aktiv", muPause88(listOf("completed", "pending")), 2000L); lik("pause rolig", muPause88(listOf("completed", "failed", "cancelled")), 10000L); lik("pause tom", muPause88(emptyList()), 10000L)

    // Musikk: forhåndsvisning
    lik("kilde", muKilde88("opus", 128), "Kilde: opus · 128 kbps"); lik("kilde kodek", muKilde88("opus", null), "Kilde: opus"); lik("kilde ingen", muKilde88(null, 0), null)
    lik("meta", muMeta88("Kygo", 2024, 12), "Kygo · 2024 · 12 spor"); lik("meta tom", muMeta88(null, null, null), "")
    lik("kind", muKind88("album"), "ALBUM"); lik("kind sang", muKind88("track"), "SANG"); lik("kind liste", muKind88("playlist"), "SPILLELISTE")
    lik("max", muMax88("50"), 50); lik("max 0", muMax88("0"), 1); lik("max stor", muMax88("99999"), 10000); lik("max tull", muMax88("abc"), 1); lik("max tom", muMax88(""), 1)

    // Musikk: spillelister
    val n = ${now}L
    lik("siden", muSiden88(n - 12 * 60_000L, n), "12 min siden"); lik("siden nå", muSiden88(n - 5_000L, n), "nå nettopp"); lik("siden t", muSiden88(n - 3 * 3_600_000L, n), "3 t siden")
    lik("siden d", muSiden88(n - 2 * 86_400_000L, n), "2 d siden"); lik("siden null", muSiden88(null, n), null)
    lik("subsub", muSubSub88(n - 3 * 3_600_000L, 50, n), "Synket 3 t siden · de første 50"); lik("subsub aldri", muSubSub88(null, null, n), "Ikke synket ennå")
    lik("mmss", muMmss88(187), "3:07"); lik("mmss 0", muMmss88(0), ""); lik("mmss null", muMmss88(null), "")
    lik("spor ok", muSporChip88("downloaded"), "LASTET NED" to "ok"); lik("spor skip", muSporChip88("skipped"), "FINNES ALT" to "mut")
    lik("spor feil", muSporChip88("failed"), "FEILET" to "err"); lik("spor venter", muSporChip88("pending"), "IKKE SYNKET" to "mut"); lik("spor ukjent", muSporChip88(null), null)
    lik("sporsum", muSporSum88(listOf("downloaded", "downloaded", "skipped", "failed", "pending")), "5 sanger · 2 lastet ned · 1 fantes fra før · 1 feilet · 1 ikke synket")
    lik("synksum", muSynkSum88(14, true, 11, 1, 2, 2), "14 sanger · 11 lastet ned · 2 fantes fra før · 1 feilet")
    lik("synksum hoppet", muSynkSum88(null, true, 3, 0, 4, 1), "3 lastet ned · 1 fantes fra før · 3 hoppet over"); lik("synksum aldri", muSynkSum88(1, false, 0, 0, 0, 0), "1 sang · Ikke synket ennå")
    val oslo = java.util.TimeZone.getTimeZone("Europe/Oslo")
    lik("når i dag", muNar88(n + 3 * 3_600_000L, n, oslo), "i dag kl. 15:00"); lik("når i morgen", muNar88(n + 15 * 3_600_000L, n, oslo), "i morgen kl. 03:00")
    lik("når senere", muNar88(n + 2 * 86_400_000L, n, oslo), "søn. 15. nov. kl. 12:00")
    lik("plan", muPlan88(true, "i dag kl. 03:00", 2, 3), "Neste automatiske sjekk: i dag kl. 03:00 · 2 av 3 på"); lik("plan av", muPlan88(false, null, 0, 1), "Automatisk synk er slått av i yubal")
    lik("plan ukjent", muPlan88(true, null, 0, 0), "Neste automatiske sjekk: ukjent · 0 av 0 på")
    println(if (feil == 0) "FASIT OK" else "FASIT FEIL: " + feil)
}
`);
    const env = { ...process.env };
    delete env.JAVA_TOOL_OPTIONS;
    const opt = { encoding: 'utf8', env, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] };
    const kc = spawnSync('java', ['-cp', cp, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-nowarn', '-cp', stdlib, '-d', join(dir, 'out'), join(SRC, 'NrkRegel88.kt'), join(dir, 'Fasit.kt')], opt);
    if (kc.status !== 0) {
      const log = String(kc.stdout ?? '') + String(kc.stderr ?? '');
      if (/(NrkRegel88|Fasit)\.kt:\d+:\d+: error:/.test(log)) assert.fail(log.slice(0, 3000));
      return t.skip('Kotlin-kompilatoren fra Gradle lot seg ikke kjøre her');
    }
    const out = execFileSync('java', ['-cp', [join(dir, 'out'), stdlib].join(':'), 'FasitKt'], opt);
    assert.match(out, /FASIT OK/, out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('regelfila er ren Kotlin (ingen Android-typer), og YouTube-regelen er serverens liste', () => {
  const r = raw('NrkRegel88.kt');
  assert.ok(!/^import\s+(android|androidx|org\.json)/m.test(r), 'ingen Android-/JSON-import i regelfila');
  assert.ok(r.includes('(music\\\\.youtube\\\\.com|youtube\\\\.com|www\\\\.youtube\\\\.com|m\\\\.youtube\\\\.com|youtu\\\\.be)'), 'samme verter som server/yubal.js');
  const srv = readFileSync(join(ROOT, 'server/yubal.js'), 'utf8');
  assert.match(srv, /new Set\(\['music\.youtube\.com', 'youtube\.com', 'www\.youtube\.com', 'm\.youtube\.com', 'youtu\.be'\]\)/);
});

/* ======================= Fanene ======================= */

test('Musikk er egen fane etter NRK, med farge, lasting, lenke (finanshub://media/musikk) og brukerskille', () => {
  const m = code('ui/Media43.kt');
  assert.match(m, /"nrk" to "NRK", "musikk" to "Musikk", "spill" to "Avspilling"\)/);
  assert.match(m, /"musikk" -> Musikk88\(vm, pad\)/);
  assert.match(m, /if \(s\.tab != "nrk" && s\.tab != "musikk"\) \{/, 'servervalget for Sonarr/Radarr vises ikke');
  assert.match(code('ui/Media45.kt'), /"musikk" to 0xFF[0-9A-F]{6}/);
  assert.match(code('P43.kt'), /"musikk" -> loadMusikk88\(\)/);
  const a = code('AppViewModel.kt');
  assert.match(a, /setOf\("snart", "sonarr", "radarr", "qbit", "prowlarr", "nrk", "musikk"\)/);
  assert.match(a, /val musikk88 = Musikk88State\(\)/);
  assert.match(body(a, 'private fun clearData('), /musikk88\.reset\(\)/);
  const r = body(code('Musikk88.kt'), 'fun reset(');
  for (const f of ['configured = null', 'jobs = null', 'subs = null', 'url = ""', 'pv = null', 'open = null', 'spor = emptyMap()']) assert.ok(r.includes(f), f);
  assert.match(body(code('Nrk87.kt'), 'fun reset('), /sok\.reset\(\)/, 'søket og seriesiden tømmes også');
  for (const f of ['q = ""', 'treff = null', 'ser = null', 'pick = emptySet()', 'opt = emptyMap()']) assert.ok(body(code('Nrk88.kt'), 'fun reset(').includes(f), f);
});

/* ======================= NRK: kortet, søket og seriesiden ======================= */

test('NRK-kortet ligger øverst: søk, Kvalitet/Komprimer og VPN; «Har du en lenke?» er sekundært under', () => {
  const u = code('ui/Nrk87Ui.kt');
  const liste = body(u, 'internal fun Nrk87(');
  const rekke = ['nrkKort88(vm,', 'item("ny") { LastNed87(vm) }', 'item("ko") { Ko87(vm) }', 'item("folg") { Folger87(vm) }', 'bibliotek87(vm, cols)'].map((x) => liste.indexOf(x));
  assert.ok(rekke.every((i) => i >= 0), 'alle kortene');
  assert.deepEqual([...rekke].sort((a, b) => a - b), rekke, 'NRK → lenke → Køen → Serier → Bibliotek');
  const k = code('ui/Nrk88Ui.kt');
  const topp = body(k, 'private fun Topp88(');
  assert.match(topp, /PSerif\("NRK"/);
  assert.match(topp, /n\.status\?\.let \{ Vpn87\(it\) \}/);
  assert.match(topp, /KvalKomp87\(vm\)/);
  assert.match(topp, /"Søk i NRK TV og NRK Radio"/);
  assert.match(topp, /imeAction = ImeAction\.Search/);
  assert.match(topp, /onClickLabel = "Tøm søk"/);
  const kk = body(u, 'internal fun KvalKomp87(');
  for (const t of ['"Beste"', '"1080p"', '"720p"', '"540p"', 'Komprimer (H.265, ca. halv størrelse)']) assert.ok(kk.includes(t), t);
  assert.match(kk, /val on = n\.komp \?: k\.standard/, 'starter på serverens standard');
  const l = body(u, 'private fun LastNed87(');
  assert.match(l, /"Har du en lenke\?"/);
  assert.match(l, /val apen = n\.sok\.lenkeApen \|\| !n\.sokMulig88\(\)/, 'åpen når søket ikke finnes');
  assert.match(code('Nrk88.kt'), /fun Nrk87State\.sokMulig88\(\): Boolean = sok\.mulig && status\?\.bibliotek != false/);
  assert.match(body(code('Nrk87.kt'), 'fun AppViewModel.shareNrk87('), /n\.sok\.lenkeApen = true/, 'delingsmottaket åpner lenkefeltet');
  // Søket kjøres 350 ms etter siste tastetrykk (bare GET).
  assert.match(liste, /LaunchedEffect\(n\.sok\.q\) \{ if \(n\.sok\.q\.trim\(\) != n\.sok\.sokQ\) \{ delay\(350\); vm\.nrkSok88\(\) \} \}/);
});

test('treff: 16:9-bilde med merke; serie åpner seriesiden, alt annet har «Last ned» som krever trykk', () => {
  const k = code('ui/Nrk88Ui.kt');
  const t = body(k, 'private fun Treff88(');
  assert.match(t, /\.aspectRatio\(16f \/ 9f\)/);
  assert.match(t, /Merke88\(nrkArtMerke88\(t\.art\)/);
  assert.match(t, /val sid = if \(t\.art == "serie"\) nrkSerieId88\(t\.url\) else null/);
  assert.match(t, /vm\.apneSerie88\(sid, t\.tittel\)/);
  assert.match(t, /if \(sid == null\) Knapp87\(if \(iKo\) "I køen" else "Last ned", fylt = !iKo, enabled = t\.tilgjengelig && !iKo && !n\.sok\.lbusy\) \{ vm\.nrkTreffLastNed88\(t\) \}/);
  assert.equal([...k.matchAll(/nrkTreffLastNed88\(/g)].length, 1, 'bare fra knappen');
  assert.match(k, /items\(rader\.size, key = \{ "nrk-tr-" \+ rader\[it\]\.first\(\)\.url \}\)/, 'nøkler i lista');
  assert.match(code('Nrk88.kt'), /\.distinctBy \{ it\.url \}/, 'like lenker gir ikke like nøkler');
});

test('seriesiden: bilde, tittel, beskrivelse, sesonger (tomme dempet), avkrysning og merker, og fast bunnlinje', () => {
  const k = code('ui/Nrk88Ui.kt');
  const s = body(k, 'private fun LazyListScope.serie88(');
  assert.match(s, /NettBilde88\(vm, x\?\.bilde/);
  assert.match(s, /x\.beskrivelse\?\.let/);
  assert.match(s, /Pille88\(nrkSesNavn88\(z\.navn, z\.tittel\), z\.navn == navn, z\.tilgjengelig\)/);
  assert.match(s, /items\(liste\.size, key = \{ "ser-ep-\$sid-\$navn-" \+ liste\[it\]\.id \}\)/);
  for (const x of ['Henter serien fra NRK …', 'Ingen episoder tilgjengelig hos NRK akkurat nå.', 'Henter episodene …', 'Ingen episoder i denne sesongen.', 'Prøv igjen']) assert.ok(s.includes(x), x);
  const e = body(k, 'private fun Ep88(');
  assert.match(e, /val ok = nrkKanVelges88\(e\.kan, e\.lastetNed, iKo\)/);
  assert.match(e, /toggleable\(value = on, enabled = ok, role = Role\.Checkbox\)/, 'kan=false / lastet ned / i kø kan ikke velges');
  assert.match(e, /nrkEpMerke88\(e\.kan, e\.label, e\.lastetNed, iKo\)/);
  assert.match(e, /nrkDato88\(e\.dato\), e\.varighet/);
  const b = body(k, 'internal fun SerieBunn88(');
  assert.match(b, /nrkVelgAlle88\(valgte, ok\.size\)/);
  assert.match(b, /if \(folger\) "✓ Følger serien" else "Følg serien"/);
  assert.match(b, /nrkHentTekst88\(valgte\)/);
  assert.match(b, /enabled = valgte > 0 && !s\.lbusy\) \{ vm\.nrkHentValgte88\(\) \}/);
  assert.ok(b.includes('Følg serien laster ned nye episoder fremover (de to nyeste sesongene), ikke hele arkivet.'));
  const u = code('ui/Nrk87Ui.kt');
  assert.match(u, /if \(n\.sok\.ser != null && n\.configured != false && !n\.gammel\) SerieBunn88\(vm, Modifier\.align\(Alignment\.BottomCenter\)\)/);
  assert.match(u, /if \(n\.sok\.ser != null\) item\("ser-luft"\)/, 'luft under lista så bunnlinja ikke skjuler siste episode');
  // Tilbake lukker seriesiden før den lukker Media.
  const p = body(code('P43.kt'), 'fun AppViewModel.closeMedia43(');
  assert.ok(p.indexOf('nrk87.sok.ser != null') >= 0 && p.indexOf('nrk87.sok.ser != null') < p.indexOf('else -> s.mediaOpen = false'));
});

test('en serie i Bibliotek åpner den nye seriesiden', () => {
  const r = body(code('ui/Nrk87Ui.kt'), 'private fun Rute87(');
  assert.match(r, /val sid = if \(e\.type == "tv" && vm\.nrk87\.sokMulig88\(\)\) nrkSerieId88\(e\.url\) else null/);
  assert.match(r, /if \(sid != null\) vm\.apneSerie88\(sid, e\.tittel\) else vm\.openNrkElem87\(e\)/);
});

test('«Serier du følger»: plakat 48×72, radio 72×72, reserveflate med tittelen, bilde bare fra bildeproxyen', () => {
  const k = code('ui/Nrk88Ui.kt');
  assert.match(body(k, 'internal fun FolgPlakat88('), /Modifier\.size\(if \(f\.radio\) 72\.dp else 48\.dp, 72\.dp\)\.clip\(RoundedCornerShape\(8\.dp\)\)/);
  assert.match(body(k, 'private fun Flate88('), /background\(flate87\(tittel\)\)[\s\S]*fontFamily = PaperFonts\.serif/);
  assert.match(body(code('ui/Nrk87Ui.kt'), 'private fun Folger87('), /FolgPlakat88\(vm, f\)/);
  assert.match(code('Nrk87.kt'), /egetBilde88\(o\.txt87\("bilde"\)\), o\.bool87\("radio"\) == true/);
  assert.match(raw('Nrk88.kt'), /internal fun egetBilde88\(v: String\?\): String\? = v\?\.takeIf \{ it\.startsWith\("\/api\/"\) && !it\.startsWith\("\/\/"\) \}/);
  // Bildene hentes med samme innlogging som andre Media-bilder (Img50 + token), mot valgt server.
  assert.match(body(k, 'internal fun NettBilde88('), /Img50\.load\(ctx, vm\.base, vm\.account\?\.token, url, px\)/);
});

test('NRK: søk, serie og sesong er bare GET; jobb og følg krever trykk', () => {
  const n = code('Nrk88.kt');
  for (const f of ['fun AppViewModel.nrkSok88(', 'fun AppViewModel.apneSerie88(', 'fun AppViewModel.loadSerie88(', 'fun AppViewModel.loadSes88(', 'fun AppViewModel.velgSesong88(', 'fun AppViewModel.nrkSerieOppdater88(', 'fun AppViewModel.nrkVelg88(', 'fun AppViewModel.nrkVelgAlle88('])
    assert.ok(!/hlPost|hlDelete|hlPut|request\(/.test(body(n, f)), f);
  const stier = [...n.matchAll(/hl(Get|Post|Delete)\("([^"]+)/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual([...new Set(stier)].sort(), ['Delete /media/nrk/folger/${f.id}', 'Get /media/nrk$path', 'Post /media/nrk/folger', 'Post /media/nrk/jobber'].sort());
  assert.match(body(n, 'fun AppViewModel.nrkTreffLastNed88('), /hlPost\("\/media\/nrk\/jobber"/);
  const h = body(n, 'fun AppViewModel.nrkHentValgte88(');
  assert.match(h, /\.take\(200\)/, 'høyst 200 episoder');
  assert.match(h, /\.put\("episoder", JSONArray\(valgte\.map \{ it\.url \}\)\)\.komp88\(n\)/);
  assert.match(body(n, 'fun AppViewModel.nrkFolgSerie88('), /hlPost\("\/media\/nrk\/folger", JSONObject\(\)\.put\("url", x\.url\)\.put\("type", "tv"\)/);
  for (const p of ['get88("/sok?q=" + URLEncoder.encode(q, "UTF-8"))', 'get88("/serie/" + URLEncoder.encode(sid, "UTF-8"))', '"/sesong/" + URLEncoder.encode(navn, "UTF-8")']) assert.ok(n.includes(p), p);
  const k = code('ui/Nrk88Ui.kt');
  assert.ok(!/LaunchedEffect[^\n]*\{[^\n]*(nrkTreffLastNed88|nrkHentValgte88|nrkFolgSerie88)/.test(k + code('ui/Nrk87Ui.kt')), 'ingen handling fra en effekt');
  assert.equal([...k.matchAll(/vm\.nrkHentValgte88\(\)/g)].length, 1);
  assert.equal([...k.matchAll(/vm\.nrkFolgSerie88\(\)/g)].length, 1);
});

/* ======================= Musikk ======================= */

test('Musikk: én kolonne Last ned musikk → Køen → Spillelister du følger, med tomtilstand', () => {
  const u = code('ui/Musikk88Ui.kt');
  const f = body(u, 'internal fun Musikk88(');
  const rekke = ['item("mu-ny") { MuLastNed88(vm) }', 'item("mu-ko") { MuKo88(vm) }', 'item("mu-subs") { MuSubs88(vm) }'].map((x) => f.indexOf(x));
  assert.ok(rekke.every((i) => i >= 0));
  assert.deepEqual([...rekke].sort((a, b) => a - b), rekke);
  assert.match(f, /m\.configured == false -> item\("mu-tom"\) \{ MuTom88\(vm\) \}/);
  for (const t of ['Musikk er ikke satt opp', 'Åpne Integrasjoner', 'Last ned musikk', 'Album, spilleliste eller sang fra music.youtube.com', 'Lim inn', 'Forhåndsvis',
    'Alle spor', 'Bare de første', 'Følg spillelisten (nye sanger lastes ned automatisk)', 'Følg og last ned', 'i musikkbiblioteket (Navidrome)', 'Køen', 'Fjern ferdige',
    'Ingenting i køen.', 'Automatisk', 'Manuell', 'Avbryt', 'Fjern', 'Spillelister du følger', 'Synk alle', 'Synk nå', 'Slutt å følge', 'Du følger ingen spillelister.',
    'Sanglista er ikke tilgjengelig fra yubal', 'Henter sangene …']) assert.ok(u.includes(t), t);
});

test('Musikk: forhåndsvisning viser omslag, tittel, artist, år, type, antall spor og kildekvalitet; «Følg» bare for spillelister', () => {
  const u = code('ui/Musikk88Ui.kt');
  const p = body(u, 'private fun Forhandsvisning88(');
  assert.match(p, /Omslag88\(vm, pv\.thumbnail, pv\.title/);
  assert.match(p, /muKind88\(pv\.kind\)/);
  assert.match(p, /muMeta88\(pv\.artist, pv\.year, pv\.trackCount\)/);
  assert.match(p, /muKilde88\(pv\.codec, pv\.bitrate\)/);
  assert.match(p, /val liste = pv\.kind == "playlist"/);
  assert.match(p, /if \(liste\) Row\(/);
  assert.match(p, /"Lagres som \$\{m\.format\} i musikkbiblioteket \(Navidrome\)"/);
  assert.match(p, /Btn43\([^\n]*\{ vm\.muStart88\(\) \}/);
  const n = code('Musikk88.kt');
  const s = body(n, 'fun AppViewModel.muStart88(');
  assert.match(s, /val max = if \(p\.kind != "track" && m\.typ == "max"\) muMax88\(m\.maxN\) else null/);
  assert.match(s, /if \(p\.kind == "playlist" && m\.folg\) \{/);
  assert.match(s, /hlPost\("\/media\/yubal\/subscriptions", body\)/);
  assert.match(s, /hlPost\("\/media\/yubal\/subscriptions\/\$\{id\.lowercase\(\)\}\/sync"\)/, 'første synk med en gang');
  assert.match(s, /hlPost\("\/media\/yubal\/jobs", body\)/);
  assert.match(body(n, 'fun AppViewModel.muForhandsvis88('), /muGet88\("\/info\?url=" \+ URLEncoder\.encode\(u, "UTF-8"\)/);
  // «Lim inn» fyller bare feltet.
  const l = body(u, 'private fun MuLastNed88(');
  const lim = l.slice(l.indexOf('onClickLabel = "Lim inn lenke"'), l.indexOf('Text("Lim inn"'));
  assert.match(lim, /m\.url = ytDelt88\(tekst\) \?: tekst\.take\(2000\)/);
  assert.ok(!/muStart88|muForhandsvis88|hlPost/.test(lim), 'innliming starter ingenting');
});

test('Musikk: køen og spillelistene (status, fremdrift, tall, kilde, av/på, synk, sanger – én åpen om gangen)', () => {
  const u = code('ui/Musikk88Ui.kt');
  const j = body(u, 'private fun MuJobb88(');
  for (const x of ['muChip88(j.status)', 'muLinje88(j.status)', 'muTall88(j.status, j.info?.trackCount, j.ok, j.feilet, j.hoppet)', 'if (j.source == "scheduler") "Automatisk" else "Manuell"', 'vm.muHandling88("fjern", j.id)', 'vm.muHandling88("avbryt", j.id)'])
    assert.ok(j.includes(x), x);
  assert.match(body(u, 'private fun MuKo88('), /forEachIndexed \{ i, j -> key\(j\.id\)/);
  const s = body(u, 'private fun MuSubs88(');
  assert.match(s, /muPlan88\(paa, m\.planNeste\?\.let \{ muNar88\(it, now, java\.util\.TimeZone\.getDefault\(\)\) \}/);
  assert.match(s, /key\(x\.id\)/);
  const r = body(u, 'private fun MuRad88(');
  assert.match(r, /vm\.muApne88\(x\.id\)/);
  assert.match(r, /Modifier\.rotate\(if \(apen\) 90f else 0f\)/);
  assert.match(r, /Bryter88\(x\.enabled/);
  const sp = body(u, 'private fun Spor88(');
  assert.match(sp, /heightIn\(max = 420\.dp\)/);
  assert.match(sp, /items\(d\.tracks\.size, key = \{ "t\$it" \}\)/);
  assert.match(sp, /muSporChip88\(t\.status\)/);
  const n = code('Musikk88.kt');
  assert.match(body(n, 'fun AppViewModel.muApne88('), /m\.open = if \(m\.open == id\) null else id/, 'én åpen om gangen');
  assert.match(body(n, 'fun AppViewModel.loadMuSpor88('), /System\.currentTimeMillis\(\) - c\.at < 60_000L/, 'huskes i 60 s');
});

test('Musikk: alle kall via Api til /api/media/yubal, id-er sjekkes, og handlinger bare fra trykk', () => {
  const n = code('Musikk88.kt');
  const stier = [...n.matchAll(/(hlGet|hlPost|hlDelete|request\("PATCH", |muGet88)\(?"([^"]+)/g)].map((m) => `${m[1].replace(/\($/, '').trim()} ${m[2]}`);
  assert.deepEqual([...new Set(stier)].sort(), [
    'hlDelete /media/yubal/jobs', 'hlDelete /media/yubal/jobs/$i', 'hlDelete /media/yubal/subscriptions/$i', 'hlGet /media/yubal$path',
    'hlPost /media/yubal/jobs', 'hlPost /media/yubal/jobs/$i/cancel', 'hlPost /media/yubal/subscriptions', 'hlPost /media/yubal/subscriptions/${id.lowercase()}/sync',
    'hlPost /media/yubal/subscriptions/$i/sync', 'hlPost /media/yubal/subscriptions/sync', 'muGet88 /info?url=', 'muGet88 /jobs', 'muGet88 /status', 'muGet88 /subscriptions',
    'muGet88 /subscriptions/$id/tracks', 'request("PATCH", /media/yubal/subscriptions/$i',
  ].sort());
  assert.match(body(n, 'fun AppViewModel.muHandling88('), /if \(handling != "rydd" && handling != "synkalle" && \(id == null \|\| !UUID88\.matches\(id\)\)\) return/);
  for (const f of ['fun AppViewModel.loadMusikk88(', 'fun AppViewModel.muForhandsvis88(', 'fun AppViewModel.loadMuSpor88(', 'fun AppViewModel.muApne88('])
    assert.ok(!/hlPost|hlDelete|hlPut|request\(/.test(body(n, f)), f);
  const u = code('ui/Musikk88Ui.kt');
  assert.ok(!/LaunchedEffect[^\n]*\{[^\n]*(muStart88|muHandling88)/.test(u), 'ingen handling fra en effekt');
  assert.equal([...u.matchAll(/vm\.muStart88\(\)/g)].length, 1, 'bare «Last ned»-knappen');
  for (const src of [n, u, code('Nrk88.kt'), code('ui/Nrk88Ui.kt'), code('NrkRegel88.kt')]) {
    assert.ok(!/openConnection|HttpURLConnection|OkHttpClient|Request\.Builder|java\.net\.URL\b/.test(src), 'ingen egen HTTP-klient');
    assert.ok(!/10\.69\.|:8010|:8020|YUBAL_URL|NRK_DL_|yubal_url|nrk_token|Bearer/.test(src), 'ingen adresse/token til tjenestene');
  }
  assert.match(code('Musikk88.kt'), /egetBilde88\(o\.s88\("thumbnail"\)\)/, 'omslag bare fra bildeproxyen');
});

test('Musikk: oppdatering 2 s / 10 s som stopper når fanen ikke vises eller appen er i bakgrunnen, og ett kall om gangen', () => {
  const f = body(code('ui/Musikk88Ui.kt'), 'internal fun Musikk88(');
  assert.match(f, /val pause = muPause88\(m\.jobs\.orEmpty\(\)\.map \{ it\.status \}\)/);
  assert.match(f, /LaunchedEffect\(synlig, pause, s\.mediaOpen\) \{\s*\n\s*if \(synlig && s\.mediaOpen\) while \(true\) \{ delay\(pause\); vm\.tickMusikk88\(\) \}/);
  assert.match(f, /Lifecycle\.Event\.ON_STOP\) synlig = false/);
  const l = body(code('Musikk88.kt'), 'fun AppViewModel.loadMusikk88(');
  assert.match(l, /if \(m\.henter\) return/);
  assert.match(l, /finally \{ m\.henter = false \}/);
  assert.match(l, /System\.currentTimeMillis\(\) - m\.stAt > 60_000L/, 'status høyst hvert minutt');
  assert.match(l, /if \(st\.opt\("configured"\) == false\)/, 'ikke satt opp → tomtilstand');
  assert.match(l, /\.distinctBy \{ it\.id \}/);
});

/* ======================= Tilgjengelighet ======================= */

test('trykkflater på minst 48 dp og etiketter for skjermleser i de nye skjermene', () => {
  const u87 = code('ui/Nrk87Ui.kt');
  assert.match(body(u87, 'internal fun Knapp87('), /heightIn\(min = 48\.dp\)/);
  assert.match(body(u87, 'internal fun Valg87('), /Pille88\(/);
  const k = code('ui/Nrk88Ui.kt');
  assert.match(body(k, 'internal fun Pille88('), /heightIn\(min = 48\.dp\)[\s\S]*selectable\(selected = on, enabled = enabled, role = Role\.Tab\)/);
  const u = code('ui/Musikk88Ui.kt');
  assert.match(body(u, 'private fun Bryter88('), /size\(56\.dp, 48\.dp\)[\s\S]*toggleable\(value = on, enabled = enabled, role = Role\.Switch\)[\s\S]*contentDescription = label/);
  for (const [src, lbl] of [[k, 'contentDescription = "Søk i NRK"'], [k, 'contentDescription = "Tøm søk"'], [u, 'contentDescription = "Lenke fra YouTube Music"'], [u, 'contentDescription = "Antall spor"'], [u87, 'contentDescription = "Lenke fra NRK"']])
    assert.ok(src.includes(lbl), lbl);
  // Alle lazy-lister i de nye filene har nøkler.
  for (const src of [k, u]) for (const m of src.matchAll(/\bitems\(([^\n]*)/g)) assert.match(m[1], /key = /, m[0]);
  for (const src of [k, u]) for (const m of src.matchAll(/\bitem\(([^)]*)\)/g)) assert.match(m[1], /^"/, m[0]);
});
