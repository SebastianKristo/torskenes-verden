@file:JvmName("DomeneNyheter")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/*
 * Nyheter: kode som lå i blandingsfilene (P40.kt, P46b.kt, Models13.kt, Mod24B.kt, Mod27B.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Nyheter: Glimt-siden ======================= */

data class NgSel40(val sources: Set<String> = emptySet(), val topics: Set<String> = emptySet(), val period: String = "dag", val length: String = "kort")

data class NgRef40(val n: Int, val title: String, val source: String, val url: String?, val image: String?, val time: String?)

data class NgSec40(val h: String, val text: List<Pair<String, List<Int>>>, val image: String?, val imageRef: Int?)

data class NewsGl40(val title: String, val lead: String, val sections: List<NgSec40>, val refs: List<NgRef40>, val updatedAt: String?, val local: Boolean, val count: Int)

val NG_TOPICS40 = listOf("norge" to "Norge", "verden" to "Verden", "okonomi" to "Økonomi", "sport" to "Sport", "teknologi" to "Teknologi", "kultur" to "Kultur")

private fun ngPrefKey40(vm: AppViewModel) = "news_glimt40_" + (vm.account?.id ?: "")

fun AppViewModel.loadNgSel40() {
    val raw = prefs.str(ngPrefKey40(this), "").takeIf { it.isNotBlank() } ?: return
    runCatching {
        val o = JSONObject(raw)
        fun set(k: String) = o.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
        p40.ngSel = NgSel40(set("sources"), set("topics"), o.optString("period", "dag"), o.optString("length", "kort"))
    }
}

fun AppViewModel.setNgSel40(sel: NgSel40) {
    p40.ngSel = sel
    prefs.set(ngPrefKey40(this), JSONObject().put("sources", JSONArray(sel.sources.toList())).put("topics", JSONArray(sel.topics.toList()))
        .put("period", sel.period).put("length", sel.length).toString())
}

/** Sakene som passer valgene (lokalt, for «Lag sammendrag (N saker)» og reserven). */
fun AppViewModel.ngItems40(sel: NgSel40 = p40.ngSel): List<NewsItem> {
    val all = news?.items ?: emptyList()
    val since = when (sel.period) { "uke" -> 7L * 24; "24t" -> 24L; else -> 18L }
    val now = System.currentTimeMillis()
    return all.filter { x ->
        (sel.sources.isEmpty() || x.feedId in sel.sources || x.feed in sel.sources) &&
            (sel.topics.isEmpty() || (x.category ?: "norge") in sel.topics) &&
            (x.published?.let { p -> runCatching { java.time.Instant.parse(p).toEpochMilli() }.getOrNull() }?.let { now - it < since * 3_600_000L } ?: true)
    }.take(30)
}

fun AppViewModel.openNewsGlimt40() {
    loadNgSel40()
    if (news == null) openNews() else newsOpen = true
    p40.newsGl = true
    runNewsGlimt40()
}

fun AppViewModel.runNewsGlimt40(force: Boolean = false) {
    val s = p40
    val sel = s.ngSel
    val key = "$sel"
    if (!force && s.ngKey == key && s.ng != null) return
    s.ngKey = key; s.ngBusy = true; s.ngErr = null
    launch40 {
        try {
            if (news == null) runCatching { loadNews40() }
            val body = JSONObject().put("length", if (sel.length == "lang") "lang" else "kort").put("period", sel.period)
            if (sel.sources.isNotEmpty()) body.put("sources", JSONArray(sel.sources.toList()))
            if (sel.topics.isNotEmpty()) body.put("topics", JSONArray(sel.topics.toList()))
            val o = try { JSONObject(api40 { request("POST", "/news/glimt", body, prefix = Api.HOMELAB, read = 90_000) }) } catch (e: ApiException) { if (e.status == 404 || e.status == 405) null else throw e }
            s.ng = o?.let { parseNg40(it) } ?: localNg40(sel)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.ng = localNg40(sel)
            if (s.ng == null) s.ngErr = uiErr73(e, "Glimt fikk ikke laget sammendraget")
        } finally { s.ngBusy = false }
    }
}

