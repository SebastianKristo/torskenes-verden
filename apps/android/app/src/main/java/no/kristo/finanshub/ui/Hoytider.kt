package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.sin
import no.kristo.finanshub.*

/* ======================= Julemodus: antrekket ======================= */

private val pathCache40 = HashMap<String, androidx.compose.ui.graphics.Path>()

private fun svgPath40(d: String): androidx.compose.ui.graphics.Path = synchronized(pathCache40) {
    pathCache40.getOrPut(d) { PathParser().parsePathString(d).toPath() }
}

/** Tegner en SVG-sti fra en viewBox (vbW × vbH) inn i en boks (x, y, w, h). */
internal fun DrawScope.svg40(d: String, x: Float, y: Float, w: Float, h: Float, vbW: Float, vbH: Float, fill: Color? = null, stroke: Color? = null, sw: Float = 0f) {
    translate(x, y) {
        scale(w / vbW, h / vbH, Offset.Zero) {
            val p = svgPath40(d)
            fill?.let { drawPath(p, it) }
            stroke?.let { drawPath(p, it, style = Stroke(sw, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
        }
    }
}

/**
 * Antrekket fra glimt-figurer.js (dress): Advent = rød nisselue + grønt skjerf, Jul = lue + skjerf + gave, Nyttår = svart festhatt
 * med gull, Vinter = blå strikkelue + rødt skjerf. S = figurens bredde, H = høyden. Vugger rolig (3 s); «Reduser bevegelse» = stille.
 */
internal fun DrawScope.drawJul40(S: Float, H: Float, phase: String, t: Float, anim: Boolean, id: String = "") {
    val sway = if (anim) (sin(2 * PI * (t % 3f) / 3f).toFloat() * 3f) else 0f
    // Prompt 41: ankerpunkter per figur (hT hatt-topp, hX hatt-senter, hS hattskala, sB skjerf-bunn, sW skjerf-bredde, gB/gR gave).
    val an = figAnchor41(id)
    val hT = an.hT; val hX = an.hX; val hS = an.hS; val sB = an.sB; val sW = an.sW; val gB = an.gB; val gR = an.gR
    val scarf = phase == "advent" || phase == "jul" || phase == "vinter"
    val sc = if (phase == "vinter") Color(0xFFB23A2A) else Color(0xFF2F7A4F)
    if (scarf) {
        // bottom −S·0,2: toppen ligger på H − S·0,5 + S·0,2.
        val w = S * sW; val h = S * .5f * sW / 1.05f
        val x = S / 2 - w / 2; val y = H - S * sB - h
        svg40("M8 10 Q52 26 97 10 L95 24 Q52 40 10 24 Z", x, y, w, h, 105f, 50f, fill = sc)
        svg40("M22 16 l4 12 M40 20 l3 13 M58 20 l-1 13 M76 17 l-3 12", x, y, w, h, 105f, 50f, stroke = Color(0xFFF6F1E7), sw = 3f)
        svg40("M70 22 L80 48 L68 50 L62 26 Z", x, y, w, h, 105f, 50f, fill = sc)
    }
    when (phase) {
        "advent", "jul" -> {
            val w = S * .95f * hS; val h = S * .7f * hS
            val x = S * hX - S * .42f * hS; val y = S * hT
            rotate(-14f + sway, Offset(x + w / 2, y + h / 2)) {
                svg40("M14 56 Q40 4 74 8 Q86 10 88 20 Q70 18 66 56 Z", x, y, w, h, 95f, 70f, fill = Color(0xFFC8302A))
                drawCircle(Color(0xFFFBF7EE), 8f * w / 95f, Offset(x + 89f * w / 95f, y + 22f * h / 70f))
                drawRoundRect(Color(0xFFFBF7EE), Offset(x + 6f * w / 95f, y + 50f * h / 70f), Size(70f * w / 95f, 15f * h / 70f),
                    androidx.compose.ui.geometry.CornerRadius(7.5f * w / 95f))
            }
        }
        "vinter" -> {
            val w = S * .9f * hS; val h = S * .6f * hS
            val x = S * hX - S * .45f * hS; val y = S * (hT + .08f)
            rotate(sway * .6f, Offset(x + w / 2, y + h)) {
                svg40("M10 50 Q10 10 45 10 Q80 10 80 50 Z", x, y, w, h, 90f, 60f, fill = Color(0xFF3B6FB0))
                drawRoundRect(Color(0xFF2B5D8A), Offset(x + 6f * w / 90f, y + 42f * h / 60f), Size(78f * w / 90f, 14f * h / 60f), androidx.compose.ui.geometry.CornerRadius(6f * w / 90f))
                drawCircle(Color(0xFFFBF7EE), 8f * w / 90f, Offset(x + 45f * w / 90f, y + 8f * h / 60f))
            }
        }
        "nyttar" -> {
            val w = S * .6f; val h = S * .62f
            val x = S / 2 - S * .22f; val y = -S * .48f
            rotate(12f + sway, Offset(x + w / 2, y + h / 2)) {
                svg40("M8 56 L30 4 L52 56 Z", x, y, w, h, 60f, 62f, fill = Color(0xFF1B1A17))
                svg40("M14 42 L46 42 M19 30 L41 30 M24 18 L36 18", x, y, w, h, 60f, 62f, stroke = Color(0xFFF2C14E), sw = 3f)
                drawCircle(Color(0xFFF2C14E), 5f * w / 60f, Offset(x + 30f * w / 60f, y + 4f * h / 62f))
            }
            // Gnister (ikke med «Reduser bevegelse»).
            if (anim) listOf(Offset(-S * .08f, S * .05f), Offset(S * 1.02f, S * .18f), Offset(S * .9f, -S * .12f)).forEachIndexed { i, o ->
                val a = ((sin(2 * PI * ((t + i * .5f) % 1.6f) / 1.6f).toFloat() + 1f) / 2f)
                drawCircle(Color(0xFFF2C14E).copy(alpha = .3f + .6f * a), S * .03f * (.6f + a), o)
            }
        }
    }
    if (phase == "jul") {
        val w = S * .34f; val h = S * .3f
        val x = S - S * gR - w; val y = H - S * gB - h
        rotate(8f, Offset(x + w / 2, y + h / 2)) {
            drawRoundRect(Color(0xFFB23A2A), Offset(x, y), Size(w, h), androidx.compose.ui.geometry.CornerRadius(4f * density))
            drawRect(Color(0xFFF2C14E), Offset(x + w * .44f, y), Size(w * .12f, h))
            drawRect(Color(0xFFF2C14E), Offset(x, y + h * .4f), Size(w, h * .14f))
        }
    }
}

/** Innstillinger → Glimt → «Julemodus»: rød lue-rute, status, Auto · Av · På og fasevalg når På er valgt, snø og julelyd. */
@Composable
internal fun Jul40Card(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id) { vm.loadJul40() }
    @Suppress("UNUSED_VARIABLE") val tick = Jul40.tick
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFFBE3DF)), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(28.dp)) {
                    svg40("M14 56 Q40 4 74 8 Q86 10 88 20 Q70 18 66 56 Z", 0f, 0f, size.width, size.height * .74f, 95f, 70f, fill = Color(0xFFC8302A))
                    drawCircle(Color.White, size.width * .085f, Offset(size.width * .93f, size.height * .24f))
                    drawRoundRect(Color.White, Offset(0f, size.height * .54f), Size(size.width * .8f, size.height * .16f), androidx.compose.ui.geometry.CornerRadius(size.width * .08f))
                }
            }
            Column(Modifier.weight(1f)) {
                Text("Julemodus", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
                Text(Jul40.statusText(), color = if (Jul40.phase != null) p.pos else p.mut, fontSize = 12.5.sp)
            }
            GlimtFig35("glimt", 30.dp, "idle", still = true)
        }
        Seg40(listOf("auto" to "Auto", "av" to "Av", "pa" to "På"), Jul40.mode) { vm.setJul40(mode = it) }
        if (Jul40.mode == "pa") Seg40(Jul40.PHASES, Jul40.manual) { vm.setJul40(phase = it) }
        Text("Auto: 1. desember–13. januar. Glimt får lue og skjerf overalt (brief, chat, varsler, søk og widgets), med varmere tone og nedtelling til jul.",
            color = p.mut, fontSize = 12.sp, lineHeight = 16.5.sp)
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        PToggle("Snø i Vær og brief", "Når det snør eller er minus", Jul40.snow) { vm.setJul40(snow = it) }
        PToggle("Julelyd på varsler", if (Jul40.sound == "bjelle") "Myk bjelle (lav og kort)" else "Av", Jul40.sound == "bjelle", top = true) { vm.setJul40(sound = if (it) "bjelle" else "av") }
    }
}

