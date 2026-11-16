package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
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
import androidx.compose.ui.graphics.TransformOrigin
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.loadCharAdmin52
import no.kristo.finanshub.setCharDefault52

/* ======================= Glimt i prestedrakt ======================= */

private fun DrawScope.path38(d: String, vw: Float, vh: Float, fill: Color?, stroke: Color? = null, sw: Float = 1.5f) {
    scale(size.width / vw, size.height / vh, pivot = Offset.Zero) {
        val path = wxPath(d)
        if (fill != null) drawPath(path, fill)
        if (stroke != null) drawPath(path, stroke, style = Stroke(sw, cap = StrokeCap.Round))
    }
}

/**
 * Glimt i lys kjortel med rød stola og brunt belte, en liten bibel med gyllent ✝ og en pulserende gylden glorie (Bibelvers.dc.html → priest()).
 * Dupper rolig (3 s). Reduser bevegelse: ingen dupping og fast glorie.
 */
@Composable
internal fun PriestFig38(S: Dp, mood: String = "idle", modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    val inf = rememberInfiniteTransition(label = "prest38")
    val bob = inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1500, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "bob")
    val halo = inf.animateFloat(.55f, 1f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "halo")
    Box(modifier.size(S * 1.32f, S * 1.6f).graphicsLayer { translationY = if (reduce) 0f else -S.toPx() * .04f * bob.value }.semantics38("Glimt i prestedrakt")) {
        val ox = S * .16f
        val oy = S * .22f
        // Glorie.
        Canvas(Modifier.offset(ox + S * .11f, oy - S * .2f).size(S * .78f, S * .22f)) {
            val a = if (reduce) 1f else halo.value
            val w = S.toPx() * .05f
            drawOval(Color(0xFFF2C14E).copy(alpha = .35f * a), style = Stroke(w * 3f))
            drawOval(Color(0xFFF2C14E).copy(alpha = .6f + .4f * a), style = Stroke(w))
        }
        Box(Modifier.offset(ox, oy)) { GlimtFig35("glimt", S, mood, still = reduce) }
        // Kjortel med stola og belte.
        Canvas(Modifier.offset(ox + S * .5f - S * .58f, oy + S * .72f).size(S * 1.16f, S * .62f)) {
            path38("M18 8 Q58 22 98 8 L110 58 Q58 66 6 58 Z", 116f, 62f, Color(0xFFF6F1E7), Color(0xFFC9BFA9), 1.6f)
            path38("M44 12 L40 60 L50 60 L54 16 Z", 116f, 62f, RED38)
            path38("M72 12 L76 60 L66 60 L62 16 Z", 116f, 62f, RED38)
            path38("M42 34 h8 M66 34 h8", 116f, 62f, null, Color(0xFFF2C14E), 2f)
            path38("M24 40 Q58 48 92 40", 116f, 62f, null, Color(0xFFA8661A), 3f)
        }
        // Bibelen med ✝.
        Box(Modifier.offset(ox + S * .8f, oy + S * .92f).size(S * .36f, S * .28f).graphicsLayer { rotationZ = -10f }.clip(RoundedCornerShape(3.dp))
            .background(Color(0xFF3B2A1A)).border(2.dp, Color(0xFF6B4A2A), RoundedCornerShape(3.dp)), contentAlignment = Alignment.Center) {
            Text("✝", color = Color(0xFFF2C14E), fontWeight = FontWeight.ExtraBold, fontSize = (S.value * .16f).sp, lineHeight = (S.value * .18f).sp)
        }
    }
}

private fun Modifier.semantics38(label: String): Modifier = this.semantics { contentDescription = label }

/* ======================= Glimt-figur per bruker (admin) ======================= */

