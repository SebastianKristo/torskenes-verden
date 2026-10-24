package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/*
 * Prompt 50 (MEDAND50, claude-code-chat-slipp-filer-og-miniatyr.md; API i SERVER50-API.md «SRVCHAT50», fasit public/js/chat50.js):
 *  - Alle vedlegg (bilder fra velgeren/kamera, filer, innliming, deling, dra og slipp) lastes opp med en gang til POST /api/chat/files
 *    med fremdrift. Meldingen bærer bare id-ene (`attachments` for bilder, `files` for andre filer) – aldri base64.
 *    Eldre server uten /files for bilder (404): reserve med base64 som før.
 *  - Maks 10 filer, maks 20 MB («Filen er for stor (maks 20 MB)»), kjente typer (bilder, PDF, tekst, Office).
 *  - Miniatyren (480 px WebP fra serveren) vises i boblen; den lokale forhåndsvisningen legges i Img50-minnet under miniatyr-URL-en,
 *    så boblen ikke blinker. Originalen hentes først i lysboksen.
 *  - «Lest med …» (meta/done.readWith.label) og «Legg i Finans ›» (meta.receipt.action → POST /api/chat/files/:id/finans).
 * Grensesnittet ligger i ui/Chat50Ui.kt.
 */

/** Et lagret vedlegg i en melding (attachments fra serveren). */
data class ChatFile50(val id: String, val name: String, val mime: String, val kind: String, val url: String?, val thumb: String?, val w: Int?, val h: Int?) {
    val isImage: Boolean get() = kind == "image" || mime.startsWith("image/")
}

object Chat50 {
    const val MAX_BYTES = 20L * 1024 * 1024
    const val MAX_FILES = 10
    /** Lokale forhåndsvisninger (nøkkel = ChatAtt27.key) mens filen lastes opp. */
    val previews = mutableStateMapOf<String, Bitmap>()
    /** Fremdrift 0–1 per opplasting. */
    val pct = mutableStateMapOf<String, Float>()
    /** Lysboksen: bildene og hvilket som vises. */
    var lightbox by mutableStateOf<Pair<List<ChatFile50>, Int>?>(null)
    /** «Legg i Finans»: nøkkel → busy | ok. */
    val fin = mutableStateMapOf<String, String>()
    /** «Lest med …» mens svaret strømmer. */
    var busyReadWith by mutableStateOf<String?>(null)
    /** Dra og slipp: laget vises. */
    var dragging by mutableStateOf(false)
}

private val OK_TYPE50 = Regex("^(image/|application/pdf$|text/|application/(json|xml|csv|x-yaml|yaml|javascript|x-sh|msword|vnd\\.openxmlformats-officedocument\\.|vnd\\.oasis\\.opendocument\\.))")
private val OK_EXT50 = Regex("\\.(pdf|txt|md|csv|json|ya?ml|log|ini|conf|sh|js|py|docx?|odt|xlsx?|pptx?|heic|heif|jpe?g|png|webp|gif)$", RegexOption.IGNORE_CASE)

fun parseChatFiles50(a: JSONArray?): List<ChatFile50> = (0 until (a?.length() ?: 0)).mapNotNull { i ->
    val o = a!!.optJSONObject(i) ?: return@mapNotNull null
    val id = o.optStr("id") ?: return@mapNotNull null
    ChatFile50(id, o.optStr("name") ?: "Bilde", o.optStr("mime") ?: "", o.optStr("kind") ?: "file", o.optStr("url") ?: "/api/chat/files/$id", o.optStr("thumb"),
        o.optInt("w", 0).takeIf { it > 0 }, o.optInt("h", 0).takeIf { it > 0 })
}

private fun nameSize50(ctx: Context, uri: Uri): Pair<String?, Long?> = runCatching {
    ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) to (if (c.isNull(1)) null else c.getLong(1)) else null
    }
}.getOrNull() ?: (null to null)

private fun preview50(bytes: ByteArray, max: Int = 360): Bitmap? = runCatching {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
    var s = 1
    while (maxOf(o.outWidth, o.outHeight) / (s * 2) >= max) s *= 2
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = s })
}.getOrNull()

