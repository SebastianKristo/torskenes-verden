package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalTime

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
data class PageLay(val order: List<String> = emptyList(), val hidden: List<String> = emptyList()) {
    fun toJson(): JSONObject = JSONObject().put("order", JSONArray(order)).put("hidden", JSONArray(hidden))
}

/** Valgene fra GET /api/me/layout som kom i prompt 15. */
data class Layout15(val pages: Map<String, PageLay>, val finTabs: List<String>, val fourthTab: String?, val fab: String?)

fun parseLayout15(s: String): Layout15 {
    val o = JSONObject(s)
    val pages = mutableMapOf<String, PageLay>()
    o.optJSONObject("pages")?.let { pg ->
        pg.keys().forEach { k ->
            val v = pg.optJSONObject(k) ?: return@forEach
            pages[k] = PageLay(v.optJSONArray("order").strings(), (v.optJSONArray("hidden") ?: v.optJSONArray("hid")).strings())
        }
    }
    return Layout15(pages, o.optJSONArray("finTabs").strings().filter { k -> FIN_TABS.any { it.first == k } }.distinct().take(5),
        o.optStr("fourthTab")?.takeIf { it in setOf("auto", "domener", "sporing") }, o.optStr("fab")?.takeIf { it == "float" || it == "inline" })
}

/** Fanene Finans-linja kan ha (opptil 4, «Mer» er alltid sist). */
val FIN_TABS: List<Pair<String, String>> = listOf(
    "oversikt" to "Oversikt", "liste" to "Liste", "finn" to "Finn", "sok" to "Søk", "budsjett" to "Budsjett",
    "kvitt" to "Kvitteringer", "aksjer" to "Aksjer", "abo" to "Abonnementer", "kontoer" to "Kontoer", "boliger" to "Boliger",
)
val FIN_TABS_DEFAULT = listOf("oversikt", "liste", "finn", "sok")

/* ---------------- Vær (GET /api/weather/full) ---------------- */

data class WxCurrent(
    val temp: Double?, val feels: Double?, val code: Int, val text: String, val isDay: Boolean,
    val wind: Double?, val gust: Double?, val windDir: Double?, val humidity: Double?, val dew: Double?,
    val pressure: Double?, val pressureTrend: String?, val visibility: Double?, val uv: Double?, val precip: Double?,
)
data class WxToday(val hi: Double?, val lo: Double?, val sunrise: String?, val sunset: String?, val daylight: String?, val precipSum: Double?, val precipProb: Double?)
data class WxHour(
    val t: String, val temp: Double?, val feels: Double?, val code: Int, val isDay: Boolean, val precipProb: Double?, val precip: Double?, val wind: Double?, val gust: Double?, val windDir: Double?,
    /** Prompt 22: timedata fra MET for detaljarkene (7 dager). Mangler på eldre server. Sikt i km. */
    val humidity: Double? = null, val uv: Double? = null, val pressure: Double? = null, val visKm: Double? = null,
)
data class WxDay(val date: String, val hi: Double?, val lo: Double?, val code: Int, val precipProb: Double?, val precipSum: Double?, val sunrise: String?, val sunset: String?, val uvMax: Double?, val windMax: Double?)
data class WxMoon(val phase: Double, val illum: Double, val name: String, val nextFull: String?, val nextNew: String?)

data class WeatherFull(
    val placeId: String, val place: String, val lat: Double?, val lon: Double?,
    val current: WxCurrent, val today: WxToday, val yHi: Double?, val yLo: Double?,
    val hours: List<WxHour>, val days: List<WxDay>, val moon: WxMoon?, val nextRainT: String?, val nextRainMm: Double?,
    val kind: String, val yrUrl: String?, val updatedAt: String?, val mock: Boolean,
)

/** Stedene i stedsvelgeren nederst på værskjermen. */
val WX_PLACES: List<Pair<String, String>> = listOf("oslo" to "Oslo", "bergen" to "Bergen", "trondheim" to "Trondheim", "tromso" to "Tromsø")

private fun JSONObject.dOrNull(k: String): Double? = optDoubleOrNull(k)

