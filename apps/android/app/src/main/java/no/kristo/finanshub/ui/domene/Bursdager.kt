@file:JvmName("DomeneBursdager")

package no.kristo.finanshub.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Bursdager: kode som lå i blandingsfilene (Ui41.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Bursdager: last opp bilde ======================= */

/** «Last opp bilde» (uten bilde) eller «Bytt bilde» / «Fjern bilde» øverst i detaljene til en person. Android Photo Picker. */
@Composable
internal fun BdPhotoActions41(vm: AppViewModel, b: Bd24) {
    val p = PaperPal.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) vm.bdPhoto41(b, u) }
    val has = !b.avatarUrl.isNullOrBlank()
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
            .clickable(role = Role.Button) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text(if (has) "📷 Bytt bilde" else "📷 Last opp bilde", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        }
        if (has) Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
            .clickable(role = Role.Button) { vm.bdPhotoRemove41(b) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Fjern bilde", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        }
    }
}

/** Lite «+»-merke nede til høyre på avataren for personer uten bilde. */
@Composable
internal fun BoxScope.BdPlus41(size: Int) {
    val p = PaperPal.current
    Box(Modifier.align(Alignment.BottomEnd).size((size * .38f).dp).clip(CircleShape).background(p.bg).padding(1.5.dp).clip(CircleShape).background(p.ink), contentAlignment = Alignment.Center) {
        Text("+", color = p.bg, fontSize = (size * .26f).sp, fontWeight = FontWeight.Bold)
    }
}

/* ======================= Bursdager: jenka-tog med Glimt ======================= */

private val CONF41 = listOf(0xFFFFD84D, 0xFFFFFFFF, 0xFF9FE3C9, 0xFFA8D4FF, 0xFFFFC2A0, 0xFFC9B2FF)

/**
 * I det røde toppkortet når noen har bursdag i dag: konfetti (30 biter, gul/hvit/mint/lyseblå/fersken/lilla) og jenka-toget
 * langs bunnen – Glimt først med trompet og noter, så Stjerne, Gris, Ugle, Boble og Spire. 11 s over kortet, hopp 0,42 s.
 * Redusert bevegelse: toget står stille midt i kortet, ingen konfetti. Trykk starter på nytt (via nøkkel).
 */
@Composable
internal fun Jenka41(modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    var seq by remember { mutableIntStateOf(0) }
    var t by remember { mutableFloatStateOf(0f) }
    if (!reduce) LaunchedEffect(seq) {
        val t0 = androidx.compose.runtime.withFrameNanos { it }
        while (true) androidx.compose.runtime.withFrameNanos { n -> t = (n - t0) / 1e9f }
    }
    val pieces = remember { List(30) { i -> floatArrayOf((i * 37 % 100) / 100f, (i * 53 % 100) / 100f, .6f + (i % 5) * .15f, (i % 6).toFloat(), (i % 2).toFloat()) } }
    BoxWithConstraints(modifier.fillMaxWidth().height(74.dp).clip(RoundedCornerShape(16.dp))
        .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .14f))))
        .clickable(interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, indication = null) { seq++ }) {
        val w = maxWidth
        if (!reduce) androidx.compose.foundation.Canvas(Modifier.matchParentSize()) {
            pieces.forEachIndexed { i, pc ->
                val y = ((pc[1] + t * .18f * pc[2]) % 1f) * size.height
                val x = pc[0] * size.width + kotlin.math.sin(t * 1.3f + i) * 6f
                val c = Color(CONF41[pc[3].toInt()])
                rotate(t * 120f * pc[2] + i * 20, androidx.compose.ui.geometry.Offset(x, y)) {
                    if (pc[4] == 0f) drawCircle(c, 3.2f * density, androidx.compose.ui.geometry.Offset(x, y))
                    else drawRect(c, androidx.compose.ui.geometry.Offset(x - 3 * density, y - 2 * density), androidx.compose.ui.geometry.Size(6 * density, 4 * density))
                }
            }
        }
        val train = listOf("glimt", "stjerne", "gris", "ugle", "boble", "spire")
        val trainW = 50f + 5 * 44f
        val prog = if (reduce) .5f else (t % 11f) / 11f
        val startX = -trainW + prog * (w.value + trainW)
        train.forEachIndexed { i, id ->
            val sz = if (i == 0) 50f else 40f
            val x = startX + trainW - (if (i == 0) 50f else 50f + i * 44f)
            val hop = if (reduce) 0f else kotlin.math.abs(kotlin.math.sin((t - i * .12f) * Math.PI.toFloat() / .42f)) * 7f
            val tilt = if (reduce) 0f else kotlin.math.sin((t - i * .12f) * Math.PI.toFloat() / .42f) * 6f
            Box(Modifier.offset(x = x.dp, y = (74f - sz - 4f - hop).dp).graphicsLayer21(tilt)) {
                GlimtFig35(id, sz.dp, "happy", still = true, noJul = true)
                // Festhatt (svart med gule striper og dusk), skrått på hodet – også i julemodus.
                androidx.compose.foundation.Canvas(Modifier.size((sz * .42f).dp, (sz * .44f).dp).offset(x = (sz * .34f).dp, y = (-sz * .3f).dp).graphicsLayer21(14f)) {
                    val w = size.width; val h = size.height
                    drawPath(androidx.compose.ui.graphics.Path().apply { moveTo(w * .1f, h * .92f); lineTo(w * .5f, h * .12f); lineTo(w * .9f, h * .92f); close() }, Color(0xFF1B1A17))
                    listOf(.42f to .58f, .62f to .78f).forEach { (a1, _) -> drawLine(Color(0xFFF2C14E), androidx.compose.ui.geometry.Offset(w * (.5f - (a1 - .1f) * .5f), h * a1 + h * .1f), androidx.compose.ui.geometry.Offset(w * (.5f + (a1 - .1f) * .5f), h * a1 + h * .1f), strokeWidth = h * .07f) }
                    drawCircle(Color(0xFFF2C14E), w * .11f, androidx.compose.ui.geometry.Offset(w * .5f, h * .1f))
                }
                if (i == 0) Text("🎺", fontSize = 16.sp, modifier = Modifier.offset(x = (sz - 6).dp, y = (sz * .45f).dp))
            }
        }
        if (!reduce) listOf("♪", "♫", "♪").forEachIndexed { k, n ->
            val ph = ((t + k * .7f) % 2f) / 2f
            Text(n, color = Color(CONF41[k]).copy(alpha = 1f - ph), fontSize = 14.sp,
                modifier = Modifier.offset(x = (startX + trainW + 10f + k * 8f).dp, y = (30f - ph * 26f).dp))
        }
    }
}

private fun Modifier.graphicsLayer21(rot: Float): Modifier = this.then(Modifier.graphicsLayer { rotationZ = rot })
