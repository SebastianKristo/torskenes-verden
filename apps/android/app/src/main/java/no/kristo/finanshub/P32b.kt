package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/*
 * Prompt 32 (ANDROID32), filer med «32b» (prefikset 32 er brukt av AppUpdate32):
 *  - «Rediger fanelinjen» også for Domener, Abonnement og Familie (claude-code-fanelinje-alle-sider.md): papir_nav_dom/abo/kart
 *    lokalt per bruker, og layout.secNav {dom|abo|kart: [{k, n?, ic?}] | null} på serveren.
 *  - Søkefeltet på Hjem (claude-code-sok-fullfor-forst.md): snarveier lokalt først, Glimt i boblen, og etter hs_timeout_s
 *    (5/8/15/30 s, standard 8) flyttes jobben til Chat (POST /api/assist/:id/handoff → {chatId}).
 *  - Søkehistorikk (claude-code-sokehistorikk-synk.md): mobilen logger søk (POST /api/search/history {q, engine, device:'mobil'}),
 *    men viser ikke «Nylige søk». Passord, kortnummer og personnummer logges aldri.
 *  - Huskeliste: Arkivert (GET /api/tasks?archived=1, PATCH /api/tasks/:id {archived}).
 *  - Kalender: «Beskriv med Glimt» (POST /api/kalender/describe {text}) og Spør Glimt i søket (lokalt først,
 *    ellers GET /api/kalender/search?q=&ai=1).
 *  - Prøveperioder: start for fremdriften (Hjem-widgeten h11) og widgetdataene (widget/Trials32bWidgets.kt).
 */

/* ---------------- Tilstand ---------------- */

/** Én fane i en side-fanelinje: nøkkel, eget navn og eget ikon (tegn). */
data class SecTab32b(val k: String, val n: String? = null, val ic: String? = null)

/** Svarkortet «GLIMT» i kalendersøket. */
data class KalAsk32b(val q: String, val busy: Boolean, val text: String = "", val items: List<Kal26Ev> = emptyList(), val ok: Boolean = false)

class P32bState {
    /* Fanelinjer på Domener (dom), Abonnement (abo) og Familie (kart) */
    var secNav by mutableStateOf<Map<String, List<SecTab32b>>>(emptyMap())
    internal var secNavFor: String? = null
    /** Arket «Rediger fanelinjen» for en side (dom | abo | kart), ellers null. */
    var secEdit by mutableStateOf<String?>(null)
    /* Glimt i søkefeltet */
    var hsTimeout by mutableStateOf(8)
    var searchHist by mutableStateOf(true)
    /* Finans → Mer i redigeringsmodus (klipping under ＋/✓) */
    var fmEdit by mutableStateOf(false)
    /* Vær: Forhold-visning (temp | rain | wind), huskes i økten */
    var wxMode by mutableStateOf("temp")
    /* Huskeliste: Arkivert */
    var taskArch by mutableStateOf(false)
    var archived by mutableStateOf<List<TaskItem>?>(null)
    var archBusy by mutableStateOf(false)
    var archClearArm by mutableStateOf(false)
    /* Kalender: Beskriv med Glimt */
    var kAi by mutableStateOf("")
    var kAiBusy by mutableStateOf(false)
    var kAiNote by mutableStateOf("")
    var kAiErr by mutableStateOf("")
    /* Kalender: søket */
    var kFilter by mutableStateOf("alle")
    var kAsk by mutableStateOf<KalAsk32b?>(null)
    internal var kAskSeq = 0
    /* Prøveperioder: startdato per prøve (fremdriften), fra serverens created/start */
    var trialStart by mutableStateOf<Map<String, LocalDate>>(emptyMap())
}

/* ---------------- Fanelinjer på andre sider ---------------- */

