package no.kristo.finanshub.ui

import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.AiJob31
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.applyAns33
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.boldParts31
import no.kristo.finanshub.cancelAiJob31
import no.kristo.finanshub.closeAns31
import no.kristo.finanshub.quickJob31
import no.kristo.finanshub.retryHome34
import no.kristo.finanshub.openWeatherGeo35
import no.kristo.finanshub.confirmAgent45
import no.kristo.finanshub.cancelAgent45

/*
 * Prompt 31 (ANDROID31): Glimt-merket (Glimt AI.dc.html: Klar, Tenker, Svarer, Ferdig), toasten med glassboblen
 * (aiToastEl() i Mobil Papir App.dc.html), svarboblen under søkefeltet (hsAsk()), banneret banneret ved retur (fjernet i prompt 45)
 * og søkemotor-logoene (vector drawables search_google / search_duckduckgo, farger beholdes).
 */

const val GLIMT_KLAR = 0
const val GLIMT_TENKER = 1
const val GLIMT_SVARER = 2
const val GLIMT_FERDIG = 3

private val RING31 = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFF7A5AD6), Color(0xFF3FBF9A), Color(0xFFB23A2A))
private val DONE31 = Color(0xFF3FBF9A)
private const val STAR31 = "M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5h-0c-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z"
private const val CHECK31 = "M5 12.5l4.5 4.5L19 7"

/** «Reduser bevegelse» / animasjoner av i systemet: bare langsom puls, ingen rotasjon. */
@Composable
internal fun reduceMotion31(): Boolean {
    val ctx = LocalContext.current
    return remember { runCatching { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false) }
}

/**
 * Glimt-merket: ring med konisk gradient (strek ≈ 6 %), 4-spisset stjerne (#ffb38a → #ff5a3c) og to små glimt.
 * Klar: ringen 6 s, stjernen puster 3,2 s. Tenker: 1,4 s, puls + 45° vridning 1,2 s. Svarer: 2,6 s, puls 2 s.
 * Ferdig: grønn ring som står stille, haken spretter inn (.4 → 1.12 → 1, 450 ms). Over 60 dp: myk glød bak.
 */
