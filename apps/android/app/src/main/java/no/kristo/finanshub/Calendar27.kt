package no.kristo.finanshub

import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/*
 * Prompt 27 (ANDROID-A): Kalender v2 (design/Kalender.dc.html, variant «mobile», claude-code-kalender-v2.md).
 * Fullskjerm uten toppbilde og uten appens fanelinje: Dag · 3 dager · Uke · Måned · Liste, NESTE/NÅ-stripe, minikalender med
 * kalenderfilter, søk (GET /api/kalender/search), ny/rediger/slett (POST/PATCH/DELETE /api/kalender/events, Google Privat/Familie)
 * og «Kopier til Privat» (POST /api/kalender/events/:id/copy). Tilstanden ligger i Kal26State (Calendar26.kt), grensesnittet i ui/Calendar27Ui.kt.
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
)

fun parseKalCals27(raw: String): List<Kal27Cal> {
    val t = raw.trim()
    if (!t.startsWith("{")) return emptyList()
    val a = JSONObject(t).optJSONArray("calendars") ?: return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        val id = o.optStr("id") ?: return@mapNotNull null
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
            reloadKal27()
        } catch (e: ApiException) {
            s.form = s.form?.copy(err = kalErr27(e)); Haptics.error()
        } catch (e: Exception) {
            s.form = s.form?.copy(err = e.message ?: "Fikk ikke lagret"); Haptics.error()
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
