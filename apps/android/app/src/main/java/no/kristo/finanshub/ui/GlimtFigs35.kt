package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/*
 * Prompt 35 (ANDROID35): de 13 Glimt-figurene som vektor i Compose Canvas, portert fra glimt-figurer.js (fig(id, størrelse, humør)).
 * Samme mål (andel av størrelsen S), farger, gradienter og animasjoner som CSS-en i fasiten:
 *  gfBob 2,6 s · gfHop 1 s (glad) · gfSq 3,6 s (sover) · gfBlink 4,2 s · gfTalk 0,3 s · gfSpin 6 s / 1,4 s · gfTw 1,8 s · gfZ 2,4 s ·
 *  gfWave · gfLeaf · gfGlow 3,2 s · gfOrb 4 s / gfOrbR 5,5 s · gfSway 1,8 s · gfDrip 1,6 s.
 * Humør: idle · glad · talk · sov (sover). «Fjern animasjoner» i systemet: ingen svev, hopp eller spinn (stillbilde).
 * Widgets bruker fig35Bitmap() (samme tegning, statisk positur).
 */

object Fig35 {
    val IDS = listOf("glimt", "halo", "boble", "antenne", "bane", "pastell", "natt", "sky", "drape", "ugle", "stjerne", "spire", "gris")
    private val NAMES = mapOf(
        "glimt" to "Glimt", "halo" to "Halo", "boble" to "Boble", "antenne" to "Antenne", "bane" to "Bane", "pastell" to "Pastell", "natt" to "Natt",
        "sky" to "Sky", "drape" to "Dråpe", "ugle" to "Ugle", "stjerne" to "Stjerne", "spire" to "Spire", "gris" to "Gris",
    )
    /** Navnet i boblen (GLIMT / SKY / DRÅPE …) og fargen på det. */
    private val WHO = mapOf("gris" to "GRIS", "glimt" to "GLIMT", "natt" to "GLIMT", "sky" to "SKY", "drape" to "DRÅPE", "ugle" to "UGLE", "stjerne" to "STJERNE", "spire" to "SPIRE",
        "halo" to "GLIMT", "boble" to "GLIMT", "antenne" to "GLIMT", "bane" to "GLIMT", "pastell" to "GLIMT")
    private val WHO_C = mapOf("gris" to 0xFFF6B3C1, "glimt" to 0xFFFFC7B8, "natt" to 0xFFFFE7A8, "sky" to 0xFFBCD7EF, "drape" to 0xFF9FD0F2, "ugle" to 0xFFE8C49A,
        "stjerne" to 0xFFFFB38A, "spire" to 0xFF9FD8A8, "halo" to 0xFFFFC7B8, "boble" to 0xFFFFC7B8, "antenne" to 0xFFFFC7B8, "bane" to 0xFFFFC7B8, "pastell" to 0xFFF4A6A0)
    fun name(id: String): String = NAMES[id] ?: "Glimt"
    fun who(id: String): String = WHO[id] ?: "GLIMT"
    fun whoColor(id: String): Color = Color(WHO_C[id] ?: 0xFFFFC7B8)
    /** Høyden i forhold til bredden (wrap(S, mood, kids, h) i fasiten). */
    fun h(id: String): Float = when (id) { "drape", "spire" -> 1f; "ugle", "gris" -> 1.04f; else -> 1.1f }
    fun norm(id: String?): String = id?.trim()?.lowercase()?.takeIf { it in IDS } ?: "glimt"
    fun mood(m: String?): String = when (m?.lowercase()) { "glad", "happy", "wave", "done" -> "glad"; "talk", "snakker", "point", "speak" -> "talk"; "sov", "sover", "sleep", "night" -> "sov"; else -> "idle" }
}

/** Figuren i appen. size = bredden (høyden er Fig35.h(id) × size). still = stillbilde (f.eks. i lister). */
@Composable
internal fun GlimtFig35(id: String, size: Dp, mood: String = "idle", modifier: Modifier = Modifier, still: Boolean = false, noJul: Boolean = false) {
    val reduce = reduceMotion31() || still
    val clock = remember { mutableFloatStateOf(0f) }
    if (!reduce) LaunchedEffect(Unit) {
        val t0 = withFrameNanos { it }
        while (true) withFrameNanos { n -> clock.floatValue = (n - t0) / 1_000_000_000f }
    }
    val tm = rememberTextMeasurer()
    val fid = Fig35.norm(id)
    val md = Fig35.mood(mood)
    Canvas(modifier.size(size, size * Fig35.h(fid)).semantics { contentDescription = Fig35.name(fid) }) {
        drawFig35(fid, this.size.width, md, if (reduce) 0f else clock.floatValue, !reduce, tm, noJul)
    }
}

/* ---------------- Figuren som bitmap (widgets) ---------------- */

private val bmpCache35 = HashMap<String, android.graphics.Bitmap>()

/**
 * Figuren som bitmap, [px] bred, med luft rundt (hopp og gnister går utenfor). t = tidspunkt i animasjonen (positur),
 * null = stillbilde (idle, øynene åpne).
 */
fun fig35Bitmap(id: String, px: Int, mood: String = "idle", t: Float? = null): android.graphics.Bitmap {
    val fid = Fig35.norm(id)
    val md = Fig35.mood(mood)
    // Prompt 40: julemodus gir lue/hatt over hodet (mer luft øverst) og egen nøkkel i bufferen.
    val jul = no.kristo.finanshub.Jul40.phase
    val key = "$fid|$px|$md|${t ?: -1f}|${jul ?: ""}"
    synchronized(bmpCache35) { bmpCache35[key]?.let { return it } }
    val S = px.toFloat()
    val padX = S * (if (jul != null) .24f else .16f)
    val padTop = S * (if (jul != null) .5f else .26f)
    val w = (S + padX * 2).toInt()
    val h = (S * Fig35.h(fid) + padTop + S * (if (jul != null) .24f else .08f)).toInt()
    val img = ImageBitmap(w, h)
    val canvas = androidx.compose.ui.graphics.Canvas(img)
    CanvasDrawScope().draw(Density(px / 96f), LayoutDirection.Ltr, canvas, Size(w.toFloat(), h.toFloat())) {
        translate(padX, padTop) { drawFig35(fid, S, md, t ?: 0f, t != null, null) }
    }
    val out = img.asAndroidBitmap()
    synchronized(bmpCache35) {
        if (bmpCache35.size > 60) bmpCache35.clear()
        bmpCache35[key] = out
    }
    return out
}

