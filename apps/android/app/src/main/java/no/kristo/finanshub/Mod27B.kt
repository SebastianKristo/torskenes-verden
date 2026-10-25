package no.kristo.finanshub

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.Normalizer
import java.time.LocalDate

/*
 * Prompt 27 (ANDROID-B): Finans-søkeforslag, Personvern og logoer (AI-logg, «Velg logo»), Nyheter med bilde og artikkelvisning,
 * Ruter-kortet på Hjem (Velg stopp) og abonnement fra skjermbilde. Tegnes i ui/Search27.kt, ui/Fin27.kt, ui/News27.kt og
 * ui/Ruter27.kt; Ruter-widgetene ligger i widget/Ruter27Widgets.kt. Kodet mot API-avtalen i prompt 27 (reserve ved 404).
 */

/* ---------- Modeller ---------- */

/** Ett forslag under Finans-søket (GET /finans/api/forslag). sum i kroner (negativ for utgift). */
data class FinSug27(val type: String, val name: String, val count: Int, val sum: Double, val icon: String, val color: Long, val logoUrl: String?)

data class AiAudit27(val id: String, val ts: String?, val engine: String, val purpose: String, val fields: String)

data class Article27(
    val url: String, val title: String, val source: String, val category: String?, val image: String?, val published: String?, val readMin: Int?,
    val summary: String?, val points: List<String>, val aiNote: String?, val related: List<NewsItem>,
)

/** Hjem-kortet: valgte stopp (≤ 3) og avganger per stopp (1–4). */
data class HomeDep27(val stops: List<String>, val n: Int)

/** «Velg logo» for en butikk uten logo. */
data class LogoPick27(val name: String, val domain: String?, val receiptId: String?)

/** Resultatet av «Fra skjermbilde» (pris i kroner). check = felt med lav sikkerhet («Sjekk»). */
data class SubShot27(
    val service: String, val plan: String, val price: Double, val currency: String, val priceOriginal: String?, val cycle: String,
    val next: String?, val category: String, val logoUrl: String?, val domain: String?, val check: Set<String>, val existingId: Int?,
)

class B27State {
    /* Finans-forslag */
    var sug by mutableStateOf<List<FinSug27>>(emptyList())
    /** Etter valg av forslag eller Enter: ingen forslag før brukeren skriver igjen. */
    var sugHidden by mutableStateOf(false)
    internal var sugJob: Job? = null
    internal var sugLocal = false

    /* Personvern og logoer */
    var privacy by mutableStateOf<Map<String, Boolean>>(emptyMap())
    internal var privacyLoaded = false
    var audit by mutableStateOf<List<AiAudit27>?>(null)
    var auditOpen by mutableStateOf(false)
    var auditError by mutableStateOf<String?>(null)
    var logoPick by mutableStateOf<LogoPick27?>(null)
    var logoBusy by mutableStateOf(false)
    var logoMsg by mutableStateOf<String?>(null)
    /** Logoer valgt i denne økten (navn → bilde), vises med en gang. */
    var logoDone by mutableStateOf<Map<String, Bitmap>>(emptyMap())

    /* Nyheter */
    var articleFor by mutableStateOf<NewsItem?>(null)
    var article by mutableStateOf<Article27?>(null)
    var articleBusy by mutableStateOf(false)
    var articleError by mutableStateOf<String?>(null)
    internal val articleCache = mutableMapOf<String, Article27>()
    internal val imgCache = android.util.LruCache<String, Bitmap>(80)
    internal val imgMiss = mutableMapOf<String, Long>()

    /* Ruter på Hjem */
    var homeDep by mutableStateOf(HomeDep27(emptyList(), 3))
    internal var homeDepFor: String? = null
    var homeStops by mutableStateOf<List<StopRef>?>(null)
    var homeDeps by mutableStateOf<Map<String, StopDeps>>(emptyMap())
    var homeSheet by mutableStateOf(false)

    /* Abonnement fra skjermbilde */
    var shot by mutableStateOf<SubShot27?>(null)
    var shotOpen by mutableStateOf(false)
    var shotBusy by mutableStateOf(false)
    var shotError by mutableStateOf<String?>(null)
    var shotThumb by mutableStateOf<Bitmap?>(null)
    var shotName by mutableStateOf("")
    /** «Rediger først»: skjemaet for nytt abonnement fylles ut med dette. */
    var subPrefill by mutableStateOf<SubShot27?>(null)

}

