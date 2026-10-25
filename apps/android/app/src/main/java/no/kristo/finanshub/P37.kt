package no.kristo.finanshub

import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/*
 * Prompt 37 (ANDROID37), filer med «37» (P37.kt, ui/Ui37.kt, ui/Tasks37.kt, ui/Bible37.kt, widget/Bible37Widgets.kt, Alarms37.kt):
 *  - Wiggle på Hjem uten «bytte-storm»: bytt bare når fingeren står i midtre 30 % av naboen, maks én gang per 140 ms, bare state
 *    under dra (ingen disk/nett/sterk haptikk), lagres én gang ved slipp; auto-scroll nær topp/bunn (40 dp, maks 12 dp per bilde).
 *  - Pakker (h2) på Hjem: «Rediger widget» → «Vis bare når det er pakker» (på) og 1/2/3 pakker. Skjult uten aktive pakker, dempet i wiggle.
 *  - Onboarding med profil: GET /api/profiles, POST /api/onboarding/link {profileId | newProfileName, consents} (409 = koblet).
 *  - Gjøremål (tidligere Huskeliste): detaljark, personlige og delte lister (/api/tasks/lists), ✦ Glimt (POST /api/tasks/glimt + undo,
 *    POST /api/tasks/:id/split), Glimt-kort for like og forfalte, Viktig = alarm (setAlarmClock), tidlig påminnelse.
 *  - Sporing: husstandens nøkler (GET/PUT /api/tracking/keys), maskert, bare admin endrer. Pakker er private.
 *  - Subscription OS: prøveperioder øverst, wiggle på Oversikt (skjul/vis/tilbakestill), delte abonnementer (members, split, myShare).
 *  - Bibelvers (bare med modulen, standard sebastian): /api/bible/today|next|settings|stats|read, brief, Hjem, Bibel-side, widgets.
 *  - «Hvor er Ingrid?» i Hjem-søket: /api/assist (intent family.where), ellers lokalt fra Familie-posisjonene (bare de som deler).
 *  Alle nye endepunkter tåler 404 (eldre server): da brukes lokale reserver eller funksjonen skjules.
 */

internal val OSLO37: ZoneId = ZoneId.of("Europe/Oslo")

internal fun JSONObject.s37(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }
internal fun JSONObject.b37(k: String): Boolean? = if (!has(k) || isNull(k)) null else optBoolean(k)
internal fun JSONObject.d37(k: String): Double? = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }

internal fun strs37(a: JSONArray?): List<String> = (0 until (a?.length() ?: 0)).mapNotNull { i -> a!!.optString(i).takeIf { it.isNotBlank() && it != "null" } }

internal fun hex37(v: String?): Long? {
    val h = v?.trim()?.removePrefix("#") ?: return null
    return when (h.length) { 6 -> h.toLongOrNull(16)?.let { 0xFF000000L or it }; 8 -> h.toLongOrNull(16); else -> null }
}

fun hexOf37(c: Long): String = "#" + java.lang.Long.toHexString(c and 0xFFFFFFL).padStart(6, '0')

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

/** Neste forekomst for en gjentagende oppgave. */
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

/* ======================= Delte abonnementer ======================= */

data class SubMember37(val userId: String, val name: String, val color: Long?)

internal fun subMembers37(a: JSONArray?): List<SubMember37> = objs34(a).mapNotNull { m ->
    SubMember37(m.s37("userId") ?: m.s37("id") ?: return@mapNotNull null, m.s37("name") ?: m.s37("username") ?: "", hex37(m.s37("color")))
}

/* ======================= Glimt i Gjøremål ======================= */

data class GItem37(
    val id: String?, val title: String, val list: String?, val due: String?, val time: String?, val note: String?,
    /** Prompt 40: steg i rekkefølgen (1 = først), tittelen på punktet det kommer etter, sted, @person og tagger. */
    val step: Int = 0, val after: String? = null, val place: String? = null, val who: String? = null, val tags: List<String> = emptyList(),
)
data class TaskGlimt37(val kind: String, val text: String, val items: List<GItem37>, val undo: String?, val local: Boolean = false, val localIds: List<String> = emptyList())

data class Profile37(
    val id: String, val name: String, val color: Long, val avatar: String?, val userId: String?, val username: String?,
    val hasLoc: Boolean, val hasLists: Boolean, val hasSubs: Boolean, val suggested: Boolean,
    /** Koblet til en annen bruker (dempet: «Koblet til @sebastian»). */
    val other: Boolean = false,
)

data class TrkKey37(val id: String, val name: String, val set: Boolean, val tail: String?, val status: String, val addedBy: String?, val updatedAt: String?)
data class TrkKeys37(val providers: List<TrkKey37>, val used: Int?, val mine: Int?, val limit: Int?, val perUserPct: Int?, val admin: Boolean,
    /** Ferdige tekster fra serveren: «Du har brukt 3 av husstandens 20 oppslag …» og «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». */
    val quotaText: String? = null, val line: String? = null)

data class Verse37(val ref: String, val text: String, val period: String, val date: String?, val before: List<String>, val after: List<String>)
data class BibleSet37(val enabled: Boolean, val morning: Boolean = true, val evening: Boolean = true, val notify: Boolean = false, val translation: String = "1930")
/** Lokal Hjem-tilstand for dagens vers (per bruker og enhet, synkes ikke): lest i økt s, eller sveipet bort. */
data class BibleHome37(val d: String, val read: Boolean, val gone: Boolean, val s: Long)

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

private fun AppViewModel.acct37() = account?.id ?: ""

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

/* ---------- Pakker (h2): vis bare når det er pakker ---------- */

private fun AppViewModel.woptKey37() = "papir_wopt37_" + acct37()

