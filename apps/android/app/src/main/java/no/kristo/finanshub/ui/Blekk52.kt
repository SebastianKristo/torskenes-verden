package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt

/*
 * Prompt 52 (AND52B, claude-code-glimt-blekksprut.md): Glimt-figuren «Blekksprut» (id blekk).
 * Kroppen er bildet uten ansikt (res/drawable-nodpi/glimt_blekk_base52.png, 600 × 536), ansiktet tegnes oppå per humør
 * i samme koordinater som SVG-en i fasiten (viewBox 0 0 600 536):
 *  - Rolig: øyelokk-ringer, blanke pupiller som blunker, lite smil.
 *  - Glad: smileøyne, stort åpent smil, rosa kinn, én stor gledeståre under venstre øye.
 *  - Snakker: blanke pupiller, munnen går, rosa kinn.  - Sover: lukkede øyne, liten rund munn (zz tegnes av GlimtFigs35).
 * Bildet lastes én gang (appens kontekst); widgets bruker samme tegning via fig35Bitmap.
 */

object Blekk52 {
    @Volatile private var img: ImageBitmap? = null
    @Volatile private var tried = false

    /** Laster kroppen fra ressursene (uten R-klassen, så navnet slås opp). Kalles fra figuren i appen og fra widgetene. */
    fun ensure(ctx: Context?) {
        if (img != null || tried) return
        val c = ctx?.applicationContext ?: currentApp() ?: return
        tried = true
        runCatching {
            val id = c.resources.getIdentifier("glimt_blekk_base52", "drawable", c.packageName)
            if (id != 0) {
                val o = BitmapFactory.Options().apply { inScaled = false }
                BitmapFactory.decodeResource(c.resources, id, o)?.let { img = it.asImageBitmap() }
            }
        }
    }

    internal val base: ImageBitmap? get() { if (img == null && !tried) ensure(null); return img }

    private fun currentApp(): Context? = runCatching {
        Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as? Context
    }.getOrNull()
}

private fun e52(cx: Float, cy: Float, rx: Float, ry: Float) = Rect(cx - rx, cy - ry, cx + rx, cy + ry)

/** Blunk (gfBlink 4,2 s): 1 → 0,1 → 1 rundt 93–100 %. */
private fun blink52(t: Float, on: Boolean): Float {
    if (!on) return 1f
    val p = (t % 4.2f) / 4.2f
    return when {
        p < .93f -> 1f
        p < .96f -> 1f - .9f * (p - .93f) / .03f
        else -> .1f + .9f * (p - .96f) / .04f
    }
}

/** Munnen som går (gfTalk 0,3 s): 0,4 ↔ 1. */
private fun talk52(t: Float, on: Boolean): Float = if (!on) 1f else (.4f + .6f * (.5f - .5f * cos(2 * PI * (t / .3f))).toFloat())

/** Gledeståren drypper litt (gfDrip 2,6 s). */
private fun drip52(t: Float, on: Boolean): Float = if (!on) 0f else ((t % 2.6f) / 2.6f).let { p -> if (p < .7f) 6f * p / .7f else 6f * (1f - (p - .7f) / .3f) }

/** Tegner blekkspruten med figurens størrelse S (bredden), med samme boks som fasiten: venstre −8 %, topp 4 %, bredde 116 %. */
internal fun DrawScope.drawBlekk52(S: Float, mood: String, t: Float, anim: Boolean) {
    val bw = S * 1.16f
    val bh = bw * 536f / 600f
    val left = -S * .08f
    val top = S * .04f
    val k = bw / 600f
    val b = Blekk52.base
    // Myk skygge under (drop-shadow i fasiten).
    drawOval(Brush.radialGradient(listOf(Color(0x40501E1E), Color.Transparent), Offset(left + bw / 2, top + bh * .93f), bw * .42f),
        Offset(left + bw * .1f, top + bh * .84f), Size(bw * .8f, bh * .18f))
    if (b != null) {
        drawImage(b, IntOffset.Zero, IntSize(b.width, b.height), IntOffset(left.roundToInt(), top.roundToInt()), IntSize(bw.roundToInt(), bh.roundToInt()))
    } else {
        // Reserve uten bildet: rødt hode med armer.
        drawOval(Brush.radialGradient(listOf(Color(0xFFE58C98), Color(0xFFB04656)), Offset(left + bw * .42f, top + bh * .3f), bw * .5f), Offset(left + bw * .18f, top + bh * .08f), Size(bw * .64f, bh * .62f))
        for (i in 0 until 6) {
            val x = left + bw * (.12f + i * .15f)
            drawOval(Color(0xFFB04656), Offset(x, top + bh * .6f), Size(bw * .12f, bh * .32f))
        }
    }
    translate(left, top) {
        scale(k, k, Offset.Zero) { face52(mood, t, anim) }
    }
}

