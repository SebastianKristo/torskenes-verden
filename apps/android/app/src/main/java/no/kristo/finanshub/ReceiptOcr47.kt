package no.kristo.finanshub

import android.content.Context
import android.graphics.Rect
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.Closeable
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.abs

/*
 * Prompt 47 (claude-code-android-kvittering-mlkit-ocr.md): lokal OCR av kvitteringer med Google ML Kit Text Recognition.
 * Teksten leses helt på telefonen (modellen lastes ned via Play-tjenester ved installasjon, se AndroidManifest), linjene bevares
 * (varenavn ⇥ pris på samme rad), og bare teksten sendes til serveren: POST /finans/api/receipts/ocr-text {text, lines, source}.
 * Serveren tolker den med Glimt (samme validering av beløp/dato som før). Svarer serveren 404 (eldre server), lastes bildet opp
 * som før. Slås på i Innstillinger → Skanning → «Les teksten på telefonen».
 * Tilpasset appen: pakken er no.kristo.finanshub (ikke no.papir.finans.receipt), tilstanden ligger i P47State på AppViewModel
 * (appen har én ViewModel), og Task venter med suspendCancellableCoroutine (ingen kotlinx-coroutines-play-services).
 */

class ReceiptOcrScanner(
    private val recognizer: TextRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : Closeable {

    /** Kjører helt på enheten. Kaster [ReceiptOcrException47] ved feil eller tom kvittering. */
    suspend fun extractTextFromReceipt(context: Context, imageUri: Uri): ReceiptOcrResult47 {
        val image = withContext(ioDispatcher) {
            try { InputImage.fromFilePath(context.applicationContext, imageUri) } // håndterer EXIF-rotasjon
            catch (e: Exception) { throw ReceiptOcrException47("Kunne ikke lese bildet", e) }
        }
        val result = try { recognizer.process(image).await47() } catch (e: CancellationException) { throw e } catch (e: Exception) {
            throw ReceiptOcrException47("Tekstgjenkjenning feilet. Krever Google Play-tjenester.", e)
        }
        val rows = ReceiptTextFormatter47.rows(result)
        val text = rows.joinToString("\n") { it.joinToString("\t") }.ifBlank { result.getText().trim() }
        if (text.isBlank()) throw ReceiptOcrException47("Fant ingen tekst på kvitteringen")
        return ReceiptOcrResult47(text, rows)
    }

    override fun close() = recognizer.close()
}

data class ReceiptOcrResult47(val text: String, val rows: List<List<String>>)

class ReceiptOcrException47(message: String, cause: Throwable? = null) : Exception(message, cause)

private suspend fun <T> com.google.android.gms.tasks.Task<T>.await47(): T = suspendCancellableCoroutine { c ->
    addOnSuccessListener { r -> if (c.isActive) c.resume(r) }
    addOnFailureListener { e -> if (c.isActive) c.resumeWithException(e) }
    addOnCanceledListener { c.cancel() }
}

/**
 * ML Kit leser ofte varenavn (venstre) og pris (høyre) som separate blokker. Linjene grupperes i rader etter vertikal posisjon
 * og sorteres venstre→høyre, med tab mellom kolonner, slik at Glimt ser kvitteringen slik den er trykt.
 */
internal object ReceiptTextFormatter47 {
    internal data class OcrLine47(val text: String, val left: Int, val top: Int, val bottom: Int) {
        val centerY: Float get() = (top + bottom) / 2f
        val height: Int get() = bottom - top
    }

    fun rows(text: Text): List<List<String>> = group(
        text.getTextBlocks().flatMap { it.getLines() }.mapNotNull { line ->
            val box: Rect = line.getBoundingBox() ?: return@mapNotNull null
            val clean = clean(line.getText())
            if (clean.isEmpty()) null else OcrLine47(clean, box.left, box.top, box.bottom)
        },
    )

    /** Ren funksjon (testbar uten ML Kit): rader med tekst sortert venstre→høyre. */
    fun group(lines: List<OcrLine47>): List<List<String>> {
        if (lines.isEmpty()) return emptyList()
        val heights = lines.map { it.height }.sorted()
        val tolerance = heights[heights.size / 2].coerceAtLeast(1) * 0.5f
        val rows = mutableListOf<MutableList<OcrLine47>>()
        for (line in lines.sortedBy { it.centerY }) {
            val row = rows.lastOrNull()
            if (row != null && abs(row.map { it.centerY }.average() - line.centerY) <= tolerance) row += line else rows += mutableListOf(line)
        }
        return rows.map { r -> r.sortedBy { it.left }.map { it.text } }
    }

    fun clean(s: String) = s.replace(' ', ' ').replace(Regex("[ ]{2,}"), " ").trim()
}

/** Tilstanden i kvitteringsarket (ui/Ui47.kt). */
sealed interface ReceiptScanUiState47 {
    data object Idle : ReceiptScanUiState47
    data object Scanning : ReceiptScanUiState47
    data class TextReady(val ocr: ReceiptOcrResult47) : ReceiptScanUiState47
    data object Uploading : ReceiptScanUiState47
    data class Parsed(val merchant: String?, val total: Double?, val review: Boolean) : ReceiptScanUiState47
    data class Error(val message: String, val ocr: ReceiptOcrResult47? = null) : ReceiptScanUiState47
}

/** Maks tekst som sendes (serveren har egne grenser; dette holder forespørselen liten). */
private const val MAX_TEXT47 = 20_000

/** Sender teksten til serveren. null = serveren kjenner ikke endepunktet (404/405) → last opp bildet i stedet. */
internal suspend fun AppViewModel.sendOcrText47(ocr: ReceiptOcrResult47): JSONObject? {
    val lines = JSONArray()
    ocr.rows.take(400).forEach { r -> lines.put(r.joinToString("\t").take(300)) }
    val body = JSONObject().put("text", ocr.text.take(MAX_TEXT47)).put("lines", lines).put("source", "android-mlkit")
    return try { JSONObject(api47 { request("POST", "/receipts/ocr-text", body, read = 120_000) }) } catch (e: ApiException) {
        if (e.status == 404 || e.status == 405) null else throw e
    }
}

/** Skal denne opplastingen leses på telefonen? Bare enkeltbilder til de vanlige kvitteringene, og bare når valget er på. */
internal fun AppViewModel.ocrIntercept47(uris: List<Uri>): Boolean {
    if (!flag(PREF_OCR_LOCAL47, false) || uris.size != 1) return false
    val mime = runCatching { appCtx47.contentResolver.getType(uris[0]) }.getOrNull() ?: "image/jpeg"
    if (!mime.startsWith("image/")) return false
    startOcr47(uris[0])
    return true
}

fun AppViewModel.startOcr47(uri: Uri) {
    val s = p47
    s.scanJob?.cancel()
    s.scanUri = uri
    s.scan = ReceiptScanUiState47.Scanning
    s.scanJob = launchJob47 {
        val scanner = ReceiptOcrScanner()
        s.scan = try { ReceiptScanUiState47.TextReady(scanner.extractTextFromReceipt(appCtx47, uri)) } catch (e: CancellationException) { throw e } catch (e: Throwable) {
            ReceiptScanUiState47.Error(e.message ?: "Kunne ikke lese kvitteringen")
        } finally { runCatching { scanner.close() } }
    }
}

/** «Send til Glimt». Feiler sendingen, beholdes teksten for «Prøv igjen». */
fun AppViewModel.sendOcr47(ocr: ReceiptOcrResult47) {
    val s = p47
    s.scanJob?.cancel()
    s.scan = ReceiptScanUiState47.Uploading
    s.scanJob = launchJob47 {
        s.scan = try {
            val o = sendOcrText47(ocr)
            if (o == null) {
                // Eldre server: bildet lastes opp og leses på serveren som før.
                val u = s.scanUri
                s.scan = ReceiptScanUiState47.Idle
                if (u != null) uploadImage47(u)
                return@launchJob47
            }
            // 201 → receiptOut med status 'pending': Glimt tolker teksten i køen, og kvitteringen havner i «Til gjennomgang».
            val r = o.optJSONObject("receipt") ?: o
            val total = if (r.has("total") && !r.isNull("total")) r.optDouble("total").takeIf { !it.isNaN() && it > 0 } else null
            val st = r.optString("status")
            ReceiptScanUiState47.Parsed(r.optString("merchant").takeIf { it.isNotBlank() && it != "null" }, total, st != "booked")
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            ReceiptScanUiState47.Error("Kunne ikke sende til Glimt: ${e.message ?: "nettverksfeil"}", ocr)
        }
        reloadReceipts47()
    }
}

fun AppViewModel.closeOcr47() {
    p47.scanJob?.cancel(); p47.scanJob = null
    p47.scan = ReceiptScanUiState47.Idle
    p47.scanUri = null
}

/** «Last opp bildet i stedet»: vanlig opplasting (AI på serveren leser bildet). */
fun AppViewModel.uploadInstead47() {
    val u = p47.scanUri ?: return closeOcr47()
    closeOcr47()
    uploadImage47(u)
}
