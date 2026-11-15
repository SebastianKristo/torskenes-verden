package no.kristo.finanshub

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.temporal.IsoFields
import java.util.concurrent.TimeUnit
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import java.net.URLEncoder

/*
 * Prompt 26 (ANDROID-A): Kalender med skoletimeplan (design/Kalender.dc.html, variant «mobile», claude-code-kalender.md).
 * Data fra GET /api/kalender?from=&to= (skolens iCal, Canvas, Bursdager og Google, per bruker). Svarer serveren 404
 * (eldre versjon), vises en tom kalender med en melding. Valgene (rekkefølge, skjulte kort, filter, visning,
 * påminnelser og fagfarger) lagres per bruker i /api/me/layout (kalOrder, kalHidden, kalFilters, kalView,
 * kalReminders, subjectColors) og lokalt for kontoen.
 */

/* ---------- Modeller ---------- */

/** type: time | prove | innl | bursdag | skole | fri. start/end er null for heldagshendelser. */
data class Kal26Ev(
    val id: String, val title: String, val short: String, val subject: String?, val room: String?, val teacher: String?, val note: String?,
    val date: LocalDate, val endDate: LocalDate, val start: LocalTime?, val end: LocalTime?, val allDay: Boolean,
    val type: String, val color: Long?, val source: String, val url: String?, val mazemap: String?,
    /** Prompt 27: kalenderen fra serveren (timeplan | prover | skole | privat | familie | bursdager), om den kan endres (Google Privat/Familie),
     *  gjentakelse (none | daily | weekly | monthly) og varselet lagret i Google. */
    val calendar: String = "", val editable: Boolean = false, val repeat: String? = null, val remind: String? = null, val googleId: String? = null,
) {
    val sMin: Int? get() = start?.let { it.hour * 60 + it.minute }
    val eMin: Int? get() = end?.let { it.hour * 60 + it.minute }
    val isExam: Boolean get() = type == "prove" || type == "innl"
    /** Filteret hendelsen hører til: timeplan, prover, bursdager eller skole. */
    val cat: String get() = calendar.takeIf { it in KAL_CAL_IDS } ?: when (type) { "time" -> "timeplan"; "prove", "innl" -> "prover"; "bursdag" -> "bursdager"; else -> if (source == "google") "privat" else "skole" }
    val sText: String get() = start?.let(::kalHm) ?: ""
    val eText: String get() = end?.let(::kalHm) ?: ""
    /** «10:00–11:30», «Frist 23:59» eller «Hele dagen». */
    val timeText: String get() = when {
        type == "innl" -> "Frist " + (eText.ifBlank { "23:59" })
        start != null -> sText + (if (end != null) "–$eText" else "")
        else -> "Hele dagen"
    }

    fun toJson(): JSONObject = JSONObject().put("id", id).put("title", title).put("short", short).put("subject", subject ?: JSONObject.NULL)
        .put("room", room ?: JSONObject.NULL).put("teacher", teacher ?: JSONObject.NULL).put("note", note ?: JSONObject.NULL)
        .put("start", if (start != null) date.atTime(start).toString() else date.toString())
        .put("end", if (end != null) date.atTime(end).toString() else endDate.plusDays(1).toString())
        .put("allDay", allDay).put("type", type).put("color", color?.let(::kalHexOut) ?: JSONObject.NULL).put("source", source)
        .put("url", url ?: JSONObject.NULL).put("mazemap", mazemap ?: JSONObject.NULL)
}

val KAL_WS = listOf("MAN", "TIR", "ONS", "TOR", "FRE", "LØR", "SØN")
const val KAL_LAB = 0xFFB23A2A
const val KAL_BD = 0xFF2B5D8A
const val KAL_SKOLE = 0xFFA8661A

/** Kortene på siden (rekkefølgen i kalOrder): Nå-kort, Prøver og frister, Kalendere-lenken, selve kalenderen og Widgets. */
val KAL_CARDS = listOf("now", "exams", "cals", "cal", "widgets")
val KAL_CARD_NAMES = mapOf("now" to "Nå-kort", "exams" to "Prøver og frister", "cals" to "Kalendere", "cal" to "Kalender", "widgets" to "Widgets")
/** Lagres som designets nøkler A–E (Kalender.dc.html), likt med iOS. Navnene godtas også når de leses. */
private val KAL_CARD_ALIAS = mapOf("A" to "now", "B" to "exams", "C" to "cals", "D" to "cal", "E" to "widgets")
private val KAL_CARD_LETTER = KAL_CARD_ALIAS.entries.associate { (k, v) -> v to k }

/** Prompt 27: kalenderne (Kalender.dc.html, CALS): nøkkel, navn, farge og kilde. Serverens `calendars` overstyrer navn og farge. */
val KAL_FILTERS: List<Triple<String, String, Long?>> = listOf(
    Triple("timeplan", "Timeplan", 0xFF2B5D8A), Triple("prover", "Prøver og frister", KAL_LAB), Triple("skole", "Skole", KAL_SKOLE),
    Triple("privat", "Privat", 0xFF6B4FA0), Triple("familie", "Familie", 0xFFD08A1E), Triple("bursdager", "Bursdager", 0xFF3F7A6E),
    // Prompt 42 (claude-code-abonnement-kalender.md): innebygd kalender med trekkdatoene fra Finans → Abonnementer (kan skjules).
    Triple("abonnementer", "Abonnementer", 0xFF3D7F8A),
)
val KAL_CAL_IDS: Set<String> = KAL_FILTERS.map { it.first }.toSet()
private val KAL_FILTER_ALIAS = mapOf("Timeplan" to "timeplan", "Prøver og frister" to "prover", "Bursdager" to "bursdager", "Skole" to "skole",
    "time" to "timeplan", "prove" to "prover", "exams" to "prover", "bursdag" to "bursdager", "birthdays" to "bursdager", "school" to "skole",
    "tt" to "timeplan", "ex" to "prover", "priv" to "privat", "fam" to "familie", "bd" to "bursdager", "Privat" to "privat", "Familie" to "familie", "private" to "privat", "family" to "familie",
    "ab" to "abonnementer", "Abonnementer" to "abonnementer", "subscriptions" to "abonnementer", "abo" to "abonnementer")

/** Påminnelser: verdi i kalReminders og navn. */
val KAL_REMS = listOf("none" to "Ingen", "15m" to "15 min før", "1h" to "1 time før", "day" to "Dagen før")

/** Fast fagpalett (samme som designet), brukes når serveren ikke sender farge. */
private val KAL_SUBJ = mapOf(
    "matematikk" to 0xFF2B5D8A, "matte" to 0xFF2B5D8A, "fysikk" to 0xFF2E6F75, "norsk" to 0xFFA8661A, "engelsk" to 0xFF7A3B6B, "kjemi" to 0xFF2F7A4F,
    "historie" to 0xFF6B5A3A, "spansk" to 0xFFC0562A, "kroppsøving" to 0xFF3F7A6E, "gym" to 0xFF3F7A6E, "studietid" to 0xFF7A7468,
)
private val KAL_PAL = listOf(0xFF2B5D8A, 0xFF2E6F75, 0xFFA8661A, 0xFF7A3B6B, 0xFF2F7A4F, 0xFF6B5A3A, 0xFFC0562A, 0xFF3F7A6E)

