package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

/*
 * Prompt 30 (ANDROID30): oppdatering fra appen (banner på Hjem og i Innstillinger, PROGRAMVARE, passord-ark, fremdrift og
 * rollback), Finans → Mer med skjulte sider (finance_more_hidden), Mer-wiggle (+ viser SKJULT), Boliger (del med brukere,
 * rediger utgift), kvitteringsmarkering fra søk og haptikk når ark/popuper lukkes. Tegnes i ui/Ui30.kt, ui/Weather30.kt
 * og ui/Boliger30.kt.
 *
 * API (SERVER30): GET /api/system/version, GET /api/system/update (status med steps/pct), POST /api/system/update/start
 * {password} og /rollback {password} med app-token, GET/PUT /api/system/update/settings {auto_update, notify_updates},
 * finance_more_hidden i /api/me/layout, GET /finans/api/users/shareable?home=, POST /finans/api/folders/:id/members
 * {userIds[], role}, PATCH /finans/api/folders/:id/entries/:eid {merchant, amount, date}, POST /finans/api/receipts/:id/reread.
 */

/* ---------------- Oppdatering ---------------- */

/** Tilstanden til banneret: avail (ny versjon), run (oppdaterer), done, failed, none (siste versjon / ikke admin). */
class Upd30State {
    var loaded by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var current by mutableStateOf("")
    var latest by mutableStateOf("")
    var notes by mutableStateOf<List<String>>(emptyList())
    var available by mutableStateOf(false)
    /** none | avail | run | done | failed */
    var phase by mutableStateOf("none")
    var pct by mutableStateOf(0)
    var stepText by mutableStateOf("")
    var error by mutableStateOf("")
    /** Forbindelsen er borte (serveren starter på nytt). */
    var lost by mutableStateOf(false)
    /** Siste handling: start eller rollback (Feilet → Prøv igjen / Gjenopprett). */
    var action by mutableStateOf("start")
    var notesOpen by mutableStateOf(false)
    var hiddenAt by mutableStateOf(0L)
    /* Passord-arket */
    var pwFor by mutableStateOf<String?>(null)
    var pwBusy by mutableStateOf(false)
    var pwErr by mutableStateOf("")
    /* Brytere (admin) */
    var autoUpdate by mutableStateOf(false)
    var notifyUpdates by mutableStateOf(true)
    var settingsLoaded by mutableStateOf(false)
    internal var poll: Job? = null
    internal var loading = false
}

class P30State {
    val upd = Upd30State()
    /* Finans → Mer */
    var finHidden by mutableStateOf<List<String>>(emptyList())
    var fmAdd by mutableStateOf(false)
    internal var finHiddenFor: String? = null
    /* Mer: + viser SKJULT */
    var merAdd by mutableStateOf(false)
    /* Kvitteringsmarkering: søkeord og transaksjonen det gjelder */
    var hl by mutableStateOf<String?>(null)
    var hlTx by mutableStateOf<Int?>(null)
    var hlSeq by mutableStateOf(0)
    /** bbox per linje (prosent av bildet) for kvitteringen som vises, null = ikke hentet / mangler. */
    var boxes by mutableStateOf<List<RcLine30>?>(null)
    var boxesFor by mutableStateOf<Int?>(null)
    /** Linjene serveren sier matcher (receipt.highlight.lineIndex, med stamming), null = bruk lokal match. */
    var hlIdx by mutableStateOf<List<Int>?>(null)
    var rereading by mutableStateOf(false)
    /* Boliger: del med brukere */
    var shareFor by mutableStateOf<Int?>(null)
    var shareUsers by mutableStateOf<List<ShareUser30>?>(null)
    var shareSel by mutableStateOf<Set<String>>(emptySet())
    var shareRole by mutableStateOf("editor")
    var shareBusy by mutableStateOf(false)
    var shareErr by mutableStateOf("")
}

data class RcLine30(val text: String, val price: Double?, val box: List<Float>?)
data class ShareUser30(val id: String, val name: String, val initial: String, val color: Long?, val relation: String?)

