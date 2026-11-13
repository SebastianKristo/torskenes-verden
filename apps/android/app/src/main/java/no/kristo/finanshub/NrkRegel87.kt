package no.kristo.finanshub

/*
 * Prompt 87 (NRKAND): rene regler for NRK-fanen i Media (claude-code-media-nrk-nedlaster.md, fasit Media NRK.dc.html).
 * Ingen Android-typer her – fila kompileres og kjøres mot fasit i test/p87-and.test.js.
 */

/** Lenker NRK-nedlasteren tar imot: nrk.no og nrksuper.no med underdomener. Samme regel som serveren (som er fasit). */
private val NRK_RE87 = Regex("^https://([a-z0-9-]+\\.)*(nrk\\.no|nrksuper\\.no)(:443)?([/?#].*)?$", RegexOption.IGNORE_CASE)
private val NRK_FINN87 = Regex("(?:https?://)?(?:[a-z0-9-]+\\.)*(?:nrk\\.no|nrksuper\\.no)(?![a-z0-9@:-]|\\.[a-z0-9])(?:[/?#][^\\s<>\"']*)?", RegexOption.IGNORE_CASE)

/**
 * Lenken slik den sendes til serveren, eller null når den ikke er en NRK-lenke.
 * «tv.nrk.no/serie/exit» og «http://…» gjøres om til https (serveren tar bare https).
 */
fun nrkLenke87(raw: String): String? {
    var u = raw.trim()
    if (u.isEmpty() || u.length > 2000 || u.any { it.isWhitespace() }) return null
    if (u.startsWith("http://", ignoreCase = true)) u = "https://" + u.substring(7)
    else if (!u.startsWith("https://", ignoreCase = true)) { if (u.contains("://")) return null; u = "https://$u" }
    return if (NRK_RE87.matches(u)) u else null
}

/**
 * Delt tekst (Del → Homelab fra NRK-appen eller nettleseren): første NRK-lenke i teksten, eller null.
 * NRK-appen deler «Tittel https://tv.nrk.no/…». Lange tekster (e-post, notater) som tilfeldigvis nevner nrk.no, er ikke en deling av et program.
 */
fun nrkDelt87(text: String): String? {
    val t = text.trim()
    if (t.isEmpty() || t.length > 600) return null
    for (m in NRK_FINN87.findAll(t)) {
        // Treffet må stå for seg selv – ikke midt i et annet vertsnavn («evilnrk.no», «bruker@nrk.no», «nrk.no.evil.com»).
        val before = if (m.range.first > 0) t[m.range.first - 1] else ' '
        if (before.isLetterOrDigit() || before == '.' || before == '-' || before == '@' || before == '/') continue
        val v = m.value.trimEnd('.', ',', ')', ']', '!', ';', ':', '»')
        nrkLenke87(v)?.let { return it }
    }
    return null
}

/** Tall med inntil én desimal og norsk komma: 6.8 → «6,8», 2.0 → «2». */
fun nrkTall87(v: Double): String {
    val r = Math.round(v * 10.0)
    return if (r % 10L == 0L) "${r / 10L}" else "${r / 10L},${Math.abs(r % 10L)}"
}

/** Fart i MB/s (som i designet: 1 MB = 1 000 000 byte). Tom tekst når farten er ukjent eller null. */
fun nrkFart87(bytesPerS: Double?): String = if (bytesPerS == null || bytesPerS <= 0.0) "" else nrkTall87(bytesPerS / 1e6) + " MB/s"

/** «1 min 58 s igjen» / «42 s igjen». Tom tekst uten anslag. */
fun nrkEta87(s: Long?): String = when {
    s == null || s <= 0L -> ""
    s >= 3600L -> "${s / 3600L} t ${(s % 3600L) / 60L} min igjen"
    s >= 60L -> "${s / 60L} min ${s % 60L} s igjen"
    else -> "$s s igjen"
}

/** «Spart 2,4 GB med komprimering» (MB under 1 GB). null når ingenting er spart. */
fun nrkSpart87(bytes: Long?): String? = when {
    bytes == null || bytes <= 0L -> null
    bytes >= 1_000_000_000L -> "Spart ${nrkTall87(bytes / 1e9)} GB med komprimering"
    else -> "Spart ${Math.max(1L, Math.round(bytes / 1e6))} MB med komprimering"
}

/** «nå nettopp» / «30 min siden» / «2 t siden» / «3 d siden». [t] og [now] er unix-tid i sekunder. */
fun nrkSiden87(t: Long?, now: Long): String? {
    if (t == null || t <= 0L) return null
    val m = Math.round((now - t) / 60.0)
    return when {
        m < 1L -> "nå nettopp"
        m < 60L -> "$m min siden"
        m < 48L * 60L -> "${Math.round(m / 60.0)} t siden"
        else -> "${Math.round(m / 1440.0)} d siden"
    }
}

