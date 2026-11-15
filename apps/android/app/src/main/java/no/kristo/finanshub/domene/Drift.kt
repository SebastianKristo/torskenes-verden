@file:JvmName("DomeneDrift")

package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/*
 * Drift (serveroppdatering, backup, logger og versjoner): kode som lå i blandingsfilene (P30.kt, P36.kt, P44.kt, P46.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
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

internal fun JSONObject.s30(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

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
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
            u.pwErr = uiErr73(e, "Noe gikk galt")
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

/* ======================= Backup-kvittering ======================= */

/** «smb://truenas.local/backup/homelab» fra {host, share, path} eller en ferdig tekst. */
fun smbUrl36(o: JSONObject?): String? {
    if (o == null) return null
    o.s36("url")?.let { return it }
    val host = o.s36("host") ?: return o.s36("label")
    val share = o.s36("share") ?: return "smb://$host"
    val path = (o.s36("path") ?: "").trim('/')
    return "smb://$host/$share" + if (path.isNotEmpty()) "/$path" else ""
}

data class Ver44(
    val version: String, val date: String?, val notes: String?, val hasBackup: Boolean, val backupAt: String?, val compatible: Boolean,
    val current: Boolean, val previous: Boolean,
)

data class Ct44(val id: String, val name: String, val image: String?, val state: String, val uptime: String?, val cpu: String?, val mem: String?, val restarts: Int, val errors: Int)

data class Log44(val t: String, val level: String, val ct: String, val msg: String)

data class LogGroup44(val count: Int, val msg: String, val ct: String, val last: String?)

/* ======================= Tidligere versjoner ======================= */

fun AppViewModel.loadVersions44() = launch44 {
    val raw = try { api44 { hlGet("/update/versions") } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404) p44.verMissing = true; null
    } catch (e: Exception) { null } ?: return@launch44
    p44.versions = arr43(raw, "versions", "items").map { x ->
        Ver44(x.s43("version", "tag") ?: "", x.s43("date", "releasedAt"), x.s43("notes", "summary"), x.b43(false, "hasBackup"), x.s43("backupAt"),
            x.b43(true, "compatible"), x.b43(false, "current"), x.b43(false, "previous"))
    }.filter { it.version.isNotBlank() }.take(10)
}

fun AppViewModel.rollback44(v: Ver44, restore: Boolean, pause: Boolean, password: String) = launch44 {
    p44.verBusy = true; p44.verErr = null
    try {
        val body = JSONObject().put("version", v.version).put("restoreBackup", restore).put("pauseAutoDays", if (pause) 7 else 0)
        if (password.isNotBlank()) body.put("password", password)
        api44 { hlPost("/update/rollback", body) }
        p44.verSheet = null
        p44.verMsg = "Går tilbake til ${v.version} … Appen kobler til igjen når serveren har startet."
        Haptics.success()
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        p44.verErr = when (e.status) { 401 -> "Feil passord."; 403 -> "Bare admin eller eier kan rulle tilbake."; 409 -> e.message ?: "Kan ikke gå tilbake til denne versjonen."; else -> e.message }
    } catch (e: Exception) { p44.verErr = e.message } finally { p44.verBusy = false }
}

/* ======================= Logger (Docker) ======================= */

private val SINCE44 = mapOf("15m" to 15 * 60, "1h" to 3600, "24h" to 86_400, "7d" to 7 * 86_400)

fun AppViewModel.openLogs44() { p44.logsOpen = true; p44.logsErr = null; loadContainers44(); loadLogs44(); loadGroups44() }

private fun AppViewModel.runLog44(block: suspend () -> Unit) = launch44 {
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        when (e.status) { 404 -> p44.logsMissing = true; 403 -> p44.logsErr = "Logger er bare for admin."; else -> p44.logsErr = e.message }
    } catch (e: Exception) { p44.logsErr = e.message }
}

fun AppViewModel.loadContainers44() = runLog44 {
    val raw = api44 { hlGet("/system/containers", timeout = 15_000) }
    val o = runCatching { JSONObject(raw) }.getOrNull()
    if (o?.b43(false, "noSocket", "missing") == true || o?.b43(true, "available") == false) { p44.logsErr = o.s43("error", "message") ?: "Docker-socketen er ikke koblet til."; p44.cts = emptyList(); return@runLog44 }
    p44.cts = arr43(raw, "containers", "items").map { x ->
        Ct44(x.s43("id") ?: x.s43("name") ?: "", (x.s43("name") ?: "").removePrefix("/"), x.s43("image"), (x.s43("state", "status") ?: "").lowercase(),
            x.s43("uptime", "status"), x.s43("cpu"), x.s43("mem", "memory"), x.i43("restarts", "restartCount") ?: 0, x.i43("errors1h", "errors", "errorCount") ?: 0)
    }
}

fun AppViewModel.loadLogs44() = runLog44 {
    val q = buildString {
        append("/system/logs?limit=300&since=").append(if (p44.logSince in SINCE44) p44.logSince else "1h")
        p44.ct?.let { append("&ct=").append(enc44(it)) }
        if (p44.logLevel != "alle") append("&level=").append(p44.logLevel)
        if (p44.logQ.isNotBlank()) append("&q=").append(enc44(p44.logQ))
    }
    val raw = api44 { hlGet(q, timeout = 15_000) }
    p44.logs = arr43(raw, "lines", "logs", "items").map { x ->
        Log44(x.s43("t", "time", "ts") ?: "", (x.s43("level", "lvl") ?: "info").lowercase(), x.s43("ct", "container") ?: "", x.s43("msg", "message", "line") ?: "")
    }.takeLast(500)
}

