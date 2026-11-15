package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/* ---------------- AI-kontroll ---------------- */

data class AiProv34(val id: String, val name: String, val state: String, val ms: Long?, val detail: String, val error: String?, val last4: String?, val set: Boolean, val url: String?, val model: String?)

data class AiModel34(val id: String, val desc: String, val gb: Double?, val quant: String?, val ctx: String?, val kind: String, val loaded: Boolean, val last: String?)

data class AiCloud34(val id: String, val provider: String, val desc: String, val on: Boolean)

data class AiPull34(val id: String, val pct: Int, val done: Double?, val total: Double?, val mbs: Double?, val status: String)

data class AiTask34(val key: String, val name: String, val sub: String, val model: String, val fallback: String, val fin: Boolean, val warning: String?)

data class AiJob34(val id: String, val title: String, val model: String, val st: String, val pct: Int, val dur: String?, val tok: String?, val err: String?, val whenT: String?, val fin: Boolean,
    /** Prompt 41: serverens tidsstempler (createdAt/startedAt/endedAt) og ferdig etikett (timeLabel) for tidskolonnen i Jobber. */
    val createdAt: String? = null, val startedAt: String? = null, val endedAt: String? = null, val timeLabel: String? = null)

data class AiFeat34(val name: String, val kr: Double, val tokens: Long, val sub: String, val count: Int?)

data class AiUsage34(val tokIn: Long, val tokOut: Long, val cost: Double, val costBy: Map<String, Double>, val localPct: Int?, val avgMs: Long?, val days: List<Pair<Long, Long>>, val feats: List<AiFeat34>,
    val budget: Double, val used: Double, val forecast: Double?, val hardStop: Boolean, val warn80: Boolean)

data class AiStatus34(val gpu: String?, val vramUsed: Double?, val vramTotal: Double?, val diskUsed: Double?, val diskTotal: Double?, val providers: List<AiProv34>,
    val running: Int, val queued: Int, val failed: Int, val loaded: List<String>, val tokens30: Long?, val cost30: Double?, val budget: Double?)

data class AiSelf34(val task: String, val name: String, val model: String, val ok: Boolean?, val ms: Long?, val error: String?, val fix: String?)

data class AiTok34(val id: String, val name: String, val sub: String)

data class AiLib34(val id: String, val desc: String, val gb: Double, val kind: String)

/** Oppgavene i Valg (navn, undertekst, standard modell og reserve, finans). */
val AI_TASKS34: List<AiTask34> = listOf(
    AiTask34("chat", "Chat", "Standardmodell i nye samtaler", "gemma4:latest", "gemini-2.5-flash", false, null),
    AiTask34("sok", "AI-søk", "Søkefeltet og spørsmål i hele appen", "llama-3.3-70b-versatile", "gemma4:latest", false, null),
    AiTask34("glimt", "Glimt · kalender", "Forstå hendelser og svare om kalenderen", "gemma4:latest", "llama-3.3-70b-versatile", false, null),
    AiTask34("brief", "Glimt · brief", "Morgen-, dags- og kveldsbriefen", "gemma4:latest", "gemini-2.5-flash", false, null),
    AiTask34("rc", "Kvitteringer (bilde)", "Leser butikk, beløp og varelinjer", "qwen2.5vl:7b", "gemini-2.5-flash", true, null),
    AiTask34("kat", "Kategorisering", "Foreslår kategori for transaksjoner", "llama3.2:3b", "llama-3.3-70b-versatile", true, null),
    AiTask34("fsok", "Finans · spør", "«Har jeg et musikkabonnement?»", "gemma4:latest", "gemini-2.5-flash", true, null),
    AiTask34("bar", "Strekkoder og pakkelapper", "Bildefelt fra kamera", "roboflow/kvittering/1", "qwen2.5vl:7b", true, null),
    AiTask34("dom", "Domener · oppsummering", "Daglig sammendrag kl. 06:00", "gemma4:latest", "gemini-2.5-flash", false, null),
    AiTask34("kb", "Kunnskapsbase", "Embeddings for dokumenter", "nomic-embed-text", "bge-m3", false, null),
)

/** Biblioteket når serveren ikke har /api/ai/library (fra prototypen). */
val AI_LIB34: List<AiLib34> = listOf(
    AiLib34("qwen3:14b", "Alibaba Qwen 3 · resonnering og verktøy", 9.3, "tekst"), AiLib34("qwen3:8b", "Alibaba Qwen 3 · rask og liten", 5.2, "tekst"),
    AiLib34("qwen2.5vl:7b", "Qwen 2.5 VL · leser kvitteringer og bilder", 6.0, "bilde"), AiLib34("gemma3:12b", "Google Gemma 3 · god norsk", 8.1, "tekst"),
    AiLib34("gemma3:27b", "Google Gemma 3 · sterk norsk", 17.0, "tekst"), AiLib34("llama3.3:70b", "Meta Llama 3.3 · stor allrounder", 43.0, "tekst"),
    AiLib34("mistral-small3.2", "Mistral Small 3.2 · rask med verktøy", 15.0, "tekst"), AiLib34("phi4:14b", "Microsoft Phi-4 · liten og skarp", 9.1, "tekst"),
    AiLib34("llava:13b", "LLaVA · bildebeskrivelse", 8.0, "bilde"), AiLib34("minicpm-v", "MiniCPM-V · bilde på lite minne", 5.5, "bilde"),
    AiLib34("deepseek-r1:14b", "DeepSeek R1 · tenker før den svarer", 9.0, "resonnering"), AiLib34("bge-m3", "BGE-M3 · flerspråklige embeddings", 1.2, "embedding"),
    AiLib34("nomic-embed-text", "Nomic · embeddings for kunnskapsbasen", 0.27, "embedding"),
)

/* ---------------- Tilstand ---------------- */

class P34State {
    /* Glimt-brief */
    var brief by mutableStateOf<Brief34?>(null)
    var briefOpen by mutableStateOf(false)
    var briefBusy by mutableStateOf(false)
    internal var briefAt = 0L
    internal var briefFor: String? = null
    /** Guide-runden: 0 = ikke startet, 1–5 = steg, 99 = ferdig. */
    var tour by mutableIntStateOf(0)
    var tourSeq by mutableIntStateOf(0)

