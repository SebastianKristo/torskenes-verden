package no.kristo.finanshub.ui

import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Voice56
import no.kristo.finanshub.cancelMic56
import no.kristo.finanshub.micSearch56
import no.kristo.finanshub.releaseMic56
import no.kristo.finanshub.say56
import no.kristo.finanshub.stopMic56
import no.kristo.finanshub.voice56Refresh

/*
 * Prompt 70 (ANDHOME70, claude-code-mikrofon-sokefelt.md) – nytt mikrofon-UI i søkefeltet på Hjem. Motoren er den samme (Voice56.kt):
 * serveren når den har en motor, ellers talegjenkjenningen på telefonen.
 *  - Hvile: nytt ikon (kapsel 6 × 11,5, r 3, bue og fot, strek 1,9, ink), ingen rød knapp; 36 dp rund flate (40 dp treff), bg ved trykk.
 *  - Opptak: feltet blir et kort i samme farge (card/ink, radius 26). Øverst teksten: live bare med motoren på telefonen; med serveren
 *    «Snakk nå …» mens man snakker og «Skriver ned …» etter ■ (teksten settes inn når svaret kommer). Nederst × (avbryt, forkast),
 *    bølgeform i full bredde som følger lydnivået (egen timer, 11/s – ikke hele Hjem), tid «0:03», ■ (stopp → teksten i feltet)
 *    og ↑ (terrakotta: stopp og send med en gang, som Enter).
 */

internal const val MIC70 = "M9 6a3 3 0 0 1 6 0v5.5a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"
private const val X70 = "M6 6l12 12M18 6L6 18"
private const val UP70 = "M12 19V5M6 11l6-6 6 6"
private val SEND70 = Color(0xFFC8633F)

/** Mikrofonen i søkefeltet (hvile). Trykk = start, hold inne = snakk så lenge du holder (som før). */
@Composable
internal fun SearchMic70(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.voice56Refresh() }
    val start = rememberMic56(onDenied = { vm.say56(Voice56.SEARCH, "Mikrofonen trenger tillatelse") }) { vm.micSearch56(ctx) }
    val on = Voice56.on(Voice56.SEARCH)
    var pressed by remember { mutableStateOf(false) }
    Box(
        Modifier.size(40.dp)
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    pressed = true
                    try { waitForUpOrCancellation(PointerEventPass.Initial) } finally { pressed = false }
                }
            }
            .holdMic56("Snakk inn søket (trykk for å starte, eller hold inne)",
                onTap = { Haptics.select(); if (on) vm.micSearch56(ctx) else start() },
                onHold = { if (micOk56(ctx)) vm.micSearch56(ctx, hold = true) else start() },
                onRelease = { cancel -> vm.releaseMic56(Voice56.SEARCH, cancel) }),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(if (pressed) p.bg else Color.Transparent), contentAlignment = Alignment.Center) {
            WxIcon(MIC70, p.ink, 20.dp, stroke = 1.9f)
        }
    }
}

/** Opptakskortet i stedet for søkefeltet (samme bredde og farge). ↑ = stopp og send søket når teksten er satt inn. */
@Composable
internal fun MicCard70(vm: AppViewModel) {
    val p = PaperPal.current
    val v = Voice56
    val rec = v.phase == "rec"
    val live = v.partial.takeIf { v.onDevice && it.isNotBlank() }
    val hint = when {
        live != null -> null
        rec -> "Snakk nå …"
        else -> "Skriver ned …"
    }
    Column(
        Modifier.fillMaxWidth().shadow(12.dp, RoundedCornerShape(26.dp)).clip(RoundedCornerShape(26.dp)).background(p.card)
            .padding(start = 18.dp, top = 16.dp, end = 10.dp, bottom = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 24.dp).padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                buildAnnotatedString {
                    if (live != null) append(live) else withStyle(SpanStyle(color = p.mut)) { append(hint ?: "") }
                },
                color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium, fontSize = 17.sp, lineHeight = 24.sp,
                modifier = Modifier.weight(1f, fill = false),
            )
            Caret70(p.ink, rec)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MicBtn70(p.bg, "Avbryt") { Haptics.dismiss(); vm.cancelMic56() }
            Wave70(p.ink, p.mut, rec, Modifier.weight(1f))
            MicBtn70(p.bg, "Stopp opptak") { Haptics.select(); if (Voice56.phase == "rec") vm.stopMic56(false) }
            MicBtn70(SEND70, "Send") {
                Haptics.select()
                Voice56.autoSend = true
                if (Voice56.phase == "rec") vm.stopMic56(false)
            }
        }
    }
}

