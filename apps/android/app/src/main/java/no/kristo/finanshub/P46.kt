package no.kristo.finanshub

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlin.coroutines.resume

/*
 * Prompt 46 (ANDROID46), kontrakten CONTRACT46.md og design_handoff_homelab/prompts/prompt-46-pakke/ (Android/Fold-delen):
 *  - Media «Utlogget» (andre gang, claude-code-media-mobil-utlogget-2.md). Den ekte årsaken: serveren svarer 401 «Ikke innlogget» på
 *    ALLE /api-stier som ikke finnes (de faller gjennom til den felles økt-sjekken `authed.use('*', requireAuth)` i server/index.js,
 *    som bare godtar nettleserøkt – et app-token gir alltid 401 der, mens web får 404). Appen gjorde hver 401 fra /api/media til
 *    «Utlogget fra Homelab». Når serverversjonen og appen ikke er i takt (oppdateringen henger på 55 %!), eller appen kaller en
 *    reservesti (DELETE /media/episodefile/…), blir resultatet «Utlogget» selv om innloggingen er gyldig. Nå: hvert Media-kall
 *    logges (Api.kt → MediaLog46), en 401 kontrolleres mot GET /api/me med samme token før noe vises, «Utlogget» bare når også
 *    /api/me avviser tokenet (eller serveren sier code HOMELAB_AUTH), ellers «Serveren mangler …»/«Sonarr avviser API-nøkkelen».
 *    «Vis detaljer» viser statuskode, tjeneste, adresse og tid for de siste kallene.
 *  - Vær «Min posisjon» (andre gang): rotårsaken på Android var at hovedværet alltid startet på weatherPlace = "oslo" (aldri
 *    telefonens posisjon); forrige runde la bare til et ekstra kort. Nå er «Min posisjon» (__gps) et eget sted øverst i Steder,
 *    standard for alle som ikke har valgt et sted selv, og hovedværet hentes for telefonens posisjon (appens egen posisjon).
 *  - Prøveperioder skjules uten aktive, Gjøremål lukker infosiden etter «Fullfør», Ruter-innstillinger bare i redigering,
 *    oppdatering «Står fast» (watchdog 3 min), Familie-ikoner, Mer-tittel uten tomrom, profilring, Bibel og Vær på Fold,
 *    QR-innlogging (vis QR i innloggingen + «Logg inn på annen enhet»), Kart, Nyheter, Google Photos-bakgrunn, Subscription-logg.
 * Serverformene lages parallelt (SERVER46/DATA46/GLIMT46); 404 = «finnes ikke på serveren ennå».
 */

/* ======================= Media: logg over kall ======================= */

data class MediaCall46(val at: Long, val method: String, val url: String, val status: Int, val auth: Boolean, val ms: Long, val err: String?)

/** De siste 30 Media-/Avspilling-kallene (fylles av Api.request). Tokenet logges aldri, bare om Authorization var med. */
object MediaLog46 {
    private val list = ArrayDeque<MediaCall46>()
    @Synchronized fun add(method: String, url: String, status: Int, auth: Boolean, ms: Long, err: String?) {
        list.addLast(MediaCall46(System.currentTimeMillis(), method, url.substringBefore("token="), status, auth, ms, err?.take(160)))
        while (list.size > 30) list.removeFirst()
        android.util.Log.i("Media46", "$method $url → $status (${ms} ms, auth=${if (auth) "ja" else "nei"})" + (err?.let { " · $it" } ?: ""))
    }
    @Synchronized fun recent(): List<MediaCall46> = list.toList().asReversed()
}

/* ======================= Tilstand ======================= */

data class QrShow46(val sid: String, val payload: String, val key: String?, val expiresAt: Long, val state: String, val match: String?, val who: String?)