fun AppViewModel.loadGroups44() = runLog44 {
    val raw = api44 { hlGet("/system/logs/groups?hours=24", timeout = 15_000) }
    p44.groups = arr43(raw, "groups", "items").map { x -> LogGroup44(x.i43("count", "n") ?: 1, x.s43("msg", "message", "pattern") ?: "", x.s43("ct", "container") ?: "", x.s43("last", "lastSeen")) }
}

fun AppViewModel.explain44(l: Log44) {
    p44.logPick = l; p44.explain = null; p44.explainBusy = true
    val ctx = p44.logs.orEmpty().let { all -> val i = all.indexOf(l); if (i < 0) emptyList() else all.subList((i - 20).coerceAtLeast(0), (i + 21).coerceAtMost(all.size)) }
    launch44 {
        try {
            val o = JSONObject(api44 { hlPost("/system/logs/explain", JSONObject().put("line", l.msg).put("ct", l.ct).put("context", JSONArray(ctx.map { it.t + " " + it.level + " " + it.msg }))) })
            val steps = o.strs44("steps")
            p44.explain = listOfNotNull(o.s43("title"), o.s43("text", "explanation", "answer"), steps.takeIf { it.isNotEmpty() }?.joinToString("\n") { "→ $it" })
                .joinToString("\n\n").ifBlank { "Glimt fant ingen forklaring." }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { p44.explain = "Glimt kunne ikke forklare linjen nå (${uiErr73(e, "feil")})." } finally { p44.explainBusy = false }
    }
}

fun AppViewModel.ctAction44(id: String, act: String) = runLog44 {
    api44 { hlPost("/system/containers/" + enc44(id) + "/" + act, JSONObject().put("confirm", true)) }
    p44.ctAsk = null
    Haptics.success()
    p43.toast = when (act) { "restart" -> "Starter på nytt …"; "stop" -> "Stoppet"; else -> "Startet" }
    delay(1500); loadContainers44(); loadLogs44()
}

/** 20 linjer rundt (til Chat eller en sak). */
fun AppViewModel.logContext44(l: Log44): String {
    val all = p44.logs.orEmpty(); val i = all.indexOf(l)
    val part = if (i < 0) listOf(l) else all.subList((i - 20).coerceAtLeast(0), (i + 21).coerceAtMost(all.size))
    return part.joinToString("\n") { "${it.t} ${it.level.uppercase()} [${it.ct}] ${it.msg}" }
}

/* ======================= Oppdatering av serveren: «Står fast» ======================= */

/** Kalles for hver statusmelding mens oppdateringen kjører. Ingen ny prosent/steg på 3 min (eller state stuck) → «Står fast». */
internal fun AppViewModel.updWatch46(state: String?, pct: Int, step: String, stuck: Boolean) {
    val s = p46
    val sig = "$state|$pct|$step"
    val now = System.currentTimeMillis()
    if (sig != s.updSig) { s.updSig = sig; s.updSigAt = now; if (!stuck) s.updStuck = false }
    if (stuck || state == "stuck" || state == "stalled" || (s.updSigAt > 0 && now - s.updSigAt > 180_000L)) {
        if (!s.updStuck) Haptics.error()
        s.updStuck = true
    }
}

/** Prøv igjen: POST /api/system/update/retry (SERVER46); eldre server → vanlig start med passord. */
fun AppViewModel.retryUpd46(ctx: Context) {
    val s = p46
    if (s.updBusy) return
    s.updBusy = true
    launch46 {
        try {
            api46 { request("POST", "/system/update/retry", JSONObject(), prefix = Api.HOMELAB, read = 30_000) }
            s.updStuck = false; s.updSigAt = System.currentTimeMillis()
            p30.upd.phase = "run"; pollUpd30()
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) { s.updStuck = false; startUpd31(ctx, p30.upd.action) } else flash(e.message ?: "Fikk ikke startet på nytt")
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { flash(uiErr73(e, "Fikk ikke startet på nytt")) } finally { s.updBusy = false }
    }
}

/** Avbryt og gå tilbake: POST /api/system/update/abort (SERVER46); eldre server → gjenopprett forrige versjon. */
fun AppViewModel.abortUpd46(ctx: Context) {
    val s = p46
    if (s.updBusy) return
    s.updBusy = true
    launch46 {
        try {
            api46 { request("POST", "/system/update/abort", JSONObject(), prefix = Api.HOMELAB, read = 30_000) }
            s.updStuck = false; s.updSigAt = System.currentTimeMillis()
            p30.upd.action = "rollback"; p30.upd.phase = "run"; pollUpd30()
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) { s.updStuck = false; startUpd31(ctx, "rollback") } else flash(e.message ?: "Fikk ikke avbrutt")
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { flash(uiErr73(e, "Fikk ikke avbrutt")) } finally { s.updBusy = false }
    }
}

/** Vis logg: Logger filtrert på homelab-updater. */
fun AppViewModel.showUpdLog46() {
    p44.ct = "homelab-updater"
    p44.logQ = ""
    openLogs44()
}
