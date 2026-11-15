package no.kristo.felles.moduler

/*
 * Dyplenker etter Fase 6: modul-id-ene og de gamle rutene i modullisten («oversikt», «gjoremal», «reise/kart», «dash»,
 * «huskeliste», «familiekalender» …) og homelab://-lenker fra iOS og web går til siden appen har for dem. Vertene appen allerede
 * forstår (finanshub://tracking, finanshub://huske …) er uendret, så gamle widgets, varsler og snarveier virker som før.
 */
object Dyplenker {
    /** Vert og sti (uten skråstrek først) appen skal åpne. */
    data class Mal(val vert: String, val sti: String)

    /** Økonomi-sider som ikke er egne moduler. */
    private val OKONOMI: Map<String, Mal> = mapOf(
        "faste-betalinger" to Mal("faste", ""),
        "fast" to Mal("faste", ""),
        "abonnementer" to Mal("faste", "abonnementer"),
        "abonnement" to Mal("faste", "abonnementer"),
        "planlagte-trekk" to Mal("faste", "planlagte"),
        "transaksjoner" to Mal("list", ""),
    )

    /**
     * Hvor finanshub://[vert]/[sti] (eller homelab://…) skal åpnes. Ukjente verter og verter som ikke er moduler, kommer tilbake
     * uendret. Resultatet er stabilt: en lenke som allerede peker på appens vert, gir samme vert igjen.
     */
    fun mal(liste: Modulliste, vert: String, sti: String): Mal {
        val v = vert.trim().lowercase()
        val s = sti.trim().trim('/')
        OKONOMI[v]?.let { m -> return if (s.isNotEmpty() && m.sti.isEmpty()) Mal(m.vert, s) else m }
        val hel = if (s.isNotEmpty()) liste.finnRute("$v/$s") else null
        val treff = hel ?: liste.finnRute(v) ?: return Mal(v, s)
        val u = treff.underside
        // Stien beholdes når den ikke var en del av ruten (finanshub://kalender/2026-11-20, finanshub://kart/<sone>, media/qbit).
        val rest = if (hel != null) "" else s
        return when (treff.modul.id) {
            "oversikt" -> Mal("homelab", rest)
            "gjoremal" -> Mal("huske", rest)
            "reise" -> if (u?.id == "kart") Mal("kart", rest) else Mal("avganger", rest)
            "kalender" -> when (u?.id) {
                "familie" -> Mal("familiekalender", rest)
                "bursdager" -> Mal("bursdager", rest)
                else -> Mal("kalender", rest)
            }
            "familie" -> Mal("familie", if (u == null || u.id == "folk") rest else u.id)
            "finans" -> if (v == "finance" || v == "home") Mal(v, rest) else Mal("finance", rest)
            "media" -> when (u?.id) {
                "kommer" -> Mal("media", "snart")
                "nedlastinger" -> Mal("media", "qbit")
                "ikveld" -> Mal("kveld", rest)
                null -> Mal("media", rest)
                else -> Mal("media", "")
            }
            "nyheter" -> if (v == "news" || v == "rss") Mal(v, rest) else Mal("nyheter", rest)
            "vaer" -> if (v == "weather") Mal(v, rest) else Mal("vaer", rest)
            "sporing" -> Mal("tracking", rest)
            "domener" -> Mal("domains", rest)
            else -> Mal(treff.modul.id, rest)
        }
    }

    /** homelab://<vert>/… (ikke innlogging) → finanshub://<vert>/…, som appen åpner. null når lenken ikke skal byttes. */
    fun fraHomelab(lenke: String): String? {
        if (!lenke.startsWith("homelab://")) return null
        val rest = lenke.removePrefix("homelab://")
        val vert = rest.substringBefore('/').substringBefore('?')
        if (vert.isEmpty() || vert == "login" || vert == "app-auth") return null
        return "finanshub://$rest"
    }
}
