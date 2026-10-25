package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/*
 * Prompt 29 (ANDROID29): rask time med AI (claude-code-kalender-rask-time.md), nytt Nå/Neste-kort i Kalender
 * (claude-code-kalender-na-kort.md) og søkemotor på Hjem (claude-code-hjem-sok-ai.md). Grensesnittet ligger i
 * ui/Calendar29Ui.kt og ui/Home29Ui.kt.
 *
 * API (SERVER29): POST /api/kalender/quick/parse {text} → parseQuick (live forhåndsvisning), POST /api/kalender/quick {text}
 * → 202 {jobId}, GET /api/kalender/quick/jobs, POST /api/kalender/quick/:id/undo. Mangler endepunktene (404/405), tolkes
 * teksten lokalt (samme regler som QP() i Kalender.dc.html) og hendelsen lages med POST /api/kalender/events i Privat.
 */

/** Resultatet av tolkningen (fra serveren eller lokalt). */
data class Quick29Parse(
    val ok: Boolean, val why: String, val title: String, val date: LocalDate?, val start: String?, val end: String?,
    val place: String, val type: String, val isAppointment: Boolean,
)

/** En jobb i køen på serveren (eller en lokal når serveren mangler køen). */
data class Quick29Job(
    val id: String, val state: String, val text: String, val eventId: String? = null, val title: String = "",
    val date: LocalDate? = null, val start: String? = null, val label: String = "", val error: String = "",
    val found: Quick29Parse? = null, val local: Boolean = false,
)

class Quick29State {
    /** Arket «Legg til time». */
    var open by mutableStateOf(false)
    var text by mutableStateOf("")
    var preview by mutableStateOf<Quick29Parse?>(null)
    /** Jobber som venter eller kjører (pillen «✦ Legger til i kalenderen …»). */
    var jobs by mutableStateOf<List<Quick29Job>>(emptyList())
    /** Banneret «✓ Nina frisør · fre 25. sep · 14:30» med Angre og Vis. */
    var toast by mutableStateOf<Quick29Job?>(null)
    internal var toastSeq by mutableStateOf(0)

    /** Søkemotor på Hjem: ai | google | ddg (search_engine i /api/me/layout). */
    var engine by mutableStateOf("ai")
    var engineMenu by mutableStateOf(false)
    var homeQ by mutableStateOf("")
    /** Timen som ble funnet i søkefeltet på Hjem (mørkt forslag under feltet). */
    var homeAppt by mutableStateOf<Quick29Parse?>(null)

    internal var parseMissing = false
    internal var queueMissing = false
    internal var poll: Job? = null
    internal var parseJob: Job? = null
    internal var homeJob: Job? = null
    internal var engineFor: String? = null
}

/* ---------- Datoer og tekster ---------- */

private val WD29 = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")

