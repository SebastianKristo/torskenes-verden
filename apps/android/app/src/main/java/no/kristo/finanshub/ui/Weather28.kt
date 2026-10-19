package no.kristo.finanshub.ui

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.WeatherFull
import java.time.Duration
import java.time.LocalDateTime
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

/*
 * Prompt 28 (ANDROID28-A): ny værbakgrunn etter WxFx i design/Vaer.dc.html, og bunnlinja med kart og steder.
 *
 * Én Canvas bak innholdet. Lag: stjerner (melkevei, blink, glimt-kors, stjerneskudd) → sol (posisjon fra sunF, glød,
 * roterende stråler, lysstripe, sekskantede refleksjoner, lysstøv; varm når den står lavt) → skyer (forhåndstegnede
 * sprites i dybdelag) → regn (3 lag, plask, dråper på glasset, torden med forgreinet lyn) → snø (3 lag + uskarpe nærflak)
 * → tåke (grå bånd, aldri hvit flate).
 *
 * Effektivt: sprites (ImageBitmap) og gradienter lages når scenen, størrelsen eller sola endres – aldri per bilde.
 * Partiklene ligger i FloatArray-er; hvert bilde flytter tall og tegner. Bildeløkka (withFrameNanos) går bare når
 * appen er RESUMED, og står helt stille (ett statisk bilde) når «Fjern animasjoner» er på (ANIMATOR_DURATION_SCALE = 0).
 * Parallakse fra rotasjonsvektoren (SensorManager), som deviceorientation (beta/gamma) i designet.
 * Alle mål i scenen er dp; Canvas skalerer med tettheten.
 */

private const val TAU28 = 6.2832f

private fun rgba28(rgb: Int, a: Float): Color =
    Color(((rgb shr 16) and 255) / 255f, ((rgb shr 8) and 255) / 255f, (rgb and 255) / 255f, a.coerceIn(0f, 1f))

/** Sky-oppsett per værtype (CF i designet): antall, farger (grunn, lys topp, skygge under) og spenn for y, bredde og alfa. */
private class WxCf28(val n: Int, val base: Int, val lit: Int, val sh: Int, val y0: Float, val y1: Float, val w0: Float, val w1: Float, val a0: Float, val a1: Float)

private fun wxCf28(kind: String): WxCf28? = when (kind) {
    "part" -> WxCf28(4, 0xEEF4FC, 0xFFFFFF, 0x8CA5C6, .1f, .48f, .55f, .85f, .75f, .95f)
    "partn" -> WxCf28(5, 0x465573, 0x7686A6, 0x121A2E, .04f, .48f, .6f, .95f, .5f, .75f)
    "clouds" -> WxCf28(9, 0xC6D0DD, 0xEEF2F8, 0x56647A, -.1f, .62f, .7f, 1.15f, .45f, .75f)
    "rain" -> WxCf28(9, 0x6C7686, 0x96A0B0, 0x1C222E, -.14f, .32f, .8f, 1.25f, .6f, .85f)
    "snow" -> WxCf28(8, 0xBCC4D1, 0xE8ECF3, 0x6C7688, -.12f, .38f, .75f, 1.1f, .5f, .7f)
    else -> null
}

/* ---------- Sprites (tegnes én gang) ---------- */

private val spriteDensity28 = Density(1f)

private fun sprite28(w: Int, h: Int, block: DrawScope.() -> Unit): ImageBitmap {
    val img = ImageBitmap(w, h)
    CanvasDrawScope().draw(spriteDensity28, LayoutDirection.Ltr, androidx.compose.ui.graphics.Canvas(img), Size(w.toFloat(), h.toFloat()), block)
    return img
}

private const val CLOUD_W28 = 768
private const val CLOUD_H28 = 320

/** Sky: 28 myke klumper, lys topp på hver, og skygge under (source-atop). */
private fun cloudSprite28(cf: WxCf28, r: Random): ImageBitmap = sprite28(CLOUD_W28, CLOUD_H28) {
    val w = CLOUD_W28.toFloat()
    val h = CLOUD_H28.toFloat()
    fun rnd(a: Float, b: Float) = a + r.nextFloat() * (b - a)
    val p = FloatArray(28 * 3)
    for (i in 0 until 28) {
        val u = rnd(.07f, .93f)
        val b = sin(u * PI.toFloat())
        val rr = h * (.09f + .22f * b) * rnd(.75f, 1.25f)
        p[i * 3] = w * u
        p[i * 3 + 1] = h * .72f - b * h * .3f * rnd(.7f, 1.1f) + rnd(-8f, 8f)
        p[i * 3 + 2] = rr
    }
    for (i in 0 until 28) {
        val c = Offset(p[i * 3], p[i * 3 + 1])
        val rr = p[i * 3 + 2]
        drawCircle(Brush.radialGradient(0f to rgba28(cf.base, .9f), .6f to rgba28(cf.base, .55f), 1f to rgba28(cf.base, 0f), center = c, radius = rr), rr, c)
    }
    for (i in 0 until 28) {
        val rr = p[i * 3 + 2]
        val c = Offset(p[i * 3] - rr * .18f, p[i * 3 + 1] - rr * .38f)
        val hr = rr * .68f
        drawCircle(Brush.radialGradient(0f to rgba28(cf.lit, .6f), 1f to rgba28(cf.lit, 0f), center = c, radius = hr), hr, c)
    }
    drawRect(Brush.verticalGradient(0f to rgba28(cf.sh, 0f), 1f to rgba28(cf.sh, .7f), startY = h * .3f, endY = h * .95f), blendMode = BlendMode.SrcAtop)
}