fun kalHm(t: LocalTime): String = "%02d:%02d".format(t.hour, t.minute)
fun kalHex(s: String?): Long? {
    val h = s?.trim()?.removePrefix("#") ?: return null
    return when (h.length) {
        6 -> h.toLongOrNull(16)?.let { 0xFF000000L or it }
        3 -> h.map { "$it$it" }.joinToString("").toLongOrNull(16)?.let { 0xFF000000L or it }
        else -> null
    }
}
fun kalHexOut(c: Long): String = "#%06x".format(c and 0xFFFFFF)

/** Fagfarge: eget valg (subjectColors), serverens farge, fast palett eller en farge fra navnet. */
fun kalSubjectColor(subject: String?, server: Long?, own: Map<String, Long> = emptyMap()): Long {
    val s = subject?.trim().orEmpty()
    own[s]?.let { return it }
    server?.let { return it }
    val l = s.lowercase()
    KAL_SUBJ.entries.firstOrNull { l.startsWith(it.key) }?.let { return it.value }
    return if (s.isEmpty()) 0xFF5C5850 else KAL_PAL[(s.hashCode() and 0x7fffffff) % KAL_PAL.size]
}

/** Fargen hendelsen vises med: prøver og frister alltid i lab-rødt. */
fun kalColor(e: Kal26Ev, own: Map<String, Long> = emptyMap()): Long = when (e.type) {
    "prove", "innl" -> KAL_LAB
    "bursdag" -> KAL_BD
    "skole", "fri" -> e.color ?: KAL_SKOLE
    else -> kalSubjectColor(e.subject ?: e.title, e.color, own)
}

/** Kortnavnet i ukevisningen og widgetene («Matte R2»). */
fun kalShort(e: Kal26Ev): String = if (e.type == "time") e.short.ifBlank { e.subject ?: e.title } else e.title

/** «A-112 · Kari Hansen» */
fun kalRoomTeacher(e: Kal26Ev): String = listOfNotNull(e.room?.takeIf { it.isNotBlank() }, (if (e.type == "time") e.teacher else e.note)?.takeIf { it.isNotBlank() }).joinToString(" · ")

/* ---------- Tolking ---------- */

private fun kalDT(s: String?): Pair<LocalDate, LocalTime?>? {
    val v = s?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    if (v.length <= 10) return runCatching { LocalDate.parse(v) to null }.getOrNull()
    val dt = runCatching { OffsetDateTime.parse(v).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime() }.getOrNull()
        ?: runCatching { LocalDateTime.parse(v.removeSuffix("Z")) }.getOrNull()
        ?: runCatching { LocalDate.parse(v.take(10)).atStartOfDay() }.getOrNull()
        ?: return null
    return dt.toLocalDate() to dt.toLocalTime()
}

/** Gjenkjenner typen etter claude-code-kalender.md når serveren ikke sender den. */
private fun kalGuessType(title: String, allDay: Boolean, source: String): String {
    val t = title.lowercase()
    return when {
        source == "birthdays" -> "bursdag"
        Regex("prøve|heldag|muntlig").containsMatchIn(t) -> "prove"
        Regex("innlevering|frist").containsMatchIn(t) -> "innl"
        allDay && Regex("\\bfri\\b|planleggingsdag").containsMatchIn(t) -> "fri"
        allDay || source == "google" -> "skole"
        else -> "time"
    }
}

fun parseKal26(o: JSONObject, subjects: Map<String, Long> = emptyMap()): Kal26Ev? {
    val title = o.optStr("title") ?: o.optStr("summary") ?: return null
    val st = kalDT(o.optStr("start") ?: o.optStr("date")) ?: return null
    val en = kalDT(o.optStr("end"))
    val allDay = o.optBoolean("allDay", st.second == null)
    val source = o.optStr("source")?.lowercase() ?: "ical"
    val type = o.optStr("type")?.lowercase()?.let { if (it == "birthday") "bursdag" else it }?.takeIf { it in setOf("time", "prove", "innl", "bursdag", "skole", "fri") }
        ?: kalGuessType(title, allDay, source)
    // Heldag: iCal-slutt er dagen etter (eksklusiv). Én dag uten slutt.
    val endDate: LocalDate = if (!allDay || en == null) st.first else {
        val e = en.first
        val t = en.second
        val d = if (e.isAfter(st.first) && (t == null || t == LocalTime.MIDNIGHT)) e.minusDays(1) else e
        if (d.isBefore(st.first)) st.first else d
    }
    val subject = o.optStr("subject")
    val color = kalHex(o.optStr("color")) ?: subject?.let { subjects[it] }
    val start = if (allDay) null else st.second
    val end: LocalTime? = when {
        allDay || en == null -> null
        en.first == st.first -> en.second
        en.first.isAfter(st.first) -> LocalTime.of(23, 59)
        else -> null
    }
    val cal = o.optStr("calendar")?.let { KAL_FILTER_ALIAS[it] ?: it }?.takeIf { it in KAL_CAL_IDS } ?: ""
    val rep = (o.optStr("repeat") ?: o.optStr("recurrence")?.let { r ->
        val u = r.uppercase()
        when { "DAILY" in u -> "daily"; "WEEKLY" in u -> "weekly"; "MONTHLY" in u -> "monthly"; else -> null }
    })?.takeIf { it in setOf("daily", "weekly", "monthly") }
    return Kal26Ev(
        o.optStr("id") ?: "${st.first}|${start ?: "all"}|$title", title, o.optStr("short") ?: "", subject, o.optStr("room") ?: o.optStr("location"),
        o.optStr("teacher"), o.optStr("note") ?: o.optStr("description"), st.first, endDate, start, end, allDay, type, color, source, o.optStr("url"), o.optStr("mazemap"),
        calendar = cal, editable = o.optBoolean("editable", false), repeat = rep, remind = o.optStr("reminder")?.takeIf { v -> KAL_REMS.any { it.first == v } },
        googleId = o.optStr("googleId"),
    )
}

private fun subjMap(o: JSONObject?): Map<String, Long> = o?.keys()?.asSequence()?.mapNotNull { k -> kalHex(o.optString(k))?.let { k to it } }?.toMap() ?: emptyMap()

