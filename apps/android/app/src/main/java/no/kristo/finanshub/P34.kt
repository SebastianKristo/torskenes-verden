package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

/*
 * Prompt 34 (ANDROID34), filer med «34»:
 *  - Glimt-brief (claude-code-glimt-brief.md, Glimt Brief.dc.html): GET /api/brief?kind=morning|day|evening
 *    → {title, summary, weather{now,hi,lo,cond,rain12h[],vsYesterday,sunset}, events[], news[], generatedAt}. Uten endepunkt (404) eller
 *    uten nett lages briefen lokalt fra været, kalenderen og nyhetene i appen (samme mal som prototypen). Hjem-kortet h12, brief-siden
 *    med Glimt-figuren og guide-runden (ui/Brief34.kt), og widgetene (widget/Brief34Widgets.kt).
 *  - AI-kontroll (claude-code-ai-kontroll.md, AI Kontroll.dc.html variant mobile): /api/ai/status, /models (+ pull SSE, load/unload, slett),
 *    /library, /routing (GET/PUT), /jobs (+ cancel/retry, queue/pause), /usage?days=, /keys (PUT, test), /tokens, /selftest (SSE).
 *    Alle svar leses romslig (flere feltnavn). Bare admin endrer nøkler og serveroppsett; alle ser status (ui/AiCtl34.kt).
 *  - Kvitteringer som analyseres av AI: /finans/api/receipts/jobs (pending/processing) med step/steps/partial/model/chatId når serveren
 *    sender dem, ellers regnes steget ut fra fremdriften. «Følg i Chat ›» og «Avbryt» (POST …/receipts/:id/cancel, ellers /api/ai/jobs/:id/cancel).
 *  - Chat: systemmappen «Kvitteringer og skanninger» (sys/kind/f fra serveren) øverst under MAPPER, lukket som standard, med antall og
 *    «· N til godkjenning» (claude-code-chat-skanninger-mappe.md).
 *  - Innstillinger: AI-søket tar deg til riktig side og markerer kontrollen (rød ring som pulserer, boble for «Oppdater nå»), mål-id-er
 *    som i Innstillinger Web.dc.html (IDX). Serverens {anchor} brukes når den finnes (claude-code-innst-ai-sok-highlight.md).
 *  - Tydelige AI-feil: «Glimt fikk ikke svar fra {modell}: {feil}» med Prøv igjen / Åpne AI-kontroll i stedet for evig «tenker».
 *  - Haptikk på tilbake (Haptics.back, debounce 120 ms) og innhold under fanelinjen (ui/Paper.kt).
 */

/* ---------------- JSON-hjelpere ---------------- */

internal fun s34(o: JSONObject?, vararg k: String): String? {
    if (o == null) return null
    for (key in k) {
        if (!o.has(key) || o.isNull(key)) continue
        val v = o.opt(key)
        if (v is JSONObject || v is JSONArray) continue
        val t = v.toString()
        if (t.isNotBlank() && t != "null") return t
    }
    return null
}

internal fun n34(o: JSONObject?, vararg k: String): Double? {
    if (o == null) return null
    for (key in k) {
        if (!o.has(key) || o.isNull(key)) continue
        when (val v = o.opt(key)) {
            is Number -> return v.toDouble()
            is String -> v.replace(',', '.').replace(Regex("[^0-9.+-]"), "").toDoubleOrNull()?.let { return it }
        }
    }
    return null
}

internal fun b34(o: JSONObject?, vararg k: String): Boolean? {
    if (o == null) return null
    for (key in k) {
        if (!o.has(key) || o.isNull(key)) continue
        when (val v = o.opt(key)) {
            is Boolean -> return v
            is Number -> return v.toInt() != 0
            is String -> return v == "true" || v == "1" || v == "on"
        }
    }
    return null
}

internal fun objs34(a: JSONArray?): List<JSONObject> = (0 until (a?.length() ?: 0)).mapNotNull { a!!.optJSONObject(it) }

internal fun arr34(o: JSONObject?, vararg k: String): JSONArray? {
    if (o == null) return null
    for (key in k) o.optJSONArray(key)?.let { return it }
    return null
}

/** Et svar som er enten {key:[…]} eller […]. */
internal fun list34(raw: String, vararg k: String): List<JSONObject> {
    val t = raw.trim()
    if (t.startsWith("[")) return objs34(JSONArray(t))
    val o = JSONObject(t)
    return objs34(arr34(o, *k))
}