/** Tåkebånd: grå (205,211,219) ellipse, aldri hvit. */
private fun bandSprite28(): ImageBitmap = sprite28(512, 128) {
    scale(1f, 128f / 512f, pivot = Offset.Zero) {
        val c = Offset(256f, 256f)
        drawRect(Brush.radialGradient(0f to rgba28(0xCDD3DB, .9f), .5f to rgba28(0xCDD3DB, .45f), 1f to rgba28(0xCDD3DB, 0f), center = c, radius = 256f), size = Size(512f, 512f))
    }
}

private fun dotSprite28(rgb: Int, a0: Float, mid: Float, aMid: Float): ImageBitmap = sprite28(64, 64) {
    drawRect(Brush.radialGradient(0f to rgba28(rgb, a0), mid to rgba28(rgb, aMid), 1f to rgba28(rgb, 0f), center = Offset(32f, 32f), radius = 32f))
}

private class WxSprites28(kind: String) {
    val clouds: Array<ImageBitmap> = wxCf28(kind)?.let { cf -> val r = Random(kind.hashCode()); Array(3) { cloudSprite28(cf, r) } } ?: emptyArray()
    val band: ImageBitmap? = if (kind == "fog") bandSprite28() else null
    val flake: ImageBitmap? = if (kind == "snow") dotSprite28(0xFFFFFF, 1f, .35f, .75f) else null
    val mote: ImageBitmap? = if (kind == "sun" || kind == "part") dotSprite28(0xFFFAEB, 1f, .5f, .5f) else null
    val glassHi: ImageBitmap? = if (kind == "rain") dotSprite28(0xFFFFFF, .55f, .5f, .27f) else null
}

/* ---------- Scenen ---------- */

private class WxScene28(val kind: String, val heavy: Boolean, val thunder: Boolean, val day: Boolean, val spr: WxSprites28, val reduce: Boolean) {
    private val r = Random(System.nanoTime())
    private fun rnd(a: Float, b: Float) = a + r.nextFloat() * (b - a)
    private val cf = wxCf28(kind)

    var W = 0f; private set
    var H = 0f; private set
    private var m = 0f
    var t = 0f; private set
    /** Parallakse: mål (tx, ty) fra sensoren, glidende verdi (px, py). */
    var tx = 0f
    var ty = 0f
    private var px = 0f
    private var py = 0f
    /** Sola: 0 ved soloppgang, 1 ved solnedgang. */
    var sunF = .5f
        set(v) { val c = if (v.isNaN()) .5f else v.coerceIn(0f, 1f); if (abs(c - field) > .002f) { field = c; sunDirty = true } }
    private var sunDirty = true

    // Stjerner
    private var nS = 0
    private var sX = FloatArray(0); private var sY = FloatArray(0); private var sR = FloatArray(0); private var sA = FloatArray(0)
    private var sS = FloatArray(0); private var sO = FloatArray(0); private var sG = BooleanArray(0); private var sC = IntArray(0)
    private val starCol = arrayOf(Color.White, rgba28(0xC8D7FF, 1f), rgba28(0xFFEBCD, 1f))
    private var milky: Brush? = null
    private var shootOn = false
    private var shX = 0f; private var shY = 0f; private var shVx = 0f; private var shVy = 0f; private var shL = 0f; private var shD = 1f
    private var nextShoot = 0f
    private val shootBrush = Brush.linearGradient(listOf(Color.White.copy(alpha = .9f), Color.White.copy(alpha = 0f)), start = Offset.Zero, end = Offset(-120f, 0f))

    // Regn
    private var nD = 0
    private var dZ = IntArray(0); private var dX = FloatArray(0); private var dY = FloatArray(0); private var dL = FloatArray(0); private var dV = FloatArray(0); private var dE = FloatArray(0)
    private val rainCol = arrayOf(rgba28(0xCDDAEE, .12f), rgba28(0xD4E0F2, .2f), rgba28(0xE1EAFA, .3f))
    private val rainW = floatArrayOf(.7f, 1f, 1.5f)
    private val SPL = 50
    private val pX = FloatArray(SPL); private val pY = FloatArray(SPL); private val pR = FloatArray(SPL); private val pA = FloatArray(SPL)
    private var mist: Brush? = null
    private val G_TR = 26
    private var nG = 0
    private var gX = FloatArray(0); private var gY = FloatArray(0); private var gR = FloatArray(0); private var gV = FloatArray(0); private var gSl = BooleanArray(0)
    private var gTx = FloatArray(0); private var gTy = FloatArray(0); private var gS = IntArray(0); private var gL = IntArray(0)
    private val trailPath = Path()
    private val trailStroke = Array(27) { Stroke(width = 1.2f + it * .1f, cap = StrokeCap.Round, join = StrokeJoin.Round) }
    private val stroke1 = Stroke(1f)
    private val stroke07 = Stroke(.7f)
    private val glassFill = rgba28(0x121A28, .16f)
    private val splashCol = rgba28(0xE1EAF8, 1f)
    /** Hele flaten i dp (fullflate-gradienter tegnes med denne, ikke med DrawScope.size i px). */
    private var full = Size.Zero
    // Lyn
    private val boltPath = arrayOf(Path(), Path(), Path())
    private var boltOn = false
    private var flash = 0f
    private var nextBolt = 0f
    private val bp = FloatArray(2 * 48)
    private val glow12 = Stroke(12f, cap = StrokeCap.Round, join = StrokeJoin.Round)
    private val glow6 = Stroke(6f, cap = StrokeCap.Round, join = StrokeJoin.Round)
    private val core22 = Stroke(2.2f, cap = StrokeCap.Round, join = StrokeJoin.Round)
    private val core1 = Stroke(1f, cap = StrokeCap.Round, join = StrokeJoin.Round)
    private val boltGlow = rgba28(0xBED2FF, 1f)
    private val flashCol = rgba28(0xD7E1FF, 1f)

