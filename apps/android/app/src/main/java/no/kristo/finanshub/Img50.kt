package no.kristo.finanshub

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.LruCache
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.Cache
import okhttp3.CacheControl
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * Prompt 50 (MEDAND50, claude-code-media-bilder-raskt.md + claude-code-chat-slipp-filer-og-miniatyr.md):
 * Bildelaster uten nye avhengigheter (ikke Coil): OkHttp med diskcache (320 MB, `cacheDir/img50`) + LruCache i minnet (1/8 av heapen).
 *  - Serveren sender `Cache-Control: private, max-age=31536000, immutable` for versjonerte plakat-URL-er (`?v=`) og miniatyrene i Chat,
 *    så andre gang kommer bildet fra disken uten nettverkskall. Uten nett: FORCE_CACHE (cachede plakater vises fortsatt).
 *  - Avbryt: kallet kanselleres når composablen forlater skjermen (scrollet forbi), så synlige bilder får båndbredden.
 *  - Authorization sendes bare til egen server, og ikke når URL-en er signert (`sig=`). Aldri til andre verter (TMDB o.l.).
 *  - ThumbHash50: port av evanw/thumbhash (samme format som `public/js/thumbhash50.js`) → 32 px plassholder i plakatens farger.
 */
object Img50 {
    @Volatile private var http: OkHttpClient? = null
    private val mem = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 8).coerceAtMost(96L * 1024 * 1024).toInt()) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pre = Semaphore(3)
    private val warm = HashSet<String>()

    private fun client(ctx: Context): OkHttpClient = http ?: synchronized(this) {
        http ?: OkHttpClient.Builder()
            .cache(Cache(File(ctx.applicationContext.cacheDir, "img50"), 320L * 1024 * 1024))
            .connectTimeout(6, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS)
            .build().also { http = it }
    }

    /** Relativ sti («/api/media/bilde/…») → full URL mot valgt server. */
    fun abs(base: String, url: String): String = if (url.startsWith("/")) base.trimEnd('/') + url else url

    fun cached(base: String, url: String?): Bitmap? = url?.takeIf { it.isNotBlank() }?.let { mem.get(abs(base, it)) }
    fun put(base: String, url: String, bmp: Bitmap) { mem.put(abs(base, url), bmp) }

    private fun own(base: String, full: String): Boolean {
        val b = base.trimEnd('/')
        return b.isNotEmpty() && (full == b || full.startsWith("$b/"))
    }

    private suspend fun fetch(ctx: Context, base: String, token: String?, full: String, cacheOnly: Boolean): ByteArray? {
        val rb = Request.Builder().url(full).header("User-Agent", "FinansHub-Android")
        if (own(base, full) && !full.contains("sig=") && token != null) rb.header("Authorization", "Bearer $token")
        if (cacheOnly) rb.cacheControl(CacheControl.FORCE_CACHE)
        val call = client(ctx).newCall(rb.build())
        return suspendCancellableCoroutine { cont ->
            cont.invokeOnCancellation { runCatching { call.cancel() } }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) { if (cont.isActive) cont.resume(null) }
                override fun onResponse(call: Call, response: Response) {
                    val b = response.use { r -> if (r.isSuccessful) runCatching { r.body?.bytes() }.getOrNull() else null }
                    if (cont.isActive) cont.resume(b)
                }
            })
        }
    }

    private fun decode(data: ByteArray, maxPx: Int): Bitmap? = runCatching {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, o)
        var s = 1
        while (maxOf(o.outWidth, o.outHeight) / (s * 2) >= maxPx) s *= 2
        BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = s })
    }.getOrNull()

    /** Henter bildet (minne → disk → nett; uten nett bare disk). maxPx = lengste side vi trenger. */
    suspend fun load(ctx: Context, base: String, token: String?, url: String?, maxPx: Int = 1400): Bitmap? {
        if (url.isNullOrBlank()) return null
        val full = abs(base, url)
        if (!full.startsWith("http")) return null
        mem.get(full)?.let { return it }
        val t0 = System.currentTimeMillis()
        val data = fetch(ctx, base, token, full, false) ?: fetch(ctx, base, token, full, true) ?: return null
        val bmp = withContext(Dispatchers.Default) { decode(data, maxPx) } ?: return null
        mem.put(full, bmp)
        // Tid per bilde (forespørsel → ferdig dekodet); URL uten spørring, så signaturen ikke havner i loggen.
        android.util.Log.d("Img50", "${System.currentTimeMillis() - t0} ms · ${data.size / 1024} kB · ${full.substringBefore('?').takeLast(60)}")
        return bmp
    }

    /** Forhåndslast (lav prioritet, maks 3 samtidig): plakatene for de neste radene. */
    fun prefetch(ctx: Context, base: String, token: String?, urls: List<String>, maxPx: Int) {
        for (u in urls) {
            val full = abs(base, u)
            if (mem.get(full) != null || !synchronized(warm) { warm.add(full) }) continue
            scope.launch { pre.withPermit { runCatching { load(ctx, base, token, u, maxPx) } }; synchronized(warm) { warm.remove(full) } }
        }
    }

    /** Råbytes (fra cache når mulig) – brukes av «Del» i lysboksen. */
    suspend fun bytes(ctx: Context, base: String, token: String?, url: String): ByteArray? {
        val full = abs(base, url)
        return fetch(ctx, base, token, full, false) ?: fetch(ctx, base, token, full, true)
    }
}

