package no.kristo.finanshub

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/*
 * Prompt 39 (ANDROID39) – design_handoff_homelab/prompts/prompt-39-pakke/:
 *  - Myk varsellyd (Sound39.kt): «Dråpe (myk)» som standard og volum 50 %. Serveren (før SERVER39) kjenner ikke «draape»
 *    og har «klokke»/70 som standard: valget lagres da lokalt, og standardverdiene byttes til de myke til brukeren selv velger.
 *  - Profilbildet: /api/me → avatarUrl eller avatar:{url, url192, hash} (relativ eller signert https-URL). Lastes med
 *    Bearer-token bare mot egen server, Accept webp/jpeg, HEIC/AVIF via ImageDecoder, URL + HTTP-status i logcat
 *    («Avatar39»), lagres på disk (vises med en gang ved oppstart og i fly-modus) og hentes på nytt når hashen endres
 *    (tilbake i appen og «me»/«avatar» i sanntid). Ingen bilde → initialer på #2B5D8A (ui/App.kt).
 *  - Chat: modellen fra rutingen (/api/ai/routing → chat) vises med en gang, «· laster …» mens listen hentes, rød prikk ved feil.
 *  - Glimt-varsel: «Vis svaret i appen også» (n_ai_in, standard på) under «AI-svar i bakgrunnen».
 */

class P39State {
    var aiIn by mutableStateOf(true)
    internal var aiInFor: String? = null
    /** Sist viste profilbilde-URL (med ?v=/hash), så et nytt bilde fra web hentes uten å logge ut. */
    internal var avatarUrl: String? = null
    internal var meAt = 0L
    /** Chat: standardmodellen fra rutingen (id, sky) – vises før modellisten er hentet. */
    var chatRoute by mutableStateOf<Pair<String, Boolean>?>(null)
    internal var chatRouteAt = 0L
    /** Kvitteringer: «✦ På nytt» med fremdrift, per kvittering-id. */
    var re by mutableStateOf<Map<String, Re39>>(emptyMap())
    /** Kvitteringer som nettopp ble lest på nytt og fikk endrede felt (gul markering i 2 s). */
    var reFlash by mutableStateOf<Map<String, Long>>(emptyMap())
    /** AI-kontroll: «✦ Glimt anbefaler» (GET /api/ai/recommend?full=1). */
    var rec by mutableStateOf<Rec39?>(null)
    var recMissing by mutableStateOf(false)
    internal var recAt = 0L
    var recAsk by mutableStateOf("")
    var recAnswer by mutableStateOf<RecAnswer39?>(null)
    var recBusy by mutableStateOf(false)
    var recUndo by mutableStateOf<String?>(null)
}

/* ======================= Varsellyd ======================= */

private fun AppViewModel.nsp39() = appCtx39.getSharedPreferences("notify_prefs", android.content.Context.MODE_PRIVATE)

/**
 * Serverens svar → det appen bruker: egen lokal lyd (når serveren ikke godtok «draape»), og de myke standardverdiene
 * så lenge brukeren ikke har valgt lyd/volum selv på denne telefonen.
 */
internal fun AppViewModel.fixNotify39(n: NotifyPrefs): NotifyPrefs {
    val sp = nsp39()
    var x = n
    sp.getString("snd39_local", null)?.takeIf { k -> NOTIFY_SOUNDS.any { it.first == k } }?.let { x = x.copy(sound = it) }
    if (!sp.getBoolean("snd39_picked", false) && x.sound == "klokke") x = x.copy(sound = Sound39.DEFAULT)
    if (!sp.getBoolean("vol39_picked", false) && (x.volume == 70 || x.volume == 80)) x = x.copy(volume = Sound39.DEFAULT_VOLUME)
    return x
}

/** Lagrer valget på serveren. Godtas ikke lyden (eldre server uten «draape»), sendes resten og lyden huskes lokalt. */
internal fun AppViewModel.putNotify39(old: NotifyPrefs, n: NotifyPrefs) {
    val sp = nsp39()
    val e = sp.edit()
    if (old.sound != n.sound) e.putBoolean("snd39_picked", true)
    if (old.volume != n.volume) e.putBoolean("vol39_picked", true)
    e.apply()
    launch39 {
        val ok = runCatching { api39 { hlPut("/me/notify", n.toJson()) } }.isSuccess
        if (ok) { sp.edit().remove("snd39_local").apply(); return@launch39 }
        val j = n.toJson().apply { remove("sound") }
        if (runCatching { api39 { hlPut("/me/notify", j) } }.isSuccess) sp.edit().putString("snd39_local", n.sound).apply()
    }
}

