package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.time.Instant
import java.time.LocalDate
import java.util.Locale
import java.util.UUID

/*
 * Prompt 67 (ANDCHAT67): Glimt-chatten og Glimt-søket på Hjem tar igjen web (prompt 49 del 1, 3 og 4). Formene står i
 * $S/SERVER59-API.md (strømming), $S/SERVER60-API.md (samtaler) og $S/SERVER61-API.md (tommel opp/ned). Web: public/js/stream59.js,
 * convo60.js, recipes61.js og chat.js (sendTool).
 *  - POST /api/glimt/agent/stream (SSE: start · status · token · done · error), lest med plattformens HttpURLConnection og samme
 *    innlogging (Bearer-tokenet til kontoen) som Chat (chatSse27). Tokenet logges aldri.
 *  - Stopp: POST /api/glimt/agent/stream/stop {requestId} + koble fra strømmen. Det som er skrevet beholdes, merket «Stoppet».
 *  - Reserve: 404/405 (eldre server) → de gamle kallene (POST /api/glimt/agent på Hjem, /api/assist i Chat) i 10 min.
 *  - conversationId / conversationKind / choice i body; valgknapper fra `choices` (maks 5).
 *  - Tommel opp/ned: POST /api/glimt/recipes/feedback {traceId, vote}.
 *  - Chat: verktøysvar som er strømmet lagres i samtalen med POST /api/glimt/agent/stream/save → {chatId}.
 * Grensesnittet ligger i ui/Convo67Ui.kt (statuslinje, valgknapper, tommel).
 */

/* ======================= Typer ======================= */

data class ChoiceItem67(val id: String, val label: String, val text: String)

/** `choices` fra svaret (SERVER60 §2). expiresAt i ms (null = ukjent). */
data class Choices67(val setId: String?, val question: String, val items: List<ChoiceItem67>, val expiresAt: Long?)

/** Det som sendes når brukeren trykker på et valg: teksten og (når valget fortsatt gjelder) {setId, id}. */
data class Pick67(val text: String, val setId: String?, val id: String?)

/** Bekreftelse Glimt ber om (confirm.token) og teksten på knappen. */
data class Confirm67(val token: String, val summary: String)

/** Stopp er trykket: det som er strømmet så langt. */
class Stopped67(val partial: String) : Exception("Stoppet")

/** Svaret fra Glimt-motoren (done eller POST /api/glimt/agent) gjort om til det appen viser. */
data class Agent67(
    val text: String, val intent: String, val module: String, val toolName: String?, val tool: String?, val card: JSONObject?,
    val choices: Choices67?, val confirm: Confirm67?, val traceId: String?, val plain: Boolean, val ms: Long?, val cached: Boolean,
    val cacheAgeMs: Long?, val open: JSONObject?, val raw: JSONObject,
)

/* ======================= Tilstand ======================= */

object Glimt67 {
    private const val OFF_MS = 10 * 60_000L
    @Volatile private var offUntil = 0L
    /** Har serveren strømmingen? (false i 10 min etter 404/405). */
    fun streamOn(): Boolean = System.currentTimeMillis() >= offUntil
    internal fun streamOff() { offUntil = System.currentTimeMillis() + OFF_MS }

    /* Glimt-søket på Hjem: statuslinja og teksten mens svaret strømmer. */
    var homeStatus by mutableStateOf<String?>(null)
    var homeText by mutableStateOf("")
    /** Valgknappene og tommelen under svaret i boblen. */
    var homeChoices by mutableStateOf<Choices67?>(null)
    /** Prompt 70: kort A for svaret som vises (svarteksten → card {k:'cal70'}), ui/Cal70Card.kt. */
    var homeCard70 by mutableStateOf<Pair<String, JSONObject>?>(null)
    var homeTrace by mutableStateOf<String?>(null)
    /** requestId for svaret som strømmer nå (null = ingen). Stopp-knappen vises mens den er satt. */
    var homeRid by mutableStateOf<String?>(null)
    @Volatile internal var homeConn: HttpURLConnection? = null
    @Volatile internal var homeStop = false
    /** Valget som ble trykket i boblen; brukes av neste spørsmål med samme tekst. */
    @Volatile internal var pendingPick: Pick67? = null

    /* Glimt i Chat */
    var chatLive by mutableStateOf(false)
    var chatStatus by mutableStateOf<String?>(null)
    @Volatile internal var chatRid: String? = null

    /* Tommel opp/ned: traceId → up|down, og kvitteringen («Takk!»). */
    val votes = mutableStateMapOf<String, String>()
    val voteMsg = mutableStateMapOf<String, String>()

