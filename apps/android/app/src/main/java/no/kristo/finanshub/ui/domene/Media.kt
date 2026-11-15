@file:JvmName("DomeneMedia")

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import no.kristo.finanshub.*

/*
 * Media: kode som lå i blandingsfilene (Ui46.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Media: «Vis detaljer» ======================= */

@Composable
internal fun MediaDetails46(vm: AppViewModel) {
    val p = PaperPal.current
    val calls = remember(vm.p43.error, vm.p44.playErr, vm.p44.errKind) { MediaLog46.recent().take(8) }
    val fmt = remember { SimpleDateFormat("HH:mm:ss", Locale("nb", "NO")) }
    Column(Modifier.padding(16.dp, 8.dp, 16.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val kind = when (vm.p46.mediaKind) {
            "token" -> "Utlogget (også /api/me avviste tokenet)"; "route" -> "Ruten finnes ikke på serveren (401 fra fellessjekken)"
            "upstream" -> "Tjenesten bak Homelab avviser nøkkelen"; "down" -> "Svarer ikke"; "check" -> "Sjekker innloggingen …"; else -> "–"
        }
        Text("Tolkning: $kind" + (vm.p46.mediaWhen?.let { " · kl. $it" } ?: ""), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
        Text("Server: ${vm.base} · token: ${if (vm.token46 != null) "ja" else "nei"}", color = p.mut, fontSize = 12.sp)
        if (calls.isEmpty()) Text("Ingen Media-kall er logget ennå.", color = p.mut, fontSize = 12.sp)
        calls.forEach { c ->
            val path = c.url.substringAfter("://").substringAfter('/', "").let { "/$it" }
            Text("${fmt.format(Date(c.at))}  ${c.method} $path → ${if (c.status > 0) c.status else "nett"} · ${c.ms} ms · auth ${if (c.auth) "ja" else "nei"}" +
                (c.err?.let { " · $it" } ?: ""), color = if (c.status in 200..299) p.mut else p.lab, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}
