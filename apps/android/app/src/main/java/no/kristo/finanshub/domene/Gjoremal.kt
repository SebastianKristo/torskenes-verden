@file:JvmName("DomeneGjoremal")

package no.kristo.finanshub

import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Rect
import java.net.URLEncoder
import java.time.DayOfWeek
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/*
 * Gjøremål: kode som lå i blandingsfilene (P32b.kt, P37.kt, P40.kt, P41.kt, P42.kt, P44.kt, P46.kt, Models.kt, Models22.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ---------------- Huskeliste: Arkivert ---------------- */

private fun parseArchived32b(raw: String): List<TaskItem> {
    val tr = raw.trim()
    val a = runCatching { if (tr.startsWith("[")) JSONArray(tr) else JSONObject(tr).let { it.optJSONArray("items") ?: it.optJSONArray("archived") ?: it.optJSONArray("tasks") } }.getOrNull() ?: return emptyList()
    val out = ArrayList<Pair<TaskItem, String>>()
    for (i in 0 until a.length()) {
        val t = a.optJSONObject(i) ?: continue
        // Bare rader som faktisk er arkivert (eldre server ignorerer ?archived=1 og sender alle).
        val at = t.optStr("archived_at") ?: t.optStr("archivedAt") ?: (if (t.optBoolean("archived") || t.optBoolean("arch")) "1" else null) ?: continue
        val id = t.optStr("id") ?: continue
        out += TaskItem(id, t.optStr("title") ?: "", t.optStr("list"), t.optStr("due")?.take(10), t.optStr("assignee"), true,
            t.optStr("doneAt") ?: t.optStr("done_at"), t.optStr("createdBy")) to at
    }
    return out.sortedByDescending { it.second }.map { it.first }
}

fun AppViewModel.loadArchived32b() {
    launch32b {
        p32b.archived = runCatching { parseArchived32b(api32b { hlGet("/tasks?archived=1") }) }.getOrNull() ?: p32b.archived ?: emptyList()
    }
}

private suspend fun AppViewModel.patchTask32b(id: String, body: JSONObject) {
    api32b { request("PATCH", "/tasks/" + URLEncoder.encode(id, "UTF-8"), body, prefix = Api.HOMELAB) }
}

private fun AppViewModel.afterTasks32b() {
    loadTasks()
    loadArchived32b()
    runCatching { no.kristo.finanshub.widget.TasksWidgetSync.refresh(appCtx29) }
}

/** Arkivikonet på en fullført oppgave. */
fun AppViewModel.archiveTask32b(id: String) {
    Haptics.select()
    tasksHide32b(setOf(id))
    launch32b {
        try { patchTask32b(id, JSONObject().put("archived", true)) } catch (e: ApiException) { flash(if (e.status == 404 || e.status == 400) "Serveren kan ikke arkivere ennå. Oppdater Nordlys OS." else "Kunne ikke arkivere: ${e.message}") }
        afterTasks32b()
    }
}

/** «Arkiver alle» i FERDIG. */
fun AppViewModel.archiveDone32b(ids: List<String>) {
    if (ids.isEmpty()) return
    Haptics.success()
    tasksHide32b(ids.toSet())
    launch32b {
        var failed = 0
        ids.forEach { id -> try { patchTask32b(id, JSONObject().put("archived", true)) } catch (e: Exception) { failed++ } }
        flash(if (failed == 0) "${ids.size} ${if (ids.size == 1) "oppgave" else "oppgaver"} arkivert" else "Kunne ikke arkivere $failed av ${ids.size}")
        afterTasks32b()
    }
}

/** ↺ Gjenopprett: tilbake som åpen oppgave i sin liste. */
fun AppViewModel.restoreTask32b(id: String) {
    Haptics.select()
    p32b.archived = p32b.archived?.filter { it.id != id }
    launch32b {
        try { patchTask32b(id, JSONObject().put("archived", false).put("done", false)); flash("Oppgaven er gjenopprettet") } catch (e: ApiException) { flash("Kunne ikke gjenopprette: ${e.message}") }
        afterTasks32b()
    }
}

/** × i Arkivert: slett for godt. */
fun AppViewModel.deleteArchived32b(id: String) {
    p32b.archived = p32b.archived?.filter { it.id != id }
    launch32b {
        runCatching { api32b { hlDelete("/tasks/" + URLEncoder.encode(id, "UTF-8")) } }
        afterTasks32b()
    }
}

/** «Tøm arkivet» (trykk to ganger). */
fun AppViewModel.emptyArchive32b() {
    val s = p32b
    if (!s.archClearArm) { s.archClearArm = true; Haptics.select(); return }
    s.archClearArm = false
    val ids = s.archived?.map { it.id } ?: return
    s.archived = emptyList()
    Haptics.success()
    launch32b {
        ids.forEach { id -> runCatching { api32b { hlDelete("/tasks/" + URLEncoder.encode(id, "UTF-8")) } } }
        flash("Arkivet er tømt")
        afterTasks32b()
    }
}

/** Skjuler oppgavene i listen med en gang (før serveren har svart). */
private fun AppViewModel.tasksHide32b(ids: Set<String>) {
    val t = tasks ?: return
    val moved = t.items.filter { it.id in ids }
    p32b.archived = (moved + (p32b.archived ?: emptyList())).distinctBy { it.id }
    setTasks32b(t.copy(items = t.items.filter { it.id !in ids }))
}

/* ======================= Gjøremål: modell ======================= */

data class TaskSub37(val n: String, val done: Boolean)

internal fun subs37(a: JSONArray?): List<TaskSub37> {
    val out = ArrayList<TaskSub37>()
    for (i in 0 until (a?.length() ?: 0)) {
        when (val x = a!!.opt(i)) {
            is JSONObject -> (x.s37("n") ?: x.s37("title"))?.let { out += TaskSub37(it, x.optBoolean("done", false)) }
            is String -> if (x.isNotBlank()) out += TaskSub37(x, false)
        }
    }
    return out
}

internal fun prio37(v: Any?): Int = when (v) {
    is Number -> v.toInt().coerceIn(0, 3)
    is String -> when (v.lowercase()) { "1", "low", "lav" -> 1; "2", "mid", "medium", "middels" -> 2; "3", "high", "høy" -> 3; else -> 0 }
    else -> 0
}

val REP37 = listOf(null to "Aldri", "daily" to "Hver dag", "weekdays" to "Ukedager", "weekly" to "Hver uke", "biweekly" to "Annenhver uke", "monthly" to "Hver måned", "yearly" to "Hvert år")

val EARLY37 = listOf(null to "Ingen", "5m" to "5 min", "15m" to "15 min", "30m" to "30 min", "1h" to "1 time", "1d" to "1 dag", "2d" to "2 dager", "1w" to "1 uke før")

val PLACE37 = listOf(null to "Av", "store" to "Ved matbutikk", "home" to "Når jeg kommer hjem", "leave" to "Når jeg drar hjemmefra", "work" to "På jobb", "cabin" to "På hytta")

val PRIO37 = listOf(0 to "Ingen", 1 to "Lav", 2 to "Middels", 3 to "Høy")

val LIST_COLORS37 = listOf(0xFFB23A2A, 0xFF2F7A4F, 0xFF2F5D8A, 0xFF8A5A44, 0xFFA8661A, 0xFF7A5AD6, 0xFFC2477A, 0xFF3D7F8A)

/** Minutter før forfall for «tidlig påminnelse». */
fun earlyMin37(k: String?): Long? = when (k) { "5m" -> 5; "15m" -> 15; "30m" -> 30; "1h" -> 60; "1d" -> 1440; "2d" -> 2880; "1w" -> 10080; else -> null }

fun TaskItem.toJson37(): JSONObject = JSONObject().put("title", title).put("n", title).put("list", list ?: JSONObject.NULL).put("l", list ?: JSONObject.NULL)
    .put("due", due ?: JSONObject.NULL).put("time", time ?: JSONObject.NULL).put("assignee", assignee ?: JSONObject.NULL).put("who", assignee ?: JSONObject.NULL)
    .put("notes", notes ?: "").put("urgent", urgent).put("rep", rep ?: JSONObject.NULL).put("early", early ?: JSONObject.NULL).put("prio", prio).put("flag", flag)
    .put("tags", JSONArray(tags)).put("subs", JSONArray().apply { subs.forEach { put(JSONObject().put("n", it.n).put("done", it.done)) } })
    .put("place", place ?: JSONObject.NULL)
    // Prompt 44: frist og stedets koordinater (pl + geo).
    .put("dl", dl ?: JSONObject.NULL).put("pl", place ?: JSONObject.NULL)
    .put("geo", geo?.let { JSONObject().put("lat", it.first).put("lon", it.second) } ?: JSONObject.NULL)

/** Neste forekomst for en gjentagende oppgave. Reserve for eldre servere: serveren sender nextDue (server/gjoremal/routes.js). */
fun nextDue37(due: String?, rep: String?): String? {
    val d = due?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: LocalDate.now(OSLO37)
    return when (rep) {
        "daily" -> d.plusDays(1)
        "weekdays" -> { var n = d.plusDays(1); while (n.dayOfWeek == DayOfWeek.SATURDAY || n.dayOfWeek == DayOfWeek.SUNDAY) n = n.plusDays(1); n }
        "weekly" -> d.plusWeeks(1)
        "biweekly" -> d.plusWeeks(2)
        "monthly" -> d.plusMonths(1)
        "yearly" -> d.plusYears(1)
        else -> return null
    }.toString()
}

/* ======================= Glimt i Gjøremål ======================= */

data class GItem37(
    val id: String?, val title: String, val list: String?, val due: String?, val time: String?, val note: String?,
    /** Prompt 40: steg i rekkefølgen (1 = først), tittelen på punktet det kommer etter, sted, @person og tagger. */
    val step: Int = 0, val after: String? = null, val place: String? = null, val who: String? = null, val tags: List<String> = emptyList(),
)

