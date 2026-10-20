package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Locale

/*
 * Prompt 27 (ANDROID-A): Chat (design/Mobil Papir App.dc.html, side «chat»; claude-code-chat.md). Serveren er en proxy mot
 * Open WebUI (eller egen lagring + Ollama/Gemini/Groq): /api/chat/models, /chats, /folders, /send (SSE), /files, /knowledge.
 * Strømmen leses med plattformens HttpURLConnection (samme som Api.kt), ingen nye avhengigheter.
 * Tale: SpeechRecognizer (nb-NO), opplesing: TextToSpeech (nb-NO). Grensesnittet ligger i ui/Chat27Ui.kt og ui/Chat27Sheets.kt.
 * Hjem → ✦ AI (ANDROID-B) kaller vm.openChat(prompt): ny samtale som sendes med en gang.
 */

/* ---------- Modeller ---------- */

data class ChatModel27(
    val id: String, val name: String, val kind: String, val provider: String, val size: String?, val vision: Boolean, val installed: Boolean, val desc: String? = null,
) {
    val sky: Boolean get() = kind == "sky"
    /** Navnet i listene: sky-modellene med navn, lokale med Ollama-navnet (som designet). */
    val label: String get() = if (sky) name else id
}

data class ChatRow27(val id: String, val title: String, val model: String, val updatedAt: Long, val pinned: Boolean, val folderId: String?)
data class ChatFolder27(val id: String, val name: String, val open: Boolean, val chats: List<ChatRow27>)

data class ChatMsg27(
    val role: String, val content: String, val att: List<String> = emptyList(), val images: List<String> = emptyList(),
    val model: String? = null, val used: List<String> = emptyList(), val stats: String? = null,
    /** Prompt 31: kortet fra Glimt (JSON {k, …}) og verktøyet («Vær», «Kalender» …). */
    val card: String? = null, val tool: String? = null,
    /** Prompt 41: fakta Glimt hentet før svaret (meta.facts), vist som små kort. */
    val facts: List<ChatFact41> = emptyList(),
)

data class ChatSet27(
    val persona: String = "standard", val system: String = "", val temperature: Double = 0.7, val topP: Double = 0.9, val numCtx: Int = 8192,
    val theme: String = "papir", val skipCloudAsk: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject().put("persona", persona).put("system", system).put("temperature", temperature).put("topP", topP)
        .put("numCtx", numCtx).put("theme", theme).put("skipCloudAsk", skipCloudAsk)

    companion object {
        fun parse(o: JSONObject?, def: ChatSet27 = ChatSet27()): ChatSet27 = if (o == null) def else ChatSet27(
            o.optStr("persona") ?: def.persona, o.optString("system", def.system), o.optDouble("temperature", def.temperature).takeIf { !it.isNaN() } ?: def.temperature,
            o.optDouble("topP", def.topP).takeIf { !it.isNaN() } ?: def.topP, o.optInt("numCtx", def.numCtx), o.optStr("theme") ?: def.theme, o.optBoolean("skipCloudAsk", def.skipCloudAsk),
        )
    }
}

/** Vedlegg i skrivefeltet: bilde (base64 til bildemodellen), fil (lastet opp, id) eller dokument fra kunnskapsbasen (id). */
data class ChatAtt27(val name: String, val kind: String, val id: String? = null, val b64: String? = null)

/** «Sende til …?»: modellen, hva som forlater serveren, og meldingen som venter. */
data class ChatGuard27(val model: String, val leaves: List<String>, val text: String, val hasData: Boolean)

data class ChatDoc27(val id: String, val name: String, val sub: String)

/** Persona: nøkkel (som serveren, chat.js PERSONAS), navn og beskrivelse (designet). */
val CHAT27_PERSONAS = listOf(
    Triple("standard", "Standard", ""),
    Triple("okonomi", "Økonomi", "Svar kort og bruk tall i kroner. Bruk dataene fra Finans når de finnes."),
    Triple("homelab", "Homelab", "Du hjelper med Docker, Home Assistant, Proxmox og Python. Gi konkrete kommandoer."),
    Triple("norsklarer", "Norsklærer", "Rett språket og forklar kort hvorfor."),
)

/** Modeller som kan hentes fra ollama.com (designet). */
val CHAT27_LIB = listOf(
    Triple("llama3.2:3b", "Llama 3.2", "3B · 2,0 GB"), Triple("qwen3:8b", "Qwen 3", "8B · 5,2 GB"),
    Triple("mistral:7b", "Mistral", "7B · 4,1 GB"), Triple("phi4:14b", "Phi-4", "14B · 9,1 GB"),
)

/** Forslagene på en tom samtale: tekst, undertekst og om Mine data slås på. */
val CHAT27_SUGG = listOf(
    Triple("Hva har jeg brukt på mat i oktober?", "Bruker Mine data", true),
    Triple("Lag en handleliste til taco for fire", "", false),
    Triple("Forklar Docker-volumer enkelt", "", false),
)

val CHAT27_CTX = listOf(4096, 8192, 16384, 32768)

/* ---------- Tilstand ---------- */

