package no.kristo.kalender.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.KCal
import no.kristo.kalender.KREMS
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.SWC35
import no.kristo.kalender.icalName35
import no.kristo.kalender.icalOk35

/* Zoom mellom visningene (prompt 35, KALAND35). Fasit: Kalender App.dc.html → zoomTo/zoomStep/kzIn/kzOut, pinch i ts/tmv/te. */

/* ---------------- Zoom ---------------- */

/**
 * Visningen med zoom-animasjonen: den nye visningen vokser fra trykk-/klypepunktet (inn: scale .55 → 1, ut: 1.6 → 1, fade inn
 * på de første 60 %), 0,38 s cubic-bezier(.2,.8,.2,1). «Reduser bevegelse»: bare fade.
 * Pinch: to fingre som spres > 1,22× zoomer inn ett steg, klyp < 0,82× zoomer ut. Første berøring lukker tastaturet.
 */
@Composable
fun ZoomBox35(vm: KalVm, reduce: Boolean, onTouch: () -> Unit, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val anim = remember { Animatable(1f) }
    LaunchedEffect(vm.zN) {
        if (vm.zN > 0) { anim.snapTo(0f); anim.animateTo(1f, tween(380, easing = EASE)) }
    }
    Box(
        modifier.pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                onTouch()
                if (size.width > 0 && size.height > 0) vm.zoomOrigin(down.position.x / size.width, down.position.y / size.height)
                var d0 = 0f
                var ratio = 1f
                var cx = 0f
                var cy = 0f
                var pinch = false
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val pr = ev.changes.filter { it.pressed }
                    if (pr.size >= 2) {
                        val p1 = pr[0].position
                        val p2 = pr[1].position
                        val dist = (p1 - p2).getDistance()
                        if (!pinch) { pinch = true; d0 = dist } else if (d0 > 0f) ratio = dist / d0
                        cx = (p1.x + p2.x) / 2f
                        cy = (p1.y + p2.y) / 2f
                        // To fingre er zoom, ikke rulling eller sveip.
                        ev.changes.forEach { it.consume() }
                    }
                    if (ev.changes.none { it.pressed }) break
                }
                if (pinch && size.width > 0 && size.height > 0) {
                    vm.zoomOrigin(cx / size.width, cy / size.height)
                    if (ratio > 1.22f) vm.zoomStep("in") else if (ratio < .82f) vm.zoomStep("out")
                }
            }
        },
    ) {
        val p = anim.value
        val from = if (vm.zDir == "in") .55f else 1.6f
        Box(
            Modifier.fillMaxSize().graphicsLayer {
                alpha = (p / .6f).coerceIn(0f, 1f)
                if (!reduce) {
                    val sc = from + (1f - from) * p
                    scaleX = sc; scaleY = sc
                    transformOrigin = TransformOrigin(vm.zOx, vm.zOy)
                }
            },
            content = content,
        )
    }
}