/* ======================= Profilbilde ======================= */

private const val AV_TAG = "Avatar39"

private fun AppViewModel.avatarFile39(): File? {
    val id = account?.id ?: return null
    return File(File(appCtx39.filesDir, "avatar39").apply { mkdirs() }, id.replace(Regex("[^\\w-]"), "_") + ".img")
}

private fun decode39(b: ByteArray): Bitmap? {
    BitmapFactory.decodeByteArray(b, 0, b.size)?.let { return it }
    // HEIC/AVIF (fra iPhone) som BitmapFactory ikke klarer på eldre Android.
    if (Build.VERSION.SDK_INT >= 28) runCatching {
        return android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(b))) { dec, info, _ ->
            val big = maxOf(info.size.width, info.size.height)
            if (big > 512) { val k = 512f / big; dec.setTargetSize((info.size.width * k).toInt().coerceAtLeast(1), (info.size.height * k).toInt().coerceAtLeast(1)) }
            dec.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
        }
    }
    return null
}

/** Henter bildet: relativ sti mot serveren med Bearer, absolutt URL med token bare når verten er vår egen (signert URL ellers). */
private suspend fun AppViewModel.fetch39(url: String): Pair<Int, ByteArray?> = withContext(Dispatchers.IO) {
    val root = base39.trimEnd('/')
    val abs = url.startsWith("http://") || url.startsWith("https://")
    val full = if (abs) url else root + (if (url.startsWith("/")) url else "/$url")
    val own = !abs || runCatching { URL(full).host.equals(URL(root).host, ignoreCase = true) }.getOrDefault(false)
    var code = -1
    try {
        val c = URL(full).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000; c.readTimeout = 15_000
            c.useCaches = false
            c.instanceFollowRedirects = true
            c.setRequestProperty("Accept", "image/webp,image/jpeg;q=0.9,image/png;q=0.8,*/*;q=0.5")
            if (own) token39?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            code = c.responseCode
            Log.i(AV_TAG, "GET $full → $code ${c.contentType ?: ""}")
            if (code in 200..299) code to c.inputStream.use { it.readBytes() } else code to null
        } finally { c.disconnect() }
    } catch (e: Exception) {
        Log.w(AV_TAG, "GET $full feilet: ${e.message}")
        code to null
    }
}

/** Sist lagrede bilde fra disk (oppstart, fly-modus, feil på nettet). */
internal suspend fun AppViewModel.avatarFromDisk39(): Boolean {
    val f = avatarFile39() ?: return false
    if (!f.exists()) return false
    val b = withContext(Dispatchers.IO) { runCatching { f.readBytes() }.getOrNull() } ?: return false
    val bmp = withContext(Dispatchers.Default) { decode39(b) } ?: return false
    setAvatar39(bmp)
    return true
}

/**
 * Erstatter loadAvatar: url null betyr «ingen bilde» bare når /me faktisk svarte (ellers beholdes det lagrede).
 * Samme URL som sist (og bildet vises) hentes ikke på nytt.
 */
internal suspend fun AppViewModel.avatar39(url: String?, url192: String? = null) {
    val s = p39
    if (url.isNullOrBlank()) {
        if (me != null) {
            s.avatarUrl = null
            setAvatar39(null)
            avatarFile39()?.let { f -> withContext(Dispatchers.IO) { runCatching { f.delete() } } }
        } else if (avatar == null) avatarFromDisk39()
        return
    }
    if (avKey39(url) == s.avatarUrl && avatar != null) return
    if (avatar == null) avatarFromDisk39()
    var bmp: Bitmap? = null
    var bytes: ByteArray? = null
    for (u in listOfNotNull(url, url192?.takeIf { it != url })) {
        val (_, b) = fetch39(u)
        val d = b?.let { withContext(Dispatchers.Default) { decode39(it) } }
        if (d != null) { bmp = d; bytes = b; break }
        if (b != null) Log.w(AV_TAG, "Kunne ikke lese bildet fra $u (${b.size} byte)")
    }
    if (bmp == null) return // beholder det som vises (disk eller forrige), ellers initialer
    s.avatarUrl = avKey39(url)
    setAvatar39(bmp)
    val f = avatarFile39()
    if (f != null && bytes != null) withContext(Dispatchers.IO) { runCatching { f.writeBytes(bytes) } }
}

