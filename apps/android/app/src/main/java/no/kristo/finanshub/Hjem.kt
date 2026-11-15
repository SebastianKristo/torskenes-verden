package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlinx.coroutines.Job
import org.json.JSONArray
import org.json.JSONObject

/* ======================= Wiggle på Hjem ======================= */

/** Synlige kort på en side i rekkefølge. */
fun AppViewModel.pageVisible37(page: String, keys: List<String>): List<String> { val h = pageHidden(page); return pageOrder(page, keys).filter { it !in h } }

/**
 * Bytte-retning (−1/0/+1): bare når pekeren står i midtre 30 % av nabokortet (høyden) og innenfor bredden,
 * maks én gang per 140 ms. Ukjente og skjulte kort (uten målte grenser) ignoreres.
 */
fun AppViewModel.wiggleHit37(page: String, vis: List<String>, key: String, ptr: Offset): Int {
    val s = p37
    val now = android.os.SystemClock.uptimeMillis()
    if (now - s.lastSw < 140) return 0
    val i = vis.indexOf(key)
    if (i < 0 || ptr.x.isNaN() || ptr.y.isNaN()) return 0
    for (dir in intArrayOf(-1, 1)) {
        val o = vis.getOrNull(i + dir) ?: continue
        val r = s.bounds["$page|$o"] ?: continue
        if (r.height <= 1f || r.width <= 1f) continue
        val top = r.top + r.height * .35f
        val bot = r.top + r.height * .65f
        if (ptr.y in top..bot && ptr.x in r.left..r.right) { s.lastSw = now; return dir }
    }
    return 0
}

/** Auto-scroll når fingeren er nær topp/bunn av listen (40 dp): −1 … 1 (styrken), 0 = stå stille. */
fun AppViewModel.wiggleEdge37(y: Float, zonePx: Float) {
    val s = p37
    if (s.gridBottom - s.gridTop < zonePx * 3) { s.edgeDir = 0f; return }
    s.edgeDir = when {
        y < s.gridTop + zonePx -> -((s.gridTop + zonePx - y) / zonePx).coerceIn(0f, 1f)
        y > s.gridBottom - zonePx -> ((y - (s.gridBottom - zonePx)) / zonePx).coerceIn(0f, 1f)
        else -> 0f
    }
}

/** Slipp: lagres én gang (disk + server). */
fun AppViewModel.wiggleEnd37(page: String) {
    p37.edgeDir = 0f
    if (p37.dirty.remove(page)) commitPage37(page)
}

class P41State {
    /* Fanelinja og Fold */
    var scanHome by mutableStateOf(true)
    var foldTab by mutableStateOf("na")
    internal var loaded = false

    /* Server (Konto → SERVER) */
    var srv by mutableStateOf<Srv41?>(null)
    var srvMissing by mutableStateOf(false)
    var srvSheet by mutableStateOf<String?>(null) // "local" | "external"
    var srvTest by mutableStateOf<String?>(null)
    var srvTestOk by mutableStateOf(false)
    var srvBusy by mutableStateOf(false)
    var loginNoContact by mutableStateOf(false)

    /* Kalender-innlogging (Homelab godkjenner) */
    var appAuth by mutableStateOf<AppAuth41?>(null)
    var appAuthBusy by mutableStateOf(false)
    var appAuthErr by mutableStateOf<String?>(null)
    internal var appAuthPending: AppAuth41? = null

    /* Bakgrunn Oslo */
    internal var osloKey: String? = null
    var osloFile by mutableStateOf<String?>(null)
    var osloCredit by mutableStateOf<Credit41?>(null)

    /* Hjemlys «Si fra» */
    var sfKind by mutableStateOf<String?>(null)
    var sfBusy by mutableStateOf(false)
    var sfSent by mutableStateOf<String?>(null)
    var sfErr by mutableStateOf<String?>(null)
    var sfNoticeId by mutableStateOf<String?>(null)
    var sfPeople by mutableStateOf<List<Pair<String, String>>?>(null)
    var sfLast by mutableStateOf<Map<String, Set<String>>>(emptyMap())

