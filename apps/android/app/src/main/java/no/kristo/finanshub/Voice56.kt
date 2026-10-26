package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.util.Locale

/*
 * Prompt 56 (AND56): tale til tekst via serveren, som web/PWA (public/js/voice54.js).
 *  - GET /api/voice53/backends: mikrofonen bruker serveren bare når minst én motor er «available» og innstillingen er «Serveren».
 *  - Opptak med MediaRecorder (AAC i MPEG-4, 16 kHz mono) til en temp-fil i cacheDir → POST /api/voice53/transcribe (multipart: file,
 *    language=auto, hint=nb|en) med appens vanlige API-klient (Api.upload, samme token). Fila slettes alltid etter sending eller avbrudd.
 *  - Teksten settes inn i skrivefeltet (sendes ikke), og «motor · språk» vises kort etterpå.
 *  - Trykk = start/stopp, hold inne = snakk så lenge du holder. Maks 2 min. «Lytter …» med nivå, «Skriver ned …» mens serveren jobber.
 *  - Ingen motor / serveren utilgjengelig / 503: talegjenkjenningen på telefonen som før (stille reserve). 422/400: serverens feiltekst.
 *  - Innstillingen «Tale til tekst: Serveren (anbefalt) / På enheten» lagres lokalt (SharedPreferences «voice56»).
 * Grensesnittet (knappen, linjen, tillatelsesteksten og innstillingen) ligger i ui/Voice56Ui.kt.
 */

/** En motor fra /api/voice53/backends. */
data class VoiceBackend56(val id: String, val label: String, val engineLabel: String, val languages: List<String>, val available: Boolean, val configured: Boolean)

data class VoiceInfo56(val backends: List<VoiceBackend56>, val norwegian: Boolean, val norwegianEngine: String?) {
    val any: Boolean get() = backends.any { it.available }
}

internal fun parseVoiceInfo56(raw: String): VoiceInfo56? = runCatching {
    val o = JSONObject(raw)
    val arr = o.optJSONArray("backends")
    val list = buildList {
        if (arr != null) for (i in 0 until arr.length()) {
            val b = arr.optJSONObject(i) ?: continue
            val langs = b.optJSONArray("languages")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
            add(VoiceBackend56(b.optString("id"), b.optString("label"), b.optString("engine_label").ifBlank { b.optString("label") }, langs,
                b.optBoolean("available"), if (b.has("configured")) b.optBoolean("configured") else true))
        }
    }
    VoiceInfo56(list, o.optBoolean("norwegian"), o.optString("norwegian_engine").takeIf { it.isNotBlank() && it != "null" })
}.getOrNull()

/** Tilstanden for mikrofonen (felles for Glimt-chatten og Glimt-søket). */
object Voice56 {
    const val MAX_MS = 120_000L
    const val MIN_MS = 400L
    const val CHAT = "chat"
    const val SEARCH = "search"

    /** idle | rec | busy */
    var phase by mutableStateOf("idle")
    /** chat | search: hvilket felt teksten skal inn i. */
    var target by mutableStateOf<String?>(null)
    var level by mutableStateOf(0f)
    var secs by mutableStateOf(0)
    var hold by mutableStateOf(false)
    /** true = talegjenkjenningen på telefonen (reserve i søket). */
    var onDevice by mutableStateOf(false)
    /** Kort beskjed under søkefeltet («NB-Whisper (Mac mini) · norsk»). Chat bruker toasten. */
    var note by mutableStateOf<String?>(null)
    var noteFor by mutableStateOf<String?>(null)
    /** server | device */
    var mode by mutableStateOf("server")
    var info by mutableStateOf<VoiceInfo56?>(null)
    var infoLoaded by mutableStateOf(false)
    /** Prompt 70 (ANDHOME70, mikrofon-sokefelt): teksten så langt – bare med talegjenkjenningen på telefonen (serveren gir teksten til slutt). */
    var partial by mutableStateOf("")
    /** Prompt 70: ↑ Send i opptakskortet – søket sendes når teksten er satt inn (sendTick øker). */
    var autoSend = false
    var sendTick by mutableStateOf(0)

    internal var modeLoaded = false
    internal var infoAt = 0L
    internal var loading = false
    internal var rec: MediaRecorder? = null
    internal var file: File? = null
    internal var t0 = 0L
    internal var seq = 0
    internal var tick: Job? = null
    internal var send: Job? = null
    internal var noteJob: Job? = null
    internal var insert: ((String) -> Unit)? = null
    internal var device: SpeechRecognizer? = null