fun AppViewModel.loadWopt37() {
    val s = p37
    val k = woptKey37()
    if (s.woptFor == k) return
    s.woptFor = k
    fun apply(o: JSONObject?) {
        val h2 = o?.optJSONObject("h2") ?: return
        s.h2Auto = h2.optBoolean("auto", true)
        s.h2N = h2.optInt("n", 1).coerceIn(1, 3)
    }
    apply(runCatching { JSONObject(prefs.str(k, "")) }.getOrNull())
    launch37 {
        val raw = runCatching { api37 { hlGet("/me/layout") } }.getOrNull() ?: return@launch37
        val w = runCatching { JSONObject(raw).optJSONObject("wopt") }.getOrNull() ?: return@launch37
        if (s.woptFor != k) return@launch37
        apply(w)
        prefs.set(k, w.toString())
    }
}

fun AppViewModel.setH2Opt37(auto: Boolean = p37.h2Auto, n: Int = p37.h2N) {
    val s = p37
    s.h2Auto = auto; s.h2N = n.coerceIn(1, 3)
    val w = JSONObject().put("h2", JSONObject().put("auto", s.h2Auto).put("n", s.h2N))
    prefs.set(woptKey37(), w.toString())
    launch37 { runCatching { api37 { hlPut("/me/layout", JSONObject().put("wopt", w)) } } }
}

/** Aktive pakker (status 1–3: registrert, på vei, klar for henting). null = ikke hentet ennå. */
fun AppViewModel.activePackages37(): Int? = if (tracking == null && homePackages == null) null else packagesOnWay

/** Med «vis bare når det er pakker» på og 0 aktive pakker skjules widgeten (utenfor redigeringsmodus). */
fun AppViewModel.h2Hidden37(): Boolean = p37.h2Auto && activePackages37() == 0

/* ======================= Onboarding: koble bruker til profil ======================= */

private fun parseProfiles37(raw: String): Triple<List<Profile37>, String?, Boolean> {
    val o = JSONObject(raw)
    val list = objs34(o.optJSONArray("profiles")).mapNotNull { p ->
        val id = p.s37("id") ?: return@mapNotNull null
        val has = p.optJSONObject("has")
        Profile37(id, p.s37("name") ?: "Profil", hex37(p.s37("color")) ?: 0xFF2B5D8A, p.s37("avatar"), p.s37("userId"), p.s37("username"),
            has?.optBoolean("location", false) ?: false, has?.optBoolean("lists", false) ?: false, has?.optBoolean("subs", false) ?: false, p.optBoolean("suggested", false),
            p.optBoolean("linkedToOther", false))
    }
    return Triple(list, o.optJSONObject("me")?.s37("profileId"), o.optBoolean("locked", false))
}

private fun AppViewModel.obDoneKey37() = "ob37_done_" + acct37()

/** Etter innlogging: ikke koblet (og ikke låst) → «Hvem er du?». Låst og admin har koblet → bare bekreft. 404 = eldre server, ingenting. */
fun AppViewModel.checkOnboard37() {
    val s = p37
    val k = acct37()
    if (k.isBlank() || s.obFor == k) return
    s.obFor = k
    if (prefs.bool(obDoneKey37())) return
    launch37 {
        val raw = try { api37 { hlGet("/profiles") } } catch (e: CancellationException) { throw e } catch (_: Exception) { return@launch37 }
        val (list, mine, locked) = runCatching { parseProfiles37(raw) }.getOrNull() ?: return@launch37
        s.profiles = list
        s.obLocked = locked
        s.obMine = mine
        if (mine != null && !locked) { prefs.set(obDoneKey37(), true); return@launch37 }
        if (mine == null && locked) return@launch37
        val me0 = (me?.username ?: account?.username ?: "").lowercase()
        s.obSel = mine ?: list.firstOrNull { it.suggested && it.userId == null }?.id
            ?: list.firstOrNull { it.userId == null && (it.name.lowercase() == me0 || it.name.lowercase().startsWith(me0) || me0.startsWith(it.name.lowercase().split(' ').first())) && me0.isNotBlank() }?.id
        s.obNew = false
        s.obStep = 1
        s.obErr = null
        s.obOpen = true
    }
}

fun AppViewModel.linkProfile37() {
    val s = p37
    if (s.obBusy) return
    s.obBusy = true
    s.obErr = null
    launch37 {
        try {
            if (s.obLocked && s.obMine != null) {
                s.obLinked = s.profiles.firstOrNull { it.id == s.obMine }
            } else {
                val body = JSONObject().put("consents", JSONObject().apply { s.obConsent.forEach { (k, v) -> put(k, v) } })
                if (s.obNew) body.put("newProfileName", s.obNewName.trim()) else body.put("profileId", s.obSel)
                val raw = api37 { hlPost("/onboarding/link", body) }
                val p = runCatching { JSONObject(raw).optJSONObject("profile") }.getOrNull()
                s.obLinked = p?.let { o -> Profile37(o.s37("id") ?: "", o.s37("name") ?: s.obNewName.trim(), hex37(o.s37("color")) ?: 0xFF3D7F8A, o.s37("avatar"), o.s37("userId"), o.s37("username"), false, false, false, false) }
                    ?: s.profiles.firstOrNull { it.id == s.obSel } ?: Profile37("ny", s.obNewName.trim().ifBlank { displayName }, 0xFF3D7F8A, null, null, null, false, false, false, false)
            }
            prefs.set(obDoneKey37(), true)
            Haptics.success()
            s.obStep = 3
            runCatching { reloadMe36() }
        } catch (e: ApiException) {
            s.obErr = when (e.status) {
                409 -> "Profilen er allerede koblet til en annen bruker. Velg en annen."
                404 -> "Serveren kan ikke koble profiler ennå. Prøv igjen etter neste oppdatering."
                else -> e.message ?: "Fikk ikke koblet profilen"
            }
            if (e.status == 409) { s.obStep = 1; runCatching { s.profiles = parseProfiles37(api37 { hlGet("/profiles") }).first } }
            Haptics.error()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.obErr = e.message ?: "Fikk ikke koblet profilen"
        } finally { s.obBusy = false }
    }
}

