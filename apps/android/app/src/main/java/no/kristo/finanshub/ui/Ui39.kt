package no.kristo.finanshub.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToInt

/*
 * Prompt 39 (ANDROID39): sveip bort (Brief og Bibelvers), modellknappen i Chat, initialer uten profilbilde,
 * «Vis svaret i appen også» og volumvalget for varsellyden.
 */

/* ======================= Profilbilde: initialer ======================= */

internal val AV39_BG = Color(0xFF2B5D8A)

/** «Sebastian Kristoffersen» → «SK», «sebastian» → «S». */
internal fun initials39(name: String): String {
    val w = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    val s = w.take(2).mapNotNull { x -> x.firstOrNull { it.isLetterOrDigit() }?.uppercase() }.joinToString("")
    return s.ifEmpty { "•" }
}

/* ======================= Sveip bort: myk og elegant ======================= */

/** Rett etter et sveip: kortene under glir opp (animateItem i pageGridSecs) i 1,5 s, ellers ingen plasseringsanimasjon. */
internal object Swipe39 {
    var active by mutableStateOf(false)
    private val h = android.os.Handler(android.os.Looper.getMainLooper())
    fun pulse() { active = true; h.removeCallbacksAndMessages(null); h.postDelayed({ active = false }, 1500) }
}

private val FLY39 = CubicBezierEasing(.2f, .6f, .3f, 1f)
private val COLLAPSE39 = CubicBezierEasing(.3f, 0f, .15f, 1f)
private const val GREEN39 = 0xFF2F7A4F
private const val INK39 = 0xFF1B1A17
private const val PAPER39 = 0xFFF3EFE6

/**
 * Felles sveip mot høyre (claude-code-sveip-bort-smooth.md, fasit design/swipe-dismiss.js).
 *
 * Hvorfor det hakket før (SwipeBrief36 / SwipeAway37): off.value ble lest i komposisjonen, så hver fingerbevegelse
 * komponerte hele kortet og bakgrunnen på nytt; hver bevegelse startet en ny korutine (scope.launch { snapTo }); farten var
 * et snitt fra start (ikke siste 90 ms); utflyging hadde fast varighet; kollapsen (shrinkVertically fra AnimatedVisibility)
 * startet først etter en pause og mellomrommet i lista hoppet når kortet ble fjernet; i tillegg kom hint-animasjonen av seg selv.
 *
 * Nå: posisjonen ligger i en float-state som bare leses i graphicsLayer/layout (ingen rekomponering under draget), retningslås
 * etter 6 dp (|dx| > |dy| · 1,15 og dx > 0), gummistrikk mot venstre (−|dx|^0,7), terskel 38 % eller fart > 0,55 px/ms
 * (VelocityTracker) og dx > 36 px, fjær tilbake (0,72 / 380), fly ut med fartsstyrt varighet (170–320 ms), 260 ms pause,
 * så kollaps med målt høyde → 0 på 300 ms. Etiketter og grønn bakgrunn byttes med opacity. Ingen hint.
 */
