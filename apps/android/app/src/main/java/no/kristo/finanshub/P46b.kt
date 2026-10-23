package no.kristo.finanshub

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate

/*
 * Prompt 46 (ANDROID46), del 2: Nyheter, Google Photos-bakgrunn og Subscription-loggen. Serverformene står i
 * $S/SERVER46-API.md (WEB46/SERVER46/DATA46) – alt tåler 404 og eldre server.
 *  - Nyheter: innstillingene flyttet til Innstillinger → Nyheter (claude-code-nyheter-innstillinger-flytt.md), egne kategorier og
 *    «For deg» (…-egne-kategorier-for-deg.md), favicon + kategori som nedtrekksmeny (…-kilder-favicon-dropdown.md), Glimt-sammendrag
 *    per kategori (…-sammendrag-per-kategori.md): GET /api/rss → customCategories, interests, settings.catSummary, feeds[].favicon;
 *    POST/DELETE /api/rss/categories, PUT /api/rss/interests {words}, PUT /api/rss/settings {catSummary}, GET /api/rss/summary?cat=.
 *  - Bakgrunn: GET|POST|DELETE /api/bg/gphoto (+ /refresh) → current.mobile; nytt bilde hver hele time.
 *  - Subscription OS → Historikk → Logg: GET /finans/api/subscriptions/log (SERVER46), filter Alle/Fakturaer/Prøveperioder, CSV.
 */

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

/* ======================= Bakgrunn: Google Photos-album ======================= */

data class Gphoto46(val configured: Boolean, val url: String?, val count: Int, val rowText: String?, val error: String?, val mobile: String?, val nextAt: String?)

private val GP_RE46 = Regex("""^https://(photos\.app\.goo\.gl/[A-Za-z0-9_-]+|photos\.google\.com/share/[^\s]+)$""")
fun gphotoValid46(u: String): Boolean = GP_RE46.matches(u.trim())

private fun parseGphoto46(raw: String?): Gphoto46? {
    val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
    val cur = o.optJSONObject("current")
    return Gphoto46(o.optBoolean("configured", false), o.s43("url"), o.optInt("count"), o.s43("rowText"), o.s43("error"), cur?.s43("mobile", "large"), o.s43("nextChangeAt"))
}

/** Bildet som gjelder nå (samme for alle enheter: deterministisk etter time og dag på serveren). Planlegger neste bytte. */
internal suspend fun AppViewModel.gphotoPhoto46(): Bitmap? {
    val raw = runCatching { api46 { hlGet("/bg/gphoto", timeout = 12_000) } }.getOrNull()
    val g = parseGphoto46(raw) ?: return null
    p46.gp = g
    val url = g.mobile ?: return null
    val bmp = if (url.startsWith("/")) image(url) else null // bare serverens egne, cachede bilder (aldri hotlinking)
    p46.gpJob?.cancel()
    val next = g.nextAt?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
    if (next != null) p46.gpJob = launchJob46 { delay((next - System.currentTimeMillis()).coerceIn(60_000L, 3_600_000L) + 2_000L); if (photoKind == "gphoto") loadPhoto() }
    return bmp
}

fun AppViewModel.loadGphoto46() = launch46 { p46.gp = parseGphoto46(runCatching { api46 { hlGet("/bg/gphoto") } }.getOrNull()) }

fun AppViewModel.useGphoto46(url: String) {
    val u = url.trim()
    if (!gphotoValid46(u)) { p46.gpErr = "Må være en delt album-lenke fra Google Photos"; Haptics.error(); return }
    p46.gpErr = null
    p46.gpBusy = true
    launch46 {
        try {
            val raw = api46 { request("POST", "/bg/gphoto", JSONObject().put("url", u), prefix = Api.HOMELAB, read = 90_000) }
            p46.gp = parseGphoto46(raw)
            p46.gpSheet = false
            setPhotoKind("gphoto")
            runCatching { api46 { hlPut("/me/layout", JSONObject().put("papir_bg_gphoto", u)) } }
        } catch (e: ApiException) {
            p46.gpErr = when { e.status == 404 -> "Serveren støtter ikke Google Photos-album ennå. Oppdater Homelab."; e.status == 400 -> "Må være en delt album-lenke fra Google Photos"; else -> e.message ?: "Fikk ikke hentet albumet" }
        } finally { p46.gpBusy = false }
    }
}

fun AppViewModel.removeGphoto46() = launch46 {
    runCatching { api46 { hlDelete("/bg/gphoto") } }
    p46.gp = null; p46.gpSheet = false
    if (photoKind == "gphoto") setPhotoKind("oslo")
}

fun AppViewModel.retryGphoto46() = launch46 {
    runCatching { api46 { request("POST", "/bg/gphoto/refresh", JSONObject(), prefix = Api.HOMELAB, read = 90_000) } }
    loadPhoto()
}

/* ======================= Subscription OS: logg ======================= */

data class SubEvent46(
    val id: String, val service: String, val type: String, val amount: Double?, val date: LocalDate, val account: String?, val source: String?,
    val oldPrice: Double?, val days: Int?, val saved: Double?,
)

class SubLog46State {
    var events by mutableStateOf<List<SubEvent46>?>(null)
    var missing by mutableStateOf(false)
    var filter by mutableStateOf("alle") // alle · fakturaer · prove
    var months by mutableStateOf(3)
    var busy by mutableStateOf(false)
}

fun AppViewModel.loadSubLog46() {
    val s = p46.subLog
    if (s.busy) return
    s.busy = true
    launch46 {
        try {
            val raw = try { api46 { get("/subscriptions/log?months=24") } } catch (e: ApiException) {
                if (e.status == 404) api46 { hlGet("/subscriptions/log?months=24") } else throw e
            }
            val o = JSONObject(raw)
            s.events = objs34(o.optJSONArray("events") ?: o.optJSONArray("items")).mapNotNull { e ->
                val d = e.s43("date")?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return@mapNotNull null
                SubEvent46(e.opt("id")?.toString() ?: "${e.s43("service")}-$d", e.s43("service", "name") ?: "Abonnement", e.s43("type") ?: "charge", e.d43("amount"), d,
                    e.s43("account"), e.s43("source"), e.d43("oldPrice", "old_price"), e.i43("days"), e.d43("saved"))
            }.sortedByDescending { it.date }
            s.missing = false
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) s.missing = true
        } catch (_: Exception) {
        } finally { s.busy = false }
    }
}

fun subLogCsv46(list: List<SubEvent46>): String {
    val type = mapOf("charge" to "Faktura", "trial_start" to "Prøveperiode startet", "trial_end" to "Prøveperiode slutt", "trial_converted" to "Gikk over til betalt",
        "trial_cancelled" to "Sagt opp i tide", "price_change" to "Prisendring", "cancelled" to "Sagt opp")
    fun q(s: String) = if (s.contains(';') || s.contains('"') || s.contains('\n')) "\"" + s.replace("\"", "\"\"") + "\"" else s
    return "Dato;Tjeneste;Type;Beløp\n" + list.joinToString("\n") { e ->
        listOf(e.date.toString(), q(e.service), q(type[e.type] ?: e.type), e.amount?.let { a -> String.format(java.util.Locale("nb", "NO"), "%.2f", if (e.type == "charge" || e.type == "trial_converted") -kotlin.math.abs(a) else kotlin.math.abs(a)) } ?: "0").joinToString(";")
    }
}