class Chat27State {
    var open by mutableStateOf(false)
    var unavailable by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var models by mutableStateOf<List<ChatModel27>>(emptyList())
    var defModel by mutableStateOf<String?>(null)
    var pinned by mutableStateOf<List<ChatRow27>>(emptyList())
    var folders by mutableStateOf<List<ChatFolder27>>(emptyList())
    var chats by mutableStateOf<List<ChatRow27>>(emptyList())
    var listLoaded by mutableStateOf(false)
    var q by mutableStateOf("")
    var found by mutableStateOf<List<ChatRow27>?>(null)
    /** Samtalen som vises (null = ny). */
    var curId by mutableStateOf<String?>(null)
    var title by mutableStateOf("")
    var model by mutableStateOf<String?>(null)
    var settings by mutableStateOf(ChatSet27())
    var defSettings by mutableStateOf(ChatSet27())
    var msgs by mutableStateOf<List<ChatMsg27>>(emptyList())
    var loadingChat by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var stream by mutableStateOf("")
    var streamTools by mutableStateOf<List<String>>(emptyList())
    var input by mutableStateOf("")
    var att by mutableStateOf<List<ChatAtt27>>(emptyList())
    var web by mutableStateOf(false)
    var data by mutableStateOf(false)
    var drawer by mutableStateOf(false)
    /** Åpent ark: model | params | menu | guard | plus | kb | mods */
    var sheet by mutableStateOf<String?>(null)
    var menuId by mutableStateOf<String?>(null)
    var rn by mutableStateOf("")
    var nf by mutableStateOf("")
    var delArm by mutableStateOf(false)
    var guard by mutableStateOf<ChatGuard27?>(null)
    var skipAsk by mutableStateOf(false)
    var rec by mutableStateOf(false)
    var rms by mutableStateOf(0f)
    var speaking by mutableStateOf<String?>(null)
    var copied by mutableStateOf<String?>(null)
    var toast by mutableStateOf("")
    /** Meldingen som redigeres: indeks og tekst. */
    var editIdx by mutableStateOf<Int?>(null)
    var editText by mutableStateOf("")
    var pulls by mutableStateOf<Map<String, Float>>(emptyMap())
    var modDel by mutableStateOf<String?>(null)
    var pullName by mutableStateOf("")
    var kb by mutableStateOf<List<ChatDoc27>?>(null)
    var folderOpen by mutableStateOf<Map<String, Boolean>>(emptyMap())
    /* Brukerinnstillinger (CHAT i Innstillinger → AI og tolkning). */
    var myDataOn by mutableStateOf(false)
    var askCloud by mutableStateOf(true)
    var theme by mutableStateOf("papir")
    var cfgLoaded by mutableStateOf(false)
    /** Teksten fra ✦ AI på Hjem: sendes når modellene er hentet. */
    internal var pending: String? = null
    internal var conn: HttpURLConnection? = null
    @Volatile internal var stopped = false
    internal var job: Job? = null
    internal var searchJob: Job? = null
    internal var toastJob: Job? = null
    internal var voice: ChatVoice27? = null
    internal var loadedFor: String? = null
}

/* ---------- Tolking ---------- */