private fun parseNg40(o: JSONObject): NewsGl40? {
    val refs = ArrayList<NgRef40>()
    o.optJSONArray("refs")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { r ->
        refs += NgRef40(r.optInt("n", i + 1), r.optString("title"), r.optString("source"), r.s37("url"), r.s37("image"), r.s37("time"))
    } }
    val imgs = HashMap<Int, String>()
    o.optJSONArray("images")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { im -> im.s37("url")?.let { u -> imgs[im.optInt("ref", -1)] = u } } }
    val secs = ArrayList<NgSec40>()
    (o.optJSONArray("sections") ?: o.optJSONArray("seksjoner"))?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { sx ->
        val parts = ArrayList<Pair<String, List<Int>>>()
        val av = sx.optJSONArray("avsnitt")
        if (av != null) for (k in 0 until av.length()) av.optJSONObject(k)?.let { p -> parts += clean40(p.optString("tekst")) to ints40(p.optJSONArray("ref")) }
        else parts += clean40(sx.optString("text")) to ints40(sx.optJSONArray("refs"))
        val refN = parts.flatMap { it.second }.firstOrNull { imgs.containsKey(it) } ?: sx.optInt("bilde", -1).takeIf { it > 0 }
        val img = refN?.let { imgs[it] ?: refs.firstOrNull { r -> r.n == it }?.image }
        // Referanser som ikke peker på en sak fjernes.
        val valid = refs.map { it.n }.toSet()
        secs += NgSec40(sx.s37("h") ?: sx.s37("tittel") ?: "", parts.map { (t, r) -> t to r.filter { it in valid } }, img, refN)
    } }
    val lead = clean40(o.s37("lead") ?: o.s37("ingress") ?: "")
    if (secs.isEmpty() && lead.isBlank()) return null
    return NewsGl40(o.s37("title") ?: "Dette skjer i dag", lead, secs, refs, o.s37("updatedAt"), false, refs.size)
}

private fun ints40(a: JSONArray?): List<Int> = a?.let { (0 until it.length()).map { i -> it.optInt(i, -1) }.filter { n -> n > 0 } } ?: emptyList()

/** Reserve: titlene gruppert per tema, med referanser og bilder fra sakene. */
private fun AppViewModel.localNg40(sel: NgSel40): NewsGl40? {
    val items = ngItems40(sel)
    if (items.isEmpty()) return null
    val refs = items.mapIndexed { i, x -> NgRef40(i + 1, x.title, x.feed, x.url, x.image, x.published?.let { p -> runCatching { java.time.Instant.parse(p).atZone(OSLO40).let { "%02d:%02d".format(it.hour, it.minute) } }.getOrNull() }) }
    val long = sel.length == "lang"
    val secs = NG_TOPICS40.mapNotNull { (k, name) ->
        val idx = items.indices.filter { (items[it].category ?: "norge") == k }.take(if (long) 5 else 3)
        if (idx.isEmpty()) null else NgSec40(name, idx.map { i ->
            val x = items[i]
            "${x.feed} melder: ${x.title}." + (x.excerpt?.takeIf { long && it.isNotBlank() }?.let { " " + it.take(220) } ?: "") to listOf(i + 1)
        }, idx.firstNotNullOfOrNull { items[it].image }, idx.firstOrNull { items[it].image != null }?.plus(1))
    }
    val title = when (sel.period) { "uke" -> "Uka i nyheter"; "24t" -> "Siste døgn"; else -> "Dette skjer i dag" }
    return NewsGl40(title, "${items.size} saker fra ${items.map { it.feed }.distinct().take(4).joinToString(", ")}. Glimt har samlet titlene per tema.", secs, refs, null, true, items.size)
}

/* ======================= Nyheter ======================= */

data class NewsCustomCat46(val id: String, val name: String, val keywords: List<String>, val icon: String?)

data class NewsSummary46(val points: List<Pair<String, String?>>, val text: String?, val updatedAt: String?)

class News46State {
    var custom by mutableStateOf<List<NewsCustomCat46>>(emptyList())
    var interests by mutableStateOf<List<String>>(emptyList())
    var catSummary by mutableStateOf(true)
    var favicons by mutableStateOf<Map<String, String>>(emptyMap()) // feedId → URL (serverens cachede ikon)
    var hasForYou by mutableStateOf(false)
    /** Serverens faneliste (GET /api/rss → tabs: standard + «For deg» + egne), og valgene i kildenes kategorimeny. */
    var tabs by mutableStateOf<List<NewsCategory>>(emptyList())
    var catOptions by mutableStateOf<List<NewsCategory>>(emptyList())
    var summaries by mutableStateOf<Map<String, NewsSummary46?>>(emptyMap())
    var summaryBusy by mutableStateOf<String?>(null)
    var newCatOpen by mutableStateOf(false)
    var catErr by mutableStateOf<String?>(null)
    internal var sumJob: Job? = null
    internal var sumAt = HashMap<String, Long>()
}

