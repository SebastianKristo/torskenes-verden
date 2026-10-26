package no.kristo.kalender

import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

/*
 * Prompt 70 (GLIMTCAL70, claude-code-glimt-kalender-ikke-spor.md): kort C i Glimt-panelet – samme motor og kort som Hjem, i
 * Kalenders farger. /api/assist gir card {k:'cal70', …} (eller created.card70) og agent.ask. Ingen «Hvilken kalender?»-tekst:
 * spørsmål (bare når noe mangler) vises som knapper; svaret går til POST /api/glimt/agent med samme tekst og context.calendarId
 * (kalendervalg) eller teksten med datoen («{dato}» → 17.12.2026). Visningen ligger i ui/KalCal70Ui.kt.
 */

data class K70Cal(val id: String, val name: String, val color: String, val sub: String)

data class K70(
    val eventId: String, val title: String, val date: String, val line: String, val calId: String, val calName: String, val calColor: String,
    val calendars: List<K70Cal>, val undoMethod: String, val undoUrl: String, val moveUrl: String, val ttlMs: Long,
) {
    companion object {
        private fun JSONObject.s(k: String): String = if (has(k) && !isNull(k)) optString(k) else ""

        fun parse(o: JSONObject?): K70? {
            if (o == null) return null
            val id = o.s("eventId").ifBlank { return null }
            val day = o.optJSONObject("day") ?: JSONObject()
            val cal = o.optJSONObject("calendar") ?: JSONObject()
            val who = o.optJSONArray("with")?.optString(0).orEmpty()
            val d = "${day.s("wd")} ${day.optInt("n", 0)}. ${day.s("mon").lowercase()}"
            val line = listOf(d, o.s("timeText"), o.s("place"), o.s("withText").lowercase()).filter { it.isNotBlank() }.joinToString(" · ")
            val arr = o.optJSONArray("calendars")
            val cals = (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                val x = arr?.optJSONObject(i) ?: return@mapNotNull null
                val sub = when {
                    x.optBoolean("suggested", false) -> if (who.isBlank()) "Foreslått" else "Foreslått · du nevnte $who"
                    x.optBoolean("default", false) -> "Standardkalender"
                    else -> x.s("source")
                }
                K70Cal(x.s("id"), x.s("name"), x.s("color").ifBlank { "#7a7468" }, sub)
            }
            val undo = o.optJSONObject("undo") ?: JSONObject()
            return K70(id, o.s("title"), o.s("date"), line, cal.s("id"), cal.s("name").ifBlank { cal.s("id") }, cal.s("color").ifBlank { "#b23a2a" }, cals,
                undo.s("method").ifBlank { "POST" }, undo.s("url"), o.optJSONObject("move")?.s("url").orEmpty(), undo.optLong("ttlMs", 10_000L))
        }

        /** card {k:'cal70'} eller created.card70 i /api/assist-svaret. */
        fun of(a0: JSONObject): JSONObject? =
            a0.optJSONObject("card")?.takeIf { it.optString("k") == "cal70" } ?: a0.optJSONObject("created")?.optJSONObject("card70")
    }
}

/** Kalendervalg / dag fra spørsmålet: POST /api/glimt/agent {text, module:'calendar', context} → ny melding med kort C. */
fun KalVm.answer70(text: String, context: JSONObject?) {
    val s = session ?: return
    val id = System.currentTimeMillis()
    gm += KGMsg(id, true, text)
    val m = KGMsg(id + 1, false, "")
    m.q = text
    m.steps = listOf("Leser teksten", "Lagrer i kalenderen")
    gm += m
    viewModelScope.launch {
        val body = JSONObject().put("text", text).put("module", "calendar").put("requestId", "kc70$id")
        if (context != null) body.put("context", context)
        var reply: String
        try {
            val o = JSONObject(s.api.request("POST", "/api/glimt/agent", body, timeout = 8000, read = 45_000))
            reply = o.optString("reply").replace("**", "")
            val acts = o.optJSONArray("actions")
            for (i in 0 until (acts?.length() ?: 0)) acts?.optJSONObject(i)?.optJSONObject("result")?.optJSONObject("card70")?.let { m.c70 = it }
            m.ask70 = o.optJSONObject("ask")
            if (m.c70 != null) refresh()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { reply = "Glimt fikk ikke svart: " + (e.message ?: "ukjent feil"); m.err = true }
        m.step = m.steps.size
        m.full = reply
        m.thinking = false
        m.shown = m.words.size
    }
}

/** Flytt (B: lista inne i kortet). → nytt kort eller feiltekst. */
suspend fun KalVm.move70(c: K70, calendarId: String): Pair<K70?, String?> {
    val s = session ?: return null to "Ikke logget inn"
    return try {
        val raw = s.api.request("PATCH", c.moveUrl, JSONObject().put("calendarId", calendarId))
        refresh()
        (K70.parse(JSONObject(raw).optJSONObject("card70")) ?: c) to null
    } catch (e: CancellationException) { throw e } catch (e: Exception) { null to (e.message ?: "Fikk ikke flyttet avtalen") }
}

/** Angre (10 s). → null når det gikk. */
suspend fun KalVm.undo70(c: K70): String? {
    val s = session ?: return "Ikke logget inn"
    return try {
        s.api.request(c.undoMethod, c.undoUrl, JSONObject())
        refresh()
        null
    } catch (e: CancellationException) { throw e } catch (e: Exception) { e.message ?: "Fikk ikke angret" }
}

/** «Vis i uka»: lukker panelet og viser uka med avtalen. */
fun KalVm.week70(date: String) {
    val d = runCatching { LocalDate.parse(date.take(10)) }.getOrNull() ?: return
    closeGlimt()
    a = d
    setView("uke")
}
