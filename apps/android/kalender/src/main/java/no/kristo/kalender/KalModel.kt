package no.kristo.kalender

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.temporal.IsoFields

/*
 * Prompt 33 (KAL-ANDROID): datamodellen i Kalender-appen (fasit: Kalender App.dc.html → CALS, seed(), events()).
 * Hendelsene kommer fra Homelab-serveren (GET /api/kalender?from=&to=, samme konto som Homelab-appen). Kalenderne fra
 * GET /api/kalender/calendars (SERVER33); finnes ikke det endepunktet (404, eldre server), mappes serverens kalendere
 * (timeplan/prover/skole/privat/familie/bursdager/trials/google) til visningen «Personlig, Jobb, Studie, Familie, Helse, Bursdager».
 */

/** En hendelse. s/e er minutter etter midnatt (null = heldag). days > 1 = flerdagers heldag. rem = varsel i minutter før (null = ingen). */
data class KEv(
    val id: String, val t: String, val cal: String, val d: LocalDate, val s: Int?, val e: Int?, val days: Int = 1,
    val loc: String? = null, val rem: Int? = null, val kind: String? = null, val src: String? = null,
    val editable: Boolean = true, val color: Long? = null, val pending: Boolean = false, val note: String? = null,
) {
    val all: Boolean get() = s == null
    val key: String get() = d.toString()

    fun toJson(): JSONObject = JSONObject().put("id", id).put("t", t).put("cal", cal).put("d", d.toString())
        .put("s", s ?: JSONObject.NULL).put("e", e ?: JSONObject.NULL).put("days", days).put("loc", loc ?: JSONObject.NULL)
        .put("rem", rem ?: JSONObject.NULL).put("kind", kind ?: JSONObject.NULL).put("src", src ?: JSONObject.NULL)
        .put("editable", editable).put("color", color?.let(::hexOut) ?: JSONObject.NULL).put("pending", pending).put("note", note ?: JSONObject.NULL)

    companion object {
        /** Eget lagret format (cache, utboks). */
        fun fromJson(o: JSONObject): KEv? = runCatching {
            KEv(
                o.getString("id"), o.getString("t"), o.optString("cal", "p"), LocalDate.parse(o.getString("d")),
                o.optIntOrNull("s"), o.optIntOrNull("e"), o.optInt("days", 1).coerceAtLeast(1), o.optStrOrNull("loc"), o.optIntOrNull("rem"),
                o.optStrOrNull("kind"), o.optStrOrNull("src"), o.optBoolean("editable", true), hexIn(o.optStrOrNull("color")),
                o.optBoolean("pending", false), o.optStrOrNull("note"),
            )
        }.getOrNull()
    }
}

/** En kalender i sidemenyen. c = fargen (prikk, stripe), tx = tekst i lyst tema, lt = tekst i mørkt tema. */
data class KCal(
    val id: String, val n: String, val c: Long, val tx: Long, val lt: Long, val writable: Boolean = true,
    val serverVisible: Boolean = true, val count: Int? = null, val own: Boolean = false, val serverId: String? = null,
)

/** Fasitens seks kalendere (CALS). */
val KCALS: List<KCal> = listOf(
    KCal("p", "Personlig", 0xFFB23A2A, 0xFF8A2A1D, 0xFFF29A8A),
    KCal("j", "Jobb", 0xFF2B5D8A, 0xFF1F4568, 0xFF9CC2EE),
    KCal("s", "Studie", 0xFF2F7A4F, 0xFF235C3B, 0xFF8FD4A8),
    KCal("f", "Familie", 0xFFA8661A, 0xFF7A4A12, 0xFFECBB74),
    KCal("h", "Helse", 0xFF3D7F8A, 0xFF2A5C64, 0xFF8FCDD6),
    KCal("b", "Bursdager", 0xFF8A3FA0, 0xFF6A2F7C, 0xFFD6A8E6),
)

