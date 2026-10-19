package no.kristo.kalender.ui

import android.os.Build
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Green
import no.kristo.kalender.KEv
import no.kristo.kalender.KGMsg
import no.kristo.kalender.KalAsk
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.MS
import no.kristo.kalender.Red
import no.kristo.kalender.WS
import no.kristo.kalender.cap
import no.kristo.kalender.hm
import no.kristo.kalender.jsDay
import no.kristo.kalender.reduceMotion
import no.kristo.kalender.today

/*
 * Prompt 33: Glimt i Kalender (fasit: spark(), orb(), glimt-panelet i Kalender App.dc.html).
 * Animasjoner som i Homelab: aiSpin (konisk regnbuering), aiPulse (stjernen pulser og vris 45°), aiTw (gnister), glBreath (orben puster:
 * 3,6 s i ro, 1,1 s når den tenker), glShim (skimmer på «Glimt tenker»), glIn (meldinger glir inn), glUp (panelet).
 * «Reduser bevegelse»: ingen rotasjon/skalering, bare fade.
 */

private val RING = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFF7A5AD6), Color(0xFF3FBF9A), Color(0xFFB23A2A))
private val GLOW = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFFF2C14E), Color(0xFF3FBF9A), Color(0xFF7A5AD6), Color(0xFFB23A2A))
private const val STAR = "M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5h-0c-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z"

/** Glimt-stjernen i ring: ringen spinner (3,2 s, raskt 1 s), stjernen pulser (1,8 s / 0,9 s), to gnister blinker. */
@Composable
fun Spark(size: Dp, fast: Boolean) {
    val reduce = reduceMotion()
    val inf = rememberInfiniteTransition(label = "spark")
    val rot by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(if (fast) 1000 else 3200, easing = LinearEasing)), label = "rot")
    val pulse by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(if (fast) 450 else 900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse")
    val tw1 by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse, StartOffset(200)), label = "tw1")
    val tw2 by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse, StartOffset(800)), label = "tw2")
    val star = remember { PathParser().parsePathString(STAR).toPath() }
    Canvas(Modifier.size(size).semantics { contentDescription = "Glimt" }) {
        val s = this.size.minDimension
        val c = Offset(s / 2, s / 2)
        val bw = 2.5.dp.toPx().coerceAtMost(s * .14f)
        rotate(if (reduce) 0f else rot, c) { drawCircle(Brush.sweepGradient(RING, c), s / 2 - bw / 2, c, style = Stroke(bw)) }
        val sc = if (reduce) .95f else .78f + .30f * pulse
        val ang = if (reduce) 0f else 45f * pulse
        val k = s * .58f / 24f * sc
        rotate(ang, c) {
            translate(c.x - 12f * k, c.y - 12f * k) {
                scale(k, k, Offset.Zero) {
                    drawPath(star, Brush.linearGradient(listOf(Color(0xFFFFB38A), Color(0xFFFF5A3C)), Offset.Zero, Offset(24f, 24f)), alpha = .85f + .15f * pulse)
                }
            }
        }
        val a1 = if (reduce) .7f else tw1
        val a2 = if (reduce) .7f else tw2
        drawCircle(Color(0xFFFFD9C2), 2.dp.toPx() * (.4f + .6f * a1), Offset(s - 1.dp.toPx(), 1.dp.toPx()), alpha = a1)
        drawCircle(Color(0xFFFFD9C2), 1.5.dp.toPx() * (.4f + .6f * a2), Offset(0f, s - 1.dp.toPx()), alpha = a2)
    }
}

/** Orben: puster, glødende konisk ring bak (uskarp på Android 12+), motsatt spinnende ring, kort-farget kjerne og Spark i midten. */
@Composable
fun Orb(size: Dp, th: Boolean) {
    val k = LocalK.current
    val reduce = reduceMotion()
    val inf = rememberInfiniteTransition(label = "orb")
    val breath by inf.animateFloat(.92f, 1.06f, infiniteRepeatable(tween(if (th) 550 else 1800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breath")
    val r1 by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(if (th) 1400 else 7000, easing = LinearEasing)), label = "r1")
    val r2 by inf.animateFloat(360f, 0f, infiniteRepeatable(tween(if (th) 1000 else 4500, easing = LinearEasing)), label = "r2")
    Box(Modifier.size(size).scale(if (reduce) 1f else breath), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(size * 1.24f).rotate(if (reduce) 0f else r1).then(if (Build.VERSION.SDK_INT >= 31) Modifier.blur(size * .16f) else Modifier)
                .alpha(if (th) .85f else .55f).clip(CircleShape).background(Brush.sweepGradient(GLOW)),
        )
        Box(Modifier.size(size).rotate(if (reduce) 0f else r2).clip(CircleShape).background(Brush.sweepGradient(RING)))
        Box(Modifier.size(size * .82f).clip(CircleShape).background(k.card))
        Spark(size * .5f, th)
    }
}