/** Svaret fra /api/kalender eller /api/widgets/calendar: hendelser og fagfarger. Ukjente felt hoppes over. */
fun parseKalResp26(raw: String): Pair<List<Kal26Ev>, Map<String, Long>> {
    val t = raw.trim()
    if (t.startsWith("[")) { val a = JSONArray(t); return (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let { o -> parseKal26(o) } } to emptyMap() }
    val o = JSONObject(t)
    val subj = subjMap(o.optJSONObject("subjects"))
    val out = LinkedHashMap<String, Kal26Ev>()
    fun take(a: JSONArray?) { (0 until (a?.length() ?: 0)).forEach { i -> a?.optJSONObject(i)?.let { parseKal26(it, subj) }?.let { out.putIfAbsent(it.id, it) } } }
    fun takeOne(x: JSONObject?) { x?.let { parseKal26(it, subj) }?.let { out.putIfAbsent(it.id, it) } }
    take(o.optJSONArray("events"))
    // /api/widgets/calendar: today, exams/tests, nextSchoolDay {events}, now, next.
    take(o.optJSONArray("today")); take(o.optJSONObject("today")?.optJSONArray("events")); take(o.optJSONArray("lessons")); take(o.optJSONArray("exams")); take(o.optJSONArray("tests"))
    o.optJSONObject("nextSchoolDay")?.let { take(it.optJSONArray("events")); take(it.optJSONArray("lessons")) }
    take(o.optJSONArray("nextSchoolDay"))
    takeOne(o.optJSONObject("now")); takeOne(o.optJSONObject("next"))
    o.optJSONObject("now")?.let { n -> takeOne(n.optJSONObject("current")); takeOne(n.optJSONObject("next")); takeOne(n.optJSONObject("nextTest")) }
    return out.values.toList() to subj
}

/* ---------- Regler (felles for siden, Hjem-kortet og widgetene) ---------- */

/** Hendelsene en dag: planleggingsdag/fri fjerner timene, prøver erstatter timene de overlapper, sortert (heldag først). */
fun kalDay(evs: List<Kal26Ev>, d: LocalDate, hidden: Set<String> = emptySet()): List<Kal26Ev> {
    val on = evs.filter { if (it.allDay) !d.isBefore(it.date) && !d.isAfter(it.endDate) else it.date == d }
    val free = on.any { it.allDay && (it.type == "fri" || Regex("\\bfri\\b|planleggingsdag", RegexOption.IGNORE_CASE).containsMatchIn(it.title)) }
    var l = if (free) on.filter { it.type != "time" } else on
    l.filter { it.type == "prove" && it.sMin != null && it.eMin != null }.forEach { x ->
        val a = x.sMin!!; val b = x.eMin!!
        l = l.filter { it.type != "time" || it.sMin == null || it.eMin == null || it.eMin!! <= a || it.sMin!! >= b }
    }
    return l.filter { it.cat !in hidden }.sortedWith(compareBy<Kal26Ev> { it.sMin ?: -1 }.thenBy { it.title })
}

/** Kommende prøver og frister fra i dag, sortert etter dato og tid. */
fun kalExams(evs: List<Kal26Ev>, today: LocalDate): List<Kal26Ev> =
    evs.filter { it.isExam && !it.date.isBefore(today) }.distinctBy { it.id }.sortedWith(compareBy<Kal26Ev> { it.date }.thenBy { it.sMin ?: 0 })

fun kalDaysTo(d: LocalDate, today: LocalDate): Int = ChronoUnit.DAYS.between(today, d).toInt()
/** «I dag», «I morgen» eller «5 dager». */
fun kalIn(dd: Int): String = when (dd) { 0 -> "I dag"; 1 -> "I morgen"; else -> "$dd dager" }
fun kalDur(x: Int): String = if (x >= 60) "${x / 60} t ${x % 60} min" else "$x min"
fun kalCap(s: String): String = s.replaceFirstChar { it.uppercase() }
/** «mandag 19. oktober» */
fun kalLong(d: LocalDate): String = "${BD_WD[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${BD_MN[d.monthValue - 1]}"
fun kalIsoWeek(d: LocalDate): Int = d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)

private fun lessonsOn(evs: List<Kal26Ev>, d: LocalDate) = kalDay(evs, d).filter { it.sMin != null && it.eMin != null && (it.type == "time" || it.type == "prove") }

/** Nå-kortet: NÅ, NESTE TIME, NESTE SKOLEDAG eller FRI, og neste prøve. */
class KalNow(val k: String, val whenText: String, val title: String, val sub: String, val color: Long, val pct: Float?, val next: String, val ev: Kal26Ev?)

fun kalNow(evs: List<Kal26Ev>, now: LocalDateTime, own: Map<String, Long> = emptyMap()): KalNow {
    val today = now.toLocalDate()
    val nm = now.hour * 60 + now.minute
    val tl = lessonsOn(evs, today)
    val cur = tl.firstOrNull { nm >= it.sMin!! && nm < it.eMin!! }
    val nx = tl.firstOrNull { it.sMin!! > nm }
    var r = when {
        cur != null -> KalNow("NÅ", "${cur.sText}–${cur.eText}", cur.title,
            (listOfNotNull(cur.room?.takeIf { it.isNotBlank() }, cur.teacher?.takeIf { it.isNotBlank() }) + "${cur.eMin!! - nm} min igjen").joinToString(" · "),
            kalColor(cur, own), (nm - cur.sMin!!).toFloat() / (cur.eMin!! - cur.sMin!!).coerceAtLeast(1),
            nx?.let { "Deretter: ${it.title} ${it.sText}" + (it.room?.let { r -> " · $r" } ?: "") } ?: "Siste time i dag", cur)
        nx != null -> KalNow("NESTE TIME", "om " + kalDur(nx.sMin!! - nm), nx.title, "${nx.sText}–${nx.eText}" + (nx.room?.let { " · $it" } ?: ""), kalColor(nx, own), null, "", nx)
        else -> {
            var f: Kal26Ev? = null
            var d = today
            for (i in 1..14) { d = today.plusDays(i.toLong()); f = lessonsOn(evs, d).firstOrNull(); if (f != null) break }
            if (f != null) KalNow("NESTE SKOLEDAG", kalLong(d), f.title, "${f.sText}–${f.eText}" + (f.room?.let { " · $it" } ?: "") + " · første time", kalColor(f, own), null, "", f)
            else KalNow("FRI", "", "Ingen timer", "", 0xFF7A7468, null, "", null)
        }
    }
    kalExams(evs, today).firstOrNull()?.let { ne ->
        val dd = kalDaysTo(ne.date, today)
        val t = ne.title + " " + when (dd) { 0 -> "i dag"; 1 -> "i morgen"; else -> "om $dd dager" }
        r = KalNow(r.k, r.whenText, r.title, r.sub, r.color, r.pct, if (r.next.isNotEmpty()) r.next + " · " + t else t, r.ev)
    }
    return r
}

/** Én rad i widgetene: tid, kortnavn, rom, farge og om timen er passert (dempes til 45 %). */
data class KalWRow(val id: String, val s: String, val tm: String, val title: String, val short: String, val sub: String, val room: String, val color: Long, val dim: Boolean)
data class KalWEx(val id: String, val title: String, val inText: String, val red: Boolean)

/** Innholdet i widgetene og Hjem-kortet (seksjonen «WIDGETS PÅ TELEFONEN» i designet). */
data class KalW(
    val k: String, val big: String, val title: String, val sub: String, val color: Long, val whenText: String,
    val dayT: String, val dayL: String, val cnt: String, val n3: List<KalWRow>, val all: List<KalWRow>, val ex: List<KalWEx>, val evId: String?,
)

