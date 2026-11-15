package no.kristo.kalender.ui

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.Kal51
import no.kristo.kalender.Kal51News
import no.kristo.kalender.Kal51Pending
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red

/* «Nytt i denne versjonen» (prompt 51, KAL51): GET /api/whatsnew, «Fint» → POST /api/whatsnew/seen. */

/* ---------- «Nytt i denne versjonen» ---------- */

/** Over hele appen (KalRoot). Tegner ingenting når det ikke er noe nytt. */
@Composable
fun News51Host(vm: KalVm) {
    val n = vm.k51.news ?: return
    val k = LocalK.current
    BackHandler { vm.k51.dismissNews() }
    Box(Modifier.fillMaxSize().background(k.dim).tap("Lukk") { vm.k51.dismissNews() }.windowInsetsPadding(WindowInsets.systemBars).padding(22.dp), contentAlignment = Alignment.Center) {
        News51Card(n) { Hap.tick(); vm.k51.dismissNews() }
    }
}

@Composable
private fun News51Card(n: Kal51News, close: () -> Unit) {
    val k = LocalK.current
    Column(
        Modifier.widthIn(max = 440.dp).fillMaxWidth().shadow(16.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(k.bg)
            .border(1.dp, k.line, RoundedCornerShape(24.dp)).tap(null) { }.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Tx("NYTT I DENNE VERSJONEN", mono(KType.caption, Red, .12f))
        Tx(n.title.ifBlank { "Versjon " + n.version }, news(KType.title3, k.ink, 30.sp), maxLines = 3)
        Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            n.items.forEach { t ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Tx("•", man(KType.callout, FontWeight.Bold, Red))
                    Tx(t, man(KType.callout, FontWeight.Medium, k.ink, 20.sp), maxLines = 8)
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Tx(n.version + (if (n.date.isBlank()) "" else " · " + n.date), mono(KType.caption, k.mut2).copy(textAlign = TextAlign.Start), Modifier.weight(1f))
            Spacer(Modifier.height(1.dp))
            InkPill("Fint", close)
        }
    }
}
