package no.kristo.finanshub.ui

import no.kristo.finanshub.uiErr73

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.ApiException
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.openCustomTab24
import no.kristo.finanshub.loadUpd30
import no.kristo.finanshub.loadUpdSettings30
import org.json.JSONObject

/*
 * Prompt 28: Innstillinger → System → Oppdatering (bare admin). Viser installert og nyeste versjon fra
 * GET /api/system/update (virker med app-token). Oppdateringen startes bare i nettleseren (økt + passord), så
 * «Oppdater i nettleseren» åpner <server>/#/innstillinger/system i en Custom Tab. Mangler API-et: «Ikke tilgjengelig».
 */

class Upd28State {
    var loaded by mutableStateOf(false)
    var loading by mutableStateOf(false)
    /** API-et finnes ikke på serveren (404). */
    var missing by mutableStateOf(false)
    var error by mutableStateOf("")
    var available by mutableStateOf(false)
    var installed by mutableStateOf("–")
    var latest by mutableStateOf("–")
    var updateAvailable by mutableStateOf(false)
    var running by mutableStateOf(false)
    var latestError by mutableStateOf("")
}

private fun ver28(o: JSONObject?): String {
    if (o == null) return "–"
    val v: String = o.optString("version").takeIf { it.isNotBlank() && it != "null" } ?: ""
    val sha: String = (o.optString("sha").takeIf { it.isNotBlank() && it != "null" } ?: "").take(7)
    val parts: List<String> = listOf(v, sha).filter { it.isNotEmpty() }
    return if (parts.isEmpty()) "–" else parts.joinToString(" · ")
}

/** Henter status fra serveren. */
fun AppViewModel.loadUpd28() {
    val s: Upd28State = upd28
    if (s.loading) return
    s.loading = true
    launchUpd28 {
        try {
            val body: String = apiUpd28 { hlGet("/system/update") }
            val o = JSONObject(body)
            s.installed = ver28(o.optJSONObject("installed"))
            s.latest = ver28(o.optJSONObject("latest"))
            s.available = o.optBoolean("available", false)
            s.updateAvailable = o.optBoolean("updateAvailable", false)
            s.running = o.optBoolean("running", false)
            s.latestError = if (o.isNull("latestError")) "" else o.optString("latestError")
            s.missing = false
            s.error = ""
            s.loaded = true
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) { s.missing = true; s.error = "" } else s.error = e.message ?: "Feil"
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
            s.error = uiErr73(e, "Feil")
        } finally {
            s.loading = false
        }
    }
}

/** Nettsiden med Innstillinger → System åpent. */
internal fun upd28WebUrl(vm: AppViewModel): String {
    val b: String = vm.base.ifBlank { vm.account?.server ?: "" }.trimEnd('/')
    return "$b/#/innstillinger/system"
}

    else "Trykk «Oppdater ›» og skriv passordet ditt på nytt. Serveren tar backup av databasen og starter på nytt (vanligvis 2–5 minutter)."
