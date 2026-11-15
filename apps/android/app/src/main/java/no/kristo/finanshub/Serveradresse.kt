package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import no.kristo.felles.nett.LokaltNett
import org.json.JSONObject

data class Srv41(val local: String, val external: String, val auto: Boolean)

/* ======================= Server: lokal og ekstern adresse ======================= */

fun AppViewModel.loadServer41() {
    val s = p41
    launch41 {
        val a = account ?: return@launch41
        val raw = try { api41 { hlGet("/me/server", timeout = 6_000) } } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) s.srvMissing = true; null
        } catch (_: Exception) { null }
        val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
        val local = o?.s37("local") ?: a.local
        val ext = o?.s37("external") ?: a.external.ifBlank { a.server }
        val auto = o?.let { if (it.has("auto")) it.optBoolean("auto", true) else null } ?: flag(AppPrefs.USE_LOCAL, true)
        s.srv = Srv41(local, ext, auto)
        // Mangler lokal adresse: hent den fra /api/discovery (uinnlogget, ingen hemmeligheter).
        if (local.isBlank()) discovery41()?.let { (l, x) ->
            if (l.isNotBlank()) { s.srv = Srv41(l, ext.ifBlank { x }, auto); updateAddresses(l, a.external.ifBlank { x }) }
        }
    }
}

/** GET /api/discovery → (første lokale adresse, ekstern). null = eldre server. */
suspend fun AppViewModel.discovery41(): Pair<String, String>? = runCatching {
    val o = JSONObject(api41 { hlGet("/discovery", timeout = 5_000) })
    val loc = o.optJSONArray("local")?.let { a -> (0 until a.length()).map { a.optString(it) }.firstOrNull { it.startsWith("http") } } ?: o.s37("local") ?: ""
    loc to (o.s37("external") ?: "")
}.getOrNull()

fun validUrl41(u: String): Boolean = Regex("^https?://[^\\s/]+(:\\d+)?(/.*)?$").matches(u.trim())

/** «Test»: «✓ Homelab svarer på … · 12 ms» eller en feilmelding. */
fun AppViewModel.testServer41(url: String) {
    val s = p41
    val u = url.trim()
    if (!validUrl41(u)) { s.srvTest = "Adressen må starte med http:// eller https://"; s.srvTestOk = false; return }
    s.srvBusy = true; s.srvTest = null
    launch41 {
        val t0 = System.currentTimeMillis()
        val ok = try { Api(u, account?.token).request("GET", "/discovery", prefix = Api.HOMELAB, timeout = 4_000, read = 4_000); true } catch (e: ApiException) {
            e.status in 200..499 // svarer, men uten /discovery (eldre server) eller krever innlogging
        } catch (_: Exception) { false }
        val ms = System.currentTimeMillis() - t0
        s.srvTestOk = ok
        s.srvTest = if (ok) "✓ Homelab svarer på ${u.substringAfter("://").trimEnd('/')} · $ms ms" else "Fikk ikke kontakt med ${u.substringAfter("://").trimEnd('/')}"
        s.srvBusy = false
    }
}

/** Lagrer på serveren (PUT /api/me/server, synkes til Kalender og andre enheter) og lokalt på kontoen. */
fun AppViewModel.saveServer41(local: String, external: String, auto: Boolean) {
    val s = p41
    val l = local.trim(); val x = external.trim()
    if ((l.isNotEmpty() && !validUrl41(l)) || (x.isNotEmpty() && !validUrl41(x))) { s.srvTest = "Adressen må starte med http:// eller https://"; s.srvTestOk = false; return }
    s.srv = Srv41(l, x, auto)
    s.srvSheet = null; s.srvTest = null
    setPref(AppPrefs.USE_LOCAL, auto)
    launch41 {
        runCatching { api41 { hlPut("/me/server", JSONObject().put("local", l).put("external", x).put("auto", auto)) } }
        updateAddresses(l, x)
        message = "Serveradressen er lagret"
    }
}

