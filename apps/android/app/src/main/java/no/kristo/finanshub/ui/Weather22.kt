package no.kristo.finanshub.ui

import android.annotation.SuppressLint
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.zIndex
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import no.kristo.finanshub.*
import java.time.Duration
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/*
 * Værsiden, del 2 (prompt 22): animert bakgrunn, detaljarkene (Forhold og ett per kort), «Yr mot Pent», Steder og værkartet.
 */

private val sheetBg = Color(0xFF17191E)
private val sheetCard = Color(0xFF20232A)
private val sheetLine = Color(0xFF2A2D34)
private val mut = Color(0xFF9AA0AA)
private val mut2 = Color(0xFF9AA3AE)
private val sky = Color(0xFF5EC8F2)

/* ================= Animert værbakgrunn ================= */

private class FxParts(seed: Int) {
    private val r = Random(seed)
    private fun rnd(a: Float, b: Float) = a + r.nextFloat() * (b - a)
    // Stjerner, regn, snø og skyer i relative mål (x, y som andel av flaten). Fart i dp per bilde (60 fps), som i designet.
    val stars = List(420) { floatArrayOf(rnd(0f, 1f), rnd(0f, .75f), rnd(.4f, 1.5f), rnd(.3f, 1f), rnd(.5f, 2f), rnd(0f, 6.28f)) }
    val drops = List(220) { floatArrayOf(r.nextFloat(), rnd(-1f, 1f), rnd(10f, 22f), rnd(9f, 15f), rnd(.12f, .32f)) }
    val flakes = List(110) { floatArrayOf(r.nextFloat(), rnd(-1f, 1f), rnd(1f, 3.2f), rnd(.5f, 1.5f), rnd(0f, 6.28f)) }
    val clouds = List(9) { i -> floatArrayOf(rnd(-.2f, 1.1f), r.nextFloat(), rnd(.45f, .9f), rnd(.08f, .16f), rnd(.04f, .14f) * (if (i % 2 == 1) 1f else -.6f), r.nextFloat()) }
}

private fun wrap(v: Float, span: Float): Float = ((v % span) + span) % span

/**
 * Værbakgrunn etter værkode og dag/natt (WxFx i designet): stjerner, dempet sol med glorie, drivende skyer, regnstriper,
 * lyn, snø og tåke. Maks 30 fps, står stille ved «Fjern animasjoner» og når appen ikke er synlig.
 */
@Composable
internal fun WxFx(kind: String, heavy: Boolean, thunder: Boolean) {
    val ctx = LocalContext.current
    val reduce = remember { runCatching { android.provider.Settings.Global.getFloat(ctx.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false) }
    val parts = remember(kind) { FxParts(kind.hashCode()) }
    var t by remember { mutableFloatStateOf(0f) }
    var visible by remember { mutableStateOf(true) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _: androidx.lifecycle.LifecycleOwner, e: Lifecycle.Event ->
            if (e == Lifecycle.Event.ON_STOP) visible = false
            if (e == Lifecycle.Event.ON_START) visible = true
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    LaunchedEffect(kind, reduce, visible) {
        if (reduce || !visible) return@LaunchedEffect
        val t0 = withFrameNanos { it } - (t * 1e9f).toLong()
        var last = 0L
        while (true) withFrameNanos { n -> if (n - last >= 33_000_000L) { last = n; t = (n - t0) / 1e9f } }
    }
    val nC = when (kind) { "clouds", "rain", "snow", "fog" -> 9; "part", "partn" -> 4; else -> 0 }
    Canvas(Modifier.fillMaxSize()) {
        val d = density
        val W = size.width
        val H = size.height
        val f = t * 60f // bilder ved 60 fps
        if (kind == "stars" || kind == "partn") {
            val n = min(parts.stars.size, ((W / d) * (H / d) / 2600f).roundToInt())
            for (i in 0 until n) {
                val s = parts.stars[i]
                val tw = .55f + .45f * sin(t * s[4] + s[5])
                drawCircle(Color.White.copy(alpha = (s[3] * tw).coerceIn(0f, 1f)), s[2] * d, Offset(s[0] * W, s[1] * H))
            }
        }
        if (kind == "sun" || kind == "part") {
            val m = min(W, H)
            val cx = W * .72f
            val cy = -m * .02f
            val R = min(m * .95f, 560 * d)
            drawRect(Brush.radialGradient(
                0f to Color.White.copy(alpha = .9f), .07f to Color(255, 252, 236).copy(alpha = .6f), .22f to Color(255, 245, 220).copy(alpha = .14f),
                .55f to Color.White.copy(alpha = .025f), 1f to Color.Transparent, center = Offset(cx, cy), radius = R,
            ))
            val hr = m * .5f
            listOf(Color(255, 120, 120).copy(alpha = .045f) to 0f, Color(255, 230, 120).copy(alpha = .045f) to m * .03f, Color(120, 220, 255).copy(alpha = .05f) to m * .06f).forEach { (c, o) ->
                drawCircle(c, hr + o, Offset(cx, cy), style = Stroke(m * .03f))
            }
            val sh = sin(t * .4f) * .05f
            listOf(floatArrayOf(.2f, .06f), floatArrayOf(.3f, .035f), floatArrayOf(.38f, .05f)).forEach { (fy, fr) ->
                val x = cx + (W * .5f - cx) * (fy * 2.2f) + sh * W
                val y = cy + H * fy
                drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = .08f), Color.Transparent), center = Offset(x, y), radius = W * fr), W * fr, Offset(x, y))
            }
        }
        for (i in 0 until nC) {
            val c = parts.clouds[i]
            val cw = c[2] * W
            val ch = c[3] * H
            val y0 = (.02f + c[1] * ((if (kind == "part" || kind == "partn") .35f else .55f) - .02f)) * H
            val a = when (kind) { "fog" -> .18f + c[5] * .12f; "rain", "snow" -> .16f + c[5] * .14f; "part" -> .08f + c[5] * .08f; else -> .2f + c[5] * .14f }
            val span = W * 1.2f + cw * 1.1f
            val x0 = wrap(c[0] * W + cw + c[4] * d * f, span) - cw
            val col = when (kind) { "rain", "snow" -> Color(200, 210, 225); "partn" -> Color(150, 165, 195); else -> Color.White }
            for (j in 0 until 5) {
                val x = x0 + cw * (j / 4f)
                val y = y0 + sin(j * 1.7f) * ch * .35f
                val rr = ch * (1.1f + ((j * 37) % 5) / 6f)
                drawOval(Brush.radialGradient(listOf(col.copy(alpha = a), col.copy(alpha = 0f)), center = Offset(x, y), radius = rr * 1.6f),
                    Offset(x - rr * 1.9f, y - rr * 1.2f), Size(rr * 3.8f, rr * 2.4f))
            }
        }
        if (kind == "rain") {
            val n = if (heavy) 220 else 120
            for (i in 0 until n) {
                val p = parts.drops[i]
                val span = H + 60 * d
                val dist = p[1] * H + 60 * d + p[3] * d * f
                val cyc = floor(dist / span)
                val y = wrap(dist, span) - 60 * d
                val x = wrap(p[0] * (W + 40 * d) + cyc * 137 * d, W + 40 * d) - 40 * d + .12f * (y + 60 * d)
                val l = p[2] * d
                drawLine(Color(220, 230, 245).copy(alpha = p[4]), Offset(x, y), Offset(x + l * .12f, y + l), 1.1f * d, StrokeCap.Round)
            }
            if (thunder && sin(t * .7f) > .995f) drawRect(Color.White.copy(alpha = .25f))
        }
        if (kind == "snow") {
            for (p in parts.flakes) {
                val span = H + 5 * d
                val dist = p[1] * H + p[3] * d * f
                val y = wrap(dist, span) - 5 * d
                val x = wrap(p[0] * W + floor(dist / span) * 97 * d, W) + sin(t + p[4]) * 24 * d
                drawCircle(Color.White.copy(alpha = .85f), p[2] * d, Offset(x, y))
            }
        }
        if (kind == "fog") drawRect(Brush.verticalGradient(0f to Color(220, 225, 232).copy(alpha = 0f), 1f to Color(220, 225, 232).copy(alpha = .35f), startY = H * .2f, endY = H))
    }
}