    /* AI-kontroll */
    var aiOpen by mutableStateOf(false)
    var aiTab by mutableStateOf("ov")
    var aiStatus by mutableStateOf<AiStatus34?>(null)
    var aiModels by mutableStateOf<List<AiModel34>?>(null)
    var aiCloud by mutableStateOf<List<AiCloud34>>(emptyList())
    var aiPulls by mutableStateOf<Map<String, AiPull34>>(emptyMap())
    internal val pullJobs = HashMap<String, Job>()
    var aiTasks by mutableStateOf<List<AiTask34>>(AI_TASKS34)
    var aiRules by mutableStateOf<Map<String, Boolean>>(mapOf("local1" to true, "finLocal" to false, "think" to true))
    var aiParams by mutableStateOf<Map<String, String>>(mapOf("keep" to "30m", "ctx" to "32k", "temp" to "0.7", "par" to "2"))
    var aiJobs by mutableStateOf<List<AiJob34>?>(null)
    var aiPaused by mutableStateOf(false)
    var aiUsage by mutableStateOf<AiUsage34?>(null)
    var aiWarn80 by mutableStateOf(true)
    var aiKeys by mutableStateOf<List<AiProv34>>(emptyList())
    /** Modellene ruteren kan velge (lokale + sky som er på), fra GET /api/ai/routing → models. */
    var aiRtModels by mutableStateOf<List<Pair<String, String>>>(emptyList())
    var aiDays by mutableStateOf("30")
    var aiTokens by mutableStateOf<List<AiTok34>>(emptyList())
    var aiFresh by mutableStateOf<String?>(null)
    var aiLib by mutableStateOf<List<AiLib34>>(AI_LIB34)
    var aiQ by mutableStateOf("")
    var aiCat by mutableStateOf("alle")
    var aiErr by mutableStateOf<String?>(null)
    var aiMissing by mutableStateOf(false)
    var aiSelf by mutableStateOf<List<AiSelf34>?>(null)
    var aiSelfBusy by mutableStateOf(false)
    var aiTest by mutableStateOf<Map<String, String>>(emptyMap())
    var aiKeyEdit by mutableStateOf<Map<String, String>>(emptyMap())
    var aiDelArm by mutableStateOf<String?>(null)
    var aiToast by mutableStateOf<String?>(null)
    internal var aiToastSeq = 0
    internal var aiPoll: Job? = null

    /* Kvitteringer under AI-analyse */
    var rcAi by mutableStateOf<List<RcAi34>>(emptyList())
    internal var rcPoll: Job? = null

    /* Chat: «Kvitteringer og skanninger» */
    var scanFolder by mutableStateOf<ChatFolder27?>(null)
    var scanReview by mutableIntStateOf(0)

    /* Innstillinger: markering */
    var hl by mutableStateOf<String?>(null)
    var hlSeq by mutableIntStateOf(0)
    var aiAnchor by mutableStateOf<String?>(null)

    /* Siste AI-feil (vises i svaret) */
    var lastErr by mutableStateOf<String?>(null)
    var lastModel by mutableStateOf<String?>(null)
}

const val SCAN_F34 = "Kvitteringer og skanninger"

/* ---------------- AI-kontroll: henting ---------------- */

fun AppViewModel.openAiCtl34(tab: String = "ov") {
    val s = p34
    Haptics.tap()
    s.aiTab = tab
    s.aiOpen = true
    s.aiErr = null
    loadAi34()
    loadAiTab34(tab)
}

fun AppViewModel.closeAiCtl34() {
    Haptics.back()
    p34.aiOpen = false
    p34.aiPoll?.cancel(); p34.aiPoll = null
}

fun AppViewModel.aiToast34(t: String) {
    val s = p34
    val seq = ++s.aiToastSeq
    s.aiToast = t
    launch34 { delay(2600); if (s.aiToastSeq == seq) s.aiToast = null }
}

fun AppViewModel.setAiTab34(t: String) {
    Haptics.select()
    p34.aiTab = t
    loadAiTab34(t)
}

fun AppViewModel.loadAiTab34(t: String) {
    when (t) {
        "ov" -> { loadAiStatus34(); loadAiJobs34() }
        "mod" -> loadAiModels34()
        "rt" -> { loadAiRouting34(); if (p34.aiModels == null) loadAiModels34() }
        "job" -> { loadAiJobs34(); pollAiJobs34() }
        "use" -> loadAiUsage34()
        "api" -> { loadAiStatus34(); loadAiKeys34(); loadAiTokens34() }
    }
}

fun AppViewModel.loadAi34() { loadAiStatus34(); loadAiModels34(); loadAiRouting34() }

private fun AppViewModel.aiFail34(e: Throwable) {
    val s = p34
    if (e is ApiException && (e.status == 404 || e.status == 405)) { s.aiMissing = true; s.aiErr = "Serveren har ikke AI-kontroll ennå. Oppdater Homelab-serveren."; return }
    s.aiErr = e.message ?: "Fikk ikke kontakt med serveren"
}

private fun parseProv34(o: JSONObject): AiProv34? {
    val id = s34(o, "id", "provider", "key") ?: return null
    val raw = s34(o, "state", "status") ?: if (b34(o, "ok") == true) "ok" else if (b34(o, "reachable") == true) "warn" else "off"
    val state = when (raw) { "ok", "svarer", "green", "online" -> "ok"; "warn", "reachable", "nås", "orange", "degraded" -> "warn"; else -> "off" }
    val tail = s34(o, "last4", "tail", "keyTail")
    return AiProv34(id, s34(o, "name") ?: id.replaceFirstChar { it.uppercase() }, state, n34(o, "ms", "latency", "latencyMs")?.toLong(),
        s34(o, "detail", "sub", "info") ?: s34(o, "model")?.let { "modell $it" } ?: "", s34(o, "error", "err")?.takeIf { state != "ok" }, tail,
        b34(o, "set", "hasKey", "configured") ?: (tail != null || state != "off"), s34(o, "url", "base", "address"), s34(o, "model", "defaultModel"))
}

fun AppViewModel.loadAiStatus34() {
    val s = p34
    launch34 {
        try {
            val o = json34(Api.HOMELAB + "/ai/status") ?: return@launch34
            val srv = o.optJSONObject("server") ?: o
            val gpuO = srv.optJSONObject("gpu")
            val vram = srv.optJSONObject("vram") ?: gpuO?.optJSONObject("vram")
            val disk = srv.optJSONObject("disk")
            val provs = objs34(arr34(o, "providers", "provider")).mapNotNull(::parseProv34).ifEmpty {
                o.optJSONObject("providers")?.let { p -> p.keys().asSequence().mapNotNull { k -> p.optJSONObject(k)?.let { v -> parseProv34(v.put("id", k)) } }.toList() } ?: emptyList()
            }
            val jobs = o.optJSONObject("jobs")
            val loaded = arr34(srv, "loaded", "ps")?.let { a -> (0 until a.length()).mapNotNull { i -> when (val x = a.opt(i)) { is String -> x; is JSONObject -> s34(x, "name", "id", "model"); else -> null } } } ?: emptyList()
            s.aiStatus = AiStatus34(
                s34(srv, "gpu", "gpuName") ?: s34(gpuO, "name"),
                n34(vram, "used", "usedGb") ?: n34(srv, "vramUsed", "vramUsedGb"), n34(vram, "total", "totalGb") ?: n34(gpuO, "vramGb", "vram") ?: n34(srv, "vramTotal", "vramTotalGb"),
                n34(disk, "used", "usedGb", "models") ?: n34(srv, "diskUsed", "modelsGb", "diskGb"), n34(disk, "total", "totalGb") ?: n34(srv, "diskTotal"),
                provs, (n34(jobs, "running") ?: n34(o, "running"))?.toInt() ?: 0, (n34(jobs, "queued") ?: n34(o, "queued"))?.toInt() ?: 0,
                (n34(jobs, "failed") ?: n34(o, "failed"))?.toInt() ?: 0, loaded,
                (n34(o, "tokens30", "tokens30d") ?: n34(o.optJSONObject("usage"), "tokens", "tokens30"))?.toLong(),
                n34(o, "cost30", "cloudCost30") ?: n34(o.optJSONObject("usage"), "cost", "cost30") ?: n34(o.optJSONObject("budget"), "monthCostKr"),
                n34(o, "budget") ?: n34(o.optJSONObject("budget"), "monthlyKr", "limit"),
            )
            runCatching { parseAiHw38(o) } // prompt 38: Mac mini M4 (server.hw) og anbefalingene
            s.aiMissing = false
        } catch (e: CancellationException) { throw e } catch (e: Exception) { aiFail34(e) }
    }
}

