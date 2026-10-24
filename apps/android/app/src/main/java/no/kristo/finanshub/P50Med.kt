package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.lifecycle.viewModelScope
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 50 (MEDAND50, claude-code-media-qbit-starter-ikke.md – klientdelen; API i SERVER50-API.md «SRVMEDIA50»):
 *  - Sann status etter søk: POST /api/media/command svarer med `track`; vi spør GET /api/media/track/:id (pollMs) til `final`
 *    og viser serverens `text` («Fant ingen utgivelser», «Sendt til qBittorrent», «Laster ned 12 % · 4,2 MB/s · 8 min»,
 *    «qBittorrent svarer ikke», «Lagt til, men stoppet» …) med handlingene Velg manuelt · Start · Innstillinger → Media · Søk igjen.
 *  - Manuelt valg i interaktivt søk: POST /api/media/track {episodeId|movieId, grabbed:true} følger nedlastingen videre.
 *  - Diagnostikk (bare admin) i Innstillinger → Media: POST /api/media/diagnostics → ledd 2–6 grønt/rødt med feilmeldingen.
 *    Nøkler/passord vises aldri (serveren sender bare «satt»/«ikke satt»).
 * Grensesnittet ligger i ui/Media50Ui.kt.
 */

data class MStep50(val id: String, val n: Int?, val title: String, val state: String, val text: String, val hint: String?, val ms: Int?, val raw: JSONObject)
data class MTrack50(
    val id: String, val service: String, val episodeIds: List<Int>, val movieIds: List<Int>, val seriesId: Int?, val season: Int?,
    val state: String, val tone: String, val text: String, val detail: String?, val progress: Float?, val actions: List<JSONObject>,
    val final: Boolean, val pollMs: Long, val steps: List<MStep50>, val at: Long,
)
data class MDiag50(val ok: Boolean, val summary: String?, val steps: List<MStep50>, val at: Long)

object Med50 {
    /** Sporinger etter id. */
    val tracks = mutableStateMapOf<String, MTrack50>()
    internal val jobs = HashMap<String, Job>()
    var diag by mutableStateOf<MDiag50?>(null)
    var diagBusy by mutableStateOf(false)
    var diagErr by mutableStateOf<String?>(null)
    /** Torrents som er startet fra appen (Start-knappen) – knappen viser «Startet». */
    val started = mutableStateMapOf<String, Boolean>()

    fun forEpisode(id: Int): MTrack50? = tracks.values.filter { id in it.episodeIds && it.episodeIds.size <= 3 }.maxByOrNull { it.at }
    fun forMovie(id: Int): MTrack50? = tracks.values.filter { id in it.movieIds }.maxByOrNull { it.at }
    /** Søk for hele serien/sesongen (flere enn 3 episoder, eller sesongsøk uten liste): én linje over sesongene. */
    fun forSeries(id: Int): MTrack50? = tracks.values.filter { it.seriesId == id && it.movieIds.isEmpty() && (it.episodeIds.size > 3 || it.episodeIds.isEmpty()) }.maxByOrNull { it.at }
}

private fun JSONArray?.ints50(): List<Int> = (0 until (this?.length() ?: 0)).mapNotNull { i -> this!!.opt(i).let { v -> (v as? Number)?.toInt() ?: v?.toString()?.toIntOrNull() } }
private fun JSONArray?.objs50(): List<JSONObject> = (0 until (this?.length() ?: 0)).mapNotNull { this!!.optJSONObject(it) }

internal fun parseStep50(o: JSONObject): MStep50 = MStep50(
    o.optString("id"), o.i43("n"), o.s43("title") ?: o.optString("id"), o.s43("state") ?: if (o.optBoolean("ok", false)) "ok" else "fail",
    o.s43("text", "message") ?: "", o.s43("hint"), o.i43("ms"), o,
)

internal fun parseTrack50(o: JSONObject, seed: MTrack50? = null): MTrack50? {
    val id = o.s43("id") ?: return null
    val prog = o.d43("progress")?.let { if (it > 1.0) it / 100.0 else it }?.toFloat()
    return MTrack50(
        id, o.s43("service") ?: seed?.service ?: "sonarr",
        o.optJSONArray("episodeIds").ints50().ifEmpty { seed?.episodeIds ?: emptyList() },
        o.optJSONArray("movieIds").ints50().ifEmpty { seed?.movieIds ?: emptyList() },
        o.i43("seriesId") ?: seed?.seriesId, o.i43("seasonNumber") ?: seed?.season,
        o.s43("state") ?: "searching", o.s43("tone") ?: "mut", o.s43("text") ?: "Søker …", o.s43("detail"), prog,
        o.optJSONArray("actions").objs50(), o.optBoolean("final", false), o.l43("pollMs") ?: 2500L,
        o.optJSONObject("diagnostics")?.optJSONArray("steps").objs50().map(::parseStep50), seed?.at ?: System.currentTimeMillis(),
    )
}

private fun seed50(extra: JSONObject): MTrack50 = MTrack50(
    "", if (extra.has("movieIds") || extra.has("movieId")) "radarr" else "sonarr",
    extra.optJSONArray("episodeIds").ints50() + listOfNotNull(extra.i43("episodeId")),
    extra.optJSONArray("movieIds").ints50() + listOfNotNull(extra.i43("movieId")),
    extra.i43("seriesId"), extra.i43("seasonNumber"), "searching", "mut", "Søker …", null, null, emptyList(), false, 2500L, emptyList(), System.currentTimeMillis(),
)

