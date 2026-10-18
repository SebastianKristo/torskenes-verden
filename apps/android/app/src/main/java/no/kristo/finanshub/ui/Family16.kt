package no.kristo.finanshub.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.health.connect.client.PermissionController
import no.kristo.finanshub.*
import no.kristo.finanshub.family.FamilyService
import no.kristo.finanshub.family.HealthSync

/* ---------------- Familie og kart ---------------- */

/**
 * Familie: posisjon, soner og helse. Selve siden er tegnet etter Familie.dc.html i Family22.kt (prompt 22).
 * Her ligger tillatelsene (posisjon, «Alltid», varsler) og personvern-/helsearket.
 */
@Composable
internal fun FamilyScreen(vm: AppViewModel) {
    val ctx = LocalContext.current
    // Posisjon: først «Når i bruk», deretter «Alltid» (Android 10+) så delingen virker i bakgrunnen.
    val bgPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { FamilyService.sync(ctx) }
    var shareAfter by remember { mutableStateOf(true) }
    val locPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r: Map<String, Boolean> ->
        if (r.values.any { it }) {
            if (Build.VERSION.SDK_INT >= 29 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) bgPerm.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            if (shareAfter) vm.famSetSharing("on") else vm.flash("GPS er på")
        } else vm.message = "Tilgang til posisjon ble avslått. Slå det på i Android-innstillingene for FinansHub."
    }
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val startSharing: () -> Unit = {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
        if (FamilyService.hasLocation(ctx)) vm.famSetSharing("on")
        else { shareAfter = true; locPerm.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }
    }
    val askLocation: () -> Unit = {
        shareAfter = false
        locPerm.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }
    Family22Screen(vm, startSharing, askLocation)
    if (vm.famPrivacy) PrivacySheet(vm, startSharing)
}

/** Personvern og helse: pause/av, nøyaktig eller omtrentlig posisjon, og hvilke helsedata som deles (Health Connect). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PrivacySheet(vm: AppViewModel, startSharing: () -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val me = vm.family?.me
    var health by remember { mutableStateOf(me?.shareHealth?.filterValues { it }?.keys ?: emptySet()) }
    val hcStatus by produceState(-1) { value = HealthSync.statusIo(ctx) }
    val hcPerm = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        if (granted.isEmpty() && health.isNotEmpty()) vm.message = "Health Connect ga ikke tilgang. Velg feltene på nytt, eller gi tilgang i Health Connect."
        vm.famSetHealth(health)
    }
    ModalBottomSheet(onDismissRequest = { vm.famPrivacy = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PSerif("Personvern", 26.sp)
            Text("De andre ser at delingen er pauset eller av. Posisjoner lagres i 7 dager, helse i 30 dager.", color = p.mut, fontSize = 13.sp)
            PLabel("Deling")
            PCard {
                PRow("Del posisjonen", "Også i bakgrunnen, med varsel i statuslinjen", if (me?.sharing == "on") "✓" else "", p.pos, serif = false) { startSharing() }
                PRow("Pause", "De andre ser «Pause»", if (me?.sharing == "paused") "✓" else "", p.pos, serif = false, top = true) { vm.famSetSharing("paused") }
                PRow("Slå av", "Ingen posisjon deles", if (me?.sharing == "off") "✓" else "", p.pos, serif = false, top = true) { vm.famSetSharing("off") }
            }
            PLabel("Hvor nøyaktig")
            PCard {
                PRow("Nøyaktig", "GPS, ned til noen meter", if (me?.precision != "approx") "✓" else "", p.pos, serif = false) { vm.famSetPrecision("exact") }
                PRow("Omtrentlig", "Rundet av til ca. 1 km, uten fart", if (me?.precision == "approx") "✓" else "", p.pos, serif = false, top = true) { vm.famSetPrecision("approx") }
            }
            PLabel("Helse (Health Connect)")
            when (hcStatus) {
                -1 -> Text("Sjekker Health Connect …", color = p.mut, fontSize = 13.sp)
                2 -> Text("Health Connect finnes ikke på denne telefonen.", color = p.mut, fontSize = 13.sp)
                1 -> Text("Health Connect må installeres eller oppdateres fra Play Butikk.", color = p.lab, fontSize = 13.sp)
                else -> {
                    PCard {
                        HEALTH_KEYS.forEachIndexed { i, (k, n) ->
                            PToggle(n, null, k in health, top = i > 0) { on -> health = if (on) health + k else health - k }
                        }
                    }
                    PButton("Lagre helsedeling", Modifier.fillMaxWidth()) {
                        val perms = HealthSync.permissionsFor(health)
                        if (perms.isEmpty()) vm.famSetHealth(health)
                        else try { vm.healthAskedNow(); hcPerm.launch(perms) } catch (e: Exception) { vm.message = "Fikk ikke åpnet Health Connect: ${e.message ?: "ukjent feil"}" }
                    }
                    Text("Bare det du velger, sendes til serveren, som et sammendrag hvert 15. minutt.", color = p.mut, fontSize = 12.sp)
                }
            }
        }
    }
}