private fun chatTime27(o: JSONObject, vararg keys: String): Long {
    for (k in keys) {
        if (!o.has(k) || o.isNull(k)) continue
        val v = o.opt(k)
        if (v is Number) { val n = v.toLong(); return if (n < 100_000_000_000L) n * 1000 else n }
        val s = v.toString()
        s.toLongOrNull()?.let { return if (it < 100_000_000_000L) it * 1000 else it }
        runCatching { return OffsetDateTime.parse(s).toInstant().toEpochMilli() }
        runCatching { return Instant.parse(s).toEpochMilli() }
        runCatching { return java.time.LocalDateTime.parse(s.removeSuffix("Z")).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    }
    return 0L
}

private fun JSONArray?.objs27(): List<JSONObject> = (0 until (this?.length() ?: 0)).mapNotNull { this!!.optJSONObject(it) }
private fun JSONArray?.strs27(): List<String> = (0 until (this?.length() ?: 0)).mapNotNull { i ->
    val v = this!!.opt(i)
    when (v) { is String -> v.takeIf { it.isNotBlank() }; is JSONObject -> v.optStr("name") ?: v.optStr("title") ?: v.optStr("id"); else -> null }
}

fun parseChatModel27(o: JSONObject): ChatModel27? {
    val id = o.optStr("id") ?: o.optStr("name") ?: return null
    val kind = (o.optStr("kind") ?: if (o.optStr("provider") in setOf("gemini", "groq")) "sky" else "lokal").lowercase()
    return ChatModel27(id, o.optStr("name") ?: id, if (kind == "sky" || kind == "cloud") "sky" else "lokal", o.optStr("provider") ?: if (kind == "sky") "gemini" else "ollama",
        o.optStr("size"), o.optBoolean("vision", false), o.optBoolean("installed", true), o.optStr("desc") ?: o.optStr("description"))
}

fun parseChatRow27(o: JSONObject): ChatRow27? {
    val id = o.optStr("id") ?: return null
    return ChatRow27(id, o.optStr("title") ?: "Ny samtale", o.optStr("model") ?: "", chatTime27(o, "updatedAt", "updated_at", "updated", "ts"),
        o.optBoolean("pinned", false), o.optStr("folderId") ?: o.optStr("folder_id"))
}

fun parseChatMsg27(o: JSONObject): ChatMsg27? {
    val role = o.optStr("role") ?: return null
    if (role == "system") return null
    val content = o.optString("content", "")
    // Svarene har meta {model, tokensPerSec, ms, used, stopped} (server/chat.js).
    val meta = o.optJSONObject("meta") ?: o
    val used = meta.optJSONArray("used").strs27().ifEmpty { o.optJSONArray("tools").strs27() }
    val att = (o.optJSONArray("files").strs27() + o.optJSONArray("attachments").strs27()).distinct()
    val tps = meta.optDouble("tokensPerSec", Double.NaN)
    val ms = meta.optDouble("ms", Double.NaN)
    val stopped = meta.optBoolean("stopped", false)
    val stats = o.optStr("stats") ?: if (!tps.isNaN() || !ms.isNaN() || stopped) chatStats27(tps, ms, stopped) else null
    val imgs = o.optJSONArray("images")?.length() ?: 0
    val card = (o.optJSONObject("card") ?: meta.optJSONObject("card"))?.toString()
    return ChatMsg27(if (role == "assistant") "assistant" else "user", content, att + (if (imgs > 0) List(imgs) { "Bilde ${it + 1}" } else emptyList()),
        emptyList(), meta.optStr("model") ?: o.optStr("model"), used, stats, card, meta.optStr("tool") ?: o.optStr("tool"),
        facts = parseFacts41(meta.optJSONArray("facts")))
}

fun chatStats27(tps: Double, ms: Double, stopped: Boolean): String {
    val parts = mutableListOf<String>()
    if (stopped) parts += "Stoppet"
    if (!tps.isNaN() && tps > 0) parts += "${Math.round(tps)} tok/s"
    if (!ms.isNaN() && ms > 0) parts += String.format(Locale("nb", "NO"), "%.1f s", ms / 1000.0)
    return parts.joinToString(" · ")
}

/* ---------- Hjelpere ---------- */

fun Chat27State.curModel27(): ChatModel27? = (model ?: defModel)?.let { k -> models.firstOrNull { it.id == k } ?: ChatModel27(k, k, "lokal", "ollama", null, false, true) }
fun Chat27State.modelLabel27(k: String): String = models.firstOrNull { it.id == k }?.label ?: k
fun Chat27State.firstLocal27(): ChatModel27? = models.firstOrNull { !it.sky && it.installed }

/** I DAG · I GÅR · SISTE 7 DAGER · ELDRE. */
fun chatGroups27(rows: List<ChatRow27>): List<Pair<String, List<ChatRow27>>> {
    val sod = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val d = 86_400_000L
    val r = rows.sortedByDescending { it.updatedAt }
    return listOf(
        "I DAG" to r.filter { it.updatedAt >= sod },
        "I GÅR" to r.filter { it.updatedAt < sod && it.updatedAt >= sod - d },
        "SISTE 7 DAGER" to r.filter { it.updatedAt < sod - d && it.updatedAt >= sod - 7 * d },
        "ELDRE" to r.filter { it.updatedAt < sod - 7 * d },
    ).filter { it.second.isNotEmpty() }
}

/** «14:05», «i går» eller «03.10». */
fun chatRel27(t: Long): String {
    if (t <= 0) return ""
    val z = ZoneId.systemDefault()
    val dt = Instant.ofEpochMilli(t).atZone(z)
    val today = LocalDate.now(z)
    return when (dt.toLocalDate()) {
        today -> "%02d:%02d".format(dt.hour, dt.minute)
        today.minusDays(1) -> "i går"
        else -> "%02d.%02d".format(dt.dayOfMonth, dt.monthValue)
    }
}

private fun chatEnc27(s: String) = URLEncoder.encode(s, "UTF-8")
private fun cfgBool27(v: Any?, def: Boolean): Boolean = when (v) {
    null, JSONObject.NULL -> def
    is Boolean -> v
    is Number -> v.toInt() != 0
    else -> v.toString().trim().lowercase().let { if (it.isEmpty()) def else it in setOf("1", "true", "on", "yes", "ja") }
}

/* ---------- Åpne og lukke ---------- */

/** Åpner Chat. Med tekst (✦ AI på Hjem): ny samtale som sendes med en gang. */
fun AppViewModel.openChat27(prompt: String = "") {
    val s = chat27
    val acct = account?.id
    if (s.loadedFor != acct) {
        s.loadedFor = acct
        s.curId = null; s.msgs = emptyList(); s.title = ""; s.model = null; s.chats = emptyList(); s.pinned = emptyList(); s.folders = emptyList()
        s.listLoaded = false; s.cfgLoaded = false; s.models = emptyList(); s.kb = null
        runCatching { s.defSettings = ChatSet27.parse(JSONObject(prefs.str("chat27_def_" + (acct ?: ""), "{}"))) }
    }
    s.open = true
    s.sheet = null; s.drawer = false; s.editIdx = null
    val t = prompt.trim()
    if (t.isNotEmpty()) {
        newChat27()
        s.input = t
        s.pending = t
    }
    loadChatCfg27()
    loadChatModels27()
    loadChats27()
}

fun AppViewModel.closeChat27() {
    val s = chat27
    when {
        s.sheet != null -> { s.sheet = null; s.delArm = false; s.modDel = null }
        s.drawer -> s.drawer = false
        s.editIdx != null -> s.editIdx = null
        else -> {
            Haptics.back() // prompt 34: Chat ‹ med lett haptikk
            s.open = false
            s.voice?.stop(); s.voice = null; s.rec = false
            ChatTts27.stop(); s.speaking = null
        }
    }
}

fun AppViewModel.chatToast27(t: String) {
    val s = chat27
    s.toast = t
    s.toastJob?.cancel()
    s.toastJob = viewModelScope.launch { delay(1700); s.toast = "" }
}

/* ---------- Innstillinger (personlige: GET/PATCH /api/chat/settings) ---------- */

fun AppViewModel.loadChatCfg27() {
    val s = chat27
    launch27 {
        val raw = runCatching { api27 { hlGet("/chat/settings") } }.getOrNull() ?: return@launch27
        val vals = HashMap<String, Any?>()
        runCatching { JSONObject(raw).let { o -> listOf("chat_my_data", "chat_ask_cloud", "chat_default_model", "chat_theme").forEach { k -> if (o.has(k)) vals[k] = o.opt(k) } } }
        s.myDataOn = cfgBool27(vals["chat_my_data"], false)
        s.askCloud = cfgBool27(vals["chat_ask_cloud"], true)
        (vals["chat_theme"] as? String)?.takeIf { it == "papir" || it == "noytral" }?.let { s.theme = it }
        (vals["chat_default_model"] as? String)?.takeIf { it.isNotBlank() }?.let { if (s.defModel == null) s.defModel = it }
        s.cfgLoaded = true
        if (!s.myDataOn) s.data = false
    }
}

/** Lagrer én personlig innstilling (chat_my_data, chat_ask_cloud, chat_default_model, chat_theme). */
fun AppViewModel.saveChatCfg27(key: String, value: Any) {
    launch27 { runCatching { api27 { request("PATCH", "/chat/settings", JSONObject().put(key, value), prefix = Api.HOMELAB) } } }
}

fun AppViewModel.setChatMyData27(on: Boolean) { chat27.myDataOn = on; if (!on) chat27.data = false; Haptics.select(); saveChatCfg27("chat_my_data", on) }
fun AppViewModel.setChatAskCloud27(on: Boolean) { chat27.askCloud = on; Haptics.select(); saveChatCfg27("chat_ask_cloud", on) }
fun AppViewModel.setChatTheme27(t: String) { chat27.theme = t; Haptics.select(); saveChatCfg27("chat_theme", t) }

/* ---------- Modeller ---------- */

fun AppViewModel.loadChatModels27() {
    val s = chat27
    launch27 {
        try {
            val raw = api27 { hlGet("/chat/models", timeout = 15_000) }
            val t = raw.trim()
            val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("models") ?: JSONArray() }
            s.models = arr.objs27().mapNotNull(::parseChatModel27)
            if (!t.startsWith("[")) JSONObject(t).optStr("default")?.let { s.defModel = it }
            if (s.defModel == null || s.models.none { it.id == s.defModel }) s.defModel = s.firstLocal27()?.id ?: s.models.firstOrNull()?.id ?: s.defModel
            s.unavailable = false; s.error = null
            s.pending?.let { p -> s.pending = null; if (s.input.trim() == p) sendChat27(p) }
        } catch (e: ApiException) {
            if (e.status == 404) s.unavailable = true else s.error = e.message
        } catch (e: Exception) { s.error = e.message ?: "Fikk ikke hentet modellene" }
    }
}