const val DEFAULT_EXTERNAL47 = "https://os.smarthjemeksperten.no" // prompt 89: riktig stavemåte (Regel89.EXTERNAL)
// Standard ekstern adresse. Må stå etter DEFAULT_EXTERNAL47: en const val kan ikke vise til en senere const i samme fil.
const val DEFAULT_SERVER41 = DEFAULT_EXTERNAL47

const val DEFAULT_LOCAL47 = "http://10.69.1.39:3000"

/** Grense for «lokal svarer» (spesifikasjonen: 1,5 s). */
const val LOCAL_TIMEOUT47 = 1_500

const val PREF_OCR_LOCAL47 = "ocr_local47"

/** Status for én adresse i Innstillinger → Server. ok=null: tester nå. */
data class SrvStatus47(val ok: Boolean?, val ms: Long = 0, val note: String? = null)

class P47State {
    /** Standardverdier fra serveren (/api/config/servers), ellers konstantene over. */
    var defExternal by mutableStateOf(DEFAULT_EXTERNAL47)
    var defLocal by mutableStateOf(DEFAULT_LOCAL47)
    internal var configFor: String? = null
    /** "local" | "external" → status. */
    val status = mutableStateMapOf<String, SrvStatus47>()

    /* Kvitteringer: prompt 48 (ReceiptScan48.kt, vm.scan48). */
}

internal fun hostOf47(u: String?): String? = u?.trim()?.takeIf { it.isNotEmpty() }?.let { runCatching { java.net.URI(Api.normalizeServer(it)).host?.lowercase() }.getOrNull() }

/** Prompt 86: http:// er bare tillatt på lokalt nett (LokaltNett.kt) – ikke lenger bare til én fast adresse. */
fun cleartextBlocked47(u: String): Boolean = !LokaltNett.ok(u)

/** Offentlig konfig fra en adresse, uten token: (publicUrl, localUrl). null = svarer ikke. Kaster ikke. */
internal suspend fun probeConfig47(url: String, timeout: Int): Pair<String?, String?>? {
    val api = Api(url, null)
    return try {
        val o = JSONObject(api.request("GET", "/config/servers", prefix = Api.HOMELAB, timeout = timeout, read = timeout))
        o.optString("publicUrl").takeIf { it.isNotBlank() } to o.optString("localUrl").takeIf { it.isNotBlank() }
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 0) return null
        // Eldre server (404) eller annet svar: prøv /api/discovery (offentlig, finnes siden prompt 41).
        runCatching {
            val o = JSONObject(api.request("GET", "/discovery", prefix = Api.HOMELAB, timeout = timeout, read = timeout))
            (o.optString("external").takeIf { it.isNotBlank() }) to null
        }.getOrElse { null to null }
    } catch (_: Exception) { null }
}

/**
 * Er [local] samme server som [external]? Svarer den ikke innen 1,5 s → false. Oppgir den en offentlig adresse, må verten være
 * den eksterne. Oppgir den ingenting (eldre server), godtas bare en adresse brukeren selv har lagt inn (ikke standardverdien),
 * slik at tokenet aldri sendes til en tilfeldig maskin med samme IP på et fremmed nett.
 */
internal suspend fun localIsOurs47(local: String, vararg external: String?): Boolean {
    if (local.isBlank()) return false
    val (pub, _) = probeConfig47(local, LOCAL_TIMEOUT47) ?: return false
    // Kontoens eksterne adresse og innloggingsadressen (eldre kontoer kan ha logget inn på et annet domene enn PUBLIC_URL).
    val ours = external.mapNotNull { hostOf47(it) }.toSet()
    if (pub != null) return ours.isEmpty() || hostOf47(pub) in ours
    return hostOf47(local) != hostOf47(DEFAULT_LOCAL47)
}