/* ---------- Normalisering og uklar matching (samme regler som serveren) ---------- */

/** Små bokstaver, uten diakritiske tegn, men æøå beholdes. */
fun norm27(s: String): String {
    val keep = s.lowercase().replace('æ', '\u0001').replace('ø', '\u0002').replace('å', '\u0003')
    val n = Normalizer.normalize(keep, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
    return n.replace('\u0001', 'æ').replace('\u0002', 'ø').replace('\u0003', 'å')
}

private fun lev27(a: String, b: String): Int {
    val d = IntArray(b.length + 1) { it }
    for (i in 1..a.length) {
        var prev = d[0]; d[0] = i
        for (j in 1..b.length) {
            val t = d[j]
            d[j] = minOf(d[j] + 1, d[j - 1] + 1, prev + if (a[i - 1] == b[j - 1]) 0 else 1)
            prev = t
        }
    }
    return d[b.length]
}

/** 4 = starter med q, 3 = et ord starter med q, 2 = inneholder q, 1 = ett tegn feil mot starten av et ord (q ≥ 4), 0 = ingen. */
fun score27(name: String, q: String): Int {
    val n = norm27(name); val k = norm27(q.trim())
    if (k.isEmpty()) return 0
    if (n.startsWith(k)) return 4
    val words = n.split(Regex("[^\\p{L}\\p{N}]+")).filter { it.isNotEmpty() }
    if (words.any { it.startsWith(k) }) return 3
    if (n.contains(k)) return 2
    if (k.length >= 4 && words.any { w -> lev27(w.take(k.length), k) <= 1 || lev27(w.take(k.length + 1), k) <= 1 }) return 1
    return 0
}

/** Delen som ble skrevet (start, slutt) i navnet, for «skrevet del normal, resten fet». null = uklart treff. */
fun typedRange27(name: String, q: String): IntRange? {
    val k = norm27(q.trim())
    if (k.isEmpty()) return null
    val n = norm27(name)
    val i = n.indexOf(k)
    // Normaliseringen kan endre lengden (sjelden); da markeres ingenting.
    if (i < 0 || n.length != name.length) return null
    return i until (i + k.length)
}

private fun colorHex27(s: String?): Long? = s?.trim()?.removePrefix("#")?.let { h ->
    when (h.length) { 6 -> h.toLongOrNull(16)?.let { 0xFF000000 or it }; 8 -> h.toLongOrNull(16); else -> null }
}

private fun parseSugs27(raw: String): List<FinSug27> {
    val t = raw.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("items") ?: it.optJSONArray("forslag") ?: JSONArray() }
    return a.map { o ->
        val name = o.optStr("navn") ?: o.optStr("name") ?: ""
        FinSug27(
            o.optStr("type") ?: "butikk", name, o.optInt("antall", o.optInt("count", 0)),
            // sum i øre fra serveren (negativ for utgift).
            (o.optDoubleOrNull("sum") ?: 0.0) / 100.0,
            o.optStr("ikon") ?: o.optStr("icon") ?: name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() },
            colorHex27(o.optStr("farge") ?: o.optStr("color")) ?: 0xFF5B6478, o.optStr("logoUrl"),
        )
    }.filter { it.name.isNotBlank() }
}

/** Reserve uten /forslag: butikker og kategorier fra transaksjonene som allerede er lastet. */
private fun localSugs27(txs: List<Tx>, q: String): List<FinSug27> {
    val shops = txs.groupBy { (it.merchant ?: it.description).trim() }.filterKeys { it.isNotBlank() }
        .map { (n, l) -> Triple(FinSug27("butikk", n, l.size, l.sumOf { it.amount }, n.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }, l.first().color, null), score27(n, q), 0) }
    val cats = txs.groupBy { it.category.trim() }.filterKeys { it.isNotBlank() }
        .map { (n, l) -> Triple(FinSug27("kategori", n, l.size, l.sumOf { it.amount }, n.take(2).uppercase(), l.first().color, null), score27(n, q), 1) }
    return (shops + cats).filter { it.second > 0 }
        .sortedWith(compareByDescending<Triple<FinSug27, Int, Int>> { it.second }.thenBy { it.third }.thenByDescending { it.first.count })
        .take(6).map { it.first }
}

/* ---------- Finans-søkeforslag ---------- */