class P46State {
    /* Media */
    var mediaDetails by mutableStateOf(false)
    var mediaCheckSeq by mutableIntStateOf(0)
    internal var mediaChecking = false
    /** «route» (serveren mangler ruten), «token» (utlogget), «upstream» (Sonarr/Radarr avviser nøkkelen) – for «Vis detaljer». */
    var mediaKind by mutableStateOf<String?>(null)
    var mediaWhen by mutableStateOf<String?>(null)

    /* Gjøremål */
    var doneAnim by mutableStateOf<String?>(null)
    var askSubs by mutableStateOf<String?>(null)
    var taskToast by mutableStateOf<TaskToast46?>(null)
    internal var toastJob: Job? = null

    /* Vær: Min posisjon */
    var wxGps by mutableStateOf<Boolean?>(null)
    var gpsName by mutableStateOf<String?>(null)
    var gpsState by mutableStateOf("idle") // idle · loading · denied · error · ok
    internal var gpsAt = 0L
    internal var gpsFix: Pair<Double, Double>? = null

    /* Oppdatering av serveren: watchdog */
    var updStuck by mutableStateOf(false)
    internal var updSig = ""
    internal var updSigAt = 0L
    var updBusy by mutableStateOf(false)

    /* Hjem-overgang på brett */
    internal var homeFromRail = false

    /* QR-innlogging */
    var qrShow by mutableStateOf<QrShow46?>(null)
    var qrShowOpen by mutableStateOf(false)
    var qrShowErr by mutableStateOf<String?>(null)
    internal var qrJob: Job? = null
    var qrSrv by mutableStateOf("")
    var scanOpen by mutableStateOf(false)

    /* Kart (Kart46.kt) */
    val kart = Kart46State()

    /* Nyheter, Google Photos-bakgrunn og Subscription-logg (P46b.kt) */
    val news = News46State()
    val subLog = SubLog46State()
    var gp by mutableStateOf<Gphoto46?>(null)
    var gpErr by mutableStateOf<String?>(null)
    var gpBusy by mutableStateOf(false)
    var gpSheet by mutableStateOf(false)
    internal var gpJob: Job? = null
}

data class TaskToast46(val id: String, val text: String, val undoDue: String?, val undoSubs: List<TaskSub37>?, val wasRep: Boolean)

/* ======================= Media: 401 kontrolleres før «Utlogget» ======================= */

private val PATH46 = Regex("""\((/[^)]*)\)""")
private val HM46 = DateTimeFormatter.ofPattern("HH:mm:ss")

/**
 * Kalles fra mediaErr44 når et Media-kall fikk 401 (eller TOKEN_REFUSED). Returnerer teksten som vises med en gang, og sjekker i
 * bakgrunnen om innloggingen faktisk er ugyldig (GET /api/me med samme token). Bare da blir det «Utlogget fra Homelab».
 */
internal fun AppViewModel.mediaAuth46(e: ApiException): String {
    val path = PATH46.find(e.message.orEmpty())?.groupValues?.getOrNull(1)?.removePrefix("/api") ?: "/media"
    p46.mediaWhen = LocalTime.now().format(HM46)
    if (e.code == "HOMELAB_AUTH") { p44.errKind = "token"; p46.mediaKind = "token"; return UTLOGGET46 }
    p44.errKind = "check"; p46.mediaKind = "check"
    val seq = ++p46.mediaCheckSeq
    launch46 {
        val ok = try { api46 { hlGet("/me", timeout = 8_000) }; true } catch (x: CancellationException) { throw x } catch (x: ApiException) {
            if (x.status == 401 || x.status == 403 && x.message?.startsWith(Api.TOKEN_REFUSED) == true) false else null
        } catch (x: Exception) { null }
        if (seq != p46.mediaCheckSeq) return@launch46
        when (ok) {
            false -> { p44.errKind = "token"; p46.mediaKind = "token"; if (p43.error != null) p43.error = UTLOGGET46; if (p44.playErr != null) p44.playErr = UTLOGGET46 }
            true -> {
                p44.errKind = "route"; p46.mediaKind = "route"
                val t = "Serveren avviste $path (401), men du er logget inn – resten av appen virker. Ruten finnes trolig ikke " +
                    "i Homelab-versjonen på serveren. Oppdater Homelab, eller trykk «Vis detaljer»."
                if (p43.error != null) p43.error = t
                if (p44.playErr != null) p44.playErr = t
            }
            null -> { p44.errKind = "down"; p46.mediaKind = "down"; if (p43.error != null) p43.error = "Svarer ikke: fikk ikke kontakt med Homelab ($base) for å sjekke innloggingen. Prøv igjen." }
        }
    }
    return "Media-kallet $path ble avvist (401). Sjekker innloggingen …"
}

