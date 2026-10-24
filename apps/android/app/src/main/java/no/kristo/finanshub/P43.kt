package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 43 (ANDROID43), kontrakten CONTRACT43.md og design_handoff_homelab/prompts/prompt-43-pakke/:
 *  - Media (claude-code-media-arr.md, fasit Media.dc.html 2a, variant mobile): Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr.
 *    All trafikk går til homelab-backend (`/api/media/...`), som er proxy med tjenestenøklene. Appen får aldri nøklene.
 *    Svarformene er ikke låst ennå (SERVER43 lager dem), så lesingen her er romslig: både `{items:[…]}`, `{series:[…]}` og rene lister
 *    godtas, og feltnavn fra Sonarr/Radarr/qBittorrent (`tvdbId`, `qualityProfileId`, `dlspeed` …) leses i tillegg til kortnavn.
 *    404 = «Media er ikke satt opp på serveren ennå».
 *  - Mer → Media erstatter «Spilles nå»; engangs-migrering papir_mer_media_v2 viser Media øverst i Mer.
 *  - Claude-import og widget-galleri: se ui/Import43.kt og ui/WidgetGallery43.kt.
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

    /* Widget-galleri (ui/WidgetGallery43.kt) */
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

private fun enc43(s: String) = URLEncoder.encode(s, "UTF-8")

/* ======================= Lasting ======================= */

private suspend fun AppViewModel.get43(path: String): String? = try { api43 { hlGet(path, timeout = 20_000) } } catch (e: ApiException) {
    if (e.status == 404) { p43.missing = true; null } else throw e
}

private fun AppViewModel.run43(block: suspend () -> Unit) = launch43 {
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        // Prompt 44: «Utlogget fra Homelab» / «Svarer ikke» / ingen tilgang skilles (før ble TOKEN_REFUSED vist som «ikke tilgang»).
        p43.error = mediaErr44(e)
    } catch (e: Exception) { p43.error = e.message ?: "Fikk ikke kontakt med Media" }
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
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.testRes = s.testRes + (id to (e.message ?: "Feilet")) }
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
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.idxErr = e.message ?: "Fikk ikke lagt til indekseren" }
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
        } catch (e: Exception) { s.glimt = MGlimt43(q, e.message ?: "Glimt svarte ikke", emptyList(), emptyList(), emptyList()) }
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

/* ======================= Claude-import (claude-code-chat-claude-import.md) ======================= */

/**
 * POST /api/chat/import/claude (multipart: file = ZIP eller conversations.json, memory = tekst) → forhåndsvisning
 * {importId, conversations, messages, projects, memory[], range, items:[{id|uuid, title|name, date|updated_at, messages, imported}]}.
 * Serveren pakker ut og leser (store eksporter); appen sender bare fila. Maks 200 MB.
 */
fun AppViewModel.claudePreview43(name: String, mime: String, data: ByteArray?, memory: String) {
    val s = p43
    s.impErr = null; s.impDone = null; s.impBusy = true
    launch43 {
        try {
            if (data != null && data.size > 200L * 1024 * 1024) throw ApiException("Fila er større enn 200 MB", 413)
            val parts = buildList {
                if (data != null) add(Api.Part("file", name, mime, data))
                add(Api.Part.text("memory", memory))
            }
            val raw = api43 { upload("/chat/import/claude", parts, prefix = Api.HOMELAB, read = 180_000) }
            val o = JSONObject(raw)
            s.impPreview = o
            s.impPick = objs34(o.optJSONArray("items") ?: o.optJSONArray("conversations")).filter { !it.b43(false, "imported", "importedBefore") }
                .mapNotNull { it.s43("id", "uuid") }.toSet()
            val mem = o.optJSONArray("memory")
            s.impMemPick = (0 until (mem?.length() ?: 0)).filter { i -> mem?.optJSONObject(i)?.let { m -> m.b43(!m.b43(false, "exists"), "selected") } ?: true }.toSet()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.impErr = if (e.status == 404) "Serveren har ikke Claude-import ennå. Oppdater Homelab." else e.message
        } catch (e: Exception) { s.impErr = e.message ?: "Fikk ikke lest fila" }
        finally { s.impBusy = false }
    }
}

