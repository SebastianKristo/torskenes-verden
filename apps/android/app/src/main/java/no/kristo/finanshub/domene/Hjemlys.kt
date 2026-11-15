@file:JvmName("DomeneHjemlys")

package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

/*
 * Hjemlys: kode som lå i blandingsfilene (P41.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Hjemlys «Si fra» ======================= */

/** Mottakere: husstanden (uten deg selv). (userId, navn). */
fun AppViewModel.sfPeople41(): List<Pair<String, String>> {
    p41.sfPeople?.takeIf { it.isNotEmpty() }?.let { return it }
    val me = family?.me?.userId ?: p40.hl?.mine?.userId
    return (family?.members ?: emptyList()).filter { it.userId != me && it.userId.isNotBlank() }.map { it.userId to it.name }
}

fun AppViewModel.sfLastTo41(kind: String): Set<String>? = p41.sfLast[kind]?.takeIf { it.isNotEmpty() } ?: prefs41().getStringSet("sf_to_$kind", null)

/** GET /api/hjemlys/recipients → {household:[{userId, name}], last:{checkin:[id], …}} (du selv er aldri med). */
fun AppViewModel.loadSfPeople41() {
    launch41 {
        val o = runCatching { JSONObject(api41 { hlGet("/hjemlys/recipients", timeout = 8_000) }) }.getOrNull() ?: return@launch41
        p41.sfPeople = objs34(o.optJSONArray("household")).mapNotNull { x -> x.s37("userId")?.let { it to (x.s37("name") ?: it) } }
        val last = o.optJSONObject("last")
        if (last != null) p41.sfLast = last.keys().asSequence().associateWith { k -> last.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet() }
    }
}

/** «+ 15 min» på Drar snart (PATCH /api/hjemlys/notice/:id {plus:15}). */
fun AppViewModel.plusNotice41(min: Int = 15) {
    val id = p41.sfNoticeId ?: return
    Haptics.select()
    val sp = appCtx40.getSharedPreferences("live41", Context.MODE_PRIVATE)
    Live41.soon(appCtx40, maxOf(sp.getLong("soonAt", System.currentTimeMillis()), System.currentTimeMillis()) + min * 60_000L, id)
    launch41 { runCatching { api41 { request("PATCH", "/hjemlys/notice/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("plus", min), prefix = Api.HOMELAB) } } }
}

/** «Drar nå» fra Drar snart (POST /api/hjemlys/notice/:id/now). */
fun AppViewModel.nowNotice41() {
    val id = p41.sfNoticeId ?: return
    Haptics.select()
    Live41.endSoon(appCtx40)
    launch41 {
        runCatching { api41 { hlPost("/hjemlys/notice/" + URLEncoder.encode(id, "UTF-8") + "/now") } }
        p41.sfSent = "«${firstName37(displayName)} drar nå» er sendt."
    }
}

/** Forslag til sted: kalenderhendelsen som pågår nå (f.eks. «Bursdag hos Mari»). */
fun AppViewModel.sfPlace41(): String? {
    val now = java.time.LocalDateTime.now()
    return kal26.events?.firstOrNull { e ->
        val st = e.start; val en = e.end
        !e.allDay && e.date == LocalDate.now() && st != null && en != null &&
            now.isAfter(e.date.atTime(st).minusMinutes(30)) && now.isBefore(e.endDate.atTime(en))
    }?.title
}

/** POST /api/hjemlys/notice {kind, place?, eta?, to:[userId], note?}. Bare beskjeden og stedet du valgte sendes, ikke posisjon. */
fun AppViewModel.sendNotice41(kind: String, place: String?, leaveMin: Int?, to: List<String>, note: String? = null, dest: String? = null) {
    val s = p41
    if (s.sfBusy) return
    if (to.isEmpty()) { s.sfErr = "Velg minst én som skal få beskjed"; return }
    s.sfBusy = true; s.sfErr = null
    val eta = leaveMin?.let { Instant.now().plusSeconds(it * 60L).toString() }
    launch41 {
        try {
            val body = JSONObject().put("kind", kind).put("to", JSONArray(to))
            place?.trim()?.takeIf { it.isNotBlank() }?.let { body.put("place", it) }
            if (kind == "leaving_soon") { body.put("leaveInMin", leaveMin ?: JSONObject.NULL); eta?.let { body.put("eta", it) } }
            // Drar nå med mål: serveren starter en vanlig Hjemlys-tur (session) med «Alt OK?» og forsinkelsesregler.
            if (kind == "leaving_now" && dest != null && dest != "none") body.put("destination", JSONObject().put("kind", dest).put("name", if (dest == "home") "Hjem" else place?.trim().orEmpty().ifBlank { "Annet sted" }))
            body.put("remember", true)
            note?.trim()?.takeIf { it.isNotBlank() }?.let { body.put("note", it) }
            val res = runCatching { JSONObject(api41 { hlPost("/hjemlys/notice", body) }) }.getOrElse { throw it }
            s.sfNoticeId = res.optJSONObject("notice")?.s37("id")
            prefs41().edit().putStringSet("sf_to_$kind", to.toSet()).apply()
            val names = sfPeople41().filter { it.first in to }.map { firstName37(it.second) }
            val who = when (names.size) { 0 -> "mottakerne"; 1 -> names[0]; 2 -> names[0] + " og " + names[1]; else -> names.take(2).joinToString(", ") + " og ${names.size - 2} til" }
            val first = firstName37(displayName)
            s.sfSent = when (kind) {
                "checkin" -> "«$first sjekket inn" + (place?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "") + "» er sendt til $who."
                "leaving_soon" -> "«$first drar om ca. ${leaveMin ?: 30} min» er sendt til $who."
                "arrived" -> "«$first er fremme» er sendt til $who."
                else -> "«$first drar nå" + (place?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "") + "» er sendt til $who."
            }
            Haptics.success()
            // Live Update: Drar snart (med «+ 15 min» / «Drar nå» og «Drar du nå?» ved tiden), Sjekket inn («● Inne 19:42», 15 min).
            when (kind) {
                "leaving_soon" -> if (leaveMin != null) Live41.soon(appCtx40, System.currentTimeMillis() + leaveMin * 60_000L, s.sfNoticeId)
                "checkin" -> Live41.checkedIn(appCtx40, place)
                "leaving_now", "arrived" -> Live41.endSoon(appCtx40)
            }
            loadHjemlys40(force = true)
            if (kind == "leaving_now" && dest != null && dest != "none") { s.sfKind = null; s.sfSent = null; p40.hlSheet = true }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.sfErr = if (e.status == 404 || e.status == 405) "Serveren har ikke «Si fra» ennå. Oppdater Homelab-serveren." else (e.message ?: "Fikk ikke sendt")
            Haptics.error()
        } catch (e: Exception) { s.sfErr = uiErr73(e, "Fikk ikke sendt"); Haptics.error() } finally { s.sfBusy = false }
    }
}
