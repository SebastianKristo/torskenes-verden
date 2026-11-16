@file:JvmName("DomeneMedia")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/*
 * Media: kode som lå i blandingsfilene (P43.kt, P44.kt, P46.kt, Models13.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Modeller ======================= */

data class MSvc43(val key: String, val name: String, val configured: Boolean, val ok: Boolean, val version: String?, val ms: Int?, val error: String?)

data class MUp43(
    val key: String, val kind: String, val refId: Int?, val title: String, val code: String?, val epTitle: String?,
    val day: String, val time: String?, val status: String, val progress: Int?, val poster: String?, val color: Long?,
    /** Prompt 50: plakat med ThumbHash og faste bredder fra /api/media/bilde. */
    val posterImg: MImg50? = null,
)

data class MItem43(
    val id: Int, val kind: String, val title: String, val year: Int?, val network: String?, val status: String?, val ended: Boolean,
    val monitored: Boolean, val profileId: Int?, val profile: String?, val have: Int, val total: Int, val missing: Int,
    val poster: String?, val color: Long?, val exists: Boolean, val tvdbId: Int?, val tmdbId: Int?, val overview: String?,
    val hasFile: Boolean, val availability: String?, val seriesType: String?, val monitor: String?, val fileLine: String?, val playUrl: String?,
    /** Prompt 44: filmfilens id (Slett fil) og fanart (banner). */
    val fileId: Int? = null, val fanart: String? = null,
    /** Prompt 50: posterImg/fanartImg {url, hash, w, h, srcset} (ThumbHash-plassholder, riktig bredde). */
    val posterImg: MImg50? = null, val fanartImg: MImg50? = null,
)

data class MEp43(val id: Int, val n: Int, val title: String, val air: String?, val hasFile: Boolean, val monitored: Boolean, val status: String, val fileId: Int? = null /* prompt 44 */)

data class MSeason43(val n: Int, val monitored: Boolean, val eps: List<MEp43>)

data class MRel43(
    val guid: String, val indexerId: Int?, val title: String, val quality: String, val size: Long, val seeders: Int, val peers: Int,
    val indexer: String, val langs: String, val subs: String, val age: String?, val rejected: List<String>, val best: Boolean,
)

data class MRelRes43(val items: List<MRel43>, val ms: Int?, val indexers: Int?)

data class MTor43(
    val hash: String, val name: String, val progress: Float, val state: String, val dl: Long, val ul: Long, val eta: Long?, val size: Long?,
    val category: String?, val poster: String?, val color: Long?, val sub: String?,
    val posterImg: MImg50? = null, // prompt 50
)

data class MTransfer43(val dl: Long, val ul: Long, val alt: Boolean, val limit: Long?, val queued: Int?)

data class MFile43(val id: Int, val name: String, val size: Long, val progress: Float, val on: Boolean)

data class MIdx43(val id: Int, val name: String, val ok: Boolean, val ms: Int?, val queries: Int?, val grabs: Int?, val error: String?, val privacy: String?, val protocol: String?)

data class MApp43(val id: Int, val name: String)

data class MSchema43(
    val key: String, val name: String, val privacy: String, val language: String?, val categories: String?, val protocol: String,
    val login: String, val added: Boolean, val raw: JSONObject,
)

data class MDisk43(val path: String, val label: String?, val free: Long?, val total: Long?)

data class MProfile43(val id: Int, val name: String)

data class MGlimt43(val q: String, val text: String, val steps: List<String>, val results: List<JSONObject>, val actions: List<JSONObject>)

class P43State {
    /* Media */
    var mediaOpen by mutableStateOf(false)
    var tab by mutableStateOf("snart")
    var missing by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var services by mutableStateOf<List<MSvc43>>(emptyList())
    var upcoming by mutableStateOf<List<MUp43>?>(null)
    var series by mutableStateOf<List<MItem43>?>(null)
    var movies by mutableStateOf<List<MItem43>?>(null)
    var libFilter by mutableStateOf("alle")
    var profiles by mutableStateOf<Map<String, List<MProfile43>>>(emptyMap())
    var roots by mutableStateOf<Map<String, List<MDisk43>>>(emptyMap())
    var disk by mutableStateOf<List<MDisk43>>(emptyList())
    /** Åpen serie/film (detalj) og sesongene. */
    var detail by mutableStateOf<MItem43?>(null)
    var seasons by mutableStateOf<List<MSeason43>?>(null)
    var openSeason by mutableStateOf<Int?>(null)
    /** Interaktivt søk: (tittel, undertittel, query-streng) og treff. */
    var relFor by mutableStateOf<Triple<String, String, String>?>(null)
    var rel by mutableStateOf<MRelRes43?>(null)
    var relBusy by mutableStateOf(false)
    var relFilter by mutableStateOf("alle")
    var grabbed by mutableStateOf<Set<String>>(emptySet())
    /** Legg til: "tv" / "film", søk og valgt treff. */
    var add by mutableStateOf<String?>(null)
    var addQ by mutableStateOf("")
    var addRes by mutableStateOf<List<MItem43>?>(null)
    var addPick by mutableStateOf<MItem43?>(null)
    var addBusy by mutableStateOf(false)
    /** Valgark for serie/film (Profil, Overvåking, Serietype, Last ned når). */
    var optSheet by mutableStateOf<String?>(null)
    /* qBittorrent */
    var torrents by mutableStateOf<List<MTor43>?>(null)
    var transfer by mutableStateOf<MTransfer43?>(null)
    var torFilter by mutableStateOf("alle")
    var torMenu by mutableStateOf<String?>(null)
    var torDelete by mutableStateOf<String?>(null)
    var files by mutableStateOf<List<MFile43>?>(null)
    var magnetOpen by mutableStateOf(false)
    var magnet by mutableStateOf("")
    internal var rid = 0L
    /* Prowlarr */
    var indexers by mutableStateOf<List<MIdx43>?>(null)
    var apps by mutableStateOf<List<MApp43>>(emptyList())
    var testing by mutableStateOf<Set<Int>>(emptySet())
    var testRes by mutableStateOf<Map<Int, String>>(emptyMap())
    var idxAdd by mutableStateOf(false)
    var schema by mutableStateOf<List<MSchema43>?>(null)
    var schemaPick by mutableStateOf<MSchema43?>(null)
    var idxBusy by mutableStateOf(false)
    var idxErr by mutableStateOf<String?>(null)
    /* Glimt */
    var glimtOpen by mutableStateOf(false)
    var glimt by mutableStateOf<MGlimt43?>(null)
    var glimtBusy by mutableStateOf(false)
    var toast by mutableStateOf<String?>(null)

    /* Claude-import (ui/Import43.kt) */
    var impOpen by mutableStateOf(false)
    var impBusy by mutableStateOf(false)
    var impErr by mutableStateOf<String?>(null)
    var impPreview by mutableStateOf<JSONObject?>(null)
    var impPick by mutableStateOf<Set<String>>(emptySet())
    var impMemPick by mutableStateOf<Set<Int>>(emptySet())
    var impDone by mutableStateOf<String?>(null)
    var impLastId by mutableStateOf<String?>(null)

    /* Widget-galleri (ui/WidgetGalleri.kt) */
    var galleryOpen by mutableStateOf(false)
    var catalog by mutableStateOf<List<JSONObject>?>(null)
}

/* ======================= JSON (romslig) ======================= */

internal fun arr43(raw: String?, vararg keys: String): List<JSONObject> {
    val t = raw?.trim().orEmpty()
    if (t.isEmpty()) return emptyList()
    if (t.startsWith("[")) return objs34(JSONArray(t))
    val o = runCatching { JSONObject(t) }.getOrNull() ?: return emptyList()
    for (k in keys) o.optJSONArray(k)?.let { return objs34(it) }
    return emptyList()
}

internal fun JSONObject.s43(vararg k: String): String? { for (x in k) s37(x)?.let { return it }; return null }

internal fun JSONObject.i43(vararg k: String): Int? { for (x in k) if (has(x) && !isNull(x)) { val v = opt(x); if (v is Number) return v.toInt(); (v as? String)?.toIntOrNull()?.let { return it } }; return null }

internal fun JSONObject.l43(vararg k: String): Long? { for (x in k) if (has(x) && !isNull(x)) { val v = opt(x); if (v is Number) return v.toLong(); (v as? String)?.toLongOrNull()?.let { return it } }; return null }

internal fun JSONObject.d43(vararg k: String): Double? { for (x in k) if (has(x) && !isNull(x)) { val v = optDouble(x); if (!v.isNaN()) return v }; return null }

internal fun JSONObject.b43(def: Boolean, vararg k: String): Boolean { for (x in k) if (has(x) && !isNull(x)) return optBoolean(x, def); return def }

private fun JSONObject.poster43(): String? = s43("poster", "posterUrl", "image") ?: objs34(optJSONArray("images")).firstOrNull { it.s37("coverType") == "poster" }?.let { it.s43("remoteUrl", "url") }

private fun JSONObject.strs43(k: String): String {
    val a = optJSONArray(k) ?: return s37(k).orEmpty()
    return (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.s43("name", "code") ?: a.optString(i).takeIf { it.isNotBlank() } }.joinToString(" · ")
}

