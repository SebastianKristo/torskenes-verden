package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF
import android.graphics.Typeface
import android.view.MotionEvent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import no.kristo.finanshub.*
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Overlay
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin

/*
 * Prompt 46: Kart (claude-code-kart-side.md, fasit Kart.dc.html). Kartverket gråtone (WMTS webmercator) i osmdroid (finnes fra før),
 * holdeplasser/soner/personer/kjøretøy tegnes i ett eget lag. Bred visning (≥ 900 dp, Fold åpen liggende) har fast panel til venstre
 * (372 dp); smalere har bunnark med tre høyder (lav 228 · halv 52 % · høy 86 %). Data og lagring: Kart46.kt.
 */

/** Fliser fra en {z}/{y}/{x}-mal (Kartverket WMTS). */
private class KTiles46(private val tpl: String) : OnlineTileSourceBase("kart46-" + tpl.hashCode(), 3, 18, 256, ".png", arrayOf(tpl)) {
    override fun getTileURLString(i: Long): String =
        tpl.replace("{z}", MapTileIndex.getZoom(i).toString()).replace("{x}", MapTileIndex.getX(i).toString()).replace("{y}", MapTileIndex.getY(i).toString())
}

/** Ett lag for alt: soner, holdeplasser, personer og kjøretøy (glir mellom posisjonene over pollintervallet). */
private class KOverlay46(ctx: Context) : Overlay() {
    private val d = ctx.resources.displayMetrics.density
    var zones: List<KZone46> = emptyList()
    var stops: List<KStop46> = emptyList()
    var people: List<KPerson46> = emptyList()
    var md: Set<String> = MODES46.toSet()
    var show: Map<String, Boolean> = emptyMap()
    var selId: String? = null
    var reduce = false
    var onStop: ((KStop46) -> Unit)? = null
    private class Track(var fLat: Double, var fLon: Double, var tLat: Double, var tLon: Double, var t0: Long, var v: KVehicle46)
    private val tracks = HashMap<String, Track>()
    private val pt = Point()
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); textAlign = Paint.Align.CENTER }
    private val POLL = 10_000L

    fun setVehicles(list: List<KVehicle46>) {
        val now = System.currentTimeMillis()
        val keep = HashSet<String>()
        for (v in list) {
            keep += v.id
            val t = tracks[v.id]
            if (t == null) tracks[v.id] = Track(v.lat, v.lon, v.lat, v.lon, now, v)
            else { val (la, lo) = pos(t, now); t.fLat = la; t.fLon = lo; t.tLat = v.lat; t.tLon = v.lon; t.t0 = now; t.v = v }
        }
        tracks.keys.retainAll(keep)
    }
    private fun pos(t: Track, now: Long): Pair<Double, Double> {
        if (reduce) return t.tLat to t.tLon
        val f = ((now - t.t0).toFloat() / POLL).coerceIn(0f, 1f).toDouble()
        return (t.fLat + (t.tLat - t.fLat) * f) to (t.fLon + (t.tLon - t.fLon) * f)
    }

    override fun draw(c: Canvas, map: MapView, shadow: Boolean) {
        if (shadow) return
        val pr = map.projection
        val z = map.zoomLevelDouble
        if (show["zones"] != false) for (zn in zones) {
            pr.toPixels(GeoPoint(zn.lat, zn.lon), pt)
            val cx = pt.x.toFloat(); val cy = pt.y.toFloat()
            pr.toPixels(GeoPoint(zn.lat + zn.radius / 111_320.0, zn.lon), pt)
            val r = hypot(cx - pt.x, cy - pt.y)
            val col = (zn.color ?: 0xFF2E6F75L).toInt()
            fill.color = (col and 0x00FFFFFF) or 0x22000000; c.drawCircle(cx, cy, r, fill)
            line.color = col; line.strokeWidth = 2f * d
            line.pathEffect = if (zn.live) null else android.graphics.DashPathEffect(floatArrayOf(6 * d, 4 * d), 0f)
            c.drawCircle(cx, cy, r, line); line.pathEffect = null
            val label = zn.name + if (zn.live) " · LIVE" else ""
            text.textSize = 11f * d; val w = text.measureText(label) + 14 * d
            fill.color = col; c.drawRoundRect(RectF(cx - w / 2, cy - r - 22 * d, cx + w / 2, cy - r - 4 * d), 9 * d, 9 * d, fill)
            text.color = 0xFFFFFFFF.toInt(); c.drawText(label, cx, cy - r - 9 * d, text)
        }
        if (show["stops"] != false && z >= 14) for (s in stops) {
            val m = s.modes.firstOrNull { it in md } ?: continue
            pr.toPixels(GeoPoint(s.lat, s.lon), pt)
            val col = (MODE_COLOR46[m] ?: 0xFFC8372DL).toInt()
            val big = z >= 15 || s.id == selId
            val r = (if (big) 7f else 4.5f) * d
            fill.color = 0xFFFFFFFF.toInt(); c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), r + 1.5f * d, fill)
            fill.color = col; c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), r, fill)
            if (s.id == selId) { line.color = 0xFF1B1A17.toInt(); line.strokeWidth = 2.5f * d; c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), r + 4 * d, line) }
            if (z >= 16) {
                text.textSize = 11f * d; text.color = 0xFF1B1A17.toInt()
                val o = Paint(text).apply { style = Paint.Style.STROKE; strokeWidth = 3 * d; color = 0xEEFFFFFF.toInt() }
                c.drawText(s.name, pt.x.toFloat(), pt.y + r + 13 * d, o); c.drawText(s.name, pt.x.toFloat(), pt.y + r + 13 * d, text)
            }
        }
        if (show["people"] != false) for (p in people) {
            pr.toPixels(GeoPoint(p.lat, p.lon), pt)
            val col = (p.color ?: 0xFF2B5D8AL).toInt()
            if (p.self && !reduce) {
                val ph = (System.currentTimeMillis() % 2000L) / 2000f
                fill.color = (col and 0x00FFFFFF) or (((1f - ph) * 90).toInt() shl 24)
                c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), (12 + 18 * ph) * d, fill)
            }
            fill.color = 0xFFFFFFFF.toInt(); c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), 13 * d, fill)
            fill.color = col; c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), 11 * d, fill)
            text.textSize = 11f * d; text.color = 0xFFFFFFFF.toInt()
            c.drawText(if (p.self) "Du" else p.name.take(1).uppercase(), pt.x.toFloat(), pt.y + 4 * d, text)
        }
        var moving = people.any { it.self } && !reduce
        if (show["vehicles"] != false) {
            val now = System.currentTimeMillis()
            for (t in tracks.values) {
                if (t.v.mode !in md) continue
                val (la, lo) = pos(t, now)
                if (!reduce && now - t.t0 < POLL && (t.fLat != t.tLat || t.fLon != t.tLon)) moving = true
                pr.toPixels(GeoPoint(la, lo), pt)
                val col = (MODE_COLOR46[t.v.mode] ?: 0xFFC8372DL).toInt()
                val label = t.v.line.ifBlank { "•" }
                text.textSize = 11f * d
                val w = maxOf(text.measureText(label) + 12 * d, 24 * d); val h = 18 * d
                t.v.bearing?.let { b ->
                    val a = Math.toRadians(b - 90)
                    val tipX = pt.x + (cos(a) * (w / 2 + 6 * d)).toFloat(); val tipY = pt.y + (sin(a) * (h / 2 + 6 * d)).toFloat()
                    val path = android.graphics.Path().apply {
                        moveTo(tipX, tipY)
                        lineTo(pt.x + (cos(a + .5) * w / 2.4).toFloat(), pt.y + (sin(a + .5) * h / 1.6).toFloat())
                        lineTo(pt.x + (cos(a - .5) * w / 2.4).toFloat(), pt.y + (sin(a - .5) * h / 1.6).toFloat()); close()
                    }
                    fill.color = col; c.drawPath(path, fill)
                }
                fill.color = 0xFFFFFFFF.toInt(); c.drawRoundRect(RectF(pt.x - w / 2 - 1.5f * d, pt.y - h / 2 - 1.5f * d, pt.x + w / 2 + 1.5f * d, pt.y + h / 2 + 1.5f * d), 7 * d, 7 * d, fill)
                fill.color = col; c.drawRoundRect(RectF(pt.x - w / 2, pt.y - h / 2, pt.x + w / 2, pt.y + h / 2), 6 * d, 6 * d, fill)
                text.color = 0xFFFFFFFF.toInt(); c.drawText(label, pt.x.toFloat(), pt.y + 4 * d, text)
            }
        }
        if (moving) map.postInvalidateDelayed(66)
    }

    override fun onSingleTapConfirmed(e: MotionEvent, map: MapView): Boolean {
        if (show["stops"] == false || map.zoomLevelDouble < 14) return false
        val pr = map.projection
        var best: KStop46? = null; var bd = 24 * d
        for (s in stops) {
            if (s.modes.none { it in md }) continue
            pr.toPixels(GeoPoint(s.lat, s.lon), pt)
            val dd = hypot(e.x - pt.x, e.y - pt.y)
            if (dd < bd) { bd = dd; best = s }
        }
        best?.let { onStop?.invoke(it); return true }
        return false
    }
}

