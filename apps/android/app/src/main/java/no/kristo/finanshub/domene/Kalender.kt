@file:JvmName("DomeneKalender")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

/*
 * Kalender: kode som lå i blandingsfilene (P32b.kt, P36.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av KALENDER-Android.
 */

/** Svarkortet «GLIMT» i kalendersøket. */
data class KalAsk32b(val q: String, val busy: Boolean, val text: String = "", val items: List<Kal26Ev> = emptyList(), val ok: Boolean = false)

/* ---------------- Kalender: Beskriv med Glimt ---------------- */

private fun hm32b(s: String?): LocalTime? {
    if (s.isNullOrBlank()) return null
    val m = Regex("(\\d{1,2})[:.](\\d{2})").find(s) ?: Regex("T(\\d{2}):(\\d{2})").find(s) ?: return null
    return runCatching { LocalTime.of(m.groupValues[1].toInt(), m.groupValues[2].toInt()) }.getOrNull()
}

private fun repeatOf32b(t: String): String? = when {
    Regex("hver dag|daglig").containsMatchIn(t) -> "daily"
    Regex("hver uke|ukentlig|hver (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)").containsMatchIn(t) -> "weekly"
    Regex("hver måned|månedlig").containsMatchIn(t) -> "monthly"
    else -> null
}

private fun remindOf32b(t: String): String? = when {
    Regex("ingen varsel|uten varsel").containsMatchIn(t) -> "none"
    Regex("dagen før|kvelden før").containsMatchIn(t) -> "day"
    Regex("(1|en) time før|en time i forveien").containsMatchIn(t) -> "1h"
    Regex("(15|10) min").containsMatchIn(t) -> "15m"
    else -> null
}

private fun normRepeat32b(v: String?): String? = when (v?.lowercase()) {
    "daily", "dag", "daglig", "day" -> "daily"; "weekly", "uke", "ukentlig", "week" -> "weekly"; "monthly", "måned", "month" -> "monthly"; "none", "ingen" -> "none"; else -> null
}

private fun normRemind32b(v: String?): String? = when (v?.lowercase()) {
    "none", "ingen" -> "none"; "15m", "10m", "15", "10" -> "15m"; "1h", "60m", "60" -> "1h"; "day", "1d", "dagen før" -> "day"; else -> null
}