internal fun enc34(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

private val OSLO34: ZoneId = ZoneId.of("Europe/Oslo")

internal fun hexColor34(s: String?): Long? {
    val h = s?.trim()?.removePrefix("#") ?: return null
    return when (h.length) {
        6 -> h.toLongOrNull(16)?.let { 0xFF000000 or it }
        8 -> h.toLongOrNull(16)
        else -> null
    }
}

/* ---------------- Glimt-brief ---------------- */

data class BriefWx34(
    val now: Int?, val hi: Int?, val lo: Int?, val cond: String, val code: Int?, val rain: List<Double>, val vsYesterday: String?, val sunset: String?, val place: String,
    val rainSoon: String,
)
data class BriefEv34(val id: String?, val title: String, val date: LocalDate, val start: String?, val loc: String?, val color: Long?, val startMin: Int?)
data class BriefNews34(val src: String, val title: String, val url: String?, val time: String?, val image: String? = null, val lead: String? = null) // prompt 35: bilde og ingress
data class Brief34(
    val kind: String, val title: String, val summary: String, val wx: BriefWx34?, val events: List<BriefEv34>, val news: List<BriefNews34>,
    val generatedAt: String?, val local: Boolean, val mood: String? = null, val note: String? = null,
    /** Prompt 35: prøver som slutter innen 7 dager, guide-runden fra serveren og verten (figur-id). */
    val trials: List<BriefTrial35> = emptyList(), val guide: List<Guide35> = emptyList(), val host: String? = null,
) {
    val next: BriefEv34? get() = events.firstOrNull()
    /** «8° lettskyet · Tannlege 15:15 · 3 nyheter». */
    val chips: List<String> get() = listOfNotNull(
        wx?.let { w -> (w.now?.let { "$it° " } ?: "") + w.cond },
        next?.let { e -> e.title + (e.start?.let { " $it" } ?: "") } ?: "Fri",
        if (news.isNotEmpty()) "${news.size} nyheter" else null,
    )
    /** «NESTE OM 40 MIN» / «NESTE I MORGEN 06:15» / «FRI». */
    fun nextLabel(today: LocalDate = LocalDate.now(OSLO34), nowMin: Int = LocalTime.now(OSLO34).let { it.hour * 60 + it.minute }): String {
        val e = next ?: return "FRI"
        if (e.date == today && e.startMin != null) {
            val m = e.startMin - nowMin
            if (m >= 0) return "NESTE OM " + if (m < 60) "$m MIN" else "${Math.round(m / 60.0)} T"
        }
        return if (e.date == today.plusDays(1)) "NESTE I MORGEN " + (e.start ?: "") else "NESTE " + (e.start ?: "")
    }
}

fun briefKind34(h: Int = LocalTime.now(OSLO34).hour): String = if (h < 11) "morning" else if (h < 17) "day" else "evening"
fun briefTitle34(kind: String): String = when (kind) { "morning" -> "Morgenbrief"; "day" -> "Dagsbrief"; "night" -> "Nattbrief"; else -> "Kveldsbrief" }

/** WMO-kode → sol | delvis | regn | sno | sky (som wk() i prototypen). */
fun wxKind34(c: Int?): String = when {
    c == null -> "delvis"
    c <= 1 -> "sol"
    c == 2 -> "delvis"
    c in 51..67 || c in 80..82 -> "regn"
    c in 71..77 || c == 85 || c == 86 -> "sno"
    else -> "sky"
}
private fun wxText34(k: String) = when (k) { "sol" -> "klart"; "delvis" -> "lettskyet"; "regn" -> "regn"; "sno" -> "snø"; else -> "skyet" }

private fun pad34(n: Int) = n.toString().padStart(2, '0')
private fun hm34(m: Int) = pad34((m / 60) % 24) + ":" + pad34(m % 60)
private fun cap34(s: String) = s.replaceFirstChar { it.uppercase() }

/** «15:15» fra «15:15», «2026-10-21T15:15:00+02:00» eller minutter. */
private fun timeOf34(v: Any?): Pair<String?, Int?> {
    when (v) {
        null -> return null to null
        is Number -> { val m = v.toInt(); return hm34(m) to m }
        else -> {
            val t = v.toString().trim()
            Regex("(\\d{1,2})[:.](\\d{2})").find(if (t.contains('T')) t.substringAfter('T') else t)?.let { m ->
                val h = m.groupValues[1].toInt(); val mi = m.groupValues[2].toInt()
                return pad34(h) + ":" + pad34(mi) to h * 60 + mi
            }
            return null to null
        }
    }
}

/** «20:31» i Oslo-tid fra ISO (UTC eller med sone) eller «20:31». */
private fun clock34(s: String): String =
    runCatching { java.time.OffsetDateTime.parse(s).atZoneSameInstant(OSLO34).toLocalTime().let { hm34(it.hour * 60 + it.minute) } }.getOrNull()
        ?: runCatching { java.time.Instant.parse(s).atZone(OSLO34).toLocalTime().let { hm34(it.hour * 60 + it.minute) } }.getOrNull()
        ?: timeOf34(s).first ?: s

private fun dateOf34(o: JSONObject): LocalDate {
    val raw = s34(o, "date", "d", "day") ?: s34(o, "start", "startAt", "s")?.takeIf { it.length >= 10 && it[4] == '-' }
    raw?.let { r -> runCatching { return LocalDate.parse(r.take(10)) } }
    return when (s34(o, "when", "rel")) { "i morgen", "tomorrow" -> LocalDate.now(OSLO34).plusDays(1); else -> LocalDate.now(OSLO34) }
}

private fun parseBriefWx34(w: JSONObject?): BriefWx34? {
    if (w == null) return null
    val nowO = w.optJSONObject("now")
    val now = (n34(w, "now", "temp", "t") ?: n34(nowO, "temp", "t", "temperature"))?.let { Math.round(it).toInt() }
    val code = (n34(w, "code", "weatherCode", "weather_code") ?: n34(nowO, "code"))?.toInt()
    val cond = s34(w, "cond", "text", "condition", "txt") ?: s34(nowO, "cond", "text") ?: wxText34(wxKind34(code))
    val rain = (arr34(w, "rain12h", "rain", "precip", "precipitation"))?.let { a ->
        (0 until a.length()).map { i -> when (val x = a.opt(i)) { is Number -> x.toDouble(); is JSONObject -> n34(x, "mm", "v", "value", "precipitation") ?: 0.0; else -> 0.0 } }
    } ?: emptyList()
    val vs = when (val v = w.opt("vsYesterday")) {
        is Number -> { val d = v.toInt(); if (d == 0) "Like varmt som i går" else "${Math.abs(d)} grader ${if (d < 0) "kaldere" else "varmere"} enn i går" }
        is String -> v.takeIf { it.isNotBlank() }
        is JSONObject -> s34(v, "text", "t") ?: n34(v, "diff", "delta")?.toInt()?.let { d -> if (d == 0) "Like varmt som i går" else "${Math.abs(d)} grader ${if (d < 0) "kaldere" else "varmere"} enn i går" }
        else -> null
    }
    val sunset = s34(w, "sunset", "solnedgang")?.let { timeOf34(it).first ?: it }
    val first = rain.indexOfFirst { it >= .2 }
    val h = LocalTime.now(OSLO34).hour
    val soon = s34(w, "rainSoon") ?: s34(w, "rainFrom")?.let { "regn fra ca. " + it.take(2) } ?: when { rain.isEmpty() -> "oppholdsvær"; first < 0 -> "oppholdsvær de neste 12 timene"; first == 0 -> "regn nå"; else -> "regn fra ca. " + pad34((h + first) % 24) }
    return BriefWx34(now, n34(w, "hi", "max", "high")?.let { Math.round(it).toInt() }, n34(w, "lo", "min", "low")?.let { Math.round(it).toInt() },
        cond, code, rain.take(12), vs, sunset, s34(w, "place", "sted", "name") ?: "Oslo", soon)
}

fun parseBrief34(raw: String, kind: String): Brief34? {
    val o0 = JSONObject(raw.trim())
    val o = o0.optJSONObject("brief") ?: o0
    val summary = s34(o, "summary", "text", "sum") ?: return null
    val k = s34(o, "kind") ?: kind
    val evs = objs34(arr34(o, "events", "calendar", "ev")).mapNotNull { e ->
        val t = s34(e, "title", "t", "summary") ?: return@mapNotNull null
        val tRaw = e.opt("time")?.takeIf { it is String && Regex("^\\d{1,2}[:.]\\d{2}$").matches(it.trim()) } ?: e.opt("start")?.let { v -> if (v is String && v.length > 16) clock34(v) else v } ?: e.opt("s") ?: e.opt("tm")
        val (tm, mi) = if (b34(e, "allDay") == true) (null to null) else timeOf34(tRaw)
        BriefEv34(s34(e, "id"), t, dateOf34(e), tm, s34(e, "location", "loc", "place", "sted"), hexColor34(s34(e, "color", "c")), mi)
    }
    val news = objs34(arr34(o, "news", "nyheter")).mapNotNull { n ->
        val t = s34(n, "title", "t") ?: return@mapNotNull null
        BriefNews34(s34(n, "source", "s", "feed") ?: "", t, s34(n, "url", "u", "link"), s34(n, "timeLabel", "time", "tm") ?: s34(n, "published")?.let { clock34(it) },
            s34(n, "image", "img", "thumb"), s34(n, "lead", "description", "d", "summary"))
    }
    return Brief34(k, s34(o, "title") ?: briefTitle34(k), summary, parseBriefWx34(o.optJSONObject("weather") ?: o.optJSONObject("wx")), evs.take(3), news.take(7),
        s34(o, "generatedAt", "madeAt", "generated")?.let { clock34(it) }, false, s34(o.optJSONObject("figure"), "mood") ?: s34(o, "mood", "state"), s34(o, "note", "warning"),
        parseTrials35(o.optJSONArray("trials")), parseGuide35(o.optJSONArray("guide")), s34(o, "host"))
}

/** Prototypens mal: «God kveld, Sebastian. Lettskyet og 8° i Oslo, regn fra ca. 20. Neste er Tannlege kl. 15:15. Ta med paraply.» */
fun briefSummary34(kind: String, name: String, wx: BriefWx34?, next: BriefEv34?, today: LocalDate): String {
    val first = name.trim().substringBefore(' ')
    val hi = when (kind) { "morning" -> "God morgen" + (if (first.isNotBlank()) ", $first" else "") + ". "; "evening" -> "God kveld" + (if (first.isNotBlank()) ", $first" else "") + ". "; else -> "" }
    val w = wx?.let { cap34(it.cond) + (it.now?.let { t -> " og $t°" } ?: "") + " i ${it.place}, ${it.rainSoon}. " } ?: ""
    val e = when {
        next == null -> "Kalenderen er fri."
        next.date != today -> "I morgen starter du med ${next.title}" + (next.start?.let { " kl. $it" } ?: "") + "."
        else -> "Neste er ${next.title}" + (next.start?.let { " kl. $it" } ?: "") + "."
    }
    val umb = if (wx != null && wx.rainSoon.startsWith("regn")) " Ta med paraply." else ""
    return hi + w + e + umb
}

/* ---------------- AI-kontroll ---------------- */

data class AiProv34(val id: String, val name: String, val state: String, val ms: Long?, val detail: String, val error: String?, val last4: String?, val set: Boolean, val url: String?, val model: String?)
data class AiModel34(val id: String, val desc: String, val gb: Double?, val quant: String?, val ctx: String?, val kind: String, val loaded: Boolean, val last: String?)
data class AiCloud34(val id: String, val provider: String, val desc: String, val on: Boolean)
data class AiPull34(val id: String, val pct: Int, val done: Double?, val total: Double?, val mbs: Double?, val status: String)
data class AiTask34(val key: String, val name: String, val sub: String, val model: String, val fallback: String, val fin: Boolean, val warning: String?)
data class AiJob34(val id: String, val title: String, val model: String, val st: String, val pct: Int, val dur: String?, val tok: String?, val err: String?, val whenT: String?, val fin: Boolean)
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

/* ---------------- Kvitteringer under AI-analyse ---------------- */

data class RcAi34(
    val id: String, val file: String, val thumb: String?, val model: String?, val pct: Int, val step: Int, val steps: List<String>,
    val store: String?, val sum: Double?, val lines: Int?, val category: String?, val confidence: Int?, val chatId: String?, val status: String,
)

private val RC_KEYS34 = listOf("upload", "read", "fields", "lines", "category")
val RC_STEPS34 = listOf("Lastet opp", "Leser bildet", "Finner butikk, dato og sum", "Leser varelinjer", "Foreslår kategori")

internal fun parseRcAi34(o: JSONObject): RcAi34? {
    val id = s34(o, "receiptId", "id") ?: return null
    val st = s34(o, "status", "state") ?: return null
    if (st !in setOf("pending", "processing", "running", "queued", "analyzing")) return null
    val pct = (n34(o, "progress", "pct") ?: 0.0).toInt().coerceIn(0, 99)
    val p = o.optJSONObject("partial") ?: JSONObject()
    val steps = arr34(o, "steps")?.let { a -> (0 until a.length()).mapNotNull { i -> when (val x = a.opt(i)) { is JSONObject -> s34(x, "label", "t", "name"); is String -> x; else -> null } } }?.takeIf { it.isNotEmpty() } ?: RC_STEPS34
    val doneSteps = arr34(o, "steps")?.let { a -> (0 until a.length()).count { i -> (a.opt(i) as? JSONObject)?.let { s34(it, "state") == "done" } == true } }
    // step er en nøkkel (upload | read | fields | lines | category) fra /receipts/analyzing, et tall, eller regnes ut fra fremdriften.
    val keyIdx = s34(o, "step")?.let { k -> RC_KEYS34.indexOf(k).takeIf { it >= 0 } }
    val doneN = arr34(o, "steps")?.let { a -> (0 until a.length()).count { i -> (a.opt(i) as? JSONObject)?.let { b34(it, "done") == true } == true } }
    val step = (keyIdx ?: n34(o, "stepIndex")?.toInt() ?: doneSteps?.takeIf { it > 0 } ?: doneN?.takeIf { it > 0 } ?: if (st == "pending" || st == "queued") 1 else (1 + pct / 25).coerceAtMost(steps.size - 1)).coerceIn(0, steps.size)
    return RcAi34(
        id, s34(o, "file", "name", "filename") ?: "Kvittering", s34(o, "thumb"), s34(o, "model", "engine"), pct, step, steps,
        s34(p, "store", "merchant") ?: s34(o, "merchant"), n34(p, "sum", "total") ?: n34(o, "total"), n34(p, "lines", "items")?.toInt(),
        s34(p, "category", "cat"), (n34(p, "confidence", "conf"))?.let { if (it <= 1.0) (it * 100).toInt() else it.toInt() }, s34(o, "chatId", "chat_id"), st,
    )
}

/* ---------------- Innstillinger: mål-id-er (IDX) ---------------- */

/** Mål for AI-søket i Innstillinger: [nøkkelord, tittel, sti, boble] per mål-id. */
data class Anchor34(val id: String, val title: String, val path: String, val words: String, val bubble: String? = null, val admin: Boolean = false)

val ANCHORS34: List<Anchor34> = listOf(
    Anchor34("upd", "Oppdater nå", "System", "oppdater oppdatere oppdaterer update nordlys installer ny versjon", "✦ Trykk her for å oppdatere", admin = true),
    Anchor34("chk", "Se etter oppdatering", "System", "se etter oppdatering versjon sjekk ny"),
    Anchor34("pw", "Krev passord for å oppdatere", "System", "krev passord fingeravtrykk oppdater oppdatering", admin = true),
    Anchor34("theme", "Tema", "Utseende", "tema mørk lys mørkt modus farge"),
    Anchor34("bg", "Bakgrunn", "Utseende", "bakgrunn bilde forside bakgrunnsbilde"),
    Anchor34("quiet", "Stille timer", "Varsler", "stille timer natt lyd av forstyrr"),
    Anchor34("push", "Varsler", "Varsler", "push varsel varsler lyd"),
    Anchor34("haptic", "Haptikk", "App", "haptikk vibrasjon vibrer haptisk"),
    Anchor34("2fa", "Totrinnsbekreftelse", "Sikkerhet", "2fa totrinn tofaktor autentisering kode"),
    Anchor34("bk-now", "Ta backup nå", "Backup", "backup nå sikkerhetskopi ta", admin = true),
    Anchor34("bk-auto", "Automatisk backup", "Backup", "automatisk backup hver natt", admin = true),
    Anchor34("glimt", "Glimt", "Glimt", "glimt brief briefer stemme stemmer figur figurer opplesning les opp venner sky dråpe ugle gris morgenbrief kveldsbrief nattbrief tts openai elevenlabs azure"),
    Anchor34("ai-mod", "AI og modeller", "App", "ai modell modeller ollama gemini groq nøkkel tokens jobber glimt"),
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

/* ---------------- Strømming (SSE eller NDJSON) ---------------- */

/** Leser et SSE-/NDJSON-svar linje for linje. onEvent returnerer false for å stoppe. */
internal suspend fun AppViewModel.stream34(method: String, path: String, body: JSONObject?, read: Int = 120_000, accept: String = "text/event-stream, application/x-ndjson, application/json",
    onEvent: (String, JSONObject) -> Boolean): Unit =
    withContext(Dispatchers.IO) {
        val c = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 10_000
            c.readTimeout = read
            c.setRequestProperty("Accept", accept)
            account?.token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = c.responseCode
            if (code >= 400) {
                val txt = c.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                val o = runCatching { JSONObject(txt) }.getOrNull()
                throw ApiException(o?.optStr("error") ?: "Feil $code", code)
            }
            var ev = "message"
            val data = StringBuilder()
            c.inputStream.bufferedReader().use { r ->
                while (true) {
                    val line = r.readLine() ?: break
                    val t = line.trim()
                    when {
                        t.isEmpty() -> {
                            if (data.isNotEmpty()) {
                                val d = data.toString(); data.setLength(0)
                                val o = runCatching { JSONObject(d) }.getOrNull()
                                if (o != null && !onEvent(ev, o)) return@use
                            }
                            ev = "message"
                        }
                        t.startsWith(":") -> {}
                        t.startsWith("event:") -> ev = t.substring(6).trim()
                        t.startsWith("data:") -> { if (data.isNotEmpty()) data.append('\n'); data.append(t.substring(5).trim()) }
                        t.startsWith("{") -> { val o = runCatching { JSONObject(t) }.getOrNull(); if (o != null && !onEvent("message", o)) return@use }
                        t.startsWith("[") -> runCatching { JSONArray(t) }.getOrNull()?.let { a -> if (!onEvent("list", JSONObject().put("items", a))) return@use }
                    }
                }
                if (data.isNotEmpty()) runCatching { JSONObject(data.toString()) }.getOrNull()?.let { onEvent(ev, it) }
            }
        } catch (e: java.net.SocketTimeoutException) {
            throw ApiException("Serveren svarte ikke i tide.")
        } catch (e: java.net.ConnectException) {
            throw ApiException("Fikk ikke kontakt med serveren.")
        } finally { runCatching { c.disconnect() } }
    }

/** Henter JSON; er svaret en strøm (SSE), brukes første hendelse. */
internal suspend fun AppViewModel.json34(path: String, read: Int = 15_000): JSONObject? {
    var out: JSONObject? = null
    stream34("GET", path, null, read, accept = "application/json") { _, o -> out = o; false }
    return out
}

/* ---------------- Glimt-brief: henting ---------------- */

fun AppViewModel.loadBrief34(force: Boolean = false) {
    val s = p34
    val kind = briefKind35(p35.set.takeIf { p35.setLoaded }) // prompt 35: siste valgte brief (Innstillinger → Glimt)
    val acct = account?.id
    if (!force && s.briefFor == acct && s.brief?.kind == kind && System.currentTimeMillis() - s.briefAt < 10 * 60_000L) return
    if (s.briefFor != acct) { s.brief = null; s.tour = 0 }
    s.briefFor = acct
    s.briefBusy = true
    launch34 {
        try {
            loadGlimt35()
            val raw = runCatching { api34 { hlGet("/brief?kind=$kind", timeout = 8_000) } }.getOrNull()
            val b = raw?.let { runCatching { parseBrief34(it, kind) }.getOrNull() }
            s.brief = b ?: localBrief34(kind)
            // Prompt 38: pakker, familie, skole/jobb, bursdager og nordlys fra samme svar.
            p38.bx = raw?.let { runCatching { parseBx38(it) }.getOrNull() }
            s.briefAt = System.currentTimeMillis()
            // Widgetene (Glance) får samme brief.
            runCatching { no.kristo.finanshub.widget.Brief34Store.save(appCtx34, s.brief!!, acct) }
        } finally { s.briefBusy = false }
    }
}

/** Uten /api/brief: briefen bygges av været, kalenderen og nyhetene appen allerede har. */
fun AppViewModel.localBrief34(kind: String = briefKind34()): Brief34 {
    val today = LocalDate.now(OSLO34)
    val nm = LocalTime.now(OSLO34).let { it.hour * 60 + it.minute }
    val w = mobileHome?.weather
    val wx = w?.let {
        val k = wxKind34(it.code)
        BriefWx34(it.temp?.let { t -> Math.round(t).toInt() }, it.max?.let { t -> Math.round(t).toInt() }, it.min?.let { t -> Math.round(t).toInt() },
            it.text?.lowercase()?.takeIf { t -> t.isNotBlank() } ?: wxText34(k), it.code, emptyList(), null, null, it.place.ifBlank { "Oslo" },
            if (k == "regn") "regn i dag" else "oppholdsvær")
    }
    val evs = (kal26.events ?: emptyList()).filter { e ->
        (e.date == today && (e.allDay || (e.end ?: e.start)?.let { t -> t.hour * 60 + t.minute > nm } != false)) || e.date == today.plusDays(1)
    }.sortedWith(compareBy({ it.date }, { it.start ?: LocalTime.MIN })).take(3).map { e ->
        BriefEv34(e.id, e.title, e.date, e.start?.let { hm34(it.hour * 60 + it.minute) }, e.room, e.color, e.start?.let { it.hour * 60 + it.minute })
    }
    val news = homeNews.ifEmpty { news?.items ?: emptyList() }.take(7).map { n -> BriefNews34(n.feed, n.title, n.url, n.published?.let { timeOf34(it).first }, n.image, n.excerpt) }
    return Brief34(kind, briefTitle34(kind), briefSummary34(kind, displayName, wx, evs.firstOrNull(), today), wx, evs, news,
        hm34(nm), true, note = "Laget på telefonen (serveren har ikke Glimt-brief ennå)")
}

fun AppViewModel.openBrief34() {
    Haptics.tap()
    p34.briefOpen = true
    loadBrief34()
}

fun AppViewModel.closeBrief34() {
    Haptics.back()
    p34.briefOpen = false
    stopSay35()
    if (p34.tour in 1..98) p34.tour = 99
}

/** Guide-runden: «Vis meg» → Vær → Kalender → Nyheter → slutt. Lett haptikk ved hvert steg. */
fun AppViewModel.tourNext34() {
    val s = p34
    Haptics.select()
    s.tour = if (s.tour >= 5) 99 else s.tour + 1
    s.tourSeq++
}
fun AppViewModel.tourTap34() {
    val s = p34
    Haptics.tap()
    s.tour = if (s.tour in 1..98) 99 else 1
    s.tourSeq++
}
fun AppViewModel.tourAutoKey34() = "brief34_tour_" + (account?.id ?: "")
fun AppViewModel.tourAuto34(): Boolean = prefs.bool(tourAutoKey34(), true)
fun AppViewModel.setTourAuto34(on: Boolean) {
    prefs.set(tourAutoKey34(), on); Haptics.select()
    launch34 { runCatching { api34 { hlPut("/brief/settings", JSONObject().put("guide", on)) } } }
}
fun AppViewModel.tourSeen34() { if (prefs.bool(tourAutoKey34() + "_seen", false)) return; prefs.set(tourAutoKey34() + "_seen", true) }
fun AppViewModel.tourWasSeen34(): Boolean = prefs.bool(tourAutoKey34() + "_seen", false)
fun AppViewModel.briefNotifyKey34() = "brief34_notify"
fun AppViewModel.briefNotify34(): Boolean = prefs.bool(briefNotifyKey34(), true)
fun AppViewModel.setBriefNotify34(on: Boolean) {
    prefs.set(briefNotifyKey34(), on)
    runCatching { appCtx34.getSharedPreferences("brief34_widgets", android.content.Context.MODE_PRIVATE).edit().putBoolean("notify", on).apply() }
    Haptics.select()
    launch34 { runCatching { api34 { hlPut("/brief/settings", JSONObject().put("notify", on)) } } }
}

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
        } catch (e: CancellationException) { throw e } catch (e: Exception) { err = e.message ?: "Nedlastingen stoppet" }
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
        tokS, s34(o, "error", "err")?.takeIf { st == "fail" || st == "queue" }, s34(o, "when", "scheduled", "at"), b34(o, "fin", "finance") ?: (s34(o, "kind", "task") in setOf("rc", "receipt", "kat", "categorize", "fsok", "bar", "label")))
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
            else s.aiSelf = s.aiSelf?.map { if (it.ok == null) it.copy(ok = false, error = e.message ?: "Fikk ikke kontakt") else it }
        } finally { s.aiSelfBusy = false }
    }
}