private fun JSONObject.s30(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

private fun verOf30(v: Any?): String = when (v) {
    is JSONObject -> v.s30("version") ?: v.s30("sha")?.take(7) ?: ""
    is String -> v
    else -> ""
}

/** Hiding på Hjem i 24 t (✕). Lagres per konto. */
private fun AppViewModel.updHideKey30() = "upd30_hide_" + (account?.id ?: "")

fun AppViewModel.loadUpd30(force: Boolean = false) {
    val u = p30.upd
    if (!userIsAdmin || u.loading) return
    if (u.loaded && !force && u.phase != "none" && u.phase != "avail") return
    u.loading = true
    u.hiddenAt = prefs.str(updHideKey30(), "0").toLongOrNull() ?: 0L
    launch30 {
        try {
            val raw = runCatching { api30 { hlGet("/system/version") } }.getOrNull()
            if (raw != null) {
                val o = JSONObject(raw)
                u.current = verOf30(o.opt("current"))
                u.latest = verOf30(o.opt("latest"))
                u.notes = o.optJSONArray("notes").strings().filter { it.isNotBlank() }.take(12)
                u.available = o.optBoolean("updateAvailable", u.latest.isNotBlank() && u.latest != u.current)
                u.missing = false
            } else {
                // Eldre server: oversikten fra prompt 28.
                val o = JSONObject(api30 { hlGet("/system/update") })
                u.current = verOf30(o.optJSONObject("installed"))
                u.latest = verOf30(o.optJSONObject("latest"))
                u.available = o.optBoolean("updateAvailable")
                val ch = o.optJSONArray("changes")
                val n = ArrayList<String>()
                if (ch != null) for (i in 0 until ch.length()) n += ch.optJSONObject(i)?.optJSONArray("items").strings()
                u.notes = n.filter { it.isNotBlank() }.take(12)
            }
            u.loaded = true
            if (u.phase == "none" || u.phase == "avail") u.phase = if (u.available) "avail" else "none"
            // Pågår allerede (startet fra web eller en annen enhet): følg med.
            val st = runCatching { JSONObject(api30 { hlGet("/system/update") }) }.getOrNull()
            if (st != null && (st.optBoolean("running") || st.optJSONObject("status")?.s30("state") in RUN30)) { u.phase = "run"; applyUpdStatus30(st); pollUpd30() }
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) u.missing = true
        } catch (_: Exception) {
        } finally { u.loading = false }
    }
}

private val RUN30 = setOf("downloading", "building", "restarting", "backup", "installing", "queued", "stuck", "stalled") // prompt 46: stuck = «Står fast»

/** Grove anslag når serveren ikke sender pct: Laster ned 0–35, backup 35–60, installerer 60–85, starter på nytt 85–100. */
private fun pctFor30(state: String?, step: String?): Int = when {
    state == "downloading" -> 15
    step?.contains("backup", true) == true || state == "backup" -> 45
    state == "building" || state == "installing" -> 70
    state == "restarting" -> 90
    else -> 5
}

internal fun updStepText30(pct: Int, latest: String): String = when {
    pct >= 85 -> "Starter tjenestene på nytt …"
    pct >= 60 -> "Installerer på hjemmeserveren …"
    pct >= 35 -> "Tar backup før oppdatering …"
    else -> "Laster ned ${latest.ifBlank { "ny versjon" }} …"
}