fun AppViewModel.closeOnboard37(skip: Boolean) {
    if (skip) prefs.set(obDoneKey37(), true)
    p37.obOpen = false
}

/* ======================= Husstanden og meg ======================= */

/** id fra /api/me og husstandens brukere (id, navn, farge). */
fun AppViewModel.loadUsers37(force: Boolean = false) {
    val s = p37
    val k = acct37()
    if (!force && s.usersFor == k) return
    s.usersFor = k
    launch37 {
        runCatching { JSONObject(api37 { hlGet("/me") }) }.getOrNull()?.let { o ->
            s.myId = o.s37("id") ?: o.s37("userId") ?: o.optJSONObject("user")?.s37("id")
        }
        val raw = runCatching { api37 { hlGet("/users") } }.getOrNull() ?: return@launch37
        val t = raw.trim()
        val a = runCatching { if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("users") ?: it.optJSONArray("items") ?: JSONArray() } }.getOrNull() ?: return@launch37
        s.users = objs34(a).mapNotNull { u ->
            TaskMember(u.s37("id") ?: u.s37("userId") ?: return@mapNotNull null, u.s37("name") ?: u.s37("username") ?: "", hex37(u.s37("color")), u.s37("role"))
        }
    }
}

fun firstName37(n: String) = n.trim().split(' ').firstOrNull().orEmpty()

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
            flash("Fikk ikke lagret: ${e.message ?: "ukjent feil"}")
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
        val next = nextDue37(it0.due, it0.rep)
        patchTask37(id) { it.copy(due = next, subs = it.subs.map { s -> s.copy(done = false) }) }
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
            s.glimt = TaskGlimt37("question", "Glimt fikk ikke svar: ${e.message ?: "ukjent feil"}. Prøv igjen, eller spør meg i Chat.", emptyList(), null)
            Haptics.error()
        } finally { s.glimtBusy = false }
    }
}