/** Segmentvalg i Papir-stil (runde hjørner). */
@Composable
internal fun Seg40(opts: List<Pair<String, String>>, cur: String, pick: (String) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().height(38.dp).clip(RoundedCornerShape(19.dp)).background(p.surf2).padding(3.dp)) {
        opts.forEach { (k, n) ->
            val on = k == cur
            Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(16.dp)).background(if (on) p.card else Color.Transparent)
                .clickable(role = Role.RadioButton) { if (!on) pick(k) }, contentAlignment = Alignment.Center) {
                Text(n, color = if (on) p.ink else p.mut, fontWeight = if (on) FontWeight.Bold else FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
            }
        }
    }
}

/* ======================= 17. mai: sløyfe og flagg ======================= */

private val FLAG_R41 = Color(0xFFBA0C2F)

private val FLAG_B41 = Color(0xFF00205B)

/** Norsk flagg (22:16, kors 4/2) med øvre venstre hjørne i (x, y) og bredde w. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.flag41(x: Float, y: Float, w: Float) {
    val u = w / 22f
    drawRect(FLAG_R41, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Size(w, 16 * u))
    drawRect(Color.White, androidx.compose.ui.geometry.Offset(x + 6 * u, y), androidx.compose.ui.geometry.Size(4 * u, 16 * u))
    drawRect(Color.White, androidx.compose.ui.geometry.Offset(x, y + 6 * u), androidx.compose.ui.geometry.Size(w, 4 * u))
    drawRect(FLAG_B41, androidx.compose.ui.geometry.Offset(x + 7 * u, y), androidx.compose.ui.geometry.Size(2 * u, 16 * u))
    drawRect(FLAG_B41, androidx.compose.ui.geometry.Offset(x, y + 7 * u), androidx.compose.ui.geometry.Size(w, 2 * u))
}

/** Ankerpunkter for tilbehør per figur (glimt-figurer.js → dress AN). Runde figurer bruker standard. */
internal class FigAnchor41(val hT: Float = -.44f, val hX: Float = .5f, val hS: Float = 1f, val sB: Float = -.2f, val sW: Float = 1.05f, val gB: Float = -.16f, val gR: Float = -.2f)

