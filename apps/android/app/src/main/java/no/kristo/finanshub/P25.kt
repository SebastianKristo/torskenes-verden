package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import org.json.JSONObject

/*
 * Prompt 25: fanelinje-stil (layout.navStyle), ikonnavn fra iOS og web i fanelinja, AI-søk som jobb med fremdrift og Avbryt,
 * klient-tidsgrense fra /finans/api/ai/limits og fremheving av en rad i Innstillinger («Ta meg dit →»).
 * Kodet mot kontrakten (CONTRACT25), med reserve når serveren svarer 404.
 */

/* ---------- Fanelinje-stil ---------- */

/** Stilene i fanelinja: «text» (navn på alle, ikon på valgt), «icons» (bare ikoner) og «icons_active_label» (ikoner, navn på valgt). */
val NAV_STYLES25: List<Triple<String, String, String>> = listOf(
    Triple("text", "Tekst", "Navn på alle · ikon på valgt fane"),
    Triple("icons", "Bare ikoner", "Ikoner uten navn"),
    Triple("icons_active_label", "Ikoner + navn på valgt", "Ikoner · valgt fane viser også navn"),
)

/** Stilen alle fanelinjene tegnes med. Ligger utenfor ViewModel så fanene (PaperTab24) kan lese den uten vm. */
object NavStyle25 {
    var v by mutableStateOf("text")
}

private const val NAV_STYLE_PREF = "nav_style_25"

/** Godtar også verdiene fra designet (tekst / ikon / ikonNavn). */
fun normNavStyle25(s: String?): String? = when (s?.trim()) {
    "text", "tekst" -> "text"
    "icons", "ikon" -> "icons"
    "icons_active_label", "ikonNavn" -> "icons_active_label"
    else -> null
}

fun AppViewModel.loadNavStyle25() {
    normNavStyle25(prefs.str(NAV_STYLE_PREF, ""))?.let { NavStyle25.v = it }
}

/** Fra GET /api/me/layout (navStyle, eller nav_style_labels fra eldre utkast). */
fun AppViewModel.applyNavStyle25(raw: String) {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val v = normNavStyle25(o.optStr("navStyle") ?: o.optStr("nav_style_labels")) ?: return
    NavStyle25.v = v
    prefs.set(NAV_STYLE_PREF, v)
}

fun AppViewModel.setNavStyle25(v: String) {
    val s = normNavStyle25(v) ?: return
    NavStyle25.v = s
    prefs.set(NAV_STYLE_PREF, s)
    Haptics.select()
    launch25 { runCatching { api25 { hlPut("/me/layout", JSONObject().put("navStyle", s)) } } }
}

/* ---------- Ikonnavn i fanelinja ---------- */

/*
 * Feilen på Fold («cre», «for», «squ», «mag», «ell»): iOS og web lagrer layout.tabBar med SF Symbol-navn
 * («creditcard», «fork.knife», «square.grid.2x2», «magnifyingglass», «ellipsis»). parseLayout16 kuttet ikonet til 3 tegn,
 * og GlyphIcon tegnet ukjente ikoner som tekst. Skinnen på Fold viser ikon på alle faner, så det ble synlig der.
 * Nå oversettes navnene til appens ikoner, og ukjente ikoner får fanens standardikon, aldri tekst.
 */
private val ICON_NAMES25: Map<String, String> = mapOf(
    "house" to "⌂", "home" to "⌂", "house.fill" to "⌂", "building.2" to "⌂", "building" to "⌂",
    "creditcard" to "kr", "credit_card" to "kr", "wallet" to "kr", "banknote" to "kr", "account_balance_wallet" to "kr", "payments" to "kr",
    "fork.knife" to "◐", "fork_knife" to "◐", "restaurant" to "◐", "food" to "◐",
    "globe" to "◎", "language" to "◎", "public" to "◎", "square.grid.2x2" to "◎", "square.grid.3x3.fill" to "◎",
    "shippingbox" to "▣", "package" to "▣", "local_shipping" to "▣", "inventory_2" to "▣",
    "person.2" to "◉", "people" to "◉", "group" to "◉", "family" to "◉", "map" to "◉", "mappin" to "◉",
    "tram" to "⇄", "bus" to "⇄", "directions_bus" to "⇄", "train" to "⇄", "tram.fill" to "⇄",
    "cloud.sun" to "☀", "sun.max" to "☀", "wb_sunny" to "☀", "weather" to "☀",
    "newspaper" to "▤", "news" to "▤", "rss" to "▤",
    "chart.line.uptrend.xyaxis" to "↗", "show_chart" to "↗", "trending_up" to "↗", "chart" to "↗", "chart.bar" to "↗",
    "repeat" to "↻", "autorenew" to "↻", "arrow.clockwise" to "↻", "arrow.triangle.2.circlepath" to "↻",
    "music.note" to "♪", "music" to "♪", "play" to "♪", "play.circle" to "♪", "music_note" to "♪",
    "magnifyingglass" to "⌕", "search" to "⌕",
    "ellipsis" to "⋯", "more" to "⋯", "more_horiz" to "⋯", "ellipsis.circle" to "⋯",
    "star" to "★", "heart" to "♥", "favorite" to "♥", "envelope" to "✉", "mail" to "✉", "flag" to "⚑", "diamond" to "◆",
    "checklist" to "✓", "checkmark" to "✓", "bolt" to "⚡", "leaf" to "☘", "bag" to "◘", "cart" to "◘", "calendar" to "▦",
)

