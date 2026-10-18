package no.kristo.finanshub

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/*
 * Prompt 23 (MOD): Abonnementer (rekkefølge på Hjem), Finn-annonsen i appen, ikoner på fanene i Nyhetsleser (Iconify via
 * /api/icons) og tidsgrenser for AI-motorene. Alt kodet mot kontrakten, med reserve når serveren svarer 404.
 */

/* ---------- Modeller ---------- */

/** Annonsen fra GET /finans/api/finn/:id/ad. */
data class FinnAd23(
    val title: String?, val price: Double?, val description: String?, val attrs: List<Pair<String, String>>, val images: List<String>,
    val url: String?, val fetchedAt: String?, val removed: Boolean,
)
/** Én melding med motparten (hentet fra e-postvarsler). */
data class FinnMsg23(val mine: Boolean, val text: String, val time: String?)
/** Tidsgrenser per motor i sekunder, nye forsøk (0–3) og hva som skjer ved tidsavbrudd (next | ocr | queue). */
data class AiTimeouts23(val gemini: Int = 20, val groq: Int = 15, val roboflow: Int = 15, val ollama: Int = 45, val retries: Int = 0, val onTimeout: String = "next") {
    fun toJson(): JSONObject = JSONObject().put("gemini", gemini).put("groq", groq).put("roboflow", roboflow).put("ollama", ollama).put("retries", retries).put("onTimeout", onTimeout)
}

/** Kortene på Abonnementer → Hjem, i standardrekkefølge (layout-feltet subHomeOrder). */
val SUB_HOME_DEFAULT = listOf("ai", "next7", "check", "list")
/** Trinnene når man trykker på en tidsgrense. */
val AI_TO_STEPS = listOf(5, 10, 15, 20, 30, 45, 60, 90, 120)
/** Ikonbibliotekene i velgeren (samme som Nyhetsleser.dc.html og /api/icons/sets). */
val ICON_LIBS = listOf("" to "Alle", "lucide" to "Lucide", "material-symbols" to "Material Symbols", "mdi" to "Material Design", "ph" to "Phosphor", "tabler" to "Tabler",
    "heroicons" to "Heroicons", "fa6-solid" to "Font Awesome", "ri" to "Remix", "fluent" to "Fluent", "bi" to "Bootstrap", "iconoir" to "Iconoir", "carbon" to "Carbon",
    "solar" to "Solar", "mingcute" to "MingCute", "streamline" to "Streamline", "noto" to "Noto emoji", "twemoji" to "Twemoji")
/** Sett med egne farger (emoji, logoer, flagg): vises i farger, ikke i tekstfargen. */
val ICON_COLOR_SETS = setOf("noto", "twemoji", "fluent-emoji", "logos", "flag", "circle-flags")
fun iconIsColor(id: String) = id.substringBefore(':') in ICON_COLOR_SETS || id.contains("emoji")
/** Standardikonene per kategori-id (som ICON_DEFAULTS på serveren). */
val NEWS_ICON_DEFAULTS = mapOf("siste" to "lucide:zap", "norge" to "lucide:mountain-snow", "verden" to "lucide:globe", "okonomi" to "lucide:trending-up",
    "sport" to "lucide:trophy", "teknologi" to "lucide:cpu", "kultur" to "lucide:drama")
/** Innebygd ordliste uten AI: kategori → engelsk søkeord. */
private val ICON_KW = mapOf("siste" to "news", "norge" to "mountain", "verden" to "globe", "okonomi" to "chart", "sport" to "trophy", "teknologi" to "chip", "kultur" to "theater",
    "helse" to "heart", "politikk" to "government", "vaer" to "weather", "mat" to "food", "reise" to "travel", "bil" to "car", "musikk" to "music", "film" to "film")
fun iconKeyword(cat: String): String = ICON_KW[cat.lowercase().replace("ø", "o").replace("æ", "ae").replace("å", "a")] ?: cat.lowercase()