/** Ny tekst i Finans → Søk: debounce 120 ms og avbryt forrige. Ingen forslag når ✦ AI er på, feltet er tomt eller etter valg/Enter. */
fun AppViewModel.finSug27(q: String) {
    val s = b27
    s.sugJob?.cancel()
    val t = q.trim()
    if (t.isEmpty() || finSearchAi || s.sugHidden) { s.sug = emptyList(); return }
    s.sugJob = viewModelScope.launch {
        delay(120)
        val l = try {
            if (s.sugLocal) localSugs27(txs ?: emptyList(), t)
            else parseSugs27(api27b { get("/forslag?q=" + URLEncoder.encode(t, "UTF-8") + "&limit=6") })
        } catch (e: ApiException) {
            if (e.status == 404) { s.sugLocal = true; localSugs27(txs ?: emptyList(), t) } else emptyList()
        } catch (e: Exception) { emptyList() }
        if (isActive && finSearchQ.trim() == t && !s.sugHidden && !finSearchAi) s.sug = l
    }
}

/** Tøm forslagene (✕, Enter, valg). */
fun AppViewModel.finSugClear27(hide: Boolean) {
    b27.sugJob?.cancel()
    b27.sug = emptyList()
    b27.sugHidden = hide
}

/* ---------- Personvern og logoer ---------- */

val PRIVACY27 = listOf(
    Triple("logo_local_receipts", "Les kvitteringer lokalt", "Ollama på hjemmeserveren leser hele kvitteringen. Ingenting sendes ut"),
    Triple("logo_gemini", "Finn logo med Gemini", "Gemini får bare butikknavnet, f.eks. «Blomsterlandet»"),
    Triple("logo_verify", "Sjekk logoen før den lagres", "Domenet må svare, og bildet må være et ekte bilde"),
)

fun AppViewModel.loadPrivacy27() {
    val s = b27
    if (s.privacyLoaded) return
    s.privacyLoaded = true
    launch27b {
        val o = runCatching { JSONObject(api27b { get("/settings") }) }.getOrNull() ?: return@launch27b
        val u = o.optJSONObject("user")
        s.privacy = PRIVACY27.associate { (k, _, _) ->
            k to when {
                o.has(k) && !o.isNull(k) -> o.opt(k).let { it == true || it == "true" || it == 1 || it == "1" }
                u != null && u.has(k) && !u.isNull(k) -> u.opt(k).let { it == true || it == "true" || it == 1 || it == "1" }
                else -> true
            }
        }
    }
}

fun AppViewModel.setPrivacy27(key: String, on: Boolean) {
    val s = b27
    s.privacy = s.privacy + (key to on)
    launch27b {
        // Personlig innstilling: FinansHub-innstillingene (per bruker), og Homelab-oppsettet hvis serveren har nøkkelen der.
        val ok = runCatching { api27b { put("/settings", JSONObject().put(key, on)) } }.isSuccess
        val ok2 = runCatching { api27b { request("PUT", "/config", JSONObject().put(key, on.toString()), prefix = Api.HOMELAB) } }.isSuccess
        if (!ok && !ok2) flash("Kunne ikke lagre innstillingen")
    }
}

private fun fieldsText27(v: Any?): String = when (v) {
    null, JSONObject.NULL -> ""
    is JSONArray -> (0 until v.length()).joinToString(", ") { v.opt(it).toString() }
    is JSONObject -> v.keys().asSequence().joinToString(", ") { k -> "$k: ${v.opt(k)}" }
    is String -> v.trim().let { t ->
        when {
            t.startsWith("[") -> runCatching { fieldsText27(JSONArray(t)) }.getOrDefault(t)
            t.startsWith("{") -> runCatching { fieldsText27(JSONObject(t)) }.getOrDefault(t)
            else -> t
        }
    }
    else -> v.toString()
}

fun AppViewModel.loadAiAudit27() {
    val s = b27
    s.auditError = null
    launch27b {
        try {
            val raw = api27b { get("/ai-audit") }.trim()
            val a = if (raw.startsWith("[")) JSONArray(raw) else JSONObject(raw).let { it.optJSONArray("items") ?: it.optJSONArray("rows") ?: JSONArray() }
            s.audit = a.map { o ->
                AiAudit27(o.opt("id")?.toString() ?: "", o.optStr("ts") ?: o.optStr("at"), o.optStr("engine") ?: "AI", o.optStr("purpose") ?: "",
                    fieldsText27(o.opt("fields_sent") ?: o.opt("fieldsSent") ?: o.opt("fields")))
            }
        } catch (e: ApiException) {
            s.audit = emptyList()
            s.auditError = if (e.status == 404) "AI-loggen trenger en nyere Homelab-server." else e.message
        }
    }
}