    /* Samtale-id-er (SERVER60 §1) */
    private const val HOME_TTL = 30 * 60_000L
    private var homeId: String? = null
    private var homeAt = 0L
    private var chatPending: String? = null
    private val chatMap = HashMap<String, String>()

    private val RE = Regex("^[A-Za-z0-9_.:-]{1,80}$")
    fun valid(id: String?): String? = id?.takeIf { RE.matches(it) }

    private val rnd = SecureRandom()
    fun rand(n: Int = 12): String { val a = "abcdefghijklmnopqrstuvwxyz0123456789"; return (1..n).map { a[rnd.nextInt(a.length)] }.joinToString("") }

    /** Id for Glimt-søket: samme så lenge feltet brukes, ny etter 30 min uten bruk. */
    @Synchronized fun homeConv(): String {
        val now = System.currentTimeMillis()
        if (homeId == null || now - homeAt > HOME_TTL) homeId = "home-" + rand(12)
        homeAt = now
        return homeId!!
    }
    /** Feltet er tømt med vilje: neste spørsmål starter en ny samtale. */
    @Synchronized fun resetHomeConv() { homeId = null; homeAt = 0L }

    /** Samtale-id for chatten (curId = serverens chat-id eller null for ny chat). */
    @Synchronized fun chatConv(curId: String?): String {
        if (curId.isNullOrBlank()) { if (chatPending == null) chatPending = "c-" + rand(12); return chatPending!! }
        chatMap[curId]?.let { return it }
        return valid(curId) ?: ("c-" + curId.replace(Regex("[^A-Za-z0-9_.:-]"), "").take(60).ifEmpty { rand(12) })
    }
    /** Chatten har fått id: knytt den til samtale-id-en som ble brukt. */
    @Synchronized fun bindConv(curId: String?, conv: String?) {
        if (curId.isNullOrBlank() || conv == null) return
        if (curId != conv) chatMap[curId] = conv
        if (chatPending == conv) chatPending = null
    }
    /** Ny chat: neste melding får en ny samtale-id. */
    @Synchronized fun newChatConv() { chatPending = null }

    fun rid(): String = "a67-" + UUID.randomUUID().toString()
}

/* ======================= Tolking ======================= */