internal fun parseItem43(o: JSONObject, kind: String): MItem43 {
    val st = o.optJSONObject("statistics")
    val ep = o.optJSONObject("episodes") // SERVER43: episodes {have, total, missing}
    val total = ep?.i43("total") ?: o.i43("total", "episodeCount") ?: st?.i43("episodeCount", "totalEpisodeCount") ?: 0
    val have = ep?.i43("have") ?: o.i43("have", "episodeFileCount", "downloaded") ?: st?.i43("episodeFileCount") ?: 0
    val miss = ep?.i43("missing") ?: o.i43("missing") ?: (total - have).coerceAtLeast(0)
    val stat = o.s43("status")
    val file = o.optJSONObject("movieFile") ?: o.optJSONObject("file")
    val fileLine = o.s43("fileLine") ?: file?.let { f ->
        listOfNotNull(f.optJSONObject("quality")?.optJSONObject("quality")?.s37("name") ?: f.s43("quality"), f.s43("sizeText") ?: f.l43("size")?.let { size43(it) }, f.s43("relativePath", "path")).joinToString(" · ")
    }
    return MItem43(
        o.i43("id") ?: 0, kind, o.s43("title", "name") ?: "Uten tittel", o.i43("year"), o.s43("network", "studio"), stat,
        o.b43(stat == "ended", "ended"), o.b43(true, "monitored"), o.i43("qualityProfileId", "profileId"),
        o.s43("profile", "qualityProfile", "profileName"), have, total, miss, o.poster43(), hex37(o.s43("color")),
        o.b43(o.i43("id") != null && (o.i43("id") ?: 0) > 0, "exists", "added", "inLibrary"), o.i43("tvdbId"), o.i43("tmdbId"), o.s43("overview"),
        o.b43(false, "hasFile", "downloaded"), o.s43("minimumAvailability", "availability"), o.s43("seriesType", "type"), o.s43("monitor", "monitorNew"),
        fileLine, o.optJSONObject("play")?.s43("url") ?: o.s43("playUrl", "jellyfinUrl", "plexUrl"),
        fileId = file?.i43("id") ?: o.i43("movieFileId", "fileId"),
        fanart = o.s43("fanart", "fanartUrl", "banner") ?: objs34(o.optJSONArray("images")).firstOrNull { it.s37("coverType") == "fanart" }?.s43("remoteUrl", "url"),
        posterImg = parseImg50(o.optJSONObject("posterImg")), fanartImg = parseImg50(o.optJSONObject("fanartImg")),
    )
}

private fun parseEp43(o: JSONObject): MEp43 {
    val has = o.b43(false, "hasFile", "downloaded")
    val air = o.s43("airDate", "air")
    // SERVER43-koder: ok · dl · miss · stall · wait · off · ann · pause.
    val st = when (val c = o.s43("status")) { "ok" -> "downloaded"; "dl" -> "downloading"; "miss" -> "missing"; "stall" -> "stalled"; "wait", "ann" -> "upcoming"; "off" -> "unmonitored"; "pause" -> "paused"; null -> null; else -> c }
    return MEp43(o.i43("id") ?: 0, o.i43("number", "episodeNumber", "n", "episode") ?: 0, o.s43("title", "name") ?: "", air, has, o.b43(true, "monitored"),
        st ?: if (has) "downloaded" else if (air == null || air > java.time.LocalDate.now().toString()) "upcoming" else "missing",
        o.i43("episodeFileId", "fileId") ?: o.optJSONObject("episodeFile")?.i43("id")?.takeIf { it > 0 })
}

internal fun size43(b: Long): String = when {
    b >= 1L shl 40 -> String.format(java.util.Locale("nb", "NO"), "%.1f TB", b / (1L shl 40).toDouble())
    b >= 1L shl 30 -> String.format(java.util.Locale("nb", "NO"), "%.1f GB", b / (1L shl 30).toDouble())
    b >= 1L shl 20 -> "${b / (1L shl 20)} MB"
    else -> "${b / 1024} kB"
}

internal fun speed43(b: Long): String = when {
    b >= 1L shl 20 -> String.format(java.util.Locale("nb", "NO"), "%.1f MB/s", b / (1L shl 20).toDouble())
    b > 0 -> "${b / 1024} kB/s"
    else -> "0 kB/s"
}

/** Status → (norsk tekst, fargekode): ok = grønn, dl = rød, warn = gul, mut = dempet. */
internal fun status43(s: String, pct: Int? = null): Pair<String, String> = when (s.lowercase()) {
    "downloaded", "lastet", "ok", "completed", "seed" -> "Lastet ned" to "ok"
    "meta" -> "Henter metadata …" to "dl"
    "miss" -> "Mangler" to "warn"
    "stall", "error" -> "Står fast" to "warn"
    "wait" -> "Venter" to "mut"
    "off" -> "Ikke overvåket" to "mut"
    "ann" -> "Kommer" to "mut"
    "pause" -> (if (pct != null) "Pauset $pct %" else "Pauset") to "mut"
    "dl" -> (if (pct != null) "Lastes ned $pct %" else "Lastes ned") to "dl"
    "downloading", "lastes" -> (if (pct != null) "Lastes ned $pct %" else "Lastes ned") to "dl"
    "missing", "mangler" -> "Mangler" to "warn"
    "stalled", "warning", "stalleddl", "fast" -> "Står fast" to "warn"
    "paused", "pausedDL", "stoppeddl" -> "Pauset" to "mut"
    "queued", "venter", "pending" -> "Venter" to "mut"
    "unmonitored" -> "Ikke overvåket" to "mut"
    "upcoming", "kommer", "announced" -> "Kommer" to "mut"
    else -> s.replaceFirstChar { it.uppercase() } to "mut"
}

internal fun enc43(s: String) = URLEncoder.encode(s, "UTF-8")

/* ======================= Lasting ======================= */

private suspend fun AppViewModel.get43(path: String): String? = try { api43 { hlGet(path, timeout = 20_000) } } catch (e: ApiException) {
    if (e.status == 404) { p43.missing = true; null } else throw e
}

private fun AppViewModel.run43(block: suspend () -> Unit) = launch43 {
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        // Prompt 44: «Utlogget fra Homelab» / «Svarer ikke» / ingen tilgang skilles (før ble TOKEN_REFUSED vist som «ikke tilgang»).
        p43.error = mediaErr44(e)
    } catch (e: Exception) { p43.error = uiErr73(e, "Fikk ikke kontakt med Media") }
}

fun AppViewModel.openMedia43() {
    p43.mediaOpen = true
    p43.error = null
    mediaMigrate43()
    loadMedia43()
}

fun AppViewModel.closeMedia43() {
    val s = p43
    when {
        s.tab == "nrk" && nrk87.sok.ser != null -> { nrk87.sok.ser = null; nrk87.sok.serr = null } // prompt 88: tilbake fra seriesiden til søket
        s.tab == "nrk" && nrk87.valgt != null -> nrk87.valgt = null // prompt 87: tilbake fra en serie i NRK-biblioteket
        s.relFor != null -> { s.relFor = null; s.rel = null }
        s.detail != null -> { s.detail = null; s.seasons = null }
        else -> s.mediaOpen = false
    }
}

fun AppViewModel.loadMedia43() {
    loadStatus43()
    loadServers44(); loadInteg44() // prompt 44: servervalg og samme status som Innstillinger
    when (p43.tab) {
        "snart" -> loadUpcoming43()
        "sonarr" -> loadLib43("tv")
        "radarr" -> loadLib43("film")
        "qbit" -> { loadTorrents43(); loadRoots43("sonarr"); loadRoots43("radarr") }
        "prowlarr" -> loadIndexers43()
        "spill" -> loadPlayback44() // prompt 44: Avspilling
        "nrk" -> loadNrk87() // prompt 87: NRK-nedlaster
        "musikk" -> loadMusikk88() // prompt 88: Musikk (yubal)
    }
}

fun AppViewModel.loadStatus43() = run43 {
    val raw = get43("/media/status") ?: return@run43
    val o = runCatching { JSONObject(raw) }.getOrNull()
    val list = arr43(raw, "services", "items").ifEmpty {
        val src = o?.optJSONObject("services") ?: o
        src?.keys()?.asSequence()?.mapNotNull { k -> src.optJSONObject(k)?.put("key", k) }?.toList() ?: emptyList()
    }
    p43.services = list.map { x ->
        val k = x.s43("key", "id", "service") ?: ""
        // Prompt 44: SERVER44 sender samme felt som /api/integrations/status ({service, connected, state, …}).
        MSvc43(k, x.s43("name") ?: k.replaceFirstChar { it.uppercase() }, x.b43(false, "configured") || x.s43("state") == "ok" || x.s43("state") == "down",
            x.b43(false, "ok", "connected"), x.s43("version"), x.i43("ms"), x.s43("error"))
    }
}

fun AppViewModel.loadUpcoming43() = run43 {
    val raw = get43("/media/upcoming?days=7") ?: return@run43
    p43.upcoming = arr43(raw, "items", "upcoming", "calendar").map { x ->
        val at = x.s43("airDateUtc", "at", "date", "airDate", "digitalRelease") ?: ""
        val local = runCatching { java.time.OffsetDateTime.parse(at).atZoneSameInstant(java.time.ZoneId.of("Europe/Oslo")) }.getOrNull()
        val day = x.s43("day") ?: local?.toLocalDate()?.toString() ?: at.take(10)
        val time = x.s43("time") ?: local?.toLocalTime()?.toString()?.take(5)
        val s = x.i43("season", "seasonNumber"); val e = x.i43("episode", "episodeNumber")
        val code = x.s43("code") ?: if (s != null && e != null) "S%02dE%02d".format(s, e) else null
        val kind = x.s43("kind", "type") ?: if (code != null) "tv" else "film"
        val ser = x.optJSONObject("series")
        MUp43(x.s43("key", "id") ?: "$day-$code-${x.s43("title")}", if (kind.startsWith("movie") || kind == "film") "film" else "tv",
            x.i43("seriesId", "movieId", "refId"), x.s43("seriesTitle", "showTitle") ?: ser?.s43("title") ?: x.s43("title") ?: "",
            code, if (code != null) x.s43("episodeTitle", "title") else null, day, time, x.s43("status") ?: "venter",
            x.i43("progress", "pct"), x.poster43() ?: ser?.poster43(), hex37(x.s43("color") ?: ser?.s43("color")),
            parseImg50(x.optJSONObject("posterImg") ?: ser?.optJSONObject("posterImg")))
    }.sortedWith(compareBy({ it.day }, { it.time ?: "" }))
}