private fun AppViewModel.applyUpdStatus30(o: JSONObject): Boolean {
    val u = p30.upd
    val s = o.optJSONObject("status") ?: o
    val state = s.s30("state")
    val step = s.s30("step")
    val pctRaw = if (o.has("pct")) o.optInt("pct", -1) else if (s.has("pct")) s.optInt("pct", -1) else -1
    val steps = o.optJSONArray("steps") ?: s.optJSONArray("steps")
    var active: String? = null
    if (steps != null) for (i in 0 until steps.length()) {
        val x = steps.optJSONObject(i) ?: continue
        if (x.s30("state") in setOf("active", "running")) active = x.s30("key")
    }
    val pct = when {
        pctRaw in 0..100 -> pctRaw
        active == "download" -> 15; active == "backup" -> 45; active == "install" -> 70; active == "restart" -> 90
        else -> pctFor30(state, step)
    }
    u.lost = false
    when {
        state == "done" -> {
            if (u.phase == "run") { Haptics.success(); Haptics.select() }
            u.phase = "done"; u.pct = 100; u.available = false
            val now = o.s30("current") ?: o.optJSONObject("installed")?.let { verOf30(it).takeIf { v -> v.isNotBlank() } }
            if (now != null) u.current = now else if (u.action != "rollback" && u.latest.isNotBlank()) u.current = u.latest
            return true
        }
        state == "failed" -> { u.phase = "failed"; u.error = s.s30("error")?.lines()?.firstOrNull { it.isNotBlank() } ?: step ?: "Ukjent feil"; Haptics.error(); return true }
        state in RUN30 || o.optBoolean("running") -> {
            u.phase = "run"; u.pct = maxOf(u.pct, pct)
            u.stepText = when (active) {
                "backup" -> "Tar backup før oppdatering …"; "install" -> "Installerer på hjemmeserveren …"; "restart" -> "Starter tjenestene på nytt …"
                "download" -> "Laster ned ${u.latest.ifBlank { "ny versjon" }} …"; else -> updStepText30(u.pct, u.latest)
            }
            // Prompt 46 (claude-code-oppdatering-henger-55.md): watchdog – ingen ny prosent/steg på 3 min, eller serveren sier stuck.
            updWatch46(state, pct, step ?: active ?: "", s.optBoolean("stuck") || o.optBoolean("stuck"))
            return false
        }
        else -> return u.phase != "run"
    }
}

/** Status hvert 1,5 s. Mister vi forbindelsen: «Starter tjenestene på nytt …» og prøv hvert 2. s i opptil 2 min. */
internal fun AppViewModel.pollUpd30() {
    val u = p30.upd
    u.poll?.cancel()
    u.poll = launch30 {
        var lostAt = 0L
        var idle = 0
        // GET /api/system/update/status (lett, SERVER30); eldre servere: oversikten GET /api/system/update.
        var path = "/system/update/status"
        while (true) {
            delay(if (lostAt > 0) 2000 else 1500)
            val o = try { JSONObject(api30 { request("GET", path, null, prefix = Api.HOMELAB, timeout = 4000, read = 5000) }) } catch (e: ApiException) {
                if (e.status == 404 && path.endsWith("/status")) { path = "/system/update"; continue }
                null
            } catch (e: Exception) { null }
            if (o == null) {
                if (lostAt == 0L) lostAt = System.currentTimeMillis()
                u.lost = true; u.stepText = "Starter tjenestene på nytt …"; u.pct = maxOf(u.pct, 85)
                if (System.currentTimeMillis() - lostAt > 120_000) { u.phase = "failed"; u.lost = false; u.error = "Fikk ikke kontakt med serveren etter omstart. Sjekk at Homelab kjører."; break }
                continue
            }
            lostAt = 0L
            val wasRun = u.phase == "run"
            val end = applyUpdStatus30(o)
            if (end && u.phase != "run") {
                // Idle rett etter start: forespørselen er ikke plukket opp ennå – vent litt før vi gir opp.
                if (wasRun && u.phase != "done" && u.phase != "failed" && ++idle < 6) { u.phase = "run"; continue }
                break
            }
        }
    }
}

/** «Oppdater nå» / «Gjenopprett»: passord-arket. */
fun AppViewModel.askUpd30(action: String) {
    val u = p30.upd
    u.pwFor = action; u.pwErr = ""; u.pwBusy = false
    Haptics.tap()
}

fun AppViewModel.runUpd30(password: String) {
    val u = p30.upd
    val action = u.pwFor ?: "start"
    if (password.isBlank()) { u.pwErr = "Skriv inn passordet ditt"; return }
    u.pwBusy = true; u.pwErr = ""
    launch30 {
        try {
            val path = if (action == "rollback") "/system/update/rollback" else "/system/update/start"
            api30 { request("POST", path, JSONObject().put("password", password), prefix = Api.HOMELAB, read = 60_000) }
            u.action = action
            u.pwFor = null
            u.phase = "run"; u.pct = 2; u.error = ""; u.notesOpen = false
            u.stepText = if (action == "rollback") "Laster ned forrige versjon …" else updStepText30(0, u.latest)
            pollUpd30()
        } catch (e: ApiException) {
            u.pwErr = when {
                e.status == 403 && e.message?.contains("nettleseren", true) == true -> "Serveren tillater bare oppdatering fra nettleseren. Oppdater Homelab-serveren, eller bruk «Oppdater i nettleseren»."
                e.status == 404 || e.status == 405 -> if (action == "rollback") "Serveren kan ikke gjenopprette ennå." else "Serveren støtter ikke oppdatering fra appen."
                else -> e.message ?: "Noe gikk galt"
            }
            Haptics.error()
        } catch (e: Exception) {
            u.pwErr = e.message ?: "Noe gikk galt"
        } finally { u.pwBusy = false }
    }
}