/** Logo fra en sti på serveren («/finans/api/…») eller en full adresse. */
suspend fun AppViewModel.img27(url: String?): Bitmap? {
    if (url.isNullOrBlank()) return null
    val s = b27
    s.imgCache.get(url)?.let { return it }
    s.imgMiss[url]?.let { if (System.currentTimeMillis() - it < 5 * 60_000) return null }
    val b = if (url.startsWith("/")) image(url) else runCatching {
        withContext(Dispatchers.IO) {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 6000; c.readTimeout = 8000
            c.setRequestProperty("User-Agent", "FinansHub-Android")
            try {
                val bytes = c.inputStream.use { it.readBytes() }
                // Nedskalert, så store artikkelbilder ikke fyller minnet.
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
                var sample = 1
                while (maxOf(o.outWidth, o.outHeight) / (sample * 2) >= 1000) sample *= 2
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            } finally { c.disconnect() }
        }
    }.getOrNull()
    if (b != null) s.imgCache.put(url, b) else s.imgMiss[url] = System.currentTimeMillis()
    return b
}

private fun logoResult27(vm: AppViewModel, name: String, raw: String) {
    val o = runCatching { JSONObject(raw) }.getOrNull()
    val s = vm.b27
    if (o == null || o.optBoolean("none")) { s.logoMsg = "Fant ingen logo. Last opp et bilde eller lim inn domenet."; return }
    val url = o.optStr("logoUrl") ?: o.optStr("url")
    val src = o.optStr("source")
    vm.launch27b {
        val b = vm.img27(url) ?: o.optStr("domain")?.let { vm.logo(it) }
        if (b != null) s.logoDone = s.logoDone + (name.lowercase() to b)
        s.logoMsg = null
        s.logoPick = null
        vm.flash("Logo lagret" + (src?.let { " · $it" } ?: ""))
    }
}

/** «Finn logo»: den nye kjeden på serveren (egen tabell → Brreg → Gemini med bare navnet → domene → ikon → kvitteringen). */
fun AppViewModel.findLogo27(pk: LogoPick27) {
    val s = b27
    s.logoBusy = true; s.logoMsg = null
    launch27b {
        try {
            val body = JSONObject().put("name", pk.name)
            pk.receiptId?.let { body.put("receiptId", it) }
            logoResult27(this, pk.name, api27b { request("POST", "/merchants/logo", body, read = 60_000) })
        } catch (e: ApiException) {
            s.logoMsg = if (e.status == 404) "Logo-oppslag trenger en nyere Homelab-server." else e.message
        } finally { s.logoBusy = false }
    }
}

fun AppViewModel.logoDomain27(pk: LogoPick27, domain: String) {
    val d = domain.trim().removePrefix("https://").removePrefix("http://").removePrefix("www.").substringBefore('/').lowercase()
    if (!d.contains('.')) { b27.logoMsg = "Skriv et domene, f.eks. blomsterlandet.no"; return }
    val s = b27
    s.logoBusy = true; s.logoMsg = null
    launch27b {
        try { logoResult27(this, pk.name, api27b { request("POST", "/merchants/logo/manual", JSONObject().put("name", pk.name).put("domain", d), read = 30_000) }) }
        catch (e: ApiException) { s.logoMsg = if (e.status == 404) "Trenger en nyere Homelab-server." else e.message }
        finally { s.logoBusy = false }
    }
}

fun AppViewModel.logoUpload27(ctx: Context, pk: LogoPick27, uri: Uri) {
    val s = b27
    s.logoBusy = true; s.logoMsg = null
    launch27b {
        try {
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: return@launch27b
            val mime = ctx.contentResolver.getType(uri) ?: "image/png"
            val raw = api27b { upload("/merchants/logo/manual", listOf(Api.Part.text("name", pk.name), Api.Part("file", "logo." + mime.substringAfter('/'), mime, data))) }
            withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(data, 0, data.size) }?.let { s.logoDone = s.logoDone + (pk.name.lowercase() to it) }
            logoResult27(this, pk.name, raw)
        } catch (e: ApiException) { s.logoMsg = if (e.status == 404) "Trenger en nyere Homelab-server." else e.message }
        finally { s.logoBusy = false }
    }
}

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

