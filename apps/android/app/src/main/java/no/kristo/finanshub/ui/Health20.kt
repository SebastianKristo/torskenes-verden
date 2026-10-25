package no.kristo.finanshub.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.health.connect.client.PermissionController
import no.kristo.finanshub.*
import no.kristo.finanshub.family.FamilyPrefs
import no.kristo.finanshub.family.FamilyService
import no.kristo.finanshub.family.HealthSync

/* ================= Prompt 20: Innstillinger → App → Helse og posisjon, og onboarding steg 3 ================= */

/** Datatypene i menyen og helsefeltene de styrer (HEALTH_KEYS). «Batteri og bevegelse» følger posisjonen. */
private val HEALTH_TYPES = listOf(
    Triple("steps", "Skritt", setOf("steps", "week")),
    Triple("hr", "Puls og hvilepuls", setOf("hr", "restingHr")),
    Triple("sleep", "Søvn", setOf("sleep")),
    Triple("activity", "Aktivitet og trening", setOf("activeKcal")),
)
private val HEALTH_ALL_KEYS = HEALTH_TYPES.flatMap { it.third }.toSet()

private fun openHealthConnect(ctx: Context) {
    val actions = listOf("android.health.connect.action.HEALTH_HOME_SETTINGS", "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
    for (a in actions) {
        val ok = runCatching { ctx.startActivity(Intent(a).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true }.getOrDefault(false)
        if (ok) return
    }
    openAppSettings(ctx)
}

private fun openAppSettings(ctx: Context) {
    runCatching { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

private fun granted(ctx: Context, perm: String) = ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED

/** Hovedbryter, «Be om tilgang», bryter per type, posisjonsvalgene og snarveier til Health Connect og Android-innstillingene. */
@Composable
internal fun HealthPosPage(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val hc by produceState(-1) { value = HealthSync.statusIo(ctx) }
    var keys by remember { mutableStateOf(FamilyPrefs.health(ctx)) }
    var sensors by remember { mutableStateOf(FamilyPrefs.sensors(ctx)) }
    var background by remember { mutableStateOf(FamilyPrefs.background(ctx)) }
    var pending by remember { mutableStateOf<Set<String>?>(null) }
    val me = vm.family?.me
    LaunchedEffect(Unit) { if (vm.family == null) vm.loadFamily() }
    val master = keys.isNotEmpty()

    val hcPerm = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { got: Set<String> ->
        val want = pending ?: keys
        pending = null
        if (got.isEmpty() && want.isNotEmpty()) vm.message = "Health Connect ga ikke tilgang. Prøv «Be om tilgang», eller gi tilgang i Health Connect."
        keys = want
        vm.famSetHealth(want)
    }
    fun ask(want: Set<String>) {
        val perms = if (want.isEmpty()) HealthSync.allPermissions() else HealthSync.permissionsFor(want)
        if (hc != 0) { vm.message = if (hc == 1) "Health Connect må installeres eller oppdateres fra Play Butikk." else "Health Connect finnes ikke på denne telefonen."; return }
        pending = want
        vm.healthAskedNow()
        try { hcPerm.launch(perms) } catch (e: Exception) { pending = null; vm.message = "Fikk ikke åpnet Health Connect: ${e.message ?: "ukjent feil"}" }
    }

    val bgPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        background = ok; FamilyPrefs.putBackground(ctx, ok); FamilyService.sync(ctx)
        if (!ok) vm.message = "Velg «Tillat alltid» for Homelab i Android-innstillingene for deling i bakgrunnen."
    }
    val locPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r: Map<String, Boolean> ->
        if (r.values.any { it }) vm.famSetSharing("on") else vm.message = "Posisjon er ikke tillatt. Slå det på i Android-innstillingene for Homelab."
    }
    val finePerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> vm.famSetPrecision(if (ok) "exact" else "approx") }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // Prompt 42: HELSE (FAMILIE) – Apple Health, Health Connect, hva som deles og Home Assistant · Mobilapp (ui/Ui42.kt).
        HealthFamily42(vm, hc, keys) { ask(if (keys.isNotEmpty()) keys else HEALTH_ALL_KEYS) }
        PLabel("Helse · Health Connect", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        when (hc) {
            1 -> Text("Health Connect må installeres eller oppdateres fra Play Butikk.", color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
            2 -> Text("Health Connect finnes ikke på denne telefonen.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
        }
        PCard {
            PToggle("Del helsedata", "Familien ser skritt, puls, søvn og aktivitet", master) { on ->
                if (on) ask(HEALTH_ALL_KEYS) else { keys = emptySet(); vm.healthMasterOff() }
            }
            PRow("Be om tilgang", "Åpner Health Connect-dialogen", "›", serif = false, top = true) { ask(if (master) keys else HEALTH_ALL_KEYS) }
        }
        PLabel("Datatyper", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            HEALTH_TYPES.forEachIndexed { i, (_, name, ks) ->
                PToggle(name, null, master && ks.any { it in keys }, top = i > 0) { on ->
                    val next = if (on) keys + ks else keys - ks
                    if (next.isEmpty()) { keys = emptySet(); vm.healthMasterOff() }
                    else if (on) ask(next) else { keys = next; vm.famSetHealth(next) }
                }
            }
            PToggle("Batteri og bevegelse", "Sendes sammen med posisjonen", sensors, top = true) { on -> sensors = on; FamilyPrefs.putSensors(ctx, on) }
        }
        PLabel("Posisjon", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PToggle("Del med familien", if (me?.sharing == "paused") "Satt på pause" else null, me?.sharing == "on") { on ->
                if (!on) vm.famSetSharing("off")
                else if (FamilyService.hasLocation(ctx)) vm.famSetSharing("on")
                else locPerm.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            }
            PToggle("Presis posisjon", "Av: rundet av til ca. 1 km", me?.precision != "approx", top = true) { on ->
                if (on && !granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION)) finePerm.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                else vm.famSetPrecision(if (on) "exact" else "approx")
            }
            PToggle("Også i bakgrunnen", "Deler når appen er lukket, med varsel i statuslinjen", background, top = true) { on ->
                if (on && Build.VERSION.SDK_INT >= 29 && !granted(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION)) bgPerm.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                else { background = on; FamilyPrefs.putBackground(ctx, on); FamilyService.sync(ctx) }
            }
        }
        PCard(modifier = Modifier.padding(top = 10.dp)) {
            PRow("Åpne Health Connect", "Health Connect → Apptillatelser → Homelab", "↗", serif = false) { openHealthConnect(ctx) }
            PRow("Åpne Android-innstillinger", "Apper → Homelab → Tillatelser", "↗", serif = false, top = true) { openAppSettings(ctx) }
        }
        Text("Health Connect sier ikke om appen får lese data. Viser Familie «Ingen data», sjekk tilgangen i Health Connect.",
            color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(4.dp))
    }
}

/**
 * Onboarding steg 3: radene «Posisjon» og «Health Connect». Ved «Ferdig» med helse på åpnes Health Connect-dialogen med
 * skritt, puls, hvilepuls, søvn og trening, og onboardingen fullføres når dialogen lukkes.
 */
@Composable
internal fun rememberOnboardFinish(vm: AppViewModel): Pair<OnboardAccessState, () -> Unit> {
    val ctx = LocalContext.current
    val st = remember { OnboardAccessState(FamilyService.hasLocation(ctx), false) }
    val hcPerm = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { got: Set<String> ->
        if (got.isNotEmpty()) vm.famSetHealth(HEALTH_ALL_KEYS)
        vm.finishOnboarding()
    }
    val finish: () -> Unit = {
        if (st.location && FamilyService.hasLocation(ctx)) vm.famSetSharing("on")
        val hcOk = runCatching { HealthSync.status(ctx) }.getOrDefault(2) == 0
        if (st.health && hcOk) {
            vm.healthAskedNow()
            try { hcPerm.launch(HealthSync.allPermissions()) } catch (_: Exception) { vm.finishOnboarding() }
        } else vm.finishOnboarding()
    }
    return st to finish
}

internal class OnboardAccessState(location: Boolean, health: Boolean) {
    var location by mutableStateOf(location)
    var health by mutableStateOf(health)
}

@Composable
internal fun OnboardAccessRows(st: OnboardAccessState) {
    val ctx = LocalContext.current
    val locPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r: Map<String, Boolean> -> st.location = r.values.any { it } }
    PToggle("Posisjon", "Del hvor du er med familien (kan pauses)", st.location, top = true) { on ->
        if (on && !FamilyService.hasLocation(ctx)) locPerm.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        else st.location = on
    }
    PToggle("Health Connect", "Skritt, puls, søvn og trening i Familie", st.health, top = true) { on -> st.health = on }
}