fun AppViewModel.claudeCommit43(withConvs: Boolean, withMem: Boolean) {
    val s = p43
    val o = s.impPreview ?: return
    val id = o.s43("importId", "id") ?: return
    val mem = o.optJSONArray("memory")
    s.impBusy = true; s.impErr = null
    launch43 {
        try {
            val memSel = JSONArray().apply { if (withMem && mem != null) s.impMemPick.sorted().forEach { i -> mem.opt(i)?.let { put(if (it is JSONObject) it.s43("text", "t") ?: it.toString() else it.toString()) } } }
            val body = JSONObject().put("conversationIds", JSONArray(if (withConvs) s.impPick.toList() else emptyList<String>())).put("memory", memSel)
                .put("importConversations", withConvs).put("importMemory", withMem).put("skipExisting", true)
            val r = runCatching { JSONObject(api43 { hlPost("/chat/import/claude/${enc43(id)}/commit", body) }) }.getOrElse { if (it is ApiException) throw it; JSONObject() }
            val nc = r.i43("conversations", "imported") ?: if (withConvs) s.impPick.size else 0
            val nm = r.i43("memory", "memoryAdded") ?: memSel.length()
            val skipped = r.i43("skipped")
            s.impDone = r.s43("text") ?: ("✓ $nc samtaler og $nm minnepunkter importert" + (skipped?.takeIf { it > 0 }?.let { " · $it var importert før og ble hoppet over" } ?: ""))
            s.impLastId = id
            s.impPreview = null
            Haptics.tap()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = e.message ?: "Importen feilet" }
        finally { s.impBusy = false }
    }
}

fun AppViewModel.claudeUndo43() {
    val s = p43
    val id = s.impLastId ?: return
    launch43 {
        try {
            api43 { hlPost("/chat/import/claude/${enc43(id)}/undo") }
            s.impDone = "Importen er angret."
            s.impLastId = null
            Haptics.select()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = e.message ?: "Fikk ikke angret" }
    }
}


/** «Vis flere»: neste 60 samtaler fra forhåndsvisningen (GET /api/chat/import/claude/:id?offset=&limit=60). */
fun AppViewModel.claudeMore43() {
    val s = p43
    val o = s.impPreview ?: return
    val id = o.s43("importId", "id") ?: return
    val have = o.optJSONArray("items") ?: JSONArray().also { o.put("items", it) }
    launch43 {
        try {
            val r = JSONObject(api43 { hlGet("/chat/import/claude/${enc43(id)}?offset=${have.length()}&limit=60") })
            val add = objs34(r.optJSONArray("items"))
            add.forEach { have.put(it) }
            s.impPick = s.impPick + add.filter { it.b43(!it.b43(false, "imported"), "selected") }.mapNotNull { it.s43("id", "uuid") }
            s.impPreview = JSONObject(o.toString())
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = e.message }
    }
}

/** «Prøv med en eksempel-eksport» (POST /api/chat/import/claude?sample=1). */
fun AppViewModel.claudeSample43() {
    val s = p43
    s.impErr = null; s.impDone = null; s.impBusy = true
    launch43 {
        try {
            val o = JSONObject(api43 { hlPost("/chat/import/claude?sample=1", JSONObject().put("sample", true)) })
            s.impPreview = o
            s.impPick = objs34(o.optJSONArray("items")).filter { !it.b43(false, "imported") }.mapNotNull { it.s43("id", "uuid") }.toSet()
            s.impMemPick = (0 until (o.optJSONArray("memory")?.length() ?: 0)).toSet()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = e.message ?: "Fikk ikke laget eksempelet" }
        finally { s.impBusy = false }
    }
}