/** «↑», «↓», «stiger», et tall eller ingenting. */
private fun trendOf(o: JSONObject, k: String): String? {
    if (!o.has(k) || o.isNull(k)) return null
    val v = o.opt(k)
    return when (v) {
        is Number -> if (v.toDouble() > 0.3) "up" else if (v.toDouble() < -0.3) "down" else "flat"
        else -> v.toString().lowercase().let { s ->
            when {
                s.contains("up") || s.contains("stig") || s.contains("↑") -> "up"
                s.contains("down") || s.contains("synk") || s.contains("fall") || s.contains("↓") -> "down"
                else -> "flat"
            }
        }
    }
}

fun parseWeatherFull(s: String): WeatherFull {
    val o = JSONObject(s)
    val pl = o.optJSONObject("place") ?: JSONObject()
    val c = o.optJSONObject("current") ?: JSONObject()
    val td = o.optJSONObject("today") ?: JSONObject()
    val y = o.optJSONObject("yesterday") ?: JSONObject()
    val code = c.optInt("code", 3)
    val cur = WxCurrent(
        c.dOrNull("temp"), c.dOrNull("feels"), code, c.optStr("text") ?: wmoText(code), c.optBoolean("isDay", true),
        c.dOrNull("wind"), c.dOrNull("gust"), c.dOrNull("windDir"), c.dOrNull("humidity"), c.dOrNull("dew"),
        c.dOrNull("pressure"), trendOf(c, "pressureTrend"), c.dOrNull("visibility"), c.dOrNull("uv"), c.dOrNull("precip"),
    )
    val today = WxToday(td.dOrNull("hi"), td.dOrNull("lo"), td.optStr("sunrise"), td.optStr("sunset"), td.optStr("daylight"), td.dOrNull("precipSum"), td.dOrNull("precipProb"))
    val hours = o.optJSONArray("hours")?.map {
        WxHour(it.optString("t"), it.dOrNull("temp"), it.dOrNull("feels"), it.optInt("code", 3), it.optBoolean("isDay", true),
            it.dOrNull("precipProb"), it.dOrNull("precip"), it.dOrNull("wind"), it.dOrNull("gust"), it.dOrNull("windDir"),
            it.dOrNull("humidity") ?: it.dOrNull("rh"), it.dOrNull("uv") ?: it.dOrNull("uvIndex"), it.dOrNull("pressure") ?: it.dOrNull("pressureMsl"),
            (it.dOrNull("visibility") ?: it.dOrNull("vis"))?.let { v -> if (v > 200) v / 1000.0 else v })
    } ?: emptyList()
    val days = o.optJSONArray("days")?.map {
        WxDay(it.optString("date"), it.dOrNull("hi"), it.dOrNull("lo"), it.optInt("code", 3), it.dOrNull("precipProb"), it.dOrNull("precipSum"),
            it.optStr("sunrise"), it.optStr("sunset"), it.dOrNull("uvMax"), it.dOrNull("windMax"))
    } ?: emptyList()
    val moon = o.optJSONObject("moon")?.let { m ->
        val ph = m.optDouble("phase", 0.0).let { if (it.isNaN()) 0.0 else it }
        WxMoon(ph, m.optDouble("illum", 0.0).let { if (it.isNaN()) 0.0 else it }, m.optStr("name") ?: moonName(ph), m.optStr("nextFull"), m.optStr("nextNew"))
    }
    val nr = o.optJSONObject("nextRain")
    return WeatherFull(
        pl.optString("id", "oslo"), pl.optStr("name") ?: "Oslo", pl.dOrNull("lat"), pl.dOrNull("lon"),
        cur, today, y.dOrNull("hi"), y.dOrNull("lo"), hours, days, moon, nr?.optStr("t"), nr?.dOrNull("mm"),
        o.optStr("kind") ?: wxKind(code, cur.isDay), o.optStr("yrUrl"), o.optStr("updatedAt"), o.optBoolean("mock"),
    )
}

/** Norsk tekst for WMO-koden. */
fun wmoText(code: Int): String = when (code) {
    0 -> "Klarvær"
    1 -> "Lettskyet"
    2 -> "Delvis skyet"
    3 -> "Skyet"
    45, 48 -> "Tåke"
    51, 53, 55 -> "Yr"
    56, 57 -> "Underkjølt yr"
    61 -> "Lett regn"
    63 -> "Regn"
    65 -> "Kraftig regn"
    66, 67 -> "Underkjølt regn"
    71 -> "Lett snø"
    73 -> "Snø"
    75 -> "Kraftig snø"
    77 -> "Snøkorn"
    80, 81 -> "Regnbyger"
    82 -> "Kraftige regnbyger"
    85, 86 -> "Snøbyger"
    95 -> "Torden"
    96, 99 -> "Torden med hagl"
    else -> "Skyet"
}