/** Versjonen av bildet (?v=<hash> eller hash=), så /api/me/avatar og /api/users/<id>/avatar med samme versjon er samme bilde. */
private fun avKey39(url: String): String = Regex("[?&](?:v|hash)=([^&]+)").find(url)?.groupValues?.get(1) ?: url

/** avatarUrl eller avatar:{url, url192, hash} fra /api/me. */
internal fun avatarOf39(raw: String): Pair<String?, String?>? = runCatching {
    val o0 = JSONObject(raw)
    val o = o0.optJSONObject("user") ?: o0
    val a = o.optJSONObject("avatar")
    val url = a?.optStr("url") ?: o.optStr("avatarUrl") ?: (if (o.has("avatar") && !o.isNull("avatar") && a == null) o.optStr("avatar") else null)
    url to a?.optStr("url192")
}.getOrNull()

/** Tilbake i appen / «me» i sanntid: nytt bilde fra web vises uten å logge ut (høyst hvert 5. sekund). */
fun AppViewModel.refreshMe39(force: Boolean = false) {
    if (!loggedIn) return
    val s = p39
    val now = System.currentTimeMillis()
    if (!force && now - s.meAt < 5_000L) return
    s.meAt = now
    launch39 {
        val raw = runCatching { api39 { hlGet("/me", timeout = 6_000) } }.getOrNull()
        if (raw == null) { if (avatar == null) avatarFromDisk39(); return@launch39 }
        val (u, u192) = avatarOf39(raw) ?: return@launch39
        if (u == null || avKey39(u) != s.avatarUrl || avatar == null) avatar39(u, u192)
    }
}

/* ======================= Glimt-varsel: vis svaret i appen også ======================= */

private fun AppViewModel.aiInKey39() = "n_ai_in39_" + (account?.id ?: "")

fun AppViewModel.loadAiIn39() {
    val s = p39
    val key = aiInKey39()
    if (s.aiInFor == key) return
    s.aiInFor = key
    s.aiIn = prefs.bool(key, true)
    launch39 {
        val raw = runCatching { api39 { hlGet("/me/notify") } }.getOrNull() ?: return@launch39
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch39
        val x = o.optJSONObject("prefs") ?: o
        if (x.has("n_ai_in")) { s.aiIn = x.optBoolean("n_ai_in", true); prefs.set(key, s.aiIn) }
    }
}

fun AppViewModel.setAiIn39(on: Boolean) {
    p39.aiIn = on
    prefs.set(aiInKey39(), on)
    Haptics.select()
    launch39 { runCatching { api39 { hlPut("/me/notify", notifyPrefs.toJson().put("ai_bg_notify", p31.aiBg).put("n_ai_in", on)) } } }
}

/* ======================= Chat: valgt modell ======================= */

private const val CHAT_ROUTE_KEY = "chat39_route"

/** Standardmodellen for Chat fra rutingen (lagret lokalt, så navnet vises med en gang neste gang). */
fun AppViewModel.loadChatRoute39() {
    val s = p39
    if (s.chatRoute == null) prefs.str(CHAT_ROUTE_KEY, "").split('|').takeIf { it.size == 2 && it[0].isNotBlank() }?.let { s.chatRoute = it[0] to (it[1] == "sky") }
    val now = System.currentTimeMillis()
    if (now - s.chatRouteAt < 60_000L) return
    s.chatRouteAt = now
    launch39 {
        val raw = runCatching { api39 { hlGet("/ai/routing", timeout = 8_000) } }.getOrNull() ?: return@launch39
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch39
        val arr = o.optJSONArray("tasks") ?: return@launch39
        for (i in 0 until arr.length()) {
            val t = arr.optJSONObject(i) ?: continue
            if (t.optString("id") != "chat") continue
            val id = t.optStr("model") ?: t.optStr("resolved") ?: return@launch39
            val sky = (t.optStr("provider") ?: "ollama").let { it != "ollama" && it != "lokal" } || id.startsWith("gemini") || id.startsWith("groq")
            s.chatRoute = id to sky
            prefs.set(CHAT_ROUTE_KEY, "$id|${if (sky) "sky" else "lokal"}")
            return@launch39
        }
    }
}