fun AppViewModel.loadLib43(kind: String) = run43 {
    val raw = get43(if (kind == "tv") "/media/series" else "/media/movies") ?: return@run43
    val list = arr43(raw, if (kind == "tv") "series" else "movies", "items").map { parseItem43(it, kind) }.sortedBy { it.title.lowercase() }
    if (kind == "tv") p43.series = list else p43.movies = list
    loadProfiles43(if (kind == "tv") "sonarr" else "radarr")
}

fun AppViewModel.loadProfiles43(app: String) = run43 {
    if (p43.profiles[app] != null) return@run43
    val raw = get43("/media/qualityprofiles?app=$app") ?: return@run43
    p43.profiles = p43.profiles + (app to arr43(raw, "profiles", "items", app).map { MProfile43(it.i43("id") ?: 0, it.s43("name") ?: "") })
}

fun AppViewModel.loadRoots43(app: String) = run43 {
    val raw = get43("/media/rootfolders?app=$app") ?: return@run43
    // SERVER43: {sonarr:[…], radarr:[…], disk:[{path, label, free, total, low}]}
    arr43(raw, "disk").takeIf { it.isNotEmpty() }?.let { d -> p43.disk = d.map { MDisk43(it.s43("path") ?: "", it.s43("label"), it.l43("free"), it.l43("total")) } }
    p43.roots = p43.roots + (app to arr43(raw, "rootfolders", "folders", "items", app).map {
        MDisk43(it.s43("path") ?: "", it.s43("label", "name"), it.l43("freeSpace", "free"), it.l43("totalSpace", "total"))
    })
}

fun AppViewModel.openItem43(it: MItem43) {
    val s = p43
    s.detail = it; s.seasons = null; s.openSeason = null
    run43 {
        val raw = get43((if (it.kind == "tv") "/media/series/" else "/media/movies/") + it.id) ?: return@run43
        val o0 = JSONObject(raw)
        val o = o0.optJSONObject("series") ?: o0.optJSONObject("movie") ?: o0
        if (s.detail?.id != it.id) return@run43
        s.detail = parseItem43(o, it.kind).let { n -> if (n.id == 0) n.copy(id = it.id) else n }
        if (it.kind == "tv") {
            val eps = objs34(o.optJSONArray("episodes") ?: o0.optJSONArray("episodes")).map { e -> e.i43("seasonNumber", "season") to parseEp43(e) }
            val seasons = objs34(o.optJSONArray("seasons")).map { x ->
                val n = x.i43("number", "seasonNumber", "n", "season") ?: 0
                val inner = objs34(x.optJSONArray("episodes")).map(::parseEp43)
                MSeason43(n, x.b43(true, "monitored"), (inner.ifEmpty { eps.filter { e -> e.first == n }.map { e -> e.second } }).sortedByDescending { e -> e.n })
            }.filter { x -> x.n > 0 || x.eps.isNotEmpty() }.sortedByDescending { x -> x.n }
            s.seasons = seasons
            s.openSeason = seasons.firstOrNull()?.n
        }
    }
}

/** Lagrer profil/overvåking/type/tilgjengelighet (PUT). */
fun AppViewModel.saveItem43(patch: JSONObject) {
    val d = p43.detail ?: return
    if (patch.has("qualityProfileId") && !patch.has("profileId")) patch.put("profileId", patch.get("qualityProfileId")) // SERVER43 leser profileId
    run43 {
        api43 { hlPut((if (d.kind == "tv") "/media/series/" else "/media/movies/") + d.id, patch) }
        Haptics.select()
        p43.toast = "Lagret"
        openItem43(d)
        loadLib43(d.kind)
    }
}

fun AppViewModel.monitorSeason43(n: Int, on: Boolean) {
    val d = p43.detail ?: return
    p43.seasons = p43.seasons?.map { if (it.n == n) it.copy(monitored = on) else it }
    run43 { api43 { hlPut("/media/series/" + d.id, JSONObject().put("seasons", JSONArray().put(JSONObject().put("seasonNumber", n).put("monitored", on)))) } }
}

fun AppViewModel.monitorEp43(ep: MEp43, on: Boolean) {
    p43.seasons = p43.seasons?.map { s -> s.copy(eps = s.eps.map { if (it.id == ep.id) it.copy(monitored = on) else it }) }
    run43 { api43 { hlPut("/media/episodes/" + ep.id, JSONObject().put("monitored", on)) } }
}

/** Kommando: automatisk søk (episode, sesong, serie, film). */
fun AppViewModel.command43(app: String, name: String, extra: JSONObject, label: String) = run43 {
    val body = extra.put("app", app).put("service", app).put("name", name)
    val raw = api43 { hlPost("/media/command", body) }
    Haptics.select()
    p43.toast = label
    // Prompt 50: følg søket til sann status (track) i stedet for et evig «Søker».
    startTrack50(runCatching { JSONObject(raw) }.getOrNull(), body)
}

/** Prompt 44: søket kjøres som jobb med status per indekser (P44.kt → openRelease44). */
fun AppViewModel.openRelease43(title: String, sub: String, query: String) = openRelease44(title, sub, query)

fun AppViewModel.grab43(r: MRel43, app: String) = run43 {
    val o = runCatching { JSONObject(api43 { hlPost("/media/release", JSONObject().put("guid", r.guid).put("indexerId", r.indexerId ?: 0).put("service", app)) }) }.getOrNull()
    Haptics.tap()
    p43.grabbed = p43.grabbed + r.guid
    p43.toast = o?.s43("message") ?: "Sendt til qBittorrent: ${r.quality} · ${size43(r.size)}"
    if (!startTrack50(o)) trackGrab50(p43.relFor?.third) // prompt 50: følg nedlastingen etter manuelt valg
}

fun AppViewModel.lookup43(kind: String, q: String) {
    val s = p43
    s.addQ = q
    if (q.isBlank()) { s.addRes = null; return }
    s.addBusy = true
    run43 {
        try {
            val raw = get43((if (kind == "tv") "/media/series/lookup?term=" else "/media/movies/lookup?term=") + enc43(q)) ?: return@run43
            if (s.addQ == q) s.addRes = arr43(raw, "results", "items", if (kind == "tv") "series" else "movies").map { parseItem43(it, kind) }
        } finally { s.addBusy = false }
    }
    loadProfiles43(if (kind == "tv") "sonarr" else "radarr")
    loadRoots43(if (kind == "tv") "sonarr" else "radarr")
}

/** Legg til serie (POST /media/series) eller film (POST /media/movies). */
fun AppViewModel.addItem43(it: MItem43, profileId: Int?, monitor: String, type: String, avail: String, root: String?, search: Boolean) {
    val s = p43
    s.addBusy = true
    run43 {
        try {
            // SERVER43: {tvdbId|tmdbId, title, profileId, monitor, seriesType | minimumAvailability, rootFolder, searchNow}
            val b = JSONObject().put("title", it.title).put("searchNow", search)
            if (profileId != null) b.put("profileId", profileId)
            if (root != null) b.put("rootFolder", root)
            val raw = if (it.kind == "tv") {
                it.tvdbId?.let { v -> b.put("tvdbId", v) }
                b.put("monitor", monitor).put("seriesType", type)
                api43 { hlPost("/media/series", b) }
            } else {
                it.tmdbId?.let { v -> b.put("tmdbId", v) }
                b.put("minimumAvailability", avail)
                api43 { hlPost("/media/movies", b) }
            }
            Haptics.tap()
            s.toast = runCatching { JSONObject(raw).s43("message") }.getOrNull() ?: "${it.title} lagt til"
            s.add = null; s.addPick = null; s.addRes = null; s.addQ = ""
            loadLib43(it.kind)
        } finally { s.addBusy = false }
    }
}

fun AppViewModel.deleteItem43(it: MItem43, files: Boolean) = run43 {
    api43 { hlDelete((if (it.kind == "tv") "/media/series/" else "/media/movies/") + it.id + "?files=$files") }
    Haptics.dismiss()
    p43.detail = null
    p43.toast = "${it.title} slettet" + if (files) " med filene" else ""
    loadLib43(it.kind)
}

/* ---------------- qBittorrent ---------------- */

fun AppViewModel.loadTorrents43() = run43 {
    val raw = get43("/media/torrents") ?: return@run43
    val o = runCatching { JSONObject(raw) }.getOrNull()
    p43.torrents = arr43(raw, "torrents", "items").map { x ->
        // SERVER43: progress i prosent (0–100) og status-kode (dl · meta · check · queued · pause · seed · stall · error); rå qBittorrent: 0–1 og state.
        val pct = x.has("status") || x.has("progressText")
        val p = (x.d43("progress") ?: 0.0).let { if (pct) it / 100.0 else it }.toFloat()
        val raw0 = x.s43("state").orEmpty()
        val st = x.s43("status") ?: when {
            p >= 1f -> "seed"; raw0.contains("paused", true) || raw0.contains("stopped", true) -> "pause"; raw0.contains("stalled", true) -> "stall"; raw0.contains("meta", true) -> "meta"; else -> "dl"
        }
        val name = listOfNotNull(x.s43("title"), x.s43("code")?.takeIf { it != "Film" }).joinToString(" ").ifBlank { x.s43("name") ?: "" }
        MTor43(x.s43("hash") ?: "", name, p, st, x.l43("dlSpeed", "dlspeed", "dl") ?: 0, x.l43("upSpeed", "upspeed", "ul") ?: 0,
            x.l43("eta")?.takeIf { it in 1..8_640_000 }, x.l43("size", "total_size")?.takeIf { it > 0 }, x.s43("category"), x.poster43(), hex37(x.s43("color")),
            listOfNotNull(x.s43("quality"), x.s43("statusText")?.takeIf { st == "stall" || st == "meta" || st == "error" }).joinToString(" · ").ifBlank { x.s43("sub", "episode", "line") },
            parseImg50(x.optJSONObject("posterImg")))
    }
    val t = o?.optJSONObject("transfer") ?: o?.optJSONObject("transferInfo") ?: runCatching { JSONObject(get43("/media/transferinfo") ?: "{}") }.getOrNull()
    if (t != null) p43.transfer = MTransfer43(t.l43("dlSpeed", "dl_info_speed", "dl") ?: p43.torrents.orEmpty().sumOf { it.dl }, t.l43("upSpeed", "up_info_speed", "ul") ?: p43.torrents.orEmpty().sumOf { it.ul },
        t.b43(false, "use_alt_speed_limits", "alt", "altSpeed"), t.l43("alt_dl_limit", "limit", "altLimit"), t.i43("queued"))
}