private const val UTLOGGET46 = "Utlogget fra Homelab: serveren godtok ikke innloggingen (også /api/me avviser den). Logg inn på nytt under Kontoer og brukere."

/** 502 fra en tjeneste bak Homelab (Sonarr/Radarr avviser nøkkelen) er aldri «Utlogget». */
internal fun AppViewModel.mediaUpstream46(e: ApiException): String? {
    val m = e.message.orEmpty()
    if (e.code != "UPSTREAM_AUTH" && !m.contains("API-nøkkel", true) && !m.contains("brukernavn eller passord", true)) return null
    p44.errKind = "upstream"; p46.mediaKind = "upstream"; p46.mediaWhen = LocalTime.now().format(HM46)
    val svc = listOf("Sonarr", "Radarr", "qBittorrent", "Prowlarr", "Plex", "Jellyfin").firstOrNull { m.contains(it, true) } ?: "Tjenesten"
    return "$svc avviser API-nøkkelen på serveren (${if (e.status > 0) e.status else "feil"}). Sjekk nøkkelen under Integrasjoner → Media. Du er fortsatt logget inn."
}

/* ======================= Prøveperioder ======================= */

/** Minst én aktiv prøveperiode (ikke avsluttet, sluttdato i dag eller senere). */
fun AppViewModel.activeTrials46(): Boolean {
    val today = LocalDate.now(OSLO31)
    return p31.trials.any { it.status == "active" && !it.endsAt.isBefore(today) }
}

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
            val next = nextDue37(before.due, before.rep)
            patchTask37(id) { it.copy(due = next, subs = it.subs.map { s -> s.copy(done = false) }) }
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

/* ======================= Vær: Min posisjon ======================= */

private fun AppViewModel.wxKey46() = "vaer_city46_" + (account?.id ?: "")

/** Er «Min posisjon» valgt? Standard for alle som ikke har valgt et sted selv (også eksisterende brukere: «oslo» var aldri et valg). */
fun AppViewModel.wxGps46(): Boolean {
    p46.wxGps?.let { return it }
    val v = prefs.str(wxKey46(), "__gps")
    return (v == "__gps").also { p46.wxGps = it }
}

/** Et sted valgt i Steder (eller «__gps»). Lagres per konto lokalt. */
fun AppViewModel.wxPick46(id: String) {
    val gps = id == "__gps"
    p46.wxGps = gps
    prefs.set(wxKey46(), id)
}

@SuppressLint("MissingPermission")
private fun lastFix46(ctx: Context): Location? {
    if (!no.kristo.finanshub.family.FamilyService.hasLocation(ctx)) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching {
        listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }.maxByOrNull { it.time }
    }.getOrNull()
}

