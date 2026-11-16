package no.kristo.finanshub

import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONObject

/* ---------------- Bakgrunn og forgrunn ---------------- */

/** Appen gikk i bakgrunnen: WorkManager følger opp jobber som ikke er ferdige. */
fun AppViewModel.onBackground31() {
    Notify31.setForeground(appCtx29, false)
    if (!loggedIn) return
    Notify31.schedule(appCtx29)
    if (p31.ans?.busy == true || chat27.busy || q29.jobs.isNotEmpty()) Notify31.followUp(appCtx29)
}

/** Tilbake i appen. Prompt 45 (claude-code-glimt-kun-systemvarsel.md): svar mens appen var lukket kommer KUN som systemvarsel;
 *  ingen banner, toast eller tekst når appen åpnes igjen. Svaret ligger i chatten / svarfeltet på Hjem. */
fun AppViewModel.onForeground31() {
    Notify31.setForeground(appCtx29, true)
    val s = p31
    // Prøvene på nytt (nye fra web planlegges som lokale varsler), høyst hvert 10. minutt.
    if (System.currentTimeMillis() - s.trialsAt > 600_000L) { s.trialsAt = System.currentTimeMillis(); loadTrials31(); Notify31.schedule(appCtx29) }
    launch31 {
        delay(350)
        val sp = Notify31.sp(appCtx29)
        val b = s.away ?: sp.getString("away", null) ?: return@launch31
        s.away = null
        sp.edit().remove("away").apply()
        if (b.isEmpty()) return@launch31
    }
}

/** Varselet ble trykket (finanshub://glimt eller finanshub://chat/…): ikke vis banneret i tillegg. */
fun AppViewModel.openedFromNotify31() { p31.away = null; Notify31.sp(appCtx29).edit().remove("away").apply() }

internal val OSLO36: ZoneId = ZoneId.of("Europe/Oslo")

data class HealthStep36(val id: String, val label: String, val status: String, val ms: Long?)

class P36State {
    /* Matplan */
    var mealNote by mutableStateOf<String?>(null)

    /* Nordlys: tidligere versjoner og notater for den nye versjonen */
    var hist by mutableStateOf<List<Ver36>>(emptyList())
    var histMore by mutableStateOf(false)
    var histBusy by mutableStateOf(false)
    var histMissing by mutableStateOf(false)
    var histOpen by mutableStateOf<String?>(null)
    var latestNotes by mutableStateOf<List<String>>(emptyList())
    internal var histFor: String? = null

    /* Sherlock-Glimt («Se etter») */
    var sherSeq by mutableIntStateOf(0)
    var sherOn by mutableStateOf(false)

    /* «Starter opp» */
    var startOn by mutableStateOf(false)
    var startReady by mutableStateOf(false)
    var startSteps by mutableStateOf<List<HealthStep36>>(emptyList())
    var startAt by mutableLongStateOf(0L)
    var startVer by mutableStateOf("")
    /** Brukeren lukket skjermen («Vis logg»): ikke vis den igjen for denne oppdateringen. */
    var startDismissed by mutableStateOf(false)
    internal var startJob: Job? = null

    /* Brief-kortet på Hjem */
    var briefHidden by mutableStateOf<String?>(null)
    var briefToast by mutableIntStateOf(0)
    var briefHint by mutableStateOf(false)
    internal var briefFor: String? = null

    /* Profilbilde */
    var avatarBusy by mutableStateOf(false)
    var avatarAsk by mutableStateOf(false)
}

internal fun JSONObject.s36(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

/* ======================= «Starter opp» ======================= */

val START_STEPS36 = listOf(
    "db" to "Starter databasen", "migrate" to "Kjører migrasjoner", "api" to "Starter web og API",
    "ai" to "Vekker Glimt og AI-modellene", "integrations" to "Kobler til integrasjoner",
)

private fun parseHealth36(raw: String): Pair<Boolean, List<HealthStep36>> {
    val o = JSONObject(raw)
    val got = objs34(o.optJSONArray("steps")).mapNotNull { x ->
        val id = x.s36("id") ?: return@mapNotNull null
        val st = when (x.s36("status") ?: x.s36("state")) { "ok", "done" -> "ok"; "run", "running", "active" -> "run"; else -> "wait" }
        HealthStep36(id, x.s36("label") ?: START_STEPS36.firstOrNull { it.first == id }?.second ?: id, st, if (x.has("ms") && !x.isNull("ms")) x.optLong("ms") else null)
    }
    val ready = o.optBoolean("ready", got.isNotEmpty() && got.all { it.status == "ok" })
    val steps = if (got.isEmpty()) START_STEPS36.map { (id, l) -> HealthStep36(id, l, if (ready) "ok" else "wait", null) } else got
    return ready to steps
}

/** Viser «Starter opp» og poller /api/health til serveren er klar. Ingen svar = første steg er aktivt. */
fun AppViewModel.startScreen36() {
    val s = p36
    if (s.startOn || s.startDismissed) return
    s.startOn = true
    s.startReady = false
    s.startAt = System.currentTimeMillis()
    s.startVer = p30.upd.latest.ifBlank { p30.upd.current }
    s.startSteps = START_STEPS36.mapIndexed { i, (id, l) -> HealthStep36(id, l, if (i == 0) "run" else "wait", null) }
    pollHealth36()
}

fun AppViewModel.pollHealth36() {
    val s = p36
    s.startJob?.cancel()
    s.startJob = launchJob36 {
        while (s.startOn) {
            // Q19: serveren har alltid /api/health; ingen «404 = kjører» for eldre servere.
            val r = try { parseHealth36(api36 { request("GET", "/health", null, prefix = Api.HOMELAB, timeout = 3000, read = 4000) }) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
            if (r != null) {
                s.startSteps = r.second
                if (r.first) {
                    s.startReady = true
                    Haptics.success()
                    delay(800)
                    // Mobil: hent versjonen på nytt og fjern skjermen.
                    loadUpd30(force = true)
                    loadNordlys31()
                    delay(300)
                    s.startOn = false
                    break
                }
            }
            delay(1500)
        }
    }
}

fun AppViewModel.closeStart36(dismiss: Boolean) {
    val s = p36
    s.startJob?.cancel()
    s.startOn = false
    if (dismiss) s.startDismissed = true
}

/* ======================= 120 Hz ======================= */

/** Sveip og animasjoner: be om høyeste oppdateringsfrekvens med samme oppløsning (90/120 Hz der skjermen har det). */
fun android.app.Activity.preferHighRefresh39() {
    runCatching {
        @Suppress("DEPRECATION")
        val d = (if (Build.VERSION.SDK_INT >= 30) display else windowManager.defaultDisplay) ?: return
        val cur = d.mode
        val best = d.supportedModes.filter { it.physicalWidth == cur.physicalWidth && it.physicalHeight == cur.physicalHeight }.maxByOrNull { it.refreshRate } ?: return
        if (best.modeId != cur.modeId) window.attributes = window.attributes.apply { preferredDisplayModeId = best.modeId }
    }
}
