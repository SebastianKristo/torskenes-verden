package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.felles.nett.openSikker
import org.json.JSONArray
import org.json.JSONObject

/* ---------------- Chat: systemmappen ---------------- */

private val SCAN_KINDS34 = setOf("receipt", "label", "categorize", "finn", "scan", "barcode")

internal fun isScanFolder34(f: JSONObject): Boolean =
    b34(f, "sys", "system") == true && (s34(f, "kind") == null || s34(f, "kind") in setOf("scans", "scan", "receipts")) || s34(f, "name") == SCAN_F34 || s34(f, "kind") == "scans"

internal fun isScanChat34(c: JSONObject): Boolean =
    s34(c, "f", "folder", "folderName") == SCAN_F34 || (s34(c, "kind") in SCAN_KINDS34) || (b34(c, "sys") == true && c.has("ref"))

internal fun isReviewChat34(c: JSONObject): Boolean =
    b34(c, "review", "needsReview") == true || s34(c, "status", "receiptStatus") in setOf("review", "needs_review") ||
        objs34(c.optJSONArray("msgs")).getOrNull(1)?.let { m -> Regex("godkjenning", RegexOption.IGNORE_CASE).containsMatchIn(s34(m, "t", "content", "text") ?: "") } == true

/** Plukker ut systemmappen fra /chat/chats-svaret: mappen (sys) og samtaler med kind/f, uansett hvor serveren legger dem. */
internal fun AppViewModel.splitScans34(o: JSONObject) {
    val s = chat27
    val rawFolders = objs34(o.optJSONArray("folders"))
    val scanFolderIds = rawFolders.filter(::isScanFolder34).mapNotNull { s34(it, "id") }.toSet()
    val all = objs34(o.optJSONArray("chats")) + objs34(o.optJSONArray("pinned")) + rawFolders.flatMap { objs34(it.optJSONArray("chats")) }
    val scanIds = all.filter { c -> isScanChat34(c) || s34(c, "folderId", "folder_id") in scanFolderIds }.mapNotNull { s34(it, "id") }.toSet()
    val reviewIds = all.filter { s34(it, "id") in scanIds && isReviewChat34(it) }.mapNotNull { s34(it, "id") }.toSet()
    if (scanFolderIds.isEmpty() && scanIds.isEmpty()) { p34.scanFolder = null; p34.scanReview = 0; return }
    val rows = (s.folders.filter { it.id in scanFolderIds }.flatMap { it.chats } + s.chats.filter { it.id in scanIds } + s.folders.flatMap { it.chats }.filter { it.id in scanIds })
        .distinctBy { it.id }.sortedByDescending { it.updatedAt }
    val fid = scanFolderIds.firstOrNull() ?: "sys-scans"
    p34.scanFolder = ChatFolder27(fid, SCAN_F34, false, rows)
    // SERVER34 sender {review} på mappen (kvitteringer til godkjenning); ellers telles samtalene.
    p34.scanReview = rawFolders.filter(::isScanFolder34).firstNotNullOfOrNull { n34(it, "review")?.toInt() } ?: reviewIds.size
    s.folders = s.folders.filter { it.id !in scanFolderIds }.map { f -> f.copy(chats = f.chats.filter { it.id !in scanIds }) }
    s.chats = s.chats.filter { it.id !in scanIds }
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

/* ======================= Chat: «✦ Auto» ======================= */

/** GET /api/chat/models → auto:{id:'auto', label:'✦ Auto', picks}. Auto øverst, og standard én gang (autoMig41). */
fun AppViewModel.chatAuto41(o: JSONObject) {
    val s = chat27
    val au = o.optJSONObject("auto") ?: return
    val id = au.s37("id") ?: "auto"
    val m = ChatModel27(id, au.s37("label") ?: "✦ Auto", "lokal", "glimt", null, true, true, "Glimt velger beste modell for hver melding · lokalt når dine data er med")
    s.models = listOf(m) + s.models.filter { it.id != id }
    val sp = prefs41()
    val key = "autoMig41_" + (account?.id ?: "")
    if (!sp.getBoolean(key, false)) {
        sp.edit().putBoolean(key, true).apply()
        s.defModel = id
        if (s.curId == null) s.model = id
        saveChatCfg27("chat_default_model", id)
    }
}

/* ======================= Søkepillen → Chat ======================= */

/**
 * Åpner Chat (ny samtale) med spørsmålet allerede sendt. Er svaret i pillen ferdig, brukes det (spørres ikke på nytt);
 * er det på vei, venter Chat på det samme svaret («Glimt skriver …»). Bare hvis pillen lukkes før svaret kommer, spør Chat selv.
 */
/** Prompt 43 (claude-code-sok-ai-svarboble.md): samme svar i Chat med kilden under («Kilde: MET Norway»), ikke for Glimt/System-AI. */
private fun src43(source: String): String {
    val s = source.trim()
    return if (s.isBlank() || s.equals("Glimt", true) || s.equals("System-AI", true)) "" else "\n\n_Kilde: ${s}_"
}

fun AppViewModel.openChatWith41(q: String) {
    val a = p31.ans
    openChat27("")
    newChat27()
    val s = chat27
    s.title = q.take(48)
    val me = ChatMsg27("user", q)
    if (a != null && a.q == q && !a.busy && a.text.isNotBlank()) {
        s.msgs = listOf(me, ChatMsg27("assistant", a.text + src43(a.source), model = a.source.ifBlank { "Glimt" }))
        closeAns31(); return
    }
    if (a != null && a.q == q && a.busy) {
        s.msgs = listOf(me, ChatMsg27("assistant", "✦ Glimt skriver …"))
        launch41 {
            repeat(180) {
                delay(500)
                val n = p31.ans
                if (n == null || n.q != q) return@repeat
                if (!n.busy) {
                    if (s.msgs.size == 2 && s.msgs[0].content == q) s.msgs = listOf(me, ChatMsg27("assistant", n.text + src43(n.source), model = n.source.ifBlank { "Glimt" }))
                    closeAns31(); return@launch41
                }
            }
            closeAns31()
            if (s.msgs.size == 2 && s.msgs[0].content == q) { s.msgs = emptyList(); sendChat27(q) }
        }
        return
    }
    closeAns31()
    sendChat27(q)
}

/* ======================= Claude-import (claude-code-chat-claude-import.md) ======================= */

/**
 * POST /api/chat/import/claude (multipart: file = ZIP eller conversations.json, memory = tekst) → forhåndsvisning
 * {importId, conversations, messages, projects, memory[], range, items:[{id|uuid, title|name, date|updated_at, messages, imported}]}.
 * Serveren pakker ut og leser (store eksporter); appen sender bare fila. Maks 200 MB.
 */
fun AppViewModel.claudePreview43(name: String, mime: String, data: ByteArray?, memory: String) {
    val s = p43
    s.impErr = null; s.impDone = null; s.impBusy = true
    launch43 {
        try {
            if (data != null && data.size > 200L * 1024 * 1024) throw ApiException("Fila er større enn 200 MB", 413)
            val parts = buildList {
                if (data != null) add(Api.Part("file", name, mime, data))
                add(Api.Part.text("memory", memory))
            }
            val raw = api43 { upload("/chat/import/claude", parts, prefix = Api.HOMELAB, read = 180_000) }
            val o = JSONObject(raw)
            s.impPreview = o
            s.impPick = objs34(o.optJSONArray("items") ?: o.optJSONArray("conversations")).filter { !it.b43(false, "imported", "importedBefore") }
                .mapNotNull { it.s43("id", "uuid") }.toSet()
            val mem = o.optJSONArray("memory")
            s.impMemPick = (0 until (mem?.length() ?: 0)).filter { i -> mem?.optJSONObject(i)?.let { m -> m.b43(!m.b43(false, "exists"), "selected") } ?: true }.toSet()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.impErr = if (e.status == 404) "Serveren har ikke Claude-import ennå. Oppdater Homelab." else e.message
        } catch (e: Exception) { s.impErr = uiErr73(e, "Fikk ikke lest fila") }
        finally { s.impBusy = false }
    }
}

fun AppViewModel.claudeCommit43(withConvs: Boolean, withMem: Boolean) {
    val s = p43
    val o = s.impPreview ?: return
    val id = o.s43("importId", "id") ?: return
    val mem = o.optJSONArray("memory")
    s.impBusy = true; s.impErr = null
    launch43 {
        try {
            val memSel = JSONArray().apply { if (withMem && mem != null) s.impMemPick.sorted().forEach { i -> mem.opt(i)?.let { put(if (it is JSONObject) it.s43("text", "t") ?: it.toString() else it.toString()) } } }
            val body = JSONObject().put("conversationIds", JSONArray(if (withConvs) s.impPick.toList() else emptyList<String>())).put("memory", memSel)
                .put("importConversations", withConvs).put("importMemory", withMem).put("skipExisting", true)
            val r = runCatching { JSONObject(api43 { hlPost("/chat/import/claude/${enc43(id)}/commit", body) }) }.getOrElse { if (it is ApiException) throw it; JSONObject() }
            val nc = r.i43("conversations", "imported") ?: if (withConvs) s.impPick.size else 0
            val nm = r.i43("memory", "memoryAdded") ?: memSel.length()
            val skipped = r.i43("skipped")
            s.impDone = r.s43("text") ?: ("✓ $nc samtaler og $nm minnepunkter importert" + (skipped?.takeIf { it > 0 }?.let { " · $it var importert før og ble hoppet over" } ?: ""))
            s.impLastId = id
            s.impPreview = null
            Haptics.tap()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = uiErr73(e, "Importen feilet") }
        finally { s.impBusy = false }
    }
}

fun AppViewModel.claudeUndo43() {
    val s = p43
    val id = s.impLastId ?: return
    launch43 {
        try {
            api43 { hlPost("/chat/import/claude/${enc43(id)}/undo") }
            s.impDone = "Importen er angret."
            s.impLastId = null
            Haptics.select()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = uiErr73(e, "Fikk ikke angret") }
    }
}

/** «Vis flere»: neste 60 samtaler fra forhåndsvisningen (GET /api/chat/import/claude/:id?offset=&limit=60). */
fun AppViewModel.claudeMore43() {
    val s = p43
    val o = s.impPreview ?: return
    val id = o.s43("importId", "id") ?: return
    val have = o.optJSONArray("items") ?: JSONArray().also { o.put("items", it) }
    launch43 {
        try {
            val r = JSONObject(api43 { hlGet("/chat/import/claude/${enc43(id)}?offset=${have.length()}&limit=60") })
            val add = objs34(r.optJSONArray("items"))
            add.forEach { have.put(it) }
            s.impPick = s.impPick + add.filter { it.b43(!it.b43(false, "imported"), "selected") }.mapNotNull { it.s43("id", "uuid") }
            s.impPreview = JSONObject(o.toString())
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = e.message }
    }
}

/** «Prøv med en eksempel-eksport» (POST /api/chat/import/claude?sample=1). */
fun AppViewModel.claudeSample43() {
    val s = p43
    s.impErr = null; s.impDone = null; s.impBusy = true
    launch43 {
        try {
            val o = JSONObject(api43 { hlPost("/chat/import/claude?sample=1", JSONObject().put("sample", true)) })
            s.impPreview = o
            s.impPick = objs34(o.optJSONArray("items")).filter { !it.b43(false, "imported") }.mapNotNull { it.s43("id", "uuid") }.toSet()
            s.impMemPick = (0 until (o.optJSONArray("memory")?.length() ?: 0)).toSet()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.impErr = uiErr73(e, "Fikk ikke laget eksempelet") }
        finally { s.impBusy = false }
    }
}

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
    /** Prompt 50: lagrede vedlegg (miniatyr 480 px fra serveren), «Lest med …» og «Legg i Finans ›» (Chat50.kt). */
    val files50: List<ChatFile50> = emptyList(), val readWith50: String? = null, val finUrl50: String? = null,
    /** Prompt 52 (AND52A): tankegangen (think: string[]) og tiden den tok (thS). Sendes aldri tilbake til modellen. */
    val think52: List<String> = emptyList(), val thS52: Double? = null,
    /** Prompt 67 (ANDCHAT67): Glimt-svarets traceId (tommel opp/ned), valgknappene, bekreftelsen og samtale-id-en. */
    val trace67: String? = null, val choices67: Choices67? = null, val confirm67: Confirm67? = null, val conv67: String? = null,
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
data class ChatAtt27(
    val name: String, val kind: String, val id: String? = null, val b64: String? = null,
    /** Prompt 50: opplasting med fremdrift (Chat50.pct[key]), miniatyr og original fra /api/chat/files. */
    val key: String = "", val up: Boolean = false, val thumb: String? = null, val url: String? = null, val mime: String? = null,
)

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
    var data by mutableStateOf(true)
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
    // Prompt 41: «Mine data» er på som standard (chat_my_data = true når verdien mangler).
    var myDataOn by mutableStateOf(true)
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
    val think52 = parseThink52(o) // prompt 52: tankegangen lagres på meldingen
    val content = stripThink52(o.optString("content", ""))
    // Svarene har meta {model, tokensPerSec, ms, used, stopped} (server/ai/chat/routes.js).
    val meta = o.optJSONObject("meta") ?: o
    val used = meta.optJSONArray("used").strs27().ifEmpty { o.optJSONArray("tools").strs27() }
    // Prompt 50: bildevedleggene vises som miniatyrer (files50), ikke som navnepiller.
    val files50 = parseChatFiles50(o.optJSONArray("attachments"))
    val imgNames50 = files50.filter { it.isImage }.map { it.name }.toSet()
    val att = (o.optJSONArray("files").strs27() + o.optJSONArray("attachments").strs27()).distinct().filter { it !in imgNames50 && files50.none { f -> f.isImage && f.id == it } }
    val tps = meta.optDouble("tokensPerSec", Double.NaN)
    val ms = meta.optDouble("ms", Double.NaN)
    val stopped = meta.optBoolean("stopped", false)
    val stats = o.optStr("stats") ?: if (!tps.isNaN() || !ms.isNaN() || stopped) chatStats27(tps, ms, stopped) else null
    val imgs = o.optJSONArray("images")?.length() ?: 0
    val card = (o.optJSONObject("card") ?: meta.optJSONObject("card"))?.toString()
    return ChatMsg27(if (role == "assistant") "assistant" else "user", content, att + (if (imgs > 0) List(imgs) { "Bilde ${it + 1}" } else emptyList()),
        emptyList(), meta.optStr("model") ?: o.optStr("model"), used, stats, card, meta.optStr("tool") ?: o.optStr("tool"),
        facts = parseFacts41(meta.optJSONArray("facts")),
        files50 = files50, readWith50 = meta.optJSONObject("readWith")?.optStr("label"),
        finUrl50 = meta.optJSONObject("receipt")?.optJSONObject("action")?.optStr("url"),
        think52 = if (role == "assistant") think52.first else emptyList(), thS52 = if (role == "assistant") think52.second else null)
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
        s.myDataOn = cfgBool27(vals["chat_my_data"], true)
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
            // Prompt 41: «✦ Auto» øverst og som standard (én gangs flytting, autoMig41), før reserven under.
            if (!t.startsWith("[")) chatAuto41(JSONObject(t))
            if (s.defModel == null || s.models.none { it.id == s.defModel }) s.defModel = s.firstLocal27()?.id ?: s.models.firstOrNull()?.id ?: s.defModel
            s.unavailable = false; s.error = null
            s.pending?.let { p -> s.pending = null; if (s.input.trim() == p) sendChat27(p) }
        } catch (e: ApiException) {
            if (e.status == 404) s.unavailable = true else s.error = e.message
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { s.error = uiErr73(e, "Fikk ikke hentet modellene") }
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
    Glimt67.newChatConv() // prompt 67: ny samtale-id for Glimt
    s.data = s.myDataOn // Prompt 41: «Mine data» på i hver nye samtale
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

/** Bilder fra velgeren. Prompt 50: lastes opp med en gang (miniatyr + fremdrift), meldingen bærer id-ene (Chat50.kt). */
fun AppViewModel.addChatImages27(uris: List<Uri>) = addChat50(uris)

fun AppViewModel.addChatPhoto27(bmp: Bitmap) { chat27.sheet = null; addChatBitmap50(bmp) }

/** Filer lastes opp til /api/chat/files (multipart, med fremdrift) og sendes som files:[id]. */
fun AppViewModel.addChatFiles27(uris: List<Uri>) = addChat50(uris)

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
        val c = URL(base.trimEnd('/') + Api.HOMELAB + path).openSikker()
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
    // Prompt 50: et bilde alene kan sendes; vent til vedleggene er lastet opp.
    if (t.isEmpty() && editFrom == null && s.att.isEmpty()) return
    if (editFrom == null && s.uploading50) { chatToast27("Vent til vedleggene er lastet opp"); return }
    // Prompt 31: Glimt ruter vær, kalender, avganger, pakker, finans, huskeliste og prøveperioder før modellen (svar med kort).
    if (tool31 && editFrom == null && !confirm && !noData && s.att.isEmpty() && chatTool31(t)) return
    val m = s.curModel27() ?: run { chatToast27(if (s.unavailable) "Chat er ikke satt opp på serveren" else "Velg en modell først"); return }
    val useData = s.data && s.myDataOn && !noData
    val atts = s.att
    // Bilder krever en bildemodell (prompt 50: opplastede bilder velger serveren vision-modell/OCR for selv).
    if (atts.any { it.kind == "img" && it.id == null } && !m.vision && m.sky.not() && s.models.any { it.vision }) chatToast27("${m.label} leser kanskje ikke bilder – velg en bildemodell")
    val tools = (if (useData) listOf("Finans", "Kalender", "Gjøremål") else emptyList()) + (if (s.web) listOf("Nettsøk") else emptyList()) +
        atts.filter { it.kind != "img" }.map { it.name }
    val history: List<ChatMsg27>
    if (editFrom == null) {
        val f50 = atts.filter { it.kind == "img" && it.id != null }.map { a -> ChatFile50(a.id!!, a.name, a.mime ?: "image/jpeg", "image", a.url, a.thumb, null, null) }
        history = s.msgs + ChatMsg27("user", t, atts.filter { it.kind != "img" || it.id == null }.map { it.name }, atts.mapNotNull { it.b64 }, files50 = f50)
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
                // Prompt 50: bildene er lastet opp på forhånd – meldingene bærer bare id-ene.
                if (x.files50.isNotEmpty()) o.put("attachments", JSONArray(x.files50.map { it.id }))
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
    Chat50.busyReadWith = null
    Think52.reset() // prompt 52: «✦ Tenker … 2,1 s»
    val t0 = System.currentTimeMillis()
    s.job = viewModelScope.launch {
        var used: List<String> = s.streamTools
        var facts41: List<ChatFact41> = emptyList()
        var tps = Double.NaN
        var ms = Double.NaN
        var err: String? = null
        var read50: String? = null
        var fin50: String? = null
        try {
            chatSse27("/chat/send", body, conn = { c -> s.conn = c }) { ev, d ->
                when (ev) {
                    "meta" -> {
                        d.optStr("chatId")?.let { if (s.curId == null) s.curId = it }
                        d.optStr("title")?.let { if (s.title.isBlank()) s.title = it }
                        d.optJSONObject("readWith")?.optStr("label")?.let { read50 = it; Chat50.busyReadWith = it } // prompt 50
                    }
                    // Prompt 52: tankegangen strømmer som egne hendelser, som `thinking` på delta eller i <think>…</think>.
                    // SRV52: {step, i, source:"model"|"glimt", s} – én linje per steg; eldre/andre: {text}/{thinking} som fri tekst.
                    "thinking", "think" -> d.optStr("step")?.let { Think52.addStep(it) } ?: Think52.addText(d.optStr("text") ?: d.optStr("thinking"))
                    "thinking_done" -> Think52.markAnswer()
                    "step", "think_step" -> Think52.addStep(d.optStr("text") ?: d.optStr("step"))
                    "delta" -> { Think52.addText(d.optStr("thinking")); s.stream += Think52.filter(d.optString("text", "")) }
                    "done" -> {
                        d.optJSONArray("think")?.let { a -> Think52.setAll((0 until a.length()).mapNotNull { a.optString(it).trim().takeIf { t -> t.isNotEmpty() } }) }
                        tps = d.optDouble("tokensPerSec", Double.NaN); ms = d.optDouble("ms", Double.NaN)
                        d.optJSONArray("used").strs27().takeIf { it.isNotEmpty() }?.let { used = it }
                        facts41 = parseFacts41(d.optJSONArray("facts"))
                        d.optJSONObject("readWith")?.optStr("label")?.let { read50 = it } // prompt 50: «Lest med …»
                        d.optJSONObject("receipt")?.optJSONObject("action")?.optStr("url")?.let { fin50 = it } // «Legg i Finans ›»
                    }
                    "facts" -> facts41 = parseFacts41(d.optJSONArray("facts"))
                    "error" -> err = d.optStr("error") ?: "Noe gikk galt"
                    else -> d.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("delta")?.let { dl ->
                        Think52.addText(dl.optStr("reasoning_content") ?: dl.optStr("reasoning")) // prompt 52
                        s.stream += Think52.filter(dl.optString("content", ""))
                    }
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
            if (!s.stopped) err = uiErr73(e, "Fikk ikke kontakt med serveren")
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
        Think52.markAnswer()
        s.msgs = s.msgs + ChatMsg27("assistant", content, model = m.id, used = used, stats = chatStats27(tps, ms, stopped), facts = facts41, readWith50 = read50, finUrl50 = fin50,
            think52 = Think52.lines, thS52 = Think52.secs().takeIf { Think52.lines.isNotEmpty() })
        s.busy = false; s.stream = ""; s.streamTools = emptyList(); Chat50.busyReadWith = null
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
    // Prompt 67: Glimt strømmer svaret – be serveren stoppe også (POST /api/glimt/agent/stream/stop {requestId}).
    Glimt67.chatRid?.let { stopStream67(it, null) }
    if (silent) { s.job?.cancel(); s.busy = false; s.stream = ""; Glimt67.chatLive = false; Glimt67.chatStatus = null }
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
fun AppViewModel.micChat27(ctx: Context, hold: Boolean = false) {
    val s = chat27
    s.voice?.let { it.stop(); return }
    // Prompt 56 (AND56): serveren skriver ned (Voice56.kt) når den har en motor; ellers telefonen som før (stille reserve).
    if (micServer56(ctx, Voice56.CHAT, hold) { t -> s.input = join56(s.input, t) }) return
    if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { chatToast27("Talegjenkjenning finnes ikke på denne telefonen"); return }
    val v = ChatVoice27(ctx, s) { chatToast27(it) }
    s.voice = v
    runCatching { v.start() }.onFailure { s.rec = false; s.voice = null; chatToast27("Fikk ikke startet mikrofonen") }
}

/** Ett faktum: «Vær · New York · neste time · vind 6 m/s, kast 9 m/s · Open-Meteo». */
data class ChatFact41(
    val tool: String, val place: String, val whenLabel: String, val label: String, val source: String, val failed: Boolean,
) {
    val headLine: String
        get() {
            val name = when (tool) { "weather" -> "Vær"; "time" -> "Tid"; "sun" -> "Sol"; else -> tool }
            return listOf(name, place, if (failed) "" else whenLabel).filter { it.isNotBlank() }.joinToString(" · ")
        }
}

fun parseFacts41(a: JSONArray?): List<ChatFact41> {
    if (a == null) return emptyList()
    val out = mutableListOf<ChatFact41>()
    for (i in 0 until a.length()) {
        val o = a.optJSONObject(i) ?: continue
        val label = o.optString("label", "").takeIf { it.isNotBlank() } ?: continue
        out += ChatFact41(o.optString("tool", ""), o.optString("place", ""), o.optString("when", ""), label,
            if (o.isNull("source")) "" else o.optString("source", ""), o.has("error") && !o.isNull("error"))
    }
    return out
}

/** «Brukte …»-chipene uten dem kortene allerede viser. */
fun usedWithoutFacts41(used: List<String>, facts: List<ChatFact41>): List<String> =
    if (facts.isEmpty()) used else used.filterNot { it.startsWith("Vær · ") || it.startsWith("Tid · ") || it.startsWith("Sol · ") }

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
    val c = URL(base.trimEnd('/') + Api.HOMELAB + "/chat/files").openSikker()
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
