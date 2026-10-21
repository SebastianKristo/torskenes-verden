package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 44 (ANDROID44), kontrakten CONTRACT44.md og design_handoff_homelab/prompts/prompt-44-pakke/:
 *  - Media «ikke logget inn» på mobil (claude-code-media-mobil-ikke-innlogget.md): én kilde for status (/api/integrations/status
 *    i tillegg til /api/media/status), alt via backend med app-tokenet, og feilmeldinger som stemmer («Ikke satt opp», «Svarer ikke»,
 *    «Utlogget fra Homelab»). Før ble 401 fra /api/media gjort om til 403 (TOKEN_REFUSED) og vist som «ikke tilgang».
 *  - Interaktivt søk 504 (claude-code-media-interaktivt-sok-504.md): søk som jobb (POST /api/media/release/search → {jobId}, poll),
 *    status per indekser og delvise treff, reserve GET /api/media/release med 180 s lesetid, ett nytt forsøk ved 502/503/504, cache 10 min.
 *  - Media (claude-code-media-arr.md): felles servervalg (GET /api/media/servers, `?server=` på alle kall via Api.mediaServer44, lagres
 *    per bruker lokalt som media_site), søk i biblioteket, last ned på nytt / slett fil for episoder og filmer, fanen Avspilling.
 *  - Avspilling (claude-code-avspilling-plex-jellyfin.md): Spilles nå · Historikk · Statistikk · Biblioteker og «Logg inn med Plex» (PIN).
 *  - Gjøremål (claude-code-gjoremal-*.md): deloppgaver rett i lista, infoside i Papir-stil, synk i Innstillinger → Gjøremål.
 *  - Logg inn som (claude-code-rediger-andres-oppsett.md): impersonerings-token som midlertidig konto (as44:<id>), admin-tokenet beholdes.
 *  - Overfør eier, Tidligere versjoner (tilbakerulling), Logger (Docker) og Studie → Dokumenter.
 * Alle svarformer leses romslig (SERVER44 lager dem parallelt); 404 = «finnes ikke på serveren ennå».
 */

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
data class AsUser44(val id: String, val name: String, val role: String?, val color: Long?, val device: String?, val locked: Boolean)
data class Owner44(val id: String?, val name: String, val since: String?, val me: Boolean, val canTransfer: Boolean, val pending: String?)
data class Ver44(
    val version: String, val date: String?, val notes: String?, val hasBackup: Boolean, val backupAt: String?, val compatible: Boolean,
    val current: Boolean, val previous: Boolean,
)
data class Ct44(val id: String, val name: String, val image: String?, val state: String, val uptime: String?, val cpu: String?, val mem: String?, val restarts: Int, val errors: Int)
data class Log44(val t: String, val level: String, val ct: String, val msg: String)
data class LogGroup44(val count: Int, val msg: String, val ct: String, val last: String?)
data class SEmne44(val kode: String, val navn: String, val sp: Double?, val karakter: String?, val semester: String?)
data class SDoc44(
    val id: String, val kind: String?, val title: String, val institution: String?, val date: String?, val emner: List<SEmne44>, val snitt: String?,
    val sp: Double?, val found: List<String>, val summary: String?,
)

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

private fun enc44(s: String) = URLEncoder.encode(s, "UTF-8")
private fun JSONObject.list44(vararg k: String): List<JSONObject> { for (x in k) optJSONArray(x)?.let { return objs34(it) }; return emptyList() }
private fun JSONObject.strs44(k: String): List<String> {
    val a = optJSONArray(k) ?: return emptyList()
    return (0 until a.length()).mapNotNull { i -> (a.opt(i) as? JSONObject)?.s43("text", "title", "name") ?: a.optString(i).takeIf { it.isNotBlank() && it != "null" } }
}

