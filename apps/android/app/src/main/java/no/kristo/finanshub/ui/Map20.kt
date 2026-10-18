package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.BitmapShader
import android.graphics.DashPathEffect
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Point
import android.graphics.PointF
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
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
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.res.ResourcesCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import no.kristo.finanshub.*
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Overlay
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

/* ---------------- Prompt 22: kartet i Familie etter Familie.dc.html ---------------- */

/** En sone på kartet: sirkel (fyll 13 %, kant 2 dp), ikon i 28 dp sirkel i sentrum og navnet i en hvit etikett under. */
internal class Fam22ZoneDraw(
    val id: String, val name: String, val lat: Double, val lon: Double, val radius: Double, val color: Int, val icon: String, val draft: Boolean,
)

/** En person på kartet: rund pin 40 dp (50 dp valgt) med 3 dp hvit kant, bilde eller initialer, og fart-badge. */
internal class Fam22PinDraw(
    val userId: String, val lat: Double, val lon: Double, val color: Int, val initials: String, val photo: android.graphics.Bitmap?,
    val selected: Boolean, val badge: String?,
)

internal class Fam22MapData(
    val zones: List<Fam22ZoneDraw>, val pins: List<Fam22PinDraw>, val trail: List<Pair<Double, Double>>, val trailColor: Int, val placing: Boolean,
)

/** Web-Mercator i dp (256 dp per flis, som i designet: isTilesScaledToDpi). */
private fun fam22Wx(lon: Double, z: Int) = (lon + 180) / 360 * 256 * Math.pow(2.0, z.toDouble())
private fun fam22Wy(lat: Double, z: Int): Double {
    val r = lat * Math.PI / 180
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * Math.pow(2.0, z.toDouble())
}

/** Styring av kartet fra knappene utenfor (Vis alle, zoom, Vis på kartet). Alle kall er beskyttet. */
internal class Fam22MapCtl {
    var view: MapView? = null
    private fun safe(block: (MapView) -> Unit) {
        val v = view ?: return
        try {
            if (v.width == 0) v.post { runCatching { block(v) } } else block(v)
        } catch (e: Exception) { Log.w("FinansHub", "Kart: styring", e) }
    }
    fun zoomIn() = safe { it.controller.setZoom(minOf(18.0, Math.round(it.zoomLevelDouble) + 1.0)) }
    fun zoomOut() = safe { it.controller.setZoom(maxOf(3.0, Math.round(it.zoomLevelDouble) - 1.0)) }
    fun center(lat: Double, lon: Double, zoom: Double?) = safe {
        if (!validLatLon(lat, lon)) return@safe
        if (zoom != null) it.controller.setZoom(zoom)
        it.controller.setCenter(GeoPoint(lat, lon))
    }
    /** Person valgt: sentrer, zoom minst til 14. */
    fun pick(lat: Double, lon: Double) = safe { center(lat, lon, maxOf(it.zoomLevelDouble, 14.0)) }
    /** «Vis alle»: midt i alle punktene, største zoom (15 → 9) der alle får plass (bredde − 60, høyde 380). */
    fun fit(points: List<Pair<Double, Double>>) = safe { v ->
        val pts = points.filter { validLatLon(it.first, it.second) }
        if (pts.isEmpty()) return@safe
        val la = pts.map { it.first }
        val lo = pts.map { it.second }
        val w = v.width / v.resources.displayMetrics.density - 60
        var z = 15
        while (z > 9 && (fam22Wx(lo.max(), z) - fam22Wx(lo.min(), z) > w || fam22Wy(la.min(), z) - fam22Wy(la.max(), z) > 380)) z--
        v.controller.setZoom(z.toDouble())
        v.controller.setCenter(GeoPoint((la.min() + la.max()) / 2, (lo.min() + lo.max()) / 2))
    }
    /** «Vis på kartet» for en sone: diameteren fyller maks 70 % av kartets høyde. */
    fun showZone(lat: Double, lon: Double, radius: Double, heightDp: Float) = safe {
        var zz = 16
        while (zz > 5 && radius * 2 / (156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2.0, zz.toDouble())) > heightDp * .7) zz--
        center(lat, lon, zz.toDouble())
    }
}