/** Eldre serverkalendere → appens visning (når /api/kalender/calendars mangler). */
fun mapLegacyCal(id: String?, type: String?, title: String): String {
    val c = id?.lowercase().orEmpty()
    val t = type?.lowercase().orEmpty()
    return when {
        c in setOf("p", "j", "s", "f", "h", "b") -> c
        c.contains("bursdag") || c == "birthdays" || t == "bursdag" || t == "birthday" -> "b"
        c in setOf("timeplan", "prover", "skole", "studie", "canvas") || t in setOf("time", "prove", "innl") -> "s"
        c.contains("famil") -> "f"
        c.contains("helse") || c.contains("health") -> "h"
        c.contains("jobb") || c.contains("work") -> "j"
        else -> guessCal(title.lowercase()).takeIf { it != "b" && it != "s" } ?: "p"
    }
}

/** Kalender-id → serverens skrivbare kalender for POST /api/kalender/events (eldre server: bare privat/familie). */
fun legacyWriteCal(cal: String): String = if (cal == "f") "familie" else "privat"

/** Varsel-valgene (REMS): null = Ingen. */
val KREMS: List<Pair<Int?, String>> = listOf(null to "Ingen", 10 to "10 min", 30 to "30 min", 60 to "1 t", 1440 to "1 dag")

fun remL(r: Int?): String = when {
    r == null -> "Ingen varsel"
    r >= 1440 -> "${r / 1440} dag før"
    r >= 60 -> "${r / 60} t før"
    else -> "$r min før"
}

/** Serverens reminder-streng ('none'|'15m'|'1h'|'day') eller tall → minutter. */
fun remFromServer(o: JSONObject): Int? {
    listOf("remindMin", "remMin", "rem", "reminderMin").forEach { k -> if (o.has(k) && !o.isNull(k)) o.opt(k).let { v -> if (v is Number) return v.toInt() } }
    val v = o.optStrOrNull("reminder") ?: o.optStrOrNull("remind") ?: return null
    return when (v) {
        "none", "" -> null
        "15m" -> 15
        "10m" -> 10
        "30m" -> 30
        "1h" -> 60
        "day", "1d" -> 1440
        else -> v.removeSuffix("m").toIntOrNull()
    }
}

/** Minutter → nærmeste reminder-streng for eldre servere. */
fun remToLegacy(r: Int?): String = when {
    r == null -> "none"
    r <= 20 -> "15m"
    r <= 90 -> "1h"
    else -> "day"
}

/* ---------------- Dato og tekst (fasitens pad/key/MN/WD …) ---------------- */

val MN = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")
val MS = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")
/** Søndag først, som JS getDay(). */
val WD = listOf("søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag")
val WS = listOf("søn", "man", "tir", "ons", "tor", "fre", "lør")
val WL = listOf("M", "T", "O", "T", "F", "L", "S")

val OSLO: ZoneId = ZoneId.of("Europe/Oslo")
fun today(): LocalDate = LocalDate.now(OSLO)
fun nowMin(): Int = LocalDateTime.now(OSLO).let { it.hour * 60 + it.minute }

/** JS getDay(): 0 = søndag. */
val LocalDate.jsDay: Int get() = dayOfWeek.value % 7
fun mon(d: LocalDate): LocalDate = d.minusDays(((d.jsDay + 6) % 7).toLong())
fun isoW(d: LocalDate): Int = d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
fun hm(m: Int): String = "%02d:%02d".format((m / 60) % 24, m % 60)
fun cap(s: String): String = s.replaceFirstChar { it.uppercase() }
/** «Tir. 21. okt» */
fun dl(d: LocalDate): String = cap(WS[d.jsDay]) + ". " + d.dayOfMonth + ". " + MS[d.monthValue - 1]
/** «tirsdag 21. oktober» */
fun fd(d: LocalDate): String = WD[d.jsDay] + " " + d.dayOfMonth + ". " + MN[d.monthValue - 1]
fun daysBetween(a: LocalDate, b: LocalDate): Int = ChronoUnit.DAYS.between(a, b).toInt()

