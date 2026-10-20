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