private fun JSONObject.s67(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

private fun JSONArray?.objs67(): List<JSONObject> = (0 until (this?.length() ?: 0)).mapNotNull { this!!.optJSONObject(it) }

/** `choices` (SERVER60 §2). null når det ikke finnes eller er tomt. */
fun parseChoices67(c: JSONObject?): Choices67? {
    if (c == null) return null
    val items = c.optJSONArray("items").objs67().mapIndexedNotNull { i, x ->
        val label = x.s67("label") ?: x.s67("text") ?: return@mapIndexedNotNull null
        ChoiceItem67(x.s67("id") ?: "${i + 1}", label, x.s67("text") ?: label)
    }.take(5)
    if (items.isEmpty()) return null
    val exp = c.s67("expiresAt")?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
    return Choices67(c.s67("setId"), c.s67("question") ?: "", items, exp)
}

/** Valget som sendes: utløpt eller uten setId → bare teksten. */
fun pick67(ch: Choices67, item: ChoiceItem67, now: Long = System.currentTimeMillis()): Pick67 {
    val live = ch.setId != null && (ch.expiresAt == null || ch.expiresAt >= now)
    return Pick67(item.text, if (live) ch.setId else null, if (live) item.id else null)
}

/** Tekst så langt uten halv markdown: en uavsluttet «**» tas bort til den lukkes (som tidy59 på web). */
fun tidy67(t: String): String {
    val n = Regex("\\*\\*").findAll(t).count()
    if (n % 2 == 0) return t.replace(Regex("(^|[^*])\\*$"), "$1")
    val i = t.lastIndexOf("**")
    return t.substring(0, i) + t.substring(i + 2)
}

private val SRC67 = mapOf("calendar" to "Kalender", "tasks" to "Huskeliste", "finance" to "Finans", "weather" to "Vær", "ruter" to "Avganger",
    "family" to "Familie", "media" to "Media", "study" to "Studie")
private val WD67 = listOf("MAN", "TIR", "ONS", "TOR", "FRE", "LØR", "SØN")
private val WDL67 = listOf("Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag")
private val MNL67 = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

/** Svaret fra Glimt-motoren i samme form som web (fromAgent59): kort for kalender/gjøremål, gamle svar med sitt eget kort. */
fun agentView67(d: JSONObject): Agent67 {
    val actions = d.optJSONArray("actions").objs67()
    val results = d.optJSONArray("results").objs67()
    val askQ = d.optJSONObject("ask")?.s67("question")
    val confirm = d.optJSONObject("confirm")?.let { c -> c.s67("token")?.let { Confirm67(it, c.s67("summary") ?: "Ja, gjør det") } }
    val choices = parseChoices67(d.optJSONObject("choices"))
    val failed = actions.firstOrNull { it.s67("status") == "failed" }?.s67("error")
    var text = d.s67("reply") ?: d.s67("text") ?: (if (askQ == null) failed else null) ?: ""
    d.s67("joke")?.let { j -> if (!text.contains(j)) text = "$text $j".trim() }
    if (askQ != null && choices == null && !text.contains(askQ)) text = if (text.isBlank()) askQ else "$text\n$askQ"
    val intent = d.s67("intent") ?: ""
    val module = d.s67("module") ?: ""
    val web = d.optJSONObject("nav")?.optBoolean("web", false) == true
    val plain = actions.isEmpty() && results.isEmpty() && askQ == null && confirm == null && choices == null && !web
    val trace = d.s67("traceId")
    val ms = if (d.has("ms") && !d.isNull("ms")) d.optLong("ms") else null
    val cached = d.optBoolean("cached", false)
    val age = d.optJSONObject("cache")?.let { if (it.has("ageMs")) it.optLong("ageMs") else null }
    val open = d.optJSONObject("open")
    // Gamle svar (vær, avganger, pakker …) kommer med sitt eget kort i legacyAnswer.
    d.optJSONObject("legacyAnswer")?.let { L0 ->
        val L = L0.optJSONObject("result") ?: L0.optJSONObject("answer") ?: L0
        val card = L.optJSONObject("card")
        return Agent67(text.ifBlank { L.s67("text") ?: "" }, L.s67("intent") ?: intent, module, L.s67("tool"), L.s67("tool") ?: card?.let { cardTool31(it) } ?: "Glimt",
            card, choices, confirm, trace, false, ms ?: (if (L.has("ms")) L.optLong("ms") else null), cached, age, open ?: L.optJSONObject("open"), d)
    }
    val a0 = actions.firstOrNull()
    val toolName = a0?.s67("tool")
    var card: JSONObject? = null
    val evs = results.filter { it.s67("kind") == "event" }
    val c70 = cal70Of(a0) // prompt 70: kort A (Cal70.kt / ui/Cal70Card.kt)
    if (c70 != null) card = c70
    else if (evs.isNotEmpty() || (toolName?.startsWith("calendar.") == true && askQ == null)) { // prompt 70: «Hvilken dag?» uten dagens kalender
        val ds = a0?.optJSONObject("result")?.s67("from") ?: evs.firstOrNull()?.s67("date") ?: LocalDate.now(OSLO31).toString()
        val dt = runCatching { LocalDate.parse(ds.take(10)) }.getOrNull() ?: LocalDate.now(OSLO31)
        card = JSONObject().put("k", "calendar").put("date", dt.toString()).put("wd", WD67[dt.dayOfWeek.value - 1]).put("n", dt.dayOfMonth.toString())
            .put("t", "${WDL67[dt.dayOfWeek.value - 1]} ${dt.dayOfMonth}. ${MNL67[dt.monthValue - 1]}")
            .put("sub", "${evs.size} ${if (evs.size == 1) "hendelse" else "hendelser"}")
            .put("items", JSONArray().apply {
                evs.take(8).forEach { e ->
                    put(JSONObject().put("id", e.opt("id") ?: JSONObject.NULL).put("time", if (e.optBoolean("allDay", false)) "Hele" else (e.s67("time") ?: ""))
                        .put("title", e.s67("title") ?: "").put("color", e.opt("color") ?: JSONObject.NULL).put("place", e.opt("place") ?: JSONObject.NULL)
                        .put("date", e.opt("date") ?: JSONObject.NULL))
                }
            })
    } else if (toolName?.startsWith("tasks.") == true) {
        val ts = results.filter { it.s67("kind") == "task" }
        card = JSONObject().put("k", "tasks").put("count", ts.size).put("items", JSONArray().apply {
            ts.forEach { x -> put(JSONObject().put("id", x.opt("id") ?: JSONObject.NULL).put("title", x.s67("title") ?: "").put("due", x.opt("date") ?: JSONObject.NULL).put("done", x.optBoolean("done", false))) }
        })
    }
    return Agent67(text.ifBlank { if (plain) "" else "Ferdig." }, intent, module, toolName, SRC67[module] ?: "Glimt", card, choices, confirm, trace, plain, ms, cached, age, open, d)
}

/** Prat (ingen handling, treff, spørsmål eller bekreftelse): i Chat går den videre til språkmodellen. */
fun Agent67.isChat(): Boolean = plain && intent in setOf("chat", "ask", "")

/** «Ferskt svar fra cachen (3 min gammelt)» når svaret kom fra svar-cachen. */
fun Agent67.cacheNote(): String? {
    if (!cached) return null
    val m = Math.round((cacheAgeMs ?: 0L) / 60000.0)
    return if (m < 1) "Ferskt svar fra cachen (under ett minutt gammelt)" else "Ferskt svar fra cachen ($m min gammelt)"
}

/* ======================= Strømmen ======================= */

/** Body til /agent og /agent/stream: tekst, modul, requestId og samtalefeltene (bare de som er satt). */
fun agentBody67(text: String, module: String, rid: String, conv: String?, kind: String?, pick: Pick67?): JSONObject {
    val b = JSONObject().put("text", text.take(1000)).put("module", module).put("requestId", rid)
    Glimt67.valid(conv)?.let { id ->
        b.put("conversationId", id)
        if (kind == "chat" || kind == "search") b.put("conversationKind", kind)
    }
    if (pick?.setId != null && pick.id != null) b.put("choice", JSONObject().put("setId", pick.setId).put("id", pick.id))
    return b
}

/**
 * POST /api/glimt/agent/stream. Returnerer done (hele svaret). null = serveren har ikke strømmingen (404/405 → husket i 10 min) eller
 * svarte med noe annet enn SSE uten JSON. Kaster Stopped67 ved Stopp (499 eller [stopped] satt), ApiException ved andre feil
 * (429, 400 …, med serverens tekst). Avbrytes korutinen, kobles strømmen fra (serveren avbryter da modellkallet).
 */
internal suspend fun AppViewModel.stream67(
    body: JSONObject, stopped: () -> Boolean, onConn: (HttpURLConnection?) -> Unit,
    onStatus: (String) -> Unit, onText: (String) -> Unit,
): JSONObject? {
    if (!Glimt67.streamOn()) return null
    val token = account?.token
    val url = base.trimEnd('/') + Api.HOMELAB + "/glimt/agent/stream"
    val job = currentCoroutineContext()[Job]
    return withContext(Dispatchers.IO) {
        val c = URL(url).openConnection() as HttpURLConnection
        onConn(c)
        val h = job?.invokeOnCompletion { if (it != null) runCatching { c.disconnect() } }
        val txt = StringBuilder()
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 10_000
            c.readTimeout = 120_000 // «: ping» hvert 15. s
            c.doOutput = true
            c.setRequestProperty("Accept", "text/event-stream")
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = c.responseCode
            if (code == 404 || code == 405) { Glimt67.streamOff(); return@withContext null }
            if (code >= 400) {
                val t = c.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                val o = runCatching { JSONObject(t) }.getOrNull()
                throw ApiException(o?.s67("error") ?: if (code == 429) "Glimt jobber med mye nå. Prøv igjen om litt." else "Glimt svarte ikke (feil $code).", code)
            }
            val ct = c.contentType ?: ""
            if (!ct.contains("text/event-stream")) {
                // Uventet: vanlig JSON (f.eks. en proxy). Bruk den som svaret.
                val t = c.inputStream.bufferedReader().use { it.readText() }
                return@withContext runCatching { JSONObject(t) }.getOrNull()
            }
            var done: JSONObject? = null
            var err: JSONObject? = null
            var ev = "message"
            val data = StringBuilder()
            fun fire() {
                if (data.isEmpty()) { ev = "message"; return }
                val d = runCatching { JSONObject(data.toString()) }.getOrNull()
                val e = ev
                data.setLength(0); ev = "message"
                if (d == null) return
                when (e) {
                    "status" -> d.s67("text")?.let(onStatus)
                    "token" -> { val t = d.optString("t", ""); if (t.isNotEmpty()) { txt.append(t); onText(tidy67(txt.toString())) } }
                    "done" -> done = d
                    "error" -> err = d
                }
            }
            try {
                c.inputStream.bufferedReader().use { r ->
                    while (true) {
                        val line = r.readLine() ?: break
                        when {
                            line.isEmpty() -> fire()
                            line.startsWith(":") -> {}
                            line.startsWith("event:") -> ev = line.substring(6).trim()
                            line.startsWith("data:") -> { if (data.isNotEmpty()) data.append('\n'); data.append(line.substring(5).removePrefix(" ")) }
                        }
                        if (done != null || err != null) { if (line.isEmpty()) break }
                    }
                    fire()
                }
            } catch (e: java.io.IOException) {
                if (stopped()) throw Stopped67(tidy67(txt.toString()))
                if (job?.isCancelled == true) throw CancellationException("Avbrutt")
                throw ApiException("Glimt ble avbrutt før svaret var ferdig. Prøv igjen.", 0)
            }
            val e = err
            done ?: run {
                if (stopped() || e?.optInt("status") == 499) throw Stopped67(tidy67(txt.toString()))
                if (e != null) throw ApiException(e.s67("error") ?: "Glimt fikk ikke gjort det akkurat nå. Prøv igjen.", e.optInt("status", 502))
                if (job?.isCancelled == true) throw CancellationException("Avbrutt")
                throw ApiException("Glimt ble avbrutt før svaret var ferdig. Prøv igjen.", 0)
            }
        } catch (e: java.io.IOException) {
            if (stopped()) throw Stopped67(tidy67(txt.toString()))
            throw ApiException(e.message ?: "Fikk ikke kontakt med Glimt", 0)
        } finally {
            h?.dispose()
            onConn(null)
            runCatching { c.disconnect() }
        }
    }
}