/** All tilstand for prompt 23-modulene (ett felt i AppViewModel). */
class Mod23State {
    // Abonnementer
    var subOrder by mutableStateOf(SUB_HOME_DEFAULT)
    var subOrderLoaded by mutableStateOf(false)
    var subArrange by mutableStateOf(false)
    var subDrag by mutableStateOf<String?>(null)
    var subEditId by mutableStateOf<Int?>(null)
    var subEditNew by mutableStateOf(false)
    // Finn-annonsen
    var finnAdFor by mutableStateOf<Int?>(null)
    var finnAd by mutableStateOf<FinnAd23?>(null)
    var finnMails by mutableStateOf<List<FinnMail>?>(null)
    var finnMailOpen by mutableStateOf<String?>(null)
    val finnMailBody = mutableStateMapOf<String, String>()
    var finnChat by mutableStateOf<List<FinnMsg23>?>(null)
    var finnChatUrl by mutableStateOf<String?>(null)
    var finnAdBusy by mutableStateOf(false)
    // AI-tidsgrenser
    var aiTo by mutableStateOf<AiTimeouts23?>(null)
    // Ikoner i Nyhetsleser
    var icPickFor by mutableStateOf<String?>(null)
    var icQuery by mutableStateOf("")
    var icLib by mutableStateOf("")
    var icResults by mutableStateOf<List<String>?>(null)
    var icTotal by mutableStateOf(0)
    var icBusy by mutableStateOf(false)
    var icError by mutableStateOf<String?>(null)
    var icAiBusy by mutableStateOf(false)
    var icAiAllBusy by mutableStateOf(false)
    internal var icSeq = 0
    /** Ferdig tolkede SVG-er per «prefix:name» (null = finnes ikke). */
    val icons = mutableStateMapOf<String, ImageVector?>()
    internal val iconLoading = HashSet<String>()
}

/* ---------- Abonnementer: rekkefølgen på Hjem ---------- */

internal fun normalizeSubOrder(l: List<String>): List<String> {
    val known = l.map { if (it == "next") "next7" else it }.filter { it in SUB_HOME_DEFAULT }.distinct()
    return known + SUB_HOME_DEFAULT.filter { it !in known }
}

/** Leser subHomeOrder fra /api/me/layout én gang (per bruker; lokalt lagret rekkefølge brukes til svaret kommer). */
fun AppViewModel.loadSubOrder23() {
    val s = m23
    if (s.subOrderLoaded) return
    s.subOrderLoaded = true
    val key = "sub_home_order" + (account?.id ?: "")
    prefs.str(key, "").takeIf { it.isNotBlank() }?.let { s.subOrder = normalizeSubOrder(it.split(',')) }
    launch23 {
        val raw = runCatching { api23 { hlGet("/me/layout") } }.getOrNull() ?: return@launch23
        val a = runCatching { JSONObject(raw).optJSONArray("subHomeOrder") }.getOrNull() ?: return@launch23
        s.subOrder = normalizeSubOrder((0 until a.length()).map { a.optString(it) })
        prefs.set(key, s.subOrder.joinToString(","))
    }
}

fun AppViewModel.saveSubOrder23(l: List<String>) {
    val o = normalizeSubOrder(l)
    m23.subOrder = o
    prefs.set("sub_home_order" + (account?.id ?: ""), o.joinToString(","))
    launch23 { runCatching { api23 { hlPut("/me/layout", JSONObject().put("subHomeOrder", JSONArray(o))) } } }
}

/** Flytter et kort ett steg opp (-1) eller ned (+1). */
fun AppViewModel.moveSubCard23(id: String, dir: Int) {
    val l = m23.subOrder.toMutableList()
    val i = l.indexOf(id)
    val j = i + dir
    if (i < 0 || j !in l.indices) return
    l.removeAt(i); l.add(j, id)
    Haptics.select()
    saveSubOrder23(l)
}

/* ---------- Finn-annonsen ---------- */

private fun JSONObject.strList(k: String): List<String> = optJSONArray(k)?.let { a ->
    (0 until a.length()).mapNotNull { i -> a.optString(i).takeIf { it.isNotBlank() && !it.startsWith("{") } ?: a.optJSONObject(i)?.optStr("url") }
} ?: emptyList()

fun parseFinnAd23(s: String): FinnAd23 {
    val o = JSONObject(s).let { it.optJSONObject("ad") ?: it }
    val attrs = o.optJSONArray("attrs")?.map { (it.optStr("label") ?: "") to (it.optStr("value") ?: "") }?.filter { it.first.isNotBlank() && it.second.isNotBlank() } ?: emptyList()
    return FinnAd23(o.optStr("title"), o.optDoubleOrNull("price"), o.optStr("description"), attrs, o.strList("images"), o.optStr("url"), o.optStr("fetchedAt") ?: o.optStr("saved"), o.optBoolean("removed"))
}