private val ANCHORS41 = mapOf(
    "spire" to FigAnchor41(hT = -.08f, hX = .56f, hS = .8f, sB = -.13f, sW = .98f, gB = -.1f, gR = -.12f),
    "sky" to FigAnchor41(hT = -.18f, hX = .6f, hS = .78f, sB = .07f, sW = .92f, gB = .05f, gR = -.08f),
)

private val ANCHOR_DEF41 = FigAnchor41()

internal fun figAnchor41(id: String): FigAnchor41 = ANCHORS41[id] ?: ANCHOR_DEF41

/**
 * 17. mai (glimt-figurer.js): rød sløyfe med hvit kant og blå knute (left hX, top S·(hT+0,36), +S·0,12, rotert 14°) og flagg på pinne
 * til høyre (right −S·0,2, bottom S·(sB+0,16), 0,32 × 0,46) som vaier (gfSway 1,6 s, origo nede til venstre).
 */
internal fun androidx.compose.ui.graphics.drawscope.DrawScope.drawMai41(S: Float, H: Float, t: Float, anim: Boolean, id: String = "") {
    val an = figAnchor41(id)
    val sway = if (anim) (kotlin.math.sin(2 * Math.PI * (t % 1.6f) / 1.6f).toFloat() * 6f) else 0f
    // Sløyfe (viewBox 36 × 22)
    val bw = S * .36f; val bh = S * .22f
    val bx = S * an.hX + S * .12f; val by = S * (an.hT + .36f)
    rotate(14f, androidx.compose.ui.geometry.Offset(bx + bw / 2, by + bh / 2)) {
        val u = bw / 36f; val v = bh / 22f
        fun pt(x: Float, y: Float) = androidx.compose.ui.geometry.Offset(bx + x * u, by + y * v)
        listOf(listOf(18f to 11f, 2f to 2f, 4f to 20f), listOf(18f to 11f, 34f to 2f, 32f to 20f)).forEach { tri ->
            val path = androidx.compose.ui.graphics.Path().apply { tri.forEachIndexed { k, (x, y) -> val o = pt(x, y); if (k == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) }; close() }
            drawPath(path, Color(0xFFC8302A))
            drawPath(path, Color(0xFFFBF7EE), style = androidx.compose.ui.graphics.drawscope.Stroke(1.6f * u))
        }
        drawCircle(Color(0xFF1F2F6B), 3.5f * u, pt(18f, 11f))
    }
    // Flagg på pinne
    val fw = S * .32f; val fh = S * .46f
    val fx = S + S * .2f - fw; val fy = H - S * (an.sB + .16f) - fh
    rotate(sway, androidx.compose.ui.geometry.Offset(fx, fy + fh)) {
        drawRoundRect(Color(0xFF8A6A3A), androidx.compose.ui.geometry.Offset(fx, fy), androidx.compose.ui.geometry.Size(S * .028f, fh), androidx.compose.ui.geometry.CornerRadius(2 * density))
        flag41(fx + S * .028f, fy, S * .3f)
    }
}