fun hexIn(s: String?): Long? {
    val h = s?.trim()?.removePrefix("#") ?: return null
    return when (h.length) {
        6 -> h.toLongOrNull(16)?.let { 0xFF000000L or it }
        8 -> h.toLongOrNull(16)
        3 -> h.map { "$it$it" }.joinToString("").toLongOrNull(16)?.let { 0xFF000000L or it }
        else -> null
    }
}
fun hexOut(c: Long): String = "#%06x".format(c and 0xFFFFFF)

/** Mørkere tekstfarge (tx) og lysere variant (lt) for egne kalendere fra serveren. */
fun shade(c: Long, f: Float): Long {
    val r = ((c shr 16) and 0xFF).toInt(); val g = ((c shr 8) and 0xFF).toInt(); val b = (c and 0xFF).toInt()
    fun ch(v: Int) = if (f < 1f) (v * f).toInt().coerceIn(0, 255) else (v + (255 - v) * (f - 1f)).toInt().coerceIn(0, 255)
    return 0xFF000000L or (ch(r).toLong() shl 16) or (ch(g).toLong() shl 8) or ch(b).toLong()
}

fun JSONObject.optStrOrNull(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }
fun JSONObject.optIntOrNull(k: String): Int? = if (!has(k) || isNull(k)) null else opt(k).let { v -> when (v) { is Number -> v.toInt(); is String -> v.toIntOrNull(); else -> null } }
fun JSONObject.str(vararg k: String): String? = k.firstNotNullOfOrNull { optStrOrNull(it) }

/* ---------------- Tolking av serverens svar ---------------- */

private fun parseHm(v: String?): Int? {
    val m = Regex("^(\\d{1,2})[:.](\\d{2})").find(v?.trim() ?: return null) ?: return null
    return m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
}

/** «2026-10-21T14:30:00+02:00» / «2026-10-21T14:30» / «2026-10-21» → (dato, minutter|null). */
private fun parseDT(s: String?): Pair<LocalDate, Int?>? {
    val v = s?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    if (v.length <= 10) return runCatching { LocalDate.parse(v) to null }.getOrNull()
    val dt = runCatching { OffsetDateTime.parse(v).atZoneSameInstant(OSLO).toLocalDateTime() }.getOrNull()
        ?: runCatching { LocalDateTime.parse(v.removeSuffix("Z")) }.getOrNull()
        ?: return runCatching { LocalDate.parse(v.take(10)) to null }.getOrNull()
    return dt.toLocalDate() to (dt.hour * 60 + dt.minute)
}

/**
 * Én hendelse fra /api/kalender (prompt 26/27/33) eller /api/assist (events[]). Godtar både serverens format
 * ({id, title, start, end, allDay, calendar, color, room|location, reminder, type, …}) og fasitens ({id, t, cal, d, s, e, …}).
 */