/** Feiltekst som stemmer (claude-code-media-mobil-ikke-innlogget.md): aldri «ikke logget inn» når backend bare er treg. */
internal fun AppViewModel.mediaErr44(e: ApiException): String {
    val m = e.message.orEmpty()
    return when {
        m.startsWith(Api.TOKEN_REFUSED) || e.status == 401 -> { p44.errKind = "token"; "Utlogget fra Homelab: serveren godtok ikke innloggingen for Media. Logg inn på nytt under Kontoer og brukere." }
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

/* ======================= Gjøremål: deloppgaver ======================= */

fun AppViewModel.addSub44(id: String, n: String) {
    val v = n.trim()
    if (v.isEmpty()) return
    Haptics.select()
    patchTask37(id) { it.copy(subs = it.subs + TaskSub37(v, false)) }
}

/** Huk av en deloppgave. Alle avkrysset → «Fullfør «X» også?». */
fun AppViewModel.toggleSub44(id: String, i: Int) {
    Haptics.select()
    patchTask37(id) { it.copy(subs = it.subs.mapIndexed { j, x -> if (j == i) x.copy(done = !x.done) else x }) }
    val t = tasks?.items?.firstOrNull { it.id == id } ?: return
    if (!t.done && t.subs.isNotEmpty() && t.subs.all { it.done }) p44.askDone = id
}

fun AppViewModel.delSub44(id: String, i: Int) { Haptics.dismiss(); patchTask37(id) { it.copy(subs = it.subs.filterIndexed { j, _ -> j != i }) } }

/** Fullfører hovedoppgaven; resten av deloppgavene krysses av. */
fun AppViewModel.completeTask44(id: String) {
    val t = tasks?.items?.firstOrNull { it.id == id } ?: return
    if (t.subs.any { !it.done }) patchTask37(id) { it.copy(subs = it.subs.map { s -> s.copy(done = true) }) }
    if (!t.done) toggleTask37(id)
}

/* ======================= Logg inn som (impersonering) ======================= */

private const val AS_PREF44 = "as44_state"

fun AppViewModel.loadAsUsers44() = launch44 {
    val myId = runCatching { JSONObject(api44 { hlGet("/me") }).let { it.s37("id") ?: it.optJSONObject("user")?.s37("id") } }.getOrNull()
    val raw = runCatching { api44 { hlGet("/users/directory") } }.getOrNull() ?: runCatching { api44 { hlGet("/users") } }.getOrNull() ?: return@launch44
    p44.asUsers = arr43(raw, "users", "items").mapNotNull { u ->
        val id = u.s37("id") ?: u.s37("userId") ?: return@mapNotNull null
        if (id == myId) return@mapNotNull null
        AsUser44(id, u.s37("name") ?: u.s37("username") ?: id, u.s37("role"), hex37(u.s37("color")), u.s43("device", "lastDevice"), u.b43(false, "locked", "layoutLocked"))
    }
}

/** Admin → «Logg inn som X» uten passord: kortlevd token, appen lastes som X. Admin-kontoen ligger urørt i kontolista. */
fun AppViewModel.loginAs44(u: AsUser44) = launch44 {
    val admin = account ?: return@launch44
    if (admin.id.startsWith("as44:")) return@launch44
    p44.asBusy = true
    try {
        val o = JSONObject(api44 { hlPost("/admin/impersonate", JSONObject().put("userId", u.id)) })
        val tok = o.s43("token", "accessToken") ?: throw ApiException("Serveren sendte ikke noe token")
        val usr = o.optJSONObject("user")
        val acc = UserAccount("as44:" + u.id, admin.server, usr?.s37("username") ?: u.name, usr?.s37("name") ?: u.name, usr?.s37("role") ?: u.role ?: "user", tok, admin.local, admin.external)
        prefs.set(AS_PREF44, JSONObject().put("admin", admin.id).put("adminName", admin.name).put("id", acc.id).put("name", acc.name)
            .put("color", u.color ?: 0L).put("at", System.currentTimeMillis()).toString())
        p44.asName = acc.name; p44.asColor = u.color; p44.asSheet = null
        Haptics.success()
        swapAccount44(acc, null, acc.id)
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        flash(when (e.status) { 403 -> "Bare admin kan logge inn som andre (og ikke som en annen admin)."; 404 -> "Logg inn som finnes ikke på serveren ennå. Oppdater Homelab."; else -> e.message ?: "Fikk ikke logget inn" })
    } finally { p44.asBusy = false }
}

/** «Gå ut»: X-tokenet forkastes, admin-tokenet brukes igjen. */
fun AppViewModel.exitAs44(quiet: Boolean = false) {
    val st = runCatching { JSONObject(prefs.str(AS_PREF44, "")) }.getOrNull()
    val cur = account
    val adminId = st?.s37("admin") ?: accounts.firstOrNull { !it.id.startsWith("as44:") }?.id ?: return
    val name = st?.s37("name") ?: cur?.name ?: ""
    prefs.set(AS_PREF44, "")
    p44.asName = null; p44.asColor = null
    val drop = cur?.id?.takeIf { it.startsWith("as44:") } ?: st?.s37("id")
    val target = drop?.removePrefix("as44:")
    val me = st?.s37("adminName")?.let { firstName37(it) } ?: "deg selv"
    launch44 {
        // SERVER44: POST /api/admin/impersonate/exit (med X-tokenet) forkaster tokenet og svarer {changes, message, undo}.
        val r = if (cur?.id?.startsWith("as44:") == true) runCatching { JSONObject(api44 { hlPost("/admin/impersonate/exit") }) }.getOrNull() else null
        swapAccount44(null, drop, adminId)
        if (!quiet) {
            val n = r?.i43("changes") ?: 0
            p44.asToast = "Logget ut av ${firstName37(name)}" + (if (n > 0) " · $n endringer lagret" else "") + ". Du er $me igjen."
            p44.asUndo = if (n > 0 && target != null) target else null
            Haptics.success()
        }
    }
}

/** «Angre» etter Gå ut: ruller tilbake endringene (POST /api/users/:id/layout/undo som admin). */
fun AppViewModel.undoAs44() {
    val id = p44.asUndo ?: return
    p44.asUndo = null; p44.asToast = null
    launch44 { try { api44 { hlPost("/users/" + enc44(id) + "/layout/undo") }; flash("Endringene er rullet tilbake") } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke angret: ${e.message}") } }
}

/** Ved oppstart: pågående «Logg inn som» vises med stripa; eldre enn 30 min (tokenet har gått ut) avsluttes stille. */
internal fun AppViewModel.restoreAs44() {
    val st = runCatching { JSONObject(prefs.str(AS_PREF44, "")) }.getOrNull()
    val cur = account
    if (st == null) { if (cur?.id?.startsWith("as44:") == true) exitAs44(quiet = true); return }
    if (cur?.id != st.s37("id") || System.currentTimeMillis() - st.optLong("at") > 30 * 60_000L) { exitAs44(quiet = true); return }
    p44.asName = st.s37("name"); p44.asColor = st.optLong("color").takeIf { it != 0L }
}

val AppViewModel.impersonating44: Boolean get() = account?.id?.startsWith("as44:") == true

/* ======================= Overfør eierskap ======================= */

fun AppViewModel.loadOwner44() = launch44 {
    val raw = try { api44 { hlGet("/server/owner") } } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return@launch44
    val o = JSONObject(raw)
    val ow = o.optJSONObject("owner") ?: o
    val me = o.optJSONObject("me")
    val pend = o.optJSONObject("pending") ?: objs34(o.optJSONArray("pending")).firstOrNull()
    p44.owner = Owner44(ow.s43("id", "userId"), ow.s43("name", "username") ?: "Ukjent", ow.s43("since") ?: o.s43("since", "startedAt", "createdAt"),
        me?.b43(false, "isOwner") ?: o.b43(false, "isMe"), me?.b43(userIsAdmin, "canTransfer") ?: o.b43(userIsAdmin, "canTransfer"),
        pend?.let { pd -> listOfNotNull(pd.optJSONObject("to")?.s43("name") ?: pd.s43("toName", "to"), pd.s43("expiresAt")?.let { "venter til ${it.take(16).replace('T', ' ')}" }).joinToString(" · ") })
    // SERVER44: candidates [{id, name, role, totp, eligible, reason}] – de som kan bli eier.
    objs34(o.optJSONArray("candidates")).takeIf { it.isNotEmpty() }?.let { cs ->
        p44.ownCands = cs.mapNotNull { u -> AsUser44(u.s37("id") ?: return@mapNotNull null, u.s37("name") ?: "", u.s37("role"), hex37(u.s37("color")),
            if (u.b43(true, "eligible")) null else (u.s43("reason") ?: "kan ikke bli eier ennå"), false) }
    }
    if (p44.asUsers == null) loadAsUsers44()
}

fun AppViewModel.transferOwner44(to: AsUser44, password: String) = launch44 {
    p44.ownBusy = true; p44.ownErr = null
    try {
        val body = JSONObject().put("toUserId", to.id)
        if (password.isNotBlank()) body.put("password", password)
        val o = JSONObject(api44 { hlPost("/server/owner/transfer", body) })
        p44.ownSheet = false; p44.ownStep = 0; p44.ownPick = null
        flash(o.s43("message") ?: if (o.has("pending")) "Sendt til eieren for godkjenning (48 t)." else "${to.name} eier nå serveren. Du er fortsatt admin. ${firstName37(to.name)} har fått e-post og varsel.")
        loadOwner44()
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        p44.ownErr = when {
            e.status == 404 -> "Overføring finnes ikke på serveren ennå. Oppdater Homelab."
            e.code == "needs_2fa" || e.message?.contains("2FA", true) == true -> "${firstName37(to.name)} må slå på 2FA først."
            e.status == 401 || e.code == "reauth" -> "Skriv passordet ditt for å bekrefte."
            else -> e.message
        }
    } catch (e: Exception) { p44.ownErr = e.message } finally { p44.ownBusy = false }
}

/* ======================= Tidligere versjoner ======================= */

fun AppViewModel.loadVersions44() = launch44 {
    val raw = try { api44 { hlGet("/update/versions") } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404) p44.verMissing = true; null
    } catch (e: Exception) { null } ?: return@launch44
    p44.versions = arr43(raw, "versions", "items").map { x ->
        Ver44(x.s43("version", "tag") ?: "", x.s43("date", "releasedAt"), x.s43("notes", "summary"), x.b43(false, "hasBackup"), x.s43("backupAt"),
            x.b43(true, "compatible"), x.b43(false, "current"), x.b43(false, "previous"))
    }.filter { it.version.isNotBlank() }.take(10)
}

fun AppViewModel.rollback44(v: Ver44, restore: Boolean, pause: Boolean, password: String) = launch44 {
    p44.verBusy = true; p44.verErr = null
    try {
        val body = JSONObject().put("version", v.version).put("restoreBackup", restore).put("pauseAutoDays", if (pause) 7 else 0)
        if (password.isNotBlank()) body.put("password", password)
        api44 { hlPost("/update/rollback", body) }
        p44.verSheet = null
        p44.verMsg = "Går tilbake til ${v.version} … Appen kobler til igjen når serveren har startet."
        Haptics.success()
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        p44.verErr = when (e.status) { 401 -> "Feil passord."; 403 -> "Bare admin eller eier kan rulle tilbake."; 409 -> e.message ?: "Kan ikke gå tilbake til denne versjonen."; else -> e.message }
    } catch (e: Exception) { p44.verErr = e.message } finally { p44.verBusy = false }
}

/* ======================= Logger (Docker) ======================= */

private val SINCE44 = mapOf("15m" to 15 * 60, "1h" to 3600, "24h" to 86_400, "7d" to 7 * 86_400)

fun AppViewModel.openLogs44() { p44.logsOpen = true; p44.logsErr = null; loadContainers44(); loadLogs44(); loadGroups44() }

private fun AppViewModel.runLog44(block: suspend () -> Unit) = launch44 {
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        when (e.status) { 404 -> p44.logsMissing = true; 403 -> p44.logsErr = "Logger er bare for admin."; else -> p44.logsErr = e.message }
    } catch (e: Exception) { p44.logsErr = e.message }
}

fun AppViewModel.loadContainers44() = runLog44 {
    val raw = api44 { hlGet("/system/containers", timeout = 15_000) }
    val o = runCatching { JSONObject(raw) }.getOrNull()
    if (o?.b43(false, "noSocket", "missing") == true || o?.b43(true, "available") == false) { p44.logsErr = o.s43("error", "message") ?: "Docker-socketen er ikke koblet til."; p44.cts = emptyList(); return@runLog44 }
    p44.cts = arr43(raw, "containers", "items").map { x ->
        Ct44(x.s43("id") ?: x.s43("name") ?: "", (x.s43("name") ?: "").removePrefix("/"), x.s43("image"), (x.s43("state", "status") ?: "").lowercase(),
            x.s43("uptime", "status"), x.s43("cpu"), x.s43("mem", "memory"), x.i43("restarts", "restartCount") ?: 0, x.i43("errors1h", "errors", "errorCount") ?: 0)
    }
}

fun AppViewModel.loadLogs44() = runLog44 {
    val q = buildString {
        append("/system/logs?limit=300&since=").append(if (p44.logSince in SINCE44) p44.logSince else "1h")
        p44.ct?.let { append("&ct=").append(enc44(it)) }
        if (p44.logLevel != "alle") append("&level=").append(p44.logLevel)
        if (p44.logQ.isNotBlank()) append("&q=").append(enc44(p44.logQ))
    }
    val raw = api44 { hlGet(q, timeout = 15_000) }
    p44.logs = arr43(raw, "lines", "logs", "items").map { x ->
        Log44(x.s43("t", "time", "ts") ?: "", (x.s43("level", "lvl") ?: "info").lowercase(), x.s43("ct", "container") ?: "", x.s43("msg", "message", "line") ?: "")
    }.takeLast(500)
}

fun AppViewModel.loadGroups44() = runLog44 {
    val raw = api44 { hlGet("/system/logs/groups?hours=24", timeout = 15_000) }
    p44.groups = arr43(raw, "groups", "items").map { x -> LogGroup44(x.i43("count", "n") ?: 1, x.s43("msg", "message", "pattern") ?: "", x.s43("ct", "container") ?: "", x.s43("last", "lastSeen")) }
}

fun AppViewModel.explain44(l: Log44) {
    p44.logPick = l; p44.explain = null; p44.explainBusy = true
    val ctx = p44.logs.orEmpty().let { all -> val i = all.indexOf(l); if (i < 0) emptyList() else all.subList((i - 20).coerceAtLeast(0), (i + 21).coerceAtMost(all.size)) }
    launch44 {
        try {
            val o = JSONObject(api44 { hlPost("/system/logs/explain", JSONObject().put("line", l.msg).put("ct", l.ct).put("context", JSONArray(ctx.map { it.t + " " + it.level + " " + it.msg }))) })
            val steps = o.strs44("steps")
            p44.explain = listOfNotNull(o.s43("title"), o.s43("text", "explanation", "answer"), steps.takeIf { it.isNotEmpty() }?.joinToString("\n") { "→ $it" })
                .joinToString("\n\n").ifBlank { "Glimt fant ingen forklaring." }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { p44.explain = "Glimt kunne ikke forklare linjen nå (${e.message ?: "feil"})." } finally { p44.explainBusy = false }
    }
}

fun AppViewModel.ctAction44(id: String, act: String) = runLog44 {
    api44 { hlPost("/system/containers/" + enc44(id) + "/" + act, JSONObject().put("confirm", true)) }
    p44.ctAsk = null
    Haptics.success()
    p43.toast = when (act) { "restart" -> "Starter på nytt …"; "stop" -> "Stoppet"; else -> "Startet" }
    delay(1500); loadContainers44(); loadLogs44()
}

/** 20 linjer rundt (til Chat eller en sak). */
fun AppViewModel.logContext44(l: Log44): String {
    val all = p44.logs.orEmpty(); val i = all.indexOf(l)
    val part = if (i < 0) listOf(l) else all.subList((i - 20).coerceAtLeast(0), (i + 21).coerceAtMost(all.size))
    return part.joinToString("\n") { "${it.t} ${it.level.uppercase()} [${it.ct}] ${it.msg}" }
}

/* ======================= Studie → Dokumenter ======================= */

private fun parseDoc44(o0: JSONObject): SDoc44 {
    val o = o0.optJSONObject("doc") ?: o0
    val emner = o.list44("emner", "courses", "subjects").map { e ->
        SEmne44(e.s43("kode", "code") ?: "", e.s43("navn", "name") ?: "", e.d43("sp", "credits"), e.s43("karakter", "grade"), e.s43("semester"))
    }
    return SDoc44(o.s43("id") ?: "", o.s43("kind", "type"), o.s43("title", "name", "filename") ?: o.s43("institution") ?: "Dokument", o.s43("institution", "school"),
        o.s43("date"), emner, o.s43("snitt", "average"), o.d43("sp", "credits"), o.strs44("found"), o.s43("summary"))
}

fun AppViewModel.openStudy44() { p44.studyOpen = true; loadDocs44() }

fun AppViewModel.loadDocs44() = launch44 {
    try {
        val raw = api44 { hlGet("/study/documents") }
        p44.docs = arr43(raw, "documents", "docs", "items").map(::parseDoc44)
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404) p44.docsMissing = true else p44.docErr = e.message
        if (p44.docs == null) p44.docs = emptyList()
    } catch (e: Exception) { p44.docErr = e.message; if (p44.docs == null) p44.docs = emptyList() }
}

/** Opplasting: Glimt leser (OCR + modell) på serveren. Stegene vises med ekte tid. */
fun AppViewModel.uploadDoc44(name: String, mime: String, data: ByteArray) = launch44 {
    p44.docBusy = true; p44.docErr = null
    val t0 = System.currentTimeMillis()
    fun step(s: String) { p44.docSteps = p44.docSteps + (s + " · " + String.format(java.util.Locale("nb", "NO"), "%.1f s", (System.currentTimeMillis() - t0) / 1000.0)) }
    p44.docSteps = emptyList()
    try {
        val raw = api44 { upload("/study/documents", listOf(Api.Part("file", name, mime, data)), prefix = Api.HOMELAB, read = 180_000) }
        step("Lastet opp og kryptert")
        val o = JSONObject(raw)
        o.strs44("steps").forEach { p44.docSteps = p44.docSteps + it }
        val d = parseDoc44(o)
        step("Leste ${d.emner.size} emner" + (d.snitt?.let { " · snitt $it" } ?: ""))
        p44.doc = d
        Haptics.success()
        loadDocs44()
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        p44.docErr = if (e.status == 404) "Studie-dokumenter finnes ikke på serveren ennå. Oppdater Homelab." else e.message
    } catch (e: Exception) { p44.docErr = e.message } finally { p44.docBusy = false }
}

fun AppViewModel.askDoc44(d: SDoc44, q: String) = launch44 {
    if (q.isBlank()) return@launch44
    p44.docAnswer = "Glimt leser dokumentet …"
    p44.docAnswer = try { JSONObject(api44 { hlPost("/study/documents/" + enc44(d.id) + "/ask", JSONObject().put("q", q)) }).s43("answer", "text") ?: "Fant ikke noe svar." }
        catch (e: CancellationException) { throw e } catch (e: Exception) { "Glimt svarte ikke (${e.message ?: "feil"})." }
}

fun AppViewModel.applyDoc44(d: SDoc44) = launch44 {
    try {
        val o = JSONObject(api44 { hlPost("/study/documents/" + enc44(d.id) + "/apply") })
        flash(o.s43("message") ?: "${o.i43("added") ?: d.emner.size} emner lagt i Studie")
    } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke lagt emnene i Studie: ${e.message}") }
}

fun AppViewModel.deleteDoc44(d: SDoc44) = launch44 {
    try { api44 { hlDelete("/study/documents/" + enc44(d.id)) }; p44.doc = null; Haptics.dismiss(); loadDocs44() }
    catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke slettet: ${e.message}") }
}

/* ======================= Sted med forslag (Kartverket → OSM, via backend) ======================= */

data class Geo44(val label: String, val lat: Double, val lon: Double)

/** GET /api/geo/address?q= → [{label, street, postcode, city, lat, lon}]. Tom liste ved feil. */
suspend fun AppViewModel.geoSearch44(q: String): List<Geo44> {
    if (q.trim().length < 3) return emptyList()
    val raw = try { api44 { hlGet("/geo/address?q=" + enc44(q.trim())) } } catch (e: CancellationException) { throw e } catch (e: Exception) { return emptyList() }
    return arr43(raw, "items", "results", "addresses").mapNotNull { x ->
        val la = x.d43("lat") ?: return@mapNotNull null; val lo = x.d43("lon", "lng") ?: return@mapNotNull null
        Geo44(x.s43("label") ?: listOfNotNull(x.s43("street"), listOfNotNull(x.s43("postcode"), x.s43("city")).joinToString(" ").ifBlank { null }).joinToString(", "), la, lo)
    }
}

/** Oppgave med sted uten koordinater («Toten»): slås opp første gang siden åpnes og lagres. */
fun AppViewModel.ensureGeo44(t: TaskItem) {
    val pl = t.place?.takeIf { it.isNotBlank() && it !in listOf("store", "home", "leave", "work", "cabin") } ?: return
    if (t.geo != null) return
    launch44 { geoSearch44(pl).firstOrNull()?.let { g -> patchTask37(t.id) { it.copy(geo = g.lat to g.lon) } } }
}

fun AppViewModel.duplicateTask44(t: TaskItem) { addTask(t.title, t.list, t.due, t.assignee); flash("Duplisert «${t.title}»") }

/* ======================= Oppsettet til en annen bruker (admin) ======================= */

/** «Kopier mitt oppsett hit» / «Tilbakestill til standard» / «X kan endre selv» (PUT …/layout/lock {locked}). */
fun AppViewModel.layoutAct44(u: AsUser44, act: String, locked: Boolean = false) = launch44 {
    try {
        val path = "/users/" + enc44(u.id) + "/layout/" + act
        if (act == "lock") api44 { hlPut(path, JSONObject().put("locked", locked)) } else api44 { hlPost(path) }
        if (act == "lock") { p44.asUsers = p44.asUsers?.map { if (it.id == u.id) it.copy(locked = locked) else it }; p44.asSheet = p44.asSheet?.let { if (it.id == u.id) it.copy(locked = locked) else it } }
        flash(when (act) { "copy-from-me" -> "Oppsettet ditt er kopiert til ${firstName37(u.name)}"; "reset" -> "${firstName37(u.name)} har standardoppsettet"; else -> if (locked) "${firstName37(u.name)} kan ikke endre selv" else "${firstName37(u.name)} kan endre selv" })
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        flash(if (e.status == 404) "Fikk ikke endret: finnes ikke på serveren ennå. Oppdater Homelab." else "Fikk ikke endret: ${e.message}")
    }
}