/** Ansiktet i 600 × 536-koordinater. */
private fun DrawScope.face52(mood: String, t: Float, anim: Boolean) {
    val ink = Color(0xFF120A0C)
    if (mood == "glad" || mood == "talk") {
        for ((cx, cy) in listOf(170f to 300f, 392f to 290f)) {
            drawOval(Brush.radialGradient(listOf(Color(0xFFFF8F9F).copy(alpha = .5f), Color(0xFFFF8F9F).copy(alpha = 0f)), Offset(cx, cy), 40f),
                Offset(cx - 40f, cy - 24f), Size(80f, 48f))
        }
    }
    ring52(222f, 222f, -6f)
    ring52(332f, 214f, 6f)
    val bl = blink52(t, anim)
    for ((cx, cy) in listOf(224f to 228f, 330f to 220f)) {
        when (mood) {
            "glad" -> drawPath(Path().apply { moveTo(cx - 22f, cy + 6f); quadraticBezierTo(cx, cy - 26f, cx + 22f, cy + 6f) }, ink, style = Stroke(9f, cap = StrokeCap.Round))
            "sov" -> drawPath(Path().apply { moveTo(cx - 22f, cy); quadraticBezierTo(cx, cy + 20f, cx + 22f, cy) }, ink, style = Stroke(8f, cap = StrokeCap.Round))
            else -> scale(1f, bl, Offset(cx, cy + 2f)) {
                val r = e52(cx, cy + 2f, 25f, 35f)
                drawOval(Brush.radialGradient(0f to Color(0xFF555555), .6f to Color(0xFF121212), 1f to Color.Black, center = Offset(r.left + r.width * .45f, r.top + r.height * .7f), radius = r.height * .6f),
                    r.topLeft, r.size)
                e52(cx - 4f, cy - 16f, 11f, 7f).let { h -> drawOval(Color.White.copy(alpha = .95f), h.topLeft, h.size) }
                e52(cx + 6f, cy + 22f, 7f, 3.5f).let { h -> drawOval(Color.White.copy(alpha = .18f), h.topLeft, h.size) }
            }
        }
    }
    val mouthBrush = Brush.verticalGradient(listOf(Color(0xFF3A0A12), Color(0xFF6A1A28)))
    when (mood) {
        "talk" -> scale(1f, talk52(t, anim), Offset(288f, 324f)) { e52(288f, 338f, 17f, 14f).let { r -> drawOval(mouthBrush, r.topLeft, r.size) } }
        "glad" -> {
            drawPath(Path().apply { moveTo(250f, 322f); quadraticBezierTo(288f, 372f, 326f, 322f); quadraticBezierTo(288f, 336f, 250f, 322f); close() }, mouthBrush)
            e52(288f, 346f, 14f, 7f).let { r -> drawOval(Color(0xFFE2707E), r.topLeft, r.size) }
        }
        "sov" -> e52(288f, 336f, 8f, 7f).let { r -> drawOval(Color(0xFF4A0F18).copy(alpha = .75f), r.topLeft, r.size) }
        else -> drawPath(Path().apply { moveTo(262f, 328f); quadraticBezierTo(288f, 350f, 314f, 328f) }, Color(0xFF4F1220), style = Stroke(6f, cap = StrokeCap.Round))
    }
    if (mood == "glad") translate(0f, drip52(t, anim)) {
        val tear = Path().apply {
            moveTo(192f, 268f)
            cubicTo(182f, 290f, 166f, 304f, 166f, 322f)
            arcTo(Rect(166f, 296f, 218f, 348f), 180f, -180f, false)
            cubicTo(218f, 304f, 202f, 290f, 192f, 268f)
            close()
        }
        drawPath(tear, Brush.verticalGradient(0f to Color(0xFFC9EFFF), .55f to Color(0xFF5CC0F4), 1f to Color(0xFF2A86D6), startY = 268f, endY = 348f))
        rotate(18f, Offset(183f, 316f)) { e52(183f, 316f, 6f, 11f).let { r -> drawOval(Color.White.copy(alpha = .85f), r.topLeft, r.size) } }
    }
}

/** Opphøyd øyelokk-ring (skygge, ring, indre flate og lys kant øverst), rotert rundt sentrum. */
private fun DrawScope.ring52(cx: Float, cy: Float, deg: Float) = rotate(deg, Offset(cx, cy)) {
    e52(cx + 2f, cy + 6f, 51f, 62f).let { r -> drawOval(Brush.radialGradient(listOf(Color(0xFF6E1C2A).copy(alpha = .3f), Color(0xFF6E1C2A).copy(alpha = 0f)), r.center, 62f), r.topLeft, r.size) }
    val o = e52(cx, cy, 47f, 58f)
    drawOval(Brush.radialGradient(listOf(Color(0xFFE58C98), Color(0xFFB04656)), Offset(o.left + o.width * .42f, o.top + o.height * .3f), o.height * .75f), o.topLeft, o.size)
    val i = e52(cx, cy + 3f, 37f, 47f)
    drawOval(Brush.radialGradient(listOf(Color(0xFFC4596A), Color(0xFFA63D4D)), Offset(i.left + i.width * .5f, i.top + i.height * .4f), i.height * .7f), i.topLeft, i.size)
    drawPath(Path().apply { moveTo(cx - 36f, cy - 30f); quadraticBezierTo(cx, cy - 66f, cx + 36f, cy - 30f) }, Color(0xFFF3B3BC).copy(alpha = .55f), style = Stroke(5f, cap = StrokeCap.Round))
}