/** GET /api/config/servers etter innlogging: standardverdiene serveren bruker (PUBLIC_URL/LOCAL_URL). 404 → konstantene. */
fun AppViewModel.loadConfig47() {
    val s = p47
    val id = account?.id ?: return
    if (s.configFor == id) return
    s.configFor = id
    launch47 {
        val o = try { JSONObject(api47 { hlGet("/config/servers", timeout = 6_000) }) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
        o?.optString("publicUrl")?.takeIf { validUrl41(it) }?.let { s.defExternal = it.trimEnd('/') }
        o?.optString("localUrl")?.takeIf { validUrl41(it) }?.let { s.defLocal = it.trimEnd('/') }
        prefill47()
    }
}

/**
 * «Forhåndsutfylt ved første oppstart»: mangler kontoen lokal adresse og er den eksterne vår standardvert, fylles den lokale
 * standardadressen inn (lagres lokalt; synkes først når brukeren lagrer i Innstillinger → Server).
 */
fun AppViewModel.prefill47() {
    val a = account ?: return
    if (a.local.isNotBlank()) return
    val ext = a.external.ifBlank { a.server }
    val ours = hostOf47(ext)?.let { it == hostOf47(p47.defExternal) || it == hostOf47(DEFAULT_EXTERNAL47) } == true
    if (!ours) return
    updateAddresses(p47.defLocal, a.external)
}

/** Status under et felt: «Svarer · 34 ms» eller «Svarer ikke». Uten token. */
fun AppViewModel.probe47(which: String, url: String) {
    val s = p47
    val u = url.trim()
    if (!validUrl41(u)) { s.status[which] = SrvStatus47(false, note = "Adressen må starte med http:// eller https://"); return }
    if (cleartextBlocked47(u)) { s.status[which] = SrvStatus47(false, note = LokaltNett.MSG); return }
    s.status[which] = SrvStatus47(null)
    launch47 {
        val t0 = System.currentTimeMillis()
        val r = probeConfig47(u, if (which == "local") LOCAL_TIMEOUT47 else 5_000)
        val ms = System.currentTimeMillis() - t0
        val ours = listOfNotNull(p41.srv?.external, account?.external, account?.server).mapNotNull { hostOf47(it) }.toSet()
        val other = which == "local" && r?.first != null && ours.isNotEmpty() && hostOf47(r.first) !in ours
        s.status[which] = when {
            r == null -> SrvStatus47(false)
            other -> SrvStatus47(false, ms, "Svarer, men er en annen server (${hostOf47(r.first)})")
            else -> SrvStatus47(true, ms)
        }
    }
}

/** «Tilbakestill til standard»: begge feltene til standardverdiene (lagres og synkes som en vanlig endring). */
fun AppViewModel.resetServer47() {
    val auto = p41.srv?.auto ?: flag(AppPrefs.USE_LOCAL, true)
    p47.status.clear()
    launch47 {
        // PUT /api/me/server {reset:true} → serverens standardverdier (PUBLIC_URL/LOCAL_URL eller konstantene), synkes til andre enheter.
        val o = try {
            JSONObject(api47 { hlPut("/me/server", JSONObject().put("reset", true).put("auto", auto).put("device", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".trim().take(60))) })
        } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
        val l = o?.optString("local")?.takeIf { validUrl41(it) } ?: p47.defLocal
        val x = o?.optString("external")?.takeIf { validUrl41(it) } ?: p47.defExternal
        if (o == null) saveServer41(l, x, auto) else { p41.srv = Srv41(l, x, auto); updateAddresses(l, x) }
        probe47("local", l); probe47("external", x)
        message = "Serveradressene er tilbakestilt"
    }
}

/** Innlogging: ekstern først (passordet går over https). Svarer den ikke, og den lokale standardadressen er vår server, brukes den. */
internal suspend fun loginVia47(srv: String): String? {
    if (hostOf47(srv) != hostOf47(DEFAULT_EXTERNAL47)) return null
    return if (localIsOurs47(DEFAULT_LOCAL47, srv)) DEFAULT_LOCAL47 else null
}
