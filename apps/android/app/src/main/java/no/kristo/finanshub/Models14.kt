package no.kristo.finanshub

/* ---------------- Prompt 14: hjelpere for Papir (farger, transportører, Finn og Sporing) ---------------- */

/** Filtrene i Papir → Finn. */
val FINN_SEGS: List<Pair<String, String>> = listOf("all" to "Alle", "way" to "På vei", "bought" to "Kjøpt", "sold" to "Solgt", "done" to "Fullført")

fun finnSegMatch(seg: String, d: FinnDeal): Boolean = when (seg) {
    "way" -> d.level in 2..3
    "bought" -> !d.sold
    "sold" -> d.sold
    "done" -> d.finished
    else -> true
}