fun kalWidget(evs: List<Kal26Ev>, now: LocalDateTime, own: Map<String, Long> = emptyMap()): KalW {
    val today = now.toLocalDate()
    val nm = now.hour * 60 + now.minute
    var wd = today
    var wl = lessonsOn(evs, today)
    var isT = true
    if (wl.none { it.eMin!! > nm }) {
        isT = false
        for (i in 1 until 14) { val d = today.plusDays(i.toLong()); val l = lessonsOn(evs, d); if (l.isNotEmpty()) { wd = d; wl = l; break } }
        if (wd == today) wl = emptyList()
    }
    val cur = if (isT) wl.firstOrNull { nm >= it.sMin!! && nm < it.eMin!! } else null
    val nx = cur ?: (if (isT) wl.firstOrNull { it.sMin!! > nm } else wl.firstOrNull()) ?: wl.firstOrNull()
    val ix = maxOf(0, wl.indexOf(nx))
    val dS = kalCap(BD_WD[wd.dayOfWeek.value - 1])
    fun row(e: Kal26Ev) = KalWRow(e.id, e.sText, "${e.sText}–${e.eText}", e.title, kalShort(e),
        listOfNotNull(e.room?.takeIf { it.isNotBlank() }, e.teacher?.takeIf { it.isNotBlank() }).joinToString(" · "), e.room.orEmpty(), kalColor(e, own), isT && e.eMin!! <= nm)
    val n3 = wl.drop(ix + 1).take(3).map(::row).ifEmpty { wl.take(3).map(::row) }
    val ex = kalExams(evs, today).take(2).map { x -> val dd = kalDaysTo(x.date, today); KalWEx(x.id, x.title, kalIn(dd), dd <= 7) }
    return KalW(
        k = when { nx == null -> "FRI"; cur != null -> "NÅ"; isT -> "NESTE TIME"; else -> dS.uppercase() },
        big = when { nx == null -> "–"; cur != null -> cur.eText; else -> nx.sText },
        title = nx?.title ?: "Ingen timer",
        sub = nx?.let { listOfNotNull(it.room?.takeIf { r -> r.isNotBlank() }, it.teacher?.takeIf { t -> t.isNotBlank() }).joinToString(" · ") } ?: "",
        color = nx?.let { kalColor(it, own) } ?: 0xFF999999,
        whenText = when { nx == null -> ""; cur != null -> kalDur(cur.eMin!! - nm) + " igjen"; isT -> "om " + kalDur(nx.sMin!! - nm); else -> "første time" },
        dayT = (if (isT) "I dag · " else "") + "$dS ${wd.dayOfMonth}. ${BD_MS[wd.monthValue - 1]}",
        dayL = (if (isT) "I dag · " else "") + "$dS ${wd.dayOfMonth}. ${BD_MN[wd.monthValue - 1]}",
        cnt = "${wl.size} timer", n3 = n3, all = wl.take(5).map(::row), ex = ex, evId = nx?.id,
    )
}

/** Neste tidspunkt widgetene skal tegnes på nytt: start eller slutt på en time, ellers midnatt. */
fun kalNextBoundary(evs: List<Kal26Ev>, now: LocalDateTime): LocalDateTime {
    val today = now.toLocalDate()
    val pts = (0..1).flatMap { i ->
        val d = today.plusDays(i.toLong())
        lessonsOn(evs, d).flatMap { listOfNotNull(it.start?.let { s -> d.atTime(s) }, it.end?.let { e -> d.atTime(e) }) }
    }.filter { it.isAfter(now) }
    return pts.minOrNull() ?: today.plusDays(1).atStartOfDay().plusMinutes(1)
}

/* ---------- Tilstand ---------- */

class Kal26State {
    var open by mutableStateOf(false)
    var events by mutableStateOf<List<Kal26Ev>?>(null)
    var subjects by mutableStateOf<Map<String, Long>>(emptyMap())
    /** true når serveren ikke har /api/kalender (404). */
    var unavailable by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var loading by mutableStateOf(false)
    /** Prompt 27: dag | 3dager | uke | maaned | liste (gamle «agenda» leses som liste). */
    var view by mutableStateOf("3dager")
    var off by mutableStateOf(0)
    var day by mutableStateOf<LocalDate?>(null)
    var sel by mutableStateOf<Kal26Ev?>(null)
    var edit by mutableStateOf(false)
    var order by mutableStateOf(KAL_CARDS)
    var hiddenCards by mutableStateOf<Set<String>>(emptySet())
    var hiddenFilters by mutableStateOf<Set<String>>(emptySet())
    var reminders by mutableStateOf<Map<String, String>>(emptyMap())
    var subjectColors by mutableStateOf<Map<String, Long>>(emptyMap())
    /** Hendelsen widgeten pekte på (finanshub://kalender?id=…): åpnes når dataene er hentet. */
    internal var pendingId: String? = null
    /* Prompt 27 (Kalender v2): dagen visningen tar utgangspunkt i (null = i dag), minikalenderen, søk, skjema og kalenderne fra serveren. */
    var cur by mutableStateOf<LocalDate?>(null)
    var mini by mutableStateOf(false)
    var miniOff by mutableStateOf(0)
    var search by mutableStateOf(false)
    var q by mutableStateOf("")
    var results by mutableStateOf<List<Kal26Ev>?>(null)
    var form by mutableStateOf<Kal27Form?>(null)
    var saving by mutableStateOf(false)
    var delArm by mutableStateOf(false)
    /** Navn og farge per kalender fra svaret (calendars), og hvilke som kan skrives til. */
    var cals by mutableStateOf<List<Kal27Cal>>(emptyList())
    internal var range: Pair<LocalDate, LocalDate>? = null
    internal var loadedFor: String? = null
    internal var layoutFor: String? = null
}

/* ---------- Oppsett per bruker ---------- */

private fun AppViewModel.kalKey() = "kal26_lay_" + (account?.id ?: "")

private fun Kal26State.layoutJson(): JSONObject = JSONObject()
    .put("kalOrder", JSONArray(order.map { KAL_CARD_LETTER[it] ?: it })).put("kalHidden", JSONArray(KAL_CARDS.filter { it in hiddenCards }.map { KAL_CARD_LETTER[it] ?: it }))
    .put("kalFilters", JSONObject().apply { KAL_FILTERS.forEach { put(it.first, it.first !in hiddenFilters) } })
    .put("kalView", view).put("kalReminders", JSONObject().apply { reminders.forEach { (k, v) -> put(k, v) } })
    .put("subjectColors", JSONObject().apply { subjectColors.forEach { (k, v) -> put(k, kalHexOut(v)) } })