/** Sidene med egen fanelinje: overskrift og alle faner (nøkkel, navn, ikon). */
val SEC32B: Map<String, Pair<String, List<Triple<String, String, String>>>> = mapOf(
    "dom" to ("Domener" to listOf(Triple("oversikt", "Oversikt", "◎"), Triple("publikum", "Publikum", "◍"), Triple("ytelse", "Ytelse", "⚡"), Triple("infra", "Infra", "▤"))),
    "abo" to ("Abonnement" to listOf(Triple("home", "Hjem", "⌂"), Triple("ins", "Innsikt", "◔"), Triple("hist", "Historikk", "↻"))),
    "kart" to ("Familie" to listOf(Triple("kart", "Kart", "◎"), Triple("soner", "Soner", "◌"), Triple("helse", "Helse", "♡"))),
)

private fun AppViewModel.secKey32b(sec: String) = "papir_nav_${sec}_" + (account?.id ?: "")

private fun secParse32b(sec: String, a: JSONArray?): List<SecTab32b>? {
    if (a == null) return null
    val all = SEC32B[sec]?.second ?: return null
    val out = ArrayList<SecTab32b>()
    for (i in 0 until a.length()) {
        val x = a.opt(i)
        val o = x as? JSONObject
        val k = o?.optStr("k") ?: o?.optStr("key") ?: (x as? String) ?: continue
        if (all.none { it.first == k } || out.any { it.k == k }) continue
        val ic = o?.optStr("ic")?.let { r -> if (glyphOk32b(r)) r else iconNameGlyph25(r) ?: r }
        out += SecTab32b(k, o?.optStr("n")?.take(18), ic)
    }
    return out.takeIf { it.isNotEmpty() }
}

/** Tegnet er et av appens fane-ikoner (ellers et SF Symbol-navn fra iOS/web). */
private fun glyphOk32b(s: String): Boolean = s.length <= 2

private fun secJson32b(l: List<SecTab32b>): JSONArray = JSONArray().apply {
    l.forEach { t -> put(JSONObject().put("k", t.k).apply { t.n?.let { put("n", it) }; t.ic?.let { put("ic", it) } }) }
}

/** Lagret oppsett (lokalt per bruker) lastes én gang per konto. */
private fun AppViewModel.ensureSecNav32b() {
    val s = p32b
    val acct = account?.id
    if (s.secNavFor == acct) return
    s.secNavFor = acct
    val m = HashMap<String, List<SecTab32b>>()
    SEC32B.keys.forEach { sec ->
        prefs.str(secKey32b(sec), "").takeIf { it.isNotBlank() }?.let { raw -> secParse32b(sec, runCatching { JSONArray(raw) }.getOrNull())?.let { m[sec] = it } }
    }
    s.secNav = m
}

/** Fanene som vises for en side: (nøkkel, navn, ikon) i valgt rekkefølge. */
fun AppViewModel.secTabs32b(sec: String): List<Triple<String, String, String>> {
    ensureSecNav32b()
    val all = SEC32B[sec]?.second ?: return emptyList()
    val saved = p32b.secNav[sec] ?: return all
    val l = saved.mapNotNull { t -> all.firstOrNull { it.first == t.k }?.let { d -> Triple(d.first, t.n?.takeIf { it.isNotBlank() } ?: d.second, t.ic?.takeIf { it.isNotBlank() } ?: d.third) } }
    return l.ifEmpty { all }
}

/** Lagrer en sides fanelinje (minst én fane). Navn og ikon som er lik standard lagres ikke. */
fun AppViewModel.saveSecNav32b(sec: String, items: List<Triple<String, String, String>>) {
    val all = SEC32B[sec]?.second ?: return
    val l = items.distinctBy { it.first }.filter { t -> all.any { it.first == t.first } }
    if (l.isEmpty()) return
    val tabs = l.map { (k, n, ic) ->
        val d = all.first { it.first == k }
        SecTab32b(k, n.trim().takeIf { it.isNotEmpty() && it != d.second }, ic.takeIf { it != d.third })
    }
    ensureSecNav32b()
    p32b.secNav = p32b.secNav + (sec to tabs)
    prefs.set(secKey32b(sec), secJson32b(tabs).toString())
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("secNav", JSONObject().put(sec, secJson32b(tabs)))) } } }
}

