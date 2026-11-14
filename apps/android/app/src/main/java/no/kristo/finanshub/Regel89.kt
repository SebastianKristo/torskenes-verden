package no.kristo.finanshub

/*
 * Prompt 89 (AND89): rene regler uten Android-avhengigheter (kompilert og kjørt med kotlinc, speilet i test/p89-and.test.js).
 *  - Serveradresse: riktig domene os.smarthjemeksperten.no, migrering av den gamle feilstavede standarden, validering i tannhjul-arket.
 *  - Live Updates (claude-code-live-activities.md + Live Activities.dc.html): farger, symboler, segmenter for pakke, brikketekst,
 *    pollingintervall, utløp og dyplenker for de fem typene fra GET /api/live/aktiviteter.
 */
object Regel89 {
    const val EXTERNAL = "https://os.smarthjemeksperten.no"
    const val LOCAL = "http://10.69.1.39:3000"
    /** Den gamle, feilstavede standarden (delt i to så et søk etter den gamle stavingen bare treffer migreringen). */
    const val OLD_EXTERNAL = "https://os.smarthjem" + "experten.no"

    /** Er [s] nøyaktig den gamle standarden (med eller uten avsluttende / og mellomrom)? Egendefinerte adresser røres ikke. */
    fun isOld(s: String?): Boolean = s != null && s.trim().trimEnd('/').equals(OLD_EXTERNAL, ignoreCase = true)

    /** Gammel standard → ny standard, ellers uendret. */
    fun migrate(s: String?): String? = if (isOld(s)) EXTERNAL else s

    /** Tannhjul-arket: må starte med http:// eller https://, mellomrom og avsluttende / fjernes. null = ugyldig. */
    fun clean(raw: String): String? {
        val s = raw.filterNot { it.isWhitespace() }.trimEnd('/')
        val scheme = when {
            s.startsWith("https://", true) -> "https://"
            s.startsWith("http://", true) -> "http://"
            else -> return null
        }
        val rest = s.substring(scheme.length)
        val host = rest.substringBefore('/').substringBefore('?').substringBefore('#')
        if (host.isEmpty() || host.startsWith(':') || host.contains('@')) return null
        return scheme + rest
    }

    /** «Server: os.smarthjemeksperten.no» under innloggingsknappen. */
    fun hostLabel(url: String?): String {
        val u = url?.trim().orEmpty().ifBlank { EXTERNAL }
        return u.substringAfter("://").substringBefore('/').substringBefore('?').ifBlank { EXTERNAL.substringAfter("://") }
    }

    /* ======================= Live Updates ======================= */

    val TYPES = listOf("nedlasting", "backup", "spiller", "avtale", "pakke")
    val ACTIONS = setOf("pause", "fortsett", "stopp", "rute", "utsett")
    private val ID = Regex("^[a-z0-9:_-]{1,80}$")

    fun validId(id: String?): Boolean = id != null && ID.matches(id)

    /** Aksentfarger fra fasiten (på mørk bakgrunn). */
    fun accent(type: String): Int = when (type) {
        "nedlasting" -> 0xFF5AC8FA.toInt()
        "backup" -> 0xFF30D158.toInt()
        "spiller" -> 0xFFFFB340.toInt()
        "avtale" -> 0xFFFF6A4D.toInt()
        "pakke" -> 0xFFBF8CFF.toInt()
        else -> 0xFF8E8E93.toInt()
    }

    fun label(type: String): String = when (type) {
        "nedlasting" -> "Nedlastinger"
        "backup" -> "Backup"
        "spiller" -> "Spilles nå"
        "avtale" -> "Neste avtale"
        "pakke" -> "Pakkesporing"
        else -> "Homelab"
    }

    /** Undertekst under bryteren i Innstillinger → Varsler → Live Updates. */
    fun about(type: String): String = when (type) {
        "nedlasting" -> "NRK, Sonarr, Radarr og qBittorrent · fremdrift, Pause / Fortsett"
        "backup" -> "Backup til NAS · fremdrift, Pause / Fortsett"
        "spiller" -> "Plex og Jellyfin · posisjon, Pause / Spill av, Stopp"
        "avtale" -> "Kalender, når neste avtale starter innen 60 min · Vis rute, Utsett"
        "pakke" -> "Ute for levering og levert · stopp unna"
        else -> ""
    }

    fun actionTitle(id: String): String = when (id) {
        "pause" -> "Pause"; "fortsett" -> "Fortsett"; "stopp" -> "Stopp"; "rute" -> "Vis rute"; "utsett" -> "Utsett 5 min"; else -> id
    }

    /** SVG-stier (24×24) fra fasiten. Spiller på pause viser pause-symbolet, som i fasiten. */
    fun icon(type: String, status: String = "aktiv"): String = when (type) {
        "nedlasting" -> "M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"
        "backup" -> "M4 5.5h16v5.5H4zM4 13h16v5.5H4zM7.5 8.25h.01M7.5 15.75h.01"
        "spiller" -> if (status == "pause") "M8.5 5.5v13M15.5 5.5v13" else "M8 5.5v13l10.5-6.5z"
        "avtale" -> "M4.5 6h15v13.5h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4"
        "pakke" -> "M4 8l8-4 8 4v8.5l-8 4-8-4zM4 8l8 4 8-4M12 12v8.5"
        else -> "M12 4v16M4 12h16"
    }

    data class Poly(val pts: List<Pair<Float, Float>>, val closed: Boolean)