/** Det Chat-toppen viser: navn, sky, og status (ok | laster | feil). Aldri tomt. */
data class ChatModelShow39(val label: String, val sky: Boolean, val state: String)

fun AppViewModel.chatModelShow39(): ChatModelShow39? {
    val s = chat27
    val loading = s.models.isEmpty() && !s.unavailable && s.error == null
    val err = s.error != null && s.models.isEmpty()
    val st = when { err -> "feil"; loading -> "laster"; else -> "ok" }
    if (s.models.isNotEmpty()) s.curModel27()?.let { m -> return ChatModelShow39(m.label, m.sky, "ok") }
    // Listen er ikke hentet ennå (treg første kall / Ollama laster): valgt modell, ellers standarden fra rutingen.
    val id = s.model ?: s.defModel ?: p39.chatRoute?.first ?: return null
    val sky = if (id == p39.chatRoute?.first) p39.chatRoute?.second ?: skyId39(id) else skyId39(id)
    return ChatModelShow39(if (sky) id.substringAfter(':') else id, sky, st)
}

private fun skyId39(id: String) = listOf("gemini", "groq", "openai", "anthropic", "claude", "mistral").any { id.startsWith("$it:") || id.startsWith("$it-") }

/* ======================= 120 Hz ======================= */

/** Sveip og animasjoner: be om høyeste oppdateringsfrekvens med samme oppløsning (90/120 Hz der skjermen har det). */
fun android.app.Activity.preferHighRefresh39() {
    runCatching {
        @Suppress("DEPRECATION")
        val d = (if (Build.VERSION.SDK_INT >= 30) display else windowManager.defaultDisplay) ?: return
        val cur = d.mode
        val best = d.supportedModes.filter { it.physicalWidth == cur.physicalWidth && it.physicalHeight == cur.physicalHeight }.maxByOrNull { it.refreshRate } ?: return
        if (best.modeId != cur.modeId) window.attributes = window.attributes.apply { preferredDisplayModeId = best.modeId }
    }
}

/* ======================= Kvitteringer: «✦ På nytt» med fremdrift ======================= */

/** Jobben for én kvittering: steg (upload | ocr | llm | verify | done | error), prosent og tekst. */
data class Re39(
    val jobId: String?, val step: String, val pct: Int, val msg: String?, val engine: String,
    val error: Boolean = false, val done: Boolean = false, val cancelled: Boolean = false,
) {
    val running: Boolean get() = !error && !done
}

/** Stegene i panelet (claude-code-kvittering-pa-nytt-fremdrift.md). */
val RE_STEPS39 = listOf("upload" to "Laster opp bildet", "ocr" to "Leser teksten (OCR)", "llm" to "✦ {motor} tolker butikk, linjer og beløp", "verify" to "Sjekker sum og dato")

private fun AppViewModel.setRe39(id: String, f: (Re39?) -> Re39?) {
    val n = f(p39.re[id])
    p39.re = if (n == null) p39.re - id else p39.re + (id to n)
}

/**
 * POST /finans/api/receipts/:id/reanalyze {engine, async:true} → {jobId}; fremdriften kommer som «job» i sanntid og fra
 * GET /finans/api/jobs/:id (hvert sekund). Eldre server: svarer synkront ({candidateId, result}) – da tas resultatet i bruk
 * direkte. Mangler endepunktet (404): kvitteringen legges i køen som før (reprocess).
 */