/** Stopp: ber serveren stoppe (POST /stream/stop {requestId}) og kobler fra strømmen. Feil ignoreres. */
internal fun AppViewModel.stopStream67(rid: String?, conn: HttpURLConnection?) {
    launch31 {
        withContext(Dispatchers.IO) { runCatching { conn?.disconnect() } }
        if (rid != null) runCatching { api31 { request("POST", "/glimt/agent/stream/stop", JSONObject().put("requestId", rid), prefix = Api.HOMELAB, timeout = 5000, read = 8000) } }
    }
}

/** Stopp-knappen i boblen på Hjem. */
fun AppViewModel.stopHome67() {
    if (p31.ans?.busy != true) return
    Haptics.tap()
    Glimt67.homeStop = true
    stopStream67(Glimt67.homeRid, Glimt67.homeConn)
}

/** Lagrer et strømmet verktøysvar i Chat-samtalen (POST /api/glimt/agent/stream/save). → chatId, eller null (feil stopper ikke svaret). */
internal suspend fun AppViewModel.saveStream67(q: String, a: Agent67, chatId: String?): String? {
    val b = JSONObject().put("q", q.take(4000)).put("text", a.text.take(20_000)).put("ms", a.ms ?: 0L)
    chatId?.takeIf { Regex("^[\\w-]{1,80}$").matches(it) }?.let { b.put("chatId", it) }
    a.card?.let { b.put("card", it) }
    a.tool?.let { b.put("tool", it) }
    (a.toolName ?: a.intent.takeIf { it.isNotBlank() })?.let { b.put("intent", it.take(40)) }
    return try {
        val raw = api31 { request("POST", "/glimt/agent/stream/save", b, prefix = Api.HOMELAB, timeout = 6000, read = 15_000) }
        runCatching { JSONObject(raw).s67("chatId") }.getOrNull()
    } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
}

