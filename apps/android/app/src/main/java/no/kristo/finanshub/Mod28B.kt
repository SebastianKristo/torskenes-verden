package no.kristo.finanshub

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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/*
 * Prompt 28 (ANDROID-B): Mer-rekkefølge per konto (/api/prefs/mer), abonnement fra skjermbilde med konkrete feilkoder
 * (JPEG ≤ 1600 px, «Les med Gemini» bare etter trykk, «Installer qwen2.5vl» med fremdrift) og «Legg til widget» på Hjem.
 * Tegnes i ui/Ui28B.kt.
 */

/** Mer: rekkefølge (o) og skjulte (h). Nøkler som ikke står i o legges sist i standardrekkefølge. */
data class MerPref28(val o: List<String> = emptyList(), val h: List<String> = emptyList())

/** Feil fra «Fra skjermbilde»: code = ollama_down | no_vision | timeout | not_found | bad_image | no_gemini | gemini_failed | null (annet). */
data class ShotErr28(val code: String?, val message: String, val canGemini: Boolean)

class B28State {
    /* Mer */
    var mer by mutableStateOf(MerPref28())
    var merEdit by mutableStateOf(false)
    internal var merFor: String? = null

    /* Abonnement: «Legg til abonnement»-arket og skjermbilde */
    /** «menu», «form» (Skriv inn selv) eller «tx» (Fra transaksjon). */
    var addStep by mutableStateOf("menu")
    var shotErr by mutableStateOf<ShotErr28?>(null)
    /** Når lesingen startet (ms), for «Laster bildemodellen …» etter 5 s. */
    var shotStart by mutableStateOf(0L)
    var shotEngine by mutableStateOf("ollama")
    internal var shotJpeg: ByteArray? = null
    /** Installering av qwen2.5vl: tekst og andel (0–1, null = ukjent). */
    var installing by mutableStateOf(false)
    var installText by mutableStateOf<String?>(null)
    var installPct by mutableStateOf<Float?>(null)

    /* Hjem: «Legg til widget» */
    var addWidgetFor by mutableStateOf<String?>(null)
    /** Kortene per side (nøkkel → navn), registrert når siden tegnes i redigeringsmodus. */
    internal val pageSecs = HashMap<String, List<Pair<String, String>>>()
}

/* ---------- Mer ---------- */

private fun merKey28(vm: AppViewModel) = "mer28_" + (vm.account?.id ?: "")

/** Gamle/alternative navn fra andre klienter. */
private fun merAlias28(k: String) = when (k) { "abonnementer", "subscriptions", "sub" -> "abo"; "innstillinger" -> "innst"; else -> k }

private fun parseMer28(raw: String): MerPref28? = runCatching {
    val o0 = JSONObject(raw)
    val o = o0.optJSONObject("mer") ?: o0.optJSONObject("merOrder") ?: o0
    if (!o.has("o") && !o.has("h")) return@runCatching null
    MerPref28(o.optJSONArray("o").strings().map(::merAlias28).filter { it.isNotBlank() }.distinct(), o.optJSONArray("h").strings().map(::merAlias28).filter { it.isNotBlank() && it != "innst" }.distinct())
}.getOrNull()

private fun MerPref28.json() = JSONObject().put("o", JSONArray(o)).put("h", JSONArray(h))

/** Lokal reserve først, så serveren (følger brukeren mellom enheter). */
fun AppViewModel.loadMer28() {
    val s = b28
    val key = merKey28(this)
    if (s.merFor == key) return
    s.merFor = key
    s.mer = parseMer28(prefs.str(key, "")) ?: MerPref28()
    launch28b {
        val raw = runCatching { api28b { hlGet("/prefs/mer") } }.getOrNull() ?: return@launch28b
        val srv = parseMer28(raw) ?: return@launch28b
        if (s.merFor != key) return@launch28b
        // Aldri lagret på serveren (updated = null), men lokalt: send det lokale opp i stedet for å tømme det.
        val never = runCatching { JSONObject(raw).isNull("updated") }.getOrDefault(false)
        if (never && srv.o.isEmpty() && srv.h.isEmpty() && (s.mer.o.isNotEmpty() || s.mer.h.isNotEmpty())) { saveMer28(s.mer); return@launch28b }
        s.mer = srv; prefs.set(key, srv.json().toString())
    }
}

fun AppViewModel.saveMer28(v: MerPref28) {
    val nv = v.copy(o = v.o.distinct(), h = v.h.filter { it != "innst" }.distinct())
    b28.mer = nv
    prefs.set(merKey28(this), nv.json().toString())
    launch28b { runCatching { api28b { hlPut("/prefs/mer", nv.json()) } } }
}