fun AppViewModel.selectChatModel27(id: String) {
    val s = chat27
    s.model = id
    s.defModel = id
    s.sheet = null
    Haptics.select()
    saveChatCfg27("chat_default_model", id)
    s.curId?.let { cid -> launch27 { runCatching { api27 { request("PATCH", "/chat/chats/" + chatEnc27(cid), JSONObject().put("model", id), prefix = Api.HOMELAB) } } } }
}

/** Henter en modell fra ollama.com med fremdrift (SSE {status, completed, total}). */
fun AppViewModel.pullChatModel27(name: String) {
    val s = chat27
    val n = name.trim()
    if (n.isEmpty() || n in s.pulls) return
    s.pulls = s.pulls + (n to 0f)
    viewModelScope.launch {
        try {
            chatSse27("/chat/models/pull", JSONObject().put("name", n)) { ev, d ->
                if (ev == "error") throw ApiException(d.optStr("error") ?: "Fikk ikke hentet $n")
                val tot = d.optDouble("total", 0.0)
                val c = d.optDouble("completed", 0.0)
                if (tot > 0) s.pulls = s.pulls + (n to (c / tot * 100).toFloat().coerceIn(0f, 100f))
            }
            flash("$n er lastet ned")
            loadChatModels27()
        } catch (e: CancellationException) { throw e } catch (e: ChatHttp27) {
            flash(if (e.code == 403) "Bare administrator kan hente modeller" else "Fikk ikke hentet $n: ${e.message}")
        } catch (e: ApiException) {
            flash("Fikk ikke hentet $n: ${e.message}")
        } catch (e: Exception) { flash("Fikk ikke hentet $n: ${e.message}") }
        finally { s.pulls = s.pulls - n }
    }
}

fun AppViewModel.deleteChatModel27(name: String) {
    val s = chat27
    if (s.modDel != name) { s.modDel = name; Haptics.tap(); return }
    s.modDel = null
    launch27 {
        try {
            api27 { hlDelete("/chat/models/" + chatEnc27(name)) }
            s.models = s.models.filter { it.id != name }
            if (s.defModel == name) s.defModel = s.firstLocal27()?.id ?: s.models.firstOrNull()?.id
            if (s.model == name) s.model = s.defModel
            flash("$name er slettet")
        } catch (e: ApiException) { flash(if (e.status == 403) "Bare administrator kan slette modeller" else "Fikk ikke slettet: ${e.message}") }
    }
}

/* ---------- Samtaler ---------- */

fun AppViewModel.loadChats27() {
    val s = chat27
    launch27 {
        try {
            val o = JSONObject(api27 { hlGet("/chat/chats") }.trim().let { if (it.startsWith("[")) "{\"chats\":$it}" else it })
            val chats = o.optJSONArray("chats").objs27().mapNotNull(::parseChatRow27)
            val pinned = o.optJSONArray("pinned").objs27().mapNotNull(::parseChatRow27).ifEmpty { chats.filter { it.pinned } }
            s.folders = o.optJSONArray("folders").objs27().mapNotNull { f ->
                val id = f.optStr("id") ?: return@mapNotNull null
                val inF = f.optJSONArray("chats").objs27().mapNotNull(::parseChatRow27).ifEmpty { chats.filter { it.folderId == id && !it.pinned } }
                ChatFolder27(id, f.optStr("name") ?: "Mappe", f.optBoolean("open", true), inF)
            }
            s.pinned = pinned
            val inFolders = s.folders.flatMap { f -> f.chats.map { it.id } }.toSet()
            s.chats = chats.filter { !it.pinned && it.id !in inFolders && pinned.none { p -> p.id == it.id } }
            // Prompt 34: «Kvitteringer og skanninger» (systemmappe) skilles ut og vises øverst under MAPPER.
            runCatching { splitScans34(o) }
            s.listLoaded = true
            s.unavailable = false
        } catch (e: ApiException) { if (e.status == 404) s.unavailable = true; s.listLoaded = true }
    }
}

/** Søk i samtaler (tittel og innhold) på serveren, 250 ms etter siste tastetrykk. */
fun AppViewModel.searchChats27(q: String) {
    val s = chat27
    s.q = q
    s.searchJob?.cancel()
    val t = q.trim()
    if (t.isEmpty()) { s.found = null; return }
    s.searchJob = viewModelScope.launch {
        delay(250)
        val r = runCatching {
            val raw = api27 { hlGet("/chat/chats?q=" + chatEnc27(t)) }.trim()
            val o = if (raw.startsWith("[")) JSONObject().put("chats", JSONArray(raw)) else JSONObject(raw)
            (o.optJSONArray("pinned").objs27() + o.optJSONArray("chats").objs27() + o.optJSONArray("folders").objs27().flatMap { it.optJSONArray("chats").objs27() })
                .mapNotNull(::parseChatRow27).distinctBy { it.id }
        }.getOrElse {
            val all = s.pinned + s.folders.flatMap { it.chats } + s.chats
            all.filter { it.title.contains(t, ignoreCase = true) }
        }
        if (s.q.trim() == t) s.found = r
    }
}