data class TaskGlimt37(val kind: String, val text: String, val items: List<GItem37>, val undo: String?, val local: Boolean = false, val localIds: List<String> = emptyList())

class P37State {
    /* Wiggle på Hjem */
    internal val bounds = HashMap<String, Rect>()
    internal var lastSw = 0L
    internal val dirty = HashSet<String>()
    var edgeDir by mutableFloatStateOf(0f)
    internal var gridTop = 0f
    internal var gridBottom = 0f
    var h2Auto by mutableStateOf(true)
    var h2N by mutableIntStateOf(1)
    var h2Menu by mutableStateOf(false)
    internal var woptFor: String? = null
    var h2WasHidden by mutableStateOf(false)

    /* Onboarding med profil */
    var profiles by mutableStateOf<List<Profile37>>(emptyList())
    var obOpen by mutableStateOf(false)
    var obStep by mutableIntStateOf(1)
    var obSel by mutableStateOf<String?>(null)
    var obNew by mutableStateOf(false)
    var obNewName by mutableStateOf("")
    var obLocked by mutableStateOf(false)
    var obMine by mutableStateOf<String?>(null)
    var obBusy by mutableStateOf(false)
    var obErr by mutableStateOf<String?>(null)
    var obConsent by mutableStateOf(mapOf("location" to true, "lists" to true, "subs" to true, "calendars" to true, "health" to false))
    var obLinked by mutableStateOf<Profile37?>(null)
    internal var obFor: String? = null

    /* Brukeren selv og husstanden */
    var myId by mutableStateOf<String?>(null)
    var users by mutableStateOf<List<TaskMember>>(emptyList())
    internal var usersFor: String? = null

    /* Gjøremål */
    var detail by mutableStateOf<String?>(null)
    var listSheet by mutableStateOf<String?>(null)
    var glimtOpen by mutableStateOf(false)
    var glimtBusy by mutableStateOf(false)
    var glimt by mutableStateOf<TaskGlimt37?>(null)
    var glimtImage by mutableStateOf<ByteArray?>(null)
    var splitBusy by mutableStateOf<String?>(null)
    var listBusy by mutableStateOf(false)
    var cardsOff by mutableStateOf<Set<String>>(emptySet())
    /** Glimt-kortene fra serveren (null = eldre server: lokale kort). */
    var cards by mutableStateOf<List<GCard37>?>(null)
    internal var undoJob: Job? = null

    /* Sporing: husstandens nøkler */
    var trk by mutableStateOf<TrkKeys37?>(null)
    var trkMissing by mutableStateOf(false)
    var trkEdit by mutableStateOf<String?>(null)
    var trkBusy by mutableStateOf(false)

    /* Subscription OS */
    var subWig by mutableStateOf(false)
    var subHid by mutableStateOf<List<String>>(emptyList())
    var subAdd by mutableStateOf(false)
    var trialAdd by mutableStateOf(false)
    internal var subHidFor: String? = null
    var subShareBusy by mutableStateOf(false)

    /* Bibelvers */
    var bibleOn by mutableStateOf<Boolean?>(null)
    var verse by mutableStateOf<Verse37?>(null)
    var verseOff by mutableIntStateOf(0)
    var verseAlt by mutableStateOf<Verse37?>(null)
    var bibleSet by mutableStateOf(BibleSet37(false))
    var bibleMissing by mutableStateOf(false)
    var bibleHome by mutableStateOf<BibleHome37?>(null)
    var biblePage by mutableStateOf(false)
    var bibleSheet by mutableStateOf(false)
    var readDays by mutableStateOf<Set<String>>(emptySet())
    var best by mutableIntStateOf(0)
    var saved by mutableStateOf<List<Pair<String, String>>>(emptyList())
    var plan by mutableStateOf("joh")
    var planDay by mutableIntStateOf(0)
    var planDone by mutableStateOf<String?>(null)
    var remind by mutableStateOf(false)
    var explain by mutableStateOf<String?>(null)
    internal var bibleFor: String? = null
    internal var bibleAt = 0L
    /** Økten: ny når appen startes, eller kommer fra bakgrunnen etter > 5 min. */
    var sess by mutableStateOf(System.currentTimeMillis())
    internal var bgAt = 0L
}

internal fun AppViewModel.acct37() = account?.id ?: ""

/* ======================= Gjøremål: oppgaver ======================= */

/** Endringen vises med en gang (optimistisk) og sendes som PATCH. Feil: hentes på nytt. */
fun AppViewModel.patchTask37(id: String, f: (TaskItem) -> TaskItem) {
    val t = tasks ?: return
    val old = t.items.firstOrNull { it.id == id } ?: return
    val nw = f(old)
    if (nw == old) return
    setTasks32b(t.copy(items = t.items.map { if (it.id == id) nw else it }))
    launch37 {
        try {
            api37 { request("PATCH", "/tasks/" + URLEncoder.encode(id, "UTF-8"), nw.toJson37(), prefix = Api.HOMELAB) }
            if (old.urgent != nw.urgent || old.time != nw.time || old.due != nw.due || old.early != nw.early) Alarms37.schedule(appCtx35, tasks)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            // Prompt 51 (ANDPLAT51): uten nett beholdes endringen lokalt og sendes fra offline-køen (siste skriving vinner).
            if (Offline51.isOffline(e)) {
                Offline51.enqueue(appCtx35, "PATCH", "/tasks/" + URLEncoder.encode(id, "UTF-8"), nw.toJson37(), nw.title, kind = "task", taskId = id)
                flash("Uten nett – sendes når du er på nett igjen")
                return@launch37
            }
            flash("Fikk ikke lagret: ${uiErr73(e, "ukjent feil")}")
            refreshTasks37()
        }
    }
}

/** Avkryssing: en gjentagende oppgave får neste forekomst (serveren lager den; vises lokalt med en gang). */
fun AppViewModel.toggleTask37(id: String) {
    val t = tasks ?: return
    val it0 = t.items.firstOrNull { it.id == id } ?: return
    if (!it0.done && it0.rep != null) {
        Haptics.success()
        // Fase 5: serverens nextDue; den lokale regelen bare for eldre servere uten feltet.
        val next = it0.nextDue ?: nextDue37(it0.due, it0.rep)
        patchTask37(id) { it.copy(due = next, nextDue = null, subs = it.subs.map { s -> s.copy(done = false) }) }
        flash("Neste: " + (next?.let { dueLabel37(it) } ?: "senere"))
        return
    }
    toggleTask(id)
}

fun AppViewModel.refreshTasks37() = launch37 {
    runCatching { parseTasks(api37 { hlGet("/tasks") }) }.getOrNull()?.let { fresh ->
        // Eier/medlemmer fra /tasks/lists når /tasks ikke har dem.
        val l2 = if (fresh.lists.any { it.owner != null || it.members.isNotEmpty() }) fresh else
            runCatching { parseTaskLists(api37 { hlGet("/tasks/lists") }) }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { ex ->
                val by = ex.associateBy { it.id }
                fresh.copy(lists = fresh.lists.map { l -> by[l.id] ?: l } + ex.filter { e -> fresh.lists.none { it.id == e.id } })
            } ?: fresh
        setTasks32b(l2)
        Alarms37.schedule(appCtx35, l2)
    }
}

/** Ny oppgave med felter (Glimt-tolkning eller detaljer). Returnerer id-en serveren ga. */
internal suspend fun AppViewModel.createTask37(title: String, list: String?, extra: JSONObject = JSONObject()): String? {
    val body = JSONObject(extra.toString()).put("title", title.trim()).put("n", title.trim()).put("list", list ?: JSONObject.NULL).put("l", list ?: JSONObject.NULL)
    if (!body.has("due")) body.put("due", JSONObject.NULL)
    val raw = api37 { hlPost("/tasks", body) }
    return runCatching { JSONObject(raw).let { it.s37("id") ?: it.optJSONObject("item")?.s37("id") ?: it.optJSONObject("task")?.s37("id") } }.getOrNull()
}

fun AppViewModel.deleteTask37(id: String) {
    val t = tasks ?: return
    setTasks32b(t.copy(items = t.items.filter { it.id != id }))
    p37.detail = null
    launch37 {
        runCatching { api37 { hlDelete("/tasks/" + URLEncoder.encode(id, "UTF-8")) } }
        refreshTasks37()
        flash("Oppgaven er slettet")
    }
}

fun dueLabel37(due: String, today: LocalDate = LocalDate.now(OSLO37)): String {
    val d = runCatching { LocalDate.parse(due.take(10)) }.getOrNull() ?: return due
    return when {
        d == today -> "I dag"
        d == today.plusDays(1) -> "I morgen"
        d.isBefore(today) -> "Forfalt ${d.dayOfMonth}.${d.monthValue}."
        d.isBefore(today.plusDays(7)) -> d.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale("nb")).replaceFirstChar { it.uppercase() }
        else -> "${d.dayOfMonth}.${d.monthValue}."
    }
}

/* ---------- Lister ---------- */

