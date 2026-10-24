package no.kristo.finanshub

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * Prompt 48 (ANDROID48): felles OCR-format (shared/schemas/receipt-ocr.schema.json) og forbehandling av bildet.
 *  - lines: hver ML Kit-linje med tekst, confidence (0–1 eller null) og bbox [x, y, w, h] normalisert til 0–1 med origo øverst
 *    til venstre (ML Kit gir piksler i bildet vi sendte inn, som allerede er rotert etter EXIF – så bbox gjelder det oppreiste bildet).
 *  - rows: linjer med overlappende y-intervall (overlapp ≥ 50 % av den laveste linjens høyde), sortert på x og slått sammen med
 *    ett mellomrom – samme regel som serveren (server/receipts48/normalize.js rows48) og Mac-tjenesten. Linjer uten bbox til slutt.
 *  - full_text = rows med \n, image_size = [bredde, høyde] etter forbehandling, ms = tid for selve tekstgjenkjenningen.
 *  - source = "android_mlkit" (understrek; prompt 47 brukte bindestrek).
 * Forbehandling: EXIF-rotasjon, så nedskalering til ca. 2000 px på lengste side (lange kvitteringer beholder minst 1000 px bredde,
 * høyst 4000 px høyde, så små skrifttyper fortsatt kan leses). Perspektiv og beskjæring gjøres av ML Kit Document Scanner før dette
 * når valget er på (ui/Receipt48Ui.kt).
 */

const val SOURCE_ANDROID48 = "android_mlkit"

/** Én linje i felles OCR-format. bbox = [x, y, w, h] i 0–1 (origo øverst til venstre) eller null. */
data class OcrLine48(val text: String, val confidence: Double?, val bbox: List<Double>?)

/** Felles OCR-format fra Android (ML Kit). */
data class ReceiptOcrResult48(
    val lines: List<OcrLine48>,
    val rows: List<String>,
    val fullText: String,
    val imageSize: Pair<Int, Int>,
    val ms: Long,
    val source: String = SOURCE_ANDROID48,
) {
    /** JSON som sendes som multipart-feltet device_ocr. Grensene følger schemaet. */
    fun toJson(): JSONObject {
        val ls = JSONArray()
        lines.take(3000).forEach { l ->
            val o = JSONObject().put("text", l.text.take(1000)).put("confidence", l.confidence ?: JSONObject.NULL)
            o.put("bbox", l.bbox?.let { b -> JSONArray().apply { b.forEach { put(it) } } } ?: JSONObject.NULL)
            ls.put(o)
        }
        val rs = JSONArray()
        rows.take(2000).forEach { rs.put(it.take(2000)) }
        return JSONObject().put("source", source).put("lines", ls).put("rows", rs).put("full_text", fullText.take(60_000))
            .put("image_size", JSONArray().put(imageSize.first).put(imageSize.second)).put("ms", ms)
    }

    companion object {
        fun of(lines: List<OcrLine48>, width: Int, height: Int, ms: Long): ReceiptOcrResult48 {
            val rows = ReceiptRows48.group(lines)
            return ReceiptOcrResult48(lines, rows, rows.joinToString("\n"), width.coerceAtLeast(1) to height.coerceAtLeast(1), ms)
        }
    }
}

/** Rene funksjoner (testbare uten ML Kit/Android). */
internal object ReceiptRows48 {
    private class Box(val t: String, val x: Double, val top: Double, val bot: Double, val h: Double)
    private class Group(var top: Double, var bot: Double, var minH: Double) { val parts = mutableListOf<Box>() }

    /** Samme regel som rows48 på serveren. */
    fun group(lines: List<OcrLine48>): List<String> {
        val withBox = mutableListOf<Box>()
        val noBox = mutableListOf<String>()
        for (l in lines) {
            val t = clean(l.text)
            if (t.isEmpty()) continue
            val b = l.bbox?.takeIf { it.size == 4 && it.all { v -> v.isFinite() } }
            if (b != null) withBox += Box(t, b[0], b[1], b[1] + b[3], b[3]) else noBox += t
        }
        val sorted = withBox.sortedWith(compareBy<Box> { (it.top + it.bot) / 2 }.thenBy { it.x })
        val groups = mutableListOf<Group>()
        for (w in sorted) {
            val g = groups.firstOrNull { r -> min(r.bot, w.bot) - max(r.top, w.top) >= 0.5 * min(r.minH, if (w.h == 0.0) 1e-9 else w.h) }
            if (g != null) { g.parts += w; g.top = min(g.top, w.top); g.bot = max(g.bot, w.bot); g.minH = min(g.minH, w.h) }
            else groups += Group(w.top, w.bot, w.h).also { it.parts += w }
        }
        val out = groups.sortedBy { it.top }.map { g -> g.parts.sortedBy { it.x }.joinToString(" ") { it.t } }
        return out + noBox
    }

    /** Piksler (origo øverst til venstre) → [x, y, w, h] i 0–1, avrundet til 4 desimaler. */
    fun bbox(left: Int, top: Int, right: Int, bottom: Int, width: Int, height: Int): List<Double>? {
        if (width <= 0 || height <= 0 || right <= left || bottom <= top) return null
        val x0 = (left.toDouble() / width).coerceIn(0.0, 1.0)
        val y0 = (top.toDouble() / height).coerceIn(0.0, 1.0)
        val x1 = (right.toDouble() / width).coerceIn(0.0, 1.0)
        val y1 = (bottom.toDouble() / height).coerceIn(0.0, 1.0)
        return listOf(r4(x0), r4(y0), r4(x1 - x0), r4(y1 - y0))
    }

