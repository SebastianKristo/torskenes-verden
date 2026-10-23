package no.kristo.finanshub.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChangeIgnoreConsumed
import androidx.compose.ui.unit.dp

/*
 * Prompt 45 (claude-code-wiggle-android-dra.md): felles «trykk, hold kort og dra» for kort i wiggle-modus.
 *
 * Rotårsaken til at kort ikke kunne dras på Android (Hjem, Finans, Mat, Sporing, Finans → Mer): dra-løkkene konsumerte
 * alle pekerendringer og leste SÅ `positionChange()`. På en konsumert endring returnerer den alltid Offset.Zero, så
 * dra-tilbakekallet ble aldri kalt – kortet ble løftet, men fulgte aldri fingeren. Rettet i holdDrag37 (Ui37.kt),
 * holdDrag (Ui21.kt) og Finans → Mer-rutenettet (Paper15.kt): bevegelsen leses med positionChangeIgnoreConsumed() før consume().
 *
 * Denne varianten gir bare loddrett bevegelse (dy) og brukes av Mer-lista, der kortet før bare kunne dras i håndtaket (≡).
 * Holdes fingeren stille i [holdMs] (< 6 dp) starter draget; beveger den seg før, eller to fingre, er det scroll.
 */
internal fun Modifier.holdDragDelta45(onStart: () -> Unit, onDelta: (Float) -> Unit, onEnd: () -> Unit, holdMs: Long = 150L): Modifier = composed {
    val start by rememberUpdatedState(onStart)
    val delta by rememberUpdatedState(onDelta)
    val end by rememberUpdatedState(onEnd)
    this.pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            val slop = 6.dp.toPx()
            var cancel = false
            val timedOut = withTimeoutOrNull(holdMs) {
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val ch = ev.changes.firstOrNull { it.id == down.id }
                    if (ch == null || !ch.pressed || ev.changes.count { it.pressed } > 1 || (ch.position - down.position).getDistance() > slop) { cancel = true; break }
                }
                true
            }
            if (timedOut != null || cancel) return@awaitEachGesture
            // Draget starter ved første bevegelse etter holdet; slippes fingeren uten å flytte seg, går trykket videre (− / ✎).
            var started = false
            try {
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                    val mv = ch.positionChangeIgnoreConsumed()
                    if (!ch.pressed) { if (started) ch.consume(); break }
                    if (!started && mv == androidx.compose.ui.geometry.Offset.Zero) continue
                    if (!started) { started = true; start() }
                    ev.changes.forEach { it.consume() }
                    if (mv.y != 0f) delta(mv.y)
                }
            } finally { if (started) end() }
        }
    }
}