/* ---------------- Kvitteringer under AI-analyse ---------------- */

fun AppViewModel.loadRcAi34() {
    val s = p34
    if (s.rcPoll?.isActive == true) return
    s.rcPoll = launchJob34 {
        var idle = 0
        while (idle < 2) {
            // SERVER34: GET /finans/api/receipts/analyzing → {count, items:[…]}; eldre server: /receipts/jobs.
            val raw = runCatching { api34 { get("/receipts/analyzing") } }.getOrNull() ?: runCatching { api34 { get("/receipts/jobs") } }.getOrNull()
            if (raw != null) {
                val l = runCatching { list34(raw, "items", "jobs") }.getOrDefault(emptyList()).mapNotNull(::parseRcAi34)
                val gone = s.rcAi.filter { o -> l.none { it.id == o.id } }
                s.rcAi = l
                if (gone.isNotEmpty()) {
                    // Ferdig: bokført eller til godkjenning. Toast og dobbel haptikk.
                    val g = gone.first()
                    flash("✦ Kvittering lest · " + (g.store ?: g.file))
                    Haptics.success(); delay(140); Haptics.success()
                    runCatching { refreshReceipts34() }
                }
                if (l.isEmpty()) idle++ else idle = 0
            } else idle++
            delay(1500)
        }
    }
}