/** Kvalitet i klartekst: best → «beste», 1080 → «1080p». */
fun nrkKval87(k: String?): String = when (k) { null, "", "best" -> "beste"; else -> if (k.all { it.isDigit() }) "${k}p" else k }

/** «Sjekket 30 min siden · 2 nye episoder · 1080p». */
fun nrkFolgSub87(sjekket: Long?, siste: String?, kvalitet: String?, now: Long): String =
    listOfNotNull(nrkSiden87(sjekket, now)?.let { "Sjekket $it" } ?: "Ikke sjekket ennå", siste?.trim()?.takeIf { it.isNotEmpty() }, nrkKval87(kvalitet)).joinToString(" · ")

/** Statuschip i Køen: (tekst, tone). Tone: mut = dempet, dl = blå, ok = grønn, err = rød. Uten norsk VPN venter kø og nedlasting. */
fun nrkChip87(status: String, vpnOk: Boolean): Pair<String, String> {
    val (t, c) = when (status) {
        "ko" -> "I KØ" to "mut"
        "kjorer" -> "LASTER NED" to "dl"
        "ferdig" -> "FERDIG" to "ok"
        "feil" -> "FEIL" to "err"
        "avbrutt" -> "AVBRUTT" to "mut"
        else -> status.uppercase() to "mut"
    }
    return if (!vpnOk && (status == "ko" || status == "kjorer")) "VENTER" to c else t to c
}

/** Knappene på en jobb etter status (designet): avbryt · igjen (Prøv igjen) · nye (Se etter nye) · fjern. */
fun nrkKnapper87(status: String, type: String): List<String> = buildList {
    if (status == "kjorer" || status == "ko") add("avbryt")
    if (status == "feil" || status == "avbrutt") add("igjen")
    if (status == "ferdig" && type != "film") add("nye")
    if (status != "kjorer") add("fjern")
}

/** Komprimeringen pågår når jobben kjører og meldingen starter med «Komprimerer». */
fun nrkKomprimerer87(status: String, melding: String?): Boolean = status == "kjorer" && melding?.trimStart()?.startsWith("Komprimerer", ignoreCase = true) == true

/** Episodestatus i Bibliotek: (tekst, tone). */
fun nrkEpChip87(status: String): Pair<String, String> = when (status) {
    "lastet" -> "LASTET NED" to "ok"
    "laster" -> "LASTER NED" to "dl"
    "ko" -> "I KØ" to "mut"
    else -> "MANGLER" to "mut"
}

/** «S03E04» for serier, «#04» for radio/podkast, «FILM» for film. */
fun nrkEpNr87(type: String, sesong: Int, ep: Int): String = when (type) {
    "film" -> "FILM"
    "radio" -> "#" + ep.toString().padStart(2, '0')
    else -> "S" + sesong.toString().padStart(2, '0').takeLast(2) + "E" + ep.toString().padStart(2, '0')
}

/** «4 serier · 2 filmer · 2 podkaster». */
fun nrkSum87(tv: Int, film: Int, radio: Int): String =
    "$tv ${if (tv == 1) "serie" else "serier"} · $film ${if (film == 1) "film" else "filmer"} · $radio ${if (radio == 1) "podkast" else "podkaster"}"

/** Oppdatering: hvert 2. sekund mens noe er i kø eller lastes ned, ellers hvert 10. */
fun nrkPause87(statuser: List<String>): Long = if (statuser.any { it == "ko" || it == "kjorer" }) 2000L else 10_000L

/** Undertekst til «Komprimer»: «Standard på serveren · crf 26 · preset medium». */
fun nrkKompSub87(standard: Boolean, crf: String?, preset: String?): String =
    listOfNotNull(if (standard) "Standard på serveren" else "Av som standard på serveren", crf?.takeIf { it.isNotBlank() }?.let { "crf $it" }, preset?.takeIf { it.isNotBlank() }?.let { "preset $it" }).joinToString(" · ")

/**
 * Fanelinja: hvor langt raden må rulles for at fane [idx] skal stå midt i [viewport] (alt i piksler).
 * [widths] er bredden på hver fane, [pad] luften foran første fane, [gap] luften mellom fanene, [max] største rulleverdi.
 */
fun tabScroll87(widths: List<Int>, idx: Int, pad: Int, gap: Int, viewport: Int, max: Int): Int {
    if (idx !in widths.indices || viewport <= 0) return 0
    var x = pad
    for (i in 0 until idx) x += widths[i] + gap
    val mid = x + widths[idx] / 2
    return (mid - viewport / 2).coerceIn(0, Math.max(0, max))
}