    // Snø
    private var nF = 0
    private var fZ = IntArray(0); private var fBx = FloatArray(0); private var fY = FloatArray(0); private var fR = FloatArray(0)
    private var fV = FloatArray(0); private var fAm = FloatArray(0); private var fF = FloatArray(0); private var fPh = FloatArray(0)
    private val AL = floatArrayOf(.45f, .7f, .9f, .28f)
    private val DR = floatArrayOf(3f, 6f, 11f, 18f)
    private var snowGlow: Brush? = null

    // Skyer
    private var nC = 0
    private var cZ = FloatArray(0); private var cS = IntArray(0); private var cX = FloatArray(0); private var cY = FloatArray(0)
    private var cW = FloatArray(0); private var cA = FloatArray(0); private var cV = FloatArray(0); private var cPh = FloatArray(0)

    // Tåke
    private val nB = if (kind == "fog") 9 else 0
    private val bZ = FloatArray(nB); private val bY = FloatArray(nB); private val bW = FloatArray(nB); private val bHr = FloatArray(nB)
    private val bV = FloatArray(nB); private val bA = FloatArray(nB); private val bPh = FloatArray(nB); private val bX = FloatArray(nB)
    private var fogFloor: Brush? = null

    // Sol
    private val sunI = when { kind == "sun" -> 1f; kind == "part" -> .95f; day && kind == "clouds" -> .3f; day && kind == "fog" -> .22f; else -> 0f }
    private val sunFull = kind == "sun" || kind == "part"
    private val nRay = 60
    private val rA = FloatArray(nRay); private val rCos = FloatArray(nRay); private val rSin = FloatArray(nRay); private val rL = FloatArray(nRay)
    private val rW = FloatArray(nRay); private val rS = FloatArray(nRay); private val rO = FloatArray(nRay); private val rAl = FloatArray(nRay)
    private val GH_F = floatArrayOf(.32f, .58f, .78f, 1.12f, 1.4f, 1.72f)
    private val GH_R = floatArrayOf(.018f, .042f, .011f, .068f, .028f, .1f)
    private val GH_C = intArrayOf(0xBEFFDC, 0xAAD2FF, 0xFFFFFF, 0xCDB4FF, 0xFFDEAA, 0xA0DCFF)
    private val GH_A = floatArrayOf(.09f, .055f, .14f, .04f, .07f, .028f)
    private val ghPath = Array(6) { Path() }
    private val ghFill = arrayOfNulls<Brush>(6)
    private val ghLine = arrayOfNulls<Color>(6)
    private val nM = 16
    private val mDx = FloatArray(nM); private val mDy = FloatArray(nM); private val mR = FloatArray(nM); private val mA = FloatArray(nM); private val mS = FloatArray(nM); private val mO = FloatArray(nM)
    private var sunGlow: Brush? = null
    private var sunWarm: Brush? = null
    private var sunHalo: Brush? = null
    private var sunRays: Brush? = null
    private var sunStreak: Brush? = null
    private var sunCore: Brush? = null
    private var warm = 0f
    private var el = 0f

    init {
        for (i in 0 until nRay) {
            if (i < 6) { rA[i] = i / 6f * TAU28 + .35f; rL[i] = 1.15f; rW[i] = 2.2f; rS[i] = .3f; rO[i] = i.toFloat(); rAl[i] = .9f }
            else { rA[i] = rnd(0f, TAU28); rL[i] = rnd(.18f, .85f); rW[i] = rnd(.5f, 1.5f); rS[i] = rnd(.2f, .8f); rO[i] = rnd(0f, TAU28); rAl[i] = rnd(.25f, .7f) }
            rCos[i] = cos(rA[i]); rSin[i] = sin(rA[i])
        }
        for (i in 0 until nM) { mDx[i] = rnd(-.6f, .6f); mDy[i] = rnd(-.1f, .7f); mR[i] = rnd(1.5f, 5f); mA[i] = rnd(.1f, .35f); mS[i] = rnd(.2f, .6f); mO[i] = rnd(0f, TAU28) }
        nextShoot = rnd(4f, 9f)
        nextBolt = rnd(2.5f, 6f)
    }