fun parseServerEvent(o: JSONObject, cals: Map<String, KCal>): KEv? {
    if (o.has("t") && o.has("d") && !o.has("title")) return KEv.fromJson(o)
    val title = o.str("title", "summary", "t") ?: return null
    val st = parseDT(o.str("start", "date", "d")) ?: return null
    val en = parseDT(o.str("end"))
    val allDay = o.optBoolean("allDay", st.second == null && o.optStrOrNull("time") == null)
    var s: Int? = if (allDay) null else st.second ?: parseHm(o.optStrOrNull("time"))
    var e: Int? = if (allDay || s == null) null else when {
        en == null -> s + 60
        en.first == st.first -> en.second ?: (s + 60)
        en.first.isAfter(st.first) -> 24 * 60 - 1
        else -> s + 60
    }
    if (s != null && e != null && e <= s) e = (s + 30).coerceAtMost(24 * 60 - 1)
    // Flerdagers heldag: iCal-slutt er dagen etter (eksklusiv).
    val days = if (!allDay || en == null) 1 else {
        val last = if (en.first.isAfter(st.first) && (en.second == null || en.second == 0)) en.first.minusDays(1) else en.first
        (daysBetween(st.first, last) + 1).coerceIn(1, 60)
    }
    if (allDay) { s = null; e = null }
    val type = o.optStrOrNull("type")?.lowercase()
    val rawCal = o.str("calendar", "calendarId", "cal", "view")
    val cal = when {
        rawCal != null && cals.containsKey(rawCal) -> rawCal
        else -> cals.values.firstOrNull { it.serverId != null && it.serverId == rawCal }?.id ?: mapLegacyCal(rawCal, type, title)
    }
    val kind = o.optStrOrNull("kind") ?: when {
        type == "prove" || type == "innl" || Regex("^frist|eksamen|innlevering", RegexOption.IGNORE_CASE).containsMatchIn(title) -> "frist"
        type == "bursdag" || type == "birthday" || cal == "b" -> "bursdag"
        else -> null
    }
    val loc = o.str("location", "loc", "room", "place")
    val src = o.optJSONObject("glimt")?.optStrOrNull("text") ?: o.str("aiText", "origText", "src")
        ?: (if (o.optStrOrNull("origin")?.contains("AI") == true) o.optStrOrNull("note") else null)
    val editable = if (o.has("editable")) o.optBoolean("editable") else true
    return KEv(
        id = o.str("id") ?: "${st.first}|${s ?: "all"}|$title", t = title, cal = cal, d = st.first, s = s, e = e, days = days,
        loc = loc, rem = if (s == null) null else remFromServer(o), kind = kind, src = src,
        editable = editable, color = hexIn(o.str("calendarColor", "color")), note = o.str("note", "description"),
    )
}

/** {events:[…]} / [ … ] → hendelser (unike id-er). */
fun parseServerEvents(raw: String, cals: Map<String, KCal>): List<KEv> {
    val t = raw.trim()
    val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("events") ?: it.optJSONArray("items") ?: JSONArray() }
    val out = LinkedHashMap<String, KEv>()
    for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { parseServerEvent(it, cals) }?.let { out.putIfAbsent(it.id, it) }
    return out.values.toList()
}

/**
 * GET /api/kalender/calendars (SERVER33): [{id, name, color, visible, count, writable, view?, own?}] eller {calendars:[…]}.
 * Serverens «view»/navn mappes til fasitens nøkler der det gir mening, så fargene og standardene stemmer.
 */
fun parseServerCalendars(raw: String): List<KCal> {
    val t = raw.trim()
    val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("calendars") ?: it.optJSONArray("items") ?: JSONArray() }
    val out = ArrayList<KCal>()
    for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val sid = o.str("id") ?: continue
        val name = o.str("name", "n", "title") ?: sid
        val base = KCALS.firstOrNull { it.id == sid || it.n.equals(name, true) || it.id == o.optStrOrNull("view") || it.n.equals(o.optStrOrNull("view") ?: "", true) }
        val c = hexIn(o.str("color", "c")) ?: base?.c ?: 0xFF5C5850
        out += KCal(
            id = sid, n = name, c = c, tx = base?.takeIf { it.c == c }?.tx ?: shade(c, .78f), lt = base?.takeIf { it.c == c }?.lt ?: shade(c, 1.45f),
            writable = o.optBoolean("writable", o.optBoolean("editable", true)), serverVisible = o.optBoolean("visible", o.optBoolean("enabled", true)),
            count = o.optIntOrNull("count") ?: o.optIntOrNull("next30"), own = o.optBoolean("own", o.optBoolean("local", false)), serverId = sid,
        )
    }
    return out
}

/* ---------------- Vær ---------------- */

/** Dagens vær: WMO-kode, maks, min. */
data class KWx(val c: Int, val hi: Int, val lo: Int)

