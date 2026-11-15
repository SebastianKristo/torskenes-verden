package no.kristo.finanshub

import android.content.Context
import android.media.AudioManager
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.time.LocalTime
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.felles.nett.openSikker
import org.json.JSONObject

/* ---------------- Opplesning ---------------- */

/** Klang per figur for telefonens stemme (fasit: CHV): [pitch, tempo]. */
private val CHV35 = mapOf("glimt" to (1f to 1f), "natt" to (.92f to .95f), "sky" to (1.12f to 1.02f), "drape" to (1.25f to 1.06f), "ugle" to (.8f to .94f), "gris" to (1.08f to 1.04f), "stjerne" to (1.15f to 1.05f), "blekk" to (1.06f to 1.02f))

private val VOICE_P35 = mapOf("nora" to (1f to 1f), "henrik" to (.9f to .92f), "lys" to (1.15f to 1.05f))

/** Uttale før TTS: «kl.» → «klokka», «15:15» → «kvart over tre» … (serveren gjør det samme; dette er for reservestemmen). */
fun speakText35(t0: String, en: Boolean): String {
    var t = t0.replace("«", "").replace("»", "").replace("✦", "").replace("·", ",")
    if (en) return t
    t = t.replace(Regex("\\bkl\\. "), "klokka ")
    t = Regex("\\b(\\d{1,2}):(\\d{2})\\b").replace(t) { m -> clockWords35(m.groupValues[1].toInt(), m.groupValues[2].toInt()) ?: m.value }
    t = t.replace("IN2010", "I N tjue ti").replace("°", " grader")
    return t
}

private val NUM35 = listOf("tolv", "ett", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve", "tolv")

private fun clockWords35(h: Int, m: Int): String? {
    if (h > 23 || m > 59) return null
    val hh = h % 12; val nx = (h + 1) % 12
    return when (m) {
        0 -> NUM35[hh]
        15 -> "kvart over " + NUM35[hh]
        30 -> "halv " + NUM35[nx]
        45 -> "kvart på " + NUM35[nx]
        else -> null
    }
}

private fun stillHours35(n: NotifyPrefs): Boolean {
    if (!n.quiet) return false
    val m = LocalTime.now(OSLO35).let { it.hour * 60 + it.minute }
    val a = mins35(n.quietFrom); val b = mins35(n.quietTo)
    return if (a <= b) m in a until b else m >= a || m < b
}

/**
 * Glimt (eller vennen [char]) leser [text]. force = brukeren trykket (▶ Hør, slå på lyd); ellers bare når «Les opp» er på,
 * telefonen ikke er på lydløs og det ikke er stille timer.
 */
fun AppViewModel.say35(text: String, char: String, force: Boolean = false) {
    val s = p35
    val set = s.set
    if (!force && !set.readAloud) return
    val ctx = appCtx35
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    if (!force && (am?.ringerMode != AudioManager.RINGER_MODE_NORMAL || stillHours35(notifyPrefs))) return
    stopSay35()
    val id = ++s.sayId
    s.speaking = char
    s.sayJob = launchJob34 {
        val f = try { if (set.engine == "browser") null else fetchTts35(text, char) } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
        if (s.sayId != id) return@launchJob34
        if (f != null) playFile35(f, id) else {
            if (set.engine != "browser") s.ttsErr = "Stemmemotoren svarte ikke. Bruker telefonens stemme."
            sayLocal35(speakText35(text, set.lang == "en"), char, id)
        }
    }
}

fun AppViewModel.stopSay35() {
    val s = p35
    s.sayId++
    s.sayJob?.cancel(); s.sayJob = null
    runCatching { s.player?.stop() }; runCatching { s.player?.release() }; s.player = null
    runCatching { s.tts?.stop() }
    s.focus?.let { l -> runCatching { (appCtx35.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.abandonAudioFocus(l) } }
    s.focus = null
    s.speaking = null
}

private fun AppViewModel.takeFocus35(id: Int): Boolean {
    val am = appCtx35.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return true
    val l = AudioManager.OnAudioFocusChangeListener { ch ->
        // Telefonsamtale, en annen app som spiller, osv.: stopp.
        if (ch == AudioManager.AUDIOFOCUS_LOSS || ch == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) { if (p35.sayId == id) stopSay35() }
    }
    p35.focus = l
    @Suppress("DEPRECATION")
    return am.requestAudioFocus(l, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
}

private fun AppViewModel.playFile35(f: File, id: Int) {
    val s = p35
    if (!takeFocus35(id)) { s.speaking = null; return }
    runCatching {
        val mp = MediaPlayer()
        mp.setDataSource(f.absolutePath)
        mp.setOnCompletionListener { if (s.sayId == id) stopSay35() else runCatching { it.release() } }
        mp.setOnErrorListener { _, _, _ -> if (s.sayId == id) stopSay35(); true }
        mp.prepare()
        s.player = mp
        mp.start()
        s.ttsErr = null
    }.onFailure { if (s.sayId == id) { s.speaking = null } }
}

/** Reserve: telefonens TextToSpeech med klang per figur. */
private fun AppViewModel.sayLocal35(text: String, char: String, id: Int) {
    val s = p35
    val set = s.set
    val run: (TextToSpeech) -> Unit = { t ->
        val en = set.lang == "en"
        runCatching { t.language = if (en) Locale.UK else Locale("nb", "NO") }
        val cv = CHV35[char] ?: (1f to 1f)
        val vp = VOICE_P35[set.voice] ?: (1f to 1f)
        val rate = when (set.rate) { "calm" -> .85f; "fast" -> 1.15f; else -> 1f }
        t.setPitch(cv.first * vp.first)
        t.setSpeechRate(rate * cv.second * vp.second)
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { if (s.sayId == id) s.speaking = null }
            @Deprecated("Deprecated in Java") override fun onError(utteranceId: String?) { if (s.sayId == id) s.speaking = null }
        })
        if (takeFocus35(id)) t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "glimt35-$id") else s.speaking = null
    }
    val cur = s.tts
    if (cur != null && s.ttsReady) { run(cur); return }
    if (cur != null) return
    var made: TextToSpeech? = null
    made = TextToSpeech(appCtx35) { st ->
        s.ttsReady = st == TextToSpeech.SUCCESS
        val t = made
        if (s.ttsReady && t != null && s.sayId == id) run(t) else if (!s.ttsReady) s.speaking = null
    }
    s.tts = made
}

