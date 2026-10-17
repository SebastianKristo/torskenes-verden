package no.kristo.finanshub

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URLEncoder

enum class Screen(val label: String) { Home("Hjem"), List("Liste"), Budget("Budsjett"), Scan("Skann"), Me("Meg") }

class AppViewModel(app: Application) : AndroidViewModel(app) {

    // Serveradresse og token lagres kryptert (Android Keystore).
    private val prefs = EncryptedSharedPreferences.create(
        "finanshub", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), app,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var server by mutableStateOf(prefs.getString("server", "") ?: "")
        private set
    var token by mutableStateOf(prefs.getString("token", null))
        private set
    val loggedIn get() = token != null

    var screen by mutableStateOf(Screen.Home)
    var boot by mutableStateOf<Boot?>(null)
    var summary by mutableStateOf<Summary?>(null)
    var txs by mutableStateOf<List<Tx>?>(null)
    var receipts by mutableStateOf<List<Receipt>?>(null)
    var query by mutableStateOf("")
    var filter by mutableStateOf("")
    var selectedTx by mutableStateOf<Int?>(null)
    var selectedBudget by mutableStateOf<Int?>(null)
    var selectedReceipt by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
    var message by mutableStateOf<String?>(null)

    private val api get() = Api(server, token)
    private var pollJob: Job? = null

    init { if (loggedIn) refresh() }

    private fun launch(block: suspend () -> Unit) = viewModelScope.launch {
        try { block() } catch (e: ApiException) {
            if (e.status == 401 && loggedIn) { clearLogin(); message = "Innloggingen er utløpt" } else message = e.message
        } catch (e: Exception) { message = e.message ?: "Noe gikk galt" }
    }

    fun login(url: String, password: String, onDone: () -> Unit = {}) = launch {
        busy = true
        try {
            val base = url.trim().let { if (it.startsWith("http")) it else "https://$it" }.trimEnd('/')
            val t = Api.login(base, password, "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            prefs.edit().putString("server", base).putString("token", t).apply()
            server = base; token = t
            refresh(); onDone()
        } finally { busy = false }
    }

    fun logout() = launch {
        runCatching { api.post("/auth/logout") }
        clearLogin()
    }

    private fun clearLogin() {
        prefs.edit().remove("token").apply()
        token = null; boot = null; summary = null; txs = null; receipts = null
    }

    fun refresh() = launch {
        boot = parseBoot(api.get("/bootstrap"))
        summary = parseSummary(api.get("/summary"))
        when (screen) {
            Screen.List, Screen.Budget -> loadTx()
            Screen.Scan -> loadReceipts()
            else -> {}
        }
    }

    fun go(s: Screen) {
        screen = s
        launch {
            when (s) {
                Screen.List, Screen.Budget -> if (txs == null) loadTx()
                Screen.Scan -> loadReceipts()
                else -> summary = parseSummary(api.get("/summary"))
            }
        }
    }

    suspend fun loadTx() {
        val p = buildList {
            if (query.isNotBlank()) add("q=" + URLEncoder.encode(query, "UTF-8"))
            if (filter.isNotBlank()) add("type=$filter")
        }.joinToString("&")
        txs = parseTxList(api.get("/transactions?$p"))
    }

    fun search() = launch { loadTx() }

    suspend fun loadReceipts() {
        receipts = parseReceipts(api.get("/receipts?status=queue"))
        if (selectedReceipt == null || receipts!!.none { it.id == selectedReceipt }) selectedReceipt = receipts!!.firstOrNull { it.status == "needs_review" }?.id
        // Følg med mens AI-en leser.
        if (receipts!!.any { it.status == "pending" || it.status == "processing" }) {
            if (pollJob?.isActive != true) pollJob = viewModelScope.launch { delay(2000); pollJob = null; runCatching { loadReceipts() } }
        }
    }

    fun updateReceipt(id: String, field: String, value: Any?) = launch {
        val r = parseReceipt(JSONObject(api.patch("/receipts/$id", JSONObject().put(field, value ?: JSONObject.NULL))))
        receipts = receipts?.map { if (it.id == id) r else it }
    }

    fun book(id: String) = launch {
        api.post("/receipts/$id/book")
        message = "Bokført ✓"
        afterReceiptAction(id)
    }

    fun reject(id: String) = launch {
        api.post("/receipts/$id/reject")
        message = "Kvittering avvist"
        afterReceiptAction(id)
    }

    private suspend fun afterReceiptAction(id: String) {
        selectedReceipt = receipts?.firstOrNull { it.id != id && it.status == "needs_review" }?.id
        loadReceipts()
        boot = parseBoot(api.get("/bootstrap"))
        summary = parseSummary(api.get("/summary"))
    }

    fun setTxCategory(id: Int, categoryId: Int) = launch {
        api.patch("/transactions/$id", JSONObject().put("categoryId", categoryId))
        loadTx(); summary = parseSummary(api.get("/summary"))
        message = "Kategori endret"
    }

    fun saveSetting(key: String, value: Any) = launch {
        api.put("/settings", JSONObject().put(key, value))
        boot = parseBoot(api.get("/bootstrap"))
    }

    /** Leser bildet, roterer etter EXIF, lager 1600 px skanneversjon og miniatyr, og laster opp. */
    fun uploadUri(uri: Uri) = launch {
        busy = true
        try {
            val ctx = getApplication<Application>()
            val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val original = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
            val parts = mutableListOf(Api.Part("file", if (mime == "application/pdf") "kvittering.pdf" else "kvittering.jpg", mime, original))
            if (mime.startsWith("image/")) withContext(Dispatchers.Default) {
                scaled(ctx, original, 1600, 85)?.let { parts += Api.Part("scan", "scan.jpg", "image/jpeg", it) }
                scaled(ctx, original, 240, 75)?.let { parts += Api.Part("thumb", "thumb.jpg", "image/jpeg", it) }
            }
            val r = parseReceipt(JSONObject(api.upload("/receipts", parts)))
            selectedReceipt = r.id
            screen = Screen.Scan
            loadReceipts()
        } finally { busy = false }
    }

    suspend fun image(path: String): Bitmap? = runCatching {
        val b = api.bytes(path)
        withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(b, 0, b.size) }
    }.getOrNull()

    private fun scaled(ctx: Context, data: ByteArray, max: Int, quality: Int): ByteArray? = runCatching {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, opts)
        var sample = 1
        while (maxOf(opts.outWidth, opts.outHeight) / (sample * 2) >= max) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val rot = when (ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        val s = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
        val m = Matrix().apply { postScale(s, s); postRotate(rot) }
        val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        ByteArrayOutputStream().use { o -> out.compress(Bitmap.CompressFormat.JPEG, quality, o); o.toByteArray() }
    }.getOrNull()
}