/** pause / resume / recheck / forceStart / priority (top|bottom|increase|decrease). */
fun AppViewModel.torAct43(hash: String, act: String, extra: JSONObject = JSONObject()) = run43 {
    val raw = api43 { hlPost("/media/torrents/${enc43(hash)}/$act", extra) }
    runCatching { JSONObject(raw).s43("message") }.getOrNull()?.let { p43.toast = it }
    Haptics.select()
    loadTorrents43()
}

fun AppViewModel.torAll43(pause: Boolean) = run43 {
    api43 { hlPost("/media/torrents/" + if (pause) "pauseAll" else "resumeAll") }
    Haptics.tap()
    p43.toast = if (pause) "Alt er pauset" else "Alt fortsetter"
    loadTorrents43()
}

fun AppViewModel.altSpeed43() = run43 {
    val on = !(p43.transfer?.alt ?: false)
    api43 { hlPost("/media/altSpeed", JSONObject().put("on", on)) }
    Haptics.select()
    p43.transfer = p43.transfer?.copy(alt = on)
    loadTorrents43()
}

fun AppViewModel.torDelete43(hash: String, files: Boolean) = run43 {
    api43 { hlDelete("/media/torrents/${enc43(hash)}?files=$files") }
    Haptics.dismiss()
    p43.torDelete = null
    p43.toast = if (files) "Slettet med filene" else "Slettet, filene er beholdt"
    loadTorrents43()
}

fun AppViewModel.loadFiles43(hash: String) = run43 {
    p43.files = null
    val raw = get43("/media/torrents/${enc43(hash)}/files") ?: return@run43
    p43.files = arr43(raw, "files", "items").mapIndexed { i, x ->
        MFile43(x.i43("index", "id") ?: i, x.s43("name") ?: "", x.l43("size") ?: 0, ((x.d43("progress") ?: 0.0) / (if (x.has("wanted") || x.has("sizeText")) 100.0 else 1.0)).toFloat(), (x.i43("priority") ?: 1) > 0)
    }
}

fun AppViewModel.setFile43(hash: String, f: MFile43, on: Boolean) {
    p43.files = p43.files?.map { if (it.id == f.id) it.copy(on = on) else it }
    run43 { api43 { hlPost("/media/torrents/${enc43(hash)}/files", JSONObject().put("files", JSONArray().put(JSONObject().put("id", f.id).put("index", f.id).put("priority", if (on) 1 else 0)))) } }
}

/** Sjekker en magnet-lenke lokalt: (feil eller null, navn, kort hash, antall trackere). */
fun checkMagnet43(s: String, existing: List<MTor43>?): Triple<String?, String?, String?> {
    val t = s.trim()
    if (t.isEmpty()) return Triple(null, null, null)
    if (t.startsWith("http://") || t.startsWith("https://")) return Triple(null, t.substringAfterLast('/').substringBefore('?').ifBlank { "Torrent-fil" }, null)
    if (!t.startsWith("magnet:?")) return Triple("Lenken må starte med magnet:? eller https://", null, null)
    val q = t.removePrefix("magnet:?").split('&').mapNotNull { kv -> kv.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to java.net.URLDecoder.decode(it[1], "UTF-8") } }
    val xt = q.firstOrNull { it.first == "xt" && it.second.startsWith("urn:btih:") }?.second?.removePrefix("urn:btih:")
        ?: return Triple("Magnet-lenken mangler xt=urn:btih:…", null, null)
    if (existing?.any { it.hash.equals(xt, true) } == true) return Triple("Ligger allerede i qBittorrent", null, null)
    val dn = q.firstOrNull { it.first == "dn" }?.second ?: "Ukjent navn"
    val tr = q.count { it.first == "tr" }
    return Triple(null, dn, xt.take(8).lowercase() + "… · $tr trackere")
}

fun AppViewModel.addMagnet43(url: String, category: String?, paused: Boolean, sequential: Boolean, firstLast: Boolean) = run43 {
    api43 { hlPost("/media/torrents/magnet", JSONObject().put("url", url.trim()).put("category", category ?: "").put("paused", paused).put("sequential", sequential).put("firstLast", firstLast)) }
    Haptics.tap()
    p43.magnetOpen = false; p43.magnet = ""
    p43.toast = "Lagt til i qBittorrent · henter metadata …"
    p43.tab = "qbit"
    loadTorrents43()
}

/* ---------------- Prowlarr ---------------- */

fun AppViewModel.loadIndexers43() = run43 {
    val raw = get43("/media/indexers") ?: return@run43
    p43.indexers = arr43(raw, "indexers", "items").map { x ->
        val err = x.s43("error", "lastError")
        MIdx43(x.i43("id") ?: 0, x.s43("name") ?: "", x.b43(err == null, "ok", "enable"), x.i43("ms", "responseTime", "averageResponseTime"), x.i43("queries", "searches"),
            x.i43("grabs", "grabbedToday"), err, x.s43("privacy"), x.s43("protocol"))
    }
    p43.apps = runCatching { arr43(raw, "apps", "applications").map { MApp43(it.i43("id") ?: 0, it.s43("name") ?: "") } }.getOrDefault(emptyList())
}

fun AppViewModel.testIndexer43(id: Int) {
    val s = p43
    s.testing = s.testing + id
    launch43 {
        try {
            val raw = api43 { hlPost("/media/indexers/$id/test") }
            val o = runCatching { JSONObject(raw) }.getOrNull()
            val ok = o?.b43(true, "ok") ?: true
            s.testRes = s.testRes + (id to if (ok) "OK" + (o?.i43("ms")?.let { " · $it ms" } ?: "") else (o?.s43("message", "error") ?: "Feilet"))
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.testRes = s.testRes + (id to (uiErr73(e, "Feilet"))) }
        finally { s.testing = s.testing - id }
    }
}

fun AppViewModel.testAll43() { p43.indexers?.forEach { testIndexer43(it.id) } }

fun AppViewModel.syncApp43(a: MApp43) = run43 {
    api43 { hlPost("/media/apps/${a.id}/sync") } // SERVER43: POST /api/media/apps/:id/sync
    Haptics.select()
    p43.toast = "Synker til ${a.name} …"
}

fun AppViewModel.loadSchema43() = run43 {
    if (p43.schema != null) return@run43
    val raw = get43("/media/indexers/schema") ?: return@run43
    val have = p43.indexers.orEmpty().map { it.name.lowercase() }.toSet()
    p43.schema = arr43(raw, "schema", "items", "indexers").map { x ->
        val fields = objs34(x.optJSONArray("fields")).map { it.s43("name").orEmpty() }
        val login = x.s43("login", "auth") ?: when {
            fields.any { it.contains("cookie", true) } -> "cookie"
            fields.any { it.contains("apikey", true) || it.contains("apiKey") } -> "key"
            fields.any { it.contains("password", true) } -> "user"
            else -> "none"
        }
        val name = x.s43("name", "definitionName", "implementationName") ?: ""
        MSchema43(x.s43("key", "definitionName", "name") ?: name, name, x.s43("type", "privacy")?.let { if (it == "semi") "semiPrivate" else it } ?: "public", x.s43("language"),
            x.strs43("categories").ifBlank { null }, x.s43("protocol") ?: "torrent", login, x.b43(name.lowercase() in have, "added"), x)
    }.sortedBy { it.name.lowercase() }
}

fun AppViewModel.addIndexer43(sc: MSchema43, fields: Map<String, String>, priority: Int, sonarr: Boolean, radarr: Boolean) {
    val s = p43
    s.idxBusy = true; s.idxErr = null
    launch43 {
        try {
            val f = JSONObject(); fields.forEach { (k, v) -> f.put(k, v) }
            val b = JSONObject().put("key", sc.key).put("definitionName", sc.key).put("name", sc.name).put("fields", f).put("priority", priority)
                .put("apps", JSONArray().apply { if (sonarr) put("sonarr"); if (radarr) put("radarr") }).put("sonarr", sonarr).put("radarr", radarr)
            val t = runCatching { JSONObject(api43 { hlPost("/media/indexers/test", b) }) }
            t.exceptionOrNull()?.let { e -> if (e is ApiException && e.status != 404) throw e }
            t.getOrNull()?.let { o -> if (!o.b43(true, "ok")) throw ApiException(o.s43("error", "message") ?: "Testen feilet", 400) }
            val o = runCatching { JSONObject(api43 { hlPost("/media/indexers", b) }) }.getOrNull()
            Haptics.tap()
            val ms = o?.i43("ms") ?: t.getOrNull()?.i43("ms")
            s.toast = o?.s43("message") ?: ("${sc.name} lagt til" + (ms?.let { " · svarte på $it ms" } ?: "") + when { sonarr && radarr -> " · synket til Sonarr og Radarr"; sonarr -> " · synket til Sonarr"; radarr -> " · synket til Radarr"; else -> "" })
            s.idxAdd = false; s.schemaPick = null; s.schema = null
            loadIndexers43()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.idxErr = uiErr73(e, "Fikk ikke lagt til indekseren") }
        finally { s.idxBusy = false }
    }
}

/* ---------------- Glimt i Media ---------------- */