/* ======================= Tommel opp/ned ======================= */

/** Tommel opp/ned (trykk på samme igjen = angre). POST /api/glimt/recipes/feedback {traceId, vote}. */
fun AppViewModel.vote67(traceId: String, vote: String) {
    val prev = Glimt67.votes[traceId]
    val next: String? = if (prev == vote) null else vote
    if (next == null) Glimt67.votes.remove(traceId) else Glimt67.votes[traceId] = next
    Haptics.select()
    launch31 {
        try {
            val raw = api31 { request("POST", "/glimt/recipes/feedback", JSONObject().put("traceId", traceId).put("vote", next ?: JSONObject.NULL), prefix = Api.HOMELAB, timeout = 6000, read = 10_000) }
            val st = runCatching { JSONObject(raw).optJSONObject("recipe")?.s67("status") }.getOrNull()
            Glimt67.voteMsg[traceId] = when (next) { "up" -> if (st == "active") "Takk! Glimt bruker dette igjen" else "Takk!"; "down" -> "Takk – Glimt lærer av det"; else -> "" }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (prev == null) Glimt67.votes.remove(traceId) else Glimt67.votes[traceId] = prev
            Glimt67.voteMsg[traceId] = if ((e as? ApiException)?.status == 404) "Svaret er for gammelt til å stemme på" else "Kunne ikke lagre: ${e.message ?: "ukjent feil"}"
        }
    }
}

/** «Verktøy · 1,2 s» (som chatTool31), med «Ferskt svar fra cachen» når svaret kom fra cachen. */
internal fun stats67(ms: Long, note: String?): String =
    listOfNotNull("Verktøy · " + String.format(Locale("nb", "NO"), "%.1f s", ms / 1000.0), note).joinToString(" · ")
