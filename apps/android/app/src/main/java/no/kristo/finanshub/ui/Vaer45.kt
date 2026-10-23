package no.kristo.finanshub.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import no.kristo.finanshub.family.FamilyService

/*
 * Prompt 45 (claude-code-vaer-min-posisjon-popup.md, fasit Vaer.dc.html): kortet «MIN POSISJON» øverst i Vær – været der telefonen er
 * (siste kjente posisjon fra telefonen selv, aldri fra serveren eller en annen enhet). Avslått posisjon: «Slå på posisjon …» + «Tillat».
 * Er valgt sted = min posisjon (innen 2 km, sameAsSelected fra serveren), vises bare ett kort (dette skjules).
 * Oppdateres når appen kommer i forgrunnen, maks hvert 10. minutt.
 */

@SuppressLint("MissingPermission")
private fun lastLocation45(ctx: Context): Location? {
    if (!FamilyService.hasLocation(ctx)) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching {
        listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }.maxByOrNull { it.time }
    }.getOrNull()
}

@Composable
internal fun HereCard45(vm: AppViewModel, w: WeatherFull?) {
    val ctx = LocalContext.current
    val s = vm.p45
    var granted by remember { mutableStateOf(FamilyService.hasLocation(ctx)) }
    fun refresh(force: Boolean) {
        granted = FamilyService.hasLocation(ctx)
        if (!granted) { s.hereState = "denied"; return }
        val l = lastLocation45(ctx) ?: run { if (s.here == null) s.hereState = "error"; return }
        vm.loadHere45(l.latitude, l.longitude, w?.lat, w?.lon, force)
    }
    // Mens Vær er åpent: sjekk på nytt hvert 10. minutt (loadHere45 henter maks hvert 10. min), og raskt etter «Tillat».
    LaunchedEffect(w?.placeId) {
        refresh(false)
        var n = 0
        while (true) {
            kotlinx.coroutines.delay(if (!granted) 1_500L else 600_000L)
            val was = granted
            refresh(!was && FamilyService.hasLocation(ctx))
            if (++n > 400) break
        }
    }
    val h = s.here
    if (s.hereState == "missing") return // eldre server uten /api/weather/here
    if (h != null && h.same) return
    val glass = Color.White.copy(alpha = .14f)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(glass).padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("➤", color = Color.White, fontSize = 11.sp)
            Text("MIN POSISJON", color = Color.White.copy(alpha = .85f), fontWeight = FontWeight.Bold, fontSize = 11.5.sp, letterSpacing = 1.2.sp)
        }
        when {
            s.hereState == "denied" || !granted -> {
                Text("Slå på posisjon for å se været der du er", color = Color.White, fontSize = 15.sp)
                Box(
                    Modifier.padding(top = 6.dp).height(36.dp).clip(CircleShape).background(Color.White)
                        .clickable(role = Role.Button) {
                            Haptics.tap()
                            (ctx as? android.app.Activity)?.requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION), 4501)
                        }
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Tillat", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
            }
            h == null -> Text(if (s.hereState == "error") "Fant ikke posisjonen din ennå." else "Henter været der du er …", color = Color.White.copy(alpha = .85f), fontSize = 14.sp)
            else -> Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(h.place, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(h.text, h.hi?.let { "H: ${Math.round(it)}°" }, h.lo?.let { "L: ${Math.round(it)}°" }).joinToString("  "),
                        color = Color.White.copy(alpha = .9f), fontSize = 13.sp, maxLines = 1)
                }
                h.temp?.let { Text("${Math.round(it)}°", color = Color.White, fontWeight = FontWeight.Light, fontSize = 44.sp, maxLines = 1) }
            }
        }
    }
}