/* ---------- Ruter på Hjem ---------- */

private fun homeDepKey27(vm: AppViewModel) = "home_dep27_" + (vm.account?.id ?: "")

private fun parseHomeDep27(raw: String): HomeDep27? = runCatching {
    val o0 = JSONObject(raw)
    val o = o0.optJSONObject("home_departures") ?: o0.optJSONObject("homeDepartures") ?: o0
    if (!o.has("stops")) return@runCatching null
    HomeDep27(o.optJSONArray("stops").strings().filter { it.isNotBlank() }.take(3), o.optInt("n", 3).coerceIn(1, 4))
}.getOrNull()

private fun HomeDep27.json() = JSONObject().put("stops", JSONArray(stops)).put("n", n)

/** Stoppene kortet viser: de valgte i rekkefølgen fra Mine stopp, ellers det første. */
fun AppViewModel.homeShown27(): List<StopRef> {
    val all = b27.homeStops ?: return emptyList()
    val sel = all.filter { it.id in b27.homeDep.stops }
    return sel.ifEmpty { all.take(1) }.take(3)
}

/** Første gang (per konto): lagret valg, så serveren, så Mine stopp og avgangene. */
fun AppViewModel.loadHomeDep27() {
    val s = b27
    val key = homeDepKey27(this)
    if (s.homeDepFor != key) {
        s.homeDepFor = key
        s.homeStops = null; s.homeDeps = emptyMap()
        s.homeDep = parseHomeDep27(prefs.str(key, "")) ?: HomeDep27(emptyList(), 3)
        runCatching { seedHome52() } // prompt 52 (AND52B): stoppene og avgangene fra bufferen før nettverkskallet
        launch27b {
            val srv = runCatching { api27b { hlGet("/me/home-departures") } }.getOrNull()?.let(::parseHomeDep27)
                ?: runCatching { api27b { hlGet("/me/layout") } }.getOrNull()?.let(::parseHomeDep27)
            if (srv != null) { s.homeDep = srv; prefs.set(key, srv.json().toString()) }
        }
    }
    launch27b { refreshHomeDeps27(stops = true) }
}

suspend fun AppViewModel.refreshHomeDeps27(stops: Boolean = false) {
    val s = b27
    if (stops || s.homeStops == null) {
        s.homeStops = runCatching { api27b { hlGet("/me/stops") }.let { raw -> parseStopList(raw).also { runCatching { cacheStops52(raw) } } } }.getOrNull() ?: s.homeStops ?: emptyList()
    }
    val shown = homeShown27()
    if (shown.isEmpty()) return
    val n = maxOf(4, s.homeDep.n)
    val out = s.homeDeps.toMutableMap()
    for (st in shown) {
        runCatching { api27b { hlGet("/ruter/departures?stop=" + URLEncoder.encode(st.id, "UTF-8") + "&n=" + (n + 2), timeout = 12_000) }.let { raw -> raw to parseStopDeps(raw) } }
            .getOrNull()?.let { (raw, sd) ->
                val v = sd.copy(stop = sd.stop.copy(id = st.id, name = st.name.ifBlank { sd.stop.name }))
                out[st.id] = v
                runCatching { cacheDeps52(st.id, raw, v) } // prompt 52: hurtigbuffer per stopp
            }
    }
    s.homeDeps = out
}

fun AppViewModel.setHomeDep27(v: HomeDep27, ctx: Context? = null) {
    val s = b27
    val nv = v.copy(stops = v.stops.take(3), n = v.n.coerceIn(1, 4))
    s.homeDep = nv
    prefs.set(homeDepKey27(this), nv.json().toString())
    launch27b {
        // Egen rute (avtalen). Eldre server uten ruten: valget ligger lokalt per konto (layouten skrives ikke over).
        runCatching { api27b { hlPut("/me/home-departures", nv.json()) } }
        refreshHomeDeps27()
        ctx?.let { c -> runCatching { no.kristo.finanshub.widget.Ruter27Widgets.refreshNow(c) } }
    }
}

/** «Legg til eller fjern stopp ›»: Avganger i redigeringsmodus. */
fun AppViewModel.manageStops27() {
    b27.homeSheet = false
    openRuter()
    stopEdit = true
}