/** «Glimt tenker» med skimmer (rødt lys som glir over teksten, 1,4 s). */
@Composable
private fun Shimmer(text: String) {
    val k = LocalK.current
    val reduce = reduceMotion()
    val inf = rememberInfiniteTransition(label = "shim")
    val x by inf.animateFloat(2f, -1f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "x")
    val w = 220f
    val brush = if (reduce) SolidColor(k.mut) else Brush.linearGradient(listOf(k.mut, k.mut, Red, k.mut, k.mut), Offset(x * w - w, 0f), Offset(x * w + w, 0f))
    Tx(text, man(14.sp, FontWeight.Bold).copy(brush = brush))
}

/** Rød markør mens teksten strømmer. */
@Composable
private fun Cursor() {
    val inf = rememberInfiniteTransition(label = "cur")
    val a by inf.animateFloat(.2f, 1f, infiniteRepeatable(tween(450), RepeatMode.Reverse), label = "a")
    Box(Modifier.padding(start = 2.dp).width(7.dp).height(15.dp).alpha(a).clip(RoundedCornerShape(2.dp)).background(Red))
}

/** Meldinger glir inn (glIn: fade + 8 dp opp). */
@Composable
private fun GlIn(key: Any, content: @Composable () -> Unit) {
    val reduce = reduceMotion()
    val a = remember(key) { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(key) { a.animateTo(1f, tween(300)) }
    Box(Modifier.alpha(a.value).padding(top = if (reduce) 0.dp else (8f * (1f - a.value)).dp)) { content() }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GlimtPanel(vm: KalVm) {
    val k = LocalK.current
    val h = LocalConfiguration.current.screenHeightDp.dp
    val list = rememberLazyListState()
    val last = vm.gm.lastOrNull()
    LaunchedEffect(vm.gm.size, last?.shown, last?.step, last?.thinking) { if (vm.gm.isNotEmpty()) list.scrollToItem(vm.gm.size - 1, 100000) }
    Column(
        Modifier.fillMaxWidth().height(h * .82f).shadow(24.dp, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
            .background(k.card).tap(null) {}.imePadding(),
    ) {
        Box(Modifier.fillMaxWidth().padding(top = 10.dp), contentAlignment = Alignment.Center) { Grip() }
        Row(
            Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Orb(42.dp, vm.thinking)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Tx("Glimt", news(24.sp, k.ink, 26.sp))
                Tx(if (vm.thinking) "TENKER …" else "KALENDER-ASSISTENT · LOKALT + GEMINI", mono(10.sp, k.mut2, .12f))
            }
            InkPill("Ferdig", { vm.closeGlimt() })
        }
        if (vm.gm.isEmpty()) {
            Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically)) {
                Orb(92.dp, vm.thinking)
                Tx("Hva lurer du på?", news(26.sp, k.ink).copy(textAlign = TextAlign.Center))
                Tx("Spør om kalenderen din, finn ledig tid, eller lim inn en melding, så legger jeg den inn.", man(13.5.sp, FontWeight.Medium, k.mut, 19.sp).copy(textAlign = TextAlign.Center),
                    Modifier.widthIn(max = 280.dp), maxLines = 4)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    KalAsk.SUG.forEach { s -> Chip(s, false, { vm.glSend(s) }, bgOff = k.bg) }
                }
            }
        } else {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)) {
                items(vm.gm, key = { it.id }) { m -> GlIn(m.id) { if (m.user) UserMsg(m.text) else AsstMsg(vm, m) } }
            }
        }
        Column(
            // Prompt 37: 16 dp sidemarg og 22 dp over gestlinjen, så send-knappen ikke treffer hjørnekurven; 6 dp over tastaturet.
            Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(start = 16.dp, end = 16.dp, top = 8.dp)
                .windowInsetsPadding(WindowInsets.navigationBars).padding(bottom = if (WindowInsets.ime.getBottom(LocalDensity.current) > 0) 6.dp else 22.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (vm.gm.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                KalAsk.SUG.forEach { s -> Chip(s, false, { vm.glSend(s) }, h = 30.dp, bgOff = k.bg) }
            }
            Row(
                Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(28.dp)).background(k.bg).border(1.dp, k.line, RoundedCornerShape(28.dp)).padding(start = 14.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Spark(20.dp, vm.thinking || vm.gq.isNotBlank())
                Box(Modifier.weight(1f)) {
                    if (vm.gq.isEmpty()) Tx("Spør Glimt …", man(16.sp, FontWeight.Medium, k.mut2))
                    BasicTextField(vm.gq, { vm.gq = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Spør Glimt" }, textStyle = man(16.sp, FontWeight.Medium, k.ink),
                        singleLine = true, cursorBrush = SolidColor(Red), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { vm.glSend(vm.gq) }))
                }
                Box(Modifier.size(38.dp).clip(RoundedCornerShape(14.dp)).background(if (vm.gq.isNotBlank()) k.ink else k.mut2).tap("Send") { vm.glSend(vm.gq) }, contentAlignment = Alignment.Center) {
                    Svg(Ic.UP, 16.dp, k.bg, 2.6f)
                }
            }
        }
    }
}