/* ================= Arkene ================= */

/** Mørkt ark fra toppen (44 dp under statuslinja), dempet bakgrunn bak. Trykk utenfor lukker. */
@Composable
internal fun WxSheetShell(onClose: () -> Unit, z: Float = 20f, content: @Composable ColumnScope.() -> Unit) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Box(Modifier.fillMaxSize().zIndex(z).background(Color.Black.copy(alpha = .35f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose)) {
        Column(
            Modifier.fillMaxSize().padding(top = top + 12.dp).clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(sheetBg)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(16.dp, 14.dp, 16.dp, 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp), content = content,
        )
    }
}

@Composable
private fun SheetTitle(t: String, onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.width(44.dp))
        Text(t, fontSize = 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        Box(Modifier.width(44.dp), contentAlignment = Alignment.CenterEnd) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(sheetLine).clickable(onClick = onClose), contentAlignment = Alignment.Center) { Text("×", fontSize = 18.sp) }
        }
    }
}

/** 7- eller 8-dagersvelgeren: bokstav og dato i sirkel (#5ec8f2 når valgt). */
@Composable
private fun DayPicker(dates: List<String>, sel: Int, dim: Int = -1, pick: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth()) {
        dates.forEachIndexed { i, ds ->
            val d = wxLd(ds)
            val on = i == sel
            Column(Modifier.weight(1f).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { Haptics.select(); pick(i) },
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(d?.let(::wxWl) ?: "", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.alpha(.8f))
                Box(Modifier.size(38.dp).clip(CircleShape).background(if (on) sky else Color.Transparent), contentAlignment = Alignment.Center) {
                    Text("${d?.dayOfMonth ?: ""}", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = if (on) Color(0xFF0D2233) else if (i == dim) Color(0xFF7D828C) else Color.White)
                }
            }
        }
    }
}

private fun longDate(ds: String, year: Boolean): String = wxLd(ds)?.format(DateTimeFormatter.ofPattern(if (year) "EEEE d. MMMM yyyy" else "EEEE d. MMMM", wxNb))
    ?.replaceFirstChar { it.uppercase() } ?: ds

@Composable
private fun DateLine(t: String) {
    Column {
        Text(t, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(sheetLine))
    }
}

/** Linje gjennom verdiene (null = hull). */
private fun linePath(v: List<Double?>, x: (Int) -> Float, y: (Double) -> Float): Path {
    val p = Path()
    var pen = false
    v.forEachIndexed { i, a -> if (a == null) pen = false else { if (pen) p.lineTo(x(i), y(a)) else p.moveTo(x(i), y(a)); pen = true } }
    return p
}

/* ---------- «Forhold»: temperatur og sjanse for nedbør ---------- */

