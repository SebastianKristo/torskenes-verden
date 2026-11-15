package no.kristo.kalender.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate as rotateDraw
import androidx.compose.animation.core.animateFloat
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.KEv
import no.kristo.kalender.Kal41
import no.kristo.kalender.Kal89
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.reduceMotion

/* Bursdagskortet i hendelsesarket (prompt 41, R.dt.bd i Kalender App.dc.html). */

/* ---------------- Bursdagskortet ---------------- */

private val CONF = listOf(Color(0xFFF2C14E), Color(0xFFFFFFFF), Color(0xFF3FBF9A), Color(0xFFA8D4FB), Color(0xFFFFD2C2))

@Composable
fun BdCard41(vm: KalVm, e: KEv, color: Color) {
    val s = vm.k41
    LaunchedEffect(e.id) { s.loadPeople() }
    val name = Kal41.bdName(e.t)
    val p = Kal41.match(name, s.people)
    LaunchedEffect(p?.id) { p?.let { s.loadPhoto(it) } }
    val (kicker, big, unit) = Kal41.counter(e.d)
    val isToday = e.d == no.kristo.kalender.today()
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(color)) {
        // 16 faste konfettibiter (gul, hvit, mint, lyseblå, fersken).
        Canvas(Modifier.matchParentSize()) {
            for (i in 0 until 16) {
                val w = (5 + Kal41.rr(i + 3) * 5).dp.toPx()
                val h = (8 + Kal41.rr(i + 4) * 6).dp.toPx()
                val x = (Kal41.rr(i) * size.width).toFloat()
                val y = (Kal41.rr(i + 9) * size.height).toFloat()
                val a = (Kal41.rr(i + 6) * 180).toFloat()
                rotateDraw(a, Offset(x, y)) {
                    if (Kal41.rr(i + 2) > .6) drawOval(CONF[i % CONF.size].copy(alpha = .9f), Offset(x - w / 2, y - h / 2), androidx.compose.ui.geometry.Size(w, h))
                    else drawRect(CONF[i % CONF.size].copy(alpha = .9f), Offset(x - w / 2, y - h / 2), androidx.compose.ui.geometry.Size(w, h))
                }
            }
        }
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(64.dp)) {
                    Box(Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = .22f)).border(3.dp, Color.White.copy(alpha = .85f), CircleShape), contentAlignment = Alignment.Center) {
                        val img = p?.let { s.photos[it.id] }
                        if (img != null) Image(img, null, Modifier.size(64.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                        else Tx(name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase(), man(22.sp, FontWeight.ExtraBold, Color.White))
                    }
                    PartyHat41(Modifier.size(30.dp, 32.dp).offset(x = 34.dp, y = (-22).dp).rotate(18f))
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Tx(kicker, mono(10.5.sp, Color.White.copy(alpha = .9f), .14f))
                    Tx(name, news(30.sp, Color.White, 32.sp), maxLines = 2)
                    Tx(Kal41.bdSub(e.d, p?.year), man(14.sp, FontWeight.Medium, Color.White.copy(alpha = .92f)), maxLines = 2)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Tx(big, news(if (isToday) 30.sp else 44.sp, Color.White, if (isToday) 32.sp else 46.sp, FontWeight.Normal))
                    if (unit.isNotEmpty()) Tx(unit, man(12.5.sp, FontWeight.Medium, Color.White.copy(alpha = .9f)))
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color.White).tap("Gratuler") { s.congratulate(name, p) }, contentAlignment = Alignment.Center) {
                    Tx("Gratuler", man(13.sp, FontWeight.Bold, Color(0xFF1B1A17)))
                }
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color.White.copy(alpha = .2f)).tap("Gaveidé") { s.gift(name, e.d) }, contentAlignment = Alignment.Center) {
                    Tx("Gaveidé", man(13.sp, FontWeight.Bold, Color.White))
                }
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color.White.copy(alpha = .2f)).tap("Bursdager") { s.openBirthdays(name, p) }, contentAlignment = Alignment.Center) {
                    Tx("Bursdager ›", man(13.sp, FontWeight.Bold, Color.White))
                }
            }
            if (isToday) Jenka41()
        }
    }
}

/** Festhatten (viewBox 60×62). */
@Composable
private fun PartyHat41(modifier: Modifier) {
    Canvas(modifier) {
        val sx = size.width / 60f
        val sy = size.height / 62f
        val cone = Path().apply { moveTo(8 * sx, 56 * sy); lineTo(30 * sx, 4 * sy); lineTo(52 * sx, 56 * sy); close() }
        drawPath(cone, Color(0xFF1B1A17))
        val y = Color(0xFFF2C14E)
        drawLine(y, Offset(14 * sx, 42 * sy), Offset(46 * sx, 42 * sy), 3 * sx)
        drawLine(y, Offset(19 * sx, 30 * sy), Offset(41 * sx, 30 * sy), 3 * sx)
        drawLine(y, Offset(24 * sx, 18 * sy), Offset(36 * sx, 18 * sy), 3 * sx)
        drawCircle(y, 5 * sx, Offset(30 * sx, 4 * sy))
    }
}

/** Jenka-toget på bursdagsdagen: Glimt-stjerner som hopper i takt langs bunnen av kortet. */
@Composable
private fun Jenka41() {
    val reduce = reduceMotion()
    val inf = androidx.compose.animation.core.rememberInfiniteTransition(label = "jenka")
    val t by inf.animateFloat(0f, 1f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(7000, easing = androidx.compose.animation.core.LinearEasing)), label = "t")
    BoxWithConstraints(Modifier.fillMaxWidth().height(28.dp)) {
        val w = maxWidth.value
        val head = if (reduce) w * .6f else (t * (w + 160f)) - 80f
        for (i in 0 until 5) {
            val hop = if (reduce) 0f else (kotlin.math.abs(kotlin.math.sin((t * 60f + i * .9f).toDouble())) * 6).toFloat()
            Box(Modifier.offset(x = (head - i * 22f).dp, y = (8f - hop).dp)) { Spark(16.dp, false) }
        }
    }
}