/** «Fyll ut»: serveren (POST /api/kalender/describe), ellers rask time-parseren lokalt. Fyller skjemaet; ingenting lagres. */
fun AppViewModel.kalDescribe32b() {
    val s = p32b
    val txt = s.kAi.trim()
    if (txt.isEmpty() || s.kAiBusy) return
    s.kAiBusy = true; s.kAiErr = ""; s.kAiNote = ""
    Haptics.tap()
    launch32b {
        try {
            val low = txt.lowercase()
            var title: String? = null; var date: LocalDate? = null; var st: LocalTime? = null; var en: LocalTime? = null
            var place: String? = null; var all: Boolean? = null; var rep: String? = null; var rem: String? = null; var cal: String? = null; var note: String? = null
            val o = try {
                JSONObject(api32b { request("POST", "/kalender/describe", JSONObject().put("text", txt), prefix = Api.HOMELAB, timeout = 6000, read = 40_000) })
            } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
            val ev = o?.optJSONObject("event") ?: o?.optJSONObject("result") ?: o?.optJSONObject("fields") ?: o
            if (ev != null) {
                title = ev.optStr("title") ?: ev.optStr("t")
                date = (ev.optStr("date") ?: ev.optStr("d") ?: ev.optStr("k"))?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
                st = hm32b(ev.optStr("start") ?: ev.optStr("s")); en = hm32b(ev.optStr("end") ?: ev.optStr("e"))
                place = ev.optStr("location") ?: ev.optStr("place") ?: ev.optStr("sted") ?: ev.optStr("l")
                if (ev.has("allDay") || ev.has("all")) all = ev.optBoolean("allDay", ev.optBoolean("all"))
                rep = normRepeat32b(ev.optStr("repeat") ?: ev.optStr("r"))
                rem = normRemind32b(ev.optStr("reminder") ?: ev.optStr("remind") ?: ev.optStr("varsel"))
                cal = (ev.optStr("calendar") ?: ev.optStr("cal"))?.lowercase()?.takeIf { it == "privat" || it == "familie" }
                note = ev.optStr("note")
            }
            if (date == null || title.isNullOrBlank()) {
                val r = parseQuickLocal29(txt)
                if (title.isNullOrBlank()) title = r.title.takeIf { it.isNotBlank() }
                if (date == null) date = r.date
                if (st == null) st = hm32b(r.start)
                if (en == null) en = hm32b(r.end)
                if (place.isNullOrBlank()) place = r.place.takeIf { it.isNotBlank() }
            }
            if (rep == null) rep = repeatOf32b(low)
            if (rem == null) rem = remindOf32b(low)
            if (cal == null) cal = if (Regex("familie|barna|mamma|pappa").containsMatchIn(low)) "familie" else null
            if (note == null && txt.length > 60) note = txt
            val f = kal26.form ?: return@launch32b
            val filled = ArrayList<String>()
            var nf = f
            title?.takeIf { it.isNotBlank() }?.let { nf = nf.copy(title = it.take(120)); filled += "tittel" }
            date?.let { nf = nf.copy(date = it); filled += "dato" }
            if (all == true && st == null) nf = nf.copy(allDay = true)
            st?.let { a ->
                val b = en?.takeIf { it.isAfter(a) } ?: a.plusMinutes(60).let { if (it.isBefore(a)) LocalTime.of(23, 59) else it }
                nf = nf.copy(allDay = false, start = a, end = b); filled += "tid"
            }
            place?.takeIf { it.isNotBlank() }?.let { nf = nf.copy(location = it.take(200)); filled += "sted" }
            rep?.let { nf = nf.copy(repeat = it) }
            rem?.let { nf = nf.copy(reminder = it) }
            cal?.let { nf = nf.copy(calendar = it) }
            note?.let { if (nf.note.isBlank()) nf = nf.copy(note = it.take(1000)) }
            kal26.form = nf.copy(err = "")
            if (date == null) { s.kAiErr = "Fant ikke dato. Velg dato under."; Haptics.error() }
            else Haptics.success()
            s.kAiNote = if (filled.isEmpty()) "" else "Fylte ut " + when (filled.size) { 1 -> filled[0]; else -> filled.dropLast(1).joinToString(", ") + " og " + filled.last() }
        } finally { s.kAiBusy = false }
    }
}

/* ---------------- Kalender: Spør Glimt ---------------- */

private val WD32B = listOf("mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag")

private fun kalDayName32b(d: LocalDate, today: LocalDate): String = when (ChronoUnit.DAYS.between(today, d)) {
    0L -> "I dag"; 1L -> "I morgen"; else -> kalCap(kalLong(d))
}

private fun hmOf32b(e: Kal26Ev): String = e.start?.let { kalHm(it) } ?: "hele dagen"