/** Ikonet fanen skal tegnes med: tegnet appen kjenner, oversatt navn, eller fanens standardikon. Aldri et avkuttet navn. */
fun tabGlyph25(id: String, raw: String?): String {
    val def = MAIN_TABS.firstOrNull { it.id == id }?.icon ?: "⋯"
    val r = raw?.trim().orEmpty()
    if (r.isEmpty()) return def
    if (r in TAB_ICONS) return r
    return iconNameGlyph25(r) ?: def
}

/** Ikonnavn (SF Symbol / Material) → tegnet appen tegner med, eller null. */
fun iconNameGlyph25(raw: String): String? {
    val k = raw.trim().lowercase()
    return ICON_NAMES25[k] ?: ICON_NAMES25[k.substringBefore(".fill")] ?: ICON_NAMES25[k.substringBefore('.')]
}

/** SF Symbol-navnet som lagres på serveren, så iOS og web forstår ikonet appen har valgt. */
fun tabIconName25(glyph: String): String = when (glyph) {
    "kr" -> "creditcard"; "◐" -> "fork.knife"; "◎" -> "globe"; "▣" -> "shippingbox"; "◉" -> "person.2"; "⇄" -> "tram"; "☀" -> "cloud.sun"
    "▤" -> "newspaper"; "↗" -> "chart.line.uptrend.xyaxis"; "⌂" -> "house"; "↻" -> "repeat"; "♪" -> "music.note"; "⌕" -> "magnifyingglass"
    "⋯" -> "ellipsis"; "★" -> "star"; "♥" -> "heart"; "✉" -> "envelope"; "⚑" -> "flag"; "◆" -> "diamond"; "✓" -> "checklist"
    "⚡" -> "bolt"; "☘" -> "leaf"; "◘" -> "bag"; "▦" -> "calendar"
    else -> glyph
}

/** iOS kaller den automatiske fjerde fanen «Domener/Sporing». */
fun isAutoTab25(t: TabItem): Boolean = t.id == "domener" && t.label.contains('/')

/* ---------- AI-søk som jobb ---------- */

/** En AI-jobb som pågår: motor, sekunder brukt og grensen, og teksten som vises («✦ Ollama tenker … 34 s av 60 s»). */
data class AiJob25(val id: String?, val engine: String?, val elapsedS: Int, val limitS: Int?, val text: String)

/** Avbrutt av brukeren (Avbryt under AI-søket). */
class AiCancelled25 : Exception(AI_CANCELLED25)
const val AI_CANCELLED25 = "Avbrutt"

class P25State {
    /** Klientens tidsgrense i sekunder (clientTimeoutS fra /finans/api/ai/limits). Standard 180. */
    var clientTimeoutS by mutableStateOf(180)
    var limitsAt = 0L
    var job by mutableStateOf<AiJob25?>(null)
    @Volatile var cancelled = false

    /** «Ta meg dit →» og søketreff i Innstillinger: raden som fremheves, og en teller som starter scroll og animasjon på nytt. */
    var hl by mutableStateOf<String?>(null)
    var hlSeq by mutableStateOf(0)
    /** Omtrentlig plass i listen på hovedsiden (gruppekortet), så raden blir komponert før den scrolles fram. */
    var hlIndex by mutableStateOf<Int?>(null)
}