@Composable
internal fun KartPage46(vm: AppViewModel) {
    val k = vm.p46.kart
    val p = PaperPal.current
    BackHandler { vm.closeKart46() }
    BoxWithConstraints(Modifier.fillMaxSize().background(Color(0xFFE9E7E2)).clickable(remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, null) {}) {
        val wide = maxWidth >= 900.dp
        val h = maxHeight
        if (k.missing) {
            Column(Modifier.align(Alignment.Center).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PSerif("Kart finnes ikke på serveren ennå", 22.sp)
                Text("Oppdater Homelab for å få holdeplasser, sanntid og soner.", color = p.mut, fontSize = 14.sp)
                PButton("‹ Tilbake", kind = "line", height = 44.dp) { vm.closeKart46() }
            }
            return@BoxWithConstraints
        }
        KMap46(vm, Modifier.fillMaxSize())
        // Topp: «‹ Mer» først i chip-raden, deretter transportmidlene; kilden under.
        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(start = if (wide) 388.dp else 12.dp, end = 12.dp, top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                KChip46("‹ Mer", true, Color(0xFF1B1A17)) { vm.closeKart46() }
                MODES46.forEach { m -> KChip46(MODE_NAME46[m] ?: m, m in k.prefs.md, Color(MODE_COLOR46[m] ?: 0xFF1B1A17L)) { vm.kartMode46(m) } }
            }
            Text(k.sourceText, color = if (k.demo) Color(0xFFB23A2A) else Color(0xFF2F7A4F), fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 10.5.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = .9f)).padding(8.dp, 3.dp))
            k.stopsNote?.let { Text(it, color = Color(0xFF1B1A17), fontSize = 12.sp, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = .9f)).padding(8.dp, 3.dp)) }
        }
        // Zoom og «Min posisjon» til høyre.
        val sheetH = when (k.sheet) { "full" -> h * .86f; "half" -> h * .52f; else -> 228.dp }
        Column(Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = if (wide) 24.dp else sheetH + 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            KMapBtn46("+", "Zoom inn") { vm.kartFly46(k.prefs.lat, k.prefs.lon, (k.prefs.z + 1).coerceAtMost(18.0)) }
            KMapBtn46("−", "Zoom ut") { vm.kartFly46(k.prefs.lat, k.prefs.lon, (k.prefs.z - 1).coerceAtLeast(11.0)) }
            KMapBtn46("➤", "Min posisjon") { k.people.firstOrNull { it.self }?.let { vm.kartFly46(it.lat, it.lon, 16.0) } ?: run { vm.message = "Fant ikke posisjonen din. Slå på deling i Familie." } }
        }
        if (wide) Box(Modifier.align(Alignment.TopStart).fillMaxHeight().width(372.dp).statusBarsPadding().padding(12.dp)) {
            Column(Modifier.fillMaxSize().shadow(16.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(p.bg).padding(16.dp)) { KPanel46(vm, Modifier.weight(1f)) }
        } else {
            val ah by animateDpAsState(sheetH, spring(dampingRatio = .85f, stiffness = 380f), label = "sheet46")
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(ah).shadow(18.dp, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)).background(p.bg).navigationBarsPadding()) {
                // Håndtak: trykk bytter høyde, dra opp/ned velger neste/forrige.
                Box(Modifier.fillMaxWidth().height(28.dp).clickable(onClickLabel = "Bytt høyde på panelet") {
                    k.sheet = when (k.sheet) { "peek" -> "half"; "half" -> "full"; else -> "peek" }; Haptics.select()
                }.pointerInput(Unit) {
                    var acc = 0f
                    detectVerticalDragGestures(onDragEnd = {
                        if (acc < -40) k.sheet = if (k.sheet == "peek") "half" else "full"
                        if (acc > 40) k.sheet = if (k.sheet == "full") "half" else "peek"
                        acc = 0f; Haptics.select()
                    }) { ch, dy -> ch.consume(); acc += dy }
                }, contentAlignment = Alignment.Center) { Box(Modifier.size(36.dp, 5.dp).clip(CircleShape).background(p.line)) }
                Column(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp)) { KPanel46(vm, Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun KChip46(t: String, on: Boolean, col: Color, onClick: () -> Unit) {
    Box(Modifier.height(34.dp).shadow(4.dp, CircleShape).clip(CircleShape).background(if (on) col else Color.White).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) { Text(t, color = if (on) Color.White else Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
}

@Composable
private fun KMapBtn46(t: String, desc: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).shadow(6.dp, RoundedCornerShape(12.dp)).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .96f))
        .clickable(role = Role.Button, onClickLabel = desc) { Haptics.select(); onClick() }, contentAlignment = Alignment.Center) {
        Text(t, color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 20.sp)
    }
}