fun AppViewModel.reanalyze39(id: String, engine: String = "gemini") {
    if (p39.re[id]?.running == true) return
    val label = if (engine == "tesseract") "Lokal OCR" else "Gemini"
    Haptics.tap()
    setRe39(id) { Re39(null, "upload", 2, "Laster opp bildet", label) }
    launch39 {
        val raw = try {
            api39 { request("POST", "/receipts/$id/reanalyze", JSONObject().put("engine", engine).put("async", true), read = 120_000) }
        } catch (e: ApiException) {
            if (e.status == 404) {
                setRe39(id) { null }
                runCatching { api39 { post("/receipts/$id/reprocess?provider=gemini") } }
                message = "✦ Leses på nytt med Gemini"
                runCatching { loadReceipts(); loadJobs() }
            } else setRe39(id) { (it ?: Re39(null, "upload", 0, null, label)).copy(step = "error", error = true, msg = e.message ?: "✕ $label svarte ikke") }
            return@launch39
        }
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
        // Synkront svar (server uten async): ta i bruk det nye resultatet.
        o.optStr("candidateId")?.let { cand ->
            runCatching { api39 { post("/receipts/$id/reanalyze/apply", JSONObject().put("candidateId", cand).put("keep", "new")) } }
            val conf = o.optJSONObject("result")?.optDouble("confidence", Double.NaN) ?: Double.NaN
            finishRe39(id, conf, emptyList())
            return@launch39
        }
        val job = o.optStr("jobId") ?: run { setRe39(id) { it?.copy(step = "error", error = true, msg = "✕ $label svarte ikke") }; return@launch39 }
        setRe39(id) { (it ?: Re39(job, "upload", 5, null, label)).copy(jobId = job, pct = maxOf(it?.pct ?: 0, 5)) }
        var misses = 0
        while (true) {
            kotlinx.coroutines.delay(1000)
            val cur = p39.re[id] ?: return@launch39
            if (cur.jobId != job || !cur.running) return@launch39
            val j = runCatching { JSONObject(api39 { get("/jobs/$job") }) }.getOrNull()
            if (j == null) { if (++misses > 90) { setRe39(id) { it?.copy(step = "error", error = true, msg = "✕ Fikk ikke svar fra serveren") }; return@launch39 }; continue }
            misses = 0
            if (jobUpdate39(id, j)) return@launch39
        }
    }
}

/** Oppdaterer fra jobben (GET /jobs/:id). true = ferdig (bra eller feil). */
private suspend fun AppViewModel.jobUpdate39(id: String, j: JSONObject): Boolean {
    val status = j.optStr("status") ?: "running"
    val step = j.optStr("step")
    val pct = if (j.has("pct")) j.optInt("pct") else null
    when {
        status == "done" || step == "done" -> {
            val r = j.optJSONObject("result")
            if (r != null && !r.optBoolean("applied", false)) r.optStr("candidateId")?.let { cand ->
                runCatching { api39 { post("/receipts/$id/reanalyze/apply", JSONObject().put("candidateId", cand).put("keep", "new")) } }
            }
            val ch = r?.optJSONArray("changed")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
            finishRe39(id, r?.optDouble("confidence", Double.NaN) ?: Double.NaN, ch)
            return true
        }
        status == "cancelled" -> { cancelledRe39(id); return true }
        status == "error" || step == "error" -> {
            setRe39(id) { it?.copy(step = "error", error = true, msg = j.optStr("msg") ?: j.optStr("error") ?: "✕ ${it.engine} svarte ikke") }
            return true
        }
        else -> setRe39(id) { it?.copy(step = step ?: it.step, pct = maxOf(it.pct, pct ?: it.pct), msg = j.optStr("msg") ?: it.msg) }
    }
    return false
}

/** Sanntid «job» {jobId, kind:'reanalyze', receiptId, step, pct, msg}: fremdriften vises med en gang (pollingen tar slutten). */
fun AppViewModel.onJob39(msg: JSONObject) {
    if ((msg.optStr("kind") ?: "reanalyze") != "reanalyze") return
    val id = msg.optStr("receiptId") ?: p39.re.entries.firstOrNull { it.value.jobId == msg.optStr("jobId") }?.key ?: return
    val cur = p39.re[id] ?: return
    if (!cur.running) return
    val step = msg.optStr("step") ?: return
    if (step == "done" || step == "error") return
    setRe39(id) { it?.copy(step = step, pct = maxOf(it.pct, msg.optInt("pct", it.pct)), msg = msg.optStr("msg") ?: it.msg) }
}