/** Ny liste (POST) eller endring (PATCH) med navn, farge og medlemmer. Eldre server: PUT …/members. */
fun AppViewModel.saveList37(id: String?, name: String, color: Long, members: List<String>) {
    val s = p37
    if (s.listBusy) return
    s.listBusy = true
    val body = JSONObject().put("name", name.trim()).put("color", hexOf37(color)).put("members", JSONArray(members))
    launch37 {
        try {
            if (id == null) {
                val raw = api37 { hlPost("/tasks/lists", body) }
                runCatching { JSONObject(raw).let { it.s37("id") ?: it.optJSONObject("list")?.s37("id") } }.getOrNull()?.let { taskFilter = it }
            } else try {
                api37 { request("PATCH", "/tasks/lists/" + URLEncoder.encode(id, "UTF-8"), body, prefix = Api.HOMELAB) }
            } catch (e: ApiException) {
                if (e.status != 404 && e.status != 405) throw e
                api37 { hlPut("/tasks/lists/" + URLEncoder.encode(id, "UTF-8") + "/members", JSONObject().put("userIds", JSONArray(members))) }
            }
            s.listSheet = null
            Haptics.success()
            refreshTasks37()
        } catch (e: ApiException) {
            flash(if (e.status == 403) "Bare eieren kan endre listen" else if (e.status == 404) "Serveren kan ikke lage lister ennå" else "Fikk ikke lagret listen: ${e.message}")
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke lagret listen") } finally { s.listBusy = false }
    }
}

fun AppViewModel.deleteList37(id: String) = listAct37(id, "DELETE", "", "Listen er slettet")

fun AppViewModel.leaveList37(id: String) = listAct37(id, "POST", "/leave", "Du har forlatt listen")

private fun AppViewModel.listAct37(id: String, method: String, suffix: String, ok: String) {
    val s = p37
    s.listBusy = true
    launch37 {
        try {
            api37 { request(method, "/tasks/lists/" + URLEncoder.encode(id, "UTF-8") + suffix, if (method == "POST") JSONObject() else null, prefix = Api.HOMELAB) }
            s.listSheet = null
            if (taskFilter == id) taskFilter = "alle"
            flash(ok)
            refreshTasks37()
        } catch (e: ApiException) {
            flash(if (e.status == 403) "Bare eieren kan slette listen" else "Fikk ikke gjort det: ${e.message}")
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke gjort det") } finally { s.listBusy = false }
    }
}

/* ---------- Glimt ---------- */

private val WD37 = listOf("mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag")

private val SHOP37 = Regex("\\b(melk|egg|brød|kaffe|smør|ost|bananer?|epler?|pasta|ris|kjøtt|kylling|fisk|laks|yoghurt|juice|tomat(er)?|løk|poteter?|mel|sukker|vaskemiddel|dopapir|tørkerull|bleier)\\b", RegexOption.IGNORE_CASE)

/** Lokal tolkning når serveren ikke har /api/tasks/glimt: dato/tid/viktig/gjenta/#tagger/liste, og «kjøp X, Y og Z» → én vare per ting. */
fun parseGlimt37(q: String, lists: List<TaskList>, members: List<TaskMember>, today: LocalDate = LocalDate.now(OSLO37)): List<JSONObject> {
    var t = q.trim()
    val low = t.lowercase()
    val o = JSONObject()
    var due: LocalDate? = null
    when {
        Regex("\\bi\\s*overmorgen\\b").containsMatchIn(low) -> due = today.plusDays(2)
        Regex("\\bi\\s*morgen\\b|\\bimorgen\\b").containsMatchIn(low) -> due = today.plusDays(1)
        Regex("\\bi\\s*dag\\b").containsMatchIn(low) -> due = today
        Regex("\\bneste uke\\b").containsMatchIn(low) -> due = today.plusWeeks(1)
    }
    Regex("\\b(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?\\b").find(t)?.let { m ->
        val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()?.let { if (it < 100) 2000 + it else it }
        runCatching { LocalDate.of(y ?: today.year, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()?.let { d -> due = if (y == null && d.isBefore(today)) d.plusYears(1) else d; t = t.replace(m.value, " ") }
    }
    WD37.forEachIndexed { i, w -> if (due == null && Regex("\\b(på\\s+)?$w\\b").containsMatchIn(low)) { var d = today.plusDays(1); while (d.dayOfWeek.value != i + 1) d = d.plusDays(1); due = d } }
    Regex("\\bkl\\.?\\s*(\\d{1,2})(?:[.:](\\d{2}))?\\b", RegexOption.IGNORE_CASE).find(t)?.let { m ->
        o.put("time", "%02d:%02d".format(m.groupValues[1].toInt().coerceIn(0, 23), m.groupValues[2].ifEmpty { "0" }.toInt().coerceIn(0, 59)))
        if (due == null) due = today
        t = t.replace(m.value, " ")
    }
    if (Regex("\\bviktig\\b|\\balarm\\b").containsMatchIn(low)) o.put("urgent", true)
    when {
        Regex("hver dag|daglig").containsMatchIn(low) -> o.put("rep", "daily")
        Regex("ukedager|hverdager").containsMatchIn(low) -> o.put("rep", "weekdays")
        Regex("annenhver uke").containsMatchIn(low) -> o.put("rep", "biweekly")
        Regex("hver uke|ukentlig").containsMatchIn(low) -> o.put("rep", "weekly")
        Regex("hver måned|månedlig").containsMatchIn(low) -> o.put("rep", "monthly")
        Regex("hvert år|årlig").containsMatchIn(low) -> o.put("rep", "yearly")
    }
    Regex("påminn\\s+(?:meg\\s+)?(\\d+)\\s*(min|t|time|timer|dag|dager)\\s+før", RegexOption.IGNORE_CASE).find(low)?.let { m ->
        val n = m.groupValues[1].toInt()
        o.put("early", when (m.groupValues[2]) { "min" -> if (n <= 5) "5m" else if (n <= 15) "15m" else "30m"; "t", "time", "timer" -> "1h"; else -> if (n >= 2) "2d" else "1d" })
    }
    val tags = Regex("#([\\wæøåÆØÅ-]+)").findAll(t).map { it.groupValues[1] }.toList()
    if (tags.isNotEmpty()) o.put("tags", JSONArray(tags))
    members.firstOrNull { m -> firstName37(m.name).length > 1 && Regex("\\b" + Regex.escape(firstName37(m.name)) + "\\b", RegexOption.IGNORE_CASE).containsMatchIn(t) }?.let { o.put("assignee", it.id).put("who", it.id) }
    due?.let { o.put("due", it.toString()) }
    // Rydd tittelen: fjern ord som ble tolket.
    var title = t.replace(Regex("#[\\wæøåÆØÅ-]+"), " ")
        .replace(Regex("(?i)\\b(påminn meg (om )?å|påminn meg om|husk å|i overmorgen|i morgen|imorgen|i dag|neste uke|viktig|hver dag|daglig|ukedager|hverdager|annenhver uke|hver uke|ukentlig|hver måned|månedlig|hvert år|årlig|på (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|påminn\\s+(meg\\s+)?\\d+\\s*(min|t|time|timer|dag|dager)\\s+før)\\b"), " ")
        .replace(Regex("[,\\s]+$"), "").replace(Regex("\\s{2,}"), " ").trim().trim(',')
    if (title.isEmpty()) title = q.trim()
    title = title.replaceFirstChar { it.uppercase() }
    val shopList = lists.firstOrNull { it.name.equals("Handel", true) || it.id == "handel" }
    // «Kjøp melk, egg og kaffe» → én vare per ting i Handel.
    Regex("^(?:kjøp|handle|vi trenger|trenger)\\s+(.+)$", RegexOption.IGNORE_CASE).find(title)?.let { m ->
        val parts = m.groupValues[1].split(Regex("\\s*,\\s*|\\s+og\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.size >= 2) return parts.map { p -> JSONObject(o.toString()).put("title", p.replaceFirstChar { it.uppercase() }).put("list", shopList?.id ?: JSONObject.NULL) }
    }
    val guessList = when {
        SHOP37.containsMatchIn(title) -> shopList
        Regex("hytt", RegexOption.IGNORE_CASE).containsMatchIn(title) -> lists.firstOrNull { it.name.equals("Hytta", true) }
        Regex("\\b(møte|rapport|jobb|kunde|e-post)\\b", RegexOption.IGNORE_CASE).containsMatchIn(title) -> lists.firstOrNull { it.name.equals("Jobb", true) }
        else -> null
    }
    guessList?.let { o.put("list", it.id) }
    return listOf(o.put("title", title))
}

/** Lim inn flere linjer → én oppgave per linje (punkttegn fjernes). */
fun splitLines37(q: String): List<String>? {
    val l = q.lines().map { it.trim().removePrefix("-").removePrefix("•").removePrefix("*").replace(Regex("^\\d+[.)]\\s*"), "").trim() }.filter { it.isNotEmpty() }
    return l.takeIf { it.size >= 2 }
}

/** ✦ Glimt i Gjøremål: serveren tolker (11 funksjoner); svar med resultatliste og Angre (10 s). Eldre server: lokal tolkning. */
fun AppViewModel.glimt37(q0: String) {
    val s = p37
    val q = q0.trim()
    if ((q.isEmpty() && s.glimtImage == null) || s.glimtBusy) return
    s.glimtBusy = true
    s.glimtOpen = true
    s.glimt = null
    Haptics.tap()
    val list = taskFilter.takeIf { it != "alle" && it != "arkiv" }
    launch37 {
        try {
            val body = JSONObject().put("q", q)
            list?.let { body.put("list", it) }
            s.glimtImage?.let { body.put("image", "data:image/jpeg;base64," + Base64.encodeToString(it, Base64.NO_WRAP)) }
            // Prompt 41: lange beskjeder deles opp med Glimt i bakgrunnen (P41.kt → glimtAsync41).
            if (s.glimtImage == null && needsAi41(q)) body.put("async", true)
            val r = try { JSONObject(api37 { request("POST", "/tasks/glimt", body, prefix = Api.HOMELAB, read = 60_000) }) } catch (e: ApiException) {
                if (e.status == 404 || e.status == 405) null else throw e
            }
            if (r != null && r.s37("jobId") != null) { glimtAsync41(r, q); refreshTasks37(); return@launch37 }
            s.glimt = if (r != null) TaskGlimt37(
                r.s37("kind") ?: "add", r.s37("text") ?: "", glimtItems40(objs34(r.optJSONArray("items"))), r.optJSONObject("undo")?.s37("token"),
            ) else localGlimt37(q, list)
            s.glimtImage = null
            refreshTasks37()
            Haptics.success()
            armUndo37()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.glimt = TaskGlimt37("question", "Glimt fikk ikke svar: ${uiErr73(e, "ukjent feil")}. Prøv igjen, eller spør meg i Chat.", emptyList(), null)
            Haptics.error()
        } finally { s.glimtBusy = false }
    }
}

/** Angre gjelder i 10 s. */
internal fun AppViewModel.armUndo37() {
    val s = p37
    s.undoJob?.cancel()
    val g = s.glimt ?: return
    if (g.undo == null && g.localIds.isEmpty()) return
    s.undoJob = launchJob36 { delay(10_000); if (s.glimt === g) s.glimt = g.copy(undo = null, localIds = emptyList()) }
}

fun AppViewModel.undoGlimt37() {
    val s = p37
    val g = s.glimt ?: return
    s.glimt = g.copy(text = "Angret.", items = emptyList(), undo = null, localIds = emptyList())
    Haptics.select()
    launch37 {
        g.undo?.let { tok -> runCatching { api37 { hlPost("/tasks/glimt/undo", JSONObject().put("token", tok)) } } }
        g.localIds.forEach { id -> runCatching { api37 { hlDelete("/tasks/" + URLEncoder.encode(id, "UTF-8")) } } }
        refreshTasks37()
    }
}

private suspend fun AppViewModel.localGlimt37(q: String, list: String?): TaskGlimt37 {
    val t = tasks
    val lists = t?.lists ?: TASK_LISTS_DEFAULT
    val today = LocalDate.now(OSLO37).toString()
    val items = t?.items ?: emptyList()
    val low = q.lowercase()
    if (Regex("matplan").containsMatchIn(low)) return TaskGlimt37("question", "Matplan → handleliste trenger en nyere Homelab-server. Åpne Mat for å legge ingrediensene i Handel.", emptyList(), null, local = true)
    if (isQuestion37(q)) {
        val open = items.filter { !it.done }
        val sel: List<TaskItem>
        val text: String
        when {
            Regex("forfalt").containsMatchIn(low) -> { sel = open.filter { it.due != null && it.due < today }; text = if (sel.isEmpty()) "Ingenting er forfalt." else "${sel.size} gjøremål er forfalt." }
            Regex("sist kjøpt|kjøpte vi sist|sist").containsMatchIn(low) -> {
                val w = low.replace(Regex(".*\\bsist(e)?\\b|\\bnår kjøpte vi sist\\b|\\?"), " ").trim().split(Regex("\\s+")).lastOrNull().orEmpty()
                val hit = items.filter { it.done && w.isNotBlank() && it.title.lowercase().contains(w) }.maxByOrNull { it.doneAt ?: "" }
                sel = listOfNotNull(hit)
                text = hit?.let { "Sist avkrysset: **${it.title}**" + (it.doneAt?.take(10)?.let { d -> " ${dueLabel37(d)}" } ?: "") + "." } ?: "Fant ingen avkrysset «$w»."
            }
            Regex("igjen|i dag").containsMatchIn(low) -> { sel = open.filter { it.due != null && it.due <= today }; text = if (sel.isEmpty()) "Du har ingenting igjen i dag." else "Du har ${sel.size} igjen i dag" + (sel.count { it.due!! < today }.takeIf { it > 0 }?.let { ", $it forfalt" } ?: "") + "." }
            else -> {
                val who = (p37.users + (t?.members ?: emptyList())).firstOrNull { m -> firstName37(m.name).length > 1 && low.contains(firstName37(m.name).lowercase()) }
                if (who != null && Regex("lagt til|la til").containsMatchIn(low)) {
                    sel = open.filter { it.createdBy == who.id || it.assignee == who.id }
                    text = if (sel.isEmpty()) "${firstName37(who.name)} har ikke lagt til noe som er åpent." else "${firstName37(who.name)} har lagt til ${sel.size}:"
                } else { sel = emptyList(); text = "Spør meg i Chat for mer." }
            }
        }
        return TaskGlimt37("question", text, sel.take(8).map { GItem37(it.id, it.title, it.list, it.due, it.time, null) }, null, local = true)
    }
    // Prompt 40: flere handlinger i én setning («… men først må jeg levere pakken») → flere punkter i riktig rekkefølge.
    localMulti40(q, list, lists, t?.members ?: emptyList())?.let { return it }
    val many = splitLines37(q)
    val parsed = many?.map { line -> parseGlimt37(line, lists, t?.members ?: emptyList()).first() } ?: parseGlimt37(q, lists, t?.members ?: emptyList())
    val ids = ArrayList<String>()
    val out = ArrayList<GItem37>()
    for (o in parsed) {
        val l = o.s37("list") ?: list ?: lists.firstOrNull { it.priv == true }?.id ?: lists.first().id
        val title = o.s37("title") ?: continue
        o.remove("title"); o.remove("list")
        createTask37(title, l, o)?.let { ids += it }
        out += GItem37(null, title, l, o.s37("due"), o.s37("time"), null)
    }
    val txt = if (out.size == 1) "La til **${out[0].title}**" + (lists.firstOrNull { it.id == out[0].list }?.let { " i ${it.name}" } ?: "") + "." else "La til ${out.size} gjøremål."
    return TaskGlimt37("add", txt, out, null, local = true, localIds = ids)
}

private val Q37 = Regex("^\\s*(hva|hvem|hvilke?n?|når|hvor mange|har|er det)\\b", RegexOption.IGNORE_CASE)

fun isQuestion37(q: String) = q.trim().endsWith("?") || Q37.containsMatchIn(q)

/** «✦ Del opp med Glimt»: 3–6 deloppgaver (LLM på serveren, lokale maler som reserve). */
fun AppViewModel.split37(id: String) {
    val s = p37
    val t = tasks?.items?.firstOrNull { it.id == id } ?: return
    if (s.splitBusy != null) return
    s.splitBusy = id
    launch37 {
        try {
            val subs = try {
                val r = JSONObject(api37 { request("POST", "/tasks/" + URLEncoder.encode(id, "UTF-8") + "/split", JSONObject(), prefix = Api.HOMELAB, read = 60_000) })
                subs37(r.optJSONArray("subs") ?: r.optJSONArray("items")).ifEmpty { subs37(r.optJSONObject("task")?.optJSONArray("subs")) }
            } catch (e: ApiException) { if (e.status == 404 || e.status == 405) emptyList() else throw e }
            val got = subs.ifEmpty { splitLocal37(t.title).map { TaskSub37(it, false) } }
            patchTask37(id) { it.copy(subs = (it.subs + got).distinctBy { x -> x.n.lowercase() }) }
            Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke delt opp: ${e.message}") } finally { s.splitBusy = null }
    }
}

fun splitLocal37(title: String): List<String> {
    val l = title.lowercase()
    return when {
        l.contains("flytt") -> listOf("Bestill flyttebil", "Skaff esker", "Meld flytting", "Pakk ett rom om dagen", "Vask ut")
        l.contains("hytt") -> listOf("Handle mat", "Pakk klær og sengetøy", "Sjekk brøyting", "Ta med ved", "Lås og sjekk strøm")
        l.contains("bursdag") -> listOf("Kjøp gave", "Inviter gjester", "Bestill kake", "Pynt", "Lag spilleliste")
        l.contains("filter") -> listOf("Finn riktig filtertype", "Bestill filter", "Bytt filter", "Sett påminnelse til neste gang")
        l.contains("domene") -> listOf("Sjekk utløpsdato", "Forny domenet", "Sjekk DNS", "Oppdater betalingskort")
        else -> listOf("Finn ut hva som trengs", "Gjør første steg", "Sjekk at det er ferdig")
    }
}

/** Glimt-forslag i detaljarket: liste, ansvarlig, #tagg og sted ut fra teksten. null = ingenting å foreslå. */
fun guess37(t: TaskItem, lists: List<TaskList>, members: List<TaskMember>): JSONObject? {
    val o = parseGlimt37(t.title, lists, members).first()
    val out = JSONObject()
    o.s37("list")?.takeIf { it != t.list }?.let { out.put("list", it) }
    o.s37("assignee")?.takeIf { it != t.assignee }?.let { out.put("assignee", it) }
    if (SHOP37.containsMatchIn(t.title) && t.place == null) out.put("place", "store")
    if (Regex("hytt", RegexOption.IGNORE_CASE).containsMatchIn(t.title) && "hytte" !in t.tags) out.put("tag", "hytte")
    return out.takeIf { it.length() > 0 }
}

/* ======================= Glimt-kort i Gjøremål (like og forfalte) ======================= */

/** Like åpne oppgaver i samme liste: (liste, tittel) → oppgavene. */
fun dupes37(items: List<TaskItem>): List<List<TaskItem>> =
    items.filter { !it.done }.groupBy { (it.list ?: "") + "|" + it.title.trim().lowercase() }.values.filter { it.size >= 2 }

/** Slå sammen: beholder den første, slår sammen tagger og deloppgaver, sletter resten. */
fun AppViewModel.mergeDupes37(group: List<TaskItem>) {
    val keep = group.first()
    val rest = group.drop(1)
    patchTask37(keep.id) { it.copy(tags = (it.tags + rest.flatMap { r -> r.tags }).distinct(), subs = (it.subs + rest.flatMap { r -> r.subs }).distinctBy { s -> s.n.lowercase() }) }
    val t = tasks ?: return
    setTasks32b(t.copy(items = t.items.filter { i -> rest.none { it.id == i.id } }))
    launch37 { rest.forEach { r -> runCatching { api37 { hlDelete("/tasks/" + URLEncoder.encode(r.id, "UTF-8")) } } }; refreshTasks37() }
    Haptics.success()
}

/** Forfalte: flytt til i morgen. */
fun AppViewModel.moveOverdue37(ids: List<String>) {
    val tm = LocalDate.now(OSLO37).plusDays(1).toString()
    ids.forEach { id -> patchTask37(id) { it.copy(due = tm) } }
    Haptics.success()
}

/* ======================= Mer: Gjøremål synlig (én gangs migrering) ======================= */

/** «huske» fjernes fra skjult-listen i Mer én gang (papir_mer_huske_v1); etterpå kan brukeren skjule den igjen selv. */
fun AppViewModel.merHuske37() {
    val k = "papir_mer_huske_v1_" + (account?.id ?: "")
    if (account == null || prefs.bool(k)) return
    prefs.set(k, true)
    val m = b28.mer
    if ("huske" in m.h) saveMer28(m.copy(h = m.h - "huske"))
}

/* ======================= Gjøremål-Glimt: flere punkter ======================= */

/** Punktene fra POST /api/tasks/glimt: rekkefølge (after = id/indeks/tittel), sted, @person og tagger. */
internal fun glimtItems40(objs: List<JSONObject>): List<GItem37> {
    val titles = objs.map { x -> x.s37("title") ?: x.s37("n") ?: "" }
    val ids = objs.map { it.s37("id") }
    return objs.mapIndexed { i, x ->
        val afterRaw = x.opt("after").takeIf { it != null && it != JSONObject.NULL }
        val after = when (afterRaw) {
            is Number -> titles.getOrNull(afterRaw.toInt())?.takeIf { afterRaw.toInt() != i }
            is String -> ids.indexOf(afterRaw).takeIf { it >= 0 }?.let { titles[it] } ?: afterRaw.toIntOrNull()?.let { titles.getOrNull(it) } ?: afterRaw.takeIf { it.isNotBlank() }
            is JSONObject -> afterRaw.s37("title") ?: afterRaw.s37("n")
            else -> null
        }
        val place = x.optJSONObject("place")?.s37("name") ?: x.s37("placeName") ?: x.s37("place")?.takeIf { it !in setOf("store", "home", "cabin", "work") }
        val who = x.optJSONObject("who")?.let { it.s37("name") ?: it.s37("username") } ?: x.s37("whoName")
        val tags = x.optJSONArray("tags")?.let { a -> (0 until a.length()).mapNotNull { a.optString(it).takeIf { s -> s.isNotBlank() }?.removePrefix("#") } } ?: emptyList()
        GItem37(ids[i], titles[i], x.s37("list") ?: x.s37("l"), x.s37("due"), x.s37("time"), x.s37("note") ?: x.s37("text"),
            step = x.optInt("step", if (objs.size > 1) i + 1 else 0), after = after, place = place, who = who, tags = tags)
    }
}

/** Metalinja i lista: «etter «Lever pakken»» til det forrige punktet er huket av. */
fun afterLabel40(vm: AppViewModel, t: TaskItem): String? {
    if (t.done) return null
    val a = t.after ?: return null
    val prev = vm.tasks?.items?.firstOrNull { it.id == a } ?: return null
    return if (prev.done) null else "etter «${prev.title}»"
}

private val BEFORE40 = Regex("(?i)[,.;]?\\s*\\b(men aller først|men først|aller først|før det|først)\\b\\s*")

private val AFTER40 = Regex("(?i)[,.;]?\\s*\\b(deretter|etterpå|etter det|og så|til slutt)\\b\\s*")

private val MUST40 = Regex("(?i)\\b(må|skal)\\b")

private val WD40 = setOf("mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag")

private val IMP40 = mapOf(
    "levere" to "Lever", "hente" to "Hent", "ringe" to "Ring", "kjøpe" to "Kjøp", "sende" to "Send", "bestille" to "Bestill", "kjøre" to "Kjør",
    "betale" to "Betal", "vaske" to "Vask", "rydde" to "Rydd", "lage" to "Lag", "pakke" to "Pakk", "skrive" to "Skriv", "svare" to "Svar",
    "huske" to "Husk", "booke" to "Book", "sjekke" to "Sjekk", "fikse" to "Fiks", "bytte" to "Bytt", "gi" to "Gi", "ta" to "Ta", "handle" to "Handle",
    "møte" to "Møt", "spørre" to "Spør", "legge" to "Legg", "flytte" to "Flytt", "låne" to "Lån", "selge" to "Selg", "kaste" to "Kast",
)

private val FIX40 = mapOf("møbeler" to "møbler")

/** «Jeg må huske å levere pakken» → «Lever pakken» (fjerner «jeg må (huske å)», «husk å», «påminn meg om å», «må jeg» …). */
internal fun imperative40(s0: String): String {
    var s = s0.trim().trim(',', '.', ';')
    s = s.replace(Regex("(?i)^(og|men|så)\\s+"), "")
    s = s.replace(Regex("(?i)^(jeg\\s+)?(må|skal)\\s+(jeg\\s+)?(huske\\s+å\\s+|huske\\s+)?"), "")
    s = s.replace(Regex("(?i)^(husk|påminn meg om|minn meg på)\\s+(å\\s+)?"), "")
    s = s.replace(Regex("(?i)^å\\s+"), "")
    val words = s.split(Regex("\\s+")).filter { it.isNotEmpty() }.map { w -> FIX40[w.lowercase()] ?: w }.toMutableList()
    if (words.isEmpty()) return s0.trim()
    val first = words[0].lowercase()
    words[0] = IMP40[first] ?: if (first.length > 5 && first.endsWith("ere")) first.dropLast(1).replaceFirstChar { it.uppercase() } else words[0].replaceFirstChar { it.uppercase() }
    return words.joinToString(" ")
}

/** Sted: «til/i/på/hos/ved/fra + Stort ord» (ikke ukedager eller personer). */
internal fun place40(s: String, members: List<TaskMember>): String? {
    val names = members.map { firstName37(it.name).lowercase() }.toSet()
    return Regex("\\b(?:til|i|på|hos|ved|fra)\\s+([A-ZÆØÅ][\\wæøåÆØÅ-]{1,})").findAll(s).map { it.groupValues[1] }
        .firstOrNull { w -> w.lowercase() !in WD40 && w.lowercase() !in names }
}

/** Er dette flere handlinger i én tekst (signalord for rekkefølge eller flere setninger med «må/skal»)? */
internal fun isMulti40(q: String): Boolean {
    // Prompt 42: også uten tegnsetting (gjentatt stedsnavn, «og så», «og hent …»).
    if (localSplit42(q) != null) return true
    if (BEFORE40.containsMatchIn(q) && Regex("(?i)\\b(men|først)\\b").containsMatchIn(q) && q.split(Regex("\\s+")).size >= 5) return true
    if (AFTER40.containsMatchIn(q)) return true
    val sent = q.split(Regex("(?<=[.!?])\\s+")).filter { it.isNotBlank() }
    return sent.size >= 2 && sent.count { MUST40.containsMatchIn(it) } >= 2
}

/** Del i deler i riktig rekkefølge: (tekst, før-flagg). «A men først B» → B, A. «A. Deretter B» → A, B. */
internal fun splitMulti40(q: String): List<String> {
    val parts = ArrayList<Pair<String, Boolean>>() // tekst, skal før forrige
    val sentences = q.split(Regex("(?<=[.!?])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
    for (sen in sentences) {
        var rest = sen
        var before = false
        // Signalord i starten av setningen gjelder hele setningen.
        Regex("(?i)^(men\\s+)?(aller\\s+)?(først|før det)\\b\\s*").find(rest)?.let { rest = rest.substring(it.range.last + 1); before = true }
        Regex("(?i)^(deretter|etterpå|etter det|og så|til slutt)\\b\\s*").find(rest)?.let { rest = rest.substring(it.range.last + 1) }
        // Inni setningen.
        val tokens = Regex("(?i)\\s*[,;]?\\s*\\b(men aller først|men først|aller først|før det|deretter|etterpå|etter det|og så|til slutt)\\b\\s*").split(rest)
        val seps = Regex("(?i)\\b(men aller først|men først|aller først|før det|deretter|etterpå|etter det|og så|til slutt)\\b").findAll(rest).map { it.value.lowercase() }.toList()
        tokens.forEachIndexed { i, tk ->
            val t = tk.trim().trim(',', '.', ';', '!', '?')
            if (t.isEmpty()) return@forEachIndexed
            val b = if (i == 0) before else seps.getOrNull(i - 1)?.let { it.contains("først") || it == "før det" } ?: false
            parts += t to b
        }
    }
    // Bygg rekkefølgen: et «før»-ledd settes foran leddet det står etter.
    val out = ArrayList<String>()
    for ((t, b) in parts) { if (b && out.isNotEmpty()) out.add(out.size - 1, t) else out += t }
    // Prompt 42: beskjed uten punktum og komma deles på gjentatt stedsnavn / «og så» / «og hent …» (P42.kt).
    if (out.size < 2) localSplit42(q)?.let { return it }
    return out
}

/**
 * Lokal tolker (når serveren ikke har /api/tasks/glimt med flere punkter): «Jeg må huske å ta med noen pakker og møbeler til
 * Strømstad men først må jeg levere pakken» → 1 «Lever pakken» (#pakke #strømstad, først), 2 «Ta med noen pakker og møbler til
 * Strømstad» (Strømstad, #strømstad, etter «Lever pakken»). null = ikke flere handlinger (vanlig tolkning).
 */
internal suspend fun AppViewModel.localMulti40(q: String, list: String?, lists: List<TaskList>, members: List<TaskMember>): TaskGlimt37? {
    if (!isMulti40(q)) return null
    val parts = splitMulti40(q).takeIf { it.size >= 2 } ?: return null
    val place = place40(q, members)
    val trip = place?.lowercase()
    // Prompt 42: begrunnelser («siden vi skal …») blir notat, ikke en del av tittelen.
    val parsed = parts.map { part -> parseGlimt37(imperative40(stripReason42(part)), lists, members).first() }
    // Dato og tid fra samme forespørsel gjelder alle punktene.
    val due = parsed.firstNotNullOfOrNull { it.s37("due") }
    val time = parsed.firstNotNullOfOrNull { it.s37("time") }
    val priv = lists.firstOrNull { it.priv == true }?.id ?: lists.first().id
    val ids = ArrayList<String>()
    val out = ArrayList<GItem37>()
    var prevId: String? = null
    var prevTitle: String? = null
    parsed.forEachIndexed { i, o ->
        val title = imperative40(o.s37("title") ?: parts[i])
        val myPlace = place?.takeIf { parts[i].contains(it) }
        val tags = LinkedHashSet<String>()
        o.optJSONArray("tags")?.let { a -> for (k in 0 until a.length()) tags += a.optString(k) }
        if (Regex("(?i)\\bpakken?\\b").containsMatchIn(parts[i])) tags += "pakke"
        trip?.let { tags += it }
        val who = o.s37("who")?.let { id -> members.firstOrNull { it.id == id } }
        // Nevnt person: i en liste dere begge er med i (Hjem) hvis den valgte ikke er delt.
        val l = o.s37("list") ?: list?.takeIf { who == null || lists.firstOrNull { x -> x.id == it }?.priv != true }
            ?: (if (who != null) lists.firstOrNull { it.name.equals("Hjem", true) }?.id else null) ?: list ?: priv
        val extra = JSONObject(o.toString()).apply {
            remove("title"); remove("list")
            put("tags", JSONArray(tags.toList()))
            if (!has("due") && due != null) put("due", due)
            if (!has("time") && time != null) put("time", time)
            prevId?.let { put("after", it) }
            myPlace?.let { put("placeName", it) }
            if (!has("notes")) reason42(parts[i])?.let { put("notes", it) }
        }
        val id = runCatching { createTask37(title, l, extra) }.getOrElse {
            // Eldre server som ikke godtar de nye feltene: prøv uten (rekkefølgen står da i notatet).
            val e2 = JSONObject(extra.toString()).apply { remove("after"); remove("placeName"); prevTitle?.let { pt -> put("notes", "Etter «$pt»") } }
            runCatching { createTask37(title, l, e2) }.getOrNull()
        }
        id?.let { ids += it }
        out += GItem37(id, title, l, extra.s37("due"), extra.s37("time"), null, step = i + 1, after = prevTitle, place = myPlace,
            who = who?.let { firstName37(it.name) }, tags = tags.toList())
        prevId = id; prevTitle = title
    }
    val txt = "Lagde ${out.size} punkter" + (place?.let { " for $it" } ?: "") + ", i riktig rekkefølge."
    return TaskGlimt37("add", txt, out, null, local = true, localIds = ids)
}

data class GSrc41(val id: String, val text: String, val createdAt: String?, val engine: String?, val by: String?, val count: Int, val deleted: Int, val items: List<Pair<String, Boolean>>)

data class GJob41(val id: String, val text: String, val at: Long)

/* ======================= Gjøremål: Glimt i bakgrunnen ======================= */

private val LINK41 = Regex("(?i)\\b(før vi skal|før jeg skal|hvor vi må|hvor jeg må|og så|siden|fordi|deretter|etterpå)\\b")

private val VERB41 = Regex("(?i)\\b(må|skal|huske|husk)\\b")

/** AI brukes når teksten har ≥ 12 ord og et verb som «må/skal/huske», koblinger som «før vi skal», eller flere setninger. */
fun needsAi41(q: String): Boolean {
    val words = q.trim().split(Regex("\\s+")).count { it.isNotBlank() }
    val sentences = q.split(Regex("[.!?]\\s+")).count { it.isNotBlank() }
    return (words >= 12 && VERB41.containsMatchIn(q)) || LINK41.containsMatchIn(q) || sentences >= 2
}

/** Svar {jobId, placeholder}: raden «Glimt deler opp beskjeden …» øverst; lista hentes på nytt til jobben er ferdig. */
fun AppViewModel.glimtAsync41(r: JSONObject, q: String) {
    val s = p41
    val id = r.s37("jobId") ?: return
    val job = GJob41(id, q, System.currentTimeMillis())
    s.glimtJobs = s.glimtJobs + job
    p37.glimtOpen = false
    launch41 {
        val before = tasks?.items?.size ?: 0
        var done = false
        for (wait in listOf(3, 4, 5, 6, 8, 10, 12, 15)) {
            delay(wait * 1000L)
            val st = runCatching { JSONObject(api41 { hlGet("/tasks/glimt/jobs/" + URLEncoder.encode(id, "UTF-8"), timeout = 6_000) }) }.getOrNull()
            refreshTasks37()
            val status = st?.s37("state") ?: st?.s37("status") ?: st?.optJSONObject("job")?.let { it.s37("state") ?: it.s37("status") }
            if (status in setOf("done", "ferdig", "failed", "error") || (status == null && (tasks?.items?.size ?: 0) > before + 1)) {
                done = status !in setOf("failed", "error")
                // Prompt 42 (claude-code-huskeliste-glimt-del-opp.md): svaret er tasks[] (eller items[]); én Angre for hele delingen.
                val arr = st?.optJSONArray("tasks") ?: st?.optJSONArray("items") ?: st?.optJSONObject("result")?.optJSONArray("tasks")
                val n = arr?.length() ?: st?.optInt("count", 0)?.takeIf { it > 0 } ?: ((tasks?.items?.size ?: 0) - before).coerceAtLeast(0)
                s.glimtUndo42 = st?.optJSONObject("undo")?.s37("token") ?: st?.s37("undoToken") ?: st?.optJSONObject("result")?.optJSONObject("undo")?.s37("token")
                s.glimtUndoIds42 = arr?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it)?.s37("id") } } ?: emptyList()
                s.glimtDone = if (done && n >= 2) "✦ Glimt delte beskjeden i $n oppgaver" else if (done) "✓ Glimt er ferdig med beskjeden" else "Glimt fikk ikke delt opp beskjeden. Den ligger som ett punkt."
                // AI-en feilet: lokal forhåndsdeling (gjentatt stedsnavn, «og hent …») i stedet for ett langt punkt.
                if (!done) localSplit42(q)?.let { parts ->
                    val ph = r.s37("placeholderId") ?: r.optJSONObject("placeholder")?.s37("id")
                    val lists = tasks?.lists ?: TASK_LISTS_DEFAULT
                    val made = runCatching { localMulti40(q, null, lists, tasks?.members ?: emptyList()) }.getOrNull()
                    if (made != null && made.items.size >= 2) {
                        ph?.let { id -> runCatching { api41 { hlDelete("/tasks/" + URLEncoder.encode(id, "UTF-8")) } } }
                        s.glimtUndoIds42 = made.localIds
                        s.glimtDone = "Glimt delte beskjeden i ${made.items.size} oppgaver (lokalt)"
                        done = true
                        refreshTasks37()
                    }
                }
                break
            }
        }
        s.glimtJobs = s.glimtJobs.filter { it.id != id }
        loadSources41()
        if (s.glimtDone == null) s.glimtDone = "✦ Glimt er ferdig med beskjeden"
        if (done) Haptics.success()
        if (inBackground29) Notify.post(appCtx40, "Glimt", s.glimtDone ?: "", "glimt41-$id", "tasks")
        delay(10_000)
        s.glimtDone = null
        s.glimtUndo42 = null; s.glimtUndoIds42 = emptyList()
    }
}

/** Prompt 42: én Angre for hele Glimt-delingen (slår sammen igjen: serveren gjenoppretter originalen med token). */
fun AppViewModel.undoGlimt42() {
    val s = p41
    val tok = s.glimtUndo42
    val ids = s.glimtUndoIds42
    if (tok == null && ids.isEmpty()) return
    s.glimtUndo42 = null; s.glimtUndoIds42 = emptyList()
    s.glimtDone = "Angret."
    Haptics.select()
    launch41 {
        if (tok != null) runCatching { api41 { hlPost("/tasks/glimt/undo", JSONObject().put("token", tok)) } }
        else ids.forEach { id -> runCatching { api41 { hlDelete("/tasks/" + URLEncoder.encode(id, "UTF-8")) } } }
        refreshTasks37()
    }
}

/* ======================= Gjøremål: «Laget med Glimt» ======================= */

fun AppViewModel.loadSources41() {
    val s = p41
    launch41 {
        try {
            val o = JSONObject(api41 { hlGet("/tasks/glimt/sources") })
            s.sources = objs34(o.optJSONArray("sources")).mapNotNull { x ->
                val id = x.s37("id") ?: return@mapNotNull null
                GSrc41(id, x.s37("text") ?: "", x.s37("createdAt"), x.s37("engineLabel") ?: x.s37("engine"), x.optJSONObject("by")?.s37("name"),
                    x.optInt("count", 0), x.optInt("deleted", 0), objs34(x.optJSONArray("items")).map { (it.s37("title") ?: it.s37("text") ?: "") to it.optBoolean("done", false) })
            }
            s.srcMissing = false
        } catch (e: ApiException) { if (e.status == 404 || e.status == 405) { s.srcMissing = true; s.sources = emptyList() } } catch (_: Exception) { }
    }
}

fun AppViewModel.redoSource41(id: String, text: String) {
    launch41 {
        runCatching {
            val r = JSONObject(api41 { hlPost("/tasks/glimt/sources/" + URLEncoder.encode(id, "UTF-8") + "/redo") })
            glimtAsync41(r, text)
        }.onFailure { message = it.message ?: "Fikk ikke delt opp på nytt" }
        loadSources41()
    }
}

fun AppViewModel.forgetSource41(id: String) {
    launch41 {
        runCatching { api41 { hlDelete("/tasks/glimt/sources/" + URLEncoder.encode(id, "UTF-8")) } }
        p41.sources = p41.sources?.filter { it.id != id }
        message = "Beskjeden er glemt · punktene ligger fortsatt i lista"
    }
}

/** Fra søkefeltet på Hjem: huskebeskjeder (starter med «husk / påminn meg / legg til i huskeliste / ny oppgave», eller ≥ 6 ord med må/skal/huske og vi/jeg/meg/oss). */
fun isHuske41(q: String): Boolean {
    val t = q.trim(); val l = t.lowercase()
    if (t.endsWith("?")) return false
    if (Regex("^(husk|påminn meg|minn meg på|legg til i huskeliste|ny oppgave)\\b").containsMatchIn(l)) return true
    val words = t.split(Regex("\\s+")).count { it.isNotBlank() }
    return words >= 6 && Regex("\\b(må|skal|huske)\\b").containsMatchIn(l) && Regex("\\b(vi|jeg|meg|oss)\\b").containsMatchIn(l)
}

/** POST /api/huske/glimt-jobs {text, origin:"home_search"} → bakgrunnsjobb; samme rad og «Laget med Glimt» som fra Gjøremål. */
fun AppViewModel.huskeFromHome41(q: String, onJob: (Boolean) -> Unit) {
    launch41 {
        val r = try { JSONObject(api41 { hlPost("/huske/glimt-jobs", JSONObject().put("text", q).put("origin", "home_search")) }) } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) runCatching { JSONObject(api41 { request("POST", "/tasks/glimt", JSONObject().put("q", q).put("async", true).put("origin", "home_search"), prefix = Api.HOMELAB, read = 60_000) }) }.getOrNull() else null
        } catch (_: Exception) { null }
        if (r == null) { onJob(false); return@launch41 }
        if (r.s37("jobId") == null) r.s37("job_id")?.let { r.put("jobId", it) }
        if (r.s37("jobId") != null) { glimtAsync41(r, q); onJob(true) } else { refreshTasks37(); onJob(true) }
    }
}

/* ======================= Gjøremål-Glimt: lokal forhåndsdeling ======================= */

private val FILL42 = Regex("(?i)^(husk(e)?\\s+å|må\\s+huske\\s+å|jeg\\s+må(\\s+huske\\s+å)?|vi\\s+må|de\\s+må|må)\\s+")

private val REASON42 = Regex("(?i)\\s*,?\\s*\\b(siden|fordi|for at)\\b\\s+(.+)$")

/** Fjerner gjentatte ord («ha ha» → «ha») og fyllord i starten. */
private fun clean42(s: String): String {
    val w = s.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    val out = ArrayList<String>()
    for (x in w) if (out.isEmpty() || !out.last().equals(x, true)) out += x
    var t = out.joinToString(" ")
    repeat(3) { t = t.replace(FILL42, "") }
    return t.trim().trim(',', '.', ';')
}

/** «… siden vi skal ha med store ting opp til Toten» → notatet «Trengs til store ting opp til Toten» (tittelen uten begrunnelsen). */
fun reason42(s: String): String? = REASON42.find(s)?.groupValues?.get(2)?.trim()?.trim('.', ',')?.takeIf { it.split(' ').size >= 2 }?.let { r ->
    val x = r.replace(Regex("(?i)^(vi|jeg|de)\\s+(skal|må)\\s+(ha\\s+med\\s+)?"), "")
    "Trengs til " + x.replace(Regex("(?i)\\s+og\\s+da\\s+.*$"), "").trim()
}

fun stripReason42(s: String): String = REASON42.replace(s, "").trim()

/**
 * Deler en beskjed uten tegnsetting: grense ved gjentatt stedsnavn («… Strømstad Strømstad må …»), ved «og så» / «og husk»,
 * og ved «og» + verb («… brød og hent pakken …»). Fyllord fjernes. Gir minst to deler, ellers null.
 */
fun localSplit42(q: String): List<String>? {
    var t = q.trim()
    if (t.isEmpty()) return null
    // Gjentatt stort ord rett etter hverandre (stedsnavn) er en grense: «Strømstad Strømstad» → «Strømstad | …».
    t = t.replace(Regex("\\b([A-ZÆØÅ][\\wæøåÆØÅ-]{2,})\\s+\\1\\b"), "$1 ¦")
    t = t.replace(Regex("(?i)\\s+og\\s+(så|husk(e)?(\\s+å)?)\\s+"), " ¦ ")
    t = t.replace(Regex("(?i)\\s+og\\s+(?=(hent|kjøp|send|lever|ring|bestill|betal|kjør|pakk|ta med|vask|rydd|fiks|book|sjekk|bytt)\\b)"), " ¦ ")
    val parts = t.split('¦').map { clean42(it) }.filter { it.split(' ').size >= 2 }
    return parts.takeIf { it.size >= 2 }
}

/* ======================= Gjøremål: deloppgaver ======================= */

fun AppViewModel.addSub44(id: String, n: String) {
    val v = n.trim()
    if (v.isEmpty()) return
    Haptics.select()
    patchTask37(id) { it.copy(subs = it.subs + TaskSub37(v, false)) }
}

/** Huk av en deloppgave. Alle avkrysset → «Fullfør «X» også?». */
fun AppViewModel.toggleSub44(id: String, i: Int) {
    Haptics.select()
    patchTask37(id) { it.copy(subs = it.subs.mapIndexed { j, x -> if (j == i) x.copy(done = !x.done) else x }) }
    val t = tasks?.items?.firstOrNull { it.id == id } ?: return
    if (!t.done && t.subs.isNotEmpty() && t.subs.all { it.done }) p44.askDone = id
}

fun AppViewModel.delSub44(id: String, i: Int) { Haptics.dismiss(); patchTask37(id) { it.copy(subs = it.subs.filterIndexed { j, _ -> j != i }) } }

/** Fullfører hovedoppgaven; resten av deloppgavene krysses av. */
fun AppViewModel.completeTask44(id: String) {
    val t = tasks?.items?.firstOrNull { it.id == id } ?: return
    if (t.subs.any { !it.done }) patchTask37(id) { it.copy(subs = it.subs.map { s -> s.copy(done = true) }) }
    if (!t.done) toggleTask37(id)
}

/* ======================= Sted med forslag (Kartverket → OSM, via backend) ======================= */

data class Geo44(val label: String, val lat: Double, val lon: Double)

/** GET /api/geo/address?q= → [{label, street, postcode, city, lat, lon}]. Tom liste ved feil. */
suspend fun AppViewModel.geoSearch44(q: String): List<Geo44> {
    if (q.trim().length < 3) return emptyList()
    val raw = try { api44 { hlGet("/geo/address?q=" + enc44(q.trim())) } } catch (e: CancellationException) { throw e } catch (e: Exception) { return emptyList() }
    return arr43(raw, "items", "results", "addresses").mapNotNull { x ->
        val la = x.d43("lat") ?: return@mapNotNull null; val lo = x.d43("lon", "lng") ?: return@mapNotNull null
        Geo44(x.s43("label") ?: listOfNotNull(x.s43("street"), listOfNotNull(x.s43("postcode"), x.s43("city")).joinToString(" ").ifBlank { null }).joinToString(", "), la, lo)
    }
}

/** Oppgave med sted uten koordinater («Toten»): slås opp første gang siden åpnes og lagres. */
fun AppViewModel.ensureGeo44(t: TaskItem) {
    val pl = t.place?.takeIf { it.isNotBlank() && it !in listOf("store", "home", "leave", "work", "cabin") } ?: return
    if (t.geo != null) return
    launch44 { geoSearch44(pl).firstOrNull()?.let { g -> patchTask37(t.id) { it.copy(geo = g.lat to g.lon) } } }
}

fun AppViewModel.duplicateTask44(t: TaskItem) { addTask(t.title, t.list, t.due, t.assignee); flash("Duplisert «${t.title}»") }

data class TaskToast46(val id: String, val text: String, val undoDue: String?, val undoSubs: List<TaskSub37>?, val wasRep: Boolean)

/* ======================= Gjøremål: «Fullfør oppgaven» lukker infosiden ======================= */

/** Haken animeres, suksess-haptikk, og etter 450 ms lukkes infosiden. Uferdige deloppgaver: spør først. */
fun AppViewModel.finishFromPage46(id: String, confirmed: Boolean = false) {
    val t = tasks?.items?.firstOrNull { it.id == id } ?: return
    if (!confirmed && t.subs.any { !it.done }) { p46.askSubs = id; Haptics.tap(); return }
    p46.askSubs = null
    Haptics.success()
    p46.doneAnim = id
    launch46 {
        delay(450)
        val before = tasks?.items?.firstOrNull { it.id == id } ?: return@launch46
        val rep = before.rep != null
        if (rep) {
            val next = before.nextDue ?: nextDue37(before.due, before.rep) // Fase 5: serverens nextDue først
            patchTask37(id) { it.copy(due = next, nextDue = null, subs = it.subs.map { s -> s.copy(done = false) }) }
            showTaskToast46(TaskToast46(id, "Fullført · neste " + (next?.let { dueLabel37(it) } ?: "senere"), before.due, before.subs, true))
        } else {
            if (before.subs.any { !it.done }) patchTask37(id) { it.copy(subs = it.subs.map { s -> s.copy(done = true) }) }
            if (!before.done) toggleTask(id)
            showTaskToast46(TaskToast46(id, "Fullført: ${before.title}", null, before.subs, false))
        }
        if (p44.taskPage == id) p44.taskPage = null
        p46.doneAnim = null
    }
}

private fun AppViewModel.showTaskToast46(t: TaskToast46) {
    p46.toastJob?.cancel()
    p46.taskToast = t
    p46.toastJob = launchJob46 { delay(5_000); if (p46.taskToast === t) p46.taskToast = null }
}

/** «Angre» i toasten: oppgaven settes tilbake som ikke fullført (gjentakende: forrige dato og deloppgaver). */
fun AppViewModel.undoTaskToast46() {
    val t = p46.taskToast ?: return
    p46.taskToast = null
    Haptics.select()
    if (t.wasRep) patchTask37(t.id) { it.copy(due = t.undoDue, subs = t.undoSubs ?: it.subs) }
    else {
        val cur = tasks?.items?.firstOrNull { it.id == t.id } ?: return
        if (cur.done) toggleTask(t.id)
        t.undoSubs?.let { subs -> patchTask37(t.id) { it.copy(subs = subs) } }
    }
}

/* ---------------- Prompt 16–17: huskeliste, varsler, appnavn og -ikon, vær sammenlignet ---------------- */

/* ---------- Huskeliste (/api/tasks, delt i familien) ---------- */

data class TaskList(
    val id: String, val name: String, val color: Long,
    /** Prompt 21: eieren av listen (id og navn), personene den er delt med, og om listen er min (bare eieren kan dele og slette). */
    val owner: String? = null, val ownerName: String? = null, val members: List<TaskMember> = emptyList(), val mine: Boolean = true,
    /** Prompt 37: delt med andre (medlemmer) eller privat («Mine»). Null = eldre server (vet ikke). */
    val shared: Boolean? = null, val priv: Boolean? = null,
)

data class TaskItem(
    val id: String, val title: String, val list: String?, val due: String?, val assignee: String?,
    val done: Boolean, val doneAt: String?, val createdBy: String?,
    /** Prompt 37 (Gjøremål): detaljarket – notater, tid, viktig (alarm), gjenta, tidlig påminnelse, prioritet 0–3, flagg, tagger, deloppgaver og sted. */
    val notes: String? = null, val time: String? = null, val urgent: Boolean = false, val rep: String? = null, val early: String? = null,
    val prio: Int = 0, val flag: Boolean = false, val tags: List<String> = emptyList(), val subs: List<TaskSub37> = emptyList(), val place: String? = null,
    /** Prompt 40 (Gjøremål-Glimt): punktet skal gjøres etter punktet med denne id-en (after_id). */
    val after: String? = null,
    /** Prompt 44 (claude-code-gjoremal-infoside.md): frist (dl, siste dag) skilt fra dato/tid (due, time), og stedets koordinater (geo). */
    val dl: String? = null, val geo: Pair<Double, Double>? = null,
    /** Fase 5: neste forekomst fra serveren (nextDue) for en gjentagende oppgave. null på eldre server. */
    val nextDue: String? = null,
)

data class TaskMember(val id: String, val name: String, val color: Long? = null, val role: String? = null)

data class TasksData(val lists: List<TaskList>, val items: List<TaskItem>, val members: List<TaskMember>)

fun parseTasks(s: String): TasksData {
    val o = JSONObject(s)
    val la = o.optJSONArray("lists") ?: JSONArray()
    val lists = (0 until la.length()).mapNotNull { i ->
        val l = la.optJSONObject(i) ?: return@mapNotNull null
        parseTaskList(l)
    }
    val ia = o.optJSONArray("items") ?: JSONArray()
    val items = (0 until ia.length()).mapNotNull { i ->
        val t = ia.optJSONObject(i) ?: return@mapNotNull null
        // Prompt 37: kortnavnene fra Gjøremål-modellen (n, l, who, by) godtas også.
        TaskItem(
            t.optStr("id") ?: return@mapNotNull null, t.optStr("title") ?: t.optStr("n") ?: "", t.optStr("list") ?: t.optStr("l"), t.optStr("due")?.take(10),
            t.optStr("assignee") ?: t.optStr("who"), t.optBoolean("done", false), t.optStr("doneAt"), t.optStr("createdBy") ?: t.optStr("by"),
            notes = t.optStr("notes"), time = t.optStr("time")?.take(5) ?: t.optStr("due")?.takeIf { it.length >= 16 }?.substring(11, 16),
            urgent = t.optBoolean("urgent", false), rep = t.optStr("rep")?.takeIf { it != "none" && it != "never" && it != "aldri" }, early = t.optStr("early")?.takeIf { it != "none" },
            prio = prio37(t.opt("prio")), flag = t.optBoolean("flag", false), tags = strs37(t.optJSONArray("tags")), subs = subs37(t.optJSONArray("subs")),
            place = t.optStr("place") ?: t.optJSONObject("place")?.optStr("name"),
            after = t.optStr("after") ?: t.optStr("afterId") ?: t.optStr("after_id"),
            dl = (t.optStr("dl") ?: t.optStr("deadline"))?.take(10),
            nextDue = t.optStr("nextDue")?.take(10),
            geo = (t.optJSONObject("geo") ?: t.optJSONObject("place"))?.let { g -> val la = g.optDouble("lat"); val lo = g.optDouble("lon", g.optDouble("lng")); if (la.isNaN() || lo.isNaN()) null else la to lo },
        )
    }
    val ma = o.optJSONArray("members") ?: JSONArray()
    val members = (0 until ma.length()).mapNotNull { i ->
        val m = ma.optJSONObject(i) ?: return@mapNotNull null
        TaskMember(m.optStr("id") ?: m.optStr("userId") ?: return@mapNotNull null, m.optStr("name") ?: m.optStr("username") ?: "")
    }
    return TasksData(lists, items, members)
}

/** Én liste fra /api/tasks eller /api/tasks/lists, med eier og medlemmer når serveren sender dem (eldre server: min, ikke delt). */
fun parseTaskList(l: JSONObject): TaskList? {
    val id = l.optStr("id") ?: return null
    val ow = l.optJSONObject("owner")
    val owner = ow?.let { it.optStr("id") ?: it.optStr("userId") } ?: l.optStr("owner")
    val ownerName = ow?.let { it.optStr("name") ?: it.optStr("username") } ?: l.optStr("ownerName")
    val ma = l.optJSONArray("members") ?: JSONArray()
    val members = (0 until ma.length()).mapNotNull { i ->
        val m = ma.optJSONObject(i) ?: return@mapNotNull ma.optString(i).takeIf { it.isNotBlank() }?.let { TaskMember(it, "") }
        TaskMember(m.optStr("id") ?: m.optStr("userId") ?: return@mapNotNull null, m.optStr("name") ?: m.optStr("username") ?: "", parseHex(m.optStr("color")), m.optStr("role"))
    }
    // Prompt 37: ownerId; «mine» = eieren er meg (serveren sier det, ellers eldre server: min).
    val owner2 = owner ?: l.optStr("ownerId")
    val mine = if (l.has("mine") && !l.isNull("mine")) l.optBoolean("mine") else true
    val shared = if (l.has("shared") && !l.isNull("shared")) l.optBoolean("shared") else null
    val priv = if (l.has("private") && !l.isNull("private")) l.optBoolean("private") else null
    return TaskList(id, l.optStr("name") ?: "Liste", parseHex(l.optStr("color")) ?: 0xFF6B665C, owner2, ownerName, members, mine, shared, priv)
}

/** GET /api/tasks/lists → [..] eller {lists:[..]}. */
fun parseTaskLists(s: String): List<TaskList> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("lists") ?: JSONArray()
    return (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let(::parseTaskList) }
}

/** /api/users for vanlige brukere: bare id, navn og avatar. */
fun parseUserList(s: String): List<TaskMember> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("users") ?: it.optJSONArray("items") ?: JSONArray() }
    return (0 until a.length()).mapNotNull { i ->
        val u = a.optJSONObject(i) ?: return@mapNotNull null
        TaskMember(u.optStr("id") ?: u.optStr("userId") ?: return@mapNotNull null, u.optStr("name") ?: u.optStr("username") ?: "")
    }
}

/** Standardlistene (brukes før serveren har svart). */
val TASK_LISTS_DEFAULT = listOf(
    TaskList("hjem", "Hjem", 0xFF2F7A4F), TaskList("handel", "Handel", 0xFFB23A2A),
    TaskList("hytta", "Hytta", 0xFF2F5D8A), TaskList("jobb", "Jobb", 0xFF8A5A44),
)

private fun parseHex(s: String?): Long? {
    val h = s?.trim()?.removePrefix("#") ?: return null
    if (h.length != 6) return null
    return h.toLongOrNull(16)?.let { 0xFF000000 or it }
}

/* ---------- Huskeliste ↔ Home Assistant To-do ---------- */

data class HaEntity(val id: String, val name: String)

data class TasksHa(
    val enabled: Boolean, val status: String, val syncedAt: String?, val error: String?,
    val entities: List<HaEntity>, val maps: Map<String, String>,
)

fun parseTasksHa(s: String): TasksHa {
    val o = JSONObject(s)
    val ents = o.optJSONArray("entities")?.map { e -> HaEntity(e.optStr("entity_id") ?: e.optStr("id") ?: "", e.optStr("name") ?: e.optStr("entity_id") ?: "") }
        ?.filter { it.id.isNotBlank() } ?: emptyList()
    val maps = HashMap<String, String>()
    o.optJSONArray("maps")?.map { m -> (m.optStr("listId") ?: "") to (m.optStr("entityId") ?: "") }?.forEach { (l, e) -> if (l.isNotBlank() && e.isNotBlank()) maps[l] = e }
    return TasksHa(o.optBoolean("enabled"), o.optStr("status") ?: if (o.optBoolean("enabled")) "connecting" else "off", o.optStr("syncedAt"), o.optStr("error"), ents, maps)
}