fun AppViewModel.cancelRcAi34(r: RcAi34) {
    val s = p34
    Haptics.select()
    s.rcAi = s.rcAi.filter { it.id != r.id }
    launch34 {
        val ok = runCatching { api34 { post("/receipts/${r.id}/cancel-ai", JSONObject()) } }.isSuccess ||
            runCatching { api34 { request("POST", "/ai/jobs/" + enc34(r.id) + "/cancel", JSONObject(), prefix = Api.HOMELAB) } }.isSuccess
        flash(if (ok) "Analysen er stoppet" else "Fikk ikke stoppet analysen")
        runCatching { refreshReceipts34() }
    }
}

/** «Følg i Chat ›»: samtalen i mappen «Kvitteringer og skanninger». */
fun AppViewModel.followRcChat34(r: RcAi34) {
    Haptics.tap()
    openChat()
    val id = r.chatId
    if (id != null) openChatId27(id)
    else {
        val f = p34.scanFolder
        if (f != null) chat27.folderOpen = chat27.folderOpen + (f.id to true)
        chat27.drawer = true
    }
}

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

/* ---------------- Innstillinger: markering ---------------- */

/** Markerer et mål (rød ring som pulserer) i 6 s eller til første trykk. Lett haptikk. */
fun AppViewModel.hl34(anchor: String) {
    p34.hl = anchor
    p34.hlSeq++
    Haptics.select()
}