/** Plakat/fanart fra serveren (prompt 50): `posterImg {url, hash, w, h, srcset, widths, version}`. */
data class MImg50(val url: String, val hash: String?, val w: Int?, val h: Int?, val srcset: List<Pair<Int, String>>, val version: String?) {
    /** Minste bredde ≥ px (ellers største). Uten srcset byttes `w=` i URL-en. */
    fun pick(px: Int): String {
        if (srcset.isNotEmpty()) return (srcset.sortedBy { it.first }.firstOrNull { it.first >= px } ?: srcset.maxBy { it.first }).second
        return url
    }
}

fun parseImg50(o: org.json.JSONObject?): MImg50? {
    val url = o?.optString("url")?.takeIf { it.isNotBlank() && it != "null" } ?: return null
    val set = o.optString("srcset").split(", ").mapNotNull { p ->
        val i = p.trim().lastIndexOf(' ')
        if (i <= 0) null else p.trim().substring(i + 1).removeSuffix("w").toIntOrNull()?.let { it to p.trim().substring(0, i) }
    }
    return MImg50(url, o.optString("hash").takeIf { it.isNotBlank() && it != "null" }, o.optInt("w", 0).takeIf { it > 0 }, o.optInt("h", 0).takeIf { it > 0 }, set,
        o.optString("version").takeIf { it.isNotBlank() && it != "null" })
}

/** Bilde-URL fra /api/media/bilde uten posterImg (eldre listeform): bytt w= til nærmeste faste bredde. */
fun bildeW50(url: String, px: Int, widths: List<Int> = listOf(160, 320, 640)): String {
    if (!url.contains("/api/media/bilde/") || !Regex("[?&]w=\\d+").containsMatchIn(url) || url.contains("sig=")) return url
    val w = widths.firstOrNull { it >= px } ?: widths.last()
    return url.replace(Regex("([?&])w=\\d+"), "$1w=$w")
}

/** ThumbHash → 32 px bitmap (port av evanw/thumbhash, MIT – samme algoritme som public/js/thumbhash50.js). */
object ThumbHash50 {
    private val memo = LruCache<String, Bitmap>(600)

    fun bitmap(b64: String?): Bitmap? {
        if (b64.isNullOrBlank()) return null
        memo.get(b64)?.let { return it }
        val b = runCatching { decode(Base64.decode(b64, Base64.DEFAULT)) }.getOrNull() ?: return null
        memo.put(b64, b)
        return b
    }

    fun aspect(hash: ByteArray): Double {
        val header = hash[3].toInt() and 0xFF
        val hasAlpha = (hash[2].toInt() and 0x80) != 0
        val isLandscape = (hash[4].toInt() and 0x80) != 0
        val lx = if (isLandscape) (if (hasAlpha) 5 else 7) else header and 7
        val ly = if (isLandscape) header and 7 else if (hasAlpha) 5 else 7
        return lx.toDouble() / ly
    }