fun AppViewModel.newChat27() {
    val s = chat27
    stopChat27(silent = true)
    s.curId = null; s.msgs = emptyList(); s.title = ""; s.model = s.defModel; s.settings = s.defSettings
    s.att = emptyList(); s.input = ""; s.editIdx = null; s.drawer = false; s.guard = null
}

fun AppViewModel.openChatId27(id: String) {
    val s = chat27
    if (s.busy) stopChat27(silent = true)
    s.curId = id; s.drawer = false; s.editIdx = null; s.msgs = emptyList(); s.loadingChat = true
    val row = (s.pinned + s.folders.flatMap { it.chats } + s.chats + (s.found ?: emptyList())).firstOrNull { it.id == id }
    s.title = row?.title ?: ""
    s.model = row?.model?.takeIf { it.isNotBlank() } ?: s.defModel
    launch27 {
        try {
            val o0 = JSONObject(api27 { hlGet("/chat/chats/" + chatEnc27(id)) })
            val o = o0.optJSONObject("chat") ?: o0
            if (s.curId != id) return@launch27
            s.title = o.optStr("title") ?: s.title
            o.optStr("model")?.let { s.model = it }
            s.settings = ChatSet27.parse(o.optJSONObject("settings"), s.defSettings)
            s.msgs = (o.optJSONArray("messages") ?: o.optJSONObject("chat")?.optJSONArray("messages")).objs27().mapNotNull(::parseChatMsg27)
        } finally { s.loadingChat = false }
    }
}

private fun AppViewModel.patchChat27(id: String, body: JSONObject, reload: Boolean = true) {
    launch27 {
        api27 { request("PATCH", "/chat/chats/" + chatEnc27(id), body, prefix = Api.HOMELAB) }
        if (reload) loadChats27()
    }
}

/** Samtaleinnstillingene: gjelder denne samtalen, eller nye samtaler når ingen er valgt. */
fun AppViewModel.setChatSettings27(x: ChatSet27) {
    val s = chat27
    val id = s.curId
    if (id == null) {
        s.defSettings = x; s.settings = x
        prefs.set("chat27_def_" + (account?.id ?: ""), x.toJson().toString())
    } else {
        s.settings = x
        s.searchJob?.cancel()
        // Glidebrytere sender mange endringer: vent litt før PATCH.
        s.searchJob = viewModelScope.launch { delay(400); runCatching { api27 { request("PATCH", "/chat/chats/" + chatEnc27(id), JSONObject().put("settings", x.toJson()), prefix = Api.HOMELAB) } } }
    }
}

fun AppViewModel.renameChat27(id: String, t: String) {
    val v = t.trim()
    if (v.isEmpty()) return
    val s = chat27
    if (s.curId == id) s.title = v
    s.sheet = null
    patchChat27(id, JSONObject().put("title", v))
}

fun AppViewModel.pinChat27(id: String, on: Boolean) { chat27.sheet = null; Haptics.select(); patchChat27(id, JSONObject().put("pinned", on)) }

fun AppViewModel.moveChat27(id: String, folderId: String?) { Haptics.select(); patchChat27(id, JSONObject().put("folderId", folderId ?: JSONObject.NULL)) }

fun AppViewModel.newFolderMove27(id: String, name: String) {
    val n = name.trim()
    if (n.isEmpty()) return
    chat27.nf = ""
    launch27 {
        val r = JSONObject(api27 { hlPost("/chat/folders", JSONObject().put("name", n)) })
        val fid = r.optStr("id") ?: r.optJSONObject("folder")?.optStr("id")
        if (fid != null) api27 { request("PATCH", "/chat/chats/" + chatEnc27(id), JSONObject().put("folderId", fid), prefix = Api.HOMELAB) }
        loadChats27()
    }
}

fun AppViewModel.toggleFolder27(f: ChatFolder27) {
    val s = chat27
    val open = s.folderOpen[f.id] ?: f.open
    s.folderOpen = s.folderOpen + (f.id to !open)
    launch27 { runCatching { api27 { request("PATCH", "/chat/folders/" + chatEnc27(f.id), JSONObject().put("open", !open), prefix = Api.HOMELAB) } } }
}

fun AppViewModel.deleteChat27(id: String) {
    val s = chat27
    if (!s.delArm) { s.delArm = true; Haptics.tap(); return }
    s.delArm = false; s.sheet = null
    if (s.curId == id) newChat27()
    s.chats = s.chats.filter { it.id != id }; s.pinned = s.pinned.filter { it.id != id }
    launch27 { api27 { hlDelete("/chat/chats/" + chatEnc27(id)) }; loadChats27() }
}

