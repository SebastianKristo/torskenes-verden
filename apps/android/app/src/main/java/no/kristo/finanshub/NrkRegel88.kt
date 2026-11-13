package no.kristo.finanshub

/*
 * Prompt 88 (AND88): rene regler for søk og serieside i NRK-fanen og for Musikk-fanen (yubal) i Media.
 * Fasit: public/js/media-nrk.js og public/js/media-musikk.js (web), server/nrkdl.js og server/yubal.js.
 * Ingen Android-typer her – fila kompileres og kjøres mot fasit i test/p88-and.test.js.
 */

private val SERIE_RE88 = Regex("^https://tv\\.nrk\\.no/serie/([a-z0-9][a-z0-9_-]{0,100})(?:[/?#].*)?$", RegexOption.IGNORE_CASE)
private val SESONG_NAVN88 = Regex("^[A-Za-z0-9_-]{1,60}$")
private val MND88 = listOf("jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des.")

/** Serie-id fra en tv.nrk.no-lenke (…/serie/{sid}, også …/serie/{sid}/sesong/3/episode/4), ellers null. Som serieId() på serveren. */
fun nrkSerieId88(url: String?): String? = url?.trim()?.let { SERIE_RE88.matchEntire(it) }?.groupValues?.get(1)?.lowercase()

/** Sesongnavn slik serveren godtar dem i /serie/:sid/sesong/:navn. */
fun nrkSesongOk88(navn: String): Boolean = SESONG_NAVN88.matches(navn)

/** «2026-01-05» (eller en full ISO-tid) → «5. jan. 2026»; annen tekst vises som den er. */
fun nrkDato88(v: String?): String {
    val s = v?.trim().orEmpty()
    val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})").find(s) ?: return s
    val mnd = MND88.getOrNull(m.groupValues[2].toInt() - 1) ?: ""
    return "${m.groupValues[3].toInt()}. $mnd ${m.groupValues[1]}"
}

/** Sesongfanen: årstall står som de er, ellers sesongens tittel eller «Sesong N». */
fun nrkSesNavn88(navn: String, tittel: String?): String = if (Regex("^\\d{4}$").matches(navn)) navn else tittel?.takeIf { it.isNotBlank() } ?: "Sesong $navn"

/** Valgt sesong: den brukeren trykket på (hvis den har episoder), ellers den nyeste som har episoder. [ses] = (navn, tilgjengelig). */
fun nrkSesong88(ses: List<Pair<String, Boolean>>, valgt: String?): String? =
    ses.firstOrNull { it.first == valgt && it.second }?.first ?: ses.lastOrNull { it.second }?.first

/** En episode kan krysses av når NRK har den, og den verken er lastet ned eller ligger i køen. */
fun nrkKanVelges88(kan: Boolean, lastetNed: Boolean, iKo: Boolean): Boolean = kan && !lastetNed && !iKo

/** Merket på en episode som ikke kan velges: (tekst, tone), eller null. Tone som i Køen (mut, ok, dl). */
fun nrkEpMerke88(kan: Boolean, label: String?, lastetNed: Boolean, iKo: Boolean): Pair<String, String>? = when {
    !kan -> (label?.takeIf { it.isNotBlank() } ?: "Ikke tilgjengelig") to "mut"
    lastetNed -> "Lastet ned" to "ok"
    iKo -> "I kø" to "dl"
    else -> null
}

/** «Last ned 3 episoder» / «Last ned 1 episode». */
fun nrkHentTekst88(n: Int): String = "Last ned $n episode${if (n == 1) "" else "r"}"

/** «Velg alle tilgjengelige (N)», eller «Fjern valg» når alle er valgt. */
fun nrkVelgAlle88(valgte: Int, tilgjengelige: Int): String = if (tilgjengelige > 0 && valgte >= tilgjengelige) "Fjern valg" else "Velg alle tilgjengelige ($tilgjengelige)"

/** «DRAMA · 3 SESONGER» over seriens tittel. */
fun nrkKat88(kategori: String?, sesonger: Int): String =
    listOfNotNull(kategori?.trim()?.takeIf { it.isNotEmpty() }?.uppercase(), if (sesonger > 0) "$sesonger ${if (sesonger == 1) "SESONG" else "SESONGER"}" else null).joinToString(" · ")

/** Merket på et søketreff. */
fun nrkArtMerke88(art: String): String = when (art) { "serie" -> "SERIE"; "film" -> "FILM"; "radio" -> "RADIO"; "episode" -> "EPISODE"; else -> "NRK" }

/** Type i POST /jobber for et søketreff: film → film, radio → radio, ellers auto. */
fun nrkTreffType88(art: String): String = when (art) { "film" -> "film"; "radio" -> "radio"; else -> "auto" }