    /** Ny størrelse (dp): partiklene og gradientene lages på nytt, som size() i designet. */
    fun ensure(w: Float, h: Float) {
        if (w == W && h == H || w <= 0f || h <= 0f) return
        W = w; H = h; m = min(w, h); full = Size(w, h)
        nS = if (kind == "stars" || kind == "partn") (w * h / 2200f).toInt().coerceAtLeast(1) else 0
        sX = FloatArray(nS) { rnd(0f, w) }; sY = FloatArray(nS) { rnd(0f, h * .72f) }; sR = FloatArray(nS) { rnd(.35f, 1.5f) }; sA = FloatArray(nS) { rnd(.3f, 1f) }
        sS = FloatArray(nS) { rnd(.4f, 1.8f) }; sO = FloatArray(nS) { rnd(0f, TAU28) }; sG = BooleanArray(nS) { r.nextFloat() < .06f }
        sC = IntArray(nS) { if (r.nextFloat() < .15f) 1 else if (r.nextFloat() < .1f) 2 else 0 }
        val mw = max(w, h) * .7f
        milky = Brush.radialGradient(0f to rgba28(0xAAB9E6, .07f), 1f to rgba28(0xAAB9E6, 0f), center = Offset.Zero, radius = mw)

        nD = if (kind == "rain") (if (heavy) 320 else 180) else 0
        dZ = IntArray(nD) { if (r.nextFloat() < .4f) 0 else if (r.nextFloat() < .6f) 1 else 2 }
        dX = FloatArray(nD) { rnd(-h * .2f, w) }; dY = FloatArray(nD) { rnd(-h, h) }
        dL = FloatArray(nD) { floatArrayOf(10f, 18f, 30f)[dZ[it]] * rnd(.8f, 1.2f) }
        dV = FloatArray(nD) { floatArrayOf(700f, 1000f, 1450f)[dZ[it]] * rnd(.9f, 1.1f) }
        dE = FloatArray(nD) { if (dZ[it] == 2) rnd(.82f, 1f) * h else h + 40f }
        pA.fill(0f)
        mist = Brush.verticalGradient(0f to rgba28(0xAAB6C6, 0f), 1f to rgba28(0xAAB6C6, .14f), startY = h * .6f, endY = h)
        nG = if (kind == "rain") (if (heavy) 28 else 18) else 0
        gX = FloatArray(nG); gY = FloatArray(nG); gR = FloatArray(nG); gV = FloatArray(nG); gSl = BooleanArray(nG)
        gTx = FloatArray(nG * G_TR); gTy = FloatArray(nG * G_TR); gS = IntArray(nG); gL = IntArray(nG)
        for (i in 0 until nG) newGlass(i, false)

        nF = if (kind == "snow") max(90, (w * h / 3000f).toInt()) + 7 else 0
        fZ = IntArray(nF); fBx = FloatArray(nF); fY = FloatArray(nF); fR = FloatArray(nF); fV = FloatArray(nF); fAm = FloatArray(nF); fF = FloatArray(nF); fPh = FloatArray(nF)
        for (i in 0 until nF) {
            val near = i >= nF - 7
            val z = if (near) 3 else if (r.nextFloat() < .45f) 0 else if (r.nextFloat() < .65f) 1 else 2
            fZ[i] = z; fBx[i] = rnd(0f, w); fY[i] = rnd(-h, h); fPh[i] = rnd(0f, TAU28)
            if (near) { fR[i] = rnd(7f, 13f); fV[i] = rnd(80f, 110f); fAm[i] = 30f; fF[i] = rnd(.2f, .4f) }
            else { fR[i] = floatArrayOf(1.3f, 2.3f, 3.8f)[z] * rnd(.8f, 1.3f); fV[i] = floatArrayOf(18f, 34f, 62f)[z] * rnd(.8f, 1.2f); fAm[i] = floatArrayOf(6f, 12f, 22f)[z]; fF[i] = rnd(.3f, .8f) }
        }
        snowGlow = Brush.verticalGradient(0f to rgba28(0xEBF0F8, 0f), 1f to rgba28(0xEBF0F8, .12f), startY = h * .75f, endY = h)

        nC = cf?.n ?: 0
        cZ = FloatArray(nC); cS = IntArray(nC); cX = FloatArray(nC); cY = FloatArray(nC); cW = FloatArray(nC); cA = FloatArray(nC); cV = FloatArray(nC); cPh = FloatArray(nC)
        cf?.let { c ->
            for (i in 0 until nC) {
                val z = (i + .5f) / nC
                cZ[i] = z; cS[i] = i % 3; cX[i] = rnd(-.3f, 1f) * w; cY[i] = rnd(c.y0, c.y1) * h
                cW[i] = rnd(c.w0, c.w1) * w * (.6f + .5f * z); cA[i] = rnd(c.a0, c.a1) * (.6f + .4f * z); cV[i] = 4f + 15f * z; cPh[i] = rnd(0f, TAU28)
            }
        }

        for (i in 0 until nB) {
            val z = i / 8f
            bZ[i] = z; bY[i] = rnd(.1f, 1.05f) * h; bW[i] = rnd(1.3f, 2.2f) * w; bHr[i] = rnd(.16f, .28f)
            bV[i] = (4f + 11f * z) * (if (i % 2 == 1) 1f else -1f); bA[i] = .05f + .07f * z; bPh[i] = rnd(0f, TAU28); bX[i] = rnd(-1f, .2f) * w
        }
        fogFloor = Brush.verticalGradient(0f to rgba28(0xBEC6D0, 0f), 1f to rgba28(0xBEC6D0, .2f), startY = h * .35f, endY = h)
        sunDirty = true
    }

    private fun newGlass(i: Int, top: Boolean) {
        gX[i] = rnd(0f, W); gY[i] = if (top) rnd(-20f, 0f) else rnd(0f, H); gR[i] = rnd(1.8f, 5.2f); gV[i] = 0f; gSl[i] = false; gS[i] = 0; gL[i] = 0
    }