@Composable
internal fun GlimtMark31(size: Dp, state: Int = GLIMT_TENKER, dark: Boolean = false, modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    val inf = rememberInfiniteTransition(label = "glimt31")
    val spinMs = when (state) { GLIMT_KLAR -> 6000; GLIMT_TENKER -> 1400; else -> 2600 }
    val rot by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(spinMs, easing = LinearEasing)), label = "rot")
    val pulseMs = when { reduce -> 3200; state == GLIMT_KLAR -> 3200; state == GLIMT_TENKER -> 1200; else -> 2000 }
    val pulse by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(pulseMs / 2, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse")
    val tw1 by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse, StartOffset(200)), label = "tw1")
    val tw2 by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse, StartOffset(800)), label = "tw2")
    val pop = remember { Animatable(1f) }
    LaunchedEffect(state) {
        if (state == GLIMT_FERDIG) {
            pop.snapTo(.4f)
            pop.animateTo(1f, keyframes { durationMillis = 450; 1.12f at 315 })
            Haptics.select()
        }
    }
    val star = remember { PathParser().parsePathString(STAR31).toPath() }
    val check = remember { PathParser().parsePathString(CHECK31).toPath() }
    val done = state == GLIMT_FERDIG
    Canvas(modifier.size(size).semantics { contentDescription = when (state) { GLIMT_KLAR -> "Glimt er klar"; GLIMT_FERDIG -> "Glimt er ferdig"; else -> "Glimt jobber" } }) {
        val s = this.size.minDimension
        val c = Offset(s / 2, s / 2)
        if (s > 60.dp.toPx()) {
            val g = if (done) Brush.radialGradient(listOf(DONE31.copy(alpha = .45f), Color.Transparent), c, s * .85f)
            else Brush.radialGradient(listOf(Color(0xFFE8794A).copy(alpha = .4f), Color(0xFF7A5AD6).copy(alpha = .18f), Color.Transparent), c, s * .85f)
            val k = if (reduce) 1f else .9f + .2f * pulse
            scale(k, k, c) { drawCircle(g, s * .85f, c, alpha = if (state == GLIMT_TENKER || state == GLIMT_SVARER) .35f + .35f * pulse else .5f) }
        }
        val bw = maxOf(2.dp.toPx(), s * .06f)
        val r = s / 2 - bw / 2
        if (done) drawCircle(DONE31, r, c, style = Stroke(bw))
        else rotate(if (reduce) 0f else rot, c) { drawCircle(Brush.sweepGradient(RING31, c), r, c, style = Stroke(bw)) }
        if (done) {
            val k = s * .46f / 24f * pop.value
            translate(c.x - 12f * k, c.y - 12f * k) { scale(k, k, Offset.Zero) { drawPath(check, DONE31, style = Stroke(3f, cap = StrokeCap.Round, join = StrokeJoin.Round)) } }
        } else {
            val (sc, ang) = when {
                reduce -> (.92f + .08f * pulse) to 0f
                state == GLIMT_KLAR -> (.92f + .08f * pulse) to 0f
                else -> (.8f + .26f * pulse) to 45f * pulse
            }
            val k = s * .58f / 24f * sc
            rotate(ang, c) {
                translate(c.x - 12f * k, c.y - 12f * k) {
                    scale(k, k, Offset.Zero) { drawPath(star, Brush.linearGradient(listOf(Color(0xFFFFB38A), Color(0xFFFF5A3C)), Offset.Zero, Offset(24f, 24f))) }
                }
            }
            val a1 = if (reduce) .8f else tw1
            val a2 = if (reduce) .8f else tw2
            drawCircle(if (dark) Color.White else Color(0xFFFFD9C2), s * .08f * (.3f + .7f * a1), Offset(s * .94f, s * .06f), alpha = a1)
            drawCircle(Color(0xFFFFD9C2), s * .05f * (.3f + .7f * a2), Offset(s * .01f, s * .93f), alpha = a2)
        }
    }
}

/** Tre hoppende prikker (toasten). */
@Composable
internal fun GlimtDots31(color: Color) {
    val inf = rememberInfiniteTransition(label = "dots31")
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        for (i in 0 until 3) {
            val v by inf.animateFloat(0f, 1f, infiniteRepeatable(keyframes { durationMillis = 1200; 0f at 0; 1f at 480; 0f at 960 }, initialStartOffset = StartOffset(i * 150)), label = "d$i")
            Box(Modifier.offset(y = (-3 * v).dp).size(4.dp).alpha(.25f + .75f * v).clip(CircleShape).background(color))
        }
    }
}

/* ======================= Søkemotor-logoer ======================= */

/** Glimt (merket), Google (ekte firefarget G) og DuckDuckGo (anda) – vector drawables, ikke farget med tint. */
@Composable
internal fun EngineLogo31(engine: String, size: Dp, busy: Boolean = false) {
    when (engine) {
        "google" -> Image(painterResource(no.kristo.finanshub.R.drawable.search_google), "Google", Modifier.size(size))
        "ddg" -> Image(painterResource(no.kristo.finanshub.R.drawable.search_duckduckgo), "DuckDuckGo", Modifier.size(size))
        else -> GlimtMark31(size, if (busy) GLIMT_TENKER else GLIMT_KLAR)
    }
}

/* ======================= Toast og glassboble ======================= */