private fun Kal26State.applyLayout(o: JSONObject) {
    o.optJSONArray("kalOrder")?.let { a ->
        val l = (0 until a.length()).map { a.optString(it) }.map { KAL_CARD_ALIAS[it] ?: it }.filter { it in KAL_CARDS }.distinct()
        if (l.isNotEmpty()) order = l + KAL_CARDS.filter { it !in l }
    }
    if (o.has("kalHidden")) {
        val h = o.optJSONArray("kalHidden")?.let { a -> (0 until a.length()).map { a.optString(it) } }
            ?: o.optJSONObject("kalHidden")?.let { x -> x.keys().asSequence().filter { x.optBoolean(it) }.toList() } ?: emptyList()
        hiddenCards = h.map { KAL_CARD_ALIAS[it] ?: it }.filter { it in KAL_CARDS }.toSet().let { if (it.size >= KAL_CARDS.size) emptySet() else it }
    }
    // kalFilters: {timeplan: true, …} (true = vises), eller en liste med skjulte filtre.
    if (o.has("kalFilters")) {
        val f = o.optJSONObject("kalFilters")
        hiddenFilters = if (f != null) f.keys().asSequence().filter { !f.optBoolean(it, true) }.map { KAL_FILTER_ALIAS[it] ?: it }.toSet()
        else o.optJSONArray("kalFilters")?.let { a -> (0 until a.length()).map { KAL_FILTER_ALIAS[a.optString(it)] ?: a.optString(it) }.toSet() } ?: emptySet()
    }
    o.optStr("kalView")?.let { v -> view = when (v) { "mnd", "maned", "maaned", "month" -> "maaned"; "agenda", "liste", "list" -> "liste"; "dag", "day" -> "dag"; "3d", "3dager" -> "3dager"; else -> "uke" } }
    o.optJSONObject("kalReminders")?.let { r -> reminders = r.keys().asSequence().associateWith { r.optString(it) }.filterValues { v -> KAL_REMS.any { it.first == v } } }
    o.optJSONObject("subjectColors")?.let { subjectColors = subjMap(it) }
}

/** Lagrer ett eller flere felt i /api/me/layout (og lokalt for kontoen). */
private fun AppViewModel.saveKalLayout26(vararg fields: String) {
    val s = kal26
    val all = s.layoutJson()
    prefs.set(kalKey(), all.toString())
    val body = JSONObject().apply { fields.forEach { put(it, all.get(it)) } }
    launch26a { runCatching { api26a { hlPut("/me/layout", body) } } }
}

private fun AppViewModel.loadKalLayout26() {
    val s = kal26
    val acct = account?.id
    if (s.layoutFor == acct) return
    s.layoutFor = acct
    runCatching { JSONObject(prefs.str(kalKey(), "{}")) }.getOrNull()?.let { s.applyLayout(it) }
    launch26a {
        val raw = runCatching { api26a { hlGet("/me/layout") } }.getOrNull() ?: return@launch26a
        runCatching { JSONObject(raw).let { o -> (o.optJSONObject("layout") ?: o).let { s.applyLayout(it) } } }
        prefs.set(kalKey(), s.layoutJson().toString())
    }
}

/* ---------- Åpne, hente og lukke ---------- */

/** Prompt 33: native = true åpner Kalender-appen (kalender://…) når den er installert; false = alltid Homelabs egen kalender. */
fun AppViewModel.openKal26(selId: String? = null, native: Boolean = true) {
    if (native && openKalApp33(selId)) return
    val s = kal26
    s.open = true
    s.edit = false
    s.sel = null
    s.off = 0
    s.day = null
    s.cur = null; s.mini = false; s.miniOff = 0; s.search = false; s.q = ""; s.results = null; s.form = null; s.delArm = false
    s.pendingId = selId
    loadKalLayout26()
    loadKal26()
}

fun AppViewModel.closeKal26() {
    val s = kal26
    Haptics.back() // prompt 34
    when {
        s.form != null -> s.form = null
        s.search -> { s.search = false; s.q = ""; s.results = null }
        s.sel != null -> { s.sel = null; s.delArm = false }
        s.mini -> s.mini = false
        s.edit -> s.edit = false
        else -> s.open = false
    }
}

/** finanshub://kalender[?id=<hendelse>] fra widgetene. */
fun AppViewModel.kalLink26(uri: Uri) = openKal26(uri.getQueryParameter("id"))

/** Henter et vindu rundt det som vises (måneden før og to måneder fram). quiet = Hjem-kortet: ingen feilmelding. */
fun AppViewModel.loadKal26(quiet: Boolean = false, from: LocalDate? = null, to: LocalDate? = null) {
    val s = kal26
    val acct = account?.id
    if (s.loadedFor != acct) { s.events = null; s.range = null; s.loadedFor = acct; s.unavailable = false; s.layoutFor = null }
    loadKalLayout26()
    val today = LocalDate.now()
    val cur = s.range
    var a = from ?: today.withDayOfMonth(1).minusDays(7)
    var b = to ?: today.plusDays(62)
    if (cur != null && from != null) { if (!a.isBefore(cur.first) && !b.isAfter(cur.second)) return; a = minOf(a, cur.first); b = maxOf(b, cur.second) }
    if (s.loading && from != null) return
    s.loading = true
    launch26a {
        try {
            val raw = api26a { hlGet("/kalender?from=$a&to=$b", timeout = 15_000) }
            val (evs, subj) = parseKalResp26(raw)
            s.events = evs; s.subjects = subj; s.range = a to b
            runCatching { parseKalCals27(raw) }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { s.cals = it }
            s.unavailable = false; s.error = null
            pushKalWidgets26(raw, a, b)
            scheduleKalReminders26()
            s.pendingId?.let { id -> s.pendingId = null; evs.firstOrNull { it.id == id }?.let { e -> s.sel = e; s.cur = e.date } }
        } catch (e: ApiException) {
            if (e.status == 404) { s.unavailable = true; if (s.events == null) s.events = emptyList() }
            else { if (!quiet) s.error = e.message; if (s.events == null) s.events = emptyList() }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
            if (!quiet) s.error = uiErr73(e, "Fikk ikke hentet kalenderen")
            if (s.events == null) s.events = emptyList()
        } finally { s.loading = false }
    }
}

private fun AppViewModel.pushKalWidgets26(raw: String, a: LocalDate, b: LocalDate) {
    val ctx = getApplication<android.app.Application>()
    runCatching { no.kristo.finanshub.widget.Kal26WidgetStore.save(ctx, raw, account?.id) }
}

/* ---------- Valg på siden ---------- */

fun AppViewModel.setKalView26(v: String) {
    val s = kal26
    s.view = v; s.off = 0; s.sel = null; s.day = null
    Haptics.select()
    saveKalLayout26("kalView")
}

fun AppViewModel.toggleKalFilter26(k: String) {
    val s = kal26
    s.hiddenFilters = if (k in s.hiddenFilters) s.hiddenFilters - k else s.hiddenFilters + k
    Haptics.select()
    saveKalLayout26("kalFilters")
}

fun AppViewModel.moveKalCard26(k: String, dir: Int) {
    val s = kal26
    val o = s.order.toMutableList()
    val vis = o.filter { it !in s.hiddenCards }
    val other = vis.getOrNull(vis.indexOf(k) + dir) ?: return
    val i = o.indexOf(k); val j = o.indexOf(other)
    o[i] = other; o[j] = k
    s.order = o
    Haptics.select()
    saveKalLayout26("kalOrder")
}

fun AppViewModel.hideKalCard26(k: String) {
    val s = kal26
    // Minst ett kort må være synlig.
    if (KAL_CARDS.count { it !in s.hiddenCards } <= 1) return
    s.hiddenCards = s.hiddenCards + k
    Haptics.tap()
    saveKalLayout26("kalHidden")
}

