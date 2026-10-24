package no.kristo.finanshub

import android.net.Uri
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/*
 * Prompt 48 (ANDROID48) – Del 2 og Del 5 i design_handoff_homelab/prompts/prompt-48-pakke/oppdrag.md.
 *
 * Veien for ett kvitteringsbilde fra Skann (kamera, dokumentskanner, Bilder eller Filer):
 *   1. Forbehandling på telefonen: EXIF-rotasjon og nedskalering til ca. 2000 px (ReceiptImage48). Perspektiv/beskjæring med
 *      ML Kit Document Scanner når «Dokumentskanner» er på (ui/Receipt48Ui.kt).
 *   2. «Les teksten på telefonen» på (PREF_OCR_LOCAL47, AV som standard): ML Kit → device_ocr i felles OCR-format.
 *      Android har ingen device_parse (Gemini Nano er droppet).
 *   3. POST /finans/api/receipts/scan (multipart): image + scan (1600 px) + thumb + client «android x.y» + device_ocr (bare når
 *      OCR-valget er på og ga tekst). Serveren kjører A → B → C → Tesseract → D og validerer alt.
 *   4. Svaret vises som et redigerbart skjema (Draft) med usikre felt markert (failed_fields/uncertain_fields) og merkelapp for
 *      veien («Android + Glimt», «Mac», «Glimt (Tesseract)», «Gemini») fra serveren. Rettelser sendes til
 *      POST /receipts/:id/corrections (felles format) og lagres med PATCH /receipts/:id (+ /book).
 *   Uten forbindelse: delene legges i den eksisterende WorkManager-køen (upload/PendingUploads.kt) med stien /receipts/scan og
 *   sendes når serveren svarer (Glimt validerer da på nytt). Eldre server (404/405): vanlig opplasting som før.
 * Alle kall går til den innloggede Homelab-serveren (Api). Ingen tredjeparts-tjenester.
 */

/** «Dokumentskanner» (ML Kit Document Scanner via Play-tjenester). AV som standard. */
const val PREF_DOCSCAN48 = "docscan48"
/** Kjeden på serveren kan bruke en stund (Mac-OCR + lokal modell med ett nytt forsøk per steg). */
const val SCAN_READ48 = 240_000
const val SCAN_PATH48 = "/receipts/scan"

data class ScanStep48(val step: String, val name: String, val status: String, val ms: Long, val engine: String?, val reason: String?)

/** Svaret fra POST /receipts/scan, det skjemaet trenger. */
data class ScanResult48(
    val receiptId: String, val receipt: JSONObject?, val confidence: String, val failed: Set<String>, val uncertain: Set<String>,
    val pipeline: List<ScanStep48>, val used: String?, val label: String?, val engine: String?, val model: String?,
    val warnings: List<String>, val errors: List<String>, val seconds: Double?, val sentOcr: Boolean,
) {
    fun unsure(field: String) = field in failed || field in uncertain
}

data class ScanItem48(val description: String, val amount: String)

/** Skjemaet (tekstfelt som strenger mens brukeren skriver). */
data class ScanForm48(
    val merchant: String, val date: String, val time: String, val total: String, val category: String, val categoryTouched: Boolean,
    val orgNumber: String, val payment: String, val items: List<ScanItem48>,
)

sealed interface ReceiptScanState48 {
    data object Idle : ReceiptScanState48
    data class Scanning(val note: String) : ReceiptScanState48
    data class Uploading(val withOcr: Boolean, val note: String? = null) : ReceiptScanState48
    data class Draft(val result: ScanResult48, val form: ScanForm48, val saving: Boolean = false, val error: String? = null) : ReceiptScanState48
    data class Done(val title: String, val text: String, val queued: Boolean = false) : ReceiptScanState48
    data class Error(val message: String, val retry: Boolean = true) : ReceiptScanState48
}

