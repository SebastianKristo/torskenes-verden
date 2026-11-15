package no.kristo.finanshub.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 34 (ANDROID34): Glimt-brief (Glimt Brief.dc.html, mode page | card) og Glimt-figuren (fig()):
 * krem fjes i en regnbuering som roterer sakte (6 s, 1,6 s når den snakker), øyne som blunker (4 s), rosa kinn, rød munn
 * (beveger seg når den snakker), stjerne som glitrer (1,8 s), én arm som vinker (1,6 s) og svev opp/ned (2,6 s).
 * Tilstander: idle · talk · point · wave. «Fjern animasjoner» (ANIMATOR_DURATION_SCALE = 0): ingen svev eller spinn.
 */

private val INK34 = Color(0xFF1B1A17)

private val CREAM34 = Color(0xFFFFFDF8)

private val RED34 = Color(0xFFB23A2A)

private val BLUE34 = Color(0xFF22476B)

private val RING34 = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFFF2C14E), Color(0xFF3FBF9A), Color(0xFF7A5AD6), Color(0xFFB23A2A))

/** Glimt-figuren. size = bredden (høyden er 1,12 × size). mood: idle | talk | point | wave. lean: helning i grader. */
@Composable
internal fun GlimtFigure34(size: Dp, mood: String = "idle", lean: Float = 0f, modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    val t = rememberInfiniteTransition(label = "glimt34")
    val talk = mood == "talk"
    val bob by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "bob")
    val spin by t.animateFloat(0f, 360f, infiniteRepeatable(tween(if (talk) 1600 else 6000, easing = LinearEasing)), label = "spin")
    val blink by t.animateFloat(1f, 1f, infiniteRepeatable(keyframes { durationMillis = 4000; 1f at 3680; .1f at 3800; 1f at 3920 }), label = "blink")
    val tw by t.animateFloat(0f, 1f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tw")
    val wave by t.animateFloat(-10f, 28f, infiniteRepeatable(tween(800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "wave")
    val mouth by t.animateFloat(.45f, 1f, infiniteRepeatable(tween(160, easing = LinearEasing), RepeatMode.Reverse), label = "mouth")
    val leanA by animateFloatAsState(lean, tween(400), label = "lean")
    Canvas(modifier.size(size, size * 1.12f).semantics { contentDescription = "Glimt" }) {
        val S = this.size.width
        val dy = if (reduce) 0f else -5.dp.toPx() * bob * (S / 76.dp.toPx()).coerceIn(.4f, 1f)
        translate(top = dy) {
            rotate(leanA, Offset(S / 2, this.size.height / 2)) {
                drawGlimt34(S, mood, if (reduce) 0f else spin, if (reduce) 1f else blink, if (reduce) .7f else tw,
                    if (mood == "point") -28f else if (reduce) 0f else wave, if (talk && !reduce) mouth else 1f)
            }
        }
    }
}

/** Selve tegningen (samme mål som prototypen). */
private fun DrawScope.drawGlimt34(S: Float, mood: String, spin: Float, blink: Float, tw: Float, waveDeg: Float, mouthY: Float) {
    // Stjerne over hodet.
    val st = S * .2f
    val sc = .6f + .5f * tw
    translate(left = S / 2 - st / 2, top = -S * .02f) {
        scale(sc, sc, Offset(st / 2, st / 2)) {
            rotate(45f * tw, Offset(st / 2, st / 2)) {
                val k = st / 24f
                val p = Path().apply {
                    moveTo(12f * k, 1.5f * k)
                    cubicTo(12.6f * k, 6.4f * k, 16.6f * k, 10.4f * k, 21.5f * k, 11f * k); lineTo(21.5f * k, 13f * k)
                    cubicTo(16.6f * k, 13.6f * k, 12.6f * k, 17.6f * k, 12f * k, 22.5f * k)
                    cubicTo(11.4f * k, 17.6f * k, 7.4f * k, 13.6f * k, 2.5f * k, 13f * k); lineTo(2.5f * k, 11f * k)
                    cubicTo(7.4f * k, 10.4f * k, 11.4f * k, 6.4f * k, 12f * k, 1.5f * k); close()
                }
                drawPath(p, Color(0xFFFF7A52).copy(alpha = .3f + .7f * tw))
            }
        }
    }
    // Venstre arm (vinker), høyre arm.
    val aw = S * .22f; val ah = S * .1f
    rotate(waveDeg, Offset(-S * .06f + aw * .9f, S * .56f + ah / 2)) {
        drawRoundRect(INK34, Offset(-S * .06f, S * .56f), Size(aw, ah), CornerRadius(S * .05f, S * .05f))
    }
    val bw = S * .2f
    rotate(12f, Offset(S + S * .06f - bw / 2, S * .6f + ah / 2)) {
        drawRoundRect(INK34, Offset(S + S * .06f - bw, S * .6f), Size(bw, ah), CornerRadius(S * .05f, S * .05f))
    }
    // Regnbueringen (roterer).
    val ringW = maxOf(2.5f * density, S * .07f)
    rotate(spin, Offset(S / 2, S * .14f + S / 2)) {
        drawCircle(Brush.sweepGradient(RING34, Offset(S / 2, S * .14f + S / 2)), radius = S / 2 - ringW / 2, center = Offset(S / 2, S * .14f + S / 2), style = Stroke(ringW))
    }
    // Fjeset.
    val fx = S * .08f; val fy = S * .22f; val fs = S * .84f
    drawCircle(CREAM34, fs / 2, Offset(fx + fs / 2, fy + fs / 2))
    drawArc(Color(0x0F1B1A17), 20f, 140f, false, Offset(fx + fs * .06f, fy + fs * .06f), Size(fs * .88f, fs * .88f), style = Stroke(S * .03f))
    // Øynene (blunker).
    val ew = S * .1f; val eh = S * .14f * blink
    val ey = fy + fs * .36f + (S * .14f - eh) / 2
    drawRoundRect(INK34, Offset(fx + fs * .27f, ey), Size(ew, eh), CornerRadius(S * .06f, S * .06f))
    drawRoundRect(INK34, Offset(fx + fs - fs * .27f - ew, ey), Size(ew, eh), CornerRadius(S * .06f, S * .06f))
    // Kinn.
    val ch = Color(0x59E8794A)
    drawOval(ch, Offset(fx + fs * .16f, fy + fs * .56f), Size(S * .1f, S * .06f))
    drawOval(ch, Offset(fx + fs - fs * .16f - S * .1f, fy + fs * .56f), Size(S * .1f, S * .06f))
    // Munnen (halvsirkel; beveger seg når den snakker).
    val mw = S * .22f; val mh = S * .12f * mouthY
    val mx = fx + fs / 2 - mw / 2; val my = fy + fs * .6f
    val mp = Path().apply {
        moveTo(mx, my); lineTo(mx + mw, my)
        arcTo(androidx.compose.ui.geometry.Rect(mx, my - mh, mx + mw, my + mh), 0f, 180f, false)
        close()
    }
    drawPath(mp, RED34)
}

/* ---------------- Hjem-kortet (h12) ---------------- */

@Composable
internal fun HomeBrief34(vm: AppViewModel, modifier: Modifier = Modifier) { // prompt 43: modifier (Fold: min. 148 dp høy)
    val b = vm.p34.brief
    LaunchedEffect(vm.base, vm.account?.id) { vm.loadGlimt35(); vm.loadBrief34(); vm.prefetchBrief73() } // prompt 73: kortene hentes når Hjem vises
    // Prompt 73: og når appen kommer i forgrunnen (maks hvert 5. min), så briefen er klar før den åpnes.
    val life73 = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(life73) {
        val o = androidx.lifecycle.LifecycleEventObserver { _, e -> if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) vm.prefetchBrief73() }
        life73.lifecycle.addObserver(o)
        onDispose { life73.lifecycle.removeObserver(o) }
    }
    val kind = b?.kind ?: briefKind34()
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(BLUE34, Color(0xFF2E5A7F))))
            .clickable(role = Role.Button, onClickLabel = "Åpne briefen") { vm.openBrief34() }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(briefTitle34(kind).uppercase() + " · GLIMT", color = Color(0xFFFFC7B8), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.4.sp, maxLines = 1)
            Text(b?.summary ?: "Glimt lager briefen din …", color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 17.sp, lineHeight = 23.sp,
                maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (b != null) Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                b.chips.take(3).forEach { c ->
                    Text(c, color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .14f)).padding(horizontal = 9.dp, vertical = 4.dp))
                }
            }
        }
        if (vm.p35.set.briefGlimt) GlimtFig35(b?.host ?: hostChar35(vm.p35.set.char), 56.dp) // prompt 35: verten; prompt 39: kan slås av
    }
}