/** Leser det nye fra GET /api/rss (samme svar som NewsData). Kalles når Nyheter lastes. */
fun AppViewModel.applyNewsExtras46(raw: String) {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val n = p46.news
    n.custom = objs34(o.optJSONArray("customCategories")).mapNotNull { c ->
        val id = c.s43("id") ?: return@mapNotNull null
        val kw = c.optJSONArray("keywords")
        NewsCustomCat46(id, c.s43("name") ?: id, (0 until (kw?.length() ?: 0)).mapNotNull { kw!!.optString(it).takeIf { s -> s.isNotBlank() } }, c.s43("icon"))
    }
    val ia = o.optJSONArray("interests")
    n.interests = (0 until (ia?.length() ?: 0)).mapNotNull { i -> (ia!!.opt(i) as? JSONObject)?.s43("word") ?: ia.optString(i).takeIf { it.isNotBlank() } }
    o.optJSONObject("settings")?.let { st -> if (st.has("catSummary")) n.catSummary = st.optBoolean("catSummary", true) }
    n.favicons = objs34(o.optJSONArray("feeds")).mapNotNull { f -> val id = f.opt("id")?.toString() ?: return@mapNotNull null; f.s43("favicon", "icon")?.let { id to it } }.toMap()
    n.hasForYou = objs34(o.optJSONArray("categories")).any { it.s43("id") == "fordeg" || it.s43("id") == "for-deg" } || o.has("interests")
    n.tabs = objs34(o.optJSONArray("tabs")).mapNotNull { t -> t.s43("id")?.let { NewsCategory(it, t.s43("name") ?: it) } }
    n.catOptions = objs34(o.optJSONArray("categoryOptions")).mapNotNull { t -> t.s43("id")?.let { NewsCategory(it, t.s43("name") ?: it) } }
}

/** Domene for favicon: uten www., rss. og feed(s). (www.vg.no/rss/feed → vg.no). */
fun feedDomain46(url: String): String = url.substringAfter("://").substringBefore('/').substringBefore(':').lowercase()
    .removePrefix("www.").removePrefix("rss.").removePrefix("feeds.").removePrefix("feed.")

/** Faneliste: standard + «For deg» (✦, rett etter Siste) + egne kategorier – det serveren ikke allerede sender. */
fun AppViewModel.newsTabs46(cats: List<NewsCategory>): List<NewsCategory> {
    val n = p46.news
    if (n.tabs.isNotEmpty()) return n.tabs
    val out = cats.toMutableList()
    if (n.hasForYou && out.none { it.id == "fordeg" || it.id == "for-deg" }) out.add((out.indexOfFirst { it.id == "siste" } + 1).coerceIn(0, out.size), NewsCategory("for-deg", "For deg"))
    n.custom.forEach { c -> if (out.none { it.id == c.id }) out.add(NewsCategory(c.id, c.name)) }
    return out
}

fun AppViewModel.addNewsCat46(name: String, keywords: String) {
    val n = p46.news
    val nm = name.trim()
    if (nm.isEmpty()) { n.catErr = "Skriv et navn"; return }
    val all = (news?.categories ?: NEWS_CATS).map { it.name.lowercase() } + n.custom.map { it.name.lowercase() }
    if (nm.lowercase() in all) { n.catErr = "Det finnes allerede en kategori som heter «$nm»"; return }
    val kw = keywords.split(',').map { it.trim() }.filter { it.isNotEmpty() }.take(20)
    n.catErr = null
    launch46 {
        try {
            api46 { hlPost("/rss/categories", JSONObject().put("name", nm).put("keywords", JSONArray(kw)).put("icon", "lucide:tag")) }
            n.newCatOpen = false
            Haptics.success()
            loadNews(newsCat)
        } catch (e: ApiException) { n.catErr = if (e.status == 404) "Egne kategorier finnes ikke på serveren ennå. Oppdater Homelab." else e.message }
    }
}

fun AppViewModel.deleteNewsCat46(id: String) = launch46 {
    Haptics.dismiss()
    runCatching { api46 { hlDelete("/rss/categories/" + URLEncoder.encode(id, "UTF-8")) } }
    if (newsCat == id) loadNews("siste") else loadNews(newsCat)
}

fun AppViewModel.setInterests46(words: List<String>) {
    val n = p46.news
    val clean = words.map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }.take(40)
    n.interests = clean
    launch46 { runCatching { api46 { hlPut("/rss/interests", JSONObject().put("words", JSONArray(clean))) } } }
}

fun AppViewModel.setCatSummary46(on: Boolean) {
    p46.news.catSummary = on
    Haptics.select()
    launch46 { runCatching { api46 { hlPut("/rss/settings", JSONObject().put("catSummary", on)) } } }
}

/**
 * Glimt-sammendrag for kategorien (ikke «Siste», som har det felles sammendraget). Bare den som vises hentes, cache 30 min.
 * Feil/tomt/færre enn 3 saker: null (kortet skjules).
 */
