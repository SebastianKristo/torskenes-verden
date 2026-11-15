@file:JvmName("DomeneVaer")

package no.kristo.finanshub.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.constrain
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics

/*
 * Vær: kode som lå i blandingsfilene (Ui40.kt, Ui46.kt, Ui52B.kt, P25Ui.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Vær ======================= */

/**
 * Den ene lukkeknappen i Vær: 42 dp sirkel, hvit 22 % glass (mørk glass `rgba(10,20,35,.62)` over kart), hvit ✕ 17 dp med
 * strek 2,8 og runde ender, trykkflate 44 dp, «Lukk» for skjermleser og samme haptikk som hovedsiden.
 * Brukes på hovedsiden, i Yr mot Storm, kartet, Steder og alle detaljark.
 */
@Composable
internal fun VaerCloseButton(dark: Boolean = false, onClick: () -> Unit) {
    Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(42.dp).clip(CircleShape).background(if (dark) Color(0x9E0A1423) else Color.White.copy(alpha = .22f))
                .clickable(role = Role.Button, onClickLabel = "Lukk") { Haptics.dismiss(); onClick() }
                .semantics { contentDescription = "Lukk" },
            contentAlignment = Alignment.Center,
        ) { WxIcon("M6 6l12 12M18 6L6 18", Color.White, 17.dp, stroke = 2.8f) }
    }
}

/** Glass-stripen bak statuslinja + topplinja i Vær: `rgba(34,58,92,.62 → 0)`, tones inn med bynavnet (alpha = a). */
@Composable
internal fun WxTopGlass40(a: Float) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Box(
        Modifier.fillMaxWidth().height(top + 74.dp).graphicsLayer { alpha = a }
            .background(Brush.verticalGradient(0f to Color(0x9E223A5C), .72f to Color(0x7A223A5C), 1f to Color(0x00223A5C))),
    )
}

/* ======================= Vær: «Min posisjon» øverst i Steder ======================= */

private val WX_BLUE46 = Color(0xFF4F8FD6)

@Composable
internal fun GpsPlaceRow46(vm: AppViewModel, close: () -> Unit) {
    val ctx = LocalContext.current
    val s = vm.p46
    val on = vm.wxGps46()
    val granted = no.kristo.finanshub.family.FamilyService.hasLocation(ctx)
    val sub = when {
        !granted -> "Gi appen tilgang til posisjon"
        s.gpsState == "loading" -> "Finner posisjonen …"
        s.gpsState == "error" -> "Fant ikke posisjonen"
        else -> "Min posisjon · følger telefonen"
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0xFF20232A)).clickable(role = Role.Button, onClickLabel = "Min posisjon") {
            Haptics.select()
            if (!granted) {
                (ctx as? android.app.Activity)?.requestPermissions(arrayOf(android.Manifest.permission.ACCESS_COARSE_LOCATION, android.Manifest.permission.ACCESS_FINE_LOCATION), 4601)
                    ?: runCatching { ctx.startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + ctx.packageName)).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
            vm.wxPick46("__gps"); vm.openGps46(force = true); close()
        }.padding(14.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(WX_BLUE46), contentAlignment = Alignment.Center) {
            WxIcon("M12 2l7 19-7-4-7 4z", Color.White, 16.dp, fill = true)
        }
        Column(Modifier.weight(1f)) {
            Text(s.gpsName ?: "Min posisjon", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, color = Color.White)
            Text(sub, fontSize = 12.5.sp, color = Color(0xFF9AA3AE), maxLines = 1)
        }
        if (on) Text("✓", color = Color(0xFF5EC8F2), fontWeight = FontWeight.Bold, fontSize = 17.sp)
    }
}

/* ======================= Vær: modusvelger med glassdråpe ======================= */

/**
 * Temperatur / Nedbør / Vind: én glassdråpe bak ikonene. Trykk → dråpen glir dit (fjær 0,7 / 500). Dra → følger fingeren 1:1,
 * strekkes etter fart (liquid), ikonet under fingeren forstørres 12 % og et haptisk tikk ved hvert nytt valg; slipp → nærmeste.
 * Ingen klikk etter et drag. «Fjern animasjoner»: ingen strekk/forstørring, kort glid (150 ms). Blur via RenderEffect på API 31+.
 */