/** «Tilbakestill»: sletter nøkkelen. */
fun AppViewModel.resetSecNav32b(sec: String) {
    ensureSecNav32b()
    p32b.secNav = p32b.secNav - sec
    prefs.set(secKey32b(sec), "")
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("secNav", JSONObject().put(sec, JSONObject.NULL))) } } }
}

/** Fra GET /api/me/layout: secNav, hs_timeout_s og search_history. */
fun AppViewModel.applyLayout32b(raw: String) {
    val o0 = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val o = o0.optJSONObject("layout") ?: o0
    if (o.has("hs_timeout_s")) o.optInt("hs_timeout_s", 8).takeIf { it in HS_TIMEOUTS32B }?.let { p32b.hsTimeout = it; prefs.set("hs_timeout32b_" + (account?.id ?: ""), "$it") }
    if (o.has("search_history") && !o.isNull("search_history")) p32b.searchHist = o.optBoolean("search_history", true)
    val sn = o.optJSONObject("secNav") ?: return
    ensureSecNav32b()
    var m = p32b.secNav
    SEC32B.keys.forEach { sec ->
        if (!sn.has(sec)) return@forEach
        val l = if (sn.isNull(sec)) null else secParse32b(sec, sn.optJSONArray(sec))
        m = if (l == null) m - sec else m + (sec to l)
        prefs.set(secKey32b(sec), l?.let { secJson32b(it).toString() } ?: "")
    }
    p32b.secNav = m
}

/* ---------------- Glimt i søkefeltet ---------------- */

val HS_TIMEOUTS32B = listOf(5, 8, 15, 30)

fun AppViewModel.loadHsTimeout32b() {
    prefs.str("hs_timeout32b_" + (account?.id ?: ""), "").toIntOrNull()?.takeIf { it in HS_TIMEOUTS32B }?.let { p32b.hsTimeout = it }
}

/** «Send til Chat etter»: 5 → 8 → 15 → 30 → 5 s. */
fun AppViewModel.nextHsTimeout32b() {
    val cur = p32b.hsTimeout
    val nx = HS_TIMEOUTS32B[(HS_TIMEOUTS32B.indexOf(cur).coerceAtLeast(0) + 1) % HS_TIMEOUTS32B.size]
    p32b.hsTimeout = nx
    prefs.set("hs_timeout32b_" + (account?.id ?: ""), "$nx")
    Haptics.select()
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("hs_timeout_s", nx)) } } }
}

fun AppViewModel.setSearchHist32b(on: Boolean) {
    p32b.searchHist = on
    Haptics.select()
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("search_history", on)) } } }
}

private val SENSITIVE32B = listOf(
    Regex("\\b(?:\\d[ -]?){13,19}\\b"),            // kortnummer
    Regex("\\b\\d{6}\\s?\\d{5}\\b"),                // personnummer
    Regex("(passord|password|pinkode|pin-kode|\\bpin\\b|engangskode|bankid)", RegexOption.IGNORE_CASE),
)

/** Logger et søk fra mobilen (alle motorer). Vises bare i «Nylige søk» på web. */
fun AppViewModel.logSearch32b(q: String, engine: String) {
    val t = q.trim().take(300)
    if (t.isEmpty() || !p32b.searchHist) return
    if (SENSITIVE32B.any { it.containsMatchIn(t) }) return
    launch32b { runCatching { api32b { hlPost("/search/history", JSONObject().put("q", t).put("engine", engine).put("device", "mobil")) } } }
}