    /* Min reise */
    var trip by mutableStateOf<Trip41?>(null)
    var tripDir by mutableStateOf("auto")
    var tripMissing by mutableStateOf(false)
    var tripBusy by mutableStateOf(false)
    var tripOpen by mutableStateOf<Int?>(null)
    var journey by mutableStateOf<Journey41?>(null)
    var homeCard by mutableStateOf("over")
    var rtHide by mutableStateOf<String?>(null)
    var rtToast by mutableStateOf(false)
    internal var tripAt = 0L

    /* Gjøremål-Glimt i bakgrunnen */
    var glimtJobs by mutableStateOf<List<GJob41>>(emptyList())
    var glimtDone by mutableStateOf<String?>(null)
    /** Prompt 42: Angre for hele delingen (token fra jobben, ellers id-ene som ble laget). */
    var glimtUndo42 by mutableStateOf<String?>(null)
    var glimtUndoIds42 by mutableStateOf<List<String>>(emptyList())

    /* Søkepillen vokser inn i Chat: rammen den starter fra og spørsmålet. */
    var grow by mutableStateOf<Pair<androidx.compose.ui.geometry.Rect, String>?>(null)

    /* Vær: rediger kort og skiføre */
    var vaerEdit by mutableStateOf(false)
    var vaerLay by mutableStateOf<VaerLay41?>(null)
    var ski by mutableStateOf<Ski41?>(null)
    internal var skiAt = 0L

    /* 17. mai-Hjem: bryteren gjelder bare i dag (nullstilles 18. mai), «Hipp hipp hurra»-teller */
    var maiDesign by mutableStateOf(true)
    var hurra by mutableStateOf(0)
    var confetti by mutableStateOf(0L)
    var mai by mutableStateOf<MaiData41?>(null)

    /* Gjøremål: «Laget med Glimt» */
    var srcOpen by mutableStateOf(false)
    var sources by mutableStateOf<List<GSrc41>?>(null)
    var srcMissing by mutableStateOf(false)

    /* Skolesoner */
    var zones by mutableStateOf<List<Zone41>?>(null)
    var zoneAdd by mutableStateOf(false)
    var zoneErr by mutableStateOf<String?>(null)
}

/* ======================= Felles ======================= */

internal fun AppViewModel.prefs41() = appCtx40.getSharedPreferences("p41", Context.MODE_PRIVATE)

/** Lokale valg (per enhet). Kalles én gang fra Global41. */
fun AppViewModel.initP41() {
    val s = p41
    if (s.loaded) return
    s.loaded = true
    val sp = prefs41()
    s.scanHome = sp.getBoolean("papir_scan_home", true)
    s.foldTab = sp.getString("papir_fold_tab", "na")?.takeIf { it in FOLD_TABS41.map { t -> t.first } } ?: "na"
    s.rtHide = sp.getString("papir_rt_hide", null)
    s.homeCard = sp.getString("rt_home_card", "over") ?: "over"
}

fun AppViewModel.setScanHome41(on: Boolean) { p41.scanHome = on; Haptics.select(); prefs41().edit().putBoolean("papir_scan_home", on).apply() }

fun AppViewModel.setFoldTab41(k: String) { p41.foldTab = k; Haptics.select(); prefs41().edit().putString("papir_fold_tab", k).apply() }

/** Hjem på Fold (1c): fanene og kortene i hver fane (standard fra fasiten, nøklene i HOME_SECS). */
val FOLD_TABS41: List<Pair<String, String>> = listOf("na" to "Nå", "idag" to "I dag", "hjemme" to "Hjemme", "okonomi" to "Økonomi")

