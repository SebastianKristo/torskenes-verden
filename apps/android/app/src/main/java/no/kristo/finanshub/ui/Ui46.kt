package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
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
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/* Prompt 46 (ANDROID46): felles UI-biter. Se P46.kt for bakgrunn og rotårsaker. */

/* ======================= Familie: ikoner for Soner og Helse ======================= */

/** 24×24, strek 1,8, runde ender, currentColor (Icon-tint). Fasit: Mobil Papir App.dc.html → TSV. */
internal object FamIcons46 {
    private fun stroke(name: String, d: String): ImageVector = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).addPath(
        pathData = PathParser().parsePathString(d).toNodes(), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f,
        strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
    ).build()
    val zones: ImageVector by lazy { stroke("soner46", "M12 15s-3.5-3-3.5-6a3.5 3.5 0 0 1 7 0c0 3-3.5 6-3.5 6zM12 9h.01M5.5 14.2C3.9 14.9 3 15.9 3 17c0 2.2 4 4 9 4s9-1.8 9-4c0-1.1-.9-2.1-2.5-2.8") }
    val health: ImageVector by lazy { stroke("helse46", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM7.5 12.5h2.4l1.3-2.6 1.8 5 1.3-2.4h2.2") }
}

/* ======================= Media: «Vis detaljer» ======================= */

@Composable
internal fun MediaDetails46(vm: AppViewModel) {
    val p = PaperPal.current
    val calls = remember(vm.p43.error, vm.p44.playErr, vm.p44.errKind) { MediaLog46.recent().take(8) }
    val fmt = remember { SimpleDateFormat("HH:mm:ss", Locale("nb", "NO")) }
    Column(Modifier.padding(16.dp, 8.dp, 16.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val kind = when (vm.p46.mediaKind) {
            "token" -> "Utlogget (også /api/me avviste tokenet)"; "route" -> "Ruten finnes ikke på serveren (401 fra fellessjekken)"
            "upstream" -> "Tjenesten bak Homelab avviser nøkkelen"; "down" -> "Svarer ikke"; "check" -> "Sjekker innloggingen …"; else -> "–"
        }
        Text("Tolkning: $kind" + (vm.p46.mediaWhen?.let { " · kl. $it" } ?: ""), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
        Text("Server: ${vm.base} · token: ${if (vm.token46 != null) "ja" else "nei"}", color = p.mut, fontSize = 12.sp)
        if (calls.isEmpty()) Text("Ingen Media-kall er logget ennå.", color = p.mut, fontSize = 12.sp)
        calls.forEach { c ->
            val path = c.url.substringAfter("://").substringAfter('/', "").let { "/$it" }
            Text("${fmt.format(Date(c.at))}  ${c.method} $path → ${if (c.status > 0) c.status else "nett"} · ${c.ms} ms · auth ${if (c.auth) "ja" else "nei"}" +
                (c.err?.let { " · $it" } ?: ""), color = if (c.status in 200..299) p.mut else p.lab, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

/* ======================= Profilbilde med Glimt-ring ======================= */

/** conic-gradient(from 200deg, #b23a2a, #e8794a, #f2c14e, #3fbf9a, #4f8fd6, #7a5ad6, #b23a2a). */
private val RING46 = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFFF2C14E), Color(0xFF3FBF9A), Color(0xFF4F8FD6), Color(0xFF7A5AD6), Color(0xFFB23A2A))

/**
 * Profilknappen: 40 dp ytre, ring 2,5 dp i Glimt-fargene, 1,5 dp mellomrom i [gap] og bildet klippet til sirkel. Alle lag klippes
 * til sirkel og skyggen tegnes på en sirkel (ingen firkantet flate rundt bildet på Fold – claude-code-profilbilde-firkant-artefakt-ipad-fold.md).
 * Ringen roterer sakte (12 s) mens [busy]; «Fjern animasjoner»: statisk.
 */
@Composable
internal fun GlimtAvatar46(vm: AppViewModel, size: Dp = 40.dp, gap: Color = Color(0xFFF3EFE6), ink: Color = Color(0xFF1B1A17), busy: Boolean = false, label: String = "Innstillinger", onClick: () -> Unit) {
    val reduce = reduceMotion45()
    // Prompt 71: vinkelen som State, lest i drawBehind (tegnefasen) – profilknappen bygges ikke på nytt hvert bilde.
    val spin = if (busy && !reduce) rememberInfiniteTransition(label = "ring46").animateFloat(0f, 360f, infiniteRepeatable(tween(12_000, easing = androidx.compose.animation.core.LinearEasing)), label = "r") else null
    val inner = size - 8.dp
    Box(
        // Skyggen tegnes selv som en myk sirkel (y 2, radius 8, 25 % svart) – ikke som elevation-skygge, som i et lag med alpha
        // (Hjem-hilsenen på Fold tones med graphicsLayer) kan bli en firkantet flate.
        Modifier.size(size)
            .drawBehind {
                val r = size.toPx() / 2f
                drawCircle(Brush.radialGradient(listOf(Color.Black.copy(alpha = .25f), Color.Transparent), center = Offset(r, r + 2.dp.toPx()), radius = r + 8.dp.toPx()),
                    radius = r + 8.dp.toPx(), center = Offset(r, r + 2.dp.toPx()))
            }
            .clip(CircleShape)
            .drawBehind { rotate(110f + (spin?.value ?: 0f)) { drawCircle(Brush.sweepGradient(RING46), radius = size.toPx() / 2f + 2f) } }
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick).semantics { contentDescription = label }
            .padding(2.5.dp).clip(CircleShape).background(gap).padding(1.5.dp).clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) { AvatarImage(vm, inner.value.roundToInt(), gap, ink) }
}

/* ======================= Gjøremål: deloppgaver-spørsmål og «Fullført · Angre» ======================= */

@Composable
internal fun TaskDone46(vm: AppViewModel) {
    val p = PaperPal.current
    vm.p46.askSubs?.let { id ->
        val t = vm.tasks?.items?.firstOrNull { it.id == id }
        if (t == null) { vm.p46.askSubs = null } else {
            val n = t.subs.count { !it.done }
            AlertDialog(onDismissRequest = { vm.p46.askSubs = null }, containerColor = p.bg,
                title = { PSerif(if (n == 1) "1 deloppgave er ikke ferdig." else "$n deloppgaver er ikke ferdige.", 20.sp) },
                text = { Text("Fullfør alle?", color = p.mut, fontSize = 14.sp) },
                confirmButton = { TextButton({ vm.finishFromPage46(id, confirmed = true) }) { Text("Fullfør alle", color = p.lab, fontWeight = FontWeight.Bold) } },
                dismissButton = { TextButton({ vm.p46.askSubs = null }) { Text("Avbryt", color = p.ink) } })
        }
    }
    val toast = vm.p46.taskToast
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(toast != null, Modifier.navigationBarsPadding().padding(bottom = 96.dp), enter = fadeIn(tween(250)) + slideInVertically(tween(250)) { it / 2 }, exit = fadeOut(tween(200))) {
            val t = toast ?: vm.p46.taskToast
            Row(
                Modifier.widthIn(max = 520.dp).fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B1A17))
                    .padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(t?.text ?: "", color = Color(0xFFF3EFE6), fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { vm.undoTaskToast46() }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center) { Text("Angre", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            }
        }
    }
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
        // Dråpen: lys gradient (34 % → 16 % hvit), høylys øverst, tynn lys kant og myk skygge.
        Box(
            Modifier.offset { androidx.compose.ui.unit.IntOffset((pos.value * stepPx).roundToInt(), 0) }.size(cell, 30.dp)
                .graphicsLayer { scaleX = 1f + .18f * st; scaleY = 1f - .12f * st }
                .shadow(6.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                .clip(CircleShape)
                .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = .34f), Color.White.copy(alpha = .16f))))
                .border(1.dp, Color.White.copy(alpha = .45f), CircleShape)
                .drawBehind { drawLine(Color.White.copy(alpha = .55f), Offset(size.width * .25f, 2.dp.toPx()), Offset(size.width * .75f, 2.dp.toPx()), 1.2.dp.toPx(), cap = StrokeCap.Round) },
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

/* ======================= Ruter: posisjonsvarsel og vugging ======================= */

/** I normal visning: bare en liten linje når posisjon mangler (skolesonene virker ikke uten den). */
@Composable
internal fun TripLocNote46(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val bg = android.os.Build.VERSION.SDK_INT < 29 ||
        ctx.checkSelfPermission(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
    if (bg) return
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button) {
        runCatching { ctx.startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + ctx.packageName)).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Skolesonene trenger posisjon «Alltid».", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
        Text("Slå på ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
    }
}

/** Kortet vugger (±0,6°) i redigering, som de andre wiggle-kortene. Bare transform. */
internal fun Modifier.wiggle46(on: Boolean): Modifier = if (!on) this else composed {
    val r = rememberInfiniteTransition(label = "w46").animateFloat(-.6f, .6f, infiniteRepeatable(tween(300), RepeatMode.Reverse), label = "w")
    graphicsLayer { rotationZ = r.value }
}

/* ======================= Brett: jevn overgang til Hjem ======================= */

/**
 * Modulen skalerer ned (1 → 0,92) og tones ut mens Hjem-knappen går (190 ms), og Hjem tones inn fra 1,03 → 1,0 med fjær
 * (0,85 / 380). Kun transform + opacity i et eget lag (graphicsLayer), ingen layout-animasjon. «Fjern animasjoner»: crossfade 200 ms.
 */
@Composable
internal fun homeTx46(vm: AppViewModel, home: Boolean, wide: Boolean): Modifier {
    if (!wide) return Modifier
    val reduce = reduceMotion45()
    val leave by animateFloatAsState(if (vm.p45.homeLeaving && !home) 1f else 0f, tween(if (reduce) 200 else 190), label = "leave46")
    val enter = remember { Animatable(1f) }
    LaunchedEffect(home) {
        if (home && vm.p46.homeFromRail) {
            vm.p46.homeFromRail = false
            enter.snapTo(0f)
            enter.animateTo(1f, if (reduce) tween(200) else spring(dampingRatio = .85f, stiffness = 380f))
        }
    }
    return Modifier.graphicsLayer {
        val e = enter.value.coerceIn(0f, 1.05f)
        val k = if (reduce) 1f else (1f - .08f * leave) * (1.03f - .03f * e)
        scaleX = k; scaleY = k
        alpha = ((1f - leave) * e.coerceIn(0f, 1f)).coerceIn(0f, 1f)
    }
}

/* ======================= Oppdatering: «Står fast» ======================= */

@Composable
internal fun UpdStuck46(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Står fast: ingen fremgang på 3 minutter (${vm.p30.upd.stepText.ifBlank { "ukjent steg" }}).", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Prøv igjen", Modifier.weight(1f), height = 40.dp) { vm.retryUpd46(ctx) }
            PButton("Avbryt og gå tilbake", Modifier.weight(1.4f), kind = "line", height = 40.dp) { vm.abortUpd46(ctx) }
        }
        PButton("Vis logg", Modifier.fillMaxWidth(), kind = "line", height = 40.dp) { vm.showUpdLog46() }
    }
}