    fun confidence(c: Float?): Double? = c?.takeIf { it.isFinite() && it >= 0f }?.let { r4(min(1.0, it.toDouble())) }

    fun clean(s: String) = s.replace(' ', ' ').replace('\t', ' ').replace(Regex(" {2,}"), " ").trim()

    private fun r4(v: Double) = (v * 10_000).roundToInt() / 10_000.0
}

/** Bildet etter forbehandling: oppreist og skalert bitmap, JPEG av det, og originalbytene. */
class PreparedImage48(val bitmap: Bitmap, val jpeg: ByteArray, val original: ByteArray, val mime: String, val name: String)

internal object ReceiptImage48 {
    const val TARGET_LONG = 2000
    private const val MIN_SHORT = 1000
    private const val MAX_LONG = 4000

    /** Skaleringsfaktor (≤ 1) for et oppreist bilde w×h. Ren funksjon. */
    fun scale(w: Int, h: Int): Double {
        val long = max(w, h).toDouble()
        val short = min(w, h).toDouble()
        if (long <= TARGET_LONG || short <= 0) return 1.0
        var s = TARGET_LONG / long
        // Lange kvitteringer: ikke krymp bredden under ca. 1000 px (da forsvinner små skrifttyper), men høyst 4000 px lang side.
        if (short * s < MIN_SHORT) s = min(1.0, min(MIN_SHORT / short, MAX_LONG / long).coerceAtLeast(s))
        return s
    }

    /** EXIF-rotasjon (grader) og speiling fra originalbytene. */
    private fun orientation(data: ByteArray): Int = runCatching {
        ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)

    private fun matrixFor(orientation: Int, s: Float): Matrix = Matrix().apply {
        postScale(s, s)
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
            2 -> postScale(-1f, 1f)                     // FLIP_HORIZONTAL
            4 -> postScale(1f, -1f)                     // FLIP_VERTICAL
            5 -> { postRotate(90f); postScale(-1f, 1f) } // TRANSPOSE
            7 -> { postRotate(270f); postScale(-1f, 1f) } // TRANSVERSE
        }
    }

    /** Leser bildet, roterer etter EXIF og skalerer ned. Kaster [ReceiptOcrException47] når bildet ikke kan leses. */
    fun load(ctx: Context, uri: Uri): PreparedImage48 {
        val cr = ctx.contentResolver
        val mime = runCatching { cr.getType(uri) }.getOrNull() ?: "image/jpeg"
        val original = try { cr.openInputStream(uri)?.use { it.readBytes() } } catch (e: Exception) { throw ReceiptOcrException47("Kunne ikke lese bildet", e) }
            ?: throw ReceiptOcrException47("Kunne ikke lese bildet")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(original, 0, original.size, bounds)
        val orient = orientation(original)
        val swap = orient in setOf(5, 6, 7, 8)
        var bmp: Bitmap? = null
        var exifApplied = false
        if (bounds.outWidth > 0 && bounds.outHeight > 0) {
            val (uw, uh) = if (swap) bounds.outHeight to bounds.outWidth else bounds.outWidth to bounds.outHeight
            val wantLong = max(uw, uh) * scale(uw, uh)
            var sample = 1
            while (max(uw, uh) / (sample * 2) >= wantLong) sample *= 2
            bmp = BitmapFactory.decodeByteArray(original, 0, original.size, BitmapFactory.Options().apply { inSampleSize = sample })
        }
        if (bmp == null && Build.VERSION.SDK_INT >= 28) {
            // HEIC/HEIF som BitmapFactory ikke klarer: ImageDecoder (snur selv etter EXIF).
            bmp = runCatching {
                android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(original))) { dec, info, _ ->
                    val s = scale(info.size.width, info.size.height)
                    if (s < 1.0) dec.setTargetSize((info.size.width * s).roundToInt().coerceAtLeast(1), (info.size.height * s).roundToInt().coerceAtLeast(1))
                    dec.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
                }
            }.getOrNull()
            exifApplied = bmp != null
        }
        val src = bmp ?: throw ReceiptOcrException47("Bildeformatet støttes ikke på denne telefonen")
        val o = if (exifApplied) ExifInterface.ORIENTATION_NORMAL else orient
        val (w, h) = if (o in setOf(5, 6, 7, 8)) src.height to src.width else src.width to src.height
        val s = scale(w, h).toFloat()
        val upright = if (s >= 0.999f && o == ExifInterface.ORIENTATION_NORMAL) src else Bitmap.createBitmap(src, 0, 0, src.width, src.height, matrixFor(o, s), true)
        val jpeg = jpeg(upright, 90)
        val name = runCatching { uri.lastPathSegment?.substringAfterLast('/') }.getOrNull()?.takeIf { it.isNotBlank() } ?: "kvittering.jpg"
        return PreparedImage48(upright, jpeg, original, mime.lowercase(), name.take(120))
    }

    fun jpeg(b: Bitmap, quality: Int): ByteArray = ByteArrayOutputStream().use { o -> b.compress(Bitmap.CompressFormat.JPEG, quality, o); o.toByteArray() }

    /** Mindre JPEG (skannekopi 1600 px, miniatyr 240 px). */
    fun smaller(b: Bitmap, maxSide: Int, quality: Int): ByteArray {
        val k = min(1.0, maxSide.toDouble() / max(b.width, b.height))
        val sb = if (k >= 0.999) b else Bitmap.createScaledBitmap(b, (b.width * k).roundToInt().coerceAtLeast(1), (b.height * k).roundToInt().coerceAtLeast(1), true)
        return jpeg(sb, quality)
    }
}
