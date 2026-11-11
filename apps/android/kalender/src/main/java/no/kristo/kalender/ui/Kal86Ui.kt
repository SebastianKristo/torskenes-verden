package no.kristo.kalender.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK

/** Prompt 86 (AND86): «Vil du … ?» før en lenke utenfra (kalender://ny?text=…) får lage en hendelse. Se KalVm.ask86. */
@Composable
fun Link86Host(vm: KalVm) {
    val t = vm.ask86 ?: return
    val k = LocalK.current
    AlertDialog(onDismissRequest = { vm.ask86 = null }, containerColor = k.card, titleContentColor = k.ink, textContentColor = k.mut,
        title = { Text("Vil du lage en hendelse av teksten?", fontSize = 19.sp, fontWeight = FontWeight.SemiBold) },
        text = { Text("Lenken kom utenfra appen. Glimt leser teksten og legger hendelsen i kalenderen:\n\n«" + t.take(240) + (if (t.length > 240) "…" else "") + "»", fontSize = 14.sp) },
        confirmButton = { TextButton({ vm.confirmLink86() }) { Text("Utfør", color = k.acc, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ vm.ask86 = null }) { Text("Avbryt", color = k.ink) } })
}