fun AppViewModel.mediaGlimt43(q: String) {
    val s = p43
    if (q.isBlank()) return
    s.glimtBusy = true; s.glimt = null
    launch43 {
        try {
            val o = JSONObject(api43 { hlPost("/media/glimt", JSONObject().put("q", q)) })
            val steps = (o.optJSONArray("steps")?.let { a -> (0 until a.length()).map { i -> a.optJSONObject(i)?.let { st -> listOfNotNull(st.s43("t", "text", "label"), st.i43("ms")?.takeIf { it > 0 }?.let { "$it ms" }, st.s43("error")).joinToString(" · ") } ?: a.optString(i) } } ?: emptyList())
            s.glimt = MGlimt43(q, o.s43("text", "answer") ?: "", steps, objs34(o.optJSONArray("results")), objs34(o.optJSONArray("actions")))
            startTrack50(o) // prompt 50: Glimt startet et søk → sann status
            if (o.optJSONArray("actions")?.length() ?: 0 > 0 || q.contains("pause", true) || q.contains("fortsett", true)) { loadTorrents43() }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.glimt = MGlimt43(q, if (e.status == 404) "Glimt i Media er ikke på serveren ennå." else (e.message ?: "Glimt svarte ikke"), emptyList(), emptyList(), emptyList())
        } catch (e: Exception) { s.glimt = MGlimt43(q, uiErr73(e, "Glimt svarte ikke"), emptyList(), emptyList(), emptyList()) }
        finally { s.glimtBusy = false }
    }
}

/**
 * En handling fra Glimt-svaret (SERVER43: {type, label, method?, path?, body?, tab?, id?, prefill?}):
 * pauseAll/resumeAll · grab/add (kalles som {method, path, body}) · open (tab + id) · edit (Legg til-arket med søket).
 */
fun AppViewModel.glimtAct43(a: JSONObject) {
    val kind = a.s43("type", "kind", "action") ?: return
    when (kind) {
        "pauseAll" -> torAll43(true)
        "resumeAll" -> torAll43(false)
        "open" -> {
            val tab = a.s43("tab") ?: "sonarr"
            val k = if (tab == "radarr") "film" else "tv"
            p43.tab = if (tab == "radarr") "radarr" else "sonarr"
            val id = a.i43("id") ?: return
            val hit = (if (k == "tv") p43.series else p43.movies)?.firstOrNull { it.id == id }
                ?: MItem43(id, k, a.s43("title") ?: "", null, null, null, false, true, null, null, 0, 0, 0, null, null, true, null, null, null, false, null, null, null, null, null)
            openItem43(hit)
        }
        "edit" -> {
            val pre = a.optJSONObject("prefill")
            val k = if (a.s43("kind") == "movie") "film" else "tv"
            p43.add = k
            lookup43(k, pre?.s43("title") ?: "")
        }
        else -> {
            val path = a.s43("path")?.removePrefix("/api") ?: (if (kind == "grab") "/media/release" else null) ?: return run { p43.toast = a.s43("label") ?: kind }
            val body = a.optJSONObject("body") ?: JSONObject()
            run43 {
                val raw = if ((a.s43("method") ?: "POST").equals("PUT", true)) api43 { hlPut(path, body) } else api43 { hlPost(path, body) }
                Haptics.tap()
                p43.toast = runCatching { JSONObject(raw).s43("message") }.getOrNull() ?: (a.s43("label") ?: "Ferdig")
                if (kind == "grab") body.s43("guid")?.let { p43.grabbed = p43.grabbed + it }
                if (kind == "add") { loadLib43("tv"); loadLib43("film") }
            }
        }
    }
}

/* ---------------- Mer-migrering ---------------- */

/** Én gang: hadde brukeren skjult den gamle Media-siden i Mer, vises den nye øverst (papir_mer_media_v2). */
fun AppViewModel.mediaMigrate43() {
    val k = "papir_mer_media_v2_" + (account?.id ?: "")
    if (account == null || prefs.bool(k)) return
    prefs.set(k, true)
    val m = b28.mer
    saveMer28(m.copy(h = m.h - "media", o = listOf("media") + (m.o - "media")))
}

/** Innstillinger → Integrasjoner (fra ⚙ i Media). */
fun AppViewModel.openIntegrations43() {
    openPaperPage("set")
    settingsPage = "integ"
}

/** Fra en magnet:-lenke (intent-filter): Media → qBittorrent med arket ferdig utfylt. */
fun AppViewModel.openMagnet43(url: String) {
    p43.tab = "qbit"
    openMedia43()
    p43.magnet = url
    p43.magnetOpen = true
}

/** Hjem-kortet Media (h43) skjules når ingenting lastes ned og ingenting kommer de neste 7 dagene (eller Media mangler). */
fun AppViewModel.homeMediaHidden43(): Boolean {
    val s = p43
    if (s.missing) return true
    val t = s.torrents ?: return false
    val u = s.upcoming ?: return false
    return t.none { it.progress < 1f } && u.isEmpty()
}

/* ======================= Modeller ======================= */

data class MServer44(val id: String, val name: String, val def: Boolean, val svc: Map<String, Boolean>)

data class Integ44(val service: String, val site: String?, val connected: Boolean, val lastOk: String?, val error: String?)

data class RelIdx44(val name: String, val state: String, val count: Int?, val ms: Int?, val error: String?)

data class PSess44(
    val id: String, val server: String, val title: String, val sub: String?, val user: String, val device: String?, val direct: Boolean,
    val tech: List<String>, val progress: Float, val poster: String?, val state: String?, val left: String?,
)

data class PHist44(val at: String, val title: String, val sub: String?, val user: String, val device: String?, val duration: String?, val pct: Int?, val poster: String?)

data class PLib44(val name: String, val kind: String?, val count: Int?, val size: Long?, val hours: Int?, val last: String?, val server: String?)

data class PStat44(val label: String, val value: String)

class P44State {
    /* Media */
    var servers by mutableStateOf<List<MServer44>>(emptyList())
    var serverId by mutableStateOf<String?>(null)
    var serverSheet by mutableStateOf(false)
    var serverNote by mutableStateOf<String?>(null)
    var integ by mutableStateOf<List<Integ44>>(emptyList())
    var errKind by mutableStateOf<String?>(null) // setup · down · token
    var libQ by mutableStateOf("")
    var relIdx by mutableStateOf<List<RelIdx44>>(emptyList())
    var relStarted by mutableStateOf(0L)
    var relFromCache by mutableStateOf<Long?>(null)
    var relFailAll by mutableStateOf(false)
    internal var relJob: Job? = null
    internal var relJobId: String? = null
    internal val relCache = HashMap<String, Pair<Long, MRelRes43>>()
    var fileAsk by mutableStateOf<Pair<String, Int>?>(null) // ("ep"|"film", id)
    var undo by mutableStateOf<Pair<String, () -> Unit>?>(null)

    /* Avspilling */
    var playTab by mutableStateOf("now")
    var playSrv by mutableStateOf("plex")
    var playMissing by mutableStateOf(false)
    var sessions by mutableStateOf<List<PSess44>?>(null)
    var history by mutableStateOf<List<PHist44>?>(null)
    var histQ by mutableStateOf("")
    var histUser by mutableStateOf<String?>(null)
    var stats by mutableStateOf<List<PStat44>?>(null)
    var statLists by mutableStateOf<List<Pair<String, List<String>>>>(emptyList())
    var libs by mutableStateOf<List<PLib44>?>(null)
    var plexPin by mutableStateOf<String?>(null)
    var plexBusy by mutableStateOf(false)
    var playErr by mutableStateOf<String?>(null)

    /* Gjøremål */
    var taskPage by mutableStateOf<String?>(null)
    var subOpen by mutableStateOf<String?>(null)
    var askDone by mutableStateOf<String?>(null)

    /* Logg inn som / eier */
    var asUsers by mutableStateOf<List<AsUser44>?>(null)
    var asSheet by mutableStateOf<AsUser44?>(null)
    var asBusy by mutableStateOf(false)
    var asName by mutableStateOf<String?>(null)
    var asColor by mutableStateOf<Long?>(null)
    var asToast by mutableStateOf<String?>(null)
    var asUndo by mutableStateOf<String?>(null)
    var owner by mutableStateOf<Owner44?>(null)
    var ownSheet by mutableStateOf(false)
    var ownStep by mutableStateOf(0)
    var ownPick by mutableStateOf<AsUser44?>(null)
    /** Kandidater fra GET /api/server/owner (device = grunnen til at personen ikke kan velges, null = kan). */
    var ownCands by mutableStateOf<List<AsUser44>?>(null)
    var ownBusy by mutableStateOf(false)
    var ownErr by mutableStateOf<String?>(null)

    /* Tidligere versjoner */
    var versions by mutableStateOf<List<Ver44>?>(null)
    var verMissing by mutableStateOf(false)
    var verSheet by mutableStateOf<Ver44?>(null)
    var verBusy by mutableStateOf(false)
    var verErr by mutableStateOf<String?>(null)
    var verMsg by mutableStateOf<String?>(null)

    /* Logger */
    var logsOpen by mutableStateOf(false)
    var logsMissing by mutableStateOf(false)
    var logsErr by mutableStateOf<String?>(null)
    var cts by mutableStateOf<List<Ct44>?>(null)
    var ct by mutableStateOf<String?>(null)
    var logQ by mutableStateOf("")
    var logLevel by mutableStateOf("alle")
    var logSince by mutableStateOf("1h")
    var live by mutableStateOf(false)
    var logs by mutableStateOf<List<Log44>?>(null)
    var groups by mutableStateOf<List<LogGroup44>?>(null)
    var logPick by mutableStateOf<Log44?>(null)
    var explain by mutableStateOf<String?>(null)
    var explainBusy by mutableStateOf(false)
    var ctAsk by mutableStateOf<Pair<String, String>?>(null)

    /* Studie → Dokumenter */
    var studyOpen by mutableStateOf(false)
    var docs by mutableStateOf<List<SDoc44>?>(null)
    var docsMissing by mutableStateOf(false)
    var doc by mutableStateOf<SDoc44?>(null)
    var docBusy by mutableStateOf(false)
    var docSteps by mutableStateOf<List<String>>(emptyList())
    var docErr by mutableStateOf<String?>(null)
    var docAnswer by mutableStateOf<String?>(null)
}