/** Lokale svar (raskt, uten nett): dag/periode, ledig tid, prøver og «neste X». Null = send til AI. */
fun kalLocalAnswer32b(q: String, evs: List<Kal26Ev>, today: LocalDate, hidden: Set<String>): Pair<String, List<Kal26Ev>>? {
    val n = q.trim().lowercase().removeSuffix("?").trim()
    fun day(d: LocalDate) = kalDay27(evs, d, hidden).sortedBy { it.sMin ?: -1 }
    fun target(): Pair<LocalDate, LocalDate>? {
        if (Regex("\\bi dag\\b").containsMatchIn(n)) return today to today
        if (Regex("\\bi overmorgen\\b").containsMatchIn(n)) return today.plusDays(2) to today.plusDays(2)
        if (Regex("\\bi morgen\\b").containsMatchIn(n)) return today.plusDays(1) to today.plusDays(1)
        if (Regex("neste uke").containsMatchIn(n)) { val m = today.plusDays((8 - today.dayOfWeek.value).toLong()); return m to m.plusDays(6) }
        if (Regex("resten av uka|resten av uken|denne uka|denne uken").containsMatchIn(n)) return today to today.plusDays((7 - today.dayOfWeek.value).toLong())
        WD32B.forEachIndexed { i, w ->
            if (Regex("\\b$w\\b").containsMatchIn(n)) {
                var d = today.plusDays(((i + 1 - today.dayOfWeek.value + 7) % 7).toLong())
                if (Regex("neste $w").containsMatchIn(n) && d == today) d = d.plusDays(7)
                return d to d
            }
        }
        return null
    }
    // Ledig tid
    if (Regex("\\bledig\\b|\\bfri\\b|\\btid til\\b").containsMatchIn(n)) {
        val (d, _) = target() ?: (today to today)
        val (a, b) = when { Regex("ettermiddag|kveld").containsMatchIn(n) -> 12 * 60 to 20 * 60; Regex("formiddag|morgen(en)?\\b").containsMatchIn(n) && !n.contains("i morgen") -> 8 * 60 to 12 * 60; else -> 8 * 60 to 20 * 60 }
        val busy = day(d).filter { it.sMin != null && it.eMin != null }.map { maxOf(a, it.sMin!!) to minOf(b, it.eMin!!) }.filter { it.second > it.first }.sortedBy { it.first }
        val free = ArrayList<Pair<Int, Int>>()
        var cur = a
        busy.forEach { (x, y) -> if (x - cur >= 30) free += cur to x; cur = maxOf(cur, y) }
        if (b - cur >= 30) free += cur to b
        fun f(m: Int) = "%02d:%02d".format(m / 60, m % 60)
        val dn = kalCap(kalLong(d))
        return if (free.isEmpty()) "$dn er du ikke ledig i det tidsrommet." to day(d).take(6)
        else "$dn er du ledig ${free.joinToString(", ") { f(it.first) + "–" + f(it.second) }}." to emptyList()
    }
    // Prøver og frister
    if (Regex("prøve|eksamen|frist|innlevering").containsMatchIn(n) && Regex("neste|når|hvilke|alle|kommende").containsMatchIn(n)) {
        val l = evs.filter { it.isExam && !it.date.isBefore(today) && it.cat !in hidden }.sortedWith(compareBy<Kal26Ev> { it.date }.thenBy { it.sMin ?: -1 })
        val e = l.firstOrNull() ?: return "Du har ingen kommende prøver eller frister i kalenderen." to emptyList()
        val days: Long = (e.daysLeft ?: kalDaysTo(e.date, today)).toLong() // serverens nedtelling (daysLeft)
        val rest = l.size - 1
        return "Neste er **${e.title}** ${kalLong(e.date)}${e.start?.let { " kl. " + kalHm(it) } ?: ""} (${if (days == 0L) "i dag" else if (days == 1L) "i morgen" else "om $days dager"})." +
            (if (rest > 0) " Etter den kommer $rest til." else "") to l.take(6)
    }
    // Neste X
    Regex("(?:når er|når har jeg)?\\s*neste\\s+(.+)$").find(n)?.let { m ->
        val w = m.groupValues[1].trim().removeSuffix("time").removeSuffix("timen").trim()
        if (w.length >= 3) {
            val hit = evs.filter { !it.date.isBefore(today) && it.cat !in hidden && listOfNotNull(it.title, it.subject, it.note).joinToString(" ").lowercase().contains(w) }
                .filter { it.date != today || (it.eMin ?: 1440) > java.time.LocalTime.now().let { t -> t.hour * 60 + t.minute } }
                .sortedWith(compareBy<Kal26Ev> { it.date }.thenBy { it.sMin ?: -1 })
            val e = hit.firstOrNull() ?: return null
            val days = ChronoUnit.DAYS.between(today, e.date)
            return "**${e.title}** er ${kalLong(e.date)}${e.start?.let { " kl. " + kalHm(it) } ?: ""} (${if (days == 0L) "i dag" else if (days == 1L) "i morgen" else "om $days dager"})." to hit.take(6)
        }
    }
    // Dag eller periode
    val tg = target() ?: return null
    if (!Regex("hva|har jeg|skjer|program|plan|hvordan ser").containsMatchIn(n) && n.split(Regex("\\s+")).size > 3) return null
    val (a, b) = tg
    val list = generateSequence(a) { it.plusDays(1) }.takeWhile { !it.isAfter(b) }.flatMap { d -> day(d).asSequence() }.toList()
    val label = if (a == b) kalDayName32b(a, today) else if (Regex("neste uke").containsMatchIn(n)) "Neste uke" else "Resten av uka"
    if (list.isEmpty()) return "$label har du ingenting i kalenderen." to emptyList()
    val tt = list.count { it.type == "time" }
    val first = list.first()
    val head = "$label har du ${list.size} ${if (list.size == 1) "ting" else "ting"}" + (if (tt > 0 && tt < list.size) ", $tt av dem i timeplanen" else if (tt == list.size && tt > 1) ", alle i timeplanen" else "") + "."
    val firstTxt = " Først ut: **${kalShort(first)}**" + (first.start?.let { " kl. " + kalHm(it) } ?: "") + (if (a != b) " ${kalLong(first.date)}" else "") + "."
    return head + firstTxt to list.take(6)
}

