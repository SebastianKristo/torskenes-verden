package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.ZoneId

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
internal fun HomeBrief34(vm: AppViewModel) {
    val b = vm.p34.brief
    LaunchedEffect(vm.base, vm.account?.id) { vm.loadBrief34() }
    val kind = b?.kind ?: briefKind34()
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(BLUE34, Color(0xFF2E5A7F))))
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
        GlimtFigure34(56.dp)
    }
}

/* ---------------- Brief-siden (fullskjerm) ---------------- */

private data class Step34(val target: String?, val text: String, val next: String)

private fun steps34(b: Brief34): List<Step34> {
    val w = b.wx
    val n = b.next
    val today = LocalDate.now(ZoneId.of("Europe/Oslo"))
    val cap = { s: String -> s.replaceFirstChar { it.uppercase() } }
    return listOf(
        Step34(null, "Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din?", "Vis meg"),
        Step34("vaer", if (w != null) "Først været. ${cap(w.cond)}, ${w.now?.let { "$it°" } ?: ""} nå og ${w.rainSoon}. Søylene viser nedbøren time for time." else "Jeg har ikke fått været ennå.", "Neste"),
        Step34("kal", if (n != null) "I kalenderen: ${n.title} ${if (n.date == today) "i dag" else "i morgen"}" + (n.start?.let { " kl. $it" } ?: "") + ". Trykk på en avtale for å åpne Kalender." else "Kalenderen din er fri.", "Neste"),
        Step34("nyh", if (b.news.isNotEmpty()) "Og ${if (b.news.size == 3) "tre" else b.news.size.toString()} saker fra nyhetene. Trykk for å lese hele." else "Ingen nyheter akkurat nå.", "Neste"),
        Step34(null, "Det var alt for nå. Trykk på meg når du vil ha en ny runde.", "Takk, Glimt"),
    )
}