/** Symbol for WMO-koden (dag eller natt). */
fun wmoIcon(code: Int, day: Boolean = true): String = when (code) {
    0 -> if (day) "☀" else "☾"
    1 -> if (day) "🌤" else "☾"
    2 -> if (day) "⛅" else "☁"
    3 -> "☁"
    45, 48 -> "🌫"
    51, 53, 55, 56, 57, 61, 63, 66, 80, 81 -> "🌦"
    65, 67, 82 -> "🌧"
    71, 73, 75, 77, 85, 86 -> "❄"
    95, 96, 99 -> "⛈"
    else -> "☁"
}

/** Himmelen bak værskjermen: klart, skyet, regn, snø, tåke eller natt. */
fun wxKind(code: Int, day: Boolean): String = when {
    !day -> "night"
    code <= 1 -> "clear"
    code in 45..48 -> "fog"
    code in 71..77 || code in 85..86 -> "snow"
    code >= 51 -> "rain"
    else -> "cloudy"
}

fun moonName(phase: Double): String = when {
    phase < 0.03 || phase > 0.97 -> "Nymåne"
    phase < 0.22 -> "Voksende månesigd"
    phase < 0.28 -> "Første kvarter"
    phase < 0.47 -> "Voksende måne"
    phase < 0.53 -> "Fullmåne"
    phase < 0.72 -> "Minkende måne"
    phase < 0.78 -> "Siste kvarter"
    else -> "Minkende månesigd"
}

/** Vindretning i grader som kompassretning. */
fun wxCompass(deg: Double?): String {
    if (deg == null) return "–"
    val dirs = listOf("N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV")
    return dirs[(((deg % 360) + 360) % 360 / 45.0 + 0.5).toInt() % 8]
}

/* ---------------- Transaksjonsdetaljer (GET /transactions/:id) ---------------- */

data class TxReceipt(val id: String?, val status: String, val fileUrl: String?, val mime: String?, val lines: List<Pair<String, Double>>, val total: Double?, val aiSummary: String?)
data class TxBank(val bookingDate: String?, val valueDate: String?, val description: String?, val message: String?, val amount: Double?, val account: String?, val archiveReference: String?)
data class TxDetail(val tx: Tx, val aiSummary: String?, val receipt: TxReceipt?, val bank: TxBank?)

fun parseTxDetail(s: String): TxDetail {
    val o = JSONObject(s)
    val t = parseTx(o.optJSONObject("tx") ?: o)
    val r = o.optJSONObject("receipt")?.let { r ->
        val lines = r.optJSONArray("lines")?.map { (it.optStr("name") ?: it.optString("description")) to it.num("price").let { p -> if (p == 0.0) it.num("amount") else p } } ?: emptyList()
        TxReceipt(r.optStr("id"), r.optStr("status") ?: "attached", r.optStr("fileUrl"), r.optStr("mime"), lines, r.optDoubleOrNull("total"), r.optStr("aiSummary"))
    }
    val b = o.optJSONObject("bank")?.let { b ->
        TxBank(b.optStr("bookingDate"), b.optStr("valueDate"), b.optStr("description"), b.optStr("message"), b.optDoubleOrNull("amount"), b.optStr("account"), b.optStr("archiveReference"))
    }
    return TxDetail(t, o.optStr("aiSummary") ?: t.aiLong ?: t.aiShort, r, b)
}

/** Skjermene Finans-fanene kan åpne. Tilbake fra en av dem går til Homelab (Mer går til Finans → Mer). */
val PAPER_FIN_SCREENS = setOf(Screen.Home, Screen.List, Screen.Finn, Screen.Budget, Screen.Scan, Screen.Stocks, Screen.Sub, Screen.Accounts, Screen.Folders)

fun finTabScreen(k: String): Screen? = when (k) {
    "oversikt" -> Screen.Home; "liste" -> Screen.List; "finn" -> Screen.Finn; "budsjett" -> Screen.Budget; "kvitt" -> Screen.Scan
    "aksjer" -> Screen.Stocks; "abo" -> Screen.Sub; "kontoer" -> Screen.Accounts; "boliger" -> Screen.Folders
    else -> null
}