/** Angre gjelder i 10 s. */
private fun AppViewModel.armUndo37() {
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

/* ======================= Sporing: husstandens nøkler ======================= */

fun AppViewModel.loadTrkKeys37() {
    val s = p37
    launch37 {
        try {
            val o = JSONObject(api37 { hlGet("/tracking/keys") })
            val q = o.optJSONObject("quota")
            s.trk = TrkKeys37(objs34(o.optJSONArray("providers")).mapNotNull { p ->
                TrkKey37(p.s37("id") ?: return@mapNotNull null, p.s37("name") ?: p.s37("id")!!, p.optBoolean("set", false), p.s37("tail"), p.s37("status") ?: "missing",
                    p.optJSONObject("addedBy")?.s37("name") ?: p.opt("addedBy").let { it as? String }, p.s37("updatedAt"))
            }, q?.let { if (it.has("used")) it.optInt("used") else null }, q?.let { if (it.has("mine")) it.optInt("mine") else null },
                q?.let { if (it.has("limit")) it.optInt("limit") else null }, q?.let { if (it.has("perUserPct")) it.optInt("perUserPct") else null }, o.optBoolean("admin", userIsAdmin),
                q?.s37("text"), q?.s37("line"))
            s.trkMissing = false
        } catch (e: ApiException) { if (e.status == 404 || e.status == 405) s.trkMissing = true } catch (e: CancellationException) { throw e } catch (_: Exception) {}
    }
}

/** Admin: ny nøkkel (key) eller fjern (null). */
fun AppViewModel.putTrkKey37(id: String, key: String?) {
    val s = p37
    s.trkBusy = true
    launch37 {
        try {
            if (key == null) api37 { hlDelete("/tracking/keys/" + URLEncoder.encode(id, "UTF-8")) }
            else api37 { hlPut("/tracking/keys/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("key", key)) }
            s.trkEdit = null
            flash(if (key == null) "Nøkkelen er fjernet" else "Nøkkelen er lagret for hele husstanden")
            loadTrkKeys37()
        } catch (e: ApiException) {
            flash(if (e.status == 403) "Bare admin kan endre sporingsnøklene" else "Fikk ikke lagret: ${e.message}")
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke lagret") } finally { s.trkBusy = false }
    }
}

/** «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». */
fun AppViewModel.trkLine37(): String? {
    val k = p37.trk ?: return null
    k.line?.let { return it }
    val pa = k.providers.firstOrNull { it.id == "parcelsapp" && it.set } ?: k.providers.firstOrNull { it.set } ?: return null
    val left = if (k.limit != null && k.used != null) (k.limit - k.used).coerceAtLeast(0) else null
    return "Bruker husstandens ${pa.name}-nøkkel" + (left?.let { " · $it oppslag igjen" } ?: "")
}

/* ======================= Subscription OS ======================= */

private fun AppViewModel.subHidKey37() = "sub_home_hid37_" + acct37()

fun AppViewModel.loadSubHid37() {
    val s = p37
    val k = subHidKey37()
    if (s.subHidFor == k) return
    s.subHidFor = k
    s.subHid = prefs.str(k, "").split(',').filter { it.isNotBlank() }
    launch37 {
        val raw = runCatching { api37 { hlGet("/me/layout") } }.getOrNull() ?: return@launch37
        val a = runCatching { JSONObject(raw).optJSONArray("subHomeHid") }.getOrNull() ?: return@launch37
        if (s.subHidFor != k) return@launch37
        s.subHid = strs37(a)
        prefs.set(k, s.subHid.joinToString(","))
    }
}

fun AppViewModel.setSubHid37(l: List<String>) {
    val v = l.distinct()
    p37.subHid = v
    prefs.set(subHidKey37(), v.joinToString(","))
    launch37 { runCatching { api37 { hlPut("/me/layout", JSONObject().put("subHomeHid", JSONArray(v))) } } }
}

/** Del med husstanden: medlemmer (userId), lik deling eller «jeg betaler». */
fun AppViewModel.shareSub37(id: Int, members: List<String>, split: String, payerId: String?) {
    val s = p37
    s.subShareBusy = true
    launch37 {
        try {
            api37 { put("/subscriptions/$id/members", JSONObject().put("members", JSONArray(members)).put("split", split).put("payerId", payerId ?: JSONObject.NULL)) }
            loadSubs()
            Haptics.success()
        } catch (e: ApiException) {
            flash(when (e.status) { 404, 405 -> "Serveren kan ikke dele abonnementer ennå"; 403 -> "Bare eier og betaler kan endre delingen"; else -> "Fikk ikke delt: ${e.message}" })
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke delt") } finally { s.subShareBusy = false }
    }
}

fun AppViewModel.leaveSub37(id: Int) = launch37 {
    try { api37 { post("/subscriptions/$id/leave") }; loadSubs(); m23.subEditId = null; flash("Du har forlatt abonnementet") }
    catch (e: ApiException) { flash("Fikk ikke forlatt: ${e.message}") }
}

/** Din del per måned (lik deling = pris / antall; «jeg betaler» = hele hos betaleren, 0 hos de andre). */
fun AppViewModel.myShare37(s: SubItem): Double {
    s.myShare?.let { return it }
    if (!s.shared) return s.monthly
    return when (s.split) {
        "payer" -> if (s.payerId != null && s.payerId == p37.myId) s.monthly else 0.0
        else -> s.monthly / s.members.size.coerceAtLeast(1)
    }
}

/* ======================= Bibelvers ======================= */

/** Reserve (Bibelen 1930, fri bruk) når serveren ikke har /api/bible: ett vers per dag og periode, deterministisk. */
private val VERSES37 = listOf(
    Triple("Det er Herrens miskunn at det ikke er ute med oss; for hans barmhjertighet har ennu ikke ende; den er ny hver morgen, din trofasthet er stor.", "Klagesangene 3,22–23", "morning"),
    Triple("Dette er dagen som Herren har gjort; la oss fryde og glede oss på den!", "Salme 118,24", "morning"),
    Triple("Alt formår jeg i ham som gjør mig sterk.", "Filipperne 4,13", "morning"),
    Triple("Frykt ikke, for jeg er med dig; se dig ikke engstelig om, for jeg er din Gud; jeg styrker dig, ja, jeg hjelper dig.", "Jesaja 41,10", "morning"),
    Triple("Herren er min hyrde, jeg skal intet mangle.", "Salme 23,1", "morning"),
    Triple("I fred vil jeg både legge mig ned og sove; for du, Herre, du alene lar mig bo i trygghet.", "Salme 4,9", "evening"),
    Triple("Kom til mig, alle I som strever og har tungt å bære, og jeg vil gi eder hvile!", "Matteus 11,28", "evening"),
    Triple("Kast all eders bekymring på ham! for han har omsorg for eder.", "1. Peter 5,7", "evening"),
    Triple("For så har Gud elsket verden at han gav sin Sønn, den enbårne, forat hver den som tror på ham, ikke skal fortapes, men ha evig liv.", "Johannes 3,16", "evening"),
    Triple("Fred efterlater jeg eder, min fred gir jeg eder.", "Johannes 14,27", "evening"),
)

/** Morgen 05–17, ellers kveld (samme som serveren, så alle enheter viser samme vers). */
fun biblePeriod37(h: Int = LocalTime.now(OSLO37).hour): String = if (h in 5..16) "morning" else "evening"

fun localVerse37(period: String = biblePeriod37(), extra: Int = 0, date: LocalDate = LocalDate.now(OSLO37)): Verse37 {
    val l = VERSES37.filter { it.third == period }
    val v = l[Math.floorMod(date.dayOfYear + extra, l.size)]
    return Verse37(v.second, v.first, period, date.toString(), emptyList(), emptyList())
}

internal fun parseVerse37(o: JSONObject): Verse37? {
    val ref = o.s37("ref") ?: return null
    val ctx = o.optJSONObject("context")
    fun lines(a: JSONArray?): List<String> = (0 until (a?.length() ?: 0)).mapNotNull { i -> when (val x = a!!.opt(i)) { is JSONObject -> x.s37("text")?.let { t -> ((x.s37("v") ?: x.s37("ref"))?.let { "$it " } ?: "") + t }; is String -> x; else -> null } }
    return Verse37(ref, o.s37("text") ?: "", o.s37("period") ?: biblePeriod37(), o.s37("date"), lines(ctx?.optJSONArray("before")), lines(ctx?.optJSONArray("after")))
}

private fun AppViewModel.bibleKey37(k: String) = "bibel37_${k}_" + acct37()

/** Modulen er på (serveren sier enabled). 404 = eldre server: standard bare for brukeren sebastian, med lokale vers. */
fun AppViewModel.loadBible37(force: Boolean = false) {
    val s = p37
    val k = acct37()
    val now = System.currentTimeMillis()
    if (!force && s.bibleFor == k && now - s.bibleAt < 10 * 60_000 && s.verse?.period == biblePeriod37()) return
    if (s.bibleFor != k) { s.bibleOn = null; s.verse = null; loadBibleLocal37() }
    s.bibleFor = k
    s.bibleAt = now
    launch37 {
        try {
            val o = JSONObject(api37 { hlGet("/bible/today?period=" + biblePeriod37()) })
            val on = o.optBoolean("enabled", o.has("ref"))
            s.bibleOn = on
            s.bibleMissing = false
            s.verse = if (on) parseVerse37(o) ?: localVerse37() else null
            if (on) {
                runCatching { JSONObject(api37 { hlGet("/bible/settings") }) }.getOrNull()?.let { st ->
                    s.bibleSet = BibleSet37(st.optBoolean("enabled", true), st.optBoolean("morning", true), st.optBoolean("evening", true), st.optBoolean("notify", false), st.s37("translation") ?: "1930")
                    s.remind = s.bibleSet.notify
                }
                loadBibleStats37()
            }
        } catch (e: ApiException) {
            when (e.status) {
                403 -> { s.bibleOn = false; s.verse = null }
                404, 405 -> {
                    s.bibleMissing = true
                    val on = (me?.username ?: account?.username ?: "").equals("sebastian", true)
                    s.bibleOn = on
                    s.verse = if (on) localVerse37() else null
                    s.bibleSet = BibleSet37(on, notify = s.remind)
                }
            }
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            if (s.bibleOn == null) { val on = (me?.username ?: "").equals("sebastian", true); s.bibleOn = on; if (on) s.verse = localVerse37() }
        }
        Alarms37.bible(appCtx35, s.bibleOn == true && s.remind)
        no.kristo.finanshub.widget.Bible37Store.save(appCtx35, if (s.bibleOn == true) s.verse else null, s.bibleOn == true, acct37())
    }
}

fun AppViewModel.bibleAllowed37(): Boolean = p37.bibleOn == true

/** ↻ nytt vers bare for denne visningen. */
fun AppViewModel.nextVerse37() {
    val s = p37
    s.verseOff++
    val n = s.verseOff
    Haptics.select()
    launch37 {
        val v = if (s.bibleMissing) null else runCatching { parseVerse37(JSONObject(api37 { hlGet("/bible/next?offset=$n&period=" + biblePeriod37()) })) }.getOrNull()
        if (s.verseOff == n) s.verseAlt = v ?: localVerse37(extra = n)
    }
}

fun AppViewModel.shownVerse37(): Verse37? = if (p37.verseOff > 0) p37.verseAlt ?: p37.verse else p37.verse

fun AppViewModel.putBibleSet37(f: (BibleSet37) -> BibleSet37) {
    val s = p37
    val n = f(s.bibleSet)
    s.bibleSet = n
    s.remind = n.notify
    prefs.set(bibleKey37("remind"), n.notify)
    Alarms37.bible(appCtx35, n.notify && n.enabled)
    launch37 {
        runCatching { api37 { hlPut("/bible/settings", JSONObject().put("enabled", n.enabled).put("morning", n.morning).put("evening", n.evening).put("notify", n.notify).put("translation", n.translation)) } }
        runCatching { api37 { hlPut("/bible/reminder", JSONObject().put("on", n.notify)) } }
        if (!n.enabled) { s.bibleOn = false; no.kristo.finanshub.widget.Bible37Store.save(appCtx35, null, false, acct37()) }
    }
}

/* ---------- Hjem: lest / sveipet bort ---------- */

private fun today37() = LocalDate.now(OSLO37).toString()

private fun AppViewModel.loadBibleLocal37() {
    val s = p37
    s.bibleHome = runCatching { JSONObject(prefs.str(bibleKey37("home"), "")) }.getOrNull()?.let { BibleHome37(it.optString("d"), it.optBoolean("read"), it.optBoolean("gone"), it.optLong("s")) }
    s.readDays = prefs.str(bibleKey37("days"), "").split(',').filter { it.length == 10 }.toSet()
    s.best = prefs.int(bibleKey37("best"), 0)
    s.saved = runCatching { JSONArray(prefs.str(bibleKey37("saved"), "[]")).let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { (it.optString("ref")) to it.optString("text") } } } }.getOrDefault(emptyList())
    s.plan = prefs.str(bibleKey37("plan"), "joh")
    s.planDay = prefs.int(bibleKey37("pday"), 0)
    s.planDone = prefs.str(bibleKey37("pdone"), "").ifBlank { null }
    s.remind = prefs.bool(bibleKey37("remind"))
}

private fun AppViewModel.saveBibleHome37(h: BibleHome37) {
    p37.bibleHome = h
    prefs.set(bibleKey37("home"), JSONObject().put("d", h.d).put("read", h.read).put("gone", h.gone).put("s", h.s).toString())
}

/** Skjult på Hjem i dag: sveipet bort, eller lest i en tidligere økt. */
fun AppViewModel.bibleHomeHidden37(): Boolean {
    val h = p37.bibleHome ?: return false
    if (h.d != today37()) return false
    return h.gone || (h.read && h.s != p37.sess)
}

/** Verset står nederst i briefen resten av dagen når det er lest eller sveipet bort. */
fun AppViewModel.bibleAtBottom37(): Boolean { val h = p37.bibleHome ?: return false; return h.d == today37() && (h.gone || h.read) }

fun AppViewModel.bibleRead37() {
    val h = p37.bibleHome
    if (h?.d == today37() && h.read) return
    saveBibleHome37(BibleHome37(today37(), true, h?.takeIf { it.d == today37() }?.gone ?: false, p37.sess))
}

fun AppViewModel.bibleGone37() {
    val h = p37.bibleHome?.takeIf { it.d == today37() }
    saveBibleHome37(BibleHome37(today37(), h?.read ?: false, true, p37.sess))
}

/** Ny økt: appen kom fra bakgrunnen etter > 5 min. */
fun AppViewModel.appStopped37() { p37.bgAt = System.currentTimeMillis() }
fun AppViewModel.appStarted37() {
    val s = p37
    if (s.bgAt > 0 && System.currentTimeMillis() - s.bgAt > 5 * 60_000) s.sess = System.currentTimeMillis()
    s.bgAt = 0
}

/* ---------- Bibel-siden: rekke, leseplan, lagrede vers ---------- */

fun AppViewModel.loadBibleStats37() = launch37 {
    val s = p37
    val o = runCatching { JSONObject(api37 { hlGet("/bible/stats") }) }.getOrNull() ?: return@launch37
    val days = strs37(o.optJSONArray("readDays")).map { it.take(10) }.toSet()
    s.readDays = s.readDays + days
    s.best = maxOf(s.best, o.optInt("best", 0))
    o.optJSONObject("plan")?.let { p ->
        p.s37("id")?.let { s.plan = it }
        if (p.has("day")) s.planDay = p.optInt("day", s.planDay)
        p.s37("doneDate")?.let { s.planDone = it }
        if (p.optBoolean("doneToday", false)) s.planDone = LocalDate.now(OSLO37).toString()
    }
    if (o.has("saved")) s.saved = objs34(o.optJSONArray("saved")).mapNotNull { x -> x.s37("ref")?.let { it to (x.s37("text") ?: "") } }
    if (o.has("reminder") && !o.isNull("reminder")) s.remind = o.optBoolean("reminder", s.remind)
    persistBible37()
}

private fun AppViewModel.persistBible37() {
    val s = p37
    prefs.set(bibleKey37("days"), s.readDays.sorted().takeLast(800).joinToString(","))
    prefs.set(bibleKey37("best"), s.best)
    prefs.set(bibleKey37("saved"), JSONArray().apply { s.saved.forEach { (r, t) -> put(JSONObject().put("ref", r).put("text", t)) } }.toString())
    prefs.set(bibleKey37("plan"), s.plan)
    prefs.set(bibleKey37("pday"), s.planDay)
    prefs.set(bibleKey37("pdone"), s.planDone ?: "")
}

/** Rekken: dager på rad til og med i dag (eller i går, hvis dagens ikke er lest ennå). */
fun streak37(days: Set<String>, today: LocalDate = LocalDate.now(OSLO37)): Int {
    var d = if (today.toString() in days) today else today.minusDays(1)
    var n = 0
    while (d.toString() in days) { n++; d = d.minusDays(1) }
    return n
}

/** «Jeg har lest» eller «Ferdig» i leseplanen: teller i rekken. */
fun AppViewModel.markBibleRead37() {
    val s = p37
    val t = today37()
    if (t in s.readDays) return
    s.readDays = s.readDays + t
    s.best = maxOf(s.best, streak37(s.readDays))
    Haptics.success()
    persistBible37()
    bibleRead37()
    launch37 { runCatching { api37 { hlPost("/bible/read", JSONObject().put("date", t).put("period", biblePeriod37())) } } }
}

val PLANS37 = listOf(Triple("joh", "Johannes på 21 dager", 21), Triple("sal", "Salmene på 30 dager", 30), Triple("ord", "Ordspråkene på 31 dager", 31), Triple("mark", "Markus på 16 dager", 16))

/** «Johannes 8», «Salme 36–40» … og lenken på bibel.no. */
fun planChapter37(plan: String, day: Int): Pair<String, String> {
    val txt = when (plan) { "sal" -> "Salme ${day * 5 - 4}–${day * 5}"; "ord" -> "Ordspråkene $day"; "mark" -> "Markus $day"; else -> "Johannes $day" }
    return txt to "https://www.bibel.no/nettbibelen?parse=" + URLEncoder.encode(txt, "UTF-8")
}

fun AppViewModel.setPlan37(id: String) { val s = p37; if (s.plan == id) return; s.plan = id; s.planDay = 0; s.planDone = null; Haptics.select(); persistBible37(); syncPlan37() }

fun AppViewModel.planDoneToday37() {
    val s = p37
    if (s.planDone == today37()) return
    val total = PLANS37.firstOrNull { it.first == s.plan }?.third ?: 21
    s.planDay = (s.planDay + 1).coerceAtMost(total)
    s.planDone = today37()
    persistBible37()
    markBibleRead37()
    syncPlan37(done = true)
}

/** Leseplanen: PUT /api/bible/plan {plan}; «Ferdig» = POST /api/bible/plan/done (teller i rekken). */
private fun AppViewModel.syncPlan37(done: Boolean = false) = launch37 {
    val s = p37
    runCatching { api37 { if (done) hlPost("/bible/plan/done") else hlPut("/bible/plan", JSONObject().put("plan", s.plan)) } }
}

fun AppViewModel.toggleSaved37(v: Verse37) {
    val s = p37
    s.saved = if (s.saved.any { it.first == v.ref }) s.saved.filter { it.first != v.ref } else listOf(v.ref to v.text) + s.saved
    Haptics.select()
    persistBible37()
    syncSaved37()
}

private fun AppViewModel.syncSaved37() {
    val s = p37
    launch37 { runCatching { api37 { hlPut("/bible/saved", JSONObject().put("saved", JSONArray().apply { s.saved.forEach { (r, t) -> put(JSONObject().put("ref", r).put("text", t)) } })) } } }
}

fun AppViewModel.removeSaved37(ref: String) { p37.saved = p37.saved.filter { it.first != ref }; persistBible37(); syncSaved37() }

/** ✦ Forklar: Glimt (assist) gir 3–4 setninger, med lokal reserve. */
fun AppViewModel.explainVerse37(v: Verse37) {
    val s = p37
    if (s.explain != null) { s.explain = null; return }
    s.explain = "Glimt tenker …"
    launch37 {
        val srv = runCatching { JSONObject(api37 { hlPost("/bible/explain", JSONObject().put("ref", v.ref).put("text", v.text).put("period", v.period)) }).s37("text") }.getOrNull()
        val q = "Forklar kort (3–4 setninger, norsk bokmål) sammenhengen og betydningen av bibelverset ${v.ref}: «${v.text}»"
        val r = if (srv != null) null else runCatching { assist31(q, "bible") }.getOrNull()
        s.explain = srv ?: r?.text?.takeIf { it.isNotBlank() }
            ?: "«${v.ref}»: verset handler om å stole på Gud i hverdagen. Les gjerne versene rundt for sammenhengen, og tenk over hva det betyr for deg i dag."
    }
}

/* ======================= «Hvor er Ingrid?» ======================= */

private val WHERE37 = listOf(
    Regex("^\\s*(?:hvor|kor|hvorhen)\\s+(?:er|befinner|holder)\\s+(?:seg\\s+)?([A-Za-zÆØÅæøåÉé][\\wÆØÅæøåÉé-]*)(?:\\s+(?:seg|nå|akkurat nå))?\\s*\\??\\s*$", RegexOption.IGNORE_CASE),
    Regex("^\\s*(?:hvor|kor)\\s+(?:befinner|holder)\\s+([A-Za-zÆØÅæøåÉé][\\wÆØÅæøåÉé-]*)\\s+seg", RegexOption.IGNORE_CASE),
    Regex("^\\s*posisjonen\\s+til\\s+([A-Za-zÆØÅæøåÉé][\\wÆØÅæøåÉé-]*)", RegexOption.IGNORE_CASE),
    Regex("^\\s*where\\s+is\\s+([A-Za-z][\\w-]*)", RegexOption.IGNORE_CASE),
    Regex("^\\s*er\\s+([A-ZÆØÅ][\\wæøå-]*)\\s+(?:på|hos|hjemme|i)\\b", RegexOption.IGNORE_CASE),
)

private val WHERE_STOP37 = setOf("det", "den", "de", "neste", "min", "mitt", "mine", "nærmeste", "butikken", "bilen", "du", "vi", "dere", "han", "hun", "noen", "alle",
    "været", "toalettet", "do", "nøklene", "telefonen", "mobilen", "pakken", "pakkene", "the", "my")

/** Navnet i «hvor er Ingrid» (eller «jeg»), ellers null. */
fun whereWho37(q: String): String? {
    for (r in WHERE37) r.find(q.trim())?.let { m -> val n = m.groupValues[1]; if (n.lowercase() !in WHERE_STOP37) return n }
    return null
}

private fun ago37(ts: String?): Long? = ts?.let { runCatching { (System.currentTimeMillis() - java.time.Instant.parse(it).toEpochMilli()) / 60_000 }.getOrNull() }

private fun agoText37(min: Long): String = when { min < 1 -> "nå nettopp"; min < 60 -> "$min min siden"; min < 60 * 24 -> "${min / 60} t siden"; else -> "${min / 1440} d siden" }

private fun dist37(a: FamPos, lat: Double, lon: Double): Double {
    val r = 6371.0
    val dLat = Math.toRadians(lat - a.lat); val dLon = Math.toRadians(lon - a.lon)
    val x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(a.lat)) * Math.cos(Math.toRadians(lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/** Hjem-søket: «hvor er Ingrid» svarer med posisjonen (serveren først, så Familie lokalt). true = tatt. */
fun AppViewModel.askWhere37(q: String): Boolean {
    val who = whereWho37(q) ?: return false
    val s = p31
    val seq = ++s.ansSeq
    s.ans = HomeAns31(q, busy = true)
    Haptics.tap()
    launch37 {
        val r = runCatching { assist31(q, "search") }.getOrNull()
        if (s.ansSeq != seq) return@launch37
        if (r != null && r.intent == "family.where") {
            val person = r.open?.s37("person") ?: r.card?.s37("person") ?: r.card?.optJSONObject("person")?.s37("userId")
            s.ans = HomeAns31(q, false, r.text, "Familie · posisjon", famPerson37 = person ?: who)
            Haptics.success()
            return@launch37
        }
        if (family == null) runCatching { openFamilyData37() }
        if (s.ansSeq != seq) return@launch37
        val f = family
        val known = who.lowercase() in setOf("jeg", "meg", "i") || f?.members?.any { firstName37(it.name).equals(who, true) || it.username.equals(who, true) || it.name.equals(who, true) } == true
        // Ikke en person i Familie («hvor er kalenderen»): vis Glimt-svaret som vanlig.
        if (!known && r != null && r.text.isNotBlank()) { s.ans = HomeAns31(q, false, r.text, r.source, r.jobId, wxGeo = geoOfOpen35(r.open)); return@launch37 }
        val txt = whereLocal37(who)
        s.ans = HomeAns31(q, false, txt.first, "Familie · posisjon", famPerson37 = txt.second)
    }
    return true
}

/** Svar fra Familie-dataene: sone, ellers sted; alder, batteri og avstand. Bare personer som deler med deg. */
fun AppViewModel.whereLocal37(who: String): Pair<String, String?> {
    val f = family ?: return "Fant ikke Familie-posisjonene akkurat nå. Åpne Familie for å se kartet." to null
    val meId = f.me?.userId
    val selfQ = who.lowercase() in setOf("jeg", "meg", "i")
    val m = if (selfQ) f.members.firstOrNull { it.userId == meId } else f.members.firstOrNull { firstName37(it.name).equals(who, true) || it.username.equals(who, true) || it.name.equals(who, true) }
    if (m == null) {
        val sharing = f.members.filter { it.userId != meId && it.last != null }.map { firstName37(it.name) }
        val list = when (sharing.size) { 0 -> "ingen"; 1 -> sharing[0]; else -> sharing.dropLast(1).joinToString(", ") + " og " + sharing.last() }
        return "Jeg finner ikke $who i Familie. Personer med deling: $list." to null
    }
    val name = if (selfQ) "Du" else firstName37(m.name)
    val pos = m.last ?: return "$name deler ikke posisjon med deg." to null
    val zone = f.zones.firstOrNull { z -> dist37(pos, z.lat, z.lon) * 1000 <= z.radius }
    val place = zone?.name?.let { z -> if (z.equals("Hjem", true)) "hjemme" else "på $z" } ?: pos.place?.let { "ved $it" } ?: "ved %.4f, %.4f".format(pos.lat, pos.lon)
    val act = when (pos.activity) { "walking", "on_foot" -> "på vei til fots "; "cycling", "on_bicycle" -> "på sykkel "; "driving", "in_vehicle", "automotive" -> "i bil "; else -> "" }
    val mine = f.members.firstOrNull { it.userId == meId }?.last
    val km = if (mine != null && !selfQ) dist37(pos, mine.lat, mine.lon) else null
    val age = ago37(pos.ts)
    val extra = listOfNotNull(pos.place?.takeIf { zone != null }, km?.let { if (it < 1) "${Math.round(it * 1000)} m fra deg" else "%.1f km fra deg".format(it).replace('.', ',') }).joinToString(", ")
    val head = if (age != null && age > 60) "$name ble sist sett for ${agoText37(age).removeSuffix(" siden")} siden $place" else "**$name** er **$act$place**"
    val tail = listOfNotNull(age?.takeIf { it <= 60 }?.let { "Oppdatert ${agoText37(it)}" }, pos.battery?.let { "batteri $it %" }).joinToString(" · ")
    val verb = if (selfQ && age != null && age <= 60) "**Du** er **$act$place**" else head
    return (verb + (if (extra.isNotEmpty()) " ($extra)" else "") + "." + (if (tail.isNotEmpty()) " $tail." else "")) to m.userId
}

/** Familie-dataene uten å åpne siden. */
private suspend fun AppViewModel.openFamilyData37() { loadFamily37() }

fun AppViewModel.openWhere37(person: String?) {
    closeAns31()
    openFamily()
    if (person != null) launch37 {
        delay(400)
        family?.members?.firstOrNull { it.userId == person || firstName37(it.name).equals(person, true) }?.let { famSelect(it.userId) }
    }
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

/* ======================= Konto → Profil ======================= */

var profilesMissing37 = false

/** Profilene og min kobling (Konto → Profil). */
fun AppViewModel.loadProfiles37() = launch37 {
    val s = p37
    try {
        val (list, mine, locked) = parseProfiles37(api37 { hlGet("/profiles") })
        s.profiles = list; s.obMine = mine; s.obLocked = locked
        profilesMissing37 = false
    } catch (e: ApiException) { if (e.status == 404 || e.status == 405) profilesMissing37 = true } catch (e: CancellationException) { throw e } catch (_: Exception) {}
}

/** Åpner «Hvem er du?» igjen (ikke koblet ennå). */
fun AppViewModel.reopenOnboard37() {
    prefs.set("ob37_done_" + (account?.id ?: ""), false)
    p37.obFor = null
    checkOnboard37()
}

/* ======================= Glimt-kortene fra serveren ======================= */

/** Et Glimt-kort i listen (GET /api/tasks/glimt/cards): like, forfalte, butikk, pakkeliste. actions = (action, label, eventId). */
data class GCard37(val key: String, val kind: String, val text: String, val list: String?, val ids: List<String>, val actions: List<Triple<String, String, String?>>)

/** null = eldre server (lokale kort brukes). */
fun AppViewModel.loadCards37(list: String?) = launch37 {
    val s = p37
    try {
        val o = JSONObject(api37 { hlGet("/tasks/glimt/cards" + (list?.takeIf { it != "alle" }?.let { "?list=" + URLEncoder.encode(it, "UTF-8") } ?: "")) })
        s.cards = objs34(o.optJSONArray("cards")).mapNotNull { c ->
            GCard37(c.s37("key") ?: return@mapNotNull null, c.s37("kind") ?: "", c.s37("text") ?: "", c.optJSONObject("list")?.s37("id"), strs37(c.optJSONArray("ids")),
                objs34(c.optJSONArray("actions")).mapNotNull { a -> a.s37("action")?.let { Triple(it, a.s37("label") ?: it, a.s37("eventId")) } })
        }
    } catch (e: ApiException) { if (e.status == 404 || e.status == 405) s.cards = null } catch (e: CancellationException) { throw e } catch (_: Exception) {}
}

/** Knappene på kortene: «Ikke nå» skjuler kortet for godt (per hendelse); resten kjøres av Glimt (med Angre). */
fun AppViewModel.cardAct37(c: GCard37, action: String, eventId: String?) {
    val s = p37
    s.cards = s.cards?.filter { it.key != c.key }
    if (action == "dismiss") {
        Haptics.select()
        launch37 { runCatching { api37 { hlPost("/tasks/glimt/cards/dismiss", JSONObject().put("key", c.key)) } } }
        return
    }
    Haptics.tap()
    launch37 {
        try {
            val body = JSONObject().put("action", action).put("q", "").put("ids", JSONArray(c.ids))
            (c.list ?: taskFilter.takeIf { it != "alle" && it != "arkiv" })?.let { body.put("list", it) }
            eventId?.let { body.put("eventId", it) }
            val r = JSONObject(api37 { request("POST", "/tasks/glimt", body, prefix = Api.HOMELAB, read = 60_000) })
            s.glimt = TaskGlimt37(r.s37("kind") ?: "action", r.s37("text") ?: "", objs34(r.optJSONArray("items")).map { x ->
                GItem37(x.s37("id"), x.s37("title") ?: x.s37("n") ?: "", x.s37("list") ?: x.s37("l"), x.s37("due"), x.s37("time"), null)
            }, r.optJSONObject("undo")?.s37("token"))
            s.glimtOpen = true
            Haptics.success()
            armUndo37()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Glimt fikk ikke gjort det: ${e.message}") }
        refreshTasks37()
        loadCards37(taskFilter)
    }
}