/* ---------------- Animasjon ---------------- */

private fun ease35(x: Float): Float = (0.5 - 0.5 * cos(PI * x.coerceIn(0f, 1f))).toFloat()

/** Fase 0–1 i en periode med forsinkelse; −1 før animasjonen har startet. */
private fun ph35(t: Float, period: Float, delay: Float = 0f): Float {
    val x = t - delay
    if (x < 0f) return -1f
    return (x % period) / period
}

/** 0 % og 100 % = a, 50 % = b (ease-in-out). */
private fun ping35(t: Float, period: Float, a: Float, b: Float, delay: Float = 0f): Float {
    val p = ph35(t, period, delay)
    if (p < 0f) return a
    val q = if (p < .5f) p * 2f else (1f - p) * 2f
    return a + (b - a) * ease35(q)
}

/** Keyframes med ease per segment. */
private fun kf35(p: Float, stops: FloatArray, vals: FloatArray): Float {
    if (p <= stops[0]) return vals[0]
    for (i in 1 until stops.size) {
        if (p <= stops[i]) {
            val u = (p - stops[i - 1]) / (stops[i] - stops[i - 1])
            return vals[i - 1] + (vals[i] - vals[i - 1]) * ease35(u)
        }
    }
    return vals.last()
}

private class Anim35(val t: Float, val on: Boolean) {
    fun spin(period: Float): Float = if (!on) 0f else 360f * ((t % period) / period)
    fun pingV(period: Float, a: Float, b: Float, delay: Float = 0f): Float = if (!on) a else ping35(t, period, a, b, delay)
    /** gfBlink: 1 → (96 %) .1 → 1. */
    fun blink(period: Float): Float = if (!on) 1f else kf35(ph35(t, period), floatArrayOf(0f, .93f, .96f, 1f), floatArrayOf(1f, 1f, .1f, 1f))
    /** gfTalk: scaleY .4 ↔ 1 (0,3 s). */
    fun talk(): Float = if (!on) 1f else ping35(t, .3f, .4f, 1f)
    /** gfTw: opasitet .25 ↔ 1, skala .6 ↔ 1.1. Returnerer 0–1. */
    fun tw(period: Float, delay: Float): Float = if (!on) .7f else ping35(t, period, 0f, 1f, delay).coerceAtLeast(0f)
    /** gfWave: −12° ↔ 30°. */
    fun wave(period: Float): Float = if (!on) -12f else ping35(t, period, -12f, 30f)
    /** gfLeaf: −8° ↔ 10°. */
    fun leaf(period: Float): Float = if (!on) 0f else ping35(t, period, -8f, 10f)
    /** gfSway: −8° ↔ 8°. */
    fun sway(period: Float): Float = if (!on) 0f else ping35(t, period, -8f, 8f)
    /** gfGlow: 0 = opasitet .55 / skala .96, 1 = .9 / 1.06. */
    fun glow(period: Float): Float = if (!on) .5f else ping35(t, period, 0f, 1f)
}

/* ---------------- Tegnehjelpere ---------------- */

private val INK35 = Color(0xFF1B1A17)
private val CREAM35 = Color(0xFFFFFDF8)
private val MOUTH35 = Color(0xFFB23A2A)
private val RN35 = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFFF2C14E), Color(0xFF3FBF9A), Color(0xFF7A5AD6), Color(0xFFB23A2A))
private val PS35 = listOf(Color(0xFFF4A6A0), Color(0xFFF7C9A0), Color(0xFFF6E3A1), Color(0xFFA8E0C8), Color(0xFFC3B4EF), Color(0xFFF4A6A0))

private fun rgba(r: Int, g: Int, b: Int, a: Float) = Color(r, g, b, (a * 255).toInt().coerceIn(0, 255))

/** CSS border-radius med elliptiske hjørner (rx, ry), skalert ned slik CSS gjør når summen er for stor. */
private fun cssRR35(x: Float, y: Float, w: Float, h: Float, tl: Pair<Float, Float>, tr: Pair<Float, Float>, br: Pair<Float, Float>, bl: Pair<Float, Float>): Path {
    var f = 1f
    fun lim(sum: Float, side: Float) { if (sum > side && sum > 0f) f = min(f, side / sum) }
    lim(tl.first + tr.first, w); lim(bl.first + br.first, w); lim(tl.second + bl.second, h); lim(tr.second + br.second, h)
    val rr = RoundRect(Rect(x, y, x + w, y + h), CornerRadius(tl.first * f, tl.second * f), CornerRadius(tr.first * f, tr.second * f),
        CornerRadius(br.first * f, br.second * f), CornerRadius(bl.first * f, bl.second * f))
    return Path().apply { addRoundRect(rr) }
}

/** Prosent-hjørner: «50% 0 50% 50%» → andeler av bredde/høyde per hjørne (tl, tr, br, bl), samme andel horisontalt og vertikalt. */
private fun pctRR35(x: Float, y: Float, w: Float, h: Float, tl: Float, tr: Float, br: Float, bl: Float): Path =
    cssRR35(x, y, w, h, tl * w to tl * h, tr * w to tr * h, br * w to br * h, bl * w to bl * h)

/** «a% b% c% d% / e% f% g% h%». */
private fun pctRR35(x: Float, y: Float, w: Float, h: Float, hx: FloatArray, vy: FloatArray): Path =
    cssRR35(x, y, w, h, hx[0] * w to vy[0] * h, hx[1] * w to vy[1] * h, hx[2] * w to vy[2] * h, hx[3] * w to vy[3] * h)