/** Kartet (osmdroid) med feilgrense: feiler noe, vises en melding i stedet for at appen krasjer. */
@Composable
private fun KMap46(vm: AppViewModel, modifier: Modifier) {
    val k = vm.p46.kart
    val ctx = LocalContext.current
    val reduce = reduceMotion45()
    var failed by remember { mutableStateOf<String?>(null) }
    var mapRef by remember { mutableStateOf<MapView?>(null) }
    val overlay = remember { KOverlay46(ctx.applicationContext) }
    overlay.onStop = { vm.kartPick46(it) }
    overlay.reduce = reduce
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, mapRef) {
        val m = mapRef
        val obs = LifecycleEventObserver { _, ev -> runCatching { when (ev) { Lifecycle.Event.ON_RESUME -> m?.onResume(); Lifecycle.Event.ON_PAUSE -> m?.onPause(); else -> {} } } }
        if (m != null) lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs); runCatching { m?.onPause() } }
    }
    LaunchedEffect(k.vehSeq) { overlay.setVehicles(k.vehicles); mapRef?.invalidate() }
    LaunchedEffect(k.flySeq, mapRef) {
        val f = k.fly ?: return@LaunchedEffect
        val m = mapRef ?: return@LaunchedEffect
        runCatching { if (reduce) { m.controller.setZoom(f.third); m.controller.setCenter(GeoPoint(f.first, f.second)) } else m.controller.animateTo(GeoPoint(f.first, f.second), f.third, 450L) }
    }
    val err = failed
    if (err != null) {
        Box(modifier.background(Color(0xFFE9E7E2)), contentAlignment = Alignment.Center) { Text("Kartet kunne ikke lastes · $err", color = Color(0xFF6B655B), fontSize = 13.sp) }
        return
    }
    var tilesFor by remember { mutableStateOf<String?>(null) }
    AndroidView(
        modifier = modifier,
        factory = { c ->
            try {
                MapSetup.prepare(c)
                SafeMapView(c) { e -> MapLog.log(c, e); failed = e.message ?: e.javaClass.simpleName }.apply {
                    setDestroyMode(true); setUseDataConnection(true); setMultiTouchControls(true); isTilesScaledToDpi = true
                    zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)
                    setMinZoomLevel(11.0); setMaxZoomLevel(18.0)
                    controller.setZoom(k.prefs.z); controller.setCenter(GeoPoint(k.prefs.lat, k.prefs.lon))
                    overlays.add(overlay)
                    // Rapporterer utsnittet når kartet har stått stille i 400 ms (holdeplasser + lagring av z/c).
                    val report = Runnable {
                        runCatching {
                            val bb = boundingBox
                            val ce = mapCenter
                            vm.kartMoved46(ce.latitude, ce.longitude, zoomLevelDouble, bb.latSouth, bb.lonWest, bb.latNorth, bb.lonEast)
                        }
                    }
                    addMapListener(object : MapListener {
                        override fun onScroll(event: ScrollEvent?): Boolean { removeCallbacks(report); postDelayed(report, 400); return false }
                        override fun onZoom(event: ZoomEvent?): Boolean { removeCallbacks(report); postDelayed(report, 400); return false }
                    })
                    post(report)
                    mapRef = this
                }
            } catch (e: Throwable) { failed = e.message ?: e.javaClass.simpleName; android.view.View(c) }
        },
        update = { v ->
            val m = v as? MapView ?: return@AndroidView
            runCatching {
                if (tilesFor != k.tilesUrl + k.tilesAuth) {
                    MapSetup.auth(if (k.tilesAuth) vm.mapToken else null) // tokenet bare til vår egen /tiles-proxy, aldri til Kartverket direkte
                    m.setTileSource(KTiles46(k.tilesUrl)); tilesFor = k.tilesUrl + k.tilesAuth
                    m.overlayManager.tilesOverlay.setLoadingBackgroundColor(0xFFE9E7E2.toInt())
                }
                overlay.zones = k.zones; overlay.stops = k.stops; overlay.people = k.people
                overlay.md = k.prefs.md; overlay.show = k.prefs.show; overlay.selId = k.sel?.id
                m.invalidate()
            }
        },
    )
}