private fun jpeg50(bmp: Bitmap, max: Int = 1600): ByteArray {
    val k = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
    val b = if (k < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt().coerceAtLeast(1), (bmp.height * k).toInt().coerceAtLeast(1), true) else bmp
    val out = ByteArrayOutputStream()
    b.compress(Bitmap.CompressFormat.JPEG, 85, out)
    return out.toByteArray()
}

/** Multipart-opplasting med fremdrift (0–1) til /api/chat/files. */
private suspend fun AppViewModel.upload50(name: String, mime: String, bytes: ByteArray, onPct: (Float) -> Unit): JSONObject = withContext(Dispatchers.IO) {
    val boundary = "----Chat50" + UUID.randomUUID().toString().replace("-", "")
    val safe = name.replace("\"", "").replace("\r", "").replace("\n", "")
    val head = "--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$safe\"\r\nContent-Type: $mime\r\n\r\n".toByteArray()
    val tail = "\r\n--$boundary--\r\n".toByteArray()
    val c = URL(base.trimEnd('/') + Api.HOMELAB + "/chat/files").openConnection() as HttpURLConnection
    try {
        c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 15_000; c.readTimeout = 120_000
        c.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        c.setRequestProperty("Accept", "application/json")
        account?.token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
        val total = head.size + bytes.size + tail.size
        c.setFixedLengthStreamingMode(total)
        c.outputStream.use { out ->
            out.write(head)
            var off = 0
            while (off < bytes.size) {
                val n = minOf(64 * 1024, bytes.size - off)
                out.write(bytes, off, n); off += n
                onPct((head.size + off).toFloat() / total * .97f)
            }
            out.write(tail)
        }
        val code = c.responseCode
        val body = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        val o = runCatching { JSONObject(body) }.getOrNull()
        if (code >= 400) throw ApiException(o?.optStr("error") ?: "Feil $code", code, code = o?.optStr("code") ?: o?.optStr("kode"))
        onPct(1f)
        o ?: throw ApiException("Uventet svar fra serveren", 502)
    } catch (e: java.io.IOException) { throw ApiException(e.message ?: "Nettverksfeil") } finally { c.disconnect() }
}

private fun isImg50(mime: String, name: String) = mime.startsWith("image/") || Regex("\\.(heic|heif|jpe?g|png|webp|gif)$", RegexOption.IGNORE_CASE).containsMatchIn(name)

/** Felles vei inn for vedlegg: velger, filer, deling, innliming og dra-og-slipp. */
fun AppViewModel.addChat50(uris: List<Uri>) {
    val ctx = getApplication<android.app.Application>()
    val s = chat27
    s.sheet = null
    launch27 {
        for (u in uris) {
            if (s.att.size >= Chat50.MAX_FILES) { chatToast27("Maks ${Chat50.MAX_FILES} filer per melding"); break }
            val (n0, size) = nameSize50(ctx, u)
            val mime = ctx.contentResolver.getType(u) ?: "application/octet-stream"
            val name = n0 ?: if (mime.startsWith("image/")) "bilde.${mime.substringAfter('/').replace("jpeg", "jpg")}" else "fil"
            if ((size ?: 0L) > Chat50.MAX_BYTES) { chatToast27("Filen er for stor (maks 20 MB)"); continue }
            if (!OK_TYPE50.containsMatchIn(mime) && !OK_EXT50.containsMatchIn(name)) { chatToast27("Filtypen støttes ikke ($name)"); continue }
            val bytes = withContext(Dispatchers.IO) { runCatching { ctx.contentResolver.openInputStream(u)?.use { it.readBytes() } }.getOrNull() }
            if (bytes == null) { chatToast27("Fikk ikke lest $name"); continue }
            if (bytes.size > Chat50.MAX_BYTES) { chatToast27("Filen er for stor (maks 20 MB)"); continue }
            uploadOne50(name, mime, bytes, null)
        }
    }
}