/** Enter eller ✦ Spør: lokalt først, ellers AI med kalenderen (GET /api/kalender/search?q=&ai=1). */
fun AppViewModel.askKal32b(q0: String) {
    val q = q0.trim()
    if (q.isEmpty()) return
    val s = p32b
    val seq = ++s.kAskSeq
    val today = LocalDate.now()
    Haptics.tap()
    kalLocalAnswer32b(q, kal26.events ?: emptyList(), today, kal26.hiddenFilters)?.let { (txt, items) ->
        s.kAsk = KalAsk32b(q, false, txt, items, true)
        return
    }
    s.kAsk = KalAsk32b(q, true)
    launch32b {
        val r = try {
            val raw = api32b { request("GET", "/kalender/search?ai=1&q=" + URLEncoder.encode(q, "UTF-8"), prefix = Api.HOMELAB, timeout = 6000, read = 40_000) }
            val o = JSONObject(raw)
            val txt = o.optStr("answer") ?: o.optStr("text") ?: o.optJSONObject("ai")?.optStr("text")
            val arr = o.optJSONArray("events") ?: o.optJSONArray("results") ?: o.optJSONObject("ai")?.optJSONArray("events")
            val items = (0 until (arr?.length() ?: 0)).mapNotNull { arr!!.optJSONObject(it)?.let { e -> parseKal26(e, kal26.subjects) } }.take(6)
            KalAsk32b(q, false, txt ?: if (items.isEmpty()) "Fant ingenting i kalenderen som passer." else "Dette fant jeg:", items, txt != null || items.isNotEmpty())
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            KalAsk32b(q, false, if (e.status == 404) "Glimt kan ikke søke i kalenderen på denne serveren ennå. Oppdater Nordlys OS." else "Glimt svarte ikke: ${e.message}", emptyList(), false)
        } catch (e: Exception) { KalAsk32b(q, false, "Glimt svarte ikke nå. Prøv igjen.", emptyList(), false) }
        if (s.kAskSeq == seq) s.kAsk = r
        if (inBackground29 && r.ok) runCatching { Notify31.post(appCtx29, "Glimt", plain31(r.text), "kal-ask-$seq", "finanshub://kalender") }
    }
}

/* ======================= Innstillinger → Kalendere → Google: Hovedkalender og «Vis også i Kalender» ======================= */

