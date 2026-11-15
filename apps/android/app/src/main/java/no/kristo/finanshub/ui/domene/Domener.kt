@file:JvmName("DomeneDomener")

package no.kristo.finanshub.ui

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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Domener: kode som lå i blandingsfilene (Ui38.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Domener: Glimt-oppsummering ======================= */

@Composable
internal fun DomGlimt38(vm: AppViewModel) {
    val s = vm.p38
    if (!s.domSumOpen) return
    val p = PaperPal.current
    LaunchedEffect(vm.domain) { vm.loadDomSum38() }
    val sum = s.domSum
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("✦ GLIMT · OPPSUMMERING", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.2.sp, modifier = Modifier.weight(1f))
            Box(Modifier.height(28.dp).clip(CircleShape).background(p.surf2).clickable(enabled = !s.domSumBusy, role = Role.Button) { Haptics.select(); vm.loadDomSum38(fresh = true) }
                .padding(horizontal = 10.dp), contentAlignment = Alignment.Center) { Text("↻ Lag ny", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
            Box(Modifier.size(28.dp).clip(CircleShape).background(p.surf2).clickable(role = Role.Button, onClickLabel = "Lukk") { Haptics.dismiss(); s.domSumOpen = false },
                contentAlignment = Alignment.Center) { Text("✕", modifier = Modifier.semantics { contentDescription = "Lukk" }, color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        }
        if (sum == null || (s.domSumBusy && sum.domain != (vm.domain ?: "*"))) Text("Glimt ser på domenene …", color = p.mut, fontSize = 14.sp)
        else {
            Text(sum.head, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 19.sp, lineHeight = 25.sp)
            sum.pts.forEach { (t, c) ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.padding(top = 6.dp).size(7.dp).clip(CircleShape).background(c?.let { Color(it) } ?: p.mut))
                    Text(t, color = p.ink, fontSize = 13.5.sp, lineHeight = 19.sp)
                }
            }
            sum.meta?.let { Text(it, color = p.mut, fontSize = 11.5.sp, fontFamily = PaperFonts.mono) }
        }
    }
}