    /** Gradientene for sola: lages når sunF eller størrelsen endres, sentrert i origo (tegnes med translate). */
    private fun buildSun() {
        sunDirty = false
        if (sunI <= 0f) return
        val I = sunI
        el = sin(PI.toFloat() * sunF)
        warm = (1f - el).pow(1.5f)
        val cr = 255
        val cg = (250 + (188 - 250) * warm).toInt()
        val cb = (238 + (128 - 238) * warm).toInt()
        val c = (cr shl 16) or (cg shl 8) or cb
        val R = max(W, H) * 1.05f
        sunGlow = Brush.radialGradient(0f to rgba28(c, .42f * I), .12f to rgba28(c, .2f * I), .4f to rgba28(c, .06f * I), 1f to rgba28(c, 0f), center = Offset.Zero, radius = R)
        val cy = H * (.16f - .1f * el)
        sunWarm = if (warm > .35f) {
            val ww = (warm - .35f) / .65f
            Brush.verticalGradient(0f to rgba28(0xFF8C50, 0f), .3f to rgba28(0xFF8C50, .2f * ww * I), 1f to rgba28(0xFF6E5A, 0f), startY = cy - H * .1f, endY = H * .8f)
        } else null
        sunHalo = Brush.radialGradient(0f to Color.White.copy(alpha = .5f * I), .3f to rgba28(c, .18f * I), 1f to rgba28(c, 0f), center = Offset.Zero, radius = m * .4f)
        sunRays = Brush.radialGradient(0f to Color.White.copy(alpha = .55f), .12f to rgba28(c, .22f), .5f to rgba28(c, .05f), 1f to rgba28(c, 0f), center = Offset.Zero, radius = m * .95f)
        sunStreak = Brush.radialGradient(0f to rgba28(0xD7E8FF, .32f * I), .4f to rgba28(0xC8DEFF, .08f * I), 1f to rgba28(0xC8DEFF, 0f), center = Offset.Zero, radius = W * .75f)
        val rd = m * .045f * (1f + .2f * warm) * 2.1f
        sunCore = Brush.radialGradient(0f to Color.White.copy(alpha = I), .46f to rgba28(0xFFFEF8, I), .56f to rgba28(c, .5f * I), 1f to rgba28(c, 0f), center = Offset.Zero, radius = rd)
        for (g in 0 until 6) {
            val rr = m * GH_R[g]
            val p = ghPath[g]
            p.reset()
            for (j in 0 until 6) {
                val an = j / 6f * TAU28 + .5f
                if (j == 0) p.moveTo(cos(an) * rr, sin(an) * rr) else p.lineTo(cos(an) * rr, sin(an) * rr)
            }
            p.close()
            val a = GH_A[g]
            ghFill[g] = Brush.radialGradient(0f to rgba28(GH_C[g], a * .5f * I), .8f to rgba28(GH_C[g], a * I), 1f to rgba28(GH_C[g], a * .3f * I), center = Offset.Zero, radius = max(rr, .01f))
            ghLine[g] = rgba28(GH_C[g], a * .9f * I)
        }
    }

    private fun genBolt() {
        // Hovedlyn fra toppen, to greiner fra tilfeldige punkter på det.
        fun seg(path: Path, x0: Float, y0: Float, n: Int, dx: Float, yMax: Float): Int {
            var x = x0; var y = y0; var k = 0
            path.reset(); path.moveTo(x, y)
            bp[0] = x; bp[1] = y; k = 1
            var i = 0
            while (i < n && y < yMax && k < 48) { y += rnd(16f, 34f); x += rnd(-20f, 20f) + dx; path.lineTo(x, y); bp[k * 2] = x; bp[k * 2 + 1] = y; k++; i++ }
            return k
        }
        val n = seg(boltPath[0], rnd(.15f, .85f) * W, -10f, 40, rnd(-3f, 3f), H * rnd(.45f, .7f))
        val sx1: Float; val sy1: Float; val sx2: Float; val sy2: Float
        if (n >= 4) {
            val a = rnd(2f, (n - 2).toFloat()).toInt().coerceIn(0, n - 1)
            val b = rnd(2f, (n - 2).toFloat()).toInt().coerceIn(0, n - 1)
            sx1 = bp[a * 2]; sy1 = bp[a * 2 + 1]; sx2 = bp[b * 2]; sy2 = bp[b * 2 + 1]
        } else { sx1 = bp[(n - 1) * 2]; sy1 = bp[(n - 1) * 2 + 1]; sx2 = sx1; sy2 = sy1 }
        seg(boltPath[1], sx1, sy1, rnd(3f, 7f).toInt(), rnd(-12f, 12f), H)
        seg(boltPath[2], sx2, sy2, rnd(3f, 7f).toInt(), rnd(-12f, 12f), H)
        boltOn = true
    }

    /** Ett steg i simuleringen (dt i sekunder). Ingen allokering. */
    fun step(dtIn: Float) {
        if (W <= 0f) return
        val dt = if (reduce) 0f else dtIn
        t += dt
        val e = min(1f, dt * 2.5f)
        px += (tx - px) * e
        py += (ty - py) * e
        if (nS > 0 && !reduce) {
            if (!shootOn && t > nextShoot) { shootOn = true; shX = rnd(.3f, 1f) * W; shY = rnd(.03f, .28f) * H; shVx = -rnd(520f, 800f); shVy = rnd(160f, 280f); shL = 0f; shD = rnd(.6f, 1f) }
            if (shootOn) { shL += dt; if (shL / shD >= 1f) { shootOn = false; nextShoot = t + rnd(6f, 15f) } }
        }
        for (i in 0 until nC) { cX[i] += cV[i] * dt; if (cX[i] > W) cX[i] = -cW[i] }
        if (nD > 0) {
            val S = .14f
            for (i in 0 until nD) {
                dY[i] += dV[i] * dt; dX[i] += dV[i] * dt * S
                if (dY[i] > dE[i]) {
                    if (dZ[i] == 2) { val j = freeSplash(); if (j >= 0) { pX[j] = dX[i]; pY[j] = dE[i]; pR[j] = 1f; pA[j] = .4f } }
                    dY[i] = rnd(-90f, -10f); dX[i] = rnd(-H * S, W)
                }
            }
            for (j in 0 until SPL) if (pA[j] > 0f) { pR[j] += dt * 36f; pA[j] -= dt * 1.3f }
            for (i in 0 until nG) {
                if (!gSl[i] && r.nextFloat() < dt * .06f) gSl[i] = true
                if (gSl[i]) {
                    gV[i] = min(160f, gV[i] + dt * rnd(40f, 160f)); gY[i] += gV[i] * dt; gX[i] += rnd(-.4f, .4f)
                    val pos: Int
                    if (gL[i] < G_TR) { pos = (gS[i] + gL[i]) % G_TR; gL[i]++ } else { pos = gS[i]; gS[i] = (gS[i] + 1) % G_TR }
                    gTx[i * G_TR + pos] = gX[i]; gTy[i * G_TR + pos] = gY[i]
                    if (gY[i] > H + 10f) newGlass(i, true)
                }
            }
            if (thunder && !reduce) {
                if (t > nextBolt) { genBolt(); flash = 1f; nextBolt = t + rnd(4.5f, 11f) }
                if (flash > 0f) flash -= dt * 2f
            }
        }
        for (i in 0 until nF) {
            fY[i] += fV[i] * dt; fBx[i] += DR[fZ[i]] * dt
            if (fY[i] > H + 20f) { fY[i] = -20f; fBx[i] = rnd(0f, W) }
            if (fBx[i] > W + 30f) fBx[i] = -30f
        }
        for (i in 0 until nB) {
            bX[i] += bV[i] * dt
            if (bV[i] > 0f && bX[i] > W) bX[i] = -bW[i]
            if (bV[i] < 0f && bX[i] < -bW[i]) bX[i] = W
        }
        if (sunFull) for (i in 0 until nM) mDy[i] -= .004f * dt
    }