private fun shareText27(ctx: Context, title: String, text: String) {
    val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text)
    ctx.startActivity(Intent.createChooser(i, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** Eksporter som Markdown: delingsarket med teksten (lagres i Filer, Disk, e-post …). */
fun AppViewModel.exportChat27(id: String, title: String) {
    chat27.sheet = null
    val ctx = getApplication<android.app.Application>()
    launch27 {
        val md = api27 { request("GET", "/chat/chats/" + chatEnc27(id) + "/export", prefix = Api.HOMELAB) }
        withContext(Dispatchers.Main) { shareText27(ctx, "$title.md", md) }
    }
}

fun AppViewModel.shareChat27(id: String, title: String) {
    chat27.sheet = null
    val ctx = getApplication<android.app.Application>()
    launch27 {
        val url = JSONObject(api27 { hlPost("/chat/chats/" + chatEnc27(id) + "/share") }).optStr("url") ?: throw ApiException("Fikk ingen lenke")
        withContext(Dispatchers.Main) { shareText27(ctx, title, url) }
    }
}

/* ---------- Vedlegg og kunnskapsbasen ---------- */

fun AppViewModel.loadKb27() {
    val s = chat27
    launch27 {
        val raw = runCatching { api27 { hlGet("/chat/knowledge") } }.getOrNull()?.trim()
        if (raw == null) { if (s.kb == null) s.kb = emptyList(); return@launch27 }
        val arr = if (raw.startsWith("[")) JSONArray(raw) else JSONObject(raw).let { it.optJSONArray("docs") ?: it.optJSONArray("items") ?: it.optJSONArray("files") ?: JSONArray() }
        s.kb = arr.objs27().mapNotNull { o ->
            val id = o.optStr("id") ?: return@mapNotNull null
            val size = o.optLong("size", 0L)
            val sub = o.optStr("description") ?: listOfNotNull(
                if (o.optStr("type") == "collection") "Samling i Open WebUI" else o.optStr("mime")?.substringAfter('/')?.uppercase()?.take(12),
                if (size > 0) (if (size >= 1_000_000) String.format(Locale("nb", "NO"), "%.1f MB", size / 1e6) else "${(size + 999) / 1000} kB") else null,
            ).joinToString(" · ")
            ChatDoc27(id, o.optStr("name") ?: o.optStr("title") ?: o.optStr("filename") ?: id, sub)
        }
    }
}

fun AppViewModel.toggleKbDoc27(d: ChatDoc27) {
    val s = chat27
    s.att = if (s.att.any { it.kind == "doc" && it.id == d.id }) s.att.filter { !(it.kind == "doc" && it.id == d.id) } else s.att + ChatAtt27(d.name, "doc", d.id)
}

private fun jpeg27(bmp: Bitmap, max: Int = 1600): String {
    val k = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
    val b = if (k < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt().coerceAtLeast(1), (bmp.height * k).toInt().coerceAtLeast(1), true) else bmp
    val out = ByteArrayOutputStream()
    b.compress(Bitmap.CompressFormat.JPEG, 85, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

private fun uriName27(ctx: Context, uri: Uri, def: String): String = runCatching {
    ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
}.getOrNull() ?: def

/** Bilder fra velgeren: skaleres til 1600 px og sendes som base64 til bildemodellen. */
fun AppViewModel.addChatImages27(uris: List<Uri>) {
    val s = chat27
    val ctx = getApplication<android.app.Application>()
    s.sheet = null
    launch27 {
        val add = withContext(Dispatchers.IO) {
            uris.mapNotNull { u ->
                runCatching {
                    val bytes = ctx.contentResolver.openInputStream(u)!!.use { it.readBytes() }
                    val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@runCatching null
                    ChatAtt27(uriName27(ctx, u, "bilde.jpg"), "img", b64 = jpeg27(bmp))
                }.getOrNull()
            }
        }
        s.att = s.att + add
    }
}

fun AppViewModel.addChatPhoto27(bmp: Bitmap) {
    val s = chat27
    s.sheet = null
    launch27 { val b = withContext(Dispatchers.Default) { jpeg27(bmp) }; s.att = s.att + ChatAtt27("Kamera.jpg", "img", b64 = b) }
}

/** Filer lastes opp til /api/chat/files (multipart) og sendes som files:[id]. */
fun AppViewModel.addChatFiles27(uris: List<Uri>) {
    val s = chat27
    val ctx = getApplication<android.app.Application>()
    s.sheet = null
    launch27 {
        for (u in uris) {
            val name = uriName27(ctx, u, "fil")
            val mime = ctx.contentResolver.getType(u) ?: "application/octet-stream"
            val bytes = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(u)?.use { it.readBytes() } } ?: continue
            try {
                val r = JSONObject(api27 { upload("/chat/files", listOf(Api.Part("file", name, mime, bytes)), prefix = Api.HOMELAB) })
                s.att = s.att + ChatAtt27(r.optStr("name") ?: name, "file", r.optStr("id"))
            } catch (e: ApiException) { flash("Fikk ikke lastet opp $name: ${e.message}") }
        }
    }
}

/** Opplasting til kunnskapsbasen: samme /api/chat/files med feltet knowledge=1, så hentes listen på nytt. */
fun AppViewModel.uploadKb27(uris: List<Uri>) {
    val ctx = getApplication<android.app.Application>()
    launch27 {
        for (u in uris) {
            val name = uriName27(ctx, u, "dokument")
            val mime = ctx.contentResolver.getType(u) ?: "application/octet-stream"
            val bytes = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(u)?.use { it.readBytes() } } ?: continue
            try {
                api27 { upload("/chat/files", listOf(Api.Part.text("knowledge", "1"), Api.Part("file", name, mime, bytes)), prefix = Api.HOMELAB) }
            } catch (e: ApiException) { flash("Fikk ikke lastet opp $name: ${e.message}") }
        }
        chat27.kb = null
        loadKb27()
    }
}

/* ---------- Sende og strømme ---------- */

/** Leser en SSE-strøm fra serveren (POST med JSON). onEvent får hendelsesnavn («message» uten navn) og data som JSON. */
internal suspend fun AppViewModel.chatSse27(path: String, body: JSONObject, conn: ((HttpURLConnection) -> Unit)? = null, onEvent: (String, JSONObject) -> Unit): Unit =
    withContext(Dispatchers.IO) {
        val c = URL(base.trimEnd('/') + Api.HOMELAB + path).openConnection() as HttpURLConnection
        conn?.invoke(c)
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 180_000
            c.doOutput = true
            c.setRequestProperty("Accept", "text/event-stream")
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            account?.token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = c.responseCode
            if (code >= 400) {
                val txt = c.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                val o = runCatching { JSONObject(txt) }.getOrNull()
                throw ChatHttp27(code, o, o?.optStr("error") ?: "Feil $code")
            }
            var ev = "message"
            val data = StringBuilder()
            c.inputStream.bufferedReader().use { r ->
                while (true) {
                    val line = r.readLine() ?: break
                    when {
                        line.isEmpty() -> {
                            if (data.isNotEmpty()) {
                                val d = data.toString()
                                data.setLength(0)
                                if (d.trim() != "[DONE]") runCatching { JSONObject(d) }.getOrNull()?.let { onEvent(ev, it) }
                            }
                            ev = "message"
                        }
                        line.startsWith(":") -> {}
                        line.startsWith("event:") -> ev = line.substring(6).trim()
                        line.startsWith("data:") -> { if (data.isNotEmpty()) data.append('\n'); data.append(line.substring(5).trimStart()) }
                    }
                }
                if (data.isNotEmpty()) runCatching { JSONObject(data.toString()) }.getOrNull()?.let { onEvent(ev, it) }
            }
        } finally { runCatching { c.disconnect() } }
    }

class ChatHttp27(val code: Int, val body: JSONObject?, msg: String) : Exception(msg)

/**
 * Sender en melding. opt: confirm (svaret på «Sende til …?»), noData (send uten mine data), editFrom (Rediger / Nytt svar:
 * meldingene er allerede kuttet, og serveren lagrer fra det punktet).
 */
fun AppViewModel.sendChat27(text: String, confirm: Boolean = false, noData: Boolean = false, editFrom: Int? = null, tool31: Boolean = true) {
    val s = chat27
    val t = text.trim()
    if (s.busy) return
    if (t.isEmpty() && editFrom == null) return
    // Prompt 31: Glimt ruter vær, kalender, avganger, pakker, finans, huskeliste og prøveperioder før modellen (svar med kort).
    if (tool31 && editFrom == null && !confirm && !noData && chatTool31(t)) return
    val m = s.curModel27() ?: run { chatToast27(if (s.unavailable) "Chat er ikke satt opp på serveren" else "Velg en modell først"); return }
    val useData = s.data && s.myDataOn && !noData
    val atts = s.att
    // Bilder krever en bildemodell.
    if (atts.any { it.kind == "img" } && !m.vision && m.sky.not() && s.models.any { it.vision }) chatToast27("${m.label} leser kanskje ikke bilder – velg en bildemodell")
    val tools = (if (useData) listOf("Finans", "Kalender", "Gjøremål") else emptyList()) + (if (s.web) listOf("Nettsøk") else emptyList()) +
        atts.filter { it.kind != "img" }.map { it.name }
    val history: List<ChatMsg27>
    if (editFrom == null) {
        history = s.msgs + ChatMsg27("user", t, atts.map { it.name }, atts.mapNotNull { it.b64 })
        s.msgs = history
        s.input = ""; s.att = emptyList()
    } else history = s.msgs
    s.sheet = null; s.guard = null
    val body = JSONObject().put("model", m.id).put("settings", s.settings.toJson()).put("webSearch", s.web).put("myData", useData)
        .put("messages", JSONArray().apply {
            history.forEachIndexed { i, x ->
                val o = JSONObject().put("role", x.role).put("content", x.content)
                // Bildene sendes bare med den nye meldingen.
                if (x.images.isNotEmpty() && i == history.lastIndex) o.put("images", JSONArray(x.images))
                put(o)
            }
        })
    s.curId?.let { body.put("chatId", it) }
    val files = atts.mapNotNull { a -> a.id?.takeIf { a.kind != "img" } }
    if (files.isNotEmpty()) body.put("files", JSONArray(files))
    editFrom?.let { body.put("editFrom", it) }
    if (confirm) body.put("confirmCloud", true)
    if (noData) body.put("withoutMyData", true)
    s.busy = true; s.stream = ""; s.streamTools = tools; s.stopped = false
    val t0 = System.currentTimeMillis()
    s.job = viewModelScope.launch {
        var used: List<String> = s.streamTools
        var facts41: List<ChatFact41> = emptyList()
        var tps = Double.NaN
        var ms = Double.NaN
        var err: String? = null
        try {
            chatSse27("/chat/send", body, conn = { c -> s.conn = c }) { ev, d ->
                when (ev) {
                    "meta" -> {
                        d.optStr("chatId")?.let { if (s.curId == null) s.curId = it }
                        d.optStr("title")?.let { if (s.title.isBlank()) s.title = it }
                    }
                    "delta" -> s.stream += d.optString("text", "")
                    "done" -> {
                        tps = d.optDouble("tokensPerSec", Double.NaN); ms = d.optDouble("ms", Double.NaN)
                        d.optJSONArray("used").strs27().takeIf { it.isNotEmpty() }?.let { used = it }
                        facts41 = parseFacts41(d.optJSONArray("facts"))
                    }
                    "facts" -> facts41 = parseFacts41(d.optJSONArray("facts"))
                    "error" -> err = d.optStr("error") ?: "Noe gikk galt"
                    else -> d.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("delta")?.optString("content", "")?.let { s.stream += it }
                }
            }
        } catch (e: CancellationException) {
            s.busy = false
            throw e
        } catch (e: ChatHttp27) {
            val eb = e.body
            if (e.code == 409 && eb != null && eb.optBoolean("needsConfirm")) {
                // Ikke sendt: meldingen legges tilbake i feltet, og arket spør.
                if (editFrom == null) { s.msgs = s.msgs.dropLast(1); s.input = t; s.att = atts }
                s.busy = false; s.stream = ""
                s.guard = ChatGuard27(eb.optStr("model") ?: m.name, eb.optJSONArray("leaves").strs27(), t, useData)
                s.skipAsk = false
                s.sheet = "guard"
                return@launch
            }
            err = if (e.code == 404) "Serveren har ikke Chat ennå. Oppdater Homelab-serveren." else e.message
        } catch (e: Exception) {
            if (!s.stopped) err = e.message ?: "Fikk ikke kontakt med serveren"
        }
        s.conn = null
        val full = s.stream
        val stopped = s.stopped
        if (ms.isNaN()) ms = (System.currentTimeMillis() - t0).toDouble()
        if (tps.isNaN() && full.isNotEmpty()) tps = (full.length / 4.0) / maxOf(.5, ms / 1000.0)
        val content = when {
            // Prompt 34: tydelig feil i stedet for et tomt svar («Glimt fikk ikke svar fra {modell}: {feil}»).
            err != null && full.isEmpty() -> aiErrText34(m.label, err) + "\n\nPrøv igjen, eller åpne AI-kontroll (Modeller ›) for å bytte modell."
            full.isBlank() && !stopped -> aiErrText34(m.label, "tomt svar")
            stopped -> "$full …"
            else -> full
        }
        s.msgs = s.msgs + ChatMsg27("assistant", content, model = m.id, used = used, stats = chatStats27(tps, ms, stopped), facts = facts41)
        s.busy = false; s.stream = ""; s.streamTools = emptyList()
        if (err != null) Haptics.error()
        loadChats27()
    }
}

/** Stopp: kobler fra strømmen; teksten så langt blir svaret. */
fun AppViewModel.stopChat27(silent: Boolean = false) {
    val s = chat27
    if (!s.busy) return
    s.stopped = true
    val c = s.conn
    viewModelScope.launch(Dispatchers.IO) { runCatching { c?.disconnect() } }
    if (silent) { s.job?.cancel(); s.busy = false; s.stream = "" }
}

/** Nytt svar på siste melding. */
fun AppViewModel.regenChat27() {
    val s = chat27
    val i = s.msgs.indexOfLast { it.role == "assistant" }
    if (i < 0 || s.busy) return
    s.msgs = s.msgs.take(i)
    sendChat27("", editFrom = s.msgs.indexOfLast { it.role == "user" }.coerceAtLeast(0))
}

/** Rediger: lagrer teksten og sender på nytt fra det punktet. */
fun AppViewModel.saveEditChat27() {
    val s = chat27
    val i = s.editIdx ?: return
    val t = s.editText.trim()
    if (t.isEmpty() || s.busy) return
    s.msgs = s.msgs.take(i) + s.msgs[i].copy(content = t)
    s.editIdx = null
    sendChat27("", editFrom = i)
}

/** «Sende til …?»: Send · Send uten mine data · Bruk lokal modell · Ikke spør igjen i denne samtalen. */
fun AppViewModel.guardChat27(choice: String) {
    val s = chat27
    val g = s.guard ?: return
    when (choice) {
        "send" -> {
            if (s.skipAsk) {
                s.settings = s.settings.copy(skipCloudAsk = true)
                s.curId?.let { id -> launch27 { runCatching { api27 { request("PATCH", "/chat/chats/" + chatEnc27(id), JSONObject().put("settings", s.settings.toJson()), prefix = Api.HOMELAB) } } } }
            }
            sendChat27(g.text, confirm = true)
        }
        "nodata" -> sendChat27(g.text, confirm = true, noData = true)
        "local" -> {
            val l = s.firstLocal27() ?: return
            s.model = l.id
            sendChat27(g.text)
        }
    }
}

/* ---------- Opplesing (TextToSpeech nb-NO) ---------- */

object ChatTts27 {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var queued: Pair<String, String>? = null
    private var onDone: (() -> Unit)? = null

    fun speak(ctx: Context, key: String, text: String, done: () -> Unit) {
        onDone = done
        val clean = text.replace("**", "").replace("`", "").replace(Regex("(?m)^\\s*[-*•]\\s+"), "")
        val t = tts
        if (t == null) {
            queued = key to clean
            tts = TextToSpeech(ctx.applicationContext, TextToSpeech.OnInitListener { st -> onInit(st) })
            return
        }
        if (!ready) { queued = key to clean; return }
        t.speak(clean, TextToSpeech.QUEUE_FLUSH, null, key)
    }

    private fun onInit(st: Int) {
        ready = st == TextToSpeech.SUCCESS
        val x = tts
        if (!ready || x == null) { onDone?.invoke(); return }
        x.language = Locale("nb", "NO")
        x.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { onDone?.invoke() }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { onDone?.invoke() }
        })
        val q = queued
        queued = null
        if (q != null) x.speak(q.second, TextToSpeech.QUEUE_FLUSH, null, q.first)
    }

    fun stop() { runCatching { tts?.stop() }; queued = null }
}

