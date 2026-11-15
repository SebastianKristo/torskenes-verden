package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ======================= Varsler ======================= */

/* Prompt 45: «Vis svaret i appen også» (n_ai_in) er fjernet – Glimt-svar mens appen var lukket kommer bare som systemvarsel. */

/** Volum for varsellyden: 20 / 35 / 50 / 70 / 100 %. Trykk spiller lyden med en gang. */
@Composable
internal fun VolumeChips39(vm: AppViewModel, n: NotifyPrefs) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Column(Modifier.padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Volum", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Sound39.VOLUMES.forEach { v ->
                val on = n.volume == v
                Box(
                    Modifier.weight(1f).height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (on) p.ink else Color.Transparent)
                        .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(17.dp))
                        .clickable(role = Role.Button) { vm.saveNotify(n.copy(volume = v)); Notify.preview(ctx, n.sound, v) },
                    contentAlignment = Alignment.Center,
                ) { Text("$v %", color = if (on) p.bg else p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
            }
        }
        Text(Sound39.DAMP_NOTE, color = p.mut, fontSize = 11.5.sp)
    }
}
