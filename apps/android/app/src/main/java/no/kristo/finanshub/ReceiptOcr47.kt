package no.kristo.finanshub

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.Closeable
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/*
 * Prompt 47 → 48: lokal OCR av kvitteringer med Google ML Kit Text Recognition (Latin).
 * Prompt 48 (ANDROID48): resultatet er nå det felles OCR-formatet (ReceiptOcr48.kt: lines med bbox 0–1 og confidence, rows,
 * full_text, image_size, ms, source «android_mlkit»), og det sendes SAMMEN MED bildet til POST /finans/api/receipts/scan
 * (ReceiptScan48.kt). Den gamle tekst-ruten (/receipts/ocr-text uten bilde) brukes ikke lenger.
 * Alt kjører på telefonen: modellen lastes ned via Google Play-tjenester (AndroidManifest «ocr»), ingen nettverkskall herfra.
 * Valget «Les teksten på telefonen» (PREF_OCR_LOCAL47) er av som standard.
 * Språk: Latin-gjenkjenneren har ingen språkvalg – den dekker alle latinske alfabeter, også æ/ø/å.
 */

class ReceiptOcrScanner(
    private val recognizer: TextRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : Closeable {

    /** Kjører helt på enheten: EXIF + nedskalering (ReceiptImage48), så ML Kit. Kaster [ReceiptOcrException47] ved feil eller tom kvittering. */
    suspend fun extractTextFromReceipt(context: Context, imageUri: Uri): ReceiptOcrResult48 {
        val prep = withContext(ioDispatcher) { ReceiptImage48.load(context.applicationContext, imageUri) }
        return extractText(prep.bitmap)
    }

    /** OCR på et oppreist bitmap (bbox normaliseres mot dette bildets størrelse). */
    suspend fun extractText(bitmap: Bitmap): ReceiptOcrResult48 {
        val t0 = System.currentTimeMillis()
        val image = InputImage.fromBitmap(bitmap, 0)
        val result = try { recognizer.process(image).await47() } catch (e: CancellationException) { throw e } catch (e: Exception) {
            throw ReceiptOcrException47("Tekstgjenkjenning feilet. Krever Google Play-tjenester.", e)
        }
        val ms = System.currentTimeMillis() - t0
        val lines = lines48(result, bitmap.width, bitmap.height)
        if (lines.isEmpty()) throw ReceiptOcrException47("Fant ingen tekst på kvitteringen")
        return ReceiptOcrResult48.of(lines, bitmap.width, bitmap.height, ms)
    }

    override fun close() = recognizer.close()
}

/** ML Kit-linjene i lesefølge → felles format (tekst, confidence, bbox 0–1). */
internal fun lines48(text: Text, width: Int, height: Int): List<OcrLine48> =
    text.getTextBlocks().flatMap { it.getLines() }.mapNotNull { line ->
        val t = ReceiptRows48.clean(line.getText())
        if (t.isEmpty()) return@mapNotNull null
        val box = line.getBoundingBox()
        val conf = runCatching { line.getConfidence() }.getOrNull()
        OcrLine48(t, ReceiptRows48.confidence(conf), box?.let { ReceiptRows48.bbox(it.left, it.top, it.right, it.bottom, width, height) })
    }

class ReceiptOcrException47(message: String, cause: Throwable? = null) : Exception(message, cause)

internal suspend fun <T> com.google.android.gms.tasks.Task<T>.await47(): T = suspendCancellableCoroutine { c ->
    addOnSuccessListener { r -> if (c.isActive) c.resume(r) }
    addOnFailureListener { e -> if (c.isActive) c.resumeWithException(e) }
    addOnCanceledListener { c.cancel() }
}