    fun on(t: String): Boolean = target == t && phase != "idle"
    val server: Boolean get() = mode == "server" && info?.any == true

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("voice56", Context.MODE_PRIVATE)
    fun loadMode(ctx: Context) {
        if (modeLoaded) return
        modeLoaded = true
        mode = runCatching { prefs(ctx).getString("mode", "server") }.getOrNull()?.takeIf { it == "device" } ?: "server"
    }
    fun saveMode(ctx: Context, m: String) {
        mode = if (m == "device") "device" else "server"
        runCatching { prefs(ctx).edit().putString("mode", mode).apply() }
    }
}

/** Legger tekst til det som står i feltet (mellomrom mellom). */
internal fun join56(cur: String, t: String): String = if (cur.isBlank()) t else if (cur.endsWith(" ") || cur.endsWith("\n")) cur + t else "$cur $t"

private fun hint56(): String = if (Locale.getDefault().language.lowercase(Locale.ROOT).startsWith("en")) "en" else "nb"

/** Henter motorene (maks hvert minutt, eller med force). Feiler det, brukes telefonen (info = null). */
fun AppViewModel.voice56Refresh(force: Boolean = false) {
    val v = Voice56
    v.loadMode(getApplication<android.app.Application>())
    if (v.loading || (!force && v.infoAt != 0L && System.currentTimeMillis() - v.infoAt < 60_000L)) return
    v.loading = true
    viewModelScope.launch {
        val raw = runCatching { api39 { hlGet("/voice53/backends", timeout = 6_000) } }.getOrNull()
        v.info = raw?.let(::parseVoiceInfo56)
        v.infoAt = System.currentTimeMillis()
        v.infoLoaded = true
        v.loading = false
    }
}

/** Kort beskjed: i Chat som toast (5 s), i søket under feltet. */
internal fun AppViewModel.say56(target: String?, text: String, ms: Long = 5_000L) {
    if (target == Voice56.CHAT) {
        val s = chat27
        s.toast = text
        s.toastJob?.cancel()
        s.toastJob = viewModelScope.launch { delay(ms); s.toast = "" }
        return
    }
    val v = Voice56
    v.note = text; v.noteFor = target
    v.noteJob?.cancel()
    v.noteJob = viewModelScope.launch { delay(ms); if (v.note == text) { v.note = null; v.noteFor = null } }
}

/**
 * Trykk eller hold på mikrofonen med serveren. Returnerer false når serveren ikke skal brukes (da tar kalleren talegjenkjenningen
 * på telefonen). Et nytt trykk mens det tas opp for samme felt stopper og sender.
 */
fun AppViewModel.micServer56(ctx: Context, target: String, hold: Boolean, insert: (String) -> Unit): Boolean {
    val v = Voice56
    v.loadMode(ctx)
    if (v.phase != "idle") {
        if (v.target == target) { if (v.phase == "rec") stopMic56(false) }
        return true // en annen opptak/tolking pågår: ikke start en til
    }
    if (!v.server) { voice56Refresh(); return false }
    startRec56(ctx, target, hold, insert)
    return true
}

private fun AppViewModel.startRec56(ctx: Context, target: String, hold: Boolean, insert: (String) -> Unit) {
    val v = Voice56
    val dir = ctx.cacheDir
    // Rester fra en app som ble drept midt i et opptak.
    runCatching { dir.listFiles { f -> f.name.startsWith("voice56-") }?.forEach { it.delete() } }
    val f = File(dir, "voice56-${System.currentTimeMillis()}.m4a")
    val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
    try {
        r.setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setAudioSamplingRate(16_000)
        r.setAudioChannels(1)
        r.setAudioEncodingBitRate(32_000)
        r.setOutputFile(f.absolutePath)
        r.prepare()
        r.start()
    } catch (e: Exception) {
        runCatching { r.release() }
        f.delete()
        say56(target, "Fikk ikke startet mikrofonen")
        return
    }
    v.rec = r; v.file = f; v.t0 = System.currentTimeMillis(); v.insert = insert
    v.target = target; v.hold = hold; v.onDevice = false; v.level = 0f; v.secs = 0; v.phase = "rec"
    if (v.noteFor == target) { v.note = null; v.noteFor = null }
    Haptics.tap()
    val my = ++v.seq
    v.tick?.cancel()
    v.tick = viewModelScope.launch {
        while (v.seq == my && v.phase == "rec") {
            val amp = runCatching { v.rec?.maxAmplitude ?: 0 }.getOrDefault(0)
            // 0..32767 → 0..1 på en logaritmisk skala (stille rom ≈ 0, tale ≈ 0,5–1).
            v.level = if (amp <= 0) 0f else ((20f * kotlin.math.log10(amp / 32767f) + 50f) / 50f).coerceIn(0f, 1f)
            val ms = System.currentTimeMillis() - v.t0
            v.secs = (ms / 1000L).toInt()
            if (ms >= Voice56.MAX_MS) { stopMic56(false); say56(target, "Maks 2 minutter – sender det du har sagt"); break }
            delay(100)
        }
    }
}