/** Leser klientgrensen fra serveren (hvert 5. minutt). 404 eller feil: beholder 180 s. */
suspend fun AppViewModel.aiClientTimeout25(): Int {
    val now = System.currentTimeMillis()
    if (p25.limitsAt > 0 && now - p25.limitsAt < 5 * 60_000) return p25.clientTimeoutS
    p25.limitsAt = now
    val s = runCatching { JSONObject(api25 { get("/ai/limits") }).optInt("clientTimeoutS", 0) }.getOrNull()
    if (s != null && s > 0) p25.clientTimeoutS = s.coerceIn(30, 900)
    return p25.clientTimeoutS
}

private fun jobText25(engine: String?, el: Int, lim: Int?): String =
    "✦ ${engine?.replaceFirstChar { it.uppercase() } ?: "AI"} tenker … $el s" + (lim?.let { " av $it s" } ?: "")

/**
 * POST /finans/api/search/ai i jobbmodus (?async=1 og Prefer: respond-async på serveren). Raske svar kommer direkte;
 * ellers 202 {jobId}, og jobben følges hvert sekund via GET /finans/api/jobs/:id. Uten jobb-API (404) brukes det
 * synkrone kallet, med lesegrense fra clientTimeoutS i stedet for fast 30 s. Returnerer rå JSON i samme form som før.
 */
suspend fun AppViewModel.aiSearchRaw25(body: JSONObject): String {
    val limit = aiClientTimeout25()
    val readMs = limit * 1000 + 5_000
    p25.cancelled = false
    p25.job = AiJob25(null, null, 0, null, "✦ Søker …")
    try {
        val first = api25 { request("POST", "/search/ai?async=1", body, timeout = 15_000, read = readMs) }
        if (p25.cancelled) throw AiCancelled25()
        val o = runCatching { JSONObject(first) }.getOrNull()
        val id = o?.optStr("jobId") ?: o?.optStr("job_id")
        if (o == null || id == null || o.has("answer") || o.has("hits")) return first
        return pollAiJob25(id, limit) ?: api25 { request("POST", "/search/ai", body, timeout = 15_000, read = readMs) }
    } finally {
        p25.job = null
    }
}

/** Følger jobben til den er ferdig. null = serveren har ikke jobb-API (404), og kallet gjøres synkront. */
private suspend fun AppViewModel.pollAiJob25(id: String, limit: Int): String? {
    val start = System.currentTimeMillis()
    while (true) {
        delay(1000)
        if (p25.cancelled) throw AiCancelled25()
        val raw = try { api25 { get("/jobs/$id") } } catch (e: ApiException) {
            if (e.status == 404) return null
            throw e
        }
        if (p25.cancelled) throw AiCancelled25()
        val j = JSONObject(raw)
        val engine = j.optStr("engine")
        val el = j.optInt("elapsedS", ((System.currentTimeMillis() - start) / 1000).toInt())
        val lim = j.optInt("limitS", 0).takeIf { it > 0 }
        p25.job = AiJob25(id, engine, el, lim, j.optStr("text") ?: jobText25(engine, el, lim))
        when (j.optStr("status")) {
            "done" -> return j.optJSONObject("result")?.toString() ?: raw
            "error" -> throw ApiException(j.optStr("error") ?: "AI-søket feilet")
            "cancelled" -> throw AiCancelled25()
        }
        // Jobben kan gå videre til neste motor (Gemini → Groq …), så appen venter lenger enn én motorgrense før den gir opp.
        if (System.currentTimeMillis() - start > (limit * 2 + 15) * 1000L) {
            runCatching { api25 { delete("/jobs/$id") } }
            throw ApiException("${engine?.replaceFirstChar { it.uppercase() } ?: "AI"} svarte ikke innen $limit s")
        }
    }
}

/** Avbryt: stopper jobben på serveren (DELETE /finans/api/jobs/:id) og i appen. */
fun AppViewModel.cancelAiJob25() {
    p25.cancelled = true
    val id = p25.job?.id
    p25.job = null
    if (id != null) launch25 { runCatching { api25 { delete("/jobs/$id") } } }
}

/* ---------- Innstillinger: «Ta meg dit →» ---------- */

/** Fremhev en rad i ca. 3 s (scroll fram, lys rød bakgrunn og rød strek som toner ut). */
fun AppViewModel.highlight25(key: String, index: Int? = null) {
    p25.hl = key
    p25.hlIndex = index
    p25.hlSeq++
}