/* ======================= Felles ======================= */

internal fun enc44(s: String) = URLEncoder.encode(s, "UTF-8")

internal fun JSONObject.list44(vararg k: String): List<JSONObject> { for (x in k) optJSONArray(x)?.let { return objs34(it) }; return emptyList() }

internal fun JSONObject.strs44(k: String): List<String> {
    val a = optJSONArray(k) ?: return emptyList()
    return (0 until a.length()).mapNotNull { i -> (a.opt(i) as? JSONObject)?.s43("text", "title", "name") ?: a.optString(i).takeIf { it.isNotBlank() && it != "null" } }
}

/** Feiltekst som stemmer (claude-code-media-mobil-ikke-innlogget.md): aldri «ikke logget inn» når backend bare er treg. */
internal fun AppViewModel.mediaErr44(e: ApiException): String {
    val m = e.message.orEmpty()
    // Prompt 46: en 401 er ikke nok til «Utlogget» – den sjekkes mot /api/me først (P46.kt), og nøkkelfeil hos Sonarr/Radarr er aldri utlogging.
    mediaUpstream46(e)?.let { return it }
    return when {
        m.startsWith(Api.TOKEN_REFUSED) || e.status == 401 -> mediaAuth46(e)
        e.status == 403 -> "Du har ikke tilgang til Media. Be admin om modulen «media»."
        e.status == 502 || e.status == 503 || e.status == 504 || m.contains("svarte ikke i tide") -> { p44.errKind = "down"; "Svarer ikke: tjenesten bak Homelab svarte ikke i tide (feil ${if (e.status > 0) e.status else "tidsavbrudd"}). Prøv igjen." }
        m.contains("Fikk ikke kontakt") || m.contains("Fant ikke serveren") -> { p44.errKind = "down"; "Svarer ikke: fikk ikke kontakt med Homelab ($base). Prøv igjen." }
        else -> m.ifBlank { "Fikk ikke kontakt med Media" }
    }
}

/* ======================= Media: status og servere ======================= */

private fun msrvKey44(vm: AppViewModel) = "media_site_" + (vm.account?.id ?: "")

/** Servere (steder) for Media. Valget gjelder Sonarr, Radarr, qBittorrent og Prowlarr samtidig. */
fun AppViewModel.loadServers44() = launch44 {
    val saved = prefs.str(msrvKey44(this), "").ifBlank { null }
    if (p44.serverId == null && saved != null) { p44.serverId = saved; Api.mediaServer44 = saved }
    val raw = try { api44 { hlGet("/media/servers") } } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return@launch44
    val list = arr43(raw, "servers", "sites", "items").mapNotNull { o ->
        val id = o.s43("id", "key") ?: return@mapNotNull null
        val svc = LinkedHashMap<String, Boolean>()
        for (k in listOf("sonarr", "radarr", "qbit", "prowlarr")) {
            val v = o.opt(if (k == "qbit" && !o.has("qbit")) "qbittorrent" else k)
            svc[k] = when (v) { is JSONObject -> v.b43(true, "configured", "ok") || v.s43("url") != null; is String -> v.isNotBlank(); is Boolean -> v; null, JSONObject.NULL -> false; else -> true }
        }
        MServer44(id, o.s43("name") ?: id, o.b43(false, "default", "isDefault"), svc).also { if (saved == null && p44.serverId == null && o.b43(false, "selected")) { p44.serverId = id; Api.mediaServer44 = id } }
    }
    p44.servers = list
    val cur = p44.serverId
    if (list.isNotEmpty() && (cur == null || list.none { it.id == cur })) {
        if (cur != null) p44.serverNote = "Fant ikke valgt server – bruker ${(list.firstOrNull { it.def } ?: list.first()).name}"
        val d = list.firstOrNull { it.def } ?: list.first()
        p44.serverId = d.id; Api.mediaServer44 = d.id
    }
    val sel = list.firstOrNull { it.id == p44.serverId }
    val missing = sel?.svc?.filterValues { !it }?.keys?.map { svcName44(it) }.orEmpty()
    if (sel != null && missing.isNotEmpty() && list.size > 1) p44.serverNote = "${sel.name} mangler " + missing.joinToString(", ")
}

internal fun svcName44(k: String) = when (k) { "qbit" -> "qBittorrent"; "sonarr" -> "Sonarr"; "radarr" -> "Radarr"; "prowlarr" -> "Prowlarr"; else -> k.replaceFirstChar { it.uppercase() } }

fun AppViewModel.pickServer44(id: String) {
    p44.serverId = id; p44.serverNote = null; p44.serverSheet = false
    Api.mediaServer44 = id
    prefs.set(msrvKey44(this), id)
    Haptics.select()
    p43.series = null; p43.movies = null; p43.upcoming = null; p43.torrents = null; p43.indexers = null; p43.profiles = emptyMap(); p43.roots = emptyMap()
    p44.relCache.clear()
    launch44 { runCatching { api44 { hlPut("/media/servers/select", JSONObject().put("id", id)) } } } // lagres per bruker på serveren
    loadServers44()
    loadMedia43()
}

/** Samme status som Innstillinger → Integrasjoner (én kilde). */
fun AppViewModel.loadInteg44() = launch44 {
    val raw = try { api44 { hlGet("/integrations/status") } } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return@launch44
    val o = runCatching { JSONObject(raw) }.getOrNull()
    val arr = arr43(raw, "items", "services", "integrations").ifEmpty {
        val src = o?.optJSONObject("services") ?: o
        src?.keys()?.asSequence()?.mapNotNull { k -> src.optJSONObject(k)?.put("service", src.optJSONObject(k)?.s43("service") ?: k) }?.toList() ?: emptyList()
    }
    p44.integ = arr.map { x ->
        Integ44((x.s43("service", "key", "id") ?: "").lowercase().let { if (it == "qbittorrent") "qbit" else it }, x.s43("site", "server"),
            x.b43(false, "connected", "ok", "configured"), x.s43("lastOk"), x.s43("error"))
    }
}

/** Er tjenesten koblet til ifølge Integrasjoner (for valgt server når feltet finnes)? null = vet ikke. */
internal fun AppViewModel.integOk44(key: String): Boolean? {
    val k = if (key == "qbittorrent") "qbit" else key
    val hits = p44.integ.filter { it.service == k }
    if (hits.isEmpty()) return null
    val site = p44.serverId
    return (hits.firstOrNull { site != null && it.site == site } ?: hits.firstOrNull { it.site == null } ?: hits.first()).connected
}

/* ======================= Media: søk i biblioteket ======================= */

/** «9-1-1» = «911», uavhengig av store bokstaver og aksenter. */
internal fun norm44(s: String): String = java.text.Normalizer.normalize(s.lowercase(), java.text.Normalizer.Form.NFD)
    .replace(Regex("\\p{M}+"), "").replace(Regex("[^a-z0-9æøå]+"), "")

internal fun libMatch44(it: MItem43, q: String): Boolean {
    val n = norm44(q)
    if (n.isEmpty()) return true
    return norm44(it.title).contains(n) || norm44(it.network.orEmpty()).contains(n) || (it.year?.toString()?.contains(n) == true)
}

/* ======================= Media: interaktivt søk som jobb ======================= */

internal fun parseRel44(x: JSONObject): MRel43 {
    val q = x.optJSONObject("quality")?.optJSONObject("quality")?.s37("name") ?: x.s43("quality", "qualityName") ?: ""
    val a = x.optJSONArray("languages")
    val langs = (a?.let { (0 until it.length()).mapNotNull { i -> it.optJSONObject(i)?.s43("name", "code") ?: it.optString(i).takeIf { s -> s.isNotBlank() } }.joinToString(" · ") } ?: x.s43("language").orEmpty())
        .let { l -> if (x.b43(false, "norwegian") && !l.contains("NO")) "$l NO".trim() else l }
    val sa = x.optJSONArray("subtitles")
    val subs = (sa?.let { (0 until it.length()).mapNotNull { i -> it.optJSONObject(i)?.s43("name", "code") ?: it.optString(i).takeIf { s -> s.isNotBlank() } }.joinToString(" · ") } ?: x.s43("subs").orEmpty())
        .let { t -> if (x.b43(false, "norwegian") && !t.contains("NO")) "NO $t".trim() else t }
    return MRel43(x.s43("guid") ?: x.s43("id") ?: "", x.i43("indexerId"), x.s43("shortTitle", "title", "name") ?: "", q, x.l43("size") ?: 0L,
        x.i43("seeders", "seeds") ?: 0, x.i43("leechers", "peers") ?: 0, x.s43("indexer") ?: "", langs, subs,
        x.s43("ageText", "age")?.let { if (it.all(Char::isDigit)) "$it d" else it },
        (x.optJSONArray("rejections")?.let { r -> (0 until r.length()).map { r.optString(it) } } ?: emptyList()).filter { it.isNotBlank() },
        x.b43(false, "best", "bestForProfile"))
}

private fun parseIdx44(o: JSONObject?): List<RelIdx44> = objs34(o?.optJSONArray("indexers")).map { x ->
    val st = (x.s43("status", "state") ?: if (x.has("error") && !x.isNull("error")) "fail" else if (x.has("count")) "ok" else "run").lowercase()
    RelIdx44(x.s43("name", "indexer") ?: "Indekser", when (st) { "done", "ok", "ferdig" -> "ok"; "fail", "failed", "error", "timeout" -> "fail"; else -> "run" },
        x.i43("count", "results", "hits"), x.i43("ms", "tookMs"), x.s43("error"))
}