/** Snarveiene i fasiten (NAV i hsAsk): mønster, side og navn i boblen. */
private val NAV32B: List<Triple<Regex, String, String>> = listOf(
    Triple(Regex("oppdater|nordlys|ny versjon|versjon"), "nordlys", "Nordlys OS · oppdatering"),
    Triple(Regex("kalender|timeplan"), "kalender", "Kalender"),
    Triple(Regex("v(æ|ae)ret? (side|app)|værside|åpne vær"), "vaer", "Vær"),
    Triple(Regex("innstilling"), "innst", "Innstillinger"),
    Triple(Regex("pakke|sporing|sending"), "sporing", "Sporing"),
    Triple(Regex("budsjett"), "budsjett", "Budsjett"),
    Triple(Regex("kvittering"), "kvitt", "Kvitteringer"),
    Triple(Regex("finans|økonomi|saldo|konto"), "finans", "Finans"),
    Triple(Regex("abonnement|prøveperiode"), "abo", "Abonnement"),
    Triple(Regex("domene"), "domener", "Domener"),
    Triple(Regex("familie|posisjon|hvor er"), "kart", "Familie"),
    Triple(Regex("middag|matplan|oppskrift|\\bmat\\b"), "mat", "Mat"),
    Triple(Regex("gjøremål|to-do|todo|huskeliste|handleliste"), "huske", "Gjøremål"),
    Triple(Regex("bursdag"), "bursdag", "Bursdager"),
    Triple(Regex("\\bchat\\b"), "chat", "Chat"),
)
private val NAV_LEAD32B = Regex("^(vis( meg)?|åpne|gå til|ta meg til|hvor (er|finner jeg)|finn)\\b")

/** Treff på en side-snarvei: (navn, side). Bare for «vis meg / åpne / gå til …» eller 1–2 ord. */
fun navShortcut32b(q: String): Pair<String, String>? {
    val n = q.trim().lowercase()
    if (!NAV_LEAD32B.containsMatchIn(n) && n.split(Regex("\\s+")).size > 2) return null
    // «finn neste frisørtime» og «hvor er neste prøve» er spørsmål til Glimt, ikke snarveier.
    if (Regex("\\bneste\\b|\\bnår\\b").containsMatchIn(n)) return null
    val hit = NAV32B.firstOrNull { it.first.containsMatchIn(n) } ?: return null
    return hit.third to hit.second
}

/** Åpner siden for en snarvei. */
fun AppViewModel.openShortcut32b(page: String) {
    when (page) {
        "nordlys" -> openNordlys31()
        "kalender" -> if (!openKalApp33(list = true)) openKal26(native = false) // prompt 33: «Åpne kalender» → kalender://liste
        "vaer" -> openWeather()
        "innst" -> openPaperPage("set")
        "sporing" -> deepLink(Uri.parse("finanshub://tracking"))
        "budsjett" -> deepLink(Uri.parse("finanshub://budget"))
        "kvitt" -> deepLink(Uri.parse("finanshub://review"))
        "finans" -> deepLink(Uri.parse("finanshub://finance"))
        "abo" -> openFromMer(Screen.Sub)
        "domener" -> deepLink(Uri.parse("finanshub://domains"))
        "kart" -> openFamily()
        "mat" -> deepLink(Uri.parse("finanshub://mat"))
        "huske" -> openTasks()
        "bursdag" -> deepLink(Uri.parse("finanshub://bursdager"))
        "chat" -> openChat()
    }
}

/**
 * ↵ i søkefeltet med Glimt (erstatter askHome31): snarvei → side etter 0,45 s; ellers Glimt i boblen.
 * Tar svaret lengre tid enn hs_timeout_s (eller Glimt svarer ikke), flyttes jobben til Chat (handoff) etter 0,7 s.
 */
