package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.upload.PendingUpload

/*
 * Kvitteringer i Papir (prompt 18): ta bilde / velg filer, «Venter på opplasting», køen hos serveren og listen til gjennomgang.
 * Bekreftelsen av én kvittering bruker fortsatt ReceiptConfirm (den følger Papir-fargene via Tone.map).
 */

/** «Venter på opplasting»: kvitteringer lagret på telefonen, med «Prøv igjen» og «Fjern». */
@Composable
internal fun PaperPendingCard(vm: AppViewModel) {
    val p = PaperPal.current
    PCard {
        vm.pendingUploads.forEachIndexed { i, u ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(Modifier.fillMaxWidth().padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(u.name.ifBlank { "Kvittering" }, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(pendingSub(u), color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text("Fjern", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { vm.removePending(u.id) }.padding(8.dp, 6.dp))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${vm.pendingUploads.size} lagret på telefonen · sendes av seg selv når nettet er tilbake",
                color = p.mut, fontSize = 12.sp, modifier = Modifier.weight(1f).padding(end = 10.dp),
            )
            PButton(if (vm.pendingBusy) "Prøver …" else "Prøv igjen", height = 40.dp) { if (!vm.pendingBusy) vm.retryPending() }
        }
    }
}

internal fun pendingSub(u: PendingUpload): String {
    val tries = if (u.attempts > 0) " · ${u.attempts} forsøk" else ""
    return "Venter på opplasting$tries" + (u.lastError?.let { " · $it" } ?: "")
}

/** Arkene (Legg til / endre abonnement) i Papir: papirflate og blekk i stedet for den klassiske mørke flaten. */
internal fun sheetBg(): Color = PaperPal.current.bg