@Composable
internal fun ForholdSheet(w: WeatherFull, day: Int, setDay: (Int) -> Unit, close: () -> Unit) {
    val days = w.days.take(7)
    val d = days.getOrNull(day) ?: return
    var feel by remember { mutableStateOf(false) }
    val hrs = wxDayHours(w, d.date)
    val v: List<Double?> = hrs.map { h -> h?.let { if (feel) it.feels ?: it.temp else it.temp } }
    val nn = v.filterNotNull()
    val nowH = LocalDateTime.now().hour
    val today = day == 0
    val cut = if (today) nowH else 0
    val tm = rememberTextMeasurer()
    WxSheetShell(close) {
        SheetTitle("Forhold", close)
        DayPicker(days.map { it.date }, day) { setDay(it) }
        DateLine(longDate(d.date, true))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (today) wxR(w.current.temp) else wxR(d.hi), fontSize = 40.sp, fontWeight = FontWeight.Bold, lineHeight = 40.sp)
                    WxCodeIcon(wxKey(d.code, false), 34.dp)
                }
                Text("H:${wxR(d.hi)} L:${wxR(d.lo)}", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.alpha(.6f))
            }
            Text(wxDesc(d.code), fontSize = 13.sp, modifier = Modifier.alpha(.6f))
        }
        Column {
            Box(Modifier.fillMaxWidth().height(1.dp).background(sheetLine))
            if (nn.size < 4) Text("Timevarselet finnes ikke for denne dagen ennå.", fontSize = 14.sp, color = mut, modifier = Modifier.padding(vertical = 18.dp))
            else {
                // Ikon hver 2. time over grafen.
                Row(Modifier.fillMaxWidth().padding(top = 8.dp, end = 36.dp, bottom = 6.dp)) {
                    for (k in 0 until 12) Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        val h = hrs[k * 2]
                        if (h != null) WxCodeIcon(wxKey(h.code, !h.isDay), 20.dp)
                    }
                }
                val mn = nn.min(); val mx = nn.max()
                val ylo = floor((mn - 2) / 3) * 3; val yhi = ceil((mx + 2) / 3) * 3
                Canvas(Modifier.fillMaxWidth().aspectRatio(336f / 196f)) {
                    val k = size.width / 336f
                    val W = 300f; val HT = 170f
                    fun X(i: Int) = i / 23f * W * k
                    fun Y(t: Double) = ((HT - (t - ylo) / (yhi - ylo) * HT) * k).toFloat()
                    var g = ylo
                    while (g <= yhi + .01) {
                        drawLine(Color(0xFF2C3038), Offset(0f, Y(g)), Offset(W * k, Y(g)), k)
                        svgText(tm, "${g.roundToInt()}°", 306f, Y(g) / k + 4, k, 11f, mut)
                        g += 3
                    }
                    val first = v.indexOfFirst { it != null }; val last = v.indexOfLast { it != null }
                    val area = linePath(v, ::X, ::Y).apply { lineTo(X(last), HT * k); lineTo(X(first), HT * k); close() }
                    drawPath(area, Brush.verticalGradient(listOf(Color(0xFF5EC8D8).copy(alpha = .55f), Color(0xFF2B6EA8).copy(alpha = .35f)), startY = 0f, endY = HT * k))
                    if (cut > 0) drawPath(linePath(v.mapIndexed { i, x -> if (i <= cut) x else null }, ::X, ::Y), Color(0xFF5EC8D8),
                        style = Stroke(3 * k, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * k, 5 * k))))
                    drawPath(linePath(v.mapIndexed { i, x -> if (i >= cut) x else null }, ::X, ::Y), Color(0xFF5EC8D8), style = Stroke(3 * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    if (today) drawLine(mut, Offset(X(cut), 0f), Offset(X(cut), 170 * k), k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * k, 3 * k)))
                    listOf(v.indexOf(mx) to "H", v.indexOf(mn) to "L").forEach { (i, t) ->
                        if (i >= 0) {
                            drawCircle(sheetBg, 5.75f * k, Offset(X(i), Y(v[i]!!)))
                            drawCircle(Color.White, 3.25f * k, Offset(X(i), Y(v[i]!!)))
                            svgText(tm, t, X(i) / k, Y(v[i]!!) / k - 10, k, 12f, Color(0xFFC7CCD4), FontWeight.ExtraBold, 1)
                        }
                    }
                    listOf(0, 6, 12, 18).forEach { h -> svgText(tm, wxPad(h), X(h) / k + 2, 188f, k, 12f, mut) }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(sheetLine))
        }
        Row(Modifier.fillMaxWidth().clip(CircleShape).background(Color(0xFF24272E)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("Faktisk" to false, "Føles som" to true).forEach { (n, f) ->
                Box(Modifier.weight(1f).height(40.dp).clip(CircleShape).background(if (feel == f) Color(0xFF4A4E57) else Color.Transparent).clickable { feel = f }, contentAlignment = Alignment.Center) {
                    Text(n, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Text(if (feel) "Hvordan temperaturen føles med vind og fuktighet." else "Den faktiske temperaturen.", fontSize = 14.sp, modifier = Modifier.alpha(.65f).padding(horizontal = 6.dp))
        Column(Modifier.padding(top = 8.dp)) {
            Text("Sjanse for nedbør", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            val dp = d.precipProb ?: hrs.mapNotNull { it?.precipProb }.maxOrNull() ?: 0.0
            Text("Dagens sjanse: ${dp.roundToInt()} %", fontSize = 15.sp, modifier = Modifier.alpha(.6f))
        }
        Column {
            Box(Modifier.fillMaxWidth().height(1.dp).background(sheetLine))
            Canvas(Modifier.fillMaxWidth().aspectRatio(336f / 150f)) {
                val k = size.width / 336f
                fun X(i: Int) = i / 23f * 300f * k
                listOf(0, 25, 50, 75, 100).forEach { q ->
                    val y = 130f - q / 100f * 124f
                    drawLine(Color(0xFF2C3038), Offset(0f, y * k), Offset(300 * k, y * k), k)
                    svgText(tm, "$q %", 306f, y + 4, k, 11f, mut)
                }
                hrs.forEachIndexed { i, h ->
                    val q = (h?.precipProb ?: return@forEachIndexed).toFloat()
                    val bh = max(1f, q / 100f * 124f)
                    drawRoundRect(if (today && i < cut) Color(0xFF3A5D74) else sky, Offset(X(i) - 4.5f * k, (130f - bh) * k), Size(9 * k, bh * k), CornerRadius(2 * k))
                }
                listOf(0, 6, 12, 18).forEach { h -> svgText(tm, wxPad(h), X(h) / k + 2, 146f, k, 12f, mut) }
            }
        }
    }
}

/* ---------- Detaljark for hvert kort ---------- */

private class Metric(
    val t: String, val ty: String, val v: List<Double?> = emptyList(), val v2: List<Double?>? = null, val l2: String = "",
    val fmt: (Double) -> String = { it.roundToInt().toString() }, val c: ((Double) -> Color)? = null, val lvl: ((Double) -> String)? = null,
    val pp: List<Double?>? = null, val about: String, val scale: List<Triple<String, String, Color>>? = null,
    val min: Double? = null, val max: Double? = null, val maxF: Double? = null,
)

private fun uvColor(x: Double) = Color(if (x < 3) 0xFF6FDC8C else if (x < 6) 0xFFFFD34D else if (x < 8) 0xFFFF9A3D else if (x < 11) 0xFFF2555A else 0xFFB36BFF)
private fun uvLevel(x: Double) = if (x < 3) "Lav" else if (x < 6) "Moderat" else if (x < 8) "Høy" else if (x < 11) "Svært høy" else "Ekstrem"
private fun hpa(x: Double) = String.format(wxNb, "%,d", x.roundToInt())

private fun metricOf(w: WeatherFull, key: String, di: Int): Metric {
    val days = w.days
    val date = days.getOrNull(di)?.date ?: ""
    val hrs = wxDayHours(w, date)
    val c = w.current
    val today = di == 0
    fun ser(f: (WxHour) -> Double?, fb: Double?): List<Double?> = hrs.map { h -> h?.let(f) ?: (if (today || h != null) fb else null) }
    return when (key) {
        "uv" -> Metric("UV-indeks", "bar", ser({ it.uv }, if (today) c.uv ?: 0.0 else null), fmt = { it.roundToInt().toString() }, c = ::uvColor, lvl = ::uvLevel,
            about = "UV-indeksen måler styrken på solens ultrafiolette stråling. Fra 3 og oppover bør du bruke solkrem, solbriller og skygge midt på dagen. Verdien er beregnet for skyfri himmel.",
            scale = listOf(Triple("0–2", "Lav", Color(0xFF6FDC8C)), Triple("3–5", "Moderat", Color(0xFFFFD34D)), Triple("6–7", "Høy", Color(0xFFFF9A3D)), Triple("8–10", "Svært høy", Color(0xFFF2555A)), Triple("11+", "Ekstrem", Color(0xFFB36BFF))),
            min = 0.0, maxF = 11.0)
        "feel" -> Metric("Føles som", "line", ser({ it.feels }, null), ser({ it.temp }, null), "Faktisk", fmt = { "${it.roundToInt()}°" },
            about = "«Føles som» tar med vindens nedkjølende effekt (vindavkjøling) og luftfuktighet. Kald vind gjør at det føles kaldere enn termometeret viser.")
        "yd" -> {
            val prev = if (di == 0) null else days.getOrNull(di - 1)?.date
            val yv: List<Double?> = prev?.let { p -> wxDayHours(w, p).map { it?.temp } } ?: run {
                // I dag mot i går: timene for i går hvis serveren har dem.
                val y = LocalDateTime.now().minusDays(1).toLocalDate().toString()
                wxDayHours(w, y).map { it?.temp }
            }
            Metric("Mot i går", "line", ser({ it.temp }, null), yv, "Dagen før", fmt = { "${it.roundToInt()}°" },
                about = "Sammenligner temperaturen time for time med dagen før. Den stiplede linjen er dagen før.")
        }
        "rain" -> Metric("Nedbør", "bar", ser({ it.precip }, 0.0), fmt = { wxF1(it) + " mm" }, c = { sky }, pp = ser({ it.precipProb }, 0.0),
            about = "Viser forventet nedbørsmengde per time i millimeter. Under 0,5 mm per time er lett regn, over 4 mm er kraftig regn. Prosenten er sannsynligheten for nedbør.", min = 0.0, maxF = 2.0)
        "vis" -> Metric("Sikt", "line", ser({ it.visKm }, if (today) wxVisKm(c.visibility) ?: 20.0 else null), fmt = { (if (it >= 10) it.roundToInt().toString() else wxF1(it)) + " km" },
            about = "Sikt er hvor langt du kan se tydelig. Tåke, dis, nedbør og forurensning reduserer sikten. Over 10 km regnes som god sikt.", min = 0.0)
        "hum" -> Metric("Luftfuktighet", "line", ser({ it.humidity }, if (today) c.humidity else null), fmt = { "${it.roundToInt()} %" },
            about = "Relativ luftfuktighet er hvor mye vanndamp luften inneholder, sammenlignet med det maksimale ved samme temperatur. Duggpunktet er temperaturen der dugg eller tåke dannes.", min = 0.0, max = 100.0)
        "pres" -> Metric("Lufttrykk", "line", ser({ it.pressure }, if (today) c.pressure else null), fmt = { hpa(it) + " hPa" },
            about = "Lufttrykket er redusert til havnivå. Stigende trykk betyr ofte bedre vær, synkende trykk kan bety at lavtrykk og nedbør er på vei. Normalt er cirka 1013 hPa.")
        "wind" -> Metric("Vind", "line", ser({ it.wind }, null), ser({ it.gust ?: it.wind?.let { x -> x * 1.6 } }, null), "Vindkast", fmt = { wxF1(it) + " m/s" },
            about = "Gjennomsnittlig vind i 10 meters høyde. Vindkast er de sterkeste kortvarige vindstøtene. Over 10,8 m/s er liten kuling, over 20,8 m/s er sterk kuling.", min = 0.0)
        "sun" -> Metric("Sol", "list", about = "Soloppgang og solnedgang for valgt sted. Dagslengden er tiden mellom soloppgang og solnedgang.")
        else -> Metric("Månen", "list", about = "Månefasen gjentas hver 29,5 dag. Belyst andel er hvor stor del av månen som er opplyst sett fra jorda.")
    }
}

private fun dayLen(a: String?, b: String?): String {
    val x = wxLdt(a); val y = wxLdt(b)
    if (x == null || y == null) return "–"
    val m = Duration.between(x, y).toMinutes()
    return "${m / 60} t ${m % 60} min"
}

@Composable
internal fun MetricSheet(w: WeatherFull, key: String, di: Int, setDay: (Int) -> Unit, close: () -> Unit) {
    val days = w.days.take(7)
    if (days.isEmpty()) return
    val sel = di.coerceIn(0, days.size - 1)
    val M = metricOf(w, key, sel)
    val tm = rememberTextMeasurer()
    val nowH = LocalDateTime.now().hour
    val today = sel == 0
    WxSheetShell(close) {
        SheetTitle(M.t, close)
        DayPicker(days.map { it.date }, sel) { setDay(it) }
        DateLine(longDate(days[sel].date, false))
        if (M.ty == "list") {
            val rows: List<List<String>>
            val big: String
            val sub: String
            if (key == "sun") {
                rows = days.mapIndexed { k, d -> listOf(if (k == 0) "I dag" else wxLd(d.date)?.let(::wxWd) ?: "", "↑ " + wxHm(d.sunrise), "↓ " + wxHm(d.sunset), dayLen(d.sunrise, d.sunset)) }
                big = wxHm(days[sel].sunrise) + " – " + wxHm(days[sel].sunset)
                sub = "Dagslengde " + dayLen(days[sel].sunrise, days[sel].sunset)
            } else {
                fun ph(ds: String) = wxMoonAge((wxLd(ds) ?: java.time.LocalDate.now()).atTime(22, 0).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli())
                rows = days.mapIndexed { k, d -> val (a, il) = ph(d.date); listOf(if (k == 0) "I dag" else wxLd(d.date)?.let(::wxWd) ?: "", wxMoonName(a, true), "${(il * 100).roundToInt()} %", "") }
                val (a, il) = ph(days[sel].date)
                big = wxMoonName(a, true)
                sub = "Belyst ${(il * 100).roundToInt()} %"
            }
            BigSub(big, sub)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(sheetCard).padding(horizontal = 6.dp, vertical = 2.dp)) {
                rows.forEachIndexed { i, r ->
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(horizontal = 8.dp).height(1.dp).background(sheetLine))
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (i == sel) sky.copy(alpha = .16f) else Color.Transparent).clickable { setDay(i) }.padding(8.dp, 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(r[0], fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(52.dp))
                        Text(r[1], fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(r[2], fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = wxBlue)
                        if (r[3].isNotEmpty()) Text(r[3], fontSize = 13.sp, color = mut, maxLines = 1)
                    }
                }
            }
        } else {
            val vv = M.v
            val nn = vv.filterNotNull()
            if (nn.isEmpty()) {
                BigSub("–", "Timevarselet finnes ikke for denne dagen ennå.")
            } else {
                val all = nn + (M.v2?.filterNotNull() ?: emptyList())
                val mn = all.min(); val mx = all.max()
                val lo = M.min ?: floor(mn - (mx - mn) * .15 - .5)
                var hi = M.max ?: max(lo + (M.maxF ?: 1.0), ceil(mx + (mx - mn) * .15 + .5))
                if (hi - lo < 1) hi = lo + 1
                val curI = if (today) nowH else 12
                val cur = vv[curI] ?: nn.last()
                val vmax = nn.max()
                val imx = vv.indexOf(vmax); val imn = vv.indexOf(nn.min())
                val shown = if (today) cur else vmax
                val big = M.fmt(shown)
                val sub = (M.lvl?.let { it(shown) + " · " } ?: "") + (if (today) "Nå" else "Høyest") + " · maks " + M.fmt(vmax) + " kl. " + wxPad(imx) +
                    (if (M.ty == "line") " · min " + M.fmt(nn.min()) else "") + (M.pp?.let { p -> " · ${(p.filterNotNull().maxOrNull() ?: 0.0).roundToInt()} % sjanse" } ?: "")
                BigSub(big, sub)
                Column {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(sheetLine))
                    Canvas(Modifier.fillMaxWidth().padding(vertical = 10.dp).aspectRatio(336f / 182f)) {
                        val k = size.width / 336f
                        val W = 296f; val HT = 150f
                        fun X(i: Int) = (4 + i / 23f * (W - 8)) * k
                        fun Y(x: Double) = ((8 + (1 - (x - lo) / (hi - lo)) * HT) * k).toFloat()
                        for (q in 0..3) {
                            val value = lo + (hi - lo) * q / 3
                            drawLine(Color(0xFF2C3038), Offset(0f, Y(value)), Offset(300 * k, Y(value)), k)
                            svgText(tm, M.fmt(value).replace(" hPa", "").replace(" mm", "").replace(" m/s", "").replace(" km", ""), 306f, Y(value) / k + 4, k, 11f, mut)
                        }
                        if (M.ty == "bar") vv.forEachIndexed { i, x ->
                            if (x == null) return@forEachIndexed
                            val h = max(1.5, (x - lo) / (hi - lo) * HT).toFloat()
                            drawRoundRect(if (today && i < nowH) Color.White.copy(alpha = .25f) else M.c?.invoke(x) ?: sky, Offset(X(i) - 4.5f * k, (8 + HT - h) * k), Size(9 * k, h * k), CornerRadius(2 * k))
                        } else {
                            val first = vv.indexOfFirst { it != null }; val last = vv.indexOfLast { it != null }
                            drawPath(linePath(vv, ::X, ::Y).apply { lineTo(X(last), (8 + HT) * k); lineTo(X(first), (8 + HT) * k); close() }, sky.copy(alpha = .14f))
                            M.v2?.let { drawPath(linePath(it, ::X, ::Y), mut, style = Stroke(2 * k, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * k, 4 * k)))) }
                            drawPath(linePath(vv, ::X, ::Y), sky, style = Stroke(3 * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
                        }
                        if (today) {
                            drawLine(Color.White.copy(alpha = .35f), Offset(X(nowH), 8 * k), Offset(X(nowH), 158 * k), k)
                            drawCircle(sheetBg, 6.25f * k, Offset(X(nowH), Y(cur)))
                            drawCircle(Color.White, 3.75f * k, Offset(X(nowH), Y(cur)))
                        }
                        listOf(0, 6, 12, 18).forEach { h -> svgText(tm, wxPad(h), X(h) / k, 176f, k, 12f, mut) }
                    }
                    if (M.v2 != null) Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(16.dp, 3.dp).clip(RoundedCornerShape(2.dp)).background(sky)); Text(M.t, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = mut)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Canvas(Modifier.size(16.dp, 3.dp)) { drawLine(mut, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 2.dp.toPx()))) }
                            Text(M.l2, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = mut)
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(sheetLine))
                }
            }
        }
        M.scale?.let { sc ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(sheetCard).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Skala", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Row(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp))) { sc.forEach { Box(Modifier.weight(1f).fillMaxHeight().background(it.third)) } }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    sc.forEach { (a, b, _) -> Column(Modifier.weight(1f)) { Text(a, fontSize = 12.5.sp, fontWeight = FontWeight.Bold); Text(b, fontSize = 11.5.sp, color = mut) } }
                }
            }
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(sheetCard).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Om ${M.t}", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(M.about, fontSize = 14.sp, lineHeight = 21.sp, color = Color(0xFFC7CCD4))
        }
    }
}

