package no.kristo.finanshub.ui

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
        } catch (e: Exception) {
            s.error = e.message ?: "Feil"
        } finally {
            s.loading = false
        }
    }
}

/** Kortstatus til raden i Innstillinger. */
internal fun upd28Summary(s: Upd28State): String = when {
    s.missing -> "Ikke tilgjengelig"
    !s.loaded -> "Versjon og oppdatering"
    s.running -> "Oppdatering pågår …"
    !s.available -> "Installert ${s.installed} · ikke satt opp"
    s.updateAvailable -> "Ny versjon: ${s.latest}"
    else -> "Installert ${s.installed}"
}

/** Nettsiden med Innstillinger → System åpent. */
internal fun upd28WebUrl(vm: AppViewModel): String {
    val b: String = vm.base.ifBlank { vm.account?.server ?: "" }.trimEnd('/')
    return "$b/#/innstillinger/system"
}

@Composable
internal fun Update28Page(vm: AppViewModel) {
    val p = PaperPal.current
    val s: Upd28State = vm.upd28
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { if (vm.userIsAdmin) { vm.loadUpd28(); vm.loadUpd30(force = true); vm.loadUpdSettings30() } }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PLabel("Oppdatering", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        if (!vm.userIsAdmin) {
            PCard { PRow("Oppdatering", "Gjøres av en administrator", "Bare admin", serif = false) }
            return@Column
        }
        // Prompt 30: banneret og PROGRAMVARE (oppdater fra appen med passord); nettleseren er bare en sekundær vei.
        UpdateBanner30(vm, home = false)
        PCard { Programvare30(vm) }
        PCard { Update28Rows(s) }
        Text(upd28Note(s), color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
        PButton("Oppdater i nettleseren ›", Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { openCustomTab24(ctx, upd28WebUrl(vm)) }
        PButton(if (s.loading) "Henter …" else "Se etter på nytt", Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { vm.loadUpd28() }
    }
}

@Composable
private fun Update28Rows(s: Upd28State) {
    val p = PaperPal.current
    if (s.missing) {
        PRow("Oppdatering fra appen", "Serveren har ikke denne funksjonen ennå", "Ikke tilgjengelig", serif = false)
        return
    }
    if (!s.loaded) {
        PRow("Oppdatering", s.error.ifBlank { "Henter versjon fra serveren" }, if (s.loading) "Laster …" else "–", serif = false)
        return
    }
    val latestSub: String = when {
        s.latestError.isNotBlank() -> "Kunne ikke hente fra GitHub"
        s.updateAvailable -> "Ny versjon er tilgjengelig"
        else -> "Du har nyeste versjon"
    }
    PRow("Installert versjon", "På serveren", s.installed, serif = false)
    PRow("Nyeste versjon", latestSub, s.latest, valueColor = if (s.updateAvailable) p.pos else p.mut, serif = false, top = true)
    if (s.running) PRow("Status", "Følg med i nettleseren", "Pågår …", valueColor = p.lab, serif = false, top = true)
    else if (!s.available) PRow("Oppdatering fra appen", "Kjør update.sh én gang fra Proxmox", "Ikke satt opp", serif = false, top = true)
}

private fun upd28Note(s: Upd28State): String =
    if (s.missing || (s.loaded && !s.available)) "Kjør update.sh én gang fra Proxmox for å slå på oppdatering fra appen. Kommandoen finnes på nettsiden under Innstillinger → System."
    else "Trykk «Oppdater ›» og skriv passordet ditt på nytt. Serveren tar backup av databasen og starter på nytt (vanligvis 2–5 minutter)."
