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
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/*
 * Prompt 36 (ANDROID36): Glimt i drakt (claude-code-system-oppdatering-nordlys.md, fasit Mobil Papir App.dc.html → sherlock() / carp()):
 *  - Sherlock36: deerstalker-lue, rutete Inverness-kappe og forstørrelsesglass. Flyr inn i hero-kortet (shFlyM 3,6 s), leter
 *    (shBob 0,45 s, shScan 1,1 s ±20°) så lenge serveren sjekker, viser «Elementært! …» / «Aha! …» og flyr ut. Reduser bevegelse: toner inn/ut.
 *  - Carp36: vernehjelm, verktøybelte og hammer. Står på fremdriftslinja ved enden av fyllet (0,4 s), slår (cpHam 0,62 s) med spon (cpChip).
 *  - StartScreen36: «Starter opp» (Nordlys Starter.dc.html) med fremdriftsring, bane-prikker, z z z, stegliste og nedtelling.
 *  - NordHist36: TIDLIGERE VERSJONER med én åpen om gangen og «Vis flere».
 */

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

@Composable
private fun clock36(on: Boolean): Float {
    val t = remember { mutableFloatStateOf(0f) }
    if (on) LaunchedEffect(Unit) {
        val t0 = withFrameNanos { it }
        while (true) withFrameNanos { n -> t.floatValue = (n - t0) / 1_000_000_000f }
    }
    return t.floatValue
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
    var tl by remember(seq) { mutableFloatStateOf(0f) }
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
    val clock = clock36(!reduce)
    val p = tl
    val fresh = vm.p30.upd.phase == "none" || (!vm.p30.upd.available && vm.p30.upd.phase != "avail")
    val bubbleA = if (searching) 0f else kf36(p, floatArrayOf(0f, .68f, .74f, .92f, 1f), floatArrayOf(0f, 0f, 1f, 1f, 0f))
    val bob = if (reduce) 0f else (sin(clock * PI.toFloat() * 2f / .9f) * .5f + .5f) * -6f
    val scan = if (reduce) 0f else kf36(((clock % 1.1f) / 1.1f), floatArrayOf(0f, .5f, 1f), floatArrayOf(-24f, 18f, -24f))
    Box(modifier.padding(top = 70.dp, end = 62.dp).wrapContentSize(unbounded = true)) {
        Box(
            Modifier.size(S * 2.6f, S * 2f).graphicsLayer {
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
            Box(Modifier.offset(0.dp, bob.dp)) {
                SherCape36(S, Modifier.offset(ox - S * .1f, oy + S * 1.1f - S * .38f))
                GlimtFig35(hostChar35(vm.p35.set.char), S, "talk", Modifier.offset(ox, oy))
                SherHat36(S, Modifier.offset(ox - S * .025f, oy - S * .36f))
                SherGlass36(S, Modifier.offset(ox + S * .92f, oy + S * .28f).graphicsLayer { rotationZ = scan; transformOrigin = TransformOrigin(.15f, .85f) })
            }
        }
        if (bubbleA > 0f) Box(
            Modifier.offset((-150).dp + (-10).dp, (-8).dp).graphicsLayer { alpha = bubbleA; translationY = (1f - bubbleA) * 6f * density }
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
    val cyc = if (reduce) 0f else (clock % .62f) / .62f
    val ham = if (reduce) -20f else kf36(cyc, floatArrayOf(0f, .55f, .82f, 1f), floatArrayOf(-55f, -55f, 18f, -55f))
    val dip = if (reduce) 0f else kf36(cyc, floatArrayOf(0f, .7f, .82f, 1f), floatArrayOf(0f, 0f, 1f, 0f))
    BoxWithConstraints(modifier.fillMaxWidth().height(S * 1.1f + 6.dp)) {
        val w = maxWidth
        val left = (w * f).coerceIn(S * .6f, w - S * 1.1f) - S * .5f
        Box(Modifier.offset(left, 6.dp).size(S, S * 1.1f).graphicsLayer { translationY = dip * 1.5f * density; scaleY = 1f - dip * .03f; transformOrigin = TransformOrigin(.5f, 1f) }) {
            GlimtFig35(hostChar35(vm.p35.set.char), S, "idle", still = reduce)
            CarpBelt36(S, Modifier.offset(-S * .01f, S * 1.1f - S * .1f - S * .34f))
            CarpHat36(S, Modifier.offset(S * .025f, -S * .24f))
            CarpHammer36(S, Modifier.offset(S * .8f, S * .1f).graphicsLayer { rotationZ = ham; transformOrigin = TransformOrigin(.2f, .9f) })
            // Spon fra treffpunktet.
            if (!reduce && cyc > .78f) for (i in 0..2) {
                val q = ((cyc - .78f) / .22f).coerceIn(0f, 1f)
                Box(Modifier.offset(S * (1.4f + i * .05f) + ((8 + i * 7) * q).dp, S * 1.1f - 3.dp + ((-10 - i * 5) * q).dp).size(4.dp, 3.dp)
                    .graphicsLayer { alpha = 1f - q; rotationZ = 160f * q }.background(if (i == 1) Color(0xFFF2C14E) else Color(0xFFC8925A), RoundedCornerShape(1.dp)))
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
                    Box(Modifier.rotate(rot)) { WxIcon("M9 6l6 6-6 6", p.ink, 14.dp, stroke = 2.4f) }
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
    LaunchedEffect(restarting) { if (restarting) vm.startScreen36() }
    LaunchedEffect(u.phase) { if (u.phase != "run") vm.p36.startDismissed = false }
    if (vm.p36.startOn) StartScreen36(vm)
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
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    val el = ((now - s.startAt) / 1000).coerceAtLeast(0)
    val inf = rememberInfiniteTransition(label = "start36")
    val aur by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(7000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "aur")
    val orbit by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "orb")
    val float by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "flt")
    val z by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "z")
    val ring by animateFloatAsState(pct / 100f, tween(600), label = "ring36")
    val violet = Color(0xFF9864D6); val green = Color(0xFF2CBF8E); val warm = Color(0xFFD5493A)
    Box(
        Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF101A2E), Color(0xFF1B2340)), Offset.Zero, Offset(700f, 1500f)))
            .drawBehind {
                val w = size.width; val h = size.height
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
                Box(Modifier.graphicsLayer { translationY = if (reduce) 0f else -10f * float * density }) { GlimtFig35(hostChar35(vm.p35.set.char), 128.dp, mood) }
                if (phase == 0 && !reduce) for (k in 0..2) {
                    val q = ((z + k / 3f) % 1f)
                    Text("z", color = Color(0xFFFFD9C2), fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = (14 + k * 4).sp,
                        modifier = Modifier.align(Alignment.TopEnd).padding(top = 30.dp, end = 28.dp)
                            .graphicsLayer { alpha = if (q < .3f) q / .3f else 1f - (q - .3f) / .7f; translationX = 26f * q * density; translationY = -46f * q * density; scaleX = .6f + .6f * q; scaleY = .6f + .6f * q })
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
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(when { done -> "Laster inn appen …"; el > 180 -> "Det tar lengre tid enn vanlig · $el s"; else -> "Appen lastes inn automatisk når serveren svarer · $el s" },
                    color = Color.White.copy(alpha = .65f), fontFamily = PaperFonts.sans, fontSize = 13.sp, textAlign = TextAlign.Center)
                if (!done && el > 40) Text("Last inn på nytt nå", color = Color(0xFFFFD9C2), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { Haptics.tap(); vm.pollHealth36() }.padding(8.dp, 6.dp))
                if (!done && el > 180) Text("Vis logg", color = Color(0xFFFFD9C2), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { vm.closeStart36(dismiss = true); vm.openNordlys31() }.padding(8.dp, 6.dp))
            }
        }
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