/** Innstillinger → Glimt → HØYTIDER → «17. mai»: Automatisk 17. mai / Vis nå / Av. */
@Composable
internal fun Mai41Card(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { Mai41.ensure(vm.appCtx40) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFFBE3DF)), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Canvas(Modifier.size(26.dp, 19.dp)) { flag41(0f, 0f, size.width) }
            }
            Column(Modifier.weight(1f)) {
                Text("17. mai", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
                Text(if (Mai41.on) "På · Glimt har flagg" else if (Mai41.mode == "av") "Av" else "Automatisk 14.–17. mai", color = if (Mai41.on) p.pos else p.mut, fontSize = 12.5.sp)
            }
            GlimtFig35("glimt", 30.dp, "idle", still = true)
        }
        Seg40(listOf("auto" to "Automatisk", "pa" to "Vis nå", "av" to "Av"), Mai41.mode) { vm.setMai41(it) }
        Text("Figurene får sløyfe og norsk flagg 14.–17. mai. Av = vanlige figurer uten flagg.", color = p.mut, fontSize = 12.sp, lineHeight = 16.5.sp)
    }
}

private val MAI_RED41 = Color(0xFFBA0C2F)

private val MAI_BLUE41 = Color(0xFF00205B)

/* ======================= 17. mai-Hjem ======================= */

