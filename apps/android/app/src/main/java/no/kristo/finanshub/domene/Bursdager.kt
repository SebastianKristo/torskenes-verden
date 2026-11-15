@file:JvmName("DomeneBursdager")

package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/*
 * Bursdager: kode som lå i blandingsfilene (P35.kt, P41.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ---------------- Bursdager: velg flere Google-kalendere ---------------- */

/** g.cals i fasiten: flere kalendere (calendarIds), calendarId = den første (for eldre server og der nye bursdager skrives). */
fun AppViewModel.toggleGoogleCal35(id: String) {
    val s = bd24
    val cur = s.google.calendarIds.ifEmpty { listOfNotNull(s.google.calendarId) }
    val nx = if (id in cur) cur - id else cur + id
    val list = nx.ifEmpty { cur }
    s.google = s.google.copy(calendarIds = list, calendarId = list.firstOrNull() ?: s.google.calendarId)
    Haptics.select()
    launch35 {
        runCatching {
            api35 { hlPut("/birthdays/google", JSONObject().put("calendarId", list.firstOrNull() ?: JSONObject.NULL).put("calendarIds", JSONArray(list))
                .put("writeNew", s.google.writeNew).put("contacts", s.google.contacts)) }
        }
    }
}

/** calendarIds / cals fra GET /api/birthdays → google. */
fun calIds35(g: JSONObject): List<String> = (g.optJSONArray("calendarIds") ?: g.optJSONArray("cals"))?.let { a -> (0 until a.length()).mapNotNull { a.optString(it).takeIf { s -> s.isNotBlank() } } } ?: emptyList()

/* ======================= Bursdager: bilde av personer ======================= */

/** Kvadrat (midten), 256×256, JPEG 82 %. POST /api/birthdays/:id/photos (eldre: …/photo). Toast «Bilde lagt til for Emma». */
fun AppViewModel.bdPhoto41(b: Bd24, uri: Uri) {
    launch41 {
        try {
            val data = withContext(Dispatchers.IO) { appCtx40.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: return@launch41
            val jpeg = withContext(Dispatchers.Default) { squareJpeg36(data, 256, 82) } ?: run { message = "Kunne ikke lese bildet"; return@launch41 }
            val id = URLEncoder.encode(b.id, "UTF-8")
            val part = listOf(Api.Part("file", "bilde.jpg", "image/jpeg", jpeg))
            try { api41 { upload("/birthdays/$id/photos", part, prefix = Api.HOMELAB) } } catch (e: ApiException) {
                if (e.status == 404 || e.status == 405) api41 { upload("/birthdays/$id/photo", part, prefix = Api.HOMELAB) } else throw e
            }
            Haptics.success()
            message = "Bilde lagt til for ${firstName37(b.name)}"
            loadBirthdays24(quiet = true)
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            message = if (e.status == 404 || e.status == 405) "Serveren har ikke bilder i Bursdager ennå. Oppdater Homelab-serveren." else (e.message ?: "Fikk ikke lastet opp bildet")
        } catch (e: Exception) { message = uiErr73(e, "Fikk ikke lastet opp bildet") }
    }
}

/** «Fjern bilde»: GET …/photos → DELETE …/photos/:pid for alle (eldre: DELETE …/photo). */
fun AppViewModel.bdPhotoRemove41(b: Bd24) {
    launch41 {
        val id = URLEncoder.encode(b.id, "UTF-8")
        try {
            val raw = api41 { hlGet("/birthdays/$id/photos") }
            val t = raw.trim()
            val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("photos") ?: JSONArray()
            objs34(arr).mapNotNull { it.s37("id") ?: it.s37("pid") }.forEach { pid -> runCatching { api41 { hlDelete("/birthdays/$id/photos/" + URLEncoder.encode(pid, "UTF-8")) } } }
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) runCatching { api41 { hlDelete("/birthdays/$id/photo") } }
        } catch (_: Exception) { }
        message = "Bildet er fjernet"
        loadBirthdays24(quiet = true)
    }
}