/** «2 treff», «Søker …», «Søk etter serier, filmer og podkaster.» – linja over treffene. */
fun nrkSokSum88(mulig: Boolean, laster: Boolean, q: String, treff: Int): String = when {
    !mulig -> "Søket krever en nyere versjon av nrk-dl. Bruk lenkefeltet under."
    laster && treff == 0 -> "Søker …"
    q.isNotEmpty() -> "$treff treff"
    else -> "Søk etter serier, filmer og podkaster."
}

/** Tittelen på jobben når valgte episoder lastes ned: «Exit · sesong 3» / «Abels tårn · 2026». */
fun nrkJobbTittel88(serie: String, navn: String, tittel: String?): String =
    "$serie · " + if (Regex("^\\d{4}$").matches(navn)) navn else nrkSesNavn88(navn, tittel).lowercase()

/* ======================= Musikk (yubal) ======================= */

private val YT_RE88 = Regex("^https://(music\\.youtube\\.com|youtube\\.com|www\\.youtube\\.com|m\\.youtube\\.com|youtu\\.be)/[^\\s]*$", RegexOption.IGNORE_CASE)

/**
 * YouTube-lenken slik den sendes til serveren, eller null. Bare music.youtube.com, youtube.com, www/m.youtube.com og youtu.be
 * (samme liste som serveren). «music.youtube.com/…» og http:// gjøres om til https.
 */
fun ytLenke88(raw: String): String? {
    var u = raw.trim()
    if (u.isEmpty() || u.length > 2000 || u.any { it.isWhitespace() }) return null
    if (u.startsWith("http://", ignoreCase = true)) u = "https://" + u.substring(7)
    else if (!u.startsWith("https://", ignoreCase = true)) { if (u.contains("://")) return null; u = "https://$u" }
    return if (YT_RE88.matches(u)) u else null
}

/** Delt eller innlimt tekst: første YouTube-lenke i teksten, eller null. */
fun ytDelt88(text: String): String? {
    val t = text.trim()
    if (t.isEmpty() || t.length > 2000) return null
    for (m in Regex("(?:https?://)?(?:music\\.youtube\\.com|www\\.youtube\\.com|m\\.youtube\\.com|youtube\\.com|youtu\\.be)/[^\\s<>\"']*", RegexOption.IGNORE_CASE).findAll(t)) {
        val before = if (m.range.first > 0) t[m.range.first - 1] else ' '
        if (before.isLetterOrDigit() || before == '.' || before == '-' || before == '@' || before == '/') continue
        ytLenke88(m.value.trimEnd('.', ',', ')', ']', '!', ';', '»'))?.let { return it }
    }
    return null
}

/** Ferdig = yubal gjør ikke mer med jobben. */
fun muFerdig88(status: String): Boolean = status == "completed" || status == "failed" || status == "cancelled"

/** Statuschip i Køen: (tekst, tone). Tone: mut, dl (blå), pu (lilla, import), ok, err. */
fun muChip88(status: String): Pair<String, String> = when (status) {
    "fetching_info" -> "HENTER INFO" to "dl"
    "downloading" -> "LASTER NED" to "dl"
    "importing" -> "IMPORTERER" to "pu"
    "completed" -> "FERDIG" to "ok"
    "failed" -> "FEILET" to "err"
    "cancelled" -> "AVBRUTT" to "mut"
    else -> "VENTER" to "mut"
}

private fun ant88(n: Int, en: String, fl: String) = "$n ${if (n == 1) en else fl}"

/** «12 lastet ned · 1 feilet · 3 hoppet over» (download_stats), eller «14 spor» / «Venter på tur» før start. */
fun muTall88(status: String, sporAntall: Int?, ok: Int, feilet: Int, hoppet: Int): String =
    if (status == "pending") (sporAntall?.let { ant88(it, "spor", "spor") } ?: "Venter på tur")
    else listOfNotNull("$ok lastet ned", if (feilet > 0) "$feilet feilet" else null, if (hoppet > 0) "$hoppet hoppet over" else null).joinToString(" · ")

/** Fremdriftslinja vises mens jobben jobber (ikke når den venter eller er ferdig). */
fun muLinje88(status: String): Boolean = !muFerdig88(status) && status != "pending"

/** Oppdatering: hvert 2. sekund mens noe står i køen eller jobber, ellers hvert 10. */
fun muPause88(statuser: List<String>): Long = if (statuser.any { !muFerdig88(it) }) 2000L else 10_000L

/** «Kilde: opus · 128 kbps», eller null uten kodek og bitrate. */
fun muKilde88(kodek: String?, kbps: Int?): String? {
    val d = listOfNotNull(kodek?.takeIf { it.isNotBlank() }, kbps?.takeIf { it > 0 }?.let { "$it kbps" })
    return if (d.isEmpty()) null else "Kilde: " + d.joinToString(" · ")
}

/** «Artist · 2024 · 12 spor». */
fun muMeta88(artist: String?, aar: Int?, spor: Int?): String =
    listOfNotNull(artist?.takeIf { it.isNotBlank() }, aar?.takeIf { it > 0 }?.toString(), spor?.let { ant88(it, "spor", "spor") }).joinToString(" · ")

