package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 26 (ANDROID-B): Sporing – overstyr transportøren.
 *  - Ny pakke: under sporingsnummeret «✦ Auto · Bring» (det som gjenkjennes) og Posten, Bring, PostNord, DHL, Helthjem,
 *    UPS, Budbee, Instabox og ParcelsApp.
 *  - Eksisterende pakke: hold inne og velg én pakke → SPOR VIA med de samme valgene; «Auto (…)» går tilbake til automatisk.
 */

@Composable
private fun CarChip26(text: String, on: Boolean, dark: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    val bg = when { on && dark -> p.bg; on -> p.ink; else -> Color.Transparent }
    val fg = when { on && dark -> p.ink; on -> p.bg; dark -> p.bg; else -> p.ink }
    val bd = when { on && dark -> p.bg; on -> p.ink; dark -> Color.White.copy(alpha = .35f); else -> p.line }
    Box(
        Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(bg).border(1.dp, bd, RoundedCornerShape(16.dp))
            .clickable(role = Role.RadioButton, onClickLabel = text, onClick = onClick).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = fg, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1) }
}

/** Valgene ved ny pakke (vannrett rad): null = automatisk. */
@Composable
internal fun CarrierChips26(no: String, selected: String?, onPick: (String?) -> Unit) {
    val clean = no.uppercase().filter { it.isLetterOrDigit() }
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        CarChip26("✦ Auto" + if (clean.length >= 6) " · " + trkGuessName26(clean) else "", selected == null, dark = false) { onPick(null) }
        TRK26_CARS.forEach { (k, n) -> CarChip26(n, selected == k, dark = false) { onPick(k) } }
    }
}

/** SPOR VIA (mørkt kort) når nøyaktig én pakke er valgt. Pakken spores med en gang via valgt tjeneste. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TrkSporVia26(vm: AppViewModel, list: List<Shipment>) {
    val p = PaperPal.current
    if (vm.trkPicked.size != 1) return
    val s = list.firstOrNull { it.id in vm.trkPicked } ?: return
    val ov = vm.trkOverride26(s)
    val auto = s.carrierDetectedName ?: s.carrierDetected?.let(::trkCarName26) ?: if (ov == null) s.carrierName else trkGuessName26(s.trackingNo)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.ink).padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("SPOR VIA", color = p.bg.copy(alpha = .75f), fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.mono, letterSpacing = 1.2.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            CarChip26("Auto ($auto)", ov == null, dark = true) { if (ov != null) vm.trkSetOverride26(s, null) }
            TRK26_CARS.forEach { (k, n) -> CarChip26(n, ov == k, dark = true) { if (ov != k) vm.trkSetOverride26(s, k) } }
        }
    }
}