/** «i dag 08:12» / «i går» / «for 6 dager siden» fra ISO. */
internal fun when34(s: String): String {
    val t = runCatching { java.time.OffsetDateTime.parse(s).atZoneSameInstant(OSLO34) }.getOrNull() ?: runCatching { java.time.Instant.parse(s).atZone(OSLO34) }.getOrNull() ?: return s
    val d = java.time.temporal.ChronoUnit.DAYS.between(t.toLocalDate(), LocalDate.now(OSLO34))
    return when { d <= 0L -> "i dag " + hm34(t.hour * 60 + t.minute); d == 1L -> "i går"; else -> "for $d dager siden" }
}

private fun gb34(o: JSONObject): Double? {
    n34(o, "gb", "sizeGb")?.let { return it }
    val b = n34(o, "size", "bytes") ?: return null
    return if (b > 1e6) b / 1e9 else b
}

private fun kindOf34(id: String, o: JSONObject?): String {
    s34(o, "kind", "type", "k", "cat")?.let { k -> return when (k) { "vision", "image", "bilde" -> "bilde"; "embed", "embedding", "embeddings" -> "embedding"; "reasoning", "resonnering" -> "resonnering"; else -> "tekst" } }
    val l = id.lowercase()
    return when {
        Regex("embed|bge|minilm").containsMatchIn(l) -> "embedding"
        Regex("vl|llava|vision|minicpm-v|moondream").containsMatchIn(l) -> "bilde"
        Regex("r1|deepseek-r|qwq").containsMatchIn(l) -> "resonnering"
        else -> "tekst"
    }
}

fun AppViewModel.loadAiModels34() {
    val s = p34
    launch34 {
        try {
            val o = json34(Api.HOMELAB + "/ai/models") ?: return@launch34
            val loadedSet = arr34(o, "loaded", "ps", "running")?.let { a -> (0 until a.length()).mapNotNull { i -> when (val x = a.opt(i)) { is String -> x; is JSONObject -> s34(x, "name", "id", "model"); else -> null } } }?.toSet() ?: emptySet()
            s.aiModels = objs34(arr34(o, "installed", "models", "local", "items")).mapNotNull { m ->
                val id = s34(m, "id", "name", "model") ?: return@mapNotNull null
                val d = m.optJSONObject("details")
                AiModel34(id, s34(m, "desc", "d", "label") ?: listOfNotNull((s34(m, "family") ?: s34(d, "family"))?.replaceFirstChar { it.uppercase() }, s34(m, "params") ?: s34(d, "parameter_size")).joinToString(" · ").ifBlank { id },
                    gb34(m), s34(m, "quant", "q") ?: s34(d, "quantization_level"), s34(m, "ctx", "context", "contextLength")?.let { c -> c.toIntOrNull()?.let { if (it >= 1024) "${it / 1024}k" else "$it" } ?: c },
                    kindOf34(id, m), b34(m, "loaded", "inVram") ?: (id in loadedSet), s34(m, "last", "lastUsed", "last_used")?.let(::when34))
            }
            s.aiCloud = objs34(arr34(o, "cloud", "sky")).mapNotNull { c ->
                val id = s34(c, "id", "name", "model") ?: return@mapNotNull null
                AiCloud34(id, s34(c, "provider", "p") ?: "sky", s34(c, "desc", "d", "label") ?: id, b34(c, "on", "enabled", "active") ?: true)
            }
            objs34(arr34(o, "pulls", "downloading")).forEach { p ->
                val id = s34(p, "id", "name", "model") ?: return@forEach
                if (id !in s.pullJobs) s.aiPulls = s.aiPulls + (id to pull34(id, p))
            }
            s.aiMissing = false
        } catch (e: CancellationException) { throw e } catch (e: Exception) { aiFail34(e) }
    }
    launch34 {
        val raw = runCatching { api34 { hlGet("/ai/library", timeout = 6_000) } }.getOrNull() ?: return@launch34
        val l = runCatching { list34(raw, "models", "items", "library") }.getOrNull()?.mapNotNull { m ->
            val id = s34(m, "id", "name") ?: return@mapNotNull null
            if (b34(m, "custom") == true) return@mapNotNull null
            AiLib34(id, s34(m, "desc", "d", "description") ?: id, gb34(m) ?: 0.0, kindOf34(id, m))
        } ?: return@launch34
        if (l.isNotEmpty()) s.aiLib = l
    }
}

private fun pull34(id: String, p: JSONObject): AiPull34 {
    val total = n34(p, "total")
    val done = n34(p, "completed", "done")
    val pct = n34(p, "pct", "progress")?.toInt() ?: if (total != null && total > 0 && done != null) (done / total * 100).toInt() else 0
    return AiPull34(id, pct.coerceIn(0, 100), done?.let { if (it > 1e6) it / 1e9 else it }, total?.let { if (it > 1e6) it / 1e9 else it }, n34(p, "mbps", "mbs", "speed"), s34(p, "status") ?: "laster ned")
}