/* ---------------- Brief-siden (fullskjerm) ---------------- */

/** Pulserende rød ring rundt kortet Glimt peker på (gbRing 1,3 s). */
internal fun Modifier.ring34(on: Boolean, radius: Dp): Modifier = if (!on) this else this.ringAnim34(radius)

@Composable
private fun ringAlpha34(): Float {
    val t = rememberInfiniteTransition(label = "ring34")
    val v by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = LinearEasing)), label = "ring34v")
    return v
}

private fun Modifier.ringAnim34(radius: Dp): Modifier = this.composed {
    val v = ringAlpha34()
    this.drawWithContent {
        drawContent()
        // Prompt 36: «outline» som følger kortets radius nøyaktig: 2,5 dp, offset 4 → 8 → 4 dp (1,3 s), farge 100 % ↔ 45 %.
        val r = radius.toPx()
        val wave = (0.5f - 0.5f * kotlin.math.cos(2f * Math.PI.toFloat() * v))
        val sw = 2.5.dp.toPx()
        val o = (4.dp.toPx() + 4.dp.toPx() * wave) + sw / 2
        drawRoundRect(RED34.copy(alpha = 1f - .55f * wave), Offset(-o, -o), Size(size.width + 2 * o, size.height + 2 * o), CornerRadius(r + o, r + o), style = Stroke(sw))
    }
}

/** Ikonene i værkortet (fra prototypen, 24 × 24). */
internal val WX_PATH34: Map<String, String> = mapOf(
    "sol" to "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    "delvis" to "M8 2.5V4M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1M5.4 10.4A3 3 0 1 1 10.8 7.2M9 20h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 13.4A3.3 3.3 0 0 0 9 20z",
    "sky" to "M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.1A3.5 3.5 0 0 0 7 18z",
    "regn" to "M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3",
    "sno" to "M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01",
)