/** Radene sortert etter lagret rekkefølge; nye nøkler sist i standardrekkefølgen. */
fun <T> merSort28(pref: MerPref28, rows: List<T>, key: (T) -> String): List<T> {
    val idx = rows.mapIndexed { i, r -> key(r) to i }.toMap()
    return rows.sortedBy { r -> val i = pref.o.indexOf(key(r)); if (i < 0) 999 + (idx[key(r)] ?: 0) else i }
}

/* ---------- Abonnement fra skjermbilde ---------- */

/** JPEG ≤ max px på lengste side (HEIC via ImageDecoder), med EXIF-rotasjon. Aldri HEIC/PNG til serveren. */
internal fun jpeg28(data: ByteArray, max: Int = 1600, quality: Int = 85): ByteArray? = runCatching {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, o)
    var sample = 1
    while (o.outWidth > 0 && maxOf(o.outWidth, o.outHeight) / (sample * 2) >= max) sample *= 2
    val bmp: Bitmap = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: (if (Build.VERSION.SDK_INT >= 28) runCatching {
            android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(data))) { dec, info, _ ->
                val big = maxOf(info.size.width, info.size.height)
                if (big > max) { val k = max.toFloat() / big; dec.setTargetSize((info.size.width * k).toInt().coerceAtLeast(1), (info.size.height * k).toInt().coerceAtLeast(1)) }
                dec.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
            }
        }.getOrNull() else null) ?: return null
    val rot = runCatching {
        when (ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f; ExifInterface.ORIENTATION_ROTATE_180 -> 180f; ExifInterface.ORIENTATION_ROTATE_270 -> 270f; else -> 0f
        }
    }.getOrDefault(0f)
    val k = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
    val m = Matrix().apply { postScale(k, k); postRotate(rot) }
    val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    ByteArrayOutputStream().use { b -> out.compress(Bitmap.CompressFormat.JPEG, quality, b); b.toByteArray() }
}.getOrNull()

private fun thumb28(jpeg: ByteArray): Bitmap? = runCatching {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, o)
    var sample = 1
    while (maxOf(o.outWidth, o.outHeight) / (sample * 2) >= 400) sample *= 2
    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, BitmapFactory.Options().apply { inSampleSize = sample })
}.getOrNull()

/** Velg skjermbilde → JPEG ≤ 1600 px → Ollama (bildemodell) på serveren. Feil gir et kort med konkrete knapper. */
fun AppViewModel.subFromShot28(ctx: Context, uri: Uri) {
    val s = b27
    val t = b28
    subAdding = false
    s.shotOpen = true; s.shot = null; s.shotError = null; s.shotThumb = null
    t.shotErr = null; t.shotJpeg = null
    s.shotName = runCatching { ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull() ?: "Skjermbilde"
    s.shotBusy = true
    launch28b {
        val raw = runCatching { withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } }.getOrNull()
        val jpeg = raw?.let { withContext(Dispatchers.Default) { jpeg28(it) } }
        if (jpeg == null) {
            s.shotBusy = false
            t.shotErr = ShotErr28("bad_image", "Bildet kunne ikke leses. Prøv et skjermbilde som JPEG eller PNG.", false)
            return@launch28b
        }
        t.shotJpeg = jpeg
        s.shotThumb = withContext(Dispatchers.Default) { thumb28(jpeg) }
        readShot28("ollama")
    }
}

/** Les bildet på nytt (Prøv igjen) eller med Gemini (bare når brukeren trykker «Les med Gemini»). */
fun AppViewModel.retryShot28(engine: String = "ollama") {
    if (b28.shotJpeg == null) { b28.shotErr = ShotErr28(null, "Velg skjermbildet på nytt.", false); return }
    launch28b { readShot28(engine) }
}

private suspend fun AppViewModel.readShot28(engine: String) {
    val s = b27
    val t = b28
    val jpeg = t.shotJpeg ?: return
    s.shotBusy = true; s.shot = null; s.shotError = null; t.shotErr = null
    t.shotEngine = engine
    t.shotStart = System.currentTimeMillis()
    try {
        val path = "/subscriptions/from-screenshot" + if (engine == "gemini") "?engine=gemini" else ""
        // Første kall laster bildemodellen (30–60 s); serveren gir opp etter 120 s.
        val body = api28b { upload(path, listOf(Api.Part("image", "skjermbilde.jpg", "image/jpeg", jpeg)), read = 135_000) }
        val o = runCatching { JSONObject(body) }.getOrNull()
        if (o == null || (o.optStr("code") != null && o.optStr("error") != null)) {
            t.shotErr = ShotErr28(o?.optStr("code") ?: "not_found", o?.optStr("error") ?: "Fant ikke et abonnement i bildet.", o?.optBoolean("canGemini") == true)
            return
        }
        val r = parseShot27(body)
        if (r.service.isBlank() || r.price <= 0.0) { t.shotErr = ShotErr28("not_found", "Fant ikke et abonnement i bildet.", o.optBoolean("canGemini")); return }
        val have = r.existingId ?: subsX?.items?.firstOrNull { it.name.equals(r.service, ignoreCase = true) }?.id
        s.shot = r.copy(existingId = have)
    } catch (e: ApiException) {
        t.shotErr = when {
            e.code != null -> ShotErr28(e.code, e.message ?: "", e.canGemini)
            e.status == 404 -> ShotErr28(null, "Fra skjermbilde trenger en nyere Homelab-server.", false)
            e.status == 501 -> ShotErr28("no_vision", "Ingen bildemodell installert.", false)
            e.message == "Serveren svarte ikke i tide." -> ShotErr28("timeout", "Bildemodellen brukte for lang tid.", false)
            else -> ShotErr28(null, e.message ?: "Noe gikk galt", false)
        }
    } finally { s.shotBusy = false }
}