/** Innstillinger → Glimt (admin): standardfiguren per bruker, f.eks. Blekksprut. Gjelder til brukeren velger selv. */
@Composable
internal fun CharAdmin52(vm: AppViewModel) {
    if (!vm.userIsAdmin) return
    val p = PaperPal.current
    val s = vm.p52b
    LaunchedEffect(s.charAdminOpen) { if (s.charAdminOpen && s.charAdmin == null) vm.loadCharAdmin52() }
    PCard {
        Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { s.charAdminOpen = !s.charAdminOpen }.padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Standardfigur per bruker", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                Text("Figuren brukeren ser til hen velger selv", color = p.mut, fontSize = 12.5.sp)
            }
            Text(if (s.charAdminOpen) "▴" else "▾", color = p.mut, fontSize = 14.sp)
        }
        if (s.charAdminOpen) {
            val l = s.charAdmin
            if (l == null) Text("Henter brukerne …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp, 0.dp, 16.dp, 14.dp))
            else l.forEach { u ->
                Column(Modifier.fillMaxWidth().padding(16.dp, 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(u.name + if (u.source == "user") " · har valgt ${Fig35.name(u.char)}" else "", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (listOf<String?>(null) + Fig35.IDS).forEach { id ->
                            val on = u.default == id
                            Box(Modifier.height(32.dp).clip(CircleShape).background(if (on) p.ink else p.bg).clickable(role = Role.RadioButton) { vm.setCharDefault52(u.id, id) }.padding(horizontal = 12.dp),
                                contentAlignment = Alignment.Center) { Text(id?.let { Fig35.name(it) } ?: "Ingen", color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
                        }
                    }
                }
            }
        }
    }
}

object Fig35 {
    val IDS = listOf("glimt", "halo", "boble", "antenne", "bane", "pastell", "natt", "sky", "drape", "ugle", "stjerne", "spire", "gris", "blekk") // prompt 52: Blekksprut (ui/GlimtBlekksprut.kt)
    private val NAMES = mapOf(
        "glimt" to "Glimt", "halo" to "Halo", "boble" to "Boble", "antenne" to "Antenne", "bane" to "Bane", "pastell" to "Pastell", "natt" to "Natt",
        "sky" to "Sky", "drape" to "Dråpe", "ugle" to "Ugle", "stjerne" to "Stjerne", "spire" to "Spire", "gris" to "Gris", "blekk" to "Blekksprut",
    )
    /** Navnet i boblen (GLIMT / SKY / DRÅPE …) og fargen på det. */
    private val WHO = mapOf("gris" to "GRIS", "glimt" to "GLIMT", "natt" to "GLIMT", "sky" to "SKY", "drape" to "DRÅPE", "ugle" to "UGLE", "stjerne" to "STJERNE", "spire" to "SPIRE",
        "halo" to "GLIMT", "boble" to "GLIMT", "antenne" to "GLIMT", "bane" to "GLIMT", "pastell" to "GLIMT", "blekk" to "BLEKKSPRUT")
    private val WHO_C = mapOf("gris" to 0xFFF6B3C1, "glimt" to 0xFFFFC7B8, "natt" to 0xFFFFE7A8, "sky" to 0xFFBCD7EF, "drape" to 0xFF9FD0F2, "ugle" to 0xFFE8C49A,
        "stjerne" to 0xFFFFB38A, "spire" to 0xFF9FD8A8, "halo" to 0xFFFFC7B8, "boble" to 0xFFFFC7B8, "antenne" to 0xFFFFC7B8, "bane" to 0xFFFFC7B8, "pastell" to 0xFFF4A6A0, "blekk" to 0xFFF1A3AD)
    fun name(id: String): String = NAMES[id] ?: "Glimt"
    fun who(id: String): String = WHO[id] ?: "GLIMT"
    fun whoColor(id: String): Color = Color(WHO_C[id] ?: 0xFFFFC7B8)
    /** Høyden i forhold til bredden (wrap(S, mood, kids, h) i fasiten). */
    fun h(id: String): Float = when (id) { "drape", "spire" -> 1f; "ugle", "gris", "blekk" -> 1.04f; else -> 1.1f }
    fun norm(id: String?): String = id?.trim()?.lowercase()?.takeIf { it in IDS } ?: "glimt"
    fun mood(m: String?): String = when (m?.lowercase()) { "glad", "happy", "wave", "done" -> "glad"; "talk", "snakker", "point", "speak" -> "talk"; "sov", "sover", "sleep", "night" -> "sov"; else -> "idle" }
}

/** Figuren i appen. size = bredden (høyden er Fig35.h(id) × size). still = stillbilde (f.eks. i lister). */
@Composable
internal fun GlimtFig35(id: String, size: Dp, mood: String = "idle", modifier: Modifier = Modifier, still: Boolean = false, noJul: Boolean = false) {
    val reduce = reduceMotion31() || still
    if (id == "blekk") Blekk52.ensure(androidx.compose.ui.platform.LocalContext.current) // prompt 52: kroppen fra ressursene
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
            // Prompt 52 (AND52B): Blekksprut – bildet uten ansikt + ansikt per humør (ui/GlimtBlekksprut.kt), zz når den sover.
            "blekk" -> { drawBlekk52(S, mood, t, anim); zz35(S, mood, Color(0xFFB3303F), a) }
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
        // Prompt 41: tilbehøret plasseres med ankerpunkter per figur (glimt-figurer.js → dress(…, id)), f.eks. Sky og Spire.
        if (!noJul) no.kristo.finanshub.Jul40.phase?.let { drawJul40(S, S * hf, it, t, anim, id) }
            ?: run { if (no.kristo.finanshub.Mai41.on) drawMai41(S, S * hf, t, anim, id) } // Prompt 41: sløyfe + flagg 14.–17. mai
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

/* ---------------- Tegning (SVG-mål fra fasiten) ---------------- */

/** Tegner SVG-stien d (i viewBox vw × vh) skalert til flaten. */
private fun DrawScope.svg36(d: String, vw: Float, vh: Float, fill: Color?, stroke: Color? = null, sw: Float = 1.5f, checker: Boolean = false, alpha: Float = 1f) {
    val kx = size.width / vw
    val ky = size.height / vh
    scale(kx, ky, pivot = Offset.Zero) {
        val path = wxPath(d)
        if (checker) clipPath(path) {
            // pattern shChkM: 8 × 8, #8a6a45 med lyse loddrette og mørke vannrette striper.
            drawRect(Color(0xFF8A6A45), Offset.Zero, Size(vw, vh))
            var x = 0f
            while (x < vw) { drawRect(Color(0xFFA5825A).copy(alpha = .8f), Offset(x, 0f), Size(4f, vh)); x += 8f }
            var y = 0f
            while (y < vh) { drawRect(Color(0xFF6F5333).copy(alpha = .55f), Offset(0f, y), Size(vw, 4f)); y += 8f }
        } else if (fill != null) drawPath(path, fill, alpha = alpha)
        if (stroke != null) drawPath(path, stroke, style = Stroke(sw, cap = StrokeCap.Round), alpha = alpha)
    }
}

private val INK36 = Color(0xFF4E3920)

@Composable
private fun SherHat36(S: Dp, mod: Modifier) = Canvas(mod.size(S * 1.05f, S * .62f)) {
    svg36("M6 44 Q2 52 14 50 L30 44 Z", 100f, 60f, null, INK36, 1.5f, checker = true)
    svg36("M94 44 Q98 52 86 50 L70 44 Z", 100f, 60f, null, INK36, 1.5f, checker = true)
    svg36("M14 46 Q14 10 50 8 Q86 10 86 46 Z", 100f, 60f, null, INK36, 1.6f, checker = true)
    svg36("M50 8 L50 46", 100f, 60f, null, INK36.copy(alpha = .5f), 1f)
    svg36("M22 40 Q12 52 20 58 Q26 52 28 42 Z", 100f, 60f, null, INK36, 1.3f, checker = true)
    svg36("M78 40 Q88 52 80 58 Q74 52 72 42 Z", 100f, 60f, null, INK36, 1.3f, checker = true)
    svg36("M43 6 Q50 0 57 6 Q50 9 43 6 Z", 100f, 60f, Color(0xFF6F5333), INK36, 1.2f)
}

@Composable
private fun SherCape36(S: Dp, mod: Modifier) = Canvas(mod.size(S * 1.2f, S * .5f)) {
    svg36("M14 4 Q60 22 106 4 L114 40 Q60 52 6 40 Z", 120f, 50f, null, INK36, 1.6f, checker = true)
}

@Composable
private fun SherGlass36(S: Dp, mod: Modifier) = Canvas(mod.size(S * .7f)) {
    svg36("M6 44 L20 30", 50f, 50f, null, Color(0xFF5B3D1E), 6f)
    svg36("M15 20 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0", 50f, 50f, Color(0x59BEE6FF), Color(0xFFC8A24A), 4f)
    svg36("M22 13 Q26 9 31 9", 50f, 50f, null, Color.White.copy(alpha = .85f), 2.4f)
}

@Composable
private fun CarpHat36(S: Dp, mod: Modifier) = Canvas(mod.size(S * .95f, S * .5f)) {
    svg36("M14 40 Q14 6 50 4 Q86 6 86 40 Z", 100f, 52f, Color(0xFFF2C14E), Color(0xFFB8860B), 2f)
    svg36("M50 4 L50 40", 100f, 52f, null, Color(0xFFD9A520), 6f)
    svg36("M6.5 38 H93.5 A4.5 4.5 0 0 1 93.5 47 H6.5 A4.5 4.5 0 0 1 6.5 38 Z", 100f, 52f, Color(0xFFE0AD2C), Color(0xFFB8860B), 2f)
    svg36("M26 16 Q34 10 42 9", 100f, 52f, null, Color.White.copy(alpha = .7f), 3f)
}

@Composable
private fun CarpBelt36(S: Dp, mod: Modifier) = Canvas(mod.size(S * 1.02f, S * .34f)) {
    svg36("M8 2 H92 A4 4 0 0 1 92 11 H8 A4 4 0 0 1 8 2 Z", 100f, 34f, Color(0xFF8A5A2B), Color(0xFF5B3A1A), 1.5f)
    svg36("M44 1 H56 V12 H44 Z", 100f, 34f, null, Color(0xFFC8A24A), 2f)
    svg36("M12 10 h20 v16 q-10 6 -20 0 z", 100f, 34f, Color(0xFFA06A33), Color(0xFF5B3A1A), 1.5f)
    svg36("M68 10 h18 v13 q-9 5 -18 0 z", 100f, 34f, Color(0xFFA06A33), Color(0xFF5B3A1A), 1.5f)
    svg36("M20 0 H23 V12 H20 Z", 100f, 34f, Color(0xFF6B6B6B))
    svg36("M76 -6 H80 V10 H76 Z", 100f, 34f, Color(0xFFB23A2A))
}

@Composable
private fun CarpHammer36(S: Dp, mod: Modifier) = Canvas(mod.size(S * .7f)) {
    rotate(-35f, Offset(11f * size.width / 50f, 45f * size.height / 50f)) {
        svg36("M11 14 H12 A3 3 0 0 1 15 17 V45 A3 3 0 0 1 12 48 H11 A3 3 0 0 1 8 45 V17 A3 3 0 0 1 11 14 Z", 50f, 50f, Color(0xFFA06A33), Color(0xFF5B3A1A), 1.4f)
        svg36("M14 4 h22 v10 h-22 z", 50f, 50f, Color(0xFF9AA3AD), Color(0xFF4C535B), 1.6f)
        svg36("M36 4 q8 4 4 10 h-4 z", 50f, 50f, Color(0xFF7D858E))
    }
}

/* ---------------- Klokke ---------------- */

/** Prompt 71: klokka som State – leses i graphicsLayer/offset-lambdaene (lag-/layoutfasen), ikke i komposisjonen. */
@Composable
private fun clock36(on: Boolean): State<Float> {
    val t = remember { mutableFloatStateOf(0f) }
    if (on) LaunchedEffect(Unit) {
        val t0 = withFrameNanos { it }
        while (true) withFrameNanos { n -> t.floatValue = (n - t0) / 1_000_000_000f }
    }
    return t
}

private fun lerp36(a: Float, b: Float, f: Float) = a + (b - a) * f

private fun ease36(x: Float): Float = (0.5 - 0.5 * cos(PI * x.coerceIn(0f, 1f))).toFloat()

/** Nøkkelbilder: andel → verdi, lineært med myk overgang. */
private fun kf36(p: Float, stops: FloatArray, vals: FloatArray): Float {
    if (p <= stops.first()) return vals.first()
    for (i in 1 until stops.size) if (p <= stops[i]) return lerp36(vals[i - 1], vals[i], ease36((p - stops[i - 1]) / (stops[i] - stops[i - 1])))
    return vals.last()
}

/* ======================= Sherlock ======================= */

private val SH_ST = floatArrayOf(0f, .12f, .30f, .40f, .54f, .68f, .80f, .90f, 1f)

private val SH_X = floatArrayOf(200f, 140f, 0f, -20f, -110f, -60f, -10f, -10f, 220f)

private val SH_Y = floatArrayOf(-220f, -150f, 0f, 8f, -6f, 16f, 0f, 0f, -240f)

private val SH_R = floatArrayOf(-28f, -20f, 8f, -4f, -8f, 5f, 0f, 0f, 24f)

private val SH_S = floatArrayOf(.45f, .6f, 1f, 1f, 1f, 1f, 1f, 1f, .45f)

private val SH_A = floatArrayOf(0f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f)

/**
 * Glimt som Sherlock Holmes i hero-kortet (legges i en Box over kortet, øvre høyre del). Leter så lenge [searching] er true
 * (sløyfe mellom 30 % og 68 % av banen), viser boblen og flyr ut. Kalles bare mens vm.p36.sherOn.
 */
@Composable
internal fun Sherlock36(vm: AppViewModel, modifier: Modifier = Modifier) {
    val s = vm.p36
    val reduce = reduceMotion31()
    val seq = s.sherSeq
    val S = 52.dp
    val tlS = remember(seq) { mutableFloatStateOf(0f) }
    var tl by tlS
    val searching = vm.p31.checking
    LaunchedEffect(seq) {
        val total = 3600L
        val start = System.nanoTime()
        var t0 = start
        while (true) {
            withFrameNanos { }
            var ms = (System.nanoTime() - t0) / 1_000_000L
            val real = (System.nanoTime() - start) / 1_000_000L
            // Leter videre (30–80 %, samme posisjon i begge ender) så lenge serveren sjekker (høyst 40 s).
            if (ms > (total * .80).toLong() && vm.p31.checking && real < 40_000L) {
                t0 = System.nanoTime() - (total * .30).toLong() * 1_000_000L
                ms = (total * .30).toLong()
            }
            tl = (ms.toFloat() / total).coerceIn(0f, 1f)
            if (ms >= total) break
        }
        Haptics.select(); Haptics.select()
        s.sherOn = false
    }
    // Prompt 71: klokka og banen (tl) leses bare i lambdaene under (graphicsLayer/offset), så Sherlock bygges ikke på nytt hvert bilde.
    // Komposisjonen trenger bare å vite om boblen synes (derivedStateOf).
    val clock = clock36(!reduce)
    val fresh = vm.p30.upd.phase == "none" || (!vm.p30.upd.available && vm.p30.upd.phase != "avail")
    val searchNow by rememberUpdatedState(searching)
    val bubbleA: () -> Float = { if (searchNow) 0f else kf36(tlS.floatValue, floatArrayOf(0f, .68f, .74f, .92f, 1f), floatArrayOf(0f, 0f, 1f, 1f, 0f)) }
    val bubbleOn by remember(seq) { derivedStateOf { bubbleA() > 0f } }
    val bob: () -> Float = { if (reduce) 0f else (sin(clock.value * PI.toFloat() * 2f / .9f) * .5f + .5f) * -6f }
    val scan: () -> Float = { if (reduce) 0f else kf36(((clock.value % 1.1f) / 1.1f), floatArrayOf(0f, .5f, 1f), floatArrayOf(-24f, 18f, -24f)) }
    Box(modifier.padding(top = 70.dp, end = 62.dp).wrapContentSize(unbounded = true)) {
        Box(
            Modifier.size(S * 2.6f, S * 2f).graphicsLayer {
                val p = tlS.floatValue
                if (reduce) { alpha = SH_A.let { kf36(p, SH_ST, it) } } else {
                    translationX = kf36(p, SH_ST, SH_X) * density
                    translationY = kf36(p, SH_ST, SH_Y) * density
                    rotationZ = kf36(p, SH_ST, SH_R)
                    val sc = kf36(p, SH_ST, SH_S); scaleX = sc; scaleY = sc
                    alpha = kf36(p, SH_ST, SH_A)
                }
            },
        ) {
            // Figuren står i (ox, oy) i en flate som også har plass til luen, glasset og boblen.
            val ox = S * .9f
            val oy = S * .45f
            Box(Modifier.offset { IntOffset(0, bob().dp.roundToPx()) }) {
                SherCape36(S, Modifier.offset(ox - S * .1f, oy + S * 1.1f - S * .38f))
                GlimtFig35(hostChar35(vm.p35.set.char), S, "talk", Modifier.offset(ox, oy))
                SherHat36(S, Modifier.offset(ox - S * .025f, oy - S * .36f))
                SherGlass36(S, Modifier.offset(ox + S * .92f, oy + S * .28f).graphicsLayer { rotationZ = scan(); transformOrigin = TransformOrigin(.15f, .85f) })
            }
        }
        if (bubbleOn) Box(
            Modifier.offset((-150).dp + (-10).dp, (-8).dp).graphicsLayer { val a = bubbleA(); alpha = a; translationY = (1f - a) * 6f * density }
                .widthIn(max = 220.dp).shadow(10.dp, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(Color.White).padding(12.dp, 8.dp),
        ) {
            Text(if (fresh) "Elementært! Du har siste versjon." else "Aha! Jeg fant Nordlys ${vm.p30.upd.latest.ifBlank { "en ny versjon" }}.",
                color = Color(0xFF1B1A17), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
    }
}

/* ======================= Snekker ======================= */

/**
 * Glimt som snekker oppå fremdriftslinja (legg rett over linja; høyden er figuren + luft). left = pct, avgrenset til kortet.
 * dark = mørk bakgrunn (hero-kortet).
 */
@Composable
internal fun Carp36(vm: AppViewModel, pct: Int, S: Dp = 30.dp, modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    val clock = clock36(!reduce)
    val f by animateFloatAsState(pct.coerceIn(0, 100) / 100f, tween(400), label = "carp36")
    // Lett haptikk hvert 25 % (ikke for hvert slag).
    LaunchedEffect(pct / 25) { if (pct in 1..99) Haptics.select() }
    // Prompt 71: slaget (cyc/ham/dip) leses i graphicsLayer/offset-lambdaene; komposisjonen vet bare om sponet synes.
    val cyc: () -> Float = { if (reduce) 0f else (clock.value % .62f) / .62f }
    val ham: () -> Float = { if (reduce) -20f else kf36(cyc(), floatArrayOf(0f, .55f, .82f, 1f), floatArrayOf(-55f, -55f, 18f, -55f)) }
    val dip: () -> Float = { if (reduce) 0f else kf36(cyc(), floatArrayOf(0f, .7f, .82f, 1f), floatArrayOf(0f, 0f, 1f, 0f)) }
    val chips by remember(reduce) { derivedStateOf { !reduce && cyc() > .78f } }
    BoxWithConstraints(modifier.fillMaxWidth().height(S * 1.1f + 6.dp)) {
        val w = maxWidth
        val left = (w * f).coerceIn(S * .6f, w - S * 1.1f) - S * .5f
        Box(Modifier.offset(left, 6.dp).size(S, S * 1.1f).graphicsLayer { val d = dip(); translationY = d * 1.5f * density; scaleY = 1f - d * .03f; transformOrigin = TransformOrigin(.5f, 1f) }) {
            GlimtFig35(hostChar35(vm.p35.set.char), S, "idle", still = reduce)
            CarpBelt36(S, Modifier.offset(-S * .01f, S * 1.1f - S * .1f - S * .34f))
            CarpHat36(S, Modifier.offset(S * .025f, -S * .24f))
            CarpHammer36(S, Modifier.offset(S * .8f, S * .1f).graphicsLayer { rotationZ = ham(); transformOrigin = TransformOrigin(.2f, .9f) })
            // Spon fra treffpunktet.
            if (chips) for (i in 0..2) {
                val q: () -> Float = { ((cyc() - .78f) / .22f).coerceIn(0f, 1f) }
                Box(Modifier.offset { IntOffset((S * (1.4f + i * .05f) + ((8 + i * 7) * q()).dp).roundToPx(), (S * 1.1f - 3.dp + ((-10 - i * 5) * q()).dp).roundToPx()) }.size(4.dp, 3.dp)
                    .graphicsLayer { val k = q(); alpha = 1f - k; rotationZ = 160f * k }.background(if (i == 1) Color(0xFFF2C14E) else Color(0xFFC8925A), RoundedCornerShape(1.dp)))
            }
        }
    }
}

/* ======================= TIDLIGERE VERSJONER ======================= */

@Composable
internal fun NordHist36(vm: AppViewModel, before: String) {
    val p = PaperPal.current
    val s = vm.p36
    LaunchedEffect(before) { if (before.isNotBlank()) vm.loadHist36(before) }
    if (s.histMissing) return
    if (s.hist.isEmpty() && !s.histBusy) return
    Column(Modifier.fillMaxWidth().padding(top = 18.dp)) {
        Text("TIDLIGERE VERSJONER", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.5.sp,
            modifier = Modifier.padding(bottom = 8.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        if (s.hist.isEmpty()) Text("Henter …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(vertical = 14.dp))
        s.hist.forEach { v ->
            val open = s.histOpen == v.version
            val rot by animateFloatAsState(if (open) 90f else 0f, tween(200), label = "hist36")
            Column {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button) { Haptics.select(); s.histOpen = if (open) null else v.version }.padding(vertical = 10.dp, horizontal = 2.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Nordlys ${v.version}", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
                    val sub = listOfNotNull(relDate36(v.date).takeIf { it.isNotBlank() }, "${v.notes.size} ${if (v.notes.size == 1) "endring" else "endringer"}").joinToString(" · ")
                    Text(sub, color = p.mut, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (v.failed) Text("Feilet", color = Color(0xFFB23A2A), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    Box(Modifier.graphicsLayer { rotationZ = rot }) { WxIcon("M9 6l6 6-6 6", p.ink, 14.dp, stroke = 2.4f) } // prompt 71
                }
                AnimatedVisibility(open, enter = expandVertically(tween(200)) + fadeIn(tween(200)), exit = shrinkVertically(tween(160)) + fadeOut(tween(120))) {
                    Column(Modifier.padding(start = 2.dp, end = 2.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        installed36(v.installedAt)?.let { Text(it, color = Color(0xFF2F7D4F), fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold) }
                        if (v.failed) Text("Oppdateringen feilet · se loggen under Installert", color = Color(0xFFB23A2A), fontSize = 12.5.sp)
                        v.notes.ifEmpty { listOf("Feilrettinger og forbedringer.") }.forEach { n ->
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("•", color = p.lab, fontSize = 14.sp)
                                Text(n, color = p.ink, fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 21.sp)
                            }
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            }
        }
        if (s.histMore) Box(
            Modifier.padding(top = 10.dp).height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
                .clickable(enabled = !s.histBusy, role = Role.Button) { vm.loadHist36(before, more = true) }.padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) { Text(if (s.histBusy) "Henter …" else "Vis flere", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
    }
}

/* ======================= «Starter opp» ======================= */

private val LINES36 = listOf(
    "Serveren starter på nytt etter oppdateringen. Glimt sover litt …", "Glimt våkner og sjekker at alt er på plass.",
    "Nesten klar. Glimt varmer opp modellene.", "Alt kjører! Laster inn Homelab …",
)

/** Viser «Starter opp» mens oppdateringen starter tjenestene på nytt (eller kontakten er borte under oppdateringen). */
@Composable
internal fun StartGate36(vm: AppViewModel) {
    val u = vm.p30.upd
    val restarting = u.phase == "run" && (u.lost || u.stepText.startsWith("Starter tjenestene"))
    // Prompt 38 (flimrer inn og ut): tilstanden må stå i 1,2 s før siden vises, og den åpnes ikke igjen innen 60 s etter «Klar».
    LaunchedEffect(restarting) {
        if (restarting) { delay(1200); if (System.currentTimeMillis() - vm.p38.startClosedAt > 60_000L) vm.startScreen36() }
    }
    LaunchedEffect(u.phase) { if (u.phase != "run") vm.p36.startDismissed = false }
    var wasOn by remember { mutableStateOf(false) }
    LaunchedEffect(vm.p36.startOn) { if (wasOn && !vm.p36.startOn) vm.p38.startClosedAt = System.currentTimeMillis(); wasOn = vm.p36.startOn }
    // Toner inn (0,2 s) og ut (0,3 s), så det ikke blinker når appen kommer tilbake.
    AnimatedVisibility(vm.p36.startOn, enter = fadeIn(tween(200)), exit = fadeOut(tween(300))) { StartScreen36(vm) }
}

@Composable
internal fun StartScreen36(vm: AppViewModel) {
    val s = vm.p36
    BackHandler { vm.closeStart36(dismiss = true) }
    val reduce = reduceMotion31()
    val steps = s.startSteps
    val done = s.startReady
    val i = steps.indexOfFirst { it.status != "ok" }.let { if (it < 0) steps.size else it }
    val phase = when { done -> 3; i < 2 -> 0; i < 4 -> 1; else -> 2 }
    val mood = when (phase) { 0 -> "sov"; 3 -> "talk"; else -> "idle" }
    val pct = if (done) 100 else Math.round(steps.count { it.status == "ok" } * 100f / steps.size.coerceAtLeast(1))
    // Prompt 38 (flimring): animasjonene leses bare i tegne-/lagfasen (ikke i komposisjonen), så siden og figuren bygges ikke på nytt
    // hver frame; sekundtelleren ligger i bunnteksten alene og stopper når serveren er klar. Nordlyset beveger seg sakte (18 s).
    val inf = rememberInfiniteTransition(label = "start36")
    val aurS = inf.animateFloat(0f, 1f, infiniteRepeatable(tween(9000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "aur")
    val orbitS = inf.animateFloat(0f, 360f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "orb")
    val floatS = inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "flt")
    val zS = inf.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "z")
    val ring by animateFloatAsState(pct / 100f, tween(600), label = "ring36")
    val violet = Color(0xFF9864D6); val green = Color(0xFF2CBF8E); val warm = Color(0xFFD5493A)
    Box(
        Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF101A2E), Color(0xFF1B2340)), Offset.Zero, Offset(700f, 1500f)))
            .drawBehind {
                val w = size.width; val h = size.height
                val aur = aurS.value
                val dx = if (reduce) 0f else aur * w * .04f
                val dy = if (reduce) 0f else -aur * h * .03f
                drawRect(Brush.radialGradient(listOf(violet.copy(alpha = .7f), Color.Transparent), Offset(w * .8f + dx, h * .1f + dy), w * .8f))
                drawRect(Brush.radialGradient(listOf(green.copy(alpha = .6f), Color.Transparent), Offset(w * .15f + dx, h * .9f + dy), w * .8f))
                drawRect(Brush.radialGradient(listOf(warm.copy(alpha = .5f), Color.Transparent), Offset(w * .9f - dx, h * .9f - dy), w * .6f))
            }
            .clickable(remember { MutableInteractionSource() }, null) {},
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(20.dp, 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(26.dp),
        ) {
            Box(Modifier.size(208.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(208.dp)) {
                    val orbit = orbitS.value
                    val r = 92.dp.toPx()
                    val sw = 5.dp.toPx()
                    val tl = Offset(center.x - r, center.y - r)
                    drawCircle(Color.White.copy(alpha = .12f), r, style = Stroke(sw))
                    drawArc(Brush.linearGradient(listOf(Color(0xFF3FBF9A), Color(0xFFFFD9C2), Color(0xFFFF8A5C)), tl, Offset(center.x + r, center.y + r)),
                        -90f, 360f * ring, false, tl, Size(r * 2, r * 2), style = Stroke(sw, cap = StrokeCap.Round))
                    if (!reduce) listOf(0f to Color(0xFFFFD9C2), 120f to Color(0xFF3FBF9A), 240f to Color(0xFFA78BFA)).forEach { (a, c) ->
                        val ang = ((a + orbit) - 90f) * PI.toFloat() / 180f
                        val pnt = Offset(center.x + cos(ang) * 104.dp.toPx(), center.y + sin(ang) * 104.dp.toPx())
                        drawCircle(c.copy(alpha = .35f), 7.dp.toPx(), pnt)
                        drawCircle(c, 3.5.dp.toPx(), pnt)
                    }
                }
                Box(Modifier.graphicsLayer { translationY = if (reduce) 0f else -10f * floatS.value * density }) { GlimtFig35(hostChar35(vm.p35.set.char), 128.dp, mood) }
                if (phase == 0 && !reduce) for (k in 0..2) {
                    Text("z", color = Color(0xFFFFD9C2), fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = (14 + k * 4).sp,
                        modifier = Modifier.align(Alignment.TopEnd).padding(top = 30.dp, end = 28.dp)
                            .graphicsLayer { val q = ((zS.value + k / 3f) % 1f); alpha = if (q < .3f) q / .3f else 1f - (q - .3f) / .7f; translationX = 26f * q * density; translationY = -46f * q * density; scaleX = .6f + .6f * q; scaleY = .6f + .6f * q })
                }
                Box(Modifier.align(Alignment.BottomCenter).offset(y = 6.dp).clip(CircleShape).background(Color(0xCC101A2E)).border(1.dp, Color.White.copy(alpha = .18f), CircleShape)
                    .padding(horizontal = 10.dp, vertical = 3.dp)) {
                    Text("$pct %", color = Color.White, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (done) "KLAR" else "STARTER OPP", color = Color(0xFFFFD9C2), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.8.sp)
                val ver = s.startVer.split('.').take(2).joinToString(".").ifBlank { "" }
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(buildAnnotatedString { append("Nordlys"); withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = Color.White.copy(alpha = .75f))) { append("OS ") } },
                        color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 40.sp, lineHeight = 40.sp)
                    if (ver.isNotBlank()) Text(ver, style = TextStyle(brush = Brush.verticalGradient(0f to Color.White, .45f to Color(0xFFFFD9C2), 1f to Color(0xFFFF8A5C)),
                        fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 40.sp, lineHeight = 40.sp))
                }
                Text(LINES36[phase], color = Color.White.copy(alpha = .82f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 23.sp,
                    textAlign = TextAlign.Center, modifier = Modifier.heightIn(min = 46.dp))
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White.copy(alpha = .08f)).border(1.dp, Color.White.copy(alpha = .12f), RoundedCornerShape(20.dp))
                .padding(horizontal = 16.dp, vertical = 6.dp)) {
                steps.forEachIndexed { k, st ->
                    if (k > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .1f)))
                    val active = k == i && !done
                    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).graphicsLayer { alpha = if (k <= i || done) 1f else .45f },
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
                            when {
                                st.status == "ok" || done -> StepOk36(reduce)
                                active -> StepSpin36(reduce)
                                else -> Box(Modifier.size(8.dp).clip(CircleShape).background(Color.White.copy(alpha = .3f)))
                            }
                        }
                        Text(st.label, color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
                        val ms = st.ms
                        Text(when { (st.status == "ok" || done) && ms != null -> "%.1f s".format(java.util.Locale("nb", "NO"), ms / 1000.0); active -> "…"; else -> "" },
                            color = Color.White.copy(alpha = .6f), fontFamily = PaperFonts.mono, fontSize = 12.sp)
                    }
                }
            }
            StartFoot36(vm, done)
        }
    }
}

/** Bunnteksten med sekundtelleren (eneste del som oppdateres hvert sekund; stopper når serveren er klar). */
@Composable
private fun StartFoot36(vm: AppViewModel, done: Boolean) {
    val s = vm.p36
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(done) { while (!done) { delay(1000); now = System.currentTimeMillis() } }
    val el = ((now - s.startAt) / 1000).coerceAtLeast(0)
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(when { done -> "Laster inn appen …"; el > 180 -> "Det tar lengre tid enn vanlig · $el s"; else -> "Appen lastes inn automatisk når serveren svarer · $el s" },
                    color = Color.White.copy(alpha = .65f), fontFamily = PaperFonts.sans, fontSize = 13.sp, textAlign = TextAlign.Center)
                if (!done && el > 40) Text("Last inn på nytt nå", color = Color(0xFFFFD9C2), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { Haptics.tap(); vm.pollHealth36() }.padding(8.dp, 6.dp))
                if (!done && el > 180) Text("Vis logg", color = Color(0xFFFFD9C2), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { vm.closeStart36(dismiss = true); vm.openNordlys31() }.padding(8.dp, 6.dp))
            }
}

@Composable
private fun StepOk36(reduce: Boolean) {
    val sc = remember { androidx.compose.animation.core.Animatable(if (reduce) 1f else .4f) }
    LaunchedEffect(Unit) { if (!reduce) sc.animateTo(1f, androidx.compose.animation.core.keyframes { durationMillis = 350; .4f at 0; 1.15f at 245; 1f at 350 }) }
    Canvas(Modifier.size(20.dp).graphicsLayer { scaleX = sc.value; scaleY = sc.value }) {
        drawCircle(Color(0xFF2F7D4F), size.minDimension / 2 * (11f / 12f))
        svg36("M7 12.5l3.2 3.2L17 9", 24f, 24f, null, Color.White, 2.6f)
    }
}

@Composable
private fun StepSpin36(reduce: Boolean) {
    val inf = rememberInfiniteTransition(label = "spin36")
    val a by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(800, easing = LinearEasing)), label = "a")
    Canvas(Modifier.size(18.dp)) {
        val sw = 2.5.dp.toPx()
        drawCircle(Color.White.copy(alpha = .2f), size.minDimension / 2 - sw / 2, style = Stroke(sw))
        drawArc(Color(0xFFFFD9C2), if (reduce) -90f else a - 90f, 90f, false, Offset(sw / 2, sw / 2), Size(size.width - sw, size.height - sw), style = Stroke(sw, cap = StrokeCap.Round))
    }
}