/** Jobbene som vises: Glimt-jobber fra realtime + raske timer i køen (med anslåtte steg når serveren ikke sender egne). */
@Composable
private fun aiJobs31(vm: AppViewModel): List<AiJob31> {
    // Jobber uten livstegn på fem minutter vises ikke lenger (tapt «done»-hendelse).
    // Prompt 36: aldri både pille og kort – spørsmålet som tenker i kortet under søkefeltet vises ikke i pillen.
    val inline = vm.p31.ans
    val live = vm.p31.jobs.filter { System.currentTimeMillis() - it.t0 < 300_000L }
        .filter { j -> j.kind != "assist" || inline == null || !(j.id == inline.jobId || (inline.busy && (j.input.isBlank() || j.input.trim() == inline.q.trim()))) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val t0s = remember { HashMap<String, Long>() }
    val quick = vm.q29.jobs.filter { q -> live.none { it.id == q.id } }
    if (quick.isNotEmpty() || live.isNotEmpty()) LaunchedEffect(quick.size, live.size) { while (true) { delay(250); now = System.currentTimeMillis() } }
    return live + quick.map { j -> quickJob31(j, t0s.getOrPut(j.id) { now }, now) }
}

/**
 * Toasten øverst (54 dp under statuslinja): mørk pille med Glimt-merket, teksten og ▾. Trykk → glassboblen (340 dp, radius 28)
 * vokser ut fra pillen med lett overshoot, med tittel, modell, prosent, det brukeren skrev, stegene, det Glimt har funnet og
 * Avbryt / Skjul. Trykk hvor som helst på boblen skjuler den; jobben fortsetter.
 */
@Composable
internal fun AiToast31(vm: AppViewModel, modifier: Modifier = Modifier) {
    val s = vm.p31
    val jobs = aiJobs31(vm)
    val j = jobs.lastOrNull()
    val msg = s.toastMsg
    if (msg != null) LaunchedEffect(s.toastSeq) { delay(2200); s.toastMsg = null }
    LaunchedEffect(j == null) { if (j == null) s.bubble = false }
    if (s.bubble && j != null) BackHandler { s.bubble = false }
    Box(modifier.fillMaxWidth().statusBarsPadding().padding(top = 54.dp, start = 16.dp, end = 16.dp), contentAlignment = Alignment.TopCenter) {
        AnimatedVisibility(j != null && !s.bubble, enter = fadeIn(tween(280)) + slideInVertically(tween(280)) { -it }, exit = fadeOut(tween(150))) {
            var last by remember { mutableStateOf(j) }
            if (j != null) last = j
            last?.let { x -> ToastPill31(x.title + (if (jobs.size > 1) " (${jobs.size})" else "") + " …", true) { Haptics.tap(); s.bubble = true } }
        }
        AnimatedVisibility(j == null && msg != null, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
            var last by remember { mutableStateOf(msg) }
            if (msg != null) last = msg
            ToastPill31(last ?: "", false) {}
        }
        if (s.bubble && j != null) Bubble31(vm, j)
    }
}

@Composable
private fun ToastPill31(text: String, working: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.heightIn(min = 42.dp).shadow(16.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
            .clip(CircleShape).background(Color(0xEB1B1A17)).border(1.dp, Color.White.copy(alpha = .06f), CircleShape)
            .clickable(enabled = working, role = Role.Button, onClickLabel = "Se hva Glimt gjør") { onClick() }
            .padding(start = 10.dp, end = 18.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (working) GlimtMark31(24.dp, GLIMT_TENKER, dark = true)
        Text(text, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 250.dp))
        if (working) {
            GlimtDots31(Color(0xFFF3EFE6))
            WxIcon("M6 9l6 6 6-6", Color(0xFFF3EFE6).copy(alpha = .6f), 12.dp, stroke = 2.6f)
        }
    }
}

@Composable
private fun Bubble31(vm: AppViewModel, j: AiJob31) {
    val s = vm.p31
    val grow = remember { Animatable(.6f) }
    LaunchedEffect(Unit) { grow.animateTo(1f, spring(dampingRatio = .62f, stiffness = 420f)) }
    val ink = Color(0xFF1B1A17)
    val mut = Color(0xFF6B6558)
    val pct = j.progress ?: run {
        val n = j.steps.size
        if (n == 0) 0 else j.steps.count { it.state == "done" } * 100 / n
    }
    val pctA by animateFloatAsState(pct.toFloat(), tween(300), label = "pct31")
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 340.dp).fillMaxWidth().scale(grow.value).alpha(((grow.value - .6f) / .4f).coerceIn(0f, 1f))
                .shadow(28.dp, RoundedCornerShape(28.dp), ambientColor = Color.Black.copy(alpha = .45f), spotColor = Color.Black.copy(alpha = .45f))
                .clip(RoundedCornerShape(28.dp)).background(Color(0xF5FAF8F3))
                .border(1.dp, Color.White.copy(alpha = .6f), RoundedCornerShape(28.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { s.bubble = false; Haptics.dismiss() }
                .padding(start = 16.dp, top = 14.dp, end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlimtMark31(28.dp, GLIMT_TENKER)
                Column(Modifier.weight(1f)) {
                    Text(j.title, color = ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(j.model.replace("System-AI", "Glimt"), color = mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, maxLines = 1)
                }
                Text("${Math.round(pctA)} %", color = mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            }
            if (j.input.isNotBlank()) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(ink.copy(alpha = .06f)).padding(12.dp, 8.dp)) {
                Text("«${j.input}»", color = Color(0xFF3D3A33), fontFamily = PaperFonts.sans, fontStyle = FontStyle.Italic, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            if (j.steps.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(7.dp)) { j.steps.forEach { st -> Step31(st.label, st.state) } }
            if (j.fields.isNotEmpty()) Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .55f)).padding(12.dp, 10.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                j.fields.forEach { (k, v) ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(k, color = Color(0xFF8F897C), fontFamily = PaperFonts.sans, fontSize = 12.sp, modifier = Modifier.width(64.dp))
                        Text(v, color = ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.weight(1f).height(38.dp).clip(CircleShape).background(ink.copy(alpha = .08f)).clickable(role = Role.Button) { vm.cancelAiJob31(j) },
                    contentAlignment = Alignment.Center,
                ) { Text("Avbryt", color = ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                Box(
                    Modifier.weight(1f).height(38.dp).clip(CircleShape).background(ink).clickable(role = Role.Button) { s.bubble = false; Haptics.dismiss() },
                    contentAlignment = Alignment.Center,
                ) { Text("Skjul", color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            }
        }
    }
}

/** ✓ grønn (ferdig) · rød pulserende ring (pågår, fet + «…») · grå ring (venter). */
@Composable
private fun Step31(label: String, state: String) {
    val act = state == "active"
    val done = state == "done"
    val inf = rememberInfiniteTransition(label = "step31")
    val p by inf.animateFloat(.85f, 1.08f, infiniteRepeatable(tween(600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "sp")
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier.size(18.dp).scale(if (act) p else 1f).clip(CircleShape)
                .then(if (done) Modifier.background(Color(0xFF2F7D4F)) else Modifier.border(if (act) 2.dp else 1.5.dp, if (act) Color(0xFFB23A2A) else Color(0xFFC9C1B1), CircleShape)),
            contentAlignment = Alignment.Center,
        ) { if (done) WxIcon(CHECK31, Color.White, 10.dp, stroke = 3.6f) }
        Text(label + if (act) " …" else "", color = if (done || act) Color(0xFF1B1A17) else Color(0xFFA39C8E), fontFamily = PaperFonts.sans,
            fontWeight = if (act) FontWeight.Bold else FontWeight.Medium, fontSize = 13.5.sp)
    }
}

/* ======================= Svarboblen under søkefeltet ======================= */

/**
 * Mørk glassboble (radius 26, innerkant 10 % hvit): mens Glimt tenker: merket + «Tenker på «…» …». Svaret 17 sp med det viktigste
 * fet og hvitt, kilde («✦ Open-Meteo · MET Norway» / «✦ Glimt») og «Fortsett i Chat ›». Prompt 38: lukkes med ✕, sveip opp eller trykk utenfor.
 */
@Composable
internal fun HomeAnswer31(vm: AppViewModel) {
    val a = vm.p31.ans ?: return
    val light = Color(0xFFF6F2EA)
    // Prompt 38: trykk i boblen lukker den ikke lenger. ✕, sveip opp (> 40 dp) eller trykk utenfor (AnsScrim38) lukker (ui/Ui38.kt).
    // Prompt 41: dra pillen ned → åpne i Chat med spørsmålet (samme som «Fortsett i Chat ›»).
    AnsBox38(vm, onPull41 = { vm.growToChat41(a.q) }) {
    Column(
        Modifier.fillMaxWidth().shadow(22.dp, RoundedCornerShape(26.dp), ambientColor = Color.Black.copy(alpha = .6f), spotColor = Color.Black.copy(alpha = .6f))
            .clip(RoundedCornerShape(26.dp)).background(Color(0xF0161412)).border(1.dp, Color.White.copy(alpha = .1f), RoundedCornerShape(26.dp))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
            .padding(start = 18.dp, top = 16.dp, end = 46.dp, bottom = 18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (a.busy) Row(Modifier.heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlimtMark31(26.dp, GLIMT_TENKER, dark = true)
            Text("Tenker på «${a.q}» …", color = light.copy(alpha = .75f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp)
        } else {
            Text(
                buildAnnotatedString {
                    boldParts31(a.text).forEach { (t, b) -> if (b) withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold, color = Color.White)) { append(t) } else append(t) }
                },
                color = light, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium, fontSize = 17.sp, lineHeight = 24.sp,
            )
            // Prompt 33: «Endre N avtaler ›» etter «husk at Påhåret er frisøren min».
            if (a.applyId > 0 && a.applyCount > 0) Box(
                Modifier.height(32.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f))
                    .clickable(role = Role.Button) { Haptics.select(); vm.applyAns33() }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Endre ${a.applyCount} ${if (a.applyCount == 1) "avtale" else "avtaler"} ›", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }
            // Prompt 45: Glimt-agenten ber om bekreftelse før viktige/destruktive handlinger (POST /api/glimt/agent/confirm).
            vm.p45.agentConfirm?.let { (_, summary) ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.height(34.dp).clip(CircleShape).background(Color.White).clickable(role = Role.Button, onClickLabel = summary) { vm.confirmAgent45() }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(summary, color = Color(0xFF161412), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    Box(
                        Modifier.height(34.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f)).clickable(role = Role.Button) { Haptics.select(); vm.cancelAgent45() }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("Avbryt", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
                }
            }
            // Prompt 34: Glimt svarte ikke → Prøv igjen og Åpne AI-kontroll.
            if (a.err) AiErrActions34(vm, Color.White, Color.White.copy(alpha = .14f)) { vm.retryHome34() }
            // Prompt 35: «været i New York» → trykk åpner Vær for stedet.
            a.wxGeo?.let { geo -> WxOpen35(geo) { vm.openWeatherGeo35(geo) } }
            // Prompt 37: «hvor er Ingrid» → Vis på kart ›.
            a.famPerson37?.let { who -> WhereOpen37(vm, who) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("✦ " + a.source.replace("System-AI", "Glimt").ifBlank { "Glimt" }, color = light.copy(alpha = .55f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold,
                    fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Box(
                    Modifier.height(32.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f))
                        .clickable(role = Role.Button) { Haptics.select(); vm.growToChat41(a.q) }.padding(horizontal = 14.dp), // prompt 41: samme animasjon
                    contentAlignment = Alignment.Center,
                ) { Text("Fortsett i Chat ›", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }
            }
        }
    }
    }
}

/* Prompt 45: banneret ved retur (AwayBanner31) er fjernet – Glimt-svar mens appen var lukket kommer bare som systemvarsel. */