@Composable
private fun BigSub(big: String, sub: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(big, fontSize = 34.sp, fontWeight = FontWeight.SemiBold, lineHeight = 37.sp)
        Text(sub, fontSize = 14.sp, color = mut)
    }
}

/* ---------- «Yr mot Pent» ---------- */

@Composable
internal fun CmpSheet(vm: AppViewModel, w: WeatherFull, close: () -> Unit) {
    val v = cmpView(vm, w)
    val ctx = LocalContext.current
    val tm = rememberTextMeasurer()
    WxSheetShell(close, z = 22f) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Yr mot Pent", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text(w.place, fontSize = 13.sp, color = mut2)
            }
            WhitePill("Ferdig", close)
        }
        if (vm.wxCmp22Busy) Text("Henter Pent-data …", fontSize = 13.sp, color = mut2)
        if (!v.ready && vm.wxCmp22Failed) Text("Pent svarte ikke. Prøv igjen senere.", fontSize = 13.sp, color = mut2)
        if (v.ready) {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(sheetCard).padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(12.dp).clip(CircleShape).background(v.agC))
                Column(Modifier.weight(1f)) {
                    Text(v.agT, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Text(v.agS, fontSize = 12.5.sp, color = mut2)
                }
            }
            val c = vm.wxCmp22
            val hrs = wxNext24(w)
            if (c != null && hrs.size >= 2) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(sheetCard).padding(14.dp, 14.dp, 14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("NESTE 24 TIMER", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = .12.em, color = mut2, modifier = Modifier.weight(1f))
                    Legend("Yr", sky); Spacer(Modifier.width(12.dp)); Legend("Pent", Color(0xFFFF8A3D))
                }
                val ys = hrs.map { c.yrHours[it.t.take(13)] ?: it.temp }
                val ss = hrs.map { c.pentHours[it.t.take(13)] }
                val ym = hrs.map { c.yrMm[it.t.take(13)] ?: it.precip ?: 0.0 }
                val sm = hrs.map { c.pentMm[it.t.take(13)] ?: 0.0 }
                val all = (ys + ss).filterNotNull()
                if (all.isNotEmpty()) {
                    val lo = floor((all.min() - 1) / 2) * 2
                    val hi = ceil((all.max() + 1) / 2) * 2
                    val pm = max(2.0, (ym + sm).max())
                    Canvas(Modifier.fillMaxWidth().aspectRatio(300f / 170f)) {
                        val k = size.width / 300f
                        val n = hrs.size
                        fun X(i: Int) = (22 + i / max(1f, (n - 1).toFloat()) * 278) * k
                        fun Y(x: Double) = ((10 + (1 - (x - lo) / max(1.0, hi - lo)) * 110) * k).toFloat()
                        val step = max(2.0, ((hi - lo) / 4 / 2).roundToInt() * 2.0)
                        var g = lo
                        while (g <= hi + .01) {
                            drawLine(Color.White.copy(alpha = .08f), Offset(22 * k, Y(g)), Offset(300 * k, Y(g)), k)
                            svgText(tm, "${g.roundToInt()}°", 0f, Y(g) / k + 3, k, 9f, mut2)
                            g += step
                        }
                        for (i in 0 until n) listOf(Triple(ym[i], sky, -4.5f), Triple(sm[i], Color(0xFFFF8A3D), .5f)).forEach { (x, col, o) ->
                            if (x > 0) { val bh = max(2.0, x / pm * 30).toFloat(); drawRoundRect(col, Offset(X(i) + o * k, (152 - bh) * k), Size(4 * k, bh * k), CornerRadius(1.5f * k)) }
                        }
                        drawPath(linePath(ys, ::X, ::Y), sky, style = Stroke(2.5f * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
                        drawPath(linePath(ss, ::X, ::Y), Color(0xFFFF8A3D), style = Stroke(2.5f * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
                        for (i in 0 until n step 4) svgText(tm, hrs[i].t.drop(11).take(2), X(i) / k, 168f, k, 9f, mut2, anchor = 1)
                    }
                }
                Text("Søyler viser nedbør per time. Yr til venstre, Pent til høyre.", fontSize = 11.5.sp, color = mut2)
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(sheetCard).padding(horizontal = 14.dp, vertical = 4.dp)) {
                CmpHead(sky, Color(0xFFFF8A3D), mut2, 44.dp, 44.dp, Modifier.padding(top = 10.dp, bottom = 8.dp))
                v.rows.forEach { CmpTableRow(it, Color.White.copy(alpha = .08f), 44.dp, 44.dp) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Åpne yr.no ↗" to (w.yrUrl ?: "https://www.yr.no/nb"), "Åpne storm.no ↗" to "https://www.storm.no/").forEach { (n, u) ->
                Box(Modifier.weight(1f).height(42.dp).clip(CircleShape).background(sheetCard).clickable { openLink(ctx, u) }, contentAlignment = Alignment.Center) {
                    Text(n, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Text("Yr er MET Norway (api.met.no). Pent (StormGeo) har ikke et åpent API, så Pent-kolonnen viser ECMWF-modellen fra Open-Meteo, som er nærmeste åpne kilde. Avvik er forskjellen i makstemperatur.",
            fontSize = 12.sp, color = mut2, lineHeight = 17.sp)
    }
}

@Composable
private fun Legend(t: String, c: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(14.dp, 3.dp).clip(RoundedCornerShape(2.dp)).background(c))
        Text(t, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun WhitePill(t: String, onClick: () -> Unit) {
    Box(Modifier.height(38.dp).clip(CircleShape).background(Color.White).clickable(onClick = onClick).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
        Text(t, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, color = sheetBg)
    }
}

/* ---------- Steder: søk, legg til, hold inne og dra, sveip mot høyre for å slette ---------- */

@Composable
internal fun PlacesSheet(vm: AppViewModel) {
    var q by remember { mutableStateOf("") }
    val close = { vm.wxPlacesSheet = false; vm.searchWxPlaces("") }
    LaunchedEffect(Unit) { if (vm.wxPlaces.isEmpty()) vm.loadWxPlaces() }
    var order by remember { mutableStateOf<List<WxPlace>?>(null) }
    val list = order ?: vm.wxPlaces.ifEmpty { WX_PLACES.map { (id, n) -> WxPlace(id, n, 0.0, 0.0, "") } }
    var dragId by remember { mutableStateOf<String?>(null) }
    var openId by remember { mutableStateOf<String?>(null) }
    val bounds = remember { HashMap<String, Rect>() }
    WxSheetShell({ close() }, z = 21f) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Steder", fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            WhitePill("Ferdig") { close() }
        }
        Row(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xFF262A31)).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Canvas(Modifier.size(17.dp)) {
                val k = size.width / 24f
                drawCircle(mut2, 7 * k, Offset(11 * k, 11 * k), style = Stroke(2.2f * k))
                drawLine(mut2, Offset(20 * k, 20 * k), Offset(16.5f * k, 16.5f * k), 2.2f * k, StrokeCap.Round)
            }
            BasicTextField(
                q, { q = it; vm.searchWxPlaces(it) }, singleLine = true,
                textStyle = TextStyle(color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Default),
                cursorBrush = SolidColor(sky), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { vm.searchWxPlaces(q) }),
                modifier = Modifier.weight(1f),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (q.isEmpty()) Text("Søk etter by eller sted", fontSize = 16.sp, color = mut2); inner() } },
            )
        }
        if (vm.wxSearchBusy) Text("Søker …", fontSize = 13.sp, color = mut2)
        val res = vm.wxSearch
        if (res.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(sheetCard).padding(horizontal = 14.dp, vertical = 2.dp)) {
            res.take(8).forEachIndexed { i, r ->
                val have = list.firstOrNull { it.name == r.name && abs(it.lat - r.lat) < .05 }
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .1f)))
                Row(Modifier.fillMaxWidth().clickable {
                    if (have != null) vm.loadWeatherAt(have) else vm.addWxPlace(r)
                    q = ""; close()
                }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(r.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        Text(listOf(r.region.takeIf { it.isNotBlank() }, String.format(java.util.Locale.US, "%.2f, %.2f", r.lat, r.lon)).filterNotNull().joinToString(" · "), fontSize = 12.5.sp, color = mut2, maxLines = 1)
                    }
                    Text(if (have != null) "Vis" else "+ Legg til", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = if (have != null) mut2 else sky)
                }
            }
        }
        if (q.trim().length >= 2 && !vm.wxSearchBusy && res.isEmpty()) Text("Fant ingen steder.", fontSize = 13.sp, color = mut2)
        Text("MINE STEDER", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = .12.em, color = mut2)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            list.forEach { p ->
                key(p.id) {
                    PlaceRow(vm, p, selected = vm.weatherPlace == p.id, dragging = dragId == p.id, open = openId == p.id, canDelete = list.size > 1,
                        onBounds = { bounds[p.id] = it },
                        onOpen = { openId = if (it) p.id else null },
                        onTap = { if (openId != null) openId = null else { vm.loadWeatherAt(p); close() } },
                        onLong = { Haptics.tap(); openId = null; dragId = p.id; order = list },
                        onDrag = { y ->
                            val cur = order ?: list
                            val to = bounds.entries.firstOrNull { (id, r) -> id != p.id && y >= r.top && y <= r.bottom }?.key
                            if (to != null) {
                                val from = cur.indexOfFirst { it.id == p.id }
                                val ti = cur.indexOfFirst { it.id == to }
                                if (from >= 0 && ti >= 0) { order = cur.toMutableList().apply { add(ti, removeAt(from)) }; Haptics.select() }
                            }
                        },
                        onEnd = { dragId = null; order?.let { if (it.map(WxPlace::id) != vm.wxPlaces.map(WxPlace::id)) vm.reorderWxPlaces(it) }; order = null },
                        onDelete = { openId = null; vm.removeWxPlace(p.id) },
                    )
                }
            }
        }
        Text("Hold inne for å flytte · sveip mot høyre for å slette", fontSize = 12.sp, color = mut2, modifier = Modifier.padding(horizontal = 4.dp))
        Text("Værdata fra Meteorologisk institutt (yr.no, api.met.no). Stedssøk via Open-Meteo.", fontSize = 12.sp, color = mut2, lineHeight = 17.sp)
    }
}

