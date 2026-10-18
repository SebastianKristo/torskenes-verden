package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.MotionEvent
import android.view.View
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import no.kristo.finanshub.*
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline
import java.util.concurrent.atomic.AtomicBoolean

/*
 * Prompt 20: kartet i Familie uten krasj.
 *
 * Det som kunne krasje før (Family16.FamilyMap):
 *  - onDispose kalte MapView.onDetach() selv, og MapView kaller onDetach() igjen i onDetachedFromWindow. Etter første
 *    onDetach er repository/flisleverandør revet ned, så en ny update { } (Marker(map)/Polygon(map) bruker map.repository)
 *    eller en sen tegning/flisforespørsel kastet NullPointerException/RejectedExecutionException på hovedtråden.
 *  - Ingen beskyttelse rundt factory/update/tegning: én feil i osmdroid tok ned hele appen.
 *  - Fliser fra tile.openstreetmap.org (MAPNIK), som blokkerer appen med 403.
 * Nå: Configuration lastes én gang før første MapView, livssyklusen følger aktiviteten (onResume/onPause, aldri onDetach
 * manuelt), alle osmdroid-kall er i try/catch, og en feilgrense viser «Kartet kunne ikke lastes» med «Prøv igjen».
 */

/** Logger kartfeil til logcat og en liten lokal fil (filesDir/map-errors.log), så de kan hentes ut senere. */
internal object MapLog {
    fun log(ctx: Context, e: Throwable) {
        Log.e("FinansHub", "Kart: ${e.javaClass.simpleName}: ${e.message}", e)
        runCatching {
            val f = java.io.File(ctx.filesDir, "map-errors.log")
            if (f.exists() && f.length() > 32_000) f.writeText(f.readText().takeLast(16_000))
            f.appendText("${java.time.Instant.now()} ${e.javaClass.name}: ${e.message}\n" + e.stackTrace.take(12).joinToString("\n") { "  at $it" } + "\n")
        }
    }
}

/** osmdroid-oppsett én gang per prosess, før første MapView: user agent, cache i appens egen mappe. */
private object MapSetup {
    private val done = AtomicBoolean(false)
    fun prepare(ctx: Context) {
        if (done.get()) return
        val c = ctx.applicationContext
        val cfg = Configuration.getInstance()
        cfg.load(c, c.getSharedPreferences("osmdroid", Context.MODE_PRIVATE))
        val version = runCatching { c.packageManager.getPackageInfo(c.packageName, 0).versionName }.getOrNull() ?: "1"
        cfg.userAgentValue = c.packageName + "/" + version
        cfg.osmdroidBasePath = java.io.File(c.cacheDir, "osmdroid").apply { mkdirs() }
        cfg.osmdroidTileCache = java.io.File(c.cacheDir, "osm-tiles").apply { mkdirs() }
        done.set(true)
    }

    /** Bearer-tokenet sendes bare til homelab-proxyen, aldri til Kartverket direkte. */
    fun auth(token: String?) {
        val h = Configuration.getInstance().additionalHttpRequestProperties
        if (token.isNullOrBlank()) h.remove("Authorization") else h.put("Authorization", "Bearer $token")
    }
}

/** Fliser fra en URL-mal: {s} (a–d), {z} {x} {y} og {r} (@2x på skjermer med høy tetthet). */
private class TemplateTileSource(private val spec: MapTiles) :
    OnlineTileSourceBase(spec.name, 0, spec.maxZoom, 256, ".png", arrayOf(spec.template)) {
    override fun getTileURLString(pMapTileIndex: Long): String {
        val z = MapTileIndex.getZoom(pMapTileIndex)
        val x = MapTileIndex.getX(pMapTileIndex)
        val y = MapTileIndex.getY(pMapTileIndex)
        val sub = "abcd"[Math.floorMod(x + y, 4)].toString()
        return spec.template.replace("{s}", sub).replace("{z}", z.toString()).replace("{x}", x.toString()).replace("{y}", y.toString())
            .replace("{r}", if (spec.retina) "@2x" else "")
    }
}