/** linear-gradient(deg, …) over et rektangel (CSS-vinkel: 0 = mot toppen, 180 = mot bunnen). */
private fun cssLin35(deg: Float, x: Float, y: Float, w: Float, h: Float, c0: Color, c1: Color): Brush {
    val c = listOf(c0, c1)
    val r = Math.toRadians(deg.toDouble())
    val dx = sin(r).toFloat(); val dy = -cos(r).toFloat()
    val len = abs(w * dx) + abs(h * dy)
    val cx = x + w / 2; val cy = y + h / 2
    return Brush.linearGradient(c, Offset(cx - dx * len / 2, cy - dy * len / 2), Offset(cx + dx * len / 2, cy + dy * len / 2))
}

/** radial-gradient(circle at fx fy, …) med stopp i andeler av farthest-corner. */
private fun cssRad35(x: Float, y: Float, w: Float, h: Float, fx: Float, fy: Float, vararg stops: Pair<Float, Color>): Brush {
    val cx = x + w * fx; val cy = y + h * fy
    val dx = max(cx - x, x + w - cx); val dy = max(cy - y, y + h - cy)
    val r = sqrt(dx * dx + dy * dy).coerceAtLeast(.01f)
    return Brush.radialGradient(*stops, center = Offset(cx, cy), radius = r)
}

/** box-shadow: inset ox oy 0 farge – stripen innenfor formen som ikke dekkes av formen forskjøvet med (ox, oy). */
private fun DrawScope.inset35(shape: Path, ox: Float, oy: Float, c: Color) {
    val moved = Path().apply { addPath(shape, Offset(ox, oy)) }
    val band = Path().apply { op(shape, moved, PathOperation.Difference) }
    drawPath(band, c)
}

/** Konisk gradient (from 0deg = klokka 12) som ring (mask: radial-gradient … calc(100% − t px)). */
private fun DrawScope.conicRing35(x: Float, y: Float, d: Float, thick: Float, colors: List<Color>, deg: Float) {
    val c = Offset(x + d / 2, y + d / 2)
    rotate(deg - 90f, c) { drawCircle(Brush.sweepGradient(colors, c), d / 2 - thick / 2, c, style = Stroke(thick)) }
}

/** Uskarp glorie (filter: blur) som konisk sirkel med myk kant. */
private fun DrawScope.glow35(x: Float, y: Float, d: Float, blur: Float, alpha: Float, scale: Float, deg: Float) {
    val c = Offset(x + d / 2, y + d / 2)
    val r = d / 2 * scale
    val outer = r + blur * 1.4f
    drawIntoCanvas { cv ->
        cv.saveLayer(Rect(c.x - outer, c.y - outer, c.x + outer, c.y + outer), Paint())
        rotate(deg - 90f, c) { drawCircle(Brush.sweepGradient(RN35, c), outer, c, alpha = alpha) }
        drawCircle(Brush.radialGradient(0f to Color.Black, ((r - blur) / outer).coerceIn(0f, .98f) to Color.Black, 1f to Color.Transparent, center = c, radius = outer),
            outer, c, blendMode = BlendMode.DstIn)
        cv.restore()
    }
}

/** 4-spisset gnist (viewBox 24). v = gfTw-fasen 0–1. */
private fun DrawScope.spark35(x: Float, y: Float, sz: Float, c: Color, v: Float) {
    val sc = .6f + .5f * v
    val k = sz / 24f
    val p = Path().apply {
        moveTo(12f * k, 1.5f * k)
        cubicTo(12.6f * k, 6.4f * k, 16.6f * k, 10.4f * k, 21.5f * k, 11f * k); lineTo(21.5f * k, 13f * k)
        cubicTo(16.6f * k, 13.6f * k, 12.6f * k, 17.6f * k, 12f * k, 22.5f * k)
        cubicTo(11.4f * k, 17.6f * k, 7.4f * k, 13.6f * k, 2.5f * k, 13f * k); lineTo(2.5f * k, 11f * k)
        cubicTo(7.4f * k, 10.4f * k, 11.4f * k, 6.4f * k, 12f * k, 1.5f * k); close()
    }
    translate(x, y) { scale(sc, sc, Offset(sz / 2, sz / 2)) { drawPath(p, c, alpha = .25f + .75f * v) } }
}

private val STAR35 = floatArrayOf(.5f, 0f, .61f, .35f, .98f, .35f, .68f, .57f, .79f, .91f, .5f, .7f, .21f, .91f, .32f, .57f, .02f, .35f, .39f, .35f)
private fun star35(x: Float, y: Float, w: Float, h: Float): Path = Path().apply {
    for (i in STAR35.indices step 2) { val px = x + STAR35[i] * w; val py = y + STAR35[i + 1] * h; if (i == 0) moveTo(px, py) else lineTo(px, py) }
    close()
}