    private fun freeSplash(): Int { for (j in 0 until SPL) if (pA[j] <= 0f) return j; return -1 }

    /** Tegner scenen i dp (kalleren har skalert med tettheten). */
    fun draw(ds: DrawScope) = with(ds) {
        if (W <= 0f) return@with
        if (sunDirty) buildSun()
        if (nS > 0) drawStars()
        if (sunI > 0f) drawSun()
        for (i in 0 until nC) {
            val img = spr.clouds.getOrNull(cS[i]) ?: continue
            val w = cW[i]
            val hh = w * .42f * (1f + .03f * sin(t * .2f + cPh[i]))
            val y = cY[i] + sin(t * .12f + cPh[i]) * 4f + py * cZ[i] * 8f
            translate(cX[i] + px * cZ[i] * 16f, y) { scale(w / CLOUD_W28, hh / CLOUD_H28, pivot = Offset.Zero) { drawImage(img, alpha = cA[i]) } }
        }
        if (kind == "rain") drawRain()
        if (nF > 0) {
            val img = spr.flake
            if (img != null) for (i in 0 until nF) {
                val z = fZ[i]
                val x = fBx[i] + sin(t * fF[i] + fPh[i]) * fAm[i] + px * (z + 1) * 5f
                val rr = fR[i] * 2f
                translate(x - rr, fY[i] - rr) { scale(rr * 2f / 64f, rr * 2f / 64f, pivot = Offset.Zero) { drawImage(img, alpha = AL[z]) } }
            }
            snowGlow?.let { drawRect(it, size = full) }
        }
        if (nB > 0) {
            val img = spr.band
            if (img != null) for (i in 0 until nB) {
                val w = bW[i]
                val hh = w * bHr[i]
                val y = bY[i] + sin(t * .13f + bPh[i]) * 10f - hh / 2f
                val x = bX[i] + px * bZ[i] * 14f
                val x2 = x + (if (bV[i] > 0f) -w else w) * .98f
                translate(x, y) { scale(w / 512f, hh / 128f, pivot = Offset.Zero) { drawImage(img, alpha = bA[i]) } }
                translate(x2, y + 6f) { scale(w / 512f, hh / 128f, pivot = Offset.Zero) { drawImage(img, alpha = bA[i]) } }
            }
            fogFloor?.let { drawRect(it, size = full) }
        }
    }

    private fun DrawScope.drawStars() {
        milky?.let { b ->
            translate(W * .55f + px * 4f, H * .25f) { rotateRad(-.6f, pivot = Offset.Zero) { scale(1f, .22f, pivot = Offset.Zero) { drawCircle(b, max(W, H) * .7f, Offset.Zero) } } }
        }
        for (i in 0 until nS) {
            val tw = .55f + .45f * sin(t * sS[i] + sO[i])
            val x = sX[i] + px * 3f
            val y = sY[i] + py * 2f
            val col = starCol[sC[i]]
            drawCircle(col, sR[i], Offset(x, y), alpha = (sA[i] * tw).coerceIn(0f, 1f))
            if (sG[i]) {
                val L = sR[i] * 7f * tw
                val a = (sA[i] * tw * .45f).coerceIn(0f, 1f)
                drawLine(col, Offset(x - L, y), Offset(x + L, y), .6f, alpha = a)
                drawLine(col, Offset(x, y - L), Offset(x, y + L), .6f, alpha = a)
            }
        }
        if (shootOn) {
            val f = shL / shD
            val x = shX + shVx * shL
            val y = shY + shVy * shL
            val a = sin(PI.toFloat() * min(1f, f)).coerceIn(0f, 1f)
            translate(x, y) { rotateRad(atan2(shVy, shVx), pivot = Offset.Zero) { drawLine(shootBrush, Offset.Zero, Offset(-120f, 0f), 1.4f, StrokeCap.Round, alpha = a) } }
        }
    }