/** Slipp (hold inne) eller Avbryt. Holder ikke opptaket på (trykk-modus), skjer ingenting ved slipp. */
fun AppViewModel.releaseMic56(target: String, cancel: Boolean) {
    val v = Voice56
    if (v.target != target || v.phase != "rec") return
    if (cancel || v.hold) stopMic56(cancel)
}

/** Avbryt-knappen: stopper opptaket uten å sende, eller glemmer svaret mens serveren skriver ned. */
fun AppViewModel.cancelMic56() {
    val v = Voice56
    when (v.phase) {
        "rec" -> stopMic56(true)
        "busy" -> { v.seq++; v.send?.cancel(); v.send = null; v.phase = "idle"; v.target = null; v.insert = null }
    }
}

/** Stopper opptaket; uten cancel sendes lyden til serveren. Temp-fila slettes uansett. */
fun AppViewModel.stopMic56(cancel: Boolean) {
    val v = Voice56
    if (v.phase != "rec") return
    v.tick?.cancel(); v.tick = null
    v.level = 0f
    if (v.onDevice) { // talegjenkjenningen på telefonen (søket)
        val sr = v.device
        if (cancel) { v.seq++; runCatching { sr?.cancel() }; runCatching { sr?.destroy() }; v.device = null; v.phase = "idle"; v.target = null; v.insert = null }
        else { v.phase = "busy"; runCatching { sr?.stopListening() } }
        return
    }
    val r = v.rec; val f = v.file; val target = v.target; val insert = v.insert
    v.rec = null; v.file = null
    val ms = System.currentTimeMillis() - v.t0
    val ok = runCatching { r?.stop() }.isSuccess
    runCatching { r?.release() }
    if (cancel || f == null || r == null) {
        f?.delete(); v.phase = "idle"; v.target = null; v.insert = null
        return
    }
    if (!ok || ms < Voice56.MIN_MS || f.length() < 600L) {
        f.delete(); v.phase = "idle"; v.target = null; v.insert = null
        say56(target, "For kort opptak – hold inne mens du snakker, eller trykk én gang for å starte.", 4_000L)
        return
    }
    v.phase = "busy"
    Haptics.select()
    val my = ++v.seq
    v.send = viewModelScope.launch {
        var msg: String? = null
        var text: String? = null
        try {
            val bytes = withContext(Dispatchers.IO) { f.readBytes() }
            f.delete()
            val raw = api39 {
                upload("/voice53/transcribe", listOf(
                    Api.Part("file", "tale.m4a", "audio/mp4", bytes),
                    Api.Part.text("language", "auto"),
                    Api.Part.text("hint", hint56()),
                ), prefix = Api.HOMELAB, read = 180_000)
            }
            val o = JSONObject(raw)
            text = o.optString("text").trim()
            val eng = o.optString("engine_label").ifBlank { o.optString("engine") }.ifBlank { "Tale til tekst" }
            val lang = o.optString("language_label").ifBlank { o.optString("language") }
            val det = o.optJSONObject("detected")?.optString("source") == "detected"
            msg = if (text.isEmpty()) "Hørte ingen ord · $eng" else listOf(eng, lang + if (det) " (oppdaget)" else "").filter { it.isNotBlank() }.joinToString(" · ")
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: ApiException) {
            // 503 / ingen motor / ruten avslått: telefonen tar over neste gang (stille reserve). 422 og 400: serverens tekst.
            if (e.status == 503 || e.code == "asr_unavailable" || e.code == "disabled" || e.status == 403 || e.status == 404) {
                Voice56.info = null; Voice56.infoAt = System.currentTimeMillis()
                msg = "Serveren kan ikke skrive ned tale nå – neste gang brukes telefonen"
            } else {
                msg = "Tale til tekst: ${e.message ?: "feil ${e.status}"}"
                if (e.status == 422) voice56Refresh(force = true)
            }
        } catch (e: Exception) {
            msg = "Tale til tekst: ${e.message ?: "feil"}"
        } finally {
            f.delete()
        }
        if (v.seq != my) return@launch
        v.phase = "idle"; v.target = null; v.insert = null; v.send = null
        if (!text.isNullOrEmpty()) { insert?.invoke(text); Haptics.select() }
        msg?.let { say56(target, it, if (text.isNullOrEmpty()) 7_000L else 5_000L) }
    }
}

