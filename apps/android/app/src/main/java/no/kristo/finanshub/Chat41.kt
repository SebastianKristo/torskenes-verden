package no.kristo.finanshub

import org.json.JSONArray

// Prompt 41: «Glimt henter fakta». /api/chat/send legger meta.facts i svaret (vær, tid og sol per deloppgave,
// se server/chat-tools41.js). Vises som små kort under Glimt-svaret (ui/Chat41Ui.kt).

/** Ett faktum: «Vær · New York · neste time · vind 6 m/s, kast 9 m/s · Open-Meteo». */
data class ChatFact41(
    val tool: String, val place: String, val whenLabel: String, val label: String, val source: String, val failed: Boolean,
) {
    val headLine: String
        get() {
            val name = when (tool) { "weather" -> "Vær"; "time" -> "Tid"; "sun" -> "Sol"; else -> tool }
            return listOf(name, place, if (failed) "" else whenLabel).filter { it.isNotBlank() }.joinToString(" · ")
        }
}

fun parseFacts41(a: JSONArray?): List<ChatFact41> {
    if (a == null) return emptyList()
    val out = mutableListOf<ChatFact41>()
    for (i in 0 until a.length()) {
        val o = a.optJSONObject(i) ?: continue
        val label = o.optString("label", "").takeIf { it.isNotBlank() } ?: continue
        out += ChatFact41(o.optString("tool", ""), o.optString("place", ""), o.optString("when", ""), label,
            if (o.isNull("source")) "" else o.optString("source", ""), o.has("error") && !o.isNull("error"))
    }
    return out
}

/** «Brukte …»-chipene uten dem kortene allerede viser. */
fun usedWithoutFacts41(used: List<String>, facts: List<ChatFact41>): List<String> =
    if (facts.isEmpty()) used else used.filterNot { it.startsWith("Vær · ") || it.startsWith("Tid · ") || it.startsWith("Sol · ") }
