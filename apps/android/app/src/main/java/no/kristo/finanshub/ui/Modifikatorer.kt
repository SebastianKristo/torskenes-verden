package no.kristo.finanshub.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChangeIgnoreConsumed
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*

/** Stiplet kant (1,5 dp, 5/4 dp streker) med avrundede hjørner. */
internal fun Modifier.dashedEdge(color: Color, radius: Dp, width: Dp = 1.5.dp): Modifier = this.drawBehind {
    val w = width.toPx()
    drawRoundRect(
        color = color,
        topLeft = androidx.compose.ui.geometry.Offset(w / 2, w / 2),
        size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w),
        cornerRadius = CornerRadius(radius.toPx()),
        style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))),
    )
}

/* ---------------- Hold inne og dra ---------------- */

/**
 * Langt trykk (500 ms) hvor som helst på kortet, også over lenker og knapper. Flyttes fingeren mer enn 8 px før det,
 * avbrytes trykket og listen scroller som vanlig. Etter et langt trykk spises resten av berøringen (Initial-passet),
 * så klikket ved slipp aldri åpner siden. Fingeren kan dra kortet med en gang: onDrag får pekerens y i rotkoordinater
 * (toRootY regner om fra kortets egne koordinater, med flytting og skalering).
 */
internal fun Modifier.holdDrag(
    enabled: Boolean,
    onLong: () -> Unit,
    onDrag: (rootY: Float) -> Unit,
    onEnd: () -> Unit,
    toRootY: (androidx.compose.ui.geometry.Offset) -> Float,
): Modifier = if (!enabled) this else this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val slop = 8.dp.toPx()
        var moved = false
        val released = withTimeoutOrNull(500L) {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull true
                if (!ch.pressed) return@withTimeoutOrNull true
                if ((ch.position - down.position).getDistance() > slop) { moved = true; return@withTimeoutOrNull true }
            }
            @Suppress("UNREACHABLE_CODE") true
        }
        if (released != null || moved) return@awaitEachGesture
        onLong()
        try {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                // Alt etter det lange trykket spises: ingen klikk og ingen scrolling mens kortet dras.
                // Prompt 45: bevegelsen leses FØR consume() – positionChange() er Offset.Zero på en konsumert endring.
                val mv45 = ch.positionChangeIgnoreConsumed()
                ev.changes.forEach { it.consume() }
                if (!ch.pressed) break
                if (mv45 != androidx.compose.ui.geometry.Offset.Zero) onDrag(toRootY(ch.position))
            }
        } finally { onEnd() }
    }
}

/* ======================= Trykk / hold ======================= */

/** Kort trykk → [onTap], hold inne ≥ [holdMs] → [onHold] (lett haptikk, klikket etterpå ignoreres). pressed: mens fingeren er nede. */
internal fun Modifier.tapHold36(holdMs: Long = 550, pressed: (Boolean) -> Unit, onTap: () -> Unit, onHold: () -> Unit): Modifier = this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        pressed(true)
        val slop = 10.dp.toPx()
        val r = withTimeoutOrNull(holdMs) {
            while (true) {
                val ev = awaitPointerEvent()
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull 2
                if (!ch.pressed) { ch.consume(); return@withTimeoutOrNull 1 }
                if ((ch.position - down.position).getDistance() > slop) return@withTimeoutOrNull 2
            }
            @Suppress("UNREACHABLE_CODE") 2
        }
        when (r) {
            null -> {
                Haptics.tap()
                onHold()
                while (true) { val ev = awaitPointerEvent(); ev.changes.forEach { it.consume() }; if (ev.changes.none { it.pressed }) break }
            }
            1 -> onTap()
            else -> {}
        }
        pressed(false)
    }
}