@Composable
private fun PlaceRow(
    vm: AppViewModel, p: WxPlace, selected: Boolean, dragging: Boolean, open: Boolean, canDelete: Boolean,
    onBounds: (Rect) -> Unit, onOpen: (Boolean) -> Unit, onTap: () -> Unit, onLong: () -> Unit, onDrag: (Float) -> Unit, onEnd: () -> Unit, onDelete: () -> Unit,
) {
    val density = LocalDensity.current
    // holdDrag lager gesten én gang: de siste versjonene av tilbakekallene leses ved bruk.
    val longNow by rememberUpdatedState(onLong)
    val dragNow by rememberUpdatedState(onDrag)
    val endNow by rememberUpdatedState(onEnd)
    val openPx = with(density) { 96.dp.toPx() }
    val keepPx = with(density) { 60.dp.toPx() }
    var dx by remember { mutableFloatStateOf(0f) }
    var swiping by remember { mutableStateOf(false) }
    var width by remember { mutableIntStateOf(1) }
    var rootTop by remember { mutableFloatStateOf(0f) }
    val shown by animateFloatAsState(if (swiping) dx else if (open) openPx else 0f, label = "swipe")
    val sc by animateFloatAsState(if (dragging) 1.03f else 1f, label = "lift")
    Box(
        Modifier.fillMaxWidth().zIndex(if (dragging) 2f else 1f).scale(sc)
            .then(if (dragging) Modifier.shadow(18.dp, RoundedCornerShape(18.dp)) else Modifier)
            .clip(RoundedCornerShape(18.dp)).onSizeChanged { width = it.width }
            .onGloballyPositioned { val r = it.boundsInRoot(); rootTop = r.top; onBounds(r) }
            .holdDrag(true, { longNow() }, { dragNow(it) }, { endNow() }) { pos -> rootTop + pos.y }
            .pointerInput(canDelete, open) {
                detectHorizontalDragGestures(
                    onDragStart = { swiping = true; dx = if (open) openPx else 0f },
                    onDragEnd = {
                        swiping = false
                        when {
                            canDelete && dx > width * .6f -> { Haptics.tap(); onDelete() }
                            canDelete && dx > keepPx -> onOpen(true)
                            else -> onOpen(false)
                        }
                        dx = 0f
                    },
                    onDragCancel = { swiping = false; dx = 0f },
                ) { ch, amount -> ch.consume(); dx = (dx + amount).coerceIn(0f, if (canDelete) width.toFloat() else 0f) }
            },
    ) {
        if (shown > 0f) Box(Modifier.matchParentSize().background(Color(0xFFE5484D)).clickable { onDelete() }.padding(start = 22.dp), contentAlignment = Alignment.CenterStart) {
            Text("Slett", fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        Row(
            Modifier.fillMaxWidth().offset { IntOffset(shown.roundToInt(), 0) }.background(if (selected) Color(0xFF2F3A4C) else sheetCard).clickable(onClick = onTap).padding(16.dp, 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(p.name, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (p.region.isNotBlank()) Text(p.region, fontSize = 12.5.sp, color = Color(0xFFC4CBD4), maxLines = 1)
            }
            Text("≡", fontSize = 18.sp, color = mut2, modifier = Modifier.alpha(if (dragging) 1f else 0f))
        }
    }
}

/* ---------- Værkart i fullskjerm (Windy) ---------- */

private val MAP_LAYERS = listOf("rain" to "Nedbør", "temp" to "Temperatur", "wind" to "Vind", "clouds" to "Skyer")

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun WxMap(w: WeatherFull?, close: () -> Unit) {
    var layer by remember { mutableStateOf("rain") }
    val la = w?.lat ?: 59.91
    val lo = w?.lon ?: 10.75
    val src = "https://embed.windy.com/embed2.html?lat=$la&lon=$lo&detailLat=$la&detailLon=$lo&zoom=7&level=surface&overlay=$layer&product=ecmwf&menu=&message=true&marker=true" +
        "&calendar=now&type=map&location=coordinates&metricWind=m%2Fs&metricTemp=%C2%B0C"
    Box(Modifier.fillMaxSize().zIndex(23f).background(Color(0xFF0D1520)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}) {
        AndroidView(
            factory = { c: android.content.Context -> WebView(c).apply { settings.javaScriptEnabled = true; settings.domStorageEnabled = true; webViewClient = WebViewClient(); setBackgroundColor(0xFF0D1520.toInt()); loadUrl(src) } },
            update = { v: WebView -> if (v.url != src && v.tag != src) { v.tag = src; v.loadUrl(src) } },
            modifier = Modifier.fillMaxSize(),
        )
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.height(40.dp).clip(CircleShape).background(Color(0xB30A1423)).clickable(onClick = close).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                Text("Ferdig", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
            Text(w?.place ?: "", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
                style = TextStyle(color = Color.White, shadow = androidx.compose.ui.graphics.Shadow(Color(0x99000000), Offset(0f, 2f), 16f)))
            Spacer(Modifier.width(72.dp))
        }
        Row(
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 22.dp).clip(CircleShape).background(Color(0xBF0A1423))
                .border(1.dp, Color.White.copy(alpha = .14f), CircleShape).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            MAP_LAYERS.forEach { (k, n) ->
                val on = layer == k
                Box(Modifier.height(38.dp).clip(CircleShape).background(if (on) Color.White else Color.Transparent).clickable { Haptics.select(); layer = k }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text(n, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = if (on) Color(0xFF0D1520) else Color.White, maxLines = 1)
                }
            }
        }
    }
}
