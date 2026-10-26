package no.kristo.kalender.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import no.kristo.kalender.Hap
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.widget.KalW70
import no.kristo.kalender.widget.KalW70Prefs

/*
 * Prompt 70 (KAL70): Innstillinger → Widgets og kortet «Kalender på hjemskjermen» (claude-code-kalender-neste-release.md).
 *  - Widgets70Section: kalendere som tas med (standard alle), «Skjul fullførte i dag» og «Legg til widget»
 *    (requestPinAppWidget: launcheren spør selv; 2 × 2 · 4 × 2 · Agenda · Måned). Widgetene tegnes på nytt med en gang.
 *  - Intro70Host: én gang etter oppdateringen («Legg til widget» · «Senere»), aldri samtidig med «Nytt i denne versjonen».
 */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Widgets70Section(vm: KalVm) {
    val k = LocalK.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var off by remember { mutableStateOf(KalW70Prefs.off(ctx)) }
    var hideDone by remember { mutableStateOf(KalW70Prefs.hideDone(ctx)) }
    val redraw: () -> Unit = { scope.launch { runCatching { KalW70.redraw(ctx) } } }
    Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
        vm.cals.filter { !it.hidMenu }.forEach { c ->
            OptRow(c.n, "Vises i widgetene", c.id !in off) {
                Hap.tick()
                KalW70Prefs.setShown(ctx, c.id, c.id in off)
                off = KalW70Prefs.off(ctx)
                redraw()
            }
        }
        OptRow("Skjul fullførte i dag", "Ferdige hendelser forsvinner fra widgetene", hideDone) {
            Hap.tick()
            hideDone = !hideDone
            KalW70Prefs.setHideDone(ctx, hideDone)
            redraw()
        }
        Column(Modifier.padding(vertical = 11.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Tx("Legg til widget", man(14.5.sp, FontWeight.Bold, k.ink))
            Tx("Velg størrelse – telefonen spør hvor den skal ligge", man(12.sp, FontWeight.Medium, k.mut), maxLines = 2)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PIN70.forEach { (kind, name) -> Chip(name, false, { Hap.tick(); pin70(vm, kind) }) }
            }
        }
    }
}

private val PIN70 = listOf("small" to "2 × 2", "week" to "4 × 2", "agenda" to "Agenda", "month" to "Måned")

private fun pin70(vm: KalVm, kind: String) {
    val ok = KalW70.pin(vm.getApplication(), kind)
    if (!ok) vm.showToast("Hold inne på Hjem-skjermen → Widgets → Kalender")
}

/** Over hele appen (KalRoot), etter «Nytt i denne versjonen». Tegner ingenting når kortet er vist før. */
@Composable
fun Intro70Host(vm: KalVm) {
    val ctx = LocalContext.current
    var seen by remember { mutableStateOf(KalW70Prefs.introSeen(ctx)) }
    if (seen || vm.k51.news != null) return
    val k = LocalK.current
    val done: () -> Unit = {
        KalW70Prefs.setIntroSeen(ctx)
        seen = true
    }
    BackHandler { done() }
    Box(
        Modifier.fillMaxSize().background(k.dim).tap("Lukk") { done() }.windowInsetsPadding(WindowInsets.systemBars).padding(22.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 440.dp).fillMaxWidth().shadow(16.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(k.bg)
                .border(1.dp, k.line, RoundedCornerShape(24.dp)).tap(null) { }.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Tx("NYTT I DENNE VERSJONEN", mono(10.5.sp, Red, .12f))
            Tx("Kalender på hjemskjermen", news(26.sp, k.ink, 30.sp), maxLines = 2)
            Tx("Hold inne på hjemskjermen og legg til Kalender-widgeten.", man(14.sp, FontWeight.Medium, k.ink, 20.sp), maxLines = 4)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Spacer(Modifier.weight(1f))
                LinePill("Senere", { Hap.tick(); done() })
                InkPill("Legg til widget", {
                    Hap.tick()
                    done()
                    pin70(vm, "agenda")
                })
            }
        }
    }
}