/** Last ned fra Ollama: POST /api/ai/models/pull {name} (SSE med fremdrift). Kjører videre mens panelet er lukket; varsel når ferdig. */
fun AppViewModel.pullModel34(name0: String) {
    val s = p34
    val name = name0.trim()
    if (name.isEmpty() || name in s.pullJobs || s.aiModels?.any { it.id == name } == true) return
    if (!userIsAdmin) { aiToast34("Bare administrator kan laste ned modeller"); Haptics.error(); return }
    Haptics.tap()
    s.aiQ = ""
    s.aiPulls = s.aiPulls + (name to AiPull34(name, 0, null, null, null, "starter"))
    val t0 = System.currentTimeMillis()
    s.pullJobs[name] = launchJob34 {
        var err: String? = null
        try {
            stream34("POST", Api.HOMELAB + "/ai/models/pull", JSONObject().put("name", name).put("model", name), read = 600_000) { ev, o ->
                s34(o, "error")?.let { err = it; return@stream34 false }
                val p = pull34(name, o)
                val secs = (System.currentTimeMillis() - t0) / 1000.0
                val mbs = p.mbs ?: p.done?.let { d -> if (secs > 1) d * 1000 / secs else null }
                s.aiPulls = s.aiPulls + (name to p.copy(mbs = mbs))
                !(ev == "done" || s34(o, "status") == "success" || b34(o, "done") == true)
            }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { err = uiErr73(e, "Nedlastingen stoppet") }
        s.pullJobs.remove(name)
        s.aiPulls = s.aiPulls - name
        if (err != null) { aiToast34("Fikk ikke lastet ned $name: $err"); Haptics.error() }
        else {
            aiToast34("$name er lastet ned"); Haptics.success()
            if (inBackground29) Notify.post(appCtx34, "Modell lastet ned", "$name er klar i AI-kontroll", "ai34-pull-$name", "ai")
        }
        loadAiModels34()
    }
}

fun AppViewModel.cancelPull34(name: String) {
    val s = p34
    Haptics.select()
    s.pullJobs.remove(name)?.cancel()
    s.aiPulls = s.aiPulls - name
    launch34 { runCatching { api34 { hlDelete("/ai/models/pulls/" + enc34(name)) } } }
}

fun AppViewModel.loadModel34(m: AiModel34) {
    Haptics.select()
    val s = p34
    s.aiModels = s.aiModels?.map { if (it.id == m.id) it.copy(loaded = !m.loaded, last = "nå") else it }
    launch34 {
        try {
            api34 { request("POST", "/ai/models/" + enc34(m.id) + if (m.loaded) "/unload" else "/load", JSONObject(), prefix = Api.HOMELAB, read = 120_000) }
            aiToast34(if (m.loaded) "${m.id} lastet ut av VRAM" else "${m.id} lastet inn")
        } catch (e: ApiException) {
            s.aiModels = s.aiModels?.map { if (it.id == m.id) m else it }
            aiToast34("Fikk ikke ${if (m.loaded) "lastet ut" else "lastet inn"} ${m.id}: ${e.message}"); Haptics.error()
        }
        loadAiStatus34()
    }
}

fun AppViewModel.deleteModel34(m: AiModel34) {
    val s = p34
    if (s.aiDelArm != m.id) { s.aiDelArm = m.id; Haptics.select(); return }
    s.aiDelArm = null
    Haptics.tap()
    launch34 {
        try {
            api34 { request("DELETE", "/ai/models/" + enc34(m.id), prefix = Api.HOMELAB) }
            s.aiModels = s.aiModels?.filter { it.id != m.id }
            aiToast34("${m.id} slettet")
            loadAiRouting34() // ruteren bytter til reserven og sier fra
        } catch (e: ApiException) { aiToast34(if (e.status == 403) "Bare administrator kan slette modeller" else "Fikk ikke slettet: ${e.message}"); Haptics.error() }
    }
}

fun AppViewModel.loadAiRouting34() {
    val s = p34
    launch34 {
        try {
            val o = json34(Api.HOMELAB + "/ai/routing") ?: return@launch34
            val tasksO = o.optJSONObject("tasks") ?: o.optJSONObject("routing")
            val tasksA = arr34(o, "tasks", "routes")
            fun one(k: String, def: AiTask34): AiTask34 {
                val r = tasksO?.optJSONObject(k) ?: objs34(tasksA).firstOrNull { s34(it, "task", "id", "key") == k }
                return if (r == null) def else def.copy(
                    name = s34(r, "name", "label") ?: def.name, sub = s34(r, "sub", "desc") ?: def.sub,
                    model = s34(r, "model", "v") ?: def.model, fallback = s34(r, "fallback", "fb", "reserve") ?: def.fallback,
                    fin = b34(r, "fin", "finance") ?: def.fin, warning = s34(r, "warning", "warn", "error"),
                )
            }
            val known = AI_TASKS34.map { one(it.key, it) }
            val extra = objs34(tasksA).mapNotNull { r -> val k = s34(r, "task", "id", "key") ?: return@mapNotNull null; if (AI_TASKS34.any { it.key == k }) null else one(k, AiTask34(k, s34(r, "name") ?: k, "", "", "", false, null)) }
            s.aiTasks = known + extra
            val rules = o.optJSONObject("rules") ?: o
            s.aiRules = mapOf(
                "local1" to (b34(rules, "localFirst", "local1") ?: true),
                "finLocal" to (b34(rules, "financeLocal", "finLocal", "financeStaysHome") ?: false),
                "think" to (b34(rules, "showThinking", "think") ?: true),
            )
            val p = o.optJSONObject("params") ?: o.optJSONObject("options") ?: o
            val keep = when (val v = p.opt("keep_alive") ?: p.opt("keepAlive") ?: p.opt("keep")) { is Number -> if (v.toInt() < 0) "alltid" else if (v.toInt() == 0) "aldri" else "${v.toInt() / 60}m"; is String -> when (v) { "-1" -> "alltid"; "0" -> "aldri"; else -> v }; else -> "30m" }
            val ctx = when (val v = p.opt("numCtx") ?: p.opt("num_ctx") ?: p.opt("ctx") ?: p.opt("context")) { is Number -> "${v.toInt() / 1024}k"; is String -> v.toIntOrNull()?.let { "${it / 1024}k" } ?: v; else -> "32k" }
            o.optJSONObject("budget")?.let { b -> b34(b, "warn80")?.let { s.aiWarn80 = it } }
            s.aiRtModels = objs34(o.optJSONArray("models")).mapNotNull { m ->
                val id = s34(m, "id") ?: return@mapNotNull null
                id to (id + " · " + if (b34(m, "local") == true) "lokal" else (s34(m, "provider") ?: "sky"))
            }
            s.aiParams = mapOf("keep" to keep, "ctx" to ctx, "temp" to (n34(p, "temperature", "temp")?.toString() ?: "0.7"), "par" to (n34(p, "parallel", "par", "concurrency")?.toInt()?.toString() ?: "2"))
            s.aiMissing = false
        } catch (e: CancellationException) { throw e } catch (e: Exception) { aiFail34(e) }
    }
}

/** Kjører selvtesten automatisk etter at ruter eller nøkler er endret (varsel hvis noe feiler). */
private fun AppViewModel.afterChange34() = launch34 { delay(400); runSelftest34(auto = true) }

fun AppViewModel.setRoute34(task: String, model: String?, fallback: String?) {
    val s = p34
    Haptics.select()
    s.aiTasks = s.aiTasks.map { if (it.key == task) it.copy(model = model ?: it.model, fallback = fallback ?: it.fallback, warning = null) else it }
    val t = JSONObject()
    model?.let { t.put("model", it) }
    fallback?.let { t.put("fallback", it) }
    putRouting34(JSONObject().put("tasks", JSONObject().put(task, t)))
}

fun AppViewModel.setRule34(k: String, on: Boolean) {
    Haptics.select()
    p34.aiRules = p34.aiRules + (k to on)
    val key = when (k) { "local1" -> "localFirst"; "finLocal" -> "finLocal"; else -> "think" }
    putRouting34(JSONObject().put("rules", JSONObject().put(key, on)))
}

/** Parametre som tall: keep_alive "30m" / -1 / 0, num_ctx 8192/32768/131072, temperatur og samtidige jobber. */
fun AppViewModel.setParam34(k: String, v: String) {
    Haptics.select()
    p34.aiParams = p34.aiParams + (k to v)
    val p = JSONObject()
    when (k) {
        "keep" -> p.put("keepAlive", when (v) { "alltid" -> -1; "aldri" -> 0; else -> v })
        "ctx" -> p.put("numCtx", (v.removeSuffix("k").toIntOrNull() ?: 8) * 1024)
        "temp" -> p.put("temperature", v.toDoubleOrNull() ?: 0.7)
        "par" -> p.put("parallel", v.toIntOrNull() ?: 2)
    }
    putRouting34(JSONObject().put("params", p))
}

fun AppViewModel.setCloud34(id: String, on: Boolean) {
    Haptics.select()
    p34.aiCloud = p34.aiCloud.map { if (it.id == id) it.copy(on = on) else it }
    launch34 {
        try { api34 { hlPut("/ai/cloud", JSONObject().put("id", id).put("on", on)) }; afterChange34() }
        catch (e: ApiException) { aiToast34(if (e.status == 403) "Bare administrator kan slå sky-modeller av og på" else "Fikk ikke lagret: ${e.message}"); Haptics.error(); loadAiModels34() }
    }
}

fun AppViewModel.setDefaultChat34(id: String) {
    Haptics.select()
    p34.aiTasks = p34.aiTasks.map { if (it.key == "chat") it.copy(model = id, warning = null) else it }
    launch34 {
        try { api34 { hlPut("/ai/models/default", JSONObject().put("model", id)) }; aiToast34("$id er standard i Chat") }
        catch (e: ApiException) { aiToast34("Fikk ikke lagret: ${e.message}"); Haptics.error() }
    }
}

private fun AppViewModel.putRouting34(body: JSONObject) {
    launch34 {
        try {
            api34 { hlPut("/ai/routing", body) }
            afterChange34()
        } catch (e: ApiException) {
            aiToast34(if (e.status == 403) "Bare administrator kan endre serverens standard" else "Fikk ikke lagret: ${e.message}")
            Haptics.error()
            loadAiRouting34()
        }
    }
}

private fun jobSt34(s: String?): String = when (s) { "running", "run", "active", "processing" -> "run"; "queued", "queue", "pending", "waiting" -> "queue"; "failed", "fail", "error" -> "fail"; "cancelled", "canceled" -> "fail"; else -> "done" }

private fun parseJob34(o: JSONObject): AiJob34? {
    val id = s34(o, "id", "jobId") ?: return null
    val st = jobSt34(s34(o, "status", "st", "state"))
    val ms = n34(o, "ms", "durationMs")
    val tokO = o.optJSONObject("tokens")
    val tok = (n34(o, "tokens", "tok") ?: tokO?.let { (n34(it, "in") ?: 0.0) + (n34(it, "out") ?: 0.0) }?.takeIf { it > 0 })?.toLong()
    val cost = n34(o, "cost", "kr", "costKr")
    val tokS = s34(o, "tokS") ?: tok?.let { t -> String.format(java.util.Locale("nb", "NO"), "%,d tok", t).replace(',', ' ') + (cost?.takeIf { it > 0 }?.let { " · " + String.format(java.util.Locale("nb", "NO"), "%.2f kr", it) } ?: "") }
    return AiJob34(id, s34(o, "title", "t", "name", "label") ?: (s34(o, "task", "kind") ?: "Jobb"), s34(o, "model", "m") ?: "", st,
        (n34(o, "progress", "p", "pct") ?: 0.0).toInt().coerceIn(0, 100), s34(o, "dur") ?: ms?.let { String.format(java.util.Locale("nb", "NO"), "%.1f s", it / 1000.0) },
        tokS, s34(o, "error", "err")?.takeIf { st == "fail" || st == "queue" }, s34(o, "when", "scheduled", "at"), b34(o, "fin", "finance") ?: (s34(o, "kind", "task") in setOf("rc", "receipt", "kat", "categorize", "fsok", "bar", "label")),
        s34(o, "createdAt", "created_at", "queuedAt"), s34(o, "startedAt", "started_at"), s34(o, "endedAt", "ended_at", "finishedAt", "finished_at"), s34(o, "timeLabel"))
}

/** {running, queued, recent, paused} (SERVER34) eller {jobs|items:[…]}. */
private fun jobsOf34(o: JSONObject): List<AiJob34> =
    (objs34(o.optJSONArray("running")) + objs34(o.optJSONArray("queued")) + objs34(o.optJSONArray("recent")) + objs34(arr34(o, "jobs", "items"))).mapNotNull(::parseJob34).distinctBy { it.id }

fun AppViewModel.loadAiJobs34() {
    val s = p34
    launch34 {
        try {
            val o = json34(Api.HOMELAB + "/ai/jobs?limit=60") ?: return@launch34
            s.aiJobs = jobsOf34(o)
            b34(o, "paused")?.let { s.aiPaused = it }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { aiFail34(e) }
    }
}

/** Jobber-fanen: oppdateres hvert 2. sekund mens panelet er åpent. */
fun AppViewModel.pollAiJobs34() {
    val s = p34
    if (s.aiPoll?.isActive == true) return
    s.aiPoll = launchJob34 {
        while (s.aiOpen && (s.aiTab == "job" || s.aiTab == "ov")) {
            delay(2000)
            runCatching { json34(Api.HOMELAB + "/ai/jobs?limit=60") }.getOrNull()?.let { o -> s.aiJobs = jobsOf34(o); b34(o, "paused")?.let { s.aiPaused = it } }
        }
    }
}

fun AppViewModel.jobAction34(j: AiJob34) {
    Haptics.select()
    val retry = j.st == "fail"
    launch34 {
        try { api34 { request("POST", "/ai/jobs/" + enc34(j.id) + if (retry) "/retry" else "/cancel", JSONObject(), prefix = Api.HOMELAB) } }
        catch (e: ApiException) { aiToast34("Fikk ikke ${if (retry) "prøvd igjen" else "avbrutt"}: ${e.message}"); Haptics.error() }
        loadAiJobs34()
    }
}

fun AppViewModel.pauseQueue34() {
    val s = p34
    Haptics.select()
    val v = !s.aiPaused
    s.aiPaused = v
    launch34 { runCatching { api34 { request("POST", "/ai/queue/pause", JSONObject().put("paused", v), prefix = Api.HOMELAB) } }.onFailure { s.aiPaused = !v; aiToast34("Fikk ikke endret køen") } }
}

fun AppViewModel.clearJobs34() {
    val s = p34
    Haptics.select()
    s.aiJobs = s.aiJobs?.filter { it.st == "run" || it.st == "queue" }
    launch34 { runCatching { api34 { hlDelete("/ai/jobs") } } }
}

fun AppViewModel.loadAiUsage34() {
    val s = p34
    launch34 {
        try {
            val o = json34(Api.HOMELAB + "/ai/usage?days=" + s.aiDays) ?: return@launch34
            val tok = o.optJSONObject("tokens") ?: o.optJSONObject("totals")
            val cost = o.optJSONObject("cost") ?: o.optJSONObject("totals")
            val by = (cost?.optJSONObject("byProvider") ?: o.optJSONObject("byProvider"))?.let { b -> b.keys().asSequence().associateWith { k -> b.optDouble(k, 0.0) } }
                ?: objs34(o.optJSONArray("byProvider")).filter { (n34(it, "costKr") ?: 0.0) > 0 }.associate { (s34(it, "name", "provider") ?: "?") to (n34(it, "costKr") ?: 0.0) }
            val bud = o.optJSONObject("budget")
            s.aiUsage = AiUsage34(
                (n34(tok, "in", "input", "prompt", "tokIn") ?: n34(o, "tokensIn"))?.toLong() ?: 0, (n34(tok, "out", "output", "completion", "tokOut") ?: n34(o, "tokensOut"))?.toLong() ?: 0,
                n34(cost, "total", "costKr") ?: n34(o, "cost", "costTotal") ?: 0.0, by,
                (n34(tok, "localShare", "localPct") ?: n34(o, "localPct", "localShare"))?.let { if (it <= 1.0 && it > 0) (it * 100).toInt() else it.toInt() },
                (n34(tok, "avgMs") ?: n34(o, "avgMs", "avg_ms"))?.toLong(),
                objs34(arr34(o, "byDay", "days", "perDay", "daily")).map { d -> ((n34(d, "localTok", "local") ?: 0.0).toLong()) to ((n34(d, "cloudTok", "cloud", "sky") ?: 0.0).toLong()) },
                objs34(arr34(o, "byTask", "features", "perFeature", "byFeature")).mapNotNull { f ->
                    val models = f.optJSONArray("models")?.let { a -> (0 until a.length()).joinToString(", ") { a.optString(it) } }
                    AiFeat34(s34(f, "name", "task", "feature") ?: return@mapNotNull null, n34(f, "costKr", "cost", "kr") ?: 0.0, (n34(f, "tokens") ?: 0.0).toLong(),
                        listOfNotNull(models?.takeIf { it.isNotBlank() } ?: s34(f, "model"), n34(f, "count", "n")?.toInt()?.let { "$it forespørsler" }).joinToString(" · "), n34(f, "count", "n")?.toInt())
                },
                n34(bud, "monthlyKr", "limit", "monthly", "kr") ?: n34(o, "budget") ?: 0.0, n34(bud, "monthCostKr", "used", "spent") ?: n34(cost, "month") ?: 0.0, n34(bud, "forecastKr", "forecast", "prognosis"),
                b34(bud, "hardStop", "stop", "hard") ?: true, b34(bud, "warn80") ?: s.aiWarn80,
            )
        } catch (e: CancellationException) { throw e } catch (e: Exception) { aiFail34(e) }
    }
}

fun AppViewModel.setDays34(d: String) { Haptics.select(); p34.aiDays = d; loadAiUsage34() }

/** Budsjett for sky-AI: 0 = ingen grense. */
fun AppViewModel.setBudget34(limit: Double? = null, hardStop: Boolean? = null, warn80: Boolean? = null) {
    val s = p34
    val u = s.aiUsage
    if (u != null) s.aiUsage = u.copy(budget = limit ?: u.budget, hardStop = hardStop ?: u.hardStop, warn80 = warn80 ?: u.warn80)
    val b = JSONObject()
    limit?.let { b.put("monthlyKr", it) }
    hardStop?.let { b.put("hardStop", it) }
    warn80?.let { b.put("warn80", it) }
    putRouting34(JSONObject().put("budget", b))
}

fun AppViewModel.loadAiTokens34() {
    val s = p34
    launch34 {
        val raw = runCatching { api34 { hlGet("/ai/tokens", timeout = 6_000) } }.getOrNull() ?: return@launch34
        s.aiTokens = runCatching { list34(raw, "tokens", "items") }.getOrDefault(emptyList()).mapNotNull { t ->
            val id = s34(t, "id") ?: return@mapNotNull null
            fun d(k: String): String? = when (val v = t.opt(k)) {
                is Number -> java.time.Instant.ofEpochMilli(v.toLong()).atZone(OSLO34).toLocalDate().toString()
                is String -> v.takeIf { it.isNotBlank() && it != "null" }?.take(10)
                else -> null
            }
            AiTok34(id, s34(t, "name", "n") ?: "Nøkkel", s34(t, "sub", "s") ?: listOfNotNull(s34(t, "display") ?: ("hl_••••" + (s34(t, "last4", "tail") ?: "")), d("created")?.let { "opprettet $it" }, (d("lastUsed") ?: d("last_used"))?.let { "brukt $it" } ?: "aldri brukt").joinToString(" · "))
        }
    }
}

/** GET /api/ai/keys → {providers:[{id, name, set, url, tail, link, model}]} (bare «satt» og siste 4 tegn). */
fun AppViewModel.loadAiKeys34() {
    val s = p34
    launch34 {
        val o = runCatching { json34(Api.HOMELAB + "/ai/keys") }.getOrNull() ?: return@launch34
        s.aiKeys = objs34(arr34(o, "providers")).mapNotNull(::parseProv34)
    }
}

fun AppViewModel.newToken34() {
    val s = p34
    Haptics.tap()
    launch34 {
        try {
            val o = JSONObject(api34 { hlPost("/ai/tokens", JSONObject().put("name", "Ny nøkkel")) })
            s.aiFresh = s34(o, "token", "key", "secret")
            loadAiTokens34()
        } catch (e: ApiException) { aiToast34("Fikk ikke laget nøkkel: ${e.message}"); Haptics.error() }
    }
}

fun AppViewModel.revokeToken34(id: String) {
    Haptics.select()
    p34.aiTokens = p34.aiTokens.filter { it.id != id }
    launch34 { runCatching { api34 { hlDelete("/ai/tokens/" + enc34(id)) } }; loadAiTokens34() }
}

/** API-nøkkel / adresse per leverandør (bare admin). Klienten får bare de siste 4 tegnene tilbake. */
fun AppViewModel.saveKey34(provider: String, field: String, value: String) {
    if (!userIsAdmin) { aiToast34("Bare administrator kan endre nøkler"); return }
    Haptics.tap()
    launch34 {
        try {
            api34 { hlPut("/ai/keys/" + enc34(provider), JSONObject().put(field, value.trim())) }
            p34.aiKeyEdit = p34.aiKeyEdit - "$provider.$field"
            aiToast34("Lagret")
            loadAiKeys34()
            loadAiStatus34()
            afterChange34()
        } catch (e: ApiException) { aiToast34("Fikk ikke lagret: ${e.message}"); Haptics.error() }
    }
}

fun AppViewModel.testKey34(provider: String) {
    val s = p34
    Haptics.select()
    s.aiTest = s.aiTest + (provider to "busy")
    launch34 {
        val r = try {
            val o = JSONObject(api34 { request("POST", "/ai/keys/" + enc34(provider) + "/test", JSONObject(), prefix = Api.HOMELAB, read = 20_000) })
            if (b34(o, "ok") != false) "Svarte på ${n34(o, "ms")?.toLong() ?: "?"} ms" else (s34(o, "error") ?: "Svarte ikke")
        } catch (e: ApiException) { e.message ?: "Svarte ikke" }
        s.aiTest = s.aiTest + (provider to r)
    }
}

/** POST /api/ai/selftest: én hendelse per rute {task, model, ok, ms, error, fix}. */
fun AppViewModel.runSelftest34(auto: Boolean = false) {
    val s = p34
    if (s.aiSelfBusy) return
    if (!auto) Haptics.tap()
    s.aiSelfBusy = true
    if (!auto || s.aiSelf != null) s.aiSelf = s.aiTasks.map { AiSelf34(it.key, it.name, it.model, null, null, null, null) }
    launch34 {
        try {
            stream34("POST", Api.HOMELAB + "/ai/selftest", JSONObject(), read = 180_000) { _, o ->
                val k = s34(o, "task") ?: return@stream34 b34(o, "done") != true
                val name = s.aiTasks.firstOrNull { it.key == k }?.name ?: k
                val row = AiSelf34(k, name, s34(o, "model") ?: "", b34(o, "ok") ?: false, n34(o, "ms")?.toLong(), s34(o, "error"), s34(o, "fix"))
                val cur = s.aiSelf ?: emptyList()
                s.aiSelf = if (cur.any { it.task == k }) cur.map { if (it.task == k) row else it } else cur + row
                true
            }
            val bad = (s.aiSelf ?: emptyList()).count { it.ok == false }
            val undone = (s.aiSelf ?: emptyList()).count { it.ok == null }
            if (undone > 0) s.aiSelf = s.aiSelf?.map { if (it.ok == null) it.copy(ok = false, error = "Fikk ikke svar i selvtesten") else it }
            val n = bad + undone
            aiToast34(if (n > 0) "$n AI-funksjoner virker ikke" else "Alle AI-funksjoner svarer")
            if (n > 0) Haptics.error() else if (!auto) Haptics.success()
            if (auto && n > 0 && inBackground29) Notify.post(appCtx34, "AI-kontroll", "$n AI-funksjoner virker ikke. Åpne AI-kontroll.", "ai34-self", "ai")
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (e is ApiException && (e.status == 404 || e.status == 405)) s.aiSelf = s.aiSelf?.map { it.copy(ok = false, error = "Serveren har ikke selvtest ennå") }
            else s.aiSelf = s.aiSelf?.map { if (it.ok == null) it.copy(ok = false, error = uiErr73(e, "Fikk ikke kontakt")) else it }
        } finally { s.aiSelfBusy = false }
    }
}

data class Hw38(
    val model: String, val chip: String?, val memGb: Double?, val gpuBudgetGb: Double?, val gpuUsedGb: Double?,
    val diskName: String?, val diskTotalGb: Double?, val diskFreeGb: Double?, val external: Boolean, val mounted: Boolean?,
    val diskUsedGb: Double? = null, val label: String? = null, val warnings: List<String> = emptyList(),
)

data class AiRec38(val key: String, val text: String, val env: String?)

data class FinOpt38(val id: String, val label: String, val local: Boolean)

data class FinRt38(val key: String, val name: String, val sub: String, val model: String, val fallback: String, val options: List<FinOpt38>, val warning: String?)

/** Standardene (claude-code-ai-kontroll-modellvalg-fiks.md) når serveren ikke har scope=finans. */
val FIN_RT38 = listOf(
    FinRt38("rc", "Kvitteringer (bilde)", "Leser butikk, beløp og varelinjer", "qwen2.5vl:7b", "gemini-2.5-flash", emptyList(), null),
    FinRt38("kat", "Kategorisering", "Foreslår kategori for transaksjoner", "llama3.2:3b", "llama-3.3-70b-versatile", emptyList(), null),
    FinRt38("fsok", "Finans · spør", "«Har jeg et musikkabonnement?»", "gemma4:latest", "gemini-2.5-flash", emptyList(), null),
    FinRt38("bar", "Strekkoder og pakkelapper", "Bildefelt fra kamera", "roboflow/kvittering/1", "qwen2.5vl:7b", emptyList(), null),
)

/* ======================= AI-kontroll ======================= */

/** Fra GET /api/ai/status (kalles fra loadAiStatus34): maskinen (server.hw) og anbefalingene. */
fun AppViewModel.parseAiHw38(o: JSONObject) {
    val srv = o.optJSONObject("server") ?: o
    val hw = srv.optJSONObject("hw") ?: o.optJSONObject("hw")
    p38.hw = hw?.let { h ->
        val d = h.optJSONObject("disk")
        val g = h.optJSONObject("gpu")
        Hw38(h.s37("model") ?: "AI-maskin", h.s37("chip"), h.d37("memGb"), h.d37("gpuBudgetGb") ?: g?.d37("budgetGb"),
            g?.d37("usedGb") ?: h.d37("gpuUsedGb") ?: srv.d37("vramUsedGb") ?: n34(srv.optJSONObject("vram"), "used", "usedGb"),
            d?.s37("name"), d?.d37("totalGb"), d?.d37("freeGb"), d?.b37("external") ?: false, d?.b37("mounted"),
            d?.d37("usedGb") ?: srv.d37("diskGb"), h.s37("label"), strs37(h.optJSONArray("warnings")))
    }
    val rec = o.optJSONArray("recommend") ?: srv.optJSONArray("recommend")
    p38.recommend = objs34(rec).mapNotNull { r -> r.s37("text")?.let { AiRec38(r.s37("key") ?: it, it, r.s37("env") ?: r.s37("cmd")) } }
}

/** PASSER ≤ ¾ av GPU-budsjettet (8 av 10,7 GB), TRANGT ≤ budsjettet − 0,2 (10,5), ellers FOR STOR. null = uten maskininfo. */
fun AppViewModel.fit38(gb: Double): String? {
    val b = p38.hw?.gpuBudgetGb ?: return null
    return when { gb <= b * .75 -> "PASSER"; gb <= b - .2 -> "TRANGT"; else -> "FOR STOR" }
}

fun AppViewModel.loadFinRouting38() = launch38 {
    p38.finRt = try {
        val o = JSONObject(api38 { hlGet("/ai/routing?scope=finans", timeout = 8_000) })
        p38.finEmpty = o.b37("empty") == true
        val rows = objs34(o.optJSONArray("rows") ?: o.optJSONArray("tasks") ?: o.optJSONArray("items")).ifEmpty {
            o.optJSONObject("tasks")?.let { t -> t.keys().asSequence().mapNotNull { k -> t.optJSONObject(k)?.put("key", k) }.toList() } ?: emptyList()
        }
        val list = rows.mapNotNull { r ->
            val k = r.s37("key") ?: r.s37("task") ?: r.s37("id") ?: return@mapNotNull null
            val def = FIN_RT38.firstOrNull { it.key == k }
            FinRt38(k, r.s37("name") ?: r.s37("label") ?: def?.name ?: k, r.s37("sub") ?: r.s37("desc") ?: def?.sub ?: "",
                r.s37("model") ?: def?.model ?: "", r.s37("fallback") ?: def?.fallback ?: "",
                objs34(r.optJSONArray("options")).mapNotNull { x -> x.s37("id")?.let { id -> FinOpt38(id, x.s37("label") ?: id, x.b37("local") ?: false) } },
                r.s37("warning"))
        }
        list.ifEmpty { null }
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
}

/** Valgene for en rad: serverens options, ellers installerte lokale + påslåtte sky-modeller. */
fun AppViewModel.finOptions38(r: FinRt38): List<FinOpt38> = r.options.ifEmpty {
    (p34.aiModels ?: emptyList()).map { FinOpt38(it.id, it.id, true) } + p34.aiCloud.filter { it.on }.map { FinOpt38(it.id, it.id, false) }
}

fun AppViewModel.setFinRoute38(key: String, model: String?, fallback: String?) {
    p38.finRt = (p38.finRt ?: FIN_RT38).map { if (it.key == key) it.copy(model = model ?: it.model, fallback = fallback ?: it.fallback, warning = null) else it }
    setRoute34(key, model, fallback)
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

/* ======================= AI-jobber: klokkeslett ======================= */

/** Tidskolonnen i Jobber: (klokkeslett, «… siden»). Kjører: «startet 17:31»; i kø: «lagt i kø 17:33»; ferdig/feilet: «17:29» + «4 min siden». */
fun jobTime41(j: AiJob34, now: Long = System.currentTimeMillis()): Pair<String, String?>? {
    j.timeLabel?.takeIf { it.isNotBlank() }?.let { return it to null }
    fun fmt(ms: Long): String {
        val z = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault())
        val d = z.toLocalDate()
        val t = "%02d:%02d".format(z.hour, z.minute)
        val today = LocalDate.now()
        return when (d) { today -> t; today.minusDays(1) -> "i går $t"; else -> "%02d.%02d %s".format(d.dayOfMonth, d.monthValue, t) }
    }
    return when (j.st) {
        "run" -> epoch41(j.startedAt ?: j.createdAt)?.let { "startet " + fmt(it) to null }
        "queue" -> epoch41(j.createdAt)?.let { "lagt i kø " + fmt(it) to null } ?: j.whenT?.let { it to null }
        else -> epoch41(j.endedAt ?: j.startedAt ?: j.createdAt)?.let { ms ->
            val m = ((now - ms) / 60_000L).coerceAtLeast(0)
            fmt(ms) to when { m < 1 -> "nå nettopp"; m < 60 -> "$m min siden"; m < 24 * 60 -> "${m / 60} t siden"; else -> null }
        }
    }
}

/** Tidsgrenser per motor i sekunder, nye forsøk (0–3) og hva som skjer ved tidsavbrudd (next | ocr | queue). */
data class AiTimeouts23(val gemini: Int = 20, val groq: Int = 15, val roboflow: Int = 15, val ollama: Int = 45, val retries: Int = 0, val onTimeout: String = "next") {
    fun toJson(): JSONObject = JSONObject().put("gemini", gemini).put("groq", groq).put("roboflow", roboflow).put("ollama", ollama).put("retries", retries).put("onTimeout", onTimeout)
}

/** Trinnene når man trykker på en tidsgrense. */
val AI_TO_STEPS = listOf(5, 10, 15, 20, 30, 45, 60, 90, 120)

/* ---------- AI-tidsgrenser ---------- */

private fun parseAiTo(o: JSONObject?): AiTimeouts23? {
    if (o == null) return null
    val d = AiTimeouts23()
    fun sec(k: String, def: Int) = o.optIntOrNull(k)?.coerceIn(5, 120) ?: def
    return AiTimeouts23(sec("gemini", d.gemini), sec("groq", d.groq), sec("roboflow", d.roboflow), sec("ollama", d.ollama),
        (o.optIntOrNull("retries") ?: o.optIntOrNull("ret") ?: d.retries).coerceIn(0, 3), (o.optStr("onTimeout") ?: o.optStr("on_timeout") ?: d.onTimeout).takeIf { it in listOf("next", "ocr", "queue") } ?: "next")
}

/** Henter tidsgrensene fra FinansHub-innstillingene (bootstrap). Eldre server: lokalt lagret verdi, ellers standard. */
fun AppViewModel.loadAiTimeouts23() {
    val local = runCatching { parseAiTo(JSONObject(prefs.str("papir_ai_to", "{}"))) }.getOrNull()
    if (m23.aiTo == null) m23.aiTo = local ?: AiTimeouts23()
    launch23 {
        // GET /settings gir .aiTimeouts direkte; eldre server: bootstrap → settings.aiTimeouts.
        val st = runCatching { JSONObject(api23 { get("/settings") }).takeIf { it.has("aiTimeouts") } }.getOrNull()
            ?: runCatching { JSONObject(api23 { get("/bootstrap") }).optJSONObject("settings") }.getOrNull() ?: return@launch23
        (parseAiTo(st.optJSONObject("aiTimeouts")) ?: parseAiTo(st.optJSONObject("ai_timeouts")))?.let { m23.aiTo = it; prefs.set("papir_ai_to", it.toJson().toString()) }
    }
}

fun AppViewModel.saveAiTimeouts23(t: AiTimeouts23) {
    m23.aiTo = t
    Haptics.select()
    prefs.set("papir_ai_to", t.toJson().toString())
    launch23 { runCatching { api23 { put("/settings", JSONObject().put("aiTimeouts", t.toJson())) } } }
}