internal fun amount48(s: String): Double? = s.replace("kr", "", true).replace(" ", "").replace(" ", "").replace("−", "-").replace(',', '.').trim().toDoubleOrNull()
internal fun amountText48(v: Double?): String = if (v == null) "" else String.format(Locale("nb", "NO"), "%.2f", v)
internal fun dateOk48(s: String) = Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(s.trim()) && runCatching { java.time.LocalDate.parse(s.trim()) }.isSuccess

/** Eldre server uten /receipts/scan: bildet som «file» til /receipts (uten device_ocr og client). */
internal fun legacyParts48(parts: List<Api.Part>): List<Api.Part> =
    parts.filter { it.name == "image" || it.name == "scan" || it.name == "thumb" }.map { if (it.name == "image") it.copy(name = "file") else it }

internal fun parseScan48(s: String, sentOcr: Boolean): ScanResult48 {
    val o = JSONObject(s)
    fun set(k: String) = o.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() }.toSet() } ?: emptySet()
    fun list(k: String) = o.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } } ?: emptyList()
    val steps = o.optJSONArray("pipeline")?.let { a ->
        (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { p ->
            ScanStep48(p.optString("step"), p.optString("name"), p.optString("status"), p.optLong("ms"), p.optStr("engine"), p.optStr("reason"))
        }
    } ?: emptyList()
    return ScanResult48(
        o.getString("receipt_id"), o.optJSONObject("receipt"), o.optString("confidence", "low"), set("failed_fields"), set("uncertain_fields"),
        steps, o.optStr("used"), o.optStr("label"), o.optStr("engine"), o.optStr("model"), list("warnings"), list("errors"), o.optDoubleOrNull("seconds"), sentOcr,
    )
}