/** ✕ på Hjem: skjult i 24 t (vises alltid i Innstillinger). */
fun AppViewModel.hideUpd30() {
    val u = p30.upd
    u.hiddenAt = System.currentTimeMillis()
    prefs.set(updHideKey30(), u.hiddenAt.toString())
    flash("Du finner oppdateringen i Innstillinger")
}

/** Ferdig: banneret forsvinner (siste versjon). */
fun AppViewModel.doneUpd30() {
    val u = p30.upd
    u.phase = "none"; u.available = false; u.pct = 0
    Haptics.success()
}

fun AppViewModel.upd30OnHome(): Boolean {
    val u = p30.upd
    if (!userIsAdmin || !u.loaded) return false
    return when (u.phase) {
        "run", "done", "failed" -> true
        "avail" -> System.currentTimeMillis() - u.hiddenAt > 86_400_000L && u.notifyUpdates
        else -> false
    }
}

fun AppViewModel.loadUpdSettings30() {
    val u = p30.upd
    if (!userIsAdmin || u.settingsLoaded) return
    launch30 {
        val raw = runCatching { api30 { hlGet("/system/update/settings") } }.getOrNull() ?: return@launch30
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch30
        val x = o.optJSONObject("settings") ?: o
        u.autoUpdate = x.optBoolean("auto_update", x.optBoolean("autoUpdate", false))
        u.notifyUpdates = x.optBoolean("notify_updates", x.optBoolean("notifyUpdates", true))
        u.settingsLoaded = true
    }
}

fun AppViewModel.setUpdSetting30(key: String, on: Boolean) {
    val u = p30.upd
    if (key == "auto_update") u.autoUpdate = on else u.notifyUpdates = on
    Haptics.select()
    launch30 {
        try { api30 { hlPut("/system/update/settings", JSONObject().put(key, on)) } }
        catch (e: ApiException) {
            if (key == "auto_update") u.autoUpdate = !on else u.notifyUpdates = !on
            flash(if (e.status == 404) "Kunne ikke lagre: serveren har ikke denne innstillingen ennå" else "Kunne ikke lagre: ${e.message}")
        }
    }
}

/** Realtime «system-update-available» / «system-update»: hent versjonen på nytt. */
fun AppViewModel.onUpdEvent30() { if (userIsAdmin && p30.upd.phase != "run") loadUpd30(force = true) }

/* ---------------- Finans → Mer: skjulte sider ---------------- */

/** Android-nøkler → nøklene serveren bruker (MER_KEYS.fin). */
private fun finKeyOut30(k: String) = when (k) { "sok" -> "fsok"; "liste" -> "fliste"; else -> k }
private fun finKeyIn30(k: String) = when (k) { "fsok" -> "sok"; "fliste" -> "liste"; "abonnementer" -> "abo"; else -> k }
private fun AppViewModel.finHidKey30() = "fin_more_hidden30_" + (account?.id ?: "")

fun AppViewModel.loadFinHidden30() {
    val s = p30
    val key = finHidKey30()
    if (s.finHiddenFor == key) return
    s.finHiddenFor = key
    s.finHidden = prefs.str(key, "").split(',').filter { it.isNotBlank() }
}

/** Fra GET /api/me/layout (finance_more_hidden). */
fun AppViewModel.applyLayout30(raw: String) {
    val o0 = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val o = o0.optJSONObject("layout") ?: o0
    val a = o.optJSONArray("finance_more_hidden") ?: return
    val l = a.strings().map(::finKeyIn30).filter { it.isNotBlank() && it != "innst" }.distinct()
    p30.finHidden = l
    prefs.set(finHidKey30(), l.joinToString(","))
}