/** Erstatter openRelease43: jobb + poll, reserve med lang lesetid, nytt forsøk ved 502/503/504, cache 10 min. force = «Søk igjen». */
fun AppViewModel.openRelease44(title: String, sub: String, query: String, force: Boolean = false) {
    val s = p43; val t = p44
    t.relJob?.cancel()
    s.relFor = Triple(title, sub, query); s.relFilter = "alle"
    t.relIdx = emptyList(); t.relFailAll = false; t.relFromCache = null
    val key = (p44.serverId ?: "") + "|" + query
    val hit = t.relCache[key]
    if (!force && hit != null && System.currentTimeMillis() - hit.first < 10 * 60_000L) {
        s.rel = hit.second; s.relBusy = false; t.relFromCache = hit.first; return
    }
    s.rel = null; s.relBusy = true; t.relStarted = System.currentTimeMillis()
    t.relJob = launchJob44 {
        try {
            val res = searchJob44(query) ?: searchDirect44(query)
            if (s.relFor?.third == query) {
                s.rel = res
                t.relCache[key] = System.currentTimeMillis() to res
                t.relFailAll = res.items.isEmpty() && t.relIdx.isNotEmpty() && t.relIdx.all { it.state == "fail" }
            }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (s.relFor?.third == query) { s.rel = MRelRes43(emptyList(), null, null); t.relFailAll = true; p43.error = mediaErr44(e) }
        } catch (e: Exception) {
            if (s.relFor?.third == query) { s.rel = MRelRes43(emptyList(), null, null); t.relFailAll = true; p43.error = e.message }
        } finally { if (s.relFor?.third == query) s.relBusy = false }
    }
}

fun AppViewModel.cancelRelease44() {
    p44.relJob?.cancel(); p43.relBusy = false; if (p43.rel == null) p43.rel = MRelRes43(emptyList(), null, null)
    p44.relJobId?.let { id -> p44.relJobId = null; launch44 { runCatching { api44 { hlDelete("/media/release/search/" + enc44(id)) } } } }
}

/** POST /api/media/release/search {episodeId|movieId|seriesId, season} → {jobId}; poll GET …/search/:jobId til done (maks 180 s). null = finnes ikke (404). */
private suspend fun AppViewModel.searchJob44(query: String): MRelRes43? {
    val body = JSONObject()
    query.split('&').forEach { kv -> val k = kv.substringBefore('='); val v = kv.substringAfter('=', ""); body.put(k, v.toIntOrNull() ?: v) }
    body.put("kind", if (query.startsWith("movieId")) "movie" else "episode")
    val start = try { JSONObject(api44 { hlPost("/media/release/search", body) }) } catch (e: ApiException) {
        if (e.status == 404 || e.status == 405) return null else throw e
    }
    // Svaret kan være ferdig med en gang (cache på serveren).
    if (start.has("releases") || start.has("items")) return relRes44(start)
    val id = start.s43("jobId", "id") ?: return null
    p44.relJobId = id
    val t0 = System.currentTimeMillis()
    while (System.currentTimeMillis() - t0 < 180_000L) {
        delay(1200)
        val raw = try { api44 { hlGet("/media/release/search/" + enc44(id), timeout = 15_000) } } catch (e: ApiException) {
            if (e.status in listOf(502, 503, 504)) continue
            if (e.status == 404 && p43.rel == null) return null // annen poll-form på serveren: bruk det direkte søket
            throw e
        }
        val o = JSONObject(raw)
        p44.relIdx = parseIdx44(o)
        // SERVER44 (jobOut): delvise treff i `partial` mens state = running, ferdig liste i `result.items`.
        val res = o.optJSONObject("result")
        val part = if (res != null) relRes44(res) else MRelRes43(o.list44("partial", "releases", "items").map(::parseRel44), o.i43("elapsedMs"), o.i43("indexersTotal"))
        if (part.items.isNotEmpty()) p43.rel = part
        val st = o.s43("status", "state")?.lowercase()
        if (st == "failed" || st == "error" || st == "cancelled") { if (o.b43(false, "allFailed")) p44.relFailAll = true; return part }
        if (st == "done" || st == "ferdig" || o.b43(false, "done")) return part
    }
    return p43.rel ?: MRelRes43(emptyList(), (System.currentTimeMillis() - t0).toInt(), null)
}

private fun relRes44(o: JSONObject): MRelRes43 =
    MRelRes43(o.list44("releases", "items", "results").map(::parseRel44), o.i43("tookMs", "ms", "took"), o.i43("indexersTotal", "indexers", "indexerCount") ?: objs34(o.optJSONArray("indexers")).size.takeIf { it > 0 })

/** Eldre server: ett kall med 180 s lesetid og ett nytt forsøk etter 2 s ved 502/503/504. */
private suspend fun AppViewModel.searchDirect44(query: String): MRelRes43 {
    var tries = 0
    while (true) {
        try {
            val t0 = System.currentTimeMillis()
            val raw = api44 { request("GET", "/media/release?$query", prefix = Api.HOMELAB, timeout = 15_000, read = 180_000) }
            val o = runCatching { JSONObject(raw) }.getOrNull()
            val items = arr43(raw, "releases", "items").map(::parseRel44)
            p44.relIdx = parseIdx44(o)
            return MRelRes43(items, o?.i43("tookMs", "ms", "took") ?: (System.currentTimeMillis() - t0).toInt(), o?.i43("indexersTotal", "indexers", "indexerCount"))
        } catch (e: ApiException) {
            if (tries == 0 && e.status in listOf(502, 503, 504)) { tries++; delay(2000); continue }
            throw e
        }
    }
}

/* ======================= Media: last ned på nytt / slett fil ======================= */

fun AppViewModel.deleteEpFile44(ep: MEp43) {
    val d = p43.detail ?: return
    val fid = ep.fileId
    launch44 {
        try {
            // SERVER44: DELETE /api/media/episodes/:id/file (slår også av overvåking og gir undo).
            try { api44 { hlDelete("/media/episodes/${ep.id}/file") } } catch (e: ApiException) { if (e.status == 404 && fid != null) api44 { hlDelete("/media/episodefile/$fid") } else throw e }
            runCatching { api44 { hlPut("/media/episodes/" + ep.id, JSONObject().put("monitored", false)) } }
            Haptics.dismiss()
            p43.seasons = p43.seasons?.map { s -> s.copy(eps = s.eps.map { if (it.id == ep.id) it.copy(hasFile = false, monitored = false, status = "unmonitored") else it }) }
            p44.undo = "E%02d slettet · overvåking av".format(ep.n) to { monitorEp43(ep, true) }
            openItem43(d)
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            p43.error = if (e.status == 403) "Bare admin kan slette filer." else mediaErr44(e)
        } catch (e: Exception) { p43.error = e.message }
    }
}

fun AppViewModel.deleteMovieFile44() {
    val d = p43.detail ?: return
    launch44 {
        try {
            try { api44 { hlDelete("/media/movies/${d.id}/file") } } catch (e: ApiException) { if (e.status == 404 && d.fileId != null) api44 { hlDelete("/media/moviefile/${d.fileId}") } else throw e }
            runCatching { api44 { hlPut("/media/movies/" + d.id, JSONObject().put("monitored", false)) } }
            Haptics.dismiss()
            p44.undo = "Filen til ${d.title} er slettet" to { saveItem43(JSONObject().put("monitored", true)) }
            openItem43(d)
            loadLib43("film")
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            p43.error = if (e.status == 403) "Bare admin kan slette filer." else mediaErr44(e)
        } catch (e: Exception) { p43.error = e.message }
    }
}

/* ======================= Avspilling (Plex / Jellyfin) ======================= */

private suspend fun AppViewModel.getPlay44(path: String): String? = try { api44 { hlGet(path, timeout = 15_000) } } catch (e: ApiException) {
    if (e.status == 404) { p44.playMissing = true; null } else throw e
}

private fun AppViewModel.runPlay44(block: suspend () -> Unit) = launch44 {
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) { p44.playErr = mediaErr44(e) } catch (e: Exception) { p44.playErr = e.message }
}

private fun dur44(sec: Long?): String? = sec?.let { if (it >= 3600) "${it / 3600} t ${(it % 3600) / 60} min" else "${it / 60} min" }