fun AppViewModel.showKalCard26(k: String) {
    kal26.hiddenCards = kal26.hiddenCards - k
    Haptics.select()
    saveKalLayout26("kalHidden")
}

fun AppViewModel.resetKalCards26() {
    kal26.order = KAL_CARDS; kal26.hiddenCards = emptySet()
    Haptics.success()
    saveKalLayout26("kalOrder", "kalHidden")
}

/** Standard påminnelse: dagen før for prøver og frister, ingen for timer og andre hendelser. */
fun Kal26State.reminderFor(e: Kal26Ev): String = reminders[e.id] ?: if (e.isExam) "day" else "none"

fun AppViewModel.setKalReminder26(e: Kal26Ev, v: String) {
    val s = kal26
    s.reminders = s.reminders + (e.id to v)
    Haptics.select()
    saveKalLayout26("kalReminders")
    scheduleKalReminder26(getApplication<android.app.Application>(), e, v)
    if (v != "none") flash("Påminnelse " + (KAL_REMS.firstOrNull { it.first == v }?.second?.lowercase() ?: ""))
}

/* ---------- Lokale påminnelser (WorkManager, ± 1 min) ---------- */

private fun kalRemindAt(e: Kal26Ev, v: String): LocalDateTime? {
    val st = e.start?.let { e.date.atTime(it) }
    return when (v) {
        "15m" -> (st ?: e.date.atTime(8, 0)).minusMinutes(15)
        "1h" -> (st ?: e.date.atTime(8, 0)).minusHours(1)
        // «Dagen før» kl. 18:00 (likt med iOS).
        "day" -> e.date.minusDays(1).atTime(18, 0)
        else -> null
    }
}

fun scheduleKalReminder26(ctx: Context, e: Kal26Ev, v: String) {
    val wm = runCatching { WorkManager.getInstance(ctx) }.getOrNull() ?: return
    val name = "kal26-rem-" + e.id
    val at = kalRemindAt(e, v)
    val now = LocalDateTime.now()
    if (at == null || !at.isAfter(now)) { wm.cancelUniqueWork(name); return }
    val whenText = (when (kalDaysTo(e.date, at.toLocalDate())) { 0 -> "I dag"; 1 -> "I morgen"; else -> kalCap(kalLong(e.date)) }) + " · " + e.timeText
    val req = OneTimeWorkRequestBuilder<Kal26RemindWorker>()
        .setInitialDelay(Duration.between(now, at).toMinutes().coerceAtLeast(0), TimeUnit.MINUTES)
        .setInputData(workDataOf("id" to e.id, "title" to e.title, "text" to (whenText + (e.room?.let { " · $it" } ?: ""))))
        .build()
    wm.enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, req)
}

/** Etter hver henting: påminnelser for hendelsene de neste tre ukene (eget valg eller standard). */
private fun AppViewModel.scheduleKalReminders26() {
    val s = kal26
    val ctx = getApplication<android.app.Application>()
    val today = LocalDate.now()
    (s.events ?: emptyList()).filter { !it.date.isBefore(today) && it.date.isBefore(today.plusDays(22)) }.forEach { e ->
        val v = s.reminderFor(e)
        if (v != "none" || e.id in s.reminders) runCatching { scheduleKalReminder26(ctx, e, v) }
    }
}

class Kal26RemindWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val title = inputData.getString("title") ?: return Result.success()
        Notify.post(applicationContext, title, inputData.getString("text") ?: "", "kal26-" + (inputData.getString("id") ?: title), group = "kalender")
        return Result.success()
    }
}

/*
 * Prompt 27 (ANDROID-A): Kalender v2 (design/Kalender.dc.html, variant «mobile», claude-code-kalender-v2.md).
 * Fullskjerm uten toppbilde og uten appens fanelinje: Dag · 3 dager · Uke · Måned · Liste, NESTE/NÅ-stripe, minikalender med
 * kalenderfilter, søk (GET /api/kalender/search), ny/rediger/slett (POST/PATCH/DELETE /api/kalender/events, Google Privat/Familie)
 * og «Kopier til Privat» (POST /api/kalender/events/:id/copy). Tilstanden ligger i Kal26State (Kalender.kt), grensesnittet i ui/KalenderSkjerm.kt.
 */

/** En kalender fra svaret (calendars): navn, farge, om den kan skrives til og om den er på. */
data class Kal27Cal(val id: String, val name: String, val color: Long, val writable: Boolean, val enabled: Boolean)

/** Skjemaet for ny eller endret hendelse. id = null er ny. */
data class Kal27Form(
    val id: String?, val title: String, val allDay: Boolean, val date: LocalDate, val start: LocalTime, val end: LocalTime, val endDate: LocalDate?,
    val location: String, val calendar: String, val repeat: String, val reminder: String, val note: String, val err: String = "",
)

/** Gjenta-valgene i skjemaet. */
val KAL27_REPEATS = listOf("none" to "Ingen", "daily" to "Hver dag", "weekly" to "Hver uke", "monthly" to "Hver måned")

/** Fanene nederst: nøkkel, navn og strekikon (24 × 24) fra designet. */
val KAL27_VIEWS = listOf(
    Triple("dag", "Dag", "M5 4h14v16H5zM5 9h14"),
    Triple("3dager", "3 dager", "M3 5h18v15H3zM9 5v15M15 5v15"),
    Triple("uke", "Uke", "M3 5h18v15H3zM3 10h18M7.5 5v15M12 5v15M16.5 5v15"),
    Triple("maaned", "Måned", "M3 5h18v15H3zM3 10h18M3 15h18M9 5v15M15 5v15"),
    Triple("liste", "Liste", "M4 6h16M4 12h16M4 18h10"),
)

private val KAL27_SRC = mapOf(
    "timeplan" to "skolens iCal", "prover" to "skolens iCal", "skole" to "skolens iCal",
    "privat" to "Google Kalender", "familie" to "Google Kalender (delt med familien)", "bursdager" to "Bursdager-modulen",
    "abonnementer" to "Finans → Abonnementer (innebygd, endres i Finans)", // prompt 42
)

fun parseKalCals27(raw: String): List<Kal27Cal> {
    val t = raw.trim()
    if (!t.startsWith("{")) return emptyList()
    val a = JSONObject(t).optJSONArray("calendars") ?: return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        // Prompt 42: den innebygde kalenderen Abonnementer (id «ab», source «builtin») har fast nøkkel i appen.
        val id = o.optStr("id")?.let { if (it == "ab" || it == "subscriptions") "abonnementer" else it } ?: return@mapNotNull null
        val def = KAL_FILTERS.firstOrNull { it.first == id }
        Kal27Cal(id, o.optStr("name") ?: def?.second ?: id, kalHex(o.optStr("color")) ?: def?.third ?: 0xFF7A7468,
            o.optBoolean("writable", id == "privat" || id == "familie"), o.optBoolean("enabled", true))
    }
}