@Composable
internal fun SwipeDismiss39(
    enabled: Boolean,
    radius: Dp,
    idle: String,
    armed: String,
    done: String,
    sub: String,
    onGone: () -> Unit,
    onTap: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val x = remember { mutableFloatStateOf(0f) }
    val fold = remember { mutableFloatStateOf(1f) }
    // 0 hviler, 1 drar, 2 flyr ut / ferdig, 3 kollapser, 4 borte
    val phase = remember { mutableIntStateOf(0) }
    val w = remember { floatArrayOf(1f) }
    val job = remember { arrayOfNulls<Job>(1) }
    val lastDrag = remember { longArrayOf(0L) }
    val scope = rememberCoroutineScope()
    val goneCb by rememberUpdatedState(onGone)
    val tapCb by rememberUpdatedState(onTap)
    val dens = LocalContext.current.resources.displayMetrics.density
    if (phase.intValue == 4) return
    val shape = RoundedCornerShape(radius)

    fun springBack(v: Float) {
        job[0]?.cancel()
        job[0] = scope.launch {
            animate(x.floatValue, 0f, initialVelocity = v * 1000f, animationSpec = spring(dampingRatio = .72f, stiffness = 380f)) { value, _ -> x.floatValue = value }
            if (phase.intValue == 1) phase.intValue = 0
        }
    }

    fun dismiss(v: Float) {
        job[0]?.cancel()
        phase.intValue = 2
        Haptics.success()
        job[0] = scope.launch {
            val from = x.floatValue
            val to = w[0] * 1.15f
            val dur = ((to - from) / v.coerceAtLeast(1.2f)).roundToInt().coerceIn(170, 320)
            animate(from, to, animationSpec = tween(dur, easing = FLY39)) { value, _ -> x.floatValue = value }
            delay(260)
            Swipe39.pulse()
            phase.intValue = 3
            animate(1f, 0f, animationSpec = tween(300, easing = COLLAPSE39)) { value, _ -> fold.floatValue = value }
            phase.intValue = 4
            goneCb()
        }
    }

    Box(
        Modifier.fillMaxWidth()
            .onSizeChanged { w[0] = it.width.toFloat().coerceAtLeast(1f) }
            // Kollaps med målt høyde: bare layout-fasen leser fold (ingen rekomponering).
            .layout { m, c ->
                val p = m.measure(c)
                val f = fold.floatValue
                val h = if (f >= 1f) p.height else (p.height * f).roundToInt()
                layout(p.width, h) { p.placeRelative(0, 0) }
            }
            .graphicsLayer {
                val f = fold.floatValue
                if (f < 1f) { alpha = f; clip = true }
            },
    ) {
        if (phase.intValue > 0) {
            // Bakgrunnslaget: mørkt → grønt over terskelen, med opacity (ikke ny tekst midt i gesten).
            Box(Modifier.matchParentSize().graphicsLayer {
                val pr = (x.floatValue / (w[0] * .38f)).coerceIn(0f, 1f)
                alpha = if (phase.intValue >= 2) 1f else (x.floatValue / (12f * dens)).coerceIn(0f, 1f) * (.35f + .65f * pr)
            }.clip(shape).background(Color(INK39)))
            Box(Modifier.matchParentSize().graphicsLayer {
                val pr = x.floatValue / (w[0] * .38f)
                alpha = if (phase.intValue >= 2) 1f else ((pr - .88f) / .12f).coerceIn(0f, 1f)
            }.clip(shape).background(Color(GREEN39)))
            Row(Modifier.matchParentSize().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(30.dp).graphicsLayer {
                    val pr = (x.floatValue / (w[0] * .38f)).coerceIn(0f, 1f)
                    val k = if (phase.intValue >= 2) 1.1f else .72f + pr * .33f
                    scaleX = k; scaleY = k
                }.clip(CircleShape).background(Color.White.copy(alpha = .14f)), contentAlignment = Alignment.Center) {
                    WxIcon("M5 12.5l4.5 4.5L19 7.5", Color(PAPER39), 15.dp, stroke = 2.8f)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Box {
                        val pr = { (x.floatValue / (w[0] * .38f)).coerceIn(0f, 1.2f) }
                        if (phase.intValue >= 2) SwLabel39(done) { 1f }
                        else {
                            SwLabel39(idle) { 1f - ((pr() - .88f) / .12f).coerceIn(0f, 1f) }
                            SwLabel39(armed) { ((pr() - .88f) / .12f).coerceIn(0f, 1f) }
                        }
                    }
                    Text(sub, color = Color(PAPER39).copy(alpha = .7f), fontFamily = PaperFonts.sans, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Box(
            Modifier.fillMaxWidth()
                .graphicsLayer {
                    val v = x.floatValue
                    translationX = v
                    rotationZ = (v / w[0]) * 4f
                }
                .pointerInput(enabled) {
                    val slop = 6.dp.toPx()
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        if (phase.intValue >= 2) return@awaitEachGesture
                        // Fingeren tar kortet midt i fjæra: fortsetter derfra uten hopp.
                        val wasMoving = job[0]?.isActive == true
                        job[0]?.cancel()
                        val start = x.floatValue
                        val vt = VelocityTracker()
                        vt.addPosition(down.uptimeMillis, down.position)
                        var lock: Char? = if (wasMoving && start != 0f && enabled) 'x' else null
                        var passed = start >= w[0] * .38f
                        while (true) {
                            val ev = awaitPointerEvent(PointerEventPass.Initial)
                            val ch = ev.changes.firstOrNull { it.id == down.id }
                            if (ch == null) { if (lock == 'x' || x.floatValue != 0f) springBack(0f); break }
                            vt.addPosition(ch.uptimeMillis, ch.position)
                            val rdx = ch.position.x - down.position.x
                            val rdy = ch.position.y - down.position.y
                            if (lock == null && (abs(rdx) > slop || abs(rdy) > slop)) lock = if (enabled && abs(rdx) > abs(rdy) * 1.15f && rdx > 0) 'x' else 'y'
                            if (lock == 'y') { if (x.floatValue != 0f) springBack(0f); break }
                            if (!ch.pressed) {
                                if (lock == 'x') {
                                    ch.consume()
                                    lastDrag[0] = System.currentTimeMillis()
                                    val v = vt.calculateVelocity().x / 1000f
                                    val cur = x.floatValue
                                    if (cur >= w[0] * .38f || (v > .55f && cur > 36f * dens)) dismiss(v) else springBack(v)
                                } else if (lock == null && System.currentTimeMillis() - lastDrag[0] > 350) tapCb?.invoke()
                                break
                            }
                            if (lock == 'x') {
                                ch.consume()
                                if (phase.intValue == 0) phase.intValue = 1
                                val dx = start + rdx
                                x.floatValue = if (dx >= 0f) dx else -(abs(dx).pow(.7f))
                                val over = x.floatValue >= w[0] * .38f
                                if (over != passed) { passed = over; if (over) Haptics.select() }
                            }
                        }
                    }
                },
        ) { content() }
    }
}

/** Etikett i bakgrunnslaget; alpha leses i graphicsLayer (ingen rekomponering under draget). */
@Composable
private fun SwLabel39(t: String, a: () -> Float) {
    Text(t, color = Color(PAPER39), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1,
        modifier = Modifier.graphicsLayer { alpha = a() })
}

/* ======================= Chat: modellknappen ======================= */

/** ‹ · ☰ · [Modellnavn] [LOKAL/SKY] ▾ – minst 112 dp, navnet forkortes med «…», «· laster …» / rød prikk. */
@Composable
internal fun ChatModelPill39(vm: AppViewModel, v: ChatV27) {
    LaunchedEffect(Unit) { vm.loadChatRoute39() }
    val s = vm.chat27
    val m = vm.chatModelShow39()
    val label = m?.label ?: if (s.unavailable) "Ikke satt opp" else "Velg modell"
    Row(
        Modifier.widthIn(min = 112.dp).height(40.dp).clip(CircleShape).press24 { s.sheet = "model" }.padding(horizontal = 12.dp)
            .semantics { contentDescription = "Valgt modell: $label" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(label, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 16.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        if (m != null) {
            if (m.state == "laster") Text("laster …", color = v.mut, fontFamily = v.sans, fontSize = 12.sp, maxLines = 1)
            Ch27Badge(m.sky)
            if (m.state == "feil") Box(Modifier.size(7.dp).clip(CircleShape).background(Color(0xFFB23A2A)))
        }
        Text("▼", color = v.mut, fontSize = 11.sp)
    }
}

/** Under meldingsfeltet: «Svarer med Gemma 4 · lokal» (sky: hvor meldingen sendes). Trykk = modellvelgeren. */
@Composable
internal fun ChatAnswersWith39(vm: AppViewModel, v: ChatV27, m: ChatModel27?, modifier: Modifier) {
    val sh = vm.chatModelShow39() ?: return
    val where = if (sh.sky) "sky · sendes til ${if (m?.provider == "groq" || sh.label.contains("groq", true)) "Groq" else "Google"}" else "lokal"
    Text("Svarer med ${sh.label} · $where", color = v.mut, fontFamily = v.sans, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { vm.chat27.sheet = "model" }.padding(horizontal = 8.dp, vertical = 2.dp))
}

/* ======================= Varsler ======================= */

/** Rett under «AI-svar i bakgrunnen»: banneret når du kommer tilbake (n_ai_in, standard på). */
@Composable
internal fun AiInToggle39(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { vm.loadAiIn39() }
    val on = vm.notifyPrefs.on && vm.p31.aiBg
    PToggle("Vis svaret i appen også", "Banner øverst når du kommer tilbake til appen", vm.p39.aiIn && on, top = true) { if (on) vm.setAiIn39(it) }
}

/** Volum for varsellyden: 20 / 35 / 50 / 70 / 100 %. Trykk spiller lyden med en gang. */
@Composable
internal fun VolumeChips39(vm: AppViewModel, n: NotifyPrefs) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Column(Modifier.padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Volum", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Sound39.VOLUMES.forEach { v ->
                val on = n.volume == v
                Box(
                    Modifier.weight(1f).height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (on) p.ink else Color.Transparent)
                        .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(17.dp))
                        .clickable(role = Role.Button) { vm.saveNotify(n.copy(volume = v)); Notify.preview(ctx, n.sound, v) },
                    contentAlignment = Alignment.Center,
                ) { Text("$v %", color = if (on) p.bg else p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
            }
        }
        Text(Sound39.DAMP_NOTE, color = p.mut, fontSize = 11.5.sp)
    }
}

/* ======================= Kvitteringer: «✦ På nytt» med fremdrift ======================= */

private const val RED39 = 0xFFB23A2A
private const val OK39 = 0xFF2F7A4F

/** Tynn rød linje under en lukket rad mens den leses på nytt. */
@Composable
internal fun ReLine39(pct: Int) {
    val p = PaperPal.current
    Box(Modifier.fillMaxWidth().height(2.dp).background(p.line)) {
        Box(Modifier.fillMaxWidth((pct.coerceIn(0, 100) / 100f).coerceAtLeast(.02f)).height(2.dp).background(Color(RED39)))
    }
}

/**
 * Panelet under knappene: nåværende steg (fet) + prosent (mono, rød), linje 6 dp og steglisten (✓ ferdig · • pågår · · venter).
 * Feil: rødt «✕ Gemini svarte ikke» med «Prøv igjen» og «Bruk lokal OCR». Avbryt mens den jobber.
 */
@Composable
internal fun ReProgress39(vm: AppViewModel, id: String, re: Re39) {
    val p = PaperPal.current
    val idx = RE_STEPS39.indexOfFirst { it.first == re.step }.let { if (re.done) RE_STEPS39.size else it }
    val label = { s: String -> s.replace("{motor}", re.engine) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val now = when {
                re.cancelled -> re.msg ?: "Avbrutt · ingenting ble endret"
                re.error -> re.msg?.let { if (it.startsWith("✕")) it else "✕ $it" } ?: "✕ ${re.engine} svarte ikke"
                re.done -> re.msg ?: "✦ Analysert på nytt"
                else -> re.msg ?: RE_STEPS39.getOrNull(idx)?.second?.let(label) ?: "Starter …"
            }
            Text(now, color = if (re.error && !re.cancelled) Color(RED39) else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
                maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (!re.error) Text("${re.pct} %", color = Color(RED39), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
        if (!re.error) Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
            Box(Modifier.fillMaxWidth((re.pct.coerceIn(0, 100) / 100f).coerceAtLeast(.02f)).height(6.dp).clip(RoundedCornerShape(3.dp)).background(Color(RED39)))
        }
        if (!re.cancelled) RE_STEPS39.forEachIndexed { i, (_, t) ->
            val st = when { i < idx -> "done"; i == idx && re.error -> "err"; i == idx -> "on"; else -> "wait" }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(when (st) { "done" -> "✓"; "on" -> "•"; "err" -> "✕"; else -> "·" }, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    color = when (st) { "done" -> Color(OK39); "err" -> Color(RED39); "on" -> p.ink; else -> p.mut }, modifier = Modifier.widthIn(min = 12.dp))
                Text(label(t), color = if (st == "wait") p.mut else p.ink, fontFamily = PaperFonts.sans, fontSize = 12.5.sp,
                    fontWeight = if (st == "on") FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (re.running) ReBtn39("Avbryt", false) { vm.cancelRe39(id) }
            if (re.error && !re.cancelled) {
                ReBtn39("Prøv igjen", true) { vm.reanalyze39(id) }
                ReBtn39("Bruk lokal OCR", false) { vm.reanalyze39(id, "tesseract") }
            }
        }
    }
}

@Composable
private fun ReBtn39(t: String, primary: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (primary) p.ink else Color.Transparent).border(1.dp, if (primary) p.ink else p.line, RoundedCornerShape(17.dp))
        .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(t, color = if (primary) p.bg else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}