/** Runde knapper (40 dp) i kortet: × (bg), ■ (bg) og ↑ (terrakotta). Ikonet velges ut fra etiketten. */
@Composable
private fun MicBtn70(bg: Color, label: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(bg).clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        when (label) {
            "Avbryt" -> WxIcon(X70, p.ink, 16.dp, stroke = 2.2f)
            "Send" -> WxIcon(UP70, Color.White, 18.dp, stroke = 2.4f)
            else -> Box(Modifier.size(13.dp).clip(RoundedCornerShape(3.dp)).background(p.ink))
        }
    }
}

/** Blinkende markør etter teksten (står stille når opptaket er stoppet). */
@Composable
private fun Caret70(color: Color, blink: Boolean) {
    // Prompt 71: blinkingen leses i laget (graphicsLayer), så bare markøren tegnes på nytt – ikke kortet.
    val a = if (blink) {
        val t = rememberInfiniteTransition(label = "caret70")
        t.animateFloat(1f, 0f, infiniteRepeatable(tween(530), RepeatMode.Reverse), label = "c70")
    } else null
    Box(Modifier.padding(start = 2.dp).size(2.dp, 20.dp).graphicsLayer { alpha = if ((a?.value ?: 1f) > .5f) 1f else 0f }.background(color))
}

/**
 * Bølgeformen: høy startstrek og streker/prikker som ruller mot venstre og følger lydnivået (Voice56.level), 11 prøver i sekundet.
 * Egen timer og Canvas – bare denne lille komponenten tegnes på nytt. Tiden «0:03» står etter.
 */
@Composable
internal fun Wave70(ink: Color, mut: Color, rec: Boolean, modifier: Modifier = Modifier) {
    val n = 90
    val buf = remember { FloatArray(n) }
    var count by remember { mutableIntStateOf(0) }
    LaunchedEffect(rec) {
        while (rec) {
            buf[count % n] = Voice56.level
            count++
            delay(90)
        }
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Canvas(Modifier.weight(1f).height(24.dp)) {
            val c = count
            val step = 3.5.dp.toPx() + 3.dp.toPx()
            val mid = size.height / 2f
            var x = size.width
            var i = 0
            while (x > 0f && i < n) {
                val idx = c - 1 - i
                val real = idx >= 0
                val lv = if (real) buf[((idx % n) + n) % n] else 0f
                val big = lv > .55f
                val w = (if (big) 3.dp else 2.5.dp).toPx()
                val h = when { big -> (8f + lv * 14f).dp.toPx(); lv > .25f -> 5.dp.toPx(); else -> 3.dp.toPx() }
                x -= w
                drawRoundRect(ink.copy(alpha = if (!real) .25f else if (big) 1f else .55f), Offset(x, mid - h / 2f), Size(w, h), CornerRadius(2.dp.toPx()))
                x -= step - w
                i++
                // Startstreken: der opptaket begynte (ruller ut til venstre etter hvert).
                if (idx == 0) {
                    val sw = 2.5.dp.toPx()
                    x -= 2.dp.toPx()
                    if (x - sw > 0f) drawRoundRect(ink, Offset(x - sw, 0f), Size(sw, size.height), CornerRadius(2.dp.toPx()))
                    break
                }
            }
        }
        val s = Voice56.secs
        Text("${s / 60}:${(s % 60).toString().padStart(2, '0')}", color = mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
            maxLines = 1, modifier = Modifier.widthIn(min = 30.dp))
    }
}