/** MapView som aldri lar en feil i tegning, berøring eller layout ta ned appen; feilen går til feilgrensen. */
private class SafeMapView(ctx: Context, private val onError: (Throwable) -> Unit) : MapView(ctx) {
    var tilesName: String? = null
    private fun fail(e: Throwable) { Handler(Looper.getMainLooper()).post { onError(e) } }
    override fun dispatchDraw(canvas: Canvas) { try { super.dispatchDraw(canvas) } catch (e: Exception) { fail(e) } }
    override fun dispatchTouchEvent(event: MotionEvent): Boolean = try { super.dispatchTouchEvent(event) } catch (e: Exception) { fail(e); true }
    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) { try { super.onLayout(changed, l, t, r, b) } catch (e: Exception) { fail(e) } }
    override fun computeScroll() { try { super.computeScroll() } catch (e: Exception) { fail(e) } }
    override fun onDetachedFromWindow() { try { super.onDetachedFromWindow() } catch (e: Exception) { Log.w("FinansHub", "Kart: onDetach", e) } }
}

/** Papir (lyst): «light» med sepia(.25) saturate(.8), som på web. */
private fun paperFilter(): ColorMatrixColorFilter {
    val k = 0.25f
    val sepia = ColorMatrix(floatArrayOf(
        1 - k + k * .393f, k * .769f, k * .189f, 0f, 0f,
        k * .349f, 1 - k + k * .686f, k * .168f, 0f, 0f,
        k * .272f, k * .534f, 1 - k + k * .131f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    ))
    val sat = ColorMatrix().apply { setSaturation(.8f) }
    sepia.postConcat(sat)
    return ColorMatrixColorFilter(sepia)
}

/** Mørkt tema: invert(1) hue-rotate(180deg) brightness(.85), som anbefalt fra serveren (darkFilter). */
private fun darkFilter(): ColorMatrixColorFilter {
    val m = ColorMatrix(floatArrayOf(
        -1f, 0f, 0f, 0f, 255f,
        0f, -1f, 0f, 0f, 255f,
        0f, 0f, -1f, 0f, 255f,
        0f, 0f, 0f, 1f, 0f,
    ))
    m.postConcat(ColorMatrix(floatArrayOf(
        -0.574f, 1.43f, 0.144f, 0f, 0f,
        0.426f, 0.43f, 0.144f, 0f, 0f,
        0.426f, 1.43f, -0.856f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )))
    m.postConcat(ColorMatrix().apply { setScale(.85f, .85f, .85f, 1f) })
    return ColorMatrixColorFilter(m)
}

/**
 * Familie-kartet med feilgrense. Feiler kartet (osmdroid, fliser eller data), vises «Kartet kunne ikke lastes» og
 * «Prøv igjen», som lager kartet på nytt. Resten av Familie virker som før.
 */
@Composable
internal fun FamilyMapSafe(vm: AppViewModel, modifier: Modifier) {
    val ctx = LocalContext.current
    var failed by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { vm.loadMapConfig(); if (vm.famPositions == null) vm.loadPositions() }
    val err = failed
    if (err != null) {
        MapFallback(modifier, err) { failed = null; attempt++ }
        return
    }
    key(attempt) {
        FamilyMapView(vm, modifier) { e ->
            if (failed == null) { MapLog.log(ctx, e); failed = e.message ?: e.javaClass.simpleName }
        }
    }
}

@Composable
private fun MapFallback(modifier: Modifier, detail: String, retry: () -> Unit) {
    val p = PaperPal.current
    Box(modifier.background(p.surf2), contentAlignment = Alignment.Center) {
        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Kartet kunne ikke lastes", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(detail.take(120), color = p.mut, fontSize = 11.5.sp, textAlign = TextAlign.Center, maxLines = 2)
            PButton("Prøv igjen", height = 40.dp, kind = "line") { retry() }
        }
    }
}