fun AppViewModel.setFinHidden30(l: List<String>) {
    val v = l.filter { it != "innst" }.distinct()
    p30.finHidden = v
    prefs.set(finHidKey30(), v.joinToString(","))
    launch30 { runCatching { api30 { hlPut("/me/layout", JSONObject().put("finance_more_hidden", JSONArray(v.map(::finKeyOut30)))) } } }
}

/* ---------------- Kvitteringsmarkering ---------------- */

/** Små bokstaver uten aksenter («Tomater» → «tomater», «Crème» → «creme»). Lengden er uendret for vanlig norsk tekst. */
internal fun fold30(s: String): String {
    val keep = setOf('æ', 'ø', 'å', 'Æ', 'Ø', 'Å')
    val sb = StringBuilder()
    for (ch in s) {
        if (ch in keep) { sb.append(ch.lowercaseChar()); continue }
        val n = Normalizer.normalize(ch.toString(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        sb.append(if (n.length == 1) n.lowercase() else ch.lowercase())
    }
    return sb.toString()
}

/** Ordene i søket som skal markeres (stoppord og korte ord utelatt). */
internal fun hlTerms30(q: String): List<String> {
    val stop = setOf("hva", "hvor", "mye", "brukte", "jeg", "på", "i", "og", "en", "et", "til", "for", "med", "av", "har", "kjøpte", "når")
    return fold30(q).split(Regex("[^\\p{L}\\p{N}]+")).filter { it.length >= 3 && it !in stop }.distinct().take(4)
}

/** Første treff i linja: [start, slutt) eller null. */
internal fun hlMatch30(line: String, terms: List<String>): IntRange? {
    if (terms.isEmpty()) return null
    val f = fold30(line)
    // Sjeldne tegn som endrer lengden: hele linja markeres (tomt område), uten egen ordmarkering.
    if (f.length != line.length) return if (terms.any { f.contains(it) }) IntRange.EMPTY else null
    for (t in terms) { val i = f.indexOf(t); if (i >= 0) return i until (i + t.length) }
    return null
}

/** Åpne en transaksjon fra Søk eller Liste med søkeordet (?hl=). */
fun AppViewModel.openTxHl30(id: Int, q: String?) {
    val t = q?.trim().orEmpty()
    val s = p30
    if (t.isNotEmpty() && hlTerms30(t).isNotEmpty()) { s.hl = t; s.hlTx = id; s.hlSeq++ } else { s.hl = null; s.hlTx = null }
    s.boxes = null; s.boxesFor = null; s.hlIdx = null
    openTx(id)
    if (s.hl != null) loadBoxes30(id)
}

fun AppViewModel.clearHl30() { p30.hl = null; p30.hlTx = null; Haptics.select() }

/** Linjene med bbox for kvitteringen (fra GET /transactions/:id). Eldre servere: ingen bbox. */
fun AppViewModel.loadBoxes30(txId: Int) {
    val s = p30
    if (s.boxesFor == txId) return
    s.boxesFor = txId
    s.hlIdx = null
    val q = s.hl?.takeIf { s.hlTx == txId }
    launch30 {
        val path = "/transactions/$txId" + (q?.let { "?hl=" + java.net.URLEncoder.encode(it, "UTF-8") } ?: "")
        val raw = runCatching { api30 { get(path) } }.getOrNull() ?: return@launch30
        val r = runCatching { JSONObject(raw).optJSONObject("receipt") }.getOrNull() ?: return@launch30
        r.optJSONObject("highlight")?.optJSONArray("lineIndex")?.let { a -> s.hlIdx = (0 until a.length()).map { a.optInt(it, -1) }.filter { it >= 0 } }
        val a = r.optJSONArray("lines") ?: return@launch30
        val out = ArrayList<RcLine30>()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val b = o.optJSONArray("bbox")
            val box = if (b != null && b.length() == 4) (0 until 4).map { b.optDouble(it, 0.0).toFloat() } else null
            out += RcLine30(o.s30("text") ?: o.s30("name") ?: o.s30("description") ?: "", if (o.has("price")) o.optDouble("price") else null, box)
        }
        if (s.boxesFor == txId) s.boxes = out
    }
}

/** «Les kvitteringen på nytt» for å få posisjoner. */
fun AppViewModel.rereadReceipt30(receiptId: String, txId: Int) {
    val s = p30
    if (s.rereading) return
    s.rereading = true
    launch30 {
        try {
            api30 { request("POST", "/receipts/$receiptId/reread", JSONObject(), read = 150_000) }
            s.boxesFor = null
            loadTxDetail(txId)
            loadBoxes30(txId)
            flash("Kvitteringen er lest på nytt")
        } catch (e: ApiException) {
            flash("Kunne ikke lese på nytt: " + glimtErr50(e, "reread30").text) // prompt 50: ikke «Feil 502»
        } finally { s.rereading = false }
    }
}

/* ---------------- Boliger: del med brukere og rediger utgift ---------------- */

fun AppViewModel.loadShareable30(homeId: Int) {
    val s = p30
    if (s.shareFor == homeId && s.shareUsers != null) return
    s.shareFor = homeId; s.shareUsers = null; s.shareSel = emptySet(); s.shareErr = ""
    launch30 {
        val raw = try { api30 { get("/users/shareable?home=$homeId") } } catch (e: ApiException) {
            s.shareErr = if (e.status == 404) "old" else (e.message ?: "")
            s.shareUsers = emptyList()
            return@launch30
        }
        val a = runCatching { JSONObject(raw).optJSONArray("users") }.getOrNull() ?: runCatching { JSONArray(raw) }.getOrNull() ?: JSONArray()
        val out = ArrayList<ShareUser30>()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val id = o.s30("id") ?: continue
            val name = o.s30("name") ?: continue
            val col = o.s30("color")?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000 or it }
            out += ShareUser30(id, name, o.s30("initial") ?: name.take(1).uppercase(), col, o.s30("relation"))
        }
        if (s.shareFor == homeId) s.shareUsers = out
    }
}

