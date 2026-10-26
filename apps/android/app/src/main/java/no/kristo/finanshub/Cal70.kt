package no.kristo.finanshub

import org.json.JSONObject

/*
 * Prompt 70 (GLIMTCAL70, claude-code-glimt-kalender-ikke-spor.md): Glimt legger avtalen rett i standardkalenderen og bekrefter
 * med kort A. Serveren sender kortdata i actions[].result.card70 (POST /api/glimt/agent og /stream) eller card {k:'cal70', …}
 * (/api/assist). Her: data og kall (PATCH move.url {calendarId}, POST undo.url). Visningen ligger i ui/Cal70Card.kt.
 */

/** card70 fra en utført calendar.create som kort ({k:'cal70', …}), ellers null. */
fun cal70Of(a0: JSONObject?): JSONObject? {
    if (a0 == null || a0.optString("tool") != "calendar.create" || a0.optString("status") != "done") return null
    val c = a0.optJSONObject("result")?.optJSONObject("card70") ?: return null
    if (c.optString("eventId").isBlank()) return null
    return JSONObject(c.toString()).put("k", "cal70")
}

data class Cal70Cal(val id: String, val name: String, val color: String, val sub: String)

data class Cal70(
    val eventId: String, val title: String, val date: String, val mon: String, val n: Int, val wd: String, val line: String, val withText: String,
    val calId: String, val calName: String, val calColor: String, val calendars: List<Cal70Cal>, val reminder: String,
    val undoMethod: String, val undoPath: String, val movePath: String, val ttlMs: Long, val timeText: String, val place: String,
) {
    /** «tor 17. des · 17:30–20:15 · Colosseum Kino · med pappa» (kort C i Kalender-farger). */
    val kalLine: String get() = listOf("$wd $n. ${mon.lowercase()}", timeText, place, withText.lowercase()).filter { it.isNotBlank() }.joinToString(" · ")

    companion object {
        private fun JSONObject.s(k: String): String = if (has(k) && !isNull(k)) optString(k) else ""
        /** «/api/glimt/agent/…» → «/glimt/agent/…» (Api.request legger på /api). */
        fun apiPath(u: String): String = if (u.startsWith("/api/")) u.removePrefix("/api") else u

        fun parse(o: JSONObject?): Cal70? {
            if (o == null) return null
            val id = o.s("eventId").ifBlank { return null }
            val day = o.optJSONObject("day") ?: JSONObject()
            val cal = o.optJSONObject("calendar") ?: JSONObject()
            val who = o.optJSONArray("with")?.optString(0).orEmpty()
            val arr = o.optJSONArray("calendars")
            val cals = (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                val x = arr?.optJSONObject(i) ?: return@mapNotNull null
                val sub = when {
                    x.optBoolean("suggested", false) -> if (who.isBlank()) "Foreslått" else "Foreslått · du nevnte $who"
                    x.optBoolean("default", false) -> "Standardkalender"
                    else -> x.s("source")
                }
                Cal70Cal(x.s("id"), x.s("name"), x.s("color").ifBlank { "#7a7468" }, sub)
            }
            val undo = o.optJSONObject("undo") ?: JSONObject()
            return Cal70(
                eventId = id, title = o.s("title"), date = o.s("date"), mon = day.s("mon"), n = day.optInt("n", 0), wd = day.s("wd"),
                line = o.s("line"), withText = o.s("withText"), calId = cal.s("id"), calName = cal.s("name").ifBlank { cal.s("id") },
                calColor = cal.s("color").ifBlank { "#b23a2a" }, calendars = cals, reminder = o.optJSONObject("reminder")?.s("label")?.ifBlank { null } ?: "Varsel 1 t før",
                undoMethod = undo.s("method").ifBlank { "POST" }, undoPath = apiPath(undo.s("url")), movePath = apiPath(o.optJSONObject("move")?.s("url").orEmpty()),
                ttlMs = undo.optLong("ttlMs", 10_000L), timeText = o.s("timeText"), place = o.s("place"),
            )
        }

        /** «{dato}» i valgknappens tekst → «17.12.2026». */
        fun fill(text: String, d: java.time.LocalDate): String = text.replace("{dato}", "%02d.%02d.%04d".format(d.dayOfMonth, d.monthValue, d.year))
    }
}

/** Flytt avtalen (B: valg i lista inne i kortet). → nytt kort eller feiltekst. */
suspend fun AppViewModel.move70(c: Cal70, calendarId: String): Pair<Cal70?, String?> = try {
    val raw = api45 { request("PATCH", c.movePath, JSONObject().put("calendarId", calendarId), prefix = Api.HOMELAB) }
    reloadKal27()
    (Cal70.parse(JSONObject(raw).optJSONObject("card70")) ?: c) to null
} catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { null to (e.message ?: "Fikk ikke flyttet avtalen") }

/** Angre (10 s). → null når det gikk, ellers feiltekst. */
suspend fun AppViewModel.undo70(c: Cal70): String? = try {
    api45 { request(c.undoMethod, c.undoPath, JSONObject(), prefix = Api.HOMELAB) }
    reloadKal27()
    null
} catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { e.message ?: "Fikk ikke angret" }