fun AppViewModel.askHome32b(q: String) {
    val s = p31
    val t = q.trim()
    if (t.isEmpty()) return
    logSearch32b(t, "glimt")
    // Prompt 37: «hvor er Ingrid» svarer med posisjonen (før snarveien «hvor er → Familie»).
    if (askWhere37(t)) return
    navShortcut32b(t)?.let { (label, page) ->
        val seq = ++s.ansSeq
        s.ans = HomeAns31(t, busy = false, text = "Åpner **$label**.", source = "Snarvei")
        Haptics.tap()
        launch32b {
            delay(450)
            if (s.ansSeq == seq) { closeAns31(); openShortcut32b(page) }
        }
        return
    }
    // Prompt 36: dagslys/sol for en dato beregnes lokalt; «været i New York» (prompt 35) før ruteren.
    if (askSun36(t) || askWeather35(t)) return
    if (s.assistMissing) { openChat(t); return }
    val seq = ++s.ansSeq
    s.ans = HomeAns31(t, busy = true)
    Haptics.tap()
    var jobId: String? = null
    var main: Job? = null
    val timer = launchJob31 {
        delay(p32b.hsTimeout * 1000L)
        if (s.ansSeq == seq && s.ans?.busy == true) { main?.cancel(); handoff32b(t, jobId, "Dette tar litt tid.") }
    }
    main = launchJob31 {
        val r = try {
            assist31(t, "search") { id -> jobId = id; if (s.ansSeq == seq) s.ans = s.ans?.copy(jobId = id); rememberJob31(id, t, "hjem") }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
        if (s.ansSeq != seq) return@launchJob31
        timer.cancel()
        if (r == null) {
            if (s.assistMissing) { s.ans = null; openChat(t); return@launchJob31 }
            handoff32b(t, jobId, "Fikk ikke svar her.")
            return@launchJob31
        }
        // Prompt 36: handling (kind:'action' – lagt i kalenderen, påminnelse …) vises i pillen øverst, ikke som kort under søket.
        if (r.kind == "action") {
            s.ans = null
            p31.toastMsg = "✓ " + plain31(r.text).lineSequence().firstOrNull().orEmpty().take(80); p31.toastSeq++
        } else s.ans = HomeAns31(t, false, r.text, r.source, r.jobId, r.apply?.optInt("memoryId", 0) ?: 0, r.apply?.optInt("count", 0) ?: 0, r.apply?.optStr("title") ?: "",
            wxGeo = geoOfOpen35(r.open) ?: r.open?.takeIf { it.optString("route") == "vaer" }?.let { mobileHome?.weather?.let { w -> if (w.lat != null && w.lon != null) "geo:${w.lat},${w.lon},${w.place}" else null } })
        if (r.intent.startsWith("trial")) loadTrials31()
        if (r.intent.startsWith("appointment") || r.intent.startsWith("calendar.create")) reloadKal27()
        answered31(r, t, "hjem", null)
    }
}

/** «Dette tar litt tid. **Fortsetter i Chat** …» og Chat etter 0,7 s. Jobben fortsetter i samme Chat-tråd på serveren. */
private fun AppViewModel.handoff32b(q: String, jobId: String?, why: String) {
    val s = p31
    val seq = ++s.ansSeq
    s.ans = HomeAns31(q, false, "$why **Fortsetter i Chat** …", "Glimt", jobId)
    launch32b {
        val t0 = System.currentTimeMillis()
        val chatId = jobId?.let { id ->
            runCatching { JSONObject(api32b { hlPost("/assist/" + URLEncoder.encode(id, "UTF-8") + "/handoff", JSONObject()) }).optStr("chatId") }.getOrNull()
        }
        val left = 700L - (System.currentTimeMillis() - t0)
        if (left > 0) delay(left)
        if (s.ansSeq == seq) closeAns31()
        if (chatId != null) { openChat(); openChatId27(chatId) } else openChat(q)
    }
}

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
        val days = ChronoUnit.DAYS.between(today, e.date)
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

/* ---------------- Prøveperioder ---------------- */

/** Startdatoen per prøve (start, started_at eller created), for fremdriften i Hjem-widgeten og widgetene. */
fun AppViewModel.trialMeta32b(raw: String) {
    val tr = raw.trim()
    val a = runCatching { if (tr.startsWith("[")) JSONArray(tr) else JSONObject(tr).let { it.optJSONArray("trials") ?: it.optJSONArray("items") } }.getOrNull() ?: return
    val m = HashMap<String, LocalDate>()
    for (i in 0 until a.length()) {
        val o = a.optJSONObject(i) ?: continue
        val id = o.optStr("id") ?: continue
        trialStartOf32b(o)?.let { m[id] = it }
    }
    p32b.trialStart = m
    runCatching { no.kristo.finanshub.widget.Trials32bStore.saveRaw(appCtx29, raw, account?.id) }
    runCatching { no.kristo.finanshub.widget.Trials32bWidgets.refreshNow(appCtx29) }
}

/** start / startAt / started_at (dato) eller created (ms eller ISO). */
fun trialStartOf32b(o: JSONObject): LocalDate? {
    (o.optStr("start") ?: o.optStr("startAt") ?: o.optStr("started_at") ?: o.optStr("startsAt"))?.let { s -> runCatching { LocalDate.parse(s.take(10)) }.getOrNull()?.let { return it } }
    val c = o.opt("created") ?: o.opt("created_at") ?: o.opt("createdAt")
    return when (c) {
        is Number -> runCatching { Instant.ofEpochMilli(c.toLong()).atZone(ZoneId.of("Europe/Oslo")).toLocalDate() }.getOrNull()
        is String -> runCatching { LocalDate.parse(c.take(10)) }.getOrNull()
        else -> null
    }
}

/** Domener for logoene (samme som fasiten), ellers navnet + .com. */
private val TRIAL_DOM32B = mapOf(
    "viaplay" to "viaplay.no", "netflix" to "netflix.com", "hbo max" to "max.com", "max" to "max.com", "disney+" to "disneyplus.com", "spotify" to "spotify.com",
    "tv 2 play" to "tv2.no", "storytel" to "storytel.com", "bookbeat" to "bookbeat.com", "apple tv+" to "tv.apple.com", "apple music" to "music.apple.com",
    "youtube premium" to "youtube.com", "amazon prime" to "amazon.com", "audible" to "audible.com", "strava" to "strava.com", "tidal" to "tidal.com",
    "chatgpt" to "openai.com", "duolingo" to "duolingo.com", "adobe" to "adobe.com", "canva" to "canva.com", "discovery+" to "discoveryplus.com",
    "skyshowtime" to "skyshowtime.com", "nextory" to "nextory.no",
)

fun trialDomain32b(name: String): String = TRIAL_DOM32B[name.trim().lowercase()] ?: (name.trim().lowercase().replace(Regex("[^a-z0-9æøå]+"), "") + ".com")

/** Dager igjen (0 = siste dag). */
fun trialDays32b(end: LocalDate, today: LocalDate = LocalDate.now(OSLO31)): Int = ChronoUnit.DAYS.between(today, end).toInt()

/** Andel av prøven som er brukt (4–100 %). Uten startdato regnes 14 dager. */
fun trialPct32b(end: LocalDate, start: LocalDate?, today: LocalDate = LocalDate.now(OSLO31)): Float {
    val st = start ?: end.minusDays(14)
    val tot = maxOf(1L, ChronoUnit.DAYS.between(st, end))
    val left = maxOf(0L, ChronoUnit.DAYS.between(today, end))
    return ((tot - left).toFloat() / tot).coerceIn(.04f, 1f)
}

/** ≤ 2 dager rød, ≤ 7 oransje, ellers null (tekstfarge). */
fun trialColor32b(days: Int): Long? = when { days <= 2 -> 0xFFB23A2A; days <= 7 -> 0xFFA8661A; else -> null }

/* ---------------- Integrasjoner: logoer ---------------- */

/** Domenet for logoen til en integrasjon (ILOGO i fasiten). Null = behold bokstavmerket (Bankimport). */
fun integDomain32b(id: String): String? = when (id) {
    "ha" -> "home-assistant.io"
    "calendars", "calendar", "google" -> "calendar.google.com"
    "entur" -> "entur.no"
    "mybring", "bring" -> "bring.no"
    "postnord" -> "postnord.no"
    "parcelsapp", "parcels" -> "parcelsapp.com"
    "t212" -> "trading212.com"
    "imap", "email" -> "proton.me"
    "finn" -> "finn.no"
    "ai", "gemini" -> "gemini.google.com"
    "cloudflare", "cf" -> "cloudflare.com"
    "met" -> "yr.no"
    "map", "kart" -> "kartverket.no"
    "icons" -> "iconify.design"
    "photos" -> "unsplash.com"
    "plex" -> "plex.tv"
    "jellyfin" -> "jellyfin.org"
    "sonarr" -> "sonarr.tv"
    "radarr" -> "radarr.video"
    else -> null
}