/** «z» som flyter opp når figuren sover (gfZ 2,4 s, to stk. forskjøvet 1,2 s). Tegnes som strek. */
private fun DrawScope.zz35(S: Float, mood: String, c: Color, a: Anim35) {
    if (mood != "sov") return
    for (i in 0..1) {
        val p = if (a.on) ph35(a.t, 2.4f, i * 1.2f) else if (i == 0) .35f else -1f
        if (p < 0f) continue
        val e = 1f - (1f - p) * (1f - p) // ease-out
        val op = if (p < .3f) p / .3f else 1f - (p - .3f) / .7f
        val k = S / (76f * density).coerceAtLeast(.01f)
        val dx = 14f * density * k * e; val dy = -26f * density * k * e
        val sc = .6f + .5f * e
        val fz = S * .14f * sc
        val x0 = S + S * .05f - fz * .9f + dx; val y0 = S * .02f + dy + fz * .2f
        val w = fz * .62f; val hh = fz * .62f
        val pth = Path().apply { moveTo(x0, y0); lineTo(x0 + w, y0); lineTo(x0, y0 + hh); lineTo(x0 + w, y0 + hh) }
        drawPath(pth, c, alpha = op.coerceIn(0f, 1f), style = Stroke(fz * .16f, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
    }
}

/** face(S, mood, ink, cheek, o) fra fasiten. Containerens rektangel (ox, oy, W, H); prosentene gjelder containeren. */
private class FaceO35(val ey: Float = .40f, val gap: Float = .27f, val ew: Float = .09f, val eh: Float = .13f, val my: Float = .60f, val cx: Float = .14f, val cy: Float = .54f)

private fun DrawScope.face35(ox: Float, oy: Float, W: Float, H: Float, S: Float, mood: String, ink: Color, cheek: Color, o: FaceO35, a: Anim35, mouth: Boolean = true) {
    val ew = S * o.ew; val eh = S * o.eh
    for (right in listOf(false, true)) {
        when (mood) {
            "glad" -> {
                val w = ew * 1.5f; val h = ew * .9f; val st = S * .035f
                val x = if (right) ox + W - o.gap * W - w else ox + o.gap * W
                val y = oy + o.ey * H
                drawArc(ink, 180f, 180f, false, Offset(x + st / 2, y + st / 2), Size(w - st, (h - st).coerceAtLeast(.5f)), style = Stroke(st, cap = StrokeCap.Round))
            }
            "sov" -> {
                val w = ew * 1.5f; val h = ew * .8f; val st = S * .03f
                val x = if (right) ox + W - o.gap * W - w else ox + o.gap * W
                val y = oy + o.ey * H + eh * .4f
                drawArc(ink, 0f, 180f, false, Offset(x + st / 2, y + st / 2), Size(w - st, (h - st).coerceAtLeast(.5f)), style = Stroke(st, cap = StrokeCap.Round))
            }
            else -> {
                val x = if (right) ox + W - o.gap * W - ew else ox + o.gap * W
                val y = oy + o.ey * H
                val b = a.blink(4.2f)
                scale(1f, b, Offset(x + ew / 2, y + eh / 2)) {
                    drawRoundRect(ink, Offset(x, y), Size(ew, eh), CornerRadius(ew / 2, ew / 2))
                    val hs = ew * .38f
                    drawOval(Color.White, Offset(x + ew * .18f, y + eh * .14f), Size(hs, hs))
                }
            }
        }
    }
    // Kinn.
    val cw = S * .12f; val chh = S * .07f
    drawOval(cheek, Offset(ox + o.cx * W, oy + o.cy * H), Size(cw, chh))
    drawOval(cheek, Offset(ox + W - o.cx * W - cw, oy + o.cy * H), Size(cw, chh))
    if (!mouth) return
    val mx = ox + W / 2; val y = oy + o.my * H
    when (mood) {
        "talk" -> {
            val w = S * .16f; val h = S * .12f
            scale(1f, a.talk(), Offset(mx, y + h * .3f)) { drawRoundRect(MOUTH35, Offset(mx - w / 2, y), Size(w, h), CornerRadius(w * .45f, h * .45f)) }
        }
        "sov" -> { val d = S * .07f; drawOval(ink, Offset(mx - d / 2, y), Size(d, d), alpha = .6f) }
        "glad" -> {
            val w = S * .2f; val h = S * .1f
            val p = Path().apply { moveTo(mx - w / 2, y); arcTo(Rect(mx - w / 2, y - h, mx + w / 2, y + h), 180f, -180f, false); close() }
            drawPath(p, MOUTH35)
        }
        else -> {
            val w = S * .14f; val h = S * .06f; val st = S * .03f
            drawArc(ink, 0f, 180f, false, Offset(mx - w / 2 + st / 2, y - h + st / 2), Size(w - st, (h * 2 - st).coerceAtLeast(.5f)), style = Stroke(st, cap = StrokeCap.Round))
        }
    }
}

/* ---------------- Figurene ---------------- */

/** Tegner figuren med øvre venstre hjørne i (0, 0); S = bredden. */
internal fun DrawScope.drawFig35(id: String, S: Float, mood: String, t: Float, anim: Boolean, tm: TextMeasurer?, noJul: Boolean = false) {
    val a = Anim35(t, anim)
    val hf = Fig35.h(id)
    val k = (S / (76f * density)).coerceIn(.35f, 1.4f)
    // wrap(): svev (gfBob), hopp (gfHop) eller pust (gfSq), transform-origin 50 % 100 %.
    var dy = 0f; var sx = 1f; var sy = 1f
    if (anim) when (mood) {
        "glad" -> {
            val p = ph35(t, 1f)
            val st = floatArrayOf(0f, .3f, .55f, .8f, 1f)
            dy = kf35(p, st, floatArrayOf(0f, 0f, -16f, 0f, 0f)) * density * k
            sx = kf35(p, st, floatArrayOf(1f, 1.08f, .95f, 1.04f, 1f)); sy = kf35(p, st, floatArrayOf(1f, .9f, 1.06f, .96f, 1f))
        }
        "sov" -> { val v = ping35(t, 3.6f, 0f, 1f); sx = 1f + .04f * v; sy = 1f - .04f * v }
        else -> dy = ping35(t, 2.6f, 0f, -6f) * density * k
    }
    val sp = if (mood == "talk") 1.4f else 6f
    val ck = rgba(232, 121, 74, .38f)
    withTransform({ translate(0f, dy); scale(sx, sy, Offset(S / 2, S * hf)) }) {
        when (id) {
            "halo" -> {
                val g = a.glow(3.2f)
                glow35(-S * .08f, S * .04f, S * 1.16f, S * .09f, .6f * (.55f + .35f * g), .96f + .1f * g, a.spin(sp))
                conicRing35(0f, S * .12f, S, S * .11f, RN35, a.spin(sp))
                drawCircle(CREAM35, S * .39f, Offset(S * .11f + S * .39f, S * .23f + S * .39f))
                face35(S * .11f, S * .23f, S * .78f, S * .78f, S * .78f, mood, INK35, ck, FaceO35(), a)
                spark35(-S * .06f, S * .1f, S * .14f, Color(0xFFF2C14E), a.tw(1.8f, 0f))
                spark35(S * .86f, S * .02f, S * .18f, Color(0xFFFF7A52), a.tw(1.8f, .6f))
                spark35(S * .9f, S * .8f, S * .12f, Color(0xFF7A5AD6), a.tw(1.8f, 1.1f))
                zz35(S, mood, Color(0xFF7A5AD6), a)
            }
            "boble" -> {
                val c = Offset(S / 2, S * .1f + S / 2)
                val R = S / 2
                drawCircle(Brush.radialGradient(0f to rgba(122, 90, 214, .25f), ((R - S * .04f) / (R + S * .12f)) to rgba(122, 90, 214, .25f), 1f to Color.Transparent,
                    center = c + Offset(0f, S * .06f), radius = R + S * .12f), R + S * .12f, c + Offset(0f, S * .06f))
                rotate(a.spin(if (mood == "talk") 2f else 9f), c) {
                    rotate(-90f, c) { drawCircle(Brush.sweepGradient(RN35, c), R, c) }
                    drawCircle(rgba(255, 253, 248, .96f), S * .387f, Offset(S / 2, S * .1f + S * .55f))
                }
                val circ = Path().apply { addOval(Rect(0f, S * .1f, S, S * 1.1f)) }
                clipPath(circ) {
                    drawRect(cssRad35(0f, S * .1f, S, S, .3f, .24f, 0f to rgba(255, 255, 255, .95f), .06f to rgba(255, 255, 255, .95f), .18f to Color(0x00FFFFFF)), Offset(0f, S * .1f), Size(S, S))
                    drawRect(cssRad35(0f, S * .1f, S, S, .5f, .5f, 0f to Color.Transparent, .62f to Color.Transparent, .70f to rgba(255, 255, 255, .35f), .76f to Color.Transparent, 1f to Color.Transparent),
                        Offset(0f, S * .1f), Size(S, S))
                }
                face35(S * .2f, S * .3f, S * .6f, S * .6f, S * .6f, mood, INK35, ck, FaceO35(), a)
                drawCircle(rgba(255, 255, 255, .9f), S * .04f, Offset(S * .74f + S * .04f, S * .2f + S * .04f))
                zz35(S, mood, Color(0xFF7A5AD6), a)
            }
            "antenne" -> {
                // Antennen med stjerne (gfSway 1,8 s, origin 50 % 100 %).
                val ax = S * .5f - S * .015f; val ay = -S * .08f
                rotate(a.sway(1.8f), Offset(ax + S * .015f, ay + S * .24f)) {
                    drawRoundRect(INK35, Offset(ax, ay), Size(S * .03f, S * .24f), CornerRadius(S * .02f, S * .02f))
                    spark35(ax - S * .08f, ay - S * .1f, S * .2f, Color(0xFFFF7A52), a.tw(1.8f, 0f))
                }
                val waving = mood == "glad" || mood == "talk"
                val lw = S * .2f; val lh = S * .09f
                rotate(if (waving) a.wave(1.2f) else 0f, Offset(-S * .08f + lw * .9f, S * .6f + lh / 2)) {
                    drawRoundRect(INK35, Offset(-S * .08f, S * .6f), Size(lw, lh), CornerRadius(S * .05f, S * .05f))
                }
                rotate(14f, Offset(S * .88f + lw / 2, S * .64f + lh / 2)) {
                    drawRoundRect(INK35, Offset(S * .88f, S * .64f), Size(lw, lh), CornerRadius(S * .05f, S * .05f))
                }
                conicRing35(0f, S * .14f, S, S * .075f, RN35, a.spin(sp))
                drawCircle(CREAM35, S * .42f, Offset(S * .08f + S * .42f, S * .22f + S * .42f))
                face35(S * .08f, S * .22f, S * .84f, S * .84f, S * .84f, mood, INK35, ck, FaceO35(), a)
                zz35(S, mood, Color(0xFF7A5AD6), a)
            }
            "bane" -> {
                // Bane 1 (oransje/gul, gfOrb 4 s / 1,2 s når den snakker).
                val b1 = S * .035f
                val c1 = Offset(-S * .12f + S * .62f, S * .32f + S * .3f)
                rotate(a.spin(if (mood == "talk") 1.2f else 4f), c1) {
                    val tl = Offset(-S * .12f + b1 / 2, S * .32f + b1 / 2); val sz = Size(S * 1.24f - b1, S * .6f - b1)
                    drawArc(Color(0xFFE8794A), 225f, 90f, false, tl, sz, style = Stroke(b1))
                    drawArc(Color(0xFFF2C14E), 315f, 90f, false, tl, sz, style = Stroke(b1))
                }
                val bx = S * .06f; val by = S * .16f; val bd = S * .88f
                drawCircle(cssLin35(160f, bx, by, bd, bd, CREAM35, Color(0xFFF1ECE2)), bd / 2, Offset(bx + bd / 2, by + bd / 2))
                inset35(Path().apply { addOval(Rect(bx, by, bx + bd, by + bd)) }, 0f, -S * .05f, rgba(27, 26, 23, .06f))
                face35(bx, by, bd, bd, bd, mood, INK35, ck, FaceO35(), a)
                // Bane 2 (grønn/lilla, gfOrbR 5,5 s / 1,6 s) foran fjeset.
                val b2 = S * .03f
                val c2 = Offset(-S * .06f + S * .56f, S * .2f + S * .4f)
                rotate(-a.spin(if (mood == "talk") 1.6f else 5.5f), c2) {
                    val tl = Offset(-S * .06f + b2 / 2, S * .2f + b2 / 2); val sz = Size(S * 1.12f - b2, S * .8f - b2)
                    drawArc(Color(0xFF3FBF9A), 45f, 90f, false, tl, sz, style = Stroke(b2))
                    drawArc(Color(0xFF7A5AD6), 135f, 90f, false, tl, sz, style = Stroke(b2))
                }
                zz35(S, mood, Color(0xFF2B5D8A), a)
            }
            "pastell" -> {
                // Hårlokk (border-top/right #e8794a, rotate −30°).
                val lx = S * .42f; val ly = S * .02f; val lw = S * .2f; val lh = S * .18f; val lb = S * .035f
                rotate(-30f, Offset(lx + lw / 2, ly + lh / 2)) {
                    drawArc(Color(0xFFE8794A), 225f, 180f, false, Offset(lx + lb / 2, ly + lb / 2), Size(lw - lb, lh - lb), style = Stroke(lb, cap = StrokeCap.Round))
                }
                conicRing35(0f, S * .12f, S, S * .12f, PS35, a.spin(if (mood == "talk") 1.8f else 8f))
                val fx = S * .12f; val fy = S * .24f; val fd = S * .76f
                drawCircle(cssRad35(fx, fy, fd, fd, .5f, .4f, 0f to CREAM35, 1f to Color(0xFFFBF3EA)), fd / 2, Offset(fx + fd / 2, fy + fd / 2))
                face35(fx, fy, fd, fd, fd, mood, Color(0xFF3D2A2A), rgba(244, 140, 140, .55f), FaceO35(ew = .11f, eh = .14f, cy = .56f, cx = .10f), a)
                spark35(S * .84f, S * .12f, S * .12f, Color(0xFFF4A6A0), a.tw(1.8f, .3f))
                zz35(S, mood, Color(0xFFC3B4EF), a)
            }
            "natt" -> {
                val g = a.glow(3.6f)
                glow35(-S * .06f, S * .06f, S * 1.12f, S * .08f, .35f * (.55f + .35f * g), .96f + .1f * g, a.spin(sp))
                conicRing35(0f, S * .12f, S, S * .07f, RN35, a.spin(sp))
                val fx = S * .08f; val fy = S * .2f; val fd = S * .84f
                drawCircle(cssRad35(fx, fy, fd, fd, .5f, .35f, 0f to Color(0xFF2A2A3A), 1f to Color(0xFF141420)), fd / 2, Offset(fx + fd / 2, fy + fd / 2))
                face35(fx, fy, fd, fd, fd, mood, Color(0xFFFFE7A8), rgba(232, 121, 74, .35f), FaceO35(), a)
                spark35(S * .8f, S * .04f, S * .14f, Color(0xFFFFE7A8), a.tw(1.8f, .4f))
                spark35(S * .02f, S * .2f, S * .1f, Color(0xFFC3B4EF), a.tw(1.8f, 1f))
                zz35(S, mood, Color(0xFFFFE7A8), a)
            }
            "sky" -> {
                val base = cssRR35(S * .04f, S * .38f, S * .92f, S * .5f, S * .25f to S * .25f, S * .25f to S * .25f, S * .25f to S * .25f, S * .25f to S * .25f)
                drawPath(base, Color.White)
                inset35(base, 0f, -S * .05f, rgba(43, 93, 138, .12f))
                drawCircle(Color.White, S * .21f, Offset(S * .14f + S * .21f, S * .2f + S * .21f))
                drawCircle(Color.White, S * .24f, Offset(S * .4f + S * .24f, S * .1f + S * .24f))
                face35(S * .12f, S * .3f, S * .76f, S * .5f, S * .76f, mood, Color(0xFF2B4A66), rgba(242, 154, 138, .45f), FaceO35(ey = .34f, my = .60f, cy = .52f), a)
                if (mood == "talk" || mood == "idle") for (i in 0..2) {
                    val p = if (anim) ph35(t, 1.6f, i * .45f) else .3f + i * .2f
                    if (p < 0f) continue
                    val op = if (p < .2f) p / .2f else 1f - (p - .2f) / .8f
                    val dyy = 18f * density * k * (p * p)
                    val dx = S * (.3f + i * .18f); val dw = S * .05f; val dh = S * .09f
                    val drop = cssRR35(dx, S * .9f + dyy, dw, dh, dw * .5f to dh * .6f, dw * .5f to dh * .6f, dw * .5f to dh * .4f, dw * .5f to dh * .4f)
                    drawPath(drop, Color(0xFF7FB2E0), alpha = op.coerceIn(0f, 1f))
                }
                zz35(S, mood, Color(0xFF2B5D8A), a)
            }
            "stjerne" -> {
                val sx0 = S * .02f; val sy0 = S * .04f; val sd = S * .96f
                drawPath(star35(sx0, sy0 + 4f * density * k, sd, sd), rgba(178, 58, 42, .25f))
                drawPath(star35(sx0, sy0, sd, sd), cssLin35(160f, sx0, sy0, sd, sd, Color(0xFFFFB38A), Color(0xFFFF6A3C)))
                val gx = S * .06f; val gy = S * .08f; val gd = S * .88f
                drawPath(star35(gx, gy, gd, gd), cssRad35(gx, gy, gd, gd, .4f, .35f, 0f to rgba(255, 255, 255, .45f), .45f to Color(0x00FFFFFF), 1f to Color(0x00FFFFFF)))
                face35(S * .25f, S * .28f, S * .5f, S * .5f, S * .5f, mood, Color(0xFF5A1A0C), rgba(255, 255, 255, .45f), FaceO35(ey = .26f, gap = .18f, my = .62f, cy = .50f, cx = 0f), a)
                val v = a.tw(1.6f, 0f)
                val ms = S * .12f
                translate(S * .86f, S * .12f) { scale(.6f + .5f * v, .6f + .5f * v, Offset(ms / 2, ms / 2)) { drawPath(star35(0f, 0f, ms, ms), Color(0xFFF2C14E), alpha = .25f + .75f * v) } }
                zz35(S, mood, Color(0xFFB23A2A), a)
            }
            "drape" -> {
                val dx = S * .14f; val dyy = S * .12f; val dd = S * .72f
                rotate(-45f, Offset(dx + dd / 2, dyy + dd / 2)) {
                    val shape = pctRR35(dx, dyy, dd, dd, .5f, 0f, .5f, .5f)
                    drawPath(shape, cssLin35(200f, dx, dyy, dd, dd, Color(0xFF9FD0F2), Color(0xFF4F8FD0)))
                    inset35(shape, -S * .04f, -S * .04f, rgba(27, 60, 110, .2f))
                    val hx = dx + dd * .16f; val hy = dyy + dd * .34f; val hw = dd * .16f; val hh = dd * .26f
                    rotate(45f, Offset(hx + hw / 2, hy + hh / 2)) { drawOval(rgba(255, 255, 255, .55f), Offset(hx, hy), Size(hw, hh)) }
                }
                face35(S * .18f, S * .3f, S * .64f, S * .54f, S * .64f, mood, Color(0xFF163150), rgba(255, 170, 170, .5f), FaceO35(ey = .38f, my = .64f, cy = .56f), a)
                zz35(S, mood, Color(0xFF2B5D8A), a)
            }
            "ugle" -> drawUgle35(S, mood, a)
            "gris" -> drawGris35(S, mood, a, tm)
            "spire" -> {
                // Stilk med to blader (gfLeaf 2 s, origin 50 % 100 %).
                val stx = S * .46f; val stw = S * .08f; val sth = S * .24f
                rotate(a.leaf(2f), Offset(stx + stw / 2, sth)) {
                    drawRoundRect(Color(0xFF3F8A4F), Offset(stx, 0f), Size(stw, sth), CornerRadius(S * .04f, S * .04f))
                    drawPath(pctRR35(stx + S * .04f, -S * .02f, S * .24f, S * .14f, 0f, 1f, 0f, 1f), Color(0xFF6FC28F))
                    drawPath(pctRR35(stx + stw - S * .04f - S * .2f, S * .04f, S * .2f, S * .12f, 1f, 0f, 1f, 0f), Color(0xFF4FA86A))
                }
                val bx = S * .06f; val by = S * .2f; val bw = S * .88f; val bh = S * .76f
                val body = pctRR35(bx, by, bw, bh, floatArrayOf(.5f, .5f, .46f, .46f), floatArrayOf(.58f, .58f, .42f, .42f))
                drawPath(body, cssLin35(180f, bx, by, bw, bh, Color(0xFF9FD8A8), Color(0xFF5FAE74)))
                inset35(body, 0f, -S * .06f, rgba(31, 90, 50, .18f))
                face35(S * .12f, S * .3f, S * .76f, S * .6f, S * .76f, mood, Color(0xFF173A22), rgba(255, 170, 150, .55f), FaceO35(ey = .34f, my = .58f, cy = .50f), a)
                zz35(S, mood, Color(0xFF2F7A4F), a)
            }
            else -> {
                // glimt: krem fjes i regnbuering, oransje gnist over hodet.
                spark35(S * .4f, -S * .04f, S * .2f, Color(0xFFFF7A52), a.tw(1.8f, 0f))
                conicRing35(0f, S * .12f, S, max(2.5f * density, S * .07f), RN35, a.spin(sp))
                drawCircle(CREAM35, S * .42f, Offset(S * .08f + S * .42f, S * .2f + S * .42f))
                face35(S * .08f, S * .2f, S * .84f, S * .84f, S * .84f, mood, INK35, ck, FaceO35(), a)
                zz35(S, mood, Color(0xFF7A5AD6), a)
            }
        }
        // Prompt 40 (claude-code-glimt-jul.md): figurbiblioteket legger selv på antrekket når julemodus er aktiv (alle steder
        // som tegner Glimt: brief, chat, varsler, søk, widgets). Unntak: noJul (figurvelgeren).
        if (!noJul) no.kristo.finanshub.Jul40.phase?.let { drawJul40(S, S * hf, it, t, anim) }
            ?: run { if (no.kristo.finanshub.Mai41.on) drawMai41(S, S * hf, t, anim) } // Prompt 41: sløyfe + flagg 14.–17. mai
    }
}

private fun DrawScope.drawUgle35(S: Float, mood: String, a: Anim35) {
    val br = Color(0xFF8A5A3B); val bl = Color(0xFFB07A52)
    // Ørefjær (trekanter av border-triksene, rotert ∓12°).
    run {
        val x = S * .14f; val y = S * .02f; val w = S * .16f; val h = S * .2f
        rotate(-12f, Offset(x + w / 2, y + h / 2)) { drawPath(Path().apply { moveTo(x + S * .1f, y); lineTo(x + w, y + h); lineTo(x, y + h); close() }, br) }
    }
    run {
        val w = S * .16f; val h = S * .2f; val x = S - S * .14f - w; val y = S * .02f
        rotate(12f, Offset(x + w / 2, y + h / 2)) { drawPath(Path().apply { moveTo(x + S * .06f, y); lineTo(x + w, y + h); lineTo(x, y + h); close() }, br) }
    }
    val body = pctRR35(S * .1f, S * .12f, S * .8f, S * .88f, floatArrayOf(.48f, .48f, .44f, .44f), floatArrayOf(.48f, .48f, .44f, .44f))
    drawPath(body, cssLin35(180f, S * .1f, S * .12f, S * .8f, S * .88f, bl, br))
    // Brystet med flekker.
    val cx = S * .28f; val cy = S * .56f; val cw = S * .44f; val chh = S * .4f
    val chest = Path().apply { addOval(Rect(cx, cy, cx + cw, cy + chh)) }
    drawPath(chest, Color(0xFFF1DCC0))
    clipPath(chest) {
        for ((fx, fy) in listOf(.3f to .3f, .7f to .45f, .45f to .7f)) drawCircle(Color(0xFFD9B994), S * .033f, Offset(cx + cw * fx, cy + chh * fy))
    }
    // Øynene (gul ring), blunker 4,6 s.
    val ed = S * .32f
    for (right in listOf(false, true)) {
        val ex = if (right) S - S * .16f - ed else S * .16f
        val ey = S * .24f
        drawCircle(Color(0xFFF2C14E), ed / 2 + S * .025f, Offset(ex + ed / 2, ey + ed / 2))
        drawCircle(CREAM35, ed / 2, Offset(ex + ed / 2, ey + ed / 2))
        if (mood == "sov" || mood == "glad") {
            val lx = ex + ed * .22f; val ly = ey + ed * .44f; val lw = ed * .56f; val lh = ed * .22f; val st = S * .035f
            drawArc(INK35, if (mood == "glad") 180f else 0f, 180f, false, Offset(lx + st / 2, ly + st / 2), Size(lw - st, (lh - st).coerceAtLeast(.5f)), style = Stroke(st, cap = StrokeCap.Round))
        } else {
            val pd = ed * .44f; val px = ex + ed * .28f; val py = ey + ed * .28f
            scale(1f, a.blink(4.6f), Offset(px + pd / 2, py + pd / 2)) {
                drawCircle(INK35, pd / 2, Offset(px + pd / 2, py + pd / 2))
                drawCircle(Color.White, pd * .16f, Offset(px + pd * .2f + pd * .16f, py + pd * .16f + pd * .16f))
            }
        }
    }
    // Nebbet (snakker: gfTalk, origin 50 % 0).
    val nx = S * .5f; val ny = S * .5f
    scale(1f, if (mood == "talk") a.talk() else 1f, Offset(nx, ny)) {
        drawPath(Path().apply { moveTo(nx - S * .05f, ny); lineTo(nx + S * .05f, ny); lineTo(nx, ny + S * .09f); close() }, Color(0xFFE8A23A))
    }
    // Vingene (venstre vifter når den er glad eller snakker).
    val ww = S * .16f; val wh = S * .3f
    rotate(if (mood == "glad" || mood == "talk") a.wave(1.4f) else 0f, Offset(S * .02f + ww * .9f, S * .5f + wh * .1f)) {
        drawPath(pctRR35(S * .02f, S * .5f, ww, wh, .6f, .2f, .6f, .6f), br)
    }
    drawPath(pctRR35(S - S * .02f - ww, S * .5f, ww, wh, .2f, .6f, .6f, .6f), br)
    zz35(S, mood, Color(0xFF7A5AD6), a)
}

private fun DrawScope.drawGris35(S: Float, mood: String, a: Anim35, tm: TextMeasurer?) {
    val pk = Color(0xFFF6B3C1); val pd = Color(0xFFE98AA0)
    // Ører.
    run { val x = S * .12f; val y = S * .12f; val d = S * .22f; rotate(-20f, Offset(x + d / 2, y + d / 2)) { drawPath(pctRR35(x, y, d, d, .2f, .8f, .3f, .7f), pd) } }
    run { val d = S * .22f; val x = S - S * .12f - d; val y = S * .12f; rotate(20f, Offset(x + d / 2, y + d / 2)) { drawPath(pctRR35(x, y, d, d, .8f, .2f, .7f, .3f), pd) } }
    // Krøllete hale (vifter fort når den er glad), origin 0 50 %.
    run {
        val d = S * .16f; val x = S + S * .04f - d; val y = S * .5f; val st = S * .03f
        val deg = if (mood == "glad") a.wave(.6f) else a.leaf(2.4f)
        rotate(deg, Offset(x, y + d / 2)) { drawArc(pd, 225f, 180f, false, Offset(x + st / 2, y + st / 2), Size(d - st, d - st), style = Stroke(st, cap = StrokeCap.Round)) }
    }
    // Kroppen.
    val bx = S * .06f; val by = S * .2f; val bw = S * .88f; val bh = S * .78f
    val body = pctRR35(bx, by, bw, bh, floatArrayOf(.5f, .5f, .46f, .46f), floatArrayOf(.54f, .54f, .46f, .46f))
    drawPath(body, cssLin35(180f, bx, by, bw, bh, pk, pd))
    inset35(body, 0f, -S * .06f, rgba(160, 60, 90, .18f))
    // Sparebøsse-spalten.
    drawRoundRect(rgba(120, 40, 60, .35f), Offset(S * .42f, S * .2f), Size(S * .16f, S * .03f), CornerRadius(S * .02f, S * .02f))
    // Øyne og kinn (ingen munn: trynet er munnen).
    face35(S * .14f, S * .28f, S * .72f, S * .6f, S * .72f, mood, Color(0xFF4A1A28), rgba(233, 90, 120, .45f), FaceO35(ey = .26f, my = .78f, cy = .48f, cx = .04f), a, mouth = false)
    // Trynet med nesebor (beveger seg når den snakker).
    val sx = S * .34f; val sy = S * .56f; val sw = S * .32f; val sh = S * .22f
    scale(1f, if (mood == "talk") a.talk() else 1f, Offset(sx + sw / 2, sy + sh / 2)) {
        val snout = Path().apply { addOval(Rect(sx, sy, sx + sw, sy + sh)) }
        drawPath(snout, Color(0xFFF39AAE))
        inset35(snout, 0f, -S * .02f, rgba(160, 60, 90, .2f))
        drawOval(Color(0xFFA8475F), Offset(sx + sw * .26f, sy + sh * .36f), Size(sw * .14f, sh * .3f))
        drawOval(Color(0xFFA8475F), Offset(sx + sw - sw * .26f - sw * .14f, sy + sh * .36f), Size(sw * .14f, sh * .3f))
    }
    // Bein.
    drawPath(pctRR35(S * .22f, S * .92f, S * .14f, S * .1f, 0f, 0f, .4f, .4f), pd)
    drawPath(pctRR35(S - S * .22f - S * .14f, S * .92f, S * .14f, S * .1f, 0f, 0f, .4f, .4f), pd)
    // Glad: «kr»-mynt som glitrer.
    if (mood == "glad") {
        val v = a.tw(1.2f, 0f)
        val d = S * .18f; val x = -S * .06f; val y = S * .06f
        translate(x, y) {
            scale(.6f + .5f * v, .6f + .5f * v, Offset(d / 2, d / 2)) {
                val coin = Path().apply { addOval(Rect(0f, 0f, d, d)) }
                drawPath(coin, Color(0xFFF2C14E), alpha = .25f + .75f * v)
                inset35(coin, 0f, -S * .02f, Color(0xFFC99A2E).copy(alpha = .25f + .75f * v))
                if (tm != null) {
                    val lay = tm.measure("kr", TextStyle(color = Color(0xFF8A6A1A), fontSize = (S * .08f / density / fontScale).sp, fontWeight = FontWeight.ExtraBold))
                    drawText(lay, topLeft = Offset(d / 2 - lay.size.width / 2f, d / 2 - lay.size.height / 2f), alpha = .25f + .75f * v)
                }
            }
        }
    }
    zz35(S, mood, pd, a)
}
