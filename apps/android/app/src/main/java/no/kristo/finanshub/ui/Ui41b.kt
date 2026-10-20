package no.kristo.finanshub.ui

import android.annotation.SuppressLint
import android.content.Context
import android.location.LocationManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 41 (ANDROID41), del 2: 17. mai-Hjem (claude-code-17-mai.md), «Laget med Glimt» (claude-code-huskeliste-glimt-ai-bakgrunn.md)
 * og skolesoner (claude-code-ruter-forhandsruter-sebastian.md). Logikken ligger i P41.kt og Live41.kt.
 */

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

/* ======================= Gjøremål: «Laget med Glimt» ======================= */

/** Fanen/raden i lista: «✦ Laget med Glimt · N» (bare når det finnes minst én beskjed). */
@Composable
internal fun SourcesEntry41(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id, vm.tasks) { if (vm.p41.sources == null || vm.p41.glimtJobs.isEmpty()) vm.loadSources41() }
    val n = vm.p41.sources?.size ?: 0
    if (n == 0) return
    Row(
        Modifier.clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { Haptics.select(); vm.p41.srcOpen = true }.padding(14.dp, 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(p.lab))
        Text("✦ Laget med Glimt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Text("$n", color = p.mut, fontSize = 12.5.sp)
    }
}

/** Ett kort per beskjed: ORIGINAL BESKJED + tid, beskjeden ordrett i kursiv, meta, punktene i rekkefølge, «✦ Del opp på nytt» og «Glem beskjeden». */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SourcesSheet41(vm: AppViewModel) {
    val p = PaperPal.current
    val list = vm.p41.sources ?: emptyList()
    ModalBottomSheet(onDismissRequest = { vm.p41.srcOpen = false }, containerColor = p.bg, contentColor = p.ink,
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().heightIn(max = 640.dp).verticalScroll(rememberScrollState()).navigationBarsPadding().padding(18.dp, 0.dp, 18.dp, 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Laget med Glimt", 26.sp)
            if (list.isEmpty()) Text("Ingen beskjeder ennå.", color = p.mut, fontSize = 13.sp)
            list.forEach { src ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row {
                        PLabel("Original beskjed", modifier = Modifier.weight(1f))
                        Text(src.createdAt?.let { c -> epoch41(c)?.let { ms -> java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).let { "%02d.%02d %02d:%02d".format(it.dayOfMonth, it.monthValue, it.hour, it.minute) } } } ?: "",
                            color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp)
                    }
                    Text("«${src.text}»", color = p.ink, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 16.sp, lineHeight = 22.sp)
                    Text(listOfNotNull("${src.count} punkter", src.engine?.let { "✦ $it" }, src.deleted.takeIf { it > 0 }?.let { "$it slettet" }, src.by?.let { "av ${firstName37(it)}" }).joinToString(" · "),
                        color = p.mut, fontSize = 12.sp)
                    src.items.forEachIndexed { i, (t, done) ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("${i + 1}", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.width(18.dp))
                            Text(t, color = if (done) p.mut else p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            if (done) Text("✓", color = p.pos, fontWeight = FontWeight.Bold)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PButton("✦ Del opp på nytt", Modifier.weight(1f), kind = "line", height = 40.dp) { vm.redoSource41(src.id, src.text) }
                        PButton("Glem beskjeden", Modifier.weight(1f), kind = "line", height = 40.dp) { vm.forgetSource41(src.id) }
                    }
                }
            }
        }
    }
}

/* ======================= Skolesoner ======================= */

private tailrec fun act41(c: Context): android.app.Activity? = when (c) { is android.app.Activity -> c; is android.content.ContextWrapper -> act41(c.baseContext); else -> null }

@SuppressLint("MissingPermission")
private fun lastFix41(ctx: Context): android.location.Location? {
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching { listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER).mapNotNull { lm.getLastKnownLocation(it) }.maxByOrNull { it.time } }.getOrNull()
}

/** «SKOLESONER · ALLE TELLER SOM SKOLE»: chips med navn + radius, «+ Sone» (posisjonen din, radius 50–300 m). Siste sone kan ikke slettes. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Zones41(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p41
    val ctx = LocalContext.current
    LaunchedEffect(vm.account?.id) { vm.loadZones41() }
    var del by remember { mutableStateOf<String?>(null) }
    PLabel("Skolesoner · alle teller som skole", p.mut)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        (s.zones ?: emptyList()).forEach { z ->
            val armed = del == z.id
            Text(if (armed) "Slett ${z.name}?" else z.label, color = if (armed) p.lab else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp,
                modifier = Modifier.clip(CircleShape).border(1.dp, if (armed) p.lab else p.line, CircleShape)
                    .clickable { if (armed) { vm.deleteZone41(z); del = null } else if ((s.zones?.size ?: 0) > 1) del = z.id else vm.message = "Den siste skolesonen kan ikke slettes" }.padding(12.dp, 7.dp))
        }
        Text("+ Sone", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
            modifier = Modifier.clip(CircleShape).background(p.ink).clickable(role = Role.Button) {
                if (ctx.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                    act41(ctx)?.requestPermissions(arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION), 4141)
                s.zoneErr = null; s.zoneAdd = true
            }.padding(12.dp, 7.dp))
    }
    if (s.zoneAdd) {
        var name by remember { mutableStateOf("") }
        var r by remember { mutableFloatStateOf(150f) }
        val fix = remember { lastFix41(ctx) }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.bg).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PField("Navn", name, { name = it }, placeholder = "F.eks. Idrettshallen")
            Text(if (fix != null) "Punkt: posisjonen din nå (±${Math.round(fix.accuracy)} m)" else "Fant ingen posisjon. Slå på posisjon og prøv igjen.", color = p.mut, fontSize = 12.5.sp)
            Text("Radius ${r.toInt()} m", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Slider(r, { r = (it / 10f).toInt() * 10f }, valueRange = 50f..300f, colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink))
            s.zoneErr?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line", height = 40.dp) { s.zoneAdd = false }
                PButton("Lagre sone", Modifier.weight(1f), height = 40.dp) { if (fix != null) vm.addZone41(name, fix.latitude, fix.longitude, r.toInt()) else s.zoneErr = "Mangler posisjon" }
            }
        }
    }
    Text("Når du forlater siste skolesone (og er ute i 2 min, hverdager 07–18) vises Min reise på Hjem og som Live Update.", color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
}
