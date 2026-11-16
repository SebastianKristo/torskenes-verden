package no.kristo.finanshub.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.Stable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/*
 * Prompt 71 (ANIAND71, claude-code-animasjoner-jevne.md): felles biter for jevne animasjoner. Utseendet er det samme som før;
 * bare måten verdiene leses på er endret – de leses i tegne-/lagfasen (graphicsLayer { … }, offset { … }, Canvas), ikke i
 * komposisjonen, så bare laget tegnes på nytt hvert bilde (ingen rekomponering av kortet/siden).
 */

/** En verdi som står stille (vugging av, «Fjern animasjoner»). */
@Stable
private object Still71 : State<Float> {
    override val value: Float get() = 0f
}

/**
 * Vuggingen i wiggle (samme som [wobbleAngle]: ±amp°, 0,3 s hver vei med FastOutSlowIn, annenhver i motfase), men som State,
 * så vinkelen leses i graphicsLayer { rotationZ = w.value } i stedet for i komposisjonen.
 */
@Composable
internal fun wobble71(on: Boolean, index: Int, amp: Float = 0.2f): State<Float> {
    if (!on) return Still71
    val t = rememberInfiniteTransition(label = "vugge")
    return t.animateFloat(
        initialValue = if (index % 2 == 0) -amp else amp, targetValue = if (index % 2 == 0) amp else -amp,
        animationSpec = infiniteRepeatable(tween(300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "vinkel",
    )
}

/**
 * Lydbølgen med sju streker (Chat og mikrofonlinja): 3 dp brede, 3 dp mellomrom, høyde 6 + 16 × puls × (0,35 + 0,65 × nivå) dp,
 * radius 2 dp, midtstilt i 22 dp. Før: én Box per strek med animert height (layout hvert bilde). Nå: én Canvas som leser pulsen
 * i tegnefasen – samme mål og farger.
 */
@Composable
internal fun WaveBars71(level: Float, color: Color, label: String) {
    val tr = rememberInfiniteTransition(label = label)
    val a = ArrayList<State<Float>>(7)
    for (i in 0 until 7) a += tr.animateFloat(.25f, 1f, infiniteRepeatable(tween(450, delayMillis = i * 60), RepeatMode.Reverse), label = "$label$i")
    Canvas(Modifier.width((7 * 3 + 6 * 3).dp).height(22.dp)) {
        val bw = 3.dp.toPx()
        val gap = 3.dp.toPx()
        val r = CornerRadius(2.dp.toPx())
        for (i in 0 until 7) {
            val h = (6f + 16f * a[i].value * (.35f + .65f * level)).dp.toPx().coerceAtMost(size.height)
            drawRoundRect(color, Offset(i * (bw + gap), (size.height - h) / 2f), Size(bw, h), r)
        }
    }
}