@Composable
internal fun LiquidSeg46(keys: List<Pair<String, String>>, labels: List<String>, cur: String, onPick: (String) -> Unit) {
    val reduce = reduceMotion45()
    val cell = 44.dp
    val gap = 2.dp
    val dens = LocalDensity.current
    val stepPx = with(dens) { (cell + gap).toPx() }
    val idx = keys.indexOfFirst { it.first == cur }.coerceAtLeast(0)
    val pos = remember { Animatable(idx.toFloat()) }
    var dragging by remember { mutableStateOf(false) }
    var stretch by remember { mutableFloatStateOf(0f) }
    var hover by remember { mutableIntStateOf(idx) }
    val scope = rememberCoroutineScope()
    val sp = if (reduce) tween<Float>(150) else spring(dampingRatio = .7f, stiffness = 500f)
    LaunchedEffect(idx) { if (!dragging) { hover = idx; pos.animateTo(idx.toFloat(), sp) } }
    val st by animateFloatAsState(if (dragging && !reduce) stretch else 0f, spring(stiffness = Spring.StiffnessMedium), label = "st46")
    Box(
        Modifier.clip(CircleShape).background(Color.Black.copy(alpha = .18f)).padding(3.dp)
            .pointerInput(keys) {
                var x0 = 0f
                var lastT = 0L
                detectHorizontalDragGestures(
                    onDragStart = { o -> dragging = true; x0 = pos.value * stepPx; lastT = System.nanoTime() },
                    onDragEnd = {
                        dragging = false; stretch = 0f
                        val n = pos.value.roundToInt().coerceIn(0, keys.lastIndex)
                        scope.launch { pos.animateTo(n.toFloat(), sp) }
                        if (keys[n].first != cur) onPick(keys[n].first)
                    },
                    onDragCancel = { dragging = false; stretch = 0f; scope.launch { pos.animateTo(idx.toFloat(), sp) } },
                ) { ch, dx ->
                    ch.consume()
                    x0 = (x0 + dx).coerceIn(0f, stepPx * keys.lastIndex)
                    val now = System.nanoTime()
                    val v = abs(dx) / ((now - lastT).coerceAtLeast(1_000_000L) / 1e9f) // px/s
                    lastT = now
                    stretch = (v / 4000f).coerceIn(0f, 1f)
                    scope.launch { pos.snapTo(x0 / stepPx) }
                    val h = (x0 / stepPx).roundToInt()
                    if (h != hover) { hover = h; Haptics.select() }
                }
            },
    ) {
        // Dråpen: lys gradient (34 % → 16 % hvit), tynn lys kant og glans INNI pillen (VaerPillGlass73, ui/Vaer73.kt).
        // Prompt 73 (claude-code-vaer-pille-strek-android.md): ingen egen strek over toppkanten og ingen elevation/shadow.
        Box(
            Modifier.offset { androidx.compose.ui.unit.IntOffset((pos.value * stepPx).roundToInt(), 0) }.size(cell, 30.dp)
                .graphicsLayer { scaleX = 1f + .18f * st; scaleY = 1f - .12f * st }
                .vaerPillGlass73(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
            keys.forEachIndexed { i, (k, ic) ->
                val big = dragging && hover == i && !reduce
                val sc by animateFloatAsState(if (big) 1.12f else 1f, tween(120), label = "ic46")
                Box(
                    Modifier.size(cell, 30.dp).clip(CircleShape)
                        .clickable(onClickLabel = labels.getOrElse(i) { k }) { if (!dragging) { Haptics.select(); onPick(k) } },
                    contentAlignment = Alignment.Center,
                ) { Box(Modifier.graphicsLayer { scaleX = sc; scaleY = sc }) { WxIcon(ic, Color.White, 18.dp, stroke = 1.9f) } }
            }
        }
    }
}

/* ======================= Glass-pille som kan dras (tekst) ======================= */

/**
 * Samme glass-pille som temp/regn/vind-bryteren (LiquidSeg46), men med tekst og ulik bredde per knapp:
 * trykk virker som før; dra flytter pillen med fingeren, den strekker seg etter farten, tilpasser bredden til knappen under,
 * vibrerer lett per knapp og smetter på plass når du slipper.
 */
@Composable
internal fun LiquidTextSeg52(
    items: List<Pair<String, String>>, sel: String, onPick: (String) -> Unit, modifier: Modifier = Modifier,
    cellH: Dp = 34.dp, fontSize: TextUnit = 13.sp, padH: Dp = 12.dp, fill: Boolean = false, bg: Color = Color(0xBF0A1423),
) {
    val reduce = reduceMotion45()
    val dens = LocalDensity.current
    val xs = remember(items) { mutableStateListOf<Float>().apply { repeat(items.size) { add(0f) } } }
    val ws = remember(items) { mutableStateListOf<Float>().apply { repeat(items.size) { add(0f) } } }
    var ready by remember(items) { mutableStateOf(false) }
    val idx = items.indexOfFirst { it.first == sel }.coerceAtLeast(0)
    val px = remember { Animatable(0f) }
    val pw = remember { Animatable(0f) }
    var dragging by remember { mutableStateOf(false) }
    var hover by remember { mutableIntStateOf(idx) }
    var stretch by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val sp = if (reduce) tween<Float>(150) else spring(dampingRatio = .72f, stiffness = 520f)
    LaunchedEffect(idx, ready) {
        if (!ready || dragging) return@LaunchedEffect
        hover = idx
        if (px.value == 0f && pw.value == 0f) { px.snapTo(xs[idx]); pw.snapTo(ws[idx]) }
        else { launch { px.animateTo(xs[idx], sp) }; pw.animateTo(ws[idx], sp) }
    }
    val st by animateFloatAsState(if (dragging && !reduce) stretch else 0f, spring(stiffness = Spring.StiffnessMedium), label = "st52")
    fun cellAt(x: Float): Int {
        var best = 0; var bd = Float.MAX_VALUE
        for (i in items.indices) { val c = xs[i] + ws[i] / 2; val d = abs(c - x); if (d < bd) { bd = d; best = i } }
        return best
    }
    Box(
        modifier.clip(CircleShape).background(bg).border(1.dp, Color.White.copy(alpha = .14f), CircleShape).padding(3.dp)
            .pointerInput(items) {
                var fx = 0f
                var lastT = 0L
                detectHorizontalDragGestures(
                    onDragStart = { o -> dragging = true; fx = o.x; lastT = System.nanoTime(); hover = cellAt(fx) },
                    onDragEnd = {
                        dragging = false; stretch = 0f
                        val n = hover.coerceIn(0, items.lastIndex)
                        scope.launch { px.animateTo(xs[n], sp) }
                        scope.launch { pw.animateTo(ws[n], sp) }
                        if (items[n].first != sel) { Haptics.select(); onPick(items[n].first) }
                    },
                    onDragCancel = { dragging = false; stretch = 0f; scope.launch { px.animateTo(xs[idx], sp) }; scope.launch { pw.animateTo(ws[idx], sp) } },
                ) { ch, dx ->
                    ch.consume()
                    val total = (xs.lastOrNull() ?: 0f) + (ws.lastOrNull() ?: 0f)
                    fx = (fx + dx).coerceIn(0f, total)
                    val now = System.nanoTime()
                    val v = abs(dx) / ((now - lastT).coerceAtLeast(1_000_000L) / 1e9f)
                    lastT = now
                    stretch = (v / 4000f).coerceIn(0f, 1f)
                    val h = cellAt(fx)
                    if (h != hover) { hover = h; Haptics.select(); scope.launch { pw.animateTo(ws[h], tween(120)) } }
                    scope.launch { px.snapTo((fx - pw.value / 2).coerceIn(0f, (total - pw.value).coerceAtLeast(0f))) }
                }
            },
    ) {
        if (ready) Box(
            // Prompt 71: bredden leses i målefasen (layout-lambda) i stedet for size(pw.value.toDp()) i komposisjonen – samme mål.
            Modifier.offset { IntOffset(px.value.roundToInt(), 0) }.layout { m, c ->
                val pl = m.measure(c.constrain(Constraints.fixed(with(dens) { pw.value.toDp() }.roundToPx(), cellH.roundToPx())))
                layout(pl.width, pl.height) { pl.place(0, 0) }
            }
                .graphicsLayer { scaleX = 1f + .14f * st; scaleY = 1f - .1f * st }
                .shadow(6.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                .clip(CircleShape)
                .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = .34f), Color.White.copy(alpha = .16f))))
                .border(1.dp, Color.White.copy(alpha = .45f), CircleShape),
        )
        Row(if (fill) Modifier.fillMaxWidth() else Modifier, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            items.forEachIndexed { i, (k, n) ->
                val on = (if (dragging) hover else idx) == i
                Box(
                    (if (fill) Modifier.weight(1f) else Modifier).height(cellH)
                        .onGloballyPositioned { c -> xs[i] = c.positionInParent().x; ws[i] = c.size.width.toFloat(); if (ws.all { it > 0f }) ready = true }
                        .clip(CircleShape).clickable(role = Role.Button, onClickLabel = n) { if (!dragging) { Haptics.select(); onPick(k) } }.padding(horizontal = padH),
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = Color.White.copy(alpha = if (on) 1f else .78f), fontWeight = FontWeight.SemiBold, fontSize = fontSize, maxLines = 1) }
            }
        }
    }
}

/* ---------------- Vær på Fold ---------------- */

/** true når værsiden har bred layout (≥ 700 dp): detaljarkene åpnes da som sidepanel til høyre. */
internal val LocalWxWide25 = compositionLocalOf { false }