/** Flaggrekke: vimpler rød/hvit/blå som vaier. */
@Composable
private fun Pennants41(modifier: Modifier) {
    val reduce = reduceMotion31()
    var t by remember { mutableFloatStateOf(0f) }
    if (!reduce) LaunchedEffect(Unit) { val t0 = withFrameNanos { it }; while (true) withFrameNanos { n -> t = (n - t0) / 1e9f } }
    Canvas(modifier.fillMaxWidth().height(30.dp)) {
        val n = 14; val w = size.width / n
        drawLine(Color.White.copy(alpha = .7f), Offset(0f, 4f), Offset(size.width, 4f), strokeWidth = 1.5f * density)
        for (i in 0 until n) {
            val c = when (i % 3) { 0 -> MAI_RED41; 1 -> Color.White; else -> MAI_BLUE41 }
            val sway = if (reduce) 0f else kotlin.math.sin(t * 2.2f + i * .7f) * 6f
            rotate(sway, Offset(i * w + w / 2, 4f)) {
                drawPath(Path().apply { moveTo(i * w + w * .1f, 4f); lineTo(i * w + w * .9f, 4f); lineTo(i * w + w / 2, size.height); close() }, c)
            }
        }
    }
}

/**
 * Hjem 17. mai (bare på selve dagen, eller «Vis nå»): rød topp med flaggrekke, «Søndag 17. mai · Grunnlovsdagen», «Gratulerer med dagen, …!»,
 * pillen «17. mai-design» med bryter øverst til høyre, så Program i dag og «Hipp hipp hurra!» (med flagg). Bryter av: vanlig Hjem samme dag,
 * pillen står igjen så festdesignet kan slås på igjen. Gjelder bare i dag (nullstilles 18. mai).
 */