private suspend fun AppViewModel.finishRe39(id: String, conf: Double, changed: List<String>) {
    val pct = if (conf.isNaN()) null else Math.round(if (conf <= 1.0) conf * 100 else conf).toInt()
    setRe39(id) { (it ?: Re39(null, "done", 100, null, "Gemini")).copy(step = "done", pct = 100, done = true, msg = "✦ Analysert på nytt") }
    Haptics.success()
    message = "✦ Analysert på nytt" + (pct?.let { " · $it % sikker" } ?: "")
    // Raden markeres i 2 s (endrede felt: ${changed.joinToString()}; eldre server sier ikke hvilke).
    p39.reFlash = p39.reFlash + (id to System.currentTimeMillis())
    runCatching { loadReceipts(); loadJobs() }
    kotlinx.coroutines.delay(2200)
    if (p39.re[id]?.done == true) setRe39(id) { null }
    p39.reFlash = p39.reFlash - id
}

private suspend fun AppViewModel.cancelledRe39(id: String) {
    setRe39(id) { it?.copy(step = "error", error = true, cancelled = true, msg = "Avbrutt · ingenting ble endret") }
    kotlinx.coroutines.delay(3000)
    if (p39.re[id]?.cancelled == true) setRe39(id) { null }
}

/** Avbryt: POST …/reanalyze/:jobId/cancel (eldre: DELETE /jobs/:id). */
fun AppViewModel.cancelRe39(id: String) {
    val job = p39.re[id]?.jobId
    Haptics.select()
    launch39 {
        if (job != null) {
            val ok = runCatching { api39 { post("/receipts/$id/reanalyze/$job/cancel") } }.isSuccess
            if (!ok) runCatching { api39 { delete("/jobs/$job") } }
        }
        cancelledRe39(id)
    }
}

/* ======================= AI-kontroll: Glimt anbefaler modeller ======================= */

data class RecItem39(
    val task: String, val taskName: String, val model: String, val why: String, val alt: String?, val fit: String,
    val installed: Boolean, val inUse: Boolean, val sizeGb: Double?,
)
data class Rec39(
    val title: String, val items: List<RecItem39>, val missing: List<Pair<String, Double?>>, val missingGb: Double?,
    val planText: String?, val planDone: Boolean, val planFill: Int,
    /** modell → (brukes til, førstevalg for) */
    val byModel: Map<String, Pair<List<String>, List<String>>>,
)
data class RecAnswer39(val text: String, val label: String?, val kind: String?, val model: String?, val tasks: List<String>)

private fun JSONObject.strs39(k: String): List<String> = optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()

private fun recItem39(o: JSONObject) = RecItem39(
    o.optString("task"), o.optStr("taskName") ?: o.optString("task"), o.optString("model"), o.optStr("why") ?: "", o.optStr("alt"),
    o.optStr("fit") ?: "PASSER", o.optBoolean("installed"), o.optBoolean("inUse"), if (o.has("sizeGb") && !o.isNull("sizeGb")) o.optDouble("sizeGb") else null,
)

