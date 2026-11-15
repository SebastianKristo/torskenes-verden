package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
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
