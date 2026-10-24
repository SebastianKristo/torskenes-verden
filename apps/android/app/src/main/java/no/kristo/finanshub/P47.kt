package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

/*
 * Prompt 47 (ANDROID47) – design_handoff_homelab/prompts/prompt-47-pakke/:
 *  - Standard serveradresser (claude-code-standard-serveradresser.md): ekstern https://os.smarthjemexperten.no, lokal
 *    http://10.69.1.39:3000. Serveren kan overstyre dem (PUBLIC_URL/LOCAL_URL → GET /api/config: publicUrl offentlig, localUrl etter
 *    innlogging). Innstillinger → Server: to felt med status («Svarer · 34 ms» / «Svarer ikke»), Test og «Tilbakestill til standard»
 *    (ui/Ui47.kt). Lagres på kontoen (PUT /api/me/server, synkes til andre enheter) som før (P41.kt).
 *  - Valg av adresse: lokal når den svarer innen 1,5 s OG er samme server (publicUrl/discovery peker på den eksterne verten), ellers
 *    ekstern. Byttes på nytt ved nettverksendring. Tokenet sendes ikke til den lokale adressen før identiteten er sjekket uten token.
 *  - Klartekst bare til 10.69.1.39 (res/xml/network_security_config.xml).
 *  - Innlogging: passordet sendes over https til den eksterne adressen; lokal adresse brukes bare som reserve når ekstern ikke svarer.
 *  - Kvitteringer med ML Kit på telefonen (ReceiptOcr47.kt).
 * Nye endepunkter tåler 404 (eldre server): da brukes standardverdiene og /api/discovery.
 */

const val DEFAULT_EXTERNAL47 = "https://os.smarthjemexperten.no"
const val DEFAULT_LOCAL47 = "http://10.69.1.39:3000"
/** Grense for «lokal svarer» (spesifikasjonen: 1,5 s). */
const val LOCAL_TIMEOUT47 = 1_500
const val PREF_OCR_LOCAL47 = "ocr_local47"

/** Status for én adresse i Innstillinger → Server. ok=null: tester nå. */
data class SrvStatus47(val ok: Boolean?, val ms: Long = 0, val note: String? = null)

class P47State {
    /** Standardverdier fra serveren (/api/config), ellers konstantene over. */
    var defExternal by mutableStateOf(DEFAULT_EXTERNAL47)
    var defLocal by mutableStateOf(DEFAULT_LOCAL47)
    internal var configFor: String? = null
    /** "local" | "external" → status. */
    val status = mutableStateMapOf<String, SrvStatus47>()

    /* Kvittering med ML Kit (ReceiptOcr47.kt) */
    var scan by mutableStateOf<ReceiptScanUiState47>(ReceiptScanUiState47.Idle)
    internal var scanUri: Uri? = null
    internal var scanJob: kotlinx.coroutines.Job? = null
}

internal fun hostOf47(u: String?): String? = u?.trim()?.takeIf { it.isNotEmpty() }?.let { runCatching { java.net.URI(Api.normalizeServer(it)).host?.lowercase() }.getOrNull() }

/** http:// er bare tillatt til den lokale standardadressen (network_security_config). */
fun cleartextBlocked47(u: String): Boolean {
    val t = u.trim()
    if (!t.startsWith("http://", true)) return false
    return hostOf47(t) != hostOf47(DEFAULT_LOCAL47)
}

/** Offentlig konfig fra en adresse, uten token: (publicUrl, localUrl). null = svarer ikke. Kaster ikke. */
internal suspend fun probeConfig47(url: String, timeout: Int): Pair<String?, String?>? {
    val api = Api(url, null)
    return try {
        val o = JSONObject(api.request("GET", "/config", prefix = Api.HOMELAB, timeout = timeout, read = timeout))
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

/** GET /api/config etter innlogging: standardverdiene serveren bruker (PUBLIC_URL/LOCAL_URL). 404 → konstantene. */
fun AppViewModel.loadConfig47() {
    val s = p47
    val id = account?.id ?: return
    if (s.configFor == id) return
    s.configFor = id
    launch47 {
        val o = try { JSONObject(api47 { hlGet("/config", timeout = 6_000) }) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
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
    if (cleartextBlocked47(u)) { s.status[which] = SrvStatus47(false, note = "Android tillater bare http:// til ${hostOf47(DEFAULT_LOCAL47)}. Bruk https://."); return }
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