    private fun DrawScope.drawSun() {
        val I = sunI
        val cx = W * (.2f + .6f * sunF) + px * 6f
        val cy = H * (.16f - .1f * el) + py * 4f
        val add = BlendMode.Plus
        sunGlow?.let { b -> translate(cx, cy) { drawRect(b, Offset(-cx, -cy), Size(W, H), blendMode = add) } }
        sunWarm?.let { drawRect(it, size = full, blendMode = add) }
        if (sunFull) {
            sunHalo?.let { b -> translate(cx, cy) { drawCircle(b, m * .4f, Offset.Zero, blendMode = add) } }
            val L = m * .95f
            val i0 = m * .035f
            sunRays?.let { b ->
                translate(cx, cy) {
                    rotateRad(t * .008f, pivot = Offset.Zero) {
                        for (k in 0 until nRay) {
                            val len = L * rL[k] * (.82f + .18f * sin(t * rS[k] + rO[k]))
                            val a = (rAl[k] * I * (.75f + .25f * sin(t * rS[k] * 1.7f + rO[k]))).coerceIn(0f, 1f)
                            drawLine(b, Offset(rCos[k] * i0, rSin[k] * i0), Offset(rCos[k] * len, rSin[k] * len), rW[k], StrokeCap.Round, alpha = a, blendMode = add)
                        }
                    }
                }
            }
            sunStreak?.let { b -> translate(cx, cy) { scale(1f, .028f, pivot = Offset.Zero) { drawCircle(b, W * .75f, Offset.Zero, blendMode = add) } } }
            val ax = W * .5f - px * 22f - cx
            val ay = H * .5f - py * 22f - cy
            for (g in 0 until 6) {
                val fill = ghFill[g] ?: continue
                val line = ghLine[g] ?: continue
                translate(cx + ax * GH_F[g], cy + ay * GH_F[g]) {
                    drawPath(ghPath[g], fill, blendMode = add)
                    drawPath(ghPath[g], line, style = stroke1, blendMode = add)
                }
            }
            spr.mote?.let { img ->
                for (k in 0 until nM) {
                    val x = cx + mDx[k] * m + sin(t * mS[k] + mO[k]) * 10f
                    val y = cy + mDy[k] * m + cos(t * mS[k] * .8f + mO[k]) * 8f
                    val d = hypot(x - cx, y - cy) / (m * .7f)
                    val a = mA[k] * I * max(0f, 1f - d) * (.6f + .4f * sin(t * mS[k] * 2f + mO[k]))
                    if (a <= 0f) continue
                    val rr = mR[k] * 2f
                    translate(x - rr, y - rr) { scale(rr * 2f / 64f, rr * 2f / 64f, pivot = Offset.Zero) { drawImage(img, alpha = a.coerceIn(0f, 1f), blendMode = add) } }
                }
            }
        }
        sunCore?.let { b -> translate(cx, cy) { drawCircle(b, m * .045f * (1f + .2f * warm) * 2.1f, Offset.Zero, blendMode = add) } }
    }

    private fun DrawScope.drawRain() {
        val S = .14f
        for (z in 0 until 3) {
            val col = rainCol[z]
            val lw = rainW[z]
            val ox = px * (z + 1) * 4f
            for (i in 0 until nD) {
                if (dZ[i] != z) continue
                val x = dX[i] + ox
                val y = dY[i]
                drawLine(col, Offset(x, y), Offset(x - dL[i] * S, y - dL[i]), lw, StrokeCap.Round)
            }
        }
        for (j in 0 until SPL) {
            val a = pA[j]
            if (a <= 0f) continue
            val rr = pR[j]
            drawOval(splashCol, Offset(pX[j] - rr, pY[j] - rr * .28f), Size(rr * 2f, rr * .56f), alpha = a.coerceIn(0f, 1f), style = stroke1)
        }
        mist?.let { drawRect(it, size = full) }
        val hi = spr.glassHi
        for (i in 0 until nG) {
            val gx = gX[i]; val gy = gY[i]; val gr = gR[i]
            val len = gL[i]
            if (len > 1) {
                trailPath.reset()
                for (j in 0 until len) {
                    val k = i * G_TR + (gS[i] + j) % G_TR
                    if (j == 0) trailPath.moveTo(gTx[k], gTy[k]) else trailPath.lineTo(gTx[k], gTy[k])
                }
                drawPath(trailPath, Color.White, alpha = .07f, style = trailStroke[((gr * .7f - 1.2f) / .1f).toInt().coerceIn(0, trailStroke.size - 1)])
            }
            drawOval(glassFill, Offset(gx - gr, gy - gr * 1.1f), Size(gr * 2f, gr * 2.2f))
            if (hi != null) {
                val hr = gr * .6f
                translate(gx - gr * .3f - hr, gy - gr * .4f - hr) { scale(hr * 2f / 64f, hr * 2f / 64f, pivot = Offset.Zero) { drawImage(hi) } }
            }
            drawArc(Color.White, 11.46f, 157.08f, false, Offset(gx - gr, gy - gr * 1.1f), Size(gr * 2f, gr * 2.2f), alpha = .16f, style = stroke07)
        }
        if (thunder && !reduce && flash > 0f) {
            val fl = if (flash > .55f) (if (sin(t * 55f) > 0f) 1f else .35f) else 1f
            val a = (max(0f, flash) * fl).coerceIn(0f, 1f)
            drawRect(flashCol, size = full, alpha = a * .26f)
            if (boltOn) for (k in 0 until 3) {
                // Glød i stedet for shadowBlur: to brede, svake strøk under kjernen.
                drawPath(boltPath[k], boltGlow, alpha = a * .14f, style = glow12)
                drawPath(boltPath[k], boltGlow, alpha = a * .3f, style = glow6)
                drawPath(boltPath[k], Color.White, alpha = a, style = if (k == 0) core22 else core1)
            }
        }
    }
}

/* ---------- Parallakse fra rotasjonsvektoren ---------- */