fun AppViewModel.speakChat27(key: String, text: String) {
    val s = chat27
    if (s.speaking == key) { ChatTts27.stop(); s.speaking = null; return }
    s.speaking = key
    ChatTts27.speak(getApplication<android.app.Application>(), key, text) { if (s.speaking == key) s.speaking = null }
}

/* ---------- Talegjenkjenning (SpeechRecognizer nb-NO) ---------- */

/** Lytter og skriver i feltet mens du snakker. Må lages og brukes på hovedtråden. */
class ChatVoice27(ctx: Context, private val s: Chat27State, private val onFail: (String) -> Unit) {
    private val sr: SpeechRecognizer = SpeechRecognizer.createSpeechRecognizer(ctx)
    private val before = s.input.trimEnd()

    init {
        sr.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) { s.rms = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f) }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                s.rec = false; s.rms = 0f
                if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT && error != SpeechRecognizer.ERROR_CLIENT)
                    onFail(if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) "Gi appen tilgang til mikrofonen" else "Fikk ikke tolket talen")
                destroy()
            }
            override fun onResults(results: Bundle?) { put(results); s.rec = false; s.rms = 0f; destroy() }
            override fun onPartialResults(partialResults: Bundle?) { put(partialResults) }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
    }

    private fun put(b: Bundle?) {
        val t = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() } ?: return
        s.input = if (before.isEmpty()) t else "$before $t"
    }

    fun start() {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "nb-NO")
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "nb-NO")
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        s.rec = true
        sr.startListening(i)
    }

    fun stop() { runCatching { sr.stopListening() }; s.rec = false; s.rms = 0f }
    fun destroy() { runCatching { sr.destroy() }; if (s.voice === this) s.voice = null }
}

/** Mikrofonen: start eller stopp. Tillatelsen spørres om i grensesnittet før dette kalles. */
fun AppViewModel.micChat27(ctx: Context) {
    val s = chat27
    s.voice?.let { it.stop(); return }
    if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { chatToast27("Talegjenkjenning finnes ikke på denne telefonen"); return }
    val v = ChatVoice27(ctx, s) { chatToast27(it) }
    s.voice = v
    runCatching { v.start() }.onFailure { s.rec = false; s.voice = null; chatToast27("Fikk ikke startet mikrofonen") }
}