/** Alle seks kalenderne i fast rekkefølge, med navn og farge fra serveren når de finnes. */
fun Kal26State.calList27(): List<Kal27Cal> = KAL_FILTERS.map { (id, n, c) ->
    cals.firstOrNull { it.id == id } ?: Kal27Cal(id, n, c ?: 0xFF7A7468, id == "privat" || id == "familie", true)
} + cals.filter { c -> KAL_FILTERS.none { it.first == c.id } }

fun Kal26State.calName27(id: String): String = calList27().firstOrNull { it.id == id }?.name ?: id
fun Kal26State.calColor27(id: String): Long = calList27().firstOrNull { it.id == id }?.color ?: 0xFF7A7468
fun kalSrc27(id: String): String = KAL27_SRC[id] ?: "kilden"

/** Fargen i v2: timer i fagets farge, alt annet i kalenderens farge (prøver og frister lab-rødt). */
fun kalColor27(e: Kal26Ev, s: Kal26State): Long = when {
    e.type == "time" -> kalSubjectColor(e.subject ?: e.title, e.color, s.subjectColors)
    e.isExam -> KAL_LAB
    else -> s.calColor27(e.cat)
}

/** Hendelsene en dag i v2 (samme regler som før, skjulte kalendere tatt ut). */
fun kalDay27(evs: List<Kal26Ev>, d: LocalDate, hidden: Set<String>): List<Kal26Ev> = kalDay(evs, d, hidden)

/** Dagen visningen tar utgangspunkt i. */
fun Kal26State.curDay27(today: LocalDate = LocalDate.now()): LocalDate = cur ?: today

/** Første dag i rutenettet: mandag i uka (Uke), ellers dagen selv. */
fun kalGridStart27(view: String, cur: LocalDate): LocalDate = if (view == "uke") cur.minusDays((cur.dayOfWeek.value - 1).toLong()) else cur
fun kalGridDays27(view: String): Int = when (view) { "dag" -> 1; "3dager" -> 3; else -> 7 }

/** Datoene som må hentes for det som vises. */
fun kalWindow27(view: String, cur: LocalDate): Pair<LocalDate, LocalDate> = when (view) {
    "maaned" -> {
        val m0 = cur.withDayOfMonth(1)
        val st = m0.minusDays((m0.dayOfWeek.value - 1).toLong())
        st.minusDays(1) to st.plusDays(43)
    }
    "liste" -> cur.minusDays(1) to cur.plusDays(46)
    else -> kalGridStart27(view, cur).let { it.minusDays(1) to it.plusDays(kalGridDays27(view) + 1L) }
}

/** NESTE / NÅ: neste hendelse med klokkeslett (time eller annen) de neste tre ukene. */
class KalNext27(val k: String, val title: String, val sub: String, val whenText: String, val color: Long, val ev: Kal26Ev?)

private fun kalDur27(x: Int): String = when {
    x < 60 -> "$x min"
    x < 1440 -> "${x / 60} t" + (if (x % 60 != 0) " ${x % 60} min" else "")
    else -> "${Math.round(x / 1440.0)} d"
}