/**
 * Helning som i deviceorientation: beta (forover/bakover, 0 flatt, 90 loddrett) og gamma (sideveis).
 * «Opp»-vektoren i enhetens koordinater er tredje rad i rotasjonsmatrisen, så det blir ingen gimbal-lås når telefonen står.
 * Lytteren er registrert bare mens [enabled] (siden er RESUMED og animasjoner er på).
 */
@Composable
private fun rememberTilt28(enabled: Boolean): FloatArray {
    val ctx = LocalContext.current
    val tilt = remember { FloatArray(2) }
    DisposableEffect(enabled) {
        val sm = if (enabled) ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager else null
        val sensor = sm?.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) ?: sm?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        val rm = FloatArray(9)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                try { SensorManager.getRotationMatrixFromVector(rm, e.values) } catch (_: Exception) { return }
                val gx = rm[6]; val gy = rm[7]; val gz = rm[8]
                val beta = Math.toDegrees(atan2(gy, gz).toDouble()).toFloat()
                val gamma = Math.toDegrees(asin((-gx).coerceIn(-1f, 1f)).toDouble()).toFloat()
                tilt[0] = (gamma / 25f).coerceIn(-1f, 1f)
                tilt[1] = ((beta - 45f) / 25f).coerceIn(-1f, 1f)
            }
            override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
        }
        if (sm != null && sensor != null) sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
        onDispose { sm?.unregisterListener(listener) }
    }
    return tilt
}

/* ---------- Komponenten ---------- */

/**
 * Værbakgrunnen (WxFx i designet). [kind]: sun, part, stars, partn, clouds, rain, snow, fog. [sunF]: 0 ved soloppgang, 1 ved
 * solnedgang. Bildeløkka går bare når appen er RESUMED; med «Fjern animasjoner» tegnes ett statisk bilde.
 */
@Composable
internal fun WxFx28(kind: String, heavy: Boolean, thunder: Boolean, day: Boolean, sunF: Float) {
    val ctx = LocalContext.current
    val reduce = remember {
        runCatching { android.provider.Settings.Global.getFloat(ctx.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
    val owner = LocalLifecycleOwner.current
    var resumed by remember { mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _: androidx.lifecycle.LifecycleOwner, e: Lifecycle.Event ->
            if (e == Lifecycle.Event.ON_RESUME) resumed = true
            if (e == Lifecycle.Event.ON_PAUSE) resumed = false
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    val running = resumed && !reduce
    val sprites = remember(kind) { WxSprites28(kind) }
    val scene = remember(kind, heavy, thunder, day, reduce) { WxScene28(kind, heavy, thunder, day, sprites, reduce) }
    scene.sunF = sunF
    val tilt = rememberTilt28(running)
    var frame by remember { mutableLongStateOf(0L) }
    LaunchedEffect(scene, running) {
        if (!running) return@LaunchedEffect
        var last = 0L
        // Én lambda for hele løkka, så hvert bilde ikke lager en ny.
        val onFrame: (Long) -> Unit = { n ->
            val dt = if (last == 0L) 0f else min(.05f, (n - last) / 1e9f)
            last = n
            scene.tx = tilt[0]
            scene.ty = tilt[1]
            scene.step(dt)
            frame = n
        }
        while (true) withFrameNanos(onFrame)
    }
    Canvas(Modifier.fillMaxSize().graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }) {
        @Suppress("UNUSED_VARIABLE") val f = frame // leses her, så bare tegnefasen kjøres på nytt per bilde
        val d = density
        scene.ensure(size.width / d, size.height / d)
        scale(d, d, pivot = Offset.Zero) { scene.draw(this) }
    }
}

/** Sola mellom dagens soloppgang (0) og solnedgang (1), som sunF i designet. 0,5 når tidene mangler. */
internal fun wxSunF28(w: WeatherFull?): Float {
    if (w == null) return .5f
    val sr = wxLdt(w.today.sunrise ?: w.days.firstOrNull()?.sunrise) ?: return .5f
    val ss = wxLdt(w.today.sunset ?: w.days.firstOrNull()?.sunset) ?: return .5f
    val total = Duration.between(sr, ss).seconds
    if (total <= 0) return .5f
    return (Duration.between(sr, LocalDateTime.now()).seconds.toFloat() / total).coerceIn(0f, 1f)
}

/* ---------- Bunnlinja: kart til venstre, steder til høyre ---------- */

/** Høyden på bunnlinja uten systemlinja: 6 + 48 + 8 dp. Innholdet får like mye luft nederst. */
internal val WX_BAR28: Dp = 62.dp

/**
 * Frostet linje helt nederst i full bredde (rgba(10,20,35,.32), 1 px hvit 14 %-kant øverst), ikoner 24 dp hvite uten egen
 * sirkel, treffflate 48 × 48, padding 6 dp + systemlinja nederst.
 */
@Composable
internal fun WxBottomBar28(modifier: Modifier, onMap: () -> Unit, onPlaces: () -> Unit) {
    Column(modifier.fillMaxWidth().background(Color(0x520A1423))) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .14f)))
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 14.dp, end = 14.dp, top = 5.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            WxBarBtn28("M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20", 2f) { Haptics.select(); onMap() }
            Spacer(Modifier.weight(1f))
            WxBarBtn28("M4 7h16M4 12h16M4 17h16", 2.2f) { Haptics.select(); onPlaces() }
        }
    }
}

@Composable
private fun WxBarBtn28(d: String, stroke: Float, onClick: () -> Unit) {
    Box(Modifier.size(48.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) { WxIcon(d, Color.White, 24.dp, stroke = stroke) }
}
