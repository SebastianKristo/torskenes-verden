package no.kristo.finanshub

import org.json.JSONObject

/* ---------------- Prompt 14: hjelpere for Papir (farger, transportører, Finn og Sporing) ---------------- */

/** «#fff», «#ffffff» eller «ffffff» som ARGB. null når teksten ikke er en farge. */
fun hexColor(hex: String?): Long? {
    val h = hex?.trim()?.removePrefix("#") ?: return null
    val six = when (h.length) {
        3 -> h.map { "$it$it" }.joinToString("")
        6 -> h
        8 -> h.takeLast(6)
        else -> return null
    }
    return six.toLongOrNull(16)?.let { 0xFF000000 or it }
}

/** Ruters standardfarger per transportmiddel, når serveren ikke sender linjefargen. */
fun ruterModeColor(mode: String?, line: String): Long = when (mode) {
    "metro" -> 0xFFEC700C
    "tram" -> 0xFF0B91EF
    "bus" -> if ((line.filter(Char::isDigit).toIntOrNull() ?: 0) >= 100) 0xFF75A300 else 0xFFE60000
    "water" -> 0xFF682C88
    "rail" -> 0xFF003087
    else -> {
        // Uten mode: T-banelinjene er 1–5, trikken 11–19, ellers buss.
        val n = line.filter(Char::isDigit).toIntOrNull()
        when {
            line.startsWith("T", true) || (n != null && n in 1..5) -> 0xFFEC700C
            n != null && n in 11..19 -> 0xFF0B91EF
            n != null && n >= 100 -> 0xFF75A300
            else -> 0xFFE60000
        }
    }
}

/** Sporingslenker hos transportørene: et trykk på pakkekortet åpner sporingen der. */
fun carrierTrackUrl(carrier: String, no: String): String {
    val n = java.net.URLEncoder.encode(no, "UTF-8")
    return when (carrier) {
        "postnord" -> "https://portal.postnord.com/tracking/details/$n"
        "posten" -> "https://sporing.posten.no/sporing/$n"
        "bring" -> "https://tracking.bring.com/tracking/$n"
        "dhl" -> "https://www.dhl.com/no-no/home/tracking.html?tracking-id=$n"
        "ups" -> "https://www.ups.com/track?loc=nb_NO&tracknum=$n"
        "gls" -> "https://gls-group.com/NO/nb/sporing?match=$n"
        "helthjem" -> "https://www.helthjem.no/sporing/$n"
        "budbee" -> "https://tracking.budbee.com/$n"
        "instabox" -> "https://track.instabox.io/$n"
        else -> "https://t.17track.net/no#nums=$n"
    }
}

/** Fanene i Papir → Sporing. */
val TRK_TABS: List<Pair<String, String>> = listOf(
    "active" to "Aktive", "pickup" to "Klar for henting", "way" to "På vei", "reg" to "Registrert", "done" to "Levert", "all" to "Alle", "arkiv" to "Arkiv",
)

fun trkTabMatch(tab: String, s: Shipment): Boolean = when (tab) {
    "pickup" -> !s.archived && s.ready
    "way" -> !s.archived && !s.done && (s.step == 1 || s.step == 2 || s.status == "out_for_delivery")
    "reg" -> !s.archived && !s.done && s.step == 0
    "done" -> s.done && !s.archived
    "arkiv" -> s.archived
    "all" -> !s.archived
    else -> s.active
}

/** Kortene på Sporing-siden som kan flyttes (lagres som trkOrder per bruker). */
val TRK_CARDS: List<Pair<String, String>> = listOf("add" to "Legg til og kilder", "shipments" to "Sendinger", "notify" to "Varsler", "carriers" to "Transportører")

fun normalizeTrkOrder(raw: List<String>): List<String> {
    val ids = TRK_CARDS.map { it.first }
    val known = raw.filter { it in ids }.distinct()
    return known + ids.filter { it !in known }
}

/** Filtrene i Papir → Finn. */
val FINN_SEGS: List<Pair<String, String>> = listOf("all" to "Alle", "way" to "På vei", "bought" to "Kjøpt", "sold" to "Solgt", "done" to "Fullført")

fun finnSegMatch(seg: String, d: FinnDeal): Boolean = when (seg) {
    "way" -> d.level in 2..3
    "bought" -> !d.sold
    "sold" -> d.sold
    "done" -> d.finished
    else -> true
}

/** Oppsettet fra GET /api/me/layout som ikke er en del av mobilforsiden: Papir-valg, onboarding og trkOrder. */
data class LayoutExtras(val mobileDesign: String?, val paperMode: String?, val photo: String?, val onboarded: Boolean?, val trkOrder: List<String>)

fun parseLayoutExtras(s: String): LayoutExtras {
    val o = JSONObject(s)
    return LayoutExtras(
        o.optStr("mobileDesign"), o.optStr("paperMode"), o.optStr("photo"),
        if (o.has("onboarded") && !o.isNull("onboarded")) o.optBoolean("onboarded") else null,
        o.optJSONArray("trkOrder").strings(),
    )
}