/* ---------- Abonnement fra skjermbilde ---------- */

internal fun parseShot27(raw: String): SubShot27 {
    val o = JSONObject(raw)
    val sik = o.optJSONObject("sikkerhet")
    val unsure = sik?.let { j -> j.keys().asSequence().filter { k -> j.optDouble(k, 1.0) < 0.8 }.toList() } ?: emptyList()
    val check = (o.optJSONArray("check").strings() + unsure).toSet()
    val cyc = when ((o.optStr("syklus") ?: o.optStr("cycle") ?: "mnd").lowercase()) { "år", "ar", "yearly", "year", "årlig" -> "yearly"; else -> "monthly" }
    val price = (o.optDoubleOrNull("pris") ?: o.optDoubleOrNull("price") ?: 0.0) / 100.0
    val next = o.optStr("neste_trekk") ?: o.optStr("next")
    return SubShot27(
        o.optStr("tjeneste") ?: o.optStr("service") ?: "Abonnement", o.optStr("plan") ?: "", price, o.optStr("valuta") ?: "NOK",
        o.optJSONObject("prisOriginal")?.optStr("tekst") ?: o.optStr("prisOriginal"), cyc, next, o.optStr("kategori") ?: o.optStr("category") ?: "Annet", o.optStr("logoUrl"), o.optStr("domain"),
        check, o.optIntOrNull("existingId")?.takeIf { it > 0 },
    )
}

/** Velg skjermbilde → Ollama (bildemodell, lokalt) leser tjeneste, plan, pris, syklus og neste trekk. Bildet slettes på serveren. */
fun AppViewModel.subFromShot27(ctx: Context, uri: Uri) {
    val s = b27
    s.shotOpen = true; s.shot = null; s.shotError = null; s.shotBusy = true
    s.shotName = runCatching { ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull() ?: "Skjermbilde"
    launch27b {
        try {
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: throw ApiException("Fikk ikke lest bildet")
            s.shotThumb = withContext(Dispatchers.Default) {
                runCatching {
                    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(data, 0, data.size, o)
                    var sample = 1
                    while (maxOf(o.outWidth, o.outHeight) / (sample * 2) >= 400) sample *= 2
                    BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
                }.getOrNull()
            }
            val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val raw = api27b { upload("/subscriptions/from-screenshot", listOf(Api.Part("image", "skjermbilde." + mime.substringAfter('/'), mime, data))) }
            val r = parseShot27(raw)
            // Finnes tjenesten allerede: tilby oppdatering.
            val have = r.existingId ?: subsX?.items?.firstOrNull { it.name.equals(r.service, ignoreCase = true) }?.id
            s.shot = r.copy(existingId = have)
        } catch (e: ApiException) {
            s.shotError = when (e.status) { 404 -> "Fra skjermbilde trenger en nyere Homelab-server."; 501 -> "Ingen bildemodell i Ollama på serveren (f.eks. qwen2.5vl:7b)."; else -> e.message }
        } finally { s.shotBusy = false }
    }
}

/** Dag i måneden og måned for neste trekk (mangler den: i dag + syklus). */
fun shotDay27(r: SubShot27): Pair<Int, Int> {
    val d = runCatching { LocalDate.parse(r.next?.take(10)) }.getOrNull() ?: LocalDate.now().let { if (r.cycle == "yearly") it.plusYears(1) else it.plusMonths(1) }
    return d.dayOfMonth to d.monthValue
}

fun AppViewModel.addShot27(r: SubShot27) {
    val (day, mon) = shotDay27(r)
    val old = r.existingId?.let { id -> subsX?.items?.firstOrNull { it.id == id } }
    saveSub(old?.id, old?.name ?: r.service, r.plan, r.price, r.cycle, day, if (r.cycle == "monthly") null else mon, old?.category ?: r.category, if (old != null && !old.active) "cancelled" else "active")
    b27.shot = null; b27.shotOpen = false; b27.shotThumb = null
}

fun AppViewModel.editShot27(r: SubShot27) {
    b27.shotOpen = false
    b27.shot = null
    val old = r.existingId?.let { id -> subsX?.items?.firstOrNull { it.id == id } }
    if (old != null) { b27.subPrefill = r; m23.subEditId = old.id } else { b27.subPrefill = r; m23.subEditNew = true }
    subAdding = false
}