/** «fre 25. sep · 14:30» (uten tid: «fre 25. sep»). */
fun quickLabel29(d: LocalDate?, start: String?): String =
    if (d == null) "" else "${WD29[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${BD_MS[d.monthValue - 1]}" + (start?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")

/** «Fredag 25. september · 14:30–15:15» eller «· hele dagen» (forhåndsvisningen i arket). */
fun quickPreviewDate29(r: Quick29Parse): String {
    val d = r.date ?: return ""
    val t = if (!r.start.isNullOrBlank()) " · ${r.start}" + (r.end?.takeIf { it.isNotBlank() }?.let { "–$it" } ?: "") else " · hele dagen"
    return kalCap(kalLong(d)) + t
}

private fun hm29(min: Int): String = "%02d:%02d".format((min / 60) % 24, min % 60)
private fun mm29(s: String): Int = s.split(":").let { (it[0].toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }

/* ---------- Lokal tolkning (reserve, samme regler som QP() i fasiten) ---------- */

private class QKind29(val re: Regex, val dur: Int, val name: String, val type: String)

private val QK29 = listOf(
    QKind29(Regex("fris(ø|o)r|klipp|hårsalong|barber"), 45, "Frisør", "frisør"),
    QKind29(Regex("tannlege|tannpleier|tannklinikk"), 60, "Tannlege", "tannlege"),
    QKind29(Regex("fastlege|legetime|legekontor|legesenter|legevakt|\\blege\\b"), 30, "Lege", "lege"),
    QKind29(Regex("fysio|kiropraktor|naprapat|osteopat"), 45, "Fysioterapi", "fysio"),
    QKind29(Regex("psykolog"), 50, "Psykolog", "psykolog"),
    QKind29(Regex("optiker"), 30, "Optiker", "optiker"),
    QKind29(Regex("vaksin"), 15, "Vaksine", "annet"),
    QKind29(Regex("massasje"), 60, "Massasje", "annet"),
    QKind29(Regex("hudpleie|negl"), 60, "Hudpleie", "annet"),
)
private val QMN29 = mapOf("jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "mai" to 5, "jun" to 6, "jul" to 7, "aug" to 8, "sep" to 9, "okt" to 10, "nov" to 11, "des" to 12)
/** Søndag først, som Date.getDay() i JavaScript. */
private val QWD29 = listOf("søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag")
private val INTENT29 = Regex("\\b(time|timen|avtale|legg til|book|bestill)\\b", RegexOption.IGNORE_CASE)
const val QUICK29_NO_DATE = "Fant ikke dato. Skriv f.eks. «25.09» eller «tirsdag»."

private fun pad29(n: Int) = "%02d".format(n)

private fun safeDate29(y: Int, m: Int, d: Int): LocalDate? = runCatching { LocalDate.of(y, m, d) }.getOrNull()

fun parseQuickLocal29(txt: String, today: LocalDate = LocalDate.now()): Quick29Parse {
    val raw = txt.replace(Regex("\\s+"), " ").trim()
    val t = raw.lowercase()
    if (raw.isEmpty()) return Quick29Parse(false, "Skriv hva timen gjelder.", "", null, null, null, "", "annet", false)
    var dm: Pair<Int, Int>? = null
    var s: String? = null
    var e: String? = null
    var yr: Int? = null
    val used = ArrayList<String>()
    Regex("(?:kl\\.?\\s*)?(\\d{1,2})[:.](\\d{2})\\s*[-–]\\s*(\\d{1,2})[:.](\\d{2})").find(t)?.let { m ->
        s = pad29(m.groupValues[1].toInt()) + ":" + m.groupValues[2]; e = pad29(m.groupValues[3].toInt()) + ":" + m.groupValues[4]; used.add(m.value)
    }
    Regex("(\\d{1,2})\\.?\\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*\\.?(?:\\s+(\\d{4}))?").find(t)?.let { m ->
        dm = m.groupValues[1].toInt() to (QMN29[m.groupValues[2]] ?: 1)
        m.groupValues[3].takeIf { it.isNotEmpty() }?.let { yr = it.toInt() }
        used.add(m.value)
    }
    // Prompt 44 (claude-code-glimt-time-dato-tid-tittel.md): «1630», «0930», «kl1600» (4 siffer, 00:00–23:59) og «16h» / «16t».
    if (s == null) Regex("(?<![\\p{L}\\d.:/])(?:kl\\.?\\s*|klokka\\s*)?([01]\\d|2[0-3])([0-5]\\d)(?![\\d.:/])").findAll(t)
        .firstOrNull { m -> used.none { u -> u.contains(m.value.trim()) } }?.let { m -> s = m.groupValues[1] + ":" + m.groupValues[2]; used.add(m.value) }
    if (s == null) Regex("(?<![\\p{L}\\d.:/])(\\d{1,2})\\s?[ht](?![\\p{L}\\d])").find(t)?.let { m ->
        val h = m.groupValues[1].toInt(); if (h <= 23) { s = pad29(h) + ":00"; used.add(m.value) }
    }
    val tok = Regex("(kl\\.?\\s*|klokka\\s*)?\\b(\\d{1,2})([.:/])(\\d{1,2})(?:[./](\\d{2,4}))?\\b").findAll(t)
        .filter { m -> used.none { u -> u.contains(m.value.trim()) } }.toList()
    val amb = ArrayList<Pair<Int, Int>>()
    for (m in tok) {
        val a = m.groupValues[2].toInt()
        val b = m.groupValues[4].toInt()
        val kl = m.groupValues[1].isNotEmpty()
        val col = m.groupValues[3] == ":"
        val y = m.groupValues[5]
        if (y.isNotEmpty() && dm == null) { dm = a to b; yr = y.toInt().let { if (it < 100) 2000 + it else it }; used.add(m.value); continue }
        val canT = a <= 23 && b <= 59 && m.groupValues[4].length == 2
        val canD = a in 1..31 && b in 1..12
        if ((kl || col) && canT && s == null) { s = pad29(a) + ":" + pad29(b); used.add(m.value); continue }
        if (canT && !canD && s == null) { s = pad29(a) + ":" + pad29(b); used.add(m.value); continue }
        if (canD && !canT && dm == null) { dm = a to b; used.add(m.value); continue }
        if (canT || canD) { amb.add(a to b); used.add(m.value) }
    }
    if (s == null) Regex("(?:kl\\.?|klokka)\\s*(\\d{1,2})(?![.:\\d])").find(t)?.let { m -> val h = m.groupValues[1].toInt(); if (h <= 23) { s = pad29(h) + ":00"; used.add(m.value) } }
    for ((a, b) in amb) {
        if (s == null && dm != null) s = pad29(a) + ":" + pad29(b)
        else if (dm == null && s != null) dm = a to b
        else if (s == null && dm == null) s = pad29(a) + ":" + pad29(b)
    }
    // Prompt 44: bare «16» (frittstående tall 6–23) er klokkeslett når det ikke finnes annen tid («frisør 16» → 16:00).
    if (s == null) {
        var masked = t
        used.forEach { u -> masked = masked.replaceFirst(u, " ".repeat(u.length)) }
        Regex("(?<![\\p{L}\\d.:/,])(\\d{1,2})(?![\\d.:/]|\\s*(?:min|timer|time|t\\b|dager|dag|uker|uke|stk|kr|%|personer|pers))").find(masked)?.let { m ->
            val h = m.groupValues[1].toInt(); if (h in 6..23) { s = pad29(h) + ":00"; used.add(m.value) }
        }
    }
    var dt: LocalDate? = null
    val dmv = dm
    if (dmv != null) {
        val y0 = yr
        val first = safeDate29(y0 ?: today.year, dmv.second, dmv.first)
        dt = if (y0 == null && first != null && first.isBefore(today)) safeDate29(today.year + 1, dmv.second, dmv.first) else first
    } else {
        when {
            t.contains("i overmorgen") -> dt = today.plusDays(2)
            t.contains("i morgen") -> dt = today.plusDays(1)
            Regex("i dag|i kveld").containsMatchIn(t) -> dt = today
            else -> {
                val wi = QWD29.indexOfFirst { w -> Regex("(?<![a-zæøå])$w(?![a-zæøå])").containsMatchIn(t) }
                if (wi >= 0) {
                    var n = (wi - (today.dayOfWeek.value % 7) + 7) % 7
                    if (n == 0) n = 7
                    if (Regex("neste\\s+uke").containsMatchIn(t)) n += 7
                    dt = today.plusDays(n.toLong())
                }
            }
        }
    }
    val kind = QK29.firstOrNull { it.re.containsMatchIn(t) }
    val dur = kind?.dur ?: 60
    var ti: String
    val hos = Regex(
        "(?:time|avtale|konsultasjon|timebestilling)?\\s*hos\\s+(.+?)(?=\\s+(?:(?:kl\\.?|klokka|den|på|i\\s+(?:dag|morgen|overmorgen|kveld)|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|neste)\\b|\\d)|[,\\n]|(?<!\\b(?:[Dd]r|[Ss]t|[Nn]r|ca|[Tt]annl))\\.|$)",
        RegexOption.IGNORE_CASE,
    ).find(raw)
    ti = when {
        hos != null -> hos.groupValues[1].trim()
        kind != null -> kind.name
        // Prompt 44: tittel = alt som er igjen når dato, tid, ukedager, «i morgen» og innledningsord er fjernet, uansett hvor tittelen står.
        else -> rest29(raw, used)
    }
    ti = ti.replace(Regex("^(legg til\\s+)?(time|avtale)\\s+", RegexOption.IGNORE_CASE), "").trim()
    if (ti.isEmpty()) ti = kind?.name ?: "Avtale"
    ti = kalCap(if (ti.length > 48) ti.take(46) + "…" else ti)
    if (kind != null && !ti.contains(kind.name, ignoreCase = true) && !Regex("frisør|lege|tannlege", RegexOption.IGNORE_CASE).containsMatchIn(ti)) ti = kind.name + " · " + ti
    val loc = (Regex("(?:adresse|sted|oppmøte|møtested)\\s*:\\s*([^\\n.;]+)", RegexOption.IGNORE_CASE).find(raw)
        ?: Regex("\\bpå\\s+([A-ZÆØÅ][^,\\n.;]{2,40})").find(raw))?.groupValues?.get(1)?.trim().orEmpty()
    if (s != null && e == null) e = hm29(mm29(s!!) + dur)
    val type = kind?.type ?: "annet"
    // Prompt 44 (claude-code-kalender-glimt-klokkeslett.md): bare tid → i dag (i morgen hvis tiden er passert).
    if (dt == null && s != null) dt = if (today == LocalDate.now() && mm29(s!!) <= java.time.LocalTime.now().let { it.hour * 60 + it.minute }) today.plusDays(1) else today
    if (dt == null) return Quick29Parse(false, QUICK29_NO_DATE, ti, null, s, e, loc, type, false)
    val appt = INTENT29.containsMatchIn(t) || kind != null
    return Quick29Parse(true, if (s == null) "Fant ikke klokkeslett, lagt inn som hele dagen." else "", ti, dt, s, if (s != null) e else null, loc, type, appt)
}

/** Prompt 44: teksten uten dato/tid-tokenene ([used]), ukedager, «i dag/i morgen», varighet/varsel og innledningsord. */
internal fun rest29(raw: String, used: List<String>): String {
    var r = " " + raw.replace(Regex("\\s+"), " ") + " "
    val ic = RegexOption.IGNORE_CASE
    used.sortedByDescending { it.length }.forEach { u -> if (u.isNotBlank()) r = r.replaceFirst(Regex(Regex.escape(u.trim()), ic), " ") }
    listOf(
        "varsle?\\s+.*?\\s+før", "\\bi\\s+\\d+\\s*(?:timer|time|t|min|minutter)\\b", "\\b\\d+\\s*min\\s+før\\b",
        "(?<![\\p{L}])(?:på\\s+|neste\\s+|kommende\\s+)?(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:\\s+neste\\s+uke)?(?![\\p{L}])",
        "\\bi\\s+(?:overmorgen|morgen|dag|kveld)\\b", "\\bneste\\s+uke\\b", "\\b(?:kl\\.?|klokka)(?![\\p{L}])", "\\bden\\b",
        "^\\s*(?:legg\\s+til|lag|sett\\s+opp|book|bestill|ny)\\s+", "\\b(?:timen|time|avtale)\\b", "\\s[-–]\\s",
    ).forEach { r = r.replace(Regex(it, ic), " ") }
    r = r.replace(Regex("\\s+"), " ").trim().trim('.', ',', ';', ':', '–', '-', ' ').trim()
    return r
}

private fun JSONObject.str29(k: String): String? = if (isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

/** Svaret fra /quick/parse: parseQuick-objektet direkte eller pakket i {result}. */
internal fun parseQuickJson29(o0: JSONObject): Quick29Parse {
    val o = o0.optJSONObject("result") ?: o0
    val d = o.str29("date")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
    return Quick29Parse(
        o.optBoolean("ok", d != null), o.str29("why") ?: "", o.str29("title") ?: "", d, o.str29("start"), o.str29("end"),
        o.str29("place") ?: "", o.str29("type") ?: "annet", o.optBoolean("isAppointment", false),
    )
}

/** Tolker teksten: serveren først, lokalt hvis endepunktet mangler eller serveren ikke svarer. */
private suspend fun AppViewModel.parseQuick29(text: String): Quick29Parse {
    val q = q29
    if (!q.parseMissing) {
        try {
            val raw = api29 { request("POST", "/kalender/quick/parse", JSONObject().put("text", text), prefix = Api.HOMELAB, timeout = 4000, read = 6000) }
            return parseQuickJson29(JSONObject(raw))
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) q.parseMissing = true
        } catch (e: Exception) { /* Nettverksfeil: tolk lokalt denne gangen. */ }
    }
    return parseQuickLocal29(text)
}

/* ---------- Arket «Legg til time» ---------- */

fun AppViewModel.openQuick29(text: String = "") {
    val q = q29
    q.open = true
    q.text = text
    q.preview = null
    Haptics.select()
    if (text.isNotBlank()) setQuickText29(text)
}

fun AppViewModel.closeQuick29() { q29.open = false; q29.parseJob?.cancel() }

/** Del → appen (ACTION_SEND text/plain): åpner Kalender og arket med teksten ferdig innlimt. */
fun AppViewModel.shareText29(text: String) {
    val t = text.trim()
    if (t.isEmpty()) return
    if (!kal26.open) openKal26(native = false)
    openQuick29(t)
}

/** Skriving i arket: live forhåndsvisning med 200 ms pause. */
fun AppViewModel.setQuickText29(v: String) {
    val q = q29
    q.text = v
    q.parseJob?.cancel()
    val t = v.trim()
    if (t.length <= 3) { q.preview = null; return }
    q.parseJob = viewModelScope.launch {
        delay(200)
        val r = parseQuick29(t)
        if (q.text.trim() == t) q.preview = r
    }
}

/** «Fyll ut selv»: vanlig skjema i Kalender. */
fun AppViewModel.quickManual29() {
    val txt = q29.text.trim()
    closeQuick29()
    if (!kal26.open) openKal26(native = false)
    openKalForm27()
    if (txt.length > 60) kal26.form = kal26.form?.copy(note = txt)
}

/** «Legg til i kalenderen»: arket lukkes med en gang, og jobben går i bakgrunnen. */
fun AppViewModel.submitQuick29(text: String = q29.text) {
    val t = text.trim()
    if (t.isEmpty()) return
    val q = q29
    q.open = false
    q.parseJob?.cancel()
    Haptics.success()
    val tmp = "tmp" + System.currentTimeMillis()
    q.jobs = q.jobs + Quick29Job(tmp, "queued", t, local = true)
    launch29 {
        var jobId: String? = null
        if (!q.queueMissing) {
            try {
                val raw = api29 { hlPost("/kalender/quick", JSONObject().put("text", t)) }
                val o = runCatching { JSONObject(raw) }.getOrNull()
                jobId = o?.str29("jobId") ?: o?.str29("id") ?: o?.optJSONObject("job")?.str29("id")
            } catch (e: ApiException) {
                if (e.status == 404 || e.status == 405) q.queueMissing = true
                else { q.jobs = q.jobs.filter { it.id != tmp }; quickFailed29(t, parseQuick29(t), e.message ?: "Fikk ikke lagt til timen."); return@launch29 }
            } catch (e: Exception) {
                q.jobs = q.jobs.filter { it.id != tmp }; quickFailed29(t, parseQuickLocal29(t), e.message ?: "Fikk ikke kontakt med serveren."); return@launch29
            }
        }
        if (jobId != null) {
            q.jobs = q.jobs.map { if (it.id == tmp) it.copy(id = jobId, local = false) else it }
            pollQuick29()
        } else if (!q.queueMissing) {
            // Godtatt uten jobb-id: serveren sier fra med sanntid/push når timen er lagt inn.
            q.jobs = q.jobs.filter { it.id != tmp }
            flash("Timen legges til i bakgrunnen")
        } else {
            // Serveren mangler køen: tolk og lagre direkte i Privat (varsel 1 time før).
            val r = parseQuick29(t)
            q.jobs = q.jobs.filter { it.id != tmp }
            if (!r.ok || r.date == null) { quickFailed29(t, r, r.why.ifBlank { QUICK29_NO_DATE }); return@launch29 }
            createDirect29(t, r)
        }
    }
}

internal suspend fun AppViewModel.createDirect29(text: String, r: Quick29Parse) {
    val d = r.date ?: return
    val allDay = r.start.isNullOrBlank()
    val st = r.start ?: "09:00"
    val en = r.end ?: hm29(mm29(st) + 60)
    val body = JSONObject().put("title", r.title.ifBlank { "Avtale" }).put("allDay", allDay).put("date", d.toString())
        .put("start", st).put("end", en).put("location", r.place).put("calendar", "privat").put("repeat", "none")
        .put("reminder", if (allDay) "none" else "1h").put("note", if (text.length > 60) text else "").put("source", "AI · rask time")
    try {
        val raw = api29 { hlPost("/kalender/events", body) }
        val id = runCatching { JSONObject(raw).let { o -> o.optJSONObject("event")?.str29("id") ?: o.str29("id") } }.getOrNull()
        if (id != null) kal26.reminders = kal26.reminders + (id to (if (allDay) "none" else "1h"))
        quickDone29(Quick29Job(id ?: "local", "done", text, id, r.title, d, r.start, quickLabel29(d, r.start), local = true))
    } catch (e: ApiException) {
        quickFailed29(text, r, if (e.status == 404) "Serveren kan ikke lagre hendelser ennå. Oppdater Homelab-serveren." else e.message ?: "Fikk ikke lagret")
    }
}

/* ---------- Jobbene: poll hvert 2. sekund mens noe kjører (i tillegg til sanntid og push) ---------- */

private fun jobOf29(o: JSONObject): Quick29Job {
    val res = o.optJSONObject("result")
    val d = res?.str29("date")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
    val st = res?.str29("start")
    val found = o.optJSONObject("found")?.let { parseQuickJson29(it) }
    return Quick29Job(
        o.str29("id") ?: o.str29("jobId") ?: "", o.str29("state") ?: "queued", o.str29("text") ?: "", res?.str29("eventId"),
        res?.str29("title") ?: "", d, st, res?.str29("label") ?: quickLabel29(d, st), o.str29("error") ?: "", found,
    )
}

fun AppViewModel.pollQuick29() {
    val q = q29
    if (q.poll?.isActive == true) return
    q.poll = viewModelScope.launch {
        var n = 0
        while (q.jobs.any { !it.local } && n < 150) {
            delay(2000)
            n++
            checkQuick29()
        }
        // Gir opp etter fem minutter: jobbene vises ikke lenger som pågående.
        if (n >= 150) q.jobs = q.jobs.filter { it.local }
    }
}

private suspend fun AppViewModel.checkQuick29() {
    val q = q29
    val raw = runCatching { api29 { hlGet("/kalender/quick/jobs", timeout = 5000) } }.getOrNull() ?: return
    val t = raw.trim()
    val arr = runCatching { if (t.startsWith("[")) org.json.JSONArray(t) else JSONObject(t).optJSONArray("jobs") }.getOrNull() ?: return
    val all = (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.let(::jobOf29) }.associateBy { it.id }
    val mine = q.jobs.filter { !it.local }
    for (j in mine) {
        val cur = all[j.id] ?: continue
        when (cur.state) {
            "done" -> { q.jobs = q.jobs.filter { it.id != j.id }; quickDone29(cur.copy(text = cur.text.ifBlank { j.text })) }
            "failed" -> { q.jobs = q.jobs.filter { it.id != j.id }; quickFailed29(cur.text.ifBlank { j.text }, cur.found, cur.error.ifBlank { "Fikk ikke tolket teksten." }) }
            else -> q.jobs = q.jobs.map { if (it.id == j.id) it.copy(state = cur.state) else it }
        }
    }
}

/** Sanntid fra /api/ws (type «calendar-quick»): sjekk jobbene med en gang. */
fun AppViewModel.onQuickEvent29(@Suppress("UNUSED_PARAMETER") msg: JSONObject) {
    if (q29.jobs.any { !it.local }) launch29 { checkQuick29() }
}

private fun AppViewModel.quickDone29(j: Quick29Job) {
    val q = q29
    q.toast = j
    q.toastSeq++
    Haptics.success()
    val txt = "✓ " + j.title + (if (j.label.isNotBlank()) " · " + j.label else "")
    if (inBackground29) Notify.post(appCtx29, "Lagt i kalenderen", txt.removePrefix("✓ "), "kal29-" + j.id, group = "kalender")
    reloadKal27()
}

/** Tolkningen feilet: skjemaet åpnes ferdig utfylt med det som ble funnet, feilmeldingen og originalteksten i notat. */
private fun AppViewModel.quickFailed29(text: String, found: Quick29Parse?, err: String) {
    Haptics.error()
    if (inBackground29) Notify.post(appCtx29, "Fikk ikke lagt til timen", err, "kal29-f" + text.hashCode(), group = "kalender")
    if (!kal26.open) openKal26(native = false)
    openKalForm27(found?.date)
    val f = kal26.form ?: return
    val st = found?.start?.let { runCatching { LocalTime.parse(it) }.getOrNull() }
    val en = found?.end?.let { runCatching { LocalTime.parse(it) }.getOrNull() }
    kal26.form = f.copy(
        title = found?.title.orEmpty(), start = st ?: f.start, end = en ?: st?.plusMinutes(60) ?: f.end, location = found?.place.orEmpty(),
        calendar = "privat", reminder = "1h", note = text, err = err.trimEnd('.') + ". Velg dato og lagre.",
    )
}

/** Angre: sletter hendelsen jobben laget. */
fun AppViewModel.undoQuick29() {
    val q = q29
    val j = q.toast ?: return
    q.toast = null
    launch29 {
        try {
            if (j.local) j.eventId?.let { api29 { hlDelete("/kalender/events/" + URLEncoder.encode(it, "UTF-8")) } }
            else try {
                api29 { hlPost("/kalender/quick/" + URLEncoder.encode(j.id, "UTF-8") + "/undo") }
            } catch (e: ApiException) {
                if ((e.status == 404 || e.status == 405) && j.eventId != null) api29 { hlDelete("/kalender/events/" + URLEncoder.encode(j.eventId, "UTF-8")) } else throw e
            }
            flash("Timen er fjernet")
        } catch (e: ApiException) { flash("Fikk ikke angret: " + (e.message ?: "")) }
        if (kal26.open) reloadKal27()
    }
}

/** Vis: hopper til dagen i Kalender. */
fun AppViewModel.showQuick29() {
    val j = q29.toast ?: return
    q29.toast = null
    if (!kal26.open) openKal26(native = false)
    kal26.cur = j.date
}

/* ---------- Søkemotor på Hjem ---------- */

private fun AppViewModel.engineKey29() = "search_engine29_" + (account?.id ?: "")

private fun normEngine29(v: String?): String? = when (v?.lowercase()) { "ai", "system", "system-ai" -> "ai"; "google" -> "google"; "ddg", "duckduckgo" -> "ddg"; else -> null }

fun AppViewModel.loadSearchEngine29() {
    q29.engine = normEngine29(prefs.str(engineKey29(), "")) ?: "ai"
}

/** Fra GET /api/me/layout (search_engine). */
fun AppViewModel.applySearchEngine29(raw: String) {
    val o0 = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val o = o0.optJSONObject("layout") ?: o0
    val v = normEngine29(o.str29("search_engine") ?: o.str29("searchEngine")) ?: return
    q29.engine = v
    prefs.set(engineKey29(), v)
}

fun AppViewModel.setSearchEngine29(v: String) {
    val e = normEngine29(v) ?: return
    q29.engine = e
    q29.engineMenu = false
    prefs.set(engineKey29(), e)
    Haptics.select()
    launch29 { runCatching { api29 { hlPut("/me/layout", JSONObject().put("search_engine", e)) } } }
}

/** Skriving i søkefeltet: timer gjenkjennes uansett søkemotor (200 ms pause). */
fun AppViewModel.setHomeQuery29(v: String) {
    val q = q29
    q.homeQ = v
    q.homeJob?.cancel()
    val t = v.trim()
    if (q.engine != "ai") suggest(v) else suggest("")
    if (t.isNotEmpty() && p31.ans?.busy == false) closeAns31()
    if (t.length <= 4) { q.homeAppt = null; return }
    // Prompt 36: spørsmålsvakt før avtaletolkning («hvor mange timer med dagslys er det den 29.06.2027» er et spørsmål).
    if (isQuestion36(t) || isSunQ36(t)) { q.homeAppt = null; return }
    // Lokalt først (rask), serveren etterpå.
    val loc = parseQuickLocal29(t)
    q.homeAppt = loc.takeIf { it.ok && it.isAppointment }
    q.homeJob = viewModelScope.launch {
        delay(200)
        val r = parseQuick29(t)
        // Prompt 52: et ferdig AI-svar (quickparse52) for samme tekst vinner over regelparseren.
        if (q.homeQ.trim() == t && !isQuestion36(t) && p52b.qpRes?.takeIf { p52b.qpText == t } == null) q.homeAppt = r.takeIf { it.ok && it.isAppointment && it.date != null }
    }
    homeAi52(t) // prompt 52 (AND52B): AI tolker beskjeden med kontekst (P52B.kt)
}

/** ↵ / «Gå» eller «Legg i kalender». Returnerer adressen som skal åpnes i nettleseren (Google/DuckDuckGo), ellers null. */
fun AppViewModel.goHome29(): String? {
    val q = q29
    val t = q.homeQ.trim()
    if (t.isEmpty()) return null
    q.homeJob?.cancel()
    val appt = q.homeAppt?.takeIf { !isQuestion36(t) && !isSunQ36(t) }
    q.homeQ = ""; q.homeAppt = null
    suggest("")
    // Prompt 52: AI-tolket time (tittel, sted, dato) lagres med de feltene, ellers køen som før.
    if (appt != null) { logSearch32b(t, "time"); if (qpAppt52(t)) launch29 { createDirect29(t, appt) } else submitQuick29(t); return null }
    return when (q.engine) {
        "google" -> googleUrl(t)
        "ddg" -> { logSearch32b(t, "ddg"); "https://duckduckgo.com/?q=" + URLEncoder.encode(t, "UTF-8") }
        // Prompt 31: Glimt svarer i boblen under feltet (POST /api/assist); eldre server: Chat som før.
        // Prompt 32: snarveier først, og Chat bare når svaret tar lengre tid enn hs_timeout_s (P32b.kt).
        else -> { askHome32b(t); null }
    }
}

/* ---------- Nå / Neste-kortet ---------- */

class KalNow29(
    val k: String, val tm: String, val day: String, val title: String, val place: String, val big: String, val small: String,
    val progress: Float?, val color: Long, val ev: Kal26Ev?,
)

private fun dur29(x: Int): String = when {
    x < 60 -> "$x min"
    x < 1440 -> "${x / 60} t" + (if (x % 60 != 0) " ${x % 60} min" else "")
    else -> "${Math.round(x / 1440.0)} d"
}

/** NÅ (pågår, med fremdrift) eller NESTE de neste tre ukene, som nx i fasiten. */
fun kalNow29(s: Kal26State, evs: List<Kal26Ev>, now: LocalDateTime): KalNow29 {
    val today = now.toLocalDate()
    val nm = now.hour * 60 + now.minute
    for (i in 0 until 21) {
        val d = today.plusDays(i.toLong())
        val l = kalDay27(evs, d, s.hiddenFilters).filter { it.sMin != null && it.eMin != null && it.type != "innl" }
        for (e in l) {
            val a = e.sMin!! + i * 1440
            val b = e.eMin!! + i * 1440
            if (b <= nm) continue
            val cur = a <= nm
            val day = when (i) { 0 -> "i dag"; 1 -> "i morgen"; else -> kalLong(d) }
            val soon = a - nm < 1440
            val big = when { cur -> dur29(b - nm); soon -> dur29(a - nm); else -> kalCap(BD_WD[d.dayOfWeek.value - 1]).take(3) }
            val small = when { cur -> "igjen"; soon -> "til start"; else -> e.sText }
            val prog = if (cur) ((nm - a).toFloat() / maxOf(1, b - a)).coerceIn(0f, 1f) else null
            return KalNow29(if (cur) "NÅ" else "NESTE", "${e.sText}–${e.eText}", day, e.title, noUrl31(e.room), big, small, prog, kalColor27(e, s), e)
        }
    }
    return KalNow29("", "", "De neste tre ukene", "Ingen kommende hendelser", "", "", "", null, 0xFF7A7468, null)
}