internal fun formOf48(r: JSONObject?): ScanForm48 {
    val items = r?.optJSONArray("items")?.let { a ->
        (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { ScanItem48(it.optString("description"), amountText48(it.optDoubleOrNull("amount"))) }
    } ?: emptyList()
    return ScanForm48(
        r?.optStr("merchant") ?: "", r?.optStr("date") ?: "", r?.optStr("time") ?: "", amountText48(r?.optDoubleOrNull("total")),
        r?.optStr("category_suggestion") ?: "", false, r?.optStr("org_number") ?: "", r?.optStr("payment_method") ?: "", items,
    )
}

/** Skjemaet → felles kvitteringsformat. Feltene skjemaet ikke viser (rabatter, mva, subtotal, valuta) tas fra modellens svar. */
internal fun receiptOf48(model: JSONObject?, f: ScanForm48): JSONObject {
    val o = if (model != null) JSONObject(model.toString()) else JSONObject().put("currency", "NOK").put("discounts", JSONArray()).put("vat", JSONArray())
    o.put("merchant", f.merchant.trim()).put("date", f.date.trim())
    o.put("time", f.time.trim().takeIf { Regex("^\\d{2}:\\d{2}$").matches(it) } ?: JSONObject.NULL)
    o.put("total", amount48(f.total) ?: JSONObject.NULL)
    o.put("org_number", f.orgNumber.filter { it.isDigit() }.takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
    o.put("payment_method", f.payment.trim().takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
    o.put("category_suggestion", f.category.trim())
    val old = model?.optJSONArray("items")
    val items = JSONArray()
    f.items.forEachIndexed { i, it ->
        val amt = amount48(it.amount) ?: return@forEachIndexed
        if (it.description.isBlank()) return@forEachIndexed
        val prev = old?.optJSONObject(i)
        val same = prev != null && prev.optString("description") == it.description && prev.optDoubleOrNull("amount") == amt
        items.put(JSONObject().put("description", it.description.trim()).put("amount", amt)
            .put("quantity", if (same) prev!!.opt("quantity") ?: JSONObject.NULL else JSONObject.NULL)
            .put("unit_price", if (same) prev!!.opt("unit_price") ?: JSONObject.NULL else JSONObject.NULL))
    }
    o.put("items", items)
    return o
}

/** Er noe av det brukeren kan endre, endret? */
internal fun changed48(model: JSONObject?, f: ScanForm48): Boolean = model == null || key48(formOf48(model)) != key48(f)
private fun key48(f: ScanForm48) = listOf(f.merchant.trim(), f.date.trim(), f.time.trim(), amount48(f.total), f.category.trim(), f.orgNumber.filter { it.isDigit() }, f.payment.trim(),
    f.items.filter { it.description.isNotBlank() && amount48(it.amount) != null }.map { it.description.trim() to amount48(it.amount) }).toString()

/** Opplasting, kø og lagring (prompt 48). Bruker appens Api (innlogget server) og WorkManager-køen. */
internal class ReceiptRepository48(private val vm: AppViewModel) {
    private val ctx get() = vm.appCtx48

    fun clientName(): String = "android " + (runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?")

    /** Multipart-delene: image (original eller forbehandlet JPEG), scan, thumb, client og evt. device_ocr. */
    suspend fun parts(prep: PreparedImage48, ocr: ReceiptOcrResult48?): List<Api.Part> = withContext(Dispatchers.Default) {
        val keepOriginal = vm.flag(AppPrefs.KEEP_ORIGINAL, true)
        val ext = when (prep.mime) { "image/png" -> "png"; "image/webp" -> "webp"; "image/heic" -> "heic"; "image/heif" -> "heif"; "image/jpeg", "image/jpg" -> "jpg"; else -> null }
        val parts = mutableListOf<Api.Part>()
        // Originalen når den skal lagres og serveren kan lese typen; ellers den oppreiste, nedskalerte JPEG-en (bbox gjelder begge).
        parts += if (keepOriginal && ext != null) Api.Part("image", "kvittering.$ext", if (ext == "jpg") "image/jpeg" else prep.mime, prep.original)
        else Api.Part("image", "kvittering.jpg", "image/jpeg", prep.jpeg)
        parts += Api.Part("scan", "scan.jpg", "image/jpeg", ReceiptImage48.smaller(prep.bitmap, 1600, 85))
        parts += Api.Part("thumb", "thumb.jpg", "image/jpeg", ReceiptImage48.smaller(prep.bitmap, 240, 75))
        parts += Api.Part.text("client", clientName())
        if (ocr != null) parts += Api.Part.text("device_ocr", ocr.toJson().toString())
        parts
    }

    suspend fun upload(parts: List<Api.Part>, sentOcr: Boolean): ScanResult48 =
        parseScan48(vm.api48 { upload(SCAN_PATH48, parts, read = SCAN_READ48) }, sentOcr)

    suspend fun queue(parts: List<Api.Part>, name: String, why: String?) = vm.queue48(SCAN_PATH48, parts, name, why)

    /** Venter til køen på serveren er ferdig med kvitteringen (kategori, bankmatch), så lagringen ikke overskrives. */
    private suspend fun ready(id: String): JSONObject {
        var o = JSONObject(vm.api48 { get("/receipts/$id") })
        var n = 0
        while (o.optString("status") in setOf("pending", "processing") && n++ < 30) { delay(1000); o = JSONObject(vm.api48 { get("/receipts/$id") }) }
        return o
    }

    /** Lagrer skjemaet. Returnerer meldingen som vises. Kaster ved ugyldige felt eller serverfeil. */
    suspend fun save(r: ScanResult48, f: ScanForm48, book: Boolean): String {
        val total = amount48(f.total) ?: throw IllegalArgumentException("Totalen må være et beløp, f.eks. 249,90")
        if (f.merchant.isBlank()) throw IllegalArgumentException("Butikk må fylles ut")
        if (!dateOk48(f.date)) throw IllegalArgumentException("Datoen må være på formen ÅÅÅÅ-MM-DD")
        val id = r.receiptId
        // Rettelsen (modellens svar + brukerens versjon) lagres som testdata på serveren – bare når noe er endret.
        val corrected = changed48(r.receipt, f)
        if (corrected) runCatching { vm.api48 { request("POST", "/receipts/$id/corrections", JSONObject().put("receipt", receiptOf48(r.receipt, f))) } }
        val stored = ready(id)
        val body = JSONObject()
        if (f.merchant.trim() != stored.optString("merchant")) body.put("merchant", f.merchant.trim())
        if (f.date.trim() != stored.optString("date")) body.put("date", f.date.trim())
        if (stored.optDoubleOrNull("total") != total) body.put("total", total)
        if (f.categoryTouched) {
            val cat = vm.boot?.categories?.firstOrNull { it.kind == "expense" && it.name.equals(f.category.trim(), true) }
            if (cat != null && cat.id != stored.optIntOrNull("categoryId")) body.put("categoryId", cat.id)
        }
        if (body.length() > 0) vm.api48 { patch("/receipts/$id", body) }
        val booked = stored.optString("status") == "booked"
        if (book && !booked) vm.api48 { post("/receipts/$id/book") }
        return when {
            book && booked -> "Kvitteringen var allerede bokført · ${f.merchant.trim()}"
            book -> "Bokført · ${f.merchant.trim()}"
            else -> "Lagret til gjennomgang · ${f.merchant.trim()}"
        }
    }
}

/**
 * Tilstanden for kvitteringsskanningen (StateFlow). Appen har én AppViewModel; denne holderen eies av den (vm.scan48) og
 * bruker dens korutine-scope, slik at opplastingen fortsetter selv om arket lukkes.
 */
class ReceiptScanViewModel48(private val vm: AppViewModel) {
    private val _state = MutableStateFlow<ReceiptScanState48>(ReceiptScanState48.Idle)
    val state: StateFlow<ReceiptScanState48> = _state.asStateFlow()
    /** Arket vises (false = lukket mens opplastingen går videre i bakgrunnen). */
    private val _visible = MutableStateFlow(false)
    val visible: StateFlow<Boolean> = _visible.asStateFlow()

    private val repo = ReceiptRepository48(vm)
    private var job: Job? = null
    private var uri: Uri? = null

    /** Ett bilde fra Skann → ny vei. Flere filer, PDF og opplasting til en bolig går som før. */
    fun intercept(uris: List<Uri>): Boolean {
        if (uris.size != 1) return false
        val mime = runCatching { vm.appCtx48.contentResolver.getType(uris[0]) }.getOrNull() ?: "image/jpeg"
        if (!mime.startsWith("image/")) return false
        start(uris[0])
        return true
    }

    fun start(u: Uri) {
        job?.cancel()
        uri = u
        vm.scanSheet = false // skannearket (Kamera/Bilder/Filer) lukkes, kvitteringsarket tar over
        _visible.value = true
        val ocrOn = vm.flag(PREF_OCR_LOCAL47, false)
        _state.value = ReceiptScanState48.Scanning(if (ocrOn) "Leser teksten på telefonen …" else "Gjør klar bildet …")
        job = vm.scope48.launch {
            try { run(u, ocrOn) } catch (e: CancellationException) { throw e } catch (e: Throwable) {
                // Ingen ukjent feil (eller for lite minne for bildet) skal krasje appen.
                finish(ReceiptScanState48.Error(if (e is OutOfMemoryError) "Bildet er for stort for telefonen" else e.message ?: "Noe gikk galt"))
            }
        }
    }

    private suspend fun run(u: Uri, ocrOn: Boolean) {
        val prep = try { withContext(Dispatchers.IO) { ReceiptImage48.load(vm.appCtx48, u) } } catch (e: CancellationException) { throw e } catch (e: Exception) {
            finish(ReceiptScanState48.Error(e.message ?: "Kunne ikke lese bildet", retry = false)); return
        }
        var note: String? = null
        val ocr = if (!ocrOn) null else {
            val sc = runCatching { ReceiptOcrScanner() }.getOrNull()
            try { sc?.extractText(prep.bitmap) } catch (e: CancellationException) { throw e } catch (e: Exception) {
                note = "${e.message ?: "Lesingen på telefonen feilet"} – bare bildet sendes."; null
            } finally { runCatching { sc?.close() } }
        }
        val parts = try { repo.parts(prep, ocr) } catch (e: CancellationException) { throw e } catch (e: Exception) {
            finish(ReceiptScanState48.Error(e.message ?: "Kunne ikke gjøre klar bildet", retry = false)); return
        }
        if (!vm.canUpload48()) {
            repo.queue(parts, prep.name, "Venter på Wi-Fi")
            finish(ReceiptScanState48.Done("Venter på Wi-Fi", "Kvitteringen sendes til Glimt når telefonen er på Wi-Fi.", queued = true)); return
        }
        _state.value = ReceiptScanState48.Uploading(ocr != null, note)
        try {
            val r = repo.upload(parts, ocr != null)
            vm.reloadReceipts48()
            finish(ReceiptScanState48.Draft(r, formOf48(r.receipt)))
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            when {
                e.status == 404 || e.status == 405 -> {
                    // Eldre server uten /receipts/scan: vanlig opplasting (serveren leser bildet som før).
                    _state.value = ReceiptScanState48.Idle; _visible.value = false
                    vm.uploadPlain48(u)
                }
                e.code == Api.SENT48 -> finish(ReceiptScanState48.Done("Glimt leser fortsatt", "Kvitteringen er mottatt. Den dukker opp under Til gjennomgang når den er lest."))
                e.status == 0 || e.status >= 500 -> {
                    repo.queue(parts, prep.name, e.message)
                    finish(ReceiptScanState48.Done("Venter på Glimt", "Fikk ikke kontakt med serveren. Kvitteringen ligger i køen og sendes av seg selv når Glimt svarer.", queued = true))
                }
                e.status == 401 -> { finish(ReceiptScanState48.Error(e.message ?: "Ikke innlogget", retry = false)) }
                else -> finish(ReceiptScanState48.Error(e.message ?: "Glimt avviste kvitteringen"))
            }
        } catch (e: Exception) {
            finish(ReceiptScanState48.Error(e.message ?: "Noe gikk galt"))
        }
    }

    /** Arket lukket under opplasting: si fra med en melding i stedet for å vise skjemaet. */
    private fun finish(s: ReceiptScanState48) {
        if (_visible.value) { _state.value = s; return }
        vm.message = when (s) {
            is ReceiptScanState48.Draft -> "Kvitteringen er lest (${s.result.label ?: "Glimt"}) og ligger under Til gjennomgang"
            is ReceiptScanState48.Done -> s.text
            is ReceiptScanState48.Error -> s.message
            else -> null
        }
        _state.value = ReceiptScanState48.Idle
    }

    fun retry() { uri?.let { start(it) } }

    fun edit(f: (ScanForm48) -> ScanForm48) {
        val s = _state.value as? ReceiptScanState48.Draft ?: return
        if (s.saving) return
        _state.value = s.copy(form = f(s.form), error = null)
    }

    fun save(book: Boolean) {
        val s = _state.value as? ReceiptScanState48.Draft ?: return
        if (s.saving) return
        _state.value = s.copy(saving = true, error = null)
        job = vm.scope48.launch {
            try {
                val msg = repo.save(s.result, s.form, book)
                vm.reloadReceipts48()
                Haptics.success()
                vm.message = msg
                _visible.value = false
                _state.value = ReceiptScanState48.Idle
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                _state.value = s.copy(saving = false, error = e.message ?: "Kunne ikke lagre")
            }
        }
    }

    /** «Last opp bildet i stedet» etter en feil: vanlig opplasting. */
    fun uploadPlain() {
        val u = uri ?: return close()
        close()
        vm.uploadPlain48(u)
    }

    /** Lukker arket. Under lesing/opplasting fortsetter jobben, og resultatet kommer som melding. */
    fun close() {
        _visible.value = false
        when (_state.value) {
            is ReceiptScanState48.Scanning, is ReceiptScanState48.Uploading -> Unit
            is ReceiptScanState48.Draft -> if (!(_state.value as ReceiptScanState48.Draft).saving) _state.value = ReceiptScanState48.Idle
            else -> _state.value = ReceiptScanState48.Idle
        }
    }
}
