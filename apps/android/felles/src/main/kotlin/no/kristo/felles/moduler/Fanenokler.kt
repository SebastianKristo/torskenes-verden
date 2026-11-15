package no.kristo.felles.moduler

/*
 * Fanenøklene appene lagrer i layout.tabBar (det serveren godtar, server/mobile.js TAB_IDS) mot modul-id-ene i modullisten.
 * Nøklene er beholdt som alias, så lagrede oppsett og eldre klienter virker som før, mens navn, ikon og rekkefølge kommer
 * fra modullisten (Fase 6).
 */
object Fanenokler {
    /** Fanenøkkel → modul-id. Nøkler uten modul (Aksjer, Boliger, Faste betalinger, Glimt, Innstillinger, Nordlys, Mer) mangler. */
    val TIL_MODUL: Map<String, String> = mapOf(
        "hjem" to "oversikt",
        "finans" to "finans",
        "mat" to "mat",
        "domener" to "domener",
        "sporing" to "sporing",
        "familie" to "familie",
        "avganger" to "reise",
        "vaer" to "vaer",
        "nyheter" to "nyheter",
        "media" to "media",
        "chat" to "chat",
        "huske" to "gjoremal",
        "kalender" to "kalender",
        "brief" to "brief",
        "bibel" to "bibel",
    )

    /**
     * Nøkler andre klienter (iOS, web, eldre apper) kan ha lagret for samme fane → nøkkelen appen bruker. Nyhetsleser er en del
     * av Nyheter (Q10), og Kart ligger i Familie (Q9).
     */
    val ALIAS: Map<String, String> = mapOf(
        "rss" to "nyheter",
        "nyhetsleser" to "nyheter",
        "gjoremal" to "huske",
        "bursdager" to "bursdag",
        "innstillinger" to "innst",
        "abo" to "abonnementer",
        "kart" to "familie",
        "fsok" to "sok",
        "oversikt" to "hjem",
        "reise" to "avganger",
        "okonomi" to "finans",
    )

    /** Nøkkelen appen bruker for en lagret nøkkel (alias løses opp, ukjente beholdes). */
    fun norm(nokkel: String): String {
        val k = nokkel.trim().lowercase()
        return ALIAS[k] ?: k
    }

    /** Modulen en fanenøkkel hører til, eller null. */
    fun modul(nokkel: String): String? = TIL_MODUL[norm(nokkel)]

    /** Fanenøkkelen for en modul («gjoremal» → «huske», «reise» → «avganger»), eller null når modulen ikke kan være fane. */
    fun fra(modulId: String): String? = TIL_MODUL.entries.firstOrNull { it.value == modulId }?.key
}