/* ======================= QR-innlogging: vis QR på innloggingsskjermen ======================= */

@Composable
internal fun QrLoginButton46(onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).border(1.dp, p.line, RoundedCornerShape(25.dp)).clickable(role = Role.Button) { Haptics.tap(); onClick() }.padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        WxIcon("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2", p.ink, 20.dp, stroke = 1.9f)
        Text("Logg inn med QR-kode", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
}

/** Stor QR (maks 320 dp, sentrert på Fold), nedtelling (2 min) og ny kode ved utløp. «Scan med Papir Finans på mobilen». */
@Composable
internal fun QrLoginScreen46(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p46
    androidx.activity.compose.BackHandler { vm.closeQrLogin46() }
    val q = s.qrShow
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(q?.sid) { while (true) { now = System.currentTimeMillis(); kotlinx.coroutines.delay(500) } }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, null) {}, contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 520.dp).fillMaxWidth().statusBarsPadding().navigationBarsPadding().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PSerif("Logg inn med QR-kode", 26.sp, modifier = Modifier.weight(1f), maxLines = 2)
                SheetButton30("Lukk", "secondary") { vm.closeQrLogin46() }
            }
            val err = s.qrShowErr
            if (q == null && err == null) Box(Modifier.size(280.dp), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator(color = p.ink) }
            if (q != null) {
                val mat = remember(q.payload) { runCatching { Qr46.matrix(q.payload) }.getOrNull() }
                Box(Modifier.widthIn(max = 320.dp).fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp)).background(Color.White).padding(14.dp)) {
                    if (mat != null) androidx.compose.foundation.Canvas(Modifier.fillMaxSize().semantics { contentDescription = "QR-kode for innlogging" }) {
                        val n = mat.size + 8
                        val c = size.minDimension / n
                        for (y in mat.indices) for (x in mat[y].indices) if (mat[y][x])
                            drawRect(Color.Black, Offset((x + 4) * c, (y + 4) * c), androidx.compose.ui.geometry.Size(c + .5f, c + .5f))
                    }
                    if (q.state == "scanned" || q.state == "approved") Box(Modifier.matchParentSize().background(Color.White.copy(alpha = .92f)), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(if (q.state == "approved") "Godkjent – logger inn …" else "Skannet" + (q.who?.let { " av $it" } ?: ""), color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            q.match?.let { Text(it, color = Color(0xFF1B1A17), fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 40.sp, letterSpacing = 6.sp) }
                            if (q.state == "scanned") Text("Sjekk at tallet er det samme på mobilen, og godkjenn der.", color = Color(0xFF6B655B), fontSize = 13.sp)
                        }
                    }
                }
                val left = ((q.expiresAt - now) / 1000).coerceAtLeast(0)
                Text(when (q.state) {
                    "denied" -> "Avvist på mobilen. Lager en ny kode …"
                    "approved" -> "Godkjent"
                    else -> if (left > 0) "Gjelder i ${left / 60}:${(left % 60).toString().padStart(2, '0')} · fornyes automatisk" else "Lager en ny kode …"
                }, color = p.mut, fontSize = 13.sp)
            }
            Text("Skann med Papir Finans på mobilen: Innstillinger → Konto → Logg inn på annen enhet (eller Mer → Logg inn på annen enhet).",
                color = p.ink, fontSize = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Text("Koden inneholder aldri passord eller token. Den nye enheten får sin egen innlogging, som du kan logge ut under Innstillinger → Enheter.",
                color = p.mut, fontSize = 12.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            err?.let {
                Text(it, color = p.lab, fontSize = 13.5.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                PButton("Prøv igjen", Modifier.fillMaxWidth(), height = 46.dp) { val srv = vm.p46.qrSrv; vm.closeQrLogin46(); vm.openQrLogin46(srv) }
            }
            Text("‹ Logg inn med passord i stedet", color = p.lab, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { vm.closeQrLogin46() }.padding(8.dp))
        }
    }
}