@Composable
private fun FamilyMapView(vm: AppViewModel, modifier: Modifier, onError: (Throwable) -> Unit) {
    val ctx = LocalContext.current
    val f = vm.family
    val track = vm.famTrack
    val sel = vm.famSel
    val dark = Tone.paperDark
    val ink = PaperPal.current.ink.toArgb()
    val lab = PaperPal.current.lab.toArgb()
    val retina = remember { ctx.resources.displayMetrics.density >= 2f }
    // Prompt 21: alltid topo (Kartverket via /tiles); mørkt tema er samme fliser med mørkt fargefilter.
    val spec = vm.mapTiles("topo", retina)
    val tileKey = spec.name + if (dark) "-dark" else "-paper"
    val token = vm.mapToken
    var centered by remember { mutableStateOf(false) }
    var mapRef by remember { mutableStateOf<SafeMapView?>(null) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    // Livssyklusen til aktiviteten: onResume/onPause (ellers lastes ikke flisene). onDetach kalles av MapView selv.
    DisposableEffect(lifecycle, mapRef) {
        val m = mapRef
        val obs = LifecycleEventObserver { _, ev ->
            try {
                when (ev) { Lifecycle.Event.ON_RESUME -> m?.onResume(); Lifecycle.Event.ON_PAUSE -> m?.onPause(); else -> {} }
            } catch (e: Exception) { onError(e) }
        }
        if (m != null) lifecycle.addObserver(obs)
        onDispose {
            lifecycle.removeObserver(obs)
            runCatching { m?.onPause() }
        }
    }
    Box(modifier) {
        AndroidView(
            modifier = Modifier.matchParentSize(),
            factory = { c ->
                try {
                    MapSetup.prepare(c)
                    SafeMapView(c, onError).apply {
                        setDestroyMode(true)
                        setUseDataConnection(true)
                        setMultiTouchControls(true)
                        isTilesScaledToDpi = true
                        zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)
                        setMinZoomLevel(3.0)
                        controller.setZoom(12.0)
                        controller.setCenter(GeoPoint(59.9139, 10.7522))
                        mapRef = this
                    }
                } catch (e: Throwable) {
                    Handler(Looper.getMainLooper()).post { onError(e) }
                    View(c)
                }
            },
            update = { v ->
                val map = v as? SafeMapView ?: return@AndroidView
                try {
                    // Fliskilden: homelab-proxyen (med token) eller CARTO på eldre server. Byttes når tema/konfig endres.
                    if (map.tilesName != tileKey) {
                        MapSetup.auth(if (spec.auth) token else null)
                        map.setTileSource(TemplateTileSource(spec))
                        map.setMaxZoomLevel(spec.maxZoom.toDouble())
                        map.overlayManager.tilesOverlay.setColorFilter(if (dark) darkFilter() else paperFilter())
                        map.overlayManager.tilesOverlay.setLoadingBackgroundColor(if (dark) 0xFF24221E.toInt() else 0xFFE9E4D8.toInt())
                        map.overlayManager.tilesOverlay.setLoadingLineColor(if (dark) 0xFF2E2B26.toInt() else 0xFFDDD6C8.toInt())
                        map.tilesName = tileKey
                    }
                    drawOverlays(map, vm, f, track, sel, ink, lab)
                    // Sentrer på valgt person, ellers første med gyldig posisjon. Medlemmer uten posisjon hoppes over.
                    val target = (f?.members?.firstOrNull { it.userId == sel }?.last ?: f?.members?.firstNotNullOfOrNull { it.last })
                        ?.takeIf { validLatLon(it.lat, it.lon) }
                    if (target != null && !centered) { map.controller.setCenter(GeoPoint(target.lat, target.lon)); map.controller.setZoom(14.0); centered = true }
                    map.invalidate()
                } catch (e: Exception) { onError(e) }
            },
        )
        Text(spec.attribution, color = androidx.compose.ui.graphics.Color(0xFF1B1A17), fontSize = 9.sp, maxLines = 1,
            modifier = Modifier.align(Alignment.BottomEnd).padding(6.dp).background(androidx.compose.ui.graphics.Color.White.copy(alpha = .75f)).padding(4.dp, 1.dp))
    }
    LaunchedEffect(sel) { centered = false }
}