/** Panelinnholdet: søk, holdeplass med avganger, eller fanene Lag · Soner · Personer. */
@Composable
private fun KPanel46(vm: AppViewModel, modifier: Modifier) {
    val k = vm.p46.kart
    val p = PaperPal.current
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                if (k.q.isEmpty()) Text("Søk etter holdeplass", color = p.mut, fontSize = 14.sp)
                BasicTextField(k.q, { vm.kartSearch46(it) }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 14.sp), cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth())
            }
            if (k.q.isNotEmpty()) Text("✕", color = p.mut, modifier = Modifier.clickable { vm.kartSearch46("") }.padding(6.dp))
        }
        if (k.hits.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card)) {
            k.hits.forEachIndexed { i, hit ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().clickable {
                    vm.kartSearch46(""); vm.kartFly46(hit.lat, hit.lon, 16.0)
                    if (hit.id?.startsWith("NSR:StopPlace:") == true) vm.kartPick46(KStop46(hit.id, hit.name, hit.lat, hit.lon, hit.modes))
                }.padding(12.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ModeDots46(hit.modes)
                    Column(Modifier.weight(1f)) {
                        Text(hit.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                        Text(hit.label, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        val sel = k.sel
        if (sel != null) { StopPanel46(vm, sel); return@Column }
        Row(Modifier.fillMaxWidth().clip(CircleShape).background(p.card).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("lag" to "Lag", "soner" to "Soner", "personer" to "Personer").forEach { (key, n) ->
                Box(Modifier.weight(1f).height(34.dp).clip(CircleShape).background(if (k.tab == key) p.ink else Color.Transparent).clickable { Haptics.select(); k.tab = key },
                    contentAlignment = Alignment.Center) { Text(n, color = if (k.tab == key) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
            }
        }
        when (k.tab) {
            "soner" -> {
                if (k.zones.isEmpty()) Text("Ingen soner ennå. Lag soner i Familie → Soner.", color = p.mut, fontSize = 13.sp)
                k.zones.forEach { z ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).clickable { vm.kartFly46(z.lat, z.lon, zoneZoom46(z.radius)) }.padding(12.dp, 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(12.dp).clip(CircleShape).background(Color(z.color ?: 0xFF2E6F75L)))
                        Column(Modifier.weight(1f)) {
                            Text(z.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                            Text("${z.radius.roundToInt()} m" + if (z.live) " · sanntid på" else "", color = p.mut, fontSize = 12.sp)
                        }
                        Box(Modifier.height(32.dp).clip(CircleShape).background(if (z.live) Color(0xFF2F7A4F) else p.bg).border(1.dp, p.line, CircleShape)
                            .clickable(role = Role.Button) { vm.kartLive46(z) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                            Text(if (z.live) "LIVE" else "Sanntid", color = if (z.live) Color.White else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
            }
            "personer" -> {
                if (k.people.isEmpty()) Text("Ingen deler posisjon med deg akkurat nå.", color = p.mut, fontSize = 13.sp)
                k.people.forEach { m ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).clickable { vm.kartFly46(m.lat, m.lon, 16.0) }.padding(12.dp, 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(Color(m.color ?: 0xFF2B5D8AL)), contentAlignment = Alignment.Center) {
                            Text(if (m.self) "Du" else m.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }
                        Column(Modifier.weight(1f)) {
                            Text(m.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                            Text(listOfNotNull(m.zone, m.updatedAt?.let { ago46(it) }).joinToString(" · ").ifBlank { "Posisjon delt" }, color = p.mut, fontSize = 12.sp, maxLines = 1)
                        }
                    }
                }
            }
            else -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card)) {
                listOf("stops" to "Holdeplasser", "vehicles" to "Kjøretøy i sanntid", "zones" to "Mine soner", "people" to "Personer").forEachIndexed { i, (key, n) ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(Modifier.fillMaxWidth().padding(14.dp, 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(n, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            if (key == "vehicles") Text(if (k.prefs.vz.isEmpty()) "Velg «Sanntid» på en sone under Soner" else "${k.prefs.vz.size} soner · oppdateres hvert 10. s", color = p.mut, fontSize = 12.sp)
                            if (key == "stops") Text("Fra zoom 14 · navn fra zoom 16", color = p.mut, fontSize = 12.sp)
                        }
                        Switch(k.prefs.show[key] != false, { vm.kartLayer46(key, it) }, colors = SwitchDefaults.colors(checkedTrackColor = p.ink))
                    }
                }
            }
        }
        Text(k.attribution + " · Entur", color = p.mut, fontSize = 11.sp)
    }
}

@Composable
private fun ModeDots46(modes: List<String>) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) { modes.take(3).forEach { m -> Box(Modifier.size(10.dp).clip(CircleShape).background(Color(MODE_COLOR46[m] ?: 0xFFC8372DL))) } }
}

private fun ago46(iso: String): String? = runCatching {
    val m = java.time.Duration.between(java.time.Instant.parse(iso), java.time.Instant.now()).toMinutes()
    when { m < 1 -> "nå"; m < 60 -> "$m min siden"; m < 1440 -> "${m / 60} t siden"; else -> "${m / 1440} d siden" }
}.getOrNull()

/** Holdeplass: navn, transportmidler og avganger (linje, destinasjon, plattform, minutter og forsinkelse). */
@Composable
private fun StopPanel46(vm: AppViewModel, s: KStop46) {
    val k = vm.p46.kart
    val p = PaperPal.current
    val d = k.deps
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            PSerif(d?.stop?.name ?: s.name, 22.sp, maxLines = 2)
            Text((d?.stop?.modes ?: s.modes).joinToString(" · ") { MODE_NAME46[it] ?: it }, color = p.mut, fontSize = 12.5.sp)
        }
        Text("✕", color = p.mut, fontSize = 18.sp, modifier = Modifier.clip(CircleShape).clickable(onClickLabel = "Lukk holdeplass") { k.sel = null; k.deps = null }.padding(8.dp))
    }
    if (k.depsBusy) Text("Henter avganger …", color = p.mut, fontSize = 13.sp)
    if (d != null && d.calls.isEmpty()) Text("Ingen avganger de neste to timene.", color = p.mut, fontSize = 13.sp)
    d?.calls?.forEach { c ->
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).padding(10.dp, 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.widthIn(min = 38.dp).height(26.dp).clip(RoundedCornerShape(7.dp)).background(Color(MODE_COLOR46[c.mode] ?: 0xFFC8372DL)).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
                Text(c.line.ifBlank { "–" }, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
            }
            Column(Modifier.weight(1f)) {
                Text(c.to, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(c.platform?.let { "Plattform $it" }, c.time, if (c.delayMin > 0) "+${c.delayMin} min" else null).joinToString(" · "),
                    color = if (c.delayMin >= 3) Color(0xFFC0392B) else p.mut, fontSize = 12.sp, maxLines = 1)
            }
            Text(if (c.minutes <= 0) "nå" else "${c.minutes} min", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
    }
    if (d?.demo == true) Text("DEMO-DATA · Entur svarer ikke", color = Color(0xFFB23A2A), fontFamily = PaperFonts.mono, fontSize = 10.5.sp)
}