private fun parseMails23(s: String): List<FinnMail> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("emails") ?: it.optJSONArray("items") } ?: JSONArray()
    return a.map { m -> FinnMail(m.optStr("id") ?: "", m.optStr("date"), m.optStr("from"), m.optStr("subject"), m.optStr("snippet"), m.optStr("body") ?: m.optStr("text")) }
}

/** Åpner annonsen i appen: henter annonse, e-poster og meldinger. 404 fra en eldre server: bruk det handelen allerede har. */
fun AppViewModel.openFinnAd23(id: Int) {
    val s = m23
    s.finnAdFor = id; s.finnAd = null; s.finnMails = null; s.finnChat = null; s.finnChatUrl = null; s.finnMailOpen = null
    openFinn(id)
    launch23 {
        s.finnAdBusy = true
        try {
            s.finnAd = runCatching { parseFinnAd23(api23 { get("/finn/$id/ad") }) }.getOrNull()
            if (s.finnAdFor != id) return@launch23
            s.finnMails = runCatching { parseMails23(api23 { get("/finn/$id/emails") }) }.getOrNull()
            // {items:[{id, from:'me'|'them', text, time}], chatUrl} (eldre form: bar liste eller «messages»).
            val chat = runCatching { JSONObject(api23 { get("/finn/$id/messages") }.let { if (it.trimStart().startsWith("[")) "{\"items\":$it}" else it }) }.getOrNull()
            s.finnChat = (chat?.optJSONArray("items") ?: chat?.optJSONArray("messages"))?.map { FinnMsg23(it.optStr("from") == "me", it.optStr("text") ?: "", it.optStr("time")) } ?: emptyList()
            s.finnChatUrl = chat?.optStr("chatUrl")
        } finally { s.finnAdBusy = false }
    }
}

fun AppViewModel.closeFinnAd23() {
    m23.finnAdFor = null
    finnSel = null
    finnDetail = null
}

/** Trykk på en e-post: åpner eller lukker den, og henter hele teksten første gang. */
fun AppViewModel.toggleFinnMail23(id: Int, m: FinnMail) {
    val s = m23
    s.finnMailOpen = if (s.finnMailOpen == m.id) null else m.id
    if (s.finnMailOpen == null || m.id.isBlank() || s.finnMailBody.containsKey(m.id)) return
    launch23 {
        val body = runCatching { JSONObject(api23 { get("/finn/$id/emails/${m.id}") }).let { it.optStr("body") ?: it.optStr("text") ?: it.optStr("html")?.replace(Regex("<[^>]+>"), " ") } }.getOrNull()
        s.finnMailBody[m.id] = body ?: m.body ?: m.snippet ?: ""
    }
}

fun AppViewModel.refreshFinnAd23(id: Int) = launch23 {
    m23.finnAdBusy = true
    try {
        m23.finnAd = runCatching { parseFinnAd23(api23 { post("/finn/$id/ad/refresh") }) }.getOrNull()
            ?: runCatching { parseFinnAd23(api23 { get("/finn/$id/ad") }) }.getOrNull() ?: m23.finnAd
        flash(if (m23.finnAd?.removed == true) "Annonsen er fjernet fra Finn · viser den lagrede kopien" else "✦ Annonsen er hentet på nytt")
    } finally { m23.finnAdBusy = false }
}

/* ---------- AI-tidsgrenser ---------- */

private fun parseAiTo(o: JSONObject?): AiTimeouts23? {
    if (o == null) return null
    val d = AiTimeouts23()
    fun sec(k: String, def: Int) = o.optIntOrNull(k)?.coerceIn(5, 120) ?: def
    return AiTimeouts23(sec("gemini", d.gemini), sec("groq", d.groq), sec("roboflow", d.roboflow), sec("ollama", d.ollama),
        (o.optIntOrNull("retries") ?: o.optIntOrNull("ret") ?: d.retries).coerceIn(0, 3), (o.optStr("onTimeout") ?: o.optStr("on_timeout") ?: d.onTimeout).takeIf { it in listOf("next", "ocr", "queue") } ?: "next")
}