/** Typen i klartekst over tittelen i forhåndsvisningen. */
fun muKind88(kind: String): String = when (kind) { "album" -> "ALBUM"; "track" -> "SANG"; else -> "SPILLELISTE" }

/** «Bare de første N»: heltall 1–10000 (tomt eller tull gir 1). */
fun muMax88(tekst: String): Int = (tekst.trim().toIntOrNull() ?: tekst.filter { it.isDigit() }.take(6).toIntOrNull() ?: 1).coerceIn(1, 10_000)

/** «nå nettopp» / «12 min siden» / «3 t siden» / «2 d siden». Tid i millisekunder. */
fun muSiden88(t: Long?, now: Long): String? {
    if (t == null || t <= 0L) return null
    val m = Math.round((now - t) / 60_000.0)
    return when { m < 1L -> "nå nettopp"; m < 60L -> "$m min siden"; m < 1440L -> "${Math.round(m / 60.0)} t siden"; else -> "${Math.round(m / 1440.0)} d siden" }
}

/** Under navnet på en spilleliste: «Synket 3 t siden · de første 50». */
fun muSubSub88(synket: Long?, max: Int?, now: Long): String =
    listOfNotNull(muSiden88(synket, now)?.let { "Synket $it" } ?: "Ikke synket ennå", max?.let { "de første $it" }).joinToString(" · ")

/** «3:07» for sekunder, tom tekst uten varighet. */
fun muMmss88(s: Int?): String = if (s == null || s <= 0) "" else "${s / 60}:${(s % 60).toString().padStart(2, '0')}"

/** Merket på en sang i en spilleliste du følger: (tekst, tone), eller null for ukjent status. */
fun muSporChip88(status: String?): Pair<String, String>? = when (status) {
    "downloaded" -> "LASTET NED" to "ok"
    "skipped" -> "FINNES ALT" to "mut"
    "failed" -> "FEILET" to "err"
    "pending" -> "IKKE SYNKET" to "mut"
    else -> null
}

/** Oppsummeringen når yubal ga sanglista: «14 sanger · 11 lastet ned · 2 fantes fra før · 1 feilet». */
fun muSporSum88(statuser: List<String?>): String {
    val n = { k: String -> statuser.count { it == k } }
    return listOfNotNull(ant88(statuser.size, "sang", "sanger"), "${n("downloaded")} lastet ned", n("skipped").takeIf { it > 0 }?.let { "$it fantes fra før" },
        n("failed").takeIf { it > 0 }?.let { "$it feilet" }, n("pending").takeIf { it > 0 }?.let { "$it ikke synket" }).joinToString(" · ")
}

/** Oppsummeringen fra siste synk når sanglista ikke finnes: «14 sanger · 11 lastet ned · 2 fantes fra før · 1 feilet». */
fun muSynkSum88(total: Int?, synket: Boolean, ok: Int, feilet: Int, hoppet: Int, fantes: Int): String {
    val andre = Math.max(0, hoppet - fantes)
    return listOfNotNull(total?.let { ant88(it, "sang", "sanger") }, if (synket) "$ok lastet ned" else "Ikke synket ennå", fantes.takeIf { it > 0 }?.let { "$it fantes fra før" },
        andre.takeIf { it > 0 }?.let { "$it hoppet over" }, feilet.takeIf { it > 0 }?.let { "$it feilet" }).joinToString(" · ")
}

/** «i dag kl. 03:00» / «i morgen kl. 03:00» / «fre. 14. nov. kl. 03:00» for neste automatiske sjekk. [tz] = brukerens tidssone. */
fun muNar88(t: Long, now: Long, tz: java.util.TimeZone): String {
    val c = java.util.Calendar.getInstance(tz).apply { timeInMillis = t }
    val d0 = java.util.Calendar.getInstance(tz).apply { timeInMillis = now; set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0) }
    val kl = c.get(java.util.Calendar.HOUR_OF_DAY).toString().padStart(2, '0') + ":" + c.get(java.util.Calendar.MINUTE).toString().padStart(2, '0')
    val dag = Math.floorDiv(t - d0.timeInMillis, 86_400_000L)
    val uke = listOf("søn.", "man.", "tir.", "ons.", "tor.", "fre.", "lør.")[c.get(java.util.Calendar.DAY_OF_WEEK) - 1]
    return when (dag) {
        0L -> "i dag kl. $kl"
        1L -> "i morgen kl. $kl"
        else -> "$uke ${c.get(java.util.Calendar.DAY_OF_MONTH)}. ${MND88[c.get(java.util.Calendar.MONTH)]} kl. $kl"
    }
}

/** Linja over spillelistene: «Neste automatiske sjekk: i dag kl. 03:00 · 2 av 3 på», eller at planleggeren er av. */
fun muPlan88(enabled: Boolean, neste: String?, paa: Int, totalt: Int): String =
    if (enabled) "Neste automatiske sjekk: ${neste ?: "ukjent"} · $paa av $totalt på" else "Automatisk synk er slått av i yubal"