fun AppViewModel.loadSummary46(cat: String, items: Int) {
    val n = p46.news
    if (cat == "siste" || !n.catSummary) return
    if (items < 3) { n.summaries = n.summaries + (cat to null); return }
    val at = n.sumAt[cat] ?: 0L
    if (n.summaries.containsKey(cat) && System.currentTimeMillis() - at < 30 * 60_000L) return
    n.sumJob?.cancel()
    n.summaryBusy = cat
    n.sumJob = launchJob46 {
        // Serveren lager sammendraget i bakgrunnen ({pending, skeleton, generating}): skjelett og nytt forsøk hvert 4. s (maks 1 min).
        var o: JSONObject? = null
        for (i in 0 until 15) {
            val raw = try { api46 { hlGet("/rss/summary?cat=" + URLEncoder.encode(cat, "UTF-8"), timeout = 30_000) } } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
            o = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
            if (o == null || !(o.optBoolean("pending") || o.optBoolean("generating"))) break
            delay(4_000)
        }
        val s = if (o == null || o.optBoolean("empty") || o.optBoolean("hidden") || o.optBoolean("pending")) null else {
            val pts = objs34(o.optJSONArray("points")).mapNotNull { p -> p.s43("text")?.let { it to (p.opt("id")?.toString()?.takeIf { x -> x != "null" } ?: p.s43("url")) } }
            val txt = o.s43("text", "summary")
            if (pts.isEmpty() && txt.isNullOrBlank()) null else NewsSummary46(pts, txt, o.s43("updatedAt", "at"))
        }
        n.summaries = n.summaries + (cat to s)
        n.sumAt[cat] = System.currentTimeMillis()
        if (n.summaryBusy == cat) n.summaryBusy = null
    }
}

/** Dyp lenke: Innstillinger → Nyheter (fra «…»-menyen i Nyheter og de gamle «Kilder og AI»-lenkene). */
fun AppViewModel.openNewsSettings46() {
    newsOpen = false
    newsSettings = false
    openPaperPage("set")
    settingsPage = "nyheter"
    if (news == null) loadNews()
}

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

internal fun JSONObject.idStr(k: String = "id"): String = if (!has(k) || isNull(k)) "" else opt(k).toString()

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

/* ---------- Nyhetsleser: forhåndslast ikonene ---------- */

/** Henter alle faneikonene (minne → disk → server) med en gang, og husker ID-ene så de er klare før /rss svarer. */
fun AppViewModel.b24PreloadNewsIcons() {
    val d = news
    val ids = if (d != null) {
        val l = d.categories.mapNotNull { c -> if (d.icOn) d.iconFor(c.id) else null }
        prefs.set(pk24("news_ic"), l.joinToString(","))
        l
    } else prefs.str(pk24("news_ic"), "").split(',').filter { it.contains(':') }.ifEmpty { NEWS_ICON_DEFAULTS.values.toList() }
    ids.distinct().forEach { loadIcon23(it) }
}

data class Article27(
    val url: String, val title: String, val source: String, val category: String?, val image: String?, val published: String?, val readMin: Int?,
    val summary: String?, val points: List<String>, val aiNote: String?, val related: List<NewsItem>,
)

/* ---------- Nyheter: artikkelvisning ---------- */

private fun parseArticle27(raw: String, it0: NewsItem): Article27 {
    val o = JSONObject(raw)
    val pts = o.optJSONArray("points") ?: o.optJSONArray("punkter")
    return Article27(
        o.optStr("url") ?: it0.url, o.optStr("title") ?: it0.title, o.optStr("source") ?: it0.feed, o.optStr("category") ?: it0.category,
        o.optStr("image") ?: it0.image, o.optStr("published") ?: it0.published, o.optIntOrNull("readMin") ?: it0.readMin,
        o.optStr("summary") ?: o.optStr("sammendrag"), pts.strings().filter { it.isNotBlank() }.take(3),
        o.optStr("aiNote"), parseNewsItems(o.optJSONArray("related")).filter { it.url != it0.url }.take(5),
    )
}

fun AppViewModel.openArticle27(x: NewsItem) {
    val s = b27
    s.articleFor = x
    s.articleError = null
    s.articleCache[x.url]?.let { s.article = it; s.articleBusy = false; return }
    s.article = null
    s.articleBusy = true
    launch27b {
        try {
            val a = parseArticle27(api27b { request("GET", "/rss/article?url=" + URLEncoder.encode(x.url, "UTF-8"), prefix = Api.HOMELAB, timeout = 10_000, read = 60_000) }, x)
            s.articleCache[x.url] = a
            if (s.articleFor?.url == x.url) s.article = a
        } catch (e: ApiException) {
            if (s.articleFor?.url == x.url) s.articleError = if (e.status == 404) "Sammendrag trenger en nyere Homelab-server." else e.message
        } finally { if (s.articleFor?.url == x.url) s.articleBusy = false }
    }
}

fun AppViewModel.closeArticle27() { b27.articleFor = null; b27.article = null; b27.articleError = null }