/** Henter tidsgrensene fra FinansHub-innstillingene (bootstrap). Eldre server: lokalt lagret verdi, ellers standard. */
fun AppViewModel.loadAiTimeouts23() {
    val local = runCatching { parseAiTo(JSONObject(prefs.str("papir_ai_to", "{}"))) }.getOrNull()
    if (m23.aiTo == null) m23.aiTo = local ?: AiTimeouts23()
    launch23 {
        // GET /settings gir .aiTimeouts direkte; eldre server: bootstrap → settings.aiTimeouts.
        val st = runCatching { JSONObject(api23 { get("/settings") }).takeIf { it.has("aiTimeouts") } }.getOrNull()
            ?: runCatching { JSONObject(api23 { get("/bootstrap") }).optJSONObject("settings") }.getOrNull() ?: return@launch23
        (parseAiTo(st.optJSONObject("aiTimeouts")) ?: parseAiTo(st.optJSONObject("ai_timeouts")))?.let { m23.aiTo = it; prefs.set("papir_ai_to", it.toJson().toString()) }
    }
}

fun AppViewModel.saveAiTimeouts23(t: AiTimeouts23) {
    m23.aiTo = t
    Haptics.select()
    prefs.set("papir_ai_to", t.toJson().toString())
    launch23 { runCatching { api23 { put("/settings", JSONObject().put("aiTimeouts", t.toJson())) } } }
}

/* ---------- Ikoner (Iconify via /api/icons) ---------- */

private suspend fun plainGet(url: String): String? = withContext(Dispatchers.IO) {
    runCatching {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = 12000
            if (c.responseCode >= 400) null else c.inputStream.bufferedReader().use { it.readText() }
        } finally { c.disconnect() }
    }.getOrNull()
}

private fun iconFile(app: Application, id: String): File = File(File(app.cacheDir, "icons23").apply { mkdirs() }, id.replace(':', '_').replace('/', '_') + ".svg")

/** Henter og tolker ett ikon («prefix:name»): minne, så disk, så /api/icons/:prefix/:name.svg (reserve: api.iconify.design). */
fun AppViewModel.loadIcon23(id: String) {
    val s = m23
    if (id.isBlank() || s.icons.containsKey(id) || !s.iconLoading.add(id)) return
    val (prefix, name) = id.substringBefore(':') to id.substringAfter(':')
    launch23 {
        try {
            val app = getApplication<Application>()
            val f = iconFile(app, id)
            var svg = withContext(Dispatchers.IO) { runCatching { f.takeIf { it.exists() }?.readText() }.getOrNull() }
            if (svg == null) {
                svg = runCatching { api23 { bytes("/api/icons/$prefix/$name.svg") }.decodeToString() }.getOrNull()?.takeIf { it.contains("<svg") }
                    ?: plainGet("https://api.iconify.design/$prefix/$name.svg")?.takeIf { it.contains("<svg") }
                if (svg != null) withContext(Dispatchers.IO) { runCatching { f.writeText(svg) } }
            }
            s.icons[id] = svg?.let { withContext(Dispatchers.Default) { Svg23.parse(it) } }
        } finally { s.iconLoading.remove(id) }
    }
}

private fun parseIconIds(raw: String): Pair<List<String>, Int> {
    val o = JSONObject(raw)
    val a = o.optJSONArray("icons") ?: JSONArray()
    val ids = (0 until a.length()).mapNotNull { i ->
        a.optJSONObject(i)?.let { x -> x.optStr("id") ?: x.optStr("prefix")?.let { p -> x.optStr("name")?.let { "$p:$it" } } } ?: a.optString(i).takeIf { it.contains(':') }
    }
    return ids to o.optInt("total", ids.size)
}

/** Søk i ikonvelgeren: opptil 96 treff, filtrert på bibliotek. */
fun AppViewModel.searchIcons23(q0: String = m23.icQuery, lib: String = m23.icLib) {
    val s = m23
    val q = q0.trim()
    if (q.isEmpty()) return
    val seq = ++s.icSeq
    s.icBusy = true; s.icError = null
    launch23 {
        try {
            val enc = URLEncoder.encode(q, "UTF-8")
            val raw = runCatching { api23 { hlGet("/icons/search?q=$enc&prefix=$lib&limit=96") } }.getOrNull()
                ?: plainGet("https://api.iconify.design/search?limit=96&query=$enc" + if (lib.isNotBlank()) "&prefixes=$lib" else "")
            if (seq != s.icSeq) return@launch23
            if (raw == null) { s.icResults = emptyList(); s.icError = "Fikk ikke kontakt med ikonbiblioteket"; return@launch23 }
            val (ids, total) = parseIconIds(raw)
            s.icResults = ids.take(96); s.icTotal = total
        } finally { if (seq == s.icSeq) s.icBusy = false }
    }
}