    /** Liten SVG-sti-tolker for M/L/H/V/Z (store og små bokstaver) – nok for symbolene over. */
    fun polylines(d: String): List<Poly> {
        val tok = Regex("[MmLlHhVvZz]|-?(?:\\d+\\.?\\d*|\\.\\d+)").findAll(d).map { it.value }.toList()
        val out = ArrayList<Poly>()
        var cur = ArrayList<Pair<Float, Float>>()
        var x = 0f; var y = 0f; var sx = 0f; var sy = 0f
        var cmd = 'M'
        var i = 0
        fun flush(closed: Boolean) { if (cur.size >= 1) out += Poly(cur.toList(), closed); cur = ArrayList() }
        fun num(): Float? = tok.getOrNull(i)?.toFloatOrNull()?.also { i++ }
        while (i < tok.size) {
            val t = tok[i]
            if (t.length == 1 && t[0].isLetter()) {
                cmd = t[0]; i++
                if (cmd == 'Z' || cmd == 'z') { flush(true); x = sx; y = sy; continue }
            }
            when (cmd) {
                'M', 'm' -> {
                    val a = num() ?: break; val b = num() ?: break
                    flush(false)
                    if (cmd == 'm') { x += a; y += b } else { x = a; y = b }
                    sx = x; sy = y; cur.add(x to y)
                    cmd = if (cmd == 'm') 'l' else 'L'
                }
                'L', 'l' -> { val a = num() ?: break; val b = num() ?: break; if (cmd == 'l') { x += a; y += b } else { x = a; y = b }; cur.add(x to y) }
                'H', 'h' -> { val a = num() ?: break; x = if (cmd == 'h') x + a else a; cur.add(x to y) }
                'V', 'v' -> { val a = num() ?: break; y = if (cmd == 'v') y + a else a; cur.add(x to y) }
                else -> i++
            }
        }
        flush(false)
        return out
    }

    /** Fremdrift 0–100, eller null når serveren ikke har noen (progress null). */
    fun pct(p: Double?): Int? = p?.takeIf { !it.isNaN() && !it.isInfinite() }?.let { Math.round(it.coerceIn(0.0, 1.0) * 100).toInt() }

    /** Pakke: segmentlengder som til sammen er 100 (maks 10 segmenter). Tom liste = ingen segmenter. */
    fun segLengths(antall: Int): List<Int> {
        val n = antall.coerceIn(0, 10)
        if (n == 0) return emptyList()
        val base = 100 / n
        return List(n) { if (it == n - 1) 100 - base * (n - 1) else base }
    }

    /** Pakke: fremdrift (0–100) når [ferdig] av [antall] steg er gjort. */
    fun segProgress(antall: Int, ferdig: Int): Int {
        val l = segLengths(antall)
        return l.take(ferdig.coerceIn(0, l.size)).sum()
    }

    /** Brikken i statuslinja (setShortCriticalText): verdien («62 %», «24:10», «25 min», «4 stopp», «Levert»), «Pauset» på pause. */
    fun chip(verdi: String, status: String): String = (if (status == "pause") "Pauset" else verdi.trim()).take(12)

    /** Aktive aktiviteter (ikke ferdig) gjør at appen fortsetter å polle. */
    fun active(status: String): Boolean = status == "aktiv" || status == "pause"

    /**
     * Pollingintervall mens noe er aktivt: 5 s når en nedlasting eller backup går (som APNs-grensen på serveren), ellers 30 s
     * (tid tikker av seg selv med kronometeret). null = ingenting aktivt → forgrunnstjenesten stopper.
     */
    fun intervalMs(items: List<Pair<String, String>>): Long? {
        val act = items.filter { active(it.second) }
        if (act.isEmpty()) return null
        return if (act.any { (it.first == "nedlasting" || it.first == "backup") && it.second == "aktiv" }) 5_000L else 30_000L
    }

    /** Varselet forsvinner av seg selv: ferdig → 15 min (pakke 30 min etter levert); avtale ved starttid ([endMs]). */
    fun timeoutMs(type: String, status: String, now: Long, endMs: Long?): Long? = when {
        status == "ferdig" -> if (type == "pakke") 30 * 60_000L else 15 * 60_000L
        type == "avtale" && endMs != null -> (endMs - now).coerceAtLeast(60_000L)
        else -> null
    }

    /** Dyplenke i appen: homelab://x → finanshub://x (ikke innlogging), finanshub:// som den er, ellers etter type. */
    fun link(url: String?, type: String): String {
        val u = url?.trim().orEmpty()
        if (u.startsWith("finanshub://")) return u
        if (u.startsWith("homelab://")) {
            val rest = u.removePrefix("homelab://")
            val host = rest.substringBefore('/').substringBefore('?')
            if (host.isNotEmpty() && host != "login" && host != "app-auth") return "finanshub://$rest"
        }
        return when (type) {
            "nedlasting" -> "finanshub://media/qbit"
            "spiller" -> "finanshub://media"
            "avtale" -> "finanshub://kalender"
            "pakke" -> "finanshub://tracking"
            else -> "finanshub://system"
        }
    }

    /** Kartlenken fra «Vis rute» åpnes bare når den er https:// eller geo: (prompt 86: aldri http utenfor lokalt nett). */
    fun routeOk(url: String?): Boolean = url != null && (url.startsWith("https://") || url.startsWith("geo:"))

    /** Stabil varsel-id per aktivitet. */
    fun notifId(id: String): Int = 78_900_000 + (id.hashCode() and 0xFFFF)
}