fun AppViewModel.loadPlayback44() {
    p44.playErr = null
    when (p44.playTab) {
        "now" -> runPlay44 {
            val raw = getPlay44("/playback/sessions?server=" + p44.playSrv) ?: return@runPlay44
            p44.sessions = arr43(raw, "sessions", "items").map { x ->
                val tech = x.strs44("chips").ifEmpty { x.strs44("tech") }.ifEmpty {
                    listOfNotNull(x.s43("resolution", "quality"), x.s43("video", "videoCodec"), x.s43("audio", "audioCodec"), x.l43("bitrate")?.let { "${it / 1000} Mbit/s" }, x.s43("transcodeLine"))
                }
                val pos = x.d43("progress", "percent") ?: 0.0
                PSess44(x.s43("id", "sessionKey") ?: "", x.s43("server") ?: p44.playSrv, x.s43("title", "grandparentTitle") ?: "", x.s43("subtitle", "sub", "episode"),
                    x.s43("user", "userName", "username") ?: "", x.s43("device", "player", "platform"),
                    !(x.b43(false, "transcode", "transcoding") || x.s43("decision")?.contains("transcode", true) == true), tech,
                    (if (pos > 1.0) pos / 100.0 else pos).toFloat(), x.s43("poster", "thumb"), x.s43("state"), x.s43("remainingText", "left", "remaining") ?: dur44(x.l43("leftSec", "remainingSec")))
            }
        }
        "hist" -> runPlay44 {
            val q = buildString {
                append("/playback/history?server=").append(p44.playSrv)
                if (p44.histQ.isNotBlank()) append("&q=").append(enc44(p44.histQ))
                p44.histUser?.let { append("&user=").append(enc44(it)) }
            }
            val raw = getPlay44(q) ?: return@runPlay44
            p44.history = arr43(raw, "items", "history", "plays").map { x ->
                PHist44(x.s43("whenText", "at", "started", "date", "when") ?: "", x.s43("title", "item") ?: "", x.s43("subtitle", "sub", "episode"), x.s43("user") ?: "", x.s43("device", "platform"),
                    x.s43("durationText") ?: dur44(x.l43("duration", "durationSec")), x.i43("percent", "pct"), x.s43("poster", "thumb"))
            }
        }
        "stats" -> runPlay44 {
            val raw = getPlay44("/playback/stats?server=" + p44.playSrv) ?: return@runPlay44
            val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@runPlay44
            val kpi = o.list44("kpis", "cards").map { PStat44(it.s43("label", "name") ?: "", it.s43("value", "text") ?: "") }.ifEmpty {
                listOfNotNull((o.i43("total", "plays", "playsWeek"))?.let { PStat44("Avspillinger", "$it") }, o.d43("hours", "hoursWeek")?.let { PStat44("Timer", "%.0f".format(it)) },
                    (o.i43("users", "activeUsers") ?: o.optJSONArray("topUsers")?.length())?.let { PStat44("Brukere", "$it") })
            }
            p44.stats = kpi
            p44.statLists = listOf("topShows" to "Mest sette serier", "topUsers" to "Mest aktive brukere", "platforms" to "Plattformer").mapNotNull { (k, n) ->
                val a = o.optJSONArray(k) ?: o.optJSONArray(if (k == "topShows") "topSeries" else k) ?: return@mapNotNull null
                n to (0 until a.length()).mapNotNull { i ->
                    val x = a.optJSONObject(i) ?: return@mapNotNull a.optString(i).takeIf { it.isNotBlank() }
                    listOfNotNull(x.s43("name", "title", "user", "platform"), x.s43("hoursText", "value", "text") ?: x.i43("plays", "count")?.let { "$it avspillinger" } ?: x.i43("pct")?.let { "$it %" } ?: x.d43("hours")?.let { "%.0f t".format(it) }).joinToString(" · ")
                }
            }
        }
        else -> runPlay44 {
            val raw = getPlay44("/playback/libraries?server=" + p44.playSrv) ?: return@runPlay44
            p44.libs = arr43(raw, "libraries", "items").map { x ->
                PLib44(x.s43("title", "name") ?: "", x.s43("type", "kind"), x.i43("count", "items"), x.l43("size", "bytes"), x.i43("hours", "playHours"), x.s43("lastAdded", "last"), x.s43("server"))
            }
        }
    }
}

/** «Logg inn med Plex»: PIN-flyt. Nettleseren åpnes på authUrl, appen spør hvert 2. s (maks 5 min). */
fun AppViewModel.plexLogin44(open: (String) -> Unit) = launch44 {
    p44.plexBusy = true; p44.playErr = null
    try {
        val o = JSONObject(api44 { hlPost("/playback/plex/pin") })
        val id = o.s43("id") ?: throw ApiException("Plex svarte uten PIN")
        p44.plexPin = o.s43("code")
        o.s43("authUrl", "url")?.let(open)
        val t0 = System.currentTimeMillis()
        while (System.currentTimeMillis() - t0 < 5 * 60_000L) {
            delay(2000)
            val r = runCatching { JSONObject(api44 { hlGet("/playback/plex/pin/" + enc44(id)) }) }.getOrNull() ?: continue
            if (r.s43("status") == "ok" || r.b43(false, "ok", "done", "connected", "authorized") || r.s43("authToken") != null) {
                p44.plexPin = null; p43.toast = r.s43("message") ?: "Logget inn med Plex"; Haptics.success(); loadPlayback44(); return@launch44
            }
            if (r.s43("status") == "expired" || r.b43(false, "expired")) break
        }
        p44.playErr = "Plex-koden utløp. Prøv igjen."
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        p44.playErr = if (e.status == 404) "Avspilling finnes ikke på serveren ennå. Oppdater Homelab." else mediaErr44(e)
    } catch (e: Exception) { p44.playErr = e.message } finally { p44.plexBusy = false; p44.plexPin = null }
}

/* ======================= Media: logg over kall ======================= */

data class MediaCall46(val at: Long, val method: String, val url: String, val status: Int, val auth: Boolean, val ms: Long, val err: String?)

/** De siste 30 Media-/Avspilling-kallene (fylles av Api.request). Tokenet logges aldri, bare om Authorization var med. */
object MediaLog46 {
    private val list = ArrayDeque<MediaCall46>()
    @Synchronized fun add(method: String, url: String, status: Int, auth: Boolean, ms: Long, err: String?) {
        list.addLast(MediaCall46(System.currentTimeMillis(), method, url.substringBefore("token="), status, auth, ms, err?.take(160)))
        while (list.size > 30) list.removeFirst()
        android.util.Log.i("Media46", "$method $url → $status (${ms} ms, auth=${if (auth) "ja" else "nei"})" + (err?.let { " · $it" } ?: ""))
    }
    @Synchronized fun recent(): List<MediaCall46> = list.toList().asReversed()
}

/* ======================= Media: 401 kontrolleres før «Utlogget» ======================= */

private val PATH46 = Regex("""\((/[^)]*)\)""")

private val HM46 = DateTimeFormatter.ofPattern("HH:mm:ss")

/**
 * Kalles fra mediaErr44 når et Media-kall fikk 401 (eller TOKEN_REFUSED). Returnerer teksten som vises med en gang, og sjekker i
 * bakgrunnen om innloggingen faktisk er ugyldig (GET /api/me med samme token). Bare da blir det «Utlogget fra Homelab».
 */
internal fun AppViewModel.mediaAuth46(e: ApiException): String {
    val path = PATH46.find(e.message.orEmpty())?.groupValues?.getOrNull(1)?.removePrefix("/api") ?: "/media"
    p46.mediaWhen = LocalTime.now().format(HM46)
    if (e.code == "HOMELAB_AUTH") { p44.errKind = "token"; p46.mediaKind = "token"; return UTLOGGET46 }
    p44.errKind = "check"; p46.mediaKind = "check"
    val seq = ++p46.mediaCheckSeq
    launch46 {
        val ok = try { api46 { hlGet("/me", timeout = 8_000) }; true } catch (x: CancellationException) { throw x } catch (x: ApiException) {
            if (x.status == 401 || x.status == 403 && x.message?.startsWith(Api.TOKEN_REFUSED) == true) false else null
        } catch (x: Exception) { null }
        if (seq != p46.mediaCheckSeq) return@launch46
        when (ok) {
            false -> { p44.errKind = "token"; p46.mediaKind = "token"; if (p43.error != null) p43.error = UTLOGGET46; if (p44.playErr != null) p44.playErr = UTLOGGET46 }
            true -> {
                p44.errKind = "route"; p46.mediaKind = "route"
                val t = "Serveren avviste $path (401), men du er logget inn – resten av appen virker. Ruten finnes trolig ikke " +
                    "i Homelab-versjonen på serveren. Oppdater Homelab, eller trykk «Vis detaljer»."
                if (p43.error != null) p43.error = t
                if (p44.playErr != null) p44.playErr = t
            }
            null -> { p44.errKind = "down"; p46.mediaKind = "down"; if (p43.error != null) p43.error = "Svarer ikke: fikk ikke kontakt med Homelab ($base) for å sjekke innloggingen. Prøv igjen." }
        }
    }
    return "Media-kallet $path ble avvist (401). Sjekker innloggingen …"
}

private const val UTLOGGET46 = "Utlogget fra Homelab: serveren godtok ikke innloggingen (også /api/me avviser den). Logg inn på nytt under Kontoer og brukere."

/** 502 fra en tjeneste bak Homelab (Sonarr/Radarr avviser nøkkelen) er aldri «Utlogget». */
internal fun AppViewModel.mediaUpstream46(e: ApiException): String? {
    val m = e.message.orEmpty()
    if (e.code != "UPSTREAM_AUTH" && !m.contains("API-nøkkel", true) && !m.contains("brukernavn eller passord", true)) return null
    p44.errKind = "upstream"; p46.mediaKind = "upstream"; p46.mediaWhen = LocalTime.now().format(HM46)
    val svc = listOf("Sonarr", "Radarr", "qBittorrent", "Prowlarr", "Plex", "Jellyfin").firstOrNull { m.contains(it, true) } ?: "Tjenesten"
    return "$svc avviser API-nøkkelen på serveren (${if (e.status > 0) e.status else "feil"}). Sjekk nøkkelen under Tilkoblinger → Media. Du er fortsatt logget inn."
}

/* ---------------- Media (GET /api/media/now og /api/media/history) ---------------- */

data class MediaItem(
    val src: String, val user: String, val show: String, val title: String, val season: Int?, val episode: Int?,
    val playedAt: String?, val poster: String?, val url: String?, val progress: Double?,
) {
    /** «Sesong 8 · Episode 21 · Long Shot» eller filmens år. */
    val line: String get() = listOfNotNull(
        if (season != null && episode != null) "Sesong $season · Episode $episode" else null, title.takeIf { it.isNotBlank() },
    ).joinToString(" · ")
}

data class MediaData(val configured: Boolean, val now: List<MediaItem>, val history: List<MediaItem>, val error: String?)

fun parseMediaItems(s: String?): Pair<Boolean, List<MediaItem>> {
    if (s.isNullOrBlank()) return false to emptyList()
    val t = s.trim()
    val o = if (t.startsWith("[")) JSONObject().put("items", JSONArray(t)).put("configured", true) else JSONObject(t)
    return o.optBoolean("configured", true) to (o.optJSONArray("items")?.map {
        MediaItem(
            it.optString("src"), it.optString("user"), it.optStr("show") ?: it.optString("title"), if (it.has("show")) it.optString("title") else "",
            it.optIntOrNull("season"), it.optIntOrNull("episode"), it.optStr("playedAt"), it.optStr("poster") ?: it.optStr("thumb"), it.optStr("url"),
            it.optDoubleOrNull("progress"),
        )
    } ?: emptyList())
}
