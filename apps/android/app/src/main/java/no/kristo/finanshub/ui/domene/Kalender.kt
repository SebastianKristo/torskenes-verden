@file:JvmName("DomeneKalender")

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Kalender: kode som lå i blandingsfilene (Ui36.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av KALENDER-Android.
 */

/* ======================= Google: Hovedkalender og «Vis også i Kalender» ======================= */

@Composable
internal fun GoogleCals36(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.gcal36
    LaunchedEffect(vm.bd24.google.connected, vm.account?.id) { if (vm.bd24.google.connected) vm.loadGCals36() }
    if (s.missing) return
    val d = s.data ?: return
    if (!d.connected) return
    val mainCal = d.cals.firstOrNull { it.main } ?: d.cals.firstOrNull { it.id == d.mainId || it.googleId == d.mainId }
    val writable = d.cals.filter { it.writable }.sortedWith(compareBy({ !it.primary }, { it.name.lowercase() }))
    val others = d.cals.filter { it.googleId != mainCal?.googleId }.sortedWith(compareBy({ !it.primary }, { it.name.lowercase() }))
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Text("HOVEDKALENDER", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(top = 8.dp))
        Text("Nye hendelser fra Kalender og Glimt lagres her.", color = p.mut, fontSize = 12.sp)
        writable.forEach { c ->
            val on = c.googleId == mainCal?.googleId
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(enabled = s.busy == null, role = Role.RadioButton) { vm.setGMain36(c) }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.size(22.dp).clip(CircleShape).border(2.dp, if (on) p.ink else p.line, CircleShape), contentAlignment = Alignment.Center) {
                    if (on) Box(Modifier.size(11.dp).clip(CircleShape).background(p.ink))
                }
                Column(Modifier.weight(1f)) {
                    Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(when { c.primary -> "Personlig · nye hendelser lagres her".let { if (on) it else "Personlig" }; on -> "Nye hendelser lagres her"; else -> "Kan skrives til" },
                        color = p.mut, fontSize = 12.sp, maxLines = 1)
                }
                if (s.busy == "main" && on) CircularProgressIndicator(color = p.mut, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            }
        }
        if (others.isNotEmpty()) {
            Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(1.dp).background(p.line))
            Text("VIS OGSÅ I KALENDER", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(top = 8.dp))
            others.forEach { c ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(enabled = s.busy == null, role = Role.Switch) { vm.toggleGShow36(c) }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(Color(c.color ?: 0xFF7A7468)))
                    Column(Modifier.weight(1f)) {
                        Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (c.writable) (if (c.primary) "Personlig" else "Kan skrives til") else "Bare lesing", color = p.mut, fontSize = 12.sp, maxLines = 1)
                    }
                    Box(Modifier.size(46.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (c.shown) p.pos else p.line).padding(3.dp),
                        contentAlignment = if (c.shown) Alignment.CenterEnd else Alignment.CenterStart) { Box(Modifier.size(22.dp).clip(CircleShape).background(Color.White)) }
                }
            }
        }
        s.err?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
    }
}