/** Én Google-kalender fra GET /api/kalender/calendars/google. id = 'primary' eller googleId. */
data class GCal36(val id: String, val googleId: String, val name: String, val primary: Boolean, val color: Long?, val writable: Boolean,
    val access: String, val main: Boolean, val shown: Boolean)

data class GCals36(val connected: Boolean, val configured: Boolean, val email: String?, val mainId: String?, val mainName: String?, val cals: List<GCal36>)

class GCal36State {
    var data by mutableStateOf<GCals36?>(null)
    var busy by mutableStateOf<String?>(null)
    var missing by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
}

private fun color36(v: String?): Long? {
    val h = v?.trim()?.removePrefix("#") ?: return null
    return when (h.length) { 6 -> h.toLongOrNull(16)?.let { 0xFF000000L or it }; 8 -> h.toLongOrNull(16); else -> null }
}

fun parseGCals36(raw: String): GCals36 {
    val o = JSONObject(raw)
    val m = o.optJSONObject("main")
    val cals = objs34(o.optJSONArray("calendars")).mapNotNull { c ->
        val gid = c.s36("googleId") ?: c.s36("id") ?: return@mapNotNull null
        val primary = c.optBoolean("primary", false) || c.s36("id") == "primary"
        GCal36(c.s36("id") ?: gid, gid, c.s36("name") ?: c.s36("summary") ?: gid, primary, color36(c.s36("color")),
            c.optBoolean("writable", primary), c.s36("access") ?: "", c.optBoolean("main", false), c.optBoolean("shown", false))
    }
    return GCals36(o.optBoolean("connected", false), o.optBoolean("configured", true), o.s36("email"), m?.s36("id"), m?.s36("name"), cals)
}

/** Verdien PUT tar for en kalender: 'primary' for primærkalenderen, ellers googleId. */
fun GCal36.key(): String = if (primary) "primary" else googleId

fun AppViewModel.loadGCals36() {
    val s = gcal36
    launch36 {
        try { s.data = parseGCals36(api36 { hlGet("/kalender/calendars/google", timeout = 12_000) }); s.missing = false; s.err = null }
        catch (e: ApiException) { if (e.status == 404 || e.status == 405) s.missing = true else s.err = e.message }
        catch (e: CancellationException) { throw e } catch (_: Exception) {}
    }
}

private fun AppViewModel.putGCals36(body: JSONObject, tag: String, rollback: GCals36?) {
    val s = gcal36
    s.busy = tag
    launch36 {
        try {
            s.data = parseGCals36(api36 { hlPut("/kalender/calendars/google", body) })
            s.err = null
            Haptics.success()
            runCatching { reloadKal27() }
        } catch (e: ApiException) {
            s.data = rollback
            s.err = if (e.status == 400) (e.message ?: "Kalenderen kan ikke brukes som hovedkalender (bare lesing).") else "Fikk ikke lagret: ${e.message}"
            Haptics.error()
        } finally { s.busy = null }
    }
}

/** Hovedkalender: nye hendelser lagres her (bare skrivbare). */
fun AppViewModel.setGMain36(c: GCal36) {
    val d = gcal36.data ?: return
    if (!c.writable || c.main) return
    Haptics.select()
    gcal36.data = d.copy(mainId = c.id, mainName = c.name, cals = d.cals.map { it.copy(main = it.googleId == c.googleId) })
    putGCals36(JSONObject().put("main", c.key()), "main", d)
}

/** «Vis også i Kalender»: de andre kalenderne av/på. */
fun AppViewModel.toggleGShow36(c: GCal36) {
    val d = gcal36.data ?: return
    Haptics.select()
    val nd = d.copy(cals = d.cals.map { if (it.googleId == c.googleId) it.copy(shown = !it.shown) else it })
    gcal36.data = nd
    val show = org.json.JSONArray()
    nd.cals.filter { it.shown && !it.main }.forEach { show.put(it.googleId) }
    putGCals36(JSONObject().put("show", show), "show:" + c.googleId, d)
}