fun foldKeys41(tab: String): List<String> = when (tab) {
    "idag" -> listOf("h10", "h9", "h11", "h8", "h13")
    "hjemme" -> listOf("h7", "h2", "h43", "h4", "h6") // prompt 43: Media (h43) etter Pakker
    "okonomi" -> listOf("hm", "h11", "h2")
    else -> listOf("h3", "h8", "h6", "h40", "h5")
}

private fun clock41(iso: String?): String? = iso?.let { s ->
    runCatching { OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.systemDefault()) }.getOrNull()
        ?: runCatching { Instant.parse(s).atZone(ZoneId.systemDefault()) }.getOrNull()
}?.let { "%02d:%02d".format(it.hour, it.minute) } ?: iso?.takeIf { Regex("^\\d{1,2}:\\d{2}$").matches(it) }

fun hm41(iso: String?): String = clock41(iso) ?: ""

internal fun epoch41(v: String?): Long? {
    if (v.isNullOrBlank()) return null
    v.toLongOrNull()?.let { return if (it < 100_000_000_000L) it * 1000 else it }
    runCatching { return OffsetDateTime.parse(v).toInstant().toEpochMilli() }
    runCatching { return Instant.parse(v).toEpochMilli() }
    runCatching { return java.time.LocalDateTime.parse(v.replace(' ', 'T').removeSuffix("Z")).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    return null
}

class P52BState {
    /* Ruter */
    /** Sist avgangene for Mine stopp ble hentet (ms). Ny henting ved åpning bare når dataene er eldre enn 30 s. */
    internal var ruterAt = 0L
    internal var ruterSeedFor: String? = null
    internal var prefetchBusy = false

    /* Vær nå */
    internal var vaerKey: String? = null

    /* Kalenderkontekst (POST /api/glimt/quickparse52) */
    var qpText by mutableStateOf("")
    var qpBusy by mutableStateOf(false)
    var qpRes by mutableStateOf<Qp52?>(null)
    internal val qpCache = HashMap<String, Qp52>()
    internal var qpJob: Job? = null

    /* Brief-kortene (GET /api/brief52) */
    var brief by mutableStateOf<Brief52?>(null)
    var briefBusy by mutableStateOf(false)
    var briefFor: String? = null
    var starting by mutableStateOf<Set<String>>(emptySet())

    /* Glimt-figur per bruker */
    internal var charFor: String? = null
    var charAdmin by mutableStateOf<List<CharUser52>?>(null)
    var charAdminOpen by mutableStateOf(false)

    /* Butikklogoer (POST /finans/api/logos52/batch) */
    var logos by mutableStateOf<Map<String, Logo52>>(emptyMap())
    internal val logoAsked = HashSet<String>()
}

/* ---------------- Homelab (mobil forside) ---------------- */

data class Weather(val place: String, val temp: Double?, val text: String?, val wind: Double?, val max: Double?, val min: Double?, val code: Int?, val lat: Double? = null, val lon: Double? = null)

data class Shortcut(val name: String, val url: String, val local: Boolean)

data class Departure(val line: String, val color: Long?, val min: Int?, val time: String?, val to: String? = null, val textColor: Long? = null, val mode: String? = null)

data class RuterLine(val from: String, val to: String, val departures: List<Departure>)

data class ServerStatus(val cpu: Double?, val mem: Double?, val disk: Double?, val temp: Double?, val uptime: String?)

data class MobileHome(
    val name: String?, val serverName: String?, val avatarUrl: String?, val greeting: String?,
    val weather: Weather?, val shortcuts: List<Shortcut>, val ruter: List<RuterLine>, val serverStatus: ServerStatus?,
    val layout: HomeLayout? = null,
    /** De 2 viktigste pakkene (null = eldre server uten Sporing). */
    val packages: List<Shipment>? = null,
    /** Ekstrafeltene i været (MET), lest romslig. */
    val weatherX: WeatherX? = null,
    /** Prompt 21: antall aktive pakker i alt (for «+12 pakker ›»), når serveren sender det. */
    val packagesTotal: Int? = null,
)

/** Oppsettet av mobilforsiden (per bruker og enhet): rekkefølge og synlighet for seksjoner og faner. */
data class HomeLayout(
    val sec: List<String>, val hlTabs: List<String>, val finTabs: List<String>, val hide: Map<String, Boolean>,
    /** Egne fanenavn. Nøkkel «hl.<id>» eller «fin.<id>», maks 30 tegn. */
    val names: Map<String, String> = emptyMap(),
    /** Tilbake til startsiden: «arrow» (pil øverst, standard) eller «bar» (knapp i fanelinja). */
    val backStyle: String = "arrow",
    /** Mat: eldre valg for lys/mørk («light», «dark» eller «system»); brukes ikke lenger. */
    val matTheme: String = "light",
    /** Startside: «homelab», «fin-hjem», «fin-liste» eller «fin-budsjett». */
    val start: String? = null,
) {
    fun visible(id: String) = hide[id] != true
    fun toJson(): JSONObject = JSONObject().put("sec", JSONArray(sec)).put("hlTabs", JSONArray(hlTabs)).put("finTabs", JSONArray(finTabs))
        .put("hide", JSONObject().apply { hide.forEach { (k, v) -> put(k, v) } })
        .put("names", JSONObject().apply { names.forEach { (k, v) -> put(k, v) } })
        .put("backStyle", backStyle).put("matTheme", matTheme)
        .apply { start?.let { put("start", it) } }

    companion object {
        val SECTIONS = listOf("clock", "search", "links", "os", "srv", "ruter")
        val HL_TABS = listOf("hl", "home", "trk", "dom", "mat")
        val FIN_TABS = listOf("home", "list", "finn", "bud", "ai", "mer")
        /** Kan ikke skjules. */
        val FIXED_HL = setOf("hl", "home")
        val FIXED_FIN = setOf("home", "mer")
        val STARTS = listOf("homelab", "fin-hjem", "fin-liste", "fin-budsjett")
        /** Budsjett er skjult som fane (ligger øverst under Mer) og kan slås på i navbar-redigeringen. */
        val DEFAULT = HomeLayout(SECTIONS, HL_TABS, FIN_TABS, mapOf("srv" to true, "ruter" to true, "bud" to true))

        /** Nye ID-er som ikke finnes i lagret oppsett legges sist; ukjente fjernes. */
        private fun fix(saved: List<String>, all: List<String>) = saved.filter { it in all }.distinct() + all.filter { it !in saved }

        fun from(o: JSONObject?): HomeLayout {
            if (o == null) return DEFAULT
            val hide = DEFAULT.hide.toMutableMap()
            o.optJSONObject("hide")?.let { h -> h.keys().forEach { k -> hide[k] = h.optBoolean(k) } }
            val names = mutableMapOf<String, String>()
            o.optJSONObject("names")?.let { n -> n.keys().forEach { k -> n.optString(k).trim().takeIf { it.isNotEmpty() }?.let { names[k] = it.take(30) } } }
            // Eldre oppsett uten Finn-fanen: Finn tar plassen til Budsjett, og Budsjett skjules (prompt 10).
            var fin = o.optJSONArray("finTabs").strings().filter { it in FIN_TABS }
            if (fin.isNotEmpty() && "finn" !in fin) {
                val at = fin.indexOf("bud").takeIf { it >= 0 } ?: fin.indexOf("ai").takeIf { it >= 0 } ?: fin.size
                fin = fin.toMutableList().apply { add(at, "finn") }
                hide["bud"] = true
            }
            // Eldre oppsett uten Sporing: fanen settes inn foran Domener (samme som PWA-en og iOS).
            var hl = o.optJSONArray("hlTabs").strings().filter { it in HL_TABS }
            if (hl.isNotEmpty() && "trk" !in hl) hl = hl.toMutableList().apply { add(indexOf("dom").takeIf { it >= 0 } ?: size, "trk") }
            return HomeLayout(
                fix(o.optJSONArray("sec").strings(), SECTIONS), fix(hl, HL_TABS),
                fix(fin, FIN_TABS), hide, names,
                o.optString("backStyle").takeIf { it == "arrow" || it == "bar" } ?: "arrow",
                o.optString("matTheme").takeIf { it in listOf("light", "dark", "system") } ?: "light",
                o.optString("start").takeIf { it in STARTS },
            )
        }
    }
}

/* ---------------- Prompt 15: hilsen, tilpassede sider, Finans-fanelinja, vær og transaksjonsdetaljer ---------------- */

/** Hilsen etter tid på døgnet (alle flater): 05–10, 10–12, 12–18, 18–23 og 23–05. Aldri bare «Hei». */
fun greetingFor(hour: Int = LocalTime.now().hour): String = when (hour) {
    in 5..9 -> "God morgen"
    in 10..11 -> "God formiddag"
    in 12..17 -> "God ettermiddag"
    in 18..22 -> "God kveld"
    else -> "God natt"
}

/** Rekkefølge og skjulte kort på en side (layout.pages[side]). */
@androidx.compose.runtime.Immutable // prompt 71: Hjem-oppsettet (order/hidden/sz) endres bare med copy – stabilt for Compose
data class PageLay(val order: List<String> = emptyList(), val hidden: List<String> = emptyList(), val sz: Map<String, String> = emptyMap()) {
    // Prompt 70 (ANDHOME70, claude-code-widget-storrelse-mobil.md): sz = { h9: "full", h52fi: "half", … } (bare Hjem på mobil).
    fun toJson(): JSONObject = JSONObject().put("order", JSONArray(order)).put("hidden", JSONArray(hidden)).also { o -> if (sz.isNotEmpty()) o.put("sz", JSONObject(sz)) }
}

/** Prompt 70: «sz» fra layout.pages[side] – bare «full» og «half» godtas. */
fun parseSz70(o: JSONObject?): Map<String, String> {
    if (o == null) return emptyMap()
    val out = mutableMapOf<String, String>()
    o.keys().forEach { k -> val v = o.optString(k); if (v == "full" || v == "half") out[k] = v }
    return out
}

/** Valgene fra GET /api/me/layout som kom i prompt 15. */
data class Layout15(val pages: Map<String, PageLay>, val finTabs: List<String>, val fourthTab: String?, val fab: String?)

fun parseLayout15(s: String): Layout15 {
    val o = JSONObject(s)
    val pages = mutableMapOf<String, PageLay>()
    o.optJSONObject("pages")?.let { pg ->
        pg.keys().forEach { k ->
            val v = pg.optJSONObject(k) ?: return@forEach
            pages[k] = PageLay(v.optJSONArray("order").strings(), (v.optJSONArray("hidden") ?: v.optJSONArray("hid")).strings(), parseSz70(v.optJSONObject("sz")))
        }
    }
    return Layout15(pages, o.optJSONArray("finTabs").strings().filter { k -> FIN_TABS.any { it.first == k } }.distinct().take(5),
        o.optStr("fourthTab")?.takeIf { it in setOf("auto", "domener", "sporing") }, o.optStr("fab")?.takeIf { it == "float" || it == "inline" })
}

/** Oppsettet fra GET /api/me/layout som ikke er en del av mobilforsiden: Papir-valg, onboarding og trkOrder. */
data class LayoutExtras(val mobileDesign: String?, val paperMode: String?, val photo: String?, val onboarded: Boolean?, val trkOrder: List<String>)

fun parseLayoutExtras(s: String): LayoutExtras {
    val o = JSONObject(s)
    return LayoutExtras(
        o.optStr("mobileDesign"), o.optStr("paperMode"), o.optStr("photo"),
        if (o.has("onboarded") && !o.isNull("onboarded")) o.optBoolean("onboarded") else null,
        o.optJSONArray("trkOrder").strings(),
    )
}