fun AppViewModel.shareHome30(homeId: Int) {
    val s = p30
    val ids = s.shareSel.toList()
    if (ids.isEmpty() || s.shareBusy) return
    val names = s.shareUsers.orEmpty().filter { it.id in ids }.map { it.name }
    s.shareBusy = true
    launch30 {
        try {
            val arr = JSONArray(ids)
            val raw = try {
                api30 { post("/folders/$homeId/members", JSONObject().put("userIds", arr).put("role", s.shareRole)) }
            } catch (e: ApiException) {
                // Eldre server: én bruker per kall ({userId}).
                if (e.status != 400) throw e
                var last = ""
                for (x in ids) last = api30 { post("/folders/$homeId/members", JSONObject().put("userId", x).put("role", s.shareRole)) }
                last
            }
            applyDetail24(raw)
            s.shareUsers = s.shareUsers.orEmpty().filter { it.id !in ids }
            s.shareSel = emptySet()
            flash("Delt med " + share30Names(names))
        } catch (e: ApiException) {
            flash("Kunne ikke dele: ${e.message}")
        } finally { s.shareBusy = false }
    }
}

/** «Ingrid og Pål» / «3 personer». */
internal fun share30Names(n: List<String>): String = when (n.size) {
    0 -> ""
    1 -> n[0].substringBefore(' ')
    2 -> n[0].substringBefore(' ') + " og " + n[1].substringBefore(' ')
    else -> "${n.size} personer"
}

/** Lagre butikk/beskrivelse, beløp og dato (kalles med debounce 400 ms fra arket). */
fun AppViewModel.patchEntry30(homeId: Int, eid: Int, merchant: String?, amount: Double?, date: String?) {
    val body = JSONObject()
    merchant?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("merchant", it).put("description", it) }
    amount?.let { body.put("amount", it) }
    date?.let { body.put("date", it) }
    if (body.length() == 0) return
    launch30 {
        try { applyDetail24(api30 { patch("/folders/$homeId/entries/$eid", body) }) }
        catch (e: ApiException) { flash("Kunne ikke lagre: ${e.message}") }
    }
}
