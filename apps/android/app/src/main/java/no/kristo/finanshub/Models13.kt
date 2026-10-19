package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

/* ---------------- Nyhetsleser (GET /api/rss) ---------------- */

data class NewsItem(
    val id: String, val feedId: String?, val feed: String, val title: String, val url: String, val published: String?,
    val category: String?, val image: String?, val excerpt: String?, val ai: Boolean = false,
    /** Prompt 27: lesetid i minutter (ord / 230), når serveren sender den. */
    val readMin: Int? = null,
)
data class NewsFeed(val id: String, val name: String, val url: String, val category: String, val enabled: Boolean, val count: Int, val lastError: String?)
data class NewsCategory(val id: String, val name: String)
data class NewsData(
    val items: List<NewsItem>, val feeds: List<NewsFeed>, val aiSummary: Boolean, val aiCategorize: Boolean,
    val digest: String?, val digestAt: String?, val categories: List<NewsCategory>,
    /** Prompt 23: ikon per fane (ic, '' = ingen), kilden (std | ai | pick), «Vis ikoner» og serverens standardikoner. */
    val ic: Map<String, String> = emptyMap(), val icSrc: Map<String, String> = emptyMap(), val icOn: Boolean = true, val iconDefaults: Map<String, String> = emptyMap(),
)

/** Kategoriene i leseren når serveren ikke sender egne. */
val NEWS_CATS: List<NewsCategory> = listOf(
    NewsCategory("siste", "Siste"), NewsCategory("norge", "Norge"), NewsCategory("verden", "Verden"), NewsCategory("okonomi", "Økonomi"),
    NewsCategory("sport", "Sport"), NewsCategory("teknologi", "Teknologi"), NewsCategory("kultur", "Kultur"),
)

private fun JSONObject.idStr(k: String = "id"): String = if (!has(k) || isNull(k)) "" else opt(k).toString()

fun parseNewsItem(o: JSONObject) = NewsItem(
    o.idStr(), o.optStr("feedId") ?: o.optStr("feed_id"), o.optStr("feed") ?: o.optStr("source") ?: "", o.optString("title"),
    o.optString("url"), o.optStr("published"), o.optStr("category") ?: o.optStr("ai_category"), o.optStr("image"), o.optStr("excerpt"),
    o.optBoolean("ai") || (o.optStr("ai_category") != null && o.optStr("category") == null),
    o.optIntOrNull("readMin"),
)

fun parseNewsItems(a: JSONArray?): List<NewsItem> = a?.map(::parseNewsItem) ?: emptyList()

private fun strMap(o: JSONObject?): Map<String, String> = o?.keys()?.asSequence()?.associateWith { o.optString(it) } ?: emptyMap()

fun parseNews(s: String): NewsData {
    val o = JSONObject(s)
    val st = o.optJSONObject("settings")
    val dg = o.optJSONObject("digest")
    return NewsData(
        parseNewsItems(o.optJSONArray("items")),
        o.optJSONArray("feeds")?.map {
            NewsFeed(it.idStr(), it.optString("name"), it.optString("url"), it.optStr("category") ?: "auto", it.optBoolean("enabled", true), it.optInt("count"), it.optStr("lastError"))
        } ?: emptyList(),
        st?.optBoolean("aiSummary", true) ?: true, st?.optBoolean("aiCategorize", true) ?: true,
        dg?.optStr("text") ?: (o.opt("digest") as? String), dg?.optStr("at"),
        o.optJSONArray("categories")?.map { NewsCategory(it.optString("id"), it.optString("name")) }?.takeIf { it.isNotEmpty() } ?: NEWS_CATS,
        strMap(st?.optJSONObject("ic")), strMap(st?.optJSONObject("icSrc")), st?.optBoolean("icOn", true) ?: true, strMap(o.optJSONObject("iconDefaults")),
    )
}

/* ---------------- Fotovindu (GET /api/photo-window) ---------------- */

data class PhotoWindow(val kind: String, val url: String?, val credit: String?, val gradient: List<Long>, val fallbacks: List<String> = emptyList(), val symbol: String? = null)

/** Hex-fargene i en CSS-gradient («linear-gradient(170deg,#4a5a6a,#2a3440)»). */
fun gradientColors(css: String?): List<Long> =
    if (css == null) emptyList() else Regex("#([0-9a-fA-F]{6})").findAll(css).map { 0xFF000000 or it.groupValues[1].toLong(16) }.toList()

fun parsePhotoWindow(s: String): PhotoWindow {
    val o = JSONObject(s)
    return PhotoWindow(o.optString("kind"), o.optStr("url"), o.optStr("credit"), gradientColors(o.optStr("gradient")), o.optJSONArray("fallbacks").strings(), o.optStr("symbol"))
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

/* ---------------- Mat: mapper, oppskrifter og lenker (/mat/api) ---------------- */

data class MatFolder(val id: String, val name: String, val sort: Int, val count: Int)
data class DishLink(val id: String, val title: String, val url: String?, val fileUrl: String?, val kind: String) {
    /** Etiketten som vises ved ikonet. */
    val kindLabel: String get() = when (kind) {
        "sheet" -> "Regneark"; "pdf" -> "PDF"; "video" -> "Video"; "doc" -> "Dokument"; "image" -> "Bilde"; else -> "Lenke"
    }
}
data class RecipePreview(
    val name: String, val image: String?, val time: String?, val servings: String?, val ingredients: List<String>, val steps: List<String>,
    val sourceUrl: String?, val folderSuggestion: String?, val method: String?, val raw: String,
)
data class RecipeJob(val id: String, val status: String, val error: String?, val dishId: String?, val name: String?) {
    val active: Boolean get() = status == "queued" || status == "reading"
}

fun parseMatFolders(s: String): List<MatFolder> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONObject(t).optJSONArray("folders") ?: JSONArray()
    return a.map { MatFolder(it.idStr(), it.optString("name"), it.optInt("sort"), it.optInt("count")) }.sortedBy { it.sort }
}

fun parseDishLinks(a: JSONArray?): List<DishLink> = a?.map {
    DishLink(it.idStr(), it.optString("title").ifBlank { it.optString("url") }, it.optStr("url"), it.optStr("fileUrl") ?: it.optStr("file_url"), it.optStr("kind") ?: "link")
} ?: emptyList()

fun parseRecipePreview(s: String): RecipePreview {
    val root = JSONObject(s)
    val o = root.optJSONObject("preview") ?: root
    fun lines(k: String): List<String> = o.optJSONArray(k)?.let { a ->
        (0 until a.length()).mapNotNull { i ->
            when (val v = a.opt(i)) { is String -> v; is JSONObject -> v.optStr("text") ?: v.optStr("name"); else -> v?.toString() }?.trim()?.takeIf { it.isNotBlank() }
        }
    } ?: emptyList()
    fun any(k: String): String? = if (!o.has(k) || o.isNull(k)) null else o.opt(k).toString().takeIf { it.isNotBlank() }
    return RecipePreview(
        o.optString("name"), o.optStr("image"), any("time"), any("servings"), lines("ingredients"), lines("steps"),
        o.optStr("sourceUrl"), o.optStr("folderSuggestion"), o.optStr("method"), o.toString(),
    )
}

fun parseRecipeJobs(s: String): List<RecipeJob> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONObject(t).optJSONArray("jobs") ?: JSONArray()
    return a.map { RecipeJob(it.idStr(), it.optString("status"), it.optStr("error"), it.optStr("dishId"), it.optStr("name")) }
}