@Composable
internal fun BriefPage34(vm: AppViewModel) {
    val s = vm.p34
    val p = PaperPal.current
    val ctx = LocalContext.current
    val dens = LocalDensity.current
    BackHandler { vm.closeBrief34() }
    LaunchedEffect(Unit) {
        vm.loadBrief34()
        // Guide-runden starter automatisk første gang briefen åpnes (kan slås av nederst).
        if (vm.tourAuto34() && !vm.tourWasSeen34()) { delay(900); if (s.tour == 0) { s.tour = 1; vm.tourSeen34() } }
    }
    val b = s.brief
    val scroll = rememberScrollState()
    val pos = remember { mutableStateMapOf<String, Float>() }
    val step = if (s.tour in 1..5) s.tour - 1 else -1
    val st = b?.let { steps34(it) }
    val cur = if (step >= 0) st?.getOrNull(step) else null
    LaunchedEffect(s.tour, s.tourSeq) {
        val tg = cur?.target ?: return@LaunchedEffect
        delay(60)
        pos[tg]?.let { y -> scroll.animateScrollTo((y - with(dens) { 90.dp.toPx() }).toInt().coerceAtLeast(0)) }
    }
    val ring = { k: String -> cur?.target == k }
    val dark = Tone.paperDark
    Box(Modifier.fillMaxSize().background(if (dark) Brush.verticalGradient(listOf(p.bg, p.bg)) else Brush.verticalGradient(0f to Color(0xFFE6ECEF), .46f to p.bg))
        .clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(
            Modifier.fillMaxSize().verticalScroll(scroll).statusBarsPadding().padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 170.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val kind = b?.kind ?: briefKind34()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("GLIMT · " + briefTitle34(kind).uppercase(), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.5.sp, modifier = Modifier.weight(1f))
                Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(p.ink).clickable(role = Role.Button) { vm.closeBrief34() }.padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center) { Text("Ferdig", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(briefTitle34(kind), color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 40.sp, lineHeight = 41.sp)
                Text(b?.summary ?: if (s.briefBusy) "Glimt lager briefen …" else "Fikk ikke laget briefen.", color = if (dark) p.ink else Color(0xFF3D3A33),
                    fontFamily = PaperFonts.serif, fontSize = 17.sp, lineHeight = 24.5.sp)
            }
            if (b == null) return@Column
            // Vær (blått kort).
            b.wx?.let { w ->
                Column(
                    Modifier.fillMaxWidth().onGloballyPositioned { pos["vaer"] = it.positionInParent().y }.ring34(ring("vaer"), 24.dp)
                        .clip(RoundedCornerShape(24.dp)).background(BLUE34).padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val k = wxKind34(w.code)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        WxIcon(WX_PATH34[k] ?: WX_PATH34.getValue("delvis"), if (k == "sol") Color(0xFFFFD27A) else if (k == "regn") Color(0xFF9CC8FF) else Color(0xFFE6EEF7), 44.dp)
                        Column(Modifier.weight(1f)) {
                            Text(w.now?.let { "$it°" } ?: "–", color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 38.sp, lineHeight = 38.sp)
                            Text("${w.place} · ${w.cond}", color = Color.White.copy(alpha = .85f), fontSize = 13.sp, maxLines = 1)
                        }
                        Text("↑${w.hi ?: "–"}° ↓${w.lo ?: "–"}°", color = Color.White.copy(alpha = .9f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                    }
                    if (w.rain.isNotEmpty()) {
                        val mx = maxOf(.6, w.rain.maxOrNull() ?: 0.0)
                        Row(Modifier.fillMaxWidth().height(46.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            w.rain.forEach { r ->
                                Box(Modifier.weight(1f).fillMaxHeight((r / mx).toFloat().coerceIn(.06f, 1f)).clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                                    .background(Color.White.copy(alpha = if (r >= .2) .9f else .3f)))
                            }
                        }
                        Row(Modifier.fillMaxWidth()) {
                            listOf("nå", "nedbør neste 12 t", "+12 t").forEachIndexed { i, l ->
                                Text(l, color = Color.White.copy(alpha = .75f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp,
                                    modifier = Modifier.weight(1f), textAlign = when (i) { 0 -> androidx.compose.ui.text.style.TextAlign.Start; 1 -> androidx.compose.ui.text.style.TextAlign.Center; else -> androidx.compose.ui.text.style.TextAlign.End })
                            }
                        }
                    }
                    val notes = listOfNotNull(w.vsYesterday?.let { "Sammenlignet med i går" to it }, w.sunset?.let { "Solnedgang" to "Sola går ned $it" })
                    if (notes.isNotEmpty()) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .18f)))
                        notes.forEach { (k2, v) ->
                            Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                Text(k2, color = Color.White.copy(alpha = .75f), fontSize = 12.sp)
                                Text(v, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }
            // Kalender.
            Column(
                Modifier.fillMaxWidth().onGloballyPositioned { pos["kal"] = it.positionInParent().y }.ring34(ring("kal"), 24.dp)
                    .clip(RoundedCornerShape(24.dp)).background(p.card).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("Kalender", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp, modifier = Modifier.weight(1f))
                    Text(b.nextLabel(), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                }
                if (b.events.isEmpty()) Text("Ingenting i dag eller i morgen.", color = p.mut, fontSize = 13.5.sp)
                val today = LocalDate.now(ZoneId.of("Europe/Oslo"))
                b.events.forEach { e ->
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().height(IntrinsicSize.Min).clickable(role = Role.Button) { Haptics.tap(); if (!vm.openKalApp33(e.id, e.date)) vm.openKal26(e.id) }.padding(vertical = 9.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(Modifier.width(46.dp)) {
                            Text(e.start ?: "Hele", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp)
                            Text(if (e.date == today) "i dag" else if (e.date == today.plusDays(1)) "i morgen" else e.date.dayOfMonth.toString() + ".", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                        }
                        Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(e.color?.let { Color(it) } ?: RED34))
                        Column(Modifier.weight(1f)) {
                            Text(e.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            e.loc?.let { Text(it, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        }
                    }
                }
            }
            // Nyheter.
            Column(
                Modifier.fillMaxWidth().onGloballyPositioned { pos["nyh"] = it.positionInParent().y }.ring34(ring("nyh"), 24.dp)
                    .clip(RoundedCornerShape(24.dp)).background(p.card).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Nyheter", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp)
                if (b.news.isEmpty()) Text("Ingen saker ennå. Legg til kilder i Nyhetsleser.", color = p.mut, fontSize = 13.5.sp)
                b.news.forEach { n ->
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(Modifier.fillMaxWidth().clickable(role = Role.Button, enabled = n.url != null) { n.url?.let { openLink(ctx, it) } }.padding(vertical = 9.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(n.src.take(4).uppercase(), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, modifier = Modifier.width(34.dp))
                        Text(n.title, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 15.5.sp, lineHeight = 20.sp, modifier = Modifier.weight(1f))
                        n.time?.let { Text(it, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp) }
                    }
                }
            }
            Text("Laget av Glimt ${b.generatedAt ?: ""} · Vær: MET / Open-Meteo · Nyheter: ${b.news.map { it.src }.distinct().filter { it.isNotBlank() }.ifEmpty { listOf("NRK", "VG", "E24") }.joinToString(", ")}",
                color = p.mut, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            b.note?.let { Text(it, color = p.mut, fontSize = 11.5.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
            PCard {
                var auto by remember { mutableStateOf(vm.tourAuto34()) }
                var notify by remember { mutableStateOf(vm.briefNotify34()) }
                PToggle("Guide-runde første gang", "Glimt viser deg briefen når du åpner den", auto) { auto = it; vm.setTourAuto34(it) }
                PToggle("Varsel «Morgenbrief er klar»", "Kl. 06:30, sammen med widgetene", notify, top = true) { notify = it; vm.setBriefNotify34(it) }
            }
        }
        // Figuren og boblen nederst til høyre.
        Row(
            Modifier.align(Alignment.BottomEnd).fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
            verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
        ) {
            AnimatedVisibility(cur != null, Modifier.weight(1f, fill = false), enter = fadeIn(tween(280)) + slideInVertically(tween(280)) { it / 6 }, exit = fadeOut(tween(160))) {
                var last by remember { mutableStateOf(cur) }
                if (cur != null) last = cur
                val c = last ?: return@AnimatedVisibility
                Column(
                    Modifier.widthIn(max = 280.dp).clip(RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp)).background(INK34).padding(14.dp, 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(c.text, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 20.sp)
                    Row(Modifier.align(Alignment.End), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (step in 1..3) Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).clickable(role = Role.Button) { Haptics.select(); s.tour = 99 }.padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center) { Text("Hopp over", color = Color(0xFFC9C1B1), fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                        Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { vm.tourNext34() }.padding(horizontal = 14.dp),
                            contentAlignment = Alignment.Center) { Text(c.next, color = INK34, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1) }
                    }
                }
            }
            Box(Modifier.clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Glimt") { vm.tourTap34() }) {
                GlimtFigure34(76.dp, if (cur != null) "talk" else "idle", if (cur?.target != null) -8f else 0f)
            }
        }
    }
}

/** Pulserende rød ring rundt kortet Glimt peker på (gbRing 1,3 s). */
private fun Modifier.ring34(on: Boolean, radius: Dp): Modifier = if (!on) this else this.ringAnim34(radius)

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
        val r = radius.toPx()
        val g = 14.dp.toPx() * v
        drawRoundRect(RED34.copy(alpha = .45f * (1f - v)), Offset(-g, -g), Size(size.width + 2 * g, size.height + 2 * g), CornerRadius(r + g, r + g), style = Stroke(5.dp.toPx() * (1f - v) + 1f))
        drawRoundRect(RED34, Offset(1.dp.toPx(), 1.dp.toPx()), Size(size.width - 2.dp.toPx(), size.height - 2.dp.toPx()), CornerRadius(r, r), style = Stroke(2.dp.toPx()))
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