/** POST /api/tts → MP3 i cacheDir/tts35 (30 dager). null = ingen motor/nøkkel (503) eller feil. */
private suspend fun AppViewModel.fetchTts35(text: String, char: String): File? = withContext(Dispatchers.IO) {
    val set = p35.set
    val ctx = appCtx35
    val dir = File(ctx.cacheDir, "tts35").apply { mkdirs() }
    val key = MessageDigest.getInstance("SHA-1").digest("${set.engine}|${set.voice}|${set.rate}|${set.lang}|$char|$text".toByteArray()).joinToString("") { "%02x".format(it) }
    val f = File(dir, "$key.mp3")
    if (f.exists() && f.length() > 0 && System.currentTimeMillis() - f.lastModified() < 30L * 86_400_000L) return@withContext f
    // Rydd gamle filer.
    runCatching { dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 30L * 86_400_000L }?.forEach { it.delete() } }
    val c = URL(base.trimEnd('/') + "/api/tts").openSikker()
    try {
        c.requestMethod = "POST"
        c.connectTimeout = 8_000
        c.readTimeout = 25_000
        c.setRequestProperty("Accept", "audio/mpeg, application/json")
        account?.token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        val body = JSONObject().put("text", text).put("character", char).put("voice", set.voice).put("rate", set.rate).put("lang", set.lang)
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        if (c.responseCode != 200) return@withContext null
        if (c.contentType?.contains("json") == true) return@withContext null
        val tmp = File(dir, "$key.part")
        c.inputStream.use { inp -> tmp.outputStream().use { inp.copyTo(it) } }
        if (tmp.length() < 200) { tmp.delete(); return@withContext null }
        tmp.renameTo(f)
        f
    } catch (e: Exception) { null } finally { runCatching { c.disconnect() } }
}