fun kalNext27(s: Kal26State, evs: List<Kal26Ev>, now: LocalDateTime): KalNext27 {
    val today = now.toLocalDate()
    val nm = now.hour * 60 + now.minute
    for (i in 0 until 21) {
        val d = today.plusDays(i.toLong())
        val l = kalDay27(evs, d, s.hiddenFilters).filter { it.sMin != null && it.eMin != null && it.type != "innl" }
        for (e in l) {
            val a = e.sMin!! + i * 1440
            val b = e.eMin!! + i * 1440
            if (b > nm) {
                val curr = a <= nm
                val day = when (i) { 0 -> "I dag"; 1 -> "I morgen"; else -> kalCap(kalLong(d)) }
                val sub = "$day · ${e.sText}–${e.eText}" + (e.room?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
                val w = when {
                    curr -> kalDur27(b - nm) + " igjen"
                    a - nm < 1440 -> "om " + kalDur27(a - nm)
                    else -> kalCap(BD_WD[d.dayOfWeek.value - 1]).take(3)
                }
                return KalNext27(if (curr) "NÅ" else "NESTE", e.title, sub, w, kalColor27(e, s), e)
            }
        }
    }
    return KalNext27("", "Ingen kommende hendelser", "De neste tre ukene", "", 0xFF7A7468, null)
}

/* ---------- Valg ---------- */

fun AppViewModel.setKalView27(v: String) {
    val s = kal26
    s.view = v; s.sel = null; s.mini = false
    Haptics.select()
    saveKalView27()
}

private fun AppViewModel.saveKalView27() {
    val s = kal26
    runCatching {
        val k = "kal26_lay_" + (account?.id ?: "")
        val o = runCatching { JSONObject(prefs.str(k, "{}")) }.getOrElse { JSONObject() }
        prefs.set(k, o.put("kalView", s.view).toString())
    }
    launch26a { runCatching { api26a { hlPut("/me/layout", JSONObject().put("kalView", s.view)) } } }
}

/** Forrige/neste periode (sveip eller piler). */
fun AppViewModel.shiftKal27(dir: Int) {
    val s = kal26
    val c = s.curDay27()
    s.cur = if (s.view == "maaned") c.withDayOfMonth(1).plusMonths(dir.toLong()) else c.plusDays(dir.toLong() * when (s.view) { "dag" -> 1; "3dager" -> 3; "uke" -> 7; else -> 14 })
    s.sel = null
    Haptics.select()
}

fun AppViewModel.kalToday27() { val s = kal26; s.cur = null; s.mini = false; s.sel = null; Haptics.select() }

/** Ny hendelse: på en halvtime (trykk i rutenettet) eller neste hele halvtime i dag. */
fun AppViewModel.openKalForm27(date: LocalDate? = null, startMin: Int? = null) {
    val s = kal26
    val now = LocalDateTime.now()
    val st = (startMin ?: ((now.hour * 60 + now.minute + 29) / 30 * 30)).coerceIn(0, 22 * 60 + 30)
    val en = minOf(st + 60, 23 * 60 + 59)
    s.sel = null; s.mini = false; s.delArm = false
    val writable = s.calList27().filter { it.writable }.map { it.id }
    s.form = Kal27Form(null, "", false, date ?: s.curDay27(), LocalTime.of(st / 60, st % 60), LocalTime.of(en / 60, en % 60), null, "",
        if ("privat" in writable || writable.isEmpty()) "privat" else writable.first(), "none", "15m", "")
}

/** Rediger en egen hendelse (Google Privat/Familie). */
fun AppViewModel.editKal27(e: Kal26Ev) {
    val s = kal26
    s.sel = null; s.delArm = false
    s.form = Kal27Form(e.id, e.title, e.allDay, e.date, e.start ?: LocalTime.of(9, 0), e.end ?: (e.start?.plusHours(1) ?: LocalTime.of(10, 0)),
        if (e.allDay && e.endDate != e.date) e.endDate else null, e.room.orEmpty(), if (e.cat == "familie") "familie" else "privat",
        e.repeat ?: "none", e.remind ?: s.reminderFor(e), e.note.orEmpty())
}

/** Kopi i Privat som et nytt skjema (fallback når serveren ikke har /copy). */
fun AppViewModel.dupKal27(e: Kal26Ev) {
    val s = kal26
    s.sel = null; s.delArm = false
    s.form = Kal27Form(null, e.title, e.allDay, e.date, e.start ?: LocalTime.of(9, 0), e.end ?: LocalTime.of(10, 0), null, e.room.orEmpty(),
        "privat", "none", "15m", e.note.orEmpty())
}

private fun kalEnc27(id: String): String = URLEncoder.encode(id, "UTF-8")
private fun Kal26Ev.srvId27(): String = googleId ?: id

/** Henter det som vises på nytt (etter lagring, sletting eller kopiering). */
fun AppViewModel.reloadKal27() {
    val s = kal26
    val (a, b) = kalWindow27(s.view, s.curDay27())
    s.range = null
    loadKal26(quiet = false, from = minOf(a, LocalDate.now().withDayOfMonth(1).minusDays(7)), to = maxOf(b, LocalDate.now().plusDays(62)))
}

private fun kalErr27(e: ApiException): String = when (e.status) {
    409 -> "Google-tilkoblingen mangler skrivetilgang. Koble til Google på nytt i Innstillinger → Kalendere."
    404 -> "Serveren kan ikke lagre hendelser ennå. Oppdater Homelab-serveren."
    else -> e.message ?: "Fikk ikke lagret"
}

fun AppViewModel.saveKalForm27() {
    val s = kal26
    val f = s.form ?: return
    val t = f.title.trim()
    if (t.isEmpty()) { s.form = f.copy(err = "Skriv en tittel."); return }
    if (!f.allDay && !f.end.isAfter(f.start)) { s.form = f.copy(err = "Slutt må være etter start."); return }
    if (s.saving) return
    val body = JSONObject().put("title", t).put("allDay", f.allDay).put("date", f.date.toString())
        .put("start", kalHm(f.start)).put("end", kalHm(f.end)).put("location", f.location.trim()).put("calendar", f.calendar)
        .put("repeat", f.repeat).put("reminder", f.reminder).put("note", f.note.trim())
    f.endDate?.takeIf { f.allDay && it.isAfter(f.date) }?.let { body.put("endDate", it.toString()) }
    s.saving = true
    launch26a {
        try {
            val raw = if (f.id == null) api26a { hlPost("/kalender/events", body) }
            else {
                val old = s.events?.firstOrNull { it.id == f.id }
                api26a { request("PATCH", "/kalender/events/" + kalEnc27(old?.srvId27() ?: f.id), body, prefix = Api.HOMELAB) }
            }
            // Lokal påminnelse for den nye/endrede hendelsen (WorkManager, som før).
            val newId = runCatching { JSONObject(raw).let { o -> o.optJSONObject("event")?.optStr("id") ?: o.optStr("id") } }.getOrNull() ?: f.id
            if (newId != null) s.reminders = s.reminders + (newId to f.reminder)
            s.form = null
            s.cur = f.date
            Haptics.success()
            flash(if (f.id == null) "Hendelsen er lagt til" else "Endringene er lagret")
            // Prompt 33: ny tittel på en rask time → forslag om å huske avsenderen (lagres bare med «Husk»).
            if (f.id != null) suggestMem33(runCatching { JSONObject(raw).optJSONObject("suggestMemory") }.getOrNull())
            reloadKal27()
        } catch (e: ApiException) {
            s.form = s.form?.copy(err = kalErr27(e)); Haptics.error()
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
            s.form = s.form?.copy(err = uiErr73(e, "Fikk ikke lagret")); Haptics.error()
        } finally { s.saving = false }
    }
}

fun AppViewModel.deleteKal27(e: Kal26Ev) {
    val s = kal26
    if (!s.delArm) { s.delArm = true; Haptics.tap(); return }
    s.delArm = false
    s.sel = null
    // Vises borte med en gang; hentes på nytt etterpå.
    s.events = s.events?.filter { it.id != e.id }
    launch26a {
        try {
            api26a { hlDelete("/kalender/events/" + kalEnc27(e.srvId27())) }
            flash("Hendelsen er slettet")
        } catch (x: ApiException) { flash("Fikk ikke slettet: " + kalErr27(x)) }
        reloadKal27()
    }
}

fun AppViewModel.copyKal27(e: Kal26Ev) {
    val s = kal26
    if (e.editable) { dupKal27(e); return }
    launch26a {
        try {
            api26a { hlPost("/kalender/events/" + kalEnc27(e.srvId27()) + "/copy") }
            s.sel = null
            flash("Kopiert til Privat")
            reloadKal27()
        } catch (x: ApiException) {
            if (x.status == 404 || x.status == 405) dupKal27(e) else flash("Fikk ikke kopiert: " + kalErr27(x))
        }
    }
}

/** Varselet på en hendelse: lokalt (som før) og i Google for egne hendelser. */
fun AppViewModel.setKalRemind27(e: Kal26Ev, v: String) {
    setKalReminder26(e, v)
    if (e.editable) launch26a {
        runCatching { api26a { request("PATCH", "/kalender/events/" + kalEnc27(e.srvId27()), JSONObject().put("reminder", v), prefix = Api.HOMELAB) } }
    }
}

/* ---------- Søk ---------- */

private var kalSearchJob27: Job? = null

/** Søket i kalenderen: serveren (±180 dager, uklart) og ellers lokalt i det som er hentet. Venter 250 ms mellom tastetrykk. */
fun AppViewModel.searchKal27(q: String) {
    val s = kal26
    s.q = q
    kalSearchJob27?.cancel()
    val t = q.trim()
    if (t.length < 2) { s.results = null; return }
    kalSearchJob27 = viewModelScope.launch {
        delay(250)
        val local = { kalLocalSearch27(s.events ?: emptyList(), t) }
        val r = try {
            val raw = api26a { hlGet("/kalender/search?q=" + URLEncoder.encode(t, "UTF-8"), timeout = 10_000) }
            val tt = raw.trim()
            val arr: JSONArray? = if (tt.startsWith("[")) JSONArray(tt) else JSONObject(tt).let { it.optJSONArray("events") ?: it.optJSONArray("results") }
            (0 until (arr?.length() ?: 0)).mapNotNull { arr!!.optJSONObject(it)?.let { o -> parseKal26(o, s.subjects) } }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { local() }
        if (s.q.trim() == t) s.results = r.filter { it.cat !in s.hiddenFilters }.sortedWith(compareBy<Kal26Ev> { it.date }.thenBy { it.sMin ?: -1 }).take(60)
    }
}

private fun kalFold27(x: String): String = java.text.Normalizer.normalize(x.lowercase(), java.text.Normalizer.Form.NFD)
    .replace(Regex("[\\u0300-\\u0309\\u030b-\\u036f]"), "")

fun kalLocalSearch27(evs: List<Kal26Ev>, q: String): List<Kal26Ev> {
    val n = kalFold27(q)
    return evs.filter { e -> kalFold27(listOfNotNull(e.title, e.room, e.teacher, e.note, e.subject).joinToString(" ")).contains(n) }
}