/** Går til siden for målet og markerer kontrollen. */
fun AppViewModel.goAnchor34(id: String): Boolean {
    when (id) {
        "upd", "chk", "pw" -> { b24.sq = ""; openNordlys31() }
        "theme", "bg" -> settingsPage = "look"
        "quiet", "push" -> settingsPage = "notify"
        "haptic" -> settingsPage = "notify"
        "2fa" -> settingsPage = "security"
        "bk-now", "bk-auto" -> settingsPage = "sysbackup"
        "ai-mod" -> { settingsPage = null; b24.sq = ""; openAiCtl34("ov"); return true }
        "glimt" -> { settingsPage = null; b24.sq = ""; b24.aiAnswer = null; b24.aiIds = null; openGlimt35(); hl34(id); return true }
        else -> return false
    }
    b24.sq = ""; b24.aiAnswer = null; b24.aiIds = null
    hl34(id)
    return true
}

/* ---------------- Tydelige AI-feil ---------------- */

/** «Glimt fikk ikke svar fra {modell}: {feil}». */
fun aiErrText34(model: String?, err: String?): String =
    "Glimt fikk ikke svar fra " + (model?.takeIf { it.isNotBlank() } ?: "modellen") + ": " + (err?.takeIf { it.isNotBlank() } ?: "tidsavbrudd")

internal fun AppViewModel.noteAiErr34(model: String?, err: String?) { p34.lastModel = model; p34.lastErr = err }

/** Søkefeltet på Hjem: prøv igjen med samme spørsmål. */
fun AppViewModel.retryHome34() {
    val q = p31.ans?.q ?: return
    Haptics.tap()
    askHome31(q)
}