@Composable
internal fun Mai17Home41(vm: AppViewModel) {
    val s = vm.p41
    LaunchedEffect(Unit) { vm.initMaiDesign41() }
    val first = firstName37(vm.displayName).ifBlank { "du" }
    val d = s.mai
    if (!s.maiDesign) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { MaiPill41(vm, "17. mai", false, dark = true) }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.verticalGradient(listOf(MAI_RED41, Color(0xFF8E0A24)))).padding(bottom = 16.dp)) {
            Pennants41(Modifier)
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PSerif(d?.dateLabel ?: "17. mai · Grunnlovsdagen", 15.sp, Color.White.copy(alpha = .92f), Modifier.weight(1f), maxLines = 1, italic = true)
                    MaiPill41(vm, "17. mai-design", true, dark = false)
                }
                AutoSerif(d?.greeting ?: "Gratulerer med dagen, $first!", 30.sp, Color.White, min = 20.sp)
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    vm.mobileHome?.weather?.temp?.let { PSerif("${Math.round(it)}°", 34.sp, Color.White, weight = FontWeight.Light, maxLines = 1) }
                    Spacer(Modifier.weight(1f))
                    GlimtFig35("glimt", 54.dp, "glad")
                }
            }
        }
        // 17. mai-brief (mørk blå): barnetoget, vær, trafikk.
        d?.briefText?.let { bt ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(MAI_BLUE41).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("17. MAI · GLIMT", color = Color(0xFFFFC7B8), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp)
                Text(bt, color = Color.White, fontFamily = PaperFonts.serif, fontSize = 17.sp, lineHeight = 23.sp)
                d.briefItems.take(3).forEach { Text("· $it", color = Color.White.copy(alpha = .85f), fontSize = 13.sp) }
            }
        }
        MaiProgram41(vm)
        Row(
            Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(27.dp)).background(MAI_RED41).clickable(role = Role.Button, onClickLabel = "Hipp hipp hurra") { vm.hurra41() },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
        ) {
            Canvas(Modifier.size(22.dp, 16.dp)) { flagSmall41(size.width) }
            Spacer(Modifier.width(10.dp))
            Text("Hipp hipp hurra!", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            if (s.hurra > 0) Text("  · Hurra nr. ${s.hurra}", color = Color.White.copy(alpha = .85f), fontSize = 13.sp)
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.flagSmall41(w: Float) {
    val u = w / 22f
    drawRect(MAI_RED41, Offset.Zero, Size(w, 16 * u))
    drawRect(Color.White, Offset(6 * u, 0f), Size(4 * u, 16 * u)); drawRect(Color.White, Offset(0f, 6 * u), Size(w, 4 * u))
    drawRect(MAI_BLUE41, Offset(7 * u, 0f), Size(2 * u, 16 * u)); drawRect(MAI_BLUE41, Offset(0f, 7 * u), Size(w, 2 * u))
}

@Composable
private fun MaiPill41(vm: AppViewModel, label: String, on: Boolean, dark: Boolean) {
    val fg = if (dark) PaperPal.current.ink else Color.White
    Row(
        Modifier.height(32.dp).clip(CircleShape).background(if (dark) PaperPal.current.card else Color.Black.copy(alpha = .22f))
            .clickable(role = Role.Switch) { vm.setMaiDesign41(!on) }.padding(start = 12.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(label, color = fg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        Box(Modifier.size(36.dp, 20.dp).clip(CircleShape).background(if (on) Color(0xFF3FAE6A) else Color.Gray.copy(alpha = .5f)).padding(2.dp),
            contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) { Box(Modifier.size(16.dp).clip(CircleShape).background(Color.White)) }
    }
}

/** Program i dag: byens punkter (fra serveren, reserve Oslo) + egne kalenderhendelser. Passerte grå, neste rødt. */
@Composable
private fun MaiProgram41(vm: AppViewModel) {
    val p = PaperPal.current
    val now = java.time.LocalTime.now()
    val items = vm.p41.mai?.program?.takeIf { it.isNotEmpty() } ?: run {
        val base = listOf("07:00" to "Salutt fra Akershus festning", "10:00" to "Barnetoget går", "13:00" to "Folketoget")
        val nextI = base.indexOfFirst { runCatching { java.time.LocalTime.parse(it.first) }.getOrNull()?.isAfter(now) == true }
        base.mapIndexed { i, (t, n) -> MaiItem41(t, n, nextI == -1 || i < nextI, i == nextI, "city") }
    }
    PCard {
        Column(Modifier.padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PLabel("Program i dag")
            items.forEach { it2 ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(it2.time, color = if (it2.next) MAI_RED41 else if (it2.past) p.mut else p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.width(48.dp))
                    Text(it2.title, color = if (it2.next) MAI_RED41 else if (it2.past) p.mut else p.ink, fontWeight = if (it2.next) FontWeight.Bold else FontWeight.Medium, fontSize = 14.5.sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (it2.kind == "calendar") Text("KALENDER", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 9.5.sp)
                }
            }
        }
    }
}

/** Konfetti i flaggfargene over hele skjermen i 3 s etter «Hipp hipp hurra!». */
@Composable
internal fun Confetti41(vm: AppViewModel) {
    val at = vm.p41.confetti
    if (at == 0L || reduceMotion31()) return
    var t by remember(at) { mutableFloatStateOf(0f) }
    LaunchedEffect(at) {
        val t0 = withFrameNanos { it }
        while (t < 3f) withFrameNanos { n -> t = (n - t0) / 1e9f }
        vm.p41.confetti = 0L
    }
    val pieces = remember(at) { List(60) { i -> floatArrayOf((i * 37 % 100) / 100f, -(i * 17 % 40) / 100f, .7f + (i % 5) * .12f, (i % 3).toFloat()) } }
    Canvas(Modifier.fillMaxSize()) {
        pieces.forEachIndexed { i, pc ->
            val y = (pc[1] + t * .45f * pc[2]) * size.height
            val x = pc[0] * size.width + kotlin.math.sin(t * 3f + i) * 14f
            val c = when (pc[3].toInt()) { 0 -> MAI_RED41; 1 -> Color.White; else -> MAI_BLUE41 }
            rotate(t * 200f * pc[2] + i * 30, Offset(x, y)) { drawRect(c.copy(alpha = (1f - (t - 2.4f).coerceAtLeast(0f) / .6f).coerceIn(0f, 1f)), Offset(x - 4 * density, y - 2.5f * density), Size(8 * density, 5 * density)) }
        }
    }
}