/** Søket uten motor på serveren: talegjenkjenningen på telefonen (nb-NO), samme linje og samme knapp. */
fun AppViewModel.micDevice56(ctx: Context, target: String, hold: Boolean, insert: (String) -> Unit) {
    val v = Voice56
    if (v.phase != "idle") { if (v.target == target && v.phase == "rec") stopMic56(false); return }
    if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { say56(target, "Talegjenkjenning finnes ikke på denne telefonen"); return }
    val sr = runCatching { SpeechRecognizer.createSpeechRecognizer(ctx) }.getOrNull() ?: run { say56(target, "Fikk ikke startet mikrofonen"); return }
    val my = ++v.seq
    var got = ""
    fun done(msg: String?) {
        if (v.seq != my) return
        runCatching { sr.destroy() }
        if (v.device === sr) v.device = null
        v.phase = "idle"; v.target = null; v.insert = null; v.level = 0f
        if (got.isNotBlank()) insert(got)
        msg?.let { say56(target, it, 4_000L) }
    }
    sr.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) { if (v.seq == my) v.level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f) }
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() { if (v.seq == my && v.phase == "rec") v.phase = "busy" }
        override fun onError(error: Int) {
            done(when (error) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT, SpeechRecognizer.ERROR_CLIENT -> if (got.isBlank()) "Hørte ingen ord" else null
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Gi appen tilgang til mikrofonen"
                else -> "Fikk ikke tolket talen"
            })
        }
        override fun onResults(results: Bundle?) {
            results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }?.let { got = it }
            done(if (got.isBlank()) "Hørte ingen ord" else "På telefonen · norsk")
        }
        override fun onPartialResults(partialResults: Bundle?) {
            partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }?.let { got = it; if (v.seq == my) v.partial = it }
        }
        override fun onEvent(eventType: Int, params: Bundle?) {}
    })
    val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "nb-NO")
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "nb-NO")
        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    v.partial = "" // prompt 70
    v.device = sr; v.target = target; v.hold = hold; v.onDevice = true; v.level = 0f; v.secs = 0; v.t0 = System.currentTimeMillis(); v.insert = insert; v.phase = "rec"
    if (v.noteFor == target) { v.note = null; v.noteFor = null }
    runCatching { sr.startListening(i) }.onFailure { done("Fikk ikke startet mikrofonen"); return }
    Haptics.tap()
    v.tick?.cancel()
    v.tick = viewModelScope.launch {
        while (v.seq == my && v.phase == "rec") {
            val ms = System.currentTimeMillis() - v.t0
            v.secs = (ms / 1000L).toInt()
            if (ms >= Voice56.MAX_MS) { stopMic56(false); break }
            delay(250)
        }
    }
}

/** Søkefeltet på Hjem: serveren når den har en motor, ellers telefonen. */
fun AppViewModel.micSearch56(ctx: Context, hold: Boolean = false) {
    // Prompt 70: ↑ Send i opptakskortet → søket går når teksten er satt inn.
    val put: (String) -> Unit = { t -> setHomeQuery29(join56(q29.homeQ, t)); if (Voice56.autoSend) { Voice56.autoSend = false; Voice56.sendTick++ } }
    if (Voice56.phase == "idle") { Voice56.autoSend = false; Voice56.partial = "" }
    if (Voice56.phase != "idle" && Voice56.target == Voice56.SEARCH && Voice56.onDevice) { if (Voice56.phase == "rec") stopMic56(false); return }
    if (!micServer56(ctx, Voice56.SEARCH, hold, put)) micDevice56(ctx, Voice56.SEARCH, hold, put)
}

/** Hold inne i Chat: slipp stopper både serveropptaket og talegjenkjenningen på telefonen (ChatVoice27). */
fun AppViewModel.releaseChatMic56(cancel: Boolean) {
    if (Voice56.on(Voice56.CHAT)) { releaseMic56(Voice56.CHAT, cancel); return }
    chat27.voice?.stop()
}
