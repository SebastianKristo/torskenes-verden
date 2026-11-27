package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.GlimtStatus
import no.kristo.finanshub.GlimtStatusKind
import no.kristo.finanshub.ui.designsystem.DsPalette

/*
 * Glimt-statuspillen (claude-code-glimt-statuspille.md): «Glimt kontrollerer kvitteringen …» øverst i appen, sentrert rett under
 * statuslinjen (+ 8 dp), over toppbildet og alle sidene. Den deler aldri plass med skann-knappen eller fanelinja nederst.
 * Ligger i rotlaget i Papir-skallet (Paper.kt), ikke på den enkelte skjermen, så den blir stående ved navigasjon og fanebytte.
 * Tilstanden eies av kvitteringsskanningen (vm.scan48.pill, KvitteringSkanning.kt).
 */

/** Den mørke pillen (blekket i Papir, #1B1A17) med hvit tekst, i lyst og mørkt tema. */
internal val PILL_BG = DsPalette.PapirLys.textPrimary

/**
 * Venstre: Glimt-logoen (regnbuering med rød stjerne, GlimtOrb43) i 22 dp. Ringen roterer mens Glimt jobber og står stille
 * når kvitteringen er lagret eller lesingen feilet. Trykk åpner kvitteringen som kontrolleres; sveip opp skjuler pillen
 * (jobben fortsetter). «Kvittering lagret ✓» står i 1,5 s; feilen blir stående til den trykkes eller sveipes bort.
 */
@Composable
internal fun BoxScope.GlimtStatusPill(vm: AppViewModel, modifier: Modifier = Modifier) {
    val pill by vm.scan48.pill.collectAsState()
    // Den siste teksten beholdes mens pillen glir ut.
    var last by remember { mutableStateOf<GlimtStatus?>(null) }
    pill?.let { last = it }
    LaunchedEffect(pill) {
        if (pill?.kind == GlimtStatusKind.DONE) { delay(1_500); vm.scan48.donePillShown() }
    }
    AnimatedVisibility(
        visible = pill != null,
        modifier = modifier.windowInsetsPadding(WindowInsets.statusBars).padding(top = 8.dp, start = 16.dp, end = 16.dp),
        enter = slideInVertically(spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow)) { -it * 2 } + fadeIn(tween(250)),
        exit = slideOutVertically(tween(250)) { -it * 2 } + fadeOut(tween(250)),
    ) {
        val s = last ?: GlimtStatus("", GlimtStatusKind.WORKING)
        val working = s.kind == GlimtStatusKind.WORKING
        Row(
            Modifier.height(40.dp).clip(CircleShape).background(PILL_BG)
                .clickable(role = Role.Button, onClickLabel = "Åpne kvitteringen", onClick = { vm.scan48.reopen() })
                .pointerInput(Unit) {
                    var dy = 0f
                    detectVerticalDragGestures(onDragStart = { dy = 0f }, onDragEnd = { if (dy < -24.dp.toPx()) vm.scan48.dismissPill() }) { ch, d -> dy += d; ch.consume() }
                }
                .semantics { liveRegion = LiveRegionMode.Polite }
                .padding(start = 9.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            GlimtOrb43(22.dp, busy = working, status = true)
            Text(s.text, color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