/** Ny posisjon med lav nøyaktighet (nett først), maks 10 s. */
@SuppressLint("MissingPermission")
private suspend fun freshFix46(ctx: Context): Location? {
    if (!no.kristo.finanshub.family.FamilyService.hasLocation(ctx)) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val prov = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) } ?: return null
    return withTimeoutOrNull(10_000L) {
        suspendCancellableCoroutine { cont ->
            try {
                if (Build.VERSION.SDK_INT >= 30) {
                    val sig = android.os.CancellationSignal()
                    cont.invokeOnCancellation { sig.cancel() }
                    lm.getCurrentLocation(prov, sig, ctx.mainExecutor) { l -> if (cont.isActive) cont.resume(l) }
                } else {
                    @Suppress("DEPRECATION")
                    lm.requestSingleUpdate(prov, object : android.location.LocationListener {
                        override fun onLocationChanged(l: Location) { if (cont.isActive) cont.resume(l) }
                        @Deprecated("") override fun onStatusChanged(p: String?, s: Int, b: android.os.Bundle?) {}
                        override fun onProviderEnabled(p: String) {}
                        override fun onProviderDisabled(p: String) {}
                    }, android.os.Looper.getMainLooper())
                }
            } catch (e: Exception) { if (cont.isActive) cont.resume(null) }
        }
    }
}

/**
 * Hovedværet for «Min posisjon»: siste kjente posisjon (≤ 10 min) med en gang, ellers en ny i bakgrunnen. Stedsnavn fra
 * serveren (GET /api/weather/here → place.name, cache på serveren). Feil: siste kjente posisjon, ellers første lagrede sted –
 * men valget «Min posisjon» beholdes.
 */
fun AppViewModel.openGps46(force: Boolean = false) {
    val ctx = appCtx46
    val s = p46
    if (!no.kristo.finanshub.family.FamilyService.hasLocation(ctx)) {
        s.gpsState = "denied"
        val fallback = s.gpsFix
        if (fallback != null) launch46 { loadGpsWeather46(fallback.first, fallback.second) } else loadWeather(wxPlaces.firstOrNull()?.id ?: "oslo")
        return
    }
    if (!force && s.gpsState == "ok" && System.currentTimeMillis() - s.gpsAt < 600_000L && weatherFull != null && weatherPlace.startsWith("geo:")) return
    s.gpsState = "loading"
    launch46 {
        val last = lastFix46(ctx)?.takeIf { System.currentTimeMillis() - it.time < 600_000L }
        if (last != null) loadGpsWeather46(last.latitude, last.longitude)
        val fresh = freshFix46(ctx) ?: lastFix46(ctx)
        if (fresh == null) {
            if (last == null) {
                s.gpsState = "error"
                val fb = s.gpsFix
                if (fb != null) loadGpsWeather46(fb.first, fb.second) else loadWeather(wxPlaces.firstOrNull()?.id ?: "oslo")
            }
            return@launch46
        }
        val moved = last == null || FloatArray(1).also { Location.distanceBetween(last.latitude, last.longitude, fresh.latitude, fresh.longitude, it) }[0] > 2_000f
        if (moved) loadGpsWeather46(fresh.latitude, fresh.longitude)
    }
}

private suspend fun AppViewModel.loadGpsWeather46(lat: Double, lon: Double) {
    val s = p46
    s.gpsFix = lat to lon
    val name = runCatching {
        val raw = api46 { hlGet(String.format(java.util.Locale.US, "/weather/here?lat=%.4f&lon=%.4f", lat, lon), timeout = 6_000) }
        JSONObject(raw).optJSONObject("place")?.s43("name", "city", "place")
    }.getOrNull() ?: s.gpsName
    s.gpsName = name
    s.gpsAt = System.currentTimeMillis()
    s.gpsState = "ok"
    if (wxGps46()) loadWeather(String.format(java.util.Locale.US, "geo:%.4f,%.4f,%s", lat, lon, (name ?: "Min posisjon").replace(",", " ")))
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
        } catch (e: Exception) { flash(e.message ?: "Fikk ikke startet på nytt") } finally { s.updBusy = false }
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
        } catch (e: Exception) { flash(e.message ?: "Fikk ikke avbrutt") } finally { s.updBusy = false }
    }
}

/** Vis logg: Logger filtrert på homelab-updater. */
fun AppViewModel.showUpdLog46() {
    p44.ct = "homelab-updater"
    p44.logQ = ""
    openLogs44()
}