/**
 * Familie-kartet med feilgrense. Feiler kartet (osmdroid, fliser eller data), vises «Kartet kunne ikke lastes» og
 * «Prøv igjen», som lager kartet på nytt. Resten av Familie virker som før.
 */
@Composable
internal fun FamilyMapSafe(
    vm: AppViewModel, modifier: Modifier, data: Fam22MapData, ctl: Fam22MapCtl,
    onPin: (String) -> Unit, onTap: (Double, Double) -> Unit,
) {
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
        FamilyMapView(vm, modifier, data, ctl, onPin, onTap) { e ->
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
private fun FamilyMapView(
    vm: AppViewModel, modifier: Modifier, data: Fam22MapData, ctl: Fam22MapCtl,
    onPin: (String) -> Unit, onTap: (Double, Double) -> Unit, onError: (Throwable) -> Unit,
) {
    val ctx = LocalContext.current
    val retina = remember { ctx.resources.displayMetrics.density >= 2f }
    // Kartverket topo via /tiles (prompt 21/22), uten fargefilter: samme fliser som iOS (MKTileOverlay) og designet.
    val spec = vm.mapTiles("topo", retina)
    val tileKey = spec.name
    val token = vm.mapToken
    var mapRef by remember { mutableStateOf<SafeMapView?>(null) }
    val overlay = remember { Fam22Overlay(ctx.applicationContext) }
    overlay.onPin = onPin
    overlay.onTap = onTap
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
            if (ctl.view === m) ctl.view = null
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
                        controller.setCenter(GeoPoint(59.915, 10.76))
                        overlays.add(overlay)
                        mapRef = this
                        ctl.view = this
                    }
                } catch (e: Throwable) {
                    Handler(Looper.getMainLooper()).post { onError(e) }
                    View(c)
                }
            },
            update = { v ->
                val map = v as? SafeMapView ?: return@AndroidView
                try {
                    if (map.tilesName != tileKey) {
                        MapSetup.auth(if (spec.auth) token else null)
                        map.setTileSource(TemplateTileSource(spec))
                        map.setMaxZoomLevel(minOf(18, spec.maxZoom).toDouble())
                        map.overlayManager.tilesOverlay.setColorFilter(null)
                        map.overlayManager.tilesOverlay.setLoadingBackgroundColor(0xFFE9E5DC.toInt())
                        map.overlayManager.tilesOverlay.setLoadingLineColor(0xFFE9E5DC.toInt())
                        map.tilesName = tileKey
                    }
                    ctl.view = map
                    overlay.data = data
                    map.invalidate()
                } catch (e: Exception) { onError(e) }
            },
        )
        Text(spec.attribution.ifBlank { "© Kartverket" }, color = androidx.compose.ui.graphics.Color(0xFF555555), fontSize = 9.sp, maxLines = 1,
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 56.dp, bottom = 4.dp))
    }
}

/** Ikonbanene (24 × 24) som android.graphics.Path, lest én gang per nøkkel. */
private object Fam22Paths {
    private val cache = HashMap<String, android.graphics.Path>()
    fun get(key: String): android.graphics.Path? = cache.getOrPut(key) {
        val d = fam22IconPath(key)
        runCatching { androidx.compose.ui.graphics.vector.PathParser().parsePathString(d).toPath().asAndroidPath() }.getOrNull() ?: return null
    }
}