@Composable
private fun UserMsg(t: String) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Box(Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp)).background(k.ink).padding(horizontal = 14.dp, vertical = 10.dp)) {
            Tx(t, man(14.5.sp, FontWeight.Medium, k.bg, 20.sp), maxLines = 20)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AsstMsg(vm: KalVm, m: KGMsg) {
    val k = LocalK.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.width(24.dp)) { Spark(22.dp, !m.done) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (m.thinking) Column(Modifier.padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Shimmer("Glimt tenker")
                m.steps.forEachIndexed { i, n ->
                    val dn = i < m.step
                    val ac = i == m.step
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            Modifier.size(14.dp).clip(CircleShape).background(if (dn) Green else Color.Transparent)
                                .then(if (dn) Modifier else Modifier.border(if (ac) 2.dp else 1.5.dp, if (ac) Red else k.line, CircleShape)),
                            contentAlignment = Alignment.Center,
                        ) { if (dn) Tx("✓", man(8.sp, FontWeight.ExtraBold, Color.White)) }
                        Tx(n, man(12.5.sp, if (ac) FontWeight.Bold else FontWeight.Medium, if (dn || ac) k.ink else k.mut2))
                    }
                }
            } else {
                val w = m.words
                Row(verticalAlignment = Alignment.Bottom) {
                    Tx(w.take(m.shown).joinToString(" "), man(14.5.sp, FontWeight.Medium, k.ink, 22.sp), Modifier.weight(1f, fill = false), maxLines = 40)
                    if (!m.done) Cursor()
                }
            }
            if (m.done) {
                m.cards.forEach { e -> Card(vm, vm.find(e.id) ?: e) }
                if (m.slots.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    m.slots.forEach { sl ->
                        Row(
                            Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).border(1.5.dp, Green, RoundedCornerShape(17.dp)).tap("Ny hendelse " + hm(sl.s)) { vm.slot(sl) }.padding(horizontal = 13.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            val g = if (k.dark) Color(0xFF8FD4A8) else Color(0xFF235C3B)
                            Svg(Ic.PLUS, 12.dp, g, 3f)
                            Tx(hm(sl.s) + "–" + hm(sl.e), mono(12.5.sp, g))
                        }
                    }
                }
                val uid = m.undoId
                if (uid != null && vm.find(uid) != null) LinePill("Angre", { vm.glUndo(m) }, h = 30.dp)
                // Prompt 34: Glimt fikk ikke svar → Prøv igjen og Åpne AI-kontroll (ikke bare hjelpeteksten).
                if (m.err) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    InkPill("Prøv igjen", { vm.glRetry(m) }, h = 30.dp, padH = 14.dp, fs = 12.5.sp)
                    LinePill("Åpne AI-kontroll", { vm.openAiCtl() }, h = 30.dp)
                }
            }
        }
    }
}

/** Hendelseskort i svaret: åpner hendelsesarket. */
@Composable
private fun Card(vm: KalVm, e: KEv) {
    val k = LocalK.current
    val c = vm.evCal(e)
    val T = today()
    val sub = (if (e.d == T) "I dag" else cap(WS[e.d.jsDay]) + ". " + e.d.dayOfMonth + ". " + MS[e.d.monthValue - 1]) + (e.loc?.let { " · $it" } ?: " · " + c.n)
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(14.dp)).background(k.bg).border(1.dp, k.line2, RoundedCornerShape(14.dp))
            .tap(e.t) { if (vm.find(e.id) != null) vm.openEv(e) }.padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c.col))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Tx(e.t, man(14.sp, FontWeight.Bold, k.ink))
            Tx(sub, man(12.sp, FontWeight.Medium, k.mut))
        }
        Tx(if (e.all) "Hele dagen" else hm(e.s ?: 0), mono(11.5.sp, k.ink))
    }
    // Prompt 37: minikart med adressen når Glimt la til hendelsen.
    GlimtMap37(vm, e)
    Spacer(Modifier.height(0.dp))
}