/** Fasitens wkd(): WMO-kode → ikon-nøkkel. */
fun wkd(c: Int): String = when {
    c <= 1 -> "sol"
    c == 2 -> "delvis"
    (c in 51..67) || (c in 80..82) -> "regn"
    (c in 71..77) || c == 85 || c == 86 -> "sno"
    c >= 95 -> "torden"
    else -> "sky"
}
val WTXT = mapOf("sol" to "Sol", "delvis" to "Delvis skyet", "sky" to "Skyet", "regn" to "Regn", "sno" to "Snø", "torden" to "Torden")
/** SVG-stiene (viewBox 24, strek 2). */
val WXP = mapOf(
    "sol" to "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    "delvis" to "M8 2.5V4M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1M5.4 10.4A3 3 0 1 1 10.8 7.2M9 20h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 13.4A3.3 3.3 0 0 0 9 20z",
    "sky" to "M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.1A3.5 3.5 0 0 0 7 18z",
    "regn" to "M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3",
    "sno" to "M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01",
    "torden" to "M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM12 14l-2 4h4l-2 4",
)
/** Enkle tegn for widgetene (Glance kan ikke tegne stier). */
val WEMO = mapOf("sol" to "☀", "delvis" to "⛅", "sky" to "☁", "regn" to "☂", "sno" to "❄", "torden" to "⚡")

/**
 * GET /api/kalender/weather?from=&to= (SERVER33) i flere mulige former:
 * {days:{"2026-10-21":{code|c|wmo, hi|max, lo|min}}} · {days:[{date, …}]} · [{date, …}] · Open-Meteo {daily:{time[], weather_code[], …}}.
 */
fun parseWeather(raw: String): Map<LocalDate, KWx> {
    val out = HashMap<LocalDate, KWx>()
    val t = raw.trim()
    fun one(d: String?, o: JSONObject) {
        val date = d?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return
        val c = o.optIntOrNull("code") ?: o.optIntOrNull("c") ?: o.optIntOrNull("wmo") ?: o.optIntOrNull("weather_code") ?: kindToWmo(o.optStrOrNull("kind") ?: o.optStrOrNull("icon"))
        val hi = (o.opt("hi") ?: o.opt("max") ?: o.opt("tmax")) as? Number ?: return
        val lo = (o.opt("lo") ?: o.opt("min") ?: o.opt("tmin")) as? Number ?: hi
        out[date] = KWx(c, Math.round(hi.toDouble()).toInt(), Math.round(lo.toDouble()).toInt())
    }
    if (t.startsWith("[")) { val a = JSONArray(t); for (i in 0 until a.length()) a.optJSONObject(i)?.let { one(it.str("date", "d", "day"), it) }; return out }
    val o = JSONObject(t)
    o.optJSONObject("daily")?.let { dd ->
        val tm = dd.optJSONArray("time") ?: return@let
        val wc = dd.optJSONArray("weather_code") ?: dd.optJSONArray("weathercode")
        val mx = dd.optJSONArray("temperature_2m_max"); val mn = dd.optJSONArray("temperature_2m_min")
        for (i in 0 until tm.length()) {
            val d = runCatching { LocalDate.parse(tm.getString(i)) }.getOrNull() ?: continue
            out[d] = KWx(wc?.optInt(i, 3) ?: 3, Math.round(mx?.optDouble(i, 0.0) ?: 0.0).toInt(), Math.round(mn?.optDouble(i, 0.0) ?: 0.0).toInt())
        }
        return out
    }
    val days = o.opt("days") ?: o.opt("items") ?: o.opt("weather")
    when (days) {
        is JSONObject -> days.keys().forEach { k -> days.optJSONObject(k)?.let { one(k, it) } }
        is JSONArray -> for (i in 0 until days.length()) days.optJSONObject(i)?.let { one(it.str("date", "d", "day"), it) }
    }
    return out
}

private fun kindToWmo(k: String?): Int = when {
    k == null -> 3
    k.contains("clear") || k.contains("sun") || k == "sol" -> 0
    k.contains("partly") || k.contains("fair") || k == "delvis" -> 2
    k.contains("thunder") || k.contains("storm") -> 95
    k.contains("snow") || k.contains("sleet") || k.contains("sno") -> 73
    k.contains("rain") || k.contains("shower") || k.contains("regn") -> 61
    else -> 3
}