/** Tegner soner, spor og personer rett på kartets lerret, med samme mål som designet (dp). */
private class Fam22Overlay(ctx: Context) : Overlay() {
    var data: Fam22MapData? = null
    var onPin: (String) -> Unit = {}
    var onTap: (Double, Double) -> Unit = { _, _ -> }
    private val d = ctx.resources.displayMetrics.density
    private val bold: Typeface = runCatching { ResourcesCompat.getFont(ctx, R.font.manrope_bold) }.getOrNull() ?: Typeface.DEFAULT_BOLD
    private val pt = Point()
    private val pt2 = Point()
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = bold; textAlign = Paint.Align.CENTER }
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val mx = Matrix()
    private val tmp = android.graphics.Path()
    private val rect = RectF()
    /** Sist tegnede pins (sentrum og radius i px), for trykk. */
    private val hits = ArrayList<Triple<String, PointF, Float>>()

    override fun draw(c: Canvas, map: MapView, shadow: Boolean) {
        if (shadow) return
        val dd = data ?: return
        val pj = map.projection
        // 1) Sonesirkler
        val zr = HashMap<String, Float>()
        for (z in dd.zones) {
            if (!validLatLon(z.lat, z.lon) || !z.radius.isFinite() || z.radius <= 0) continue
            val g = GeoPoint(z.lat, z.lon)
            pj.toPixels(g, pt)
            pj.toPixels(g.destinationPoint(z.radius, 90.0), pt2)
            val r = maxOf(4 * d, Math.hypot((pt2.x - pt.x).toDouble(), (pt2.y - pt.y).toDouble()).toFloat())
            zr[z.id] = r
            fill.color = (z.color and 0x00FFFFFF) or (0x22 shl 24)
            c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), r, fill)
            stroke.color = z.color or (0xFF shl 24)
            stroke.strokeWidth = 2 * d
            stroke.pathEffect = if (z.draft) DashPathEffect(floatArrayOf(6 * d, 5 * d), 0f) else null
            c.drawCircle(pt.x.toFloat(), pt.y.toFloat(), r, stroke)
            stroke.pathEffect = null
        }
        // 2) Spor (siste posisjoner) i personens farge, 55 %
        if (dd.trail.size > 1) {
            tmp.reset()
            dd.trail.forEachIndexed { i, (la, lo) ->
                pj.toPixels(GeoPoint(la, lo), pt)
                if (i == 0) tmp.moveTo(pt.x.toFloat(), pt.y.toFloat()) else tmp.lineTo(pt.x.toFloat(), pt.y.toFloat())
            }
            stroke.color = (dd.trailColor and 0x00FFFFFF) or (140 shl 24)
            stroke.strokeWidth = 3 * d
            c.drawPath(tmp, stroke)
        }
        // 3) Ikon i sentrum (28 dp, hvit 2 dp kant, skygge 0 3 8 / 25 %) og navnet under (hvit 88 %, radius 8, Manrope 700 11)
        for (z in dd.zones) {
            val r = zr[z.id] ?: continue
            pj.toPixels(GeoPoint(z.lat, z.lon), pt)
            val cx = pt.x.toFloat()
            val cy = pt.y.toFloat()
            shadowPaint.color = android.graphics.Color.WHITE
            shadowPaint.setShadowLayer(4 * d, 0f, 3 * d, 0x40000000)
            c.drawCircle(cx, cy, 14 * d, shadowPaint)
            shadowPaint.clearShadowLayer()
            fill.color = z.color or (0xFF shl 24)
            c.drawCircle(cx, cy, 12 * d, fill)
            drawIcon(c, z.icon, cx, cy, 15 * d, 2.2f, android.graphics.Color.WHITE)
            text.textSize = 11 * d
            text.color = 0xFF1B1A17.toInt()
            val label = z.name.ifBlank { "Ny sone" }
            val tw = text.measureText(label)
            val ly = cy + r + 12 * d
            val fm = text.fontMetrics
            val th = fm.descent - fm.ascent
            rect.set(cx - tw / 2 - 8 * d, ly - th / 2 - 3 * d, cx + tw / 2 + 8 * d, ly + th / 2 + 3 * d)
            fill.color = 0xE0FFFFFF.toInt()
            c.drawRoundRect(rect, 8 * d, 8 * d, fill)
            c.drawText(label, cx, ly - (fm.ascent + fm.descent) / 2, text)
        }
        // 4) Personer: valgt person tegnes sist (øverst)
        hits.clear()
        for (p in dd.pins.sortedBy { it.selected }) {
            if (!validLatLon(p.lat, p.lon)) continue
            pj.toPixels(GeoPoint(p.lat, p.lon), pt)
            val s = (if (p.selected) 50 else 40) * d
            val px = pt.x.toFloat()
            val py = pt.y.toFloat()
            val cx = px
            val cy = py - 7 * d - s / 2
            // Spissen (12 × 8, hvit) under sirkelen
            tmp.reset()
            tmp.moveTo(cx - 6 * d, cy + s / 2 - d); tmp.lineTo(cx + 6 * d, cy + s / 2 - d); tmp.lineTo(cx, py); tmp.close()
            fill.color = android.graphics.Color.WHITE
            c.drawPath(tmp, fill)
            // Hvit kant med skygge 0 6 16 / 30 %
            shadowPaint.color = android.graphics.Color.WHITE
            shadowPaint.setShadowLayer(8 * d, 0f, 6 * d, 0x4D000000)
            c.drawCircle(cx, cy, s / 2, shadowPaint)
            shadowPaint.clearShadowLayer()
            val inner = s / 2 - 3 * d
            val ph = p.photo
            if (ph != null && !ph.isRecycled) {
                val sh = BitmapShader(ph, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
                val side = minOf(ph.width, ph.height).toFloat()
                val k = inner * 2 / side
                mx.reset()
                mx.setScale(k, k)
                mx.postTranslate(cx - ph.width * k / 2, cy - ph.height * k / 2)
                sh.setLocalMatrix(mx)
                fill.shader = sh
                c.drawCircle(cx, cy, inner, fill)
                fill.shader = null
            } else {
                fill.color = p.color or (0xFF shl 24)
                c.drawCircle(cx, cy, inner, fill)
                text.textSize = 13 * d
                text.color = android.graphics.Color.WHITE
                val fm = text.fontMetrics
                c.drawText(p.initials, cx, cy - (fm.ascent + fm.descent) / 2, text)
            }
            // Fart-badge: svart (#1B1A17), hvit 2 dp kant, 18 dp høy, nede til høyre (−4, −4)
            val b = p.badge
            if (!b.isNullOrBlank()) {
                text.textSize = 9.5f * d
                text.color = android.graphics.Color.WHITE
                val w = maxOf(18 * d, text.measureText(b) + 12 * d)
                val right = cx + s / 2 + 4 * d
                val bottom = cy + s / 2 + 4 * d
                rect.set(right - w, bottom - 18 * d, right, bottom)
                fill.color = android.graphics.Color.WHITE
                c.drawRoundRect(rect, 9 * d, 9 * d, fill)
                rect.inset(2 * d, 2 * d)
                fill.color = 0xFF1B1A17.toInt()
                c.drawRoundRect(rect, 7 * d, 7 * d, fill)
                val fm = text.fontMetrics
                c.drawText(b, rect.centerX(), rect.centerY() - (fm.ascent + fm.descent) / 2, text)
            }
            hits.add(Triple(p.userId, PointF(cx, cy), s / 2 + 4 * d))
        }
    }

    private fun drawIcon(c: Canvas, key: String, cx: Float, cy: Float, size: Float, strokeW: Float, color: Int) {
        val src = Fam22Paths.get(key) ?: return
        val k = size / 24f
        mx.reset()
        mx.setScale(k, k)
        mx.postTranslate(cx - size / 2, cy - size / 2)
        tmp.reset()
        src.transform(mx, tmp)
        stroke.color = color
        stroke.strokeWidth = strokeW * k
        c.drawPath(tmp, stroke)
    }

    override fun onSingleTapConfirmed(e: MotionEvent, mapView: MapView): Boolean {
        try {
            for (h in hits.asReversed()) {
                if (Math.hypot((e.x - h.second.x).toDouble(), (e.y - h.second.y).toDouble()) <= h.third) { onPin(h.first); return true }
            }
            if (data?.placing == true) {
                val g = mapView.projection.fromPixels(e.x.toInt(), e.y.toInt())
                if (validLatLon(g.latitude, g.longitude)) { onTap(g.latitude, g.longitude); return true }
            }
        } catch (ex: Exception) { Log.w("FinansHub", "Kart: trykk", ex) }
        return false
    }
}