    fun decode(hash: ByteArray): Bitmap {
        fun u(i: Int) = hash[i].toInt() and 0xFF
        val header24 = u(0) or (u(1) shl 8) or (u(2) shl 16)
        val header16 = u(3) or (u(4) shl 8)
        val lDc = (header24 and 63) / 63.0
        val pDc = ((header24 shr 6) and 63) / 31.5 - 1
        val qDc = ((header24 shr 12) and 63) / 31.5 - 1
        val lScale = ((header24 shr 18) and 31) / 31.0
        val hasAlpha = (header24 shr 23) != 0
        val pScale = ((header16 shr 3) and 63) / 63.0
        val qScale = ((header16 shr 9) and 63) / 63.0
        val isLandscape = (header16 shr 15) != 0
        val lx = max(3, if (isLandscape) (if (hasAlpha) 5 else 7) else header16 and 7)
        val ly = max(3, if (isLandscape) header16 and 7 else if (hasAlpha) 5 else 7)
        val aDc = if (hasAlpha) (u(5) and 15) / 15.0 else 1.0
        val aScale = (u(5) shr 4) / 15.0
        val acStart = if (hasAlpha) 6 else 5
        var acIndex = 0
        fun channel(nx: Int, ny: Int, scale: Double): DoubleArray {
            val ac = ArrayList<Double>()
            for (cy in 0 until ny) {
                var cx = if (cy > 0) 0 else 1
                while (cx * ny < nx * (ny - cy)) {
                    ac.add((((u(acStart + (acIndex shr 1)) shr ((acIndex and 1) shl 2)) and 15) / 7.5 - 1) * scale)
                    acIndex++; cx++
                }
            }
            return ac.toDoubleArray()
        }
        val lAc = channel(lx, ly, lScale)
        val pAc = channel(3, 3, pScale * 1.25)
        val qAc = channel(3, 3, qScale * 1.25)
        val aAc = if (hasAlpha) channel(5, 5, aScale) else null
        val ratio = aspect(hash)
        val w = (if (ratio > 1) 32.0 else 32 * ratio).roundToInt().coerceAtLeast(1)
        val h = (if (ratio > 1) 32 / ratio else 32.0).roundToInt().coerceAtLeast(1)
        val px = IntArray(w * h)
        val fx = DoubleArray(7)
        val fy = DoubleArray(7)
        for (y in 0 until h) for (x in 0 until w) {
            var l = lDc; var p = pDc; var q = qDc; var a = aDc
            for (cx in 0 until max(lx, if (hasAlpha) 5 else 3)) fx[cx] = cos(Math.PI / w * (x + 0.5) * cx)
            for (cy in 0 until max(ly, if (hasAlpha) 5 else 3)) fy[cy] = cos(Math.PI / h * (y + 0.5) * cy)
            var j = 0
            for (cy in 0 until ly) {
                val fy2 = fy[cy] * 2
                var cx = if (cy > 0) 0 else 1
                while (cx * ly < lx * (ly - cy)) { l += lAc[j] * fx[cx] * fy2; j++; cx++ }
            }
            j = 0
            for (cy in 0 until 3) {
                val fy2 = fy[cy] * 2
                var cx = if (cy > 0) 0 else 1
                while (cx < 3 - cy) { val f = fx[cx] * fy2; p += pAc[j] * f; q += qAc[j] * f; j++; cx++ }
            }
            if (aAc != null) {
                j = 0
                for (cy in 0 until 5) {
                    val fy2 = fy[cy] * 2
                    var cx = if (cy > 0) 0 else 1
                    while (cx < 5 - cy) { a += aAc[j] * fx[cx] * fy2; j++; cx++ }
                }
            }
            val b = l - 2.0 / 3.0 * p
            val r = (3 * l - b + q) / 2
            val g = r - q
            fun c(v: Double) = max(0.0, 255 * min(1.0, v)).toInt()
            px[y * w + x] = (c(a) shl 24) or (c(r) shl 16) or (c(g) shl 8) or c(b)
        }
        return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }
}