private fun drawOverlays(map: MapView, vm: AppViewModel, f: Family?, track: List<TrackPt>, sel: String?, ink: Int, lab: Int) {
    map.overlays.clear()
    map.overlays.add(MapEventsOverlay(object : MapEventsReceiver {
        override fun singleTapConfirmedHelper(pt: GeoPoint?): Boolean {
            if (pt == null || !validLatLon(pt.latitude, pt.longitude)) return false
            vm.famZoneDraft = pt.latitude to pt.longitude; return true
        }
        override fun longPressHelper(pt: GeoPoint?): Boolean = false
    }))
    f?.zones?.forEach { z ->
        if (!validLatLon(z.lat, z.lon) || !z.radius.isFinite() || z.radius <= 0) return@forEach
        val poly = Polygon(map)
        poly.setPoints(Polygon.pointsAsCircle(GeoPoint(z.lat, z.lon), z.radius))
        val col = z.color.toInt()
        poly.fillPaint.color = android.graphics.Color.argb(46, android.graphics.Color.red(col), android.graphics.Color.green(col), android.graphics.Color.blue(col))
        poly.outlinePaint.color = col
        poly.outlinePaint.strokeWidth = 4f
        poly.title = z.name
        poly.setOnClickListener { _, _, _ -> vm.famZoneEdit = z; true }
        map.overlays.add(poly)
    }
    val pts = track.filter { validLatLon(it.lat, it.lon) }
    if (pts.size > 1) {
        val line = Polyline(map)
        line.setPoints(pts.map { GeoPoint(it.lat, it.lon) })
        line.outlinePaint.color = lab
        line.outlinePaint.strokeWidth = 8f
        line.outlinePaint.strokeCap = Paint.Cap.ROUND
        map.overlays.add(line)
    }
    f?.members?.forEach { m ->
        val l = m.last ?: return@forEach
        if (m.sharing != "on" || !validLatLon(l.lat, l.lon)) return@forEach
        val mk = Marker(map)
        mk.position = GeoPoint(l.lat, l.lon)
        mk.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        mk.title = m.name
        mk.snippet = listOfNotNull(lastSeen(l.ts), l.battery?.let { "$it %" }).joinToString(" · ")
        val c = if (m.userId == sel) lab else vm.famColor(m.userId).toInt().takeIf { it != 0 } ?: ink
        mk.icon = avatarPin20(map.context, posInitials(m.name), c)
        mk.setOnMarkerClickListener { _, _ -> vm.famSelect(m.userId); true }
        map.overlays.add(mk)
    }
}

/** Rund markør med to bokstaver i personens farge (osmdroid bruker Drawable). */
private fun avatarPin20(ctx: Context, letters: String, color: Int): android.graphics.drawable.Drawable {
    val d = ctx.resources.displayMetrics.density
    val size = (40 * d).toInt().coerceAtLeast(8)
    val bmp = android.graphics.Bitmap.createBitmap(size, (size * 1.2f).toInt(), android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = color
    c.drawCircle(size / 2f, size / 2f, size / 2f - 2 * d, paint)
    val path = android.graphics.Path().apply { moveTo(size / 2f - 7 * d, size - 6 * d); lineTo(size / 2f + 7 * d, size - 6 * d); lineTo(size / 2f, size * 1.18f); close() }
    c.drawPath(path, paint)
    paint.color = android.graphics.Color.WHITE
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 3 * d
    c.drawCircle(size / 2f, size / 2f, size / 2f - 3.5f * d, paint)
    paint.style = Paint.Style.FILL
    paint.textSize = 14 * d
    paint.textAlign = Paint.Align.CENTER
    paint.isFakeBoldText = true
    c.drawText(letters, size / 2f, size / 2f + 5 * d, paint)
    return android.graphics.drawable.BitmapDrawable(ctx.resources, bmp)
}