fun AppViewModel.closeShot28() {
    b27.shotOpen = false; b27.shot = null; b27.shotThumb = null; b27.shotBusy = false
    b28.shotErr = null; b28.shotJpeg = null
}

/** «Skriv inn selv» fra feilkortet: lukk kortet og åpne arket på skjemaet. */
fun AppViewModel.shotManual28() {
    closeShot28()
    b28.addStep = "form"
    subAdding = true
}

/** POST /finans/api/ai/vision/install (SSE): ollama pull qwen2.5vl:7b med fremdrift, så leses bildet på nytt. */
fun AppViewModel.installVision28() {
    val t = b28
    if (t.installing) return
    t.installing = true; t.installText = "Starter nedlastingen …"; t.installPct = null
    val url = base.trimEnd('/') + Api.FINANS + "/ai/vision/install"
    val token = account?.token
    launch28b {
        var ok = false
        var err: String? = null
        try {
            withContext(Dispatchers.IO) {
                val conn = URL(url).openConnection() as HttpURLConnection
                try {
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 10_000
                    conn.readTimeout = 180_000
                    conn.doOutput = true
                    conn.setRequestProperty("Accept", "text/event-stream")
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                    conn.outputStream.use { it.write("{}".toByteArray()) }
                    val code = conn.responseCode
                    if (code >= 400) {
                        val b = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                        err = runCatching { JSONObject(b).optStr("error") }.getOrNull() ?: "Feil $code"
                        return@withContext
                    }
                    val rd = conn.inputStream.bufferedReader()
                    var event = "message"
                    while (true) {
                        val line = rd.readLine() ?: break
                        when {
                            line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                            line.startsWith("data:") -> {
                                val o = runCatching { JSONObject(line.removePrefix("data:").trim()) }.getOrNull() ?: continue
                                if (event == "done") {
                                    ok = o.optBoolean("ok"); err = o.optStr("error")
                                } else {
                                    val pct = if (o.has("pct") && !o.isNull("pct")) (o.optDouble("pct") / 100.0).toFloat()
                                        else o.optLong("total").takeIf { it > 0 }?.let { tot -> (o.optLong("completed").toDouble() / tot).toFloat() }
                                    val st = o.optStr("status") ?: "Laster ned"
                                    withContext(Dispatchers.Main) {
                                        t.installPct = pct?.coerceIn(0f, 1f)
                                        t.installText = "qwen2.5vl: $st" + (pct?.let { " · ${Math.round(it * 100)} %" } ?: "")
                                    }
                                    o.optStr("error")?.let { err = it }
                                    if (o.optBoolean("done") && o.optStr("error") == null) ok = true
                                }
                            }
                            line.isEmpty() -> event = "message"
                        }
                    }
                } finally { conn.disconnect() }
            }
        } catch (e: Exception) { err = e.message ?: "Nettverksfeil" }
        t.installing = false
        if (ok && err == null) {
            t.installText = null; t.installPct = null
            Haptics.success()
            retryShot28("ollama")
        } else {
            t.installText = "Installeringen feilet: " + (err ?: "ukjent feil")
            Haptics.error()
        }
    }
}

/* ---------- «Skriv inn selv» i arket ---------- */

/** Uke regnes om til månedspris (52/12), siden abonnementene har månedlig eller årlig syklus (som serveren). */
fun AppViewModel.addManualSub28(name: String, amount: Double, day: Int?, cycle: String) {
    val d = day?.coerceIn(1, 31)
    val today = java.time.LocalDate.now()
    val month = if (cycle == "år") (if (d == null || d >= today.dayOfMonth) today.monthValue else today.plusMonths(1).monthValue) else null
    val price = if (cycle == "uke") Math.round(amount * 52.0 / 12.0 * 100.0) / 100.0 else amount
    val plan = if (cycle == "uke") "Ukepris " + String.format(java.util.Locale("nb", "NO"), "%.2f", amount).replace('.', ',') + " kr" else ""
    saveSub(null, name, plan, price, if (cycle == "år") "yearly" else "monthly", d, month, "Annet", "active")
    b28.addStep = "menu"
    subAdding = false
}
