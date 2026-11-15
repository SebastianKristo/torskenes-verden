package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ======================= Nordlys-siden: fra den gamle Oppdatering-siden ======================= */

/** «Installert 4.24.0 · build 8512626» med Kopier, og Se etter oppdatering / Logg på web. */
@Composable
internal fun NordlysInstalled32b(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val clip = LocalClipboardManager.current
    val u = vm.p30.upd
    val sha = vm.p31.sha
    val line = "Installert ${u.current.ifBlank { "–" }}" + (sha.takeIf { it.isNotBlank() }?.let { " · build ${it.take(7)}" } ?: "")
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(line, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Box(
                Modifier.height(30.dp).clip(CircleShape).background(Color(0x141B1A17)).clickable(role = Role.Button) { clip.setText(AnnotatedString(line)); vm.flash("Kopiert") }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Kopier", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
        }
        PCard(Modifier.hl34(vm, "chk")) { // prompt 34: mål «chk»
            PRow("Se etter oppdatering", if (vm.p31.checking) "Sjekker …" else "Spør serveren om det finnes en ny versjon", "›", serif = false) { vm.checkNordlys31() }
            if (vm.userIsAdmin) PRow("Logg", "Oppdateringsloggen i nettleseren", "↗", serif = false, top = true) { openLink(ctx, upd28WebUrl(vm)) }
        }
    }
}