/** ✦ AI foreslår ett engelsk nøkkelord, og første treff i valgt bibliotek brukes (Lucide som standard). */
suspend fun AppViewModel.suggestIcon23(catId: String, label: String): String? {
    val lib = m23.icLib.ifBlank { "lucide" }
    val r = runCatching { JSONObject(api23 { hlPost("/icons/suggest", JSONObject().put("label", label).put("prefix", lib)) }) }.getOrNull()
    r?.optStr("icon")?.takeIf { it.contains(':') }?.let { return it }
    val kw = r?.optStr("keyword") ?: iconKeyword(catId)
    val enc = URLEncoder.encode(kw, "UTF-8")
    val raw = runCatching { api23 { hlGet("/icons/search?q=$enc&prefix=$lib&limit=8") } }.getOrNull()
        ?: plainGet("https://api.iconify.design/search?limit=8&query=$enc&prefixes=$lib")
    return raw?.let { runCatching { parseIconIds(it).first.firstOrNull() }.getOrNull() } ?: NEWS_ICON_DEFAULTS[catId]
}

/** Gjeldende ikon for en fane: eget valg ('' = ingen), ellers standard. */
fun NewsData.iconFor(cat: String): String? = if (ic.containsKey(cat)) ic[cat]?.ifBlank { null } else (iconDefaults[cat] ?: NEWS_ICON_DEFAULTS[cat])

/** Lagrer ikonvalgene i hl_rss (PUT /api/rss/settings med hele kartene). */
fun AppViewModel.saveNewsIcons23(ic: Map<String, String>, src: Map<String, String>, on: Boolean) {
    news = news?.copy(ic = ic, icSrc = src, icOn = on)
    launch23 {
        runCatching { api23 { hlPut("/rss/settings", JSONObject().put("ic", JSONObject(ic as Map<*, *>)).put("icSrc", JSONObject(src as Map<*, *>)).put("icOn", on)) } }
            .onFailure { e -> if ((e as? ApiException)?.status != 404) message = e.message }
    }
}

fun AppViewModel.pickNewsIcon23(cat: String, id: String, src: String) {
    val d = news ?: return
    saveNewsIcons23(d.ic + (cat to id), d.icSrc + (cat to src), d.icOn)
    m23.icPickFor = null; m23.icResults = null
    Haptics.success()
}

fun AppViewModel.aiPickIcon23(cat: String, label: String, close: Boolean = true) = launch23 {
    m23.icAiBusy = true
    try {
        val id = suggestIcon23(cat, label) ?: return@launch23
        val d = news ?: return@launch23
        saveNewsIcons23(d.ic + (cat to id), d.icSrc + (cat to "ai"), d.icOn)
        if (close) { m23.icPickFor = null; m23.icResults = null }
    } finally { m23.icAiBusy = false }
}

fun AppViewModel.aiPickAllIcons23(cats: List<NewsCategory>) = launch23 {
    m23.icAiAllBusy = true
    try {
        var ic = news?.ic ?: emptyMap()
        var src = news?.icSrc ?: emptyMap()
        for (c in cats) {
            val id = suggestIcon23(c.id, c.name) ?: continue
            ic = ic + (c.id to id); src = src + (c.id to "ai")
            news = news?.copy(ic = ic, icSrc = src)
        }
        saveNewsIcons23(ic, src, news?.icOn ?: true)
        Haptics.success()
    } finally { m23.icAiAllBusy = false }
}

/* ---------- Home Assistant (Integrasjoner) ---------- */

/** Status for tilkoblingen, utledet av /api/tasks/ha: entiteter funnet = tilkoblet. */
fun TasksHa.connText(): String = when {
    entities.isNotEmpty() -> "Tilkoblet"
    error?.contains("ikke satt opp", ignoreCase = true) == true -> "Ikke satt opp"
    error != null -> "Feil"
    else -> "Ikke tilkoblet"
}
