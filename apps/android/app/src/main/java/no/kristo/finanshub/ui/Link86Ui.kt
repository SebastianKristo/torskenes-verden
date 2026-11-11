package no.kristo.finanshub.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel

/** Prompt 86 (AND86): «Vil du … ?» før en lenke utenfra (nettside, annen app) får utføre en handling. Se Link86.kt. */
@Composable
internal fun Link86Dialog(vm: AppViewModel) {
    val l = vm.link86 ?: return
    val p = PaperPal.current
    AlertDialog(onDismissRequest = { vm.link86 = null }, containerColor = p.bg,
        title = { PSerif(l.second.title, 20.sp) },
        text = { Text(l.second.text + "\n\nLenken kom utenfra appen.", color = p.mut, fontSize = 14.sp) },
        confirmButton = { TextButton({ vm.link86 = null; vm.deepLink(l.first) }) { Text("Utfør", color = p.lab, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ vm.link86 = null }) { Text("Avbryt", color = p.ink) } })
}