internal fun parseRec39(raw: String): Rec39? = runCatching {
    val t = raw.trim()
    if (t.startsWith("[")) {
        val a = org.json.JSONArray(t)
        val items = (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map(::recItem39)
        val miss = items.filter { !it.installed }.distinctBy { it.model }.map { it.model to it.sizeGb }
        return@runCatching Rec39("✦ GLIMT ANBEFALER", items, miss, miss.sumOf { it.second ?: 0.0 }, null, items.all { it.inUse }, items.count { it.installed && !it.inUse }, emptyMap())
    }
    val o = JSONObject(t)
    val a = o.optJSONArray("items") ?: org.json.JSONArray()
    val items = (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map(::recItem39)
    val ma = o.optJSONArray("missing")
    val miss = ma?.let { m -> (0 until m.length()).mapNotNull { m.optJSONObject(it) }.map { it.optString("model") to (if (it.has("sizeGb")) it.optDouble("sizeGb") else null) } }
        ?: items.filter { !it.installed }.distinctBy { it.model }.map { it.model to it.sizeGb }
    val plan = o.optJSONObject("plan")
    val bm = o.optJSONObject("byModel")
    val by = HashMap<String, Pair<List<String>, List<String>>>()
    bm?.keys()?.forEach { k -> bm.optJSONObject(k)?.let { x -> by[k] = x.strs39("usedFor") to x.strs39("firstFor") } }
    Rec39(o.optStr("title") ?: "✦ GLIMT ANBEFALER", items, miss, if (o.has("missingGb")) o.optDouble("missingGb") else miss.sumOf { it.second ?: 0.0 },
        plan?.optStr("text"), plan?.optBoolean("done", false) ?: false, plan?.optInt("fill", 0) ?: 0, by)
}.getOrNull()

fun AppViewModel.loadRec39(force: Boolean = false) {
    val s = p39
    if (!force && System.currentTimeMillis() - s.recAt < 30_000L && s.rec != null) return
    s.recAt = System.currentTimeMillis()
    launch39 {
        try {
            s.rec = parseRec39(api39 { hlGet("/ai/recommend?full=1", timeout = 20_000) })
            s.recMissing = false
        } catch (e: ApiException) { if (e.status == 404) s.recMissing = true }
    }
}

/** «Spør Glimt»: POST /api/ai/recommend/ask {q} → tekst og knapp (Last ned / Bruk). */
fun AppViewModel.askRec39() {
    val s = p39
    val q = s.recAsk.trim()
    if (q.isEmpty() || s.recBusy) return
    s.recBusy = true
    launch39 {
        try {
            val o = JSONObject(api39 { hlPost("/ai/recommend/ask", JSONObject().put("q", q)) })
            val act = o.optJSONObject("action")
            s.recAnswer = RecAnswer39(o.optStr("text") ?: "Glimt fant ingen anbefaling.", act?.optStr("label"), act?.optStr("kind"), act?.optStr("model"), act?.strs39("tasks") ?: o.strs39("tasks"))
        } catch (e: ApiException) {
            s.recAnswer = RecAnswer39(if (e.status == 404) "Serveren har ikke Glimt-anbefalinger ennå." else (e.message ?: "Glimt svarte ikke."), null, null, null, emptyList())
        } finally { s.recBusy = false }
    }
}

/**
 * «Bruk» (én oppgave), «Bruk alle anbefalinger» og «La Glimt velge modeller → Fyll ut» (Valg): POST /api/ai/recommend/apply
 * {tasks?} (bare admin). Setter hovedmodellen til beste installerte; reserven røres ikke. Angre i 5 s.
 */
fun AppViewModel.applyRec39(tasks: List<String>? = null) {
    if (!userIsAdmin) { aiToast34("Bare administrator kan endre AI-valgene"); return }
    launch39 {
        try {
            val body = JSONObject().apply { if (tasks != null) put("tasks", org.json.JSONArray(tasks)) }
            val o = JSONObject(api39 { hlPost("/ai/recommend/apply", body) })
            val n = o.optJSONArray("changed")?.length() ?: 0
            p39.recUndo = o.optJSONObject("undo")?.optStr("token")
            Haptics.success()
            aiToast34(o.optStr("text") ?: if (n > 0) "✦ Glimt fylte ut $n valg" else "✓ Alt følger allerede anbefalingen")
            loadAiRouting34()
            loadRec39(force = true)
            val tok = p39.recUndo
            if (tok != null) { kotlinx.coroutines.delay(5000); if (p39.recUndo == tok) p39.recUndo = null }
        } catch (e: ApiException) {
            aiToast34(if (e.status == 404) "Serveren har ikke «La Glimt velge» ennå" else if (e.status == 403) "Bare administrator kan endre AI-valgene" else (e.message ?: "Fikk ikke fylt ut"))
        }
    }
}

fun AppViewModel.undoRec39() {
    val tok = p39.recUndo ?: return
    p39.recUndo = null
    launch39 {
        runCatching { api39 { hlPost("/ai/recommend/apply/undo", JSONObject().put("token", tok)) } }
        aiToast34("Angret")
        loadAiRouting34()
        loadRec39(force = true)
    }
}