/** Kamera (TakePicturePreview gir en Bitmap): JPEG og samme opplasting. */
fun AppViewModel.addChatBitmap50(bmp: Bitmap, name: String = "Kamera.jpg") {
    launch27 {
        val bytes = withContext(Dispatchers.Default) { jpeg50(bmp) }
        uploadOne50(name, "image/jpeg", bytes, bmp)
    }
}

private suspend fun AppViewModel.uploadOne50(name: String, mime: String, bytes: ByteArray, bmp0: Bitmap?) {
    val s = chat27
    val key = UUID.randomUUID().toString()
    val img = isImg50(mime, name)
    val prev = if (img) bmp0 ?: withContext(Dispatchers.Default) { preview50(bytes) } else null
    prev?.let { Chat50.previews[key] = it }
    Chat50.pct[key] = .02f
    s.att = s.att + ChatAtt27(name, if (img) "img" else "file", key = key, up = true, mime = mime)
    fun upd(f: (ChatAtt27) -> ChatAtt27) { s.att = s.att.map { if (it.key == key) f(it) else it } }
    try {
        val r = upload50(name, mime, bytes) { p -> Chat50.pct[key] = p }
        val kind = r.optStr("kind") ?: if (img) "image" else "file"
        val thumb = r.optStr("thumb")
        if (thumb != null && prev != null) Img50.put(base, thumb, prev)
        upd { it.copy(name = r.optStr("name") ?: name, kind = if (kind == "image") "img" else "file", id = r.optStr("id"), up = false, thumb = thumb, url = r.optStr("url"), mime = r.optStr("mime") ?: mime) }
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (img && e.status == 404) {
            // Eldre server uten vedleggslagring: bildet sendes som base64 med meldingen (som før).
            val b64 = withContext(Dispatchers.Default) { (prev ?: preview50(bytes, 1600))?.let { Base64.encodeToString(jpeg50(it), Base64.NO_WRAP) } }
            if (b64 != null) upd { it.copy(up = false, b64 = b64) } else { s.att = s.att.filter { it.key != key }; chatToast27("Fikk ikke lest $name") }
        } else {
            s.att = s.att.filter { it.key != key }
            chatToast27(if (e.status == 413) "Filen er for stor (maks 20 MB)" else "Fikk ikke lastet opp $name: ${e.message}")
        }
    } finally { Chat50.pct.remove(key) }
}

/** Skal sendes: noe lastes fortsatt opp. */
val Chat27State.uploading50: Boolean get() = att.any { it.up }

/** «Legg i Finans ›» under kvitteringstabellen. */
fun AppViewModel.finans50(key: String, url: String) {
    if (Chat50.fin[key] != null) return
    Chat50.fin[key] = "busy"
    launch27 {
        try {
            api27 { hlPost(url.removePrefix("/api"), JSONObject()) }
            Chat50.fin[key] = "ok"
            Haptics.success()
            chatToast27("Lagt i Finans – sjekk kvitteringen der")
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            Chat50.fin.remove(key)
            chatToast27(if (e.code == "bilde_mangler" || e.status == 404) "Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt." else e.message ?: "Fikk ikke lagt kvitteringen i Finans")
        }
    }
}

/** «Del» i lysboksen: originalen (fra cache når mulig) via FileProvider. */
fun AppViewModel.shareChatFile50(f: ChatFile50) {
    val ctx = getApplication<android.app.Application>()
    launch27 {
        val b = Img50.bytes(ctx, base, account?.token, f.url ?: f.thumb ?: return@launch27) ?: run { chatToast27("Fikk ikke hentet bildet"); return@launch27 }
        val dir = File(ctx.cacheDir, "scans").apply { mkdirs() }
        val clean = f.name.replace(Regex("[^A-Za-z0-9æøåÆØÅ._ -]"), "_").ifBlank { "bilde.jpg" }
        val file = File(dir, "chat50_$clean")
        withContext(Dispatchers.IO) { file.writeBytes(b) }
        val uri = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND).setType(f.mime.ifBlank { "image/*" }).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { ctx.startActivity(Intent.createChooser(send, "Del bildet").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}