/** Etter POST /command eller /glimt (svaret har `track`) eller POST /track. → true når sporingen startet. */
fun AppViewModel.startTrack50(resp: JSONObject?, extra: JSONObject = JSONObject()): Boolean {
    val tr = resp?.optJSONObject("track") ?: resp?.takeIf { it.has("id") && it.has("state") } ?: return false
    val t = parseTrack50(tr, seed50(extra)) ?: return false
    // Et nytt søk for samme element erstatter det gamle.
    Med50.tracks.values.filter { o -> o.id != t.id && ((t.episodeIds.isNotEmpty() && o.episodeIds == t.episodeIds) || (t.movieIds.isNotEmpty() && o.movieIds == t.movieIds) ||
        (t.episodeIds.isEmpty() && t.movieIds.isEmpty() && o.seriesId == t.seriesId && o.season == t.season)) }.forEach { o -> Med50.jobs.remove(o.id)?.cancel(); Med50.tracks.remove(o.id) }
    Med50.tracks[t.id] = t
    poll50(t.id, 1200L)
    return true
}

private fun AppViewModel.poll50(id: String, first: Long) {
    Med50.jobs.remove(id)?.cancel()
    // viewModelScope direkte: AppViewModel.launch ville vist «… was cancelled» som melding når et nytt søk avbryter den gamle pollingen.
    Med50.jobs[id] = viewModelScope.launch {
        val t0 = System.currentTimeMillis()
        var wait = first
        while (System.currentTimeMillis() - t0 < 20 * 60_000L) {
            delay(wait)
            val cur = Med50.tracks[id] ?: break
            val o = try { JSONObject(api43 { hlGet("/media/track/" + URLEncoder.encode(id, "UTF-8"), timeout = 15_000) }) } catch (e: CancellationException) { throw e } catch (e: ApiException) {
                if (e.status == 404) { Med50.tracks.remove(id); break }
                null
            } catch (e: Exception) { null }
            val t = o?.let { parseTrack50(it, cur) }
            if (t != null) Med50.tracks[id] = t
            if (t?.final == true || t?.pollMs == 0L) break
            wait = (t?.pollMs ?: 3000L).coerceAtLeast(1500L)
        }
        Med50.jobs.remove(id)
    }
}

/** Interaktivt søk: utgivelsen er valgt manuelt → følg nedlastingen (query = «episodeId=12» / «movieId=3»). */
fun AppViewModel.trackGrab50(query: String?) {
    val q = query ?: return
    val body = JSONObject()
    q.split('&').forEach { kv -> val k = kv.substringBefore('='); val v = kv.substringAfter('=', ""); if (k == "episodeId" || k == "movieId") v.toIntOrNull()?.let { body.put(k, it) } }
    if (body.length() == 0) return
    body.put("grabbed", true)
    launch44 { runCatching { startTrack50(JSONObject(api43 { hlPost("/media/track", body) }), body) } }
}

/** «Start» på en stoppet torrent (qBittorrent 5.x start, reserve resume på serveren). */
fun AppViewModel.startTorrent50(hash: String, trackId: String?) {
    Med50.started[hash] = true
    launch44 {
        try {
            val o = runCatching { JSONObject(api43 { hlPost("/media/torrents/" + URLEncoder.encode(hash, "UTF-8") + "/start", JSONObject()) }) }.getOrElse { e -> Med50.started.remove(hash); throw e }
            Haptics.success()
            p43.toast = o.s43("message") ?: "Startet"
            trackId?.let { id -> Med50.tracks[id]?.let { t -> Med50.tracks[id] = t.copy(state = "starting", tone = "dl", text = "Startet · venter på fart …", actions = emptyList()) }; poll50(id, 1500L) }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) { p43.toast = e.message ?: "Fikk ikke startet torrenten" }
    }
}

/** «Søk igjen» (actions[].body fra serveren). */
fun AppViewModel.retry50(t: MTrack50, a: JSONObject) {
    val body = a.optJSONObject("body") ?: return
    launch44 {
        try {
            val r = JSONObject(api43 { hlPost((a.s43("path") ?: "/api/media/command").removePrefix("/api"), body) })
            Haptics.select()
            if (!startTrack50(r, body)) p43.toast = "Søker igjen …"
        } catch (e: CancellationException) { throw e } catch (e: ApiException) { p43.toast = e.message ?: "Fikk ikke søkt igjen" }
    }
}

/** Innstillinger → Media → Diagnostikk (bare admin): ledd 2–6. */
fun AppViewModel.runDiag50(body: JSONObject = JSONObject()) {
    if (Med50.diagBusy) return
    Med50.diagBusy = true; Med50.diagErr = null
    launch44 {
        try {
            val o = JSONObject(api43 { request("POST", "/media/diagnostics", body, prefix = Api.HOMELAB, timeout = 15_000, read = 90_000) })
            Med50.diag = MDiag50(o.optBoolean("ok", false), o.s43("summary"), o.optJSONArray("steps").objs50().map(::parseStep50), System.currentTimeMillis())
            if (Med50.diag?.ok == true) Haptics.success() else Haptics.error()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            Med50.diagErr = when (e.status) { 403 -> "Bare administrator kan kjøre diagnostikken."; 404 -> "Serveren har ikke diagnostikk ennå. Oppdater Homelab."; else -> e.message ?: "Diagnostikken svarte ikke" }
        } catch (e: Exception) { Med50.diagErr = e.message ?: "Diagnostikken svarte ikke" }
        finally { Med50.diagBusy = false }
    }
}
